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
      <TopBar title="Goal" end={<IconButton label="Goal options" icon={MoreHorizontal} onClick={() => setMenu(true)} />} />

      <section className={`goal-hero goal-hero--${goal.kind}`} aria-labelledby="goal-name">
        <GoalGauge pct={p} paused={goal.status !== 'active'}>
          <Emoji3D name={GOAL_EMOJI[goal.kind]} size={64} float />
          <div className="goal-hero__amount">
            <NumberFlow value={saved / 100} locales="ro-RO" format={{ maximumFractionDigits: 2 }} className="goal-hero__num" />
            <span className="goal-hero__cur">lei</span>
          </div>
          <p className="goal-hero__of money">
            of {formatLei(goal.target)} · <NumberFlow value={Math.round(p * 100)} />%
          </p>
        </GoalGauge>
        <div className="goal-hero__title">
          <h1 id="goal-name" style={{ overflowWrap: 'anywhere' }}>
            {goal.name}
          </h1>
          <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {goal.isPrimary && goal.status === 'active' && <span className="pill pill--info">Primary</span>}
            <HealthPill goal={goal} saved={saved} />
          </div>
          <p className="small muted">{remaining > 0 ? `${formatLei(remaining)} to go` : 'Target reached. Nice work.'}</p>
          {goal.motivation && <p className="muted" style={{ fontStyle: 'italic' }}>“{goal.motivation}”</p>}
        </div>

        {goal.status === 'paused' && (
          <div className="banner">
            <Pause size={18} aria-hidden />
            <div className="grow">This goal is paused. Your saved money stays here; planned contributions are on hold.</div>
            <button type="button" className="banner__action" onClick={() => store.updateGoal(goal.id, { status: 'active' })}>
              Resume
            </button>
          </div>
        )}

        {!archived && (
          <div className="goal-hero__actions">
            <motion.button type="button" className="btn btn--primary btn--xl grow" whileTap={{ scale: 0.97 }} onClick={() => setMoney({ open: true, mode: 'contribution', goalId: goal.id })}>
              <Plus size={20} aria-hidden /> Add money
            </motion.button>
            <motion.button type="button" className="btn btn--secondary btn--xl grow" whileTap={{ scale: 0.97 }} disabled={saved <= 0} onClick={() => setMoney({ open: true, mode: 'withdrawal', goalId: goal.id })}>
              <Minus size={20} aria-hidden /> Withdraw
            </motion.button>
            <motion.button type="button" className="btn btn--secondary btn--xl goal-hero__tune" whileTap={{ scale: 0.95 }} onClick={() => setPlanOpen(true)} aria-label="Adjust plan" title="Adjust plan">
              <SlidersHorizontal size={20} aria-hidden />
            </motion.button>
          </div>
        )}
      </section>

      <section className="card" aria-label="Plan">
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Plan</dt>
            <dd>{goal.status === 'paused' ? `On hold (${planLabel(goal.plan)})` : planLabel(goal.plan)}</dd>
          </div>
          {next && remaining > 0 && (
            <div className="kv">
              <dt>Next planned</dt>
              <dd>
                {formatLei(goal.plan.amount)} · {formatDay(next)}
              </dd>
            </div>
          )}
          <div className="kv">
            <dt>Target date</dt>
            <dd>{goal.targetDate ? formatDate(goal.targetDate) : 'No deadline'}</dd>
          </div>
          {finish && remaining > 0 && (
            <div className="kv">
              <dt>Estimated finish</dt>
              <dd>{formatDate(finish)}</dd>
            </div>
          )}
        </dl>
        {finish && goal.targetDate && finish > goal.targetDate && remaining > 0 && (
          <p className="small muted" style={{ paddingTop: 'var(--s-3)' }}>
            At this pace you’d finish after your target date. You could raise the amount, move the date, or keep going as is — all fine.
          </p>
        )}
      </section>

      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h">History</h2>
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
            <EmptyState icon={TrendingUp} title="No contributions yet" body="Your first contribution doesn’t have to be big. Anything counts." />
          )}
        </div>
      </section>

      <Sheet open={menu} onClose={() => setMenu(false)} title="Goal options">
        <div className="card card--flush">
          <ul className="list">
            {!archived && (
              <li>
                <button type="button" className="list-row" onClick={() => nav(`/goals/${goal.id}/edit`)}>
                  <span className="list-row__icon"><Pencil size={18} aria-hidden /></span>
                  <span className="list-row__body strong">Edit name, target or date</span>
                </button>
              </li>
            )}
            {goal.status === 'active' && !goal.isPrimary && (
              <li>
                <button type="button" className="list-row" onClick={() => { store.setPrimary(goal.id); setMenu(false); toast('Shown on Home as your primary goal'); }}>
                  <span className="list-row__icon"><Star size={18} aria-hidden /></span>
                  <span className="list-row__body strong">Make primary goal</span>
                </button>
              </li>
            )}
            {goal.status === 'active' && (
              <li>
                <button type="button" className="list-row" onClick={() => { store.updateGoal(goal.id, { status: 'paused' }); setMenu(false); toast('Goal paused'); }}>
                  <span className="list-row__icon"><Pause size={18} aria-hidden /></span>
                  <span className="list-row__body">
                    <span className="strong">Pause goal</span>
                    <span className="small subtle">Keeps the money here, puts the plan on hold.</span>
                  </span>
                </button>
              </li>
            )}
            {goal.status === 'paused' && (
              <li>
                <button type="button" className="list-row" onClick={() => { store.updateGoal(goal.id, { status: 'active' }); setMenu(false); toast('Goal resumed'); }}>
                  <span className="list-row__icon"><Play size={18} aria-hidden /></span>
                  <span className="list-row__body strong">Resume goal</span>
                </button>
              </li>
            )}
            <li>
              <button type="button" className="list-row" onClick={() => { if (archived) { store.updateGoal(goal.id, { status: 'active' }); setMenu(false); toast('Goal restored'); } else { setMenu(false); setConfirm('archive'); } }}>
                <span className="list-row__icon">{archived ? <ArchiveRestore size={18} aria-hidden /> : <Archive size={18} aria-hidden />}</span>
                <span className="list-row__body strong">{archived ? 'Restore goal' : 'Archive goal'}</span>
              </button>
            </li>
            <li>
              <button type="button" className="list-row" style={{ color: 'var(--danger)' }} onClick={() => { setMenu(false); setConfirm('delete'); }}>
                <span className="list-row__icon" style={{ background: 'var(--danger-soft)', color: 'var(--danger)' }}><Trash2 size={18} aria-hidden /></span>
                <span className="list-row__body strong">Delete goal</span>
              </button>
            </li>
          </ul>
        </div>
      </Sheet>

      <ConfirmDialog
        open={confirm === 'archive'}
        title="Archive this goal?"
        body={<>It moves to the archived list. {saved > 0 ? <>The {formatLei(saved)} saved in it stays part of your total and still belongs to this goal.</> : null} You can restore it anytime.</>}
        confirmLabel="Archive"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          store.updateGoal(goal.id, { status: 'archived' });
          setConfirm(null);
          toast('Goal archived');
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Delete this goal?"
        danger
        body={<>The goal and its plan are removed. Its {history.length} {history.length === 1 ? 'entry stays' : 'entries stay'} in Activity as unallocated, so your total savings don’t change{saved > 0 ? ` (${formatLei(saved)} becomes unallocated)` : ''}. This can’t be undone.</>}
        confirmLabel="Delete goal"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          store.deleteGoal(goal.id);
          toast('Goal deleted');
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
