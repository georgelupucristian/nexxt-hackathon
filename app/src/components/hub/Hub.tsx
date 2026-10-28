import { ArrowRight } from '@/lib/icons';
import { motion } from 'motion/react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { planLabel, TxRow } from '../domain';
import { useToast } from '../ui';
import { PlanSimulator } from './Playful';
import { SleepTile } from './SleepOnIt';
import { GoalCard, StreakStrip } from './HomeWidgets';
import { TOUR_EVENT } from './Tour';
import { currentStreak, primaryGoal, projectedFinish, sortTx, todayAction, type TodayAction } from '../../data/selectors';
import { useData, useStore } from '../../data/store';
import type { Goal } from '../../data/types';
import { formatDate } from '../../lib/dates';
import { formatLei } from '../../lib/money';

interface HubProps {
  onAdd: (goalId?: string | null, amount?: number) => void;
  onDetails?: () => void; // the balance breakdown sheet; home links to Activity instead now
}

const spring = { type: 'spring', stiffness: 320, damping: 30 } as const;
const enter = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { ...spring, delay: 0.05 * i } });


/**
 * Home leads with the three things that matter most, in this order: the streak, how close the
 * main goal is, and what happened recently. Other goals and "sleep on it" follow as circles, then
 * Kip's nudge for today and the plan simulator. A first-time user sees a focused start instead of a
 * dashboard of zeros. Navigation lives in Kip's dial, so nothing here competes with it.
 */
export function Hub({ onAdd }: HubProps) {
  const data = useData();
  const { account } = useStore();
  const goal = primaryGoal(data.goals);
  const action = todayAction(data);
  const firstUse = data.transactions.length === 0 && !account?.isDemo;

  return (
    <div className="home2 home4">
      <motion.header className="home4__head" {...enter(0)}>
        <button type="button" className="home2__tour" onClick={() => window.dispatchEvent(new Event(TOUR_EVENT))}>
          Cum funcționează
        </button>
        <Link to="/logout" className="home4__out">
          Ieși din cont
        </Link>
      </motion.header>

      {firstUse ? (
        <motion.div {...enter(1)} className="home2__first">
          <FirstUse goal={goal} onAdd={onAdd} />
        </motion.div>
      ) : (
        // phone: one column in order of importance. laptop: goal and streak left, the rest right.
        <div className="home4__grid">
          <motion.div {...enter(1)} className="home4__goal">
            {goal ? <GoalCard goal={goal} primary={!hasPrimary(action)} /> : <NextStep action={action} onAdd={onAdd} />}
          </motion.div>
          <motion.div {...enter(2)} className="home4__streak">
            <StreakStrip />
          </motion.div>
          <motion.div {...enter(3)} className="home4__recent">
            <Recent onAdd={onAdd} />
          </motion.div>
          {goal && goal.plan.frequency !== 'flexible' && (
            <motion.div {...enter(4)} className="home4__sim">
              <PlanSimulator goal={goal} />
            </motion.div>
          )}
          <motion.div {...enter(5)} className="home4__more">
            <SleepTile />
          </motion.div>
        </div>
      )}
    </div>
  );
}

const hasPrimary = (a: TodayAction) => a.kind !== 'done-today' && a.kind !== 'review-plan' && a.kind !== 'review-week';

// ---------- what you've saved ----------


// ---------- the one thing to do today ----------

function NextStep({ action, onAdd }: { action: TodayAction; onAdd: (goalId?: string | null, amount?: number) => void }) {
  const data = useData();
  const { checkIn, sync } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

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
      {data.transactions.length === 0 && action.kind !== 'create-goal' && <p className="small muted">Kip nu mută niciodată bani. Doar ține evidența a ce pui deoparte.</p>}
    </section>
  );
}

// ---------- goal context and the one insight that matters ----------


// ---------- consistency, kept apart from money ----------


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
          {finish ? `, deci ajungi la ea pe la ${formatDate(finish)}` : ''}. Uite cum funcționează Kip:
        </p>
      )}
      <ol className="how">
        <li>
          <strong>Pune bani deoparte unde îi ții deja.</strong> Un cont de economii, o pușculiță în aplicația băncii, chiar și cash.
        </li>
        <li>
          <strong>Adaugă suma în Kip.</strong> Se adună imediat la obiectivul tău.
        </li>
        <li>
          <strong>Kip îți spune dacă ești pe drumul cel bun,</strong> iar planul îl poți micșora sau pune pe pauză oricând.
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
