-- FINAL-COMMIT-06A.21
-- Bootstrap locale: materializza public.regole_automatiche prima della chain RLS.
-- Non e runtime commit e non applica seed.

create table if not exists public.regole_automatiche (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  nome text not null,
  descrizione text,
  condizioni jsonb not null default '{}'::jsonb,
  azioni jsonb not null default '{}'::jsonb,
  priorita integer not null default 100,
  attiva boolean not null default true,
  volte_applicata integer not null default 0,
  ultima_applicazione timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.regole_automatiche is 'Bootstrap locale FiscoSim: tabella base regole automatiche materializzata nel grafo migration. Non e runtime commit.';