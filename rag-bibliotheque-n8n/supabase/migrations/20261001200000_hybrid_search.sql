-- Recherche hybride : classement vectoriel + classement plein texte, fusionnés par Reciprocal Rank Fusion (RRF).
-- Le plein texte attrape ce que les vecteurs ratent : noms propres, termes rares, mots exacts (« Talleyrand », « Vaux-le-Vicomte »).
-- Configuration 'simple' + sans accents : pas de racinisation ni de stopwords propres à une langue, la bibliothèque mélange FR et EN
-- (les stopwords sont retirés côté requête, dans le workflow C).

create extension if not exists unaccent with schema extensions;

-- unaccent() n'est pas déclarée immutable : cette enveloppe permet de l'utiliser dans une colonne générée.
create or replace function public.f_unaccent(text) returns text
language sql immutable parallel safe strict
set search_path = public, extensions
as $$ select extensions.unaccent('extensions.unaccent', $1) $$;

-- Texte indexé : le texte brut du morceau (raw_text) plutôt que le texte vectorisé (qui répète titre et contexte).
alter table public.documents
  add column fts tsvector generated always as (
    to_tsvector('simple', public.f_unaccent(coalesce(metadata ->> 'raw_text', content, '')))
  ) stored;
create index documents_fts_idx on public.documents using gin (fts);

-- keywords : tableau JSON de mots déjà nettoyés (minuscules, lettres et chiffres) ; [] = recherche vectorielle seule.
-- book_ids  : tableau JSON d'identifiants de livres ; [] = toute la bibliothèque.
create or replace function public.search_hybrid (
  query_embedding text,
  keywords jsonb,
  match_count int,
  book_ids jsonb default '[]'
) returns table (id bigint, content text, metadata jsonb, similarity float, rrf float, vector_rank int, keyword_rank int)
language sql stable
set search_path = public, extensions
as $$
  with q as (
    select query_embedding::vector as emb,
           case when jsonb_array_length(coalesce(keywords, '[]')) = 0 then null
                else to_tsquery('simple', (
                  select string_agg(public.f_unaccent(k), ' | ')
                  from jsonb_array_elements_text(keywords) k
                  where k ~ '^[[:alnum:]]+$'))
           end as tsq
  ), pool as (
    select d.* from public.documents d
    where jsonb_array_length(coalesce(book_ids, '[]')) = 0
       or (d.metadata ->> 'book_id') in (select jsonb_array_elements_text(book_ids))
  ), vec as (
    select p.id, row_number() over (order by p.embedding <=> q.emb) as r
    from pool p, q
    order by p.embedding <=> q.emb
    limit 40
  ), kw as (
    select p.id, row_number() over (order by ts_rank_cd(p.fts, q.tsq) desc, p.id) as r
    from pool p, q
    where q.tsq is not null and p.fts @@ q.tsq
    order by ts_rank_cd(p.fts, q.tsq) desc, p.id
    limit 40
  ), fused as (
    select coalesce(v.id, k.id) as id,
           coalesce(1.0 / (60 + v.r), 0) + coalesce(1.0 / (60 + k.r), 0) as rrf,
           v.r as vr, k.r as kr
    from vec v full join kw k on k.id = v.id
  )
  select d.id, d.content, d.metadata, 1 - (d.embedding <=> q.emb) as similarity, f.rrf, f.vr::int, f.kr::int
  from fused f join public.documents d on d.id = f.id, q
  order by f.rrf desc
  limit match_count;
$$;
