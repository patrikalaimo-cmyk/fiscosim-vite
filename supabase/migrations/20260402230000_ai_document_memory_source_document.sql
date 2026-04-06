alter table public.ai_document_memory
  add column if not exists source_document_id text;

create index if not exists idx_ai_document_memory_source_document_id
  on public.ai_document_memory (source_document_id)
  where source_document_id is not null;

comment on column public.ai_document_memory.source_document_id is 'Documento (es. documenti_import) da cui provengono le correzioni operatore';
