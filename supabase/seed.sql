-- Local demo account with some history, recreated on every `supabase db reset`.
-- Sign in with ana.visual@avansul.test / Parola2026! (local only; never seed real users).
do $$
declare
  v uuid := '3f5d36b5-c19b-4940-9289-7d13b81c2320';
begin
  if exists (select 1 from auth.users where id = v) then
    return;
  end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', v, 'authenticated', 'authenticated', 'ana.visual@avansul.test',
    crypt('Parola2026!', gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}', '{"first_name":"Ana"}', now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v, jsonb_build_object('sub', v::text, 'email', 'ana.visual@avansul.test'), 'email', v::text, now(), now(), now());

  -- the profile row comes from the on_auth_user_created trigger
  update public.profiles set first_name = 'Ana', daily_amount_bani = 1500, payday_day = 1,
    subscription_status = 'active', is_demo = true, sim_date = '2026-10-28', city = 'Iași'
  where user_id = v;
  insert into public.goals (user_id, kind, is_primary, name, target_bani, city, neighbourhood, size, size_sqm, price_per_sqm_eur, down_payment_pct)
  values (v, 'avans', true, 'Garsonieră în Nicolina', 3567000, 'Iași', 'Nicolina', 'garsoniera', 33, 1450, 15);
  insert into public.ledger_entries (user_id, bucket, type, amount_bani, status, stripe_object_id, entry_date) values
    (v, 'de_pus_deoparte', 'topup', 45000, 'failed', 'in_seed_0', '2026-08-01'),
    (v, 'de_pus_deoparte', 'topup', 45000, 'confirmed', 'in_seed_1', '2026-09-01'),
    (v, 'de_pus_deoparte', 'topup', 45000, 'confirmed', 'in_seed_2', '2026-10-01');
  perform public.allocate_range(v, '2026-09-01', '2026-10-28');
end $$;
