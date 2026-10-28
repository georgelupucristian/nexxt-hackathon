import {
  Accessibility,
  Bell,
  BookOpen,
  ChevronRight,
  Download,
  Flame,
  FlaskConical,
  HardDrive,
  LifeBuoy,
  Link2,
  LogOut,
  PenLine,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserRound,
  type LucideIcon,
} from '@/lib/icons';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { StreakRules } from '../components/sheets';
import { Banner, Button, ConfirmDialog, DayPicker, Field, Switch, TextField, TopBar, useToast } from '../components/ui';
import { bestStreak, currentStreak } from '../data/selectors';
import { AuthError } from '../data/storage';
import { useData, useStore } from '../data/store';
import { relativeTime, WEEKDAY_NAME } from '../lib/dates';
import { plural } from '../lib/ro';

/** "Lun", "Mar"… cut from the localized weekday names. */
function shortDay(i: number): string {
  const n = WEEKDAY_NAME[i];
  return n.charAt(0).toUpperCase() + n.slice(1, 3);
}

interface Item {
  to: string;
  label: string;
  icon: LucideIcon;
  detail?: string;
}

export function Profile() {
  const data = useData();
  const { account, signOut } = useStore();
  const nav = useNavigate();
  const [confirmOut, setConfirmOut] = useState(false);

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Economii',
      items: [
        { to: '/profile/tracking', label: 'Urmărire și conexiuni', icon: Link2, detail: data.tracking === 'demo' ? 'Conexiune demo' : 'Manual' },
        { to: '/profile/reminders', label: 'Mementouri', icon: Bell, detail: data.reminder.enabled ? `${shortDay(data.reminder.day)} ${data.reminder.time}` : 'Oprit' },
        { to: '/profile/streaks', label: 'Regulile streak-ului', icon: Flame, detail: plural(currentStreak(data), 'zi', 'zile') },
      ],
    },
    {
      title: 'Cont',
      items: [
        { to: '/profile/account', label: 'Date personale', icon: UserRound },
        { to: '/profile/privacy', label: 'Confidențialitate și securitate', icon: ShieldCheck },
        { to: '/profile/accessibility', label: 'Accesibilitate', icon: Accessibility },
      ],
    },
    {
      title: 'Suport',
      items: [
        { to: '/how-it-works', label: 'Cum funcționează Kip', icon: BookOpen },
        { to: '/profile/help', label: 'Ajutor și întrebări frecvente', icon: LifeBuoy },
      ],
    },
  ];

  return (
    <div className="screen">
      <header className="page-head" style={{ justifyContent: 'flex-start', gap: 'var(--s-4)' }}>
        <span className="icon-btn icon-btn--filled" style={{ width: 64, height: 64, fontSize: 'var(--fs-xl)', fontWeight: 750 }} aria-hidden>
          {account?.name.charAt(0).toUpperCase()}
        </span>
        <div className="grow">
          <h1 className="truncate">{account?.name}</h1>
          <p className="small muted truncate">{account?.isDemo ? 'Cont demo · date demo' : account?.email}</p>
        </div>
      </header>

      {groups.map((g) => (
        <section key={g.title} className="section" aria-label={g.title}>
          <h2 className="group-label">{g.title}</h2>
          <div className="card card--flush">
            <ul className="list">
              {g.items.map(({ to, label, icon: Icon, detail }) => (
                <li key={to}>
                  <Link to={to} className="list-row">
                    <span className="list-row__icon">
                      <Icon size={18} aria-hidden />
                    </span>
                    <span className="list-row__body strong">{label}</span>
                    {detail && <span className="small subtle">{detail}</span>}
                    <ChevronRight size={18} className="subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      ))}

      <Button block icon={LogOut} onClick={() => setConfirmOut(true)}>
        Ieși din cont
      </Button>
      <p className="xs subtle" style={{ textAlign: 'center' }}>
        Kip 0.1 · datele stau pe acest dispozitiv
      </p>
      <ConfirmDialog
        open={confirmOut}
        title="Ieși din cont?"
        body="Obiectivele și intrările tale rămân salvate pe acest dispozitiv. Intră din nou cu același email ca să le vezi."
        confirmLabel="Ieși din cont"
        onClose={() => setConfirmOut(false)}
        onConfirm={() => {
          signOut();
          nav('/welcome', { replace: true });
        }}
      />
    </div>
  );
}

export function ProfileSection() {
  const { section } = useParams();
  const map: Record<string, { title: string; el: JSX.Element }> = {
    account: { title: 'Date personale', el: <AccountSection /> },
    tracking: { title: 'Urmărire și conexiuni', el: <TrackingSection /> },
    reminders: { title: 'Mementouri', el: <RemindersSection /> },
    privacy: { title: 'Confidențialitate și securitate', el: <PrivacySection /> },
    accessibility: { title: 'Accesibilitate', el: <AccessibilitySection /> },
    help: { title: 'Ajutor și întrebări frecvente', el: <HelpSection /> },
    streaks: { title: 'Regulile streak-ului', el: <StreakSection /> },
  };
  const s = section ? map[section] : undefined;
  if (!s) return <Navigate to="/profile" replace />;
  return (
    <div className="screen">
      <TopBar title={s.title} />
      {s.el}
    </div>
  );
}

function AccountSection() {
  const { account, updateProfile } = useStore();
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? '');
  const [email, setEmail] = useState(account?.email ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (account?.isDemo) return <Banner tone="demo" icon={FlaskConical}>Contul demo nu poate fi editat. Fă-ți propriul cont ca să-ți setezi datele.</Banner>;
  const dirty = name.trim() !== account?.name || email.trim().toLowerCase() !== account?.email;
  function save(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Scrie-ți numele.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Scrie un email valid.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      updateProfile({ name: name.trim(), email: email.trim() });
      toast('Date salvate');
    } catch (err) {
      setErrors({ email: err instanceof AuthError ? err.message : 'Nu am putut salva.' });
    }
  }
  return (
    <form className="stack-lg" onSubmit={save} noValidate>
      <TextField label="Prenume" value={name} maxLength={40} error={errors.name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Email" type="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} hint="Îl folosești ca să intri în cont pe acest dispozitiv." />
      <Button type="submit" variant="primary" block disabled={!dirty}>
        Salvează modificările
      </Button>
    </form>
  );
}

function TrackingSection() {
  const data = useData();
  const { setTracking, sync, setSimulateFailure, online } = useStore();
  const toast = useToast();
  const [confirm, setConfirm] = useState<null | 'demo' | 'manual'>(null);
  const c = data.connection;
  const demo = data.tracking === 'demo';
  const demoCount = data.transactions.filter((t) => t.source === 'demo').length;

  return (
    <div className="stack-lg">
      <section className="card stack">
        <div className="row">
          <span className="list-row__icon" style={demo ? { background: 'var(--demo-soft)', color: 'var(--demo)' } : undefined} aria-hidden>
            {demo ? <FlaskConical size={18} /> : <PenLine size={18} />}
          </span>
          <div className="grow">
            <h2>{demo ? 'Conexiune demo' : 'Urmărire manuală'}</h2>
            <p className="small muted">{demo ? 'Banca Demo (simulată) · nicio bancă reală' : 'Tu adaugi ce economisești. Nimic nu e conectat.'}</p>
          </div>
        </div>
        {demo && (
          <dl style={{ margin: 0 }}>
            <div className="kv">
              <dt>Stare</dt>
              <dd>
                {c.status === 'syncing' ? (
                  'Se sincronizează…'
                ) : c.status === 'error' || !online ? (
                  <span className="pill pill--danger">Are nevoie de atenție</span>
                ) : (
                  <span className="pill pill--success">Conectat (simulat)</span>
                )}
              </dd>
            </div>
            <div className="kv">
              <dt>Ultima actualizare</dt>
              <dd>{c.lastSyncAt ? relativeTime(c.lastSyncAt) : 'Niciodată'}</dd>
            </div>
            {c.lastError && (
              <div className="kv">
                <dt>Ultima eroare</dt>
                <dd>{c.lastError}</dd>
              </div>
            )}
          </dl>
        )}
        {demo && (
          <Button
            icon={RefreshCw}
            loading={c.status === 'syncing'}
            onClick={async () => {
              try {
                await sync();
                toast('Sincronizat');
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Sincronizează acum
          </Button>
        )}
      </section>

      {demo && (
        <section className="card row row--between">
          <div className="grow">
            <h3>Simulează o eroare de conexiune</h3>
            <p className="small muted">Următoarele sincronizări vor eșua, ca să vezi cum îți păstrează Kip ultimele date cunoscute.</p>
          </div>
          <Switch checked={c.simulateFailure} onChange={setSimulateFailure} label="Simulează o eroare de conexiune" />
        </section>
      )}

      <section className="section">
        <h2 className="group-label">Schimbă metoda</h2>
        <div className="card card--flush">
          <ul className="list">
            <li>
              <button type="button" className="list-row" disabled={!demo} aria-current={!demo || undefined} onClick={() => setConfirm('manual')}>
                <span className="list-row__icon"><PenLine size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Urmărire manuală</span>
                  <span className="small subtle">{!demo ? 'Metoda actuală' : 'Oprește conexiunea demo'}</span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="list-row" disabled={demo} onClick={() => setConfirm('demo')}>
                <span className="list-row__icon"><FlaskConical size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Conexiune demo</span>
                  <span className="small subtle">{demo ? 'Metoda actuală' : 'Transferuri și sincronizare simulate'}</span>
                </span>
              </button>
            </li>
            <li>
              <div className="list-row" style={{ opacity: 0.55 }}>
                <span className="list-row__icon"><Link2 size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Conexiune bancară reală</span>
                  <span className="small subtle">Nu e disponibilă în versiunea asta</span>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <ConfirmDialog
        open={confirm === 'manual'}
        title="Treci pe urmărire manuală?"
        body={`Intrările noi le adaugi manual.${demoCount === 1 ? ' Intrarea ta simulată rămâne în Activitate, marcată în continuare ca simulată.' : demoCount ? ` Cele ${plural(demoCount, 'intrare simulată', 'intrări simulate')} rămân în Activitate, marcate în continuare ca simulate.` : ''}`}
        confirmLabel="Schimbă"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setTracking('manual');
          setConfirm(null);
          toast('Acum adaugi manual');
        }}
      />
      <ConfirmDialog
        open={confirm === 'demo'}
        title="Pornești conexiunea demo?"
        body="Intrările noi vor fi transferuri simulate de la „Banca Demo”. Pornesc în așteptare și se confirmă la sincronizare. Nu se mișcă bani reali. Intrările tale manuale rămân cum sunt."
        confirmLabel="Pornește"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setTracking('demo');
          setConfirm(null);
          toast('Conexiunea demo e pornită');
        }}
      />
    </div>
  );
}

function RemindersSection() {
  const data = useData();
  const { setReminder } = useStore();
  const r = data.reminder;
  return (
    <div className="stack-lg">
      <section className="card row row--between">
        <div>
          <h2>Memento săptămânal</h2>
          <p className="small muted">{r.enabled ? `În fiecare ${WEEKDAY_NAME[r.day].toLowerCase()}, la ${r.time}` : 'Oprit'}</p>
        </div>
        <Switch checked={r.enabled} onChange={(v) => setReminder({ ...r, enabled: v })} label="Memento săptămânal" />
      </section>
      {r.enabled && (
        <>
          <Field label="Ziua">
            <DayPicker value={r.day} onChange={(d) => setReminder({ ...r, day: d })} />
          </Field>
          <TextField label="Ora" type="time" value={r.time} onChange={(e) => setReminder({ ...r, time: e.target.value || '19:00' })} />
        </>
      )}
      <Banner tone="neutral" icon={Bell}>
        Mementourile apar ca banner pe ecranul Acasă când deschizi Kip la ora aleasă sau după, până faci ceva pentru economii în ziua aia. Notificările push nu sunt disponibile în versiunea asta.
      </Banner>
    </div>
  );
}

function PrivacySection() {
  const data = useData();
  const { account, deleteAccount } = useStore();
  const nav = useNavigate();
  const [confirm, setConfirm] = useState(false);
  function exportData() {
    const blob = new Blob([JSON.stringify({ account: { name: account?.name, email: account?.email }, ...data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kept-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="stack-lg">
      <section className="card stack">
        <h2>Ce păstrează Kip</h2>
        <ul className="check-list small">
          <li>
            <HardDrive size={18} aria-hidden />
            <span>Numele, emailul, obiectivele, planurile, intrările și setările tale. Doar în acest browser, pe acest dispozitiv.</span>
          </li>
          <li>
            <ShieldCheck size={18} aria-hidden />
            <span>Parola ta nu e salvată niciodată ca text. Kip păstrează doar un hash SHA-256 cu salt.</span>
          </li>
          <li>
            <Link2 size={18} aria-hidden />
            <span>Fără date de autentificare bancare, numere de card sau date reale de cont. Nu există server și nu se trimite nimic nicăieri.</span>
          </li>
        </ul>
        <p className="small subtle">Oricine are acces la acest profil de browser poate citi datele locale. Folosește un dispozitiv care e al tău.</p>
      </section>
      <Button icon={Download} onClick={exportData}>
        Descarcă-mi datele (JSON)
      </Button>
      <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
        Șterge contul și toate datele
      </Button>
      <ConfirmDialog
        open={confirm}
        danger
        title="Ștergi tot?"
        body="Contul, obiectivele, planurile, intrările și istoricul streak-ului dispar definitiv de pe acest dispozitiv. Nu poți anula asta."
        confirmLabel="Șterge tot"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          deleteAccount();
          nav('/welcome', { replace: true });
        }}
      />
    </div>
  );
}

function AccessibilitySection() {
  const data = useData();
  const { setPrefs } = useStore();
  const rows: { key: keyof typeof data.prefs; title: string; desc: string }[] = [
    { key: 'largerText', title: 'Text mai mare', desc: 'Mărește textul în toată aplicația.' },
    { key: 'reduceMotion', title: 'Mai puține animații', desc: 'Oprește tranzițiile și animațiile. Ține cont și de setarea sistemului.' },
    { key: 'hideBalance', title: 'Ascunde soldul pe ecranul Acasă', desc: 'Îți ascunde totalul până atingi iconița cu ochi.' },
  ];
  return (
    <div className="card card--flush">
      <ul className="list">
        {rows.map((r) => (
          <li key={r.key} className="list-row">
            <span className="list-row__body">
              <span className="strong">{r.title}</span>
              <span className="small subtle">{r.desc}</span>
            </span>
            <Switch checked={data.prefs[r.key]} onChange={(v) => setPrefs({ [r.key]: v })} label={r.title} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function HelpSection() {
  const faqs = [
    { q: 'Kip îmi păstrează sau îmi mută banii?', a: 'Nu. Kip nu mută niciodată bani: e un planificator și un jurnal de economii. Cu urmărirea manuală, adaugi ce ai pus deoparte în altă parte. Conexiunea demo doar simulează transferuri, fără bani reali.' },
    { q: 'De ce nu contează o intrare în așteptare?', a: '„În așteptare” înseamnă că banii n-au ajuns încă. Kip numără doar intrările confirmate, așa că totalul tău nu arată niciodată bani pe care nu-i ai.' },
    { q: 'Ce se întâmplă dacă ratez o depunere plănuită?', a: 'Nimic rău. Planurile sunt doar un ghid. Data estimată de final se mută, iar tu poți ajusta planul oricând vrei.' },
    { q: 'Pot pune aceiași bani la două obiective?', a: 'Nu. Fiecare intrare aparține unui singur obiectiv sau e nealocată, așa că totalul tău e mereu: obiective + nealocat.' },
    { q: 'Am șters un obiectiv. Unde au ajuns banii lui?', a: 'Intrările lui trec la economiile nealocate. Totalul tău nu se schimbă.' },
    { q: 'Cum folosesc Kip pe alt dispozitiv?', a: 'Versiunea asta păstrează datele doar în acest browser. Îți poți descărca datele din Confidențialitate și securitate.' },
  ];
  return (
    <div className="stack">
      {faqs.map((f) => (
        <details key={f.q} className="card" style={{ padding: 'var(--s-4) var(--s-5)' }}>
          <summary className="strong" style={{ cursor: 'pointer', minHeight: 28 }}>
            {f.q}
          </summary>
          <p className="muted small" style={{ marginTop: 'var(--s-3)' }}>
            {f.a}
          </p>
        </details>
      ))}
    </div>
  );
}

function StreakSection() {
  const data = useData();
  return (
    <div className="stack-lg">
      <div className="card row" style={{ gap: 'var(--s-8)' }}>
        <div className="stat">
          <span>Streak-ul actual</span>
          <strong>{plural(currentStreak(data), 'zi', 'zile')}</strong>
        </div>
        <div className="stat">
          <span>Cel mai lung streak</span>
          <strong>{plural(bestStreak(data), 'zi', 'zile')}</strong>
        </div>
      </div>
      <StreakRules />
    </div>
  );
}
