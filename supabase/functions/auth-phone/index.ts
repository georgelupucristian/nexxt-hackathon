// auth-phone: sign in with a Romanian mobile number. SANDBOX ONLY: no SMS is sent; the code is a
// fixed test code (PHONE_TEST_CODE, default 123456), accepted only while DEMO_MODE is on. In
// production the code check would go to an SMS verification provider such as Twilio Verify.
//
// The session is a real Supabase session, because the money functions and RLS run on auth.uid():
// verify finds or creates the user, asks the admin API for a magic link (generateLink only returns
// it, nothing is mailed) and hands back its token_hash. The app trades that for a session with
// supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }).
//
// Called before anyone is signed in, so verify_jwt is off for it (supabase/config.toml).
import { admin, cors, DEMO_MODE, fail, json } from '../_shared/env.ts';
import { MSG } from '../_shared/billing.ts';
import { maskPhone, parsePhoneRequest, PHONE_MSG, sameCode, scrub, syntheticEmail, testCodeFrom } from '../_shared/phone.ts';

const TEST_CODE = testCodeFrom(Deno.env.get('PHONE_TEST_CODE'));
if (Deno.env.get('PHONE_TEST_CODE') !== undefined && Deno.env.get('PHONE_TEST_CODE') !== TEST_CODE) {
  console.warn('[auth-phone] PHONE_TEST_CODE is not 6 digits; using the default test code');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (!DEMO_MODE) return fail(PHONE_MSG.off, 503);
  if (req.method !== 'POST') return fail(PHONE_MSG.badBody, 400);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return fail(PHONE_MSG.badBody, 400);
  }
  const parsed = parsePhoneRequest(body);
  if (!parsed.ok) return fail(parsed.error, 400);
  const r = parsed.req;
  const who = maskPhone(r.phone);
  try {
    if (r.action === 'start') {
      // nothing to send: the app tells the person to type the test code
      console.log(`[auth-phone] start ${who}`);
      return json({ ok: true });
    }
    return await verify(r.phone, r.code, who);
  } catch (e) {
    console.error(`[auth-phone] ${r.action} ${who} failed: ${describe(e)}`);
    return fail(MSG.generic, 500);
  }
});

async function verify(phone: string, code: string, who: string): Promise<Response> {
  // counts this attempt, or refuses it after 10 in 10 minutes for this number (0015_phone_login.sql)
  const { data: allowed, error } = await admin.rpc('phone_login_attempt', { p_phone: phone });
  if (error) throw error;
  if (allowed !== true) {
    console.warn(`[auth-phone] verify ${who}: too many attempts`);
    return fail(PHONE_MSG.tooMany, 429);
  }
  if (!sameCode(code, TEST_CODE)) {
    console.log(`[auth-phone] verify ${who}: wrong code`);
    return fail(PHONE_MSG.wrongCode, 401);
  }

  const { user, isNew } = await findOrCreate(phone);
  const { data, error: linkError } = await admin.auth.admin.generateLink({ type: 'magiclink', email: user.email });
  const tokenHash = data?.properties?.hashed_token;
  if (linkError || !tokenHash) throw linkError ?? new Error('generateLink returned no hashed_token');
  console.log(`[auth-phone] verify ${who}: ok, ${isNew ? 'new' : 'existing'} user ${user.id}`);
  return json({ token_hash: tokenHash, is_new: isNew });
}

type PhoneUser = { id: string; email: string };

async function lookup(phone: string): Promise<{ id: string; email: string | null } | null> {
  const { data, error } = await admin.rpc('auth_user_by_phone', { p_phone: phone });
  if (error) throw error;
  const row = (data as { user_id: string; email: string | null }[] | null)?.[0];
  return row ? { id: row.user_id, email: row.email } : null;
}

async function findOrCreate(phone: string): Promise<{ user: PhoneUser; isNew: boolean }> {
  const found = await lookup(phone);
  if (found) return { user: await withEmail(found, phone), isNew: false };

  const email = syntheticEmail(phone);
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
    email,
    email_confirm: true,
    user_metadata: { phone },
  });
  // the on_auth_user_created trigger has made the profiles row by now (same transaction)
  if (!error && data.user) return { user: { id: data.user.id, email }, isNew: true };

  // two verifies at once for a new number: the other one created the user a moment ago
  const raced = await lookup(phone);
  if (raced) return { user: await withEmail(raced, phone), isNew: false };
  throw error ?? new Error('createUser returned no user');
}

/** generateLink needs an email; a phone-only user made some other way gets the synthetic one. */
async function withEmail(u: { id: string; email: string | null }, phone: string): Promise<PhoneUser> {
  if (u.email) return { id: u.id, email: u.email };
  const email = syntheticEmail(phone);
  const { error } = await admin.auth.admin.updateUserById(u.id, { email, email_confirm: true });
  if (error) throw error;
  return { id: u.id, email };
}

/** An error for the logs, with any phone number in it cut to its last 3 digits. */
function describe(e: unknown): string {
  const o = (e ?? {}) as { name?: string; code?: string; status?: number; message?: string };
  return scrub(`${o.name ?? 'Error'} ${o.code ?? ''} ${o.status ?? ''}: ${o.message ?? String(e)}`);
}
