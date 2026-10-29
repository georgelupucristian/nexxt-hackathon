// The clubs' rules as pure functions. The server is the authority (0018_clubs.sql: social_saved_days,
// clubs_slots_for, clubs_settle, clubs_claim); these mirror it so the screens can explain the
// numbers and the tests can pin the spec down.
import { COMEBACK_DAYS, COMEBACK_WINDOW_DAYS, ROTATE_BY, SLOT_THRESHOLDS } from './config';
import type { Club, ClubsState, Membership, MembershipStatus, MonthKey, Promo } from './types';

// ---------- the one streak rule ----------

/** the floor under any daily amount: 1 leu */
export const MIN_DAY_BANI = 100;

/** A day counts when that day's confirmed deposits reach the daily amount. More is still one day. */
export function countsAsStreakDay(totalBani: number, dailyBani: number): boolean {
  return totalBani >= Math.max(dailyBani || 0, MIN_DAY_BANI);
}

/** The days that count, from a list of deposits (withdrawals are simply not deposits). */
export function streakDays(deposits: { date: string; amountBani: number }[], dailyBani: number): Set<string> {
  const byDay = new Map<string, number>();
  for (const d of deposits) if (d.amountBani > 0) byDay.set(d.date, (byDay.get(d.date) ?? 0) + d.amountBani);
  return new Set([...byDay].filter(([, total]) => countsAsStreakDay(total, dailyBani)).map(([day]) => day));
}

// ---------- slots ----------

export function slotsFor(streak: number): number {
  return SLOT_THRESHOLDS.filter((t) => t <= Math.max(streak, 0)).length;
}

/** streak days still needed before n clubs fit: 0 when they already do, null past the last slot */
export function daysToFit(streak: number, n: number): number | null {
  if (n < 1) return 0;
  if (n > SLOT_THRESHOLDS.length) return null;
  return Math.max(SLOT_THRESHOLDS[n - 1] - streak, 0);
}

export function nextSlot(streak: number): { at: number; days: number } | null {
  const n = slotsFor(streak);
  if (n >= SLOT_THRESHOLDS.length) return null;
  return { at: SLOT_THRESHOLDS[n], days: SLOT_THRESHOLDS[n] - streak };
}

// ---------- the pause, the comeback, lost ----------

const dayNum = (key: string) => Math.round(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) / 86_400_000);
const fromNum = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
export const addDaysKey = (key: string, n: number) => fromNum(dayNum(key) + n);
export const daysFromTo = (a: string, b: string) => dayNum(b) - dayNum(a);

export interface SettleInput {
  streak: number;
  /** the streak the last time anyone looked: a lower number now means it broke */
  lastStreak: number | null;
  today: string;
  /** a missed day still inside its 24 hours: no comeback counted on it */
  inDanger?: boolean;
}

/** clubs_settle: comeback first, then the window running out, then a break pausing the extra clubs. */
export function settleClubs(ms: Membership[], { streak, lastStreak, today, inDanger = false }: SettleInput): { memberships: Membership[]; won: boolean } {
  let won = false;
  let out = ms.map((m) => {
    if (m.status === 'paused' && streak >= COMEBACK_DAYS && !inDanger && m.comebackUntil && daysFromTo(addDaysKey(today, -(streak - COMEBACK_DAYS)), m.comebackUntil) >= 0) {
      won = true;
      return { ...m, status: 'active' as const, pausedAt: null, comebackUntil: null };
    }
    if (m.status === 'paused' && m.comebackUntil && m.comebackUntil < today) return { ...m, status: 'lost' as const };
    return m;
  });
  if (lastStreak != null && streak < lastStreak) {
    const keep = new Set(
      out
        .filter((m) => m.status === 'active')
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.slug.localeCompare(b.slug))
        .slice(0, slotsFor(streak))
        .map((m) => m.slug),
    );
    const until = addDaysKey(today, COMEBACK_WINDOW_DAYS);
    out = out.map((m) => (m.status === 'active' && !keep.has(m.slug) ? { ...m, status: 'paused' as const, pausedAt: today, comebackUntil: until } : m));
  }
  return { memberships: out, won };
}

// ---------- promotions ----------

export const monthOf = (dayKey: string): MonthKey => dayKey.slice(0, 7);
const monthIdx = (m: MonthKey) => +m.slice(0, 4) * 12 + (+m.slice(5, 7) - 1);
export const prevMonth = (m: MonthKey): MonthKey => {
  const i = monthIdx(m) - 1;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}`;
};
export const promoId = (club: Club, templateId: string, month: MonthKey) => `${club.slug}/${templateId}/${month}`;
export const monthName = (m: MonthKey) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' });

function windowIds(club: Club, month: MonthKey): string[] {
  const start = (monthIdx(month) * ROTATE_BY) % club.pool.length;
  return Array.from({ length: Math.min(club.perMonth, club.pool.length) }, (_, k) => club.pool[(start + k) % club.pool.length].id);
}

/** This month's promotions: valid from the 1st to the last day, "New" when last month didn't have it. */
export function promotionsFor(club: Club, month: MonthKey): Promo[] {
  const before = new Set(windowIds(club, prevMonth(month)));
  const last = addDaysKey(`${month}-01`, 40).slice(0, 7);
  const validTo = addDaysKey(`${last}-01`, -1);
  return windowIds(club, month).map((id) => {
    const t = club.pool.find((p) => p.id === id)!;
    return { ...t, promoId: promoId(club, id, month), club: club.slug, month, validFrom: `${month}-01`, validTo, isNew: !before.has(id) };
  });
}

export const newPromoCount = (club: Club, month: MonthKey) => promotionsFor(club, month).filter((p) => p.isNew).length;

/** "New promotions in N days": until the 1st of next month */
export function daysUntilNextMonth(today: string): number {
  const next = addDaysKey(`${monthOf(today)}-01`, 40).slice(0, 7);
  return daysFromTo(today, `${next}-01`);
}

/** What a promotion's button does for this person: everyone sees it, only active members claim. */
export function claimAction(status: MembershipStatus | null, claimed: boolean): 'show-code' | 'claim' | 'locked' {
  if (claimed) return 'show-code';
  return status === 'active' ? 'claim' : 'locked';
}

// ---------- words ----------

/** "1.2k members", "86 members", or "New club" under 50 (a real aggregate, rounded) */
export function formatMembers(n: number): string {
  if (n < 50) return 'New club';
  if (n < 1000) return `${n} members`;
  return `${(Math.floor(n / 100) / 10).toFixed(1).replace(/\.0$/, '')}k members`;
}

/** "3 more streak days to join" / "3 more days to rejoin the Tech Club", or null when it can happen now */
export function joinNote(club: Club, status: MembershipStatus | null, freeSlotIn: number | null): string | null {
  if (status === 'active' || freeSlotIn === 0) return null;
  if (freeSlotIn == null) return 'Every slot is in use. Leave a club to make room.';
  const days = `${freeSlotIn} more ${freeSlotIn === 1 ? 'day' : 'days'}`;
  return status === 'lost' || status === 'paused' ? `${days} to rejoin the ${club.name}` : `${freeSlotIn} more streak ${freeSlotIn === 1 ? 'day' : 'days'} to join`;
}

/** The club a goal suggests: by its icon, then its kind, then its name. */
export function clubForGoal(clubs: Club[], goal: { icon?: string; kind: string; name: string } | null | undefined): Club | null {
  if (!goal) return null;
  if (/erasmus/i.test(goal.name)) return clubs.find((c) => c.slug === 'erasmus') ?? null;
  const byIcon = goal.icon ? clubs.find((c) => c.goalIcons.includes(goal.icon!)) : undefined;
  if (byIcon) return byIcon;
  const kind: Record<string, string> = { travel: 'travel', tech: 'tech', emergency: 'emergency-fund' };
  return clubs.find((c) => c.slug === kind[goal.kind]) ?? null;
}

export const membershipOf = (state: ClubsState | null, slug: string) => state?.memberships.find((m) => m.slug === slug) ?? null;
