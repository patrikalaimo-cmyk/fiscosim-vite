import { buildIdempotencyKey } from '../components/riconciliazione/reconciliationCommitPlanning.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function deriveSourceDocumentId(context = {}, canonicalPayload = {}) {
  return normalizeText(
    context.sourceDocumentId
      || context.bankStatementId
      || canonicalPayload?.bankStatementId
      || canonicalPayload?.payloadId
      || canonicalPayload?.movementId
      || canonicalPayload?.decisionId
      || ''
  )
}

export function buildReconciliationCommitInput({ canonicalPayload, context = {}, options = {} } = {}) {
  const societaId = normalizeText(context.societaId || canonicalPayload?.societaId)
  const esercizioId = normalizeText(context.esercizioId || canonicalPayload?.esercizioId)
  const utenteId = normalizeText(context.utenteId || context.operatorId)
  const payloadId = normalizeText(context.payloadId || canonicalPayload?.payloadId || canonicalPayload?.id)
  const sourceDocumentId = deriveSourceDocumentId(context, canonicalPayload || {})
  const idempotencyKey = normalizeText(
    context.idempotencyKey
      || buildIdempotencyKey(canonicalPayload || {}, {
        societaId,
        esercizioId,
        idempotencyKey: context.idempotencyKey,
      })
  )

  return {
    societaId,
    esercizioId,
    utenteId,
    sourceModule: 'riconciliazione_bancaria',
    sourceDocumentId: sourceDocumentId || payloadId || canonicalPayload?.movementId || canonicalPayload?.decisionId || 'reconciliation',
    idempotencyKey,
    canonicalPayload,
    options: {
      ...options,
    },
  }
}