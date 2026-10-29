import { describe, expect, it } from 'vitest';
import { streakOf } from '../social/rules';
import { CLUB_BY_SLUG, CLUBS } from './config';
import {
  claimAction,
  countsAsStreakDay,
  daysToFit,
  daysUntilNextMonth,
  formatMembers,
  joinNote,
  nextSlot,
  promotionsFor,
  settleClubs,
  slotsFor,
  streakDays,
} from './rules';
import type { Membership } from './types';

const m = (slug: Membership['slug'], joinedAt: string, extra: Partial<Membership> = {}): Membership => ({ slug, status: 'active', joinedAt, pausedAt: null, comebackUntil: null, ...extra });

describe('the one streak rule', () => {
  it('counts a day only at the daily amount (at least 1 leu)', () => {
    expect(countsAsStreakDay(1499, 1500)).toBe(false);
    expect(countsAsStreakDay(1500, 1500)).toBe(true);
    expect(countsAsStreakDay(99, 0)).toBe(false);
    // two small deposits on one day add up
    expect(streakDays([{ date: '2026-10-01', amountBani: 800 }, { date: '2026-10-01', amountBani: 700 }], 1500).has('2026-10-01')).toBe(true);
  });
  it('10x the amount is still one day', () => {
    const days = streakDays([{ date: '2026-10-02', amountBani: 15000 }], 1500);
    expect(days.size).toBe(1);
    expect(streakOf(days, new Set(), '2026-10-02')).toBe(1);
  });
  it('freeze days hold the run without growing it', () => {
    const saved = new Set(['2026-10-01', '2026-10-03']);
    expect(streakOf(saved, new Set(['2026-10-02']), '2026-10-03')).toBe(2);
    expect(streakOf(saved, new Set(), '2026-10-03')).toBe(1);
  });
});

describe('slots', () => {
  it('opens at 0, 14, 30, 60, 90 and 150 days', () => {
    expect([0, 13, 14, 29, 30, 60, 90, 149, 150, 400].map(slotsFor)).toEqual([1, 1, 2, 2, 3, 4, 5, 5, 6, 6]);
    expect(nextSlot(27)).toEqual({ at: 30, days: 3 });
    expect(nextSlot(150)).toBeNull();
  });
  it('days to rejoin: until one more club fits', () => {
    expect(daysToFit(7, 2)).toBe(7);
    expect(daysToFit(20, 2)).toBe(0);
    expect(daysToFit(200, 7)).toBeNull();
    expect(joinNote(CLUB_BY_SLUG.tech, 'lost', 3)).toBe('3 more days to rejoin the Tech Club');
    expect(joinNote(CLUB_BY_SLUG.tech, null, 3)).toBe('3 more streak days to join');
    expect(joinNote(CLUB_BY_SLUG.tech, null, 0)).toBeNull();
  });
});

describe('pause, comeback, lost', () => {
  const three = [m('travel', '2026-08-01'), m('tech', '2026-09-01'), m('erasmus', '2026-10-01')];
  it('a break pauses the clubs above the slots for 30 days, the oldest stays', () => {
    const { memberships } = settleClubs(three, { streak: 1, lastStreak: 40, today: '2026-10-29' });
    expect(memberships.map((x) => x.status)).toEqual(['active', 'paused', 'paused']);
    expect(memberships[1].comebackUntil).toBe('2026-11-28');
  });
  it('a quiet day is not a break', () => {
    expect(settleClubs(three, { streak: 40, lastStreak: 40, today: '2026-10-29' }).memberships.every((x) => x.status === 'active')).toBe(true);
  });
  const paused = [m('travel', '2026-08-01'), m('tech', '2026-09-01', { status: 'paused', pausedAt: '2026-10-01', comebackUntil: '2026-10-31' })];
  it('14 days in a row inside the window brings every club back, even above the slots', () => {
    const r = settleClubs(paused, { streak: 14, lastStreak: 13, today: '2026-10-29' });
    expect(r.won).toBe(true);
    expect(r.memberships.map((x) => x.status)).toEqual(['active', 'active']);
  });
  it('not while the run rests on a day still in danger', () => {
    expect(settleClubs(paused, { streak: 14, lastStreak: 13, today: '2026-10-29', inDanger: true }).won).toBe(false);
  });
  it('the window running out makes them lost', () => {
    expect(settleClubs(paused, { streak: 5, lastStreak: 4, today: '2026-11-01' }).memberships[1].status).toBe('lost');
  });
});

describe('promotions', () => {
  it('everyone sees them, only active members claim, once', () => {
    expect(claimAction(null, false)).toBe('locked');
    expect(claimAction('paused', false)).toBe('locked');
    expect(claimAction('active', false)).toBe('claim');
    expect(claimAction('active', true)).toBe('show-code');
  });
  it('rotate on the 1st with 3 to 5 a month, "New" when last month did not have it', () => {
    for (const club of CLUBS) {
      const oct = promotionsFor(club, '2026-10');
      expect(oct.length).toBeGreaterThanOrEqual(3);
      expect(oct.length).toBeLessThanOrEqual(5);
      const nov = promotionsFor(club, '2026-11');
      expect(nov.map((p) => p.promoId)).not.toEqual(oct.map((p) => p.promoId));
      expect(nov.some((p) => p.isNew)).toBe(true);
      expect(nov.filter((p) => !p.isNew).every((p) => oct.some((o) => o.id === p.id))).toBe(true);
    }
    const p = promotionsFor(CLUB_BY_SLUG.travel, '2026-02')[0];
    expect([p.validFrom, p.validTo]).toEqual(['2026-02-01', '2026-02-28']);
    expect(p.promoId).toMatch(/^travel\/[a-z0-9-]+\/2026-02$/);
    expect(daysUntilNextMonth('2026-10-29')).toBe(3);
  });
  it('rounds member counts and calls small clubs new', () => {
    expect([12, 86, 1234].map(formatMembers)).toEqual(['New club', '86 members', '1.2k members']);
  });
});
