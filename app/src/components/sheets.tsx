import { AlertCircle, FlaskConical } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type FormEvent } from 'react';
import { available, bestStreak, currentStreak, goalSaved, primaryGoal, progress, projectedFinish, requiredPace } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import type { Frequency, Goal, Plan, Transaction } from '../data/types';
import { formatDate, formatDay, ordinal, todayKey } from '../lib/dates';
import { formatLei, parseLei } from '../lib/money';
import { planLabel } from './domain';
import { Banner, Button, DayPicker, Field, ProgressBar, Segmented, Sheet, TextField, useToast } from './ui';

// ---------- Add / withdraw / edit money ----------

export interface MoneySheetProps {
  open: boolean;
  onClose: () => void;
  mode?: Transaction['type'];
  goalId?: string | null;
  presetAmount?: number;
  editing?: Transaction;
}

export function MoneySheet({ open, onClose, mode = 'contribution', goalId = null, presetAmount, editing }: MoneySheetProps) {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const amountId = useId();
  const [type, setType] = useState<Transaction['type']>(mode);
  const [raw, setRaw] = useState('');
  const [target, setTarget] = useState<string>('');
  const [date, setDate] = useState(todayKey());
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);

  // Reset the form each time the sheet opens so stale input never leaks between uses.
  useEffect(() => {
    if (!open) return;
    setType(editing?.type ?? mode);
    setRaw(editing ? String(editing.amount / 100).replace('.', ',') : presetAmount ? String(presetAmount / 100).replace('.', ',') : '');
    setTarget((editing ? editing.goalId : goalId) ?? 'none');
    setDate(editing?.date ?? todayKey());
    setNote(editing?.note ?? '');
    setError(null);
    setTouched(false);
    setBusy(false);
  }, [open, editing, mode, goalId, presetAmount]);

  const buckets = useMemo(() => data.goals.filter((g) => g.status !== 'archived' || g.id === editing?.goalId), [data.goals, editing]);
  const bucketId = target === 'none' ? null : target;
  const amount = parseLei(raw);
  const max = type === 'withdrawal' ? available(data.transactions, bucketId, editing?.id) : null;
  const isDemo = data.tracking === 'demo' && !editing;

  const amountError = !touched
    ? null
    : amount === null
      ? 'Enter an amount, like 50 or 50,50.'
      : amount <= 0
        ? 'Enter an amount greater than 0.'
        : max !== null && amount > max
          ? `Only ${formatLei(max)} available in ${bucketId ? 'this goal' : 'unallocated savings'}.`
          : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (amount === null || amount <= 0 || (max !== null && amount > max)) return;
    setBusy(true);
    try {
      const input = { type, amount, goalId: bucketId, date, note };
      if (editing) {
        store.editTransaction(editing.id, input);
        toast('Entry updated');
      } else {
        store.addTransaction(input);
        toast(
          isDemo
            ? 'Simulated transfer started — pending until the next sync'
            : type === 'contribution'
              ? `${formatLei(amount)} recorded`
              : `${formatLei(amount)} withdrawal recorded`,
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Something went wrong. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? 'Edit entry' : type === 'contribution' ? (isDemo ? 'Add money' : 'Record savings') : 'Record withdrawal';
  const quick = [25_00, 50_00, 100_00];
  const plannedGoal = bucketId ? data.goals.find((g) => g.id === bucketId) : null;
  if (plannedGoal && plannedGoal.plan.amount > 0 && !quick.includes(plannedGoal.plan.amount)) quick.unshift(plannedGoal.plan.amount);

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <form className="stack-lg" onSubmit={submit} noValidate>
        {!editing && (
          <Segmented
            label="Type"
            value={type}
            onChange={(v) => {
              setType(v);
              setTouched(false);
            }}
            options={[
              { value: 'contribution', label: 'Add' },
              { value: 'withdrawal', label: 'Withdraw' },
            ]}
          />
        )}

        <div className="amount-entry">
          <label htmlFor={amountId} className="small muted">
            {type === 'contribution' ? 'Amount saved' : 'Amount taken out'}
          </label>
          <div className="row" style={{ gap: 8, justifyContent: 'center', width: '100%' }}>
            <input
              id={amountId}
              data-autofocus
              inputMode="decimal"
              autoComplete="off"
              placeholder="0"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))}
              onBlur={() => raw && setTouched(true)}
              aria-invalid={amountError ? true : undefined}
              className="money"
              style={{
                width: `${Math.max(2, raw.length + 0.5)}ch`,
                maxWidth: '100%',
                border: 0,
                background: 'transparent',
                fontSize: '3.25rem',
                fontWeight: 750,
                letterSpacing: '-0.03em',
                textAlign: 'right',
                padding: 0,
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 'var(--fs-xl)', fontWeight: 650, color: 'var(--ink-3)' }}>lei</span>
          </div>
          {max !== null && <p className="small subtle">{formatLei(max)} available</p>}
          {amountError && (
            <p className="field-error" role="alert">
              <AlertCircle size={16} aria-hidden /> {amountError}
            </p>
          )}
          <div className="quick-amounts">
            {quick.slice(0, 4).map((q) => (
              <button key={q} type="button" className="chip" onClick={() => setRaw(String(q / 100))}>
                {formatLei(q)}
              </button>
            ))}
          </div>
        </div>

        <Field label={type === 'contribution' ? 'Put it towards' : 'Take it from'} htmlFor="bucket">
          <select id="bucket" className="select" value={target} onChange={(e) => setTarget(e.target.value)}>
            {buckets.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {type === 'withdrawal' ? ` — ${formatLei(available(data.transactions, g.id, editing?.id))}` : ''}
                {g.status === 'paused' ? ' (paused)' : ''}
              </option>
            ))}
            <option value="none">Unallocated{type === 'withdrawal' ? ` — ${formatLei(available(data.transactions, null, editing?.id))}` : ''}</option>
          </select>
        </Field>

        <div className="btn-row" style={{ alignItems: 'flex-start' }}>
          <TextField label="Date" type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} />
        </div>
        <TextField label={<>Note <span className="subtle">(optional)</span></>} placeholder={type === 'contribution' ? 'e.g. Part of my tutoring pay' : 'e.g. Train ticket home'} value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} />

        {isDemo && (
          <Banner tone="demo" icon={FlaskConical}>
            Demo connection: this creates a <strong>simulated</strong> transfer. No real money moves. It stays pending until the next sync.
          </Banner>
        )}
        {!isDemo && !editing && <p className="small subtle">You’re recording money you already set aside yourself. Kept doesn’t move money.</p>}
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {error}
          </div>
        )}
        <Button type="submit" variant="primary" block loading={busy}>
          {editing ? 'Save changes' : type === 'contribution' ? (isDemo ? 'Start simulated transfer' : 'Record contribution') : 'Record withdrawal'}
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Plan editor ----------

export function PlanForm({
  goal,
  plan,
  onChange,
  saved = 0,
  target,
  targetDate,
}: {
  goal?: Goal;
  plan: { amount: string; frequency: Frequency; day: number | null };
  onChange: (p: { amount: string; frequency: Frequency; day: number | null }) => void;
  saved?: number;
  target: number | null;
  targetDate: string | null;
}) {
  const amount = parseLei(plan.amount);
  const pace = target && targetDate && targetDate > todayKey() ? requiredPace(saved, target, targetDate) : null;
  const finish =
    target && amount && amount > 0 && plan.frequency !== 'flexible'
      ? projectedFinish({ amount, frequency: plan.frequency, day: plan.day }, saved, target)
      : null;
  return (
    <div className="stack-lg">
      <Field label="How often?">
        <Segmented
          label="Frequency"
          value={plan.frequency}
          onChange={(f) => onChange({ ...plan, frequency: f, day: f === 'weekly' ? (plan.day !== null && plan.day <= 6 ? plan.day : 4) : f === 'monthly' ? 1 : null })}
          options={[
            { value: 'weekly', label: 'Weekly' },
            { value: 'monthly', label: 'Monthly' },
            { value: 'flexible', label: 'Flexible' },
          ]}
        />
      </Field>
      <TextField
        label={plan.frequency === 'flexible' ? <>Rough amount each time <span className="subtle">(optional)</span></> : plan.frequency === 'weekly' ? 'Amount each week' : 'Amount each month'}
        inputMode="decimal"
        suffix="lei"
        placeholder={pace ? String(Math.ceil((plan.frequency === 'monthly' ? pace.perMonth : pace.perWeek) / 100)) : '50'}
        value={plan.amount}
        onChange={(e) => onChange({ ...plan, amount: e.target.value.replace(/[^\d.,]/g, '').slice(0, 10) })}
      />
      {plan.frequency === 'weekly' && (
        <Field label="Preferred day">
          <DayPicker value={plan.day} onChange={(d) => onChange({ ...plan, day: d })} />
        </Field>
      )}
      {plan.frequency === 'monthly' && (
        <Field label="Day of the month" htmlFor="dom" hint="Days 1–28 so the date exists in every month.">
          <select id="dom" className="select" value={plan.day ?? 1} onChange={(e) => onChange({ ...plan, day: Number(e.target.value) })}>
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {ordinal(d)}
              </option>
            ))}
          </select>
        </Field>
      )}
      {pace && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="label">To reach {formatLei(target!)} by {formatDate(targetDate!)} you’d need about</p>
          <div className="calc">
            <div>
              <strong>{formatLei(pace.perWeek)}</strong>
              <span className="small muted">a week</span>
            </div>
            <div>
              <strong>{formatLei(pace.perMonth)}</strong>
              <span className="small muted">a month</span>
            </div>
          </div>
        </div>
      )}
      {finish && (
        <p className="small muted">
          At this pace you’d reach {goal ? 'the' : 'your'} target around <strong>{formatDate(finish)}</strong>
          {targetDate && finish > targetDate ? ' — after your target date. That’s fine; you can change either one later.' : '.'}
        </p>
      )}
      <p className="small subtle">Estimates assume every planned contribution happens and nothing is withdrawn. A plan is a guide, not an obligation — change it whenever your budget changes.</p>
    </div>
  );
}

export function PlanSheet({ open, onClose, goal, onSaved }: { open: boolean; onClose: () => void; goal: Goal; onSaved?: () => void }) {
  const data = useData();
  const { updatePlan, updateGoal } = useStore();
  const toast = useToast();
  const [plan, setPlan] = useState({ amount: '', frequency: goal.plan.frequency, day: goal.plan.day });
  const [targetDate, setTargetDate] = useState(goal.targetDate ?? '');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setPlan({ amount: goal.plan.amount ? String(goal.plan.amount / 100).replace('.', ',') : '', frequency: goal.plan.frequency, day: goal.plan.day });
    setTargetDate(goal.targetDate ?? '');
    setError(null);
  }, [open, goal]);
  const saved = goalSaved(data.transactions, goal.id);

  function save(e: FormEvent) {
    e.preventDefault();
    const amount = plan.amount ? parseLei(plan.amount) : 0;
    if (amount === null || (plan.frequency !== 'flexible' && (!amount || amount <= 0))) {
      setError('Enter a contribution amount greater than 0, or choose Flexible.');
      return;
    }
    if (targetDate && targetDate <= todayKey()) {
      setError('Pick a target date in the future, or clear it.');
      return;
    }
    try {
      const next: Plan = { amount, frequency: plan.frequency, day: plan.frequency === 'flexible' ? null : plan.day };
      updatePlan(goal.id, next);
      if ((goal.targetDate ?? '') !== targetDate) updateGoal(goal.id, { targetDate: targetDate || null });
      toast('Plan updated');
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Could not save the plan.');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Adjust plan">
      <form className="stack-lg" onSubmit={save} noValidate>
        <PlanForm goal={goal} plan={plan} onChange={setPlan} saved={saved} target={goal.target} targetDate={targetDate || null} />
        <TextField label={<>Target date <span className="subtle">(optional)</span></>} type="date" min={todayKey()} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {error}
          </div>
        )}
        <Button type="submit" variant="primary" block>
          Save plan
        </Button>
      </form>
    </Sheet>
  );
}

// ---------- Check-in ----------

export function CheckInSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { checkIn } = useStore();
  const toast = useToast();
  const [adjust, setAdjust] = useState(false);
  const goal = primaryGoal(data.goals);
  if (!goal) return null;
  const saved = goalSaved(data.transactions, goal.id);
  const finish = projectedFinish(goal.plan, saved, goal.target);
  return (
    <>
      <Sheet open={open && !adjust} onClose={onClose} title="Review your plan">
        <div className="stack-lg">
          <div className="card stack">
            <div className="row row--between">
              <h3 className="truncate">{goal.name}</h3>
              <span className="small muted money">{Math.round(progress(saved, goal.target) * 100)}%</span>
            </div>
            <ProgressBar value={progress(saved, goal.target)} label="Progress" />
            <dl style={{ margin: 0 }}>
              <div className="kv">
                <dt>Saved</dt>
                <dd className="money">
                  {formatLei(saved)} of {formatLei(goal.target)}
                </dd>
              </div>
              <div className="kv">
                <dt>Plan</dt>
                <dd>{planLabel(goal.plan)}</dd>
              </div>
              {finish && (
                <div className="kv">
                  <dt>Estimated finish</dt>
                  <dd>{formatDate(finish)}</dd>
                </div>
              )}
              {goal.targetDate && (
                <div className="kv">
                  <dt>Target date</dt>
                  <dd>{formatDate(goal.targetDate)}</dd>
                </div>
              )}
            </dl>
          </div>
          <p className="muted">Does this plan still fit your budget this week? Either answer counts as today’s check-in.</p>
          <div className="stack">
            <Button
              variant="primary"
              block
              onClick={() => {
                checkIn();
                toast('Checked in — plan confirmed');
                onClose();
              }}
            >
              Yes, it still works
            </Button>
            <Button block onClick={() => setAdjust(true)}>
              Adjust my plan
            </Button>
          </div>
        </div>
      </Sheet>
      <PlanSheet
        open={open && adjust}
        goal={goal}
        onClose={() => {
          setAdjust(false);
          onClose();
        }}
        onSaved={() => checkIn()}
      />
    </>
  );
}

// ---------- Streak rules ----------

export function StreakSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const data = useData();
  const { togglePause } = useStore();
  const today = todayKey();
  const paused = data.pausedDays.includes(today);
  const doneToday = data.actions.some((a) => a.date === today);
  return (
    <Sheet open={open} onClose={onClose} title="How streaks work">
      <div className="stack-lg">
        <div className="row" style={{ gap: 'var(--s-6)' }}>
          <div className="stat">
            <span className="small muted">Current</span>
            <strong className="money" style={{ fontSize: 'var(--fs-xl)' }}>
              {currentStreak(data)} days
            </strong>
          </div>
          <div className="stat">
            <span className="small muted">Best</span>
            <strong className="money" style={{ fontSize: 'var(--fs-xl)' }}>
              {bestStreak(data)} days
            </strong>
          </div>
        </div>
        <StreakRules />
        <div className="card card--tint stack">
          <h3>Need a break?</h3>
          <p className="small muted">Mark today as a break day. It won’t count, and it won’t end your streak. Your savings are never affected.</p>
          <Button
            size="sm"
            disabled={doneToday && !paused}
            onClick={() => togglePause(today)}
            style={{ alignSelf: 'flex-start' }}
          >
            {paused ? 'Undo break for today' : 'Take today off'}
          </Button>
          {doneToday && !paused && <p className="xs subtle">You already did a savings action today ({formatDay(today)}).</p>}
        </div>
      </div>
    </Sheet>
  );
}

export function StreakRules() {
  return (
    <div className="stack">
      <ul className="check-list small">
        <li>
          <strong>A day is complete</strong> when you record a contribution or do a plan check-in. Just opening the app doesn’t count.
        </li>
        <li>
          <strong>Streaks measure consistency, not money.</strong> A streak never adds to your balance, and missing a day never removes savings.
        </li>
        <li>
          <strong>Missed a day?</strong> Your streak starts again from your next action. Your best streak and all your savings stay.
        </li>
        <li>
          <strong>Break days</strong> pause the streak without breaking it — for exams, holidays or tight weeks.
        </li>
      </ul>
      <div className="legend" aria-label="Legend">
        <span>
          <i style={{ background: 'var(--accent)' }} /> Done
        </span>
        <span>
          <i style={{ border: '2px solid var(--ink)' }} /> Today
        </span>
        <span>
          <i style={{ background: 'var(--surface-2)', border: '1.5px solid var(--line-strong)' }} /> Missed
        </span>
        <span>
          <i style={{ background: 'var(--info-soft)', border: '1.5px solid var(--info)' }} /> Break
        </span>
        <span>
          <i style={{ border: '1.5px dashed var(--line-strong)' }} /> Upcoming
        </span>
      </div>
    </div>
  );
}
