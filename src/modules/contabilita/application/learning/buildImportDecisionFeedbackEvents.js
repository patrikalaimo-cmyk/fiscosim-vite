/**
 * Build DecisionFeedback events from a successful Import Contabilità commit.
 */

import { buildDecisionFeedbackEvent } from './buildDecisionFeedbackEvent.js'

function text(value) {
  return String(value ?? '').trim()
}

function accountId(value) {
  if (!value || typeof value !== 'object') return text(value)
  return text(value.id || value.conto_id || value.accountId)
}

function causaleId(value) {
  if (!value || typeof value !== 'object') return text(value)
  return text(value.id || value.causale_id || value.causaleId)
}

/**
 * @param {object} params
 * @returns {object[]}
 */
export function buildImportDecisionFeedbackEvents({
  societaId = '',
  commitResult = {},
  workingViewModel = null,
  selectedAccount = null,
  selectedCausale = null,
  proposedAccount = null,
  proposedCausale = null,
  ivaDraftRows = [],
  dryRun = false,
} = {}) {
  if (dryRun) return []
  if (!commitResult?.success && !commitResult?.primaNotaId) return []

  const requestId = text(commitResult.requestId || commitResult.request_id)
  const primaNotaId = text(commitResult.primaNotaId || commitResult.prima_nota_id)
  if (!requestId && !primaNotaId) return []

  const base = {
    societaId,
    sourceModule: 'import_contabilita',
    requestId,
    primaNotaId,
    documentId: text(
      workingViewModel?.parsedDocument?.id
        || workingViewModel?.documentId
        || workingViewModel?.rowKey
        || '',
    ),
    outcome: 'confirmed',
    committed: true,
    dryRun: false,
    contextKey: text(
      workingViewModel?.counterpartyAccount?.partitaIva
        || workingViewModel?.parsedDocument?.fornitore?.partitaIva
        || workingViewModel?.parsedDocument?.cedente?.partitaIva
        || '',
    ),
    counterpartyKey: text(
      workingViewModel?.counterpartyAccount?.descrizione
        || workingViewModel?.parsedDocument?.fornitore?.denominazione
        || workingViewModel?.parsedDocument?.cedente?.denominazione
        || '',
    ).toLowerCase(),
  }

  const events = []

  const finalAccount = accountId(selectedAccount) || accountId(workingViewModel?.account)
  const propAccount = accountId(proposedAccount)
  if (finalAccount) {
    events.push(buildDecisionFeedbackEvent({
      ...base,
      field: 'account',
      proposedValue: propAccount || null,
      proposedSource: proposedAccount?._importHistorySuggested ? 'history' : text(proposedAccount?.source) || null,
      finalValue: finalAccount,
    }))
  }

  const finalCausale = causaleId(selectedCausale) || causaleId(workingViewModel?.causale)
  const propCausale = causaleId(proposedCausale)
  if (finalCausale) {
    events.push(buildDecisionFeedbackEvent({
      ...base,
      field: 'causale',
      proposedValue: propCausale || null,
      proposedSource: proposedCausale?._importHistorySuggested ? 'history' : text(proposedCausale?.source) || null,
      finalValue: finalCausale,
    }))
  }

  for (const row of Array.isArray(ivaDraftRows) ? ivaDraftRows : []) {
    const finalIva = text(row?.causaleIvaId)
    if (!finalIva) continue
    const proposedIva = text(row?.standardCausaleIvaId || row?.historicalCausaleIvaId)
    events.push(buildDecisionFeedbackEvent({
      ...base,
      field: 'causale_iva',
      proposedValue: proposedIva || null,
      proposedSource: text(row?.causaleIvaSuggestionSource) || null,
      finalValue: finalIva,
      contextKey: `${base.contextKey}|${Number(row?.aliquota || 0)}`,
    }))
  }

  return events.filter(Boolean)
}
