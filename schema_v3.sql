-- ============================================================
-- FISCOSIM v3 – Schema esteso (esegui DOPO lo schema base)
-- Incolla nel SQL Editor di Supabase ed esegui
-- ============================================================

-- UTENTI STUDIO
create table if not exists utenti_studio (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cognome text,
  email text unique not null,
  ruolo text default 'collaboratore', -- owner | admin | collaboratore
  attivo boolean default true,
  created_at timestamptz default now()
);

-- Inserisci Patrik come owner
insert into utenti_studio (nome, cognome, email, ruolo) values
('Patrik', 'Alaimo', 'Patrik.alaimo@gmail.com', 'owner')
on conflict (email) do nothing;

-- LIQUIDAZIONI IVA
create table if not exists liquidazioni_iva (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clienti(id) on delete set null,
  cliente_nome text,
  periodo text not null,        -- es. "Q1 2025", "Gennaio 2025"
  tipo_periodo text default 'trimestrale', -- trimestrale | mensile
  anno int not null,
  trimestre int,                -- 1-4
  mese int,                     -- 1-12
  iva_vendite numeric(12,2) default 0,
  iva_acquisti numeric(12,2) default 0,
  iva_saldo numeric(12,2) default 0,      -- vendite - acquisti
  iva_precedente numeric(12,2) default 0, -- credito periodo precedente
  iva_dovuta numeric(12,2) default 0,     -- saldo - precedente (se > 0)
  iva_credito numeric(12,2) default 0,    -- se saldo < 0
  note text,
  stato text default 'bozza',   -- bozza | confermata | inviata
  pdf_estratto jsonb,           -- dati estratti da Claude AI
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RIGHE LIQUIDAZIONE IVA (dettaglio)
create table if not exists liquidazioni_iva_righe (
  id uuid default gen_random_uuid() primary key,
  liquidazione_id uuid references liquidazioni_iva(id) on delete cascade,
  tipo text not null,           -- vendita | acquisto
  descrizione text,
  imponibile numeric(12,2) default 0,
  aliquota numeric(5,2) default 22,
  iva numeric(12,2) default 0,
  data_documento date,
  numero_documento text
);

-- GESTIONE F24
create table if not exists f24 (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clienti(id) on delete set null,
  cliente_nome text,
  data_scadenza date not null,
  data_pagamento date,
  descrizione text not null,
  codice_tributo text,
  anno_riferimento int,
  periodo_riferimento text,
  importo numeric(12,2) not null,
  stato text default 'da_pagare', -- da_pagare | pagato | annullato
  note text,
  created_at timestamptz default now()
);

-- BENI AMMORTIZZABILI
create table if not exists beni_ammortizzabili (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clienti(id) on delete set null,
  cliente_nome text,
  descrizione text not null,
  categoria text,               -- es. "Attrezzatura", "Veicoli", "Software"
  data_acquisto date not null,
  costo_storico numeric(12,2) not null,
  aliquota_ammortamento numeric(5,2) not null, -- percentuale annua
  fondo_ammortamento numeric(12,2) default 0,
  valore_residuo numeric(12,2),
  anni_vita_utile int,
  note text,
  attivo boolean default true,
  created_at timestamptz default now()
);

-- QUOTE AMMORTAMENTO (righe annuali)
create table if not exists quote_ammortamento (
  id uuid default gen_random_uuid() primary key,
  bene_id uuid references beni_ammortizzabili(id) on delete cascade,
  anno int not null,
  quota_annua numeric(12,2) not null,
  fondo_progressivo numeric(12,2) not null,
  valore_residuo numeric(12,2) not null,
  unique(bene_id, anno)
);

-- ============================================================
-- RLS POLICIES per le nuove tabelle
-- ============================================================
alter table utenti_studio enable row level security;
alter table liquidazioni_iva enable row level security;
alter table liquidazioni_iva_righe enable row level security;
alter table f24 enable row level security;
alter table beni_ammortizzabili enable row level security;
alter table quote_ammortamento enable row level security;

create policy "allow_all_utenti" on utenti_studio for all using (true) with check (true);
create policy "allow_all_liq" on liquidazioni_iva for all using (true) with check (true);
create policy "allow_all_liq_righe" on liquidazioni_iva_righe for all using (true) with check (true);
create policy "allow_all_f24" on f24 for all using (true) with check (true);
create policy "allow_all_beni" on beni_ammortizzabili for all using (true) with check (true);
create policy "allow_all_quote" on quote_ammortamento for all using (true) with check (true);

-- ============================================================
-- DATI ESEMPIO F24
-- ============================================================
insert into f24 (cliente_nome, data_scadenza, descrizione, codice_tributo, anno_riferimento, importo, stato) values
('Studio Envisioning Srl', '2025-03-16', 'Tassa Concessione Governativa', '7085', 2025, 309.87, 'da_pagare'),
('Studio Envisioning Srl', '2025-06-30', 'IRES Saldo 2024 + 1° Acconto 2025', '2003', 2024, 0, 'da_pagare'),
('Studio Envisioning Srl', '2025-11-30', 'IRES 2° Acconto 2025', '2002', 2025, 0, 'da_pagare');

-- ============================================================
-- AGGIORNAMENTO: colonna moduli_attivi su clienti
-- Esegui questo se hai già la tabella clienti esistente
-- ============================================================
alter table clienti add column if not exists moduli_attivi text[] 
  default array['iva','f24','ammortamenti','adempimenti','simulatore'];

-- ============================================================
-- F24 TABELLONE (da v4.2p) 
-- ============================================================
-- Scadenze F24
create table if not exists f24_scadenze (
  id uuid default gen_random_uuid() primary key,
  label text not null,
  data_scadenza date not null,
  stato text not null default 'aperta' check (stato in ('aperta','chiusa')),
  created_at timestamptz default now()
);

-- Righe F24 (una per cliente per scadenza)
create table if not exists f24_righe (
  id uuid default gen_random_uuid() primary key,
  scadenza_id uuid references f24_scadenze(id) on delete cascade,
  client_id uuid references clienti(id) on delete cascade,
  iva_rate numeric default 0,
  iva_corrente numeric default 0,
  ritenute_dipendenti numeric default 0,
  ritenute_autonomi numeric default 0,
  altre_ritenute numeric default 0,
  agecon_36bis numeric default 0,
  cciaa_separata numeric default 0,
  inps_ca numeric default 0,
  imposte numeric default 0,
  cciaa_red2024 numeric default 0,
  tcg_altri numeric default 0,
  ravvedimenti numeric default 0,
  crediti_compensazione numeric default 0,
  f24_zero boolean default false,
  num_f24 integer default 0,
  check_autonomi boolean default false,
  check_dipendenti boolean default false,
  protocollo text,
  stato_invio text not null default 'bozza' check (stato_invio in ('bozza','ok','inviato')),
  note text,
  updated_at timestamptz default now(),
  created_at timestamptz default now(),
  unique(scadenza_id, client_id)
);

alter table f24_scadenze enable row level security;
alter table f24_righe enable row level security;
create policy "allow_all_f24_scadenze" on f24_scadenze for all using (true) with check (true);
create policy "allow_all_f24_righe" on f24_righe for all using (true) with check (true);

-- ============================================================
-- PERMESSI COLLABORATORI
-- ============================================================
alter table utenti_studio add column if not exists permessi jsonb default '{}';

-- ============================================================
-- CLIENTI ASSEGNATI AI COLLABORATORI
-- ============================================================
alter table utenti_studio add column if not exists clienti_assegnati uuid[] default array[]::uuid[];

-- ============================================================
-- DELEGHE UNICHE
-- ============================================================
create table if not exists deleghe_uniche (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clienti(id) on delete cascade,
  data_delega date,
  data_scadenza date not null,  -- 31/12/(anno_delega + 4)
  note text,
  attivo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(cliente_id)  -- una delega per cliente
);

alter table deleghe_uniche enable row level security;
create policy "allow_all_deleghe" on deleghe_uniche for all using (true) with check (true);

-- ============================================================
-- RICHIESTE FATTURE ELETTRONICHE ADE
-- ============================================================
create table if not exists richieste_fatture (
  id uuid default gen_random_uuid() primary key,
  tipo_richiesta text not null,  -- FATT_EMESSE | FATT_RICEVUTE | FE_DISPOSIZIONE | CORR | RICE
  data_da date not null,
  data_a date not null,
  flusso text default 'ALL',     -- ALL | FatturaB2B | FatturaPA
  tipo_ricerca text default 'COMPLETA',
  piva_studio text,              -- P.IVA utenza di lavoro
  clienti_ids uuid[],            -- clienti inclusi nella richiesta
  xml_generato text,             -- contenuto XML da inviare ad ADE
  stato text default 'generata', -- generata | inviata | completata | scaricata
  note text,
  created_by uuid references utenti_studio(id),
  created_at timestamptz default now()
);

alter table richieste_fatture enable row level security;
create policy "allow_all_richieste_fatture" on richieste_fatture for all using (true) with check (true);

-- Campo responsabile su clienti (utente studio di riferimento)
alter table clienti add column if not exists responsabile_id uuid references utenti_studio(id) on delete set null;

-- ============================================================
-- IMPOSTAZIONI STUDIO
-- ============================================================
create table if not exists impostazioni_studio (
  id uuid default gen_random_uuid() primary key,
  chiave text unique not null,
  valore text,
  updated_at timestamptz default now()
);
alter table impostazioni_studio enable row level security;
create policy "allow_all_impostazioni" on impostazioni_studio for all using (true) with check (true);

-- Valori iniziali
insert into impostazioni_studio (chiave, valore) values
  ('titolare_nome', ''),
  ('titolare_cognome', ''),
  ('titolare_cf', ''),
  ('titolare_piva', ''),
  ('studio_nome', 'Studio Envisioning Srl'),
  ('studio_piva', '')
on conflict (chiave) do nothing;

-- ============================================================
-- AGECON - Gestione Avvisi ADE / Riscossione
-- ============================================================
create table if not exists agecon (
  id uuid default gen_random_uuid() primary key,
  cliente_id uuid references clienti(id) on delete set null,
  cliente_nome text,
  tipo_avviso text not null default 'comunicazione', 
  -- comunicazione | accertamento | cartella | avviso_bonario | 36bis | 54bis | altro
  numero_atto text,
  anno_imposta int,
  tributo text, -- es. IRPEF, IVA, IRAP, INPS
  importo numeric(12,2) default 0,
  importo_sanzioni numeric(12,2) default 0,
  importo_interessi numeric(12,2) default 0,
  importo_totale numeric(12,2) default 0,
  data_ricezione date not null,
  data_scadenza date, -- default +60gg da ricezione
  stato text default 'aperto', 
  -- aperto | in_lavorazione | definito | sospeso | annullato
  responsabile_id uuid references utenti_studio(id) on delete set null,
  note text,
  pdf_path text, -- path del PDF allegato
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table agecon enable row level security;
create policy "allow_all_agecon" on agecon for all using (true) with check (true);
