-- Colonies and shared goals, on the live backend (they ran only on the app's mock before).
--
-- Colonies: a streak group of 2 to 5 people, made from accepted friends only, at most 3 per person,
-- leave anytime. Same rules as app/src/lib/social/rules.ts (checkCreateColony, checkJoinColony).
--
-- Shared goals: a name, a target, a date and a share each (equal by default). They don't need a
-- colony: the members are the friends who were invited and said yes (5 people at most). A goal made
-- from a colony keeps its colony_id, nothing more.
--
-- THE MONEY RULE. A contribution is extra money, a new deposit made for the shared goal. It is never
-- taken from what the person already saved, and money never moves between people:
--   - it lives in ledger_entries as bucket 'shared' with a shared_goal_id. The balances view sums
--     buckets by name and only counts 'shared' rows nowhere, social_saved_days counts only topup,
--     extra_deposit and parent_match, withdraw_own only the personal buckets: a shared deposit
--     never touches personal savings, the personal goal or the streak.
--   - Stripe shared deposits are only written once confirmed (record_shared_money from the webhook),
--     so the view's pending_in_bani never sees them either.
--   - progress = the sum of everyone's confirmed rows for the goal. Each person withdraws only their
--     own. Leaving moves your contributions out of the goal into a returned balance (two rows,
--     type 'shared_return'), withdrawable with payments.shared_withdraw.
--
-- Privacy: all five tables have RLS and no grants for signed-in users. social_groups() returns what
-- a member may see: names, streaks, the total % and each member's % of their own share. The only
-- amount that comes back is the caller's own.

-- ======================================================================================
-- Tables
-- ======================================================================================

create table public.colonies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index colonies_created_by_idx on public.colonies (created_by);

create table public.colony_members (
  colony_id uuid not null references public.colonies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  joined_on date not null default (now() at time zone 'Europe/Bucharest')::date,
  primary key (colony_id, user_id)
);
create index colony_members_user_idx on public.colony_members (user_id);

create table public.colony_invites (
  id uuid primary key default gen_random_uuid(),
  colony_id uuid not null references public.colonies (id) on delete cascade,
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now()
);
create index colony_invites_to_idx on public.colony_invites (to_user, status);
create index colony_invites_from_idx on public.colony_invites (from_user);
create index colony_invites_colony_idx on public.colony_invites (colony_id);

create table public.shared_goals (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 40),
  icon text not null default 'beach' check (char_length(icon) <= 30),
  target_bani bigint not null check (target_bani > 0),
  target_date date not null,
  colony_id uuid references public.colonies (id) on delete set null,
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- 25 / 50 / 75 / 100 already reached, so each plays once
  milestones integer[] not null default '{}',
  -- someone left: the others may lower the target (shares were already split again)
  rebalance boolean not null default false
);
create index shared_goals_colony_idx on public.shared_goals (colony_id);
create index shared_goals_created_by_idx on public.shared_goals (created_by);

create table public.shared_goal_members (
  goal_id uuid not null references public.shared_goals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'invited' check (status in ('invited', 'active', 'declined', 'left')),
  -- the planned part of the target; equal unless custom_share
  share_bani bigint not null default 0 check (share_bani >= 0),
  custom_share boolean not null default false,
  invited_by uuid references auth.users (id) on delete set null,
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  primary key (goal_id, user_id)
);
create index shared_goal_members_user_idx on public.shared_goal_members (user_id, status);
create index shared_goal_members_invited_by_idx on public.shared_goal_members (invited_by);

-- ---------- the ledger: shared money in its own bucket ----------
alter table public.ledger_entries add column shared_goal_id uuid references public.shared_goals (id) on delete set null;
create index ledger_entries_shared_goal_idx on public.ledger_entries (shared_goal_id) where shared_goal_id is not null;
alter table public.ledger_entries drop constraint ledger_entries_bucket_check,
  add constraint ledger_entries_bucket_check check (bucket in ('de_pus_deoparte', 'goal', 'outside', 'shared'));
alter table public.ledger_entries drop constraint ledger_entries_type_check,
  add constraint ledger_entries_type_check check (type in ('topup', 'parent_match', 'allocation', 'extra_deposit', 'withdrawal', 'manual_record',
                                                           'shared_deposit', 'shared_withdrawal', 'shared_return'));
-- shared types live only in the shared bucket, and only shared rows point at a shared goal
alter table public.ledger_entries add constraint ledger_entries_shared_check
  check ((bucket = 'shared') = (type in ('shared_deposit', 'shared_withdrawal', 'shared_return')) and (shared_goal_id is null or bucket = 'shared'));

-- notices for the new moments; detail carries a colony or goal id (and a milestone)
alter table public.social_notices drop constraint social_notices_kind_check,
  add constraint social_notices_kind_check check (kind in ('request', 'accepted', 'ask', 'gift', 'gift_worked', 'gift_returned', 'invite_joined', 'invited', 'cheer',
                                                           'colony_added', 'colony_invite', 'shared_invite', 'shared_joined', 'shared_left', 'shared_milestone'));
alter table public.social_notices drop constraint social_notices_detail_check,
  add constraint social_notices_detail_check check (char_length(detail) <= 60);

alter table public.colonies enable row level security;
alter table public.colony_members enable row level security;
alter table public.colony_invites enable row level security;
alter table public.shared_goals enable row level security;
alter table public.shared_goal_members enable row level security;
revoke all on public.colonies, public.colony_members, public.colony_invites, public.shared_goals, public.shared_goal_members from anon, authenticated;
grant all on public.colonies, public.colony_members, public.colony_invites, public.shared_goals, public.shared_goal_members to service_role;

-- ======================================================================================
-- Helpers
-- ======================================================================================

create or replace function public.colony_count(p_user uuid) returns integer
language sql stable set search_path = public as $$
  select count(*)::integer from colony_members where user_id = p_user
$$;

create or replace function public.colony_is_member(p_colony uuid, p_user uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from colony_members where colony_id = p_colony and user_id = p_user)
$$;

create or replace function public.shared_is_active(p_goal uuid, p_user uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from shared_goal_members where goal_id = p_goal and user_id = p_user and status = 'active')
$$;

-- one person's confirmed money in one goal
create or replace function public.shared_own_bani(p_goal uuid, p_user uuid) returns bigint
language sql stable set search_path = public as $$
  select coalesce(sum(amount_bani), 0)::bigint from ledger_entries
  where user_id = p_user and shared_goal_id = p_goal and bucket = 'shared' and status = 'confirmed'
$$;

-- everyone's confirmed money in one goal (leavers net to 0 through their shared_return row)
create or replace function public.shared_total_bani(p_goal uuid) returns bigint
language sql stable set search_path = public as $$
  select greatest(coalesce(sum(amount_bani), 0), 0)::bigint from ledger_entries
  where shared_goal_id = p_goal and bucket = 'shared' and status = 'confirmed'
$$;

-- what came back from goals you left (or that ended), ready to withdraw
create or replace function public.shared_returned_bani(p_user uuid) returns bigint
language sql stable set search_path = public as $$
  select coalesce(sum(amount_bani), 0)::bigint from ledger_entries
  where user_id = p_user and shared_goal_id is null and bucket = 'shared' and status = 'confirmed'
$$;

-- Equal shares between the active members who didn't pick their own; to the ban, the remainder to
-- whoever joined first. Custom shares above the target reset everyone to equal.
create or replace function public.shared_rebalance(p_goal uuid) returns void
language plpgsql set search_path = public as $$
declare
  v_target bigint;
  v_custom bigint;
  v_n integer;
  v_base bigint;
  v_rest bigint;
begin
  select target_bani into v_target from shared_goals where id = p_goal;
  select coalesce(sum(share_bani) filter (where custom_share), 0), count(*) filter (where not custom_share)
    into v_custom, v_n from shared_goal_members where goal_id = p_goal and status = 'active';
  if v_custom > v_target or (v_n = 0 and v_custom <> v_target) then
    update shared_goal_members set custom_share = false where goal_id = p_goal;
    v_custom := 0;
    select count(*) into v_n from shared_goal_members where goal_id = p_goal and status = 'active';
  end if;
  if v_n = 0 then return; end if;
  v_base := (v_target - v_custom) / v_n;
  v_rest := (v_target - v_custom) - v_base * v_n;
  update shared_goal_members m set share_bani = v_base + case when x.rn <= v_rest then 1 else 0 end
    from (select user_id, row_number() over (order by joined_at, user_id) as rn
          from shared_goal_members where goal_id = p_goal and status = 'active' and not custom_share) x
    where m.goal_id = p_goal and m.user_id = x.user_id;
  update shared_goal_members set share_bani = 0 where goal_id = p_goal and status <> 'active';
end $$;

-- After money came in: the milestones it crossed, recorded once, and the others told.
create or replace function public.shared_note_progress(p_goal uuid, p_actor uuid) returns integer[]
language plpgsql set search_path = public as $$
declare
  g record;
  v_pct integer;
  v_new integer[];
  m uuid;
begin
  select * into g from shared_goals where id = p_goal for update;
  if not found then return '{}'; end if;
  v_pct := floor(shared_total_bani(p_goal) * 100.0 / g.target_bani);
  select coalesce(array_agg(x order by x), '{}') into v_new
    from unnest(array[25, 50, 75, 100]) x where x <= v_pct and not (x = any (g.milestones));
  if cardinality(v_new) > 0 then
    update shared_goals set milestones = milestones || v_new where id = p_goal;
    for m in select user_id from shared_goal_members where goal_id = p_goal and status = 'active' and user_id <> p_actor loop
      perform social_notify(m, 'shared_milestone', p_actor, p_goal::text || ':' || v_new[cardinality(v_new)]);
    end loop;
  end if;
  return v_new;
end $$;

-- ======================================================================================
-- Colonies
-- ======================================================================================

create or replace function public.colony_create(p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_all uuid[];
  v_id uuid;
  m uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'kip:name'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_all from unnest(coalesce(p_members, '{}') || v_me) x;
  if cardinality(v_all) < 2 or cardinality(v_all) > 5 then raise exception 'kip:size'; end if;
  foreach m in array v_all loop
    if m <> v_me and not social_are_friends(v_me, m) then raise exception 'kip:not-friends'; end if;
    if colony_count(m) >= 3 then raise exception 'kip:too-many'; end if;
  end loop;
  insert into colonies (name, created_by) values (left(btrim(p_name), 30), v_me) returning id into v_id;
  insert into colony_members (colony_id, user_id) select v_id, x from unnest(v_all) x;
  foreach m in array v_all loop
    if m <> v_me then perform social_notify(m, 'colony_added', v_me, v_id::text); end if;
  end loop;
  return v_id;
end $$;

create or replace function public.colony_invite(p_colony uuid, p_friend uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if not colony_is_member(p_colony, v_me) then raise exception 'kip:gone'; end if;
  if not social_are_friends(v_me, p_friend) then raise exception 'kip:not-friends'; end if;
  if colony_is_member(p_colony, p_friend) then raise exception 'kip:member'; end if;
  if (select count(*) from colony_members where colony_id = p_colony) >= 5 then raise exception 'kip:full'; end if;
  if colony_count(p_friend) >= 3 then raise exception 'kip:too-many'; end if;
  if exists (select 1 from colony_invites where colony_id = p_colony and to_user = p_friend and status = 'pending') then return; end if;
  insert into colony_invites (colony_id, from_user, to_user) values (p_colony, v_me, p_friend);
  perform social_notify(p_friend, 'colony_invite', v_me, p_colony::text);
end $$;

-- in through an invite, or because a member is your friend (as in the mock)
create or replace function public.colony_join(p_colony uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  perform pg_advisory_xact_lock(hashtext('kip-colony:' || p_colony::text));
  if not exists (select 1 from colonies where id = p_colony) then raise exception 'kip:gone'; end if;
  if colony_is_member(p_colony, v_me) then return; end if;
  if not exists (select 1 from colony_members where colony_id = p_colony and social_are_friends(user_id, v_me)) then raise exception 'kip:not-friends'; end if;
  if (select count(*) from colony_members where colony_id = p_colony) >= 5 then raise exception 'kip:full'; end if;
  if colony_count(v_me) >= 3 then raise exception 'kip:too-many'; end if;
  insert into colony_members (colony_id, user_id) values (p_colony, v_me);
  update colony_invites set status = 'accepted' where colony_id = p_colony and to_user = v_me and status = 'pending';
end $$;

create or replace function public.colony_decline(p_colony uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'kip:signed-out'; end if;
  update colony_invites set status = 'declined' where colony_id = p_colony and to_user = auth.uid() and status = 'pending';
end $$;

-- Anyone leaves whenever they like. The last one out closes the colony. Shared goals don't depend
-- on the colony, so nobody's money moves.
create or replace function public.colony_leave(p_colony uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'kip:signed-out'; end if;
  delete from colony_members where colony_id = p_colony and user_id = auth.uid();
  delete from colonies c where c.id = p_colony and not exists (select 1 from colony_members m where m.colony_id = c.id);
end $$;

-- ======================================================================================
-- Shared goals
-- ======================================================================================

-- Friends you invite (or your colony's members) get an invite; you're in from the start.
create or replace function public.shared_create(p_name text, p_icon text, p_target bigint, p_date date, p_friends uuid[], p_colony uuid default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_people uuid[];
  v_id uuid;
  f uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if coalesce(btrim(p_name), '') = '' then raise exception 'kip:name'; end if;
  if p_target is null or p_target <= 0 or p_target > 100000000 then raise exception 'kip:amount'; end if;
  if p_date is null or p_date < social_today() then raise exception 'kip:date'; end if;
  if p_colony is not null and not colony_is_member(p_colony, v_me) then raise exception 'kip:gone'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_people from unnest(coalesce(p_friends, '{}')) x where x <> v_me;
  if cardinality(v_people) = 0 then raise exception 'kip:nobody'; end if;
  if cardinality(v_people) > 4 then raise exception 'kip:full'; end if;
  foreach f in array v_people loop
    if social_is_blocked(v_me, f) then raise exception 'kip:not-connected'; end if;
    if not social_are_friends(v_me, f) and not (p_colony is not null and colony_is_member(p_colony, f)) then raise exception 'kip:not-connected'; end if;
  end loop;
  insert into shared_goals (name, icon, target_bani, target_date, colony_id, created_by)
    values (left(btrim(p_name), 40), coalesce(nullif(p_icon, ''), 'beach'), p_target, p_date, p_colony, v_me) returning id into v_id;
  insert into shared_goal_members (goal_id, user_id, status, share_bani, joined_at) values (v_id, v_me, 'active', p_target, now());
  insert into shared_goal_members (goal_id, user_id, status, invited_by) select v_id, x, 'invited', v_me from unnest(v_people) x;
  foreach f in array v_people loop
    perform social_notify(f, 'shared_invite', v_me, v_id::text);
  end loop;
  return v_id;
end $$;

-- "Invite friends" later: up to 5 people, counting the ones still deciding
create or replace function public.shared_invite(p_goal uuid, p_friends uuid[]) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  f uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  perform pg_advisory_xact_lock(hashtext('kip-shared:' || p_goal::text));
  if not shared_is_active(p_goal, v_me) then raise exception 'kip:not-in'; end if;
  foreach f in array coalesce(p_friends, '{}') loop
    if f = v_me or exists (select 1 from shared_goal_members where goal_id = p_goal and user_id = f and status in ('active', 'invited')) then continue; end if;
    if not social_are_friends(v_me, f) or social_is_blocked(v_me, f) then raise exception 'kip:not-connected'; end if;
    if (select count(*) from shared_goal_members where goal_id = p_goal and status in ('active', 'invited')) >= 5 then raise exception 'kip:full'; end if;
    insert into shared_goal_members (goal_id, user_id, status, invited_by, invited_at)
      values (p_goal, f, 'invited', v_me, now())
      on conflict (goal_id, user_id) do update set status = 'invited', invited_by = v_me, invited_at = now(), joined_at = null, custom_share = false, share_bani = 0;
    perform social_notify(f, 'shared_invite', v_me, p_goal::text);
  end loop;
end $$;

-- Join (equal shares again, custom ones kept) or "No thanks"
create or replace function public.shared_respond(p_goal uuid, p_join boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  m uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  perform pg_advisory_xact_lock(hashtext('kip-shared:' || p_goal::text));
  if not exists (select 1 from shared_goal_members where goal_id = p_goal and user_id = v_me and status = 'invited') then
    if shared_is_active(p_goal, v_me) and p_join then return; end if;
    raise exception 'kip:gone';
  end if;
  if not p_join then
    update shared_goal_members set status = 'declined' where goal_id = p_goal and user_id = v_me;
    return;
  end if;
  update shared_goal_members set status = 'active', joined_at = now(), custom_share = false where goal_id = p_goal and user_id = v_me;
  perform shared_rebalance(p_goal);
  for m in select user_id from shared_goal_members where goal_id = p_goal and status = 'active' and user_id <> v_me loop
    perform social_notify(m, 'shared_joined', v_me, p_goal::text);
  end loop;
end $$;

-- your own share; the rest of the target is split evenly between the others
create or replace function public.shared_set_share(p_goal uuid, p_share bigint) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if not shared_is_active(p_goal, v_me) then raise exception 'kip:not-in'; end if;
  if p_share is null or p_share <= 0 then raise exception 'kip:amount'; end if;
  if p_share > (select target_bani from shared_goals where id = p_goal) then raise exception 'kip:share'; end if;
  update shared_goal_members set custom_share = (user_id = v_me), share_bani = case when user_id = v_me then p_share else share_bani end
    where goal_id = p_goal and status = 'active';
  perform shared_rebalance(p_goal);
end $$;

create or replace function public.shared_adjust_target(p_goal uuid, p_target bigint) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'kip:signed-out'; end if;
  if not shared_is_active(p_goal, auth.uid()) then raise exception 'kip:not-in'; end if;
  if p_target is null or p_target <= 0 or p_target > 100000000 then raise exception 'kip:amount'; end if;
  update shared_goals set target_bani = p_target, rebalance = false where id = p_goal;
  update shared_goal_members set custom_share = false where goal_id = p_goal;
  perform shared_rebalance(p_goal);
end $$;

create or replace function public.shared_redistribute(p_goal uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'kip:signed-out'; end if;
  if not shared_is_active(p_goal, auth.uid()) then raise exception 'kip:not-in'; end if;
  update shared_goals set rebalance = false where id = p_goal;
  update shared_goal_members set custom_share = false where goal_id = p_goal;
  perform shared_rebalance(p_goal);
end $$;

-- Leaving: your contributions leave the goal and come back to you as a returned balance (two
-- 'shared_return' rows, flagged by their note), withdrawable with payments.shared_withdraw.
create or replace function public.shared_leave(p_goal uuid) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_own bigint;
  v_name text;
  m uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  perform pg_advisory_xact_lock(hashtext('avansul-money:' || v_me::text));
  perform pg_advisory_xact_lock(hashtext('kip-shared:' || p_goal::text));
  if exists (select 1 from shared_goal_members where goal_id = p_goal and user_id = v_me and status = 'invited') then
    update shared_goal_members set status = 'declined' where goal_id = p_goal and user_id = v_me;
    return 0;
  end if;
  if not shared_is_active(p_goal, v_me) then raise exception 'kip:not-in'; end if;
  select name into v_name from shared_goals where id = p_goal;
  v_own := shared_own_bani(p_goal, v_me);
  if v_own > 0 then
    insert into ledger_entries (user_id, bucket, type, shared_goal_id, amount_bani, status, entry_date, note) values
      (v_me, 'shared', 'shared_return', p_goal, -v_own, 'confirmed', social_today(), left('Returned to you: you left ' || v_name, 140)),
      (v_me, 'shared', 'shared_return', null, v_own, 'confirmed', social_today(), left('Back from ' || v_name || ', ready to withdraw', 140));
  end if;
  update shared_goal_members set status = 'left', custom_share = false, share_bani = 0 where goal_id = p_goal and user_id = v_me;
  if exists (select 1 from shared_goal_members where goal_id = p_goal and status = 'active') then
    update shared_goals set rebalance = true where id = p_goal;
    perform shared_rebalance(p_goal);
    for m in select user_id from shared_goal_members where goal_id = p_goal and status = 'active' loop
      perform social_notify(m, 'shared_left', v_me, p_goal::text);
    end loop;
  end if;
  return greatest(v_own, 0);
end $$;

-- ---------- money (server only: payments and stripe-webhook) ----------

-- A confirmed (or failed) Stripe shared deposit, once per payment, like record_stripe_money.
create or replace function public.record_shared_money(p_user uuid, p_goal uuid, p_amount bigint, p_status text, p_object text, p_event text, p_date date)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_id uuid;
begin
  insert into ledger_entries (user_id, bucket, type, shared_goal_id, amount_bani, status, stripe_object_id, stripe_event_id, entry_date)
    values (p_user, 'shared', 'shared_deposit', p_goal, p_amount, p_status, p_object, p_event, p_date)
  on conflict (stripe_object_id, type) where stripe_object_id is not null
  do update set
    status = case when ledger_entries.status = 'confirmed' then 'confirmed' else excluded.status end,
    amount_bani = case when ledger_entries.status = 'confirmed' then ledger_entries.amount_bani else excluded.amount_bani end,
    stripe_event_id = excluded.stripe_event_id
  returning id into v_id;
  if p_status = 'confirmed' then perform shared_note_progress(p_goal, p_user); end if;
  return v_id;
end $$;

-- Only your own: from one goal (p_goal) or from what came back from goals you left (p_goal null).
-- In the sandbox the payout is simulated, like withdraw_own.
create or replace function public.shared_withdraw_own(p_user uuid, p_goal uuid, p_amount bigint, p_date date) returns bigint
language plpgsql security definer set search_path = public as $$
declare
  v_own bigint;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'invalid_amount'; end if;
  perform pg_advisory_xact_lock(hashtext('avansul-money:' || p_user::text));
  v_own := case when p_goal is null then shared_returned_bani(p_user) else shared_own_bani(p_goal, p_user) end;
  if p_amount > v_own then raise exception 'insufficient:%', greatest(v_own, 0); end if;
  insert into ledger_entries (user_id, bucket, type, shared_goal_id, amount_bani, status, entry_date, note)
    values (p_user, 'shared', 'shared_withdrawal', p_goal, -p_amount, 'confirmed', p_date, 'Withdrawal (simulated payout in sandbox)');
  return p_amount;
end $$;

-- "Deposit" without Stripe, for the six test accounts only (like social_sandbox_save_today).
create or replace function public.social_sandbox_shared_deposit(p_goal uuid, p_amount_bani integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if not social_is_test_phone((select phone from auth.users where id = v_me)) then raise exception 'kip:not-sandbox'; end if;
  if p_amount_bani is null or p_amount_bani not between 100 and 500000 then raise exception 'kip:amount'; end if;
  if not shared_is_active(p_goal, v_me) then raise exception 'kip:not-in'; end if;
  insert into ledger_entries (user_id, bucket, type, shared_goal_id, amount_bani, status, entry_date, note)
    values (v_me, 'shared', 'shared_deposit', p_goal, p_amount_bani, 'confirmed', social_today(), 'seed:kip-social sandbox shared deposit (no Stripe)');
  return jsonb_build_object('crossed', to_jsonb(shared_note_progress(p_goal, v_me)));
end $$;

-- ======================================================================================
-- What the app reads: social_groups()
-- ======================================================================================

create or replace function public.social_groups() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_people uuid[];
  v_colonies uuid[];
  v_goals uuid[];
  u uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  select coalesce(array_agg(distinct c), '{}') into v_colonies from (
    select colony_id c from colony_members where user_id = v_me
    union select colony_id from colony_invites where to_user = v_me and status = 'pending') t;
  select coalesce(array_agg(goal_id), '{}') into v_goals from shared_goal_members where user_id = v_me and status in ('active', 'invited');
  select coalesce(array_agg(distinct x), '{}') into v_people from (
    select user_id x from colony_members where colony_id = any (v_colonies)
    union select user_id from shared_goal_members where goal_id = any (v_goals) and status in ('active', 'invited')
    union select from_user from colony_invites where to_user = v_me and status = 'pending') t
  where x <> v_me;
  foreach u in array v_people loop
    perform social_settle(u);
  end loop;

  return jsonb_build_object(
    'people', coalesce((select jsonb_agg(jsonb_build_object('id', p.user_id, 'name', p.first_name, 'status', social_status(p.user_id)))
                        from profiles p where p.user_id = any (v_people)), '[]'),
    'colonies', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'code', c.code, 'created_by', c.created_by, 'created_at', c.created_at,
                                          'members', (select coalesce(jsonb_agg(jsonb_build_object('user', m.user_id, 'joined_on', m.joined_on) order by m.joined_on, m.user_id), '[]')
                                                      from colony_members m where m.colony_id = c.id)))
      from colonies c where c.id = any (v_colonies)), '[]'),
    'colony_invites', coalesce((
      select jsonb_agg(jsonb_build_object('id', i.id, 'colony', i.colony_id, 'from', i.from_user, 'to', i.to_user, 'at', i.created_at, 'status', i.status))
      from colony_invites i where i.status = 'pending' and (i.to_user = v_me or i.from_user = v_me)), '[]'),
    -- per goal: the total %, each active member's % of their own share, and only my own amount
    'shared_goals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'name', g.name, 'icon', g.icon, 'target', g.target_bani, 'date', g.target_date, 'colony', g.colony_id,
        'created_by', g.created_by, 'created_at', g.created_at, 'milestones', to_jsonb(g.milestones), 'rebalance', g.rebalance,
        'total_pct', round(least(shared_total_bani(g.id) * 100.0 / g.target_bani, 100), 2),
        'mine', shared_own_bani(g.id, v_me),
        'members', (select coalesce(jsonb_agg(jsonb_build_object(
                      'user', m.user_id, 'status', m.status, 'share', m.share_bani, 'invited_by', m.invited_by,
                      'pct', case when m.status = 'active' and m.share_bani > 0
                                  then floor(least(greatest(shared_own_bani(g.id, m.user_id), 0) * 100.0 / m.share_bani, 100)) else 0 end)
                      order by m.joined_at nulls last, m.invited_at), '[]')
                    from shared_goal_members m where m.goal_id = g.id and m.status in ('active', 'invited'))))
      from shared_goals g where g.id = any (v_goals)), '[]'),
    'returned_bani', shared_returned_bani(v_me)
  );
end $$;

-- ======================================================================================
-- Demo seed: social_demo_reset() calls this at the end
-- ======================================================================================

-- colony "Foculețul" (Alex, Ana, Mihai, Ioana) and the shared goal "Vama Veche", 2,000 lei by next
-- July, at 46% from confirmed shared deposits: Alex 40%, Ana 52%, Mihai 60%, Ioana 32% of their
-- 500 lei shares. Alex depositing 80 lei takes it to 50% (a milestone) in the demo.
create or replace function public.social_demo_reset_shared(alex uuid, ana uuid, mihai uuid, ioana uuid, radu uuid, elena uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ids uuid[] := array[alex, ana, mihai, ioana, radu, elena];
  v_today date := social_today();
  v_colony uuid;
  v_goal uuid;
  r record;
begin
  delete from shared_goals where created_by = any (v_ids)
    or id in (select goal_id from shared_goal_members where user_id = any (v_ids));
  delete from colonies where created_by = any (v_ids)
    or id in (select colony_id from colony_members where user_id = any (v_ids));
  delete from colony_invites where from_user = any (v_ids) or to_user = any (v_ids);
  -- leftovers of goals that are gone (returned balances, sandbox rows)
  delete from ledger_entries where user_id = any (v_ids) and bucket = 'shared';

  insert into colonies (name, created_by, created_at, code) values ('Foculețul', ana, now() - interval '30 days', 'FOCUL1') returning id into v_colony;
  insert into colony_members (colony_id, user_id, joined_on)
    select v_colony, x, v_today - 30 from unnest(array[ana, alex, mihai, ioana]) x;

  insert into shared_goals (name, icon, target_bani, target_date, colony_id, created_by, created_at, milestones)
    values ('Vama Veche', 'beach', 200000, make_date(extract(year from v_today)::integer + 1, 7, 15), v_colony, ana, now() - interval '25 days', '{25}')
    returning id into v_goal;
  insert into shared_goal_members (goal_id, user_id, status, share_bani, invited_by, invited_at, joined_at)
    select v_goal, x, 'active', 50000, case when x = ana then null else ana end, now() - interval '25 days', now() - interval '25 days' + (o || ' hours')::interval
    from unnest(array[ana, alex, mihai, ioana]) with ordinality t(x, o);

  -- two deposits each: 200 + 260 + 300 + 160 lei = 920 lei = 46%
  for r in select * from (values
      (alex, 12000, 20), (alex, 8000, 6),
      (ana, 16000, 22), (ana, 10000, 9),
      (mihai, 18000, 18), (mihai, 12000, 4),
      (ioana, 10000, 15), (ioana, 6000, 3)
    ) s(who, amount, ago) loop
    insert into ledger_entries (user_id, bucket, type, shared_goal_id, amount_bani, status, entry_date, note, created_at)
      values (r.who, 'shared', 'shared_deposit', v_goal, r.amount, 'confirmed', v_today - r.ago, 'seed:kip-social shared',
              social_day_start(v_today - r.ago) + interval '18 hours');
  end loop;
end $$;

-- ======================================================================================
-- Grants
-- ======================================================================================

revoke all on function public.colony_count(uuid), public.colony_is_member(uuid, uuid), public.shared_is_active(uuid, uuid),
  public.shared_own_bani(uuid, uuid), public.shared_total_bani(uuid), public.shared_returned_bani(uuid), public.shared_rebalance(uuid),
  public.shared_note_progress(uuid, uuid), public.colony_create(text, uuid[]), public.colony_invite(uuid, uuid), public.colony_join(uuid),
  public.colony_decline(uuid), public.colony_leave(uuid), public.shared_create(text, text, bigint, date, uuid[], uuid),
  public.shared_invite(uuid, uuid[]), public.shared_respond(uuid, boolean), public.shared_set_share(uuid, bigint),
  public.shared_adjust_target(uuid, bigint), public.shared_redistribute(uuid), public.shared_leave(uuid),
  public.record_shared_money(uuid, uuid, bigint, text, text, text, date), public.shared_withdraw_own(uuid, uuid, bigint, date),
  public.social_sandbox_shared_deposit(uuid, integer), public.social_groups(),
  public.social_demo_reset_shared(uuid, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.colony_create(text, uuid[]), public.colony_invite(uuid, uuid), public.colony_join(uuid),
  public.colony_decline(uuid), public.colony_leave(uuid), public.shared_create(text, text, bigint, date, uuid[], uuid),
  public.shared_invite(uuid, uuid[]), public.shared_respond(uuid, boolean), public.shared_set_share(uuid, bigint),
  public.shared_adjust_target(uuid, bigint), public.shared_redistribute(uuid), public.shared_leave(uuid),
  public.social_sandbox_shared_deposit(uuid, integer), public.social_groups()
  to authenticated;

grant execute on function public.record_shared_money(uuid, uuid, bigint, text, text, text, date),
  public.shared_withdraw_own(uuid, uuid, bigint, date), public.social_demo_reset_shared(uuid, uuid, uuid, uuid, uuid, uuid)
  to service_role;

-- social_demo_reset() from 0018, now also seeding colonies and shared goals at the end
create or replace function public.social_demo_reset() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := social_today();
  v_ids uuid[];
  alex uuid; ana uuid; mihai uuid; ioana uuid; radu uuid; elena uuid;
  r record;
  d date;
  v_goal uuid;
  v_daily integer;
begin
  select id into alex from auth.users where phone = '40700000100';
  select id into ana from auth.users where phone = '40700000101';
  select id into mihai from auth.users where phone = '40700000102';
  select id into ioana from auth.users where phone = '40700000103';
  select id into radu from auth.users where phone = '40700000104';
  select id into elena from auth.users where phone = '40700000105';
  if alex is null or ana is null or mihai is null or ioana is null or radu is null or elena is null then
    raise exception 'social_demo_reset: the six test accounts (+40700000100..105) must exist first';
  end if;
  v_ids := array[alex, ana, mihai, ioana, radu, elena];

  -- wipe their social state, clubs and seed savings
  delete from social_notices where to_user = any (v_ids) or actor = any (v_ids);
  delete from cheers where from_user = any (v_ids) or to_user = any (v_ids);
  delete from friend_requests where from_user = any (v_ids) or to_user = any (v_ids);
  delete from friendships where user_a = any (v_ids) or user_b = any (v_ids);
  delete from blocks where blocker = any (v_ids) or blocked = any (v_ids);
  delete from freeze_asks where from_user = any (v_ids);
  delete from freeze_gifts where from_user = any (v_ids) or to_user = any (v_ids);
  delete from dangers where user_id = any (v_ids);
  delete from frozen_days where user_id = any (v_ids);
  delete from freeze_state where user_id = any (v_ids);
  delete from club_memberships where user_id = any (v_ids);
  delete from promo_claims where user_id = any (v_ids);
  delete from club_users where user_id = any (v_ids);
  delete from ledger_entries where user_id = any (v_ids) and note like 'seed:kip-social%';

  update profiles set discoverable = true, invited_by = null where user_id = any (v_ids);
  update profiles set first_name = x.name from (values (alex, 'Alex'), (ana, 'Ana'), (mihai, 'Mihai'), (ioana, 'Ioana'), (radu, 'Radu'), (elena, 'Elena')) x(id, name)
    where profiles.user_id = x.id and coalesce(profiles.first_name, '') = '';

  -- saving history: (who, first day back, last day back) as offsets from today; one deposit a day,
  -- the daily amount plus up to 10 lei
  for r in select * from (values
      (alex, 27, 1),   -- 27 days through yesterday, not yet today: he can save during the demo
      (ana, 15, 2),    -- 14 days, then missed yesterday
      (mihai, 21, 0),  -- 22 days through today
      (ioana, 30, 1),  -- 30 days through yesterday
      (radu, 6, 0),    -- 7 days through today
      (elena, 52, 0)   -- 53 days through today (past 45: she has a 1-week Freeze)
    ) s(who, back_from, back_to) loop
    select id into v_goal from goals where user_id = r.who and is_primary and status = 'active';
    select greatest(coalesce(daily_amount_bani, 0), 100) into v_daily from profiles where user_id = r.who;
    d := v_today - r.back_from;
    while d <= v_today - r.back_to loop
      insert into ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, entry_date, note, created_at)
        values (r.who, v_goal, case when v_goal is null then 'de_pus_deoparte' else 'goal' end, 'extra_deposit',
                coalesce(v_daily, 100) + (abs(hashtext(r.who::text || d::text)) % 11) * 100, 'confirmed', d, 'seed:kip-social',
                least(now(), social_day_start(d) + interval '19 hours' + ((abs(hashtext(d::text)) % 120) || ' minutes')::interval));
      d := d + 1;
    end loop;
  end loop;

  -- freezes: everyone settled through yesterday, so the seed story is what the rules see
  insert into freeze_state (user_id, day_freeze, day_recharge_at, week_freeze, week_milestone, settled_through) values
    (alex, 1, null, 0, 0, v_today - 1),
    (ana, 0, now() + interval '4 days', 0, 0, v_today - 1),
    (mihai, 1, null, 0, 0, v_today - 1),
    (ioana, 0, now() + interval '5 days', 0, 0, v_today - 1),
    (radu, 1, null, 0, 0, v_today - 1),
    (elena, 1, null, 1, 45, v_today - 1);
  -- Ioana's 1-day Freeze covered a day two weeks ago (her run went through it)
  delete from ledger_entries where user_id = ioana and note = 'seed:kip-social' and entry_date = v_today - 14;
  insert into frozen_days (user_id, day, by) values (ioana, v_today - 14, 'day');
  update freeze_state set day_recharge_at = social_day_start(v_today - 13) + interval '7 days', day_freeze = 1 where user_id = ioana;
  -- Ana: her 1-day Freeze covered a missed day 3 days ago, so it's still recharging
  delete from ledger_entries where user_id = ana and note = 'seed:kip-social' and entry_date = v_today - 3;
  insert into frozen_days (user_id, day, by) values (ana, v_today - 3, 'day');
  update freeze_state set day_recharge_at = social_day_start(v_today - 2) + interval '7 days' where user_id = ana;
  -- yesterday: missed, no freeze, so 24 hours of danger (until the end of today)
  insert into dangers (user_id, day, until, status) values (ana, v_today - 1, social_day_start(v_today + 1), 'open');

  insert into friendships (user_a, user_b, since)
    select least(a, b), greatest(a, b), now() - (k || ' days')::interval
    from (values (alex, mihai, 40), (alex, ioana, 35), (ana, mihai, 60), (ana, ioana, 58), (mihai, ioana, 70),
                 (radu, elena, 20), (mihai, radu, 15)) f(a, b, k);
  insert into friend_requests (from_user, to_user, created_at) values (ana, alex, now() - interval '2 hours');
  insert into freeze_asks (from_user, to_users, day, created_at) values (ana, array[mihai, ioana], v_today - 1, now() - interval '90 minutes');

  -- clubs (joined_at decides which stay active after a break: the oldest)
  insert into club_memberships (user_id, club_slug, status, joined_at, paused_at, comeback_until)
    select who, slug, st, now() - (ago || ' days')::interval, p_at, c_until
    from (values
      (alex, 'erasmus', 'active', 20, null::date, null::date),
      (alex, 'travel', 'active', 6, null, null),
      (ana, 'emergency-fund', 'active', 90, null, null),
      (ana, 'erasmus', 'paused', 80, v_today - 15, v_today + 15),
      (ana, 'travel', 'paused', 60, v_today - 15, v_today + 15),
      (mihai, 'travel', 'active', 12, null, null),
      (ioana, 'erasmus', 'active', 25, null, null),
      (ioana, 'first-apartment', 'active', 10, null, null),
      (radu, 'my-car', 'active', 30, null, null),
      (radu, 'tech', 'lost', 70, v_today - 40, v_today - 10),
      (elena, 'travel', 'active', 50, null, null),
      (elena, 'tech', 'active', 40, null, null),
      (elena, 'emergency-fund', 'active', 20, null, null)
    ) m(who, slug, st, ago, p_at, c_until);
  -- what clubs_settle "last saw" is today's streak, so the reset itself is not read as a break
  insert into club_users (user_id, last_streak)
    select u, coalesce((social_status(u) ->> 'streak')::integer, 0) from unnest(v_ids) u;

  -- colonies and shared goals (0019)
  perform social_demo_reset_shared(alex, ana, mihai, ioana, radu, elena);

  return jsonb_build_object('today', v_today, 'alex', alex, 'ana', ana, 'mihai', mihai, 'ioana', ioana, 'radu', radu, 'elena', elena);
end $$;
