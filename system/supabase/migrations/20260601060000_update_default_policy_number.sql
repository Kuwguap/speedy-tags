-- Update handle_new_user() so the starter vehicle inserted for every new
-- signup uses the canonical TriStateCoverage policy-number format
-- (`ABP63` + 8 zero-padded digits) instead of the legacy `TSLA 1234567890`
-- placeholder shipped in the initial schema migration.
--
-- This trigger only fires for direct /signup flows (the purchase route always
-- calls `generatePolicyNumber()` in lib/purchase/plans.ts and inserts its own
-- policies row), so the impact here is limited to demo / non-purchase sign-ups.

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, phone, member_since)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', '(555) 000-0000'),
    to_char((now() at time zone 'utc'), 'Mon YYYY')
  );

  insert into public.vehicles (user_id, vehicle_name, vin, policy_number, annual_premium)
  values (
    new.id,
    '2023 Tesla Model 3',
    '5YJ3E1EA1PF000001',
    'ABP6312345678',
    599.00
  );

  insert into public.coverage (
    user_id,
    liability,
    collision,
    comprehensive,
    uninsured_motorist,
    medical_payments,
    roadside_assistance
  )
  values (
    new.id,
    true,
    true,
    true,
    false,
    false,
    false
  );

  return new;
end;
$$;

-- Also re-align any existing placeholder rows that were inserted by the
-- previous trigger version. Skips rows that already carry a real policy #.
update public.vehicles
set policy_number = 'ABP6312345678'
where policy_number = 'TSLA 1234567890';
