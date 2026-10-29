import { describe, expect, it } from 'vitest';
import { formatNational, formatPhoneInput, PHONE_PREFIX, toE164 } from './phone';

describe('Romanian phone numbers', () => {
  it('formats while typing, behind the +40 prefix', () => {
    expect(formatPhoneInput(PHONE_PREFIX)).toBe('+40 ');
    expect(formatPhoneInput('+40 7')).toBe('+40 7');
    expect(formatPhoneInput('+40 7123')).toBe('+40 712 3');
    expect(formatPhoneInput('+40 712345678')).toBe('+40 712 345 678');
    // the leading 0 people type out of habit is dropped after +40
    expect(formatPhoneInput('+40 0712345678')).toBe('+40 712 345 678');
    // no more than nine digits after the prefix
    expect(formatPhoneInput('+40 7123456789')).toBe('+40 712 345 678');
  });
  it('lets the prefix go and takes the number the Romanian way', () => {
    expect(formatPhoneInput('+40')).toBe('+40');
    expect(formatPhoneInput('')).toBe('');
    expect(formatPhoneInput('0712345678')).toBe('0712 345 678');
    expect(formatPhoneInput('0040712345678')).toBe('+40 712 345 678');
    expect(formatPhoneInput('712 345 678')).toBe('+40 712 345 678');
  });
  it('accepts only Romanian mobile numbers', () => {
    expect(toE164('+40 712 345 678')).toBe('+40712345678');
    expect(toE164('0712 345 678')).toBe('+40712345678');
    expect(toE164('+40 712 345 67')).toBeNull();
    expect(toE164('0212 345 678')).toBeNull();
    expect(toE164('+44 7123 456789')).toBeNull();
  });
  it('reads back as 07xx xxx xxx', () => {
    expect(formatNational('+40712345678')).toBe('0712 345 678');
  });
});
