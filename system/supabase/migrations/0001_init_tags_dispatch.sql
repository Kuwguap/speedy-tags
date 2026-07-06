-- ============================================================================
-- Phase 1 schema: tag orders + Telegram dispatch (drivers/supervisors/deliveries)
-- + unified transactions ledger + plate-allocation settings.
--
-- Access in Phase 1 is exclusively via the Supabase service role (tag-site API
-- routes and the dispatch bot), which bypasses RLS. RLS is enabled with no
-- public policies so anon/authenticated clients are denied by default.
-- Phase 2 (insurance portal + auth-based customer access) adds scoped policies.
-- ============================================================================

create extension if not exists pgcrypto;

-- ─── users (tag customers; app-managed, magic-link auth) ─────────────────────
create table if not exists public.users (
  id                   uuid primary key default gen_random_uuid(),
  email                text not null unique,
  first_name           text,
  last_name            text,
  phone                text,
  renewal_enabled      boolean not null default true,
  last_reminder_at     timestamptz,
  next_renewal_due_at  timestamptz,
  created_at           timestamptz not null default now()
);

-- ─── orders (temp-tag purchases + dispatch bookkeeping) ──────────────────────
create table if not exists public.orders (
  id                          uuid primary key default gen_random_uuid(),
  reference                   text unique,
  user_id                     uuid references public.users (id) on delete set null,
  status                      text not null default 'pending'
                                check (status in ('pending','paid','failed')),
  state                       text,
  first_name                  text,
  last_name                   text,
  email                       text,
  phone                       text,
  address                     text,
  address2                    text,
  city                        text,
  zip                         text,
  vin                         text,
  year                        text,
  make                        text,
  model                       text,
  color                       text,
  body                        text,
  insurance_opt_in            boolean not null default false,
  insurance_company           text,
  insurance_policy            text,
  notes                       text,
  plate                       text,
  price                       numeric,
  delivery_method             text check (delivery_method in ('email','driver','fedex')),
  delivery_email              text,
  delivery_address            text,
  stripe_session_id           text unique,
  paid_at                     timestamptz,
  renewal_due_at              timestamptz,
  tag_pdf_path                text,
  insurance_pdf_path          text,
  -- Telegram dispatch state
  telegram_sent               boolean not null default false,
  telegram_recipients         jsonb  not null default '[]'::jsonb,
  telegram_errors             jsonb  not null default '[]'::jsonb,
  telegram_accepted_by        text,           -- driver telegram id
  telegram_accepted_driver_id uuid,
  telegram_accepted_at        timestamptz,
  telegram_claim_message_ids  jsonb  not null default '{}'::jsonb, -- {chatId: messageId}
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
create index if not exists orders_status_idx on public.orders (status);
create index if not exists orders_user_idx   on public.orders (user_id);

-- ─── drivers (managed from the dashboard) ────────────────────────────────────
create table if not exists public.drivers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  email        text not null,
  telegram_id  text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── supervisors (receive the full generated PDF, informational) ─────────────
create table if not exists public.supervisors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  telegram_id  text not null unique,
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

-- ─── deliveries (one per dispatched order once a driver claims it) ────────────
create table if not exists public.deliveries (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders (id) on delete cascade,
  driver_id     uuid references public.drivers (id) on delete set null,
  status        text not null default 'assigned'
                  check (status in ('assigned','accepted','delivered','cancelled')),
  assigned_at   timestamptz not null default now(),
  accepted_at   timestamptz,
  delivered_at  timestamptz,
  receipt_path  text,
  created_at    timestamptz not null default now()
);
create index if not exists deliveries_order_idx  on public.deliveries (order_id);
create index if not exists deliveries_driver_idx on public.deliveries (driver_id);

-- ─── transactions (unified ledger across tag + insurance) ────────────────────
create table if not exists public.transactions (
  id            uuid primary key default gen_random_uuid(),
  source        text not null check (source in ('tag','insurance')),
  stripe_id     text unique,
  amount_cents  integer not null default 0,
  status        text not null default 'paid'
                  check (status in ('paid','refunded','failed','pending')),
  user_id       uuid,
  order_id      uuid references public.orders (id) on delete set null,
  policy_id     uuid,
  created_at    timestamptz not null default now()
);
create index if not exists transactions_source_idx on public.transactions (source);

-- ─── settings (single row: plate counters) ───────────────────────────────────
create table if not exists public.settings (
  id                      integer primary key default 1 check (id = 1),
  nj_plate_prefix         text    not null default 'H',
  nj_plate_digits         integer not null default 6,
  nj_plate_next_number    bigint  not null default 150706,
  non_nj_plate_suffix     text    not null default 'V',
  non_nj_plate_digits     integer not null default 6,
  non_nj_plate_next_number bigint not null default 150706,
  updated_at              timestamptz not null default now()
);
insert into public.settings (id) values (1) on conflict (id) do nothing;

-- ─── allocate_plate(): atomic counter increment + formatting ─────────────────
create or replace function public.allocate_plate(p_is_nj boolean)
returns text
language plpgsql
as $$
declare
  v_n      bigint;
  v_prefix text;
  v_suffix text;
  v_digits integer;
begin
  if p_is_nj then
    update public.settings
       set nj_plate_next_number = nj_plate_next_number + 1,
           updated_at = now()
     where id = 1
     returning nj_plate_next_number - 1, nj_plate_prefix, nj_plate_digits
       into v_n, v_prefix, v_digits;
    return v_prefix || lpad(v_n::text, v_digits, '0');
  else
    update public.settings
       set non_nj_plate_next_number = non_nj_plate_next_number + 1,
           updated_at = now()
     where id = 1
     returning non_nj_plate_next_number - 1, non_nj_plate_suffix, non_nj_plate_digits
       into v_n, v_suffix, v_digits;
    return lpad(v_n::text, v_digits, '0') || v_suffix;
  end if;
end;
$$;

-- ─── updated_at trigger for orders ───────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
  before update on public.orders
  for each row execute function public.set_updated_at();

-- ─── RLS: deny-by-default (service role bypasses) ────────────────────────────
alter table public.users        enable row level security;
alter table public.orders       enable row level security;
alter table public.drivers      enable row level security;
alter table public.supervisors  enable row level security;
alter table public.deliveries   enable row level security;
alter table public.transactions enable row level security;
alter table public.settings     enable row level security;

-- ─── Storage buckets (private) ───────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('order-documents', 'order-documents', false)
on conflict (id) do nothing;
insert into storage.buckets (id, name, public)
values ('delivery-receipts', 'delivery-receipts', false)
on conflict (id) do nothing;
