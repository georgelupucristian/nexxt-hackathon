-- Kip's social layer, the core that has to be real: friends (requests, accept, decline, cancel,
-- remove, block), being findable by phone number, the 1-day Freeze, giving it to a friend in danger
-- and asking friends for one. Colonies, shared goals, cheers and the witness still run on the
-- app's simulated world (app/src/lib/social/repo.ts) and are not here yet.
--
-- The rules mirror app/src/lib/social/rules.ts:
--   - a friendship exists only once the other person accepts (or when they had already asked you)
--   - no cap on friends, at most 50 requests sent a day
--   - a block hides both people from each other (no match, no request, the friendship goes)
--   - the 1-day Freeze: never more than one, used on its own at the end of a missed day when there
--     is a run to protect, back exactly 7 days after it went
--   - giving it: the giver's 7-day recharge starts; it works only if the rescued person saves
--     within 24 hours, otherwise it goes back to the giver and the recharge is cancelled
--   - at most 2 freezes received in 30 days
--   - inviting: whoever joins through your link starts with a 1-day Freeze, and yours recharges
--     right away (instead of the old "2 bonus streak days": a streak only grows from saving)
--
-- A day counts for the streak when money was put aside: a confirmed deposit (topup, extra_deposit,
-- parent_match) in ledger_entries, by entry_date. Days are Europe/Bucharest days.
--
-- How it stays correct over time: every function that reads or writes someone's social state first
-- runs social_settle() for them (lazy evaluation: missed days, the automatic freeze, gifts that
-- worked or went back, dangers that ran out). A pg_cron job settles everyone every 10 minutes too,
-- so the "your freeze came back" notices arrive even when nobody opens the app. Settling is
-- idempotent, so the two never disagree.
--
-- Who sees what: the tables have RLS and no grants for anon or signed-in users (except reading
-- your own notices, for Realtime). Everything goes through SECURITY DEFINER functions:
-- social_world() returns only what the caller may see: about friends, only name, streak, saved
-- today and freeze status. Never an amount, never anyone else's ledger.

-- ---------- profiles: findable by number, the invite link ----------
alter table public.profiles
  add column if not exists discoverable boolean not null default true,
  add column if not exists invite_code text unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  add column if not exists invited_by uuid references auth.users (id) on delete set null;
update public.profiles set invite_code = upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)) where invite_code is null;
alter table public.profiles alter column invite_code set not null;
create index if not exists profiles_invited_by_idx on public.profiles (invited_by);

-- ---------- friends ----------
create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (from_user <> to_user)
);
create unique index friend_requests_one_pending on public.friend_requests (from_user, to_user) where status = 'pending';
create index friend_requests_to_idx on public.friend_requests (to_user, status);
create index friend_requests_from_day_idx on public.friend_requests (from_user, created_at);

-- stored ordered (user_a < user_b): one row per pair
create table public.friendships (
  user_a uuid not null references auth.users (id) on delete cascade,
  user_b uuid not null references auth.users (id) on delete cascade,
  since timestamptz not null default now(),
  primary key (user_a, user_b),
  check (user_a < user_b)
);
create index friendships_b_idx on public.friendships (user_b);

create table public.blocks (
  blocker uuid not null references auth.users (id) on delete cascade,
  blocked uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
create index blocks_blocked_idx on public.blocks (blocked);

-- ---------- freezes ----------
create table public.freeze_state (
  user_id uuid primary key references auth.users (id) on delete cascade,
  day_freeze smallint not null default 1 check (day_freeze between 0 and 1),
  day_recharge_at timestamptz,
  week_freeze smallint not null default 0 check (week_freeze between 0 and 1),
  week_milestone integer not null default 0,
  week_from date,
  -- missed days up to here have been looked at by the end-of-day rule
  settled_through date not null,
  updated_at timestamptz not null default now()
);

create table public.frozen_days (
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  by text not null check (by in ('day', 'week', 'gift')),
  primary key (user_id, day)
);

-- a missed day with no freeze: 24 hours (to the end of the next day) in which a friend can help
create table public.dangers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  day date not null,
  until timestamptz not null,
  status text not null default 'open' check (status in ('open', 'rescued', 'lapsed')),
  created_at timestamptz not null default now(),
  unique (user_id, day)
);

-- "Can you help me with a freeze?": one tap, the friends picked, no reason asked
create table public.freeze_asks (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_users uuid[] not null check (cardinality(to_users) between 1 and 50),
  day date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);
create index freeze_asks_from_idx on public.freeze_asks (from_user, day);
create index freeze_asks_to_idx on public.freeze_asks using gin (to_users);

create table public.freeze_gifts (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  day date not null,
  given_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending', 'active', 'returned')),
  resolved_at timestamptz,
  check (from_user <> to_user)
);
create index freeze_gifts_to_idx on public.freeze_gifts (to_user, status);
create index freeze_gifts_from_idx on public.freeze_gifts (from_user, status);
-- one friend's freeze per missed day
create unique index freeze_gifts_one_per_day on public.freeze_gifts (to_user, day) where status <> 'returned';

-- ---------- cheers ----------
-- three predefined reactions, no free text; at most 3 a day to the same friend
create table public.cheers (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users (id) on delete cascade,
  to_user uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('bravo', 'poti', 'aici')),
  created_at timestamptz not null default now(),
  check (from_user <> to_user)
);
create index cheers_pair_idx on public.cheers (from_user, to_user, created_at);
create index cheers_to_idx on public.cheers (to_user, created_at);

-- ---------- notices ----------
-- Structured, so the app writes the words (in its own language): kind + who + where it links.
create table public.social_notices (
  id uuid primary key default gen_random_uuid(),
  to_user uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('request', 'accepted', 'ask', 'gift', 'gift_worked', 'gift_returned', 'invite_joined', 'invited', 'cheer')),
  actor uuid references auth.users (id) on delete cascade,
  -- the cheer's kind, for 'cheer'
  detail text check (char_length(detail) <= 20),
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index social_notices_to_idx on public.social_notices (to_user, created_at desc);
create index social_notices_actor_idx on public.social_notices (actor);

-- ---------- row level security ----------
alter table public.friend_requests enable row level security;
alter table public.friendships enable row level security;
alter table public.blocks enable row level security;
alter table public.freeze_state enable row level security;
alter table public.frozen_days enable row level security;
alter table public.dangers enable row level security;
alter table public.freeze_asks enable row level security;
alter table public.freeze_gifts enable row level security;
alter table public.social_notices enable row level security;
alter table public.cheers enable row level security;

-- Own rows only. These tables have no grants for anon or signed-in users (social_world() is the way
-- in), so the policies only matter if a grant is ever added; social_notices is the exception: it
-- is readable (own rows) so Realtime can tell the app something happened.
create policy "own requests" on public.friend_requests for select using ((select auth.uid()) in (from_user, to_user));
create policy "own friendships" on public.friendships for select using ((select auth.uid()) in (user_a, user_b));
create policy "own blocks" on public.blocks for select using (blocker = (select auth.uid()));
create policy "own freezes" on public.freeze_state for select using (user_id = (select auth.uid()));
create policy "own frozen days" on public.frozen_days for select using (user_id = (select auth.uid()));
create policy "own dangers" on public.dangers for select using (user_id = (select auth.uid()));
create policy "own asks" on public.freeze_asks for select using (from_user = (select auth.uid()));
create policy "the two of us" on public.freeze_gifts for select using ((select auth.uid()) in (from_user, to_user));
create policy "the two of us" on public.cheers for select using ((select auth.uid()) in (from_user, to_user));
create policy "own notices" on public.social_notices for select using (to_user = (select auth.uid()));

revoke all on public.friend_requests, public.friendships, public.blocks, public.freeze_state, public.frozen_days,
  public.dangers, public.freeze_asks, public.freeze_gifts, public.social_notices, public.cheers from public, anon, authenticated;
grant select on public.social_notices to authenticated;
grant all on public.friend_requests, public.friendships, public.blocks, public.freeze_state, public.frozen_days,
  public.dangers, public.freeze_asks, public.freeze_gifts, public.social_notices, public.cheers to service_role;

alter publication supabase_realtime add table public.social_notices;

-- ======================================================================================
-- Helpers (server only)
-- ======================================================================================

create or replace function public.social_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Europe/Bucharest')::date
$$;

-- local midnight at the start of a Bucharest day
create or replace function public.social_day_start(p_day date) returns timestamptz
language sql immutable set search_path = public as $$
  select (p_day::timestamp at time zone 'Europe/Bucharest')
$$;

create or replace function public.social_are_friends(p_a uuid, p_b uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from friendships where user_a = least(p_a, p_b) and user_b = greatest(p_a, p_b))
$$;

-- either way round
create or replace function public.social_is_blocked(p_a uuid, p_b uuid) returns boolean
language sql stable set search_path = public as $$
  select exists (select 1 from blocks where (blocker = p_a and blocked = p_b) or (blocker = p_b and blocked = p_a))
$$;

-- the days money was put aside (confirmed deposits only), the last 400 days
create or replace function public.social_saved_days(p_user uuid) returns date[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(distinct entry_date), '{}')
  from ledger_entries
  where user_id = p_user and status = 'confirmed' and amount_bani > 0
    and type in ('topup', 'extra_deposit', 'parent_match')
    and entry_date > social_today() - 400
$$;

-- days a freeze covers: used 1-day Freezes, friends' freezes that worked, a running 1-week Freeze
create or replace function public.social_frozen_days(p_user uuid) returns date[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(d), '{}') from (
    select day as d from frozen_days where user_id = p_user
    union
    select (f.week_from + i)::date from freeze_state f cross join generate_series(0, 6) i
    where f.user_id = p_user and f.week_from is not null
  ) x
$$;

-- rules.runThrough: the run as it stood at the end of p_day (saved days count, frozen ones hold)
create or replace function public.social_run_through(p_saved date[], p_frozen date[], p_day date) returns integer
language plpgsql immutable set search_path = public as $$
declare
  n integer := 0;
  d date := p_day;
begin
  for i in 1..400 loop
    if d = any (p_saved) then n := n + 1;
    elsif not (d = any (p_frozen)) then exit;
    end if;
    d := d - 1;
  end loop;
  return n;
end $$;

-- rules.streakOf: days in a row with money put aside, walking back from today. A frozen day
-- neither adds nor breaks; today without a saving yet doesn't break it; p_hold (a missed day still
-- inside its 24 hours of danger) holds the run.
create or replace function public.social_streak_of(p_saved date[], p_frozen date[], p_today date, p_hold date) returns integer
language plpgsql immutable set search_path = public as $$
declare
  n integer := 0;
  d date := case when p_today = any (p_saved) then p_today else p_today - 1 end;
begin
  for i in 1..400 loop
    if d = any (p_saved) then n := n + 1;
    elsif not (d = any (p_frozen)) and d is distinct from p_hold then exit;
    end if;
    d := d - 1;
  end loop;
  return n;
end $$;

create or replace function public.social_notify(p_to uuid, p_kind text, p_actor uuid, p_detail text default null) returns void
language sql set search_path = public as $$
  insert into social_notices (to_user, kind, actor, detail) values (p_to, p_kind, p_actor, p_detail)
$$;

-- ======================================================================================
-- The end-of-day rules, for one person (idempotent; see the top of the file)
-- ======================================================================================

create or replace function public.social_settle(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_today date := social_today();
  v_saved date[];
  v_frozen date[];
  v_f freeze_state;
  g record;
  d date;
  v_streak integer;
  v_reached integer;
  v_hold date;
begin
  if p_user is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended('kip-social:' || p_user::text, 0));
  -- a new account starts with its 1-day Freeze; missed days before today were never its business
  insert into freeze_state (user_id, settled_through) values (p_user, v_today - 1) on conflict do nothing;

  -- 1. friends' freezes waiting for this person: they work once a saving lands in time, or go back
  for g in select * from freeze_gifts where to_user = p_user and status = 'pending' loop
    if exists (
      select 1 from ledger_entries
      where user_id = p_user and status = 'confirmed' and amount_bani > 0 and type in ('topup', 'extra_deposit', 'parent_match')
        and created_at >= social_day_start(g.day + 1) and created_at <= least(g.given_at + interval '24 hours', v_now)
    ) then
      update freeze_gifts set status = 'active', resolved_at = v_now where id = g.id and status = 'pending';
      insert into frozen_days (user_id, day, by) values (p_user, g.day, 'gift') on conflict (user_id, day) do nothing;
      update dangers set status = 'rescued' where user_id = p_user and day = g.day;
      -- days after the rescued one are looked at again: the run is whole now
      update freeze_state set settled_through = least(settled_through, g.day) where user_id = p_user;
      perform social_notify(g.from_user, 'gift_worked', p_user);
    elsif v_now > g.given_at + interval '24 hours' then
      update freeze_gifts set status = 'returned', resolved_at = v_now where id = g.id and status = 'pending';
      -- back to the giver, and the recharge it started is cancelled
      update freeze_state set day_freeze = 1, day_recharge_at = null, updated_at = v_now where user_id = g.from_user;
      perform social_notify(g.from_user, 'gift_returned', p_user);
    end if;
  end loop;

  select * into v_f from freeze_state where user_id = p_user for update;
  v_saved := social_saved_days(p_user);
  v_frozen := social_frozen_days(p_user);

  -- 2. back exactly 7 days after it went
  if v_f.day_freeze = 0 and v_f.day_recharge_at is not null and v_f.day_recharge_at <= v_now then
    v_f.day_freeze := 1;
    v_f.day_recharge_at := null;
  end if;

  -- 3. every missed day up to yesterday: the 1-day Freeze goes on by itself if there's a run to
  --    protect; without one, the day is in danger for 24 hours
  d := greatest(v_f.settled_through + 1, v_today - 60);
  while d <= v_today - 1 loop
    if v_f.day_freeze = 0 and v_f.day_recharge_at is not null and v_f.day_recharge_at <= social_day_start(d + 1) then
      v_f.day_freeze := 1;
      v_f.day_recharge_at := null;
    end if;
    if not (d = any (v_saved)) and not (d = any (v_frozen)) and social_run_through(v_saved, v_frozen, d - 1) > 0 then
      if v_f.day_freeze = 1 then
        v_f.day_freeze := 0;
        v_f.day_recharge_at := social_day_start(d + 1) + interval '7 days';
        insert into frozen_days (user_id, day, by) values (p_user, d, 'day') on conflict (user_id, day) do nothing;
        v_frozen := v_frozen || d;
      else
        insert into dangers (user_id, day, until, status)
          values (p_user, d, social_day_start(d + 2), case when v_now < social_day_start(d + 2) then 'open' else 'lapsed' end)
          on conflict (user_id, day) do nothing;
      end if;
    end if;
    d := d + 1;
  end loop;
  v_f.settled_through := greatest(v_f.settled_through, v_today - 1);

  -- 4. the 24 hours ran out and no friend's freeze is waiting
  update dangers x set status = 'lapsed'
  where x.user_id = p_user and x.status = 'open' and v_now >= x.until
    and not exists (select 1 from freeze_gifts fg where fg.to_user = p_user and fg.day = x.day and fg.status = 'pending'
                    and v_now <= fg.given_at + interval '24 hours');
  update freeze_asks a set status = 'closed'
  where a.from_user = p_user and a.status = 'open'
    and not exists (select 1 from dangers x where x.user_id = p_user and x.day = a.day and x.status = 'open');

  -- 5. the 1-week Freeze: earned at 45, 90, 135... saved days in a row (frozen days don't count)
  select day into v_hold from dangers where user_id = p_user and status = 'open' order by day desc limit 1;
  v_streak := social_streak_of(v_saved, v_frozen, v_today, v_hold);
  v_reached := (v_streak / 45) * 45;
  if v_streak < v_f.week_milestone then v_f.week_milestone := v_reached; end if;
  if v_reached > v_f.week_milestone then
    v_f.week_freeze := 1;
    v_f.week_milestone := v_reached;
  end if;

  update freeze_state set day_freeze = v_f.day_freeze, day_recharge_at = v_f.day_recharge_at, week_freeze = v_f.week_freeze,
    week_milestone = v_f.week_milestone, settled_through = v_f.settled_through, updated_at = v_now
  where user_id = p_user;
end $$;

-- What anyone connected may know about a person: streak, saved today, freeze status. No amounts.
create or replace function public.social_status(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_today date := social_today();
  v_saved date[] := social_saved_days(p_user);
  v_frozen date[] := social_frozen_days(p_user);
  v_f freeze_state;
  v_danger dangers;
  v_gift freeze_gifts;
  v_week_running boolean;
begin
  select * into v_f from freeze_state where user_id = p_user;
  select * into v_danger from dangers where user_id = p_user and status = 'open' order by day desc limit 1;
  if v_danger.id is not null then
    select * into v_gift from freeze_gifts where to_user = p_user and day = v_danger.day and status = 'pending'
      and now() <= given_at + interval '24 hours' limit 1;
    -- open: still inside its 24 hours, or a friend's freeze is waiting
    if not (now() < v_danger.until or v_gift.id is not null) then v_danger := null; end if;
  end if;
  v_week_running := v_f.week_from is not null and v_today between v_f.week_from and v_f.week_from + 6;
  return jsonb_build_object(
    'streak', social_streak_of(v_saved, v_frozen, v_today, v_danger.day),
    'saved_today', v_today = any (v_saved),
    'frozen_today', v_today = any (v_frozen) and not (v_today = any (v_saved)),
    'has_day_freeze', coalesce(v_f.day_freeze = 1 or (v_f.day_recharge_at is not null and v_f.day_recharge_at <= now()), true),
    'week_running', v_week_running,
    'week_from', case when v_week_running then v_f.week_from end,
    'danger', case when v_danger.id is null then null
                   else jsonb_build_object('id', v_danger.id, 'day', v_danger.day, 'until', v_danger.until) end,
    'gift_given_at', v_gift.given_at
  );
end $$;

-- the cron backstop: everyone with social state, plus anyone a pending gift waits on
create or replace function public.social_settle_all() returns integer
language plpgsql security definer set search_path = public as $$
declare
  r record;
  n integer := 0;
begin
  for r in select user_id from freeze_state union select to_user from freeze_gifts where status = 'pending' loop
    perform social_settle(r.user_id);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ======================================================================================
-- What the app reads: one call, only what the caller may see
-- ======================================================================================

create or replace function public.social_world() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_people uuid[];
  r record;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  perform social_settle(v_me);
  -- friends are settled too, so their danger and freeze status are current
  select coalesce(array_agg(case when user_a = v_me then user_b else user_a end), '{}') into v_people
    from friendships where v_me in (user_a, user_b);
  for r in select unnest(v_people) as id order by 1 loop
    perform social_settle(r.id);
  end loop;

  return jsonb_build_object(
    'today', social_today(),
    'me', (
      select jsonb_build_object('id', p.user_id, 'name', p.first_name, 'phone', '+' || ltrim(u.phone, '+'), 'discoverable', p.discoverable,
                                'invite_code', p.invite_code, 'invited_by', p.invited_by, 'created_at', u.created_at)
      from profiles p join auth.users u on u.id = p.user_id where p.user_id = v_me),
    'freeze', (
      select jsonb_build_object('day_freeze', f.day_freeze, 'day_recharge_at', f.day_recharge_at, 'week_freeze', f.week_freeze,
                                'week_milestone', f.week_milestone, 'week_from', f.week_from, 'settled_through', f.settled_through,
                                'frozen', coalesce((select jsonb_agg(jsonb_build_object('day', z.day, 'by', z.by) order by z.day)
                                                    from frozen_days z where z.user_id = v_me), '[]'))
      from freeze_state f where f.user_id = v_me),
    'status', social_status(v_me),
    -- friends: name and status. People with a pending request either way: name only.
    'people', coalesce((
      select jsonb_agg(x) from (
        select jsonb_build_object('id', p.user_id, 'name', p.first_name, 'friend', true,
                                  'since', fs.since, 'status', social_status(p.user_id)) as x
        from friendships fs join profiles p on p.user_id = case when fs.user_a = v_me then fs.user_b else fs.user_a end
        where v_me in (fs.user_a, fs.user_b)
        union all
        select jsonb_build_object('id', p.user_id, 'name', p.first_name, 'friend', false)
        from profiles p
        where p.user_id in (select from_user from friend_requests where to_user = v_me and status = 'pending'
                            union select to_user from friend_requests where from_user = v_me and status = 'pending')
          and not social_are_friends(v_me, p.user_id)
      ) t), '[]'),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'from', from_user, 'to', to_user, 'status', status, 'at', created_at) order by created_at)
      from friend_requests
      where (to_user = v_me and status = 'pending')
         or (from_user = v_me and (status = 'pending' or created_at >= social_day_start(social_today())))), '[]'),
    'blocks', coalesce((select jsonb_agg(jsonb_build_object('by', blocker, 'who', blocked, 'at', created_at)) from blocks where blocker = v_me), '[]'),
    'dangers', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'day', day, 'until', until, 'status', status) order by day)
                         from dangers where user_id = v_me and day > social_today() - 60), '[]'),
    -- open asks: mine, and the ones sent to me (then only me in the list, not who else was asked)
    'asks', coalesce((
      select jsonb_agg(jsonb_build_object('id', a.id, 'from', a.from_user,
                                          'to', case when a.from_user = v_me then to_jsonb(a.to_users) else jsonb_build_array(v_me) end,
                                          'day', a.day, 'at', a.created_at, 'status', a.status))
      from freeze_asks a
      where a.status = 'open' and (a.from_user = v_me or (v_me = any (a.to_users) and social_are_friends(v_me, a.from_user)))), '[]'),
    -- gifts between me and someone: both of us see them (the "saves given / received" tally)
    'gifts', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'from', from_user, 'to', to_user, 'day', day, 'given_at', given_at,
                                          'status', status, 'resolved_at', resolved_at) order by given_at)
      from freeze_gifts where v_me in (from_user, to_user)), '[]'),
    -- cheers: what I sent today (the 3-a-day limit) and what I got this week
    'cheers', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'from', from_user, 'to', to_user, 'kind', kind, 'at', created_at) order by created_at)
      from cheers
      where (from_user = v_me and created_at >= social_day_start(social_today()))
         or (to_user = v_me and created_at > now() - interval '7 days')), '[]'),
    'notices', coalesce((
      select jsonb_agg(jsonb_build_object('id', n.id, 'kind', n.kind, 'actor', n.actor, 'actor_name', p.first_name, 'detail', n.detail,
                                          'read', n.read, 'at', n.created_at)
                       order by n.created_at)
      from (select * from social_notices where to_user = v_me order by created_at desc limit 30) n
      left join profiles p on p.user_id = n.actor), '[]')
  );
end $$;

-- ======================================================================================
-- Friends
-- ======================================================================================

-- Only phone numbers come in, only discoverable people who haven't blocked you (nor you them) come
-- out, with their first name. Nothing is stored: no table keeps the numbers.
create or replace function public.social_match_contacts(p_phones text[])
returns table (id uuid, name text)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if cardinality(p_phones) > 2000 then raise exception 'kip:too-many-numbers'; end if;
  return query
    select p.user_id, p.first_name
    from auth.users u join profiles p on p.user_id = u.id
    where u.phone in (select ltrim(x, '+') from unnest(p_phones) x where x ~ '^\+[0-9]{8,15}$')
      and p.discoverable and u.id <> v_me and not social_is_blocked(v_me, u.id);
end $$;

create or replace function public.social_send_request(p_to uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_theirs uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if p_to = v_me then raise exception 'kip:self'; end if;
  if not exists (select 1 from profiles where user_id = p_to) then raise exception 'kip:gone'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kip-social-req:' || v_me::text, 0));
  if social_is_blocked(v_me, p_to) then raise exception 'kip:blocked'; end if;
  if social_are_friends(v_me, p_to) then raise exception 'kip:already-friends'; end if;
  if exists (select 1 from friend_requests where from_user = v_me and to_user = p_to and status = 'pending') then
    raise exception 'kip:already-requested';
  end if;
  -- they already asked: both said yes, friends straight away (and no new request is counted)
  select id into v_theirs from friend_requests where from_user = p_to and to_user = v_me and status = 'pending';
  if v_theirs is not null then
    update friend_requests set status = 'accepted', responded_at = now() where id = v_theirs;
    insert into friendships (user_a, user_b) values (least(v_me, p_to), greatest(v_me, p_to)) on conflict do nothing;
    perform social_notify(p_to, 'accepted', v_me);
    return 'friends';
  end if;
  -- anti-spam only: requests sent today. It never caps how many friends someone has.
  if (select count(*) from friend_requests where from_user = v_me and created_at >= social_day_start(social_today())) >= 50 then
    raise exception 'kip:daily-limit';
  end if;
  insert into friend_requests (from_user, to_user) values (v_me, p_to);
  perform social_notify(p_to, 'request', v_me);
  return 'requested';
end $$;

create or replace function public.social_respond_request(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  r friend_requests;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  select * into r from friend_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then raise exception 'kip:gone'; end if;
  if r.to_user <> v_me then raise exception 'kip:not-yours'; end if;
  if not p_accept then
    update friend_requests set status = 'declined', responded_at = now() where id = p_id;
    return;
  end if;
  if social_is_blocked(r.from_user, r.to_user) then raise exception 'kip:blocked'; end if;
  update friend_requests set status = 'accepted', responded_at = now() where id = p_id;
  insert into friendships (user_a, user_b) values (least(r.from_user, r.to_user), greatest(r.from_user, r.to_user)) on conflict do nothing;
  perform social_notify(r.from_user, 'accepted', v_me);
end $$;

create or replace function public.social_cancel_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  r friend_requests;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  select * into r from friend_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then return; end if;
  if r.from_user <> v_me then raise exception 'kip:not-yours'; end if;
  update friend_requests set status = 'cancelled', responded_at = now() where id = p_id;
end $$;

create or replace function public.social_remove_friend(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  delete from friendships where user_a = least(v_me, p_other) and user_b = greatest(v_me, p_other);
end $$;

-- no friendship, no pending requests either way, and neither can find the other again
create or replace function public.social_block(p_other uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if p_other = v_me then return; end if;
  delete from friendships where user_a = least(v_me, p_other) and user_b = greatest(v_me, p_other);
  update friend_requests set status = case when from_user = v_me then 'cancelled' else 'declined' end, responded_at = now()
    where status = 'pending' and ((from_user = v_me and to_user = p_other) or (from_user = p_other and to_user = v_me));
  insert into blocks (blocker, blocked) values (v_me, p_other) on conflict do nothing;
end $$;

create or replace function public.social_set_discoverable(p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'kip:signed-out'; end if;
  update profiles set discoverable = coalesce(p_on, true) where user_id = auth.uid();
end $$;

create or replace function public.social_mark_notices_read() returns void
language plpgsql security definer set search_path = public as $$
begin
  update social_notices set read = true where to_user = auth.uid() and not read;
end $$;

-- ======================================================================================
-- Freezes
-- ======================================================================================

-- the open danger someone is in right now (still inside its 24 hours, or a friend's freeze waiting)
create or replace function public.social_active_danger(p_user uuid) returns dangers
language sql stable set search_path = public as $$
  select x.* from dangers x
  where x.user_id = p_user and x.status = 'open'
    and (now() < x.until or exists (select 1 from freeze_gifts g where g.to_user = p_user and g.day = x.day
                                    and g.status = 'pending' and now() <= g.given_at + interval '24 hours'))
  order by x.day desc limit 1
$$;

create or replace function public.social_ask_freeze(p_to uuid[]) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_danger dangers;
  v_people uuid[];
  v_id uuid;
  p uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  perform social_settle(v_me);
  v_danger := social_active_danger(v_me);
  if v_danger.id is null then raise exception 'kip:not-in-danger'; end if;
  select coalesce(array_agg(distinct x), '{}') into v_people from unnest(p_to) x where x <> v_me and social_are_friends(v_me, x);
  if cardinality(v_people) = 0 then raise exception 'kip:nobody'; end if;
  update freeze_asks set status = 'closed' where from_user = v_me and day = v_danger.day and status = 'open';
  insert into freeze_asks (from_user, to_users, day) values (v_me, v_people, v_danger.day) returning id into v_id;
  foreach p in array v_people loop
    perform social_notify(p, 'ask', v_me);
  end loop;
  return v_id;
end $$;

-- The giver's own 1-day Freeze goes (its 7-day recharge starts now) and waits for the rescued one.
create or replace function public.social_give_freeze(p_to uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_danger dangers;
  v_f freeze_state;
  v_gift freeze_gifts;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if p_to = v_me then raise exception 'kip:self'; end if;
  if not social_are_friends(v_me, p_to) then raise exception 'kip:not-connected'; end if;
  perform social_settle(v_me);
  perform social_settle(p_to);
  select * into v_f from freeze_state where user_id = v_me for update;
  if v_f.day_freeze <> 1 then raise exception 'kip:no-freeze'; end if;
  v_danger := social_active_danger(p_to);
  if v_danger.id is null then raise exception 'kip:not-in-danger'; end if;
  if exists (select 1 from freeze_gifts where to_user = p_to and day = v_danger.day and status = 'pending') then
    raise exception 'kip:already-helped';
  end if;
  -- at most 2 in 30 days (a pending one counts until it goes back)
  if (select count(*) from freeze_gifts where to_user = p_to and status <> 'returned' and given_at > now() - interval '30 days') >= 2 then
    raise exception 'kip:rescue-limit';
  end if;
  update freeze_state set day_freeze = 0, day_recharge_at = now() + interval '7 days', updated_at = now() where user_id = v_me;
  insert into freeze_gifts (from_user, to_user, day) values (v_me, p_to, v_danger.day) returning * into v_gift;
  update freeze_asks set status = 'closed' where from_user = p_to and day = v_danger.day and status = 'open';
  perform social_notify(p_to, 'gift', v_me);
  return jsonb_build_object('id', v_gift.id, 'from', v_gift.from_user, 'to', v_gift.to_user, 'day', v_gift.day,
                            'given_at', v_gift.given_at, 'status', v_gift.status);
end $$;

create or replace function public.social_cheer(p_to uuid, p_kind text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if p_to = v_me then raise exception 'kip:self'; end if;
  if p_kind not in ('bravo', 'poti', 'aici') then raise exception 'kip:cheer-kind'; end if;
  if not social_are_friends(v_me, p_to) then raise exception 'kip:not-connected'; end if;
  perform pg_advisory_xact_lock(hashtextextended('kip-social-cheer:' || v_me::text, 0));
  if (select count(*) from cheers where from_user = v_me and to_user = p_to and created_at >= social_day_start(social_today())) >= 3 then
    raise exception 'kip:cheers';
  end if;
  insert into cheers (from_user, to_user, kind) values (v_me, p_to, p_kind);
  perform social_notify(p_to, 'cheer', v_me, p_kind);
end $$;

-- ======================================================================================
-- Invite links
-- ======================================================================================

-- Joining through a link: you start with your 1-day Freeze, and the inviter's recharges right away
-- (or they get one if they had none). The inviter's friend request waits for you to accept.
create or replace function public.social_redeem_invite(p_code text) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_inviter uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  select user_id into v_inviter from profiles where invite_code = upper(trim(p_code));
  if v_inviter is null or v_inviter = v_me then return false; end if;
  -- once, and only for a new account (a day old at most)
  if (select invited_by from profiles where user_id = v_me) is not null then return false; end if;
  if (select created_at from auth.users where id = v_me) < now() - interval '24 hours' then return false; end if;
  if social_is_blocked(v_me, v_inviter) then return false; end if;
  update profiles set invited_by = v_inviter where user_id = v_me;
  perform social_settle(v_me);
  perform social_settle(v_inviter);
  update freeze_state set day_freeze = 1, day_recharge_at = null, updated_at = now() where user_id in (v_me, v_inviter);
  if not social_are_friends(v_me, v_inviter)
     and not exists (select 1 from friend_requests where status = 'pending' and from_user in (v_me, v_inviter) and to_user in (v_me, v_inviter)) then
    insert into friend_requests (from_user, to_user) values (v_inviter, v_me);
  end if;
  perform social_notify(v_inviter, 'invite_joined', v_me);
  perform social_notify(v_me, 'invited', v_inviter);
  return true;
end $$;

-- ======================================================================================
-- Sandbox only: the six test accounts (docs/test-accounts.md)
-- ======================================================================================

create or replace function public.social_is_test_phone(p_phone text) returns boolean
language sql immutable set search_path = public as $$
  select ltrim(coalesce(p_phone, ''), '+') in ('40700000100', '40700000101', '40700000102', '40700000103', '40700000104', '40700000105')
$$;

-- "Save today" without Stripe, for a test account only: one confirmed deposit marked as a seed row.
-- Any other account gets kip:not-sandbox.
create or replace function public.social_sandbox_save_today(p_amount_bani integer default 1500) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_goal uuid;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if not social_is_test_phone((select phone from auth.users where id = v_me)) then raise exception 'kip:not-sandbox'; end if;
  if p_amount_bani is null or p_amount_bani not between 100 and 100000 then raise exception 'kip:amount'; end if;
  select id into v_goal from goals where user_id = v_me and is_primary and status = 'active';
  insert into ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, entry_date, note)
    values (v_me, v_goal, case when v_goal is null then 'de_pus_deoparte' else 'goal' end, 'extra_deposit', p_amount_bani,
            'confirmed', social_today(), 'seed:kip-social sandbox save (no Stripe)');
  perform social_settle(v_me);
end $$;

-- Puts the six test accounts back to the demo story's starting state (service role only; run it
-- with execute_sql or `select public.social_demo_reset();` in the SQL editor):
--   Alex   friends with Mihai and Ioana, a pending request from Ana, has his 1-day Freeze
--   Ana    missed yesterday, no 1-day Freeze (used 3 days ago), in danger, asked Mihai and Ioana
--   Mihai  has his 1-day Freeze, saved today
--   Ioana, Radu, Elena  runs of their own; everyone is findable by number
-- Only rows marked 'seed:kip-social' in the ledger are touched, and only these six people's.
create or replace function public.social_demo_reset() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := social_today();
  v_ids uuid[];
  alex uuid; ana uuid; mihai uuid; ioana uuid; radu uuid; elena uuid;
  r record;
  d date;
  v_goal uuid;
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

  -- wipe their social state and their seed savings
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
  delete from ledger_entries where user_id = any (v_ids) and note like 'seed:kip-social%';

  update profiles set discoverable = true, invited_by = null where user_id = any (v_ids);
  update profiles set first_name = x.name from (values (alex, 'Alex'), (ana, 'Ana'), (mihai, 'Mihai'), (ioana, 'Ioana'), (radu, 'Radu'), (elena, 'Elena')) x(id, name)
    where profiles.user_id = x.id and coalesce(profiles.first_name, '') = '';

  -- saving history: (who, first day back, last day back) as offsets from today; one deposit a day
  for r in select * from (values
      (alex, 9, 1),    -- 9 days through yesterday, not yet today: he can save during the demo
      (ana, 15, 2),    -- 14 days, then missed yesterday
      (mihai, 21, 0),  -- 22 days through today
      (ioana, 30, 1),  -- 30 days through yesterday
      (radu, 6, 0),    -- 7 days through today
      (elena, 52, 0)   -- 53 days through today (past 45: she has a 1-week Freeze)
    ) s(who, back_from, back_to) loop
    select id into v_goal from goals where user_id = r.who and is_primary and status = 'active';
    d := v_today - r.back_from;
    while d <= v_today - r.back_to loop
      insert into ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, entry_date, note, created_at)
        values (r.who, v_goal, case when v_goal is null then 'de_pus_deoparte' else 'goal' end, 'extra_deposit',
                1000 + (abs(hashtext(r.who::text || d::text)) % 16) * 100, 'confirmed', d, 'seed:kip-social',
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

  return jsonb_build_object('today', v_today, 'alex', alex, 'ana', ana, 'mihai', mihai, 'ioana', ioana, 'radu', radu, 'elena', elena);
end $$;

-- ======================================================================================
-- Grants: the app's calls for signed-in users; the helpers and the seed for the server only
-- ======================================================================================

revoke all on function public.social_today(), public.social_day_start(date), public.social_are_friends(uuid, uuid),
  public.social_is_blocked(uuid, uuid), public.social_saved_days(uuid), public.social_frozen_days(uuid),
  public.social_run_through(date[], date[], date), public.social_streak_of(date[], date[], date, date),
  public.social_notify(uuid, text, uuid, text), public.social_settle(uuid), public.social_status(uuid), public.social_settle_all(),
  public.social_active_danger(uuid), public.social_is_test_phone(text), public.social_demo_reset(),
  public.social_world(), public.social_match_contacts(text[]), public.social_send_request(uuid),
  public.social_respond_request(uuid, boolean), public.social_cancel_request(uuid), public.social_remove_friend(uuid),
  public.social_block(uuid), public.social_set_discoverable(boolean), public.social_mark_notices_read(),
  public.social_ask_freeze(uuid[]), public.social_give_freeze(uuid), public.social_redeem_invite(text),
  public.social_sandbox_save_today(integer), public.social_cheer(uuid, text)
  from public, anon, authenticated;

grant execute on function public.social_world(), public.social_match_contacts(text[]), public.social_send_request(uuid),
  public.social_respond_request(uuid, boolean), public.social_cancel_request(uuid), public.social_remove_friend(uuid),
  public.social_block(uuid), public.social_set_discoverable(boolean), public.social_mark_notices_read(),
  public.social_ask_freeze(uuid[]), public.social_give_freeze(uuid), public.social_redeem_invite(text),
  public.social_sandbox_save_today(integer), public.social_cheer(uuid, text)
  to authenticated;

grant execute on function public.social_settle(uuid), public.social_status(uuid), public.social_settle_all(),
  public.social_demo_reset() to service_role;

-- the end-of-day backstop, every 10 minutes
select cron.schedule('kip-social-settle', '*/10 * * * *', $$select public.social_settle_all()$$);
