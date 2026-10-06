-- FINAL-COMMIT-06A.12
-- Bootstrap locale: materializza public.societa prima delle migration RLS/scope.
-- Non è runtime commit e non applica seed.

create table if not exists public.societa (
  id uuid primary key default gen_random_uuid(),
  codice text not null,
  denominazione text not null,
  ragione_sociale text,
  codice_fiscale text,
  partita_iva text,
  indirizzo text,
  cap text,
  citta text,
  provincia text,
  nazione text default 'IT',
  regime_contabile text default 'ordinaria',
  attiva boolean not null default true,
  anno_iva_corrente integer,
  anno_contabile_corrente integer,
  ultimo_protocollo_vendite integer not null default 0,
  ultimo_protocollo_acquisti integer not null default 0,
  ultimo_protocollo_corrispettivi integer not null default 0,
  ultimo_numero_registrazione integer not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (codice)
);

comment on table public.societa is
  'Bootstrap locale FiscoSim: tabella base societa materializzata nel grafo migration per supportare RLS/scope e FK legacy. Non è runtime commit.';
