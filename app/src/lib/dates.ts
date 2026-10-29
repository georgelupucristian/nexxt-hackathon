// All calendar logic works on local YYYY-MM-DD strings; weeks start on Monday.
import { plural } from './plural';

export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey(now = new Date()): string {
  return toKey(now);
}

export function addDays(key: string, n: number): string {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Same day n months later; the 31st lands on the last day of a shorter month instead of spilling over. */
export function addMonths(key: string, n: number): string {
  const d = fromKey(key);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toKey(d);
}

/** 0 = Monday … 6 = Sunday */
export function weekday(key: string): number {
  return (fromKey(key).getDay() + 6) % 7;
}

export function startOfWeek(key: string): string {
  return addDays(key, -weekday(key));
}

export function weekDays(key: string): string[] {
  const start = startOfWeek(key);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function daysBetween(a: string, b: string): number {
  return Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
}

export const WEEKDAY_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
export const WEEKDAY_NAME = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

const dayFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatDay(key: string, now = new Date()): string {
  const t = todayKey(now);
  if (key === t) return 'Today';
  if (key === addDays(t, -1)) return 'Yesterday';
  const d = fromKey(key);
  return d.getFullYear() === now.getFullYear() ? dayFmt.format(d) : dayYearFmt.format(d);
}

export function formatDate(key: string): string {
  return dayYearFmt.format(fromKey(key));
}

export function formatLong(key: string): string {
  return longFmt.format(fromKey(key));
}

export function relativeTime(iso: string, now = new Date()): string {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? 'yesterday' : `${plural(d, 'day', 'days')} ago`;
}

/** Day of the month in English: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 22nd, 23rd. */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}
