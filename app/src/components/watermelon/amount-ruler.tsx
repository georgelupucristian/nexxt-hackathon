// Adapted from Watermelon UI "Run Widget" (ui.watermelon.sh/animated-components/run-widget):
// the tick ruler + NumberFlow readout, as a controlled amount picker. Values are in bani.
//
// The first version used motion's drag with inertia and derived the value from the ruler's
// position, so the value and the animation fought each other (jumps, missed ticks). Now the value
// comes straight from how far the pointer moved, and the ruler only follows the value on a spring.
import NumberFlow from '@number-flow/react';
import { motion, useSpring } from 'motion/react';
import { useEffect, useRef } from 'react';

const TICK_GAP = 12; // px per tick (4px tick + 8px gap)

interface AmountRulerProps {
  value: number;
  onChange: (bani: number) => void;
  /** bani per tick */
  step?: number;
  min?: number;
  max?: number;
  label: string;
  suffix?: string;
  hint?: string;
}

export function AmountRuler({ value, onChange, step = 5_00, min = 0, max = 2_000_00, label, suffix = 'lei', hint = 'Drag the ruler, scroll, or use the arrow keys' }: AmountRulerProps) {
  const ticks = Math.round(max / step);
  const x = useSpring(-(value / step) * TICK_GAP, { stiffness: 420, damping: 40 });
  const drag = useRef<{ startX: number; startValue: number; lastTick: number } | null>(null);
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));

  useEffect(() => {
    x.set(-(value / step) * TICK_GAP);
  }, [value, step, x]);

  const set = (v: number) => {
    const next = clamp(v);
    if (next !== value) {
      onChange(next);
      if ((next / step) % 10 === 0) navigator.vibrate?.(4);
    }
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-baseline gap-2" aria-live="polite">
        <NumberFlow value={value / 100} className="font-display text-[64px] leading-none font-extrabold text-ink tabular-nums" format={{ maximumFractionDigits: 0 }} locales="ro-RO" />
        <span className="text-2xl font-semibold text-ink-3">{suffix}</span>
      </div>
      <div
        className="relative h-20 w-full cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min / 100}
        aria-valuemax={max / 100}
        aria-valuenow={value / 100}
        aria-valuetext={`${value / 100} ${suffix}`}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { startX: e.clientX, startValue: value, lastTick: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          // dragging the ruler left moves to bigger numbers, like turning a dial
          const tick = Math.round((d.startX - e.clientX) / TICK_GAP);
          if (tick !== d.lastTick) {
            d.lastTick = tick;
            set(d.startValue + tick * step);
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (Math.abs(delta) < 4) return;
          set(value + Math.sign(delta) * step);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), set(value + step));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), set(value - step));
          if (e.key === 'PageUp') (e.preventDefault(), set(value + step * 10));
          if (e.key === 'PageDown') (e.preventDefault(), set(value - step * 10));
        }}
      >
        <div className="pointer-events-none absolute top-1/2 left-1/2 z-10 h-12 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent" />
        <motion.div style={{ x }} className="pointer-events-none absolute top-1/2 left-1/2 flex -translate-y-1/2 items-center gap-[8px]">
          {Array.from({ length: ticks + 1 }, (_, i) => (
            <div key={i} className={i % 10 === 0 ? 'h-10 w-1 shrink-0 rounded-full bg-ink-3' : i % 5 === 0 ? 'h-7 w-1 shrink-0 rounded-full bg-[#cfcac0]' : 'h-5 w-1 shrink-0 rounded-full bg-[#e3dfd6]'} />
          ))}
        </motion.div>
      </div>
      <p className="m-0 text-sm text-ink-3">{hint}</p>
    </div>
  );
}
