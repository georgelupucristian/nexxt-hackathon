-- "Planul încă merge": the user's weekly check-in. A week counts if it has a check-in or an extra
-- deposit; automatic top-ups and daily allocations never count, because they aren't the user's action.
create or replace function public.check_in()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_week text := to_char((now() at time zone 'Europe/Bucharest')::date, 'IYYY-"W"IW');
begin
  if v_user is null then
    raise exception 'not signed in';
  end if;
  insert into weekly_progress (user_id, iso_week, checked_in)
    values (v_user, v_week, true)
  on conflict (user_id, iso_week) do update set checked_in = true;
end;
$$;
revoke all on function public.check_in() from public, anon;
grant execute on function public.check_in() to authenticated;
