-- Backend pass: Data API grants, URL-safe parent tokens, milestones, allocation locking,
-- withdrawals of own money and the weekly rhythm counter.

-- ---------- Data API grants ----------
-- New tables are not auto-exposed any more (config.toml: auto_expose_new_tables unset), so without
-- these grants PostgREST answers "permission denied" even for the service role. RLS still decides
-- which rows a signed-in user sees.
grant usage on schema public to anon, authenticated, service_role;
grant select on public.profiles, public.goals, public.ledger_entries, public.balances,
  public.parent_links, public.weekly_progress, public.app_events to authenticated;
grant insert, update, delete on public.goals to authenticated;
grant insert on public.ledger_entries to authenticated;
-- column-level update grants for profiles, parent_links and app_events are in 0001
grant all on all tables in schema public to service_role;

-- A student may only revoke a parent link from the app; activating one needs the parent's card.
drop policy if exists "revoke own parent links" on public.parent_links;
create policy "revoke own parent links" on public.parent_links for update
  using (student_user_id = (select auth.uid()))
  with check (student_user_id = (select auth.uid()) and status = 'revoked');

-- The token goes into a URL (/p/<token>): base64's '+' and '/' would break it.
alter table public.parent_links
  alter column token set default translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_');

-- ---------- milestones (the house being built) ----------
-- Emits milestone_reached once per goal and stage when the primary goal crosses a threshold.
create or replace function public.check_milestones(p_user uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_goal record;
  v_total bigint;
  v_pct numeric;
  s record;
  n integer := 0;
begin
  select id, target_bani into v_goal from goals where user_id = p_user and is_primary;
  if v_goal.id is null then
    return 0;
  end if;
  select coalesce(sum(amount_bani), 0) into v_total
    from ledger_entries where user_id = p_user and goal_id = v_goal.id and bucket = 'goal' and status = 'confirmed';
  v_pct := v_total * 100.0 / v_goal.target_bani;
  for s in
    select * from (values (15, 'fundatie', 'Fundație'), (30, 'pereti', 'Pereți'), (50, 'geamuri', 'Geamuri'),
                          (70, 'acoperis', 'Acoperiș'), (85, 'interior', 'Interior'), (100, 'chei', 'Chei')) as t(pct, stage, label)
    order by pct
  loop
    if v_pct >= s.pct and not exists (
      select 1 from app_events
      where user_id = p_user and type = 'milestone_reached'
        and payload ->> 'goal_id' = v_goal.id::text and payload ->> 'stage' = s.stage
    ) then
      insert into app_events (user_id, type, payload)
        values (p_user, 'milestone_reached', jsonb_build_object('stage', s.stage, 'label', s.label, 'pct', s.pct, 'goal_id', v_goal.id));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------- daily allocation (redefined: per-user lock + milestones) ----------
-- The webhook, the demo fast-forward and the cron can all allocate; the advisory lock makes
-- concurrent calls for the same user run one after the other, so the second sees the first's rows.
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
  perform pg_advisory_xact_lock(hashtext('avansul-money:' || p_user::text));
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
    values (p_user, 'de_pus_deoparte', 'allocation', -v_amount, 'confirmed', v_group, p_date);
  insert into ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, transfer_group, entry_date)
    values (p_user, v_goal, 'goal', 'allocation', v_amount, 'confirmed', v_group, p_date);
  perform check_milestones(p_user);
  return v_amount;
end;
$$;

-- The nightly run also tells Kip (one allocation_done per user per day).
create or replace function public.allocate_daily(p_date date default (now() at time zone 'Europe/Bucharest')::date)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v bigint;
  n integer := 0;
begin
  for r in select user_id from profiles where subscription_status in ('active', 'past_due', 'paused') and not is_demo loop
    v := allocate_for_user(r.user_id, p_date);
    if v > 0 then
      insert into app_events (user_id, type, payload)
        values (r.user_id, 'allocation_done', jsonb_build_object('amount_bani', v, 'date', p_date));
      n := n + 1;
    end if;
  end loop;
  return n;
end;
$$;

-- ---------- withdrawals: own money only ----------
-- Matched money (a parent's contribution) stays in the goal. Takes from de_pus_deoparte first,
-- then the primary goal, then other goals. In the sandbox this is a confirmed ledger entry marked
-- as a simulated payout (see docs/decisions.md). Raises 'insufficient' when asking for too much.
create or replace function public.withdraw_own(p_user uuid, p_amount bigint, p_date date)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_own bigint;
  v_left bigint := p_amount;
  v_take bigint;
  v_group uuid := gen_random_uuid();
  g record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_amount';
  end if;
  perform pg_advisory_xact_lock(hashtext('avansul-money:' || p_user::text));
  select coalesce(sum(amount_bani), 0) into v_own
    from ledger_entries
    where user_id = p_user and status = 'confirmed' and bucket in ('de_pus_deoparte', 'goal') and not is_matched;
  if p_amount > v_own then
    raise exception 'insufficient:%', v_own;
  end if;

  select coalesce(sum(amount_bani), 0) into v_take
    from ledger_entries where user_id = p_user and status = 'confirmed' and bucket = 'de_pus_deoparte';
  v_take := least(greatest(v_take, 0), v_left);
  if v_take > 0 then
    insert into ledger_entries (user_id, bucket, type, amount_bani, status, transfer_group, entry_date, note)
      values (p_user, 'de_pus_deoparte', 'withdrawal', -v_take, 'confirmed', v_group, p_date, 'Retragere (plată simulată în sandbox)');
    v_left := v_left - v_take;
  end if;

  for g in
    select l.goal_id, sum(l.amount_bani) as own
    from ledger_entries l join goals gg on gg.id = l.goal_id
    where l.user_id = p_user and l.status = 'confirmed' and l.bucket = 'goal' and not l.is_matched
    group by l.goal_id, gg.is_primary
    having sum(l.amount_bani) > 0
    order by gg.is_primary desc
  loop
    exit when v_left <= 0;
    v_take := least(g.own, v_left);
    insert into ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, transfer_group, entry_date, note)
      values (p_user, g.goal_id, 'goal', 'withdrawal', -v_take, 'confirmed', v_group, p_date, 'Retragere (plată simulată în sandbox)');
    v_left := v_left - v_take;
  end loop;

  return p_amount - v_left;
end;
$$;

-- ---------- weekly rhythm ----------
-- An extra deposit marks this ISO week as active, and repairs last week if it was missed
-- (only when the student already had money moving before this week).
create or replace function public.bump_week(p_user uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week text := to_char(p_date, 'IYYY-"W"IW');
  v_prev text := to_char(p_date - 7, 'IYYY-"W"IW');
  v_week_start date := date_trunc('week', p_date)::date;
begin
  insert into weekly_progress (user_id, iso_week, extra_deposits_count)
    values (p_user, v_week, 1)
    on conflict (user_id, iso_week) do update set extra_deposits_count = weekly_progress.extra_deposits_count + 1;
  if exists (select 1 from ledger_entries where user_id = p_user and entry_date < v_week_start)
     and not exists (select 1 from weekly_progress where user_id = p_user and iso_week = v_prev
                     and (extra_deposits_count > 0 or checked_in)) then
    insert into weekly_progress (user_id, iso_week, repaired)
      values (p_user, v_prev, true)
      on conflict (user_id, iso_week) do update set repaired = true;
  end if;
end;
$$;

-- Server-only money functions: callable by the Edge Functions (service role), never by the app.
revoke all on function public.check_milestones(uuid) from public, anon, authenticated;
revoke all on function public.allocate_for_user(uuid, date) from public, anon, authenticated;
revoke all on function public.allocate_daily(date) from public, anon, authenticated;
revoke all on function public.withdraw_own(uuid, bigint, date) from public, anon, authenticated;
revoke all on function public.bump_week(uuid, date) from public, anon, authenticated;
grant execute on function public.check_milestones(uuid), public.allocate_for_user(uuid, date),
  public.allocate_daily(date), public.allocate_range(uuid, date, date), public.withdraw_own(uuid, bigint, date),
  public.bump_week(uuid, date), public.matched_this_month(uuid, date),
  public.record_stripe_money(uuid, text, text, uuid, bigint, text, text, text, date, boolean, text)
  to service_role;
