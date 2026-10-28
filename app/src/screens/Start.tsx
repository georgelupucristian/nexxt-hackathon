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
import { plural } from '../lib/ro';

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
  { kind: 'emergency', title: 'Fond de urgență', desc: 'O rezervă pentru neprevăzute', name: 'Fond de urgență', tint: 'today' },
  { kind: 'tech', title: 'Laptop sau gadgeturi', desc: 'Laptop nou, telefon, accesorii', name: 'Laptop nou', tint: 'activity' },
  { kind: 'travel', title: 'Călătorie sau Erasmus', desc: 'Mobilități, excursii, zboruri', name: 'Semestru Erasmus', tint: 'goals' },
  { kind: 'custom', title: 'Altceva', desc: 'Pune-i tu un nume', name: '', tint: 'profile' },
];

const DEADLINES = [
  { label: 'Fără termen', days: 0 },
  { label: 'În 3 luni', days: 91 },
  { label: 'În 6 luni', days: 182 },
  { label: 'Într-un an', days: 365 },
];

// plural() returns "20 de săptămâni"; NumberFlow draws the number itself, so keep only the words
const unit = (n: number, one: string, other: string) => plural(n, one, other).slice(String(n).length + 1);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function strength(pw: string): { score: number; label: string } {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw) || /[^A-Za-z0-9]/.test(pw)) s++;
  return { score: s, label: ['Prea scurtă', 'Merge', 'Bună', 'Puternică', 'Foarte puternică'][s] };
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

  const name = d.name.trim() || 'prietene';
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
        { kind: d.kind ?? 'custom', name: d.goalName.trim() || 'Obiectivul meu', target: d.target, targetDate: d.deadline || null, motivation: '', plan },
        { tracking: d.tracking, reminder: { enabled: d.reminderOn, day: d.reminderDay, time: d.reminderTime } },
      );
      sessionStorage.removeItem(KEY);
      setPhase('building');
    } catch (err) {
      signedUpHere.current = false;
      setAuthError(err instanceof AuthError ? err.message : 'Nu am putut crea contul. Mai încearcă o dată.');
      if (err instanceof AuthError && err.field === 'email') setAccountStep(0);
    } finally {
      setBusy(false);
    }
  }

  // ---- what Kip says and whether Continue is allowed, per step ----
  let say: { state: SealState; text: string };
  let canGo = true;
  let cta = 'Continuă';
  switch (id) {
    case 'hello':
      say = { state: 'wave', text: `Salut! Sunt ${MASCOT_NAME}. Te ajut să strângi bani pentru ce-ți dorești, câte un pas mic pe rând.` };
      cta = 'Hai';
      break;
    case 'name':
      say = d.name.trim() ? { state: 'happy', text: `${d.name.trim()}! Îmi place.` } : { state: 'think', text: 'Mai întâi: cum să-ți spun?' };
      canGo = d.name.trim().length > 0;
      break;
    case 'kind':
      say = { state: d.kind ? 'happy' : 'wave', text: d.kind ? 'Bună alegere. Hai să prindă contur.' : `Mă bucur să te cunosc, ${name}! Pentru ce strângi bani?` };
      canGo = !!d.kind && d.goalName.trim().length > 0;
      break;
    case 'target':
      say = { state: 'think', text: `De cât ai nevoie pentru ${d.goalName.trim() || 'asta'}?` };
      canGo = d.target > 0;
      break;
    case 'plan':
      say =
        d.frequency === 'flexible'
          ? { state: 'happy', text: 'Flexibil merge. Pui deoparte când poți, eu țin socoteala.' }
          : lateForDeadline
            ? { state: 'think', text: 'Așa termini după data țintă. Un pic mai mult ar ajuta, dar poți rămâne și așa. Planul se poate schimba oricând.' }
            : { state: 'point', text: `Cât poți pune deoparte ${d.frequency === 'weekly' ? 'pe săptămână' : 'pe lună'}? Trage de riglă.` };
      canGo = d.frequency === 'flexible' || d.amount > 0;
      break;
    case 'tracking':
      say = { state: 'idle', text: 'Cum vrei să ții evidența? Nu mă ating niciodată de banii tăi, doar țin socoteala.' };
      break;
    case 'reminder':
      say = { state: 'wave', text: 'Vrei un memento o dată pe săptămână? Cine primește unul economisește mai des.' };
      cta = d.reminderOn ? 'Amintește-mi' : 'Continuă';
      break;
    case 'account':
      say = { state: 'happy', text: `Ultimul pas, ${name}! Hai să-ți salvăm planul, ca să-l găsești și data viitoare.` };
      break;
  }

  if (phase !== 'flow') {
    return (
      <div className="start start--center">
        {phase === 'building' ? (
          <motion.div className="start__building" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <MascotSays state="think" message="Stai o secundă…" size={170} layout="stack" appear="none" />
            <LabeledProgressIndicator
              labels={[`Pregătesc ${d.goalName.trim() || 'obiectivul tău'}…`, 'Îți planific săptămânile…', 'Îți încălzesc streak-ul…', 'Gata!']}
              durationMs={2600}
              onDone={() => {
                setPhase('done');
                celebrate({ title: `Totul e pregătit, ${name}!`, sub: 'Primul tău obiectiv te așteaptă.' });
              }}
            />
          </motion.div>
        ) : (
          <motion.div className="start__done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 2.4, type: 'spring', stiffness: 300, damping: 26 }}>
            <MascotSays state="happy" message={`Uite planul, ${name}.`} size={150} layout="stack" appear="none" />
            <div className="start__summary">
              <SummaryRow label="Obiectiv" value={d.goalName.trim() || 'Obiectivul meu'} />
              <SummaryRow label="Țintă" value={`${formatLei(d.target)}${d.deadline ? ` până la ${formatDate(d.deadline)}` : ''}`} />
              <SummaryRow label="Plan" value={d.frequency === 'flexible' ? 'Flexibil' : `${formatLei(d.amount)} ${d.frequency === 'weekly' ? 'pe săptămână' : 'pe lună'}`} />
              {finish && <SummaryRow label="Gata pe la" value={formatDate(finish)} />}
            </div>
            <button type="button" className="btn btn--primary btn--block btn--xl" onClick={() => nav('/home', { replace: true })}>
              Du-mă la economiile mele
            </button>
          </motion.div>
        )}
      </div>
    );
  }

  return (
    <div className="start">
      <header className="start__bar">
        <button type="button" className="icon-btn" onClick={back} aria-label={d.step === 0 ? 'Înapoi la început' : 'Întrebarea anterioară'}>
          <ArrowLeft size={22} aria-hidden />
        </button>
        <div className="start__progress" role="progressbar" aria-label="Progresul configurării" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={d.step + 1}>
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
              <FloatingInput label="Prenumele tău" autoComplete="given-name" autoFocus maxLength={40} value={d.name} onChange={(e) => set({ name: e.target.value })} />
            </form>
          )}

          {id === 'kind' && (
            <div className="stack-lg">
              <div className="choice-list" role="radiogroup" aria-label="Pentru ce strângi bani">
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
                    <FloatingInput label="Numele obiectivului" maxLength={48} value={d.goalName} onChange={(e) => set({ goalName: e.target.value })} autoFocus={d.kind === 'custom'} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {id === 'target' && (
            <div className="stack-lg">
              <AmountRuler label="Suma țintă" value={d.target} onChange={(v) => set({ target: v })} step={10_00} min={1_00} max={30_000_00} />
              <div className="chip-row" role="group" aria-label="Sume rapide">
                {[1_000_00, 2_500_00, 5_000_00, 10_000_00].map((v) => (
                  <motion.button key={v} type="button" className="chip" aria-pressed={d.target === v} whileTap={{ scale: 0.92 }} onClick={() => set({ target: v })}>
                    {formatLei(v)}
                  </motion.button>
                ))}
              </div>
              <div className="stack" style={{ gap: 8 }}>
                <p className="small subtle strong">Până când?</p>
                <div className="chip-row" role="radiogroup" aria-label="Termen">
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
                label="Cât de des"
                value={d.frequency}
                onChange={(f) => set({ frequency: f, amount: f === 'monthly' && d.frequency === 'weekly' ? Math.round((d.amount * 4.3) / 5_00) * 5_00 : f === 'weekly' && d.frequency === 'monthly' ? Math.max(5_00, Math.round(d.amount / 4.3 / 5_00) * 5_00) : d.amount })}
                tabs={[
                  { id: 'weekly', label: 'Săptămânal' },
                  { id: 'monthly', label: 'Lunar' },
                  { id: 'flexible', label: 'Flexibil' },
                ]}
              />
              {d.frequency !== 'flexible' ? (
                <>
                  <AmountRuler label={d.frequency === 'weekly' ? 'Suma pe săptămână' : 'Suma pe lună'} value={d.amount} onChange={(v) => set({ amount: v })} step={1_00} min={1_00} max={d.frequency === 'weekly' ? 1_500_00 : 5_000_00} />
                  <motion.div layout className={`estimate ${lateForDeadline ? 'estimate--late' : ''}`}>
                    {periods > 0 ? (
                      <>
                        <span>
                          Cam <NumberFlow value={periods} className="estimate__num" /> {d.frequency === 'weekly' ? unit(periods, 'săptămână', 'săptămâni') : unit(periods, 'lună', 'luni')}
                        </span>
                        {finish && <span className="estimate__date">gata pe la {formatDate(finish)}</span>}
                      </>
                    ) : (
                      <span>Trage ca să alegi o sumă</span>
                    )}
                  </motion.div>
                </>
              ) : (
                <div className="estimate">
                  <span>Fără sumă fixă. Adaugă economii când îți permiți.</span>
                </div>
              )}
            </div>
          )}

          {id === 'tracking' && (
            <div className="choice-list" role="radiogroup" aria-label="Cum ții evidența economiilor">
              <Choice index={0} selected={d.tracking === 'manual'} tint="today" icon={<Emoji3D name="pencil" size={34} />} title="Notez eu ce economisesc" desc="Pui bani deoparte oriunde, apoi apeși + în Kip. Recomandat." onSelect={() => set({ tracking: 'manual' })} />
              <Choice index={1} selected={d.tracking === 'demo'} tint="profile" icon={<Emoji3D name="testtube" size={34} />} title="Încearcă o conexiune demo" desc="Vezi cum s-ar comporta un cont conectat. Totul e simulat." onSelect={() => set({ tracking: 'demo' })} />
            </div>
          )}

          {id === 'reminder' && (
            <div className="stack-lg">
              <div className="choice-list" role="radiogroup" aria-label="Memento săptămânal">
                <Choice index={0} selected={d.reminderOn} tint="activity" icon={<Emoji3D name="bell" size={34} />} title="Da, amintește-mi săptămânal" desc="Apare în Kip în ziua pe care o alegi." onSelect={() => set({ reminderOn: true })} />
                <Choice index={1} selected={!d.reminderOn} tint="goals" icon={<Emoji3D name="sleep" size={34} />} title="Nu, mersi" desc="Îl poți porni mai târziu din Profil." onSelect={() => set({ reminderOn: false })} />
              </div>
              <AnimatePresence>
                {d.reminderOn && (
                  <motion.div className="stack" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
                    <div className="chip-row chip-row--days" role="radiogroup" aria-label="Ziua pentru memento">
                      {WEEKDAY_NAME.map((n, i) => (
                        <motion.button key={n} type="button" role="radio" aria-checked={d.reminderDay === i} aria-label={n} className="chip chip--day" whileTap={{ scale: 0.9 }} onClick={() => set({ reminderDay: i })}>
                          {n.slice(0, 2)}
                        </motion.button>
                      ))}
                    </div>
                    <FloatingInput label="La ora" type="time" value={d.reminderTime} onChange={(e) => set({ reminderTime: e.target.value || '19:00' })} />
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
                  { id: 'email', label: 'Email', type: 'email', placeholder: 'Emailul tău', autoComplete: 'email', validate: (v) => (EMAIL_RE.test(v.trim()) ? null : 'Încă nu arată a email. Ceva de genul nume@example.com.') },
                  {
                    id: 'password',
                    label: 'Parolă',
                    type: 'password',
                    placeholder: 'Alege o parolă',
                    autoComplete: 'new-password',
                    validate: (v) => (v.length >= 8 ? null : 'Folosește cel puțin 8 caractere.'),
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
                doneLabel="Creează cont"
              />
              <p className="start__fine">
                <HardDrive size={14} aria-hidden /> Salvat doar în acest browser. Fără date bancare, niciodată.
              </p>
              <p className="start__fine">
                Ai deja cont? <Link to="/signin">Intră în cont</Link>
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
              Am deja cont
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
      <span className="strength__label">{pw ? label : 'Cel puțin 8 caractere'}</span>
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
