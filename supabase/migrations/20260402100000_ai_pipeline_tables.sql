-- Tabelle per la pipeline AI (aiParsingService, orchestrator, accounting, supervisor).
-- Esegui in Supabase: SQL Editor → New query → incolla ed esegui.
-- Document ID è text per allinearsi agli ID già usati dall'app (uuid o altro).

-- Risultati parsing AI (upsert per document_id)
create table if not exists public.ai_parsing_results (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  json_output jsonb not null default '{}'::jsonb,
  confidence double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_parsing_results_document_id_key unique (document_id)
);

create index if not exists idx_ai_parsing_results_document_id
  on public.ai_parsing_results (document_id);

-- Log step pipeline
create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  step text not null,
  message text not null default '',
  level text not null default 'info',
  created_at timestamptz not null default now(),
  constraint ai_logs_level_check check (level in ('info', 'warning', 'error'))
);

create index if not exists docs_ai_logs on public.ai_logs (document_id);
create index if not exists idx_ai_logs_created on public.ai_logs (created_at desc);

-- Scritture contabili minime dalla pipeline
create table if not exists public.accounting_entries (
  id uuid primary key default gen_random_uuid(),
  document_id text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'CREATED',
  created_at timestamptz not null default now()
);

create index if not exists idx_accounting_entries_document_id
  on public.accounting_entries (document_id);

comment
  on table public.ai_parsing_results is 'Output JSON parsing AI per documento (pipeline)';
comment on table public.ai_logs is 'Log step pipeline AI (supervisor)';
comment on table public.accounting_entries is 'Righe/scritture contabili generate dalla pipeline';

-- Permessi minimi per chiamate via PostgREST con chiave anon/authenticated.
-- (RLS è disabilitata di default; questi GRANT evitano errori di "permission denied")
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.ai_parsing_results to anon, authenticated;
grant select, insert, update, delete on table public.ai_logs to anon, authenticated;
grant select, insert, update, delete on table public.accounting_entries to anon, authenticated;
