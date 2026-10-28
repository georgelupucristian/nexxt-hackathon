// Adapted from Watermelon UI "Dropdown Disclosure" (ui.watermelon.sh/animated-components/dropdown-disclosure)
// and the field shape of "Select 10" (ui.watermelon.sh/components/select): a spring-driven list
// with a check that pops in on the chosen row, inside the rounded trigger + popper card of the
// shadcn-style select. Rebuilt as a drop-in for a native <select>: controlled value/onChange,
// the ARIA listbox pattern (focus moves to the list, rows are tracked with
// aria-activedescendant), full keyboard support with type-ahead, and a popover portalled to
// <body> with fixed positioning so it escapes the scrolling bottom sheets. It flips upward
// when there's no room below and scrolls when the list is long.
//
// Two unlayered rules in base.css beat Tailwind's layered utilities (`:focus-visible` sets an
// outline and a 6px radius), so radius and outline go in inline styles here.
import { Check, ChevronDown } from '@/lib/icons';
import { AnimatePresence, motion, useReducedMotionConfig, type Transition } from 'motion/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Second line under the label in the list, e.g. "120 lei free". Not shown in the trigger. */
  hint?: string;
  disabled?: boolean;
}

export interface SelectProps<T extends string = string> {
  value: T | null | undefined;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** Accessible name. Shown above the trigger (md) or beside it (sm) unless `hideLabel`. */
  label: string;
  /** Keep the label for screen readers only, e.g. when a <Field> already shows it. */
  hideLabel?: boolean;
  /** Shown when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  /** md: 52px form field, full width. sm: 40px inline filter control. */
  size?: 'md' | 'sm';
  /** Goes on the trigger button, so <label htmlFor={id}> keeps working. */
  id?: string;
  /** Renders a hidden input so the value is submitted with a <form>. */
  name?: string;
  className?: string;
  'aria-describedby'?: string;
}

// Sheets sit at 50, toasts and the dial at 60, celebrations at 70/75, the tour at 90.
const Z = 80;
const GAP = 6; // trigger to popover
const EDGE = 8; // keep clear of the viewport edge
const MAX_H = 320; // about seven rows, then the list scrolls
const MIN_H = 132; // never squash the list below ~three rows, even with no room
const TYPE_RESET_MS = 700;

const spring: Transition = { type: 'spring', stiffness: 520, damping: 34, mass: 0.8 };
const instant: Transition = { duration: 0 };

interface Pos {
  left: number;
  top?: number;
  bottom?: number;
  minWidth: number;
  maxWidth: number;
  maxHeight: number;
  origin: string;
}

const samePos = (a: Pos | null, b: Pos) =>
  !!a &&
  a.left === b.left &&
  a.top === b.top &&
  a.bottom === b.bottom &&
  a.minWidth === b.minWidth &&
  a.maxWidth === b.maxWidth &&
  a.maxHeight === b.maxHeight &&
  a.origin === b.origin;

// Type-ahead ignores case and diacritics, so "s" finds "Școală" and "Ș" finds "Sport".
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const isPrintable = (e: KeyboardEvent) => e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  label,
  hideLabel = false,
  placeholder = 'Choose…',
  disabled = false,
  size = 'md',
  id,
  name,
  className,
  'aria-describedby': describedBy,
}: SelectProps<T>) {
  const uid = useId();
  const triggerId = id ?? `${uid}-trigger`;
  const labelId = `${uid}-label`;
  const valueId = `${uid}-value`;
  const listId = `${uid}-list`;
  const optId = (i: number) => `${uid}-opt-${i}`;

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<Pos | null>(null);
  // 'center' once on open (show the chosen row mid-list), 'nearest' after a key move; pointer
  // hover never scrolls, or a half-visible row would jump under the cursor.
  const reveal = useRef<'center' | 'nearest' | null>(null);
  const pendingFocus = useRef(false);
  const typed = useRef({ buf: '', at: 0 });
  const reduced = useReducedMotionConfig() ?? false;

  const sm = size === 'sm';
  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;

  // ---------- index helpers (disabled rows are skipped) ----------
  const step = (from: number, dir: 1 | -1) => {
    for (let i = from + dir; i >= 0 && i < options.length; i += dir) if (!options[i].disabled) return i;
    return from;
  };
  const first = () => step(-1, 1);
  const last = () => {
    const i = step(options.length, -1);
    return i < options.length ? i : -1;
  };

  const typeahead = (key: string, from: number) => {
    const now = Date.now();
    const t = typed.current;
    t.buf = now - t.at > TYPE_RESET_MS ? key : t.buf + key;
    t.at = now;
    const q = fold(t.buf);
    // pressing the same letter repeatedly cycles through rows starting with it
    const cycling = [...q].every((c) => c === q[0]);
    const needle = cycling ? q[0] : q;
    const start = cycling ? from + 1 : Math.max(from, 0);
    for (let k = 0; k < options.length; k++) {
      const i = (start + k) % options.length;
      if (!options[i].disabled && fold(options[i].label).startsWith(needle)) return i;
    }
    return -1;
  };
  const typing = () => typed.current.buf !== '' && Date.now() - typed.current.at <= TYPE_RESET_MS;

  // ---------- open / close / commit ----------
  const openList = (start: number) => {
    if (disabled || options.length === 0) return;
    setActive(start);
    setPos(null); // re-measured before paint; a stale spot from last time never shows
    reveal.current = 'center';
    pendingFocus.current = true;
    setOpen(true);
  };

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus({ preventScroll: true });
  }, []);

  const commit = (i: number) => {
    const o = options[i];
    if (!o || o.disabled) return;
    close(true);
    if (o.value !== value) onChange(o.value);
  };

  const move = (i: number) => {
    if (i < 0) return;
    reveal.current = 'nearest';
    setActive(i);
  };

  const startIndex = () => (selected && !selected.disabled ? selectedIndex : first());

  // ---------- positioning ----------
  const place = useCallback(() => {
    const trigger = triggerRef.current;
    const pop = popRef.current;
    const list = listRef.current;
    if (!trigger || !pop || !list) return;
    const r = trigger.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    // the trigger scrolled out of view (e.g. inside a sheet): don't leave the list floating
    if (r.bottom < 0 || r.top > vh) {
      setOpen(false);
      return;
    }
    const content = list.scrollHeight + 2; // + the 1px border top and bottom
    const below = vh - r.bottom - GAP - EDGE;
    const above = r.top - GAP - EDGE;
    const want = Math.min(content, MAX_H);
    const up = below < want && above > below;
    const room = Math.max(up ? above : below, MIN_H);
    const maxWidth = vw - EDGE * 2;
    const width = Math.min(Math.max(r.width, pop.offsetWidth), maxWidth);
    const left = Math.min(Math.max(r.left, EDGE), vw - EDGE - width);
    const originX = Math.min(Math.max(r.left + r.width / 2 - left, 0), width);
    const next: Pos = {
      left: Math.round(left),
      ...(up ? { bottom: Math.round(vh - r.top + GAP) } : { top: Math.round(r.bottom + GAP) }),
      minWidth: Math.round(Math.min(r.width, maxWidth)),
      maxWidth,
      maxHeight: Math.min(MAX_H, room) - 2,
      origin: `${Math.round(originX)}px ${up ? '100%' : '0%'}`,
    };
    setPos((prev) => (samePos(prev, next) ? prev : next));
  }, []);

  // Measure before the first paint, so the list never flashes in the wrong spot. Focus waits for
  // the position: until then the popover is visibility:hidden, which can't take focus.
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place]);

  useLayoutEffect(() => {
    if (!open || !pos || !pendingFocus.current) return;
    pendingFocus.current = false;
    listRef.current?.focus({ preventScroll: true });
  }, [open, pos]);

  // Keep the active row in view (manual scroll: scrollIntoView could also scroll the page).
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!open || !pos || !list || active < 0 || !reveal.current) return;
    const el = list.children[active] as HTMLElement | undefined;
    if (!el) return;
    if (reveal.current === 'center') {
      list.scrollTop = el.offsetTop - (list.clientHeight - el.offsetHeight) / 2;
    } else if (el.offsetTop < list.scrollTop) {
      list.scrollTop = el.offsetTop - 4;
    } else if (el.offsetTop + el.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = el.offsetTop + el.offsetHeight - list.clientHeight + 4;
    }
    reveal.current = null;
  }, [open, pos, active]);

  // While open: follow the trigger on scroll/resize, close on a press anywhere else.
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const follow = (e: Event) => {
      if (e.target === listRef.current) return; // scrolling the list itself
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
      // After the press settles: if it landed on another control, that control keeps focus;
      // if it landed on plain content, focus would fall to <body>, so hand it back to the trigger.
      window.setTimeout(() => {
        const a = document.activeElement;
        const trigger = triggerRef.current;
        if (trigger?.isConnected && (!a || a === document.body || popRef.current?.contains(a))) trigger.focus({ preventScroll: true });
      }, 0);
    };
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    document.addEventListener('pointerdown', onDown, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      document.removeEventListener('pointerdown', onDown, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (disabled && open) setOpen(false);
  }, [disabled, open]);

  // ---------- keyboard ----------
  // Enter and Space on the closed trigger are left to the button's own click.
  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (disabled || e.nativeEvent.isComposing) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      openList(selected && !selected.disabled ? selectedIndex : e.key === 'ArrowDown' ? first() : last());
    } else if (isPrintable(e) && e.key !== ' ') {
      const i = typeahead(e.key, selectedIndex);
      if (i >= 0) {
        e.preventDefault();
        openList(i);
      }
    }
  };

  const onListKey = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.nativeEvent.isComposing) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        move(active < 0 ? first() : step(active, 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        move(active < 0 ? last() : step(active, -1));
        break;
      case 'Home':
        e.preventDefault();
        move(first());
        break;
      case 'End':
        e.preventDefault();
        move(last());
        break;
      case 'PageDown':
      case 'PageUp': {
        e.preventDefault();
        const dir = e.key === 'PageDown' ? 1 : -1;
        let i = active < 0 ? startIndex() : active;
        for (let k = 0; k < 8; k++) i = step(i, dir);
        move(i);
        break;
      }
      case 'Enter':
        e.preventDefault();
        if (active >= 0) commit(active);
        else close(true);
        break;
      case 'Escape':
        // stop here so a surrounding Sheet (which closes on Escape) stays open
        e.preventDefault();
        e.stopPropagation();
        close(true);
        break;
      case 'Tab':
        // Hand focus back to the trigger and let the browser carry on to the next field.
        close(true);
        break;
      default:
        if (e.key === ' ' && !typing()) {
          e.preventDefault();
          if (active >= 0) commit(active);
          break;
        }
        if (isPrintable(e)) {
          e.preventDefault();
          move(typeahead(e.key, active));
        }
    }
  };

  // ---------- render ----------
  const radius = sm ? 10 : 12;
  const popStyle: CSSProperties = pos
    ? {
        left: pos.left,
        top: pos.top,
        bottom: pos.bottom,
        minWidth: pos.minWidth,
        maxWidth: pos.maxWidth,
        transformOrigin: pos.origin,
      }
    : { left: 0, top: 0, visibility: 'hidden' };

  const labelEl = (
    <span
      id={labelId}
      className={cn(
        hideLabel ? 'sr-only' : sm ? 'shrink-0 text-[14px] font-medium text-ink-2' : 'text-[14px] font-semibold text-ink',
        !hideLabel && !disabled && 'cursor-default',
      )}
      onClick={() => !disabled && triggerRef.current?.focus()}
    >
      {label}
    </span>
  );

  return (
    <div className={cn(sm ? 'inline-flex max-w-full items-center gap-2' : 'flex w-full flex-col gap-2', className)}>
      {labelEl}
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-labelledby={`${labelId} ${valueId}`}
        aria-describedby={describedBy}
        onClick={() => (open ? close(true) : openList(startIndex()))}
        onKeyDown={onTriggerKey}
        style={{ borderRadius: radius, outline: 'none' }}
        className={cn(
          'flex min-w-0 cursor-pointer items-center justify-between gap-2 border border-solid bg-surface text-left text-ink transition-[border-color,box-shadow,background-color] duration-150',
          sm ? 'min-h-10 max-w-full py-1.5 pr-2.5 pl-3 text-[14px]' : 'min-h-13 w-full py-2 pr-3.5 pl-4 text-[16px]',
          open
            ? 'border-ink shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_12%,transparent)]'
            : 'border-line hover:border-[color:var(--line-strong)] focus-visible:border-ink focus-visible:shadow-[0_0_0_3px_color-mix(in_srgb,var(--ink)_12%,transparent)]',
          'active:bg-surface-2 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-60 disabled:hover:border-line',
        )}
      >
        <span id={valueId} className={cn('min-w-0 flex-1 truncate', selected ? 'font-medium' : 'text-ink-3')}>
          {selected ? selected.label : placeholder}
        </span>
        <motion.span
          aria-hidden
          className="flex shrink-0 text-ink-3"
          animate={{ rotate: open ? 180 : 0 }}
          transition={reduced ? instant : { type: 'spring', stiffness: 420, damping: 28 }}
        >
          <ChevronDown size={sm ? 16 : 18} strokeWidth={2} />
        </motion.span>
      </button>
      {name && <input type="hidden" name={name} value={value ?? ''} />}

      {createPortal(
        <AnimatePresence>
          {open && (
            <motion.div
              ref={popRef}
              key="pop"
              initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.95 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduced ? { opacity: 0, transition: instant } : { opacity: 0, scale: 0.97, transition: { duration: 0.12, ease: 'easeOut' } }}
              transition={reduced ? instant : spring}
              style={{
                position: 'fixed',
                zIndex: Z,
                width: 'max-content',
                borderRadius: 12,
                boxShadow: 'var(--shadow-float)',
                ...popStyle,
              }}
              className="overflow-hidden border border-solid border-line bg-surface font-sans text-ink"
            >
              <ul
                ref={listRef}
                id={listId}
                role="listbox"
                tabIndex={-1}
                aria-labelledby={labelId}
                aria-activedescendant={active >= 0 ? optId(active) : undefined}
                onKeyDown={onListKey}
                style={{ maxHeight: pos?.maxHeight ?? MAX_H, outline: 'none' }}
                className="relative m-0 flex list-none flex-col gap-0.5 overflow-y-auto overscroll-contain p-1"
              >
                {options.map((o, i) => {
                  const isSelected = i === selectedIndex;
                  const isActive = i === active;
                  return (
                    <motion.li
                      key={o.value}
                      id={optId(i)}
                      role="option"
                      aria-selected={isSelected}
                      aria-disabled={o.disabled || undefined}
                      onPointerMove={() => !o.disabled && i !== active && setActive(i)}
                      onClick={() => commit(i)}
                      whileTap={o.disabled || reduced ? undefined : { scale: 0.98 }}
                      className={cn(
                        'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 select-none',
                        sm ? 'min-h-10 text-[14px]' : 'min-h-11 text-[15px]',
                        isActive && !o.disabled && 'bg-surface-2',
                        !o.disabled && 'active:bg-[color:var(--surface-3)]',
                        o.disabled && 'cursor-not-allowed opacity-45',
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={cn('leading-snug', isSelected ? 'font-semibold text-ink' : 'font-normal text-ink')}>{o.label}</span>
                        {o.hint && <span className="text-[13px] leading-snug text-ink-3">{o.hint}</span>}
                      </span>
                      <span className="flex size-[18px] shrink-0 items-center justify-center text-accent" aria-hidden>
                        <AnimatePresence initial={false}>
                          {isSelected && (
                            <motion.span
                              className="flex"
                              initial={reduced ? false : { scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={reduced ? undefined : { scale: 0, opacity: 0 }}
                              transition={reduced ? instant : { type: 'spring', stiffness: 600, damping: 30 }}
                            >
                              <Check size={18} strokeWidth={2.4} />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </span>
                    </motion.li>
                  );
                })}
              </ul>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
