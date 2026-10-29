// Read models: what each screen shows, computed from the world with the rules. Pure functions of
// (world, viewer, now); the screens call these through useSocial() and never reach into the world.
import { addDays, toKey } from '../dates';
import {
  activeDanger,
  areFriends,
  colonyStreak,
  coloniesOf,
  frozenDaySet,
  friendsOf,
  memberView,
  rechargeDayFreeze,
  rechargeInDays,
  savedDaySet,
  sortFriendRows,
  streakOf,
  weekFreezeRunning,
  type MemberDays,
  type MemberView,
} from './rules';
import type { Colony, Danger, DayKey, FreezeAsk, FreezeGift, FreezeState, FriendGraph, FriendRequest, FriendRowData, FriendSort, Iso, SharedGoal, SocialUser, SocialWorld, UserId } from './types';

export const graphOf = (w: SocialWorld): FriendGraph => ({ requests: w.requests, friendships: w.friendships, blocks: w.blocks });
/** Whose eyes the screens use: always the account's own. */
export const viewerOf = (w: SocialWorld): UserId => w.me;

export interface Status {
  user: SocialUser;
  saved: Set<DayKey>;
  frozen: Set<DayKey>;
  /** days in a row, held through a day still in danger */
  streak: number;
  savedToday: boolean;
  danger: { danger: Danger; gift: FreezeGift | null } | null;
  freezes: FreezeState;
  hasDayFreeze: boolean;
  /** a freeze covers today: a running 1-week Freeze, or a friend's freeze waiting for a saving */
  freezeActive: boolean;
  rechargeIn: number | null;
  lastActive: Iso;
}

export function statusOf(w: SocialWorld, id: UserId, now: Date): Status {
  const today = toKey(now);
  const user = w.users[id];
  const list = w.saves[id] ?? [];
  const saved = savedDaySet(list);
  const freezes = rechargeDayFreeze(w.freezes[id] ?? { day: 1, dayRechargeAt: null, week: 0, weekMilestone: 0, weekFrom: null, frozen: [], settledThrough: addDays(today, -1) }, now);
  const frozen = frozenDaySet(freezes, id === w.me ? w.legacyPaused : []);
  const danger = activeDanger(w.dangers, w.gifts, id, now);
  const hold = danger ? danger.danger.day : null;
  const lastSave = list.reduce<string>((m, s) => (s.at > m ? s.at : m), '');
  return {
    user,
    saved,
    frozen,
    streak: streakOf(saved, frozen, today, hold),
    savedToday: saved.has(today),
    danger,
    freezes,
    hasDayFreeze: freezes.day === 1,
    freezeActive: weekFreezeRunning(freezes, today) || !!danger?.gift,
    rechargeIn: rechargeInDays(freezes, now),
    lastActive: lastSave || user?.joinedAt || '',
  };
}

export const connected = (w: SocialWorld, a: UserId, b: UserId) => areFriends(w, a, b) || w.colonies.some((c) => c.members.some((m) => m.user === a) && c.members.some((m) => m.user === b));

export function rowOf(w: SocialWorld, id: UserId, now: Date): FriendRowData {
  const s = statusOf(w, id, now);
  return { id, name: s.user.name, streak: s.streak, savedToday: s.savedToday, inDanger: !!s.danger && !s.danger.gift, freezeActive: s.freezeActive, hasDayFreeze: s.hasDayFreeze, lastActive: s.lastActive };
}

export function friendRows(w: SocialWorld, viewer: UserId, now: Date, sort: FriendSort = 'recent'): FriendRowData[] {
  return sortFriendRows(
    friendsOf(w, viewer)
      .filter((id) => w.users[id])
      .map((id) => rowOf(w, id, now)),
    sort,
  );
}

export const incomingRequests = (w: SocialWorld, viewer: UserId): FriendRequest[] => w.requests.filter((r) => r.status === 'pending' && r.to === viewer && w.users[r.from]);
export const outgoingRequests = (w: SocialWorld, viewer: UserId): FriendRequest[] => w.requests.filter((r) => r.status === 'pending' && r.from === viewer && w.users[r.to]);

/** "Can you spare a freeze?" asks still worth answering: the asker is in danger and nobody helped yet. */
export function asksFor(w: SocialWorld, viewer: UserId, now: Date): FreezeAsk[] {
  return w.asks.filter((a) => {
    if (a.status !== 'open' || !a.to.includes(viewer) || !w.users[a.from]) return false;
    const d = activeDanger(w.dangers, w.gifts, a.from, now);
    return !!d && !d.gift && d.danger.day === a.day;
  });
}

/** Colony mates in danger the viewer can see (everyone in the colony sees "Ana is in danger"). */
export function colonyDangers(w: SocialWorld, viewer: UserId, now: Date): UserId[] {
  const out = new Set<UserId>();
  for (const c of coloniesOf(w.colonies, viewer))
    for (const m of c.members) {
      if (m.user === viewer) continue;
      const d = activeDanger(w.dangers, w.gifts, m.user, now);
      if (d && !d.gift) out.add(m.user);
    }
  return [...out];
}

export interface ColonyMemberRow extends MemberView {
  inDanger: boolean;
  hasDayFreeze: boolean;
  frozenToday: boolean;
  isViewer: boolean;
}

export interface ColonyDetail {
  colony: Colony;
  members: ColonyMemberRow[];
  streak: number;
  todayComplete: boolean;
  atRisk: UserId[];
  waiting: UserId[];
  goal: SharedGoal | null;
}

export function colonyDetail(w: SocialWorld, colonyId: string, viewer: UserId, now: Date): ColonyDetail | null {
  const colony = w.colonies.find((c) => c.id === colonyId);
  if (!colony) return null;
  const today = toKey(now);
  const days: Record<UserId, MemberDays> = {};
  const members = colony.members
    .filter((m) => w.users[m.user])
    .map((m) => {
      const s = statusOf(w, m.user, now);
      days[m.user] = { saved: s.saved, frozen: s.frozen, danger: s.danger ? s.danger.danger.day : null };
      return { ...memberView(s.user, s.streak, s.savedToday), inDanger: !!s.danger && !s.danger.gift, hasDayFreeze: s.hasDayFreeze, frozenToday: s.frozen.has(today) && !s.savedToday, isViewer: m.user === viewer };
    });
  const cs = colonyStreak(
    colony.members.filter((m) => w.users[m.user]),
    days,
    today,
  );
  return { colony, members, ...cs, goal: w.sharedGoals.find((g) => g.colony === colony.id) ?? null };
}

export const sharedColonies = (w: SocialWorld, a: UserId, b: UserId): Colony[] => coloniesOf(w.colonies, a).filter((c) => c.members.some((m) => m.user === b));

/** Private, only on the two people's own screens: freezes that worked, each way. */
export function savesBetween(w: SocialWorld, viewer: UserId, other: UserId) {
  const worked = w.gifts.filter((g) => g.status === 'active');
  return { given: worked.filter((g) => g.from === viewer && g.to === other).length, received: worked.filter((g) => g.from === other && g.to === viewer).length };
}

/** Everyone's private tally: "Saves given / received". */
export function savesTally(w: SocialWorld, viewer: UserId) {
  const worked = w.gifts.filter((g) => g.status === 'active');
  return { given: worked.filter((g) => g.from === viewer).length, received: worked.filter((g) => g.to === viewer).length };
}

/** The person whose 1-day Freeze is waiting for the viewer (to show "Mihai gave you his freeze"). */
export function pendingGiftFor(w: SocialWorld, viewer: UserId, now: Date): FreezeGift | null {
  return activeDanger(w.dangers, w.gifts, viewer, now)?.gift ?? null;
}

/** The latest freeze from a friend that worked for the viewer, for the "streak saved" moment. */
export const latestRescue = (w: SocialWorld, viewer: UserId): FreezeGift | null =>
  [...w.gifts].reverse().find((g) => g.to === viewer && g.status === 'active') ?? null;

/** Everyone in the world (the ask sheet and the colony picker filter it). */
export const everyone = (w: SocialWorld): SocialUser[] => Object.values(w.users);

export function unreadNotices(w: SocialWorld, viewer: UserId) {
  return w.notices.filter((n) => n.to === viewer && !n.read);
}

/** The badge on the people icon on home: things waiting for the viewer. */
export function attentionCount(w: SocialWorld, viewer: UserId, now: Date): number {
  return incomingRequests(w, viewer).length + asksFor(w, viewer, now).length + w.colonyInvites.filter((i) => i.to === viewer && i.status === 'pending').length + (pendingGiftFor(w, viewer, now) ? 1 : 0);
}
