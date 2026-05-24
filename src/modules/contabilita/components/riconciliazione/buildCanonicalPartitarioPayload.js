import { normalizeText, round2 } from './canonicalReconciliationPayloadUtils.js'

function buildMovementId(decision = {}, index = 0) {
  return `pm-${normalizeText(decision?.decisionId || decision?.movementId || 'movement')}-${index + 1}`
}

export function buildCanonicalPartitarioPayload({ decision = {}, context = {} } = {}) {
  const selectedMatch = decision.selectedMatch || {}
  const decisionType = normalizeText(decision.decisionType).toLowerCase()
  const amount = round2(context.movementAmount ?? decision?.accountingProposal?.righe?.reduce((sum, row) => sum + round2(row?.importo), 0) ?? 0)

  if (!['match_partita', 'match_parziale', 'pagamento_parcella'].includes(decisionType)) {
    return []
  }

  if (Array.isArray(selectedMatch?.subsetPartitaIds) && selectedMatch.subsetPartitaIds.length > 0) {
    const residual = round2(selectedMatch?.residualAfterMatch ?? 0)
    const perPartita = round2(amount / selectedMatch.subsetPartitaIds.length)
    return selectedMatch.subsetPartitaIds.map((partitaId, index) => ({
      partitarioMovementId: buildMovementId(decision, index),
      partitaId,
      soggettoId: normalizeText(selectedMatch?.soggettoId) || null,
      soggettoTipo: normalizeText(selectedMatch?.soggettoTipo) || null,
      action: residual > 0 ? 'chiusura_parziale' : 'chiusura_totale',
      importoChiusura: perPartita,
      residualAfterMatch: residual,
      movementId: normalizeText(decision?.movementId) || null,
      decisionId: normalizeText(decision?.decisionId) || null,
    }))
  }

  const residualAfterMatch = round2(selectedMatch?.residualAfterMatch ?? 0)
  const action =
    decisionType === 'pagamento_parcella'
      ? (residualAfterMatch > 0 ? 'collegamento_pagamento' : 'chiusura_totale')
      : residualAfterMatch > 0 || decisionType === 'match_parziale'
        ? 'chiusura_parziale'
        : 'chiusura_totale'

  return [{
    partitarioMovementId: buildMovementId(decision, 0),
    partitaId: normalizeText(selectedMatch.partitaId) || null,
    soggettoId: normalizeText(selectedMatch.soggettoId) || null,
    soggettoTipo: normalizeText(selectedMatch.soggettoTipo) || null,
    action,
    importoChiusura: round2(selectedMatch?.amountMatched ?? amount),
    residualAfterMatch,
    movementId: normalizeText(decision?.movementId) || null,
    decisionId: normalizeText(decision?.decisionId) || null,
  }]
}