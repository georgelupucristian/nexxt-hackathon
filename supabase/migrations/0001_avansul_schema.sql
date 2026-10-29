-- Avansul schema. Money is always integer bani (1 leu = 100 bani). The ledger is the only source
-- of balances: Stripe money enters through webhooks, internal moves through the allocation job,
-- and the rest through explicit user actions. Nothing else writes balances.

create extension if not exists pgcrypto;

-- ---------- profiles ----------
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null default '' check (char_length(first_name) <= 40),
  birth_date date,
  city text,
  daily_amount_bani integer not null default 1500 check (daily_amount_bani between 500 and 5000),
  payday_day smallint not null default 1 check (payday_day between 1 and 28),
  onboarding_state jsonb not null default '{}'::jsonb,
  -- Stripe ids are written only by Edge Functions (service role); see column grants below.
  stripe_customer_id text unique,
  stripe_account_id text unique,
  stripe_subscription_id text unique,
  stripe_test_clock_id text,
  subscription_status text not null default 'none'
    check (subscription_status in ('none', 'incomplete', 'active', 'past_due', 'paused', 'canceled')),
  is_demo boolean not null default false,
  -- the "today" used for allocations; follows the Stripe test clock in demo accounts
  sim_date date,
  created_at timestamptz not null default now()
);

-- ---------- goals ----------
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('avans', 'custom', 'laptop', 'erasmus', 'emergency')),
  is_primary boolean not null default false,
  name text not null check (char_length(name) between 1 and 60),
  target_bani bigint not null check (target_bani > 0),
  target_date date,
  city text,
  neighbourhood text,
  size text check (size in ('garsoniera', '2camere')),
  size_sqm numeric,
  price_per_sqm_eur numeric,
  down_payment_pct numeric check (down_payment_pct > 0 and down_payment_pct <= 100),
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at timestamptz not null default now()
);
create unique index goals_one_primary on public.goals (user_id) where is_primary;

-- ---------- ledger ----------
-- bucket: de_pus_deoparte = arrived in the pot, not yet allocated; goal = allocated to goal_id;
-- outside = recorded by the user as saved elsewhere (never counted as money in the pot).
create table public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  goal_id uuid references public.goals (id) on delete set null,
  bucket text not null check (bucket in ('de_pus_deoparte', 'goal', 'outside')),
  type text not null check (type in ('topup', 'parent_match', 'allocation', 'extra_deposit', 'withdrawal', 'manual_record')),
  amount_bani bigint not null check (amount_bani <> 0),
  status text not null check (status in ('pending', 'confirmed', 'failed')),
  -- matched money stays in the goal; it can't be withdrawn by the student
  is_matched boolean not null default false,
  stripe_object_id text,
  stripe_event_id text,
  transfer_group uuid,
  entry_date date not null default (now() at time zone 'Europe/Bucharest')::date,
  note text check (char_length(note) <= 140),
  created_at timestamptz not null default now(),
  check (bucket <> 'goal' or goal_id is not null)
);
create index ledger_user_idx on public.ledger_entries (user_id, entry_date desc);
-- One allocation per user, day and side: the daily job can run any number of times.
create unique index ledger_allocation_once on public.ledger_entries (user_id, entry_date, bucket) where type = 'allocation';
-- One row per Stripe object and type: webhook retries can't double-count money.
create unique index ledger_stripe_once on public.ledger_entries (stripe_object_id, type) where stripe_object_id is not null;

-- ---------- parent links ----------
create table public.parent_links (
  id uuid primary key default gen_random_uuid(),
  student_user_id uuid not null references auth.users (id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(18), 'base64'),
  parent_name text check (char_length(parent_name) <= 40),
  ratio_num smallint not null default 1 check (ratio_num between 1 and 4),
  ratio_den smallint not null default 1 check (ratio_den between 1 and 4),
  monthly_cap_bani integer not null default 15000 check (monthly_cap_bani between 1000 and 500000),
  stripe_customer_id text,
  payment_method_id text,
  status text not null default 'pending' check (status in ('pending', 'active', 'revoked')),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

-- ---------- weekly rhythm (repairable, never touches money) ----------
create table public.weekly_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  iso_week text not null, -- e.g. 2026-W44
  extra_deposits_count smallint not null default 0,
  checked_in boolean not null default false,
  repaired boolean not null default false,
  comeback_bonus boolean not null default false,
  primary key (user_id, iso_week)
);

-- ---------- Stripe event log (idempotency + the /demo panel) ----------
create table public.stripe_events (
  event_id text primary key,
  type text not null,
  object_id text,
  user_id uuid,
  status text not null default 'processed' check (status in ('processed', 'ignored', 'error')),
  error text,
  livemode boolean not null default false,
  received_at timestamptz not null default now()
);

-- ---------- app events (drive Kip's reactions and notifications) ----------
create table public.app_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  seen boolean not null default false,
  created_at timestamptz not null default now()
);
create index app_events_user_idx on public.app_events (user_id, created_at desc);

-- ---------- balances ----------
-- Confirmed money only. Pending is reported separately and never added to a balance.
create or replace view public.balances with (security_invoker = true) as
select
  p.user_id,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'de_pus_deoparte'), 0)::bigint as de_pus_deoparte_bani,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'goal' and g.is_primary), 0)::bigint as in_avans_bani,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'goal'), 0)::bigint as in_goals_bani,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'goal' and l.is_matched), 0)::bigint as matched_bani,
  coalesce(sum(l.amount_bani) filter (where l.status = 'pending' and l.amount_bani > 0), 0)::bigint as pending_in_bani,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'outside'), 0)::bigint as recorded_outside_bani
from public.profiles p
left join public.ledger_entries l on l.user_id = p.user_id
left join public.goals g on g.id = l.goal_id
group by p.user_id;

-- ---------- daily allocation ----------
-- Moves min(daily amount, what's waiting) from de_pus_deoparte to the primary goal for one day.
-- Idempotent through ledger_allocation_once; an empty bucket does nothing (no penalty, no message).
create or replace function public.allocate_for_user(p_user uuid, p_date date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_daily integer;
  v_goal uuid;
  v_waiting bigint;
  v_amount bigint;
  v_group uuid := gen_random_uuid();
begin
  select daily_amount_bani into v_daily from profiles where user_id = p_user;
  select id into v_goal from goals where user_id = p_user and is_primary and status = 'active';
  if v_daily is null or v_goal is null then
    return 0;
  end if;
  if exists (select 1 from ledger_entries where user_id = p_user and entry_date = p_date and type = 'allocation') then
    return 0;
  end if;
  select coalesce(sum(amount_bani), 0) into v_waiting
    from ledger_entries where user_id = p_user and bucket = 'de_pus_deoparte' and status = 'confirmed';
  v_amount := least(v_daily, v_waiting);
  if v_amount <= 0 then
    return 0;
  end if;
  insert into ledger_entries (user_id, bucket, type, amount_bani, status, transfer_group, entry_date)
    values (p_user, 'de_pus_deoparte', 'allocation', -v_amount, 'confirmed', v_group, p_date)
    on conflict do nothing;
  insert into ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, transfer_group, entry_date)
    values (p_user, v_goal, 'goal', 'allocation', v_amount, 'confirmed', v_group, p_date)
    on conflict do nothing;
  return v_amount;
end;
$$;

-- Runs the day for everyone whose plan is running. Demo accounts follow their own simulated date.
create or replace function public.allocate_daily(p_date date default (now() at time zone 'Europe/Bucharest')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n integer := 0;
begin
  for r in select user_id from profiles where subscription_status in ('active', 'past_due', 'paused') and not is_demo loop
    if allocate_for_user(r.user_id, p_date) > 0 then
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- Catch-up for a range of days (the demo's "Derulează o lună").
create or replace function public.allocate_range(p_user uuid, p_from date, p_to date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  d date := p_from;
  total bigint := 0;
begin
  while d <= p_to loop
    total := total + allocate_for_user(p_user, d);
    d := d + 1;
  end loop;
  return total;
end;
$$;

revoke all on function public.allocate_for_user(uuid, date) from public, anon, authenticated;
revoke all on function public.allocate_daily(date) from public, anon, authenticated;
revoke all on function public.allocate_range(uuid, date, date) from public, anon, authenticated;

-- ---------- new users get a profile row ----------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (user_id, first_name)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'first_name', ''))
    on conflict do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.goals enable row level security;
alter table public.ledger_entries enable row level security;
alter table public.parent_links enable row level security;
alter table public.weekly_progress enable row level security;
alter table public.stripe_events enable row level security;
alter table public.app_events enable row level security;

create policy "own profile" on public.profiles for select using (user_id = (select auth.uid()));
create policy "update own profile" on public.profiles for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
-- Users may only change their own plan fields; Stripe ids and demo flags are service-role only.
revoke update on public.profiles from authenticated;
grant update (first_name, birth_date, city, daily_amount_bani, payday_day, onboarding_state) on public.profiles to authenticated;

create policy "own goals" on public.goals for select using (user_id = (select auth.uid()));
create policy "insert own goals" on public.goals for insert with check (user_id = (select auth.uid()));
create policy "update own goals" on public.goals for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "delete own non-primary goals" on public.goals for delete using (user_id = (select auth.uid()) and not is_primary);

create policy "own ledger" on public.ledger_entries for select using (user_id = (select auth.uid()));
-- The only ledger row a user writes directly: "I set money aside elsewhere", never counted in the pot.
create policy "record outside savings" on public.ledger_entries for insert
  with check (user_id = (select auth.uid()) and type = 'manual_record' and bucket = 'outside' and status = 'confirmed' and amount_bani > 0 and not is_matched);

create policy "own parent links" on public.parent_links for select using (student_user_id = (select auth.uid()));
create policy "revoke own parent links" on public.parent_links for update using (student_user_id = (select auth.uid())) with check (student_user_id = (select auth.uid()));
revoke update on public.parent_links from authenticated;
grant update (status, revoked_at) on public.parent_links to authenticated;

create policy "own weeks" on public.weekly_progress for select using (user_id = (select auth.uid()));
create policy "own events" on public.app_events for select using (user_id = (select auth.uid()));
create policy "mark own events seen" on public.app_events for update using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke update on public.app_events from authenticated;
grant update (seen) on public.app_events to authenticated;
-- stripe_events: no policies → no client access at all.

-- Live updates for the money screens (webhook lands → Home updates without a refresh).
alter publication supabase_realtime add table public.ledger_entries, public.app_events, public.profiles;
