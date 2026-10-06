import { buildCanonicalPayloadHash } from '../../contabilita/canonical/canonicalPayloadHash.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeYear(value) {
  const text = normalizeText(value)
  return /^\d{4}$/.test(text) ? text : ''
}

function deriveSourceDocumentId(context = {}, canonicalPayload = {}) {
  return normalizeText(
    context.sourceDocumentId
      || context.sourceRowKey
      || canonicalPayload?.handoff?.sourceRowKey
      || canonicalPayload?.handoff?.sourceFileName
      || canonicalPayload?.document?.number
      || canonicalPayload?.document?.documentDate
      || context.payloadId
      || ''
  )
}

function deriveEsercizioId(context = {}, canonicalPayload = {}) {
  const candidateFromContext = normalizeYear(context.esercizioId)
  if (candidateFromContext) return candidateFromContext

  const candidateFromPayload = normalizeYear(canonicalPayload?.company?.esercizioId)
  if (candidateFromPayload) return candidateFromPayload

  const registrationDate = normalizeText(canonicalPayload?.document?.registrationDate)
  if (/^\d{4}-\d{2}-\d{2}$/.test(registrationDate)) return registrationDate.slice(0, 4)

  const documentDate = normalizeText(canonicalPayload?.document?.documentDate)
  if (/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) return documentDate.slice(0, 4)

  return normalizeYear(new Date().getFullYear())
}

function deriveImportFingerprint({ canonicalPayload = {}, sourceDocumentId = '', payloadId = '' } = {}) {
  const payloadHash = buildCanonicalPayloadHash(canonicalPayload)
  const sourceRowKey = normalizeText(canonicalPayload?.handoff?.sourceRowKey)
  const sourceBatchId = normalizeText(canonicalPayload?.handoff?.sourceBatchId)
  const documentNumber = normalizeText(canonicalPayload?.document?.number)
  const documentDate = normalizeText(canonicalPayload?.document?.documentDate)
  return [
    sourceDocumentId,
    payloadId,
    sourceRowKey,
    sourceBatchId,
    documentNumber,
    documentDate,
    payloadHash.slice(0, 16),
  ].filter(Boolean).join(':')
}

export function buildImportContabilitaCommitInput({ canonicalPayload, context = {}, options = {} } = {}) {
  const societaId = normalizeText(context.societaId || canonicalPayload?.company?.societaId)
  const esercizioId = deriveEsercizioId(context, canonicalPayload || {})
  const utenteId = normalizeText(context.utenteId || context.operatorId)
  const payloadId = normalizeText(context.payloadId || canonicalPayload?.payloadId || canonicalPayload?.id)
  const sourceDocumentId = deriveSourceDocumentId(context, canonicalPayload || {})
  const importFingerprint = normalizeText(
    context.importFingerprint
      || deriveImportFingerprint({
        canonicalPayload: canonicalPayload || {},
        sourceDocumentId,
        payloadId,
      })
  )
  const idempotencyKey = normalizeText(
    context.idempotencyKey
      || `import:${societaId}:${esercizioId}:${sourceDocumentId || payloadId || importFingerprint}`
  )

  return {
    societaId,
    esercizioId,
    utenteId,
    sourceModule: 'import_contabilita',
    sourceDocumentId: sourceDocumentId || payloadId || importFingerprint,
    idempotencyKey,
    canonicalPayload,
    options: {
      ...options,
    },
  }
}