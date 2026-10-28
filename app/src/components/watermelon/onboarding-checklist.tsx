// Adapted from Watermelon UI "Onboarding Checklist" (ui.watermelon.sh/animated-components/onboarding-checklist):
// collapsible card with a tick-bar meter and spring height animation. Steps are real actions here.
import { Check, ChevronRight, ChevronUp } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';

export interface ChecklistStep {
  id: string;
  title: string;
  done: boolean;
  onClick?: () => void;
}

export function OnboardingChecklist({ steps, title = 'Getting started', defaultOpen = true }: { steps: ChecklistStep[]; title?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const done = steps.filter((s) => s.done).length;
  const spring = { type: 'spring', stiffness: 300, damping: 30 } as const;
  const nextId = steps.find((s) => !s.done)?.id;

  return (
    <motion.div layout transition={spring} className="w-full overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-[0_8px_24px_rgba(21,32,27,0.06)]">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between border-0 bg-transparent p-3.5 text-left select-none">
        <span className="flex min-w-0 items-center gap-3">
          <motion.span animate={{ rotate: open ? 0 : 180 }} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-3">
            <ChevronUp size={22} aria-hidden />
          </motion.span>
          <span className="truncate text-[15px] font-bold text-ink">{title}</span>
        </span>
        <span className="ml-1 flex shrink-0 items-center gap-3">
          <span className="flex gap-[3px]" aria-hidden>
            {Array.from({ length: 14 }).map((_, i) => (
              <span key={i} className={`h-4 w-[3.5px] rounded-full transition-colors duration-500 ${i < (done / steps.length) * 14 ? 'bg-accent' : 'bg-[#e3dfd6]'}`} />
            ))}
          </span>
          <span className="min-w-7 text-right text-[13px] font-bold text-ink-3">
            {done}/{steps.length}
          </span>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={spring} className="m-0 list-none rounded-t-3xl border-t border-line bg-surface p-2">
            {steps.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  disabled={s.done || !s.onClick}
                  onClick={s.onClick}
                  className="group flex w-full cursor-pointer items-center justify-between rounded-xl border-0 bg-transparent p-3 px-4 text-left transition-all hover:bg-bg active:scale-[0.98] disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    {s.done ? (
                      <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent shadow-sm">
                        <Check size={13} strokeWidth={4} className="text-white" aria-hidden />
                      </motion.span>
                    ) : (
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[12px] font-bold ${s.id === nextId ? 'border-ink bg-ink text-white' : 'border-line text-ink-3'}`}>{i + 1}</span>
                    )}
                    <span className={`truncate text-[15px] font-medium ${s.done ? 'text-ink-3 line-through decoration-ink-3/40' : 'text-ink'}`}>{s.title}</span>
                  </span>
                  {!s.done && s.onClick && <ChevronRight size={16} className="shrink-0 text-ink-3" aria-hidden />}
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
