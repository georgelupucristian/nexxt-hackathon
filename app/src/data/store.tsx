import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { todayKey } from '../lib/dates';
import { uid } from '../lib/id';
import { MAX_AMOUNT } from '../lib/money';
import { available } from './selectors';
import { sampleData } from './seed';
import * as storage from './storage';
import type { Account, ActionKind, Goal, OnboardingDraft, Plan, Transaction, UserData } from './types';

export class ActionError extends Error {}

interface TxInput {
  type: Transaction['type'];
  amount: number;
  goalId: string | null;
  date: string;
  note: string;
}

interface Store {
  account: Account | null;
  data: UserData | null;
  online: boolean;
  saveError: boolean;
  // auth
  signUp(name: string, email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  enterDemo(): void;
  signOut(): void;
  updateProfile(patch: { name?: string; email?: string }): void;
  deleteAccount(): void;
  // onboarding
  saveDraft(patch: Partial<OnboardingDraft>, step?: number): void;
  finishOnboarding(goal: Omit<Goal, 'id' | 'createdAt' | 'status' | 'isPrimary'>, opts: Pick<UserData, 'tracking' | 'reminder'>): void;
  // goals
  createGoal(goal: Omit<Goal, 'id' | 'createdAt' | 'status' | 'isPrimary'>): Goal;
  updateGoal(id: string, patch: Partial<Omit<Goal, 'id'>>): void;
  updatePlan(id: string, plan: Plan): void;
  setPrimary(id: string): void;
  deleteGoal(id: string): void;
  // money
  addTransaction(input: TxInput): Transaction;
  editTransaction(id: string, patch: Partial<TxInput>): void;
  deleteTransaction(id: string): void;
  // streak
  checkIn(): void;
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
  if (!Number.isInteger(amount) || amount <= 0) throw new ActionError('Scrie o sumă mai mare decât 0.');
  if (amount > MAX_AMOUNT) throw new ActionError('Suma pare prea mare. Verifică dacă n-ai scris o cifră în plus.');
}

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

  // Apply accessibility preferences globally.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.largeText = data?.prefs.largerText ? 'true' : 'false';
    root.dataset.reduceMotion = data?.prefs.reduceMotion ? 'true' : 'false';
  }, [data?.prefs.largerText, data?.prefs.reduceMotion]);

  const commit = useCallback((fn: (d: UserData) => UserData) => {
    const acc = accountRef.current;
    const cur = dataRef.current;
    if (!acc || !cur) throw new ActionError('Ai ieșit din cont.');
    const next = fn(cur);
    dataRef.current = next;
    setData(next);
    setSaveError(!storage.saveData(acc.id, next));
    return next;
  }, []);

  const start = useCallback((acc: Account) => {
    storage.setSession(acc.id);
    // refs too, so an action called right after sign-up (finishOnboarding) sees the new account
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
    const s: Store = {
      account,
      data,
      online,
      saveError,

      async signUp(name, email, password) {
        await wait(450);
        start(await storage.createAccount(name, email, password));
      },
      async signIn(email, password) {
        await wait(450);
        start(await storage.signIn(email, password));
      },
      enterDemo() {
        const acc = storage.upsertDemoAccount();
        const existing = storage.loadData(acc.id);
        if (!existing.onboarding.completed) storage.saveData(acc.id, sampleData());
        start(acc);
      },
      signOut() {
        storage.setSession(null);
        setAccount(null);
        setData(null);
      },
      updateProfile(patch) {
        const acc = accountRef.current;
        if (!acc) return;
        const next = storage.updateAccount(acc.id, patch);
        if (next) setAccount(next);
      },
      deleteAccount() {
        const acc = accountRef.current;
        if (!acc) return;
        storage.deleteAccount(acc.id);
        setAccount(null);
        setData(null);
      },

      saveDraft(patch, step) {
        commit((d) => ({
          ...d,
          onboarding: { ...d.onboarding, step: step ?? d.onboarding.step, draft: { ...d.onboarding.draft, ...patch } },
        }));
      },
      finishOnboarding(goalInput, opts) {
        commit((d) => {
          const goal: Goal = { ...goalInput, id: uid('g_'), createdAt: new Date().toISOString(), status: 'active', isPrimary: true };
          return {
            ...d,
            goals: [...d.goals, goal],
            tracking: opts.tracking,
            reminder: opts.reminder,
            connection:
              opts.tracking === 'demo'
                ? { ...d.connection, status: 'connected', institution: 'Banca Demo (simulată)', lastSyncAt: new Date().toISOString(), lastError: null }
                : d.connection,
            onboarding: { ...d.onboarding, completed: true, step: 4 },
          };
        });
      },

      createGoal(input) {
        if (!input.name.trim()) throw new ActionError('Dă-i un nume obiectivului.');
        validateAmount(input.target);
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
        if (patch.name !== undefined && !patch.name.trim()) throw new ActionError('Dă-i un nume obiectivului.');
        if (patch.target !== undefined) validateAmount(patch.target);
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
        commit((d) => ({ ...d, goals: d.goals.map((g) => (g.id === id ? { ...g, plan } : g)) }));
      },
      setPrimary(id) {
        commit((d) => ({ ...d, goals: d.goals.map((g) => ({ ...g, isPrimary: g.id === id })) }));
      },
      deleteGoal(id) {
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
        validateAmount(input.amount);
        const d = dataRef.current!;
        if (input.date > todayKey()) throw new ActionError('Data nu poate fi în viitor.');
        if (input.type === 'withdrawal') {
          const max = available(d.transactions, input.goalId);
          if (input.amount > max) throw new ActionError(`Aici sunt disponibili doar ${(max / 100).toLocaleString('ro-RO')} lei.`);
        }
        const now = new Date().toISOString();
        const isDemo = d.tracking === 'demo';
        if (isDemo && (d.connection.status === 'error' || !navigator.onLine)) {
          throw new ActionError('Conexiunea demo are nevoie de atenție, așa că n-am pornit niciun transfer simulat. Reconectează-te și încearcă din nou.');
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
        const d = dataRef.current!;
        const tx = d.transactions.find((t) => t.id === id);
        if (!tx) throw new ActionError('Tranzacția asta nu mai există.');
        if (tx.source !== 'manual') throw new ActionError('Poți edita doar intrările adăugate manual.');
        const merged = { ...tx, ...patch };
        validateAmount(merged.amount);
        if (merged.date > todayKey()) throw new ActionError('Data nu poate fi în viitor.');
        if (merged.type === 'withdrawal') {
          const max = available(d.transactions, merged.goalId, id);
          if (merged.amount > max) throw new ActionError(`Aici sunt disponibili doar ${(max / 100).toLocaleString('ro-RO')} lei.`);
        } else {
          // Shrinking a contribution must not leave a later withdrawal uncovered.
          const without = d.transactions.filter((t) => t.id !== id);
          const after = [...without, merged];
          if (available(after, tx.goalId) < 0 || available(after, merged.goalId) < 0) {
            throw new ActionError('Cu schimbarea asta, o retragere ar depăși suma economisită.');
          }
        }
        commit((cur) => ({
          ...cur,
          transactions: cur.transactions.map((t) => (t.id === id ? { ...merged, note: merged.note.trim(), updatedAt: new Date().toISOString() } : t)),
        }));
      },
      deleteTransaction(id) {
        const d = dataRef.current!;
        const tx = d.transactions.find((t) => t.id === id);
        if (!tx) return;
        if (tx.source !== 'manual') throw new ActionError('Intrările simulate vin din conexiunea demo și nu pot fi șterse.');
        if (tx.type === 'contribution' && tx.status === 'confirmed') {
          const rest = d.transactions.filter((t) => t.id !== id);
          const bucket = rest.filter((t) => t.goalId === tx.goalId && t.status === 'confirmed');
          const left = bucket.reduce((s2, t) => s2 + (t.type === 'contribution' ? t.amount : -t.amount), 0);
          if (left < 0) throw new ActionError('Mai întâi șterge retragerea care a folosit banii ăștia.');
        }
        commit((cur) => ({ ...cur, transactions: cur.transactions.filter((t) => t.id !== id) }));
      },

      checkIn() {
        commit((d) => (d.actions.some((a) => a.date === todayKey() && a.kind === 'check-in') ? d : recordAction(d, 'check-in')));
      },
      togglePause(dateKey) {
        commit((d) => ({
          ...d,
          pausedDays: d.pausedDays.includes(dateKey) ? d.pausedDays.filter((x) => x !== dateKey) : [...d.pausedDays, dateKey],
        }));
      },

      setTracking(method) {
        commit((d) => ({
          ...d,
          tracking: method,
          connection:
            method === 'demo'
              ? { ...d.connection, status: 'connected', institution: 'Banca Demo (simulată)', lastSyncAt: new Date().toISOString(), lastError: null }
              : { ...d.connection, status: 'none', institution: null, lastError: null },
        }));
      },
      async sync() {
        const d = dataRef.current;
        if (!d || d.tracking !== 'demo') return;
        commit((cur) => ({ ...cur, connection: { ...cur.connection, status: 'syncing' } }));
        await wait(1200);
        const cur = dataRef.current!;
        if (!navigator.onLine || cur.connection.simulateFailure) {
          // Failure keeps every known transaction and the last sync time; only the status changes.
          const msg = !navigator.onLine ? 'Ești offline.' : 'Banca Demo n-a răspuns (eroare simulată).';
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
        commit((d) => ({ ...d, connection: { ...d.connection, simulateFailure: on } }));
      },
      disconnect() {
        s.setTracking('manual');
      },

      setReminder(r) {
        commit((d) => ({ ...d, reminder: r }));
      },
      setPrefs(p) {
        commit((d) => ({ ...d, prefs: { ...d.prefs, ...p } }));
      },
    };
    return s;
  }, [account, data, online, saveError, commit, start]);

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
