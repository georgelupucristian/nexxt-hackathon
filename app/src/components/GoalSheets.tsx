// Changing a goal after it exists: its plan (how much, how often) and its basics (name, price,
// date). Each is one short sheet with one button, and says in plain words what the change means.
import { AlertCircle } from '@/lib/icons';
import { useEffect, useState } from 'react';
import { planDay, suggestPlan } from '../data/goalPlan';
import { goalSaved, projectedFinish } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import type { Frequency, Goal, Plan } from '../data/types';
import { addDays, addMonths, formatDate, todayKey } from '../lib/dates';
import { formatLei, MAX_AMOUNT, parseLei } from '../lib/money';
import { firstCollection, maxCollect, minCollect, nextCollection } from '../lib/plan';
import { SchedulePicker } from './SchedulePicker';
import { planWhen } from './GoalSteps';
import { Sheet, useToast } from './ui';
import { AmountRuler } from './watermelon/amount-ruler';
import { FloatingInput } from './watermelon/floating-input';
import { FluidTabs } from './watermelon/fluid-tabs';

function FormError({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <div className="form-error" role="alert">
      <AlertCircle size={18} aria-hidden /> {text}
    </div>
  );
}

// ---------- the plan ----------

export function PlanSheet({ open, onClose, goal, onSaved }: { open: boolean; onClose: () => void; goal: Goal; onSaved?: () => void }) {
  const data = useData();
  const { updatePlan, money } = useStore();
  const toast = useToast();
  const saved = goalSaved(data.transactions, goal.id);
  const left = Math.max(0, goal.target - saved);
  // A Supabase account's main goal: its plan is what Stripe collects (35 to 350 lei a week, 150 to
  // 1,500 a month, lib/plan.ts), so the ruler stays inside that and "When I can" isn't offered.
  const real = !!money && goal.isPrimary;
  const fit = (f: 'weekly' | 'monthly', v: number) => (real ? Math.min(maxCollect(f), Math.max(minCollect(f), v)) : v);
  const [frequency, setFrequency] = useState<Frequency>(goal.plan.frequency);
  const [amount, setAmount] = useState(goal.plan.amount);
  const [pickedDay, setPickedDay] = useState<number | null>(goal.plan.day);
  const [error, setError] = useState<string | null>(null);

  const dated = !!goal.targetDate && goal.targetDate > todayKey();
  const onTime = (f: 'weekly' | 'monthly') => fit(f, suggestPlan(left, dated ? goal.targetDate : null, f).amount);

  useEffect(() => {
    if (!open) return;
    const f = real && goal.plan.frequency === 'flexible' ? 'monthly' : goal.plan.frequency;
    setFrequency(f);
    setAmount(f === 'flexible' ? goal.plan.amount : goal.plan.amount > 0 ? fit(f, goal.plan.amount) : onTime(f));
    setPickedDay(f === goal.plan.frequency ? goal.plan.day : null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal]);

  const fixed = frequency !== 'flexible';
  const day = fixed ? (pickedDay ?? planDay(frequency)) : null;
  const plan: Plan = { amount: fixed ? amount : 0, frequency, day };
  // the one day everything says: the next deposit on this schedule (a plan not started yet at
  // Stripe starts the way payments.start does)
  const today = money?.today ?? todayKey();
  const next = fixed && day !== null ? (real && !money.running ? firstCollection(today, frequency, day) : nextCollection(today, frequency, day)) : null;
  const finish = fixed && amount > 0 ? projectedFinish(plan, saved, goal.target) : null;
  const late = !!(finish && dated && finish > goal.targetDate!);
  const fix = fixed && dated ? onTime(frequency) : null;

  function save() {
    try {
      updatePlan(goal.id, plan);
      toast(
        fixed && next
          ? `New plan: ${formatLei(amount)} ${planWhen(plan)}. Next deposit ${formatDate(next)}.`
          : 'New plan: you save when you can.',
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Couldn\'t save the plan.');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Change plan">
      <div className="stack-lg planedit">
        {real ? (
          <SchedulePicker
            frequency={frequency === 'weekly' ? 'weekly' : 'monthly'}
            day={day ?? 1}
            onChange={(f, d) => {
              if (f !== frequency) setAmount(onTime(f));
              setFrequency(f);
              setPickedDay(d);
            }}
          />
        ) : (
          <>
            <FluidTabs
              label="How often"
              value={frequency}
              onChange={(f) => {
                setFrequency(f);
                setPickedDay(null);
                if (f !== 'flexible') setAmount(onTime(f));
              }}
              tabs={[
                { id: 'weekly', label: 'Every week' },
                { id: 'monthly', label: 'Every month' },
                { id: 'flexible' as const, label: 'When I can' },
              ]}
            />
            {fixed && <SchedulePicker frequency={frequency} day={day ?? 1} onChange={(f, d) => (setFrequency(f), setPickedDay(d))} dayOnly />}
          </>
        )}
        {fixed ? (
          <>
            <AmountRuler
              label={frequency === 'weekly' ? 'How much each week' : 'How much each month'}
              value={Math.max(1_00, amount)}
              onChange={(v) => setAmount(fit(frequency, v))}
              step={1_00}
              min={real ? minCollect(frequency) : 1_00}
              max={real ? maxCollect(frequency) : Math.max(frequency === 'weekly' ? 1_500_00 : 5_000_00, amount * 2, (fix ?? 0) * 2)}
            />
            <p className={`planedit__why ${late ? 'planedit__why--late' : ''}`} aria-live="polite">
              {left <= 0
                ? 'You\'ve already saved the full amount. Nice work.'
                : finish
                  ? late
                    ? `You save ${planWhen(plan)} and get there around ${formatDate(finish)}, after your date (${formatDate(goal.targetDate!)}).`
                    : `You save ${planWhen(plan)} and have ${formatLei(goal.target)} around ${formatDate(finish)}.`
                  : ''}
              {next && left > 0 ? ` Next deposit: ${formatDate(next)}.` : ''}
            </p>
            {late && fix !== null && fix !== amount && (
              <button type="button" className="planpv__edit planedit__fix" onClick={() => setAmount(fix)}>
                To make it on time: {formatLei(fix)}
              </button>
            )}
          </>
        ) : (
          <p className="planedit__why">No fixed amount. You save when you can, and Kip keeps count.</p>
        )}
        <FormError text={error} />
        <button type="button" className="btn btn--primary btn--block btn--xl" onClick={save}>
          Save plan
        </button>
      </div>
    </Sheet>
  );
}

// ---------- name, price, date ----------

export function EditGoalSheet({ open, onClose, goal }: { open: boolean; onClose: () => void; goal: Goal }) {
  const { updateGoal } = useStore();
  const toast = useToast();
  const [name, setName] = useState(goal.name);
  const [target, setTarget] = useState('');
  const [dated, setDated] = useState(!!goal.targetDate);
  const [date, setDate] = useState(goal.targetDate ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(goal.name);
    setTarget(String(goal.target / 100).replace('.', ','));
    setDated(!!goal.targetDate);
    setDate(goal.targetDate ?? '');
    setError(null);
  }, [open, goal]);

  function save() {
    const t = parseLei(target);
    if (!name.trim()) return setError('Give your goal a name.');
    if (t === null || t <= 0) return setError('Enter what it costs, like 1500.');
    if (t > MAX_AMOUNT) return setError('That looks too big. Check for an extra digit.');
    if (dated && (!date || (date <= todayKey() && date !== goal.targetDate))) return setError('Pick a future day or "No deadline".');
    try {
      updateGoal(goal.id, { name: name.trim(), target: t, targetDate: dated ? date : null });
      toast('Goal updated.');
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Couldn\'t save.');
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Edit goal">
      <form
        className="stack-lg"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <FloatingInput label="Name" maxLength={48} value={name} onChange={(e) => setName(e.target.value)} />
        <FloatingInput label="Price (lei)" inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))} />
        <div className="stack" style={{ gap: 8 }}>
          <p className="saves__label">By when</p>
          <div className="chip-row" role="radiogroup" aria-label="By when">
            <button type="button" role="radio" aria-checked={!dated} className="chip" onClick={() => setDated(false)}>
              No deadline
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={dated}
              className="chip"
              onClick={() => {
                setDated(true);
                if (!date) setDate(addMonths(todayKey(), 6));
              }}
            >
              By a date
            </button>
          </div>
          {dated && <FloatingInput label="Date" type="date" min={addDays(todayKey(), 1)} value={date} onChange={(e) => setDate(e.target.value)} />}
        </div>
        <FormError text={error} />
        <button type="submit" className="btn btn--primary btn--block btn--xl">
          Save
        </button>
      </form>
    </Sheet>
  );
}
