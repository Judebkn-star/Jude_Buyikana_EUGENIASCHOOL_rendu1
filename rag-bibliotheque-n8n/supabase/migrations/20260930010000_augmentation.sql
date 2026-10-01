-- Sortie de l'augmentation Gemini (workflow B). Pour une fiche de loi, elle sert de contexte aux chunks de cette loi.
alter table public.chunks add column augmentation jsonb;
create unique index documents_chunk_id_uniq on public.documents ((metadata ->> 'chunk_id'));
drop index if exists public.documents_chunk_id_idx;
