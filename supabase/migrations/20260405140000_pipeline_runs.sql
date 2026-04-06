-- Tracciamento esecuzioni pipeline documento (parse → AI → partitari → IVA → liquidazione → insight)

create table if not exists public.pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  documento_id uuid not null,
  stato text not null default 'running',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  constraint pipeline_runs_stato_check check (
    stato in ('running', 'completed', 'failed')
  )
);

create index if not exists idx_pipeline_runs_documento_started
  on public.pipeline_runs (documento_id, started_at desc);

create table if not exists public.pipeline_steps (
  id uuid primary key default gen_random_uuid(),
  pipeline_run_id uuid not null references public.pipeline_runs (id) on delete cascade,
  step text not null,
  status text not null,
  input jsonb,
  output jsonb,
  error_message text,
  duration_ms integer,
  started_at timestamptz,
  ended_at timestamptz,
  constraint pipeline_steps_status_check check (
    status in ('running', 'ok', 'error', 'skipped')
  )
);

create index if not exists idx_pipeline_steps_run
  on public.pipeline_steps (pipeline_run_id, started_at);

comment on table public.pipeline_runs is 'Esecuzione pipeline per documento_contabilita';
comment on column public.pipeline_runs.stato is 'running | completed | failed';
comment on table public.pipeline_steps is 'Fase singola: parsing, ai_accounting, partitari, iva, liquidazione, insights';
comment on column public.pipeline_steps.step is 'Nome fase (slug)';
comment on column public.pipeline_steps.status is 'ok | error | skipped (error non blocca run successivo)';

grant select, insert, update, delete on table public.pipeline_runs to anon, authenticated;
grant select, insert, update, delete on table public.pipeline_steps to anon, authenticated;
