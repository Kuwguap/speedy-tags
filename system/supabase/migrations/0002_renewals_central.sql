-- Central dashboard / renewal support.
-- Tracks when a 28-day renewal reminder was last sent for a tag order so the
-- sweep is idempotent and doesn't re-email the same customer.

alter table public.orders
  add column if not exists renewal_reminded_at timestamptz,
  add column if not exists renewal_count integer not null default 0;

create index if not exists orders_renewal_due_idx
  on public.orders (renewal_due_at)
  where status = 'paid';
