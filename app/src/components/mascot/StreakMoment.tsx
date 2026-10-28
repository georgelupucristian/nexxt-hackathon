import NumberFlow from '@number-flow/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { Check } from '@/lib/icons';
import { currentStreak, weekStates } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { todayKey, toKey, WEEKDAY_SHORT } from '../../lib/dates';
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

  return (
    <AnimatePresence>
      {moment && (
        <motion.div className="streak-moment" role="dialog" aria-modal="true" aria-label={`${moment.to} day streak`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="streak-moment__inner">
            <motion.div className="streak-moment__kip" initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 22 }}>
              <motion.p className="streak-moment__bubble" initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.35, type: 'spring', stiffness: 420, damping: 24 }}>
                {cheer(moment.to)}
              </motion.p>
              <Seal state={lit ? 'happy' : 'celebrate'} size={130} appear="pop" title="" />
            </motion.div>

            <div className="streak-moment__fire">
              <Flame lit={lit} />
              <div className="streak-moment__count">
                <span className={`streak-moment__num ${lit ? 'is-lit' : ''}`}>
                  <NumberFlow value={lit ? moment.to : moment.from} />
                </span>
                <span className="streak-moment__label">day streak</span>
              </div>
            </div>

            <motion.ol className="streak-week" initial={{ y: 30, opacity: 0 }} animate={lit ? { y: 0, opacity: 1 } : {}} transition={{ type: 'spring', stiffness: 300, damping: 26, delay: 0.25 }}>
              {days.map((d, i) => {
                const done = d.state === 'done' || d.state === 'today-done';
                const isToday = d.key === todayKey();
                return (
                  <li key={d.key} className={`streak-week__day ${isToday ? 'is-today' : ''}`}>
                    <span className="streak-week__w">{WEEKDAY_SHORT[i]}</span>
                    <motion.span
                      className={`streak-week__dot ${done ? 'is-done' : ''} ${d.state === 'paused' ? 'is-break' : ''}`}
                      initial={isToday ? { scale: 0.3 } : false}
                      animate={isToday && lit ? { scale: [0.3, 1.25, 1] } : {}}
                      transition={{ delay: 0.7, duration: 0.45 }}
                    >
                      {done && <Check size={14} strokeWidth={3} aria-hidden />}
                    </motion.span>
                  </li>
                );
              })}
            </motion.ol>
            <p className="streak-moment__fine">A day counts when you save or check in. Breaks never cost you money.</p>

            <motion.button type="button" className="btn btn--primary btn--lg streak-moment__go" initial={{ opacity: 0 }} animate={{ opacity: lit ? 1 : 0 }} transition={{ delay: 0.9 }} onClick={() => setMoment(null)}>
              Continue
            </motion.button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** A drawn flame: grey and still until it lights, then it fills with warm colour and flickers. */
function Flame({ lit }: { lit: boolean }) {
  return (
    <motion.svg viewBox="0 0 120 150" className="flame" aria-hidden initial={{ scale: 0.6 }} animate={{ scale: lit ? [0.85, 1.18, 1] : 0.85 }} transition={{ duration: 0.55, ease: 'easeOut' }}>
      <defs>
        <linearGradient id="flame-outer" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#f04a1a" />
          <stop offset="1" stopColor="#ffb02e" />
        </linearGradient>
        <linearGradient id="flame-inner" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffb02e" />
          <stop offset="1" stopColor="#ffe8a3" />
        </linearGradient>
      </defs>
      <motion.g style={{ transformOrigin: '60px 140px' }} animate={lit ? { scaleY: [1, 1.04, 0.98, 1.03, 1], scaleX: [1, 0.98, 1.02, 0.99, 1] } : {}} transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}>
        {/* outer flame */}
        <path
          d="M60 8 C 66 34, 96 50, 100 86 C 104 120, 84 142, 60 142 C 36 142, 16 122, 20 92 C 23 70, 36 60, 40 44 C 46 58, 50 64, 56 66 C 52 46, 54 26, 60 8 Z"
          fill={lit ? 'url(#flame-outer)' : '#e4e0d7'}
        />
        {/* inner flame appears once lit */}
        <motion.path
          d="M60 66 C 64 84, 80 92, 80 112 C 80 128, 70 136, 60 136 C 48 136, 40 127, 41 113 C 42 100, 52 94, 55 80 C 57 88, 59 90, 61 91 C 59 82, 58 74, 60 66 Z"
          fill="url(#flame-inner)"
          initial={{ opacity: 0, scale: 0.4 }}
          animate={lit ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.4 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 300, damping: 16 }}
          style={{ transformOrigin: '60px 136px' }}
        />
      </motion.g>
    </motion.svg>
  );
}
