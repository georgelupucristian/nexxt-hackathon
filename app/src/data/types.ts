// Money is stored as integer bani (1 leu = 100 bani) so arithmetic never drifts.
export type Bani = number;

export type GoalKind = 'emergency' | 'tech' | 'travel' | 'custom';
export type Frequency = 'weekly' | 'monthly' | 'flexible';
export type GoalStatus = 'active' | 'paused' | 'archived';
/** keys of GOAL_PALETTE in lib/goalLook.ts */
export type GoalColour = 'cer' | 'menta' | 'coral' | 'soare' | 'liliac' | 'trandafir';

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
  /** key from GOAL_ICONS (lib/goalIcons.tsx); missing on older goals, which use their kind's default */
  icon?: string;
  /** colour chosen when the goal was made (the new-goal presets set one); missing on older goals */
  colour?: GoalColour;
}

export type TxType = 'contribution' | 'withdrawal';
export type TxStatus = 'confirmed' | 'pending' | 'failed';
// manual: the user typed it in. demo: produced by the simulated connection, never real money.
// stripe: a payment (or withdrawal) the backend recorded; Stripe test mode, so test money.
// start: what a cloud account said it already had saved at sign-up; counts toward the goal, moved
// no money, so nothing can be withdrawn from it at Stripe.
export type TxSource = 'manual' | 'demo' | 'stripe' | 'start';

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

// stripe: a Supabase account whose money moves through Stripe (test mode) via the backend.
export type TrackingMethod = 'manual' | 'demo' | 'stripe';
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

// Answers from sign-up that aren't a goal. Skipped steps stay unset so Home can offer them again.
// A cloud account keeps them in profiles.onboarding_state.kip.setup (the only profile field the app
// may write besides the name and the money plan).
export type NotifChoice = 'granted' | 'denied' | 'later' | 'unset';
export interface SetupState {
  age: string | null; // age bracket picked on the first question
  reasons: string[]; // why they're saving
  dailyGoal: Bani | null; // the daily amount picked in "Let's make some routines"
  payday: number | null; // the day of the month the plan collects
  incomeSources: string[];
  incomeMonthly: Bani | null;
  incomeSkipped: boolean;
  notifications: NotifChoice;
  /** this device opens Kip with Face ID / fingerprint (a local convenience, not account security) */
  faceId: boolean;
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
  /** days frozen by hand with the old "Freeze today"; still read, no longer written */
  pausedDays: string[];
  prefs: Preferences;
  setup: SetupState;
  // Filled in by the store from the social layer (lib/social), never saved with the account:
  /** days a freeze covered: a 1-day Freeze, a friend's freeze that worked, a running 1-week Freeze */
  freezeDays?: string[];
  /** a missed day still inside its 24 hours of danger: the streak waits for it */
  streakHold?: string | null;
}

// No passwords: an account is a phone number proven by a one-time code.
export type AuthProvider = 'phone';

export interface Account {
  id: string;
  name: string;
  /** a cloud account's login address; phone accounts have a stand-in one, never shown */
  email: string;
  /** +40 7xx xxx xxx, E.164 ("+40712345678") */
  phone: string;
  provider: AuthProvider | 'demo';
  createdAt: string;
  isDemo: boolean;
  /** A Supabase Auth account: data lives in the database, money moves through Stripe. */
  remote?: boolean;
}
