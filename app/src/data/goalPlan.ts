// The maths behind "Planul tău": the new-goal wizard and signup ask what, how much and by when,
// then work the plan out for you instead of asking for one. Pure functions, so they're tested on
// their own (goalPlan.test.ts).
import { addMonths, daysBetween, fromKey, todayKey, weekday } from '../lib/dates';
import { nextPlannedDate } from './selectors';
import type { Bani, GoalColour, GoalKind, Plan } from './types';

export type WhenId = '3m' | '6m' | '1y' | 'date' | 'none';
export type PlanFrequency = 'weekly' | 'monthly';

export interface GoalPreset {
  id: string;
  /** what the tile says */
  label: string;
  /** the goal's name to start from; empty for "Altceva", where you type one */
  name: string;
  kind: GoalKind;
  /** key from GOAL_ICONS */
  icon: string;
  colour: GoalColour;
  /** a believable starting price, so the amount step is one tap on Continue for most people */
  target: Bani;
  when: WhenId;
  frequency: PlanFrequency;
}

// Eight things students actually save for. The prices are starting points you change on the next
// screen; the deadlines are what most people would pick for each.
export const GOAL_PRESETS: GoalPreset[] = [
  { id: 'laptop', label: 'Laptop', name: 'Laptop', kind: 'tech', icon: 'laptop', colour: 'liliac', target: 4000_00, when: '6m', frequency: 'weekly' },
  { id: 'phone', label: 'Phone', name: 'Phone', kind: 'tech', icon: 'phone', colour: 'cer', target: 2500_00, when: '6m', frequency: 'weekly' },
  { id: 'travel', label: 'Erasmus / travel', name: 'Erasmus', kind: 'travel', icon: 'globe', colour: 'soare', target: 5000_00, when: '1y', frequency: 'weekly' },
  { id: 'emergency', label: 'Emergency fund', name: 'Emergency fund', kind: 'emergency', icon: 'buoy', colour: 'menta', target: 2000_00, when: 'none', frequency: 'weekly' },
  { id: 'concert', label: 'Concert', name: 'Concert', kind: 'custom', icon: 'ticket', colour: 'trandafir', target: 400_00, when: '3m', frequency: 'weekly' },
  { id: 'rent', label: 'Rent', name: 'Rent', kind: 'custom', icon: 'home', colour: 'coral', target: 1500_00, when: '3m', frequency: 'monthly' },
  { id: 'gift', label: 'Gift', name: 'Gift', kind: 'custom', icon: 'gift', colour: 'liliac', target: 300_00, when: '3m', frequency: 'weekly' },
  { id: 'other', label: 'Something else', name: '', kind: 'custom', icon: 'star', colour: 'cer', target: 1000_00, when: '6m', frequency: 'weekly' },
];

export const presetById = (id: string | null) => GOAL_PRESETS.find((p) => p.id === id) ?? null;

export const WHEN_CHOICES: { id: WhenId; label: string; months?: number }[] = [
  { id: '3m', label: '3 months', months: 3 },
  { id: '6m', label: '6 months', months: 6 },
  { id: '1y', label: '1 year', months: 12 },
  { id: 'date', label: 'Pick a date' },
  { id: 'none', label: 'No rush' },
];

/** "No rush" still gets a number: the pace that gets you there in about a year. */
export const RELAXED_MONTHS = 12;

/** The goal's target date for a deadline choice; null for "No rush" (and for a date not picked yet). */
export function deadlineFor(when: WhenId, date: string, today = todayKey()): string | null {
  const choice = WHEN_CHOICES.find((w) => w.id === when);
  if (choice?.months) return addMonths(today, choice.months);
  if (when === 'date') return date && date > today ? date : null;
  return null;
}

/** The plan's day: today's weekday, or today's date (capped at 28 so it exists every month). */
export function planDay(frequency: PlanFrequency, today = todayKey()): number {
  return frequency === 'weekly' ? weekday(today) : Math.min(28, fromKey(today).getDate());
}

/** How many planned deposits fall between today and the deadline, both included. */
export function depositsUntil(frequency: PlanFrequency, deadline: string, today = todayKey()): number {
  const plan: Plan = { amount: 1, frequency, day: planDay(frequency, today) };
  const first = nextPlannedDate(plan, today) ?? today;
  if (first > deadline) return 1;
  if (frequency === 'weekly') return Math.floor(daysBetween(first, deadline) / 7) + 1;
  let n = 0;
  while (n < 1200 && addMonths(first, n) <= deadline) n++;
  return Math.max(1, n);
}

/**
 * The plan Kip proposes: the deposit that reaches the target by the deadline (or within a year
 * when there's no rush), rounded up to a friendly number: 5 lei a week, 10 lei a month. Rounding up
 * means the plan never finishes after the date you chose.
 */
export function suggestPlan(target: Bani, deadline: string | null, frequency: PlanFrequency, today = todayKey()): Plan {
  const end = deadline && deadline > today ? deadline : addMonths(today, RELAXED_MONTHS);
  const count = depositsUntil(frequency, end, today);
  const round = frequency === 'weekly' ? 5_00 : 10_00;
  const raw = Math.ceil(Math.max(0, target) / count);
  const amount = Math.max(round, Math.ceil(raw / round) * round);
  return { amount, frequency, day: planDay(frequency, today) };
}

/** Switching between a week and a month keeps the same pace, rounded the same friendly way. */
export function convertAmount(amount: Bani, from: PlanFrequency, to: PlanFrequency): Bani {
  if (from === to) return amount;
  return to === 'monthly' ? Math.max(10_00, Math.round((amount * 4.3) / 10_00) * 10_00) : Math.max(5_00, Math.round(amount / 4.3 / 5_00) * 5_00);
}
