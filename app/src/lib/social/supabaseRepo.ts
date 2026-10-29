// The social layer for signed-in accounts, on the live backend (docs/social-schema.md). One RPC,
// social_world(), brings everything this person may see; it is projected into the same SocialWorld
// the mock keeps, so view.ts and the screens read both alike. A friend's streak comes from the
// server as a number: their saving days here are only a picture of that number (rules.streakOf
// gives it back exactly), never real data. Nothing here is simulated. Colonies and shared goals come
// from a second RPC, social_groups(): for a shared goal only the total %, each member's % of their
// own share and my own amount ever reach this device. The witness isn't live yet.
import type { RealtimeChannel } from '@supabase/supabase-js';
import { addDays, toKey } from '../dates';
import { ApiError, callFn, supabase } from '../supabase';
import * as R from './rules';
import type { Maybe, MeSnapshot, NewSharedGoal, SocialRepo, StreakExtras } from './repo';
import type { Bani } from '../../data/types';
import type { AvatarHue, CheerKind, Colony, Danger, DayKey, FreezeGift, FreezeState, FrozenBy, Notice, SaveEvent, SharedGoal, SocialUser, SocialWorld, UserId } from './types';

interface ServerStatus {
  streak: number;
  saved_today: boolean;
  frozen_today: boolean;
  has_day_freeze: boolean;
  week_running: boolean;
  week_from: DayKey | null;
  danger: { id: string; day: DayKey; until: string } | null;
  gift_given_at: string | null;
}

export interface ServerWorld {
  today: DayKey;
  me: { id: UserId; name: string | null; phone: string | null; discoverable: boolean; invite_code: string | null; invited_by: UserId | null; created_at: string } | null;
  freeze: { day_freeze: number; day_recharge_at: string | null; week_freeze: number; week_milestone: number; week_from: DayKey | null; settled_through: DayKey; frozen: { day: DayKey; by: FrozenBy }[] } | null;
  status: ServerStatus | null;
  people: { id: UserId; name: string | null; friend: boolean; since?: string; status?: ServerStatus }[];
  requests: { id: string; from: UserId; to: UserId; status: 'pending' | 'accepted' | 'declined' | 'cancelled'; at: string }[];
  blocks: { by: UserId; who: UserId; at: string }[];
  dangers: { id: string; day: DayKey; until: string; status: Danger['status'] }[];
  asks: { id: string; from: UserId; to: UserId[]; day: DayKey; at: string; status: 'open' | 'closed' }[];
  gifts: { id: string; from: UserId; to: UserId; day: DayKey; given_at: string; status: FreezeGift['status']; resolved_at: string | null }[];
  cheers: { id: string; from: UserId; to: UserId; kind: CheerKind; at: string }[];
  notices: { id: string; kind: string; actor: UserId | null; actor_name: string | null; detail: string | null; read: boolean; at: string }[];
  /** social_groups(): colonies and shared goals, read alongside */
  groups?: ServerGroups;
}

export interface ServerGroups {
  people: { id: UserId; name: string | null; status: ServerStatus | null }[];
  colonies: { id: string; name: string; code: string; created_by: UserId; created_at: string; members: { user: UserId; joined_on: DayKey }[] }[];
  colony_invites: { id: string; colony: string; from: UserId; to: UserId; at: string; status: 'pending' | 'accepted' | 'declined' }[];
  shared_goals: {
    id: string;
    name: string;
    icon: string;
    target: Bani;
    date: DayKey;
    colony: string | null;
    created_by: UserId;
    created_at: string;
    milestones: number[];
    rebalance: boolean;
    total_pct: number;
    /** my own confirmed money in it: the only amount that comes back */
    mine: Bani;
    members: { user: UserId; status: 'active' | 'invited'; share: Bani; invited_by: UserId | null; pct: number }[];
  }[];
  returned_bani: Bani;
}

const TEST_NUMBERS = ['40700000100', '40700000101', '40700000102', '40700000103', '40700000104', '40700000105'];
/** the six sandbox accounts (docs/test-accounts.md): their shared deposits skip Stripe when there's no card */
export const isTestNumber = (phone: string | null | undefined) => TEST_NUMBERS.includes((phone ?? '').replace(/\D/g, '').replace(/^0/, '40'));

/** What stays on this device: moments already played, the contacts screen answered. */
interface LocalBits {
  seen: Record<string, true>;
  contactsAsked: boolean;
}

const HUES: AvatarHue[] = ['cer', 'menta', 'coral', 'soare', 'liliac', 'trandafir'];
function hueOf(id: string): AvatarHue {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 0x01000193);
  return HUES[(h >>> 0) % HUES.length];
}

const notLive = (): never => {
  throw new R.RuleError('not-live', 'This is not live yet.');
};

const SHARED_ERRORS: Record<string, string> = {
  name: 'Give the goal a name.',
  date: 'Pick a date from today on.',
  full: 'A shared goal has at most 5 people, you included.',
  share: "Your share can't be bigger than the target.",
  'not-in': 'Join the goal first.',
  gone: 'This shared goal no longer exists.',
};

/** `kip:<code>` from the server, in the same words the mock's rules use. */
const SERVER_ERRORS: Record<string, string> = {
  'signed-out': 'Sign in to see your friends.',
  self: R.FRIEND_ERRORS.self,
  gone: 'This is no longer valid.',
  blocked: R.FRIEND_ERRORS.blocked,
  'already-friends': R.FRIEND_ERRORS['already-friends'],
  'already-requested': R.FRIEND_ERRORS['already-requested'],
  'daily-limit': R.FRIEND_ERRORS['daily-limit'],
  'not-yours': "That isn't yours to change.",
  'not-in-danger': R.GIVE_ERRORS['not-in-danger'],
  nobody: 'Pick at least one friend.',
  'not-connected': 'You can only do that with friends.',
  'no-freeze': R.GIVE_ERRORS['no-freeze'],
  'already-helped': R.GIVE_ERRORS['already-helped'],
  'rescue-limit': R.GIVE_ERRORS['rescue-limit'],
  cheers: `You've already sent them ${R.MAX_CHEERS_PER_DAY} cheers today. You can send more tomorrow.`,
  'cheer-kind': "That cheer isn't available.",
  'too-many-numbers': 'Too many numbers at once. Pick fewer contacts.',
  'not-sandbox': 'Only test accounts can do that.',
  amount: 'Enter an amount above 0.',
  'not-in': 'Join the goal first.',
};

/** A friend's saving days, drawn so rules.streakOf gives back the server's number exactly. */
export function picturedSaves(st: ServerStatus, today: DayKey): SaveEvent[] {
  const out: SaveEvent[] = [];
  const skip = st.danger?.day ?? null; // the day in danger holds the run without counting
  let day = st.saved_today ? today : addDays(today, -1);
  for (let i = 0; out.length < st.streak && i < 800; i++, day = addDays(day, -1)) {
    if (day === skip) continue;
    out.push({ day, at: new Date(`${day}T12:00:00`).toISOString() });
  }
  return out;
}

function noticeOf(n: ServerWorld['notices'][number], me: UserId, names: Record<string, string> = {}): Notice {
  const who = R.firstNameOf(n.actor_name || 'Someone');
  const [ref, pct] = (n.detail ?? '').split(':');
  const goal = names[ref] ? `«${names[ref]}»` : 'your shared goal';
  const friend = n.actor ? `/friends/${n.actor}` : '/friends';
  const cheer = R.CHEERS.find((c) => c.kind === n.detail)?.text ?? '';
  const words: Record<string, [string, string | null]> = {
    request: [`${who} wants to be friends.`, '/friends?tab=requests'],
    accepted: [`${who} accepted your request. You're friends now.`, friend],
    ask: [`${who}: Can you help me with a freeze?`, friend],
    gift: [R.rescuedLine({ name: who, gender: null }), '/friends'],
    gift_worked: [`${who} put money aside. Your freeze saved their streak.`, friend],
    gift_returned: ['Your 1-day Freeze came back to you, ready to use.', '/friends'],
    invite_joined: [`${who} joined with your link. Your 1-day Freeze is recharged.`, '/friends'],
    invited: [`You joined with ${who}'s link. You start with your 1-day Freeze.`, '/friends'],
    cheer: [`${who}: ${cheer}`, friend],
    colony_added: [`${who} added you to the colony ${names[ref] ? `«${names[ref]}»` : ''}.`.replace(' .', '.'), `/colonies/${ref}`],
    colony_invite: [`${who} invited you to a colony.`, '/friends?tab=requests'],
    shared_invite: [`${who} invited you to save for ${goal}.`, '/friends?tab=requests'],
    shared_joined: [`${who} joined ${goal}.`, `/shared-goal/${ref}`],
    shared_left: [`${who} left ${goal}. The shares were split again.`, `/shared-goal/${ref}`],
    shared_milestone: [`${goal.charAt(0).toUpperCase()}${goal.slice(1)} reached ${pct}%.`, `/shared-goal/${ref}`],
  };
  const [text, link] = words[n.kind] ?? ['Something new from your friends.', '/friends'];
  return { id: n.id, to: me, at: n.at, text, link, read: n.read };
}

/** The server's answer as the SocialWorld the screens read. Pure, so it can be tested on its own. */
export function projectWorld(sw: ServerWorld, me: MeSnapshot, local: LocalBits, found: Record<UserId, { name: string; phone: string }>, now: Date): SocialWorld {
  const today = toKey(now);
  const yesterday = addDays(today, -1);
  const id = me.id;
  const users: Record<UserId, SocialUser> = {};
  const saves: Record<UserId, SaveEvent[]> = { [id]: me.saves };
  const freezes: Record<UserId, FreezeState> = {};
  const dangers: Danger[] = sw.dangers.map((d) => ({ id: d.id, user: id, day: d.day, until: d.until, status: d.status }));
  const gifts: FreezeGift[] = sw.gifts.map((g) => ({ id: g.id, from: g.from, to: g.to, day: g.day, givenAt: g.given_at, status: g.status, resolvedAt: g.resolved_at }));
  const friendships: SocialWorld['friendships'] = [];
  const person = (uid: UserId, name: string | null, phone = '', joinedAt = ''): SocialUser => ({
    id: uid,
    name: name || 'Someone on Kip',
    gender: null,
    phone,
    discoverable: true,
    showProgress: false,
    goalProgress: 0,
    hue: hueOf(uid),
    joinedAt,
    inviteCode: '',
    invitedBy: null,
  });

  for (const [uid, f] of Object.entries(found)) users[uid] = person(uid, f.name, f.phone);
  users[id] = {
    ...person(id, sw.me?.name || me.name || 'You', sw.me?.phone || me.phone, sw.me?.created_at || me.createdAt),
    discoverable: sw.me?.discoverable ?? true,
    goalProgress: me.goalProgress,
    inviteCode: sw.me?.invite_code ?? '',
    invitedBy: sw.me?.invited_by ?? null,
  };
  const f = sw.freeze;
  freezes[id] = f
    ? { day: f.day_freeze ? 1 : 0, dayRechargeAt: f.day_recharge_at, week: f.week_freeze ? 1 : 0, weekMilestone: f.week_milestone, weekFrom: f.week_from, frozen: f.frozen, settledThrough: f.settled_through }
    : R.freshFreezes(today);

  for (const p of sw.people) {
    users[p.id] = person(p.id, p.name, found[p.id]?.phone ?? '', p.since ?? '');
    const st = p.status;
    if (!p.friend || !st) {
      // a pending request: a name only, nothing about their streak or freezes
      freezes[p.id] = { ...R.freshFreezes(today), day: 0 };
      continue;
    }
    friendships.push({ a: id, b: p.id, since: p.since ?? now.toISOString() });
    saves[p.id] = picturedSaves(st, today);
    freezes[p.id] = { day: st.has_day_freeze ? 1 : 0, dayRechargeAt: null, week: 0, weekMilestone: 0, weekFrom: st.week_from, frozen: st.frozen_today ? [{ day: today, by: 'day' }] : [], settledThrough: yesterday };
    if (st.danger) {
      dangers.push({ id: st.danger.id, user: p.id, day: st.danger.day, until: st.danger.until, status: 'open' });
      // someone else's freeze is waiting for them: they're helped, so nobody else is asked to
      if (st.gift_given_at && !gifts.some((g) => g.to === p.id && g.day === st.danger!.day && g.status === 'pending'))
        gifts.push({ id: `stub-${p.id}`, from: '', to: p.id, day: st.danger.day, givenAt: st.gift_given_at, status: 'pending', resolvedAt: null });
    }
  }

  // colonies and shared goals: the people in them (maybe not my friends) by name and streak only
  const g = sw.groups;
  for (const p of g?.people ?? []) {
    if (!users[p.id]) users[p.id] = person(p.id, p.name);
    if (!saves[p.id] && p.status) saves[p.id] = picturedSaves(p.status, today);
    freezes[p.id] ??= { ...R.freshFreezes(today), day: p.status?.has_day_freeze ? 1 : 0 };
  }
  const colonies: Colony[] = (g?.colonies ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    createdBy: c.created_by,
    createdAt: c.created_at,
    code: c.code,
    members: c.members.map((m) => ({ user: m.user, joinedOn: m.joined_on })),
    challenge: null,
  }));
  const sharedGoals: SharedGoal[] = (g?.shared_goals ?? []).map((x) => {
    const active = x.members.filter((m) => m.status === 'active');
    return {
      id: x.id,
      colony: x.colony ?? '',
      name: x.name,
      photo: null,
      icon: x.icon,
      target: x.target,
      date: x.date,
      createdBy: x.created_by,
      createdAt: x.created_at,
      participants: active.map((m) => ({ user: m.user, share: m.share })),
      invited: x.members.filter((m) => m.status === 'invited').map((m) => ({ user: m.user, by: m.invited_by })),
      // only my own amount is real here; the others' progress comes as percentages (live below)
      contributions: x.mine ? [{ id: `mine-${x.id}`, user: id, amount: x.mine, at: x.created_at, kind: 'deposit' as const }] : [],
      milestones: x.milestones ?? [],
      rebalance: x.rebalance,
      live: { totalPct: Number(x.total_pct) || 0, memberPct: Object.fromEntries(active.map((m) => [m.user, m.pct])) },
    };
  });
  const names: Record<string, string> = Object.fromEntries([...colonies.map((c) => [c.id, c.name]), ...sharedGoals.map((s) => [s.id, s.name])]);

  return {
    version: 1,
    me: id,
    seededOn: today,
    users,
    saves,
    freezes,
    dangers,
    asks: sw.asks.map((a) => ({ ...a })),
    gifts,
    requests: sw.requests.map((r) => ({ ...r })),
    friendships,
    blocks: sw.blocks.map((b) => ({ ...b })),
    colonies,
    colonyInvites: (g?.colony_invites ?? []).map((i) => ({ ...i })),
    sharedGoals,
    pockets: { [id]: g?.returned_bani ?? 0 },
    cheers: sw.cheers.map((c) => ({ ...c })),
    notices: sw.notices.map((n) => noticeOf(n, id, names)),
    witness: {},
    contactsAsked: local.contactsAsked,
    steady: [],
    seen: local.seen,
    legacyPaused: me.legacyPaused,
  };
}

const LOCAL_KEY = (id: string) => `kip.social.live.v1.${id}`;
const POLL_MS = 5_000;

export class SupabaseSocialRepo implements SocialRepo {
  readonly simulated = false;
  private me: MeSnapshot | null = null;
  private server: ServerWorld | null = null;
  private world: SocialWorld | null = null;
  private local: LocalBits = { seen: {}, contactsAsked: false };
  private found: Record<UserId, { name: string; phone: string }> = {};
  private listeners = new Set<() => void>();
  private extras: { world: SocialWorld; value: StreakExtras } | null = null;
  private channel: RealtimeChannel | null = null;
  private poll: number | null = null;
  private inflight: Promise<void> | null = null;
  private queued: Promise<void> | null = null;

  current() {
    return this.world;
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }

  /** Projects the last server answer again (new savings from the app, a new minute). */
  private project() {
    if (!this.me || !this.server) return;
    const next = projectWorld(this.server, this.me, this.local, this.found, new Date());
    if (this.world && JSON.stringify(next) === JSON.stringify(this.world)) return;
    this.world = next;
    this.emit();
  }

  private saveLocal() {
    if (!this.me) return;
    try {
      localStorage.setItem(LOCAL_KEY(this.me.id), JSON.stringify(this.local));
    } catch {
      /* private mode: the moments may play again next time */
    }
  }

  open(me: MeSnapshot) {
    const same = this.me?.id === me.id;
    if (!same) {
      this.close();
      try {
        const raw = localStorage.getItem(LOCAL_KEY(me.id));
        const l = raw ? (JSON.parse(raw) as Partial<LocalBits>) : {};
        this.local = { seen: l.seen ?? {}, contactsAsked: !!l.contactsAsked };
      } catch {
        this.local = { seen: {}, contactsAsked: false };
      }
      this.me = me;
      this.watch(me.id);
    } else this.me = me;
    this.project();
    void this.refresh();
  }

  /** Realtime: a new notice for me (a request, a gift, an ask) re-reads the world. Polling backs it up. */
  private watch(id: UserId) {
    this.channel = supabase
      .channel(`kip-social-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'social_notices', filter: `to_user=eq.${id}` }, () => void this.refresh())
      .subscribe();
    if (typeof window !== 'undefined')
      this.poll = window.setInterval(() => {
        if (typeof document === 'undefined' || document.visibilityState === 'visible') void this.refresh();
      }, POLL_MS);
  }

  close() {
    if (this.channel) void supabase.removeChannel(this.channel);
    if (this.poll !== null) window.clearInterval(this.poll);
    this.channel = null;
    this.poll = null;
    const had = !!this.world;
    this.me = null;
    this.server = null;
    this.world = null;
    this.found = {};
    if (had) this.emit();
  }

  /** One read at a time; a read asked for during one runs right after it, so it sees the change. */
  refresh(): Promise<void> {
    if (this.inflight) {
      this.queued ??= this.inflight.then(() => {
        this.queued = null;
        return this.refresh();
      });
      return this.queued;
    }
    this.inflight = this.load().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  private async load() {
    const id = this.me?.id;
    if (!id) return;
    const [{ data, error }, groups] = await Promise.all([supabase.rpc('social_world'), supabase.rpc('social_groups')]);
    if (this.me?.id !== id) return; // signed out or switched while it loaded
    if (error || !data) {
      console.warn('social_world failed', error?.message);
      return;
    }
    const sw = data as ServerWorld;
    if (sw.me && sw.me.id !== id) return;
    // a failed groups read keeps the last one, so colonies don't blink away
    sw.groups = groups.error ? this.server?.groups : (groups.data as ServerGroups);
    this.server = sw;
    this.project();
  }

  /** Calls an RPC; `kip:<code>` becomes a RuleError in plain words. The world is read again after. */
  private async call<T>(name: string, args: Record<string, unknown> = {}, words: Record<string, string> = {}): Promise<T> {
    if (!this.me) throw new R.RuleError('signed-out', SERVER_ERRORS['signed-out']);
    const { data, error } = await supabase.rpc(name, args);
    if (error) {
      const code = /kip:([a-z-]+)/.exec(error.message ?? '')?.[1];
      if (code) throw new R.RuleError(code, words[code] ?? SERVER_ERRORS[code] ?? "That didn't work. Try again.");
      throw new R.RuleError('network', "We couldn't reach the server. Check your internet and try again.");
    }
    await this.refresh();
    return data as T;
  }

  extrasFor(accountId: string): StreakExtras | null {
    const w = this.world;
    if (!w || w.me !== accountId) return null;
    if (this.extras?.world === w) return this.extras.value;
    const danger = R.activeDanger(w.dangers, w.gifts, w.me, new Date());
    const value: StreakExtras = { freezeDays: [...R.frozenDaySet(w.freezes[w.me])].sort(), hold: danger ? danger.danger.day : null };
    this.extras = { world: w, value };
    return value;
  }

  // ---------- friends ----------

  /** Only numbers go out; matches come back as id and first name, and only the matches are kept. */
  async matchContacts(phones: string[]): Promise<UserId[]> {
    const nums = [...new Set(phones.map((p) => R.normalizePhone(p)).filter((p): p is string => !!p))];
    if (!nums.length || !this.me) return [];
    type Match = { id: UserId; name: string | null };
    const ask = async (list: string[]) => {
      const { data, error } = await supabase.rpc('social_match_contacts', { p_phones: list });
      if (error) {
        const code = /kip:([a-z-]+)/.exec(error.message ?? '')?.[1];
        throw new R.RuleError(code ?? 'network', (code && SERVER_ERRORS[code]) || "We couldn't reach the server. Check your internet and try again.");
      }
      return (data ?? []) as Match[];
    };
    const ids: UserId[] = [];
    // a few picked contacts: one number each, so we know whose number matched (for the invite list)
    if (nums.length <= 40) {
      const out = await Promise.all(nums.map(async (n) => ({ n, m: await ask([n]) })));
      for (const { n, m } of out)
        for (const x of m) {
          this.found[x.id] = { name: x.name || 'Someone on Kip', phone: n };
          ids.push(x.id);
        }
    } else
      for (let i = 0; i < nums.length; i += 2000)
        for (const x of await ask(nums.slice(i, i + 2000))) {
          this.found[x.id] = { name: x.name || 'Someone on Kip', phone: '' };
          ids.push(x.id);
        }
    this.project();
    return [...new Set(ids)];
  }

  async findByPhone(raw: string) {
    const n = R.normalizePhone(raw);
    if (!n) return null;
    return (await this.matchContacts([n]))[0] ?? null;
  }

  markContactsAsked() {
    if (this.local.contactsAsked) return;
    this.local = { ...this.local, contactsAsked: true };
    this.saveLocal();
    this.project();
  }

  sendRequest(to: UserId) {
    return this.call<'requested' | 'friends'>('social_send_request', { p_to: to });
  }

  async accept(requestId: string) {
    await this.call('social_respond_request', { p_id: requestId, p_accept: true }, { gone: 'This request is no longer valid.' });
  }

  async decline(requestId: string) {
    await this.call('social_respond_request', { p_id: requestId, p_accept: false }, { gone: 'This request is no longer valid.' });
  }

  async cancel(requestId: string) {
    await this.call('social_cancel_request', { p_id: requestId }, { gone: 'This request is no longer valid.' });
  }

  async removeFriend(id: UserId) {
    await this.call('social_remove_friend', { p_other: id });
  }

  async block(id: UserId) {
    await this.call('social_block', { p_other: id });
  }

  async setDiscoverable(on: boolean) {
    await this.call('social_set_discoverable', { p_on: on });
  }

  setShowProgress(): Maybe<void> {
    return notLive();
  }

  // ---------- freezes ----------

  async askForFreeze(to: UserId[]) {
    await this.call('social_ask_freeze', { p_to: [...new Set(to)] }, { 'not-in-danger': "Your streak isn't in danger right now." });
  }

  async giveFreeze(to: UserId): Promise<FreezeGift> {
    const g = await this.call<{ id: string; from: UserId; to: UserId; day: DayKey; given_at: string; status: FreezeGift['status'] }>('social_give_freeze', { p_to: to }, { self: R.GIVE_ERRORS.self });
    return { id: g.id, from: g.from, to: g.to, day: g.day, givenAt: g.given_at, status: g.status, resolvedAt: null };
  }

  activateWeekFreeze(): Maybe<void> {
    throw new R.RuleError('not-live', 'The 1-week Freeze is not live yet.');
  }

  // ---------- colonies ----------

  async createColony(name: string, members: UserId[]): Promise<Colony> {
    const id = await this.call<string>('colony_create', { p_name: name, p_members: members }, R.COLONY_ERRORS);
    const c = this.world?.colonies.find((x) => x.id === id);
    if (!c) throw new R.RuleError('network', "We couldn't reach the server. Check your internet and try again.");
    return c;
  }

  async inviteToColony(colonyId: string, friend: UserId) {
    await this.call('colony_invite', { p_colony: colonyId, p_friend: friend }, { ...R.COLONY_ERRORS, gone: 'This colony no longer exists.' });
  }

  async joinColony(colonyId: string) {
    await this.call('colony_join', { p_colony: colonyId }, { ...R.COLONY_ERRORS, gone: 'This colony no longer exists.' });
  }

  async declineColonyInvite(colonyId: string) {
    await this.call('colony_decline', { p_colony: colonyId });
  }

  /** Shared goals don't hang on a colony, so leaving one moves no money. */
  async leaveColony(colonyId: string) {
    await this.call('colony_leave', { p_colony: colonyId });
    return { returned: 0 };
  }

  tickChallenge = notLive;
  setWitness = notLive;

  // ---------- shared goals ----------

  private goalOf(id: string): SharedGoal {
    const g = this.world?.sharedGoals.find((x) => x.id === id);
    if (!g) throw new R.RuleError('network', "We couldn't reach the server. Check your internet and try again.");
    return g;
  }

  async createSharedGoal(input: NewSharedGoal, friends: UserId[]): Promise<SharedGoal> {
    const id = await this.call<string>('shared_create', { p_name: input.name, p_icon: input.icon, p_target: input.target, p_date: input.date, p_friends: friends, p_colony: null }, SHARED_ERRORS);
    return this.goalOf(id);
  }

  /** From a colony: its other members are invited. */
  async proposeSharedGoal(colonyId: string, input: NewSharedGoal): Promise<SharedGoal> {
    const c = this.world?.colonies.find((x) => x.id === colonyId);
    const others = (c?.members ?? []).map((m) => m.user).filter((u) => u !== this.me?.id);
    const id = await this.call<string>('shared_create', { p_name: input.name, p_icon: input.icon, p_target: input.target, p_date: input.date, p_friends: others, p_colony: colonyId }, SHARED_ERRORS);
    return this.goalOf(id);
  }

  async inviteToSharedGoal(goalId: string, friends: UserId[]) {
    await this.call('shared_invite', { p_goal: goalId, p_friends: friends }, SHARED_ERRORS);
  }

  async joinSharedGoal(goalId: string) {
    await this.call('shared_respond', { p_goal: goalId, p_join: true }, SHARED_ERRORS);
  }

  async declineSharedGoal(goalId: string) {
    await this.call('shared_respond', { p_goal: goalId, p_join: false }, SHARED_ERRORS);
  }

  private async pay<T>(body: Record<string, unknown>): Promise<T> {
    try {
      return await callFn<T>('payments', body);
    } catch (e) {
      throw new R.RuleError('payments', e instanceof ApiError || e instanceof Error ? e.message : "That didn't work. Try again.");
    }
  }

  /**
   * Extra money for the goal, never taken from personal savings. A saved card is charged now; no
   * card opens Stripe Checkout. The six test accounts without a card use the sandbox RPC instead,
   * behind the same button.
   */
  async depositShared(goalId: string, amount: Bani): Promise<{ crossed: number[] }> {
    const sandbox = isTestNumber(this.me?.phone);
    const res = await this.pay<{ ok?: boolean; url?: string; no_card?: boolean }>({ action: 'shared_deposit', amount_bani: amount, shared_goal_id: goalId, ...(sandbox ? { card_only: true } : {}) });
    if (res.no_card) {
      const r = await this.call<{ crossed: number[] }>('social_sandbox_shared_deposit', { p_goal: goalId, p_amount_bani: amount }, SHARED_ERRORS);
      return { crossed: r?.crossed ?? [] };
    }
    if (res.url) {
      window.location.assign(res.url);
      return { crossed: [] };
    }
    // charged: the webhook confirms it in a moment, and the milestone plays when it lands
    await this.refresh();
    return { crossed: [] };
  }

  async withdrawShared(goalId: string, amount: Bani) {
    await this.pay({ action: 'shared_withdraw', amount_bani: amount, shared_goal_id: goalId });
    await this.refresh();
  }

  async leaveSharedGoal(goalId: string) {
    const returned = await this.call<number>('shared_leave', { p_goal: goalId }, SHARED_ERRORS);
    return { returned: Number(returned) || 0 };
  }

  async setSharedShare(goalId: string, share: Bani) {
    await this.call('shared_set_share', { p_goal: goalId, p_share: share }, SHARED_ERRORS);
  }

  async adjustSharedTarget(goalId: string, target: Bani) {
    await this.call('shared_adjust_target', { p_goal: goalId, p_target: target }, SHARED_ERRORS);
  }

  async redistributeShared(goalId: string) {
    await this.call('shared_redistribute', { p_goal: goalId }, SHARED_ERRORS);
  }

  // ---------- the rest ----------

  async cheer(to: UserId, kind: CheerKind) {
    await this.call('social_cheer', { p_to: to, p_kind: kind });
  }

  async redeemInvite(code: string) {
    return !!(await this.call<boolean>('social_redeem_invite', { p_code: code.trim() }));
  }

  markSeen(key: string) {
    if (this.local.seen[key]) return;
    this.local = { ...this.local, seen: { ...this.local.seen, [key]: true } };
    this.saveLocal();
    this.project();
  }

  async markNoticesRead() {
    if (!this.server?.notices.some((n) => !n.read)) return;
    await this.call('social_mark_notices_read');
  }
}
