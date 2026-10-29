# Clubs: schema and rules

Migration `supabase/migrations/0018_clubs.sql` (backend branch `feat/avansul`), app code in
`app/src/lib/clubs/` and `app/src/screens/Clubs.tsx`.

## What lives where

- **Config (app):** the six clubs (Travel, Erasmus, Tech, First apartment, My car, Emergency fund)
  and each club's pool of promotions from fictional companies, in `lib/clubs/config.ts`. Only our
  team adds clubs: a new club is a config entry plus its slug in `clubs_slugs()`. Each month a club
  shows 3 to 5 promotions, moving two places along its pool on the 1st; the ones that weren't there
  last month are tagged "New". Every promotion is tagged "Demo".
- **Server:** who is in which club, the slots, the pause and comeback, and the codes handed out.

## The one streak rule

`social_saved_days(user)` (redefined in 0018) counts a day only when that day's confirmed deposits
reach `profiles.daily_amount_bani` (at least 1 leu). A bigger deposit is still one day, withdrawals
don't matter, frozen days neither break nor grow the run (`social_streak_of`, unchanged). Friends,
freezes and clubs all read this one number. Known limit: the threshold is today's daily amount, so
raising it re-judges past days.

## Tables (RLS on, own rows readable, no grants: writes only through the functions)

| Table | Columns |
| --- | --- |
| `club_memberships` | user_id, club_slug, status (`active`, `paused`, `lost`), joined_at, paused_at, comeback_until; PK (user_id, club_slug) |
| `promo_claims` | user_id, promo_id (`<club>/<promotion>/<YYYY-MM>`), club_slug, code, claimed_at; PK (user_id, promo_id) |
| `club_users` | user_id, last_streak (to tell a break from a quiet day), comeback_won_on |

## Rules (clubs_settle, run lazily by every clubs call; mirrored in `rules.ts settleClubs`)

- Slots: 1 at sign-up, 2 at 14 days, 3 at 30, 4 at 60, 5 at 90, 6 at 150.
- The streak broke (lower than last seen): the clubs above the new slot count pause for 30 days,
  the oldest stay active. Codes and claims are kept. The old streak number is not restored.
- 14 days in a row reached inside the 30 days (and not resting on a day still in danger): every
  paused club is active again, even above the slots.
- The 30 days run out: paused clubs become lost, and can be rejoined once a slot is free.

## Functions (SECURITY DEFINER, signed-in users)

- `clubs_state()`: streak, slots, next slot, days until a club fits, the comeback, my memberships,
  my claims, member counts per club, and my friends in each club (count and first names).
- `clubs_join(slug)`: refuses more active clubs than slots (`kip:no-slot`); rejoins a lost club.
- `clubs_leave(slug)`.
- `clubs_claim(promo_id)`: this month's promotions only, active members only, once per person
  (asking again returns the same code), optional code limits (`clubs_code_limit`). Returns a
  simulated partner code.
- `clubs_member_counts()`: aggregate counts only. Nobody can read another person's memberships.

## Not built yet

Leaderboards, sessions, time travel ("advance a day"), the once-a-week limit on changing the daily
amount, push notifications (an in-app banner shows on the 1st instead), a club pick in onboarding.
