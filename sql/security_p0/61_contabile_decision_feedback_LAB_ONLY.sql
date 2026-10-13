-- SG-L2 DecisionFeedback — LAB-only table (append-only).
-- Apply ONLY on pinned P0 LAB Docker volume. No anon/authenticated grants.
-- Access path: service_role via isolated studio API with scopedCompanyIds.

DO $preflight$
BEGIN
  IF to_regclass('public.societa') IS NULL THEN
    RAISE EXCEPTION 'contabile_decision_feedback LAB install requires public.societa';
  END IF;
END
$preflight$;

CREATE TABLE IF NOT EXISTS public.contabile_decision_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  societa_id uuid NOT NULL REFERENCES public.societa(id) ON DELETE RESTRICT,
  studio_id uuid NULL,
  operator_auth_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  source_module text NOT NULL,
  document_id text NULL,
  movement_id text NULL,
  prima_nota_id uuid NULL REFERENCES public.prima_nota(id) ON DELETE SET NULL,
  request_id text NULL,
  field text NOT NULL,
  proposed_value text NULL,
  proposed_source text NULL,
  final_value text NULL,
  was_overridden boolean NOT NULL DEFAULT false,
  outcome text NOT NULL DEFAULT 'confirmed',
  rule_version text NOT NULL DEFAULT 'lab-db-v1',
  context_key text NOT NULL DEFAULT '',
  amount numeric(18, 2) NULL,
  counterparty_key text NOT NULL DEFAULT '',
  -- Same precedence as decisionFeedbackDedupKey (requestId|primaNotaId|movementId|documentId)
  dedup_anchor text GENERATED ALWAYS AS (
    coalesce(
      nullif(btrim(request_id), ''),
      nullif(prima_nota_id::text, ''),
      nullif(btrim(movement_id), ''),
      nullif(btrim(document_id), ''),
      ''
    )
  ) STORED,
  created_at timestamptz NOT NULL DEFAULT transaction_timestamp(),
  deactivated_at timestamptz NULL,
  CONSTRAINT contabile_decision_feedback_source_check CHECK (
    source_module IN ('import_contabilita', 'registrazione_manual', 'riconciliazione_bancaria')
  ),
  CONSTRAINT contabile_decision_feedback_outcome_check CHECK (
    outcome IN ('confirmed', 'cancelled', 'reversed')
  ),
  CONSTRAINT contabile_decision_feedback_field_check CHECK (char_length(btrim(field)) > 0),
  CONSTRAINT contabile_decision_feedback_anchor_check CHECK (char_length(btrim(
    coalesce(
      nullif(btrim(request_id), ''),
      nullif(prima_nota_id::text, ''),
      nullif(btrim(movement_id), ''),
      nullif(btrim(document_id), ''),
      ''
    )
  )) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_contabile_decision_feedback_dedup_active
  ON public.contabile_decision_feedback (societa_id, field, dedup_anchor)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_contabile_decision_feedback_societa_created
  ON public.contabile_decision_feedback (societa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contabile_decision_feedback_context
  ON public.contabile_decision_feedback (societa_id, source_module, context_key)
  WHERE deactivated_at IS NULL;

ALTER TABLE public.contabile_decision_feedback ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.contabile_decision_feedback FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.contabile_decision_feedback TO service_role;

COMMENT ON TABLE public.contabile_decision_feedback IS
  'SG-L2 DecisionFeedback append-only LAB. API-scoped; no anon/authenticated grants.';
