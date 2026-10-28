import { ArrowRight, Bell, CalendarCheck, CircleCheck, FlaskConical, HardDrive, PartyPopper, Plus, RefreshCw, Target, TrendingUp } from '@/lib/icons';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConnectionBanner, GoalCard, SourceLine, TxRow, WeekStrip, WeeklySummaryCard } from '../components/domain';
import { CheckInSheet, MoneySheet, StreakSheet, type MoneySheetProps } from '../components/sheets';
import { Banner, Button, EmptyState, Sheet, useToast } from '../components/ui';
import { activeGoals, breakdown, currentStreak, goalSaved, primaryGoal, sortTx, todayAction, weekSummary, type TodayAction } from '../data/selectors';
import { useData, useStore } from '../data/store';
import { todayKey, toKey, weekday, relativeTime } from '../lib/dates';
import { formatLei } from '../lib/money';

export function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Bună seara' : h < 12 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
}

/** The Today panel: what used to be the Home dashboard, minus the balance (the hub orb shows it). */
export function Today() {
  const data = useData();
  const { account } = useStore();
  const nav = useNavigate();
  const [money, setMoney] = useState<Omit<MoneySheetProps, 'onClose'>>({ open: false });
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
      {account?.isDemo && (
        <Banner tone="demo" icon={FlaskConical}>
          <strong>Date demo.</strong> Folosești un cont demo. Niciun ban de aici nu e real.
        </Banner>
      )}
      <ConnectionBanner />
      {reminderDue && (
        <Banner
          tone="info"
          icon={Bell}
          action={
            <button type="button" className="banner__action" onClick={() => setCheckIn(true)}>
              Verifică
            </button>
          }
        >
          Mementoul tău săptămânal: ia-ți un minut să-ți verifici planul.
        </Banner>
      )}

      <div className="home-grid">
        <div className="stack-lg">
          <WeekStrip joined={joinedKey} streak={streak} onOpen={() => setStreakInfo(true)} />
          <TodayCard action={action} onAdd={openAdd} onCheckIn={() => setCheckIn(true)} />
        </div>
        <div className="stack-lg">
          <section className="section" aria-labelledby="goal-h">
            <div className="section-head">
              <h2 id="goal-h">{goal ? 'Obiectiv principal' : 'Obiective'}</h2>
              {goal && (
                <Link to="/goals" className="link-btn">
                  Toate obiectivele
                </Link>
              )}
            </div>
            {goal ? (
              <GoalCard goal={goal} />
            ) : (
              <div className="card">
                <EmptyState icon={Target} title="Niciun obiectiv activ" body="Creează un obiectiv ca să primești un plan și să-ți vezi progresul aici." action={<Button variant="primary" onClick={() => nav('/goals/new')}>Creează un obiectiv</Button>} />
              </div>
            )}
          </section>

          <WeeklySummaryCard s={weekSummary(data.transactions)} goal={goal} />

          <section className="section" aria-labelledby="recent-h">
            <div className="section-head">
              <h2 id="recent-h">Activitate recentă</h2>
              {recent.length > 0 && (
                <Link to="/activity" className="link-btn">
                  Vezi tot
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
                <EmptyState icon={TrendingUp} title="Nicio activitate încă" body="Când adaugi economii, le vezi aici." />
              )}
            </div>
          </section>
        </div>
      </div>

      <MoneySheet {...money} onClose={() => setMoney({ open: false })} />
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
      title = 'Creează primul tău obiectiv';
      body = 'Alege ceva pentru care vrei să economisești, iar Kip te ajută să-ți faci planul.';
      cta = { label: 'Creează un obiectiv', run: () => nav('/goals/new') };
      break;
    case 'set-plan':
      title = 'Fă-ți un plan de economisire';
      body = `${action.goal.name} nu are încă un plan.`;
      cta = { label: 'Fă un plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'planned-contribution':
      icon = Plus;
      title = `Plănuit pentru azi: ${formatLei(action.amount)}`;
      body = `Pentru ${action.goal.name}. Doar dacă îți permiți săptămâna asta. Poți să sari peste sau să adaugi altă sumă.`;
      cta = { label: 'Adaugă suma', run: () => onAdd(action.goal.id, action.amount) };
      break;
    case 'fix-connection':
      icon = RefreshCw;
      title = 'Refă conexiunea demo';
      body = 'Ultima sincronizare a eșuat. Păstrăm ultimele cifre cunoscute.';
      cta = {
        label: 'Reîncearcă sincronizarea',
        run: async () => {
          setBusy(true);
          try {
            await sync();
            toast('Sincronizat');
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
      title = `${action.goal.name}: obiectiv atins!`;
      body = 'Tu alegi ce urmează: îl arhivezi, mărești ținta sau începi un obiectiv nou.';
      cta = { label: 'Deschide obiectivul', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'review-week':
      icon = TrendingUp;
      title = 'Aruncă o privire la săptămâna ta';
      body = 'Vezi ce a intrat și ce a ieșit, apoi confirmă-ți planul pentru săptămâna viitoare.';
      cta = { label: 'Verifică planul', run: onCheckIn };
      break;
    case 'review-plan':
      title = 'Verificare rapidă a planului';
      body = `Planul pentru ${action.goal.name} mai e realist săptămâna asta? Durează 10 secunde.`;
      cta = { label: 'Bifează ziua de azi', run: onCheckIn };
      break;
    case 'done-today':
      icon = CircleCheck;
      title = 'Gata pe azi';
      body = 'Azi intră în streak-ul tău. Nu mai ai nimic de făcut.';
      break;
  }
  const Icon = icon;
  return (
    <section className="card stack" aria-labelledby="today-h">
      <p className="group-label" style={{ padding: 0 }}>
        Azi
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

export function BalanceDetails({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { sync } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const b = breakdown(data.transactions);
  const goals = data.goals;
  const syncing = data.connection.status === 'syncing';
  return (
    <Sheet open={open} onClose={onClose} title="Detalii sold">
      <div className="stack-lg">
        <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
          <SourceLine />
        </div>
        <dl className="card" style={{ margin: 0, paddingTop: 'var(--s-2)', paddingBottom: 'var(--s-2)' }}>
          <div className="kv">
            <dt>Economii totale</dt>
            <dd className="money">{formatLei(b.total)}</dd>
          </div>
          {goals.map((g) => (
            <div className="kv" key={g.id}>
              <dt className="truncate" style={{ paddingLeft: 'var(--s-3)' }}>
                {g.name}
                {g.status === 'paused' ? ' (în pauză)' : g.status === 'archived' ? ' (arhivat)' : ''}
              </dt>
              <dd className="money">{formatLei(goalSaved(data.transactions, g.id))}</dd>
            </div>
          ))}
          <div className="kv">
            <dt style={{ paddingLeft: 'var(--s-3)' }}>Nealocat</dt>
            <dd className="money">{formatLei(b.unallocated)}</dd>
          </div>
          {(b.pendingIn > 0 || b.pendingOut > 0) && (
            <div className="kv">
              <dt>În așteptare (nu se adună)</dt>
              <dd className="money">
                {b.pendingIn > 0 && formatLei(b.pendingIn, { sign: true })} {b.pendingOut > 0 && formatLei(-b.pendingOut)}
              </dd>
            </div>
          )}
        </dl>
        <p className="small muted">
          Fiecare leu e numărat o singură dată: ori aparține unui obiectiv, ori e nealocat. Totalul include doar intrările confirmate. Cele în așteptare și cele eșuate rămân pe dinafară.
        </p>
        {data.tracking === 'demo' ? (
          <div className="stack">
            <p className="small subtle">
              Banca Demo e simulată. Ultima sincronizare: {data.connection.lastSyncAt ? relativeTime(data.connection.lastSyncAt) : 'niciodată'}.
            </p>
            <Button
              block
              loading={syncing}
              icon={RefreshCw}
              onClick={async () => {
                try {
                  await sync();
                  toast('Sincronizat. Transferurile în așteptare sunt confirmate.');
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              Sincronizează acum
            </Button>
          </div>
        ) : (
          <Banner tone="neutral" icon={HardDrive}>
            Cifrele astea sunt ce ai adăugat tu manual. Kip nu-ți vede contul bancar.
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
          Vezi toată activitatea
        </Button>
        {activeGoals(goals).length === 0 && <p className="small subtle">Încă n-ai obiective, așa că totul e nealocat.</p>}
      </div>
    </Sheet>
  );
}
