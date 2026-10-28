import { Archive, ArchiveRestore, MoreHorizontal, Minus, Pause, Pencil, Play, Plus, SlidersHorizontal, Star, Trash2, TrendingUp } from '@/lib/icons';
import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { HealthPill, planLabel, TxRow } from '../components/domain';
import { MoneySheet, PlanSheet, type MoneySheetProps } from '../components/sheets';
import { Emoji3D, GOAL_EMOJI } from '../components/Emoji3D';
import { ConfirmDialog, EmptyState, IconButton, Sheet, TopBar, useToast } from '../components/ui';
import { goalSaved, nextPlannedDate, progress, projectedFinish, sortTx } from '../data/selectors';
import { useData, useStore } from '../data/store';
import { formatDate, formatDay } from '../lib/dates';
import { formatLei } from '../lib/money';
import { plural } from '../lib/ro';

export function GoalDetail() {
  const { id } = useParams();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const [money, setMoney] = useState<Omit<MoneySheetProps, 'onClose'>>({ open: false });
  const [planOpen, setPlanOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);

  const goal = data.goals.find((g) => g.id === id);
  if (!goal) return <Navigate to="/goals" replace />;

  const saved = goalSaved(data.transactions, goal.id);
  const p = progress(saved, goal.target);
  const remaining = Math.max(0, goal.target - saved);
  const next = goal.status === 'active' ? nextPlannedDate(goal.plan) : null;
  const finish = goal.status === 'active' ? projectedFinish(goal.plan, saved, goal.target) : null;
  const history = sortTx(data.transactions.filter((t) => t.goalId === goal.id));
  const archived = goal.status === 'archived';

  return (
    <div className="screen">
      <TopBar title="Obiectiv" end={<IconButton label="Opțiuni obiectiv" icon={MoreHorizontal} onClick={() => setMenu(true)} />} />

      <section className={`goal-hero goal-hero--${goal.kind}`} aria-labelledby="goal-name">
        <GoalGauge pct={p} paused={goal.status !== 'active'}>
          <Emoji3D name={GOAL_EMOJI[goal.kind]} size={64} float />
          <div className="goal-hero__amount">
            <NumberFlow value={saved / 100} locales="ro-RO" format={{ maximumFractionDigits: 2 }} className="goal-hero__num" />
            <span className="goal-hero__cur">lei</span>
          </div>
          <p className="goal-hero__of money">
            din {formatLei(goal.target)} · <NumberFlow value={Math.round(p * 100)} />%
          </p>
        </GoalGauge>
        <div className="goal-hero__title">
          <h1 id="goal-name" style={{ overflowWrap: 'anywhere' }}>
            {goal.name}
          </h1>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {goal.isPrimary && goal.status === 'active' && <span className="pill pill--info">Principal</span>}
            <HealthPill goal={goal} saved={saved} />
          </div>
          <p className="small muted">{remaining > 0 ? `Mai ai ${formatLei(remaining)} până la țintă` : 'Țintă atinsă. Bravo!'}</p>
          {goal.motivation && <p className="muted" style={{ fontStyle: 'italic' }}>„{goal.motivation}”</p>}
        </div>

        {goal.status === 'paused' && (
          <div className="banner">
            <Pause size={18} aria-hidden />
            <div className="grow">Obiectivul e pe pauză. Banii economisiți rămân aici, iar depunerile planificate așteaptă.</div>
            <button type="button" className="banner__action" onClick={() => store.updateGoal(goal.id, { status: 'active' })}>
              Reia
            </button>
          </div>
        )}

        {!archived && (
          <div className="goal-hero__actions">
            <motion.button type="button" className="btn btn--primary btn--xl grow" whileTap={{ scale: 0.97 }} onClick={() => setMoney({ open: true, mode: 'contribution', goalId: goal.id })}>
              <Plus size={20} aria-hidden /> Adaugă bani
            </motion.button>
            <motion.button type="button" className="btn btn--secondary btn--xl grow" whileTap={{ scale: 0.97 }} disabled={saved <= 0} onClick={() => setMoney({ open: true, mode: 'withdrawal', goalId: goal.id })}>
              <Minus size={20} aria-hidden /> Retrage
            </motion.button>
            <motion.button type="button" className="btn btn--secondary btn--xl goal-hero__tune" whileTap={{ scale: 0.95 }} onClick={() => setPlanOpen(true)} aria-label="Ajustează planul" title="Ajustează planul">
              <SlidersHorizontal size={20} aria-hidden />
            </motion.button>
          </div>
        )}
      </section>

      <section className="card" aria-label="Plan">
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Plan</dt>
            <dd>{goal.status === 'paused' ? `Pe pauză (${planLabel(goal.plan)})` : planLabel(goal.plan)}</dd>
          </div>
          {next && remaining > 0 && (
            <div className="kv">
              <dt>Următoarea depunere</dt>
              <dd>
                {formatLei(goal.plan.amount)} · {formatDay(next)}
              </dd>
            </div>
          )}
          <div className="kv">
            <dt>Data țintă</dt>
            <dd>{goal.targetDate ? formatDate(goal.targetDate) : 'Fără termen'}</dd>
          </div>
          {finish && remaining > 0 && (
            <div className="kv">
              <dt>Final estimat</dt>
              <dd>{formatDate(finish)}</dd>
            </div>
          )}
        </dl>
        {finish && goal.targetDate && finish > goal.targetDate && remaining > 0 && (
          <p className="small muted" style={{ paddingTop: 'var(--s-3)' }}>
            În ritmul ăsta ai termina după data țintă. Poți mări suma, muta data sau continua la fel. Oricare e în regulă.
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h">Istoric</h2>
        <div className="card card--flush">
          {history.length ? (
            <ul className="list">
              {history.map((t) => (
                <li key={t.id}>
                  <TxRow tx={t} />
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={TrendingUp} title="Nicio depunere încă" body="Prima depunere nu trebuie să fie mare. Orice sumă contează." />
          )}
        </div>
      </section>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Opțiuni obiectiv">
        <div className="card card--flush">
          <ul className="list">
            {!archived && (
              <li>
                <button type="button" className="list-row" onClick={() => nav(`/goals/${goal.id}/edit`)}>
                  <span className="list-row__icon"><Pencil size={18} aria-hidden /></span>
                  <span className="list-row__body strong">Editează numele, ținta sau data</span>
                </button>
              </li>
            )}
            {goal.status === 'active' && !goal.isPrimary && (
              <li>
                <button type="button" className="list-row" onClick={() => { store.setPrimary(goal.id); setMenu(false); toast('Apare pe ecranul Acasă ca obiectiv principal'); }}>
                  <span className="list-row__icon"><Star size={18} aria-hidden /></span>
                  <span className="list-row__body strong">Fă-l obiectiv principal</span>
                </button>
              </li>
            )}
            {goal.status === 'active' && (
              <li>
                <button type="button" className="list-row" onClick={() => { store.updateGoal(goal.id, { status: 'paused' }); setMenu(false); toast('Obiectiv pus pe pauză'); }}>
                  <span className="list-row__icon"><Pause size={18} aria-hidden /></span>
                  <span className="list-row__body">
                    <span className="strong">Pune obiectivul pe pauză</span>
                    <span className="small subtle">Banii rămân aici, planul stă pe loc.</span>
                  </span>
                </button>
              </li>
            )}
            {goal.status === 'paused' && (
              <li>
                <button type="button" className="list-row" onClick={() => { store.updateGoal(goal.id, { status: 'active' }); setMenu(false); toast('Obiectiv reluat'); }}>
                  <span className="list-row__icon"><Play size={18} aria-hidden /></span>
                  <span className="list-row__body strong">Reia obiectivul</span>
                </button>
              </li>
            )}
            <li>
              <button type="button" className="list-row" onClick={() => { if (archived) { store.updateGoal(goal.id, { status: 'active' }); setMenu(false); toast('Obiectiv restaurat'); } else { setMenu(false); setConfirm('archive'); } }}>
                <span className="list-row__icon">{archived ? <ArchiveRestore size={18} aria-hidden /> : <Archive size={18} aria-hidden />}</span>
                <span className="list-row__body strong">{archived ? 'Restaurează obiectivul' : 'Arhivează obiectivul'}</span>
              </button>
            </li>
            <li>
              <button type="button" className="list-row" style={{ color: 'var(--danger)' }} onClick={() => { setMenu(false); setConfirm('delete'); }}>
                <span className="list-row__icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Trash2 size={18} aria-hidden /></span>
                <span className="list-row__body strong">Șterge obiectivul</span>
              </button>
            </li>
          </ul>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm === 'archive'}
        title="Arhivezi obiectivul?"
        body={<>Trece în lista de arhivate. {saved > 0 ? <>Suma de {formatLei(saved)} strânsă aici rămâne în totalul tău și aparține în continuare acestui obiectiv.</> : null} Îl poți restaura oricând.</>}
        confirmLabel="Arhivează"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          store.updateGoal(goal.id, { status: 'archived' });
          setConfirm(null);
          toast('Obiectiv arhivat');
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Ștergi obiectivul?"
        danger
        body={<>Obiectivul și planul lui dispar. {plural(history.length, 'înregistrare', 'înregistrări')} {history.length === 1 ? 'rămâne' : 'rămân'} în Activitate, la „Nealocat”, deci totalul economiilor nu se schimbă{saved > 0 ? ` (suma de ${formatLei(saved)} devine nealocată)` : ''}. Asta nu se poate anula.</>}
        confirmLabel="Șterge obiectivul"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          store.deleteGoal(goal.id);
          toast('Obiectiv șters');
          nav('/goals', { replace: true });
        }}
      />
      <MoneySheet {...money} onClose={() => setMoney({ open: false })} />
      <PlanSheet open={planOpen} onClose={() => setPlanOpen(false)} goal={goal} />
    </div>
  );
}

/** Bevel-style gauge: a 270° arc that fills with a soft glow, with the goal's numbers inside. */
function GoalGauge({ pct, paused, children }: { pct: number; paused: boolean; children: ReactNode }) {
  const r = 120;
  const len = 2 * Math.PI * r * 0.75;
  return (
    <div className="goal-gauge">
      <svg viewBox="0 0 280 280" className="goal-gauge__svg" aria-hidden>
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#9be7bd" />
            <stop offset="1" stopColor="#1f7a52" />
          </linearGradient>
          <filter id="gauge-glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>
        <g transform="rotate(135 140 140)">
          <circle cx="140" cy="140" r={r} fill="none" stroke="var(--surface-3)" strokeWidth="16" strokeLinecap="round" strokeDasharray={`${len} 999`} />
          {!paused && (
            <motion.circle cx="140" cy="140" r={r} fill="none" stroke="url(#gauge-fill)" strokeWidth="16" strokeLinecap="round" filter="url(#gauge-glow)" opacity="0.5" strokeDasharray={`${len} 999`} initial={{ strokeDashoffset: len }} animate={{ strokeDashoffset: len * (1 - Math.max(pct, 0.01)) }} transition={{ type: 'spring', stiffness: 40, damping: 15, delay: 0.2 }} />
          )}
          <motion.circle cx="140" cy="140" r={r} fill="none" stroke={paused ? 'var(--ink-3)' : 'url(#gauge-fill)'} strokeWidth="16" strokeLinecap="round" strokeDasharray={`${len} 999`} initial={{ strokeDashoffset: len }} animate={{ strokeDashoffset: len * (1 - Math.max(pct, 0.01)) }} transition={{ type: 'spring', stiffness: 40, damping: 15, delay: 0.2 }} />
        </g>
      </svg>
      <div className="goal-gauge__inner">{children}</div>
    </div>
  );
}
