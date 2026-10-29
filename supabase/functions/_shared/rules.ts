// Pure money rules shared by the Edge Functions and the app's unit tests.
// Amounts are integer bani. Nothing here talks to Stripe or the database.

export const BANI = 100;
export const MIN_DAILY_BANI = 5 * BANI;
export const MAX_DAILY_BANI = 50 * BANI;
export const STRIPE_MIN_CHARGE_BANI = 2 * BANI; // Stripe's minimum charge in RON

/** Monthly top-up shown and charged: daily amount × 30 (we present money per day, collect per month). */
export function monthlyTopUp(dailyBani: number): number {
  return dailyBani * 30;
}

/** Days from `today` until the next payday (0 when today is payday). Paydays are 1–28 so every month has one. */
export function daysUntilPayday(today: Date, payday: number): number {
  const y = today.getUTCFullYear();
  const m = today.getUTCMonth();
  const d = today.getUTCDate();
  if (d === payday) return 0;
  const next = d < payday ? Date.UTC(y, m, payday) : Date.UTC(y, m + 1, payday);
  return Math.round((next - Date.UTC(y, m, d)) / 86_400_000);
}

/**
 * The first payment covers only the days until the student's payday, so nobody pays a full month
 * now and another full month three days later. From payday on, it's the regular monthly top-up.
 */
export function firstTopUp(dailyBani: number, today: Date, payday: number): { amount: number; days: number } {
  const days = daysUntilPayday(today, payday);
  if (days === 0) return { amount: monthlyTopUp(dailyBani), days: 30 };
  return { amount: Math.max(STRIPE_MIN_CHARGE_BANI, dailyBani * days), days };
}

/** Parent match for one student top-up: amount × ratio, never above what's left of the monthly cap. */
export function computeMatch(studentBani: number, ratioNum: number, ratioDen: number, capBani: number, alreadyMatchedThisMonth: number): number {
  if (studentBani <= 0 || ratioDen <= 0) return 0;
  const raw = Math.floor((studentBani * ratioNum) / ratioDen);
  const room = Math.max(0, capBani - alreadyMatchedThisMonth);
  const match = Math.min(raw, room);
  // below Stripe's minimum charge it isn't worth a payment; skip rather than fail
  return match >= STRIPE_MIN_CHARGE_BANI ? match : 0;
}

export interface LedgerRow {
  bucket: 'de_pus_deoparte' | 'goal' | 'outside';
  type: string;
  amount_bani: number;
  status: 'pending' | 'confirmed' | 'failed';
  is_matched: boolean;
}

/** Balances from confirmed rows only. Pending is reported apart and never added in. */
export function balances(rows: LedgerRow[]) {
  const ok = rows.filter((r) => r.status === 'confirmed');
  const sum = (xs: LedgerRow[]) => xs.reduce((s, r) => s + r.amount_bani, 0);
  const pot = ok.filter((r) => r.bucket !== 'outside');
  return {
    deoparte: sum(ok.filter((r) => r.bucket === 'de_pus_deoparte')),
    inGoals: sum(ok.filter((r) => r.bucket === 'goal')),
    matched: sum(ok.filter((r) => r.bucket === 'goal' && r.is_matched)),
    pot: sum(pot),
    pendingIn: sum(rows.filter((r) => r.status === 'pending' && r.amount_bani > 0)),
    recordedOutside: sum(ok.filter((r) => r.bucket === 'outside')),
  };
}

/**
 * What the student may withdraw: everything in the pot except money a parent matched, which was
 * given for the home and stays in Avansul (the rule is shown to both before they agree).
 */
export function withdrawable(rows: LedgerRow[]): number {
  const b = balances(rows);
  return Math.max(0, b.pot - b.matched);
}

/** Daily allocation: move the daily amount, or whatever is waiting if that's less. */
export function allocationFor(dailyBani: number, waitingBani: number): number {
  return Math.max(0, Math.min(dailyBani, waitingBani));
}

// ---------- weekly rhythm (repairable, never touches money) ----------

export type WeekState = 'done' | 'repaired' | 'missed' | 'current' | 'future';
export interface WeekRecord {
  week: string; // ISO week, e.g. 2026-W44
  active: boolean; // extra deposit or check-in that week
  repaired: boolean;
}

/** ISO-8601 week id for a date. */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y = t.getUTCFullYear();
  const w = Math.ceil(((t.getTime() - Date.UTC(y, 0, 1)) / 86_400_000 + 1) / 7);
  return `${y}-W${String(w).padStart(2, '0')}`;
}

/**
 * A missed week can be repaired during the following week with an extra deposit. The current
 * week is never "missed" yet. Returns oldest → newest for the strip.
 */
export function weekStates(records: WeekRecord[], weeks: string[], currentWeek: string): WeekState[] {
  const byWeek = new Map(records.map((r) => [r.week, r]));
  return weeks.map((w) => {
    if (w > currentWeek) return 'future';
    const r = byWeek.get(w);
    if (r?.active) return 'done';
    if (r?.repaired) return 'repaired';
    return w === currentWeek ? 'current' : 'missed';
  });
}

/** Coming back after ≥2 missed weeks earns a visual comeback moment (no money). */
export function isComeback(states: WeekState[]): boolean {
  const past = states.filter((s) => s !== 'future' && s !== 'current');
  let missed = 0;
  for (let i = past.length - 1; i >= 0 && past[i] === 'missed'; i--) missed++;
  return missed >= 2;
}
