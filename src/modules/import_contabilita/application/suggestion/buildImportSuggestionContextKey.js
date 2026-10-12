/**
 * SG-L3 — contextual suggestion keys (controparte + direzione + descrizione/prodotto).
 */

import {
  extractImportDescriptionToken,
  tokenizeImportDescription,
} from '../../domain/importContabilitaDescriptionToken.js'

function text(value) {
  return String(value ?? '').trim()
}

function normalizeToken(value) {
  return text(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export { extractImportDescriptionToken, tokenizeImportDescription }

export function buildImportSuggestionContextKey({
  counterpartyPiva = '',
  counterpartyName = '',
  direction = '',
  parsedDocument = null,
  descriptionToken = null,
} = {}) {
  const piva = text(counterpartyPiva).replace(/^IT/i, '')
  const name = normalizeToken(counterpartyName).replace(/\s+/g, '_')
  const dir = text(direction).toLowerCase() || 'unknown'
  const desc = descriptionToken == null
    ? extractImportDescriptionToken(parsedDocument)
    : tokenizeImportDescription(descriptionToken)

  const identity = piva ? `piva:${piva}` : name ? `name:${name}` : 'unknown'
  const base = `${identity}|${dir}`
  return desc ? `${base}|desc:${desc}` : base
}

/**
 * Score overlap between a stored context key and the current document key.
 * Higher = better contextual match (exact desc > same identity+dir > identity only).
 */
export function scoreImportContextKeyMatch(storedKey = '', currentKey = '') {
  const stored = text(storedKey)
  const current = text(currentKey)
  if (!stored || !current) return 0
  if (stored === current) return 100

  const storedParts = stored.split('|')
  const currentParts = current.split('|')
  const storedId = storedParts[0] || ''
  const currentId = currentParts[0] || ''
  const storedDir = storedParts[1] || ''
  const currentDir = currentParts[1] || ''
  const storedDesc = (storedParts.find((p) => p.startsWith('desc:')) || '').slice(5)
  const currentDesc = (currentParts.find((p) => p.startsWith('desc:')) || '').slice(5)

  let score = 0
  if (storedId && storedId === currentId) score += 40
  else return 0
  if (storedDir && storedDir === currentDir) score += 20
  if (storedDesc && currentDesc) {
    if (storedDesc === currentDesc) score += 40
    else if (storedDesc.includes(currentDesc) || currentDesc.includes(storedDesc)) score += 20
    else {
      const a = new Set(storedDesc.split('_'))
      const b = currentDesc.split('_')
      const overlap = b.filter((t) => a.has(t)).length
      score += Math.min(30, overlap * 15)
    }
  }
  return score
}
