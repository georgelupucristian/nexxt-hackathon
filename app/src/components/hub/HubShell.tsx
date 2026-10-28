import { ChevronDown, ListOrdered, Target, User, type LucideIcon } from '@/lib/icons';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { MoneySheet, type MoneySheetProps } from '../sheets';
import { BalanceDetails } from '../../screens/Today';
import { hubLine } from '../mascot/lines';
import { currentStreak, goalSaved, primaryGoal, todayAction } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { Hub } from './Hub';
import { MascotDial } from './MascotDial';

interface Panel {
  id: 'goals' | 'activity' | 'profile';
  label: string;
  path: string;
  icon: LucideIcon;
}
const PANELS: Panel[] = [
  { id: 'goals', label: 'Goals', path: '/goals', icon: Target },
  { id: 'activity', label: 'Activity', path: '/activity', icon: ListOrdered },
  { id: 'profile', label: 'Profile', path: '/profile', icon: User },
];
const panelFor = (pathname: string) => PANELS.find((p) => pathname === p.path || pathname.startsWith(`${p.path}/`)) ?? null;

type Origin = { x: number; y: number };

/**
 * Layout for every signed-in screen. Home stays mounted underneath; Goals, Activity and Profile
 * open as a panel that grows out of Kip's dial (where you tapped) and shrink back into it on close.
 */
export function HubShell() {
  const location = useLocation();
  const outlet = useOutlet();
  const nav = useNavigate();
  const data = useData();
  const { account } = useStore();
  const panel = panelFor(location.pathname);
  const [money, setMoney] = useState<Omit<MoneySheetProps, 'onClose'>>({ open: false });
  const [details, setDetails] = useState(false);
  const goal = primaryGoal(data.goals);
  const pct = goal && goal.target > 0 ? Math.min(1, goalSaved(data.transactions, goal.id) / goal.target) : 0;
  const kip = hubLine(todayAction(data), account?.name ?? '', currentStreak(data));

  const openAdd = (goalId: string | null = goal?.id ?? null, presetAmount?: number) => setMoney({ open: true, mode: 'contribution', goalId, presetAmount });

  // panels grow out of the dial, wherever the user has dragged it
  const dialCenter = (): Origin => {
    const el = document.querySelector('.dial__kip');
    if (!el) return { x: window.innerWidth - 48, y: window.innerHeight - 48 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  return (
    <div className="hub-shell">
      <motion.div
        className="hub-stage"
        animate={panel ? { scale: 0.94, opacity: 0.4 } : { scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        aria-hidden={panel ? true : undefined}
        {...(panel ? { inert: '' } : {})}
      >
        <Hub onAdd={openAdd} onDetails={() => setDetails(true)} />
      </motion.div>

      <AnimatePresence>
        {panel && (
          <SectionPanel key={panel.id} panel={panel} origin={dialCenter()} onClose={() => nav('/home')} pathname={location.pathname}>
            {outlet}
          </SectionPanel>
        )}
      </AnimatePresence>

      <MascotDial restingMood={kip.state} progress={pct} />
      <MoneySheet {...money} onClose={() => setMoney({ open: false })} />
      <BalanceDetails open={details} onClose={() => setDetails(false)} />
    </div>
  );
}

function SectionPanel({ panel, origin, onClose, pathname, children }: { panel: Panel; origin: Origin; onClose: () => void; pathname: string; children: ReactNode }) {
  const drag = useDragControls();
  const [vw, vh] = [window.innerWidth, window.innerHeight];
  // transform + opacity only, so the launch stays on the compositor
  const from = { opacity: 0, scale: 0.08, x: origin.x - vw / 2, y: origin.y - vh / 2 };
  const Icon = panel.icon;
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.sheet-backdrop')) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <motion.section
      className="panel"
      role="dialog"
      aria-modal="true"
      aria-label={panel.label}
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
          <Icon size={20} aria-hidden />
          {panel.label}
        </span>
        <button type="button" className="panel__close" onClick={onClose} aria-label={`Close ${panel.label}`}>
          <ChevronDown size={22} aria-hidden />
        </button>
      </header>
      <div ref={scroller} className="panel__body">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div key={pathname} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ type: 'spring', stiffness: 420, damping: 36 }}>
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
