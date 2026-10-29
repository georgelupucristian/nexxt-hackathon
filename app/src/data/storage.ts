// Local persistence: the demo, and the whole app when no Supabase project is configured
// (backendReady false). Accounts and data live in this browser's localStorage. Cloud accounts
// keep their data in Supabase (see store.tsx and remote.ts) and only per-device prefs here.
import { uid } from '../lib/id';
import type { Account, OnboardingDraft, SetupState, UserData } from './types';

const ACCOUNTS = 'kept.accounts';
const SESSION = 'kept.session';
const dataKey = (id: string) => `kept.data.${id}`;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function emptyDraft(): OnboardingDraft {
  return {
    kind: null,
    name: '',
    target: '',
    targetDate: '',
    motivation: '',
    planAmount: '',
    frequency: 'weekly',
    day: 4,
    tracking: null,
    reminder: { enabled: true, day: 4, time: '19:00' },
  };
}

export function emptySetup(): SetupState {
  return { age: null, reasons: [], dailyGoal: null, payday: null, incomeSources: [], incomeMonthly: null, incomeSkipped: false, notifications: 'unset', faceId: false };
}

export function emptyData(): UserData {
  return {
    version: 1,
    onboarding: { completed: false, step: 0, draft: emptyDraft() },
    goals: [],
    transactions: [],
    tracking: 'manual',
    connection: { status: 'none', institution: null, lastSyncAt: null, lastError: null, simulateFailure: false },
    reminder: { enabled: false, day: 4, time: '19:00' },
    actions: [],
    pausedDays: [],
    prefs: { largerText: false, reduceMotion: false, hideBalance: false },
    setup: emptySetup(),
  };
}

export function listAccounts(): Account[] {
  return read<Account[]>(ACCOUNTS, []);
}

export function getSession(): string | null {
  return read<{ accountId: string } | null>(SESSION, null)?.accountId ?? null;
}

export function setSession(accountId: string | null) {
  if (accountId) write(SESSION, { accountId });
  else localStorage.removeItem(SESSION);
}

export function loadData(accountId: string): UserData {
  const data = read<UserData | null>(dataKey(accountId), null);
  if (!data) return emptyData();
  // Merge over defaults so data saved by an older build still has every field.
  const base = emptyData();
  return {
    ...base,
    ...data,
    onboarding: { ...base.onboarding, ...data.onboarding, draft: { ...base.onboarding.draft, ...data.onboarding?.draft } },
    connection: { ...base.connection, ...data.connection },
    prefs: { ...base.prefs, ...data.prefs },
    setup: { ...base.setup, ...data.setup },
  };
}

export function saveData(accountId: string, data: UserData): boolean {
  return write(dataKey(accountId), data);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public field: 'phone' | 'code' | 'name' | 'form' = 'form',
  ) {
    super(message);
  }
}

export function findAccountByPhone(phone: string): Account | null {
  return listAccounts().find((a) => a.phone === phone && !a.isDemo) ?? null;
}

/** Proof of the number (the code) is the caller's job; this only stores the account. */
export function createAccount(phone: string, name = ''): Account {
  const accounts = listAccounts();
  if (accounts.some((a) => a.phone === phone && !a.isDemo)) throw new AuthError('There is already an account with this number on this device.', 'phone');
  const account: Account = { id: uid('u_'), name: name.trim(), email: '', phone, provider: 'phone', createdAt: new Date().toISOString(), isDemo: false };
  if (!write(ACCOUNTS, [...accounts, account])) throw new AuthError("We couldn't save your account. Storage is full or blocked.");
  saveData(account.id, emptyData());
  return account;
}

export function upsertDemoAccount(): Account {
  const accounts = listAccounts();
  const existing = accounts.find((a) => a.isDemo);
  if (existing) return existing;
  const account: Account = {
    id: uid('demo_'),
    name: 'Ioana',
    email: 'demo@kept.local',
    phone: '',
    provider: 'demo',
    createdAt: new Date().toISOString(),
    isDemo: true,
  };
  write(ACCOUNTS, [...accounts, account]);
  return account;
}

export function updateAccount(id: string, patch: Partial<Pick<Account, 'name'>>): Account | null {
  const accounts = listAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const next = { ...accounts[idx], ...patch };
  accounts[idx] = next;
  write(ACCOUNTS, accounts);
  return next;
}

export function deleteAccount(id: string) {
  write(
    ACCOUNTS,
    listAccounts().filter((a) => a.id !== id),
  );
  localStorage.removeItem(dataKey(id));
  if (getSession() === id) setSession(null);
}
