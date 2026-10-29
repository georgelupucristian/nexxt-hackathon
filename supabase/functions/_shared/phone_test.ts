// Phone sign-in: which numbers are accepted and how they are written, what a valid request is,
// the test code, and that logs never carry a whole number.
import { assertEquals } from 'jsr:@std/assert@1.0.14';
import {
  DEFAULT_TEST_CODE,
  maskPhone,
  normalizeCode,
  normalizeRoMobile,
  parsePhoneRequest,
  PHONE_MSG,
  sameCode,
  scrub,
  syntheticEmail,
  testCodeFrom,
} from './phone.ts';

Deno.test('a Romanian mobile number becomes E.164 however it is written', () => {
  for (const typed of [
    '0712345678',
    '+40712345678',
    '0040712345678',
    '0712 345 678',
    '0712-345-678',
    '+40 712 345 678',
    '+40-712-345-678',
    '0040 712 345 678',
    '  0712345678  ',
    '0712\u00a0345\u00a0678', // non-breaking spaces, as some keyboards paste them
  ]) {
    assertEquals(normalizeRoMobile(typed), '+40712345678', typed);
  }
  // every mobile range, the sandbox test number included
  assertEquals(normalizeRoMobile('0700000001'), '+40700000001');
  assertEquals(normalizeRoMobile('0799999999'), '+40799999999');
});

Deno.test('anything that is not a Romanian mobile number is refused', () => {
  for (const typed of [
    '',
    '   ',
    '712345678', // no prefix
    '40712345678', // country code without + or 00
    '+400712345678', // +40 and the national 0 together
    '00400712345678',
    '071234567', // one digit short
    '07123456789', // one digit long
    '+4071234567',
    '0212345678', // Bucharest landline
    '+40212345678',
    '0612345678',
    '+33612345678', // a French mobile
    '+1 415 555 0100',
    '0712.345.678', // only spaces and dashes are separators
    '(0712) 345 678',
    '0712345678a',
    '07l2345678',
    '+40 7I2 345 678',
    '٠٧١٢٣٤٥٦٧٨', // Arabic-Indic digits
    '0'.repeat(40),
  ]) {
    assertEquals(normalizeRoMobile(typed), null, typed);
  }
  for (const notText of [undefined, null, 712345678, 40712345678, {}, ['0712345678'], true]) {
    assertEquals(normalizeRoMobile(notText), null, String(notText));
  }
});

Deno.test('the code is 6 ASCII digits; spaces from a paste are dropped', () => {
  assertEquals(normalizeCode('123456'), '123456');
  assertEquals(normalizeCode('000000'), '000000');
  assertEquals(normalizeCode(' 123 456 '), '123456');
  for (const bad of ['', '12345', '1234567', '12345a', '12-345', '١٢٣٤٥٦', 123456, null, undefined, {}, '1'.repeat(17)]) {
    assertEquals(normalizeCode(bad), null, String(bad));
  }
});

Deno.test('start needs a valid number; verify needs a valid number and a code', () => {
  assertEquals(parsePhoneRequest({ action: 'start', phone: '0712 345 678' }), { ok: true, req: { action: 'start', phone: '+40712345678' } });
  assertEquals(parsePhoneRequest({ action: 'verify', phone: '+40712345678', code: '123456' }), {
    ok: true,
    req: { action: 'verify', phone: '+40712345678', code: '123456' },
  });
  // start ignores a code; extra fields never matter
  assertEquals(parsePhoneRequest({ action: 'start', phone: '0712345678', code: 'x', extra: 1 }), {
    ok: true,
    req: { action: 'start', phone: '+40712345678' },
  });
});

Deno.test('a bad body, a bad number and a bad code each get their own message', () => {
  for (const body of [null, undefined, 'start', 42, [], [{ action: 'start' }], {}, { action: 'send', phone: '0712345678' }, { phone: '0712345678' }]) {
    assertEquals(parsePhoneRequest(body), { ok: false, error: PHONE_MSG.badBody }, JSON.stringify(body));
  }
  assertEquals(parsePhoneRequest({ action: 'start' }), { ok: false, error: PHONE_MSG.badPhone });
  assertEquals(parsePhoneRequest({ action: 'start', phone: '0212345678' }), { ok: false, error: PHONE_MSG.badPhone });
  // the number is checked before the code
  assertEquals(parsePhoneRequest({ action: 'verify', phone: 'x', code: '123456' }), { ok: false, error: PHONE_MSG.badPhone });
  assertEquals(parsePhoneRequest({ action: 'verify', phone: '0712345678' }), { ok: false, error: PHONE_MSG.badCode });
  assertEquals(parsePhoneRequest({ action: 'verify', phone: '0712345678', code: '12345' }), { ok: false, error: PHONE_MSG.badCode });
  assertEquals(parsePhoneRequest({ action: 'verify', phone: '0712345678', code: 123456 }), { ok: false, error: PHONE_MSG.badCode });
});

Deno.test('every message is short and in Romanian, and the switched-off one is the agreed text', () => {
  assertEquals(PHONE_MSG.off, "SMS sign-in isn't on yet.");
  for (const m of Object.values(PHONE_MSG)) {
    assertEquals(m.length > 0 && m.length <= 90, true, m);
    assertEquals(m.includes('\u2014'), false, m);
  }
});

Deno.test('the test code: PHONE_TEST_CODE when it is 6 digits, else 123456', () => {
  assertEquals(DEFAULT_TEST_CODE, '123456');
  assertEquals(testCodeFrom(undefined), '123456');
  assertEquals(testCodeFrom('424242'), '424242');
  for (const bad of ['', '12345', '1234567', 'abcdef', ' 424242', '424 242']) {
    assertEquals(testCodeFrom(bad), '123456', bad);
  }
});

Deno.test('sameCode: equal only for the very same digits', () => {
  assertEquals(sameCode('123456', '123456'), true);
  assertEquals(sameCode('123457', '123456'), false);
  assertEquals(sameCode('023456', '123456'), false);
  assertEquals(sameCode('12345', '123456'), false);
  assertEquals(sameCode('', '123456'), false);
});

Deno.test('the synthetic email is the number without +, on a domain that can never receive mail', () => {
  assertEquals(syntheticEmail('+40700000001'), '40700000001@phone.kip.invalid');
});

Deno.test('logs keep only the last 3 digits of a number, wherever it shows up', () => {
  assertEquals(maskPhone('+40712345678'), '***678');
  assertEquals(scrub('user +40712345678 exists'), 'user ***678 exists');
  assertEquals(scrub('40712345678@phone.kip.invalid already registered'), '***678@phone.kip.invalid already registered');
  assertEquals(scrub('Key (phone)=(40712345678) already exists'), 'Key (phone)=(***678) already exists');
  // short numbers (status codes, counts) are left alone
  assertEquals(scrub('422 after 10 attempts'), '422 after 10 attempts');
});
