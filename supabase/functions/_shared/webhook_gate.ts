// The order the Stripe webhook runs an event in: claim it, handle it, then mark it done.
// Pure: the event log (stripe_events, through claim_stripe_event and finish_stripe_event in
// 0013_webhook_event_claims.sql) and the handler are passed in, so the unit tests can drive it with
// an in-memory log, a fake clock and handlers that fail or never finish.

export interface EventRef {
  id: string;
  type: string;
  objectId: string | null;
  livemode: boolean;
}

/** What a handler reports: the student it was about, or that the event isn't Kip's business. */
export interface Outcome {
  userId?: string | null;
  ignored?: boolean;
}

/** claimed: this delivery runs the event. Not claimed: `status` says why (done, or someone else on it). */
export type Claim = { claimed: true; attempt: number } | { claimed: false; status: string | null };

export type FinalStatus = 'processed' | 'ignored' | 'failed';

export interface EventLog {
  claim(e: EventRef): Promise<Claim>;
  /** False when this attempt no longer holds the claim (a later retry took a stale one over). */
  finish(eventId: string, attempt: number, status: FinalStatus, userId: string | null, error: string | null): Promise<boolean>;
}

/**
 * How long a claim protects an event before a retry may take it over. Longer than an Edge Function
 * can run, so a claim this old belongs to an attempt that died. The SQL in 0013 uses the same
 * interval (a unit test checks they agree).
 */
export const CLAIM_STALE_MS = 10 * 60 * 1000;

export interface GateReply {
  status: number;
  body: Record<string, unknown>;
}

/**
 * Runs `handle` for an event at most once at a time, and until it has succeeded once:
 *  - processed or ignored already: 200, the handler doesn't run (Stripe stops retrying)
 *  - another delivery holds a fresh claim: 409, so Stripe retries later; if that delivery dies,
 *    a later retry takes the stale claim over
 *  - the handler throws: the event is marked failed and the answer is 500, so Stripe retries and
 *    the retry runs it again
 *  - handled but the result couldn't be saved: 500 as well; the retry runs it again after the
 *    claim goes stale (the handler is idempotent)
 */
export async function runEventOnce(log: EventLog, e: EventRef, handle: () => Promise<Outcome>): Promise<GateReply> {
  let claim: Claim;
  try {
    claim = await log.claim(e);
  } catch (err) {
    console.error(`[webhook] ${e.id}: could not claim the event:`, err);
    return { status: 500, body: { error: 'db' } };
  }
  if (!claim.claimed) {
    if (claim.status === 'processed' || claim.status === 'ignored') return { status: 200, body: { received: true, duplicate: true } };
    return { status: 409, body: { error: 'in progress' } };
  }

  let out: Outcome;
  try {
    out = await handle();
  } catch (err) {
    const message = ((err as Error)?.message ?? String(err)).slice(0, 500);
    console.error(`[webhook] ${e.type} ${e.id} failed (attempt ${claim.attempt}):`, err);
    // if even this fails the claim stays 'processing' and goes stale: Stripe's retry still gets it
    await log.finish(e.id, claim.attempt, 'failed', null, message).catch((f) => console.error(`[webhook] ${e.id}: could not mark it failed:`, f));
    return { status: 500, body: { error: 'processing failed' } };
  }

  try {
    const mine = await log.finish(e.id, claim.attempt, out.ignored ? 'ignored' : 'processed', out.userId ?? null, null);
    if (!mine) console.warn(`[webhook] ${e.id}: attempt ${claim.attempt} was taken over; the newer attempt records the result`);
  } catch (err) {
    console.error(`[webhook] ${e.id}: handled, but could not mark it done:`, err);
    return { status: 500, body: { error: 'db' } };
  }
  return { status: 200, body: { received: true } };
}
