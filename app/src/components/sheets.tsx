import { AlertCircle, ArrowCounterClockwise, FlaskConical, Trophy } from '@/lib/icons';
import { useEffect, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { available, bestStreak, currentStreak, projectedFinish, requiredPace, weekStates } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import { useCelebrate } from './mascot/Celebration';
import type { Frequency, Goal, Transaction } from '../data/types';
import { addDays, formatDate, ordinal, todayKey } from '../lib/dates';
import { plural } from '../lib/plural';
import { daysToNextWeekFreeze, RuleError, weekFreezeRunning } from '../lib/social/rules';
import { statusOf } from '../lib/social/view';
import { useSocial } from './social/SocialProvider';
import { AskFreezeSheet } from './social/parts';
import { formatLei, parseLei } from '../lib/money';
import { Select } from './watermelon/select';
import { Banner, Button, DayPicker, Field, Segmented, Sheet, TextField, useToast } from './ui';
import { RealSaveSheet, RealWithdrawSheet } from './money';
import { joinedKey, StreakWeek } from './StreakWeek';

// ---------- Add / withdraw / edit money ----------

export interface MoneySheetProps {
  open: boolean;
  onClose: () => void;
  mode?: Transaction['type'];
  goalId?: string | null;
  presetAmount?: number;
  editing?: Transaction;
}

/** Adding or taking money. A Supabase account moves it for real (Stripe test mode); others record it. */
export function MoneySheet(props: MoneySheetProps) {
  const { money } = useStore();
  if (money && !props.editing) {
    return props.mode === 'withdrawal' ? <RealWithdrawSheet open={props.open} onClose={props.onClose} /> : <RealSaveSheet open={props.open} onClose={props.onClose} presetAmount={props.presetAmount} />;
  }
  return <RecordSheet {...props} />;
}

function RecordSheet({ open, onClose, mode = 'contribution', goalId = null, presetAmount, editing }: MoneySheetProps) {
  const data = useData();
  const store = useStore();
  const toast = useToast();
  const celebrate = useCelebrate();
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
      ? 'Enter an amount, like 50 or 50.50.'
      : amount <= 0
        ? 'Enter an amount above 0.'
        : max !== null && amount > max
          ? `You can withdraw up to ${formatLei(max)} from ${bucketId ? 'this goal' : 'savings with no goal'}.`
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
        if (!isDemo && type === 'contribution') {
          // the moment the app exists for: make it feel like something happened
          const g = bucketId ? data.goals.find((x) => x.id === bucketId) : null;
          celebrate({ title: `+${formatLei(amount)} saved`, sub: g ? `For ${g.name}. Slow and steady.` : 'Into your savings, no goal attached.' });
        } else {
          toast(isDemo ? 'Transfer started. It stays pending until the next sync.' : `Withdrawal of ${formatLei(amount)} added`);
        }
      }
      onClose();
    } catch (err) {
      setError(err instanceof ActionError ? err.message : 'Something went wrong. Nothing was saved.');
    } finally {
      setBusy(false);
    }
  }

  const title = editing ? 'Edit entry' : type === 'contribution' ? (isDemo ? 'Add money' : 'Add savings') : 'Add a withdrawal';
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
              { value: 'contribution', label: 'Deposit' },
              { value: 'withdrawal', label: 'Withdraw' },
            ]}
          />
        )}

        <div className="amount-entry">
          <label htmlFor={amountId} className="small muted">
            {type === 'contribution' ? 'Amount saved' : 'Amount withdrawn'}
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
          {max !== null && <p className="small subtle">Available: {formatLei(max)}</p>}
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

        <Field label={type === 'contribution' ? 'Put the money in' : 'Take the money from'} htmlFor="bucket">
          <Select
            id="bucket"
            name="bucket"
            label={type === 'contribution' ? 'Put the money in' : 'Take the money from'}
            hideLabel
            value={target}
            onChange={setTarget}
            options={[
              ...buckets.map((g) => ({
                value: g.id,
                label: g.status === 'paused' ? `${g.name} (paused)` : g.name,
                hint: type === 'withdrawal' ? `Available: ${formatLei(available(data.transactions, g.id, editing?.id))}` : undefined,
              })),
              { value: 'none', label: 'No goal', hint: type === 'withdrawal' ? `Available: ${formatLei(available(data.transactions, null, editing?.id))}` : undefined },
            ]}
          />
        </Field>

        <div className="btn-row" style={{ alignItems: 'flex-start' }}>
          <TextField label="Date" type="date" value={date} max={todayKey()} onChange={(e) => setDate(e.target.value || todayKey())} />
        </div>
        <TextField label={<>Note <span className="subtle">(optional)</span></>} placeholder={type === 'contribution' ? 'e.g. Some of my tutoring money' : 'e.g. Train ticket home'} value={note} maxLength={60} onChange={(e) => setNote(e.target.value)} />

        {isDemo && (
          <Banner tone="demo" icon={FlaskConical}>
            Demo connection: this creates a <strong>simulated</strong> transfer. No real money moves. It stays pending until the next sync.
          </Banner>
        )}
        {!isDemo && !editing && <p className="small subtle">You're logging money you've already set aside. Kip never moves money.</p>}
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {error}
          </div>
        )}
        <Button type="submit" variant="primary" block loading={busy}>
          {editing ? 'Save changes' : type === 'contribution' ? (isDemo ? 'Start the simulated transfer' : 'Add deposit') : 'Add withdrawal'}
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
        label={plan.frequency === 'flexible' ? <>About how much each time <span className="subtle">(optional)</span></> : plan.frequency === 'weekly' ? 'Amount per week' : 'Amount per month'}
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
        <Field label="Day of the month" htmlFor="dom" hint="Between 1 and 28, so the date exists every month.">
          <Select
            id="dom"
            label="Day of the month"
            hideLabel
            value={String(plan.day ?? 1)}
            onChange={(v) => onChange({ ...plan, day: Number(v) })}
            options={Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: ordinal(i + 1) }))}
          />
        </Field>
      )}
      {pace && (
        <div className="stack" style={{ gap: 8 }}>
          <p className="label">To reach {formatLei(target!)} by {formatDate(targetDate!)}, you need about</p>
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
          At this pace you reach {goal ? 'the target' : 'your target'} around <strong>{formatDate(finish)}</strong>
          {targetDate && finish > targetDate ? ', after the target date. That\'s fine, you can change the plan or the date any time.' : '.'}
        </p>
      )}
      <p className="small subtle">Estimates assume you make every planned deposit and withdraw nothing. A plan is a guide, not a promise. Change it whenever your budget changes.</p>
    </div>
  );
}

// The plan sheet lives with the other goal sheets now (GoalSheets.tsx); re-exported for old imports.
export { PlanSheet } from './GoalSheets';

// ---------- Streak rules ----------

/**
 * "Streak rules": the count and the record big on the streak's orange, this week drawn
 * exactly like the home card (StreakWeek), the rules as one line each, and the two freezes: the
 * 1-day Freeze that steps in on its own and the 1-week Freeze earned every 45 days in a row. They
 * replace the old "Freeze today"; days frozen that way still count.
 */
export function StreakOverview() {
  const data = useData();
  const { account } = useStore();
  const s = useSocial();
  const [ask, setAsk] = useState(false);
  const streak = currentStreak(data);
  const best = bestStreak(data);
  const danger = s ? statusOf(s.world, s.me, s.now).danger : null;
  return (
    <div className="srules">
      <section className="streakd srules__hero" aria-label="Your streak">
        <div className="srules__stats">
          <p className="srules__stat">
            <b>{streak}</b>
            <span>{streak === 1 ? 'day in a row' : 'days in a row'}</span>
          </p>
          <p className="srules__stat srules__stat--best">
            <b>{best}</b>
            <span>longest streak</span>
          </p>
        </div>
        <StreakWeek days={weekStates(data, joinedKey(account, data.actions))} />
      </section>

      {danger && !danger.gift && (
        <section className="card srules__freeze" aria-labelledby="srules-danger">
          <img src="/mascot/pose-ice-floe.webp" alt="" className="srules__ice" style={{ width: 64, height: 64 }} />
          <div className="srules__freezetext">
            <h2 id="srules-danger">Your streak is in danger</h2>
            <p>You didn't save anything yesterday. A friend can give you their freeze until midnight.</p>
          </div>
          <Button size="sm" variant="primary" onClick={() => setAsk(true)}>
            Ask for a freeze
          </Button>
          <AskFreezeSheet open={ask} onClose={() => setAsk(false)} />
        </section>
      )}

      <StreakRules />
      <FreezeCards streak={streak} />
    </div>
  );
}

/** The two freezes, as they stand for the signed-in person. Shared by the rules page and Profile. */
export function FreezeCards({ streak, compact }: { streak: number; compact?: boolean }) {
  const s = useSocial();
  const toast = useToast();
  if (!s) return null;
  const st = statusOf(s.world, s.me, s.now);
  const f = st.freezes;
  const today = todayKey();
  const running = weekFreezeRunning(f, today);
  const left = daysToNextWeekFreeze(streak);
  const dayLine = f.day === 1 ? 'You have it. It kicks in on its own at the end of a missed day.' : `Your 1-day Freeze recharges in ${plural(st.rechargeIn ?? 7, 'day', 'days')}`;
  const toNext = `${plural(left, 'more day', 'more days')} until the next one (45 days in a row)`;
  const weekLine = running ? `Running: you're covered until ${formatDate(addDays(f.weekFrom!, 6))}.` : f.week === 1 ? 'You have it. It covers 7 days, starting today.' : `1-week Freeze: ${toNext}`;
  if (compact)
    return (
      <section className="soc-freezechip" style={{ alignItems: 'flex-start' }} aria-label="Your freezes" data-testid="profile-freezes">
        <img src="/mascot/ice.webp" alt="" aria-hidden />
        <div className="stack" style={{ gap: 4 }}>
          <p className="soc-freezechip__title">1-day Freeze: {f.day}</p>
          <p className="soc-freezechip__sub">{dayLine}</p>
          <p className="soc-freezechip__title" data-testid="week-freeze-line">
            {f.week === 1 || running ? `1-week Freeze: ${running ? 'on' : '1'}` : weekLine}
          </p>
          {(f.week === 1 || running) && <p className="soc-freezechip__sub">{weekLine}</p>}
        </div>
      </section>
    );
  return (
    <>
      <section className="card srules__freeze" aria-labelledby="srules-day">
        <img src="/mascot/ice.webp" alt="" className="srules__ice" />
        <div className="srules__freezetext">
          <h2 id="srules-day">1-day Freeze · {f.day}</h2>
          <p>{dayLine}</p>
          <p>One at a time. It recharges 7 days after you use it or give it to a friend.</p>
        </div>
      </section>
      <section className="card srules__freeze" aria-labelledby="srules-week">
        <span className="srules__ice" aria-hidden style={{ display: 'flex' }}>
          <img src="/mascot/ice.webp" alt="" style={{ width: 30, height: 30 }} />
          <img src="/mascot/ice.webp" alt="" style={{ width: 30, height: 30, marginLeft: -12, marginTop: 14 }} />
        </span>
        <div className="srules__freezetext">
          <h2 id="srules-week">1-week Freeze · {f.week}</h2>
          <p data-testid="week-freeze-rules-line">{f.week === 1 || running ? weekLine : `${toNext}.`}</p>
          <p>You earn one every 45 days in a row. Days covered by a freeze don't count toward it. It's yours alone, you can't give it away.</p>
        </div>
        {f.week === 1 && !running && s.simulated && (
          <Button
            size="sm"
            variant="primary"
            onClick={async () => {
              try {
                await s.repo.activateWeekFreeze();
                toast('Your 1-week Freeze is on. See you in 7 days.');
              } catch (e) {
                toast(e instanceof RuleError ? e.message : 'It didn\'t start.', 'error');
              }
            }}
          >
            Start the 1-week Freeze
          </Button>
        )}
      </section>
    </>
  );
}

const RULES: { icon: ReactNode; tone: string; text: string }[] = [
  { icon: <img src="/mascot/flame.webp" alt="" />, tone: 'fire', text: 'Save money: the day lights up.' },
  { icon: <img src="/mascot/ice.webp" alt="" />, tone: 'ice', text: 'Miss a day: your 1-day Freeze covers it on its own.' },
  { icon: <ArrowCounterClockwise size={18} aria-hidden />, tone: 'missed', text: 'No freeze? Friends can help for 24 hours. Then the streak starts over, but your money stays.' },
  { icon: <img src="/mascot/ice.webp" alt="" />, tone: 'ice', text: 'Every 45 days in a row earns you a 1-week Freeze.' },
  { icon: <Trophy size={18} aria-hidden />, tone: 'best', text: 'Your record always stays.' },
];

/** The rules, one icon and one line each. Works signed out too (how it works shows it). */
export function StreakRules() {
  return (
    <ul className="srules__list" aria-label="Streak rules">
      {RULES.map((r) => (
        <li key={r.text} className={`srules__rule srules__rule--${r.tone}`}>
          <span className="srules__icon" aria-hidden>
            {r.icon}
          </span>
          <span>{r.text}</span>
        </li>
      ))}
    </ul>
  );
}
