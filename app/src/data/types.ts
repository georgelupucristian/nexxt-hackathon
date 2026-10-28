// Money is stored as integer bani (1 leu = 100 bani) so arithmetic never drifts.
export type Bani = number;

export type GoalKind = 'emergency' | 'tech' | 'travel' | 'custom';
export type Frequency = 'weekly' | 'monthly' | 'flexible';
export type GoalStatus = 'active' | 'paused' | 'archived';

export interface Plan {
  amount: Bani; // planned contribution per period; 0 for flexible plans without a set amount
  frequency: Frequency;
  // weekly: 0-6 (Mon-Sun). monthly: 1-28 (day of month). flexible: null.
  day: number | null;
}

export interface Goal {
  id: string;
  kind: GoalKind;
  name: string;
  target: Bani;
  targetDate: string | null; // YYYY-MM-DD
  motivation: string;
  plan: Plan;
  status: GoalStatus;
  createdAt: string; // ISO
  isPrimary: boolean;
}

export type TxType = 'contribution' | 'withdrawal';
export type TxStatus = 'confirmed' | 'pending' | 'failed';
// manual: the user typed it in. demo: produced by the simulated connection, never real money.
export type TxSource = 'manual' | 'demo';

export interface Transaction {
  id: string;
  type: TxType;
  amount: Bani; // always positive; type carries the sign
  goalId: string | null; // null = unallocated savings
  date: string; // YYYY-MM-DD the money moved
  note: string;
  status: TxStatus;
  source: TxSource;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

export type TrackingMethod = 'manual' | 'demo';
export type ConnectionStatus = 'none' | 'connected' | 'syncing' | 'error';

export interface Connection {
  status: ConnectionStatus;
  institution: string | null;
  lastSyncAt: string | null; // ISO
  lastError: string | null;
  // Settings toggle so the failure path can be demonstrated on purpose.
  simulateFailure: boolean;
}

export interface Reminder {
  enabled: boolean;
  day: number; // 0-6, Mon-Sun
  time: string; // HH:MM
}

// A "savings action" is what fills a streak day. Opening the app never creates one.
export type ActionKind = 'contribution' | 'check-in';
export interface StreakAction {
  date: string; // YYYY-MM-DD
  kind: ActionKind;
  at: string; // ISO
}

export interface Preferences {
  largerText: boolean;
  reduceMotion: boolean;
  hideBalance: boolean;
}

export interface OnboardingDraft {
  kind: GoalKind | null;
  name: string;
  target: string; // raw input in lei so half-typed values survive a reload
  targetDate: string;
  motivation: string;
  planAmount: string;
  frequency: Frequency;
  day: number | null;
  tracking: TrackingMethod | null;
  reminder: Reminder;
}

export interface OnboardingState {
  completed: boolean;
  step: number; // 0..4
  draft: OnboardingDraft;
}

export interface UserData {
  version: 1;
  onboarding: OnboardingState;
  goals: Goal[];
  transactions: Transaction[];
  tracking: TrackingMethod;
  connection: Connection;
  reminder: Reminder;
  actions: StreakAction[];
  pausedDays: string[]; // YYYY-MM-DD days the user marked as a break
  prefs: Preferences;
}

export interface Account {
  id: string;
  name: string;
  email: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
  isDemo: boolean;
}
