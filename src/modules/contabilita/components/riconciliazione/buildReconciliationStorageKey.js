function normalizeSegment(value) {
  const text = String(value ?? '').trim().toLowerCase()
  if (!text) return 'default'
  return text
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    || 'default'
}

export function buildReconciliationStorageKey({ societaId, bankAccountId, period } = {}) {
  return [
    'reconciliationDraft',
    normalizeSegment(societaId),
    normalizeSegment(bankAccountId),
    normalizeSegment(period),
  ].join(':')
}

