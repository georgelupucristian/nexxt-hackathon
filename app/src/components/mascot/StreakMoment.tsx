import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { currentStreak, weekStates, type DayState } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { todayKey } from '../../lib/dates';
import { plural } from '../../lib/plural';
import { Seal } from './Seal';
import { joinedKey } from '../StreakWeek';
import '../../styles/streakmoment.css';

/** What Kip says when the run grows. Encouraging, never "don't lose it". */
function cheer(n: number): string {
  if (n === 1) return 'Day one. Every streak starts like this.';
  if (n === 2) return 'Two days in a row. The habit is sticking.';
  if (n < 7) return `${plural(n, 'day', 'days')} in a row. Small amounts really add up.`;
  if (n === 7) return 'A whole week. This is how saving becomes second nature.';
  return `${plural(n, 'day', 'days')} in a row. Little and often beats a lot and rarely, every time.`;
}

/** The words under the big number, agreeing with it: "day in a row", "days in a row". */
const streakWords = (n: number) => `${plural(n, 'day', 'days').replace(/^\S+ /, '')} in a row`;

// same day letters as the streak card on home
const SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const isDone = (s: DayState | undefined) => s === 'done' || s === 'today-done';
const keepsRun = (s: DayState | undefined) => isDone(s) || s === 'paused';

/**
 * The Duolingo-style streak moment: Kip comes in and cheers, the flame grows while the number
 * counts up, then this week slides in and today catches fire. Same flame and same week as the
 * streak card on home; a day a freeze covered shows the snowflake and keeps the run joined. It plays only when
 * the run actually grows (money put aside today), never on app open.
 */
export function StreakMoment() {
  const data = useData();
  const { account } = useStore();
  const streak = currentStreak(data);
  const prev = useRef(streak);
  const [moment, setMoment] = useState<{ from: number; to: number } | null>(null);
  const [lit, setLit] = useState(false);
  const [burning, setBurning] = useState(false);
  const joined = joinedKey(account, data.actions);

  useEffect(() => {
    if (streak > prev.current) {
      const from = prev.current;
      // let the "+X saved" moment finish first if one is showing. A payment confirmed by Stripe
      // grows the streak in the same render that asks for the celebration, so look again a beat
      // later rather than only now.
      let t = 0;
      const show = (waited: boolean) => {
        if (!waited && document.querySelector('.party')) {
          t = window.setTimeout(() => show(true), 2550);
          return;
        }
        setLit(false);
        setBurning(false);
        setMoment({ from, to: streak });
        setTimeout(() => setLit(true), 700);
        // today's link fills ~0.5s after the flame grows, then today catches fire
        setTimeout(() => setBurning(true), 700 + 900);
      };
      t = window.setTimeout(() => show(false), 250);
      prev.current = streak;
      return () => clearTimeout(t);
    }
    prev.current = streak;
  }, [streak]);

  const days = weekStates(data, joined);
  const today = days.findIndex((d) => d.key === todayKey());
  const anyIce = days.some((d) => d.state === 'paused');

  return (
    <AnimatePresence>
      {moment && (
        <motion.div className="streak-moment" role="dialog" aria-modal="true" aria-label={`${plural(moment.to, 'day', 'days')} in a row`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="streak-moment__inner">
            <motion.p className="streak-moment__bubble" initial={{ scale: 0.6, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 420, damping: 24 }}>
              {cheer(moment.to)}
            </motion.p>

            {/* Kip stands in front of the flame, like Duo in front of his; the flame is the same one as on the card */}
            <div className="smh">
              <motion.img
                src="/mascot/flame.webp"
                alt=""
                className="smh__flame"
                initial={{ scale: 0.25, opacity: 0, y: 40 }}
                animate={lit ? { scale: 1, opacity: 1, y: 0 } : { scale: 0.5, opacity: 0.55, y: 22 }}
                transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              />
              <motion.div className="smh__kip" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}>
                <Seal state={lit ? 'happy' : 'celebrate'} size={140} appear="pop" title="" />
              </motion.div>
            </div>

            <span className={`streak-moment__num ${lit ? 'is-lit' : ''}`}>
              <NumberFlow value={lit ? moment.to : moment.from} />
            </span>
            <span className={`streak-moment__label ${lit ? 'is-lit' : ''}`}>{streakWords(lit ? moment.to : moment.from)}</span>

            <motion.ol
              className={`smw ${burning ? 'is-burning' : ''}`}
              aria-label="This week"
              initial={{ y: 24, opacity: 0 }}
              animate={lit ? { y: 0, opacity: 1 } : {}}
              transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.2 }}
            >
              {days.map((d, i) => {
                const isToday = i === today;
                const done = isDone(d.state);
                const ice = d.state === 'paused';
                // today's flame waits for its moment; every other day shows what it is
                const showFire = done && (!isToday || burning);
                const link = i < 6 && keepsRun(d.state) && keepsRun(days[i + 1]?.state);
                const linkIsNew = i + 1 === today;
                return (
                  <li
                    key={d.key}
                    className={`smw__day is-${d.state} ${isToday ? 'is-today' : ''} ${link ? 'has-link' : ''} ${link && linkIsNew ? 'link-new' : ''} ${link && (ice || days[i + 1]?.state === 'paused') ? 'link-ice' : ''}`}
                  >
                    <span className="smw__w" aria-hidden>
                      {SHORT[i]}
                    </span>
                    <span className="smw__dot">
                      <AnimatePresence>
                        {showFire && (
                          <motion.img
                            key="fire"
                            src="/mascot/flame.webp"
                            alt=""
                            className="smw__icon"
                            initial={isToday ? { scale: 0, y: 6 } : false}
                            animate={{ scale: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 520, damping: 15 }}
                          />
                        )}
                      </AnimatePresence>
                      {ice && <img src="/mascot/ice.webp" alt="" className="smw__icon smw__icon--ice" />}
                    </span>
                  </li>
                );
              })}
            </motion.ol>
            <p className="streak-moment__fine smw__fine">
              {anyIce ? (
                <>
                  <img src="/mascot/ice.webp" alt="" className="smw__legend" /> A Freeze keeps the streak without growing it.
                </>
              ) : (
                'A day counts when you save something.'
              )}
            </p>
          </div>

          {/* not tappable while it's still invisible: a second tap meant for the celebration's
              Continue, right under it, would otherwise close this moment before it plays */}
          <motion.button
            type="button"
            className="btn btn--primary btn--lg streak-moment__go"
            style={{ pointerEvents: lit ? 'auto' : 'none' }}
            tabIndex={lit ? 0 : -1}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: lit ? 1 : 0, y: lit ? 0 : 12 }}
            transition={{ delay: 1.1 }}
            onClick={() => setMoment(null)}
          >
            Continue
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
