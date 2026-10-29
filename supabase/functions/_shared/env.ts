// Shared plumbing for the Edge Functions: Stripe client, a service-role Supabase client,
// CORS, JSON helpers and "who is calling" from the user's JWT.
import Stripe from 'npm:stripe@17.7.0';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.49.4';
import { returnUrl, webUrl } from './urls.ts';

// Pure date helper, kept importable from here for the functions that already do.
export { bucharestDate } from './dates.ts';

export const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') ?? '', {
  httpClient: Stripe.createFetchHttpClient(),
});

export const admin: SupabaseClient = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

const CONFIGURED_URL = webUrl(Deno.env.get('APP_URL'));
if (Deno.env.get('APP_URL') && !CONFIGURED_URL) console.warn('[env] APP_URL is not an http(s) URL; falling back to the caller\'s origin');

/** Where Stripe sends the student back after Checkout (rules in urls.ts). */
export function appUrl(req: Request): string {
  return returnUrl(req.headers.get('Origin'), CONFIGURED_URL);
}

// Every sandbox user gets a Stripe test clock so the demo can fast-forward months.
export const DEMO_MODE = (Deno.env.get('DEMO_MODE') ?? 'true') === 'true';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}

/** The signed-in user calling the function, or null. */
export async function caller(req: Request): Promise<{ id: string; email: string | null } | null> {
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Tells Kip something happened (app_events). The webhook passes the Stripe event id: then it is
 * written once per event and type, so a retried event doesn't say it twice, and a failed write
 * throws, so the event is marked failed and Stripe retries it. Other callers (the demo) only log a
 * failed write, as before.
 */
export async function logEvent(userId: string, type: string, payload: Record<string, unknown> = {}, stripeEventId: string | null = null) {
  const row = { user_id: userId, type, payload, ...(stripeEventId ? { stripe_event_id: stripeEventId } : {}) };
  const { error } = await admin.from('app_events').insert(row);
  if (!error) return;
  if (!stripeEventId) {
    console.error(`[events] ${type} for ${userId} not saved: ${error.message}`);
    return;
  }
  if (error.code === '23505') return; // already said for this event: an earlier attempt got this far
  throw new Error(`app_events ${type}: ${error.message}`);
}
