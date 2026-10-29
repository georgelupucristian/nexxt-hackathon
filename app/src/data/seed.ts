// Sample data for the "Explore with sample data" entry. Every transaction is source 'demo',
// so the UI labels it as simulated. It is never presented as a real bank record.
import { addDays, todayKey, weekday } from '../lib/dates';
import { uid } from '../lib/id';
import { emptyData } from './storage';
import type { Goal, StreakAction, Transaction, UserData } from './types';

export function sampleData(today = todayKey()): UserData {
  const now = new Date().toISOString();
  const laptop: Goal = {
    id: uid('g_'),
    kind: 'tech',
    name: 'Laptop for uni',
    target: 4500_00,
    targetDate: addDays(today, 7 * 30),
    motivation: 'The one I have will die before the course ends.',
    plan: { amount: 100_00, frequency: 'weekly', day: 4 },
    status: 'active',
    createdAt: now,
    isPrimary: true,
  };
  const emergency: Goal = {
    id: uid('g_'),
    kind: 'emergency',
    name: 'Emergency fund',
    target: 2000_00,
    targetDate: null,
    motivation: 'A safety net for surprises with the rent.',
    plan: { amount: 150_00, frequency: 'monthly', day: 1 },
    status: 'active',
    createdAt: now,
    isPrimary: false,
  };

  const tx: Transaction[] = [];
  const add = (daysAgo: number, type: Transaction['type'], amount: number, goal: Goal | null, note: string, status: Transaction['status'] = 'confirmed') => {
    const date = addDays(today, -daysAgo);
    tx.push({
      id: uid('t_'),
      type,
      amount,
      goalId: goal?.id ?? null,
      date,
      note,
      status,
      source: 'demo',
      createdAt: `${date}T18:${String(10 + tx.length).padStart(2, '0')}:00.000Z`,
      updatedAt: now,
    });
  };
  // Eight weeks of mostly-kept plans, one withdrawal, one failed transfer and one pending.
  for (let w = 8; w >= 1; w--) add(w * 7 - 1, 'contribution', w === 5 ? 60_00 : 100_00, laptop, w === 5 ? 'Smaller week, exams' : 'Weekly plan');
  add(52, 'contribution', 150_00, emergency, 'Monthly plan');
  add(22, 'contribution', 150_00, emergency, 'Monthly plan');
  add(30, 'contribution', 250_00, null, 'Birthday money');
  add(18, 'withdrawal', 80_00, emergency, 'Train ticket home');
  add(9, 'contribution', 120_00, null, 'Tutoring', 'failed');
  add(1, 'contribution', 40_00, laptop, 'Extra money from tutoring', 'pending');
  // The last twelve days are a streak with one gap (day 7), and a day only counts when money goes
  // aside, so the days without a planned deposit get a small saving of their own.
  const SMALL: [number, number, string][] = [
    [12, 15_00, 'Cooked at home'],
    [11, 10_00, 'Change from coffee'],
    [10, 20_00, 'No delivery today'],
    [9, 10_00, 'Pocket change'],
    [8, 15_00, 'Walked instead'],
    [5, 10_00, 'Change from coffee'],
    [4, 25_00, 'Sold a book'],
    [3, 10_00, 'Pocket change'],
    [2, 15_00, 'Cooked at home'],
  ];
  for (const [daysAgo, amount, note] of SMALL) add(daysAgo, 'contribution', amount, laptop, note);

  // streak days are the days money went in (confirmed or still pending), as for a real account
  const actions: StreakAction[] = tx
    .filter((t) => t.type === 'contribution' && t.status !== 'failed')
    .map((t) => ({ date: t.date, kind: 'contribution' as const, at: now }));

  const base = emptyData();
  return {
    ...base,
    onboarding: { ...base.onboarding, completed: true, step: 4 },
    goals: [laptop, emergency],
    transactions: tx,
    tracking: 'demo',
    connection: {
      status: 'connected',
      institution: 'Demo Bank (simulated)',
      lastSyncAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
      lastError: null,
      simulateFailure: false,
    },
    reminder: { enabled: true, day: weekday(addDays(today, 1)), time: '19:00' },
    actions,
  };
}
