-- FINAL-COMMIT-06A.14
-- Bootstrap locale: materializza public.documenti_contabilita prima della migration di access-scope.
-- Non è runtime commit e non applica seed.

create table if not exists public.documenti_contabilita (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  filename text not null,
  file_path text,
  file_url text,
  mime_type text,
  file_size integer,
  tipo_documento text,
  numero_documento text,
  data_documento date,
  soggetto_denominazione text,
  soggetto_piva text,
  soggetto_cf text,
  soggetto_tipo text,
  imponibile numeric(15,2) not null default 0,
  iva numeric(15,2) not null default 0,
  totale numeric(15,2) not null default 0,
  conto_id uuid,
  conto_match_type text,
  workflow_status text not null default 'imported',
  validation_status text not null default 'pending',
  ai_confidence numeric(3,2),
  ai_processed_at timestamptz,
  validated_by uuid,
  validated_at timestamptz,
  note_operatore text,
  prima_nota_id uuid,
  registered_at timestamptz,
  bulk_operation_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_doc_cont_societa
  on public.documenti_contabilita (societa_id);

create index if not exists idx_doc_cont_workflow
  on public.documenti_contabilita (workflow_status);

create index if not exists idx_doc_cont_validation
  on public.documenti_contabilita (validation_status);

create index if not exists idx_doc_cont_prima_nota
  on public.documenti_contabilita (prima_nota_id);

comment on table public.documenti_contabilita is
  'Bootstrap locale FiscoSim: tabella base documenti_contabilita materializzata nel grafo migration prima della access-scope. Non è runtime commit.';
