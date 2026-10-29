import {
  ArrowCounterClockwise,
  ArrowRight,
  BellRinging,
  CalendarCheck,
  CaretLeft,
  CreditCard,
  HandPointing,
  HandWithdraw,
  House,
  ListBullets,
  Plus,
  Receipt,
  Shapes,
  Question,
  Target,
  User,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react';
import { animate, motion, useMotionValue, useReducedMotion, useTransform, type MotionValue } from 'motion/react';
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { sortTx } from '../../data/selectors';
import { useData, useStore } from '../../data/store';

/**
 * The home tour, told by Kip. Each stop dims the page around one thing, Kip stands next to it in a
 * pose that fits, says one short line in a speech bubble, and a small demonstration plays on the
 * real element (a finger pressing, a fire lighting a day, the ring pulsing). The demonstrations are
 * drawn on top of the page: nothing is clicked and no data changes. Runs once per account, replays
 * from the "?" in the header, waits for anything that covers home, and can be skipped at any point.
 */

type Kind = 'friends' | 'reminders' | 'help' | 'week' | 'vault' | 'goal' | 'new' | 'save' | 'activity' | 'sleep' | 'dial';
type Side = 'top' | 'bottom' | 'left' | 'right';
type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** What the copy depends on: real money (Stripe) or not, and what the home is showing. */
interface Ctx {
  real: boolean;
  running: boolean;
  manual: boolean;
  pace: boolean;
}

interface Stop {
  kind: Kind;
  /** the first match is highlighted; a stop whose target isn't on the page is left out */
  target: string;
  pose: string;
  /** width / height of the pose image, so its box is known before it loads */
  ratio: number;
  /** 'peek': Kip looks over the top edge of the bubble instead of standing beside it */
  layout?: 'side' | 'peek';
  title: string;
  /** one word of the title in the brush face; used once in the whole tour */
  brush?: string;
  line: (c: Ctx) => string;
  /** room the demonstration needs outside the target (relative to it); Kip and the bubble keep clear */
  reserve?: (frame: Box, wide: boolean) => Box;
}

const DIAL_R = (wide: boolean) => (wide ? 150 : 128);
const CHIP_ROOM = 64; // above a goal row, for the three things inside it

const STOPS: Stop[] = [
  // the header first: these three are small and easy to miss, and Friends lives only up here
  {
    kind: 'friends',
    target: '[data-testid="friends-link"]',
    pose: 'pose-wave',
    ratio: 0.98,
    title: 'Your friends',
    line: () => 'Find friends by their number, cheer them on, or give them your freeze.',
  },
  {
    kind: 'reminders',
    target: '.top7__icon[aria-label="Reminders"]',
    pose: 'pose-point',
    ratio: 1,
    title: 'Reminders',
    line: () => 'Pick when Kip nudges you to save.',
  },
  {
    kind: 'help',
    target: '.top7__icon[aria-label="How it works"]',
    pose: 'pose-guide',
    ratio: 0.92,
    title: 'Lost?',
    line: () => 'Tap here anytime to see this tour again.',
  },
  {
    kind: 'week',
    target: '[data-tour="streak"] .streakd__week',
    pose: 'pose-campfire',
    ratio: 1,
    title: 'Your week',
    line: () => 'Every day you save lights up. Miss one? A 1-day Freeze covers it.',
  },
  {
    kind: 'vault',
    target: '[data-tour="vault"]',
    pose: 'pose-happy',
    ratio: 1.05,
    title: 'What you\'ve saved',
    line: (c) => (c.pace ? 'The ring is the whole journey. Next to it, this month and your daily pace.' : 'The ring is the whole journey. Next to it, this month and what\'s left.'),
  },
  {
    kind: 'goal',
    target: '.cop__goal',
    pose: 'pose-guide',
    ratio: 0.92,
    title: 'Each goal',
    line: () => 'Tap it to change its plan or icon, or to withdraw.',
    // what's inside the goal pops out above the row
    reserve: (f) => ({ x: 0, y: -CHIP_ROOM, w: f.w, h: CHIP_ROOM }),
  },
  {
    kind: 'new',
    target: '.cop__new, [data-tour="new-goal"]',
    pose: 'pose-wave',
    ratio: 0.98,
    title: 'New goal',
    line: () => 'Dreaming of something else? Start a new goal here.',
  },
  {
    kind: 'save',
    target: '[data-tour="save"]',
    pose: 'pose-feed',
    ratio: 1.12,
    title: 'Save money',
    line: (c) =>
      c.real
        ? c.running
          ? 'Want to add a bit extra? Stripe takes it from your card.'
          : 'Ready to save? Pick how much a day here. Your card only comes in then.'
        : 'Log what you\'ve put aside here. Kip just keeps count.',
  },
  {
    kind: 'activity',
    target: '.txl',
    pose: 'pose-peek',
    ratio: 1.51,
    layout: 'peek',
    title: 'Your activity',
    // only entries typed in by hand can be taken back; Stripe payments and the demo's simulated ones can't
    line: (c) => (c.manual ? 'Logged it wrong? Open the deposit and you can undo it.' : 'Everything in and out. Tap a row for details.'),
  },
  {
    kind: 'sleep',
    target: '[data-tour="sleep"]',
    pose: 'pose-sleep-on-it',
    ratio: 1.25,
    title: 'Sleep on it',
    line: () => 'Want something pricey? I\'ll sleep on it for 48 hours, then ask you again.',
  },
  {
    kind: 'dial',
    target: '.dial__kip',
    pose: 'pose-celebrate',
    ratio: 0.85,
    title: 'I\'m Kip',
    brush: 'Kip',
    line: () => 'Tap me anytime: Home, Goals, Activity or Profile.',
    // the four slices fan out above the button
    reserve: (f, wide) => {
      const r = DIAL_R(wide) + 10;
      return { x: f.w / 2 - r, y: f.h / 2 - r, w: 2 * r, h: r };
    },
  },
];

const keyFor = (id: string) => `kept.tour.v1.${id}`;
export const TOUR_EVENT = 'kept:tour';

// Anything that covers home: the celebration after a deposit, the streak moment, a sheet. The tour
// waits for these to close (and steps aside if one opens mid-tour), so it never lands on top of them.
const OVERLAY = '.celebrate, .streak-moment, .sheet-backdrop';

function useOverlayOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const check = () => setOpen(!!document.querySelector(OVERLAY));
    check();
    const watcher = new MutationObserver(check);
    watcher.observe(document.body, { childList: true, subtree: true });
    return () => watcher.disconnect();
  }, []);
  return open;
}

// ---------- layout ----------

const M = 12; // nothing comes closer than this to the edge of the screen
const GAP = 12; // between the spotlight and Kip
const BAND_TOP = 62; // the progress bar lives above this line
const PAD = 8; // the spotlight's breathing room around the target
const LOOP = 2.8; // seconds per demonstration

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
// the visible area, without a desktop scrollbar (innerWidth counts it)
const viewport = () => ({ w: document.documentElement.clientWidth || window.innerWidth, h: document.documentElement.clientHeight || window.innerHeight });
const union = (a: Box, b: Box): Box => {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y };
};

type Scroller = HTMLElement | 'window' | null;
/** What scrolls the target: a scrolling ancestor, the window, or nothing (it's in a fixed layer). */
function scrollerOf(el: Element): Scroller {
  for (let n = el instanceof HTMLElement ? el : el.parentElement; n; n = n.parentElement) {
    const cs = getComputedStyle(n);
    if (cs.position === 'fixed') return null;
    if (n !== el && /(auto|scroll)/.test(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return 'window';
}
const scrollPos = (s: Exclude<Scroller, null>) => (s === 'window' ? window.scrollY : s.scrollTop);
const scrollMax = (s: Exclude<Scroller, null>) =>
  s === 'window' ? document.documentElement.scrollHeight - window.innerHeight : s.scrollHeight - s.clientHeight;

function radiusOf(el: Element, r: DOMRect): number {
  const raw = getComputedStyle(el).borderTopLeftRadius;
  const n = parseFloat(raw) || 0;
  const px = raw.endsWith('%') ? (n / 100) * Math.min(r.width, r.height) : n;
  return Math.min(Math.max(14, px + PAD), Math.min(r.width, r.height) / 2 + PAD);
}

interface Layout {
  hole: boolean;
  fits: boolean; // false: the screen is too small to keep Kip clear of the spotlight
  frame: Box; // the target, where it will be once the page has scrolled
  radius: number;
  side: Side;
  group: Pt;
  scroller: Scroller;
  scrollTo: number | null;
}

/**
 * Where everything goes for one stop. Each side of the target is tried with the page scrolled so
 * that the target and Kip's group fit together in the middle of the screen; the side with the most
 * room wins (beside the target on a wide screen, above or below it on a phone). Kip and the bubble
 * never overlap the spotlight or the room its demonstration needs, and never leave the screen.
 */
function layoutFor(el: Element, stop: Stop, size: { w: number; h: number }, vw: number, vh: number, opts: { scroll: boolean; side?: Side }): Layout {
  const r = el.getBoundingClientRect();
  const wide = vw >= 720;
  const frame0: Box = { x: r.left, y: r.top, w: r.width, h: r.height };
  const holeRel: Box = { x: -PAD, y: -PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD };
  const keepRel = stop.reserve ? union(holeRel, stop.reserve(frame0, wide)) : holeRel;
  const top = BAND_TOP;
  const bottom = vh - M;
  const band = bottom - top;
  const sc = opts.scroll ? scrollerOf(el) : null;
  const cur = sc ? scrollPos(sc) : 0;
  const max = sc ? Math.max(0, scrollMax(sc)) : 0;
  const sides: Side[] = opts.side ? [opts.side] : wide ? ['right', 'left', 'bottom', 'top'] : ['bottom', 'top'];

  let best: { side: Side; delta: number; score: number; fits: boolean } | null = null;
  for (const side of sides) {
    const vertical = side === 'top' || side === 'bottom';
    let want: number; // where the target's top should be on screen for this side
    if (vertical) {
      const lead = Math.max(0, (band - (keepRel.h + GAP + size.h)) / 2);
      want = side === 'bottom' ? top + lead - keepRel.y : top + lead + size.h + GAP - keepRel.y;
    } else {
      want = top + Math.max(0, (band - keepRel.h) / 2) - keepRel.y;
    }
    const delta = sc ? clamp(cur + (frame0.y - want), 0, max) - cur : 0;
    const kx = frame0.x + keepRel.x;
    const ky = frame0.y - delta + keepRel.y;
    const space =
      side === 'bottom' ? bottom - (ky + keepRel.h) - GAP : side === 'top' ? ky - GAP - top : side === 'left' ? kx - GAP - M : vw - M - (kx + keepRel.w) - GAP;
    const need = vertical ? size.h : size.w;
    const fits = (vertical ? size.w <= vw - 2 * M : size.h <= band) && space >= need;
    const score = space - need + (vertical ? 0 : 40);
    if (!best || (fits && !best.fits) || (fits === best.fits && score > best.score)) best = { side, delta, score, fits };
  }
  const { side, delta, fits } = best!;

  const frame: Box = { ...frame0, y: frame0.y - delta };
  const keep: Box = { x: frame.x + keepRel.x, y: frame.y + keepRel.y, w: keepRel.w, h: keepRel.h };
  const cx = frame.x + frame.w / 2;
  const cy = frame.y + frame.h / 2;
  let x = cx - size.w / 2;
  let y = cy - size.h / 2;
  if (side === 'bottom') y = keep.y + keep.h + GAP;
  if (side === 'top') y = keep.y - GAP - size.h;
  if (side === 'right') x = keep.x + keep.w + GAP;
  if (side === 'left') x = keep.x - GAP - size.w;
  x = clamp(x, M, Math.max(M, vw - M - size.w));
  y = clamp(y, top, Math.max(top, bottom - size.h));

  return { hole: true, fits, frame, radius: radiusOf(el, r), side, group: { x, y }, scroller: sc, scrollTo: sc && Math.abs(delta) > 1 ? cur + delta : null };
}

/** A layout in use: for which stop, and when it was made. */
type Placed = Layout & { step: number; at: number };

/** No target (it vanished mid-tour): no spotlight, Kip in the middle. */
function centered(size: { w: number; h: number }, vw: number, vh: number): Layout {
  return {
    hole: false,
    fits: true,
    frame: { x: vw / 2, y: vh / 2, w: 0, h: 0 },
    radius: 0,
    side: 'bottom',
    group: { x: clamp((vw - size.w) / 2, M, vw), y: clamp((vh - size.h) / 2, BAND_TOP, vh) },
    scroller: null,
    scrollTo: null,
  };
}

const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
  const f = (n: number) => n.toFixed(1);
  return `M${f(x + r)} ${f(y)}H${f(x + w - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w)} ${f(y + r)}V${f(y + h - r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + w - r)} ${f(y + h)}H${f(x + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x)} ${f(y + h - r)}V${f(y + r)}A${f(r)} ${f(r)} 0 0 1 ${f(x + r)} ${f(y)}Z`;
};

const SPRING = { type: 'spring', stiffness: 230, damping: 30, mass: 0.9 } as const;
// glide a value to where it belongs (a new glide picks up the old one's speed), or put it there
const put = (mv: MotionValue<number>, v: number, jump: boolean) => {
  if (jump) {
    mv.stop();
    mv.jump(v);
  } else if (mv.isAnimating() || Math.abs(mv.get() - v) > 0.25) {
    animate(mv, v, SPRING);
  }
};

// ---------- the tour ----------

export function Tour() {
  const { account, money } = useStore();
  const data = useData();
  const osReduce = useReducedMotion();
  const reduce = !!osReduce || data.prefs.reduceMotion;
  const covered = useOverlayOpen();
  const [run, setRun] = useState<Stop[] | null>(null);
  const [step, setStep] = useState(0);
  const [plan, setPlan] = useState<Placed | null>(null);
  const [vp, setVp] = useState(viewport);
  const planRef = useRef<Placed | null>(null);
  const shown = useRef(false); // the spotlight is on screen: glide to the next stop instead of jumping
  const started = useRef(false);
  const before = useRef<{ scroll: number; focus: Element | null }>({ scroll: 0, focus: null });
  const rootRef = useRef<HTMLDivElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  // the target's box and the hole's corner, as springs, so the spotlight glides from stop to stop
  const fx = useMotionValue(0);
  const fy = useMotionValue(0);
  const fw = useMotionValue(0);
  const fh = useMotionValue(0);
  const fr = useMotionValue(0);
  const gx = useMotionValue(0);
  const gy = useMotionValue(0);
  const vw = useMotionValue(vp.w);
  const vh = useMotionValue(vp.h);
  const hx = useTransform(fx, (v) => v - PAD);
  const hy = useTransform(fy, (v) => v - PAD);
  const hw = useTransform(fw, (v) => v + 2 * PAD);
  const hh = useTransform(fh, (v) => v + 2 * PAD);
  // the dimmed, blurred layer with the spotlight cut out of it
  const clip = useTransform([fx, fy, fw, fh, fr, vw, vh], ([x, y, w, h, r, W, H]: number[]) => {
    const outer = `M0 0H${W}V${H}H0Z`;
    if (w <= 0 || h <= 0) return `path(evenodd, "${outer}")`;
    const bw = w + 2 * PAD;
    const bh = h + 2 * PAD;
    return `path(evenodd, "${outer} ${roundRect(x - PAD, y - PAD, bw, bh, clamp(r, 0, Math.min(bw, bh) / 2))}")`;
  });

  useEffect(() => {
    const onResize = () => setVp(viewport());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  useEffect(() => {
    vw.set(vp.w);
    vh.set(vp.h);
  }, [vp, vw, vh]);

  const begin = useCallback(() => {
    const stops = STOPS.filter((s) => document.querySelector(s.target));
    if (!stops.length) return;
    before.current = { scroll: window.scrollY, focus: document.activeElement };
    shown.current = false;
    planRef.current = null;
    setPlan(null);
    setStep(0);
    setRun(stops);
  }, []);

  useEffect(() => {
    window.addEventListener(TOUR_EVENT, begin);
    return () => window.removeEventListener(TOUR_EVENT, begin);
  }, [begin]);

  // start once per account, as soon as home has the things the tour points at and nothing covers it
  useEffect(() => {
    if (!account || covered || started.current) return;
    let seen = false;
    try {
      seen = localStorage.getItem(keyFor(account.id)) === 'done';
    } catch {
      /* no storage: show it, it's skippable */
    }
    if (seen) return;
    const t = window.setTimeout(() => {
      if (!document.querySelector('[data-tour="vault"]') || document.querySelector(OVERLAY)) return;
      started.current = true;
      begin();
    }, 1200);
    return () => window.clearTimeout(t);
  }, [account, covered, begin]);

  const finish = useCallback(() => {
    setRun(null);
    setPlan(null);
    planRef.current = null;
    shown.current = false;
    try {
      if (account) localStorage.setItem(keyFor(account.id), 'done');
    } catch {
      /* ignore */
    }
    // back to where you were, the way you were
    window.scrollTo({ top: before.current.scroll, behavior: reduce ? 'auto' : 'smooth' });
    const f = before.current.focus;
    if (f instanceof HTMLElement && f.isConnected) f.focus({ preventScroll: true });
  }, [account, reduce]);

  const next = useCallback(() => {
    if (!run) return;
    if (step + 1 < run.length) setStep(step + 1);
    else finish();
  }, [run, step, finish]);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  /** Measure the group, place everything, scroll the page if needed. */
  const place = useCallback(
    (scroll: boolean, keepSide: boolean) => {
      if (!run) return;
      const stop = run[step];
      const g = groupRef.current;
      if (!stop || !g) return;
      const el = document.querySelector(stop.target);
      const size = { w: g.offsetWidth, h: g.offsetHeight };
      const { w: W, h: H } = viewport();
      const prevPlan = planRef.current;
      const same = prevPlan?.step === step;
      let p = el ? layoutFor(el, stop, size, W, H, { scroll, side: keepSide && same ? prevPlan.side : undefined }) : centered(size, W, H);
      // the page settled somewhere else than planned and the old side has no room left: pick again
      if (el && keepSide && same && !p.fits) p = layoutFor(el, stop, size, W, H, { scroll: false });
      const jump = reduce || !shown.current;
      put(fx, p.frame.x, jump);
      put(fy, p.frame.y, jump);
      put(fw, p.frame.w, jump);
      put(fh, p.frame.h, jump);
      put(fr, p.radius, jump);
      // the group pops in where it belongs; it only glides when the same stop is laid out again
      put(gx, p.group.x, jump || !same);
      put(gy, p.group.y, jump || !same);
      shown.current = p.hole;
      if (p.scroller && p.scrollTo !== null) {
        const opts: ScrollToOptions = { top: p.scrollTo, behavior: reduce ? 'auto' : 'smooth' };
        if (p.scroller === 'window') window.scrollTo(opts);
        else p.scroller.scrollTo(opts);
      }
      const nextPlan: Placed = { ...p, step, at: performance.now() };
      planRef.current = nextPlan;
      setPlan(nextPlan);
    },
    [run, step, reduce, fx, fy, fw, fh, fr, gx, gy],
  );

  // a new stop (or a new screen size): lay out and scroll
  useLayoutEffect(() => {
    if (run && !covered) place(true, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, step, covered, vp.w, vp.h]);

  // While a stop is up, keep the spotlight on the target: once the page is still (and any scroll
  // the tour asked for has arrived), re-measure if the target isn't where the plan put it. Covers a
  // smooth scroll that starts late or ends early on a slow phone, and layout that shifts underneath.
  useEffect(() => {
    if (!run || covered) return;
    let last = NaN;
    let calm = 0;
    const tick = window.setInterval(() => {
      const y = window.scrollY;
      calm = y === last ? calm + 1 : 0;
      last = y;
      const pl = planRef.current;
      const stop = run[step];
      if (calm < 2 || !pl || pl.step !== step || !stop) return;
      // the scroll we asked for hasn't got there yet: give it up to 1.6 s
      if (pl.scroller === 'window' && pl.scrollTo !== null && Math.abs(y - pl.scrollTo) > 2 && performance.now() - pl.at < 1600) return;
      const el = document.querySelector(stop.target);
      if (!el) {
        if (pl.hole) place(false, true);
        return;
      }
      const r = el.getBoundingClientRect();
      const f = pl.frame;
      if (Math.abs(r.left - f.x) > 1.5 || Math.abs(r.top - f.y) > 1.5 || Math.abs(r.width - f.w) > 1.5 || Math.abs(r.height - f.h) > 1.5) place(false, true);
    }, 140);
    return () => window.clearInterval(tick);
  }, [run, step, covered, place]);

  const ready = !!run && plan?.step === step;

  // the main button takes the focus on every stop
  useEffect(() => {
    if (ready) nextRef.current?.focus({ preventScroll: true });
  }, [ready, step]);

  // the page under the tour doesn't scroll by hand: the tour moves it
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const stop = (e: Event) => e.preventDefault();
    root.addEventListener('wheel', stop, { passive: false });
    root.addEventListener('touchmove', stop, { passive: false });
    return () => {
      root.removeEventListener('wheel', stop);
      root.removeEventListener('touchmove', stop);
    };
  }, [run, covered]);

  // Esc skips, Enter and → go on, ← goes back, Tab stays inside the tour
  useEffect(() => {
    if (!run || covered) return;
    const onKey = (e: KeyboardEvent) => {
      const onButton = !!(e.target as HTMLElement | null)?.closest?.('.tour button');
      if (e.key === 'Escape') {
        e.preventDefault();
        finish();
      } else if (e.key === 'ArrowRight' || (e.key === 'Enter' && !onButton)) {
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      } else if (e.key === 'Tab') {
        const items = Array.from(rootRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
        if (!items.length) return;
        e.preventDefault();
        const at = items.indexOf(document.activeElement as HTMLElement);
        const to = e.shiftKey ? (at <= 0 ? items.length - 1 : at - 1) : at === -1 || at === items.length - 1 ? 0 : at + 1;
        items[to].focus({ preventScroll: true });
      } else if (['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', 'Home', 'End'].includes(e.key) || (e.key === ' ' && !onButton)) {
        e.preventDefault();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [run, covered, finish, next, prev]);

  if (!run || covered) return null;
  const stop = run[step];
  if (!stop) return null;
  const last = step === run.length - 1;
  const wide = vp.w >= 720;
  const peek = stop.layout === 'peek';

  const ctx: Ctx = {
    real: !!money,
    running: !!money?.running,
    manual: data.tracking === 'manual',
    pace: !!document.querySelector('.cop__stat--end')?.textContent?.includes('pe zi'),
  };

  // Kip's box: set by width, tall poses capped so they don't tower over the bubble
  const kipW0 = peek ? (wide ? 150 : 120) : wide ? 132 : 104;
  let kipH = kipW0 / stop.ratio;
  let kipW = kipW0;
  if (kipH > kipW0 * 1.15) {
    kipH = kipW0 * 1.15;
    kipW = kipH * stop.ratio;
  }
  const bubbleW = peek ? (wide ? 340 : Math.min(380, vp.w - 2 * M)) : wide ? 300 : Math.min(300, vp.w - 2 * M - kipW0 - 6);

  // Kip stands next to the spotlight. Beside it on a wide screen he faces it (and points at it);
  // above or below it he stands on the left and faces his bubble.
  const side = ready ? plan.side : 'bottom';
  const kipFirst = side !== 'left';
  const flip = side === 'right';
  const el = ready && plan.hole ? document.querySelector(stop.target) : null;
  const titleParts = stop.brush ? stop.title.split(stop.brush) : [stop.title];

  return (
    <div
      ref={rootRef}
      className={`tour ${reduce ? 'tour--still' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-line`}
    >
      <motion.div className="tour__scrim" style={{ clipPath: clip }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.25 }} />
      {ready && plan.hole && <motion.div className="tour__hole" style={{ x: hx, y: hy, width: hw, height: hh, borderRadius: fr }} aria-hidden />}

      {el && (
        <motion.div className="tour__stage" style={{ x: fx, y: fy, width: fw, height: fh }} aria-hidden>
          <Demo key={step} kind={stop.kind} el={el} reduce={reduce} wide={wide} ctx={ctx} activityRow={activityRow(data.transactions, ctx)} />
        </motion.div>
      )}

      <div className="tour__hud">
        <div className="tour__segs" role="progressbar" aria-valuemin={1} aria-valuemax={run.length} aria-valuenow={step + 1} aria-label={`Step ${step + 1} of ${run.length}`}>
          {run.map((s, i) => (
            <span key={s.kind} className="tour__seg" data-on={i <= step || undefined}>
              <motion.i initial={false} animate={{ scaleX: i <= step ? 1 : 0 }} transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 26, delay: i === step ? 0.12 : 0 }} />
            </span>
          ))}
        </div>
        {!last && (
          <button type="button" className="tour__skip" onClick={finish}>
            Skip
          </button>
        )}
      </div>

      <motion.div
        ref={groupRef}
        className={`tour__group tour__group--${peek ? 'peek' : 'side'}`}
        data-kip={kipFirst ? 'start' : 'end'}
        style={{ x: gx, y: gy, visibility: ready ? 'visible' : 'hidden' } as CSSProperties & { x: MotionValue<number>; y: MotionValue<number> }}
      >
        <motion.div
          key={`kip-${step}`}
          className="tour__kipwrap"
          style={{ width: kipW, height: kipH }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.85 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 380, damping: 22, delay: 0.05 }}
        >
          <img className="tour__kip" src={`/mascot/${stop.pose}.webp`} alt="" width={Math.round(kipW)} height={Math.round(kipH)} data-flip={flip || undefined} draggable={false} />
        </motion.div>
        <motion.div
          key={`bubble-${step}`}
          className="tour__bubble"
          data-tail={peek ? 'none' : kipFirst ? 'start' : 'end'}
          style={{ width: bubbleW, ['--kip-h' as string]: `${kipH}px` }}
          initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.92 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={reduce ? { duration: 0.12 } : { type: 'spring', stiffness: 460, damping: 30 }}
        >
          <h2 id={`${id}-title`} className="tour__title">
            {titleParts.length > 1 ? (
              <>
                {titleParts[0]}
                <span className="tour__brush">{stop.brush}</span>
                {titleParts[1]}
              </>
            ) : (
              stop.title
            )}
          </h2>
          <p id={`${id}-line`} className="tour__line" aria-live="polite">
            {stop.line(ctx)}
          </p>
          <div className="tour__foot">
            {step > 0 && (
              <button type="button" className="tour__back" onClick={prev} aria-label="Back">
                <CaretLeft size={18} weight="bold" aria-hidden />
              </button>
            )}
            <button ref={nextRef} type="button" className="tour__next" onClick={next}>
              {last ? 'Done' : 'Next'}
              {!last && <ArrowRight size={18} weight="bold" aria-hidden />}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

/** Which of the four rows in the activity list the demonstration taps: one you can undo, if any. */
function activityRow(txs: Parameters<typeof sortTx>[0], ctx: Ctx): number {
  if (!ctx.manual) return 0;
  return Math.max(0, sortTx(txs).slice(0, 4).findIndex((t) => t.source === 'manual'));
}

// ---------- the demonstrations ----------

/** A part of the target, in the target's own coordinates. */
function part(el: Element, sel: string, nth = 0): Box | null {
  const n = el.querySelectorAll(sel)[nth];
  if (!n) return null;
  const b = el.getBoundingClientRect();
  const r = n.getBoundingClientRect();
  return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height };
}
const mid = (b: Box): Pt => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });
const own = (el: Element): Box => {
  const r = el.getBoundingClientRect();
  return { x: 0, y: 0, w: r.width, h: r.height };
};

interface DemoProps {
  kind: Kind;
  el: Element;
  reduce: boolean;
  wide: boolean;
  ctx: Ctx;
  activityRow: number;
}

function Demo(p: DemoProps) {
  switch (p.kind) {
    case 'friends':
      return <TapDemo {...p} icon={UsersThree} />;
    case 'reminders':
      return <TapDemo {...p} icon={BellRinging} />;
    case 'help':
      return <TapDemo {...p} icon={Question} />;
    case 'week':
      return <WeekDemo {...p} />;
    case 'vault':
      return <VaultDemo {...p} />;
    case 'goal':
      return <GoalDemo {...p} />;
    case 'new':
      return <NewDemo {...p} />;
    case 'save':
      return <SaveDemo {...p} />;
    case 'activity':
      return <ActivityDemo {...p} />;
    case 'sleep':
      return <SleepDemo {...p} />;
    case 'dial':
      return <DialDemo {...p} />;
  }
}

const loopT = (times: number[], duration = LOOP) => ({ duration, times, repeat: Infinity, ease: 'easeInOut' as const });

/** The ghost finger: slides in, presses (with a ripple) at `at`, lets go, slides away. */
function Finger({ at, reduce }: { at: Pt; reduce: boolean }) {
  return (
    <span className="tour__tap" style={{ left: at.x, top: at.y }}>
      {!reduce && (
        <motion.span
          className="tour__ripple"
          initial={{ opacity: 0, scale: 0.3 }}
          animate={{ opacity: [0, 0, 0.9, 0, 0], scale: [0.3, 0.3, 0.3, 1.9, 1.9] }}
          transition={loopT([0, 0.29, 0.3, 0.62, 1])}
        />
      )}
      <motion.span
        className="tour__finger"
        initial={reduce ? false : { opacity: 0, x: 26, y: 34 }}
        animate={reduce ? { opacity: 1 } : { opacity: [0, 1, 1, 1, 1, 0], x: [26, 0, 0, 0, 0, 18], y: [34, 0, 5, 0, 0, 26], scale: [1, 1, 0.86, 1, 1, 1] }}
        transition={reduce ? undefined : loopT([0, 0.2, 0.3, 0.4, 0.8, 1])}
      >
        <HandPointing size={44} weight="fill" />
      </motion.span>
    </span>
  );
}

/** Something that appears when the finger presses, and goes before the next press. */
function Pop({ at, reduce, from = 0.32, to = 0.88, children, className = '', d }: { at: Pt; reduce: boolean; from?: number; to?: number; children: ReactNode; className?: string; d?: Pt }) {
  const dx = d?.x ?? 0;
  const dy = d?.y ?? 0;
  return (
    <motion.span
      className={`tour__pop ${className}`}
      style={{ left: at.x, top: at.y }}
      initial={reduce ? false : { opacity: 0, scale: 0.3, x: 0, y: 0 }}
      animate={
        reduce
          ? { opacity: 1, scale: 1, x: dx, y: dy }
          : { opacity: [0, 0, 1, 1, 0, 0], scale: [0.3, 0.3, 1.12, 1, 0.5, 0.3], x: [0, 0, dx, dx, dx, 0], y: [0, 0, dy, dy, dy, 0] }
      }
      transition={reduce ? undefined : loopT([0, from, Math.min(from + 0.09, to - 0.02), Math.min(from + 0.15, to - 0.01), to, 1])}
    >
      {children}
    </motion.span>
  );
}

const Chip = ({ icon: I, tone }: { icon: Icon; tone?: 'blue' }) => (
  <span className={`tour__chip ${tone ? `tour__chip--${tone}` : ''}`}>
    <I size={20} weight="bold" />
  </span>
);

/** Stop 1: a coin drops into today's dot and it catches fire; the days already lit glow in turn. */
function WeekDemo({ el, reduce }: DemoProps) {
  const days = Array.from(el.querySelectorAll('.streakd__day'));
  const dots = days.map((d, i) => ({ i, done: d.classList.contains('is-done'), now: d.classList.contains('is-now'), box: part(el, '.streakd__dot', i) }));
  const today = dots.find((d) => d.now)?.box;
  const lit = dots.filter((d) => d.done && !d.now && d.box);
  return (
    <>
      {lit.map((d, k) => {
        const t = 0.04 + k * 0.06;
        return (
          <motion.span
            key={d.i}
            className="tour__glow"
            style={{ left: d.box!.x + d.box!.w / 2, top: d.box!.y + d.box!.h / 2, width: d.box!.w, height: d.box!.h }}
            initial={reduce ? false : { opacity: 0, scale: 0.8 }}
            animate={reduce ? { opacity: 0.8, scale: 1.25 } : { opacity: [0, 0, 0.95, 0, 0], scale: [0.8, 0.8, 0.9, 1.75, 1.75] }}
            transition={reduce ? undefined : loopT([0, t, t + 0.02, t + 0.2, 1])}
          />
        );
      })}
      {today && (
        <>
          {!reduce && (
            <motion.span
              className="tour__coin"
              style={{ left: today.x + today.w / 2, top: today.y + today.h / 2 }}
              initial={{ opacity: 0, y: -46 }}
              animate={{ opacity: [0, 0, 1, 1, 0, 0], y: [-46, -46, -40, 0, 0, -46], scale: [1, 1, 1, 0.7, 0.4, 1] }}
              transition={loopT([0, 0.3, 0.34, 0.5, 0.53, 1])}
            />
          )}
          <Pop at={mid(today)} reduce={reduce} from={0.5} to={0.92} className="tour__flame">
            <img src="/mascot/flame.webp" alt="" width={30} height={30} />
          </Pop>
          {!reduce &&
            [-90, -30, 30, 150, 210].map((a, i) => (
              <motion.span
                key={a}
                className="tour__spark"
                style={{ left: today.x + today.w / 2, top: today.y + today.h / 2 }}
                initial={{ opacity: 0 }}
                animate={{
                  opacity: [0, 0, 1, 0, 0],
                  x: [0, 0, 0, Math.cos((a * Math.PI) / 180) * (24 + (i % 2) * 6), 0],
                  y: [0, 0, 0, Math.sin((a * Math.PI) / 180) * (24 + (i % 2) * 6), 0],
                }}
                transition={loopT([0, 0.5, 0.52, 0.72, 1])}
              />
            ))}
        </>
      )}
    </>
  );
}

/** Stop 3: a marker hops ring, this month, per day; the ring pulses when it's its turn. */
function VaultDemo({ el, reduce }: DemoProps) {
  const ring = part(el, '.cop__ring');
  const left = part(el, '.cop__stat:not(.cop__stat--end)');
  const right = part(el, '.cop__stat--end');
  const spots = [ring, left, right].filter((b): b is Box => !!b).map((b, i) => {
    const g = i === 0 ? 6 : 8;
    return { x: b.x - g, y: b.y - g, w: b.w + 2 * g, h: b.h + 2 * g, r: i === 0 ? (b.w + 2 * g) / 2 : 16 };
  });
  if (!spots.length) return null;
  if (reduce) {
    return (
      <>
        {spots.map((s, i) => (
          <span key={i} className="tour__mark" style={{ left: s.x, top: s.y, width: s.w, height: s.h, borderRadius: s.r }} />
        ))}
      </>
    );
  }
  // ring → left → right → ring, holding on each
  const seq = [0, 0, 1, 1, 2, 2, 0].map((i) => spots[Math.min(i, spots.length - 1)]);
  const times = [0, 0.24, 0.32, 0.56, 0.64, 0.9, 1];
  return (
    <>
      {ring && (
        <motion.span
          className="tour__ping"
          style={{ left: ring.x, top: ring.y, width: ring.w, height: ring.h }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 0.95, 0, 0], scale: [0.92, 1, 1.22, 1.22] }}
          transition={loopT([0, 0.04, 0.24, 1], 4.4)}
        />
      )}
      <motion.span
        className="tour__mark"
        style={{ left: 0, top: 0 }}
        initial={{ x: seq[0].x, y: seq[0].y, width: seq[0].w, height: seq[0].h, borderRadius: seq[0].r }}
        animate={{ x: seq.map((s) => s.x), y: seq.map((s) => s.y), width: seq.map((s) => s.w), height: seq.map((s) => s.h), borderRadius: seq.map((s) => s.r) }}
        transition={loopT(times, 4.4)}
      />
    </>
  );
}

/** Stop 4: tap a goal and what's inside fans out: the plan, withdrawing, the icon. */
function GoalDemo({ el, reduce }: DemoProps) {
  const row = own(el);
  const at: Pt = { x: clamp(row.w * 0.64, 80, row.w - 80), y: row.h * 0.55 };
  // they land in a row just above the goal, outside the spotlight
  const lift = at.y + PAD + 30;
  const fan: { icon: Icon; d: Pt }[] = [
    { icon: CalendarCheck, d: { x: -54, y: -lift + 6 } },
    { icon: HandWithdraw, d: { x: 0, y: -lift } },
    { icon: Shapes, d: { x: 54, y: -lift + 6 } },
  ];
  return (
    <>
      {fan.map((f, i) => (
        <Pop key={i} at={at} d={f.d} reduce={reduce} from={0.34 + i * 0.04}>
          <Chip icon={f.icon} />
        </Pop>
      ))}
      <Finger at={at} reduce={reduce} />
    </>
  );
}

/** Stop 5: tap "New goal" and a new goal pops. */
/** The header buttons: a finger taps it and what it opens pops out underneath. */
function TapDemo({ el, reduce, icon }: DemoProps & { icon: Icon }) {
  const b = own(el);
  const at: Pt = { x: b.w / 2, y: b.h / 2 };
  return (
    <>
      <Pop at={at} d={{ x: 0, y: b.h / 2 + 30 }} reduce={reduce}>
        <Chip icon={icon} tone="blue" />
      </Pop>
      <Finger at={at} reduce={reduce} />
    </>
  );
}

function NewDemo({ el, reduce }: DemoProps) {
  const b = own(el);
  const at: Pt = { x: b.w / 2, y: b.h / 2 };
  return (
    <>
      <Pop at={at} d={{ x: 0, y: -(b.h / 2 + 30) }} reduce={reduce}>
        <Chip icon={Plus} tone="blue" />
      </Pop>
      <Finger at={at} reduce={reduce} />
    </>
  );
}

/** Stop 6: press the button and money goes into the piggy bank: from the card (Stripe) or noted by you. */
function SaveDemo({ el, reduce, ctx }: DemoProps) {
  const b = own(el);
  const pig = part(el, '.savebtn__pig');
  const label = part(el, '.savebtn__label');
  const at: Pt = label ? { x: label.x + Math.min(label.w * 0.55, 150), y: label.y + label.h / 2 + 4 } : { x: b.w / 2, y: b.h / 2 };
  const target = pig ? mid(pig) : { x: 32, y: b.h / 2 };
  const d = { x: target.x - at.x, y: target.y - at.y };
  return (
    <>
      {ctx.real ? (
        // a card slides in from the right edge into the piggy bank
        <Pop at={{ x: b.w - 34, y: b.h / 2 }} d={{ x: target.x - (b.w - 34), y: 0 }} reduce={reduce} from={0.34} to={0.7}>
          <Chip icon={CreditCard} tone="blue" />
        </Pop>
      ) : (
        !reduce && (
          <motion.span
            className="tour__coin tour__coin--big"
            style={{ left: at.x, top: at.y }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0, 1, 1, 0, 0], x: [0, 0, 0, d.x, d.x, 0], y: [0, 0, -36, d.y, d.y, 0], scale: [0.6, 0.6, 1, 0.7, 0.5, 0.6] }}
            transition={loopT([0, 0.32, 0.42, 0.62, 0.66, 1])}
          />
        )
      )}
      {pig && (
        <motion.span
          className="tour__ping tour__ping--gold"
          style={{ left: pig.x, top: pig.y, width: pig.w, height: pig.h }}
          initial={{ opacity: 0 }}
          animate={reduce ? { opacity: 0.9, scale: 1.15 } : { opacity: [0, 0, 0.95, 0, 0], scale: [0.9, 0.9, 1, 1.6, 1.6] }}
          transition={reduce ? undefined : loopT([0, 0.64, 0.66, 0.86, 1])}
        />
      )}
      <Finger at={at} reduce={reduce} />
    </>
  );
}

/** Stop 7: open an entry; one typed in by hand can be undone, the others show their details. */
function ActivityDemo({ el, reduce, ctx, activityRow }: DemoProps) {
  const row = part(el, '.txl__row', activityRow) ?? part(el, '.txl__row');
  if (!row) return null;
  const end = part(el, '.txl__row .txl__end', activityRow);
  const at: Pt = { x: row.x + row.w * 0.42, y: row.y + row.h / 2 + 4 };
  const chipAt: Pt = end ? { x: end.x - 26, y: row.y + row.h / 2 } : { x: row.x + row.w - 90, y: row.y + row.h / 2 };
  return (
    <>
      <Pop at={chipAt} reduce={reduce} from={0.36}>
        {ctx.manual ? (
          <motion.span className="tour__spin" animate={reduce ? undefined : { rotate: [0, 0, -360, -360] }} transition={reduce ? undefined : loopT([0, 0.4, 0.62, 1])}>
            <Chip icon={ArrowCounterClockwise} tone="blue" />
          </motion.span>
        ) : (
          <Chip icon={Receipt} tone="blue" />
        )}
      </Pop>
      <Finger at={at} reduce={reduce} />
    </>
  );
}

/** Stop 8: Kip falls asleep on the wish: a 48 h clock sweeps round the moon, a few z's drift up. */
function SleepDemo({ el, reduce }: DemoProps) {
  const icon = part(el, '.sleeprow__icon') ?? { x: 16, y: own(el).h / 2 - 20, w: 40, h: 40 };
  const c = mid(icon);
  const r = Math.max(icon.w, icon.h) / 2 + 7;
  const C = 2 * Math.PI * r;
  const s = 2 * r + 8;
  return (
    <>
      <svg className="tour__clock" width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ left: c.x - s / 2, top: c.y - s / 2 }}>
        <circle cx={s / 2} cy={s / 2} r={r} className="tour__clock-track" />
        <motion.circle
          cx={s / 2}
          cy={s / 2}
          r={r}
          className="tour__clock-hand"
          strokeDasharray={C}
          transform={`rotate(-90 ${s / 2} ${s / 2})`}
          initial={{ strokeDashoffset: reduce ? C * 0.3 : C }}
          animate={reduce ? { strokeDashoffset: C * 0.3 } : { strokeDashoffset: [C, 0, 0, C], opacity: [1, 1, 0, 0] }}
          transition={reduce ? undefined : { duration: 3.4, times: [0, 0.8, 0.95, 1], repeat: Infinity, ease: 'linear' }}
        />
      </svg>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="tour__z"
          // they drift up out of the moon, staying clear of the row's title
          style={{ left: c.x + 2, top: c.y - r + 2, fontSize: 12 + i * 3 }}
          initial={reduce ? false : { opacity: 0 }}
          animate={reduce ? { opacity: 1, x: i * 6, y: -(8 + i * 12) } : { opacity: [0, 1, 1, 0], x: [0, 2 + i, 4 + i * 2, 6 + i * 3], y: [0, -12, -26, -(34 + i * 8)] }}
          transition={reduce ? undefined : { duration: 2.2, times: [0, 0.2, 0.7, 1], delay: i * 0.6, repeat: Infinity, repeatDelay: 0.4, ease: 'easeOut' }}
        >
          z
        </motion.span>
      ))}
    </>
  );
}

const SECTION_ICONS: Icon[] = [House, Target, ListBullets, User];

/** Stop 9: tap Kip and the four sections fan out above him, like the real menu. */
function DialDemo({ el, reduce, wide }: DemoProps) {
  const b = own(el);
  const R = DIAL_R(wide);
  const RI = Math.max(b.w / 2 + 10, 60);
  const box = R + 8;
  const pt = (r: number, deg: number): Pt => {
    const a = ((deg - 90) * Math.PI) / 180;
    return { x: box + r * Math.cos(a), y: box + r * Math.sin(a) };
  };
  const slice = (i: number) => {
    const a0 = -90 + i * 45 + 1.6;
    const a1 = -45 + i * 45 - 1.6;
    const p0 = pt(R, a0);
    const p1 = pt(R, a1);
    const p2 = pt(RI, a1);
    const p3 = pt(RI, a0);
    return `M${p0.x} ${p0.y}A${R} ${R} 0 0 1 ${p1.x} ${p1.y}L${p2.x} ${p2.y}A${RI} ${RI} 0 0 0 ${p3.x} ${p3.y}Z`;
  };
  return (
    <>
      {SECTION_ICONS.map((I, i) => {
        const order = Math.abs(i - 1.5);
        const t = 0.34 + order * 0.04;
        const at = pt((R + RI) / 2, -67.5 + i * 45);
        return (
          <motion.div
            key={i}
            className={`tour__slice ${i === 0 ? 'is-here' : ''}`}
            style={{ left: b.w / 2 - box, top: b.h / 2 - box, width: box * 2, height: box, transformOrigin: `${box}px ${box}px` }}
            initial={reduce ? false : { opacity: 0, scale: 0.35 }}
            animate={reduce ? { opacity: 1, scale: 1 } : { opacity: [0, 0, 1, 1, 0, 0], scale: [0.35, 0.35, 1, 1, 0.35, 0.35] }}
            transition={reduce ? undefined : loopT([0, t, t + 0.1, 0.84, 0.94, 1])}
          >
            <svg width={box * 2} height={box} viewBox={`0 0 ${box * 2} ${box}`}>
              <path d={slice(i)} />
            </svg>
            <span className="tour__sliceicon" style={{ left: at.x, top: at.y }}>
              <I size={wide ? 24 : 21} weight="bold" />
            </span>
          </motion.div>
        );
      })}
      <Finger at={{ x: b.w / 2 + 6, y: b.h / 2 + 18 }} reduce={reduce} />
    </>
  );
}
