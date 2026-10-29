-- Database tests for Kip's money backend: row level security, Data API grants, Stripe idempotency,
-- the webhook's event claims, ledger consistency, the phone sign-in helpers and the social layer (0016).
--
-- The whole file is ONE transaction that ends in ROLLBACK, so it is safe on the live project:
-- the two test students, their rows and the results are gone when it finishes. Nothing commits,
-- so Realtime never broadcasts any of it either.
--
-- Run it with supabase/tests/run.sh (psql against the local stack, or DATABASE_URL), or paste the
-- file into the SQL editor or the Supabase MCP execute_sql tool. The last SELECT lists every case
-- as PASS or FAIL, with a summary row first.
--
-- Write cases accept either way of being blocked: a missing grant (42501) or RLS (an error or zero
-- rows). Since 0014 the live project and a fresh database have the same grants (only what the app
-- uses; the 'grants' cases check the exact list), and RLS is still there behind them.
--
-- Acting as someone works the way PostgREST does it for a real request:
--   set local role authenticated;  set local request.jwt.claims = '{"sub": "<user id>", ...}';
-- auth.uid() then returns that id and the RLS policies apply.

begin;

-- ======================================================================================
-- Harness
-- ======================================================================================

create temp table test_results (
  n serial primary key,
  area text not null,
  name text not null,
  pass boolean not null,
  detail text
) on commit drop;
-- cases run as anon / authenticated / service_role and write their own result rows
grant select, insert on test_results to public;
grant usage on sequence test_results_n_seq to public;

-- The two test students. Fixed ids so the cases read clearly; the setup fails loudly if they exist.
create function pg_temp.a() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-00000000000a'::uuid $$;
create function pg_temp.b() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-00000000000b'::uuid $$;

-- check: p_sql returns one row (pass boolean, detail text). An error is a FAIL.
create procedure pg_temp.check(p_area text, p_name text, p_sql text) language plpgsql as $$
declare
  v_pass boolean;
  v_detail text;
begin
  begin
    execute p_sql into v_pass, v_detail;
  exception when others then
    v_pass := false;
    v_detail := 'error ' || sqlstate || ': ' || sqlerrm;
  end;
  insert into test_results (area, name, pass, detail) values (p_area, p_name, coalesce(v_pass, false), v_detail);
end $$;

-- must_fail: p_sql has to be refused with this SQLSTATE (42501 = RLS or missing grant). Any other
-- error, a typo included, is a FAIL, so a broken test can't pass by accident.
create procedure pg_temp.must_fail(p_area text, p_name text, p_sql text, p_state text default '42501', p_message text default null)
language plpgsql as $$
declare
  v_state text;
  v_msg text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate, v_msg = message_text;
  end;
  insert into test_results (area, name, pass, detail) values (
    p_area, p_name,
    v_state is not distinct from p_state and (p_message is null or v_msg like p_message),
    coalesce(v_state || ': ' || v_msg, 'it succeeded'));
end $$;

-- sees_nothing: a SELECT, UPDATE or DELETE that must reach zero rows, or be refused outright (42501).
create procedure pg_temp.sees_nothing(p_area text, p_name text, p_sql text) language plpgsql as $$
declare
  v_rows bigint;
  v_pass boolean;
  v_detail text;
begin
  begin
    execute p_sql;
    get diagnostics v_rows = row_count;
    v_pass := v_rows = 0;
    v_detail := v_rows || ' rows';
  exception when others then
    v_pass := sqlstate = '42501';
    v_detail := sqlstate || ': ' || sqlerrm;
  end;
  insert into test_results (area, name, pass, detail) values (p_area, p_name, v_pass, v_detail);
end $$;

-- ======================================================================================
-- Fixtures (as the migration owner; the trigger gives each new user a profile row)
-- ======================================================================================

insert into auth.users (instance_id, id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', pg_temp.a(), 'authenticated', 'authenticated', 'test-a@kip.invalid',
   '{"provider":"email","providers":["email"]}', '{"first_name":"Ana"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', pg_temp.b(), 'authenticated', 'authenticated', 'test-b@kip.invalid',
   '{"provider":"email","providers":["email"]}', '{"first_name":"Bogdan"}', now(), now());

do $$
declare
  v_goal_a uuid;
  v_goal_b uuid;
begin
  update public.profiles set daily_amount_bani = 1500, payday_day = 1, subscription_status = 'active', stripe_customer_id = 'cus_test_a'
    where user_id = pg_temp.a();
  update public.profiles set daily_amount_bani = 1500, payday_day = 1, subscription_status = 'active', stripe_customer_id = 'cus_test_b'
    where user_id = pg_temp.b();

  insert into public.goals (user_id, kind, is_primary, name, target_bani) values (pg_temp.a(), 'avans', true, 'Garsonieră A', 3000000)
    returning id into v_goal_a;
  insert into public.goals (user_id, kind, is_primary, name, target_bani) values (pg_temp.b(), 'avans', true, 'Garsonieră B', 3000000)
    returning id into v_goal_b;
  insert into public.goals (user_id, kind, is_primary, name, target_bani) values (pg_temp.b(), 'laptop', false, 'Laptop B', 500000);

  -- B: a failed top-up, a paid one, one day allocated, a parent match and an extra deposit still pending
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'failed', 'in_test_b_0', 'evt_test_b_0', '2026-09-01');
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'confirmed', 'in_test_b_1', 'evt_test_b_1', '2026-10-01');
  perform public.allocate_for_user(pg_temp.b(), '2026-10-01');
  perform public.record_stripe_money(pg_temp.b(), 'parent_match', 'goal', v_goal_b, 1500, 'confirmed', 'pi_test_b_match', 'evt_test_b_2', '2026-10-01', true);
  perform public.record_stripe_money(pg_temp.b(), 'extra_deposit', 'de_pus_deoparte', null, 2000, 'pending', 'pi_test_b_extra', null, '2026-10-02');
  insert into public.parent_links (student_user_id, parent_name) values (pg_temp.b(), 'Mama lui B');
  insert into public.weekly_progress (user_id, iso_week, checked_in) values (pg_temp.b(), '2026-W40', true);
  insert into public.app_events (user_id, type, payload) values (pg_temp.b(), 'topup_confirmed', '{"amount_bani":45000}');
  insert into public.stripe_events (event_id, type, object_id, user_id) values ('evt_test_b_1', 'invoice.paid', 'in_test_b_1', pg_temp.b());

  -- A: a paid top-up and one pending parent link of their own
  perform public.record_stripe_money(pg_temp.a(), 'topup', 'de_pus_deoparte', null, 30000, 'confirmed', 'in_test_a_1', 'evt_test_a_1', '2026-10-01');
  perform public.allocate_for_user(pg_temp.a(), '2026-10-01');
  insert into public.parent_links (student_user_id, parent_name) values (pg_temp.a(), 'Tata lui A');
  insert into public.app_events (user_id, type) values (pg_temp.a(), 'topup_confirmed');
end $$;

-- ======================================================================================
-- RLS: student A, signed in, against student B's rows
-- ======================================================================================

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated", "aud": "authenticated"}';

call pg_temp.check('rls', 'signed in as A, auth.uid() is A', $$select auth.uid() = pg_temp.a(), current_user::text || ' ' || auth.uid()$$);
call pg_temp.check('rls', 'A sees their own profile, goal, ledger and balance (RLS is not just denying everything)', $$
  select (select count(*) from public.profiles) = 1 and (select count(*) from public.goals) = 1
     and (select count(*) from public.ledger_entries) = 3 and (select de_pus_deoparte_bani from public.balances) = 28500,
         format('%s profile, %s goal, %s ledger rows, de_pus_deoparte %s',
           (select count(*) from public.profiles), (select count(*) from public.goals),
           (select count(*) from public.ledger_entries), (select de_pus_deoparte_bani from public.balances))$$);

-- reads
call pg_temp.sees_nothing('rls', 'A cannot read B''s profile', $$select * from public.profiles where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read B''s goals', $$select * from public.goals where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read B''s ledger entries', $$select * from public.ledger_entries where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read B''s balance (balances is security_invoker)', $$select * from public.balances where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read B''s parent links (the token is a secret)', $$select * from public.parent_links where student_user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read B''s weekly progress', $$select * from public.weekly_progress where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read B''s app events', $$select * from public.app_events where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot read the Stripe event log at all', $$select * from public.stripe_events$$);

-- profiles
call pg_temp.sees_nothing('rls', 'A cannot update B''s profile', $$update public.profiles set daily_amount_bani = 5000 where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot delete B''s profile', $$delete from public.profiles where user_id = pg_temp.b()$$);
call pg_temp.must_fail('rls', 'A cannot set their own subscription_status (only the webhook does)', $$update public.profiles set subscription_status = 'active' where user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot point their profile at another Stripe customer', $$update public.profiles set stripe_customer_id = 'cus_test_b' where user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot make themselves a demo account or move sim_date', $$update public.profiles set is_demo = true, sim_date = '2030-01-01' where user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot create a profile for B', $$insert into public.profiles (user_id) values (pg_temp.b())$$);
call pg_temp.must_fail('rls', 'A cannot set a payday the 29th to 31st (not every month has one)', $$update public.profiles set payday_day = 31 where user_id = pg_temp.a()$$, '23514');
call pg_temp.must_fail('rls', 'A cannot set a daily amount above 50 lei', $$update public.profiles set daily_amount_bani = 5001 where user_id = pg_temp.a()$$, '23514');

-- goals
call pg_temp.must_fail('rls', 'A cannot create a goal for B', $$insert into public.goals (user_id, kind, name, target_bani) values (pg_temp.b(), 'custom', 'x', 100)$$);
call pg_temp.sees_nothing('rls', 'A cannot update B''s goal', $$update public.goals set target_bani = 1 where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot delete B''s goal', $$delete from public.goals where user_id = pg_temp.b()$$);
call pg_temp.sees_nothing('rls', 'A cannot delete their primary goal (it holds the plan)', $$delete from public.goals where user_id = pg_temp.a() and is_primary$$);
call pg_temp.must_fail('rls', 'A cannot hand their goal over to B', $$update public.goals set user_id = pg_temp.b() where user_id = pg_temp.a()$$);

-- ledger
call pg_temp.must_fail('rls', 'A cannot write a confirmed top-up into their own pot', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status) values (pg_temp.a(), 'de_pus_deoparte', 'topup', 100000, 'confirmed')$$);
call pg_temp.must_fail('rls', 'A cannot write a pending top-up either', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status) values (pg_temp.a(), 'de_pus_deoparte', 'topup', 100000, 'pending')$$);
call pg_temp.must_fail('rls', 'A cannot fake a parent match into their goal', $$
  insert into public.ledger_entries (user_id, goal_id, bucket, type, amount_bani, status, is_matched)
  select pg_temp.a(), id, 'goal', 'parent_match', 50000, 'confirmed', true from public.goals where user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot mark outside savings as matched money', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, is_matched) values (pg_temp.a(), 'outside', 'manual_record', 1000, 'confirmed', true)$$);
call pg_temp.must_fail('rls', 'A cannot record a negative amount (a withdrawal) themselves', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status) values (pg_temp.a(), 'outside', 'manual_record', -1000, 'confirmed')$$);
call pg_temp.must_fail('rls', 'A cannot write any ledger row for B, not even outside savings', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status) values (pg_temp.b(), 'outside', 'manual_record', 1000, 'confirmed')$$);
call pg_temp.must_fail('rls', 'A cannot write any ledger row, not even savings kept outside Kip (the app never writes the ledger)', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, note)
  values (pg_temp.a(), 'outside', 'manual_record', 10000, 'confirmed', 'CEC')$$);
-- such a row can still exist (written before 0014, or by the backend): it must not count
reset role;
insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, note)
  values (pg_temp.a(), 'outside', 'manual_record', 10000, 'confirmed', 'CEC');
set local role authenticated;
call pg_temp.check('rls', 'savings recorded outside never count as money in the pot', $$
  select de_pus_deoparte_bani = 28500 and in_goals_bani = 1500 and recorded_outside_bani = 10000,
         format('de_pus_deoparte %s, in_goals %s, outside %s', de_pus_deoparte_bani, in_goals_bani, recorded_outside_bani)
  from public.balances$$);
call pg_temp.sees_nothing('rls', 'A cannot edit their own ledger rows', $$update public.ledger_entries set amount_bani = 999999 where user_id = pg_temp.a()$$);
call pg_temp.sees_nothing('rls', 'A cannot delete their own ledger rows', $$delete from public.ledger_entries where user_id = pg_temp.a()$$);

-- parent links
call pg_temp.must_fail('rls', 'A cannot create a parent link directly (the family function does)', $$
  insert into public.parent_links (student_user_id, parent_name) values (pg_temp.a(), 'x')$$);
call pg_temp.must_fail('rls', 'A cannot activate their own parent link (needs the parent''s card)', $$
  update public.parent_links set status = 'active' where student_user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot change the match ratio or cap on their link', $$
  update public.parent_links set monthly_cap_bani = 500000 where student_user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot revoke a parent link directly either (the family function does; the app never touches parent_links)', $$
  update public.parent_links set status = 'revoked', revoked_at = now() where student_user_id = pg_temp.a()$$);
call pg_temp.sees_nothing('rls', 'A cannot delete a parent link (revoking keeps the history)', $$delete from public.parent_links where student_user_id = pg_temp.a()$$);
call pg_temp.sees_nothing('rls', 'A cannot revoke B''s parent link', $$update public.parent_links set status = 'revoked' where student_user_id = pg_temp.b()$$);

-- events and the server-only functions
call pg_temp.sees_nothing('rls', 'A cannot mark B''s app events as seen', $$update public.app_events set seen = true where user_id = pg_temp.b()$$);
call pg_temp.must_fail('rls', 'A cannot post an app event (a fake milestone for Kip)', $$
  insert into public.app_events (user_id, type, payload) values (pg_temp.a(), 'milestone_reached', '{"stage": "chei"}')$$);
call pg_temp.must_fail('rls', 'A cannot give themselves a week (only check_in() and the webhook write weeks)', $$
  insert into public.weekly_progress (user_id, iso_week, checked_in, repaired) values (pg_temp.a(), '2026-W41', true, true)$$);
call pg_temp.must_fail('rls', 'A cannot change what an app event says', $$update public.app_events set payload = '{}' where user_id = pg_temp.a()$$);
call pg_temp.must_fail('rls', 'A cannot log a Stripe event (to make a real one look like a replay)', $$
  insert into public.stripe_events (event_id, type) values ('evt_test_forged', 'invoice.paid')$$);
call pg_temp.must_fail('rls', 'A cannot claim a Stripe event (to hold a real one back)', $$
  select * from public.claim_stripe_event('evt_test_forged', 'invoice.paid', 'in_test_forged', false)$$);
call pg_temp.must_fail('rls', 'A cannot write money through record_stripe_money', $$
  select public.record_stripe_money(pg_temp.a(), 'topup', 'de_pus_deoparte', null, 100000, 'confirmed', 'in_test_forged', 'evt_test_forged', current_date)$$);
call pg_temp.must_fail('rls', 'A cannot withdraw B''s money through withdraw_own', $$select public.withdraw_own(pg_temp.b(), 1000, current_date)$$);
call pg_temp.must_fail('rls', 'A cannot run the daily allocation', $$select public.allocate_for_user(pg_temp.a(), current_date)$$);
do $$
begin
  perform public.check_in();
end $$;
reset role;
call pg_temp.check('rls', 'check_in() as A marks only A''s week', $$
  select (select count(*) from public.weekly_progress where user_id = pg_temp.a() and checked_in) = 1
     and (select count(*) from public.weekly_progress where user_id = pg_temp.b()) = 1,
         format('A weeks %s, B weeks %s', (select count(*) from public.weekly_progress where user_id = pg_temp.a()),
                (select count(*) from public.weekly_progress where user_id = pg_temp.b()))$$);
call pg_temp.check('rls', 'B''s rows are untouched after all of A''s attempts', $$
  select p.daily_amount_bani = 1500 and p.subscription_status = 'active'
     and (select count(*) from public.goals where user_id = pg_temp.b()) = 2
     and (select count(*) from public.ledger_entries where user_id = pg_temp.b()) = 6
     and (select status from public.parent_links where student_user_id = pg_temp.b()) = 'pending'
     and (select not seen from public.app_events where user_id = pg_temp.b()),
         format('daily %s, %s goals, %s ledger rows', p.daily_amount_bani,
                (select count(*) from public.goals where user_id = pg_temp.b()),
                (select count(*) from public.ledger_entries where user_id = pg_temp.b()))
  from public.profiles p where p.user_id = pg_temp.b()$$);
call pg_temp.check('rls', 'only check_in() and the social RPCs are callable by signed-in users, nothing by anon; every money function is server-only', $$
  select count(*) = 0, coalesce(string_agg(format('%s by %s', p.proname, r.rolname), ', '), 'none')
  from pg_proc p
  join pg_namespace ns on ns.oid = p.pronamespace and ns.nspname = 'public'
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where p.prokind = 'f'
    and has_function_privilege(r.rolname, p.oid, 'execute')
    and not (r.rolname = 'authenticated' and p.proname in ('check_in', 'social_world', 'social_match_contacts', 'social_send_request',
      'social_respond_request', 'social_cancel_request', 'social_remove_friend', 'social_block', 'social_set_discoverable',
      'social_mark_notices_read', 'social_ask_freeze', 'social_give_freeze', 'social_cheer', 'social_redeem_invite', 'social_sandbox_save_today'))$$);

-- ======================================================================================
-- RLS: anon (the publishable key, nobody signed in)
-- ======================================================================================

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';

call pg_temp.sees_nothing('anon', 'anon cannot read profiles', $$select * from public.profiles$$);
call pg_temp.sees_nothing('anon', 'anon cannot read goals', $$select * from public.goals$$);
call pg_temp.sees_nothing('anon', 'anon cannot read ledger entries', $$select * from public.ledger_entries$$);
call pg_temp.sees_nothing('anon', 'anon cannot read balances', $$select * from public.balances$$);
call pg_temp.sees_nothing('anon', 'anon cannot read parent links or their tokens', $$select * from public.parent_links$$);
call pg_temp.sees_nothing('anon', 'anon cannot read weekly progress', $$select * from public.weekly_progress$$);
call pg_temp.sees_nothing('anon', 'anon cannot read app events', $$select * from public.app_events$$);
call pg_temp.sees_nothing('anon', 'anon cannot read Stripe events', $$select * from public.stripe_events$$);
call pg_temp.must_fail('anon', 'anon cannot write a ledger row', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status) values (pg_temp.b(), 'outside', 'manual_record', 1000, 'confirmed')$$);
call pg_temp.must_fail('anon', 'anon cannot create a goal', $$insert into public.goals (user_id, kind, name, target_bani) values (pg_temp.b(), 'custom', 'x', 100)$$);
call pg_temp.sees_nothing('anon', 'anon cannot update a profile', $$update public.profiles set first_name = 'x'$$);
call pg_temp.must_fail('anon', 'anon cannot call check_in()', $$select public.check_in()$$);

-- ======================================================================================
-- Grants: exactly what the app uses (0014), the same on the live project and a fresh database
-- ======================================================================================

reset role;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated", "aud": "authenticated"}';

-- every table-level privilege, then every column-level one that isn't also table-level, as "table:PRIVS"
create function pg_temp.privileges_of(p_role text) returns text language sql stable as $$
  select coalesce(string_agg(x, ' ' order by x collate "C"), 'none') from (
    select c.relname || ':' || string_agg(p.priv, ',' order by p.priv collate "C") as x
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p(priv)
    where c.relkind in ('r', 'v', 'm', 'p', 'f') and has_table_privilege(p_role, c.oid, p.priv)
    group by c.relname
    union all
    select c.relname || '.' || a.attname || ':' || string_agg(p.priv, ',' order by p.priv collate "C")
    from pg_attribute a
    join pg_class c on c.oid = a.attrelid
    join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
    cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p(priv)
    where c.relkind in ('r', 'v', 'm', 'p', 'f') and a.attnum > 0 and not a.attisdropped
      and has_column_privilege(p_role, c.oid, a.attnum, p.priv) and not has_table_privilege(p_role, c.oid, p.priv)
    group by c.relname, a.attname
  ) t
$$;

call pg_temp.check('grants', 'anon holds no privilege at all on any table or view', $$
  select pg_temp.privileges_of('anon') = 'none', pg_temp.privileges_of('anon')$$);
call pg_temp.check('grants', 'signed-in users hold exactly what the app uses: read 4 relations and their own social notices, edit 4 plan fields, manage goals', $$
  select pg_temp.privileges_of('authenticated') =
           'balances:SELECT goals:DELETE,INSERT,SELECT,UPDATE ledger_entries:SELECT profiles.daily_amount_bani:UPDATE '
           'profiles.first_name:UPDATE profiles.onboarding_state:UPDATE profiles.payday_day:UPDATE profiles:SELECT social_notices:SELECT',
         pg_temp.privileges_of('authenticated')$$);
call pg_temp.check('grants', 'the ledger and the Stripe event log take no writes from anon or signed-in users', $$
  select not has_table_privilege('anon', 'public.stripe_events', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     and not has_table_privilege('authenticated', 'public.stripe_events', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     and not has_table_privilege('anon', 'public.ledger_entries', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     and not has_table_privilege('authenticated', 'public.ledger_entries', 'INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
         'stripe_events: nothing; ledger_entries: SELECT for signed-in users only'$$);
call pg_temp.check('grants', 'nobody but the service role can TRUNCATE a table, or add triggers or foreign keys to it', $$
  select count(*) = 0, coalesce(string_agg(format('%s %s', r.rolname, c.relname), ', '), 'none')
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
  cross join (values ('anon'), ('authenticated')) r(rolname)
  where c.relkind in ('r', 'v', 'm', 'p', 'f') and has_table_privilege(r.rolname, c.oid, 'TRUNCATE, REFERENCES, TRIGGER')$$);
-- a table a later migration adds (rolled back with everything else)
create table public.zz_test_new_table (id int);
call pg_temp.check('grants', 'a table a later migration adds gives anon and signed-in users nothing until it grants it', $$
  select not has_table_privilege('anon', 'public.zz_test_new_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     and not has_table_privilege('authenticated', 'public.zz_test_new_table', 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
         coalesce((select relacl::text from pg_class where oid = 'public.zz_test_new_table'::regclass), 'default (owner only)')$$);
drop table public.zz_test_new_table;

set local role authenticated;
call pg_temp.check('grants', 'the app''s own writes still work: plan fields, then a goal added, edited and deleted', $$
  with u as (update public.profiles set first_name = 'Ana', daily_amount_bani = 1500, payday_day = 1,
                    onboarding_state = '{"completed": true}' where user_id = pg_temp.a() returning 1),
       g as (insert into public.goals (id, user_id, kind, name, target_bani, target_date, is_primary, status)
             values ('00000000-0000-4000-a000-0000000000a1', pg_temp.a(), 'laptop', 'Laptop A', 400000, '2027-06-01', false, 'active') returning 1)
  select (select count(*) from u) = 1 and (select count(*) from g) = 1, 'profile updated, goal added'$$);
call pg_temp.check('grants', 'the app''s own writes still work: editing that goal', $$
  with e as (update public.goals set name = 'Laptop nou', target_bani = 450000, status = 'paused' where id = '00000000-0000-4000-a000-0000000000a1' returning 1)
  select (select count(*) from e) = 1, format('%s edited', (select count(*) from e))$$);
call pg_temp.check('grants', 'the app''s own writes still work: deleting that goal', $$
  with d as (delete from public.goals where id = '00000000-0000-4000-a000-0000000000a1' returning 1)
  select (select count(*) from d) = 1, format('%s deleted', (select count(*) from d))$$);
call pg_temp.must_fail('grants', 'A cannot change profile fields the app never edits (birth date, city)', $$
  update public.profiles set birth_date = '2000-01-01', city = 'Cluj' where user_id = pg_temp.a()$$);

-- ======================================================================================
-- Idempotency: the webhook runs as the service role
-- ======================================================================================

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';

call pg_temp.must_fail('idempotency', 'the same Stripe event id cannot be logged twice (what makes a claim atomic)', $$
  insert into public.stripe_events (event_id, type, object_id, status) values ('evt_test_b_1', 'invoice.paid', 'in_test_b_1', 'processed')$$, '23505');

do $$
declare
  v1 uuid;
  v2 uuid;
  v_rows bigint;
begin
  v1 := public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'confirmed', 'in_test_replay', 'evt_test_replay', '2026-11-01');
  v2 := public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'confirmed', 'in_test_replay', 'evt_test_replay', '2026-11-01');
  select count(*) into v_rows from public.ledger_entries where stripe_object_id = 'in_test_replay';
  insert into test_results (area, name, pass, detail)
    values ('idempotency', 'the same event delivered twice writes one ledger row', v1 = v2 and v_rows = 1, format('%s row(s), same id: %s', v_rows, v1 = v2));
end $$;

do $$
declare
  v_rows bigint;
begin
  -- one invoice.paid carries a top-up and an extra deposit: two typed rows; delivering it again adds nothing
  for i in 1..2 loop
    perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'confirmed', 'in_test_split', 'evt_test_split', '2026-12-01');
    perform public.record_stripe_money(pg_temp.b(), 'extra_deposit', 'de_pus_deoparte', null, 2000, 'confirmed', 'in_test_split', 'evt_test_split', '2026-12-01');
  end loop;
  select count(*) into v_rows from public.ledger_entries where stripe_object_id = 'in_test_split';
  insert into test_results (area, name, pass, detail)
    values ('idempotency', 'an invoice with a top-up and an extra deposit is two rows, and stays two when replayed', v_rows = 2, v_rows || ' rows');
end $$;

do $$
declare
  r record;
begin
  -- a late "failed" event for an invoice that was already paid
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 99999, 'failed', 'in_test_b_1', 'evt_test_late', '2026-10-01');
  select status, amount_bani into r from public.ledger_entries where stripe_object_id = 'in_test_b_1' and type = 'topup';
  insert into test_results (area, name, pass, detail)
    values ('idempotency', 'a late failed event never moves a confirmed row backwards', r.status = 'confirmed' and r.amount_bani = 45000,
            format('%s, %s bani', r.status, r.amount_bani));
end $$;

do $$
declare
  v_rows bigint;
  v_status text;
begin
  -- the card fails, the student fixes it, Stripe retries the same invoice and it is paid
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'failed', 'in_test_retry', 'evt_test_retry_1', '2026-11-01');
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'failed', 'in_test_retry', 'evt_test_retry_2', '2026-11-01');
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'confirmed', 'in_test_retry', 'evt_test_retry_3', '2026-11-01');
  select count(*), max(status) into v_rows, v_status from public.ledger_entries where stripe_object_id = 'in_test_retry';
  insert into test_results (area, name, pass, detail)
    values ('idempotency', 'failed, retried, then paid: one row that ends confirmed', v_rows = 1 and v_status = 'confirmed', format('%s row(s), %s', v_rows, v_status));
end $$;

call pg_temp.must_fail('idempotency', 'even a direct insert cannot add a second row for the same Stripe object and type', $$
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, stripe_object_id)
  values (pg_temp.b(), 'de_pus_deoparte', 'topup', 45000, 'confirmed', 'in_test_b_1')$$, '23505');

do $$
declare
  v_mine bigint;
  v_rows bigint;
begin
  -- an outside-savings row of A's tagged with a Stripe-looking id (the app could write those before
  -- 0014); a later webhook row for B with that id must neither collide with it nor take it over
  execute 'reset role';
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, stripe_object_id)
    values (pg_temp.a(), 'outside', 'manual_record', 500, 'confirmed', 'in_test_squat');
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', '{"role": "service_role"}', true);
  perform public.record_stripe_money(pg_temp.b(), 'topup', 'de_pus_deoparte', null, 45000, 'confirmed', 'in_test_squat', 'evt_test_squat', '2026-11-01');
  select count(*) filter (where user_id = pg_temp.a() and type = 'manual_record' and amount_bani = 500),
         count(*) filter (where user_id = pg_temp.b() and type = 'topup' and status = 'confirmed')
    into v_mine, v_rows from public.ledger_entries where stripe_object_id = 'in_test_squat';
  insert into test_results (area, name, pass, detail)
    values ('idempotency', 'a ledger row with a Stripe-looking id neither blocks nor is taken over by a webhook row', v_mine = 1 and v_rows = 1,
            format('A''s outside row %s, B''s top-up %s', v_mine, v_rows));
end $$;

-- ======================================================================================
-- Webhook event claims (0013): claim, handle, then finish; still the service role
-- ======================================================================================
-- Two deliveries at the same moment can't be shown in one session; the claim is a single
-- INSERT ... ON CONFLICT on the primary key, so Postgres makes the second one wait for the first
-- and then see its row (the Deno tests cover that ordering with an in-memory log).

call pg_temp.check('webhook', 'the first delivery of an event claims it: attempt 1, processing', $$
  select claimed and event_status = 'processing' and attempt = 1, format('claimed %s, %s, attempt %s', claimed, event_status, attempt)
  from public.claim_stripe_event('evt_test_claim', 'payment_intent.succeeded', 'pi_test_claim', false)$$);
call pg_temp.check('webhook', 'a delivery while that attempt still runs is not claimed (the webhook answers 409, Stripe retries)', $$
  select not claimed and event_status = 'processing', format('claimed %s, %s', claimed, event_status)
  from public.claim_stripe_event('evt_test_claim', 'payment_intent.succeeded', 'pi_test_claim', false)$$);
update public.stripe_events set claimed_at = now() - interval '9 minutes' where event_id = 'evt_test_claim';
call pg_temp.check('webhook', 'a claim 9 minutes old still holds (the attempt may be running)', $$
  select not claimed, format('claimed %s, %s', claimed, event_status)
  from public.claim_stripe_event('evt_test_claim', 'payment_intent.succeeded', 'pi_test_claim', false)$$);
update public.stripe_events set claimed_at = now() - interval '11 minutes' where event_id = 'evt_test_claim';
call pg_temp.check('webhook', 'a claim nobody finished in 10 minutes (the function died) is taken over: attempt 2', $$
  select claimed and attempt = 2, format('claimed %s, attempt %s', claimed, attempt)
  from public.claim_stripe_event('evt_test_claim', 'payment_intent.succeeded', 'pi_test_claim', false)$$);
call pg_temp.check('webhook', 'the attempt that was taken over cannot record its result', $$
  select not public.finish_stripe_event('evt_test_claim', 1, 'processed'), 'attempt 1 refused'$$);
call pg_temp.check('webhook', 'the attempt holding the claim marks it processed, with the student', $$
  select public.finish_stripe_event('evt_test_claim', 2, 'processed', pg_temp.b()), 'attempt 2 accepted'$$);
update public.stripe_events set claimed_at = now() - interval '3 days' where event_id = 'evt_test_claim';
call pg_temp.check('webhook', 'a processed event is never claimed again (a replay is a no-op 200), not even days later', $$
  select not c.claimed and c.event_status = 'processed' and e.user_id = pg_temp.b() and e.finished_at is not null and e.attempts = 2,
         format('claimed %s, %s, attempts %s', c.claimed, c.event_status, e.attempts)
  from public.claim_stripe_event('evt_test_claim', 'payment_intent.succeeded', 'pi_test_claim', false) c
  join public.stripe_events e on e.event_id = 'evt_test_claim'$$);
do $$
declare
  c record;
begin
  -- the handler threw: Stripe's retry gets the event again, right away
  perform public.claim_stripe_event('evt_test_fail', 'invoice.paid', 'in_test_fail', false);
  perform public.finish_stripe_event('evt_test_fail', 1, 'failed', null, 'stripe timeout');
  select * into c from public.claim_stripe_event('evt_test_fail', 'invoice.paid', 'in_test_fail', false);
  insert into test_results (area, name, pass, detail)
    values ('webhook', 'a failed event is claimed again by Stripe''s retry (attempt 2), with the old error cleared',
            c.claimed and c.attempt = 2 and (select error is null from public.stripe_events where event_id = 'evt_test_fail'),
            format('claimed %s, attempt %s', c.claimed, c.attempt));
  -- an event that isn't Kip money stays done
  perform public.claim_stripe_event('evt_test_ignored', 'customer.created', 'cus_x', false);
  perform public.finish_stripe_event('evt_test_ignored', 1, 'ignored');
  update public.stripe_events set claimed_at = now() - interval '1 day' where event_id = 'evt_test_ignored';
  select * into c from public.claim_stripe_event('evt_test_ignored', 'customer.created', 'cus_x', false);
  insert into test_results (area, name, pass, detail)
    values ('webhook', 'an ignored event is never claimed again', not c.claimed and c.event_status = 'ignored', format('claimed %s, %s', c.claimed, c.event_status));
end $$;
call pg_temp.must_fail('webhook', 'finish only takes a final status (processed, ignored or failed)', $$
  select public.finish_stripe_event('evt_test_fail', 2, 'processing')$$, 'P0001');
call pg_temp.must_fail('webhook', 'stripe_events takes only processing, processed, ignored and failed', $$
  update public.stripe_events set status = 'error' where event_id = 'evt_test_fail'$$, '23514');
do $$
declare
  v smallint;
begin
  -- an extra deposit confirmed by evt_test_claim, its handler run twice, and one more by evt_test_fail
  perform public.bump_week(pg_temp.b(), '2026-11-04', 'evt_test_claim');
  perform public.bump_week(pg_temp.b(), '2026-11-04', 'evt_test_claim');
  perform public.bump_week(pg_temp.b(), '2026-11-05', 'evt_test_fail');
  select extra_deposits_count into v from public.weekly_progress where user_id = pg_temp.b() and iso_week = '2026-W45';
  insert into test_results (area, name, pass, detail)
    values ('webhook', 'bump_week counts an extra deposit once per Stripe event, however often the event runs', v = 2, format('%s deposits in 2026-W45', v));
end $$;
insert into public.app_events (user_id, type, payload, stripe_event_id)
  values (pg_temp.b(), 'extra_deposit_confirmed', '{"amount_bani": 2500}', 'evt_test_claim');
call pg_temp.must_fail('webhook', 'Kip hears about a Stripe event once per type: a retry cannot add the same app event', $$
  insert into public.app_events (user_id, type, payload, stripe_event_id)
  values (pg_temp.b(), 'extra_deposit_confirmed', '{"amount_bani": 2500}', 'evt_test_claim')$$, '23505');
call pg_temp.check('webhook', 'the same event can still say different things, and events without an event id never collide', $$
  with i as (insert into public.app_events (user_id, type, payload, stripe_event_id) values
               (pg_temp.b(), 'allocation_done', '{}', 'evt_test_claim'),
               (pg_temp.b(), 'milestone_reached', '{}', null),
               (pg_temp.b(), 'milestone_reached', '{}', null) returning 1)
  select count(*) = 3, count(*) || ' rows' from i$$);

-- ======================================================================================
-- Ledger consistency (as the owner, over every user in the database, real ones included)
-- ======================================================================================

reset role;
reset request.jwt.claims;

-- the same sums the balances view should give, computed straight from the ledger
create temp view ledger_sums as
select p.user_id,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'de_pus_deoparte'), 0) as de_pus_deoparte,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'goal'), 0) as in_goals,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'goal' and g.is_primary), 0) as in_avans,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'goal' and l.is_matched), 0) as matched,
  coalesce(sum(l.amount_bani) filter (where l.status = 'pending' and l.amount_bani > 0), 0) as pending_in,
  coalesce(sum(l.amount_bani) filter (where l.status = 'confirmed' and l.bucket = 'outside'), 0) as outside
from public.profiles p
left join public.ledger_entries l on l.user_id = p.user_id
left join public.goals g on g.id = l.goal_id
group by p.user_id;

call pg_temp.check('ledger', 'for every user, the balances view equals the sum of confirmed ledger entries', $$
  select count(*) filter (where b.user_id is null or (b.de_pus_deoparte_bani, b.in_goals_bani, b.in_avans_bani, b.matched_bani, b.pending_in_bani, b.recorded_outside_bani)
                                 is distinct from (s.de_pus_deoparte, s.in_goals, s.in_avans, s.matched, s.pending_in, s.outside)) = 0,
         format('%s users checked, %s mismatches', count(*),
                count(*) filter (where b.user_id is null or (b.de_pus_deoparte_bani, b.in_goals_bani, b.in_avans_bani, b.matched_bani, b.pending_in_bani, b.recorded_outside_bani)
                                 is distinct from (s.de_pus_deoparte, s.in_goals, s.in_avans, s.matched, s.pending_in, s.outside)))
  from ledger_sums s left join public.balances b using (user_id)$$);
call pg_temp.check('ledger', 'pending and failed money is never in a balance', $$
  select de_pus_deoparte_bani = 45000 * 5 + 2000 - 1500 and pending_in_bani = 2000,
         format('de_pus_deoparte %s, pending %s', de_pus_deoparte_bani, pending_in_bani)
  from public.balances where user_id = pg_temp.b()$$);
call pg_temp.check('ledger', 'every allocation is a pair that sums to zero (money moves, never appears)', $$
  select count(*) = 0, count(*) || ' unbalanced allocation groups'
  from (select transfer_group from public.ledger_entries where type = 'allocation'
        group by transfer_group having sum(amount_bani) <> 0 or count(*) <> 2) x$$);
call pg_temp.check('ledger', 'no user has a negative bucket or goal', $$
  select count(*) = 0, coalesce(string_agg(format('%s %s %s', user_id, bucket, total), ', '), 'none')
  from (select user_id, bucket, coalesce(goal_id::text, '') as goal, sum(amount_bani) as total
        from public.ledger_entries where status = 'confirmed' and bucket <> 'outside'
        group by user_id, bucket, goal_id having sum(amount_bani) < 0) x$$);
call pg_temp.check('ledger', 'goal money always sits in a goal of the same user', $$
  select count(*) = 0, count(*) || ' rows'
  from public.ledger_entries l left join public.goals g on g.id = l.goal_id
  where l.bucket = 'goal' and (g.id is null or g.user_id <> l.user_id)$$);
call pg_temp.check('ledger', 'matched (parent) money only ever sits in a goal', $$
  select count(*) = 0, count(*) || ' rows' from public.ledger_entries where is_matched and bucket <> 'goal'$$);
call pg_temp.check('ledger', 'the daily allocation runs once per user and day', $$
  select public.allocate_for_user(pg_temp.b(), '2026-10-01') = 0
     and (select count(*) from public.ledger_entries where user_id = pg_temp.b() and type = 'allocation' and entry_date = '2026-10-01') = 2,
         'second run moved nothing'$$);

-- withdrawals: B now has 227,000 bani of own money (5 paid top-ups + 1 extra deposit) and 1,500 matched
call pg_temp.must_fail('ledger', 'withdrawing 1 ban more than your own money is refused, and says how much is allowed', $$
  select public.withdraw_own(pg_temp.b(), 227001, '2026-12-02')$$, 'P0001', 'insufficient:227000');
-- (two statements: a query does not see rows that a function it calls inserts)
call pg_temp.check('ledger', 'withdrawing exactly all of your own money is allowed', $$
  select public.withdraw_own(pg_temp.b(), 227000, '2026-12-02') = 227000, 'withdrew 227000'$$);
call pg_temp.check('ledger', 'after it, only the parent''s match is left in the pot', $$
  select de_pus_deoparte_bani = 0 and in_goals_bani = 1500 and matched_bani = 1500,
         format('de_pus_deoparte %s, in_goals %s, matched %s', de_pus_deoparte_bani, in_goals_bani, matched_bani)
  from public.balances where user_id = pg_temp.b()$$);
call pg_temp.must_fail('ledger', 'after that, not even 1 ban more can go out (matched money stays for the home)', $$
  select public.withdraw_own(pg_temp.b(), 1, '2026-12-02')$$, 'P0001', 'insufficient:0');
call pg_temp.check('ledger', 'an empty pot allocates nothing (no negative balance, no penalty)', $$
  select public.allocate_for_user(pg_temp.b(), '2026-12-03') = 0, 'moved 0'$$);
call pg_temp.check('ledger', 'after all of the above the balances view still equals the ledger, for every user', $$
  select count(*) filter (where (b.de_pus_deoparte_bani, b.in_goals_bani, b.in_avans_bani, b.matched_bani, b.pending_in_bani, b.recorded_outside_bani)
                                 is distinct from (s.de_pus_deoparte, s.in_goals, s.in_avans, s.matched, s.pending_in, s.outside)) = 0,
         count(*) || ' users checked'
  from ledger_sums s join public.balances b using (user_id)$$);
call pg_temp.check('ledger', 'the nightly job runs at 22:05 UTC, which is already the new day in Bucharest all year', $$
  select (select schedule from cron.job where jobname = 'avansul-allocate-daily') = '5 22 * * *'
     and (timestamptz '2026-01-15 22:05:00+00' at time zone 'Europe/Bucharest')::date = '2026-01-16'
     and (timestamptz '2026-07-15 22:05:00+00' at time zone 'Europe/Bucharest')::date = '2026-07-16',
         coalesce((select schedule from cron.job where jobname = 'avansul-allocate-daily'), 'job missing')$$);

-- ======================================================================================
-- Phone sign-in (0015): the lookup, the attempt counter and its table are server-only
-- ======================================================================================

reset role;
reset request.jwt.claims;

-- a phone user, as auth.admin.createUser makes one for auth-phone: the phone (stored without the
-- +), the synthetic email, and no first name
create function pg_temp.c() returns uuid language sql immutable as $$ select '00000000-0000-4000-a000-00000000000c'::uuid $$;
insert into auth.users (instance_id, id, aud, role, email, phone, email_confirmed_at, phone_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('00000000-0000-0000-0000-000000000000', pg_temp.c(), 'authenticated', 'authenticated',
        '40700000990@phone.kip.invalid', '40700000990', now(), now(),
        '{"provider":"email","providers":["email","phone"]}', '{"phone":"+40700000990"}', now(), now());

call pg_temp.check('phone', 'a phone user gets a profiles row from the same trigger as an email sign-up', $$
  select count(*) = 1 and min(first_name) = '', count(*) || ' profile row(s)' from public.profiles where user_id = pg_temp.c()$$);
call pg_temp.check('phone', 'only the service role can run the two phone helpers', $$
  select not has_function_privilege('anon', 'public.auth_user_by_phone(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.auth_user_by_phone(text)', 'execute')
     and not has_function_privilege('anon', 'public.phone_login_attempt(text)', 'execute')
     and not has_function_privilege('authenticated', 'public.phone_login_attempt(text)', 'execute')
     and has_function_privilege('service_role', 'public.auth_user_by_phone(text)', 'execute')
     and has_function_privilege('service_role', 'public.phone_login_attempt(text)', 'execute'),
         'execute: service_role only'$$);
call pg_temp.check('phone', 'the attempts table has RLS on, no policies, and nothing for anon or signed-in users', $$
  select c.relrowsecurity
     and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'phone_login_attempts')
     and not has_table_privilege('anon', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER')
     and not has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
         format('rls %s, %s policies', c.relrowsecurity,
                (select count(*) from pg_policies where schemaname = 'public' and tablename = 'phone_login_attempts'))
  from pg_class c where c.oid = 'public.phone_login_attempts'::regclass$$);
call pg_temp.check('phone', 'the lookup is SECURITY DEFINER with an empty search_path; the counter runs as its caller', $$
  select l.prosecdef and l.proconfig = array['search_path=""'] and not a.prosecdef and a.proconfig = array['search_path=""'],
         format('lookup definer %s %s, counter definer %s %s', l.prosecdef, l.proconfig, a.prosecdef, a.proconfig)
  from pg_proc l, pg_proc a
  where l.oid = 'public.auth_user_by_phone(text)'::regprocedure and a.oid = 'public.phone_login_attempt(text)'::regprocedure$$);

set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
call pg_temp.must_fail('phone', 'anon cannot look up who has a phone number', $$select * from public.auth_user_by_phone('+40700000990')$$);
call pg_temp.must_fail('phone', 'anon cannot count (or use up) verify attempts', $$select public.phone_login_attempt('+40700000990')$$);
call pg_temp.must_fail('phone', 'anon cannot read the attempts table', $$select * from public.phone_login_attempts$$);
call pg_temp.must_fail('phone', 'anon cannot write the attempts table', $$insert into public.phone_login_attempts (phone) values ('+40700000990')$$);

set local role authenticated;
set local request.jwt.claims = '{"sub": "00000000-0000-4000-a000-00000000000a", "role": "authenticated", "aud": "authenticated"}';
call pg_temp.must_fail('phone', 'A cannot look up who has a phone number', $$select * from public.auth_user_by_phone('+40700000990')$$);
call pg_temp.must_fail('phone', 'A cannot use up someone else''s verify attempts', $$select public.phone_login_attempt('+40700000990')$$);
call pg_temp.must_fail('phone', 'A cannot read the attempts table', $$select * from public.phone_login_attempts$$);
call pg_temp.must_fail('phone', 'A cannot clear the attempts table to reset a limit', $$delete from public.phone_login_attempts$$);

set local role service_role;
set local request.jwt.claims = '{"role": "service_role"}';
call pg_temp.check('phone', 'the service role finds the user by phone, with or without the +', $$
  select (select user_id from public.auth_user_by_phone('+40700000990')) = pg_temp.c()
     and (select user_id from public.auth_user_by_phone('40700000990')) = pg_temp.c()
     and (select email from public.auth_user_by_phone('+40700000990')) = '40700000990@phone.kip.invalid',
         coalesce((select user_id::text || ' ' || email from public.auth_user_by_phone('+40700000990')), 'not found')$$);
call pg_temp.check('phone', 'an unknown number finds nobody', $$
  select count(*) = 0, count(*) || ' rows' from public.auth_user_by_phone('+40700000991')$$);
do $$
declare
  v_first10 boolean[] := '{}';
  v_11th boolean;
  v_other boolean;
begin
  for i in 1..10 loop
    v_first10 := v_first10 || public.phone_login_attempt('+40700000990');
  end loop;
  v_11th := public.phone_login_attempt('+40700000990');
  v_other := public.phone_login_attempt('+40700000991');
  insert into test_results (area, name, pass, detail)
    values ('phone', '10 verify attempts per number are allowed, the 11th is refused, another number is unaffected',
            v_first10 = array_fill(true, array[10]) and not v_11th and v_other,
            format('first 10 %s, 11th %s, other number %s', v_first10, v_11th, v_other));
  insert into test_results (area, name, pass, detail)
    values ('phone', 'a refused attempt is not counted', (select count(*) from public.phone_login_attempts where phone = '+40700000990') = 10,
            (select count(*) from public.phone_login_attempts where phone = '+40700000990') || ' rows');
end $$;
call pg_temp.must_fail('phone', 'the counter only takes an E.164 number', $$select public.phone_login_attempt('0700000990')$$, 'P0001');
call pg_temp.must_fail('phone', 'the attempts table only stores E.164 numbers', $$insert into public.phone_login_attempts (phone) values ('0700000990')$$, '23514');
-- 11 minutes later (as the owner: the service role can't rewrite attempt times)
reset role;
update public.phone_login_attempts set attempted_at = attempted_at - interval '11 minutes' where phone = '+40700000990';
set local role service_role;
call pg_temp.check('phone', 'after 10 minutes the number may try again, and the old attempts are cleared', $$
  select public.phone_login_attempt('+40700000990'), 'allowed again'$$);
call pg_temp.check('phone', 'after 10 minutes only the new attempt is left', $$
  select count(*) = 1, count(*) || ' row(s)' from public.phone_login_attempts where phone = '+40700000990'$$);

-- ======================================================================================
-- Social (0016): friends, findable by number, the 1-day Freeze, gifts, asks, cheers, invites
-- ======================================================================================

reset role;
create function pg_temp.s(n int) returns uuid language sql immutable as $$ select ('00000000-0000-4000-a000-0000000000c' || n)::uuid $$;
-- the Bucharest day and its midnight, without needing the server-only helpers
create function pg_temp.today() returns date language sql stable as $$ select (now() at time zone 'Europe/Bucharest')::date $$;
create function pg_temp.day_start(d date) returns timestamptz language sql immutable as $$ select (d::timestamp at time zone 'Europe/Bucharest') $$;
-- as(n): act as social user n, the way PostgREST does
create procedure pg_temp.as_s(n int) language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', format('{"sub": "%s", "role": "authenticated", "aud": "authenticated"}', pg_temp.s(n)), true);
end $$;
grant execute on procedure pg_temp.as_s(int) to public;
grant execute on function pg_temp.s(int), pg_temp.today(), pg_temp.day_start(date) to public;

insert into auth.users (instance_id, id, aud, role, email, phone, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', pg_temp.s(n), 'authenticated', 'authenticated', format('test-s%s@kip.invalid', n),
       format('4079999000%s', n), '{"provider":"phone","providers":["phone"]}', jsonb_build_object('first_name', name), now(), now()
from (values (1, 'Sara'), (2, 'Toma'), (3, 'Vlad'), (4, 'Ilinca'), (5, 'Paul'), (6, 'Nora')) x(n, name);

-- savings: Sara saved 4 days (5 to 2 days ago) and missed yesterday; her 1-day Freeze is recharging
insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, entry_date, created_at)
select pg_temp.s(1), 'de_pus_deoparte', 'extra_deposit', 1500, 'confirmed', pg_temp.today() - k,
       pg_temp.day_start(pg_temp.today() - k) + interval '18 hours'
from generate_series(2, 5) k;
insert into public.freeze_state (user_id, day_freeze, day_recharge_at, settled_through)
  values (pg_temp.s(1), 0, now() + interval '3 days', pg_temp.today() - 6);
-- Ilinca: the same, so she's in danger too
insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, entry_date, created_at)
select pg_temp.s(4), 'de_pus_deoparte', 'extra_deposit', 1500, 'confirmed', pg_temp.today() - k,
       pg_temp.day_start(pg_temp.today() - k) + interval '18 hours'
from generate_series(2, 3) k;
insert into public.freeze_state (user_id, day_freeze, day_recharge_at, settled_through)
  values (pg_temp.s(4), 0, now() + interval '3 days', pg_temp.today() - 4);
-- Paul: saved 3 and 2 days ago, missed yesterday, has his 1-day Freeze (it should go on by itself)
insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, entry_date, created_at)
select pg_temp.s(5), 'de_pus_deoparte', 'extra_deposit', 1500, 'confirmed', pg_temp.today() - k,
       pg_temp.day_start(pg_temp.today() - k) + interval '18 hours'
from generate_series(2, 3) k;
insert into public.freeze_state (user_id, settled_through) values (pg_temp.s(5), pg_temp.today() - 4);
-- a pending deposit and a failed one never fill a day
insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, entry_date)
  values (pg_temp.s(5), 'de_pus_deoparte', 'extra_deposit', 1500, 'pending', pg_temp.today() - 1),
         (pg_temp.s(5), 'de_pus_deoparte', 'topup', 1500, 'failed', pg_temp.today() - 1);

-- ---------- access ----------
set local role anon;
set local request.jwt.claims = '{"role": "anon"}';
call pg_temp.must_fail('social', 'anon cannot read the social world', $$select public.social_world()$$);
call pg_temp.must_fail('social', 'anon cannot match contacts', $$select * from public.social_match_contacts(array['+40799990002'])$$);

call pg_temp.as_s(1);
call pg_temp.must_fail('social', 'a signed-in user cannot read the friendship tables directly', $$select * from public.friend_requests$$);
call pg_temp.must_fail('social', 'a signed-in user cannot write a friendship directly', $$
  insert into public.friendships (user_a, user_b) values (pg_temp.s(1), pg_temp.s(2))$$);
call pg_temp.must_fail('social', 'a signed-in user cannot give themselves a freeze directly', $$
  update public.freeze_state set day_freeze = 1 where user_id = pg_temp.s(1)$$);
call pg_temp.must_fail('social', 'a signed-in user cannot run the seed reset', $$select public.social_demo_reset()$$);
call pg_temp.must_fail('social', 'a signed-in user cannot settle someone else', $$select public.social_settle(pg_temp.s(2))$$);
call pg_temp.must_fail('social', 'the sandbox saving is refused for an account that is not a test account', $$
  select public.social_sandbox_save_today()$$, 'P0001', 'kip:not-sandbox');

-- ---------- findable by number ----------
call pg_temp.check('social', 'contact matching returns discoverable people with an account, never yourself or unknown numbers', $$
  select count(*) = 2 and bool_and(id in (pg_temp.s(2), pg_temp.s(3))), string_agg(name, ', ')
  from public.social_match_contacts(array['+40799990001', '+40799990002', '+40799990003', '+40711111999', 'not a number'])$$);
call pg_temp.as_s(3);
do $$ begin perform public.social_set_discoverable(false); end $$;
call pg_temp.as_s(1);
call pg_temp.check('social', 'someone who turned discoverability off never comes back from a match', $$
  select count(*) = 1 and bool_and(id = pg_temp.s(2)), coalesce(string_agg(name, ', '), 'nobody')
  from public.social_match_contacts(array['+40799990002', '+40799990003'])$$);
reset role;
call pg_temp.check('social', 'matching stores nothing: no table holds the numbers it was given', $$
  select count(*) = 0, count(*) || ' columns'
  from information_schema.columns where table_schema = 'public' and table_name in
    ('friend_requests', 'friendships', 'blocks', 'freeze_state', 'frozen_days', 'dangers', 'freeze_asks', 'freeze_gifts', 'cheers', 'social_notices')
    and column_name like '%phone%'$$);

-- ---------- requests and friendships ----------
call pg_temp.as_s(1);
call pg_temp.check('social', 'sending a request: "requested"', $$select public.social_send_request(pg_temp.s(2)) = 'requested', 'requested'$$);
reset role;
call pg_temp.check('social', 'no friendship before the request is accepted', $$
  select not public.social_are_friends(pg_temp.s(1), pg_temp.s(2)), (select count(*) || ' friendships' from public.friendships where pg_temp.s(1) in (user_a, user_b))$$);
call pg_temp.as_s(1);
call pg_temp.must_fail('social', 'the same request twice is refused', $$select public.social_send_request(pg_temp.s(2))$$, 'P0001', 'kip:already-requested');
call pg_temp.must_fail('social', 'a request to yourself is refused', $$select public.social_send_request(pg_temp.s(1))$$, 'P0001', 'kip:self');
call pg_temp.must_fail('social', 'only who received a request can accept it', $$
  select public.social_respond_request((select (r ->> 'id')::uuid from jsonb_array_elements(public.social_world() -> 'requests') r limit 1), true)$$,
  'P0001', 'kip:not-yours');
call pg_temp.as_s(2);
call pg_temp.check('social', 'the other person sees the request and who sent it (name only)', $$
  select (w -> 'requests' -> 0 ->> 'from')::uuid = pg_temp.s(1)
     and (select p ->> 'name' = 'Sara' and not (p ? 'status') from jsonb_array_elements(w -> 'people') p where (p ->> 'id')::uuid = pg_temp.s(1)),
         w -> 'people' ->> 0
  from (select public.social_world() as w) x$$);
call pg_temp.check('social', 'asking back someone who already asked you makes you friends at once', $$
  select public.social_send_request(pg_temp.s(1)) = 'friends', 'friends'$$);
reset role;
call pg_temp.check('social', 'and the friendship exists, once', $$
  select count(*) = 1, count(*) || ' rows' from public.friendships where user_a = least(pg_temp.s(1), pg_temp.s(2)) and user_b = greatest(pg_temp.s(1), pg_temp.s(2))$$);
call pg_temp.as_s(2);
call pg_temp.must_fail('social', 'a request to a friend is refused', $$select public.social_send_request(pg_temp.s(1))$$, 'P0001', 'kip:already-friends');

-- 50 a day: anti-spam only
reset role;
insert into public.friend_requests (from_user, to_user, status) select pg_temp.s(1), pg_temp.s(6), 'cancelled' from generate_series(1, 48); -- + the one to Toma
call pg_temp.as_s(1);
call pg_temp.check('social', 'the 50th request of the day still goes out', $$select public.social_send_request(pg_temp.s(4)) = 'requested', 'requested'$$);
call pg_temp.must_fail('social', 'the 51st request of the day is refused', $$select public.social_send_request(pg_temp.s(5))$$, 'P0001', 'kip:daily-limit');
reset role;
delete from public.friend_requests where from_user = pg_temp.s(1) and to_user = pg_temp.s(6);
call pg_temp.as_s(4);
do $$ begin perform public.social_respond_request((select (r ->> 'id')::uuid from jsonb_array_elements(public.social_world() -> 'requests') r
                                                  where (r ->> 'from')::uuid = pg_temp.s(1)), true); end $$;
call pg_temp.as_s(2);
do $$ begin perform public.social_send_request(pg_temp.s(4)); end $$;
call pg_temp.as_s(4);
do $$ begin perform public.social_respond_request((select (r ->> 'id')::uuid from jsonb_array_elements(public.social_world() -> 'requests') r
                                                  where (r ->> 'from')::uuid = pg_temp.s(2)), false); end $$;
reset role;
call pg_temp.check('social', 'declining a request leaves no friendship', $$
  select status = 'declined' and not public.social_are_friends(pg_temp.s(2), pg_temp.s(4)), status
  from public.friend_requests where from_user = pg_temp.s(2) and to_user = pg_temp.s(4)$$);
call pg_temp.as_s(2);
do $$ begin perform public.social_send_request(pg_temp.s(4)); end $$;
call pg_temp.as_s(4);
do $$ begin perform public.social_respond_request((select (r ->> 'id')::uuid from jsonb_array_elements(public.social_world() -> 'requests') r
                                                  where (r ->> 'from')::uuid = pg_temp.s(2)), true); end $$;

-- block: hides both ways
call pg_temp.as_s(3);
do $$ begin perform public.social_send_request(pg_temp.s(1)); end $$;
call pg_temp.as_s(1);
do $$ begin perform public.social_block(pg_temp.s(3)); end $$;
call pg_temp.as_s(3);
do $$ begin perform public.social_set_discoverable(true); end $$;
call pg_temp.must_fail('social', 'a blocked person cannot send a request', $$select public.social_send_request(pg_temp.s(1))$$, 'P0001', 'kip:blocked');
call pg_temp.check('social', 'a block hides you from their contact matching', $$
  select count(*) = 0, count(*) || ' found' from public.social_match_contacts(array['+40799990001'])$$);
call pg_temp.check('social', 'a block closed the pending request it interrupted', $$
  select not exists (select 1 from jsonb_array_elements(public.social_world() -> 'requests') r where r ->> 'status' = 'pending'),
         (public.social_world() -> 'requests')::text$$);

-- ---------- what a friend may see ----------
call pg_temp.as_s(2);
call pg_temp.check('social', 'a friend sees only name, streak, saved today and freeze status, never an amount', $$
  select (p -> 'status') ?& array['streak', 'saved_today', 'has_day_freeze', 'danger']
     and (select array_agg(k order by k) from jsonb_object_keys(p -> 'status') k)
         = array['danger', 'frozen_today', 'gift_given_at', 'has_day_freeze', 'saved_today', 'streak', 'week_from', 'week_running']
     and (select array_agg(k order by k) from jsonb_object_keys(p) k) = array['friend', 'id', 'name', 'since', 'status']
     and position('amount' in w::text) = 0 and position('bani' in w::text) = 0,
         (p -> 'status')::text
  from (select public.social_world() as w) x, jsonb_array_elements(w -> 'people') p where (p ->> 'id')::uuid = pg_temp.s(1)$$);

-- ---------- the 1-day Freeze ----------
call pg_temp.check('social', 'a missed day without a freeze puts a friend in danger, and the danger holds the streak', $$
  select (p -> 'status' -> 'danger' ->> 'day')::date = pg_temp.today() - 1 and (p -> 'status' ->> 'streak')::int = 4,
         (p -> 'status')::text
  from jsonb_array_elements(public.social_world() -> 'people') p where (p ->> 'id')::uuid = pg_temp.s(1)$$);
call pg_temp.as_s(5);
call pg_temp.check('social', 'a missed day with a run to protect uses the 1-day Freeze on its own', $$
  select (w -> 'freeze' ->> 'day_freeze')::int = 0 and w -> 'status' -> 'danger' = 'null'::jsonb
     and (w -> 'freeze' -> 'frozen' -> 0 ->> 'day')::date = pg_temp.today() - 1 and (w -> 'status' ->> 'streak')::int = 2,
         (w -> 'freeze')::text
  from (select public.social_world() as w) x$$);
call pg_temp.check('social', 'the used freeze recharges exactly 7 days after the day it covered', $$
  select (w -> 'freeze' ->> 'day_recharge_at')::timestamptz = pg_temp.day_start(pg_temp.today()) + interval '7 days',
         w -> 'freeze' ->> 'day_recharge_at'
  from (select public.social_world() as w) x$$);
reset role;
update public.freeze_state set day_recharge_at = now() - interval '1 minute' where user_id = pg_temp.s(5);
call pg_temp.as_s(5);
call pg_temp.check('social', 'once the 7 days are up it is back, and never more than one', $$
  select (w -> 'freeze' ->> 'day_freeze')::int = 1 and w -> 'freeze' -> 'day_recharge_at' = 'null'::jsonb, (w -> 'freeze')::text
  from (select public.social_world() as w) x$$);

-- asking for one: friends only
call pg_temp.as_s(1);
do $$ begin perform public.social_ask_freeze(array[pg_temp.s(2), pg_temp.s(3), pg_temp.s(5)]); end $$;
reset role;
call pg_temp.check('social', 'asking for a freeze reaches friends only', $$
  select to_users = array[pg_temp.s(2)], to_users::text from public.freeze_asks where from_user = pg_temp.s(1)$$);
call pg_temp.as_s(2);
call pg_temp.check('social', 'the friend asked sees the ask, with only themselves in the list', $$
  select jsonb_array_length(w -> 'asks') = 1 and w -> 'asks' -> 0 -> 'to' = jsonb_build_array(pg_temp.s(2)), (w -> 'asks')::text
  from (select public.social_world() as w) x$$);
call pg_temp.as_s(5);
call pg_temp.must_fail('social', 'only someone in danger can ask', $$select public.social_ask_freeze(array[pg_temp.s(1)])$$, 'P0001', 'kip:not-in-danger');

-- giving it
call pg_temp.as_s(3);
call pg_temp.must_fail('social', 'a freeze can only go to a friend', $$select public.social_give_freeze(pg_temp.s(1))$$, 'P0001', 'kip:not-connected');
call pg_temp.as_s(2);
call pg_temp.check('social', 'giving: the giver''s freeze goes (7-day recharge) and the gift waits for a saving', $$
  select g ->> 'status' = 'pending' and (w -> 'freeze' ->> 'day_freeze')::int = 0
     and (w -> 'freeze' ->> 'day_recharge_at')::timestamptz between now() + interval '7 days' - interval '1 minute' and now() + interval '7 days',
         g::text
  from (select public.social_give_freeze(pg_temp.s(1)) as g) x, lateral (select public.social_world() as w) y$$);
call pg_temp.check('social', 'the asks for that day close once someone helped', $$
  select jsonb_array_length(public.social_world() -> 'asks') = 0, 'closed'$$);
call pg_temp.must_fail('social', 'no freeze left to give', $$select public.social_give_freeze(pg_temp.s(4))$$, 'P0001', 'kip:no-freeze');
reset role;
update public.freeze_state set day_freeze = 1, day_recharge_at = null where user_id = pg_temp.s(4);
call pg_temp.as_s(4);
call pg_temp.must_fail('social', 'someone already helped cannot get a second freeze for the same day', $$
  select public.social_give_freeze(pg_temp.s(1))$$, 'P0001', 'kip:already-helped');
reset role;
update public.freeze_state set day_freeze = 0, day_recharge_at = now() + interval '3 days' where user_id = pg_temp.s(4);
call pg_temp.as_s(1);
call pg_temp.check('social', 'the rescued one sees the gift waiting, and is no longer counted as in danger by friends', $$
  select jsonb_array_length(w -> 'gifts') = 1 and (w -> 'status' ->> 'gift_given_at') is not null, (w -> 'status')::text
  from (select public.social_world() as w) x$$);
-- the rescued one puts money aside within 24 hours
reset role;
insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, entry_date)
  values (pg_temp.s(1), 'de_pus_deoparte', 'extra_deposit', 1500, 'confirmed', pg_temp.today());
call pg_temp.as_s(1);
call pg_temp.check('social', 'a saving in time: the gift works, covers the missed day, and the run goes on', $$
  select w -> 'gifts' -> 0 ->> 'status' = 'active' and (w -> 'status' ->> 'streak')::int = 5 and (w -> 'status' ->> 'saved_today')::boolean
     and w -> 'status' -> 'danger' = 'null'::jsonb
     and exists (select 1 from jsonb_array_elements(w -> 'freeze' -> 'frozen') f where (f ->> 'day')::date = pg_temp.today() - 1 and f ->> 'by' = 'gift'),
         (w -> 'status')::text
  from (select public.social_world() as w) x$$);
call pg_temp.as_s(2);
call pg_temp.check('social', 'the giver hears it worked, and sees the friend saved today', $$
  select exists (select 1 from jsonb_array_elements(w -> 'notices') n where n ->> 'kind' = 'gift_worked' and (n ->> 'actor')::uuid = pg_temp.s(1))
     and (select (p -> 'status' ->> 'saved_today')::boolean from jsonb_array_elements(w -> 'people') p where (p ->> 'id')::uuid = pg_temp.s(1)),
         'notified'
  from (select public.social_world() as w) x$$);

-- a gift that runs out: back to the giver, recharge cancelled
reset role;
update public.freeze_state set day_freeze = 1, day_recharge_at = null where user_id = pg_temp.s(2);
call pg_temp.as_s(2);
do $$ begin perform public.social_give_freeze(pg_temp.s(4)); end $$;
reset role;
update public.freeze_gifts set given_at = now() - interval '25 hours' where to_user = pg_temp.s(4);
call pg_temp.as_s(4);
do $$ begin perform public.social_world(); end $$;
reset role;
call pg_temp.check('social', 'no saving in 24 hours: the gift goes back, the giver has the freeze again and the recharge is cancelled', $$
  select g.status = 'returned' and f.day_freeze = 1 and f.day_recharge_at is null, format('%s, freeze %s', g.status, f.day_freeze)
  from public.freeze_gifts g, public.freeze_state f where g.to_user = pg_temp.s(4) and f.user_id = pg_temp.s(2)$$);
-- at most 2 received in 30 days
insert into public.freeze_gifts (from_user, to_user, day, given_at, status)
  values (pg_temp.s(5), pg_temp.s(4), pg_temp.today() - 20, now() - interval '20 days', 'active'),
         (pg_temp.s(5), pg_temp.s(4), pg_temp.today() - 10, now() - interval '10 days', 'active');
update public.dangers set until = now() + interval '1 hour' where user_id = pg_temp.s(4);
call pg_temp.as_s(2);
call pg_temp.must_fail('social', 'a third freeze received within 30 days is refused', $$select public.social_give_freeze(pg_temp.s(4))$$, 'P0001', 'kip:rescue-limit');

-- ---------- cheers ----------
call pg_temp.as_s(2);
do $$ begin perform public.social_cheer(pg_temp.s(1), 'bravo'); perform public.social_cheer(pg_temp.s(1), 'poti'); perform public.social_cheer(pg_temp.s(1), 'aici'); end $$;
call pg_temp.must_fail('social', 'a 4th cheer to the same friend on the same day is refused', $$select public.social_cheer(pg_temp.s(1), 'bravo')$$, 'P0001', 'kip:cheers');
call pg_temp.as_s(3);
call pg_temp.must_fail('social', 'cheers only go to friends', $$select public.social_cheer(pg_temp.s(1), 'bravo')$$, 'P0001', 'kip:not-connected');
call pg_temp.as_s(1);
call pg_temp.check('social', 'the cheered friend gets the 3 cheers and a notice for each', $$
  select jsonb_array_length(w -> 'cheers') = 3
     and (select count(*) from jsonb_array_elements(w -> 'notices') n where n ->> 'kind' = 'cheer') = 3, (w -> 'cheers')::text
  from (select public.social_world() as w) x$$);
call pg_temp.check('social', 'a user reads only their own notices', $$
  select count(*) > 0 and bool_and(to_user = pg_temp.s(1)), count(*) || ' rows' from public.social_notices$$);

-- ---------- invites ----------
reset role;
update public.freeze_state set day_freeze = 0, day_recharge_at = now() + interval '5 days' where user_id = pg_temp.s(2);
create temp table invite_code_of_toma on commit drop as select invite_code from public.profiles where user_id = pg_temp.s(2);
grant select on invite_code_of_toma to public;
call pg_temp.as_s(6);
call pg_temp.check('social', 'a link redeems', $$select public.social_redeem_invite((select invite_code from invite_code_of_toma)), 'redeemed'$$);
call pg_temp.check('social', 'joining through a link: the newcomer starts with a 1-day Freeze and the inviter''s request waits', $$
  select (w -> 'freeze' ->> 'day_freeze')::int = 1
     and exists (select 1 from jsonb_array_elements(w -> 'requests') r where (r ->> 'from')::uuid = pg_temp.s(2)),
         (w -> 'requests')::text
  from (select public.social_world() as w) x$$);
call pg_temp.check('social', 'a link works once per account', $$
  select not public.social_redeem_invite((select invite_code from invite_code_of_toma)), 'refused'$$);
reset role;
call pg_temp.check('social', 'the inviter has the freeze back with no recharge waiting', $$
  select day_freeze = 1 and day_recharge_at is null, format('freeze %s', day_freeze) from public.freeze_state where user_id = pg_temp.s(2)$$);

-- ======================================================================================
-- Results (then everything above is rolled back)
-- ======================================================================================

reset role;
select result, area, test, detail
from (
  select 0 as n,
         case when bool_and(pass) then 'PASS' else 'FAIL' end as result,
         'all' as area,
         format('%s cases: %s passed, %s failed', count(*), count(*) filter (where pass), count(*) filter (where not pass)) as test,
         null::text as detail
  from test_results
  union all
  select n, case when pass then 'PASS' else 'FAIL' end, area, name, detail from test_results
) r
order by n;

rollback;
