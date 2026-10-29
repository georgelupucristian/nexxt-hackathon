-- Stripe webhook: claim the event, handle it, then mark it done.
--
-- Until now the webhook wrote stripe_events.status = 'processed' first and handled the event after.
-- If the function died in between (timeout, isolate killed), Stripe's retry looked like a replay
-- and the event was lost. Now a delivery claims the event ('processing'), runs the handler, and
-- only then marks it 'processed' or 'ignored', or 'failed' when the handler threw:
--   - a retry of a processed or ignored event does nothing (the webhook answers 200)
--   - a retry of a failed event is handled again
--   - a claim nobody finished within 10 minutes (longer than an Edge Function may run, so its
--     owner is dead) is taken over by the next retry; a younger one makes the retry wait (409)
-- Two deliveries at once can't both run it: the claim is one INSERT ... ON CONFLICT on the event id,
-- and only the delivery that inserted or took over the row gets claimed = true.
--
-- Everything the handler does has to survive running twice: money rows already do (one row per
-- Stripe object and type), and below bump_week and the app_events Kip shows become once per event.

-- ---------- stripe_events: processing / processed / ignored / failed ----------
alter table public.stripe_events drop constraint if exists stripe_events_status_check;
update public.stripe_events set status = 'failed' where status = 'error';
alter table public.stripe_events
  alter column status set default 'processing',
  -- which attempt holds the claim; finish_stripe_event only accepts the result of that attempt
  add column if not exists attempts integer not null default 1,
  add column if not exists claimed_at timestamptz not null default now(),
  add column if not exists finished_at timestamptz,
  -- set by bump_week, so an extra deposit counts in its week once however often the event runs
  add column if not exists week_bumped boolean not null default false;
alter table public.stripe_events
  add constraint stripe_events_status_check check (status in ('processing', 'processed', 'ignored', 'failed'));
-- rows from before this migration: claimed when received, and already finished
update public.stripe_events set claimed_at = received_at, finished_at = coalesce(finished_at, received_at)
  where status <> 'processing' and finished_at is null;

-- Takes an event for this delivery. claimed = true: run the handler, then finish_stripe_event with
-- this attempt number. claimed = false: event_status says why (done already, or another delivery
-- is on it).
create or replace function public.claim_stripe_event(p_event_id text, p_type text, p_object_id text, p_livemode boolean)
returns table (claimed boolean, event_status text, attempt integer)
language plpgsql
security invoker
set search_path = public
as $$
begin
  return query
    insert into stripe_events as e (event_id, type, object_id, livemode, status, attempts, claimed_at)
      values (p_event_id, p_type, p_object_id, coalesce(p_livemode, false), 'processing', 1, now())
    on conflict (event_id) do update
      set status = 'processing', attempts = e.attempts + 1, claimed_at = now(), finished_at = null, error = null
      where e.status = 'failed'
         or (e.status = 'processing' and e.claimed_at < now() - interval '10 minutes')
    returning true, e.status, e.attempts;
  if not found then
    -- the row exists and isn't ours to take: say what state it is in
    return query select false, e.status, e.attempts from stripe_events e where e.event_id = p_event_id;
  end if;
end;
$$;

-- Records how an attempt ended. Returns false (and changes nothing) when that attempt no longer
-- holds the claim, e.g. a later retry took over a stale one.
create or replace function public.finish_stripe_event(p_event_id text, p_attempt integer, p_status text, p_user uuid default null, p_error text default null)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_status is null or p_status not in ('processed', 'ignored', 'failed') then
    raise exception 'finish_stripe_event: % is not a final status', p_status;
  end if;
  update stripe_events
    set status = p_status, user_id = coalesce(p_user, user_id), error = left(p_error, 500), finished_at = now()
    where event_id = p_event_id and attempts = p_attempt and status = 'processing';
  return found;
end;
$$;

-- ---------- bump_week: once per Stripe event ----------
-- Same rules as in 0003, plus p_event: the event that confirmed the deposit. The first call for an
-- event counts it and flags the event; any later call for the same event (a retried webhook) does
-- nothing. Without p_event it counts every call, as before.
drop function if exists public.bump_week(uuid, date);
create or replace function public.bump_week(p_user uuid, p_date date, p_event text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week text := to_char(p_date, 'IYYY-"W"IW');
  v_prev text := to_char(p_date - 7, 'IYYY-"W"IW');
  v_week_start date := date_trunc('week', p_date)::date;
  v_done boolean;
begin
  if p_event is not null then
    -- the row lock makes a second call for the same event wait for the first, then see its flag
    select week_bumped into v_done from stripe_events where event_id = p_event for update;
    if v_done then
      return;
    end if;
    update stripe_events set week_bumped = true where event_id = p_event;
  end if;
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

-- ---------- app_events: once per Stripe event and type ----------
-- The webhook tags what it tells Kip with the event id; a retried event can't say it twice.
-- Events from elsewhere (milestones, the demo, the nightly job) have no event id and never collide.
alter table public.app_events add column if not exists stripe_event_id text;
create unique index if not exists app_events_stripe_event_once on public.app_events (stripe_event_id, type)
  where stripe_event_id is not null;

-- Server-only, like every money function: the webhook calls them with the service role.
revoke all on function public.claim_stripe_event(text, text, text, boolean) from public, anon, authenticated;
revoke all on function public.finish_stripe_event(text, integer, text, uuid, text) from public, anon, authenticated;
revoke all on function public.bump_week(uuid, date, text) from public, anon, authenticated;
grant execute on function public.claim_stripe_event(text, text, text, boolean),
  public.finish_stripe_event(text, integer, text, uuid, text),
  public.bump_week(uuid, date, text)
  to service_role;
