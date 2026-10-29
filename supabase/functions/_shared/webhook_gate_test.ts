// The webhook's order (claim, handle, then mark done), driven with an in-memory event log that
// follows the same rules as claim_stripe_event / finish_stripe_event in 0013, a fake clock, and
// handlers that succeed, throw, hang or "die". No network, no database.
import { assert, assertEquals } from 'jsr:@std/assert@1.0.14';
import { CLAIM_STALE_MS, type Claim, type EventLog, type EventRef, type FinalStatus, type Outcome, runEventOnce } from './webhook_gate.ts';

const migration = Deno.readTextFileSync(new URL('../../migrations/0013_webhook_event_claims.sql', import.meta.url));

interface Row {
  status: string;
  attempts: number;
  claimedAt: number;
  userId: string | null;
  error: string | null;
}

/** stripe_events in memory. Each claim is atomic (no await inside), like the one SQL statement. */
class MemoryLog implements EventLog {
  rows = new Map<string, Row>();
  now = 0;
  calls: string[] = [];
  claimFails = false;
  finishFails = false;

  claim(e: EventRef): Promise<Claim> {
    this.calls.push('claim');
    if (this.claimFails) return Promise.reject(new Error('database unavailable'));
    const r = this.rows.get(e.id);
    if (!r) {
      this.rows.set(e.id, { status: 'processing', attempts: 1, claimedAt: this.now, userId: null, error: null });
      return Promise.resolve({ claimed: true, attempt: 1 });
    }
    if (r.status === 'failed' || (r.status === 'processing' && r.claimedAt < this.now - CLAIM_STALE_MS)) {
      Object.assign(r, { status: 'processing', attempts: r.attempts + 1, claimedAt: this.now, error: null });
      return Promise.resolve({ claimed: true, attempt: r.attempts });
    }
    return Promise.resolve({ claimed: false, status: r.status });
  }

  finish(id: string, attempt: number, status: FinalStatus, userId: string | null, error: string | null): Promise<boolean> {
    this.calls.push(`finish ${status}`);
    if (this.finishFails) return Promise.reject(new Error('database unavailable'));
    const r = this.rows.get(id);
    if (!r || r.attempts !== attempt || r.status !== 'processing') return Promise.resolve(false);
    Object.assign(r, { status, userId: userId ?? r.userId, error });
    return Promise.resolve(true);
  }
}

const EVENT: EventRef = { id: 'evt_1', type: 'payment_intent.succeeded', objectId: 'pi_1', livemode: false };
const MINUTE = 60_000;

/** A handler that records its calls in the log's call list and returns `out`. */
const handler = (log: MemoryLog, out: Outcome = { userId: 'user-1' }) => () => {
  log.calls.push('handle');
  return Promise.resolve(out);
};

/** A promise the test resolves by hand: an attempt that is still running. */
function pending<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// ---------- the normal path ----------

Deno.test('webhook gate: a new event is claimed, then handled, then marked processed, in that order', async () => {
  const log = new MemoryLog();
  const reply = await runEventOnce(log, EVENT, handler(log));
  assertEquals(log.calls, ['claim', 'handle', 'finish processed']);
  assertEquals(reply, { status: 200, body: { received: true } });
  assertEquals(log.rows.get('evt_1'), { status: 'processed', attempts: 1, claimedAt: 0, userId: 'user-1', error: null });
});

Deno.test('webhook gate: an event that is not Kip money is marked ignored', async () => {
  const log = new MemoryLog();
  const reply = await runEventOnce(log, EVENT, handler(log, { ignored: true }));
  assertEquals(reply.status, 200);
  assertEquals(log.rows.get('evt_1')?.status, 'ignored');
});

Deno.test('webhook gate: a replay of a processed or ignored event is a 200 that runs nothing', async () => {
  for (const out of [{ userId: 'user-1' }, { ignored: true }]) {
    const log = new MemoryLog();
    await runEventOnce(log, EVENT, handler(log, out));
    log.calls = [];
    log.now += 3 * 24 * 60 * MINUTE; // Stripe may redeliver days later; a finished event never goes stale
    const reply = await runEventOnce(log, EVENT, handler(log, out));
    assertEquals(reply, { status: 200, body: { received: true, duplicate: true } });
    assertEquals(log.calls, ['claim']);
  }
});

// ---------- failures ----------

Deno.test('webhook gate: the handler throws: marked failed with the message, 500, and the retry runs it again', async () => {
  const log = new MemoryLog();
  let runs = 0;
  const flaky = () => {
    runs++;
    return runs === 1 ? Promise.reject(new Error('stripe timeout')) : Promise.resolve({ userId: 'user-1' });
  };
  const first = await runEventOnce(log, EVENT, flaky);
  assertEquals(first, { status: 500, body: { error: 'processing failed' } });
  assertEquals(log.rows.get('evt_1')?.status, 'failed');
  assertEquals(log.rows.get('evt_1')?.error, 'stripe timeout');

  log.now += MINUTE; // a failed event is retried right away, no stale wait
  const retry = await runEventOnce(log, EVENT, flaky);
  assertEquals(retry.status, 200);
  assertEquals(runs, 2);
  assertEquals(log.rows.get('evt_1')?.status, 'processed');
  assertEquals(log.rows.get('evt_1')?.attempts, 2);
  assertEquals(log.rows.get('evt_1')?.error, null);
});

Deno.test('webhook gate: the function dies mid-handler: the event is not lost (the bug this fixes)', async () => {
  const log = new MemoryLog();
  // attempt 1 claims and then the isolate is killed: the handler never returns, nothing is marked
  void runEventOnce(log, EVENT, () => new Promise<Outcome>(() => {}));
  await Promise.resolve();
  assertEquals(log.rows.get('evt_1')?.status, 'processing');

  // Stripe retries within the window: not a 200 (that would drop the event), so it retries again
  log.now += CLAIM_STALE_MS - MINUTE;
  log.calls = [];
  assertEquals((await runEventOnce(log, EVENT, handler(log))).status, 409);
  assertEquals(log.calls, ['claim']);

  // after the window the dead claim is taken over and the event runs
  log.now += 2 * MINUTE;
  const reply = await runEventOnce(log, EVENT, handler(log));
  assertEquals(reply.status, 200);
  assertEquals(log.calls, ['claim', 'claim', 'handle', 'finish processed']);
  assertEquals(log.rows.get('evt_1')?.attempts, 2);
  assertEquals(log.rows.get('evt_1')?.status, 'processed');
});

Deno.test('webhook gate: handled but the result could not be saved: 500, and a later retry runs it again', async () => {
  const log = new MemoryLog();
  log.finishFails = true;
  assertEquals((await runEventOnce(log, EVENT, handler(log))).status, 500);
  assertEquals(log.rows.get('evt_1')?.status, 'processing');
  log.finishFails = false;
  log.now += CLAIM_STALE_MS + MINUTE;
  assertEquals((await runEventOnce(log, EVENT, handler(log))).status, 200);
  assertEquals(log.calls.filter((c) => c === 'handle').length, 2);
  assertEquals(log.rows.get('evt_1')?.status, 'processed');
});

Deno.test('webhook gate: the handler throws and marking it failed fails too: the claim goes stale and the retry runs it', async () => {
  const log = new MemoryLog();
  log.finishFails = true;
  const reply = await runEventOnce(log, EVENT, () => Promise.reject(new Error('boom')));
  assertEquals(reply.status, 500);
  log.finishFails = false;
  log.now += CLAIM_STALE_MS + MINUTE;
  assertEquals((await runEventOnce(log, EVENT, handler(log))).status, 200);
  assertEquals(log.rows.get('evt_1')?.status, 'processed');
});

Deno.test('webhook gate: the claim itself fails: 500 and the handler does not run', async () => {
  const log = new MemoryLog();
  log.claimFails = true;
  assertEquals(await runEventOnce(log, EVENT, handler(log)), { status: 500, body: { error: 'db' } });
  assertEquals(log.calls, ['claim']);
});

// ---------- concurrency ----------

Deno.test('webhook gate: two deliveries at once: the handler runs once, the other gets 409, then a no-op on retry', async () => {
  const log = new MemoryLog();
  const slow = pending<Outcome>();
  let runs = 0;
  const handle = () => {
    runs++;
    return slow.promise;
  };
  const a = runEventOnce(log, EVENT, handle);
  const b = runEventOnce(log, EVENT, handle);
  assertEquals((await b).status, 409);
  slow.resolve({ userId: 'user-1' });
  assertEquals((await a).status, 200);
  assertEquals(runs, 1);
  assertEquals(await runEventOnce(log, EVENT, handle), { status: 200, body: { received: true, duplicate: true } });
  assertEquals(runs, 1);
});

Deno.test('webhook gate: a slow attempt that was taken over cannot overwrite the newer result', async () => {
  const log = new MemoryLog();
  const slow = pending<Outcome>();
  const first = runEventOnce(log, EVENT, () => slow.promise);
  await Promise.resolve();
  log.now += CLAIM_STALE_MS + MINUTE;
  // attempt 2 takes the stale claim over and fails
  assertEquals((await runEventOnce(log, EVENT, () => Promise.reject(new Error('declined')))).status, 500);
  // attempt 1 finally returns: its work is idempotent, so 200, but the row stays as attempt 2 left it
  slow.resolve({ userId: 'user-1' });
  assertEquals((await first).status, 200);
  assertEquals(log.rows.get('evt_1')?.status, 'failed');
  assertEquals(log.rows.get('evt_1')?.attempts, 2);
});

// ---------- what "handle it again" relies on ----------

Deno.test('webhook gate: a retry after a mid-handler failure counts nothing twice (effects keyed like the real ones)', async () => {
  // The real keys: money by (Stripe object, type) in record_stripe_money, the weekly counter by
  // event id in bump_week, Kip's events by (event id, type) in app_events.
  const money = new Map<string, number>();
  const bumped = new Set<string>();
  const said = new Set<string>();
  let weekCount = 0;
  let failLog = true;
  const handle = (eventId: string) => () => {
    money.set('pi_1:extra_deposit', 2500);
    if (!bumped.has(eventId)) {
      bumped.add(eventId);
      weekCount++;
    }
    if (failLog) {
      failLog = false;
      return Promise.reject(new Error('app_events: connection reset'));
    }
    said.add(`${eventId}:extra_deposit_confirmed`);
    return Promise.resolve({ userId: 'user-1' });
  };
  const log = new MemoryLog();
  assertEquals((await runEventOnce(log, EVENT, handle(EVENT.id))).status, 500);
  assertEquals((await runEventOnce(log, EVENT, handle(EVENT.id))).status, 200);
  assertEquals((await runEventOnce(log, EVENT, handle(EVENT.id))).status, 200); // a replay of the finished event
  assertEquals([money.size, weekCount, said.size], [1, 1, 1]);
});

// ---------- code and schema agree ----------

Deno.test('webhook gate: the stale window in code is the one claim_stripe_event uses', () => {
  const fn = migration.slice(migration.indexOf('create or replace function public.claim_stripe_event'));
  const m = /claimed_at < now\(\) - interval '(\d+) minutes'/.exec(fn);
  assert(m, 'no stale interval in claim_stripe_event');
  assertEquals(Number(m[1]) * MINUTE, CLAIM_STALE_MS);
});

Deno.test('webhook gate: every status the gate writes is one stripe_events allows', () => {
  const m = /add constraint stripe_events_status_check check \(status in \(([^)]*)\)\)/.exec(migration);
  assert(m, 'no status check in 0013');
  const allowed = m[1].split(',').map((s) => s.trim().replace(/'/g, ''));
  const written: string[] = ['processing', 'processed', 'ignored', 'failed'] satisfies (FinalStatus | 'processing')[];
  assertEquals(allowed.sort(), written.sort());
});
