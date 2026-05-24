/**
 * Match controparte sul piano conti — solo per Import unificato (fase A).
 * Ordine rigido: P.IVA → CF → denominazione (debole). Nessuna creazione automatica.
 * Più di un conto allo stesso livello → ambiguous (nessun aggancio automatico).
 */

const LEGAL_SUFFIXES = [
  'srl',
  's.r.l',
  'spa',
  's.p.a',
  'sas',
  's.a.s',
  'snc',
  's.n.c',
  'srls',
  's.r.l.s',
  'stp',
  'coop',
  'cooperativa',
  'societa',
  'società',
  'studio',
  'ditta',
  'impresa',
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeVat(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/^IT/i, '')
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase()
    .trim()
}

function stripLegalSuffixes(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  const tokens = raw.split(' ').filter(Boolean)
  const cleaned = tokens.filter((token) => !LEGAL_SUFFIXES.includes(token))
  return cleaned.join(' ').trim()
}

function resolveContoReference(ref, pianoConti) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const raw = String(ref || '').trim()
  if (!raw) return null
  return (
    list.find((c) => String(c?.id || '').trim() === raw) ||
    list.find((c) => String(c?.codice || '').trim() === raw) ||
    list.find((c) => String(c?.codice || '').replace(/\s+/g, '') === raw.replace(/\s+/g, '')) ||
    null
  )
}

function counterpartyCandidates(pianoConti) {
  return (Array.isArray(pianoConti) ? pianoConti : []).filter(
    (c) => c && Number(c.livello || 0) >= 3
  )
}

/** `ai_raw_response` da Supabase può essere oggetto o stringa JSON. */
export function parseImportDocAiRaw(doc = {}) {
  const raw = doc?.ai_raw_response
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const o = JSON.parse(raw)
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {}
    } catch {
      return {}
    }
  }
  return {}
}

function readDot(obj, path) {
  if (!obj || !path) return ''
  const parts = String(path).split('.')
  let o = obj
  for (const p of parts) {
    o = o?.[p]
  }
  if (o == null) return ''
  const s = String(o).trim()
  return s
}

function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v == null) continue
    const s = String(v).trim()
    if (s) return s
  }
  return ''
}

/**
 * Estrae P.IVA, CF e denominazione del soggetto controparte (cedente se passiva, cessionario se attiva).
 * Usa chiavi piatte (cedente_piva), campi in dati_estratti e strutture tipo documento.fornitore.piva (pipeline / parsing).
 * @param {Record<string, unknown>} doc
 */
export function extractImportCounterpartyKeys(doc = {}) {
  const d = parseImportDocAiRaw(doc)
  const dati =
    doc?.dati_estratti && typeof doc.dati_estratti === 'string'
      ? (() => {
          try {
            return JSON.parse(doc.dati_estratti)
          } catch {
            return {}
          }
        })()
      : doc?.dati_estratti && typeof doc.dati_estratti === 'object'
        ? doc.dati_estratti
        : {}

  const tipo = String(doc?.tipo_documento || d?.tipo_documento || '').toLowerCase()
  const isAttiva = tipo === 'fattura_attiva'

  const pivaPassiva = normalizeVat(
    firstNonEmpty(
      doc?.soggetto_piva,
      dati?.cedente_piva,
      d?.cedente_piva,
      d?.piva_cedente,
      readDot(d, 'documento.fornitore.piva'),
      readDot(d, 'documento.cedente.piva'),
      readDot(d, 'documento.prestatore.piva')
    )
  )
  const pivaAttiva = normalizeVat(
    firstNonEmpty(
      doc?.soggetto_piva,
      dati?.cessionario_piva,
      d?.cessionario_piva,
      readDot(d, 'documento.cliente.piva'),
      readDot(d, 'documento.cessionario.piva'),
      readDot(d, 'documento.committente.piva')
    )
  )
  const piva = isAttiva ? pivaAttiva : pivaPassiva

  const cfPassiva = normalizeVat(
    firstNonEmpty(
      doc?.soggetto_cf,
      dati?.cedente_cf,
      d?.cedente_cf,
      readDot(d, 'documento.fornitore.codice_fiscale'),
      readDot(d, 'documento.cedente.codice_fiscale')
    )
  )
  const cfAttiva = normalizeVat(
    firstNonEmpty(
      doc?.soggetto_cf,
      dati?.cessionario_cf,
      d?.cessionario_cf,
      readDot(d, 'documento.cliente.codice_fiscale'),
      readDot(d, 'documento.cessionario.codice_fiscale')
    )
  )
  const cf = isAttiva ? cfAttiva : cfPassiva

  const denomPassiva = firstNonEmpty(
    doc?.soggetto_denominazione,
    dati?.cedente_denom,
    d?.cedente_denom,
    readDot(d, 'documento.fornitore.nome'),
    readDot(d, 'documento.cedente.nome')
  )
  const denomAttiva = firstNonEmpty(
    doc?.soggetto_denominazione,
    dati?.cessionario_denom,
    d?.cessionario_denom,
    readDot(d, 'documento.cliente.nome'),
    readDot(d, 'documento.cessionario.nome')
  )
  const denominazione = isAttiva ? denomAttiva : denomPassiva

  return { piva, cf, denominazione, isAttiva }
}

/**
 * @param {{ doc?: Record<string, unknown>, pianoConti?: unknown[] }} p
 * @returns {{
 *   tier: 'piva' | 'cf' | 'denominazione' | null,
 *   supplierConto: Record<string, unknown> | null,
 *   costConto: Record<string, unknown> | null,
 *   ambiguous: boolean,
 * }}
 */
export function resolveImportCounterpartyMatch({ doc = {}, pianoConti = [] } = {}) {
  const empty = { tier: null, supplierConto: null, costConto: null, ambiguous: false }
  const { piva, cf, denominazione } = extractImportCounterpartyKeys(doc)
  const list = counterpartyCandidates(pianoConti)

  const pivaMatches = piva
    ? list.filter((c) => {
        const pc = normalizeVat(c?.partita_iva)
        const pa = normalizeVat(c?.anagrafica_piva)
        return (pc && pc === piva) || (pa && pa === piva)
      })
    : []
  if (pivaMatches.length > 1) {
    return { ...empty, tier: 'piva', ambiguous: true }
  }
  if (pivaMatches.length === 1) {
    const supplierConto = pivaMatches[0]
    const ref = supplierConto?.contropartita || ''
    const costConto = resolveContoReference(ref, pianoConti)
    return {
      tier: 'piva',
      supplierConto,
      costConto,
      ambiguous: false,
    }
  }

  const cfMatches = cf
    ? list.filter((c) => {
        const c1 = normalizeVat(c?.codice_fiscale)
        const c2 = normalizeVat(c?.anagrafica_cf)
        return (c1 && c1 === cf) || (c2 && c2 === cf)
      })
    : []
  if (cfMatches.length > 1) {
    return { ...empty, tier: 'cf', ambiguous: true }
  }
  if (cfMatches.length === 1) {
    const supplierConto = cfMatches[0]
    const ref = supplierConto?.contropartita || ''
    const costConto = resolveContoReference(ref, pianoConti)
    return {
      tier: 'cf',
      supplierConto,
      costConto,
      ambiguous: false,
    }
  }

  const docStrip = stripLegalSuffixes(denominazione)
  const docRawNorm = normalizeText(denominazione)
  if (!docStrip && !docRawNorm) {
    return empty
  }

  const denomMatches = list.filter((c) => {
    const contoName = stripLegalSuffixes(c?.descrizione || c?.nome || '')
    if (docStrip && contoName && docStrip === contoName) return true
    if (docRawNorm && normalizeText(c?.descrizione || c?.nome || '') === docRawNorm) return true
    return false
  })

  if (denomMatches.length > 1) {
    return { ...empty, tier: 'denominazione', ambiguous: true }
  }
  if (denomMatches.length === 1) {
    const supplierConto = denomMatches[0]
    const ref = supplierConto?.contropartita || ''
    const costConto = resolveContoReference(ref, pianoConti)
    return {
      tier: 'denominazione',
      supplierConto,
      costConto,
      ambiguous: false,
    }
  }

  return empty
}
