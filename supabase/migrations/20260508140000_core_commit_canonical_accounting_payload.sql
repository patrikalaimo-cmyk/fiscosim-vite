-- CORE-CLOSURE-18 / FINAL-COMMIT-01
-- Migration review-ready, non applicata automaticamente.
-- Obiettivo: audit persistente + RPC atomica comune per il commit canonico contabile.

create extension if not exists pgcrypto;

create table if not exists public.canonical_accounting_commit_audit (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid not null references public.societa(id) on delete cascade,
  esercizio_id text not null,
  utente_id uuid references public.utenti_studio(id) on delete set null,
  source_module text not null,
  source_document_id text not null,
  idempotency_key text not null,
  payload_hash text not null,
  mode text not null,
  status text not null,
  payload_snapshot jsonb not null,
  result_snapshot jsonb,
  created_ids jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  committed_at timestamptz,
  constraint canonical_accounting_commit_audit_idempotency_scope_uk unique (source_module, idempotency_key, mode),
  constraint canonical_accounting_commit_audit_source_module_ck
    check (source_module in ('import_contabilita', 'registrazione_manual', 'riconciliazione_bancaria')),
  constraint canonical_accounting_commit_audit_mode_ck
    check (mode in ('dry_run', 'commit')),
  constraint canonical_accounting_commit_audit_status_ck
    check (status in ('dry_run', 'committed', 'replayed', 'blocked', 'failed', 'failed_rollback'))
);

comment on table public.canonical_accounting_commit_audit is
  'Audit persistente per il commit canonico contabile. Migration review-ready; nessun commit reale attivato. real_commit_not_implemented';

create index if not exists idx_canonical_accounting_commit_audit_societa_esercizio
  on public.canonical_accounting_commit_audit (societa_id, esercizio_id);

create index if not exists idx_canonical_accounting_commit_audit_source_module_document
  on public.canonical_accounting_commit_audit (source_module, source_document_id);

create index if not exists idx_canonical_accounting_commit_audit_status
  on public.canonical_accounting_commit_audit (status);

create index if not exists idx_canonical_accounting_commit_audit_created_at
  on public.canonical_accounting_commit_audit (created_at desc);

create index if not exists idx_canonical_accounting_commit_audit_payload_hash
  on public.canonical_accounting_commit_audit (payload_hash);

alter table public.canonical_accounting_commit_audit enable row level security;

revoke all on table public.canonical_accounting_commit_audit from public;
revoke all on table public.canonical_accounting_commit_audit from anon;
revoke all on table public.canonical_accounting_commit_audit from authenticated;

-- TODO: valutare policy RLS mirate solo dopo review del modello tenant/server-side.
-- Nessuna policy permissiva viene introdotta in questa fase.

create or replace function public.commit_canonical_accounting_payload(
  p_societa_id uuid,
  p_esercizio_id text,
  p_utente_id uuid,
  p_source_module text,
  p_source_document_id text,
  p_idempotency_key text,
  p_payload_hash text,
  p_canonical_payload jsonb,
  p_options jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_source_module text := lower(trim(coalesce(p_source_module, '')));
  v_source_document_id text := trim(coalesce(p_source_document_id, ''));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_payload_hash text := trim(coalesce(p_payload_hash, ''));
  v_payload_version text := coalesce(nullif(trim(coalesce(p_canonical_payload->>'schemaVersion', '')), ''), nullif(trim(coalesce(p_canonical_payload->>'payloadVersion', '')), ''));
  v_expected_version text := nullif(trim(coalesce(p_options->>'expectedPayloadVersion', '')), '');
  v_request_id text := nullif(trim(coalesce(p_options->>'requestId', '')), '');
  v_dry_run boolean := coalesce((p_options->>'dryRun')::boolean, true);
  v_allow_real_commit boolean := coalesce((p_options->>'allowRealCommit')::boolean, false);
  v_mode text := case when coalesce((p_options->>'dryRun')::boolean, true) then 'dry_run' else 'commit' end;
  v_existing public.canonical_accounting_commit_audit%rowtype;
  v_payload_text text := lower(coalesce(p_canonical_payload::text, ''));
  v_blockers jsonb := '[]'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_result_snapshot jsonb;
  v_audit public.canonical_accounting_commit_audit%rowtype;
  v_can_use_scope boolean := false;
begin
  if p_societa_id is null then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('societaId mancante'));
  end if;

  if nullif(trim(coalesce(p_esercizio_id, '')), '') is null then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('esercizioId mancante'));
  end if;

  if p_utente_id is null then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('utenteId mancante'));
  end if;

  if v_source_module not in ('import_contabilita', 'registrazione_manual', 'riconciliazione_bancaria') then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('sourceModule non ammesso'));
  end if;

  if v_source_document_id = '' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('sourceDocumentId mancante'));
  end if;

  if v_idempotency_key = '' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('idempotencyKey mancante'));
  end if;

  if v_payload_hash = '' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('payloadHash mancante'));
  end if;

  if p_canonical_payload is null then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('canonicalPayload mancante'));
  end if;

  if v_expected_version is not null and v_expected_version <> '' and coalesce(v_payload_version, '') <> v_expected_version then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('payload version incompatibile'));
  end if;

  if auth.uid() is not null then
    select public.user_has_societa_access(p_societa_id)
      into v_can_use_scope;
    if not coalesce(v_can_use_scope, false) then
      return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('tenant scope incoerente'));
    end if;
  end if;

  if lower(coalesce(p_canonical_payload->>'sourceModule', p_canonical_payload->'source'->>'module', '')) not in ('', v_source_module) then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('sourceModule payload incoerente'));
  end if;

  if v_payload_text like '%accounting_entries%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy reference accounting_entries rilevata'));
  end if;

  if v_payload_text like '%documenti_import%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('documenti_import non ammesso come target finale'));
  end if;

  if v_payload_text like '%import_fatture%' or v_payload_text like '%import_nuovo%' or v_payload_text like '%import_unificato%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy source commit path rilevato'));
  end if;

  if v_payload_text like '%createscritturacontabile%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy createScritturaContabile rilevata'));
  end if;

  if v_payload_text like '%createprimanotacompleta%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy createPrimaNotaCompleta rilevata'));
  end if;

  v_blockers := coalesce(p_canonical_payload->'blockers', '[]'::jsonb);
  if jsonb_typeof(v_blockers) = 'array' then
    if jsonb_array_length(v_blockers) > 0 then
      return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', v_blockers);
    end if;
  end if;

  v_blockers := coalesce(p_canonical_payload->'validation'->'blockers', '[]'::jsonb);
  if jsonb_typeof(v_blockers) = 'array' then
    if jsonb_array_length(v_blockers) > 0 then
      return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', v_blockers);
    end if;
  end if;

  select *
    into v_existing
  from public.canonical_accounting_commit_audit
  where source_module = v_source_module
    and idempotency_key = v_idempotency_key
    and mode = v_mode
  limit 1;

  if found then
    if coalesce(v_existing.payload_hash, '') = v_payload_hash then
      return jsonb_build_object(
        'success', true,
        'mode', v_existing.mode,
        'status', 'replayed',
        'idempotencyKey', v_existing.idempotency_key,
        'payloadId', coalesce(v_existing.result_snapshot->>'payloadId', v_existing.id::text),
        'sourceModule', v_existing.source_module,
        'sourceDocumentId', v_existing.source_document_id,
        'createdIds', coalesce(v_existing.created_ids, '{}'::jsonb),
        'reusedExistingCommit', true,
        'warnings', coalesce(v_existing.warnings, '[]'::jsonb),
        'blockers', coalesce(v_existing.blockers, '[]'::jsonb),
        'auditId', v_existing.id,
        'resultSnapshot', coalesce(v_existing.result_snapshot, '{}'::jsonb),
        'requestId', v_request_id
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'mode', v_existing.mode,
      'status', 'blocked',
      'idempotencyKey', v_idempotency_key,
      'payloadId', coalesce(v_existing.result_snapshot->>'payloadId', v_existing.id::text),
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', '[]'::jsonb,
      'blockers', jsonb_build_array('idempotency_conflict'),
      'auditId', v_existing.id,
      'resultSnapshot', coalesce(v_existing.result_snapshot, '{}'::jsonb),
      'requestId', v_request_id
    );
  end if;

  if v_dry_run then
    v_result_snapshot := jsonb_build_object(
      'status', 'dry_run',
      'mode', 'dry_run',
      'payloadHash', v_payload_hash,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'idempotencyKey', v_idempotency_key,
      'requestId', v_request_id,
      'createdIds', '{}'::jsonb,
      'warnings', jsonb_build_array('dry_run_only'),
      'blockers', '[]'::jsonb,
      'noDbWriteInDryRun', true,
      'commitTodo', 'real_commit_not_implemented'
    );

    insert into public.canonical_accounting_commit_audit (
      societa_id,
      esercizio_id,
      utente_id,
      source_module,
      source_document_id,
      idempotency_key,
      payload_hash,
      mode,
      status,
      payload_snapshot,
      result_snapshot,
      created_ids,
      warnings,
      blockers,
      error_code,
      error_message,
      committed_at
    ) values (
      p_societa_id,
      p_esercizio_id,
      p_utente_id,
      v_source_module,
      v_source_document_id,
      v_idempotency_key,
      v_payload_hash,
      'dry_run',
      'dry_run',
      p_canonical_payload,
      v_result_snapshot,
      '{}'::jsonb,
      jsonb_build_array('dry_run_only'),
      '[]'::jsonb,
      null,
      null,
      null
    ) on conflict (source_module, idempotency_key, mode) do nothing
    returning * into v_audit;

    if not found then
      select *
        into v_audit
      from public.canonical_accounting_commit_audit
      where source_module = v_source_module
        and idempotency_key = v_idempotency_key
        and mode = v_mode
      limit 1;
    end if;

    return jsonb_build_object(
      'success', true,
      'mode', 'dry_run',
      'status', 'dry_run',
      'idempotencyKey', v_idempotency_key,
      'payloadId', v_audit.id::text,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', jsonb_build_array('dry_run_only'),
      'blockers', '[]'::jsonb,
      'auditId', v_audit.id,
      'resultSnapshot', v_result_snapshot,
      'requestId', v_request_id,
      'auditPersisted', true,
      'noDbWriteInDryRun', true
    );
  end if;

  if not v_allow_real_commit then
    v_result_snapshot := jsonb_build_object(
      'status', 'blocked',
      'mode', 'commit',
      'payloadHash', v_payload_hash,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'idempotencyKey', v_idempotency_key,
      'requestId', v_request_id,
      'createdIds', '{}'::jsonb,
      'warnings', '[]'::jsonb,
      'blockers', jsonb_build_array('real_commit_disabled', 'commit_path_todo'),
      'auditPersisted', true,
      'commitTodo', 'real_commit_not_implemented'
    );

    insert into public.canonical_accounting_commit_audit (
      societa_id,
      esercizio_id,
      utente_id,
      source_module,
      source_document_id,
      idempotency_key,
      payload_hash,
      mode,
      status,
      payload_snapshot,
      result_snapshot,
      created_ids,
      warnings,
      blockers,
      error_code,
      error_message,
      committed_at
    ) values (
      p_societa_id,
      p_esercizio_id,
      p_utente_id,
      v_source_module,
      v_source_document_id,
      v_idempotency_key,
      v_payload_hash,
      'commit',
      'blocked',
      p_canonical_payload,
      v_result_snapshot,
      '{}'::jsonb,
      '[]'::jsonb,
      jsonb_build_array('real_commit_disabled', 'commit_path_todo'),
      'real_commit_disabled',
      'real_commit_disabled',
      null
    ) on conflict (source_module, idempotency_key, mode) do nothing
    returning * into v_audit;

    if not found then
      select *
        into v_audit
      from public.canonical_accounting_commit_audit
      where source_module = v_source_module
        and idempotency_key = v_idempotency_key
        and mode = v_mode
      limit 1;
    end if;

    return jsonb_build_object(
      'success', false,
      'mode', 'commit',
      'status', 'blocked',
      'idempotencyKey', v_idempotency_key,
      'payloadId', v_audit.id::text,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', '[]'::jsonb,
      'blockers', jsonb_build_array('real_commit_disabled', 'commit_path_todo'),
      'auditId', v_audit.id,
      'resultSnapshot', v_result_snapshot,
      'requestId', v_request_id,
      'auditPersisted', true
    );
  end if;

  -- TODO: quando la mappatura finale delle tabelle reali sara' confermata,
  -- eseguire qui, nella stessa transazione, le scritture atomiche su:
  -- - public.prima_nota
  -- - public.prima_nota_righe
  -- - public.registri_iva
  -- - public.partitario
  -- - public.documenti_contabilita
  -- - public.movimenti_bancari
  -- In questa fase il commit reale resta bloccato per scelta.

  v_result_snapshot := jsonb_build_object(
    'status', 'blocked',
    'mode', 'commit',
    'payloadHash', v_payload_hash,
    'sourceModule', v_source_module,
    'sourceDocumentId', v_source_document_id,
    'idempotencyKey', v_idempotency_key,
    'requestId', v_request_id,
    'createdIds', '{}'::jsonb,
    'warnings', '[]'::jsonb,
    'blockers', jsonb_build_array('commit_path_todo'),
    'auditPersisted', true,
    'commitTodo', 'real_commit_not_implemented'
  );

  insert into public.canonical_accounting_commit_audit (
    societa_id,
    esercizio_id,
    utente_id,
    source_module,
    source_document_id,
    idempotency_key,
    payload_hash,
    mode,
    status,
    payload_snapshot,
    result_snapshot,
    created_ids,
    warnings,
    blockers,
    error_code,
    error_message,
    committed_at
  ) values (
    p_societa_id,
    p_esercizio_id,
    p_utente_id,
    v_source_module,
    v_source_document_id,
    v_idempotency_key,
    v_payload_hash,
    'commit',
    'blocked',
    p_canonical_payload,
    v_result_snapshot,
    '{}'::jsonb,
    '[]'::jsonb,
    jsonb_build_array('commit_path_todo'),
    'commit_path_todo',
    'commit_path_todo',
    null
  ) on conflict (source_module, idempotency_key, mode) do nothing
  returning * into v_audit;

  if not found then
    select *
      into v_audit
    from public.canonical_accounting_commit_audit
    where source_module = v_source_module
      and idempotency_key = v_idempotency_key
      and mode = v_mode
    limit 1;
  end if;

  return jsonb_build_object(
    'success', false,
    'mode', 'commit',
    'status', 'blocked',
    'idempotencyKey', v_idempotency_key,
    'payloadId', v_audit.id::text,
    'sourceModule', v_source_module,
    'sourceDocumentId', v_source_document_id,
    'createdIds', '{}'::jsonb,
    'reusedExistingCommit', false,
    'warnings', '[]'::jsonb,
    'blockers', jsonb_build_array('commit_path_todo'),
    'auditId', v_audit.id,
    'resultSnapshot', v_result_snapshot,
    'requestId', v_request_id,
    'auditPersisted', true
  );
end;
$$;

comment on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, text, jsonb, jsonb) is
  'RPC atomica review-ready per il commit canonico contabile. In questa fase il commit reale resta bloccato e l''audit e'' persistente.';

revoke all on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, text, jsonb, jsonb) from public;
grant execute on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, text, jsonb, jsonb) to service_role;