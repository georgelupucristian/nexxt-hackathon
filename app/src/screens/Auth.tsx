import { CalendarCheck, Flag, HardDrive, LineChart, PiggyBank } from '@/lib/icons';
import { motion } from 'motion/react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/nav';
import { StreakRules } from '../components/sheets';
import { MascotSays, MASCOT_NAME } from '../components/mascot/MascotSays';
import { FloatingInput } from '../components/watermelon/floating-input';
import { Banner, Button, TopBar } from '../components/ui';
import { AuthError } from '../data/storage';
import { useStore } from '../data/store';

export function Welcome() {
  const { enterDemo } = useStore();
  const nav = useNavigate();
  const stagger = { hidden: {}, shown: { transition: { staggerChildren: 0.08, delayChildren: 0.5 } } };
  const item = { hidden: { opacity: 0, y: 16 }, shown: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 380, damping: 30 } } };
  return (
    <div className="welcome">
      <header className="row row--between">
        <Brand />
        <Link to="/how-it-works" className="link-btn">
          How it works
        </Link>
      </header>
      <div className="welcome__hero">
        <MascotSays state="wave" size={230} layout="stack" message={`Hi! I’m ${MASCOT_NAME}. Let’s save up for something you actually want.`} />
      </div>
      <motion.div className="stack-lg" variants={stagger} initial="hidden" animate="shown">
        <motion.h1 variants={item} className="welcome__title">
          Saving, but make it a habit.
        </motion.h1>
        <motion.p variants={item} className="muted welcome__sub">
          Pick a goal, set a plan that fits your week, and watch it add up. No bank details needed.
        </motion.p>
        <motion.div variants={item} className="stack">
          <button type="button" className="btn btn--primary btn--block btn--xl" onClick={() => nav('/start')}>
            Get started
          </button>
          <button type="button" className="btn btn--secondary btn--block btn--xl" onClick={() => nav('/signin')}>
            I already have an account
          </button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              enterDemo();
              nav('/home');
            }}
          >
            Explore with sample data
          </Button>
        </motion.div>
      </motion.div>
    </div>
  );
}

export function HowItWorks() {
  const { account } = useStore();
  const nav = useNavigate();
  const steps = [
    { icon: Flag, title: 'Choose what you’re saving for', body: 'An emergency fund, a laptop, an exchange semester — or anything else. Add a target and, if you like, a date.' },
    { icon: CalendarCheck, title: 'Set a plan that fits', body: 'Weekly, monthly or flexible. Kept shows what each option means for your finish date. You can lower it, pause it or change it anytime.' },
    { icon: PiggyBank, title: 'Record what you save', body: 'Log contributions and withdrawals yourself, or try the clearly-labelled demo connection. Kept never moves real money.' },
    { icon: LineChart, title: 'See where you stand', body: 'One balance, split between goals and unallocated savings — so the same money is never counted twice.' },
  ];
  return (
    <div className="screen screen--bare">
      <TopBar title="How Kept works" onBack={() => nav(account ? '/profile' : '/welcome')} />
      <ol className="stack-lg" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {steps.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className="row row--top" style={{ gap: 'var(--s-4)' }}>
            <span className="option__icon" aria-hidden>
              <Icon size={22} />
            </span>
            <div className="stack" style={{ gap: 4 }}>
              <h2>
                <span className="subtle">{i + 1}. </span>
                {title}
              </h2>
              <p className="muted">{body}</p>
            </div>
          </li>
        ))}
      </ol>
      <section className="card stack-lg">
        <h2>Two kinds of progress</h2>
        <p className="muted">
          <strong>Financial progress</strong> is money: what you recorded or what the demo connection simulates. <strong>Consistency</strong> is your streak: how often you
          took a savings action. They are tracked separately and never mixed.
        </p>
        <StreakRules />
      </section>
      <Banner tone="neutral" icon={HardDrive}>
        Your account and data are stored in this browser on this device. There’s no Kept server and no real bank connection in this version.
      </Banner>
      {!account && (
        <Button variant="primary" block onClick={() => nav('/start')}>
          Create account
        </Button>
      )}
    </div>
  );
}

export function SignIn() {
  const { signIn } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({ email: '', password: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!f.email.trim() || !f.password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(f.email, f.password);
      nav('/home', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Could not sign you in. Please try again.');
      setBusy(false);
    }
  }

  const say = error
    ? { state: 'sad' as const, text: 'Hmm, that didn’t work. Check your email and password?' }
    : f.email && f.password
      ? { state: 'happy' as const, text: 'Ready when you are.' }
      : { state: 'wave' as const, text: 'Welcome back! Good to see you again.' };

  return (
    <div className="screen screen--bare auth">
      <TopBar onBack={() => nav('/welcome')} />
      <MascotSays state={say.state} message={say.text} size={120} />
      <form className="stack-lg" onSubmit={submit} noValidate>
        <FloatingInput label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <FloatingInput label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={error} />
        <motion.button type="submit" className="btn btn--primary btn--block btn--xl" disabled={busy} whileTap={{ scale: 0.97 }}>
          {busy ? <span className="spinner" aria-label="Signing in" /> : 'Sign in'}
        </motion.button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          New here?{' '}
          <Link to="/start" className="strong">
            Start with a goal
          </Link>
        </p>
      </form>
    </div>
  );
}
