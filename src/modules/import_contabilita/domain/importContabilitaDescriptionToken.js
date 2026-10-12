/**
 * Shared description/product token for SG-L3 history + feedback context keys.
 */

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

const STOPWORDS = new Set([
  'di', 'da', 'del', 'della', 'delle', 'dei', 'degli', 'lo', 'la', 'le', 'il', 'un', 'una',
  'e', 'ed', 'per', 'con', 'su', 'nel', 'nella', 'ft', 'fattura', 'n', 'nr', 'num',
  'euro', 'iva', 'tot', 'totale', 'imponibile', 'srl', 'spa', 'snc', 'sas',
  'acquisti', 'acquisto', 'vendita', 'ricavi',
])

export function tokenizeImportDescription(value = '') {
  const joined = normalizeToken(value)
  if (!joined) return ''
  const tokens = joined
    .split(' ')
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token))
  if (!tokens.length) return ''
  return tokens.slice(0, 2).join('_')
}

/**
 * Extract a stable product/description token from invoice / document text.
 */
export function extractImportDescriptionToken(source = null) {
  const doc = source || {}
  const lines = []
  const push = (value) => {
    const t = text(value)
    if (t) lines.push(t)
  }
  push(doc.descrizione)
  push(doc.oggetto)
  push(doc.causale)
  push(doc.note)
  push(doc.soggetto_denominazione)
  const articoli = doc.righe || doc.linee || doc.lines || doc.dettaglioLinee || []
  ;(Array.isArray(articoli) ? articoli : []).slice(0, 8).forEach((row) => {
    push(row?.descrizione || row?.description || row?.nome || row?.name)
  })
  return tokenizeImportDescription(lines.join(' '))
}
