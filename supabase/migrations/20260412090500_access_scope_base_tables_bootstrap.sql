-- FINAL-COMMIT-06A.18
-- Bootstrap locale: materializza le tabelle base richieste da access_scope_columns.
-- Non è runtime commit e non applica seed.

create table if not exists public.documenti_import (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  societa_destinazione_id uuid,
  filename text,
  file_path text,
  file_url text,
  mime_type text,
  file_size integer,
  tipo_documento text,
  stato text not null default 'uploaded',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.documenti_import is 'Bootstrap locale FiscoSim: tabella base import documenti materializzata nel grafo migration per supportare access-scope. Non e runtime commit.';

create table if not exists public.revisioni_dichiarativi (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  tipo_dichiarativo text,
  anno integer,
  stato text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.revisioni_dichiarativi is 'Bootstrap locale FiscoSim: tabella base revisioni dichiarativi materializzata nel grafo migration per supportare access-scope. Non e runtime commit.';