-- Conoscenza fiscale/contabile versionata (DB "vivente" per prompt AI e prodotti).
-- Esegui in Supabase SQL Editor se non usi CLI migrate.

create table if not exists public.fiscal_knowledge (
  id uuid primary key default gen_random_uuid(),
  categoria text not null,
  chiave text not null,
  valore text not null default '',
  contesto text,
  valido_dal date,
  valido_al date,
  descrizione text,
  metadata jsonb not null default '{}'::jsonb,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_fiscal_knowledge_categoria_attivo
  on public.fiscal_knowledge (categoria, attivo);

create index if not exists idx_fiscal_knowledge_attivo
  on public.fiscal_knowledge (attivo);

comment on table public.fiscal_knowledge is 'Regole e riferimenti fiscali/contabili per RAG/prompt (categorie flessibili: iva, contabile, regime, documento, supervisione, …)';

-- Permessi allineati alle altre tabelle pipeline (restringere con RLS in produzione se serve)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.fiscal_knowledge to anon, authenticated;

-- Esempi idempotenti (saltati se stessa categoria+chiave esiste già)
insert into public.fiscal_knowledge (categoria, chiave, valore, contesto, valido_dal, descrizione, metadata, attivo)
select 'iva', 'aliquote_ordinarie',
  'Aliquote IVA più comuni in Italia: 22% ordinaria; 10% e 4% ridotte; 5% (alcuni casi). Verificare sempre natura ed esclusioni su singola operazione.',
  'Italia', '2024-01-01'::date, 'Sintesi operativa per classificazione documenti',
  '{"fonte":"sintesi_interna","versione":1}'::jsonb, true
where not exists (select 1 from public.fiscal_knowledge fk where fk.categoria = 'iva' and fk.chiave = 'aliquote_ordinarie');

insert into public.fiscal_knowledge (categoria, chiave, valore, contesto, valido_dal, descrizione, metadata, attivo)
select 'documento', 'fattura_elettronica',
  'Fattura elettronica B2B/B2C tracciata: flusso SDI, file XML FatturaPA, dati cedente/prestatore e cessionario/committente.',
  'Italia', null, 'Contesto documenti XML/P7M', '{}'::jsonb, true
where not exists (select 1 from public.fiscal_knowledge fk where fk.categoria = 'documento' and fk.chiave = 'fattura_elettronica');

insert into public.fiscal_knowledge (categoria, chiave, valore, contesto, valido_dal, descrizione, metadata, attivo)
select 'contabile', 'partita_doppia',
  'Ogni registrazione in partita doppia: totale dare = totale avere. IVA acquisti tipicamente a dare su conto IVA; fornitore ad avere.',
  null, null, 'Controllo coerenza scritture', '{}'::jsonb, true
where not exists (select 1 from public.fiscal_knowledge fk where fk.categoria = 'contabile' and fk.chiave = 'partita_doppia');

insert into public.fiscal_knowledge (categoria, chiave, valore, contesto, valido_dal, descrizione, metadata, attivo)
select 'regime', 'forfettario',
  'Regime forfettario (art. 1 commi 54-89 L. 190/2014): limiti, esclusioni e obblighi specifici vanno verificati su base annuale e attività.',
  'Italia', null, 'Non sostituisce consulenza: usare come promemoria',
  '{"avviso":"verificare_sempre_normativa_vigente"}'::jsonb, true
where not exists (select 1 from public.fiscal_knowledge fk where fk.categoria = 'regime' and fk.chiave = 'forfettario');

insert into public.fiscal_knowledge (categoria, chiave, valore, contesto, valido_dal, descrizione, metadata, attivo)
select 'supervisione', 'coerenza_iva_imponibile',
  'Se imponibile > 0 e aliquota > 0, controllare che IVA ≈ imponibile × aliquota / 100 (tolleranza arrotondamenti).',
  null, null, 'Check qualità pipeline', '{}'::jsonb, true
where not exists (select 1 from public.fiscal_knowledge fk where fk.categoria = 'supervisione' and fk.chiave = 'coerenza_iva_imponibile');
