alter table if exists public.ai_parsing_results enable row level security;
alter table if exists public.ai_logs enable row level security;
alter table if exists public.ai_document_memory enable row level security;
alter table if exists public.ai_pipeline_counter enable row level security;
alter table if exists public.pipeline_runs enable row level security;
alter table if exists public.pipeline_steps enable row level security;
alter table if exists public.ai_insights enable row level security;
alter table if exists public.fiscal_knowledge enable row level security;
alter table if exists public.fiscal_knowledge_proposals enable row level security;
alter table if exists public.fiscal_knowledge_proposal_items enable row level security;
alter table if exists public.fiscal_knowledge_proposal_decisions enable row level security;

create or replace function public.current_utente_studio_id()
returns uuid
language plpgsql
stable
as $$
declare
  result uuid;
begin
  if auth.uid() is null or to_regclass('public.utenti_studio') is null then
    return null;
  end if;

  execute $sql$
    select us.id
    from public.utenti_studio us
    where us.auth_user_id = auth.uid()
      and us.attivo = true
    limit 1
  $sql$
  into result;

  return result;
end;
$$;

create or replace function public.current_utente_ruolo()
returns text
language plpgsql
stable
as $$
declare
  result text;
begin
  if auth.uid() is null or to_regclass('public.utenti_studio') is null then
    return 'collaboratore';
  end if;

  execute $sql$
    select us.ruolo
    from public.utenti_studio us
    where us.auth_user_id = auth.uid()
      and us.attivo = true
    limit 1
  $sql$
  into result;

  return coalesce(result, 'collaboratore');
end;
$$;

create or replace function public.is_owner_or_admin()
returns boolean
language sql
stable
as $$
  select public.current_utente_ruolo() in ('owner', 'admin')
$$;

create or replace function public.user_has_societa_access(target_societa uuid)
returns boolean
language plpgsql
stable
as $$
declare
  has_access boolean := false;
begin
  if target_societa is null or auth.uid() is null then
    return false;
  end if;

  if to_regclass('public.utenti_studio_societa') is null then
    return false;
  end if;

  execute $sql$
    select exists (
      select 1
      from public.utenti_studio_societa uss
      where uss.auth_user_id = auth.uid()
        and uss.societa_id = $1
    )
  $sql$
  into has_access
  using target_societa;

  return coalesce(has_access, false);
end;
$$;

create or replace function public.user_can_access_scoped_row(
  row_company_id uuid,
  row_created_by uuid,
  row_owner_user_id uuid,
  row_visibility text
)
returns boolean
language sql
stable
as $$
  select
    public.user_has_societa_access(row_company_id)
    and (
      public.is_owner_or_admin()
      or coalesce(row_visibility, 'shared') = 'shared'
      or row_created_by = public.current_utente_studio_id()
      or row_owner_user_id = public.current_utente_studio_id()
    )
$$;

create or replace function public.user_can_write_scoped_row(
  row_company_id uuid,
  row_created_by uuid,
  row_owner_user_id uuid
)
returns boolean
language sql
stable
as $$
  select
    public.user_has_societa_access(row_company_id)
    and (
      public.is_owner_or_admin()
      or row_created_by = public.current_utente_studio_id()
      or row_owner_user_id = public.current_utente_studio_id()
      or row_created_by is null
    )
$$;

create or replace function public.user_can_access_document_text(target_document text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.documenti_contabilita dc
    where dc.id::text = target_document
      and public.user_can_access_scoped_row(
        coalesce(dc.company_id, dc.societa_id),
        dc.created_by,
        dc.owner_user_id,
        dc.visibility
      )
  )
$$;

create or replace function public.user_can_access_pipeline_run(target_run uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.pipeline_runs pr
    join public.documenti_contabilita dc on dc.id = pr.documento_id
    where pr.id = target_run
      and public.user_can_access_scoped_row(
        coalesce(dc.company_id, dc.societa_id),
        dc.created_by,
        dc.owner_user_id,
        dc.visibility
      )
  )
$$;

drop policy if exists ai_parsing_results_policy on public.ai_parsing_results;
create policy ai_parsing_results_policy on public.ai_parsing_results
for all
using (public.user_can_access_document_text(document_id))
with check (public.user_can_access_document_text(document_id));

drop policy if exists ai_logs_policy on public.ai_logs;
create policy ai_logs_policy on public.ai_logs
for all
using (public.user_can_access_document_text(document_id))
with check (public.user_can_access_document_text(document_id));

drop policy if exists ai_document_memory_policy on public.ai_document_memory;
create policy ai_document_memory_policy on public.ai_document_memory
for select
using (public.is_owner_or_admin());

drop policy if exists ai_pipeline_counter_policy on public.ai_pipeline_counter;
create policy ai_pipeline_counter_policy on public.ai_pipeline_counter
for select
using (public.is_owner_or_admin());

drop policy if exists pipeline_runs_policy on public.pipeline_runs;
create policy pipeline_runs_policy on public.pipeline_runs
for all
using (
  exists (
    select 1
    from public.documenti_contabilita dc
    where dc.id = pipeline_runs.documento_id
      and public.user_can_access_scoped_row(
        coalesce(dc.company_id, dc.societa_id),
        dc.created_by,
        dc.owner_user_id,
        dc.visibility
      )
  )
)
with check (
  exists (
    select 1
    from public.documenti_contabilita dc
    where dc.id = pipeline_runs.documento_id
      and public.user_can_write_scoped_row(
        coalesce(dc.company_id, dc.societa_id),
        dc.created_by,
        dc.owner_user_id
      )
  )
);

drop policy if exists pipeline_steps_policy on public.pipeline_steps;
create policy pipeline_steps_policy on public.pipeline_steps
for all
using (public.user_can_access_pipeline_run(pipeline_run_id))
with check (public.user_can_access_pipeline_run(pipeline_run_id));

drop policy if exists ai_insights_policy on public.ai_insights;
create policy ai_insights_policy on public.ai_insights
for all
using (public.user_has_societa_access(societa_id))
with check (public.user_has_societa_access(societa_id));

drop policy if exists fiscal_knowledge_policy on public.fiscal_knowledge;
create policy fiscal_knowledge_policy on public.fiscal_knowledge
for select
using (public.is_owner_or_admin());

drop policy if exists fiscal_knowledge_proposals_policy on public.fiscal_knowledge_proposals;
create policy fiscal_knowledge_proposals_policy on public.fiscal_knowledge_proposals
for all
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());

drop policy if exists fiscal_knowledge_proposal_items_policy on public.fiscal_knowledge_proposal_items;
create policy fiscal_knowledge_proposal_items_policy on public.fiscal_knowledge_proposal_items
for all
using (
  exists (
    select 1
    from public.fiscal_knowledge_proposals p
    where p.id = fiscal_knowledge_proposal_items.batch_id
      and public.is_owner_or_admin()
  )
)
with check (
  exists (
    select 1
    from public.fiscal_knowledge_proposals p
    where p.id = fiscal_knowledge_proposal_items.batch_id
      and public.is_owner_or_admin()
  )
);

drop policy if exists fiscal_knowledge_proposal_decisions_policy on public.fiscal_knowledge_proposal_decisions;
create policy fiscal_knowledge_proposal_decisions_policy on public.fiscal_knowledge_proposal_decisions
for all
using (public.is_owner_or_admin())
with check (public.is_owner_or_admin());
