-- Migration additiva per Stampa Definitiva e Blocco Periodo - Fase 13D-B1
-- Timestamp: 20260621002000
-- Questa migration NON viene applicata automaticamente al database remoto in questa fase (PROPOSTA).

-- =========================================================================
-- 1. CREAZIONE DELLA TABELLA stampe_definitive
-- =========================================================================
create table if not exists public.stampe_definitive (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid not null references public.societa(id) on delete restrict,
  tipo_stampa text not null,
  anno_fiscale integer not null,
  periodo_inizio date not null,
  periodo_fine date not null,
  pagina_iniziale integer not null default 1,
  pagina_finale integer,
  riga_iniziale bigint,
  riga_finale bigint,
  totale_dare numeric(15, 2) not null default 0,
  totale_avere numeric(15, 2) not null default 0,
  totale_imponibile numeric(15, 2) not null default 0,
  totale_iva numeric(15, 2) not null default 0,
  totale_complessivo numeric(15, 2) not null default 0,
  checksum text not null,
  stato text not null default 'valida',
  creato_at timestamptz not null default now(),
  creato_by uuid references public.utenti_studio(id) on delete set null,
  motivo text,
  metadata jsonb not null default '{}'::jsonb,
  
  -- Vincoli di controllo (Check Constraints)
  constraint check_tipo_stampa check (tipo_stampa in ('giornale', 'registro_iva_acquisti', 'registro_iva_vendite', 'registro_iva_corrispettivi')),
  constraint check_stato check (stato in ('valida', 'annullata_ristampa', 'riaperta'))
);

comment on table public.stampe_definitive is 'Registro formale e storico delle stampe definitive ed eventi di consolidamento Libro Giornale e Registri IVA.';
comment on column public.stampe_definitive.checksum is 'Hash crittografico o firma di validità calcolata sulle righe stampate per garantirne l''inalterabilità.';
comment on column public.stampe_definitive.stato is 'Stato del consolidamento: valida (attiva), annullata_ristampa (superata da correzione e ristampa), riaperta (sbloccata temporaneamente).';

-- =========================================================================
-- 2. ESTENSIONE DI public.prima_nota CON LE COLONNE DI STAMPA DEFINITIVA
-- =========================================================================
alter table public.prima_nota
  add column if not exists stampa_giornale_id uuid references public.stampe_definitive(id) on delete restrict,
  add column if not exists giornale_pagina integer,
  add column if not exists giornale_riga_progressivo bigint;

comment on column public.prima_nota.stampa_giornale_id is 'Riferimento all''evento di stampa definitiva del Libro Giornale in cui questo record è consolidato.';
comment on column public.prima_nota.giornale_pagina is 'Numero di pagina del Libro Giornale ufficiale in cui la registrazione è stata stampata.';
comment on column public.prima_nota.giornale_riga_progressivo is 'Progressivo riga cumulativo iniziale all''interno della stampa definitiva del Libro Giornale per l''esercizio.';

-- =========================================================================
-- 3. ESTENSIONE DI public.registri_iva CON LE COLONNE DI STAMPA DEFINITIVA
-- =========================================================================
alter table public.registri_iva
  add column if not exists stampa_iva_id uuid references public.stampe_definitive(id) on delete restrict,
  add column if not exists registro_pagina integer,
  add column if not exists registro_protocollo_definitivo text;

comment on column public.registri_iva.stampa_iva_id is 'Riferimento all''evento di stampa definitiva del Registro IVA in cui questa riga è consolidata.';
comment on column public.registri_iva.registro_pagina is 'Numero di pagina del Registro IVA ufficiale in cui la riga è stata stampata.';
comment on column public.registri_iva.registro_protocollo_definitivo is 'Protocollo definitivo inalterabile assegnato all''atto del consolidamento della stampa.';

-- =========================================================================
-- 4. INDICI DI OTTIMIZZAZIONE E INTEGRITÀ
-- =========================================================================
create index if not exists idx_stampe_definitive_societa_tipo_anno
  on public.stampe_definitive (societa_id, tipo_stampa, anno_fiscale);

create index if not exists idx_prima_nota_stampa_giornale_id
  on public.prima_nota (stampa_giornale_id)
  where stampa_giornale_id is not null;

create index if not exists idx_registri_iva_stampa_iva_id
  on public.registri_iva (stampa_iva_id)
  where stampa_iva_id is not null;

-- =========================================================================
-- 5. ABILITAZIONE ROW LEVEL SECURITY (RLS) E PRIVILEGI
-- =========================================================================
alter table public.stampe_definitive enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies 
    where tablename = 'stampe_definitive' and policyname = 'stampe_definitive_policy'
  ) then
    create policy stampe_definitive_policy on public.stampe_definitive
      for all
      using (public.user_has_societa_access(societa_id))
      with check (public.user_has_societa_access(societa_id));
  end if;
end $$;

grant select, insert, update, delete on table public.stampe_definitive to anon, authenticated;
