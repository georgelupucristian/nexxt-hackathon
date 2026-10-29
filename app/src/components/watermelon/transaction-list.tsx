// Adapted from Watermelon UI "Transaction List" (ui.watermelon.sh/animated-components/transaction-list):
// the same swap between the list and one opened entry, with the icon, name, meta line and amount
// morphing between the two through shared layout ids and the panel's height following along.
// Changes: it reads Kip's own Transaction objects (goal colour, Romanian copy, statuses), rows are
// real buttons, Esc and the close button collapse it and give the focus back to the row, and the
// height comes from a ResizeObserver instead of react-use-measure. Styles live in styles/txlist.css.
import { Deposit, Withdraw } from '@/lib/icons';
import { AnimatePresence, motion, MotionConfig, useReducedMotion, type Transition } from 'motion/react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { txStatusText, useToast } from '@/components/ui';
import { sortTx } from '@/data/selectors';
import { useData, useStore } from '@/data/store';
import type { Goal, Transaction } from '@/data/types';
import { formatDay, formatLong } from '@/lib/dates';
import { goalLook } from '@/lib/goalLook';
import { ArrowCounterClockwise, ArrowRight, X } from '@/lib/icons';
import { formatLei } from '@/lib/money';

const spring: Transition = { type: 'spring', bounce: 0, duration: 0.55 };
const fade: Transition = { duration: 0.4, ease: [0.19, 1, 0.22, 1] };

/** Height of an element, kept up to date with a ResizeObserver (what react-use-measure did). */
function useHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setHeight(el.offsetHeight);
    const watch = new ResizeObserver(() => setHeight(el.offsetHeight));
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, height] as const;
}

interface Row {
  tx: Transaction;
  goal: Goal | null;
  isIn: boolean;
  title: string;
  /** where the money went; it gives way (ellipsis) before the day does */
  where: string;
  day: string;
  amount: string;
  /** the goal's bold colour; unassigned money gets the neutral tile */
  tile: string;
}

function toRow(tx: Transaction, goals: Map<string, Goal>): Row {
  const goal = tx.goalId ? goals.get(tx.goalId) ?? null : null;
  const isIn = tx.type === 'contribution';
  return {
    tx,
    goal,
    isIn,
    title: tx.note || (isIn ? 'Deposit' : 'Withdrawal'),
    where: goal ? goal.name : 'No goal',
    day: formatDay(tx.date),
    amount: formatLei(isIn ? tx.amount : -tx.amount, { sign: true }),
    tile: goal ? goalLook(goal).fill : 'var(--surface-3)',
  };
}

export function KipTransactionList({ transactions, max = 4 }: { transactions: Transaction[]; max?: number }) {
  const data = useData();
  const osReduced = useReducedMotion();
  const reduce = !!osReduced || data.prefs.reduceMotion;
  // layout ids must be unique per list, or two lists on one screen would morph into each other
  const uid = useId();
  const [panel, height] = useHeight<HTMLDivElement>();
  const [open, setOpen] = useState<string | null>(null);
  // undo: a deposit or withdrawal you typed in can be taken back, after one "are you sure" tap
  const { deleteTransaction } = useStore();
  const toast = useToast();
  const [undoing, setUndoing] = useState<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const closeRef = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<string | null>(null);

  const rows = useMemo(() => {
    const goals = new Map(data.goals.map((g) => [g.id, g]));
    return sortTx(transactions)
      .slice(0, max)
      .map((t) => toRow(t, goals));
  }, [transactions, max, data.goals]);
  // an entry that's gone (deleted, or pushed past `max`) simply closes
  const selected = open ? rows.find((r) => r.tx.id === open) ?? null : null;
  const selectedId = selected?.tx.id ?? null;

  // keyboard: the close button takes the focus on open; on close it goes back to the row
  useEffect(() => {
    if (selectedId) {
      closeRef.current?.focus({ preventScroll: true });
    } else if (returnTo.current) {
      rowRefs.current.get(returnTo.current)?.focus({ preventScroll: true });
      returnTo.current = null;
    }
  }, [selectedId]);

  const collapse = () => {
    returnTo.current = open;
    setOpen(null);
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selected) {
      e.stopPropagation();
      collapse();
    }
  };

  const id = (part: string, txId: string) => `${uid}-${part}-${txId}`;

  return (
    <MotionConfig transition={spring} reducedMotion={reduce ? 'always' : 'user'}>
      <motion.section className="txl" aria-label="Recent activity" animate={{ height: height > 0 ? height : 'auto' }} onKeyDown={onKeyDown}>
        <div className="txl__inner" ref={panel}>
          <AnimatePresence mode="popLayout" initial={false}>
            {!selected ? (
              <motion.div key="list" className="txl__list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                <div className="txl__head">
                  <h2 className="txl__title">Recent activity</h2>
                  <Link to="/activity" className="txl__all">
                    See all
                    <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
                  </Link>
                </div>

                {rows.length === 0 ? (
                  <p className="txl__empty">Nothing here yet. Your first deposit shows up here.</p>
                ) : (
                  <ul className="txl__rows">
                    {rows.map((r) => (
                      <li key={r.tx.id}>
                        <button
                          type="button"
                          className={`txl__row txl__row--${r.tx.status}`}
                          ref={(el) => {
                            if (el) rowRefs.current.set(r.tx.id, el);
                            else rowRefs.current.delete(r.tx.id);
                          }}
                          onClick={() => setOpen(r.tx.id)}
                        >
                          <motion.span layoutId={id('icon', r.tx.id)} className="txl__icon" style={{ background: r.tile, borderRadius: 20 }}>
                            {r.isIn ? <Deposit size={20} aria-hidden /> : <Withdraw size={20} aria-hidden />}
                          </motion.span>
                          <span className="txl__body">
                            <motion.span layoutId={id('name', r.tx.id)} className="txl__name">
                              {r.title}
                            </motion.span>
                            <motion.span layoutId={id('meta', r.tx.id)} className="txl__meta">
                              <span className="txl__where">{r.where}</span>
                              <span className="txl__day"> · {r.day}</span>
                            </motion.span>
                          </span>
                          <span className="txl__end">
                            <motion.span layoutId={id('amount', r.tx.id)} className={`txl__amount ${r.isIn ? 'is-in' : 'is-out'}`}>
                              {r.amount}
                            </motion.span>
                            {/* a word only when it changes what the amount means */}
                            {r.tx.status === 'pending' && <span className="txl__status is-pending">Pending</span>}
                            {r.tx.status === 'failed' && <span className="txl__status is-failed">Failed</span>}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </motion.div>
            ) : (
              <motion.div key={`open-${selected.tx.id}`} className="txl__open" role="group" aria-label={`Details: ${selected.title}`} exit={{ opacity: 0 }} transition={fade}>
                <div className="txl__open-top">
                  <motion.span layoutId={id('icon', selected.tx.id)} className="txl__icon txl__icon--big" style={{ background: selected.tile, borderRadius: 16 }}>
                    {selected.isIn ? <Deposit size={26} aria-hidden /> : <Withdraw size={26} aria-hidden />}
                  </motion.span>
                  <button ref={closeRef} type="button" className="txl__close" aria-label="Close details" onClick={collapse}>
                    <X size={16} strokeWidth={2.2} aria-hidden />
                  </button>
                </div>

                <div className="txl__open-head">
                  <div className="txl__body">
                    <motion.span layoutId={id('name', selected.tx.id)} className="txl__name txl__name--big">
                      {selected.title}
                    </motion.span>
                    <motion.span layoutId={id('meta', selected.tx.id)} className="txl__meta">
                      <span className="txl__where">{selected.where}</span>
                      <span className="txl__day"> · {selected.day}</span>
                    </motion.span>
                  </div>
                  <motion.span
                    layoutId={id('amount', selected.tx.id)}
                    className={`txl__amount txl__amount--big ${selected.isIn ? 'is-in' : 'is-out'} ${selected.tx.status === 'failed' ? 'is-failed' : ''}`}
                  >
                    {selected.amount}
                  </motion.span>
                </div>

                <motion.div className="txl__details" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ ...fade, delay: 0.1 }}>
                  <hr className="txl__rule" />
                  <dl className="txl__facts">
                    <div>
                      <dt>Date</dt>
                      <dd className="txl__date">{formatLong(selected.tx.date)}</dd>
                    </div>
                    <div>
                      <dt>Status</dt>
                      <dd className={`txl__state is-${selected.tx.status}`}>{txStatusText(selected.tx)}</dd>
                    </div>
                    <div>
                      <dt>{selected.isIn ? 'For' : 'Taken from'}</dt>
                      <dd>{selected.goal ? selected.goal.name : 'No goal'}</dd>
                    </div>
                    {selected.tx.note && (
                      <div>
                        <dt>Note</dt>
                        <dd>{selected.tx.note}</dd>
                      </div>
                    )}
                  </dl>
                  <hr className="txl__rule" />
                  <div className="txl__actions">
                    <Link to={`/activity/${selected.tx.id}`} className="txl__more">
                      See details
                      <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
                    </Link>
                    {selected.tx.source === 'manual' &&
                      (undoing === selected.tx.id ? (
                        <span className="txl__confirm">
                          <button type="button" className="txl__undo txl__undo--sure" onClick={() => {
                            try {
                              deleteTransaction(selected.tx.id);
                              toast(selected.isIn ? 'Deposit undone.' : 'Withdrawal undone.');
                              setUndoing(null);
                              setOpen(null);
                            } catch (e) {
                              toast((e as Error).message, 'error');
                            }
                          }}>
                            Yes, undo
                          </button>
                          <button type="button" className="txl__undo" onClick={() => setUndoing(null)}>
                            No
                          </button>
                        </span>
                      ) : (
                        <button type="button" className="txl__undo" onClick={() => setUndoing(selected.tx.id)}>
                          <ArrowCounterClockwise size={15} aria-hidden />
                          {selected.isIn ? 'Undo deposit' : 'Undo withdrawal'}
                        </button>
                      ))}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.section>
    </MotionConfig>
  );
}
