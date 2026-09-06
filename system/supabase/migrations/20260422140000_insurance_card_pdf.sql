-- Insurance card PDFs in Storage + profile pointer

alter table public.profiles
  add column if not exists insurance_card_pdf_path text;

comment on column public.profiles.insurance_card_pdf_path is 'Path inside bucket insurance-cards, e.g. {user_id}/insurance-card.pdf';

-- Private bucket for PDFs (admins upload via service role; users read own files via RLS)
insert into storage.buckets (id, name, public)
values ('insurance-cards', 'insurance-cards', false)
on conflict (id) do nothing;

-- Authenticated users can read objects whose first path segment is their auth uid
drop policy if exists "Insurance cards read own" on storage.objects;

create policy "Insurance cards read own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'insurance-cards'
    and split_part(name, '/', 1) = auth.uid()::text
  );
