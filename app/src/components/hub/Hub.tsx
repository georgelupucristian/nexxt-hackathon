import NumberFlow from '@number-flow/react';
import { Eye, EyeOff, Flame, FlaskConical, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MascotSays } from '../mascot/MascotSays';
import { hubLine, POKES, type Line } from '../mascot/lines';
import { OnboardingChecklist } from '../watermelon/onboarding-checklist';
import { breakdown, currentStreak, goalSaved, primaryGoal, todayAction } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { arcPath, HUB, polar, SECTIONS, type Section, type SectionId } from './sections';

interface HubProps {
  active: SectionId | null;
  onOpen: (s: Section, origin: { x: number; y: number }) => void;
  onAdd: () => void;
  onDetails: () => void;
}

const spring = { type: 'spring', stiffness: 380, damping: 24 } as const;

/**
 * Home is one dial: total savings in the middle, the four sections as arcs around it. Tapping an
 * arc launches that section from the arc itself (see HubShell), like opening an app on a phone.
 */
export const Hub = forwardRef<SVGSVGElement, HubProps>(function Hub({ active, onOpen, onAdd, onDetails }, svgRef) {
  const data = useData();
  const { account, setPrefs } = useStore();
  const nav = useNavigate();
  const b = breakdown(data.transactions);
  const hidden = data.prefs.hideBalance;
  const goal = primaryGoal(data.goals);
  const saved = goal ? goalSaved(data.transactions, goal.id) : 0;
  const pct = goal && goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const streak = currentStreak(data);
  const action = todayAction(data);
  const name = account?.name ?? 'there';
  const [poke, setPoke] = useState<{ line: Line; n: number } | null>(null);
  const line = poke?.line ?? hubLine(action, name, streak);

  // little dots that say "something here wants you", so the dial isn't just navigation
  const badges: Partial<Record<SectionId, boolean>> = {
    today: action.kind !== 'done-today',
    activity: data.transactions.some((t) => t.status === 'pending' || t.status === 'failed'),
  };

  const amount = b.total / 100;
  const orbPct = (HUB.orbR * 2) / 4; // orb diameter as % of the dial
  // sits in the gap between the orb and the arcs
  const progressR = HUB.orbR + 7;
  const circ = 2 * Math.PI * progressR;

  const isNew = data.transactions.length === 0 && !account?.isDemo;

  return (
    <div className="hub">
      <header className="hub__head">
        <div>
          <p className="hub__hello">{greetingFor()},</p>
          <h1 className="hub__name truncate">{name}</h1>
        </div>
        <div className="hub__chips">
          {account?.isDemo && (
            <span className="pill pill--demo">
              <FlaskConical aria-hidden /> Sample data
            </span>
          )}
          <button type="button" className="streak-chip" onClick={() => nav('/today')} aria-label={`${streak} day streak. Open Today`}>
            <motion.span key={streak} initial={{ scale: 0.4, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }} className="streak-chip__flame">
              <Flame size={16} aria-hidden />
            </motion.span>
            <NumberFlow value={streak} />
          </button>
        </div>
      </header>

      <div className="hub__dial">
        <svg ref={svgRef} viewBox="0 0 400 400" className="hub__ring" role="presentation">
          <defs>
            <linearGradient id="hub-progress" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="var(--accent-bright)" />
              <stop offset="100%" stopColor="var(--accent)" />
            </linearGradient>
          </defs>
          {SECTIONS.map((s, i) => {
            const a0 = s.angle - 45 + HUB.gapDeg / 2;
            const a1 = s.angle + 45 - HUB.gapDeg / 2;
            const isActive = active === s.id;
            const dim = active !== null && !isActive;
            return (
              <motion.path
                key={s.id}
                d={arcPath(a0, a1)}
                className={`hub__arc hub__arc--${s.id}`}
                style={{ transformOrigin: '200px 200px', transformBox: 'view-box' }}
                initial={{ scale: 0.82, opacity: 0 }}
                animate={{ scale: isActive ? 1.06 : dim ? 0.9 : 1, opacity: dim ? 0.35 : 1 }}
                whileHover={active ? undefined : { scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                transition={{ ...spring, delay: active === null ? 0.08 * i : 0 }}
                role="link"
                tabIndex={0}
                aria-label={s.label}
                onClick={(e) => onOpen(s, { x: e.clientX, y: e.clientY })}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter' && e.key !== ' ') return;
                  e.preventDefault();
                  const r = (e.currentTarget as SVGPathElement).getBoundingClientRect();
                  onOpen(s, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
                }}
              />
            );
          })}
          {/* primary goal progress hugs the inside of the orb */}
          <circle cx="200" cy="200" r={progressR} className="hub__track" />
          <motion.circle
            cx="200"
            cy="200"
            r={progressR}
            fill="none"
            stroke="url(#hub-progress)"
            strokeWidth="6"
            strokeLinecap="round"
            transform="rotate(-90 200 200)"
            strokeDasharray={circ}
            initial={{ strokeDashoffset: circ }}
            animate={{ strokeDashoffset: circ * (1 - pct) }}
            transition={{ type: 'spring', stiffness: 40, damping: 16, delay: 0.3 }}
          />
        </svg>

        {SECTIONS.map((s, i) => {
          const p = polar((HUB.ringIn + HUB.ringOut) / 2, s.angle);
          const Icon = s.icon;
          return (
            <motion.span
              key={s.id}
              className={`hub__label hub__label--${s.id}`}
              style={{ left: `${p.x / 4}%`, top: `${p.y / 4}%` }}
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: active && active !== s.id ? 0.3 : 1, scale: 1 }}
              transition={{ ...spring, delay: 0.15 + 0.08 * i }}
              aria-hidden
            >
              <Icon size={20} />
              {s.label}
              {badges[s.id] && <motion.i className="hub__badge" animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 1.6, repeat: Infinity, repeatDelay: 1.2 }} />}
            </motion.span>
          );
        })}

        <motion.div
          className="hub__orb"
          style={{ width: `${orbPct}%`, height: `${orbPct}%` }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20 }}
        >
          <span className="hub__orb-glow" aria-hidden />
          <div className="hub__orb-label">
            Total savings
            <button type="button" className="hub__eye" aria-label={hidden ? 'Show balance' : 'Hide balance'} onClick={() => setPrefs({ hideBalance: !hidden })}>
              {hidden ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
            </button>
          </div>
          <button type="button" className="hub__amount" onClick={onDetails} aria-label={hidden ? 'Balance hidden. Open balance details' : `${amount} lei. Open balance details`}>
            {hidden ? (
              <span className="hub__amount-int">••••</span>
            ) : (
              <NumberFlow value={amount} className="hub__amount-int" locales="ro-RO" format={{ maximumFractionDigits: 0 }} />
            )}
            <span className="hub__amount-cur">lei</span>
          </button>
          {goal && (
            <p className="hub__goal">
              {Math.round(pct * 100)}% of {goal.name}
            </p>
          )}
          <motion.button type="button" className="hub__add" onClick={onAdd} whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} transition={spring} aria-label={data.tracking === 'demo' ? 'Add money' : 'Record savings'}>
            <Plus size={26} strokeWidth={2.6} aria-hidden />
          </motion.button>
        </motion.div>
      </div>

      <MascotSays
        state={line.state}
        message={line.text}
        messageKey={`${line.text}-${poke?.n ?? 0}`}
        size={112}
        onPoke={() => setPoke((p) => ({ line: POKES[((p?.n ?? -1) + 1) % POKES.length], n: (p?.n ?? -1) + 1 }))}
        className="hub__mascot"
      />

      {isNew && (
        <div className="hub__checklist">
          <OnboardingChecklist
            title="Your first week with Kept"
            steps={[
              { id: 'goal', title: 'Set your first goal', done: data.goals.length > 0, onClick: () => nav('/goals/new') },
              { id: 'save', title: 'Record your first savings', done: data.transactions.length > 0, onClick: onAdd },
              { id: 'remind', title: 'Pick a reminder day', done: data.reminder.enabled, onClick: () => nav('/profile/reminders') },
              { id: 'streak', title: 'Check in two days in a row', done: streak >= 2, onClick: () => nav('/today') },
            ]}
          />
        </div>
      )}
    </div>
  );
});

function greetingFor(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
