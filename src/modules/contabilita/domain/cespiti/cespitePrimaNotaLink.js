/**
 * Structured link between beni_ammortizzabili and an already-posted acquisition Prima Nota.
 * LAB/studio-grade: bridge records link via note marker; never invent a second PN.
 */

const PN_ID_RE = /ID prima nota:\s*([0-9a-fA-F-]{36}|[A-Za-z0-9_-]+)/i

export function normalizePrimaNotaId(value) {
  return String(value ?? '').trim()
}

export function buildCespitePrimaNotaNote({ source = 'registrazione contabile', primaNotaId } = {}) {
  const pnId = normalizePrimaNotaId(primaNotaId)
  if (!pnId) return ''
  const src = String(source ?? 'registrazione contabile').trim() || 'registrazione contabile'
  return `Cespite inserito automaticamente da ${src}. ID prima nota: ${pnId}`
}

export function extractPrimaNotaIdFromCespiteNote(note) {
  const match = String(note ?? '').match(PN_ID_RE)
  return match ? normalizePrimaNotaId(match[1]) : ''
}

export function noteMatchesPrimaNotaId(note, primaNotaId) {
  const expected = normalizePrimaNotaId(primaNotaId)
  if (!expected) return false
  return extractPrimaNotaIdFromCespiteNote(note) === expected
}
