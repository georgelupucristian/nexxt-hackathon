// payments: the student's own money. Starting the plan (Checkout), changing the card or the saving
// schedule, pausing, extra deposits and withdrawals. Money is never written here as confirmed:
// Stripe money becomes real only when the webhook says so.
import type Stripe from 'npm:stripe@17.7.0';
import { admin, appUrl, caller, cors, fail, json, stripe } from '../_shared/env.ts';
import { MAX_DAILY_BANI, MIN_DAILY_BANI, STRIPE_MIN_CHARGE_BANI } from '../_shared/rules.ts';
import { dailyPace, type Every, PERIOD_DAYS, rescheduleFrom, scheduleError, startSchedule } from '../_shared/plan.ts';
import { dayLabel, ordinalDay } from '../_shared/dates.ts';
import {
  defaultPaymentMethodId,
  ensureConnectedAccount,
  ensureCustomer,
  ensureMonthlyProduct,
  isCardError,
  lei,
  loadProfile,
  mapSubscriptionStatus,
  MSG,
  primaryGoal,
  type Profile,
  recordMoney,
  rpc,
  simToday,
  transferDestination,
  updateProfile,
} from '../_shared/billing.ts';

const RUNNING = ['active', 'past_due', 'paused'];
const realEmail = (e: string | null) => (e && !e.endsWith('.invalid') ? e : null);
const MAX_EXTRA_BANI = 500_000;

type Body = Record<string, unknown>;
type User = { id: string; email: string | null };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const user = await caller(req);
  if (!user) return fail(MSG.auth, 401);
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine for actions without params
  }
  try {
    const p = await loadProfile(user.id);
    if (!p) return fail(MSG.noProfile, 404);
    switch (body.action) {
      case 'start':
        return await start(user, p, appUrl(req), body);
      case 'fix_card':
        return await fixCard(p, appUrl(req));
      case 'update_schedule':
        return await updateSchedule(p, body.every, body.day, body.amount_bani);
      case 'update_daily':
        return await updateDaily(p, body.daily_amount_bani);
      case 'pause':
        return await setPaused(p, true);
      case 'resume':
        return await setPaused(p, false);
      case 'extra_deposit':
        return await extraDeposit(p, body.amount_bani, body.when, body.note);
      case 'withdraw':
        return await withdraw(p, body.amount_bani);
      case 'shared_deposit':
        return await sharedDeposit(user, p, appUrl(req), body);
      case 'shared_withdraw':
        return await sharedWithdraw(p, body.amount_bani, body.shared_goal_id);
      default:
        return fail(MSG.unknownAction);
    }
  } catch (e) {
    console.error(`[payments] ${String(body.action)} failed:`, e);
    return fail(MSG.generic, 500);
  }
});

/**
 * Starting the plan on the student's own schedule: a recurring price of `amount` every week or
 * every month, the first collection on the chosen day, nothing charged before it.
 *
 * Today the chosen day: Checkout in subscription mode, the first deposit is charged now.
 * A later day: Checkout in setup mode only saves the card (no trial, so no "N days free" wording,
 * which read like a paid Kip subscription). The webhook then creates the subscription with
 * billing_cycle_anchor = 09:00 that day and proration_behavior none, which Checkout itself
 * rejects but the Subscriptions API allows, so the first charge lands on the chosen day.
 */
async function start(user: User, profile: Profile, back: string, body: Body): Promise<Response> {
  const goal = await primaryGoal(user.id);
  if (!goal) return fail(MSG.noGoal, 409);
  if (profile.stripe_subscription_id && RUNNING.includes(profile.subscription_status)) return fail(MSG.alreadyRunning, 409);
  // the schedule comes with the call (the app's plan sheet); without it, the one saved on the profile
  const every = (body.every ?? profile.plan_every) as Every;
  const day = Number(body.day ?? profile.plan_day);
  const amount = Number(body.amount_bani ?? profile.plan_amount_bani);
  const bad = scheduleError(every, day, amount);
  if (bad) return fail(bad);

  // A phone account's email is a stand-in (<digits>@phone.kip.invalid): Stripe never gets it, and
  // Checkout fails on it ("There was an error processing your request"), so Checkout asks for a
  // real one for the receipt instead. Customers made before this get the stand-in removed.
  const email = realEmail(user.email);
  const p = await ensureCustomer(profile, email);
  if (!email && profile.stripe_customer_id) await stripe.customers.update(profile.stripe_customer_id, { email: '' });
  const accountId = await ensureConnectedAccount(p, email);
  const destination = await transferDestination(accountId);
  const product = await ensureMonthlyProduct();

  // The plan starts on the test clock's day in demo mode, so anchors are in "clock time".
  let nowUnix = Math.floor(Date.now() / 1000);
  if (p.stripe_test_clock_id) {
    nowUnix = (await stripe.testHelpers.testClocks.retrieve(p.stripe_test_clock_id)).frozen_time;
  }
  const plan = startSchedule(nowUnix, every, day);
  const success_url = `${back}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
  const cancel_url = `${back}/?checkout=cancel`;
  let session: Stripe.Checkout.Session;
  if (plan.anchor) {
    // stripe-webhook (checkout.session.completed, plan_start) makes the subscription from this
    const meta = { type: 'plan_start', user_id: p.user_id, every, day: String(day), amount_bani: String(amount), anchor: String(plan.anchor), description: planDescription(every, day, amount) };
    session = await stripe.checkout.sessions.create({
      mode: 'setup',
      customer: p.stripe_customer_id!,
      client_reference_id: p.user_id,
      payment_method_types: ['card'],
      custom_text: {
        submit: {
          message: `Kip saves your card to move money into your own savings. Nothing is charged today. Your first ${lei(amount)} lei goes in on ${dayLabel(plan.first)}. Kip takes no fee.`,
        },
      },
      metadata: meta,
      setup_intent_data: { metadata: meta },
      locale: 'en',
      success_url,
      cancel_url,
    });
  } else {
    session = await stripe.checkout.sessions.create({
      custom_text: { submit: { message: 'This moves money into your own Kip savings. Kip takes no fee. You can withdraw anytime.' } },
      mode: 'subscription',
      customer: p.stripe_customer_id!,
      client_reference_id: p.user_id,
      payment_method_types: ['card'],
      line_items: [{ price_data: { currency: 'ron', product, unit_amount: amount, recurring: { interval: every } }, quantity: 1 }],
      subscription_data: {
        description: planDescription(every, day, amount),
        metadata: { user_id: p.user_id, every, day: String(day) },
        ...(destination ? { transfer_data: { destination } } : {}),
      },
      metadata: { type: 'topup_start', user_id: p.user_id },
      locale: 'en',
      success_url,
      cancel_url,
    });
  }
  // the chosen schedule, so the app shows the same day before the webhook lands
  await updateProfile(p.user_id, scheduleColumns(every, day, amount));
  return json({ url: session.url, first_collection: plan.first, charged_today: plan.anchor === null });
}

/** Setup-mode Checkout for a new card; the webhook makes it the default and retries open invoices. */
async function fixCard(p: Profile, back: string): Promise<Response> {
  if (!p.stripe_customer_id) return fail(MSG.noPlan, 409);
  const session = await stripe.checkout.sessions.create({
    mode: 'setup',
    customer: p.stripe_customer_id,
    payment_method_types: ['card'],
    metadata: { type: 'fix_card', user_id: p.user_id },
    setup_intent_data: { metadata: { type: 'fix_card', user_id: p.user_id } },
    locale: 'en',
    success_url: `${back}/?card=updated`,
    cancel_url: `${back}/?card=cancel`,
  });
  return json({ url: session.url });
}

/** The profile columns for a schedule; the nightly allocation keeps a daily pace, payday_day the month day. */
function scheduleColumns(every: Every, day: number, amount: number): Partial<Profile> {
  return { plan_every: every, plan_day: day, plan_amount_bani: amount, daily_amount_bani: dailyPace(amount, every), ...(every === 'month' ? { payday_day: day } : {}) };
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const scheduleLabel = (every: Every, day: number) => (every === 'week' ? `every ${WEEKDAYS[day]}` : `on the ${ordinalDay(day)} of every month`);
const planDescription = (every: Every, day: number, amount: number) => `Transfer to your Kip savings: ${lei(amount)} lei ${scheduleLabel(every, day)}`;

/**
 * New amount, frequency or day for the plan, from the next collection on. What was already
 * collected covers its own period, so the new schedule starts on its first day on or after that
 * period ends (_shared/plan.ts rescheduleFrom): no charge now, no proration, never twice for the
 * same stretch. Only the amount changing: the price is swapped and the billing day stays. The
 * day or the interval changing: Stripe can't move a running subscription's billing day except by
 * resetting it to now (an immediate charge) or with a trial that ends on the new day, so it gets
 * trial_end = the new first day with proration_behavior none (no credit, no charge). trialing
 * maps to 'active' in Kip (stripe_map.ts).
 */
async function updateSchedule(p: Profile, every: unknown, rawDay: unknown, rawAmount: unknown): Promise<Response> {
  const bad = scheduleError(every, rawDay, rawAmount);
  if (bad) return fail(bad);
  const e = every as Every;
  const day = Number(rawDay);
  const amount = Number(rawAmount);
  if (!p.stripe_subscription_id || !RUNNING.includes(p.subscription_status)) {
    // no plan at Stripe yet: it's only the plan the student will start with
    await updateProfile(p.user_id, scheduleColumns(e, day, amount));
    return json({ ok: true, running: false });
  }
  const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id);
  const item = sub.items.data.find((i) => i.price.recurring) ?? sub.items.data[0];
  const product = typeof item.price.product === 'string' ? item.price.product : item.price.product.id;
  const raw = sub as unknown as { current_period_end?: number; trial_end?: number | null };
  const periodEnd = sub.status === 'trialing' && raw.trial_end ? raw.trial_end : (raw.current_period_end ?? (item as unknown as { current_period_end: number }).current_period_end);
  const next = rescheduleFrom(periodEnd, (item.price.recurring?.interval ?? 'month') as Every, { every: e, day });
  const updated = await stripe.subscriptions.update(sub.id, {
    items: [{ id: item.id, price_data: { currency: 'ron', product, unit_amount: amount, recurring: { interval: e } } }],
    proration_behavior: 'none',
    description: `Transfer to your Kip savings: ${lei(amount)} lei ${scheduleLabel(e, day)}`,
    metadata: { user_id: p.user_id, every: e, day: String(day) },
    ...(next.trialEnd ? { trial_end: next.trialEnd } : {}),
  });
  await updateProfile(p.user_id, { ...scheduleColumns(e, day, amount), subscription_status: mapSubscriptionStatus(updated) });
  const u = updated as unknown as { status: string; trial_end: number | null; current_period_end?: number };
  return json({
    ok: true,
    running: true,
    next_collection: next.first,
    previous: { interval: item.price.recurring?.interval ?? null, unit_amount: item.price.unit_amount, period_end: periodEnd },
    subscription: { id: updated.id, status: u.status, interval: e, unit_amount: amount, trial_end: u.trial_end, current_period_end: u.current_period_end ?? null },
  });
}

/** The old daily-amount call: the same schedule, the amount from the daily figure. */
function updateDaily(p: Profile, raw: unknown): Promise<Response> {
  const daily = Number(raw);
  if (!Number.isInteger(daily) || daily < MIN_DAILY_BANI || daily > MAX_DAILY_BANI) {
    return Promise.resolve(fail(`The daily amount has to be between ${lei(MIN_DAILY_BANI)} and ${lei(MAX_DAILY_BANI)} lei.`));
  }
  return updateSchedule(p, p.plan_every, p.plan_day, daily * PERIOD_DAYS[p.plan_every]);
}

/** Pause = Stripe stops collecting (invoices are voided); what is already in the pot keeps moving. */
async function setPaused(p: Profile, paused: boolean): Promise<Response> {
  if (!p.stripe_subscription_id) return fail(MSG.noPlan, 409);
  const sub = await stripe.subscriptions.update(p.stripe_subscription_id, {
    pause_collection: paused ? { behavior: 'void' } : '',
  });
  await updateProfile(p.user_id, { subscription_status: mapSubscriptionStatus(sub) });
  return json({ ok: true });
}

async function extraDeposit(p: Profile, rawAmount: unknown, when: unknown, rawNote: unknown): Promise<Response> {
  const amount = Number(rawAmount);
  // optional "why" the student typed ("Skipped a Glovo"), kept on the ledger row
  const note = typeof rawNote === 'string' && rawNote.trim() ? rawNote.trim().slice(0, 140) : null;
  if (!Number.isInteger(amount) || amount < STRIPE_MIN_CHARGE_BANI || amount > MAX_EXTRA_BANI) {
    return fail(`The amount has to be between ${lei(STRIPE_MIN_CHARGE_BANI)} and ${lei(MAX_EXTRA_BANI)} lei.`);
  }
  if (!p.stripe_customer_id) return fail(MSG.noPlan, 409);

  if (when === 'next_topup') {
    if (!p.stripe_subscription_id || !RUNNING.includes(p.subscription_status)) return fail(MSG.noPlan, 409);
    // Rides on the next subscription invoice: no extra card fee, counted only once that invoice is paid.
    await stripe.invoiceItems.create({
      customer: p.stripe_customer_id,
      subscription: p.stripe_subscription_id,
      amount,
      currency: 'ron',
      description: 'Extra deposit',
      metadata: { type: 'extra_deposit', user_id: p.user_id, ...(note ? { note } : {}) },
    });
    return json({ ok: true });
  }
  if (when !== 'now') return fail('Choose when to deposit: now or with your next deposit.');

  const pm = await defaultPaymentMethodId(p);
  if (!pm) return fail(MSG.noCard, 409);
  const destination = await transferDestination(p.stripe_account_id);
  const date = simToday(p);
  try {
    const pi = await stripe.paymentIntents.create({
      amount,
      currency: 'ron',
      customer: p.stripe_customer_id,
      payment_method: pm,
      payment_method_types: ['card'],
      off_session: true,
      confirm: true,
      description: 'Transfer to your Kip savings',
      metadata: { type: 'extra_deposit', user_id: p.user_id, entry_date: date, ...(note ? { note } : {}) },
      ...(destination ? { transfer_data: { destination } } : {}),
    });
    // pending until payment_intent.succeeded arrives (it may already have: the row never goes backwards)
    await recordMoney({ user: p.user_id, type: 'extra_deposit', bucket: 'de_pus_deoparte', amount, status: 'pending', object: pi.id, date, note });
    return json({ ok: true });
  } catch (e) {
    if (isCardError(e)) {
      const piId = (e as { raw?: { payment_intent?: { id?: string } } }).raw?.payment_intent?.id;
      if (piId) await recordMoney({ user: p.user_id, type: 'extra_deposit', bucket: 'de_pus_deoparte', amount, status: 'failed', object: piId, date, note });
      return fail(MSG.cardFailed, 402);
    }
    throw e;
  }
}

/**
 * Own money only: a parent's matched money stays in the goal. In the sandbox the payout is
 * simulated as a confirmed ledger entry (see docs/decisions.md).
 */
async function withdraw(p: Profile, rawAmount: unknown): Promise<Response> {
  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount <= 0) return fail('Type the amount you want to withdraw.');
  try {
    await rpc('withdraw_own', { p_user: p.user_id, p_amount: amount, p_date: simToday(p) });
  } catch (e) {
    const m = /insufficient:(\d+)/.exec((e as Error).message);
    if (m) return fail(`You can withdraw up to ${lei(Number(m[1]))} lei. Money your parents put in stays in your goal.`, 409);
    throw e;
  }
  return json({ ok: true, simulated_payout: true });
}

/**
 * Extra money for a shared goal: a new deposit, never taken from the student's own savings. With a
 * saved card it is charged now (like extra_deposit 'now'); without one, a payment-mode Checkout.
 * Nothing is written here: the webhook records the row once Stripe confirms it (bucket 'shared',
 * with the shared_goal_id), so it never shows as pending personal money. `card_only` (the app's
 * sandbox accounts) answers { no_card: true } instead of opening Checkout.
 */
async function sharedDeposit(user: User, p: Profile, back: string, body: Body): Promise<Response> {
  const amount = Number(body.amount_bani);
  const goalId = typeof body.shared_goal_id === 'string' ? body.shared_goal_id : '';
  if (!Number.isInteger(amount) || amount < STRIPE_MIN_CHARGE_BANI || amount > MAX_EXTRA_BANI) {
    return fail(`The amount has to be between ${lei(STRIPE_MIN_CHARGE_BANI)} and ${lei(MAX_EXTRA_BANI)} lei.`);
  }
  const { data: member } = await admin
    .from('shared_goal_members')
    .select('status, shared_goals(name)')
    .eq('goal_id', goalId)
    .eq('user_id', p.user_id)
    .maybeSingle();
  if (!member || member.status !== 'active') return fail('Join the goal first.', 409);
  const name = (member.shared_goals as unknown as { name: string } | null)?.name ?? 'your shared goal';
  const date = simToday(p);
  const metadata = { type: 'shared_deposit', user_id: p.user_id, shared_goal_id: goalId, entry_date: date };
  const description = `Extra deposit for ${name}, kept in your own Kip savings`;
  const destination = await transferDestination(p.stripe_account_id);

  const pm = p.stripe_customer_id ? await defaultPaymentMethodId(p) : null;
  if (pm) {
    try {
      await stripe.paymentIntents.create({
        amount,
        currency: 'ron',
        customer: p.stripe_customer_id!,
        payment_method: pm,
        payment_method_types: ['card'],
        off_session: true,
        confirm: true,
        description,
        metadata,
        ...(destination ? { transfer_data: { destination } } : {}),
      });
      return json({ ok: true, charged: true });
    } catch (e) {
      if (isCardError(e)) return fail(MSG.cardFailed, 402);
      throw e;
    }
  }
  if (body.card_only) return json({ ok: false, no_card: true });

  const email = realEmail(user.email);
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    ...(p.stripe_customer_id ? { customer: p.stripe_customer_id } : email ? { customer_email: email } : {}),
    client_reference_id: p.user_id,
    payment_method_types: ['card'],
    line_items: [{ price_data: { currency: 'ron', product_data: { name: `Kip shared goal: ${name}` }, unit_amount: amount }, quantity: 1 }],
    payment_intent_data: { description, metadata, ...(destination ? { transfer_data: { destination } } : {}) },
    metadata: { type: 'shared_deposit', user_id: p.user_id, shared_goal_id: goalId },
    custom_text: { submit: { message: 'Extra money for the shared goal. It stays yours and only you can take it out. Your own savings are not touched.' } },
    locale: 'en',
    success_url: `${back}/obiectiv-comun/${goalId}?checkout=success`,
    cancel_url: `${back}/obiectiv-comun/${goalId}?checkout=cancel`,
  });
  return json({ url: session.url });
}

/** Only your own shared money: from one goal, or (no goal) what came back from goals you left. Simulated payout. */
async function sharedWithdraw(p: Profile, rawAmount: unknown, rawGoal: unknown): Promise<Response> {
  const amount = Number(rawAmount);
  if (!Number.isInteger(amount) || amount <= 0) return fail('Type the amount you want to withdraw.');
  const goal = typeof rawGoal === 'string' && rawGoal ? rawGoal : null;
  try {
    await rpc('shared_withdraw_own', { p_user: p.user_id, p_goal: goal, p_amount: amount, p_date: simToday(p) });
  } catch (e) {
    const m = /insufficient:(\d+)/.exec((e as Error).message);
    if (m) return fail(`You can withdraw up to ${lei(Number(m[1]))} lei: only money you put in.`, 409);
    throw e;
  }
  return json({ ok: true, simulated_payout: true });
}
