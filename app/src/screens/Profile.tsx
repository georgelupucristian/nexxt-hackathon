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
      title: 'Savings',
      items: [
        { to: '/profile/tracking', label: 'Tracking & connections', icon: Link2, detail: data.tracking === 'demo' ? 'Demo connection' : 'Manual' },
        { to: '/profile/reminders', label: 'Reminders', icon: Bell, detail: data.reminder.enabled ? `${WEEKDAY_NAME[data.reminder.day].slice(0, 3)} ${data.reminder.time}` : 'Off' },
        { to: '/profile/streaks', label: 'Streak rules', icon: Flame, detail: `${currentStreak(data)} days` },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/profile/account', label: 'Personal details', icon: UserRound },
        { to: '/profile/privacy', label: 'Privacy & security', icon: ShieldCheck },
        { to: '/profile/accessibility', label: 'Accessibility', icon: Accessibility },
      ],
    },
    {
      title: 'Support',
      items: [
        { to: '/how-it-works', label: 'How Kept works', icon: BookOpen },
        { to: '/profile/help', label: 'Help & FAQ', icon: LifeBuoy },
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
          <p className="small muted truncate">{account?.isDemo ? 'Demo account · sample data' : account?.email}</p>
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
        Sign out
      </Button>
      <p className="xs subtle" style={{ textAlign: 'center' }}>
        Kept 0.1 · data stored on this device
      </p>
      <ConfirmDialog
        open={confirmOut}
        title="Sign out?"
        body="Your goals and entries stay saved on this device. Sign in again with the same email to see them."
        confirmLabel="Sign out"
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
    account: { title: 'Personal details', el: <AccountSection /> },
    tracking: { title: 'Tracking & connections', el: <TrackingSection /> },
    reminders: { title: 'Reminders', el: <RemindersSection /> },
    privacy: { title: 'Privacy & security', el: <PrivacySection /> },
    accessibility: { title: 'Accessibility', el: <AccessibilitySection /> },
    help: { title: 'Help & FAQ', el: <HelpSection /> },
    streaks: { title: 'Streak rules', el: <StreakSection /> },
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
  if (account?.isDemo) return <Banner tone="demo" icon={FlaskConical}>The demo account can’t be edited. Create your own account to set your details.</Banner>;
  const dirty = name.trim() !== account?.name || email.trim().toLowerCase() !== account?.email;
  function save(e: FormEvent) {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Enter your name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) errs.email = 'Enter a valid email.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    try {
      updateProfile({ name: name.trim(), email: email.trim() });
      toast('Details saved');
    } catch (err) {
      setErrors({ email: err instanceof AuthError ? err.message : 'Could not save.' });
    }
  }
  return (
    <form className="stack-lg" onSubmit={save} noValidate>
      <TextField label="First name" value={name} maxLength={40} error={errors.name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Email" type="email" value={email} error={errors.email} onChange={(e) => setEmail(e.target.value)} hint="Used to sign in on this device." />
      <Button type="submit" variant="primary" block disabled={!dirty}>
        Save changes
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
            <h2>{demo ? 'Demo connection' : 'Manual tracking'}</h2>
            <p className="small muted">{demo ? 'Demo Bank (simulated) · no real bank' : 'You record what you save. Nothing is connected.'}</p>
          </div>
        </div>
        {demo && (
          <dl style={{ margin: 0 }}>
            <div className="kv">
              <dt>Status</dt>
              <dd>
                {c.status === 'syncing' ? (
                  'Syncing…'
                ) : c.status === 'error' || !online ? (
                  <span className="pill pill--danger">Requires attention</span>
                ) : (
                  <span className="pill pill--success">Connected (simulated)</span>
                )}
              </dd>
            </div>
            <div className="kv">
              <dt>Last updated</dt>
              <dd>{c.lastSyncAt ? relativeTime(c.lastSyncAt) : 'Never'}</dd>
            </div>
            {c.lastError && (
              <div className="kv">
                <dt>Last error</dt>
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
                toast('Synced');
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            Sync now
          </Button>
        )}
      </section>

      {demo && (
        <section className="card row row--between">
          <div className="grow">
            <h3>Simulate a connection failure</h3>
            <p className="small muted">Makes the next syncs fail so you can see how Kept keeps your last known data.</p>
          </div>
          <Switch checked={c.simulateFailure} onChange={setSimulateFailure} label="Simulate a connection failure" />
        </section>
      )}

      <section className="section">
        <h2 className="group-label">Switch method</h2>
        <div className="card card--flush">
          <ul className="list">
            <li>
              <button type="button" className="list-row" disabled={!demo} aria-current={!demo || undefined} onClick={() => setConfirm('manual')}>
                <span className="list-row__icon"><PenLine size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Manual tracking</span>
                  <span className="small subtle">{!demo ? 'Current method' : 'Stop the demo connection'}</span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="list-row" disabled={demo} onClick={() => setConfirm('demo')}>
                <span className="list-row__icon"><FlaskConical size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Demo connection</span>
                  <span className="small subtle">{demo ? 'Current method' : 'Simulated transfers and syncing'}</span>
                </span>
              </button>
            </li>
            <li>
              <div className="list-row" style={{ opacity: 0.55 }}>
                <span className="list-row__icon"><Link2 size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Real bank connection</span>
                  <span className="small subtle">Not available in this version</span>
                </span>
              </div>
            </li>
          </ul>
        </div>
      </section>

      <ConfirmDialog
        open={confirm === 'manual'}
        title="Switch to manual tracking?"
        body={`New entries will be recorded manually. ${demoCount ? `Your ${demoCount} simulated entries stay in Activity, still labelled as simulated.` : ''}`}
        confirmLabel="Switch"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setTracking('manual');
          setConfirm(null);
          toast('Now tracking manually');
        }}
      />
      <ConfirmDialog
        open={confirm === 'demo'}
        title="Turn on the demo connection?"
        body="New entries will be simulated transfers from “Demo Bank”. They start pending and confirm on sync. No real money moves. Your manual entries stay as they are."
        confirmLabel="Turn on"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setTracking('demo');
          setConfirm(null);
          toast('Demo connection on');
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
          <h2>Weekly reminder</h2>
          <p className="small muted">{r.enabled ? `${WEEKDAY_NAME[r.day]}s at ${r.time}` : 'Off'}</p>
        </div>
        <Switch checked={r.enabled} onChange={(v) => setReminder({ ...r, enabled: v })} label="Weekly reminder" />
      </section>
      {r.enabled && (
        <>
          <Field label="Day">
            <DayPicker value={r.day} onChange={(d) => setReminder({ ...r, day: d })} />
          </Field>
          <TextField label="Time" type="time" value={r.time} onChange={(e) => setReminder({ ...r, time: e.target.value || '19:00' })} />
        </>
      )}
      <Banner tone="neutral" icon={Bell}>
        Reminders show as a banner on Home when you open Kept on or after the chosen time, until you do a savings action that day. Push notifications aren’t available in this version.
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
        <h2>What Kept stores</h2>
        <ul className="check-list small">
          <li>
            <HardDrive size={18} aria-hidden />
            <span>Your name, email, goals, plans, entries and settings. Only in this browser, on this device.</span>
          </li>
          <li>
            <ShieldCheck size={18} aria-hidden />
            <span>Your password is never stored as text. Kept keeps a salted SHA-256 hash of it.</span>
          </li>
          <li>
            <Link2 size={18} aria-hidden />
            <span>No bank credentials, card numbers or real account data. There is no server and nothing is sent anywhere.</span>
          </li>
        </ul>
        <p className="small subtle">Anyone with access to this browser profile could read local data. Use a device that’s yours.</p>
      </section>
      <Button icon={Download} onClick={exportData}>
        Download my data (JSON)
      </Button>
      <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
        Delete account and all data
      </Button>
      <ConfirmDialog
        open={confirm}
        danger
        title="Delete everything?"
        body="Your account, goals, plans, entries and streak history are permanently removed from this device. This can’t be undone."
        confirmLabel="Delete everything"
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
    { key: 'largerText', title: 'Larger text', desc: 'Increases text size across the app.' },
    { key: 'reduceMotion', title: 'Reduce motion', desc: 'Turns off transitions and animations. Also follows your system setting.' },
    { key: 'hideBalance', title: 'Hide balance on Home', desc: 'Masks your total until you tap the eye icon.' },
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
    { q: 'Does Kept hold or move my money?', a: 'No. Kept is a planner and tracker. With manual tracking you record what you set aside elsewhere. The demo connection only simulates transfers. No real money moves.' },
    { q: 'Why doesn’t a pending entry count?', a: 'Pending means the money hasn’t arrived yet. Kept only counts confirmed entries, so your total never shows money you don’t have.' },
    { q: 'What happens if I miss a planned contribution?', a: 'Nothing bad. Plans are guides. Your estimated finish date moves, and you can adjust the plan whenever you like.' },
    { q: 'Can the same money count towards two goals?', a: 'No. Every entry belongs to one goal or is unallocated, so your total always equals goals + unallocated.' },
    { q: 'I deleted a goal. Where did its money go?', a: 'Its entries move to unallocated savings. Your total doesn’t change.' },
    { q: 'How do I use Kept on another device?', a: 'This version stores data only in this browser. You can download your data from Privacy & security.' },
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
          <span>Current streak</span>
          <strong>{currentStreak(data)} days</strong>
        </div>
        <div className="stat">
          <span>Best streak</span>
          <strong>{bestStreak(data)} days</strong>
        </div>
      </div>
      <StreakRules />
    </div>
  );
}
