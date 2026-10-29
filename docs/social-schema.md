# Social layer: the real backend (live)

Friends, being findable by number, the 1-day Freeze, giving it, asking for one and cheers run on
the live Supabase project for signed-in accounts. The migration is
`kept/supabase/migrations/0016_social_friends_freezes.sql` (branch `feat/avansul`). The app talks to
it through `SupabaseSocialRepo` (`app/src/lib/social/supabaseRepo.ts`); the offline demo account
("Try with demo data") keeps the simulated `MockSocialRepo`.

Not on the server yet: colonies, shared goals, the weekly challenge and the witness. A signed-in
account doesn't see them (nothing simulated is ever shown to a real account).

## Rules the server enforces (mirroring `app/src/lib/social/rules.ts`)

- A friendship exists only once the other person accepts, or when they had already asked you.
- No cap on friends; at most 50 requests sent a day.
- A block hides both people from each other: no match, no request, the friendship goes.
- The 1-day Freeze: never more than one, used on its own at the end of a missed day when there's a
  run to protect, back exactly 7 days after it went.
- Giving it: the giver's 7-day recharge starts. It works only if the rescued person saves within
  24 hours; otherwise it goes back and the recharge is cancelled. At most 2 received in 30 days.
- Cheers: 3 a day to the same friend.
- Invite link: whoever joins through it starts with a 1-day Freeze, and the inviter's recharges
  right away (or they get one). A streak only grows from saving.
- A day counts when a confirmed deposit lands in `ledger_entries` (by `entry_date`, Europe/Bucharest).

State stays current by lazy evaluation: every RPC settles the people it touches first
(`social_settle`: missed days, the automatic freeze, gifts that worked or went back, dangers that ran
out). A pg_cron job (`kip-social-settle`, every 10 minutes) settles everyone as a backstop.

## Tables (RLS on all; no grants for anon; signed-in users can only SELECT their own `social_notices`)

`friend_requests`, `friendships` (ordered pair), `blocks`, `freeze_state`, `frozen_days`, `dangers`,
`freeze_asks`, `freeze_gifts`, `cheers`, `social_notices` (kind + actor, the app writes the words).
`profiles` gained `discoverable`, `invite_code`, `invited_by`.

`social_notices` is in the `supabase_realtime` publication: subscribe to INSERTs filtered on
`to_user=eq.<me>` and re-read `social_world()`.

## RPCs (signed-in users only, `supabase.rpc(name, args)`)

Errors are `raise exception 'kip:<code>'`: the PostgREST error `message` is `kip:<code>`. Codes:
`signed-out`, `self`, `gone`, `blocked`, `already-friends`, `already-requested`, `daily-limit`,
`not-yours`, `not-in-danger`, `nobody`, `not-connected`, `no-freeze`, `already-helped`,
`rescue-limit`, `cheers`, `cheer-kind`, `too-many-numbers`, `not-sandbox`, `amount`.

| RPC | args | returns |
| --- | --- | --- |
| `social_world` | none | the JSON below |
| `social_match_contacts` | `p_phones text[]` (E.164, at most 2000) | `[{ id, name }]`: discoverable, not blocked either way, never yourself |
| `social_send_request` | `p_to uuid` | `'requested'` or `'friends'` (they had asked you) |
| `social_respond_request` | `p_id uuid, p_accept boolean` | void |
| `social_cancel_request` | `p_id uuid` | void |
| `social_remove_friend` | `p_other uuid` | void |
| `social_block` | `p_other uuid` | void |
| `social_set_discoverable` | `p_on boolean` | void |
| `social_mark_notices_read` | none | void |
| `social_ask_freeze` | `p_to uuid[]` (friends only) | the ask's id |
| `social_give_freeze` | `p_to uuid` | `{ id, from, to, day, given_at, status }` |
| `social_cheer` | `p_to uuid, p_kind 'bravo'\|'poti'\|'aici'` | void |
| `social_redeem_invite` | `p_code text` | boolean |
| `social_sandbox_save_today` | `p_amount_bani int default 1500` | void. Test accounts only (+40700000100..105), else `kip:not-sandbox`: one confirmed deposit marked `seed:kip-social`, no Stripe |

### `social_world()` JSON

```jsonc
{
  "today": "2026-10-29",                       // Europe/Bucharest
  "me": { "id", "name", "phone": "+407…", "discoverable", "invite_code", "invited_by", "created_at" },
  "freeze": { "day_freeze": 0|1, "day_recharge_at": iso|null, "week_freeze": 0|1, "week_milestone",
              "week_from": day|null, "settled_through": day, "frozen": [{ "day", "by": "day"|"week"|"gift" }] },
  "status": Status,                            // mine, same shape as a friend's
  "people": [                                  // friends, and anyone with a pending request either way
    { "id", "name", "friend": true, "since": iso, "status": Status },
    { "id", "name", "friend": false }          // a pending request: name only
  ],
  "requests": [{ "id", "from", "to", "status", "at" }],  // pending to me; mine pending or sent today
  "blocks": [{ "by", "who", "at" }],                     // mine
  "dangers": [{ "id", "day", "until", "status" }],       // mine, last 60 days
  "asks": [{ "id", "from", "to": [uuid], "day", "at", "status": "open" }], // mine, and open ones to me (then "to" is just me)
  "gifts": [{ "id", "from", "to", "day", "given_at", "status": "pending"|"active"|"returned", "resolved_at" }], // mine both ways
  "cheers": [{ "id", "from", "to", "kind", "at" }],      // sent by me today, received this week
  "notices": [{ "id", "kind", "actor", "actor_name", "detail", "read", "at" }] // last 30
}
// Status: what a friend may know. Never an amount.
{ "streak": int, "saved_today": bool, "frozen_today": bool, "has_day_freeze": bool,
  "week_running": bool, "week_from": day|null,
  "danger": { "id", "day", "until" } | null,      // an open danger (inside its 24 h, or a gift waiting)
  "gift_given_at": iso|null }                      // a friend's freeze is waiting for this person's saving
```

Notice kinds: `request` (actor wants to be friends), `accepted`, `ask` (actor asks you for a
freeze), `gift` (actor gave you their freeze), `gift_worked` (actor saved, your freeze saved their
streak), `gift_returned` (your freeze came back), `invite_joined`, `invited`, `cheer` (`detail` is
the kind).

## Test accounts

See `docs/test-accounts.md`. Reset with `select public.social_demo_reset();` (service role, via the
SQL editor or the Supabase MCP `execute_sql`).
