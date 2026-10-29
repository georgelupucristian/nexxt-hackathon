import { InstallApp } from '../components/InstallApp';
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
  Users,
  type LucideIcon,
  Gift,
} from '@/lib/icons';
import { useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { FreezeCards, StreakOverview } from '../components/sheets';
import { useSocial } from '../components/social/SocialProvider';
import { friendsOf } from '../lib/social/rules';
import { savesTally } from '../lib/social/view';
import { Banner, Button, ConfirmDialog, DayPicker, Field, Switch, TextField, TopBar, useToast } from '../components/ui';
import { currentStreak } from '../data/selectors';
import { AuthError } from '../data/storage';
import { ActionError, useData, useStore } from '../data/store';
import { PlanCard } from '../components/money';
import { relativeTime, WEEKDAY_NAME } from '../lib/dates';
import { formatNational } from '../lib/phone';
import { disableDeviceUnlock, hasDeviceUnlock } from '../lib/deviceUnlock';
import { plural } from '../lib/plural';

/** "Mon", "Tue"… cut from the weekday names. */
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
  const { account } = useStore();
  const nav = useNavigate();
  const social = useSocial();
  const [leaving, setLeaving] = useState(false);
  const friendCount = social ? friendsOf(social.world, social.me).length : 0;
  const tally = social ? savesTally(social.world, social.me) : null;

  const groups: { title: string; items: Item[] }[] = [
    {
      title: 'Friends',
      items: [
        { to: '/friends', label: 'Friends and colonies', icon: Users, detail: plural(friendCount, 'friend', 'friends') },
        { to: '/clubs', label: 'Clubs and promotions', icon: Gift },
      ],
    },
    {
      title: 'Savings',
      items: [
        account?.remote
          ? { to: '/profile/tracking', label: 'Payments and card', icon: Link2, detail: 'Stripe' }
          : { to: '/profile/tracking', label: 'Tracking and connections', icon: Link2, detail: data.tracking === 'demo' ? 'Demo connection' : 'Manual' },
        { to: '/profile/reminders', label: 'Reminders', icon: Bell, detail: data.reminder.enabled ? `${shortDay(data.reminder.day)} ${data.reminder.time}` : 'Off' },
        { to: '/profile/streaks', label: 'Streak rules', icon: Flame, detail: plural(currentStreak(data), 'day', 'days') },
      ],
    },
    {
      title: 'Account',
      items: [
        { to: '/profile/account', label: 'Personal details', icon: UserRound },
        { to: '/profile/privacy', label: 'Privacy and security', icon: ShieldCheck },
        { to: '/profile/accessibility', label: 'Accessibility', icon: Accessibility },
      ],
    },
    {
      title: 'Support',
      items: [
        { to: '/how-it-works', label: 'How Kip works', icon: BookOpen },
        { to: '/profile/help', label: 'Help and FAQ', icon: LifeBuoy },
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
          <p className="small muted truncate">{account?.isDemo ? 'Demo account · demo data' : account?.phone ? formatNational(account.phone) : ''}</p>
        </div>
      </header>

      <InstallApp />

      {/* the two freezes, and (privately) how often friends saved each other: no leaderboards */}
      <FreezeCards streak={currentStreak(data)} compact />
      {tally && (tally.given > 0 || tally.received > 0) && (
        <p className="small muted" data-testid="saves-tally">
          Saves given / received: <strong>{tally.given}</strong> / <strong>{tally.received}</strong>
        </p>
      )}

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

      {/* Sign out lives here, not on Home. One button, then a plain question (the old 3 second
          countdown you had to tap again to cancel was easy to misread); /logout does the rest. */}
      <section className="section stack" aria-label="Sign out">
        <Button block icon={LogOut} onClick={() => setLeaving(true)}>
          Sign out
        </Button>
        <p className="xs subtle" style={{ textAlign: 'center' }}>
          {account?.remote ? 'Your account is saved in the cloud, payments go through Stripe' : 'Your goals and entries stay on this device'} · Kip 0.1
        </p>
      </section>
      <ConfirmDialog
        open={leaving}
        title="Sign out?"
        body={
          account?.isDemo
            ? 'The demo data stays here. Come back anytime with “Try it with demo data”.'
            : account?.remote
              ? 'Your goals and money stay in your account. To come back, sign in with your phone number and a code.'
              : 'Your goals and the money you noted stay on this device. To come back, sign in with your phone number and a code.'
        }
        confirmLabel="Yes, sign out"
        cancelLabel="No, stay"
        onClose={() => setLeaving(false)}
        onConfirm={() => nav('/logout', { replace: true })}
      />
    </div>
  );
}

export function ProfileSection() {
  const { section } = useParams();
  const { account } = useStore();
  const map: Record<string, { title: string; el: JSX.Element }> = {
    account: { title: 'Personal details', el: <AccountSection /> },
    tracking: account?.remote ? { title: 'Payments and card', el: <PlanCard /> } : { title: 'Tracking and connections', el: <TrackingSection /> },
    reminders: { title: 'Reminders', el: <RemindersSection /> },
    privacy: { title: 'Privacy and security', el: <PrivacySection /> },
    accessibility: { title: 'Accessibility', el: <AccessibilitySection /> },
    help: { title: 'Help and FAQ', el: <HelpSection /> },
    streaks: { title: 'Streak rules', el: <StreakSection /> },
  };
  const s = section ? map[section] : undefined;
  if (!s) return <Navigate to="/profile" replace />;
  return (
    <div className="screen">
      <TopBar title={s.title} heading />
      {s.el}
    </div>
  );
}

function AccountSection() {
  const { account, updateProfile } = useStore();
  const toast = useToast();
  const [name, setName] = useState(account?.name ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (account?.isDemo) return <Banner tone="demo" icon={FlaskConical}>The demo account can't be edited. Make your own account to set your details.</Banner>;
  const dirty = name.trim() !== account?.name;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setErrors({ name: 'Write your name.' });
      return;
    }
    setErrors({});
    try {
      await updateProfile({ name: name.trim() });
      toast('Details saved');
    } catch (err) {
      setErrors({ name: err instanceof AuthError || err instanceof ActionError ? err.message : "We couldn't save." });
    }
  }
  return (
    <form className="stack-lg" onSubmit={save} noValidate>
      <TextField label="First name" value={name} maxLength={40} error={errors.name} onChange={(e) => setName(e.target.value)} />
      <TextField label="Phone number" type="tel" value={account?.phone ? formatNational(account.phone) : ''} readOnly hint="You sign in with it and a 6-digit code. Friends find you by it too." />
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
            <p className="small muted">{demo ? 'Demo Bank (simulated) · no real bank' : 'You add what you save. Nothing is connected.'}</p>
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
                  <span className="pill pill--danger">Needs attention</span>
                ) : (
                  <span className="pill pill--info">Connected (simulated)</span>
                )}
              </dd>
            </div>
            <div className="kv">
              <dt>Last update</dt>
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
            <h3>Simulate a connection error</h3>
            <p className="small muted">The next syncs will fail, so you can see how Kip keeps your last known data.</p>
          </div>
          <Switch checked={c.simulateFailure} onChange={setSimulateFailure} label="Simulate a connection error" />
        </section>
      )}

      <section className="section">
        <h2 className="group-label">Change method</h2>
        <div className="card card--flush">
          <ul className="list">
            <li>
              <button type="button" className="list-row" disabled={!demo} aria-current={!demo || undefined} onClick={() => setConfirm('manual')}>
                <span className="list-row__icon"><PenLine size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Manual tracking</span>
                  <span className="small subtle">{!demo ? 'Current method' : 'Stops the demo connection'}</span>
                </span>
              </button>
            </li>
            <li>
              <button type="button" className="list-row" disabled={demo} onClick={() => setConfirm('demo')}>
                <span className="list-row__icon"><FlaskConical size={18} aria-hidden /></span>
                <span className="list-row__body">
                  <span className="strong">Demo connection</span>
                  <span className="small subtle">{demo ? 'Current method' : 'Simulated transfers and sync'}</span>
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
        body={`You add new entries yourself.${demoCount === 1 ? ' Your simulated entry stays in Activity, still marked as simulated.' : demoCount ? ` The ${plural(demoCount, 'simulated entry', 'simulated entries')} stay in Activity, still marked as simulated.` : ''}`}
        confirmLabel="Switch"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setTracking('manual');
          setConfirm(null);
          toast('You add entries yourself now');
        }}
      />
      <ConfirmDialog
        open={confirm === 'demo'}
        title="Turn on the demo connection?"
        body="New entries will be simulated transfers from “Demo Bank”. They start as pending and confirm at the sync. No real money moves. Your own entries stay as they are."
        confirmLabel="Turn on"
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          setTracking('demo');
          setConfirm(null);
          toast('The demo connection is on');
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
          <p className="small muted">{r.enabled ? `Every ${WEEKDAY_NAME[r.day]} at ${r.time}` : 'Off'}</p>
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
        Reminders show as a banner on Home when you open Kip at the time you picked or later, until you save something that day. Push notifications aren't available in this version.
      </Banner>
    </div>
  );
}

function PrivacySection() {
  const data = useData();
  const { account, deleteAccount } = useStore();
  const nav = useNavigate();
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  function exportData() {
    const blob = new Blob([JSON.stringify({ account: { name: account?.name, phone: account?.phone }, ...data }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'kept-data.json';
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className="stack-lg">
      {account?.remote ? (
        <section className="card stack">
          <h2>What Kip keeps</h2>
          <ul className="check-list small">
            <li>
              <HardDrive size={18} aria-hidden />
              <span>Your first name, phone number, goals, plan and money history, in a Supabase database. Only you see them, once you sign in.</span>
            </li>
            <li>
              <ShieldCheck size={18} aria-hidden />
              <span>No passwords: you sign in with your phone number and a 6-digit code.</span>
            </li>
            <li>
              <Link2 size={18} aria-hidden />
              <span>You only enter your card details on the Stripe page.</span>
            </li>
          </ul>
        </section>
      ) : (
      <section className="card stack">
        <h2>What Kip keeps</h2>
        <ul className="check-list small">
          <li>
            <HardDrive size={18} aria-hidden />
            <span>Your name, phone number, goals, plans, entries and settings. Only in this browser, on this device.</span>
          </li>
          <li>
            <ShieldCheck size={18} aria-hidden />
            <span>No passwords: you sign in with your phone number and a 6-digit code.</span>
          </li>
          <li>
            <Link2 size={18} aria-hidden />
            <span>No bank logins, card numbers or real account details. There is no server and nothing is sent anywhere.</span>
          </li>
        </ul>
        <p className="small subtle">Anyone with access to this browser profile can read the local data. Use a device that's yours.</p>
      </section>
      )}
      <DiscoverableCard />
      <DeviceUnlockCard />
      <Button icon={Download} onClick={exportData}>
        Download my data (JSON)
      </Button>
      <Button variant="danger" icon={Trash2} onClick={() => setConfirm(true)}>
        Delete my account and all data
      </Button>
      <ConfirmDialog
        open={confirm}
        danger
        title="Delete your account and everything in it?"
        body="Your account, goals, plans, entries and streak are gone from this device for good. You can't undo this."
        confirmLabel="Yes, delete everything"
        cancelLabel="No, keep them"
        onClose={() => setConfirm(false)}
        onConfirm={() => {
          try {
            deleteAccount();
            nav('/welcome', { replace: true });
          } catch (e) {
            setConfirm(false);
            toast(e instanceof ActionError ? e.message : "We couldn't delete the account.", 'error');
          }
        }}
      />
    </div>
  );
}

function AccessibilitySection() {
  const data = useData();
  const { setPrefs } = useStore();
  const rows: { key: keyof typeof data.prefs; title: string; desc: string }[] = [
    { key: 'largerText', title: 'Larger text', desc: 'Makes the text bigger across the app.' },
    { key: 'reduceMotion', title: 'Less motion', desc: 'Turns off transitions and animations. Your system setting counts too.' },
    { key: 'hideBalance', title: 'Hide the balance on Home', desc: 'Hides your total until you tap the eye icon.' },
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
  const { account } = useStore();
  const remote = !!account?.remote;
  const faqs = [
    remote
      ? { q: 'Does Kip move my money?', a: 'Yes, with your OK: a daily amount is collected from your card once a month through Stripe, and you can add more or withdraw anytime.' }
      : { q: 'Does Kip keep or move my money?', a: 'No. Kip never moves money here: it is a planner and a savings log. With manual tracking, you add what you put aside somewhere else. The demo connection only simulates transfers, with no real money.' },
    { q: "Why doesn't a pending entry count?", a: "“Pending” means the money hasn't arrived yet. Kip only counts confirmed entries, so your total never shows money you don't have." },
    { q: 'When does a day count for the streak?', a: "When you put money aside that day, however little. A deposit still waiting to be confirmed counts too. Just opening the app doesn't light up the day." },
    { q: 'What happens if I miss a planned deposit?', a: 'Nothing bad. Plans are only a guide. The estimated finish date moves, and you can adjust the plan whenever you like.' },
    { q: 'Can I put the same money toward two goals?', a: 'No. Each entry belongs to one goal or none, so your total is always: goals + money without a goal.' },
    { q: 'I deleted a goal. Where did its money go?', a: "Its entries stay in your savings, without a goal. Your total doesn't change." },
    remote
      ? { q: 'How do I use Kip on another device?', a: 'Sign in with the same phone number and a code. Your goals and money come from the cloud.' }
      : { q: 'How do I use Kip on another device?', a: 'This version keeps your data in this browser only. You can download your data from Privacy and security.' },
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
  return <StreakOverview />;
}

/** "Friends can find me by my number": chosen in onboarding, changed here whenever. */
function DiscoverableCard() {
  const s = useSocial();
  if (!s) return null;
  const me = s.world.users[s.me];
  return (
    <section className="card row row--between" aria-label="Found by number">
      <div>
        <h2>Friends can find me by my number</h2>
        <p className="small muted">{me.discoverable ? 'Anyone with your number in their contacts can find you in Kip and send you a request.' : "You don't show up when others look for friends in their contacts. You can still send requests."}</p>
      </div>
      <Switch
        checked={me.discoverable}
        onChange={(v) => void Promise.resolve(s.repo.setDiscoverable(v)).catch(() => undefined)}
        label="Friends can find me by my number"
      />
    </section>
  );
}

/** Face ID / fingerprint on this device: shown once it's on, with a way to turn it off. */
function DeviceUnlockCard() {
  const { account } = useStore();
  const toast = useToast();
  const [on, setOn] = useState(() => !!account && hasDeviceUnlock(account.id));
  if (!account || !on) return null;
  return (
    <section className="card stack">
      <h2>Unlock with face or fingerprint</h2>
      <p className="small muted">On for this device. It only locks the screen here: your account stays tied to your phone number.</p>
      <Button
        onClick={() => {
          disableDeviceUnlock(account.id);
          setOn(false);
          toast('Unlock is off on this device');
        }}
      >
        Turn off on this device
      </Button>
    </section>
  );
}
