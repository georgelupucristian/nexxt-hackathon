// Money dates are Bucharest calendar days, whatever timezone the Edge Function runs in (UTC).
import { assertEquals } from 'jsr:@std/assert@1.0.14';
import { addDays, bucharestDate, dayLabel, ordinalDay } from './dates.ts';

const at = (iso: string) => new Date(iso);

Deno.test('Bucharest day turns at local midnight in winter (UTC+2)', () => {
  assertEquals(bucharestDate(at('2026-10-27T21:59:59Z')), '2026-10-27');
  assertEquals(bucharestDate(at('2026-10-27T22:00:00Z')), '2026-10-28');
});

Deno.test('Bucharest day turns at local midnight in summer (UTC+3)', () => {
  assertEquals(bucharestDate(at('2026-07-31T20:59:59Z')), '2026-07-31');
  assertEquals(bucharestDate(at('2026-07-31T21:00:00Z')), '2026-08-01');
});

Deno.test('Bucharest day around the DST switches', () => {
  // clocks go forward on 29 March 2026 and back on 25 October 2026
  assertEquals(bucharestDate(at('2026-03-28T22:00:00Z')), '2026-03-29');
  assertEquals(bucharestDate(at('2026-03-29T20:59:59Z')), '2026-03-29');
  assertEquals(bucharestDate(at('2026-03-29T21:00:00Z')), '2026-03-30');
  assertEquals(bucharestDate(at('2026-10-24T21:00:00Z')), '2026-10-25');
  assertEquals(bucharestDate(at('2026-10-25T21:59:59Z')), '2026-10-25');
  assertEquals(bucharestDate(at('2026-10-25T22:00:00Z')), '2026-10-26');
});

Deno.test('Bucharest New Year starts before UTC does', () => {
  assertEquals(bucharestDate(at('2026-12-31T22:30:00Z')), '2027-01-01');
});

Deno.test('the nightly job at 22:05 UTC always allocates the new Bucharest day', () => {
  // pg_cron runs allocate_daily() at 22:05 UTC: 00:05 in winter, 01:05 in summer, the same day either way
  assertEquals(bucharestDate(at('2026-01-15T22:05:00Z')), '2026-01-16');
  assertEquals(bucharestDate(at('2026-07-15T22:05:00Z')), '2026-07-16');
});

Deno.test('addDays crosses months, years and leap days', () => {
  assertEquals(addDays('2026-10-28', 13), '2026-11-10');
  assertEquals(addDays('2026-12-31', 1), '2027-01-01');
  assertEquals(addDays('2027-02-28', 1), '2027-03-01');
  assertEquals(addDays('2028-02-28', 1), '2028-02-29');
  assertEquals(addDays('2026-03-01', -1), '2026-02-28');
});

Deno.test('addDays is not moved by the DST switch', () => {
  assertEquals(addDays('2026-03-28', 2), '2026-03-30');
  assertEquals(addDays('2026-10-24', 2), '2026-10-26');
});

Deno.test('dayLabel: a calendar day as the app and Checkout write it, never shifted by timezone', () => {
  assertEquals(dayLabel('2026-11-10'), '10 Nov 2026');
  assertEquals(dayLabel('2027-01-01'), '1 Jan 2027');
  assertEquals(dayLabel('2028-02-29'), '29 Feb 2028');
});

Deno.test('ordinalDay: 1st, 2nd, 3rd, then th, with the teens always th', () => {
  assertEquals([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 28].map(ordinalDay), [
    '1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st', '22nd', '23rd', '28th',
  ]);
});
