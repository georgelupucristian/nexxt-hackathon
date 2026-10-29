import { CalendarClock, ChevronRight, Deposit, Eye, EyeOff, Flame, FlaskConical, Info, Pause, PenLine, RefreshCw, WifiOff, Withdraw } from '@/lib/icons';
import { Link } from 'react-router-dom';
import { GoalIcon } from '../lib/goalIcons';
import { breakdown, goalSaved, nextDueDate, planHealth, progress, weekStates, type DayState, type WeekSummary } from '../data/selectors';
import { useData, useStore } from '../data/store';
import type { Goal, Plan, Transaction } from '../data/types';
import { formatDay, formatDate, relativeTime, todayKey, WEEKDAY_NAME, WEEKDAY_SHORT, ordinal } from '../lib/dates';
import { goalLook, goalVars, useGoalPicture } from '../lib/goalLook';
import { formatLei } from '../lib/money';
import { plural } from '../lib/plural';
import { BigAmount, Button } from './ui';

// ---------- Balance ----------

export function SourceLine({ onDark }: { onDark?: boolean }) {
  const data = useData();
  const { online } = useStore();
  const c = data.connection;
  if (data.tracking === 'stripe') {
    return (
      <span className={`pill ${onDark ? 'pill--dark' : 'pill--demo'}`}>
        <FlaskConical aria-hidden /> Payments via Stripe
      </span>
    );
  }
  if (data.tracking === 'manual') {
    return (
      <span className={`pill ${onDark ? 'pill--dark' : ''}`}>
        <PenLine aria-hidden /> Savings added by hand
      </span>
    );
  }
  const label =
    c.status === 'syncing'
      ? 'Syncing…'
      : c.status === 'error' || !online
        ? 'Connection needs attention'
        : c.lastSyncAt
          ? `Updated ${relativeTime(c.lastSyncAt)}`
          : 'Not synced yet';
  return (
    <>
      <span className={`pill ${onDark ? 'pill--dark' : 'pill--demo'}`}>
        <FlaskConical aria-hidden /> Demo connection
      </span>
      <span>{label}</span>
    </>
  );
}

export function BalanceCard({ onAdd, onDetails }: { onAdd: () => void; onDetails: () => void }) {
  const data = useData();
  const { setPrefs } = useStore();
  const b = breakdown(data.transactions);
  const hidden = data.prefs.hideBalance;
  return (
    <section className="balance" aria-labelledby="bal-label">
      <div className="stack" style={{ gap: 10 }}>
        <div className="row row--between">
          <span className="balance__label" id="bal-label">
            Total savings
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ color: 'inherit', width: 36, height: 36 }}
            aria-label={hidden ? 'Show balance' : 'Hide balance'}
            onClick={() => setPrefs({ hideBalance: !hidden })}
          >
            {hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
          </button>
        </div>
        <BigAmount value={b.total} hidden={hidden} />
        <div className="balance__meta">
          <SourceLine onDark />
        </div>
      </div>
      {(b.pendingIn > 0 || b.pendingOut > 0) && !hidden && (
        <p className="small" style={{ color: 'color-mix(in srgb, var(--on-ink) 72%, transparent)' }}>
          {b.pendingIn > 0 && <>{formatLei(b.pendingIn, { sign: true })} pending, not counted yet. </>}
          {b.pendingOut > 0 && <>{formatLei(-b.pendingOut)}, withdrawal pending.</>}
        </p>
      )}
      <div className="balance__split">
        <div>
          <span>In goals</span>
          <strong>{hidden ? '••••' : formatLei(b.allocated)}</strong>
        </div>
        <div>
          <span>No goal</span>
          <strong>{hidden ? '••••' : formatLei(b.unallocated)}</strong>
        </div>
      </div>
      <div className="btn-row">
        <Button variant="primary" onClick={onAdd}>
          {data.tracking === 'demo' ? 'Add money' : 'Add savings'}
        </Button>
        <Button variant="secondary" onClick={onDetails}>
          Details
        </Button>
      </div>
    </section>
  );
}

export function ConnectionBanner() {
  const data = useData();
  const { sync, online } = useStore();
  if (data.tracking !== 'demo') return null;
  const c = data.connection;
  if (!online)
    return (
      <div className="banner banner--warn" role="status">
        <WifiOff size={18} aria-hidden />
        <div className="grow">
          <strong>You're offline.</strong> Showing your last synced numbers{c.lastSyncAt ? ` (${relativeTime(c.lastSyncAt)})` : ''}.
        </div>
      </div>
    );
  if (c.status !== 'error') return null;
  return (
    <div className="banner banner--danger" role="alert">
      <RefreshCw size={18} aria-hidden />
      <div className="grow">
        <strong>Connection needs attention.</strong> {c.lastError} Still showing your last known numbers{c.lastSyncAt ? ` (${relativeTime(c.lastSyncAt)})` : ''}.
      </div>
      <button type="button" className="banner__action" onClick={() => void sync().catch(() => undefined)}>
        Retry
      </button>
    </div>
  );
}

// ---------- Week streak ----------

const DAY_LABEL: Record<DayState, string> = {
  done: 'money saved',
  'today-done': 'today, money saved',
  today: 'today, nothing yet',
  missed: 'missed day',
  paused: 'covered by a Freeze',
  future: 'coming up',
  before: 'before you started with Kip',
};

export function WeekStrip({ joined, streak, onOpen }: { joined: string; streak: number; onOpen: () => void }) {
  const data = useData();
  const days = weekStates(data, joined);
  return (
    <section className="card" aria-labelledby="week-h" style={{ paddingBottom: 'var(--s-4)' }}>
      <div className="streak-head" style={{ marginBottom: 'var(--s-4)' }}>
        <div>
          <h2 id="week-h" className="streak-count">
            <Flame size={18} aria-hidden />
            {streak === 0 ? 'Start a streak' : `${plural(streak, 'day', 'days')} in a row`}
          </h2>
          <p className="small subtle">Counts the days you saved something, however small.</p>
        </div>
        <button type="button" className="link-btn" onClick={onOpen} aria-label="How the streak works">
          <Info size={18} aria-hidden />
        </button>
      </div>
      <ol className="week" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {days.map(({ key, state }, i) => (
          <li key={key} className={`day day--${state}`} aria-label={`${WEEKDAY_NAME[i]}: ${DAY_LABEL[state]}`}>
            <span aria-hidden>{WEEKDAY_SHORT[i]}</span>
            <span className="day__dot" aria-hidden>
              {state === 'done' || state === 'today-done' ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
              ) : state === 'paused' ? (
                <Pause size={14} />
              ) : (
                <span className="xs">{Number(key.slice(8))}</span>
              )}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ---------- Goals ----------

export function planLabel(plan: Plan): string {
  if (plan.frequency === 'flexible') return plan.amount > 0 ? `About ${formatLei(plan.amount)} when you can` : 'Flexible, when you can';
  if (plan.frequency === 'weekly') return `${formatLei(plan.amount)} every ${WEEKDAY_NAME[plan.day ?? 0]}`;
  return `${formatLei(plan.amount)} on the ${ordinal(plan.day ?? 1)} of every month`;
}

const HEALTH: Record<ReturnType<typeof planHealth>, { text: string; cls: string } | null> = {
  done: { text: 'Target reached', cls: 'pill--success' },
  'on-track': { text: 'On track', cls: 'pill--success' },
  behind: { text: 'Plan runs past the target date', cls: 'pill--warn' },
  'past-date': { text: 'Target date has passed', cls: 'pill--warn' },
  'no-date': null,
  flexible: null,
};

export function HealthPill({ goal, saved }: { goal: Goal; saved: number }) {
  if (goal.status === 'paused') return <span className="pill">Paused</span>;
  if (goal.status === 'archived') return <span className="pill">Archived</span>;
  const h = HEALTH[planHealth(goal, saved)];
  return h ? <span className={`pill ${h.cls}`}>{h.text}</span> : null;
}

/**
 * The goal's picture, or until there is one, its initial on the goal's colour. Paused and archived
 * goals go grey so their state reads before their name.
 */
export function GoalTile({ goal, size = 40, muted }: { goal: Goal; size?: number; muted?: boolean }) {
  const look = goalLook(goal);
  const picture = useGoalPicture(look.picture);
  return (
    <span
      className={`goal-tile ${muted ? 'goal-tile--muted' : ''} ${picture ? 'goal-tile--pic' : ''}`}
      style={{ ...goalVars(look), width: size, height: size, fontSize: Math.round(size * 0.46) }}
      aria-hidden
    >
      {picture ? <img src={picture} alt="" /> : <GoalIcon goal={goal} size={Math.round(size * 0.56)} />}
    </span>
  );
}

/** A slim bar in the goal's deep shade. The colour comes from --goal-deep on an ancestor. */
export function GoalBar({ value, label, className = '' }: { value: number; label: string; className?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className={`goal-bar ${className}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
      <span style={{ width: `${Math.max(pct, value > 0 ? 2 : 0)}%` }} />
    </span>
  );
}

export function GoalCard({ goal, compact }: { goal: Goal; compact?: boolean }) {
  const data = useData();
  const saved = goalSaved(data.transactions, goal.id);
  const p = progress(saved, goal.target);
  const next = goal.status === 'active' ? nextDueDate(goal, data.transactions) : null;
  const remaining = Math.max(0, goal.target - saved);
  const live = goal.status === 'active';
  return (
    <Link
      to={`/goals/${goal.id}`}
      className={`card card--interactive goal-card ${live ? '' : 'goal-card--quiet'}`}
      style={goalVars(goalLook(goal))}
      data-feed-goal={goal.id}
      data-feed-name={goal.name}
    >
      <div className="row row--top">
        <GoalTile goal={goal} size={44} muted={!live} />
        <div className="grow">
          <div className="row row--between row--top">
            <h3 className="clamp-2" style={{ fontSize: 'var(--fs-lg)' }}>
              {goal.name}
            </h3>
            <ChevronRight size={18} className="subtle" aria-hidden style={{ flex: 'none', marginTop: 2 }} />
          </div>
          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
            {goal.isPrimary && live && <span className="pill pill--info">Main</span>}
            <HealthPill goal={goal} saved={saved} />
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 10 }}>
        {/* the amount and its target on one baseline; the bar says how far, so no percentage */}
        <p className="goal-card__money">
          <span className="money">{formatLei(saved)}</span>
          <span className="small subtle money">of {formatLei(goal.target)}</span>
        </p>
        <GoalBar value={p} label={`Progress: ${goal.name}`} />
      </div>
      {!compact && next && remaining > 0 && (
        <div className="row small muted" style={{ paddingTop: 'var(--s-3)', borderTop: 'var(--border)' }}>
          <CalendarClock size={16} aria-hidden />
          <span>
            Next deposit: <strong className="money">{formatLei(goal.plan.amount)}</strong> · {formatDay(next)}
          </span>
        </div>
      )}
    </Link>
  );
}

// ---------- Transactions ----------

export function TxRow({ tx }: { tx: Transaction }) {
  const data = useData();
  const goal = tx.goalId ? data.goals.find((g) => g.id === tx.goalId) : null;
  const isIn = tx.type === 'contribution';
  const title = tx.note || (isIn ? 'Deposit' : 'Withdrawal');
  // English dates keep their capitals ("Today", "28 Nov"), so no lower-casing after the goal name
  const when = formatDay(tx.date);
  return (
    <Link to={`/activity/${tx.id}`} className={`list-row tx-row tx-row--${tx.status}`}>
      {/* a hand putting money in or taking it out, on the goal's colour (grey: no goal) */}
      <span className="tx-row__tile" style={goal ? { background: goalLook(goal).fill } : undefined} aria-hidden>
        {isIn ? <Deposit size={20} /> : <Withdraw size={20} />}
      </span>
      <span className="list-row__body">
        <span className="strong truncate">{title}</span>
        <span className="small subtle truncate">
          {goal ? goal.name : 'No goal'} · {when}
        </span>
      </span>
      <span className="list-row__end">
        <span className="money strong tx-row__amount">{formatLei(isIn ? tx.amount : -tx.amount, { sign: true })}</span>
        {/* a word only when it changes what the amount means */}
        {tx.status === 'pending' && <span className="status status--warn">Pending</span>}
        {tx.status === 'failed' && <span className="status status--danger">Failed</span>}
      </span>
    </Link>
  );
}

// ---------- Weekly summary ----------

export function WeeklySummaryCard({ s, goal }: { s: WeekSummary; goal: Goal | null }) {
  const data = useData();
  const today = todayKey();
  const goalNow = goal ? goalSaved(data.transactions, goal.id) : 0;
  const goalBefore = goal
    ? goalSaved(
        data.transactions.filter((t) => t.date < s.start),
        goal.id,
      )
    : 0;
  return (
    <section className="card stack-lg" aria-labelledby="sum-h">
      <div className="section-head">
        <h2 id="sum-h">This week</h2>
        <span className="small subtle">
          {formatDate(s.start).replace(/ \d{4}$/, '')} to {formatDay(today).toLowerCase()}
        </span>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <span>You started at</span>
          <strong>{formatLei(s.starting)}</strong>
        </div>
        <div className="stat">
          <span>Net change</span>
          <strong className={s.net > 0 ? 'positive' : undefined}>{formatLei(s.net, { sign: true })}</strong>
        </div>
        <div className="stat">
          <span>Deposits</span>
          <strong>{formatLei(s.contributions)}</strong>
        </div>
        <div className="stat">
          <span>Withdrawals</span>
          <strong>{formatLei(s.withdrawals)}</strong>
        </div>
      </div>
      {goal && (
        <p className="small muted" style={{ paddingTop: 'var(--s-3)', borderTop: 'var(--border)' }}>
          {goal.name}: {Math.round(progress(goalBefore, goal.target) * 100)}% → <strong>{Math.round(progress(goalNow, goal.target) * 100)}%</strong>
          {goalNow === goalBefore ? ' (no change yet)' : ''}
        </p>
      )}
      {s.count === 0 && <p className="small subtle">Nothing added this week. Only confirmed entries count. Pending and failed ones are left out.</p>}
    </section>
  );
}
