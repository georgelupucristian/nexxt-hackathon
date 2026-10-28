import { Archive, ArchiveRestore, MoreHorizontal, Minus, Pause, Pencil, Play, Plus, SlidersHorizontal, Star, Trash2, TrendingUp } from 'lucide-react';
import { useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { HealthPill, planLabel, TxRow } from '../components/domain';
import { MoneySheet, PlanSheet, type MoneySheetProps } from '../components/sheets';
import { BigAmount, ConfirmDialog, EmptyState, GoalGlyph, IconButton, ProgressBar, Sheet, TopBar, useToast } from '../components/ui';
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

      <section className="stack-lg" aria-labelledby="goal-name">
        <div className="row row--top">
          <GoalGlyph kind={goal.kind} size="lg" status={goal.status} />
          <div className="grow stack" style={{ gap: 6 }}>
            <h1 id="goal-name" style={{ overflowWrap: 'anywhere' }}>
              {goal.name}
            </h1>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              {goal.isPrimary && goal.status === 'active' && <span className="pill pill--info">Primary</span>}
              <HealthPill goal={goal} saved={saved} />
            </div>
          </div>
        </div>
        {goal.motivation && <p className="muted" style={{ fontStyle: 'italic' }}>“{goal.motivation}”</p>}

        <div className="stack" style={{ gap: 10 }}>
          <BigAmount value={saved} size="md" />
          <p className="muted money">
            of {formatLei(goal.target)} · {Math.round(p * 100)}%
          </p>
          <ProgressBar value={p} size="lg" label={`${goal.name} progress`} paused={goal.status !== 'active'} />
          <p className="small muted">{remaining > 0 ? `${formatLei(remaining)} to go` : 'Target reached — nice work.'}</p>
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
          <div className="action-circles">
            <button type="button" className="action-circle" onClick={() => setMoney({ open: true, mode: 'contribution', goalId: goal.id })}>
              <span className="action-circle__icon">
                <Plus size={22} aria-hidden />
              </span>
              Add
            </button>
            <button type="button" className="action-circle action-circle--light" disabled={saved <= 0} onClick={() => setMoney({ open: true, mode: 'withdrawal', goalId: goal.id })}>
              <span className="action-circle__icon">
                <Minus size={22} aria-hidden />
              </span>
              Withdraw
            </button>
            <button type="button" className="action-circle action-circle--light" onClick={() => setPlanOpen(true)}>
              <span className="action-circle__icon">
                <SlidersHorizontal size={20} aria-hidden />
              </span>
              Adjust plan
            </button>
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
