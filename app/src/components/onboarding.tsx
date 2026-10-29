// Building blocks for sign-up and onboarding, in Tailwind. Shapes, spacing and motion follow
// Watermelon UI: the "Onboarding Screen" frame and segmented progress, "Emoji Spree Choice Chips"
// for the multi-selects, "Input OTP 2" for the code (on the same input-otp library), "Continuous
// Tabs" for the date choice and "Onboarding Checklist" on Home.
//
// Motion system, used everywhere in the flow:
//   - one UI spring (`ui`) for things moving into place, one bouncy spring (`pop`) for confirmations
//   - steps slide in the direction you're going; the header stays put so the progress bar can grow
//   - each step's content cascades in (title, then body, then the main button), under 400 ms total
//   - every tap answers: press scale, selections pop their check, errors shake, success turns green
//   - a little ambient life (Kip floating, Face ID scanning) only where the screen is otherwise still
// MotionConfig in App turns transforms off for reduced motion; the loops also check it themselves.
import NumberFlow from '@number-flow/react';
import { OTPInput, REGEXP_ONLY_DIGITS } from 'input-otp';
import { ChevronLeft, Delete } from 'lucide-react';
import { AnimatePresence, motion, useAnimationControls, useIsPresent, useReducedMotion, type Variants } from 'motion/react';
import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { rememberDeviceUnlock } from '../lib/deviceUnlock';

export const ui = { type: 'spring', stiffness: 380, damping: 32 } as const;
export const pop = { type: 'spring', stiffness: 520, damping: 18 } as const;

/** Content of a step: children use `rise` and inherit the cascade. */
export const cascade: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
export const rise: Variants = { hidden: { opacity: 0, y: 14 }, shown: { opacity: 1, y: 0, transition: ui } };

const enDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatDateEn = (key: string) => enDate.format(new Date(`${key}T12:00:00`));

/** "alexandra@gmail.com" → "al•••@gmail.com" */
export function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}•••@${domain}`;
}

/** "gabriel cristian" → "Gabriel" */
export const firstName = (name: string) => {
  const w = name.trim().split(/\s+/)[0] ?? '';
  return w ? w[0].toUpperCase() + w.slice(1) : '';
};

const Spinner = () => (
  <motion.span
    className="block size-4 rounded-full border-2 border-current border-r-transparent"
    animate={{ rotate: 360 }}
    transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
    aria-hidden
  />
);

// ---------- buttons ----------

/**
 * The main button. Its label slides when it changes, it gives a small nudge the moment it becomes
 * usable, and `busy` swaps the label for a spinner.
 */
export function PrimaryButton({ className, children, busy, disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  const controls = useAnimationControls();
  const was = useRef(disabled);
  useEffect(() => {
    if (was.current && !disabled) void controls.start({ scale: [1, 1.03, 1], transition: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] } });
    was.current = disabled;
  }, [disabled, controls]);
  const label = typeof children === 'string' ? children : undefined;
  return (
    <motion.button
      type="button"
      animate={controls}
      whileTap={disabled ? undefined : { scale: 0.99 }}
      transition={{ duration: 0.1 }}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cn(
        // Duolingo's button: a solid face on a darker bottom edge that it sinks into when pressed
        'relative flex h-14 w-full cursor-pointer items-center justify-center gap-2 overflow-hidden rounded-2xl border-0 bg-[var(--gold)] px-6 text-[15px] font-bold tracking-wider text-ink uppercase shadow-[0_4px_0_0_var(--gold-lip)] transition-[background-color,color,box-shadow,transform] duration-100 active:translate-y-[4px] active:shadow-none',
        'disabled:cursor-default disabled:bg-black/[0.07] disabled:text-black/30 disabled:shadow-[0_4px_0_0_rgba(0,0,0,0.06)] disabled:active:translate-y-0',
        className,
      )}
      {...(props as object)}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={busy ? 'busy' : (label ?? 'label')}
          className="flex items-center gap-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={ui}
        >
          {busy ? <Spinner /> : children}
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
}

export function QuietButton({ className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.96 }}
      className={cn('h-11 cursor-pointer rounded-xl border-0 bg-transparent px-4 text-[14px] font-bold tracking-wider text-struct uppercase transition-colors hover:bg-black/[0.04]', className)}
      {...(props as object)}
    >
      {children}
    </motion.button>
  );
}

// ---------- screen frame ----------

const ShellCtx = createContext(false);

/**
 * The part of the flow that stays still: back button and progress. Steps inside slide in from the
 * right going forward and from the left going back, so the direction of travel is always clear.
 */
export function FlowShell({
  progress,
  onBack,
  backLabel = 'Back',
  stepKey,
  direction,
  children,
}: {
  progress: number; // 0..1
  onBack: () => void;
  backLabel?: string;
  stepKey: string;
  direction: number;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pt-[calc(env(safe-area-inset-top)+12px)]">
      <header className="relative z-10 flex items-center gap-4">
        <motion.button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          whileHover="hover"
          whileTap={{ scale: 0.92 }}
          className="grid size-11 shrink-0 cursor-pointer place-items-center rounded-2xl border border-black/10 bg-white text-ink-2"
        >
          <motion.span variants={{ hover: { x: -2 } }} transition={ui}>
            <ChevronLeft size={20} aria-hidden />
          </motion.span>
        </motion.button>
        <div
          className="relative h-4 flex-1 overflow-hidden rounded-full bg-black/[0.07]"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
        >
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-struct"
            initial={false}
            animate={{ width: `${Math.max(6, progress * 100)}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          >
            {/* Duolingo's highlight along the top of the fill */}
            <span className="absolute inset-x-2 top-[3px] h-[3px] rounded-full bg-white/30" />
          </motion.div>
        </div>
      </header>

      <ShellCtx.Provider value>
        <AnimatePresence mode="popLayout" initial={false} custom={direction}>
          <StepSlide key={stepKey} direction={direction}>
            {children}
          </StepSlide>
        </AnimatePresence>
      </ShellCtx.Provider>
    </div>
  );
}

const slide: Variants = {
  enter: (d: number) => ({ opacity: 0, x: 48 * d }),
  center: { opacity: 1, x: 0, transition: ui },
  exit: (d: number) => ({ opacity: 0, x: -32 * d, transition: { duration: 0.18, ease: [0.3, 0, 1, 1] } }),
};

/** A step on its way out is only a picture: hidden from screen readers and from taps. */
// forwardRef: AnimatePresence's popLayout measures the step on its way out
const StepSlide = forwardRef<HTMLDivElement, { direction: number; children: ReactNode }>(function StepSlide({ direction, children }, ref) {
  const present = useIsPresent();
  return (
    <motion.div
      ref={ref}
      custom={direction}
      variants={slide}
      initial="enter"
      animate="center"
      exit="exit"
      aria-hidden={!present || undefined}
      // React 18's types don't know `inert` yet; the DOM does
      {...((present ? {} : { inert: '' }) as object)}
      className="flex flex-1 flex-col"
    >
      {children}
    </motion.div>
  );
});

// ---------- typewriter ----------

/**
 * Types `text` out a character at a time. Screen readers get the whole sentence at once; the
 * moving letters are only for the eyes.
 */
export function Typewriter({ text, speed = 22, delay = 0, className, caret }: { text: string; speed?: number; delay?: number; className?: string; caret?: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return setN(text.length);
    setN(0);
    let i = 0;
    let t = window.setTimeout(function tick() {
      i += 1;
      setN(i);
      if (i < text.length) t = window.setTimeout(tick, speed);
    }, delay);
    return () => window.clearTimeout(t);
  }, [text, speed, delay, reduce]);
  return (
    <span className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, n)}
        {/* the untyped rest keeps its space so the bubble doesn't grow line by line */}
        <span className="invisible">{text.slice(n)}</span>
        {caret && n > 0 && n < text.length && <span className="ml-px inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-current" />}
      </span>
    </span>
  );
}

// ---------- Kip's speech bubble (Duolingo's mascot header) ----------

export type KipFace = 'wave' | 'happy' | 'think' | 'point' | 'proud' | 'celebrate' | 'wink' | 'surprised';

/** Kip on the left, the question in a bubble pointing at him. */
export function KipSays({ face = 'wave', children, layoutId }: { face?: KipFace; children: ReactNode; layoutId?: string }) {
  return (
    <motion.div variants={rise} className="flex items-center gap-3">
      <motion.img
        src={`/mascot/${face}-face.webp`}
        alt=""
        className="size-[76px] shrink-0 object-contain"
        initial={{ scale: 0.6, rotate: -8 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={pop}
      />
      <motion.div
        layoutId={layoutId}
        className="relative min-w-0 flex-1 rounded-2xl border-2 border-black/10 bg-white px-4 py-3"
        initial={{ scale: 0.85, opacity: 0, originX: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...pop, delay: 0.08 }}
      >
        {/* the tail: a rotated square with the bubble's border on two sides */}
        <span className="absolute top-1/2 -left-[7px] size-3 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-black/10 bg-white" aria-hidden />
        {children}
      </motion.div>
    </motion.div>
  );
}

/** Kip in the middle of the screen with the bubble above him, for the big moments. */
export function KipCenter({ children, face = 'happy', size = 170 }: { children: ReactNode; face?: 'happy' | 'celebrate' | 'wave' | 'point' | 'think'; size?: number }) {
  return (
    <motion.div variants={rise} className="flex flex-1 flex-col items-center justify-center gap-4">
      <motion.div
        className="relative max-w-[30ch] rounded-2xl border-2 border-black/10 bg-white px-5 py-4 text-left"
        initial={{ scale: 0.8, opacity: 0, originY: 1 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ ...pop, delay: 0.15 }}
      >
        <span className="absolute -bottom-[7px] left-1/2 size-3 -translate-x-1/2 rotate-45 border-r-2 border-b-2 border-black/10 bg-white" aria-hidden />
        {children}
      </motion.div>
      <Float amount={6}>
        <motion.img
          src={`/mascot/${face}.webp`}
          alt=""
          style={{ width: size, height: size }}
          className="object-contain"
          initial={{ scale: 0.5, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={pop}
        />
      </Float>
    </motion.div>
  );
}

const bubbleText = 'text-[17px]! leading-snug! font-semibold! tracking-normal! text-ink';

/** One question: Kip asks it in a bubble, the body sits below, the main button at the bottom. */
export function StepFrame({
  title,
  sub,
  children,
  foot,
  center,
  face,
}: {
  progress?: number;
  onBack?: () => void;
  backLabel?: string;
  title: ReactNode;
  sub?: ReactNode;
  children?: ReactNode;
  foot: ReactNode;
  center?: boolean;
  face?: KipFace;
}) {
  const inShell = useContext(ShellCtx);
  const heading = <h1 className={bubbleText}>{typeof title === 'string' ? <Typewriter text={title} /> : title}</h1>;
  const body = (
    <>
      <motion.main
        variants={cascade}
        initial="hidden"
        animate="shown"
        className={cn('flex flex-1 flex-col gap-5 pt-6 pb-6', center && 'justify-center text-center')}
      >
        {center ? (
          title && <motion.div variants={rise} className="flex flex-col items-center gap-2">
            <h1 className="text-[26px]! leading-[1.15]! font-bold! tracking-tight! text-ink">{title}</h1>
            {sub && <p className="mx-auto max-w-[34ch] text-[15px] leading-relaxed text-ink-3">{sub}</p>}
          </motion.div>
        ) : (
          <>
            <KipSays face={face}>{heading}</KipSays>
            {sub && (
              <motion.p variants={rise} className="text-[15px] leading-relaxed text-ink-3">
                {sub}
              </motion.p>
            )}
          </>
        )}
        {children}
      </motion.main>

      <motion.footer
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...ui, delay: 0.18 }}
        className="sticky bottom-0 -mx-5 flex flex-col items-center gap-1 bg-linear-to-t from-bg from-70% to-transparent px-5 pt-4 pb-[calc(env(safe-area-inset-bottom)+20px)]"
      >
        {foot}
      </motion.footer>
    </>
  );
  // outside the flow (e.g. a step reopened from Home) the frame stands on its own
  return inShell ? body : <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5">{body}</div>;
}

/** Wraps a block of step content so it joins the cascade. */
export function Rise({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={rise} className={className}>
      {children}
    </motion.div>
  );
}

// ---------- Duolingo option rows ----------

/**
 * Duolingo's answer row: white, a 2px border with a thicker bottom edge, and a blue-ish tint when
 * picked (here the app's green). `multi` adds the checkbox on the right.
 */
export function OptionRow({
  checked,
  onToggle,
  icon,
  label,
  aside,
  multi,
}: {
  checked: boolean;
  onToggle: () => void;
  icon?: ReactNode;
  label: ReactNode;
  aside?: ReactNode;
  multi?: boolean;
}) {
  return (
    <motion.button
      type="button"
      role={multi ? 'checkbox' : 'radio'}
      aria-checked={checked}
      variants={rise}
      whileTap={{ scale: 0.98, y: 2 }}
      onClick={() => {
        navigator.vibrate?.(8);
        onToggle();
      }}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-3 rounded-2xl border-2 border-b-4 px-4 py-3.5 text-left text-[16px] font-bold transition-[background-color,border-color,color] duration-150',
        checked ? 'border-struct/60 bg-struct-soft text-struct-ink' : 'border-black/10 bg-white text-ink hover:bg-black/[0.02]',
      )}
    >
      {icon && (
        <motion.span
          className="grid shrink-0 place-items-center leading-none"
          aria-hidden
          animate={checked ? { y: [0, -6, 0], rotate: [0, -12, 0], scale: [1, 1.2, 1] } : { y: 0, rotate: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
        >
          {icon}
        </motion.span>
      )}
      <span className="min-w-0 flex-1">{label}</span>
      {aside && <span className={cn('shrink-0 text-[14px] font-medium', checked ? 'text-struct-ink' : 'text-ink-3')}>{aside}</span>}
      {multi && (
        <span className={cn('grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors duration-150', checked ? 'border-struct bg-struct' : 'border-black/15 bg-white')} aria-hidden>
          <svg viewBox="0 0 12 12" className="size-3.5 text-white">
            <motion.path
              d="M2.5 6.2l2.2 2.2 4.8-4.9"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={false}
              animate={{ pathLength: checked ? 1 : 0, opacity: checked ? 1 : 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}
            />
          </svg>
        </span>
      )}
    </motion.button>
  );
}

/** A frosted layer over the page with something said on top of it. */
export function BlurOver({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn('fixed inset-0 z-40 flex flex-col', className)}
      // the blur is fixed; fading the layer in and out fades the frost with it
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] } }}
      transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
      style={{ backdropFilter: 'blur(18px)', WebkitBackdropFilter: 'blur(18px)' }}
    >
      {children}
    </motion.div>
  );
}

// ---------- multi-select (Emoji Spree Choice Chips) ----------

interface Choice {
  id: string;
  icon: ReactNode;
  label: string;
}

const Tick = ({ on }: { on: boolean }) => (
  <span className={cn('grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors duration-150', on ? 'border-ink bg-ink' : 'border-black/15')} aria-hidden>
    <svg viewBox="0 0 12 12" className="size-3 text-white">
      <motion.path
        d="M2.5 6.2l2.2 2.2 4.8-4.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={false}
        animate={{ pathLength: on ? 1 : 0, opacity: on ? 1 : 0 }}
        transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
      />
    </svg>
  </span>
);

/**
 * Watermelon's emoji spree chips, made controlled: picking a chip sends its emoji up in a little
 * burst, the emoji hops and the check draws itself. `layout="rows"` stacks full-width rows.
 */
export function EmojiChoices({ items, value, onChange, label, layout = 'wrap' }: { items: Choice[]; value: string[]; onChange: (ids: string[]) => void; label: string; layout?: 'wrap' | 'rows' }) {
  const [burst, setBurst] = useState<{ key: number; icon: ReactNode; x: number } | null>(null);
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const toggle = (c: Choice, el: HTMLElement) => {
    const on = value.includes(c.id);
    onChange(on ? value.filter((x) => x !== c.id) : [...value, c.id]);
    navigator.vibrate?.(8);
    if (!on && !reduce) {
      const r = el.getBoundingClientRect();
      const b = box.current?.getBoundingClientRect();
      setBurst({ key: Date.now(), icon: c.icon, x: b ? r.left + r.width / 2 - b.left : 0 });
    }
  };
  return (
    <div className="relative" ref={box}>
      <motion.div
        role="group"
        aria-label={label}
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.035 } } }}
        className={cn(layout === 'rows' ? 'flex flex-col gap-2.5' : 'flex flex-wrap gap-2.5')}
      >
        {items.map((c) => {
          const on = value.includes(c.id);
          return (
            <motion.button
              key={c.id}
              type="button"
              role="checkbox"
              aria-checked={on}
              variants={rise}
              whileTap={{ scale: 0.97 }}
              onClick={(e) => toggle(c, e.currentTarget)}
              className={cn(
                'group flex cursor-pointer items-center gap-3 border text-left font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,color] duration-200',
                layout === 'rows' ? 'w-full rounded-2xl px-4 py-3.5 text-[15px]' : 'rounded-full px-4 py-2 text-[15px]',
                on ? 'border-ink bg-white text-ink shadow-sm' : 'border-black/[0.06] bg-black/[0.035] text-ink-2 hover:bg-black/[0.06]',
              )}
            >
              <motion.span
                className={layout === 'rows' ? 'text-xl' : 'text-base'}
                aria-hidden
                animate={on ? { y: [0, -6, 0], rotate: [0, -12, 0], scale: [1, 1.2, 1] } : { y: 0, rotate: 0, scale: 1 }}
                transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
              >
                {c.icon}
              </motion.span>
              <span className={cn(layout === 'rows' && 'flex-1 whitespace-normal')}>{c.label}</span>
              {layout === 'rows' && <Tick on={on} />}
            </motion.button>
          );
        })}
      </motion.div>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-0" aria-hidden>
        <AnimatePresence>
          {burst &&
            [0, 1, 2].map((i) => (
              <motion.span
                key={`${burst.key}-${i}`}
                className="absolute top-6 text-2xl"
                style={{ left: burst.x }}
                initial={{ y: 0, x: '-50%', opacity: 0, scale: 0.6 }}
                animate={{ y: [0, -110, -110, -60], x: ['-50%', `calc(-50% + ${(i - 1) * 46}px)`], opacity: [0, 1, 1, 0], scale: [0.6, 1.5, 1.5, 0.8], rotate: [0, (i - 1) * 20] }}
                transition={{ duration: 0.9, ease: 'easeOut', delay: i * 0.06 }}
                onAnimationComplete={() => i === 2 && setBurst(null)}
              >
                {burst.icon}
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ---------- segmented choice (Continuous Tabs) ----------

export function Segmented<T extends string | number>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full rounded-2xl bg-black/[0.045] p-1">
      {items.map((it) => {
        const on = it.id === value;
        return (
          <motion.button
            key={String(it.id)}
            type="button"
            role="radio"
            aria-checked={on}
            whileTap={{ scale: 0.95 }}
            onClick={() => onChange(it.id)}
            className={cn('relative h-10 flex-1 cursor-pointer rounded-xl border-0 bg-transparent text-sm font-semibold transition-colors duration-200', on ? 'text-ink' : 'text-ink-3')}
          >
            {on && <motion.span layoutId={`seg-${id}`} className="absolute inset-0 rounded-xl bg-white shadow-sm" transition={ui} />}
            <span className="relative">{it.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}

// ---------- text field (Onboarding Screen input) ----------

export function Field({ label, hint, error, className, id: given, ...props }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  const auto = useId();
  const id = given ?? auto;
  return (
    <div className={cn('flex flex-col gap-2 text-left', className)}>
      <label htmlFor={id} className="text-[11px] font-semibold tracking-wider text-ink-3 uppercase">
        {label}
      </label>
      <motion.div animate={error ? { x: [0, -8, 8, -5, 5, 0] } : { x: 0 }} transition={{ duration: 0.35 }}>
        <input
          id={id}
          aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-d` : undefined}
          className={cn(
            'h-13 w-full rounded-2xl border-[1.5px] bg-white px-4 text-base text-ink outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-black/30 focus:border-ink focus:ring-4 focus:ring-black/[0.06]',
            error ? 'border-danger' : 'border-black/10',
          )}
          {...props}
        />
      </motion.div>
      <AnimatePresence initial={false}>
        {(error || hint) && (
          <motion.p
            key={error ? 'e' : 'h'}
            id={`${id}-d`}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={ui}
            className={cn('text-[13px]', error ? 'font-medium text-danger' : 'text-ink-3')}
            role={error ? 'alert' : undefined}
          >
            {error || hint}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------- number keypad ----------

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'] as const;

/** On-screen digits, so the amount screen opens ready to type. `onReject` fires on a key it can't take. */
export function Keypad({ value, onChange, maxDigits = 6, onReject }: { value: string; onChange: (v: string) => void; maxDigits?: number; onReject?: () => void }) {
  const press = (k: string) => {
    navigator.vibrate?.(6);
    if (k === 'del') return value ? onChange(value.slice(0, -1)) : onReject?.();
    if (value.length >= maxDigits || (value === '' && k === '0')) return onReject?.();
    onChange(value + k);
  };
  // a physical keyboard works too
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') press('del');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <motion.div variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.025, delayChildren: 0.1 } } }} className="mt-auto grid grid-cols-3 gap-1" role="group" aria-label="Number pad">
      {KEYS.map((k, i) =>
        k === '' ? (
          <span key={`gap${i}`} />
        ) : (
          <motion.button
            key={k}
            type="button"
            variants={{ hidden: { opacity: 0, scale: 0.85 }, shown: { opacity: 1, scale: 1, transition: ui } }}
            whileTap={{ scale: 0.88, backgroundColor: 'rgba(0,0,0,0.07)', transition: { duration: 0.08 } }}
            onClick={() => press(k)}
            aria-label={k === 'del' ? 'Delete' : k}
            className="grid h-14 cursor-pointer place-items-center rounded-2xl border-0 bg-transparent text-[26px] font-medium text-ink tabular-nums"
          >
            {k === 'del' ? <Delete size={22} aria-hidden /> : k}
          </motion.button>
        ),
      )}
    </motion.div>
  );
}

/** A big amount that rolls its digits and shakes when the keypad refuses a key. */
export function AmountDisplay({ value, shake }: { value: string; shake: number }) {
  const controls = useAnimationControls();
  useEffect(() => {
    if (shake) void controls.start({ x: [0, -10, 10, -6, 6, 0], transition: { duration: 0.35 } });
  }, [shake, controls]);
  return (
    <motion.p animate={controls} className={cn('flex items-baseline gap-2 text-[56px] leading-none font-semibold tracking-tight tabular-nums transition-colors duration-200', value ? 'text-ink' : 'text-black/20')} aria-live="polite">
      <NumberFlow value={Number(value || 0)} locales="en-GB" />
      <span className="text-xl font-medium text-ink-3">lei</span>
    </motion.p>
  );
}

// ---------- six code boxes (Input OTP) ----------

export type CodeState = 'idle' | 'error' | 'success';

/**
 * input-otp handles one-time-code autofill and paste; onComplete fires on the sixth digit. Each
 * digit pops into its box, a wrong code shakes the row, a right one turns it green box by box.
 */
export function CodeBoxes({ value, onChange, onComplete, error, disabled, state = error ? 'error' : 'idle' }: { value: string; onChange: (v: string) => void; onComplete: (code: string) => void; error?: boolean; disabled?: boolean; state?: CodeState }) {
  const controls = useAnimationControls();
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state === 'error') void controls.start({ x: [0, -12, 12, -8, 8, -3, 0], transition: { duration: 0.4 } });
  }, [state, controls]);
  // checking the code disables the field, which drops the keyboard; bring it back for another try
  useEffect(() => {
    if (!disabled && state !== 'success') box.current?.querySelector('input')?.focus();
  }, [disabled, state]);
  return (
    <motion.div animate={controls} ref={box}>
      <OTPInput
        maxLength={6}
        value={value}
        onChange={onChange}
        onComplete={onComplete}
        pattern={REGEXP_ONLY_DIGITS}
        inputMode="numeric"
        autoComplete="one-time-code"
        autoFocus
        disabled={disabled}
        aria-label="6-digit code"
        containerClassName="flex w-full items-center"
        render={({ slots }) => (
          <motion.div className="grid w-full grid-cols-6 gap-2" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.04 } } }}>
            {slots.map((s, i) => (
              <motion.div
                key={i}
                variants={{ hidden: { opacity: 0, y: 10 }, shown: { opacity: 1, y: 0, transition: ui } }}
                animate={state === 'success' ? { y: [0, -6, 0], transition: { delay: i * 0.05, duration: 0.35 } } : undefined}
                className={cn(
                  'relative grid h-14 place-items-center rounded-2xl border-[1.5px] text-2xl font-semibold tabular-nums transition-[border-color,background-color,box-shadow,color] duration-200',
                  state === 'success'
                    ? 'border-struct bg-struct-soft text-struct-ink'
                    : state === 'error'
                      ? 'border-danger bg-white text-ink'
                      : s.isActive
                        ? 'border-ink bg-white text-ink ring-4 ring-black/[0.06]'
                        : 'border-black/10 bg-white text-ink',
                )}
                style={{ transitionDelay: state === 'success' ? `${i * 50}ms` : undefined }}
              >
                <AnimatePresence mode="popLayout" initial={false}>
                  {s.char && (
                    <motion.span key={s.char} initial={{ scale: 0.4, opacity: 0, y: 6 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.6, opacity: 0 }} transition={pop}>
                      {s.char}
                    </motion.span>
                  )}
                </AnimatePresence>
                {s.hasFakeCaret && <motion.span className="absolute h-6 w-px bg-ink" animate={{ opacity: [1, 0, 1] }} transition={{ repeat: Infinity, duration: 1, times: [0, 0.5, 1], ease: 'linear' }} />}
              </motion.div>
            ))}
          </motion.div>
        )}
      />
    </motion.div>
  );
}

export function ResendTimer({ onResend, seconds = 30 }: { onResend: () => void; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    if (left <= 0) return;
    const t = window.setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => window.clearTimeout(t);
  }, [left]);
  return (
    <p className="flex h-6 items-center text-sm text-ink-3" aria-live="polite">
      <AnimatePresence mode="popLayout" initial={false}>
        {left > 0 ? (
          <motion.span key="wait" className="flex items-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={ui}>
            Resend code in 0:{String(left).padStart(2, '0')}
          </motion.span>
        ) : (
          <motion.span key="ready" className="flex items-center" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={ui}>
            Didn't get it?
            <button
              type="button"
              className="cursor-pointer border-0 bg-transparent pl-1 font-semibold text-ink underline-offset-4 hover:underline"
              onClick={() => {
                onResend();
                setLeft(seconds);
              }}
            >
              Resend code
            </button>
          </motion.span>
        )}
      </AnimatePresence>
    </p>
  );
}

// ---------- goal card ----------

export function GoalCard({ icon, iconKey, name, line, weekly, children }: { icon: ReactNode; iconKey: string; name: string; line: string; weekly?: number; children?: ReactNode }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20, scale: 0.97 }, shown: { opacity: 1, y: 0, scale: 1, transition: ui } }}
      className="w-full rounded-3xl border border-black/[0.06] bg-white p-4 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.12)]"
    >
      <div className="flex items-center gap-3">
        <motion.span layout transition={ui} className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-2xl" aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span key={iconKey} initial={{ scale: 0.3, rotate: -30, opacity: 0 }} animate={{ scale: 1, rotate: 0, opacity: 1 }} exit={{ scale: 0.3, opacity: 0 }} transition={pop}>
              {icon}
            </motion.span>
          </AnimatePresence>
        </motion.span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[15px] font-semibold text-ink">{name}</span>
          <span className="text-[13px] text-ink-3">{line}</span>
        </div>
        {weekly !== undefined && (
          <span className="shrink-0 text-right text-[15px] font-semibold text-ink tabular-nums">
            <NumberFlow value={weekly / 100} locales="en-GB" suffix=" lei" />
            <span className="block text-[11px] font-medium text-ink-3">a week</span>
          </span>
        )}
      </div>
      {children}
    </motion.div>
  );
}

// ---------- ambient ----------

/** Gentle up-and-down drift for an illustration; still under reduced motion. */
export function Float({ children, amount = 6, duration = 3.2 }: { children: ReactNode; amount?: number; duration?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div animate={reduce ? undefined : { y: [0, -amount, 0] }} transition={{ repeat: Infinity, duration, ease: 'easeInOut' }}>
      {children}
    </motion.div>
  );
}

// ---------- Face ID ----------

/**
 * Registers a platform passkey (Face ID, Touch ID, Windows Hello or the device passcode) when the
 * browser has one. Without a platform authenticator it records the choice so it can be honoured on
 * a device that has one. Throws when the user cancels the system prompt.
 */
export async function enableDeviceUnlock(accountId: string, name: string): Promise<'passkey' | 'saved'> {
  const PKC = window.PublicKeyCredential;
  if (!PKC || !(await PKC.isUserVerifyingPlatformAuthenticatorAvailable?.().catch(() => false))) return 'saved';
  const cred = (await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: 'kip' },
      user: { id: new TextEncoder().encode(accountId), name: name || 'kip', displayName: name || 'kip' },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
      timeout: 60_000,
    },
  })) as PublicKeyCredential | null;
  if (cred) rememberDeviceUnlock(accountId, cred.rawId);
  return 'passkey';
}

/** Face ID glyph with a scan line sweeping over it; turns into a drawn check once `done`. */
export function FaceScan({ done }: { done?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={pop}
      className={cn(
        'relative grid size-28 place-items-center overflow-hidden rounded-[32px] border bg-white shadow-[0_8px_24px_-12px_rgba(0,0,0,0.15)] transition-colors duration-300',
        done ? 'border-struct/30 text-struct' : 'border-black/[0.06] text-ink',
      )}
    >
      <svg viewBox="0 0 52 52" className="size-14" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {/* corners */}
        <path d="M4 16V9a5 5 0 0 1 5-5h7M36 4h7a5 5 0 0 1 5 5v7M48 36v7a5 5 0 0 1-5 5h-7M16 48H9a5 5 0 0 1-5-5v-7" />
        <AnimatePresence mode="wait" initial={false}>
          {done ? (
            <motion.path key="check" d="M16 27l7 7 13-15" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35, ease: [0.2, 0, 0, 1] }} />
          ) : (
            <motion.g key="face" exit={{ opacity: 0, scale: 0.8 }} transition={{ duration: 0.15 }}>
              <path d="M19 20v3M33 20v3M26 20v8h-2M20 35c3.5 3 8.5 3 12 0" />
            </motion.g>
          )}
        </AnimatePresence>
      </svg>
      {!done && !reduce && (
        <motion.span
          className="absolute inset-x-6 h-0.5 rounded-full bg-struct/70 shadow-[0_0_12px_2px_rgba(31,93,246,0.35)]"
          animate={{ top: ['22%', '78%', '22%'] }}
          transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
        />
      )}
    </motion.div>
  );
}

// ---------- confetti ----------

const CONFETTI_COLORS = ['var(--struct)', 'var(--struct-bright)', 'var(--ink)', 'var(--gold)', 'var(--surface-3)'];

/** A short burst from the top that stays behind the content. */
export function Confetti({ count = 28 }: { count?: number }) {
  const reduce = useReducedMotion();
  const [bits] = useState(() =>
    Array.from({ length: count }, (_, i) => ({
      x: 5 + Math.random() * 90,
      delay: Math.random() * 0.3,
      dur: 1.6 + Math.random() * 1,
      rot: (Math.random() - 0.5) * 540,
      drift: (Math.random() - 0.5) * 80,
      w: 5 + Math.random() * 4,
      color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    })),
  );
  if (reduce) return null;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
      {bits.map((b, i) => (
        <motion.span
          key={i}
          className="absolute top-0 rounded-[2px]"
          style={{ left: `${b.x}%`, width: b.w, height: b.w * 1.8, background: b.color }}
          initial={{ y: -30, x: 0, rotate: 0, opacity: 1 }}
          animate={{ y: '70vh', x: b.drift, rotate: b.rot, opacity: [1, 1, 0] }}
          transition={{ duration: b.dur, delay: b.delay, ease: [0.2, 0.6, 0.4, 1] }}
        />
      ))}
    </div>
  );
}
