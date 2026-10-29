// The demo world every account starts with (the demo-data account and a fresh phone
// sign-up alike), anchored on the day it's made so the story is always "now":
// - 28 accepted friends; Ana and Mihai aren't friends yet: they're found in the contacts during
//   onboarding (or from Friends → Invite). Both already asked from the colony, so adding them makes
//   you friends at once. That's 30 friends, 2 of them in danger.
// - the colony "Foculețul": Ioana (who made it), Ana, Mihai and you.
// - the shared goal "Vama Veche": 2,000 lei, next July, at 46%.
// - Ana missed yesterday, has no 1-day Freeze (it went 3 days ago) and asked her colony for one.
// Nobody here is real and no money here is real.
import { addDays, startOfWeek, toKey } from '../dates';
import { equalShares, freshFreezes, dangerUntil, dayEnd, RECHARGE_DAYS, DAY_MS } from './rules';
import type { AvatarHue, Colony, DayKey, FreezeState, Iso, SaveEvent, SharedGoal, SocialUser, SocialWorld, UserId } from './types';

export interface MeInfo {
  id: UserId;
  name: string;
  phone: string;
  createdAt: Iso;
}

/** The people in the demo address book who already use Kip, and their numbers as stored there. */
export const CONTACT_FRIENDS = {
  ana: { name: 'Ana Popescu', gender: 'f', phone: '+40722111001' },
  mihai: { name: 'Mihai Ionescu', gender: 'm', phone: '+40722111002' },
  ioana: { name: 'Ioana Marin', gender: 'f', phone: '+40722111003' },
  radu: { name: 'Radu Stan', gender: 'm', phone: '+40722111004' },
  elena: { name: 'Elena Dobre', gender: 'f', phone: '+40722111005' },
} as const;

export const SEED_IDS = { ana: 'u_ana', mihai: 'u_mihai', ioana: 'u_ioana', radu: 'u_radu', elena: 'u_elena', bogdan: 'u_bogdan' } as const;
export const SEED_COLONY = 'c_foculetul';
export const SEED_GOAL = 'sg_vama';

const HUES: AvatarHue[] = ['cer', 'menta', 'coral', 'soare', 'liliac', 'trandafir'];

/** The other 25 friends: name, gender, run length, saved today, has a 1-day Freeze, hours since active. */
const OTHERS: [string, 'f' | 'm', number, boolean, boolean, number][] = [
  ['Andrei Pavel', 'm', 18, true, true, 2],
  ['Bianca Tudor', 'f', 40, true, true, 5],
  ['Bogdan Rusu', 'm', 9, false, false, 30], // the second friend in danger (see below)
  ['Carmen Lazăr', 'f', 4, false, true, 20],
  ['Cristina Matei', 'f', 27, true, false, 1],
  ['Daria Neagu', 'f', 63, true, true, 3],
  ['Eduard Ilie', 'm', 2, false, true, 26],
  ['Florin Badea', 'm', 14, true, true, 7],
  ['Gabriela Ene', 'f', 31, false, true, 15],
  ['Horia Munteanu', 'm', 0, false, true, 70],
  ['Irina Constantin', 'f', 52, true, false, 4],
  ['Larisa Moldovan', 'f', 7, true, true, 9],
  ['Matei Dumitru', 'm', 120, true, true, 6],
  ['Nicoleta Barbu', 'f', 11, false, true, 22],
  ['Octavian Preda', 'm', 3, true, true, 11],
  ['Paula Sârbu', 'f', 22, true, true, 8],
  ['Raluca Ciobanu', 'f', 46, false, false, 18],
  ['Sorin Voicu', 'm', 5, true, true, 13],
  ['Ștefan Ilie', 'm', 88, true, true, 2],
  ['Teodora Pop', 'f', 16, false, true, 25],
  ['Tudor Manole', 'm', 34, true, false, 10],
  ['Vlad Antonescu', 'm', 1, true, true, 12],
  ['Alexandra Chiriac', 'f', 75, true, true, 1],
  ['Denisa Florea', 'f', 20, false, true, 19],
  ['Georgiana Nistor', 'f', 9, true, true, 14],
];

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');

/** A saving on each of the given days, in the early evening (local time). */
const savesOn = (days: DayKey[], hour = 18): SaveEvent[] => days.map((day) => ({ day, at: new Date(`${day}T${String(hour).padStart(2, '0')}:15:00`).toISOString() }));
/** `n` days in a row ending on `last` */
const run = (last: DayKey, n: number): DayKey[] => Array.from({ length: n }, (_, i) => addDays(last, -(n - 1 - i)));

export function seedWorld(me: MeInfo, now: Date): SocialWorld {
  const today = toKey(now);
  const yesterday = addDays(today, -1);
  const iso = (d: Date) => d.toISOString();
  const hoursAgo = (h: number) => iso(new Date(now.getTime() - h * 3_600_000));
  const users: Record<UserId, SocialUser> = {};
  const saves: Record<UserId, SaveEvent[]> = {};
  const freezes: Record<UserId, FreezeState> = {};
  const steady: UserId[] = [];
  let hue = 0;
  const person = (id: UserId, name: string, gender: 'f' | 'm', phone: string, patch: Partial<SocialUser> = {}) => {
    users[id] = {
      id,
      name,
      gender,
      phone,
      discoverable: true,
      showProgress: false,
      goalProgress: 0,
      hue: HUES[hue++ % HUES.length],
      joinedAt: iso(new Date(now.getTime() - 120 * DAY_MS)),
      inviteCode: slug(name).split('_')[0].toUpperCase().slice(0, 5) + String(1000 + hue * 37).slice(-3),
      invitedBy: null,
      ...patch,
    };
  };
  const fresh = (patch: Partial<FreezeState> = {}): FreezeState => ({ ...freshFreezes(today), ...patch });
  /** the 1-day Freeze went at the end of `day`: back 7 days after that */
  const usedOn = (day: DayKey): Partial<FreezeState> => ({ day: 0, dayRechargeAt: iso(new Date(dayEnd(day).getTime() + RECHARGE_DAYS * DAY_MS)) });

  // ---- you ----
  users[me.id] = {
    id: me.id,
    name: me.name || 'Tu',
    gender: null,
    phone: me.phone,
    discoverable: true,
    showProgress: false,
    goalProgress: 0,
    hue: 'cer',
    joinedAt: me.createdAt,
    inviteCode: 'KIP' + me.id.replace(/[^a-z0-9]/gi, '').slice(-5).toUpperCase(),
    invitedBy: null,
  };
  saves[me.id] = [];
  freezes[me.id] = fresh();

  // ---- the five from the address book ----
  const c = CONTACT_FRIENDS;
  // Ana: 22 days, her 1-day Freeze covered 3 days ago, saved the day before yesterday, missed yesterday
  person(SEED_IDS.ana, c.ana.name, 'f', c.ana.phone, { goalProgress: 0.38, showProgress: true });
  saves[SEED_IDS.ana] = savesOn([...run(addDays(today, -4), 22), addDays(today, -2)], 19);
  freezes[SEED_IDS.ana] = fresh({ ...usedOn(addDays(today, -3)), frozen: [{ day: addDays(today, -3), by: 'day' }] });
  // Mihai: 33 days, saved this morning, has his 1-day Freeze
  person(SEED_IDS.mihai, c.mihai.name, 'm', c.mihai.phone, { goalProgress: 0.61, showProgress: true });
  saves[SEED_IDS.mihai] = savesOn([...run(yesterday, 32), today], 9);
  freezes[SEED_IDS.mihai] = fresh();
  steady.push(SEED_IDS.mihai);
  // Ioana: 61 days, made the colony; her 1-day Freeze is ready and a 1-week one is waiting
  person(SEED_IDS.ioana, c.ioana.name, 'f', c.ioana.phone, { goalProgress: 0.72 });
  saves[SEED_IDS.ioana] = savesOn([...run(yesterday, 60), today], 8);
  freezes[SEED_IDS.ioana] = fresh({ week: 1, weekMilestone: 45 });
  steady.push(SEED_IDS.ioana);
  // Radu: 50 days, then a 1-week Freeze switched on 2 days ago (Freeze activ)
  person(SEED_IDS.radu, c.radu.name, 'm', c.radu.phone, { goalProgress: 0.2 });
  saves[SEED_IDS.radu] = savesOn(run(addDays(today, -3), 50), 20);
  freezes[SEED_IDS.radu] = fresh({ weekMilestone: 45, weekFrom: addDays(today, -2) });
  // Elena: 12 days, nothing yet today
  person(SEED_IDS.elena, c.elena.name, 'f', c.elena.phone, { goalProgress: 0.45 });
  saves[SEED_IDS.elena] = savesOn(run(yesterday, 12), 21);
  freezes[SEED_IDS.elena] = fresh();
  steady.push(SEED_IDS.elena);

  // ---- 25 more friends ----
  const otherIds: UserId[] = [];
  OTHERS.forEach(([name, gender, streak, savedToday, hasFreeze, activeHoursAgo], i) => {
    const id = name.startsWith('Bogdan') ? SEED_IDS.bogdan : `u_${slug(name)}`;
    otherIds.push(id);
    person(id, name, gender, `+407230${String(10000 + i * 7).slice(-5)}`, { goalProgress: ((i * 37) % 90) / 100 + 0.05, discoverable: i % 6 !== 4 });
    if (id === SEED_IDS.bogdan) {
      // missed yesterday too, and his 1-day Freeze went 5 days ago
      saves[id] = savesOn(run(addDays(today, -2), streak), 17);
      freezes[id] = fresh(usedOn(addDays(today, -5)));
      return;
    }
    const last = streak === 0 ? addDays(today, -4) : yesterday;
    const days = streak === 0 ? run(last, 6) : run(last, streak);
    saves[id] = savesOn(savedToday && streak > 0 ? [...days, today] : days, 7 + (i % 14));
    // the "hours since active" for the list order: their latest saving
    const lastSave = saves[id][saves[id].length - 1];
    if (lastSave && savedToday) lastSave.at = hoursAgo(Math.min(activeHoursAgo, Math.max(0, now.getHours() - 1)));
    freezes[id] = hasFreeze ? fresh({ weekMilestone: Math.floor(streak / 45) * 45 }) : fresh({ ...usedOn(addDays(today, -2)), weekMilestone: Math.floor(streak / 45) * 45 });
    steady.push(id);
  });

  // ---- not friends yet ----
  person('u_sara', 'Sara Lungu', 'f', '+40723199001');
  saves.u_sara = savesOn(run(yesterday, 6));
  freezes.u_sara = fresh();
  steady.push('u_sara');

  // ---- friendships: you and 28 others (Ana and Mihai come from the contacts) ----
  const since = (daysAgo: number) => iso(new Date(now.getTime() - daysAgo * DAY_MS));
  const mine = [SEED_IDS.ioana, SEED_IDS.radu, SEED_IDS.elena, ...otherIds];
  const friendships = mine.map((b, i) => ({ a: me.id, b, since: since(1 + i) }));
  // the colony people know each other
  for (const [a, b] of [
    [SEED_IDS.ioana, SEED_IDS.ana],
    [SEED_IDS.ioana, SEED_IDS.mihai],
    [SEED_IDS.ana, SEED_IDS.mihai],
    [SEED_IDS.ana, SEED_IDS.radu],
    [SEED_IDS.mihai, SEED_IDS.elena],
  ] as const)
    friendships.push({ a, b, since: since(90) });

  // ---- the colony ----
  const colonyStart = addDays(today, -20);
  const colony: Colony = {
    id: SEED_COLONY,
    name: 'Foculețul',
    createdBy: SEED_IDS.ioana,
    createdAt: since(20),
    code: 'FOC4X7',
    members: [
      { user: SEED_IDS.ioana, joinedOn: colonyStart },
      { user: SEED_IDS.ana, joinedOn: colonyStart },
      { user: SEED_IDS.mihai, joinedOn: colonyStart },
      { user: me.id, joinedOn: today },
    ],
    challenge: { week: startOfWeek(today), title: CHALLENGES[0], done: [SEED_IDS.ioana], reward: 'Free coffee' },
  };

  // ---- the shared goal: 920 of 2,000 lei, 46% ----
  const july = `${Number(today.slice(0, 4)) + (Number(today.slice(5, 7)) >= 7 ? 1 : 0)}-07-15`;
  const shares = equalShares(2000_00, 4);
  const goal: SharedGoal = {
    id: SEED_GOAL,
    colony: SEED_COLONY,
    name: 'Vama Veche',
    photo: null,
    icon: 'beach',
    target: 2000_00,
    date: july,
    createdBy: SEED_IDS.ioana,
    createdAt: since(18),
    participants: [SEED_IDS.ioana, SEED_IDS.ana, SEED_IDS.mihai, me.id].map((user, i) => ({ user, share: shares[i] })),
    contributions: [
      { id: 'sc1', user: SEED_IDS.ioana, amount: 200_00, at: since(17), kind: 'deposit' },
      { id: 'sc2', user: SEED_IDS.mihai, amount: 160_00, at: since(12), kind: 'deposit' },
      { id: 'sc3', user: SEED_IDS.ana, amount: 260_00, at: since(9), kind: 'deposit' },
      { id: 'sc4', user: SEED_IDS.ioana, amount: 200_00, at: since(5), kind: 'deposit' },
      { id: 'sc5', user: SEED_IDS.mihai, amount: 100_00, at: since(2), kind: 'deposit' },
    ],
    milestones: [25],
    rebalance: false,
  };

  // a seed made early in the morning has no savings from later today
  for (const id of Object.keys(saves)) saves[id] = saves[id].map((x) => (new Date(x.at) > now ? { ...x, at: now.toISOString() } : x));

  return {
    version: 1,
    me: me.id,
    seededOn: today,
    users,
    saves,
    freezes,
    dangers: [
      { id: 'd_ana', user: SEED_IDS.ana, day: yesterday, until: dangerUntil(yesterday), status: 'open' },
      { id: 'd_bogdan', user: SEED_IDS.bogdan, day: yesterday, until: dangerUntil(yesterday), status: 'open' },
    ],
    // Ana asked her colony this morning, with one tap
    asks: [{ id: 'a_ana', from: SEED_IDS.ana, to: [me.id, SEED_IDS.mihai, SEED_IDS.ioana], day: yesterday, at: iso(new Date(Math.min(now.getTime(), new Date(`${today}T08:30:00`).getTime()))), status: 'open' }],
    gifts: [],
    requests: [
      // Ana and Mihai found you through the colony and asked first
      { id: 'r_ana', from: SEED_IDS.ana, to: me.id, at: hoursAgo(0.5), status: 'pending' },
      { id: 'r_mihai', from: SEED_IDS.mihai, to: me.id, at: hoursAgo(0.2), status: 'pending' },
      { id: 'r_sara', from: 'u_sara', to: me.id, at: hoursAgo(5), status: 'pending' },
    ],
    friendships,
    blocks: [],
    colonies: [colony],
    colonyInvites: [],
    sharedGoals: [goal],
    pockets: { [me.id]: 0, [SEED_IDS.ana]: 140_00, [SEED_IDS.mihai]: 410_00, [SEED_IDS.ioana]: 950_00 },
    cheers: [],
    notices: [],
    witness: {},
    contactsAsked: false,
    steady,
    // the 25% everyone already celebrated before you joined
    seen: Object.fromEntries(goal.participants.map((x) => [`ms-${SEED_GOAL}-25-${x.user}`, true as const])),
    legacyPaused: [],
  };
}

/** Weekly colony challenges (P1.2), one per Monday in turn. */
export const CHALLENGES = ['5 days without food delivery', 'Everyone saves 3 days in a row', 'A week of coffee from home only', "Sell one thing you don't use anymore"];
