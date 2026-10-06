import { normalizeMockText } from './riconciliazioneMockSelectors.js'

const START_HINTS = [
  /di seguito l'elenco movimenti del periodo/i,
  /data\s+valuta\s+uscite\s+entrate\s+descrizione/i,
]

const END_HINTS = [
  /saldo finale/i,
]

export function detectMovementSectionBounds(lines = []) {
  const normalizedLines = Array.isArray(lines) ? lines.map((line) => String(line || '')) : []
  let startIndex = -1
  let endIndex = normalizedLines.length

  for (let i = 0; i < normalizedLines.length; i++) {
    const line = normalizedLines[i]
    const normalized = normalizeMockText(line)
    if (startIndex < 0 && START_HINTS.some((pattern) => pattern.test(line) || pattern.test(normalized))) {
      startIndex = i
      continue
    }
    if (startIndex >= 0 && END_HINTS.some((pattern) => pattern.test(line) || pattern.test(normalized))) {
      endIndex = i
      break
    }
  }

  if (startIndex < 0) {
    const headerIndex = normalizedLines.findIndex((line) => /data\s+valuta.*uscite.*entrate.*descrizione/i.test(normalizeMockText(line)))
    startIndex = headerIndex >= 0 ? headerIndex : 0
  }

  if (endIndex < startIndex) {
    endIndex = normalizedLines.length
  }

  return {
    startIndex,
    endIndex,
    hasExplicitStart: startIndex > 0,
    hasExplicitEnd: endIndex < normalizedLines.length,
  }
}
