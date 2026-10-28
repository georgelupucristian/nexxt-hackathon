import { AlertCircle } from '@/lib/icons';
import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { PlanForm } from '../components/sheets';
import { Button, Field, GOAL_ICON, TextField, TopBar, useToast } from '../components/ui';
import { ActionError, useData, useStore } from '../data/store';
import type { Frequency, GoalKind } from '../data/types';
import { todayKey } from '../lib/dates';
import { MAX_AMOUNT, parseLei } from '../lib/money';

const KINDS: { kind: GoalKind; label: string }[] = [
  { kind: 'emergency', label: 'Emergency' },
  { kind: 'tech', label: 'Tech' },
  { kind: 'travel', label: 'Travel' },
  { kind: 'custom', label: 'Other' },
];

export function GoalEditor() {
  const { id } = useParams();
  const data = useData();
  const { createGoal, updateGoal } = useStore();
  const toast = useToast();
  const nav = useNavigate();
  const existing = id ? data.goals.find((g) => g.id === id) : undefined;

  const [kind, setKind] = useState<GoalKind>(existing?.kind ?? 'custom');
  const [name, setName] = useState(existing?.name ?? '');
  const [target, setTarget] = useState(existing ? String(existing.target / 100).replace('.', ',') : '');
  const [targetDate, setTargetDate] = useState(existing?.targetDate ?? '');
  const [motivation, setMotivation] = useState(existing?.motivation ?? '');
  const [plan, setPlan] = useState<{ amount: string; frequency: Frequency; day: number | null }>({ amount: '', frequency: 'weekly', day: 4 });
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (id && !existing) return <Navigate to="/goals" replace />;

  const targetB = parseLei(target);

  function submit(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Give your goal a name.';
    if (targetB === null || targetB <= 0) errs.target = 'Enter a target amount, like 1500.';
    else if (targetB > MAX_AMOUNT) errs.target = 'That amount looks too large.';
    if (targetDate && targetDate <= todayKey() && targetDate !== existing?.targetDate) errs.targetDate = 'Pick a date in the future, or leave it empty.';
    const planAmount = plan.amount ? parseLei(plan.amount) : 0;
    if (!existing && (planAmount === null || (plan.frequency !== 'flexible' && planAmount <= 0))) errs.plan = 'Enter a plan amount, or choose Flexible.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      if (existing) {
        updateGoal(existing.id, { kind, name: name.trim(), target: targetB!, targetDate: targetDate || null, motivation: motivation.trim() });
        toast('Goal updated');
        nav(`/goals/${existing.id}`, { replace: true });
      } else {
        const g = createGoal({
          kind,
          name,
          target: targetB!,
          targetDate: targetDate || null,
          motivation: motivation.trim(),
          plan: { amount: planAmount ?? 0, frequency: plan.frequency, day: plan.frequency === 'flexible' ? null : plan.day },
        });
        toast('Goal created');
        nav(`/goals/${g.id}`, { replace: true });
      }
    } catch (err) {
      setErrors({ form: err instanceof ActionError ? err.message : 'Could not save the goal.' });
    }
  }

  return (
    <div className="screen">
      <TopBar title={existing ? 'Edit goal' : 'New goal'} />
      <form className="stack-lg" onSubmit={submit} noValidate>
        <Field label="Type">
          <div className="options" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }} role="radiogroup" aria-label="Goal type">
            {KINDS.map((k) => {
              const Icon = GOAL_ICON[k.kind];
              return (
                <button key={k.kind} type="button" role="radio" aria-checked={kind === k.kind} className="option" style={{ minHeight: 84, alignItems: 'center', padding: 'var(--s-3) var(--s-2)', gap: 6 }} onClick={() => setKind(k.kind)}>
                  <Icon size={22} aria-hidden />
                  <span className="small strong">{k.label}</span>
                </button>
              );
            })}
          </div>
        </Field>
        <TextField label="Name" value={name} maxLength={48} error={errors.name} placeholder="e.g. Summer in Lisbon" onChange={(e) => setName(e.target.value)} />
        <TextField label="Target amount" inputMode="decimal" suffix="lei" value={target} error={errors.target} placeholder="1500" onChange={(e) => setTarget(e.target.value.replace(/[^\d.,]/g, '').slice(0, 12))} />
        <TextField label={<>Target date <span className="subtle">(optional)</span></>} type="date" min={todayKey()} value={targetDate} error={errors.targetDate} onChange={(e) => setTargetDate(e.target.value)} />
        <Field label={<>Why it matters <span className="subtle">(optional)</span></>} htmlFor="mot">
          <textarea id="mot" className="textarea" maxLength={120} value={motivation} onChange={(e) => setMotivation(e.target.value)} />
        </Field>
        {!existing && (
          <section className="stack-lg" style={{ paddingTop: 'var(--s-2)', borderTop: 'var(--border)' }}>
            <h2 style={{ paddingTop: 'var(--s-4)' }}>Savings plan</h2>
            <PlanForm plan={plan} onChange={setPlan} target={targetB} targetDate={targetDate || null} />
            {errors.plan && <p className="field-error" role="alert">{errors.plan}</p>}
          </section>
        )}
        {errors.form && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {errors.form}
          </div>
        )}
        <Button type="submit" variant="primary" block>
          {existing ? 'Save changes' : 'Create goal'}
        </Button>
      </form>
    </div>
  );
}
