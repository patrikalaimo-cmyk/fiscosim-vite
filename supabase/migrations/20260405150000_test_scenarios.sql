-- Scenari test E2E. Se esisteva una tabella omonima senza le colonne attese, CREATE IF NOT EXISTS
-- non la correggeva: si ricrea da zero (solo dati seed test_scenarios, non dati utente).

drop table if exists public.test_scenarios cascade;

create table public.test_scenarios (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descrizione text,
  steps jsonb not null default '[]'::jsonb,
  expected_results jsonb not null default '{}'::jsonb,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  critical_tags text[] not null default '{}'::text[],
  kind text not null default 'standard',
  constraint test_scenarios_kind_check check (kind in ('standard', 'intelligent'))
);

create index if not exists idx_test_scenarios_attivo on public.test_scenarios (attivo, nome);

comment on table public.test_scenarios is 'Scenari test end-to-end (steps JSON + attese)';
comment on column public.test_scenarios.steps is 'Array di { action, ... }: upload_xml, run_pipeline, open_entry, validate, wait_ms';
comment on column public.test_scenarios.critical_tags is
  'Tag opzionali: pipeline | iva | ai_learning — per priorità QA e badge UI';
comment on column public.test_scenarios.kind is
  'standard: smoke DB; intelligent: validazioni AI, insight, fasi pipeline complete';
comment on column public.test_scenarios.expected_results is
  'JSON: document, accounting_entries, partitari, registri_iva, pipeline, ai_validation, insights, pipeline_phases, batch_summary';

grant select, insert, update, delete on table public.test_scenarios to anon, authenticated;

-- Scenario predefinito minimo (sovrascritto/integrato dalla migration default_e2e se presente)
insert into public.test_scenarios (id, nome, descrizione, steps, expected_results, attivo, kind, critical_tags)
values (
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'Fattura passiva XML + pipeline',
  'Carica XML, esegue pipeline completa, apre entry e valida presenza documento e almeno una scrittura.',
  '[
    {"action": "upload_xml"},
    {"action": "run_pipeline", "aiMode": "local", "aiPreprocessMode": "on"},
    {"action": "open_entry"},
    {"action": "validate"}
  ]'::jsonb,
  '{
    "pipeline": {"completed": true},
    "accounting_entries": {"min_count": 0},
    "partitari": {"min_count": 0},
    "registri_iva": {"min_count": 0},
    "insights": {"min_total": 0}
  }'::jsonb,
  true,
  'standard',
  '{}'::text[]
)
on conflict (id) do nothing;
