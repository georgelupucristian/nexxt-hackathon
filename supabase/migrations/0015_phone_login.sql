-- Phone sign-in (the auth-phone Edge Function), sandbox only: a fixed test code instead of an SMS.
--
-- Two server-only helpers for it. Both are callable by the service role alone (the function's
-- admin client); anon and signed-in users get nothing, so neither is an API anyone can reach.
--
--   auth_user_by_phone(phone)   who already has this number, without paging through every user
--   phone_login_attempt(phone)  counts a verify attempt; false after 10 in 10 minutes per number
--
-- New phone users are made by the admin API (auth.admin.createUser), so the on_auth_user_created
-- trigger from 0001 gives them a profiles row exactly as it does for email sign-ups.

-- ---------- who has this phone ----------
-- Supabase Auth stores phones without the + (40712345678); this takes either form.
-- SECURITY DEFINER because the service role has no grant on auth.users; it only ever returns the
-- id and email of the one user with that exact number.
create or replace function public.auth_user_by_phone(p_phone text)
returns table (user_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id, u.email::text
  from auth.users u
  where u.phone in (ltrim(p_phone, '+'), '+' || ltrim(p_phone, '+'))
  limit 1
$$;

-- ---------- verify attempts ----------
-- One row per verify attempt in the last 10 minutes; older rows are deleted as new ones come in.
create table public.phone_login_attempts (
  id bigint generated always as identity primary key,
  phone text not null check (phone ~ '^\+[0-9]{8,15}$'),
  attempted_at timestamptz not null default now()
);
create index phone_login_attempts_phone_time on public.phone_login_attempts (phone, attempted_at);
-- RLS on and no policies: nobody but the service role (which bypasses RLS) sees a row
alter table public.phone_login_attempts enable row level security;
revoke all on public.phone_login_attempts from public, anon, authenticated;
grant select, insert, delete on public.phone_login_attempts to service_role;

-- true: the attempt is counted, go on and check the code. false: 10 attempts for this number in
-- the last 10 minutes already; refused attempts are not counted, so it opens again 10 minutes
-- after the oldest of those 10.
create or replace function public.phone_login_attempt(p_phone text)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_recent integer;
begin
  if p_phone is null or p_phone !~ '^\+[0-9]{8,15}$' then
    raise exception 'phone_login_attempt: the phone must be in E.164 form';
  end if;
  -- one request per number at a time, so two at once can't both take the 10th attempt
  perform pg_advisory_xact_lock(hashtextextended('phone_login_attempt:' || p_phone, 0));
  delete from public.phone_login_attempts where attempted_at < now() - interval '10 minutes';
  select count(*) into v_recent from public.phone_login_attempts where phone = p_phone;
  if v_recent >= 10 then
    return false;
  end if;
  insert into public.phone_login_attempts (phone) values (p_phone);
  return true;
end;
$$;

revoke all on function public.auth_user_by_phone(text) from public, anon, authenticated;
revoke all on function public.phone_login_attempt(text) from public, anon, authenticated;
grant execute on function public.auth_user_by_phone(text), public.phone_login_attempt(text) to service_role;
