alter table public.registri_iva
  add column if not exists split_payment boolean not null default false;

create index if not exists idx_registri_iva_split_payment
  on public.registri_iva(split_payment);
