-- Template fornitore: bypass AI su PDF ripetitivi (pattern testuale + mapping JSON).
-- Conteggio parse per fornitore (nome normalizzato) per auto-apprendimento dopo >3 occorrenze.

create table if not exists public.supplier_templates (
  id uuid primary key default gen_random_uuid(),
  fornitore_nome text not null,
  pattern_testo text not null,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_templates_fornitore
  on public.supplier_templates (fornitore_nome);

comment on table public.supplier_templates is 'Pattern testo PDF + mapping parsing: match → skip AI';
comment on column public.supplier_templates.pattern_testo is 'Sottostringa stabile (testo collassato) da cercare nel PDF estratto';
comment on column public.supplier_templates.mapping is 'JSON output parsing (stesso schema ai_parsing_results.json_output)';

create table if not exists public.supplier_parse_counts (
  fornitore_nome text primary key,
  parse_count int not null default 0,
  updated_at timestamptz not null default now()
);

comment on table public.supplier_parse_counts is 'Conteggio documenti parsati (AI) per fornitore — oltre 3 si può creare template automatico';

grant select, insert, update, delete on table public.supplier_templates to anon, authenticated;
grant select, insert, update, delete on table public.supplier_parse_counts to anon, authenticated;
