// Romanian mobile numbers, the only way into Kip: friends are added by phone later, so the
// account is the number. People type them every way there is ("0712345678", "+40 712 345 678",
// "712 345 678"); the field keeps "+40 " in front and formats as they type, and everything is
// sent to the backend as E.164 ("+40712345678").

export const PHONE_PREFIX = '+40 ';

/** Digits of the national number without its leading 0: "712345678", or what's typed so far. */
function nationalDigits(value: string): string {
  let d = value.replace(/\D/g, '');
  if (value.trim().startsWith('+')) {
    // "+40 7..." → drop the country code; anything else after "+" isn't a Romanian number
    d = d.startsWith('40') ? d.slice(2) : d;
  } else if (d.startsWith('0040')) {
    d = d.slice(4);
  } else if (d.startsWith('40') && d.length > 9) {
    d = d.slice(2);
  }
  // "+40 0712..." and "0712..." both mean 712...
  if (d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 9);
}

/**
 * What the field shows while typing: "+40 712 345 678". Deleting the "+40" and typing a number the
 * Romanian way gives "0712 345 678" instead, which is just as valid.
 */
export function formatPhoneInput(value: string): string {
  const trimmed = value.trimStart();
  // backspacing into "+40" lets it go, so a number can be typed the Romanian way instead
  if (PHONE_PREFIX.startsWith(trimmed) && trimmed.length < PHONE_PREFIX.length) return trimmed.trimEnd();
  const raw = trimmed.replace(/\D/g, '');
  if (!trimmed.startsWith('+') && raw.startsWith('0') && !raw.startsWith('00')) {
    const d = raw.slice(0, 10);
    return [d.slice(0, 4), d.slice(4, 7), d.slice(7, 10)].filter(Boolean).join(' ');
  }
  const d = nationalDigits(value);
  const groups = [d.slice(0, 3), d.slice(3, 6), d.slice(6, 9)].filter(Boolean).join(' ');
  return `${PHONE_PREFIX}${groups}`;
}

/** "+40712345678" for a Romanian mobile number (07x xxx xxx), else null. */
export function toE164(value: string): string | null {
  const d = nationalDigits(value);
  return /^7\d{8}$/.test(d) ? `+40${d}` : null;
}

/** "+40712345678" → "0712 345 678", the way people here read their own number. */
export function formatNational(e164: string): string {
  const d = nationalDigits(e164);
  if (d.length !== 9) return e164;
  return `0${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}
