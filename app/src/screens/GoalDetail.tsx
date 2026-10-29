import { Archive, ArchiveRestore, ChevronRight, Minus, Pause, Pencil, Play, Plus, Sparkles, Star, Trash2, TrendingUp, type LucideIcon } from '@/lib/icons';
import NumberFlow from '@number-flow/react';
import { motion } from 'motion/react';
import { useState, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { GoalTile, HealthPill, planLabel, TxRow } from '../components/domain';
import { EditGoalSheet, PlanSheet } from '../components/GoalSheets';
import { GoalIconPicker } from '../components/GoalIconPicker';
import { SaveSheet, WithdrawSheet } from '../components/MoneySheets';
import { RealSaveSheet, RealWithdrawSheet } from '../components/money';
import { ConfirmDialog, EmptyState, TopBar, useToast } from '../components/ui';
import { goalSaved, nextDueDate, paidToday, progress, projectedFinish, sortTx } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import { formatDate, formatDay } from '../lib/dates';
import { formatLei } from '../lib/money';

type SheetId = 'add' | 'withdraw' | 'plan' | 'edit' | 'icon';

/**
 * One goal. Everything you can do with it is on the page, in plain words: the two money buttons
 * under the gauge ("Deposit" opens the same sheet as home's "Save money"), "Change plan"
 * under the plan, and the rest (edit, pause, archive, delete) in a list at the bottom
 * instead of behind a "…" menu. Archive and delete ask first, in plain words. A Supabase account
 * moves real money (Stripe test mode): the same two buttons open the real save and withdraw sheets,
 * and a plan change on the main goal changes what Stripe collects.
 */
export function GoalDetail() {
  const { id } = useParams();
  const location = useLocation();
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const nav = useNavigate();
  // /goals/:id/edit (old links) lands here with the edit sheet already open
  const [sheet, setSheet] = useState<SheetId | null>(() => ((location.state as { edit?: boolean } | null)?.edit ? 'edit' : null));
  const [confirm, setConfirm] = useState<null | 'archive' | 'delete'>(null);

  const goal = data.goals.find((g) => g.id === id);
  if (!goal) return <Navigate to="/goals" replace />;

  const saved = goalSaved(data.transactions, goal.id);
  const p = progress(saved, goal.target);
  const remaining = Math.max(0, goal.target - saved);
  // once today's planned deposit is in, the next one is the following period (and it isn't counted twice)
  const next = goal.status === 'active' ? nextDueDate(goal, data.transactions) : null;
  const finish = goal.status === 'active' ? projectedFinish(goal.plan, saved, goal.target, undefined, paidToday(data.transactions, goal.id)) : null;
  const history = sortTx(data.transactions.filter((t) => t.goalId === goal.id));
  const archived = goal.status === 'archived';
  const close = () => setSheet(null);

  const pause = () => {
    store.updateGoal(goal.id, { status: 'paused' });
    toast('Paused. The money stays here.');
  };
  const resume = () => {
    store.updateGoal(goal.id, { status: 'active' });
    toast(archived ? 'Back from the archive.' : 'Resumed. Your plan carries on.');
  };

  return (
    <div className="screen">
      <TopBar title="Goal" />

      <section className={`goal-hero goal-hero--${goal.kind}`} aria-labelledby="goal-name">
        <GoalGauge pct={p} paused={goal.status !== 'active'}>
          <button type="button" className="goal-icon-btn" onClick={() => setSheet('icon')} aria-label="Change the goal's icon">
            <GoalTile goal={goal} size={72} />
            <span className="goal-icon-btn__edit" aria-hidden>
              <Pencil size={14} />
            </span>
          </button>
          <div className="goal-hero__amount">
            <NumberFlow value={saved / 100} locales="en-GB" format={{ maximumFractionDigits: 2 }} className="goal-hero__num" />
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
            {goal.isPrimary && goal.status === 'active' && <span className="pill pill--info">Main</span>}
            <HealthPill goal={goal} saved={saved} />
          </div>
          <p className="small muted">{remaining > 0 ? `${formatLei(remaining)} to go` : 'Target reached. Well done!'}</p>
          {goal.motivation && <p className="muted" style={{ fontStyle: 'italic' }}>“{goal.motivation}”</p>}
        </div>

        {goal.status === 'paused' && (
          <div className="banner">
            <Pause size={18} aria-hidden />
            <div className="grow">It's paused. The money you saved stays here, and the plan waits.</div>
            <button type="button" className="banner__action" onClick={resume}>
              Resume
            </button>
          </div>
        )}

        {!archived && (
          <div className="goal-hero__actions">
            {/* the money pair: "Deposit" in gold, "Withdraw" outlined and always in view (it just
                can't be pressed while there's nothing in the goal to take out) */}
            <motion.button type="button" className="btn btn--primary btn--xl grow" whileTap={{ scale: 0.97 }} onClick={() => setSheet('add')}>
              <Plus size={20} aria-hidden /> Deposit
            </motion.button>
            <motion.button type="button" className="btn btn--secondary btn--xl grow" whileTap={saved > 0 ? { scale: 0.97 } : undefined} disabled={saved <= 0} aria-describedby={saved > 0 ? undefined : 'nothing-out'} onClick={() => setSheet('withdraw')}>
              <Minus size={20} aria-hidden /> Withdraw
            </motion.button>
          </div>
        )}
        {!archived && saved <= 0 && (
          <p id="nothing-out" className="xs subtle" style={{ textAlign: 'center' }}>
            You can withdraw once you've put something in.
          </p>
        )}
      </section>

      <section className="card goal-plan" aria-labelledby="plan-h">
        <h2 id="plan-h" className="goal-plan__title">
          Your plan
        </h2>
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>How much and when</dt>
            <dd>{goal.status === 'paused' ? `Paused (${planLabel(goal.plan)})` : planLabel(goal.plan)}</dd>
          </div>
          {next && remaining > 0 && (
            <div className="kv">
              <dt>Next deposit</dt>
              <dd>
                {formatLei(goal.plan.amount)} · {formatDay(next)}
              </dd>
            </div>
          )}
          <div className="kv">
            <dt>Deadline</dt>
            <dd>{goal.targetDate ? formatDate(goal.targetDate) : 'No deadline'}</dd>
          </div>
          {finish && remaining > 0 && (
            <div className="kv">
              <dt>You get there around</dt>
              <dd>{formatDate(finish)}</dd>
            </div>
          )}
        </dl>
        {finish && goal.targetDate && finish > goal.targetDate && remaining > 0 && (
          <p className="small muted">At this pace you finish after the deadline. You can put in a bit more or move the date. Either is fine.</p>
        )}
        {!archived && (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => setSheet('plan')}>
            Change plan
          </button>
        )}
      </section>

      <section className="section" aria-labelledby="more-h">
        <h2 id="more-h" className="group-label">
          More
        </h2>
        <div className="card card--flush">
          <ul className="list">
            {!archived && <Row icon={Pencil} title="Edit the name, amount or date" onClick={() => setSheet('edit')} />}
            {!archived && <Row icon={Sparkles} title="Change the icon" onClick={() => setSheet('icon')} />}
            {goal.status === 'active' && !goal.isPrimary && (
              <Row
                icon={Star}
                title="Make it your main goal"
                sub="Kip suggests it first when you put money aside."
                onClick={() => {
                  store.setPrimary(goal.id);
                  toast("It's your main goal now.");
                }}
              />
            )}
            {goal.status === 'active' && <Row icon={Pause} title="Pause" sub="The money stays here and the plan stands still. Resume it anytime." onClick={pause} />}
            {goal.status === 'paused' && <Row icon={Play} title="Resume the goal" onClick={resume} />}
            {archived ? <Row icon={ArchiveRestore} title="Bring back from the archive" onClick={resume} /> : <Row icon={Archive} title="Archive" sub="Hides it from the list. You can bring it back anytime." onClick={() => setConfirm('archive')} />}
            <Row icon={Trash2} title="Delete the goal" danger onClick={() => setConfirm('delete')} />
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="hist-h">
        <h2 id="hist-h" className="group-label">
          History
        </h2>
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
            <EmptyState icon={TrendingUp} title="No deposits yet" body="Your first deposit doesn't have to be big. Any amount counts." />
          )}
        </div>
      </section>

      <ConfirmDialog
        open={confirm === 'archive'}
        title={`Archive “${goal.name}”?`}
        body={<>It won't show on Home or among your active goals. {saved > 0 ? `The ${formatLei(saved)} you saved stays with it. ` : ''}You can bring it back from the archive anytime.</>}
        confirmLabel="Yes, archive"
        cancelLabel="No, leave it"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          store.updateGoal(goal.id, { status: 'archived' });
          setConfirm(null);
          toast("Archived. You'll find it in Goals, under Archived.");
        }}
      />
      <ConfirmDialog
        open={confirm === 'delete'}
        title={`Delete “${goal.name}”?`}
        danger
        body={<>The goal and its plan go away. {saved > 0 ? `The ${formatLei(saved)} you saved isn't lost: it stays in your savings, without a goal. ` : ''}You can't undo this.</>}
        confirmLabel="Yes, delete it"
        cancelLabel="No, keep it"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          try {
            store.deleteGoal(goal.id);
            toast('Goal deleted.');
            nav('/goals', { replace: true });
          } catch (e) {
            // a cloud goal that money already went into can't be deleted, only archived
            setConfirm(null);
            toast(e instanceof ActionError ? e.message : "We couldn't delete the goal.", 'error');
          }
        }}
      />
      {/* a Supabase account moves real (Stripe test) money; the local and demo ones record it */}
      {store.money ? (
        <>
          <RealSaveSheet open={sheet === 'add'} onClose={close} />
          <RealWithdrawSheet open={sheet === 'withdraw'} onClose={close} />
        </>
      ) : (
        <>
          <SaveSheet open={sheet === 'add'} onClose={close} goalId={goal.id} />
          <WithdrawSheet open={sheet === 'withdraw'} onClose={close} goalId={goal.id} />
        </>
      )}
      <PlanSheet open={sheet === 'plan'} onClose={close} goal={goal} />
      <EditGoalSheet open={sheet === 'edit'} onClose={close} goal={goal} />
      <GoalIconPicker goal={goal} open={sheet === 'icon'} onClose={close} />
    </div>
  );
}

function Row({ icon: Icon, title, sub, danger, onClick }: { icon: LucideIcon; title: string; sub?: string; danger?: boolean; onClick: () => void }) {
  return (
    <li>
      <button type="button" className={`list-row ${danger ? 'list-row--danger' : ''}`} onClick={onClick}>
        <span className="list-row__icon">
          <Icon size={18} aria-hidden />
        </span>
        <span className="list-row__body">
          <span className="strong">{title}</span>
          {sub && <span className="small subtle">{sub}</span>}
        </span>
        <ChevronRight size={18} className="subtle" aria-hidden />
      </button>
    </li>
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
            <stop offset="0" style={{ stopColor: "#5fc59f" }} />
            <stop offset="1" style={{ stopColor: "var(--progress)" }} />
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
