import { buildPrimaNotaDraftFromCanonicalPayload as buildCanonicalDraft } from './canonical_mapper/buildPrimaNotaDraftFromCanonicalPayload.js'

export { normalizeCanonicalContabilitaPayload } from './canonical_mapper/normalizeCanonicalContabilitaPayload.js'
export { buildPrimaNotaDraftFromCanonicalPayload } from './canonical_mapper/buildPrimaNotaDraftFromCanonicalPayload.js'

export function buildPrimaNotaDraftFromCanonicalContabilitaPayload(payload = {}) {
  return buildCanonicalDraft(payload)
}
