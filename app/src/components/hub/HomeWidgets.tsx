import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { Link } from 'react-router-dom';
import { Flame } from '@/lib/icons';
import { useToast } from '../ui';
import { QuickRecord } from './Playful';
import type { SealState } from '../mascot/Seal';
import { breakdown, currentStreak, goalSaved, periodDays, weekStates } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { daysBetween, todayKey, toKey, WEEKDAY_NAME } from '../../lib/dates';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/ro';

/**
 * The three things home leads with, in this order: the streak, how close the main goal is, and
 * what happened lately. Smaller things below them are circles rather than tiles.
 */

// ---------- 1. the streak, as a ring of this week's seven days ----------

const RING_R = 70;
const RING_GAP = 6; // degrees between day arcs

function arc(i: number): string {
  const a0 = ((i * 360) / 7 + RING_GAP / 2 - 90) * (Math.PI / 180);
  const a1 = (((i + 1) * 360) / 7 - RING_GAP / 2 - 90) * (Math.PI / 180);
  const p = (a: number) => `${90 + RING_R * Math.cos(a)} ${90 + RING_R * Math.sin(a)}`;
  return `M ${p(a0)} A ${RING_R} ${RING_R} 0 0 1 ${p(a1)}`;
}

export function StreakCircle() {
  const data = useData();
  const { account, checkIn } = useStore();
  const toast = useToast();
  const joined = account?.isDemo ? '2000-01-01' : account ? toKey(new Date(account.createdAt)) : todayKey();
  const days = weekStates(data, joined);
  const streak = currentStreak(data);
  const todayDone = days.some((d) => d.state === 'today-done');

  return (
    <div className="streak-orb" data-tour="streak">
      <p className="streak-orb__title">
        <Flame size={18} aria-hidden /> Streak
      </p>
      <button
        type="button"
        className={`streak-orb__ring ${todayDone ? 'is-done' : ''}`}
        onClick={() => {
          if (todayDone) return;
          checkIn();
          toast('Ziua de azi e bifată.');
        }}
        aria-label={`Streak: ${plural(streak, 'zi', 'zile')} la rând. ${todayDone ? 'Azi contează deja.' : 'Apasă ca să bifezi ziua de azi.'}`}
      >
        <svg viewBox="0 0 180 180" aria-hidden>
          {days.map((d, i) => (
            <path key={d.key} d={arc(i)} className={`streak-orb__day is-${d.state}`}>
              <title>{WEEKDAY_NAME[i]}</title>
            </path>
          ))}
        </svg>
        <span className="streak-orb__core">
          <Flame size={26} aria-hidden />
          <span className="streak-orb__num">
            <NumberFlow value={streak} />
          </span>
          <span className="streak-orb__unit">{streak === 1 ? 'zi la rând' : 'zile la rând'}</span>
        </span>
      </button>
      <p className="streak-orb__hint">{todayDone ? 'Azi contează. Ne vedem mâine.' : 'Apasă cercul ca să bifezi ziua de azi.'}</p>
    </div>
  );
}

// ---------- 2. how close the main goal is: an asteroid flying to the flag ----------

/** Kip's face follows how far along the goal is. */
function kipFor(pct: number): SealState | 'proud' | 'surprised' {
  if (pct >= 1) return 'celebrate';
  if (pct >= 0.75) return 'surprised';
  if (pct >= 0.4) return 'proud';
  if (pct >= 0.1) return 'happy';
  return 'idle';
}

/** Lei a day it takes to land on the target date, or the plan spread over its days. */
function perDay(goal: Goal, saved: number): number | null {
  const left = Math.max(0, goal.target - saved);
  if (left === 0) return null;
  if (goal.targetDate && goal.targetDate > todayKey()) return Math.ceil(left / Math.max(1, daysBetween(todayKey(), goal.targetDate)) / 100) * 100;
  if (goal.plan.frequency !== 'flexible' && goal.plan.amount > 0) return Math.ceil(goal.plan.amount / periodDays(goal.plan) / 100) * 100;
  return null;
}

export function GoalRun({ goal, onDetails, primary }: { goal: Goal; onDetails: () => void; primary: boolean }) {
  const data = useData();
  const saved = goalSaved(data.transactions, goal.id);
  const total = breakdown(data.transactions).total;
  const pct = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const daily = perDay(goal, saved);
  const at = `${Math.max(3, Math.min(97, pct * 100))}%`;
  const hidden = data.prefs.hideBalance;

  return (
    <section className="run" data-tour="vault" aria-labelledby="run-name">
      <Link to={`/goals/${goal.id}`} id="run-name" className="run__name">
        {goal.name}
      </Link>
      <span className="run__kip" aria-hidden>
        <img src={`/mascot/${kipFor(pct)}-face.webp`} alt="" />
      </span>

      <p className="run__amount money">
        {hidden ? '••••' : <NumberFlow value={saved / 100} locales="ro-RO" format={{ maximumFractionDigits: 0 }} />}
        <span> lei</span>
      </p>
      {daily !== null && (
        <p className="run__pace">
          <Flame size={16} aria-hidden /> {formatLei(daily)}/zi <span>ca să ajungi la timp</span>
        </p>
      )}

      <div className="run__track" data-tour="goal" role="img" aria-label={`${Math.round(pct * 100)}% din ${formatLei(goal.target)}`}>
        <span className="run__lane">
        <span className="run__rail" aria-hidden />
        <motion.span className="run__trail" aria-hidden initial={{ width: '0%' }} animate={{ width: at }} transition={{ type: 'spring', stiffness: 40, damping: 14, delay: 0.25 }} />
        <motion.span className="run__rock" aria-hidden initial={{ left: '0%' }} animate={{ left: at }} transition={{ type: 'spring', stiffness: 40, damping: 14, delay: 0.25 }}>
          <i />
          <i />
          <i />
        </motion.span>
        <motion.span className="run__pct" aria-hidden initial={{ left: '0%', opacity: 0 }} animate={{ left: at, opacity: 1 }} transition={{ type: 'spring', stiffness: 40, damping: 14, delay: 0.25 }}>
          {Math.round(pct * 100)}%
        </motion.span>
        </span>
        <span className="run__flag" aria-hidden>
          <svg viewBox="0 0 24 32" width="20" height="28">
            <path d="M4 2v28" />
            <path d="M5 3h14l-3.5 5 3.5 5H5z" />
          </svg>
          <b>ȚINTĂ</b>
        </span>
      </div>

      <p className="run__meta">
        <span>
          din {formatLei(goal.target)}
          {hidden ? '' : ` · ${formatLei(total)} în total`}
        </span>
        <button type="button" className="run__more" onClick={onDetails}>
          Cum se adună
        </button>
      </p>
      <QuickRecord goal={goal} primary={primary} />
    </section>
  );
}

// ---------- the smaller things, as circles ----------

export function GoalOrb({ goal }: { goal: Goal }) {
  const data = useData();
  const saved = goalSaved(data.transactions, goal.id);
  const pct = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const C = 2 * Math.PI * 44;
  return (
    <Link to={`/goals/${goal.id}`} className="orb" aria-label={`${goal.name}: ${formatLei(saved)} din ${formatLei(goal.target)}`}>
      <span className="orb__disc">
        <svg viewBox="0 0 100 100" aria-hidden>
          <circle cx="50" cy="50" r="44" className="orb__track" />
          <motion.circle cx="50" cy="50" r="44" className="orb__fill" strokeDasharray={C} transform="rotate(-90 50 50)" initial={{ strokeDashoffset: C }} animate={{ strokeDashoffset: C * (1 - pct) }} transition={{ type: 'spring', stiffness: 40, damping: 16 }} />
        </svg>
        <span className="orb__value">{Math.round(pct * 100)}%</span>
      </span>
      <span className="orb__name">{goal.name}</span>
      <span className="orb__sub">{formatLei(saved)}</span>
    </Link>
  );
}
