export function parseRegistrazioneAmount(value) {
  const text = String(value ?? '').trim()
  if (!text) return 0

  let normalized = text.replace(/\s+/g, '')

  const lastComma = normalized.lastIndexOf(',')
  const lastDot = normalized.lastIndexOf('.')

  if (lastComma >= 0 && lastDot >= 0) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(/,/g, '.')
    } else {
      normalized = normalized.replace(/,/g, '')
    }
  } else if (lastComma >= 0) {
    normalized = normalized.replace(/,/g, '.')
  } else if (normalized.split('.').length > 2) {
    const parts = normalized.split('.')
    const decimal = parts.pop()
    normalized = `${parts.join('')}.${decimal}`
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : 0
}
