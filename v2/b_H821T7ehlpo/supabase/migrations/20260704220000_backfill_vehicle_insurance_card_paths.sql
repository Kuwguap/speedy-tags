-- Backfill per-vehicle insurance card paths for legacy accounts where only
-- `profiles.insurance_card_pdf_path` was set (pre multi-vehicle support).
-- Idempotent: only updates rows that still lack a path.

update public.vehicles v
   set insurance_card_pdf_path = p.insurance_card_pdf_path
  from public.profiles p
 where v.user_id = p.id
   and v.insurance_card_pdf_path is null
   and p.insurance_card_pdf_path is not null
   and p.insurance_card_pdf_path not like '%/vehicle-%'
   and v.id = (
     select v2.id
       from public.vehicles v2
      where v2.user_id = v.user_id
      order by v2.created_at asc
      limit 1
   );

-- Link first-vehicle legacy card on profile when path is vehicle-specific
-- but the matching vehicle row is still empty (second car overwrote profile).
update public.vehicles v
   set insurance_card_pdf_path = p.insurance_card_pdf_path
  from public.profiles p
 where v.user_id = p.id
   and v.insurance_card_pdf_path is null
   and p.insurance_card_pdf_path is not null
   and p.insurance_card_pdf_path like '%/vehicle-' || v.id::text || '%';
