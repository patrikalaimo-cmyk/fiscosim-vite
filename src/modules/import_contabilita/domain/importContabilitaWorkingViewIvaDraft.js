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
import { resolveImportContabilitaVatHistorySuggestion } from './importContabilitaVatHistory.js'

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

  // P1 = causale standard configurata in Studio/Impostazioni Procedure.
  // La preferenza anagrafica/storica viene valutata separatamente come P2,
  // così non può sovrascrivere silenziosamente lo standard di Studio.
  return resolveImportWorkingViewCausaleIvaId({
    source,
    counterpartyAccount: null,
    causaliIva,
    isDemoSocieta,
  })
}

/**
 * Priorità proposta Working View:
 * manuale/esplicita > P1 standard Studio > P2 storico > nessuna proposta.
 * Se P1 e P2 divergono, P1 resta selezionata ma viene esposto un warning operativo.
 */
export function resolveImportWorkingViewCausaleIvaSuggestion({
  source = {},
  counterpartyAccount = null,
  causaliIva = [],
  isDemoSocieta = false,
  historicalSuggestion = null,
  manualCausaleIvaId = '',
} = {}) {
  const manual = normalizeCausaleIvaId(manualCausaleIvaId)
  if (manual) {
    return {
      causaleIvaId: manual,
      source: 'manual',
      standardCausaleIvaId: '',
      historicalCausaleIvaId: '',
      warning: '',
    }
  }

  const explicit = normalizeCausaleIvaId(source?.causaleIvaId || source?.causale_iva_id)
  if (explicit) {
    return {
      causaleIvaId: explicit,
      source: 'explicit',
      standardCausaleIvaId: explicit,
      historicalCausaleIvaId: '',
      warning: '',
    }
  }

  const standardCausaleIvaId = resolveImportWorkingViewStandardCausaleIvaId({
    source,
    counterpartyAccount,
    causaliIva,
    isDemoSocieta,
  })
  const historicalCausaleIvaId = normalizeCausaleIvaId(
    historicalSuggestion?.causaleIvaId
      || counterpartyAccount?.causaleIvaId
      || counterpartyAccount?.causale_iva_id
      || '',
  )

  const mismatch = Boolean(
    standardCausaleIvaId
      && historicalCausaleIvaId
      && standardCausaleIvaId !== historicalCausaleIvaId,
  )

  return {
    causaleIvaId: standardCausaleIvaId || historicalCausaleIvaId || '',
    source: standardCausaleIvaId ? 'standard' : historicalCausaleIvaId ? 'history' : 'none',
    standardCausaleIvaId,
    historicalCausaleIvaId,
    warning: mismatch
      ? 'Storico controparte diverso dalla causale IVA standard di Studio: mantenuta la causale standard. Verificare prima della contabilizzazione.'
      : '',
  }
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
  const manualDetraibile = row?.detraibileManual
    ? Number(row?.detraibilePercent)
    : NaN
  const historicalDetraibileRaw = row?.historicalDetraibilePercent
  const historicalDetraibile = !row?.detraibileManual
    && historicalDetraibileRaw !== null
    && historicalDetraibileRaw !== undefined
    && historicalDetraibileRaw !== ''
    ? Number(historicalDetraibileRaw)
    : NaN
  const causaleDetraibile = causale ? getWorkingViewDetraibilePercentFromCausale(causale) : (aliquota === 0 ? 0 : 100)
  const detraibilePercent = Math.max(0, Math.min(100,
    Number.isFinite(manualDetraibile)
      ? manualDetraibile
      : Number.isFinite(historicalDetraibile)
        ? historicalDetraibile
        : causaleDetraibile,
  ))
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
  const defaultSuggestion = manualRow?.causaleIvaManual
    ? {
        causaleIvaId: normalizeCausaleIvaId(manualRow.causaleIvaId),
        source: 'manual',
        warning: '',
      }
    : options?.resolveDefaultCausaleIvaSuggestion
      ? (options.resolveDefaultCausaleIvaSuggestion(source) || {})
      : {
          causaleIvaId: normalizeCausaleIvaId(
            options?.resolveDefaultCausaleIvaId ? options.resolveDefaultCausaleIvaId(source) : '',
          ),
          source: 'standard',
          warning: '',
        }
  const defaultCausaleIvaId = normalizeCausaleIvaId(defaultSuggestion?.causaleIvaId)
  const manualDetraibile = Boolean(manualRow?.detraibileManual)
  const historicalDetraibileRaw = defaultSuggestion?.historicalDetraibilePercent
  const historicalDetraibilePercent = historicalDetraibileRaw !== null
    && historicalDetraibileRaw !== undefined
    && historicalDetraibileRaw !== ''
    ? Number(historicalDetraibileRaw)
    : NaN

  const baseRow = {
    id: options?.createRowId ? options.createRowId() : `working-view-iva-${identityKey}`,
    aliquota: toDraftNumber(source?.aliquota ?? 0),
    imponibile: toDraftNumber(source?.imponibile ?? 0),
    imposta: toDraftNumber(source?.imposta ?? source?.iva ?? 0),
    natura: String(source?.natura ?? source?.nature ?? '').trim() || '',
    esigibilita: String(source?.esigibilita || source?.esigibilitaIVA || 'Immediata').trim() || 'Immediata',
    causaleIvaId: normalizeCausaleIvaId(source?.causaleIvaId || source?.causale_iva_id || defaultCausaleIvaId),
    causaleIvaManual: Boolean(manualRow?.causaleIvaManual),
    causaleIvaSuggestionSource: manualRow?.causaleIvaManual ? 'manual' : String(defaultSuggestion?.source || ''),
    standardCausaleIvaId: normalizeCausaleIvaId(defaultSuggestion?.standardCausaleIvaId),
    historicalCausaleIvaId: normalizeCausaleIvaId(defaultSuggestion?.historicalCausaleIvaId),
    causaleIvaHistoryWarning: manualRow?.causaleIvaManual ? '' : String(defaultSuggestion?.warning || ''),
    historicalSampleCount: Number(defaultSuggestion?.historicalSampleCount || 0) || 0,
    historicalDetraibilePercent: Number.isFinite(historicalDetraibilePercent) ? historicalDetraibilePercent : null,
    detraibilePercent: manualDetraibile ? Number(manualRow?.detraibilePercent) : undefined,
    detraibileManual: manualDetraibile,
    detraibileSuggestionSource: manualDetraibile
      ? 'manual'
      : Number.isFinite(historicalDetraibilePercent)
        ? 'history'
        : 'causale',
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
  vatHistoryIndex = new Map(),
  createRowId = () => `working-view-iva-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
} = {}) {
  const map = causaliIvaById instanceof Map ? causaliIvaById : new Map()
  const manualByKey = new Map()
  ;(Array.isArray(previousRows) ? previousRows : []).forEach((row) => {
    if (row?.causaleIvaManual || row?.detraibileManual) {
      manualByKey.set(getImportWorkingViewIvaRowIdentityKey(row), row)
    }
  })

  const resolveDefaultCausaleIvaSuggestion = (source) => {
    const historicalSuggestion = resolveImportContabilitaVatHistorySuggestion({
      historyIndex: vatHistoryIndex,
      counterpartyAccount,
      parsedDocument,
      source,
    })
    const suggestion = resolveImportWorkingViewCausaleIvaSuggestion({
      source,
      counterpartyAccount,
      causaliIva,
      isDemoSocieta,
      historicalSuggestion,
    })
    return {
      ...suggestion,
      historicalDetraibilePercent: historicalSuggestion?.detraibilePercent ?? null,
      historicalSampleCount: historicalSuggestion?.sampleCount ?? 0,
    }
  }

  const resolveDefaultCausaleIvaId = (source) => resolveDefaultCausaleIvaSuggestion(source).causaleIvaId

  const sourceRows = extractWorkingViewIvaSourceRows(parsedDocument)
  const built = sourceRows.length
    ? sourceRows.map((source) => createImportWorkingViewIvaDraftRow(source, map, {
      resolveDefaultCausaleIvaId,
      resolveDefaultCausaleIvaSuggestion,
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
