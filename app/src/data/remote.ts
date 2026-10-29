// The adapter between the backend's tables (kept/supabase/migrations) and the app's own types
// (types.ts), so every screen keeps reading the same UserData whether the account is local or a
// Supabase one. Pure functions only: no network here, which keeps them unit-testable.
//
// How money maps:
// - topup / extra_deposit (they land in the pot's de_pus_deoparte bucket) are contributions to the
//   primary goal, because the backend moves that money into the primary goal day by day.
// - allocation rows (pot → goal, net zero) are internal and not shown.
// - parent_match is a contribution to the goal it went to.
// - withdrawal rows that share a transfer_group are one withdrawal.
// - manual_record (money kept elsewhere, never in the pot) is not shown.
// Pending and failed rows keep their status, so they never count in a balance.
import { todayKey } from '../lib/dates';
import { emptyData } from './storage';
import type { Bani, Goal, GoalColour, GoalKind, OnboardingDraft, Plan, Preferences, Reminder, SetupState, StreakAction, Transaction, UserData } from './types';

// ---------- row shapes ----------

export type SubscriptionStatus = 'none' | 'incomplete' | 'active' | 'past_due' | 'paused' | 'canceled';
const RUNNING: SubscriptionStatus[] = ['active', 'past_due', 'paused'];
type DbKind = 'avans' | 'custom' | 'laptop' | 'erasmus' | 'emergency';

export interface ProfileRow {
  user_id: string;
  first_name: string;
  daily_amount_bani: number;
  payday_day: number;
  /** the saving schedule Stripe runs (0017): week day 0-6 Mon-Sun, month day 1-28; only payments writes it */
  plan_every?: 'week' | 'month';
  plan_day?: number;
  plan_amount_bani?: number;
  onboarding_state: { completed?: boolean; kip?: KipMeta; [k: string]: unknown } | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: SubscriptionStatus;
  is_demo: boolean;
  sim_date: string | null;
  created_at: string;
}

export interface GoalRow {
  id: string;
  user_id: string;
  kind: DbKind;
  is_primary: boolean;
  name: string;
  target_bani: number;
  target_date: string | null;
  status: 'active' | 'paused' | 'archived';
  created_at: string;
}

export interface LedgerRow {
  id: string;
  goal_id: string | null;
  bucket: 'de_pus_deoparte' | 'goal' | 'outside';
  type: 'topup' | 'parent_match' | 'allocation' | 'extra_deposit' | 'withdrawal' | 'manual_record';
  amount_bani: number;
  status: 'pending' | 'confirmed' | 'failed';
  is_matched: boolean;
  transfer_group: string | null;
  entry_date: string;
  note: string | null;
  created_at: string;
}

export interface BalancesRow {
  de_pus_deoparte_bani: number;
  in_goals_bani: number;
  matched_bani: number;
  pending_in_bani: number;
}

/** Kip-only details the tables have no column for; kept in profiles.onboarding_state.kip. */
export interface KipMeta {
  goals?: Record<string, { kind?: GoalKind; motivation?: string; plan?: Plan; icon?: string; colour?: GoalColour; startingBalance?: Bani }>;
  reminder?: Reminder;
  pausedDays?: string[];
  /** days ticked by hand when that still counted; kept in old accounts, no longer read */
  checkIns?: string[];
  /** the account's phone number, E.164; the auth user itself only has a stand-in email */
  phone?: string;
  /** sign-up answers that aren't a goal: age, reasons, income, notifications, Face ID */
  setup?: Partial<SetupState>;
}

/** Per-device bits that never leave the browser. */
export interface DeviceState {
  prefs: Preferences;
  draft: OnboardingDraft;
}

// ---------- goals ----------

const TO_DB: Record<GoalKind, DbKind> = { emergency: 'emergency', tech: 'laptop', travel: 'erasmus', custom: 'custom' };
const FROM_DB: Record<DbKind, GoalKind> = { emergency: 'emergency', laptop: 'tech', erasmus: 'travel', custom: 'custom', avans: 'custom' };

export const kindToDb = (k: GoalKind): DbKind => TO_DB[k];
export const kindFromDb = (k: string): GoalKind => FROM_DB[k as DbKind] ?? 'custom';

export function goalFromRow(
  row: GoalRow,
  meta: KipMeta,
  profile: Pick<ProfileRow, 'daily_amount_bani' | 'payday_day' | 'stripe_subscription_id' | 'subscription_status' | 'plan_every' | 'plan_day' | 'plan_amount_bani'>,
): Goal {
  const m = meta.goals?.[row.id] ?? {};
  const moneyPlan = schedulePlan(profile);
  const ownPlan = m.plan && m.plan.frequency !== 'flexible' && m.plan.amount > 0 ? m.plan : null;
  const running = !!profile.stripe_subscription_id && RUNNING.includes(profile.subscription_status);
  return {
    id: row.id,
    kind: m.kind ?? kindFromDb(row.kind),
    name: row.name,
    target: Number(row.target_bani),
    targetDate: row.target_date,
    motivation: m.motivation ?? '',
    // The money plan (the schedule Stripe collects on) is what really goes in. Once Stripe runs it,
    // the main goal shows that schedule, not the one typed at sign-up; a goal without a fixed plan of
    // its own shows it too, or "when you'll get there" would be unknown.
    plan:
      profile.daily_amount_bani > 0 && ((running && row.is_primary) || !ownPlan)
        ? moneyPlan
        : (m.plan ?? { amount: 0, frequency: 'flexible', day: null }),
    status: row.status,
    createdAt: row.created_at,
    isPrimary: row.is_primary,
    ...(m.icon ? { icon: m.icon } : {}),
    ...(m.colour ? { colour: m.colour } : {}),
  };
}

/** The profile's saving schedule as a Plan; older rows without plan_* were daily × 30 on payday. */
export function schedulePlan(p: Pick<ProfileRow, 'daily_amount_bani' | 'payday_day' | 'plan_every' | 'plan_day' | 'plan_amount_bani'>): Plan {
  if (p.plan_every && p.plan_amount_bani) return { amount: p.plan_amount_bani, frequency: p.plan_every === 'week' ? 'weekly' : 'monthly', day: p.plan_day ?? 1 };
  return { amount: p.daily_amount_bani * 30, frequency: 'monthly', day: p.payday_day };
}

// ---------- ledger ----------

const DEPOSITS = new Set<LedgerRow['type']>(['topup', 'extra_deposit', 'parent_match']);

export function txFromLedger(rows: LedgerRow[], primaryId: string | null): Transaction[] {
  const out: Transaction[] = [];
  const firstTopUp = [...rows].filter((r) => r.type === 'topup').sort((a, b) => a.created_at.localeCompare(b.created_at))[0]?.id;
  const withdrawals = new Map<string, LedgerRow[]>();
  for (const r of rows) {
    if (DEPOSITS.has(r.type) && r.amount_bani > 0) {
      const note =
        r.type === 'topup'
          ? r.id === firstTopUp
            ? 'First deposit, your plan is on'
            : 'Scheduled deposit'
          : r.type === 'parent_match'
            ? "Parent's contribution"
            : r.note || 'Extra deposit';
      out.push({
        id: r.id,
        type: 'contribution',
        amount: Number(r.amount_bani),
        goalId: r.type === 'parent_match' ? r.goal_id ?? primaryId : primaryId,
        date: r.entry_date,
        note,
        status: r.status,
        source: 'stripe',
        createdAt: r.created_at,
        updatedAt: r.created_at,
      });
    } else if (r.type === 'withdrawal') {
      const k = r.transfer_group ?? r.id;
      withdrawals.set(k, [...(withdrawals.get(k) ?? []), r]);
    }
  }
  for (const group of withdrawals.values()) {
    const first = group[0];
    out.push({
      id: first.id,
      type: 'withdrawal',
      amount: Math.abs(group.reduce((s, r) => s + Number(r.amount_bani), 0)),
      goalId: primaryId,
      date: first.entry_date,
      note: 'Withdrawal',
      status: first.status,
      source: 'stripe',
      createdAt: first.created_at,
      updatedAt: first.created_at,
    });
  }
  return out;
}

/**
 * Streak days: every day money went in, confirmed or still on its way (a top-up, an extra
 * deposit, a parent's match). A failed payment doesn't count. The daily allocation only moves
 * money that is already in, so it doesn't fill a day either.
 */
/**
 * Streak days, by the same rule the server uses: a day counts only if that day's personal deposits
 * reach the daily amount (at least 1 leu). Ten times the amount is still one day; shared-goal money
 * doesn't count. Pending deposits count too, so a day lights as soon as the money is on its way.
 */
export function actionsFrom(rows: LedgerRow[], dailyBani = 0): StreakAction[] {
  const days = new Map<string, { sum: number; at: string }>();
  for (const r of rows) {
    if (!DEPOSITS.has(r.type) || !(Number(r.amount_bani) > 0) || !(r.status === 'confirmed' || r.status === 'pending')) continue;
    const extra = r as { bucket?: string; shared_goal_id?: string | null };
    if (extra.bucket === 'shared' || extra.shared_goal_id) continue;
    const d = days.get(r.entry_date) ?? { sum: 0, at: r.created_at };
    d.sum += Number(r.amount_bani);
    days.set(r.entry_date, d);
  }
  const need = Math.max(100, dailyBani);
  return [...days].filter(([, d]) => d.sum >= need).map(([date, d]) => ({ date, kind: 'contribution' as const, at: d.at }));
}

// ---------- the whole picture ----------

export interface RemoteRows {
  profile: ProfileRow;
  goals: GoalRow[];
  ledger: LedgerRow[];
}

export function metaOf(profile: ProfileRow): KipMeta {
  return profile.onboarding_state?.kip ?? {};
}

/** What the student already had put aside when the goal was made: progress, not a payment. */
export function startingBalances(goals: GoalRow[], meta: KipMeta): Transaction[] {
  return goals.flatMap((g) => {
    const amount = Number(meta.goals?.[g.id]?.startingBalance ?? 0);
    if (!(amount > 0)) return [];
    return [
      {
        id: `start_${g.id}`,
        type: 'contribution' as const,
        amount,
        goalId: g.id,
        date: g.created_at.slice(0, 10),
        note: 'What you already had',
        status: 'confirmed' as const,
        source: 'start' as const,
        createdAt: g.created_at,
        updatedAt: g.created_at,
      },
    ];
  });
}

export function remoteUserData(rows: RemoteRows, meta: KipMeta, device: DeviceState): UserData {
  const base = emptyData();
  const goals = rows.goals.map((g) => goalFromRow(g, meta, rows.profile));
  const primary = rows.goals.find((g) => g.is_primary) ?? null;
  const completed = rows.profile.onboarding_state?.completed === true || rows.goals.length > 0;
  return {
    ...base,
    onboarding: { completed, step: completed ? 4 : 0, draft: device.draft },
    goals,
    transactions: [...startingBalances(rows.goals, meta), ...txFromLedger(rows.ledger, primary?.id ?? null)],
    tracking: 'stripe',
    connection: { status: 'connected', institution: 'Stripe', lastSyncAt: new Date().toISOString(), lastError: null, simulateFailure: false },
    reminder: meta.reminder ?? base.reminder,
    actions: actionsFrom(rows.ledger, rows.profile.daily_amount_bani),
    pausedDays: meta.pausedDays ?? [],
    prefs: device.prefs,
    setup: { ...base.setup, ...meta.setup },
  };
}

// ---------- the money plan ----------

export interface MoneyState {
  status: SubscriptionStatus;
  /** a plan runs: Stripe collects every month and the saved card can be charged */
  running: boolean;
  daily: Bani;
  payday: number;
  /** the saving schedule: how much, every week or month, which day (the one day shown everywhere) */
  plan: Plan;
  /** the backend's "today" for money (a test clock's day in sandbox accounts) */
  today: string;
  pendingIn: Bani;
  /** own money in the pot; a parent's matched money stays for the goal */
  withdrawable: Bani;
  hasTopUp: boolean;
  lastTopUpFailed: boolean;
}


export function moneyState(profile: ProfileRow, ledger: LedgerRow[], balances: BalancesRow | null, today = todayKey()): MoneyState {
  const ok = ledger.filter((r) => r.status === 'confirmed' && r.bucket !== 'outside');
  const sum = (xs: LedgerRow[]) => xs.reduce((s, r) => s + Number(r.amount_bani), 0);
  // the balances view is the source; the ledger sum is the same numbers if the view is missing
  const pot = balances ? Number(balances.de_pus_deoparte_bani) + Number(balances.in_goals_bani) : sum(ok);
  const matched = balances ? Number(balances.matched_bani) : sum(ok.filter((r) => r.bucket === 'goal' && r.is_matched));
  const pendingIn = balances ? Number(balances.pending_in_bani) : sum(ledger.filter((r) => r.status === 'pending' && r.amount_bani > 0));
  const topups = ledger.filter((r) => r.type === 'topup').sort((a, b) => b.created_at.localeCompare(a.created_at));
  return {
    status: profile.subscription_status,
    running: !!profile.stripe_subscription_id && RUNNING.includes(profile.subscription_status),
    daily: profile.daily_amount_bani,
    payday: profile.payday_day,
    plan: schedulePlan(profile),
    today: profile.is_demo && profile.sim_date ? profile.sim_date : today,
    pendingIn,
    withdrawable: Math.max(0, pot - matched),
    hasTopUp: topups.some((r) => r.status === 'confirmed'),
    lastTopUpFailed: topups[0]?.status === 'failed',
  };
}

/** Adds or removes a day in a sorted list (pausedDays). */
export function toggleDay(days: string[], day: string, on?: boolean): string[] {
  const has = days.includes(day);
  const want = on ?? !has;
  if (want === has) return days;
  return want ? [...days, day].sort() : days.filter((d) => d !== day);
}
