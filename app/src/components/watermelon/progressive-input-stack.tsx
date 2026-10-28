// Adapted from Watermelon UI "Progressive Input Stack"
// (ui.watermelon.sh/animated-components/progressive-input-stack): each field drops onto a
// stack as you finish the one before, and the button morphs from Next to Done. Added per-step
// validation, input types, a password reveal toggle and an inline error line.
import { ArrowLeft, ArrowRight, Check, Eye, EyeOff } from '@/lib/icons';
import { AnimatePresence, motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StackStep {
  id: string;
  label: string;
  type: 'text' | 'email' | 'password';
  placeholder?: string;
  autoComplete?: string;
  /** Return an error message to block moving on. */
  validate?: (value: string) => string | null;
  /** Rendered under the stack while this step is on top (e.g. a strength meter). */
  helper?: (value: string) => ReactNode;
}

interface Props {
  steps: StackStep[];
  values: Record<string, string>;
  onChange: (id: string, value: string) => void;
  onSubmit: () => void;
  onStepChange?: (index: number) => void;
  busy?: boolean;
  doneLabel?: string;
  error?: string | null;
}

const spring = { type: 'spring' as const, stiffness: 800, damping: 45, mass: 2 };

export function ProgressiveInputStack({ steps, values, onChange, onSubmit, onStepChange, busy, doneLabel = 'Gata', error }: Props) {
  const [current, setCurrent] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const step = steps[current];
  const last = current === steps.length - 1;

  const go = (i: number) => {
    setCurrent(i);
    setStepError(null);
    onStepChange?.(i);
  };

  const next = () => {
    const msg = step.validate?.(values[step.id] ?? '') ?? null;
    setStepError(msg);
    if (msg) return;
    if (last) onSubmit();
    else go(current + 1);
  };

  const shownError = stepError ?? (last ? error : null);

  return (
    <form
      className="relative flex w-full flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      noValidate
    >
      <div className="relative h-[64px] w-full">
        <AnimatePresence mode="popLayout" initial={false}>
          {steps.map((s, index) => {
            if (index > current) return null;
            const position = current - index;
            const isTop = index === current;
            const type = s.type === 'password' && reveal ? 'text' : s.type;
            return (
              <motion.div
                key={s.id}
                initial={{ opacity: 0, scale: 1.2, y: 15 }}
                animate={{ opacity: 1, scale: 1 - position * 0.05, y: -position * 12 }}
                exit={{ opacity: 0, scale: 1.2, y: 15 }}
                transition={spring}
                style={{ zIndex: steps.length - position }}
                className={cn(
                  'absolute inset-0 flex h-[64px] items-center gap-2 rounded-2xl border-2 bg-surface px-4 shadow-[0_6px_18px_rgba(21,32,27,0.08)] transition-colors',
                  isTop ? (shownError ? 'border-danger' : 'border-accent') : 'pointer-events-none border-line opacity-50',
                )}
              >
                {isTop ? (
                  <>
                    <label className="sr-only" htmlFor={`pis-${s.id}`}>
                      {s.label}
                    </label>
                    <input
                      id={`pis-${s.id}`}
                      autoFocus
                      type={type}
                      inputMode={s.type === 'email' ? 'email' : undefined}
                      autoComplete={s.autoComplete}
                      value={values[s.id] ?? ''}
                      onChange={(e) => {
                        onChange(s.id, e.target.value);
                        if (stepError) setStepError(null);
                      }}
                      placeholder={s.placeholder ?? s.label}
                      aria-invalid={shownError ? true : undefined}
                      className="w-full border-0 bg-transparent text-lg font-semibold text-ink outline-none placeholder:font-medium placeholder:text-ink-3/70"
                    />
                    {s.type === 'password' && (
                      <button
                        type="button"
                        onClick={() => setReveal((r) => !r)}
                        aria-label={reveal ? 'Ascunde parola' : 'Arată parola'}
                        className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-ink-3 hover:bg-surface-2 hover:text-ink"
                      >
                        {reveal ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
                      </button>
                    )}
                  </>
                ) : (
                  <span className="truncate text-lg font-semibold text-ink-3">{s.type === 'password' ? '••••••••' : values[s.id]}</span>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      <div className="min-h-6 px-1">
        <AnimatePresence mode="wait">
          {shownError ? (
            <motion.p key="err" role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="m-0 text-sm font-medium text-danger">
              {shownError}
            </motion.p>
          ) : (
            <motion.div key={`h-${step.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {step.helper?.(values[step.id] ?? '')}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex items-center">
        <AnimatePresence>
          {current > 0 && (
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              onClick={() => go(current - 1)}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              aria-label="Înapoi la câmpul anterior"
              className="flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border-0 bg-surface-2 text-ink transition hover:bg-[#e4e0d7]"
            >
              <ArrowLeft size={22} aria-hidden />
            </motion.button>
          )}
        </AnimatePresence>
        <motion.button type="submit" disabled={busy} whileTap={{ scale: 0.96 }} className="btn btn--primary ml-auto overflow-hidden" style={{ minWidth: 150 }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {busy ? (
              <motion.span key="busy" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="spinner" aria-label="Îți creăm contul" />
            ) : last ? (
              <motion.span key="done" initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }} transition={{ duration: 0.2, ease: 'easeOut' }} className="flex items-center gap-2">
                <Check size={18} aria-hidden />
                {doneLabel}
              </motion.span>
            ) : (
              <motion.span key="next" initial={{ y: 20, opacity: 0, filter: 'blur(4px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: -20, opacity: 0, filter: 'blur(4px)' }} transition={{ duration: 0.2, ease: 'easeOut' }} className="flex items-center gap-2">
                Înainte
                <ArrowRight size={18} aria-hidden />
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </form>
  );
}
