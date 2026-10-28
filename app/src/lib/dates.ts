// All calendar logic works on local YYYY-MM-DD strings; weeks start on Monday.
import { plural } from './ro';

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

export const WEEKDAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const WEEKDAY_NAME = ['Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă', 'Duminică'];

const dayFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short' });
const dayYearFmt = new Intl.DateTimeFormat('ro-RO', { day: 'numeric', month: 'short', year: 'numeric' });
const longFmt = new Intl.DateTimeFormat('ro-RO', { weekday: 'long', day: 'numeric', month: 'long' });

export function formatDay(key: string, now = new Date()): string {
  const t = todayKey(now);
  if (key === t) return 'Azi';
  if (key === addDays(t, -1)) return 'Ieri';
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
  if (min < 1) return 'chiar acum';
  if (min < 60) return `acum ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `acum ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ieri' : `acum ${plural(d, 'zi', 'zile')}`;
}

/** Day of the month as Romanian writes it: a plain number ("pe 5 ale lunii"), no ordinal suffix. */
export function ordinal(n: number): string {
  return String(n);
}
