import { ArrowRight, Bell, CalendarCheck, CircleCheck, FlaskConical, HardDrive, PartyPopper, Plus, RefreshCw, Target, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BalanceCard, ConnectionBanner, GoalCard, SourceLine, TxRow, WeekStrip, WeeklySummaryCard } from '../components/domain';
import { CheckInSheet, MoneySheet, StreakSheet, type MoneySheetProps } from '../components/sheets';
import { Banner, Button, EmptyState, Sheet, useToast } from '../components/ui';
import { activeGoals, breakdown, currentStreak, goalSaved, primaryGoal, sortTx, todayAction, weekSummary, type TodayAction } from '../data/selectors';
import { useData, useStore } from '../data/store';
import { todayKey, toKey, weekday, relativeTime } from '../lib/dates';
import { formatLei } from '../lib/money';

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Good evening' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Home() {
  const data = useData();
  const { account } = useStore();
  const nav = useNavigate();
  const [money, setMoney] = useState<Omit<MoneySheetProps, 'onClose'>>({ open: false });
  const [details, setDetails] = useState(false);
  const [checkIn, setCheckIn] = useState(false);
  const [streakInfo, setStreakInfo] = useState(false);

  const goal = primaryGoal(data.goals);
  const streak = currentStreak(data);
  const action = todayAction(data);
  const joined = account ? toKey(new Date(account.createdAt)) : todayKey();
  // Sample data predates the demo account, so let its history show.
  const joinedKey = account?.isDemo ? '2000-01-01' : joined;
  const recent = sortTx(data.transactions).slice(0, 4);
  const r = data.reminder;
  const now = new Date();
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const reminderDue = r.enabled && weekday(todayKey()) === r.day && hhmm >= r.time && !data.actions.some((a) => a.date === todayKey());

  const openAdd = (goalId: string | null = goal?.id ?? null, presetAmount?: number) => setMoney({ open: true, mode: 'contribution', goalId, presetAmount });

  return (
    <div className="screen screen--wide">
      <header className="page-head">
        <div>
          <p className="small muted">{greeting()},</p>
          <h1 className="truncate">{account?.name}</h1>
        </div>
        <Link to="/profile" className="icon-btn icon-btn--filled" aria-label="Profile" style={{ textDecoration: 'none', fontWeight: 700 }}>
          {account?.name.charAt(0).toUpperCase()}
        </Link>
      </header>

      {account?.isDemo && (
        <Banner tone="demo" icon={FlaskConical}>
          <strong>Sample data.</strong> You’re exploring with a demo account. Nothing here is real money.
        </Banner>
      )}
      <ConnectionBanner />
      {reminderDue && (
        <Banner
          tone="info"
          icon={Bell}
          action={
            <button type="button" className="banner__action" onClick={() => setCheckIn(true)}>
              Review
            </button>
          }
        >
          Your weekly reminder: take a minute to check your plan.
        </Banner>
      )}

      <div className="home-grid">
        <div className="stack-lg">
          <WeekStrip joined={joinedKey} streak={streak} onOpen={() => setStreakInfo(true)} />
          <BalanceCard onAdd={() => openAdd()} onDetails={() => setDetails(true)} />
          <TodayCard action={action} onAdd={openAdd} onCheckIn={() => setCheckIn(true)} />
        </div>
        <div className="stack-lg">
          <section className="section" aria-labelledby="goal-h">
            <div className="section-head">
              <h2 id="goal-h">{goal ? 'Primary goal' : 'Goals'}</h2>
              {goal && (
                <Link to="/goals" className="link-btn">
                  All goals
                </Link>
              )}
            </div>
            {goal ? (
              <GoalCard goal={goal} />
            ) : (
              <div className="card">
                <EmptyState icon={Target} title="No active goal" body="Create a goal to get a plan and see your progress here." action={<Button variant="primary" onClick={() => nav('/goals/new')}>Create a goal</Button>} />
              </div>
            )}
          </section>

          <WeeklySummaryCard s={weekSummary(data.transactions)} goal={goal} />

          <section className="section" aria-labelledby="recent-h">
            <div className="section-head">
              <h2 id="recent-h">Recent activity</h2>
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
                <EmptyState icon={TrendingUp} title="No activity yet" body="When you record savings, they’ll show up here." />
              )}
            </div>
          </section>
        </div>
      </div>

      <MoneySheet {...money} onClose={() => setMoney({ open: false })} />
      <BalanceDetails open={details} onClose={() => setDetails(false)} />
      <CheckInSheet open={checkIn} onClose={() => setCheckIn(false)} />
      <StreakSheet open={streakInfo} onClose={() => setStreakInfo(false)} />
    </div>
  );
}

function TodayCard({ action, onAdd, onCheckIn }: { action: TodayAction; onAdd: (goalId?: string | null, amount?: number) => void; onCheckIn: () => void }) {
  const nav = useNavigate();
  const { sync } = useStore();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  let icon = CalendarCheck;
  let title = '';
  let body = '';
  let cta: { label: string; run: () => void } | null = null;

  switch (action.kind) {
    case 'create-goal':
      icon = Target;
      title = 'Create your first goal';
      body = 'Pick something to save for and Kept will help you plan it.';
      cta = { label: 'Create a goal', run: () => nav('/goals/new') };
      break;
    case 'set-plan':
      title = 'Set a savings plan';
      body = `${action.goal.name} doesn’t have a plan yet.`;
      cta = { label: 'Set plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'planned-contribution':
      icon = Plus;
      title = `Planned for today: ${formatLei(action.amount)}`;
      body = `Towards ${action.goal.name}. Only if it fits this week — you can skip or record a different amount.`;
      cta = { label: 'Record it', run: () => onAdd(action.goal.id, action.amount) };
      break;
    case 'fix-connection':
      icon = RefreshCw;
      title = 'Reconnect the demo connection';
      body = 'The last sync failed. Your last known figures are kept.';
      cta = {
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
      icon = PartyPopper;
      title = `You reached ${action.goal.name}!`;
      body = 'Decide what’s next: archive it, raise the target, or start a new goal.';
      cta = { label: 'Open goal', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'review-week':
      icon = TrendingUp;
      title = 'Look back at your week';
      body = 'See what came in and out, then confirm your plan for next week.';
      cta = { label: 'Review plan', run: onCheckIn };
      break;
    case 'review-plan':
      title = 'Quick plan check-in';
      body = `Is your plan for ${action.goal.name} still realistic this week? Takes 10 seconds.`;
      cta = { label: 'Check in', run: onCheckIn };
      break;
    case 'done-today':
      icon = CircleCheck;
      title = 'You’re done for today';
      body = 'Today counts towards your streak. Nothing else needed.';
      break;
  }
  const Icon = icon;
  return (
    <section className="card stack" aria-labelledby="today-h">
      <p className="group-label" style={{ padding: 0 }}>
        Today
      </p>
      <div className="row row--top">
        <span className="list-row__icon" aria-hidden style={action.kind === 'done-today' ? { background: 'var(--accent-soft)', color: 'var(--accent-ink)' } : undefined}>
          <Icon size={20} />
        </span>
        <div className="grow stack" style={{ gap: 4 }}>
          <h2 id="today-h">{title}</h2>
          <p className="small muted">{body}</p>
        </div>
      </div>
      {cta && (
        <Button size="sm" variant="secondary" onClick={cta.run} loading={busy} style={{ alignSelf: 'flex-start', marginLeft: 52 }}>
          {cta.label} <ArrowRight size={16} aria-hidden />
        </Button>
      )}
    </section>
  );
}

function BalanceDetails({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { sync } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const b = breakdown(data.transactions);
  const goals = data.goals;
  const syncing = data.connection.status === 'syncing';
  return (
    <Sheet open={open} onClose={onClose} title="Balance details">
      <div className="stack-lg">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <SourceLine />
        </div>
        <dl className="card" style={{ margin: 0, paddingTop: 'var(--s-2)', paddingBottom: 'var(--s-2)' }}>
          <div className="kv">
            <dt>Total savings</dt>
            <dd className="money">{formatLei(b.total)}</dd>
          </div>
          {goals.map((g) => (
            <div className="kv" key={g.id}>
              <dt className="truncate" style={{ paddingLeft: 'var(--s-3)' }}>
                {g.name}
                {g.status !== 'active' ? ` (${g.status})` : ''}
              </dt>
              <dd className="money">{formatLei(goalSaved(data.transactions, g.id))}</dd>
            </div>
          ))}
          <div className="kv">
            <dt style={{ paddingLeft: 'var(--s-3)' }}>Unallocated</dt>
            <dd className="money">{formatLei(b.unallocated)}</dd>
          </div>
          {(b.pendingIn > 0 || b.pendingOut > 0) && (
            <div className="kv">
              <dt>Pending (not counted)</dt>
              <dd className="money">
                {b.pendingIn > 0 && formatLei(b.pendingIn, { sign: true })} {b.pendingOut > 0 && formatLei(-b.pendingOut)}
              </dd>
            </div>
          )}
        </dl>
        <p className="small muted">
          Each leu is counted once: it either belongs to one goal or is unallocated. The total only includes confirmed entries — pending and failed ones are left out.
        </p>
        {data.tracking === 'demo' ? (
          <div className="stack">
            <p className="small subtle">
              Demo Bank is simulated. Last sync: {data.connection.lastSyncAt ? relativeTime(data.connection.lastSyncAt) : 'never'}.
            </p>
            <Button
              block
              loading={syncing}
              icon={RefreshCw}
              onClick={async () => {
                try {
                  await sync();
                  toast('Synced — pending simulated transfers confirmed');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Sync now
            </Button>
          </div>
        ) : (
          <Banner tone="neutral" icon={HardDrive}>
            These figures are what you recorded manually. Kept can’t see your bank account.
          </Banner>
        )}
        <Button
          variant="ghost"
          block
          onClick={() => {
            onClose();
            nav('/activity');
          }}
        >
          View all activity
        </Button>
        {activeGoals(goals).length === 0 && <p className="small subtle">No goals yet — everything is unallocated.</p>}
      </div>
    </Sheet>
  );
}
