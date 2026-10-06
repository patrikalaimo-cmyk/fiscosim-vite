-- Collega le ritenute alla registrazione contabile e rende persistenti
-- i dati minimi per scadenzario F24 e aggregazioni CU/770.

create table if not exists public.ritenute_dacconto (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid references public.societa(id),
  percipiente_cf text,
  percipiente_denominazione text,
  data_pagamento date,
  compenso_lordo numeric(15, 2) not null default 0,
  ritenuta numeric(15, 2) not null default 0,
  compenso_netto numeric(15, 2) not null default 0,
  causale text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.ritenute_dacconto
  add column if not exists prima_nota_id uuid references public.prima_nota(id),
  add column if not exists partitario_id uuid references public.partitario(id),
  add column if not exists percipiente_id uuid references public.percipienti(id),
  add column if not exists data_documento date,
  add column if not exists numero_documento text,
  add column if not exists imponibile_ritenuta numeric(15, 2),
  add column if not exists aliquota_ritenuta numeric(7, 4),
  add column if not exists importo_ritenuta numeric(15, 2),
  add column if not exists contributo_cassa_prev numeric(15, 2),
  add column if not exists stato text default 'aperta',
  add column if not exists data_scadenza date,
  add column if not exists codice_tributo text default '1040',
  add column if not exists periodo_riferimento text,
  add column if not exists anno_riferimento integer,
  add column if not exists causale_prestazione text,
  add column if not exists inclusa_cu boolean default true;

create index if not exists idx_ritenute_dacconto_prima_nota
  on public.ritenute_dacconto(prima_nota_id);

create index if not exists idx_ritenute_dacconto_partitario
  on public.ritenute_dacconto(partitario_id);

create index if not exists idx_ritenute_dacconto_percipiente
  on public.ritenute_dacconto(percipiente_id);

create index if not exists idx_ritenute_dacconto_scadenza
  on public.ritenute_dacconto(societa_id, stato, data_scadenza);

alter table public.ritenute_dacconto enable row level security;

drop policy if exists societa_scoped_ritenute_dacconto on public.ritenute_dacconto;
create policy societa_scoped_ritenute_dacconto on public.ritenute_dacconto
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));
