import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useState } from 'react';
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

const R_MAX = 225; // arc outer radius on wide screens (px)
const R_IN = 64; // arc inner radius: just outside Kip's disc
const LIFT = 8; // how far the current segment grows outwards
const GAP = 6; // px between segments, the same width from the inner edge to the outer one

// On a phone the half ring is as wide as the screen allows; on a laptop it gets its full size.
const outerRadius = (vw: number) => Math.max(150, Math.min(R_MAX, Math.floor(vw / 2) - 10 - LIFT));

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
// A fixed angle gap is wider at the rim than at the hub. Offsetting each edge by the angle that
// equals GAP/2 at that radius keeps both sides of every gap parallel, so all gaps look the same.
const inset = (r: number) => (Math.asin(GAP / 2 / r) * 180) / Math.PI;
function geometry(rOut: number) {
  const box = rOut + LIFT; // half-width of the arc's box; Kip's centre sits at (box, box)
  const pt = (r: number, deg: number) => ({ x: box + r * Math.cos(rad(deg)), y: box + r * Math.sin(rad(deg)) });
  const segment = (a0: number, a1: number, r: number) => {
    const p0 = pt(r, a0 + inset(r));
    const p1 = pt(r, a1 - inset(r));
    const p2 = pt(R_IN, a1 - inset(R_IN));
    const p3 = pt(R_IN, a0 + inset(R_IN));
    return `M ${p0.x} ${p0.y} A ${r} ${r} 0 0 1 ${p1.x} ${p1.y} L ${p2.x} ${p2.y} A ${R_IN} ${R_IN} 0 0 0 ${p3.x} ${p3.y} Z`;
  };
  return { box, pt, segment };
}
// the top half only: four 45° slices from 9 o'clock to 3 o'clock
const slice = (i: number) => ({ a0: -90 + i * 45, a1: -45 + i * 45, mid: -67.5 + i * 45 });

interface Props {
  /** Kip's face while the dial is closed: follows the latest real money event */
  restingMood: SealState;
}

/**
 * The app's navigation. Kip sits at the bottom centre of every screen. Tap him and a half ring
 * fans out above him, four flat slices with equal gaps, the current one filled and grown outwards;
 * the screen behind softens. Hovering a slice changes Kip's face, so he reacts to where you're heading. 
 */
// every face the dial can show, fetched and decoded up front: swapping to a face that isn't decoded
// yet paints an empty frame first
const DIAL_FACES = ['happy', 'wave', 'think', 'point', 'idle', 'proud', 'sleep', 'celebrate', 'sad', 'wink'];
let facesWarm = false;
function warmFaces() {
  if (facesWarm || typeof Image === 'undefined') return;
  facesWarm = true;
  for (const f of DIAL_FACES) {
    const img = new Image();
    img.src = `/mascot/${f}-face.webp`;
    img.decode?.().catch(() => undefined);
  }
}

export function MascotDial({ restingMood }: Props) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const here = sectionForPath(pathname);
  useEffect(warmFaces, []);
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<DialSection | null>(null);
  const [poked, setPoked] = useState(false);
  const [vw, setVw] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const R_OUT = outerRadius(vw);
  const { box: BOX, pt, segment } = geometry(R_OUT);

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
    if (!open) {
      setPoked(true);
      window.setTimeout(() => setPoked(false), 900);
    }
    setOpen((o) => !o);
  };

  const go = (s: DialSection) => {
    setOpen(false);
    if (s.id !== here.id) nav(s.path);
  };

  const mood: SealState = hover?.mood ?? (open ? (poked ? 'happy' : here.mood) : restingMood);
  const tag = here.label;

  return (
    <>
      <AnimatePresence>
        {open && <motion.div className="dial-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} onClick={() => setOpen(false)} />}
      </AnimatePresence>
      <div className="dial-bounds">
        <div className={`dial ${open ? 'dial--open' : ''}`}>
          <AnimatePresence>
            {open && (
              <motion.nav className="dial__arc" aria-label="Main navigation" initial="closed" animate="open" exit="closed" style={{ width: BOX * 2, height: BOX + 4, marginLeft: -BOX, marginTop: -BOX }}>
                {DIAL_SECTIONS.map((s, i) => {
                  const { a0, a1, mid } = slice(i);
                  const current = s.id === here.id;
                  const d = segment(a0, a1, current ? R_OUT + LIFT : R_OUT);
                  // labels sit towards the wide outer edge, so the two middle ones never touch
                  const label = pt(R_IN + (R_OUT + (current ? LIFT : 0) - R_IN) * 0.63, mid);
                  // fan out from the middle: the two inner slices first
                  const order = Math.abs(i - 1.5);
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      className={`dial__slice ${current ? 'dial__slice--current' : ''}`}
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
              </motion.nav>
            )}
          </AnimatePresence>

          <motion.button
            type="button"
            className="dial__kip"
            onClick={toggle}
            animate={{ scale: open ? 1.05 : 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            aria-expanded={open}
            aria-label={open ? 'Close menu' : `Menu. Current section: ${here.label}.`}
          >
            {/* one full ring: progress is shown on the goals card, the home button is just home */}
            <svg viewBox="0 0 80 80" className="dial__progress" aria-hidden>
              <circle cx="40" cy="40" r="35" className="dial__fill" />
            </svg>
            <span className="dial__face">
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.img
                  key={mood}
                  src={`/mascot/${mood}-face.webp`}
                  alt=""
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  // the old face stays fully visible until the new one has faded in on top of it, so the
                  // button never shows through mid-swap (it read as a flicker in the installed app)
                  exit={{ opacity: 0, transition: { delay: 0.16, duration: 0 } }}
                  transition={{ duration: 0.16 }}
                  decoding="sync"
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
        </div>
      </div>
    </>
  );
}
