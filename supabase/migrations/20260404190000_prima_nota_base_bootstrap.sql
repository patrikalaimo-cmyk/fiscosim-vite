-- Base schema for local bootstrap only.
-- Materializes the minimum public.prima_nota / public.prima_nota_righe pair
-- required by the migration graph before ai_feedback_log.
-- Do not use this as a runtime dump or seed source.

create table if not exists public.prima_nota (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid,
  company_id uuid,
  tenant_id uuid,
  numero_registrazione serial,
  data_registrazione date not null,
  data_documento date,
  numero_documento text,
  causale_id uuid,
  causale_codice text,
  descrizione text,
  cliente_fornitore_id uuid,
  cliente_fornitore_nome text,
  totale_dare numeric(15,2) not null default 0,
  totale_avere numeric(15,2) not null default 0,
  stato text not null default 'provvisoria',
  fattura_xml_id uuid,
  documento_import_id uuid,
  documento_contabilita_id uuid,
  created_by uuid,
  owner_user_id uuid,
  visibility text,
  locked_by uuid,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_prima_nota_data_registrazione
  on public.prima_nota (data_registrazione);

create index if not exists idx_prima_nota_societa_id
  on public.prima_nota (societa_id);

create index if not exists idx_prima_nota_company_id
  on public.prima_nota (company_id);

create table if not exists public.prima_nota_righe (
  id uuid primary key default gen_random_uuid(),
  prima_nota_id uuid references public.prima_nota (id) on delete cascade,
  societa_id uuid,
  company_id uuid,
  tenant_id uuid,
  created_by uuid,
  owner_user_id uuid,
  visibility text,
  locked_by uuid,
  locked_at timestamptz,
  riga_numero integer not null,
  conto_id uuid,
  conto_codice text,
  conto_descrizione text,
  descrizione_riga text,
  importo_dare numeric(15,2) not null default 0,
  importo_avere numeric(15,2) not null default 0,
  causale_iva_id uuid,
  causale_iva_codice text,
  imponibile numeric(15,2) not null default 0,
  iva numeric(15,2) not null default 0,
  partita_aperta boolean not null default false,
  partita_id uuid,
  created_at timestamptz not null default now()
);

create index if not exists idx_prima_nota_righe_prima_nota_id
  on public.prima_nota_righe (prima_nota_id);

create index if not exists idx_prima_nota_righe_company_id
  on public.prima_nota_righe (company_id);

create index if not exists idx_prima_nota_righe_societa_id
  on public.prima_nota_righe (societa_id);