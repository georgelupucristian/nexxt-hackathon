// The saving schedule payments.start and payments.update_schedule give Stripe: first day, anchor, trial.
import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { bucharestMorning, dailyPace, nextCollection, rescheduleFrom, scheduleError, startSchedule, weekdayOf } from './plan.ts';
import { addDays, bucharestDate } from './dates.ts';

const unix = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

Deno.test('weekly: the next chosen weekday, today when today is the day (0 = Monday)', () => {
  assertEquals(weekdayOf('2026-10-26'), 0); // a Monday
  assertEquals(nextCollection('2026-10-29', 'week', 0), '2026-11-02'); // Thursday to Monday
  assertEquals(nextCollection('2026-10-29', 'week', 3), '2026-10-29');
  assertEquals(nextCollection('2026-11-01', 'week', 6), '2026-11-01'); // a Sunday
});

Deno.test('monthly: the next chosen day of the month, across month and year ends', () => {
  assertEquals(nextCollection('2026-10-29', 'month', 15), '2026-11-15');
  assertEquals(nextCollection('2026-10-15', 'month', 15), '2026-10-15');
  assertEquals(nextCollection('2026-12-31', 'month', 1), '2027-01-01');
  assertEquals(nextCollection('2027-01-31', 'month', 28), '2027-02-28');
});

Deno.test('start: charged now only on the day; anchored at 09:00 on the chosen day otherwise', () => {
  const thu = unix('2026-10-29T08:00:00Z');
  assertEquals(startSchedule(thu, 'week', 3), { today: '2026-10-29', first: '2026-10-29', anchor: null });
  const mon = startSchedule(thu, 'week', 0);
  assertEquals([mon.first, mon.anchor], ['2026-11-02', unix('2026-11-02T07:00:00Z')]); // 09:00, winter UTC+2
  assertEquals(bucharestMorning('2026-07-01'), unix('2026-07-01T06:00:00Z')); // summer UTC+3
  // tomorrow is fine now: the subscription is anchored server-side, no Checkout trial minimum
  assertEquals(startSchedule(thu, 'week', 4).first, '2026-10-30');
  // 00:30 in Bucharest is already the next day
  assertEquals(startSchedule(unix('2026-10-27T22:30:00Z'), 'month', 28).anchor, null);
});

Deno.test('start: every day and hour of 2026-2027, every schedule: on the chosen day, in the future', () => {
  const wrong: string[] = [];
  for (let d = '2026-01-01'; d <= '2027-12-31'; d = addDays(d, 1)) {
    for (const hour of ['00:10', '10:00', '21:50']) {
      const now = unix(`${d}T${hour}:00Z`);
      const check = (s: ReturnType<typeof startSchedule>, ok: boolean, label: string) => {
        const onDay = s.anchor === null ? s.first === s.today : bucharestDate(new Date(s.anchor * 1000)) === s.first && s.anchor > now;
        if (!ok || !onDay) wrong.push(`${d}T${hour} ${label}: ${JSON.stringify(s)}`);
      };
      for (let w = 0; w <= 6; w++) {
        const s = startSchedule(now, 'week', w);
        check(s, weekdayOf(s.first) === w && s.first >= s.today && s.first <= addDays(s.today, 6), `w${w}`);
      }
      for (let m = 1; m <= 28; m++) {
        const s = startSchedule(now, 'month', m);
        check(s, Number(s.first.slice(8)) === m && s.first >= s.today && s.first <= addDays(s.today, 31), `m${m}`);
      }
    }
  }
  assertEquals(wrong, []);
});

Deno.test('reschedule: starts on or after the paid period ends, a trial only when the day moves', () => {
  const end = unix('2026-12-01T08:00:00Z'); // monthly plan paid until 1 Dec (a Tuesday)
  assertEquals(rescheduleFrom(end, 'month', { every: 'month', day: 1 }), { first: '2026-12-01', trialEnd: null });
  assertEquals(rescheduleFrom(end, 'month', { every: 'month', day: 15 }), { first: '2026-12-15', trialEnd: bucharestMorning('2026-12-15') });
  assertEquals(rescheduleFrom(end, 'month', { every: 'week', day: 1 }), { first: '2026-12-01', trialEnd: end }); // never before the paid period ends
  assertEquals(rescheduleFrom(unix('2026-11-09T08:00:00Z'), 'week', { every: 'month', day: 15 }).first, '2026-11-15');
});

Deno.test('schedule limits: 35-350 lei a week, 150-1,500 lei a month; daily pace 5-50 lei', () => {
  assertEquals(scheduleError('week', 0, 3_500), null);
  assertEquals(scheduleError('month', 28, 150_000), null);
  assertEquals(scheduleError('week', 7, 5_000) !== null, true);
  assertEquals(scheduleError('month', 29, 50_000) !== null, true);
  assertEquals(scheduleError('day', 1, 5_000) !== null, true);
  assertEquals(scheduleError('week', 2, 3_499) !== null, true);
  assertEquals([dailyPace(7_000, 'week'), dailyPace(45_000, 'month'), dailyPace(10_000, 'week')], [1_000, 1_500, 1_429]);
});
