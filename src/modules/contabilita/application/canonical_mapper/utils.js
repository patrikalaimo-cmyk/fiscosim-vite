export function normalizeText(value) {
  return String(value ?? '').trim()
}

export function toNumber(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

export function round2(value) {
  return Math.round(toNumber(value) * 100) / 100
}
