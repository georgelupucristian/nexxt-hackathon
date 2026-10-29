# Testing the money backend

Kip moves real money in a Stripe sandbox, so the backend has two test suites: Deno unit tests for
the maths that decides what Stripe charges, and database tests that prove one student can never
see or touch another student's money. CI runs both on every change under `supabase/`.

Latest results (29 October 2026):

| Suite | Where | Result |
|---|---|---|
| Deno unit tests | `supabase/functions/_shared/*_test.ts` | 85 passed, 0 failed |
| Database tests | live project `sdcnwuapuesxpwphxaaq` | 127 passed, 0 failed |
| Database tests | local database built from `supabase/migrations` (0011 to 0015 applied in the same rolled-back transaction) | 127 passed, 0 failed |
| Type check | `deno check` on all 6 Edge Functions | clean |
| Live phone sign-in | `auth-phone` on the live project, test number `0700000001` | 401 on a wrong code, 429 on the 11th try, `token_hash` traded for a session that reads its own profile |
| Live money run | the real app on the live project, test account, Stripe sandbox | extra deposit "now" confirmed by the webhook in 8.5 s, withdraw of 10 lei, every read 200 |

## Unit tests (Deno)

```bash
deno test --allow-env --allow-read supabase/functions
```

No network, no Stripe key, no database. The pure logic lives in small modules next to the code
that uses it, and each has a `_test.ts` beside it:

- **Plan maths** (`plan.ts`, `rules.ts`). The first payment covers only the days until payday,
  the monthly top-up is the daily amount × 30, and the Checkout trial is exactly the days paid up
  front. Edge cases: payday today (full month now), payday tomorrow (the cycle is anchored on
  tomorrow, because Checkout needs a trial of at least 2 days), the 28th, 31 January, leap years,
  New Year. Two sweeps check every day of 2026 to 2028 against every payday from 1 to 28 (about
  30,000 cases each): the plan always lands on the next payday, never skips one, and the first
  payment is never more than a monthly top-up.
- **Bucharest dates** (`dates.ts`). Money days turn at midnight in Bucharest, not in UTC, in
  winter and in summer and on both daylight saving switches. A student starting at 00:30 in
  Bucharest on payday pays a full month, even though it is still yesterday in UTC.
- **Return URLs** (`urls.ts`, `env.ts`). After Checkout, Stripe sends people back to the app that
  asked when it is localhost or a `*.vercel.app` preview; a foreign origin, `null`, `javascript:`
  or `file:` is ignored; a bad `APP_URL` (for example `localhost:5173` without `http://`) is
  dropped and the caller or the dev address is used instead. These run against the real
  `appUrl(req)` in `env.ts`, loaded with different `APP_URL` values.
- **Withdraw limit and parent match** (`rules.ts`). A student can withdraw everything in the pot
  except the parent's matched money; pending, failed and "saved elsewhere" money never counts;
  the limit is never negative. A parent's match follows the ratio and never goes over the monthly
  cap, however many top-ups arrive.
- **Webhook mapping** (`stripe_map.ts`). Which ledger row each Stripe event writes: a paid
  invoice splits into the top-up and any extra deposits that rode on it; a parent's payment goes
  into the goal marked as matched; an extra deposit goes into `de_pus_deoparte`; anything that
  is not Kip money is ignored. Every Stripe subscription status maps to a value the `profiles`
  table accepts.
- **Webhook order** (`webhook_gate.ts`). The webhook claims an event, handles it, then marks it
  done, and the tests drive that with an in-memory event log and a fake clock: a replay of a
  processed or ignored event runs nothing; a handler that throws marks the event failed and the
  retry runs it again; a function that dies mid-handler is not lost (a retry inside 10 minutes
  gets 409, after that it takes the claim over); two deliveries at once run the handler once; a
  slow attempt that was taken over cannot overwrite the newer result; and a retry after a
  half-finished attempt counts no money, week or message twice.
- **Phone sign-in** (`phone.ts`). A Romanian mobile number typed any usual way (`07…`, `+407…`,
  `00407…`, spaces, dashes, non-breaking spaces) becomes the same E.164 number; landlines,
  foreign numbers, a missing prefix, `+40` with the national 0, wrong lengths, letters and
  non-ASCII digits are refused. The request check gives a bad body, a bad number and a bad code
  their own message; the test code falls back to 123456 unless `PHONE_TEST_CODE` is 6 digits;
  and the log scrubber leaves only the last 3 digits of any number in a message.
- **Code and schema agree.** Some tests read `0001_avansul_schema.sql` and check that the daily
  limits, the payday range and the allowed ledger values match what the code produces, and that
  the webhook's statuses and 10 minute window match `0013_webhook_event_claims.sql`.

There are no "cool-off" rules in the code today, so there is nothing of that kind to test.

## Database tests (SQL)

```bash
supabase start                      # or: supabase db start
supabase/tests/run.sh               # or: DATABASE_URL='postgresql://...' supabase/tests/run.sh
```

`supabase/tests/rls_and_ledger.sql` is one transaction that ends in `ROLLBACK`. It creates two
test students, gives them goals, top-ups, a parent match and a parent link, runs every case and
then throws all of it away, so it is safe to run on the live project (the SQL editor, or the
Supabase MCP `execute_sql` tool). Nothing commits, so Realtime never broadcasts any of it. Each
case acts as a real user the way the API does: `set local role authenticated` plus
`set local request.jwt.claims` with that user's id. The runner prints one PASS or FAIL line per
case and exits 1 if any case fails.

What the 107 cases cover:

- **Student A against student B (51 cases).** A cannot read B's profile, goals, ledger, balance,
  parent links (their tokens are secrets), weekly progress or app events, and cannot change or
  delete any of them. A cannot write any ledger row at all, not even "I saved this elsewhere", and
  such a row written by the backend never counts as money in the pot. A cannot set their own
  subscription status, Stripe customer, demo flag or test-clock date, cannot create, activate or
  revoke a parent link directly, cannot claim a Stripe event or call any money function
  (`record_stripe_money`, `withdraw_own`, the allocation), and only `check_in()` is callable from
  the app. Positive checks (A sees their own data) make sure the policies are not passing just by
  blocking everything.
- **Not signed in (12 cases).** The anon key reads nothing private and writes nothing.
- **Grants (9 cases).** anon holds no privilege on any table or view. Signed-in users hold exactly
  what the app uses (read `profiles`, `goals`, `ledger_entries`, `balances`; edit 4 plan fields;
  add, edit and delete goals), checked as one exact list. Nobody but the service role can write
  the ledger or touch `stripe_events`, or TRUNCATE any table. A table a later migration adds
  gives anon and signed-in users nothing. The app's own writes still work.
- **Idempotency (7 cases).** The same Stripe event id cannot be logged twice. Delivering the same
  event twice writes one ledger row; an invoice with a top-up and an extra deposit stays two rows
  when replayed; a late "failed" never undoes a confirmed payment; a failed invoice that is paid
  later is one row that ends confirmed; even a direct insert cannot add a second row for the same
  Stripe object; and a ledger row with a Stripe-looking id cannot block a webhook row.
- **Webhook claims (14 cases).** The first delivery claims an event; a second one while it runs
  is not claimed; a claim 9 minutes old holds and one 11 minutes old is taken over; the attempt
  that was taken over cannot record its result; a processed or ignored event is never claimed
  again, even days later; a failed one is. `bump_week` counts an extra deposit once per event and
  Kip's message for an event is written once per type.
- **Ledger consistency (14 cases).** For every user in the database, real ones included, the
  `balances` view equals the sum of confirmed ledger rows, before and after the tests move money.
  Pending and failed money is never in a balance, every daily allocation is a pair that sums to
  zero, no bucket or goal goes negative, the allocation runs once per day, withdrawing 1 ban more
  than your own money is refused with the exact limit, and after withdrawing everything only the
  parent's match is left. The nightly job is scheduled at 22:05 UTC, which is already the new day
  in Bucharest in winter and in summer.
- **Phone sign-in (20 cases).** A user made with a phone gets a `profiles` row from the same
  trigger. `auth_user_by_phone` and `phone_login_attempt` run only for the service role; anon
  and a signed-in user get 42501 on both, and on reading, writing or clearing
  `phone_login_attempts` (RLS on, no policies). The lookup finds the user with or without the
  `+` and nobody for an unknown number. The counter allows 10 attempts per number, refuses the
  11th without counting it, leaves other numbers alone, takes only E.164, and opens again once
  the attempts are older than 10 minutes.

Until `0014_tighten_api_grants.sql` the live project still had Supabase's older default grants
(anon and signed-in users held every privilege on every table, RLS did all the blocking), while a
fresh database only had the grants in the migrations. 0014 makes both the same, and the grants
cases check it on each. On the live project the file runs through the Supabase MCP
`execute_sql` tool, still one transaction that ends in `ROLLBACK`.

## Live money run

After the grants change and the new webhook were deployed, the real app (`kip-money`, on
`localhost:5174`) was driven against the live project with the existing test account: sign in,
an extra deposit of 25 lei "now", a withdraw that is too large (refused, "at most 139 lei"), then
a withdraw of 10 lei. Every table read the app made returned 200, both `payments` calls returned
200, the webhook got one `payment_intent.succeeded`, answered 200 and left it `processed` after
one attempt, with the confirmed ledger row, one `extra_deposit_confirmed` message tagged with the
event id, and the week counted once.

## CI

`.github/workflows/backend.yml` has one job, `backend`: `deno check` on every function, the Deno
tests, then `supabase db start` (only the Postgres container, with every migration and
`seed.sql` applied from scratch) and `supabase/tests/run.sh`. It needs no secrets. Running the SQL
in CI rather than by hand means a migration that breaks a policy fails the build, and it also
proves the migrations still build a working schema from nothing. The whole job was rehearsed
locally on a fresh database before it was committed.

## Database advisors

Supabase's security and performance advisors were run on the live project. The security
advisor gave the same three findings before and after 0013 and 0014 (the new functions add none):

- **Fixed:** two foreign keys had no index (`ledger_entries.goal_id`, `parent_links.student_user_id`).
  `0012_index_foreign_keys.sql` adds them; both columns sit on hot paths (RLS, the webhook's
  parent lookup, milestones, withdrawals).
- **By design:** `stripe_events` has RLS on and no policies, so only the service role (the
  webhook) can touch it. `check_in()` is a security definer function callable by signed-in users
  on purpose: it only writes the caller's own week, and making it security invoker would mean
  letting users write `weekly_progress` directly.
- **Dashboard setting, not code:** leaked password protection (HaveIBeenPwned) is off in Auth.
