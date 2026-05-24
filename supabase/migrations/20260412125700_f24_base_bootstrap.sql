-- FINAL-COMMIT-06A.23
-- Bootstrap locale: materializza public.f24 prima della chain RLS/policy.
-- Non e runtime commit e non applica seed.

create table if not exists public.f24 (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid,
  cliente_nome text,
  data_scadenza date not null,
  data_pagamento date,
  descrizione text not null,
  codice_tributo text,
  anno_riferimento int,
  periodo_riferimento text,
  importo numeric(12,2) not null,
  stato text not null default 'da_pagare',
  note text,
  created_at timestamptz not null default now()
);

comment on table public.f24 is 'Bootstrap locale FiscoSim: tabella base F24 materializzata nel grafo migration. Non e runtime commit.';