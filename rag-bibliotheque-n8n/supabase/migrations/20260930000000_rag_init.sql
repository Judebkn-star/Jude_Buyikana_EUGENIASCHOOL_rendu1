-- RAG « Les 48 lois du pouvoir » : schéma initial
-- gemini-embedding-001 (défaut du nœud n8n) renvoie 3072 dimensions, sans réglage possible.
-- Pas d'index vectoriel : ~700 lignes, un scan exact reste en millisecondes
-- (HNSW sur `vector` est limité à 2000 dimensions).

create extension if not exists vector with schema extensions;

-- File d'attente de l'ingestion.
-- Workflow A (formulaire) insère en `pending`, workflow B (planifié) augmente, vectorise et passe en `done`.
create table public.chunks (
  chunk_id     text primary key,                 -- stable : ex. "loi-15/violation/2", "loi-15/summary"
  kind         text not null check (kind in ('section', 'law_summary', 'front_matter', 'back_matter')),
  law_number   int check (law_number between 1 and 48),
  law_title    text,
  section      text,
  chunk_index  int not null default 0,
  page_start   int,
  page_end     int,
  content      text not null,                    -- texte brut nettoyé (sert aux citations)
  status       text not null default 'pending' check (status in ('pending', 'processing', 'done', 'error')),
  attempts     int not null default 0,
  last_error   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index chunks_status_idx on public.chunks (status, kind);

-- Store vectoriel au format attendu par le nœud Supabase Vector Store (LangChain).
-- content = texte vectorisé (contexte + chunk) ; metadata porte chunk_id, loi, section, pages,
-- raw_text (chunk brut pour la citation), people, keywords, questions.
create table public.documents (
  id         bigserial primary key,
  content    text,
  metadata   jsonb,
  embedding  extensions.vector(3072)
);

create index documents_chunk_id_idx on public.documents ((metadata ->> 'chunk_id'));

-- Signature attendue par LangChain : (query_embedding, match_count, filter)
create or replace function public.match_documents (
  query_embedding extensions.vector(3072),
  match_count int default null,
  filter jsonb default '{}'
) returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
set search_path = public, extensions
as $$
  select
    d.id,
    d.content,
    d.metadata,
    1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where d.metadata @> filter
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

-- Accès uniquement via service_role (qui contourne RLS). anon ne voit rien.
alter table public.chunks enable row level security;
alter table public.documents enable row level security;
