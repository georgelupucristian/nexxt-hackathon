import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { MoneySheet, type MoneySheetProps } from '../sheets';
import { BalanceDetails } from '../../screens/Today';
import { primaryGoal } from '../../data/selectors';
import { useData } from '../../data/store';
import { Hub } from './Hub';
import { HUB, polar, sectionFor, SECTIONS, type Section, type SectionId } from './sections';

type Origin = { x: number; y: number };

/**
 * Layout for every signed-in screen. The hub always stays mounted underneath; a section route
 * (/today, /goals/..., /activity/..., /profile/...) opens as a panel that grows out of its arc
 * while the hub sinks back, and shrinks into the arc again on close.
 */
export function HubShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const nav = useNavigate();
  const data = useData();
  const section = sectionFor(location.pathname);
  const svgRef = useRef<SVGSVGElement>(null);
  const origins = useRef<Partial<Record<SectionId, Origin>>>({});
  const [money, setMoney] = useState<Omit<MoneySheetProps, 'onClose'>>({ open: false });
  const [details, setDetails] = useState(false);

  // Deep links and the browser back button open panels without a tap, so work out where
  // each arc is on screen and launch from there.
  const originFor = (id: SectionId): Origin => {
    const known = origins.current[id];
    if (known) return known;
    const svg = svgRef.current;
    const s = SECTIONS.find((x) => x.id === id)!;
    if (!svg) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const r = svg.getBoundingClientRect();
    const p = polar((HUB.ringIn + HUB.ringOut) / 2, s.angle);
    return { x: r.left + (p.x / 400) * r.width, y: r.top + (p.y / 400) * r.height };
  };

  const open = (s: Section, at: Origin) => {
    origins.current[s.id] = at;
    navigator.vibrate?.(6);
    nav(s.path);
  };

  const close = () => nav('/home');

  return (
    <div className="hub-shell">
      <motion.div
        className="hub-stage"
        // no blur here: filtering a layer with live WebGL canvases is what makes cheap phones stutter
        animate={section ? { scale: 0.9, opacity: 0.35 } : { scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        aria-hidden={section ? true : undefined}
        // inert keeps keyboard focus out of the hub while a panel covers it
        {...(section ? { inert: '' } : {})}
      >
        <Hub
          ref={svgRef}
          active={section?.id ?? null}
          onOpen={open}
          onAdd={() => setMoney({ open: true, mode: 'contribution', goalId: primaryGoal(data.goals)?.id ?? null })}
          onDetails={() => setDetails(true)}
        />
      </motion.div>

      <AnimatePresence>
        {section && (
          <SectionPanel key={section.id} section={section} origin={originFor(section.id)} onClose={close} pathname={location.pathname}>
            {outlet}
          </SectionPanel>
        )}
      </AnimatePresence>

      <MoneySheet {...money} onClose={() => setMoney({ open: false })} />
      <BalanceDetails open={details} onClose={() => setDetails(false)} />
    </div>
  );
}

function SectionPanel({ section, origin, onClose, pathname, children }: { section: Section; origin: Origin; onClose: () => void; pathname: string; children: ReactNode }) {
  const drag = useDragControls();
  const [vw, vh] = [window.innerWidth, window.innerHeight];
  // transform + opacity only, so the launch stays on the compositor (no repaint per frame)
  const from = { opacity: 0, scale: 0.08, x: origin.x - vw / 2, y: origin.y - vh / 2 };
  const Icon = section.icon;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // a sheet inside the panel handles its own Escape first
      if (e.key === 'Escape' && !document.querySelector('.sheet-backdrop')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // moving between screens inside a section starts each one at the top
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <motion.section
      className={`panel panel--${section.id}`}
      role="dialog"
      aria-modal="true"
      aria-label={section.label}
      initial={from}
      animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
      exit={{ ...from, transition: { type: 'spring', stiffness: 380, damping: 36 } }}
      transition={{ type: 'spring', stiffness: 240, damping: 28, mass: 0.9 }}
      drag="y"
      dragListener={false}
      dragControls={drag}
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.7 }}
      onDragEnd={(_, info) => {
        if (info.offset.y > 140 || info.velocity.y > 700) onClose();
      }}
    >
      <header className="panel__head" onPointerDown={(e) => drag.start(e)}>
        <span className="panel__grabber" aria-hidden />
        <span className="panel__title">
          <span className="panel__icon" aria-hidden>
            <Icon size={18} />
          </span>
          {section.label}
        </span>
        <motion.button type="button" className="panel__close" onClick={onClose} whileTap={{ scale: 0.9 }} aria-label={`Close ${section.label}`}>
          <ChevronDown size={22} aria-hidden />
        </motion.button>
      </header>
      <motion.div ref={scroller} className="panel__body" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.12 } }} exit={{ opacity: 0, transition: { duration: 0.08 } }}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={pathname} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </motion.section>
  );
}

