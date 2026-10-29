// Friends, colonies, freezes and shared goals. Everything here is plain data: rules.ts holds the
// logic (pure functions), repo.ts keeps it: MockSocialRepo (the offline demo, in localStorage) or
// SupabaseSocialRepo (signed-in accounts, docs/social-schema.md). Money in the demo is simulated, in bani.
import type { Bani } from '../../data/types';

export type UserId = string;
/** "+40722123456": every number is stored in E.164, the backend's auth-phone format */
export type E164 = string;
/** local calendar day, YYYY-MM-DD */
export type DayKey = string;
/** an instant, ISO 8601 */
export type Iso = string;

/** Soft avatar colours, from the goal palette so friends look like they belong in Kip. */
export type AvatarHue = 'cer' | 'menta' | 'coral' | 'soare' | 'liliac' | 'trandafir';

export interface SocialUser {
  id: UserId;
  /** full name; lists show it whole, sentences use the first name */
  name: string;
  /** only for Romanian grammar ("freeze-ul lui / ei", "Ai salvat-o pe Ana"); unknown for real accounts */
  gender: 'f' | 'm' | null;
  phone: E164;
  /** "Friends can find me by my number". Off: no contact match ever returns this person. */
  discoverable: boolean;
  /** "Show my progress": colony mates see the personal goal's progress, in %. Off by default. */
  showProgress: boolean;
  /** personal goal progress, 0..1 (only ever shown as a percentage, and only if showProgress) */
  goalProgress: number;
  hue: AvatarHue;
  joinedAt: Iso;
  /** the personal invite code in their link (kip.ro/start?invite=…) */
  inviteCode: string;
  /** who invited them with a link, if anyone */
  invitedBy: UserId | null;
}

/** One time money was put aside. A day counts for the streak when it has at least one. */
export interface SaveEvent {
  day: DayKey;
  at: Iso;
}

// ---------- friends ----------

export type RequestStatus = 'pending' | 'accepted' | 'declined' | 'cancelled';

export interface FriendRequest {
  id: string;
  from: UserId;
  to: UserId;
  at: Iso;
  status: RequestStatus;
}

export interface Friendship {
  a: UserId;
  b: UserId;
  since: Iso;
}

export interface Block {
  by: UserId;
  who: UserId;
  at: Iso;
}

/** The part of the world the friend rules need. */
export interface FriendGraph {
  requests: FriendRequest[];
  friendships: Friendship[];
  blocks: Block[];
}

export type FriendSort = 'recent' | 'name' | 'streak';

/** What a friend's row shows. Never an amount of money. */
export interface FriendRowData {
  id: UserId;
  name: string;
  streak: number;
  savedToday: boolean;
  /** missed a day, has no 1-day Freeze, inside the 24 hours a friend can still help */
  inDanger: boolean;
  /** a freeze covers today (a running 1-week Freeze, or a rescue waiting for its saving) */
  freezeActive: boolean;
  /** has a 1-day Freeze ready, so people in danger know whom to ask */
  hasDayFreeze: boolean;
  lastActive: Iso;
}

// ---------- freezes ----------

export type FrozenBy = 'day' | 'week' | 'gift';

export interface FrozenDay {
  day: DayKey;
  by: FrozenBy;
}

export interface FreezeState {
  /** the 1-day Freeze: 0 or 1, never more */
  day: 0 | 1;
  /** when the used or given 1-day Freeze comes back: 7 days after it went (rolling) */
  dayRechargeAt: Iso | null;
  /** the 1-week Freeze in the inventory: 0 or 1 */
  week: 0 | 1;
  /** the highest multiple of 45 already rewarded in the current run */
  weekMilestone: number;
  /** first day of a running 1-week Freeze; it covers exactly 7 days from there */
  weekFrom: DayKey | null;
  /** days a 1-day Freeze or a friend's freeze covered */
  frozen: FrozenDay[];
  /** missed days up to here have been looked at by the end-of-day rule */
  settledThrough: DayKey;
}

/** A missed day with no freeze: 24 hours in which a friend can help. */
export interface Danger {
  id: string;
  user: UserId;
  /** the day that was missed */
  day: DayKey;
  /** the end of the 24 hours (the end of the day after the missed one) */
  until: Iso;
  status: 'open' | 'rescued' | 'lapsed';
}

/** "Can you spare a freeze?": one tap, the friends picked, no reason asked. */
export interface FreezeAsk {
  id: string;
  from: UserId;
  to: UserId[];
  day: DayKey;
  at: Iso;
  status: 'open' | 'closed';
}

/** A friend's own 1-day Freeze, given to someone in danger. */
export interface FreezeGift {
  id: string;
  from: UserId;
  to: UserId;
  /** the missed day it covers once it works */
  day: DayKey;
  givenAt: Iso;
  /** pending: works only if the rescued person saves within 24 hours. returned: went back to the giver. */
  status: 'pending' | 'active' | 'returned';
  resolvedAt: Iso | null;
}

// ---------- colonies ----------

export interface ColonyMember {
  user: UserId;
  /** days before this one never needed this member for the colony's streak */
  joinedOn: DayKey;
}

/** P1.2: one shared challenge a week; everyone ticks it off for themselves. */
export interface ColonyChallenge {
  /** the Monday it belongs to */
  week: DayKey;
  title: string;
  done: UserId[];
  reward: string;
}

export interface Colony {
  id: string;
  name: string;
  createdBy: UserId;
  createdAt: Iso;
  members: ColonyMember[];
  /** the code in /colonies/invite/:cod */
  code: string;
  challenge: ColonyChallenge | null;
}

export interface ColonyInvite {
  id: string;
  colony: string;
  from: UserId;
  to: UserId;
  at: Iso;
  status: 'pending' | 'accepted' | 'declined';
}

// ---------- shared goals ----------

export interface SharedParticipant {
  user: UserId;
  /** the planned part of the target; equal split by default */
  share: Bani;
}

/**
 * Money never moves between people. Each contribution stays in its owner's own sub-pocket linked to
 * the goal; the goal's progress is their sum, and only the owner can take theirs back.
 */
export interface Contribution {
  id: string;
  user: UserId;
  /** positive in, negative out; always the owner's own money */
  amount: Bani;
  at: Iso;
  kind: 'deposit' | 'withdrawal' | 'returned';
}

export interface SharedGoal {
  id: string;
  colony: string;
  name: string;
  /** a small picture (a data URL from the device, or a path under /public) */
  photo: string | null;
  /** GOAL_ICONS key, for the tile when there's no photo */
  icon: string;
  target: Bani;
  date: DayKey;
  createdBy: UserId;
  createdAt: Iso;
  participants: SharedParticipant[];
  contributions: Contribution[];
  /** 25 / 50 / 75 / 100: celebrated already, so a milestone plays once */
  milestones: number[];
  /** someone left: the others choose to lower the target or split it again */
  rebalance: boolean;
  /** friends invited who haven't answered yet (Join / No thanks) */
  invited?: { user: UserId; by: UserId | null }[];
  /** live backend: the server's percentages; the others' amounts never reach this device */
  live?: { totalPct: number; memberPct: Record<UserId, number> };
}

// ---------- the rest ----------

export type CheerKind = 'bravo' | 'poti' | 'aici';

export interface Cheer {
  id: string;
  from: UserId;
  to: UserId;
  kind: CheerKind;
  at: Iso;
}

export interface Notice {
  id: string;
  to: UserId;
  at: Iso;
  text: string;
  /** where tapping it goes */
  link: string | null;
  read: boolean;
}

export interface SocialWorld {
  version: 1;
  /** the account this world belongs to */
  me: UserId;
  seededOn: DayKey;
  users: Record<UserId, SocialUser>;
  saves: Record<UserId, SaveEvent[]>;
  freezes: Record<UserId, FreezeState>;
  dangers: Danger[];
  asks: FreezeAsk[];
  gifts: FreezeGift[];
  requests: FriendRequest[];
  friendships: Friendship[];
  blocks: Block[];
  colonies: Colony[];
  colonyInvites: ColonyInvite[];
  sharedGoals: SharedGoal[];
  /** simulated personal pockets: where a shared goal's money goes back to */
  pockets: Record<UserId, Bani>;
  cheers: Cheer[];
  notices: Notice[];
  /** P1.1: each user's trusted friend ("martor") */
  witness: Record<UserId, UserId>;
  /** the contacts screen was answered (granted or "Later"), so it isn't pushed again */
  contactsAsked: boolean;
  /** simulated people who keep saving every day after the seed */
  steady: UserId[];
  /** one-off moments (rescued, milestone) already played, by key */
  seen: Record<string, true>;
  /** my days frozen by hand with the old "Freeze today", still read so old streaks hold */
  legacyPaused: DayKey[];
}
