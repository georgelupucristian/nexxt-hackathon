// The goal card: the top of Watermelon UI "Widget 7" (ui.watermelon.sh/block/widget-7), the label
// with the eye, the picker pill (a goal instead of a currency) and the big balance, over the chunky
// segmented progress of Watermelon UI "Widget 2" (ui.watermelon.sh/block/widget-2).
import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Eye, EyeOff, Flag } from '@/lib/icons';
import { GoalTile } from '../domain';
import { useCelebrate } from '../mascot/Celebration';
import { activeGoals, goalSaved, periodDays, progress, projectedFinish } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { daysBetween, toKey, todayKey } from '../../lib/dates';
import { formatLei } from '../../lib/money';
import { goalLook } from '../../lib/goalLook';

const QUARTERS = [
  { at: 1, line: 'You saved it all. Goal reached!' },
  { at: 0.75, line: 'Three quarters of the way. The finish is in sight.' },
  { at: 0.5, line: 'Halfway there. The rest is easier.' },
  { at: 0.25, line: 'A quarter of the way. Starting is the hardest part.' },
  { at: 0, line: '' },
];

/** What you put aside per day: the plan spread over its days, or your real average if it's flexible. */
function perDay(goal: Goal, saved: number): number {
  if (goal.plan.frequency !== 'flexible' && goal.plan.amount > 0) return Math.round(goal.plan.amount / periodDays(goal.plan) / 100) * 100;
  const days = Math.max(1, daysBetween(toKey(new Date(goal.createdAt)), todayKey()));
  return Math.round(saved / days / 100) * 100;
}

export function FundsCard({ goal: primary }: { goal: Goal }) {
  const data = useData();
  const { setPrefs } = useStore();
  const celebrate = useCelebrate();
  const goals = activeGoals(data.goals);
  const [pickedId, setPickedId] = useState(primary.id);
  const goal = goals.find((g) => g.id === pickedId) ?? primary;
  const [open, setOpen] = useState(false);
  const picker = useRef<HTMLDivElement>(null);
  const hidden = data.prefs.hideBalance;

  const saved = goalSaved(data.transactions, goal.id);
  const pct = progress(saved, goal.target);
  const daily = perDay(goal, saved);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => picker.current && !picker.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  // a new quarter crossed while you're here (not on first load): one short celebration
  const quarter = QUARTERS.find((q) => pct >= q.at)!;
  const seen = useRef<{ id: string; at: number } | null>(null);
  useEffect(() => {
    const prev = seen.current;
    seen.current = { id: goal.id, at: quarter.at };
    if (prev && prev.id === goal.id && quarter.at > prev.at && quarter.line) {
      const tm = window.setTimeout(() => celebrate({ title: `${Math.round(quarter.at * 100)}% of ${goal.name}`, sub: quarter.line }), 2900);
      return () => window.clearTimeout(tm);
    }
  }, [goal.id, goal.name, quarter, celebrate]);

  // when you'd get there: the target date, else the plan's projected finish
  const finish = goal.targetDate ?? projectedFinish(goal.plan, saved, goal.target);
  const TICKS = 46;
  const litTicks = Math.round(pct * TICKS);

  return (
    <section className="wm7" data-tour="vault" aria-labelledby="wm7-label">
      <div className="wm7__head">
        <button type="button" id="wm7-label" className="wm7__label" onClick={() => setPrefs({ hideBalance: !hidden })} aria-label={hidden ? 'Show amount' : 'Hide amount'}>
          Saved
          {hidden ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
        </button>

        <div className="wm7__picker" ref={picker}>
          <button type="button" className="wm7__pick" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open}>
            <span className="truncate">{goal.name}</span>
            <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="wm7__chev">
              <ChevronDown size={13} aria-hidden />
            </motion.span>
          </button>
          <AnimatePresence>
            {open && (
              <motion.ul
                role="listbox"
                aria-label="Choose a goal"
                className="wm7__menu"
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
              >
                {goals.map((g) => (
                  <li key={g.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={g.id === goal.id}
                      onClick={() => {
                        setPickedId(g.id);
                        setOpen(false);
                      }}
                    >
                      <GoalTile goal={g} size={22} />
                      <span className="truncate">{g.name}</span>
                      {g.id === goal.id && <Check size={13} aria-hidden />}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="wm7__balance money">
        <motion.span key={goal.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="wm7__num">
          {hidden ? '••••' : <NumberFlow value={saved / 100} locales="en-GB" format={{ maximumFractionDigits: 0 }} />}
        </motion.span>
        <span className="wm7__unit">lei</span>
      </div>

      {/* The meter from Watermelon UI "Credit Usage Card" (ui.watermelon.sh/animated-components/credit-usage-card):
          a row of thin ticks that fill up to where you are, the current one taller, the goal at the end */}
      <div className="meter" data-tour="goal" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={`${goal.name}: ${Math.round(pct * 100)}%`}>
        <div className="meter__ticks">
          {Array.from({ length: TICKS }, (_, i) => {
            const on = i < litTicks;
            const now = i === Math.max(0, litTicks - 1) && pct > 0 && pct < 1;
            return (
              <motion.i
                key={`${goal.id}-${i}`}
                className={`${on ? 'is-on' : ''} ${now ? 'is-now' : ''}`}
                style={on ? { background: `color-mix(in oklab, #f2830d ${100 - (i / TICKS) * 55}%, #ffb020)` } : undefined}
                initial={{ scaleY: 0.3, opacity: 0.4 }}
                animate={{ scaleY: 1, opacity: 1 }}
                transition={{ delay: 0.15 + i * 0.012, duration: 0.25 }}
              />
            );
          })}
        </div>
        <span className="meter__flag" aria-hidden>
          <Flag size={16} />
        </span>
      </div>
      <div className="meter__scale">
        <span>
          <b>{Math.round(pct * 100)}%</b> of {formatLei(goal.target)}
        </span>
        <span>{finish ? `done by ${new Date(`${finish}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}</span>
      </div>

      {/* the figures row from Watermelon UI "Budget Card": what's in, what's left, the pace */}
      <dl className="figs">
        <div>
          <dt>Saved</dt>
          <dd className="money">{hidden ? '••••' : formatLei(saved)}</dd>
        </div>
        <div>
          <dt>Left</dt>
          <dd className="money">{hidden ? '••••' : formatLei(Math.max(0, goal.target - saved))}</dd>
        </div>
        <div>
          <dt>Your pace</dt>
          <dd className="figs__pace">{daily > 0 ? `+${formatLei(daily)}/day` : 'free'}</dd>
        </div>
      </dl>

      {/* and Budget Card's breakdown: all your savings, split by goal colour */}
      {goals.length > 1 && <Breakdown />}
    </section>
  );
}

/** Every goal's share of what you've saved, as Budget Card's coloured breakdown bars. */
function Breakdown() {
  const data = useData();
  const goals = activeGoals(data.goals);
  const parts = goals.map((g) => ({ g, v: goalSaved(data.transactions, g.id) })).filter((p) => p.v > 0);
  const total = parts.reduce((s, p) => s + p.v, 0);
  if (!total) return null;
  return (
    <div className="split" aria-label="Where your savings are">
      <div className="split__bars" aria-hidden>
        {parts.map(({ g, v }) => (
          <motion.span key={g.id} style={{ background: goalLook(g).fill }} initial={{ flexGrow: 0 }} animate={{ flexGrow: v / total }} transition={{ type: 'spring', stiffness: 120, damping: 20, delay: 0.3 }} />
        ))}
      </div>
      <ul className="split__legend">
        {parts.map(({ g, v }) => (
          <li key={g.id}>
            <i style={{ background: goalLook(g).fill }} aria-hidden />
            <span className="truncate">{g.name}</span>
            <b className="money">{formatLei(v)}</b>
          </li>
        ))}
      </ul>
    </div>
  );
}
