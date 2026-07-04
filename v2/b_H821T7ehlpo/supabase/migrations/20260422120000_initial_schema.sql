-- TriStateCoverage: profiles, vehicles, coverage + RLS
-- Run via Supabase SQL Editor or `supabase db push`

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text not null,
  name text not null default '',
  phone text not null default '(555) 000-0000',
  member_since text not null default ''
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  vehicle_name text not null,
  vin text not null,
  policy_number text not null,
  annual_premium numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

create index vehicles_user_id_idx on public.vehicles (user_id);

create table public.coverage (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  liability boolean not null default false,
  collision boolean not null default false,
  comprehensive boolean not null default false,
  uninsured_motorist boolean not null default false,
  medical_payments boolean not null default false,
  roadside_assistance boolean not null default false,
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- New auth user -> profile + starter vehicle + coverage (defaults match app seed)
-- -----------------------------------------------------------------------------

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
    'TSLA 1234567890',
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute procedure public.handle_new_user ();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.vehicles enable row level security;
alter table public.coverage enable row level security;

create policy "profiles_select_own"
  on public.profiles
  for select
  to authenticated
  using (auth.uid () = id);

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid () = id)
  with check (auth.uid () = id);

create policy "vehicles_all_own"
  on public.vehicles
  for all
  to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);

create policy "coverage_all_own"
  on public.coverage
  for all
  to authenticated
  using (auth.uid () = user_id)
  with check (auth.uid () = user_id);
