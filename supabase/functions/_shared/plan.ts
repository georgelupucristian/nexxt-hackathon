// The saving schedule: how often money moves (every week or every month), on which day, and how
// much each time. The dates maths lives here, apart from the Stripe calls in payments/index.ts, so
// it can be tested day by day. Pure: no Stripe, no database.
import { addDays, bucharestDate } from './dates.ts';
import { MAX_DAILY_BANI, MIN_DAILY_BANI } from './rules.ts';

export type Every = 'week' | 'month';

/** Per collection, the same 5 to 50 lei a day the daily allocation always allowed. */
export const PERIOD_DAYS: Record<Every, number> = { week: 7, month: 30 };
export const minAmount = (every: Every) => MIN_DAILY_BANI * PERIOD_DAYS[every];
export const maxAmount = (every: Every) => MAX_DAILY_BANI * PERIOD_DAYS[every];

/**
 * What a valid schedule looks like. `day`: for a week 0 = Monday … 6 = Sunday (the app's
 * convention), for a month 1 to 28 so every month has it. Returns an English error or null.
 */
export function scheduleError(every: unknown, day: unknown, amount: unknown): string | null {
  if (every !== 'week' && every !== 'month') return 'Choose how often: every week or every month.';
  const d = Number(day);
  if (!Number.isInteger(d) || (every === 'week' ? d < 0 || d > 6 : d < 1 || d > 28)) {
    return every === 'week' ? 'Pick a day of the week.' : 'Pick a day of the month from 1 to 28.';
  }
  const a = Number(amount);
  if (!Number.isInteger(a) || a < minAmount(every) || a > maxAmount(every)) {
    return `Each ${every === 'week' ? 'weekly' : 'monthly'} deposit has to be between ${minAmount(every) / 100} and ${maxAmount(every) / 100} lei.`;
  }
  return null;
}

/** The daily pace the nightly allocation moves into the goal: the deposit spread over its period. */
export function dailyPace(amount: number, every: Every): number {
  return Math.min(MAX_DAILY_BANI, Math.max(MIN_DAILY_BANI, Math.ceil(amount / PERIOD_DAYS[every])));
}

/** 0 = Monday … 6 = Sunday for a YYYY-MM-DD day. */
export function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
}

/** The first day on or after `from` (YYYY-MM-DD) that the schedule collects on. */
export function nextCollection(from: string, every: Every, day: number): string {
  if (every === 'week') return addDays(from, (day - weekdayOf(from) + 7) % 7);
  const [y, m, d] = from.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + (d > day ? 1 : 0), day));
  return t.toISOString().slice(0, 10);
}

/** 09:00 in Bucharest on a YYYY-MM-DD day, as a unix timestamp (winter UTC+2, summer UTC+3). */
export function bucharestMorning(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 9);
  const h = Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Bucharest' }).format(new Date(guess)));
  return Math.floor((guess - (h - 9) * 3_600_000) / 1000);
}

export interface StartSchedule {
  /** The Bucharest day the plan starts on (the test clock's day in demo mode). */
  today: string;
  /** The first collection: today when today is the chosen day, else the next chosen day. */
  first: string;
  /**
   * When `first` is a later day: 09:00 Bucharest that day, the subscription's billing_cycle_anchor
   * (proration_behavior none, so nothing is charged before it). Null: the first deposit is charged now.
   */
  anchor: number | null;
}

/**
 * How a plan started at `nowUnix` (clock time in demo mode) collects: today when today is the
 * chosen day, else on the next chosen day at 09:00. The subscription is made server-side with
 * billing_cycle_anchor, so even tomorrow works (Checkout's 48-hour trial minimum no longer applies).
 */
export function startSchedule(nowUnix: number, every: Every, day: number): StartSchedule {
  const today = bucharestDate(new Date(nowUnix * 1000));
  const first = nextCollection(today, every, day);
  return { today, first, anchor: first === today ? null : bucharestMorning(first) };
}

/**
 * A running plan gets a new schedule. Whatever was already collected covers the period it was
 * collected for, so the new schedule starts on its first day on or after the end of that period:
 * nothing is charged now and nobody pays twice for the same stretch. `periodEnd` is the unix time
 * the current period (or trial) ends. `trialEnd` is set when the collection day moves: Stripe can
 * only move a running subscription's billing day with a trial that ends on the new day.
 */
export function rescheduleFrom(
  periodEnd: number,
  currentEvery: Every,
  next: { every: Every; day: number },
): { first: string; trialEnd: number | null } {
  const endDate = bucharestDate(new Date(periodEnd * 1000));
  const first = nextCollection(endDate, next.every, next.day);
  const same = currentEvery === next.every && first === endDate;
  return { first, trialEnd: same ? null : Math.max(bucharestMorning(first), periodEnd) };
}
