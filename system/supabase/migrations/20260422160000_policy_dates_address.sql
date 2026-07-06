-- Policy display fields for vehicles
alter table public.vehicles
  add column if not exists policy_effective_date text not null default '',
  add column if not exists policy_expiration_date text not null default '',
  add column if not exists policy_address text not null default '';

comment on column public.vehicles.policy_effective_date is 'Display text or ISO date for policy start';
comment on column public.vehicles.policy_expiration_date is 'Display text or ISO date for policy end';
comment on column public.vehicles.policy_address is 'Mailing or garaging address for the policy';
