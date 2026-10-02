-- Préfixe plus prudent : seulement pour les mots de 6 lettres et plus, en ne retirant qu'une lettre
-- (« ethiques » → ethique:*, « algorithmiques » → algorithmique:*). Un mot court reste exact :
-- avant, « marche » devenait marc:* et accrochait « Marcel » ou « marcher ».
-- Retire aussi search_documents, remplacée par search_hybrid et plus appelée nulle part.

drop function if exists public.search_documents(text, int, jsonb);

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
                  select string_agg(
                           case when length(k) >= 6 then left(public.f_unaccent(k), length(k) - 1) || ':*'
                                else public.f_unaccent(k) end, ' | ')
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
