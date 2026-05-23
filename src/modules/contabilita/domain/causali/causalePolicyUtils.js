import { normalizeText } from '../../application/canonical_mapper/utils.js'

export function normalizePolicyKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

export function pickPolicyText(item, keys = []) {
  for (const key of keys) {
    const text = String(item?.[key] || '').trim()
    if (text) return text
  }
  return ''
}

export function pickPolicyNumber(item, keys = []) {
  for (const key of keys) {
    const raw = item?.[key]
    if (raw === '' || raw == null) continue
    const match = String(raw).trim().match(/-?\d+(?:[.,]\d+)?/)
    const parsed = match ? Number(match[0].replace(',', '.')) : Number(String(raw).replace(',', '.'))
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

export function pickPolicyBoolean(item, keys = []) {
  for (const key of keys) {
    const value = item?.[key]
    if (value === true || value === 'true' || value === 1 || value === '1' || value === 'SI' || value === 'S' || value === 'X') {
      return true
    }
    if (value === false || value === 'false' || value === 0 || value === '0' || value === 'NO' || value === 'N') {
      return false
    }
  }
  return null
}

export function hasPolicyField(item, keys = []) {
  return keys.some((key) => String(item?.[key] || '').trim())
}

export function isPolicyOneOf(value, expected = []) {
  const normalized = normalizePolicyKey(value)
  if (!normalized) return false
  return expected.some((candidate) => {
    const candidateKey = normalizePolicyKey(candidate)
    return candidateKey && (normalized === candidateKey || normalized.startsWith(candidateKey))
  })
}
