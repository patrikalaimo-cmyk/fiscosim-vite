-- Fingerprint layout documento (similitudine strutturale senza numeri)
alter table public.ai_parsing_results
  add column if not exists layout_hash text;

create index if not exists idx_ai_parsing_results_layout_hash
  on public.ai_parsing_results (layout_hash)
  where layout_hash is not null;

comment on column public.ai_parsing_results.layout_hash is 'MD5 layout: prime ~25 righe, senza cifre, spazi normalizzati, lowercase';
