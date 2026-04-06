-- Upsert memoria per layout_hash + contatore pipeline (throttle ogni N run)
alter table public.ai_document_memory
  add column if not exists updated_at timestamptz not null default now();

-- Sostituisce indice non-unique con vincolo unico per onConflict PostgREST
drop index if exists public.idx_ai_document_memory_layout_hash;

create unique index if not exists ai_document_memory_layout_hash_unique
  on public.ai_document_memory (layout_hash)
  where layout_hash is not null;

create table if not exists public.ai_pipeline_counter (
  id smallint primary key default 1,
  completed bigint not null default 0
);

insert into public.ai_pipeline_counter (id, completed)
values (1, 0)
on conflict (id) do nothing;

comment on table public.ai_pipeline_counter is 'Contatore pipeline completate (throttle salvataggio ai_document_memory)';
grant select, insert, update, delete on table public.ai_pipeline_counter to anon, authenticated;
