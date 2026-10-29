import type { User } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { todayKey } from '../lib/dates';
import { uid } from '../lib/id';
import { MAX_AMOUNT } from '../lib/money';
import { socialRepo } from '../lib/social/active';
import { ApiError, backendReady, callFn, supabase } from '../lib/supabase';
import {
  goalFromRow,
  kindToDb,
  metaOf,
  moneyState,
  schedulePlan,
  remoteUserData,
  toggleDay,
  type BalancesRow,
  type DeviceState,
  type GoalRow,
  type KipMeta,
  type LedgerRow,
  type MoneyState,
  type ProfileRow,
  type RemoteRows,
} from './remote';
import { available } from './selectors';
import { sampleData } from './seed';
import * as storage from './storage';
import { AuthError } from './storage';
import { authError } from './authErrors';
import type { Account, ActionKind, Bani, Goal, Plan, SetupState, Transaction, UserData } from './types';

export class ActionError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
  }
}

interface TxInput {
  type: Transaction['type'];
  amount: number;
  goalId: string | null;
  date: string;
  note: string;
}

/** The real money plan of a Supabase account, plus whether we're waiting on Stripe. */
export interface Money extends MoneyState {
  /** back from Checkout, the first payment isn't confirmed by the webhook yet */
  awaiting: boolean;
}

/** Who just proved their number: a brand-new account, or one that already has its plan. */
export interface PhoneResult {
  isNew: boolean;
  name: string;
  /** the account finished onboarding before (it has a goal) */
  completed: boolean;
}

/**
 * The fixed code that verifies a number when no Supabase project is configured (local accounts).
 * With the backend, the auth-phone Edge Function decides; nothing in the UI ever shows a code.
 */
const LOCAL_CODE = (import.meta.env.VITE_PHONE_CODE as string | undefined) ?? '123456';

interface Store {
  /** false until the saved Supabase session (if any) has been checked and loaded */
  ready: boolean;
  account: Account | null;
  data: UserData | null;
  /** only for Supabase accounts: the plan, pending money, what can be withdrawn */
  money: Money | null;
  online: boolean;
  saveError: boolean;
  // auth: a Romanian phone number and a 6-digit code, for sign-up and sign-in alike
  /** Checks the number with the backend before the code step (no SMS is sent). */
  startPhone(phone: string): Promise<void>;
  /** Proves the number with the code and signs in, creating the account when it's new. */
  verifyPhone(phone: string, code: string): Promise<PhoneResult>;
  enterDemo(): void;
  signOut(): void;
  updateProfile(patch: { name?: string }): Promise<void>;
  deleteAccount(): void;
  // onboarding
  /**
   * Saves what was answered before the account existed: the first goal (only on an account with
   * no goals yet), the money plan's daily amount and payday (only while no plan runs at Stripe)
   * and the answers. Never records any money: the first real payment is the plan's Checkout.
   */
  savePlan(goal: Omit<Goal, 'id' | 'createdAt' | 'status' | 'isPrimary'> | null, setup: Partial<SetupState>, plan: { daily: Bani; payday: number }, startingBalance?: Bani): Promise<void>;
  updateSetup(patch: Partial<SetupState>): void;
  completeOnboarding(): void;
  // goals
  createGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'status' | 'isPrimary'>): Goal;
  updateGoal(id: string, patch: Partial<Omit<Goal, 'id'>>): void;
  updatePlan(id: string, plan: Plan): void;
  setPrimary(id: string): void;
  deleteGoal(id: string): void;
  // money (local accounts record it; Supabase accounts move it through the calls below)
  addTransaction(input: TxInput): Transaction;
  editTransaction(id: string, patch: Partial<TxInput>): void;
  deleteTransaction(id: string): void;
  // real money (Supabase accounts, Stripe test mode)
  /** Stripe Checkout for the schedule (weekly or monthly, its day, the amount each time). */
  startPlan(plan: Plan): Promise<string>;
  deposit(amount: number, when: 'now' | 'next_topup', note?: string): Promise<void>;
  withdraw(amount: number): Promise<void>;
  fixCard(): Promise<string>;
  inviteParent(input: { parentName: string; ratioNum: number; ratioDen: number; capBani: number }): Promise<{ url: string }>;
  checkoutReturned(result: 'success' | 'cancel'): void;
  refresh(): Promise<void>;
  // streak: a day counts when money is put aside (addTransaction, deposit); frozen days are set by hand
  togglePause(dateKey: string): void;
  // tracking
  setTracking(method: UserData['tracking']): void;
  sync(): Promise<void>;
  setSimulateFailure(on: boolean): void;
  disconnect(): void;
  // prefs
  setReminder(r: UserData['reminder']): void;
  setPrefs(p: Partial<UserData['prefs']>): void;
}

const Ctx = createContext<Store | null>(null);

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function validateAmount(amount: number) {
  if (!Number.isInteger(amount) || amount <= 0) throw new ActionError('Enter an amount above 0.');
  if (amount > MAX_AMOUNT) throw new ActionError("That amount looks too big. Check you didn't type an extra digit.");
}

// ---------- Supabase account helpers ----------

interface Remote {
  user: { id: string; email: string; phone: string; createdAt: string };
  rows: RemoteRows;
  balances: BalancesRow | null;
}

const deviceKey = (id: string) => `kip.device.${id}`;
const CHECKOUT_KEY = 'kip.checkout';

/** The sign-up answers that count as "setup" in the meta, merged over what's there. */
const withSetup = (m: KipMeta, patch: Partial<SetupState>): KipMeta => ({
  ...m,
  setup: { ...m.setup, ...patch },
  // turning notifications on also turns on the weekly reminder they deliver
  ...(patch.notifications === 'granted' ? { reminder: { ...(m.reminder ?? storage.emptyData().reminder), enabled: true } } : {}),
});

function loadDevice(id: string): DeviceState {
  const base = storage.emptyData();
  try {
    const raw = localStorage.getItem(deviceKey(id));
    const d = raw ? (JSON.parse(raw) as Partial<DeviceState>) : {};
    return { prefs: { ...base.prefs, ...d.prefs }, draft: { ...base.onboarding.draft, ...d.draft } };
  } catch {
    return { prefs: base.prefs, draft: base.onboarding.draft };
  }
}

function saveDevice(id: string, d: DeviceState) {
  try {
    localStorage.setItem(deviceKey(id), JSON.stringify(d));
  } catch {
    /* private mode: prefs just won't survive a reload */
  }
}


const asAction = (e: unknown) => (e instanceof ApiError ? new ActionError(e.message, e.status) : e instanceof ActionError ? e : new ActionError('Something went wrong. Try again in a few seconds.'));

export function StoreProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => {
    const id = storage.getSession();
    return id ? storage.listAccounts().find((a) => a.id === id) ?? null : null;
  });
  const [data, setData] = useState<UserData | null>(() => (account ? storage.loadData(account.id) : null));
  const [online, setOnline] = useState(() => navigator.onLine);
  const [saveError, setSaveError] = useState(false);
  const dataRef = useRef(data);
  dataRef.current = data;
  const accountRef = useRef(account);
  accountRef.current = account;

  // Supabase account state. When set, it wins over the local account above.
  const [ready, setReady] = useState(!backendReady);
  const [remote, setRemote] = useState<Remote | null>(null);
  const [meta, setMeta] = useState<KipMeta>({});
  const [device, setDevice] = useState<DeviceState | null>(null);
  const [awaitingCheckout, setAwaitingCheckout] = useState(() => !!sessionStorage.getItem(CHECKOUT_KEY));
  const remoteRef = useRef<Remote | null>(null);
  const metaRef = useRef<KipMeta>({});
  const deviceRef = useRef<DeviceState | null>(null);
  const sessionUid = useRef<string | null>(null);
  // writes go out one after another (a primary-goal swap needs its order) and while any is in
  // flight a reload keeps the optimistic Kip meta instead of the older copy from the database
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  const remoteData = useMemo(() => (remote && device ? remoteUserData(remote.rows, meta, device) : null), [remote, meta, device]);
  // stable between reloads (screens key effects on the account, e.g. the first-run tour)
  const rId = remote?.user.id;
  // a phone account's email is a stand-in, so no name is just no name (the setup asks for one)
  const rName = remote?.rows.profile.first_name ?? '';
  const rEmail = remote?.user.email ?? '';
  const rPhone = meta.phone ?? remote?.user.phone ?? '';
  const rCreated = remote?.user.createdAt ?? '';
  const remoteAccount = useMemo<Account | null>(
    () => (rId ? { id: rId, name: rName, email: rEmail, phone: rPhone, provider: 'phone', createdAt: rCreated, isDemo: false, remote: true } : null),
    [rId, rName, rEmail, rPhone, rCreated],
  );
  const shownAccount = remoteAccount ?? account;
  // freezes live in the social layer (lib/social); the streak everywhere in the app counts them
  const shownId = shownAccount?.id ?? null;
  const extras = useSyncExternalStore(
    useCallback((fn: () => void) => socialRepo.subscribe(fn), []),
    () => (shownId ? socialRepo.extrasFor(shownId) : null),
  );
  const shownData = useMemo(() => {
    const base = remoteData ?? data;
    return base && extras ? { ...base, freezeDays: extras.freezeDays, streakHold: extras.hold } : base;
  }, [remoteData, data, extras]);
  const money = useMemo<Money | null>(() => {
    if (!remote) return null;
    const m = moneyState(remote.rows.profile, remote.rows.ledger, remote.balances);
    // back from Checkout: waiting until Stripe says the plan runs (the first deposit may be days away)
    return { ...m, awaiting: awaitingCheckout && !m.running && !m.hasTopUp };
  }, [remote, awaitingCheckout]);

  // Apply accessibility preferences globally.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.largeText = shownData?.prefs.largerText ? 'true' : 'false';
    root.dataset.reduceMotion = shownData?.prefs.reduceMotion ? 'true' : 'false';
  }, [shownData?.prefs.largerText, shownData?.prefs.reduceMotion]);

  // ---------- Supabase: load, realtime, writes ----------

  const load = useCallback(async (userId: string) => {
    const [p, g, l, b] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      supabase.from('goals').select('*').eq('user_id', userId).order('created_at'),
      // shared-goal money (bucket 'shared') is extra and separate: never in personal savings or history
      supabase.from('ledger_entries').select('*').eq('user_id', userId).neq('bucket', 'shared').order('created_at'),
      supabase.from('balances').select('*').eq('user_id', userId).maybeSingle(),
    ]);
    if (p.error || g.error || l.error) throw new ActionError("We couldn't load your data. Check your internet and reload.");
    if (!p.data) throw new ActionError("We couldn't find your profile. Reload the app.");
    if (sessionUid.current !== userId) return; // signed out while loading
    const cur = remoteRef.current;
    // the session is read locally (no extra request); the user's email and join date come with it
    const u = cur?.user.id === userId ? null : (await supabase.auth.getSession()).data.session?.user;
    const next: Remote = {
      user:
        cur?.user.id === userId
          ? cur.user
          : { id: userId, email: u?.email ?? '', phone: (u?.user_metadata?.phone as string | undefined) ?? u?.phone ?? '', createdAt: u?.created_at ?? new Date().toISOString() },
      rows: { profile: p.data as ProfileRow, goals: (g.data ?? []) as GoalRow[], ledger: (l.data ?? []) as LedgerRow[] },
      balances: (b.data as BalancesRow | null) ?? null,
    };
    remoteRef.current = next;
    setRemote(next);
    if (inFlight.current === 0) {
      metaRef.current = metaOf(next.rows.profile);
      setMeta(metaRef.current);
    }
  }, []);

  const reload = useCallback(async () => {
    const id = sessionUid.current;
    if (id) await load(id).catch(() => undefined);
  }, [load]);

  const enterRemote = useCallback(
    async (user: User) => {
      sessionUid.current = user.id;
      // a local (demo) session and a cloud one never run together
      storage.setSession(null);
      accountRef.current = null;
      dataRef.current = null;
      setAccount(null);
      setData(null);
      const dev = loadDevice(user.id);
      deviceRef.current = dev;
      setDevice(dev);
      if (remoteRef.current?.user.id !== user.id) {
        remoteRef.current = null;
        setRemote(null);
      }
      await load(user.id);
    },
    [load],
  );

  const leaveRemote = useCallback(() => {
    sessionUid.current = null;
    remoteRef.current = null;
    deviceRef.current = null;
    metaRef.current = {};
    setRemote(null);
    setDevice(null);
    setMeta({});
    sessionStorage.removeItem(CHECKOUT_KEY);
    setAwaitingCheckout(false);
  }, []);

  useEffect(() => {
    if (!backendReady) return;
    let alive = true;
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (s.session) await enterRemote(s.session.user).catch(() => undefined);
      if (alive) setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // never await Supabase calls inside this callback (supabase-js holds a lock here)
      if (event === 'SIGNED_OUT') setTimeout(leaveRemote, 0);
      // a sign-in from another tab; verifyPhone() here already enters on its own
      else if (s && event === 'SIGNED_IN' && sessionUid.current !== s.user.id)
        setTimeout(() => {
          if (sessionUid.current !== s.user.id) void enterRemote(s.user).catch(() => undefined);
        }, 0);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [enterRemote, leaveRemote]);

  // A webhook confirms money behind the user's back: Realtime brings it here without a refresh.
  const remoteUid = remote?.user.id ?? null;
  useEffect(() => {
    if (!remoteUid) return;
    let t: number | undefined;
    const soon = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => void reload(), 300);
    };
    const ch = supabase
      .channel(`kip-${remoteUid}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'ledger_entries', filter: `user_id=eq.${remoteUid}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `user_id=eq.${remoteUid}` }, soon)
      .subscribe();
    return () => {
      window.clearTimeout(t);
      void supabase.removeChannel(ch);
    };
  }, [remoteUid, reload]);

  // Belt and braces while money is on its way: poll too, in case Realtime is slow or blocked.
  const waiting = !!money && (money.awaiting || money.pendingIn > 0);
  useEffect(() => {
    if (!waiting) return;
    const started = Date.now();
    const t = window.setInterval(() => {
      if (Date.now() - started > 5 * 60_000) window.clearInterval(t);
      else void reload();
    }, 4000);
    return () => window.clearInterval(t);
  }, [waiting, reload]);

  useEffect(() => {
    if (money && (money.hasTopUp || money.running) && awaitingCheckout) {
      sessionStorage.removeItem(CHECKOUT_KEY);
      setAwaitingCheckout(false);
    }
  }, [money, awaitingCheckout]);

  /** Queues a database write; a failure flags it and reloads the truth from the server. */
  const enqueue = useCallback(
    (job: () => PromiseLike<{ error: unknown } | void>) => {
      inFlight.current++;
      const run = chain.current.then(async () => {
        try {
          const r = await job();
          if (r && r.error) throw r.error;
        } catch (e) {
          console.error('[kip] save failed', e);
          setSaveError(true);
          await reload();
        } finally {
          inFlight.current--;
        }
      });
      chain.current = run;
      return run;
    },
    [reload],
  );

  const patchRows = useCallback((fn: (r: RemoteRows) => RemoteRows) => {
    const cur = remoteRef.current;
    if (!cur) return;
    const next = { ...cur, rows: fn(cur.rows) };
    remoteRef.current = next;
    setRemote(next);
  }, []);

  /** Kip-only details (goal icons, plans, reminder, frozen days) live in profiles.onboarding_state.kip. */
  const writeMeta = useCallback(
    (fn: (m: KipMeta) => KipMeta) => {
      const cur = remoteRef.current;
      if (!cur) return Promise.resolve();
      metaRef.current = fn(metaRef.current);
      setMeta(metaRef.current);
      return enqueue(() => {
        const state = { ...(remoteRef.current?.rows.profile.onboarding_state ?? {}), kip: metaRef.current };
        return supabase.from('profiles').update({ onboarding_state: state }).eq('user_id', cur.user.id);
      });
    },
    [enqueue],
  );

  const patchDevice = useCallback((fn: (d: DeviceState) => DeviceState) => {
    const id = remoteRef.current?.user.id;
    if (!id || !deviceRef.current) return;
    deviceRef.current = fn(deviceRef.current);
    saveDevice(id, deviceRef.current);
    setDevice(deviceRef.current);
  }, []);

  // ---------- local accounts ----------

  const commit = useCallback((fn: (d: UserData) => UserData) => {
    const acc = accountRef.current;
    const cur = dataRef.current;
    if (!acc || !cur) throw new ActionError("You're signed out.");
    const next = fn(cur);
    dataRef.current = next;
    setData(next);
    setSaveError(!storage.saveData(acc.id, next));
    return next;
  }, []);

  const start = useCallback((acc: Account) => {
    storage.setSession(acc.id);
    // refs too, so an action called right after sign-up (savePlan) sees the new account
    accountRef.current = acc;
    setAccount(acc);
    const d = storage.loadData(acc.id);
    dataRef.current = d;
    setData(d);
  }, []);

  const recordAction = (d: UserData, kind: ActionKind, date = todayKey()): UserData => {
    // Only actions dated today or earlier fill streak days; a contribution backdated to last week
    // still counts for that day, which matches what actually happened.
    if (date > todayKey()) return d;
    return { ...d, actions: [...d.actions, { date, kind, at: new Date().toISOString() }] };
  };

  const syncTimer = useRef<number | null>(null);

  const store = useMemo<Store>(() => {
    const R = () => remoteRef.current;
    const profileOf = () => R()!.rows.profile;
    const goalRows = () => R()?.rows.goals ?? [];
    const uidOf = () => R()!.user.id;
    const call = async <T,>(fn: string, body: Record<string, unknown>): Promise<T> => {
      try {
        return await callFn<T>(fn, body);
      } catch (e) {
        throw asAction(e);
      }
    };
    /** Moves "primary" to another goal: the old flag goes first (one primary per user in the DB). */
    const movePrimary = (fromId: string | null, toId: string | null) => {
      patchRows((r) => ({ ...r, goals: r.goals.map((g) => ({ ...g, is_primary: g.id === toId })) }));
      const id = uidOf();
      if (fromId) void enqueue(() => supabase.from('goals').update({ is_primary: false }).eq('id', fromId));
      else void enqueue(() => supabase.from('goals').update({ is_primary: false }).eq('user_id', id).eq('is_primary', true));
      if (toId) void enqueue(() => supabase.from('goals').update({ is_primary: true }).eq('id', toId));
    };

    const s: Store = {
      ready,
      account: shownAccount,
      data: shownData,
      money,
      online,
      saveError,

      async startPhone(phone) {
        if (!backendReady) {
          await wait(350);
          return;
        }
        try {
          await callFn('auth-phone', { action: 'start', phone });
        } catch (e) {
          throw new AuthError(e instanceof ApiError ? e.message : "We couldn't reach the server. Check your internet and try again.", 'phone');
        }
      },
      async verifyPhone(phone, code) {
        if (!backendReady) {
          await wait(400);
          if (code !== LOCAL_CODE) throw new AuthError("That code isn't right. Check the digits and try again.", 'code');
          const existing = storage.findAccountByPhone(phone);
          const acc = existing ?? storage.createAccount(phone);
          start(acc);
          return { isNew: !existing, name: acc.name, completed: dataRef.current?.onboarding.completed ?? false };
        }
        let res: { token_hash: string; is_new: boolean };
        try {
          res = await callFn<{ token_hash: string; is_new: boolean }>('auth-phone', { action: 'verify', phone, code });
        } catch (e) {
          // 401 is a wrong code, 400 a number the backend won't take; both come with Romanian text
          const field = e instanceof ApiError && e.status === 400 ? 'phone' : 'code';
          throw new AuthError(e instanceof ApiError ? e.message : "We couldn't reach the server. Check your internet and try again.", field);
        }
        const { data: v, error } = await supabase.auth.verifyOtp({ token_hash: res.token_hash, type: 'magiclink' });
        if (error || !v.user) throw authError(error ?? {});
        await enterRemote(v.user);
        // the auth user only has a stand-in email: the number lives in Kip's meta, for Profile and friends
        if (metaRef.current.phone !== phone) await writeMeta((m) => ({ ...m, phone }));
        const r = R();
        const completed = !!r && (r.rows.profile.onboarding_state?.completed === true || r.rows.goals.length > 0);
        return { isNew: res.is_new, name: r?.rows.profile.first_name ?? '', completed };
      },
      enterDemo() {
        // the demo is always local: no network, nothing that can break on stage
        if (R()) {
          leaveRemote();
          void supabase.auth.signOut({ scope: 'local' });
        }
        const acc = storage.upsertDemoAccount();
        const existing = storage.loadData(acc.id);
        if (!existing.onboarding.completed) storage.saveData(acc.id, sampleData());
        start(acc);
      },
      signOut() {
        if (R()) {
          leaveRemote();
          void supabase.auth.signOut();
        }
        storage.setSession(null);
        setAccount(null);
        setData(null);
      },
      async updateProfile(patch) {
        const r = R();
        if (r) {
          if (patch.name !== undefined) {
            const name = patch.name.trim().slice(0, 40);
            patchRows((x) => ({ ...x, profile: { ...x.profile, first_name: name } }));
            await enqueue(() => supabase.from('profiles').update({ first_name: name }).eq('user_id', r.user.id));
          }
          return;
        }
        const acc = accountRef.current;
        if (!acc) return;
        const next = storage.updateAccount(acc.id, patch);
        if (next) setAccount(next);
      },
      deleteAccount() {
        if (R()) throw new ActionError("We delete cloud accounts on request: write to us and we'll delete it along with your data.");
        const acc = accountRef.current;
        if (!acc) return;
        storage.deleteAccount(acc.id);
        setAccount(null);
        setData(null);
      },

      async savePlan(goalInput, setup, plan, startingBalance = 0) {
        const r = R();
        if (r) {
          const id = r.user.id;
          const kip: KipMeta = withSetup(metaRef.current, setup);
          // an account that already has goals keeps them: signing up again with the same number
          // doesn't add a second main goal
          if (goalInput && r.rows.goals.length === 0) {
            const goalId = crypto.randomUUID();
            const row = {
              id: goalId,
              user_id: id,
              kind: kindToDb(goalInput.kind),
              name: (goalInput.name.trim() || 'My goal').slice(0, 60),
              target_bani: goalInput.target,
              target_date: goalInput.targetDate,
              is_primary: true,
              status: 'active' as const,
            };
            const g = await supabase.from('goals').insert(row);
            if (g.error) throw new ActionError("We couldn't save your goal. Try again.");
            kip.goals = {
              ...kip.goals,
              [goalId]: {
                kind: goalInput.kind,
                motivation: goalInput.motivation,
                plan: goalInput.plan,
                ...(goalInput.icon ? { icon: goalInput.icon } : {}),
                ...(goalInput.colour ? { colour: goalInput.colour } : {}),
                // what they already had put aside: progress on the goal, never a payment
                ...(startingBalance > 0 ? { startingBalance } : {}),
              },
            };
          }
          const profile: Record<string, unknown> = { onboarding_state: { ...(r.rows.profile.onboarding_state ?? {}), kip } };
          // the money plan is Stripe's once it runs; before that, the answers set it
          if (!r.rows.profile.stripe_subscription_id) {
            profile.daily_amount_bani = plan.daily;
            profile.payday_day = plan.payday;
          }
          const p = await supabase.from('profiles').update(profile).eq('user_id', id);
          if (p.error) throw new ActionError("We couldn't save your plan. Try again.");
          metaRef.current = kip;
          setMeta(kip);
          await load(id);
          return;
        }
        commit((d) => {
          const now = new Date().toISOString();
          // until onboarding is done the plan is still a draft: saving again replaces it
          const goal: Goal | null = goalInput && !d.onboarding.completed ? { ...goalInput, id: uid('g_'), createdAt: now, status: 'active', isPrimary: true } : null;
          // a replaced draft goal takes its starting amount with it
          const kept = d.transactions.filter((t) => t.goalId === null || !goal || t.note !== 'What you already had');
          // what they already had put aside counts as a manual entry (no streak day: nothing was done today)
          const start: Transaction[] =
            goal && startingBalance > 0
              ? [{ id: uid('t_'), type: 'contribution', amount: startingBalance, goalId: goal.id, date: todayKey(), note: 'What you already had', status: 'confirmed', source: 'manual', createdAt: now, updatedAt: now }]
              : [];
          return { ...d, goals: goal ? [goal] : d.goals, transactions: [...kept, ...start], setup: { ...d.setup, ...setup } };
        });
      },
      updateSetup(patch) {
        if (R()) {
          void writeMeta((m) => withSetup(m, patch));
          return;
        }
        commit((d) => ({ ...d, setup: { ...d.setup, ...patch }, reminder: patch.notifications === 'granted' ? { ...d.reminder, enabled: true } : d.reminder }));
      },
      completeOnboarding() {
        const r = R();
        if (r) {
          patchRows((x) => ({ ...x, profile: { ...x.profile, onboarding_state: { ...(x.profile.onboarding_state ?? {}), completed: true } } }));
          void writeMeta((m) => m);
          return;
        }
        commit((d) => ({ ...d, onboarding: { ...d.onboarding, completed: true, step: 4 } }));
      },

      createGoal(input) {
        if (!input.name.trim()) throw new ActionError('Give your goal a name.');
        validateAmount(input.target);
        const r = R();
        if (r) {
          const id = crypto.randomUUID();
          const primary = !r.rows.goals.some((g) => g.status === 'active');
          const row: GoalRow = {
            id,
            user_id: r.user.id,
            kind: kindToDb(input.kind),
            is_primary: false,
            name: input.name.trim().slice(0, 60),
            target_bani: input.target,
            target_date: input.targetDate,
            status: 'active',
            created_at: new Date().toISOString(),
          };
          patchRows((x) => ({ ...x, goals: [...x.goals, row] }));
          void enqueue(() =>
            supabase.from('goals').insert({ id, user_id: row.user_id, kind: row.kind, name: row.name, target_bani: row.target_bani, target_date: row.target_date, is_primary: false }),
          );
          void writeMeta((m) => ({
            ...m,
            goals: { ...m.goals, [id]: { kind: input.kind, motivation: input.motivation, plan: input.plan, ...(input.icon ? { icon: input.icon } : {}), ...(input.colour ? { colour: input.colour } : {}) } },
          }));
          if (primary) {
            movePrimary(null, id);
            // the main goal's plan is the money plan: a new main goal (no other active one) sets it
            s.updatePlan(id, input.plan);
          }
          return goalFromRow({ ...row, is_primary: primary }, metaRef.current, profileOf());
        }
        const goal: Goal = {
          ...input,
          name: input.name.trim(),
          id: uid('g_'),
          createdAt: new Date().toISOString(),
          status: 'active',
          isPrimary: !dataRef.current?.goals.some((g) => g.status === 'active'),
        };
        commit((d) => ({ ...d, goals: [...d.goals, goal] }));
        return goal;
      },
      updateGoal(id, patch) {
        if (patch.name !== undefined && !patch.name.trim()) throw new ActionError('Give your goal a name.');
        if (patch.target !== undefined) validateAmount(patch.target);
        const r = R();
        if (r) {
          const db: Partial<GoalRow> = {};
          if (patch.name !== undefined) db.name = patch.name.trim().slice(0, 60);
          if (patch.target !== undefined) db.target_bani = patch.target;
          if (patch.targetDate !== undefined) db.target_date = patch.targetDate;
          if (patch.status !== undefined) db.status = patch.status;
          if (patch.kind !== undefined) db.kind = kindToDb(patch.kind);
          if (Object.keys(db).length) {
            patchRows((x) => ({ ...x, goals: x.goals.map((g) => (g.id === id ? { ...g, ...db } : g)) }));
            void enqueue(() => supabase.from('goals').update(db).eq('id', id));
          }
          const m: Record<string, unknown> = {};
          if (patch.motivation !== undefined) m.motivation = patch.motivation;
          if (patch.plan !== undefined) m.plan = patch.plan;
          if (patch.icon !== undefined) m.icon = patch.icon;
          if (patch.colour !== undefined) m.colour = patch.colour;
          if (patch.kind !== undefined) m.kind = patch.kind;
          if (Object.keys(m).length) void writeMeta((x) => ({ ...x, goals: { ...x.goals, [id]: { ...x.goals?.[id], ...m } } }));
          // pausing or archiving the primary goal hands "primary" to the next active one
          const changed = goalRows().find((g) => g.id === id);
          if (changed?.is_primary && patch.status && patch.status !== 'active') {
            const next = goalRows().find((g) => g.status === 'active' && g.id !== id);
            if (next) movePrimary(id, next.id);
          }
          return;
        }
        commit((d) => {
          let goals = d.goals.map((g) => (g.id === id ? { ...g, ...patch } : g));
          // Archiving or pausing the primary goal hands "primary" to the next active one.
          const changed = goals.find((g) => g.id === id);
          if (changed && changed.isPrimary && changed.status !== 'active') {
            const nextPrimary = goals.find((g) => g.status === 'active' && g.id !== id);
            if (nextPrimary) goals = goals.map((g) => ({ ...g, isPrimary: g.id === nextPrimary.id }));
          }
          return { ...d, goals };
        });
      },
      updatePlan(id, plan) {
        if (plan.frequency !== 'flexible') validateAmount(plan.amount);
        const r = R();
        if (r) {
          void writeMeta((x) => ({ ...x, goals: { ...x.goals, [id]: { ...x.goals?.[id], plan } } }));
          // the main goal's plan is the money plan (what Stripe collects): the same schedule there
          const p = r.rows.profile;
          const cur = schedulePlan(p);
          if (r.rows.goals.find((g) => g.id === id)?.is_primary && plan.frequency !== 'flexible' && plan.day !== null && (cur.amount !== plan.amount || cur.frequency !== plan.frequency || cur.day !== plan.day)) {
            const every = plan.frequency === 'weekly' ? 'week' : 'month';
            patchRows((x) => ({ ...x, profile: { ...x.profile, plan_every: every, plan_day: plan.day!, plan_amount_bani: plan.amount } }));
            void enqueue(() => callFn('payments', { action: 'update_schedule', every, day: plan.day, amount_bani: plan.amount }));
          }
          return;
        }
        commit((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, plan } : g)) }));
      },
      setPrimary(id) {
        if (R()) {
          movePrimary(goalRows().find((g) => g.is_primary)?.id ?? null, id);
          return;
        }
        commit((d) => ({ ...d, goals: d.goals.map((g) => ({ ...g, isPrimary: g.id === id })) }));
      },
      deleteGoal(id) {
        const r = R();
        if (r) {
          // ledger rows that point at a goal must keep it (the database refuses to orphan them)
          if (r.rows.ledger.some((l) => l.goal_id === id)) throw new ActionError('This goal has money in it. Archive it instead of deleting it.');
          const g = r.rows.goals.find((x) => x.id === id);
          if (g?.is_primary) movePrimary(id, r.rows.goals.find((x) => x.status === 'active' && x.id !== id)?.id ?? null);
          patchRows((x) => ({ ...x, goals: x.goals.filter((y) => y.id !== id) }));
          void enqueue(() => supabase.from('goals').delete().eq('id', id));
          void writeMeta((x) => {
            const goals = { ...x.goals };
            delete goals[id];
            return { ...x, goals };
          });
          return;
        }
        commit((d) => {
          // History is kept: the goal's transactions move to unallocated, so the total never changes.
          let goals = d.goals.filter((g) => g.id !== id);
          if (!goals.some((g) => g.isPrimary)) {
            const first = goals.find((g) => g.status === 'active');
            if (first) goals = goals.map((g) => ({ ...g, isPrimary: g.id === first.id }));
          }
          return {
            ...d,
            goals,
            transactions: d.transactions.map((t) => (t.goalId === id ? { ...t, goalId: null, updatedAt: new Date().toISOString() } : t)),
          };
        });
      },

      addTransaction(input) {
        // real money never goes through here: the money sheets call deposit / withdraw
        if (R()) throw new ActionError('Real money goes in through “Save money”.');
        validateAmount(input.amount);
        const d = dataRef.current!;
        if (input.date > todayKey()) throw new ActionError("The date can't be in the future.");
        if (input.type === 'withdrawal') {
          const max = available(d.transactions, input.goalId);
          if (input.amount > max) throw new ActionError(`Only ${(max / 100).toLocaleString('en-GB')} lei is available here.`);
        }
        const now = new Date().toISOString();
        const isDemo = d.tracking === 'demo';
        if (isDemo && (d.connection.status === 'error' || !navigator.onLine)) {
          throw new ActionError("The demo connection needs attention, so we didn't start a simulated transfer. Reconnect and try again.");
        }
        const tx: Transaction = {
          id: uid('t_'),
          type: input.type,
          amount: input.amount,
          goalId: input.goalId,
          date: input.date,
          note: input.note.trim(),
          // Simulated transfers start pending and only count once the next sync confirms them.
          status: isDemo ? 'pending' : 'confirmed',
          source: isDemo ? 'demo' : 'manual',
          createdAt: now,
          updatedAt: now,
        };
        commit((cur) => {
          const next = { ...cur, transactions: [...cur.transactions, tx] };
          return tx.type === 'contribution' ? recordAction(next, 'contribution', tx.date) : next;
        });
        if (isDemo) {
          if (syncTimer.current) window.clearTimeout(syncTimer.current);
          syncTimer.current = window.setTimeout(() => void s.sync().catch(() => undefined), 2500);
        }
        return tx;
      },
      editTransaction(id, patch) {
        if (R()) throw new ActionError("Stripe payments can't be edited.");
        const d = dataRef.current!;
        const tx = d.transactions.find((t) => t.id === id);
        if (!tx) throw new ActionError('This transaction is gone.');
        if (tx.source !== 'manual') throw new ActionError('You can only edit entries you added yourself.');
        const merged = { ...tx, ...patch };
        validateAmount(merged.amount);
        if (merged.date > todayKey()) throw new ActionError("The date can't be in the future.");
        if (merged.type === 'withdrawal') {
          const max = available(d.transactions, merged.goalId, id);
          if (merged.amount > max) throw new ActionError(`Only ${(max / 100).toLocaleString('en-GB')} lei is available here.`);
        } else {
          // Shrinking a contribution must not leave a later withdrawal uncovered.
          const without = d.transactions.filter((t) => t.id !== id);
          const after = [...without, merged];
          if (available(after, tx.goalId) < 0 || available(after, merged.goalId) < 0) {
            throw new ActionError('With this change, a withdrawal would be more than you saved.');
          }
        }
        commit((cur) => ({
          ...cur,
          transactions: cur.transactions.map((t) => (t.id === id ? { ...merged, note: merged.note.trim(), updatedAt: new Date().toISOString() } : t)),
        }));
      },
      deleteTransaction(id) {
        if (R()) throw new ActionError("Stripe payments can't be deleted. You can withdraw money anytime.");
        const d = dataRef.current!;
        const tx = d.transactions.find((t) => t.id === id);
        if (!tx) return;
        if (tx.source !== 'manual') throw new ActionError("Simulated entries come from the demo connection and can't be deleted.");
        if (tx.type === 'contribution' && tx.status === 'confirmed') {
          const rest = d.transactions.filter((t) => t.id !== id);
          const bucket = rest.filter((t) => t.goalId === tx.goalId && t.status === 'confirmed');
          const left = bucket.reduce((s2, t) => s2 + (t.type === 'contribution' ? t.amount : -t.amount), 0);
          if (left < 0) throw new ActionError('First delete the withdrawal that used this money.');
        }
        commit((cur) => ({ ...cur, transactions: cur.transactions.filter((t) => t.id !== id) }));
      },

      async startPlan(plan) {
        const r = R();
        if (!r) throw new ActionError('Sign in to start your plan.');
        if (plan.frequency === 'flexible' || plan.day === null) throw new ActionError('Pick how often and which day first.');
        // payments.start saves the schedule on the profile and sets Stripe up with it
        const res = await call<{ url: string }>('payments', { action: 'start', every: plan.frequency === 'weekly' ? 'week' : 'month', day: plan.day, amount_bani: plan.amount });
        sessionStorage.setItem(CHECKOUT_KEY, String(Date.now()));
        return res.url;
      },
      async deposit(amount, when, note) {
        await call('payments', { action: 'extra_deposit', amount_bani: amount, when, ...(note?.trim() ? { note: note.trim().slice(0, 140) } : {}) });
        await reload();
      },
      async withdraw(amount) {
        await call('payments', { action: 'withdraw', amount_bani: amount });
        await reload();
      },
      async fixCard() {
        const { url } = await call<{ url: string }>('payments', { action: 'fix_card' });
        return url;
      },
      async inviteParent({ parentName, ratioNum, ratioDen, capBani }) {
        const res = await call<{ url: string }>('family', { action: 'create', parent_name: parentName, ratio_num: ratioNum, ratio_den: ratioDen, monthly_cap_bani: capBani });
        return { url: res.url };
      },
      checkoutReturned(result) {
        if (result === 'success') {
          sessionStorage.setItem(CHECKOUT_KEY, String(Date.now()));
          setAwaitingCheckout(true);
          void reload();
        } else {
          sessionStorage.removeItem(CHECKOUT_KEY);
          setAwaitingCheckout(false);
        }
      },
      refresh: reload,

      togglePause(dateKey) {
        if (R()) {
          void writeMeta((m) => ({ ...m, pausedDays: toggleDay(m.pausedDays ?? [], dateKey) }));
          return;
        }
        commit((d) => ({
          ...d,
          pausedDays: d.pausedDays.includes(dateKey) ? d.pausedDays.filter((x) => x !== dateKey) : [...d.pausedDays, dateKey],
        }));
      },

      setTracking(method) {
        if (R()) return; // a Supabase account always moves money through Stripe
        commit((d) => ({
          ...d,
          tracking: method,
          connection:
            method === 'demo'
              ? { ...d.connection, status: 'connected', institution: 'Demo Bank (simulated)', lastSyncAt: new Date().toISOString(), lastError: null }
              : { ...d.connection, status: 'none', institution: null, lastError: null },
        }));
      },
      async sync() {
        if (R()) return reload();
        const d = dataRef.current;
        if (!d || d.tracking !== 'demo') return;
        commit((cur) => ({ ...cur, connection: { ...cur.connection, status: 'syncing' } }));
        await wait(1200);
        const cur = dataRef.current!;
        if (!navigator.onLine || cur.connection.simulateFailure) {
          // Failure keeps every known transaction and the last sync time; only the status changes.
          const msg = !navigator.onLine ? "You're offline." : "Demo Bank didn't answer (simulated error).";
          commit((c) => ({ ...c, connection: { ...c.connection, status: 'error', lastError: msg } }));
          throw new ActionError(msg);
        }
        const today = todayKey();
        commit((c) => ({
          ...c,
          transactions: c.transactions.map((t) =>
            t.source === 'demo' && t.status === 'pending' && t.date <= today ? { ...t, status: 'confirmed', updatedAt: new Date().toISOString() } : t,
          ),
          connection: { ...c.connection, status: 'connected', lastSyncAt: new Date().toISOString(), lastError: null },
        }));
      },
      setSimulateFailure(on) {
        if (R()) return;
        commit((d) => ({ ...d, connection: { ...d.connection, simulateFailure: on } }));
      },
      disconnect() {
        s.setTracking('manual');
      },

      setReminder(r) {
        if (R()) {
          void writeMeta((m) => ({ ...m, reminder: r }));
          return;
        }
        commit((d) => ({ ...d, reminder: r }));
      },
      setPrefs(p) {
        if (R()) {
          patchDevice((d) => ({ ...d, prefs: { ...d.prefs, ...p } }));
          return;
        }
        commit((d) => ({ ...d, prefs: { ...d.prefs, ...p } }));
      },
    };
    return s;
  }, [ready, shownAccount, shownData, money, online, saveError, commit, start, enterRemote, leaveRemote, load, reload, enqueue, patchRows, writeMeta, patchDevice]);

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}

/** For screens behind the auth guard, where data is guaranteed. */
export function useData(): UserData {
  const { data } = useStore();
  if (!data) throw new Error('useData without a signed-in account');
  return data;
}
