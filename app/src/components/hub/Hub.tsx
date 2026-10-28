import NumberFlow from '@number-flow/react';
import { ArrowRight, Eye, EyeOff, FlaskConical, Plus } from 'lucide-react';
import { motion } from 'motion/react';
import { forwardRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoalCard, TxRow, WeekStrip } from '../domain';
import { Emoji3D, type EmojiName } from '../Emoji3D';
import { OnboardingChecklist } from '../watermelon/onboarding-checklist';
import { breakdown, currentStreak, goalSaved, primaryGoal, sortTx, todayAction, type TodayAction } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import { todayKey, toKey } from '../../lib/dates';
import { formatLei } from '../../lib/money';
import { arcPath, HUB, polar, SECTIONS, type Section, type SectionId } from './sections';

interface HubProps {
  active: SectionId | null;
  onOpen: (s: Section, origin: { x: number; y: number }) => void;
  onAdd: (goalId?: string | null, amount?: number) => void;
  onDetails: () => void;
}

const spring = { type: 'spring', stiffness: 320, damping: 26 } as const;
// Entrance order: greeting → savings orb pops up → the four arcs slide out from behind it →
// side cards. Each beat waits for the previous one, so the screen assembles instead of flashing in.
const T = { orb: 0.15, arcs: 0.55, aside: 0.95 };

/**
 * Home. Savings sit in a circle in the middle; the four sections are the circle's outline,
 * split into arcs that open like apps. On a laptop the spare width holds what you'd check
 * next (today's step and streak on the left, primary goal and recent activity on the right).
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
  const recent = sortTx(data.transactions).slice(0, 3);
  const joined = account?.isDemo ? '2000-01-01' : account ? toKey(new Date(account.createdAt)) : todayKey();
  const isNew = data.transactions.length === 0 && !account?.isDemo;

  const badges: Partial<Record<SectionId, boolean>> = {
    today: action.kind !== 'done-today',
    activity: data.transactions.some((t) => t.status === 'pending' || t.status === 'failed'),
  };

  const orbPct = (HUB.orbR * 2) / 4;
  const progressR = HUB.orbR + 7; // in the gap between the orb and the arcs
  const circ = 2 * Math.PI * progressR;

  return (
    <div className="hub">
      <motion.header className="hub__head" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={spring}>
        <h1 className="hub__hello">
          <span className="hub__hello-muted">Hello,</span> <span className="truncate">{name}</span>
          <motion.span
            className="hub__wave"
            initial={{ rotate: 0 }}
            animate={{ rotate: [0, 18, -8, 18, 0] }}
            transition={{ duration: 1.2, delay: 0.4, ease: 'easeInOut' }}
            aria-hidden
          >
            <Emoji3D name="hand" size={34} />
          </motion.span>
        </h1>
        <div className="hub__chips">
          {account?.isDemo && (
            <span className="pill pill--demo">
              <FlaskConical aria-hidden /> Sample data
            </span>
          )}
          <button type="button" className="streak-chip" onClick={() => nav('/today')} aria-label={`${streak} day streak. Open Today`}>
            <Emoji3D name="fire" size={20} />
            <NumberFlow value={streak} />
          </button>
        </div>
      </motion.header>

      <motion.aside className="hub__left" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.08, delayChildren: T.aside } } }}>
        <motion.div variants={sideIn(-1)}>
          <TodayNudge action={action} onAdd={onAdd} />
        </motion.div>
        <motion.div variants={sideIn(-1)} className="hub__desk-only">
          <WeekStrip joined={joined} streak={streak} onOpen={() => nav('/today')} />
        </motion.div>
        {isNew && (
          <motion.div variants={sideIn(-1)}>
            <OnboardingChecklist
              title="Your first week with Kept"
              defaultOpen={false}
              steps={[
                { id: 'goal', title: 'Set your first goal', done: data.goals.length > 0, onClick: () => nav('/goals/new') },
                { id: 'save', title: 'Record your first savings', done: data.transactions.length > 0, onClick: () => onAdd() },
                { id: 'remind', title: 'Pick a reminder day', done: data.reminder.enabled, onClick: () => nav('/profile/reminders') },
                { id: 'streak', title: 'Check in two days in a row', done: streak >= 2, onClick: () => nav('/today') },
              ]}
            />
          </motion.div>
        )}
      </motion.aside>

      <div className="hub__center">
        <div className="hub__dial">
          <svg ref={svgRef} viewBox="0 0 400 400" className="hub__ring" role="presentation">
            <defs>
              <linearGradient id="hub-progress" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#9be7bd" />
                <stop offset="100%" stopColor="#1f7a52" />
              </linearGradient>
              {SECTIONS.map((s) => (
                <radialGradient key={s.id} id={`arc-${s.id}`} cx="200" cy="200" r="194" gradientUnits="userSpaceOnUse">
                  <stop offset="0.68" stopColor={`var(--arc-${s.id}-in)`} />
                  <stop offset="1" stopColor={`var(--arc-${s.id}-out)`} />
                </radialGradient>
              ))}
            </defs>
            {SECTIONS.map((s, i) => {
              const isActive = active === s.id;
              const dim = active !== null && !isActive;
              return (
                <motion.path
                  key={s.id}
                  d={arcPath(s.angle - 45 + HUB.gapDeg / 2, s.angle + 45 - HUB.gapDeg / 2)}
                  className="hub__arc"
                  fill={`url(#arc-${s.id})`}
                  style={{ transformOrigin: '200px 200px', transformBox: 'view-box' }}
                  // start tucked behind the orb, then slide out
                  initial={{ scale: 0.55, opacity: 0 }}
                  animate={{ scale: isActive ? 1.05 : dim ? 0.92 : 1, opacity: dim ? 0.4 : 1 }}
                  whileHover={active ? undefined : { scale: 1.035 }}
                  whileTap={{ scale: 0.96 }}
                  transition={{ ...spring, delay: active === null ? T.arcs + 0.07 * i : 0 }}
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
              transition={{ type: 'spring', stiffness: 40, damping: 16, delay: T.arcs + 0.3 }}
            />
          </svg>

          {SECTIONS.map((s, i) => {
            const p = polar((HUB.ringIn + HUB.ringOut) / 2, s.angle);
            return (
              <motion.span
                key={s.id}
                className={`hub__label hub__label--${s.id}`}
                style={{ left: `${p.x / 4}%`, top: `${p.y / 4}%` }}
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: active && active !== s.id ? 0.3 : 1, scale: 1 }}
                transition={{ ...spring, delay: T.arcs + 0.15 + 0.07 * i }}
                aria-hidden
              >
                <Emoji3D name={s.emoji as EmojiName} size={30} />
                {s.label}
                {badges[s.id] && <i className="hub__badge" />}
              </motion.span>
            );
          })}

          <motion.div
            className="hub__orb"
            style={{ width: `${orbPct}%`, height: `${orbPct}%` }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: T.orb }}
          >
            <span className="hub__orb-glow" aria-hidden />
            <div className="hub__orb-label">
              Your savings
              <button type="button" className="hub__eye" aria-label={hidden ? 'Show balance' : 'Hide balance'} onClick={() => setPrefs({ hideBalance: !hidden })}>
                {hidden ? <EyeOff size={15} aria-hidden /> : <Eye size={15} aria-hidden />}
              </button>
            </div>
            <button type="button" className="hub__amount" onClick={onDetails} aria-label={hidden ? 'Balance hidden. Open balance details' : `${b.total / 100} lei. Open balance details`}>
              {hidden ? <span className="hub__amount-int">••••</span> : <NumberFlow value={b.total / 100} className="hub__amount-int" locales="ro-RO" format={{ maximumFractionDigits: 0 }} />}
              <span className="hub__amount-cur">lei</span>
            </button>
            {goal && (
              <p className="hub__goal">
                {Math.round(pct * 100)}% of {goal.name}
              </p>
            )}
            <motion.button type="button" className="hub__add" onClick={() => onAdd()} whileTap={{ scale: 0.88 }} whileHover={{ scale: 1.06 }} transition={spring} aria-label={data.tracking === 'demo' ? 'Add money' : 'Record savings'}>
              <Plus size={26} strokeWidth={2.6} aria-hidden />
            </motion.button>
          </motion.div>
        </div>
      </div>

      <motion.aside className="hub__right hub__desk-only" initial="hidden" animate="shown" variants={{ shown: { transition: { staggerChildren: 0.08, delayChildren: T.aside } } }}>
        <motion.section variants={sideIn(1)} className="section" aria-labelledby="hub-goal-h">
          <div className="section-head">
            <h2 id="hub-goal-h">{goal ? 'Primary goal' : 'Goals'}</h2>
            <Link to="/goals" className="link-btn">
              All goals
            </Link>
          </div>
          {goal ? (
            <GoalCard goal={goal} />
          ) : (
            <button type="button" className="hub-empty" onClick={() => nav('/goals/new')}>
              <Emoji3D name="target" size={40} /> Create your first goal
            </button>
          )}
        </motion.section>
        <motion.section variants={sideIn(1)} className="section" aria-labelledby="hub-recent-h">
          <div className="section-head">
            <h2 id="hub-recent-h">Recent activity</h2>
            {recent.length > 0 && (
              <Link to="/activity" className="link-btn">
                See all
              </Link>
            )}
          </div>
          <div className="card card--flush">
            {recent.length ? (
              <ul className="list">
                {recent.map((t) => (
                  <li key={t.id}>
                    <TxRow tx={t} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hub-empty hub-empty--quiet">
                <Emoji3D name="seedling" size={32} /> Your first entry will show up here.
              </p>
            )}
          </div>
        </motion.section>
      </motion.aside>
    </div>
  );
});

const sideIn = (dir: 1 | -1) => ({
  hidden: { opacity: 0, x: 24 * dir },
  shown: { opacity: 1, x: 0, transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
});

/** One clear next step, the same one Kip talks about. */
function TodayNudge({ action, onAdd }: { action: TodayAction; onAdd: (goalId?: string | null, amount?: number) => void }) {
  const nav = useNavigate();
  let emoji: EmojiName = 'calendar2';
  let title = '';
  let cta: { label: string; run: () => void } | null = { label: 'Open Today', run: () => nav('/today') };
  switch (action.kind) {
    case 'create-goal':
      emoji = 'target';
      title = 'Pick something to save for';
      cta = { label: 'Create a goal', run: () => nav('/goals/new') };
      break;
    case 'set-plan':
      title = `Give ${action.goal.name} a plan`;
      cta = { label: 'Set plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'planned-contribution':
      emoji = 'coin';
      title = `${formatLei(action.amount)} planned for today`;
      cta = { label: 'Record it', run: () => onAdd(action.goal.id, action.amount) };
      break;
    case 'fix-connection':
      emoji = 'hourglass';
      title = 'The demo sync needs a retry';
      break;
    case 'goal-reached':
      emoji = 'party';
      title = `${action.goal.name} is fully saved`;
      cta = { label: 'Open goal', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'review-week':
    case 'review-plan':
      emoji = 'growth';
      title = 'Quick check-in on your plan';
      break;
    case 'done-today':
      emoji = 'check';
      title = 'You’re done for today';
      cta = null;
      break;
  }
  return (
    <section className="nudge" aria-label="Today">
      <Emoji3D name={emoji} size={44} />
      <div className="nudge__text">
        <p className="nudge__kicker">Today</p>
        <p className="nudge__title">{title}</p>
      </div>
      {cta && (
        <motion.button type="button" className="nudge__cta" onClick={cta.run} whileTap={{ scale: 0.94 }} aria-label={cta.label}>
          <span className="nudge__cta-label">{cta.label}</span>
          <ArrowRight size={18} aria-hidden />
        </motion.button>
      )}
    </section>
  );
}
