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

- **No server.** Accounts and data live in this browser's `localStorage` (passwords stored as salted SHA-256). The UI says so on sign-up and in Privacy.
- **No bank integration.** Tracking is either *manual* (you record what you set aside) or a clearly labelled *demo connection* that simulates pending → confirmed transfers, syncing and failures (toggle "Simulate a connection failure" in Profile → Tracking).
- **No push notifications.** Reminders appear as a banner on Home.

## Financial model

All balances are derived from confirmed transactions (`src/data/selectors.ts`). Each transaction belongs to one goal or to *unallocated*, so `total = Σ goals + unallocated` always holds. Pending and failed entries are shown but never counted. Deleting a goal moves its entries to unallocated.

## Streaks

Behavioural only. A day counts when the user records a contribution or does a plan check-in; opening the app doesn't count. Break days bridge a streak without counting. Missing a day resets the current streak but never touches money.

## Structure

```
src/data        types, storage (localStorage), store (React context + actions), selectors (pure maths), seed
src/components  ui (design-system primitives), domain (balance, streak, goal, transaction), sheets, nav
src/screens     Auth, Onboarding, Home, Goals, GoalDetail, GoalEditor, Activity, TransactionDetail, Profile
src/styles      tokens.css, base.css, components.css
docs/design-research.md   Mobbin references behind each screen
```
