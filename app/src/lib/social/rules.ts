// Every rule of the social layer as a pure function: friend requests, the friends list, freezes and
// rescues, colonies, shared goals, cheers, invite freezes. No React, no storage, no clock: callers
// pass `now` / `today`, so each rule can be tested on its own (rules.test.ts). repo.ts strings
// these together; the screens only ever ask repo.ts.
import { parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js';
import { addDays, fromKey, toKey } from '../dates';
import type { Bani } from '../../data/types';
import { formatLei } from '../money';
import type {
  Block,
  Cheer,
  CheerKind,
  Colony,
  ColonyMember,
  Contribution,
  Danger,
  DayKey,
  E164,
  FreezeGift,
  FreezeState,
  FriendGraph,
  FriendRowData,
  FriendSort,
  Friendship,
  Iso,
  SaveEvent,
  SharedGoal,
  SocialUser,
  UserId,
} from './types';

/** A rule said no. `message` is final English copy, ready for a toast or a field error. */
export class RuleError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------- time ----------

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** local midnight at the start of a day */
export const dayStart = (day: DayKey): Date => fromKey(day);
/** local midnight at the end of a day (the start of the next one) */
export const dayEnd = (day: DayKey): Date => fromKey(addDays(day, 1));
export const dayOf = (at: Iso | Date): DayKey => toKey(typeof at === 'string' ? new Date(at) : at);
const later = (at: Iso | Date, ms: number) => new Date(new Date(at).getTime() + ms);

// ---------- phone numbers ----------

/**
 * Any way a number gets typed or stored in an address book, as E.164: "0722 123 456",
 * "+40722123456" and "0040 722 123 456" are all "+40722123456", the format auth-phone uses.
 * Numbers that aren't valid phone numbers give null.
 */
export function normalizePhone(raw: string, country: CountryCode = 'RO'): E164 | null {
  if (!raw || !raw.trim()) return null;
  const p = parsePhoneNumberFromString(raw.trim(), country);
  return p && p.isValid() ? (p.number as E164) : null;
}

/**
 * Contact matching. Only phone numbers come in (never names) and only the ids of people who can be
 * found go out: a number without an account, or of someone who turned discoverability off, or who
 * blocked you (or you them), leaves no trace. Nothing here is stored.
 */
export function matchContacts(phones: readonly string[], users: readonly SocialUser[], viewer: UserId, blocks: readonly Block[]): UserId[] {
  const findable = new Map(users.filter((u) => u.discoverable && u.id !== viewer && !isBlocked(blocks, viewer, u.id)).map((u) => [u.phone, u.id]));
  const out = new Set<UserId>();
  for (const raw of phones) {
    const n = normalizePhone(raw);
    const id = n ? findable.get(n) : undefined;
    if (id) out.add(id);
  }
  return [...out];
}

// ---------- friends ----------

/** Anti-spam only: requests sent per day. It never caps how many friends someone has. */
export const MAX_REQUESTS_PER_DAY = 50;

const isPair = (f: Friendship, a: UserId, b: UserId) => (f.a === a && f.b === b) || (f.a === b && f.b === a);
export const areFriends = (g: Pick<FriendGraph, 'friendships'>, a: UserId, b: UserId) => g.friendships.some((f) => isPair(f, a, b));
export const friendsOf = (g: Pick<FriendGraph, 'friendships'>, u: UserId): UserId[] => g.friendships.flatMap((f) => (f.a === u ? [f.b] : f.b === u ? [f.a] : []));
/** Either way round: a block hides both people from each other. */
export const isBlocked = (blocks: readonly Block[], a: UserId, b: UserId) => blocks.some((x) => (x.by === a && x.who === b) || (x.by === b && x.who === a));
export const requestsSentOn = (g: Pick<FriendGraph, 'requests'>, from: UserId, day: DayKey) => g.requests.filter((r) => r.from === from && dayOf(r.at) === day).length;

export type FriendError = 'self' | 'blocked' | 'already-friends' | 'already-requested' | 'daily-limit';
export const FRIEND_ERRORS: Record<FriendError, string> = {
  self: "That's your own number.",
  blocked: "You can't send a request to this person.",
  'already-friends': "You're already friends.",
  'already-requested': "You've already sent them a request. Give them time to accept.",
  'daily-limit': `You've sent ${MAX_REQUESTS_PER_DAY} requests today. You can send more tomorrow.`,
};

export function checkFriendRequest(g: FriendGraph, from: UserId, to: UserId, now: Date): FriendError | null {
  if (from === to) return 'self';
  if (isBlocked(g.blocks, from, to)) return 'blocked';
  if (areFriends(g, from, to)) return 'already-friends';
  if (g.requests.some((r) => r.status === 'pending' && r.from === from && r.to === to)) return 'already-requested';
  // answering someone who already asked you isn't a new request, so the daily limit doesn't apply
  if (g.requests.some((r) => r.status === 'pending' && r.from === to && r.to === from)) return null;
  if (requestsSentOn(g, from, dayOf(now)) >= MAX_REQUESTS_PER_DAY) return 'daily-limit';
  return null;
}

/**
 * "Add friend" sends a request; the friendship exists only once the other person accepts. The one
 * exception is when they already asked you: both have said yes, so you're friends straight away.
 */
export function sendFriendRequest(g: FriendGraph, from: UserId, to: UserId, now: Date, id: string): { graph: FriendGraph; outcome: 'requested' | 'friends' } {
  const err = checkFriendRequest(g, from, to, now);
  if (err) throw new RuleError(err, FRIEND_ERRORS[err]);
  const theirs = g.requests.find((r) => r.status === 'pending' && r.from === to && r.to === from);
  if (theirs) return { graph: acceptFriendRequest(g, theirs.id, from, now), outcome: 'friends' };
  return { graph: { ...g, requests: [...g.requests, { id, from, to, at: now.toISOString(), status: 'pending' }] }, outcome: 'requested' };
}

export function acceptFriendRequest(g: FriendGraph, requestId: string, by: UserId, now: Date): FriendGraph {
  const r = g.requests.find((x) => x.id === requestId);
  if (!r || r.status !== 'pending') throw new RuleError('gone', 'This request is no longer valid.');
  if (r.to !== by) throw new RuleError('not-yours', 'Only the person who got the request can accept it.');
  if (isBlocked(g.blocks, r.from, r.to)) throw new RuleError('blocked', FRIEND_ERRORS.blocked);
  return {
    ...g,
    requests: g.requests.map((x) => (x.id === requestId ? { ...x, status: 'accepted' as const } : x)),
    friendships: areFriends(g, r.from, r.to) ? g.friendships : [...g.friendships, { a: r.from, b: r.to, since: now.toISOString() }],
  };
}

export function declineFriendRequest(g: FriendGraph, requestId: string, by: UserId): FriendGraph {
  const r = g.requests.find((x) => x.id === requestId);
  if (!r || r.status !== 'pending') return g;
  if (r.to !== by) throw new RuleError('not-yours', 'Only the person who got the request can decline it.');
  return { ...g, requests: g.requests.map((x) => (x.id === requestId ? { ...x, status: 'declined' as const } : x)) };
}

export function cancelFriendRequest(g: FriendGraph, requestId: string, by: UserId): FriendGraph {
  const r = g.requests.find((x) => x.id === requestId);
  if (!r || r.status !== 'pending') return g;
  if (r.from !== by) throw new RuleError('not-yours', 'Only the person who sent the request can cancel it.');
  return { ...g, requests: g.requests.map((x) => (x.id === requestId ? { ...x, status: 'cancelled' as const } : x)) };
}

export function removeFriend(g: FriendGraph, a: UserId, b: UserId): FriendGraph {
  return { ...g, friendships: g.friendships.filter((f) => !isPair(f, a, b)) };
}

/** Block: no friendship, no pending requests either way, and neither can find the other again. */
export function blockUser(g: FriendGraph, by: UserId, who: UserId, now: Date): FriendGraph {
  if (by === who) return g;
  const between = (r: FriendGraph['requests'][number]) => (r.from === by && r.to === who) || (r.from === who && r.to === by);
  return {
    friendships: g.friendships.filter((f) => !isPair(f, by, who)),
    requests: g.requests.map((r) => (r.status === 'pending' && between(r) ? { ...r, status: r.from === by ? ('cancelled' as const) : ('declined' as const) } : r)),
    blocks: g.blocks.some((x) => x.by === by && x.who === who) ? g.blocks : [...g.blocks, { by, who, at: now.toISOString() }],
  };
}

export function unblockUser(g: FriendGraph, by: UserId, who: UserId): FriendGraph {
  return { ...g, blocks: g.blocks.filter((x) => !(x.by === by && x.who === who)) };
}

// ---------- the friends list ----------

/** Lower case without diacritics, so "stefan" finds "Ștefan". */
export const foldName = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('ro-RO');

export function searchFriendRows<T extends Pick<FriendRowData, 'name'>>(rows: readonly T[], query: string): T[] {
  const q = foldName(query.trim());
  if (!q) return [...rows];
  return rows.filter((r) => foldName(r.name).includes(q));
}

const byName = (a: Pick<FriendRowData, 'name'>, b: Pick<FriendRowData, 'name'>) => a.name.localeCompare(b.name, 'ro-RO');
const ORDER: Record<FriendSort, (a: FriendRowData, b: FriendRowData) => number> = {
  recent: (a, b) => b.lastActive.localeCompare(a.lastActive) || byName(a, b),
  name: byName,
  streak: (a, b) => b.streak - a.streak || byName(a, b),
};

/** Friends in danger always come first (they need help today); the chosen order applies within each group. */
export function sortFriendRows(rows: readonly FriendRowData[], sort: FriendSort): FriendRowData[] {
  return [...rows].sort((a, b) => Number(b.inDanger) - Number(a.inDanger) || ORDER[sort](a, b));
}

// ---------- streaks ----------

export const savedDaySet = (saves: readonly SaveEvent[] | undefined): Set<DayKey> => new Set((saves ?? []).map((s) => s.day));

/** The 7 days a 1-week Freeze covers, starting the day it was switched on. */
export function weekCoverage(from: DayKey | null): DayKey[] {
  return from ? Array.from({ length: WEEK_FREEZE_DAYS }, (_, i) => addDays(from, i)) : [];
}

/** Every day a freeze covers: used 1-day Freezes, friends' freezes that worked, a running 1-week Freeze. */
export function frozenDaySet(f: FreezeState | undefined, extra: Iterable<DayKey> = []): Set<DayKey> {
  const out = new Set<DayKey>(extra);
  if (!f) return out;
  for (const d of f.frozen) out.add(d.day);
  for (const d of weekCoverage(f.weekFrom)) out.add(d);
  return out;
}

/**
 * Days in a row with money put aside, walking back from today. A frozen day neither adds to the
 * count nor breaks it; today without a saving yet doesn't break it either (the day isn't over).
 * `hold` is a missed day still inside its 24 hours of danger: the run waits for it.
 */
export function streakOf(saved: Set<DayKey>, frozen: Set<DayKey>, today: DayKey, hold: DayKey | null = null): number {
  let n = 0;
  let day = saved.has(today) ? today : addDays(today, -1);
  for (let i = 0; i < 400; i++) {
    if (saved.has(day)) n++;
    else if (!frozen.has(day) && day !== hold) break;
    day = addDays(day, -1);
  }
  return n;
}

/** The run as it stood at the end of `day` (a finished day: not saving on it means no run). */
export function runThrough(saved: Set<DayKey>, frozen: Set<DayKey>, day: DayKey): number {
  let n = 0;
  let d = day;
  for (let i = 0; i < 400; i++) {
    if (saved.has(d)) n++;
    else if (!frozen.has(d)) break;
    d = addDays(d, -1);
  }
  return n;
}

// ---------- freezes ----------

export const RECHARGE_DAYS = 7;
export const WEEK_FREEZE_EVERY = 45;
export const WEEK_FREEZE_DAYS = 7;
export const RESCUE_HOURS = 24;
export const MAX_RESCUES = 2;
export const RESCUE_WINDOW_DAYS = 30;

/** A new account starts with its 1-day Freeze; missed days before today were never its business. */
export function freshFreezes(today: DayKey): FreezeState {
  return { day: 1, dayRechargeAt: null, week: 0, weekMilestone: 0, weekFrom: null, frozen: [], settledThrough: addDays(today, -1) };
}

/** Back exactly 7 days after it went, not a moment earlier. Never more than one. */
export function rechargeDayFreeze(f: FreezeState, now: Date): FreezeState {
  if (f.day === 0 && f.dayRechargeAt && new Date(f.dayRechargeAt).getTime() <= now.getTime()) return { ...f, day: 1, dayRechargeAt: null };
  return f;
}

/** Spends the 1-day Freeze (on a missed day, or as a gift); its 7-day recharge starts at `at`. */
export function spendDayFreeze(f: FreezeState, at: Date): FreezeState {
  if (f.day !== 1) throw new RuleError('no-freeze', "You don't have a 1-day Freeze right now.");
  return { ...f, day: 0, dayRechargeAt: later(at, RECHARGE_DAYS * DAY_MS).toISOString() };
}

/** A gift that didn't work comes back: the freeze is there again and its recharge is cancelled. */
export function returnDayFreeze(f: FreezeState): FreezeState {
  return { ...f, day: 1, dayRechargeAt: null };
}

/** Whole days until the 1-day Freeze is back, or null when it's here. */
export function rechargeInDays(f: FreezeState, now: Date): number | null {
  if (f.day === 1 || !f.dayRechargeAt) return null;
  return Math.max(0, Math.ceil((new Date(f.dayRechargeAt).getTime() - now.getTime()) / DAY_MS));
}

/**
 * The end-of-day rule, for every day from the last one looked at up to yesterday: a day without a
 * saving and without a freeze uses the 1-day Freeze automatically (if there's a run to protect and
 * the freeze is back by then). Without one, the day goes into danger for 24 hours.
 */
export function settleMissedDays(f: FreezeState, saved: Set<DayKey>, today: DayKey, extraFrozen: Iterable<DayKey> = []): { freezes: FreezeState; missed: DayKey[]; used: DayKey[] } {
  const extra = [...extraFrozen];
  const yesterday = addDays(today, -1);
  let cur = f;
  const missed: DayKey[] = [];
  const used: DayKey[] = [];
  // a long time away: only the last few weeks can still matter for a run
  let d = addDays(f.settledThrough, 1);
  if (d < addDays(today, -60)) d = addDays(today, -60);
  for (; d <= yesterday; d = addDays(d, 1)) {
    cur = rechargeDayFreeze(cur, dayEnd(d));
    const frozen = frozenDaySet(cur, extra);
    if (saved.has(d) || frozen.has(d)) continue;
    if (runThrough(saved, frozen, addDays(d, -1)) === 0) continue; // no run to protect
    if (cur.day === 1) {
      cur = spendDayFreeze(cur, dayEnd(d));
      cur = { ...cur, frozen: [...cur.frozen, { day: d, by: 'day' }] };
      used.push(d);
    } else {
      missed.push(d);
    }
  }
  return { freezes: { ...cur, settledThrough: yesterday > cur.settledThrough ? yesterday : cur.settledThrough }, missed, used };
}

/** Earned at 45, 90, 135… days in a row (saved days only, so frozen days never count). At most one. */
export function awardWeekFreeze(f: FreezeState, streak: number): FreezeState {
  const reached = Math.floor(streak / WEEK_FREEZE_EVERY) * WEEK_FREEZE_EVERY;
  // a new run counts from zero again
  const milestone = streak < f.weekMilestone ? reached : f.weekMilestone;
  if (reached > milestone) return { ...f, week: 1, weekMilestone: reached };
  return milestone === f.weekMilestone ? f : { ...f, weekMilestone: milestone };
}

export const daysToNextWeekFreeze = (streak: number) => WEEK_FREEZE_EVERY - (streak % WEEK_FREEZE_EVERY);

export const weekFreezeRunning = (f: FreezeState, today: DayKey) => !!f.weekFrom && today >= f.weekFrom && today <= addDays(f.weekFrom, WEEK_FREEZE_DAYS - 1);

/** One button, no reason asked: covers today and the next 6 days. */
export function activateWeekFreeze(f: FreezeState, today: DayKey): FreezeState {
  if (f.week !== 1) throw new RuleError('no-week-freeze', "You don't have a 1-week Freeze yet.");
  if (weekFreezeRunning(f, today)) throw new RuleError('running', 'Your 1-week Freeze is already on.');
  return { ...f, week: 0, weekFrom: today };
}

/** Only the 1-day Freeze can be given; the 1-week one is a personal reward for consistency. */
export const canGiveFreeze = (kind: 'day' | 'week') => kind === 'day';

// ---------- danger and rescues ----------

/** A missed day is in danger until the end of the day after it: the 24 hours a friend can help. */
export const dangerUntil = (day: DayKey): Iso => dayEnd(addDays(day, 1)).toISOString();

/** The danger someone is in right now, with the friend's freeze waiting for them if one is. */
export function activeDanger(dangers: readonly Danger[], gifts: readonly FreezeGift[], user: UserId, now: Date): { danger: Danger; gift: FreezeGift | null } | null {
  for (const danger of dangers) {
    if (danger.user !== user || danger.status !== 'open') continue;
    const gift = gifts.find((g) => g.to === user && g.day === danger.day && g.status === 'pending') ?? null;
    const open = now.getTime() < new Date(danger.until).getTime();
    const waiting = !!gift && now.getTime() <= new Date(gift.givenAt).getTime() + RESCUE_HOURS * HOUR_MS;
    if (open || waiting) return { danger, gift };
  }
  return null;
}

/** Freezes received from friends in the last 30 days (a pending one counts until it goes back). */
export function rescuesReceived(gifts: readonly FreezeGift[], user: UserId, now: Date): number {
  const since = now.getTime() - RESCUE_WINDOW_DAYS * DAY_MS;
  return gifts.filter((g) => g.to === user && g.status !== 'returned' && new Date(g.givenAt).getTime() > since).length;
}

export type GiveError = 'self' | 'no-freeze' | 'not-in-danger' | 'not-connected' | 'rescue-limit' | 'already-helped';
export const GIVE_ERRORS: Record<GiveError, string> = {
  self: 'Your freeze already protects you.',
  'no-freeze': "You don't have a 1-day Freeze right now.",
  'not-in-danger': "Their streak isn't in danger right now.",
  'not-connected': 'You can only help friends or colony members.',
  'rescue-limit': `They can get help at most ${MAX_RESCUES} times in ${RESCUE_WINDOW_DAYS} days.`,
  'already-helped': 'They already got a freeze. The day is saved once they put money aside.',
};

export function checkGiveFreeze(a: {
  giver: UserId;
  receiver: UserId;
  giverFreezes: FreezeState;
  dangers: readonly Danger[];
  gifts: readonly FreezeGift[];
  connected: boolean;
  now: Date;
}): GiveError | null {
  if (a.giver === a.receiver) return 'self';
  if (!a.connected) return 'not-connected';
  if (rechargeDayFreeze(a.giverFreezes, a.now).day !== 1) return 'no-freeze';
  const danger = activeDanger(a.dangers, a.gifts, a.receiver, a.now);
  if (!danger) return 'not-in-danger';
  if (danger.gift) return 'already-helped';
  if (rescuesReceived(a.gifts, a.receiver, a.now) >= MAX_RESCUES) return 'rescue-limit';
  return null;
}

/** The giver's own 1-day Freeze goes (its 7-day recharge starts now) and waits for the rescued one. */
export function giveFreeze(giverFreezes: FreezeState, gift: Omit<FreezeGift, 'status' | 'resolvedAt'>, now: Date): { giver: FreezeState; gift: FreezeGift } {
  return { giver: spendDayFreeze(rechargeDayFreeze(giverFreezes, now), now), gift: { ...gift, status: 'pending', resolvedAt: null } };
}

/**
 * Help is given, the effort stays theirs: a friend's freeze works only if the rescued person puts
 * money aside within 24 hours of getting it (a saving earlier on the same rescue day counts too).
 * Otherwise it goes back to the giver.
 */
export function resolveGift(gift: FreezeGift, receiverSaves: readonly SaveEvent[], now: Date): FreezeGift['status'] {
  if (gift.status !== 'pending') return gift.status;
  const from = dayStart(addDays(gift.day, 1)).getTime();
  const until = new Date(gift.givenAt).getTime() + RESCUE_HOURS * HOUR_MS;
  if (receiverSaves.some((s) => Date.parse(s.at) >= from && Date.parse(s.at) <= Math.min(until, now.getTime()))) return 'active';
  return now.getTime() > until ? 'returned' : 'pending';
}

// ---------- colonies ----------

export const COLONY_MIN = 2;
export const COLONY_MAX = 5;
export const MAX_COLONIES = 3;

export type ColonyError = 'name' | 'size' | 'not-friends' | 'too-many' | 'full' | 'member';
export const COLONY_ERRORS: Record<ColonyError, string> = {
  name: 'Give your colony a name.',
  size: `A colony has ${COLONY_MIN} to ${COLONY_MAX} members, you included.`,
  'not-friends': 'A colony is only for friends who accepted your request.',
  'too-many': `Someone is already in ${MAX_COLONIES} colonies, the most allowed.`,
  full: `The colony already has ${COLONY_MAX} members.`,
  member: 'Already in the colony.',
};

export const coloniesOf = (colonies: readonly Colony[], user: UserId) => colonies.filter((c) => c.members.some((m) => m.user === user));

export function checkCreateColony(g: FriendGraph, colonies: readonly Colony[], creator: UserId, others: readonly UserId[], name: string): ColonyError | null {
  if (!name.trim()) return 'name';
  const members = [...new Set([creator, ...others])];
  if (members.length < COLONY_MIN || members.length > COLONY_MAX) return 'size';
  if (members.some((m) => m !== creator && !areFriends(g, creator, m))) return 'not-friends';
  if (members.some((m) => coloniesOf(colonies, m).length >= MAX_COLONIES)) return 'too-many';
  return null;
}

/** Joining takes an invite from a member who is your friend, a free seat, and fewer than 3 colonies. */
export function checkJoinColony(g: FriendGraph, colonies: readonly Colony[], colony: Colony, user: UserId, inviter: UserId): ColonyError | null {
  if (colony.members.some((m) => m.user === user)) return 'member';
  if (colony.members.length >= COLONY_MAX) return 'full';
  if (!colony.members.some((m) => m.user === inviter) || !areFriends(g, inviter, user)) return 'not-friends';
  if (coloniesOf(colonies, user).length >= MAX_COLONIES) return 'too-many';
  return null;
}

/** Anyone leaves whenever they like: no questions, nothing to confirm. */
export const leaveColony = (colony: Colony, user: UserId): Colony => ({ ...colony, members: colony.members.filter((m) => m.user !== user) });

export interface MemberDays {
  saved: Set<DayKey>;
  frozen: Set<DayKey>;
  /** a missed day still inside its 24 hours of danger */
  danger: DayKey | null;
}

/**
 * The colony's streak: a day counts only when every member put money aside or was covered by a
 * freeze (a frozen member counts as present). Today unfinished doesn't break it. Yesterday missed by
 * someone still in danger holds the run (atRisk) until they're rescued or the 24 hours pass.
 */
export function colonyStreak(members: readonly ColonyMember[], days: Record<UserId, MemberDays>, today: DayKey): { streak: number; todayComplete: boolean; atRisk: UserId[]; waiting: UserId[] } {
  if (!members.length) return { streak: 0, todayComplete: false, atRisk: [], waiting: [] };
  const present = (m: ColonyMember, d: DayKey) => m.joinedOn > d || !!days[m.user]?.saved.has(d) || !!days[m.user]?.frozen.has(d);
  const start = members.reduce((s, m) => (m.joinedOn < s ? m.joinedOn : s), members[0].joinedOn);
  const waiting = members.filter((m) => !present(m, today)).map((m) => m.user);
  const todayComplete = waiting.length === 0;
  let streak = todayComplete ? 1 : 0;
  let atRisk: UserId[] = [];
  const yesterday = addDays(today, -1);
  for (let d = yesterday, i = 0; d >= start && i < 400; d = addDays(d, -1), i++) {
    const absent = members.filter((m) => !present(m, d));
    if (!absent.length) {
      streak++;
      continue;
    }
    if (d === yesterday && absent.every((m) => days[m.user]?.danger === d)) {
      atRisk = absent.map((m) => m.user);
      continue;
    }
    break;
  }
  return { streak, todayComplete, atRisk, waiting };
}

/** What colony mates see of each other: never an amount; progress only if they chose to show it. */
export interface MemberView {
  id: UserId;
  name: string;
  streak: number;
  savedToday: boolean;
  progressPct: number | null;
}
export function memberView(u: Pick<SocialUser, 'id' | 'name' | 'showProgress' | 'goalProgress'>, streak: number, savedToday: boolean): MemberView {
  return { id: u.id, name: u.name, streak, savedToday, progressPct: u.showProgress ? Math.round(Math.max(0, Math.min(1, u.goalProgress)) * 100) : null };
}

// ---------- shared goals ----------

export const MILESTONES = [25, 50, 75, 100] as const;

/** Equal split, to the ban: what doesn't divide evenly goes to the first participants. */
export function equalShares(target: Bani, n: number): Bani[] {
  if (n <= 0) return [];
  const base = Math.floor(target / n);
  const rest = target - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

export const ownContribution = (goal: SharedGoal, user: UserId): Bani => goal.contributions.filter((c) => c.user === user).reduce((s, c) => s + c.amount, 0);
export const sharedTotal = (goal: SharedGoal): Bani => (goal.live ? Math.round((goal.live.totalPct * goal.target) / 100) : Math.max(0, goal.contributions.reduce((s, c) => s + c.amount, 0)));
export const sharedProgress = (goal: SharedGoal) => (goal.live ? Math.min(1, goal.live.totalPct / 100) : goal.target > 0 ? Math.min(1, sharedTotal(goal) / goal.target) : 0);
/** whole percent, rounded down so 99.6% never reads as done */
export const sharedPct = (goal: SharedGoal) => Math.floor(sharedProgress(goal) * 100);
export const isParticipant = (goal: SharedGoal, user: UserId) => goal.participants.some((p) => p.user === user);

/** Each member's progress toward their own planned share, in %; the others never see the amount. */
export function shareProgressPct(goal: SharedGoal, user: UserId): number {
  if (goal.live && user !== goal.contributions[0]?.user) return goal.live.memberPct[user] ?? 0;
  const share = goal.participants.find((p) => p.user === user)?.share ?? 0;
  return share > 0 ? Math.floor(Math.min(1, Math.max(0, ownContribution(goal, user)) / share) * 100) : 0;
}

const validAmount = (amount: Bani) => {
  if (!Number.isInteger(amount) || amount <= 0) throw new RuleError('amount', 'Enter an amount above 0.');
};

/** Money in: it stays the contributor's own, in a sub-pocket linked to the goal. */
export function contribute(goal: SharedGoal, user: UserId, amount: Bani, at: Date, id: string): SharedGoal {
  if (!isParticipant(goal, user)) throw new RuleError('not-in', 'Join the goal first.');
  validAmount(amount);
  const c: Contribution = { id, user, amount, at: at.toISOString(), kind: 'deposit' };
  return { ...goal, contributions: [...goal.contributions, c] };
}

/** Money out: only ever your own contributions, never someone else's. */
export function withdrawOwn(goal: SharedGoal, user: UserId, amount: Bani, at: Date, id: string): SharedGoal {
  validAmount(amount);
  const own = ownContribution(goal, user);
  if (amount > own) throw new RuleError('not-yours', own > 0 ? `You can only withdraw money you put in: ${formatLei(own)}.` : "You can only withdraw money you put in, and you haven't put any in yet.");
  const c: Contribution = { id, user, amount: -amount, at: at.toISOString(), kind: 'withdrawal' };
  return { ...goal, contributions: [...goal.contributions, c] };
}

/** The milestones a change crossed that haven't been celebrated yet. */
export function milestonesCrossed(beforePct: number, afterPct: number, celebrated: readonly number[]): number[] {
  return MILESTONES.filter((m) => beforePct < m && afterPct >= m && !celebrated.includes(m));
}

/** Leaving: your contributions go back to your personal pocket; the goal keeps everyone else's. */
export function leaveSharedGoal(goal: SharedGoal, user: UserId): { goal: SharedGoal; returned: Bani } {
  const returned = Math.max(0, ownContribution(goal, user));
  return {
    goal: { ...goal, participants: goal.participants.filter((p) => p.user !== user), contributions: goal.contributions.filter((c) => c.user !== user) },
    returned,
  };
}

/** After someone leaves, the others either lower the target… */
export function adjustTarget(goal: SharedGoal, target: Bani): SharedGoal {
  validAmount(target);
  const shares = equalShares(target, goal.participants.length);
  return { ...goal, target, participants: goal.participants.map((p, i) => ({ ...p, share: shares[i] })) };
}

/** …or keep it and split it again between who's left. */
export function redistributeShares(goal: SharedGoal): SharedGoal {
  const shares = equalShares(goal.target, goal.participants.length);
  return { ...goal, participants: goal.participants.map((p, i) => ({ ...p, share: shares[i] })) };
}

/** Opting in re-splits the target equally (shares can be changed afterwards). */
export function joinSharedGoal(goal: SharedGoal, user: UserId): SharedGoal {
  if (isParticipant(goal, user)) return goal;
  return redistributeShares({ ...goal, participants: [...goal.participants, { user, share: 0 }], invited: goal.invited?.filter((i) => i.user !== user) });
}

/** A custom share for one person; the rest of the target is split equally between the others. */
export function setShare(goal: SharedGoal, user: UserId, share: Bani): SharedGoal {
  validAmount(share);
  if (share > goal.target) throw new RuleError('share', "Your share can't be bigger than the target.");
  const others = goal.participants.filter((p) => p.user !== user);
  const rest = equalShares(goal.target - share, others.length);
  return { ...goal, participants: goal.participants.map((p) => (p.user === user ? { ...p, share } : { ...p, share: rest[others.findIndex((o) => o.user === p.user)] })) };
}

/** What the others hear when someone takes their part out: neutral, no names, no blame. */
export const progressNotice = (goal: SharedGoal) => `The goal «${goal.name}» reached ${sharedPct(goal)}%.`;

// ---------- cheers ----------

export const CHEERS: { kind: CheerKind; text: string }[] = [
  { kind: 'bravo', text: 'Well done!' },
  { kind: 'poti', text: "You've got this!" },
  { kind: 'aici', text: "I'm here if you need me" },
];
export const MAX_CHEERS_PER_DAY = 3;
export const cheersSentToday = (cheers: readonly Cheer[], from: UserId, to: UserId, today: DayKey) => cheers.filter((c) => c.from === from && c.to === to && dayOf(c.at) === today).length;
export const canCheer = (cheers: readonly Cheer[], from: UserId, to: UserId, today: DayKey) => from !== to && cheersSentToday(cheers, from, to, today) < MAX_CHEERS_PER_DAY;

// ---------- invites ----------

/**
 * Signing up through someone's link: the inviter's 1-day Freeze recharges right away (or they get
 * one), and the new person starts with theirs. A streak only ever grows from saving, so no days
 * are added to anyone's run.
 */
export function inviteFreezes(inviter: FreezeState, invitee: FreezeState): { inviter: FreezeState; invitee: FreezeState } {
  return {
    inviter: { ...inviter, day: 1, dayRechargeAt: null },
    invitee: { ...invitee, day: 1, dayRechargeAt: null },
  };
}

// ---------- words ----------

export const firstNameOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** "Mihai gave you his freeze" (the rescued person's message). */
export function rescuedLine(giver: Pick<SocialUser, 'name' | 'gender'>): string {
  const his = giver.gender === 'f' ? 'her' : giver.gender === 'm' ? 'his' : 'their';
  return `${firstNameOf(giver.name)} gave you ${his} freeze`;
}

/** "You saved Ana!" (the giver's message). */
export function saverLine(rescued: Pick<SocialUser, 'name' | 'gender'>): string {
  const n = firstNameOf(rescued.name);
  return `You saved ${n}!`;
}
