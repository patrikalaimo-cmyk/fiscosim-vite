/**
 * Indici e cache per performance Import Contabilità (lotti massivi).
 * Nessuna logica fiscale nuova: solo indicizzazione e memoizzazione matching.
 */

export const WORKING_TABLE_PAGE_SIZE = 100

/** Abilitare solo per profilazione locale temporanea. */
export const IMPORT_PERF_DEBUG = false

export function measureImportPerf(label, fn) {
  if (!IMPORT_PERF_DEBUG || typeof performance === 'undefined') return fn()
  const start = performance.now()
  const result = fn()
  const elapsed = performance.now() - start
  if (elapsed > 5) {
    console.info(`[IMPORT_PERF] ${label}: ${elapsed.toFixed(1)}ms`)
  }
  return result
}

export function normalizeAnagraficaText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

export function normalizeAnagraficaIdentifier(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export function getAnagraficaDecisionKeyFromCounterparty(counterparty) {
  const piva = normalizeAnagraficaIdentifier(counterparty?.partitaIva)
  if (piva) return `piva:${piva}`
  const cf = normalizeAnagraficaIdentifier(counterparty?.codiceFiscale)
  if (cf) return `cf:${cf}`
  const name = normalizeAnagraficaText(counterparty?.denominazione)
  if (name) return `name:${name}`
  return ''
}

export function buildCounterpartyClassificationCacheKey(societaId, counterparty) {
  const tipo = normalizeAnagraficaText(counterparty?.tipo || counterparty?.role || 'fornitore')
  const decisionKey = getAnagraficaDecisionKeyFromCounterparty(counterparty)
  return `${String(societaId || 'none')}|${tipo}|${decisionKey || 'empty'}`
}

export function buildPianoContiLookup(rows) {
  const byPiva = new Map()
  const byCf = new Map()
  const byId = new Map()
  const byCode = new Map()
  const normalizedRows = []

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const normalizedRow = {
      ...row,
      normalizedDenominazione: normalizeAnagraficaText(row?.descrizione),
      normalizedPiva: normalizeAnagraficaIdentifier(row?.partitaIva || row?.anagraficaPiva),
      normalizedCf: normalizeAnagraficaIdentifier(row?.codiceFiscale || row?.anagraficaCf),
    }

    normalizedRows.push(normalizedRow)
    const id = String(row?.id || '').trim()
    const code = String(row?.codice || '').trim()
    if (id) byId.set(id, normalizedRow)
    if (code) byCode.set(code, normalizedRow)
    if (normalizedRow.normalizedPiva) byPiva.set(normalizedRow.normalizedPiva, normalizedRow)
    if (normalizedRow.normalizedCf) byCf.set(normalizedRow.normalizedCf, normalizedRow)
  })

  return { rows: normalizedRows, byPiva, byCf, byId, byCode }
}

export function classifyCounterparty(candidate, pianoLookup) {
  const pivaKey = normalizeAnagraficaIdentifier(candidate?.partitaIva)
  const cfKey = normalizeAnagraficaIdentifier(candidate?.codiceFiscale)
  const nameKey = normalizeAnagraficaText(candidate?.denominazione)

  const strongMatch = (pivaKey && pianoLookup.byPiva.get(pivaKey))
    || (cfKey && pianoLookup.byCf.get(cfKey))
    || null

  if (strongMatch) {
    return {
      status: 'già presente',
      rank: 3,
      matchedPianoConto: strongMatch,
    }
  }

  const weakMatch = nameKey
    ? pianoLookup.rows.find((row) => {
      const normalizedName = row?.normalizedDenominazione || ''
      return normalizedName && (normalizedName.includes(nameKey) || nameKey.includes(normalizedName))
    }) || null
    : null

  if (weakMatch) {
    return {
      status: 'possibile match',
      rank: 2,
      matchedPianoConto: weakMatch,
    }
  }

  if (!pivaKey && !cfKey && !nameKey) {
    return {
      status: 'dati incompleti',
      rank: 0,
      matchedPianoConto: null,
    }
  }

  return {
    status: 'nuova',
    rank: 1,
    matchedPianoConto: null,
  }
}

/**
 * @param {{ societaId?: string, pianoLookup: ReturnType<typeof buildPianoContiLookup> }} params
 * @returns {(counterparty: object) => ReturnType<typeof classifyCounterparty>}
 */
export function createCounterpartyClassificationResolver({ societaId = '', pianoLookup } = {}) {
  const cache = new Map()
  return (counterparty) => {
    const key = buildCounterpartyClassificationCacheKey(societaId, counterparty)
    if (cache.has(key)) return cache.get(key)
    const result = classifyCounterparty(counterparty, pianoLookup)
    cache.set(key, result)
    return result
  }
}

export function buildPianoContiByIdMap(rows) {
  const map = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = String(row?.id || '').trim()
    if (id) map.set(id, row)
  })
  return map
}

export function buildCausaliContabiliByIdMap(rows) {
  const byId = new Map()
  const byCode = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = String(row?.id || '').trim()
    const code = String(row?.codice || row?.codiceInterno || '').trim()
    if (id) byId.set(id, row)
    if (code) byCode.set(code, row)
  })
  return { byId, byCode }
}

export function buildCausaliIvaLookupIndexes(rows) {
  const byId = new Map()
  const byAliquota = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = String(row?.id || '').trim()
    if (id) byId.set(id, row)
    const aliquota = Number(row?.aliquota)
    if (Number.isFinite(aliquota)) {
      const bucket = byAliquota.get(aliquota) || []
      bucket.push(row)
      byAliquota.set(aliquota, bucket)
    }
  })
  return { byId, byAliquota }
}

/**
 * Slice paginato client-side per Working Table.
 */
export function paginateWorkingTableRows(rows, page = 1, pageSize = WORKING_TABLE_PAGE_SIZE) {
  const list = Array.isArray(rows) ? rows : []
  const safePageSize = Math.max(1, Number(pageSize) || WORKING_TABLE_PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(list.length / safePageSize))
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages)
  const start = (safePage - 1) * safePageSize
  return {
    rows: list.slice(start, start + safePageSize),
    page: safePage,
    pageSize: safePageSize,
    totalRows: list.length,
    totalPages,
  }
}
