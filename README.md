# Kip: savings for students

Kip helps students save a little every day, keep a streak, save with friends, and unlock clubs with partner discounts. Kip the seal cheers you on.

**Try it:** https://listo-solutions.ro. On a laptop it opens inside a phone frame.

Kip never holds your money. In the real product it sits in a savings account **in the student's own name** at their bank. Kip is the app on top. The prototype uses **Stripe's sandbox** (test money) to show real money moving.

---

## Try it in 1 minute

1. Open https://listo-solutions.ro
2. Tap **I already have an account**
3. Phone **0700000100**, code **123456** (no SMS is sent)

You're in as **Alex**: a 27-day streak, two clubs, friends, and a shared goal.

| Account | Phone | What it shows |
|---|---|---|
| Alex | 0700000100 | main account: streak, clubs, friends, a request from Ana |
| Ana | 0700000101 | "In danger" (missed a day), clubs paused, comeback 13/14 |
| Mihai | 0700000102 | has a 1-day Freeze to give |
| Ioana | 0700000103 | 29-day streak |
| Radu | 0700000104 | a club lost, "7 more days to rejoin" |
| Elena | 0700000105 | 53-day streak, 3 clubs, a weekly payment plan |

The code is **123456** for every account. To pay in, use the Stripe test card **4242 4242 4242 4242**, with any future date and any CVC.
Two accounts at once (e.g. Alex gives Ana his freeze): use a normal window and a private window.
No account? **Try with demo data** on the welcome screen runs fully offline.

---

## What Kip does

- **Goals and a daily habit.** Pick a goal and a daily amount; Kip works out the plan. A day lights up on your streak when you put aside at least your daily amount.
- **Real money in (sandbox).** "Move money into your savings": weekly or monthly, on the day you choose. Nothing is charged before that day. Your card is only asked for when you choose to move money.
- **Freezes.** Miss a day and your 1-day Freeze protects the streak. A friend in danger can ask for yours.
- **Friends.** Find friends by phone number. Friends see your streak, never your amounts.
- **Shared goals.** Save with up to 4 friends (e.g. a trip). Each person adds their own extra money and keeps it; everyone sees only percentages.
- **Clubs.** Six clubs (Travel, Erasmus, Tech...) unlock as your streak grows (1 slot, then 2 at 14 days, up to 6 at 150). Each has monthly partner promotions. Break your streak and your clubs pause for 30 days: save 14 days in a row and you keep them all.

---

## How the money works

| | Prototype (this repo) | Real product |
|---|---|---|
| Where money sits | Stripe sandbox, test money | savings account in the student's name at their own bank |
| Recommended banks | n/a | Libra Internet Bank, Raiffeisen Bank (any PSD2 bank works) |
| Money in | card via Stripe Checkout | open banking (PSD2) transfer or a standing order |
| Rhythm | weekly or monthly on a chosen day | daily reserve, one weekly sweep into savings |
| Identity check | phone + test code | the bank's own online KYC |

Kip never holds client money, so it doesn't need a banking or e-money licence. It acts as the app and introducer. Details: [docs/assumptions-and-limits.md](docs/assumptions-and-limits.md) and [docs/kip-workflows.txt](docs/kip-workflows.txt).

**Business model:** partner promotions in clubs (affiliate commission), a fee from the bank for each savings account opened through Kip, and later Kip Plus. Kip never takes money from students' savings.

---

## How it's built

```
app/        React + TypeScript PWA (Vite), phone-first, deployed on Vercel
supabase/   Postgres + row-level security, migrations, Edge Functions, database tests
docs/       architecture, money model, limits, testing, schemas, test accounts
research/   legal and payments research, bank partner research
```

- **Frontend:** React 18, TypeScript, react-router, motion, installable PWA.
- **Backend:** Supabase.
  - Postgres with row-level security on every table.
  - Server-side functions for payments, phone sign-in, friends, clubs and shared goals.
  - Scheduled jobs.
- **Payments:** Stripe (sandbox).
  - Checkout and recurring collections.
  - Webhooks that record each payment exactly once.
- **Rules on the server:** streaks, freezes, friend requests, club slots and money limits are enforced in the database, not just in the app.

### Run it locally

```bash
cd app
npm ci
cp .env.example .env.local   # or set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:5173
```
Without Supabase settings, the app still runs with "Try with demo data" (offline).

### Tests

```bash
cd app && npx tsc --noEmit -p . && npx vitest run      # app unit tests
cd app && npx playwright test --project=phone          # end-to-end, phone size
deno test -A supabase/functions                        # backend unit tests
supabase/tests/run.sh                                  # database security tests
```
CI runs these on every push (`.github/workflows`). [docs/testing.md](docs/testing.md) lists what each suite covers, for example:
- one user can never read or change another user's data
- one Stripe event can never be counted twice

---

## Docs

| Doc | What's in it |
|---|---|
| [docs/kip-workflows.txt](docs/kip-workflows.txt) | every workflow: demo versus the real product, money, social, clubs, the 3-minute demo |
| [docs/architecture.md](docs/architecture.md) | system diagram and key engineering decisions |
| [docs/assumptions-and-limits.md](docs/assumptions-and-limits.md) | assumptions, data sources, regulation, limitations |
| [docs/backend.md](docs/backend.md) | how the backend and the payment webhook work |
| [docs/testing.md](docs/testing.md) | what is tested and how to run it |
| [docs/test-accounts.md](docs/test-accounts.md) | the test accounts and how to reset them |
| [docs/social-schema.md](docs/social-schema.md), [docs/clubs-schema.md](docs/clubs-schema.md) | data model for friends, shared goals and clubs |
| [docs/audit.md](docs/audit.md) | accessibility and performance audit |
| [research/](research/) | legal and payments research, bank partner research |

## Honest limitations

- No bank partnership is signed yet. Payments run on Stripe's sandbox with test money.
- The SMS code is fixed (123456) in the sandbox.
- Club promotions use fictional companies.
- The daily reserve and weekly sweep with a partner bank is designed, not built.
