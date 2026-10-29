import { createClient } from '@supabase/supabase-js';

// The browser only ever gets the public (anon / publishable) key. Row Level Security decides what a
// signed-in user can read, and every money movement goes through the Edge Functions, which hold
// the Stripe secret. Same client as the Avansul app (kept/app/src/lib/supabase.ts).
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** False when app/.env.local is missing: the app still runs, with only the local demo. */
export const backendReady = !!url && !!key;

if (!backendReady) console.warn('VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are missing: only the local demo works.');

export const supabase = createClient(url || 'http://127.0.0.1:54321', key || 'missing', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

/** An Edge Function said no. `message` is the backend's own text, ready to show. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/**
 * Calls an Edge Function from supabase/CONTRACT.md and returns its JSON. Errors come back as
 * { error: "<message>" } with a 4xx/5xx status; that message is what the user sees.
 */
export async function callFn<T = Record<string, unknown>>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (!error) return data as T;
  const ctx = (error as { context?: Response }).context;
  if (ctx && typeof ctx.status === 'number') {
    let message = '';
    try {
      const j = await ctx.clone().json();
      if (typeof j?.error === 'string') message = j.error;
    } catch {
      /* not JSON: fall back below */
    }
    if (!message) message = ctx.status === 401 ? 'You need to be signed in.' : 'Something went wrong. Try again in a few seconds.';
    throw new ApiError(message, ctx.status);
  }
  throw new ApiError("We couldn't reach the server. Check your internet and try again.", 0);
}
