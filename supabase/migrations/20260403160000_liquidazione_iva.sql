-- Liquidazione IVA periodica: totali da registri_iva (IVA a debito vendite, IVA a credito acquisti detraibili).

create table if not exists public.liquidazione_iva (
  id uuid primary key default gen_random_uuid(),
  periodicita text not null,
  anno int not null,
  mese int,
  trimestre int,
  periodo_inizio date not null,
  periodo_fine date not null,
  iva_debito numeric(15, 2) not null default 0,
  iva_credito numeric(15, 2) not null default 0,
  saldo numeric(15, 2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint liquidazione_iva_periodicita_check check (periodicita in ('mensile', 'trimestrale')),
  constraint liquidazione_iva_mese_check check (mese is null or (mese >= 1 and mese <= 12)),
  constraint liquidazione_iva_trimestre_check check (trimestre is null or (trimestre >= 1 and trimestre <= 4))
);

create unique index if not exists liquidazione_iva_unique_mensile
  on public.liquidazione_iva (periodicita, anno, mese)
  where periodicita = 'mensile' and mese is not null;

create unique index if not exists liquidazione_iva_unique_trimestre
  on public.liquidazione_iva (periodicita, anno, trimestre)
  where periodicita = 'trimestrale' and trimestre is not null;

create index if not exists idx_liquidazione_iva_periodo on public.liquidazione_iva (periodo_inizio, periodo_fine);

comment on table public.liquidazione_iva is 'Liquidazione IVA: debito (vendite), credito (acquisti detraibili), saldo periodo';

grant select, insert, update, delete on table public.liquidazione_iva to anon, authenticated;
