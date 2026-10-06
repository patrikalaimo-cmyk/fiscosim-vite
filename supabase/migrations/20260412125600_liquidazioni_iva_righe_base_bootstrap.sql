-- FINAL-COMMIT-06A.22
-- Bootstrap locale: materializza public.liquidazioni_iva_righe prima della chain RLS/policy.
-- Non e runtime commit e non applica seed.

create table if not exists public.liquidazioni_iva_righe (
  id uuid primary key default gen_random_uuid(),
  liquidazione_id uuid,
  societa_id uuid,
  tipo text not null,
  descrizione text,
  registro text,
  periodo text,
  aliquota numeric(5,2) not null default 22,
  natura text,
  imponibile numeric(12,2) not null default 0,
  imposta numeric(12,2) not null default 0,
  iva_debito numeric(12,2) not null default 0,
  iva_credito numeric(12,2) not null default 0,
  data_documento date,
  numero_documento text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.liquidazioni_iva_righe is 'Bootstrap locale FiscoSim: tabella base righe liquidazione IVA materializzata nel grafo migration. Non e runtime commit.';