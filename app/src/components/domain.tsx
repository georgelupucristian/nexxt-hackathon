import { CalendarClock, ChevronRight, Eye, EyeOff, Flame, FlaskConical, Info, Pause, PenLine, RefreshCw, WifiOff } from '@/lib/icons';
import { Link } from 'react-router-dom';
import { breakdown, goalSaved, nextPlannedDate, planHealth, progress, weekStates, type DayState, type WeekSummary } from '../data/selectors';
import { useData, useStore } from '../data/store';
import type { Goal, Plan, Transaction } from '../data/types';
import { formatDay, formatDate, relativeTime, todayKey, WEEKDAY_NAME, WEEKDAY_SHORT, ordinal } from '../lib/dates';
import { formatLei } from '../lib/money';
import { plural } from '../lib/ro';
import { BigAmount, Button, GoalGlyph, ProgressBar, TxStatusPill } from './ui';

// ---------- Balance ----------

export function SourceLine({ onDark }: { onDark?: boolean }) {
  const data = useData();
  const { online } = useStore();
  const c = data.connection;
  if (data.tracking === 'manual') {
    return (
      <span className={`pill ${onDark ? 'pill--dark' : ''}`}>
        <PenLine aria-hidden /> Economii adăugate manual
      </span>
    );
  }
  const label =
    c.status === 'syncing'
      ? 'Se sincronizează…'
      : c.status === 'error' || !online
        ? 'Conexiunea are nevoie de atenție'
        : c.lastSyncAt
          ? `Actualizat ${relativeTime(c.lastSyncAt)}`
          : 'Nesincronizat încă';
  return (
    <>
      <span className={`pill ${onDark ? 'pill--dark' : 'pill--demo'}`}>
        <FlaskConical aria-hidden /> Conexiune demo
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
            Economii totale
          </span>
          <button
            type="button"
            className="icon-btn"
            style={{ color: 'inherit', width: 36, height: 36 }}
            aria-label={hidden ? 'Arată soldul' : 'Ascunde soldul'}
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
          {b.pendingIn > 0 && <>{formatLei(b.pendingIn, { sign: true })} în așteptare, încă nu se adună. </>}
          {b.pendingOut > 0 && <>{formatLei(-b.pendingOut)}, retragere în așteptare.</>}
        </p>
      )}
      <div className="balance__split">
        <div>
          <span>În obiective</span>
          <strong>{hidden ? '••••' : formatLei(b.allocated)}</strong>
        </div>
        <div>
          <span>Nealocat</span>
          <strong>{hidden ? '••••' : formatLei(b.unallocated)}</strong>
        </div>
      </div>
      <div className="btn-row">
        <Button variant="primary" onClick={onAdd}>
          {data.tracking === 'demo' ? 'Adaugă bani' : 'Adaugă economii'}
        </Button>
        <Button variant="secondary" onClick={onDetails}>
          Detalii
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
          <strong>Ești offline.</strong> Îți arătăm ultimele cifre sincronizate{c.lastSyncAt ? ` (${relativeTime(c.lastSyncAt)})` : ''}.
        </div>
      </div>
    );
  if (c.status !== 'error') return null;
  return (
    <div className="banner banner--danger" role="alert">
      <RefreshCw size={18} aria-hidden />
      <div className="grow">
        <strong>Conexiunea are nevoie de atenție.</strong> {c.lastError} Îți arătăm în continuare ultimele cifre cunoscute{c.lastSyncAt ? ` (${relativeTime(c.lastSyncAt)})` : ''}.
      </div>
      <button type="button" className="banner__action" onClick={() => void sync().catch(() => undefined)}>
        Reîncearcă
      </button>
    </div>
  );
}

// ---------- Week streak ----------

const DAY_LABEL: Record<DayState, string> = {
  done: 'zi bifată',
  'today-done': 'azi, zi bifată',
  today: 'azi, încă nimic',
  missed: 'zi ratată',
  paused: 'pe sloi de gheață',
  future: 'urmează',
  before: 'înainte să începi cu Kept',
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
            {streak === 0 ? 'Începe o serie' : `${plural(streak, 'zi', 'zile')} la rând`}
          </h2>
          <p className="small subtle">Constanță, nu bani. Numără zilele în care ai pus bani deoparte sau ți-ai verificat planul.</p>
        </div>
        <button type="button" className="link-btn" onClick={onOpen} aria-label="Cum funcționează seria">
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
  if (plan.frequency === 'flexible') return plan.amount > 0 ? `Cam ${formatLei(plan.amount)} când poți` : 'Flexibil, când poți';
  if (plan.frequency === 'weekly') return `${formatLei(plan.amount)} în fiecare ${WEEKDAY_NAME[plan.day ?? 0].toLowerCase()}`;
  return `${formatLei(plan.amount)} pe ${ordinal(plan.day ?? 1)} ale fiecărei luni`;
}

const HEALTH: Record<ReturnType<typeof planHealth>, { text: string; cls: string } | null> = {
  done: { text: 'Țintă atinsă', cls: 'pill--success' },
  'on-track': { text: 'Pe drumul cel bun', cls: 'pill--success' },
  behind: { text: 'Planul trece de data țintă', cls: 'pill--warn' },
  'past-date': { text: 'Data țintă a trecut', cls: 'pill--warn' },
  'no-date': null,
  flexible: null,
};

export function HealthPill({ goal, saved }: { goal: Goal; saved: number }) {
  if (goal.status === 'paused') return <span className="pill">În pauză</span>;
  if (goal.status === 'archived') return <span className="pill">Arhivat</span>;
  const h = HEALTH[planHealth(goal, saved)];
  return h ? <span className={`pill ${h.cls}`}>{h.text}</span> : null;
}

export function GoalCard({ goal, compact }: { goal: Goal; compact?: boolean }) {
  const data = useData();
  const saved = goalSaved(data.transactions, goal.id);
  const p = progress(saved, goal.target);
  const next = goal.status === 'active' ? nextPlannedDate(goal.plan) : null;
  const remaining = Math.max(0, goal.target - saved);
  return (
    <Link to={`/goals/${goal.id}`} className="card card--interactive goal-card" data-feed-goal={goal.id} data-feed-name={goal.name} aria-label={`${goal.name}: ${formatLei(saved)} din ${formatLei(goal.target)}`}>
      <div className="row row--top">
        <GoalGlyph kind={goal.kind} status={goal.status} />
        <div className="grow">
          <div className="row row--between row--top">
            <h3 className="clamp-2" style={{ fontSize: 'var(--fs-lg)' }}>
              {goal.name}
            </h3>
            <ChevronRight size={18} className="subtle" aria-hidden style={{ flex: 'none', marginTop: 2 }} />
          </div>
          <div className="row" style={{ marginTop: 4, flexWrap: 'wrap', gap: 6 }}>
            {goal.isPrimary && goal.status === 'active' && <span className="pill pill--info">Principal</span>}
            <HealthPill goal={goal} saved={saved} />
          </div>
        </div>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <div className="row row--between" style={{ alignItems: 'baseline' }}>
          <span className="money" style={{ fontSize: 'var(--fs-xl)', fontWeight: 750, letterSpacing: '-0.02em' }}>
            {formatLei(saved)}
          </span>
          <span className="small subtle money">din {formatLei(goal.target)}</span>
        </div>
        <ProgressBar value={p} label={`Progres: ${goal.name}`} paused={goal.status !== 'active'} />
        <div className="row row--between small">
          <span className="muted">{remaining > 0 ? `Mai ai ${formatLei(remaining)}` : 'Ai strâns tot'}</span>
          <span className="muted">{Math.round(p * 100)}%</span>
        </div>
      </div>
      {!compact && next && remaining > 0 && (
        <div className="row small muted" style={{ paddingTop: 'var(--s-3)', borderTop: 'var(--border)' }}>
          <CalendarClock size={16} aria-hidden />
          <span>
            Următoarea depunere: <strong className="money">{formatLei(goal.plan.amount)}</strong> · {formatDay(next)}
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
  const muted = tx.status !== 'confirmed';
  const title = tx.note || (isIn ? 'Depunere' : 'Retragere');
  return (
    <Link to={`/activity/${tx.id}`} className="list-row">
      {/* a ledger date instead of an arrow-in-a-circle: it says something */}
      <span className="list-row__date" aria-hidden>
        <b>{Number(tx.date.slice(8, 10))}</b>
        <small>{new Date(`${tx.date}T12:00:00`).toLocaleDateString('ro-RO', { month: 'short' }).replace('.', '')}</small>
      </span>
      <span className="list-row__body">
        <span className="strong truncate">{title}</span>
        <span className="small subtle truncate">
          {goal ? goal.name : 'Nealocat'}
          <span className="sr-only"> · {formatDay(tx.date)}</span>
        </span>
      </span>
      <span className="list-row__end">
        <span
          className={`money strong ${isIn && !muted ? 'positive' : ''}`}
          style={muted ? { color: 'var(--ink-3)', textDecoration: tx.status === 'failed' ? 'line-through' : undefined } : undefined}
        >
          {formatLei(isIn ? tx.amount : -tx.amount, { sign: true })}
        </span>
        <TxStatusPill tx={tx} />
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
        <h2 id="sum-h">Săptămâna asta</h2>
        <span className="small subtle">
          {formatDate(s.start).replace(/ \d{4}$/, '')} până {formatDay(today).toLowerCase()}
        </span>
      </div>
      <div className="stat-grid">
        <div className="stat">
          <span>Ai pornit de la</span>
          <strong>{formatLei(s.starting)}</strong>
        </div>
        <div className="stat">
          <span>Schimbare netă</span>
          <strong className={s.net > 0 ? 'positive' : undefined}>{formatLei(s.net, { sign: true })}</strong>
        </div>
        <div className="stat">
          <span>Depuneri</span>
          <strong>{formatLei(s.contributions)}</strong>
        </div>
        <div className="stat">
          <span>Retrageri</span>
          <strong>{formatLei(s.withdrawals)}</strong>
        </div>
      </div>
      {goal && (
        <p className="small muted" style={{ paddingTop: 'var(--s-3)', borderTop: 'var(--border)' }}>
          {goal.name}: {Math.round(progress(goalBefore, goal.target) * 100)}% → <strong>{Math.round(progress(goalNow, goal.target) * 100)}%</strong>
          {goalNow === goalBefore ? ' (nicio schimbare încă)' : ''}
        </p>
      )}
      {s.count === 0 && <p className="small subtle">Nimic adăugat săptămâna asta. Contează doar intrările confirmate. Cele în așteptare și cele eșuate rămân pe dinafară.</p>}
    </section>
  );
}
