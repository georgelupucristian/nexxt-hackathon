// Money rules: plan maths, the withdraw maximum and the parent match cap.
// Run with the whole backend suite: deno test --allow-env --allow-read supabase/functions
import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';
import {
  balances,
  computeMatch,
  daysUntilPayday,
  firstTopUp,
  type LedgerRow,
  MAX_DAILY_BANI,
  MIN_DAILY_BANI,
  monthlyTopUp,
  STRIPE_MIN_CHARGE_BANI,
  withdrawable,
} from './rules.ts';
import { addDays } from './dates.ts';

const day = (s: string) => new Date(`${s}T00:00:00Z`);
const schema = Deno.readTextFileSync(new URL('../../migrations/0001_avansul_schema.sql', import.meta.url));

// ---------- plan maths ----------

Deno.test('monthly top-up is the daily amount × 30 for every allowed daily amount', () => {
  for (let daily = MIN_DAILY_BANI; daily <= MAX_DAILY_BANI; daily++) assertEquals(monthlyTopUp(daily), daily * 30);
  assertEquals(monthlyTopUp(1500), 45_000); // 15 lei a day = 450 lei a month
});

Deno.test('the daily limits match the database check on profiles.daily_amount_bani', () => {
  const m = /daily_amount_bani integer not null default \d+ check \(daily_amount_bani between (\d+) and (\d+)\)/.exec(schema);
  assert(m, 'daily_amount_bani check not found in 0001_avansul_schema.sql');
  assertEquals([Number(m[1]), Number(m[2])], [MIN_DAILY_BANI, MAX_DAILY_BANI]);
});

Deno.test('paydays are 1 to 28 in the database, so every month has one', () => {
  assert(/payday_day smallint not null default 1 check \(payday_day between 1 and 28\)/.test(schema));
});

Deno.test('days until payday: payday today, tomorrow and later this month', () => {
  assertEquals(daysUntilPayday(day('2026-10-10'), 10), 0);
  assertEquals(daysUntilPayday(day('2026-10-09'), 10), 1);
  assertEquals(daysUntilPayday(day('2026-10-28'), 10), 13);
});

Deno.test('days until payday: payday on the 28th', () => {
  assertEquals(daysUntilPayday(day('2026-10-28'), 28), 0);
  assertEquals(daysUntilPayday(day('2026-10-27'), 28), 1);
  assertEquals(daysUntilPayday(day('2026-10-29'), 28), 30); // next one is 28 November
  assertEquals(daysUntilPayday(day('2027-02-01'), 28), 27);
});

Deno.test('days until payday: month ends, February and the new year', () => {
  assertEquals(daysUntilPayday(day('2027-01-31'), 28), 28); // to 28 Feb 2027
  assertEquals(daysUntilPayday(day('2027-01-29'), 28), 30);
  assertEquals(daysUntilPayday(day('2027-02-28'), 28), 0);
  assertEquals(daysUntilPayday(day('2027-02-28'), 1), 1); // non-leap year: 1 March is tomorrow
  assertEquals(daysUntilPayday(day('2028-02-28'), 1), 2); // leap year: 29 Feb comes first
  assertEquals(daysUntilPayday(day('2028-02-29'), 28), 28); // to 28 Mar 2028
  assertEquals(daysUntilPayday(day('2026-04-30'), 1), 1);
  assertEquals(daysUntilPayday(day('2026-12-31'), 1), 1);
  assertEquals(daysUntilPayday(day('2026-12-20'), 5), 16); // to 5 Jan 2027
});

Deno.test('days until payday: lands on the next payday, every day of 2026 to 2028, every payday', () => {
  let checked = 0;
  for (let d = '2026-01-01'; d <= '2028-12-31'; d = addDays(d, 1)) {
    for (let payday = 1; payday <= 28; payday++) {
      const days = daysUntilPayday(day(d), payday);
      assert(days >= 0 && days <= 30, `${d} payday ${payday}: ${days} days`);
      assertEquals(Number(addDays(d, days).slice(8)), payday, `${d} + ${days} days is not the ${payday}th`);
      // and it is the first one: no day in between is a payday
      for (let i = 0; i < days; i++) assert(Number(addDays(d, i).slice(8)) !== payday, `${d}: skipped an earlier payday`);
      checked++;
    }
  }
  assertEquals(checked, 1096 * 28);
});

Deno.test('first top-up pays only the days until payday', () => {
  assertEquals(firstTopUp(1500, day('2026-10-28'), 10), { amount: 19_500, days: 13 }); // 195 lei for 13 days
  assertEquals(firstTopUp(1500, day('2026-10-26'), 28), { amount: 3_000, days: 2 });
  assertEquals(firstTopUp(1500, day('2026-10-27'), 28), { amount: 1_500, days: 1 });
});

Deno.test('first top-up on payday is a full month', () => {
  assertEquals(firstTopUp(1500, day('2026-10-10'), 10), { amount: 45_000, days: 30 });
});

Deno.test('first top-up never charges below the Stripe minimum', () => {
  assertEquals(firstTopUp(100, day('2027-01-31'), 1).amount, STRIPE_MIN_CHARGE_BANI);
});

Deno.test('first top-up is never more than a monthly top-up, for any allowed amount, day and payday', () => {
  for (const daily of [MIN_DAILY_BANI, 1500, MAX_DAILY_BANI]) {
    for (let d = '2026-01-01'; d <= '2027-12-31'; d = addDays(d, 1)) {
      for (let payday = 1; payday <= 28; payday++) {
        const first = firstTopUp(daily, day(d), payday);
        assert(first.amount <= monthlyTopUp(daily), `${daily}/day on ${d}, payday ${payday}: ${first.amount}`);
        assert(first.amount >= STRIPE_MIN_CHARGE_BANI);
      }
    }
  }
});

// ---------- withdraw maximum ----------

const row = (r: Partial<LedgerRow> & Pick<LedgerRow, 'bucket' | 'amount_bani'>): LedgerRow => ({
  type: 'topup',
  status: 'confirmed',
  is_matched: false,
  ...r,
});

// A month of history: one paid top-up, one day allocated, a parent match, plus money that must not count.
const month: LedgerRow[] = [
  row({ bucket: 'de_pus_deoparte', amount_bani: 45_000 }),
  row({ bucket: 'de_pus_deoparte', type: 'allocation', amount_bani: -1_500 }),
  row({ bucket: 'goal', type: 'allocation', amount_bani: 1_500 }),
  row({ bucket: 'goal', type: 'parent_match', amount_bani: 1_500, is_matched: true }),
  row({ bucket: 'de_pus_deoparte', type: 'extra_deposit', amount_bani: 2_000, status: 'pending' }),
  row({ bucket: 'de_pus_deoparte', amount_bani: 45_000, status: 'failed' }),
  row({ bucket: 'outside', type: 'manual_record', amount_bani: 10_000 }),
];

Deno.test('balances count confirmed money only; pending is reported apart', () => {
  assertEquals(balances(month), {
    deoparte: 43_500,
    inGoals: 3_000,
    matched: 1_500,
    pot: 46_500,
    pendingIn: 2_000,
    recordedOutside: 10_000,
  });
});

Deno.test('withdraw maximum is the pot minus the parent match', () => {
  assertEquals(withdrawable(month), 45_000);
});

Deno.test('withdraw maximum ignores pending, failed and money recorded outside Kip', () => {
  const onlyNoise = month.filter((r) => r.status !== 'confirmed' || r.bucket === 'outside');
  assertEquals(withdrawable(onlyNoise), 0);
});

Deno.test('after withdrawing all own money only the parent match is left, and nothing more can go out', () => {
  const after = [...month, row({ bucket: 'de_pus_deoparte', type: 'withdrawal', amount_bani: -43_500 }), row({ bucket: 'goal', type: 'withdrawal', amount_bani: -1_500 })];
  assertEquals(withdrawable(after), 0);
  assertEquals(balances(after).pot, 1_500);
  assertEquals(balances(after).matched, 1_500);
});

Deno.test('withdraw maximum is never negative', () => {
  assertEquals(withdrawable([row({ bucket: 'goal', type: 'parent_match', amount_bani: 5_000, is_matched: true })]), 0);
  assertEquals(withdrawable([]), 0);
});

// ---------- parent match cap ----------

Deno.test('parent match applies the ratio and floors to whole bani', () => {
  assertEquals(computeMatch(45_000, 1, 1, 100_000, 0), 45_000);
  assertEquals(computeMatch(45_000, 1, 2, 100_000, 0), 22_500);
  assertEquals(computeMatch(1_501, 1, 2, 100_000, 0), 750);
});

Deno.test('parent match never goes over what is left of the monthly cap', () => {
  assertEquals(computeMatch(45_000, 1, 1, 15_000, 0), 15_000);
  assertEquals(computeMatch(45_000, 1, 1, 15_000, 10_000), 5_000);
  assertEquals(computeMatch(45_000, 1, 1, 15_000, 15_000), 0);
  assertEquals(computeMatch(45_000, 1, 1, 15_000, 20_000), 0);
});

Deno.test('parent match below the Stripe minimum, or with a broken ratio, is skipped', () => {
  assertEquals(computeMatch(45_000, 1, 1, 15_000, 14_900), 0);
  assertEquals(computeMatch(0, 1, 1, 15_000, 0), 0);
  assertEquals(computeMatch(45_000, 1, 0, 15_000, 0), 0);
});

Deno.test('parent match: a month of top-ups never adds up to more than the cap', () => {
  for (const cap of [1_000, 15_000, 500_000]) {
    for (const [num, den] of [[1, 1], [1, 4], [4, 1], [3, 2]]) {
      let matched = 0;
      for (const paid of [19_500, 45_000, 2_000, 150_000, 45_000]) matched += computeMatch(paid, num, den, cap, matched);
      assert(matched <= cap, `cap ${cap}, ratio ${num}:${den}: matched ${matched}`);
    }
  }
});
