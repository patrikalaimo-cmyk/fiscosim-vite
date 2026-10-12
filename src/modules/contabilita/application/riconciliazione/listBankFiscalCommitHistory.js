/**
 * Server-side history of bank reconciliation commits from Stage3W claim table.
 * LAB/read helper — no secrets.
 */
function text(value) {
  return String(value ?? '').trim()
}

export function buildBankFiscalCommitHistoryQuery({
  societaId,
  limit = 50,
} = {}) {
  const societa = text(societaId)
  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200)
  if (!societa) throw new Error('SOCIETA_REQUIRED')
  return `
SELECT coalesce(json_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::json)
FROM (
  SELECT
    request_id::text AS request_id,
    prima_nota_id::text AS prima_nota_id,
    created_at::text AS created_at,
    request_payload->>'source_module' AS source_module,
    request_payload->>'contract_kind' AS contract_kind,
    request_payload->'header'->>'descrizione' AS descrizione,
    request_payload->'header'->>'numero_documento' AS numero_documento,
    request_payload->'header'->>'data_registrazione' AS data_registrazione
  FROM public.fiscosim_fiscal_journal_claim
  WHERE societa_id='${societa.replace(/'/g, "''")}'::uuid
    AND coalesce(request_payload->>'source_module','')='riconciliazione_bancaria'
  ORDER BY created_at DESC
  LIMIT ${safeLimit}
) t
`
}

export function normalizeBankFiscalCommitHistoryRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row) => ({
    requestId: text(row.request_id),
    primaNotaId: text(row.prima_nota_id),
    createdAt: text(row.created_at),
    sourceModule: text(row.source_module) || 'riconciliazione_bancaria',
    contractKind: text(row.contract_kind),
    descrizione: text(row.descrizione),
    numeroDocumento: text(row.numero_documento),
    dataRegistrazione: text(row.data_registrazione),
  }))
}
