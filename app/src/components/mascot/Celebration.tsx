import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';
import { Flame, Target, Wallet } from '@/lib/icons';
import { currentStreak, goalSaved, primaryGoal, progress, totalSaved } from '../../data/selectors';
import { useStore } from '../../data/store';
import type { Bani, Goal, UserData } from '../../data/types';
import { goalLook } from '../../lib/goalLook';
import { plural } from '../../lib/plural';
import { Seal } from './Seal';

export interface CelebrateInput {
  title: string;
  sub?: string;
  /** The goal this moment is about. Optional: by default it's the goal the money just went to, else the main goal. */
  goalId?: string | null;
}

interface Party extends CelebrateInput {
  id: number;
  /** The data just before the action, so the tiles can count up to the new numbers. */
  before: UserData | null;
  /** A streak moment was already on screen when this was asked for: wait until it has gone. */
  held: boolean;
}

const Ctx = createContext<(p: CelebrateInput) => void>(() => undefined);

/**
 * The moment after money is recorded (or a goal is set up): a full screen in the spirit of
 * Duolingo's "lesson complete". Kip jumps, says one short line, the headline says what happened
 * and three tiles count up to where you are now. It stays until you press Continue (or Esc, or tap
 * outside), because the numbers are worth a second look.
 *
 * Still no confetti: regulators flag confetti on financial actions, and the point is to confirm
 * what happened, not to reward the tap. A few soft sparkles around Kip are all the decoration.
 *
 * Hand-off with the streak moment (StreakMoment.tsx): when a saving also grows the streak, the
 * streak moment checks for `.party` and shows itself ~2.8 s later, on top of this one. So this
 * screen steps aside the moment a `.streak-moment` appears, and the two read as one sequence. A
 * celebration asked for while the streak moment is up waits behind it and plays afterwards.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const { data } = useStore();
  // celebrate() is called in the same handler as the store update, before React re-renders, so
  // this still holds the numbers from before the saving
  const latest = useRef(data);
  useEffect(() => {
    latest.current = data;
  }, [data]);

  const [party, setParty] = useState<Party | null>(null);

  const celebrate = useCallback((p: CelebrateInput) => {
    setParty({ ...p, id: Date.now(), before: latest.current, held: document.querySelector('.streak-moment') !== null });
    navigator.vibrate?.([12, 40, 18]);
  }, []);

  const close = useCallback(() => setParty(null), []);

  const partyId = party?.id;
  const held = party?.held;
  useEffect(() => {
    if (partyId === undefined) return;
    const sync = () => {
      const streakUp = document.querySelector('.streak-moment') !== null;
      if (held && !streakUp) setParty((cur) => (cur?.id === partyId ? { ...cur, held: false } : cur));
      if (!held && streakUp) setParty((cur) => (cur?.id === partyId ? null : cur));
    };
    const watch = new MutationObserver(sync);
    watch.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => watch.disconnect();
  }, [partyId, held]);

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      <AnimatePresence>{party && !party.held && <CelebrationScreen key={party.id} party={party} onClose={close} />}</AnimatePresence>
    </Ctx.Provider>
  );
}

export const useCelebrate = () => useContext(Ctx);

// ---------- numbers ----------

interface Stats {
  total: Bani;
  streak: number;
  goal: Goal | null;
  /** whole percent of the goal, rounded down so 99.6% never reads as done */
  pct: number;
}

/** The goal the money just went to, if this moment follows a new contribution to a goal. */
function freshGoalId(before: UserData | null, after: UserData): string | null {
  if (!before) return null;
  const seen = new Set(before.transactions.map((t) => t.id));
  const fresh = after.transactions.filter((t) => !seen.has(t.id) && t.type === 'contribution');
  return fresh.length ? fresh[fresh.length - 1].goalId : null;
}

function pickGoal(data: UserData, id: string | null | undefined): Goal | null {
  const asked = id ? data.goals.find((g) => g.id === id && g.status !== 'archived') : null;
  return asked ?? primaryGoal(data.goals);
}

function statsOf(data: UserData, goalId: string | null): Stats {
  const goal = goalId ? data.goals.find((g) => g.id === goalId) ?? null : null;
  const pct = goal ? Math.floor(progress(goalSaved(data.transactions, goal.id), goal.target) * 100) : 0;
  return { total: totalSaved(data.transactions), streak: currentStreak(data), goal, pct };
}

/** One short line for Kip's bubble. */
function kipLine(streakGrew: boolean, pct: number, seed: number): string {
  if (pct >= 100) return 'You did it. Goal reached!';
  if (streakGrew) return 'Nice. Today just lit up.';
  const lines = ['That\'s it!', 'Look at it add up.', 'Nice, that\'s how it\'s done.', 'Great job!'];
  return lines[seed % lines.length];
}

// ---------- the screen ----------

const SPARKS = [
  { x: '8%', y: '22%', s: 18, c: '#ffc552', d: 0 },
  { x: '86%', y: '14%', s: 14, c: 'var(--struct-bright)', d: 0.35 },
  { x: '92%', y: '58%', s: 20, c: '#ffc552', d: 0.7 },
  { x: '2%', y: '64%', s: 12, c: 'var(--struct-bright)', d: 1.05 },
  { x: '70%', y: '-2%', s: 10, c: '#c5b5f8', d: 1.4 },
];

function CelebrationScreen({ party, onClose }: { party: Party; onClose: () => void }) {
  const { data } = useStore();
  const osReduced = useReducedMotion();
  const reduce = !!osReduced || !!data?.prefs.reduceMotion;
  const titleId = useId();
  const subId = useId();
  const go = useRef<HTMLButtonElement>(null);
  const [counted, setCounted] = useState(reduce);
  const [pose, setPose] = useState<'celebrate' | 'happy'>('celebrate');

  // the tiles show where you were, then count up to where you are once they've landed
  useEffect(() => {
    if (reduce) return;
    const t = window.setTimeout(() => setCounted(true), 800);
    return () => window.clearTimeout(t);
  }, [reduce]);

  // a dialog with one button: it gets the focus, Tab stays on it, Esc closes; focus goes back after
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    go.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Tab') {
        e.preventDefault();
        go.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (prev?.isConnected && prev !== document.body) prev.focus({ preventScroll: true });
    };
  }, [onClose]);

  const goalId = data ? pickGoal(data, party.goalId ?? freshGoalId(party.before, data))?.id ?? null : null;
  const now = data ? statsOf(data, goalId) : null;
  const was = party.before && data ? statsOf(party.before, goalId) : now;
  const shown = counted ? now : was;
  // a brand-new account (the end of signup) has nothing to count yet; zeros would only deflate
  const showTiles = !!now && (now.total > 0 || now.streak > 0 || now.pct > 0);
  const hidden = !!data?.prefs.hideBalance;
  const look = now?.goal ? goalLook(now.goal) : null;
  const line = kipLine(!!now && !!was && now.streak > was.streak, now?.pct ?? 0, party.id);

  const tapOutside = (e: MouseEvent) => {
    if (!(e.target as Element).closest('.celebrate__content')) onClose();
  };
  const jumpAgain = () => pose === 'happy' && setPose('celebrate');

  // with reduced motion everything is simply there; otherwise it lands in a short, staggered order
  const enter = (delay: number, from: { y?: number; scale?: number } = { y: 16 }) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { opacity: 0, ...from },
          animate: { opacity: 1, y: 0, scale: 1 },
          transition: { delay, type: 'spring' as const, stiffness: 420, damping: 26 },
        };

  return (
    <motion.div
      className="party celebrate"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={party.sub ? subId : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.22 } }}
      transition={{ duration: reduce ? 0 : 0.2 }}
      onClick={tapOutside}
    >
      <div className="celebrate__stage">
        <div className="celebrate__content">
          <motion.p className="celebrate__bubble" {...enter(0.35, { y: 8, scale: 0.6 })}>
            {line}
          </motion.p>

          <div className="celebrate__hero" onClick={jumpAgain}>
            <motion.span className="celebrate__glow" aria-hidden {...(reduce ? { initial: false as const } : { initial: { scale: 0.4, opacity: 0 }, animate: { scale: 1, opacity: 1 }, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } })} />
            {SPARKS.map((s, i) => (
              <span key={i} className="celebrate__spark" aria-hidden style={{ left: s.x, top: s.y, width: s.s, height: s.s, color: s.c, animationDelay: `${0.4 + s.d}s` } as CSSProperties} />
            ))}
            <Seal state={pose} size={210} appear={reduce ? 'none' : 'pop'} reducedMotion={reduce} onCelebrateEnd={() => setPose('happy')} title="" />
          </div>

          <motion.h2 id={titleId} className="celebrate__title" {...enter(0.15)}>
            {/* the amount ("+19 lei") stands out in gold; the rest of the headline stays navy */}
            {(() => {
              const m = party.title.match(/^([+−-]?[\d.,]+\s*lei)(.*)$/);
              return m ? (
                <>
                  <span className="celebrate__amount">{m[1]}</span>
                  {m[2]}
                </>
              ) : (
                party.title
              );
            })()}
          </motion.h2>
          {party.sub && (
            <motion.p id={subId} className="celebrate__sub" {...enter(0.22)}>
              {party.sub}
            </motion.p>
          )}

          {showTiles && shown && now && (
            <ul className="celebrate__tiles" aria-label="Where you are now">
              <motion.li className="celebrate__tile celebrate__tile--total" {...enter(0.3, { y: 20, scale: 0.9 })}>
                <span className="celebrate__tile-head">Total saved</span>
                <span className="celebrate__tile-body">
                  <Wallet size={20} strokeWidth={2.2} aria-hidden />
                  {hidden ? (
                    <span>••••</span>
                  ) : (
                    <span>
                      <NumberFlow value={shown.total / 100} locales="en-GB" format={{ maximumFractionDigits: 0 }} animated={!reduce} />
                      <small> lei</small>
                    </span>
                  )}
                </span>
              </motion.li>
              <motion.li className="celebrate__tile celebrate__tile--streak" {...enter(0.38, { y: 20, scale: 0.9 })}>
                <span className="celebrate__tile-head">Streak</span>
                <span className="celebrate__tile-body">
                  <Flame size={20} strokeWidth={2.2} className="celebrate__flame" aria-hidden />
                  <span>
                    <NumberFlow value={shown.streak} animated={!reduce} />
                    <small> {plural(now.streak, 'day', 'days').replace(/^\S+ /, '')}</small>
                  </span>
                </span>
              </motion.li>
              {now.goal && look && (
                <motion.li
                  className="celebrate__tile celebrate__tile--goal"
                  style={{ '--tile': look.fill, '--tile-deep': look.deep } as CSSProperties}
                  title={now.goal.name}
                  {...enter(0.46, { y: 20, scale: 0.9 })}
                >
                  <span className="celebrate__tile-head">Of goal</span>
                  <span className="celebrate__tile-body">
                    <Target size={20} strokeWidth={2.2} aria-hidden />
                    <span>
                      <NumberFlow value={shown.pct} suffix="%" animated={!reduce} />
                    </span>
                  </span>
                </motion.li>
              )}
            </ul>
          )}
        </div>
      </div>

      <motion.button ref={go} type="button" className="celebrate__go" onClick={onClose} {...enter(0.5, { y: 12 })}>
        Continue
      </motion.button>
    </motion.div>
  );
}
