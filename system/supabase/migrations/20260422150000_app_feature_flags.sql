-- Site-wide feature flags (single row, id = 1)
create table if not exists public.app_feature_flags (
  id smallint primary key default 1 check (id = 1),
  dashboard_coverage_section_visible boolean not null default true
);

insert into public.app_feature_flags (id, dashboard_coverage_section_visible)
values (1, true)
on conflict (id) do nothing;

alter table public.app_feature_flags enable row level security;

-- Members need read access for dashboard layout; only service role can update (no update policy for authenticated)
create policy "app_feature_flags_select_authenticated"
  on public.app_feature_flags
  for select
  to authenticated
  using (true);

comment on table public.app_feature_flags is 'Single-row flags; id must stay 1';
comment on column public.app_feature_flags.dashboard_coverage_section_visible is 'When false, the "Your coverage" block is hidden on /dashboard.';
