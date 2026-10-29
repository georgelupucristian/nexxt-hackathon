# Test accounts (live sandbox project)

Six real accounts on the live Supabase project (`sdcnwuapuesxpwphxaaq`). They sign in like anyone
else: phone number on the welcome screen, then the sandbox code **123456** (the `auth-phone` Edge
Function; no SMS is sent in the sandbox). Each has a profile, a primary goal and a saving history
of confirmed deposits, so the streaks are real numbers computed by the server.

| Name | Phone | Goal | Streak at reset | 1-day Freeze | Friends | Clubs |
| --- | --- | --- | --- | --- | --- | --- |
| Alex (main) | 0700000100 | New laptop, 4,500 lei | 27 (saved through yesterday, not yet today) | yes | Mihai, Ioana; a pending request from Ana | Erasmus, Travel (2 of 2 slots, the 3rd in 3 days) |
| Ana | 0700000101 | Erasmus in Spain, 3,000 lei | 13, held: missed yesterday, **in danger** until midnight | no (used 3 days ago, recharging) | Mihai, Ioana | Emergency fund active; Erasmus and Travel **paused**, comeback 13 / 14, 15 days left |
| Mihai | 0700000102 | New bike, 2,200 lei | 22 (saved today) | **yes** | Alex, Ana, Ioana, Radu | Travel, one free slot (the unlock moment) |
| Ioana | 0700000103 | Emergency fund, 2,000 lei | 29 (a day covered by her freeze two weeks ago) | yes | Alex, Ana, Mihai | Erasmus, First apartment |
| Radu | 0700000104 | Untold festival, 900 lei | 7 (saved today) | yes | Mihai, Elena | My car active; Tech **lost** (rejoin in 7 days) |
| Elena | 0700000105 | New phone, 3,500 lei | 53 (saved today) | yes, plus a 1-week Freeze (past 45 days) | Radu | Travel, Tech, Emergency fund (3 of 3) |

A day counts for the streak only when that day's confirmed deposits reach the person's daily
amount (one rule on the server, `social_saved_days`), so every seeded deposit is at least the daily
amount. Ana's clubs show the comeback: if a friend's freeze covers yesterday and she saves today,
her streak reaches 14 and her paused clubs come back ("You're back!"). See `docs/clubs-schema.md`.

Everyone is findable by number (discoverable). Ana has also asked Mihai and Ioana "Can you help me
with a freeze?".

## The demo story

1. Browser 1: sign in as Alex (0700000100, 123456), open Friends. Mihai and Ioana are there with
   their real streaks; the Requests tab has Ana's request. Accept it: Ana appears, pinned on top,
   "In danger".
2. Give Ana your freeze. The warning says you stay without protection for 7 days; your 1-day Freeze
   goes from 1 to 0.
3. Browser 2: sign in as Ana (0700000101, 123456). She sees "Alex gave you his freeze".
4. Ana saves today. In the sandbox there's no card payment for test accounts, so the save is the
   database call `social_sandbox_save_today()` (one confirmed deposit, 15 lei, marked
   `seed:kip-social`; it refuses any account that isn't one of these six). The gift activates,
   yesterday is covered, Ana's streak goes from 13 to 14, and Alex sees she saved today and
   "your freeze saved her streak".
5. Cheers work both ways (3 a day per friend).

### Colonies and shared goals

- Colony "Foculețul": Alex, Ana, Mihai and Ioana (Colonies, from the Friends header).
- Shared goal "Vama Veche": 2,000 lei by next July, 500 lei share each, at 46% (Alex 40%, Ana
  52%, Mihai 60%, Ioana 32% of their own share). It shows in the goals list on home and on Goals,
  with the members' avatars.
- Alex deposits 80 lei into Vama Veche: the same Deposit button calls `payments.shared_deposit`;
  a test number with no saved card goes through `social_sandbox_shared_deposit()` instead (one
  confirmed `shared_deposit` row marked `seed:kip-social`, no Stripe). The goal goes to 50%, the
  50% milestone plays, and Ana sees 50% too. Nobody sees anyone else's amount, only percentages.
- A shared deposit is extra money: it is not part of personal savings, the personal goal or the
  streak. Leaving a shared goal returns your contributions as a withdrawable balance.

## Reset to the starting state

Run as the service role (Supabase SQL editor, or the MCP `execute_sql` tool):

```sql
select public.social_demo_reset();
```

It deletes these six accounts' social rows (requests, friendships, blocks, freezes, dangers, asks,
gifts, cheers, notices, club memberships, promo claims, colonies, shared goals and their shared-goal ledger rows) and their ledger rows marked `seed:kip-social`, then seeds the history and
the story above again, anchored on today (Europe/Bucharest). It touches nothing else: other
accounts, Stripe rows and real deposits stay as they are. It needs the six auth users to exist.

## What's real and what's simulated

- Real (database, enforced server-side): friends, requests, blocks, being findable by number,
  contact matching, streaks and "saved today" from confirmed deposits, the 1-day Freeze, giving it,
  the 24-hour activation and the return, asks, cheers, the invite-link rule.
- Seeded: the saving history of these six accounts (ledger rows marked `seed:kip-social`, no Stripe
  charge behind them) and Ana's save during the demo.
- Real since 0019: colonies and shared goals (members, invites, shares, contributions in their own
  ledger bucket, leaving). Card deposits and Checkout are real Stripe test payments.
- Not on the server yet, so a signed-in account doesn't show them: the weekly colony challenge,
  the witness. They still exist in the offline demo account ("Try with demo
  data"), which is fully simulated and labelled Demo where money shows.
