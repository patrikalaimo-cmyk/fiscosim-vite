/**
 * Bozza righe IVA Working View Import — auto-match standard, pruning placeholder, override manuale.
 */

import { parseIvaPercent } from '../../../../domain/resolveIva.js'
import {
  extractWorkingViewIvaSourceRows,
  resolveImportWorkingViewCausaleIvaId,
} from './importContabilitaDemoCausaliIva.js'
import {
  isEmptyImportVatRow,
  normalizeImportVatRows,
} from './importContabilitaVatRowNormalization.js'

function normalizeCausaleIvaId(value) {
  return String(value || '').trim()
}

function toDraftNumber(value) {
  if (value === '' || value == null) return ''
  const normalized = Number(String(value).replace(',', '.'))
  return Number.isFinite(normalized) ? normalized : ''
}

function roundWorkingViewAmount(value) {
  return Math.round((Number(value || 0) || 0) * 100) / 100
}

function getWorkingViewAliquotaFromCausale(causale) {
  if (!causale) return null
  return parseIvaPercent(causale?.aliquota)
}

function getWorkingViewDetraibilePercentFromCausale(causale) {
  const raw = causale?.percentualeDetraibilita ?? causale?.percentuale_detraibilita ?? causale?.detraibile
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return 100
  return Math.max(0, Math.min(100, parsed))
}

function getWorkingViewCausaleIvaOptionLabel(causale) {
  if (!causale) return ''
  const codice = String(causale?.codice || causale?.codiceInterno || '').trim()
  const descrizione = String(causale?.descrizione || '').trim()
  const aliquota = getWorkingViewAliquotaFromCausale(causale)
  const aliquotaLabel = aliquota != null ? `${aliquota}%` : ''
  if (codice && descrizione) return `${codice} · ${descrizione}${aliquotaLabel ? ` · ${aliquotaLabel}` : ''}`
  return codice || descrizione || aliquotaLabel
}

/**
 * Chiave stabile per preservare override manuali su rigenerazione bozza.
 * @param {object|null|undefined} row
 * @returns {string}
 */
export function getImportWorkingViewIvaRowIdentityKey(row) {
  const aliquota = parseIvaPercent(row?.aliquota) ?? Math.round(Number(row?.aliquota ?? 0) || 0)
  const imponibile = roundWorkingViewAmount(row?.imponibile ?? 0)
  const natura = String(row?.natura ?? row?.nature ?? '').trim().toUpperCase()
  return `${aliquota}|${imponibile.toFixed(2)}|${natura}`
}

/**
 * @param {object} params
 * @returns {string}
 */
export function resolveImportWorkingViewStandardCausaleIvaId({
  source = {},
  counterpartyAccount = null,
  causaliIva = [],
  isDemoSocieta = false,
  manualCausaleIvaId = '',
} = {}) {
  const manual = normalizeCausaleIvaId(manualCausaleIvaId)
  if (manual) return manual

  const imponibile = Number(source?.imponibile ?? 0) || 0
  const imposta = Number(source?.imposta ?? source?.iva ?? 0) || 0
  const hasNatura = Boolean(String(source?.natura ?? source?.nature ?? '').trim())
  if (imponibile === 0 && imposta === 0 && !hasNatura) {
    return ''
  }

  return resolveImportWorkingViewCausaleIvaId({
    source,
    counterpartyAccount,
    causaliIva,
    isDemoSocieta,
  })
}

export function recalculateImportWorkingViewIvaDraftRow(row, causaliIvaById) {
  const map = causaliIvaById instanceof Map ? causaliIvaById : new Map()
  const causaleIvaId = normalizeCausaleIvaId(row?.causaleIvaId || row?.causale_iva_id)
  const causale = map.get(causaleIvaId) || null
  const aliquotaFromCausale = getWorkingViewAliquotaFromCausale(causale)
  const aliquota = aliquotaFromCausale != null
    ? aliquotaFromCausale
    : Number(toDraftNumber(row?.aliquota ?? 0) || 0) || 0
  const imponibile = Number(toDraftNumber(row?.imponibile ?? 0) || 0) || 0
  const imposta = roundWorkingViewAmount((imponibile * aliquota) / 100)
  const detraibilePercent = causale ? getWorkingViewDetraibilePercentFromCausale(causale) : (aliquota === 0 ? 0 : 100)
  const indetraibilePercent = Math.max(0, Math.min(100, 100 - detraibilePercent))
  const detraibileImposta = roundWorkingViewAmount((imposta * detraibilePercent) / 100)
  const indetraibileImposta = roundWorkingViewAmount(imposta - detraibileImposta)

  return {
    ...row,
    causaleIvaId,
    causaleIvaLabel: getWorkingViewCausaleIvaOptionLabel(causale),
    aliquota,
    imponibile,
    imposta,
    detraibilePercent,
    indetraibilePercent,
    detraibileImposta,
    indetraibileImposta,
  }
}

export function createImportWorkingViewIvaDraftRow(source = {}, causaliIvaById = new Map(), options = {}) {
  const map = causaliIvaById instanceof Map ? causaliIvaById : new Map()
  const identityKey = getImportWorkingViewIvaRowIdentityKey(source)
  const manualRow = options?.manualByKey?.get?.(identityKey) || null
  const defaultCausaleIvaId = manualRow?.causaleIvaManual
    ? normalizeCausaleIvaId(manualRow.causaleIvaId)
    : normalizeCausaleIvaId(
      options?.resolveDefaultCausaleIvaId ? options.resolveDefaultCausaleIvaId(source) : '',
    )

  const baseRow = {
    id: options?.createRowId ? options.createRowId() : `working-view-iva-${identityKey}`,
    aliquota: toDraftNumber(source?.aliquota ?? 0),
    imponibile: toDraftNumber(source?.imponibile ?? 0),
    imposta: toDraftNumber(source?.imposta ?? source?.iva ?? 0),
    natura: String(source?.natura ?? source?.nature ?? '').trim() || '',
    esigibilita: String(source?.esigibilita || source?.esigibilitaIVA || 'Immediata').trim() || 'Immediata',
    causaleIvaId: normalizeCausaleIvaId(source?.causaleIvaId || source?.causale_iva_id || defaultCausaleIvaId),
    causaleIvaManual: Boolean(manualRow?.causaleIvaManual),
  }

  return recalculateImportWorkingViewIvaDraftRow(baseRow, map)
}

export function buildImportWorkingViewIvaDraftRows(ivaRows = [], causaliIvaById = new Map(), options = {}) {
  const sources = Array.isArray(ivaRows) ? ivaRows : []
  if (!sources.length) return []
  const built = sources.map((item) => createImportWorkingViewIvaDraftRow(item, causaliIvaById, options))
  return normalizeImportVatRows(built)
}

/**
 * Rigenera bozza IVA da documento con auto-match standard e preservazione scelte manuali.
 * @param {object} params
 * @returns {Array<object>}
 */
export function rebuildImportWorkingViewIvaDraftRows({
  parsedDocument = null,
  previousRows = [],
  causaliIva = [],
  counterpartyAccount = null,
  isDemoSocieta = false,
  causaliIvaById = new Map(),
  createRowId = () => `working-view-iva-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
} = {}) {
  const map = causaliIvaById instanceof Map ? causaliIvaById : new Map()
  const manualByKey = new Map()
  ;(Array.isArray(previousRows) ? previousRows : []).forEach((row) => {
    if (row?.causaleIvaManual) {
      manualByKey.set(getImportWorkingViewIvaRowIdentityKey(row), row)
    }
  })

  const resolveDefaultCausaleIvaId = (source) => resolveImportWorkingViewStandardCausaleIvaId({
    source,
    counterpartyAccount,
    causaliIva,
    isDemoSocieta,
  })

  const sourceRows = extractWorkingViewIvaSourceRows(parsedDocument)
  const built = sourceRows.length
    ? sourceRows.map((source) => createImportWorkingViewIvaDraftRow(source, map, {
      resolveDefaultCausaleIvaId,
      manualByKey,
      createRowId,
    }))
    : []

  const pruned = normalizeImportVatRows(built)
  if (pruned.length) return pruned

  const documentVatTotal = Number(parsedDocument?.iva ?? parsedDocument?.imposta ?? 0) || 0
  if (documentVatTotal > 0) {
    return built.filter((row) => !isEmptyImportVatRow(row))
  }

  return []
}

/**
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
export function getEffectiveImportWorkingViewIvaDraftRows(rows) {
  return normalizeImportVatRows(rows)
}
