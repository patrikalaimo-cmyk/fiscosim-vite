alter table if exists public.causali_contabili
  add column if not exists righe_prima_nota_template jsonb not null default '[]'::jsonb;

update public.causali_contabili
set righe_prima_nota_template = coalesce(righe_prima_nota_template, '[]'::jsonb)
where righe_prima_nota_template is null;
