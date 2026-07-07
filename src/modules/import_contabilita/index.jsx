import { memo, useEffect, useMemo, useRef, useState } from 'react'

import { buildStagingRow } from './application/importContabilitaBuilders.js'
import { runImportWorkflow, runCommitWorkflow } from './application/importContabilitaWorkflow.js'
import {
  evaluateDemoCompanyForImport,
  resolveSocietaFromImportOptions,
  buildImportDemoGuardBlockMessage,
  isDemoCompany,
} from '../test_mode/demoCompanyGuard.js'
import { filterCausaliIvaForDemoWorkingView } from './domain/importContabilitaDemoCausaliIva.js'
import {
  buildDemoWorkingViewCommitBundle,
  formatDemoWorkingViewCommitReport,
  parseNumberRobust,
} from './domain/importContabilitaDemoWorkingViewCommit.js'
import { sb } from '../../lib/supabase.js'
import { mapImportContabilitaCommitPayloadToCanonical } from '../contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js'
import { ImportContabilitaHeader } from './components/ImportContabilitaHeader.jsx'
import { ImportContabilitaAnagraficheDetail } from './components/ImportContabilitaAnagraficheDetail.jsx'
import { ImportContabilitaKpiBar } from './components/ImportContabilitaKpiBar.jsx'
import { ImportContabilitaOverviewCards } from './components/ImportContabilitaOverviewCards.jsx'
import { ImportContabilitaReportDetail } from './components/ImportContabilitaReportDetail.jsx'
import { ImportContabilitaPreviewDrawer } from './components/ImportContabilitaPreviewDrawer.jsx'
import { ImportContabilitaPreviewDrawerContent } from './components/invoice_preview/ImportContabilitaPreviewDrawerContent.jsx'
import { ImportContabilitaWorkingTable } from './components/ImportContabilitaWorkingTable.jsx'
import { ImportContabilitaWorkingTableToolbar } from './components/ImportContabilitaWorkingTableToolbar.jsx'
import { ImportContabilitaWorkingView } from './components/working_view/ImportContabilitaWorkingView.jsx'
import {
  convertMastrinoToPianoContiParent,
  createImportContabilitaPercipiente,
  createImportContabilitaPianoConto,
  findImportContabilitaPercipienteByCf,
  loadCausaliIvaBySocieta,
  getNextPianoContoCodeByParent,
  loadCausaliContabiliBySocieta,
  loadPercipientiBySocieta,
  loadPianoContiBySocieta,
  loadSocietaAttive,
  updateImportContabilitaPianoContoAnagrafica,
} from './data/importContabilitaRepo.js'

import {
  getDefaultMastrinoForTipo as getDefaultMastrinoForTipoDomain,
  getAllowedMastriniForTipo as getAllowedMastriniForTipoDomain,
  getAllowedMastrinoCodesForTipo as getAllowedMastrinoCodesForTipoDomain,
  isAllowedMastrinoForTipo as isAllowedMastrinoForTipoDomain,
  findAnagraficaExistingAccount as findAnagraficaExistingAccountDomain,
  validateAnagraficaDecision as validateAnagraficaDecisionDomain,
  normalizeAnagraficaDecisionForRow as normalizeAnagraficaDecisionForRowDomain,
  getDefaultAnagraficaDecision as getDefaultAnagraficaDecisionDomain,
  mergeAnagraficaDecision as mergeAnagraficaDecisionDomain,
  getAllowedExistingAccounts as getAllowedExistingAccountsDomain,
  resolveAllowedAnagraficaAccountByCode as resolveAllowedAnagraficaAccountByCodeDomain,
} from './domain/anagraficaValidation.js'
import { buildCausaleContabilePolicy } from '../contabilita/domain/causali/buildCausaleContabilePolicy.js'


const MONEY_FORMATTER = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'short',
  timeStyle: 'short',
})

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('it-IT', {
  dateStyle: 'short',
})

function getLocalIsoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const LAST_SOCIETA_STORAGE_KEY = 'import_contabilita.last_societa_id'
const VIEW_MODES = Object.freeze({
  all: 'tutte',
  ready: 'pronte',
  registered: 'registrate',
})

const QUICK_FILTERS = Object.freeze({
  all: 'tutto',
  complete: 'complete',
  incomplete: 'incomplete',
  selected: 'selezionate',
  sameSupplier: 'stesso_fornitore',
  sameAccount: 'stesso_conto',
})

const WORKING_TABLE_COLUMN_FILTERS = Object.freeze({
  supplier: { label: 'Fornitore / Cliente', type: 'text' },
  numeroDocumento: { label: 'N. documento', type: 'text' },
  dataDocumento: { label: 'Data', type: 'date' },
  imponibile: { label: 'Imponibile', type: 'number' },
  iva: { label: 'IVA', type: 'number' },
  totale: { label: 'Totale', type: 'number' },
  conto: { label: 'Conto proposto', type: 'text' },
  causale: { label: 'Causale contabile', type: 'text' },
  stato: { label: 'Stato', type: 'text' },
})

function getSocietaResultStorageKey(societaId) {
  return `import_contabilita.last_result.${String(societaId || '').trim()}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

function formatDateTime(value) {
  const text = normalizeText(value)
  if (!text) return '—'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return DATE_TIME_FORMATTER.format(date)
}

function formatDateOnly(value) {
  const text = normalizeText(value)
  if (!text) return '—'
  const date = new Date(text)
  if (Number.isNaN(date.getTime())) return text
  return DATE_ONLY_FORMATTER.format(date)
}

function normalizeStorageText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
}

function compactArrayForStorage(items, mapper, limit = Infinity) {
  const list = Array.isArray(items) ? items : []
  const mapped = typeof mapper === 'function' ? list.map((item) => mapper(item)).filter(Boolean) : list.slice()
  return Number.isFinite(limit) ? mapped.slice(0, limit) : mapped
}

function compactLineeDocumentoForStorage(lineeDocumento) {
  return compactArrayForStorage(lineeDocumento, (linea) => {
    if (!linea || typeof linea !== 'object') return null
    return {
      numeroLinea: normalizeText(linea?.NumeroLinea || linea?.numeroLinea || ''),
      descrizione: normalizeText(linea?.Descrizione || linea?.descrizione || ''),
      quantita: Number(linea?.Quantita ?? linea?.quantita ?? 0) || 0,
      prezzoUnitario: Number(linea?.PrezzoUnitario ?? linea?.prezzoUnitario ?? 0) || 0,
      prezzoTotale: Number(linea?.PrezzoTotale ?? linea?.prezzoTotale ?? 0) || 0,
      aliquotaIVA: normalizeText(linea?.AliquotaIVA || linea?.aliquotaIVA || ''),
      natura: normalizeText(linea?.Natura || linea?.natura || ''),
    }
  }, 20)
}

function compactParsedDocumentForStorage(parsedDocument) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const fornitore = parsed?.fornitore && typeof parsed.fornitore === 'object' ? parsed.fornitore : {}
  const cliente = parsed?.cliente && typeof parsed.cliente === 'object' ? parsed.cliente : {}

  return {
    filename: normalizeText(parsed?.filename || ''),
    sourceHash: normalizeText(parsed?.sourceHash || ''),
    tipoDocumento: normalizeText(parsed?.tipoDocumento || ''),
    dataDocumento: normalizeText(parsed?.dataDocumento || ''),
    numeroDocumento: normalizeText(parsed?.numeroDocumento || ''),
    fornitore: {
      denominazione: normalizeText(fornitore?.denominazione || ''),
      partitaIva: normalizeText(fornitore?.partitaIva || ''),
      codiceFiscale: normalizeText(fornitore?.codiceFiscale || ''),
    },
    cliente: {
      denominazione: normalizeText(cliente?.denominazione || ''),
      partitaIva: normalizeText(cliente?.partitaIva || ''),
      codiceFiscale: normalizeText(cliente?.codiceFiscale || ''),
    },
    imponibile: Number(parsed?.imponibile ?? 0) || 0,
    iva: Number(parsed?.iva ?? 0) || 0,
    totale: Number(parsed?.totale ?? 0) || 0,
    ivaRows: compactArrayForStorage(parsed?.ivaRows, (item) => ({
      ...item,
    }), 20),
    flags: parsed?.flags && typeof parsed.flags === 'object'
      ? { ...parsed.flags }
      : { reverseCharge: false, splitPayment: false, hasRitenuta: false, isProfessional: false },
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.slice(0, 20) : [],
    errors: Array.isArray(parsed?.errors) ? parsed.errors.slice(0, 20) : [],
    lineeDocumento: compactLineeDocumentoForStorage(parsed?.lineeDocumento),
    rawXmlOmittedFromStorage: true,
    lineeDocumentoTruncated: Array.isArray(parsed?.lineeDocumento) && parsed.lineeDocumento.length > 20,
  }
}

function compactStagingRowForStorage(row) {
  const parsedDocument = compactParsedDocumentForStorage(row?.parsedDocument || row?.parsedDoc || {})
  const warnings = Array.isArray(row?.warnings) ? row.warnings.slice(0, 20) : []
  const blockingErrors = Array.isArray(row?.blockingErrors) ? row.blockingErrors.slice(0, 20) : []
  const compactRow = {
    id: normalizeText(row?.id || row?.filename || ''),
    batchId: normalizeText(row?.batchId || ''),
    sourceHash: normalizeText(row?.sourceHash || ''),
    filename: normalizeText(row?.filename || ''),
    state: normalizeText(row?.state || ''),
    blockingErrors,
    warnings,
    userNotes: normalizeText(row?.userNotes || ''),
    createdAt: normalizeText(row?.createdAt || ''),
    updatedAt: normalizeText(row?.updatedAt || ''),
    parsedDocument,
  }

  if (row?.warningCode) compactRow.warningCode = normalizeText(row.warningCode)
  if (row?.note) compactRow.note = normalizeText(row.note)
  if (row?.selectedAccountId) compactRow.selectedAccountId = normalizeText(row.selectedAccountId)
  if (row?.selectedCausaleId) compactRow.selectedCausaleId = normalizeText(row.selectedCausaleId)
  if (row?.sourceType) compactRow.sourceType = normalizeText(row.sourceType)
  if (row?.sourceRowId) compactRow.sourceRowId = normalizeText(row.sourceRowId)
  return compactRow
}

function compactDedupRowForStorage(row) {
  if (!row || typeof row !== 'object') return null
  const parsedDocument = compactParsedDocumentForStorage(row?.parsedDoc || row?.parsedDocument || {})
  const summary = {
    id: normalizeText(row?.id || ''),
    filename: normalizeText(row?.filename || ''),
    sourceHash: normalizeText(row?.sourceHash || ''),
    parsedDocument,
  }
  if (row?.state) summary.state = normalizeText(row.state)
  if (row?.stato) summary.stato = normalizeText(row.stato)
  if (row?.reasonCode) summary.reasonCode = normalizeText(row.reasonCode)
  if (row?.dedupType) summary.dedupType = normalizeText(row.dedupType)
  return summary
}

function compactReportForStorage(report) {
  const source = report && typeof report === 'object' ? report : {}
  const keepReasons = compactArrayForStorage(source?.discardedReasons, (reason) => {
    if (!reason || typeof reason !== 'object') return null
    return {
      code: normalizeText(reason?.code || reason?.label || ''),
      label: normalizeText(reason?.label || reason?.code || ''),
      count: Number(reason?.count || 0) || 0,
    }
  }, 12)

  return {
    batchId: normalizeText(source?.batchId || ''),
    startedAt: normalizeText(source?.startedAt || ''),
    finishedAt: normalizeText(source?.finishedAt || ''),
    totals: {
      files: Number(source?.totals?.files || 0) || 0,
      imported: Number(source?.totals?.imported || 0) || 0,
      blocked: Number(source?.totals?.blocked || 0) || 0,
      warnings: Number(source?.totals?.warnings || 0) || 0,
      errors: Number(source?.totals?.errors || 0) || 0,
    },
    uploadedFilesCount: Number(source?.uploadedFilesCount || 0) || 0,
    extractedXmlCount: Number(source?.extractedXmlCount || 0) || 0,
    discardedFilesCount: Number(source?.discardedFilesCount || 0) || 0,
    duplicateInStagingCount: Number(source?.duplicateInStagingCount || 0) || 0,
    duplicateInAccountingCount: Number(source?.duplicateInAccountingCount || 0) || 0,
    deletedInStagingCount: Number(source?.deletedInStagingCount || 0) || 0,
    deletedInAccountingCount: Number(source?.deletedInAccountingCount || 0) || 0,
    localMergeExistingCount: Number(source?.localMergeExistingCount || 0) || 0,
    localMergeAddedCount: Number(source?.localMergeAddedCount || 0) || 0,
    localMergeSkippedCount: Number(source?.localMergeSkippedCount || 0) || 0,
    localMergeTotalCount: Number(source?.localMergeTotalCount || 0) || 0,
    deletedDetectionNote: normalizeText(source?.deletedDetectionNote || ''),
    discardedReasons: keepReasons,
    deletedInStagingRows: compactArrayForStorage(source?.deletedInStagingRows, compactDedupRowForStorage, 80),
    deletedInAccountingRows: compactArrayForStorage(source?.deletedInAccountingRows, compactDedupRowForStorage, 80),
    duplicateInStagingRows: [],
    duplicateInAccountingRows: [],
    items: [],
  }
}

function compactResultForStorage(result) {
  const source = result && typeof result === 'object' ? result : {}
  const stagingRows = compactArrayForStorage(source?.stagingRows, compactStagingRowForStorage, 750)
  return {
    ok: source?.ok ?? true,
    batchId: normalizeText(source?.batchId || ''),
    startedAt: normalizeText(source?.startedAt || ''),
    finishedAt: normalizeText(source?.finishedAt || ''),
    stagingRows,
    report: compactReportForStorage(source?.report),
  }
}

function buildStorageSnapshot(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey, automationMetaByRowId) {
  return {
    storageVersion: 4,
    result: compactResultForStorage(result),
    manualAccountByRowId: manualAccountByRowId && typeof manualAccountByRowId === 'object' ? { ...manualAccountByRowId } : {},
    manualCausaleByRowId: manualCausaleByRowId && typeof manualCausaleByRowId === 'object' ? { ...manualCausaleByRowId } : {},
    manualRegistrationDateByRowId: manualRegistrationDateByRowId && typeof manualRegistrationDateByRowId === 'object' ? { ...manualRegistrationDateByRowId } : {},
    anagraficheDecisioniByKey: compactAnagraficheDecisioniForStorage(anagraficheDecisioniByKey),
    percipientiDecisioniByKey: compactPercipientiDecisioniForStorage(percipientiDecisioniByKey),
    automationMetaByRowId: automationMetaByRowId && typeof automationMetaByRowId === 'object' ? { ...automationMetaByRowId } : {},
  }
}

function normalizeAnagraficaDecisionKey(value) {
  return normalizeStorageText(value)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]/g, '')
    .trim()
}

function compactAnagraficheDecisioniForStorage(decisioniByKey) {
  const entries = Object.entries(decisioniByKey && typeof decisioniByKey === 'object' ? decisioniByKey : {})
  const compact = {}

  entries.forEach(([key, decision]) => {
    const normalizedKey = normalizeAnagraficaDecisionKey(key)
    if (!normalizedKey) return
    compact[normalizedKey] = {
      decisionStatus: decision?.decisionStatus === 'confirmed'
        ? 'confirmed'
        : decision?.decisionStatus === 'ignored'
          ? 'ignored'
          : 'pending',
      tipo: decision?.tipo === 'cliente' ? 'cliente' : 'fornitore',
      accountMode: decision?.accountMode === 'existing'
        ? 'existing'
        : decision?.accountMode === 'none'
          ? 'none'
          : decision?.accountMode === 'choose'
            ? 'choose'
            : 'new',
      mastrino: normalizeText(decision?.mastrino || ''),
      existingAccountId: normalizeText(decision?.existingAccountId || ''),
      existingAccountCode: normalizeText(decision?.existingAccountCode || ''),
      hiddenFromAnagrafiche: Boolean(decision?.hiddenFromAnagrafiche),
      accountDataUpdatedAt: normalizeText(decision?.accountDataUpdatedAt || ''),
      updatedAt: normalizeText(decision?.updatedAt || ''),
    }
  })

  return compact
}

function compactPercipientiDecisioniForStorage(decisioniByKey) {
  const entries = Object.entries(decisioniByKey && typeof decisioniByKey === 'object' ? decisioniByKey : {})
  const compact = {}

  entries.forEach(([key, decision]) => {
    const normalizedKey = normalizeAnagraficaDecisionKey(key)
    if (!normalizedKey) return
    compact[normalizedKey] = {
      status: decision?.status === 'created'
        ? 'created'
        : decision?.status === 'blocked'
          ? 'blocked'
          : 'linked',
      percipienteId: normalizeText(decision?.percipienteId || ''),
      codiceFiscale: normalizeText(decision?.codiceFiscale || ''),
      actionAt: normalizeText(decision?.actionAt || ''),
      hiddenFromAnagrafiche: Boolean(decision?.hiddenFromAnagrafiche),
    }
  })

  return compact
}

function buildEmergencyStorageSnapshot(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey, automationMetaByRowId) {
  const compactResult = compactResultForStorage(result)
  compactResult.stagingRows = compactArrayForStorage(compactResult.stagingRows, (row) => {
    if (!row || typeof row !== 'object') return null
    return {
      id: row.id,
      batchId: row.batchId,
      sourceHash: row.sourceHash,
      filename: row.filename,
      state: row.state,
      blockingErrors: Array.isArray(row.blockingErrors) ? row.blockingErrors.slice(0, 5) : [],
      warnings: Array.isArray(row.warnings) ? row.warnings.slice(0, 5) : [],
      userNotes: row.userNotes || '',
      createdAt: row.createdAt || '',
      updatedAt: row.updatedAt || '',
      parsedDocument: {
        filename: row?.parsedDocument?.filename || '',
        sourceHash: row?.parsedDocument?.sourceHash || '',
        tipoDocumento: row?.parsedDocument?.tipoDocumento || '',
        dataDocumento: row?.parsedDocument?.dataDocumento || '',
        numeroDocumento: row?.parsedDocument?.numeroDocumento || '',
        fornitore: { ...(row?.parsedDocument?.fornitore || {}) },
        cliente: { ...(row?.parsedDocument?.cliente || {}) },
        imponibile: Number(row?.parsedDocument?.imponibile || 0) || 0,
        iva: Number(row?.parsedDocument?.iva || 0) || 0,
        totale: Number(row?.parsedDocument?.totale || 0) || 0,
        ivaRows: Array.isArray(row?.parsedDocument?.ivaRows) ? row.parsedDocument.ivaRows.slice(0, 5) : [],
        flags: row?.parsedDocument?.flags && typeof row.parsedDocument.flags === 'object'
          ? { ...row.parsedDocument.flags }
          : { reverseCharge: false, splitPayment: false, hasRitenuta: false, isProfessional: false },
        warnings: Array.isArray(row?.parsedDocument?.warnings) ? row.parsedDocument.warnings.slice(0, 5) : [],
        errors: Array.isArray(row?.parsedDocument?.errors) ? row.parsedDocument.errors.slice(0, 5) : [],
        lineeDocumento: [],
        rawXmlOmittedFromStorage: true,
        lineeDocumentoTruncated: false,
      },
    }
  }, 300)

  compactResult.report = {
    ...compactResult.report,
    deletedInStagingRows: compactArrayForStorage(compactResult.report?.deletedInStagingRows, compactDedupRowForStorage, 20),
    deletedInAccountingRows: compactArrayForStorage(compactResult.report?.deletedInAccountingRows, compactDedupRowForStorage, 20),
    discardedReasons: compactArrayForStorage(compactResult.report?.discardedReasons, (reason) => ({
      code: normalizeText(reason?.code || reason?.label || ''),
      label: normalizeText(reason?.label || reason?.code || ''),
      count: Number(reason?.count || 0) || 0,
    }), 8),
    items: [],
  }

  return {
    storageVersion: 4,
    result: compactResult,
    manualAccountByRowId: manualAccountByRowId && typeof manualAccountByRowId === 'object' ? { ...manualAccountByRowId } : {},
    manualCausaleByRowId: manualCausaleByRowId && typeof manualCausaleByRowId === 'object' ? { ...manualCausaleByRowId } : {},
    manualRegistrationDateByRowId: manualRegistrationDateByRowId && typeof manualRegistrationDateByRowId === 'object' ? { ...manualRegistrationDateByRowId } : {},
    anagraficheDecisioniByKey: compactAnagraficheDecisioniForStorage(anagraficheDecisioniByKey),
    percipientiDecisioniByKey: compactPercipientiDecisioniForStorage(percipientiDecisioniByKey),
    automationMetaByRowId: automationMetaByRowId && typeof automationMetaByRowId === 'object' ? { ...automationMetaByRowId } : {},
  }
}

function readSocietaSnapshot(societaId) {
  if (typeof window === 'undefined' || !societaId) return { result: null, manualAccountByRowId: {}, manualCausaleByRowId: {}, manualRegistrationDateByRowId: {}, anagraficheDecisioniByKey: {}, percipientiDecisioniByKey: {}, automationMetaByRowId: {} }
  try {
    const raw = window.sessionStorage.getItem(getSocietaResultStorageKey(societaId))
    if (!raw) return { result: null, manualAccountByRowId: {}, manualCausaleByRowId: {}, manualRegistrationDateByRowId: {}, anagraficheDecisioniByKey: {}, percipientiDecisioniByKey: {}, automationMetaByRowId: {} }
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') {
      return { result: null, manualAccountByRowId: {}, manualCausaleByRowId: {}, manualRegistrationDateByRowId: {}, anagraficheDecisioniByKey: {}, percipientiDecisioniByKey: {}, automationMetaByRowId: {} }
    }
    if ('result' in parsed || 'manualAccountByRowId' in parsed || 'manualCausaleByRowId' in parsed || 'manualRegistrationDateByRowId' in parsed || 'anagraficheDecisioniByKey' in parsed || 'automationMetaByRowId' in parsed || 'storageVersion' in parsed) {
      return {
        result: parsed.result && typeof parsed.result === 'object' ? parsed.result : null,
        manualAccountByRowId: parsed.manualAccountByRowId && typeof parsed.manualAccountByRowId === 'object'
          ? parsed.manualAccountByRowId
          : {},
        manualCausaleByRowId: parsed.manualCausaleByRowId && typeof parsed.manualCausaleByRowId === 'object'
          ? parsed.manualCausaleByRowId
          : {},
        manualRegistrationDateByRowId: parsed.manualRegistrationDateByRowId && typeof parsed.manualRegistrationDateByRowId === 'object'
          ? parsed.manualRegistrationDateByRowId
          : {},
        anagraficheDecisioniByKey: parsed.anagraficheDecisioniByKey && typeof parsed.anagraficheDecisioniByKey === 'object'
          ? parsed.anagraficheDecisioniByKey
          : {},
        percipientiDecisioniByKey: parsed.percipientiDecisioniByKey && typeof parsed.percipientiDecisioniByKey === 'object'
          ? parsed.percipientiDecisioniByKey
          : {},
        automationMetaByRowId: parsed.automationMetaByRowId && typeof parsed.automationMetaByRowId === 'object'
          ? parsed.automationMetaByRowId
          : {},
      }
    }
    if (Array.isArray(parsed.stagingRows)) {
      return { result: parsed, manualAccountByRowId: {}, manualCausaleByRowId: {}, manualRegistrationDateByRowId: {}, anagraficheDecisioniByKey: {}, percipientiDecisioniByKey: {}, automationMetaByRowId: {} }
    }
    return { result: null, manualAccountByRowId: {}, manualCausaleByRowId: {}, manualRegistrationDateByRowId: {}, anagraficheDecisioniByKey: {}, percipientiDecisioniByKey: {}, automationMetaByRowId: {} }
  } catch {
    return { result: null, manualAccountByRowId: {}, manualCausaleByRowId: {}, manualRegistrationDateByRowId: {}, anagraficheDecisioniByKey: {}, percipientiDecisioniByKey: {}, automationMetaByRowId: {} }
  }
}

function hasUsableResultSnapshot(snapshot) {
  return Boolean(snapshot?.result && Array.isArray(snapshot.result.stagingRows))
}

function writeSocietaSnapshot(societaId, result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey, automationMetaByRowId) {
  if (typeof window === 'undefined' || !societaId) return false
  const storageKey = getSocietaResultStorageKey(societaId)
  const payloads = [
    buildStorageSnapshot(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey, automationMetaByRowId),
    buildEmergencyStorageSnapshot(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey, automationMetaByRowId),
  ]

  try {
    for (const payload of payloads) {
      try {
        const serialized = JSON.stringify(payload)
        window.sessionStorage.setItem(storageKey, serialized)
        return true
      } catch (error) {
        console.warn('[import_contabilita] snapshot storage write failed, trying smaller snapshot', error)
      }
    }
  } catch (error) {
    console.warn('[import_contabilita] snapshot storage failed', error)
  }
  return false
}

function clearSessionResult(societaId) {
  if (typeof window === 'undefined' || !societaId) return
  try {
    window.sessionStorage.removeItem(getSocietaResultStorageKey(societaId))
  } catch {
    // Ignore storage errors to keep the UI usable.
  }
}

const PANEL_STYLE = {
  border: '1px solid var(--bd)',
  background: 'linear-gradient(180deg, rgba(255,255,255,.02), rgba(255,255,255,.01))',
  boxShadow: '0 6px 18px rgba(0,0,0,.08)',
}

const BUTTON_BASE = {
  border: '1px solid var(--bd)',
  background: 'rgba(255,255,255,.03)',
  color: 'var(--tx)',
  borderRadius: 8,
  padding: '.18rem .34rem',
  fontWeight: 700,
  cursor: 'pointer',
  transition: 'transform .12s ease, background .12s ease, border-color .12s ease',
  fontSize: '.69rem',
  minHeight: 24,
}

function formatCount(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? String(parsed) : '0'
}

function formatMoney(value) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return '-'
  return MONEY_FORMATTER.format(parsed)
}

function getRowKey(row) {
  return String(row?.id || row?.filename || '')
}

function describeRow(row) {
  return [
    row?.filename || '',
    row?.parsedDocument?.numeroDocumento || '',
    row?.parsedDocument?.fornitore?.denominazione || '',
    row?.parsedDocument?.cliente?.denominazione || '',
    row?.state || '',
  ]
    .join(' ')
    .toLowerCase()
}

function getWarningsCount(row) {
  const warnings = row?.warnings
  if (Array.isArray(warnings)) return warnings.length
  if (typeof warnings === 'number') return warnings
  return 0
}

function getBlockingErrorsCount(row) {
  const blockingErrors = row?.blockingErrors
  if (Array.isArray(blockingErrors)) return blockingErrors.length
  if (typeof blockingErrors === 'number') return blockingErrors
  return 0
}

function describePianoConto(row) {
  return [
    row?.codice || '',
    row?.descrizione || '',
    row?.partitaIva || '',
    row?.anagraficaPiva || '',
    row?.codiceFiscale || '',
    row?.anagraficaCf || '',
  ]
    .join(' ')
    .toLowerCase()
}

function normalizePianoContoSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
}

function matchesPianoContoSearch(row, query) {
  const normalizedQuery = normalizePianoContoSearch(query)
  if (!normalizedQuery) return true

  const searchText = normalizePianoContoSearch([
    row?.codice || '',
    row?.descrizione || '',
    row?.partitaIva || '',
    row?.anagraficaPiva || '',
    row?.codiceFiscale || '',
    row?.anagraficaCf || '',
  ].join(' '))

  return searchText.includes(normalizedQuery)
}

function describePianoContoFlags(row) {
  const flags = []
  if (row?.isFornitore) flags.push('F')
  if (row?.isCliente) flags.push('C')
  if (row?.isIva) flags.push('IVA')
  if (!flags.length) flags.push(`L${Number(row?.livello || 0) || 0}`)
  return flags.join(' · ')
}

function formatDedupReasonLabel(value) {
  const key = String(value || '').trim()
  if (!key) return 'reimportabile'
  const normalized = key.toLowerCase()
  if (normalized === 'duplicateinstaging') return 'già in staging'
  if (normalized === 'duplicateinaccounting') return 'già contabilizzata'
  if (normalized === 'deletedinstaging') return 'eliminata da staging'
  if (normalized === 'deletedinaccounting') return 'eliminata da contabilità'
  if (normalized === 'batch_duplicate') return 'duplicato batch'
  if (normalized === 'duplicate_in_staging') return 'già in staging'
  if (normalized === 'duplicate_in_accounting') return 'già contabilizzata'
  if (normalized === 'deleted_in_staging') return 'eliminata da staging'
  if (normalized === 'deleted_in_accounting') return 'eliminata da contabilità'
  return key
}

function formatManualAccount(account) {
  if (!account) return '—'
  const codice = String(account?.codice || '').trim()
  const descrizione = String(account?.descrizione || '').trim()
  if (!codice && !descrizione) return '—'
  return descrizione ? `${codice || '—'} · ${descrizione}` : codice || '—'
}

function formatManualCausale(causale) {
  if (!causale) return '—'
  const codice = String(causale?.codice || '').trim()
  const descrizione = String(causale?.descrizione || '').trim()
  if (!codice && !descrizione) return '—'
  return descrizione ? `${codice || '—'} · ${descrizione}` : codice || '—'
}

function matchesCausaleSearch(row, query) {
  const normalizedQuery = normalizePianoContoSearch(query)
  if (!normalizedQuery) return true
  const searchText = normalizePianoContoSearch([row?.codice || '', row?.descrizione || ''].join(' '))
  return searchText.includes(normalizedQuery)
}

function getRowReadiness(row, manualAccount = null, manualCausale = null) {
  const blockingErrorsCount = getBlockingErrorsCount(row)
  const parsedDocument = row?.parsedDocument || {}
  const missing = []

  if (!String(parsedDocument?.numeroDocumento || '').trim()) missing.push('numero documento')
  if (!String(parsedDocument?.dataDocumento || '').trim()) missing.push('data documento')
  const imponibile = Number(parsedDocument?.imponibile)
  const iva = Number(parsedDocument?.iva)
  const totale = Number(parsedDocument?.totale)
  if (parsedDocument?.imponibile === null || parsedDocument?.imponibile === undefined || parsedDocument?.imponibile === '' || Number.isNaN(imponibile)) missing.push('imponibile')
  if (parsedDocument?.iva === null || parsedDocument?.iva === undefined || parsedDocument?.iva === '' || Number.isNaN(iva)) missing.push('IVA')
  if (parsedDocument?.totale === null || parsedDocument?.totale === undefined || parsedDocument?.totale === '' || Number.isNaN(totale)) missing.push('totale')

  if (blockingErrorsCount > 0) {
    return {
      ready: false,
      missing: missing.length ? missing : ['errori bloccanti'],
      severity: 'error',
      label: 'Errore',
    }
  }

  if (missing.length) {
    return {
      ready: false,
      missing,
      severity: 'warning',
      label: 'Incompleta',
    }
  }

  return {
    ready: true,
    missing: [],
    severity: 'ok',
    label: 'Pronta',
  }
}

function resolveImportDocumentReadiness(row, manualAccount = null, manualCausale = null, counterpartyAccount = null, decisions = {}, list = []) {
  const state = String(row?.state || row?.stato || '').toLowerCase()
  const isProcessed = state === 'registered' || state === 'committed' || state === 'processed' || row?.committed
  if (isProcessed) {
    return {
      ready: false,
      isReadyForWorkingView: false,
      blockingReasons: [],
      warnings: [],
      info: [],
      missing: [],
      requiresNewAnagraficaConfirmation: false,
      requiresAnagraficaReview: false,
      requiresCausaleBeforeStart: false,
      requiresContoBeforeStart: false,
      severity: 'ok',
      label: 'Registrata',
    }
  }

  const parsedDocument = row?.parsedDocument || {}
  const preferred = getPreferredCounterparty(parsedDocument)
  const counterparty = preferred?.counterparty || {}
  
  const blockingReasons = []
  const warnings = []
  const info = []
  
  // 1. Dati minimi documento
  if (!String(parsedDocument?.numeroDocumento || '').trim()) blockingReasons.push('numero documento mancante')
  if (!String(parsedDocument?.dataDocumento || '').trim()) blockingReasons.push('data documento mancante')
  
  const imponibile = Number(parsedDocument?.imponibile)
  const iva = Number(parsedDocument?.iva)
  const totale = Number(parsedDocument?.totale)
  
  if (parsedDocument?.imponibile === null || parsedDocument?.imponibile === undefined || parsedDocument?.imponibile === '' || Number.isNaN(imponibile)) {
    blockingReasons.push('imponibile mancante o non valido')
  }
  if (parsedDocument?.iva === null || parsedDocument?.iva === undefined || parsedDocument?.iva === '' || Number.isNaN(iva)) {
    blockingReasons.push('IVA mancante o non valida')
  }
  if (parsedDocument?.totale === null || parsedDocument?.totale === undefined || parsedDocument?.totale === '' || Number.isNaN(totale)) {
    blockingReasons.push('totale mancante o non valido')
  }
  
  const blockingErrorsCount = getBlockingErrorsCount(row)
  if (blockingErrorsCount > 0) {
    blockingReasons.push('errori bloccanti nel tracciato')
  }

  // 2. Classificazione Anagrafica
  const pianoLookup = buildPianoContiLookup(list && list.length ? list : (typeof pianoConti !== 'undefined' ? pianoConti : []))
  const classification = classifyCounterparty(counterparty, pianoLookup)
  
  const decisionKey = normalizeAnagraficaDecisionKey(
    row?.decisionKey || getAnagraficaDecisionKeyFromCounterparty(counterparty)
  )
  const decisionsMap = decisions && Object.keys(decisions).length ? decisions : (typeof anagraficheDecisioniByKey !== 'undefined' ? anagraficheDecisioniByKey : {})
  const decision = decisionKey ? decisionsMap?.[decisionKey] : null
  const isConfirmed = decision?.decisionStatus === 'confirmed' || decision?.hiddenFromAnagrafiche
  
  let requiresNewAnagraficaConfirmation = false
  let requiresAnagraficaReview = false
  
  if (!isConfirmed) {
    if (classification.status === 'nuova') {
      requiresNewAnagraficaConfirmation = true
      blockingReasons.push('Nuova anagrafica da confermare')
    } else if (classification.status === 'possibile match') {
      requiresAnagraficaReview = true
      blockingReasons.push('Match anagrafico incerto')
    } else if (classification.status === 'dati incompleti') {
      requiresAnagraficaReview = true
      blockingReasons.push('Anagrafica da integrare')
    } else if (classification.status === 'già presente') {
      const matched = classification.matchedPianoConto
      const hasPiva = Boolean(normalizeAnagraficaIdentifier(matched.partitaIva || matched.anagraficaPiva))
      const hasCf = Boolean(normalizeAnagraficaIdentifier(matched.codiceFiscale || matched.anagraficaCf))
      if (!hasPiva && !hasCf) {
        requiresAnagraficaReview = true
        blockingReasons.push('Anagrafica da integrare')
      }
    }
  }
  
  // 3. Causale contabile
  let requiresCausaleBeforeStart = false
  if (!manualCausale?.id && !manualCausale?.codice) {
    requiresCausaleBeforeStart = false
    warnings.push('Causale da completare in Working View')
  }
  
  // 4. Conto contabile
  let requiresContoBeforeStart = false
  if (!manualAccount?.id && !manualAccount?.codice) {
    requiresContoBeforeStart = false
    warnings.push('Conto da completare in Working View')
  }

  if (!counterpartyAccount?.id && !counterpartyAccount?.codice) {
    warnings.push('Conto controparte da completare in Working View')
  }

  const isReadyForWorkingView = blockingReasons.length === 0
  const missing = [...blockingReasons, ...warnings]
  
  return {
    ready: isReadyForWorkingView,
    isReadyForWorkingView,
    blockingReasons,
    warnings,
    info,
    missing,
    requiresNewAnagraficaConfirmation,
    requiresAnagraficaReview,
    requiresCausaleBeforeStart,
    requiresContoBeforeStart,
    severity: blockingReasons.length ? 'error' : warnings.length ? 'warning' : 'ok',
    label: blockingReasons.length ? 'Errore' : warnings.length ? 'Incompleta' : 'Pronta',
  }
}

function getWorkingTableRowReadiness(row, manualAccount = null, manualCausale = null, counterpartyAccount = null, decisions = {}, list = []) {
  return resolveImportDocumentReadiness(row, manualAccount, manualCausale, counterpartyAccount, decisions, list)
}

const WORKING_VIEW_BLOCK_EPS = 0.01

function parseWorkingViewNumber(value) {
  if (value === null || value === undefined || value === '') return NaN
  const text = String(value).trim().replace(/\s+/g, '')
  if (!text) return NaN
  const normalized = text.includes(',') ? text.replace(/\./g, '').replace(',', '.') : text
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

function buildImportContabilitaWorkingViewChecks(model) {
  const active = model && typeof model === 'object' ? model : {}
  const blockingIssues = []
  const warnings = []
  const checks = []

  const counterpartyAccount = active?.counterpartyAccount || null
  const costRevenueAccount = active?.costRevenueAccount || null
  const causale = active?.causale || null
  const parsedDocument = active?.parsedDocument || {}
  const counterpartyLabel = normalizeText(active?.fornitoreCliente || '') || 'Controparte'

  const numeroDocumento = normalizeText(parsedDocument?.numeroDocumento || '')
  const dataDocumento = normalizeText(parsedDocument?.dataDocumento || '')
  const imponibile = parseWorkingViewNumber(parsedDocument?.imponibile)
  const iva = parseWorkingViewNumber(parsedDocument?.iva)
  const totale = parseWorkingViewNumber(parsedDocument?.totale)

  const hasCounterparty = Boolean(counterpartyAccount?.id || counterpartyAccount?.codice)
  const hasCostRevenue = Boolean(costRevenueAccount?.id || costRevenueAccount?.codice)
  const hasCausale = Boolean(causale?.id || causale?.codice)

  const pushCheck = (key, label, ok, detail = '', issueType = '') => {
    const status = ok ? 'ok' : issueType === 'blocked' ? 'blocked' : issueType === 'warning' ? 'warning' : 'info'
    checks.push({ key, label, status, detail })
  }

  if (hasCounterparty) {
    pushCheck('counterparty', 'Controparte patrimoniale collegata', true, formatManualAccount(counterpartyAccount))
  } else {
    const issue = 'Controparte non collegata'
    blockingIssues.push(issue)
    checks.push({ key: 'counterparty', label: issue, status: 'blocked', detail: counterpartyLabel })
  }

  if (hasCostRevenue) {
    pushCheck('costRevenue', 'Conto costo/ricavo selezionato', true, formatManualAccount(costRevenueAccount))
  } else {
    const issue = 'Conto costo/ricavo mancante'
    blockingIssues.push(issue)
    checks.push({ key: 'costRevenue', label: issue, status: 'blocked' })
  }

  if (hasCausale) {
    pushCheck('causale', 'Causale contabile selezionata', true, formatManualCausale(causale))
  } else {
    const issue = 'Causale contabile mancante'
    blockingIssues.push(issue)
    checks.push({ key: 'causale', label: issue, status: 'blocked' })
  }

  if (numeroDocumento) {
    pushCheck('numeroDocumento', 'Numero documento presente', true, numeroDocumento)
  } else {
    const issue = 'Numero documento mancante'
    blockingIssues.push(issue)
    checks.push({ key: 'numeroDocumento', label: issue, status: 'blocked' })
  }

  if (dataDocumento) {
    pushCheck('dataDocumento', 'Data documento presente', true, dataDocumento)
  } else {
    const issue = 'Data documento mancante'
    blockingIssues.push(issue)
    checks.push({ key: 'dataDocumento', label: issue, status: 'blocked' })
  }

  if (Number.isFinite(imponibile) && imponibile >= 0) {
    pushCheck('imponibile', 'Imponibile presente', true, formatMoney(imponibile))
  } else {
    const issue = 'Imponibile mancante o non numerico'
    warnings.push(issue)
    checks.push({ key: 'imponibile', label: issue, status: 'warning' })
  }

  if (Number.isFinite(iva) && iva >= 0) {
    pushCheck('iva', 'IVA presente', true, formatMoney(iva))
  } else {
    const issue = 'IVA mancante o non numerica'
    warnings.push(issue)
    checks.push({ key: 'iva', label: issue, status: 'warning' })
  }
  checks.push({
    key: 'iva-note',
    label: 'Detraibilità IVA da gestire nella working view avanzata',
    status: 'info',
  })

  if (Number.isFinite(totale) && totale >= 0) {
    pushCheck('totale', 'Totale presente', true, formatMoney(totale))
  } else {
    const issue = 'Totale mancante o non numerico'
    blockingIssues.push(issue)
    checks.push({ key: 'totale', label: issue, status: 'blocked' })
  }

  if (Number.isFinite(imponibile) && Number.isFinite(iva) && Number.isFinite(totale)) {
    const dare = Math.round((imponibile + iva) * 100) / 100
    const avere = Math.round(totale * 100) / 100
    const diff = Math.abs(dare - avere)
    if (diff > WORKING_VIEW_BLOCK_EPS) {
      const issue = `Prima nota non quadrata (${formatMoney(dare)} != ${formatMoney(avere)})`
      blockingIssues.push(issue)
      checks.push({ key: 'prima-nota', label: issue, status: 'blocked' })
    } else {
      checks.push({ key: 'prima-nota', label: 'Prima nota quadrata', status: 'ok', detail: `${formatMoney(dare)} = ${formatMoney(avere)}` })
    }
  }

  if (hasCounterparty && Number.isFinite(totale) && totale >= 0) {
    checks.push({ key: 'partitario', label: 'Partitario coerente', status: 'ok', detail: formatMoney(totale) })
  } else {
    if (!hasCounterparty) {
      const issue = 'Partitario bloccato: controparte mancante'
      blockingIssues.push(issue)
      checks.push({ key: 'partitario', label: issue, status: 'blocked' })
    } else if (!(Number.isFinite(totale) && totale >= 0)) {
      const issue = 'Partitario bloccato: totale fattura mancante'
      blockingIssues.push(issue)
      checks.push({ key: 'partitario', label: issue, status: 'blocked' })
    }
  }

  const status = blockingIssues.length
    ? 'blocked'
    : warnings.length
      ? 'warning'
      : 'ok'

  return {
    status,
    blockingIssues,
    warnings,
    checks,
  }
}

function getSupplierKey(row) {
  return [
    row?.parsedDocument?.fornitore?.partitaIva || '',
    row?.parsedDocument?.fornitore?.denominazione || '',
  ]
    .join('|')
    .trim()
    .toLowerCase()
}

function normalizeFingerprintText(value) {
  return normalizeText(value).toLowerCase()
}

function normalizeMoneyFingerprint(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, '').replace(/[^0-9,.-]/g, '')
  const normalized = compact.includes(',') && compact.includes('.')
    ? compact.replace(/\./g, '').replace(',', '.')
    : compact.includes(',')
      ? compact.replace(',', '.')
      : compact
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return ''
  return parsed.toFixed(2)
}

function getParsedDocFingerprint(source) {
  const parsed = source?.parsedDocument || source?.parsedDoc || source || {}
  const fornitore = parsed?.fornitore || {}
  const cliente = parsed?.cliente || {}
  const numeroDocumento = normalizeText(parsed?.numeroDocumento || source?.numeroDocumento || source?.numero_documento || '')
  const dataDocumento = normalizeText(parsed?.dataDocumento || source?.dataDocumento || source?.data_documento || '')
  const totale = normalizeMoneyFingerprint(parsed?.totale ?? source?.totale ?? '')
  const counterparty = [
    fornitore?.partitaIva,
    fornitore?.codiceFiscale,
    fornitore?.denominazione,
    cliente?.partitaIva,
    cliente?.codiceFiscale,
    cliente?.denominazione,
  ].find((value) => normalizeText(value))

  if (!numeroDocumento || !dataDocumento || !totale || !counterparty) return ''

  return [
    parsed?.tipoDocumento || source?.tipoDocumento || source?.tipo_documento || '',
    numeroDocumento,
    dataDocumento,
    counterparty,
    totale,
  ]
    .map((value) => normalizeFingerprintText(value))
    .join('|')
}

function getStableRowFingerprint(source) {
  const parsedFingerprint = getParsedDocFingerprint(source)
  if (parsedFingerprint) return parsedFingerprint

  return [
    getRowKey(source),
    normalizeText(source?.filename),
    normalizeText(source?.sourceHash),
    normalizeText(source?.batchId),
  ]
    .filter(Boolean)
    .map((value) => normalizeFingerprintText(value))
    .join('|')
}

function mergeImportResults(existingResult, nextResult) {
  const existingRows = Array.isArray(existingResult?.stagingRows) ? existingResult.stagingRows : []
  const nextRows = Array.isArray(nextResult?.stagingRows) ? nextResult.stagingRows : []

  if (!existingResult) {
    return {
      result: nextResult || null,
      existingCount: 0,
      addedCount: nextRows.length,
      skippedCount: 0,
    }
  }

  if (!nextRows.length) {
    return {
      result: existingResult,
      existingCount: existingRows.length,
      addedCount: 0,
      skippedCount: 0,
    }
  }

  const mergedRows = existingRows.slice()
  const seenFingerprints = new Set()
  existingRows.forEach((row) => {
    const fingerprint = getStableRowFingerprint(row)
    if (fingerprint) seenFingerprints.add(fingerprint)
  })

  let addedCount = 0
  let skippedCount = 0

  nextRows.forEach((row) => {
    const fingerprint = getStableRowFingerprint(row)
    if (fingerprint && seenFingerprints.has(fingerprint)) {
      skippedCount += 1
      return
    }
    if (fingerprint) seenFingerprints.add(fingerprint)
    mergedRows.push(row)
    addedCount += 1
  })

  const mergedResult = {
    ...(nextResult || {}),
    stagingRows: mergedRows,
    report: nextResult?.report
      ? {
          ...nextResult.report,
          localMergeExistingCount: existingRows.length,
          localMergeAddedCount: addedCount,
          localMergeSkippedCount: skippedCount,
          localMergeTotalCount: mergedRows.length,
        }
      : nextResult?.report,
  }

  return {
    result: mergedResult,
    existingCount: existingRows.length,
    addedCount,
    skippedCount,
  }
}

function buildReimportParsedDocSnapshot(source) {
  const parsed = source?.parsedDoc && typeof source.parsedDoc === 'object'
    ? source.parsedDoc
    : source?.parsedDocument && typeof source.parsedDocument === 'object'
      ? source.parsedDocument
      : {}
  const fornitore = parsed?.fornitore && typeof parsed.fornitore === 'object' ? parsed.fornitore : source?.fornitore || {}
  const cliente = parsed?.cliente && typeof parsed.cliente === 'object' ? parsed.cliente : source?.cliente || {}

  return {
    filename: normalizeText(parsed?.filename || source?.filename || ''),
    sourceHash: normalizeText(parsed?.sourceHash || source?.sourceHash || ''),
    tipoDocumento: normalizeText(parsed?.tipoDocumento || source?.tipoDocumento || source?.tipo_documento || ''),
    dataDocumento: normalizeText(parsed?.dataDocumento || source?.dataDocumento || source?.data_documento || ''),
    numeroDocumento: normalizeText(parsed?.numeroDocumento || source?.numeroDocumento || source?.numero_documento || ''),
    fornitore: {
      denominazione: normalizeText(fornitore?.denominazione || source?.soggetto_denominazione || ''),
      partitaIva: normalizeText(fornitore?.partitaIva || source?.soggetto_piva || ''),
      codiceFiscale: normalizeText(fornitore?.codiceFiscale || source?.soggetto_cf || ''),
    },
    cliente: {
      denominazione: normalizeText(cliente?.denominazione || source?.cliente_denominazione || ''),
      partitaIva: normalizeText(cliente?.partitaIva || source?.cliente_piva || ''),
      codiceFiscale: normalizeText(cliente?.codiceFiscale || source?.cliente_cf || ''),
    },
    imponibile: Number(parsed?.imponibile ?? source?.imponibile ?? 0) || 0,
    iva: Number(parsed?.iva ?? source?.iva ?? 0) || 0,
    totale: Number(parsed?.totale ?? source?.totale ?? 0) || 0,
    ivaRows: Array.isArray(parsed?.ivaRows) ? parsed.ivaRows.map((item) => ({ ...item })) : [],
    flags: parsed?.flags && typeof parsed.flags === 'object'
      ? { ...parsed.flags }
      : { reverseCharge: false, splitPayment: false, hasRitenuta: false, isProfessional: false },
    warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.slice() : [],
    errors: Array.isArray(parsed?.errors) ? parsed.errors.slice() : [],
    rawXml: normalizeText(parsed?.rawXml || source?.rawXml || ''),
    lineeDocumento: Array.isArray(parsed?.lineeDocumento) ? parsed.lineeDocumento.map((item) => ({ ...item })) : [],
  }
}

function normalizeAnagraficaText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeAnagraficaIdentifier(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

function getCounterpartyUsefulScore(counterparty) {
  if (!counterparty || typeof counterparty !== 'object') return 0
  return [
    normalizeText(counterparty?.denominazione),
    normalizeText(counterparty?.partitaIva),
    normalizeText(counterparty?.codiceFiscale),
  ].filter(Boolean).length
}

function getPreferredCounterparty(parsedDocument) {
  const fornitore = parsedDocument?.fornitore && typeof parsedDocument.fornitore === 'object' ? parsedDocument.fornitore : {}
  const cliente = parsedDocument?.cliente && typeof parsedDocument.cliente === 'object' ? parsedDocument.cliente : {}
  const supplierScore = getCounterpartyUsefulScore(fornitore)
  const clientScore = getCounterpartyUsefulScore(cliente)

  if (supplierScore > 0) {
    return { role: 'fornitore', counterparty: fornitore }
  }
  if (clientScore > 0) {
    return { role: 'cliente', counterparty: cliente }
  }
  return { role: 'fornitore', counterparty: fornitore || cliente || {} }
}

function getAnagraficaDecisionKeyFromCounterparty(counterparty) {
  const piva = normalizeAnagraficaIdentifier(counterparty?.partitaIva)
  if (piva) return `piva:${piva}`
  const cf = normalizeAnagraficaIdentifier(counterparty?.codiceFiscale)
  if (cf) return `cf:${cf}`
  const name = normalizeAnagraficaText(counterparty?.denominazione)
  if (name) return `name:${name}`
  return ''
}

function buildPianoContiLookup(rows) {
  const byPiva = new Map()
  const byCf = new Map()
  const normalizedRows = []

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const normalizedRow = {
      ...row,
      normalizedDenominazione: normalizeAnagraficaText(row?.descrizione),
      normalizedPiva: normalizeAnagraficaIdentifier(row?.partitaIva || row?.anagraficaPiva),
      normalizedCf: normalizeAnagraficaIdentifier(row?.codiceFiscale || row?.anagraficaCf),
    }

    normalizedRows.push(normalizedRow)
    if (normalizedRow.normalizedPiva) byPiva.set(normalizedRow.normalizedPiva, normalizedRow)
    if (normalizedRow.normalizedCf) byCf.set(normalizedRow.normalizedCf, normalizedRow)
  })

  return { rows: normalizedRows, byPiva, byCf }
}

function classifyCounterparty(candidate, pianoLookup) {
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

function buildAnagraficheDaVerificare(rows, pianoContiRows) {
  const pianoLookup = buildPianoContiLookup(pianoContiRows)
  const groups = []
  const groupByToken = new Map()

  ;(Array.isArray(rows) ? rows : []).forEach((row) => {
    const parsed = row?.parsedDocument || {}
    const preferred = getPreferredCounterparty(parsed)
    const counterparty = preferred.counterparty || {}
    const tokens = []

    const pivaToken = normalizeAnagraficaIdentifier(counterparty?.partitaIva)
    const cfToken = normalizeAnagraficaIdentifier(counterparty?.codiceFiscale)
    const nameToken = normalizeAnagraficaText(counterparty?.denominazione)
    const decisionKey = getAnagraficaDecisionKeyFromCounterparty(counterparty)

    if (pivaToken) tokens.push(`piva:${pivaToken}`)
    if (cfToken) tokens.push(`cf:${cfToken}`)
    if (nameToken) tokens.push(`name:${nameToken}`)
    if (!tokens.length) tokens.push(`row:${getRowKey(row) || groups.length}`)

    let group = null
    for (const token of tokens) {
      if (groupByToken.has(token)) {
        group = groupByToken.get(token)
        break
      }
    }

    if (!group) {
      group = {
        id: tokens[0],
        decisionKey: decisionKey || tokens[0],
        tipoSuggerito: preferred.role || 'fornitore',
        denominazione: normalizeText(counterparty?.denominazione || ''),
        partitaIva: normalizeText(counterparty?.partitaIva || ''),
        codiceFiscale: normalizeText(counterparty?.codiceFiscale || ''),
        stato: 'nuova',
        rank: 1,
        matchedPianoConto: null,
        fattureCount: 0,
        totaleDocumenti: 0,
        previewRowKey: getRowKey(row) || '',
        percipienteSignals: {
          hasRitenuta: false,
          isProfessional: false,
        },
      }
      groups.push(group)
    }

    tokens.forEach((token) => groupByToken.set(token, group))

    if (preferred.role === 'fornitore') {
      group.tipoSuggerito = 'fornitore'
    } else if (!group.tipoSuggerito) {
      group.tipoSuggerito = 'cliente'
    }

    if (!group.denominazione && counterparty?.denominazione) group.denominazione = normalizeText(counterparty.denominazione)
    if (!group.partitaIva && counterparty?.partitaIva) group.partitaIva = normalizeText(counterparty.partitaIva)
    if (!group.codiceFiscale && counterparty?.codiceFiscale) group.codiceFiscale = normalizeText(counterparty.codiceFiscale)
    if (!group.previewRowKey) group.previewRowKey = getRowKey(row) || ''

    const parsedFlags = parsed?.flags && typeof parsed.flags === 'object' ? parsed.flags : {}
    group.percipienteSignals = {
      hasRitenuta: Boolean(group?.percipienteSignals?.hasRitenuta || parsedFlags.hasRitenuta),
      isProfessional: Boolean(group?.percipienteSignals?.isProfessional || parsedFlags.isProfessional),
    }

    const classification = classifyCounterparty(counterparty, pianoLookup)
    if (classification.rank > group.rank) {
      group.rank = classification.rank
      group.stato = classification.status
      group.matchedPianoConto = classification.matchedPianoConto
    } else if (!group.matchedPianoConto && classification.matchedPianoConto) {
      group.matchedPianoConto = classification.matchedPianoConto
    }

    group.fattureCount += 1
    group.totaleDocumenti += Number(parsed?.totale || 0) || 0
  })

  return groups
    .filter((group) => {
      if (group.stato === 'già presente' && group.rank >= 3 && group.matchedPianoConto) {
        const hasPiva = Boolean(normalizeAnagraficaIdentifier(group.matchedPianoConto.partitaIva || group.matchedPianoConto.anagraficaPiva))
        const hasCf = Boolean(normalizeAnagraficaIdentifier(group.matchedPianoConto.codiceFiscale || group.matchedPianoConto.anagraficaCf))
        if (hasPiva || hasCf) {
          return false
        }
      }
      return true
    })
    .map((group) => {
      const matchedCode = normalizeText(group?.matchedPianoConto?.codice || '')
      const tipoSuggerito = group?.tipoSuggerito || 'fornitore'
      const suggestedMastrino = matchedCode || (tipoSuggerito === 'cliente' ? '1.02.20' : '2.03.08')

      return {
        id: group.id,
        decisionKey: group.decisionKey || group.id,
        tipoSuggerito,
        denominazione: normalizeText(group.denominazione || ''),
        partitaIva: normalizeText(group.partitaIva || ''),
        codiceFiscale: normalizeText(group.codiceFiscale || ''),
        stato: group.stato || 'nuova',
        matchRank: group.rank || 0,
        matchStrength: group.rank >= 3 ? 'strong' : group.rank === 2 ? 'weak' : 'none',
        mastrinoSuggerito: suggestedMastrino,
        matchedPianoContoCode: matchedCode,
        fattureCount: group.fattureCount,
        totaleDocumenti: group.totaleDocumenti,
        previewRowKey: group.previewRowKey || '',
        percipienteSignals: group.percipienteSignals || {
          hasRitenuta: false,
          isProfessional: false,
        },
      }
    })
    .sort((a, b) => {
      const byName = normalizeAnagraficaText(a.denominazione).localeCompare(normalizeAnagraficaText(b.denominazione))
      if (byName !== 0) return byName
      return normalizeAnagraficaText(a.partitaIva).localeCompare(normalizeAnagraficaText(b.partitaIva))
    })
}

function getAnagraficaDetectionNote(row) {
  const status = normalizeText(row?.stato).toLowerCase()
  if (status === 'già presente' || status === 'gia presente') {
    return row?.matchedPianoContoCode ? `Codice esistente: ${row.matchedPianoContoCode}` : 'Match forte su piano conti'
  }
  if (status === 'possibile match') {
    return row?.matchedPianoContoCode ? `Possibile corrispondenza: ${row.matchedPianoContoCode}` : 'Possibile match per denominazione'
  }
  if (status === 'dati incompleti') {
    return 'Dati essenziali incompleti'
  }
  return 'Nuova anagrafica rilevata'
}

function formatAnagraficaIdentifiers(row) {
  const piva = normalizeText(row?.partitaIva || '')
  const cf = normalizeText(row?.codiceFiscale || '')
  if (piva && cf) return `${piva} · ${cf}`
  return piva || cf || '—'
}

function getAnagraficaStatusLabel(status) {
  return normalizeText(status) || 'nuova'
}

function getAnagraficaDecisionBadgeLabel(status) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'confirmed') return 'confermata'
  if (normalized === 'ignored') return 'ignorata'
  return 'da verificare'
}

function getAnagraficaDecisionTone(status) {
  const normalized = normalizeText(status).toLowerCase()
  if (normalized === 'confirmed') return 'success'
  if (normalized === 'ignored') return 'warning'
  return 'neutral'
}

const ANAGRAFICA_DECISION_ACTIONS = Object.freeze([
  { value: 'choose', label: 'Da scegliere' },
  { value: 'new', label: 'Crea nuovo conto' },
  { value: 'existing', label: 'Conto esistente' },
  { value: 'none', label: 'Nessuna azione' },
])

function getAnagraficaDecisionActionLabel(accountMode) {
  const normalized = normalizeText(accountMode).toLowerCase()
  return ANAGRAFICA_DECISION_ACTIONS.find((item) => item.value === normalized)?.label || 'Da scegliere'
}

function getAnagraficaDecisionActionOptions() {
  return ANAGRAFICA_DECISION_ACTIONS.slice()
}

function getAnagraficaTipoOptions() {
  return [
    { value: 'fornitore', label: 'Fornitore' },
    { value: 'cliente', label: 'Cliente' },
  ]
}

function getAnagraficaRowKey(row, fallbackIndex = '') {
  const normalized = normalizeText(
    row?.decisionKey
      || row?.key
      || row?.id
      || row?.fingerprint
      || row?.partitaIva
      || row?.codiceFiscale
      || row?.denominazione
      || '',
  )
  return normalized || `anagrafica-${fallbackIndex}`
}

function getDefaultAnagraficaDecision(row, pianoContiList = []) {
  return getDefaultAnagraficaDecisionDomain(row, pianoContiList)
}

function getDefaultMastrinoForTipo(tipo) {
  return getDefaultMastrinoForTipoDomain(tipo)
}

const ANAGRAFICA_MASTRINI_BY_TIPO = Object.freeze({
  fornitore: [
    { codice: '2.03.08', label: 'Fornitori Italia' },
    { codice: '2.03.09', label: 'Fornitori Estero' },
    { codice: '2.03.10', label: 'Professionisti' },
  ],
  cliente: [
    { codice: '1.02.20', label: 'Clienti Italia' },
    { codice: '1.02.21', label: 'Clienti Estero' },
  ],
})

function getAllowedMastriniForTipo(tipo) {
  return getAllowedMastriniForTipoDomain(tipo)
}

function getAllowedMastrinoCodesForTipo(tipo) {
  return getAllowedMastrinoCodesForTipoDomain(tipo)
}

function buildAnagraficaAllowedAccountsIndex(pianoContiList) {
  const rows = Array.isArray(pianoContiList) ? pianoContiList : []
  const createBucket = () => ({
    all: [],
    byMastrino: Object.create(null),
    byId: new Map(),
    byCodeDigits: new Map(),
  })

  const index = {
    fornitore: createBucket(),
    cliente: createBucket(),
  }

  const mastriniByTipo = {
    fornitore: getAllowedMastrinoCodesForTipo('fornitore'),
    cliente: getAllowedMastrinoCodesForTipo('cliente'),
  }

  rows.forEach((conto) => {
    const codice = normalizeText(conto?.codice || '')
    const normalizedCodeDigits = normalizeAccountCodeDigits(codice)
    if (!normalizedCodeDigits) return

    const entry = {
      id: normalizeText(conto?.id || ''),
      codice,
      descrizione: normalizeText(conto?.descrizione || ''),
      partitaIva: normalizeText(conto?.partitaIva || conto?.anagraficaPiva || ''),
      codiceFiscale: normalizeText(conto?.codiceFiscale || conto?.anagraficaCf || ''),
      label: formatAnagraficaAccountOption(conto),
      normalizedCodeDigits,
      searchText: normalizeText([
        conto?.codice,
        conto?.descrizione,
        conto?.partitaIva,
        conto?.anagraficaPiva,
        conto?.codiceFiscale,
        conto?.anagraficaCf,
        formatAnagraficaAccountOption(conto),
      ].join(' ')).toLowerCase(),
      isFornitore: conto?.isFornitore === true,
      isCliente: conto?.isCliente === true,
    }

    if (entry.id && !index.fornitore.byId.has(entry.id)) index.fornitore.byId.set(entry.id, entry)
    if (entry.id && !index.cliente.byId.has(entry.id)) index.cliente.byId.set(entry.id, entry)
    if (!index.fornitore.byCodeDigits.has(normalizedCodeDigits)) index.fornitore.byCodeDigits.set(normalizedCodeDigits, entry)
    if (!index.cliente.byCodeDigits.has(normalizedCodeDigits)) index.cliente.byCodeDigits.set(normalizedCodeDigits, entry)

    let addedForFornitore = false
    mastriniByTipo.fornitore.forEach((mastrino) => {
      if (!accountCodeBelongsToMastrino(codice, mastrino)) return
      if (!index.fornitore.byMastrino[mastrino]) index.fornitore.byMastrino[mastrino] = []
      index.fornitore.byMastrino[mastrino].push(entry)
      addedForFornitore = true
    })
    if (addedForFornitore) index.fornitore.all.push(entry)

    let addedForCliente = false
    mastriniByTipo.cliente.forEach((mastrino) => {
      if (!accountCodeBelongsToMastrino(codice, mastrino)) return
      if (!index.cliente.byMastrino[mastrino]) index.cliente.byMastrino[mastrino] = []
      index.cliente.byMastrino[mastrino].push(entry)
      addedForCliente = true
    })
    if (addedForCliente) index.cliente.all.push(entry)
  })

  const sortEntries = (entries, normalizedTipo) => entries.sort((left, right) => {
    const leftPreferred = (normalizedTipo === 'fornitore' && left?.isFornitore === true) || (normalizedTipo === 'cliente' && left?.isCliente === true) ? 1 : 0
    const rightPreferred = (normalizedTipo === 'fornitore' && right?.isFornitore === true) || (normalizedTipo === 'cliente' && right?.isCliente === true) ? 1 : 0
    if (rightPreferred !== leftPreferred) return rightPreferred - leftPreferred
    const leftCode = normalizeAccountCodeDigits(left?.codice)
    const rightCode = normalizeAccountCodeDigits(right?.codice)
    return leftCode.localeCompare(rightCode)
  })

  sortEntries(index.fornitore.all, 'fornitore')
  sortEntries(index.cliente.all, 'cliente')
  Object.keys(index.fornitore.byMastrino).forEach((key) => sortEntries(index.fornitore.byMastrino[key], 'fornitore'))
  Object.keys(index.cliente.byMastrino).forEach((key) => sortEntries(index.cliente.byMastrino[key], 'cliente'))

  return index
}

function getIndexedAllowedAccounts(anagraficaAllowedAccountsIndex, tipo, selectedMastrino = '') {
  const normalizedTipo = tipo === 'cliente' ? 'cliente' : 'fornitore'
  const bucket = anagraficaAllowedAccountsIndex?.[normalizedTipo] || null
  if (!bucket) return []

  const normalizedSelectedMastrino = normalizeText(selectedMastrino)
  if (normalizedSelectedMastrino && isAllowedMastrinoForTipo(normalizedTipo, normalizedSelectedMastrino)) {
    return Array.isArray(bucket.byMastrino?.[normalizedSelectedMastrino]) ? bucket.byMastrino[normalizedSelectedMastrino] : []
  }

  return Array.isArray(bucket.all) ? bucket.all : []
}

function searchIndexedAllowedAccounts(anagraficaAllowedAccountsIndex, tipo, searchTerm = '', selectedMastrino = '') {
  const base = getIndexedAllowedAccounts(anagraficaAllowedAccountsIndex, tipo, selectedMastrino)
  const query = normalizeText(searchTerm).toLowerCase()
  if (query.length < 2) return []
  return base.filter((account) => (account?.searchText || '').includes(query))
}

function resolveIndexedAllowedAccount(anagraficaAllowedAccountsIndex, tipo, decisionOrRow) {
  const normalizedTipo = tipo === 'cliente' ? 'cliente' : 'fornitore'
  const accountId = normalizeText(decisionOrRow?.decision?.existingAccountId || decisionOrRow?.existingAccountId || '')
  const accountCode = normalizeText(decisionOrRow?.decision?.existingAccountCode || decisionOrRow?.existingAccountCode || decisionOrRow?.matchedPianoContoCode || '')
  const codeDigits = normalizeAccountCodeDigits(accountCode)
  const bucket = anagraficaAllowedAccountsIndex?.[normalizedTipo] || null
  if (!bucket) return null

  if (accountId && bucket.byId?.has(accountId)) {
    const found = bucket.byId.get(accountId)
    if (found && isAllowedMastrinoForTipo(normalizedTipo, getMastrinoCodeForAccountCode(found.codice, normalizedTipo))) return found
  }

  if (codeDigits && bucket.byCodeDigits?.has(codeDigits)) {
    const found = bucket.byCodeDigits.get(codeDigits)
    if (found && isAllowedMastrinoForTipo(normalizedTipo, getMastrinoCodeForAccountCode(found.codice, normalizedTipo))) return found
  }

  return null
}

function normalizeAccountCodeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

function accountCodeBelongsToMastrino(accountCode, mastrinoCode) {
  const accountDigits = normalizeAccountCodeDigits(accountCode)
  const mastrinoDigits = normalizeAccountCodeDigits(mastrinoCode)
  return Boolean(accountDigits && mastrinoDigits && accountDigits.startsWith(mastrinoDigits))
}

function getMastrinoCodeForAccountCode(accountCode, tipo) {
  const allowedMastrini = getAllowedMastriniForTipo(tipo)
  return allowedMastrini.find((item) => accountCodeBelongsToMastrino(accountCode, item.codice))?.codice || ''
}

function formatAnagraficaAccountOption(conto) {
  if (!conto) return ''
  const code = normalizeText(conto.codice || '')
  const descrizione = normalizeText(conto.descrizione || '')
  const label = `${code || '—'} - ${descrizione || '—'}`
  const taxId = normalizeText(conto.partitaIva || conto.anagraficaPiva || conto.codiceFiscale || conto.anagraficaCf || '')
  return taxId ? `${label} · ${taxId}` : label
}

function getCounterpartyDisplayInfo(counterparty, role = 'fornitore') {
  const normalizedRole = role === 'cliente' ? 'cliente' : 'fornitore'
  const roleLabel = normalizedRole === 'cliente' ? 'Cliente' : 'Fornitore'
  const denominazione = normalizeText(counterparty?.denominazione || '')
  const partitaIva = normalizeText(counterparty?.partitaIva || '')
  const codiceFiscale = normalizeText(counterparty?.codiceFiscale || '')
  const hasEssentials = Boolean(denominazione || partitaIva || codiceFiscale)

  if (denominazione) {
    return {
      title: denominazione,
      subtitle: '',
      tone: 'success',
    }
  }

  if (hasEssentials) {
    return {
      title: `${roleLabel}: dati fiscali presenti, denominazione mancante`,
      subtitle: 'Denominazione mancante',
      tone: 'warning',
    }
  }

  return {
    title: `${roleLabel} mancante`,
    subtitle: 'Dati anagrafici mancanti',
    tone: 'danger',
  }
}

function isAllowedMastrinoForTipo(tipo, mastrino) {
  return isAllowedMastrinoForTipoDomain(tipo, mastrino)
}

function filterAllowedExistingAccounts(tipo, pianoContiList, searchTerm = '', selectedMastrino = '') {
  return getAllowedExistingAccounts(tipo, pianoContiList, searchTerm, selectedMastrino)
}

function getAllowedExistingAccounts(tipo, pianoContiList, searchTerm = '', selectedMastrino = '') {
  return getAllowedExistingAccountsDomain(tipo, pianoContiList, searchTerm, selectedMastrino)
}

function getImportContabilitaCounterpartyKey(row) {
  return getAnagraficaDecisionKeyFromCounterparty({
    denominazione: row?.denominazione || '',
    partitaIva: row?.partitaIva || '',
    codiceFiscale: row?.codiceFiscale || '',
  }) || normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id || '')
}

function findImportContabilitaExistingAccount(row, pianoContiList, tipo) {
  const candidates = getAllowedExistingAccounts(tipo, pianoContiList, '', '')
  const pivaKey = normalizeAnagraficaIdentifier(row?.partitaIva)
  const cfKey = normalizeAnagraficaIdentifier(row?.codiceFiscale)
  const nameKey = normalizeAnagraficaText(row?.denominazione)

  return candidates.find((conto) => {
    const contoPiva = normalizeAnagraficaIdentifier(conto?.partitaIva || conto?.anagraficaPiva)
    const contoCf = normalizeAnagraficaIdentifier(conto?.codiceFiscale || conto?.anagraficaCf)
    const contoName = normalizeAnagraficaText(conto?.descrizione)
    if (pivaKey && contoPiva && contoPiva === pivaKey) return true
    if (cfKey && contoCf && contoCf === cfKey) return true
    if (nameKey && contoName && contoName === nameKey) return true
    return false
  }) || null
}

function buildImportContabilitaPianoContoPayload({ societaId, row, decision, codice }) {
  const normalizedSocietaId = normalizeText(societaId || '')
  const normalizedCodice = normalizeText(codice || '')
  const normalizedDecision = decision && typeof decision === 'object' ? decision : {}
  const tipo = normalizedDecision?.tipo === 'cliente' ? 'cliente' : 'fornitore'
  const mastrino = normalizeText(normalizedDecision?.mastrino || '')
  const isCliente = tipo === 'cliente'
  const isProfessionista = mastrino === '2.03.10'
  const descrizione = normalizeText(
    row?.denominazione
      || row?.partitaIva
      || row?.codiceFiscale
      || 'Anagrafica importata',
  )
  const parts = normalizedCodice.split(' ').filter(Boolean)
  const livello = parts.length || 0

  return {
    societa_id: normalizedSocietaId,
    codice: normalizedCodice,
    codice_mastro: parts[0] || null,
    codice_conto: parts.length >= 3 ? parts.slice(0, 3).join(' ') : null,
    codice_sottoconto: parts.length >= 4 ? normalizedCodice : null,
    descrizione,
    tipo: 'patrimoniale',
    natura: isCliente ? 'attivo' : 'passivo',
    sezione: isCliente ? 'dare' : 'avere',
    livello,
    is_cliente: isCliente,
    is_fornitore: !isCliente,
    is_professionista: isProfessionista,
    anagrafica_tipo: isProfessionista ? 'professionista' : tipo,
    partita_iva: normalizeText(row?.partitaIva || '') || null,
    codice_fiscale: normalizeText(row?.codiceFiscale || '') || null,
    anagrafica_piva: normalizeText(row?.partitaIva || '') || null,
    anagrafica_cf: normalizeText(row?.codiceFiscale || '') || null,
    note: `Creato da Import Contabilita per ${getImportContabilitaCounterpartyKey(row) || descrizione}`,
    attivo: true,
  }
}

const AnagraficaExistingAccountPicker = memo(function AnagraficaExistingAccountPicker({
  rowKey,
  tipo = 'fornitore',
  valueId = '',
  valueCode = '',
  selectedLabel = '',
  allowedAccounts = [],
  disabled = false,
  onSelect,
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 })
  const inputRef = useRef(null)

  useEffect(() => {
    if (disabled) {
      setIsOpen(false)
      setQuery('')
      setDebouncedQuery('')
    }
  }, [disabled])

  useEffect(() => {
    if (!isOpen) {
      setDebouncedQuery('')
      return undefined
    }

    const timer = window.setTimeout(() => {
      setDebouncedQuery(normalizeText(query).toLowerCase())
    }, 150)

    return () => window.clearTimeout(timer)
  }, [isOpen, query])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      const updateCoords = () => {
        if (inputRef.current) {
          const rect = inputRef.current.getBoundingClientRect()
          setCoords({
            top: rect.bottom,
            left: rect.left,
            width: rect.width,
          })
        }
      }
      updateCoords()
      window.addEventListener('resize', updateCoords)
      window.addEventListener('scroll', updateCoords, true)
      return () => {
        window.removeEventListener('resize', updateCoords)
        window.removeEventListener('scroll', updateCoords, true)
      }
    }
    return undefined
  }, [isOpen])

  const normalizedQuery = normalizeText(debouncedQuery).toLowerCase()
  const selectedValueLabel = selectedLabel || normalizeText(valueCode) || normalizeText(valueId) || ''
  const visibleAccounts = useMemo(() => {
    if (!isOpen || disabled) return []
    if (normalizedQuery.length < 2) return []
    const rows = Array.isArray(allowedAccounts) ? allowedAccounts : []
    return rows
      .filter((account) => normalizeText(account?.searchText).includes(normalizedQuery))
      .slice(0, 25)
  }, [allowedAccounts, disabled, isOpen, normalizedQuery])

  const accountMessage = !isOpen
    ? ''
    : normalizedQuery.length < 2
      ? 'Digita almeno 2 caratteri per cercare'
      : visibleAccounts.length
        ? (Array.isArray(allowedAccounts) && allowedAccounts.length > visibleAccounts.length ? 'Mostrati primi 25 risultati. Usa la ricerca per restringere.' : '')
        : 'Nessun conto trovato nei mastrini ammessi'

  const displayValue = isOpen ? query : selectedValueLabel

  return (
    <div data-row-key={rowKey} style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        placeholder={selectedValueLabel || 'Seleziona conto esistente'}
        disabled={disabled}
        onFocus={() => {
          if (disabled) return
          setIsOpen(true)
          setQuery('')
        }}
        onClick={() => {
          if (disabled) return
          setIsOpen(true)
          setQuery('')
        }}
        onChange={(event) => {
          if (disabled) return
          setIsOpen(true)
          setQuery(event.target.value)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setIsOpen(false)
            setQuery('')
            setDebouncedQuery('')
          }, 150)
        }}
        style={{ width: '100%', border: '1px solid rgba(124,157,202,.18)', borderRadius: 8, background: 'rgba(255,255,255,.03)', color: 'var(--tx)', padding: '.18rem .24rem', fontSize: '.69rem' }}
      />
      {selectedValueLabel && !isOpen ? (
        <div style={{ marginTop: '.08rem', fontSize: '.58rem', color: 'var(--mu)' }}>
          Selezionato: {selectedValueLabel}
        </div>
      ) : null}
      {isOpen ? createPortal(
        <div style={{ position: 'fixed', top: coords.top + 4, left: coords.left, width: coords.width || 280, zIndex: 99999, maxHeight: 220, overflow: 'auto', borderRadius: 10, border: '1px solid rgba(124,157,202,.18)', background: 'rgba(12,16,24,.98)', boxShadow: '0 10px 24px rgba(0,0,0,.24)' }}>
          <div style={{ padding: '.24rem .34rem', fontSize: '.56rem', color: 'var(--mu)', borderBottom: '1px solid rgba(124,157,202,.08)' }}>
            {accountMessage || 'Digita almeno 2 caratteri per cercare'}
          </div>
          {visibleAccounts.length ? visibleAccounts.map((conto) => {
            const contoLabel = formatAnagraficaAccountOption(conto)
            return (
              <button
                key={conto.id}
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault()
                  event.stopPropagation()
                  onSelect?.(conto)
                  setIsOpen(false)
                  setQuery('')
                  setDebouncedQuery('')
                }}
                style={{ display: 'block', width: '100%', textAlign: 'left', padding: '.26rem .34rem', border: 'none', borderBottom: '1px solid rgba(124,157,202,.08)', background: 'transparent', color: 'var(--tx)', fontSize: '.66rem', cursor: 'pointer' }}
              >
                <div style={{ fontWeight: 700 }}>{contoLabel}</div>
                <div style={{ fontSize: '.56rem', color: 'var(--mu)' }}>
                  {accountCodeBelongsToMastrino(conto.codice || '', getMastrinoCodeForAccountCode(conto.codice || '', tipo)) ? 'Mastrino coerente' : 'Mastrino ammesso'}
                </div>
              </button>
            )
          }) : (
            <div style={{ padding: '.26rem .34rem', fontSize: '.66rem', color: 'var(--mu)' }}>
              {accountMessage || 'Nessun conto trovato nei mastrini ammessi'}
            </div>
          )}
        </div>,
        document.body
      ) : null}
    </div>
  )
})

function isAnagraficaDecisionComplete(row, decision, pianoContiList) {
  const validation = validateAnagraficaDecision(row, decision, pianoContiList)
  return validation.status === 'ready' || validation.status === 'linked' || validation.status === 'ignored'
}

function getAnagraficaDecisionStateLabel(row, decision, pianoContiList) {
  return validateAnagraficaDecision(row, decision, pianoContiList).label
}

function getAnagraficaDecisionStateTone(row, decision, pianoContiList) {
  const state = validateAnagraficaDecision(row, decision, pianoContiList).status
  if (state === 'ready' || state === 'linked') return 'success'
  if (state === 'ignored') return 'warning'
  if (state === 'incomplete' || state === 'invalid') return 'danger'
  return 'neutral'
}

function validateAnagraficaDecision(row, decision, pianoContiList) {
  return validateAnagraficaDecisionDomain(row, decision, pianoContiList)
}

function normalizeAnagraficaDecisionForRow(row, storedDecision, pianoContiList) {
  return normalizeAnagraficaDecisionForRowDomain(row, storedDecision, pianoContiList)
}

function mergeAnagraficaDecision(row, storedDecision, pianoContiList = []) {
  return mergeAnagraficaDecisionDomain(row, storedDecision, pianoContiList)
}

function findAnagraficaExistingAccount(row, pianoContiList) {
  return findAnagraficaExistingAccountDomain(row, pianoContiList)
}

function resolveAllowedAnagraficaAccountByCode(row, pianoContiList, tipo) {
  return resolveAllowedAnagraficaAccountByCodeDomain(row, pianoContiList, tipo)
}

function getCounterpartyDataForAnagraficaRow(row) {
  const tipo = row?.tipoSuggerito === 'cliente' || row?.tipo === 'cliente' ? 'cliente' : 'fornitore'
  return {
    denominazione: normalizeText(row?.denominazione || row?.ragioneSociale || row?.soggettoDenominazione || ''),
    partitaIva: normalizeText(row?.partitaIva || row?.partita_iva || row?.piva || row?.soggettoPiva || ''),
    codiceFiscale: normalizeText(row?.codiceFiscale || row?.codice_fiscale || row?.cf || row?.soggettoCf || ''),
    tipo,
    mastrino: normalizeText(row?.mastrinoSuggerito || row?.mastrino || getDefaultMastrinoForTipo(tipo)),
  }
}

function normalizePercipienteCf(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function getPercipienteSignalsForAnagraficaRow(row, decision) {
  const parsedFlags = row?.percipienteSignals && typeof row.percipienteSignals === 'object'
    ? row.percipienteSignals
    : row?.parsedDocument?.flags && typeof row.parsedDocument.flags === 'object'
      ? row.parsedDocument.flags
      : {}
  const normalizedDecision = decision && typeof decision === 'object' ? decision : {}
  const normalizedTipo = normalizeText(normalizedDecision.tipo || row?.tipoSuggerito || row?.tipo || '').toLowerCase()
  const mastrino = normalizeText(normalizedDecision.mastrino || row?.mastrinoSuggerito || row?.mastrino || '')
  const isFornitore = normalizedTipo === 'fornitore'
  const isProfessionista = mastrino === '2.03.10'

  return {
    hasRitenuta: Boolean(parsedFlags?.hasRitenuta),
    isProfessional: Boolean(parsedFlags?.isProfessional),
    tipo: normalizedTipo === 'cliente' ? 'cliente' : 'fornitore',
    mastrino,
    isFornitore,
    isProfessionista,
  }
}

function getPercipienteCandidateForAnagraficaRow(row, decision) {
  const counterparty = getCounterpartyDataForAnagraficaRow(row)
  const signals = getPercipienteSignalsForAnagraficaRow(row, decision)
  const reasons = []
  const hasCf = Boolean(normalizePercipienteCf(counterparty.codiceFiscale))
  const relevant = Boolean(
    signals.hasRitenuta ||
    signals.isProfessional ||
    signals.isProfessionista ||
    (signals.tipo === 'fornitore' && signals.mastrino === '2.03.10'),
  )

  if (!relevant) {
    return {
      relevant: false,
      codiceFiscale: hasCf ? normalizePercipienteCf(counterparty.codiceFiscale) : '',
      partitaIva: normalizeText(counterparty.partitaIva || ''),
      denominazione: normalizeText(counterparty.denominazione || ''),
      reasons,
    }
  }

  if (!hasCf) {
    reasons.push('CF mancante / percipiente non creabile')
  }

  return {
    relevant: true,
    codiceFiscale: hasCf ? normalizePercipienteCf(counterparty.codiceFiscale) : '',
    partitaIva: normalizeText(counterparty.partitaIva || ''),
    denominazione: normalizeText(counterparty.denominazione || ''),
    reasons,
  }
}

function findPercipienteByCf(percipientiList, codiceFiscale) {
  const cf = normalizePercipienteCf(codiceFiscale)
  if (!cf) return null
  return (Array.isArray(percipientiList) ? percipientiList : []).find((row) => normalizePercipienteCf(row?.codiceFiscale || row?.codice_fiscale) === cf) || null
}

function buildPercipienteStatusForAnagraficaRow(row, decision, percipientiList) {
  const candidate = getPercipienteCandidateForAnagraficaRow(row, decision)
  if (!candidate.relevant) {
    return {
      status: 'not_relevant',
      label: 'Non rilevante',
      tone: 'neutral',
      percipienteId: '',
      codiceFiscale: candidate.codiceFiscale || '',
      reasons: candidate.reasons || [],
    }
  }

  if (!candidate.codiceFiscale) {
    return {
      status: 'missing_cf',
      label: 'CF mancante',
      tone: 'danger',
      percipienteId: '',
      codiceFiscale: '',
      reasons: candidate.reasons.length ? candidate.reasons : ['CF obbligatorio per percipiente'],
    }
  }

  if (!Array.isArray(percipientiList)) {
    return {
      status: 'unknown',
      label: 'Percipienti non caricati',
      tone: 'warning',
      percipienteId: '',
      codiceFiscale: candidate.codiceFiscale,
      reasons: ['Percipienti non caricati'],
    }
  }

  const match = findPercipienteByCf(percipientiList, candidate.codiceFiscale)
  if (match?.id) {
    return {
      status: 'existing',
      label: 'Percipiente esistente',
      tone: 'success',
      percipienteId: match.id,
      codiceFiscale: candidate.codiceFiscale,
      denominazione: normalizeText(match.denominazione || match.ragione_sociale || [match.nome, match.cognome].filter(Boolean).join(' ')),
      reasons: ['Aggancio su codice fiscale'],
    }
  }

  return {
    status: 'candidate',
    label: 'Nuovo percipiente candidato',
    tone: 'warning',
    percipienteId: '',
    codiceFiscale: candidate.codiceFiscale,
    reasons: ['Nessun percipiente trovato con questo codice fiscale'],
  }
}

function normalizePercipienteDecisionForStorage(decision) {
  const status = decision?.status === 'created'
    ? 'created'
    : decision?.status === 'blocked'
      ? 'blocked'
      : 'linked'

  return {
    status,
    percipienteId: normalizeText(decision?.percipienteId || ''),
    codiceFiscale: normalizePercipienteCf(decision?.codiceFiscale || ''),
    actionAt: normalizeText(decision?.actionAt || ''),
    hiddenFromAnagrafiche: Boolean(decision?.hiddenFromAnagrafiche),
  }
}

function buildPercipienteCreatePayload(row, societaId) {
  const counterparty = getCounterpartyDataForAnagraficaRow(row)
  const signals = getPercipienteSignalsForAnagraficaRow(row, row?.decision || null)
  const codiceFiscale = normalizePercipienteCf(counterparty.codiceFiscale || row?.parsedDocument?.fornitore?.codiceFiscale || row?.parsedDocument?.cliente?.codiceFiscale || '')
  if (!normalizeText(societaId) || !codiceFiscale) return null

  return {
    societa_id: normalizeText(societaId),
    codice_fiscale: codiceFiscale,
    partita_iva: normalizeText(counterparty.partitaIva || '') || null,
    ragione_sociale: normalizeText(counterparty.denominazione || '') || null,
    nome: null,
    cognome: null,
    tipo_percipiente: 'professionista',
    soggetto_cu: true,
    soggetto_770: true,
    soggetto_ritenuta: Boolean(signals.hasRitenuta),
    attivo: true,
    validation_state: 'da_validare',
    validation_source: 'import_contabilita',
    auto_imported: true,
    note: 'Creato da Import Contabilità - verifica operatore.',
  }
}

function getExistingAccountForDecision(row, decision, pianoContiList) {
  const list = Array.isArray(pianoContiList) ? pianoContiList : []
  const normalizedDecision = decision && typeof decision === 'object' ? decision : {}
  const accountId = normalizeText(normalizedDecision.existingAccountId || '')
  const accountCode = normalizeText(normalizedDecision.existingAccountCode || row?.matchedPianoContoCode || '')
  const accountDigits = normalizeAccountCodeDigits(accountCode)

  if (accountId) {
    const byId = list.find((conto) => normalizeText(conto?.id) === accountId)
    if (byId) return byId
  }

  if (accountDigits) {
    const byCode = list.find((conto) => normalizeAccountCodeDigits(conto?.codice) === accountDigits)
    if (byCode) return byCode
  }

  return null
}

function getConfirmedCounterpartyAccountForRow(row, anagraficheDecisioniByKey, pianoContiList) {
  const parsedDocument = row?.parsedDocument || {}
  const preferredCounterparty = getPreferredCounterparty(parsedDocument)
  const counterparty = preferredCounterparty?.counterparty || getCounterpartyDataForAnagraficaRow(row)
  
  const pianoLookup = buildPianoContiLookup(pianoContiList)
  const classification = classifyCounterparty(counterparty, pianoLookup)
  
  const decisionKey = normalizeAnagraficaDecisionKey(
    row?.decisionKey || getAnagraficaDecisionKeyFromCounterparty(counterparty),
  )

  const decisionMap = anagraficheDecisioniByKey && typeof anagraficheDecisioniByKey === 'object'
    ? anagraficheDecisioniByKey
    : {}
  const decision = decisionKey ? decisionMap[decisionKey] : null

  if (decision) {
    if (normalizeText(decision?.accountMode || '') !== 'existing') return null
    
    const decisionStatus = normalizeText(decision?.decisionStatus || '')
    if (decisionStatus !== 'confirmed' && !decision?.hiddenFromAnagrafiche) {
      if (classification.rank >= 3 && classification.matchedPianoConto) {
        // Fallback below
      } else {
        return null
      }
    }

    if (!normalizeText(decision?.existingAccountId || '') && !normalizeText(decision?.existingAccountCode || '')) {
      if (classification.rank >= 3 && classification.matchedPianoConto) {
        return {
          id: normalizeText(classification.matchedPianoConto.id || ''),
          codice: normalizeText(classification.matchedPianoConto.codice || ''),
          descrizione: normalizeText(classification.matchedPianoConto.descrizione || ''),
          tipo: normalizeText(classification.matchedPianoConto.anagraficaTipo || classification.matchedPianoConto.anagrafica_tipo || ''),
        }
      }
      return null
    }

    const account = getExistingAccountForDecision(row, decision, pianoContiList)
    if (account) {
      return {
        id: normalizeText(account?.id || decision?.existingAccountId || ''),
        codice: normalizeText(account?.codice || decision?.existingAccountCode || ''),
        descrizione: normalizeText(account?.descrizione || ''),
        tipo: normalizeText(account?.anagraficaTipo || account?.anagrafica_tipo || decision?.tipo || ''),
      }
    }
  }

  if (classification.rank >= 3 && classification.matchedPianoConto) {
    const matched = classification.matchedPianoConto
    const hasPiva = Boolean(normalizeAnagraficaIdentifier(matched.partitaIva || matched.anagraficaPiva))
    const hasCf = Boolean(normalizeAnagraficaIdentifier(matched.codiceFiscale || matched.anagraficaCf))
    if (hasPiva || hasCf) {
      return {
        id: normalizeText(matched.id || ''),
        codice: normalizeText(matched.codice || ''),
        descrizione: normalizeText(matched.descrizione || ''),
        tipo: normalizeText(matched.anagraficaTipo || matched.anagrafica_tipo || ''),
      }
    }
  }

  return null
}

function isClearlyLessInformativeDescription(description, counterpartyName, account) {
  const current = normalizeStorageText(description).toLowerCase()
  if (!current) return true

  const genericDescriptions = new Set([
    'conto',
    'cliente',
    'fornitore',
    'professionista',
    'anagrafica',
    'soggetto',
    'da verificare',
    'da aggiornare',
    'n/d',
    'nd',
  ])

  if (genericDescriptions.has(current)) return true

  const accountCode = normalizeStorageText(account?.codice || '').toLowerCase()
  if (accountCode && current === accountCode) return true

  const name = normalizeStorageText(counterpartyName || '').toLowerCase()
  if (!name) return false

  if (current === name) return false
  if (current.length <= 4 && name.length > current.length) return true

  return false
}

function buildMissingAccountUpdates(row, decision, pianoContiList) {
  const counterparty = getCounterpartyDataForAnagraficaRow(row)
  const account = getExistingAccountForDecision(row, decision, pianoContiList)
  const labels = []
  const warnings = []

  if (!account) {
    return {
      hasUpdates: false,
      updates: {},
      labels,
      warnings: ['Conto esistente non trovato'],
      account: null,
    }
  }

  const updates = {}
  const xmlPiva = normalizeText(counterparty.partitaIva || '')
  const xmlCf = normalizeText(counterparty.codiceFiscale || '')
  const xmlName = normalizeText(counterparty.denominazione || '')
  const accountPiva = normalizeText(account?.partitaIva || account?.anagraficaPiva || '')
  const accountCf = normalizeText(account?.codiceFiscale || account?.anagraficaCf || '')
  const accountTipo = normalizeText(account?.anagraficaTipo || account?.anagrafica_tipo || '')
  const accountDesc = normalizeText(account?.descrizione || '')
  const tipo = decision?.tipo === 'cliente' ? 'cliente' : (counterparty.tipo === 'cliente' ? 'cliente' : 'fornitore')
  const mastrino = normalizeText(decision?.mastrino || counterparty.mastrino || '')

  if (xmlPiva) {
    if (!accountPiva) {
      updates.partita_iva = xmlPiva
      updates.anagrafica_piva = xmlPiva
      labels.push('P.IVA mancante')
    } else if (normalizeStorageText(accountPiva) !== normalizeStorageText(xmlPiva)) {
      warnings.push('P.IVA diversa da verificare')
    }
  }

  if (xmlCf) {
    if (!accountCf) {
      updates.codice_fiscale = xmlCf
      updates.anagrafica_cf = xmlCf
      labels.push('CF mancante')
    } else if (normalizeStorageText(accountCf) !== normalizeStorageText(xmlCf)) {
      warnings.push('CF diverso da verificare')
    }
  }

  if (xmlName && isClearlyLessInformativeDescription(accountDesc, xmlName, account)) {
    updates.descrizione = xmlName
    labels.push(accountDesc ? 'Descrizione poco informativa' : 'Descrizione mancante')
  }

  if (tipo === 'cliente') {
    if (account?.isCliente !== true && account?.isFornitore !== true) {
      updates.is_cliente = true
      labels.push('Flag cliente mancante')
    } else if (account?.isCliente !== true && account?.isFornitore === true) {
      warnings.push('Flag soggetto diverso da verificare')
    }
    if (!accountTipo) {
      updates.anagrafica_tipo = 'cliente'
      labels.push('Tipo anagrafica mancante')
    } else if (accountTipo !== 'cliente') {
      warnings.push('Tipo anagrafica diverso da verificare')
    }
  } else {
    if (account?.isFornitore !== true && account?.isCliente !== true) {
      updates.is_fornitore = true
      labels.push('Flag fornitore mancante')
    } else if (account?.isFornitore !== true && account?.isCliente === true) {
      warnings.push('Flag soggetto diverso da verificare')
    }
    if (!accountTipo) {
      updates.anagrafica_tipo = mastrino === '2.03.10' ? 'professionista' : 'fornitore'
      labels.push('Tipo anagrafica mancante')
    } else if (accountTipo !== 'fornitore' && accountTipo !== 'professionista') {
      warnings.push('Tipo anagrafica diverso da verificare')
    }
  }

  if (mastrino === '2.03.10' && account?.isProfessionista !== true) {
    updates.is_professionista = true
    if (!labels.includes('Professionista mancante')) labels.push('Professionista mancante')
    if (!accountTipo) {
      updates.anagrafica_tipo = 'professionista'
    }
  }

  return {
    hasUpdates: Object.keys(updates).length > 0,
    updates,
    labels,
    warnings,
    account,
  }
}

function hasBlockingAccountUpdateConflictWarnings(warnings) {
  const list = Array.isArray(warnings) ? warnings : []
  return list.some((warning) => {
    const text = normalizeText(warning).toLowerCase()
    return text.includes('p.iva diversa') || text.includes('cf diverso') || text.includes('dati esistenti diversi')
  })
}

function matchesViewMode(row, viewMode, readiness = null) {
  const state = String(row?.state || row?.stato || '').toLowerCase()
  const isProcessed = state === 'registered' || state === 'committed' || state === 'processed' || row?.committed

  if (viewMode === VIEW_MODES.registered) {
    return isProcessed
  }

  if (isProcessed) return false

  if (viewMode === VIEW_MODES.ready) {
    return readiness ? readiness.ready : getRowReadiness(row).ready
  }
  return true
}

function matchesQuickFilter(row, quickFilter, selectedReferenceRow, selectedRowIds, readiness = null) {
  if (quickFilter === QUICK_FILTERS.all) return true
  if (quickFilter === QUICK_FILTERS.complete) {
    return readiness ? readiness.ready : getRowReadiness(row).ready
  }
  if (quickFilter === QUICK_FILTERS.incomplete) {
    const currentReadiness = readiness || getRowReadiness(row)
    return !currentReadiness.ready || currentReadiness.severity === 'error'
  }
  if (quickFilter === QUICK_FILTERS.selected) {
    return selectedRowIds.has(getRowKey(row))
  }
  if (quickFilter === QUICK_FILTERS.sameSupplier) {
    if (!selectedReferenceRow) return false
    const refKey = getSupplierKey(selectedReferenceRow)
    if (!refKey) return false
    return getSupplierKey(row) === refKey
  }
  if (quickFilter === QUICK_FILTERS.sameAccount) {
    return true
  }
  return true
}

function isInteractiveRowTarget(target) {
  return Boolean(
    target?.closest?.('button,input,select,textarea,a,[role="button"],[data-stop-row-preview]'),
  )
}

function getNextVisibleRows(rows, {
  searchTerm,
  viewMode,
  quickFilter,
  selectedRowIds,
  manualAccountByRowId = {},
  manualCausaleByRowId = {},
  counterpartyAccountByRowId = {},
  getWorkingTableRowReadiness: customGetReadiness = null,
}) {
  const query = searchTerm.trim().toLowerCase()
  const selectedReferenceRow = Array.from(selectedRowIds)
    .map((id) => rows.find((row) => getRowKey(row) === id))
    .find(Boolean) || null

  const getReadiness = customGetReadiness || getWorkingTableRowReadiness

  return rows.filter((row) => {
    const key = getRowKey(row)
    const readiness = getReadiness(
      row,
      manualAccountByRowId[key],
      manualCausaleByRowId[key],
      counterpartyAccountByRowId[key],
    )
    if (!matchesViewMode(row, viewMode, readiness)) return false
    if (!matchesQuickFilter(row, quickFilter, selectedReferenceRow, selectedRowIds, readiness)) return false
    if (query && !describeRow(row).includes(query)) return false
    return true
  })
}

function normalizeColumnText(value) {
  return normalizeStorageText(value).toLowerCase()
}

function normalizeColumnNumber(value) {
  if (value === null || value === undefined) return null
  let text = String(value).trim()
  if (!text) return null
  text = text.replace(/[^0-9,.-]/g, '')
  const commaIndex = text.lastIndexOf(',')
  const dotIndex = text.lastIndexOf('.')
  if (commaIndex >= 0 && dotIndex >= 0) {
    if (commaIndex > dotIndex) {
      text = text.replace(/\./g, '').replace(',', '.')
    } else {
      text = text.replace(/,/g, '')
    }
  } else if (commaIndex >= 0) {
    text = text.replace(/\./g, '').replace(',', '.')
  }
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeColumnDate(value) {
  const text = normalizeText(value)
  if (!text) return ''
  const isoMatch = text.match(/^(\d{4}-\d{2}-\d{2})/)
  if (isoMatch) return isoMatch[1]
  const slashMatch = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (slashMatch) return `${slashMatch[3]}-${slashMatch[2]}-${slashMatch[1]}`
  const dashMatch = text.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dashMatch) return `${dashMatch[3]}-${dashMatch[2]}-${dashMatch[1]}`
  const compactMatch = text.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (compactMatch) return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`
  return text.slice(0, 10)
}

function getWorkingTableCellValue(row, columnKey, context = {}) {
  const key = getRowKey(row)
  const manualAccount = context?.manualAccountByRowId?.[key] || null
  const manualCausale = context?.manualCausaleByRowId?.[key] || null
  const counterpartyAccount = context?.counterpartyAccountByRowId?.[key] || null
  const fornitoreDisplay = getCounterpartyDisplayInfo(row?.parsedDocument?.fornitore, 'fornitore')
  const clienteDisplay = getCounterpartyDisplayInfo(row?.parsedDocument?.cliente, 'cliente')
  const readiness = context?.getWorkingTableRowReadiness
    ? context.getWorkingTableRowReadiness(row, manualAccount, manualCausale, counterpartyAccount)
    : getWorkingTableRowReadiness(row, manualAccount, manualCausale, counterpartyAccount)

  switch (columnKey) {
    case 'supplier':
      return [
        fornitoreDisplay.title,
        fornitoreDisplay.subtitle,
        clienteDisplay.title,
      ].filter(Boolean).join(' ')
    case 'numeroDocumento':
      return row?.parsedDocument?.numeroDocumento || ''
    case 'dataDocumento':
      return normalizeColumnDate(row?.parsedDocument?.dataDocumento || '')
    case 'imponibile':
      return normalizeColumnNumber(row?.parsedDocument?.imponibile)
    case 'iva':
      return normalizeColumnNumber(row?.parsedDocument?.iva)
    case 'totale':
      return normalizeColumnNumber(row?.parsedDocument?.totale)
    case 'conto':
      return formatManualAccount(manualAccount)
    case 'causale':
      return formatManualCausale(manualCausale)
    case 'stato':
      return [
        readiness?.label || '',
        row?.state || '',
        getAnagraficaStatusLabel(row?.stato) || '',
      ].filter(Boolean).join(' ')
    default:
      return ''
  }
}

function isWorkingTableColumnFilterActive(filter, type) {
  if (!filter || typeof filter !== 'object') return false
  if (type === 'text') return Boolean(normalizeText(filter.query || ''))
  if (type === 'number') {
    const mode = normalizeText(filter.mode || 'gt')
    if (mode === 'between') return Boolean(normalizeText(filter.min || '') || normalizeText(filter.max || ''))
    return Boolean(normalizeText(filter.value || ''))
  }
  if (type === 'date') {
    const mode = normalizeText(filter.mode || 'from')
    if (mode === 'between') return Boolean(normalizeText(filter.from || '') || normalizeText(filter.to || ''))
    return Boolean(normalizeText(filter.value || ''))
  }
  return false
}

function applyWorkingTableColumnFilters(rows, columnFilters, context = {}) {
  const list = Array.isArray(rows) ? rows : []
  const filters = columnFilters && typeof columnFilters === 'object' ? columnFilters : {}
  return list.filter((row) => {
    return Object.entries(WORKING_TABLE_COLUMN_FILTERS).every(([columnKey, meta]) => {
      const filter = filters[columnKey]
      if (!isWorkingTableColumnFilterActive(filter, meta.type)) return true

      if (meta.type === 'text') {
        const query = normalizeColumnText(filter.query || '')
        if (!query) return true
        const cell = normalizeColumnText(getWorkingTableCellValue(row, columnKey, context))
        return cell.includes(query)
      }

      if (meta.type === 'number') {
        const cell = normalizeColumnNumber(getWorkingTableCellValue(row, columnKey, context))
        if (cell === null) return false
        const mode = normalizeText(filter.mode || 'gt')
        const value = normalizeColumnNumber(filter.value)
        const min = normalizeColumnNumber(filter.min)
        const max = normalizeColumnNumber(filter.max)
        if (mode === 'between') {
          const hasMin = min !== null
          const hasMax = max !== null
          if (!hasMin && !hasMax) return true
          if (hasMin && cell < min) return false
          if (hasMax && cell > max) return false
          return true
        }
        if (value === null) return true
        if (mode === 'lt') return cell < value
        if (mode === 'eq') return Math.abs(cell - value) < 0.0001
        return cell > value
      }

      if (meta.type === 'date') {
        const cell = normalizeColumnDate(getWorkingTableCellValue(row, columnKey, context))
        if (!cell) return false
        const mode = normalizeText(filter.mode || 'from')
        const value = normalizeColumnDate(filter.value)
        const from = normalizeColumnDate(filter.from)
        const to = normalizeColumnDate(filter.to)
        if (mode === 'between') {
          const hasFrom = Boolean(from)
          const hasTo = Boolean(to)
          if (!hasFrom && !hasTo) return true
          if (hasFrom && cell < from) return false
          if (hasTo && cell > to) return false
          return true
        }
        if (!value) return true
        if (mode === 'to') return cell <= value
        return cell >= value
      }

      return true
    })
  })
}

function applyWorkingTableColumnSort(rows, columnSort, context = {}) {
  const list = Array.isArray(rows) ? rows : []
  if (!columnSort?.key || !WORKING_TABLE_COLUMN_FILTERS[columnSort.key]) return list.slice()
  const direction = columnSort.direction === 'desc' ? -1 : 1
  const indexMap = new Map()
  list.forEach((row, index) => {
    indexMap.set(getRowKey(row), index)
  })
  const meta = WORKING_TABLE_COLUMN_FILTERS[columnSort.key]
  return list
    .slice()
    .sort((left, right) => {
      const leftValue = getWorkingTableCellValue(left, columnSort.key, context)
      const rightValue = getWorkingTableCellValue(right, columnSort.key, context)

      let comparison = 0
      if (meta.type === 'number') {
        const leftNumber = normalizeColumnNumber(leftValue)
        const rightNumber = normalizeColumnNumber(rightValue)
        if (leftNumber === null && rightNumber === null) comparison = 0
        else if (leftNumber === null) comparison = 1
        else if (rightNumber === null) comparison = -1
        else comparison = leftNumber - rightNumber
      } else if (meta.type === 'date') {
        const leftDate = normalizeColumnDate(leftValue)
        const rightDate = normalizeColumnDate(rightValue)
        comparison = leftDate.localeCompare(rightDate)
      } else {
        const leftText = normalizeColumnText(leftValue)
        const rightText = normalizeColumnText(rightValue)
        comparison = leftText.localeCompare(rightText)
      }

      if (comparison !== 0) return comparison * direction
      return (indexMap.get(getRowKey(left)) || 0) - (indexMap.get(getRowKey(right)) || 0)
    })
}

function rebuildReportFromRows(prevReport, rows) {
  const files = rows.length
  const imported = rows.filter((row) => row.state === 'imported').length
  const warnings = rows.filter((row) => row.state === 'review_pending').length
  const errors = rows.filter((row) => row.state === 'error').length
  const items = Array.isArray(prevReport?.items) ? prevReport.items.slice() : []

  return {
    ...(prevReport || {}),
    totals: {
      ...(prevReport?.totals || {}),
      files,
      imported,
      blocked: Number(prevReport?.totals?.blocked || 0) || 0,
      warnings,
      errors,
    },
    items,
  }
}

export function ModuloImportContabilita({ onNavigate } = {}) {
  const fileInputRef = useRef(null)
  const headerCheckboxRef = useRef(null)
  const accountSearchInputRef = useRef(null)
  const causaleSearchInputRef = useRef(null)
  const registrationDateInputRef = useRef(null)

  const [busy, setBusy] = useState(false)
  const [busyLabel, setBusyLabel] = useState('Analisi in corso...')
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [lastFileCount, setLastFileCount] = useState(0)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [selectedRowIds, setSelectedRowIds] = useState(() => new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [viewMode, setViewMode] = useState(VIEW_MODES.all)
  const [quickFilter, setQuickFilter] = useState(QUICK_FILTERS.all)
  const [selectedSocietaId, setSelectedSocietaId] = useState('')
  const [selectedSocietaName, setSelectedSocietaName] = useState('')
  const [societaOptions, setSocietaOptions] = useState([])
  const [societaLoading, setSocietaLoading] = useState(true)
  const [pianoConti, setPianoConti] = useState([])
  const [pianoContiLoading, setPianoContiLoading] = useState(false)
  const [pianoContiError, setPianoContiError] = useState('')
  const [percipienti, setPercipienti] = useState(null)
  const [percipientiLoading, setPercipientiLoading] = useState(false)
  const [percipientiError, setPercipientiError] = useState('')
  const [percipientiDecisioniByKey, setPercipientiDecisioniByKey] = useState({})
  const [accountEditorRowId, setAccountEditorRowId] = useState('')
  const [accountSearchTerm, setAccountSearchTerm] = useState('')
  const [manualAccountByRowId, setManualAccountByRowId] = useState({})
  const [manualRegistrationDateByRowId, setManualRegistrationDateByRowId] = useState({})
  const [automationMetaByRowId, setAutomationMetaByRowId] = useState({})
  const [causaliContabili, setCausaliContabili] = useState([])
  const [causaliContabiliLoading, setCausaliContabiliLoading] = useState(false)
  const [causaliContabiliError, setCausaliContabiliError] = useState('')
  const [causaliIva, setCausaliIva] = useState([])
  const [causaleEditorRowId, setCausaleEditorRowId] = useState('')
  const [causaleSearchTerm, setCausaleSearchTerm] = useState('')
  const [manualCausaleByRowId, setManualCausaleByRowId] = useState({})

  const [bulkContoPickerOpen, setBulkContoPickerOpen] = useState(false)
  const [bulkCausalePickerOpen, setBulkCausalePickerOpen] = useState(false)
  const [bulkSearchTerm, setBulkSearchTerm] = useState('')

  const [previewRowId, setPreviewRowId] = useState('')
  const [previewTab, setPreviewTab] = useState('fattura')
  const [workingViewOpen, setWorkingViewOpen] = useState(false)
  const [workingViewRowId, setWorkingViewRowId] = useState('')
  const [workingViewRowIds, setWorkingViewRowIds] = useState([])
  const [workingViewTab, setWorkingViewTab] = useState('prima_nota')
  const [showImportReportDetails, setShowImportReportDetails] = useState(false)
  const [showAnagraficheDetails, setShowAnagraficheDetails] = useState(false)
  const [anagraficheVisibleCount, setAnagraficheVisibleCount] = useState(25)
  const [anagraficheTipoFiltro, setAnagraficheTipoFiltro] = useState('tutti')
  const [anagraficheDecisioniByKey, setAnagraficheDecisioniByKey] = useState({})
  const [anagraficaAccountUpdateBusyKey, setAnagraficaAccountUpdateBusyKey] = useState('')
  const [percipienteActionBusyKey, setPercipienteActionBusyKey] = useState('')
  const [actionBanner, setActionBanner] = useState(null)
  const [reimportSelectedRowIds, setReimportSelectedRowIds] = useState(() => new Set())
  const [columnFilters, setColumnFilters] = useState({})
  const [columnSort, setColumnSort] = useState(null)
  const [openColumnFilter, setOpenColumnFilter] = useState('')
  const [registrationDateDraft, setRegistrationDateDraft] = useState(() => getLocalIsoDate())
  const [showGoToMenu, setShowGoToMenu] = useState(false)
  const [demoCommitBusy, setDemoCommitBusy] = useState(false)
  const [demoCommitReport, setDemoCommitReport] = useState(null)
  const [showToolsMenu, setShowToolsMenu] = useState(false)
  const columnFilterMenuRef = useRef(null)

  const filesLabel = useMemo(() => {
    if (!selectedFiles.length) return 'Nessun file selezionato'
    if (selectedFiles.length === 1) return selectedFiles[0]?.name || '1 file selezionato'
    return `${selectedFiles.length} file selezionati`
  }, [selectedFiles])

  const stagingRows = result?.stagingRows || []
  const report = result?.report || null
  const selectedReimportCount = reimportSelectedRowIds.size

  const counterpartyAccountByRowId = useMemo(() => {
    const rows = Array.isArray(stagingRows) ? stagingRows : []
    if (!selectedSocietaId || !rows.length) return {}

    const next = {}
    rows.forEach((row) => {
      const rowKey = getRowKey(row)
      if (!rowKey) return
      const confirmed = getConfirmedCounterpartyAccountForRow(row, anagraficheDecisioniByKey, pianoConti)
      if (!confirmed?.id || !confirmed?.codice) return
      next[rowKey] = confirmed
    })
    return next
  }, [stagingRows, anagraficheDecisioniByKey, pianoConti, selectedSocietaId])

  const getWorkingTableRowReadiness = (row, manualAccount = null, manualCausale = null, counterpartyAccount = null) => {
    return resolveImportDocumentReadiness(
      row,
      manualAccount,
      manualCausale,
      counterpartyAccount,
      anagraficheDecisioniByKey,
      pianoConti
    )
  }

  const workingTableReadinessByRowId = useMemo(() => {
    const rows = Array.isArray(stagingRows) ? stagingRows : []
    const next = {}
    rows.forEach((row) => {
      const key = getRowKey(row)
      if (!key) return
      next[key] = getWorkingTableRowReadiness(
        row,
        manualAccountByRowId[key] || null,
        manualCausaleByRowId[key] || null,
        counterpartyAccountByRowId[key] || null,
      )
    })
    return next
  }, [stagingRows, manualAccountByRowId, manualCausaleByRowId, counterpartyAccountByRowId, anagraficheDecisioniByKey, pianoConti])

  const workingTableReadyCount = useMemo(() => (
    Object.values(workingTableReadinessByRowId).filter((readiness) => readiness?.ready).length
  ), [workingTableReadinessByRowId])

  const workingTableIncompleteCount = useMemo(() => (
    Object.values(workingTableReadinessByRowId).filter((readiness) => !readiness?.ready).length
  ), [workingTableReadinessByRowId])

  const baseVisibleRows = useMemo(
    () => getNextVisibleRows(stagingRows, {
      searchTerm,
      viewMode,
      quickFilter,
      selectedRowIds,
      manualAccountByRowId,
      manualCausaleByRowId,
      counterpartyAccountByRowId,
      getWorkingTableRowReadiness,
    }),
    [searchTerm, stagingRows, viewMode, quickFilter, selectedRowIds, manualAccountByRowId, manualCausaleByRowId, counterpartyAccountByRowId, getWorkingTableRowReadiness],
  )

  const visibleRows = useMemo(() => {
    const filtered = applyWorkingTableColumnFilters(baseVisibleRows, columnFilters, {
      manualAccountByRowId,
      manualCausaleByRowId,
      counterpartyAccountByRowId,
      getWorkingTableRowReadiness,
    })
    return applyWorkingTableColumnSort(filtered, columnSort, {
      manualAccountByRowId,
      manualCausaleByRowId,
      counterpartyAccountByRowId,
      getWorkingTableRowReadiness,
    })
  }, [baseVisibleRows, columnFilters, columnSort, manualAccountByRowId, manualCausaleByRowId, counterpartyAccountByRowId, getWorkingTableRowReadiness])

  const previewRow = useMemo(
    () => stagingRows.find((row) => getRowKey(row) === previewRowId) || null,
    [stagingRows, previewRowId],
  )
  const isPreviewPanelOpen = Boolean(previewRowId)
  const workingViewLaunchRows = useMemo(() => {
    const rows = Array.isArray(stagingRows) ? stagingRows : []
    return rows.filter((row) => {
      const key = getRowKey(row)
      return Boolean(key)
    })
  }, [stagingRows])
  const activeWorkingViewModel = useMemo(() => {
    if (!workingViewOpen || !workingViewRowId) return null
    const row = stagingRows.find((candidate) => getRowKey(candidate) === workingViewRowId) || null
    if (!row) return null

    const rowKey = getRowKey(row)
    const parsedDocument = row?.parsedDocument || {}
    const preferredCounterparty = getPreferredCounterparty(parsedDocument)
    const counterparty = preferredCounterparty?.counterparty || {}
    const counterpartyDisplay = getCounterpartyDisplayInfo(counterparty, preferredCounterparty?.role || 'fornitore')
    const counterpartyAccount = counterpartyAccountByRowId[rowKey] || null
    const costRevenueAccount = manualAccountByRowId[rowKey] || null
    const causale = manualCausaleByRowId[rowKey] || null
    const readiness = workingTableReadinessByRowId[rowKey] || getWorkingTableRowReadiness(
      row,
      costRevenueAccount,
      causale,
      counterpartyAccount,
    )

    return {
      row,
      rowKey,
      parsedDocument,
      registrationDate: normalizeText(manualRegistrationDateByRowId[rowKey] || parsedDocument?.dataDocumento || ''),
      fornitoreCliente: counterpartyDisplay?.title || normalizeText(counterparty?.denominazione || '') || '-',
      counterpartyRole: preferredCounterparty?.role || 'fornitore',
      counterparty,
      counterpartyDisplay,
      counterpartyAccount,
      costRevenueAccount,
      causale,
      numeroDocumento: normalizeText(parsedDocument?.numeroDocumento || '-') || '-',
      dataDocumento: normalizeText(parsedDocument?.dataDocumento || '-') || '-',
      imponibile: Number(parsedDocument?.imponibile ?? 0) || 0,
      iva: Number(parsedDocument?.iva ?? 0) || 0,
      totale: Number(parsedDocument?.totale ?? 0) || 0,
      readiness,
      automationMeta: automationMetaByRowId[rowKey] || null,
    }
  }, [
    stagingRows,
    workingViewOpen,
    workingViewRowId,
    counterpartyAccountByRowId,
    manualAccountByRowId,
    manualCausaleByRowId,
    manualRegistrationDateByRowId,
    workingTableReadinessByRowId,
    automationMetaByRowId,
  ])
  const activeWorkingViewChecks = useMemo(
    () => buildImportContabilitaWorkingViewChecks(activeWorkingViewModel),
    [activeWorkingViewModel],
  )
  const selectedSocietaForDemo = useMemo(
    () => resolveSocietaFromImportOptions(societaOptions, selectedSocietaId, selectedSocietaName),
    [societaOptions, selectedSocietaId, selectedSocietaName],
  )
  const isSelectedDemoSocieta = useMemo(
    () => isDemoCompany(selectedSocietaForDemo),
    [selectedSocietaForDemo],
  )
  const workingViewCausaliIva = useMemo(() => {
    if (!isSelectedDemoSocieta) return causaliIva
    return filterCausaliIvaForDemoWorkingView(causaliIva, selectedSocietaId)
  }, [causaliIva, isSelectedDemoSocieta, selectedSocietaId])
  const workingViewRowIndex = useMemo(() => {
    if (!workingViewRowId) return -1
    return (Array.isArray(workingViewRowIds) ? workingViewRowIds : []).indexOf(workingViewRowId)
  }, [workingViewRowIds, workingViewRowId])
  const workingViewCurrentIndex = workingViewRowIndex
  const workingViewTotal = Array.isArray(workingViewRowIds) ? workingViewRowIds.length : 0
  const hasPreviousWorkingViewRow = workingViewCurrentIndex > 0
  const hasNextWorkingViewRow = workingViewTotal > 0 && workingViewCurrentIndex >= 0 && workingViewCurrentIndex < workingViewTotal - 1

  const hasActiveWorkingTableColumnFilters = useMemo(() => {
    return Object.entries(WORKING_TABLE_COLUMN_FILTERS).some(([columnKey, meta]) => isWorkingTableColumnFilterActive(columnFilters[columnKey], meta.type))
      || Boolean(columnSort?.key)
  }, [columnFilters, columnSort])

  const activeWorkingTableColumnFilters = useMemo(() => {
    const items = []
    Object.entries(WORKING_TABLE_COLUMN_FILTERS).forEach(([columnKey, meta]) => {
      const filter = columnFilters[columnKey]
      if (!isWorkingTableColumnFilterActive(filter, meta.type)) return
      if (meta.type === 'text') {
        items.push({ key: columnKey, label: `${meta.label}: ${normalizeText(filter.query || '')}` })
      } else if (meta.type === 'number') {
        const mode = normalizeText(filter.mode || 'gt')
        const label = mode === 'between'
          ? `${meta.label}: ${normalizeText(filter.min || '...')} - ${normalizeText(filter.max || '...')}`
          : mode === 'lt'
            ? `${meta.label}: < ${normalizeText(filter.value || '')}`
            : mode === 'eq'
              ? `${meta.label}: = ${normalizeText(filter.value || '')}`
              : `${meta.label}: > ${normalizeText(filter.value || '')}`
        items.push({ key: columnKey, label })
      } else if (meta.type === 'date') {
        const mode = normalizeText(filter.mode || 'from')
        const label = mode === 'between'
          ? `${meta.label}: ${normalizeText(filter.from || '...')} - ${normalizeText(filter.to || '...')}`
          : mode === 'to'
            ? `${meta.label}: fino a ${normalizeText(filter.value || '')}`
            : `${meta.label}: da ${normalizeText(filter.value || '')}`
        items.push({ key: columnKey, label })
      }
    })

    if (columnSort?.key && WORKING_TABLE_COLUMN_FILTERS[columnSort.key]) {
      const meta = WORKING_TABLE_COLUMN_FILTERS[columnSort.key]
      const directionLabel = columnSort.direction === 'desc' ? 'Z-A' : 'A-Z'
      if (meta.type === 'number') {
        items.push({ key: `sort:${columnSort.key}`, label: `${meta.label}: ${columnSort.direction === 'desc' ? 'decrescente' : 'crescente'}` })
      } else if (meta.type === 'date') {
        items.push({ key: `sort:${columnSort.key}`, label: `${meta.label}: ${columnSort.direction === 'desc' ? 'decrescente' : 'crescente'}` })
      } else {
        items.push({ key: `sort:${columnSort.key}`, label: `${meta.label}: ${directionLabel}` })
      }
    }

    return items
  }, [columnFilters, columnSort])

  useEffect(() => {
    if (!openColumnFilter) return undefined
    const handlePointerDown = (event) => {
      const target = event?.target
      if (columnFilterMenuRef.current && columnFilterMenuRef.current.contains(target)) return
      if (target?.closest?.('[data-working-table-column-trigger="true"]')) return
      setOpenColumnFilter('')
    }
    const handleKeyDown = (event) => {
      if (event?.key === 'Escape') setOpenColumnFilter('')
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [openColumnFilter])

  const updateWorkingTableColumnFilter = (columnKey, patch) => {
    setColumnFilters((current) => {
      const next = { ...(current || {}) }
      const previous = next[columnKey] || {}
      const merged = { ...previous, ...patch }
      const meta = WORKING_TABLE_COLUMN_FILTERS[columnKey]
      if (!meta || !isWorkingTableColumnFilterActive(merged, meta.type)) {
        delete next[columnKey]
        return next
      }
      next[columnKey] = merged
      return next
    })
  }

  const clearWorkingTableColumnFilter = (columnKey) => {
    setColumnFilters((current) => {
      const next = { ...(current || {}) }
      delete next[columnKey]
      return next
    })
  }

  const clearAllWorkingTableColumnFilters = () => {
    setColumnFilters({})
    setColumnSort(null)
    setOpenColumnFilter('')
  }

  const setWorkingTableColumnSort = (columnKey, direction) => {
    setColumnSort({ key: columnKey, direction: direction === 'desc' ? 'desc' : 'asc' })
    setOpenColumnFilter('')
  }

  const filteredPianoConti = useMemo(() => {
    const rows = Array.isArray(pianoConti) ? pianoConti : []
    const filtered = rows.filter((row) => matchesPianoContoSearch(row, accountSearchTerm))
    return filtered.slice(0, 20)
  }, [pianoConti, accountSearchTerm])

  const filteredCausaliContabili = useMemo(() => {
    const rows = Array.isArray(causaliContabili) ? causaliContabili : []
    const filtered = rows.filter((row) => matchesCausaleSearch(row, causaleSearchTerm))
    return filtered.slice(0, 20)
  }, [causaliContabili, causaleSearchTerm])

  const bulkFilteredPianoConti = useMemo(() => {
    const rows = Array.isArray(pianoConti) ? pianoConti : []
    const filtered = rows.filter((row) => matchesPianoContoSearch(row, bulkSearchTerm))
    return filtered.slice(0, 20)
  }, [pianoConti, bulkSearchTerm])

  const bulkFilteredCausaliContabili = useMemo(() => {
    const rows = Array.isArray(causaliContabili) ? causaliContabili : []
    const filtered = rows.filter((row) => matchesCausaleSearch(row, bulkSearchTerm))
    return filtered.slice(0, 20)
  }, [causaliContabili, bulkSearchTerm])


  const anagraficaAllowedAccountsIndex = useMemo(
    () => buildAnagraficaAllowedAccountsIndex(pianoConti),
    [pianoConti],
  )

  const anagraficheBase = useMemo(() => {
    if (!selectedSocietaId) return []
    if (!stagingRows.length) return []
    return buildAnagraficheDaVerificare(stagingRows, pianoConti)
  }, [selectedSocietaId, stagingRows, pianoConti])

  const anagraficheDaVerificareView = useMemo(() => {
    const rows = Array.isArray(anagraficheBase) ? anagraficheBase : []
    return rows.map((row) => {
      const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
      const storedDecision = key ? anagraficheDecisioniByKey[key] || null : null
      const decision = mergeAnagraficaDecision(row, storedDecision, pianoConti)
      const validation = validateAnagraficaDecision(row, decision, pianoConti)
      return {
        ...row,
        decisionKey: key || row?.decisionKey || row?.id || '',
        decision,
        validation,
      }
    })
  }, [anagraficheBase, anagraficheDecisioniByKey, pianoConti])

  const anagraficheOperationalRows = useMemo(
    () => (Array.isArray(anagraficheDaVerificareView)
      ? anagraficheDaVerificareView.filter((row) => {
        const decision = row?.decision || null
        const percipienteState = buildPercipienteStatusForAnagraficaRow(row, decision, percipienti)
        return !row?.decision?.hiddenFromAnagrafiche && percipienteState.status === 'not_relevant'
      })
      : []),
    [anagraficheDaVerificareView, percipienti],
  )

  const anagrafichePercipienteStats = useMemo(() => {
    const rows = Array.isArray(anagraficheDaVerificareView)
      ? anagraficheDaVerificareView.filter((row) => {
        const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id || '')
        return !percipientiDecisioniByKey?.[key]?.hiddenFromAnagrafiche
      })
      : []
    const next = {
      existing: 0,
      candidate: 0,
      missingCf: 0,
    }

    rows.forEach((row) => {
      const decision = row?.decision || null
      const status = buildPercipienteStatusForAnagraficaRow(row, decision, percipienti)
      if (status.status === 'existing') next.existing += 1
      else if (status.status === 'candidate') next.candidate += 1
      else if (status.status === 'missing_cf') next.missingCf += 1
    })

    return next
  }, [anagraficheDaVerificareView, percipienti, percipientiDecisioniByKey])

  const anagraficheUiRows = useMemo(() => {
    const rows = Array.isArray(anagraficheDaVerificareView) ? anagraficheDaVerificareView : []
    const next = []

    rows.forEach((row, index) => {
      const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id || index)
      const decision = row?.decision || {}
      const validation = row?.validation || validateAnagraficaDecision(row, decision, pianoConti)
      const percipienteState = buildPercipienteStatusForAnagraficaRow(row, decision, percipienti)
      const relevantPercipiente = percipienteState.status !== 'not_relevant'
      const hidden = Boolean(decision?.hiddenFromAnagrafiche)
      const hiddenPercipiente = Boolean(percipientiDecisioniByKey?.[key]?.hiddenFromAnagrafiche)
      if (hiddenPercipiente) return
      const originalTipo = decision?.tipo === 'cliente' ? 'cliente' : 'fornitore'
      const displayTipo = hidden && relevantPercipiente
        ? 'percipiente'
        : anagraficheTipoFiltro === 'percipiente' && relevantPercipiente
          ? 'percipiente'
          : originalTipo
      const rowType = displayTipo
      const matchesTipoFilter = (() => {
        if (anagraficheTipoFiltro === 'tutti') return !hidden || relevantPercipiente
        if (anagraficheTipoFiltro === 'percipiente') return relevantPercipiente
        return displayTipo === anagraficheTipoFiltro
      })()

      if (!matchesTipoFilter) return

      const percipientePriority = percipienteState.status === 'missing_cf'
        ? 0
        : percipienteState.status === 'candidate'
          ? 1
          : percipienteState.status === 'existing'
            ? 2
            : percipienteState.status === 'unknown'
              ? 3
              : 99
      const categoryPriority = displayTipo === 'percipiente'
        ? 0
        : validation.status === 'incomplete'
          ? 10
          : validation.status === 'invalid'
            ? 11
            : validation.status === 'ready'
              ? 20
              : validation.status === 'linked'
                ? 21
                : validation.status === 'ignored'
                  ? 30
                  : 40

      next.push({
        ...row,
        decisionKey: key,
        rowType,
        rowTypeLabel: rowType === 'percipiente'
          ? 'Percipiente'
          : rowType === 'cliente'
            ? 'Cliente'
            : 'Fornitore',
        rowKey: `${rowType}:${key}`,
        percipienteState,
        percipientePriority,
        categoryPriority,
        sourceHidden: hidden,
      })
    })

    return next.sort((left, right) => {
      if ((left?.rowType === 'percipiente') !== (right?.rowType === 'percipiente')) {
        return left?.rowType === 'percipiente' ? -1 : 1
      }
      if ((left?.percipientePriority || 99) !== (right?.percipientePriority || 99)) {
        return (left?.percipientePriority || 99) - (right?.percipientePriority || 99)
      }
      if ((left?.categoryPriority || 99) !== (right?.categoryPriority || 99)) {
        return (left?.categoryPriority || 99) - (right?.categoryPriority || 99)
      }
      const leftName = normalizeText(left?.denominazione || '')
      const rightName = normalizeText(right?.denominazione || '')
      if (leftName !== rightName) return leftName.localeCompare(rightName)
      return normalizeText(left?.partitaIva || '').localeCompare(normalizeText(right?.partitaIva || ''))
    })
  }, [anagraficheDaVerificareView, anagraficheTipoFiltro, pianoConti, percipienti, percipientiDecisioniByKey])

  const anagraficheVisibleBase = useMemo(
    () => anagraficheUiRows.slice(0, anagraficheVisibleCount),
    [anagraficheUiRows, anagraficheVisibleCount],
  )

  const anagraficheVisibleRows = useMemo(() => anagraficheVisibleBase, [anagraficheVisibleBase])

  useEffect(() => {
    setAnagraficheVisibleCount(25)
  }, [selectedSocietaId])

  useEffect(() => {
    setAnagraficheVisibleCount(25)
  }, [anagraficheTipoFiltro])

  const onStagingRowClick = (row, event) => {
    if (!isPreviewPanelOpen) return
    if (isInteractiveRowTarget(event?.target)) return
    const key = getRowKey(row)
    if (!key) return
    setPreviewRowId(key)
  }

  const anagraficheStats = useMemo(() => {
    const rows = Array.isArray(anagraficheOperationalRows) ? anagraficheOperationalRows : []
    const next = {
      total: rows.length,
      ready: 0,
      linked: 0,
      choose: 0,
      incomplete: 0,
      newCount: 0,
      ignored: 0,
      invalid: 0,
    }

    for (const row of rows) {
      const validation = row?.validation || validateAnagraficaDecision(row, row?.decision, pianoConti)
      if (validation.status === 'ready') next.ready += 1
      else if (validation.status === 'linked') next.linked += 1
      else if (validation.status === 'ignored') next.ignored += 1
      else if (validation.status === 'invalid') next.invalid += 1
      else if (row?.decision?.accountMode === 'choose') next.choose += 1
      else if (row?.decision?.accountMode === 'new') next.newCount += 1
      else next.incomplete += 1
    }

    return next
  }, [anagraficheOperationalRows, pianoConti])

  const creatableAnagraficheRows = useMemo(() => {
    const rows = Array.isArray(anagraficheOperationalRows) ? anagraficheOperationalRows : []
    const seen = new Set()

    return rows.filter((row) => {
      const decision = row?.decision || null
      const validation = row?.validation || validateAnagraficaDecision(row, decision, pianoConti)
      if (validation.status !== 'ready') return false
      if (normalizeText(decision?.accountMode || '') !== 'new') return false
      if (!isAllowedMastrinoForTipo(decision?.tipo, decision?.mastrino)) return false

      const key = getImportContabilitaCounterpartyKey(row)
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [anagraficheOperationalRows, pianoConti])

  const ignoredOperationalRows = useMemo(() => {
    const rows = Array.isArray(anagraficheOperationalRows) ? anagraficheOperationalRows : []
    return rows.filter((row) => {
      const decision = row?.decision || null
      const validation = row?.validation || validateAnagraficaDecision(row, decision, pianoConti)
      const accountMode = normalizeText(decision?.accountMode || '')
      return validation.status === 'ignored' || accountMode === 'none' || normalizeText(decision?.decisionStatus || '') === 'ignored'
    })
  }, [anagraficheOperationalRows, pianoConti])

  const updatableExistingAnagraficheRows = useMemo(() => {
    const rows = Array.isArray(anagraficheOperationalRows) ? anagraficheOperationalRows : []
    return rows.filter((row) => {
      const decision = row?.decision || null
      const validation = row?.validation || validateAnagraficaDecision(row, decision, pianoConti)
      if (validation.status !== 'linked') return false
      if (normalizeText(decision?.accountMode || '') !== 'existing') return false
      const accountUpdates = buildMissingAccountUpdates(row, validation.normalized || decision, pianoConti)
      if (!accountUpdates?.hasUpdates) return false
      if (!accountUpdates?.account) return false
      if (hasBlockingAccountUpdateConflictWarnings(accountUpdates.warnings)) return false
      return true
    })
  }, [anagraficheOperationalRows, pianoConti])

  const selectedCount = selectedRowIds.size
  const visibleSelectedCount = useMemo(
    () => visibleRows.filter((row) => selectedRowIds.has(getRowKey(row))).length,
    [selectedRowIds, visibleRows],
  )
  const allVisibleSelected = visibleRows.length > 0 && visibleSelectedCount === visibleRows.length
  const someVisibleSelected = visibleSelectedCount > 0 && !allVisibleSelected

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someVisibleSelected
    }
  }, [someVisibleSelected])

  const applySocietaSnapshot = (snapshot) => {
    if (hasUsableResultSnapshot(snapshot)) {
      setResult(snapshot.result)
      setManualAccountByRowId(snapshot.manualAccountByRowId || {})
      setManualCausaleByRowId(snapshot.manualCausaleByRowId || {})
      setManualRegistrationDateByRowId(snapshot.manualRegistrationDateByRowId || {})
      setAnagraficheDecisioniByKey(snapshot.anagraficheDecisioniByKey || {})
      setPercipientiDecisioniByKey(snapshot.percipientiDecisioniByKey || {})
      setAutomationMetaByRowId(snapshot.automationMetaByRowId || {})
      return true
    }

    setResult(null)
    setManualAccountByRowId({})
    setManualCausaleByRowId({})
    setManualRegistrationDateByRowId({})
    setAnagraficheDecisioniByKey({})
    setPercipientiDecisioniByKey({})
    setAutomationMetaByRowId({})
    return false
  }

  useEffect(() => {
    if (!accountEditorRowId) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAccountEditorRowId('')
        setAccountSearchTerm('')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [accountEditorRowId])

  useEffect(() => {
    if (!accountEditorRowId) return
    accountSearchInputRef.current?.focus?.()
    accountSearchInputRef.current?.select?.()
  }, [accountEditorRowId, selectedSocietaId])

  useEffect(() => {
    if (!causaleEditorRowId) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setCausaleEditorRowId('')
        setCausaleSearchTerm('')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [causaleEditorRowId])

  useEffect(() => {
    if (!causaleEditorRowId) return
    causaleSearchInputRef.current?.focus?.()
    causaleSearchInputRef.current?.select?.()
  }, [causaleEditorRowId, selectedSocietaId])

  useEffect(() => {
    if (!previewRowId) return undefined

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        setPreviewRowId('')
        setPreviewTab('fattura')
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [previewRowId])

  useEffect(() => {
    if (!previewRowId) setPreviewTab('fattura')
  }, [previewRowId])

  useEffect(() => {
    if (!workingViewOpen || !workingViewRowId) return undefined
    const rowExists = stagingRows.some((row) => getRowKey(row) === workingViewRowId)
    if (!rowExists) {
      const fallbackIds = (Array.isArray(workingViewRowIds) ? workingViewRowIds : []).filter((id) => stagingRows.some((row) => getRowKey(row) === id))
      if (fallbackIds.length) {
        setWorkingViewRowIds(fallbackIds)
        setWorkingViewRowId(fallbackIds[0])
        setWorkingViewTab('prima_nota')
      } else {
        setWorkingViewOpen(false)
        setWorkingViewRowId('')
        setWorkingViewRowIds([])
        setWorkingViewTab('prima_nota')
      }
    }
    return undefined
  }, [workingViewOpen, workingViewRowId, workingViewRowIds, stagingRows])

  useEffect(() => {
    if (!actionBanner) return undefined
    const timer = window.setTimeout(() => setActionBanner(null), 3200)
    return () => window.clearTimeout(timer)
  }, [actionBanner])

  useEffect(() => {
    let alive = true

    const bootstrapSocieta = async () => {
      setSocietaLoading(true)
      try {
        const rows = await loadSocietaAttive()
        if (!alive) return

        setSocietaOptions(rows)

        const storedId = typeof window !== 'undefined' ? window.localStorage.getItem(LAST_SOCIETA_STORAGE_KEY) || '' : ''
        const storedSocieta = rows.find((row) => row.id === storedId) || null
        const firstSocieta = rows[0] || null
        const nextSocieta = storedSocieta || firstSocieta

        if (nextSocieta) {
          applySocietaSnapshot(readSocietaSnapshot(nextSocieta.id))
          setSelectedSocietaId(nextSocieta.id)
          setSelectedSocietaName(nextSocieta.denominazione)
        } else {
          applySocietaSnapshot(null)
          setSelectedSocietaId('')
          setSelectedSocietaName('')
          setErrorMsg('Nessuna societa attiva disponibile.')
        }
      } catch (error) {
        if (!alive) return
        setSocietaOptions([])
        setSelectedSocietaId('')
        setSelectedSocietaName('')
        applySocietaSnapshot(null)
        setErrorMsg(error?.message || 'Impossibile caricare le societa.')
      } finally {
        if (alive) setSocietaLoading(false)
      }
    }

    void bootstrapSocieta()

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    let alive = true

    const bootstrapForSocieta = async () => {
      setSelectedFiles([])
      setLastFileCount(0)
      setSelectedRowIds(new Set())
      setReimportSelectedRowIds(new Set())
      setSearchTerm('')
      setErrorMsg('')
      setAccountEditorRowId('')
      setAccountSearchTerm('')
      setCausaleEditorRowId('')
      setCausaleSearchTerm('')
      setPianoConti([])
      setPianoContiError('')
      setCausaliContabili([])
      setCausaliContabiliError('')
      setCausaliIva([])

      if (!selectedSocietaId) {
        if (societaLoading) return
        setPianoContiLoading(false)
        setCausaliContabiliLoading(false)
        applySocietaSnapshot(null)
        return
      }

      const snapshot = readSocietaSnapshot(selectedSocietaId)
      applySocietaSnapshot(snapshot)
      setPianoContiLoading(true)
      setCausaliContabiliLoading(true)
      setPianoContiError('')
      setCausaliContabiliError('')

      try {
        const [rows, causaliRows, causaliIvaRows] = await Promise.all([
          loadPianoContiBySocieta(selectedSocietaId),
          loadCausaliContabiliBySocieta(selectedSocietaId),
          loadCausaliIvaBySocieta(selectedSocietaId),
        ])
        if (!alive) return
        setPianoConti(rows)
        setCausaliContabili(causaliRows)
        setCausaliIva(causaliIvaRows)
      } catch (error) {
        if (!alive) return
        setPianoConti([])
        setCausaliContabili([])
        setCausaliIva([])
        setPianoContiError(error?.message || 'Impossibile caricare il piano conti.')
        setCausaliContabiliError(error?.message || 'Impossibile caricare le causali contabili.')
      } finally {
        if (alive) setPianoContiLoading(false)
        if (alive) setCausaliContabiliLoading(false)
      }
    }

    void bootstrapForSocieta()

    return () => {
      alive = false
    }
  }, [selectedSocietaId, societaLoading])

  useEffect(() => {
    let alive = true

    const bootstrapPercipienti = async () => {
      if (!selectedSocietaId) {
        if (societaLoading) return
        setPercipienti(null)
        setPercipientiLoading(false)
        setPercipientiError('')
        return
      }

      setPercipienti(null)
      setPercipientiLoading(true)
      setPercipientiError('')

      try {
        const rows = await loadPercipientiBySocieta(selectedSocietaId)
        if (!alive) return
        setPercipienti(Array.isArray(rows) ? rows : [])
      } catch (error) {
        if (!alive) return
        setPercipienti(null)
        setPercipientiError(error?.message || 'Impossibile caricare i percipienti.')
      } finally {
        if (alive) setPercipientiLoading(false)
      }
    }

    void bootstrapPercipienti()

    return () => {
      alive = false
    }
  }, [selectedSocietaId, societaLoading])

  useEffect(() => {
    if (!selectedSocietaId) {
      setSelectedSocietaName('')
      return
    }

    const selected = societaOptions.find((row) => row.id === selectedSocietaId) || null
    if (selected) {
      setSelectedSocietaName(selected.denominazione)
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(LAST_SOCIETA_STORAGE_KEY, selectedSocietaId)
      }
      return
    }

    setSelectedSocietaName('')
  }, [selectedSocietaId, societaOptions])

  const updateSelectedRows = (nextIds) => {
    setSelectedRowIds(new Set(nextIds))
  }

  const persistSocietaState = (
    nextResult = result,
    nextManualAccountMap = manualAccountByRowId,
    nextManualCausaleMap = manualCausaleByRowId,
    nextManualRegistrationDateMap = manualRegistrationDateByRowId,
    nextAnagraficheDecisioniMap = anagraficheDecisioniByKey,
    nextPercipientiDecisioniMap = percipientiDecisioniByKey,
    nextAutomationMetaMap = automationMetaByRowId,
  ) => {
    if (!selectedSocietaId) return
    const saved = writeSocietaSnapshot(
      selectedSocietaId,
      nextResult,
      nextManualAccountMap,
      nextManualCausaleMap,
      nextManualRegistrationDateMap,
      nextAnagraficheDecisioniMap,
      nextPercipientiDecisioniMap,
      nextAutomationMetaMap,
    )
    if (!saved) {
      showActionBanner(
        'warning',
        'Snapshot locale non salvato integralmente: la working table resta disponibile finché la pagina rimane aperta.',
      )
    }
  }

  const updateManualAccountForRow = (rowId, account) => {
    const key = String(rowId || '')
    if (!key) return

    setManualAccountByRowId((current) => {
      const next = {
        ...current,
        [key]: account || null,
      }
      persistSocietaState(result, next, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey)
      return next
    })
  }

  const updateManualCausaleForRow = (rowId, causale) => {
    const key = String(rowId || '')
    if (!key) return

    setManualCausaleByRowId((current) => {
      const next = {
        ...current,
        [key]: causale || null,
      }
      persistSocietaState(result, manualAccountByRowId, next, manualRegistrationDateByRowId, anagraficheDecisioniByKey, percipientiDecisioniByKey)
      return next
    })
  }

  const updateAnagraficaDecisionForKey = (decisionKey, updater) => {
    const key = normalizeAnagraficaDecisionKey(decisionKey)
    if (!key) return

    setAnagraficheDecisioniByKey((current) => {
      const existing = current && typeof current === 'object' ? current[key] : null
      const nextValue = typeof updater === 'function' ? updater(existing || null) : updater
      const sourceRow = (Array.isArray(anagraficheBase) ? anagraficheBase : [])
        .find((row) => normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id) === key) || null
      const normalizedNext = normalizeAnagraficaDecisionForRow(sourceRow, nextValue, pianoConti)
      const next = {
        ...(current && typeof current === 'object' ? current : {}),
        [key]: {
          ...normalizedNext,
          updatedAt: new Date().toISOString(),
        },
      }
      persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, next, percipientiDecisioniByKey)
      showActionBanner('success', 'Scelta anagrafica salvata localmente.')
      return next
    })
  }

  const updateAnagraficaDecisionForRow = (row, builder) => {
    const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
    if (!key) return

    updateAnagraficaDecisionForKey(key, (current) => {
      const normalizedCurrent = normalizeAnagraficaDecisionForRow(row, current, pianoConti)
      return typeof builder === 'function' ? builder(normalizedCurrent, row) : normalizedCurrent
    })
  }

  const updatePercipienteDecisionForKey = (decisionKey, updater) => {
    const key = normalizeAnagraficaDecisionKey(decisionKey)
    if (!key) return

    setPercipientiDecisioniByKey((current) => {
      const existing = current && typeof current === 'object' ? current[key] : null
      const nextValue = typeof updater === 'function' ? updater(existing || null) : updater
      if (!nextValue) {
        const next = { ...(current && typeof current === 'object' ? current : {}) }
        delete next[key]
        persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, next)
        return next
      }

      const next = {
        ...(current && typeof current === 'object' ? current : {}),
        [key]: normalizePercipienteDecisionForStorage(nextValue),
      }
      persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, anagraficheDecisioniByKey, next)
      return next
    })
  }

  const setAnagraficaTipoForRow = (row, nextTipo) => {
    updateAnagraficaDecisionForRow(row, (current) => {
      const normalizedTipo = nextTipo === 'cliente' ? 'cliente' : 'fornitore'
      const accountMode = current?.accountMode === 'none' ? 'none' : (current?.accountMode || 'choose')
      return {
        ...current,
        tipo: normalizedTipo,
        accountMode,
        mastrino: getDefaultMastrinoForTipo(normalizedTipo),
        existingAccountId: '',
        existingAccountCode: '',
        decisionStatus: accountMode === 'none' ? 'ignored' : 'pending',
      }
    })
  }

  const setAnagraficaAzioneForRow = (row, nextAccountMode) => {
    updateAnagraficaDecisionForRow(row, (current) => {
      const accountMode = nextAccountMode === 'existing'
        ? 'existing'
        : nextAccountMode === 'none'
          ? 'none'
          : nextAccountMode === 'choose'
            ? 'choose'
            : 'new'
      const next = {
        ...current,
        accountMode,
        decisionStatus: accountMode === 'none' ? 'ignored' : 'pending',
      }

      if (accountMode === 'existing') {
        next.existingAccountId = current?.accountMode === 'existing' ? normalizeText(current.existingAccountId || '') : ''
        next.existingAccountCode = current?.accountMode === 'existing' ? normalizeText(current.existingAccountCode || '') : ''
        if (!next.existingAccountId && !next.existingAccountCode) {
          next.decisionStatus = 'pending'
        }
      } else {
        next.existingAccountId = ''
        next.existingAccountCode = ''
      }

      if (!isAllowedMastrinoForTipo(next.tipo, next.mastrino)) {
        next.mastrino = getDefaultMastrinoForTipo(next.tipo)
      }

      return next
    })
  }

  const setAnagraficaMastrinoForRow = (row, nextMastrino) => {
    updateAnagraficaDecisionForRow(row, (current) => {
      const allowed = getAllowedMastriniForTipo(current.tipo).map((item) => item.codice)
      const mastrino = allowed.includes(normalizeText(nextMastrino)) ? normalizeText(nextMastrino) : getDefaultMastrinoForTipo(current.tipo)
      const next = {
        ...current,
        mastrino,
        decisionStatus: current.accountMode === 'none' ? 'ignored' : 'pending',
      }

      if (next.accountMode === 'existing' && next.existingAccountCode && !accountCodeBelongsToMastrino(next.existingAccountCode, mastrino)) {
        next.existingAccountId = ''
        next.existingAccountCode = ''
      }

      return next
    })
  }

  const onSelectExistingAnagraficaAccount = (rowKey, conto, row, tipoValue = null) => {
    const key = normalizeAnagraficaDecisionKey(rowKey)
    if (!key || !conto) return
    const rowTipo = tipoValue === 'cliente' ? 'cliente' : (row?.tipoSuggerito === 'cliente' ? 'cliente' : 'fornitore')
    const mastrino = getMastrinoCodeForAccountCode(conto.codice || '', rowTipo) || getDefaultMastrinoForTipo(rowTipo)
    if (!isAllowedMastrinoForTipo(rowTipo, mastrino)) return

    updateAnagraficaDecisionForKey(key, (current) => ({
      ...(current || {}),
      tipo: rowTipo,
      accountMode: 'existing',
      existingAccountId: conto.id || '',
      existingAccountCode: conto.codice || '',
      mastrino,
      decisionStatus: 'pending',
    }))
  }

  const confirmAnagraficheDecisioni = (mode = 'complete') => {
    const rows = Array.isArray(anagraficheBase) ? anagraficheBase : []
    if (!rows.length) return

    if (mode === 'all') {
      let warningsCount = 0
      let errorsCount = 0
      rows.forEach((row) => {
        const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
        if (!key) return
        const decision = anagraficheDecisioniByKey ? anagraficheDecisioniByKey[key] || null : null
        const validation = validateAnagraficaDecision(row, decision, pianoConti)
        if (validation.warnings?.length > 0) {
          warningsCount++
        }
        if (validation.status === 'incomplete' || validation.status === 'invalid') {
          errorsCount++
        }
      })
      if (warningsCount > 0 || errorsCount > 0) {
        const msg = `Attenzione: ci sono ${warningsCount} anagrafiche con warning e ${errorsCount} incomplete/con errori. Vuoi procedere a confermare le sole anagrafiche pronte?`
        if (typeof window !== 'undefined' && !window.confirm(msg)) {
          return
        }
      }
    }

    setAnagraficheDecisioniByKey((current) => {
      const next = {
        ...(current && typeof current === 'object' ? current : {}),
      }
      let confirmedCount = 0
      let remainingCount = 0
      const now = new Date().toISOString()

      rows.forEach((row) => {
        const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
        if (!key) return
        const percipienteState = buildPercipienteStatusForAnagraficaRow(row, next[key], percipienti)
        if (percipienteState.status !== 'not_relevant') return
        const validation = validateAnagraficaDecision(row, next[key], pianoConti)
        const normalized = validation.normalized || normalizeAnagraficaDecisionForRow(row, next[key], pianoConti)
        const missingAccountUpdates = validation.status === 'linked'
          ? buildMissingAccountUpdates(row, normalized, pianoConti)
          : null
        const shouldConfirm = validation.status === 'ready' || validation.status === 'linked'
        const shouldCountAsComplete = validation.status === 'ready' || validation.status === 'linked' || validation.status === 'ignored'
        if (shouldConfirm) {
          const shouldHide = validation.status !== 'linked'
            || !(missingAccountUpdates?.hasUpdates)
            && !(missingAccountUpdates?.warnings || []).length
          next[key] = {
            ...normalized,
            decisionStatus: 'confirmed',
            hiddenFromAnagrafiche: shouldHide ? true : Boolean(normalized.hiddenFromAnagrafiche),
            updatedAt: now,
          }
          confirmedCount += 1
        } else if (validation.status === 'ignored') {
          next[key] = {
            ...normalized,
            decisionStatus: 'ignored',
            accountMode: 'none',
            updatedAt: now,
          }
          confirmedCount += 1
        } else if (!shouldCountAsComplete) {
          remainingCount += 1
        }
      })

      persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, next)
      showActionBanner(
        'success',
        mode === 'all'
          ? `Confermate ${confirmedCount} anagrafiche. ${remainingCount} incomplete non confermate.`
          : `Confermate ${confirmedCount} anagrafiche completate. ${remainingCount} righe restano da completare.`,
      )
      return next
    })
  }

  const onConfirmSingleAnagrafica = async (row) => {
    if (!selectedSocietaId) {
      showActionBanner('warning', 'Seleziona una societa prima di confermare.')
      return
    }

    const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
    if (!key) return

    setBusy(true)
    try {
      const currentDecision = anagraficheDecisioniByKey[key] || row?.decision || null
      const normalizedDecision = mergeAnagraficaDecision(row, currentDecision, pianoConti)
      const validation = validateAnagraficaDecision(row, normalizedDecision, pianoConti)

      if (buildPercipienteStatusForAnagraficaRow(row, normalizedDecision, percipienti).status !== 'not_relevant') {
        showActionBanner('warning', `La riga percipiente va gestita con i pulsanti dedicati.`)
        return
      }

      const isReady = validation.status === 'ready' || validation.status === 'linked' || validation.status === 'ignored'
      if (!isReady) {
        showActionBanner('warning', `L'anagrafica non è pronta per la conferma: ${validation.blockingReasons?.[0] || 'dati incompleti'}`)
        return
      }

      const now = new Date().toISOString()
      const nextDecisionMap = {
        ...(anagraficheDecisioniByKey && typeof anagraficheDecisioniByKey === 'object' ? anagraficheDecisioniByKey : {}),
      }
      let confirmedAccountInfo = null
      let actionLabel = ''

      if (validation.status === 'ready' && normalizedDecision.accountMode === 'new') {
        const parentCode = convertMastrinoToPianoContiParent(normalizedDecision.mastrino)
        if (!parentCode) {
          showActionBanner('warning', 'Mastrino non valido o non traducibile.')
          return
        }

        const { data: nextCode, error: nextCodeError } = await getNextPianoContoCodeByParent(selectedSocietaId, parentCode)
        const codice = normalizeText(nextCode || '')
        if (nextCodeError || !codice) {
          showActionBanner('warning', `Errore nel calcolo del prossimo codice conto: ${nextCodeError?.message || 'codice nullo'}`)
          return
        }

        const payload = buildImportContabilitaPianoContoPayload({
          societaId: selectedSocietaId,
          row,
          decision: normalizedDecision,
          codice,
        })

        const { data: createdAccount, error: createError } = await createImportContabilitaPianoConto(payload)
        if (createError || !createdAccount) {
          showActionBanner('warning', `Creazione conto fallita: ${createError?.message || 'errore imprevisto'}`)
          return
        }

        confirmedAccountInfo = createdAccount
        actionLabel = `Nuovo conto creato (${createdAccount.codice})`

        nextDecisionMap[key] = {
          ...normalizedDecision,
          accountMode: 'existing',
          existingAccountId: createdAccount.id || '',
          existingAccountCode: createdAccount.codice || '',
          mastrino: getMastrinoCodeForAccountCode(createdAccount.codice || '', normalizedDecision.tipo) || normalizedDecision.mastrino,
          decisionStatus: 'confirmed',
          hiddenFromAnagrafiche: true,
          updatedAt: now,
        }
      } else if (validation.status === 'linked' && normalizedDecision.accountMode === 'existing') {
        actionLabel = `Conto esistente collegato (${normalizedDecision.existingAccountCode})`
        const missingAccountUpdates = buildMissingAccountUpdates(row, normalizedDecision, pianoConti)
        const shouldHide = !(missingAccountUpdates?.hasUpdates) && !(missingAccountUpdates?.warnings || []).length

        nextDecisionMap[key] = {
          ...normalizedDecision,
          decisionStatus: 'confirmed',
          hiddenFromAnagrafiche: shouldHide ? true : Boolean(normalizedDecision.hiddenFromAnagrafiche),
          updatedAt: now,
        }
      } else if (validation.status === 'ignored') {
        actionLabel = 'Ignorata'
        nextDecisionMap[key] = {
          ...normalizedDecision,
          decisionStatus: 'ignored',
          accountMode: 'none',
          updatedAt: now,
        }
      }

      if (confirmedAccountInfo) {
        try {
          const reloaded = await loadPianoContiBySocieta(selectedSocietaId)
          if (Array.isArray(reloaded) && reloaded.length) {
            setPianoConti(reloaded)
          } else {
            setPianoConti((current) => [...current, confirmedAccountInfo])
          }
        } catch (error) {
          setPianoConti((current) => [...current, confirmedAccountInfo])
        }
      }

      setAnagraficheDecisioniByKey(nextDecisionMap)
      persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, nextDecisionMap)

      const displayName = normalizeText(row?.denominazione) || row?.partitaIva || row?.codiceFiscale || key
      showActionBanner(
        'success',
        `Confermata anagrafica: "${displayName}". Azione: ${actionLabel}. Documenti aggiornati: ${row.fattureCount || 0}.`
      )
    } catch (err) {
      showActionBanner('warning', `Errore durante la conferma: ${err?.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  const onCreateConfirmedAnagraficheAccounts = async () => {
    if (!selectedSocietaId) {
      showActionBanner('warning', 'Seleziona una societa prima di creare conti.')
      return
    }

    const rows = Array.isArray(anagraficheDaVerificareView) ? anagraficheDaVerificareView : []
    if (!rows.length) {
      showActionBanner('warning', 'Nessuna anagrafica disponibile da creare.')
      return
    }

    const nextDecisionMap = {
      ...(anagraficheDecisioniByKey && typeof anagraficheDecisioniByKey === 'object' ? anagraficheDecisioniByKey : {}),
    }
    const workingPianoConti = Array.isArray(pianoConti) ? pianoConti.map((row) => ({ ...row })) : []
    const now = new Date().toISOString()
    const seenKeys = new Set()
    let createdCount = 0
    let linkedExistingCount = 0
    let skippedCount = 0
    let failedCount = 0

    for (const row of rows) {
      const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
      if (!key || seenKeys.has(key)) {
        skippedCount += 1
        continue
      }
      seenKeys.add(key)

      const currentDecision = nextDecisionMap[key] || row?.decision || null
      const normalizedDecision = mergeAnagraficaDecision(row, currentDecision, workingPianoConti)
      const validation = validateAnagraficaDecision(row, normalizedDecision, workingPianoConti)
      if (buildPercipienteStatusForAnagraficaRow(row, normalizedDecision, percipienti).status !== 'not_relevant') {
        skippedCount += 1
        continue
      }

      if (validation.status !== 'ready' || normalizedDecision.accountMode !== 'new') {
        skippedCount += 1
        continue
      }

      const existingAccount = findImportContabilitaExistingAccount(row, workingPianoConti, normalizedDecision.tipo)
      if (existingAccount) {
        const existingMastrino = getMastrinoCodeForAccountCode(existingAccount.codice || '', normalizedDecision.tipo) || normalizedDecision.mastrino
        nextDecisionMap[key] = {
          ...normalizedDecision,
          accountMode: 'existing',
          existingAccountId: existingAccount.id || '',
          existingAccountCode: existingAccount.codice || '',
          mastrino: existingMastrino,
          decisionStatus: 'confirmed',
          hiddenFromAnagrafiche: true,
          updatedAt: now,
        }
        linkedExistingCount += 1
        continue
      }

      const parentCode = convertMastrinoToPianoContiParent(normalizedDecision.mastrino)
      if (!parentCode) {
        skippedCount += 1
        continue
      }

      const { data: nextCode, error: nextCodeError } = await getNextPianoContoCodeByParent(selectedSocietaId, parentCode)
      const codice = normalizeText(nextCode || '')
      if (nextCodeError || !codice) {
        failedCount += 1
        continue
      }

      const payload = buildImportContabilitaPianoContoPayload({
        societaId: selectedSocietaId,
        row,
        decision: normalizedDecision,
        codice,
      })

      const { data: createdAccount, error: createError } = await createImportContabilitaPianoConto(payload)
      if (createError || !createdAccount) {
        failedCount += 1
        showActionBanner(
          'warning',
          `Creazione non completata per ${row?.denominazione || row?.partitaIva || row?.codiceFiscale || key}: ${createError?.message || 'errore imprevisto'}`,
        )
        continue
      }

      workingPianoConti.push(createdAccount)
      nextDecisionMap[key] = {
        ...normalizedDecision,
        accountMode: 'existing',
        existingAccountId: createdAccount.id || '',
        existingAccountCode: createdAccount.codice || '',
        mastrino: getMastrinoCodeForAccountCode(createdAccount.codice || '', normalizedDecision.tipo) || normalizedDecision.mastrino,
        decisionStatus: 'confirmed',
        hiddenFromAnagrafiche: true,
        updatedAt: now,
      }
      createdCount += 1
    }

    let refreshedPianoConti = workingPianoConti
    try {
      const reloaded = await loadPianoContiBySocieta(selectedSocietaId)
      if (Array.isArray(reloaded) && reloaded.length) {
        refreshedPianoConti = reloaded
      }
    } catch (error) {
      showActionBanner('warning', `Conti creati ma non completamente ricaricati: ${error?.message || error}`)
    }

    setPianoConti(refreshedPianoConti)
    setAnagraficheDecisioniByKey(nextDecisionMap)
    persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, nextDecisionMap)
    showActionBanner(
      failedCount
        ? 'warning'
        : 'success',
      `Creati ${createdCount} conti. ${linkedExistingCount} gia presenti collegati. ${skippedCount + failedCount} righe saltate/non valide${failedCount ? ` (${failedCount} creazioni non completate)` : ''}.`,
    )
  }

  const updateExistingAnagraficaAccountRow = async (row, decision = null, options = {}) => {
    if (!selectedSocietaId) {
      return { ok: false, error: new Error('Seleziona una societa prima di aggiornare i conti.') }
    }

    const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
    if (!key) return { ok: false, error: new Error('Chiave anagrafica mancante') }

    const currentDecision = decision || anagraficheDecisioniByKey?.[key] || row?.decision || null
    const normalizedDecision = normalizeAnagraficaDecisionForRow(row, currentDecision, pianoConti)
    const validation = validateAnagraficaDecision(row, normalizedDecision, pianoConti)
    if (buildPercipienteStatusForAnagraficaRow(row, normalizedDecision, percipienti).status !== 'not_relevant') {
      return { ok: false, error: new Error('La riga percipiente non partecipa all\'aggiornamento dei conti.') }
    }
    if (validation.status !== 'linked' || normalizedDecision.accountMode !== 'existing') {
      return { ok: false, error: new Error("La riga non è pronta per l'aggiornamento dei dati conto.") }
    }

    const missingAccountInfo = buildMissingAccountUpdates(row, normalizedDecision, pianoConti)
    if (!missingAccountInfo.account) {
      return { ok: false, error: new Error("Conto esistente non trovato per l'aggiornamento.") }
    }
    if (!missingAccountInfo.hasUpdates) {
      return {
        ok: false,
        error: new Error(missingAccountInfo.warnings.length ? missingAccountInfo.warnings[0] : 'Nessun dato conto da aggiornare.'),
      }
    }

    if (!options.skipBusyState) {
      setAnagraficaAccountUpdateBusyKey(key)
    }
    const shouldReloadPianoConti = options.reloadPianoConti !== false
    if (!options.skipBusyState) {
      setPianoContiLoading(true)
    }
    try {
      const { data: updatedAccount, error } = await updateImportContabilitaPianoContoAnagrafica(missingAccountInfo.account.id, missingAccountInfo.updates)
      if (error || !updatedAccount) {
        throw error || new Error('Aggiornamento conto non completato')
      }

      let refreshedPianoConti = null
      let reloadError = null
      try {
        refreshedPianoConti = await loadPianoContiBySocieta(selectedSocietaId)
      } catch (error) {
        reloadError = error
      }

      if (shouldReloadPianoConti && Array.isArray(refreshedPianoConti)) {
        setPianoConti(refreshedPianoConti)
      } else if (shouldReloadPianoConti) {
        setPianoConti((current) => {
          const list = Array.isArray(current) ? current.slice() : []
          const index = list.findIndex((conto) => normalizeText(conto?.id || '') === normalizeText(updatedAccount.id || ''))
          if (index >= 0) {
            list[index] = { ...list[index], ...updatedAccount }
          } else {
            list.push(updatedAccount)
          }
          return list
        })
      }

      const now = new Date().toISOString()
      const nextDecisionMap = options.decisionMap && typeof options.decisionMap === 'object'
        ? options.decisionMap
        : {
          ...(anagraficheDecisioniByKey && typeof anagraficheDecisioniByKey === 'object' ? anagraficheDecisioniByKey : {}),
        }
      nextDecisionMap[key] = {
        ...normalizedDecision,
        accountMode: 'existing',
        existingAccountId: updatedAccount.id || missingAccountInfo.account.id || '',
        existingAccountCode: updatedAccount.codice || missingAccountInfo.account.codice || '',
        decisionStatus: 'confirmed',
        hiddenFromAnagrafiche: true,
        accountDataUpdatedAt: now,
        updatedAt: now,
      }
      if (options.commitDecisionState !== false) {
        setAnagraficheDecisioniByKey(nextDecisionMap)
        persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, nextDecisionMap)
      }
      if (!options.silent) {
        if (reloadError) {
          showActionBanner('warning', 'Dati conto aggiornati, ma il piano conti non è stato ricaricato integralmente.')
        } else {
          showActionBanner('success', 'Dati conto aggiornati.')
        }
      }
      return { ok: true, key, decision: nextDecisionMap[key], account: updatedAccount, reloadError: reloadError || null }
    } catch (error) {
      return { ok: false, error }
    } finally {
      if (!options.skipBusyState) {
        setPianoContiLoading(false)
        setAnagraficaAccountUpdateBusyKey('')
      }
    }
  }

  const onUpdateExistingAnagraficaAccount = async (row, decision = null) => {
    const resultUpdate = await updateExistingAnagraficaAccountRow(row, decision)
    if (!resultUpdate?.ok) {
      showActionBanner('warning', `Aggiornamento dati conto non completato: ${resultUpdate?.error?.message || 'errore imprevisto'}`)
    }
  }

  const onUpdateAllExistingAnagraficaAccounts = async () => {
    if (!selectedSocietaId) {
      showActionBanner('warning', 'Seleziona una societa prima di aggiornare i conti.')
      return
    }

    const rows = Array.isArray(updatableExistingAnagraficheRows) ? updatableExistingAnagraficheRows : []
    if (!rows.length) {
      showActionBanner('warning', 'Nessun conto esistente con aggiornamenti sicuri disponibili.')
      return
    }

    setPianoContiLoading(true)
    let updatedCount = 0
    let skippedCount = 0
    let errorCount = 0
    const nextDecisionMap = {
      ...(anagraficheDecisioniByKey && typeof anagraficheDecisioniByKey === 'object' ? anagraficheDecisioniByKey : {}),
    }
    const updatedKeys = []

    try {
      for (const row of rows) {
        const decision = row?.decision || null
        const outcome = await updateExistingAnagraficaAccountRow(row, decision, {
          skipBusyState: true,
          reloadPianoConti: false,
          silent: true,
          decisionMap: nextDecisionMap,
          commitDecisionState: false,
        })

        if (outcome?.ok) {
          updatedCount += 1
          if (outcome?.key) updatedKeys.push(outcome.key)
          continue
        }

        const message = normalizeText(outcome?.error?.message || '').toLowerCase()
        if (
          message.includes('nessun dato conto da aggiornare')
          || message.includes('conto esistente non trovato')
          || message.includes('non è pronta')
          || message.includes('non pronta')
        ) {
          skippedCount += 1
        } else {
          errorCount += 1
        }
      }

      let reloaded = null
      try {
        reloaded = await loadPianoContiBySocieta(selectedSocietaId)
      } catch (error) {
        reloaded = null
      }

      if (Array.isArray(reloaded)) {
        setPianoConti(reloaded)
      }

      setAnagraficheDecisioniByKey(nextDecisionMap)
      persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, nextDecisionMap)

      showActionBanner(
        errorCount
          ? 'warning'
          : 'success',
        `Aggiornati ${updatedCount} conti esistenti. ${skippedCount} saltati, ${errorCount} errori.`,
      )
    } finally {
      setPianoContiLoading(false)
    }
  }

  const onHideIgnoredAnagrafiche = () => {
    const rows = Array.isArray(anagraficheOperationalRows) ? anagraficheOperationalRows : []
    const nextDecisionMap = {
      ...(anagraficheDecisioniByKey && typeof anagraficheDecisioniByKey === 'object' ? anagraficheDecisioniByKey : {}),
    }
    const now = new Date().toISOString()
    let hiddenCount = 0

    rows.forEach((row) => {
      const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
      if (!key) return
      const decision = nextDecisionMap[key] || row?.decision || null
      const validation = validateAnagraficaDecision(row, decision, pianoConti)
      const accountMode = normalizeText(decision?.accountMode || '')
      const isIgnored = validation.status === 'ignored' || accountMode === 'none' || normalizeText(decision?.decisionStatus || '') === 'ignored'
      if (!isIgnored) return

      nextDecisionMap[key] = {
        ...(normalizeAnagraficaDecisionForRow(row, decision, pianoConti) || {}),
        hiddenFromAnagrafiche: true,
        updatedAt: now,
      }
      hiddenCount += 1
    })

    if (!hiddenCount) {
      showActionBanner('warning', 'Nessuna anagrafica ignorata da rimuovere.')
      return
    }

    setAnagraficheDecisioniByKey(nextDecisionMap)
    persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId, nextDecisionMap)
    showActionBanner('success', `Rimosse ${hiddenCount} anagrafiche ignorate dalla lista.`)
  }

  const consolidatePercipienteDecisionForRow = async (row, statusLabel = 'linked') => {
    const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
    if (!key) {
      showActionBanner('warning', 'Chiave percipiente mancante.')
      return { ok: false, error: new Error('Chiave percipiente mancante') }
    }

    const candidate = getPercipienteCandidateForAnagraficaRow(row, row?.decision || null)
    const codiceFiscale = normalizePercipienteCf(candidate.codiceFiscale)
    if (!codiceFiscale) {
      showActionBanner('warning', 'CF obbligatorio per percipiente.')
      return { ok: false, error: new Error('CF obbligatorio per percipiente') }
    }

    const { data: foundPercipiente, error } = await findImportContabilitaPercipienteByCf(selectedSocietaId, codiceFiscale)
    if (error) {
      showActionBanner('warning', `Percipiente non verificabile: ${error?.message || error}`)
      return { ok: false, error }
    }

    if (!foundPercipiente?.id) {
      showActionBanner('warning', 'Percipiente non più trovato, ricaricare i dati.')
      return { ok: false, error: new Error('Percipiente non trovato') }
    }

    const now = new Date().toISOString()
    updatePercipienteDecisionForKey(key, {
      status: statusLabel === 'created' ? 'created' : 'linked',
      percipienteId: foundPercipiente.id,
      codiceFiscale,
      actionAt: now,
      hiddenFromAnagrafiche: true,
    })

    return { ok: true, percipiente: foundPercipiente, key }
  }

  const onConfirmExistingPercipienteForRow = async (row) => {
    if (!selectedSocietaId) {
      showActionBanner('warning', 'Seleziona una societa prima di gestire i percipienti.')
      return
    }

    const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
    if (!key) return
    if (percipienteActionBusyKey === key) return

    const state = buildPercipienteStatusForAnagraficaRow(row, row?.decision || null, percipienti)
    if (state.status === 'missing_cf') {
      showActionBanner('warning', 'CF obbligatorio per percipiente.')
      return
    }
    if (state.status !== 'existing') {
      showActionBanner('warning', 'Il percipiente non è pronto per la conferma locale.')
      return
    }

    setPercipienteActionBusyKey(key)
    try {
      const outcome = await consolidatePercipienteDecisionForRow(row, 'linked')
      if (outcome?.ok) {
        showActionBanner('success', 'Percipiente esistente confermato localmente.')
      }
    } finally {
      setPercipienteActionBusyKey('')
    }
  }

  const onCreatePercipienteForRow = async (row) => {
    if (!selectedSocietaId) {
      showActionBanner('warning', 'Seleziona una societa prima di creare percipienti.')
      return
    }

    const key = normalizeAnagraficaDecisionKey(row?.decisionKey || row?.id)
    if (!key) return
    if (percipienteActionBusyKey === key) return

    const state = buildPercipienteStatusForAnagraficaRow(row, row?.decision || null, percipienti)
    if (state.status === 'missing_cf') {
      showActionBanner('warning', 'CF obbligatorio per percipiente.')
      return
    }
    if (state.status === 'unknown') {
      showActionBanner('warning', 'Percipienti non caricati: ricarica i dati prima di creare.')
      return
    }

    setPercipienteActionBusyKey(key)
    try {
      const candidateCf = normalizePercipienteCf(state.codiceFiscale)
      const preflight = await findImportContabilitaPercipienteByCf(selectedSocietaId, candidateCf)
      if (preflight?.error) {
        showActionBanner('warning', `Percipiente non verificabile: ${preflight.error.message || preflight.error}`)
        return
      }

      if (preflight?.data?.id) {
        updatePercipienteDecisionForKey(key, {
          status: 'linked',
          percipienteId: preflight.data.id,
          codiceFiscale: candidateCf,
          actionAt: new Date().toISOString(),
          hiddenFromAnagrafiche: true,
        })
        showActionBanner('success', 'Percipiente già presente: aggancio locale completato.')
        return
      }

      const payload = buildPercipienteCreatePayload(row, selectedSocietaId)
      if (!payload) {
        showActionBanner('warning', 'Percipiente non creabile: CF obbligatorio.')
        return
      }

      const created = await createImportContabilitaPercipiente(payload)
      if (created?.error) {
        showActionBanner('warning', `Creazione percipiente non completata: ${created.error.message || created.error}`)
        return
      }

      if (created?.alreadyExists && created?.data?.id) {
        updatePercipienteDecisionForKey(key, {
          status: 'linked',
          percipienteId: created.data.id,
          codiceFiscale: candidateCf,
          actionAt: new Date().toISOString(),
          hiddenFromAnagrafiche: true,
        })
        showActionBanner('success', 'Percipiente già presente: aggancio locale completato.')
        return
      }

      let refreshedPercipienti = null
      try {
        refreshedPercipienti = await loadPercipientiBySocieta(selectedSocietaId)
      } catch (error) {
        refreshedPercipienti = null
      }
      if (Array.isArray(refreshedPercipienti)) {
        setPercipienti(refreshedPercipienti)
      }

      updatePercipienteDecisionForKey(key, {
        status: 'created',
        percipienteId: created?.data?.id || '',
        codiceFiscale: candidateCf,
        actionAt: new Date().toISOString(),
        hiddenFromAnagrafiche: true,
      })
      showActionBanner('success', 'Percipiente creato e nascosto dalla lista.')
    } finally {
      setPercipienteActionBusyKey('')
    }
  }

  const onFilesChange = async (event) => {
    const files = Array.from(event.target.files || [])
    setSelectedFiles(files)
    setLastFileCount(files.length)
    setErrorMsg('')
    setSelectedRowIds(new Set())
    setSearchTerm('')

    if (!selectedSocietaId) {
      setErrorMsg('Seleziona una societa prima di caricare le fatture')
      return
    }

    if (files.length) {
      await onAnalyze(files)
    }
  }

  const triggerFilePicker = () => {
    fileInputRef.current?.click()
  }

  const onAnalyze = async (filesOverride) => {
    if (!selectedSocietaId) {
      setErrorMsg('Seleziona una societa prima di analizzare i file.')
      return
    }

    const filesToAnalyze = Array.isArray(filesOverride) && filesOverride.length ? filesOverride : selectedFiles
    if (!filesToAnalyze.length) {
      setErrorMsg('Seleziona uno o piu file XML, P7M o ZIP prima di avviare l\'analisi.')
      return
    }

    setBusy(true)
    setBusyLabel('Preparazione file...')
    setErrorMsg('')
    setSelectedRowIds(new Set())
    setReimportSelectedRowIds(new Set())

    try {
      const snapshot = readSocietaSnapshot(selectedSocietaId)
      const existingResult = result && Array.isArray(result.stagingRows) ? result : snapshot?.result || null
      const workflowResult = await runImportWorkflow(filesToAnalyze, {
        batchId: `ic-${Date.now()}`,
        societaId: selectedSocietaId,
        societaName: selectedSocietaName,
      })
      const mergeOutcome = mergeImportResults(existingResult, workflowResult)
      setResult(mergeOutcome.result)
      persistSocietaState(mergeOutcome.result, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId)
      showActionBanner(
        'success',
        mergeOutcome.addedCount
          ? `Import completato: aggiunte ${mergeOutcome.addedCount} nuove fatture. ${mergeOutcome.skippedCount} erano gia presenti nella working table e non sono state duplicate.`
          : mergeOutcome.skippedCount > 0
            ? `Import completato: nessuna nuova fattura aggiunta. ${mergeOutcome.skippedCount} erano gia presenti nella working table.`
            : 'Import completato.',
      )
    } catch (error) {
      setErrorMsg(error?.message || 'Analisi non completata.')
    } finally {
      setBusy(false)
      setBusyLabel('Analisi in corso...')
    }
  }

  const onToggleVisibleSelection = () => {
    if (!visibleRows.length) return
    if (allVisibleSelected) {
      const next = new Set(selectedRowIds)
      visibleRows.forEach((row) => next.delete(getRowKey(row)))
      updateSelectedRows(next)
      return
    }
    const next = new Set(selectedRowIds)
    visibleRows.forEach((row) => next.add(getRowKey(row)))
    updateSelectedRows(next)
  }

  const onSelectAllVisible = () => {
    if (!visibleRows.length) return
    const next = new Set(selectedRowIds)
    visibleRows.forEach((row) => next.add(getRowKey(row)))
    updateSelectedRows(next)
  }

  const onDeselectAll = () => {
    updateSelectedRows(new Set())
  }

  const onDeleteSelectedLocal = () => {
    if (!selectedCount) return
    const selectedKeys = new Set(selectedRowIds)
    const nextRows = stagingRows.filter((row) => !selectedKeys.has(getRowKey(row)))
    const nextReport = rebuildReportFromRows(report, nextRows)

    setResult((current) => {
      if (!current) return current
      const nextState = {
        ...current,
        stagingRows: nextRows,
        report: nextReport,
      }
      persistSocietaState(nextState, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId)
      return {
        ...nextState,
      }
    })
    updateSelectedRows(new Set())
  }

  const getSelectedRowIdList = () => Array.from(selectedRowIds)

  const getSelectedRowObjects = () =>
    getSelectedRowIdList()
      .map((id) => stagingRows.find((row) => getRowKey(row) === id))
      .filter(Boolean)

  const persistRowsChange = (nextRows, nextSelectedIds = new Set()) => {
    const nextReport = rebuildReportFromRows(report, nextRows)
    setResult((current) => {
      if (!current) return current
      const nextState = {
        ...current,
        stagingRows: nextRows,
        report: nextReport,
      }
      persistSocietaState(nextState, manualAccountByRowId, manualCausaleByRowId, manualRegistrationDateByRowId)
      return nextState
    })
    updateSelectedRows(nextSelectedIds)
    setPreviewRowId((current) => {
      if (!current) return current
      return nextRows.some((row) => getRowKey(row) === current) ? current : ''
    })
  }

  const showActionBanner = (tone, text) => {
    setActionBanner({ tone, text })
  }

  const onRemoveCurrentRow = () => {
    const selectedIds = getSelectedRowIdList()
    const primaryId = selectedIds[0]
    if (!primaryId) {
      showActionBanner('warning', 'Seleziona una riga prima di usare Rimuovi.')
      return
    }
    const nextRows = stagingRows.filter((row) => getRowKey(row) !== primaryId)
    const nextSelectedIds = new Set(selectedIds.filter((id) => id !== primaryId))
    persistRowsChange(nextRows, nextSelectedIds)
    showActionBanner('info', 'Riga rimossa dalla vista locale.')
  }

  const onDeleteSelectedRows = () => {
    if (!selectedCount) {
      showActionBanner('warning', 'Nessuna riga selezionata da eliminare.')
      return
    }
    const selectedKeys = new Set(selectedRowIds)
    const nextRows = stagingRows.filter((row) => !selectedKeys.has(getRowKey(row)))
    persistRowsChange(nextRows, new Set())
    showActionBanner('success', `${selectedCount} righe eliminate dalla vista locale.`)
  }

  const onSelectNextVisibleRow = () => {
    if (!visibleRows.length) {
      showActionBanner('warning', 'Nessuna riga visibile da selezionare.')
      return
    }

    const currentVisibleId = getSelectedRowIdList().find((id) => visibleRows.some((row) => getRowKey(row) === id))
    const currentIndex = currentVisibleId
      ? visibleRows.findIndex((row) => getRowKey(row) === currentVisibleId)
      : -1
    const nextIndex = currentIndex >= 0 && currentIndex < visibleRows.length - 1 ? currentIndex + 1 : currentIndex >= 0 ? currentIndex : 0
    const nextRow = visibleRows[nextIndex] || visibleRows[0]
    if (!nextRow) return
    updateSelectedRows(new Set([getRowKey(nextRow)]))
    showActionBanner('info', `Selezionata riga: ${nextRow.filename || getRowKey(nextRow)}.`)
  }

  const onStartAccounting = async () => {
    const currentSocieta = resolveSocietaFromImportOptions(
      societaOptions,
      selectedSocietaId,
      selectedSocietaName,
    )
    const demoGuard = evaluateDemoCompanyForImport(currentSocieta)

    if (isSelectedDemoSocieta && !demoGuard.allowed) {
      showActionBanner('warning', buildImportDemoGuardBlockMessage(demoGuard))
      return
    }

    if (selectedRowIds.size === 0) {
      showActionBanner(
        'warning',
        'Seleziona almeno un documento pronto.'
      )
      return
    }

    // A. Single selection (size === 1)
    if (selectedRowIds.size === 1) {
      const launchRows = stagingRows.filter((row) => {
        const key = getRowKey(row)
        return selectedRowIds.has(key)
      })

      const eligibleRows = launchRows.filter((row) => {
        const key = getRowKey(row)
        return workingTableReadinessByRowId[key]?.ready && row.state !== 'registered' && row.state !== 'committed'
      })

      if (eligibleRows.length !== 1) {
        showActionBanner(
          'warning',
          'La riga selezionata non è pronta per la contabilizzazione. Completa la riga prima di procedere.'
        )
        return
      }

      const row = eligibleRows[0]
      const key = getRowKey(row)
      const parsedDocument = row?.parsedDocument || {}
      const preferredCounterparty = getPreferredCounterparty(parsedDocument)
      const counterparty = preferredCounterparty?.counterparty || {}
      const counterpartyAccount = counterpartyAccountByRowId[key] || null
      const costRevenueAccount = manualAccountByRowId[key] || null
      const causale = manualCausaleByRowId[key] || null
      const registrationDate = manualRegistrationDateByRowId[key] || parsedDocument?.dataDocumento || registrationDateDraft
      const automationMeta = automationMetaByRowId[key] || null

      const imponibile = Number(parsedDocument?.imponibile ?? 0)
      const iva = Number(parsedDocument?.iva ?? 0)
      const totale = Number(parsedDocument?.totale ?? 0)
      const dataDocumento = parsedDocument?.dataDocumento
      const numeroDocumento = parsedDocument?.numeroDocumento

      if (!row) {
        showActionBanner('error', 'Errore bloccante: documento importato non trovato.')
        return
      }
      if (!parsedDocument || Object.keys(parsedDocument).length === 0) {
        showActionBanner('error', 'Errore bloccante: anteprima/XML documento non disponibile.')
        return
      }
      if (!counterparty || Object.keys(counterparty).length === 0) {
        showActionBanner('error', 'Errore bloccante: fornitore collegato non trovato.')
        return
      }
      if (!imponibile || imponibile <= 0) {
        showActionBanner('error', 'Errore bloccante: imponibile documento non valido o pari a zero.')
        return
      }
      if (iva === undefined || iva === null) {
        showActionBanner('error', 'Errore bloccante: importo IVA mancante.')
        return
      }
      if (!totale || totale <= 0) {
        showActionBanner('error', 'Errore bloccante: totale documento non valido o pari a zero.')
        return
      }
      if (!dataDocumento) {
        showActionBanner('error', 'Errore bloccante: data documento non specificata.')
        return
      }
      if (!registrationDate) {
        showActionBanner('error', 'Errore bloccante: data registrazione non specificata.')
        return
      }
      if (!numeroDocumento) {
        showActionBanner('error', 'Errore bloccante: numero documento non specificato.')
        return
      }
      if (isSelectedDemoSocieta && !automationMeta) {
        showActionBanner('error', 'Errore bloccante: metadata test_lab non trovati per la riga.')
        return
      }

      setWorkingViewRowIds([key])
      setWorkingViewRowId(key)
      setWorkingViewOpen(true)
      setWorkingViewTab('prima_nota')
      showActionBanner('success', `Apertura predisposizione contabile per il documento ${numeroDocumento}.`)
      return
    }

    // B. Multi-selection (size > 1)
    const launchRows = stagingRows.filter((row) => {
      const key = getRowKey(row)
      return selectedRowIds.has(key)
    })

    const eligibleRows = launchRows.filter((row) => {
      const key = getRowKey(row)
      return workingTableReadinessByRowId[key]?.ready && row.state !== 'registered' && row.state !== 'committed'
    })

    if (eligibleRows.length === 0) {
      showActionBanner(
        'warning',
        'Nessuno dei documenti selezionati è pronto per la contabilizzazione.'
      )
      return
    }

    const excludedCount = launchRows.length - eligibleRows.length
    if (excludedCount > 0) {
      showActionBanner(
        'warning',
        `Attenzione: ${excludedCount} document${excludedCount === 1 ? 'o' : 'i'} non pront${excludedCount === 1 ? 'o' : 'i'} o già contabilizzat${excludedCount === 1 ? 'o' : 'i'} escluso.`
      )
    } else {
      showActionBanner('success', `Apertura sessione contabile per ${eligibleRows.length} documenti.`)
    }

    const eligibleKeys = eligibleRows.map(row => getRowKey(row))
    setWorkingViewRowIds(eligibleKeys)
    setWorkingViewRowId(eligibleKeys[0])
    setWorkingViewOpen(true)
    setWorkingViewTab('prima_nota')
  }

  const handleDemoWorkingViewCommit = async ({ ivaDraftRows = [], pnDraftRows = [] } = {}) => {
    if (demoCommitBusy) return

    setDemoCommitBusy(true)
    setDemoCommitReport(null)

    try {
      console.log('[TEST_LAB_COMMIT_START]', {
        documento: activeWorkingViewModel?.parsedDocument?.numeroDocumento || workingViewRowId,
        societaId: selectedSocietaId,
      })

      const bundle = buildDemoWorkingViewCommitBundle({
        societaId: selectedSocietaId,
        operatorId: 'test_lab_import_24e',
        sourceBatchId: result?.batchId || result?.report?.batchId || '',
        activeWorkingViewModel,
        ivaDraftRows,
        pnDraftRows,
        pianoConti,
        automationMeta: activeWorkingViewModel?.automationMeta || null,
        guardParams: {
          societa: selectedSocietaForDemo,
          selectedRowIds,
          workingViewOpen,
          workingViewRowId,
          activeWorkingViewModel,
          baseWorkingViewChecks: activeWorkingViewChecks,
          ivaDraftRows,
          pianoConti,
        },
      })

      // 3. Log rows source, normalized, and canonical for Test Lab
      console.log('[TEST_LAB_COMMIT_ROWS_SOURCE]')
      const sourceRows = pnDraftRows.length > 0 ? pnDraftRows : bundle.builderInput.primaNotaDraftRows
      sourceRows.forEach((r, idx) => {
        console.log(`riga ${idx} dare ${r?.dare ?? r?.debit ?? r?.importoDare ?? r?.importo_dare ?? 0} avere ${r?.avere ?? r?.credit ?? r?.importoAvere ?? r?.importo_avere ?? 0}`)
      })

      console.log('[TEST_LAB_COMMIT_ROWS_NORMALIZED]')
      bundle.builderInput.primaNotaDraftRows.forEach((r, idx) => {
        console.log(`riga ${idx} dare ${r?.debit ?? r?.dare ?? 0} avere ${r?.credit ?? r?.avere ?? 0}`)
      })

      console.log('[TEST_LAB_COMMIT_CANONICAL_ACCOUNTING_ROWS]')
      const mapped = mapImportContabilitaCommitPayloadToCanonical(bundle.commitEnvelope)
      mapped.payload.accounting.rows.forEach((r, idx) => {
        console.log(`riga ${idx} dare ${r?.dare ?? r?.debit ?? 0} avere ${r?.avere ?? r?.credit ?? 0}`)
      })

      // Verification of alignment
      const allAligned = mapped.payload.accounting.rows.every((r, idx) => {
        const sourceR = sourceRows[idx]
        if (!sourceR) return false
        const sDare = parseNumberRobust(sourceR?.dare ?? sourceR?.debit ?? sourceR?.importoDare ?? sourceR?.importo_dare ?? 0)
        const sAvere = parseNumberRobust(sourceR?.avere ?? sourceR?.credit ?? sourceR?.importoAvere ?? sourceR?.importo_avere ?? 0)
        const mDare = Number(r?.dare ?? r?.debit ?? 0)
        const mAvere = Number(r?.avere ?? r?.credit ?? 0)
        return sDare === mDare && sAvere === mAvere
      })

      if (!allAligned) {
        throw new Error(`Commit demo bloccato: righe Prima Nota non allineate alla working view. Campi ricevuti in riga 0: dare=${sourceRows[0]?.dare ?? sourceRows[0]?.debit}, avere=${sourceRows[0]?.avere ?? sourceRows[0]?.credit}`)
      }

      // 5. Diagnostica Test Lab - Account Resolution
      console.log('[TEST_LAB_COMMIT_ACCOUNT_RESOLUTION]')
      mapped.payload.accounting.rows.forEach((r, idx) => {
        let tipoRiga = 'costo'
        if (idx === 1) tipoRiga = 'IVA'
        else if (idx === 2) tipoRiga = 'fornitore'
        console.log(`index=${idx}, tipoRiga=${tipoRiga}, accountId=${r?.accountId || ''}, accountCode=${r?.accountCode || ''}, accountDescription=${r?.accountDescription || ''}, dare=${r?.dare ?? 0}, avere=${r?.avere ?? 0}`)
      })

      // 4. Validazione anticipata per accountId mancante
      mapped.payload.accounting.rows.forEach((r, idx) => {
        if (!r?.accountId) {
          let tipoRiga = 'costo'
          if (idx === 1) tipoRiga = 'IVA'
          else if (idx === 2) tipoRiga = 'fornitore'
          const info = `sottoconto mancante sulla riga PN ${idx} (tipo: ${tipoRiga}, codice: ${r?.accountCode || ''}, descrizione: ${r?.accountDescription || ''})`
          throw new Error(`Commit demo bloccato: ${info}`)
        }
      })

      // 5. Diagnostica Test Lab - IVA Technical Type
      console.log('[TEST_LAB_COMMIT_IVA_TECHNICAL_TYPE]')
      const causaleRef = mapped.payload.header?.causaleContabile || {}
      const tipoTecnico = causaleRef.tipo_causale || causaleRef.tipoCausale || ''
      const tipoOperazione = causaleRef.operazione_gestita || causaleRef.operazioneGestita || ''
      const registro = causaleRef.registro_iva || causaleRef.registroIva || ''
      const tipoRegistro = mapped.payload.fiscalContext?.tipoRegistro || ''

      const vatRowsList = mapped.payload.vat?.rows || []
      vatRowsList.forEach((vr, idx) => {
        const esito = tipoTecnico ? 'success' : 'failed'
        console.log(`documento=${activeWorkingViewModel?.parsedDocument?.numeroDocumento || workingViewRowId}, societa=${selectedSocietaForDemo?.codice || ''}, causaleIvaId=${vr.causaleIvaId || ''}, causaleIvaCodice=${vr.causaleIva || ''}, tipoTecnico=${tipoTecnico}, tipoOperazione=${tipoOperazione}, registro=${registro}, tipoRegistro=${tipoRegistro}, aliquota=${vr.aliquota}, imponibile=${vr.imponibile}, imposta=${vr.imposta}, esito=${esito}`)

        if (!tipoTecnico) {
          throw new Error(`Commit demo bloccato: tipo tecnico IVA mancante sulla riga IVA ${idx} (causale ${vr.causaleIva || 'TESTLAB22'}, aliquota ${vr.aliquota || 22}%).`)
        }
      })

      if (!bundle.guard.allowed) {
        const blocker = bundle.guard.blockingIssues[0] || 'Commit demo 24E bloccato.'
        console.warn(`[TEST_LAB_COMMIT_BLOCKED] documento=${activeWorkingViewModel?.parsedDocument?.numeroDocumento || workingViewRowId}, societa=${selectedSocietaForDemo?.codice || ''}, motivo=${blocker}`)
        showActionBanner('warning', blocker)
        setDemoCommitBusy(false)
        return
      }

      const payloadBlockers = [
        ...(Array.isArray(bundle.packaged.validation?.blockers) ? bundle.packaged.validation.blockers : []),
        ...(Array.isArray(bundle.directValidation?.blockers) ? bundle.directValidation.blockers : []),
      ]
      if (payloadBlockers.length) {
        const blocker = payloadBlockers[0]
        console.warn(`[TEST_LAB_COMMIT_BLOCKED] documento=${activeWorkingViewModel?.parsedDocument?.numeroDocumento || workingViewRowId}, societa=${selectedSocietaForDemo?.codice || ''}, motivo=${blocker}`)
        showActionBanner('warning', blocker)
        setDemoCommitBusy(false)
        return
      }

      const commitResult = await runCommitWorkflow(bundle.commitEnvelope, { db: sb })
      if (!commitResult.success) {
        const blocker = commitResult.blockingReasons?.[0] || 'Commit demo fallito.'
        console.warn(`[TEST_LAB_COMMIT_BLOCKED] documento=${activeWorkingViewModel?.parsedDocument?.numeroDocumento || workingViewRowId}, societa=${selectedSocietaForDemo?.codice || ''}, motivo=${blocker}`)
        
        const failReport = {
          ok: false,
          blockingReasons: commitResult.blockingReasons || [],
        }
        setDemoCommitReport(failReport)
        showActionBanner('error', blocker)
        setDemoCommitBusy(false)
        return
      }

      const committedKey = workingViewRowId
      const nextRows = stagingRows.map((row) => {
        if (getRowKey(row) !== committedKey) return row
        return {
          ...row,
          state: 'committed',
          stato: 'committed',
          committed: true,
          primaNotaId: commitResult.primaNotaId || null,
        }
      })
      persistRowsChange(nextRows, selectedRowIds)

      const reportText = formatDemoWorkingViewCommitReport(commitResult, {
        numeroDocumento: activeWorkingViewModel?.parsedDocument?.numeroDocumento,
        unselectedCount: Math.max(0, stagingRows.length - 1),
      })
      setDemoCommitReport({ ok: true, text: reportText, ...commitResult })
      showActionBanner(
        'success',
        `Documento demo contabilizzato: ${activeWorkingViewModel?.parsedDocument?.numeroDocumento || committedKey}.`,
      )
      window.alert(reportText)

      // Transition to next active document in session if any
      const currentQueue = workingViewRowIds || []
      const currentIdx = currentQueue.indexOf(committedKey)
      
      const getNextActiveIdInQueue = (queue, currentIndex, rows) => {
        const getRowState = (key) => {
          const r = rows.find(x => getRowKey(x) === key)
          return r ? r.state || r.stato : ''
        }
        for (let i = currentIndex + 1; i < queue.length; i++) {
          const key = queue[i]
          const state = getRowState(key)
          if (state !== 'committed' && state !== 'registered') {
            return key
          }
        }
        for (let i = 0; i < currentIndex; i++) {
          const key = queue[i]
          const state = getRowState(key)
          if (state !== 'committed' && state !== 'registered') {
            return key
          }
        }
        return null
      }

      const nextActiveId = getNextActiveIdInQueue(currentQueue, currentIdx, nextRows)
      if (nextActiveId) {
        setWorkingViewRowId(nextActiveId)
      } else {
        showActionBanner(
          'success',
          'Sessione completata. Tutti i documenti selezionati sono stati gestiti.'
        )
      }
    } catch (err) {
      console.error(`[TEST_LAB_COMMIT_ERROR] Errore imprevisto nel commit: ${err?.message || err}`)
      showActionBanner('error', `Commit demo 24E fallito: ${err?.message || err}`)
    } finally {
      setDemoCommitBusy(false)
    }
  }

  const onGoToPreviousWorkingViewRow = () => {
    if (!hasPreviousWorkingViewRow) return
    const nextId = workingViewRowIds[workingViewCurrentIndex - 1]
    if (!nextId) return
    setWorkingViewRowId(nextId)
  }

  const onGoToNextWorkingViewRow = () => {
    if (!hasNextWorkingViewRow) return
    const nextId = workingViewRowIds[workingViewCurrentIndex + 1]
    if (!nextId) return
    setWorkingViewRowId(nextId)
  }

  const onSelectReadyRows = () => {
    const readyRows = stagingRows.filter((row) => {
      const key = getRowKey(row)
      return Boolean(workingTableReadinessByRowId[key]?.ready)
    })
    if (!readyRows.length) {
      showActionBanner('warning', 'Nessuna riga pronta trovata.')
      return
    }
    updateSelectedRows(new Set(readyRows.map((row) => getRowKey(row))))
    showActionBanner('success', `${readyRows.length} righe pronte selezionate.`)
  }

  const getReimportRowKey = (row) => getRowKey(row) || String(row?.sourceHash || row?.filename || '')

  const toggleReimportSelection = (row) => {
    const key = getReimportRowKey(row)
    if (!key) return
    setReimportSelectedRowIds((current) => {
      const next = new Set(current)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const onAddSelectedReimports = () => {
    if (!report) {
      showActionBanner('warning', 'Nessun report disponibile per il reimport.')
      return
    }
    if (!reimportSelectedRowIds.size) {
      showActionBanner('warning', 'Seleziona almeno una riga reimportabile.')
      return
    }

    const candidateRows = [
      ...(Array.isArray(report.deletedInStagingRows) ? report.deletedInStagingRows : []),
      ...(Array.isArray(report.deletedInAccountingRows) ? report.deletedInAccountingRows : []),
    ]
    const selectedKeys = new Set(reimportSelectedRowIds)
    const selectedRows = candidateRows.filter((row) => selectedKeys.has(getReimportRowKey(row)))

    if (!selectedRows.length) {
      showActionBanner('warning', 'Nessuna riga reimportabile selezionata.')
      return
    }

    const existingFingerprints = new Set(stagingRows.map((row) => getStableRowFingerprint(row)))
    const nextRows = stagingRows.slice()
    let added = 0
    let skipped = 0

    selectedRows.forEach((row, index) => {
      const parsedDoc = buildReimportParsedDocSnapshot(row)
      const fingerprint = getStableRowFingerprint(parsedDoc)
      if (!fingerprint || existingFingerprints.has(fingerprint)) {
        skipped += 1
        return
      }

      const stagingRow = buildStagingRow(parsedDoc, {
        batchId: result?.batchId || report?.batchId || '',
        id: `reimport-${fingerprint || getReimportRowKey(row) || `${index + 1}`}`,
        filename: parsedDoc.filename || row?.filename || '',
      })

      stagingRow.userNotes = stagingRow.userNotes
        ? `${stagingRow.userNotes} | reimport locale`
        : 'reimport locale'

      nextRows.push(stagingRow)
      existingFingerprints.add(fingerprint)
      added += 1
    })

    if (!added) {
      setReimportSelectedRowIds(new Set())
      showActionBanner('warning', skipped ? 'Le righe selezionate erano Già presenti in staging.' : 'Nessuna riga aggiunta.')
      return
    }

    persistRowsChange(nextRows, selectedRowIds)
    setReimportSelectedRowIds(new Set())
    showActionBanner(
      'success',
      skipped
        ? `${added} righe reimport aggiunte, ${skipped} già presenti saltate.`
        : `${added} righe reimport aggiunte alla working table locale.`,
    )
  }

  const onPlaceholderAction = (label = 'Azione') => {
    showActionBanner('neutral', `${label} non ancora disponibile in questa fase.`)
  }

  const handleGoToSelection = (target) => {
    setShowGoToMenu(false)
    if (target === 'contabilita' && typeof onNavigate === 'function') {
      onNavigate('contabilita')
      return
    }
    if (target === 'piano_conti' && typeof onNavigate === 'function') {
      onNavigate('piano_conti')
      return
    }
    if (target === 'clienti' && typeof onNavigate === 'function') {
      onNavigate('clienti')
      return
    }
    onPlaceholderAction(target === 'percipienti' ? 'Percipienti' : 'Vai a')
  }

  const handleToolsSelection = (target) => {
    setShowToolsMenu(false)
    if (target === 'columns') {
      onPlaceholderAction('Colonne')
      return
    }
    if (target === 'csv') {
      onPlaceholderAction('Export CSV')
      return
    }
    if (target === 'excel') {
      onPlaceholderAction('Export Excel')
    }
  }

  const onApplyRegistrationDate = () => {
    const nextDate = normalizeText(registrationDateDraft || registrationDateInputRef.current?.value)
    if (!nextDate || !selectedCount) return
    const next = {
      ...(manualRegistrationDateByRowId || {}),
    }
    selectedRowIds.forEach((rowId) => {
      next[rowId] = nextDate
    })
    setManualRegistrationDateByRowId(next)
    persistSocietaState(result, manualAccountByRowId, manualCausaleByRowId, next, anagraficheDecisioniByKey, percipientiDecisioniByKey)
  }

  const onApplyContoBulk = () => {
    if (!selectedCount) return
    setBulkSearchTerm('')
    setBulkContoPickerOpen(true)
  }

  const handleApplyContoBulkSelect = (conto) => {
    if (!conto?.id) {
      alert('Errore: PK reale del conto mancante.')
      return
    }
    setBulkContoPickerOpen(false)
    const selectedIds = Array.from(selectedRowIds)
    const rowCount = selectedIds.length

    const msg = `Stai per applicare il conto "${conto.codice} - ${conto.descrizione}" a ${rowCount} righe selezionate.\n\nVuoi procedere?`
    if (!window.confirm(msg)) return

    const nextAccounts = { ...manualAccountByRowId }
    selectedIds.forEach((id) => {
      nextAccounts[id] = {
        id: conto.id,
        codice: conto.codice,
        descrizione: conto.descrizione,
      }
    })

    setManualAccountByRowId(nextAccounts)
    persistSocietaState(
      result,
      nextAccounts,
      manualCausaleByRowId,
      manualRegistrationDateByRowId,
      anagraficheDecisioniByKey,
      percipientiDecisioniByKey,
      automationMetaByRowId
    )
    showActionBanner('success', `Conto applicato con successo a ${rowCount} righe.`)
  }

  const onApplyCausaleBulk = () => {
    if (!selectedCount) return
    setBulkSearchTerm('')
    setBulkCausalePickerOpen(true)
  }

  const handleApplyCausaleBulkSelect = (causale) => {
    setBulkCausalePickerOpen(false)
    const selectedIds = Array.from(selectedRowIds)
    const rowCount = selectedIds.length

    const policy = buildCausaleContabilePolicy(causale)

    // Find any selected documents that are note credito (TD04/TD08) where this causale is incompatible
    const incompatibleRows = []
    const allRows = Array.isArray(stagingRows) ? stagingRows : []
    const rowsMap = new Map(allRows.map((r) => [String(r.id || r.filename || ''), r]))

    selectedIds.forEach((id) => {
      const row = rowsMap.get(id)
      if (!row) return
      const tipoDoc = String(row?.parsedDocument?.tipoDocumento || '').trim().toUpperCase()
      const isNotaCreditoDoc = tipoDoc === 'TD04' || tipoDoc === 'TD08'
      
      const isIncompatible = isNotaCreditoDoc && (!policy.notaCredito || policy.isFatturaPassiva || policy.isFatturaAttiva)
      if (isIncompatible) {
        incompatibleRows.push(row)
      }
    })

    if (incompatibleRows.length > 0) {
      let warningMsg = `Attenzione: alcuni documenti selezionati risultano note credito, ma stai applicando una causale da fattura ordinaria/incompatibile. Verifica prima di confermare.\n\n`
      warningMsg += `Documenti incompatibili (${incompatibleRows.length}):\n`
      incompatibleRows.slice(0, 10).forEach((row) => {
        const docNum = row?.parsedDocument?.numeroDocumento || 'Senza numero'
        const docDate = row?.parsedDocument?.dataDocumento || 'Senza data'
        const supplierName = row?.parsedDocument?.fornitore?.denominazione || 'Senza fornitore'
        warningMsg += `- N. ${docNum} del ${docDate} (${supplierName})\n`
      })
      if (incompatibleRows.length > 10) {
        warningMsg += `... e altri ${incompatibleRows.length - 10} documenti.\n`
      }
      warningMsg += `\nVuoi confermare comunque l'applicazione della causale "${causale.codice} - ${causale.descrizione}"?`
      if (!window.confirm(warningMsg)) return
    } else {
      const msg = `Stai per applicare la causale "${causale.codice} - ${causale.descrizione}" a ${rowCount} righe selezionate.\n\nVuoi procedere?`
      if (!window.confirm(msg)) return
    }

    const nextCausali = { ...manualCausaleByRowId }
    selectedIds.forEach((id) => {
      nextCausali[id] = {
        id: causale.id,
        codice: causale.codice,
        descrizione: causale.descrizione,
      }
    })

    setManualCausaleByRowId(nextCausali)
    persistSocietaState(
      result,
      manualAccountByRowId,
      nextCausali,
      manualRegistrationDateByRowId,
      anagraficheDecisioniByKey,
      percipientiDecisioniByKey,
      automationMetaByRowId
    )
    showActionBanner('success', `Causale applicata con successo a ${rowCount} righe.`)
  }


  const renderReimportList = (title, rows) => {
    if (!Array.isArray(rows) || !rows.length) return null

    return (
      <div
        style={{
          borderRadius: 8,
          border: '1px solid rgba(124, 157, 202, .12)',
          background: 'rgba(255,255,255,.015)',
          padding: '.2rem .24rem',
          display: 'grid',
          gap: '.16rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.3rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.66rem' }}>{title}</strong>
          <span style={{ color: 'var(--mu)', fontSize: '.6rem' }}>{formatCount(rows.length)} righe</span>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540 }}>
            <thead>
              <tr>
                <Th align="center" style={{ width: 76, background: 'rgba(0,0,0,.14)' }}>Reimporta</Th>
                <Th>Documento</Th>
                <Th>Data</Th>
                <Th align="right">Totale</Th>
                <Th>Motivo</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const key = getReimportRowKey(row)
                const checked = reimportSelectedRowIds.has(key)
                const parsedDocSnapshot = buildReimportParsedDocSnapshot(row)
                const alreadyAdded = stagingRows.some((existingRow) => getStableRowFingerprint(existingRow) === getStableRowFingerprint(parsedDocSnapshot))
                const docLabel = [
                  row?.tipoDocumento || row?.tipo_documento || '',
                  row?.numeroDocumento || row?.numero_documento || '',
                ]
                  .filter(Boolean)
                  .join(' · ')
                return (
                  <tr
                    key={key || `${title}-${index}`}
                    style={{
                      background: checked || alreadyAdded ? 'rgba(84,141,212,.08)' : 'transparent',
                      opacity: alreadyAdded ? .76 : 1,
                    }}
                  >
                    <Td align="center">
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={alreadyAdded}
                        onChange={() => toggleReimportSelection(row)}
                      />
                    </Td>
                    <Td>
                      <div style={{ display: 'grid', gap: '.02rem' }}>
                        <strong style={{ fontSize: '.68rem' }}>{docLabel || row?.filename || '-'}</strong>
                        <span style={{ color: 'var(--mu)', fontSize: '.58rem' }}>{row?.filename || row?.sourceHash || '-'}</span>
                      </div>
                    </Td>
                    <Td style={{ fontSize: '.64rem' }}>{row?.dataDocumento || '-'}</Td>
                    <Td align="right">{formatMoney(row?.totale)}</Td>
                    <Td>
                      <div style={{ display: 'grid', gap: '.08rem' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '.1rem .22rem',
                            borderRadius: 999,
                            border: '1px solid rgba(255,193,7,.22)',
                            background: 'rgba(255,193,7,.08)',
                            color: '#ffe9a8',
                            fontSize: '.58rem',
                            fontWeight: 700,
                          }}
                        >
                          {formatDedupReasonLabel(row?.reasonCode || row?.classification)}
                        </span>
                        {alreadyAdded ? (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              padding: '.08rem .2rem',
                              borderRadius: 999,
                              border: '1px solid rgba(84,141,212,.22)',
                              background: 'rgba(84,141,212,.08)',
                              color: '#bfd4ff',
                              fontSize: '.56rem',
                              fontWeight: 700,
                            }}
                          >
                            Già aggiunta
                          </span>
                        ) : null}
                      </div>
                    </Td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    )
  }

  const onSelectViewMode = (nextViewMode) => {
    setViewMode(nextViewMode)
  }

  const onSelectQuickFilter = (nextQuickFilter) => {
    if (nextQuickFilter === QUICK_FILTERS.sameSupplier && !selectedCount) return
    if (nextQuickFilter === QUICK_FILTERS.sameAccount) return
    setQuickFilter(nextQuickFilter)
  }

  const closeWorkingView = () => {
    setWorkingViewOpen(false)
    setWorkingViewRowId('')
    setWorkingViewRowIds([])
    setWorkingViewTab('prima_nota')
  }

  const onApplyToBatch = ({ scope, fields, values }) => {
    const currentKey = String(activeWorkingViewModel?.rowKey || '')
    const allRows = Array.isArray(stagingRows) ? stagingRows : []
    const visibleKeySet = new Set((Array.isArray(visibleRows) ? visibleRows : []).map((r) => String(r?.id || r?.filename || '')))
    const currentCp = activeWorkingViewModel?.counterparty || {}
    const refPiva = normalizeAnagraficaIdentifier(currentCp.partitaIva)
    const refCf = normalizeAnagraficaIdentifier(currentCp.codiceFiscale)
    const refName = normalizeAnagraficaText(currentCp.denominazione)

    const normalizeBatchIvaRate = (value) => {
      const numeric = Number(String(value ?? '').replace(',', '.'))
      if (!Number.isFinite(numeric)) return 0
      return Math.round(numeric * 10000) / 10000
    }
    const normalizeBatchIvaNature = (value) => String(value || '').trim().toUpperCase()
    const getBatchIvaSignature = (row) => `${normalizeBatchIvaNature(row?.natura)}::${normalizeBatchIvaRate(row?.aliquota)}`
    const buildBatchIvaStructureMap = (rows = []) => {
      const structure = new Map()
      rows.forEach((row) => {
        const signature = getBatchIvaSignature(row)
        structure.set(signature, (structure.get(signature) || 0) + 1)
      })
      return structure
    }
    const haveCompatibleIvaStructure = (sourceRows = [], targetRows = []) => {
      if (!Array.isArray(sourceRows) || !sourceRows.length) return false
      if (!Array.isArray(targetRows) || targetRows.length !== sourceRows.length) return false
      const sourceMap = buildBatchIvaStructureMap(sourceRows)
      const targetMap = buildBatchIvaStructureMap(targetRows)
      if (sourceMap.size !== targetMap.size) return false
      for (const [signature, count] of sourceMap.entries()) {
        if (targetMap.get(signature) !== count) return false
      }
      return true
    }

    const sourceIvaRows = Array.isArray(values?.ivaRows) ? values.ivaRows : []
    const shouldApplyIva = Boolean(fields?.iva && sourceIvaRows.length)
    const appliedFields = [
      fields?.account && values?.account ? 'account' : null,
      fields?.causale && values?.causale ? 'causale' : null,
      fields?.date && values?.date ? 'date' : null,
      shouldApplyIva ? 'iva' : null,
    ].filter(Boolean)

    let excludedLocked = 0
    let excludedManual = 0
    let excludedIvaIncompatible = 0
    const candidates = []
    for (const row of allRows) {
      const key = String(row?.id || row?.filename || '')
      if (key === currentKey) continue
      if (row.state === 'registered' || row.state === 'locked') {
        excludedLocked += 1
        continue
      }

      let inScope = false
      if (scope === 'same_counterparty') {
        const preferred = getPreferredCounterparty(row.parsedDocument || {})
        const cp = preferred?.counterparty || {}
        const piva = normalizeAnagraficaIdentifier(cp.partitaIva)
        const cf = normalizeAnagraficaIdentifier(cp.codiceFiscale)
        const name = normalizeAnagraficaText(cp.denominazione)
        if (refPiva && piva && refPiva === piva) inScope = true
        else if (refCf && cf && refCf === cf) inScope = true
        else if (refName && name && refName === name) inScope = true
      } else if (scope === 'selected') {
        inScope = selectedRowIds instanceof Set ? selectedRowIds.has(key) : false
      } else if (scope === 'visible') {
        inScope = visibleKeySet.has(key)
      } else if (scope === 'incomplete') {
        const account = manualAccountByRowId[key] || null
        const causale = manualCausaleByRowId[key] || null
        const cacc = counterpartyAccountByRowId[key] || null
        const readiness = getWorkingTableRowReadiness(row, account, causale, cacc)
        inScope = readiness.status !== 'ready'
      } else if (scope === 'all') {
        inScope = true
      }

      if (!inScope) continue
      if (fields.account && values.account && manualAccountByRowId[key]) {
        excludedManual += 1
        continue
      }
      if (fields.causale && values.causale && manualCausaleByRowId[key]) {
        excludedManual += 1
        continue
      }
      if (shouldApplyIva) {
        const targetIvaRows = Array.isArray(row?.parsedDocument?.ivaRows) ? row.parsedDocument.ivaRows : []
        if (!haveCompatibleIvaStructure(sourceIvaRows, targetIvaRows)) {
          excludedIvaIncompatible += 1
          continue
        }
      }
      candidates.push({ key, row })
    }

    if (!candidates.length) {
      const incompatibilityNote = excludedIvaIncompatible ? ` ${excludedIvaIncompatible} escluse per struttura IVA non compatibile.` : ''
      showActionBanner('warning', `Nessuna fattura aggiornata con i criteri selezionati.${incompatibilityNote}`)
      return { applied: 0, total: 0, excludedLocked, excludedManual, excludedIvaIncompatible }
    }

    const candidateKeys = new Set(candidates.map((item) => item.key))
    const nextManualAccountMap = (fields.account && values.account)
      ? (() => {
        const next = { ...manualAccountByRowId }
        candidates.forEach(({ key }) => {
          next[key] = values.account
        })
        return next
      })()
      : manualAccountByRowId

    const nextManualCausaleMap = (fields.causale && values.causale)
      ? (() => {
        const next = { ...manualCausaleByRowId }
        candidates.forEach(({ key }) => {
          next[key] = values.causale
        })
        return next
      })()
      : manualCausaleByRowId

    const nextManualRegistrationDateMap = (fields.date && values.date)
      ? (() => {
        const next = { ...manualRegistrationDateByRowId }
        candidates.forEach(({ key }) => {
          next[key] = values.date
        })
        return next
      })()
      : manualRegistrationDateByRowId

    const nextAutomationMetaMap = appliedFields.length
      ? (() => {
        const next = { ...automationMetaByRowId }
        const nowIso = new Date().toISOString()
        const sourceLabel = normalizeText(activeWorkingViewModel?.fornitoreCliente || activeWorkingViewModel?.filename || '')
        candidates.forEach(({ key }) => {
          const previous = next[key] && typeof next[key] === 'object' ? next[key] : {}
          const previousFields = Array.isArray(previous.fields) ? previous.fields.filter(Boolean) : []
          const mergedFields = Array.from(new Set([...previousFields, ...appliedFields]))
          next[key] = {
            ...previous,
            fields: mergedFields,
            sourceRowKey: currentKey || previous.sourceRowKey || '',
            sourceLabel: sourceLabel || previous.sourceLabel || '',
            appliedAt: nowIso,
          }
        })
        return next
      })()
      : automationMetaByRowId

    let nextResult = result
    if (shouldApplyIva && result && Array.isArray(result.stagingRows)) {
      const sourceRowsBySignature = new Map()
      sourceIvaRows.forEach((row) => {
        const signature = getBatchIvaSignature(row)
        if (!sourceRowsBySignature.has(signature)) sourceRowsBySignature.set(signature, [])
        sourceRowsBySignature.get(signature).push(row)
      })

      nextResult = {
        ...result,
        stagingRows: result.stagingRows.map((row) => {
          const key = String(row?.id || row?.filename || '')
          if (!candidateKeys.has(key)) return row

          const targetIvaRows = Array.isArray(row?.parsedDocument?.ivaRows) ? row.parsedDocument.ivaRows : []
          const signatureCursor = new Map()
          const nextIvaRows = targetIvaRows.map((targetRow) => {
            const signature = getBatchIvaSignature(targetRow)
            const sourceGroup = sourceRowsBySignature.get(signature) || []
            const currentIndex = signatureCursor.get(signature) || 0
            const sourceRow = sourceGroup[currentIndex] || sourceGroup[sourceGroup.length - 1] || null
            signatureCursor.set(signature, currentIndex + 1)
            if (!sourceRow) return targetRow

            const nextCausaleIvaId = String(sourceRow?.causaleIvaId || sourceRow?.causale_iva_id || '').trim()
            return {
              ...targetRow,
              causaleIvaId: nextCausaleIvaId || targetRow?.causaleIvaId || '',
              causale_iva_id: nextCausaleIvaId || targetRow?.causale_iva_id || targetRow?.causaleIvaId || '',
              esigibilita: sourceRow?.esigibilita || targetRow?.esigibilita || '',
            }
          })

          return {
            ...row,
            parsedDocument: {
              ...(row?.parsedDocument || {}),
              ivaRows: nextIvaRows,
            },
          }
        }),
      }
    }

    if (nextManualAccountMap !== manualAccountByRowId) setManualAccountByRowId(nextManualAccountMap)
    if (nextManualCausaleMap !== manualCausaleByRowId) setManualCausaleByRowId(nextManualCausaleMap)
    if (nextManualRegistrationDateMap !== manualRegistrationDateByRowId) setManualRegistrationDateByRowId(nextManualRegistrationDateMap)
    if (nextAutomationMetaMap !== automationMetaByRowId) setAutomationMetaByRowId(nextAutomationMetaMap)
    if (nextResult !== result) setResult(nextResult)

    persistSocietaState(
      nextResult,
      nextManualAccountMap,
      nextManualCausaleMap,
      nextManualRegistrationDateMap,
      anagraficheDecisioniByKey,
      percipientiDecisioniByKey,
      nextAutomationMetaMap,
    )

    const appliedCount = candidates.length
    const extraNote = excludedIvaIncompatible ? ` ${excludedIvaIncompatible} escluse per IVA non compatibile.` : ''
    showActionBanner('success', `Applica a...: aggiornate ${appliedCount} fattur${appliedCount === 1 ? 'a' : 'e'}.${extraNote}`)
    return { applied: appliedCount, total: appliedCount, excludedLocked, excludedManual, excludedIvaIncompatible }
  }

  const isWorkingViewMode = workingViewOpen && activeWorkingViewModel
  const isWidePreviewLayout = typeof window === 'undefined' ? true : window.innerWidth >= 1320

  if (isWorkingViewMode) {
    return (
      <ImportContabilitaWorkingView
        activeWorkingViewModel={activeWorkingViewModel}
        activeWorkingViewChecks={activeWorkingViewChecks}
        workingViewTab={workingViewTab}
        setWorkingViewTab={setWorkingViewTab}
        closeWorkingView={closeWorkingView}
        onGoToPreviousWorkingViewRow={onGoToPreviousWorkingViewRow}
        onGoToNextWorkingViewRow={onGoToNextWorkingViewRow}
        hasPreviousWorkingViewRow={hasPreviousWorkingViewRow}
        hasNextWorkingViewRow={hasNextWorkingViewRow}
        workingViewCurrentIndex={workingViewCurrentIndex}
        workingViewTotal={workingViewTotal}
        workingTableReadyCount={workingTableReadyCount}
        workingTableIncompleteCount={workingTableIncompleteCount}
        selectedCount={selectedCount}
        onStartAccounting={onStartAccounting}
        ActionButton={ActionButton}
        MessageBox={MessageBox}
        MetaPill={MetaPill}
        BadgePlaceholder={BadgePlaceholder}
        PANEL_STYLE={PANEL_STYLE}
        formatMoney={formatMoney}
        formatDateOnly={formatDateOnly}
        formatCount={formatCount}
        pianoConti={pianoConti}
        formatManualAccount={formatManualAccount}
        formatManualCausale={formatManualCausale}
        causaliContabili={causaliContabili}
        causaliIva={workingViewCausaliIva}
        isDemoSocieta={isSelectedDemoSocieta}
        onCommitDemoWorkingView={handleDemoWorkingViewCommit}
        commitBusy={demoCommitBusy}
        isCommittingDemoDocument={demoCommitBusy}
        demoCommitReport={demoCommitReport}
        getCounterpartyDisplayInfo={getCounterpartyDisplayInfo}
        onPlaceholderAction={onPlaceholderAction}
        stagingRows={stagingRows}
        visibleRows={visibleRows}
        selectedRowIds={selectedRowIds}
        manualAccountByRowId={manualAccountByRowId}
        manualCausaleByRowId={manualCausaleByRowId}
        manualRegistrationDateByRowId={manualRegistrationDateByRowId}
        automationMetaByRowId={automationMetaByRowId}
        onApplyToBatch={onApplyToBatch}
        updateManualAccountForRow={updateManualAccountForRow}
        updateManualCausaleForRow={updateManualCausaleForRow}
      />
    )
  }

  const activeTopDetail = showAnagraficheDetails ? 'anagrafiche' : showImportReportDetails ? 'report' : ''
  const topCardsTemplateColumns = activeTopDetail === 'anagrafiche'
    ? 'minmax(220px, .72fr) minmax(0, 2.08fr) minmax(200px, .64fr)'
    : activeTopDetail === 'report'
      ? 'minmax(240px, .84fr) minmax(220px, .76fr) minmax(0, 1.4fr)'
      : 'repeat(3, minmax(0, 1fr))'
  const headerMetrics = {
    fileInCoda: formatCount(lastFileCount),
    visibili: formatCount(visibleRows.length),
    complete: formatCount(workingTableReadyCount),
    incomplete: formatCount(workingTableIncompleteCount),
    ultimoImport: formatDateTime(report?.finishedAt || report?.startedAt || result?.finishedAt || result?.startedAt),
  }

  return (
      <div
      style={{
        padding: '.28rem .32rem .5rem',
        maxWidth: 1680,
        margin: '0 auto',
        background: 'radial-gradient(circle at top left, rgba(59,130,246,.08), transparent 34%), linear-gradient(180deg, #081b2d 0%, #071827 100%)',
      }}
    >
      <input ref={fileInputRef} type="file" multiple accept=".xml,.p7m,.zip" onChange={onFilesChange} style={{ display: 'none' }} />
      <ImportContabilitaHeader
        ActionButton={ActionButton}
        busy={busy}
        selectedSocietaId={selectedSocietaId}
        societaLoading={societaLoading}
        societaOptions={societaOptions}
        onSocietaChange={(event) => {
          const nextId = event.target.value
          setSelectedSocietaId(nextId)
          setErrorMsg('')
        }}
        onTriggerFilePicker={triggerFilePicker}
        onAnalyze={onAnalyze}
        showGoToMenu={showGoToMenu}
        onToggleGoToMenu={() => setShowGoToMenu((current) => !current)}
        onGoToSelection={handleGoToSelection}
      />

      {actionBanner ? (
        <MessageBox tone={actionBanner.tone === 'success' ? 'success' : actionBanner.tone === 'warning' ? 'warning' : 'neutral'}>
          {actionBanner.text}
        </MessageBox>
      ) : null}

      {busy ? (
        <LoadingPane label={busyLabel} />
      ) : errorMsg ? (
        <MessageBox tone="error">{errorMsg}</MessageBox>
      ) : null}

      <ImportContabilitaKpiBar
        ActionButton={ActionButton}
        busy={busy}
        fileInCoda={headerMetrics.fileInCoda}
        visibili={headerMetrics.visibili}
        complete={headerMetrics.complete}
        incomplete={headerMetrics.incomplete}
        ultimoImport={headerMetrics.ultimoImport}
        onCronologiaImport={() => onPlaceholderAction('Cronologia import')}
      />

      <section
        style={{
          ...PANEL_STYLE,
          borderRadius: 16,
          padding: '.24rem .24rem',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) auto',
          gap: '.34rem',
          alignItems: 'center',
          background: 'linear-gradient(180deg, rgba(9,24,40,.98), rgba(8,20,34,.96))',
          border: '1px solid rgba(96,165,250,.14)',
          boxShadow: '0 16px 36px rgba(0,0,0,.16)',
          marginTop: '.16rem',
        }}
      >
        {!busy && !errorMsg && result?.ok && report ? (
            <>
              <ImportContabilitaOverviewCards
                ActionButton={ActionButton}
                MetaPill={MetaPill}
                busy={busy}
                errorMsg={errorMsg}
                result={result}
                report={report}
                topCardsTemplateColumns={topCardsTemplateColumns}
                triggerFilePicker={triggerFilePicker}
                filesLabel={filesLabel}
                selectedCount={selectedCount}
                selectedSocietaName={selectedSocietaName}
                lastFileCount={lastFileCount}
                visibleRowsCount={visibleRows.length}
                workingTableReadyCount={workingTableReadyCount}
                workingTableIncompleteCount={workingTableIncompleteCount}
                formatCount={formatCount}
                lastImportLabel={formatDateTime(report?.finishedAt || report?.startedAt || result?.finishedAt || result?.startedAt)}
                stagingRowsLength={stagingRows.length}
                anagraficheStats={anagraficheStats}
                anagraficheUiRows={anagraficheUiRows}
                showAnagraficheDetails={showAnagraficheDetails}
                setShowAnagraficheDetails={setShowAnagraficheDetails}
                showImportReportDetails={showImportReportDetails}
                setShowImportReportDetails={setShowImportReportDetails}
                confirmAnagraficheDecisioni={confirmAnagraficheDecisioni}
                ignoredOperationalRowsLength={ignoredOperationalRows.length}
                onHideIgnoredAnagrafiche={onHideIgnoredAnagrafiche}
                percipientiLoading={percipientiLoading}
                percipientiError={percipientiError}
                anagraficheTipoFiltro={anagraficheTipoFiltro}
                onAddSelectedReimports={onAddSelectedReimports}
                selectedReimportCount={selectedReimportCount}
                renderReimportList={renderReimportList}
              >
              {showImportReportDetails ? (
                <ImportContabilitaReportDetail
                  reportData={{
                    report,
                    selectedSocietaName,
                    batchId: report.batchId || result.batchId || '-',
                    stagingRowsLength: stagingRows.length,
                    selectedReimportCount,
                    busy,
                    onAddSelectedReimports,
                  }}
                  reportHelpers={{
                    ActionButton,
                    MetricChip,
                    MessageBox,
                    formatCount,
                    renderReimportList,
                  }}
                />
              ) : null}

              {anagraficheStats.total ? (
                showAnagraficheDetails ? (
                  <ImportContabilitaAnagraficheDetail
                    anagraficheData={{
                      anagraficheVisibleRows,
                      anagraficheUiRows,
                      anagraficheVisibleCount,
                      setAnagraficheVisibleCount,
                      anagraficheStats,
                      anagraficheDecisioniByKey,
                      pianoConti,
                      percipienti,
                      busy,
                      percipientiLoading,
                      anagraficheTipoFiltro,
                      anagraficaAllowedAccountsIndex,
                      anagraficaAccountUpdateBusyKey,
                      percipienteActionBusyKey,
                      previewRowId,
                      setPreviewTab,
                      setPreviewRowId,
                      isInteractiveRowTarget,
                    }}
                    anagraficheHelpers={{
                      ActionButton,
                      MessageBox,
                      Th,
                      Td,
                      formatCount,
                      normalizeText,
                      getAnagraficaRowKey,
                      normalizeAnagraficaDecisionKey,
                      mergeAnagraficaDecision,
                      validateAnagraficaDecision,
                      getAnagraficaDecisionStateTone,
                      buildPercipienteStatusForAnagraficaRow,
                      getAllowedMastriniForTipo,
                      getIndexedAllowedAccounts,
                      resolveIndexedAllowedAccount,
                      formatAnagraficaAccountOption,
                      formatAnagraficaIdentifiers,
                      getAnagraficaDetectionNote,
                      setAnagraficaTipoForRow,
                      setAnagraficaMastrinoForRow,
                      setAnagraficaAzioneForRow,
                      getAnagraficaTipoOptions,
                      getAnagraficaDecisionActionOptions,
                      getDefaultMastrinoForTipo,
                      buildMissingAccountUpdates,
                      onConfirmExistingPercipienteForRow,
                      onCreatePercipienteForRow,
                      onSelectExistingAnagraficaAccount,
                      onUpdateExistingAnagraficaAccount,
                      onConfirmSingleAnagrafica,
                      AnagraficaExistingAccountPicker,
                    }}
                  />
                ) : (
                  <MessageBox tone="neutral">Sezione compressa: {formatCount(anagraficheStats.total)} anagrafiche rilevate.</MessageBox>
                )
              ) : !pianoContiLoading && !pianoContiError && stagingRows.length ? (
                <MessageBox tone="neutral">Nessuna nuova anagrafica rilevata.</MessageBox>
              ) : null}
            </ImportContabilitaOverviewCards>
            <section
              style={{
                gridColumn: '1 / -1',
                width: '100%',
                borderRadius: 18,
                border: '1px solid rgba(96,165,250,.18)',
                background: 'linear-gradient(180deg, rgba(17,40,61,.95), rgba(12,27,43,.92))',
                overflow: 'hidden',
                boxShadow: '0 14px 28px rgba(0,0,0,.14)',
                }}
              >
              <ImportContabilitaWorkingTableToolbar
                ActionButton={ActionButton}
                MetaPill={MetaPill}
                SearchField={SearchField}
                ViewToggle={ViewToggle}
                BUTTON_BASE={BUTTON_BASE}
                busy={busy}
                visibleRows={visibleRows}
                selectedCount={selectedCount}
                allVisibleSelected={allVisibleSelected}
                onToggleVisibleSelection={onToggleVisibleSelection}
                viewMode={viewMode}
                VIEW_MODES={VIEW_MODES}
                onSelectViewMode={onSelectViewMode}
                quickFilter={quickFilter}
                QUICK_FILTERS={QUICK_FILTERS}
                onSelectQuickFilter={onSelectQuickFilter}
                onPlaceholderAction={onPlaceholderAction}
                searchTerm={searchTerm}
                setSearchTerm={setSearchTerm}
                showToolsMenu={showToolsMenu}
                setShowToolsMenu={setShowToolsMenu}
                handleToolsSelection={handleToolsSelection}
                registrationDateDraft={registrationDateDraft}
                setRegistrationDateDraft={setRegistrationDateDraft}
                registrationDateInputRef={registrationDateInputRef}
                onApplyRegistrationDate={onApplyRegistrationDate}
                workingTableReadyCount={workingTableReadyCount}
                onSelectAllVisible={onSelectAllVisible}
                onDeselectAll={onDeselectAll}
                onDeleteSelectedRows={onDeleteSelectedRows}
                onStartAccounting={onStartAccounting}
                hasActiveWorkingTableColumnFilters={hasActiveWorkingTableColumnFilters}
                activeWorkingTableColumnFilters={activeWorkingTableColumnFilters}
                clearAllWorkingTableColumnFilters={clearAllWorkingTableColumnFilters}
                onApplyContoBulk={onApplyContoBulk}
                onApplyCausaleBulk={onApplyCausaleBulk}
              />
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: previewRow && isWidePreviewLayout
                    ? 'minmax(0, 1fr) minmax(420px, 480px)'
                    : 'minmax(0, 1fr)',
                  gap: previewRow ? '.2rem' : 0,
                  alignItems: 'stretch',
                  padding: previewRow ? '.12rem' : 0,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <ImportContabilitaWorkingTable
                    visibleRows={visibleRows}
                    stagingRows={stagingRows}
                    busy={busy}
                    allVisibleSelected={allVisibleSelected}
                    headerCheckboxRef={headerCheckboxRef}
                    onToggleVisibleSelection={onToggleVisibleSelection}
                    workingTableColumnFilters={WORKING_TABLE_COLUMN_FILTERS}
                    columnFilters={columnFilters}
                    columnSort={columnSort}
                    openColumnFilter={openColumnFilter}
                    columnFilterMenuRef={columnFilterMenuRef}
                    onToggleMenu={setOpenColumnFilter}
                    onCloseMenu={() => setOpenColumnFilter('')}
                    onUpdateFilter={updateWorkingTableColumnFilter}
                    onClearFilter={clearWorkingTableColumnFilter}
                    onSetSort={setWorkingTableColumnSort}
                    Th={Th}
                    Td={Td}
                    ActionButton={ActionButton}
                    WorkingTableColumnHeader={WorkingTableColumnHeader}
                    EmptyState={EmptyState}
                    MessageBox={MessageBox}
                    BadgePlaceholder={BadgePlaceholder}
                    formatDateOnly={formatDateOnly}
                    formatMoney={formatMoney}
                    formatManualAccount={formatManualAccount}
                    formatManualCausale={formatManualCausale}
                    getCounterpartyDisplayInfo={getCounterpartyDisplayInfo}
                    getWorkingTableRowReadiness={getWorkingTableRowReadiness}
                    describePianoContoFlags={describePianoContoFlags}
                    selectedRowIds={selectedRowIds}
                    updateSelectedRows={updateSelectedRows}
                    manualAccountByRowId={manualAccountByRowId}
                    manualCausaleByRowId={manualCausaleByRowId}
                    manualRegistrationDateByRowId={manualRegistrationDateByRowId}
                    automationMetaByRowId={automationMetaByRowId}
                    counterpartyAccountByRowId={counterpartyAccountByRowId}
                    accountEditorRowId={accountEditorRowId}
                    causaleEditorRowId={causaleEditorRowId}
                    accountSearchTerm={accountSearchTerm}
                    causaleSearchTerm={causaleSearchTerm}
                    accountSearchInputRef={accountSearchInputRef}
                    causaleSearchInputRef={causaleSearchInputRef}
                    setAccountEditorRowId={setAccountEditorRowId}
                    setCausaleEditorRowId={setCausaleEditorRowId}
                    setAccountSearchTerm={setAccountSearchTerm}
                    setCausaleSearchTerm={setCausaleSearchTerm}
                    updateManualAccountForRow={updateManualAccountForRow}
                    updateManualCausaleForRow={updateManualCausaleForRow}
                    filteredPianoConti={filteredPianoConti}
                    pianoContiLoading={pianoContiLoading}
                    pianoContiError={pianoContiError}
                    filteredCausaliContabili={filteredCausaliContabili}
                    causaliContabiliLoading={causaliContabiliLoading}
                    causaliContabiliError={causaliContabiliError}
                    isPreviewPanelOpen={isPreviewPanelOpen}
                    onStagingRowClick={onStagingRowClick}
                    previewRowId={previewRowId}
                    setPreviewRowId={setPreviewRowId}
                    getRowKey={getRowKey}
                  />
                </div>
                {previewRow ? (
                  <ImportContabilitaPreviewDrawer
                    previewRow={previewRow}
                    onClose={() => {
                      setPreviewRowId('')
                      setPreviewTab('fattura')
                    }}
                    ActionButton={ActionButton}
                  >
                    <ImportContabilitaPreviewDrawerContent
                      previewRow={previewRow}
                      previewRowId={previewRowId}
                      previewTab={previewTab}
                      setPreviewTab={setPreviewTab}
                      manualAccountByRowId={manualAccountByRowId}
                      manualCausaleByRowId={manualCausaleByRowId}
                      counterpartyAccountByRowId={counterpartyAccountByRowId}
                      getWorkingTableRowReadiness={getWorkingTableRowReadiness}
                      getCounterpartyDisplayInfo={getCounterpartyDisplayInfo}
                      ViewToggle={ViewToggle}
                      MessageBox={MessageBox}
                      BadgePlaceholder={BadgePlaceholder}
                      MetaPill={MetaPill}
                      formatMoney={formatMoney}
                      formatManualAccount={formatManualAccount}
                      formatManualCausale={formatManualCausale}
                    />
                  </ImportContabilitaPreviewDrawer>
                ) : null}
              </div>
            </section>
          </>
        ) : !busy && !errorMsg ? (
          <EmptyState
            title="Nessun file ancora analizzato"
            description="Seleziona uno o piu file per visualizzare report e staging in questa schermata."
          />
        ) : null}
      </section>

      {bulkContoPickerOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}>
          <div style={{
            width: 480,
            maxWidth: '90vw',
            borderRadius: 16,
            border: '1px solid rgba(96,165,250,.24)',
            background: 'rgba(8,24,40,.98)',
            boxShadow: '0 24px 64px rgba(0,0,0,.46)',
            padding: '1.2rem',
            display: 'grid',
            gap: '.8rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '.9rem', color: '#dbeafe' }}>Applica conto costo/ricavo a selezionate ({selectedCount})</h3>
              <button
                type="button"
                onClick={() => setBulkContoPickerOpen(false)}
                style={{ ...BUTTON_BASE, padding: '.12rem .3rem', fontSize: '.64rem', cursor: 'pointer' }}
              >
                Chiudi
              </button>
            </div>
            
            <input
              type="text"
              autoFocus
              value={bulkSearchTerm}
              onChange={(e) => setBulkSearchTerm(e.target.value)}
              placeholder="Cerca per codice o descrizione..."
              style={{
                width: '100%',
                border: '1px solid rgba(148,163,184,.18)',
                borderRadius: 8,
                background: 'rgba(255,255,255,.03)',
                color: '#dbeafe',
                padding: '.3rem .4rem',
                fontSize: '.78rem',
                outline: 'none',
              }}
            />

            <div style={{ display: 'grid', gap: '.22rem', maxHeight: 300, overflowY: 'auto' }}>
              {bulkFilteredPianoConti.length ? (
                bulkFilteredPianoConti.map((conto) => (
                  <button
                    key={conto.id}
                    type="button"
                    onClick={() => handleApplyContoBulkSelect(conto)}
                    style={{
                      width: '100%',
                      border: '1px solid rgba(148,163,184,.14)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,.015)',
                      color: '#dbeafe',
                      padding: '.24rem .32rem',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '90px 1fr',
                      gap: '.3rem',
                      alignItems: 'center',
                      textAlign: 'left',
                    }}
                  >
                    <strong style={{ fontSize: '.74rem' }}>{conto.codice || '—'}</strong>
                    <span style={{ fontSize: '.72rem', color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {conto.descrizione || '—'}
                    </span>
                  </button>
                ))
              ) : (
                <div style={{ fontSize: '.68rem', color: 'var(--mu)', textAlign: 'center', padding: '.4rem' }}>
                  Nessun conto corrispondente.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {bulkCausalePickerOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100vw',
          height: '100vh',
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 99999,
        }}>
          <div style={{
            width: 480,
            maxWidth: '90vw',
            borderRadius: 16,
            border: '1px solid rgba(96,165,250,.24)',
            background: 'rgba(8,24,40,.98)',
            boxShadow: '0 24px 64px rgba(0,0,0,.46)',
            padding: '1.2rem',
            display: 'grid',
            gap: '.8rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: '.9rem', color: '#dbeafe' }}>Applica causale contabile a selezionate ({selectedCount})</h3>
              <button
                type="button"
                onClick={() => setBulkCausalePickerOpen(false)}
                style={{ ...BUTTON_BASE, padding: '.12rem .3rem', fontSize: '.64rem', cursor: 'pointer' }}
              >
                Chiudi
              </button>
            </div>
            
            <input
              type="text"
              autoFocus
              value={bulkSearchTerm}
              onChange={(e) => setBulkSearchTerm(e.target.value)}
              placeholder="Cerca per codice o descrizione..."
              style={{
                width: '100%',
                border: '1px solid rgba(148,163,184,.18)',
                borderRadius: 8,
                background: 'rgba(255,255,255,.03)',
                color: '#dbeafe',
                padding: '.3rem .4rem',
                fontSize: '.78rem',
                outline: 'none',
              }}
            />

            <div style={{ display: 'grid', gap: '.22rem', maxHeight: 300, overflowY: 'auto' }}>
              {bulkFilteredCausaliContabili.length ? (
                bulkFilteredCausaliContabili.map((causale) => (
                  <button
                    key={causale.id}
                    type="button"
                    onClick={() => handleApplyCausaleBulkSelect(causale)}
                    style={{
                      width: '100%',
                      border: '1px solid rgba(148,163,184,.14)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,.015)',
                      color: '#dbeafe',
                      padding: '.24rem .32rem',
                      cursor: 'pointer',
                      display: 'grid',
                      gridTemplateColumns: '70px 1fr',
                      gap: '.3rem',
                      alignItems: 'center',
                      textAlign: 'left',
                    }}
                  >
                    <strong style={{ fontSize: '.74rem' }}>{causale.codice || '—'}</strong>
                    <span style={{ fontSize: '.72rem', color: 'var(--tx)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {causale.descrizione || '—'}
                    </span>
                  </button>
                ))
              ) : (
                <div style={{ fontSize: '.68rem', color: 'var(--mu)', textAlign: 'center', padding: '.4rem' }}>
                  Nessuna causale corrispondente.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionButton({ label, onClick, disabled = false, kind = 'default', small = false, emphasis = false }) {
  const baseButtonStyle = {
    ...BUTTON_BASE,
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'var(--bd)',
  }

  const styles = {
    default: baseButtonStyle,
    primary: {
      ...baseButtonStyle,
      background: 'linear-gradient(180deg, rgba(84,141,212,.22), rgba(84,141,212,.12))',
      borderColor: 'rgba(84,141,212,.38)',
    },
    success: {
      ...baseButtonStyle,
      background: 'linear-gradient(180deg, rgba(40,167,69,.24), rgba(40,167,69,.12))',
      borderColor: 'rgba(40,167,69,.42)',
    },
    danger: {
      ...baseButtonStyle,
      background: 'linear-gradient(180deg, rgba(220,53,69,.22), rgba(220,53,69,.12))',
      borderColor: 'rgba(220,53,69,.36)',
    },
    warning: {
      ...baseButtonStyle,
      background: 'linear-gradient(180deg, rgba(245,158,11,.26), rgba(245,158,11,.14))',
      borderColor: 'rgba(245,158,11,.42)',
    },
    ghost: {
      ...baseButtonStyle,
      background: 'rgba(255,255,255,.02)',
    },
  }

  const style = {
    ...(disabled ? { ...baseButtonStyle, cursor: 'not-allowed', opacity: 0.5 } : styles[kind] || baseButtonStyle),
    ...(small ? { padding: '.14rem .28rem', fontSize: '.62rem', minHeight: 22 } : null),
    ...(emphasis ? { padding: '.34rem .62rem', fontSize: '.76rem', minHeight: 36, borderRadius: 12, letterSpacing: '.01em', boxShadow: '0 10px 24px rgba(0,0,0,.16)' } : null),
  }

  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={style}
      onMouseEnter={(event) => {
        if (!disabled) event.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {label}
    </button>
  )
}

function ViewToggle({ label, active = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '.14rem .28rem',
        borderRadius: 999,
        border: active ? '1px solid rgba(96,165,250,.22)' : '1px solid rgba(148,163,184,.14)',
        background: active ? 'rgba(59,130,246,.1)' : 'rgba(255,255,255,.015)',
        color: active ? '#dbeafe' : '#c7d7ea',
        fontSize: '.66rem',
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}

function SearchField({ value, onChange, compact = false }) {
  return (
    <label
      style={{
        display: 'grid',
        gap: '.12rem',
        padding: compact ? '.3rem .42rem' : '.65rem .75rem',
        borderRadius: 14,
        border: '1px solid rgba(96,165,250,.12)',
        background: compact
          ? 'linear-gradient(180deg, rgba(16,42,68,.84), rgba(10,26,43,.94))'
          : 'rgba(16,42,68,.76)',
        minWidth: compact ? 320 : undefined,
        flex: compact ? '1 1 360px' : undefined,
      }}
    >
      <span style={{ fontSize: '.6rem', color: '#b6c6d8', textTransform: 'uppercase', letterSpacing: '.08em' }}>Cerca</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Fornitore, numero, esito"
        style={{
          background: 'transparent',
          color: '#dbeafe',
          border: 'none',
          outline: 'none',
          fontSize: '.78rem',
          padding: 0,
        }}
      />
    </label>
  )
}

function MetaPill({ label, value }) {
  return (
    <div
      style={{
        padding: '.16rem .3rem',
        borderRadius: 999,
        border: '1px solid rgba(148,163,184,.14)',
        background: 'rgba(255,255,255,.015)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.28rem',
        fontSize: '.66rem',
      }}
    >
      <span style={{ color: '#93a8bf', textTransform: 'uppercase', letterSpacing: '.04em' }}>{label}</span>
      <strong style={{ color: '#dbeafe', fontSize: '.72rem' }}>{value}</strong>
    </div>
  )
}

function BadgePlaceholder({ text }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '.16rem .32rem',
        borderRadius: 999,
        border: '1px solid rgba(148,163,184,.14)',
        background: 'rgba(255,255,255,.015)',
        color: '#b6c6d8',
        fontSize: '.66rem',
        textTransform: 'uppercase',
        letterSpacing: '.04em',
      }}
    >
      {text}
    </span>
  )
}

function MetricChip({ label, value }) {
  return (
    <div
      style={{
        padding: '.2rem .34rem',
        borderRadius: 999,
        border: '1px solid rgba(148,163,184,.14)',
        background: 'rgba(255,255,255,.015)',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.3rem',
      }}
    >
      <span style={{ fontSize: '.66rem', color: '#93a8bf', textTransform: 'uppercase', letterSpacing: '.05em' }}>{label}</span>
      <strong style={{ fontSize: '.78rem', fontWeight: 700, color: '#dbeafe' }}>{value}</strong>
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div
      style={{
        padding: '.5rem .55rem',
        display: 'grid',
        gap: '.1rem',
        justifyItems: 'center',
        textAlign: 'center',
        borderTop: '1px solid rgba(148,163,184,.12)',
      }}
    >
      <div style={{ fontSize: '1rem' }} aria-hidden="true">
        📭
      </div>
      <div style={{ fontSize: '.78rem', fontWeight: 700 }}>{title}</div>
      <div style={{ maxWidth: 620, color: 'var(--mu)', lineHeight: 1.25, fontSize: '.7rem' }}>{description}</div>
    </div>
  )
}

const WorkingTableColumnHeader = memo(function WorkingTableColumnHeader({
  columnKey,
  label,
  type,
  width,
  align = 'left',
  columnFilters,
  columnSort,
  openColumnFilter,
  menuRef,
  onToggleMenu,
  onCloseMenu,
  onUpdateFilter,
  onClearFilter,
  onSetSort,
}) {
  const isOpen = openColumnFilter === columnKey
  const filter = columnFilters?.[columnKey] || {}
  const isActiveFilter = isWorkingTableColumnFilterActive(filter, type)
  const isActiveSort = columnSort?.key === columnKey
  const active = isActiveFilter || isActiveSort

  const baseControlStyle = {
    width: '100%',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '.24rem',
    border: '1px solid rgba(96,165,250,.12)',
    borderRadius: 10,
    background: active ? 'rgba(59,130,246,.11)' : 'linear-gradient(180deg, rgba(16,42,68,.82), rgba(10,26,43,.94))',
    color: active ? '#dbeafe' : '#c7d7ea',
    padding: '.16rem .26rem',
    cursor: 'pointer',
    fontSize: '.68rem',
    fontWeight: 700,
  }

  const renderSortButtons = () => (
    <div style={{ display: 'flex', gap: '.18rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        onClick={() => onSetSort(columnKey, 'asc')}
        style={{ ...BUTTON_BASE, padding: '.12rem .24rem', fontSize: '.6rem' }}
      >
        {type === 'date' || type === 'number' ? 'Ordina crescente' : 'Ordina A-Z'}
      </button>
      <button
        type="button"
        onClick={() => onSetSort(columnKey, 'desc')}
        style={{ ...BUTTON_BASE, padding: '.12rem .24rem', fontSize: '.6rem' }}
      >
        {type === 'date' || type === 'number' ? 'Ordina decrescente' : 'Ordina Z-A'}
      </button>
    </div>
  )

  return (
    <Th align={align} style={{ position: 'relative', verticalAlign: 'top', width: width || undefined, minWidth: width || undefined }}>
      <div style={{ position: 'relative', display: 'grid', gap: '.1rem', minWidth: 0 }}>
        <button
          type="button"
          data-working-table-column-trigger="true"
          onClick={() => onToggleMenu(isOpen ? '' : columnKey)}
          style={baseControlStyle}
          aria-haspopup="menu"
          aria-expanded={isOpen}
          title={`Filtra o ordina ${label}`}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
          <span style={{ fontSize: '.62rem', opacity: .88 }}>{isActiveSort ? (columnSort?.direction === 'desc' ? '▼' : '▲') : '▾'}</span>
        </button>

        {isOpen ? (
          <div
            ref={menuRef}
            data-working-table-column-filter-menu="true"
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              zIndex: 45,
              width: type === 'text' ? 260 : 280,
              maxWidth: 'min(320px, 90vw)',
              borderRadius: 12,
              border: '1px solid rgba(148,163,184,.14)',
              background: 'rgba(8,24,40,.98)',
              boxShadow: '0 18px 40px rgba(0,0,0,.28)',
              padding: '.34rem .36rem',
              display: 'grid',
              gap: '.26rem',
            }}
          >
            {renderSortButtons()}

            {type === 'text' ? (
              <>
                <input
                  value={filter.query || ''}
                  onChange={(event) => onUpdateFilter(columnKey, { query: event.target.value })}
                  placeholder="Cerca..."
                  style={{
                    width: '100%',
                        border: '1px solid rgba(96,165,250,.12)',
                        borderRadius: 10,
                        background: 'rgba(16,42,68,.66)',
                        color: '#dbeafe',
                    padding: '.18rem .26rem',
                    fontSize: '.68rem',
                    outline: 'none',
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    onClearFilter(columnKey)
                    onCloseMenu()
                  }}
                  style={{ ...BUTTON_BASE, padding: '.12rem .24rem', fontSize: '.6rem', justifyContent: 'center' }}
                >
                  Pulisci filtro
                </button>
              </>
            ) : type === 'number' ? (
              <>
                <div style={{ display: 'flex', gap: '.18rem', flexWrap: 'wrap' }}>
                  {[
                    ['gt', 'Maggiore di'],
                    ['lt', 'Minore di'],
                    ['eq', 'Uguale a'],
                    ['between', 'Tra'],
                  ].map(([mode, modeLabel]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateFilter(columnKey, { mode, value: filter.value || '', min: filter.min || '', max: filter.max || '' })}
                      style={{
                        ...BUTTON_BASE,
                        padding: '.12rem .24rem',
                        fontSize: '.59rem',
                        background: normalizeText(filter.mode || 'gt') === mode ? 'rgba(59,130,246,.12)' : 'rgba(16,42,68,.66)',
                      }}
                    >
                      {modeLabel}
                    </button>
                  ))}
                </div>
                {normalizeText(filter.mode || 'gt') === 'between' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.2rem' }}>
                    <input
                      value={filter.min || ''}
                      onChange={(event) => onUpdateFilter(columnKey, { min: event.target.value })}
                      placeholder="Min"
                      inputMode="decimal"
                      style={{
                        width: '100%',
                        border: '1px solid rgba(96,165,250,.12)',
                        borderRadius: 10,
                        background: 'rgba(16,42,68,.66)',
                        color: '#dbeafe',
                    padding: '.18rem .26rem',
                    fontSize: '.68rem',
                        outline: 'none',
                      }}
                    />
                    <input
                      value={filter.max || ''}
                      onChange={(event) => onUpdateFilter(columnKey, { max: event.target.value })}
                      placeholder="Max"
                      inputMode="decimal"
                      style={{
                        width: '100%',
                        border: '1px solid rgba(148,163,184,.14)',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,.02)',
                        color: '#dbeafe',
                        padding: '.18rem .26rem',
                        fontSize: '.68rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <input
                    value={filter.value || ''}
                    onChange={(event) => onUpdateFilter(columnKey, { value: event.target.value })}
                    placeholder="Valore"
                    inputMode="decimal"
                    style={{
                      width: '100%',
                      border: '1px solid rgba(148,163,184,.14)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,.02)',
                      color: '#dbeafe',
                      padding: '.18rem .26rem',
                      fontSize: '.68rem',
                      outline: 'none',
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClearFilter(columnKey)
                    onCloseMenu()
                  }}
                  style={{ ...BUTTON_BASE, padding: '.12rem .24rem', fontSize: '.6rem', justifyContent: 'center' }}
                >
                  Pulisci filtro
                </button>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: '.18rem', flexWrap: 'wrap' }}>
                  {[
                    ['from', 'Da data'],
                    ['to', 'A data'],
                    ['between', 'Tra date'],
                  ].map(([mode, modeLabel]) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onUpdateFilter(columnKey, { mode, value: filter.value || '', from: filter.from || '', to: filter.to || '' })}
                      style={{
                        ...BUTTON_BASE,
                        padding: '.12rem .24rem',
                        fontSize: '.59rem',
                        background: normalizeText(filter.mode || 'from') === mode ? 'rgba(59,130,246,.12)' : 'rgba(16,42,68,.66)',
                      }}
                    >
                      {modeLabel}
                    </button>
                  ))}
                </div>
                {normalizeText(filter.mode || 'from') === 'between' ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.2rem' }}>
                    <input
                      type="date"
                      value={filter.from || ''}
                      onChange={(event) => onUpdateFilter(columnKey, { from: event.target.value })}
                      style={{
                        width: '100%',
                    border: '1px solid rgba(96,165,250,.16)',
                    borderRadius: 10,
                    background: 'rgba(16,42,68,.72)',
                    color: 'var(--tx)',
                    padding: '.18rem .26rem',
                    fontSize: '.68rem',
                        outline: 'none',
                      }}
                    />
                    <input
                      type="date"
                      value={filter.to || ''}
                      onChange={(event) => onUpdateFilter(columnKey, { to: event.target.value })}
                      style={{
                        width: '100%',
                        border: '1px solid rgba(148,163,184,.14)',
                        borderRadius: 8,
                        background: 'rgba(255,255,255,.02)',
                        color: '#dbeafe',
                        padding: '.18rem .26rem',
                        fontSize: '.68rem',
                        outline: 'none',
                      }}
                    />
                  </div>
                ) : (
                  <input
                    type="date"
                    value={filter.value || ''}
                    onChange={(event) => onUpdateFilter(columnKey, { value: event.target.value })}
                    style={{
                      width: '100%',
                      border: '1px solid rgba(148,163,184,.14)',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,.02)',
                      color: '#dbeafe',
                      padding: '.18rem .26rem',
                      fontSize: '.68rem',
                      outline: 'none',
                    }}
                  />
                )}
                <button
                  type="button"
                  onClick={() => {
                    onClearFilter(columnKey)
                    onCloseMenu()
                  }}
                  style={{ ...BUTTON_BASE, padding: '.12rem .24rem', fontSize: '.6rem', justifyContent: 'center' }}
                >
                  Pulisci filtro
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>
    </Th>
  )
})

function LoadingPane({ label = 'Analisi in corso...' }) {
  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(124, 157, 202, .18)',
        background: 'rgba(255,255,255,.02)',
        padding: '.42rem .48rem',
        display: 'grid',
        gap: '.28rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem' }}>
        <div
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            border: '2px solid rgba(84,141,212,.24)',
            borderTopColor: 'rgba(84,141,212,.92)',
            animation: 'ic-spin .8s linear infinite',
          }}
        />
        <div style={{ fontWeight: 700, fontSize: '.8rem' }}>{label}</div>
      </div>
      <div style={{ display: 'grid', gap: '.22rem' }}>
        <SkeletonLine width="72%" />
        <SkeletonLine width="88%" />
        <SkeletonLine width="64%" />
        <SkeletonLine width="92%" />
      </div>
      <style>{`
        @keyframes ic-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

function SkeletonLine({ width }) {
  return (
    <div
      style={{
        width,
        height: 6,
        borderRadius: 999,
        background: 'linear-gradient(90deg, rgba(124,157,202,.08), rgba(124,157,202,.22), rgba(124,157,202,.08))',
        backgroundSize: '200% 100%',
        animation: 'ic-wave 1.4s ease-in-out infinite',
      }}
    />
  )
}

function MessageBox({ tone = 'neutral', children }) {
  const styles = {
    error: {
      border: '1px solid rgba(220,53,69,.25)',
      background: 'rgba(220,53,69,.08)',
      color: '#ffd8dd',
    },
    warning: {
      border: '1px solid rgba(255,193,7,.28)',
      background: 'rgba(255,193,7,.1)',
      color: '#ffe9a8',
    },
    neutral: {
      border: '1px solid rgba(124,157,202,.18)',
      background: 'rgba(255,255,255,.02)',
      color: 'var(--tx)',
    },
    success: {
      border: '1px solid rgba(40,167,69,.25)',
      background: 'rgba(40,167,69,.08)',
      color: '#baf3c5',
    },
  }

  return (
    <div style={{ ...styles[tone], borderRadius: 12, padding: '.48rem .55rem', fontSize: '.8rem', lineHeight: 1.35 }}>
      {children}
    </div>
  )
}

function Th({ children, align = 'left', style = {} }) {
  return (
    <th
      style={{
        textAlign: align,
        padding: '.2rem .34rem',
        borderBottom: '1px solid var(--bd)',
        fontSize: '.6rem',
        textTransform: 'uppercase',
        letterSpacing: '.04em',
        color: 'var(--mu)',
        background: 'rgba(0,0,0,.14)',
        ...style,
      }}
    >
      {children}
    </th>
  )
}

function Td({ children, align = 'left' }) {
  return (
    <td
      style={{
        textAlign: align,
        padding: '.2rem .34rem',
        borderBottom: '1px solid rgba(124,157,202,0.14)',
        fontSize: '.74rem',
        verticalAlign: 'top',
        lineHeight: 1.18,
      }}
    >
      {children}
    </td>
  )
}
