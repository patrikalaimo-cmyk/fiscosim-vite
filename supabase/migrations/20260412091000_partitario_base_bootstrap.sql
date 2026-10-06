-- FINAL-COMMIT-06A.16
-- Base bootstrap per materializzare public.partitario singolare nel grafo migration locale.

create table if not exists public.partitario (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  tipo text not null,
  conto_id uuid,
  prima_nota_id uuid,
  numero_documento text,
  data_documento date,
  data_scadenza date,
  importo_originale numeric(15, 2) not null default 0,
  importo_pagato numeric(15, 2) not null default 0,
  importo_residuo numeric(15, 2) not null default 0,
  stato text not null default 'aperta',
  chiusa_da_prima_nota_id uuid,
  data_chiusura date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.partitario is 'Base bootstrap minima per il grafo migration locale del partitario singolare.';