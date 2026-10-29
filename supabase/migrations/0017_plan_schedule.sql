-- The saving schedule the student picks: every week or every month, on which day, how much each
-- time. It is the real Stripe schedule (payments.start and payments.update_schedule set Stripe
-- first, then these columns), so the app reads it and never writes it: there is no update grant
-- for authenticated, unlike daily_amount_bani and payday_day. daily_amount_bani stays as the
-- daily pace the nightly allocation moves into the goal (the deposit spread over its period).
--
-- plan_day: for 'week' 0 = Monday ... 6 = Sunday (the app's convention), for 'month' 1 to 28.
alter table public.profiles
  add column if not exists plan_every text not null default 'month',
  add column if not exists plan_day smallint not null default 1,
  add column if not exists plan_amount_bani integer;

-- existing plans were a daily amount collected monthly on payday
update public.profiles set plan_day = payday_day, plan_amount_bani = daily_amount_bani * 30 where plan_amount_bani is null;

alter table public.profiles
  alter column plan_amount_bani set not null,
  alter column plan_amount_bani set default 45000,
  add constraint profiles_plan_every_check check (plan_every in ('week', 'month')),
  add constraint profiles_plan_day_check check ((plan_every = 'week' and plan_day between 0 and 6) or (plan_every = 'month' and plan_day between 1 and 28)),
  add constraint profiles_plan_amount_check check (plan_amount_bani between 3500 and 150000);
