// Adapted from Watermelon UI "Button 12" (a fully rounded pill with a leading icon) and "Button 19"
// (a ghost button whose icon nudges on hover), both built on Watermelon's base `button`
// (ui.watermelon.sh/components/button, registry.watermelon.sh/r/button-12.json and button-19.json).
//
// Kept: the pill shape, icon + label, the hover nudge, a ring for keyboard focus.
// Changed: no class-variance-authority or Radix Slot (one look, a plain <button>), Kip's colours
// (navy text on a frosted white pill, sea-blue tint on hover), and a 44px tap target around a 36px
// pill so the header stays light without being hard to hit. Text styles sit on an inner span
// because the app's base.css resets `button { font: inherit }` outside Tailwind's layers.
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PillButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: ReactNode;
}

export function PillButton({ icon, children, className, style, type = 'button', ...props }: PillButtonProps) {
  return (
    <button
      type={type}
      // the visible ring is drawn on the pill itself; the global outline would frame the 44px box
      style={{ outline: 'none', ...style }}
      className={cn('group relative inline-flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0', className)}
      {...props}
    >
      <span
        className={cn(
          'inline-flex h-9 items-center gap-1.5 rounded-full bg-white/75 px-3.5 text-ink-2 ring-1 ring-line ring-inset',
          'transition-[background-color,color,box-shadow,transform] duration-200 ease-out',
          'group-hover:bg-struct-soft group-hover:text-struct-ink group-hover:ring-struct/30',
          'group-focus-visible:text-struct-ink group-focus-visible:ring-2 group-focus-visible:ring-struct group-active:scale-[0.97]',
        )}
      >
        {icon && (
          <span className="inline-flex shrink-0 transition-transform duration-200 ease-out group-hover:translate-x-0.5" aria-hidden>
            {icon}
          </span>
        )}
        <span className="text-[14px] leading-none font-semibold tracking-[-0.005em] whitespace-nowrap">{children}</span>
      </span>
    </button>
  );
}
