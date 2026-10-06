-- DRAFT ONLY - DO NOT APPLY DIRECTLY
-- CORE-CLOSURE-03
-- Commit atomico comune payload canonico
-- Nessuna migration applicata in questa fase

-- ============================================================================
-- 0. Notes tecniche
-- ============================================================================
-- Questo file e un draft tecnico. Non eseguirlo direttamente.
-- Prima dell'applicazione reale serve review dello schema effettivo, RLS e test isolati.
-- Se pgcrypto e disponibile, il payload_hash dovrebbe essere calcolato con:
--   encode(digest(normalized_payload_text, 'sha256'), 'hex')
-- In alternativa, usare un helper applicativo o un fallback concordato in review.

-- ============================================================================
-- 1. Tabella audit commit canonico
-- ============================================================================

create table if not exists public.canonical_accounting_commit_audit (
  id uuid primary key default gen_random_uuid(),
  societa_id uuid not null,
  esercizio_id text not null,
  utente_id uuid not null,
  source_module text not null,
  source_document_id text not null,
  idempotency_key text not null,
  payload_id text,
  payload_version text,
  payload_hash text not null,
  mode text not null,
  status text not null,
  created_ids jsonb not null default '{}'::jsonb,
  payload_snapshot jsonb not null,
  result_snapshot jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  blockers jsonb not null default '[]'::jsonb,
  error_message text,
  error_code text,
  committed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint canonical_accounting_commit_audit_idempotency_key_uk unique (idempotency_key),
  constraint canonical_accounting_commit_audit_source_module_ck
    check (source_module in ('import_contabilita', 'registrazione_manual', 'riconciliazione_bancaria')),
  constraint canonical_accounting_commit_audit_mode_ck
    check (mode in ('dry_run', 'commit')),
  constraint canonical_accounting_commit_audit_status_ck
    check (status in ('dry_run', 'committed', 'replayed', 'blocked', 'failed_rollback', 'failed'))
);

-- Vincolo opzionale da valutare con attenzione:
-- unique (societa_id, source_module, source_document_id, status)
-- Nota: NON applicarlo senza verificare che non blocchi replay validi o retry idempotenti.

comment on table public.canonical_accounting_commit_audit is
  'Draft audit table for canonical accounting commits. Not applied yet.';

create index if not exists idx_canonical_accounting_commit_audit_societa_esercizio
  on public.canonical_accounting_commit_audit (societa_id, esercizio_id);

create index if not exists idx_canonical_accounting_commit_audit_source_module_document
  on public.canonical_accounting_commit_audit (source_module, source_document_id);

create index if not exists idx_canonical_accounting_commit_audit_created_at
  on public.canonical_accounting_commit_audit (created_at desc);

create index if not exists idx_canonical_accounting_commit_audit_committed_at
  on public.canonical_accounting_commit_audit (committed_at desc);

create index if not exists idx_canonical_accounting_commit_audit_status
  on public.canonical_accounting_commit_audit (status);

-- ============================================================================
-- 2. Campi aggiuntivi su tabelle sorgenti / target
-- ============================================================================
-- Nota: le tabelle reali vanno verificate prima dell'applicazione.
-- Alcuni campi esistono gia in varianti di schema; qui si propongono solo come draft.

-- documenti_contabilita
-- alter table public.documenti_contabilita
--   add column if not exists canonical_commit_audit_id uuid,
--   add column if not exists canonical_commit_status text,
--   add column if not exists canonical_commit_at timestamptz;

-- movimenti_bancari
-- alter table public.movimenti_bancari
--   add column if not exists canonical_commit_audit_id uuid,
--   add column if not exists reconciliation_decision_id text,
--   add column if not exists canonical_commit_status text,
--   add column if not exists canonical_commit_at timestamptz;

-- prima_nota
-- alter table public.prima_nota
--   add column if not exists canonical_commit_audit_id uuid,
--   add column if not exists source_module text,
--   add column if not exists source_document_id text,
--   add column if not exists idempotency_key text;

-- ============================================================================
-- 3. Funzione RPC draft
-- ============================================================================

create or replace function public.commit_canonical_accounting_payload(
  p_societa_id uuid,
  p_esercizio_id text,
  p_utente_id uuid,
  p_source_module text,
  p_source_document_id text,
  p_idempotency_key text,
  p_canonical_payload jsonb,
  p_options jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_mode text := 'commit';
  v_status text := 'failed';
  v_payload_id text;
  v_payload_version text;
  v_payload_hash text;
  v_request_id text;
  v_existing public.canonical_accounting_commit_audit%rowtype;
  v_audit public.canonical_accounting_commit_audit%rowtype;
  v_result jsonb := '{}'::jsonb;
  v_warnings jsonb := '[]'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_payload_text text;
  v_source_module text := lower(trim(coalesce(p_source_module, '')));
  v_source_document_id text := trim(coalesce(p_source_document_id, ''));
  v_idempotency_key text := trim(coalesce(p_idempotency_key, ''));
  v_expected_version text := trim(coalesce(p_options->>'expectedPayloadVersion', ''));
  v_allow_real_commit boolean := coalesce((p_options->>'allowRealCommit')::boolean, false);
  v_dry_run boolean := coalesce((p_options->>'dryRun')::boolean, true);
begin
  -- ------------------------------------------------------------------------
  -- 3.1 Validazione input obbligatori
  -- ------------------------------------------------------------------------
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

  if v_idempotency_key = '' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('idempotencyKey mancante'));
  end if;

  if p_canonical_payload is null then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('canonicalPayload mancante'));
  end if;

  if v_expected_version <> '' then
    v_payload_version := coalesce(p_canonical_payload->>'schemaVersion', p_canonical_payload->>'payloadVersion');
    if coalesce(v_payload_version, '') <> v_expected_version then
      return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('payload version incompatibile'));
    end if;
  else
    v_payload_version := coalesce(p_canonical_payload->>'schemaVersion', p_canonical_payload->>'payloadVersion');
  end if;

  -- ------------------------------------------------------------------------
  -- 3.2 Legacy guard e payload sanity
  -- ------------------------------------------------------------------------
  v_payload_text := lower(coalesce(p_canonical_payload::text, ''));
  if v_payload_text like '%"accounting_entries"%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy reference accounting_entries rilevata'));
  end if;

  if v_payload_text like '%"documenti_import"%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('documenti_import non ammesso come target finale'));
  end if;

  if v_payload_text like '%"createscritturacontabile"%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy createScritturaContabile rilevata'));
  end if;

  if v_payload_text like '%"import_fatture"%' or v_payload_text like '%"import_nuovo"%' or v_payload_text like '%"import_unificato"%' then
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', jsonb_build_array('legacy source commit path rilevato'));
  end if;

  -- TODO: validare blockers reali del payload canonico con schema/validator condiviso.
  if coalesce(jsonb_array_length(coalesce(p_canonical_payload->'blockers', '[]'::jsonb)), 0) > 0 then
    v_blockers := coalesce(p_canonical_payload->'blockers', '[]'::jsonb);
    return jsonb_build_object('success', false, 'status', 'blocked', 'blockers', v_blockers);
  end if;

  -- ------------------------------------------------------------------------
  -- 3.3 Hash deterministico del payload
  -- ------------------------------------------------------------------------
  -- TODO: normalizzare in modo canonico prima dell'hash.
  -- Preferenza: digest(normalized_payload_text, 'sha256') se pgcrypto e disponibile.
  -- In questa fase il draft assume un hash leggibile e stabile solo come placeholder tecnico.
  v_payload_hash := coalesce(p_options->>'payloadHash', p_canonical_payload->>'payloadHash');
  if nullif(trim(coalesce(v_payload_hash, '')), '') is null then
    v_payload_hash := md5(coalesce(p_canonical_payload::text, ''));
    -- Se pgcrypto e disponibile, sostituire md5 con sha256 in fase di review.
  end if;

  v_payload_id := coalesce(nullif(trim(coalesce(p_canonical_payload->>'payloadId', '')), ''), v_idempotency_key);

  -- ------------------------------------------------------------------------
  -- 3.4 Replay / idempotenza
  -- ------------------------------------------------------------------------
  select *
    into v_existing
  from public.canonical_accounting_commit_audit
  where idempotency_key = v_idempotency_key
  limit 1;

  if found then
    if coalesce(v_existing.payload_hash, '') = coalesce(v_payload_hash, '') then
      return jsonb_build_object(
        'success', true,
        'mode', v_existing.mode,
        'status', 'replayed',
        'idempotencyKey', v_idempotency_key,
        'payloadId', v_existing.payload_id,
        'sourceModule', v_existing.source_module,
        'sourceDocumentId', v_existing.source_document_id,
        'createdIds', coalesce(v_existing.created_ids, '{}'::jsonb),
        'reusedExistingCommit', true,
        'warnings', coalesce(v_existing.warnings, '[]'::jsonb),
        'blockers', coalesce(v_existing.blockers, '[]'::jsonb),
        'auditId', v_existing.id,
        'resultSnapshot', coalesce(v_existing.result_snapshot, '{}'::jsonb)
      );
    end if;

    return jsonb_build_object(
      'success', false,
      'mode', coalesce(v_existing.mode, v_mode),
      'status', 'blocked',
      'idempotencyKey', v_idempotency_key,
      'payloadId', v_payload_id,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', '[]'::jsonb,
      'blockers', jsonb_build_array('idempotency_conflict'),
      'auditId', v_existing.id,
      'resultSnapshot', coalesce(v_existing.result_snapshot, '{}'::jsonb)
    );
  end if;

  -- ------------------------------------------------------------------------
  -- 3.5 Dry run
  -- ------------------------------------------------------------------------
  v_mode := case when v_dry_run then 'dry_run' else 'commit' end;

  if v_dry_run then
    insert into public.canonical_accounting_commit_audit (
      societa_id,
      esercizio_id,
      utente_id,
      source_module,
      source_document_id,
      idempotency_key,
      payload_id,
      payload_version,
      payload_hash,
      mode,
      status,
      created_ids,
      payload_snapshot,
      result_snapshot,
      warnings,
      blockers,
      error_message
    ) values (
      p_societa_id,
      p_esercizio_id,
      p_utente_id,
      v_source_module,
      v_source_document_id,
      v_idempotency_key,
      v_payload_id,
      v_payload_version,
      v_payload_hash,
      v_mode,
      'dry_run',
      '{}'::jsonb,
      p_canonical_payload,
      jsonb_build_object(
        'status', 'dry_run',
        'mode', v_mode,
        'reusedExistingCommit', false,
        'sourceModule', v_source_module,
        'sourceDocumentId', v_source_document_id,
        'payloadHash', v_payload_hash
      ),
      coalesce(v_warnings, '[]'::jsonb),
      coalesce(v_blockers, '[]'::jsonb),
      null
    )
    returning * into v_audit;

    return jsonb_build_object(
      'success', true,
      'mode', 'dry_run',
      'status', 'dry_run',
      'idempotencyKey', v_idempotency_key,
      'payloadId', v_payload_id,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', coalesce(v_warnings, '[]'::jsonb),
      'blockers', '[]'::jsonb,
      'auditId', v_audit.id,
      'resultSnapshot', v_audit.result_snapshot
    );
  end if;

  if not v_allow_real_commit then
    return jsonb_build_object(
      'success', false,
      'mode', 'commit',
      'status', 'blocked',
      'idempotencyKey', v_idempotency_key,
      'payloadId', v_payload_id,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', '[]'::jsonb,
      'blockers', jsonb_build_array('real commit disabled in draft'),
      'auditId', null,
      'resultSnapshot', '{}'::jsonb
    );
  end if;

  -- ------------------------------------------------------------------------
  -- 3.6 Commit reale - solo skeleton tecnico
  -- ------------------------------------------------------------------------
  -- TODO: creare prima_nota.
  -- TODO: creare prima_nota_righe.
  -- TODO: creare registri_iva.
  -- TODO: creare partitario.
  -- TODO: aggiornare stato del movimento bancario / documento sorgente.
  -- TODO: inserire o aggiornare audit committed.
  -- TODO: usare la stessa transazione per tutte le scritture.

  -- Il draft non esegue write reali.
  return jsonb_build_object(
    'success', false,
    'mode', 'commit',
    'status', 'blocked',
    'idempotencyKey', v_idempotency_key,
    'payloadId', v_payload_id,
    'sourceModule', v_source_module,
    'sourceDocumentId', v_source_document_id,
    'createdIds', '{}'::jsonb,
    'reusedExistingCommit', false,
    'warnings', coalesce(v_warnings, '[]'::jsonb),
    'blockers', jsonb_build_array('commit path draft only - no real writes executed'),
    'auditId', null,
    'resultSnapshot', '{}'::jsonb
  );

exception
  when others then
    -- Rollback implicito della funzione. Nessuna scrittura finale deve restare parziale.
    -- Se si decidesse di scrivere un audit failed, farlo solo se la strategia e sicura.
    return jsonb_build_object(
      'success', false,
      'mode', v_mode,
      'status', case when v_mode = 'commit' then 'failed_rollback' else 'failed' end,
      'idempotencyKey', v_idempotency_key,
      'payloadId', v_payload_id,
      'sourceModule', v_source_module,
      'sourceDocumentId', v_source_document_id,
      'createdIds', '{}'::jsonb,
      'reusedExistingCommit', false,
      'warnings', coalesce(v_warnings, '[]'::jsonb),
      'blockers', coalesce(v_blockers, '[]'::jsonb),
      'auditId', null,
      'resultSnapshot', jsonb_build_object('error', sqlerrm)
    );
end;
$$;

-- ============================================================================
-- 4. RLS / grant notes
-- ============================================================================
-- Enable RLS on canonical_accounting_commit_audit before production use.
-- Do not use allow_all policies on target final tables in production.
-- Prefer service-role only access for server-side RPC execution.
-- Grant EXECUTE only to the server-side role expected to call the RPC.
-- Example pattern only; review against the real Supabase role model before apply.

-- alter table public.canonical_accounting_commit_audit enable row level security;
-- create policy canonical_accounting_commit_audit_service_only
--   on public.canonical_accounting_commit_audit
--   for all
--   using (auth.role() = 'service_role')
--   with check (auth.role() = 'service_role');
-- grant execute on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, jsonb, jsonb) to service_role;

-- ============================================================================
-- 5. Final notes
-- ============================================================================
-- Non applicare direttamente.
-- Richiede review dello schema reale e delle colonne gia presenti.
-- Richiede test in ambiente isolato.
-- Richiede controllo RLS e policy server-side.