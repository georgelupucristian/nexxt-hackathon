import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SealState } from '../mascot/Seal';

export interface DialSection {
  id: 'home' | 'goals' | 'activity' | 'profile';
  label: string;
  path: string;
  /** how Kip looks while this segment is under your finger */
  mood: SealState;
}

// Left to right along the arc, like a tab bar read in a curve.
export const DIAL_SECTIONS: DialSection[] = [
  { id: 'home', label: 'Home', path: '/home', mood: 'happy' },
  { id: 'goals', label: 'Goals', path: '/goals', mood: 'wave' },
  { id: 'activity', label: 'Activity', path: '/activity', mood: 'think' },
  { id: 'profile', label: 'Profile', path: '/profile', mood: 'point' },
];

export function sectionForPath(pathname: string): DialSection {
  return DIAL_SECTIONS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`)) ?? DIAL_SECTIONS[0];
}

const R_OUT = 136; // arc outer radius (px)
const R_IN = 60; // arc inner radius: just outside the open mascot disc
const LIFT = 8; // how far the current segment grows outwards
const GAP = 6; // px between segments, the same width from the inner edge to the outer one
const BOX = R_OUT + LIFT; // half-width of the arc's box; Kip's centre sits at (BOX, BOX)

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => ({ x: BOX + r * Math.cos(rad(deg)), y: BOX + r * Math.sin(rad(deg)) });
// A fixed angle gap is wider at the rim than at the hub. Offsetting each edge by the angle that
// equals GAP/2 at that radius keeps both sides of every gap parallel, so all gaps look the same.
const inset = (r: number) => (Math.asin(GAP / 2 / r) * 180) / Math.PI;
function segment(a0: number, a1: number, rOut: number): string {
  const p0 = pt(rOut, a0 + inset(rOut));
  const p1 = pt(rOut, a1 - inset(rOut));
  const p2 = pt(R_IN, a1 - inset(R_IN));
  const p3 = pt(R_IN, a0 + inset(R_IN));
  return `M ${p0.x} ${p0.y} A ${rOut} ${rOut} 0 0 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${R_IN} ${R_IN} 0 0 0 ${p3.x} ${p3.y} Z`;
}
// the top half only: four 45° slices from 9 o'clock to 3 o'clock
const slice = (i: number) => ({ a0: -90 + i * 45, a1: -45 + i * 45, mid: -67.5 + i * 45 });

interface Props {
  /** Kip's face while the dial is closed: follows the latest real money event */
  restingMood: SealState;
  /** 0..1 of the primary goal, drawn as a thin ring around Kip */
  progress: number;
}

/**
 * The app's navigation. Kip sits at the bottom centre of every screen. Tap him and a half ring of
 * liquid glass fans out above him, one slice per section, the current one grown outwards; the
 * screen behind softens. Hovering a slice changes Kip's face, so he reacts to where you're heading.
 *
 * Drag him instead and he becomes an action: drop him on any goal (anything marked
 * data-feed-goal) and the app asks how much to put in it. He swims back to the middle on release.
 */
export function MascotDial({ restingMood, progress }: Props) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const here = sectionForPath(pathname);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<DialSection | null>(null);
  const [poked, setPoked] = useState(false);
  const [feeding, setFeeding] = useState<{ id: string; name: string } | null | false>(false);
  // set as soon as a drag starts, so the click that ends it doesn't open the ring
  const dragged = useRef(false);
  const target = useRef<HTMLElement | null>(null);

  useEffect(() => {
    setOpen(false);
    setHover(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const toggle = () => {
    if (dragged.current) return;
    if (!open) {
      setPoked(true);
      window.setTimeout(() => setPoked(false), 900);
    }
    setOpen((o) => !o);
  };

  const aim = (el: HTMLElement | null) => {
    if (el === target.current) return;
    target.current?.classList.remove('is-feed-target');
    target.current = el;
    if (el) {
      el.classList.add('is-feed-target');
      navigator.vibrate?.(6);
      setFeeding({ id: el.dataset.feedGoal!, name: el.dataset.feedName ?? 'this goal' });
    } else setFeeding(null);
  };

  const go = (s: DialSection) => {
    setOpen(false);
    if (s.id !== here.id) nav(s.path);
  };

  const mood: SealState =
    feeding !== false ? (feeding ? 'celebrate' : 'idle') : (hover?.mood ?? (open ? (poked ? 'happy' : here.mood) : restingMood));
  const circ = 2 * Math.PI * 35;
  const tag = feeding !== false ? (feeding ? `Into ${feeding.name}` : 'Drop me on a goal') : here.label;

  return (
    <>
      <AnimatePresence>
        {open && <motion.div className="dial-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setOpen(false)} />}
      </AnimatePresence>
      <div className="dial-bounds">
        <motion.div
          className={`dial ${open ? 'dial--open' : ''} ${feeding !== false ? 'dial--feeding' : ''}`}
          drag={!open}
          dragSnapToOrigin
          dragElastic={0.9}
          dragMomentum={false}
          whileDrag={{ scale: 1.1 }}
          onPointerDown={() => (dragged.current = false)}
          onDragStart={() => {
            dragged.current = true;
            setFeeding(null);
          }}
          onDrag={(e) => {
            const p = e as PointerEvent;
            const hit = document.elementsFromPoint(p.clientX, p.clientY).find((n) => n instanceof HTMLElement && n.closest('[data-feed-goal]'));
            aim(hit ? (hit as HTMLElement).closest<HTMLElement>('[data-feed-goal]') : null);
          }}
          onDragEnd={() => {
            const goalId = target.current?.dataset.feedGoal;
            aim(null);
            setFeeding(false);
            if (goalId) window.dispatchEvent(new CustomEvent('kip:feed', { detail: goalId }));
          }}
        >
          <AnimatePresence>
            {open && (
              <motion.nav className="dial__arc" aria-label="Main navigation" initial="closed" animate="open" exit="closed" style={{ width: BOX * 2, height: BOX + 4, marginLeft: -BOX, marginTop: -BOX }}>
                {DIAL_SECTIONS.map((s, i) => {
                  const { a0, a1, mid } = slice(i);
                  const current = s.id === here.id;
                  const d = segment(a0, a1, current ? R_OUT + LIFT : R_OUT);
                  const label = pt((R_IN + R_OUT + (current ? LIFT : 0)) / 2, mid);
                  // fan out from the middle: the two inner slices first
                  const order = Math.abs(i - 1.5);
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      className={`dial__glass ${current ? 'dial__glass--current' : ''} ${hover?.id === s.id ? 'dial__glass--hover' : ''}`}
                      style={{ clipPath: `path('${d}')`, transformOrigin: `${BOX}px ${BOX}px` }}
                      variants={{
                        closed: { scale: 0.35, opacity: 0, transition: { duration: 0.14 } },
                        open: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 460, damping: 30, delay: 0.035 * order } },
                      }}
                      onMouseEnter={() => setHover(s)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(s)}
                      onBlur={() => setHover(null)}
                      onClick={() => go(s)}
                      aria-current={current ? 'page' : undefined}
                      autoFocus={i === 0}
                    >
                      <span className="dial__word" style={{ left: label.x, top: label.y }}>
                        {s.label}
                      </span>
                    </motion.button>
                  );
                })}
                {/* the glass edge: a bright rim on top, a faint dark line underneath for definition */}
                <svg className="dial__rims" width={BOX * 2} height={BOX + 4} aria-hidden>
                  <defs>
                    <linearGradient id="dial-rim" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0" stopColor="#fff" stopOpacity="0.95" />
                      <stop offset="1" stopColor="#fff" stopOpacity="0.15" />
                    </linearGradient>
                  </defs>
                  {DIAL_SECTIONS.map((s, i) => {
                    const { a0, a1 } = slice(i);
                    const d = segment(a0, a1, s.id === here.id ? R_OUT + LIFT : R_OUT);
                    const order = Math.abs(i - 1.5);
                    return (
                      <motion.g
                        key={s.id}
                        style={{ transformOrigin: `${BOX}px ${BOX}px` }}
                        variants={{
                          closed: { scale: 0.35, opacity: 0, transition: { duration: 0.14 } },
                          open: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 460, damping: 30, delay: 0.035 * order } },
                        }}
                      >
                        <path d={d} fill="none" stroke="rgba(23,32,27,0.12)" strokeWidth="1" />
                        <path d={d} fill="none" stroke="url(#dial-rim)" strokeWidth="1.5" transform={`translate(0 0.75)`} />
                      </motion.g>
                    );
                  })}
                </svg>
              </motion.nav>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            className="dial__kip"
            onClick={toggle}
            animate={{ scale: open ? 1.3 : 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : `Menu. You’re in ${here.label}. Drag onto a goal to save into it.`}
          >
            <svg viewBox="0 0 80 80" className="dial__progress" aria-hidden>
              <circle cx="40" cy="40" r="35" className="dial__track" />
              <motion.circle
                cx="40"
                cy="40"
                r="35"
                className="dial__fill"
                strokeDasharray={circ}
                initial={false}
                animate={{ strokeDashoffset: circ * (1 - Math.max(progress, 0.02)) }}
                transition={{ type: 'spring', stiffness: 60, damping: 18 }}
                transform="rotate(-90 40 40)"
              />
            </svg>
            <span className="dial__face">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img
                  key={mood}
                  src={`/mascot/${mood}-face.webp`}
                  alt=""
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16 }}
                  draggable={false}
                />
              </AnimatePresence>
            </span>
          </motion.button>

          <AnimatePresence>
            {!open && (
              <motion.span key={tag} className="dial__here" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }} aria-hidden>
                {tag}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
