import { normalizeText } from './canonicalReconciliationPayloadUtils.js'

export function buildCanonicalPrimaNotaPayload({ decision = {}, context = {}, accountingRows = [] } = {}) {
  const accountingProposal = decision.accountingProposal || {}
  const selectedMatch = decision.selectedMatch || {}

  if (!accountingProposal || !Array.isArray(accountingRows) || accountingRows.length === 0) {
    return null
  }

  return {
    tipoOrigine: 'riconciliazione_bancaria',
    origineId: normalizeText(decision.movementId) || null,
    causaleBancaria: normalizeText(accountingProposal.causaleBancaria) || null,
    descrizione: normalizeText(accountingProposal.descrizione) || `Movimento bancario ${normalizeText(decision.movementId) || ''}`.trim(),
    dataRegistrazione: normalizeText(context.registrationDate) || null,
    dataOperazione: normalizeText(context.operationDate) || null,
    contoBancaId: normalizeText(context.bankAccountId) || null,
    contoBancaCodice: normalizeText(context.bankAccountCode) || null,
    contoBancaDescrizione: normalizeText(context.bankAccountDescription) || null,
    controparteId: normalizeText(selectedMatch.soggettoId) || null,
    controparteTipo: normalizeText(selectedMatch.soggettoTipo) || null,
    status: 'draft_from_reconciliation',
  }
}