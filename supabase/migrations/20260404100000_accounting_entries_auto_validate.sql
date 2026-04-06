-- Auto Validate Engine: punteggio 0–100, stato e fonte per accounting_entries

alter table public.accounting_entries
  add column if not exists ai_confidence numeric(5, 2);

alter table public.accounting_entries
  add column if not exists ai_status text;

alter table public.accounting_entries
  add column if not exists ai_source text;

alter table public.accounting_entries
  add column if not exists auto_validate_meta jsonb not null default '{}'::jsonb;

comment on column public.accounting_entries.ai_confidence is 'Punteggio auto-validazione 0–100 (motore deterministico)';
comment on column public.accounting_entries.ai_status is 'auto | review | manual (derivato da ai_confidence)';
comment on column public.accounting_entries.ai_source is 'memory | pattern | fallback';
comment on column public.accounting_entries.auto_validate_meta is 'Dettaglio punteggi / breakdown JSON';

do $$
begin
  alter table public.accounting_entries
    add constraint accounting_entries_ai_status_check
    check (ai_status is null or ai_status in ('auto', 'review', 'manual'));
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter table public.accounting_entries
    add constraint accounting_entries_ai_source_check
    check (ai_source is null or ai_source in ('memory', 'pattern', 'fallback'));
exception
  when duplicate_object then null;
end $$;
