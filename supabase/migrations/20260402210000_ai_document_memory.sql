-- Memoria documenti AI: parsing + accounting per fornitore/layout (base esperienza / RAG leggero)
create table if not exists public.ai_document_memory (
  id uuid primary key default gen_random_uuid(),
  fornitore_nome text,
  partita_iva text,
  layout_hash text,
  preprocessed_text text,
  parsing_result jsonb not null default '{}'::jsonb,
  accounting_result jsonb not null default '{}'::jsonb,
  operatore_corrections jsonb,
  created_at timestamptz not null default now(),
  constraint ai_document_memory_preprocessed_short check (
    preprocessed_text is null or char_length(preprocessed_text) <= 12000
  )
);

create index if not exists idx_ai_document_memory_layout_hash
  on public.ai_document_memory (layout_hash)
  where layout_hash is not null;

create index if not exists idx_ai_document_memory_partita_iva
  on public.ai_document_memory (partita_iva)
  where partita_iva is not null;

comment on table public.ai_document_memory is 'Esperienza parsing + accounting per documenti simili (fornitore, layout_hash, estratti testo)';
comment on column public.ai_document_memory.preprocessed_text is 'Estratto breve del testo preprocessato (per prompt/memoria; max ~12k char)';
comment on column public.ai_document_memory.parsing_result is 'Snapshot JSON esito parsing (ai_parsing_results.json_output o equivalente)';
comment on column public.ai_document_memory.accounting_result is 'Snapshot JSON proposta contabile (righe partita doppia, ecc.)';
comment on column public.ai_document_memory.operatore_corrections is 'Correzioni manuali operatore (nullable)';

grant select, insert, update, delete on table public.ai_document_memory to anon, authenticated;
