import confetti from 'canvas-confetti';
import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Seal } from './Seal';

interface Party {
  id: number;
  title: string;
  sub?: string;
}

const Ctx = createContext<(p: Omit<Party, 'id'>) => void>(() => undefined);

const reduced = () =>
  document.documentElement.dataset.reduceMotion === 'true' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Moss, gold coin, cream and sky: the palette's own colours, not rainbow party confetti. */
const COLORS = ['#1f7a52', '#7fd3a3', '#f2c14e', '#f6e6c8', '#9cc3ef'];

/**
 * The payoff moment after money is saved or a goal is set: Kip jumps with coins in a full-screen
 * overlay, confetti bursts from both sides, and everything clears itself after ~2.6 s.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [party, setParty] = useState<Party | null>(null);
  const timer = useRef<number | null>(null);

  const celebrate = useCallback((p: Omit<Party, 'id'>) => {
    if (timer.current) window.clearTimeout(timer.current);
    setParty({ ...p, id: Date.now() });
    if (!reduced()) {
      const base = { particleCount: 70, spread: 70, startVelocity: 48, colors: COLORS, ticks: 220, scalar: 1.05, zIndex: 80 };
      confetti({ ...base, angle: 60, origin: { x: 0, y: 0.75 } });
      confetti({ ...base, angle: 120, origin: { x: 1, y: 0.75 } });
      window.setTimeout(() => confetti({ ...base, particleCount: 40, spread: 100, origin: { x: 0.5, y: 0.35 }, shapes: ['circle'], scalar: 1.3 }), 260);
    }
    navigator.vibrate?.([12, 40, 18]);
    timer.current = window.setTimeout(() => setParty(null), 2600);
  }, []);

  return (
    <Ctx.Provider value={celebrate}>
      {children}
      <AnimatePresence>
        {party && (
          <motion.div
            key={party.id}
            className="party"
            role="status"
            aria-live="polite"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            onClick={() => setParty(null)}
          >
            <motion.div className="party__card" initial={{ scale: 0.7, y: 40 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }} transition={{ type: 'spring', stiffness: 380, damping: 22 }}>
              <Seal state="celebrate" size={190} appear="pop" title="" />
              <p className="party__title">{party.title}</p>
              {party.sub && <p className="party__sub">{party.sub}</p>}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </Ctx.Provider>
  );
}

export const useCelebrate = () => useContext(Ctx);
