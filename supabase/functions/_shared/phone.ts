// Phone sign-in rules for the auth-phone function. Pure, so the tests need no Supabase.
// Romanian mobile numbers only, the way people actually type them: 0712 345 678, +40 712 345 678,
// 0040 712-345-678. Everything is stored and compared in E.164 (+40712345678).

export const CODE_LENGTH = 6;
export const DEFAULT_TEST_CODE = '123456';
// longer than any honest way of writing a Romanian number with spaces, short enough to never log
const MAX_PHONE_INPUT = 32;

export const PHONE_MSG = {
  badBody: 'Invalid request.',
  badPhone: "That number isn't valid. Enter a Romanian mobile number, like 07xx xxx xxx.",
  badCode: 'The code has 6 digits.',
  wrongCode: "That code isn't right.",
  tooMany: 'Too many tries. Try again in 10 minutes.',
  off: "SMS sign-in isn't on yet.",
};

export type PhoneRequest =
  | { action: 'start'; phone: string }
  | { action: 'verify'; phone: string; code: string };

/** '+407xxxxxxxx' for a Romanian mobile number (07…, +407…, 00407…, spaces and dashes allowed), else null. */
export function normalizeRoMobile(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > MAX_PHONE_INPUT) return null;
  const compact = input.replace(/[\s-]/g, '');
  // 0 / +40 / 0040, then the 9 digit national number, which for mobiles starts with 7
  const m = /^(?:0|\+40|0040)(7\d{8})$/.exec(compact);
  return m ? `+40${m[1]}` : null;
}

/** The code as 6 ASCII digits (spaces dropped, so "123 456" from a paste works), else null. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string' || input.length > 16) return null;
  const digits = input.replace(/\s/g, '');
  return digits.length === CODE_LENGTH && /^\d+$/.test(digits) ? digits : null;
}

/** Checks the request body. A bad number and a bad code each get their own message. */
export function parsePhoneRequest(body: unknown): { ok: true; req: PhoneRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: PHONE_MSG.badBody };
  const b = body as Record<string, unknown>;
  if (b.action !== 'start' && b.action !== 'verify') return { ok: false, error: PHONE_MSG.badBody };
  const phone = normalizeRoMobile(b.phone);
  if (!phone) return { ok: false, error: PHONE_MSG.badPhone };
  if (b.action === 'start') return { ok: true, req: { action: 'start', phone } };
  const code = normalizeCode(b.code);
  if (!code) return { ok: false, error: PHONE_MSG.badCode };
  return { ok: true, req: { action: 'verify', phone, code } };
}

/** PHONE_TEST_CODE when it is 6 digits, otherwise the default 123456. */
export function testCodeFrom(value: string | undefined): string {
  return value !== undefined && normalizeCode(value) === value ? value : DEFAULT_TEST_CODE;
}

/** Same length and same digits, compared without stopping at the first difference. */
export function sameCode(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/**
 * The address a phone user gets so the admin API can make them a magic link. It is never mailed:
 * .invalid is reserved (RFC 2606) and generateLink only returns the link.
 */
export function syntheticEmail(e164: string): string {
  return `${e164.replace(/^\+/, '')}@phone.kip.invalid`;
}

/** For logs: only the last 3 digits. */
export function maskPhone(e164: string): string {
  return `***${e164.slice(-3)}`;
}

/** For logs: any run of 6 or more digits (a phone number, in any format) keeps only its last 3. */
export function scrub(text: string): string {
  return text.replace(/\+?\d{6,}/g, (m) => maskPhone(m));
}
