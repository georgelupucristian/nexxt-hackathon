import { addDays, daysBetween, fromKey, startOfWeek, toKey, todayKey, weekday } from '../lib/dates';
import type { Bani, Goal, Plan, Transaction, UserData } from './types';

// ---------- Money ----------
// Single source of truth: balances are always derived from confirmed transactions.
// Goals never hold their own copy of money, so a leu can only ever be counted once.

const signed = (t: Transaction): Bani => (t.type === 'contribution' ? t.amount : -t.amount);

export function confirmed(txs: Transaction[]): Transaction[] {
  return txs.filter((t) => t.status === 'confirmed');
}

export function totalSaved(txs: Transaction[]): Bani {
  return confirmed(txs).reduce((s, t) => s + signed(t), 0);
}

export function goalSaved(txs: Transaction[], goalId: string): Bani {
  return confirmed(txs)
    .filter((t) => t.goalId === goalId)
    .reduce((s, t) => s + signed(t), 0);
}

export function unallocated(txs: Transaction[]): Bani {
  return confirmed(txs)
    .filter((t) => t.goalId === null)
    .reduce((s, t) => s + signed(t), 0);
}

export interface Breakdown {
  total: Bani;
  allocated: Bani;
  unallocated: Bani;
  pendingIn: Bani;
  pendingOut: Bani;
}

export function breakdown(txs: Transaction[]): Breakdown {
  const total = totalSaved(txs);
  const free = unallocated(txs);
  const pending = txs.filter((t) => t.status === 'pending');
  return {
    total,
    allocated: total - free,
    unallocated: free,
    pendingIn: pending.filter((t) => t.type === 'contribution').reduce((s, t) => s + t.amount, 0),
    pendingOut: pending.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0),
  };
}

/** Money that can be withdrawn from a bucket (a goal, or unallocated when goalId is null). */
export function available(txs: Transaction[], goalId: string | null, excludeTxId?: string): Bani {
  const rest = excludeTxId ? txs.filter((t) => t.id !== excludeTxId) : txs;
  // Pending withdrawals already promise money away, so they reduce what is available.
  const pendingOut = rest
    .filter((t) => t.status === 'pending' && t.type === 'withdrawal' && t.goalId === goalId)
    .reduce((s, t) => s + t.amount, 0);
  const saved = goalId === null ? unallocated(rest) : goalSaved(rest, goalId);
  return Math.max(0, saved - pendingOut);
}

export function progress(saved: Bani, target: Bani): number {
  if (target <= 0) return 0;
  return Math.max(0, Math.min(1, saved / target));
}

export function sortTx(txs: Transaction[]): Transaction[] {
  return [...txs].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)));
}

// ---------- Weekly summary ----------

export interface WeekSummary {
  start: string;
  end: string;
  starting: Bani;
  contributions: Bani;
  withdrawals: Bani;
  net: Bani;
  ending: Bani;
  count: number;
}

export function weekSummary(txs: Transaction[], today = todayKey()): WeekSummary {
  const start = startOfWeek(today);
  const end = addDays(start, 6);
  const conf = confirmed(txs);
  const starting = conf.filter((t) => t.date < start).reduce((s, t) => s + signed(t), 0);
  const inWeek = conf.filter((t) => t.date >= start && t.date <= end);
  const contributions = inWeek.filter((t) => t.type === 'contribution').reduce((s, t) => s + t.amount, 0);
  const withdrawals = inWeek.filter((t) => t.type === 'withdrawal').reduce((s, t) => s + t.amount, 0);
  const net = contributions - withdrawals;
  return { start, end, starting, contributions, withdrawals, net, ending: starting + net, count: inWeek.length };
}

// ---------- Streak: the days you put money aside ----------

export type DayState = 'done' | 'today' | 'today-done' | 'missed' | 'paused' | 'future' | 'before';

/**
 * The days that count: a contribution recorded that day (confirmed or still pending). Older data
 * can hold 'check-in' actions from when a day could be ticked without money; they stay stored but
 * no longer fill a day.
 */
export function actionDays(data: Pick<UserData, 'actions'>): Set<string> {
  return new Set(data.actions.filter((a) => a.kind === 'contribution').map((a) => a.date));
}

type StreakData = Pick<UserData, 'actions' | 'pausedDays' | 'freezeDays' | 'streakHold'>;

/** Days that keep a run going without adding to it: freezes, and the old hand-frozen days. */
export function frozenDays(data: Pick<UserData, 'pausedDays' | 'freezeDays'>): Set<string> {
  return new Set([...data.pausedDays, ...(data.freezeDays ?? [])]);
}

/**
 * Current streak = consecutive days with money put aside, walking back from today.
 * Today without an action yet does not break it (the day isn't over).
 * Frozen days are skipped: they neither add to nor break the streak. A day still in danger (a
 * friend can still help, see lib/social) holds the run too.
 */
export function currentStreak(data: StreakData, today = todayKey()): number {
  const done = actionDays(data);
  const paused = frozenDays(data);
  const hold = data.streakHold ?? null;
  let n = 0;
  let day = done.has(today) ? today : addDays(today, -1);
  // 400-day guard keeps a corrupted dataset from looping forever.
  for (let i = 0; i < 400; i++) {
    if (done.has(day)) n++;
    else if (!paused.has(day) && day !== hold) break;
    day = addDays(day, -1);
  }
  return n;
}

export function bestStreak(data: StreakData, today = todayKey()): number {
  const days = [...actionDays(data)].sort();
  if (!days.length) return currentStreak(data, today);
  const paused = frozenDays(data);
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    let gapOk = true;
    for (let d = addDays(days[i - 1], 1); d < days[i]; d = addDays(d, 1)) {
      if (!paused.has(d)) {
        gapOk = false;
        break;
      }
    }
    run = gapOk ? run + 1 : 1;
    best = Math.max(best, run);
  }
  // a run held through a day in danger can be longer than its saved days
  return data.streakHold ? Math.max(best, currentStreak(data, today)) : best;
}

export function weekStates(
  data: Pick<UserData, 'actions' | 'pausedDays' | 'freezeDays'>,
  joinedKey: string,
  today = todayKey(),
): { key: string; state: DayState }[] {
  const done = actionDays(data);
  const paused = frozenDays(data);
  const start = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => {
    const key = addDays(start, i);
    let state: DayState;
    if (key === today) state = done.has(key) ? 'today-done' : paused.has(key) ? 'paused' : 'today';
    else if (key > today) state = paused.has(key) ? 'paused' : 'future';
    else if (key < joinedKey) state = 'before';
    else if (done.has(key)) state = 'done';
    else if (paused.has(key)) state = 'paused';
    else state = 'missed';
    return { key, state };
  });
}

// ---------- Plans ----------

export function periodDays(plan: Plan): number {
  return plan.frequency === 'weekly' ? 7 : 30.44;
}

/** Next date a planned contribution falls on, today included. Null for flexible plans. */
export function nextPlannedDate(plan: Plan, today = todayKey()): string | null {
  if (plan.frequency === 'flexible' || plan.day === null) return null;
  if (plan.frequency === 'weekly') {
    const delta = (plan.day - weekday(today) + 7) % 7;
    return addDays(today, delta);
  }
  const d = fromKey(today);
  const candidate = new Date(d.getFullYear(), d.getMonth(), plan.day);
  if (toKey(candidate) < today) candidate.setMonth(candidate.getMonth() + 1);
  return toKey(candidate);
}

/** True when the goal already got money today: today's planned deposit is done. */
export function paidToday(transactions: Transaction[], goalId: string, today = todayKey()): boolean {
  return transactions.some((t) => t.goalId === goalId && t.type === 'contribution' && t.date === today && t.status !== 'failed');
}

/** The next planned deposit still to come. On the plan's day, once money went in, that's the next period. */
export function nextDueDate(goal: Goal, transactions: Transaction[], today = todayKey()): string | null {
  return nextPlannedDate(goal.plan, paidToday(transactions, goal.id, today) ? addDays(today, 1) : today);
}

/**
 * Estimated finish date if the plan is followed exactly. Null when it can't be estimated.
 * `doneToday`: today's planned deposit is already in `saved`, so counting starts at the next one.
 */
export function projectedFinish(plan: Plan, saved: Bani, target: Bani, today = todayKey(), doneToday = false): string | null {
  const remaining = target - saved;
  if (remaining <= 0) return today;
  if (plan.frequency === 'flexible' || plan.amount <= 0) return null;
  const periods = Math.ceil(remaining / plan.amount);
  const first = nextPlannedDate(plan, doneToday ? addDays(today, 1) : today) ?? today;
  if (plan.frequency === 'weekly') return addDays(first, (periods - 1) * 7);
  const d = fromKey(first);
  d.setMonth(d.getMonth() + periods - 1);
  return toKey(d);
}

/** Amount per week and per month needed to hit a target by a date. */
export function requiredPace(saved: Bani, target: Bani, targetDate: string, today = todayKey()) {
  const remaining = Math.max(0, target - saved);
  const days = Math.max(1, daysBetween(today, targetDate));
  const weeks = Math.max(1, Math.ceil(days / 7));
  const months = Math.max(1, Math.ceil(days / 30.44));
  return { remaining, perWeek: Math.ceil(remaining / weeks), perMonth: Math.ceil(remaining / months), days };
}

export type PlanHealth = 'done' | 'on-track' | 'behind' | 'no-date' | 'flexible' | 'past-date';

export function planHealth(goal: Goal, saved: Bani, today = todayKey()): PlanHealth {
  if (saved >= goal.target) return 'done';
  if (goal.plan.frequency === 'flexible' || goal.plan.amount <= 0) return 'flexible';
  if (!goal.targetDate) return 'no-date';
  if (goal.targetDate < today) return 'past-date';
  const finish = projectedFinish(goal.plan, saved, goal.target, today);
  return finish && finish <= goal.targetDate ? 'on-track' : 'behind';
}

// ---------- Goals ----------

export function activeGoals(goals: Goal[]): Goal[] {
  return goals.filter((g) => g.status !== 'archived');
}

export function primaryGoal(goals: Goal[]): Goal | null {
  const live = goals.filter((g) => g.status === 'active');
  return live.find((g) => g.isPrimary) ?? live[0] ?? goals.find((g) => g.status === 'paused') ?? null;
}

// ---------- Today's action ----------

export type TodayAction =
  | { kind: 'create-goal' }
  | { kind: 'set-plan'; goal: Goal }
  | { kind: 'planned-contribution'; goal: Goal; amount: Bani }
  | { kind: 'fix-connection' }
  | { kind: 'goal-reached'; goal: Goal }
  | { kind: 'review-plan'; goal: Goal }
  | { kind: 'review-week' }
  | { kind: 'done-today' };

export function todayAction(data: UserData, today = todayKey()): TodayAction {
  const goal = primaryGoal(data.goals);
  if (!goal) return { kind: 'create-goal' };
  if (data.tracking === 'demo' && data.connection.status === 'error') return { kind: 'fix-connection' };
  const saved = goalSaved(data.transactions, goal.id);
  if (saved >= goal.target && goal.status === 'active') return { kind: 'goal-reached', goal };
  if (goal.plan.frequency !== 'flexible' && goal.plan.amount <= 0) return { kind: 'set-plan', goal };
  const doneToday = actionDays(data).has(today);
  // with real money the plan collects by itself, so there is no planned day to remind about
  if (goal.status === 'active' && data.tracking !== 'stripe' && nextPlannedDate(goal.plan, today) === today) {
    const contributedToday = data.transactions.some(
      (t) => t.goalId === goal.id && t.type === 'contribution' && t.date === today && t.status !== 'failed',
    );
    if (!contributedToday) return { kind: 'planned-contribution', goal, amount: goal.plan.amount };
  }
  if (doneToday) return { kind: 'done-today' };
  // Sunday is the natural moment to look back at the week.
  if (weekday(today) === 6) return { kind: 'review-week' };
  return { kind: 'review-plan', goal };
}
