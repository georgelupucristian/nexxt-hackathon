// Real money for Supabase accounts: starting the plan (Stripe Checkout), extra deposits, withdrawals
// and the moment a payment is confirmed. Everything here talks to the store's money calls, which
// call the Edge Functions; the numbers come back through the ledger (webhook → Realtime).
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertCircle, Check, Clock } from '@/lib/icons';
import { primaryGoal } from '../data/selectors';
import { ActionError, useData, useStore } from '../data/store';
import { navigateTop } from '../frame/embed';
import { formatDate } from '../lib/dates';
import { formatLei, parseLei } from '../lib/money';
import { firstCollection, MAX_EXTRA, maxCollect, MIN_EXTRA, minCollect, nextCollection } from '../lib/plan';
import type { Plan } from '../data/types';
import { planWhen } from './GoalSteps';
import { SchedulePicker } from './SchedulePicker';
import { GoalTile } from './domain';
import { useCelebrate } from './mascot/Celebration';
import { MascotSays } from './mascot/MascotSays';
import { Sheet, useToast } from './ui';
import { AmountRuler } from './watermelon/amount-ruler';
import { LabeledProgressIndicator } from './watermelon/labeled-progress-indicator';

const errText = (e: unknown) => (e instanceof ActionError ? e.message : 'Something went wrong. Try again in a few seconds.');
const dayMonth = (key: string) => `${key.slice(8)}/${key.slice(5, 7)}`;

// ---------- save money ----------

/**
 * "Save money" for a Supabase account. No plan yet: a short explanation and Stripe
 * Checkout. Back from Checkout: waiting for the webhook. Plan running: an extra deposit, now from
 * the saved card or together with the next monthly top-up.
 */
export function RealSaveSheet({ open, onClose, presetAmount }: { open: boolean; onClose: () => void; presetAmount?: number }) {
  const { money } = useStore();
  if (!money) return null;
  const title = money.awaiting && !money.running ? 'Almost there' : 'Move money into your savings';
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {money.running ? <DepositView onClose={onClose} presetAmount={presetAmount} /> : money.awaiting ? <AwaitingView onClose={onClose} /> : <StartPlanView />}
    </Sheet>
  );
}

/** The next deposit on a running plan's schedule. */
const nextOf = (plan: Plan, today: string) => (plan.frequency === 'flexible' || plan.day === null ? null : nextCollection(today, plan.frequency, plan.day));

/** The two lines that say whose money this is, and the "Where's my money?" answer. */
export function OwnMoneyNote({ text = 'It goes from your card into your Kip savings, not to us. Take it out anytime.' }: { text?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="money__own">
      <p className="small muted">{text}</p>
      <button type="button" className="link-btn small" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Where's my money?
      </button>
      {open && (
        <ul className="money__where small" aria-label="Where your money is">
          <li>Your money sits in your Kip savings, in your name.</li>
          <li>In the full version it's held by a licensed partner bank, Libra Internet Bank. Kip never keeps it.</li>
          <li>You can take it out anytime.</li>
          <li>Kip charges no fee in this version.</li>
        </ul>
      )}
    </div>
  );
}

function StartPlanView() {
  const { money, startPlan } = useStore();
  const data = useData();
  const goal = primaryGoal(data.goals);
  // the schedule picked for the goal (or the one saved on the profile), editable here
  const base = goal && goal.plan.frequency !== 'flexible' && goal.plan.day !== null ? goal.plan : (money?.plan ?? { amount: 70_00, frequency: 'weekly', day: 0 });
  const [frequency, setFrequency] = useState<'weekly' | 'monthly'>(base.frequency === 'monthly' ? 'monthly' : 'weekly');
  const [day, setDay] = useState(base.day ?? 0);
  const fit = (f: 'weekly' | 'monthly', v: number) => Math.min(maxCollect(f), Math.max(minCollect(f), Math.round(v / 100) * 100));
  const [amount, setAmount] = useState(fit(frequency, base.amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!money) return null;
  const plan: Plan = { amount, frequency, day };
  const first = firstCollection(money.today, frequency, day);
  const now = first === money.today;

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const url = await startPlan(plan);
      // Stripe Checkout won't load in a frame: in the laptop phone this opens it in the whole tab
      navigateTop(url);
    } catch (e) {
      setError(errText(e));
      setBusy(false);
    }
  }

  return (
    <div className="saves money">
      <OwnMoneyNote />
      <SchedulePicker
        frequency={frequency}
        day={day}
        onChange={(f, d) => {
          if (f !== frequency) setAmount(fit(f, f === 'weekly' ? amount / 4.3 : amount * 4.3));
          setFrequency(f);
          setDay(d);
        }}
      />
      <AmountRuler label={frequency === 'weekly' ? 'How much each week' : 'How much each month'} value={amount} onChange={(v) => setAmount(fit(frequency, v))} step={1_00} min={minCollect(frequency)} max={maxCollect(frequency)} />
      <div className="money__sum" aria-live="polite">
        <p>
          {now ? (
            <>
              <b>{formatLei(amount)}</b> moves today, then {planWhen(plan)}{goal ? `, for ${goal.name}` : ''}.
            </>
          ) : (
            <>
              Nothing moves today. Your first <b>{formatLei(amount)}</b> goes in on <b>{formatDate(first)}</b>, then {planWhen(plan)}.
            </>
          )}
        </p>
        <p className="small muted">Your card is only used to move money into your savings.</p>
      </div>
      {error && (
        <p className="money__error" role="alert">
          <AlertCircle size={16} aria-hidden /> {error}
        </p>
      )}
      <button type="button" className="savebtn savebtn--confirm" disabled={busy} onClick={go}>
        {busy ? <span className="spinner" aria-label="Opening the card step" /> : now ? `Move ${formatLei(amount)} now` : 'Set it up'}
      </button>
    </div>
  );
}

function AwaitingView({ onClose }: { onClose: () => void }) {
  return (
    <div className="saves money money--center">
      <MascotSays state="think" message="Stripe is confirming your card. It takes a few seconds." size={110} layout="stack" appear="none" />
      <LabeledProgressIndicator labels={['Waiting for Stripe to confirm…', 'Checking your card…', 'Almost there…']} durationMs={9000} />
      <p className="small muted" style={{ textAlign: 'center' }}>
        You can close this. Your plan shows up on its own.
      </p>
      <button type="button" className="btn btn--secondary btn--block" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

const QUICK = [10_00, 25_00, 50_00, 100_00];

function DepositView({ onClose, presetAmount }: { onClose: () => void; presetAmount?: number }) {
  const { money, deposit, fixCard } = useStore();
  const data = useData();
  const toast = useToast();
  const goal = primaryGoal(data.goals);
  const [raw, setRaw] = useState(presetAmount ? String(presetAmount / 100).replace('.', ',') : '');
  const [when, setWhen] = useState<'now' | 'next_topup'>('now');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const amount = parseLei(raw) ?? 0;
  useEffect(() => {
    const t = window.setTimeout(() => input.current?.focus(), 120);
    return () => window.clearTimeout(t);
  }, []);
  if (!money) return null;
  const pay = nextOf(money.plan, money.today) ?? money.today;
  const tooSmall = amount > 0 && amount < MIN_EXTRA;
  const tooBig = amount > MAX_EXTRA;

  async function save() {
    if (amount <= 0 || tooSmall || tooBig || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deposit(amount, when);
      onClose();
      toast(when === 'now' ? `${formatLei(amount)} is on its way to your savings. It shows up once Stripe confirms it.` : `${formatLei(amount)} gets added to your ${formatDate(pay)} deposit, no extra fee.`);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="saves money">
      <OwnMoneyNote />
      {money.lastTopUpFailed && (
        <div className="money__warn" role="alert">
          <AlertCircle size={16} aria-hidden />
          <span className="grow">Your last deposit didn't go through. Change your card so we can try again.</span>
          <button type="button" className="link-btn" onClick={() => void fixCard().then(navigateTop).catch((e) => setError(errText(e)))}>
            Change card
          </button>
        </div>
      )}
      <label className="saves__amount">
        <input
          ref={input}
          inputMode="decimal"
          placeholder="0"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9));
            setError(null);
          }}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          aria-label="Amount in lei"
          style={{ width: `${Math.max(1, raw.length || 1) + 0.6}ch` }}
        />
        <span>lei</span>
      </label>
      <div className="saves__quick" role="group" aria-label="Quick add">
        {QUICK.map((q) => (
          <button key={q} type="button" onClick={() => setRaw(String(Math.round((amount + q) / 100)))}>
            +{q / 100}
          </button>
        ))}
      </div>

      <div className="money__when" role="radiogroup" aria-label="When to add the money">
        <button type="button" role="radio" aria-checked={when === 'now'} onClick={() => setWhen('now')}>
          <span className="money__radio" aria-hidden>
            {when === 'now' && <Check size={14} />}
          </span>
          <span>
            <b>Now, from your card</b>
            <small>Moves now, shows up once Stripe confirms.</small>
          </span>
        </button>
        <button type="button" role="radio" aria-checked={when === 'next_topup'} onClick={() => setWhen('next_topup')}>
          <span className="money__radio" aria-hidden>
            {when === 'next_topup' && <Check size={14} />}
          </span>
          <span>
            <b>With the next deposit ({dayMonth(pay)})</b>
            <small>No extra fee. Counts once it moves.</small>
          </span>
        </button>
      </div>

      <div className="money__for">
        {goal && <GoalTile goal={goal} size={22} />}
        <span className="grow truncate">{goal ? `For ${goal.name}` : 'Into your savings'}</span>
      </div>

      {(error || tooSmall || tooBig) && (
        <p className="money__error" role="alert">
          <AlertCircle size={16} aria-hidden /> {error ?? (tooSmall ? `At least ${formatLei(MIN_EXTRA)}, the Stripe minimum.` : `At most ${formatLei(MAX_EXTRA)} at a time.`)}
        </p>
      )}
      <button type="button" className="savebtn savebtn--confirm" disabled={amount <= 0 || tooSmall || tooBig || busy} onClick={save}>
        {busy ? <span className="spinner" aria-label="Sending" /> : amount > 0 ? (when === 'now' ? `Move ${formatLei(amount)} now` : `Add ${formatLei(amount)} to the deposit`) : 'Enter an amount'}
      </button>
    </div>
  );
}

// ---------- withdraw ----------

export function RealWithdrawSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { money, withdraw } = useStore();
  const toast = useToast();
  const [raw, setRaw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setRaw('');
      setError(null);
      setBusy(false);
    }
  }, [open]);
  if (!money) return null;
  const amount = parseLei(raw) ?? 0;
  const max = money.withdrawable;
  const tooBig = amount > max;

  async function go() {
    if (amount <= 0 || tooBig || busy) return;
    setBusy(true);
    setError(null);
    try {
      await withdraw(amount);
      onClose();
      toast(`${formatLei(amount)} is on its way back to your card.`);
    } catch (e) {
      // 409 carries the maximum ("You can withdraw up to …"); its second sentence is about parent money, not this sheet
      setError(errText(e).replace(/\s*Money your parents put in stays in your goal\.?/, ''));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Move money back to your card">
      <div className="saves money">
        <OwnMoneyNote text="It goes from your Kip savings back to your card. It's your money, so there's no fee." />
        <label className="saves__amount">
          <input
            inputMode="decimal"
            placeholder="0"
            value={raw}
            data-autofocus
            onChange={(e) => {
              setRaw(e.target.value.replace(/[^\d.,]/g, '').slice(0, 9));
              setError(null);
            }}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            aria-label="Amount to withdraw, in lei"
            style={{ width: `${Math.max(1, raw.length || 1) + 0.6}ch` }}
          />
          <span>lei</span>
        </label>
        <div className="money__for">
          <span className="grow">
            You can move up to <b>{formatLei(max)}</b>
          </span>
          {max > 0 && (
            <button type="button" className="link-btn" onClick={() => setRaw(String(max / 100).replace('.', ','))}>
              All
            </button>
          )}
        </div>
        {(error || tooBig) && (
          <p className="money__error" role="alert">
            <AlertCircle size={16} aria-hidden /> {error ?? `You can move up to ${formatLei(max)}.`}
          </p>
        )}
        <button type="button" className="savebtn savebtn--confirm" disabled={amount <= 0 || tooBig || busy} onClick={go}>
          {busy ? <span className="spinner" aria-label="Moving" /> : amount > 0 ? `Move ${formatLei(amount)} back` : 'Enter an amount'}
        </button>
      </div>
    </Sheet>
  );
}

// ---------- the moment money lands ----------

/**
 * Mounted on Home for Supabase accounts. Handles the return from Stripe Checkout (?checkout=…),
 * shows the waiting sheet until the webhook confirms the first payment, and celebrates every
 * deposit the moment it turns confirmed (it arrives over Realtime, nobody has to refresh).
 */
const CELEBRATED = 'kip.celebrated';
function readCelebrated(): Set<string> {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(CELEBRATED) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}
function saveCelebrated(ids: Set<string>) {
  try {
    sessionStorage.setItem(CELEBRATED, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* private mode: the in-memory set still covers this page */
  }
}

export function MoneyMoments() {
  const { money, data, checkoutReturned } = useStore();
  const celebrate = useCelebrate();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const prev = useRef<Map<string, string> | null>(null);
  const returned = useRef(false);
  // payments already celebrated, kept for the tab: a refetch on focus can briefly empty the list and
  // refill it, which made every old confirmed payment look new and replayed the celebration
  const celebrated = useRef<Set<string>>(readCelebrated());
  const [waitOpen, setWaitOpen] = useState(true);

  useEffect(() => {
    const c = params.get('checkout');
    if (!c) return;
    if (c === 'success') {
      returned.current = true;
      setWaitOpen(true);
      checkoutReturned('success');
    } else {
      checkoutReturned('cancel');
      toast('Nothing was set up and no money moved.');
    }
    const next = new URLSearchParams(params);
    next.delete('checkout');
    next.delete('session_id');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!data || !money) return;
    const txs = data.transactions.filter((t) => t.source === 'stripe');
    const before = prev.current;
    prev.current = new Map(txs.map((t) => [t.id, t.status]));
    const goal = primaryGoal(data.goals);
    if (!before || before.size === 0) {
      // the webhook beat the redirect: the first payment is already confirmed on arrival
      if (returned.current) {
        const t = txs.find((x) => x.type === 'contribution' && x.status === 'confirmed' && Date.now() - Date.parse(x.createdAt) < 15 * 60_000);
        if (t && !celebrated.current.has(t.id)) {
          celebrated.current.add(t.id);
          saveCelebrated(celebrated.current);
          celebrate({ title: `+${formatLei(t.amount)} saved`, sub: `Stripe confirmed the payment${goal ? `. For ${goal.name}` : ''}.` });
        }
      }
      return;
    }
    const recent = (t: { createdAt: string }) => Date.now() - Date.parse(t.createdAt) < 30 * 60_000;
    const fresh = txs.filter((t) => t.type === 'contribution' && t.status === 'confirmed' && before.get(t.id) !== 'confirmed' && recent(t) && !celebrated.current.has(t.id));
    const failed = txs.filter((t) => t.status === 'failed' && before.get(t.id) !== 'failed');
    if (fresh.length) {
      fresh.forEach((t) => celebrated.current.add(t.id));
      saveCelebrated(celebrated.current);
      const sum = fresh.reduce((s, t) => s + t.amount, 0);
      celebrate({ title: `+${formatLei(sum)} saved`, sub: `Stripe confirmed the payment${goal ? `. For ${goal.name}` : ''}.` });
    }
    if (failed.length) toast('The payment didn\'t go through. Check your card and try again.', 'error');
  }, [data, money, celebrate, toast]);

  if (!money) return null;
  return (
    <Sheet open={money.awaiting && waitOpen} onClose={() => setWaitOpen(false)} title="Almost there">
      <AwaitingView onClose={() => setWaitOpen(false)} />
    </Sheet>
  );
}

/** Under the save button: test mode, plus anything still on its way. */
export function MoneyStatusLine() {
  const { money } = useStore();
  // no plan yet: nothing here; the card is only asked for once you choose to put money in
  if (!money || (!money.awaiting && money.pendingIn <= 0 && !money.running)) return null;
  return (
    <p className="money__line" aria-live="polite">
      {money.awaiting ? (
        <span>
          <Clock size={13} aria-hidden /> First payment waiting for Stripe to confirm
        </span>
      ) : money.pendingIn > 0 ? (
        <span>
          <Clock size={13} aria-hidden /> {formatLei(money.pendingIn)} pending, shows up once confirmed
        </span>
      ) : money.running ? (
        <span>
          {formatLei(money.plan.amount)} {planWhen(money.plan)}
          {nextOf(money.plan, money.today) ? `, next on ${formatDate(nextOf(money.plan, money.today)!)}` : ''}
        </span>
      ) : null}
    </p>
  );
}

// ---------- profile: the plan ----------

export function PlanCard() {
  const { money, fixCard, inviteParent } = useStore();
  const toast = useToast();
  const [parent, setParent] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!money) return null;
  const status: Record<string, string> = {
    none: 'Not started',
    incomplete: 'Starting',
    active: 'Active',
    past_due: 'Payment overdue',
    paused: 'Paused',
    canceled: 'Stopped',
  };
  return (
    <div className="stack-lg">
      <section className="card stack">
        <div className="row row--between">
          <h2>Automatic saving</h2>
        </div>
        <dl style={{ margin: 0 }}>
          <div className="kv">
            <dt>Status</dt>
            <dd>{status[money.status] ?? money.status}</dd>
          </div>
          <div className="kv">
            <dt>Into your savings</dt>
            <dd>
              {formatLei(money.plan.amount)} {planWhen(money.plan)}
            </dd>
          </div>
          {money.running && nextOf(money.plan, money.today) && (
            <div className="kv">
              <dt>Next deposit</dt>
              <dd>{formatDate(nextOf(money.plan, money.today)!)}</dd>
            </div>
          )}
          <div className="kv">
            <dt>You can move back</dt>
            <dd>{formatLei(money.withdrawable)}</dd>
          </div>
        </dl>
        {money.running && (
          <button type="button" className="btn btn--secondary btn--block" onClick={() => void fixCard().then(navigateTop).catch((e) => toast(errText(e), 'error'))}>
            Change card
          </button>
        )}
      </section>

      <section className="card stack">
        <h2>Invite a parent</h2>
        <p className="small muted">A parent can match every leu you save, up to 150 lei a month. Their money stays in your goal.</p>
        {link ? (
          <div className="money__link">
            <input readOnly value={link} aria-label="Link for your parent" onFocus={(e) => e.currentTarget.select()} />
            <button
              type="button"
              className="btn btn--primary"
              onClick={() =>
                void navigator.clipboard
                  .writeText(link)
                  .then(() => toast('Link copied'))
                  .catch(() => toast('Select the link and copy it yourself.'))
              }
            >
              Copy
            </button>
          </div>
        ) : (
          <form
            className="money__link"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!parent.trim()) return toast('Write what you call your parent.', 'error');
              setBusy(true);
              try {
                const r = await inviteParent({ parentName: parent.trim(), ratioNum: 1, ratioDen: 1, capBani: 150_00 });
                setLink(r.url);
              } catch (err) {
                toast(errText(err), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            <input value={parent} maxLength={40} placeholder="Mum, Dad…" aria-label="What you call your parent" onChange={(e) => setParent(e.target.value)} />
            <button type="submit" className="btn btn--primary" disabled={busy}>
              {busy ? <span className="spinner" aria-label="Creating" /> : 'Create link'}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
