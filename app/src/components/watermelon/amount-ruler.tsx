// Adapted from Watermelon UI "Run Widget" (ui.watermelon.sh/animated-components/run-widget):
// the tick ruler + NumberFlow readout, as a controlled amount picker. Values are in bani.
//
// Three ways in, because a ruler alone is fiddly: drag (faster drags move further), scroll or
// arrow keys for single steps, and tapping the number to type an exact amount, like 7 lei.
// Ticks are positioned around the current value only (about 90 at a time), so a fine step over a
// big range doesn't put thousands of nodes in the page.
import NumberFlow from '@number-flow/react';
import { motion, useSpring } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

const GAP = 12; // px between ticks
const WINDOW = 45; // ticks drawn on each side of the centre

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

export function AmountRuler({ value, onChange, step = 1_00, min = 1_00, max = 2_000_00, label, suffix = 'lei', hint = 'Drag, scroll or tap the number to type it' }: AmountRulerProps) {
  const x = useSpring(-(value / step) * GAP, { stiffness: 500, damping: 45 });
  const current = useRef(value);
  current.current = value;
  const drag = useRef<{ lastX: number; lastT: number; carry: number } | null>(null);
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState('');

  useEffect(() => {
    x.set(-(value / step) * GAP);
  }, [value, step, x]);

  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const commit = (v: number) => {
    const next = clamp(v);
    if (next !== current.current) {
      current.current = next;
      onChange(next);
      if (Math.round(next / step) % 10 === 0) navigator.vibrate?.(4);
    }
  };
  // ruler moves land on the tick grid; typed values stay exactly as typed
  const nudge = (ticks: number) => commit(Math.round(current.current / step + ticks) * step);

  const centre = value / step;
  const first = Math.max(Math.ceil(min / step), Math.floor(centre) - WINDOW);
  const last = Math.min(Math.floor(max / step), Math.ceil(centre) + WINDOW);
  const ticks: number[] = [];
  for (let i = first; i <= last; i++) ticks.push(i);

  const finishTyping = () => {
    const lei = Number(raw.replace(/[^\d]/g, ''));
    if (raw.trim() && Number.isFinite(lei)) commit(Math.round(lei) * 100);
    setEditing(false);
  };

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-baseline gap-2">
        {editing ? (
          <input
            autoFocus
            onFocus={(e) => e.currentTarget.select()} // typing replaces the old amount
            inputMode="numeric"
            aria-label={`${label}, in ${suffix}`}
            value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, '').slice(0, 7))}
            onBlur={finishTyping}
            onKeyDown={(e) => {
              if (e.key === 'Enter') finishTyping();
              if (e.key === 'Escape') setEditing(false);
            }}
            className="ruler-type font-display text-[64px] leading-none font-black text-ink tabular-nums"
            style={{ width: `${Math.max(2, raw.length + 0.5)}ch` }}
          />
        ) : (
          <button
            type="button"
            className="ruler-readout"
            onClick={() => {
              setRaw(String(Math.round(value / 100)));
              setEditing(true);
            }}
            aria-label={`${value / 100} ${suffix}. Tap to type the exact amount.`}
          >
            <NumberFlow value={value / 100} className="font-display text-[64px] leading-none font-black text-ink tabular-nums" format={{ maximumFractionDigits: 0 }} locales="en-GB" />
          </button>
        )}
        <span className="text-2xl font-semibold text-ink-3">{suffix}</span>
      </div>
      <div
        className="relative h-24 w-full cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing [mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min / 100}
        aria-valuemax={max / 100}
        aria-valuenow={value / 100}
        aria-valuetext={`${value / 100} ${suffix}`}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          drag.current = { lastX: e.clientX, lastT: e.timeStamp, carry: 0 };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = d.lastX - e.clientX; // dragging left moves to bigger numbers, like a dial
          const dt = Math.max(1, e.timeStamp - d.lastT);
          d.lastX = e.clientX;
          d.lastT = e.timeStamp;
          // slow drags move one tick at a time, quick swipes cover distance
          const speed = Math.abs(dx) / dt; // px per ms
          const boost = 1 + Math.min(9, Math.max(0, (speed - 0.35) * 6));
          d.carry += (dx / GAP) * boost;
          const whole = Math.trunc(d.carry);
          if (whole !== 0) {
            d.carry -= whole;
            nudge(whole);
          }
        }}
        onPointerUp={() => (drag.current = null)}
        onPointerCancel={() => (drag.current = null)}
        onWheel={(e) => {
          const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
          if (Math.abs(delta) < 4) return;
          nudge(Math.sign(delta));
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowUp') (e.preventDefault(), nudge(1));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') (e.preventDefault(), nudge(-1));
          if (e.key === 'PageUp') (e.preventDefault(), nudge(10));
          if (e.key === 'PageDown') (e.preventDefault(), nudge(-10));
        }}
      >
        {/* the needle sits exactly on the centre line, and so does the tick under it */}
        <div className="pointer-events-none absolute top-2 left-1/2 z-10 h-12 w-[4px] -translate-x-1/2 rounded-full bg-struct" />
        <motion.div style={{ x }} className="pointer-events-none absolute top-0 left-1/2 h-full w-0">
          {ticks.map((i) => {
            const major = i % 10 === 0;
            const mid = i % 5 === 0;
            return (
              <div key={i} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: i * GAP }}>
                <div className={`w-[4px] rounded-full ${major ? 'mt-2 h-12 bg-ink-3' : mid ? 'mt-4 h-8 bg-[#b9cde9]' : 'mt-5 h-6 bg-[#e4e9f2]'}`} />
                {major && <span className="mt-1 text-[11px] font-bold text-ink-3 tabular-nums">{((i * step) / 100).toLocaleString('en-GB')}</span>}
              </div>
            );
          })}
        </motion.div>
      </div>
      <p className="m-0 text-sm text-ink-3">{hint}</p>
    </div>
  );
}
