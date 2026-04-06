-- Partitari: movimenti per soggetto (cliente/fornitore) derivati da accounting_entries.
-- Saldo progressivo = saldo della riga precedente (stesso soggetto) + (dare - avere).
-- Prerequisito: tabella public.clienti (vedi schema.sql radice del repo).

create table if not exists public.partitari (
  id uuid primary key default gen_random_uuid(),
  soggetto_id uuid not null references public.clienti (id) on delete cascade,
  documento_id text not null,
  accounting_entry_id uuid not null references public.accounting_entries (id) on delete cascade,
  data date not null,
  dare numeric(15, 2) not null default 0,
  avere numeric(15, 2) not null default 0,
  saldo_progressivo numeric(15, 2) not null default 0,
  descrizione text,
  created_at timestamptz not null default now(),
  constraint partitari_accounting_entry_id_key unique (accounting_entry_id)
);

create index if not exists idx_partitari_soggetto_data
  on public.partitari (soggetto_id, data desc, created_at desc);

create index if not exists idx_partitari_documento_id
  on public.partitari (documento_id);

comment on table public.partitari is 'Movimenti partitario per cliente/fornitore, allineati a accounting_entries';

grant select, insert, update, delete on table public.partitari to anon, authenticated;
