/**
 * Storico IVA Import Contabilità.
 * Costruisce suggerimenti deterministici e read-only da registri_iva già contabilizzati.
 * Nessuna scelta viene committata automaticamente: i suggerimenti alimentano solo la bozza Working View.
 */

import { parseIvaPercent } from '../../../../domain/resolveIva.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeDirection(value) {
  const text = normalizeText(value).toLowerCase()
  if (!text) return ''
  if (text.includes('acquist') || text.includes('passiv')) return 'acquisto'
  if (text.includes('vendit') || text.includes('attiv')) return 'vendita'
  return ''
}

export function normalizeImportVatHistoryPiva(value) {
  let text = normalizeText(value).replace(/[^A-Z0-9]/gi, '').toUpperCase()
  if (/^IT\d{11}$/.test(text)) text = text.slice(2)
  return text
}

export function normalizeImportVatHistoryName(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]/gi, '')
    .toUpperCase()
}

function normalizeHistoryRate(value) {
  const parsed = parseIvaPercent(value)
  return parsed == null ? null : parsed
}

function clampPercent(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  return Math.max(0, Math.min(100, Math.round(numeric * 100) / 100))
}

function getHistoricalDetraibilePercent(row) {
  const iva = Math.abs(Number(row?.iva ?? row?.imposta ?? 0) || 0)
  if (!(iva > 0)) return null

  const detraibile = Math.abs(Number(row?.iva_detraibile ?? row?.ivaDetraibile ?? NaN))
  if (Number.isFinite(detraibile)) {
    return clampPercent((detraibile / iva) * 100)
  }

  const indetraibile = Math.abs(Number(row?.iva_indetraibile ?? row?.ivaIndetraibile ?? NaN))
  if (Number.isFinite(indetraibile)) {
    return clampPercent(100 - ((indetraibile / iva) * 100))
  }

  return null
}

function parseHistoryTimestamp(row, fallbackIndex) {
  const raw = normalizeText(row?.created_at || row?.data || row?.data_documento || '')
  const parsed = raw ? Date.parse(raw) : NaN
  if (Number.isFinite(parsed)) return parsed
  return -Math.abs(Number(fallbackIndex || 0))
}

function createAccumulator() {
  return {
    sampleCount: 0,
    causali: new Map(),
    detraibilita: new Map(),
    lastSeenAt: '',
    lastSeenTimestamp: Number.NEGATIVE_INFINITY,
  }
}

function updateModeBucket(map, key, timestamp) {
  if (!key && key !== 0) return
  const normalizedKey = String(key)
  const current = map.get(normalizedKey) || {
    value: key,
    count: 0,
    lastSeenTimestamp: Number.NEGATIVE_INFINITY,
  }
  current.count += 1
  current.lastSeenTimestamp = Math.max(current.lastSeenTimestamp, timestamp)
  map.set(normalizedKey, current)
}

function chooseMode(map) {
  const rows = Array.from(map.values())
  if (!rows.length) return null
  rows.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    if (right.lastSeenTimestamp !== left.lastSeenTimestamp) return right.lastSeenTimestamp - left.lastSeenTimestamp
    return String(left.value).localeCompare(String(right.value), 'it')
  })
  return rows[0]
}

function buildBucketKeys(row, direction, rate) {
  const piva = normalizeImportVatHistoryPiva(row?.soggetto_piva || row?.partita_iva || row?.partitaIva)
  const name = normalizeImportVatHistoryName(row?.soggetto_denominazione || row?.denominazione || row?.ragione_sociale)
  const suffix = `${direction}|${rate}`
  const keys = []
  if (piva) keys.push(`piva:${piva}|${suffix}`)
  if (name) keys.push(`name:${name}|${suffix}`)
  return keys
}

/**
 * @param {Array<object>} rows righe registri_iva già contabilizzate
 * @returns {Map<string, object>}
 */
export function buildImportContabilitaVatHistoryIndex(rows = []) {
  const accumulators = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row, index) => {
    const direction = normalizeDirection(row?.tipo || row?.registro_iva || row?.registerType)
    const rate = normalizeHistoryRate(row?.aliquota)
    if (!direction || rate == null) return

    const causaleIvaId = normalizeText(row?.causale_iva_id || row?.causaleIvaId)
    const detraibilePercent = getHistoricalDetraibilePercent(row)
    if (!causaleIvaId && detraibilePercent == null) return

    const timestamp = parseHistoryTimestamp(row, index)
    const lastSeenAt = normalizeText(row?.created_at || row?.data || row?.data_documento || '')
    buildBucketKeys(row, direction, rate).forEach((key) => {
      const acc = accumulators.get(key) || createAccumulator()
      acc.sampleCount += 1
      if (causaleIvaId) updateModeBucket(acc.causali, causaleIvaId, timestamp)
      if (detraibilePercent != null) updateModeBucket(acc.detraibilita, detraibilePercent, timestamp)
      if (timestamp > acc.lastSeenTimestamp) {
        acc.lastSeenTimestamp = timestamp
        acc.lastSeenAt = lastSeenAt
      }
      accumulators.set(key, acc)
    })
  })

  const result = new Map()
  accumulators.forEach((acc, key) => {
    const causaleMode = chooseMode(acc.causali)
    const detraibileMode = chooseMode(acc.detraibilita)
    result.set(key, {
      sampleCount: acc.sampleCount,
      causaleIvaId: normalizeText(causaleMode?.value),
      causaleSampleCount: Number(causaleMode?.count || 0),
      detraibilePercent: detraibileMode ? clampPercent(detraibileMode.value) : null,
      detraibileSampleCount: Number(detraibileMode?.count || 0),
      lastSeenAt: acc.lastSeenAt,
    })
  })

  return result
}

export function resolveImportVatHistoryDirection(counterpartyAccount = null) {
  if (counterpartyAccount?.isFornitore || counterpartyAccount?.isProfessionista) return 'acquisto'
  if (counterpartyAccount?.isCliente) return 'vendita'
  return ''
}

function getCurrentCounterparty(parsedDocument = {}, counterpartyAccount = null, direction = '') {
  const accountPiva = counterpartyAccount?.partitaIva || counterpartyAccount?.anagraficaPiva || counterpartyAccount?.partita_iva || counterpartyAccount?.anagrafica_piva
  const accountName = counterpartyAccount?.descrizione || counterpartyAccount?.denominazione
  if (accountPiva || accountName) {
    return { partitaIva: accountPiva, denominazione: accountName }
  }

  if (direction === 'vendita') {
    return parsedDocument?.cliente || {}
  }
  if (direction === 'acquisto') {
    return parsedDocument?.fornitore || {}
  }
  return {}
}

/**
 * Restituisce il suggerimento storico per controparte + direzione + aliquota.
 * Match forte P.IVA prima del fallback denominazione.
 */
export function resolveImportContabilitaVatHistorySuggestion({
  historyIndex = new Map(),
  counterpartyAccount = null,
  parsedDocument = null,
  source = {},
} = {}) {
  const index = historyIndex instanceof Map ? historyIndex : new Map()
  if (!index.size) return null

  const direction = resolveImportVatHistoryDirection(counterpartyAccount)
  const rate = normalizeHistoryRate(source?.aliquota)
  if (!direction || rate == null) return null

  const counterparty = getCurrentCounterparty(parsedDocument || {}, counterpartyAccount, direction)
  const piva = normalizeImportVatHistoryPiva(counterparty?.partitaIva || counterparty?.partita_iva)
  const name = normalizeImportVatHistoryName(counterparty?.denominazione || counterparty?.ragione_sociale || counterparty?.nome)

  const keys = []
  if (piva) keys.push(`piva:${piva}|${direction}|${rate}`)
  if (name) keys.push(`name:${name}|${direction}|${rate}`)

  for (const key of keys) {
    const suggestion = index.get(key)
    if (suggestion) {
      return {
        ...suggestion,
        matchKey: key,
        matchType: key.startsWith('piva:') ? 'piva' : 'name',
        direction,
        aliquota: rate,
      }
    }
  }

  return null
}
