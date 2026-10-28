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
  { id: 'home', label: 'Acasă', path: '/home', mood: 'happy' },
  { id: 'goals', label: 'Obiective', path: '/goals', mood: 'wave' },
  { id: 'activity', label: 'Activitate', path: '/activity', mood: 'think' },
  { id: 'profile', label: 'Profil', path: '/profile', mood: 'point' },
];

export function sectionForPath(pathname: string): DialSection {
  return DIAL_SECTIONS.find((s) => pathname === s.path || pathname.startsWith(`${s.path}/`)) ?? DIAL_SECTIONS[0];
}

// The four sections sit as flat pills on a half circle above Kip, like a tab bar bent around him.
const R = 142; // radius of the arc the pill centres sit on (px); keeps the outer pills on a 360px phone
const ANGLES = [-64, -24, 24, 64]; // degrees from straight up, left to right
const at = (deg: number) => ({ x: R * Math.sin((deg * Math.PI) / 180), y: -R * Math.cos((deg * Math.PI) / 180) });
// the guide line through the pills: a half circle from 9 to 3 o'clock
const ARC = `M ${-R} 0 A ${R} ${R} 0 0 1 ${R} 0`;

interface Props {
  /** Kip's face while the dial is closed: follows the latest real money event */
  restingMood: SealState;
  /** 0..1 of the primary goal, drawn as a thin ring around Kip */
  progress: number;
}

/**
 * The app's navigation. Kip sits at the bottom centre of every screen. Tap him and four flat pills
 * spring out of him onto a half circle, one per section, the current one filled in; the screen
 * behind softens. Hovering a pill changes Kip's face, so he reacts to where you're heading.
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
      setFeeding({ id: el.dataset.feedGoal!, name: el.dataset.feedName ?? 'acest obiectiv' });
    } else setFeeding(null);
  };

  const go = (s: DialSection) => {
    setOpen(false);
    if (s.id !== here.id) nav(s.path);
  };

  const mood: SealState =
    feeding !== false ? (feeding ? 'celebrate' : 'idle') : (hover?.mood ?? (open ? (poked ? 'happy' : here.mood) : restingMood));
  const circ = 2 * Math.PI * 35;
  const tag = feeding !== false ? (feeding ? `În ${feeding.name}` : 'Lasă-mă pe un obiectiv') : here.label;

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
              <motion.nav className="dial__fan" aria-label="Navigare principală" initial="closed" animate="open" exit="closed">
                <svg className="dial__guide" viewBox={`${-R - 4} ${-R - 4} ${2 * R + 8} ${R + 8}`} width={2 * R + 8} height={R + 8} aria-hidden>
                  <motion.path
                    d={ARC}
                    variants={{ closed: { pathLength: 0, opacity: 0 }, open: { pathLength: 1, opacity: 1, transition: { duration: 0.35, ease: 'easeOut' } } }}
                  />
                </svg>
                {DIAL_SECTIONS.map((s, i) => {
                  const p = at(ANGLES[i]);
                  const current = s.id === here.id;
                  // fan out from the middle: the two inner pills first
                  const order = Math.abs(i - 1.5);
                  return (
                    <motion.button
                      key={s.id}
                      type="button"
                      className={`dial__pill ${current ? 'dial__pill--current' : ''}`}
                      variants={{
                        closed: { x: 0, y: 0, scale: 0.3, opacity: 0, transition: { duration: 0.14 } },
                        open: { x: p.x, y: p.y, scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 420, damping: 24, delay: 0.04 * order } },
                      }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onMouseEnter={() => setHover(s)}
                      onMouseLeave={() => setHover(null)}
                      onFocus={() => setHover(s)}
                      onBlur={() => setHover(null)}
                      onClick={() => go(s)}
                      aria-current={current ? 'page' : undefined}
                      autoFocus={i === 0}
                    >
                      {s.label}
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
            animate={{ scale: open ? 1.3 : 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 24 }}
            aria-expanded={open}
            aria-label={open ? 'Închide meniul' : `Meniu. Secțiunea curentă: ${here.label}. Trage-mă pe un obiectiv ca să pui bani în el.`}
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
