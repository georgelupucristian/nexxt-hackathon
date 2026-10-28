// Adapted from Watermelon UI "Run Widget" (ui.watermelon.sh/animated-components/run-widget):
// the draggable tick ruler + NumberFlow readout, turned into a controlled amount picker.
// Values are in bani (1 leu = 100 bani) like the rest of the app.
import NumberFlow from '@number-flow/react';
import { animate, motion, useMotionValue, useMotionValueEvent } from 'motion/react';
import { useEffect, useRef } from 'react';

const TICK_GAP = 12; // px between ticks, including the tick itself

interface AmountRulerProps {
  value: number;
  onChange: (bani: number) => void;
  /** bani per tick */
  step?: number;
  max?: number;
  label: string;
  suffix?: string;
}

export function AmountRuler({ value, onChange, step = 5_00, max = 2_000_00, label, suffix = 'lei' }: AmountRulerProps) {
  const ticks = Math.round(max / step);
  const x = useMotionValue(-(value / step) * TICK_GAP);
  const dragging = useRef(false);
  const last = useRef(value);

  // follow outside changes (typing, chips) with a spring, but not while the user is dragging
  useEffect(() => {
    if (dragging.current || value === last.current) return;
    last.current = value;
    const c = animate(x, -(value / step) * TICK_GAP, { type: 'spring', stiffness: 300, damping: 35 });
    return () => c.stop();
  }, [value, step, x]);

  useMotionValueEvent(x, 'change', (latest) => {
    if (!dragging.current) return;
    const n = Math.min(ticks, Math.max(0, Math.round(-latest / TICK_GAP)));
    const bani = n * step;
    if (bani !== last.current) {
      last.current = bani;
      onChange(bani);
      // tiny haptic tick on phones that support it
      if (n % 10 === 0) navigator.vibrate?.(4);
    }
  });

  const nudge = (dir: 1 | -1) => onChange(Math.min(max, Math.max(0, value + dir * step)));

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-baseline gap-2" aria-live="polite">
        <NumberFlow value={value / 100} className="font-display text-[64px] leading-none font-extrabold text-ink tabular-nums" format={{ maximumFractionDigits: 0 }} locales="ro-RO" />
        <span className="text-2xl font-semibold text-ink-3">{suffix}</span>
      </div>
      <div
        className="relative h-20 w-full touch-pan-y overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max / 100}
        aria-valuenow={value / 100}
        aria-valuetext={`${value / 100} ${suffix}`}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), nudge(1));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), nudge(-1));
        }}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        <motion.div
          drag="x"
          dragConstraints={{ right: 0, left: -ticks * TICK_GAP }}
          dragElastic={0.05}
          dragMomentum
          dragTransition={{ power: 0.25, timeConstant: 200, modifyTarget: (t) => Math.round(t / TICK_GAP) * TICK_GAP }}
          onDragStart={() => (dragging.current = true)}
          onDragTransitionEnd={() => (dragging.current = false)}
          style={{ x }}
          className="absolute top-1/2 left-1/2 flex -translate-y-1/2 cursor-grab items-center gap-[8px] active:cursor-grabbing"
        >
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <div key={i} className={i % 10 === 0 ? 'h-10 w-1 shrink-0 rounded-full bg-ink-3' : i % 5 === 0 ? 'h-7 w-1 shrink-0 rounded-full bg-[#cfcac0]' : 'h-5 w-1 shrink-0 rounded-full bg-[#e3dfd6]'} />
          ))}
        </motion.div>
      </div>
      <p className="m-0 text-sm text-ink-3">Drag the ruler, or use the arrow keys</p>
    </div>
  );
}
