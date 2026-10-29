// Adapted from Watermelon UI "Timed Undo Action" (ui.watermelon.sh/animated-components/time-undo-action):
// one tap starts a short countdown, a second tap cancels it, and the action only runs when the
// count reaches zero. Kip uses it for "Sign out", so a stray tap never signs you out and
// there's no extra dialog to dismiss.
//
// Changes from the original: a full-width row instead of a pill measured with react-use-measure
// (one less dependency), Kip's navy and blue instead of red (signing out keeps your data, so it
// isn't a destructive action), a bar that drains while the time runs out, a fixed accessible name
// plus a live region for screen readers, and `onConfirm` fires once when the count ends.
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface TimedActionButtonProps {
  label: string;
  undoLabel?: string;
  /** how long the undo window stays open */
  seconds?: number;
  icon: ReactNode;
  onConfirm: () => void;
  /** read out while counting, e.g. "Signing out in 3 seconds." */
  liveText: (secondsLeft: number) => string;
  className?: string;
}

const blurIn = {
  initial: { opacity: 0, scale: 0.6, filter: 'blur(2px)' },
  animate: { opacity: 1, scale: 1, filter: 'blur(0px)' },
  exit: { opacity: 0, scale: 0.6, filter: 'blur(2px)' },
};

export function TimedActionButton({ label, undoLabel = 'Cancel', seconds = 3, icon, onConfirm, liveText, className }: TimedActionButtonProps) {
  // null = idle, otherwise seconds left in the undo window
  const [left, setLeft] = useState<number | null>(null);
  const counting = left !== null;
  // a ref, so a parent re-render mid-countdown doesn't restart the current second
  const confirmRef = useRef(onConfirm);
  confirmRef.current = onConfirm;
  const fired = useRef(false);

  useEffect(() => {
    if (left === null) return;
    if (left === 0) {
      if (!fired.current) {
        fired.current = true;
        confirmRef.current();
      }
      return;
    }
    const t = setTimeout(() => setLeft((n) => (n === null ? null : n - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const toggle = () => {
    if (fired.current) return;
    setLeft((n) => (n === null ? seconds : null));
  };

  return (
    <MotionConfig transition={{ type: 'spring', stiffness: 250, damping: 22 }}>
      <motion.button
        type="button"
        onClick={toggle}
        aria-label={counting ? `${undoLabel}: ${label.toLowerCase()} in ${left} s` : label}
        whileTap={{ scale: 0.98 }}
        className={cn(
          'tactile relative flex min-h-14 w-full cursor-pointer items-center justify-center overflow-hidden rounded-2xl border px-4 transition-colors duration-300',
          counting ? 'tactile--quiet border-[#e8c4bd] bg-[#fff4f1]' : 'tactile--quiet border-[var(--line-strong)] bg-surface',
          className,
        )}
      >
        {/* time left, draining from right to left */}
        {counting && (
          <motion.span
            aria-hidden
            className="absolute inset-0 origin-left bg-[#ffd9cf]"
            initial={{ scaleX: 1 }}
            animate={{ scaleX: 0 }}
            transition={{ duration: seconds, ease: 'linear' }}
          />
        )}
        {/* colour sits on this span: base.css gives <button> `color: inherit` outside any layer,
            which beats Tailwind's layered utilities */}
        <span aria-hidden className={cn('relative z-10 flex items-center justify-center gap-2', counting ? 'text-[#a3341d]' : 'text-ink')}>
          {!counting && <span className="grid place-items-center">{icon}</span>}

          <AnimatedText text={counting ? undoLabel : label} className="text-[17px] font-semibold tracking-[-0.01em]" />

          <AnimatePresence mode="popLayout">
            {counting && (
              <motion.span {...blurIn} className="flex min-w-7 items-center justify-center text-[17px] font-black tabular-nums">
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.span
                    key={left}
                    initial={{ opacity: 0, y: -14, scale: 0.5, filter: 'blur(2px)' }}
                    animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: 14, scale: 0.5, filter: 'blur(2px)' }}
                    transition={{ type: 'spring', stiffness: 240, damping: 20, mass: 1 }}
                  >
                    {left}
                  </motion.span>
                </AnimatePresence>
              </motion.span>
            )}
          </AnimatePresence>
        </span>
      </motion.button>
      <span className="sr-only" role="status" aria-live="polite">
        {counting ? liveText(left) : ''}
      </span>
    </MotionConfig>
  );
}

/** Letters swap one after another, each with a small spring and blur. */
function AnimatedText({ text, className, delayStep = 0.014 }: { text: string; className?: string; delayStep?: number }) {
  return (
    <span className={className} style={{ display: 'inline-flex' }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={text} style={{ display: 'inline-flex', willChange: 'transform' }}>
          {text.split('').map((char, i) => (
            <motion.span
              key={i}
              initial={{ y: 10, opacity: 0, scale: 0.5, filter: 'blur(2px)' }}
              animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ y: -10, opacity: 0, scale: 0.5, filter: 'blur(2px)' }}
              transition={{ type: 'spring', stiffness: 240, damping: 16, mass: 1.2, delay: i * delayStep }}
              style={{ display: 'inline-block', whiteSpace: char === ' ' ? 'pre' : undefined }}
            >
              {char}
            </motion.span>
          ))}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
