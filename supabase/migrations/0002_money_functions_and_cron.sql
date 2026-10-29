-- Webhook writes go through this one function so a retry, or a failed invoice that is later
-- paid, updates the same ledger row instead of adding a second one.
create or replace function public.record_stripe_money(
  p_user uuid,
  p_type text,
  p_bucket text,
  p_goal uuid,
  p_amount bigint,
  p_status text,
  p_object text,
  p_event text,
  p_date date,
  p_matched boolean default false,
  p_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into ledger_entries (user_id, type, bucket, goal_id, amount_bani, status, stripe_object_id, stripe_event_id, entry_date, is_matched, note)
    values (p_user, p_type, p_bucket, p_goal, p_amount, p_status, p_object, p_event, p_date, p_matched, p_note)
  on conflict (stripe_object_id, type) where stripe_object_id is not null
  do update set
    -- never move a confirmed entry backwards (an old "failed" event arriving late)
    status = case when ledger_entries.status = 'confirmed' then 'confirmed' else excluded.status end,
    amount_bani = case when ledger_entries.status = 'confirmed' then ledger_entries.amount_bani else excluded.amount_bani end,
    stripe_event_id = excluded.stripe_event_id
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.record_stripe_money(uuid, text, text, uuid, bigint, text, text, text, date, boolean, text) from public, anon, authenticated;

-- Matched money this month for a parent link, to respect the cap.
create or replace function public.matched_this_month(p_user uuid, p_month date)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount_bani), 0)::bigint
  from ledger_entries
  where user_id = p_user and type = 'parent_match' and status in ('pending', 'confirmed')
    and date_trunc('month', entry_date) = date_trunc('month', p_month);
$$;
revoke all on function public.matched_this_month(uuid, date) from public, anon, authenticated;

-- 00:05 in Bucharest. pg_cron runs in UTC: 22:05 UTC is 00:05 EET (winter time, from 25 Oct 2026).
-- Summer time would need 21:05; noted in docs/decisions.md.
create extension if not exists pg_cron;
select cron.schedule('avansul-allocate-daily', '5 22 * * *', $$select public.allocate_daily()$$);
