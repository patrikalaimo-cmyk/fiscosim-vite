/**
 * Server-side Import commit history from Stage3W claim table (LAB/read helper).
 */
import { parseImportFileHashMarker } from './importFileHashMarker.js'
import { buildImportCronologiaEntry } from './buildImportCronologiaEntry.js'

function text(value) {
  return String(value ?? '').trim()
}

export function buildImportFiscalCommitHistoryQuery({
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
    coalesce(request_payload->>'reason', request_payload->>'motivazione', '') AS motivazione,
    request_payload->'header'->>'descrizione' AS descrizione,
    request_payload->'header'->>'numero_documento' AS numero_documento,
    request_payload->'header'->>'data_registrazione' AS data_registrazione
  FROM public.fiscosim_fiscal_journal_claim
  WHERE societa_id='${societa.replace(/'/g, "''")}'::uuid
    AND coalesce(request_payload->>'source_module','')='import_contabilita'
  ORDER BY created_at DESC
  LIMIT ${safeLimit}
) t
`
}

export function normalizeImportFiscalCommitHistoryRows(rows = [], { societaId = '' } = {}) {
  return (Array.isArray(rows) ? rows : []).map((row) => {
    const marker = parseImportFileHashMarker(row.motivazione || '')
    return buildImportCronologiaEntry({
      societaId,
      sourceFileName: marker.sourceFileName,
      sourceHash: marker.sourceHash,
      esito: text(row.prima_nota_id) ? 'committed' : 'incomplete',
      primaNotaId: row.prima_nota_id,
      requestId: row.request_id,
      numeroDocumento: row.numero_documento,
      dataRegistrazione: row.data_registrazione,
      createdAt: row.created_at,
      contractKind: row.contract_kind,
    })
  })
}
