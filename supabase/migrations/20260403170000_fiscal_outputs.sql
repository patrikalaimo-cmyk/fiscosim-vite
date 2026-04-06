-- Output fiscali generati da liquidazione IVA, partitari, ecc. (adempimenti / chiusura ciclo).

create table if not exists public.fiscal_outputs (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  liquidazione_iva_id uuid references public.liquidazione_iva (id) on delete set null,
  periodo_inizio date,
  periodo_fine date,
  payload jsonb not null default '{}'::jsonb,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint fiscal_outputs_tipo_check check (
    tipo in ('LIPE', 'F24_IVA', 'SCADENZARIO', 'CU', 'DICHIARAZIONE_770')
  )
);

create index if not exists idx_fiscal_outputs_tipo on public.fiscal_outputs (tipo);
create index if not exists idx_fiscal_outputs_liquidazione on public.fiscal_outputs (liquidazione_iva_id);
create index if not exists idx_fiscal_outputs_created on public.fiscal_outputs (created_at desc);

comment on table public.fiscal_outputs is 'Output fiscali (LIPE, F24, scadenzario, base CU/770) collegati alla liquidazione e ai partitari';

grant select, insert, update, delete on table public.fiscal_outputs to anon, authenticated;
