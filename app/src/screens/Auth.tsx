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
          Cum funcționează
        </Link>
      </header>
      <div className="welcome__hero">
        <MascotSays state="wave" size={230} layout="stack" message={`Salut! Sunt ${MASCOT_NAME}. Hai să strângem bani pentru ceva ce chiar îți dorești.`} />
      </div>
      <motion.div className="stack-lg" variants={stagger} initial="hidden" animate="shown">
        <motion.h1 variants={item} className="welcome__title">
          Fă din economisit un <span className="brush welcome__brush">obicei</span>
        </motion.h1>
        <motion.p variants={item} className="muted welcome__sub">
          Alege un obiectiv, fă-ți un plan pe măsura săptămânii tale și vezi cum se adună. Fără date bancare.
        </motion.p>
        <motion.div variants={item} className="stack">
          <button type="button" className="btn btn--primary btn--block btn--xl" onClick={() => nav('/start')}>
            Hai să începem
          </button>
          <button type="button" className="btn btn--secondary btn--block btn--xl" onClick={() => nav('/signin')}>
            Am deja cont
          </button>
          <Button
            variant="ghost"
            block
            onClick={() => {
              enterDemo();
              nav('/home');
            }}
          >
            Încearcă cu date demo
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
    { icon: Flag, title: 'Alege pentru ce strângi bani', body: 'Un fond de urgență, un laptop, un semestru Erasmus, orice. Pune o țintă și, dacă vrei, o dată.' },
    { icon: CalendarCheck, title: 'Fă-ți un plan pe măsură', body: 'Săptămânal, lunar sau flexibil. Kip îți arată ce înseamnă fiecare variantă pentru data la care termini. Îl poți micșora, pune pe pauză sau schimba oricând.' },
    { icon: PiggyBank, title: 'Notează ce economisești', body: 'Notezi singur depunerile și retragerile sau încerci conexiunea demo, marcată clar. Kip nu mută niciodată bani reali.' },
    { icon: LineChart, title: 'Vezi unde ești', body: 'Un singur sold, împărțit între obiective și economii nealocate, ca aceiași bani să nu fie numărați de două ori.' },
  ];
  return (
    <div className="screen screen--bare">
      <TopBar title="Cum funcționează Kip" onBack={() => nav(account ? '/profile' : '/welcome')} />
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
        <h2>Două feluri de progres</h2>
        <p className="muted">
          <strong>Progresul financiar</strong> înseamnă bani: ce ai notat sau ce simulează conexiunea demo. <strong>Constanța</strong> e streak-ul ta: cât de des ai făcut
          ceva pentru economii. Le urmărim separat și nu le amestecăm niciodată.
        </p>
        <StreakRules />
      </section>
      <Banner tone="neutral" icon={HardDrive}>
        Contul și datele tale sunt salvate în browserul de pe acest dispozitiv. În versiunea asta nu există server Kip și nici conexiune la o bancă reală.
      </Banner>
      {!account && (
        <Button variant="primary" block onClick={() => nav('/start')}>
          Creează cont
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
      setError('Scrie emailul și parola.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(f.email, f.password);
      nav('/home', { replace: true });
    } catch (err) {
      setError(err instanceof AuthError ? err.message : 'Nu te-am putut conecta. Mai încearcă o dată.');
      setBusy(false);
    }
  }

  const say = error
    ? { state: 'sad' as const, text: 'Hmm, n-a mers. Verifici emailul și parola?' }
    : f.email && f.password
      ? { state: 'happy' as const, text: 'Gata când ești și tu.' }
      : { state: 'wave' as const, text: 'Bine ai revenit! Mă bucur să te văd iar.' };

  return (
    <div className="screen screen--bare auth">
      <TopBar onBack={() => nav('/welcome')} />
      <MascotSays state={say.state} message={say.text} size={120} />
      <form className="stack-lg" onSubmit={submit} noValidate>
        <FloatingInput label="Email" type="email" autoComplete="email" inputMode="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <FloatingInput label="Parolă" type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} error={error} />
        <motion.button type="submit" className="btn btn--primary btn--block btn--xl" disabled={busy} whileTap={{ scale: 0.97 }}>
          {busy ? <span className="spinner" aria-label="Te conectăm" /> : 'Intră în cont'}
        </motion.button>
        <p className="small muted" style={{ textAlign: 'center' }}>
          Prima dată aici?{' '}
          <Link to="/start" className="strong">
            Începe cu un obiectiv
          </Link>
        </p>
      </form>
    </div>
  );
}
