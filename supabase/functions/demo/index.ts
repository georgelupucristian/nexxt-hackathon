// demo: drives a sandbox student's Stripe test clock so a month passes in a minute, and switches
// cards to show a failed top-up and its fix. Only for profiles with is_demo = true.
import { admin, caller, cors, fail, json, logEvent, stripe, bucharestDate } from '../_shared/env.ts';
import {
  addDays,
  defaultPaymentMethodId,
  loadProfile,
  MSG,
  payOpenInvoices,
  type Profile,
  rpc,
  setDefaultCard,
  sleep,
  updateProfile,
} from '../_shared/billing.ts';

const NOT_DEMO = 'Demo mode is only available for test accounts.';
const CLOCK_BUSY = 'The test clock is still running. Try again in a few seconds.';
// Renewal invoices stay draft about an hour (clock time) before Stripe finalizes and charges them.
const AFTER_RENEWAL_MS = 65 * 60 * 1000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return fail(MSG.auth, 401);
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    // handled below
  }
  try {
    const p = await loadProfile(user.id);
    if (!p) return fail(MSG.noProfile, 404);
    if (!p.is_demo && body.action !== 'status') return fail(NOT_DEMO, 403);
    switch (body.action) {
      case 'status':
        return await status(p);
      case 'advance_month':
        return await advanceMonth(p);
      case 'fail_next':
        return await switchCard(p, 'pm_card_chargeCustomerFail');
      case 'fix':
        return await fix(p);
      case 'parent_test':
        return await parentTest(p, body);
      case 'reset':
        return await reset(p);
      case 'events':
        return await events(p);
      default:
        return fail(MSG.unknownAction);
    }
  } catch (e) {
    console.error(`[demo] ${String(body.action)} failed:`, e);
    return fail(MSG.generic, 500);
  }
});

async function status(p: Profile): Promise<Response> {
  const clock = p.stripe_test_clock_id ? await stripe.testHelpers.testClocks.retrieve(p.stripe_test_clock_id).catch(() => null) : null;
  let last4: string | null = null;
  const pmId = p.stripe_customer_id ? await defaultPaymentMethodId(p).catch(() => null) : null;
  if (pmId) last4 = (await stripe.paymentMethods.retrieve(pmId)).card?.last4 ?? null;
  return json({
    sim_date: p.sim_date,
    clock_status: clock?.status ?? null,
    subscription_status: p.subscription_status,
    payment_method_last4: last4,
  });
}

/** Moves the clock and waits until Stripe has simulated everything up to that moment. */
async function advanceClock(clockId: string, to: number, budgetMs: number): Promise<'ready' | 'busy' | 'failed'> {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
  const started = Date.now();
  for (;;) {
    await sleep(2000);
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === 'ready') return 'ready';
    if (c.status === 'internal_failure') return 'failed';
    if (Date.now() - started > budgetMs) return 'busy';
  }
}

/**
 * One month on the test clock (+65 min so the renewal invoice is finalized and charged), then wait
 * for the webhook to record that invoice, then allocate every skipped day and move sim_date.
 *
 * The jump is split at the renewal: in one month-long jump Stripe would also run every Smart Retry
 * of a failed renewal and then cancel the subscription (the account's dunning rule), leaving
 * nothing for "fix" to pay. So we stop just after the first attempt, switch automatic retries
 * off for a failed invoice (the student fixes it with one tap), then finish the month.
 * Budget: 2 × ~50 s for the clock + ~30 s for the webhook, under the 150 s Edge Function limit.
 */
async function advanceMonth(p: Profile): Promise<Response> {
  if (!p.stripe_test_clock_id || !p.stripe_customer_id) return fail(MSG.noPlan, 409);
  const clock = await stripe.testHelpers.testClocks.retrieve(p.stripe_test_clock_id);
  if (clock.status !== 'ready') return fail(CLOCK_BUSY, 409);

  const from = new Date(clock.frozen_time * 1000);
  const target = new Date(from);
  target.setUTCMonth(target.getUTCMonth() + 1);
  const targetUnix = Math.floor((target.getTime() + AFTER_RENEWAL_MS) / 1000);

  const sub = p.stripe_subscription_id ? await stripe.subscriptions.retrieve(p.stripe_subscription_id) : null;
  const renewalAt = sub && sub.status !== 'canceled' ? (sub.status === 'trialing' ? sub.trial_end : sub.current_period_end) : null;
  const firstStop = renewalAt ? renewalAt + AFTER_RENEWAL_MS / 1000 : null;
  if (firstStop && firstStop > clock.frozen_time && firstStop < targetUnix) {
    const r = await advanceClock(p.stripe_test_clock_id, firstStop, 50_000);
    if (r !== 'ready') return fail(r === 'busy' ? CLOCK_BUSY : MSG.generic, r === 'busy' ? 504 : 502);
    const open = await stripe.invoices.list({ customer: p.stripe_customer_id, status: 'open', limit: 10 });
    for (const inv of open.data) {
      if (inv.attempt_count > 0 && inv.auto_advance) await stripe.invoices.update(inv.id!, { auto_advance: false });
    }
  }
  const r = await advanceClock(p.stripe_test_clock_id, targetUnix, 50_000);
  if (r !== 'ready') return fail(r === 'busy' ? CLOCK_BUSY : MSG.generic, r === 'busy' ? 504 : 502);

  // Invoices Stripe tried to collect during the jump; wait until the webhook has recorded each one.
  // (Filter on the invoice's own `created`, which is clock time; the list API's `created` filter
  // compares against real time and misses them.)
  const invoices = await stripe.invoices.list({ customer: p.stripe_customer_id, limit: 10 });
  const tried = invoices.data
    .filter((i) => i.created > clock.frozen_time && (i.status === 'paid' || i.status === 'open') && i.amount_due > 0)
    .map((i) => i.id!);
  let renewal: 'paid' | 'failed' | 'none' | 'timeout' = tried.length ? 'timeout' : 'none';
  const waitStart = Date.now();
  while (tried.length && Date.now() - waitStart < 30_000) {
    const { data } = await admin
      .from('ledger_entries')
      .select('stripe_object_id, status')
      .eq('user_id', p.user_id)
      .eq('type', 'topup')
      .in('stripe_object_id', tried)
      .in('status', ['confirmed', 'failed']);
    if ((data?.length ?? 0) >= tried.length) {
      renewal = data!.every((r) => r.status === 'confirmed') ? 'paid' : 'failed';
      break;
    }
    await sleep(1500);
  }

  const newDate = bucharestDate(new Date(targetUnix * 1000));
  const fromDate = p.sim_date ?? bucharestDate(from);
  const allocated = Number(await rpc('allocate_range', { p_user: p.user_id, p_from: addDays(fromDate, 1), p_to: newDate }));
  await updateProfile(p.user_id, { sim_date: newDate });
  if (allocated > 0) await logEvent(p.user_id, 'allocation_done', { amount_bani: allocated, from: addDays(fromDate, 1), to: newDate });
  return json({ ok: true, sim_date: newDate, allocated_bani: allocated, renewal });
}

/** Attaches a Stripe test card and makes it the one the subscription charges. */
async function switchCard(p: Profile, testPm: string): Promise<Response> {
  if (!p.stripe_customer_id) return fail(MSG.noPlan, 409);
  const pm = await stripe.paymentMethods.attach(testPm, { customer: p.stripe_customer_id });
  await setDefaultCard(p.stripe_customer_id, p.stripe_subscription_id, pm.id);
  return json({ ok: true, last4: pm.card?.last4 ?? null });
}

/** Back to 4242 and pay what is open; the webhook turns the failed row into a confirmed one. */
async function fix(p: Profile): Promise<Response> {
  if (!p.stripe_customer_id) return fail(MSG.noPlan, 409);
  const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: p.stripe_customer_id });
  await setDefaultCard(p.stripe_customer_id, p.stripe_subscription_id, pm.id);
  const paid = await payOpenInvoices(p.stripe_customer_id, pm.id);
  return json({ ok: true, paid_invoices: paid });
}

/** An active parent link with a saved test card (1:1, 150 lei/month cap unless given). */
async function parentTest(p: Profile, body: Record<string, unknown>): Promise<Response> {
  const num = Number(body.ratio_num ?? 1);
  const den = Number(body.ratio_den ?? 1);
  const cap = Number(body.monthly_cap_bani ?? 15_000);
  const customer = await stripe.customers.create({
    name: 'Parent (test)',
    preferred_locales: ['en'],
    metadata: { role: 'parent', student_user_id: p.user_id, demo: 'true' },
  });
  const pm = await stripe.paymentMethods.attach('pm_card_visa', { customer: customer.id });
  await stripe.customers.update(customer.id, { invoice_settings: { default_payment_method: pm.id } });
  // one active parent at a time in the demo
  await admin
    .from('parent_links')
    .update({ status: 'revoked', revoked_at: new Date().toISOString() })
    .eq('student_user_id', p.user_id)
    .eq('status', 'active');
  const { data, error } = await admin
    .from('parent_links')
    .insert({
      student_user_id: p.user_id,
      parent_name: 'Parent (test)',
      ratio_num: num,
      ratio_den: den,
      monthly_cap_bani: cap,
      stripe_customer_id: customer.id,
      payment_method_id: pm.id,
      status: 'active',
    })
    .select('id, token')
    .single();
  if (error) throw error;
  await logEvent(p.user_id, 'parent_linked', { parent_link_id: data.id, parent_name: 'Parent (test)' });
  return json({ ok: true, id: data.id, token: data.token });
}

/**
 * Back to onboarding: cancel the subscription, delete the clock (Stripe deletes its customer with
 * it), wipe this student's ledger, events, goals and parent links. The connected account is kept
 * and reused by the next start.
 */
async function reset(p: Profile): Promise<Response> {
  if (p.stripe_subscription_id) await stripe.subscriptions.cancel(p.stripe_subscription_id).catch(() => {});
  if (p.stripe_test_clock_id) await stripe.testHelpers.testClocks.del(p.stripe_test_clock_id).catch(() => {});
  for (const table of ['ledger_entries', 'app_events', 'weekly_progress', 'stripe_events']) {
    const { error } = await admin.from(table).delete().eq('user_id', p.user_id);
    if (error) throw error;
  }
  const { error: linksError } = await admin.from('parent_links').delete().eq('student_user_id', p.user_id);
  if (linksError) throw linksError;
  const { error: goalsError } = await admin.from('goals').delete().eq('user_id', p.user_id);
  if (goalsError) throw goalsError;
  await updateProfile(p.user_id, {
    stripe_customer_id: null,
    stripe_subscription_id: null,
    stripe_test_clock_id: null,
    subscription_status: 'none',
    sim_date: null,
    onboarding_state: {},
  });
  return json({ ok: true });
}

async function events(p: Profile): Promise<Response> {
  const { data, error } = await admin
    .from('stripe_events')
    .select('event_id, type, object_id, status, received_at')
    .eq('user_id', p.user_id)
    .order('received_at', { ascending: false })
    .limit(25);
  if (error) throw error;
  return json({ events: data ?? [] });
}
