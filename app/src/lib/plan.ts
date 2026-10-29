// The money plan as the backend runs it (kept/supabase/functions/_shared/rules.ts): a daily amount,
// collected once a month on the student's payday. The first payment covers only the days until
// that payday. Ported here so the app can show the exact numbers before sending you to Stripe.
import type { Bani, Plan } from '../data/types';

export const MIN_DAILY: Bani = 5_00;
export const MAX_DAILY: Bani = 50_00;
/** Stripe's minimum charge in RON, also the backend's minimum extra deposit. */
export const MIN_EXTRA: Bani = 2_00;
export const MAX_EXTRA: Bani = 5_000_00;

/** Monthly top-up: the daily amount × 30. */
export const monthlyTopUp = (daily: Bani): Bani => daily * 30;

/** Days from `today` (YYYY-MM-DD) until the next payday; 0 when today is payday. Paydays are 1-28. */
export function daysUntilPayday(today: string, payday: number): number {
  const [y, m, d] = today.split('-').map(Number);
  if (d === payday) return 0;
  const next = d < payday ? Date.UTC(y, m - 1, payday) : Date.UTC(y, m, payday);
  return Math.round((next - Date.UTC(y, m - 1, d)) / 86_400_000);
}

/** What Checkout charges today: the days until payday, or a full month when payday is today. */
export function firstTopUp(daily: Bani, today: string, payday: number): { amount: Bani; days: number } {
  const days = daysUntilPayday(today, payday);
  if (days === 0) return { amount: monthlyTopUp(daily), days: 30 };
  return { amount: Math.max(MIN_EXTRA, daily * days), days };
}

/** Next date (YYYY-MM-DD) that is payday; today counts. */
export function nextPayday(today: string, payday: number): string {
  const [y, m, d] = today.split('-').map(Number);
  const dt = d <= payday ? new Date(Date.UTC(y, m - 1, payday)) : new Date(Date.UTC(y, m, payday));
  return dt.toISOString().slice(0, 10);
}

export const clampDaily = (v: Bani): Bani => Math.min(MAX_DAILY, Math.max(MIN_DAILY, Math.round(v / 100) * 100));

/**
 * Kip's plan (per week or per month) as the backend's daily amount, in whole lei so the figures
 * stay readable. Flexible plans start at 10 lei a day; you can change it before paying.
 */
export function dailyFromPlan(plan: Plan): Bani {
  if (plan.frequency === 'flexible' || plan.amount <= 0) return 10_00;
  return clampDaily(plan.frequency === 'weekly' ? plan.amount / 7 : plan.amount / 30);
}

/** Payday picked for a new plan: the plan's own day for monthly plans, else the 1st. */
export function paydayFromPlan(plan: Plan): number {
  return plan.frequency === 'monthly' && plan.day ? Math.min(28, Math.max(1, plan.day)) : 1;
}

/** Today in Bucharest, the day the backend uses for money. */
export function bucharestToday(at = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(at);
}

// ---------- the saving schedule (backend _shared/plan.ts) ----------
// Every week or every month, on one day, a set amount each time. For a Supabase account it is the
// real Stripe schedule (profiles.plan_*); local and demo accounts keep it in the goal's plan.

type Fixed = 'weekly' | 'monthly';
const PERIOD: Record<Fixed, number> = { weekly: 7, monthly: 30 };
/** What Stripe may collect each time: the same 5 to 50 lei a day as before, per week or month. */
export const minCollect = (f: Fixed): Bani => MIN_DAILY * PERIOD[f];
export const maxCollect = (f: Fixed): Bani => MAX_DAILY * PERIOD[f];

const addDay = (key: string, n: number) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};
/** 0 = Monday … 6 = Sunday. */
const weekdayOfKey = (key: string) => (new Date(`${key}T00:00:00Z`).getUTCDay() + 6) % 7;

/** The first day on or after `from` the schedule collects on (weekly day 0-6 Mon-Sun, monthly 1-28). */
export function nextCollection(from: string, frequency: Fixed, day: number): string {
  if (frequency === 'weekly') return addDay(from, (day - weekdayOfKey(from) + 7) % 7);
  const [y, m, d] = from.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + (d > day ? 1 : 0), day)).toISOString().slice(0, 10);
}

/**
 * The first deposit when a plan starts today, as payments.start sets it: today when today is the
 * day; tomorrow is too close for Stripe Checkout, so then the one after; otherwise the next one.
 */
export function firstCollection(today: string, frequency: Fixed, day: number): string {
  const first = nextCollection(today, frequency, day);
  return first === addDay(today, 1) ? nextCollection(addDay(first, 1), frequency, day) : first;
}
