export function parseRitenutaDecimalInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const parsed = Number(text.replace(/\s+/g, '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

export function resolveRitenutaNumericInputValue(rawValue, calculatedValue = '') {
  if (rawValue !== undefined && rawValue !== null && String(rawValue) !== '') {
    return rawValue
  }
  return calculatedValue ?? ''
}
