// The social layer's data. SocialRepo is what both worlds implement: SupabaseSocialRepo
// (supabaseRepo.ts) for signed-in accounts, on the live backend (docs/social-schema.md), and
// MockSocialRepo here for the offline demo: one simulated world per account in this browser's
// localStorage, with the demo people from seed.ts, running the end-of-day rules (freezes, rescues)
// each time it's opened. Every change goes through rules.ts. Money here (shared goals) is simulated.
import { addDays, startOfWeek, toKey } from '../dates';
import { uid } from '../id';
import type { Bani } from '../../data/types';
import * as R from './rules';
import { CHALLENGES, seedWorld, type MeInfo } from './seed';
import type { CheerKind, Colony, DayKey, FreezeGift, FriendGraph, Notice, SaveEvent, SharedGoal, SocialWorld, UserId } from './types';
import { connected, graphOf, statusOf, viewerOf } from './view';

/** What the app knows about the signed-in person, handed to the social layer on every change. */
export interface MeSnapshot extends MeInfo {
  /** every day money was put aside (from the app's own ledger) */
  saves: SaveEvent[];
  /** days frozen by hand with the old manual freeze */
  legacyPaused: DayKey[];
  /** the main goal's progress, 0..1 (shown to colony mates only if "Show my progress" is on) */
  goalProgress: number;
}

/** What the app's own streak (home, the streak moment, Profile) takes from the social layer. */
export interface StreakExtras {
  /** days a freeze covered (1-day, a friend's, a running 1-week Freeze) */
  freezeDays: DayKey[];
  /** a missed day still inside its 24 hours of danger: the streak waits for it */
  hold: DayKey | null;
}

export interface NewSharedGoal {
  name: string;
  photo: string | null;
  icon: string;
  target: Bani;
  date: DayKey;
}

/** The mock answers at once; the live backend answers with a promise. Callers always `await`. */
export type Maybe<T> = T | Promise<T>;

export interface SocialRepo {
  /** true for the offline demo: simulated people, the demo address book, colonies and shared goals */
  readonly simulated: boolean;
  /** Opens this account's world (seeding it the first time) and brings it up to now. */
  open(me: MeSnapshot): void;
  close(): void;
  current(): SocialWorld | null;
  subscribe(fn: () => void): () => void;
  extrasFor(accountId: string): StreakExtras | null;
  // friends
  matchContacts(phones: string[]): Maybe<UserId[]>;
  markContactsAsked(): void;
  sendRequest(to: UserId): Maybe<'requested' | 'friends'>;
  findByPhone(raw: string): Maybe<UserId | null>;
  accept(requestId: string): Maybe<void>;
  decline(requestId: string): Maybe<void>;
  cancel(requestId: string): Maybe<void>;
  removeFriend(id: UserId): Maybe<void>;
  block(id: UserId): Maybe<void>;
  setDiscoverable(on: boolean): Maybe<void>;
  setShowProgress(on: boolean): Maybe<void>;
  // freezes
  askForFreeze(to: UserId[]): Maybe<void>;
  giveFreeze(to: UserId): Maybe<FreezeGift>;
  activateWeekFreeze(): Maybe<void>;
  // colonies
  createColony(name: string, members: UserId[]): Maybe<Colony>;
  inviteToColony(colonyId: string, friend: UserId): Maybe<void>;
  joinColony(colonyId: string): Maybe<void>;
  declineColonyInvite(colonyId: string): Maybe<void>;
  leaveColony(colonyId: string): Maybe<{ returned: Bani }>;
  tickChallenge(colonyId: string): Maybe<void>;
  // shared goals
  proposeSharedGoal(colonyId: string, input: NewSharedGoal): Maybe<SharedGoal>;
  /** "With friends" in the new-goal wizard: no colony needed, the friends get an invite */
  createSharedGoal(input: NewSharedGoal, friends: UserId[]): Maybe<SharedGoal>;
  inviteToSharedGoal(goalId: string, friends: UserId[]): Maybe<void>;
  joinSharedGoal(goalId: string): Maybe<void>;
  declineSharedGoal(goalId: string): Maybe<void>;
  depositShared(goalId: string, amount: Bani): Maybe<{ crossed: number[] }>;
  /** goalId null: what came back from goals you left (the pocket) */
  withdrawShared(goalId: string | null, amount: Bani): Maybe<void>;
  leaveSharedGoal(goalId: string): Maybe<{ returned: Bani }>;
  setSharedShare(goalId: string, share: Bani): Maybe<void>;
  adjustSharedTarget(goalId: string, target: Bani): Maybe<void>;
  redistributeShared(goalId: string): Maybe<void>;
  // the rest
  cheer(to: UserId, kind: CheerKind): Maybe<void>;
  setWitness(friend: UserId | null): Maybe<void>;
  redeemInvite(code: string): Maybe<boolean>;
  markSeen(key: string): void;
  markNoticesRead(): Maybe<void>;
}

const KEY = (accountId: string) => `kip.social.v1.${accountId}`;

function safeStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Small stable hash: which simulated people saved today, decided once per day. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const at = (day: DayKey, hour: number) => new Date(`${day}T${String(hour).padStart(2, '0')}:20:00`);
const first = (name: string) => R.firstNameOf(name);

/**
 * Brings the world up to `now`: the simulated people keep saving, friends' freezes work or go back,
 * every missed day meets the end-of-day rule, dangers run out, 1-week Freezes are earned, and a new
 * week brings a new colony challenge.
 */
export function advance(w: SocialWorld, now: Date): SocialWorld {
  const today = toKey(now);
  const saves = { ...w.saves };
  const freezes = { ...w.freezes };
  let dangers = [...w.dangers];
  let gifts = [...w.gifts];
  const notices: Notice[] = [...w.notices];
  const note = (to: UserId, text: string, link: string | null = null) => notices.push({ id: uid('n_'), to, at: now.toISOString(), text, link, read: false });

  // 1. the simulated people who keep going save every day after the seed
  for (const id of w.steady) {
    const list = saves[id] ?? [];
    const last = list.reduce((m, s) => (s.day > m ? s.day : m), w.seededOn);
    const add: SaveEvent[] = [];
    for (let d = addDays(last > w.seededOn ? last : w.seededOn, 1); d < today; d = addDays(d, 1)) add.push({ day: d, at: at(d, 18).toISOString() });
    const h = hash(id + today);
    const when = at(today, 8 + (h % 10));
    if (today > w.seededOn && !list.some((s) => s.day === today) && h % 3 !== 0 && when <= now) add.push({ day: today, at: when.toISOString() });
    if (add.length) saves[id] = [...list, ...add];
  }

  // 2. friends' freezes: they work once the rescued person saves in time, or go back to the giver
  gifts = gifts.map((g) => {
    if (g.status !== 'pending') return g;
    const status = R.resolveGift(g, saves[g.to] ?? [], now);
    if (status === 'pending') return g;
    const giver = w.users[g.from];
    const rescued = w.users[g.to];
    if (status === 'active') {
      const f = freezes[g.to];
      if (f) freezes[g.to] = { ...f, frozen: [...f.frozen, { day: g.day, by: 'gift' }], settledThrough: f.settledThrough > g.day ? g.day : f.settledThrough };
      dangers = dangers.map((d) => (d.user === g.to && d.day === g.day ? { ...d, status: 'rescued' } : d));
      if (giver && rescued) note(g.from, `${first(rescued.name)} put money aside. Your freeze saved their streak.`, `/friends/${g.to}`);
    } else {
      const f = freezes[g.from];
      if (f) freezes[g.from] = R.returnDayFreeze(f);
      note(g.from, 'Your 1-day Freeze came back to you, ready to use.', '/friends');
    }
    return { ...g, status, resolvedAt: now.toISOString() };
  });

  // 3. the end-of-day rule for everyone, then the 1-week Freeze for every 45 days in a row
  for (const id of Object.keys(w.users)) {
    const extra = id === w.me ? w.legacyPaused : [];
    let f = R.rechargeDayFreeze(freezes[id] ?? R.freshFreezes(today), now);
    const saved = R.savedDaySet(saves[id]);
    const out = R.settleMissedDays(f, saved, today, extra);
    f = out.freezes;
    for (const day of out.missed) {
      if (dangers.some((d) => d.user === id && d.day === day)) continue;
      const until = R.dangerUntil(day);
      const open = now.getTime() < new Date(until).getTime();
      dangers.push({ id: uid('d_'), user: id, day, until, status: open ? 'open' : 'lapsed' });
    }
    f = R.awardWeekFreeze(f, R.streakOf(saved, R.frozenDaySet(f, extra), today));
    if (f.week === 1 && freezes[id]?.week !== 1 && id === w.me) note(id, 'You earned a 1-week Freeze: 45 days in a row!', '/profile/streaks');
    freezes[id] = f;
  }

  // 4. the 24 hours ran out with nobody's freeze waiting
  dangers = dangers.map((d) => (d.status === 'open' && !R.activeDanger([d], gifts, d.user, now) ? { ...d, status: 'lapsed' } : d));
  const asks = w.asks.map((a) => (a.status === 'open' && !dangers.some((d) => d.user === a.from && d.day === a.day && d.status === 'open') ? { ...a, status: 'closed' as const } : a));

  // 5. Monday: a new challenge for every colony
  const week = startOfWeek(today);
  const colonies = w.colonies.map((c) => (c.challenge?.week === week ? c : { ...c, challenge: { week, title: CHALLENGES[hash(c.id + week) % CHALLENGES.length], done: [], reward: 'Free coffee' } }));

  return { ...w, saves, freezes, dangers, gifts, asks, notices, colonies };
}

export class MockSocialRepo implements SocialRepo {
  readonly simulated = true;
  private world: SocialWorld | null = null;
  private listeners = new Set<() => void>();
  private extras: { world: SocialWorld; value: StreakExtras } | null = null;

  constructor(
    private storage: Storage | null = safeStorage(),
    private clock: () => Date = () => new Date(),
  ) {}

  // ---------- plumbing ----------

  current() {
    return this.world;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private load(accountId: string): SocialWorld | null {
    try {
      const raw = this.storage?.getItem(KEY(accountId));
      const w = raw ? (JSON.parse(raw) as SocialWorld) : null;
      return w && w.version === 1 && w.me === accountId ? w : null;
    } catch {
      return null;
    }
  }

  private save(w: SocialWorld) {
    try {
      this.storage?.setItem(KEY(w.me), JSON.stringify(w));
    } catch {
      /* private mode or full storage: the world lives in memory until the tab closes */
    }
  }

  private set(w: SocialWorld) {
    this.world = w;
    this.save(w);
    this.listeners.forEach((fn) => fn());
  }

  /** Applies a change as the account's own person, then lets the rules catch up (a saving may rescue someone). */
  private update(fn: (w: SocialWorld, actor: UserId, now: Date) => SocialWorld) {
    const w = this.world;
    if (!w) throw new R.RuleError('closed', 'Sign in to see your friends.');
    const now = this.clock();
    this.set(advance(fn(w, viewerOf(w), now), now));
  }

  private withMe(w: SocialWorld, me: MeSnapshot): SocialWorld {
    const u = w.users[me.id];
    return {
      ...w,
      users: { ...w.users, [me.id]: { ...u, name: me.name || u.name, phone: me.phone || u.phone, goalProgress: me.goalProgress } },
      saves: { ...w.saves, [me.id]: me.saves },
      legacyPaused: me.legacyPaused,
    };
  }

  open(me: MeSnapshot) {
    const now = this.clock();
    const base = this.world?.me === me.id ? this.world : this.load(me.id) ?? seedWorld(me, now);
    const next = advance(this.withMe(base, me), now);
    // nothing changed (a re-render with the same savings): don't write or wake anyone
    if (this.world && JSON.stringify(next) === JSON.stringify(this.world)) return;
    this.set(next);
  }

  close() {
    if (!this.world) return;
    this.world = null;
    this.listeners.forEach((fn) => fn());
  }

  extrasFor(accountId: string): StreakExtras | null {
    const w = this.world;
    if (!w || w.me !== accountId) return null;
    if (this.extras?.world === w) return this.extras.value;
    const now = this.clock();
    const f = w.freezes[w.me];
    const danger = R.activeDanger(w.dangers, w.gifts, w.me, now);
    const value: StreakExtras = {
      freezeDays: [...R.frozenDaySet(f)].sort(),
      hold: danger ? danger.danger.day : null,
    };
    this.extras = { world: w, value };
    return value;
  }

  // ---------- friends ----------

  private graph(w: SocialWorld, g: FriendGraph): SocialWorld {
    return { ...w, requests: g.requests, friendships: g.friendships, blocks: g.blocks };
  }

  matchContacts(phones: string[]) {
    const w = this.world;
    if (!w) return [];
    return R.matchContacts(phones, Object.values(w.users), viewerOf(w), w.blocks);
  }

  markContactsAsked() {
    const w = this.world;
    if (w && !w.contactsAsked) this.set({ ...w, contactsAsked: true });
  }

  findByPhone(raw: string) {
    const w = this.world;
    const n = R.normalizePhone(raw);
    if (!w || !n) return null;
    // the same rule as contacts: someone who turned discoverability off can't be found by number
    return R.matchContacts([n], Object.values(w.users), viewerOf(w), w.blocks)[0] ?? null;
  }

  sendRequest(to: UserId) {
    let outcome: 'requested' | 'friends' = 'requested';
    this.update((w, actor, now) => {
      const res = R.sendFriendRequest(graphOf(w), actor, to, now, uid('r_'));
      outcome = res.outcome;
      const who = first(w.users[actor]?.name ?? '');
      const n: Notice = { id: uid('n_'), to, at: now.toISOString(), text: res.outcome === 'friends' ? `${who} accepted your request. You're friends now.` : `${who} wants to be friends.`, link: '/friends?tab=requests', read: false };
      return { ...this.graph(w, res.graph), notices: [...w.notices, n] };
    });
    return outcome;
  }

  accept(requestId: string) {
    this.update((w, actor, now) => {
      const r = w.requests.find((x) => x.id === requestId);
      const g = R.acceptFriendRequest(graphOf(w), requestId, actor, now);
      const n: Notice[] = r ? [{ id: uid('n_'), to: r.from, at: now.toISOString(), text: `${first(w.users[actor]?.name ?? '')} accepted your request. You're friends now.`, link: `/friends/${actor}`, read: false }] : [];
      return { ...this.graph(w, g), notices: [...w.notices, ...n] };
    });
  }

  decline(requestId: string) {
    this.update((w, actor) => this.graph(w, R.declineFriendRequest(graphOf(w), requestId, actor)));
  }

  cancel(requestId: string) {
    this.update((w, actor) => this.graph(w, R.cancelFriendRequest(graphOf(w), requestId, actor)));
  }

  removeFriend(id: UserId) {
    this.update((w, actor) => ({ ...this.graph(w, R.removeFriend(graphOf(w), actor, id)), witness: w.witness[actor] === id ? omit(w.witness, actor) : w.witness }));
  }

  block(id: UserId) {
    this.update((w, actor, now) => ({ ...this.graph(w, R.blockUser(graphOf(w), actor, id, now)), witness: w.witness[actor] === id ? omit(w.witness, actor) : w.witness }));
  }

  setDiscoverable(on: boolean) {
    this.update((w, actor) => ({ ...w, users: { ...w.users, [actor]: { ...w.users[actor], discoverable: on } } }));
  }

  setShowProgress(on: boolean) {
    this.update((w, actor) => ({ ...w, users: { ...w.users, [actor]: { ...w.users[actor], showProgress: on } } }));
  }

  // ---------- freezes ----------

  askForFreeze(to: UserId[]) {
    this.update((w, actor, now) => {
      const d = R.activeDanger(w.dangers, w.gifts, actor, now);
      if (!d) throw new R.RuleError('not-in-danger', "Your streak isn't in danger right now.");
      const people = [...new Set(to)].filter((id) => id !== actor && connected(w, actor, id));
      if (!people.length) throw new R.RuleError('nobody', 'Pick at least one friend.');
      const who = first(w.users[actor].name);
      const notes: Notice[] = people.map((p) => ({ id: uid('n_'), to: p, at: now.toISOString(), text: `${who}: Can you spare a freeze?`, link: `/friends/${actor}`, read: false }));
      const asks = w.asks.map((a) => (a.from === actor && a.day === d.danger.day && a.status === 'open' ? { ...a, status: 'closed' as const } : a));
      return { ...w, asks: [...asks, { id: uid('a_'), from: actor, to: people, day: d.danger.day, at: now.toISOString(), status: 'open' }], notices: [...w.notices, ...notes] };
    });
  }

  giveFreeze(to: UserId) {
    let made: FreezeGift | null = null;
    this.update((w, actor, now) => {
      const giverFreezes = w.freezes[actor] ?? R.freshFreezes(toKey(now));
      const err = R.checkGiveFreeze({ giver: actor, receiver: to, giverFreezes, dangers: w.dangers, gifts: w.gifts, connected: connected(w, actor, to), now });
      if (err) throw new R.RuleError(err, R.GIVE_ERRORS[err]);
      const d = R.activeDanger(w.dangers, w.gifts, to, now)!;
      const { giver, gift } = R.giveFreeze(giverFreezes, { id: uid('g_'), from: actor, to, day: d.danger.day, givenAt: now.toISOString() }, now);
      made = gift;
      const n: Notice = { id: uid('n_'), to, at: now.toISOString(), text: R.rescuedLine(w.users[actor]), link: '/friends', read: false };
      // everyone else in the demo is simulated: they put money aside right away, so the freeze works
      const theirs = to === w.me ? w.saves : { ...w.saves, [to]: [...(w.saves[to] ?? []), { day: toKey(now), at: now.toISOString() }] };
      return {
        ...w,
        saves: theirs,
        freezes: { ...w.freezes, [actor]: giver },
        gifts: [...w.gifts, gift],
        asks: w.asks.map((a) => (a.from === to && a.day === d.danger.day && a.status === 'open' ? { ...a, status: 'closed' as const } : a)),
        notices: [...w.notices, n],
      };
    });
    return made!;
  }

  activateWeekFreeze() {
    this.update((w, actor, now) => ({ ...w, freezes: { ...w.freezes, [actor]: R.activateWeekFreeze(w.freezes[actor], toKey(now)) } }));
  }

  // ---------- colonies ----------

  createColony(name: string, members: UserId[]) {
    let made: Colony | null = null;
    this.update((w, actor, now) => {
      const err = R.checkCreateColony(graphOf(w), w.colonies, actor, members, name);
      if (err) throw new R.RuleError(err, R.COLONY_ERRORS[err]);
      const today = toKey(now);
      made = { id: uid('c_'), name: name.trim().slice(0, 30), createdBy: actor, createdAt: now.toISOString(), code: uid('').slice(-6).toUpperCase(), members: [actor, ...members.filter((m) => m !== actor)].map((user) => ({ user, joinedOn: today })), challenge: { week: startOfWeek(today), title: CHALLENGES[0], done: [], reward: 'Free coffee' } };
      const notes: Notice[] = members.map((m) => ({ id: uid('n_'), to: m, at: now.toISOString(), text: `${first(w.users[actor].name)} added you to the colony «${made!.name}».`, link: `/colonies/${made!.id}`, read: false }));
      return { ...w, colonies: [...w.colonies, made], notices: [...w.notices, ...notes] };
    });
    return made!;
  }

  inviteToColony(colonyId: string, friend: UserId) {
    this.update((w, actor, now) => {
      const c = w.colonies.find((x) => x.id === colonyId);
      if (!c) throw new R.RuleError('gone', 'This colony no longer exists.');
      const err = R.checkJoinColony(graphOf(w), w.colonies, c, friend, actor);
      if (err) throw new R.RuleError(err, R.COLONY_ERRORS[err]);
      if (w.colonyInvites.some((i) => i.colony === colonyId && i.to === friend && i.status === 'pending')) return w;
      const n: Notice = { id: uid('n_'), to: friend, at: now.toISOString(), text: `${first(w.users[actor].name)} invited you to the colony «${c.name}».`, link: `/colonies/invite/${c.code}`, read: false };
      return { ...w, colonyInvites: [...w.colonyInvites, { id: uid('ci_'), colony: colonyId, from: actor, to: friend, at: now.toISOString(), status: 'pending' }], notices: [...w.notices, n] };
    });
  }

  joinColony(colonyId: string) {
    this.update((w, actor, now) => {
      const c = w.colonies.find((x) => x.id === colonyId);
      if (!c) throw new R.RuleError('gone', 'This colony no longer exists.');
      // whoever invited you, or any member who is your friend, is the one letting you in
      const invite = w.colonyInvites.find((i) => i.colony === colonyId && i.to === actor && i.status === 'pending');
      const inviter = invite?.from ?? c.members.find((m) => R.areFriends(w, m.user, actor))?.user ?? '';
      const err = R.checkJoinColony(graphOf(w), w.colonies, c, actor, inviter);
      if (err) throw new R.RuleError(err, R.COLONY_ERRORS[err]);
      return {
        ...w,
        colonies: w.colonies.map((x) => (x.id === colonyId ? { ...x, members: [...x.members, { user: actor, joinedOn: toKey(now) }] } : x)),
        colonyInvites: w.colonyInvites.map((i) => (i.colony === colonyId && i.to === actor && i.status === 'pending' ? { ...i, status: 'accepted' as const } : i)),
      };
    });
  }

  declineColonyInvite(colonyId: string) {
    this.update((w, actor) => ({ ...w, colonyInvites: w.colonyInvites.map((i) => (i.colony === colonyId && i.to === actor && i.status === 'pending' ? { ...i, status: 'declined' as const } : i)) }));
  }

  leaveColony(colonyId: string) {
    let returned = 0;
    this.update((w, actor) => {
      // the colony's shared goal goes with it: your money there goes back to your own pocket
      let next = w;
      for (const g of w.sharedGoals.filter((x) => x.colony === colonyId && R.isParticipant(x, actor))) {
        const out = this.leaveGoal(next, g.id, actor);
        returned += out.returned;
        next = out.world;
      }
      return { ...next, colonies: next.colonies.map((c) => (c.id === colonyId ? R.leaveColony(c, actor) : c)).filter((c) => c.members.length > 0) };
    });
    return { returned };
  }

  tickChallenge(colonyId: string) {
    this.update((w, actor) => ({
      ...w,
      colonies: w.colonies.map((c) => {
        if (c.id !== colonyId || !c.challenge) return c;
        const done = c.challenge.done.includes(actor) ? c.challenge.done.filter((x) => x !== actor) : [...c.challenge.done, actor];
        return { ...c, challenge: { ...c.challenge, done } };
      }),
    }));
  }

  // ---------- shared goals ----------

  private goal(w: SocialWorld, id: string): SharedGoal {
    const g = w.sharedGoals.find((x) => x.id === id);
    if (!g) throw new R.RuleError('gone', 'This shared goal no longer exists.');
    return g;
  }

  private putGoal(w: SocialWorld, g: SharedGoal): SocialWorld {
    return { ...w, sharedGoals: w.sharedGoals.map((x) => (x.id === g.id ? g : x)) };
  }

  proposeSharedGoal(colonyId: string, input: NewSharedGoal) {
    let made: SharedGoal | null = null;
    this.update((w, actor, now) => {
      const c = w.colonies.find((x) => x.id === colonyId);
      if (!c || !c.members.some((m) => m.user === actor)) throw new R.RuleError('not-member', 'Only colony members can suggest a goal.');
      if (w.sharedGoals.some((g) => g.colony === colonyId)) throw new R.RuleError('exists', 'The colony already has a shared goal.');
      if (!input.name.trim()) throw new R.RuleError('name', 'Give the goal a name.');
      if (!Number.isInteger(input.target) || input.target <= 0) throw new R.RuleError('amount', 'Enter an amount above 0.');
      made = { id: uid('sg_'), colony: colonyId, name: input.name.trim().slice(0, 40), photo: input.photo, icon: input.icon, target: input.target, date: input.date, createdBy: actor, createdAt: now.toISOString(), participants: [{ user: actor, share: input.target }], contributions: [], milestones: [], rebalance: false };
      const notes: Notice[] = c.members
        .filter((m) => m.user !== actor)
        .map((m) => ({ id: uid('n_'), to: m.user, at: now.toISOString(), text: `${first(w.users[actor].name)} suggested a shared goal: «${made!.name}».`, link: `/shared-goal/${made!.id}`, read: false }));
      return { ...w, sharedGoals: [...w.sharedGoals, made], notices: [...w.notices, ...notes] };
    });
    return made!;
  }

  createSharedGoal(input: NewSharedGoal, friends: UserId[]) {
    let made: SharedGoal | null = null;
    this.update((w, actor, now) => {
      if (!input.name.trim()) throw new R.RuleError('name', 'Give the goal a name.');
      if (!Number.isInteger(input.target) || input.target <= 0) throw new R.RuleError('amount', 'Enter an amount above 0.');
      const people = [...new Set(friends)].filter((f) => f !== actor && R.areFriends(w, actor, f));
      if (!people.length) throw new R.RuleError('nobody', 'Pick at least one friend.');
      if (people.length > 4) throw new R.RuleError('full', 'A shared goal has at most 5 people, you included.');
      made = { id: uid('sg_'), colony: '', name: input.name.trim().slice(0, 40), photo: input.photo, icon: input.icon, target: input.target, date: input.date, createdBy: actor, createdAt: now.toISOString(), participants: [{ user: actor, share: input.target }], invited: people.map((user) => ({ user, by: actor })), contributions: [], milestones: [], rebalance: false };
      const notes: Notice[] = people.map((to) => ({ id: uid('n_'), to, at: now.toISOString(), text: `${first(w.users[actor].name)} invited you to save for «${made!.name}».`, link: '/friends?tab=requests', read: false }));
      return { ...w, sharedGoals: [...w.sharedGoals, made], notices: [...w.notices, ...notes] };
    });
    return made!;
  }

  inviteToSharedGoal(goalId: string, friends: UserId[]) {
    this.update((w, actor) => {
      const g = this.goal(w, goalId);
      const fresh = friends.filter((f) => R.areFriends(w, actor, f) && !R.isParticipant(g, f) && !g.invited?.some((i) => i.user === f));
      if (g.participants.length + (g.invited?.length ?? 0) + fresh.length > 5) throw new R.RuleError('full', 'A shared goal has at most 5 people, you included.');
      return this.putGoal(w, { ...g, invited: [...(g.invited ?? []), ...fresh.map((user) => ({ user, by: actor }))] });
    });
  }

  declineSharedGoal(goalId: string) {
    this.update((w, actor) => {
      const g = this.goal(w, goalId);
      return this.putGoal(w, { ...g, invited: g.invited?.filter((i) => i.user !== actor) });
    });
  }

  joinSharedGoal(goalId: string) {
    this.update((w, actor) => {
      const g = this.goal(w, goalId);
      const c = w.colonies.find((x) => x.id === g.colony);
      if (!g.invited?.some((i) => i.user === actor) && !c?.members.some((m) => m.user === actor)) throw new R.RuleError('not-member', 'This goal belongs to the colony. Join the colony first.');
      return this.putGoal(w, R.joinSharedGoal(g, actor));
    });
  }

  depositShared(goalId: string, amount: Bani) {
    let crossed: number[] = [];
    this.update((w, actor, now) => {
      const g = this.goal(w, goalId);
      const before = R.sharedPct(g);
      const after = R.contribute(g, actor, amount, now, uid('sc_'));
      crossed = R.milestonesCrossed(before, R.sharedPct(after), g.milestones);
      const notes: Notice[] = crossed.length
        ? g.participants.filter((p) => p.user !== actor).map((p) => ({ id: uid('n_'), to: p.user, at: now.toISOString(), text: `«${g.name}» reached ${crossed[crossed.length - 1]}%!`, link: `/shared-goal/${g.id}`, read: false }))
        : [];
      return { ...this.putGoal(w, { ...after, milestones: [...g.milestones, ...crossed] }), notices: [...w.notices, ...notes] };
    });
    return { crossed };
  }

  withdrawShared(goalId: string | null, amount: Bani) {
    if (goalId === null) {
      this.update((w, actor) => {
        const have = w.pockets[actor] ?? 0;
        if (amount <= 0 || amount > have) throw new R.RuleError('amount', `You can withdraw up to ${have / 100} lei.`);
        return { ...w, pockets: { ...w.pockets, [actor]: have - amount } };
      });
      return;
    }
    this.update((w, actor, now) => {
      const g = R.withdrawOwn(this.goal(w, goalId), actor, amount, now, uid('sc_'));
      // the others hear a neutral line: no name, no blame
      const notes: Notice[] = g.participants.filter((p) => p.user !== actor).map((p) => ({ id: uid('n_'), to: p.user, at: now.toISOString(), text: R.progressNotice(g), link: `/shared-goal/${g.id}`, read: false }));
      return { ...this.putGoal(w, g), pockets: { ...w.pockets, [actor]: (w.pockets[actor] ?? 0) + amount }, notices: [...w.notices, ...notes] };
    });
  }

  private leaveGoal(w: SocialWorld, goalId: string, actor: UserId): { world: SocialWorld; returned: Bani } {
    const now = this.clock();
    const g = this.goal(w, goalId);
    const { goal, returned } = R.leaveSharedGoal(g, actor);
    const notes: Notice[] = goal.participants.map((p) => ({ id: uid('n_'), to: p.user, at: now.toISOString(), text: `${first(w.users[actor].name)} left «${g.name}». Choose: adjust the target or split it again.`, link: `/shared-goal/${g.id}`, read: false }));
    const world = {
      ...w,
      sharedGoals: goal.participants.length ? w.sharedGoals.map((x) => (x.id === goalId ? { ...goal, rebalance: true } : x)) : w.sharedGoals.filter((x) => x.id !== goalId),
      pockets: { ...w.pockets, [actor]: (w.pockets[actor] ?? 0) + returned },
      notices: [...w.notices, ...notes],
    };
    return { world, returned };
  }

  leaveSharedGoal(goalId: string) {
    let returned = 0;
    this.update((w, actor) => {
      const out = this.leaveGoal(w, goalId, actor);
      returned = out.returned;
      return out.world;
    });
    return { returned };
  }

  setSharedShare(goalId: string, share: Bani) {
    this.update((w, actor) => this.putGoal(w, R.setShare(this.goal(w, goalId), actor, share)));
  }

  adjustSharedTarget(goalId: string, target: Bani) {
    this.update((w) => this.putGoal(w, { ...R.adjustTarget(this.goal(w, goalId), target), rebalance: false }));
  }

  redistributeShared(goalId: string) {
    this.update((w) => this.putGoal(w, { ...R.redistributeShares(this.goal(w, goalId)), rebalance: false }));
  }

  // ---------- the rest ----------

  cheer(to: UserId, kind: CheerKind) {
    this.update((w, actor, now) => {
      if (!R.canCheer(w.cheers, actor, to, toKey(now))) throw new R.RuleError('cheers', `You've already sent them ${R.MAX_CHEERS_PER_DAY} cheers today. You can send more tomorrow.`);
      if (!connected(w, actor, to) && w.witness[to] !== actor) throw new R.RuleError('not-connected', R.GIVE_ERRORS['not-connected']);
      const text = R.CHEERS.find((c) => c.kind === kind)?.text ?? '';
      const n: Notice = { id: uid('n_'), to, at: now.toISOString(), text: `${first(w.users[actor].name)}: ${text}`, link: `/friends/${actor}`, read: false };
      return { ...w, cheers: [...w.cheers, { id: uid('ch_'), from: actor, to, kind, at: now.toISOString() }], notices: [...w.notices, n] };
    });
  }

  setWitness(friend: UserId | null) {
    this.update((w, actor) => (friend ? { ...w, witness: { ...w.witness, [actor]: friend } } : { ...w, witness: omit(w.witness, actor) }));
  }

  redeemInvite(code: string) {
    const w = this.world;
    if (!w) return false;
    const inviter = Object.values(w.users).find((u) => u.inviteCode.toUpperCase() === code.trim().toUpperCase());
    if (!inviter || inviter.id === w.me || w.users[w.me].invitedBy) return false;
    this.update((x, _actor, now) => {
      const me = x.me;
      const today = toKey(now);
      const req = R.checkFriendRequest(graphOf(x), inviter.id, me, now) ? x.requests : [...x.requests, { id: uid('r_'), from: inviter.id, to: me, at: now.toISOString(), status: 'pending' as const }];
      // the inviter's 1-day Freeze recharges right away; you start with yours
      const f = R.inviteFreezes(x.freezes[inviter.id] ?? R.freshFreezes(today), x.freezes[me] ?? R.freshFreezes(today));
      return {
        ...x,
        users: { ...x.users, [me]: { ...x.users[me], invitedBy: inviter.id } },
        freezes: { ...x.freezes, [inviter.id]: f.inviter, [me]: f.invitee },
        requests: req,
        notices: [...x.notices, { id: uid('n_'), to: me, at: now.toISOString(), text: `You joined with ${first(inviter.name)}'s link. You start with your 1-day Freeze.`, link: '/friends', read: false }],
      };
    });
    return true;
  }

  markSeen(key: string) {
    const w = this.world;
    if (w && !w.seen[key]) this.set({ ...w, seen: { ...w.seen, [key]: true } });
  }

  markNoticesRead() {
    const w = this.world;
    if (!w) return;
    const me = viewerOf(w);
    if (!w.notices.some((n) => n.to === me && !n.read)) return;
    this.set({ ...w, notices: w.notices.map((n) => (n.to === me ? { ...n, read: true } : n)) });
  }
}

function omit<T>(rec: Record<string, T>, key: string): Record<string, T> {
  const next = { ...rec };
  delete next[key];
  return next;
}

/** For screens: the status of anyone, as the rules see it now. */
export { statusOf };
