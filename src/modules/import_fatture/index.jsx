import { useState, useEffect, useCallback, useMemo, useRef, useTransition, memo } from 'react'
import * as XLSX from 'xlsx'
import { trace } from '../../core/debug/trace'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../utils/pipelineLogger.js'
import { useAIStatus } from '../../context/AIStatusContext'
import { sb } from '../../lib/supabase.js'
import * as importRepo from '../import_unificato/data/importRepo.js'
import { inspectImportedFilesForFatture, processImportedFiles } from '../import_unificato/application/importWorkflow.js'
import {
  getPreferredSocietaId,
  getStoredAiMode,
  getStoredAiPreprocessMode,
  persistAiMode,
  persistAiPreprocessMode,
  persistSelectedSocieta,
} from '../import_unificato/application/importContainerStorage.js'
import {
  filterExpandedItemsForFattureStaging,
  filterRootFilesForFattureImport,
} from './application/importFattureUpload.js'
import {
  getArchivioDocumentoIdFromImportMeta,
  insertImportFattureIntoDocumentiContabilita,
  syncImportFattureDocumentoContabilitaFromImportDoc,
} from './application/importFattureArchivioBridge.js'
import { buildImportFattureIvaProposal } from './application/importFattureIvaProposal.js'
import {
  buildDocSnapshotForContoMatch,
  pickImportFatturaStagingContoCodice,
} from './application/importFattureContoProposal.js'
import {
  pickDominantHistoricalCausaleContabileId,
  pickImportFatturaStagingCausaleContabileId,
} from './application/importFattureCausaleContabileProposal.js'
import { confermaERegistraDocumentoContabilitaDaArchivio } from './application/importFattureContabilitaFinalize.js'
import { fmt } from '../import_unificato/components/importUiConfig.js'
import { DocumentPreviewModal } from '../../shared/ui/DocumentPreviewModal.jsx'
import { extractHistoricalSearchIdentity, buildHistoricalContoSuggestions } from '../../shared/utils/historicalContoSuggestions.js'
import { suggestContiPerDocumento, buildAccountDecisionHierarchy } from '../../shared/utils/pianoContiSuggestions.js'
import * as contabilitaRepo from '../contabilita/data/contabilitaRepo.js'
import { PianoContiHierarchyPicker } from './components/PianoContiHierarchyPicker.jsx'
import {
  evaluateImportFattureStructuralAccountingBlocks,
  WORKING_PN_GRID_KEY,
  WORKING_IVA_GRID_KEY,
} from './application/importFattureWorkingViewGuards.js'

function evaluatePreCommitChecks(checks = []) {
  const list = Array.isArray(checks) ? checks : []
  const hasError = list.some((c) => String(c?.level || c?.severity || '').toUpperCase() === 'ERROR' || String(c?.tab || '').trim())
  const hasWarning = list.some((c) => String(c?.level || c?.severity || '').toUpperCase() === 'WARNING')
  return {
    checks: list,
    semaforo: hasError ? 'rosso' : hasWarning ? 'giallo' : 'verde',
  }
}

const PARSE_AI_RAW_STRING_CACHE_LIMIT = 600
const parseAiRawStringCache = new Map()
const parseAiRawObjectCache = new WeakMap()

function parseAiRaw(doc) {
  const raw = doc?.ai_raw_response
  if (!raw) return {}
  if (typeof raw === 'object') {
    const cached = parseAiRawObjectCache.get(raw)
    if (cached) return cached
    parseAiRawObjectCache.set(raw, raw)
    return raw
  }
  const cacheKey = String(raw)
  if (parseAiRawStringCache.has(cacheKey)) {
    return parseAiRawStringCache.get(cacheKey)
  }
  let parsed = {}
  try {
    parsed = JSON.parse(cacheKey)
  } catch {
    parsed = {}
  }
  if (parseAiRawStringCache.size >= PARSE_AI_RAW_STRING_CACHE_LIMIT) {
    parseAiRawStringCache.clear()
  }
  parseAiRawStringCache.set(cacheKey, parsed)
  return parsed
}

function areStringArrayEqual(a = [], b = []) {
  if (a === b) return true
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (String(a[i] ?? '') !== String(b[i] ?? '')) return false
  }
  return true
}

function arePlainRecordEqual(a = {}, b = {}) {
  if (a === b) return true
  const ak = Object.keys(a || {})
  const bk = Object.keys(b || {})
  if (ak.length !== bk.length) return false
  for (const k of ak) {
    if (String(a[k] ?? '') !== String(b[k] ?? '')) return false
  }
  return true
}

const IMPORT_FATTURE_TABLE_ROW_HEIGHT = 56
const IMPORT_FATTURE_TABLE_OVERSCAN = 5
const IMPORT_FATTURE_HISTORICAL_PREFETCH_ROWS = 4
const IMPORT_FATTURE_HISTORICAL_QUERY_LIMIT = 20
const IMPORT_FATTURE_HISTORICAL_LEARNING_CAP = 600
const IMPORT_FATTURE_FULL_CACHE_MAX_ROWS = 1200
const IMPORT_FATTURE_COLUMN_VISIBILITY_STORAGE_PREFIX = 'fiscosim:import_fatture:table_columns'
const IMPORT_FATTURE_TABLE_COLUMNS = [
  { key: 'soggetto', label: 'Soggetto' },
  { key: 'numero', label: 'N. documento' },
  { key: 'data', label: 'Data' },
  { key: 'imponibile', label: 'Imponibile' },
  { key: 'iva', label: 'IVA' },
  { key: 'totale', label: 'Totale' },
  { key: 'conto', label: 'Conto' },
  { key: 'causale_contabile', label: 'Causale contabile' },
  { key: 'causale_iva', label: 'Causale IVA' },
  { key: 'controlli', label: 'Controlli' },
  { key: 'stato', label: 'Stato' },
]
const IMPORT_FATTURE_DEFAULT_VISIBLE_COLUMNS = Object.freeze(
  IMPORT_FATTURE_TABLE_COLUMNS.reduce((acc, col) => {
    acc[col.key] = true
    return acc
  }, {}),
)

function sanitizeImportFattureVisibleColumns(raw) {
  const out = {}
  for (const col of IMPORT_FATTURE_TABLE_COLUMNS) {
    const key = col.key
    out[key] = raw?.[key] !== false
  }
  return out
}

function pickHistoricalStrongIvaHint(rows = []) {
  const counts = new Map()
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.causale_iva || '').trim()
    if (!id) continue
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  let topId = ''
  let topCount = 0
  for (const [id, count] of counts.entries()) {
    if (count > topCount) {
      topId = id
      topCount = count
    }
  }
  if (!topId || topCount < 2) return null
  return { id: topId, isStrong: true }
}

function isImportFattureTableDiagEnabled() {
  try {
    if (typeof window === 'undefined') return false
    // Keep table diagnostics opt-in only: ZIP diagnostics can be left enabled for import debugging
    // and would otherwise spam logs on each scroll/render in the virtual table.
    return window.localStorage?.getItem('FISCOSIM_IMPORT_TABLE_DIAG') === '1'
  } catch {
    return false
  }
}

function isImportFatturePageDiagEnabled() {
  try {
    if (typeof window === 'undefined') return false
    return (
      window.localStorage?.getItem('FISCOSIM_IMPORT_PAGE_DIAG') === '1' ||
      window.localStorage?.getItem('FISCOSIM_IMPORT_ZIP_DIAG') === '1'
    )
  } catch {
    return false
  }
}

function getRegistrazionePrimaNotaIdFromImportMeta(doc) {
  const r = parseAiRaw(doc)
  const id = r[importRepo.FISCOSIM_IMPORT_AI_META.REGISTRAZIONE_PRIMA_NOTA_ID]
  return id != null && String(id).trim() !== '' ? String(id).trim() : ''
}

function extractXmlContent(raw) {
  if (!raw || typeof raw !== 'object') return ''
  return (
    raw.xml_content ||
    raw.dati?.xml_content ||
    raw.raw_xml ||
    (typeof raw.xml === 'string' ? raw.xml : '') ||
    ''
  )
}

function buildInvoiceFallback(doc) {
  const raw = parseAiRaw(doc)
  const tipo = String(doc?.tipo_documento || raw.tipo_documento || '').trim()
  return {
    tipo_documento: tipo || undefined,
    numero: doc?.numero_documento ?? raw.numero,
    numero_documento: doc?.numero_documento ?? raw.numero,
    data: doc?.data_documento ?? raw.data,
    data_documento: doc?.data_documento ?? raw.data,
    cedente_denom: raw.cedente_denom ?? doc?.soggetto_denominazione,
    cessionario_denom: raw.cessionario_denom ?? doc?.soggetto_denominazione,
    cedente_piva: raw.cedente_piva ?? doc?.soggetto_piva,
    cessionario_piva: raw.cessionario_piva ?? doc?.soggetto_piva,
    cedente_cf: raw.cedente_cf ?? doc?.soggetto_cf,
    cessionario_cf: raw.cessionario_cf ?? doc?.soggetto_cf,
    soggetto_denominazione: doc?.soggetto_denominazione ?? raw.soggetto_denominazione,
    soggetto_piva: doc?.soggetto_piva ?? raw.soggetto_piva,
    soggetto_cf: doc?.soggetto_cf ?? raw.soggetto_cf,
    imponibile: doc?.imponibile ?? raw.imponibile,
    iva_totale: doc?.iva ?? raw.iva_totale ?? raw.iva ?? raw.imposta,
    iva: doc?.iva ?? raw.iva ?? raw.iva_totale ?? raw.imposta,
    imposta: doc?.iva ?? raw.imposta ?? raw.iva_totale ?? raw.iva,
    totale: doc?.totale ?? raw.totale,
    riepilogo_iva: raw.riepilogo_iva ?? doc?.vat_summary_json,
  }
}

function hasFullImportFatturePayload(doc) {
  const raw = parseAiRaw(doc)
  return Boolean(String(raw?.xml_content || '').trim())
}

function counterpartyLine(doc) {
  const raw = parseAiRaw(doc)
  const tipo = String(doc?.tipo_documento || raw.tipo_documento || '').toLowerCase()
  const attiva = tipo.includes('attiva')
  const denom = attiva
    ? raw.cessionario_denom || doc?.soggetto_denominazione
    : raw.cedente_denom || doc?.soggetto_denominazione
  const parts = [denom].map((x) => String(x || '').trim()).filter(Boolean)
  if (parts.length) return parts[0]
  if (doc?.soggetto_denominazione) return String(doc.soggetto_denominazione)
  return '—'
}

function sanitizeCounterpartyDisplayName(value) {
  const src = String(value || '').trim()
  if (!src) return '—'
  // Alcuni record storici salvano "nome · piva/cf": in vista iniziale vogliamo solo il nome.
  if (src.includes('·')) return src.split('·')[0].trim() || src
  // Fallback robusto: elimina eventuale token identificativo finale (es. IT123..., 11 cifre, CF alfanumerico lungo).
  const parts = src.split(/\s+/).filter(Boolean)
  if (parts.length < 2) return src
  const last = parts[parts.length - 1].replace(/[.,;:()]/g, '')
  const isVatLike = /^IT?\d{11}$/i.test(last) || /^\d{11}$/.test(last) || /^[A-Z0-9]{11,16}$/i.test(last)
  return isVatLike ? parts.slice(0, -1).join(' ') : src
}

function totalSummary(doc) {
  const raw = parseAiRaw(doc)
  if (doc?.totale != null && Number.isFinite(Number(doc.totale))) return fmt(Number(doc.totale))
  if (raw.totale != null && Number.isFinite(Number(raw.totale))) return fmt(Number(raw.totale))
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  if (rie.length) {
    const imp = rie.reduce((s, r) => s + Number(r?.imponibile || 0), 0)
    const iv = rie.reduce((s, r) => s + Number(r?.imposta || 0), 0)
    if (imp || iv) return fmt(imp + iv)
  }
  return '—'
}

function numeroData(doc) {
  const raw = parseAiRaw(doc)
  const num = doc?.numero_documento != null && String(doc.numero_documento).trim() !== ''
    ? String(doc.numero_documento)
    : raw.numero
      ? String(raw.numero)
      : '—'
  const data = doc?.data_documento != null && String(doc.data_documento).trim() !== ''
    ? String(doc.data_documento)
    : raw.data
      ? String(raw.data)
      : '—'
  return { num, data }
}

function normPivaCf(s) {
  return String(s || '')
    .replace(/\s|-/g, '')
    .replace(/^IT/i, '')
    .toUpperCase()
}

/** Chiave controparte per confronto solo sulla lista già caricata (nessuna query). */
function counterpartyMatchKey(doc) {
  const raw = parseAiRaw(doc)
  const tipo = String(doc?.tipo_documento || raw.tipo_documento || '').toLowerCase()
  const attiva = tipo.includes('attiva')
  const piva = normPivaCf(attiva ? raw.cessionario_piva : raw.cedente_piva)
  const cf = normPivaCf(attiva ? raw.cessionario_cf : raw.cedente_cf)
  const denom = String((attiva ? raw.cessionario_denom : raw.cedente_denom) || doc?.soggetto_denominazione || '')
    .trim()
    .toLowerCase()
  if (piva) return `piva:${piva}`
  if (cf) return `cf:${cf}`
  if (denom) return `denom:${denom}`
  const sogg = String(doc?.soggetto_denominazione || '').trim().toLowerCase()
  if (sogg) return `sogg:${sogg}`
  return `line:${counterpartyLine(doc)}`
}

function isProntaLavorazioneRow(doc) {
  const r = parseAiRaw(doc)
  return r[importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE] === true
}

function getOperativeOverridesObj(doc) {
  const r = parseAiRaw(doc)
  const bag = r[importRepo.FISCOSIM_IMPORT_AI_META.OPERATIVE_OVERRIDES]
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  return { ...bag }
}

function effectiveControparte(doc) {
  const o = getOperativeOverridesObj(doc)
  const c = o.controparte != null ? String(o.controparte).trim() : ''
  if (c) return sanitizeCounterpartyDisplayName(c)
  return sanitizeCounterpartyDisplayName(counterpartyLine(doc))
}

function effectiveNumeroData(doc) {
  const o = getOperativeOverridesObj(doc)
  const base = numeroData(doc)
  const num =
    o.numero_documento != null && String(o.numero_documento).trim() !== ''
      ? String(o.numero_documento).trim()
      : base.num
  const data =
    o.data_documento != null && String(o.data_documento).trim() !== ''
      ? String(o.data_documento).trim()
      : base.data
  return { num, data }
}

function parseLooseTotaleInput(s) {
  const t = String(s || '').trim().replace(/\s/g, '')
  if (!t) return NaN
  const normalized = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t
  return Number(normalized)
}

function isTypingTarget(el) {
  if (!el || typeof el !== 'object') return false
  const tag = String(el.tagName || '').toUpperCase()
  return Boolean(el.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
}

/** Valore per `<input type="date" />` (YYYY-MM-DD) da stringa salvata o da data documento. */
function toIsoDateForInput(value) {
  const t = String(value ?? '').trim()
  if (!t) return ''
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10)
  const m = t.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/)
  if (m) {
    const dd = m[1].padStart(2, '0')
    const mm = m[2].padStart(2, '0')
    return `${m[3]}-${mm}-${dd}`
  }
  try {
    const d = new Date(t)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  } catch {
    /* noop */
  }
  return ''
}

function mergeDataRegistrazioneIntoImportedBlob(root, dateIso) {
  const d = String(dateIso ?? '').trim().slice(0, 10)
  const base = typeof root === 'object' && root && !Array.isArray(root) ? { ...root } : {}
  if (!d) return base
  const META = importRepo.FISCOSIM_IMPORT_AI_META
  const prev =
    base[META.OPERATIVE_OVERRIDES] && typeof base[META.OPERATIVE_OVERRIDES] === 'object'
      ? { ...base[META.OPERATIVE_OVERRIDES] }
      : {}
  return {
    ...base,
    [META.OPERATIVE_OVERRIDES]: { ...prev, data_registrazione: d },
    [META.OPERATIVE_OVERRIDES_AT]: new Date().toISOString(),
  }
}

function effectiveTotaleDisplay(doc) {
  const o = getOperativeOverridesObj(doc)
  if (o.totale != null && String(o.totale).trim() !== '') {
    const s = String(o.totale).trim()
    const n = parseLooseTotaleInput(s)
    if (Number.isFinite(n)) return fmt(n)
    return s
  }
  return totalSummary(doc)
}

function hasOperativeOverride(doc, field) {
  const o = getOperativeOverridesObj(doc)
  if (field === 'controparte') return o.controparte != null && String(o.controparte).trim() !== ''
  if (field === 'numero_documento') return o.numero_documento != null && String(o.numero_documento).trim() !== ''
  if (field === 'data_documento') return o.data_documento != null && String(o.data_documento).trim() !== ''
  if (field === 'totale') return o.totale != null && String(o.totale).trim() !== ''
  return false
}

function getAccountingProposalsObj(doc) {
  const r = parseAiRaw(doc)
  const bag = r[importRepo.FISCOSIM_IMPORT_AI_META.ACCOUNTING_PROPOSALS]
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  return { ...bag }
}

function hasAccountingProposal(doc, field) {
  const o = getAccountingProposalsObj(doc)
  if (field === 'conto_codice') return o.conto_codice != null && String(o.conto_codice).trim() !== ''
  if (field === 'causale_iva_id') return o.causale_iva_id != null && String(o.causale_iva_id).trim() !== ''
  return false
}

function getIvaOverridesObj(doc) {
  const r = parseAiRaw(doc)
  const bag = r[importRepo.FISCOSIM_IMPORT_AI_META.IVA_OVERRIDES]
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return {}
  return { ...bag }
}

function hasIvaOverride(doc, field) {
  const o = getIvaOverridesObj(doc)
  if (field === 'imponibile') return o.imponibile != null && String(o.imponibile).trim() !== ''
  if (field === 'iva') return o.iva != null && String(o.iva).trim() !== ''
  if (field === 'detraibilita_iva') return o.detraibilita_iva != null && String(o.detraibilita_iva).trim() !== ''
  return false
}

/** Prima riga `riepilogo_iva` nel blob AI (nessun override). */
function ivaAiFirstRowStrings(doc) {
  const raw = parseAiRaw(doc)
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  const r0 = rie[0] || {}
  const imp = r0.imponibile != null ? Number(r0.imponibile) : Number.isFinite(Number(doc?.imponibile)) ? Number(doc.imponibile) : NaN
  const iv =
    r0.imposta != null
      ? Number(r0.imposta)
      : r0.iva != null
        ? Number(r0.iva)
        : Number.isFinite(Number(doc?.iva))
          ? Number(doc.iva)
          : NaN
  let det = ''
  if (r0.percentuale_detraibilita != null && String(r0.percentuale_detraibilita).trim() !== '') {
    det = String(r0.percentuale_detraibilita).trim()
  } else if (r0.percentuale_detraibilita_iva != null && String(r0.percentuale_detraibilita_iva).trim() !== '') {
    det = String(r0.percentuale_detraibilita_iva).trim()
  } else if (r0.detraibilita != null && String(r0.detraibilita).trim() !== '') {
    det = String(r0.detraibilita).trim()
  }
  return {
    imponibile: Number.isFinite(imp) ? String(imp) : '',
    iva: Number.isFinite(iv) ? String(iv) : '',
    detraibilita_iva: det,
  }
}

function effectiveIvaTripleStrings(doc) {
  const o = getIvaOverridesObj(doc)
  const ai = ivaAiFirstRowStrings(doc)
  return {
    imponibile:
      o.imponibile != null && String(o.imponibile).trim() !== '' ? String(o.imponibile).trim() : ai.imponibile,
    iva: o.iva != null && String(o.iva).trim() !== '' ? String(o.iva).trim() : ai.iva,
    detraibilita_iva:
      o.detraibilita_iva != null && String(o.detraibilita_iva).trim() !== ''
        ? String(o.detraibilita_iva).trim()
        : ai.detraibilita_iva,
  }
}

function buildImportFattureTableRowViewModel(doc, context = {}) {
  const {
    lightOnly = false,
    queueFullView = false,
    rowEval = null,
    readinessOpts = {},
    pianoConti = [],
    pianoContiByCodice = new Map(),
    causaliIva = [],
    causaliContabili = [],
    causaliContabiliById = new Map(),
    historicalContoTopByImportId = {},
    historicalCausaleContabileIdByImportId = {},
    historicalIvaTopByImportId = {},
  } = context

  if (lightOnly) {
    const id = doc?.id
    const filename = String(doc?.filename || '').trim()
    const numero = String(doc?.numero || '').trim() || '—'
    const data = String(doc?.data || '').trim() || '—'
    const counterpartyLabel = sanitizeCounterpartyDisplayName(
      String(doc?.soggetto_denominazione || doc?.cedente_denom || doc?.cessionario_denom || '').trim() || '—',
    )
    const imponibileRaw = String(doc?.imponibile ?? '').trim()
    const ivaRaw = String(doc?.iva_totale ?? doc?.iva ?? '').trim()
    const totaleRaw = String(doc?.totale ?? '').trim()
    const savedIva = String(doc?.causale_iva_id || '').trim() !== ''
    return {
      id,
      filename,
      counterpartyLabel,
      nd: { num: numero, data },
      ivaTriple: { imponibile: imponibileRaw || '—', iva: ivaRaw || '—', detraibilita_iva: '' },
      totaleDisplay: totaleRaw || '—',
      pronta: false,
      benPreparata: false,
      rowDiag: null,
      isCandidate: false,
      confValid: false,
      archLinkedId: '',
      archRegPnId: '',
      contoCod: '',
      contoNome: '—',
      causaleContId: '',
      causaleContabileLabel: '—',
      causaleIvaId: String(doc?.causale_iva_id || '').trim(),
      causaleIvaLabel: '—',
      rowBg: undefined,
      statoLabel: String(doc?.stato || doc?.accounting_status || doc?.workflow_status || '').trim() || 'Caricata',
      statoColor: '#6b8bb0',
      statoBg: 'rgba(107, 139, 176, 0.14)',
      savedIva,
      ivaStatusLabel: savedIva ? 'IVA salvata' : 'IVA da completare',
      lightOnly: true,
    }
  }

  const ap = getAccountingProposalsObj(doc)
  const pronta = rowEval?.pronta ?? isProntaLavorazioneRow(doc)
  const benPreparata = rowEval?.benPreparata ?? isBenPreparata(doc, readinessOpts)
  const rowDiag = queueFullView ? (rowEval?.diag || evaluateProntaLavorazioneDiagnosi(doc, readinessOpts, { benPreparata })) : null
  const isCandidate = queueFullView ? (rowEval?.isCandidate ?? candidateForNextStep(doc, readinessOpts)) : false
  const confValid = queueFullView ? (rowEval?.confValid ?? confermaPassoFinaleValida(doc, readinessOpts)) : false
  const archLinkedId = queueFullView && pronta ? getArchivioDocumentoIdFromImportMeta(doc) : ''
  const archRegPnId = queueFullView && pronta ? getRegistrazionePrimaNotaIdFromImportMeta(doc) : ''
  const counterpartyLabel = effectiveControparte(doc)
  const nd = effectiveNumeroData(doc)
  const ivaTriple = effectiveIvaTripleStrings(doc)
  const totaleDisplay = effectiveTotaleDisplay(doc)
  const contoCod = String(
    pickImportFatturaStagingContoCodice(
      doc,
      pianoConti,
      String(historicalContoTopByImportId[doc.id] || '').trim(),
    ) || '',
  ).trim()
  const contoMatch = contoCod ? pianoContiByCodice?.get(contoCod) || null : null
  const contoNome = contoMatch?.descrizione || contoCod || '–'
  const causaleContId = String(
    pickImportFatturaStagingCausaleContabileId(
      doc,
      causaliContabili,
      [],
      String(historicalCausaleContabileIdByImportId[doc.id] || '').trim(),
    ) || '',
  ).trim()
  const causContMatch = causaleContId ? causaliContabiliById?.get(causaleContId) || null : null
  const causaleContabileLabel = causContMatch
    ? [causContMatch.codice, causContMatch.descrizione].filter(Boolean).join(' – ')
    : '–'
  const causaleIvaId = String(ap.causale_iva_id || '').trim()
  const causaleIvaMatch = causaleIvaId ? (causaliIva || []).find((c) => String(c?.id || '').trim() === causaleIvaId) : null
  const causaleIvaLabel = causaleIvaMatch
    ? [causaleIvaMatch.codice, causaleIvaMatch.descrizione].filter(Boolean).join(' – ')
    : '–'
  const rowDiagOk = !rowDiag || rowDiag.level === 'ok'
  const ok = pronta && benPreparata && rowDiagOk
  const warn = pronta && !ok
  const statoLabel = ok ? 'Pronta' : warn ? 'Da verificare' : 'Incompleta'
  const statoColor = ok ? '#2e7d32' : warn ? '#f9a825' : '#e53935'
  const statoBg = ok ? 'rgba(46, 125, 50, 0.16)' : warn ? 'rgba(251, 192, 45, 0.16)' : 'rgba(229, 57, 53, 0.12)'
  const savedIva = ap.causale_iva_id != null && String(ap.causale_iva_id).trim() !== ''
  const historicalIva = historicalIvaTopByImportId[doc.id] || null
  const hasDocumentIvaHint = Boolean(String(ivaTriple.imponibile || '').trim() || String(ivaTriple.iva || '').trim())
  const ivaStatusLabel = savedIva
    ? 'IVA salvata'
    : historicalIva?.id
      ? 'IVA da storico'
      : hasDocumentIvaHint
        ? 'IVA da documento'
        : 'IVA da completare'
  const rowBg = isCandidate
    ? 'rgba(27, 94, 32, 0.05)'
    : confValid
      ? 'rgba(0, 77, 64, 0.09)'
      : undefined

  return {
    id: doc?.id,
    counterpartyLabel,
    nd,
    ivaTriple,
    totaleDisplay,
    pronta,
    benPreparata,
    rowDiag,
    isCandidate,
    confValid,
    archLinkedId,
    archRegPnId,
    contoCod,
    contoNome,
    causaleContId,
    causaleContabileLabel,
    causaleIvaId,
    causaleIvaLabel,
    rowBg,
    statoLabel,
    statoColor,
    statoBg,
    savedIva,
    ivaStatusLabel,
  }
}

function fmtIvaCell(s) {
  const t = String(s ?? '').trim()
  if (!t) return '—'
  const n = parseLooseTotaleInput(t)
  if (Number.isFinite(n)) return fmt(n)
  return t
}

function fmtDetraibilitaPct(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  return t.includes('%') ? t : `${t}%`
}

function normContoCodiceUi(s) {
  return String(s ?? '').trim()
}

function newWorkingViewGridRowId() {
  return `wg-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeStoredPnGrid(rows) {
  if (!Array.isArray(rows) || !rows.length) return []
  return rows.map((row) => ({
    id: row?.id != null && String(row.id).trim() !== '' ? String(row.id) : newWorkingViewGridRowId(),
    conto: String(row?.conto ?? ''),
    dare: String(row?.dare ?? ''),
    avere: String(row?.avere ?? ''),
    nota: String(row?.nota ?? ''),
  }))
}

function normalizeStoredIvaGrid(rows) {
  if (!Array.isArray(rows) || !rows.length) return []
  return rows.map((row) => ({
    id: row?.id != null && String(row.id).trim() !== '' ? String(row.id) : newWorkingViewGridRowId(),
    causale_iva_id: String(row?.causale_iva_id ?? ''),
    imponibile: String(row?.imponibile ?? ''),
    iva: String(row?.iva ?? ''),
  }))
}

/** Estrae codice conto dalla cella libera (parte prima di « · », preservando codici con spazi). */
function leadingContoCodiceFromCell(s) {
  const t = String(s ?? '').trim()
  if (!t) return ''
  const beforeSep = t.split('·')[0].trim()
  return beforeSep.replace(/\s+/g, ' ').trim()
}

function findPianoContoByCellValue(cellValue, pianoConti) {
  const code = normContoCodiceUi(leadingContoCodiceFromCell(cellValue))
  if (!code) return null
  return (
    (Array.isArray(pianoConti) ? pianoConti : []).find(
      (x) => String(x?.codice || '').trim() === code && Number(x?.livello || 0) >= 3,
    ) || null
  )
}

function resolveIvaContoLabel({ causaleIvaId = '', pianoConti = [] } = {}) {
  const list = (Array.isArray(pianoConti) ? pianoConti : []).filter(
    (c) => c && c.is_iva && Number(c.livello || 0) >= 3,
  )
  if (!list.length) return 'IVA a ns credito'
  const byCausale = causaleIvaId
    ? list.find((c) => String(c.causale_iva_id || '').trim() === String(causaleIvaId).trim())
    : null
  const byCredito = list.find((c) => /iva/i.test(String(c.descrizione || '')) && /(credito|ns[\/\s]*credito)/i.test(String(c.descrizione || '')))
  const picked = byCausale || byCredito || list[0]
  return `${picked.codice} · ${picked.descrizione || picked.nome || 'IVA'}`
}

function pnGridHasAllRowsWithValidConto(
  doc,
  opts = {},
) {
  if (!doc) return false
  const d = resolveDocForImportReadiness(doc, opts)
  const { pianoConti = [], causaliIva = [], causaliContabili = [], historicalContoTopByImportId = null, historicalCausaleContabileIdByImportId = null } = opts
  const ap = getAccountingProposalsObj(d)
  const histTop =
    historicalContoTopByImportId && d?.id != null
      ? String(historicalContoTopByImportId[d.id] || '').trim()
      : ''
  const effCod = pickImportFatturaStagingContoCodice(d, pianoConti, histTop)
  const histCaus =
    historicalCausaleContabileIdByImportId && d?.id != null
      ? String(historicalCausaleContabileIdByImportId[d.id] || '').trim()
      : ''
  const effCausId = pickImportFatturaStagingCausaleContabileId(d, causaliContabili, [], histCaus)
  const stored = ap?.[WORKING_PN_GRID_KEY]
  const eff = effectiveIvaTripleStrings(d)
  const rows = Array.isArray(stored) && stored.length
    ? normalizeStoredPnGrid(stored)
    : buildDefaultPnGridForDoc(
      d,
      effCod,
      ap?.causale_iva_id,
      eff.imponibile,
      eff.iva,
      pianoConti,
      causaliIva,
      causaliContabili,
      effCausId,
    )
  const meaningful = rows.filter((r) => String(r?.dare ?? '').trim() || String(r?.avere ?? '').trim())
  if (!meaningful.length) return false
  return meaningful.every((r) => !!findPianoContoByCellValue(r?.conto, pianoConti))
}

function buildDefaultPnGridForDoc(
  doc,
  contoCodice,
  causaleIvaId,
  ivaImponibile,
  ivaIva,
  pianoConti,
  causaliIva,
  causaliContabili,
  causaleContabileIdOverride = '',
) {
  if (!doc) return []
  const ap = getAccountingProposalsObj(doc)
  const cod = normContoCodiceUi(contoCodice || ap.conto_codice)
  const p = (pianoConti || []).find((x) => String(x.codice || '').trim() === cod)
  const contoLabel = p ? `${p.codice} · ${p.descrizione || p.nome || ''}` : cod || ''

  const impStr = String(ivaImponibile ?? '').trim()
  const ivaStr = String(ivaIva ?? '').trim()
  const dareImp = fmtIvaCell(impStr) || ''
  const dareIva = fmtIvaCell(ivaStr) || ''

  const causIvaId = String(causaleIvaId || ap.causale_iva_id || '').trim()
  const ivaContoLabel = resolveIvaContoLabel({ causaleIvaId: causIvaId, pianoConti })

  const ccId = String(causaleContabileIdOverride || ap.causale_id || '').trim()
  const cc = ccId ? causaliContabili.find((c) => String(c.id) === ccId) : null
  const ccFrag = cc ? `Causale cont. ${cc.codice} · ${cc.descrizione}` : ''

  const nImp = parseLooseTotaleInput(impStr)
  const nIva = parseLooseTotaleInput(ivaStr)
  let avere = effectiveTotaleDisplay(doc)
  if (Number.isFinite(nImp) && Number.isFinite(nIva)) {
    avere = fmt(Math.round((nImp + nIva) * 100) / 100)
  }
  const cpResolved = resolveCounterpartyMasterContoForDefault(doc, pianoConti)
  const tipo = String(doc?.tipo_documento || parseAiRaw(doc)?.tipo_documento || '').toLowerCase()
  const isAttiva = tipo.includes('attiva')
  const cpFallback = `${isAttiva ? 'Crediti verso cliente' : 'Debiti verso fornitore'} — ${effectiveControparte(doc)}`
  const cpLabel = cpResolved?.status === 'ok' && cpResolved?.conto
    ? `${cpResolved.conto.codice} · ${cpResolved.conto.descrizione || cpResolved.conto.nome || ''}`
    : cpFallback

  return [
    {
      id: newWorkingViewGridRowId(),
      conto: contoLabel,
      dare: dareImp,
      avere: '',
      nota: 'Imponibile su conto costi / beni o servizi',
    },
    {
      id: newWorkingViewGridRowId(),
      conto: ivaContoLabel,
      dare: dareIva,
      avere: '',
      nota: 'IVA a credito (causale IVA)',
    },
    {
      id: newWorkingViewGridRowId(),
      conto: cpLabel,
      dare: '',
      avere: avere || '',
      nota: [ccFrag, 'Chiusura documento'].filter(Boolean).join(' · ') || 'Chiusura documento',
    },
  ]
}

function buildDefaultIvaGridForDoc(doc, causaleIvaIdDraft, effTriple, ivaProposal = null) {
  if (!doc) return []
  const raw = parseAiRaw(doc)
  const rie = Array.isArray(raw.riepilogo_iva) ? raw.riepilogo_iva : []
  const ap = getAccountingProposalsObj(doc)
  const eff = effTriple || effectiveIvaTripleStrings(doc)
  const proposalRows = Array.isArray(ivaProposal?.prefillRows) ? ivaProposal.prefillRows : []

  const causaleLabelRow = (r, rowIdx) => {
    if (rowIdx === 0) {
      const id0 = String(causaleIvaIdDraft || ap.causale_iva_id || ivaProposal?.suggestedCausaleId || '').trim()
      if (id0) return id0
    }
    if (r?.causale_iva_id != null && String(r.causale_iva_id).trim() !== '') return String(r.causale_iva_id).trim()
    const proposalId = String(proposalRows[rowIdx]?.suggested_causale_iva_id || '').trim()
    if (proposalId) return proposalId
    return ''
  }

  if (rie.length) {
    return rie.map((r, i) => {
      const imSrc =
        i === 0 && String(eff.imponibile || '').trim()
          ? eff.imponibile
          : r.imponibile != null
            ? String(r.imponibile)
            : ''
      const ivSrc =
        i === 0 && String(eff.iva || '').trim()
          ? eff.iva
          : r.imposta != null
            ? String(r.imposta)
            : r.iva != null
              ? String(r.iva)
              : ''
      return {
        id: newWorkingViewGridRowId(),
        causale_iva_id: causaleLabelRow(r, i),
        imponibile: String(imSrc).trim(),
        iva: String(ivSrc).trim(),
      }
    })
  }
  const id0 = String(causaleIvaIdDraft || ap.causale_iva_id || '').trim()
  return [
    {
      id: newWorkingViewGridRowId(),
      causale_iva_id: id0,
      imponibile: String(eff.imponibile ?? '').trim(),
      iva: String(eff.iva ?? '').trim(),
    },
  ]
}

function validateIvaGridRowsForSave(rows) {
  const list = Array.isArray(rows) ? rows : []
  for (let i = 0; i < list.length; i += 1) {
    const row = list[i] || {}
    const ti = String(row.imponibile ?? '').trim()
    const tv = String(row.iva ?? '').trim()
    if (ti) {
      const ni = parseLooseTotaleInput(ti)
      if (!Number.isFinite(ni) || ni < 0) return { ok: false, msg: `Riga ${i + 1} imponibile: importo ≥ 0 o vuoto.` }
    }
    if (tv) {
      const nv = parseLooseTotaleInput(tv)
      if (!Number.isFinite(nv) || nv < 0) return { ok: false, msg: `Riga ${i + 1} IVA: importo ≥ 0 o vuoto.` }
    }
  }
  return { ok: true }
}

function areImportFattureTableRowPropsEqual(prev, next) {
  if (prev.row !== next.row) return false
  if (prev.viewModel !== next.viewModel) return false
  if (prev.rowEval !== next.rowEval) return false
  if (prev.isChecked !== next.isChecked) return false
  if (prev.isPanel !== next.isPanel) return false
  if (prev.queueFullView !== next.queueFullView) return false
  const prevSaving = prev.tableInlineSaveId === prev.row.id
  const nextSaving = next.tableInlineSaveId === next.row.id
  if (prevSaving !== nextSaving) return false
  if (prev.tableInlineBusy !== next.tableInlineBusy) return false
  if (prev.tableVisibleColumns !== next.tableVisibleColumns) return false
  if (prev.readinessOpts !== next.readinessOpts) return false
  if (prev.pianoContiByCodice !== next.pianoContiByCodice) return false
  if (prev.causaliContabiliById !== next.causaliContabiliById) return false
  if (prev.historicalContoTopByImportId !== next.historicalContoTopByImportId) return false
  if (prev.historicalCausaleContabileIdByImportId !== next.historicalCausaleContabileIdByImportId) return false
  if (prev.historicalIvaTopByImportId !== next.historicalIvaTopByImportId) return false
  const prevEditing = prev.tableInlineEditRowId === prev.row.id
  const nextEditing = next.tableInlineEditRowId === next.row.id
  if (prevEditing !== nextEditing) return false
  if (prevEditing && prev.tableInlineEditField !== next.tableInlineEditField) return false
  if (prevEditing && prev.tableInlineQuery !== next.tableInlineQuery) return false
  return true
}

const ImportFattureTableRow = memo(function ImportFattureTableRow({
  row,
  viewModel,
  rowEval,
  isChecked,
  isPanel,
  queueFullView,
  readinessOpts,
  pianoConti,
  pianoContiByCodice,
  causaliIva = [],
  causaliContabili,
  causaliContabiliById,
  historicalContoTopByImportId,
  historicalCausaleContabileIdByImportId,
  historicalIvaTopByImportId,
  tableInlineContoOptions,
  tableInlineCausaleContabileOptions,
  tableInlineCausaleIvaOptions,
  tableInlineEditRowId,
  tableInlineEditField,
  tableInlineQuery,
  tableInlineSaveId,
  tableInlineBusy,
  onSelectRow,
  onToggleRowChecked,
  onStartInlineEdit,
  onTableInlineQueryChange,
  onCloseInlineEdit,
  onPersistTableRowAccountingPatch,
  onOpenPreview,
  tableVisibleColumns,
}) {
  const showCol = (key) => tableVisibleColumns?.[key] !== false
  const vm = viewModel || {}
  const counterpartyLabel = vm.counterpartyLabel || '–'
  const nd = vm.nd || { num: '–', data: '–' }
  const ivaTriple = vm.ivaTriple || { imponibile: '–', iva: '–', detraibilita_iva: '' }
  const totaleDisplay = vm.totaleDisplay || '–'
  const pronta = vm.pronta ?? false
  const benPreparata = vm.benPreparata ?? false
  const rowDiag = queueFullView ? (vm.rowDiag || null) : null
  const isCandidate = queueFullView ? Boolean(vm.isCandidate) : false
  const confValid = queueFullView ? Boolean(vm.confValid) : false
  const archLinkedId = queueFullView ? vm.archLinkedId || '' : ''
  const archRegPnId = queueFullView ? vm.archRegPnId || '' : ''
  const contoCod = vm.contoCod || ''
  const contoNome = vm.contoNome || '–'
  const causaleContId = vm.causaleContId || ''
  const causaleContabileLabel = vm.causaleContabileLabel || '–'
  const causaleIvaId = vm.causaleIvaId || ''
  const causaleIvaLabel = vm.causaleIvaLabel || '–'
  const savedIva = Boolean(vm.savedIva)
  const rowBg = isChecked ? 'rgba(78, 142, 247, 0.12)' : vm.rowBg ? vm.rowBg : undefined
  const isContoEditing = tableInlineEditRowId === row.id && tableInlineEditField === 'conto'
  const isCausaleEditing = tableInlineEditRowId === row.id && tableInlineEditField === 'causale'
  const isCausaleIvaEditing = tableInlineEditRowId === row.id && tableInlineEditField === 'causale_iva'
  const rowInlineBusy = tableInlineBusy || tableInlineSaveId === row.id

  return (
    <tr
      key={row.id}
      onClick={() => onSelectRow(row.id)}
      style={{
        cursor: 'pointer',
        background: rowBg || 'rgba(16, 34, 57, 0.88)',
        boxShadow: isPanel ? 'inset 4px 0 0 0 var(--gold, #d4a520)' : undefined,
      }}
    >
      <td onClick={(e) => e.stopPropagation()} style={{ padding: '.5rem .48rem', textAlign: 'center', verticalAlign: 'middle' }}>
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => onToggleRowChecked(row.id, e.target.checked)}
          aria-label={`Seleziona ${row.filename || row.id}`}
          style={{
            width: 14,
            height: 14,
            appearance: 'none',
            WebkitAppearance: 'none',
            borderRadius: 4,
            cursor: 'pointer',
            background: isChecked
              ? 'linear-gradient(180deg, rgba(246,196,60,.95), rgba(230,170,25,.95))'
              : 'rgba(11, 30, 52, 0.9)',
            border: isChecked
              ? '1px solid rgba(246,196,60,.95)'
              : '1px solid rgba(107, 139, 176, 0.72)',
            boxShadow: isChecked
              ? 'inset 0 0 0 2px rgba(8,24,45,.55)'
              : 'inset 0 0 0 1px rgba(255,255,255,.04)',
          }}
        />
      </td>
      <td style={{ maxWidth: 280, overflow: 'hidden', padding: '.5rem .9rem', verticalAlign: 'middle', ...(showCol('soggetto') ? null : { display: 'none' }) }}>
        <div style={{ fontWeight: 600, textOverflow: 'ellipsis', whiteSpace: 'nowrap', overflow: 'hidden' }}>
          {counterpartyLabel}
        </div>
      </td>
      <td
        style={{
          whiteSpace: 'nowrap',
          fontSize: '.8rem',
          letterSpacing: '.02em',
          padding: '.5rem .9rem',
          verticalAlign: 'middle',
          ...(showCol('numero') ? null : { display: 'none' }),
        }}
      >
        {nd.num || '–'}
      </td>
      <td
        style={{
          whiteSpace: 'nowrap',
          fontSize: '.78rem',
          padding: '.5rem .9rem',
          verticalAlign: 'middle',
          color: 'rgba(214,227,240,.94)',
          ...(showCol('data') ? null : { display: 'none' }),
        }}
      >
        {nd.data || '–'}
      </td>
      <td style={{ whiteSpace: 'nowrap', padding: '.5rem .9rem', textAlign: 'right', verticalAlign: 'middle', ...(showCol('imponibile') ? null : { display: 'none' }) }}>
        {ivaTriple.imponibile || '–'}
      </td>
      <td style={{ whiteSpace: 'nowrap', padding: '.5rem .9rem', textAlign: 'right', verticalAlign: 'middle', ...(showCol('iva') ? null : { display: 'none' }) }}>
        {ivaTriple.iva || '–'}
      </td>
      <td style={{ whiteSpace: 'nowrap', padding: '.5rem .9rem', textAlign: 'right', verticalAlign: 'middle', ...(showCol('totale') ? null : { display: 'none' }) }}>
        {totaleDisplay || '–'}
      </td>
      <td
        style={{ verticalAlign: 'top', padding: '.5rem .9rem', ...(showCol('conto') ? null : { display: 'none' }) }}
        title={contoCod ? `Conto: ${contoCod}` : 'Conto non proposto'}
        onClick={(e) => e.stopPropagation()}
      >
        {isContoEditing ? (
          <div style={{ minWidth: 188 }}>
            <input
              className="input"
              autoFocus
              autoComplete="off"
              placeholder="Cerca nome o codice…"
              value={tableInlineQuery}
              onChange={(e) => onTableInlineQueryChange(e.target.value)}
              disabled={rowInlineBusy}
              style={{ width: '100%', fontSize: '.72rem', padding: '.28rem .45rem', marginBottom: 6 }}
            />
            {!tableInlineQuery.trim() ? (
              <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginBottom: 4 }}>Digita almeno un carattere</div>
            ) : null}
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid rgba(124, 157, 202, 0.35)',
                borderRadius: 8,
                background: 'rgba(11, 30, 52, 0.96)',
              }}
            >
              {tableInlineContoOptions.length === 0 && tableInlineQuery.trim() ? (
                <div style={{ padding: '8px 10px', fontSize: '.65rem', color: 'var(--mu)' }}>Nessun conto corrispondente</div>
              ) : null}
              {tableInlineContoOptions.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  disabled={rowInlineBusy}
                  onClick={() => void onPersistTableRowAccountingPatch(row.id, { conto_codice: String(p.codice || '').trim() })}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    fontSize: '.68rem',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,.06)',
                    background: 'transparent',
                    color: 'rgba(225,235,248,.95)',
                    cursor: rowInlineBusy ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{p.descrizione || p.nome || p.codice}</div>
                  <div style={{ fontSize: '.58rem', color: 'var(--mu)', marginTop: 2 }}>{p.codice}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-sec"
              style={{ marginTop: 6, fontSize: '.62rem', padding: '.15rem .4rem' }}
              disabled={rowInlineBusy}
              onClick={onCloseInlineEdit}
            >
              Annulla
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              if (rowInlineBusy) return
              onStartInlineEdit(row.id, 'conto', '')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                if (rowInlineBusy) return
                onStartInlineEdit(row.id, 'conto', '')
              }
            }}
            style={{
              cursor: rowInlineBusy ? 'default' : 'pointer',
              opacity: tableInlineSaveId === row.id ? 0.65 : 1,
            }}
            title="Clicca per modificare il conto proposto"
          >
            <div style={{ fontSize: '.68rem', lineHeight: 1.22, fontWeight: 600 }}>{contoNome}</div>
            {contoCod && String(contoNome) !== String(contoCod) ? (
              <div style={{ fontSize: '.58rem', color: 'var(--mu)', marginTop: 2 }}>{contoCod}</div>
            ) : null}
          </div>
        )}
      </td>
      <td style={{ verticalAlign: 'top', padding: '.5rem .9rem', ...(showCol('causale_contabile') ? null : { display: 'none' }) }} onClick={(e) => e.stopPropagation()}>
        {isCausaleEditing ? (
          <div style={{ minWidth: 200 }}>
            <input
              className="input"
              autoFocus
              autoComplete="off"
              placeholder="Cerca sigla (es. FF, RP) o descrizione…"
              value={tableInlineQuery}
              onChange={(e) => onTableInlineQueryChange(e.target.value)}
              disabled={rowInlineBusy}
              style={{ width: '100%', fontSize: '.72rem', padding: '.28rem .45rem', marginBottom: 6 }}
            />
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid rgba(124, 157, 202, 0.35)',
                borderRadius: 8,
                background: 'rgba(11, 30, 52, 0.96)',
              }}
            >
              {tableInlineCausaleContabileOptions.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: '.65rem', color: 'var(--mu)' }}>Nessuna causale corrispondente</div>
              ) : null}
              {tableInlineCausaleContabileOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={rowInlineBusy}
                  onClick={() => void onPersistTableRowAccountingPatch(row.id, { causale_id: String(c.id) })}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    fontSize: '.68rem',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,.06)',
                    background: 'transparent',
                    color: 'rgba(225,235,248,.95)',
                    cursor: rowInlineBusy ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {c.codice} – {c.descrizione}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-sec"
              style={{ marginTop: 6, fontSize: '.62rem', padding: '.15rem .4rem' }}
              disabled={rowInlineBusy}
              onClick={onCloseInlineEdit}
            >
              Annulla
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              if (rowInlineBusy) return
              onStartInlineEdit(row.id, 'causale', causContMatch?.codice ? String(causContMatch.codice) : '')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                if (rowInlineBusy) return
                onStartInlineEdit(row.id, 'causale', causContMatch?.codice ? String(causContMatch.codice) : '')
              }
            }}
            style={{
              cursor: rowInlineBusy ? 'default' : 'pointer',
              opacity: tableInlineSaveId === row.id ? 0.65 : 1,
            }}
            title="Clicca per modificare la causale contabile"
          >
            <div style={{ fontSize: '.68rem', lineHeight: 1.22, color: 'var(--mu)', fontWeight: 600 }}>
              {causaleContabileLabel}
            </div>
          </div>
        )}
      </td>
      <td style={{ verticalAlign: 'top', padding: '.5rem .9rem', ...(showCol('causale_iva') ? null : { display: 'none' }) }} onClick={(e) => e.stopPropagation()}>
        {isCausaleIvaEditing ? (
          <div style={{ minWidth: 200 }}>
            <input
              className="input"
              autoFocus
              autoComplete="off"
              placeholder="Cerca causale IVA…"
              value={tableInlineQuery}
              onChange={(e) => onTableInlineQueryChange(e.target.value)}
              disabled={rowInlineBusy}
              style={{ width: '100%', fontSize: '.72rem', padding: '.28rem .45rem', marginBottom: 6 }}
            />
            <div
              style={{
                maxHeight: 200,
                overflowY: 'auto',
                border: '1px solid rgba(124, 157, 202, 0.35)',
                borderRadius: 8,
                background: 'rgba(11, 30, 52, 0.96)',
              }}
            >
              {tableInlineCausaleIvaOptions.length === 0 ? (
                <div style={{ padding: '8px 10px', fontSize: '.65rem', color: 'var(--mu)' }}>Nessuna causale IVA corrispondente</div>
              ) : null}
              {tableInlineCausaleIvaOptions.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  disabled={rowInlineBusy}
                  onClick={() => void onPersistTableRowAccountingPatch(row.id, { causale_iva_id: String(c.id) })}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '6px 10px',
                    fontSize: '.68rem',
                    border: 'none',
                    borderBottom: '1px solid rgba(255,255,255,.06)',
                    background: 'transparent',
                    color: 'rgba(225,235,248,.95)',
                    cursor: rowInlineBusy ? 'default' : 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 600 }}>
                    {c.codice} – {c.descrizione}
                  </div>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn-sec"
              style={{ marginTop: 6, fontSize: '.62rem', padding: '.15rem .4rem' }}
              disabled={rowInlineBusy}
              onClick={onCloseInlineEdit}
            >
              Annulla
            </button>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              if (rowInlineBusy) return
              onStartInlineEdit(row.id, 'causale_iva', causaleIvaMatch?.codice ? String(causaleIvaMatch.codice) : '')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                if (rowInlineBusy) return
                onStartInlineEdit(row.id, 'causale_iva', causaleIvaMatch?.codice ? String(causaleIvaMatch.codice) : '')
              }
            }}
            style={{
              cursor: rowInlineBusy ? 'default' : 'pointer',
              opacity: tableInlineSaveId === row.id ? 0.65 : 1,
            }}
            title="Clicca per modificare la causale IVA"
          >
            <div style={{ fontSize: '.68rem', lineHeight: 1.22, color: 'var(--mu)', fontWeight: 600 }}>
              {causaleIvaLabel}
            </div>
          </div>
        )}
      </td>
      {queueFullView ? (
        <td style={{ verticalAlign: 'top', padding: '.5rem .9rem', ...(showCol('controlli') ? null : { display: 'none' }) }}>
          {rowDiag ? (
            <span
              style={{
                display: 'inline-block',
                fontSize: '.58rem',
                fontWeight: 800,
                padding: '3px 6px',
                borderRadius: 6,
                whiteSpace: 'nowrap',
                ...diagnosiLevelStyle(rowDiag.level),
              }}
              title={rowDiag.issues.length ? rowDiag.issues.join('\n') : 'Controlli superati'}
            >
              {rowDiag.labelShort}
            </span>
          ) : (
            <span style={{ color: 'var(--mu)', fontSize: '.72rem' }}>–</span>
          )}
        </td>
      ) : null}
      <td style={{ verticalAlign: 'top', padding: '.5rem .9rem', ...(showCol('stato') ? null : { display: 'none' }) }}>
        {(() => {
          const rowDiagOk = !rowDiag || rowDiag.level === 'ok'
          const ok = pronta && benPreparata && rowDiagOk
          const warn = pronta && !ok
          const statoLabel = ok ? 'Pronta' : warn ? 'Da verificare' : 'Incompleta'
          const statoColor = ok ? '#2e7d32' : warn ? '#f9a825' : '#e53935'
          const statoBg = ok ? 'rgba(46, 125, 50, 0.16)' : warn ? 'rgba(251, 192, 45, 0.16)' : 'rgba(229, 57, 53, 0.12)'
          const historicalIva = historicalIvaTopByImportId[row.id] || null
          const hasDocumentIvaHint = Boolean(
            String(ivaTriple.imponibile || '').trim() || String(ivaTriple.iva || '').trim()
          )
          const ivaStatusLabel = savedIva
            ? 'IVA salvata'
            : historicalIva?.id
              ? 'IVA da storico'
              : hasDocumentIvaHint
                ? 'IVA da documento'
                : 'IVA da completare'
          return (
            <>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: '.72rem',
                  fontWeight: 600,
                  background: statoBg,
                  color: statoColor,
                  boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.06)',
                }}
                title={ok ? 'Pronta (ben preparata + controlli OK)' : warn ? 'Segnata ma da verificare' : 'Non segnata / dati mancanti'}
              >
                <span style={{ width: 8, height: 8, borderRadius: 999, background: statoColor }} />
                {statoLabel}
              </span>
              <div style={{ marginTop: 5, fontSize: '.63rem', color: 'var(--mu)' }}>{ivaStatusLabel}</div>
              {queueFullView && (archLinkedId || archRegPnId) ? (
                <div style={{ marginTop: 4, fontSize: '.64rem', color: 'var(--mu)' }}>
                  {archRegPnId ? 'Registrata in prima nota' : archLinkedId ? 'Presente in archivio contabile' : null}
                </div>
              ) : null}
            </>
          )
        })()}
      </td>
      <td style={{ textAlign: 'right', padding: '.5rem .9rem', verticalAlign: 'middle' }}>
        <button
          type="button"
          className="btn-sec"
          style={{
            padding: '.18rem .48rem',
            fontSize: '.72rem',
            borderRadius: 999,
            background: 'rgba(30, 56, 88, 0.55)',
            borderColor: 'rgba(124, 157, 202, 0.35)',
          }}
          onClick={(e) => {
            e.stopPropagation()
            onSelectRow(row.id)
            onOpenPreview(row)
          }}
        >
          Anteprima
        </button>
      </td>
    </tr>
  )
}, areImportFattureTableRowPropsEqual)

const ImportFattureVirtualTable = memo(function ImportFattureVirtualTable({
  candidateWorkingView,
  queueFullView,
  filteredRows,
  codaVista,
  confermaPassoFilter,
  stepCandidateFilter,
  lavorazioneCheckFilter,
  preparazioneFilter,
  checkedRowIdSet,
  checkedRowIdsLength,
  allVisibleRowsChecked,
  onToggleSelectAllVisible,
  rowViewModelById,
  rowEvalById,
  panelRowId,
  readinessOpts,
  pianoConti,
  pianoContiByCodice,
  causaliIva = [],
  causaliContabili,
  causaliContabiliById,
  historicalContoTopByImportId,
  historicalCausaleContabileIdByImportId,
  historicalIvaTopByImportId,
  tableInlineContoOptions,
  tableInlineCausaleContabileOptions,
  tableInlineCausaleIvaOptions,
  inlineEditRowId,
  inlineEditField,
  tableInlineQuery,
  tableInlineSaveId,
  tableInlineBusy,
  onSelectRow,
  onToggleRowChecked,
  onStartInlineEdit,
  onTableInlineQueryChange,
  onCloseInlineEdit,
  onPersistTableRowAccountingPatch,
  onOpenPreview,
  resetScrollKey,
  rowsTotal,
  tableVisibleColumns,
}) {
  const tableViewportRef = useRef(null)
  const [tableScrollTop, setTableScrollTop] = useState(0)
  const [tableViewportHeight, setTableViewportHeight] = useState(520)
  const tableScrollRafRef = useRef(0)
  const tableScrollPendingRef = useRef(0)
  const tableColumnCount = queueFullView ? 13 : 12
  const tableDiagEnabled = isImportFattureTableDiagEnabled()
  const tableDiagRenderCounterRef = useRef(0)
  const tableDiagLastRenderAtRef = useRef(0)
  const tableDiagViewportSignatureRef = useRef('')
  const tableDiagDepsSignatureRef = useRef('')
  const showCol = useCallback((key) => tableVisibleColumns?.[key] !== false, [tableVisibleColumns])

  const onTableViewportScroll = useCallback((e) => {
    const rawTop = Number(e.currentTarget?.scrollTop || 0)
    const nextTop = Math.round(rawTop / 8) * 8
    tableScrollPendingRef.current = nextTop
    if (tableScrollRafRef.current) return
    tableScrollRafRef.current = window.requestAnimationFrame(() => {
      tableScrollRafRef.current = 0
      setTableScrollTop((prev) => (prev === tableScrollPendingRef.current ? prev : tableScrollPendingRef.current))
    })
  }, [])

  useEffect(() => {
    return () => {
      if (tableScrollRafRef.current) {
        window.cancelAnimationFrame(tableScrollRafRef.current)
        tableScrollRafRef.current = 0
      }
    }
  }, [])

  useEffect(() => {
    const el = tableViewportRef.current
    if (!el) return
    const next = Number(el.clientHeight || 0)
    if (next > 0) setTableViewportHeight(next)
    const onResize = () => {
      const h = Number(el.clientHeight || 0)
      if (h > 0) setTableViewportHeight((prev) => (Math.abs(prev - h) > 2 ? h : prev))
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    setTableScrollTop(0)
    const el = tableViewportRef.current
    if (el && el.scrollTop !== 0) el.scrollTop = 0
  }, [resetScrollKey])

  const virtualRowsView = useMemo(() => {
    const total = filteredRows.length
    if (!total) return { visibleRows: [], topSpacerHeight: 0, bottomSpacerHeight: 0 }
    const rowHeight = IMPORT_FATTURE_TABLE_ROW_HEIGHT
    const overscan = IMPORT_FATTURE_TABLE_OVERSCAN
    const viewport = Math.max(tableViewportHeight, rowHeight)
    const start = Math.max(0, Math.floor(tableScrollTop / rowHeight) - overscan)
    const visibleCount = Math.ceil(viewport / rowHeight) + overscan * 2
    const end = Math.min(total, start + visibleCount)
    return {
      visibleRows: filteredRows.slice(start, end),
      topSpacerHeight: start * rowHeight,
      bottomSpacerHeight: Math.max(0, (total - end) * rowHeight),
    }
  }, [filteredRows, tableScrollTop, tableViewportHeight])

  const panelRowForViewport = useMemo(
    () => (panelRowId ? filteredRows.find((r) => r.id === panelRowId) || null : null),
    [filteredRows, panelRowId],
  )
  const visibleRowViewModelById = useMemo(() => {
    const out = new Map()
    const heavyRows = [...virtualRowsView.visibleRows]
    if (panelRowForViewport?.id && !heavyRows.some((r) => r.id === panelRowForViewport.id)) {
      heavyRows.push(panelRowForViewport)
    }
    if (!heavyRows.length) return out
    for (const row of heavyRows) {
      out.set(
        row.id,
        buildImportFattureTableRowViewModel(row, {
          queueFullView,
          rowEval: rowEvalById.get(row.id) || null,
          readinessOpts,
          pianoConti,
          pianoContiByCodice,
          causaliIva,
          causaliContabili,
          causaliContabiliById,
          historicalContoTopByImportId,
          historicalCausaleContabileIdByImportId,
          historicalIvaTopByImportId,
        }),
      )
    }
    return out
  }, [
    virtualRowsView.visibleRows,
    panelRowForViewport,
    queueFullView,
    rowEvalById,
    readinessOpts,
    pianoConti,
    pianoContiByCodice,
    causaliIva,
    causaliContabili,
    causaliContabiliById,
    historicalContoTopByImportId,
    historicalCausaleContabileIdByImportId,
    historicalIvaTopByImportId,
  ])

  useEffect(() => {
    if (!tableDiagEnabled) return
    tableDiagRenderCounterRef.current += 1
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
    const delta = tableDiagLastRenderAtRef.current ? Math.round(now - tableDiagLastRenderAtRef.current) : null
    tableDiagLastRenderAtRef.current = now
    const tick = tableDiagRenderCounterRef.current
    if (tick <= 5 || tick % 20 === 0) {
      console.info('[import_table_diag] render_tick', {
        tick,
        delta_ms: delta,
        rows_total: rowsTotal,
        rows_filtered: filteredRows.length,
        rows_visible: virtualRowsView.visibleRows.length,
        viewport_h: tableViewportHeight,
        scroll_top: Math.round(tableScrollTop),
        checked_rows: checkedRowIdsLength,
        panel_row_id: panelRowId || null,
        inline_edit_row_id: inlineEditRowId || null,
        inline_edit_field: inlineEditField || null,
        queue_full_view: queueFullView,
        table_inline_busy: tableInlineBusy,
      })
    }
  }, [tableDiagEnabled, rowsTotal, filteredRows.length, virtualRowsView.visibleRows.length, tableViewportHeight, tableScrollTop, checkedRowIdsLength, panelRowId, inlineEditRowId, inlineEditField, queueFullView, tableInlineBusy])

  useEffect(() => {
    if (!tableDiagEnabled) return
    const firstVisibleId = virtualRowsView.visibleRows[0]?.id || null
    const lastVisibleId = virtualRowsView.visibleRows[virtualRowsView.visibleRows.length - 1]?.id || null
    const viewportSig = [
      firstVisibleId || '',
      lastVisibleId || '',
      virtualRowsView.visibleRows.length,
      Math.round(tableScrollTop),
      virtualRowsView.topSpacerHeight,
      virtualRowsView.bottomSpacerHeight,
    ].join('|')
    if (viewportSig === tableDiagViewportSignatureRef.current) return
    tableDiagViewportSignatureRef.current = viewportSig
    console.info('[import_table_diag] viewport_window', {
      rows_filtered: filteredRows.length,
      rows_visible: virtualRowsView.visibleRows.length,
      first_visible_id: firstVisibleId,
      last_visible_id: lastVisibleId,
      top_spacer_h: virtualRowsView.topSpacerHeight,
      bottom_spacer_h: virtualRowsView.bottomSpacerHeight,
      viewport_h: tableViewportHeight,
      scroll_top: Math.round(tableScrollTop),
    })
  }, [tableDiagEnabled, filteredRows.length, tableScrollTop, tableViewportHeight, virtualRowsView.visibleRows, virtualRowsView.topSpacerHeight, virtualRowsView.bottomSpacerHeight])

  useEffect(() => {
    if (!tableDiagEnabled) return
    const depsSig = [
      rowEvalById?.size || 0,
      pianoConti.length,
      causaliIva.length,
      causaliContabili.length,
      Object.keys(historicalContoTopByImportId || {}).length,
      Object.keys(historicalCausaleContabileIdByImportId || {}).length,
      Object.keys(historicalIvaTopByImportId || {}).length,
    ].join('|')
    if (depsSig === tableDiagDepsSignatureRef.current) return
    tableDiagDepsSignatureRef.current = depsSig
    console.info('[import_table_diag] dependency_change', {
      row_eval_size: rowEvalById?.size || 0,
      piano_conti: pianoConti.length,
      causali_iva: causaliIva.length,
      causali_contabili: causaliContabili.length,
      historical_conto_by_import: Object.keys(historicalContoTopByImportId || {}).length,
      historical_causale_contabile_by_import: Object.keys(historicalCausaleContabileIdByImportId || {}).length,
      historical_iva_by_import: Object.keys(historicalIvaTopByImportId || {}).length,
    })
  }, [tableDiagEnabled, rowEvalById, pianoConti, causaliIva, causaliContabili, historicalContoTopByImportId, historicalCausaleContabileIdByImportId, historicalIvaTopByImportId])

  if (candidateWorkingView && queueFullView) return null

  return (
    <div
      ref={tableViewportRef}
      onScroll={onTableViewportScroll}
      style={{ maxHeight: '62vh', minHeight: 280, overflowY: 'auto', overflowX: 'auto' }}
    >
      <table
        className="table"
        style={{
          width: '100%',
          fontSize: '.75rem',
          lineHeight: 1.34,
          borderCollapse: 'separate',
          borderSpacing: 0,
        }}
      >
        <thead>
          <tr>
            <th style={{ width: 40, padding: '.5rem .48rem', textAlign: 'center', verticalAlign: 'middle', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)' }}>
              <input
                type="checkbox"
                checked={allVisibleRowsChecked}
                onChange={onToggleSelectAllVisible}
                title="Seleziona / deseleziona tutte le righe nella vista corrente"
                aria-label="Seleziona tutte le fatture nella vista corrente"
                style={{
                  width: 14,
                  height: 14,
                  appearance: 'none',
                  WebkitAppearance: 'none',
                  borderRadius: 4,
                  cursor: 'pointer',
                  background: allVisibleRowsChecked ? 'linear-gradient(180deg, rgba(246,196,60,.95), rgba(230,170,25,.95))' : 'rgba(11, 30, 52, 0.9)',
                  border: allVisibleRowsChecked ? '1px solid rgba(246,196,60,.95)' : '1px solid rgba(107, 139, 176, 0.72)',
                  boxShadow: allVisibleRowsChecked ? 'inset 0 0 0 2px rgba(8,24,45,.55)' : 'inset 0 0 0 1px rgba(255,255,255,.04)',
                }}
              />
            </th>
            <th style={{ minWidth: 188, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('soggetto') ? null : { display: 'none' }) }}>Fornitore / Cliente</th>
            <th style={{ minWidth: 152, width: 162, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('numero') ? null : { display: 'none' }) }}>N. documento</th>
            <th style={{ minWidth: 118, width: 132, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('data') ? null : { display: 'none' }) }}>Data</th>
            <th style={{ minWidth: 104, width: 118, padding: '.5rem .9rem', textAlign: 'right', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('imponibile') ? null : { display: 'none' }) }}>Imponibile</th>
            <th style={{ minWidth: 88, width: 96, padding: '.5rem .9rem', textAlign: 'right', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('iva') ? null : { display: 'none' }) }}>IVA</th>
            <th style={{ minWidth: 104, width: 118, padding: '.5rem .9rem', textAlign: 'right', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('totale') ? null : { display: 'none' }) }}>Totale</th>
            <th style={{ minWidth: 200, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('conto') ? null : { display: 'none' }) }}>Conto proposto</th>
            <th style={{ minWidth: 178, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('causale_contabile') ? null : { display: 'none' }) }}>Causale contabile</th>
            <th style={{ minWidth: 178, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('causale_iva') ? null : { display: 'none' }) }}>Causale IVA</th>
            {queueFullView ? <th style={{ width: 118, minWidth: 108, padding: '.5rem .9rem', fontSize: '.75rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('controlli') ? null : { display: 'none' }) }}>Controlli</th> : null}
            <th style={{ minWidth: 124, width: 132, padding: '.5rem .9rem', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)', ...(showCol('stato') ? null : { display: 'none' }) }}>Stato</th>
            <th style={{ minWidth: 118, width: 128, padding: '.5rem .9rem', textAlign: 'right', background: 'rgba(33, 58, 86, 0.78)', color: 'rgba(211,225,240,.96)' }}>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {filteredRows.length === 0 ? (
            <tr>
              <td colSpan={tableColumnCount} style={{ padding: '1rem 1.1rem', color: 'var(--mu)', textAlign: 'center' }}>
                {codaVista === 'tutte'
                  ? 'Nessuna fattura in elenco.'
                  : confermaPassoFilter === 'confermate'
                    ? 'Nessuna fattura risulta confermata valida per il passo finale con i filtri attuali (prova «Tutte» o allenta altri filtri).'
                    : confermaPassoFilter === 'non_confermate'
                      ? 'Nessuna fattura risulta «non confermata» con i filtri attuali (prova «Tutte» negli altri filtri).'
                      : stepCandidateFilter === 'candidate'
                        ? 'Nessuna fattura risulta candidata al passo successivo con i filtri attuali (prova «Tutte» negli altri filtri o completa preparazione/controlli).'
                        : stepCandidateFilter === 'non_candidate'
                          ? 'Nessuna fattura «non candidata» in questo elenco (prova «Tutte» o allenta Preparazione / Controlli).'
                          : lavorazioneCheckFilter === 'ok'
                            ? 'Nessuna fattura risulta «OK» ai controlli con i filtri attuali (prova «Tutte» o «Con problemi», oppure allenta il filtro Preparazione).'
                            : lavorazioneCheckFilter === 'con_problemi'
                              ? 'Nessuna fattura con problemi ai controlli nell’elenco filtrato (prova «Tutte» o cambia il filtro Preparazione).'
                              : preparazioneFilter === 'ben_preparate'
                                ? 'Nessuna fattura corrisponde a “ben preparate” con il filtro attuale (conto, causale IVA e imponibile/IVA completi).'
                                : preparazioneFilter === 'parziali'
                                  ? 'Nessuna fattura risulta ancora parziale tra le pronte caricate, oppure non ci sono pronte in coda.'
                                  : 'Nessuna fattura con controlli contabili/IVA OK in questa vista (completa conto, causale e importi, oppure torna a «Tutte»).'}
              </td>
            </tr>
          ) : null}
          {filteredRows.length > 0 && virtualRowsView.topSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={tableColumnCount} style={{ height: virtualRowsView.topSpacerHeight, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {virtualRowsView.visibleRows.map((r) => (
            <ImportFattureTableRow
              key={r.id}
              row={r}
              viewModel={visibleRowViewModelById.get(r.id) || rowViewModelById.get(r.id) || null}
              rowEval={rowEvalById.get(r.id) || null}
              isChecked={checkedRowIdSet.has(r.id)}
              isPanel={r.id === panelRowId}
              queueFullView={queueFullView}
              readinessOpts={readinessOpts}
              pianoConti={pianoConti}
              pianoContiByCodice={pianoContiByCodice}
              causaliContabili={causaliContabili}
              causaliContabiliById={causaliContabiliById}
              historicalContoTopByImportId={historicalContoTopByImportId}
              historicalCausaleContabileIdByImportId={historicalCausaleContabileIdByImportId}
              historicalIvaTopByImportId={historicalIvaTopByImportId}
              tableInlineContoOptions={tableInlineContoOptions}
              tableInlineCausaleContabileOptions={tableInlineCausaleContabileOptions}
              tableInlineCausaleIvaOptions={tableInlineCausaleIvaOptions}
              tableInlineEditRowId={inlineEditRowId}
              tableInlineEditField={inlineEditField}
              tableInlineQuery={tableInlineQuery}
              tableInlineSaveId={tableInlineSaveId}
              tableInlineBusy={tableInlineBusy}
              onSelectRow={onSelectRow}
              onToggleRowChecked={onToggleRowChecked}
              onStartInlineEdit={onStartInlineEdit}
              onTableInlineQueryChange={onTableInlineQueryChange}
              onCloseInlineEdit={onCloseInlineEdit}
              onPersistTableRowAccountingPatch={onPersistTableRowAccountingPatch}
              onOpenPreview={onOpenPreview}
              tableVisibleColumns={tableVisibleColumns}
            />
          ))}
          {filteredRows.length > 0 && virtualRowsView.bottomSpacerHeight > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={tableColumnCount} style={{ height: virtualRowsView.bottomSpacerHeight, padding: 0, border: 0 }} />
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
})

/**
 * Controlli strutturali: stessa funzione usata dal bridge archivio (`validateImportFattureStructuralForArchivio`).
 */
function buildWorkingViewAccountingBlocks({
  panelRow,
  pnGridRows,
  ivaGridRows,
  opDraft,
  pianoConti,
  causaliIva = [],
}) {
  if (!panelRow) return []
  return evaluateImportFattureStructuralAccountingBlocks({
    doc: panelRow,
    pnGridRows,
    ivaGridRows,
    opDraft,
    pianoConti,
    causaliIva,
  })
}

function shouldShowInternalTelemetryDashboard() {
  if (typeof window === 'undefined') return false
  try {
    const qs = new URLSearchParams(window.location.search)
    if (qs.get('internalDashboard') === '1') return true
    return window.localStorage?.getItem('FISCOSIM_INTERNAL_DASHBOARD') === '1'
  } catch {
    return false
  }
}

/** Avvisi non strutturali (diagnosi preparazione) — separati dai blocchi contabili. */
function buildWorkingViewMissingItems({ panelRow, readinessOpts }) {
  if (!panelRow) return []
  const diag = evaluateProntaLavorazioneDiagnosi(panelRow, readinessOpts || {})
  const tabFromIssue = (issue = '') => {
    const t = String(issue || '').toLowerCase()
    if (t.includes('causale iva') || t.includes('imponibile') || t.includes('iva ')) return 'iva'
    if (t.includes('conto') || t.includes('griglia prima nota') || t.includes('dare/avere')) return 'prima_nota'
    return 'partitario'
  }
  const items = []
  for (const issue of diag?.issues || []) {
    items.push({ tab: tabFromIssue(issue), message: issue })
  }
  const uniq = []
  const seen = new Set()
  for (const item of items) {
    const key = `${item.tab}:${String(item.message || '').trim().toLowerCase()}`
    if (!key || seen.has(key)) continue
    seen.add(key)
    uniq.push(item)
  }
  return uniq
}

function extractCounterpartyIdentityForDefaults(doc) {
  const raw = parseAiRaw(doc)
  const tipo = String(doc?.tipo_documento || raw?.tipo_documento || '').toLowerCase()
  const isPassiva = tipo.includes('passiva')
  const piva = normPivaCf(isPassiva ? (raw?.cedente_piva || doc?.soggetto_piva) : (raw?.cessionario_piva || doc?.soggetto_piva))
  const cf = normPivaCf(isPassiva ? (raw?.cedente_cf || doc?.soggetto_cf) : (raw?.cessionario_cf || doc?.soggetto_cf))
  const nome = String(
    (isPassiva ? raw?.cedente_denom : raw?.cessionario_denom) ||
    doc?.soggetto_denominazione ||
    '',
  ).trim().toLowerCase()
  return { isPassiva, piva, cf, nome }
}

function resolveCounterpartyMasterContoForDefault(doc, pianoConti = []) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const idt = extractCounterpartyIdentityForDefaults(doc)
  const sideCandidates = list.filter((c) => (idt.isPassiva ? c?.is_fornitore : c?.is_cliente) && Number(c?.livello || 0) >= 3)
  const pivaMatches = idt.piva
    ? sideCandidates.filter((c) => normPivaCf(c?.partita_iva) === idt.piva || normPivaCf(c?.anagrafica_piva) === idt.piva)
    : []
  if (pivaMatches.length === 1) return { status: 'ok', conto: pivaMatches[0], reason: 'piva' }
  if (pivaMatches.length > 1) return { status: 'ambiguous', conto: null, reason: 'piva_multi' }
  const cfMatches = idt.cf
    ? sideCandidates.filter((c) => normPivaCf(c?.codice_fiscale) === idt.cf || normPivaCf(c?.anagrafica_cf) === idt.cf)
    : []
  if (cfMatches.length === 1) return { status: 'ok', conto: cfMatches[0], reason: 'cf' }
  if (cfMatches.length > 1) return { status: 'ambiguous', conto: null, reason: 'cf_multi' }
  const nomeMatches = idt.nome
    ? sideCandidates.filter((c) => String(c?.descrizione || c?.nome || '').trim().toLowerCase() === idt.nome)
    : []
  if (nomeMatches.length === 1) return { status: 'ok', conto: nomeMatches[0], reason: 'nome' }
  if (nomeMatches.length > 1) return { status: 'ambiguous', conto: null, reason: 'nome_multi' }
  return { status: 'none', conto: null, reason: 'not_found' }
}

function resolveImportFattureMasterCausaleIvaId({ doc, pianoConti = [], contoCodice = '' } = {}) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const selectedConto = contoCodice
    ? list.find((c) => String(c?.codice || '').trim() === String(contoCodice || '').trim() && Number(c?.livello || 0) >= 3)
    : null
  const selectedCausale = String(selectedConto?.causale_iva_id || '').trim()
  if (selectedCausale) return selectedCausale
  const cpResolved = resolveCounterpartyMasterContoForDefault(doc, list)
  const cpCausale = String(cpResolved?.conto?.causale_iva_id || '').trim()
  return cpCausale || ''
}

function isMainEconomicContoCandidate(conto) {
  if (!conto) return false
  if (conto.is_iva || conto.is_fornitore || conto.is_cliente) return false
  const txt = String(`${conto.codice || ''} ${conto.descrizione || conto.nome || ''}`).toLowerCase()
  if (/(debiti|crediti|fornitor|client|iva)/i.test(txt)) return false
  return Number(conto.livello || 0) >= 3
}

function resolvePrimaryEconomicContoFromPnGrid(pnGridRows = [], pianoConti = []) {
  const list = Array.isArray(pnGridRows) ? pnGridRows : []
  const meaningful = list
    .map((row, idx) => ({ row, idx }))
    .filter(({ row }) => String(row?.dare ?? '').trim() || String(row?.avere ?? '').trim())
  const matches = meaningful
    .map(({ row, idx }) => ({ conto: findPianoContoByCellValue(row?.conto, pianoConti), idx }))
    .filter(({ conto }) => !!conto && isMainEconomicContoCandidate(conto))
  if (!matches.length) return { status: 'none', conto: null, reason: 'no_economic_row' }
  const uniq = []
  const seen = new Set()
  for (const m of matches) {
    const key = String(m.conto?.id || m.conto?.codice || '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    uniq.push(m)
  }
  if (uniq.length === 1) return { status: 'ok', conto: uniq[0].conto, rowIndex: uniq[0].idx, reason: 'single' }
  return { status: 'ambiguous', conto: null, reason: 'multi_economic_rows' }
}

function serializePnGridForBlob(rows) {
  return (rows || []).map((row) => ({
    conto: String(row?.conto ?? '').trim(),
    dare: String(row?.dare ?? '').trim(),
    avere: String(row?.avere ?? '').trim(),
    nota: String(row?.nota ?? '').trim(),
  }))
}

function serializeIvaGridForBlob(rows) {
  return (rows || []).map((row) => ({
    causale_iva_id: String(row?.causale_iva_id ?? '').trim(),
    imponibile: String(row?.imponibile ?? '').trim(),
    iva: String(row?.iva ?? '').trim(),
  }))
}

function cleanedAccountingProposalsBag(next) {
  const cleaned = {}
  for (const k of Object.keys(next)) {
    if (k === WORKING_PN_GRID_KEY) {
      const g = next[k]
      if (Array.isArray(g) && g.length) cleaned[k] = g
      continue
    }
    if (next[k] != null && String(next[k]).trim() !== '') cleaned[k] = next[k]
  }
  return cleaned
}

function cleanedIvaOverridesBag(next) {
  const cleaned = {}
  for (const k of Object.keys(next)) {
    if (k === WORKING_IVA_GRID_KEY) {
      const g = next[k]
      if (Array.isArray(g) && g.length) cleaned[k] = g
      continue
    }
    if (next[k] != null && String(next[k]).trim() !== '') cleaned[k] = next[k]
  }
  return cleaned
}

function mergeInlineAccountingPatchIntoAiRaw(base, patch) {
  const META = importRepo.FISCOSIM_IMPORT_AI_META
  const out = { ...(typeof base === 'object' && base && !Array.isArray(base) ? base : {}) }
  const prev =
    out[META.ACCOUNTING_PROPOSALS] && typeof out[META.ACCOUNTING_PROPOSALS] === 'object'
      ? { ...out[META.ACCOUNTING_PROPOSALS] }
      : {}
  const next = { ...prev }
  const trim = (s) => String(s ?? '').trim()
  if ('conto_codice' in patch) {
    if (trim(patch.conto_codice) === '') delete next.conto_codice
    else next.conto_codice = trim(patch.conto_codice)
  }
  if ('causale_iva_id' in patch) {
    if (trim(patch.causale_iva_id) === '') delete next.causale_iva_id
    else next.causale_iva_id = trim(patch.causale_iva_id)
  }
  if ('causale_id' in patch) {
    if (trim(patch.causale_id) === '') delete next.causale_id
    else next.causale_id = trim(patch.causale_id)
  }
  const cleaned = cleanedAccountingProposalsBag(next)
  if (Object.keys(cleaned).length === 0) {
    delete out[META.ACCOUNTING_PROPOSALS]
    delete out[META.ACCOUNTING_PROPOSALS_AT]
  } else {
    out[META.ACCOUNTING_PROPOSALS] = cleaned
    out[META.ACCOUNTING_PROPOSALS_AT] = new Date().toISOString()
  }
  return out
}

/**
 * Stessa unione di `salvaDatiContabiliProposti` + `salvaDatiIvaProposti` in un solo blob AI:
 * `causale_iva_id` in proposte contabili segue la prima riga griglia IVA, poi la bozza contabile.
 */
function mergeAiRawWithWorkingViewGrids(base, live) {
  if (!live || live.docId == null) {
    return typeof base === 'object' && base && !Array.isArray(base) ? { ...base } : {}
  }
  const META = importRepo.FISCOSIM_IMPORT_AI_META
  const trim = (s) => String(s ?? '').trim()
  const pnGridRows = Array.isArray(live.pnGridRows) ? live.pnGridRows : []
  const ivaGridRows = Array.isArray(live.ivaGridRows) ? live.ivaGridRows : []
  const contDraft = live.contDraft || {}
  const ivaDraft = live.ivaDraft || {}
  const r0 = ivaGridRows[0] || {}
  const mergedDraft = {
    ...ivaDraft,
    imponibile: trim(r0.imponibile) !== '' ? trim(r0.imponibile) : trim(ivaDraft.imponibile),
    iva: trim(r0.iva) !== '' ? trim(r0.iva) : trim(ivaDraft.iva),
  }
  const out = { ...(typeof base === 'object' && base && !Array.isArray(base) ? base : {}) }

  const prevIva =
    out[META.IVA_OVERRIDES] && typeof out[META.IVA_OVERRIDES] === 'object' ? { ...out[META.IVA_OVERRIDES] } : {}
  const nextIva = { ...prevIva }
  if (trim(mergedDraft.imponibile) === '') delete nextIva.imponibile
  else nextIva.imponibile = trim(mergedDraft.imponibile)
  if (trim(mergedDraft.iva) === '') delete nextIva.iva
  else nextIva.iva = trim(mergedDraft.iva)
  if (trim(ivaDraft.detraibilita_iva) === '') delete nextIva.detraibilita_iva
  else nextIva.detraibilita_iva = trim(ivaDraft.detraibilita_iva)
  const gridBlobIva = serializeIvaGridForBlob(ivaGridRows).filter((row) => row.causale_iva_id || row.imponibile || row.iva)
  if (gridBlobIva.length) nextIva[WORKING_IVA_GRID_KEY] = gridBlobIva
  else delete nextIva[WORKING_IVA_GRID_KEY]
  const cleanedIva = cleanedIvaOverridesBag(nextIva)
  if (Object.keys(cleanedIva).length === 0) {
    delete out[META.IVA_OVERRIDES]
    delete out[META.IVA_OVERRIDES_AT]
  } else {
    out[META.IVA_OVERRIDES] = cleanedIva
    out[META.IVA_OVERRIDES_AT] = new Date().toISOString()
  }

  const prevAcc =
    out[META.ACCOUNTING_PROPOSALS] && typeof out[META.ACCOUNTING_PROPOSALS] === 'object'
      ? { ...out[META.ACCOUNTING_PROPOSALS] }
      : {}
  const nextAcc = { ...prevAcc }
  const ccFromGrid = pnGridRows[0]?.conto != null ? leadingContoCodiceFromCell(pnGridRows[0].conto) : ''
  const contoCodiceToSave = trim(contDraft.conto_codice) || trim(ccFromGrid)
  if (contoCodiceToSave === '') delete nextAcc.conto_codice
  else nextAcc.conto_codice = contoCodiceToSave
  const causIvaUnified = trim(ivaGridRows[0]?.causale_iva_id) || trim(contDraft.causale_iva_id)
  if (causIvaUnified === '') delete nextAcc.causale_iva_id
  else nextAcc.causale_iva_id = causIvaUnified
  if (trim(contDraft.causale_contabile_id) === '') delete nextAcc.causale_id
  else nextAcc.causale_id = trim(contDraft.causale_contabile_id)
  const gridBlobPn = serializePnGridForBlob(pnGridRows).filter((row) => row.conto || row.dare || row.avere || row.nota)
  if (gridBlobPn.length) nextAcc[WORKING_PN_GRID_KEY] = gridBlobPn
  else delete nextAcc[WORKING_PN_GRID_KEY]
  const cleanedAcc = cleanedAccountingProposalsBag(nextAcc)
  if (Object.keys(cleanedAcc).length === 0) {
    delete out[META.ACCOUNTING_PROPOSALS]
    delete out[META.ACCOUNTING_PROPOSALS_AT]
  } else {
    out[META.ACCOUNTING_PROPOSALS] = cleanedAcc
    out[META.ACCOUNTING_PROPOSALS_AT] = new Date().toISOString()
  }

  return out
}

function resolveDocForImportReadiness(doc, opts = {}) {
  const live = opts.liveWorkingGrids
  if (!doc || !live || String(live.docId) !== String(doc.id)) return doc
  const merged = mergeAiRawWithWorkingViewGrids(parseAiRaw(doc), live)
  return { ...doc, ai_raw_response: merged }
}

function normSearchToken(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function contoHaystack(conto) {
  return normSearchToken([conto?.codice, conto?.descrizione, conto?.nome].filter(Boolean).join(' '))
}

/** Filtro client sul piano conti: token multipli (es. «telef» + «spese») su codice/descrizione. */
function filterPianoContiForInlineSearch(pianoConti, query, { max = 32, includeIva = false } = {}) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const raw = String(query || '').trim()
  const tokens = raw ? normSearchToken(raw).split(/\s+/).filter(Boolean) : []
  const usable = list.filter((c) => c && (includeIva || !c.is_iva) && Number(c.livello || 0) >= 3)
  if (!tokens.length) return []
  const ranked = usable
    .map((c) => {
      const h = contoHaystack(c)
      if (!tokens.every((t) => h.includes(t))) return null
      let score = tokens.length
      const desc = normSearchToken(c.descrizione || c.nome || '')
      for (const t of tokens) {
        if (desc.includes(t)) score += 3
      }
      return { c, score }
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || String(a.c.codice || '').localeCompare(String(b.c.codice || ''), 'it'))
  return ranked.slice(0, max).map((x) => x.c)
}

/** Filtro client su causali contabili (sigla + descrizione). */
function filterCausaliContabiliForInlineSearch(causaliContabili, query, { max = 36 } = {}) {
  const list = Array.isArray(causaliContabili) ? causaliContabili : []
  const raw = String(query || '').trim()
  const tokens = raw ? normSearchToken(raw).split(/\s+/).filter(Boolean) : []
  if (!tokens.length) {
    return [...list]
      .filter(Boolean)
      .sort((a, b) => String(a.codice || '').localeCompare(String(b.codice || ''), 'it'))
      .slice(0, max)
  }
  return list
    .filter((c) => {
      if (!c) return false
      const h = normSearchToken([c.codice, c.descrizione].filter(Boolean).join(' '))
      return tokens.every((t) => h.includes(t))
    })
    .sort((a, b) => String(a.codice || '').localeCompare(String(b.codice || ''), 'it'))
    .slice(0, max)
}

function filterCausaliIvaForInlineSearch(causaliIva, query, { max = 36 } = {}) {
  const list = Array.isArray(causaliIva) ? causaliIva : []
  const raw = String(query || '').trim()
  const tokens = raw ? normSearchToken(raw).split(/\s+/).filter(Boolean) : []
  if (!tokens.length) {
    return [...list]
      .filter(Boolean)
      .sort((a, b) => String(a.codice || '').localeCompare(String(b.codice || ''), 'it'))
      .slice(0, max)
  }
  return list
    .filter((c) => {
      if (!c) return false
      const h = normSearchToken([c.codice, c.descrizione, c.alias].filter(Boolean).join(' '))
      return tokens.every((t) => h.includes(t))
    })
    .sort((a, b) => String(a.codice || '').localeCompare(String(b.codice || ''), 'it'))
    .slice(0, max)
}

const CAUSALI_CONTABILI_ATTIVA = new Set(['FC', 'FCPA', 'FCPC'])
const CAUSALI_CONTABILI_PASSIVA = new Set(['FF', 'RP', 'A17X', 'FF5', 'FFPC', 'RPPC'])

function getImportFattureTipoBucket(doc) {
  const raw = parseAiRaw(doc)
  const tipo = String(doc?.tipo_documento || raw?.tipo_documento || '').toLowerCase()
  if (tipo.includes('attiva')) return 'attiva'
  if (
    tipo.includes('passiva') ||
    tipo.includes('parcella') ||
    tipo.includes('nota') ||
    tipo.includes('td04') ||
    tipo.includes('td02')
  ) {
    return 'passiva'
  }
  return 'other'
}

function filterCausaliContabiliByTipoDocumento(causaliContabili = [], doc = null) {
  const list = Array.isArray(causaliContabili) ? causaliContabili : []
  const bucket = getImportFattureTipoBucket(doc)
  if (bucket === 'attiva') {
    return list.filter((c) => CAUSALI_CONTABILI_ATTIVA.has(String(c?.codice || '').trim().toUpperCase()))
  }
  if (bucket === 'passiva') {
    return list.filter((c) => CAUSALI_CONTABILI_PASSIVA.has(String(c?.codice || '').trim().toUpperCase()))
  }
  return list
}

const PARTITARIO_SENSITIVE_CAUSALI = new Set(['RP', 'RPPC', 'FC', 'FCPA', 'FCPC'])

function isPartitarioSensitiveCausale(causale) {
  const code = String(causale?.codice || '').trim().toUpperCase()
  return PARTITARIO_SENSITIVE_CAUSALI.has(code)
}

function parseSortableDate(value) {
  const iso = toIsoDateForInput(value)
  if (!iso) return Number.NEGATIVE_INFINITY
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : Number.NEGATIVE_INFINITY
}

function parseSortableAmountFromDoc(row) {
  const display = String(effectiveTotaleDisplay(row) || '').trim()
  const n = parseLooseTotaleInput(display)
  if (Number.isFinite(n)) return n
  return Number.NEGATIVE_INFINITY
}

function escapeCsvCell(value) {
  const raw = String(value ?? '')
  if (/[";,\n\r]/.test(raw)) return `"${raw.replace(/"/g, '""')}"`
  return raw
}

function downloadBlobAsFile(blob, filename) {
  if (typeof window === 'undefined') return
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.URL.revokeObjectURL(url)
}

/** Tracciamento fonte bozza conto (solo UI, non persistito). */
function bozzaFonteContoFromSuggestionItem(item) {
  if (!item?.codice) return 'manuale'
  if (item.source === 'history') return 'storico'
  if (item.source === 'ai') return 'ia'
  if (/anagrafic/i.test(String(item.sourceLabel || ''))) return 'anagrafica'
  return 'manuale'
}

function labelBozzaFonteConto(f) {
  if (f === 'storico') return 'storico'
  if (f === 'ia') return 'IA documento'
  if (f === 'anagrafica') return 'anagrafica'
  if (f === 'manuale') return 'manuale'
  return ''
}

function labelBozzaFonteCausale(f) {
  if (f === 'anagrafica') return 'anagrafica'
  if (f === 'storico') return 'storico'
  if (f === 'documento') return 'documento'
  if (f === 'default_percentuale') return 'default aliquota'
  if (f === 'regola') return 'regola'
  if (f === 'manuale') return 'manuale'
  return ''
}

/** Validazione leggera prima del merge su DB. */
function validateIvaDraftForSave(d) {
  const trim = (x) => String(x ?? '').trim()
  const ti = trim(d.imponibile)
  const tv = trim(d.iva)
  const td = trim(d.detraibilita_iva)
  if (!ti && !tv && !td) return { ok: true }
  if (ti) {
    const ni = parseLooseTotaleInput(ti)
    if (!Number.isFinite(ni) || ni < 0) return { ok: false, msg: 'Imponibile: inserisci un importo ≥ 0 o lascia vuoto.' }
  }
  if (tv) {
    const nv = parseLooseTotaleInput(tv)
    if (!Number.isFinite(nv) || nv < 0) return { ok: false, msg: 'IVA: inserisci un importo ≥ 0 o lascia vuoto.' }
  }
  if (td) {
    const nd = parseLooseTotaleInput(td.replace(/%/g, ''))
    if (!Number.isFinite(nd) || nd < 0 || nd > 100) {
      return { ok: false, msg: 'Detraibilità IVA: usa una percentuale tra 0 e 100.' }
    }
  }
  return { ok: true }
}

function pickNonEmptyFiscosimBag(obj) {
  const o = {}
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return o
  for (const k of Object.keys(obj)) {
    const v = obj[k]
    if (v != null && String(v).trim() !== '') o[k] = String(v).trim()
  }
  return o
}

/**
 * Applica su `base` (blob target) i soli campi presenti in `layers` (non vuoti).
 * Non rimuove chiavi esistenti sul target se assenti nella sorgente.
 */
function mergeFiscosimLayersOntoBase(base, layers) {
  const META = importRepo.FISCOSIM_IMPORT_AI_META
  const out = { ...base }
  let changed = false

  const apply = (metaKey, atKey, srcBag) => {
    if (!srcBag || typeof srcBag !== 'object' || !Object.keys(srcBag).length) return
    const tgtPrev =
      out[metaKey] && typeof out[metaKey] === 'object' && !Array.isArray(out[metaKey])
        ? { ...out[metaKey] }
        : {}
    let touched = false
    for (const k of Object.keys(srcBag)) {
      const v = srcBag[k]
      if (v == null || String(v).trim() === '') continue
      const nv = String(v).trim()
      if (tgtPrev[k] !== nv) {
        tgtPrev[k] = nv
        touched = true
      }
    }
    if (touched) {
      out[metaKey] = tgtPrev
      out[atKey] = new Date().toISOString()
      changed = true
    }
  }

  apply(META.OPERATIVE_OVERRIDES, META.OPERATIVE_OVERRIDES_AT, layers.op)
  apply(META.ACCOUNTING_PROPOSALS, META.ACCOUNTING_PROPOSALS_AT, layers.acc)
  apply(META.IVA_OVERRIDES, META.IVA_OVERRIDES_AT, layers.iva)

  return { out, changed }
}

/**
 * Definizione minima “ben preparata”: conto + causale IVA salvati e coppia imponibile/IVA
 * (override _fiscosimIvaOverrides o baseline da prima riga riepilogo AI via effectiveIvaTripleStrings).
 */
function isBenPreparata(doc, opts = {}) {
  const d = resolveDocForImportReadiness(doc, opts)
  const ap = getAccountingProposalsObj(d)
  const histTop =
    opts.historicalContoTopByImportId && d?.id != null
      ? String(opts.historicalContoTopByImportId[d.id] || '').trim()
      : ''
  const contoCod = pickImportFatturaStagingContoCodice(d, opts.pianoConti || [], histTop)
  if (!String(contoCod ?? '').trim()) return false
  if (!String(ap.causale_iva_id ?? '').trim()) return false
  const eff = effectiveIvaTripleStrings(d)
  const im = String(eff.imponibile ?? '').trim()
  const iv = String(eff.iva ?? '').trim()
  if (!im || !iv) return false
  const nim = parseLooseTotaleInput(im)
  const niv = parseLooseTotaleInput(iv)
  if (!(Number.isFinite(nim) && Number.isFinite(niv) && nim >= 0 && niv >= 0)) return false
  if (opts?.requireValidPnGridConti) {
    return pnGridHasAllRowsWithValidConto(d, opts)
  }
  return true
}

/**
 * Diagnosi sola lettura per righe pronte (nessun effetto su DB / _fiscosim*).
 * Livelli: ok | attenzione | incompleta (mancano basi contabili minime vs solo importi IVA).
 */
function evaluateProntaLavorazioneDiagnosi(doc, opts = {}, precomputed = {}) {
  const d = resolveDocForImportReadiness(doc, opts)
  const ap = getAccountingProposalsObj(d)
  const histTop =
    opts.historicalContoTopByImportId && d?.id != null
      ? String(opts.historicalContoTopByImportId[d.id] || '').trim()
      : ''
  const contoCodEff = pickImportFatturaStagingContoCodice(d, opts.pianoConti || [], histTop)
  const contoOk = !!String(contoCodEff ?? '').trim()
  const causOk = !!String(ap.causale_iva_id ?? '').trim()
  const eff = effectiveIvaTripleStrings(d)
  const im = String(eff.imponibile ?? '').trim()
  const iv = String(eff.iva ?? '').trim()
  const issues = []
  if (!contoOk) {
    issues.push(
      'Conto proposto mancante: nessun conto derivabile da anagrafica piano, storico o AI e nessun valore salvato nelle proposte contabili.',
    )
  }
  if (!causOk) issues.push('Causale IVA mancante (nessun valore salvato nelle proposte contabili).')
  if (!im) {
    issues.push('Imponibile assente: serve un valore da override IVA o dalla prima riga di riepilogo estratta.')
  } else {
    const nim = parseLooseTotaleInput(im)
    if (!Number.isFinite(nim) || nim < 0) issues.push('Imponibile non numerico o negativo nel valore efficace.')
  }
  if (!iv) {
    issues.push('IVA assente: serve un valore da override IVA o dalla prima riga di riepilogo estratta.')
  } else {
    const niv = parseLooseTotaleInput(iv)
    if (!Number.isFinite(niv) || niv < 0) issues.push('IVA non numerica o negativa nel valore efficace.')
  }
  if (opts?.requireValidPnGridConti && !pnGridHasAllRowsWithValidConto(d, opts)) {
    issues.push('Griglia Prima Nota incompleta: ogni riga con importo deve avere un conto valido del piano dei conti.')
  }
  const benPreparata = typeof precomputed?.benPreparata === 'boolean' ? precomputed.benPreparata : isBenPreparata(d, opts)
  if (!benPreparata && !issues.length) {
    issues.push('Preparazione ancora parziale: il criterio minimo non risulta soddisfatto.')
  }
  let level = 'ok'
  if (issues.length) {
    if (!contoOk || !causOk) level = 'incompleta'
    else level = 'attenzione'
  }
  const labelShort = level === 'ok' ? 'OK' : level === 'attenzione' ? 'Attenzione' : 'Incompleta'
  return { level, issues, labelShort }
}

function diagnosiLevelStyle(level) {
  if (level === 'ok') return { bg: 'rgba(46, 125, 50, 0.16)', border: '1px solid rgba(46, 125, 50, 0.45)', color: '#1b5e20' }
  if (level === 'attenzione')
    return { bg: 'rgba(245, 124, 0, 0.14)', border: '1px solid rgba(245, 124, 0, 0.45)', color: '#e65100' }
  return { bg: 'rgba(198, 40, 40, 0.1)', border: '1px solid rgba(198, 40, 40, 0.38)', color: '#b71c1c' }
}

/**
 * Mini-coda verso il futuro «Da Validare NEW» (solo UI, nessun DB):
 * pronta per lavorazione + ben preparata + controlli minimi OK.
 */
function candidateForNextStep(doc, opts = {}) {
  if (!isProntaLavorazioneRow(doc)) return false
  const benPreparata = isBenPreparata(doc, opts)
  if (!benPreparata) return false
  return evaluateProntaLavorazioneDiagnosi(doc, opts, { benPreparata }).level === 'ok'
}

function getFinalStepConfirmationFlag(doc) {
  const r = parseAiRaw(doc)
  return r[importRepo.FISCOSIM_IMPORT_AI_META.FINAL_STEP_CONFIRMATION] === true
}

/** Conferma salvata e ancora coerente con candidatura attuale. */
function confermaPassoFinaleValida(doc, opts = {}) {
  return getFinalStepConfirmationFlag(doc) && candidateForNextStep(doc, opts)
}

/** Flag salvato ma la fattura non è più candidata — la conferma non è valida finché non si ripristina la preparazione. */
function confermaPassoFinaleStale(doc, opts = {}) {
  return getFinalStepConfirmationFlag(doc) && !candidateForNextStep(doc, opts)
}

/** Stessa logica leggera di Import Documenti: default causale da `riepilogo_iva` + lista causali (suggerimento, non salvato). */
/** Causale più frequente negli storici confermati (stessa controparte), per suggerimento in sola lettura. */
function pickDominantCausaleFromHistorical(historicalDocs, causaliList) {
  const list = Array.isArray(causaliList) ? causaliList : []
  const counts = new Map()
  for (const row of historicalDocs || []) {
    const cod = String(row?.causale_iva_codice || row?.causale_iva || '').trim()
    if (!cod) continue
    const c = list.find((x) => String(x.codice || '').trim() === cod)
    if (!c) continue
    const id = String(c.id)
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  let bestId = ''
  let bestN = 0
  for (const [id, n] of counts) {
    if (n > bestN) {
      bestN = n
      bestId = id
    }
  }
  if (!bestId) return null
  const causa = list.find((x) => String(x.id) === bestId)
  return { id: bestId, count: bestN, causa }
}

function computeImportCausaleIvaDefault(d, causaliList) {
  let causaleIvaDefault = ''
  if (causaliList?.length && d.riepilogo_iva?.length > 0) {
    const r0 = d.riepilogo_iva[0]
    const byRowId = r0?.causale_iva_id && causaliList.some((c) => String(c.id) === String(r0.causale_iva_id))
    if (byRowId) {
      causaleIvaDefault = String(r0.causale_iva_id)
    } else {
      const aliqNum = Math.round(parseFloat(String(r0?.aliquota || '0').replace(/[%\s]/g, '')))
      const nat = (r0?.natura || '').toLowerCase()
      const isRC = nat.includes('n6') || nat.includes('n7') || nat.includes('rev')
      const codFS = aliqNum > 0 ? (isRC ? `F${aliqNum}RC` : `F${aliqNum}`) : 'F0FC'
      const match =
        causaliList.find((c) => String(c.codice || '').trim() === codFS) ||
        causaliList.find((c) => !c.societa_id && String(c.codice || '').trim() === codFS) ||
        causaliList.find((c) => Math.round(Number(c.aliquota ?? 0)) === aliqNum)
      if (match) causaleIvaDefault = match.id
    }
  }
  return causaleIvaDefault
}

/**
 * Import Fatture — lettura coda `documenti_import` con `queue: 'fatture'`, dettaglio e anteprima leggere.
 * Upload fatture (XML/PDF/ZIP/P7M) riusa `processImportedFiles` con `invoiceImportOnly`; conferma in archivio resta in Import Documenti fino a step dedicati.
 */
export function ModuloImportFatture({ utente = null, onNavigate = null }) {
  const ai = useAIStatus()
  const fatturePageSize = 50
  const fattureFileInputRef = useRef(null)
  const fattureDropRef = useRef(null)
  const [societa, setSocieta] = useState([])
  const [societaId, setSocietaId] = useState('')
  const [rows, setRows] = useState([])
  const hasRowsRef = useRef(false)
  const [fatturePage, setFatturePage] = useState(1)
  const [fattureTotalRows, setFattureTotalRows] = useState(0)
  const [, startPageTransition] = useTransition()
  const queuePageCacheRef = useRef(new Map())
  const queueAllRowsCacheRef = useRef({ scopeKey: '', rows: [], totalRows: 0, at: 0 })
  const queuePageInflightRef = useRef(new Set())
  const queueLoadRequestSeqRef = useRef(0)
  const pageNavDiagRef = useRef(null)
  const [queueLoading, setQueueLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState('')
  /** Riga la cui scheda è aperta nel pannello destro (focus lavorazione). */
  const [panelRowId, setPanelRowId] = useState(null)
  /** Id selezionati con checkbox (solo lista corrente). */
  const [checkedRowIds, setCheckedRowIds] = useState([])
  const checkedRowIdSet = useMemo(() => new Set(checkedRowIds), [checkedRowIds])
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewDoc, setPreviewDoc] = useState(null)
  const [previewSignedUrl, setPreviewSignedUrl] = useState('')
  const [panelPreviewUrl, setPanelPreviewUrl] = useState('')
  const [markBusy, setMarkBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteProgress, setDeleteProgress] = useState('')
  const [opSaveBusy, setOpSaveBusy] = useState(false)
  const [opDraft, setOpDraft] = useState({
    controparte: '',
    numero_documento: '',
    data_documento: '',
    totale: '',
  })
  const [contDraft, setContDraft] = useState({ conto_codice: '', causale_iva_id: '', causale_contabile_id: '' })
  const [ivaDraft, setIvaDraft] = useState({ imponibile: '', iva: '', detraibilita_iva: '' })
  /** Fonte ultima azione su bozza (non DB): storico / IA / regola / estratto / manuale. */
  const [bozzaFonte, setBozzaFonte] = useState({
    conto: null,
    causale: null,
    iva: null,
  })
  const pnGridTouchedRef = useRef(false)
  const ivaGridTouchedRef = useRef(false)
  const [pnGridRows, setPnGridRows] = useState([])
  const [ivaGridRows, setIvaGridRows] = useState([])
  /** Working view griglia PN: picker conto (stessa logica ricerca della tabella principale). */
  const [pnGridContoEditRowId, setPnGridContoEditRowId] = useState(null)
  const [pnGridContoQuery, setPnGridContoQuery] = useState('')
  const [importPnPianoModalRowId, setImportPnPianoModalRowId] = useState(null)
  const [pnPianoModalQuery, setPnPianoModalQuery] = useState('')
  const [ivaSaveBusy, setIvaSaveBusy] = useState(false)
  const [applySameCpBusy, setApplySameCpBusy] = useState(false)
  const [accSaveBusy, setAccSaveBusy] = useState(false)
  /** Editing inline tabella (conto / causale contabile) — non working view. */
  const [tableInlineEdit, setTableInlineEdit] = useState(null)
  const [tableInlineQuery, setTableInlineQuery] = useState('')
  const [tableInlineSaveId, setTableInlineSaveId] = useState(null)
  const [pianoConti, setPianoConti] = useState([])
  const [causaliIva, setCausaliIva] = useState([])
  /** Vista client: Tutte / Pronte (da lavorare) / Registrate (già in prima nota) */
  const [codaVista, setCodaVista] = useState('tutte')
  const [tableSearch, setTableSearch] = useState('')
  const [tableSortBy, setTableSortBy] = useState('data')
  const [tableSortDir, setTableSortDir] = useState('desc')
  const [tableColumnPickerOpen, setTableColumnPickerOpen] = useState(false)
  const [tableVisibleColumns, setTableVisibleColumns] = useState(() => ({ ...IMPORT_FATTURE_DEFAULT_VISIBLE_COLUMNS }))
  /** Data registrazione contabile (YYYY-MM-DD) per contabilizzazione — allineata a `_fiscosimOperativeOverrides.data_registrazione`. */
  const [toolbarDataRegistrazione, setToolbarDataRegistrazione] = useState('')
  /** Sottofiltro solo vista Pronte: tutte | ben preparate | parziali */
  const [preparazioneFilter, setPreparazioneFilter] = useState('tutte')
  /** Filtro client su diagnosi: tutte | con problemi | ok */
  const [lavorazioneCheckFilter, setLavorazioneCheckFilter] = useState('tutte')
  /** Filtro mini-coda step successivo: tutte | candidate | non candidate */
  const [stepCandidateFilter, setStepCandidateFilter] = useState('tutte')
  /** Filtro conferma passo finale (client): tutte | confermate valide | non confermate */
  const [confermaPassoFilter, setConfermaPassoFilter] = useState('tutte')
  /** Working view «Da Validare» — solo UX, pannello espanso e navigazione tra candidate visibili */
  const [candidateWorkingView, setCandidateWorkingView] = useState(false)
  /** Schede area lavoro working view: prima_nota | iva | partitario */
  const [importWorkingTab, setImportWorkingTab] = useState('prima_nota')
  const [finalStepConfirmBusy, setFinalStepConfirmBusy] = useState(false)
  const [archivioBridgeBusy, setArchivioBridgeBusy] = useState(false)
  const [registrazioneFinaleBusy, setRegistrazioneFinaleBusy] = useState(false)
  const [bulkContabilizzaBusy, setBulkContabilizzaBusy] = useState(false)
  const [documentoArchivioLive, setDocumentoArchivioLive] = useState(null)
  const [historicalLearningRows, setHistoricalLearningRows] = useState([])
  /** Primo conto storico per import id (prefetch elenco, stessa logica Import Documenti). */
  const [historicalContoTopByImportId, setHistoricalContoTopByImportId] = useState({})
  /** Causale contabile dominante da documenti confermati stesso soggetto (prefetch). */
  const [historicalCausaleContabileIdByImportId, setHistoricalCausaleContabileIdByImportId] = useState({})
  /** Suggerimento IVA storico dominante per riga import, usato come hint leggero nella lista. */
  const [historicalIvaTopByImportId, setHistoricalIvaTopByImportId] = useState({})
  const [historicalDocsForPanel, setHistoricalDocsForPanel] = useState([])
  const [panelRowFull, setPanelRowFull] = useState(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [rememberMainContoDefault, setRememberMainContoDefault] = useState(false)
  const [lastBulkActionLog, setLastBulkActionLog] = useState(null)

  const [dragOverFatture, setDragOverFatture] = useState(false)
  const [fattureUploading, setFattureUploading] = useState(false)
  const [fattureUploadProgress, setFattureUploadProgress] = useState(null)
  const [fattureUploadHint, setFattureUploadHint] = useState('')
  const [lastFattureUploadSummary, setLastFattureUploadSummary] = useState(null)
  const [lastFattureEnrichmentJob, setLastFattureEnrichmentJob] = useState(null)
  const [noMatchQueue, setNoMatchQueue] = useState([])
  const [noMatchQueueLoading, setNoMatchQueueLoading] = useState(false)
  const [noMatchQueueError, setNoMatchQueueError] = useState('')
  const [noMatchBusyId, setNoMatchBusyId] = useState('')
  const [anagraficaUpdateQueue, setAnagraficaUpdateQueue] = useState([])
  const [anagraficaUpdateLoading, setAnagraficaUpdateLoading] = useState(false)
  const [anagraficaUpdateError, setAnagraficaUpdateError] = useState('')
  const [anagraficaUpdateBusyId, setAnagraficaUpdateBusyId] = useState('')
  const [aiEnabled, setAiEnabled] = useState(true)
  const [aiMode, setAiMode] = useState(() => getStoredAiMode({ utente }))
  const [aiPreprocessMode, setAiPreprocessMode] = useState(() => getStoredAiPreprocessMode({ utente }))
  const [causaliContabili, setCausaliContabili] = useState([])
  const [clienti, setClienti] = useState([])

  useEffect(() => {
    hasRowsRef.current = Array.isArray(rows) && rows.length > 0
  }, [rows])

  useEffect(() => persistAiMode(aiMode, { utente }), [aiMode, utente])
  useEffect(() => persistAiPreprocessMode(aiPreprocessMode, { utente }), [aiPreprocessMode, utente])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `${IMPORT_FATTURE_COLUMN_VISIBILITY_STORAGE_PREFIX}:${String(societaId || 'default')}`
    try {
      const raw = window.localStorage?.getItem(key)
      if (!raw) {
        setTableVisibleColumns({ ...IMPORT_FATTURE_DEFAULT_VISIBLE_COLUMNS })
        return
      }
      const parsed = JSON.parse(raw)
      setTableVisibleColumns(sanitizeImportFattureVisibleColumns(parsed))
    } catch {
      setTableVisibleColumns({ ...IMPORT_FATTURE_DEFAULT_VISIBLE_COLUMNS })
    }
  }, [societaId])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const key = `${IMPORT_FATTURE_COLUMN_VISIBILITY_STORAGE_PREFIX}:${String(societaId || 'default')}`
    try {
      window.localStorage?.setItem(key, JSON.stringify(sanitizeImportFattureVisibleColumns(tableVisibleColumns)))
    } catch {
      // no-op
    }
  }, [societaId, tableVisibleColumns])

  useEffect(() => {
    const batchKey = String(lastFattureUploadSummary?.importBatchKey || '').trim()
    if (!societaId || !batchKey) {
      setLastFattureEnrichmentJob(null)
      return
    }
    setLastFattureEnrichmentJob(null)
  }, [lastFattureUploadSummary?.importBatchKey, societaId])

  const refreshNoMatchQueue = useCallback(async () => {
    if (!societaId) {
      setNoMatchQueue([])
      setNoMatchQueueError('')
      setNoMatchQueueLoading(false)
      return
    }
    setNoMatchQueueError('')
    setNoMatchQueue([])
    setNoMatchQueueLoading(false)
  }, [societaId])

  const refreshAnagraficaUpdateQueue = useCallback(async () => {
    if (!societaId) {
      setAnagraficaUpdateQueue([])
      setAnagraficaUpdateError('')
      setAnagraficaUpdateLoading(false)
      return
    }
    setAnagraficaUpdateError('')
    setAnagraficaUpdateQueue([])
    setAnagraficaUpdateLoading(false)
  }, [societaId])

  const readinessOpts = useMemo(
    () => ({
      requireValidPnGridConti: true,
      pianoConti,
      causaliIva,
      causaliContabili,
      historicalContoTopByImportId,
      historicalCausaleContabileIdByImportId,
    }),
    [pianoConti, causaliIva, causaliContabili, historicalContoTopByImportId, historicalCausaleContabileIdByImportId],
  )

  const queueFullView = codaVista === 'tutte' || codaVista === 'pronte' || codaVista === 'da_completare' || codaVista === 'anomalie'

  const righeNonRegistrate = useMemo(
    () => rows.filter((r) => String(r?.accounting_status || '').toLowerCase() !== 'accounted'),
    [rows],
  )
  const righeRegistrate = useMemo(
    () => rows.filter((r) => String(r?.accounting_status || '').toLowerCase() === 'accounted'),
    [rows],
  )

  const rowEvalCacheRef = useRef(new WeakMap())
  const rowEvalById = useMemo(() => {
    const readinessCacheRoot = rowEvalCacheRef.current
    let readinessCache = readinessCacheRoot.get(readinessOpts)
    if (!readinessCache) {
      readinessCache = new WeakMap()
      readinessCacheRoot.set(readinessOpts, readinessCache)
    }
    const out = new Map()
    for (const r of righeNonRegistrate) {
      const cached = readinessCache.get(r)
      if (cached) {
        out.set(r.id, cached)
        continue
      }
      const pronta = isProntaLavorazioneRow(r)
      const benPreparata = isBenPreparata(r, readinessOpts)
      const diag = evaluateProntaLavorazioneDiagnosi(r, readinessOpts, { benPreparata })
      const isCandidate = pronta && benPreparata && diag.level === 'ok'
      const confValid = getFinalStepConfirmationFlag(r) && isCandidate
      const nextEval = { pronta, benPreparata, diag, isCandidate, confValid }
      readinessCache.set(r, nextEval)
      out.set(r.id, nextEval)
    }
    return out
  }, [righeNonRegistrate, readinessOpts])

  const filteredRows = useMemo(() => {
    if (codaVista === 'registrate') {
      return righeRegistrate
    }
    let list =
      codaVista === 'pronte'
        ? righeNonRegistrate.filter((r) => rowEvalById.get(r.id)?.diag?.level === 'ok')
        : [...righeNonRegistrate]
    if (codaVista === 'da_completare') {
      list = list.filter((r) => {
        const evalRow = rowEvalById.get(r.id)
        return !evalRow?.pronta || !evalRow?.benPreparata
      })
    }
    if (codaVista === 'anomalie') {
      list = list.filter((r) => rowEvalById.get(r.id)?.diag?.level !== 'ok')
    }
    if (codaVista === 'pronte') {
      if (preparazioneFilter === 'ben_preparate') list = list.filter((r) => rowEvalById.get(r.id)?.benPreparata)
      else if (preparazioneFilter === 'parziali') list = list.filter((r) => !rowEvalById.get(r.id)?.benPreparata)
      if (lavorazioneCheckFilter === 'ok') list = list.filter((r) => rowEvalById.get(r.id)?.diag?.level === 'ok')
      else if (lavorazioneCheckFilter === 'con_problemi')
        list = list.filter((r) => rowEvalById.get(r.id)?.diag?.level !== 'ok')
      if (stepCandidateFilter === 'candidate') list = list.filter((r) => rowEvalById.get(r.id)?.isCandidate)
      else if (stepCandidateFilter === 'non_candidate') list = list.filter((r) => !rowEvalById.get(r.id)?.isCandidate)
      if (confermaPassoFilter === 'confermate') list = list.filter((r) => rowEvalById.get(r.id)?.confValid)
      else if (confermaPassoFilter === 'non_confermate') list = list.filter((r) => !rowEvalById.get(r.id)?.confValid)
    }
    const searchTokens = normSearchToken(tableSearch).split(/\s+/).filter(Boolean)
    if (searchTokens.length) {
      list = list.filter((r) => {
        const nd = effectiveNumeroData(r)
        const hay = normSearchToken([effectiveControparte(r), nd.num, nd.data].filter(Boolean).join(' '))
        return searchTokens.every((t) => hay.includes(t))
      })
    }

    const sorted = [...list]
    const sign = tableSortDir === 'asc' ? 1 : -1
    sorted.sort((a, b) => {
      if (tableSortBy === 'soggetto') {
        return sign * String(effectiveControparte(a) || '').localeCompare(String(effectiveControparte(b) || ''), 'it')
      }
      if (tableSortBy === 'importo') {
        return sign * (parseSortableAmountFromDoc(a) - parseSortableAmountFromDoc(b))
      }
      return sign * (parseSortableDate(effectiveNumeroData(a).data) - parseSortableDate(effectiveNumeroData(b).data))
    })
    return sorted
  }, [
    righeNonRegistrate,
    righeRegistrate,
    rowEvalById,
    codaVista,
    preparazioneFilter,
    lavorazioneCheckFilter,
    stepCandidateFilter,
    confermaPassoFilter,
    tableSearch,
    tableSortBy,
    tableSortDir,
  ])

  const tableInlineContoOptions = useMemo(
    () =>
      tableInlineEdit?.field === 'conto'
        ? filterPianoContiForInlineSearch(pianoConti, tableInlineQuery, { max: 32, includeIva: true })
        : [],
    [pianoConti, tableInlineQuery, tableInlineEdit],
  )

  const pnGridContoPickerOptions = useMemo(
    () =>
      pnGridContoEditRowId
        ? filterPianoContiForInlineSearch(pianoConti, pnGridContoQuery, { max: 40, includeIva: true })
        : [],
    [pianoConti, pnGridContoQuery, pnGridContoEditRowId],
  )

  const tableInlineCausaleContabileOptions = useMemo(
    () =>
      tableInlineEdit?.field === 'causale'
        ? filterCausaliContabiliForInlineSearch(causaliContabili, tableInlineQuery, { max: 36 })
        : [],
    [causaliContabili, tableInlineQuery, tableInlineEdit],
  )

  const tableInlineCausaleIvaOptions = useMemo(
    () =>
      tableInlineEdit?.field === 'causale_iva'
        ? filterCausaliIvaForInlineSearch(causaliIva, tableInlineQuery, { max: 36 })
        : [],
    [causaliIva, tableInlineQuery, tableInlineEdit],
  )

  const pianoContiByCodice = useMemo(() => {
    const out = new Map()
    for (const conto of pianoConti || []) {
      const codice = String(conto?.codice || '').trim()
      if (!codice || out.has(codice)) continue
      out.set(codice, conto)
    }
    return out
  }, [pianoConti])

  const causaliContabiliById = useMemo(() => {
    const out = new Map()
    for (const causale of causaliContabili || []) {
      const id = String(causale?.id || '').trim()
      if (!id || out.has(id)) continue
      out.set(id, causale)
    }
    return out
  }, [causaliContabili])

  const filteredRowsMeta = useMemo(() => {
    const filteredBenPreparataIdsNext = []
    const filteredIncompleteIdsNext = []
    const candidateVisibleListNext = []
    for (const row of filteredRows) {
      const evalRow = rowEvalById.get(row.id)
      if (evalRow?.benPreparata) filteredBenPreparataIdsNext.push(row.id)
      else filteredIncompleteIdsNext.push(row.id)
      if (queueFullView && evalRow?.isCandidate) candidateVisibleListNext.push(row)
    }

    let pronte = 0
    let verdiControlliOk = 0
    let benPreparate = 0
    let candidateStep = 0
    let confermatePassoFinale = 0
    let anomalie = 0
    for (const row of righeNonRegistrate) {
      const evalRow = rowEvalById.get(row.id)
      if (evalRow?.pronta) {
        pronte += 1
        if (evalRow?.benPreparata) benPreparate += 1
        if (evalRow?.isCandidate) candidateStep += 1
        if (evalRow?.confValid) confermatePassoFinale += 1
      }
      if (evalRow?.diag?.level === 'ok') verdiControlliOk += 1
      if (evalRow?.diag?.level !== 'ok') anomalie += 1
    }

    return {
      filteredBenPreparataIds: filteredBenPreparataIdsNext,
      filteredIncompleteIds: filteredIncompleteIdsNext,
      candidateVisibleList: candidateVisibleListNext,
      rowCounts: {
        caricate: righeNonRegistrate.length,
        registrateArchivio: righeRegistrate.length,
        pronte,
        verdiControlliOk,
        nonPronte: righeNonRegistrate.length - pronte,
        daCompletare: Math.max(0, righeNonRegistrate.length - benPreparate),
        anomalie,
        visibili: filteredRows.length,
        benPreparate,
        parzialiPreparate: pronte - benPreparate,
        candidateStep,
        confermatePassoFinale,
      },
    }
  }, [queueFullView, righeNonRegistrate, righeRegistrate, filteredRows, rowEvalById])
  const filteredBenPreparataIds = filteredRowsMeta.filteredBenPreparataIds
  const filteredIncompleteIds = filteredRowsMeta.filteredIncompleteIds
  const rowCounts = filteredRowsMeta.rowCounts
  const rowViewModelById = useMemo(() => {
    const out = new Map()
    for (const row of filteredRows) {
      out.set(
        row.id,
        buildImportFattureTableRowViewModel(row, {
          lightOnly: true,
        }),
      )
    }
    return out
  }, [
    filteredRows,
  ])
  const fattureTotalPages = useMemo(
    () => Math.max(1, Math.ceil((fattureTotalRows || 0) / fatturePageSize)),
    [fattureTotalRows, fatturePageSize],
  )

  /** Candidate nell’elenco filtrato attuale (fallback navigazione working view). */
  const candidateVisibleList = filteredRowsMeta.candidateVisibleList

  const panelRowBase = useMemo(() => rows.find((r) => r.id === panelRowId) || null, [rows, panelRowId])
  const panelRow = useMemo(() => {
    if (panelRowFull?.id && panelRowFull.id === panelRowId) return panelRowFull
    return panelRowBase
  }, [panelRowBase, panelRowFull, panelRowId])

  useEffect(() => {
    if (!panelRowId || !panelRowBase?.id) {
      setPanelRowFull(null)
      return
    }
    if (panelRowFull?.id === panelRowId && hasFullImportFatturePayload(panelRowFull)) return
    setPanelRowFull(panelRowBase)
  }, [panelRowId, panelRowBase, panelRowFull])

  useEffect(() => {
    const r = rows.find((x) => x.id === panelRowId)
    if (!r?.id) {
      setToolbarDataRegistrazione('')
      return
    }
    const op = getOperativeOverridesObj(r)
    const nd = effectiveNumeroData(r)
    const fromOp = toIsoDateForInput(op.data_registrazione)
    const rawData = nd.data === '—' ? '' : nd.data
    const fromDoc = toIsoDateForInput(rawData)
    setToolbarDataRegistrazione(fromOp || fromDoc || '')
  }, [panelRowId, rows])

  useEffect(() => {
    if (!filteredRows.length) {
      if (panelRowId) setPanelRowId(null)
      return
    }
    if (panelRowId && !filteredRows.some((r) => r.id === panelRowId)) {
      setPanelRowId(filteredRows[0].id)
    }
  }, [codaVista, filteredRows, panelRowId])

  /** In working view le griglia PN/IVA + bozze locali sono fonte operativa (overlay sui controlli / CTA). */
  const readinessOptsWorkingPanel = useMemo(
    () => ({
      ...readinessOpts,
      liveWorkingGrids:
        candidateWorkingView && queueFullView && panelRow && isProntaLavorazioneRow(panelRow)
          ? { docId: panelRow.id, pnGridRows, ivaGridRows, contDraft, ivaDraft }
          : null,
    }),
    [readinessOpts, candidateWorkingView, queueFullView, panelRow, pnGridRows, ivaGridRows, contDraft, ivaDraft],
  )

  /** Righe pronte selezionate, altrimenti candidata, altrimenti pannello corrente. */
  const workingViewNavList = useMemo(() => {
    if (!(candidateWorkingView && queueFullView)) return []
    const checkedPronte = filteredRows.filter((r) => isProntaLavorazioneRow(r) && checkedRowIdSet.has(r.id))
    if (checkedPronte.length) return checkedPronte
    if (candidateVisibleList.length) return candidateVisibleList
    if (panelRow && isProntaLavorazioneRow(panelRow)) return [panelRow]
    return []
  }, [candidateWorkingView, queueFullView, filteredRows, checkedRowIdSet, candidateVisibleList, panelRow])

  const gotoPrevCandidateInView = () => {
    if (workingViewNavList.length < 2) return
    const idx = workingViewNavList.findIndex((r) => r.id === panelRowId)
    const cur = idx >= 0 ? idx : 0
    const prev = cur <= 0 ? workingViewNavList.length - 1 : cur - 1
    setPanelRowId(workingViewNavList[prev].id)
  }

  const gotoNextCandidateInView = () => {
    if (workingViewNavList.length < 2) return
    const idx = workingViewNavList.findIndex((r) => r.id === panelRowId)
    const cur = idx >= 0 ? idx : 0
    setPanelRowId(workingViewNavList[(cur + 1) % workingViewNavList.length].id)
  }

  const panelAccountingBlocks = useMemo(
    () =>
      buildWorkingViewAccountingBlocks({
        panelRow,
        pnGridRows,
        ivaGridRows,
        opDraft,
        pianoConti,
        causaliIva,
      }),
    [panelRow, pnGridRows, ivaGridRows, opDraft, pianoConti, causaliIva],
  )

  const panelStructuralChecks = useMemo(() => {
    if (!panelRow) return []
    const out = evaluateImportFattureStructuralAccountingBlocks({
      doc: panelRow,
      pnGridRows,
      ivaGridRows,
      opDraft,
      pianoConti,
      causaliIva,
    })
    return Array.isArray(out) ? out : []
  }, [panelRow, pnGridRows, ivaGridRows, opDraft, pianoConti, causaliIva])

  const panelDiagnosiPronta = useMemo(() => {
    if (!panelRow || !isProntaLavorazioneRow(panelRow)) return null
    return evaluateProntaLavorazioneDiagnosi(panelRow, readinessOptsWorkingPanel)
  }, [panelRow, readinessOptsWorkingPanel])

  const panelCandidateNextStep = useMemo(() => {
    if (!panelRow || !queueFullView) return false
    if (panelAccountingBlocks.length) return false
    return candidateForNextStep(panelRow, readinessOptsWorkingPanel)
  }, [panelRow, queueFullView, readinessOptsWorkingPanel, panelAccountingBlocks])

  const panelConfermaPassoFinaleValida = useMemo(
    () =>
      !!(
        panelRow &&
        getFinalStepConfirmationFlag(panelRow) &&
        candidateForNextStep(panelRow, readinessOptsWorkingPanel) &&
        panelAccountingBlocks.length === 0
      ),
    [panelRow, readinessOptsWorkingPanel, panelAccountingBlocks],
  )
  const panelConfermaPassoFinaleStale = useMemo(
    () =>
      !!(
        panelRow &&
        getFinalStepConfirmationFlag(panelRow) &&
        (!candidateForNextStep(panelRow, readinessOptsWorkingPanel) || panelAccountingBlocks.length > 0)
      ),
    [panelRow, readinessOptsWorkingPanel, panelAccountingBlocks],
  )
  const workingViewMissingItems = useMemo(
    () =>
      buildWorkingViewMissingItems({
        panelRow,
        readinessOpts: readinessOptsWorkingPanel,
      }),
    [panelRow, readinessOptsWorkingPanel],
  )

  const panelPreCommitSemaforo = useMemo(() => {
    const warningChecks = (workingViewMissingItems || []).map((item, idx) => ({
      code: `WV_WARN_${idx + 1}`,
      level: 'WARNING',
      message: item.message,
      field: item.tab || 'partitario',
    }))
    const merged = evaluatePreCommitChecks([...(panelStructuralChecks || []), ...warningChecks])
    return merged?.semaforo || 'verde'
  }, [panelStructuralChecks, workingViewMissingItems])

  const internalTelemetryVisible = false
  const internalTelemetrySnapshot = null
  const defaultMainContoPlan = useMemo(() => {
    if (!panelRow) return { ready: false, message: 'Nessun documento selezionato.' }
    const main = resolvePrimaryEconomicContoFromPnGrid(pnGridRows, pianoConti)
    if (main.status !== 'ok') {
      return {
        ready: false,
        message:
          main.status === 'ambiguous'
            ? 'Memorizzazione automatica non disponibile: presenti più righe economiche.'
            : 'Memorizzazione automatica non disponibile: nessuna riga economica valida trovata.',
      }
    }
    const cp = resolveCounterpartyMasterContoForDefault(panelRow, pianoConti)
    if (cp.status !== 'ok') {
      return {
        ready: false,
        message:
          cp.status === 'ambiguous'
            ? 'Memorizzazione automatica non disponibile: controparte ambigua nel piano dei conti.'
            : 'Memorizzazione automatica non disponibile: conto fornitore/cliente non risolto nel piano dei conti.',
      }
    }
    return {
      ready: true,
      mainConto: main.conto,
      counterpartyConto: cp.conto,
      message: `Verrà memorizzato ${main.conto.codice} come contropartita predefinita per ${cp.conto.codice}.`,
    }
  }, [panelRow, pnGridRows, pianoConti])
  const panelHasFinalStepFlag = useMemo(
    () => !!(panelRow && getFinalStepConfirmationFlag(panelRow)),
    [panelRow]
  )

  const panelArchivioDocumentoId = useMemo(
    () => (panelRow ? getArchivioDocumentoIdFromImportMeta(panelRow) : ''),
    [panelRow]
  )

  const panelArchivioGiaRegistrato = useMemo(() => {
    if (documentoArchivioLive?.id && String(documentoArchivioLive.id) === String(panelArchivioDocumentoId || '')) {
      const ws = String(documentoArchivioLive.workflow_status || '')
      if (ws === 'registered' || documentoArchivioLive.prima_nota_id || documentoArchivioLive.registered_at) {
        return true
      }
    }
    if (panelRow && getRegistrazionePrimaNotaIdFromImportMeta(panelRow)) return true
    return false
  }, [documentoArchivioLive, panelArchivioDocumentoId, panelRow?.id])

  useEffect(() => {
    let alive = true
    const aid = panelArchivioDocumentoId
    if (!aid || !societaId) {
      setDocumentoArchivioLive(null)
      return () => {
        alive = false
      }
    }
    contabilitaRepo
      .getDocumentoContabilitaById(aid, societaId, { userId: utente?.id || '' })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          setDocumentoArchivioLive(null)
          return
        }
        setDocumentoArchivioLive(data || null)
      })
      .catch(() => {
        if (alive) setDocumentoArchivioLive(null)
      })
    return () => {
      alive = false
    }
  }, [panelArchivioDocumentoId, societaId, utente?.id])

  const suggestedCausaleIvaIdFromExtract = useMemo(() => {
    if (!panelRow || !causaliIva.length) return null
    if (getAccountingProposalsObj(panelRow).causale_iva_id) return null
    return computeImportCausaleIvaDefault(parseAiRaw(panelRow), causaliIva) || null
  }, [panelRow, causaliIva])

  const suggestedCausaleIvaHintLabel = useMemo(() => {
    if (!suggestedCausaleIvaIdFromExtract) return ''
    const c = causaliIva.find((x) => String(x.id) === String(suggestedCausaleIvaIdFromExtract))
    if (!c) return String(suggestedCausaleIvaIdFromExtract)
    return [c.codice, c.descrizione].filter(Boolean).join(' · ')
  }, [suggestedCausaleIvaIdFromExtract, causaliIva])

  const historicalLearningRowsCapped = useMemo(
    () => (Array.isArray(historicalLearningRows) ? historicalLearningRows.slice(0, IMPORT_FATTURE_HISTORICAL_LEARNING_CAP) : []),
    [historicalLearningRows],
  )

  const ivaAiRowPanel = useMemo(
    () => (panelRow ? ivaAiFirstRowStrings(panelRow) : { imponibile: '', iva: '', detraibilita_iva: '' }),
    [panelRow]
  )
  const ivaEffectivePanel = useMemo(
    () => (panelRow ? effectiveIvaTripleStrings(panelRow) : { imponibile: '', iva: '', detraibilita_iva: '' }),
    [panelRow]
  )

  const historicalContoBuilt = useMemo(() => {
    if (!historicalDocsForPanel.length || !pianoConti.length || !panelRow) return []
    return buildHistoricalContoSuggestions({
      historicalDocs: historicalDocsForPanel,
      learningRows: historicalLearningRowsCapped,
      pianoConti,
      maxResults: 3,
      sourceLabel: 'Documenti confermati stessa controparte',
      currentDoc: panelRow,
      currentSocietaId: societaId,
    })
  }, [historicalDocsForPanel, historicalLearningRowsCapped, pianoConti, panelRow, societaId])

  const suggestionContoAi = useMemo(() => {
    if (!panelRow || !pianoConti.length) return []
    return suggestContiPerDocumento({ doc: buildDocSnapshotForContoMatch(panelRow), pianoConti, maxResults: 3 })
  }, [panelRow, pianoConti])

  const accountDecision = useMemo(() => {
    if (!panelRow || !pianoConti.length) return null
    return buildAccountDecisionHierarchy({
      doc: buildDocSnapshotForContoMatch(panelRow),
      pianoConti,
      contoSuggestions: suggestionContoAi,
      historicalContoSuggestions: historicalContoBuilt,
      maxResults: 3,
    })
  }, [panelRow, pianoConti, suggestionContoAi, historicalContoBuilt])

  const ivaProposal = useMemo(() => {
    if (!panelRow || !causaliIva.length) return null
    const topHistRow = String(historicalContoTopByImportId[panelRow.id] || '').trim()
    const mergedConto =
      normContoCodiceUi(contDraft.conto_codice) || pickImportFatturaStagingContoCodice(panelRow, pianoConti, topHistRow)
    const masterCausaleIvaId = resolveImportFattureMasterCausaleIvaId({
      doc: panelRow,
      pianoConti,
      contoCodice: mergedConto,
    })
    return buildImportFattureIvaProposal({
      doc: panelRow,
      historicalDocs: historicalDocsForPanel,
      causaliIva,
      masterCausaleIvaId,
      causaliContabili,
      currentCausaleContabileId: String(contDraft.causale_contabile_id || '').trim(),
    })
  }, [
    panelRow,
    historicalDocsForPanel,
    causaliIva,
    causaliContabili,
    pianoConti,
    contDraft.conto_codice,
    contDraft.causale_contabile_id,
    historicalContoTopByImportId,
  ])

  const panelCausaliContabiliOptions = useMemo(
    () => filterCausaliContabiliByTipoDocumento(causaliContabili, panelRow),
    [causaliContabili, panelRow],
  )

  const panelCausaliContabiliSelectOptions = useMemo(() => {
    const base = Array.isArray(panelCausaliContabiliOptions) ? panelCausaliContabiliOptions : []
    const currentId = String(contDraft.causale_contabile_id || '').trim()
    if (!currentId) return base
    if (base.some((c) => String(c?.id || '').trim() === currentId)) return base
    const current = (Array.isArray(causaliContabili) ? causaliContabili : []).find(
      (c) => String(c?.id || '').trim() === currentId,
    )
    if (!current) return base
    return [current, ...base]
  }, [panelCausaliContabiliOptions, contDraft.causale_contabile_id, causaliContabili])

  const panelCausaliContabiliHint = useMemo(() => {
    const bucket = getImportFattureTipoBucket(panelRow)
    if (bucket === 'attiva') return 'Filtro attivo: causali vendite (FC, FCPA, FCPC).'
    if (bucket === 'passiva') return 'Filtro attivo: causali acquisti/professionisti/reverse (FF, RP, A17X, FF5, FFPC, RPPC).'
    return 'Filtro non applicato: tipo documento non classificato come fattura attiva/passiva.'
  }, [panelRow])

  const causaleStoricoSuggestion = useMemo(() => ivaProposal?.historicalTop || null, [ivaProposal])
  const causaleDocumentoId = useMemo(() => String(ivaProposal?.documentCausaleId || '').trim(), [ivaProposal])
  const causaleDefaultPercentId = useMemo(() => String(ivaProposal?.defaultByPercentId || '').trim(), [ivaProposal])

  const causaleRegolaId = useMemo(() => {
    return causaleDefaultPercentId || null
  }, [causaleDefaultPercentId])

  const historicalIdentityPanel = useMemo(
    () => (panelRow ? extractHistoricalSearchIdentity(panelRow) : { piva: '', cf: '', nomeLike: '' }),
    [panelRow]
  )

  const tripleContoStatus = useMemo(() => {
    if (!panelRow) return null
    const ap = getAccountingProposalsObj(panelRow)
    const saved = normContoCodiceUi(ap.conto_codice)
    const draft = normContoCodiceUi(contDraft.conto_codice)
    const savedFlag = hasAccountingProposal(panelRow, 'conto_codice')
    if (savedFlag && draft === saved) return { kind: 'salvato', text: 'Salvato', accent: 'saved' }
    if (!draft) return { kind: 'vuoto', text: null, accent: null }
    if (bozzaFonte.conto === 'manuale') return { kind: 'bozza', text: 'Bozza · manuale', accent: 'manual' }
    if (bozzaFonte.conto) {
      const lb = labelBozzaFonteConto(bozzaFonte.conto)
      return { kind: 'bozza', text: lb ? `Bozza · ${lb}` : 'Bozza', accent: 'draft' }
    }
    return { kind: 'bozza', text: 'Bozza · non salvata', accent: 'draft' }
  }, [panelRow, contDraft.conto_codice, bozzaFonte.conto])

  const tripleCausaleStatus = useMemo(() => {
    if (!panelRow) return null
    const ap = getAccountingProposalsObj(panelRow)
    const saved = ap.causale_iva_id != null ? String(ap.causale_iva_id).trim() : ''
    const draft = String(contDraft.causale_iva_id || '').trim()
    const savedFlag = hasAccountingProposal(panelRow, 'causale_iva_id')
    if (savedFlag && draft === saved) return { kind: 'salvato', text: 'Salvato', accent: 'saved' }
    if (!draft) return { kind: 'vuoto', text: null, accent: null }
    if (bozzaFonte.causale === 'anagrafica') return { kind: 'bozza', text: 'Bozza · anagrafica', accent: 'draft' }
    if (bozzaFonte.causale === 'default_percentuale') return { kind: 'bozza', text: 'Bozza · default aliquota', accent: 'draft' }
    if (bozzaFonte.causale === 'manuale') return { kind: 'bozza', text: 'Bozza · manuale', accent: 'manual' }
    if (bozzaFonte.causale === 'storico') return { kind: 'bozza', text: 'Bozza · storico', accent: 'draft' }
    if (bozzaFonte.causale === 'documento') return { kind: 'bozza', text: 'Bozza · documento', accent: 'draft' }
    if (bozzaFonte.causale === 'regola') return { kind: 'bozza', text: 'Bozza · regola', accent: 'draft' }
    return { kind: 'bozza', text: 'Bozza · non salvata', accent: 'draft' }
  }, [panelRow, contDraft.causale_iva_id, bozzaFonte.causale])

  const tripleIvaByField = useMemo(() => {
    const trim = (x) => String(x ?? '').trim()
    const one = (field) => {
      if (!panelRow) return null
      const o = getIvaOverridesObj(panelRow)
      const saved =
        field === 'imponibile'
          ? o.imponibile != null
            ? trim(o.imponibile)
            : ''
          : field === 'iva'
            ? o.iva != null
              ? trim(o.iva)
              : ''
            : o.detraibilita_iva != null
              ? trim(o.detraibilita_iva)
              : ''
      const draft = trim(ivaDraft[field])
      const hasO = hasIvaOverride(panelRow, field)
      if (hasO && draft === saved) return { kind: 'salvato', text: 'Salvato', accent: 'saved' }
      if (!draft) return { kind: 'vuoto', text: null, accent: null }
      if (bozzaFonte.iva === 'manuale') return { kind: 'bozza', text: 'Bozza · manuale', accent: 'manual' }
      if (bozzaFonte.iva === 'estratto') return { kind: 'bozza', text: 'Bozza · estratto', accent: 'draft' }
      return { kind: 'bozza', text: 'Bozza · non salvata', accent: 'draft' }
    }
    return {
      imponibile: one('imponibile'),
      iva: one('iva'),
      detraibilita_iva: one('detraibilita_iva'),
    }
  }, [panelRow, ivaDraft, bozzaFonte.iva])

  /**
   * Se la vista attiva non include più la riga del pannello, focus sulla prima riga visibile o pannello chiuso.
   * In working view candidate, riallinea sulla prima candidata visibile se la riga corrente non è più candidata.
   */
  useEffect(() => {
    if (!panelRowId) return
    // Fast path for standard table navigation: avoid expensive candidate evaluation when working view is off.
    if (!(candidateWorkingView && queueFullView)) {
      if (!filteredRows.some((r) => r.id === panelRowId)) {
        setPanelRowId(filteredRows[0]?.id ?? null)
      }
      return
    }

    const checkedPronte = filteredRows.filter((r) => isProntaLavorazioneRow(r) && checkedRowIdSet.has(r.id))
    const cands = filteredRows.filter((r) => candidateForNextStep(r, readinessOptsWorkingPanel))
    const workNav = checkedPronte.length
      ? checkedPronte
      : cands.length
        ? cands
        : filteredRows.filter((r) => r.id === panelRowId && isProntaLavorazioneRow(r))

    if (!filteredRows.some((r) => r.id === panelRowId)) {
      if (workNav.length) {
        setPanelRowId(workNav[0].id)
      } else {
        setPanelRowId(filteredRows[0]?.id ?? null)
        setCandidateWorkingView(false)
      }
      return
    }

    if (!workNav.length) {
      setCandidateWorkingView(false)
    } else if (!workNav.some((r) => r.id === panelRowId)) {
      setPanelRowId(workNav[0].id)
    }
  }, [
    queueFullView,
    codaVista,
    preparazioneFilter,
    lavorazioneCheckFilter,
    stepCandidateFilter,
    confermaPassoFilter,
    filteredRows,
    panelRowId,
    candidateWorkingView,
    checkedRowIdSet,
    readinessOptsWorkingPanel,
  ])

  useEffect(() => {
    if (!candidateWorkingView) setImportWorkingTab('prima_nota')
  }, [candidateWorkingView])

  useEffect(() => {
    setRememberMainContoDefault(false)
  }, [panelRowId])

  useEffect(() => {
    let cancelled = false
    importRepo.getSocietaAttive().then(({ data, error }) => {
      if (cancelled) return
      if (error) {
        setLoadError(error.message || String(error))
        return
      }
      const list = data || []
      setSocieta(list)
      if (!list.length) return
      setSocietaId(getPreferredSocietaId(list, { utente }))
    })
    importRepo.getImpostazioneStudioAiEnabled().then(({ data }) => {
      if (cancelled) return
      const val = Array.isArray(data) ? data[0]?.valore : data?.valore
      setAiEnabled(val !== 'false')
    })
    return () => {
      cancelled = true
    }
  }, [utente])

  const getQueuePageCacheKey = useCallback(
    () => `${String(societaId || '').trim()}|fatture|all`,
    [societaId],
  )

  const getQueueScopeKey = useCallback(
    () => `${String(societaId || '').trim()}|fatture`,
    [societaId],
  )

  const fetchImportFattureQueueRows = useCallback(
    async (limit = IMPORT_FATTURE_FULL_CACHE_MAX_ROWS) =>
      importRepo.getDocumentiImportInStaging(societaId, {
        userId: utente?.id || '',
        queue: 'fatture',
        limit,
      }),
    [societaId, utente?.id],
  )

  const applyQueuePageFromAllRowsCache = useCallback(
    () => {
      const cache = queueAllRowsCacheRef.current
      const scopeKey = getQueueScopeKey()
      if (!cache || cache.scopeKey !== scopeKey || !Array.isArray(cache.rows) || !cache.rows.length) return false
      setRows(cache.rows)
      setFattureTotalRows((prev) => (prev === cache.totalRows ? prev : cache.totalRows))
      setPanelRowId((prev) => (prev && cache.rows.some((r) => r.id === prev) ? prev : null))
      setCheckedRowIds((prev) => prev.filter((id) => cache.rows.some((r) => r.id === id)))
      return true
    },
    [getQueueScopeKey],
  )

  const prefetchQueuePage = useCallback(async () => {}, [])

  const loadQueue = useCallback(async () => {
    if (!societaId) return
    setLoadError('')
    setQueueLoading(true)
    const nowPerf = () => (typeof performance !== 'undefined' ? performance.now() : Date.now())
    const navDiag = pageNavDiagRef.current && pageNavDiagRef.current.toPage === fatturePage ? pageNavDiagRef.current : null
    if (navDiag && !navDiag.loadStartAt) {
      navDiag.loadStartAt = nowPerf()
    }
    const requestId = queueLoadRequestSeqRef.current + 1
    queueLoadRequestSeqRef.current = requestId
    if (applyQueuePageFromAllRowsCache(fatturePage)) {
      if (navDiag) {
        navDiag.fetchStartAt = navDiag.fetchStartAt || navDiag.loadStartAt
        navDiag.fetchEndAt = navDiag.fetchEndAt || nowPerf()
        navDiag.doneAt = nowPerf()
        if (isImportFatturePageDiagEnabled()) {
          console.info('[import_page_diag] summary', {
            from_page: navDiag.fromPage,
            to_page: navDiag.toPage,
            source: 'all_rows_cache',
            click_to_load_ms: Math.round((navDiag.loadStartAt || navDiag.clickAt || 0) - (navDiag.clickAt || 0)),
            load_to_fetch_ms: Math.round((navDiag.fetchStartAt || navDiag.loadStartAt || 0) - (navDiag.loadStartAt || 0)),
            fetch_ms: Math.round((navDiag.fetchEndAt || navDiag.doneAt || 0) - (navDiag.fetchStartAt || navDiag.loadStartAt || 0)),
            total_ms: Math.round((navDiag.doneAt || 0) - (navDiag.clickAt || 0)),
          })
        }
        pageNavDiagRef.current = null
      }
      setQueueLoading(false)
      setLoading(false)
      return
    }
    const cacheKey = getQueuePageCacheKey(fatturePage)
    const cached = queuePageCacheRef.current.get(cacheKey)
    if (cached && Array.isArray(cached.rows)) {
      setRows(cached.rows)
      if (Number.isFinite(Number(cached.totalRows))) {
        setFattureTotalRows((prev) => (prev === cached.totalRows ? prev : cached.totalRows))
      }
      setPanelRowId((prev) => (prev && cached.rows.some((r) => r.id === prev) ? prev : null))
      setCheckedRowIds((prev) => prev.filter((id) => cached.rows.some((r) => r.id === id)))
      setLoading(false)
    } else {
      // Keep full-screen/toolbar loading only for true first paint.
      setLoading((prev) => (!hasRowsRef.current ? true : prev))
    }
    try {
      if (navDiag && !navDiag.fetchStartAt) {
        navDiag.fetchStartAt = nowPerf()
      }
      const { data, error } = await fetchImportFattureQueueRows(null)
      if (navDiag) {
        navDiag.fetchEndAt = nowPerf()
      }
      if (error) throw error
      if (requestId !== queueLoadRequestSeqRef.current) return
      const allRows = Array.isArray(data) ? data : []
      const totalRows = allRows.length
      const list = allRows
      queuePageCacheRef.current.set(cacheKey, {
        rows: list,
        totalRows,
        at: Date.now(),
      })
      const scopeKey = getQueueScopeKey()
      queueAllRowsCacheRef.current = {
        scopeKey,
        rows: allRows,
        totalRows,
        at: Date.now(),
      }
      try {
        const diag = window?.localStorage?.getItem('FISCOSIM_IMPORT_ZIP_DIAG') === '1'
        if (diag) {
          console.info('[import_zip_diag] ImportFatture queue fetch', {
            societaId,
            rows_returned: list.length,
            total_rows: totalRows,
            page: fatturePage,
            page_size: fatturePageSize,
          })
        }
      } catch {
        // ignore
      }
      setRows((prev) => {
        if (
          Array.isArray(prev) &&
          prev.length === list.length &&
          prev.every((p, idx) => {
            const n = list[idx]
            return (
              p?.id === n?.id &&
              String(p?.updated_at || '') === String(n?.updated_at || '') &&
              String(p?.accounting_status || '') === String(n?.accounting_status || '') &&
              String(p?.workflow_status || '') === String(n?.workflow_status || '')
            )
          })
        ) {
          return prev
        }
        return list
      })
      setFattureTotalRows((prev) => (prev === totalRows ? prev : totalRows))
      setPanelRowId((prev) => (prev && list.some((r) => r.id === prev) ? prev : null))
      setCheckedRowIds((prev) => prev.filter((id) => list.some((r) => r.id === id)))
    } catch (e) {
      if (requestId !== queueLoadRequestSeqRef.current) return
      setLoadError(e?.message || String(e))
      setRows([])
      setFattureTotalRows(0)
      setPanelRowId(null)
      setCheckedRowIds([])
    } finally {
      if (requestId === queueLoadRequestSeqRef.current) {
        if (navDiag) {
          navDiag.doneAt = nowPerf()
          if (isImportFatturePageDiagEnabled()) {
            const source = navDiag.fetchStartAt ? (cached && Array.isArray(cached.rows) ? 'page_cache_plus_network' : 'network') : 'unknown'
            console.info('[import_page_diag] summary', {
              from_page: navDiag.fromPage,
              to_page: navDiag.toPage,
              source,
              click_to_load_ms: Math.round((navDiag.loadStartAt || navDiag.clickAt || 0) - (navDiag.clickAt || 0)),
              load_to_fetch_ms: Math.round((navDiag.fetchStartAt || navDiag.loadStartAt || 0) - (navDiag.loadStartAt || 0)),
              fetch_ms: Math.round((navDiag.fetchEndAt || navDiag.doneAt || 0) - (navDiag.fetchStartAt || navDiag.loadStartAt || 0)),
              post_fetch_ms: Math.round((navDiag.doneAt || 0) - (navDiag.fetchEndAt || navDiag.doneAt || 0)),
              total_ms: Math.round((navDiag.doneAt || 0) - (navDiag.clickAt || 0)),
            })
          }
          pageNavDiagRef.current = null
        }
        setQueueLoading(false)
        setLoading(false)
      }
    }
  }, [fetchImportFattureQueueRows, fatturePage, getQueuePageCacheKey, getQueueScopeKey, applyQueuePageFromAllRowsCache])

  const changeFatturePage = useCallback(
    (nextPage) => {
      const target = Number.isFinite(Number(nextPage)) ? Math.floor(Number(nextPage)) : 0
      if (target <= 0 || target === fatturePage) return
      if (isImportFatturePageDiagEnabled()) {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now()
        pageNavDiagRef.current = {
          fromPage: fatturePage,
          toPage: target,
          clickAt: now,
          loadStartAt: 0,
          fetchStartAt: 0,
          fetchEndAt: 0,
          doneAt: 0,
        }
        console.info('[import_page_diag] click', {
          from_page: fatturePage,
          to_page: target,
        })
      }
      // Show busy state immediately, then schedule page state update as a transition to keep UI responsive.
      setQueueLoading(true)
      if (typeof window !== 'undefined' && typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(() => {
          startPageTransition(() => {
            setFatturePage(target)
          })
        })
        return
      }
      startPageTransition(() => {
        setFatturePage(target)
      })
    },
    [fatturePage, startPageTransition],
  )

  const resolveNoMatchRow = useCallback(async (
    item,
    {
      decision,
      applySameVat = false,
      existingContoId = '',
      professionistaConRitenuta = false,
    } = {},
  ) => {
    if (!item?.id || !societaId) return
    const rowId = String(item.id)
    setNoMatchBusyId(rowId)
    setNoMatchQueueError('')
    try {
      void decision
      void applySameVat
      void existingContoId
      void professionistaConRitenuta
      setNoMatchQueue((prev) => prev.filter((x) => String(x?.id || '') !== rowId))
    } catch (error) {
      setNoMatchQueueError(error?.message || 'Errore risoluzione no-match')
    } finally {
      setNoMatchBusyId('')
    }
  }, [societaId])

  const decideAnagraficaUpdateRow = useCallback(async (item, decision) => {
    if (!item?.id || !societaId) return
    const rowId = String(item.id)
    setAnagraficaUpdateBusyId(rowId)
    setAnagraficaUpdateError('')
    try {
      void decision
      setAnagraficaUpdateQueue((prev) => prev.filter((x) => String(x?.id || '') !== rowId))
    } catch (error) {
      setAnagraficaUpdateError(error?.message || 'Errore decisione proposta')
    } finally {
      setAnagraficaUpdateBusyId('')
    }
  }, [societaId])

  useEffect(() => {
    queuePageCacheRef.current.clear()
    queueAllRowsCacheRef.current = { scopeKey: '', rows: [], totalRows: 0, at: 0 }
    queuePageInflightRef.current.clear()
    queueLoadRequestSeqRef.current += 1
    setFatturePage(1)
  }, [societaId, codaVista, preparazioneFilter, lavorazioneCheckFilter, stepCandidateFilter, confermaPassoFilter])

  const handleFattureFiles = useCallback(
    async (fileList) => {
      let diag = false
      try {
        diag = window?.localStorage?.getItem('FISCOSIM_IMPORT_ZIP_DIAG') === '1'
      } catch {
        diag = false
      }
      if (!societaId) {
        setFattureUploadHint('Seleziona prima la società.')
        return
      }
      const { allowed, rejectedNames } = filterRootFilesForFattureImport(fileList)
      if (diag) {
        const names = Array.from(allowed || []).map((f) => f?.name).filter(Boolean)
        console.info('[import_zip_diag] ImportFatture root selection', {
          societaId,
          allowed: names.length,
          allowed_names: names,
          rejected: rejectedNames.length,
        })
      }
      if (rejectedNames.length) {
        window.alert(
          `In Import Fatture sono ammessi solo XML, PDF, ZIP o P7M. Esclusi: ${rejectedNames.slice(0, 10).join(', ')}${
            rejectedNames.length > 10 ? '…' : ''
          }`
        )
      }
      if (!allowed.length) return

      setFattureUploading(true)
      setFattureUploadHint('')
      setLastFattureUploadSummary(null)
      setLastFattureEnrichmentJob(null)
      try {
        const inspection = await inspectImportedFilesForFatture({
          fileList: allowed,
          societaId,
          alert: window.alert,
        })
        if (diag) {
          const dups = inspection?.duplicates || []
          const dupByReason = dups.reduce((acc, d) => {
            const k = d?.duplicateReason || 'unknown'
            acc[k] = (acc[k] || 0) + 1
            return acc
          }, {})
          console.info('[import_zip_diag] ImportFatture inspect', {
            summary: inspection?.summary,
            toProcess: (inspection?.toProcess || []).length,
            newFiles: (inspection?.newFiles || []).length,
            duplicates: dups.length,
            duplicates_by_reason: dupByReason,
          })
        }

        // Import Fatture: non usare `newFiles` (che esclude tutto ciò che l'ispezione marca duplicato).
        // Serve processare l'intero batch espanso (come Import Documenti) e lasciare a `processImportedFile`
        // il comportamento di skip/reimport, così lo ZIP non viene "tagliato" prima del processing.
        let workBatch = Array.isArray(inspection.toProcess) ? inspection.toProcess : []
        if (!workBatch.length && (inspection.duplicates || []).length > 0) {
          const dups = inspection.duplicates || []
          const onlyBatch = dups.length > 0 && dups.every((d) => d.duplicateReason === 'batch_duplicate')
          const onlyArchivio = dups.length > 0 && dups.every((d) => d.duplicateReason === 'existing_document')
          if (onlyBatch) {
            window.alert('Nessun file da importare: stesso nome file ripetuto più volte nella selezione corrente.')
          } else if (onlyArchivio) {
            window.alert(
              'Nessun file da importare: il nome file è già associato a un documento in archivio contabile (in lavorazione o già registrato). Rinomina il file o gestisci il documento dal modulo Contabilità.'
            )
          } else {
            window.alert(
              'Nessun file da importare: duplicato per nome rispetto all’archivio contabile o selezione ripetuta.'
            )
          }
          return
        }
        if (!workBatch.length) {
          window.alert('Nessun file da elaborare.')
          return
        }

        const { filtered, skippedNames } = filterExpandedItemsForFattureStaging(workBatch, {
          onSkipped: (names) => {
            if (names?.length) {
              window.alert(
                `Esclusi dalla coda fatture (solo XML/PDF in questo modulo; niente immagini nello ZIP): ${names
                  .slice(0, 12)
                  .join(', ')}${names.length > 12 ? '…' : ''}`
              )
            }
          },
        })
        if (diag) {
          const preflight = (filtered || []).filter((x) => x?.preflightError).length
          console.info('[import_zip_diag] ImportFatture post-filter', {
            workBatch: workBatch.length,
            filtered: filtered.length,
            filtered_preflight_error: preflight,
            skippedNames: skippedNames.length,
          })
        }

        if (!filtered.length) {
          if (skippedNames.length) {
            window.alert('Nessun file XML/PDF rimasto dopo i filtri.')
          } else {
            window.alert('Nessun file da elaborare.')
          }
          return
        }

        const summary = await processImportedFiles({
          fileList: [],
          preprocessedFiles: filtered,
          societaId,
          utente,
          aiEnabled: false,
          aiMode,
          aiPreprocessMode,
          tipoManuale: '',
          pianoConti,
          causaliIva,
          causaliContabili,
          clienti,
          ai,
          confirm: window.confirm,
          alert: window.alert,
          onProgress: setFattureUploadProgress,
          duplicatePolicy: 'skip',
          invoiceImportOnly: true,
          replaceImportStagingWithSameFilename: true,
        })
        if (diag) {
          console.info('[import_zip_diag] ImportFatture processImportedFiles summary', summary)
        }
        if (summary) setLastFattureUploadSummary(summary)
      } catch (e) {
        console.error('[Import Fatture] upload', e)
        window.alert(e?.message || String(e))
      } finally {
        setFattureUploading(false)
        setFattureUploadProgress(null)
        void loadQueue()
      }
    },
    [
      societaId,
      utente,
      aiEnabled,
      aiMode,
      aiPreprocessMode,
      pianoConti,
      causaliIva,
      causaliContabili,
      clienti,
      ai,
      loadQueue,
    ]
  )

  useEffect(() => {
    void loadQueue()
  }, [loadQueue])

  useEffect(() => {
    const el = fattureDropRef.current
    if (!el) return
    const over = (e) => {
      e.preventDefault()
      if (societaId) setDragOverFatture(true)
    }
    const leave = () => setDragOverFatture(false)
    const drop = (e) => {
      e.preventDefault()
      setDragOverFatture(false)
      void handleFattureFiles(e.dataTransfer.files)
    }
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragover', over)
      el.removeEventListener('dragleave', leave)
      el.removeEventListener('drop', drop)
    }
  }, [societaId, handleFattureFiles])

  useEffect(() => {
    if (!societaId) {
      setPianoConti([])
      setCausaliIva([])
      setCausaliContabili([])
      setClienti([])
      return
    }
    let cancelled = false
    Promise.all([
      importRepo.getPianoContiBySocieta(societaId),
      importRepo.getCausaliIvaAttive(societaId),
      importRepo.getCausaliContabiliBySocieta(societaId),
      importRepo.getClientiAttivi(),
    ]).then(([pc, ci, cc, cl]) => {
      if (cancelled) return
      setPianoConti(Array.isArray(pc.data) ? pc.data : [])
      setCausaliIva(Array.isArray(ci.data) ? ci.data : [])
      setCausaliContabili(Array.isArray(cc.data) ? cc.data : [])
      setClienti(Array.isArray(cl.data) ? cl.data : [])
    })
    return () => {
      cancelled = true
    }
  }, [societaId])

  useEffect(() => {
    if (!societaId) {
      setHistoricalLearningRows((prev) => (prev.length ? [] : prev))
      return
    }
    let alive = true
    let idleId = null
    let timerId = null
    const run = () => {
      contabilitaRepo.getArchivioStoricoAiLearning([societaId], { limit: 5000 }).then(({ data, error }) => {
        if (!alive) return
        if (error) {
          setHistoricalLearningRows((prev) => (prev.length ? [] : prev))
          return
        }
        const next = Array.isArray(data) ? data : []
        setHistoricalLearningRows((prev) => {
          const prevIds = (prev || []).map((x) => String(x?.id || ''))
          const nextIds = next.map((x) => String(x?.id || ''))
          return areStringArrayEqual(prevIds, nextIds) ? prev : next
        })
      })
    }
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(run, { timeout: 800 })
    } else {
      timerId = window.setTimeout(run, 180)
    }
    return () => {
      alive = false
      if (idleId != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timerId != null) {
        window.clearTimeout(timerId)
      }
    }
  }, [societaId])

  const historicalPrefetchRows = useMemo(() => {
    const visibleSample = Array.isArray(filteredRows) ? filteredRows.slice(0, IMPORT_FATTURE_HISTORICAL_PREFETCH_ROWS) : []
    if (!panelRow?.id) return visibleSample
    const hasPanel = visibleSample.some((row) => row?.id === panelRow.id)
    return hasPanel || !panelRow ? visibleSample : [panelRow, ...visibleSample].slice(0, IMPORT_FATTURE_HISTORICAL_PREFETCH_ROWS + 1)
  }, [filteredRows, panelRow])

  const rowsHistoricalSignature = useMemo(
    () =>
      historicalPrefetchRows
        .map(
          (r) =>
            `${String(r?.id || '')}|${String(r?.soggetto_piva || '')}|${String(r?.soggetto_cf || '')}|${String(
              r?.soggetto_denominazione || '',
            )}|${String(r?.tipo_documento || '')}|${String(r?.accounting_status || '')}`,
        )
        .join('~'),
    [historicalPrefetchRows],
  )

  const historicalPrefetchPlan = useMemo(() => {
    if (!societaId || !historicalPrefetchRows.length || !pianoConti.length) {
      return { byKey: new Map(), rowById: new Map(), orderedKeys: [] }
    }
    const byKey = new Map()
    const rowById = new Map()
    for (const r of historicalPrefetchRows) {
      rowById.set(r.id, r)
      const snap = buildDocSnapshotForContoMatch(r)
      const hid = extractHistoricalSearchIdentity(snap)
      const k = String(hid.piva || hid.cf || hid.nomeLike || '').trim()
      if (!k) continue
      if (!byKey.has(k)) byKey.set(k, [])
      byKey.get(k).push(r.id)
    }
    let orderedKeys = [...byKey.keys()].slice(0, 24)
    if (panelRow?.id) {
      const panel = rowById.get(panelRow.id)
      if (panel) {
        const snap = buildDocSnapshotForContoMatch(panel)
        const hid = extractHistoricalSearchIdentity(snap)
        const panelKey = String(hid.piva || hid.cf || hid.nomeLike || '').trim()
        if (panelKey && orderedKeys.includes(panelKey)) {
          orderedKeys = [panelKey, ...orderedKeys.filter((k) => k !== panelKey)]
        }
      }
    }
    return { byKey, rowById, orderedKeys }
  }, [societaId, pianoConti.length, rowsHistoricalSignature, panelRow?.id, historicalPrefetchRows])

  /** Prefetch storico conto per le righe in coda (dedup per controparte), allineato a Import Documenti. */
  useEffect(() => {
    let cancelled = false
    const shouldPrefetchListHistory = queueFullView && codaVista === 'pronte' && !queueLoading
    if (!shouldPrefetchListHistory || !societaId || !historicalPrefetchRows.length || !pianoConti.length) {
      setHistoricalContoTopByImportId((prev) => (Object.keys(prev).length ? {} : prev))
      setHistoricalCausaleContabileIdByImportId((prev) => (Object.keys(prev).length ? {} : prev))
      setHistoricalIvaTopByImportId((prev) => (Object.keys(prev).length ? {} : prev))
      return () => {
        cancelled = true
      }
    }
    const { byKey, rowById, orderedKeys } = historicalPrefetchPlan
    if (!orderedKeys.length) {
      setHistoricalContoTopByImportId((prev) => (Object.keys(prev).length ? {} : prev))
      setHistoricalCausaleContabileIdByImportId((prev) => (Object.keys(prev).length ? {} : prev))
      setHistoricalIvaTopByImportId((prev) => (Object.keys(prev).length ? {} : prev))
      return () => {
        cancelled = true
      }
    }
    const runPrefetch = async () => {
      const next = {}
      const nextCaus = {}
      const nextIva = {}
      for (let i = 0; i < orderedKeys.length; i += 1) {
        if (cancelled) return
        const k = orderedKeys[i]
        const rowIds = byKey.get(k) || []
        const sample = rowById.get(rowIds[0])
        if (!sample) continue
        const snap = buildDocSnapshotForContoMatch(sample)
        const hid = extractHistoricalSearchIdentity(snap)
        try {
          const { data, error } = await importRepo.getHistoricalConfirmedDocumentsForCounterparty({
            societaId,
            piva: hid.piva,
            cf: hid.cf,
            nomeLike: hid.nomeLike || hid.nome,
            limit: IMPORT_FATTURE_HISTORICAL_QUERY_LIMIT,
          })
          if (error || cancelled) continue
          const suggestions = buildHistoricalContoSuggestions({
            historicalDocs: data || [],
            learningRows: historicalLearningRowsCapped,
            pianoConti,
            maxResults: 3,
            sourceLabel: 'Documenti confermati stessa controparte',
            currentDoc: snap,
            currentSocietaId: societaId,
          })
          const top = String(suggestions[0]?.codice || '').trim()
          const topCaus = pickDominantHistoricalCausaleContabileId(data || [], causaliContabili)
          const historicalIvaTop = pickHistoricalStrongIvaHint(data || [])
          for (const id of rowIds) {
            if (top) next[id] = top
            if (topCaus) nextCaus[id] = topCaus
            if (historicalIvaTop?.id) {
              nextIva[id] = historicalIvaTop
            }
          }
          if (i > 0 && i % 4 === 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 0))
          }
        } catch {
          /* ignore */
        }
      }
      if (!cancelled) {
        setHistoricalContoTopByImportId((prev) => (arePlainRecordEqual(prev, next) ? prev : next))
        setHistoricalCausaleContabileIdByImportId((prev) => (arePlainRecordEqual(prev, nextCaus) ? prev : nextCaus))
        setHistoricalIvaTopByImportId((prev) => (arePlainRecordEqual(prev, nextIva) ? prev : nextIva))
      }
    }

    let idleId = null
    let timerId = null
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      idleId = window.requestIdleCallback(() => {
        void runPrefetch()
      }, { timeout: 700 })
    } else {
      timerId = window.setTimeout(() => {
        void runPrefetch()
      }, 140)
    }

    return () => {
      cancelled = true
      if (idleId != null && typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
      }
      if (timerId != null) {
        window.clearTimeout(timerId)
      }
    }
  }, [historicalPrefetchPlan, historicalPrefetchRows.length, societaId, pianoConti.length, historicalLearningRowsCapped, causaliContabili, queueFullView, codaVista, queueLoading])

  useEffect(() => {
    const shouldLoadPanelHistory = codaVista === 'pronte' && queueFullView && !queueLoading
    if (!shouldLoadPanelHistory || !panelRow?.id || !isProntaLavorazioneRow(panelRow) || !societaId) {
      setHistoricalDocsForPanel([])
      setSuggestionsLoading(false)
      return
    }
    const hid = extractHistoricalSearchIdentity(buildDocSnapshotForContoMatch(panelRow))
    if (!hid.piva && !hid.cf && !hid.nomeLike) {
      setHistoricalDocsForPanel([])
      setSuggestionsLoading(false)
      return
    }
    let alive = true
    setSuggestionsLoading(true)
    importRepo
      .getHistoricalConfirmedDocumentsForCounterparty({
        societaId,
        piva: hid.piva,
        cf: hid.cf,
        nomeLike: hid.nomeLike || hid.nome,
        limit: IMPORT_FATTURE_HISTORICAL_QUERY_LIMIT,
      })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          setHistoricalDocsForPanel([])
          return
        }
        setHistoricalDocsForPanel(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (alive) setHistoricalDocsForPanel([])
      })
      .finally(() => {
        if (alive) setSuggestionsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [
    panelRow?.id,
    panelRow?.soggetto_piva,
    panelRow?.soggetto_cf,
    panelRow?.soggetto_denominazione,
    panelRow?.updated_at,
    societaId,
    queueFullView,
    codaVista,
    queueLoading,
  ])

  useEffect(() => {
    if (!previewOpen || !previewDoc?.file_path) {
      setPreviewSignedUrl('')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await sb.storage.from('documenti').createSignedUrl(previewDoc.file_path, 3600)
        if (!alive) return
        if (!error && data?.signedUrl) {
          setPreviewSignedUrl(data.signedUrl)
          return
        }
      } catch {
        /* fall through */
      }
      if (!alive) return
      try {
        const out = importRepo.getDocumentoPublicUrl(previewDoc.file_path)
        setPreviewSignedUrl(out?.data?.publicUrl || out?.publicUrl || '')
      } catch {
        setPreviewSignedUrl('')
      }
    })()
    return () => {
      alive = false
    }
  }, [previewOpen, previewDoc?.file_path])

  const onSocietaChange = (value) => {
    setSocietaId(value)
    persistSelectedSocieta(value, { utente })
    setPanelRowId(null)
    setCheckedRowIds([])
    setCodaVista('tutte')
    setPreparazioneFilter('tutte')
  }

  const openPreview = useCallback((doc) => {
    setPreviewDoc(doc)
    setPreviewOpen(true)
  }, [])

  useEffect(() => {
    if (!previewOpen || !previewDoc?.id) return
    if (hasFullImportFatturePayload(previewDoc)) return
    setPreviewDoc((prev) => prev)
  }, [previewOpen, previewDoc])

  const panelFilePath = useMemo(
    () => String(panelRow?.file_path || panelRow?.source_storage_path || '').trim(),
    [panelRow?.file_path, panelRow?.source_storage_path],
  )

  const panelOriginalKind = useMemo(() => {
    const kind = String(panelRow?.source_kind || panelRow?.mime_type || '').toLowerCase()
    const path = String(panelFilePath || '').toLowerCase()
    if (kind === 'pdf' || path.endsWith('.pdf')) return 'pdf'
    if (kind === 'xml' || path.endsWith('.xml')) return 'xml'
    if (kind === 'p7m' || path.endsWith('.p7m')) return 'p7m'
    return 'other'
  }, [panelRow?.source_kind, panelRow?.mime_type, panelFilePath])

  useEffect(() => {
    if (!panelFilePath) {
      setPanelPreviewUrl('')
      return
    }
    let alive = true
    ;(async () => {
      try {
        const { data, error } = await sb.storage.from('documenti').createSignedUrl(panelFilePath, 3600)
        if (!alive) return
        if (!error && data?.signedUrl) {
          setPanelPreviewUrl(data.signedUrl)
          return
        }
      } catch {
        /* fall through */
      }
      if (!alive) return
      try {
        const out = importRepo.getDocumentoPublicUrl(panelFilePath)
        setPanelPreviewUrl(out?.data?.publicUrl || out?.publicUrl || '')
      } catch {
        setPanelPreviewUrl('')
      }
    })()
    return () => {
      alive = false
    }
  }, [panelFilePath])

  const toggleRowChecked = useCallback((id, checked) => {
    setCheckedRowIds((prev) => {
      const has = prev.includes(id)
      if (checked && !has) return [...prev, id]
      if (!checked && has) return prev.filter((x) => x !== id)
      return prev
    })
  }, [])

  const tableInlineBusy = loading || markBusy || accSaveBusy || opSaveBusy || fattureUploading
  const tableInlineKey = tableInlineEdit ? `${tableInlineEdit.rowId}:${tableInlineEdit.field}` : ''
  const inlineEditRowId = tableInlineEdit?.rowId || ''
  const inlineEditField = tableInlineEdit?.field || ''
  const startTableInlineEdit = useCallback(
    (rowId, field, query = '') => {
      if (tableInlineBusy) return
      if (!rowId || !field) return
      setTableInlineEdit({ rowId, field })
      setTableInlineQuery(query)
    },
    [tableInlineBusy],
  )
  const closeTableInlineEdit = useCallback(() => {
    if (tableInlineBusy) return
    setTableInlineEdit(null)
    setTableInlineQuery('')
  }, [tableInlineBusy])

  const allVisibleRowsChecked =
    filteredRows.length > 0 && filteredRows.every((r) => checkedRowIdSet.has(r.id))
  const tableResetScrollKey = `${fatturePage}|${codaVista}|${preparazioneFilter}|${lavorazioneCheckFilter}|${stepCandidateFilter}|${confermaPassoFilter}|${tableSearch}|${tableSortBy}|${tableSortDir}`
  const toggleSelectAllVisible = () => {
    const visIds = filteredRows.map((r) => r.id)
    const visSet = new Set(visIds)
    if (allVisibleRowsChecked) {
      setCheckedRowIds((prev) => prev.filter((id) => !visSet.has(id)))
    } else {
      setCheckedRowIds((prev) => Array.from(new Set([...prev, ...visIds])))
    }
  }

  const selectSameCounterpartyAsPanel = () => {
    const ref = panelRow
    if (!ref) return
    const key = counterpartyMatchKey(ref)
    const next = rows.filter((r) => counterpartyMatchKey(r) === key).map((r) => r.id)
    setCheckedRowIds((prev) => {
      if (prev.length === next.length && prev.every((id, idx) => id === next[idx])) return prev
      return next
    })
  }

  const openNextPanelRow = () => {
    if (!filteredRows.length) return
    const idx = panelRowId ? filteredRows.findIndex((r) => r.id === panelRowId) : -1
    const nextIdx = idx >= 0 ? (idx + 1) % filteredRows.length : 0
    setPanelRowId(filteredRows[nextIdx].id)
  }

  const exportCurrentListCsv = useCallback(() => {
    if (!filteredRows.length) {
      window.alert('Nessuna riga da esportare nella vista corrente.')
      return
    }
    const head = ['Data', 'Numero', 'Soggetto', 'Imponibile', 'IVA', 'Totale', 'Stato', 'Causale contabile', 'Conto']
    const lines = [head.map(escapeCsvCell).join(';')]
    for (const r of filteredRows) {
      const nd = effectiveNumeroData(r)
      const ivaTriple = effectiveIvaTripleStrings(r)
      const ap = getAccountingProposalsObj(r)
      const rowEval = rowEvalById.get(r.id)
      const contoCod = String(
        pickImportFatturaStagingContoCodice(
          r,
          pianoConti,
          String(historicalContoTopByImportId[r.id] || '').trim(),
        ) || '',
      ).trim()
      const causaleContId = String(
        pickImportFatturaStagingCausaleContabileId(
          r,
          causaliContabili,
          [],
          String(historicalCausaleContabileIdByImportId[r.id] || '').trim(),
        ) || '',
      ).trim()
      const causale = causaleContId
        ? causaliContabiliById.get(causaleContId)
        : null
      const stato = rowEval?.diag?.level === 'ok'
        ? 'Pronta'
        : rowEval?.pronta
          ? 'Da verificare'
          : 'Incompleta'
      lines.push(
        [
          nd.data,
          nd.num,
          effectiveControparte(r),
          ivaTriple.imponibile,
          ivaTriple.iva,
          effectiveTotaleDisplay(r),
          stato,
          causale ? `${causale.codice || ''} ${causale.descrizione || ''}`.trim() : String(ap.causale_id || ''),
          contoCod,
        ]
          .map(escapeCsvCell)
          .join(';'),
      )
    }
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8' })
    downloadBlobAsFile(blob, `import-fatture-${stamp}.csv`)
  }, [
    filteredRows,
    rowEvalById,
    pianoConti,
    historicalContoTopByImportId,
    causaliContabili,
    historicalCausaleContabileIdByImportId,
    causaliContabiliById,
  ])

  const exportCurrentListExcel = useCallback(() => {
    if (!filteredRows.length) {
      window.alert('Nessuna riga da esportare nella vista corrente.')
      return
    }
    const data = []
    for (const r of filteredRows) {
      const nd = effectiveNumeroData(r)
      const ivaTriple = effectiveIvaTripleStrings(r)
      const ap = getAccountingProposalsObj(r)
      const rowEval = rowEvalById.get(r.id)
      const contoCod = String(
        pickImportFatturaStagingContoCodice(
          r,
          pianoConti,
          String(historicalContoTopByImportId[r.id] || '').trim(),
        ) || '',
      ).trim()
      const causaleContId = String(
        pickImportFatturaStagingCausaleContabileId(
          r,
          causaliContabili,
          [],
          String(historicalCausaleContabileIdByImportId[r.id] || '').trim(),
        ) || '',
      ).trim()
      const causale = causaleContId
        ? causaliContabiliById.get(causaleContId)
        : null
      const stato = rowEval?.diag?.level === 'ok'
        ? 'Pronta'
        : rowEval?.pronta
          ? 'Da verificare'
          : 'Incompleta'
      data.push({
        Data: nd.data,
        Numero: nd.num,
        Soggetto: effectiveControparte(r),
        Imponibile: ivaTriple.imponibile,
        IVA: ivaTriple.iva,
        Totale: effectiveTotaleDisplay(r),
        Stato: stato,
        'Causale contabile': causale ? `${causale.codice || ''} ${causale.descrizione || ''}`.trim() : String(ap.causale_id || ''),
        Conto: contoCod,
      })
    }
    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'ImportFatture')
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const excel = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
    const blob = new Blob(
      [excel],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    )
    downloadBlobAsFile(blob, `import-fatture-${stamp}.xlsx`)
  }, [
    filteredRows,
    rowEvalById,
    pianoConti,
    historicalContoTopByImportId,
    causaliContabili,
    historicalCausaleContabileIdByImportId,
    causaliContabiliById,
  ])

  useEffect(() => {
    const r = rows.find((x) => x.id === panelRowId)
    if (!r || !queueFullView || !isProntaLavorazioneRow(r)) return
    const o = getOperativeOverridesObj(r)
    const nd = effectiveNumeroData(r)
    const raw = parseAiRaw(r)
    setOpDraft({
      controparte: effectiveControparte(r),
      numero_documento: nd.num === '—' ? '' : nd.num,
      data_documento: nd.data === '—' ? '' : nd.data,
      totale: (() => {
        if (o.totale != null && String(o.totale).trim() !== '') return String(o.totale).trim()
        if (raw.totale != null && Number.isFinite(Number(raw.totale))) return String(raw.totale)
        return ''
      })(),
    })
  }, [panelRowId, rows, codaVista])

  useEffect(() => {
    const r = rows.find((x) => x.id === panelRowId)
    if (!r || !queueFullView || !isProntaLavorazioneRow(r)) return
    const ap = getAccountingProposalsObj(r)
    const savedConto = ap.conto_codice != null ? String(ap.conto_codice).trim() : ''
    const topHistRow = String(historicalContoTopByImportId[r.id] || '').trim()
    const mergedConto = pickImportFatturaStagingContoCodice(r, pianoConti, topHistRow)
    const savedCausCont = ap.causale_id != null ? String(ap.causale_id).trim() : ''
    const domHistCaus = String(historicalCausaleContabileIdByImportId[r.id] || '').trim()
    const mergedCausCont = pickImportFatturaStagingCausaleContabileId(
      r,
      causaliContabili,
      historicalDocsForPanel,
      domHistCaus,
    )
    setContDraft({
      conto_codice: savedConto || mergedConto,
      causale_iva_id:
        ap.causale_iva_id != null && String(ap.causale_iva_id).trim() !== ''
          ? String(ap.causale_iva_id).trim()
          : String(ivaProposal?.suggestedCausaleId || '').trim(),
      causale_contabile_id: savedCausCont || mergedCausCont,
    })
    setBozzaFonte({
      conto: null,
      causale:
        ap.causale_iva_id != null && String(ap.causale_iva_id).trim() !== ''
          ? null
          : ivaProposal?.source === 'anagrafica'
            ? 'anagrafica'
          : ivaProposal?.source === 'history'
            ? 'storico'
            : ivaProposal?.source === 'document'
              ? 'documento'
              : ivaProposal?.source === 'default_percentuale'
                ? 'default_percentuale'
              : null,
      iva: null,
    })
  }, [
    panelRowId,
    rows,
    codaVista,
    pianoConti,
    historicalContoTopByImportId,
    historicalCausaleContabileIdByImportId,
    causaliContabili,
    historicalDocsForPanel,
    ivaProposal,
  ])

  useEffect(() => {
    const r = rows.find((x) => x.id === panelRowId)
    if (!r || !queueFullView || !isProntaLavorazioneRow(r)) return
    const o = getIvaOverridesObj(r)
    const ai = ivaAiFirstRowStrings(r)
    setIvaDraft({
      imponibile: o.imponibile != null && String(o.imponibile).trim() !== '' ? String(o.imponibile).trim() : ai.imponibile,
      iva: o.iva != null && String(o.iva).trim() !== '' ? String(o.iva).trim() : ai.iva,
      detraibilita_iva:
        o.detraibilita_iva != null && String(o.detraibilita_iva).trim() !== ''
          ? String(o.detraibilita_iva).trim()
          : ai.detraibilita_iva,
    })
  }, [panelRowId, rows, codaVista])

  useEffect(() => {
    pnGridTouchedRef.current = false
    ivaGridTouchedRef.current = false
  }, [panelRowId])

  useEffect(() => {
    const r = rows.find((x) => x.id === panelRowId)
    if (!r || !queueFullView || !isProntaLavorazioneRow(r)) {
      setPnGridRows([])
      return
    }
    if (pnGridTouchedRef.current) return
    const ap = getAccountingProposalsObj(r)
    const stored = ap[WORKING_PN_GRID_KEY]
    if (Array.isArray(stored) && stored.length) {
      setPnGridRows(normalizeStoredPnGrid(stored))
      return
    }
    const o = getIvaOverridesObj(r)
    const ai = ivaAiFirstRowStrings(r)
    const impUi = o.imponibile != null && String(o.imponibile).trim() !== '' ? String(o.imponibile).trim() : ai.imponibile
    const ivaUi = o.iva != null && String(o.iva).trim() !== '' ? String(o.iva).trim() : ai.iva
    const effCausCont =
      String(contDraft.causale_contabile_id || '').trim() ||
      pickImportFatturaStagingCausaleContabileId(
        r,
        causaliContabili,
        historicalDocsForPanel,
        String(historicalCausaleContabileIdByImportId[r.id] || '').trim(),
      )
    setPnGridRows(
      buildDefaultPnGridForDoc(
        r,
        contDraft.conto_codice,
        contDraft.causale_iva_id,
        impUi,
        ivaUi,
        pianoConti,
        causaliIva,
        causaliContabili,
        effCausCont,
      ),
    )
  }, [
    panelRowId,
    rows,
    codaVista,
    pianoConti,
    causaliIva,
    causaliContabili,
    contDraft.conto_codice,
    contDraft.causale_iva_id,
    contDraft.causale_contabile_id,
    historicalDocsForPanel,
    historicalCausaleContabileIdByImportId,
    ivaDraft.imponibile,
    ivaDraft.iva,
  ])

  useEffect(() => {
    const r = rows.find((x) => x.id === panelRowId)
    if (!r || !queueFullView || !isProntaLavorazioneRow(r)) {
      setIvaGridRows([])
      return
    }
    if (ivaGridTouchedRef.current) return
    const o = getIvaOverridesObj(r)
    const stored = o[WORKING_IVA_GRID_KEY]
    if (Array.isArray(stored) && stored.length) {
      setIvaGridRows(normalizeStoredIvaGrid(stored))
      return
    }
    const eff = effectiveIvaTripleStrings(r)
    setIvaGridRows(buildDefaultIvaGridForDoc(r, contDraft.causale_iva_id, eff, ivaProposal))
  }, [panelRowId, rows, codaVista, contDraft.causale_iva_id, causaliIva, ivaProposal])

  const salvaDatiOperativi = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setOpSaveBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const prev =
          base[META.OPERATIVE_OVERRIDES] && typeof base[META.OPERATIVE_OVERRIDES] === 'object'
            ? { ...base[META.OPERATIVE_OVERRIDES] }
            : {}
        const next = { ...prev }
        const trim = (s) => String(s ?? '').trim()
        if (trim(opDraft.controparte) === '') delete next.controparte
        else next.controparte = trim(opDraft.controparte)
        if (trim(opDraft.numero_documento) === '') delete next.numero_documento
        else next.numero_documento = trim(opDraft.numero_documento)
        if (trim(opDraft.data_documento) === '') delete next.data_documento
        else next.data_documento = trim(opDraft.data_documento)
        if (trim(opDraft.totale) === '') delete next.totale
        else next.totale = trim(opDraft.totale)
        const cleaned = {}
        for (const k of Object.keys(next)) {
          if (next[k] != null && String(next[k]).trim() !== '') cleaned[k] = next[k]
        }
        const out = { ...base }
        if (Object.keys(cleaned).length === 0) {
          delete out[META.OPERATIVE_OVERRIDES]
          delete out[META.OPERATIVE_OVERRIDES_AT]
        } else {
          out[META.OPERATIVE_OVERRIDES] = cleaned
          out[META.OPERATIVE_OVERRIDES_AT] = new Date().toISOString()
        }
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setOpSaveBusy(false)
    }
  }

  const ripristinaDatiOperativi = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setOpSaveBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const out = { ...base }
        delete out[META.OPERATIVE_OVERRIDES]
        delete out[META.OPERATIVE_OVERRIDES_AT]
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setOpSaveBusy(false)
    }
  }

  const salvaDatiContabiliProposti = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setAccSaveBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const prev =
          base[META.ACCOUNTING_PROPOSALS] && typeof base[META.ACCOUNTING_PROPOSALS] === 'object'
            ? { ...base[META.ACCOUNTING_PROPOSALS] }
            : {}
        const next = { ...prev }
        const trim = (s) => String(s ?? '').trim()
        const ccFromGrid = pnGridRows[0]?.conto != null ? leadingContoCodiceFromCell(pnGridRows[0].conto) : ''
        const contoCodiceToSave = trim(contDraft.conto_codice) || trim(ccFromGrid)
        if (contoCodiceToSave === '') delete next.conto_codice
        else next.conto_codice = contoCodiceToSave
        if (trim(contDraft.causale_iva_id) === '') delete next.causale_iva_id
        else next.causale_iva_id = trim(contDraft.causale_iva_id)
        if (trim(contDraft.causale_contabile_id) === '') delete next.causale_id
        else next.causale_id = trim(contDraft.causale_contabile_id)
        const gridBlob = serializePnGridForBlob(pnGridRows).filter(
          (row) => row.conto || row.dare || row.avere || row.nota,
        )
        if (gridBlob.length) next[WORKING_PN_GRID_KEY] = gridBlob
        else delete next[WORKING_PN_GRID_KEY]
        const cleaned = cleanedAccountingProposalsBag(next)
        const out = { ...base }
        if (Object.keys(cleaned).length === 0) {
          delete out[META.ACCOUNTING_PROPOSALS]
          delete out[META.ACCOUNTING_PROPOSALS_AT]
        } else {
          out[META.ACCOUNTING_PROPOSALS] = cleaned
          out[META.ACCOUNTING_PROPOSALS_AT] = new Date().toISOString()
        }
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      pnGridTouchedRef.current = false
      setAccSaveBusy(false)
    }
  }

  const ripristinaDatiContabiliProposti = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setAccSaveBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const out = { ...base }
        delete out[META.ACCOUNTING_PROPOSALS]
        delete out[META.ACCOUNTING_PROPOSALS_AT]
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      pnGridTouchedRef.current = false
      ivaGridTouchedRef.current = false
      setAccSaveBusy(false)
    }
  }

  const persistTableRowAccountingPatch = useCallback(
    async (docId, patch) => {
      if (!docId) return
      setTableInlineSaveId(docId)
      try {
        const { error } = await importRepo.mergeDocumentoImportAiRawResponse(docId, (base) =>
          mergeInlineAccountingPatchIntoAiRaw(base, patch),
        )
        if (error) throw error
        setRows((prev) => {
          let changed = false
          const next = (prev || []).map((row) => {
            if (row?.id !== docId) return row
            changed = true
            return {
              ...row,
              ai_raw_response: mergeInlineAccountingPatchIntoAiRaw(parseAiRaw(row), patch),
            }
          })
          return changed ? next : prev
        })
        setTableInlineEdit(null)
        setTableInlineQuery('')
      } catch (e) {
        window.alert(e?.message || String(e))
      } finally {
        setTableInlineSaveId(null)
      }
    },
    [],
  )

  useEffect(() => {
    if (!tableInlineEdit) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setTableInlineEdit(null)
        setTableInlineQuery('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tableInlineEdit])

  useEffect(() => {
    setTableInlineEdit(null)
    setTableInlineQuery('')
  }, [codaVista])

  useEffect(() => {
    setPnGridContoEditRowId(null)
    setPnGridContoQuery('')
    setImportPnPianoModalRowId(null)
    setPnPianoModalQuery('')
  }, [codaVista, panelRowId])

  useEffect(() => {
    if (!pnGridContoEditRowId && !importPnPianoModalRowId) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setPnGridContoEditRowId(null)
        setPnGridContoQuery('')
        setImportPnPianoModalRowId(null)
        setPnPianoModalQuery('')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pnGridContoEditRowId, importPnPianoModalRowId])

  const salvaDatiIvaProposti = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    const r0 = ivaGridRows[0] || {}
    const mergedDraft = {
      ...ivaDraft,
      imponibile: String(r0.imponibile ?? '').trim() !== '' ? String(r0.imponibile).trim() : ivaDraft.imponibile,
      iva: String(r0.iva ?? '').trim() !== '' ? String(r0.iva).trim() : ivaDraft.iva,
    }
    const v = validateIvaDraftForSave(mergedDraft)
    if (!v.ok) {
      window.alert(v.msg || 'Valori IVA non validi.')
      return
    }
    const vg = validateIvaGridRowsForSave(ivaGridRows)
    if (!vg.ok) {
      window.alert(vg.msg || 'Griglia IVA non valida.')
      return
    }
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setIvaSaveBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const trim = (s) => String(s ?? '').trim()
        const prev =
          base[META.IVA_OVERRIDES] && typeof base[META.IVA_OVERRIDES] === 'object'
            ? { ...base[META.IVA_OVERRIDES] }
            : {}
        const next = { ...prev }
        if (trim(mergedDraft.imponibile) === '') delete next.imponibile
        else next.imponibile = trim(mergedDraft.imponibile)
        if (trim(mergedDraft.iva) === '') delete next.iva
        else next.iva = trim(mergedDraft.iva)
        if (trim(ivaDraft.detraibilita_iva) === '') delete next.detraibilita_iva
        else next.detraibilita_iva = trim(ivaDraft.detraibilita_iva)
        const gridBlob = serializeIvaGridForBlob(ivaGridRows).filter(
          (row) => row.causale_iva_id || row.imponibile || row.iva,
        )
        if (gridBlob.length) next[WORKING_IVA_GRID_KEY] = gridBlob
        else delete next[WORKING_IVA_GRID_KEY]
        const cleanedIva = cleanedIvaOverridesBag(next)
        const out = { ...base }
        if (Object.keys(cleanedIva).length === 0) {
          delete out[META.IVA_OVERRIDES]
          delete out[META.IVA_OVERRIDES_AT]
        } else {
          out[META.IVA_OVERRIDES] = cleanedIva
          out[META.IVA_OVERRIDES_AT] = new Date().toISOString()
        }
        const c0 = trim(ivaGridRows[0]?.causale_iva_id)
        if (c0 !== '') {
          const accPrev =
            base[META.ACCOUNTING_PROPOSALS] && typeof base[META.ACCOUNTING_PROPOSALS] === 'object'
              ? { ...base[META.ACCOUNTING_PROPOSALS] }
              : {}
          const accNext = { ...accPrev, causale_iva_id: c0 }
          const cleanedAcc = cleanedAccountingProposalsBag(accNext)
          if (Object.keys(cleanedAcc).length) {
            out[META.ACCOUNTING_PROPOSALS] = cleanedAcc
            out[META.ACCOUNTING_PROPOSALS_AT] = new Date().toISOString()
          }
        }
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      ivaGridTouchedRef.current = false
      setIvaSaveBusy(false)
    }
  }

  const ripristinaDatiIvaProposti = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setIvaSaveBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const out = { ...base }
        delete out[META.IVA_OVERRIDES]
        delete out[META.IVA_OVERRIDES_AT]
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      ivaGridTouchedRef.current = false
      pnGridTouchedRef.current = false
      setIvaSaveBusy(false)
    }
  }

  const confermaPassoFinaleMetadati = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r) || !queueFullView) return
    const blocksNow = buildWorkingViewAccountingBlocks({
      panelRow: r,
      pnGridRows,
      ivaGridRows,
      opDraft,
      pianoConti,
      causaliIva,
    })
    if (blocksNow.length) {
      window.alert(
        `Contabilizzazione bloccata (${blocksNow.length} controllo/i).\n\n${blocksNow
          .slice(0, 4)
          .map((b) => `• ${b.message}`)
          .join('\n')}${blocksNow.length > 4 ? '\n…' : ''}`,
      )
      return
    }
    if (!candidateForNextStep(r, readinessOptsWorkingPanel)) {
      window.alert('Conferma possibile solo mentre la fattura è ancora candidata (ben preparata e controlli OK).')
      return
    }
    const r0 = ivaGridRows[0] || {}
    const mergedDraft = {
      ...ivaDraft,
      imponibile: String(r0.imponibile ?? '').trim() !== '' ? String(r0.imponibile).trim() : ivaDraft.imponibile,
      iva: String(r0.iva ?? '').trim() !== '' ? String(r0.iva).trim() : ivaDraft.iva,
    }
    const v = validateIvaDraftForSave(mergedDraft)
    if (!v.ok) {
      window.alert(v.msg || 'Valori IVA non validi.')
      return
    }
    const vg = validateIvaGridRowsForSave(ivaGridRows)
    if (!vg.ok) {
      window.alert(vg.msg || 'Griglia IVA non valida.')
      return
    }
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    const live = { docId: r.id, pnGridRows, ivaGridRows, contDraft, ivaDraft }
    setFinalStepConfirmBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const out = mergeAiRawWithWorkingViewGrids(base, live)
        out[META.FINAL_STEP_CONFIRMATION] = true
        out[META.FINAL_STEP_CONFIRMATION_AT] = new Date().toISOString()
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setFinalStepConfirmBusy(false)
    }
  }

  const annullaConfermaPassoFinale = async () => {
    const r = panelRow
    if (!r?.id || !isProntaLavorazioneRow(r)) return
    if (!getFinalStepConfirmationFlag(r)) return
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    setFinalStepConfirmBusy(true)
    try {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(r.id, (base) => {
        const out = { ...base }
        delete out[META.FINAL_STEP_CONFIRMATION]
        delete out[META.FINAL_STEP_CONFIRMATION_AT]
        return out
      })
      if (error) throw error
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setFinalStepConfirmBusy(false)
    }
  }

  /** Binario unico: `confermaERegistraDocumentoContabilitaDaArchivio` (confirmDocumento + registraDocumentiConfermati). */
  const registraPrimaNotaDaArchivioId = async (
    docImp,
    archId,
    successTitle = 'Registrazione completata',
    { silent = false } = {},
  ) => {
    const res = await confermaERegistraDocumentoContabilitaDaArchivio({
      archivioDocumentoId: archId,
      societaId,
      utente,
      pianoConti,
      causaliContabili,
      causaliIva,
      clienti,
      trace,
      traceStep,
      traceDiff,
      traceIva,
      insertCausaleIvaMeta,
    })
    if (!res.ok) {
      if (!silent) window.alert(res.message || 'Operazione non riuscita.')
      return { ok: false, alreadyRegistered: false, pnId: null }
    }
    if (res.alreadyRegistered) {
      if (!silent) window.alert(res.message || 'Documento già registrato in prima nota.')
      const META = importRepo.FISCOSIM_IMPORT_AI_META
      if (res.primaNotaId) {
        await importRepo.mergeDocumentoImportAiRawResponse(docImp.id, (base) => ({
          ...base,
          [META.REGISTRAZIONE_PRIMA_NOTA_ID]: String(res.primaNotaId),
          [META.REGISTRATO_AT]: new Date().toISOString(),
        }))
      }
      await loadQueue()
      const { data: d2 } = await contabilitaRepo.getDocumentoContabilitaById(archId, societaId, { userId: utente?.id || '' })
      setDocumentoArchivioLive(d2 || null)
      return { ok: true, alreadyRegistered: true, pnId: res.primaNotaId || null }
    }
    const META = importRepo.FISCOSIM_IMPORT_AI_META
    const pnId = res.primaNotaId || res.documento?.prima_nota_id
    if (pnId) {
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(docImp.id, (base) => ({
        ...base,
        [META.REGISTRAZIONE_PRIMA_NOTA_ID]: String(pnId),
        [META.REGISTRATO_AT]: new Date().toISOString(),
      }))
      if (error) console.warn('[Import Fatture] merge registrazione meta', error)
    }
    await loadQueue()
    const { data: d2 } = await contabilitaRepo.getDocumentoContabilitaById(archId, societaId, { userId: utente?.id || '' })
    setDocumentoArchivioLive(d2 || null)
    const wn = Array.isArray(res.warnings) && res.warnings.length
    if (!silent) {
      window.alert(
        wn
          ? `${successTitle} (con avvisi). Prima nota collegata: ${pnId || '—'}. Controlla il modulo Contabilità se necessario.`
          : `${successTitle}. Prima nota collegata: ${pnId || '—'}.`,
      )
    }
    return { ok: true, alreadyRegistered: false, pnId: pnId || null }
  }

  const buildPersistedWorkingViewPayloadFromDoc = (doc) => {
    const ap = getAccountingProposalsObj(doc)
    const ivaBag = getIvaOverridesObj(doc)
    const op = getOperativeOverridesObj(doc)
    const pnGridRowsStored = normalizeStoredPnGrid(Array.isArray(ap?.[WORKING_PN_GRID_KEY]) ? ap[WORKING_PN_GRID_KEY] : [])
    const ivaGridRowsStored = normalizeStoredIvaGrid(Array.isArray(ivaBag?.[WORKING_IVA_GRID_KEY]) ? ivaBag[WORKING_IVA_GRID_KEY] : [])
    const opDraftStored = {
      controparte: String(op?.controparte || '').trim(),
      numero_documento: String(op?.numero_documento || '').trim(),
      data_documento: String(op?.data_documento || '').trim(),
      totale: String(op?.totale || '').trim(),
    }
    return { pnGridRowsStored, ivaGridRowsStored, opDraftStored }
  }

  const contabilizzaDocumentoImportDaBulk = async (doc) => {
    if (!doc?.id || !societaId || !isProntaLavorazioneRow(doc)) {
      return { ok: false, code: 'not_pronta', message: 'Riga non pronta alla contabilizzazione.' }
    }
    if (getRegistrazionePrimaNotaIdFromImportMeta(doc)) {
      return { ok: true, skipped: true, code: 'already_registered', message: 'Già registrata in prima nota.' }
    }

    const rowEval = rowEvalById.get(doc.id)
    if (!rowEval?.isCandidate || !rowEval?.confValid || !confermaPassoFinaleValida(doc, readinessOptsWorkingPanel)) {
      return {
        ok: false,
        code: 'not_green',
        message: 'Mancano conferma finale valida o controlli verdi reali.',
      }
    }

    const { pnGridRowsStored, ivaGridRowsStored, opDraftStored } = buildPersistedWorkingViewPayloadFromDoc(doc)
    const structuralBlocks = evaluateImportFattureStructuralAccountingBlocks({
      doc,
      pnGridRows: pnGridRowsStored,
      ivaGridRows: ivaGridRowsStored,
      opDraft: opDraftStored,
      pianoConti,
      causaliIva,
    })
    if (structuralBlocks.length) {
      return {
        ok: false,
        code: 'structural_blocks',
        message: structuralBlocks[0]?.message || 'Blocco strutturale pre-commit.',
      }
    }

    const mergedAiOut = mergeDataRegistrazioneIntoImportedBlob(parseAiRaw(doc), toolbarDataRegistrazione)
    const docForBridge = { ...doc, ai_raw_response: mergedAiOut }

    const { error: persistErr } = await importRepo.mergeDocumentoImportAiRawResponse(doc.id, (base) =>
      mergeDataRegistrazioneIntoImportedBlob(base, toolbarDataRegistrazione),
    )
    if (persistErr) {
      return { ok: false, code: 'persist_error', message: persistErr?.message || String(persistErr) }
    }

    const histTop = String(historicalContoTopByImportId[doc.id] || '').trim()
    let archId = String(getArchivioDocumentoIdFromImportMeta(docForBridge) || '').trim()

    if (!archId) {
      const res = await insertImportFattureIntoDocumentiContabilita({
        doc: docForBridge,
        societaId,
        utente,
        pianoConti,
        causaliIva,
        causaliContabili,
        historicalTopCodice: histTop,
      })
      if (!res.ok) {
        return { ok: false, code: 'archivio_insert_error', message: res.message || 'Inserimento archivio fallito.' }
      }
      const META = importRepo.FISCOSIM_IMPORT_AI_META
      const { error } = await importRepo.mergeDocumentoImportAiRawResponse(doc.id, (base) => ({
        ...base,
        [META.ARCHIVIO_DOCUMENTO_ID]: res.documentoContabilitaId,
        [META.ARCHIVIO_LINKED_AT]: new Date().toISOString(),
      }))
      if (error) {
        return { ok: false, code: 'archivio_meta_error', message: error?.message || String(error) }
      }
      archId = String(res.documentoContabilitaId || '').trim()
    } else {
      const syncRes = await syncImportFattureDocumentoContabilitaFromImportDoc({
        doc: docForBridge,
        documentoContabilitaId: archId,
        societaId,
        utente,
        pianoConti,
        causaliIva,
        causaliContabili,
        historicalTopCodice: histTop,
      })
      if (!syncRes.ok) {
        return {
          ok: false,
          code: 'archivio_sync_error',
          message: syncRes.message || 'Aggiornamento archivio fallito.',
        }
      }
    }

    if (!archId) {
      return { ok: false, code: 'archivio_missing', message: 'Documento archivio non disponibile.' }
    }

    const out = await registraPrimaNotaDaArchivioId(docForBridge, archId, 'Contabilizzazione bulk completata', { silent: true })
    if (!out?.ok) {
      return { ok: false, code: 'pn_register_error', message: 'Registrazione prima nota fallita.' }
    }
    return { ok: true, skipped: false, code: out.alreadyRegistered ? 'already_registered' : 'registered' }
  }

  const contabilizzaTutteLePronte = async () => {
    if (bulkContabilizzaBusy) return
    const sourceRows = codaVista === 'pronte' ? filteredRows : rows.filter((r) => isProntaLavorazioneRow(r))
    if (!sourceRows.length) {
      window.alert('Nessuna riga disponibile per il bulk nella vista corrente.')
      return
    }

    const eligible = []
    const excluded = []
    for (const row of sourceRows) {
      if (getRegistrazionePrimaNotaIdFromImportMeta(row)) {
        excluded.push({ id: row.id, reason: 'gia_registrata' })
        continue
      }
      const evalRow = rowEvalById.get(row.id)
      if (!evalRow?.isCandidate || !evalRow?.confValid || !confermaPassoFinaleValida(row, readinessOptsWorkingPanel)) {
        excluded.push({ id: row.id, reason: 'controlli_non_verdi' })
        continue
      }
      const { pnGridRowsStored, ivaGridRowsStored, opDraftStored } = buildPersistedWorkingViewPayloadFromDoc(row)
      const blocks = evaluateImportFattureStructuralAccountingBlocks({
        doc: row,
        pnGridRows: pnGridRowsStored,
        ivaGridRows: ivaGridRowsStored,
        opDraft: opDraftStored,
        pianoConti,
        causaliIva,
      })
      if (blocks.length) {
        excluded.push({ id: row.id, reason: 'blocco_strutturale', message: blocks[0]?.message || '' })
        continue
      }
      eligible.push(row)
    }

    const previewMsg = [
      `Righe analizzate: ${sourceRows.length}`,
      `Righe contabilizzabili (check verdi reali): ${eligible.length}`,
      `Righe escluse: ${excluded.length}`,
      '',
      'Confermi bulk "Contabilizza tutte le pronte" sui soli documenti ammessi?',
    ].join('\n')
    if (!eligible.length || !window.confirm(previewMsg)) return

    setBulkContabilizzaBusy(true)
    const successIds = []
    const failed = []
    let already = 0
    try {
      for (const row of eligible) {
        const res = await contabilizzaDocumentoImportDaBulk(row)
        if (res.ok && !res.skipped) {
          successIds.push(row.id)
          continue
        }
        if (res.ok && res.skipped) {
          already += 1
          continue
        }
        failed.push({ id: row.id, message: res.message || res.code || 'Errore bulk.' })
      }
      await loadQueue()
      setLastBulkActionLog({
        at: new Date().toISOString(),
        action: 'contabilizza_pronte',
        targetIds: eligible.map((r) => r.id),
        excludedIds: excluded.map((x) => x.id),
        updated: successIds.length,
        skipped: excluded.length + failed.length + already,
      })
      const firstErrors = failed.slice(0, 3).map((x) => `• ${x.id}: ${x.message}`).join('\n')
      window.alert(
        [
          `Bulk contabilizzazione completato.`,
          `Registrate: ${successIds.length}`,
          `Già registrate: ${already}`,
          `Escluse pre-check: ${excluded.length}`,
          `Errori runtime: ${failed.length}`,
          failed.length ? '' : null,
          failed.length ? firstErrors : null,
        ]
          .filter(Boolean)
          .join('\n'),
      )
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setBulkContabilizzaBusy(false)
    }
  }

  const salvaContoPredefinitoPostContabilizzazione = async () => {
    if (!rememberMainContoDefault) return
    if (!defaultMainContoPlan.ready) {
      window.alert(defaultMainContoPlan.message || 'Memorizzazione conto non disponibile.')
      return
    }
    const cp = defaultMainContoPlan.counterpartyConto
    const main = defaultMainContoPlan.mainConto
    if (!cp?.id || !main?.codice) return
    const { error } = await importRepo.updatePianoContiById(cp.id, { contropartita: String(main.codice).trim() })
    if (error) throw error
    window.alert(`Conto predefinito aggiornato: ${cp.codice} -> ${main.codice}.`)
  }

  /**
   * CTA unica: crea il documento in archivio (se manca) e subito conferma + registrazione PN — stesso binario di `importFattureContabilitaFinalize`.
   */
  const contabilizzaCompletaDaWorkingView = async ({ allowWarningOverride = false } = {}) => {
    const doc = panelRow
    if (!doc?.id || !societaId || !isProntaLavorazioneRow(doc)) return
    if (getRegistrazionePrimaNotaIdFromImportMeta(doc)) {
      window.alert('Questa fattura risulta già registrata in contabilità.')
      return
    }
    const blocksNow = buildWorkingViewAccountingBlocks({
      panelRow: doc,
      pnGridRows,
      ivaGridRows,
      opDraft,
      pianoConti,
      causaliIva,
    })
    if (blocksNow.length) {
      window.alert(
        `Contabilizzazione bloccata (${blocksNow.length} controllo/i).\n\n${blocksNow
          .slice(0, 4)
          .map((b) => `• ${b.message}`)
          .join('\n')}${blocksNow.length > 4 ? '\n…' : ''}`,
      )
      return
    }
    const canForceWarningOverride =
      allowWarningOverride &&
      panelPreCommitSemaforo === 'giallo' &&
      isBenPreparata(doc, readinessOptsWorkingPanel)

    if (!confermaPassoFinaleValida(doc, readinessOptsWorkingPanel) && !canForceWarningOverride) {
      window.alert(
        'Azione disponibile solo con «Conferma per passo finale» valida e dati preparatori completi (conto, causale IVA, imponibile/IVA).',
      )
      return
    }
    if (panelArchivioGiaRegistrato) {
      window.alert('Questa fattura risulta già contabilizzata in prima nota.')
      return
    }
    const live = { docId: doc.id, pnGridRows, ivaGridRows, contDraft, ivaDraft }
    const r0Iva = ivaGridRows[0] || {}
    const mergedIvaDraft = {
      ...ivaDraft,
      imponibile: String(r0Iva.imponibile ?? '').trim() !== '' ? String(r0Iva.imponibile).trim() : ivaDraft.imponibile,
      iva: String(r0Iva.iva ?? '').trim() !== '' ? String(r0Iva.iva).trim() : ivaDraft.iva,
    }
    const vIva = validateIvaDraftForSave(mergedIvaDraft)
    if (!vIva.ok) {
      window.alert(vIva.msg || 'Valori IVA non validi.')
      return
    }
    const vGrid = validateIvaGridRowsForSave(ivaGridRows)
    if (!vGrid.ok) {
      window.alert(vGrid.msg || 'Griglia IVA non valida.')
      return
    }
    const warningMsg = canForceWarningOverride
      ? '\n\nATTENZIONE: stai forzando la contabilizzazione con warning non bloccanti (semaforo giallo).'
      : ''
    if (
      !window.confirm(
        `Contabilizzare la fattura?\n\nIl documento sarà confermato e registrato in prima nota con lo stesso percorso del modulo Contabilità.${warningMsg}`,
      )
    ) {
      return
    }

    const warningSnapshot = (workingViewMissingItems || []).map((item) => ({
      tab: item.tab,
      message: item.message,
    }))

    const mergedAiOut = mergeDataRegistrazioneIntoImportedBlob(
      mergeAiRawWithWorkingViewGrids(parseAiRaw(doc), live),
      toolbarDataRegistrazione,
    )
    const docForBridge = { ...doc, ai_raw_response: mergedAiOut }

    try {
      const { error: persistErr } = await importRepo.mergeDocumentoImportAiRawResponse(doc.id, (base) =>
        {
          const next = mergeDataRegistrazioneIntoImportedBlob(mergeAiRawWithWorkingViewGrids(base, live), toolbarDataRegistrazione)
          const META = importRepo.FISCOSIM_IMPORT_AI_META
          if (canForceWarningOverride) {
            next[META.FINAL_STEP_CONFIRMATION] = true
            next[META.FINAL_STEP_CONFIRMATION_AT] = new Date().toISOString()
          }
          if (warningSnapshot.length) {
            const prevLog = Array.isArray(next?.[META.WARNING_OVERRIDES_LOG]) ? [...next[META.WARNING_OVERRIDES_LOG]] : []
            prevLog.push({
              at: new Date().toISOString(),
              user_id: utente?.id || null,
              scope: 'working_view_contabilizza',
              warning_count: warningSnapshot.length,
              warnings: warningSnapshot,
            })
            next[META.WARNING_OVERRIDES_LOG] = prevLog.slice(-50)
          }
          return next
        },
      )
      if (persistErr) throw persistErr
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
      return
    }

    const histTop = String(
      historicalContoTopByImportId[doc.id] || historicalContoBuilt[0]?.codice || '',
    ).trim()

    let archId = String(getArchivioDocumentoIdFromImportMeta(docForBridge) || '').trim()

    if (!archId) {
      setArchivioBridgeBusy(true)
      try {
        const res = await insertImportFattureIntoDocumentiContabilita({
          doc: docForBridge,
          societaId,
          utente,
          pianoConti,
          causaliIva,
          causaliContabili,
          historicalTopCodice: histTop,
        })
        if (!res.ok) {
          window.alert(res.message || 'Operazione non riuscita.')
          return
        }
        const META = importRepo.FISCOSIM_IMPORT_AI_META
        const { error } = await importRepo.mergeDocumentoImportAiRawResponse(doc.id, (base) => ({
          ...base,
          [META.ARCHIVIO_DOCUMENTO_ID]: res.documentoContabilitaId,
          [META.ARCHIVIO_LINKED_AT]: new Date().toISOString(),
        }))
        if (error) throw error
        await loadQueue()
        archId = String(res.documentoContabilitaId || '').trim()
        if (archId) {
          const { data: dArch } = await contabilitaRepo.getDocumentoContabilitaById(archId, societaId, {
            userId: utente?.id || '',
          })
          setDocumentoArchivioLive(dArch || null)
        }
      } catch (e) {
        window.alert(e?.message || String(e))
        return
      } finally {
        setArchivioBridgeBusy(false)
      }
    } else {
      const syncRes = await syncImportFattureDocumentoContabilitaFromImportDoc({
        doc: docForBridge,
        documentoContabilitaId: archId,
        societaId,
        utente,
        pianoConti,
        causaliIva,
        causaliContabili,
        historicalTopCodice: histTop,
      })
      if (!syncRes.ok) {
        window.alert(syncRes.message || 'Aggiornamento documento in archivio non riuscito.')
        return
      }
      const { data: dArch } = await contabilitaRepo.getDocumentoContabilitaById(archId, societaId, {
        userId: utente?.id || '',
      })
      setDocumentoArchivioLive(dArch || null)
    }

    if (!archId) {
      window.alert('Documento archivio non disponibile dopo la creazione.')
      return
    }

    setRegistrazioneFinaleBusy(true)
    try {
      const out = await registraPrimaNotaDaArchivioId(docForBridge, archId, 'Contabilizzazione completata')
      if (out?.ok && !out?.alreadyRegistered) {
        await salvaContoPredefinitoPostContabilizzazione()
      }
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setRegistrazioneFinaleBusy(false)
    }
  }

  useEffect(() => {
    if (!(candidateWorkingView && queueFullView && panelRow?.id)) return
    const onKey = (e) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return
      if (isTypingTarget(e.target)) return
      const key = String(e.key || '')

      if (key === 'ArrowLeft') {
        e.preventDefault()
        gotoPrevCandidateInView()
        return
      }
      if (key === 'ArrowRight') {
        e.preventDefault()
        gotoNextCandidateInView()
        return
      }
      if (key.toLowerCase() === 's') {
        e.preventDefault()
        gotoNextCandidateInView()
        return
      }
      if (key === 'Enter') {
        const canContabilizza =
          panelConfermaPassoFinaleValida &&
          !panelArchivioGiaRegistrato &&
          panelAccountingBlocks.length === 0 &&
          !archivioBridgeBusy &&
          !registrazioneFinaleBusy &&
          !finalStepConfirmBusy &&
          !opSaveBusy &&
          !accSaveBusy &&
          !ivaSaveBusy
        if (!canContabilizza) return
        e.preventDefault()
        void contabilizzaCompletaDaWorkingView()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    candidateWorkingView,
    queueFullView,
    panelRow,
    panelConfermaPassoFinaleValida,
    panelArchivioGiaRegistrato,
    panelAccountingBlocks,
    archivioBridgeBusy,
    registrazioneFinaleBusy,
    finalStepConfirmBusy,
    opSaveBusy,
    accSaveBusy,
    ivaSaveBusy,
    gotoPrevCandidateInView,
    gotoNextCandidateInView,
  ])

  const applicaPreparazioneStessaControparte = async () => {
    const ref = panelRow
    if (!ref?.id || !queueFullView || !isProntaLavorazioneRow(ref)) return
    const layers = {
      op: pickNonEmptyFiscosimBag(getOperativeOverridesObj(ref)),
      acc: pickNonEmptyFiscosimBag(getAccountingProposalsObj(ref)),
      iva: pickNonEmptyFiscosimBag(getIvaOverridesObj(ref)),
    }
    if (!Object.keys(layers.op).length && !Object.keys(layers.acc).length && !Object.keys(layers.iva).length) {
      window.alert(
        'Nella fattura corrente non ci sono dati preparatori salvati (_fiscosim*) da copiare. Salva prima le sezioni operative, contabili o IVA.'
      )
      return
    }
    const cpKey = counterpartyMatchKey(ref)
    const targets = rows.filter(
      (r) => r.id !== ref.id && isProntaLavorazioneRow(r) && counterpartyMatchKey(r) === cpKey
    )
    if (!targets.length) {
      window.alert('Non ci sono altre fatture pronte per la stessa controparte in elenco.')
      return
    }
    const preview = `Applicare i dati preparatori della fattura corrente a ${targets.length} righe con stessa controparte?`
    if (!window.confirm(preview)) return
    setApplySameCpBusy(true)
    let updated = 0
    try {
      for (const t of targets) {
        let didChange = false
        const { error } = await importRepo.mergeDocumentoImportAiRawResponse(t.id, (base) => {
          const { out, changed } = mergeFiscosimLayersOntoBase(base, layers)
          didChange = changed
          return changed ? out : base
        })
        if (error) throw error
        if (didChange) updated += 1
      }
      await loadQueue()
      setLastBulkActionLog({
        at: new Date().toISOString(),
        action: 'stessa_controparte',
        targetIds: targets.map((t) => t.id),
        updated,
        skipped: Math.max(0, targets.length - updated),
      })
      window.alert(
        updated === 0
          ? 'Nessuna modifica necessaria: le altre fatture avevano già gli stessi valori sui campi copiabili.'
          : `Aggiornate ${updated} fattura/e (stessa controparte, solo dati preparatori _fiscosim*).`
      )
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setApplySameCpBusy(false)
    }
  }

  const applicaPreparazioneASelezionati = async () => {
    const ref = panelRow
    if (!ref?.id || !queueFullView || !isProntaLavorazioneRow(ref)) return
    if (!checkedRowIds.length) {
      window.alert('Seleziona almeno una riga di destinazione.')
      return
    }
    const layers = {
      op: pickNonEmptyFiscosimBag(getOperativeOverridesObj(ref)),
      acc: pickNonEmptyFiscosimBag(getAccountingProposalsObj(ref)),
      iva: pickNonEmptyFiscosimBag(getIvaOverridesObj(ref)),
    }
    if (!Object.keys(layers.op).length && !Object.keys(layers.acc).length && !Object.keys(layers.iva).length) {
      window.alert('Nella fattura corrente non ci sono dati _fiscosim* da propagare.')
      return
    }
    const causaleId = String(layers.acc.causale_id || '').trim()
    const causale = causaleId ? causaliContabiliById.get(causaleId) || null : null
    const isPartitarioSensitive = isPartitarioSensitiveCausale(causale)
    const cpKeyRef = counterpartyMatchKey(ref)

    const selectedTargets = rows.filter((r) => checkedRowIds.includes(r.id) && r.id !== ref.id)
    if (!selectedTargets.length) {
      window.alert('La selezione contiene solo la riga corrente o righe non valide.')
      return
    }
    const targets = []
    const excluded = []
    for (const row of selectedTargets) {
      if (!isProntaLavorazioneRow(row)) {
        excluded.push({ id: row.id, reason: 'non_pronta' })
        continue
      }
      if (isPartitarioSensitive && counterpartyMatchKey(row) !== cpKeyRef) {
        excluded.push({ id: row.id, reason: 'partitario_soggetto_diverso' })
        continue
      }
      targets.push(row)
    }

    const previewMsg = [
      `Righe selezionate: ${selectedTargets.length}`,
      `Righe applicabili: ${targets.length}`,
      `Escluse: ${excluded.length}`,
      isPartitarioSensitive
        ? `Causale ${String(causale?.codice || causaleId)} con vincolo partitario: ammesse solo righe con stessa controparte.`
        : 'Nessun vincolo partitario rilevato sulla causale selezionata.',
      '',
      'Confermi applicazione bulk ai soli target ammessi?',
    ].join('\n')
    if (!targets.length || !window.confirm(previewMsg)) return

    setApplySameCpBusy(true)
    let updated = 0
    try {
      for (const t of targets) {
        let didChange = false
        const { error } = await importRepo.mergeDocumentoImportAiRawResponse(t.id, (base) => {
          const { out, changed } = mergeFiscosimLayersOntoBase(base, layers)
          didChange = changed
          return changed ? out : base
        })
        if (error) throw error
        if (didChange) updated += 1
      }
      await loadQueue()
      setLastBulkActionLog({
        at: new Date().toISOString(),
        action: 'selezionati',
        targetIds: targets.map((t) => t.id),
        excludedIds: excluded.map((t) => t.id),
        updated,
        skipped: Math.max(0, targets.length - updated) + excluded.length,
      })
      window.alert(
        `Bulk completato. Aggiornate ${updated}/${targets.length} righe ammesse. Escluse ${excluded.length} righe per vincoli/filtri.`,
      )
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setApplySameCpBusy(false)
    }
  }

  /** Marca le selezionate come pronte e apre subito la working view (un solo passaggio operativo). */
  const avviaContabilizzazioneEDWorking = async () => {
    if (!checkedRowIds.length) {
      window.alert('Seleziona una o più fatture da contabilizzare.')
      return
    }
    const pr = importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE
    const at = importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE_AT
    setMarkBusy(true)
    try {
      for (const id of checkedRowIds) {
        const { error } = await importRepo.mergeDocumentoImportAiRawResponse(id, (base) => ({
          ...base,
          [pr]: true,
          [at]: new Date().toISOString(),
        }))
        if (error) throw error
      }
      await loadQueue()
      setCandidateWorkingView(true)
      setImportWorkingTab('prima_nota')
      const first = checkedRowIds[0]
      if (first) setPanelRowId(first)
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setMarkBusy(false)
    }
  }

  const rimuoviCheckedDaLavorazione = async () => {
    if (!checkedRowIds.length) return
    const pr = importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE
    const at = importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE_AT
    setMarkBusy(true)
    try {
      for (const id of checkedRowIds) {
        const { error } = await importRepo.mergeDocumentoImportAiRawResponse(id, (base) => {
          const o = { ...base }
          delete o[pr]
          delete o[at]
          return o
        })
        if (error) throw error
      }
      await loadQueue()
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setMarkBusy(false)
    }
  }

  const eliminaFattureSelezionate = async () => {
    if (!checkedRowIds.length || !societaId) return
    const selectedIdSet = new Set(checkedRowIds.map((id) => String(id || '')).filter(Boolean))
    const selectedRows = rows.filter((r) => selectedIdSet.has(String(r?.id || '')))
    if (!selectedRows.length) return

    const isOwnerOrAdmin = ['owner', 'admin'].includes(String(utente?.ruolo || '').toLowerCase())
    const selectedIds = selectedRows.map((r) => String(r?.id || '')).filter(Boolean)
    let classification = []
    try {
      const [
        { data: linkedDocRows, error: linkedDocErr },
        { data: linkedPnRows, error: linkedPnErr },
      ] = await Promise.all([
        importRepo.findDocumentoContabilitaBySourceDocumentIds(societaId, selectedIds),
        importRepo.findPrimaNotaByDocumentoImportIds(societaId, selectedIds),
      ])
      if (linkedDocErr) throw linkedDocErr
      if (linkedPnErr) throw linkedPnErr

      const linkedDocsByImportId = new Map()
      for (const linked of Array.isArray(linkedDocRows) ? linkedDocRows : []) {
        const importId = String(linked?.source_document_id || '').trim()
        if (!importId || linkedDocsByImportId.has(importId)) continue
        linkedDocsByImportId.set(importId, linked)
      }
      const linkedPnByImportId = new Map()
      for (const linked of Array.isArray(linkedPnRows) ? linkedPnRows : []) {
        const importId = String(linked?.documento_import_id || '').trim()
        if (!importId || linkedPnByImportId.has(importId)) continue
        linkedPnByImportId.set(importId, linked)
      }

      classification = selectedRows.map((r) => {
        const rowId = String(r?.id || '')
        const raw = parseAiRaw(r)
        const hasMetaHint = Boolean(
          String(raw?.[importRepo.FISCOSIM_IMPORT_AI_META.ARCHIVIO_DOCUMENTO_ID] || '').trim() ||
          String(raw?.[importRepo.FISCOSIM_IMPORT_AI_META.REGISTRAZIONE_PRIMA_NOTA_ID] || '').trim(),
        )
        const hasRealLinks = Boolean(linkedDocsByImportId.has(rowId) || linkedPnByImportId.has(rowId))

        return {
          row: r,
          hasMetaHint,
          hasRealLinks,
          staleMeta: hasMetaHint && !hasRealLinks,
        }
      })
    } catch (e) {
      window.alert(e?.message || String(e))
      return
    }

    const linkedRows = classification.filter((x) => x.hasRealLinks).map((x) => x.row)
    const stagingRows = classification.filter((x) => !x.hasRealLinks).map((x) => x.row)
    const staleMetaCount = classification.filter((x) => x.staleMeta).length

    if (linkedRows.length && !isOwnerOrAdmin) {
      window.alert(
        'Tra le fatture selezionate ci sono documenti già passati nel flusso contabile. Per eliminarli con pulizia completa servono permessi Owner/Admin.',
      )
      return
    }

    const strongWarning =
      linkedRows.length > 0
        ? `\n\nATTENZIONE: ${linkedRows.length} fattura/e risultano già passate nel flusso contabile. Verranno rimossi anche i riferimenti collegati (archivio/prima nota) per consentire il reimport.`
        : ''
    const ok = window.confirm(
      `Eliminare ${selectedRows.length} fattura/e selezionata/e?\n\n${stagingRows.length} in solo staging, ${linkedRows.length} con collegamenti contabili reali.${staleMetaCount ? `\n${staleMetaCount} con metadati obsoleti senza collegamenti effettivi (verranno trattate come staging).` : ''}${strongWarning}\n\nOperazione irreversibile.`,
    )
    if (!ok) return

    setDeleteBusy(true)
    setDeleteProgress('Preparazione eliminazione...')
    try {
      setCheckedRowIds([])
      if (panelRowId && selectedIdSet.has(String(panelRowId))) setPanelRowId(null)
      const deletedRowIds = new Set(selectedRows.map((row) => row?.id).filter(Boolean))
      const stagingChunkSize = 25
      for (let i = 0; i < stagingRows.length; i += stagingChunkSize) {
        const chunk = stagingRows.slice(i, i + stagingChunkSize)
        setDeleteProgress(`Eliminazione staging ${Math.min(i + chunk.length, stagingRows.length)}/${stagingRows.length}...`)
        const results = await Promise.all(chunk.map((row) => importRepo.deleteDocumentoImportById(row.id)))
        const firstError = results.find((res) => res?.error)
        if (firstError?.error) throw firstError.error
      }

      const linkedChunkSize = 4
      for (let i = 0; i < linkedRows.length; i += linkedChunkSize) {
        const chunk = linkedRows.slice(i, i + linkedChunkSize)
        setDeleteProgress(`Eliminazione collegati ${Math.min(i + chunk.length, linkedRows.length)}/${linkedRows.length}...`)
        const chunkResults = await Promise.all(
          chunk.map(async (row) => {
            const previewRes = await fetch('/api/admin/reset-tools', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'purge_test_import_document',
                dryRun: true,
                scopeType: 'company',
                scopeId: societaId,
                societaId,
                importId: row.id,
                force: false,
              }),
            })
            const previewJson = await previewRes.json().catch(() => ({}))
            if (!previewRes.ok || previewJson?.ok === false) {
              throw new Error(previewJson?.error || previewJson?.message || previewRes.statusText)
            }

            const execRes = await fetch('/api/admin/reset-tools', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'purge_test_import_document',
                dryRun: false,
                scopeType: 'company',
                scopeId: societaId,
                societaId,
                importId: row.id,
                force: true,
              }),
            })
            const execJson = await execRes.json().catch(() => ({}))
            if (!execRes.ok || execJson?.ok === false) {
              throw new Error(execJson?.error || execJson?.message || execRes.statusText)
            }
            return true
          }),
        )
        if (chunkResults.some((x) => x !== true)) {
          throw new Error('Pulizia collegamenti non completata')
        }
      }

      queuePageCacheRef.current.clear()
      queuePageInflightRef.current.clear()
      queueAllRowsCacheRef.current = { scopeKey: '', rows: [], totalRows: 0, at: 0 }
      setRows((prev) => prev.filter((row) => !deletedRowIds.has(row?.id)))
      setFattureTotalRows((prev) => Math.max(0, Number(prev || 0) - deletedRowIds.size))
      await loadQueue()
      window.alert(
        linkedRows.length
          ? `Eliminazione completata: ${selectedRows.length} fattura/e rimosse con pulizia coerente dei collegamenti. Ora puoi reimportare senza blocchi residui.`
          : `Eliminazione completata: ${selectedRows.length} fattura/e rimosse dallo staging.`,
      )
    } catch (e) {
      window.alert(e?.message || String(e))
    } finally {
      setDeleteBusy(false)
      setDeleteProgress('')
    }
  }

  const applyPnGridContoFromPiano = (p, rowId, rowIdx) => {
    const cod = String(p.codice || '').trim()
    const label = `${cod} · ${(p.descrizione || p.nome || '').trim() || cod}`.trim()
    pnGridTouchedRef.current = true
    setPnGridRows((prev) => prev.map((x) => (x.id === rowId ? { ...x, conto: label } : x)))
    if (rowIdx === 0) {
      setContDraft((d) => ({ ...d, conto_codice: cod }))
      setBozzaFonte((f) => ({ ...f, conto: 'manuale' }))
    }
    setPnGridContoEditRowId(null)
    setPnGridContoQuery('')
    setImportPnPianoModalRowId(null)
    setPnPianoModalQuery('')
  }

  const applyPnGridContoFreeText = (rowId, rowIdx, text) => {
    const t = String(text ?? '').trim()
    pnGridTouchedRef.current = true
    setPnGridRows((prev) => prev.map((x) => (x.id === rowId ? { ...x, conto: t } : x)))
    if (rowIdx === 0) {
      setContDraft((d) => ({ ...d, conto_codice: leadingContoCodiceFromCell(t) }))
      setBozzaFonte((f) => ({ ...f, conto: 'manuale' }))
    }
    setPnGridContoEditRowId(null)
    setPnGridContoQuery('')
  }

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: '.35rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, letterSpacing: '.01em' }}>Import Fatture</h1>
        <span />
      </div>

      {internalTelemetryVisible && internalTelemetrySnapshot ? (
        <div
          className="card"
          style={{
            padding: '.45rem .75rem',
            display: 'grid',
            gap: '.35rem',
            border: '1px solid rgba(148, 190, 255, 0.35)',
            background: 'linear-gradient(180deg, rgba(16,30,52,.7), rgba(10,22,40,.68))',
          }}
        >
          <div style={{ fontSize: '.67rem', fontWeight: 800, letterSpacing: '.05em', color: '#c5d9ff' }}>
            Dashboard interna KPI (Milestone 1)
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.55rem', fontSize: '.66rem', color: 'var(--mu)' }}>
            <span>Eventi import: <strong style={{ color: '#e3f2fd' }}>{internalTelemetrySnapshot.eventi_import}</strong></span>
            <span>Eventi contabilizzazione: <strong style={{ color: '#e3f2fd' }}>{internalTelemetrySnapshot.eventi_contabilizzazione}</strong></span>
            <span>Tempo medio import: <strong style={{ color: '#e3f2fd' }}>{internalTelemetrySnapshot.tempo_medio_import_ms} ms</strong></span>
            <span>% precompilazione automatica: <strong style={{ color: '#e3f2fd' }}>{internalTelemetrySnapshot.prefill_automatico_percent}%</strong></span>
            <span>% errori: <strong style={{ color: '#e3f2fd' }}>{internalTelemetrySnapshot.error_rate_percent}%</strong></span>
          </div>
        </div>
      ) : null}

      {/* RIGA SOCIETÀ + UPLOAD COMPATTO */}
      <div
        className="card"
        style={{
          padding: '.45rem .75rem',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '.65rem',
          position: 'relative',
          borderRadius: 14,
          background: 'linear-gradient(180deg, rgba(28,46,74,.55), rgba(18,34,56,.55))',
          boxShadow: '0 6px 18px rgba(2,8,22,.25)',
        }}
      >
        <div style={{ minWidth: 0, flex: '0 0 380px', display: 'flex', alignItems: 'center', gap: '.5rem' }}>
          <label style={{ fontWeight: 700, fontSize: '.78rem', color: 'var(--mu)' }}>Società</label>
          <select
            className="input"
            value={societaId}
            onChange={(e) => onSocietaChange(e.target.value)}
            style={{ maxWidth: 240, width: '100%', fontSize: '.82rem', padding: '.25rem .4rem' }}
          >
            <option value="">— Seleziona —</option>
            {societa.map((s) => (
              <option key={s.id} value={s.id}>
                {s.denominazione || s.id}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-sec"
            disabled={!societaId || queueLoading}
            onClick={() => void loadQueue()}
            style={{ fontSize: '.74rem', padding: '.22rem .5rem', whiteSpace: 'nowrap', borderRadius: 999 }}
          >
            {queueLoading ? 'Aggiornamento…' : 'Aggiorna'}
          </button>
        </div>

        <div
          ref={fattureDropRef}
          onClick={() => {
            if (fattureUploading) return
            if (!societaId) {
              setFattureUploadHint('Seleziona prima la società.')
              return
            }
            fattureFileInputRef.current?.click()
          }}
          style={{
            flex: '1 1 auto',
            minWidth: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '.55rem',
            cursor: fattureUploading || !societaId ? 'not-allowed' : 'pointer',
            opacity: !societaId ? 0.72 : 1,
          }}
        >
          <div style={{ textAlign: 'right', fontSize: '.68rem', color: 'var(--mu)' }}>
            <div style={{ fontWeight: 600 }}>XML · PDF · ZIP XML/PDF · P7M</div>
          </div>
          <button
            type="button"
            className="btn"
            disabled={!societaId || fattureUploading}
            style={{
              position: 'relative',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '.45rem',
              padding: '.3rem .72rem',
              fontSize: '.78rem',
              fontWeight: 600,
              color: 'rgba(255,255,255,.96)',
              background: 'linear-gradient(90deg, rgba(34,120,52,0.92), rgba(46,140,62,0.98))',
              borderColor: 'rgba(165, 214, 167, 0.55)',
              borderRadius: 999,
              boxShadow: '0 4px 14px rgba(25,118,60,.28)',
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,.45)',
                color: 'rgba(255,255,255,.95)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '.8rem',
              }}
            >
              ⬆
            </span>
            {fattureUploading ? 'Import in corso…' : 'Carica fatture'}
          </button>
          {typeof onNavigate === 'function' && (
            <button
              type="button"
              className="btn-sec"
              onClick={() => onNavigate('contabilita')}
              style={{ whiteSpace: 'nowrap', fontSize: '.72rem', padding: '.22rem .5rem', borderRadius: 999 }}
            >
              Vai a Contabilità
            </button>
          )}
        </div>

        {/* input file nascosto: riusa la logica esistente */}
        <input
          ref={fattureFileInputRef}
          type="file"
          multiple
          disabled={!societaId || fattureUploading}
          accept=".xml,.pdf,.zip,.p7m"
          style={{ display: 'none' }}
          onChange={(e) => {
            void handleFattureFiles(e.target.files)
            e.target.value = ''
          }}
        />

        {fattureUploading && fattureUploadProgress && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: 6,
              fontSize: '.7rem',
              color: 'var(--mu)',
              display: 'flex',
              alignItems: 'center',
              gap: '.5rem',
            }}
          >
            <span>
              Import {fattureUploadProgress.current}/{fattureUploadProgress.total} · {fattureUploadProgress.file}
            </span>
            <div style={{ flex: 1, height: 3, background: 'var(--bd)', borderRadius: 999, overflow: 'hidden' }}>
              <div
                style={{
                  height: '100%',
                  width: `${(fattureUploadProgress.current / fattureUploadProgress.total) * 100}%`,
                  background: 'rgba(46, 125, 50, 0.7)',
                  transition: 'width .3s',
                }}
              />
            </div>
          </div>
        )}

        {fattureUploadHint && (
          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: -18,
              fontSize: '.8rem',
              color: '#e8a045',
              fontWeight: 500,
            }}
            role="status"
          >
            {fattureUploadHint}
          </div>
        )}
      </div>

      {lastFattureUploadSummary && (
        <div
          className="card"
          style={{
            marginTop: '.2rem',
            padding: '.55rem .85rem',
            borderRadius: 8,
            fontSize: '.8rem',
          }}
        >
          <strong>Ultimo import:</strong>{' '}
          {lastFattureUploadSummary.imported ?? 0} in coda fatture
          {lastFattureUploadSummary.rejectedNonInvoice ? (
            <span>
              , {lastFattureUploadSummary.rejectedNonInvoice} scartati (tipo non fattura: F24, altro…)
            </span>
          ) : null}
          {lastFattureUploadSummary.skipped ? (
            <span>, {lastFattureUploadSummary.skipped} saltati (duplicati o altro)</span>
          ) : null}
          {lastFattureUploadSummary.errors ? (
            <span style={{ color: 'var(--err, #c00)' }}>, {lastFattureUploadSummary.errors} errori</span>
          ) : null}
          {Array.isArray(lastFattureUploadSummary.failures) && lastFattureUploadSummary.failures.length > 0 && (
            <div style={{ marginTop: '.25rem', fontSize: '.76rem', color: 'var(--mu)' }}>
              {lastFattureUploadSummary.failures.slice(0, 3).map((f) => `${f.fileName}: ${f.message}`).join(' · ')}
              {lastFattureUploadSummary.failures.length > 3 ? ' · …' : ''}
            </div>
          )}
          {lastFattureUploadSummary.importBatchKey && (
            <div style={{ marginTop: '.25rem', fontSize: '.76rem', color: 'var(--mu)' }}>
              Enrichment batch:{' '}
              {(() => {
                const st = String(lastFattureEnrichmentJob?.enrichment_status || lastFattureUploadSummary.enrichmentStatus || 'queued').toLowerCase()
                if (st === 'completed') return 'completato'
                if (st === 'partial') return 'parziale'
                if (st === 'error') return 'errore'
                if (st === 'running') return 'in corso'
                return 'in coda'
              })()}
              {lastFattureEnrichmentJob?.rows_total != null ? (
                <span>
                  {' '}({Number(lastFattureEnrichmentJob.rows_processed || 0)}/{Number(lastFattureEnrichmentJob.rows_total || 0)} righe)
                </span>
              ) : null}
            </div>
          )}
          {!aiEnabled && (
            <div style={{ marginTop: '.25rem', fontSize: '.76rem', color: 'var(--mu)' }}>
              IA studio disattivata: i PDF useranno classificazione di fallback (come in Import Documenti).
            </div>
          )}
        </div>
      )}

      {(noMatchQueueLoading || noMatchQueue.length > 0 || noMatchQueueError) && (
        <div
          className="card"
          style={{
            marginTop: '.45rem',
            padding: '.6rem .85rem',
            borderRadius: 8,
            borderColor: 'rgba(248, 186, 62, 0.45)',
            background: 'linear-gradient(180deg, rgba(69, 51, 18, 0.32), rgba(33, 24, 8, 0.35))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap' }}>
            <div>
              <strong>Coda no-match anagrafiche</strong>
              <div style={{ fontSize: '.76rem', color: 'var(--mu)', marginTop: '.2rem' }}>
                {noMatchQueueLoading ? 'Caricamento…' : `${noMatchQueue.length} soggetti da risolvere`}
              </div>
            </div>
            <button
              type="button"
              className="btn-sec"
              disabled={noMatchQueueLoading}
              onClick={() => {
                void refreshNoMatchQueue()
              }}
              style={{ padding: '.22rem .55rem', fontSize: '.72rem', borderRadius: 999 }}
            >
              Aggiorna
            </button>
          </div>
          {noMatchQueueError ? (
            <div style={{ marginTop: '.45rem', color: 'var(--err, #c00)', fontSize: '.76rem' }}>{noMatchQueueError}</div>
          ) : null}
          {!noMatchQueueLoading && noMatchQueue.length > 0 && (
            <div style={{ marginTop: '.55rem', display: 'grid', gap: '.45rem' }}>
              {noMatchQueue.slice(0, 12).map((item) => {
                const busy = noMatchBusyId === String(item?.id)
                const vat = String(item?.partita_iva || '').trim()
                const canBulkVat = Boolean(vat)
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid rgba(248, 186, 62, 0.35)',
                      borderRadius: 8,
                      padding: '.5rem .6rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap' }}>
                      <div>
                        <strong style={{ fontSize: '.82rem' }}>{item?.denominazione || 'Controparte non identificata'}</strong>
                        <div style={{ fontSize: '.74rem', color: 'var(--mu)', marginTop: '.18rem' }}>
                          P.IVA {item?.partita_iva || '—'} · CF {item?.codice_fiscale || '—'} · Tipo {item?.tipo_controparte || '—'}
                        </div>
                        <div style={{ fontSize: '.73rem', color: 'var(--mu)', marginTop: '.12rem' }}>
                          Anteprima: {item?.preview?.invoice_number || '—'} del {item?.preview?.invoice_date || '—'} · Totale {fmt(item?.preview?.total_amount)}
                        </div>
                        <div style={{ fontSize: '.73rem', color: 'var(--mu)', marginTop: '.12rem' }}>
                          Suggerimento conto: {item?.suggested_conto_label || item?.suggested_nome_conto || 'non disponibile'}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn-sec"
                          disabled={busy || !item?.suggested_conto_id}
                          onClick={() => {
                            void resolveNoMatchRow(item, {
                              decision: 'associate_existing',
                              existingContoId: item?.suggested_conto_id,
                              applySameVat: canBulkVat,
                            })
                          }}
                          style={{ padding: '.2rem .5rem', fontSize: '.7rem' }}
                        >
                          Associa suggerito
                        </button>
                        <button
                          type="button"
                          className="btn-sec"
                          disabled={busy}
                          onClick={() => {
                            const isProf = Boolean(item?.professionista_candidate)
                            void resolveNoMatchRow(item, {
                              decision: 'create_new',
                              applySameVat: canBulkVat,
                              professionistaConRitenuta: isProf,
                            })
                          }}
                          style={{ padding: '.2rem .5rem', fontSize: '.7rem' }}
                        >
                          Crea nuovo conto
                        </button>
                        <button
                          type="button"
                          className="btn-sec"
                          disabled={busy}
                          onClick={() => {
                            void resolveNoMatchRow(item, {
                              decision: 'skip',
                              applySameVat: canBulkVat,
                            })
                          }}
                          style={{ padding: '.2rem .5rem', fontSize: '.7rem' }}
                        >
                          Salta
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {(anagraficaUpdateLoading || anagraficaUpdateQueue.length > 0 || anagraficaUpdateError) && (
        <div
          className="card"
          style={{
            marginTop: '.45rem',
            padding: '.6rem .85rem',
            borderRadius: 8,
            borderColor: 'rgba(33, 150, 243, 0.45)',
            background: 'linear-gradient(180deg, rgba(9, 44, 74, 0.28), rgba(8, 30, 50, 0.34))',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.6rem', flexWrap: 'wrap' }}>
            <div>
              <strong>Auto-completamento anagrafica esistente</strong>
              <div style={{ fontSize: '.76rem', color: 'var(--mu)', marginTop: '.2rem' }}>
                {anagraficaUpdateLoading ? 'Caricamento…' : `${anagraficaUpdateQueue.length} proposte da validare`}
              </div>
            </div>
            <button
              type="button"
              className="btn-sec"
              disabled={anagraficaUpdateLoading}
              onClick={() => {
                void refreshAnagraficaUpdateQueue()
              }}
              style={{ padding: '.22rem .55rem', fontSize: '.72rem', borderRadius: 999 }}
            >
              Aggiorna
            </button>
          </div>
          {anagraficaUpdateError ? (
            <div style={{ marginTop: '.45rem', color: 'var(--err, #c00)', fontSize: '.76rem' }}>{anagraficaUpdateError}</div>
          ) : null}
          {!anagraficaUpdateLoading && anagraficaUpdateQueue.length > 0 && (
            <div style={{ marginTop: '.55rem', display: 'grid', gap: '.4rem' }}>
              {anagraficaUpdateQueue.slice(0, 12).map((item) => {
                const busy = anagraficaUpdateBusyId === String(item?.id)
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid rgba(33, 150, 243, 0.34)',
                      borderRadius: 8,
                      padding: '.45rem .55rem',
                      background: 'rgba(255,255,255,0.03)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: '.6rem',
                      flexWrap: 'wrap',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: '.79rem', fontWeight: 700 }}>
                        {item?.conto?.codice || 'CONTO'} - {item?.conto?.descrizione || 'senza descrizione'}
                      </div>
                      <div style={{ fontSize: '.74rem', color: 'var(--mu)', marginTop: '.14rem' }}>
                        Campo {item?.field_name}: "{item?.current_value || 'vuoto'}" → "{item?.proposed_value || 'vuoto'}"
                      </div>
                      <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginTop: '.08rem' }}>
                        Primo rilevamento {item?.first_seen_at ? new Date(item.first_seen_at).toLocaleDateString('it-IT') : '—'} ·
                        occorrenze {Number(item?.occurrence_count || 0)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '.35rem' }}>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={busy}
                        onClick={() => {
                          void decideAnagraficaUpdateRow(item, 'approve')
                        }}
                        style={{ padding: '.2rem .5rem', fontSize: '.7rem' }}
                      >
                        Approva
                      </button>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={busy}
                        onClick={() => {
                          void decideAnagraficaUpdateRow(item, 'reject')
                        }}
                        style={{ padding: '.2rem .5rem', fontSize: '.7rem' }}
                      >
                        Rifiuta
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {loadError && (
        <div className="card" style={{ padding: '.75rem 1rem', marginBottom: '1rem', borderColor: 'var(--err, #c00)' }}>
          <strong>Errore caricamento</strong>
          <div style={{ fontSize: '.88rem', marginTop: '.25rem' }}>{loadError}</div>
        </div>
      )}

      {!societaId ? (
        <div className="card" style={{ padding: '1rem', color: 'var(--mu)' }}>Seleziona una società per vedere la coda fatture.</div>
      ) : rows.length === 0 && !loading ? (
        <div className="card" style={{ padding: '1rem', color: 'var(--mu)' }}>
          Nessuna fattura in staging per questa società.
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '1rem',
            alignItems: 'stretch',
          }}
        >
          <div
            className="card"
            style={{
              padding: 0,
              overflow: 'auto',
              flex: '1 1 100%',
              minWidth: 0,
              borderRadius: 14,
              background: 'linear-gradient(180deg, rgba(12, 28, 48, 0.94), rgba(9, 24, 42, 0.96))',
              border: '1px solid rgba(61, 91, 124, 0.45)',
            }}
          >
            <div
              role="tablist"
              aria-label="Scelta coda fatture"
              style={{
                padding: '.38rem .75rem',
                borderTopLeftRadius: 14,
                borderTopRightRadius: 14,
                borderBottom: '1px solid var(--bd)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '.35rem',
                alignItems: 'center',
                background:
                  codaVista === 'pronte'
                    ? 'rgba(46, 125, 50, 0.08)'
                    : codaVista === 'da_completare'
                      ? 'rgba(251, 192, 45, 0.10)'
                      : codaVista === 'anomalie'
                        ? 'rgba(229, 57, 53, 0.10)'
                    : codaVista === 'registrate'
                      ? 'rgba(25, 118, 210, 0.09)'
                      : 'var(--s2)',
              }}
            >
              <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--mu)', marginRight: '.15rem' }}>Vista</span>
              <button
                type="button"
                role="tab"
                aria-selected={codaVista === 'tutte'}
                className={codaVista === 'tutte' ? 'btn' : 'btn-sec'}
                style={{
                  padding: '.22rem .58rem',
                  fontSize: '.74rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  borderRadius: 999,
                }}
                disabled={loading}
                onClick={() => {
                  setCodaVista('tutte')
                  setPreparazioneFilter('tutte')
                  setLavorazioneCheckFilter('tutte')
                  setStepCandidateFilter('tutte')
                  setConfermaPassoFilter('tutte')
                  setCandidateWorkingView(false)
                }}
              >
                Tutte
                <span
                  style={{
                    fontSize: '.68rem',
                    fontWeight: 800,
                    padding: '0 .4rem',
                    borderRadius: 999,
                    background: codaVista === 'tutte' ? 'rgba(255,255,255,0.35)' : 'var(--s2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  {rowCounts.caricate}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={codaVista === 'pronte'}
                className={codaVista === 'pronte' ? 'btn' : 'btn-sec'}
                style={{
                  padding: '.22rem .58rem',
                  fontSize: '.74rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  borderRadius: 999,
                }}
                disabled={loading}
                onClick={() => {
                  setCodaVista('pronte')
                  setCandidateWorkingView(false)
                }}
              >
                Pronte
                <span
                  style={{
                    fontSize: '.68rem',
                    fontWeight: 800,
                    padding: '0 .4rem',
                    borderRadius: 999,
                    background: codaVista === 'pronte' ? 'rgba(255,255,255,0.35)' : 'var(--s2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  {rowCounts.verdiControlliOk}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={codaVista === 'da_completare'}
                className={codaVista === 'da_completare' ? 'btn' : 'btn-sec'}
                style={{
                  padding: '.22rem .58rem',
                  fontSize: '.74rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  borderRadius: 999,
                }}
                disabled={loading}
                onClick={() => {
                  setCodaVista('da_completare')
                  setCandidateWorkingView(false)
                }}
              >
                Da completare
                <span
                  style={{
                    fontSize: '.68rem',
                    fontWeight: 800,
                    padding: '0 .4rem',
                    borderRadius: 999,
                    background: codaVista === 'da_completare' ? 'rgba(255,255,255,0.35)' : 'var(--s2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  {rowCounts.daCompletare}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={codaVista === 'anomalie'}
                className={codaVista === 'anomalie' ? 'btn' : 'btn-sec'}
                style={{
                  padding: '.22rem .58rem',
                  fontSize: '.74rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  borderRadius: 999,
                }}
                disabled={loading}
                onClick={() => {
                  setCodaVista('anomalie')
                  setCandidateWorkingView(false)
                }}
              >
                Anomalie
                <span
                  style={{
                    fontSize: '.68rem',
                    fontWeight: 800,
                    padding: '0 .4rem',
                    borderRadius: 999,
                    background: codaVista === 'anomalie' ? 'rgba(255,255,255,0.35)' : 'var(--s2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  {rowCounts.anomalie}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={codaVista === 'registrate'}
                className={codaVista === 'registrate' ? 'btn' : 'btn-sec'}
                style={{
                  padding: '.22rem .58rem',
                  fontSize: '.74rem',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '.35rem',
                  borderRadius: 999,
                }}
                disabled={loading}
                onClick={() => {
                  setCodaVista('registrate')
                  setCandidateWorkingView(false)
                }}
              >
                Registrate
                <span
                  style={{
                    fontSize: '.68rem',
                    fontWeight: 800,
                    padding: '0 .4rem',
                    borderRadius: 999,
                    background: codaVista === 'registrate' ? 'rgba(255,255,255,0.35)' : 'var(--s2)',
                    border: '1px solid var(--bd)',
                  }}
                >
                  {rowCounts.registrateArchivio}
                </span>
              </button>
              <span
                style={{
                  fontSize: '.72rem',
                  color: 'var(--mu)',
                  marginLeft: '.35rem',
                  paddingLeft: '.75rem',
                  borderLeft: '1px solid var(--bd)',
                }}
              >
                In pagina <strong>{rows.length}</strong>
                {' · '}
                Totale staging <strong>{fattureTotalRows}</strong>
              </span>
            </div>
            {codaVista === 'pronte' ? (
              <div
                style={{
                  padding: '.4rem 1rem',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '.4rem',
                  alignItems: 'center',
                  background: 'rgba(76, 175, 80, 0.06)',
                }}
              >
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--mu)' }}>Preparazione</span>
                {['tutte', 'ben_preparate', 'parziali'].map((key) => {
                  const labels = {
                    tutte: 'Tutte',
                    ben_preparate: 'Ben preparate',
                    parziali: 'Parziali',
                  }
                  const active = preparazioneFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={active ? 'btn' : 'btn-sec'}
                      style={{ padding: '.2rem .5rem', fontSize: '.72rem' }}
                      onClick={() => setPreparazioneFilter(key)}
                    >
                      {labels[key]}
                    </button>
                  )
                })}
                <span
                  style={{
                    fontSize: '.68rem',
                    color: 'var(--mu)',
                    marginLeft: '.25rem',
                    paddingLeft: '.65rem',
                    borderLeft: '1px solid var(--bd)',
                  }}
                >
                  Preparate <strong>{rowCounts.benPreparate}</strong>
                  {' · '}
                  Parziali <strong>{rowCounts.parzialiPreparate}</strong>
                </span>
                <span
                  style={{
                    fontSize: '.68rem',
                    color: 'var(--mu)',
                    marginLeft: '.25rem',
                    paddingLeft: '.65rem',
                    borderLeft: '1px solid var(--bd)',
                  }}
                >
                  Controlli (diagnosi locale)
                </span>
                {['tutte', 'con_problemi', 'ok'].map((key) => {
                  const labels = { tutte: 'Tutte', con_problemi: 'Con problemi', ok: 'OK' }
                  const active = lavorazioneCheckFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={active ? 'btn' : 'btn-sec'}
                      style={{ padding: '.2rem .5rem', fontSize: '.72rem' }}
                      onClick={() => setLavorazioneCheckFilter(key)}
                    >
                      {labels[key]}
                    </button>
                  )
                })}
              </div>
            ) : null}
            {codaVista === 'pronte' ? (
              <div
                style={{
                  padding: '.4rem 1rem',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '.4rem',
                  alignItems: 'center',
                  background: 'rgba(27, 94, 32, 0.07)',
                }}
              >
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--mu)' }}>Candidatura finale</span>
                {['tutte', 'candidate', 'non_candidate'].map((key) => {
                  const labels = { tutte: 'Tutte', candidate: 'Candidate', non_candidate: 'Non candidate' }
                  const active = stepCandidateFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={active ? 'btn' : 'btn-sec'}
                      style={{ padding: '.2rem .5rem', fontSize: '.72rem' }}
                      onClick={() => setStepCandidateFilter(key)}
                    >
                      {labels[key]}
                    </button>
                  )
                })}
                <span
                  style={{
                    fontSize: '.68rem',
                    color: 'var(--mu)',
                    marginLeft: '.25rem',
                    paddingLeft: '.65rem',
                    borderLeft: '1px solid var(--bd)',
                  }}
                >
                  Candidate in coda <strong>{rowCounts.candidateStep}</strong>
                </span>
                <button
                  type="button"
                  className="btn"
                  style={{ marginLeft: '.25rem' }}
                  disabled={candidateVisibleList.length === 0}
                  onClick={() => {
                    if (!candidateVisibleList.length) return
                    setCandidateWorkingView(true)
                    setPanelRowId(candidateVisibleList[0].id)
                  }}
                  title="Apre la working view sulla prima riga candidata nell'elenco filtrato"
                >
                  Working view candidate
                </button>
              </div>
            ) : null}
            {codaVista === 'pronte' ? (
              <div
                style={{
                  padding: '.4rem 1rem',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '.4rem',
                  alignItems: 'center',
                  background: 'rgba(0, 77, 64, 0.06)',
                }}
              >
                <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--mu)' }}>Conferma finale</span>
                {['tutte', 'confermate', 'non_confermate'].map((key) => {
                  const labels = { tutte: 'Tutte', confermate: 'Confermate', non_confermate: 'Non confermate' }
                  const active = confermaPassoFilter === key
                  return (
                    <button
                      key={key}
                      type="button"
                      className={active ? 'btn' : 'btn-sec'}
                      style={{ padding: '.2rem .5rem', fontSize: '.72rem' }}
                      onClick={() => setConfermaPassoFilter(key)}
                    >
                      {labels[key]}
                    </button>
                  )
                })}
                <span
                  style={{
                    fontSize: '.68rem',
                    color: 'var(--mu)',
                    marginLeft: '.25rem',
                    paddingLeft: '.65rem',
                    borderLeft: '1px solid var(--bd)',
                  }}
                >
                  Confermate valide <strong>{rowCounts.confermatePassoFinale}</strong>
                </span>
              </div>
            ) : null}
            <div
              style={{
                padding: '.38rem .75rem',
                borderBottom: '1px solid var(--bd)',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '.35rem',
                alignItems: 'center',
                background: 'rgba(8, 24, 45, 0.85)',
              }}
            >
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center' }}>
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--mu)' }}>Filtri rapidi</span>
                <input
                  className="input"
                  value={tableSearch}
                  onChange={(e) => setTableSearch(e.target.value)}
                  placeholder="Cerca soggetto o numero"
                  style={{ minWidth: 210, fontSize: '.72rem', padding: '.25rem .5rem' }}
                />
                <select
                  className="input"
                  value={tableSortBy}
                  onChange={(e) => setTableSortBy(e.target.value)}
                  style={{ fontSize: '.72rem', padding: '.22rem .45rem' }}
                  title="Ordina per"
                >
                  <option value="data">Ordina: Data</option>
                  <option value="soggetto">Ordina: Soggetto</option>
                  <option value="importo">Ordina: Importo</option>
                </select>
                <button
                  type="button"
                  className="btn-sec"
                  onClick={() => setTableSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999 }}
                >
                  {tableSortDir === 'asc' ? 'ASC' : 'DESC'}
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  onClick={exportCurrentListCsv}
                  disabled={!filteredRows.length}
                  title="Esporta in CSV la lista filtrata e ordinata corrente"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999 }}
                >
                  Export CSV
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  onClick={exportCurrentListExcel}
                  disabled={!filteredRows.length}
                  title="Esporta in Excel la lista filtrata e ordinata corrente"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999 }}
                >
                  Export Excel
                </button>
                <button
                  type="button"
                  className={tableColumnPickerOpen ? 'btn' : 'btn-sec'}
                  onClick={() => setTableColumnPickerOpen((prev) => !prev)}
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999 }}
                  title="Mostra o nasconde le colonne della tabella"
                >
                  Colonne
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!filteredRows.length}
                  onClick={() => setCheckedRowIds(filteredBenPreparataIds)}
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Complete {filteredBenPreparataIds.length}
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!filteredRows.length}
                  onClick={() => setCheckedRowIds(filteredIncompleteIds)}
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Incomplete {filteredIncompleteIds.length}
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!filteredRows.length}
                  onClick={() => setCheckedRowIds(filteredRows.map((x) => x.id))}
                  title="Seleziona tutte le righe visibili nella tabella"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Tutto
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!checkedRowIds.length}
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Selezionate {checkedRowIds.length}
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!panelRow}
                  onClick={selectSameCounterpartyAsPanel}
                  title="Spunta tutte le righe visibili con la stessa controparte della fattura selezionata"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Stesso fornitore
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!panelRow}
                  onClick={() => {
                    const panelHist = String(
                      historicalContoTopByImportId[panelRow.id] || historicalContoBuilt[0]?.codice || '',
                    ).trim()
                    const panelCod = String(
                      pickImportFatturaStagingContoCodice(panelRow, pianoConti, panelHist) || '',
                    ).trim()
                    if (!panelCod) return
                    const ids = filteredRows
                      .filter((x) => {
                        const h = String(historicalContoTopByImportId[x.id] || '').trim()
                        return pickImportFatturaStagingContoCodice(x, pianoConti, h) === panelCod
                      })
                      .map((x) => x.id)
                    setCheckedRowIds(ids)
                  }}
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Stesso conto
                </button>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem', alignItems: 'center' }}>
                <span style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--mu)' }}>Azioni</span>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!filteredRows.length}
                  onClick={openNextPanelRow}
                  title="Scorre la selezione alla riga successiva nella vista corrente"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Prossima
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!checkedRowIds.length || markBusy || loading}
                  onClick={() => void rimuoviCheckedDaLavorazione()}
                  title="Rimuove la marcatura operatore (reversibile)"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(141,160,189,.35)' }}
                >
                  Rimuovi
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!panelRow || !checkedRowIds.length || applySameCpBusy || markBusy || loading}
                  onClick={() => void applicaPreparazioneASelezionati()}
                  title="Applica i dati _fiscosim* della fattura corrente alle righe selezionate compatibili"
                  style={{ padding: '.23rem .55rem', fontSize: '.74rem', borderRadius: 999, borderColor: 'rgba(46, 125, 50, .45)' }}
                >
                  Applica a selezionati
                </button>
                {queueFullView ? (
                  <label
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '.35rem',
                      fontSize: '.72rem',
                      color: 'var(--mu)',
                    }}
                  >
                    Data registrazione
                    <input
                      type="date"
                      value={toolbarDataRegistrazione}
                      onChange={(e) => setToolbarDataRegistrazione(e.target.value)}
                      title="Data effettiva di registrazione in prima nota e riferimento periodo IVA (salvata in contabilizzazione)"
                      style={{
                        padding: '.16rem .42rem',
                        fontSize: '.74rem',
                        borderRadius: 8,
                        border: '1px solid var(--bd)',
                        background: 'var(--s1)',
                        color: 'var(--t1)',
                      }}
                    />
                  </label>
                ) : null}
                <button
                  type="button"
                  className="btn-sec"
                  disabled={!checkedRowIds.length || deleteBusy || markBusy || loading}
                  onClick={() => void eliminaFattureSelezionate()}
                  title="Elimina le fatture selezionate; se già collegate alla contabilità esegue anche la pulizia coerente dei riferimenti"
                  style={{
                    padding: '.23rem .55rem',
                    fontSize: '.74rem',
                    borderRadius: 999,
                    borderColor: 'rgba(229, 57, 53, .45)',
                    color: 'rgba(255, 214, 214, .95)',
                    background: 'rgba(229, 57, 53, .10)',
                  }}
                >
                  {deleteBusy ? deleteProgress || 'Eliminazione…' : 'Elimina selezionate'}
                </button>
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '.42rem', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.7rem', color: 'var(--mu)' }}>{checkedRowIds.length} selezionate</span>
                {lastBulkActionLog ? (
                  <span style={{ fontSize: '.66rem', color: 'var(--mu)' }} title="Ultimo log azione bulk applicata in questa sessione">
                    Bulk {lastBulkActionLog.action}: {lastBulkActionLog.updated} aggiornate
                  </span>
                ) : null}
                <button
                  type="button"
                  className="btn"
                  disabled={!checkedRowIds.length || markBusy || loading}
                  onClick={() => void avviaContabilizzazioneEDWorking()}
                  title="Segna le selezionate come in lavorazione e apre subito la working view (non contabilizza da sola)"
                  style={{
                    padding: '.28rem .68rem',
                    fontSize: '.74rem',
                    fontWeight: 700,
                    background: 'linear-gradient(90deg, rgba(255, 193, 7, 0.65), rgba(255, 179, 0, 0.9))',
                    borderColor: 'rgba(255, 193, 7, 0.95)',
                    color: '#10223b',
                  }}
                >
                  {markBusy ? 'Salvataggio…' : 'Avvia contabilizzazione'}
                </button>
                <button
                  type="button"
                  className="btn-sec"
                  disabled={bulkContabilizzaBusy || registrazioneFinaleBusy || archivioBridgeBusy || loading || queueLoading}
                  onClick={() => void contabilizzaTutteLePronte()}
                  title="Contabilizza in bulk solo le righe con conferma finale valida e controlli verdi reali"
                  style={{
                    padding: '.28rem .68rem',
                    fontSize: '.74rem',
                    fontWeight: 700,
                    borderRadius: 999,
                    borderColor: 'rgba(46, 125, 50, .5)',
                    color: 'rgba(220,245,220,.98)',
                    background: 'rgba(46, 125, 50, .16)',
                  }}
                >
                  {bulkContabilizzaBusy ? 'Contabilizzazione bulk…' : 'Contabilizza tutte le pronte'}
                </button>
              </div>
            </div>
            {tableColumnPickerOpen ? (
              <div
                style={{
                  padding: '.45rem .75rem',
                  borderBottom: '1px solid var(--bd)',
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '.6rem .8rem',
                  alignItems: 'center',
                  background: 'rgba(18, 40, 66, 0.86)',
                }}
              >
                <span style={{ fontSize: '.7rem', color: 'var(--mu)', fontWeight: 700 }}>Colonne visibili</span>
                {IMPORT_FATTURE_TABLE_COLUMNS.map((col) => (
                  <label key={col.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '.34rem', fontSize: '.7rem', color: 'var(--mu)' }}>
                    <input
                      type="checkbox"
                      checked={tableVisibleColumns[col.key] !== false}
                      onChange={(e) => {
                        const checked = Boolean(e.target.checked)
                        setTableVisibleColumns((prev) => {
                          const next = sanitizeImportFattureVisibleColumns(prev)
                          next[col.key] = checked
                          return next
                        })
                      }}
                    />
                    {col.label}
                  </label>
                ))}
                <button
                  type="button"
                  className="btn-sec"
                  onClick={() => setTableVisibleColumns({ ...IMPORT_FATTURE_DEFAULT_VISIBLE_COLUMNS })}
                  style={{ padding: '.2rem .5rem', fontSize: '.7rem', borderRadius: 999 }}
                >
                  Reset colonne
                </button>
              </div>
            ) : null}
            {candidateWorkingView && queueFullView ? (
              <div
                style={{
                  padding: '.65rem 1rem',
                  fontSize: '.68rem',
                  color: 'var(--mu)',
                  lineHeight: 1.45,
                  background: 'rgba(27, 94, 32, 0.07)',
                  borderBottom: '1px solid var(--bd)',
                }}
              >
                <strong style={{ color: '#1b5e20' }}>Working view attiva</strong> — la tabella è nascosta per ridurre il rumore
                visivo; filtri e azioni sopra restano utilizzabili. Usa <strong>Esci dalla working view</strong> nel pannello destro per
                rivedere l’elenco.
              </div>
            ) : null}
            {!(candidateWorkingView && queueFullView) ? (
              <ImportFattureVirtualTable
                candidateWorkingView={candidateWorkingView}
                queueFullView={queueFullView}
                filteredRows={filteredRows}
                codaVista={codaVista}
                confermaPassoFilter={confermaPassoFilter}
                stepCandidateFilter={stepCandidateFilter}
                lavorazioneCheckFilter={lavorazioneCheckFilter}
                preparazioneFilter={preparazioneFilter}
                checkedRowIdSet={checkedRowIdSet}
                checkedRowIdsLength={checkedRowIds.length}
                allVisibleRowsChecked={allVisibleRowsChecked}
                onToggleSelectAllVisible={toggleSelectAllVisible}
                rowViewModelById={rowViewModelById}
                rowEvalById={rowEvalById}
                panelRowId={panelRowId}
                readinessOpts={readinessOpts}
                pianoConti={pianoConti}
                pianoContiByCodice={pianoContiByCodice}
                causaliContabili={causaliContabili}
                causaliContabiliById={causaliContabiliById}
                causaliIva={causaliIva}
                historicalContoTopByImportId={historicalContoTopByImportId}
                historicalCausaleContabileIdByImportId={historicalCausaleContabileIdByImportId}
                historicalIvaTopByImportId={historicalIvaTopByImportId}
                tableInlineContoOptions={tableInlineContoOptions}
                tableInlineCausaleContabileOptions={tableInlineCausaleContabileOptions}
                tableInlineCausaleIvaOptions={tableInlineCausaleIvaOptions}
                inlineEditRowId={inlineEditRowId}
                inlineEditField={inlineEditField}
                tableInlineQuery={tableInlineQuery}
                tableInlineSaveId={tableInlineSaveId}
                tableInlineBusy={tableInlineBusy}
                onSelectRow={setPanelRowId}
                onToggleRowChecked={toggleRowChecked}
                onStartInlineEdit={startTableInlineEdit}
                onTableInlineQueryChange={setTableInlineQuery}
                onCloseInlineEdit={closeTableInlineEdit}
                onPersistTableRowAccountingPatch={persistTableRowAccountingPatch}
                onOpenPreview={openPreview}
                resetScrollKey={tableResetScrollKey}
                rowsTotal={rows.length}
                tableVisibleColumns={tableVisibleColumns}
              />
            ) : null}
          </div>

          {candidateWorkingView && queueFullView && (
          <div
            style={{
              flex: '1 1 100%',
              maxWidth: '100%',
              minWidth: 0,
              position: 'sticky',
              top: 12,
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'stretch',
              maxHeight: 'calc(100vh - 116px)',
            }}
          >
            {!panelRow ? (
              <div className="card" style={{ padding: '1rem', color: 'var(--mu)', fontSize: '.9rem', flex: '1 1 100%' }}>
                Seleziona una fattura dalla tabella per aprire il pannello.
              </div>
            ) : (
              <>
                <aside
                  className="card"
                  style={{
                    flex: '1 1 300px',
                    maxWidth: 520,
                    minWidth: 260,
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 12,
                    border: '1px solid rgba(61, 91, 124, 0.45)',
                    background: 'linear-gradient(180deg, rgba(12, 28, 48, 0.94), rgba(9, 24, 42, 0.96))',
                    boxShadow: panelRow ? 'inset 0 0 0 2px rgba(212, 165, 32, 0.35)' : undefined,
                  }}
                >
                  <div
                    style={{
                      padding: '.55rem .75rem',
                      borderBottom: '1px solid var(--bd)',
                      fontSize: '.72rem',
                      fontWeight: 800,
                      color: 'rgba(211,225,240,.95)',
                      letterSpacing: '.04em',
                    }}
                  >
                    Anteprima file originale caricato
                  </div>
                  <div style={{ flex: 1, overflow: 'auto', padding: '.65rem', maxHeight: 'min(62vh, 640px)' }}>
                    {!panelFilePath ? (
                      <div style={{ color: 'var(--mu)', fontSize: '.78rem', padding: '.5rem' }}>
                        File originale non disponibile per questa riga.
                      </div>
                    ) : panelPreviewUrl && (panelOriginalKind === 'pdf' || panelOriginalKind === 'xml') ? (
                      <iframe
                        title="Anteprima file originale"
                        src={panelPreviewUrl}
                        style={{ width: '100%', height: '100%', minHeight: 440, border: '1px solid var(--bd)', borderRadius: 8, background: 'white' }}
                      />
                    ) : (
                      <div style={{ color: 'var(--mu)', fontSize: '.78rem', padding: '.5rem', lineHeight: 1.45 }}>
                        Anteprima inline non disponibile per questo formato ({panelOriginalKind.toUpperCase()}).
                        <br />
                        Usa il pulsante sotto per aprire il file originale completo.
                      </div>
                    )}
                  </div>
                  <div style={{ padding: '.55rem .75rem', borderTop: '1px solid var(--bd)' }}>
                    <button
                      type="button"
                      className="btn-sec"
                      style={{ width: '100%', fontSize: '.74rem' }}
                      onClick={() => openPreview(panelRow)}
                    >
                      Apri file originale completo
                    </button>
                  </div>
                </aside>
                <section
                  className="card"
                  style={{
                    flex: '2 1 380px',
                    minWidth: 280,
                    padding: 0,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: 12,
                    border: '1px solid rgba(27, 94, 32, 0.35)',
                    background: 'rgba(8, 24, 45, 0.94)',
                    maxHeight: 'calc(100vh - 116px)',
                    boxShadow: panelRow ? 'inset 0 0 0 2px rgba(212, 165, 32, 0.28)' : undefined,
                  }}
                >
                  <div
                    style={{
                      padding: '.52rem .72rem',
                      borderBottom: '1px solid var(--bd)',
                      display: 'flex',
                      flexWrap: 'wrap',
                      gap: '.45rem',
                      alignItems: 'center',
                      background: 'rgba(10, 32, 48, 0.96)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn-sec"
                      disabled={workingViewNavList.length < 2}
                      onClick={gotoPrevCandidateInView}
                      title="Documento precedente nella coda di lavoro"
                    >
                      ← Prec.
                    </button>
                    <button
                      type="button"
                      className="btn-sec"
                      disabled={workingViewNavList.length < 2}
                      onClick={gotoNextCandidateInView}
                      title="Documento successivo nella coda di lavoro"
                    >
                      Succ. →
                    </button>
                    <span style={{ fontSize: '.68rem', color: 'var(--mu)', fontWeight: 600 }}>
                      {workingViewNavList.length
                        ? (() => {
                            const wi = workingViewNavList.findIndex((x) => x.id === panelRowId)
                            return `${wi >= 0 ? wi + 1 : 1} / ${workingViewNavList.length}`
                          })()
                        : '—'}
                    </span>
                    <span style={{ fontSize: '.58rem', color: 'var(--mu)' }} title="Shortcut tastiera working view">
                      Shortcut: Alt+←/→ | Alt+Enter contabilizza | Alt+S prossima
                    </span>
                    <button type="button" className="btn-sec" onClick={() => setCandidateWorkingView(false)}>
                      Torna all&apos;elenco
                    </button>
                  </div>
                  <div style={{ padding: '.65rem .85rem', borderBottom: '1px solid var(--bd)' }}>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '.65rem',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{ minWidth: 0, flex: '1 1 200px' }}>
                        <div
                          style={{
                            fontSize: '.58rem',
                            fontWeight: 800,
                            letterSpacing: '.12em',
                            color: 'var(--mu)',
                          }}
                        >
                          FATTURA IN LAVORAZIONE
                        </div>
                        <div
                          style={{
                            fontWeight: 800,
                            fontSize: '.92rem',
                            wordBreak: 'break-word',
                            color: 'rgba(230,240,252,.96)',
                          }}
                        >
                          {panelRow.filename || 'Documento'}
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginTop: 6 }}>
                          {panelRow.tipo_documento || '—'} · {panelRow.stato || '—'} · N. {effectiveNumeroData(panelRow).num} · Data{' '}
                          {effectiveNumeroData(panelRow).data}
                        </div>
                      </div>
                      <div style={{ flex: '0 0 auto' }}>
                        {(() => {
                          const pr = isProntaLavorazioneRow(panelRow)
                          const hasBlock = panelPreCommitSemaforo === 'rosso'
                          const ben = pr && isBenPreparata(panelRow, readinessOptsWorkingPanel)
                          const softOk = !panelDiagnosiPronta || panelDiagnosiPronta.level === 'ok'
                          const rowOk = pr && panelPreCommitSemaforo === 'verde' && ben && softOk
                          const rowBlocked = pr && panelPreCommitSemaforo === 'rosso'
                          const rowWarn = pr && !rowOk && !rowBlocked
                          const lab = rowOk
                            ? 'Pronta'
                            : rowBlocked
                              ? 'Contabilizzazione bloccata'
                              : rowWarn
                                ? 'Da verificare'
                                : 'Incompleta'
                          const c = rowOk ? '#2e7d32' : rowBlocked ? '#e53935' : rowWarn ? '#f9a825' : '#e53935'
                          const bg = rowOk
                            ? 'rgba(46, 125, 50, 0.2)'
                            : rowBlocked
                              ? 'rgba(229, 57, 53, 0.22)'
                              : rowWarn
                                ? 'rgba(251, 192, 45, 0.2)'
                                : 'rgba(229, 57, 53, 0.15)'
                          return (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 8,
                                padding: '6px 14px',
                                borderRadius: 999,
                                fontWeight: 800,
                                fontSize: '.78rem',
                                background: bg,
                                color: c,
                                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.08)',
                              }}
                              title={
                                rowOk
                                  ? 'Controlli bloccanti superati e preparazione OK'
                                  : rowBlocked
                                    ? 'Violazioni contabili/fiscali strutturali — contabilizzazione non consentita'
                                    : rowWarn
                                      ? 'Avvisi non bloccanti o preparazione da completare'
                                      : 'Non pronta'
                              }
                            >
                              <span style={{ width: 9, height: 9, borderRadius: 999, background: c }} />
                              {lab}
                            </span>
                          )
                        })()}
                      </div>
                    </div>
                    {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                      <div style={{ marginTop: '.65rem', display: 'flex', flexWrap: 'wrap', gap: '.45rem', alignItems: 'center' }}>
                        {panelConfermaPassoFinaleValida && !panelArchivioGiaRegistrato ? (
                          <button
                            type="button"
                            className="btn"
                            style={{ padding: '.38rem .95rem', fontSize: '.8rem', fontWeight: 800 }}
                            disabled={
                              archivioBridgeBusy ||
                              registrazioneFinaleBusy ||
                              finalStepConfirmBusy ||
                              opSaveBusy ||
                              accSaveBusy ||
                              ivaSaveBusy ||
                              panelAccountingBlocks.length > 0
                            }
                            onClick={() => void contabilizzaCompletaDaWorkingView()}
                            title="Conferma il documento in archivio e registra in prima nota (percorso Contabilità)"
                          >
                            {archivioBridgeBusy || registrazioneFinaleBusy
                              ? 'Contabilizzazione…'
                              : 'Contabilizza'}
                          </button>
                        ) : null}
                        {!panelArchivioGiaRegistrato &&
                        isProntaLavorazioneRow(panelRow) &&
                        panelPreCommitSemaforo === 'giallo' &&
                        panelAccountingBlocks.length === 0 &&
                        isBenPreparata(panelRow, readinessOptsWorkingPanel) ? (
                          <button
                            type="button"
                            className="btn-sec"
                            style={{ padding: '.38rem .95rem', fontSize: '.8rem', fontWeight: 800 }}
                            disabled={
                              archivioBridgeBusy ||
                              registrazioneFinaleBusy ||
                              finalStepConfirmBusy ||
                              opSaveBusy ||
                              accSaveBusy ||
                              ivaSaveBusy
                            }
                            onClick={() => void contabilizzaCompletaDaWorkingView({ allowWarningOverride: true })}
                            title="Contabilizza con override esplicito sui warning non bloccanti (semaforo giallo)"
                          >
                            {archivioBridgeBusy || registrazioneFinaleBusy ? 'Contabilizzazione…' : 'Forza con warning'}
                          </button>
                        ) : null}
                        {panelCandidateNextStep && !panelConfermaPassoFinaleValida ? (
                          <button
                            type="button"
                            className="btn"
                            disabled={
                              finalStepConfirmBusy ||
                              opSaveBusy ||
                              accSaveBusy ||
                              ivaSaveBusy ||
                              panelAccountingBlocks.length > 0
                            }
                            onClick={() => void confermaPassoFinaleMetadati()}
                            title="Marcatura metadati passo finale"
                          >
                            {finalStepConfirmBusy ? 'Salvataggio…' : 'Conferma per passo finale'}
                          </button>
                        ) : null}
                        {panelHasFinalStepFlag ? (
                          <button
                            type="button"
                            className="btn-sec"
                            disabled={finalStepConfirmBusy || opSaveBusy || accSaveBusy || ivaSaveBusy}
                            onClick={() => void annullaConfermaPassoFinale()}
                          >
                            Annulla conferma passo finale
                          </button>
                        ) : null}
                        {parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.FINAL_STEP_CONFIRMATION_AT] ? (
                          <span style={{ fontSize: '.58rem', color: 'var(--mu)' }}>
                            Ultimo agg. conferma:{' '}
                            {new Date(
                              String(parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.FINAL_STEP_CONFIRMATION_AT]),
                            ).toLocaleString('it-IT')}
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                    {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                      <div style={{ marginTop: '.55rem', display: 'grid', gap: '.5rem' }}>
                        {panelAccountingBlocks.length ? (
                          <div
                            style={{
                              padding: '.55rem .65rem',
                              borderRadius: 8,
                              background: 'rgba(183, 28, 28, 0.18)',
                              border: '1px solid rgba(229, 57, 53, 0.55)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '.74rem',
                                fontWeight: 900,
                                color: '#ffcdd2',
                                marginBottom: '.4rem',
                                letterSpacing: '.04em',
                              }}
                            >
                              Contabilizzazione bloccata — controlli non bypassabili
                            </div>
                            <div style={{ fontSize: '.62rem', color: '#ffebee', marginBottom: '.45rem', lineHeight: 1.45 }}>
                              Risolvi tutti i punti sotto: nessun override operatore e nessuna contabilizzazione finché non sono a
                              posto.
                            </div>
                            <div style={{ display: 'grid', gap: '.35rem' }}>
                              {panelAccountingBlocks.map((item, idx) => (
                                <button
                                  key={`block-${item.tab}-${idx}`}
                                  type="button"
                                  className="btn-sec"
                                  onClick={() => setImportWorkingTab(item.tab)}
                                  style={{
                                    textAlign: 'left',
                                    fontSize: '.66rem',
                                    padding: '.32rem .45rem',
                                    borderColor: 'rgba(255,255,255,.28)',
                                    background: 'rgba(0,0,0,.25)',
                                    color: '#fff8f8',
                                  }}
                                  title={`Apri scheda ${item.tab === 'prima_nota' ? 'Prima nota' : item.tab === 'iva' ? 'IVA' : 'Partitario'}`}
                                >
                                  <strong style={{ fontSize: '.58rem', opacity: 0.9 }}>
                                    [{item.tab === 'prima_nota' ? 'PN' : item.tab === 'iva' ? 'IVA' : 'Part.'}]
                                  </strong>{' '}
                                  {item.message}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {!panelAccountingBlocks.length && workingViewMissingItems.length ? (
                          <div
                            style={{
                              padding: '.55rem .65rem',
                              borderRadius: 8,
                              background: 'rgba(245, 124, 0, 0.12)',
                              border: '1px solid rgba(245, 124, 0, 0.45)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '.72rem',
                                fontWeight: 800,
                                color: '#ffe0b2',
                                marginBottom: '.35rem',
                                letterSpacing: '.03em',
                              }}
                            >
                              Avvisi (non bloccanti)
                            </div>
                            <div style={{ display: 'grid', gap: '.35rem' }}>
                              {workingViewMissingItems.map((item, idx) => (
                                <button
                                  key={`soft-${item.tab}-${idx}`}
                                  type="button"
                                  className="btn-sec"
                                  onClick={() => setImportWorkingTab(item.tab)}
                                  style={{
                                    textAlign: 'left',
                                    fontSize: '.66rem',
                                    padding: '.32rem .45rem',
                                    borderColor: 'rgba(255,255,255,.2)',
                                    background: 'rgba(0,0,0,.2)',
                                  }}
                                  title={`Apri scheda ${item.tab === 'prima_nota' ? 'Prima nota' : item.tab === 'iva' ? 'IVA' : 'Partitario'}`}
                                >
                                  {item.message}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {!panelAccountingBlocks.length &&
                        !workingViewMissingItems.length &&
                        isBenPreparata(panelRow, readinessOptsWorkingPanel) &&
                        (!panelDiagnosiPronta || panelDiagnosiPronta.level === 'ok') ? (
                          <div
                            style={{
                              padding: '.55rem .65rem',
                              borderRadius: 8,
                              background: 'rgba(46, 125, 50, 0.14)',
                              border: '1px solid rgba(46, 125, 50, 0.4)',
                            }}
                          >
                            <div
                              style={{
                                fontSize: '.72rem',
                                fontWeight: 800,
                                color: '#c8e6c9',
                                marginBottom: '.35rem',
                                letterSpacing: '.03em',
                              }}
                            >
                              Controlli bloccanti superati
                            </div>
                            <div style={{ fontSize: '.66rem', color: '#e8f5e9' }}>
                              Nessun blocco strutturale e controlli preparatori OK: puoi confermare e contabilizzare quando vuoi.
                            </div>
                          </div>
                        ) : !panelAccountingBlocks.length &&
                          (!isBenPreparata(panelRow, readinessOptsWorkingPanel) ||
                            (panelDiagnosiPronta && panelDiagnosiPronta.level !== 'ok')) &&
                          !workingViewMissingItems.length ? (
                          <div
                            style={{
                              padding: '.55rem .65rem',
                              borderRadius: 8,
                              background: 'rgba(245, 124, 0, 0.1)',
                              border: '1px solid rgba(245, 124, 0, 0.38)',
                            }}
                          >
                            <div style={{ fontSize: '.66rem', color: '#ffe0b2', lineHeight: 1.45 }}>
                              Controlli bloccanti superati, ma la preparazione o la diagnosi non risultano ancora OK: usa le
                              schede e il riquadro «Controlli (riferimento)» sotto.
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    <p style={{ fontSize: '.58rem', color: 'var(--mu)', margin: '.5rem 0 0', lineHeight: 1.45 }}>
                      I filtri in alto restano attivi; nessuna contabilizzazione automatica. Passa tra le schede per operare come prima.
                    </p>
                  </div>
                  <div
                    role="tablist"
                    aria-label="Area lavoro fattura"
                    style={{
                      display: 'flex',
                      borderBottom: '1px solid var(--bd)',
                      background: 'rgba(8, 22, 38, 0.92)',
                    }}
                  >
                    {[
                      { id: 'suggerimenti', label: 'Suggerimenti IA' },
                      { id: 'prima_nota', label: 'Prima nota' },
                      { id: 'iva', label: 'IVA' },
                      { id: 'partitario', label: 'Partitario' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        role="tab"
                        aria-selected={importWorkingTab === t.id}
                        onClick={() => setImportWorkingTab(t.id)}
                        style={{
                          flex: 1,
                          padding: '.52rem .35rem',
                          fontSize: '.74rem',
                          fontWeight: 700,
                          border: 'none',
                          borderBottom:
                            importWorkingTab === t.id ? '2px solid rgba(212, 165, 32, 0.95)' : '2px solid transparent',
                          background: importWorkingTab === t.id ? 'rgba(255,255,255,.07)' : 'transparent',
                          color: importWorkingTab === t.id ? 'rgba(230,240,252,.96)' : 'var(--mu)',
                          cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ flex: 1, overflowY: 'auto', padding: '.75rem .85rem' }}>
                    <div style={{ display: importWorkingTab === 'suggerimenti' ? 'block' : 'none' }}>
                      <div
                        style={{
                          marginBottom: '.75rem',
                          padding: '.75rem',
                          border: '1px solid var(--bd)',
                          borderRadius: 8,
                          background: 'rgba(17, 38, 63, 0.55)',
                        }}
                      >
                        <div style={{ fontSize: '.74rem', fontWeight: 800, color: 'rgba(230,240,252,.95)', marginBottom: '.35rem' }}>
                          Suggerimenti IA (riferimento operativo)
                        </div>
                        <div style={{ fontSize: '.64rem', color: 'var(--mu)', lineHeight: 1.45 }}>
                          Nessuna contabilizzazione automatica: questa scheda mostra proposta, motivazioni e alternative per ridurre errori,
                          ma la decisione finale resta operatore.
                        </div>
                      </div>

                      <div
                        style={{
                          marginBottom: '.65rem',
                          padding: '.7rem',
                          border: '1px solid rgba(124,157,202,.28)',
                          borderRadius: 8,
                          background: 'rgba(10, 30, 52, 0.55)',
                        }}
                      >
                        <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--mu)', marginBottom: '.35rem', letterSpacing: '.05em' }}>
                          CONTO ECONOMICO PROPOSTO
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'rgba(230,240,252,.95)', marginBottom: '.35rem' }}>
                          {accountDecision?.top1?.codice ? (
                            <>
                              <strong>{accountDecision.top1.codice}</strong> — {accountDecision.top1.descrizione || '—'}
                            </>
                          ) : (
                            'Nessun conto suggerito'
                          )}
                        </div>
                        <div style={{ fontSize: '.63rem', color: 'var(--mu)', marginBottom: '.25rem' }}>
                          Fonte principale:{' '}
                          <strong>
                            {accountDecision?.top1?.source === 'history'
                              ? 'Storico stessa controparte'
                              : accountDecision?.top1?.source === 'ai'
                                ? 'IA su testo documento'
                                : accountDecision?.top1?.source
                                  ? 'Anagrafica / regole'
                                  : '—'}
                          </strong>
                        </div>
                        <div style={{ fontSize: '.63rem', color: 'var(--mu)' }}>
                          Confidenza:{' '}
                          <strong>
                            {accountDecision?.top1?.source === 'history'
                              ? 'Alta'
                              : accountDecision?.top1?.source === 'ai'
                                ? 'Media'
                                : accountDecision?.top1?.source
                                  ? 'Alta'
                                  : 'Bassa'}
                          </strong>
                        </div>
                        {Array.isArray(accountDecision?.top1?.reasons) && accountDecision.top1.reasons.length ? (
                          <ul style={{ margin: '.45rem 0 0 1rem', padding: 0, fontSize: '.62rem', color: 'var(--mu)', lineHeight: 1.45 }}>
                            {accountDecision.top1.reasons.slice(0, 3).map((r, i) => (
                              <li key={`acc-reason-${i}`}>{r}</li>
                            ))}
                          </ul>
                        ) : null}
                        {Array.isArray(accountDecision?.suggestions) && accountDecision.suggestions.length > 1 ? (
                          <div style={{ marginTop: '.45rem', fontSize: '.62rem', color: 'var(--mu)' }}>
                            Alternative non prioritarie:{' '}
                            {accountDecision.suggestions
                              .slice(1, 4)
                              .map((s) => `${s.codice || '—'} (${s.source || 'n/a'})`)
                              .join(' · ')}
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          marginBottom: '.65rem',
                          padding: '.7rem',
                          border: '1px solid rgba(124,157,202,.28)',
                          borderRadius: 8,
                          background: 'rgba(10, 30, 52, 0.55)',
                        }}
                      >
                        <div style={{ fontSize: '.7rem', fontWeight: 800, color: 'var(--mu)', marginBottom: '.35rem', letterSpacing: '.05em' }}>
                          CAUSALE IVA PROPOSTA
                        </div>
                        <div style={{ fontSize: '.72rem', color: 'rgba(230,240,252,.95)', marginBottom: '.35rem' }}>
                          {ivaProposal?.suggestedCausaleId
                            ? (() => {
                                const c = causaliIva.find((x) => String(x.id) === String(ivaProposal.suggestedCausaleId))
                                return c ? `${c.codice} — ${c.descrizione}` : ivaProposal.suggestedCausaleId
                              })()
                            : 'Nessuna causale IVA suggerita'}
                        </div>
                        <div style={{ fontSize: '.63rem', color: 'var(--mu)', marginBottom: '.25rem' }}>
                          Fonte principale:{' '}
                          <strong>
                            {ivaProposal?.source === 'anagrafica'
                              ? 'Anagrafica conto'
                              : ivaProposal?.source === 'history'
                                ? 'Storico soggetto'
                                : ivaProposal?.source === 'document'
                                  ? 'Riepilogo documento'
                                  : ivaProposal?.source === 'default_percentuale'
                                    ? 'Default per aliquota'
                                    : 'Verifica manuale'}
                          </strong>
                        </div>
                        <div style={{ fontSize: '.63rem', color: 'var(--mu)' }}>
                          Confidenza:{' '}
                          <strong>
                            {ivaProposal?.status === 'strong' ? 'Alta' : ivaProposal?.status === 'suggested' ? 'Media' : 'Bassa'}
                          </strong>
                        </div>
                        {ivaProposal?.warning ? (
                          <div style={{ marginTop: '.4rem', fontSize: '.62rem', color: '#d7b46a' }}>
                            Motivo prudenziale: {ivaProposal.warning}
                          </div>
                        ) : null}
                        {Array.isArray(ivaProposal?.historicalSuggestions) && ivaProposal.historicalSuggestions.length > 1 ? (
                          <div style={{ marginTop: '.45rem', fontSize: '.62rem', color: 'var(--mu)' }}>
                            Alternative non prioritarie:{' '}
                            {ivaProposal.historicalSuggestions
                              .slice(1, 4)
                              .map((s) => `${s.causale?.codice || s.id} (${s.count})`)
                              .join(' · ')}
                          </div>
                        ) : null}
                      </div>

                      <div
                        style={{
                          padding: '.7rem',
                          border: '1px solid rgba(124,157,202,.24)',
                          borderRadius: 8,
                          background: 'rgba(8, 22, 38, 0.45)',
                        }}
                      >
                        <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.3rem' }}>
                          Perché non propongo altro?
                        </div>
                        <ul style={{ margin: '0 0 0 1rem', padding: 0, fontSize: '.62rem', color: 'var(--mu)', lineHeight: 1.45 }}>
                          <li>La gerarchia prioritaria conto è: anagrafica controparte {'->'} storico confermato {'->'} suggerimento IA.</li>
                          <li>La gerarchia causale IVA è: anagrafica {'->'} storico dominante {'->'} riepilogo documento {'->'} default aliquota.</li>
                          <li>In presenza di incoerenze o storico non dominante, lo stato resta prudenziale e richiede verifica manuale.</li>
                        </ul>
                      </div>
                    </div>

                    <div style={{ display: importWorkingTab === 'prima_nota' ? 'block' : 'none' }}>
                {panelRow ? (
                  <div
                    style={{
                      marginBottom: '.75rem',
                      padding: '.65rem .7rem',
                      borderRadius: 8,
                      border: '1px solid rgba(212, 165, 32, 0.35)',
                      background: 'rgba(8, 22, 38, 0.55)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: 'rgba(230,240,252,.95)',
                        marginBottom: '.35rem',
                        letterSpacing: '.04em',
                      }}
                    >
                      Griglia partita doppia (operativa)
                    </div>
                    <p style={{ fontSize: '.62rem', color: 'var(--mu)', margin: '0 0 .55rem', lineHeight: 1.45 }}>
                      Colonna <strong>Conto</strong>: clic per cercare nel piano (stessa logica della tabella principale), oppure «Piano dei
                      conti…» per la vista ampia. «Salva dati contabili proposti» persiste anche{' '}
                      <code style={{ fontSize: '.58rem' }}>working_pn_grid</code>; la prima riga aggiorna{' '}
                      <code style={{ fontSize: '.58rem' }}>conto_codice</code> quando scegli dal piano o testo libero. Non è una registrazione
                      in prima nota.
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '.7rem',
                          color: 'rgba(230,240,252,.92)',
                        }}
                      >
                        <thead>
                          <tr style={{ borderBottom: '1px solid rgba(212, 165, 32, 0.45)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Conto</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Dare</th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, whiteSpace: 'nowrap' }}>Avere</th>
                            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700 }}>Note</th>
                            <th style={{ width: 52, padding: '6px 4px' }} />
                          </tr>
                        </thead>
                        <tbody>
                          {pnGridRows.flatMap((row, idx) => {
                            const pnCellDisabled =
                              !isProntaLavorazioneRow(panelRow) ||
                              accSaveBusy ||
                              ivaSaveBusy ||
                              loading ||
                              markBusy ||
                              opSaveBusy
                            const mainRow = (
                              <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,.08)' }}>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <div
                                  role="button"
                                  tabIndex={pnCellDisabled ? -1 : 0}
                                  onClick={() => {
                                    if (pnCellDisabled) return
                                    setPnGridContoEditRowId(row.id)
                                    setPnGridContoQuery('')
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault()
                                      if (pnCellDisabled) return
                                      setPnGridContoEditRowId(row.id)
                                      setPnGridContoQuery('')
                                    }
                                  }}
                                  style={{
                                    minHeight: 34,
                                    padding: '6px 8px',
                                    borderRadius: 6,
                                    border: '1px solid rgba(255,255,255,.14)',
                                    background: 'rgba(255,255,255,.05)',
                                    cursor: pnCellDisabled ? 'default' : 'pointer',
                                    opacity: pnCellDisabled ? 0.65 : 1,
                                  }}
                                  title="Clicca per cercare nel piano dei conti"
                                >
                                  {row.conto ? (
                                    <div
                                      style={{
                                        fontSize: '.68rem',
                                        lineHeight: 1.35,
                                        maxHeight: '3.2em',
                                        overflow: 'hidden',
                                        wordBreak: 'break-word',
                                        color: 'rgba(230,240,252,.95)',
                                        fontWeight: 600,
                                      }}
                                    >
                                      {row.conto}
                                    </div>
                                  ) : (
                                    <span style={{ fontSize: '.62rem', color: 'var(--mu)' }}>
                                      Clicca per cercare nel piano…
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <input
                                  className="input"
                                  value={row.dare}
                                  disabled={
                                    !isProntaLavorazioneRow(panelRow) ||
                                    accSaveBusy ||
                                    ivaSaveBusy ||
                                    loading ||
                                    markBusy ||
                                    opSaveBusy
                                  }
                                  onChange={(e) => {
                                    pnGridTouchedRef.current = true
                                    const v = e.target.value
                                    setPnGridRows((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, dare: v } : x)),
                                    )
                                    if (idx === 0) {
                                      setIvaDraft((d) => ({ ...d, imponibile: v }))
                                      setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                                    }
                                    if (idx === 1) {
                                      setIvaDraft((d) => ({ ...d, iva: v }))
                                      setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                                    }
                                  }}
                                  style={{
                                    width: '100%',
                                    minWidth: 72,
                                    textAlign: 'right',
                                    fontSize: '.68rem',
                                    background: 'rgba(255,255,255,.06)',
                                    color: 'rgba(230,240,252,.95)',
                                    border: '1px solid rgba(255,255,255,.14)',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <input
                                  className="input"
                                  value={row.avere}
                                  disabled={
                                    !isProntaLavorazioneRow(panelRow) ||
                                    accSaveBusy ||
                                    ivaSaveBusy ||
                                    loading ||
                                    markBusy ||
                                    opSaveBusy
                                  }
                                  onChange={(e) => {
                                    pnGridTouchedRef.current = true
                                    setPnGridRows((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, avere: e.target.value } : x)),
                                    )
                                  }}
                                  style={{
                                    width: '100%',
                                    minWidth: 72,
                                    textAlign: 'right',
                                    fontSize: '.68rem',
                                    background: 'rgba(255,255,255,.06)',
                                    color: 'rgba(230,240,252,.95)',
                                    border: '1px solid rgba(255,255,255,.14)',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <input
                                  className="input"
                                  value={row.nota}
                                  disabled={
                                    !isProntaLavorazioneRow(panelRow) ||
                                    accSaveBusy ||
                                    ivaSaveBusy ||
                                    loading ||
                                    markBusy ||
                                    opSaveBusy
                                  }
                                  onChange={(e) => {
                                    pnGridTouchedRef.current = true
                                    setPnGridRows((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, nota: e.target.value } : x)),
                                    )
                                  }}
                                  style={{
                                    width: '100%',
                                    minWidth: 100,
                                    fontSize: '.68rem',
                                    background: 'rgba(255,255,255,.06)',
                                    color: 'rgba(230,240,252,.95)',
                                    border: '1px solid rgba(255,255,255,.14)',
                                  }}
                                />
                              </td>
                              <td style={{ padding: '4px 4px', verticalAlign: 'middle', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-sec"
                                  title="Rimuovi riga"
                                  disabled={
                                    pnGridRows.length < 2 ||
                                    !isProntaLavorazioneRow(panelRow) ||
                                    accSaveBusy ||
                                    ivaSaveBusy ||
                                    loading ||
                                    markBusy ||
                                    opSaveBusy
                                  }
                                  style={{ padding: '2px 6px', fontSize: '.65rem' }}
                                  onClick={() => {
                                    pnGridTouchedRef.current = true
                                    setPnGridRows((prev) => prev.filter((x) => x.id !== row.id))
                                  }}
                                >
                                  −
                                </button>
                              </td>
                            </tr>
                            )
                            const pickerRow =
                              pnGridContoEditRowId === row.id ? (
                                <tr key={`${row.id}-conto-picker`}>
                                  <td
                                    colSpan={5}
                                    style={{
                                      padding: '10px 10px 12px',
                                      background: 'rgba(0, 0, 0, 0.28)',
                                      borderBottom: '1px solid rgba(212, 165, 32, 0.28)',
                                      verticalAlign: 'top',
                                    }}
                                  >
                                    <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginBottom: 8, lineHeight: 1.45 }}>
                                      Ricerca su codice, descrizione e nome (token multipli, es. <em>telef spese</em>) — stessa logica
                                      della tabella principale.
                                    </div>
                                    <input
                                      className="input"
                                      autoFocus
                                      autoComplete="off"
                                      placeholder="Cerca nel piano dei conti…"
                                      value={pnGridContoQuery}
                                      onChange={(e) => setPnGridContoQuery(e.target.value)}
                                      disabled={pnCellDisabled}
                                      style={{
                                        width: '100%',
                                        fontSize: '.74rem',
                                        marginBottom: 8,
                                        background: 'rgba(255,255,255,.07)',
                                        color: 'rgba(230,240,252,.95)',
                                        border: '1px solid rgba(255,255,255,.16)',
                                      }}
                                    />
                                    {!pnGridContoQuery.trim() ? (
                                      <div style={{ fontSize: '.6rem', color: 'var(--mu)', marginBottom: 6 }}>
                                        Digita almeno un carattere per filtrare.
                                      </div>
                                    ) : null}
                                    <div
                                      style={{
                                        maxHeight: 220,
                                        overflowY: 'auto',
                                        border: '1px solid rgba(124, 157, 202, 0.35)',
                                        borderRadius: 8,
                                        background: 'rgba(11, 30, 52, 0.96)',
                                        marginBottom: 10,
                                      }}
                                    >
                                      {pnGridContoPickerOptions.length === 0 && pnGridContoQuery.trim() ? (
                                        <div style={{ padding: '10px 12px', fontSize: '.65rem', color: 'var(--mu)' }}>
                                          Nessun conto corrispondente
                                        </div>
                                      ) : null}
                                      {pnGridContoPickerOptions.map((p) => (
                                        <button
                                          key={p.id}
                                          type="button"
                                          disabled={pnCellDisabled}
                                          onClick={() => applyPnGridContoFromPiano(p, row.id, idx)}
                                          style={{
                                            display: 'block',
                                            width: '100%',
                                            textAlign: 'left',
                                            padding: '8px 12px',
                                            fontSize: '.68rem',
                                            border: 'none',
                                            borderBottom: '1px solid rgba(255,255,255,.06)',
                                            background: 'transparent',
                                            color: 'rgba(225,235,248,.95)',
                                            cursor: pnCellDisabled ? 'default' : 'pointer',
                                          }}
                                        >
                                          <div style={{ fontWeight: 700 }}>{p.descrizione || p.nome || p.codice}</div>
                                          <div style={{ fontSize: '.58rem', color: 'var(--mu)', marginTop: 2 }}>{p.codice}</div>
                                        </button>
                                      ))}
                                    </div>
                                    <div
                                      style={{
                                        display: 'flex',
                                        flexWrap: 'wrap',
                                        alignItems: 'center',
                                        gap: '8px 12px',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        className="btn-sec"
                                        disabled={pnCellDisabled}
                                        style={{ fontSize: '.68rem', padding: '.28rem .55rem' }}
                                        onClick={() => {
                                          setImportPnPianoModalRowId(row.id)
                                          setPnPianoModalQuery(pnGridContoQuery)
                                        }}
                                      >
                                        Piano dei conti…
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-sec"
                                        disabled={pnCellDisabled || !pnGridContoQuery.trim()}
                                        style={{ fontSize: '.68rem', padding: '.28rem .55rem' }}
                                        onClick={() => applyPnGridContoFreeText(row.id, idx, pnGridContoQuery)}
                                        title="Imposta una bozza libera: finché non scegli un conto reale dal piano la contabilizzazione resta bloccata"
                                      >
                                        Usa testo libero
                                      </button>
                                      <button
                                        type="button"
                                        className="btn-sec"
                                        disabled={pnCellDisabled}
                                        style={{ fontSize: '.68rem', padding: '.28rem .55rem' }}
                                        onClick={() => {
                                          setPnGridContoEditRowId(null)
                                          setPnGridContoQuery('')
                                        }}
                                      >
                                        Annulla
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              ) : null
                            return [mainRow, pickerRow].filter(Boolean)
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem', marginTop: '.5rem' }}>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={
                          !isProntaLavorazioneRow(panelRow) ||
                          accSaveBusy ||
                          ivaSaveBusy ||
                          loading ||
                          markBusy ||
                          opSaveBusy
                        }
                        style={{ padding: '.25rem .55rem', fontSize: '.72rem' }}
                        onClick={() => {
                          pnGridTouchedRef.current = true
                          setPnGridRows((prev) => [
                            ...prev,
                            {
                              id: newWorkingViewGridRowId(),
                              conto: '',
                              dare: '',
                              avere: '',
                              nota: '',
                            },
                          ])
                        }}
                      >
                        + Aggiungi riga
                      </button>
                    </div>
                    <div
                      style={{
                        marginTop: '.55rem',
                        display: 'flex',
                        justifyContent: 'flex-end',
                      }}
                    >
                      <label
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '.45rem',
                          fontSize: '.66rem',
                          color: 'var(--mu)',
                          padding: '.35rem .45rem',
                          borderRadius: 8,
                          border: '1px solid rgba(124, 157, 202, 0.25)',
                          background: 'rgba(255,255,255,.03)',
                        }}
                        title="Salva il conto economico principale come predefinito della controparte solo dopo contabilizzazione riuscita"
                      >
                        <input
                          type="checkbox"
                          checked={rememberMainContoDefault}
                          onChange={(e) => setRememberMainContoDefault(e.target.checked)}
                          disabled={accSaveBusy || ivaSaveBusy || opSaveBusy || loading || markBusy}
                        />
                        Memorizza questo conto di costo/ricavo come predefinito per la controparte
                      </label>
                    </div>
                    {rememberMainContoDefault ? (
                      <div style={{ marginTop: '.35rem', fontSize: '.62rem', color: defaultMainContoPlan.ready ? '#c8e6c9' : '#ffcdd2' }}>
                        {defaultMainContoPlan.message}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div style={{ marginBottom: '.75rem' }}>
                  {isProntaLavorazioneRow(panelRow) ? (
                    <div>
                      <span className="bdg-gold" style={{ fontSize: '.72rem', fontWeight: 700, padding: '3px 8px', borderRadius: 6 }}>
                        Segnata per lavorazione successiva
                      </span>
                      {parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE_AT] && (
                        <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.25rem' }}>
                          Marcatura:{' '}
                          {new Date(
                            String(parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.PRONTA_LAVORAZIONE_AT])
                          ).toLocaleString('it-IT')}
                        </div>
                      )}
                      {queueFullView ? (
                        <div style={{ fontSize: '.72rem', marginTop: '.45rem' }}>
                          <span style={{ color: 'var(--mu)', fontWeight: 600 }}>Preparazione: </span>
                          {isBenPreparata(panelRow, readinessOptsWorkingPanel) ? (
                            <span style={{ color: '#2e7d32', fontWeight: 700 }}>Preparata</span>
                          ) : (
                            <span style={{ color: '#e65100', fontWeight: 700 }}>Parziale</span>
                          )}
                          <span style={{ color: 'var(--mu)', fontSize: '.62rem', display: 'block', marginTop: 4 }}>
                            Criterio minimo: conto + causale IVA + imponibile/IVA e ogni riga PN con conto reale del piano.
                          </span>
                          {panelCandidateNextStep ? (
                            <div
                              style={{
                                marginTop: '.45rem',
                                padding: '.35rem .5rem',
                                borderRadius: 6,
                                background: 'rgba(27, 94, 32, 0.12)',
                                border: '1px solid rgba(27, 94, 32, 0.4)',
                                fontSize: '.65rem',
                                fontWeight: 700,
                                color: '#1b5e20',
                              }}
                              title="Indicatore locale di completezza finale — nessun cambio stato su DB"
                            >
                              Pronta per contabilizzazione (ben preparata + controlli OK)
                            </div>
                          ) : null}
                          {queueFullView && panelConfermaPassoFinaleValida ? (
                            <div
                              style={{
                                marginTop: '.45rem',
                                padding: '.35rem .5rem',
                                borderRadius: 6,
                                background: 'rgba(0, 77, 64, 0.14)',
                                border: '1px solid rgba(0, 77, 64, 0.42)',
                                fontSize: '.64rem',
                                fontWeight: 700,
                                color: '#004d40',
                              }}
                              title="Marcatura in ai_raw_response — non contabilizza"
                            >
                              Confermata per contabilizzazione (metadata)
                            </div>
                          ) : null}
                          {queueFullView && panelConfermaPassoFinaleStale ? (
                            <div
                              style={{
                                marginTop: '.45rem',
                                padding: '.35rem .5rem',
                                borderRadius: 6,
                                background: 'rgba(230, 81, 0, 0.12)',
                                border: '1px solid rgba(230, 81, 0, 0.4)',
                                fontSize: '.62rem',
                                fontWeight: 700,
                                color: '#bf360c',
                              }}
                            >
                              Conferma non più valida: la fattura non è più candidata. Aggiorna i dati o annulla la conferma.
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <span style={{ fontSize: '.75rem', color: 'var(--mu)' }}>Non segnata per lavorazione successiva</span>
                  )}
                </div>
                {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                  <div
                    style={{
                      marginBottom: '.65rem',
                      padding: '.55rem .65rem',
                      borderRadius: 8,
                      background: 'rgba(25, 118, 210, 0.06)',
                      border: '1px solid rgba(25, 118, 210, 0.28)',
                    }}
                  >
                    <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.35rem' }}>
                      VERSO CONTABILITÀ (ponte)
                    </div>
                    {panelArchivioDocumentoId ? (
                      <p style={{ margin: '0 0 .5rem', fontSize: '.65rem', color: 'var(--mu)', lineHeight: 1.45 }}>
                        Collegata a <strong>documenti_contabilità</strong> (id archivio:{' '}
                        <code style={{ fontSize: '.6rem' }}>{panelArchivioDocumentoId}</code>
                        {panelArchivioGiaRegistrato ? (
                          <>). Registrazione in prima nota già effettuata.</>
                        ) : (
                          <>). Usa il pulsante <strong>Contabilizza</strong> in alto per confermare e registrare in PN.</>
                        )}
                      </p>
                    ) : (
                      <p style={{ margin: '0 0 .5rem', fontSize: '.65rem', color: 'var(--mu)', lineHeight: 1.45 }}>
                        Il documento sarà creato in archivio e subito confermato e registrato in prima nota con il pulsante{' '}
                        <strong>Contabilizza</strong> (stesso binario del modulo Contabilità).
                      </p>
                    )}
                    {panelArchivioDocumentoId && documentoArchivioLive ? (
                      <p style={{ margin: '0 0 .5rem', fontSize: '.62rem', color: 'var(--mu)', lineHeight: 1.45 }}>
                        Stato archivio: <strong>{String(documentoArchivioLive.workflow_status || '—')}</strong>
                        {documentoArchivioLive.prima_nota_id ? (
                          <>
                            {' '}
                            · PN: <code style={{ fontSize: '.58rem' }}>{String(documentoArchivioLive.prima_nota_id)}</code>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {queueFullView && isProntaLavorazioneRow(panelRow) && panelDiagnosiPronta ? (
                  <div
                    style={{
                      marginBottom: '.75rem',
                      padding: '.6rem .65rem',
                      borderRadius: 8,
                      background: 'rgba(96, 125, 139, 0.08)',
                      border: '1px solid rgba(96, 125, 139, 0.35)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: 'var(--mu)',
                        marginBottom: '.35rem',
                        letterSpacing: '.06em',
                        display: 'flex',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '.35rem',
                      }}
                    >
                      CONTROLLI (diagnosi locale)
                      <span
                        style={{
                          fontSize: '.62rem',
                          fontWeight: 800,
                          padding: '2px 7px',
                          borderRadius: 6,
                          ...diagnosiLevelStyle(panelDiagnosiPronta.level),
                        }}
                      >
                        {panelDiagnosiPronta.labelShort}
                      </span>
                    </div>
                    <p style={{ fontSize: '.62rem', color: 'var(--mu)', margin: '0 0 .45rem', lineHeight: 1.45 }}>
                      Solo lettura sui dati già caricati: non salva, non corregge e non contabilizza. Indica se mancano conto, causale
                      IVA o importi IVA coerenti rispetto al criterio minimo.
                    </p>
                    {panelDiagnosiPronta.issues.length ? (
                      <ul
                        style={{
                          margin: 0,
                          paddingLeft: '1.1rem',
                          fontSize: '.64rem',
                          lineHeight: 1.45,
                          color: 'var(--mu)',
                        }}
                      >
                        {panelDiagnosiPronta.issues.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ fontSize: '.64rem', color: '#1b5e20', fontWeight: 600 }}>
                        Nessun problema rilevato ai controlli minimi: la fattura risulta lavorabile secondo questo criterio.
                      </div>
                    )}
                  </div>
                ) : null}
                {queueFullView && isProntaLavorazioneRow(panelRow) && !candidateWorkingView ? (
                  <div
                    style={{
                      marginBottom: '.75rem',
                      padding: '.55rem .65rem',
                      borderRadius: 8,
                      background: 'rgba(212, 165, 32, 0.1)',
                      border: '1px solid rgba(212, 165, 32, 0.35)',
                    }}
                  >
                    <button
                      type="button"
                      className="btn-sec"
                      disabled={
                        applySameCpBusy ||
                        loading ||
                        markBusy ||
                        opSaveBusy ||
                        accSaveBusy ||
                        ivaSaveBusy
                      }
                      onClick={() => void applicaPreparazioneStessaControparte()}
                      title="Copia i preparativi salvati (_fiscosim*) dalla fattura corrente verso le altre pronte con la stessa controparte (in elenco)"
                    >
                      {applySameCpBusy ? 'Applicazione…' : 'Applica alla stessa controparte'}
                    </button>
                    <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: 6, lineHeight: 1.4 }}>
                      Propaga verso le altre fatture <strong>pronte</strong> con la stessa controparte (criterio come &quot;Seleziona stesso fornitore/cliente&quot;),
                      solo campi già salvati nei layer <code style={{ fontSize: '.58rem' }}>_fiscosim*</code>. La fattura corrente non viene modificata.
                    </div>
                  </div>
                ) : null}
                {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                  <div
                    style={{
                      marginBottom: '.75rem',
                      padding: '.75rem',
                      border: '1px solid var(--bd)',
                      borderRadius: 8,
                      background: 'rgba(46, 125, 50, 0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: 'var(--mu)',
                        marginBottom: '.35rem',
                        letterSpacing: '.06em',
                      }}
                    >
                      DATI OPERATIVI
                    </div>
                    <p style={{ fontSize: '.65rem', color: 'var(--mu)', margin: '0 0 .65rem', lineHeight: 1.45 }}>
                      Salvati in{' '}
                      <code style={{ fontSize: '.62rem' }}>{importRepo.FISCOSIM_IMPORT_AI_META.OPERATIVE_OVERRIDES}</code> nel
                      JSON <code style={{ fontSize: '.62rem' }}>ai_raw_response</code>; l&apos;estratto AI originale non viene
                      sovrascritto. Svuota un campo e premi Salva per usare di nuovo il valore estratto per quel campo.
                    </p>
                    <div style={{ display: 'grid', gap: '.55rem' }}>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Controparte (visualizzata)
                          {hasOperativeOverride(panelRow, 'controparte') ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              override
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          value={opDraft.controparte}
                          onChange={(e) => setOpDraft((d) => ({ ...d, controparte: e.target.value }))}
                          disabled={opSaveBusy || loading || markBusy}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Numero documento
                          {hasOperativeOverride(panelRow, 'numero_documento') ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              override
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          value={opDraft.numero_documento}
                          onChange={(e) => setOpDraft((d) => ({ ...d, numero_documento: e.target.value }))}
                          disabled={opSaveBusy || loading || markBusy}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Data documento
                          {hasOperativeOverride(panelRow, 'data_documento') ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              override
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          placeholder="es. 2024-01-15"
                          value={opDraft.data_documento}
                          onChange={(e) => setOpDraft((d) => ({ ...d, data_documento: e.target.value }))}
                          disabled={opSaveBusy || loading || markBusy}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Totale
                          {hasOperativeOverride(panelRow, 'totale') ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              override
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          placeholder="es. 1234,56"
                          value={opDraft.totale}
                          onChange={(e) => setOpDraft((d) => ({ ...d, totale: e.target.value }))}
                          disabled={opSaveBusy || loading || markBusy}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.65rem' }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={opSaveBusy || loading || markBusy}
                        onClick={() => void salvaDatiOperativi()}
                      >
                        {opSaveBusy ? 'Salvataggio…' : 'Salva dati operativi'}
                      </button>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={opSaveBusy || loading || markBusy}
                        onClick={() => void ripristinaDatiOperativi()}
                      >
                        Ripristina tutto l&apos;estratto AI
                      </button>
                    </div>
                    {parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.OPERATIVE_OVERRIDES_AT] ? (
                      <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: '.45rem' }}>
                        Ultimo salvataggio dati operativi:{' '}
                        {new Date(
                          String(parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.OPERATIVE_OVERRIDES_AT])
                        ).toLocaleString('it-IT')}
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                  <details
                    style={{
                      marginBottom: '.75rem',
                      padding: '.75rem',
                      border: '1px solid var(--bd)',
                      borderRadius: 8,
                      background: 'rgba(25, 118, 210, 0.06)',
                    }}
                  >
                    <summary
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: 'var(--mu)',
                        letterSpacing: '.06em',
                        cursor: 'pointer',
                      }}
                    >
                      Dati contabili proposti (secondario — allineamento automatico dalla griglia Prima nota)
                    </summary>
                    <div style={{ marginTop: '.55rem' }}>
                    <p style={{ fontSize: '.65rem', color: 'var(--mu)', margin: '0 0 .65rem', lineHeight: 1.45 }}>
                      Sezione legacy: campi e pulsanti «Salva» restano per compatibilità. In working view la{' '}
                      <strong>griglia Prima nota</strong> è la fonte operativa; conferma passo finale e contabilizzazione
                      persistono i valori di griglia nel blob senza richiedere un salvataggio qui.
                    </p>
                    <div
                      style={{
                        fontSize: '.58rem',
                        color: 'var(--mu)',
                        marginBottom: '.55rem',
                        padding: '.35rem .45rem',
                        background: 'rgba(25, 118, 210, 0.07)',
                        borderRadius: 6,
                        lineHeight: 1.45,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px 12px',
                        alignItems: 'center',
                      }}
                    >
                      <span title="Proposte nella sezione Suggerimenti">
                        <span style={{ color: '#6a1b9a', fontWeight: 800 }}>●</span> Suggerito
                      </span>
                      <span title="Valori in questi campi finché non premi Salva">
                        <span style={{ color: '#1565c0', fontWeight: 800 }}>●</span> Bozza
                      </span>
                      <span title="Allineato a quanto già nel blob dopo Salva">
                        <span style={{ color: '#2e7d32', fontWeight: 800 }}>●</span> Salvato
                      </span>
                    </div>
                    <div style={{ display: 'grid', gap: '.55rem' }}>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Conto (codice piano)
                          {tripleContoStatus?.kind === 'salvato' ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              salvato
                            </span>
                          ) : tripleContoStatus?.text ? (
                            <span
                              style={{
                                fontWeight: 600,
                                marginLeft: 6,
                                fontSize: '.62rem',
                                color: tripleContoStatus.accent === 'manual' ? '#bf360c' : '#1565c0',
                              }}
                              title="Stato rispetto al salvataggio nei metadati"
                            >
                              {tripleContoStatus.text}
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          list="import-fatture-piano-codici"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          placeholder="Codice o scelta dall’elenco"
                          value={contDraft.conto_codice}
                          onChange={(e) => {
                            setBozzaFonte((f) => ({ ...f, conto: 'manuale' }))
                            setContDraft((d) => ({ ...d, conto_codice: e.target.value }))
                          }}
                          disabled={accSaveBusy || loading || markBusy || opSaveBusy}
                          autoComplete="off"
                        />
                        <datalist id="import-fatture-piano-codici">
                          {pianoConti.map((p) => (
                            <option key={p.id} value={p.codice}>
                              {p.descrizione || p.codice}
                            </option>
                          ))}
                        </datalist>
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Causale contabile
                        </label>
                        <select
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          value={contDraft.causale_contabile_id}
                          onChange={(e) => {
                            setBozzaFonte((f) => ({ ...f, causale: 'manuale' }))
                            setContDraft((d) => ({ ...d, causale_contabile_id: e.target.value }))
                          }}
                          disabled={accSaveBusy || loading || markBusy || opSaveBusy}
                        >
                          <option value="">— Nessuna selezione —</option>
                          {panelCausaliContabiliSelectOptions.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codice} — {c.descrizione}
                            </option>
                          ))}
                        </select>
                        <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: 6, lineHeight: 1.35 }}>
                          {panelCausaliContabiliHint}
                        </div>
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Causale IVA
                          {tripleCausaleStatus?.kind === 'salvato' ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              salvato
                            </span>
                          ) : tripleCausaleStatus?.text ? (
                            <span
                              style={{
                                fontWeight: 600,
                                marginLeft: 6,
                                fontSize: '.62rem',
                                color: tripleCausaleStatus.accent === 'manual' ? '#bf360c' : '#1565c0',
                              }}
                              title="Stato rispetto al salvataggio nei metadati"
                            >
                              {tripleCausaleStatus.text}
                            </span>
                          ) : null}
                        </label>
                        <select
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          value={contDraft.causale_iva_id}
                          onChange={(e) => {
                            setBozzaFonte((f) => ({ ...f, causale: 'manuale' }))
                            setContDraft((d) => ({ ...d, causale_iva_id: e.target.value }))
                          }}
                          disabled={accSaveBusy || loading || markBusy || opSaveBusy}
                        >
                          <option value="">— Nessuna selezione —</option>
                          {causaliIva.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.codice} — {c.descrizione} ({c.aliquota ?? '—'}%)
                            </option>
                          ))}
                        </select>
                        {suggestedCausaleIvaHintLabel && !hasAccountingProposal(panelRow, 'causale_iva_id') ? (
                          <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: 6, lineHeight: 1.35 }}>
                            Suggerimento da estratto (non salvato): {suggestedCausaleIvaHintLabel}
                          </div>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.65rem' }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={accSaveBusy || loading || markBusy || opSaveBusy}
                        onClick={() => void salvaDatiContabiliProposti()}
                      >
                        {accSaveBusy ? 'Salvataggio…' : 'Salva dati contabili proposti'}
                      </button>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={accSaveBusy || loading || markBusy || opSaveBusy}
                        onClick={() => void ripristinaDatiContabiliProposti()}
                      >
                        Rimuovi proposte salvate
                      </button>
                    </div>
                    {parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.ACCOUNTING_PROPOSALS_AT] ? (
                      <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: '.45rem' }}>
                        Ultimo salvataggio proposte contabili:{' '}
                        {new Date(
                          String(parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.ACCOUNTING_PROPOSALS_AT])
                        ).toLocaleString('it-IT')}
                      </div>
                    ) : null}
                    </div>
                  </details>
                ) : null}
                {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                  <div
                    style={{
                      marginBottom: '.75rem',
                      padding: '.65rem',
                      borderRadius: 8,
                      background: 'rgba(103, 58, 183, 0.07)',
                      border: '1px solid rgba(103, 58, 183, 0.28)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: 'var(--mu)',
                        marginBottom: '.3rem',
                        letterSpacing: '.06em',
                      }}
                    >
                      SUGGERIMENTI
                    </div>
                    <p style={{ fontSize: '.62rem', color: 'var(--mu)', margin: '0 0 .5rem', lineHeight: 1.45 }}>
                      Priorità indicativa: <strong>storico confermato</strong> e apprendimento → <strong>anagrafica / regole</strong> su
                      piano → <strong>IA su testo documento</strong>. Nulla viene salvato automaticamente: usa le azioni rapide per la
                      bozza locale, poi conferma con Salva.
                    </p>
                    <div
                      style={{
                        fontSize: '.58rem',
                        color: 'var(--mu)',
                        marginBottom: '.5rem',
                        padding: '.35rem .45rem',
                        background: 'rgba(103, 58, 183, 0.06)',
                        borderRadius: 6,
                        lineHeight: 1.45,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px 12px',
                        alignItems: 'center',
                      }}
                    >
                      <span title="Proposte in elenco; non persistono senza Salva">
                        <span style={{ color: '#6a1b9a', fontWeight: 800 }}>●</span> Suggerito
                      </span>
                      <span title="Campi sotto, in attesa di Salva esplicito">
                        <span style={{ color: '#1565c0', fontWeight: 800 }}>●</span> Bozza
                      </span>
                      <span title="Già scritto nei metadati _fiscosim nel blob">
                        <span style={{ color: '#2e7d32', fontWeight: 800 }}>●</span> Salvato
                      </span>
                    </div>
                    {suggestionsLoading ? (
                      <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginBottom: '.45rem' }}>Caricamento storico…</div>
                    ) : null}
                    {!suggestionsLoading &&
                    !historicalIdentityPanel.piva &&
                    !historicalIdentityPanel.cf &&
                    !historicalIdentityPanel.nomeLike ? (
                      <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginBottom: '.45rem' }}>
                        Storico controparte non disponibile (P.IVA/CF/denominazione insufficienti in estratto); restano anagrafica,
                        regole da riepilogo IVA e IA su testo.
                      </div>
                    ) : null}
                    <div style={{ marginBottom: '.5rem' }}>
                      <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--mu)', marginBottom: 4 }}>Conto</div>
                      {accountDecision?.suggestions?.length ? (
                        <ul style={{ margin: 0, paddingLeft: '1.1rem', fontSize: '.68rem', lineHeight: 1.45 }}>
                          {accountDecision.suggestions.map((s) => {
                            const src =
                              s.source === 'history'
                                ? { t: 'Storico', bg: 'rgba(121, 85, 72, 0.2)' }
                                : s.source === 'ai'
                                  ? { t: 'IA documento', bg: 'rgba(103, 58, 183, 0.18)' }
                                  : /anagrafic/i.test(String(s.sourceLabel || ''))
                                    ? { t: 'Anagrafica', bg: 'rgba(25, 118, 210, 0.18)' }
                                    : { t: String(s.sourceLabel || 'Proposta').slice(0, 24), bg: 'var(--s2)' }
                            const inBozza =
                              !!normContoCodiceUi(s.codice) &&
                              normContoCodiceUi(contDraft.conto_codice) === normContoCodiceUi(s.codice)
                            return (
                              <li
                                key={String(s.id)}
                                style={{
                                  marginBottom: 6,
                                  padding: inBozza ? '4px 6px' : undefined,
                                  marginLeft: inBozza ? -6 : undefined,
                                  borderRadius: inBozza ? 6 : undefined,
                                  background: inBozza ? 'rgba(21, 101, 192, 0.08)' : undefined,
                                  border: inBozza ? '1px solid rgba(21, 101, 192, 0.25)' : undefined,
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: '.58rem',
                                    fontWeight: 700,
                                    padding: '1px 5px',
                                    borderRadius: 4,
                                    marginRight: 6,
                                    background: src.bg,
                                  }}
                                >
                                  {src.t}
                                </span>
                                <strong>{s.codice}</strong> — {s.descrizione || '—'}
                                {inBozza ? (
                                  <span
                                    style={{
                                      marginLeft: 6,
                                      fontSize: '.58rem',
                                      fontWeight: 700,
                                      color: '#1565c0',
                                    }}
                                    title="Uguale al valore attuale nel campo Conto (bozza)"
                                  >
                                    → in bozza
                                    {bozzaFonte.conto ? ` (${labelBozzaFonteConto(bozzaFonte.conto)})` : ''}
                                  </span>
                                ) : null}
                                {Array.isArray(s.reasons) && s.reasons.length ? (
                                  <span style={{ color: 'var(--mu)', display: 'block', fontSize: '.6rem' }}>
                                    {s.reasons.slice(0, 2).join(' · ')}
                                  </span>
                                ) : null}
                              </li>
                            )
                          })}
                        </ul>
                      ) : (
                        <div style={{ fontSize: '.65rem', color: 'var(--mu)' }}>Nessun conto proposto (piano o documento insufficienti).</div>
                      )}
                      {accountDecision?.top1?.codice ? (
                        <button
                          type="button"
                          className="btn-sec"
                          style={{ marginTop: 6, padding: '.2rem .5rem', fontSize: '.72rem' }}
                          disabled={accSaveBusy || loading || markBusy}
                          title="Porta il conto principale della gerarchia nel campo sotto (solo bozza locale)"
                          onClick={() => {
                            const top = accountDecision.top1
                            if (!top?.codice) return
                            setBozzaFonte((f) => ({ ...f, conto: bozzaFonteContoFromSuggestionItem(top) }))
                            setContDraft((d) => ({ ...d, conto_codice: String(top.codice || '').trim() }))
                          }}
                        >
                          Accetta conto principale
                        </button>
                      ) : null}
                      {accountDecision?.warning ? (
                        <div style={{ fontSize: '.6rem', color: 'var(--mu)', marginTop: 6 }}>{accountDecision.warning}</div>
                      ) : null}
                    </div>
                    <div style={{ marginBottom: '.5rem' }}>
                      <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--mu)', marginBottom: 4 }}>Causale IVA</div>
                      {ivaProposal ? (
                        <div style={{ fontSize: '.63rem', color: 'var(--mu)', marginBottom: 6, lineHeight: 1.45 }}>
                          <span
                            style={{
                              fontSize: '.58rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              marginRight: 6,
                              background:
                                ivaProposal.source === 'anagrafica'
                                  ? 'rgba(0, 150, 136, 0.18)'
                                  : ivaProposal.source === 'history'
                                  ? 'rgba(121, 85, 72, 0.2)'
                                  : ivaProposal.source === 'document'
                                    ? 'rgba(25, 118, 210, 0.18)'
                                    : ivaProposal.source === 'default_percentuale'
                                      ? 'rgba(2, 136, 209, 0.16)'
                                    : 'rgba(255,255,255,0.08)',
                            }}
                          >
                            {ivaProposal.source === 'anagrafica'
                              ? 'Anagrafica'
                              : ivaProposal.source === 'history'
                              ? 'Storico IVA'
                              : ivaProposal.source === 'document'
                                ? 'Documento'
                                : ivaProposal.source === 'default_percentuale'
                                  ? 'Default %'
                                : 'Da verificare'}
                          </span>
                          {ivaProposal.source === 'anagrafica'
                            ? 'Causale IVA del conto/anagrafica coerente usata come priorita massima.'
                            : ivaProposal.source === 'history'
                            ? 'Proposta storica dominante del soggetto usata come base della causale IVA.'
                            : ivaProposal.source === 'document'
                              ? 'Riepilogo IVA del documento usato come base; lo storico resta solo come rafforzamento.'
                              : ivaProposal.source === 'default_percentuale'
                                ? 'Usata la causale IVA predefinita per aliquota da Impostazioni Procedure come fallback.'
                              : 'Nessuna proposta IVA forte: meglio verifica manuale.'}
                          {ivaProposal.warning ? (
                            <div style={{ marginTop: 4, color: '#d7b46a' }}>{ivaProposal.warning}</div>
                          ) : null}
                        </div>
                      ) : null}
                      {causaleStoricoSuggestion ? (
                        <div style={{ fontSize: '.65rem', marginBottom: 6 }}>
                          <span
                            style={{
                              fontSize: '.58rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              marginRight: 6,
                              background: 'rgba(121, 85, 72, 0.2)',
                            }}
                          >
                            Storico
                          </span>
                          {causaleStoricoSuggestion.causa?.codice} — {causaleStoricoSuggestion.causa?.descrizione} (
                          {causaleStoricoSuggestion.count} occorrenze)
                          {String(contDraft.causale_iva_id) === String(causaleStoricoSuggestion.id) ? (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: '.58rem',
                                fontWeight: 700,
                                color: '#1565c0',
                              }}
                              title="Uguale alla bozza campo Causale IVA"
                            >
                              → in bozza
                              {bozzaFonte.causale ? ` (${labelBozzaFonteCausale(bozzaFonte.causale)})` : ''}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="btn-sec"
                            style={{ marginLeft: 8, padding: '.15rem .4rem', fontSize: '.65rem' }}
                            disabled={accSaveBusy || loading || markBusy}
                            title="Imposta la causale storica nel campo sotto (solo bozza locale)"
                            onClick={() => {
                              setBozzaFonte((f) => ({ ...f, causale: 'storico' }))
                              setContDraft((d) => ({
                                ...d,
                                causale_iva_id: String(causaleStoricoSuggestion.id),
                              }))
                            }}
                          >
                            Accetta causale storica
                          </button>
                        </div>
                      ) : null}
                      {ivaProposal?.historicalSuggestions?.length > 1 ? (
                        <div style={{ fontSize: '.61rem', color: 'var(--mu)', marginBottom: 6 }}>
                          Alternative storico:{' '}
                          {ivaProposal.historicalSuggestions
                            .slice(0, 2)
                            .map((item) => `${item.causale?.codice || item.id} (${item.count})`)
                            .join(' · ')}
                        </div>
                      ) : null}
                      {causaleDocumentoId ? (
                        <div style={{ fontSize: '.65rem', marginBottom: 6 }}>
                          <span
                            style={{
                              fontSize: '.58rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              marginRight: 6,
                              background: 'rgba(25, 118, 210, 0.18)',
                            }}
                          >
                            Documento
                          </span>
                          {causaliIva.find((c) => String(c.id) === String(causaleDocumentoId))?.codice || causaleDocumentoId} —{' '}
                          {causaliIva.find((c) => String(c.id) === String(causaleDocumentoId))?.descrizione || ''}
                          {String(contDraft.causale_iva_id) === String(causaleDocumentoId) ? (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: '.58rem',
                                fontWeight: 700,
                                color: '#1565c0',
                              }}
                              title="Uguale alla bozza campo Causale IVA"
                            >
                              → in bozza
                              {bozzaFonte.causale ? ` (${labelBozzaFonteCausale(bozzaFonte.causale)})` : ''}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="btn-sec"
                            style={{ marginLeft: 8, padding: '.15rem .4rem', fontSize: '.65rem' }}
                            disabled={accSaveBusy || loading || markBusy}
                            title="Imposta la causale letta dal documento nel campo sotto (solo bozza locale)"
                            onClick={() => {
                              setBozzaFonte((f) => ({ ...f, causale: 'documento' }))
                              setContDraft((d) => ({ ...d, causale_iva_id: String(causaleDocumentoId) }))
                            }}
                          >
                            Accetta causale documento
                          </button>
                        </div>
                      ) : null}
                      {causaleRegolaId ? (
                        <div style={{ fontSize: '.65rem' }}>
                          <span
                            style={{
                              fontSize: '.58rem',
                              fontWeight: 700,
                              padding: '1px 5px',
                              borderRadius: 4,
                              marginRight: 6,
                              background: 'rgba(25, 118, 210, 0.18)',
                            }}
                          >
                            Default aliquota
                          </span>
                          {causaliIva.find((c) => String(c.id) === String(causaleRegolaId))?.codice || causaleRegolaId} —{' '}
                          {causaliIva.find((c) => String(c.id) === String(causaleRegolaId))?.descrizione || ''}
                          {String(contDraft.causale_iva_id) === String(causaleRegolaId) ? (
                            <span
                              style={{
                                marginLeft: 6,
                                fontSize: '.58rem',
                                fontWeight: 700,
                                color: '#1565c0',
                              }}
                              title="Uguale alla bozza campo Causale IVA"
                            >
                              → in bozza
                              {bozzaFonte.causale ? ` (${labelBozzaFonteCausale(bozzaFonte.causale)})` : ''}
                            </span>
                          ) : null}
                          <button
                            type="button"
                            className="btn-sec"
                            style={{ marginLeft: 8, padding: '.15rem .4rem', fontSize: '.65rem' }}
                            disabled={accSaveBusy || loading || markBusy}
                            title="Imposta la causale predefinita per aliquota nel campo sotto (solo bozza locale)"
                            onClick={() => {
                              setBozzaFonte((f) => ({ ...f, causale: 'default_percentuale' }))
                              setContDraft((d) => ({ ...d, causale_iva_id: String(causaleRegolaId) }))
                            }}
                          >
                            Accetta default aliquota
                          </button>
                        </div>
                      ) : (
                        <div style={{ fontSize: '.62rem', color: 'var(--mu)' }}>Nessun default per aliquota disponibile.</div>
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: '.68rem', fontWeight: 600, color: 'var(--mu)', marginBottom: 4 }}>
                        Dati IVA (estratto / baseline)
                      </div>
                      <div style={{ fontSize: '.64rem', lineHeight: 1.4 }}>
                        <span
                          style={{
                            fontSize: '.58rem',
                            fontWeight: 700,
                            padding: '1px 5px',
                            borderRadius: 4,
                            marginRight: 6,
                            background: 'rgba(46, 125, 50, 0.15)',
                          }}
                        >
                          Estratto
                        </span>
                        Imponibile {fmtIvaCell(ivaAiRowPanel.imponibile)} · IVA {fmtIvaCell(ivaAiRowPanel.iva)}
                        {ivaAiRowPanel.detraibilita_iva ? (
                          <> · detraibilità {fmtDetraibilitaPct(ivaAiRowPanel.detraibilita_iva)}</>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="btn-sec"
                        style={{ marginTop: 6, padding: '.2rem .5rem', fontSize: '.72rem' }}
                        disabled={ivaSaveBusy || loading || markBusy}
                        title="Riempie i campi IVA preparatori con la prima riga estratto (solo bozza locale)"
                        onClick={() => {
                          setBozzaFonte((f) => ({ ...f, iva: 'estratto' }))
                          setIvaDraft((d) => ({
                            ...d,
                            imponibile: ivaAiRowPanel.imponibile || d.imponibile,
                            iva: ivaAiRowPanel.iva || d.iva,
                            detraibilita_iva: ivaAiRowPanel.detraibilita_iva || d.detraibilita_iva,
                          }))
                        }}
                      >
                        Accetta IVA da estratto
                      </button>
                    </div>
                  </div>
                ) : null}
                    </div>
                    <div style={{ display: importWorkingTab === 'iva' ? 'block' : 'none' }}>
                {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                  <div
                    style={{
                      marginBottom: '.75rem',
                      padding: '.75rem',
                      border: '1px solid var(--bd)',
                      borderRadius: 8,
                      background: 'rgba(156, 39, 176, 0.06)',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '.72rem',
                        fontWeight: 700,
                        color: 'var(--mu)',
                        marginBottom: '.35rem',
                        letterSpacing: '.06em',
                      }}
                    >
                      Griglia IVA (operativa)
                    </div>
                    <p style={{ fontSize: '.62rem', color: 'var(--mu)', margin: '0 0 .5rem', lineHeight: 1.45 }}>
                      Modifica inline le righe: la prima riga definisce imponibile, IVA e causale IVA usati per controlli e
                      contabilizzazione. Righe extra restano in{' '}
                      <code style={{ fontSize: '.58rem' }}>working_iva_grid</code>. Il blocco «Dati IVA» sotto è opzionale (legacy).
                    </p>
                    {ivaProposal?.source ? (
                        <div style={{ fontSize: '.61rem', color: 'var(--mu)', marginBottom: '.5rem' }}>
                          Fonte proposta IVA:{' '}
                          <strong>
                            {ivaProposal.source === 'anagrafica'
                              ? 'anagrafica conto'
                              : ivaProposal.source === 'history'
                                ? 'storico soggetto'
                                : ivaProposal.source === 'document'
                                  ? 'riepilogo documento'
                                  : ivaProposal.source === 'default_percentuale'
                                    ? 'default per aliquota'
                                    : 'verifica manuale'}
                          </strong>
                        </div>
                    ) : null}
                    <div style={{ overflowX: 'auto', marginBottom: '.65rem' }}>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          fontSize: '.7rem',
                          color: 'var(--mu)',
                          border: '1px solid var(--bd)',
                          borderRadius: 6,
                        }}
                      >
                        <thead>
                          <tr style={{ background: 'var(--s1)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', fontWeight: 700, color: 'var(--mu)' }}>
                              Causale IVA
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: 'var(--mu)' }}>
                              Imponibile
                            </th>
                            <th style={{ textAlign: 'right', padding: '6px 8px', fontWeight: 700, color: 'var(--mu)' }}>IVA</th>
                            <th style={{ width: 52, padding: '6px 4px' }} />
                          </tr>
                        </thead>
                        <tbody>
                          {ivaGridRows.map((row, idx) => (
                            <tr key={row.id} style={{ borderTop: '1px solid var(--bd)' }}>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <select
                                  className="input"
                                  value={row.causale_iva_id}
                                  disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    ivaGridTouchedRef.current = true
                                    setIvaGridRows((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, causale_iva_id: v } : x)),
                                    )
                                    if (idx === 0) {
                                      setContDraft((d) => ({ ...d, causale_iva_id: v }))
                                      setBozzaFonte((f) => ({ ...f, causale: 'manuale' }))
                                    }
                                  }}
                                  style={{ width: '100%', minWidth: 160, fontSize: '.72rem' }}
                                >
                                  <option value="">—</option>
                                  {causaliIva.map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.codice} — {c.descrizione} ({c.aliquota ?? '—'}%)
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <input
                                  className="input"
                                  value={row.imponibile}
                                  disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    ivaGridTouchedRef.current = true
                                    setIvaGridRows((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, imponibile: v } : x)),
                                    )
                                    if (idx === 0) {
                                      setIvaDraft((d) => ({ ...d, imponibile: v }))
                                      setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                                    }
                                  }}
                                  style={{ width: '100%', minWidth: 80, textAlign: 'right', fontSize: '.72rem' }}
                                />
                              </td>
                              <td style={{ padding: '4px 6px', verticalAlign: 'middle' }}>
                                <input
                                  className="input"
                                  value={row.iva}
                                  disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    ivaGridTouchedRef.current = true
                                    setIvaGridRows((prev) =>
                                      prev.map((x) => (x.id === row.id ? { ...x, iva: v } : x)),
                                    )
                                    if (idx === 0) {
                                      setIvaDraft((d) => ({ ...d, iva: v }))
                                      setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                                    }
                                  }}
                                  style={{ width: '100%', minWidth: 80, textAlign: 'right', fontSize: '.72rem' }}
                                />
                              </td>
                              <td style={{ padding: '4px 4px', verticalAlign: 'middle', textAlign: 'center' }}>
                                <button
                                  type="button"
                                  className="btn-sec"
                                  title="Rimuovi riga"
                                  disabled={
                                    ivaGridRows.length < 2 ||
                                    ivaSaveBusy ||
                                    accSaveBusy ||
                                    loading ||
                                    markBusy ||
                                    opSaveBusy
                                  }
                                  style={{ padding: '2px 6px', fontSize: '.65rem' }}
                                  onClick={() => {
                                    ivaGridTouchedRef.current = true
                                    setIvaGridRows((prev) => prev.filter((x) => x.id !== row.id))
                                  }}
                                >
                                  −
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.45rem', marginBottom: '.55rem' }}>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                        style={{ padding: '.25rem .55rem', fontSize: '.72rem' }}
                        onClick={() => {
                          ivaGridTouchedRef.current = true
                          setIvaGridRows((prev) => [
                            ...prev,
                            { id: newWorkingViewGridRowId(), causale_iva_id: '', imponibile: '', iva: '' },
                          ])
                        }}
                      >
                        + Aggiungi riga IVA
                      </button>
                    </div>
                    <details style={{ marginTop: '.35rem' }}>
                      <summary
                        style={{
                          cursor: 'pointer',
                          fontSize: '.72rem',
                          fontWeight: 700,
                          color: 'var(--mu)',
                          marginBottom: '.35rem',
                          letterSpacing: '.06em',
                        }}
                      >
                        DATI IVA (preparatori classici, opzionale)
                      </summary>
                      <div style={{ marginTop: '.45rem' }}>
                    <p style={{ fontSize: '.65rem', color: 'var(--mu)', margin: '0 0 .55rem', lineHeight: 1.45 }}>
                      Campi legacy e salvataggio manuale su blob. In working view la{' '}
                      <strong>griglia IVA</strong> è la fonte operativa; «Conferma» / «Contabilizza» allineano il blob in automatico.
                      Salvataggio in{' '}
                      <code style={{ fontSize: '.62rem' }}>{importRepo.FISCOSIM_IMPORT_AI_META.IVA_OVERRIDES}</code>; il
                      riepilogo IVA estratto dall&apos;AI resta nel blob senza essere sovrascritto.
                    </p>
                    <div style={{ display: 'grid', gap: '.55rem' }}>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Imponibile
                          {tripleIvaByField.imponibile?.kind === 'salvato' ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              salvato
                            </span>
                          ) : tripleIvaByField.imponibile?.text ? (
                            <span
                              style={{
                                fontWeight: 600,
                                marginLeft: 6,
                                fontSize: '.62rem',
                                color: tripleIvaByField.imponibile.accent === 'manual' ? '#bf360c' : '#1565c0',
                              }}
                            >
                              {tripleIvaByField.imponibile.text}
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          placeholder="es. 1000,00"
                          value={ivaDraft.imponibile}
                          onChange={(e) => {
                            setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                            setIvaDraft((d) => ({ ...d, imponibile: e.target.value }))
                          }}
                          disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          IVA
                          {tripleIvaByField.iva?.kind === 'salvato' ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              salvato
                            </span>
                          ) : tripleIvaByField.iva?.text ? (
                            <span
                              style={{
                                fontWeight: 600,
                                marginLeft: 6,
                                fontSize: '.62rem',
                                color: tripleIvaByField.iva.accent === 'manual' ? '#bf360c' : '#1565c0',
                              }}
                            >
                              {tripleIvaByField.iva.text}
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          placeholder="es. 220,00"
                          value={ivaDraft.iva}
                          onChange={(e) => {
                            setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                            setIvaDraft((d) => ({ ...d, iva: e.target.value }))
                          }}
                          disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                          autoComplete="off"
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: '.72rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                          Detraibilità IVA (%)
                          {tripleIvaByField.detraibilita_iva?.kind === 'salvato' ? (
                            <span style={{ fontWeight: 500, color: 'var(--gold, #b8860b)', marginLeft: 6, fontSize: '.65rem' }}>
                              salvato
                            </span>
                          ) : tripleIvaByField.detraibilita_iva?.text ? (
                            <span
                              style={{
                                fontWeight: 600,
                                marginLeft: 6,
                                fontSize: '.62rem',
                                color: tripleIvaByField.detraibilita_iva.accent === 'manual' ? '#bf360c' : '#1565c0',
                              }}
                            >
                              {tripleIvaByField.detraibilita_iva.text}
                            </span>
                          ) : null}
                        </label>
                        <input
                          className="input"
                          style={{ width: '100%', fontSize: '.82rem' }}
                          placeholder="0–100"
                          value={ivaDraft.detraibilita_iva}
                          onChange={(e) => {
                            setBozzaFonte((f) => ({ ...f, iva: 'manuale' }))
                            setIvaDraft((d) => ({ ...d, detraibilita_iva: e.target.value }))
                          }}
                          disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                          autoComplete="off"
                        />
                      </div>
                    </div>
                    <div
                      style={{
                        fontSize: '.58rem',
                        color: 'var(--mu)',
                        marginTop: '.55rem',
                        marginBottom: '.45rem',
                        padding: '.35rem .45rem',
                        background: 'rgba(156, 39, 176, 0.07)',
                        borderRadius: 6,
                        lineHeight: 1.45,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '8px 12px',
                        alignItems: 'center',
                      }}
                    >
                      <span title="Valori proposti da estratto / Suggerimenti">
                        <span style={{ color: '#6a1b9a', fontWeight: 800 }}>●</span> Suggerito
                      </span>
                      <span title="Campi sopra finché non premi Salva dati IVA">
                        <span style={{ color: '#1565c0', fontWeight: 800 }}>●</span> Bozza
                      </span>
                      <span title="Override IVA persistito nel blob">
                        <span style={{ color: '#2e7d32', fontWeight: 800 }}>●</span> Salvato
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: '.62rem',
                        color: 'var(--mu)',
                        marginBottom: '.55rem',
                        padding: '.45rem .5rem',
                        background: 'var(--s1)',
                        borderRadius: 6,
                        lineHeight: 1.4,
                      }}
                    >
                      <div>
                        <strong>Estratto AI</strong> (prima riga riepilogo): imponibile {fmtIvaCell(ivaAiRowPanel.imponibile)} · IVA{' '}
                        {fmtIvaCell(ivaAiRowPanel.iva)}
                        {ivaAiRowPanel.detraibilita_iva ? (
                          <> · detraibilità {fmtDetraibilitaPct(ivaAiRowPanel.detraibilita_iva)}</>
                        ) : null}
                      </div>
                      <div style={{ marginTop: 4 }}>
                        <strong>In uso in UI</strong> (override se salvati): imponibile {fmtIvaCell(ivaEffectivePanel.imponibile)} · IVA{' '}
                        {fmtIvaCell(ivaEffectivePanel.iva)}
                        {ivaEffectivePanel.detraibilita_iva ? (
                          <> · detraibilità {fmtDetraibilitaPct(ivaEffectivePanel.detraibilita_iva)}</>
                        ) : null}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', marginTop: '.65rem' }}>
                      <button
                        type="button"
                        className="btn"
                        disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                        onClick={() => void salvaDatiIvaProposti()}
                      >
                        {ivaSaveBusy ? 'Salvataggio…' : 'Salva dati IVA'}
                      </button>
                      <button
                        type="button"
                        className="btn-sec"
                        disabled={ivaSaveBusy || accSaveBusy || loading || markBusy || opSaveBusy}
                        onClick={() => void ripristinaDatiIvaProposti()}
                      >
                        Rimuovi override IVA salvati
                      </button>
                    </div>
                    {parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.IVA_OVERRIDES_AT] ? (
                      <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: '.45rem' }}>
                        Ultimo salvataggio dati IVA:{' '}
                        {new Date(
                          String(parseAiRaw(panelRow)[importRepo.FISCOSIM_IMPORT_AI_META.IVA_OVERRIDES_AT])
                        ).toLocaleString('it-IT')}
                      </div>
                    ) : null}
                      </div>
                    </details>
                  </div>
                ) : null}
                {panelDiagnosiPronta ? (
                  <div
                    style={{
                      marginTop: '.55rem',
                      padding: '.45rem .55rem',
                      borderRadius: 8,
                      background: 'rgba(96, 125, 139, 0.1)',
                      border: '1px solid rgba(96, 125, 139, 0.35)',
                      fontSize: '.64rem',
                      color: 'var(--mu)',
                      lineHeight: 1.45,
                    }}
                  >
                    <strong>Controlli (riferimento)</strong>: {panelDiagnosiPronta.labelShort}
                    {panelDiagnosiPronta.issues?.length
                      ? ` — ${panelDiagnosiPronta.issues.slice(0, 4).join(' · ')}`
                      : ''}
                  </div>
                ) : null}
                    </div>
                    <div style={{ display: importWorkingTab === 'partitario' ? 'block' : 'none' }}>
                      <div
                        style={{
                          marginBottom: '.65rem',
                          padding: '.55rem .65rem',
                          borderRadius: 8,
                          background: 'rgba(30, 136, 229, 0.08)',
                          border: '1px solid rgba(30, 136, 229, 0.28)',
                        }}
                      >
                        <div style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.35rem' }}>
                          Partita e pagamenti
                        </div>
                        <p style={{ fontSize: '.62rem', color: 'var(--mu)', margin: 0, lineHeight: 1.45 }}>
                          Soggetto e incassi/pagamenti dall&apos;estratto. Per correzioni anagrafiche usa la scheda{' '}
                          <strong>Prima nota</strong> (dati operativi).
                        </p>
                      </div>
                      {Array.isArray(parseAiRaw(panelRow).pagamenti) && parseAiRaw(panelRow).pagamenti.length ? (
                        <ul style={{ margin: '0 0 .75rem', paddingLeft: '1.1rem', fontSize: '.64rem', lineHeight: 1.45, color: 'var(--mu)' }}>
                          {parseAiRaw(panelRow).pagamenti.slice(0, 14).map((p, i) => (
                            <li key={i}>
                              {p?.modalitaPagamento || p?.condizioniPagamento || 'Pagamento'}
                              {p?.importoPagamento != null ? ` · importo ${p.importoPagamento}` : ''}
                              {p?.dataScadenzaPagamento ? ` · scad. ${p.dataScadenzaPagamento}` : ''}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p style={{ fontSize: '.62rem', color: 'var(--mu)', margin: '0 0 .75rem' }}>
                          Nessun blocco pagamenti strutturato nell&apos;estratto.
                        </p>
                      )}
                <div style={{ margin: 0, fontSize: '.82rem' }}>
                  {queueFullView && isProntaLavorazioneRow(panelRow) ? (
                    <div style={{ marginBottom: '.35rem' }}>
                      <div style={{ fontWeight: 700, color: 'var(--mu)', marginBottom: '.35rem', fontSize: '.72rem' }}>
                        Estratto AI (solo lettura, non modificato qui)
                      </div>
                      <dl style={{ margin: 0, display: 'grid', gap: '.35rem .75rem' }}>
                        <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>N. documento</dt>
                        <dd style={{ margin: 0 }}>{numeroData(panelRow).num}</dd>
                        <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Data (estratto)</dt>
                        <dd style={{ margin: 0 }}>{numeroData(panelRow).data}</dd>
                        <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Controparte</dt>
                        <dd style={{ margin: 0, wordBreak: 'break-word' }}>{counterpartyLine(panelRow)}</dd>
                        <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Totale (estratto)</dt>
                        <dd style={{ margin: 0 }}>{totalSummary(panelRow)}</dd>
                      </dl>
                    </div>
                  ) : null}
                  <dl style={{ margin: 0, display: 'grid', gap: '.35rem .75rem' }}>
                  {!queueFullView || !isProntaLavorazioneRow(panelRow) ? (
                    <>
                      <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>N. documento (mostrato)</dt>
                      <dd style={{ margin: 0 }}>{effectiveNumeroData(panelRow).num}</dd>
                      <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Data documento (mostrata)</dt>
                      <dd style={{ margin: 0 }}>{effectiveNumeroData(panelRow).data}</dd>
                      <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Controparte (mostrata)</dt>
                      <dd style={{ margin: 0, wordBreak: 'break-word' }}>{effectiveControparte(panelRow)}</dd>
                      <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Totale (mostrato)</dt>
                      <dd style={{ margin: 0 }}>{effectiveTotaleDisplay(panelRow)}</dd>
                    </>
                  ) : null}
                  {panelRow.ai_summary && (
                    <>
                      <dt style={{ color: 'var(--mu)', fontWeight: 600 }}>Sintesi</dt>
                      <dd style={{ margin: 0, wordBreak: 'break-word' }}>{panelRow.ai_summary}</dd>
                    </>
                  )}
                  </dl>
                </div>
                    </div>
                {checkedRowIds.length > 0 && (
                  <div style={{ marginTop: '.75rem', fontSize: '.75rem', color: 'var(--mu)' }}>
                    Righe spuntate: {checkedRowIds.length} (solo elenco corrente)
                  </div>
                )}
                  </div>
                </section>
              </>
            )}
          </div>
          )}
        </div>
      )}

      {importPnPianoModalRowId ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="import-pn-piano-modal-title"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 20000,
            background: 'rgba(0, 0, 0, 0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
          onClick={() => {
            setImportPnPianoModalRowId(null)
            setPnPianoModalQuery('')
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: 'min(760px, 100%)',
              maxHeight: 'min(88vh, 920px)',
              display: 'flex',
              flexDirection: 'column',
              background: 'rgba(8, 22, 38, 0.98)',
              border: '1px solid rgba(124, 157, 202, 0.35)',
              borderRadius: 10,
              boxShadow: '0 16px 48px rgba(0,0,0,.5)',
            }}
          >
            <div
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--bd)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
                flexShrink: 0,
              }}
            >
              <strong id="import-pn-piano-modal-title" style={{ fontSize: '.88rem', color: 'rgba(230,240,252,.98)' }}>
                Piano dei conti
              </strong>
              <button
                type="button"
                className="btn-sec"
                style={{ fontSize: '.72rem' }}
                onClick={() => {
                  setImportPnPianoModalRowId(null)
                  setPnPianoModalQuery('')
                }}
              >
                Chiudi
              </button>
            </div>
            <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
              <input
                className="input"
                autoFocus
                autoComplete="off"
                placeholder="Cerca nel piano (vuoto = struttura gerarchica)"
                value={pnPianoModalQuery}
                onChange={(e) => setPnPianoModalQuery(e.target.value)}
                style={{ width: '100%', fontSize: '.82rem' }}
              />
            </div>
            <div style={{ padding: 10, flex: 1, overflowY: 'auto', minHeight: 0 }}>
              <PianoContiHierarchyPicker
                pianoConti={pianoConti}
                searchQuery={pnPianoModalQuery}
                includeIva
                onSelect={(p) => {
                  const rowIdx = pnGridRows.findIndex((r) => r.id === importPnPianoModalRowId)
                  if (rowIdx < 0) return
                  applyPnGridContoFromPiano(p, importPnPianoModalRowId, rowIdx)
                }}
              />
            </div>
          </div>
        </div>
      ) : null}

      <DocumentPreviewModal
        open={previewOpen}
        onClose={() => {
          setPreviewOpen(false)
          setPreviewDoc(null)
          setPreviewSignedUrl('')
        }}
        title="Anteprima fattura"
        subtitle={previewDoc?.filename || ''}
        document={previewDoc}
        fileUrl={previewSignedUrl}
        filename={previewDoc?.filename || ''}
        mimeType={previewDoc?.mime_type || ''}
        xmlContent={previewDoc ? extractXmlContent(parseAiRaw(previewDoc)) : ''}
        fallback={previewDoc ? buildInvoiceFallback(previewDoc) : null}
      />
    </div>
  )
}
