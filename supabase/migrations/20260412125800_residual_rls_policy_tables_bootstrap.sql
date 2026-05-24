-- FINAL-COMMIT-06A.24
-- Bootstrap locale: materializza le tabelle residue usate dalla chain RLS/policy.
-- Non e runtime commit e non applica seed.

create table if not exists public.beni_ammortizzabili (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid,
  cliente_nome text,
  descrizione text not null,
  categoria text,
  data_acquisto date not null,
  costo_storico numeric(12,2) not null,
  aliquota_ammortamento numeric(5,2) not null,
  fondo_ammortamento numeric(12,2) default 0,
  valore_residuo numeric(12,2),
  anni_vita_utile int,
  note text,
  attivo boolean default true,
  created_at timestamptz default now()
);

create table if not exists public.quote_ammortamento (
  id uuid primary key default gen_random_uuid(),
  bene_id uuid,
  anno int not null,
  quota_annua numeric(12,2) not null,
  fondo_progressivo numeric(12,2) not null,
  valore_residuo numeric(12,2) not null,
  unique (bene_id, anno)
);

comment on table public.beni_ammortizzabili is 'Bootstrap locale FiscoSim: tabella base beni ammortizzabili materializzata nel grafo migration. Non e runtime commit.';
comment on table public.quote_ammortamento is 'Bootstrap locale FiscoSim: tabella base quote ammortamento materializzata nel grafo migration. Non e runtime commit.';