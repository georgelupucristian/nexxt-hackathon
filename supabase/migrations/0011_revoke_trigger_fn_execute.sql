-- handle_new_user only runs as the auth.users trigger; nobody should call it through /rest/v1/rpc
-- (Supabase security advisor lints 0028 and 0029).
revoke execute on function public.handle_new_user() from public, anon, authenticated;
