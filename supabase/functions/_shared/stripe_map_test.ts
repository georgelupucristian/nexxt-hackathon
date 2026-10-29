// The webhook's event-to-ledger mapping, fed plain objects shaped like Stripe's (no network).
import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';
import { dateOf, mapSubscriptionStatus, paymentIntentMoney, splitPaidInvoice } from './stripe_map.ts';
import { bucharestDate } from './dates.ts';

const schema = Deno.readTextFileSync(new URL('../../migrations/0001_avansul_schema.sql', import.meta.url));
/** The values a `check (column in (...))` constraint allows, read from the table's create statement. */
const allowed = (table: string, column: string) => {
  const start = schema.indexOf(`create table public.${table} (`);
  const body = schema.slice(start, schema.indexOf('\n);', start));
  const m = new RegExp(`check \\(${column} in \\(([^)]*)\\)\\)`).exec(body);
  if (start < 0 || !m) throw new Error(`no check on ${table}.${column} in 0001_avansul_schema.sql`);
  return m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
};

// ---------- subscription status ----------

const STRIPE_STATUSES = ['active', 'trialing', 'past_due', 'unpaid', 'paused', 'incomplete', 'canceled', 'incomplete_expired'];

Deno.test('subscription status: every Stripe status maps to a value profiles allows', () => {
  const ok = allowed('profiles', 'subscription_status');
  for (const status of [...STRIPE_STATUSES, 'something_new']) {
    for (const pause_collection of [null, { behavior: 'void' }]) {
      const mapped = mapSubscriptionStatus({ status, pause_collection });
      assert(ok.includes(mapped), `${status} → ${mapped} is not allowed by the table`);
    }
  }
});

Deno.test('subscription status: the mapping Kip shows', () => {
  const expected: Record<string, string> = {
    active: 'active',
    trialing: 'active', // the days before the first payday are paid up front, so the plan runs
    past_due: 'past_due',
    unpaid: 'past_due',
    paused: 'paused',
    incomplete: 'incomplete',
    canceled: 'canceled',
    incomplete_expired: 'canceled',
    something_new: 'none',
  };
  for (const [status, kip] of Object.entries(expected)) assertEquals(mapSubscriptionStatus({ status, pause_collection: null }), kip, status);
});

Deno.test('subscription status: paused collection shows as paused, but never revives a dead plan', () => {
  const paused = { behavior: 'void' };
  assertEquals(mapSubscriptionStatus({ status: 'active', pause_collection: paused }), 'paused');
  assertEquals(mapSubscriptionStatus({ status: 'trialing', pause_collection: paused }), 'paused');
  assertEquals(mapSubscriptionStatus({ status: 'past_due', pause_collection: paused }), 'paused');
  assertEquals(mapSubscriptionStatus({ status: 'canceled', pause_collection: paused }), 'canceled');
  assertEquals(mapSubscriptionStatus({ status: 'incomplete', pause_collection: paused }), 'incomplete');
});

// ---------- invoice.paid ----------

const line = (amount: number, metadata: Record<string, string> = {}) => ({ amount, metadata });

Deno.test('invoice.paid: a plain monthly invoice is all top-up', () => {
  assertEquals(splitPaidInvoice({ amount_paid: 45_000, lines: { data: [line(45_000)] } }), { topup: 45_000, extra: 0, extraNote: null });
});

Deno.test('invoice.paid: the first invoice (days until payday + trial line at 0) is all top-up', () => {
  assertEquals(splitPaidInvoice({ amount_paid: 19_500, lines: { data: [line(19_500), line(0)] } }), { topup: 19_500, extra: 0, extraNote: null });
});

Deno.test('invoice.paid: an extra deposit riding on the invoice is split out with its note', () => {
  const inv = { amount_paid: 47_000, lines: { data: [line(45_000), line(2_000, { type: 'extra_deposit', user_id: 'u1', note: 'Skipped a Glovo' })] } };
  assertEquals(splitPaidInvoice(inv), { topup: 45_000, extra: 2_000, extraNote: 'Skipped a Glovo' });
});

Deno.test('invoice.paid: several extra deposits add up, notes are joined and capped at 140 characters', () => {
  const long = 'x'.repeat(150);
  const inv = {
    amount_paid: 48_000,
    lines: { data: [line(45_000), line(1_000, { type: 'extra_deposit', note: 'cafea' }), line(1_000, { type: 'extra_deposit' }), line(1_000, { type: 'extra_deposit', note: long })] },
  };
  const split = splitPaidInvoice(inv);
  assertEquals([split.topup, split.extra], [45_000, 3_000]);
  assertEquals(split.extraNote, `cafea · ${long}`.slice(0, 140));
  assertEquals(split.extraNote!.length, 140); // ledger_entries.note allows at most 140
});

Deno.test('invoice.paid: top-up + extra always equals what Stripe collected', () => {
  for (const extras of [[], [200], [500, 1_500], [10_000, 10_000, 10_000]]) {
    const extra = extras.reduce((a, b) => a + b, 0);
    const inv = { amount_paid: 45_000 + extra, lines: { data: [line(45_000), ...extras.map((a) => line(a, { type: 'extra_deposit' }))] } };
    const split = splitPaidInvoice(inv);
    assertEquals(split.topup + split.extra, inv.amount_paid);
    assertEquals(split.topup, 45_000);
  }
});

// ---------- payment_intent.succeeded / payment_failed ----------

Deno.test('payment intent: a parent match goes into the goal, marked matched', () => {
  const pi = { id: 'pi_1', amount: 15_000, metadata: { type: 'parent_match', user_id: 'u1', parent_link_id: 'l1', invoice: 'in_1', entry_date: '2026-11-10' } };
  assertEquals(paymentIntentMoney(pi, 'confirmed'), {
    userId: 'u1',
    type: 'parent_match',
    bucket: 'goal',
    amount: 15_000,
    status: 'confirmed',
    object: 'pi_1',
    matched: true,
    note: null,
    entryDate: '2026-11-10',
  });
});

Deno.test('payment intent: an extra deposit "now" lands in de_pus_deoparte, not matched, with its note', () => {
  const pi = { id: 'pi_2', amount: 2_000, metadata: { type: 'extra_deposit', user_id: 'u1', entry_date: '2026-11-02', note: 'no taxi' } };
  assertEquals(paymentIntentMoney(pi, 'confirmed'), {
    userId: 'u1',
    type: 'extra_deposit',
    bucket: 'de_pus_deoparte',
    amount: 2_000,
    status: 'confirmed',
    object: 'pi_2',
    matched: false,
    note: 'no taxi',
    entryDate: '2026-11-02',
  });
});

Deno.test('payment intent: a failed payment maps to a failed row (never counted in a balance)', () => {
  const pi = { id: 'pi_3', amount: 2_000, metadata: { type: 'extra_deposit', user_id: 'u1' } };
  const m = paymentIntentMoney(pi, 'failed')!;
  assertEquals([m.status, m.note, m.entryDate], ['failed', null, null]);
});

Deno.test('payment intent: anything that is not Kip money is ignored', () => {
  assertEquals(paymentIntentMoney({ id: 'pi_4', amount: 19_500, metadata: {} }, 'confirmed'), null); // the subscription's own invoice payment
  assertEquals(paymentIntentMoney({ id: 'pi_5', amount: 19_500, metadata: null }, 'confirmed'), null);
  assertEquals(paymentIntentMoney({ id: 'pi_6', amount: 500, metadata: { type: 'topup_start', user_id: 'u1' } }, 'confirmed'), null);
  assertEquals(paymentIntentMoney({ id: 'pi_7', amount: 500, metadata: { type: 'parent_match' } }, 'confirmed'), null); // no user
});

Deno.test('every ledger row the webhook writes fits the ledger table checks', () => {
  const types = allowed('ledger_entries', 'type');
  const buckets = allowed('ledger_entries', 'bucket');
  const statuses = allowed('ledger_entries', 'status');
  const rows = [
    { type: 'topup', bucket: 'de_pus_deoparte', status: 'confirmed' }, // invoice.paid
    { type: 'topup', bucket: 'de_pus_deoparte', status: 'failed' }, // invoice.payment_failed
    { type: 'extra_deposit', bucket: 'de_pus_deoparte', status: 'confirmed' }, // extra line on invoice.paid
    ...(['confirmed', 'failed'] as const).flatMap((s) => [
      paymentIntentMoney({ id: 'pi', amount: 1, metadata: { type: 'parent_match', user_id: 'u' } }, s)!,
      paymentIntentMoney({ id: 'pi', amount: 1, metadata: { type: 'extra_deposit', user_id: 'u' } }, s)!,
    ]),
  ];
  for (const r of rows) {
    assert(types.includes(r.type) && buckets.includes(r.bucket) && statuses.includes(r.status), JSON.stringify(r));
  }
});

// ---------- dates ----------

Deno.test('ledger date of a Stripe timestamp is its Bucharest day', () => {
  assertEquals(dateOf(Math.floor(Date.parse('2026-10-31T22:30:00Z') / 1000)), '2026-11-01');
  assertEquals(dateOf(Math.floor(Date.parse('2026-10-31T21:30:00Z') / 1000)), '2026-10-31');
});

Deno.test('ledger date without a timestamp is today in Bucharest', () => {
  assertEquals(dateOf(null), bucharestDate());
  assertEquals(dateOf(undefined), bucharestDate());
});
