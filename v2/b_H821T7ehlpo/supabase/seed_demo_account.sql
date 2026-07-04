-- =============================================================================
-- TriStateCoverage — demo account for SQL Editor
-- Email:    demo@example.com
-- Password: demo123
-- =============================================================================
-- Prerequisites: migration `20260422120000_initial_schema.sql` already applied
-- (profiles, vehicles, coverage, trigger handle_new_user).
--
-- Policy fields on vehicles: if you have not run `20260422160000_policy_dates_address.sql`
-- yet, the following `ALTER` adds them so this script runs in one step.
--
-- Uses pgcrypto for bcrypt (same family Supabase Auth uses). Safe to re-run:
-- deletes demo rows in public tables + auth, then recreates.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

alter table public.vehicles
  add column if not exists policy_effective_date text not null default '',
  add column if not exists policy_expiration_date text not null default '',
  add column if not exists policy_address text not null default '';

do $$
declare
  inst_id uuid;
  demo_id uuid := gen_random_uuid ();
begin
  -- Hosted Supabase: reuse instance_id from any existing auth row.
  select instance_id into inst_id from auth.users limit 1;
  if inst_id is null then
    inst_id := '00000000-0000-0000-0000-000000000000'::uuid;
  end if;

  -- Cascades remove profile / vehicles / coverage
  delete from auth.users where email = 'demo@example.com';

  insert into auth.users (
    instance_id,
    id,
    aud,
    "role",
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    email_change,
    email_change_token_new,
    recovery_token,
    is_sso_user,
    is_anonymous
  )
  values (
    inst_id,
    demo_id,
    'authenticated',
    'authenticated',
    'demo@example.com',
    extensions.crypt ('demo123', extensions.gen_salt ('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"name":"Jenny Martinez","phone":"(555) 123-4567"}'::jsonb,
    now(),
    now(),
    '',
    '',
    '',
    '',
    false,
    false
  );

  -- Trigger already inserted profile + default vehicle + coverage; align with app demo data
  update public.profiles
  set
    email = 'demo@example.com',
    name = 'Jenny Martinez',
    phone = '(555) 123-4567',
    member_since = 'Dec 2009'
  where id = demo_id;

  update public.vehicles
  set
    vehicle_name = '2022 Honda Civic',
    vin = '1HGBH41JXMN109186',
    policy_number = 'ABP6300023856',
    policy_effective_date = 'Jan 1, 2024',
    policy_expiration_date = 'Dec 31, 2024',
    policy_address = '123 Main St, Fort Lee, NJ 07024',
    annual_premium = 436.00
  where user_id = demo_id;

  update public.coverage
  set
    liability = true,
    collision = true,
    comprehensive = true,
    uninsured_motorist = true,
    medical_payments = true,
    roadside_assistance = true,
    updated_at = now()
  where user_id = demo_id;

  raise notice 'Demo user ready: demo@example.com / demo123 (id=%)', demo_id;
end $$;
