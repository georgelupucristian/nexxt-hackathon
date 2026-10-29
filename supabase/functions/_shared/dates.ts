// Calendar helpers for money dates. Pure (no Stripe, no database) so the unit tests can import them.
// Every money date is a Bucharest calendar day as YYYY-MM-DD, whatever timezone the server runs in.

// en-CA formats as YYYY-MM-DD. Built once: a formatter costs far more to create than to use.
const BUCHAREST_DAY = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' });
// the app's date style ("10 Nov 2026"); the input is already a calendar day, so read it as UTC
const DAY_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Today in Bucharest as YYYY-MM-DD. */
export function bucharestDate(at = new Date()): string {
  return BUCHAREST_DAY.format(at);
}

/** A YYYY-MM-DD date as people read it in the app and in Checkout: "10 Nov 2026". */
export function dayLabel(date: string): string {
  return DAY_LABEL.format(new Date(`${date}T00:00:00Z`));
}

/** A day of the month as English says it: 1st, 2nd, 3rd, 4th, 11th, 21st, 28th. */
export function ordinalDay(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** A YYYY-MM-DD date moved by n calendar days (UTC maths, so DST never shifts it). */
export function addDays(date: string, n: number): string {
  const t = new Date(`${date}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
