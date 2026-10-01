-- Bibliothèque multi-livres (refonte universelle, 01/10/2026).
-- Les 48 lois deviennent le livre n°1 : chunks et vecteurs conservés, rien n'est réingéré.
--   law_number / law_title → chapter_number / chapter_title ; kind law_summary → chapter_summary ;
--   chunk_id préfixé par le slug du livre ; métadonnées des documents alignées.

create table public.books (
  id             serial primary key,
  slug           text not null unique,
  title          text not null,
  author         text,
  language       text not null default 'fr',
  chapter_label  text not null default 'Chapitre',   -- « Loi » pour Greene, « Chapter » pour un livre anglais…
  structure      text,                               -- méthode de découpage : toc | heuristique | taille | specifique
  chapters_found int,
  created_at     timestamptz not null default now()
);
alter table public.books enable row level security;

insert into public.books (id, slug, title, author, language, chapter_label, structure, chapters_found)
values (1, 'les-48-lois-du-pouvoir', 'Les 48 lois du pouvoir', 'Robert Greene', 'fr', 'Loi', 'specifique', 48);
select setval('public.books_id_seq', 1);

-- chunks
alter table public.chunks drop constraint chunks_kind_check;
alter table public.chunks drop constraint chunks_law_number_check;
alter table public.chunks rename column law_number to chapter_number;
alter table public.chunks rename column law_title to chapter_title;
alter table public.chunks add column book_id int references public.books (id) on delete cascade;
update public.chunks set kind = 'chapter_summary' where kind = 'law_summary';
update public.chunks set book_id = 1, chunk_id = 'les-48-lois-du-pouvoir/' || chunk_id;
alter table public.chunks alter column book_id set not null;
alter table public.chunks add constraint chunks_kind_check
  check (kind in ('section', 'chapter_summary', 'front_matter', 'back_matter'));
create index chunks_book_chapter_idx on public.chunks (book_id, chapter_number);

-- documents : mêmes renommages dans les métadonnées
update public.documents d
set metadata = (d.metadata - 'law_number' - 'law_title' - 'kind' - 'chunk_id')
  || jsonb_build_object(
       'book_id', 1,
       'book_title', 'Les 48 lois du pouvoir',
       'book_author', 'Robert Greene',
       'chapter_label', 'Loi',
       'chapter_number', d.metadata -> 'law_number',
       'chapter_title', d.metadata -> 'law_title',
       'kind', case when d.metadata ->> 'kind' = 'law_summary' then 'chapter_summary' else d.metadata ->> 'kind' end,
       'chunk_id', 'les-48-lois-du-pouvoir/' || (d.metadata ->> 'chunk_id'));

-- Recherche filtrable par livre (le chat universel) : vecteur de la question en texte « [0.1, …] »,
-- book_ids = tableau JSON d'identifiants (vide = toute la bibliothèque).
create or replace function public.search_documents (
  query_embedding text,
  match_count int,
  book_ids jsonb default '[]'
) returns table (id bigint, content text, metadata jsonb, similarity float)
language sql stable
set search_path = public, extensions
as $$
  select d.id, d.content, d.metadata, 1 - (d.embedding <=> query_embedding::vector) as similarity
  from public.documents d
  where jsonb_array_length(coalesce(book_ids, '[]')) = 0
     or (d.metadata ->> 'book_id') in (select jsonb_array_elements_text(book_ids))
  order by d.embedding <=> query_embedding::vector
  limit match_count;
$$;
