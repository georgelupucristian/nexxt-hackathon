# Backend: Supabase + Stripe

The backend is a Supabase project (Postgres, Auth, Realtime, Edge Functions) plus a Stripe sandbox.
The API the app calls is in [`supabase/CONTRACT.md`](../supabase/CONTRACT.md).

```
supabase/
  migrations/      schema, RLS, ledger + balances view, money functions, pg_cron, grants
  seed.sql         local demo account (ana.visual@avansul.test), recreated on db reset
  functions/
    _shared/       env.ts (clients, CORS, caller), rules.ts (pure money rules), billing.ts (Stripe helpers),
                   phone.ts (phone number and code rules for auth-phone)
    auth-phone/    sign-in by phone with a test code, sandbox only                 (verify_jwt = false)
    payments/      start, fix_card, update_daily, pause/resume, extra_deposit, withdraw
    family/        invite / revoke a parent
    parent/        public parent page (token): get, setup card, stop        (verify_jwt = false)
    demo/          test-clock controls for sandbox students
    stripe-webhook/  the only way Stripe money enters the ledger            (verify_jwt = false)
  config.toml
```

Money rules in one paragraph: amounts are integer bani; `ledger_entries` is the only source of
balances; Stripe money is written only by the webhook (pending → confirmed / failed, one row per
Stripe object, replayed events do nothing); the nightly job moves the daily amount from
`de_pus_deoparte` into the primary goal; a parent's matched money can't be withdrawn.

## Phone sign-in (test code, sandbox only)

`auth-phone` signs people in with a Romanian mobile number without sending an SMS, so the demo
needs neither an SMS provider nor a mail domain. **This is not real phone verification:** the
code is a fixed test code (`123456`, or the `PHONE_TEST_CODE` secret if it is 6 digits), anyone
who knows a number can sign in as it, and the function only accepts it while `DEMO_MODE` is on
(otherwise it answers 503). For production, swap the code check for an SMS verification
provider such as Twilio Verify (`start` sends the code, `verify` asks the provider whether it is
right); the request and reply shapes stay the same.

The session it leads to is a real Supabase session, because RLS and the money functions run on
`auth.uid()`:

1. `start` validates the number and normalises it to E.164 (`+40712345678`). Nothing else.
2. `verify` counts the attempt with `phone_login_attempt` (at most 10 per number in 10 minutes,
   else 429), checks the code (401 if wrong), then finds the user with
   `auth_user_by_phone` or creates one with `auth.admin.createUser` (phone confirmed, plus a
   placeholder email `<digits>@phone.kip.invalid` that never receives mail). The
   `on_auth_user_created` trigger gives a new user their `profiles` row, as for email sign-ups.
3. It calls `auth.admin.generateLink({ type: 'magiclink', email })`, which only returns the link
   and sends nothing, and replies `{ token_hash, is_new }`.
4. The app calls `supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })` and has a session.

`auth_user_by_phone`, `phone_login_attempt` and the `phone_login_attempts` table
(`0015_phone_login.sql`) are service-role only: anon and signed-in users can't execute or read
any of them, and the table has RLS on with no policies. Logs carry only the last 3 digits of a
number and never a code or a token. (Supabase Auth's own audit log does record the phone of each
sign-in, as it does the email for email sign-ins.)

The Auth phone provider stays off. Test number on the live project: `0700000001`.

## Webhook flow

`stripe-webhook` checks Stripe's signature, then runs the event through `_shared/webhook_gate.ts`:

1. **Claim.** `claim_stripe_event` inserts the event id into `stripe_events` as `processing`
   (attempt 1). If the row already exists it only takes it over when the event `failed`, or when
   a `processing` claim is older than 10 minutes (longer than a function may run, so that attempt
   died); the attempt number goes up by one. It is one `INSERT ... ON CONFLICT` on the event id, so
   two deliveries at once can't both win.
2. **Handle.** Only the delivery that holds the claim runs the handler.
3. **Finish.** `finish_stripe_event` marks it `processed` or `ignored` (not Kip money), or
   `failed` with the error, but only for the attempt that still holds the claim.

What Stripe gets back: 200 when handled, or when the event was already `processed` / `ignored`
(a replay); 409 while another delivery holds a fresh claim; 500 when the handler failed or the
result couldn't be saved. Anything but a 2xx makes Stripe retry later, so an event is never lost
to a crash halfway through.

Because a retry runs the handler again, everything it writes is once per event: money through
`record_stripe_money` (one row per Stripe object and type), Kip's messages through `logEvent` with
the event id (`app_events` is unique on event id and type), and the weekly counter through
`bump_week(user, date, event)` (it flags the event in `stripe_events.week_bumped`). A
`topup_failed` message is still once per invoice, except when the row was written by this same
event's earlier attempt.

Signed-in users can't touch any of this: since `0014_tighten_api_grants.sql` the Data API gives
anon nothing, and signed-in users only what the app uses (read `profiles`, `goals`,
`ledger_entries`, `balances`; edit 4 plan fields; manage goals; `check_in()`). Everything else
goes through the Edge Functions with the service role.

## Run it locally

Needs Docker, the Supabase CLI (2.107+), the Stripe CLI (1.55+) and a Stripe sandbox secret key.

```bash
# 1. database, auth, realtime, functions runtime (applies every migration + seed.sql on first start)
supabase start
supabase status -o env          # API_URL, ANON_KEY, SERVICE_ROLE_KEY for the app's .env

# 2. function secrets (supabase/functions/.env is gitignored)
cp supabase/functions/.env.example supabase/functions/.env
#    STRIPE_SECRET_KEY=sk_test_...      (never commit it)
#    STRIPE_WEBHOOK_SECRET=$(stripe listen --api-key "$STRIPE_SECRET_KEY" --print-secret)
#    APP_URL=http://localhost:5173
#    DEMO_MODE=true

# 3. serve the functions with those secrets (hot reload) – keep running
supabase functions serve --env-file supabase/functions/.env

# 4. forward Stripe events to the webhook – keep running (CLI 1.55 requires --events)
stripe listen --api-key "$STRIPE_SECRET_KEY" \
  --events checkout.session.completed,invoice.paid,invoice.payment_failed,invoice.upcoming,payment_intent.succeeded,payment_intent.payment_failed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,customer.subscription.paused,customer.subscription.resumed,test_helpers.test_clock.ready \
  --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Ports: API/functions `54321`, Postgres `54322` (`postgres`/`postgres`). Studio is disabled in
`config.toml`; use `psql postgresql://postgres:postgres@127.0.0.1:54322/postgres`.

New migration without wiping data: `supabase migration up`. `supabase db reset` wipes every local
user (seed.sql recreates only the demo account).

### Quick end-to-end check
1. Sign up in the app, finish onboarding (profile + primary goal), press start → Stripe Checkout.
2. Pay with `4242 4242 4242 4242`, any future date, any CVC.
3. In `stripe listen` you should see `invoice.paid` → `[200]`; in the DB:
   `select type, bucket, amount_bani, status from ledger_entries order by created_at;`
   shows a confirmed `topup` and today's `allocation` pair.
4. `/demo` → "Derulează o lună" (`demo.advance_month`), "Card refuzat" (`fail_next`), "Repară" (`fix`),
   "Părinte de test" (`parent_test`). `select * from stripe_events order by received_at desc` shows
   every event, its state (`processing`, `processed`, `ignored` or `failed`) and how many attempts it took.

Tests: `deno test --allow-env --allow-read supabase/functions` (unit) and `supabase/tests/run.sh`
(database, rolled back); see [testing.md](testing.md). The app's own rules tests: `cd app && npx vitest run`.

## Deploy to Supabase cloud

```bash
supabase login
supabase link --project-ref <ref>
supabase db push                                   # runs supabase/migrations/* (pg_cron included)
supabase functions deploy payments family demo
supabase functions deploy stripe-webhook parent auth-phone   # verify_jwt=false comes from config.toml
supabase secrets set STRIPE_SECRET_KEY=sk_test_... APP_URL=https://<frontend-url> DEMO_MODE=true
# optional: another 6 digit test code for auth-phone (default 123456)
# supabase secrets set PHONE_TEST_CODE=......
```

Then in the Stripe Dashboard (sandbox) → Developers → Webhooks → **Add endpoint**:
- URL: `https://<ref>.supabase.co/functions/v1/stripe-webhook`
- Events: `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`, `invoice.upcoming`,
  `payment_intent.succeeded`, `payment_intent.payment_failed`, `customer.subscription.created`,
  `customer.subscription.updated`, `customer.subscription.deleted`, `customer.subscription.paused`,
  `customer.subscription.resumed`, `test_helpers.test_clock.ready`
- Copy its signing secret: `supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...`

Auth → URL configuration: set Site URL and redirect URLs to the deployed frontend.
`invoice.upcoming` only fires if "upcoming renewal events" are on in Billing settings (default: 3 days).

### Stripe Connect
Each student gets a connected account (their pot) and top-ups are destination charges into it.
Until Connect is enabled on the platform (Dashboard → Connect → Get started) account creation fails;
the backend logs it and keeps going without `transfer_data` (money stays on the platform balance).
Once Connect is on, new students get an account on `payments.start`, and the webhook routes an
existing subscription to the account as soon as its `transfers` capability is `active`.

## Things that will bite you
- The Stripe SDK is pinned (`npm:stripe@17.7.0`, API `2025-02-24.acacia`). Newer API versions
  (the account default is `2026-09-30.endive`) reject `payment_method_types` on Checkout Sessions;
  if you upgrade, remove it and enable cards in Dashboard → Payment methods.
- Events are rendered in the account's default API version, so the webhook only trusts ids,
  customer, metadata and amounts from the event and re-fetches invoices/subscriptions via the SDK.
- New tables need explicit grants, on the live project too since `0014_tighten_api_grants.sql`
  (anon and signed-in users get nothing by default); see `0003_grants_and_backend_rules.sql`.
- Demo test clocks: max 3 customers per clock, an advance can move at most 2 billing periods,
  renewal invoices stay draft ~1 h of clock time, and the invoice list's `created` filter compares
  against real time (filter on `invoice.created` in code instead).
- The nightly allocation runs at 22:05 UTC = 00:05 in Bucharest in winter (EET). From the last
  Sunday of March (EEST) change it to `5 21 * * *`.
- Phone sign-in is a sandbox shortcut: with `DEMO_MODE=true` anyone can sign in as any Romanian
  number with the test code. Turning `DEMO_MODE` off switches it off (503); real users need an
  SMS verification provider (for example Twilio Verify) behind `auth-phone` first.
