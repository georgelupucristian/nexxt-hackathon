# Avansul API contract (frontend ↔ Edge Functions)

All functions take `POST` with a JSON body `{ "action": "...", ...params }` and reply with JSON.
Errors reply `{ "error": "<Romanian, user-facing message>" }` with a 4xx/5xx status
(400 bad input, 401 not signed in or a wrong sign-in code, 402 card declined, 403 not a demo
account, 404/410 unknown or stopped link, 409 wrong state e.g. no plan yet, 429 too many sign-in
tries, 500/502/504 retry later, 503 phone sign-in switched off). Show `error` as-is.
Unless marked *public*, the request carries the user's Supabase JWT in `Authorization: Bearer …`.
Amounts are integer bani. Dates are `YYYY-MM-DD` (Europe/Bucharest).
Extra fields in a reply (marked *+*) are additive; the original fields are unchanged.

## `auth-phone` (*public*, sign-in by phone, **test code, sandbox only**)
No SMS is sent. The code is a fixed test code, `123456` (the `PHONE_TEST_CODE` secret if it is
set to 6 digits), and it is only accepted while `DEMO_MODE` is on; otherwise every call answers
503 `"SMS sign-in isn't on yet."`. In production the code check would go to an
SMS verification provider such as Twilio Verify; the contract below would stay the same.
Called before anyone is signed in: `verify_jwt` is off, no `Authorization` header is needed
(`supabase.functions.invoke` sends the anon key anyway, which is fine).

| action | params | reply |
|---|---|---|
| `start` | `phone` | `{ ok: true }`. Validates and normalises the number; sends nothing. |
| `verify` | `phone`, `code` (string, 6 digits; spaces are dropped) | `{ token_hash, is_new }`. Finds the user with that phone or creates one (`is_new: true`), and returns a one-time magic link token for them. |

Then sign in with it; the result is a normal Supabase session (`auth.uid()`, RLS and every money
function work exactly as for an email sign-in):
```js
const { data, error } = await supabase.auth.verifyOtp({ token_hash, type: 'magiclink' })
```

- `phone`: a Romanian mobile number, `07xxxxxxxx`, `+407xxxxxxxx` or `00407xxxxxxxx`, with or
  without spaces and dashes. It is stored as E.164 (`+40712345678`). Anything else is 400.
- Errors: 400 bad body, unknown action, bad number (`"That number isn't valid. ..."`) or a code that
  is not 6 digits (`"The code has 6 digits."`); 401 wrong code (`"That code isn't right."`); 429 after
  10 `verify` calls for the same number within 10 minutes, right or wrong code alike
  (`"Too many tries. Try again in 10 minutes."`); 503 switched off (above); 500
  anything else. With `supabase.functions.invoke`, a non-2xx reply comes back as `error` and the
  body is `await error.context.json()`.
- `token_hash` works once, for about an hour (the project's email OTP expiry). Verify again for
  a new one. `type: 'email'` is accepted too.
- `is_new: true` means the account was just created: send the person to onboarding. Its
  `profiles` row already exists (the `on_auth_user_created` trigger), with `first_name` `''`.
- On the session's user: `user.phone` is the number without the `+` (`'40712345678'`);
  `user.user_metadata.phone` is the E.164 form. `user.email` is a placeholder,
  `<digits>@phone.kip.invalid`, that exists only so the admin API can make the link; it never
  receives mail, so never show it or send anything to it.
- Do not call `supabase.auth.signInWithOtp({ phone })`: the Auth phone provider is off (there is
  no SMS provider), so phone sign-in goes only through this function.
- Test number on the live project: **`0700000001`** (user `aacf22d8-1e30-4947-bc04-3e72ee7f7c2c`,
  a fresh profile). Any other `07` number with code `123456` creates a new account.

## `payments`
| action | params | reply |
|---|---|---|
| `start` | `every: 'week' \| 'month'`, `day` (week: 0 = Monday … 6 = Sunday; month: 1–28), `amount_bani` per deposit (week 3500–35000, month 15000–150000). All optional: missing ones come from `profiles.plan_*`. | `{ url, first_collection, charged_today }` Stripe Checkout. Creates Customer (+ test clock in demo mode) and the connected account (the student's pot) if missing. Recurring price `amount_bani` with interval `week` or `month`; the first collection is on the chosen day (`first_collection`, YYYY-MM-DD). Today the day (`charged_today`): Checkout in subscription mode, charged now. A later day: Checkout in setup mode (only saves the card, metadata `type: plan_start`); on `checkout.session.completed` the webhook creates the subscription with that card as default, billing_cycle_anchor = 09:00 Bucharest that day and proration_behavior none (nothing charged before it, Stripe status `active`), and sets `profiles.stripe_subscription_id` / `subscription_status`. Saves the schedule to `profiles.plan_every`, `plan_day`, `plan_amount_bani` (+ `daily_amount_bani` = the daily pace, `payday_day` for monthly). 409 if there is no primary goal or the plan already runs. |
| `fix_card` | — | `{ url }` Checkout in setup mode; on completion the webhook makes the new card default and retries the open invoice. |
| `update_schedule` | `every`, `day`, `amount_bani` (as for `start`, all required) | `{ ok, running, next_collection?, subscription? }`. No plan at Stripe: only saves the schedule (`running: false`). Running plan: from the next collection on, never an extra or double charge. The new schedule starts on its first day on or after the end of the period already paid for (`next_collection`). Amount only: the price is swapped, `proration_behavior: none`. Day or interval changing: same plus `trial_end` = the new first day at 09:00 Bucharest, the way Stripe moves a running subscription's billing day without charging now (Stripe status `trialing`, Kip `active`). `subscription`: `{ id, status, interval, unit_amount, trial_end, current_period_end }`. |
| `update_daily` | `daily_amount_bani` (500–5000) | Kept for old clients: `update_schedule` with the current frequency and day, amount = daily × 7 or × 30. |
| `pause` / `resume` | — | `{ ok: true }` pauses/resumes collection (`profiles.subscription_status` becomes `paused` / `active`). |
| `extra_deposit` | `amount_bani` (200–500000), `when: 'next_topup' \| 'now'`, optional `note` (string ≤ 140, e.g. "Skipped a Glovo") | `next_topup` → `{ ok: true }` (invoice item on the upcoming invoice, no extra fee, nothing counted until paid). `now` → `{ ok: true }` off-session charge on the saved card; pending until the webhook confirms; 402 if the card is declined. `note` is stored in `ledger_entries.note` and in the `extra_deposit_confirmed` payload. A confirmed extra deposit bumps `weekly_progress.extra_deposits_count` for that ISO week (and repairs a missed previous week). |
| `withdraw` | `amount_bani` | `{ ok: true, simulated_payout: true }`*+* only own (non-matched) money; ledger entries `withdrawal` (from `de_pus_deoparte` first, then the primary goal), simulated payout in sandbox. 409 with the maximum in the message if asking for more. |
| `shared_deposit` | `amount_bani` (200–500000), `shared_goal_id`, optional `card_only` | Extra money for a shared goal, never taken from personal savings. Saved card → `{ ok: true, charged: true }` (off-session, 402 if declined). No card → `{ url }` payment-mode Checkout (or `{ ok: false, no_card: true }` with `card_only`). Nothing is written until the webhook confirms: `record_shared_money` adds a confirmed `ledger_entries` row `bucket 'shared'`, `type 'shared_deposit'`, `shared_goal_id`. Not in `balances`, not in the personal goal, not in the streak. 409 if not an active member. |
| `shared_withdraw` | `amount_bani`, optional `shared_goal_id` | `{ ok: true, simulated_payout: true }`. Only your own shared money: from that goal, or without a goal from what came back when you left one (`shared_return` rows). 409 with the maximum if asking for more. |

**What Checkout shows.** Today the day: one recurring line, "Transfer to your Kip savings", charged
now; under the button "This moves money into your own Kip savings. Kip takes no fee. You can
withdraw anytime." A later day: a card-saving page with no price, no trial and no "N days free";
under the button "Kip saves your card to move money into your own savings. Nothing is charged
today. Your first X lei goes in on <date>. Kip takes no fee."

## `family`
| action | params | reply |
|---|---|---|
| `create` | `parent_name` (1–40), `ratio_num`, `ratio_den` (1–4), `monthly_cap_bani` (1000–500000) | `{ id, token, url }` (`url` = `${APP_URL}/p/${token}`; token is URL-safe) |
| `revoke` | `id` | `{ ok: true }` |

## `parent` (*public*, token-based, no account)
| action | params | reply |
|---|---|---|
| `get` | `token` | `{ student_first_name, goal_name, in_avans_bani, target_bani, ratio_num, ratio_den, monthly_cap_bani, status, parent_name, matched_this_month_bani }` |
| `setup` | `token` | `{ url }` Checkout setup mode to save the parent's card. Returns to `${APP_URL}/p/${token}?setup=success`; the link turns `active` when the webhook lands (poll `get`). 410 if stopped. |
| `stop` | `token` | `{ ok: true }` immediate |

## `demo` (only for profiles with `is_demo = true`)
| action | reply |
|---|---|
| `status` | `{ sim_date, clock_status, subscription_status, payment_method_last4 }` |
| `advance_month` | `{ ok, sim_date, allocated_bani, renewal }`*+* advances the test clock 1 month + ~1 hour (stopping once right after the renewal), waits for the renewal webhook, then allocates the skipped days. `renewal`: `'paid' \| 'failed' \| 'none' \| 'timeout'`. Takes 15–25 s; 409 needs `payments.start` first. |
| `fail_next` | `{ ok, last4 }`*+* switches the default card to 4000 0000 0000 0341 |
| `fix` | `{ ok, paid_invoices }`*+* back to 4242, pays the open invoice |
| `parent_test` | `{ ok, id, token }`*+* creates an active parent link with a test card (optional `ratio_num`, `ratio_den`, `monthly_cap_bani`; default 1:1, 150 lei) |
| `reset` | `{ ok }` cancels the subscription, deletes the clock, wipes ledger, events, weekly progress, parent links **and goals**, resets `onboarding_state` to `{}` → back to onboarding |
| `events` | `{ events: [{ event_id, type, object_id, status, received_at }] }` last 25 Stripe events for this user |

## `stripe-webhook` (*public*, Stripe-signed)
Source of truth for money. Handles `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
`invoice.upcoming`, `payment_intent.succeeded`, `payment_intent.payment_failed`,
`customer.subscription.created|updated|deleted|paused|resumed`, `test_helpers.test_clock.ready`.
Idempotent via `stripe_events`: each event is claimed, handled, then marked `processed` /
`ignored` / `failed` (see docs/backend.md, "Webhook flow"). A replay of a finished event answers
200 and does nothing; while another delivery is on it the answer is 409, so Stripe retries.
After a confirmed top-up it allocates today's amount
(`allocate_for_user(user, sim_date or today)`) and creates the parent match if a link is active.

Server-only (service role) since `0015_phone_login.sql`: `auth_user_by_phone(phone)`,
`phone_login_attempt(phone)` and the `phone_login_attempts` table, used by `auth-phone`.

## RPCs the frontend calls (`supabase.rpc(...)`)
| rpc | effect |
|---|---|
| `check_in()` | The weekly "still on track" check-in: upserts `weekly_progress.checked_in = true` for the current ISO week (migration `0010_weekly_checkin.sql`). |

## Tables the frontend reads directly (RLS: own rows only)
`profiles`, `goals`, `ledger_entries`, `balances` (view). Realtime is on for `ledger_entries` and
`profiles` (the publication also lists `app_events`, which signed-in users can no longer read).
Writes the frontend does directly: `profiles` (first_name, daily_amount_bani, payday_day,
onboarding_state; never `plan_every`, `plan_day`, `plan_amount_bani`, which only `payments` writes, 0017), `goals` (own: insert, update, delete).
That is exactly what the Data API grants signed-in users since `0014_tighten_api_grants.sql`;
anon gets nothing. `parent_links`, `weekly_progress`, `app_events` and `stripe_events` are
service-role only (Edge Functions); reading one from the app needs a new grant in a migration.
For demo accounts (`profiles.is_demo`), "today" for money is `profiles.sim_date`, not the device date.

### `app_events.type` values (drive Kip and notifications) and their payloads
| type | payload |
|---|---|
| `topup_confirmed` | `{ amount_bani, invoice_total_bani, invoice, date, billing_reason }` (`amount_bani` excludes extra deposits on the same invoice) |
| `topup_failed` | `{ amount_bani, invoice, date, attempt_count, next_attempt }` (once per invoice) |
| `topup_upcoming` | `{ amount_bani, date }` (a few days before payday) |
| `match_confirmed` | `{ amount_bani, parent_link_id, date }` |
| `match_failed` | `{ amount_bani, parent_link_id, reason }` |
| `milestone_reached` | `{ stage, label, pct, goal_id }`, `stage` ∈ `fundatie` (15%), `pereti` (30%), `geamuri` (50%), `acoperis` (70%), `interior` (85%), `chei` (100%); once per goal and stage |
| `allocation_done` | `{ amount_bani, date }` (daily) or `{ amount_bani, from, to }` (demo month) |
| `parent_linked` | `{ parent_link_id, parent_name }` |
| `extra_deposit_confirmed` | `{ amount_bani, date, note, invoice? }` |

Rows the webhook writes carry `app_events.stripe_event_id`; there is at most one per event and type.
