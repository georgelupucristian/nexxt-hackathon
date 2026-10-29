import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, Flag, PiggyBank, Plus } from '@/lib/icons';
import { GoalTile } from '../domain';
import { MoneyStatusLine, RealSaveSheet } from '../money';
import { SaveSheet } from '../MoneySheets';
import { SharedGoalRows } from '../social/SharedGoalLinks';
import { activeGoals, goalSaved, paidToday, projectedFinish } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { daysBetween, todayKey } from '../../lib/dates';
import { goalLook } from '../../lib/goalLook';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/plural';

/**
 * Goals, after Copilot's goals tab: a summary card (saved so far on the left, still to go on the
 * right, the ring of overall progress between them with Kip in it), then the active goals as
 * rows with their own colour, a thin bar, the time left and the date.
 */

function timeLeft(goal: Goal, saved: number, doneToday: boolean): { left: string; date: string | null } {
  const end = goal.targetDate ?? projectedFinish(goal.plan, saved, goal.target, undefined, doneToday);
  if (saved >= goal.target) return { left: 'Goal reached', date: null };
  if (goal.status === 'paused') return { left: 'Paused', date: null };
  if (!end) return { left: 'No date', date: null };
  const days = daysBetween(todayKey(), end);
  const months = Math.round(days / 30.44);
  const left = days <= 0 ? 'Date passed' : months >= 1 ? `${plural(months, 'month', 'months')}` : `${plural(days, 'day', 'days')}`;
  return { left, date: new Date(`${end}T12:00:00`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) };
}

/** The plan in a few words for the goal's row: "150 lei a week". */
function planShort(goal: Goal): string {
  if (goal.plan.frequency === 'flexible' || goal.plan.amount <= 0) return 'Save when you can';
  return `${formatLei(goal.plan.amount)} ${goal.plan.frequency === 'weekly' ? 'a week' : 'a month'}`;
}

export function GoalsCard() {
  const data = useData();
  const goals = activeGoals(data.goals);
  const hidden = data.prefs.hideBalance;
  const [open, setOpen] = useState(true);

  // The ring shows overall progress (the rows below give each goal's own numbers), so the two
  // figures say things the rows don't: what you put away this month, and what a day takes to land
  // on time.
  const savedGoals = goals.reduce((sum, g) => sum + Math.min(goalSaved(data.transactions, g.id), g.target), 0);
  const targetGoals = goals.reduce((sum, g) => sum + g.target, 0);
  const pct = targetGoals > 0 ? Math.min(1, savedGoals / targetGoals) : 0;
  const month = todayKey().slice(0, 7);
  const savedMonth = data.transactions
    // what was already saved before Kip isn't this month's saving
    .filter((t) => t.type === 'contribution' && t.status === 'confirmed' && t.date.startsWith(month) && t.note !== 'What you already had')
    .reduce((sum, t) => sum + t.amount, 0);
  const perDay = goals.reduce((sum, g) => {
    const left = Math.max(0, g.target - goalSaved(data.transactions, g.id));
    const end = g.targetDate ?? projectedFinish(g.plan, goalSaved(data.transactions, g.id), g.target, undefined, paidToday(data.transactions, g.id));
    if (!left || !end) return sum;
    return sum + left / Math.max(1, daysBetween(todayKey(), end));
  }, 0);
  const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long' });
  const R = 44;
  const C = 2 * Math.PI * R;

  return (
    <section className="cop" aria-labelledby="cop-title">
      <h2 id="cop-title" className="sr-only">
        Your goals
      </h2>
      <div className="cop__sum" data-tour="vault">
        <div className="cop__stat">
          <b className="money">{hidden ? '••••' : <NumberFlow value={savedMonth / 100} locales="en-GB" format={{ maximumFractionDigits: 0 }} suffix=" lei" />}</b>
          <span>saved in {monthLabel}</span>
        </div>
        <div className="cop__ring" data-tour="goal" role="img" aria-label={`${Math.round(pct * 100)}% of your goals`}>
          <svg viewBox="0 0 100 100" aria-hidden>
            <defs>
              <linearGradient id="cop-grad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#ffd27a" />
                <stop offset="100%" stopColor="#ffb020" />
              </linearGradient>
            </defs>
            {/* the track: a soft band with small gauge ticks on it */}
            <circle cx="50" cy="50" r={R} className="cop__track" />
            <circle cx="50" cy="50" r={R} className="cop__ticks" />
            <motion.circle
              cx="50"
              cy="50"
              r={R}
              className="cop__fill"
              stroke="url(#cop-grad)"
              strokeDasharray={C}
              transform="rotate(-90 50 50)"
              initial={{ strokeDashoffset: C }}
              animate={{ strokeDashoffset: C * (1 - pct) }}
              transition={{ type: 'spring', stiffness: 50, damping: 16, delay: 0.2 }}
            />
            {/* a white cap where the progress ends */}
            {pct > 0.02 && pct < 1 && (
              <motion.circle
                cx={50 + R * Math.sin(pct * 2 * Math.PI)}
                cy={50 - R * Math.cos(pct * 2 * Math.PI)}
                r="4.2"
                className="cop__cap"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
                transition={{ delay: 1.1, type: 'spring', stiffness: 400, damping: 18 }}
              />
            )}
          </svg>
          {/* Kip inside the ring, framed like an avatar (his one appearance on home besides the menu button) */}
          <span className="cop__kip" aria-hidden>
            <img src="/mascot/pose-cool.webp" alt="" />
          </span>
        </div>
        {/* a pace needs an end date; without one (no deadline, no fixed plan), what's left instead */}
        <div className="cop__stat cop__stat--end">
          {perDay > 0 ? (
            <>
              <b className="money"><NumberFlow value={Math.ceil(perDay / 100)} locales="en-GB" suffix=" lei" /></b>
              <span>a day to get there on time</span>
            </>
          ) : targetGoals - savedGoals > 0 ? (
            <>
              <b className="money">{hidden ? '••••' : <NumberFlow value={Math.ceil((targetGoals - savedGoals) / 100)} locales="en-GB" suffix=" lei" />}</b>
              <span>left to reach your target</span>
            </>
          ) : (
            <>
              <b>Done</b>
              <span>{goals.length > 1 ? 'all goals reached' : 'goal reached'}</span>
            </>
          )}
        </div>
      </div>

      <div className="cop__head">
        <button type="button" className="cop__toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <motion.span animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.18 }} className="cop__caret">
            <ChevronDown size={14} aria-hidden />
          </motion.span>
          Goals
          <span className="cop__count">{goals.length}</span>
        </button>
        {/* the way to start another goal, right where the goals are */}
        <Link to="/goals/new" className="cop__new">
          <Plus size={16} aria-hidden /> New goal
        </Link>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul className="cop__list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }}>
            {goals.map((g) => {
              const saved = goalSaved(data.transactions, g.id);
              const p = g.target > 0 ? Math.min(1, saved / g.target) : 0;
              const { left, date } = timeLeft(g, saved, paidToday(data.transactions, g.id));
              return (
                <li key={g.id}>
                  <Link to={`/goals/${g.id}`} className="cop__goal">
                    <div className="cop__line">
                      <GoalTile goal={g} size={30} />
                      <span className="cop__name truncate">{g.name}</span>
                      <span className="cop__amt money">
                        <b>{hidden ? '••••' : formatLei(saved)}</b> / {formatLei(g.target)}
                      </span>
                    </div>
                    <span className="cop__bar" aria-hidden>
                      <motion.i style={{ background: goalLook(g).deep }} initial={{ width: 0 }} animate={{ width: `${Math.max(p * 100, p > 0 ? 1.5 : 0)}%` }} transition={{ type: 'spring', stiffness: 70, damping: 18 }} />
                    </span>
                    <div className="cop__meta">
                      <span className="cop__plan">{planShort(g)}</span>
                      <span className="cop__date">
                        {date && <Flag size={13} aria-hidden />} {left}
                        {date ? ` · ${date}` : ''}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
            <SharedGoalRows />
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

/** The one main action, and the small sheet it opens. */
export function SaveButton() {
  const [open, setOpen] = useState(false);
  const { money } = useStore();
  return (
    <>
      <motion.button type="button" className="savebtn savebtn--fun" data-tour="save" whileTap={{ scale: 0.97 }} onClick={() => setOpen(true)}>
        <span className="savebtn__pig" aria-hidden>
          <PiggyBank size={24} weight="fill" />
        </span>
        <span className="savebtn__label">Save money</span>
        <span className="savebtn__plusmini" aria-hidden>
          <Plus size={16} />
        </span>
      </motion.button>
      {/* a Supabase account moves real (Stripe test) money; the local and demo ones record it */}
      {money ? <RealSaveSheet open={open} onClose={() => setOpen(false)} /> : <SaveSheet open={open} onClose={() => setOpen(false)} />}
      <MoneyStatusLine />
    </>
  );
}
