/**
 * Storico contabile Import Contabilità.
 * Produce proposte read-only per conto costo/ricavo e causale contabile
 * a partire da documenti già contabilizzati della stessa controparte.
 *
 * Contratto: lo storico precompila soltanto campi ancora privi di scelta.
 * Un valore già presente (manuale, batch o snapshot) non viene mai sovrascritto.
 */

import {
  normalizeImportVatHistoryName,
  normalizeImportVatHistoryPiva,
} from './importContabilitaVatHistory.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeDirection(value) {
  const text = normalizeKey(value)
  if (!text) return ''
  if (text.includes('passiv') || text.includes('acquist') || text.includes('fornitor')) return 'acquisto'
  if (text.includes('attiv') || text.includes('vendit') || text.includes('client')) return 'vendita'
  return ''
}

function parseTimestamp(value, fallbackIndex = 0) {
  const parsed = Date.parse(normalizeText(value))
  return Number.isFinite(parsed) ? parsed : -Math.abs(Number(fallbackIndex || 0))
}

function buildById(rows = []) {
  const map = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = normalizeText(row?.id)
    if (id) map.set(id, row)
  })
  return map
}

function buildCausaliLookup(rows = []) {
  const byId = new Map()
  const byCode = new Map()
  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const id = normalizeText(row?.id)
    const code = normalizeText(row?.codice || row?.codiceInterno)
    if (id) byId.set(id, row)
    if (code) byCode.set(code.toUpperCase(), row)
  })
  return { byId, byCode }
}

function isIvaAccount(account) {
  if (!account) return false
  return Boolean(account?.isIva ?? account?.is_iva)
}

function isEconomicAccount(account) {
  if (!account) return false
  const text = [
    account?.tipo,
    account?.natura,
    account?.sezione,
  ].map(normalizeKey).join(' ')
  return text.includes('economic') || text.includes('costo') || text.includes('ricav')
}

function resolveHistoryDirection(documentRow, header, pianoContiById) {
  const direct = normalizeDirection(documentRow?.tipo_documento || documentRow?.tipoDocumento)
  if (direct) return direct

  const counterpartyId = normalizeText(header?.cliente_fornitore_id)
  const counterpartyAccount = counterpartyId ? pianoContiById.get(counterpartyId) : null
  if (counterpartyAccount?.isFornitore || counterpartyAccount?.isProfessionista || counterpartyAccount?.is_fornitore || counterpartyAccount?.is_professionista) {
    return 'acquisto'
  }
  if (counterpartyAccount?.isCliente || counterpartyAccount?.is_cliente) return 'vendita'
  return ''
}

function getHistoryCounterparty(documentRow, header, pianoContiById) {
  const counterpartyId = normalizeText(header?.cliente_fornitore_id)
  const account = counterpartyId ? pianoContiById.get(counterpartyId) : null
  return {
    partitaIva: normalizeText(
      documentRow?.soggetto_piva
      || documentRow?.partita_iva
      || account?.partitaIva
      || account?.anagraficaPiva
      || account?.partita_iva
      || account?.anagrafica_piva,
    ),
    denominazione: normalizeText(
      documentRow?.soggetto_denominazione
      || header?.cliente_fornitore_nome
      || account?.descrizione
      || account?.denominazione,
    ),
  }
}

function getCurrentCounterparty(parsedDocument = {}, counterpartyAccount = null, direction = '') {
  const accountPiva = counterpartyAccount?.partitaIva
    || counterpartyAccount?.anagraficaPiva
    || counterpartyAccount?.partita_iva
    || counterpartyAccount?.anagrafica_piva
  const accountName = counterpartyAccount?.descrizione || counterpartyAccount?.denominazione
  if (accountPiva || accountName) {
    return { partitaIva: accountPiva, denominazione: accountName }
  }
  if (direction === 'vendita') return parsedDocument?.cliente || {}
  if (direction === 'acquisto') return parsedDocument?.fornitore || {}
  return {}
}

function buildBucketKeys(counterparty, direction) {
  const piva = normalizeImportVatHistoryPiva(counterparty?.partitaIva || counterparty?.partita_iva)
  const name = normalizeImportVatHistoryName(counterparty?.denominazione || counterparty?.ragione_sociale || counterparty?.nome)
  const keys = []
  if (piva) keys.push(`piva:${piva}|${direction}`)
  if (name) keys.push(`name:${name}|${direction}`)
  return keys
}

function createAccumulator() {
  return {
    sampleCount: 0,
    accountModes: new Map(),
    causaleModes: new Map(),
    lastSeenAt: '',
    lastSeenTimestamp: Number.NEGATIVE_INFINITY,
  }
}

function updateMode(map, value, timestamp) {
  const key = normalizeText(value)
  if (!key) return
  const current = map.get(key) || {
    value: key,
    count: 0,
    lastSeenTimestamp: Number.NEGATIVE_INFINITY,
  }
  current.count += 1
  current.lastSeenTimestamp = Math.max(current.lastSeenTimestamp, timestamp)
  map.set(key, current)
}

function chooseMode(map) {
  const values = Array.from(map.values())
  if (!values.length) return null
  values.sort((left, right) => {
    if (right.count !== left.count) return right.count - left.count
    if (right.lastSeenTimestamp !== left.lastSeenTimestamp) return right.lastSeenTimestamp - left.lastSeenTimestamp
    return String(left.value).localeCompare(String(right.value), 'it')
  })
  return values[0]
}

function selectDocumentEconomicAccount(rows, header, pianoContiById) {
  const counterpartyId = normalizeText(header?.cliente_fornitore_id)
  const candidates = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const accountId = normalizeText(row?.conto_id || row?.accountId)
      const account = accountId ? pianoContiById.get(accountId) || null : null
      const debit = Math.abs(Number(row?.importo_dare ?? row?.dare ?? 0) || 0)
      const credit = Math.abs(Number(row?.importo_avere ?? row?.avere ?? 0) || 0)
      return {
        row,
        accountId,
        account,
        amount: Math.max(debit, credit),
        economic: isEconomicAccount(account),
      }
    })
    .filter((item) => item.accountId)
    .filter((item) => item.accountId !== counterpartyId)
    .filter((item) => !isIvaAccount(item.account))

  if (!candidates.length) return null

  candidates.sort((left, right) => {
    if (left.economic !== right.economic) return left.economic ? -1 : 1
    if (right.amount !== left.amount) return right.amount - left.amount
    return Number(left.row?.riga_numero || left.row?.rowNumber || 0) - Number(right.row?.riga_numero || right.row?.rowNumber || 0)
  })

  return candidates[0]
}

/**
 * Costruisce un indice per controparte + direzione usando solo documenti già registrati.
 */
export function buildImportContabilitaAccountingHistoryIndex({
  documents = [],
  headers = [],
  rows = [],
  pianoConti = [],
  causaliContabili = [],
} = {}) {
  const pianoContiById = buildById(pianoConti)
  const causaliLookup = buildCausaliLookup(causaliContabili)
  const headersById = buildById(headers)
  const rowsByHeaderId = new Map()

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const pnId = normalizeText(row?.prima_nota_id)
    if (!pnId) return
    const bucket = rowsByHeaderId.get(pnId) || []
    bucket.push(row)
    rowsByHeaderId.set(pnId, bucket)
  })

  const accumulators = new Map()
  ;(Array.isArray(documents) ? documents : []).forEach((documentRow, index) => {
    const pnId = normalizeText(documentRow?.prima_nota_id)
    if (!pnId) return
    const header = headersById.get(pnId)
    if (!header) return

    const direction = resolveHistoryDirection(documentRow, header, pianoContiById)
    if (!direction) return

    const counterparty = getHistoryCounterparty(documentRow, header, pianoContiById)
    const keys = buildBucketKeys(counterparty, direction)
    if (!keys.length) return

    const timestamp = parseTimestamp(
      documentRow?.registered_at || documentRow?.created_at || header?.data_registrazione || header?.created_at,
      index,
    )
    const lastSeenAt = normalizeText(
      documentRow?.registered_at || documentRow?.created_at || header?.data_registrazione || header?.created_at,
    )

    const causaleIdRaw = normalizeText(header?.causale_id)
    const causaleByCode = causaliLookup.byCode.get(normalizeText(header?.causale_codice).toUpperCase()) || null
    const causaleId = causaliLookup.byId.has(causaleIdRaw)
      ? causaleIdRaw
      : normalizeText(causaleByCode?.id)

    const selectedAccount = selectDocumentEconomicAccount(
      rowsByHeaderId.get(pnId) || [],
      header,
      pianoContiById,
    )
    const accountId = selectedAccount?.account && pianoContiById.has(selectedAccount.accountId)
      ? selectedAccount.accountId
      : ''

    if (!causaleId && !accountId) return

    keys.forEach((key) => {
      const acc = accumulators.get(key) || createAccumulator()
      acc.sampleCount += 1
      if (accountId) updateMode(acc.accountModes, accountId, timestamp)
      if (causaleId) updateMode(acc.causaleModes, causaleId, timestamp)
      if (timestamp > acc.lastSeenTimestamp) {
        acc.lastSeenTimestamp = timestamp
        acc.lastSeenAt = lastSeenAt
      }
      accumulators.set(key, acc)
    })
  })

  const result = new Map()
  accumulators.forEach((acc, key) => {
    const accountMode = chooseMode(acc.accountModes)
    const causaleMode = chooseMode(acc.causaleModes)
    result.set(key, {
      sampleCount: acc.sampleCount,
      costRevenueAccountId: normalizeText(accountMode?.value),
      accountSampleCount: Number(accountMode?.count || 0),
      causaleContabileId: normalizeText(causaleMode?.value),
      causaleSampleCount: Number(causaleMode?.count || 0),
      lastSeenAt: acc.lastSeenAt,
    })
  })
  return result
}

export function resolveImportContabilitaAccountingHistorySuggestion({
  historyIndex = new Map(),
  parsedDocument = null,
  counterpartyAccount = null,
  direction = '',
  pianoContiById = new Map(),
  causaliContabiliById = new Map(),
} = {}) {
  const index = historyIndex instanceof Map ? historyIndex : new Map()
  if (!index.size) return null

  const normalizedDirection = normalizeDirection(direction)
    || (counterpartyAccount?.isFornitore || counterpartyAccount?.isProfessionista || counterpartyAccount?.is_fornitore || counterpartyAccount?.is_professionista
      ? 'acquisto'
      : counterpartyAccount?.isCliente || counterpartyAccount?.is_cliente
        ? 'vendita'
        : '')
  if (!normalizedDirection) return null

  const counterparty = getCurrentCounterparty(parsedDocument || {}, counterpartyAccount, normalizedDirection)
  const keys = buildBucketKeys(counterparty, normalizedDirection)

  for (const key of keys) {
    const historical = index.get(key)
    if (!historical) continue

    const account = historical.costRevenueAccountId
      ? pianoContiById.get(historical.costRevenueAccountId) || null
      : null
    const causale = historical.causaleContabileId
      ? causaliContabiliById.get(historical.causaleContabileId) || null
      : null

    if (!account && !causale) continue
    return {
      ...historical,
      matchKey: key,
      matchType: key.startsWith('piva:') ? 'piva' : 'name',
      direction: normalizedDirection,
      costRevenueAccount: account,
      causaleContabile: causale,
    }
  }

  return null
}

export function decorateImportAccountingHistorySuggestion(value, {
  kind = '',
  sampleCount = 0,
  totalSamples = 0,
  lastSeenAt = '',
} = {}) {
  if (!value || typeof value !== 'object') return value || null
  return {
    ...value,
    _importHistorySuggested: true,
    _importHistoryKind: normalizeText(kind),
    _importHistorySampleCount: Number(sampleCount || 0),
    _importHistoryTotalSamples: Number(totalSamples || 0),
    _importHistoryLastSeenAt: normalizeText(lastSeenAt),
  }
}
