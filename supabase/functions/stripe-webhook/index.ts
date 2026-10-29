// stripe-webhook: the only way Stripe money enters the ledger. Signed by Stripe, and run through
// _shared/webhook_gate.ts: the event is claimed in stripe_events, handled, and only then marked
// processed, so an attempt that dies halfway is retried instead of lost, and a finished event
// replayed does nothing. That means a handler may run more than once for an event, so everything
// it writes is once per event: money through record_stripe_money (one row per Stripe object),
// Kip's events through logEvent with the event id, the weekly counter through bump_week(p_event).
//
// The account's default API version (used to render events) is newer than the SDK's pinned one,
// so handlers only read version-stable fields from the event (ids, customer, metadata, amounts)
// and re-fetch invoices/subscriptions through the SDK when they need more.
import Stripe from 'npm:stripe@17.7.0';
import { admin, json, logEvent, stripe } from '../_shared/env.ts';
import { computeMatch } from '../_shared/rules.ts';
import { type Every, startSchedule } from '../_shared/plan.ts';
import { dateOf, paymentIntentMoney, splitPaidInvoice } from '../_shared/stripe_map.ts';
import { type EventLog, type Outcome, runEventOnce } from '../_shared/webhook_gate.ts';
import {
  ensureMonthlyProduct,
  loadProfile,
  mapSubscriptionStatus,
  payOpenInvoices,
  primaryGoal,
  type Profile,
  profileByCustomer,
  recordMoney,
  routeSubscriptionToAccount,
  rpc,
  setDefaultCard,
  simToday,
  transferDestination,
  updateProfile,
} from '../_shared/billing.ts';

const SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
const crypto = Stripe.createSubtleCryptoProvider();

// deno-lint-ignore no-explicit-any
type Obj = any;

const idOf = (x: unknown): string | null => (typeof x === 'string' ? x : (x as { id?: string } | null)?.id ?? null);

// stripe_events through the two functions in 0013_webhook_event_claims.sql
const eventLog: EventLog = {
  async claim(e) {
    const { data, error } = await admin.rpc('claim_stripe_event', {
      p_event_id: e.id,
      p_type: e.type,
      p_object_id: e.objectId,
      p_livemode: e.livemode,
    });
    if (error) throw new Error(`claim_stripe_event: ${error.message}`);
    const row = (data as { claimed: boolean; event_status: string; attempt: number }[] | null)?.[0];
    if (!row) return { claimed: false, status: null };
    return row.claimed ? { claimed: true, attempt: row.attempt } : { claimed: false, status: row.event_status };
  },
  finish: (eventId, attempt, status, userId, error) =>
    rpc<boolean>('finish_stripe_event', { p_event_id: eventId, p_attempt: attempt, p_status: status, p_user: userId, p_error: error }),
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: true });
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, req.headers.get('stripe-signature') ?? '', SECRET, undefined, crypto);
  } catch (e) {
    console.warn('[webhook] bad signature:', (e as Error).message);
    return json({ error: 'invalid signature' }, 400);
  }
  const obj = event.data.object as Obj;
  const ref = { id: event.id, type: event.type, objectId: obj?.id ?? null, livemode: event.livemode };
  const reply = await runEventOnce(eventLog, ref, () => handle(event, obj));
  return json(reply.body, reply.status);
});

async function handle(event: Stripe.Event, obj: Obj): Promise<Outcome> {
  switch (event.type) {
    case 'checkout.session.completed':
      return await checkoutCompleted(event, obj);
    case 'invoice.paid':
      return await invoicePaid(event, obj);
    case 'invoice.payment_failed':
      return await invoiceFailed(event, obj);
    case 'invoice.upcoming':
      return await invoiceUpcoming(event, obj);
    case 'payment_intent.succeeded':
      return await paymentIntentResult(event, obj, 'confirmed');
    case 'payment_intent.payment_failed':
      return await paymentIntentResult(event, obj, 'failed');
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      return await subscriptionChanged(obj);
    case 'test_helpers.test_clock.ready':
      return await clockReady(obj);
    default:
      return { ignored: true };
  }
}

// ---------- checkout ----------
async function checkoutCompleted(event: Stripe.Event, s: Obj): Promise<Outcome> {
  const type = s.metadata?.type;
  if (type === 'topup_start') {
    const p = await loadProfile(s.metadata.user_id);
    const subId = idOf(s.subscription);
    if (!p || !subId) return { ignored: true };
    const sub = await stripe.subscriptions.retrieve(subId);
    // Make the Checkout card the customer's default too, for extra deposits charged off-session.
    const pm = idOf(sub.default_payment_method);
    if (pm) await stripe.customers.update(idOf(s.customer)!, { invoice_settings: { default_payment_method: pm } });
    await updateProfile(p.user_id, { stripe_subscription_id: sub.id, subscription_status: mapSubscriptionStatus(sub) });
    return { userId: p.user_id };
  }

  if (type === 'plan_start') return await planStart(s);

  if (type === 'fix_card') {
    const p = await loadProfile(s.metadata.user_id);
    if (!p?.stripe_customer_id) return { ignored: true };
    const si = await stripe.setupIntents.retrieve(idOf(s.setup_intent)!);
    const pm = idOf(si.payment_method);
    if (!pm) return { userId: p.user_id, ignored: true };
    await setDefaultCard(p.stripe_customer_id, p.stripe_subscription_id, pm);
    // the retried invoice reports back through invoice.paid / invoice.payment_failed
    await payOpenInvoices(p.stripe_customer_id, pm);
    return { userId: p.user_id };
  }

  if (type === 'parent_setup') {
    const linkId = s.metadata.parent_link_id;
    const si = await stripe.setupIntents.retrieve(idOf(s.setup_intent)!);
    const pm = idOf(si.payment_method);
    const { data: link } = await admin.from('parent_links').select('*').eq('id', linkId).maybeSingle();
    if (!link || !pm) return { ignored: true };
    if (link.status === 'revoked') return { userId: link.student_user_id, ignored: true };
    await stripe.customers.update(idOf(s.customer)!, { invoice_settings: { default_payment_method: pm } });
    const { error } = await admin
      .from('parent_links')
      .update({ payment_method_id: pm, stripe_customer_id: idOf(s.customer), status: 'active' })
      .eq('id', linkId);
    if (error) throw error;
    await logEvent(link.student_user_id, 'parent_linked', { parent_link_id: link.id, parent_name: link.parent_name }, event.id);
    return { userId: link.student_user_id };
  }
  return { ignored: true };
}

/**
 * A plan whose first collection is a later day: Checkout only saved the card (setup mode), so the
 * subscription is made here, anchored at 09:00 on the chosen day with proration_behavior none.
 * Nothing is charged before the anchor; later invoices go through invoice.paid as before.
 */
async function planStart(s: Obj): Promise<Outcome> {
  const m = s.metadata;
  const p = await loadProfile(m.user_id);
  if (!p?.stripe_customer_id) return { ignored: true };
  // a retry of this event, or a plan started some other way meanwhile
  if (p.stripe_subscription_id && ['active', 'past_due', 'paused'].includes(p.subscription_status)) return { userId: p.user_id, ignored: true };
  const si = await stripe.setupIntents.retrieve(idOf(s.setup_intent)!);
  const pm = idOf(si.payment_method);
  if (!pm) return { userId: p.user_id, ignored: true };
  // the Checkout card is also the default for extra deposits charged off-session
  await stripe.customers.update(p.stripe_customer_id, { invoice_settings: { default_payment_method: pm } });

  const every = m.every as Every;
  const day = Number(m.day);
  let anchor: number | null = Number(m.anchor);
  // completed after the chosen morning passed (a slow Checkout): the next collection from now on
  let now = Math.floor(Date.now() / 1000);
  if (p.stripe_test_clock_id) now = (await stripe.testHelpers.testClocks.retrieve(p.stripe_test_clock_id)).frozen_time;
  if (!(anchor > now + 60)) anchor = startSchedule(now, every, day).anchor;

  const destination = await transferDestination(p.stripe_account_id);
  const sub = await stripe.subscriptions.create(
    {
      customer: p.stripe_customer_id,
      default_payment_method: pm,
      items: [{ price_data: { currency: 'ron', product: await ensureMonthlyProduct(), unit_amount: Number(m.amount_bani), recurring: { interval: every } }, quantity: 1 }],
      ...(anchor ? { billing_cycle_anchor: anchor, proration_behavior: 'none' as const } : {}),
      description: m.description,
      metadata: { user_id: p.user_id, every, day: String(day) },
      ...(destination ? { transfer_data: { destination } } : {}),
    },
    { idempotencyKey: `plan_start_${s.id}` },
  );
  await updateProfile(p.user_id, { stripe_subscription_id: sub.id, subscription_status: mapSubscriptionStatus(sub) });
  return { userId: p.user_id };
}

// ---------- invoices (the monthly top-up) ----------
async function invoicePaid(event: Stripe.Event, obj: Obj): Promise<Outcome> {
  const p = await profileByCustomer(idOf(obj.customer));
  if (!p) return { ignored: true };
  const inv = await stripe.invoices.retrieve(obj.id);
  if (!inv.amount_paid || inv.amount_paid <= 0) return { userId: p.user_id, ignored: true };

  // Clock time for demo customers, real time otherwise.
  const entryDate = dateOf(inv.status_transitions?.paid_at ?? inv.created);
  // Extra deposits scheduled for "next top-up" ride on this invoice as their own lines.
  const { topup, extra, extraNote } = splitPaidInvoice(inv);

  if (topup > 0) {
    await recordMoney({ user: p.user_id, type: 'topup', bucket: 'de_pus_deoparte', amount: topup, status: 'confirmed', object: inv.id!, event: event.id, date: entryDate });
  }
  if (extra > 0) {
    await recordMoney({ user: p.user_id, type: 'extra_deposit', bucket: 'de_pus_deoparte', amount: extra, status: 'confirmed', object: inv.id!, event: event.id, date: entryDate, note: extraNote });
    await rpc('bump_week', { p_user: p.user_id, p_date: entryDate, p_event: event.id });
    await logEvent(p.user_id, 'extra_deposit_confirmed', { amount_bani: extra, invoice: inv.id, date: entryDate, note: extraNote }, event.id);
  }
  await logEvent(p.user_id, 'topup_confirmed', { amount_bani: topup, invoice_total_bani: inv.amount_paid, invoice: inv.id, date: entryDate, billing_reason: inv.billing_reason }, event.id);

  // Today's daily amount moves into the goal right away (idempotent per day).
  const day = simToday(p);
  const allocated = Number(await rpc('allocate_for_user', { p_user: p.user_id, p_date: day }));
  if (allocated > 0) await logEvent(p.user_id, 'allocation_done', { amount_bani: allocated, date: day }, event.id);

  if (inv.subscription) {
    await parentMatch(p, inv.id!, inv.amount_paid, entryDate, event.id);
    await routeSubscriptionToAccount(p, idOf(inv.subscription)!).catch((e) => console.warn('[connect] route:', e.message));
  }
  return { userId: p.user_id };
}

async function invoiceFailed(event: Stripe.Event, obj: Obj): Promise<Outcome> {
  const p = await profileByCustomer(idOf(obj.customer));
  if (!p) return { ignored: true };
  const inv = await stripe.invoices.retrieve(obj.id);
  if (inv.status === 'paid') return { userId: p.user_id, ignored: true }; // late event, already paid
  const date = dateOf(inv.status_transitions?.finalized_at ?? inv.created);
  // Stripe retries a failed invoice several times; Kip hears about it once per invoice. A row this
  // same event wrote is our own earlier attempt that didn't finish: that one still tells Kip.
  const { data: before } = await admin
    .from('ledger_entries')
    .select('status, stripe_event_id')
    .eq('stripe_object_id', inv.id!)
    .eq('type', 'topup')
    .maybeSingle();
  // A failed row never counts in a balance; if the invoice is paid later the same row is confirmed.
  await recordMoney({ user: p.user_id, type: 'topup', bucket: 'de_pus_deoparte', amount: inv.amount_due, status: 'failed', object: inv.id!, event: event.id, date });
  if (before?.status === 'failed' && before.stripe_event_id !== event.id) return { userId: p.user_id };
  await logEvent(p.user_id, 'topup_failed', {
    amount_bani: inv.amount_due,
    invoice: inv.id,
    date,
    attempt_count: inv.attempt_count,
    next_attempt: inv.next_payment_attempt ? dateOf(inv.next_payment_attempt) : null,
  }, event.id);
  return { userId: p.user_id };
}

async function invoiceUpcoming(event: Stripe.Event, obj: Obj): Promise<Outcome> {
  const p = await profileByCustomer(idOf(obj.customer));
  if (!p) return { ignored: true };
  await logEvent(p.user_id, 'topup_upcoming', {
    amount_bani: obj.amount_due,
    date: dateOf(obj.next_payment_attempt ?? obj.period_end),
  }, event.id);
  return { userId: p.user_id };
}

// ---------- parent match ----------
/**
 * After the student's top-up is paid: charge the parent's saved card off-session for
 * amount × ratio, capped per month, straight into the student's account. A failure here never
 * touches the student's money; it only tells Kip.
 */
async function parentMatch(p: Profile, invoiceId: string, amount: number, entryDate: string, eventId: string) {
  const { data: link } = await admin
    .from('parent_links')
    .select('*')
    .eq('student_user_id', p.user_id)
    .eq('status', 'active')
    .not('payment_method_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!link) return;
  const goal = await primaryGoal(p.user_id);
  if (!goal) return;
  const already = Number(await rpc('matched_this_month', { p_user: p.user_id, p_month: entryDate }));
  const match = computeMatch(amount, link.ratio_num, link.ratio_den, link.monthly_cap_bani, already);
  if (match <= 0) return;

  const destination = await transferDestination(p.stripe_account_id);
  try {
    const pi = await stripe.paymentIntents.create(
      {
        amount: match,
        currency: 'ron',
        customer: link.stripe_customer_id,
        payment_method: link.payment_method_id,
        payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        description: `Kip: parent's contribution for ${p.first_name || 'student'}`,
        metadata: { type: 'parent_match', user_id: p.user_id, parent_link_id: link.id, invoice: invoiceId, entry_date: entryDate },
        ...(destination ? { transfer_data: { destination } } : {}),
      },
      { idempotencyKey: `parent_match_${invoiceId}` },
    );
    await recordMoney({ user: p.user_id, type: 'parent_match', bucket: 'goal', goal: goal.id, amount: match, status: 'pending', object: pi.id, event: eventId, date: entryDate, matched: true });
  } catch (e) {
    const piId = (e as { raw?: { payment_intent?: { id?: string } } }).raw?.payment_intent?.id;
    console.warn(`[match] parent charge for ${invoiceId} failed: ${(e as Error).message}`);
    if (piId) {
      // payment_intent.payment_failed will tell Kip; keep a failed row for the history
      await recordMoney({ user: p.user_id, type: 'parent_match', bucket: 'goal', goal: goal.id, amount: match, status: 'failed', object: piId, event: eventId, date: entryDate, matched: true });
    } else {
      await logEvent(p.user_id, 'match_failed', { amount_bani: match, parent_link_id: link.id, reason: (e as { code?: string }).code ?? 'error' }, eventId);
    }
  }
}

// ---------- one-off payments (parent match, extra deposit "now") ----------
async function paymentIntentResult(event: Stripe.Event, pi: Obj, status: 'confirmed' | 'failed'): Promise<Outcome> {
  // extra money for a shared goal: its own bucket, never personal savings or the streak
  if (pi.metadata?.type === 'shared_deposit') {
    const userId = pi.metadata.user_id;
    const goalId = pi.metadata.shared_goal_id;
    const p = userId ? await loadProfile(userId) : null;
    if (!p || !goalId) return { ignored: true };
    const date = pi.metadata.entry_date ?? simToday(p);
    await rpc('record_shared_money', { p_user: userId, p_goal: goalId, p_amount: pi.amount, p_status: status, p_object: pi.id, p_event: event.id, p_date: date });
    return { userId };
  }
  // which row this payment settles (or null: not Kip money) is decided in _shared/stripe_map.ts
  const m = paymentIntentMoney(pi, status);
  if (!m) return { ignored: true };
  const userId = m.userId;
  const p = await loadProfile(userId);
  if (!p) return { ignored: true };
  const date = m.entryDate ?? simToday(p);

  if (m.type === 'parent_match') {
    const goal = await primaryGoal(userId);
    if (!goal) return { userId, ignored: true };
    await recordMoney({ user: userId, type: m.type, bucket: m.bucket, goal: goal.id, amount: m.amount, status, object: m.object, event: event.id, date, matched: m.matched });
    if (status === 'confirmed') {
      await logEvent(userId, 'match_confirmed', { amount_bani: pi.amount, parent_link_id: pi.metadata.parent_link_id, date }, event.id);
      await rpc('check_milestones', { p_user: userId });
    } else {
      await logEvent(userId, 'match_failed', {
        amount_bani: pi.amount,
        parent_link_id: pi.metadata.parent_link_id,
        reason: pi.last_payment_error?.decline_code ?? pi.last_payment_error?.code ?? 'declined',
      }, event.id);
    }
    return { userId };
  }

  const note = m.note;
  await recordMoney({ user: userId, type: m.type, bucket: m.bucket, amount: m.amount, status, object: m.object, event: event.id, date, note });
  if (status === 'confirmed') {
    await rpc('bump_week', { p_user: userId, p_date: date, p_event: event.id });
    await logEvent(userId, 'extra_deposit_confirmed', { amount_bani: m.amount, date, note }, event.id);
  }
  return { userId };
}

// ---------- subscription status ----------
async function subscriptionChanged(obj: Obj): Promise<Outcome> {
  // By customer only: after a demo reset the old customer no longer maps to the student.
  const p = await profileByCustomer(idOf(obj.customer));
  if (!p) return { ignored: true };
  // Events can arrive out of order: read the subscription's current state instead.
  let sub: Stripe.Subscription;
  try {
    sub = await stripe.subscriptions.retrieve(obj.id);
  } catch (e) {
    if ((e as { code?: string }).code === 'resource_missing') return { userId: p.user_id, ignored: true };
    throw e;
  }
  if (p.stripe_subscription_id && p.stripe_subscription_id !== sub.id && sub.status === 'canceled') {
    return { userId: p.user_id, ignored: true }; // an older subscription ending
  }
  await updateProfile(p.user_id, { stripe_subscription_id: sub.id, subscription_status: mapSubscriptionStatus(sub) });
  return { userId: p.user_id };
}

// ---------- test clocks ----------
// demo.advance_month owns sim_date (it allocates the skipped days in the same step); this only
// links the event to the student for the /demo panel.
async function clockReady(clock: Obj): Promise<Outcome> {
  const { data } = await admin.from('profiles').select('user_id').eq('stripe_test_clock_id', clock.id).maybeSingle();
  return data ? { userId: data.user_id } : { ignored: true };
}
