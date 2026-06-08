alter table if exists public.causali_contabili
  add column if not exists conto_iva_split_payment text;
