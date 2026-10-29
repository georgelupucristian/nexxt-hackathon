import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion, type PanInfo } from 'motion/react';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, Plus } from '@/lib/icons';
import { useCelebrate } from '../mascot/Celebration';
import { useToast } from '../ui';
import { goalSaved, projectedFinish } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { daysBetween, formatDate, todayKey } from '../../lib/dates';
import { formatLei, parseLei } from '../../lib/money';
import { plural } from '../../lib/plural';

/** Just the noun of a count, agreeing with n: "week", "weeks". */
const unit = (n: number, one: string, other: string) => plural(n, one, other).replace(/^\S+ /, '');

const spring = { type: 'spring', stiffness: 240, damping: 20, mass: 1.05 } as const;

/**
 * "Record savings" that opens in place. Adapted from Watermelon UI "Morphing Button"
 * (ui.watermelon.sh/animated-components/morphing-button): the button grows into an amount field
 * with quick picks, so recording takes one tap and a number instead of a full sheet.
 */
export function QuickRecord({ goal, primary }: { goal: Goal | null; primary: boolean }) {
  const data = useData();
  const { addTransaction } = useStore();
  // you choose where the money goes; the primary goal is only the starting suggestion
  const choices = data.goals.filter((g) => g.status === 'active');
  const [target, setTarget] = useState<string | null>(goal?.id ?? null);
  const chosen = choices.find((g) => g.id === target) ?? null;
  const celebrate = useCelebrate();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [raw, setRaw] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const picks = [...new Set([chosen?.plan.amount || 0, 25_00, 50_00, 100_00].filter((v) => v > 0))].slice(0, 3);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const away = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  function save(amount: number | null) {
    if (!amount || amount <= 0) {
      toast('Type an amount, for example 50.', 'error');
      return;
    }
    try {
      addTransaction({ type: 'contribution', amount, goalId: chosen?.id ?? null, date: todayKey(), note: '' });
      celebrate({ title: `+${formatLei(amount)} saved`, sub: chosen ? `Added to ${chosen.name}.` : 'Saved, no goal.' });
      setRaw('');
      setOpen(false);
    } catch (e) {
      toast((e as Error).message, 'error');
    }
  }

  return (
    <motion.div ref={box} layout transition={spring} style={{ borderRadius: 16 }} className={`qr ${open ? 'qr--open' : ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        {open && (
          <motion.div key="field" className="qr__field" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={spring}>
            <div className="qr__input">
              <input
                ref={input}
                inputMode="decimal"
                placeholder="0"
                value={raw}
                aria-label="Amount saved, in lei"
                onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') save(parseLei(raw));
                  if (e.key === 'Escape') setOpen(false);
                }}
              />
              <span>lei</span>
            </div>
            <div className="qr__goals" role="radiogroup" aria-label="Where the money goes">
              {choices.map((g) => (
                <button key={g.id} type="button" role="radio" aria-checked={target === g.id} className="qr__goal" onClick={() => setTarget(g.id)}>
                  {g.name}
                </button>
              ))}
              <button type="button" role="radio" aria-checked={target === null} className="qr__goal" onClick={() => setTarget(null)}>
                No goal
              </button>
            </div>
            <div className="qr__picks">
              {picks.map((p) => (
                <motion.button key={p} type="button" className="qr__pick" whileTap={{ scale: 0.92 }} onClick={() => save(p)}>
                  {formatLei(p)}
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <motion.button
        layout
        type="button"
        transition={spring}
        whileTap={{ scale: 0.96 }}
        className={`btn ${primary || open ? 'btn--primary' : 'btn--secondary'} qr__btn`}
        onClick={() => (open ? save(parseLei(raw)) : setOpen(true))}
        aria-expanded={open}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={open ? 'ok' : 'add'} initial={{ opacity: 0, scale: 0.4, filter: 'blur(4px)' }} animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, scale: 0.4 }} transition={spring} className="qr__icon">
            {open ? <Check size={18} aria-hidden /> : <Plus size={18} aria-hidden />}
          </motion.span>
        </AnimatePresence>
        <motion.span layout="position">{open ? 'Save' : 'Add savings'}</motion.span>
      </motion.button>
    </motion.div>
  );
}

/**
 * "What if I saved…?" Adapted from Watermelon UI "Returns Calculator Snippet"
 * (ui.watermelon.sh/animated-components/returns-calculator-snippet): drag the slider and the
 * finish date, the time left and the saved/left donut update live. One tap applies the plan.
 */
export function PlanSimulator({ goal }: { goal: Goal }) {
  const data = useData();
  const { updatePlan } = useStore();
  const toast = useToast();
  const saved = goalSaved(data.transactions, goal.id);
  const left = Math.max(0, goal.target - saved);
  const weekly = goal.plan.frequency !== 'monthly';
  const current = goal.plan.amount > 0 ? goal.plan.amount : weekly ? 50_00 : 200_00;
  const [amount, setAmount] = useState(current);
  const min = weekly ? 10_00 : 40_00;
  const max = weekly ? 500_00 : 2_000_00;
  const step = weekly ? 5_00 : 20_00;

  const plan = { amount, frequency: weekly ? ('weekly' as const) : ('monthly' as const), day: goal.plan.day ?? (weekly ? 4 : 1) };
  const finish = projectedFinish(plan, saved, goal.target);
  const nowFinish = goal.plan.frequency !== 'flexible' && goal.plan.amount > 0 ? projectedFinish(goal.plan, saved, goal.target) : null;
  const periods = amount > 0 ? Math.ceil(left / amount) : 0;
  const shift = finish && nowFinish ? Math.round(daysBetween(finish, nowFinish) / 7) : 0;
  const lateBy = finish && goal.targetDate ? Math.round(daysBetween(goal.targetDate, finish) / 7) : null;


  return (
    <section className="grp sim" aria-labelledby="sim-title">
      <div className="grp__head">
        <h2 id="sim-title" className="grp__title">
          Projection
        </h2>
        <span className="grp__aside truncate">{goal.name}</span>
      </div>
      <div className="sim__slider">
        <div className="sim__row">
          <span className="small muted">{weekly ? 'Per week' : 'Per month'}</span>
          <strong className="money">
            <NumberFlow value={amount / 100} locales="en-GB" format={{ maximumFractionDigits: 0 }} suffix=" lei" />
          </strong>
        </div>
        <input type="range" min={min} max={max} step={step} value={amount} onChange={(e) => setAmount(+e.target.value)} aria-label={weekly ? 'Amount per week' : 'Amount per month'} style={{ ['--p' as string]: `${((amount - min) / (max - min)) * 100}%` }} />
      </div>
      <div className="sim__top">
        <dl className="sim__out">
          <div>
            <dt>You reach the target</dt>
            <dd className="sim__big">{finish ? formatDate(finish) : 'Not known yet'}</dd>
          </div>
          <div>
            <dt>Time left</dt>
            <dd>
              <NumberFlow value={periods} /> {weekly ? unit(periods, 'week', 'weeks') : unit(periods, 'month', 'months')}
            </dd>
          </div>
          {nowFinish && shift !== 0 && (
            <div>
              <dt>Compared to now</dt>
              <dd className={shift > 0 ? 'good' : 'warn'}>
                <NumberFlow value={Math.abs(shift)} /> {unit(Math.abs(shift), 'week', 'weeks')} {shift > 0 ? 'sooner' : 'later'}
              </dd>
            </div>
          )}
        </dl>
      </div>
      {lateBy !== null && lateBy > 0 && <p className="small warn-text">You still land {plural(lateBy, 'week', 'weeks')} after the target date.</p>}
      <AnimatePresence>
        {amount !== goal.plan.amount && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
              onClick={() => {
                updatePlan(goal.id, plan);
                toast(`Plan updated: ${formatLei(amount)} ${weekly ? 'a week' : 'a month'}.`);
              }}
            >
              Pick {formatLei(amount)} {weekly ? 'a week' : 'a month'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/**
 * Goals as a stack you flick through. Adapted from Watermelon UI "Card Swipe"
 * (ui.watermelon.sh/animated-components/card-swipe): velocity-aware drag, the next card waiting
 * underneath, dots for position. One goal shows as a single card.
 */
export function GoalStack({ goals, render }: { goals: Goal[]; render: (g: Goal) => ReactNode }) {
  const [i, setI] = useState(0);
  const ordered = useMemo(() => goals, [goals]);
  if (ordered.length <= 1) return <>{ordered[0] ? render(ordered[0]) : null}</>;
  const n = ordered.length;
  const top = ordered[i % n];
  const next = ordered[(i + 1) % n];

  const onEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -500) setI((v) => (v + 1) % n);
    else if (info.offset.x > 70 || info.velocity.x > 500) setI((v) => (v - 1 + n) % n);
  };

  return (
    <div className="stack3" aria-roledescription="carousel" aria-label="Your goals">
      <div className="stack3__deck">
        <div className="stack3__under" aria-hidden>
          {render(next)}
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={top.id}
            className="stack3__top"
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragEnd={onEnd}
            initial={{ scale: 0.96, y: 10, opacity: 0.6 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ x: -260, opacity: 0, rotate: -6, transition: { duration: 0.22 } }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
            whileDrag={{ rotate: 1.5, cursor: 'grabbing' }}
          >
            {render(top)}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="stack3__dots">
        {ordered.map((g, k) => (
          <button key={g.id} type="button" aria-label={`Show ${g.name}`} aria-current={k === i % n || undefined} onClick={() => setI(k)} />
        ))}
        <span className="small muted">Swipe for your other goals</span>
      </div>
    </div>
  );
}
