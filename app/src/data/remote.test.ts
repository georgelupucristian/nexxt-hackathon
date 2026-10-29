import { describe, expect, it } from 'vitest';
import { dailyFromPlan, daysUntilPayday, firstTopUp, nextPayday, paydayFromPlan } from '../lib/plan';
import { actionsFrom, goalFromRow, kindFromDb, kindToDb, moneyState, remoteUserData, txFromLedger, type GoalRow, type LedgerRow, type ProfileRow } from './remote';
import { goalSaved, totalSaved } from './selectors';
import { emptyData } from './storage';

let n = 0;
const row = (p: Partial<LedgerRow>): LedgerRow => ({
  id: `l${n++}`,
  goal_id: null,
  bucket: 'de_pus_deoparte',
  type: 'topup',
  amount_bani: 44_00,
  status: 'confirmed',
  is_matched: false,
  transfer_group: null,
  entry_date: '2026-10-28',
  note: null,
  created_at: `2026-10-28T10:${String(n).padStart(2, '0')}:00Z`,
  ...p,
});

const profile: ProfileRow = {
  user_id: 'u1',
  first_name: 'Ana',
  daily_amount_bani: 11_00,
  payday_day: 1,
  onboarding_state: { completed: true },
  stripe_customer_id: 'cus_1',
  stripe_subscription_id: 'sub_1',
  subscription_status: 'active',
  is_demo: false,
  sim_date: null,
  created_at: '2026-10-28T09:00:00Z',
};

const goal: GoalRow = {
  id: 'g1',
  user_id: 'u1',
  kind: 'laptop',
  is_primary: true,
  name: 'New laptop',
  target_bani: 3_000_00,
  target_date: null,
  status: 'active',
  created_at: '2026-10-28T09:00:00Z',
};

describe('remote adapter', () => {
  it('maps goal kinds both ways', () => {
    expect(kindToDb('tech')).toBe('laptop');
    expect(kindToDb('travel')).toBe('erasmus');
    expect(kindFromDb('laptop')).toBe('tech');
    expect(kindFromDb('avans')).toBe('custom');
  });

  it('shows deposits on the primary goal and hides the internal daily allocation', () => {
    const ledger = [
      row({ type: 'topup', amount_bani: 44_00 }),
      // the backend moves today's 11 lei from the pot into the goal: net zero for the user
      row({ type: 'allocation', amount_bani: -11_00, transfer_group: 'a' }),
      row({ type: 'allocation', bucket: 'goal', goal_id: 'g1', amount_bani: 11_00, transfer_group: 'a' }),
      row({ type: 'extra_deposit', amount_bani: 25_00, status: 'pending' }),
    ];
    const txs = txFromLedger(ledger, 'g1');
    expect(txs).toHaveLength(2);
    expect(goalSaved(txs, 'g1')).toBe(44_00); // pending isn't counted
    expect(txs.find((t) => t.status === 'pending')?.note).toBe('Extra deposit');
    expect(txs.every((t) => t.source === 'stripe')).toBe(true);
  });

  it('turns a withdrawal split over two buckets into one withdrawal', () => {
    const ledger = [
      row({ type: 'topup', amount_bani: 44_00 }),
      row({ type: 'withdrawal', amount_bani: -3_00, transfer_group: 'w' }),
      row({ type: 'withdrawal', bucket: 'goal', goal_id: 'g1', amount_bani: -7_00, transfer_group: 'w' }),
    ];
    const txs = txFromLedger(ledger, 'g1');
    const w = txs.filter((t) => t.type === 'withdrawal');
    expect(w).toHaveLength(1);
    expect(w[0].amount).toBe(10_00);
    expect(totalSaved(txs)).toBe(34_00);
  });

  it('counts every day money went in as a streak day, pending included, failed and withdrawals not', () => {
    const ledger = [
      row({ type: 'topup', entry_date: '2026-10-01' }),
      row({ type: 'topup', entry_date: '2026-11-01' }),
      row({ type: 'extra_deposit', entry_date: '2026-11-03' }),
      row({ type: 'extra_deposit', entry_date: '2026-11-04', status: 'pending' }),
      row({ type: 'extra_deposit', entry_date: '2026-11-05', status: 'failed' }),
      row({ type: 'withdrawal', entry_date: '2026-11-06', amount_bani: -5_00 }),
    ];
    const days = actionsFrom(ledger).map((a) => a.date).sort();
    expect(days).toEqual(['2026-10-01', '2026-11-01', '2026-11-03', '2026-11-04']);
    expect(actionsFrom(ledger).every((a) => a.kind === 'contribution')).toBe(true);
  });

  it('builds UserData with Kip meta and finished onboarding', () => {
    const d = remoteUserData(
      { profile: { ...profile, onboarding_state: { completed: true, kip: { goals: { g1: { kind: 'tech', icon: 'laptop', motivation: 'For uni', plan: { amount: 75_00, frequency: 'weekly', day: 3 } } } } } }, goals: [goal], ledger: [row({})] },
      profile.onboarding_state?.kip ?? { goals: { g1: { icon: 'laptop', motivation: 'For uni', plan: { amount: 75_00, frequency: 'weekly', day: 3 } } } },
      { prefs: emptyData().prefs, draft: emptyData().onboarding.draft },
    );
    expect(d.onboarding.completed).toBe(true);
    expect(d.tracking).toBe('stripe');
    // the plan runs, so the main goal shows Stripe's real schedule instead of the typed weekly one
    expect(d.goals[0]).toMatchObject({ id: 'g1', kind: 'tech', isPrimary: true, target: 3_000_00, icon: 'laptop', plan: { amount: profile.daily_amount_bani * 30, frequency: 'monthly', day: profile.payday_day } });
    expect(d.transactions).toHaveLength(1);
  });

  it('keeps the typed plan until Stripe runs one, and fills in a flexible goal from the daily amount', () => {
    const meta = { goals: { g1: { plan: { amount: 75_00, frequency: 'weekly' as const, day: 3 } } } };
    const idle = { ...profile, stripe_subscription_id: null, subscription_status: 'none' as const };
    expect(goalFromRow(goal, meta, idle).plan).toMatchObject({ amount: 75_00, frequency: 'weekly' });
    const flexible = { goals: { g1: { plan: { amount: 10_00, frequency: 'flexible' as const, day: null } } } };
    expect(goalFromRow({ ...goal, is_primary: false }, flexible, profile).plan).toMatchObject({ amount: profile.daily_amount_bani * 30, frequency: 'monthly' });
  });

  it('works out the money plan from the balances view', () => {
    const m = moneyState(profile, [row({ type: 'topup' })], { de_pus_deoparte_bani: 33_00, in_goals_bani: 11_00, matched_bani: 0, pending_in_bani: 25_00 });
    expect(m).toMatchObject({ running: true, withdrawable: 44_00, pendingIn: 25_00, hasTopUp: true, lastTopUpFailed: false });
    expect(moneyState({ ...profile, stripe_subscription_id: null, subscription_status: 'none' }, [], null).running).toBe(false);
  });
});

describe('plan rules (same as the backend)', () => {
  it('charges only the days until payday first', () => {
    expect(daysUntilPayday('2026-10-28', 1)).toBe(4);
    expect(firstTopUp(11_00, '2026-10-28', 1)).toEqual({ amount: 44_00, days: 4 });
    expect(firstTopUp(11_00, '2026-10-28', 28)).toEqual({ amount: 330_00, days: 30 });
    expect(nextPayday('2026-10-28', 1)).toBe('2026-11-01');
    expect(nextPayday('2026-12-15', 10)).toBe('2027-01-10');
  });
  it('turns a Kip plan into a daily amount between 5 and 50 lei', () => {
    expect(dailyFromPlan({ amount: 75_00, frequency: 'weekly', day: 3 })).toBe(11_00);
    expect(dailyFromPlan({ amount: 300_00, frequency: 'monthly', day: 5 })).toBe(10_00);
    expect(dailyFromPlan({ amount: 1_500_00, frequency: 'weekly', day: 3 })).toBe(50_00);
    expect(dailyFromPlan({ amount: 0, frequency: 'flexible', day: null })).toBe(10_00);
    expect(paydayFromPlan({ amount: 300_00, frequency: 'monthly', day: 15 })).toBe(15);
    expect(paydayFromPlan({ amount: 75_00, frequency: 'weekly', day: 3 })).toBe(1);
  });
});

describe('what you already had put aside at sign-up', () => {
  it('counts toward its goal as "What you already had", moves no money and fills no streak day', () => {
    const meta = { goals: { [goal.id]: { startingBalance: 250_00 } } };
    const d = remoteUserData({ profile, goals: [goal], ledger: [] }, meta, { prefs: emptyData().prefs, draft: emptyData().onboarding.draft });
    const start = d.transactions.find((t) => t.source === 'start');
    expect(start).toMatchObject({ type: 'contribution', amount: 250_00, goalId: goal.id, note: 'What you already had', status: 'confirmed' });
    expect(goalSaved(d.transactions, goal.id)).toBe(250_00);
    expect(d.actions).toEqual([]);
    // the money plan only knows what Stripe moved
    expect(moneyState(profile, [], null).withdrawable).toBe(0);
  });
});
