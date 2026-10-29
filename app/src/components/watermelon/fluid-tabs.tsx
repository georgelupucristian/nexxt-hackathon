// Adapted from Watermelon UI "Fluid Tabs" (ui.watermelon.sh/animated-components/fluid-tabs):
// same spring-driven floating pill and blur pulse, made controlled and themed with app tokens.
import { motion } from 'motion/react';
import { useId, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface FluidTabItem<T extends string> {
  id: T;
  label: string;
  icon?: ReactNode;
}

interface FluidTabsProps<T extends string> {
  tabs: FluidTabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  label: string;
  className?: string;
}

export function FluidTabs<T extends string>({ tabs, value, onChange, label, className }: FluidTabsProps<T>) {
  // layoutId must be unique per instance or two tab groups on one screen share a pill
  const pillId = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn('relative flex items-center gap-1 rounded-full border border-line bg-surface-2 p-1', className)}>
      {tabs.map((tab) => {
        const isActive = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onChange(tab.id)}
            className="group relative flex-1 cursor-pointer rounded-full border-0 bg-transparent px-3 py-2.5 outline-none focus-visible:ring-2 focus-visible:ring-struct"
          >
            {isActive && (
              <motion.div
                layoutId={pillId}
                transition={{ type: 'spring', stiffness: 280, damping: 25, mass: 0.8 }}
                className="absolute inset-0 rounded-full border border-white/90 bg-gradient-to-b from-white to-[#f3f8ff] shadow-[0_2px_8px_rgba(14,26,51,0.10)]"
              />
            )}
            <motion.div
              transition={{ duration: 0.3, ease: 'easeOut' }}
              animate={{ filter: isActive ? ['blur(0px)', 'blur(3px)', 'blur(0px)'] : 'blur(0px)' }}
              className={cn(
                'relative z-10 flex items-center justify-center gap-1.5 transition-colors duration-200',
                isActive ? 'font-bold text-ink' : 'font-semibold text-ink-3 group-hover:text-ink-2',
              )}
            >
              {tab.icon && (
                <motion.span animate={{ scale: isActive ? 1.08 : 1 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }} className="flex shrink-0 items-center">
                  {tab.icon}
                </motion.span>
              )}
              <span className="text-[15px] tracking-tight whitespace-nowrap">{tab.label}</span>
            </motion.div>
          </button>
        );
      })}
    </div>
  );
}
