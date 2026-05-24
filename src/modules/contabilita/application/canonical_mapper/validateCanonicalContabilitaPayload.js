export function validateCanonicalContabilitaPayload(normalizedPayload = {}) {
  return normalizedPayload?.contractValidation || {
    status: 'blocked',
    blockers: ['payload canonico non normalizzato'],
    warnings: [],
    totals: { dare: 0, avere: 0 },
    rows: [],
  }
}
