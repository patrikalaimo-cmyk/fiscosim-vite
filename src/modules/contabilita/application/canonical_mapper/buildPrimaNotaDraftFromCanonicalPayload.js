import { buildPrimaNotaHeaderFromCanonicalPayload } from './buildPrimaNotaHeaderFromCanonicalPayload.js'
import { buildPrimaNotaRowsFromCanonicalPayload } from './buildPrimaNotaRowsFromCanonicalPayload.js'
import { calculatePrimaNotaDraftTotals } from './calculatePrimaNotaDraftTotals.js'
import { normalizeCanonicalContabilitaPayload } from './normalizeCanonicalContabilitaPayload.js'
import { validateCanonicalContabilitaPayload } from './validateCanonicalContabilitaPayload.js'
import { validatePrimaNotaDraftRows } from './validatePrimaNotaDraftRows.js'

export function buildPrimaNotaDraftFromCanonicalPayload(payload = {}) {
  const normalized = normalizeCanonicalContabilitaPayload(payload)
  const contractValidation = validateCanonicalContabilitaPayload(normalized)
  const classification = normalized.classification
  const readiness = normalized.readiness
  const rows = buildPrimaNotaRowsFromCanonicalPayload(normalized)
  const totals = calculatePrimaNotaDraftTotals(rows)
  const rowValidation = validatePrimaNotaDraftRows(rows, totals)
  const isReady = contractValidation.status !== 'blocked' && rowValidation.status !== 'blocked' && readiness.status === 'pronto_per_contabilita'

  const pnPayload = buildPrimaNotaHeaderFromCanonicalPayload(normalized, classification)
  const draft = {
    stato: isReady ? 'bozza_pronta' : 'bozza_bloccata',
    header: {
      data_registrazione: normalized.document.registrationDate || null,
      data_documento: normalized.document.documentDate || null,
      numero_documento: normalized.document.number || null,
      causale_id: normalized.accounting.causaleContabile.id || null,
      cliente_fornitore_id: normalized.document.counterparty.accountId || null,
      cliente_fornitore_nome: normalized.document.counterparty.name || '',
      totale_dare: totals.dare,
      totale_avere: totals.avere,
    },
    rows,
    ivaRows: Array.isArray(normalized.vat.rows) ? normalized.vat.rows : [],
    meta: {
      sourceModule: normalized.handoff.sourceModule || 'import_contabilita',
      sourceBatchId: normalized.handoff.sourceBatchId || null,
      sourceRowKey: normalized.handoff.sourceRowKey || null,
      sourceFileName: normalized.handoff.sourceFileName || null,
      classificationCode: classification.code,
      classificationLabel: classification.label,
      readinessStatus: readiness.status,
    },
    validation: {
      status: rowValidation.status === 'blocked' || contractValidation.status === 'blocked' ? 'blocked' : (rowValidation.status === 'warning' || contractValidation.status === 'warning' ? 'warning' : 'ok'),
      blockers: [...new Set([...(contractValidation.blockers || []), ...(rowValidation.blockers || [])])],
      warnings: [...new Set([...(contractValidation.warnings || []), ...(rowValidation.warnings || [])])],
      totals,
      rows,
    },
  }

  return {
    normalized,
    classification,
    readiness,
    validation: draft.validation,
    pnPayload,
    righePayload: rows,
    draft,
  }
}
