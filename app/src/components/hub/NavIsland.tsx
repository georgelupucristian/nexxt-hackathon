// A floating "you are here" island you can drag anywhere on screen.
// Adapted from Watermelon UI "Scroll Island" (ui.watermelon.sh/animated-components/scroll-island):
// the dark pill that morphs on a spring, the conic progress ring, and the list that opens under
// it over a blurred backdrop. Here the ring shows your primary goal and the list is navigation.
import { ChevronDown, LogOut } from 'lucide-react';
import { AnimatePresence, motion, useMotionValue } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Emoji3D, type EmojiName } from '../Emoji3D';
import { goalSaved, primaryGoal } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { SECTIONS, sectionFor } from './sections';

const PLACES: { id: string; label: string; path: string; emoji: EmojiName }[] = [
  { id: 'home', label: 'Home', path: '/home', emoji: 'house' },
  ...SECTIONS.map((s) => ({ id: s.id, label: s.label, path: s.path, emoji: s.emoji })),
];

const POS_KEY = 'kept.island.pos';
const spring = { type: 'spring', bounce: 0.2, duration: 0.6 } as const;

export function NavIsland() {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const data = useData();
  const { signOut } = useStore();
  const here = PLACES.find((p) => p.id === (sectionFor(pathname)?.id ?? 'home'))!;
  const [open, setOpen] = useState(false);
  // "standby" is the small circle; for a moment after you land somewhere it widens to say where
  const [announce, setAnnounce] = useState(true);
  const bounds = useRef<HTMLDivElement>(null);
  const saved = (() => {
    try {
      return JSON.parse(localStorage.getItem(POS_KEY) ?? 'null') as { x: number; y: number } | null;
    } catch {
      return null;
    }
  })();
  const x = useMotionValue(saved?.x ?? 0);
  const y = useMotionValue(saved?.y ?? 0);
  const [below, setBelow] = useState(true);
  const pill = useRef<HTMLButtonElement>(null);
  // a drag ends with a click on the pill; ignore that one so dragging doesn't also open it
  const lastDrag = useRef(0);

  useEffect(() => {
    setAnnounce(true);
    setOpen(false);
    const t = setTimeout(() => setAnnounce(false), 2600);
    return () => clearTimeout(t);
  }, [here.id]);

  const goal = primaryGoal(data.goals);
  const pct = goal && goal.target > 0 ? Math.min(100, (goalSaved(data.transactions, goal.id) / goal.target) * 100) : 0;
  const wide = open || announce;

  const toggle = () => {
    if (Date.now() - lastDrag.current < 250) return;
    const el = pill.current;
    // open the menu towards the roomier half of the screen
    if (el) setBelow(el.getBoundingClientRect().top < window.innerHeight / 2);
    setOpen((o) => !o);
  };

  return (
    <>
      <AnimatePresence>
        {open && <motion.div className="island-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setOpen(false)} />}
      </AnimatePresence>
      <div ref={bounds} className="island-bounds" aria-hidden={false}>
        <motion.div
          className={`island ${below ? 'island--below' : 'island--above'}`}
          drag={!open}
          dragConstraints={bounds}
          dragElastic={0.12}
          dragMomentum={false}
          style={{ x, y }}
          onDragEnd={() => {
            lastDrag.current = Date.now();
            localStorage.setItem(POS_KEY, JSON.stringify({ x: x.get(), y: y.get() }));
          }}
        >
          <motion.button
            ref={pill}
            type="button"
            layout
            className="island__pill"
            style={{ borderRadius: 999 }}
            transition={spring}
            onClick={toggle}
            aria-expanded={open}
            aria-label={`You’re in ${here.label}. Open navigation`}
            whileTap={{ scale: 0.95 }}
          >
            <motion.span layout="position" className="island__ring" style={{ background: `conic-gradient(var(--accent-bright) ${pct}%, rgba(255,255,255,0.14) 0)` }}>
              <img src="/mascot/idle-face.webp" alt="" />
            </motion.span>
            <AnimatePresence mode="popLayout" initial={false}>
              {wide && (
                <motion.span
                  key={here.id}
                  className="island__label"
                  initial={{ opacity: 0, filter: 'blur(4px)', x: -6 }}
                  animate={{ opacity: 1, filter: 'blur(0px)', x: 0 }}
                  exit={{ opacity: 0, filter: 'blur(4px)' }}
                  transition={{ duration: 0.25 }}
                >
                  <span className="island__muted">You’re in</span> {here.label}
                  <motion.span animate={{ rotate: open ? 180 : 0 }} className="island__chev">
                    <ChevronDown size={16} aria-hidden />
                  </motion.span>
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>

          <AnimatePresence>
            {open && (
              <motion.nav
                className="island__menu"
                aria-label="Go to"
                initial={{ opacity: 0, scale: 0.6, y: below ? -16 : 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: below ? -12 : 12 }}
                transition={spring}
              >
                {PLACES.map((p) => {
                  const current = p.id === here.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="island__item"
                      aria-current={current ? 'page' : undefined}
                      onClick={() => {
                        setOpen(false);
                        if (!current) nav(p.path);
                      }}
                    >
                      {current && <motion.span layoutId="island-current" className="island__current" transition={spring} />}
                      <Emoji3D name={p.emoji} size={26} />
                      <span>{p.label}</span>
                      {current && <span className="island__here">You’re here</span>}
                    </button>
                  );
                })}
                <div className="island__sep" />
                <button
                  type="button"
                  className="island__item island__item--out"
                  onClick={() => {
                    setOpen(false);
                    signOut();
                    nav('/welcome', { replace: true });
                  }}
                >
                  <LogOut size={20} aria-hidden />
                  <span>Sign out</span>
                </button>
              </motion.nav>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </>
  );
}
