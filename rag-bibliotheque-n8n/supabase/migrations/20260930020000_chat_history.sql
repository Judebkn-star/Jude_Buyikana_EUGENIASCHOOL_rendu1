-- Mémoire du chat (workflow C), au format LangChain : message = {"type": "human"|"ai", "data": {"content": "..."}}
create table if not exists public.n8n_chat_histories (
  id         serial primary key,
  session_id varchar(255) not null,
  message    jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists n8n_chat_histories_session_idx on public.n8n_chat_histories (session_id, id);
alter table public.n8n_chat_histories enable row level security;
