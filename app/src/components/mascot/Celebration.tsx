import { AnimatePresence, motion } from 'motion/react';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Seal } from './Seal';

interface Party {
  id: number;
  title: string;
  sub?: string;
}

const Ctx = createContext<(p: Omit<Party, 'id'>) => void>(() => undefined);

/**
 * The moment after money is recorded or a goal is set: Kip jumps and says what happened, then the
 * overlay clears itself after ~2.6 s. No confetti: regulators flag confetti on financial actions,
 * and the point is to confirm what happened, not to reward the tap.
 */
export function CelebrationProvider({ children }: { children: ReactNode }) {
  const [party, setParty] = useState<Party | null>(null);
  const timer = useRef<number | null>(null);

  const celebrate = useCallback((p: Omit<Party, 'id'>) => {
    if (timer.current) window.clearTimeout(timer.current);
    setParty({ ...p, id: Date.now() });
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
