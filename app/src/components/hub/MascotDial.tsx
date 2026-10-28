import { Home, ListOrdered, Target, User, type LucideIcon } from 'lucide-react';
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { SealState } from '../mascot/Seal';

export interface DialSection {
  id: 'home' | 'goals' | 'activity' | 'profile';
  label: string;
  path: string;
  icon: LucideIcon;
  /** how Kip looks while this segment is under your finger */
  mood: SealState;
}

// Clockwise from the top. Home sits on top because it's where you start and end.
export const DIAL_SECTIONS: DialSection[] = [
  { id: 'home', label: 'Home', path: '/home', icon: Home, mood: 'happy' },
  { id: 'goals', label: 'Goals', path: '/goals', icon: Target, mood: 'point' },
  { id: 'activity', label: 'Activity', path: '/activity', icon: ListOrdered, mood: 'think' },
  { id: 'profile', label: 'Profile', path: '/profile', icon: User, mood: 'wave' },
];

export function sectionForPath(pathname: string): DialSection {
  return DIAL_SECTIONS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`)) ?? DIAL_SECTIONS[0];
}

const R_OUT = 132; // ring outer radius (px)
const R_IN = 58; // ring inner radius: just outside the open mascot disc
const GAP = 5; // degrees between segments
const POS_KEY = 'kept.dial.pos';

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => ({ x: r * Math.cos(rad(deg)), y: r * Math.sin(rad(deg)) });
function segment(a0: number, a1: number): string {
  const p0 = pt(R_OUT, a0);
  const p1 = pt(R_OUT, a1);
  const p2 = pt(R_IN, a1);
  const p3 = pt(R_IN, a0);
  return `M ${p0.x} ${p0.y} A ${R_OUT} ${R_OUT} 0 0 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${R_IN} ${R_IN} 0 0 0 ${p3.x} ${p3.y} Z`;
}

interface Props {
  /** Kip's face while the dial is closed: follows the latest real money event */
  restingMood: SealState;
  /** 0..1 of the primary goal, drawn as a thin ring around Kip */
  progress: number;
}

/**
 * The app's navigation: Kip floats on every screen and can be dragged anywhere. Tap him and a ring
 * split into four opens around him, one segment per section, with the current one pushed out.
 * Hovering or focusing a segment changes Kip's expression, so he reacts to where you're heading.
 */
export function MascotDial({ restingMood, progress }: Props) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const here = sectionForPath(pathname);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<DialSection | null>(null);
  const [poked, setPoked] = useState(false);
  const bounds = useRef<HTMLDivElement>(null);
  const island = useRef<HTMLDivElement>(null);
  const lastDrag = useRef(0);
  const saved = readPos();
  const x = useMotionValue(saved.x);
  const y = useMotionValue(saved.y);

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
    if (Date.now() - lastDrag.current < 250) return;
    if (!open) {
      // make room: slide the island inwards if the ring would fall off the screen
      const r = island.current?.getBoundingClientRect();
      if (r) {
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const pad = R_OUT + 22; // ring + the pushed-out segment + breathing room
        const dx = Math.min(Math.max(cx, pad), window.innerWidth - pad) - cx;
        const dy = Math.min(Math.max(cy, pad), window.innerHeight - pad) - cy;
        if (dx || dy) {
          animate(x, x.get() + dx, { type: 'spring', stiffness: 380, damping: 32 });
          animate(y, y.get() + dy, { type: 'spring', stiffness: 380, damping: 32 });
        }
      }
      setPoked(true);
      window.setTimeout(() => setPoked(false), 900);
    }
    setOpen((o) => !o);
  };

  const mood: SealState = hover?.mood ?? (open ? (poked ? 'happy' : here.mood) : restingMood);
  const circ = 2 * Math.PI * 35;

  return (
    <>
      <AnimatePresence>
        {open && <motion.div className="dial-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />}
      </AnimatePresence>
      <div ref={bounds} className="dial-bounds">
        <motion.div
          ref={island}
          className={`dial ${open ? 'dial--open' : ''}`}
          drag={!open}
          dragConstraints={bounds}
          dragElastic={0.1}
          dragMomentum={false}
          style={{ x, y }}
          onDragEnd={() => {
            lastDrag.current = Date.now();
            writePos(x.get(), y.get());
          }}
        >
          <AnimatePresence>
            {open && (
              <motion.nav className="dial__ring" aria-label="Main navigation" initial="closed" animate="open" exit="closed">
                <svg viewBox={`${-R_OUT - 8} ${-R_OUT - 8} ${2 * R_OUT + 16} ${2 * R_OUT + 16}`} className="dial__svg" aria-hidden>
                  {DIAL_SECTIONS.map((s, i) => {
                    const mid = i * 90;
                    const current = s.id === here.id;
                    const push = pt(current ? 7 : 0, mid);
                    return (
                      <motion.path
                        key={s.id}
                        d={segment(mid - 45 + GAP / 2, mid + 45 - GAP / 2)}
                        className={`dial__seg ${current ? 'dial__seg--current' : ''} ${hover?.id === s.id ? 'dial__seg--hover' : ''}`}
                        variants={{
                          closed: { scale: 0.45, opacity: 0, x: 0, y: 0 },
                          open: { scale: 1, opacity: 1, x: push.x, y: push.y, transition: { type: 'spring', stiffness: 420, damping: 28, delay: 0.03 * i } },
                        }}
                        style={{ transformOrigin: '0px 0px', transformBox: 'view-box' }}
                        onMouseEnter={() => setHover(s)}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => {
                          setOpen(false);
                          if (!current) nav(s.path);
                        }}
                      />
                    );
                  })}
                </svg>
                {DIAL_SECTIONS.map((s, i) => {
                  const mid = i * 90;
                  const current = s.id === here.id;
                  const p = pt((R_IN + R_OUT) / 2 + (current ? 7 : 0), mid);
                  const Icon = s.icon;
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      className={`dial__label ${current ? 'dial__label--current' : ''}`}
                      style={{ left: `calc(50% + ${p.x}px)`, top: `calc(50% + ${p.y}px)` }}
                      variants={{ closed: { opacity: 0, scale: 0.6 }, open: { opacity: 1, scale: 1, transition: { delay: 0.08 + 0.03 * i } } }}
                      onMouseEnter={() => setHover(s)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(s)}
                      onBlur={() => setHover(null)}
                      onClick={() => {
                        setOpen(false);
                        if (!current) nav(s.path);
                      }}
                      aria-current={current ? 'page' : undefined}
                      autoFocus={i === 0}
                    >
                      <Icon size={18} aria-hidden />
                      <span>{s.label}</span>
                    </motion.button>
                  );
                })}
              </motion.nav>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            className="dial__kip"
            onClick={toggle}
            animate={{ scale: open ? 1.35 : 1 }}
            whileTap={{ scale: open ? 1.25 : 0.92 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : `Menu. You’re in ${here.label}`}
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
                  transition={{ duration: 0.18 }}
                  draggable={false}
                />
              </AnimatePresence>
            </span>
          </motion.button>

          <AnimatePresence>
            {!open && (
              <motion.span className="dial__here" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} aria-hidden>
                {here.label}
              </motion.span>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}

function readPos(): { x: number; y: number } {
  try {
    const p = JSON.parse(localStorage.getItem(POS_KEY) ?? 'null');
    if (p && typeof p.x === 'number' && typeof p.y === 'number') return p;
  } catch {
    /* ignore */
  }
  return { x: 0, y: 0 };
}
function writePos(x: number, y: number) {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({ x, y }));
  } catch {
    /* ignore */
  }
}
