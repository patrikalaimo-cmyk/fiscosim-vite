/**
 * Causali IVA per società demo Test Lab — working view Import Contabilità (24D-FIX-2).
 * Nessun hardcode fiscale in JSX: mapping demo da testLabAccountingSchema.
 */

import { resolveIvaOrNull } from '../../../../domain/resolveIva.js'
import {
  hasImportVatRowFiscalSignificance,
  normalizeImportVatRows,
} from './importContabilitaVatRowNormalization.js'
import {
  DEMO_CAUSALI_IVA_CODICI,
  TEST_LAB_ACCOUNTING_MARKER,
} from '../../test_mode/testLabAccountingSchema.js'

const DEMO_IVA_CODICI_BY_ALIQUOTA = Object.freeze({
  22: DEMO_CAUSALI_IVA_CODICI.aliq22,
  10: DEMO_CAUSALI_IVA_CODICI.aliq10,
  4: DEMO_CAUSALI_IVA_CODICI.aliq4,
})

const DEMO_IVA_CODICI_UPPER = new Set(
  Object.values(DEMO_CAUSALI_IVA_CODICI).map((codice) => String(codice).trim().toUpperCase()),
)

function normalizeCausaleIvaId(value) {
  return String(value || '').trim()
}

function normalizeSocietaId(value) {
  return String(value || '').trim()
}

function getCausaleIvaRowSocietaId(row) {
  return normalizeSocietaId(row?.societaId || row?.societa_id)
}

function parseAliquotaPercent(value) {
  if (value == null || value === '') return null
  const numeric = Number(String(value).replace(',', '.').replace(/%/g, ''))
  if (!Number.isFinite(numeric)) return null
  return Math.round(numeric)
}

/**
 * @param {object|null|undefined} causale
 * @returns {boolean}
 */
export function isTestLabCausaleIvaRow(causale) {
  if (!causale || typeof causale !== 'object') return false
  const codice = String(causale.codice || '').trim().toUpperCase()
  if (DEMO_IVA_CODICI_UPPER.has(codice)) return true
  const marker = TEST_LAB_ACCOUNTING_MARKER
  const note = String(causale.note || '').trim()
  const descrizione = String(causale.descrizione || '').trim()
  return note.includes(marker) || descrizione.includes(marker)
}

/**
 * @param {object|null|undefined} causale
 * @returns {boolean}
 */
export function isLikelyReverseOrAutofatturaCausaleIva(causale) {
  if (!causale || typeof causale !== 'object') return false
  const blob = [
    causale.descrizione,
    causale.codice,
    causale.codiceInterno,
    causale.codice_interno,
    causale.note,
  ]
    .map((part) => String(part || '').trim())
    .join(' ')
    .toLowerCase()
  return /reverse\s*charge|autofatt|intra\s*ue|extra\s*ue|\ba17/i.test(blob)
}

/**
 * Per società demo: dropdown IVA con causali seed TESTLAB, senza globali reverse/autofattura.
 *
 * @param {Array<object>|null|undefined} causaliIva
 * @param {string} societaId
 * @returns {Array<object>}
 */
export function filterCausaliIvaForDemoWorkingView(causaliIva, societaId) {
  const sid = normalizeSocietaId(societaId)
  const list = Array.isArray(causaliIva) ? causaliIva : []

  const societaScoped = sid
    ? list.filter((row) => getCausaleIvaRowSocietaId(row) === sid)
    : []

  const testLabRows = societaScoped.filter(isTestLabCausaleIvaRow)
  if (testLabRows.length) {
    return sortCausaliIvaByAliquota(testLabRows)
  }

  const byDemoCodice = list.filter((row) => isTestLabCausaleIvaRow(row))
  if (byDemoCodice.length) {
    return sortCausaliIvaByAliquota(byDemoCodice)
  }

  const ordinariaSocieta = societaScoped.filter((row) => !isLikelyReverseOrAutofatturaCausaleIva(row))
  return sortCausaliIvaByAliquota(ordinariaSocieta)
}

/**
 * @param {Array<object>} rows
 * @returns {Array<object>}
 */
function sortCausaliIvaByAliquota(rows) {
  return [...rows].sort((left, right) => {
    const leftAliquota = parseAliquotaPercent(left?.aliquota) ?? -1
    const rightAliquota = parseAliquotaPercent(right?.aliquota) ?? -1
    if (leftAliquota !== rightAliquota) return leftAliquota - rightAliquota
    return String(left?.codice || '').localeCompare(String(right?.codice || ''), 'it')
  })
}

/**
 * @param {Array<object>|null|undefined} causaliIva
 * @param {number|string|null|undefined} aliquota
 * @returns {string}
 */
export function resolveDemoCausaleIvaIdByAliquota(causaliIva, aliquota) {
  const percent = parseAliquotaPercent(aliquota)
  if (percent == null) return ''
  const targetCodice = String(DEMO_IVA_CODICI_BY_ALIQUOTA[percent] || '').trim().toUpperCase()
  if (!targetCodice) return ''

  const list = Array.isArray(causaliIva) ? causaliIva : []
  const match = list.find((row) => String(row?.codice || '').trim().toUpperCase() === targetCodice)
  return normalizeCausaleIvaId(match?.id)
}

function getCounterpartyCausaleIvaId(counterpartyAccount) {
  return normalizeCausaleIvaId(
    counterpartyAccount?.causaleIvaId || counterpartyAccount?.causale_iva_id || '',
  )
}

/**
 * Risolve causale IVA per riga bozza working view Import.
 *
 * @param {object} params
 * @param {object} [params.source]
 * @param {object|null} [params.counterpartyAccount]
 * @param {Array<object>} [params.causaliIva]
 * @param {boolean} [params.isDemoSocieta]
 * @returns {string}
 */
export function resolveImportWorkingViewCausaleIvaId({
  source = {},
  counterpartyAccount = null,
  causaliIva = [],
  isDemoSocieta = false,
} = {}) {
  const explicitId = normalizeCausaleIvaId(source?.causaleIvaId || source?.causale_iva_id)
  if (explicitId) return explicitId

  const list = Array.isArray(causaliIva) ? causaliIva : []
  const aliquota = source?.aliquota

  if (isDemoSocieta) {
    const demoId = resolveDemoCausaleIvaIdByAliquota(list, aliquota)
    if (demoId) return demoId
  }

  const supplierPreferredCausaleId = getCounterpartyCausaleIvaId(counterpartyAccount)
  return normalizeCausaleIvaId(resolveIvaOrNull({
    conto: supplierPreferredCausaleId ? { causale_iva_id: supplierPreferredCausaleId } : null,
    aliquota,
    natura: source?.natura,
    causaliIva: list,
  }))
}

/**
 * @param {Array<object>|null|undefined} ivaDraftRows
 * @param {object} [options]
 * @param {number} [options.documentVatTotal]
 * @returns {{ status: 'ok'|'blocked', blockingIssues: string[], warnings: string[], checks: Array<object> }}
 */
export function assessWorkingViewIvaDraftRows(ivaDraftRows, options = {}) {
  const rows = normalizeImportVatRows(ivaDraftRows)
  const documentVatTotal = Number(options.documentVatTotal ?? 0) || 0
  const blockingIssues = []
  const checks = []

  if (!rows.length) {
    if (documentVatTotal > 0) {
      const issue = 'Causale IVA mancante'
      blockingIssues.push(issue)
      checks.push({ key: 'iva-causale', label: issue, status: 'blocked', detail: 'Nessuna riga IVA significativa in bozza' })
      return { status: 'blocked', blockingIssues, warnings: [], checks }
    }
    checks.push({ key: 'iva-causale', label: 'Nessuna riga IVA significativa', status: 'ok' })
    return { status: 'ok', blockingIssues, warnings: [], checks }
  }

  rows.forEach((row, index) => {
    const causaleIvaId = normalizeCausaleIvaId(row?.causaleIvaId || row?.causale_iva_id)
    const imponibile = Number(row?.imponibile ?? 0) || 0
    const imposta = Number(row?.imposta ?? 0) || 0
    const indetraibile = Number(row?.indetraibileImposta ?? row?.iva_indetraibile ?? 0) || 0
    const hasAmounts = imponibile > 0 || imposta > 0 || indetraibile > 0
    const hasFiscal = hasImportVatRowFiscalSignificance(row)
    const rowSuffix = rows.length > 1 ? ` (riga ${index + 1})` : ''

    if ((hasAmounts || hasFiscal) && !causaleIvaId) {
      const issue = `Causale IVA mancante${rowSuffix}`
      blockingIssues.push(issue)
      checks.push({ key: `iva-causale-${index}`, label: issue, status: 'blocked' })
      return
    }

    if (causaleIvaId) {
      checks.push({
        key: `iva-causale-${index}`,
        label: `Causale IVA assegnata${rowSuffix}`,
        status: 'ok',
        detail: row?.causaleIvaLabel || causaleIvaId,
      })
    }
  })

  return {
    status: blockingIssues.length ? 'blocked' : 'ok',
    blockingIssues,
    warnings: [],
    checks,
  }
}

/**
 * @param {object|null|undefined} baseChecks
 * @param {object|null|undefined} ivaChecks
 * @returns {object}
 */
export function mergeWorkingViewChecksWithIvaDraft(baseChecks, ivaChecks) {
  const base = baseChecks && typeof baseChecks === 'object'
    ? baseChecks
    : { status: 'ok', blockingIssues: [], warnings: [], checks: [] }
  const iva = ivaChecks && typeof ivaChecks === 'object'
    ? ivaChecks
    : { status: 'ok', blockingIssues: [], warnings: [], checks: [] }

  const blockingIssues = [
    ...(Array.isArray(base.blockingIssues) ? base.blockingIssues : []),
    ...(Array.isArray(iva.blockingIssues) ? iva.blockingIssues : []),
  ]
  const warnings = [
    ...(Array.isArray(base.warnings) ? base.warnings : []),
    ...(Array.isArray(iva.warnings) ? iva.warnings : []),
  ]
  const checks = [
    ...(Array.isArray(base.checks) ? base.checks : []),
    ...(Array.isArray(iva.checks) ? iva.checks : []),
  ]

  const status = blockingIssues.length
    ? 'blocked'
    : warnings.length
      ? 'warning'
      : 'ok'

  return { status, blockingIssues, warnings, checks }
}

export { DEMO_IVA_CODICI_BY_ALIQUOTA }

/**
 * @param {object|null|undefined} parsedDocument
 * @returns {Array<object>}
 */
export function extractWorkingViewIvaSourceRows(parsedDocument) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const fromDoc = Array.isArray(parsed.ivaRows) ? parsed.ivaRows : []
  if (fromDoc.length) return fromDoc

  const imponibile = Number(parsed.imponibile ?? 0) || 0
  const imposta = Number(parsed.iva ?? parsed.imposta ?? 0) || 0
  if (imponibile <= 0 && imposta <= 0) return []

  const aliquota = imponibile > 0
    ? Math.round((imposta / imponibile) * 100)
    : null

  return [{
    aliquota: aliquota ?? 0,
    imponibile,
    imposta,
    iva: imposta,
    esigibilita: parsed.esigibilita || parsed.esigibilitaIVA || 'Immediata',
  }]
}
