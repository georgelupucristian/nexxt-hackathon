import { AlertCircle, CalendarCheck, Flag, HardDrive, LineChart, PiggyBank } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brand } from '../components/nav';
import { StreakRules } from '../components/sheets';
import { Banner, Button, ProgressBar, TextField, TopBar } from '../components/ui';
import { AuthError } from '../data/storage';
import { useStore } from '../data/store';

export function Welcome() {
  const { enterDemo } = useStore();
  const nav = useNavigate();
  return (
    <div className="welcome">
      <header className="row row--between">
        <Brand />
        <Link to="/how-it-works" className="link-btn">
          How it works
        </Link>
      </header>
      <div className="welcome__hero">
        <div className="preview-card" aria-hidden>
          <div className="row row--between small" style={{ opacity: 0.7 }}>
            <span>Example goal</span>
            <span>62%</span>
          </div>
          <div style={{ fontSize: 'var(--fs-xl)', fontWeight: 700 }}>Laptop for uni</div>
          <ProgressBar value={0.62} label="Example" onDark />
          <div className="row row--between small" style={{ opacity: 0.7 }}>
            <span>2.790 of 4.500 lei</span>
            <span>100 lei every Friday</span>
          </div>
        </div>
        <div className="stack-lg">
          <h1 className="welcome__title">Pick a goal. Make a plan. Watch it add up.</h1>
          <p className="muted" style={{ fontSize: 'var(--fs-lg)', maxWidth: '36ch' }}>
            Kept turns what you’re saving for into a realistic weekly or monthly plan — and lets you change it whenever life does.
          </p>
        </div>
      </div>
      <div className="stack">
        <Button variant="primary" block onClick={() => nav('/signup')}>
          Create account
        </Button>
        <Button block onClick={() => nav('/signin')}>
          Sign in
        </Button>
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
      </div>
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
        <Button variant="primary" block onClick={() => nav('/signup')}>
          Create account
        </Button>
      )}
    </div>
  );
}

function AuthLayout({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  const nav = useNavigate();
  return (
    <div className="screen screen--bare">
      <TopBar onBack={() => nav('/welcome')} />
      <div className="stack" style={{ gap: 6 }}>
        <h1>{title}</h1>
        <p className="muted">{sub}</p>
      </div>
      {children}
    </div>
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function SignUp() {
  const { signUp } = useStore();
  const nav = useNavigate();
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<'name' | 'email' | 'password' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);

  function validate() {
    const e: typeof errors = {};
    if (!f.name.trim()) e.name = 'Tell us what to call you.';
    if (!EMAIL_RE.test(f.email.trim())) e.email = 'Enter a valid email, like name@example.com.';
    if (f.password.length < 8) e.password = 'Use at least 8 characters.';
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      await signUp(f.name, f.email, f.password);
      nav('/onboarding', { replace: true });
    } catch (err) {
      setErrors(err instanceof AuthError ? { [err.field]: err.message } : { form: 'Could not create your account. Please try again.' });
      setBusy(false);
    }
  }

  return (
    <AuthLayout title="Create your account" sub="Takes under a minute. No bank details needed.">
      <form className="stack-lg" onSubmit={submit} noValidate>
        <TextField label="First name" autoComplete="given-name" value={f.name} error={errors.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={40} />
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} error={errors.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField
          label="Password"
          type="password"
          autoComplete="new-password"
          value={f.password}
          error={errors.password}
          hint="At least 8 characters."
          onChange={(e) => setF({ ...f, password: e.target.value })}
        />
        {errors.form && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {errors.form}
          </div>
        )}
        <Banner tone="neutral" icon={HardDrive}>
          Your account is stored securely in this browser on this device only. Signing in on another device won’t find it.
        </Banner>
        <Button type="submit" variant="primary" block loading={busy}>
          Create account
        </Button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Already have an account?{' '}
          <Link to="/signin" className="strong">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
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

  return (
    <AuthLayout title="Welcome back" sub="Sign in to pick up where you left off.">
      <form className="stack-lg" onSubmit={submit} noValidate>
        <TextField label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <TextField label="Password" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        {error && (
          <div className="form-error" role="alert">
            <AlertCircle size={18} aria-hidden /> {error}
          </div>
        )}
        <Button type="submit" variant="primary" block loading={busy}>
          Sign in
        </Button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          New here?{' '}
          <Link to="/signup" className="strong">
            Create an account
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
