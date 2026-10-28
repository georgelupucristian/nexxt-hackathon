import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Flame } from '@/lib/icons';
import { useCelebrate } from '../mascot/Celebration';
import { useToast } from '../ui';
import { QuickRecord } from './Playful';
import { actionDays, activeGoals, currentStreak, goalSaved, weekStates } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { addDays, daysBetween, formatDate, startOfWeek, todayKey, toKey, WEEKDAY_NAME, WEEKDAY_SHORT } from '../../lib/dates';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/ro';

/**
 * Home in four blocks, most important first: the savings goal (the only place Kip appears on this
 * screen), the streak, recent activity, and the projection. Each block is one flat card with the
 * same padding and radius; nothing floats over another.
 */

// ---------- 1. the savings goal ----------

/**
 * Kip marks milestones rather than decorating the card: a different pose for each quarter of the
 * way, and a short celebration the moment a new quarter is crossed.
 */
const MILESTONES = [
  { at: 1, pose: 'pose-celebrate', line: 'Ai strâns tot. Obiectiv atins!' },
  { at: 0.75, pose: 'pose-guide', line: 'Trei sferturi din drum. Se vede ținta.' },
  { at: 0.5, pose: 'pose-point', line: 'Jumătate din drum. Restul e mai ușor.' },
  { at: 0.25, pose: 'pose-happy', line: 'Un sfert din drum. Începutul e cel mai greu.' },
  { at: 0, pose: 'pose-wave', line: '' },
];
const milestone = (pct: number) => MILESTONES.find((m) => pct >= m.at)!;

/** Lei a day it takes to land on the target date; only shown when there is one. */
function perDay(goal: Goal, saved: number): number | null {
  const left = Math.max(0, goal.target - saved);
  if (left === 0 || !goal.targetDate || goal.targetDate <= todayKey()) return null;
  return Math.ceil(left / Math.max(1, daysBetween(todayKey(), goal.targetDate)) / 100) * 100;
}

export function GoalCard({ goal, primary }: { goal: Goal; primary: boolean }) {
  const data = useData();
  const celebrate = useCelebrate();
  const saved = goalSaved(data.transactions, goal.id);
  const pct = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const left = Math.max(0, goal.target - saved);
  const daily = perDay(goal, saved);
  const hidden = data.prefs.hideBalance;
  const others = activeGoals(data.goals).length - 1;
  const step = milestone(pct);

  // a new quarter crossed while you're here (not on first load): Kip celebrates it once
  const seen = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { id: goal.id, at: step.at };
    if (prev && prev.id === goal.id && step.at > prev.at && step.line) {
      const t = window.setTimeout(() => celebrate({ title: `${Math.round(step.at * 100)}% din ${goal.name}`, sub: step.line }), 2900);
      return () => window.clearTimeout(t);
    }
  }, [goal.id, goal.name, step, celebrate]);

  return (
    <section className="hc goalc" data-tour="vault" aria-labelledby="goalc-name">
      <p className="hc__eyebrow">Obiectivul tău</p>
      <Link to={`/goals/${goal.id}`} id="goalc-name" className="goalc__name">
        {goal.name}
        <ChevronRight size={16} aria-hidden />
      </Link>

      <div className="goalc__money">
        <div>
          <p className="goalc__amount money">
            {hidden ? '••••' : <NumberFlow value={saved / 100} locales="ro-RO" format={{ maximumFractionDigits: 0 }} />}
            <span> lei</span>
          </p>
          <p className="goalc__of">din obiectivul de {formatLei(goal.target)}</p>
        </div>
        {/* Kip stands on the bar; his pose changes with every quarter of the way */}
        <img className="goalc__kip" src={`/mascot/${step.pose}.webp`} alt="" />
      </div>

      <div className="goalc__progress" data-tour="goal">
        <div className="goalc__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${goal.name}: ${Math.round(pct * 100)}%`}>
          <motion.span initial={false} animate={{ width: `${Math.max(pct * 100, pct > 0 ? 2 : 0)}%` }} transition={{ type: 'spring', stiffness: 80, damping: 20 }} />
        </div>
        <div className="goalc__legend">
          <strong>{Math.round(pct * 100)}%</strong>
          <span>{left > 0 ? `Mai ai ${formatLei(left)} până la obiectiv` : 'Obiectiv atins'}</span>
        </div>
      </div>

      {daily !== null && goal.targetDate && (
        <p className="goalc__note">
          Până pe {formatDate(goal.targetDate)}: <strong>{formatLei(daily)} pe zi</strong>
        </p>
      )}

      <QuickRecord goal={goal} primary={primary} />

      <div className="goalc__foot">
        <Link to="/activity" className="hc__link">
          Vezi istoricul economiilor
        </Link>
        {others > 0 && (
          <Link to="/goals" className="hc__link">
            {others === 1 ? 'Încă un obiectiv' : `Încă ${plural(others, 'obiectiv', 'obiective')}`}
          </Link>
        )}
      </div>
    </section>
  );
}

// ---------- 2. the streak: compact, kind, counted once per day ----------

/** Weeks in a row with at least one savings day; this week counts once it has one. */
function weekStreak(done: Set<string>, today: string): number {
  let n = 0;
  let start = startOfWeek(today);
  const hasDay = (from: string) => Array.from({ length: 7 }, (_, i) => addDays(from, i)).some((d) => done.has(d));
  if (!hasDay(start)) start = addDays(start, -7); // this week isn't over yet
  for (let i = 0; i < 104 && hasDay(start); i++) {
    n++;
    start = addDays(start, -7);
  }
  return n;
}

export function StreakStrip() {
  const data = useData();
  const { account, checkIn } = useStore();
  const toast = useToast();
  const joined = account?.isDemo ? '2000-01-01' : account ? toKey(new Date(account.createdAt)) : todayKey();
  const days = weekStates(data, joined);
  const streak = currentStreak(data);
  const weeks = weekStreak(actionDays(data), todayKey());
  const todayDone = days.some((d) => d.state === 'today-done');
  const savedToday = data.transactions.some((t) => t.type === 'contribution' && t.date === todayKey() && t.status !== 'failed');

  // kind words only: missing a day is never framed as failure
  const note = savedToday
    ? 'Ai economisit azi. Continuă în ritmul tău.'
    : todayDone
      ? 'Ai bifat ziua de azi. Continuă în ritmul tău.'
      : streak > 0
        ? 'Când pui ceva deoparte azi, ziua se adaugă aici.'
        : 'Ziua în care pui ceva deoparte apare aici.';

  return (
    <section className="hc streak2" data-tour="streak" aria-labelledby="streak2-title">
      <div className="streak2__head">
        <p id="streak2-title" className="streak2__count">
          <Flame size={18} aria-hidden />
          <span>
            <NumberFlow value={streak} /> {streak === 1 ? 'zi la rând' : 'zile la rând'}
          </span>
        </p>
        {!todayDone && (
          <button
            type="button"
            className="streak2__btn"
            onClick={() => {
              checkIn();
              toast('Ziua de azi e bifată.');
            }}
          >
            Bifează azi
          </button>
        )}
      </div>
      {weeks > 1 && <p className="streak2__weeks">{plural(weeks, 'săptămână', 'săptămâni')} la rând cu economii</p>}

      <p className="streak2__label">Săptămâna aceasta</p>
      <ol className="streak2__week">
        {days.map((d, i) => {
          const done = d.state === 'done' || d.state === 'today-done';
          const now = d.key === todayKey();
          const said = done ? 'bifată' : now ? 'azi, încă nebifată' : d.state === 'future' ? 'urmează' : d.state === 'paused' ? 'pe sloi de gheață' : 'fără economii';
          return (
            <li key={d.key} className={`streak2__day is-${d.state} ${now ? 'is-now' : ''}`} aria-label={`${WEEKDAY_NAME[i]}: ${said}`}>
              <span className="streak2__w" aria-hidden>
                {WEEKDAY_SHORT[i]}
              </span>
              <span className="streak2__dot" aria-hidden>
                {done && <Check size={10} strokeWidth={3.2} />}
              </span>
            </li>
          );
        })}
      </ol>

      <p className="streak2__note">{note}</p>
    </section>
  );
}
