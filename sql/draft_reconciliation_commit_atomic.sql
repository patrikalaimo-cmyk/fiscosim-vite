-- Draft non applicata per commit atomico riconciliazione bancaria.
-- Scopo: specifica tecnica per la futura RPC `commit_reconciliation_canonical_payload`.
-- Questo file NON deve essere eseguito automaticamente.

BEGIN;

CREATE TABLE IF NOT EXISTS reconciliation_commit_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  societa_id UUID NOT NULL REFERENCES societa(id) ON DELETE CASCADE,
  esercizio_id UUID,
  movement_id UUID NOT NULL,
  decision_id UUID NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_id TEXT,
  status TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'commit',
  prima_nota_id UUID REFERENCES prima_nota(id),
  created_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
  payload_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  warnings JSONB NOT NULL DEFAULT '[]'::jsonb,
  blockers JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID,
  supported_case TEXT,
  source TEXT,
  source_decision_status TEXT,
  commit_version TEXT DEFAULT 'r9b-atomic-1',
  error_code TEXT,
  error_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_commit_audit_societa
  ON reconciliation_commit_audit (societa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_reconciliation_commit_audit_movement
  ON reconciliation_commit_audit (movement_id, decision_id);

-- Campi aggiuntivi proposti su movimenti_bancari.
ALTER TABLE movimenti_bancari
  ADD COLUMN IF NOT EXISTS reconciliation_decision_id UUID,
  ADD COLUMN IF NOT EXISTS reconciliation_commit_audit_id UUID,
  ADD COLUMN IF NOT EXISTS reconciled_reason TEXT;

-- Draft FK proposto: applicare solo dopo verifica che il vincolo non esista già.
-- ALTER TABLE movimenti_bancari
--   ADD CONSTRAINT fk_movimenti_bancari_reconciliation_audit
--   FOREIGN KEY (reconciliation_commit_audit_id)
--   REFERENCES reconciliation_commit_audit(id);

-- Policy RLS: draft conservativo. In produzione non usare allow_all.
ALTER TABLE reconciliation_commit_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimenti_bancari ENABLE ROW LEVEL SECURITY;

-- Le policy effettive dovranno essere sostituite con helper che validano societa_id.
-- Esempio di principio:
-- CREATE POLICY reconciliation_commit_audit_server_only
--   ON reconciliation_commit_audit
--   FOR ALL
--   USING (auth.role() = 'service_role')
--   WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION commit_reconciliation_canonical_payload(
  p_societa_id UUID,
  p_esercizio_id UUID,
  p_utente_id UUID,
  p_movement_id UUID,
  p_decision_id UUID,
  p_idempotency_key TEXT,
  p_canonical_payload JSONB
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing reconciliation_commit_audit%ROWTYPE;
  v_commit reconciliation_commit_audit%ROWTYPE;
  v_prima_nota_id UUID;
  v_created_ids JSONB := '{}'::jsonb;
  v_status TEXT;
  v_mode TEXT;
  v_source TEXT;
  v_source_decision_status TEXT;
  v_supported_case TEXT;
BEGIN
  SELECT *
  INTO v_existing
  FROM reconciliation_commit_audit
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF FOUND THEN
    RETURN COALESCE(v_existing.result_snapshot, '{}'::jsonb);
  END IF;

  v_source := COALESCE(p_canonical_payload->>'source', '');
  v_source_decision_status := COALESCE(p_canonical_payload->>'sourceDecisionStatus', '');
  v_supported_case := COALESCE(p_canonical_payload->>'supportedCase', '');

  IF v_source <> 'riconciliazione_bancaria' THEN
    RAISE EXCEPTION 'invalid source for reconciliation commit';
  END IF;

  IF COALESCE((p_canonical_payload->>'valid')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'canonical payload is not valid';
  END IF;

  IF v_source_decision_status NOT IN ('accepted', 'ignored') THEN
    RAISE EXCEPTION 'unsupported decision status';
  END IF;

  IF COALESCE(jsonb_array_length(COALESCE(p_canonical_payload->'blockers', '[]'::jsonb)), 0) > 0 THEN
    RAISE EXCEPTION 'payload has blockers';
  END IF;

  IF v_source_decision_status = 'ignored' THEN
    UPDATE movimenti_bancari
      SET stato_riconciliazione = 'ignorato',
          riconciliato_da = p_utente_id,
          riconciliato_at = NOW(),
          reconciliation_decision_id = p_decision_id
    WHERE id = p_movement_id
      AND societa_id = p_societa_id;

    v_status := 'committed';
    v_mode := 'commit';

    INSERT INTO reconciliation_commit_audit (
      societa_id,
      esercizio_id,
      movement_id,
      decision_id,
      idempotency_key,
      payload_id,
      status,
      mode,
      prima_nota_id,
      created_ids,
      payload_snapshot,
      result_snapshot,
      warnings,
      blockers,
      created_by,
      supported_case,
      source,
      source_decision_status
    ) VALUES (
      p_societa_id,
      p_esercizio_id,
      p_movement_id,
      p_decision_id,
      p_idempotency_key,
      COALESCE(p_canonical_payload->>'payloadId', p_idempotency_key),
      v_status,
      v_mode,
      NULL,
      COALESCE(p_canonical_payload->'createdIds', '{}'::jsonb),
      p_canonical_payload,
      jsonb_build_object(
        'status', v_status,
        'mode', v_mode,
        'committed', true,
        'createdIds', COALESCE(p_canonical_payload->'createdIds', '{}'::jsonb),
        'warnings', COALESCE(p_canonical_payload->'warnings', '[]'::jsonb),
        'blockers', '[]'::jsonb,
        'movementId', p_movement_id,
        'decisionId', p_decision_id
      ),
      COALESCE(p_canonical_payload->'warnings', '[]'::jsonb),
      '[]'::jsonb,
      p_utente_id,
      v_supported_case,
      v_source,
      v_source_decision_status
    )
    RETURNING * INTO v_commit;

    UPDATE movimenti_bancari
      SET reconciliation_commit_audit_id = v_commit.id
    WHERE id = p_movement_id
      AND societa_id = p_societa_id;

    RETURN v_commit.result_snapshot;
  END IF;

  -- Caso contabile supportato: prima nota, righe, partitario, riconciliazione movimento.
  INSERT INTO prima_nota (
    societa_id,
    esercizio,
    data_registrazione,
    data_documento,
    numero_documento,
    causale_id,
    causale_codice,
    descrizione,
    conto_cliente_fornitore_id,
    cliente_fornitore_codice,
    cliente_fornitore_nome,
    totale_dare,
    totale_avere,
    stato,
    tipo_registrazione,
    created_by
  )
  VALUES (
    p_societa_id,
    0,
    COALESCE((p_canonical_payload #>> '{primaNota,dataRegistrazione}')::date, CURRENT_DATE),
    (p_canonical_payload #>> '{primaNota,dataDocumento}')::date,
    p_canonical_payload #>> '{primaNota,numeroDocumento}',
    NULL,
    p_canonical_payload #>> '{primaNota,causaleCodice}',
    p_canonical_payload #>> '{primaNota,descrizione}',
    NULL,
    p_canonical_payload #>> '{primaNota,soggettoCodice}',
    p_canonical_payload #>> '{primaNota,soggettoNome}',
    COALESCE((p_canonical_payload #>> '{primaNota,totaleDare}')::numeric, 0),
    COALESCE((p_canonical_payload #>> '{primaNota,totaleAvere}')::numeric, 0),
    'provvisoria',
    'riconciliazione_bancaria',
    p_utente_id
  )
  RETURNING id INTO v_prima_nota_id;

  INSERT INTO prima_nota_righe (
    prima_nota_id,
    riga_numero,
    conto_id,
    conto_codice,
    conto_descrizione,
    descrizione_riga,
    importo_dare,
    importo_avere,
    causale_iva_id,
    causale_iva_codice,
    imponibile,
    iva,
    partita_aperta,
    partita_id
  )
  SELECT
    v_prima_nota_id,
    COALESCE((row->>'rigaNumero')::integer, ordinality),
    NULL,
    row->>'contoCodice',
    row->>'contoDescrizione',
    row->>'descrizioneRiga',
    COALESCE((row->>'importoDare')::numeric, 0),
    COALESCE((row->>'importoAvere')::numeric, 0),
    NULL,
    row->>'causaleIvaCodice',
    COALESCE((row->>'imponibile')::numeric, 0),
    COALESCE((row->>'iva')::numeric, 0),
    false,
    NULL
  FROM jsonb_array_elements(COALESCE(p_canonical_payload->'primaNotaRighe', '[]'::jsonb)) WITH ORDINALITY AS t(row, ordinality);

  INSERT INTO partitario (
    societa_id,
    tipo,
    conto_id,
    conto_codice,
    conto_descrizione,
    prima_nota_id,
    numero_documento,
    data_documento,
    data_scadenza,
    importo_originale,
    importo_pagato,
    importo_residuo,
    stato,
    chiusa_da_prima_nota_id,
    data_chiusura,
    created_at,
    updated_at
  )
  SELECT
    p_societa_id,
    COALESCE(row->>'tipo', 'cliente'),
    NULL,
    row->>'contoCodice',
    row->>'contoDescrizione',
    v_prima_nota_id,
    row->>'numeroDocumento',
    (row->>'dataDocumento')::date,
    (row->>'dataScadenza')::date,
    COALESCE((row->>'importoOriginale')::numeric, 0),
    COALESCE((row->>'importoPagato')::numeric, 0),
    COALESCE((row->>'importoResiduo')::numeric, 0),
    COALESCE(row->>'stato', 'aperta'),
    v_prima_nota_id,
    CURRENT_DATE,
    NOW(),
    NOW()
  FROM jsonb_array_elements(COALESCE(p_canonical_payload->'partitarioMovements', '[]'::jsonb)) AS t(row);

  UPDATE movimenti_bancari
    SET stato_riconciliazione = 'confermato',
        riconciliato_da = p_utente_id,
        riconciliato_at = NOW(),
        prima_nota_id = v_prima_nota_id,
        reconciliation_decision_id = p_decision_id
  WHERE id = p_movement_id
    AND societa_id = p_societa_id;

  v_status := 'committed';
  v_mode := 'commit';
  v_created_ids := jsonb_build_object('prima_nota_id', v_prima_nota_id);

  INSERT INTO reconciliation_commit_audit (
    societa_id,
    esercizio_id,
    movement_id,
    decision_id,
    idempotency_key,
    payload_id,
    status,
    mode,
    prima_nota_id,
    created_ids,
    payload_snapshot,
    result_snapshot,
    warnings,
    blockers,
    created_by,
    supported_case,
    source,
    source_decision_status
  ) VALUES (
    p_societa_id,
    p_esercizio_id,
    p_movement_id,
    p_decision_id,
    p_idempotency_key,
    COALESCE(p_canonical_payload->>'payloadId', p_idempotency_key),
    v_status,
    v_mode,
    v_prima_nota_id,
    v_created_ids,
    p_canonical_payload,
    jsonb_build_object(
      'status', v_status,
      'mode', v_mode,
      'committed', true,
      'createdIds', v_created_ids,
      'warnings', COALESCE(p_canonical_payload->'warnings', '[]'::jsonb),
      'blockers', '[]'::jsonb,
      'movementId', p_movement_id,
      'decisionId', p_decision_id,
      'primaNotaId', v_prima_nota_id
    ),
    COALESCE(p_canonical_payload->'warnings', '[]'::jsonb),
    '[]'::jsonb,
    p_utente_id,
    v_supported_case,
    v_source,
    v_source_decision_status
  )
  RETURNING * INTO v_commit;

  UPDATE movimenti_bancari
    SET reconciliation_commit_audit_id = v_commit.id
  WHERE id = p_movement_id
    AND societa_id = p_societa_id;

  RETURN v_commit.result_snapshot;
END;
$$;

COMMIT;