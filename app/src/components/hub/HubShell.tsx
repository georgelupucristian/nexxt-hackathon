import { ChevronDown, ListOrdered, Target, User, Users, type LucideIcon } from '@/lib/icons';
import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLocation, useNavigate, useOutlet } from 'react-router-dom';
import { SaveSheet, type SaveSheetProps } from '../MoneySheets';
import { BalanceDetails } from '../../screens/Today';
import { hubLine } from '../mascot/lines';
import { currentStreak, primaryGoal, todayAction } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { goalLook, goalVars } from '../../lib/goalLook';
import { Hub } from './Hub';
import { MascotDial } from './MascotDial';
import { StreakMoment } from '../mascot/StreakMoment';
import { Tour } from './Tour';
import { MoneyMoments, RealSaveSheet } from '../money';

interface Panel {
  id: 'goals' | 'activity' | 'profile' | 'friends' | 'clubs';
  label: string;
  path: string;
  icon: LucideIcon;
  /** more paths that open in this same panel (friends, colonies and shared goals share one) */
  also?: string[];
}
const PANELS: Panel[] = [
  { id: 'goals', label: 'Goals', path: '/goals', icon: Target },
  { id: 'activity', label: 'Activity', path: '/activity', icon: ListOrdered },
  { id: 'profile', label: 'Profile', path: '/profile', icon: User },
  // not on Kip's dial (it keeps its four slices): reached from home's people icon and from Profile
  { id: 'friends', label: 'Friends', path: '/friends', icon: Users, also: ['/colonies', '/shared-goal'] },
  // clubs and promotions: off the dial too, reached from home's clubs row and from Profile
  { id: 'clubs', label: 'Clubs', path: '/clubs', icon: Users, also: ['/promotions'] },
];
const under = (pathname: string, path: string) => pathname === path || pathname.startsWith(`${path}/`);
const panelFor = (pathname: string) => PANELS.find((p) => under(pathname, p.path) || p.also?.some((a) => under(pathname, a))) ?? null;
/** The friends panel names what's in it: a colony, a shared goal, or friends. */
const titleFor = (panel: Panel, pathname: string) =>
  panel.id === 'clubs' ? (under(pathname, '/promotions') ? 'Promotions' : panel.label) : panel.id !== 'friends' ? panel.label : under(pathname, '/colonies') ? 'Colonies' : under(pathname, '/shared-goal') ? 'Shared goal' : panel.label;

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
  const { account, money } = useStore();
  const panel = panelFor(location.pathname);
  const [save, setSave] = useState<Omit<SaveSheetProps, 'onClose'>>({ open: false });
  const [details, setDetails] = useState(false);
  const goal = primaryGoal(data.goals);
  const kip = hubLine(todayAction(data), account?.name ?? '', currentStreak(data));

  const openAdd = (goalId: string | null = goal?.id ?? null, presetAmount?: number) => setSave({ open: true, goalId, presetAmount });

  // Kip was dragged onto a goal: ask how much goes into it
  useEffect(() => {
    const onFeed = (e: Event) => setSave({ open: true, goalId: (e as CustomEvent<string>).detail });
    window.addEventListener('kip:feed', onFeed);
    return () => window.removeEventListener('kip:feed', onFeed);
  }, []);

  // panels grow out of the dial, wherever the user has dragged it
  const dialCenter = (): Origin => {
    const el = document.querySelector('.dial__kip');
    if (!el) return { x: window.innerWidth - 48, y: window.innerHeight - 48 };
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  return (
    // the main goal's colour tints the wash behind home (see shell.css). One <main> for every
    // signed-in screen: home underneath and the panel open over it.
    <main className="hub-shell" style={goal ? (goalVars(goalLook(goal)) as CSSProperties) : undefined}>
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

      <MascotDial restingMood={kip.state} />
      <StreakMoment />
      <Tour />
      {/* a Supabase account moves real (Stripe test) money; the local and demo ones record it */}
      {money ? <RealSaveSheet open={save.open} onClose={() => setSave({ open: false })} presetAmount={save.presetAmount} /> : <SaveSheet {...save} onClose={() => setSave({ open: false })} />}
      {account?.remote && <MoneyMoments />}
      <BalanceDetails open={details} onClose={() => setDetails(false)} />
    </main>
  );
}

function SectionPanel({ panel, origin, onClose, pathname, children }: { panel: Panel; origin: Origin; onClose: () => void; pathname: string; children: ReactNode }) {
  const drag = useDragControls();
  const [vw, vh] = [window.innerWidth, window.innerHeight];
  // transform + opacity only, so the launch stays on the compositor
  const from = { opacity: 0, scale: 0.08, x: origin.x - vw / 2, y: origin.y - vh / 2 };
  const Icon = panel.icon;
  const label = titleFor(panel, pathname);
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // one Escape closes one layer: a sheet or Kip's open menu goes first, the panel next time
      if (e.key === 'Escape' && !document.querySelector('.sheet-backdrop, .dial--open')) onClose();
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
      aria-label={label}
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
      {/* a div, not <header>: a second banner landmark on the page confuses screen readers */}
      <div className="panel__head" onPointerDown={(e) => drag.start(e)}>
        <span className="panel__grabber" aria-hidden />
        <span className="panel__title">
          <Icon size={20} aria-hidden />
          {label}
        </span>
        <button type="button" className="panel__close" onClick={onClose} aria-label={`Close ${label}`}>
          <ChevronDown size={22} aria-hidden />
        </button>
      </div>
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
