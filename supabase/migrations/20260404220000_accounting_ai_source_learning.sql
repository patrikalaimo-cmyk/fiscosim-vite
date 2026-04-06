-- Consenti ai_source = learning (apprendimento da ai_learning / feedback)

alter table public.accounting_entries drop constraint if exists accounting_entries_ai_source_check;

do $$
begin
  alter table public.accounting_entries
    add constraint accounting_entries_ai_source_check
    check (ai_source is null or ai_source in ('memory', 'pattern', 'fallback', 'learning'));
exception
  when duplicate_object then null;
end $$;

comment on column public.accounting_entries.ai_source is 'memory | pattern | fallback | learning';
