// Stripe + database helpers shared by payments, demo, parent and the webhook.
// Everything here runs with the service role; callers have already checked who is asking.
import type Stripe from 'npm:stripe@17.7.0';
import { admin, bucharestDate, DEMO_MODE, stripe } from './env.ts';

// Pure helpers live in their own modules (unit tested); re-exported so callers keep importing them here.
export { addDays } from './dates.ts';
export { mapSubscriptionStatus } from './stripe_map.ts';

export interface Profile {
  user_id: string;
  first_name: string;
  daily_amount_bani: number;
  payday_day: number;
  /** the saving schedule (0017): how often, which day (week: 0 = Monday; month: 1-28), how much */
  plan_every: 'week' | 'month';
  plan_day: number;
  plan_amount_bani: number;
  onboarding_state: Record<string, unknown>;
  stripe_customer_id: string | null;
  stripe_account_id: string | null;
  stripe_subscription_id: string | null;
  stripe_test_clock_id: string | null;
  subscription_status: string;
  is_demo: boolean;
  sim_date: string | null;
}

export interface Goal {
  id: string;
  name: string;
  target_bani: number;
}

// Messages the app shows as-is.
export const MSG = {
  auth: 'You need to be signed in.',
  unknownAction: 'Unknown action.',
  generic: 'Something went wrong. Try again in a few seconds.',
  noProfile: "We couldn't find your profile. Reload the app.",
  noGoal: 'Pick your main goal first.',
  noPlan: "You don't have a plan running yet.",
  alreadyRunning: 'Your plan is already running.',
  cardFailed: "The payment didn't go through. Check your card and try again.",
  noCard: "We don't have a saved card. Add a card first.",
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function loadProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await admin.from('profiles').select('*').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function profileByCustomer(customerId: string | null | undefined): Promise<Profile | null> {
  if (!customerId) return null;
  const { data, error } = await admin.from('profiles').select('*').eq('stripe_customer_id', customerId).maybeSingle();
  if (error) throw error;
  return data as Profile | null;
}

export async function primaryGoal(userId: string): Promise<Goal | null> {
  const { data, error } = await admin
    .from('goals')
    .select('id, name, target_bani')
    .eq('user_id', userId)
    .eq('is_primary', true)
    .maybeSingle();
  if (error) throw error;
  return data as Goal | null;
}

export async function updateProfile(userId: string, patch: Partial<Profile>) {
  const { error } = await admin.from('profiles').update(patch).eq('user_id', userId);
  if (error) throw error;
}

/** "Today" for money: the test clock's day for demo accounts, the real day otherwise. */
export function simToday(p: Profile): string {
  return p.is_demo && p.sim_date ? p.sim_date : bucharestDate();
}

/** English number style, as the app writes amounts: 1,250.50, and 1,250 when whole. */
export function lei(bani: number): string {
  return new Intl.NumberFormat('en-GB', { minimumFractionDigits: bani % 100 ? 2 : 0, maximumFractionDigits: 2 }).format(bani / 100);
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

/** Writes Stripe money through record_stripe_money so retries and late events update one row. */
export function recordMoney(a: {
  user: string;
  type: 'topup' | 'parent_match' | 'extra_deposit';
  bucket: 'de_pus_deoparte' | 'goal';
  goal?: string | null;
  amount: number;
  status: 'pending' | 'confirmed' | 'failed';
  object: string;
  event?: string | null;
  date: string;
  matched?: boolean;
  note?: string | null;
}) {
  return rpc<string>('record_stripe_money', {
    p_user: a.user,
    p_type: a.type,
    p_bucket: a.bucket,
    p_goal: a.goal ?? null,
    p_amount: a.amount,
    p_status: a.status,
    p_object: a.object,
    p_event: a.event ?? null,
    p_date: a.date,
    p_matched: a.matched ?? false,
    p_note: a.note ?? null,
  });
}

// ---------- products ----------
// One fixed product for every scheduled deposit; prices are created inline per student (price_data).
export const MONTHLY_PRODUCT = 'avansul_depunere_lunara';
let productReady = false;
// Checkout and receipts show this name: it has to read as moving your own money, not buying something
const MONTHLY_NAME = 'Transfer to your Kip savings';
export async function ensureMonthlyProduct(): Promise<string> {
  if (productReady) return MONTHLY_PRODUCT;
  try {
    // looked up by its fixed id, never by name: the product was first made under the old "Avansul"
    // name, then a Romanian one; Checkout shows it, so a rename only updates this one product
    const product = await stripe.products.retrieve(MONTHLY_PRODUCT);
    if (product.name !== MONTHLY_NAME) await stripe.products.update(MONTHLY_PRODUCT, { name: MONTHLY_NAME });
  } catch (e) {
    if ((e as { code?: string }).code !== 'resource_missing') throw e;
    try {
      await stripe.products.create({ id: MONTHLY_PRODUCT, name: MONTHLY_NAME });
    } catch (e2) {
      if ((e2 as { code?: string }).code !== 'resource_already_exists') throw e2;
    }
  }
  productReady = true;
  return MONTHLY_PRODUCT;
}

// ---------- customer (+ test clock in demo mode) ----------
export async function ensureCustomer(p: Profile, email: string | null): Promise<Profile> {
  if (p.stripe_customer_id) return p;
  let clockId: string | null = null;
  let simDate: string | null = null;
  if (DEMO_MODE) {
    // One clock per student: a clock holds at most 3 customers and every advance moves all of them.
    const clock = await stripe.testHelpers.testClocks.create({
      frozen_time: Math.floor(Date.now() / 1000),
      name: `Kip ${p.first_name || p.user_id.slice(0, 8)}`.slice(0, 300),
    });
    clockId = clock.id;
    simDate = bucharestDate(new Date(clock.frozen_time * 1000));
  }
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    name: p.first_name || undefined,
    preferred_locales: ['en'],
    metadata: { user_id: p.user_id, role: 'student' },
    ...(clockId ? { test_clock: clockId } : {}),
  });
  // Only the first concurrent call wins; a second one re-reads the winner.
  const { data, error } = await admin
    .from('profiles')
    .update({ stripe_customer_id: customer.id, stripe_test_clock_id: clockId, is_demo: DEMO_MODE, sim_date: simDate })
    .eq('user_id', p.user_id)
    .is('stripe_customer_id', null)
    .select('*');
  if (error) throw error;
  if (!data?.length) {
    if (clockId) await stripe.testHelpers.testClocks.del(clockId).catch(() => {});
    else await stripe.customers.del(customer.id).catch(() => {});
    return (await loadProfile(p.user_id))!;
  }
  return data[0] as Profile;
}

// ---------- connected account = the student's pot ----------
// Connect may not be enabled on the platform yet. Then we keep going without a connected account
// (no transfer_data: the money stays on the platform balance) and new students get one once it is.
export async function ensureConnectedAccount(p: Profile, email: string | null): Promise<string | null> {
  if (p.stripe_account_id) return p.stripe_account_id;
  try {
    const account = await stripe.accounts.create({
      country: 'RO',
      email: email ?? undefined,
      business_type: 'individual',
      controller: {
        stripe_dashboard: { type: 'none' },
        requirement_collection: 'application',
        losses: { payments: 'application' },
        fees: { payer: 'application' },
      },
      capabilities: { transfers: { requested: true } },
      business_profile: { mcc: '6513', product_description: 'Student savings (Kip)' },
      // Sandbox verification values (they pass verification instantly in test mode).
      individual: {
        first_name: p.first_name || 'Student',
        last_name: 'Kip',
        email: email ?? undefined,
        phone: '+40700000000',
        dob: { day: 1, month: 1, year: 1901 },
        id_number: '000000000',
        address: { line1: 'address_full_match', city: 'București', postal_code: '010011', country: 'RO' },
      },
      tos_acceptance: { date: Math.floor(Date.now() / 1000), ip: '127.0.0.1' },
      external_account: {
        object: 'bank_account',
        country: 'RO',
        currency: 'ron',
        account_number: 'RO49AAAA1B31007593840000',
      } as unknown as string,
      metadata: { user_id: p.user_id },
    });
    await updateProfile(p.user_id, { stripe_account_id: account.id });
    return account.id;
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (/signed up for Connect/i.test(msg)) {
      console.warn(`[connect] Connect is not enabled on the platform; ${p.user_id} continues without a connected account`);
    } else {
      console.error(`[connect] account creation failed for ${p.user_id}: ${msg}`);
    }
    return null;
  }
}

/** The connected account to send money to, only if it can receive transfers right now. */
export async function transferDestination(accountId: string | null): Promise<string | null> {
  if (!accountId) return null;
  try {
    const acct = await stripe.accounts.retrieve(accountId);
    if (acct.capabilities?.transfers === 'active') return accountId;
    console.warn(`[connect] ${accountId} transfers capability is ${acct.capabilities?.transfers}; charging without transfer_data`);
  } catch (e) {
    console.error(`[connect] could not read ${accountId}: ${(e as Error).message}`);
  }
  return null;
}

/**
 * A subscription created while the student's account couldn't receive transfers yet (capability
 * still pending) has no transfer_data. Once the account is ready, route future top-ups there.
 */
export async function routeSubscriptionToAccount(p: Profile, subscriptionId: string) {
  if (!p.stripe_account_id) return;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  if (sub.transfer_data?.destination || sub.status === 'canceled') return;
  const destination = await transferDestination(p.stripe_account_id);
  if (destination) await stripe.subscriptions.update(subscriptionId, { transfer_data: { destination } });
}

// ---------- subscriptions and cards ----------
const idOf = (x: string | { id: string } | null | undefined) => (typeof x === 'string' ? x : x?.id ?? null);

/** The card Stripe will charge: the subscription's default, else the customer's invoice default. */
export async function defaultPaymentMethodId(p: Profile): Promise<string | null> {
  if (p.stripe_subscription_id) {
    const sub = await stripe.subscriptions.retrieve(p.stripe_subscription_id);
    const pm = idOf(sub.default_payment_method as string | { id: string } | null);
    if (pm) return pm;
  }
  if (!p.stripe_customer_id) return null;
  const c = await stripe.customers.retrieve(p.stripe_customer_id);
  if ((c as Stripe.DeletedCustomer).deleted) return null;
  return idOf((c as Stripe.Customer).invoice_settings?.default_payment_method as string | { id: string } | null);
}

/** Makes a (already attached) card the one used for the subscription and off-session charges. */
export async function setDefaultCard(customerId: string, subscriptionId: string | null, pmId: string) {
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pmId } });
  if (!subscriptionId) return;
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  // a canceled subscription can't change; the customer default above still covers open invoices
  if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
    await stripe.subscriptions.update(subscriptionId, { default_payment_method: pmId });
  }
}

/** Pays every open invoice of a customer with the given card. Returns how many went through. */
export async function payOpenInvoices(customerId: string, pmId: string): Promise<number> {
  const open = await stripe.invoices.list({ customer: customerId, status: 'open', limit: 10 });
  let paid = 0;
  for (const inv of open.data) {
    try {
      await stripe.invoices.pay(inv.id!, { payment_method: pmId });
      paid++;
    } catch (e) {
      console.warn(`[invoices] ${inv.id} still unpaid: ${(e as Error).message}`);
    }
  }
  return paid;
}

export const isCardError = (e: unknown) => (e as { type?: string })?.type === 'StripeCardError';
