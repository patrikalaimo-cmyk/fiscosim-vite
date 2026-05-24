-- FINAL-COMMIT-06A.19
-- Bootstrap locale: materializza tabelle contabili/fiscali base richieste da RLS/scope.
-- Non e runtime commit e non applica seed.

create table if not exists public.causali_contabili (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  codice text,
  descrizione text,
  tipo text,
  attiva boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.causali_contabili is 'Bootstrap locale FiscoSim: tabella base causali contabili materializzata nel grafo migration. Non e runtime commit.';

create table if not exists public.causali_iva (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  codice text,
  descrizione text,
  aliquota numeric(5, 2),
  natura text,
  detraibilita numeric(5, 2),
  attiva boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.causali_iva is 'Bootstrap locale FiscoSim: tabella base causali IVA materializzata nel grafo migration. Non e runtime commit.';

create table if not exists public.percipienti (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  codice_fiscale text,
  partita_iva text,
  denominazione text,
  nome text,
  cognome text,
  indirizzo text,
  cap text,
  citta text,
  provincia text,
  causale_770 text,
  attivo boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.percipienti is 'Bootstrap locale FiscoSim: tabella base percipienti materializzata nel grafo migration. Non e runtime commit.';