import { describe, expect, it } from 'vitest';
import { authError } from './authErrors';

describe('Supabase Auth errors', () => {
  it('maps by code, not by words in the message', () => {
    expect(authError({ code: 'otp_expired', message: 'Token has expired or is invalid', status: 403 }).message).toMatch(/code has expired/);
    expect(authError({ code: 'otp_expired', status: 403 }).field).toBe('code');
    expect(authError({ code: 'over_request_rate_limit', message: 'rate limit exceeded', status: 429 }).message).toMatch(/Too many tries/);
    expect(authError({ code: 'something_else', status: 429 }).message).toMatch(/Too many tries/);
  });
  it('falls back to what Supabase said', () => {
    expect(authError({ code: 'something_new', message: 'Something new happened', status: 422 }).message).toBe('Something new happened');
    expect(authError({ message: 'Failed to fetch' }).message).toMatch(/couldn't reach the server/);
  });
});
