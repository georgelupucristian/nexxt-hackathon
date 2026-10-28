import { ArrowLeft, Bell, BellOff, CheckCircle2, Eye, FlaskConical, Lock, PenLine, Unplug } from '@/lib/icons';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { planLabel } from '../components/domain';
import { PlanForm } from '../components/sheets';
import { Banner, Button, DayPicker, Field, GOAL_ICON, IconButton, Switch, TextField } from '../components/ui';
import { useData, useStore } from '../data/store';
import type { GoalKind, OnboardingDraft } from '../data/types';
import { formatDate, todayKey, WEEKDAY_NAME } from '../lib/dates';
import { formatLei, MAX_AMOUNT, parseLei } from '../lib/money';

const KINDS: { kind: GoalKind; title: string; desc: string; name: string }[] = [
  { kind: 'emergency', title: 'Emergency fund', desc: 'A cushion for surprises', name: 'Emergency fund' },
  { kind: 'tech', title: 'Laptop or tech', desc: 'New laptop, phone, gear', name: 'New laptop' },
  { kind: 'travel', title: 'Travel or exchange', desc: 'Erasmus, trips, flights', name: 'Exchange semester' },
  { kind: 'custom', title: 'Something else', desc: 'Name your own goal', name: '' },
];

const STEPS = ['Goal', 'Plan', 'Tracking', 'Reminder', 'Review'];

export function Onboarding() {
  const data = useData();
  const { saveDraft, finishOnboarding, signOut } = useStore();
  const nav = useNavigate();
  const { step, draft } = data.onboarding;
  const [errors, setErrors] = useState<Record<string, string>>({});

  const set = (patch: Partial<OnboardingDraft>) => saveDraft(patch);
  const go = (s: number) => {
    setErrors({});
    saveDraft({}, s);
    window.scrollTo(0, 0);
  };

  const target = parseLei(draft.target);
  const planAmount = draft.planAmount ? parseLei(draft.planAmount) : 0;

  function validate(s: number): Record<string, string> {
    const e: Record<string, string> = {};
    if (s === 0) {
      if (!draft.kind) e.kind = 'Choose what you’re saving for.';
      if (!draft.name.trim()) e.name = 'Give your goal a name.';
      if (target === null || target <= 0) e.target = 'Enter a target amount, like 3000.';
      else if (target > MAX_AMOUNT) e.target = 'That amount looks too large.';
      if (draft.targetDate && draft.targetDate <= todayKey()) e.targetDate = 'Pick a date in the future, or leave it empty.';
    }
    if (s === 1) {
      if (planAmount === null) e.plan = 'Enter a valid amount, like 50.';
      else if (draft.frequency !== 'flexible' && planAmount <= 0) e.plan = 'Enter how much you plan to save, or choose Flexible.';
    }
    if (s === 2 && !draft.tracking) e.tracking = 'Choose how you want to track your savings.';
    return e;
  }

  function next() {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step < 4) go(step + 1);
    else finish();
  }

  function finish() {
    for (let s = 0; s < 4; s++) {
      const e = validate(s);
      if (Object.keys(e).length) {
        setErrors(e);
        go(s);
        return;
      }
    }
    finishOnboarding(
      {
        kind: draft.kind!,
        name: draft.name.trim(),
        target: target!,
        targetDate: draft.targetDate || null,
        motivation: draft.motivation.trim(),
        plan: { amount: planAmount ?? 0, frequency: draft.frequency, day: draft.frequency === 'flexible' ? null : draft.day },
      },
      { tracking: draft.tracking!, reminder: draft.reminder },
    );
    nav('/home', { replace: true });
  }

  return (
    <div className="screen screen--bare" style={{ minHeight: '100dvh' }}>
      <header className="topbar" style={{ gridTemplateColumns: 'var(--touch) 1fr auto' }}>
        <div>{step > 0 && <IconButton label="Previous step" icon={ArrowLeft} onClick={() => go(step - 1)} />}</div>
        <div className="ob-progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={5} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of 5: ${STEPS[step]}`}>
          {STEPS.map((s, i) => (
            <span key={s} data-on={i <= step} />
          ))}
        </div>
        <button
          type="button"
          className="link-btn"
          style={{ marginLeft: 'var(--s-3)' }}
          onClick={() => {
            signOut();
            nav('/welcome');
          }}
        >
          Save & exit
        </button>
      </header>

      {step === 0 && <GoalStep draft={draft} set={set} errors={errors} />}
      {step === 1 && (
        <section className="stack-lg">
          <StepTitle n={2} title="Make a plan that fits" sub="Pick an amount you can manage. You can lower it, pause it or change it anytime." />
          <PlanForm
            plan={{ amount: draft.planAmount, frequency: draft.frequency, day: draft.day }}
            onChange={(p) => set({ planAmount: p.amount, frequency: p.frequency, day: p.day })}
            target={target}
            targetDate={draft.targetDate || null}
          />
          {errors.plan && <p className="field-error" role="alert">{errors.plan}</p>}
        </section>
      )}
      {step === 2 && <TrackingStep draft={draft} set={set} error={errors.tracking} />}
      {step === 3 && <ReminderStep draft={draft} set={set} />}
      {step === 4 && <ReviewStep draft={draft} go={go} />}

      <div className="ob-footer">
        <Button variant="primary" block onClick={next}>
          {step === 4 ? 'Finish setup' : 'Continue'}
        </Button>
        {step === 3 && (
          <Button
            variant="ghost"
            block
            onClick={() => {
              set({ reminder: { ...draft.reminder, enabled: false } });
              go(4);
            }}
          >
            Skip reminders
          </Button>
        )}
        {step === 4 && <p className="small subtle" style={{ textAlign: 'center' }}>You don’t need to add any money to finish.</p>}
      </div>
    </div>
  );
}

function StepTitle({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="stack" style={{ gap: 6, paddingTop: 'var(--s-2)' }}>
      <p className="small subtle strong">Step {n} of 5</p>
      <h1>{title}</h1>
      <p className="muted">{sub}</p>
    </div>
  );
}

function GoalStep({ draft, set, errors }: { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void; errors: Record<string, string> }) {
  return (
    <section className="stack-lg">
      <StepTitle n={1} title="What are you saving for?" sub="Start with one goal. You can add more later." />
      <div className="options options--2" role="radiogroup" aria-label="Goal type">
        {KINDS.map((k) => {
          const Icon = GOAL_ICON[k.kind];
          return (
            <button
              key={k.kind}
              type="button"
              role="radio"
              aria-checked={draft.kind === k.kind}
              className="option"
              onClick={() => {
                const wasDefault = !draft.name || KINDS.some((x) => x.name === draft.name);
                set({ kind: k.kind, name: wasDefault ? k.name : draft.name });
              }}
            >
              <span className="option__icon" aria-hidden>
                <Icon size={22} />
              </span>
              <span>
                <span className="option__title" style={{ display: 'block' }}>
                  {k.title}
                </span>
                <span className="option__desc">{k.desc}</span>
              </span>
            </button>
          );
        })}
      </div>
      {errors.kind && <p className="field-error" role="alert">{errors.kind}</p>}
      {draft.kind && (
        <div className="stack-lg">
          <TextField label="Goal name" value={draft.name} maxLength={48} error={errors.name} placeholder="e.g. Concert tickets" onChange={(e) => set({ name: e.target.value })} />
          <TextField
            label="Target amount"
            inputMode="decimal"
            suffix="lei"
            placeholder="3000"
            value={draft.target}
            error={errors.target}
            onChange={(e) => set({ target: e.target.value.replace(/[^\d.,]/g, '').slice(0, 12) })}
          />
          <TextField
            label={<>Target date <span className="subtle">(optional)</span></>}
            type="date"
            min={todayKey()}
            value={draft.targetDate}
            error={errors.targetDate}
            hint="Leave empty if there’s no deadline."
            onChange={(e) => set({ targetDate: e.target.value })}
          />
          <Field label={<>Why it matters to you <span className="subtle">(optional)</span></>} htmlFor="motivation" hint="We’ll show this on your goal as a reminder.">
            <textarea id="motivation" className="textarea" maxLength={120} value={draft.motivation} onChange={(e) => set({ motivation: e.target.value })} placeholder="e.g. So I can study abroad without stressing about rent" />
          </Field>
        </div>
      )}
    </section>
  );
}

function TrackingStep({ draft, set, error }: { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void; error?: string }) {
  return (
    <section className="stack-lg">
      <StepTitle n={3} title="How will you track your savings?" sub="Kept doesn’t hold or move money. It keeps track of what you set aside." />
      <div className="options" role="radiogroup" aria-label="Tracking method">
        <button type="button" role="radio" aria-checked={draft.tracking === 'manual'} className="option option--row" onClick={() => set({ tracking: 'manual' })}>
          <span className="option__icon" aria-hidden>
            <PenLine size={22} />
          </span>
          <span className="grow">
            <span className="option__title" style={{ display: 'block' }}>
              Track manually <span className="pill pill--success" style={{ marginLeft: 4 }}>Recommended</span>
            </span>
            <span className="option__desc">Record each amount you put aside: in any account, a jar, anywhere.</span>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={draft.tracking === 'demo'} className="option option--row" onClick={() => set({ tracking: 'demo' })}>
          <span className="option__icon" aria-hidden style={{ background: 'var(--demo-soft)', color: 'var(--demo)' }}>
            <FlaskConical size={22} />
          </span>
          <span className="grow">
            <span className="option__title" style={{ display: 'block' }}>
              Try a demo connection
            </span>
            <span className="option__desc">See how a connected account would behave, with simulated transfers and syncing.</span>
          </span>
        </button>
        <div className="option option--row" aria-disabled="true" style={{ opacity: 0.55, cursor: 'not-allowed' }}>
          <span className="option__icon" aria-hidden>
            <Unplug size={22} />
          </span>
          <span className="grow">
            <span className="option__title" style={{ display: 'block' }}>
              Connect a real bank
            </span>
            <span className="option__desc">Not available in this version.</span>
          </span>
        </div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {draft.tracking === 'demo' && (
        <div className="card stack-lg">
          <h2>What the demo connection does</h2>
          <ul className="check-list small">
            <li>
              <FlaskConical size={18} aria-hidden color="var(--demo)" />
              <span>
                <strong>Everything is simulated.</strong> “Demo Bank” isn’t real and no bank is contacted.
              </span>
            </li>
            <li>
              <Eye size={18} aria-hidden />
              <span>
                <strong>Read-style behaviour only.</strong> Transfers you start appear as pending, then confirm on the next simulated sync.
              </span>
            </li>
            <li>
              <Lock size={18} aria-hidden />
              <span>
                <strong>No real money moves</strong>, ever. Every simulated entry is labelled so it can’t be mistaken for real savings.
              </span>
            </li>
          </ul>
          <p className="small subtle">You can switch to manual tracking anytime in Profile.</p>
        </div>
      )}
    </section>
  );
}

function ReminderStep({ draft, set }: { draft: OnboardingDraft; set: (p: Partial<OnboardingDraft>) => void }) {
  const r = draft.reminder;
  return (
    <section className="stack-lg">
      <StepTitle n={4} title="Want a gentle nudge?" sub="One reminder a week, on the day that suits you. You can change or turn it off later." />
      <div className="card row row--between">
        <div className="row">
          {r.enabled ? <Bell size={20} aria-hidden /> : <BellOff size={20} aria-hidden />}
          <span className="strong">Weekly reminder</span>
        </div>
        <Switch checked={r.enabled} onChange={(v) => set({ reminder: { ...r, enabled: v } })} label="Weekly reminder" />
      </div>
      {r.enabled && (
        <>
          <Field label="Day">
            <DayPicker value={r.day} onChange={(d) => set({ reminder: { ...r, day: d } })} />
          </Field>
          <TextField label="Time" type="time" value={r.time} onChange={(e) => set({ reminder: { ...r, time: e.target.value || '19:00' } })} />
          <Banner tone="neutral" icon={Bell}>
            Reminders appear inside Kept when you open it on or after that time. This version doesn’t send push notifications.
          </Banner>
        </>
      )}
    </section>
  );
}

function ReviewStep({ draft, go }: { draft: OnboardingDraft; go: (s: number) => void }) {
  const target = parseLei(draft.target) ?? 0;
  const amount = draft.planAmount ? parseLei(draft.planAmount) ?? 0 : 0;
  const rows: { label: string; value: string; step: number }[] = [
    { label: 'Goal', value: draft.name, step: 0 },
    { label: 'Target', value: `${formatLei(target)}${draft.targetDate ? ` by ${formatDate(draft.targetDate)}` : ''}`, step: 0 },
    { label: 'Plan', value: planLabel({ amount, frequency: draft.frequency, day: draft.day }), step: 1 },
    { label: 'Tracking', value: draft.tracking === 'demo' ? 'Demo connection (simulated)' : 'Manual tracking', step: 2 },
    {
      label: 'Reminder',
      value: draft.reminder.enabled ? `${WEEKDAY_NAME[draft.reminder.day]}s at ${draft.reminder.time}` : 'Off',
      step: 3,
    },
  ];
  return (
    <section className="stack-lg">
      <StepTitle n={5} title="Ready to go" sub="Check everything looks right. Tap Edit to change a step." />
      <div className="card card--flush">
        <ul className="list">
          {rows.map((r) => (
            <li key={r.label} className="list-row" style={{ minHeight: 64 }}>
              <span className="list-row__body">
                <span className="small subtle">{r.label}</span>
                <span className="strong clamp-2">{r.value}</span>
              </span>
              <button type="button" className="link-btn" onClick={() => go(r.step)} aria-label={`Edit ${r.label.toLowerCase()}`}>
                Edit
              </button>
            </li>
          ))}
        </ul>
      </div>
      {draft.motivation && (
        <p className="muted" style={{ fontStyle: 'italic' }}>
          “{draft.motivation}”
        </p>
      )}
      <div className="row small muted">
        <CheckCircle2 size={18} aria-hidden color="var(--accent)" />
        Your progress is saved. You can close the app and pick up later.
      </div>
    </section>
  );
}
