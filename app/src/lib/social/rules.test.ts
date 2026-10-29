import { describe, expect, it } from 'vitest';
import { addDays } from '../dates';
import {
  acceptFriendRequest,
  activateWeekFreeze,
  activeDanger,
  areFriends,
  awardWeekFreeze,
  blockUser,
  canCheer,
  canGiveFreeze,
  checkCreateColony,
  checkFriendRequest,
  checkGiveFreeze,
  checkJoinColony,
  colonyStreak,
  contribute,
  dangerUntil,
  dayEnd,
  daysToNextWeekFreeze,
  equalShares,
  freshFreezes,
  frozenDaySet,
  giveFreeze,
  inviteFreezes,
  leaveColony,
  leaveSharedGoal,
  matchContacts,
  MAX_REQUESTS_PER_DAY,
  memberView,
  milestonesCrossed,
  normalizePhone,
  ownContribution,
  progressNotice,
  rechargeDayFreeze,
  redistributeShares,
  adjustTarget,
  rescuedLine,
  rescuesReceived,
  resolveGift,
  returnDayFreeze,
  saverLine,
  searchFriendRows,
  sendFriendRequest,
  settleMissedDays,
  sharedPct,
  sharedTotal,
  shareProgressPct,
  sortFriendRows,
  spendDayFreeze,
  streakOf,
  weekCoverage,
  withdrawOwn,
  setShare,
  RuleError,
} from './rules';
import type { Colony, Danger, FreezeGift, FreezeState, FriendGraph, FriendRowData, SaveEvent, SharedGoal, SocialUser } from './types';

const TODAY = '2026-10-29';
const at = (day: string, h = 12) => new Date(`${day}T${String(h).padStart(2, '0')}:00:00`);
const days = (from: string, n: number) => Array.from({ length: n }, (_, i) => addDays(from, i));
const saved = (list: string[]) => new Set(list);
const empty = (): FriendGraph => ({ requests: [], friendships: [], blocks: [] });

function user(id: string, phone: string, patch: Partial<SocialUser> = {}): SocialUser {
  return { id, name: id, gender: null, phone, discoverable: true, showProgress: false, goalProgress: 0.4, hue: 'cer', joinedAt: at(TODAY).toISOString(), inviteCode: id, invitedBy: null, ...patch };
}

describe('phone numbers', () => {
  it('normalises every way a Romanian number is written to the same E.164', () => {
    expect(normalizePhone('0722 123 456')).toBe('+40722123456');
    expect(normalizePhone('+40722123456')).toBe('+40722123456');
    expect(normalizePhone('0040 722 123 456')).toBe('+40722123456');
    expect(normalizePhone('(0722) 123-456')).toBe('+40722123456');
  });
  it('rejects things that are not phone numbers', () => {
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('12')).toBeNull();
    expect(normalizePhone('pizza')).toBeNull();
  });
});

describe('contact matching', () => {
  const users = [user('ana', '+40722000001'), user('mihai', '+40722000002'), user('hidden', '+40722000003', { discoverable: false }), user('me', '+40722000009')];
  it('returns only people with an account who can be found; the other numbers leave nothing behind', () => {
    const out = matchContacts(['0722 000 001', '0040 722 000 002', '0722 000 003', '0799 999 999', 'not a number'], users, 'me', []);
    expect(out.sort()).toEqual(['ana', 'mihai']);
    expect(out).not.toContain('hidden');
  });
  it('never matches you to yourself or across a block', () => {
    expect(matchContacts(['0722000009', '0722000001'], users, 'me', [{ by: 'ana', who: 'me', at: '' }])).toEqual([]);
  });
});

describe('friend requests', () => {
  const now = at(TODAY);
  it('a friendship exists only after the other person accepts', () => {
    const { graph, outcome } = sendFriendRequest(empty(), 'me', 'ana', now, 'r1');
    expect(outcome).toBe('requested');
    expect(areFriends(graph, 'me', 'ana')).toBe(false);
    expect(() => acceptFriendRequest(graph, 'r1', 'me', now)).toThrow(RuleError); // only Ana can accept
    const after = acceptFriendRequest(graph, 'r1', 'ana', now);
    expect(areFriends(after, 'me', 'ana')).toBe(true);
  });
  it('adding someone who already asked you makes you friends at once (both said yes)', () => {
    const asked = sendFriendRequest(empty(), 'mihai', 'me', now, 'r1').graph;
    const { graph, outcome } = sendFriendRequest(asked, 'me', 'mihai', now, 'r2');
    expect(outcome).toBe('friends');
    expect(areFriends(graph, 'me', 'mihai')).toBe(true);
  });
  it('has no cap on total friends', () => {
    let g = empty();
    for (let i = 0; i < 400; i++) g = { ...g, friendships: [...g.friendships, { a: 'me', b: `f${i}`, since: '' }] };
    expect(checkFriendRequest(g, 'me', 'one-more', now)).toBeNull();
  });
  it('limits outgoing requests to 50 a day, and the limit resets the next day', () => {
    let g = empty();
    for (let i = 0; i < MAX_REQUESTS_PER_DAY; i++) g = sendFriendRequest(g, 'me', `p${i}`, at(TODAY, 9), `r${i}`).graph;
    expect(checkFriendRequest(g, 'me', 'p50', at(TODAY, 20))).toBe('daily-limit');
    expect(() => sendFriendRequest(g, 'me', 'p50', at(TODAY, 20), 'x')).toThrow(/50 requests/);
    expect(checkFriendRequest(g, 'me', 'p50', at(addDays(TODAY, 1), 9))).toBeNull();
  });
  it('blocking ends the friendship and stops new requests both ways', () => {
    let g = acceptFriendRequest(sendFriendRequest(empty(), 'me', 'ana', now, 'r1').graph, 'r1', 'ana', now);
    g = blockUser(g, 'ana', 'me', now);
    expect(areFriends(g, 'me', 'ana')).toBe(false);
    expect(checkFriendRequest(g, 'me', 'ana', now)).toBe('blocked');
    expect(checkFriendRequest(g, 'ana', 'me', now)).toBe('blocked');
  });
});

describe('the friends list', () => {
  const row = (id: string, p: Partial<FriendRowData>): FriendRowData => ({ id, name: id, streak: 0, savedToday: false, inDanger: false, freezeActive: false, hasDayFreeze: false, lastActive: '2026-10-01T00:00:00.000Z', ...p });
  const rows = [
    row('Bianca', { streak: 40, lastActive: '2026-10-29T08:00:00.000Z' }),
    row('Ana', { streak: 21, inDanger: true, lastActive: '2026-10-27T08:00:00.000Z' }),
    row('Radu', { streak: 90, lastActive: '2026-10-28T08:00:00.000Z' }),
    row('Bogdan', { streak: 5, inDanger: true, lastActive: '2026-10-26T08:00:00.000Z' }),
    row('Elena', { streak: 12, lastActive: '2026-10-29T10:00:00.000Z' }),
  ];
  const names = (rs: FriendRowData[]) => rs.map((r) => r.name);
  it('pins friends in danger to the top, then applies the chosen order', () => {
    expect(names(sortFriendRows(rows, 'recent'))).toEqual(['Ana', 'Bogdan', 'Elena', 'Bianca', 'Radu']);
    expect(names(sortFriendRows(rows, 'name'))).toEqual(['Ana', 'Bogdan', 'Bianca', 'Elena', 'Radu']);
    expect(names(sortFriendRows(rows, 'streak'))).toEqual(['Ana', 'Bogdan', 'Radu', 'Bianca', 'Elena']);
  });
  it('searches by name, ignoring case and diacritics', () => {
    const rs = [row('Ștefan Ilie', {}), row('Ana Popescu', {})];
    expect(names(searchFriendRows(rs, 'stef'))).toEqual(['Ștefan Ilie']);
    expect(names(searchFriendRows(rs, 'POP'))).toEqual(['Ana Popescu']);
    expect(searchFriendRows(rs, '  ')).toHaveLength(2);
  });
});

describe('the 1-day Freeze', () => {
  it('never goes above 1', () => {
    const f = freshFreezes(TODAY);
    expect(f.day).toBe(1);
    expect(returnDayFreeze(f).day).toBe(1);
    expect(rechargeDayFreeze(f, at(addDays(TODAY, 30))).day).toBe(1);
    // a second one can't be spent from nothing
    expect(() => spendDayFreeze(spendDayFreeze(f, at(TODAY)), at(TODAY))).toThrow(RuleError);
  });
  it('recharges exactly 7 days after it was used, not a moment earlier (rolling, not on Mondays)', () => {
    const used = new Date('2026-10-31T10:00:00'); // a Saturday
    const f = spendDayFreeze(freshFreezes(TODAY), used);
    expect(f.day).toBe(0);
    expect(rechargeDayFreeze(f, new Date('2026-11-02T10:00:00')).day).toBe(0); // Monday: still away
    expect(rechargeDayFreeze(f, new Date(used.getTime() + 7 * 86_400_000 - 1)).day).toBe(0);
    expect(rechargeDayFreeze(f, new Date(used.getTime() + 7 * 86_400_000)).day).toBe(1);
  });
  it('is used automatically at the end of a missed day, and the streak is protected', () => {
    const run = days('2026-10-20', 7); // 20..26 saved
    const f = { ...freshFreezes('2026-10-20'), settledThrough: '2026-10-26' };
    // the 27th is missed; on the 29th the 27th and 28th get settled
    const s = saved([...run, '2026-10-28']);
    const out = settleMissedDays(f, s, TODAY);
    expect(out.used).toEqual(['2026-10-27']);
    expect(out.missed).toEqual([]);
    expect(out.freezes.day).toBe(0);
    expect(out.freezes.dayRechargeAt).toBe(new Date(dayEnd('2026-10-27').getTime() + 7 * 86_400_000).toISOString());
    // a frozen day neither adds to the streak nor breaks it
    expect(streakOf(s, frozenDaySet(out.freezes), TODAY)).toBe(8);
  });
  it('a missed day without a freeze goes into danger; nothing is used when there is no run to protect', () => {
    const f = { ...freshFreezes('2026-10-20'), day: 0 as const, dayRechargeAt: at('2026-11-05').toISOString(), settledThrough: '2026-10-26' };
    expect(settleMissedDays(f, saved(days('2026-10-20', 7)), TODAY).missed).toEqual(['2026-10-27']);
    const none = { ...freshFreezes('2026-10-20'), settledThrough: '2026-10-26' };
    expect(settleMissedDays(none, saved([]), TODAY).used).toEqual([]);
  });
});

describe('the 1-week Freeze', () => {
  const base = freshFreezes(TODAY);
  it('is earned at 45, 90 and 135 days in a row, and never more than one at a time', () => {
    expect(awardWeekFreeze(base, 44).week).toBe(0);
    const at45 = awardWeekFreeze(base, 45);
    expect(at45).toMatchObject({ week: 1, weekMilestone: 45 });
    expect(awardWeekFreeze(at45, 60)).toBe(at45); // no second one for the same 45
    const used = activateWeekFreeze(at45, TODAY);
    expect(awardWeekFreeze(used, 90)).toMatchObject({ week: 1, weekMilestone: 90 });
    expect(awardWeekFreeze({ ...used, weekMilestone: 90 }, 135)).toMatchObject({ week: 1, weekMilestone: 135 });
    expect(awardWeekFreeze(at45, 90).week).toBe(1); // still one, not two
    expect(daysToNextWeekFreeze(33)).toBe(12);
    expect(daysToNextWeekFreeze(45)).toBe(45);
  });
  it('frozen days do not count toward the 45', () => {
    // 40 saved days with 10 frozen days in between: the streak (and the count to 45) is 40
    const s = saved([...days('2026-08-01', 20), ...days('2026-08-31', 20)]);
    const frozen = new Set(days('2026-08-21', 10));
    const streak = streakOf(s, frozen, '2026-09-19');
    expect(streak).toBe(40);
    expect(awardWeekFreeze(base, streak).week).toBe(0);
  });
  it('covers exactly 7 days from the day it is switched on', () => {
    const on = activateWeekFreeze({ ...base, week: 1 }, TODAY);
    expect(weekCoverage(on.weekFrom)).toEqual(days(TODAY, 7));
    const covered = frozenDaySet(on);
    expect(covered.has(addDays(TODAY, 6))).toBe(true);
    expect(covered.has(addDays(TODAY, 7))).toBe(false);
    expect(covered.has(addDays(TODAY, -1))).toBe(false);
    expect(() => activateWeekFreeze(base, TODAY)).toThrow(RuleError);
  });
  it('cannot be given to a friend; only the 1-day one can', () => {
    expect(canGiveFreeze('week')).toBe(false);
    expect(canGiveFreeze('day')).toBe(true);
  });
});

describe('rescuing a friend', () => {
  const missed = '2026-10-28';
  const danger: Danger = { id: 'd1', user: 'ana', day: missed, until: dangerUntil(missed), status: 'open' };
  const now = at(TODAY, 10);
  const giverF = freshFreezes(TODAY);
  const args = { giver: 'me', receiver: 'ana', giverFreezes: giverF, dangers: [danger], gifts: [] as FreezeGift[], connected: true, now };
  const give = () => giveFreeze(giverF, { id: 'g1', from: 'me', to: 'ana', day: missed, givenAt: now.toISOString() }, now);

  it('the danger lasts the 24 hours after the missed day', () => {
    expect(activeDanger([danger], [], 'ana', at(TODAY, 23))).not.toBeNull();
    expect(activeDanger([danger], [], 'ana', at(addDays(TODAY, 1), 0))).toBeNull();
  });
  it('the giver loses their freeze and their 7-day recharge starts', () => {
    expect(checkGiveFreeze(args)).toBeNull();
    const { giver, gift } = give();
    expect(giver.day).toBe(0);
    expect(giver.dayRechargeAt).toBe(new Date(now.getTime() + 7 * 86_400_000).toISOString());
    expect(gift.status).toBe('pending');
  });
  it('works once the rescued person puts money aside within 24 hours', () => {
    const { gift } = give();
    const saves: SaveEvent[] = [{ day: TODAY, at: at(TODAY, 18).toISOString() }];
    expect(resolveGift(gift, saves, at(TODAY, 19))).toBe('active');
    expect(resolveGift(gift, [], at(TODAY, 19))).toBe('pending');
  });
  it('not used within 24 hours, it returns to the giver and the giver’s recharge is cancelled', () => {
    const { giver, gift } = give();
    const late = new Date(now.getTime() + 24 * 3_600_000 + 1);
    expect(resolveGift(gift, [{ day: addDays(TODAY, 1), at: late.toISOString() }], late)).toBe('returned');
    const back = returnDayFreeze(giver);
    expect(back).toMatchObject({ day: 1, dayRechargeAt: null });
  });
  it('someone can be saved by friends at most 2 times in 30 days', () => {
    const old = (id: string, daysAgo: number, status: FreezeGift['status'] = 'active'): FreezeGift => ({ id, from: 'x', to: 'ana', day: '', givenAt: new Date(now.getTime() - daysAgo * 86_400_000).toISOString(), status, resolvedAt: null });
    expect(checkGiveFreeze({ ...args, gifts: [old('a', 3), old('b', 20)] })).toBe('rescue-limit');
    expect(rescuesReceived([old('a', 3), old('b', 31)], 'ana', now)).toBe(1);
    expect(rescuesReceived([old('a', 3), old('b', 5, 'returned')], 'ana', now)).toBe(1);
    expect(checkGiveFreeze({ ...args, gifts: [old('a', 3), old('b', 31)] })).toBeNull();
  });
  it('needs a freeze, someone in danger and a connection', () => {
    expect(checkGiveFreeze({ ...args, giverFreezes: { ...giverF, day: 0, dayRechargeAt: at(addDays(TODAY, 3)).toISOString() } })).toBe('no-freeze');
    expect(checkGiveFreeze({ ...args, dangers: [] })).toBe('not-in-danger');
    expect(checkGiveFreeze({ ...args, connected: false })).toBe('not-connected');
    expect(checkGiveFreeze({ ...args, receiver: 'me' })).toBe('self');
  });
  it('says it in English, with the right pronoun', () => {
    expect(rescuedLine({ name: 'Mihai Ionescu', gender: 'm' })).toBe('Mihai gave you his freeze');
    expect(saverLine({ name: 'Ana Popescu', gender: 'f' })).toBe('You saved Ana!');
    expect(saverLine({ name: 'Mihai', gender: 'm' })).toBe('You saved Mihai!');
    expect(rescuedLine({ name: 'Ana Popescu', gender: 'f' })).toBe('Ana gave you her freeze');
    expect(rescuedLine({ name: 'Sam', gender: null })).toBe('Sam gave you their freeze');
  });
});

describe('colonies', () => {
  const friends: FriendGraph = { requests: [], blocks: [], friendships: ['a', 'b', 'c', 'd', 'e'].map((b) => ({ a: 'me', b, since: '' })) };
  const colony = (id: string, members: string[]): Colony => ({ id, name: id, createdBy: members[0], createdAt: '', code: id, challenge: null, members: members.map((user) => ({ user, joinedOn: '2026-10-01' })) });

  it('has 2 to 5 members, all accepted friends of whoever makes it', () => {
    expect(checkCreateColony(friends, [], 'me', ['a'], 'Foculețul')).toBeNull();
    expect(checkCreateColony(friends, [], 'me', [], 'Foculețul')).toBe('size');
    expect(checkCreateColony(friends, [], 'me', ['a', 'b', 'c', 'd', 'e'], 'Foculețul')).toBe('size');
    expect(checkCreateColony(friends, [], 'me', ['stranger'], 'Foculețul')).toBe('not-friends');
  });
  it('lets a person be in at most 3 colonies', () => {
    const three = [colony('x', ['a', 'z']), colony('y', ['a', 'z']), colony('w', ['a', 'z'])];
    expect(checkCreateColony(friends, three, 'me', ['a'], 'Another')).toBe('too-many');
    expect(checkJoinColony(friends, three, colony('n', ['me']), 'a', 'me')).toBe('too-many');
  });
  it('lets anyone leave', () => {
    expect(leaveColony(colony('x', ['me', 'a']), 'me').members.map((m) => m.user)).toEqual(['a']);
  });
  it('counts a day only when everyone saved, and a frozen member counts as present', () => {
    const members = ['me', 'ana', 'mihai'].map((user) => ({ user, joinedOn: '2026-10-20' }));
    const run = days('2026-10-20', 9); // 20..28
    const md = (s: string[], frozen: string[] = [], danger: string | null = null) => ({ saved: saved(s), frozen: new Set(frozen), danger });
    // Ana missed the 28th but a freeze covers it: the colony keeps going
    const covered = colonyStreak(members, { me: md(run), ana: md(run.filter((d) => d !== '2026-10-28'), ['2026-10-28']), mihai: md(run) }, TODAY);
    expect(covered).toMatchObject({ streak: 9, todayComplete: false, atRisk: [] });
    expect(covered.waiting.sort()).toEqual(['ana', 'me', 'mihai']);
    // without the freeze, while she's in danger, the run waits for her
    const held = colonyStreak(members, { me: md(run), ana: md(run.filter((d) => d !== '2026-10-28'), [], '2026-10-28'), mihai: md(run) }, TODAY);
    expect(held).toMatchObject({ streak: 8, atRisk: ['ana'] });
    // and once the 24 hours pass, it breaks
    expect(colonyStreak(members, { me: md(run), ana: md(run.filter((d) => d !== '2026-10-28')), mihai: md(run) }, TODAY).streak).toBe(0);
  });
  it('shows members no amounts, and progress only to those who switched it on', () => {
    const u = user('ana', '+40722000001', { goalProgress: 0.537 });
    expect(memberView(u, 21, true)).toEqual({ id: 'ana', name: 'ana', streak: 21, savedToday: true, progressPct: null });
    expect(memberView({ ...u, showProgress: true }, 21, true).progressPct).toBe(54);
  });
});

describe('shared goals', () => {
  const goal: SharedGoal = {
    id: 'vv',
    colony: 'c',
    name: 'Vama Veche',
    photo: null,
    icon: 'beach',
    target: 2000_00,
    date: '2027-07-15',
    createdBy: 'ioana',
    createdAt: '',
    participants: ['ioana', 'ana', 'mihai', 'me'].map((user) => ({ user, share: 500_00 })),
    contributions: [
      { id: 'c1', user: 'ioana', amount: 400_00, at: '', kind: 'deposit' },
      { id: 'c2', user: 'ana', amount: 260_00, at: '', kind: 'deposit' },
      { id: 'c3', user: 'mihai', amount: 260_00, at: '', kind: 'deposit' },
    ],
    milestones: [25],
    rebalance: false,
  };
  const now = at(TODAY);

  it('splits the target equally by default, to the ban', () => {
    expect(equalShares(2000_00, 4)).toEqual([500_00, 500_00, 500_00, 500_00]);
    expect(equalShares(1000, 3)).toEqual([334, 333, 333]);
  });
  it('progress is the sum of everyone’s own contributions', () => {
    expect(sharedTotal(goal)).toBe(920_00);
    expect(sharedPct(goal)).toBe(46);
    expect(shareProgressPct(goal, 'ioana')).toBe(80);
  });
  it('a deposit that passes 50% celebrates 50% once', () => {
    const after = contribute(goal, 'me', 100_00, now, 'c4');
    expect(sharedPct(after)).toBe(51);
    expect(milestonesCrossed(sharedPct(goal), sharedPct(after), goal.milestones)).toEqual([50]);
    expect(milestonesCrossed(sharedPct(goal), sharedPct(after), [25, 50])).toEqual([]);
  });
  it('a share can be changed; the rest of the target is split between the others', () => {
    const g = setShare(goal, 'me', 800_00);
    expect(g.participants.map((p) => [p.user, p.share])).toEqual([
      ['ioana', 400_00],
      ['ana', 400_00],
      ['mihai', 400_00],
      ['me', 800_00],
    ]);
    expect(() => setShare(goal, 'me', 3000_00)).toThrow(RuleError);
  });
  it('withdrawals only ever touch your own contributions', () => {
    expect(() => withdrawOwn(goal, 'me', 1_00, now, 'w')).toThrow(/only withdraw money you put in/);
    expect(() => withdrawOwn(goal, 'ana', 300_00, now, 'w')).toThrow(RuleError);
    const after = withdrawOwn(goal, 'ana', 60_00, now, 'w');
    expect(ownContribution(after, 'ana')).toBe(200_00);
    expect(ownContribution(after, 'ioana')).toBe(400_00);
    expect(ownContribution(after, 'mihai')).toBe(260_00);
    expect(progressNotice(after)).toBe('The goal «Vama Veche» reached 43%.');
  });
  it('leaving returns your contributions to your own pocket; the others choose what happens next', () => {
    const { goal: left, returned } = leaveSharedGoal(goal, 'ana');
    expect(returned).toBe(260_00);
    expect(left.participants.map((p) => p.user)).toEqual(['ioana', 'mihai', 'me']);
    expect(sharedTotal(left)).toBe(660_00);
    expect(redistributeShares(left).participants.map((p) => p.share)).toEqual([66_667, 66_667, 66_666]);
    expect(adjustTarget(left, 1500_00).participants.map((p) => p.share)).toEqual([500_00, 500_00, 500_00]);
  });
});

describe('cheers and invites', () => {
  it('allows 3 cheers a day to the same friend', () => {
    const c = (i: number) => ({ id: `c${i}`, from: 'me', to: 'ana', kind: 'bravo' as const, at: at(TODAY, 8 + i).toISOString() });
    expect(canCheer([c(0), c(1)], 'me', 'ana', TODAY)).toBe(true);
    expect(canCheer([c(0), c(1), c(2)], 'me', 'ana', TODAY)).toBe(false);
    expect(canCheer([c(0), c(1), c(2)], 'me', 'ana', addDays(TODAY, 1))).toBe(true);
    expect(canCheer([c(0), c(1), c(2)], 'me', 'mihai', TODAY)).toBe(true);
  });
  it('an invite recharges the inviter\'s 1-day Freeze at once and gives the new person theirs; no streak days', () => {
    const spent = { ...freshFreezes(TODAY), day: 0 as const, dayRechargeAt: at(addDays(TODAY, 5), 9).toISOString() };
    const out = inviteFreezes(spent, { ...freshFreezes(TODAY), day: 0 });
    expect(out.inviter).toMatchObject({ day: 1, dayRechargeAt: null });
    expect(out.invitee).toMatchObject({ day: 1, dayRechargeAt: null });
    // already had one: still exactly one
    expect(inviteFreezes(freshFreezes(TODAY), freshFreezes(TODAY)).inviter.day).toBe(1);
  });
});

it('freezes are typed as never more than one', () => {
  const f: FreezeState = freshFreezes(TODAY);
  // @ts-expect-error a second 1-day Freeze is not a value the type allows
  const two: FreezeState = { ...f, day: 2 };
  expect(two.day).toBe(2);
});
