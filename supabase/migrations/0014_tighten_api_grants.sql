-- Data API grants: exactly what the Kip app uses, nothing else.
--
-- The live project was created while Supabase still gave anon and authenticated every privilege
-- on every table in public (INSERT, UPDATE, DELETE, TRUNCATE, ... on ledger_entries and
-- stripe_events too), leaving all the blocking to RLS. A database built from these migrations
-- never had those grants. After this both are the same.
--
-- What the app (kip-money app/src/data/store.tsx) does through the Data API:
--   reads   profiles, goals, ledger_entries, balances; Realtime on ledger_entries and profiles
--   writes  profiles: first_name, daily_amount_bani, payday_day, onboarding_state
--           goals: insert, update, delete (RLS: own rows only, never the primary goal)
--   rpc     check_in() (its grant is in 0010)
-- Everything else (money, parent links, the event log, Kip's events) goes through the Edge
-- Functions, which use the service role, and the service role keeps all its grants.
--
-- Idempotent: it takes everything away from anon and authenticated, then grants the list back,
-- in one transaction, so the app never sees a moment without its grants.

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

grant select on public.profiles, public.goals, public.ledger_entries, public.balances to authenticated;
-- the plan fields only; Stripe ids, status and demo flags stay service-role only (see 0001)
grant update (first_name, daily_amount_bani, payday_day, onboarding_state) on public.profiles to authenticated;
grant insert, update, delete on public.goals to authenticated;

-- Tables and sequences that postgres (the role migrations run as) creates in public from now on
-- get nothing for anon or authenticated by default, as on a new project; each migration grants
-- what it needs. Functions are unchanged: every migration already revokes EXECUTE explicitly.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
