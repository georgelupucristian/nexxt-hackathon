import NumberFlow from '@number-flow/react';
import { ArrowRight, ChevronRight, Eye, EyeOff, FlaskConical, Info } from 'lucide-react';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HealthPill, planLabel, TxRow } from '../domain';
import { hubLine } from '../mascot/lines';
import { GoalGlyph, useToast } from '../ui';
import {
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

  return (
    <div className="home2">
      <motion.header className="home2__head" {...enter(0)}>
        <p className="home2__hello">{greeting()},</p>
        <h1 className="home2__name">{name || 'welcome'}</h1>
        {account?.isDemo && (
          <span className="tag tag--info">
            <FlaskConical size={14} aria-hidden /> Sample data, not real money
          </span>
        )}
      </motion.header>

      {firstUse ? (
        <motion.div {...enter(1)} className="home2__first">
          <FirstUse goal={goal} onAdd={onAdd} />
        </motion.div>
      ) : (
        <div className="home2__grid">
          <div className="home2__col">
            <motion.div {...enter(1)}>
              <Overview goal={goal} onDetails={onDetails} onAdd={onAdd} primaryElsewhere={hasPrimary(action)} />
            </motion.div>
            <motion.div {...enter(2)}>
              <NextStep action={action} onAdd={onAdd} />
            </motion.div>
          </div>
          <div className="home2__col">
            {goal && (
              <motion.div {...enter(3)}>
                <GoalSummary goal={goal} />
              </motion.div>
            )}
            <motion.div {...enter(4)}>
              <CheckIns />
            </motion.div>
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

function Overview({ goal, onDetails, onAdd, primaryElsewhere }: { goal: Goal | null; onDetails: () => void; onAdd: () => void; primaryElsewhere: boolean }) {
  const data = useData();
  const { setPrefs } = useStore();
  const b = breakdown(data.transactions);
  const hidden = data.prefs.hideBalance;
  const saved = goal ? goalSaved(data.transactions, goal.id) : 0;
  const pct = goal && goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const r = 64;
  const circ = 2 * Math.PI * r;
  const money = (v: number) => (hidden ? '••••' : formatLei(v));

  return (
    <section className="card overview" aria-labelledby="ov-title">
      <div className="card-head">
        <h2 id="ov-title" className="h3">
          Your savings
        </h2>
        <button type="button" className="icon-btn icon-btn--sm" onClick={() => setPrefs({ hideBalance: !hidden })} aria-label={hidden ? 'Show amounts' : 'Hide amounts'}>
          {hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>

      <div className="overview__body">
        {goal && (
          <div className="goalring" role="img" aria-label={`${Math.round(pct * 100)}% of ${goal.name}`}>
            <svg viewBox="0 0 160 160" aria-hidden>
              <circle cx="80" cy="80" r={r} className="goalring__track" />
              <motion.circle
                cx="80"
                cy="80"
                r={r}
                className="goalring__fill"
                strokeDasharray={circ}
                transform="rotate(-90 80 80)"
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: circ * (1 - pct) }}
                transition={{ type: 'spring', stiffness: 40, damping: 16, delay: 0.2 }}
              />
            </svg>
            <div className="goalring__center">
              <span className="goalring__pct">
                <NumberFlow value={Math.round(pct * 100)} />%
              </span>
              <span className="goalring__label truncate">of {goal.name}</span>
            </div>
          </div>
        )}

        <dl className="overview__figures">
          <div className="fig fig--main">
            <dt>Saved, confirmed</dt>
            <dd className="money">{hidden ? '••••' : <NumberFlow value={b.total / 100} locales="ro-RO" format={{ maximumFractionDigits: 2 }} suffix=" lei" />}</dd>
          </div>
          <div className="fig">
            <dt>In goals</dt>
            <dd className="money">{money(b.allocated)}</dd>
          </div>
          <div className="fig">
            <dt>Not assigned to a goal</dt>
            <dd className="money">{money(b.unallocated)}</dd>
          </div>
          {b.pendingIn > 0 && (
            <div className="fig fig--pending">
              <dt>Pending, not counted yet</dt>
              <dd className="money">{money(b.pendingIn)}</dd>
            </div>
          )}
        </dl>
      </div>

      <p className="overview__note">
        <Info size={14} aria-hidden />
        {data.tracking === 'demo'
          ? 'Demo connection: amounts are simulated, never real money.'
          : 'You record money you set aside yourself. Kept keeps count; it doesn’t hold or move money.'}
      </p>
      <div className="overview__actions">
        <button type="button" className={`btn ${primaryElsewhere ? 'btn--secondary' : 'btn--primary'}`} onClick={() => onAdd()}>
          Record savings
        </button>
        <button type="button" className="btn btn--ghost" onClick={onDetails}>
          Details
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

function GoalSummary({ goal }: { goal: Goal }) {
  const data = useData();
  const saved = goalSaved(data.transactions, goal.id);
  const pct = goal.target > 0 ? Math.min(1, saved / goal.target) : 0;
  const finish = goal.status === 'active' ? projectedFinish(goal.plan, saved, goal.target) : null;
  const pace = goal.targetDate && goal.targetDate > todayKey() ? requiredPace(saved, goal.target, goal.targetDate) : null;
  const health = planHealth(goal, saved);

  let insight = '';
  if (saved >= goal.target) insight = 'Target reached.';
  else if (goal.plan.frequency === 'flexible') insight = 'Flexible plan, so there’s no finish date. Set a regular amount to see one.';
  else if (finish && goal.targetDate) {
    const weeks = Math.round(Math.abs(daysBetween(goal.targetDate, finish)) / 7);
    insight =
      finish > goal.targetDate
        ? `At this pace you finish about ${weeks} week${weeks === 1 ? '' : 's'} after your date. ${pace ? `Saving ${formatLei(pace.perWeek)} a week would get you there on time.` : ''}`
        : weeks === 0
          ? 'At this pace you finish right on your date.'
          : `At this pace you finish about ${weeks} week${weeks === 1 ? '' : 's'} before your date.`;
  } else if (finish) insight = `At this pace you reach it around ${formatDate(finish)}.`;

  return (
    <section className="card goal2" aria-labelledby="goal2-title">
      <Link to={`/goals/${goal.id}`} className="goal2__head">
        <GoalGlyph kind={goal.kind} status={goal.status} />
        <span className="grow">
          <span id="goal2-title" className="h3 block">
            {goal.name}
          </span>
          <span className="small muted">Primary goal</span>
        </span>
        <HealthPill goal={goal} saved={saved} />
        <ChevronRight size={18} aria-hidden className="muted" />
      </Link>
      <p className="goal2__amount">
        <span className="money">{formatLei(saved)}</span> <span className="muted">of {formatLei(goal.target)}</span>
      </p>
      <div className="bar" aria-hidden>
        <motion.span initial={{ width: 0 }} animate={{ width: `${Math.max(pct * 100, pct > 0 ? 1.5 : 0)}%` }} transition={{ type: 'spring', stiffness: 60, damping: 18 }} />
      </div>
      <dl className="kv2">
        <div>
          <dt>Plan</dt>
          <dd>{planLabel(goal.plan)}</dd>
        </div>
        <div>
          <dt>Target date</dt>
          <dd>{goal.targetDate ? formatDate(goal.targetDate) : 'No deadline'}</dd>
        </div>
        <div>
          <dt>Estimated finish</dt>
          <dd>{finish ? formatDate(finish) : '—'}</dd>
        </div>
        <div>
          <dt>Left to save</dt>
          <dd className="money">{formatLei(Math.max(0, goal.target - saved))}</dd>
        </div>
      </dl>
      {insight && <p className={`insight ${health === 'behind' ? 'insight--warn' : ''}`}>{insight}</p>}
    </section>
  );
}

// ---------- consistency, kept apart from money ----------

const DAY_LABEL: Record<string, string> = {
  done: 'Saved or checked in',
  'today-done': 'Today, done',
  today: 'Today',
  missed: 'No action',
  paused: 'Break day',
  future: 'Upcoming',
  before: 'Before you joined',
};

function CheckIns() {
  const data = useData();
  const { account, checkIn } = useStore();
  const toast = useToast();
  const joined = account?.isDemo ? '2000-01-01' : account ? toKey(new Date(account.createdAt)) : todayKey();
  const days = weekStates(data, joined);
  const streak = currentStreak(data);
  const todayDone = days.some((d) => d.state === 'today-done');

  return (
    <section className="card" aria-labelledby="ci-title">
      <div className="card-head">
        <h2 id="ci-title" className="h3">
          Check-ins
        </h2>
        <span className="small muted">{streak > 0 ? `${streak} day${streak === 1 ? '' : 's'} in a row` : 'No run yet'}</span>
      </div>
      <ol className="days" aria-label="This week">
        {days.map((d, i) => (
          <li key={d.key} className={`day2 day2--${d.state}`} title={DAY_LABEL[d.state]} aria-label={`${d.key}: ${DAY_LABEL[d.state]}`}>
            <span className="day2__w">{WEEKDAY_SHORT[i]}</span>
            <span className="day2__dot" aria-hidden />
          </li>
        ))}
      </ol>
      <ul className="legend" aria-hidden>
        <li>
          <i className="day2__dot day2--done" /> Saved or checked in
        </li>
        <li>
          <i className="day2__dot day2--today" /> Today
        </li>
        <li>
          <i className="day2__dot day2--paused" /> Break
        </li>
        <li>
          <i className="day2__dot day2--missed" /> No action
        </li>
      </ul>
      <p className="small muted">A day counts when you record savings or check in. Missing one never touches your money, and you can mark a break any time.</p>
      {!todayDone && (
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={() => {
            checkIn();
            toast('Checked in for today.');
          }}
        >
          Check in for today
        </button>
      )}
    </section>
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
