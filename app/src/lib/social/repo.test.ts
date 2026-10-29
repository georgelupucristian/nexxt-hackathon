import { describe, expect, it } from 'vitest';
import { addDays, toKey } from '../dates';
import { DEMO_ADDRESS_BOOK } from './contacts';
import { advance, MockSocialRepo, type MeSnapshot } from './repo';
import { daysToNextWeekFreeze, sharedPct, spendDayFreeze } from './rules';
import { SEED_COLONY, SEED_GOAL, SEED_IDS, seedWorld } from './seed';
import { projectWorld, type ServerWorld } from './supabaseRepo';
import { asksFor, colonyDetail, friendRows, statusOf } from './view';

/** localStorage stand-in */
class Memory implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const NOW = new Date('2026-10-29T11:00:00');
const me = (patch: Partial<MeSnapshot> = {}): MeSnapshot => ({ id: 'u_me', name: 'Alex', phone: '+40712345678', createdAt: NOW.toISOString(), saves: [], legacyPaused: [], goalProgress: 0.1, ...patch });

function setup() {
  let now = NOW;
  const storage = new Memory();
  const repo = new MockSocialRepo(storage, () => now);
  repo.open(me());
  return { repo, storage, tick: (ms: number) => (now = new Date(now.getTime() + ms)), now: () => now };
}

describe('the demo script, on the mock repo', () => {
  it('walks steps 1 to 7', () => {
    const { repo, now } = setup();
    const w = () => repo.current()!;

    // 1. the address book finds the 5 people who use Kip; Ana and Mihai asked first, so adding them makes friends at once
    const found = repo.matchContacts(DEMO_ADDRESS_BOOK.flatMap((c) => c.phones));
    expect(found.sort()).toEqual([SEED_IDS.ana, SEED_IDS.elena, SEED_IDS.ioana, SEED_IDS.mihai, SEED_IDS.radu].sort());
    expect(repo.sendRequest(SEED_IDS.ana)).toBe('friends');
    expect(repo.sendRequest(SEED_IDS.mihai)).toBe('friends');

    // 2. 30 friends, Ana pinned on top in danger (and Bogdan with her)
    const rows = friendRows(w(), 'u_me', now());
    expect(rows).toHaveLength(30);
    expect(rows.filter((r) => r.inDanger).map((r) => r.id).sort()).toEqual([SEED_IDS.ana, SEED_IDS.bogdan].sort());
    expect(rows.slice(0, 2).every((r) => r.inDanger)).toBe(true);

    // 3. Ana's ask reaches me
    expect(asksFor(w(), 'u_me', now()).map((a) => a.from)).toEqual([SEED_IDS.ana]);
    const colonyBefore = colonyDetail(w(), SEED_COLONY, 'u_me', now())!;
    expect(colonyBefore.atRisk).toEqual([SEED_IDS.ana]);

    // 4. I give her my 1-day Freeze: 1 -> 0, back in 7 days
    expect(statusOf(w(), 'u_me', now()).freezes.day).toBe(1);
    repo.giveFreeze(SEED_IDS.ana);
    const mine = statusOf(w(), 'u_me', now());
    expect(mine.freezes.day).toBe(0);
    expect(mine.rechargeIn).toBe(7);
    expect(asksFor(w(), 'u_me', now())).toEqual([]);

    // 5. simulated Ana puts money aside right away: the freeze works, the colony keeps its streak
    const ana = statusOf(w(), SEED_IDS.ana, now());
    expect(ana.danger).toBeNull();
    expect(ana.frozen.has(addDays(toKey(now()), -1))).toBe(true);
    expect(w().gifts[0].status).toBe('active');
    const colonyAfter = colonyDetail(w(), SEED_COLONY, 'u_me', now())!;
    expect(colonyAfter.atRisk).toEqual([]);
    expect(colonyAfter.streak).toBe(colonyBefore.streak + 1);

    // 6. my deposit takes "Vama Veche" past 50%
    const goal = () => w().sharedGoals.find((g) => g.id === SEED_GOAL)!;
    expect(sharedPct(goal())).toBe(46);
    expect(repo.depositShared(SEED_GOAL, 100_00).crossed).toEqual([50]);
    expect(sharedPct(goal())).toBe(51);

    // 7. the count to the next 1-week Freeze follows my own streak
    expect(daysToNextWeekFreeze(statusOf(w(), 'u_me', now()).streak)).toBe(45);
  });

  it('a freeze nobody used goes back to the giver after 24 hours, recharge cancelled', () => {
    const w0 = seedWorld(me(), NOW);
    const gift = { id: 'g1', from: 'u_me', to: SEED_IDS.bogdan, day: addDays(toKey(NOW), -1), givenAt: NOW.toISOString(), status: 'pending' as const, resolvedAt: null };
    const w = advance({ ...w0, gifts: [gift], freezes: { ...w0.freezes, u_me: spendDayFreeze(w0.freezes.u_me, NOW) } }, new Date(NOW.getTime() + 25 * 3_600_000));
    expect(w.gifts[0].status).toBe('returned');
    expect(w.freezes.u_me).toMatchObject({ day: 1, dayRechargeAt: null });
  });

  it('uses my own 1-day Freeze when I miss a day, and the app gets the frozen day', () => {
    const { repo, tick } = setup();
    const today = toKey(NOW);
    // I saved yesterday and today, then skip tomorrow
    const saves = [addDays(today, -1), today].map((day) => ({ day, at: new Date(`${day}T10:00:00`).toISOString() }));
    repo.open(me({ saves }));
    tick(2 * 86_400_000);
    repo.open(me({ saves }));
    const extras = repo.extrasFor('u_me')!;
    expect(extras.freezeDays).toContain(addDays(today, 1));
    expect(repo.current()!.freezes.u_me.day).toBe(0);
  });

  it('45 days in a row earn me a 1-week Freeze; one button switches it on, and a gift never touches it', () => {
    const { repo, now } = setup();
    const today = toKey(NOW);
    const saves = Array.from({ length: 45 }, (_, i) => addDays(today, -i)).map((day) => ({ day, at: new Date(`${day}T10:00:00`).toISOString() }));
    repo.open(me({ saves }));
    expect(repo.current()!.freezes.u_me.week).toBe(1);
    repo.activateWeekFreeze();
    expect(repo.current()!.freezes.u_me).toMatchObject({ week: 0, weekFrom: today });
    repo.sendRequest(SEED_IDS.ana);
    repo.giveFreeze(SEED_IDS.ana);
    expect(repo.current()!.freezes.u_me).toMatchObject({ day: 0, week: 0, weekFrom: today });
    expect(statusOf(repo.current()!, 'u_me', now()).freezeActive).toBe(true);
  });

  it('an invite link: I start with my 1-day Freeze, the inviter\'s recharges, no streak days', () => {
    const { repo } = setup();
    const ana = repo.current()!.users[SEED_IDS.ana];
    expect(repo.redeemInvite(ana.inviteCode)).toBe(true);
    const w = repo.current()!;
    expect(w.freezes[SEED_IDS.ana]).toMatchObject({ day: 1, dayRechargeAt: null });
    expect(w.freezes.u_me.day).toBe(1);
    expect(statusOf(w, 'u_me', NOW).streak).toBe(0);
  });

  it('keeps each world to its own account and survives a reload', () => {
    const { repo, storage } = setup();
    repo.sendRequest('u_sara');
    const again = new MockSocialRepo(storage, () => NOW);
    again.open(me());
    expect(again.current()!.friendships.some((f) => f.b === 'u_sara' || f.a === 'u_sara')).toBe(true);
    again.open(me({ id: 'u_other' }));
    expect(again.current()!.me).toBe('u_other');
    expect(again.current()!.friendships.some((f) => (f.a === 'u_other' && f.b === 'u_sara') || (f.b === 'u_other' && f.a === 'u_sara'))).toBe(false);
  });
});

describe('the live world, projected', () => {
  const st = (patch: Partial<ServerWorld['people'][number]['status'] & object> = {}) => ({ streak: 5, saved_today: false, frozen_today: false, has_day_freeze: true, week_running: false, week_from: null, danger: null, gift_given_at: null, ...patch });
  const server = (people: ServerWorld['people']): ServerWorld => ({
    today: toKey(NOW),
    me: { id: 'u_me', name: 'Alex', phone: '+40712345678', discoverable: true, invite_code: 'ALEX1', invited_by: null, created_at: NOW.toISOString() },
    freeze: null,
    status: null,
    people,
    requests: [],
    blocks: [],
    dangers: [],
    asks: [],
    gifts: [],
    cheers: [],
    notices: [{ id: 'n1', kind: 'invite_joined', actor: 'f1', actor_name: 'Ana', detail: null, read: false, at: NOW.toISOString() }],
  });
  it("draws each friend's days so the streak is the server's number, through a day in danger", () => {
    const y = addDays(toKey(NOW), -1);
    const until = new Date(NOW.getTime() + 10 * 3_600_000).toISOString();
    const w = projectWorld(
      server([
        { id: 'f1', name: 'Ana', friend: true, since: NOW.toISOString(), status: st({ streak: 7, saved_today: true }) },
        { id: 'f2', name: 'Mihai', friend: true, since: NOW.toISOString(), status: st({ streak: 4, has_day_freeze: false, danger: { id: 'd2', day: y, until } }) },
        { id: 'f3', name: 'Ioana', friend: true, since: NOW.toISOString(), status: st({ streak: 3, danger: { id: 'd3', day: y, until }, gift_given_at: NOW.toISOString() }) },
        { id: 'p1', name: 'Sara', friend: false },
      ]),
      me(),
      { seen: {}, contactsAsked: false },
      {},
      NOW,
    );
    expect(statusOf(w, 'f1', NOW)).toMatchObject({ streak: 7, savedToday: true });
    const rows = friendRows(w, 'u_me', NOW);
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === 'f2')).toMatchObject({ streak: 4, inDanger: true, hasDayFreeze: false });
    // someone's freeze is already waiting for Ioana: not "in danger" any more
    expect(rows.find((r) => r.id === 'f3')).toMatchObject({ streak: 3, inDanger: false });
    expect(w.colonies).toEqual([]);
    expect(w.sharedGoals).toEqual([]);
    expect(w.notices[0].text).toBe('Ana joined with your link. Your 1-day Freeze is recharged.');
  });
});
