// Supabase Auth errors in the app's words (kept apart from the store so they're easy to test).
import { AuthError } from './storage';

/**
 * Supabase Auth errors in the app's words, matched on the error code (never on a guess over the
 * message). Accounts are phone numbers proven by a code, so what can go wrong here is the code
 * step: verifyOtp with the token the auth-phone function hands back. Anything unknown shows
 * Supabase's own message rather than a wrong explanation.
 */
export function authError(e: { code?: string; message?: string; status?: number }): AuthError {
  const code = e.code ?? '';
  const msg = e.message ?? '';
  switch (code) {
    case 'otp_expired':
    case 'flow_state_expired':
      return new AuthError('That code has expired. Ask for a new one and try again.', 'code');
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
    case 'over_sms_send_rate_limit':
      return new AuthError('Too many tries in a short time. Try again in a few minutes.');
    case 'signup_disabled':
      return new AuthError('New accounts are switched off for now.');
    case 'user_banned':
      return new AuthError("This account is blocked. Write to us and we'll take a look.");
  }
  if (e.status === 429) return new AuthError('Too many tries in a short time. Try again in a few minutes.');
  if (!e.status) return new AuthError("We couldn't reach the server. Check your internet and try again.");
  return new AuthError(msg || "We couldn't carry on. Try once more.");
}
