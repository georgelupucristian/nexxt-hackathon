import NumberFlow from '@number-flow/react';
import { Bell, BellOff, CalendarCheck, Pencil, Trophy } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import {
  BlurOver,
  CodeBoxes,
  Confetti,
  EmojiChoices,
  enableDeviceUnlock,
  FaceScan,
  Field,
  firstName,
  Float,
  FlowShell,
  GoalCard,
  KipCenter,
  OptionRow,
  pop,
  PrimaryButton,
  QuietButton,
  ResendTimer,
  Rise,
  rise,
  StepFrame,
  Typewriter,
  ui,
  type CodeState,
} from '../components/onboarding';
import { Seal } from '../components/mascot/Seal';
import { AmountRuler } from '../components/watermelon/amount-ruler';
import { AuthError } from '../data/storage';
import { ActionError, useStore } from '../data/store';
import type { Goal, GoalColour, GoalKind, SetupState } from '../data/types';
import { formatDate, todayKey, toKey, weekday } from '../lib/dates';
import { GOAL_ICONS } from '../lib/goalIcons';
import { GOAL_PALETTE } from '../lib/goalLook';
import { Backpack, Briefcase, Coins, EyeOff, Family, Flame, GraduationCap, Hand, Lightning, Lock, PartyPopper, Shuffle, UserPlus, Users, type LucideIcon } from '../lib/icons';
import { FoundList, useFindContacts } from '../components/social/ContactsFinder';
import { INVITE_KEY, useSocial } from '../components/social/SocialProvider';
import { plural } from '../lib/plural';
import { formatLei } from '../lib/money';
import { formatNational, formatPhoneInput, PHONE_PREFIX, toE164 } from '../lib/phone';

// Sign-up and onboarding, modelled on Duolingo's: Kip asks one thing per screen in a speech
// bubble, answers sit in chunky rows, one big button at the bottom. Everything answered before
// sign-up lives in one state object (kept in sessionStorage so a refresh doesn't lose it).
// Verifying the phone number's code creates the account (a Supabase one when the backend is set) and saves the plan to
// it straight away; the steps after that update the account as they go.

type StepId = 'age' | 'why' | 'routine' | 'achieve' | 'deposit' | 'start' | 'account' | 'code' | 'name' | 'contacts' | 'discover' | 'income' | 'notify' | 'faceid' | 'done';
// after the number is proven: friends from the contacts (never mandatory), then whether friends can find you by it
const ORDER: StepId[] = ['age', 'why', 'routine', 'achieve', 'deposit', 'start', 'account', 'code', 'name', 'contacts', 'discover', 'income', 'notify', 'faceid', 'done'];
const PRE_AUTH: StepId[] = ['age', 'why', 'routine', 'achieve', 'deposit', 'start', 'account', 'code'];

export interface OnboardingFlow {
  step: StepId;
  introSeen: boolean; // the typed greeting over the first question plays once
  routineSeen: boolean; // so does "Let's make some routines"
  age: string | null;
  reasons: string[];
  otherReason: string;
  daily: number; // lei a day
  initial: number; // lei to start with
  phone: string; // as typed, "+40 712 345 678"
  name: string;
  nameGiven: boolean; // Google or an existing account already told us the name
  incomeSources: string[];
  incomeMonthly: string;
}

const KEY = 'kept.onboarding';
const fresh = (): OnboardingFlow => ({
  step: 'age',
  introSeen: false,
  routineSeen: false,
  age: null,
  reasons: [],
  otherReason: '',
  daily: 10,
  // "How much do you already have saved?" starts at nothing: the student moves it only if they really have something
  initial: 0,
  phone: PHONE_PREFIX,
  name: '',
  nameGiven: false,
  incomeSources: [],
  incomeMonthly: '',
});

function load(): OnboardingFlow {
  try {
    const raw = sessionStorage.getItem(KEY);
    const saved = raw ? { ...fresh(), ...JSON.parse(raw) } : fresh();
    // a draft from an older version of the flow starts over
    return ORDER.includes(saved.step) ? saved : fresh();
  } catch {
    return fresh();
  }
}

/** A Phosphor icon in a soft square tile; white with a blue icon once its row is picked. */
function IconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="grid size-[46px] shrink-0 place-items-center rounded-[14px] bg-surface-2 text-ink transition-colors duration-150 group-aria-checked:bg-white group-aria-checked:text-struct">
      <Icon size={26} />
    </span>
  );
}

/** A goal's own tile: its colour from the goal palette and its icon. */
function GoalIconTile({ icon, colour, size = 46 }: { icon: string; colour: GoalColour; size?: number }) {
  const { Icon } = GOAL_ICONS[icon] ?? GOAL_ICONS.star;
  return (
    <span className="grid shrink-0 place-items-center rounded-[14px] text-ink" style={{ width: size, height: size, background: GOAL_PALETTE[colour].fill }}>
      <Icon size={Math.round(size * 0.56)} weight="duotone" />
    </span>
  );
}

const AGES = [
  { id: '18', label: '18-20 years old', icon: <IconTile icon={Backpack} /> },
  { id: '21', label: '21-25 years old', icon: <IconTile icon={GraduationCap} /> },
  { id: '26', label: '26+', icon: <IconTile icon={Briefcase} /> },
];

export const REASONS: { id: string; icon: string; colour: GoalColour; label: string; kind: GoalKind }[] = [
  { id: 'fun', icon: 'ticket', colour: 'trandafir', label: 'For fun', kind: 'custom' },
  { id: 'trip', icon: 'beach', colour: 'cer', label: 'A trip with friends', kind: 'travel' },
  { id: 'emergency', icon: 'buoy', colour: 'menta', label: 'Emergency fund', kind: 'emergency' },
  { id: 'home', icon: 'home', colour: 'coral', label: 'Down payment on a home', kind: 'custom' },
  { id: 'other', icon: 'star', colour: 'soare', label: 'Something else', kind: 'custom' },
];

// Duolingo's 5 / 10 / 15 / 20 minutes a day, in lei
const DAILY = [
  { lei: 5, tag: 'Casual' },
  { lei: 10, tag: 'Regular' },
  { lei: 15, tag: 'Serious' },
  { lei: 20, tag: 'Intense' },
];

export const INCOME = [
  { id: 'family', icon: <IconTile icon={Family} />, label: 'Family/allowance' },
  { id: 'job', icon: <IconTile icon={Briefcase} />, label: 'Part-time job' },
  { id: 'scholarship', icon: <IconTile icon={GraduationCap} />, label: 'Scholarship' },
  { id: 'hustle', icon: <IconTile icon={Lightning} />, label: 'Side hustle' },
  { id: 'varies', icon: <IconTile icon={Shuffle} />, label: 'It varies' },
];

const THREE_MONTHS = 91; // days

function addMonths(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n);
  return toKey(d);
}

/** The goal the answers point at: the first real reason picked ("For fun" only if it's the only one). */
function mainReason(f: Pick<OnboardingFlow, 'reasons' | 'otherReason'>) {
  const picked = REASONS.filter((r) => f.reasons.includes(r.id));
  const r = picked.find((x) => x.id !== 'fun') ?? picked[0] ?? REASONS[0];
  const name = r.id === 'other' ? f.otherReason.trim() || 'My goal' : r.label;
  return { ...r, name };
}

/** Three months of the daily amount, on top of what they start with. */
export function planFor(f: Pick<OnboardingFlow, 'daily' | 'initial'>) {
  const daily = f.daily * 100;
  const initial = f.initial * 100;
  return {
    daily,
    initial,
    weekly: daily * 7,
    inThreeMonths: daily * THREE_MONTHS,
    target: initial + daily * THREE_MONTHS,
    date: addMonths(3),
    // what they put in up front, counted in days of their daily amount
    startDay: f.daily > 0 ? Math.max(1, Math.floor(f.initial / f.daily)) : 1,
  };
}

function goalFrom(f: OnboardingFlow): Omit<Goal, 'id' | 'createdAt' | 'status' | 'isPrimary'> | null {
  if (f.reasons.length === 0) return null;
  const p = planFor(f);
  const r = mainReason(f);
  return {
    kind: r.kind,
    name: r.name,
    target: p.target,
    targetDate: p.date,
    motivation: '',
    plan: { amount: p.weekly, frequency: 'weekly', day: weekday(todayKey()) },
    icon: r.icon,
    colour: r.colour,
  };
}

// What the store saves for a new account. The "already put aside" amount is a starting balance on
// the goal (a cloud account keeps it in the goal's meta; nothing moves at Stripe); the card is only
// asked for when the student chooses to put money in from "Save money". Payday starts on the
// 1st and is set when the plan starts.
const setupFrom = (f: OnboardingFlow): Partial<SetupState> => ({ age: f.age, reasons: f.reasons, dailyGoal: f.daily * 100 });
const planOf = (f: OnboardingFlow) => ({ daily: f.daily * 100, payday: 1 });

/** The typed greeting over the blurred first question; gone after three seconds. */
function IntroOverlay({ onDone }: { onDone: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onDone, 3000);
    return () => window.clearTimeout(t);
  }, [onDone]);
  return (
    <BlurOver className="items-center justify-center bg-bg/40 px-8 text-center">
      <motion.img src="/mascot/wave.webp" alt="" className="mb-6 size-36 object-contain" initial={{ scale: 0.4, opacity: 0, y: 30 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }} transition={pop} />
      <motion.p className="text-[30px] leading-[1.15] font-bold tracking-tight text-ink" exit={{ opacity: 0, y: -20, filter: 'blur(6px)' }} transition={{ duration: 0.3 }}>
        <Typewriter text="Hi! I'm Kip." speed={45} delay={250} caret />
        <br />
        <Typewriter text="Let's make your money grow." speed={40} delay={1150} caret className="text-struct" />
      </motion.p>
    </BlurOver>
  );
}

export function Onboarding() {
  const store = useStore();
  const { account, data } = store;
  const nav = useNavigate();
  const [f, setF] = useState<OnboardingFlow>(load);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');
  // which way the steps slide: 1 going forward, -1 going back
  const dir = useRef(1);
  // set once this screen signs someone in, so the "already finished" redirect leaves them alone
  const here = useRef(false);

  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(f));
  }, [f]);

  // a friend's invite link (/start?invite=CODE): kept until the account exists, then both get the bonus
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('invite');
    if (code) sessionStorage.setItem(INVITE_KEY, code.slice(0, 20));
  }, []);

  const set = (patch: Partial<OnboardingFlow>) => setF((x) => ({ ...x, ...patch }));
  // stable, because the intro's timer depends on it
  const endIntro = useCallback(() => setF((x) => ({ ...x, introSeen: true })), []);
  const signedIn = !!account && !!data;

  // Signed in from elsewhere (an older account, or a fresh tab): pick up after sign-up.
  const resume = signedIn && !here.current && !data.onboarding.completed && PRE_AUTH.includes(f.step);
  useEffect(() => {
    if (!resume || !account) return;
    here.current = true;
    dir.current = 1;
    // the plan answered so far goes to this account (only if it has no goal yet)
    void store.savePlan(goalFrom(f), setupFrom(f), planOf(f), f.initial * 100).catch(() => undefined);
    set({ step: account.name ? 'contacts' : 'name', name: account.name, nameGiven: !!account.name });
  }, [resume, account]);

  // A finished account has nothing to do here.
  if (signedIn && data.onboarding.completed && !here.current) return <Navigate to="/home" replace />;

  const idx = ORDER.indexOf(f.step);

  const go = (step: StepId, direction = -1) => {
    dir.current = direction;
    setError(null);
    set({ step });
  };
  // Which steps this person sees: the name only when nobody has told us it yet.
  const next = (from: StepId = f.step, known: Partial<OnboardingFlow> = {}) => {
    const g = { ...f, ...known };
    for (let i = ORDER.indexOf(from) + 1; i < ORDER.length; i++) {
      const s = ORDER[i];
      if (s === 'name' && g.nameGiven) continue;
      dir.current = 1;
      set({ ...known, step: s });
      setError(null);
      return;
    }
  };
  const back = () => {
    if (f.step === 'age') return nav('/welcome');
    for (let i = idx - 1; i >= 0; i--) {
      const s = ORDER[i];
      if (s === 'code') continue; // never back into a used code; the account screen covers it
      if (s === 'name' && f.nameGiven) continue;
      return go(s);
    }
  };

  // ---- sign-up: a phone number and its 6-digit code ----
  const e164 = toE164(f.phone);

  async function sendCode() {
    if (!e164) return;
    setBusy(true);
    setError(null);
    try {
      await store.startPhone(e164);
      setCode('');
      setCodeState('idle');
      if (f.step !== 'code') dir.current = 1;
      set({ step: 'code' });
    } catch (e) {
      setError(e instanceof AuthError ? e.message : 'Something went wrong. Try again?');
    } finally {
      setBusy(false);
    }
  }

  async function verify(value: string) {
    if (!e164) return;
    setBusy(true);
    setError(null);
    here.current = true;
    try {
      const res = await store.verifyPhone(e164, value);
      setCodeState('success');
      navigator.vibrate?.([10, 40, 10]);
      await new Promise((r) => setTimeout(r, 520));
      // a number that already has its plan: that's a sign-in
      if (res.completed) return nav('/home', { replace: true });
      await store.savePlan(goalFrom(f), setupFrom(f), planOf(f), f.initial * 100);
      next('code', { name: res.name, nameGiven: !!res.name });
    } catch (e) {
      here.current = false;
      setCodeState('error');
      navigator.vibrate?.(40);
      setCode('');
      setError(e instanceof AuthError || e instanceof ActionError ? e.message : 'Something went wrong. Try again?');
    } finally {
      setBusy(false);
    }
  }

  const p = planFor(f);
  const progress = idx / (ORDER.length - 1);
  const frame = { progress, onBack: back, backLabel: f.step === 'age' ? 'Back to welcome' : 'Back' };
  const validPhone = !!e164;
  const editPhone = () => {
    go('account');
  };

  const step = (): JSX.Element => {
  switch (f.step) {
    case 'age':
      return (
        <>
          <StepFrame
            face="wave"
            title="How old are you?"
            sub="So our tips fit the life you have right now."
            foot={
              <PrimaryButton disabled={!f.age} onClick={() => next()}>
                Continue
              </PrimaryButton>
            }
          >
            <motion.div className="flex flex-col gap-3" role="radiogroup" aria-label="Age" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.05 } } }}>
              {AGES.map((a) => (
                <OptionRow key={a.id} icon={a.icon} label={a.label} checked={f.age === a.id} onToggle={() => set({ age: a.id })} />
              ))}
            </motion.div>
          </StepFrame>
          <AnimatePresence>{!f.introSeen && <IntroOverlay onDone={endIntro} />}</AnimatePresence>
        </>
      );

    case 'why': {
      const other = f.reasons.includes('other');
      return (
        <StepFrame
          face="think"
          title="Why do you want to save?"
          sub="Pick all that apply."
          foot={
            <PrimaryButton disabled={f.reasons.length === 0 || (other && f.reasons.length === 1 && !f.otherReason.trim())} onClick={() => next()}>
              Let's start saving
            </PrimaryButton>
          }
        >
          <motion.div className="flex flex-col gap-3" role="group" aria-label="Reasons" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.05 } } }}>
            {REASONS.map((r) => (
              <OptionRow
                key={r.id}
                multi
                icon={<GoalIconTile icon={r.icon} colour={r.colour} />}
                label={r.label}
                checked={f.reasons.includes(r.id)}
                onToggle={() => set({ reasons: f.reasons.includes(r.id) ? f.reasons.filter((x) => x !== r.id) : [...f.reasons, r.id] })}
              />
            ))}
          </motion.div>
          <AnimatePresence initial={false}>
            {other && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto', transition: { height: ui, opacity: { duration: 0.2, delay: 0.08 } } }}
                exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
                className="overflow-hidden px-0.5 pb-1"
              >
                <Field label="Something else" placeholder="e.g. a new phone" maxLength={40} autoFocus value={f.otherReason} onChange={(e) => set({ otherReason: e.target.value })} />
              </motion.div>
            )}
          </AnimatePresence>
        </StepFrame>
      );
    }

    case 'routine':
      return (
        <RoutineStep
          daily={f.daily}
          introDone={f.routineSeen}
          onIntroDone={() => set({ routineSeen: true })}
          onPick={(daily) => set({ daily })}
          onNext={() => next()}
        />
      );

    case 'achieve': {
      const r = mainReason(f);
      const items: { icon: JSX.Element; goal?: boolean; title: string; body: string }[] = [
        { icon: <Coins size={26} />, title: `You save ${formatLei(p.inThreeMonths)}`, body: `Just ${formatLei(p.daily)} a day, about one coffee less.` },
        { icon: <Flame size={26} className="text-[var(--flame)]" />, title: 'You build a habit', body: 'A daily streak, friendly reminders and Kip keeping you going.' },
        { icon: <GoalIconTile icon={r.icon} colour={r.colour} size={48} />, goal: true, title: `You get closer to: ${r.name}`, body: "Every week you see how much is left and when you'll get there." },
      ];
      return (
        <StepFrame
          face="proud"
          title="Here's what you can do in 3 months"
          foot={<PrimaryButton onClick={() => next()}>Continue</PrimaryButton>}
        >
          <motion.ul className="m-0 flex list-none flex-col gap-5 p-0 pt-2" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.12, delayChildren: 0.25 } } }}>
            {items.map((it) => (
              <motion.li key={it.title} variants={{ hidden: { opacity: 0, x: -16 }, shown: { opacity: 1, x: 0, transition: ui } }} className="flex items-start gap-4">
                <motion.span
                  className={it.goal ? 'grid size-12 shrink-0 place-items-center' : 'grid size-12 shrink-0 place-items-center rounded-2xl border-2 border-line bg-white text-struct'}
                  variants={{ hidden: { scale: 0.4, rotate: -20 }, shown: { scale: 1, rotate: 0, transition: pop } }}
                  aria-hidden
                >
                  {it.icon}
                </motion.span>
                <span className="flex flex-col gap-0.5">
                  <strong className="text-[17px] font-bold text-ink">{it.title}</strong>
                  <span className="text-[14px] leading-snug text-ink-3">{it.body}</span>
                </span>
              </motion.li>
            ))}
          </motion.ul>
        </StepFrame>
      );
    }

    case 'deposit':
      return (
        <StepFrame
          face="point"
          title="How much do you already have saved?"
          sub="The money you've already put aside. It counts from day one."
          foot={<PrimaryButton onClick={() => next()}>Continue</PrimaryButton>}
        >
          <Rise className="pt-4">
            <AmountRuler label="What you have" value={f.initial * 100} onChange={(v) => set({ initial: Math.round(v / 100) })} step={10_00} min={0} max={5_000_00} />
          </Rise>
          <Rise>
            <p className="text-center text-[14px] text-ink-3" aria-live="polite">
              At {formatLei(p.daily)} a day, that's a head start of{' '}
              <strong className="font-bold text-struct-ink">
                {p.startDay} {p.startDay === 1 ? 'day' : 'days'}
              </strong>
              .
            </p>
          </Rise>
        </StepFrame>
      );

    case 'start':
      return (
        <StepFrame center title="" foot={<PrimaryButton onClick={() => next()}>Continue</PrimaryButton>}>
          <KipCenter face="celebrate">
            <h1 className="text-[18px]! leading-snug! font-semibold! tracking-normal! text-ink">
              <Typewriter text={p.initial > 0 ? `You're starting with ${formatLei(p.initial)}, so you begin on day ${p.startDay}.` : 'You start on day 1. Every leu from now on counts.'} speed={28} delay={300} />
            </h1>
          </KipCenter>
        </StepFrame>
      );

    case 'account':
      return (
        <StepFrame
          {...frame}
          title="Your plan is ready. Save it."
          sub="No passwords. Just your phone number."
          foot={
            <AnimatePresence mode="popLayout" initial={false}>
            {signedIn ? (
              <motion.div key="signed" className="flex w-full flex-col items-center" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={ui}>
                <p className="pb-2 text-sm text-ink-3">Saved to {account.phone ? formatNational(account.phone) : account.name}</p>
                <PrimaryButton
                  busy={busy}
                  onClick={() => {
                    here.current = true;
                    setBusy(true);
                    void store
                      .savePlan(goalFrom(f), setupFrom(f), planOf(f), f.initial * 100)
                      .then(() => next('code', { name: account.name, nameGiven: !!account.name }))
                      .catch((e) => setError(e instanceof ActionError ? e.message : 'Something went wrong. Try again?'))
                      .finally(() => setBusy(false));
                  }}
                >
                  Continue
                </PrimaryButton>
              </motion.div>
            ) : (
              <motion.form
                key="phone"
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 24, transition: { duration: 0.15 } }}
                transition={ui}
                className="flex w-full flex-col items-center gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (validPhone) void sendCode();
                }}
              >
                <Field
                  className="w-full"
                  label="Your phone number"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+40 7xx xxx xxx"
                  value={f.phone}
                  error={error}
                  onFocus={() => !f.phone && set({ phone: PHONE_PREFIX })}
                  onChange={(e) => (set({ phone: formatPhoneInput(e.target.value) }), setError(null))}
                />
                <PrimaryButton type="submit" disabled={!validPhone} busy={busy}>
                  Text me a code
                </PrimaryButton>
                <p className="pt-2 text-sm text-ink-3">
                  Already have an account?{' '}
                  <Link to="/signin" className="font-semibold text-ink no-underline hover:underline">
                    Sign in
                  </Link>
                </p>
              </motion.form>
            )}
            </AnimatePresence>
          }
        >
          <PlanCard f={f} />
        </StepFrame>
      );

    case 'code': {
      const edit = editPhone;
      return (
        <StepFrame
          {...frame}
          title="Enter the code"
          sub={
            <span className="inline-flex flex-wrap items-center gap-x-1.5">
              The 6-digit code for
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <strong className="font-semibold text-ink">{e164 ? formatNational(e164) : f.phone}</strong>
                <button type="button" aria-label="Change number" onClick={edit} className="grid size-7 cursor-pointer place-items-center rounded-lg border-0 bg-black/[0.05] text-ink-2">
                  <Pencil size={14} aria-hidden />
                </button>
              </span>
            </span>
          }
          foot={
            <PrimaryButton disabled={code.length < 6 && codeState !== 'success'} busy={busy && codeState !== 'success'} onClick={() => void verify(code)}>
              {codeState === 'success' ? 'Verified' : 'Verify'}
            </PrimaryButton>
          }
        >
          <Rise className="flex flex-col gap-3">
            <CodeBoxes
              value={code}
              onChange={(v) => (setCode(v), setError(null), codeState === 'error' && setCodeState('idle'))}
              onComplete={(v) => void verify(v)}
              state={codeState}
              disabled={busy}
            />
            <AnimatePresence initial={false}>
              {error && (
                <motion.p key={error} className="text-sm font-medium text-danger" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={ui}>
                  {error}
                </motion.p>
              )}
            </AnimatePresence>
            <ResendTimer onResend={() => void sendCode()} />
          </Rise>
        </StepFrame>
      );
    }

    case 'name': {
      const save = () => {
        if (!f.name.trim()) return;
        store.updateProfile({ name: f.name.trim() });
        next();
      };
      return (
        <StepFrame
          {...frame}
          title="What should we call you?"
          foot={
            <PrimaryButton disabled={!f.name.trim()} onClick={save}>
              Continue
            </PrimaryButton>
          }
        >
          <motion.form
            variants={rise}
            className="flex flex-col gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
          >
            <Field label="First name" autoComplete="given-name" autoFocus maxLength={40} placeholder="Alex" value={f.name} onChange={(e) => set({ name: e.target.value })} />
            {/* a hello that writes itself as you type */}
            <p className="h-6 text-[15px] text-ink-3" aria-live="polite">
              <AnimatePresence>
                {firstName(f.name) && (
                  <motion.span className="inline-flex items-center gap-1.5" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={ui}>
                    Nice to meet you, <strong className="font-semibold text-ink">{firstName(f.name)}</strong>
                    <motion.span className="inline-block origin-[70%_70%]" animate={{ rotate: [0, 18, -8, 18, 0] }} transition={{ duration: 0.9, delay: 0.15 }}>
                      <Hand size={18} weight="duotone" />
                    </motion.span>
                  </motion.span>
                )}
              </AnimatePresence>
            </p>
          </motion.form>
        </StepFrame>
      );
    }

    case 'contacts':
      return <FriendsStep frame={frame} onDone={() => next()} />;

    case 'discover':
      return <DiscoverStep frame={frame} onDone={() => next()} />;

    case 'income':
      return (
        <IncomeStep
          frame={frame}
          sources={f.incomeSources}
          monthly={f.incomeMonthly}
          onChange={(patch) => set(patch)}
          onSave={(setup) => {
            store.updateSetup(setup);
            next();
          }}
        />
      );

    case 'notify':
      return <NotifyStep frame={frame} goalName={mainReason(f).name} onDone={(notifications) => (store.updateSetup({ notifications }), next())} />;

    case 'faceid':
      return <FaceIdStep frame={frame} onDone={(faceId) => (store.updateSetup({ faceId }), next())} />;

    case 'done':
      return (
        <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-x-clip px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
          <Confetti />
          <motion.div
            className="relative flex flex-1 flex-col items-center justify-center gap-6 text-center"
            initial="hidden"
            animate="shown"
            variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } } }}
          >
            <motion.div variants={{ hidden: { scale: 0.4, opacity: 0, y: 30 }, shown: { scale: 1, opacity: 1, y: 0, transition: pop } }}>
              <Float amount={6}>
                <Seal state="celebrate" size={170} title="" />
              </Float>
            </motion.div>
            <div className="flex flex-col gap-2">
              <motion.h1 variants={rise} className="text-[28px]! leading-[1.12]! font-semibold! tracking-tight! text-ink">
                You're all set, {firstName(f.name) || firstName(account?.name ?? '') || 'friend'}!
              </motion.h1>
              <motion.p variants={rise} className="text-[15px] text-ink-3">
                Your first goal is saved. Let's fill it up.
              </motion.p>
            </div>
            <PlanCard f={f} />
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...ui, delay: 0.55 }}>
          <PrimaryButton
            className="relative"
            onClick={() => {
              store.completeOnboarding();
              sessionStorage.removeItem(KEY);
              nav('/home', { replace: true, state: { goalCreated: true } });
            }}
          >
            Let's go
          </PrimaryButton>
          </motion.div>
        </div>
      );
  }
  };

  if (f.step === 'done') return step();
  return (
    <FlowShell {...frame} onBack={f.step === 'code' ? editPhone : back} stepKey={f.step} direction={dir.current}>
      {step()}
    </FlowShell>
  );
}

// ---------- friends ----------

/**
 * "Find your friends who already save": one tap to let Kip look at the contacts, never
 * required. Only the numbers go to matching; then the people already on Kip, each with "Add".
 */
function FriendsStep({ frame, onDone }: { frame: Frame; onDone: () => void }) {
  const social = useSocial();
  const { find, found, busy } = useFindContacts();
  if (!found)
    return (
      <StepFrame
        {...frame}
        face="wave"
        title="Find your friends who already save"
        sub="Kip looks through your contacts once and shows you who already uses the app."
        foot={
          <>
            <PrimaryButton busy={busy} onClick={() => void find()}>
              Allow access
            </PrimaryButton>
            <QuietButton
              onClick={() => {
                social?.repo.markContactsAsked();
                onDone();
              }}
            >
              Later
            </QuietButton>
          </>
        }
      >
        <motion.ul className="m-0 flex list-none flex-col gap-3 p-0" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}>
          {[
            { icon: Lock, text: 'We only send numbers, never names.' },
            { icon: EyeOff, text: "We don't keep the numbers of people without Kip." },
            { icon: UserPlus, text: "You're only friends once you both accept." },
          ].map(({ icon: Icon, text }) => (
            <motion.li key={text} variants={{ hidden: { opacity: 0, x: -12 }, shown: { opacity: 1, x: 0, transition: ui } }} className="flex items-center gap-3 text-[15px] text-ink-2">
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/[0.045] text-ink">
                <Icon size={17} aria-hidden />
              </span>
              {text}
            </motion.li>
          ))}
        </motion.ul>
      </StepFrame>
    );
  const n = found.matched.length;
  return (
    <StepFrame
      {...frame}
      face={n ? 'happy' : 'think'}
      title={n ? `${plural(n, 'friend already uses', 'friends already use')} Kip` : 'No one from your contacts yet'}
      sub={n ? "Add them. You're friends once they accept." : 'You can invite them anytime from Friends, with your link.'}
      foot={<PrimaryButton onClick={onDone}>Continue</PrimaryButton>}
    >
      <Rise>
        <FoundList matched={found.matched} />
      </Rise>
    </StepFrame>
  );
}

/** "Friends can find me by my number", or not. Changed any time from Profile. */
function DiscoverStep({ frame, onDone }: { frame: Frame; onDone: () => void }) {
  const social = useSocial();
  const [on, setOn] = useState<boolean | null>(null);
  return (
    <StepFrame
      {...frame}
      face="point"
      title="Can friends find you by your number?"
      sub="You can change this anytime in Profile."
      foot={
        <PrimaryButton
          disabled={on === null}
          onClick={() => {
            void Promise.resolve(social?.repo.setDiscoverable(!!on)).catch(() => undefined);
            onDone();
          }}
        >
          Continue
        </PrimaryButton>
      }
    >
      <motion.div className="flex flex-col gap-3" role="radiogroup" aria-label="Who can find you" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.05 } } }}>
        <OptionRow icon={<IconTile icon={Users} />} label="Friends can find me by my number" checked={on === true} onToggle={() => setOn(true)} />
        <OptionRow icon={<IconTile icon={EyeOff} />} label="Keep me hidden, I'll send the requests" checked={on === false} onToggle={() => setOn(false)} />
      </motion.div>
    </StepFrame>
  );
}

// ---------- pieces shared with the "Finish setting up" screens on Home ----------

type Frame = { progress: number; onBack: () => void; backLabel?: string };

function PlanCard({ f }: { f: OnboardingFlow }) {
  const p = planFor(f);
  const r = mainReason(f);
  return <GoalCard icon={<GoalIconTile icon={r.icon} colour={r.colour} size={48} />} iconKey={r.icon} name={r.name} line={`${formatLei(p.target)} by ${formatDate(p.date)}`} weekly={p.weekly} />;
}

export function IncomeStep({
  frame,
  sources,
  monthly,
  onChange,
  onSave,
}: {
  frame: Frame;
  sources: string[];
  monthly: string;
  onChange: (patch: { incomeSources?: string[]; incomeMonthly?: string }) => void;
  onSave: (setup: Partial<SetupState>) => void;
}) {
  return (
    <StepFrame
      {...frame}
      title="Where does your money come from?"
      sub="Pick all that apply."
      foot={
        <>
          <PrimaryButton
            disabled={sources.length === 0}
            onClick={() => onSave({ incomeSources: sources, incomeMonthly: Number(monthly) > 0 ? Number(monthly) * 100 : null, incomeSkipped: false })}
          >
            Continue
          </PrimaryButton>
          <QuietButton onClick={() => onSave({ incomeSkipped: true })}>Fill this in later</QuietButton>
        </>
      }
    >
      <EmojiChoices label="Money in" items={INCOME} value={sources} onChange={(incomeSources) => onChange({ incomeSources })} />
      <AnimatePresence initial={false}>
        {sources.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -8 }}
            animate={{ opacity: 1, height: 'auto', y: 0, transition: { height: ui, opacity: { duration: 0.2, delay: 0.08 }, y: ui } }}
            exit={{ opacity: 0, height: 0, transition: { duration: 0.18 } }}
            className="overflow-hidden px-0.5 pb-1"
          >
            <Field
              label="About how much a month? Optional"
              inputMode="numeric"
              placeholder="e.g. 1500 lei"
              hint="A guess is fine."
              value={monthly}
              onChange={(e) => onChange({ incomeMonthly: e.target.value.replace(/\D/g, '').slice(0, 6) })}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </StepFrame>
  );
}

function NotifyStep({ frame, goalName, onDone }: { frame: Frame; goalName: string; onDone: (n: SetupState['notifications']) => void }) {
  const [busy, setBusy] = useState(false);
  async function turnOn() {
    setBusy(true);
    try {
      // the system pop-up; browsers without the API count as a "no" we can ask about again later
      const res = 'Notification' in window ? await Notification.requestPermission() : 'default';
      onDone(res === 'granted' ? 'granted' : res === 'denied' ? 'denied' : 'later');
    } finally {
      setBusy(false);
    }
  }
  const benefits = [
    { icon: Trophy, text: 'A cheer at 25%, 50% and 75%' },
    { icon: CalendarCheck, text: 'One gentle nudge a week, never spam' },
    { icon: BellOff, text: 'Turn them off anytime' },
  ];
  return (
    <StepFrame
      {...frame}
      title="Want a cheer when you hit a milestone?"
      foot={
        <>
          <PrimaryButton busy={busy} onClick={() => void turnOn()}>
            <motion.span
              className="inline-flex origin-top"
              animate={{ rotate: [0, 16, -14, 10, -6, 0] }}
              transition={{ duration: 0.8, delay: 1.1, repeat: Infinity, repeatDelay: 3.2 }}
              aria-hidden
            >
              <Bell size={17} />
            </motion.span>
            Turn on notifications
          </PrimaryButton>
          <QuietButton onClick={() => onDone('later')}>Not now</QuietButton>
        </>
      }
    >
      <motion.div variants={rise} className="overflow-hidden rounded-3xl bg-linear-to-b from-struct-soft to-surface-2 p-4 pt-10" aria-label="Example notification">
        <motion.div
          initial={{ y: -90, opacity: 0, scale: 0.94 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.35 }}
          className="flex items-center gap-3 rounded-[20px] bg-white/85 p-3 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.25)] backdrop-blur"
        >
          <img src="/mascot/icon-192.png" alt="" className="size-10 rounded-[10px]" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="flex justify-between text-[13px] font-semibold text-ink">
              Kip <span className="font-normal text-ink-3">now</span>
            </span>
            <span className="text-[14px] text-ink-2"><PartyPopper size={15} className="inline align-[-2px]" /> {goalName.trim() || 'Your goal'}: 25% saved!</span>
          </div>
        </motion.div>
      </motion.div>
      <motion.ul className="m-0 flex list-none flex-col gap-3 p-0" variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.06, delayChildren: 0.15 } } }}>
        {benefits.map(({ icon: Icon, text }) => (
          <motion.li key={text} variants={{ hidden: { opacity: 0, x: -12 }, shown: { opacity: 1, x: 0, transition: ui } }} className="flex items-center gap-3 text-[15px] text-ink-2">
            <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-black/[0.045] text-ink">
              <Icon size={17} aria-hidden />
            </span>
            {text}
          </motion.li>
        ))}
      </motion.ul>
    </StepFrame>
  );
}

export function FaceIdStep({ frame, onDone }: { frame: Frame; onDone: (on: boolean) => void }) {
  const { account } = useStore();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function allow() {
    setBusy(true);
    setErr(null);
    try {
      await enableDeviceUnlock(account?.id ?? 'kip', account?.name ?? '');
      setDone(true);
      navigator.vibrate?.([10, 40, 10]);
      await new Promise((r) => setTimeout(r, 650));
      onDone(true);
    } catch {
      setErr("Face ID didn't go through. Try again, or skip it for now.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <StepFrame
      {...frame}
      center
      title="Open Kip with Face ID next time"
      sub="Quick to open, private if someone grabs your phone. Falls back to your passcode."
      foot={
        <>
          <PrimaryButton busy={busy && !done} disabled={done} onClick={() => void allow()}>
            {done ? 'Face ID is on' : 'Allow'}
          </PrimaryButton>
          <QuietButton onClick={() => onDone(false)}>Not now</QuietButton>
        </>
      }
    >
      <div className="order-first grid place-items-center pb-2">
        <Float amount={4} duration={3.6}>
          <FaceScan done={done} />
        </Float>
      </div>
      <AnimatePresence initial={false}>
        {err && (
          <motion.p className="text-sm font-medium text-danger" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0, x: [0, -8, 8, -4, 4, 0] }} exit={{ opacity: 0 }} transition={ui}>
            {err}
          </motion.p>
        )}
      </AnimatePresence>
    </StepFrame>
  );
}

/**
 * "Let's make some routines": the words land one by one over the page (no backdrop, the page is
 * right there underneath), then fly up into Kip's bubble and the daily amounts slide in. Picking
 * one and pressing the button frosts the page and says what that comes to in the first week.
 */
function RoutineStep({ daily, introDone, onIntroDone, onPick, onNext }: { daily: number; introDone: boolean; onIntroDone: () => void; onPick: (lei: number) => void; onNext: () => void }) {
  const [phase, setPhase] = useState<'title' | 'pick' | 'confirm'>(introDone ? 'pick' : 'title');
  const [picked, setPicked] = useState(introDone);
  useEffect(() => {
    if (phase !== 'title') return;
    const t = window.setTimeout(() => {
      setPhase('pick');
      onIntroDone();
    }, 1900);
    return () => window.clearTimeout(t);
  }, [phase, onIntroDone]);

  const words = "Let's make some routines".split(' ');
  const title = phase === 'title';
  return (
    <>
      <StepFrame
        face="happy"
        title={
          title ? (
            // keeps the bubble's place while the big words are on screen
            <span className="invisible">Let's make some routines</span>
          ) : (
            <motion.span layoutId="routine-title" className="inline-block" transition={ui}>
              Let's make some routines
            </motion.span>
          )
        }
        sub="How much do you want to put aside each day?"
        foot={
          <PrimaryButton disabled={title || !picked} onClick={() => setPhase('confirm')}>
            I'm in
          </PrimaryButton>
        }
      >
        <motion.div
          className="flex flex-col gap-3"
          role="radiogroup"
          aria-label="Daily amount"
          initial={false}
          animate={title ? { opacity: 0, y: 24 } : { opacity: 1, y: 0 }}
          transition={{ ...ui, delay: title ? 0 : 0.2 }}
        >
          {DAILY.map((d, i) => (
            <motion.div key={d.lei} initial={false} animate={title ? { opacity: 0, x: 30 } : { opacity: 1, x: 0 }} transition={{ ...ui, delay: title ? 0 : 0.25 + i * 0.05 }}>
              <OptionRow
                label={`${d.lei} lei / day`}
                aside={d.tag}
                checked={picked && daily === d.lei}
                onToggle={() => {
                  setPicked(true);
                  onPick(d.lei);
                }}
              />
            </motion.div>
          ))}
        </motion.div>
      </StepFrame>

      {/* the words over the page: transparent, so the page shows through */}
      <AnimatePresence>
        {title && (
          <motion.div className="pointer-events-none fixed inset-0 z-40 grid place-items-center px-8" exit={{ opacity: 0, transition: { delay: 0.35, duration: 0.2 } }}>
            <motion.p layoutId="routine-title" className="text-center text-[40px] leading-[1.05] font-bold tracking-tight text-ink" transition={ui}>
              {words.map((w, i) => (
                <motion.span
                  key={w}
                  className="mr-[0.25em] inline-block last:mr-0"
                  initial={{ opacity: 0, y: 28, rotate: -6, filter: 'blur(6px)' }}
                  animate={{ opacity: 1, y: 0, rotate: 0, filter: 'blur(0px)' }}
                  transition={{ ...pop, delay: 0.15 + i * 0.16 }}
                >
                  {w}
                </motion.span>
              ))}
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* "That's 50 words in your first week!", in lei, frosted over the page */}
      <AnimatePresence>
        {phase === 'confirm' && (
          <BlurOver className="mx-auto max-w-md bg-bg/50 px-5 pb-[calc(env(safe-area-inset-bottom)+20px)]">
            <KipCenter face="celebrate" size={180}>
              <span className="sr-only">That's {daily * 7} lei in your first week!</span>
              <p className="text-[19px] leading-snug font-semibold text-ink" aria-hidden>
                That's{' '}
                <strong className="text-struct">
                  <NumberFlow value={daily * 7} locales="en-GB" suffix=" lei" />
                </strong>{' '}
                in your first week!
              </p>
            </KipCenter>
            <motion.div className="flex flex-col items-center gap-1" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ ...ui, delay: 0.4 }}>
              <PrimaryButton onClick={onNext}>Continue</PrimaryButton>
              <QuietButton onClick={() => setPhase('pick')}>Change the amount</QuietButton>
            </motion.div>
          </BlurOver>
        )}
      </AnimatePresence>
    </>
  );
}
