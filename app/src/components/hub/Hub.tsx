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
import { TOUR_EVENT } from './Tour';
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
import { daysBetween, formatDate, todayKey, toKey, WEEKDAY_NAME } from '../../lib/dates';
import { formatLei } from '../../lib/money';
import { plural } from '../../lib/ro';

interface HubProps {
  onAdd: (goalId?: string | null, amount?: number) => void;
  onDetails: () => void;
}

const spring = { type: 'spring', stiffness: 320, damping: 30 } as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.05 * i } });

function greeting(): string {
  const h = new Date().getHours();
  return h < 5 ? 'Bună seara' : h < 12 ? 'Bună dimineața' : h < 18 ? 'Bună ziua' : 'Bună seara';
}
const titleCase = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
/** Just the noun of a Romanian count, agreeing with n: "zi", "zile", "de zile". */
const unit = (n: number, one: string, other: string) => plural(n, one, other).replace(/^\S+ /, '');

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
        <span className="home2__out">
          <button type="button" className="home2__tour" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
            Cum funcționează
          </button>
          <Link to="/logout">Ieși din cont</Link>
        </span>
        <h1 className="home3__title">
          {greeting()},<br />
          <span className="brush home3__name">{name || 'prietene'}</span>
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
    <section className="vault" data-tour="vault" aria-labelledby="vault-title">
      <div className="vault__top">
        <h2 id="vault-title" className="vault__label">
          Economisit
        </h2>
        <button type="button" className="vault__eye" onClick={() => setPrefs({ hideBalance: !hidden })} aria-label={hidden ? 'Arată sumele' : 'Ascunde sumele'}>
          {hidden ? <EyeOff size={18} aria-hidden /> : <Eye size={18} aria-hidden />}
        </button>
      </div>
      <p className="vault__amount money">
        {hidden ? '••••' : <NumberFlow value={b.total / 100} locales="ro-RO" format={{ maximumFractionDigits: 0 }} />}
        <span>lei</span>
      </p>
      <p className="vault__split">
        <span>{money(b.allocated)} în obiective</span>
        <span>{money(b.unallocated)} nealocat</span>
        {b.pendingIn > 0 && <span className="vault__pending">{money(b.pendingIn)} în așteptare</span>}
      </p>
      <div className="vault__actions">
        <QuickRecord goal={goal} primary={!primaryElsewhere} />
        <button type="button" className="vault__more" onClick={onDetails}>
          Cum se adună
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
      title = 'Alege pentru ce economisești';
      body = 'Un laptop, Erasmus, un fond de urgență, orice. Primești un plan pe măsura săptămânii tale.';
      primary = { label: 'Creează un obiectiv', run: () => nav('/goals/new') };
      break;
    case 'set-plan':
      title = `${action.goal.name} are nevoie de un plan`;
      body = 'Alege cât și cât de des. Îl poți micșora sau pune pe pauză oricând.';
      primary = { label: 'Fă un plan', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'planned-contribution':
      title = 'Azi e una dintre zilele tale de economisit';
      body = `Planul tău pentru ${action.goal.name} e ${planLabel(action.goal.plan).toLowerCase()}. Pune banii deoparte unde îi ții de obicei, apoi adaugă-i aici ca să conteze. Dacă săptămâna asta e mai grea, pune mai puțin sau sari peste: planul nu e o obligație.`;
      primary = { label: `Am pus deoparte ${formatLei(action.amount)}`, run: () => onAdd(action.goal.id, action.amount) };
      secondary = { label: 'Adaugă altă sumă', run: () => onAdd(action.goal.id) };
      break;
    case 'fix-connection':
      title = 'Sincronizarea demo n-a mers';
      body = 'Ultimele cifre cunoscute rămân aici. Nu s-a pierdut nimic.';
      primary = {
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
      title = `Obiectiv atins: ${action.goal.name}`;
      body = 'Alege ce urmează: îl arhivezi, mărești ținta sau începi un obiectiv nou.';
      primary = { label: 'Deschide obiectivul', run: () => nav(`/goals/${action.goal.id}`) };
      break;
    case 'review-week':
      title = 'Aruncă o privire la săptămâna ta';
      body = 'Vezi ce a intrat și ce a ieșit, apoi decide dacă planul încă se potrivește pentru săptămâna viitoare.';
      secondary = { label: 'Vezi săptămâna asta', run: () => nav('/activity') };
      break;
    case 'review-plan':
      title = 'Planul tău încă merge săptămâna asta?';
      body = `O verificare de zece secunde pentru ${action.goal.name}. Dacă confirmi, ziua de azi e bifată.`;
      secondary = {
        label: 'Da, încă merge',
        run: () => {
          checkIn();
          toast('Zi bifată. Plan confirmat.');
        },
      };
      break;
    case 'done-today':
      title = 'Nimic altceva de făcut azi';
      body = 'Ziua de azi e deja bifată. Ne vedem în următoarea ta zi de economisit.';
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
      {data.transactions.length === 0 && action.kind !== 'create-goal' && <p className="small muted">Kept nu mută niciodată bani. Doar ține evidența a ce pui deoparte.</p>}
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
  if (saved >= goal.target) insight = 'Gata! E momentul să alegi ce urmează.';
  else if (goal.plan.frequency === 'flexible') insight = 'Fără plan fix, deci încă fără dată de final.';
  else if (finish && goal.targetDate) {
    const weeks = Math.round(Math.abs(daysBetween(goal.targetDate, finish)) / 7);
    insight =
      finish > goal.targetDate
        ? `În ritmul ăsta, ajungi cu ${plural(weeks, 'săptămână', 'săptămâni')} mai târziu.${pace ? ` Cu ${formatLei(Math.ceil(pace.perWeek / 100) * 100)} pe săptămână ajungi la timp.` : ''}`
        : weeks === 0
          ? 'Ajungi fix la data aleasă.'
          : `În ritmul ăsta, ajungi cu ${plural(weeks, 'săptămână', 'săptămâni')} mai devreme.`;
  } else if (finish) insight = `În ritmul ăsta, pe la ${formatDate(finish)}.`;

  return (
    <Link to={`/goals/${goal.id}`} className={`tile ${wide ? 'tile--wide' : ''}`} data-tour={wide ? 'goal' : undefined} data-feed-goal={goal.id} data-feed-name={goal.name} aria-label={`${goal.name}: ${formatLei(saved)} din ${formatLei(goal.target)}`}>
      <span className="tile__label">
        {goal.name}
        {wide && <ChevronRight size={16} aria-hidden />}
      </span>
      <span className="tile__amount money">{formatLei(saved)}</span>
      <span className="tile__sub">
        {Math.round(pct * 100)}% din {formatLei(goal.target)}
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
      data-tour="streak"
      onClick={() => {
        if (todayDone) return;
        checkIn();
        toast('Ziua de azi e bifată.');
      }}
      aria-label={`Serie: ${plural(streak, 'zi', 'zile')} la rând. ${todayDone ? 'Azi contează.' : 'Apasă ca să bifezi ziua.'}`}
    >
      <span className="tile__label">
        <Flame size={16} aria-hidden /> Serie
      </span>
      <span className="tile__amount">
        {streak}
        <small> {unit(streak, 'zi', 'zile')}</small>
      </span>
      <span className="tile__week" aria-hidden>
        {days.map((d, i) => (
          <i key={d.key} className={`wk wk--${d.state}`} title={WEEKDAY_NAME[i]} />
        ))}
      </span>
      <span className="tile__sub">{todayDone ? 'Azi contează' : 'Apasă ca să bifezi ziua'}</span>
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
          Activitate recentă
        </h2>
        {recent.length > 0 && (
          <Link to="/activity" className="link-btn">
            Vezi tot <ArrowRight size={14} aria-hidden />
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
          <img className="empty2__kip" src="/mascot/pose-peek.webp" alt="" />
          <p className="h3">Încă nimic aici</p>
          <p className="muted small">Când pui bani deoparte, apasă „Adaugă economii” și scrie suma. Fiecare intrare apare aici cu data, obiectivul și starea ei.</p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onAdd}>
            Adaugă economii
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
    { title: 'Alege un obiectiv', done: data.goals.length > 0 },
    { title: 'Adaugă primele economii', done: data.transactions.length > 0 },
    { title: 'Alege o zi pentru memento', done: data.reminder.enabled },
    { title: 'Bifează și a doua zi', done: currentStreak(data) >= 2 },
  ];
  const doneCount = steps.filter((s) => s.done).length;

  return (
    <section className="card first" aria-labelledby="first-title">
      <div className="first__kip">
        <img src="/mascot/wave-face.webp" alt="" />
      </div>
      <h2 id="first-title" className="h2">
        {goal ? `Hai să începem: ${goal.name}` : 'Hai să-ți alegem primul obiectiv'}
      </h2>
      {goal && (
        <p className="muted">
          Ai ales {planLabel(goal.plan).toLowerCase()}, cu ținta de {formatLei(goal.target)}
          {finish ? `, deci ajungi la ea pe la ${formatDate(finish)}` : ''}. Uite cum funcționează Kept:
        </p>
      )}
      <ol className="how">
        <li>
          <strong>Pune bani deoparte unde îi ții deja.</strong> Un cont de economii, o pușculiță în aplicația băncii, chiar și cash.
        </li>
        <li>
          <strong>Adaugă suma în Kept.</strong> Se adună imediat la obiectivul tău.
        </li>
        <li>
          <strong>Kept îți spune dacă ești pe drumul cel bun,</strong> iar planul îl poți micșora sau pune pe pauză oricând.
        </li>
      </ol>
      <div className="setup" aria-label={`Primii pași: ${doneCount} din ${steps.length} gata`}>
        <div className="setup__bar" aria-hidden>
          {steps.map((s) => (
            <span key={s.title} data-done={s.done || undefined} />
          ))}
        </div>
        <span className="small muted">
          Primii pași: {doneCount} din {steps.length} gata
        </span>
      </div>
      {goal ? (
        <button type="button" className="btn btn--primary btn--lg" onClick={() => onAdd(goal.id, goal.plan.amount || undefined)}>
          Adaugă primele economii
        </button>
      ) : (
        <button type="button" className="btn btn--primary btn--lg" onClick={() => nav('/goals/new')}>
          Creează un obiectiv
        </button>
      )}
    </section>
  );
}
