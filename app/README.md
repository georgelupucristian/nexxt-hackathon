# Kept — savings plans that bend

Mobile-first savings app for students and young adults: pick a goal, set a realistic plan, record what you save, and see where you stand.

## Run

```bash
cd app
npm install
npm run dev      # http://localhost:5173
npm test         # unit tests for balances, streaks, plans
npm run build
```

"Explore with sample data" on the welcome screen opens a demo account with eight weeks of simulated history.

## What's real and what isn't

- **Accounts are phone numbers.** Sign-up and sign-in take a Romanian mobile number (+40) and a 6-digit code; there are no passwords. With `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` set, the `auth-phone` Edge Function checks the number and code and returns a `token_hash` that `supabase.auth.verifyOtp` turns into a real session (no SMS is sent yet: a fixed code verifies). Without them, accounts and data live in this browser's `localStorage` and the same code proves the number. The demo is always local.
- **Face ID / fingerprint** is a local convenience: a passkey on this device that locks Kip's screen per tab. It never reaches a server and is not account security.
- **No bank integration.** Tracking is either *manual* (you record what you set aside) or a clearly labelled *demo connection* that simulates pending → confirmed transfers, syncing and failures (toggle "Simulate a connection failure" in Profile → Tracking).
- **No push notifications.** Reminders appear as a banner on Home.

## Financial model

All balances are derived from confirmed transactions (`src/data/selectors.ts`). Each transaction belongs to one goal or to *unallocated*, so `total = Σ goals + unallocated` always holds. Pending and failed entries are shown but never counted. Deleting a goal moves its entries to unallocated.

## Streaks

A day counts only when money is put aside that day: a confirmed or pending contribution (for a Supabase account, any deposit). Opening the app doesn't count, and there is no check-in without money. Break days bridge a streak without counting. Missing a day resets the current streak but never touches money.

## Structure

```
src/data        types, storage (localStorage), store (React context + actions), selectors (pure maths), seed
src/components  ui (design-system primitives), domain (balance, streak, goal, transaction), sheets, nav
src/screens     Auth, Onboarding, Home, Goals, GoalDetail, GoalEditor, Activity, TransactionDetail, Profile
src/styles      tokens.css, base.css, components.css
docs/design-research.md   Mobbin references behind each screen
```
