-- Registri IVA: righe per liquidazione (acquisti / vendite), da parsing + accounting_entries.
-- detraibile / percentuale_detraibilità: base per IVA detraibile vs indetraibile.

create table if not exists public.registri_iva (
  id uuid primary key default gen_random_uuid(),
  documento_id text not null,
  accounting_entry_id uuid not null references public.accounting_entries (id) on delete cascade,
  riga_idx int not null default 0,
  data date not null,
  imponibile numeric(15, 2) not null default 0,
  iva numeric(15, 2) not null default 0,
  aliquota numeric(7, 2),
  tipo text not null,
  detraibile boolean not null default true,
  percentuale_detraibilita numeric(5, 2) not null default 100,
  iva_detraibile numeric(15, 2) not null default 0,
  iva_indetraibile numeric(15, 2) not null default 0,
  causale_iva_id uuid,
  created_at timestamptz not null default now(),
  constraint registri_iva_tipo_check check (tipo in ('acquisto', 'vendita')),
  constraint registri_iva_entry_riga unique (accounting_entry_id, riga_idx)
);

create index if not exists idx_registri_iva_documento on public.registri_iva (documento_id);
create index if not exists idx_registri_iva_data on public.registri_iva (data);
create index if not exists idx_registri_iva_tipo on public.registri_iva (tipo);

comment on table public.registri_iva is 'Righe IVA per documento (da parsing + scritture); base liquidazione IVA';

grant select, insert, update, delete on table public.registri_iva to anon, authenticated;
