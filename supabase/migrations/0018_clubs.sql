-- Clubs: themed groups a saver joins with their streak (Travel, Erasmus, Tech, First apartment,
-- My car, Emergency fund), each with this month's partner promotions. The clubs and promotions
-- themselves live in the app's config (app/src/lib/clubs/config.ts): our team makes them, a new
-- club is a new config entry plus its slug in clubs_slugs() below. The server owns who is in which
-- club, the slots, the pause and comeback, and the codes handed out.
--
-- 1. ONE streak definition for the whole app. A day counts only when that day's confirmed deposits
--    reach the saver's daily amount (profiles.daily_amount_bani, at least 1 leu). A bigger deposit is
--    still one day; withdrawals don't matter; frozen days neither break nor grow the run (that part
--    is social_streak_of from 0016, unchanged). social_saved_days is the one place the rule lives, so
--    friends, freezes and clubs all read the same number.
--    Known limit: the threshold is today's daily amount, so raising it re-judges past days.
--
-- 2. Slots from the current streak: 1 at sign-up, 2 at 14 days, 3 at 30, 4 at 60, 5 at 90, 6 at 150
--    (config.ts SLOT_THRESHOLDS, mirrored here).
--
-- 3. The pause, applied lazily by clubs_settle() each time a clubs call runs (mirrors rules.ts
--    settleClubs):
--      - the streak broke (it is lower than the last time we looked): the clubs above the new slot
--        count pause for 30 days, the oldest ones stay active. Claims and codes are all kept.
--      - 14 days in a row reached inside those 30 days: every paused club is active again.
--      - the 30 days ran out: paused clubs are lost; they can be rejoined once a slot is free.
--    The old streak number is never restored; only the clubs come back.
--
-- Privacy: nobody reads another person's memberships. The app gets aggregate counts per club and,
-- for its own friends only, how many are in each club and their first names.

-- ======================================================================================
-- The one streak rule
-- ======================================================================================

create or replace function public.social_saved_days(p_user uuid) returns date[]
language sql stable set search_path = public as $$
  select coalesce(array_agg(d.entry_date), '{}') from (
    select l.entry_date
    from ledger_entries l
    where l.user_id = p_user and l.status = 'confirmed' and l.amount_bani > 0
      and l.type in ('topup', 'extra_deposit', 'parent_match')
      and l.entry_date > social_today() - 400
    group by l.entry_date
    having sum(l.amount_bani) >= (select greatest(coalesce(max(p.daily_amount_bani), 0), 100) from profiles p where p.user_id = p_user)
  ) d
$$;

-- ======================================================================================
-- Tables
-- ======================================================================================

create table public.club_memberships (
  user_id uuid not null references auth.users (id) on delete cascade,
  club_slug text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'lost')),
  joined_at timestamptz not null default now(),
  paused_at date,
  comeback_until date,
  primary key (user_id, club_slug)
);
create index club_memberships_active_idx on public.club_memberships (club_slug) where status = 'active';

-- what clubs_settle last saw, so it can tell a broken streak from a quiet day
create table public.club_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  last_streak integer not null default 0,
  comeback_won_on date,
  updated_at timestamptz not null default now()
);

create table public.promo_claims (
  user_id uuid not null references auth.users (id) on delete cascade,
  promo_id text not null,
  club_slug text not null,
  code text not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, promo_id)
);
create index promo_claims_promo_idx on public.promo_claims (promo_id);

alter table public.club_memberships enable row level security;
alter table public.club_users enable row level security;
alter table public.promo_claims enable row level security;
create policy "own memberships" on public.club_memberships for select using (user_id = (select auth.uid()));
create policy "own club state" on public.club_users for select using (user_id = (select auth.uid()));
create policy "own claims" on public.promo_claims for select using (user_id = (select auth.uid()));
-- no direct reads or writes from the app: everything goes through the functions below
revoke all on table public.club_memberships, public.club_users, public.promo_claims from public, anon, authenticated;

-- ======================================================================================
-- Helpers (server only)
-- ======================================================================================

-- config.ts CLUBS: a new club is a new slug here and a new entry there
create or replace function public.clubs_slugs() returns text[]
language sql immutable set search_path = public as $$
  select array['travel', 'erasmus', 'tech', 'first-apartment', 'my-car', 'emergency-fund']
$$;

-- config.ts SLOT_THRESHOLDS: the streak at which slot n opens (null past the last one)
create or replace function public.clubs_slot_at(p_n integer) returns integer
language sql immutable set search_path = public as $$
  select case when p_n between 1 and 6 then (array[0, 14, 30, 60, 90, 150])[p_n] end
$$;

create or replace function public.clubs_slots_for(p_streak integer) returns integer
language sql immutable set search_path = public as $$
  select count(*)::integer from unnest(array[0, 14, 30, 60, 90, 150]) t where t <= greatest(coalesce(p_streak, 0), 0)
$$;

-- streak days still needed before n clubs fit: 0 when they already do, null past the last slot
create or replace function public.clubs_days_to_fit(p_streak integer, p_n integer) returns integer
language sql immutable set search_path = public as $$
  select case when p_n < 1 then 0 when p_n > 6 then null else greatest(clubs_slot_at(p_n) - p_streak, 0) end
$$;

-- config.ts codeLimit, for the promotions that have one
create or replace function public.clubs_code_limit(p_template text) returns integer
language sql immutable set search_path = public as $$
  select case p_template when 'skyvane-weekend' then 200 when 'voltbyte-student' then 150 when 'snugrest-mattress' then 100 end
$$;

-- rules.ts settleClubs, on the server: run before every read or write of someone's clubs
create or replace function public.clubs_settle(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_today date := social_today();
  v_status jsonb;
  v_streak integer;
  v_danger boolean;
  v_slots integer;
  v_last integer;
  v_won integer := 0;
begin
  perform social_settle(p_user);
  v_status := social_status(p_user);
  v_streak := coalesce((v_status ->> 'streak')::integer, 0);
  v_danger := coalesce(v_status -> 'danger', 'null'::jsonb) <> 'null'::jsonb;
  v_slots := clubs_slots_for(v_streak);
  select last_streak into v_last from club_users where user_id = p_user for update;

  -- the comeback: 14 days in a row, the 14th reached inside the 30 days, not resting on a missed
  -- day that is still in danger
  if v_streak >= 14 and not v_danger then
    update club_memberships set status = 'active', paused_at = null, comeback_until = null
      where user_id = p_user and status = 'paused' and v_today - (v_streak - 14) <= comeback_until;
    get diagnostics v_won = row_count;
  end if;
  -- the 30 days ran out
  update club_memberships set status = 'lost' where user_id = p_user and status = 'paused' and comeback_until < v_today;
  -- the streak broke: clubs above the new slot count pause (the oldest stay active)
  if v_last is not null and v_streak < v_last then
    update club_memberships m set status = 'paused', paused_at = v_today, comeback_until = v_today + 30
      where m.user_id = p_user and m.status = 'active' and m.club_slug in (
        select club_slug from club_memberships where user_id = p_user and status = 'active'
        order by joined_at, club_slug offset v_slots);
  end if;

  insert into club_users (user_id, last_streak, comeback_won_on) values (p_user, v_streak, case when v_won > 0 then v_today end)
    on conflict (user_id) do update set last_streak = excluded.last_streak, updated_at = now(),
      comeback_won_on = coalesce(excluded.comeback_won_on, club_users.comeback_won_on);
  return jsonb_build_object('streak', v_streak, 'slots', v_slots, 'danger', v_danger);
end $$;

-- ======================================================================================
-- The app's calls
-- ======================================================================================

-- aggregate only: how many people are active in each club
create or replace function public.clubs_member_counts() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(club_slug, n), '{}') from (
    select club_slug, count(*)::integer n from club_memberships where status = 'active' group by club_slug
  ) x
$$;

-- everything the clubs screens need, after settling
create or replace function public.clubs_state() returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_today date := social_today();
  s jsonb;
  v_streak integer;
  v_slots integer;
  v_active integer;
  v_until date;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  s := clubs_settle(v_me);
  v_streak := (s ->> 'streak')::integer;
  v_slots := (s ->> 'slots')::integer;
  select count(*) into v_active from club_memberships where user_id = v_me and status = 'active';
  select min(comeback_until) into v_until from club_memberships where user_id = v_me and status = 'paused';
  return jsonb_build_object(
    'today', v_today,
    'streak', v_streak,
    'slots', v_slots,
    'active', v_active,
    'next_slot', case when v_slots >= 6 then null
                      else jsonb_build_object('at', clubs_slot_at(v_slots + 1), 'days', clubs_slot_at(v_slots + 1) - v_streak) end,
    'free_slot_in', clubs_days_to_fit(v_streak, v_active + 1),
    'in_danger', (s ->> 'danger')::boolean,
    'comeback', case when v_until is null then null
                     else jsonb_build_object('progress', least(v_streak, 14), 'needed', 14, 'until', v_until, 'days_left', v_until - v_today) end,
    'comeback_won_on', (select comeback_won_on from club_users where user_id = v_me),
    'memberships', coalesce((
      select jsonb_agg(jsonb_build_object('slug', club_slug, 'status', status, 'joined_at', joined_at,
                                          'paused_at', paused_at, 'comeback_until', comeback_until) order by joined_at)
      from club_memberships where user_id = v_me), '[]'),
    'claims', coalesce((
      select jsonb_agg(jsonb_build_object('promo_id', promo_id, 'code', code, 'claimed_at', claimed_at) order by claimed_at)
      from promo_claims where user_id = v_me), '[]'),
    'counts', clubs_member_counts(),
    -- my accepted friends who are active in each club: a count and first names, nothing else
    'friends', coalesce((
      select jsonb_object_agg(club_slug, jsonb_build_object('count', n, 'names', names)) from (
        select m.club_slug, count(*)::integer n, jsonb_agg(coalesce(nullif(p.first_name, ''), 'A friend') order by p.first_name) names
        from friendships f
        join club_memberships m on m.status = 'active' and m.user_id = case when f.user_a = v_me then f.user_b else f.user_a end
        left join profiles p on p.user_id = m.user_id
        where v_me in (f.user_a, f.user_b)
        group by m.club_slug) x), '{}')
  );
end $$;

create or replace function public.clubs_join(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  s jsonb;
  v_active integer;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  if p_slug is null or not (p_slug = any (clubs_slugs())) then raise exception 'kip:no-club'; end if;
  s := clubs_settle(v_me);
  perform 1 from club_users where user_id = v_me for update;  -- one join at a time per person
  if exists (select 1 from club_memberships where user_id = v_me and club_slug = p_slug and status = 'active') then
    return clubs_state();
  end if;
  select count(*) into v_active from club_memberships where user_id = v_me and status = 'active';
  if v_active >= (s ->> 'slots')::integer then raise exception 'kip:no-slot'; end if;
  insert into club_memberships (user_id, club_slug) values (v_me, p_slug)
    on conflict (user_id, club_slug) do update set status = 'active', joined_at = now(), paused_at = null, comeback_until = null;
  return clubs_state();
end $$;

create or replace function public.clubs_leave(p_slug text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  delete from club_memberships where user_id = v_me and club_slug = p_slug;
  return clubs_state();
end $$;

-- promo ids are "<club slug>/<promotion>/<YYYY-MM>" (config.ts promoId): this month's only, active
-- members only, one code per person; asking again returns the same code
create or replace function public.clubs_claim(p_promo_id text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_parts text[];
  v_claim promo_claims;
  v_limit integer;
begin
  if v_me is null then raise exception 'kip:signed-out'; end if;
  v_parts := regexp_match(coalesce(p_promo_id, ''), '^([a-z0-9-]{1,40})/([a-z0-9-]{1,60})/([0-9]{4}-[0-9]{2})$');
  if v_parts is null or not (v_parts[1] = any (clubs_slugs())) then raise exception 'kip:no-promo'; end if;
  if v_parts[3] <> to_char(social_today(), 'YYYY-MM') then raise exception 'kip:promo-ended'; end if;
  perform clubs_settle(v_me);
  if not exists (select 1 from club_memberships where user_id = v_me and club_slug = v_parts[1] and status = 'active') then
    raise exception 'kip:not-member';
  end if;
  select * into v_claim from promo_claims where user_id = v_me and promo_id = p_promo_id;
  if found then
    return jsonb_build_object('promo_id', v_claim.promo_id, 'code', v_claim.code, 'claimed_at', v_claim.claimed_at, 'again', true);
  end if;
  v_limit := clubs_code_limit(v_parts[2]);
  if v_limit is not null then
    perform pg_advisory_xact_lock(hashtext(p_promo_id));
    if (select count(*) from promo_claims where promo_id = p_promo_id) >= v_limit then raise exception 'kip:codes-gone'; end if;
  end if;
  -- a simulated partner code: the partner's prefix and six random characters
  insert into promo_claims (user_id, promo_id, club_slug, code)
    values (v_me, p_promo_id, v_parts[1], upper(left(split_part(v_parts[2], '-', 1), 7)) || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 6)))
    on conflict (user_id, promo_id) do nothing
    returning * into v_claim;
  if v_claim.promo_id is null then
    select * into v_claim from promo_claims where user_id = v_me and promo_id = p_promo_id;
  end if;
  return jsonb_build_object('promo_id', v_claim.promo_id, 'code', v_claim.code, 'claimed_at', v_claim.claimed_at, 'again', false);
end $$;

-- ======================================================================================
-- The sandbox save meets the daily amount, so it counts as a streak day
-- ======================================================================================

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
    values (v_me, v_goal, case when v_goal is null then 'de_pus_deoparte' else 'goal' end, 'extra_deposit',
            greatest(p_amount_bani, coalesce((select daily_amount_bani from profiles where user_id = v_me), 0)),
            'confirmed', social_today(), 'seed:kip-social sandbox save (no Stripe)');
  perform social_settle(v_me);
end $$;

-- ======================================================================================
-- The demo reset, now with clubs. Same story as 0016, plus:
--   Alex   27 days through yesterday, active in Erasmus and Travel, 3 days to his 3rd slot
--   Ana    her streak broke 16 days ago: Emergency fund active, Erasmus and Travel paused, comeback
--          13 / 14 (14 if a friend's freeze covers yesterday and she saves today)
--   Mihai  Travel, one free slot (the unlock moment); Ioana  Erasmus and First apartment
--   Radu   My car active, Tech lost (rejoin in 7 days); Elena  53 days, Travel, Tech, Emergency fund
-- Every seeded deposit is at least the person's daily amount, so every seeded day counts.
-- ======================================================================================

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

  return jsonb_build_object('today', v_today, 'alex', alex, 'ana', ana, 'mihai', mihai, 'ioana', ioana, 'radu', radu, 'elena', elena);
end $$;

-- ======================================================================================
-- Grants
-- ======================================================================================

revoke all on function public.clubs_slugs(), public.clubs_slot_at(integer), public.clubs_slots_for(integer),
  public.clubs_days_to_fit(integer, integer), public.clubs_code_limit(text), public.clubs_settle(uuid),
  public.clubs_member_counts(), public.clubs_state(), public.clubs_join(text), public.clubs_leave(text),
  public.clubs_claim(text), public.social_saved_days(uuid), public.social_sandbox_save_today(integer),
  public.social_demo_reset()
  from public, anon, authenticated;

grant execute on function public.clubs_member_counts(), public.clubs_state(), public.clubs_join(text),
  public.clubs_leave(text), public.clubs_claim(text), public.social_sandbox_save_today(integer)
  to authenticated;

grant execute on function public.clubs_settle(uuid), public.social_demo_reset() to service_role;
