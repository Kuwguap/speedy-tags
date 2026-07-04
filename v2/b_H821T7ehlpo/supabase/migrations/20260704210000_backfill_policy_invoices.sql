-- Backfill: bot-issued policies often have `monthly_premium_cents = 0` and no
-- `invoices` row, so the member dashboard showed $0.00 balance and Pay Now was
-- disabled. Create one "due" invoice per active policy that lacks an open
-- invoice. Amount defaults to $100/mo (10000 cents) when premium is 0.
--
-- Idempotent: skips policies that already have a due/pending invoice.

insert into public.invoices (
  user_id,
  policy_id,
  period_label,
  due_date,
  amount_cents,
  status
)
select
  p.user_id,
  p.id,
  'Policy ' || p.policy_number || ' — '
    || to_char(coalesce(p.current_period_start, p.effective_date, current_date), 'FMMonth YYYY'),
  coalesce(p.current_period_start, p.effective_date, current_date::date),
  greatest(
    case when coalesce(p.monthly_premium_cents, 0) > 0
      then p.monthly_premium_cents
      else 10000
    end,
    0
  ),
  'due'
from public.policies p
where p.status = 'active'
  and not exists (
    select 1
      from public.invoices i
     where i.policy_id = p.id
       and i.status in ('due', 'pending')
  );
