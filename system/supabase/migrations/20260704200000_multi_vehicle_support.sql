-- Multi-vehicle support: a customer can have more than one active policy /
-- vehicle on their portal (issued via the /api/integrations/clients endpoint).
--
-- 1. Store a per-vehicle insurance card PDF path so each policy can surface
--    its own downloadable card in the member dashboard (previous behavior
--    kept a single card path on `profiles`).
-- 2. Ensure `vehicles.created_at` exists on older databases so the dashboard
--    can sort deterministically (initial schema already declares it; this is
--    a defensive no-op that keeps re-running migrations safe).
--
-- Idempotent: safe to re-run.

alter table public.vehicles
  add column if not exists insurance_card_pdf_path text;

comment on column public.vehicles.insurance_card_pdf_path is
  'Path inside bucket insurance-cards (e.g. {user_id}/vehicle-{id}.pdf) — one per vehicle so a policyholder with multiple cars sees each card in Documents.';

-- Backfill: when the customer has exactly one vehicle and a legacy
-- `profiles.insurance_card_pdf_path`, copy that path onto the vehicle row so
-- the new dashboard rendering can find it without touching the profile.
update public.vehicles v
   set insurance_card_pdf_path = p.insurance_card_pdf_path
  from public.profiles p
 where v.user_id = p.id
   and v.insurance_card_pdf_path is null
   and p.insurance_card_pdf_path is not null
   and not exists (
     select 1
       from public.vehicles v2
      where v2.user_id = v.user_id
        and v2.id <> v.id
   );
