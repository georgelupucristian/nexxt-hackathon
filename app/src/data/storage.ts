// Local persistence. There is no server in this project: accounts and data live in this
// browser's localStorage, and the UI says so wherever it matters (sign-up, profile, privacy).
import { hashPassword, uid } from '../lib/id';
import type { Account, OnboardingDraft, UserData } from './types';

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
  };
}

export function saveData(accountId: string, data: UserData): boolean {
  return write(dataKey(accountId), data);
}

export class AuthError extends Error {
  constructor(
    message: string,
    public field: 'email' | 'password' | 'name' | 'form' = 'form',
  ) {
    super(message);
  }
}

const normEmail = (e: string) => e.trim().toLowerCase();

export async function createAccount(name: string, email: string, password: string): Promise<Account> {
  const accounts = listAccounts();
  if (accounts.some((a) => a.email === normEmail(email))) {
    throw new AuthError('Există deja un cont cu acest email pe dispozitivul ăsta.', 'email');
  }
  const salt = uid();
  const account: Account = {
    id: uid('u_'),
    name: name.trim(),
    email: normEmail(email),
    salt,
    passwordHash: await hashPassword(password, salt),
    createdAt: new Date().toISOString(),
    isDemo: false,
  };
  if (!write(ACCOUNTS, [...accounts, account])) throw new AuthError('Nu ți-am putut salva contul. Spațiul de stocare e plin sau blocat.');
  saveData(account.id, emptyData());
  return account;
}

export async function signIn(email: string, password: string): Promise<Account> {
  const account = listAccounts().find((a) => a.email === normEmail(email) && !a.isDemo);
  // Same message for both cases so the form doesn't reveal which emails exist.
  if (!account) throw new AuthError('Emailul sau parola nu sunt corecte.');
  const hash = await hashPassword(password, account.salt);
  if (hash !== account.passwordHash) throw new AuthError('Emailul sau parola nu sunt corecte.');
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
    salt: '',
    passwordHash: '',
    createdAt: new Date().toISOString(),
    isDemo: true,
  };
  write(ACCOUNTS, [...accounts, account]);
  return account;
}

export function updateAccount(id: string, patch: Partial<Pick<Account, 'name' | 'email'>>): Account | null {
  const accounts = listAccounts();
  const idx = accounts.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  if (patch.email && accounts.some((a) => a.id !== id && a.email === normEmail(patch.email!))) {
    throw new AuthError('Alt cont de pe dispozitivul ăsta folosește deja emailul acesta.', 'email');
  }
  const next = { ...accounts[idx], ...patch, ...(patch.email ? { email: normEmail(patch.email) } : {}) };
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
