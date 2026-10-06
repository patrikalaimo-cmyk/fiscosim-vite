function cloneDeep(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

export function round2(value) {
  const number = Number(value ?? 0)
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0
}

export function normalizeText(value) {
  return String(value ?? '').trim()
}

export function buildPayloadId(movementId = '', decisionId = '') {
  const movement = normalizeText(movementId) || 'movement'
  const decision = normalizeText(decisionId) || 'decision'
  return `crp-${movement}-${decision}`
}

export function cloneCanonical(value) {
  return cloneDeep(value)
}