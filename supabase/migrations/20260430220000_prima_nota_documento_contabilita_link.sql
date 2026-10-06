-- Migration: P7-WRITE1B/C prerequisite
-- Aggiunge collegamento diretto prima_nota -> documenti_contabilita
-- Idempotente: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS

alter table public.prima_nota
  add column if not exists documento_contabilita_id uuid
    references public.documenti_contabilita(id);

create index if not exists idx_prima_nota_documento_contabilita_id
  on public.prima_nota(documento_contabilita_id);
