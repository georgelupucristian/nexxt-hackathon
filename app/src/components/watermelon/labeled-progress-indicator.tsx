// Adapted from Watermelon UI "Labeled Progress Indicator"
// (ui.watermelon.sh/animated-components/labeled-progress-indicator): rotating 3D labels over a
// progress bar with a moving shine. Here the bar fills over `durationMs` and reports when done.
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';

interface Props {
  labels: string[];
  durationMs?: number;
  onDone?: () => void;
}

export function LabeledProgressIndicator({ labels, durationMs = 2600, onDone }: Props) {
  const [i, setI] = useState(0);
  const per = durationMs / labels.length;

  useEffect(() => {
    const tick = setInterval(() => setI((p) => Math.min(p + 1, labels.length - 1)), per);
    const done = setTimeout(() => onDone?.(), durationMs + 250);
    return () => {
      clearInterval(tick);
      clearTimeout(done);
    };
  }, [labels.length, per, durationMs, onDone]);

  return (
    <div className="flex w-full flex-col items-center gap-5" role="status" aria-live="polite">
      <div className="relative flex h-10 w-full items-center justify-center perspective-[800px]">
        <AnimatePresence mode="popLayout">
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 10, scale: 1.6, filter: 'blur(4px)', rotateX: -60 }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)', rotateX: 0 }}
            exit={{ opacity: 0, filter: 'blur(4px)', rotateX: 90, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 600, damping: 100, mass: 10 }}
            className="flex w-full items-center justify-center font-display text-2xl font-bold text-ink-2"
          >
            {labels[i]}
          </motion.span>
        </AnimatePresence>
      </div>
      <div className="h-4 w-full max-w-[320px] overflow-hidden rounded-full border border-black/5 bg-surface-2 shadow-inner">
        <motion.div
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: durationMs / 1000, ease: [0.4, 0, 0.2, 1] }}
          className="relative h-full overflow-hidden rounded-full bg-struct"
        >
          <motion.div
            initial={{ x: '-100%' }}
            animate={{ x: '200%' }}
            transition={{ duration: 1.1, repeat: Infinity, ease: 'linear' }}
            className="absolute inset-y-0 w-full bg-gradient-to-r from-transparent via-white/45 to-transparent"
          />
        </motion.div>
      </div>
    </div>
  );
}
