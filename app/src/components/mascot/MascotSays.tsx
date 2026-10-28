import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { Seal, type SealAppear, type SealState } from './Seal';

export const MASCOT_NAME = 'Kip';

interface Props {
  state?: SealState;
  message: ReactNode;
  /** changes whenever the message should re-animate (strings can be used directly) */
  messageKey?: string | number;
  size?: number;
  layout?: 'row' | 'stack';
  appear?: SealAppear;
  direction?: 'left' | 'right';
  onPoke?: () => void;
  className?: string;
}

/**
 * Kip plus a speech bubble, the way Duolingo's owl talks you through setup. The bubble pops from
 * its tail and the words arrive one after another, so a new line reads like Kip just said it.
 */
export function MascotSays({ state = 'idle', message, messageKey, size = 120, layout = 'row', appear = 'pop', direction, onPoke, className = '' }: Props) {
  const key = messageKey ?? (typeof message === 'string' ? message : undefined);
  const words = typeof message === 'string' ? message.split(' ') : null;
  return (
    <div className={`mascot-says mascot-says--${layout} ${className}`}>
      <button type="button" className="mascot-says__seal" onClick={onPoke} aria-label={`${MASCOT_NAME}, foca de la Kip`} tabIndex={onPoke ? 0 : -1}>
        <Seal state={state} size={size} appear={appear} direction={direction} title="" />
      </button>
      <AnimatePresence mode="popLayout">
        <motion.div
          key={key}
          className="mascot-says__bubble"
          role="status"
          aria-live="polite"
          initial={{ opacity: 0, scale: 0.6, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.12 } }}
          transition={{ type: 'spring', stiffness: 520, damping: 26 }}
        >
          {words ? (
            <motion.span initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.035, delayChildren: 0.08 } } }}>
              {words.map((w, i) => (
                <motion.span key={i} className="mascot-says__word" variants={{ hidden: { opacity: 0, y: 4 }, shown: { opacity: 1, y: 0 } }}>
                  {w}{' '}
                </motion.span>
              ))}
            </motion.span>
          ) : (
            message
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
