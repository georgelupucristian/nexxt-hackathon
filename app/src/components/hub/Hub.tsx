import NumberFlow from '@number-flow/react';
import { ArrowRight, ChevronRight, Eye, EyeOff, Flame } from '@/lib/icons';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { planLabel, TxRow } from '../domain';
import { hubLine } from '../mascot/lines';
import { useToast } from '../ui';
import { PlanSimulator, QuickRecord } from './Playful';
import { SleepTile } from './SleepOnIt';
import {
  activeGoals,
  breakdown,
  currentStreak,
  goalSaved,
  planHealth,
  primaryGoal,
  projectedFinish,
  requiredPace,
  sortTx,
  todayAction,
  weekStates,
  type TodayAction,
} from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { daysBetween, formatDate, todayKey, toKey, WEEKDAY_SHORT } from '../../lib/dates';
import { formatLei } from '../../lib/money';

interface HubProps {
  onAdd: (goalId?: string | null, amount?: number) => void;
  onDetails: () => void;
}

const spring = { type: 'spring', stiffness: 320, damping: 30 } as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.05 * i } });

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Home, in reading order: what you've saved, the one thing to do today, how your goal is going,
 * your check-ins, and what happened recently. A first-time user sees a focused start instead of a
 * dashboard of zeros. Navigation lives in Kip's dial, so nothing here competes with it.
 */
export function Hub({ onAdd, onDetails }: HubProps) {
  const data = useData();
  const { account } = useStore();
  const goal = primaryGoal(data.goals);
  const action = todayAction(data);
  const firstUse = data.transactions.length === 0 && !account?.isDemo;
  const name = titleCase(account?.name ?? '');
  const others = activeGoals(data.goals).filter((g) => g.id !== goal?.id).slice(0, 3);

  return (
    <div className="home2">
      <motion.header className="home2__head home3__head" {...enter(0)}>
        <Link to="/logout" className="home2__out">
          Sign out
        </Link>
        <h1 className="home3__title">
          {greeting()},<br />
          <span className="brush home3__name">{name || 'friend'}</span>
        </h1>
      </motion.header>

      {firstUse ? (
        <motion.div {...enter(1)} className="home2__first">
          <FirstUse goal={goal} onAdd={onAdd} />
        </motion.div>
      ) : (
        <div className="home2__grid">
          <div className="home2__col">
            <motion.div {...enter(1)}>
              <Vault goal={goal} onDetails={onDetails} primaryElsewhere={hasPrimary(action)} />
            </motion.div>
            <motion.div {...enter(2)} className="tiles">
              {goal && <GoalTile goal={goal} wide />}
              <StreakTile />
              <SleepTile />
              {others.map((g) => (
                <GoalTile key={g.id} goal={g} />
              ))}
            </motion.div>
          </div>
          <div className="home2__col">
            <motion.div {...enter(3)}>
              <NextStep action={action} onAdd={onAdd} />
            </motion.div>
            {goal && goal.plan.frequency !== 'flexible' && (
              <motion.div {...enter(4)}>
                <PlanSimulator goal={goal} />
              </motion.div>
            )}
            <motion.div {...enter(5)}>
              <Recent onAdd={onAdd} />
            </motion.div>
          </div>
        </div>
      )}
    </div>
  );
}

const hasPrimary = (a: TodayAction) => a.kind !== 'done-today' && a.kind !== 'review-plan' && a.kind !== 'review-week';

// ---------- what you've saved ----------

function Vault({ goal, onDetails, primaryElsewhere }: { goal: Goal | null; onDetails: () => void; primaryElsewhere: boolean }) {
  const data = useData();
  const { setPrefs } = useStore();
  const b = breakdown(data.transactions);
  const hidden = data.prefs.hideBalance;
  const money = (v: number) => (hidden ? '••••' : formatLei(v));

  return (
    <section className="vault" aria-labelledby="vault-title">
      <div className="vault__top">
        <h2 id="vault-title" className="vault__label">
          Saved
        </h2>
        <button type="button" className="vault__eye" onClick={() => setPrefs({ hideBalance: !hidden })} aria-label={hidden ? 'Show amounts' : 'Hide amounts'}>
          {hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      <p className="vault__amount money">
        {hidden ? '••••' : <NumberFlow value={b.total / 100} locales="ro-RO" format={{ maximumFractionDigits: 0 }} />}
        <span>lei</span>
      </p>
      <p className="vault__split">
        <span>{money(b.allocated)} in goals</span>
        <span>{money(b.unallocated)} free</span>
        {b.pendingIn > 0 && <span className="vault__pending">{money(b.pendingIn)} on the way</span>}
      </p>
      <div className="vault__actions">
        <QuickRecord goal={goal} primary={!primaryElsewhere} />
        <button type="button" className="vault__more" onClick={onDetails}>
          How it adds up
        </button>
      </div>
    </section>
  );
}

// ---------- the one thing to do today ----------

function NextStep({ action, onAdd }: { action: TodayAction; onAdd: (goalId?: string | null, amount?: number) => void }) {
  const data = useData();
  const { account, checkIn, sync } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const kip = hubLine(action, titleCase(account?.name ?? ''), currentStreak(data));

  let title = '';
  let body = '';
  let primary: { label: string; run: () => void } | null = null;
  let secondary: { label: string; run: () => void } | null = null;

  switch (action.kind) {
    case 'create-goal':
      title = 'Pick something to save for';
      body = 'A laptop, Erasmus, an emergency fund, anything. You’ll get a plan that fits your week.';
      primary = { label: 'Create a goal', run: () => nav('/goals/new') };
      break;
    case 'set-plan':
      title = `Give ${action.goal.name} a plan`;
      body = 'Choose how much and how often. You can lower or pause it any time.';
      primary = { label: 'Set a plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'planned-contribution':
      title = 'Today is one of your savings days';
      body = `Your plan for ${action.goal.name} is ${planLabel(action.goal.plan).toLowerCase()}. Put the money aside wherever you keep it, then record it here so it counts. If this week is tight, record less or skip; your plan isn’t an obligation.`;
      primary = { label: `Record ${formatLei(action.amount)} I set aside`, run: () => onAdd(action.goal.id, action.amount) };
      secondary = { label: 'Record a different amount', run: () => onAdd(action.goal.id) };
      break;
    case 'fix-connection':
      title = 'The demo sync didn’t go through';
      body = 'Your last known figures are kept. Nothing was lost.';
      primary = {
        label: 'Retry sync',
        run: async () => {
          setBusy(true);
          try {
            await sync();
            toast('Synced');
          } catch (e) {
            toast((e as Error).message, 'error');
          } finally {
            setBusy(false);
          }
        },
      };
      break;
    case 'goal-reached':
      title = `You reached ${action.goal.name}`;
      body = 'Decide what’s next: archive it, raise the target, or start a new goal.';
      primary = { label: 'Open goal', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'review-week':
      title = 'Look back at your week';
      body = 'See what came in and out, then decide if next week’s plan still fits.';
      secondary = { label: 'See this week', run: () => nav('/activity') };
      break;
    case 'review-plan':
      title = 'Does your plan still fit this week?';
      body = `A ten-second check on ${action.goal.name}. Confirming counts as today’s check-in.`;
      secondary = {
        label: 'Yes, still fits',
        run: () => {
          checkIn();
          toast('Checked in. Plan confirmed.');
        },
      };
      break;
    case 'done-today':
      title = 'Nothing else to do today';
      body = 'Today is already recorded. See you on your next savings day.';
      break;
  }

  return (
    <section className="card next2" aria-labelledby="next-title">
      <div className="next2__kip">
        <img src={`/mascot/${kip.state}-face.webp`} alt="" />
        <p className="next2__says">
          <span>Kip</span> {kip.text}
        </p>
      </div>
      <h2 id="next-title" className="h3">
        {title}
      </h2>
      <p className="muted">{body}</p>
      {(primary || secondary) && (
        <div className="btn-row">
          {primary && (
            <button type="button" className="btn btn--primary" onClick={primary.run} disabled={busy}>
              {primary.label}
            </button>
          )}
          {secondary && (
            <button type="button" className={`btn ${primary ? 'btn--ghost' : 'btn--secondary'}`} onClick={secondary.run}>
              {secondary.label}
            </button>
          )}
        </div>
      )}
      {data.transactions.length === 0 && action.kind !== 'create-goal' && <p className="small muted">Kept never moves money. It records what you set aside.</p>}
    </section>
  );
}

// ---------- goal context and the one insight that matters ----------

function GoalTile({ goal, wide }: { goal: Goal; wide?: boolean }) {
  const data = useData();
  const saved = goalSaved(data.transactions, goal.id);
  const pct = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const finish = goal.status === 'active' ? projectedFinish(goal.plan, saved, goal.target) : null;
  const pace = goal.targetDate && goal.targetDate > todayKey() ? requiredPace(saved, goal.target, goal.targetDate) : null;
  const health = planHealth(goal, saved);

  // one sentence that says something you couldn't see from the numbers
  let insight = '';
  if (saved >= goal.target) insight = 'Done. Time to decide what’s next.';
  else if (goal.plan.frequency === 'flexible') insight = 'No fixed plan, so no finish date yet.';
  else if (finish && goal.targetDate) {
    const weeks = Math.round(Math.abs(daysBetween(goal.targetDate, finish)) / 7);
    insight =
      finish > goal.targetDate
        ? `${weeks} week${weeks === 1 ? '' : 's'} late at this pace.${pace ? ` ${formatLei(Math.ceil(pace.perWeek / 100) * 100)} a week gets you there on time.` : ''}`
        : weeks === 0
          ? 'Lands right on your date.'
          : `${weeks} week${weeks === 1 ? '' : 's'} early at this pace.`;
  } else if (finish) insight = `Around ${formatDate(finish)} at this pace.`;

  return (
    <Link to={`/goals/${goal.id}`} className={`tile ${wide ? 'tile--wide' : ''}`} data-feed-goal={goal.id} data-feed-name={goal.name} aria-label={`${goal.name}: ${formatLei(saved)} of ${formatLei(goal.target)}`}>
      <span className="tile__label">
        {goal.name}
        {wide && <ChevronRight size={16} aria-hidden />}
      </span>
      <span className="tile__amount money">{formatLei(saved)}</span>
      <span className="tile__sub">
        {Math.round(pct * 100)}% of {formatLei(goal.target)}
      </span>
      <span className="tile__bar" aria-hidden>
        <motion.i initial={{ width: 0 }} animate={{ width: `${Math.max(pct * 100, pct > 0 ? 2 : 0)}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
      </span>
      {wide && insight && <span className={`tile__note ${health === 'behind' ? 'is-late' : ''}`}>{insight}</span>}
    </Link>
  );
}

// ---------- consistency, kept apart from money ----------

function StreakTile() {
  const data = useData();
  const { account, checkIn } = useStore();
  const toast = useToast();
  const joined = account?.isDemo ? '2000-01-01' : account ? toKey(new Date(account.createdAt)) : todayKey();
  const days = weekStates(data, joined);
  const streak = currentStreak(data);
  const todayDone = days.some((d) => d.state === 'today-done');

  return (
    <button
      type="button"
      className={`tile tile--streak ${todayDone ? 'is-done' : ''}`}
      onClick={() => {
        if (todayDone) return;
        checkIn();
        toast('Checked in for today.');
      }}
      aria-label={`${streak} day streak. ${todayDone ? 'Today is counted.' : 'Tap to check in for today.'}`}
    >
      <span className="tile__label">
        <Flame size={16} aria-hidden /> Streak
      </span>
      <span className="tile__amount">
        {streak}
        <small> {streak === 1 ? 'day' : 'days'}</small>
      </span>
      <span className="tile__week" aria-hidden>
        {days.map((d, i) => (
          <i key={d.key} className={`wk wk--${d.state}`} title={WEEKDAY_SHORT[i]} />
        ))}
      </span>
      <span className="tile__sub">{todayDone ? 'Today counts' : 'Tap to check in'}</span>
    </button>
  );
}

// ---------- what happened ----------

function Recent({ onAdd }: { onAdd: () => void }) {
  const data = useData();
  const recent = sortTx(data.transactions).slice(0, 3);
  return (
    <section className="card card--flush" aria-labelledby="recent-title">
      <div className="card-head card-head--pad">
        <h2 id="recent-title" className="h3">
          Recent activity
        </h2>
        {recent.length > 0 && (
          <Link to="/activity" className="link-btn">
            See all <ArrowRight size={14} aria-hidden />
          </Link>
        )}
      </div>
      {recent.length ? (
        <ul className="list">
          {recent.map((t) => (
            <li key={t.id}>
              <TxRow tx={t} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty2">
          <p className="h3">No entries yet</p>
          <p className="muted small">When you set money aside, tap “Record savings” and enter the amount. Each entry shows here with its date, goal and status.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onAdd}>
            Record savings
          </button>
        </div>
      )}
    </section>
  );
}

// ---------- first use: one clear path instead of a dashboard of zeros ----------

function FirstUse({ goal, onAdd }: { goal: Goal | null; onAdd: (goalId?: string | null, amount?: number) => void }) {
  const data = useData();
  const nav = useNavigate();
  const finish = goal && goal.plan.frequency !== 'flexible' ? projectedFinish(goal.plan, 0, goal.target) : null;
  const steps = [
    { title: 'Set a goal', done: data.goals.length > 0 },
    { title: 'Record your first savings', done: data.transactions.length > 0 },
    { title: 'Pick a reminder day', done: data.reminder.enabled },
    { title: 'Check in on a second day', done: currentStreak(data) >= 2 },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="card first" aria-labelledby="first-title">
      <div className="first__kip">
        <img src="/mascot/wave-face.webp" alt="" />
      </div>
      <h2 id="first-title" className="h2">
        {goal ? `Let’s start ${goal.name}` : 'Let’s set your first goal'}
      </h2>
      {goal && (
        <p className="muted">
          You chose {planLabel(goal.plan).toLowerCase()} towards {formatLei(goal.target)}
          {finish ? `, which gets you there around ${formatDate(finish)}` : ''}. Here’s how Kept works:
        </p>
      )}
      <ol className="how">
        <li>
          <strong>Put money aside where you already keep it.</strong> A savings account, a vault in your banking app, even cash.
        </li>
        <li>
          <strong>Record the amount in Kept.</strong> It’s counted towards your goal straight away.
        </li>
        <li>
          <strong>Kept tells you if you’re on track,</strong> and you can lower or pause the plan any time.
        </li>
      </ol>
      <div className="setup" aria-label={`Setup: ${doneCount} of ${steps.length} done`}>
        <div className="setup__bar" aria-hidden>
          {steps.map((s) => (
            <span key={s.title} data-done={s.done || undefined} />
          ))}
        </div>
        <span className="small muted">
          Setup: {doneCount} of {steps.length} done
        </span>
      </div>
      {goal ? (
        <button type="button" className="btn btn--primary btn--lg" onClick={() => onAdd(goal.id, goal.plan.amount || undefined)}>
          Record my first savings
        </button>
      ) : (
        <button type="button" className="btn btn--primary btn--lg" onClick={() => nav('/goals/new')}>
          Create a goal
        </button>
      )}
    </section>
  );
}
