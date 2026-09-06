-- Member dashboard: policies, invoices, billing address, Stripe customer mapping.
-- All consumer-visible billing data lives in `policies` + `invoices` (real, not seeded).
-- New users start with NO policy; they buy via /purchase, which inserts the first
-- policy + first invoice on completion (and Stripe webhooks keep both tables current).

-- -----------------------------------------------------------------------------
-- profiles: billing address + Stripe customer pointer
-- -----------------------------------------------------------------------------

alter table public.profiles
  add column if not exists stripe_customer_id text,
  add column if not exists billing_address_line1 text not null default '',
  add column if not exists billing_address_line2 text not null default '',
  add column if not exists billing_city text not null default '',
  add column if not exists billing_state text not null default '',
  add column if not exists billing_postal_code text not null default '',
  add column if not exists billing_country text not null default 'US';

comment on column public.profiles.stripe_customer_id is
  'Stripe Customer ID created the first time the user pays / enables AutoPay.';
comment on column public.profiles.billing_address_line1 is
  'Mailing/billing street (used for receipts + Policy Declaration). Editable from /dashboard.';

create unique index if not exists profiles_stripe_customer_id_uniq
  on public.profiles (stripe_customer_id)
  where stripe_customer_id is not null;

-- -----------------------------------------------------------------------------
-- policies: one row per purchased coverage period. Multiple over a lifetime.
-- -----------------------------------------------------------------------------

create table if not exists public.policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  policy_number text not null,
  plan_key text not null,
  status text not null default 'active'
    check (status in ('active', 'lapsed', 'cancelled', 'pending')),
  monthly_premium_cents integer not null default 0
    check (monthly_premium_cents >= 0),
  /** Date the user first activated this policy. */
  effective_date date not null,
  /** When the current coverage period ends / next renewal is due. */
  renewal_date date not null,
  /** When a coverage period started (FS-20 dates align with the printed card). */
  current_period_start date not null,
  current_period_end date not null,
  autopay_enabled boolean not null default false,
  stripe_subscription_id text,
  stripe_customer_id text,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists policies_user_id_idx on public.policies (user_id);
create index if not exists policies_user_status_idx
  on public.policies (user_id, status);
create unique index if not exists policies_stripe_sub_uniq
  on public.policies (stripe_subscription_id)
  where stripe_subscription_id is not null;
create unique index if not exists policies_policy_number_uniq
  on public.policies (policy_number);

comment on table public.policies is
  'Real, billable insurance policy rows. Created by /api/purchase/complete + Stripe webhooks.';

-- -----------------------------------------------------------------------------
-- invoices: every charge attempt (one-time pay-now OR recurring subscription).
-- This IS the billing history (no fake data).
-- -----------------------------------------------------------------------------

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  policy_id uuid references public.policies (id) on delete set null,
  /** Pretty label for billing history list, e.g. "May 2026" or "Policy ATP1234-00 initial". */
  period_label text not null,
  due_date date not null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'due'
    check (status in ('due', 'pending', 'paid', 'failed', 'refunded', 'void')),
  /** Stripe object IDs from the payment that satisfied (or attempted) this invoice. */
  stripe_payment_intent_id text,
  stripe_invoice_id text,
  stripe_checkout_session_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_id_idx on public.invoices (user_id);
create index if not exists invoices_policy_id_idx on public.invoices (policy_id);
create index if not exists invoices_user_status_idx
  on public.invoices (user_id, status);
create unique index if not exists invoices_stripe_invoice_uniq
  on public.invoices (stripe_invoice_id)
  where stripe_invoice_id is not null;
create unique index if not exists invoices_stripe_checkout_uniq
  on public.invoices (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;

comment on table public.invoices is
  'Authoritative billing history. Inserted by purchase completion + Stripe webhooks.';

-- -----------------------------------------------------------------------------
-- updated_at trigger (shared)
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists policies_set_updated_at on public.policies;
create trigger policies_set_updated_at
  before update on public.policies
  for each row execute procedure public.set_updated_at ();

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute procedure public.set_updated_at ();

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.policies enable row level security;
alter table public.invoices enable row level security;

-- Members read their own policies; only service role writes (webhook / purchase API).
drop policy if exists "policies_select_own" on public.policies;
create policy "policies_select_own"
  on public.policies for select
  to authenticated
  using (auth.uid () = user_id);

-- Members read their own invoices; writes go through service role.
drop policy if exists "invoices_select_own" on public.invoices;
create policy "invoices_select_own"
  on public.invoices for select
  to authenticated
  using (auth.uid () = user_id);
