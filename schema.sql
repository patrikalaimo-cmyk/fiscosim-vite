-- ============================================================
-- FISCOSIM – Schema Database Supabase
-- Incolla tutto nel SQL Editor di Supabase ed esegui
-- ============================================================

-- CLIENTI
create table if not exists clienti (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  cognome text,
  ragione_sociale text,
  tipo_cliente text default 'forfettario', -- forfettario | ordinario | srl | snc | occasionale
  email text,
  email_cc text[] default '{}',
  codice_fiscale text,
  partita_iva text,
  note text,
  attivo boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- TEMPLATE ADEMPIMENTI
create table if not exists adempimenti_template (
  id uuid default gen_random_uuid() primary key,
  nome text not null,
  oggetto text not null,
  corpo text not null,
  allegato_tipo text default 'nessuno', -- nessuno | pdf_app | pdf_f24
  ciclicita text default 'unica',       -- unica | annuale | trimestrale | mensile
  giorno_invio int,                     -- giorno del mese per invio
  mese_invio int,                       -- mese (solo per annuale)
  data_invio date,                      -- data esatta (solo per unica)
  attivo boolean default true,
  created_at timestamptz default now()
);

-- DESTINATARI PER ADEMPIMENTO (clienti associati al template)
create table if not exists adempimenti_clienti (
  id uuid default gen_random_uuid() primary key,
  adempimento_id uuid references adempimenti_template(id) on delete cascade,
  cliente_id uuid references clienti(id) on delete cascade,
  email_override text,     -- se diversa da anagrafica
  attivo boolean default true,
  unique(adempimento_id, cliente_id)
);

-- INVII SCHEDULATI (istanze concrete da inviare)
create table if not exists invii_schedulati (
  id uuid default gen_random_uuid() primary key,
  adempimento_id uuid references adempimenti_template(id) on delete set null,
  cliente_id uuid references clienti(id) on delete set null,
  data_invio date not null,
  stato text default 'programmato', -- programmato | inviato | annullato | rimandato
  email_destinatario text,
  email_cc text[] default '{}',
  email_bcc text[] default '{}',
  oggetto text not null,
  corpo text not null,
  allegato_tipo text default 'nessuno',
  note_operatore text,
  inviato_at timestamptz,
  created_at timestamptz default now()
);

-- LOG INVII EFFETTUATI
create table if not exists invii_log (
  id uuid default gen_random_uuid() primary key,
  invio_id uuid references invii_schedulati(id) on delete set null,
  cliente_nome text,
  email_destinatario text,
  oggetto text,
  stato text, -- ok | errore
  errore_msg text,
  inviato_at timestamptz default now()
);

-- ============================================================
-- DATI DI ESEMPIO (opzionale, cancella se non vuoi)
-- ============================================================

insert into adempimenti_template (nome, oggetto, corpo, ciclicita, giorno_invio, mese_invio, allegato_tipo) values
(
  'Tassa Concessione Governativa',
  'Scadenza Tassa Concessione Governativa – Studio Envisioning',
  'Gentile Cliente,

Le ricordiamo che entro il 16 marzo è in scadenza la Tassa Annuale di Concessione Governativa per la tenuta dei libri sociali.

L''importo da versare è:
- Capitale sociale fino a €516.456,90: € 309,87
- Capitale sociale oltre €516.456,90: € 516,46

Il versamento va effettuato tramite Modello F24 con codice tributo 7085.

Restiamo a disposizione per qualsiasi chiarimento.

Cordiali saluti
Studio Envisioning Srl',
  'annuale', 10, 3, 'nessuno'
),
(
  'Liquidazione IVA I Trimestre',
  'Liquidazione IVA I Trimestre 2025 – Studio Envisioning',
  'Gentile Cliente,

Le trasmettiamo in allegato il prospetto della liquidazione IVA relativa al primo trimestre 2025 (gennaio-marzo).

La invitiamo a verificare i dati e a contattarci per qualsiasi chiarimento prima della scadenza del 16 maggio.

Cordiali saluti
Studio Envisioning Srl',
  'annuale', 10, 5, 'pdf_app'
),
(
  'Liquidazione IVA II Trimestre',
  'Liquidazione IVA II Trimestre 2025 – Studio Envisioning',
  'Gentile Cliente,

Le trasmettiamo in allegato il prospetto della liquidazione IVA relativa al secondo trimestre 2025 (aprile-giugno).

La invitiamo a verificare i dati e a contattarci per qualsiasi chiarimento prima della scadenza del 20 agosto.

Cordiali saluti
Studio Envisioning Srl',
  'annuale', 15, 8, 'pdf_app'
),
(
  'Liquidazione IVA III Trimestre',
  'Liquidazione IVA III Trimestre 2025 – Studio Envisioning',
  'Gentile Cliente,

Le trasmettiamo in allegato il prospetto della liquidazione IVA relativa al terzo trimestre 2025 (luglio-settembre).

La invitiamo a verificare i dati e a contattarci prima della scadenza del 16 novembre.

Cordiali saluti
Studio Envisioning Srl',
  'annuale', 10, 11, 'pdf_app'
);

-- ============================================================
-- ROW LEVEL SECURITY (disabilitato per ora, da abilitare in produzione)
-- ============================================================
alter table clienti enable row level security;
alter table adempimenti_template enable row level security;
alter table adempimenti_clienti enable row level security;
alter table invii_schedulati enable row level security;
alter table invii_log enable row level security;

-- Policy permissiva temporanea (solo per sviluppo)
create policy "allow_all_clienti" on clienti for all using (true) with check (true);
create policy "allow_all_adempimenti" on adempimenti_template for all using (true) with check (true);
create policy "allow_all_adempimenti_clienti" on adempimenti_clienti for all using (true) with check (true);
create policy "allow_all_invii" on invii_schedulati for all using (true) with check (true);
create policy "allow_all_log" on invii_log for all using (true) with check (true);
