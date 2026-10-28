import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Check } from '@/lib/icons';
import { currentStreak, weekStates } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { todayKey, toKey, WEEKDAY_SHORT } from '../../lib/dates';
import { Fire } from './Fire';
import { Seal } from './Seal';

/** What Kip says when the run grows. Encouraging, never "don't lose it". */
function cheer(n: number): string {
  if (n === 1) return 'Day one. Every run starts like this.';
  if (n === 2) return 'Two days in a row. You’re building a habit.';
  if (n < 7) return `${n} days in a row. Small amounts really do add up.`;
  if (n === 7) return 'A whole week. That’s how saving becomes normal.';
  return `${n} days. Steady beats big, every time.`;
}

/**
 * The Duolingo-style streak moment: Kip comes in and cheers, the flame lights up while the number
 * counts up, then this week slides in with today's mark popping on. It plays only when the run
 * actually grows (a recorded saving or a check-in), never on app open.
 */
export function StreakMoment() {
  const data = useData();
  const { account } = useStore();
  const streak = currentStreak(data);
  const prev = useRef(streak);
  const [moment, setMoment] = useState<{ from: number; to: number } | null>(null);
  const [lit, setLit] = useState(false);
  const joined = account?.isDemo ? '2000-01-01' : account ? toKey(new Date(account.createdAt)) : todayKey();

  useEffect(() => {
    if (streak > prev.current) {
      const from = prev.current;
      // let the "+X saved" moment finish first if one is showing
      const wait = document.querySelector('.party') ? 2800 : 250;
      const t = setTimeout(() => {
        setLit(false);
        setMoment({ from, to: streak });
        setTimeout(() => setLit(true), 700);
      }, wait);
      prev.current = streak;
      return () => clearTimeout(t);
    }
    prev.current = streak;
  }, [streak]);

  const days = weekStates(data, joined);
  const today = days.findIndex((d) => d.key === todayKey());
  const counts = (i: number) => ['done', 'today-done', 'paused'].includes(days[i]?.state);
  // the run this week: back from today through every saved (or protected) day
  let runStart = today;
  while (runStart > 0 && counts(runStart - 1)) runStart--;
  const fromLastWeek = moment ? runStart === 0 && moment.to > today + 1 : false;

  return (
    <AnimatePresence>
      {moment && (
        <motion.div className="streak-moment" role="dialog" aria-modal="true" aria-label={`${moment.to} day streak`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="streak-moment__inner">
            <motion.p className="streak-moment__bubble" initial={{ scale: 0.6, opacity: 0, y: 8 }} animate={{ scale: 1, opacity: 1, y: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 420, damping: 24 }}>
              {cheer(moment.to)}
            </motion.p>

            {/* Kip stands in front of the flame, like Duo in front of his */}
            <div className="streak-hero">
              <motion.div className="streak-hero__fire" initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: lit ? [0.92, 1.08, 1] : 0.92, opacity: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
                <Fire lit={lit} width={150} height={190} />
              </motion.div>
              <motion.div className="streak-hero__kip" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.1 }}>
                <Seal state={lit ? 'happy' : 'celebrate'} size={150} appear="pop" title="" />
              </motion.div>
            </div>

            <span className={`streak-moment__num ${lit ? 'is-lit' : ''}`}>
              <NumberFlow value={lit ? moment.to : moment.from} />
            </span>
            <span className={`streak-moment__label ${lit ? 'is-lit' : ''}`}>day streak</span>

            <motion.div className="streak-week" initial={{ y: 24, opacity: 0 }} animate={lit ? { y: 0, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.2 }}>
              <ol className="streak-week__days">
                {days.map((d, i) => (
                  <li key={d.key} className={`streak-week__w ${i === today ? 'is-today' : ''}`}>
                    {WEEKDAY_SHORT[i]}
                  </li>
                ))}
              </ol>
              <div className="streak-week__track">
                {/* the run as one bar that fills up to today, the "slider" */}
                {today >= 0 && (
                  <motion.span
                    className={`streak-week__run ${fromLastWeek ? 'is-continued' : ''}`}
                    style={{ ['--from' as string]: runStart, ['--to' as string]: today }}
                    initial={{ clipPath: 'inset(0 100% 0 0)' }}
                    animate={lit ? { clipPath: 'inset(0 0% 0 0)' } : {}}
                    transition={{ delay: 0.45, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                  />
                )}
                {days.map((d, i) => {
                  const done = d.state === 'done' || d.state === 'today-done';
                  const isToday = i === today;
                  return (
                    <motion.span
                      key={d.key}
                      className={`streak-week__dot ${done ? 'is-done' : ''} ${d.state === 'paused' ? 'is-break' : ''} ${isToday ? 'is-today' : ''}`}
                      initial={isToday ? { scale: 0.4 } : false}
                      animate={isToday && lit ? { scale: [0.4, 1.25, 1] } : {}}
                      transition={{ delay: 0.95, duration: 0.45 }}
                    >
                      {done && <Check size={16} strokeWidth={3} aria-hidden />}
                    </motion.span>
                  );
                })}
              </div>
            </motion.div>
            <p className="streak-moment__fine">A day counts when you save or check in. Breaks never cost you money.</p>
          </div>

          <motion.button type="button" className="btn btn--primary btn--lg streak-moment__go" initial={{ opacity: 0, y: 12 }} animate={{ opacity: lit ? 1 : 0, y: lit ? 0 : 12 }} transition={{ delay: 1.1 }} onClick={() => setMoment(null)}>
            Continue
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
