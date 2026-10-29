import { describe, expect, it } from 'vitest';
import { addMonths } from '../lib/dates';
import { convertAmount, deadlineFor, depositsUntil, GOAL_PRESETS, planDay, RELAXED_MONTHS, suggestPlan } from './goalPlan';
import { projectedFinish } from './selectors';

const TODAY = '2026-10-28'; // a Wednesday

describe('addMonths', () => {
  it('keeps the day, and clamps the 31st to the end of a shorter month', () => {
    expect(addMonths('2026-10-28', 3)).toBe('2027-01-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-12-15', 12)).toBe('2027-12-15');
  });
});

describe('deadlineFor', () => {
  it('turns the chips into dates; "No rush" has none', () => {
    expect(deadlineFor('3m', '', TODAY)).toBe('2027-01-28');
    expect(deadlineFor('6m', '', TODAY)).toBe('2027-04-28');
    expect(deadlineFor('1y', '', TODAY)).toBe('2027-10-28');
    expect(deadlineFor('none', '2027-01-01', TODAY)).toBeNull();
  });
  it('only accepts a picked date in the future', () => {
    expect(deadlineFor('date', '2027-03-01', TODAY)).toBe('2027-03-01');
    expect(deadlineFor('date', TODAY, TODAY)).toBeNull();
    expect(deadlineFor('date', '', TODAY)).toBeNull();
  });
});

describe('suggestPlan', () => {
  it('starts today: the weekday for weekly plans, the date for monthly ones', () => {
    expect(planDay('weekly', TODAY)).toBe(2);
    expect(planDay('monthly', TODAY)).toBe(28);
    expect(planDay('monthly', '2026-10-31')).toBe(28);
  });

  it('counts the deposits that fit before the deadline, today included', () => {
    expect(depositsUntil('weekly', '2027-01-28', TODAY)).toBe(14); // 92 days: today plus 13 more Wednesdays
    expect(depositsUntil('monthly', '2027-01-28', TODAY)).toBe(4); // 28 Oct, Nov, Dec, Jan
  });

  it('rounds up to 5 lei a week or 10 lei a month', () => {
    const w = suggestPlan(4000_00, '2027-04-28', 'weekly', TODAY);
    expect(w.amount % 5_00).toBe(0);
    expect(w.amount).toBe(150_00); // 4000 / 27 = 148.15 → 150
    const m = suggestPlan(1500_00, '2027-01-28', 'monthly', TODAY);
    expect(m.amount % 10_00).toBe(0);
    expect(m.amount).toBe(380_00); // 1500 / 4 = 375 → 380
  });

  it('never finishes after the deadline, for every preset and every chip', () => {
    for (const p of GOAL_PRESETS) {
      for (const months of [3, 6, 12]) {
        for (const f of ['weekly', 'monthly'] as const) {
          const deadline = addMonths(TODAY, months);
          const plan = suggestPlan(p.target, deadline, f, TODAY);
          const finish = projectedFinish(plan, 0, p.target, TODAY);
          expect(finish, `${p.id} ${months}m ${f}`).not.toBeNull();
          expect(finish! <= deadline, `${p.id} ${months}m ${f}: ${finish} > ${deadline}`).toBe(true);
        }
      }
    }
  });

  it('with no rush, paces the goal over about a year', () => {
    const plan = suggestPlan(2000_00, null, 'weekly', TODAY);
    expect(plan.amount).toBe(40_00); // 2000 / 53 Wednesdays = 37.7 → 40
    const finish = projectedFinish(plan, 0, 2000_00, TODAY)!;
    expect(finish <= addMonths(TODAY, RELAXED_MONTHS)).toBe(true);
  });

  it('a tiny target still gets a sensible minimum', () => {
    expect(suggestPlan(10_00, addMonths(TODAY, 12), 'weekly', TODAY).amount).toBe(5_00);
    expect(suggestPlan(10_00, addMonths(TODAY, 12), 'monthly', TODAY).amount).toBe(10_00);
  });
});

describe('convertAmount', () => {
  it('keeps the same pace when switching between a week and a month', () => {
    expect(convertAmount(100_00, 'weekly', 'monthly')).toBe(430_00);
    expect(convertAmount(430_00, 'monthly', 'weekly')).toBe(100_00);
    expect(convertAmount(50_00, 'weekly', 'weekly')).toBe(50_00);
  });
});
