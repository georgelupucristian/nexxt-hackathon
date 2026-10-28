import { describe, expect, it } from 'vitest';
import { parseLei, formatLei } from '../lib/money';
import { available, breakdown, currentStreak, bestStreak, goalSaved, nextPlannedDate, projectedFinish, weekStates, weekSummary } from './selectors';
import type { Transaction } from './types';

let n = 0;
const tx = (p: Partial<Transaction>): Transaction => ({
  id: `t${n++}`,
  type: 'contribution',
  amount: 100_00,
  goalId: null,
  date: '2026-10-20',
  note: '',
  status: 'confirmed',
  source: 'manual',
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-20T10:00:00Z',
  ...p,
});

describe('money', () => {
  it('parses ro and en formats', () => {
    expect(parseLei('420')).toBe(42000);
    expect(parseLei('420,5')).toBe(42050);
    expect(parseLei('1.250,50')).toBe(125050);
    expect(parseLei('1,250.50')).toBe(125050);
    expect(parseLei('abc')).toBeNull();
    expect(parseLei('1,2,3')).toBeNull();
  });
  it('formats', () => {
    expect(formatLei(42000)).toBe('420 lei');
    expect(formatLei(-1050, { sign: true })).toBe('−10,50 lei');
  });
});

describe('balances never double count', () => {
  const txs = [
    tx({ amount: 300_00, goalId: 'a' }),
    tx({ amount: 120_00, goalId: 'b' }),
    tx({ amount: 50_00, goalId: null }),
    tx({ type: 'withdrawal', amount: 20_00, goalId: 'a' }),
    tx({ amount: 999_00, goalId: 'a', status: 'pending' }),
    tx({ amount: 999_00, goalId: 'b', status: 'failed' }),
  ];
  it('total = goals + unallocated, ignoring pending and failed', () => {
    const b = breakdown(txs);
    expect(b.total).toBe(450_00);
    expect(goalSaved(txs, 'a') + goalSaved(txs, 'b') + b.unallocated).toBe(b.total);
    expect(b.allocated).toBe(400_00);
    expect(b.pendingIn).toBe(999_00);
  });
  it('available excludes pending withdrawals', () => {
    const withPending = [...txs, tx({ type: 'withdrawal', amount: 80_00, goalId: 'a', status: 'pending' })];
    expect(available(withPending, 'a')).toBe(200_00);
  });
});

describe('streaks', () => {
  const a = (date: string) => ({ date, kind: 'check-in' as const, at: '' });
  it('counts back from today, today pending does not break', () => {
    const d = { actions: [a('2026-10-25'), a('2026-10-26'), a('2026-10-27')], pausedDays: [] };
    expect(currentStreak(d, '2026-10-28')).toBe(3);
    expect(currentStreak(d, '2026-10-29')).toBe(0);
  });
  it('break days bridge without counting', () => {
    const d = { actions: [a('2026-10-24'), a('2026-10-26')], pausedDays: ['2026-10-25'] };
    expect(currentStreak(d, '2026-10-26')).toBe(2);
    expect(bestStreak(d)).toBe(2);
  });
  it('week states', () => {
    const d = { actions: [a('2026-10-26')], pausedDays: ['2026-10-29'] };
    const s = weekStates(d, '2026-01-01', '2026-10-28').map((x) => x.state);
    expect(s).toEqual(['done', 'missed', 'today', 'paused', 'future', 'future', 'future']);
  });
});

describe('plans', () => {
  it('next weekly date', () => {
    // 2026-10-28 is a Wednesday (2); Friday = 4
    expect(nextPlannedDate({ amount: 1, frequency: 'weekly', day: 4 }, '2026-10-28')).toBe('2026-10-30');
    expect(nextPlannedDate({ amount: 1, frequency: 'weekly', day: 2 }, '2026-10-28')).toBe('2026-10-28');
    expect(nextPlannedDate({ amount: 1, frequency: 'monthly', day: 1 }, '2026-10-28')).toBe('2026-11-01');
  });
  it('projected finish', () => {
    expect(projectedFinish({ amount: 100_00, frequency: 'weekly', day: 4 }, 0, 300_00, '2026-10-28')).toBe('2026-11-13');
    expect(projectedFinish({ amount: 0, frequency: 'flexible', day: null }, 0, 300_00, '2026-10-28')).toBeNull();
  });
  it('week summary', () => {
    const s = weekSummary([tx({ date: '2026-10-20', amount: 100_00 }), tx({ date: '2026-10-27', amount: 50_00 }), tx({ date: '2026-10-28', type: 'withdrawal', amount: 20_00 })], '2026-10-28');
    expect(s).toMatchObject({ starting: 100_00, contributions: 50_00, withdrawals: 20_00, net: 30_00, ending: 130_00 });
  });
});
