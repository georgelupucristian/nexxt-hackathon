import { CalendarCheck, Flag, HardDrive, LineChart, PiggyBank } from '@/lib/icons';
import { motion, useReducedMotion } from 'motion/react';
import { ChevronLeft } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { StreakRules } from '../components/sheets';
import { Banner, Button, TopBar } from '../components/ui';
import { CodeBoxes, Field, PrimaryButton, ResendTimer, type CodeState } from '../components/onboarding';
import { useSplashNavigate } from '../components/splash-transition';
import { AuthError } from '../data/storage';
import { useStore } from '../data/store';
import { formatNational, formatPhoneInput, PHONE_PREFIX, toE164 } from '../lib/phone';

// The welcome screen plays over Kip's video. Every time it opens, the intro clip (Kip swimming
// through a ring of coins) plays once, then the loop clip (Kip waving above the water, which picks
// up where the intro ends) takes over and repeats for as long as the page is open. Both are muted
// and inline so browsers allow autoplay.
function WelcomeVideo() {
  const reduce = useReducedMotion();
  const [introDone, setIntroDone] = useState(false);
  const loopRef = useRef<HTMLVideoElement>(null);

  if (reduce) {
    // no motion: a still of the loop's first frame
    return <img src="/video/loop-poster.webp" alt="" className="fixed inset-0 h-dvh w-screen object-cover object-[50%_25%]" />;
  }

  return (
    <div className="fixed inset-0 h-dvh w-screen" aria-hidden>
      {/* the loop waits underneath, already loaded, so it can start the moment the intro ends */}
      <video
        ref={loopRef}
        src="/video/loop.mp4"
        poster="/video/loop-poster.webp"
        muted
        playsInline
        loop
        preload="auto"
        // the intro's last frame stays on screen until the loop is actually moving: no blank flash
        onPlaying={() => setIntroDone(true)}
        className="absolute inset-0 size-full object-cover object-[50%_25%]"
      />
      {!introDone && (
        <video
          src="/video/intro.mp4"
          poster="/video/intro-poster.webp"
          muted
          playsInline
          autoPlay
          preload="auto"
          onEnded={() => void loopRef.current?.play().catch(() => setIntroDone(true))}
          onError={() => void loopRef.current?.play().catch(() => setIntroDone(true))}
          className="absolute inset-0 size-full object-cover object-[50%_25%]"
        />
      )}
    </div>
  );
}

export function Welcome() {
  const { enterDemo } = useStore();
  const nav = useNavigate();
  // sign up and sign in leave through a water splash
  const splashTo = useSplashNavigate();
  // the clip fills the whole window, so no empty scrollbar gutter beside it on a desktop
  useEffect(() => {
    const root = document.documentElement;
    const before = root.style.scrollbarGutter;
    root.style.scrollbarGutter = 'auto';
    return () => {
      root.style.scrollbarGutter = before;
    };
  }, []);
  const stagger = { hidden: {}, shown: { transition: { staggerChildren: 0.08, delayChildren: 0.3 } } };
  const item = { hidden: { opacity: 0, y: 16 }, shown: { opacity: 1, y: 0, transition: { type: 'spring' as const, bounce: 0, duration: 0.5 } } };
  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col overflow-hidden bg-ink">
      <WelcomeVideo />
      {/* keeps the text readable over the bright water */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 h-[60dvh] bg-linear-to-t from-ink via-ink/70 to-transparent" aria-hidden />

      <motion.div
        className="relative mt-auto flex flex-col gap-5 px-5 pb-[calc(env(safe-area-inset-bottom)+24px)]"
        variants={stagger}
        initial="hidden"
        animate="shown"
      >
        <motion.h1 variants={item} className="text-[40px]! leading-[1.02]! font-semibold! tracking-tight! text-white">
          Saving on a student budget? Totally doable.
        </motion.h1>
        <motion.div variants={item} className="flex flex-col items-center gap-1 pt-2">
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => splashTo('/start')}
            className="flex h-14 w-full cursor-pointer items-center justify-center rounded-2xl border-0 bg-[var(--gold)] text-[15px] font-semibold text-ink shadow-[0_4px_0_0_var(--gold-lip),0_8px_24px_-8px_rgba(0,0,0,0.4)] active:translate-y-[4px] active:shadow-none"
          >
            Get started
          </motion.button>
          <button type="button" onClick={() => splashTo('/signin')} className="flex h-11 cursor-pointer items-center border-0 bg-transparent px-4 text-[15px] font-medium text-white">
            I already have an account
          </button>
          <button
            type="button"
            className="onb__demo h-9 cursor-pointer border-0 bg-transparent px-3 text-[13px] text-white/70 underline-offset-4 hover:underline"
            onClick={() => {
              enterDemo();
              nav('/home');
            }}
          >
            Try it with demo data
          </button>
        </motion.div>
        <motion.p variants={item} className="text-center text-[12px] leading-relaxed text-white/60">
          By continuing you agree to Kip's Terms of Service and Privacy Policy.
        </motion.p>
      </motion.div>
    </div>
  );
}

export function HowItWorks() {
  const { account } = useStore();
  const nav = useNavigate();
  const steps = [
    { icon: Flag, title: 'Pick what you are saving for', body: 'An emergency fund, a laptop, an Erasmus semester, anything. Set a target and, if you like, a date.' },
    { icon: CalendarCheck, title: 'Make a plan that fits', body: 'Weekly, monthly or flexible. Kip shows you what each option means for the day you finish. You can shrink it, pause it or change it anytime.' },
    { icon: PiggyBank, title: 'Put real money aside', body: 'A daily amount is collected from your card once a month through Stripe, and you can add more or withdraw anytime. The demo only uses sample data.' },
    { icon: LineChart, title: 'See where you are', body: 'One balance, split between your goals and money without a goal, so the same money is never counted twice.' },
  ];
  return (
    <main className="screen screen--bare">
      <TopBar title="How Kip works" heading onBack={() => nav(account ? '/profile' : '/welcome')} />
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
          <strong>Money progress</strong> is the money itself: what you put aside, or what the demo connection simulates. <strong>Consistency</strong> is your streak: how many
          days in a row you put money aside, however little. We track them separately and never mix them up.
        </p>
        <StreakRules />
      </section>
      <Banner tone="neutral" icon={HardDrive}>
        Your account and data are saved in the cloud (Supabase), and payments go through Stripe. The demo stays in this browser only.
      </Banner>
      {!account && (
        <Button variant="primary" block onClick={() => nav('/start')}>
          Create an account
        </Button>
      )}
    </main>
  );
}

/** Passwordless sign-in: your phone number, then its 6-digit code. */
export function SignIn() {
  const { startPhone, verifyPhone } = useStore();
  const nav = useNavigate();
  const [phone, setPhone] = useState(PHONE_PREFIX);
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [codeState, setCodeState] = useState<CodeState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const e164 = toE164(phone);

  async function run(fn: () => Promise<void>, onFail?: () => void) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof AuthError ? err.message : "We couldn't sign you in. Try again?");
      onFail?.();
    } finally {
      setBusy(false);
    }
  }

  const send = () =>
    run(async () => {
      if (!e164) return;
      await startPhone(e164);
      setSent(true);
    });

  const shell = (onBack: () => void, title: string, sub: ReactNode, body: ReactNode) => (
    <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 overflow-x-clip px-5 pt-[calc(env(safe-area-inset-top)+12px)] pb-8">
      <button type="button" onClick={onBack} aria-label="Back" className="grid size-11 cursor-pointer place-items-center rounded-2xl border border-black/10 bg-white text-ink-2">
        <ChevronLeft size={20} aria-hidden />
      </button>
      <div className="flex flex-col gap-2">
        <h1 className="text-[28px]! leading-[1.12]! font-semibold! tracking-tight! text-ink">{title}</h1>
        <p className="text-[15px] text-ink-3">{sub}</p>
      </div>
      {body}
    </div>
  );

  if (sent && e164) {
    return shell(
      () => (setSent(false), setCode(''), setError(null), setCodeState('idle')),
      'Enter the code',
      <>
        The 6-digit code for <strong className="font-semibold text-ink">{formatNational(e164)}</strong>
      </>,
      <div className="flex flex-col gap-3">
        <CodeBoxes
          value={code}
          onChange={(v) => (setCode(v), setError(null), codeState === 'error' && setCodeState('idle'))}
          onComplete={(v) =>
            void run(
              async () => {
                const res = await verifyPhone(e164, v);
                setCodeState('success');
                // a number with no plan yet: sign-up takes it from there and saves it to this account
                nav(res.completed ? '/home' : '/start', { replace: true });
              },
              () => (setCode(''), setCodeState('error')),
            )
          }
          state={codeState}
          disabled={busy}
        />
        {error && (
          <p className="text-sm font-medium text-danger" role="alert">
            {error}
          </p>
        )}
        <ResendTimer onResend={() => void send()} />
      </div>,
    );
  }

  return shell(
    () => nav('/welcome'),
    'Welcome back',
    'Sign in without a password.',
    <div className="flex flex-col gap-6">
      <form
        className="flex flex-col gap-3"
        noValidate
        onSubmit={(ev) => {
          ev.preventDefault();
          if (e164) void send();
        }}
      >
        <Field
          id="signin-phone"
          label="Phone number"
          type="tel"
          autoComplete="tel"
          inputMode="tel"
          placeholder="+40 7xx xxx xxx"
          value={phone}
          onFocus={() => !phone && setPhone(PHONE_PREFIX)}
          onChange={(e) => (setPhone(formatPhoneInput(e.target.value)), setError(null))}
          error={error}
        />
        <PrimaryButton type="submit" disabled={busy || !e164}>
          {busy ? 'Sending…' : 'Text me a code'}
        </PrimaryButton>
      </form>
      <p className="text-center text-sm text-ink-3">
        New here?{' '}
        <Link to="/start" className="font-semibold text-ink no-underline hover:underline">
          Get started
        </Link>
      </p>
    </div>,
  );
}
