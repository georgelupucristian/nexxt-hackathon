import NumberFlow from '@number-flow/react';
import { ArrowLeft, HardDrive } from '@/lib/icons';
import { Emoji3D, GOAL_EMOJI } from '../components/Emoji3D';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { MascotSays, MASCOT_NAME } from '../components/mascot/MascotSays';
import { useCelebrate } from '../components/mascot/Celebration';
import type { SealState } from '../components/mascot/Seal';
import { AmountRuler } from '../components/watermelon/amount-ruler';
import { FloatingInput } from '../components/watermelon/floating-input';
import { FluidTabs } from '../components/watermelon/fluid-tabs';
import { LabeledProgressIndicator } from '../components/watermelon/labeled-progress-indicator';
import { ProgressiveInputStack } from '../components/watermelon/progressive-input-stack';
import { projectedFinish } from '../data/selectors';
import { AuthError } from '../data/storage';
import { useStore } from '../data/store';
import type { Frequency, GoalKind, TrackingMethod } from '../data/types';
import { addDays, formatDate, todayKey, weekday, WEEKDAY_NAME } from '../lib/dates';
import { formatLei } from '../lib/money';

// Duolingo-style setup: Kip asks one thing per screen, answers are kept in sessionStorage so a
// refresh doesn't lose them, and the account is only created at the end, once you've already
// built something worth saving.

type StepId = 'hello' | 'name' | 'kind' | 'target' | 'plan' | 'tracking' | 'reminder' | 'account';
const STEPS: StepId[] = ['hello', 'name', 'kind', 'target', 'plan', 'tracking', 'reminder', 'account'];

interface Draft {
  step: number;
  name: string;
  kind: GoalKind | null;
  goalName: string;
  target: number; // bani
  deadline: string; // '' = none
  frequency: Frequency;
  amount: number; // bani per period
  tracking: TrackingMethod;
  reminderOn: boolean;
  reminderDay: number;
  reminderTime: string;
  email: string;
  password: string;
}

const KEY = 'kept.start';
const fresh = (): Draft => ({
  step: 0,
  name: '',
  kind: null,
  goalName: '',
  target: 3_000_00,
  deadline: '',
  frequency: 'weekly',
  amount: 75_00,
  tracking: 'manual',
  reminderOn: true,
  reminderDay: weekday(todayKey()),
  reminderTime: '19:00',
  email: '',
  password: '',
});

function load(): Draft {
  try {
    const raw = sessionStorage.getItem(KEY);
    // never restore the password from storage
    return raw ? { ...fresh(), ...JSON.parse(raw), password: '' } : fresh();
  } catch {
    return fresh();
  }
}

const KINDS: { kind: GoalKind; title: string; desc: string; name: string; tint: string }[] = [
  { kind: 'emergency', title: 'Emergency fund', desc: 'A cushion for surprises', name: 'Emergency fund', tint: 'today' },
  { kind: 'tech', title: 'Laptop or tech', desc: 'New laptop, phone, gear', name: 'New laptop', tint: 'activity' },
  { kind: 'travel', title: 'Travel or exchange', desc: 'Erasmus, trips, flights', name: 'Exchange semester', tint: 'goals' },
  { kind: 'custom', title: 'Something else', desc: 'Name your own goal', name: '', tint: 'profile' },
];

const DEADLINES = [
  { label: 'No deadline', days: 0 },
  { label: 'In 3 months', days: 91 },
  { label: 'In 6 months', days: 182 },
  { label: 'In a year', days: 365 },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ['Too short', 'Okay', 'Good', 'Strong', 'Very strong'][s] };
}

export function Start() {
  const { account, data, signUp, finishOnboarding } = useStore();
  const nav = useNavigate();
  const celebrate = useCelebrate();
  const [d, setD] = useState<Draft>(load);
  const [dir, setDir] = useState(1);
  const [phase, setPhase] = useState<'flow' | 'building' | 'done'>('flow');
  const [busy, setBusy] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [accountStep, setAccountStep] = useState(0);
  const signedUpHere = useRef(false);

  useEffect(() => {
    const { password: _pw, ...rest } = d;
    void _pw;
    sessionStorage.setItem(KEY, JSON.stringify(rest));
  }, [d]);

  // Someone already signed in landed here: send them home. Not if they just signed up on this screen.
  if (account && data && !signedUpHere.current) return <Navigate to={data.onboarding.completed ? '/home' : '/onboarding'} replace />;

  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const id = STEPS[d.step];
  const go = (to: number) => {
    setDir(to > d.step ? 1 : -1);
    set({ step: to });
  };
  const back = () => (d.step === 0 ? nav('/welcome') : go(d.step - 1));

  const name = d.name.trim() || 'friend';
  const plan = { amount: d.frequency === 'flexible' ? 0 : d.amount, frequency: d.frequency, day: d.frequency === 'weekly' ? weekday(todayKey()) : d.frequency === 'monthly' ? Math.min(28, new Date().getDate()) : null };
  const finish = projectedFinish(plan, 0, d.target);
  const lateForDeadline = !!(finish && d.deadline && finish > d.deadline);
  const periods = plan.amount > 0 ? Math.ceil(d.target / plan.amount) : 0;

  async function createAccount() {
    setBusy(true);
    setAuthError(null);
    try {
      signedUpHere.current = true;
      await signUp(name, d.email.trim(), d.password);
      finishOnboarding(
        { kind: d.kind ?? 'custom', name: d.goalName.trim() || 'My goal', target: d.target, targetDate: d.deadline || null, motivation: '', plan },
        { tracking: d.tracking, reminder: { enabled: d.reminderOn, day: d.reminderDay, time: d.reminderTime } },
      );
      sessionStorage.removeItem(KEY);
      setPhase('building');
    } catch (err) {
      signedUpHere.current = false;
      setAuthError(err instanceof AuthError ? err.message : 'We couldn’t create your account. Please try again.');
      if (err instanceof AuthError && err.field === 'email') setAccountStep(0);
    } finally {
      setBusy(false);
    }
  }

  // ---- what Kip says and whether Continue is allowed, per step ----
  let say: { state: SealState; text: string };
  let canGo = true;
  let cta = 'Continue';
  switch (id) {
    case 'hello':
      say = { state: 'wave', text: `Hi! I’m ${MASCOT_NAME}. I’ll help you save for the things you want, one small step at a time.` };
      cta = 'Let’s go';
      break;
    case 'name':
      say = d.name.trim() ? { state: 'happy', text: `${d.name.trim()}! Love it.` } : { state: 'think', text: 'First things first: what should I call you?' };
      canGo = d.name.trim().length > 0;
      break;
    case 'kind':
      say = { state: d.kind ? 'happy' : 'wave', text: d.kind ? 'Great pick. Let’s make it real.' : `Nice to meet you, ${name}! What are you saving for?` };
      canGo = !!d.kind && d.goalName.trim().length > 0;
      break;
    case 'target':
      say = { state: 'think', text: `How much do you need for ${d.goalName.trim() || 'it'}?` };
      canGo = d.target > 0;
      break;
    case 'plan':
      say =
        d.frequency === 'flexible'
          ? { state: 'happy', text: 'Flexible works. Save whenever it fits, I’ll keep count.' }
          : lateForDeadline
            ? { state: 'think', text: 'That lands after your deadline. A bit more would help, or keep it. Plans can change anytime.' }
            : { state: 'point', text: `How much can you put aside each ${d.frequency === 'weekly' ? 'week' : 'month'}? Drag the ruler.` };
      canGo = d.frequency === 'flexible' || d.amount > 0;
      break;
    case 'tracking':
      say = { state: 'idle', text: 'How do you want to track it? I never touch your money, I just keep count.' };
      break;
    case 'reminder':
      say = { state: 'wave', text: 'Want a gentle nudge once a week? People who get one save more often.' };
      cta = d.reminderOn ? 'Remind me' : 'Continue';
      break;
    case 'account':
      say = { state: 'happy', text: `Last step, ${name}! Let’s save your plan so it’s here next time.` };
      break;
  }

  if (phase !== 'flow') {
    return (
      <div className="start start--center">
        {phase === 'building' ? (
          <motion.div className="start__building" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <MascotSays state="think" message="Give me a second…" size={170} layout="stack" appear="none" />
            <LabeledProgressIndicator
              labels={[`Setting up ${d.goalName.trim() || 'your goal'}…`, 'Planning your weeks…', 'Warming up your streak…', 'All set!']}
              durationMs={2600}
              onDone={() => {
                setPhase('done');
                celebrate({ title: `You’re all set, ${name}!`, sub: 'Your first goal is ready.' });
              }}
            />
          </motion.div>
        ) : (
          <motion.div className="start__done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4, type: 'spring', stiffness: 300, damping: 26 }}>
            <MascotSays state="happy" message={`Here’s the plan, ${name}.`} size={150} layout="stack" appear="none" />
            <div className="start__summary">
              <SummaryRow label="Goal" value={d.goalName.trim() || 'My goal'} />
              <SummaryRow label="Target" value={`${formatLei(d.target)}${d.deadline ? ` by ${formatDate(d.deadline)}` : ''}`} />
              <SummaryRow label="Plan" value={d.frequency === 'flexible' ? 'Flexible' : `${formatLei(d.amount)} each ${d.frequency === 'weekly' ? 'week' : 'month'}`} />
              {finish && <SummaryRow label="Done around" value={formatDate(finish)} />}
            </div>
            <button type="button" className="btn btn--primary btn--block btn--xl" onClick={() => nav('/home', { replace: true })}>
              Take me to my savings
            </button>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="start">
      <header className="start__bar">
        <button type="button" className="icon-btn" onClick={back} aria-label={d.step === 0 ? 'Back to welcome' : 'Previous question'}>
          <ArrowLeft size={22} aria-hidden />
        </button>
        <div className="start__progress" role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={d.step + 1}>
          <motion.span animate={{ width: `${((d.step + 1) / STEPS.length) * 100}%` }} transition={{ type: 'spring', stiffness: 200, damping: 26 }} />
        </div>
      </header>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.main
          key={id}
          className="start__step"
          custom={dir}
          variants={{
            enter: (k: number) => ({ opacity: 0, x: 40 * k }),
            center: { opacity: 1, x: 0 },
            exit: (k: number) => ({ opacity: 0, x: -40 * k }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', stiffness: 420, damping: 36 }}
        >
          <MascotSays state={say.state} message={say.text} size={id === 'hello' ? 210 : 104} layout={id === 'hello' ? 'stack' : 'row'} appear={id === 'hello' ? 'pop' : 'none'} />

          {id === 'name' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (canGo) go(d.step + 1);
              }}
            >
              <FloatingInput label="Your first name" autoComplete="given-name" autoFocus maxLength={40} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </form>
          )}

          {id === 'kind' && (
            <div className="stack-lg">
              <div className="choice-list" role="radiogroup" aria-label="What you’re saving for">
                {KINDS.map((k, i) => (
                  <Choice
                    key={k.kind}
                    index={i}
                    selected={d.kind === k.kind}
                    tint={k.tint}
                    icon={<Emoji3D name={GOAL_EMOJI[k.kind]} size={34} />}
                    title={k.title}
                    desc={k.desc}
                    onSelect={() => {
                      const wasDefault = !d.goalName || KINDS.some((x) => x.name === d.goalName);
                      set({ kind: k.kind, goalName: wasDefault ? k.name : d.goalName });
                    }}
                  />
                ))}
              </div>
              <AnimatePresence>
                {d.kind && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <FloatingInput label="Name your goal" maxLength={48} value={d.goalName} onChange={(e) => set({ goalName: e.target.value })} autoFocus={d.kind === 'custom'} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {id === 'target' && (
            <div className="stack-lg">
              <AmountRuler label="Target amount" value={d.target} onChange={(v) => set({ target: v })} step={50_00} min={100_00} max={30_000_00} />
              <div className="chip-row" role="group" aria-label="Quick amounts">
                {[1_000_00, 2_500_00, 5_000_00, 10_000_00].map((v) => (
                  <motion.button key={v} type="button" className="chip" aria-pressed={d.target === v} whileTap={{ scale: 0.92 }} onClick={() => set({ target: v })}>
                    {formatLei(v)}
                  </motion.button>
                ))}
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <p className="small subtle strong">By when?</p>
                <div className="chip-row" role="radiogroup" aria-label="Deadline">
                  {DEADLINES.map((o) => {
                    const val = o.days ? addDays(todayKey(), o.days) : '';
                    const on = o.days ? !!d.deadline && Math.abs(new Date(d.deadline).getTime() - new Date(val).getTime()) < 864e5 * 3 : !d.deadline;
                    return (
                      <motion.button key={o.label} type="button" role="radio" aria-checked={on} className="chip" whileTap={{ scale: 0.92 }} onClick={() => set({ deadline: val })}>
                        {o.label}
                      </motion.button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {id === 'plan' && (
            <div className="stack-lg">
              <FluidTabs
                label="How often"
                value={d.frequency}
                onChange={(f) => set({ frequency: f, amount: f === 'monthly' && d.frequency === 'weekly' ? Math.round((d.amount * 4.3) / 5_00) * 5_00 : f === 'weekly' && d.frequency === 'monthly' ? Math.max(5_00, Math.round(d.amount / 4.3 / 5_00) * 5_00) : d.amount })}
                tabs={[
                  { id: 'weekly', label: 'Weekly' },
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'flexible', label: 'Flexible' },
                ]}
              />
              {d.frequency !== 'flexible' ? (
                <>
                  <AmountRuler label={d.frequency === 'weekly' ? 'Amount each week' : 'Amount each month'} value={d.amount} onChange={(v) => set({ amount: v })} step={5_00} min={5_00} max={d.frequency === 'weekly' ? 1_500_00 : 5_000_00} />
                  <motion.div layout className={`estimate ${lateForDeadline ? 'estimate--late' : ''}`}>
                    {periods > 0 ? (
                      <>
                        <span>
                          About <NumberFlow value={periods} className="estimate__num" /> {d.frequency === 'weekly' ? (periods === 1 ? 'week' : 'weeks') : periods === 1 ? 'month' : 'months'}
                        </span>
                        {finish && <span className="estimate__date">done around {formatDate(finish)}</span>}
                      </>
                    ) : (
                      <span>Drag to pick an amount</span>
                    )}
                  </motion.div>
                </>
              ) : (
                <div className="estimate">
                  <span>No fixed amount. Record savings whenever it fits.</span>
                </div>
              )}
            </div>
          )}

          {id === 'tracking' && (
            <div className="choice-list" role="radiogroup" aria-label="How you’ll track savings">
              <Choice index={0} selected={d.tracking === 'manual'} tint="today" icon={<Emoji3D name="pencil" size={34} />} title="I’ll record what I save" desc="Put money aside anywhere, then tap + in Kept. Recommended." onSelect={() => set({ tracking: 'manual' })} />
              <Choice index={1} selected={d.tracking === 'demo'} tint="profile" icon={<Emoji3D name="testtube" size={34} />} title="Try a demo connection" desc="See how a linked account would behave. Everything is simulated." onSelect={() => set({ tracking: 'demo' })} />
            </div>
          )}

          {id === 'reminder' && (
            <div className="stack-lg">
              <div className="choice-list" role="radiogroup" aria-label="Weekly reminder">
                <Choice index={0} selected={d.reminderOn} tint="activity" icon={<Emoji3D name="bell" size={34} />} title="Yes, nudge me weekly" desc="Shows up in Kept on the day you pick." onSelect={() => set({ reminderOn: true })} />
                <Choice index={1} selected={!d.reminderOn} tint="goals" icon={<Emoji3D name="sleep" size={34} />} title="No thanks" desc="You can turn it on later in Profile." onSelect={() => set({ reminderOn: false })} />
              </div>
              <AnimatePresence>
                {d.reminderOn && (
                  <motion.div className="stack" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="chip-row chip-row--days" role="radiogroup" aria-label="Reminder day">
                      {WEEKDAY_NAME.map((n, i) => (
                        <motion.button key={n} type="button" role="radio" aria-checked={d.reminderDay === i} aria-label={n} className="chip chip--day" whileTap={{ scale: 0.9 }} onClick={() => set({ reminderDay: i })}>
                          {n.slice(0, 2)}
                        </motion.button>
                      ))}
                    </div>
                    <FloatingInput label="At" type="time" value={d.reminderTime} onChange={(e) => set({ reminderTime: e.target.value || '19:00' })} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {id === 'account' && (
            <div className="stack-lg">
              <ProgressiveInputStack
                key={accountStep}
                steps={[
                  { id: 'email', label: 'Email', type: 'email', placeholder: 'Your email', autoComplete: 'email', validate: (v) => (EMAIL_RE.test(v.trim()) ? null : 'That doesn’t look like an email yet, like name@example.com.') },
                  {
                    id: 'password',
                    label: 'Password',
                    type: 'password',
                    placeholder: 'Pick a password',
                    autoComplete: 'new-password',
                    validate: (v) => (v.length >= 8 ? null : 'Use at least 8 characters.'),
                    helper: (v) => <StrengthMeter pw={v} />,
                  },
                ]}
                values={{ email: d.email, password: d.password }}
                onChange={(k, v) => {
                  set({ [k]: v } as Partial<Draft>);
                  if (authError) setAuthError(null);
                }}
                onSubmit={createAccount}
                busy={busy}
                error={authError}
                doneLabel="Create account"
              />
              <p className="start__fine">
                <HardDrive size={14} aria-hidden /> Stored only in this browser. No bank details, ever.
              </p>
              <p className="start__fine">
                Already have an account? <Link to="/signin">Sign in</Link>
              </p>
            </div>
          )}
        </motion.main>
      </AnimatePresence>

      {id !== 'account' && (
        <footer className="start__foot">
          <motion.button type="button" className="btn btn--primary btn--block btn--xl" disabled={!canGo} whileTap={canGo ? { scale: 0.97 } : undefined} onClick={() => go(d.step + 1)}>
            {cta}
          </motion.button>
          {id === 'hello' && (
            <Link to="/signin" className="start__alt">
              I already have an account
            </Link>
          )}
        </footer>
      )}
    </div>
  );
}

function Choice({ index, selected, tint, icon, title, desc, onSelect }: { index: number; selected: boolean; tint: string; icon: ReactNode; title: string; desc: string; onSelect: () => void }) {
  return (
    <motion.button
      type="button"
      role="radio"
      aria-checked={selected}
      className={`choice choice--${tint}`}
      onClick={onSelect}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * index + 0.1, type: 'spring', stiffness: 420, damping: 30 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="choice__icon" aria-hidden>
        {icon}
      </span>
      <span className="choice__text">
        <span className="choice__title">{title}</span>
        <span className="choice__desc">{desc}</span>
      </span>
    </motion.button>
  );
}

function StrengthMeter({ pw }: { pw: string }) {
  const { score, label } = strength(pw);
  return (
    <div className="strength" aria-live="polite">
      <div className="strength__bars" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <motion.span key={i} animate={{ scaleX: i < score ? 1 : 0.15, opacity: i < score ? 1 : 0.35 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }} data-level={score} />
        ))}
      </div>
      <span className="strength__label">{pw ? label : 'At least 8 characters'}</span>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="start__row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
