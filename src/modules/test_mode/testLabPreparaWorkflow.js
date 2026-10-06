/**
 * Fase 24B — Prepara test: runImportWorkflow → working table in-memory (sessionStorage).
 * Perimetro 24B: solo runImportWorkflow e sessionStorage — nessun commit contabile DB.
 */

import { runImportWorkflow } from '../import_contabilita/application/importContabilitaWorkflow.js'
import { assertDemoCompanyForTestLab, TEST_LAB_PHASE_24E } from './demoCompanyGuard.js'
import { resolveSocietaDisplayName } from './societaTestLabSchema.js'
import {
  generateOrdinariaAcquisto10Cases,
  TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO,
  TEST_LAB_SOURCE,
  TEST_LAB_MARKER,
} from './testLabOrdinariaAcquistoCases.js'

export const IMPORT_SNAPSHOT_KEY_PREFIX = 'import_contabilita.last_result.'

export function getImportSnapshotStorageKey(societaId) {
  return `${IMPORT_SNAPSHOT_KEY_PREFIX}${String(societaId || '').trim()}`
}

function normalizeText(value) {
  return String(value || '').trim()
}

function buildAutomationMetaByFilename(cases) {
  const byFilename = new Map(cases.map((c) => [normalizeText(c.name), c]))
  return { byFilename, cases }
}

function attachTestLabMetaToImportResult(importResult, cases) {
  const { byFilename } = buildAutomationMetaByFilename(cases)
  const automationMetaByRowId = {}
  const stagingRows = Array.isArray(importResult?.stagingRows) ? importResult.stagingRows : []

  for (const row of stagingRows) {
    const filename = normalizeText(row?.filename)
    const caseDef = byFilename.get(filename)
    const rowId = normalizeText(row?.id || filename)
    if (!rowId) continue
    automationMetaByRowId[rowId] = {
      source: TEST_LAB_SOURCE,
      testLabMarker: TEST_LAB_MARKER,
      scenario: TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO,
      caseId: caseDef?.caseId || null,
      phase: TEST_LAB_PHASE_24E.id,
      meta: caseDef?.meta || null,
      preparedAt: new Date().toISOString(),
    }
  }

  return { stagingRows, automationMetaByRowId }
}

function computeReportStatus({ casiPrevisti, casiPreparati, errori, warning }) {
  if (errori.length > 0 || casiPreparati < casiPrevisti) return 'rosso'
  if (warning.length > 0) return 'giallo'
  return 'verde'
}

/**
 * @param {object} params
 * @param {object} params.societa
 * @param {string} params.societaId
 * @returns {Promise<object>}
 */
export async function runTestLabPreparaOrdinariaAcquisto({ societa, societaId }) {
  assertDemoCompanyForTestLab(societa, 'runTestLabPreparaOrdinariaAcquisto')
  if (!societaId) throw new Error('Test Lab: societaId obbligatorio')

  const dateObj = new Date()
  const runId = dateObj.getFullYear() +
    String(dateObj.getMonth() + 1).padStart(2, '0') +
    String(dateObj.getDate()).padStart(2, '0') +
    '_' +
    String(dateObj.getHours()).padStart(2, '0') +
    String(dateObj.getMinutes()).padStart(2, '0') +
    String(dateObj.getSeconds()).padStart(2, '0') +
    String(dateObj.getMilliseconds()).padStart(3, '0')

  const cases = generateOrdinariaAcquisto10Cases(societa, runId)
  const files = cases.map(({ id, name, size, text }) => ({ id, name, size, text }))

  const importResult = await runImportWorkflow(files, {
    societaId,
    societaName: resolveSocietaDisplayName(societa),
    dedupCandidates: { stagingRows: [], accountingRows: [] },
    sourceModule: TEST_LAB_SOURCE,
    batchId: `test_lab_24b_${Date.now()}`,
  })

  const { automationMetaByRowId } = attachTestLabMetaToImportResult(importResult, cases)
  const stagingRows = Array.isArray(importResult?.stagingRows) ? importResult.stagingRows : []
  const stagingCount = stagingRows.length
  const parseErrors = (importResult?.report?.items || []).filter((i) => i?.outcome === 'parse_error')
  const warnings = (importResult?.report?.items || []).filter((i) => i?.severity === 'warning')

  const errori = []
  if (!importResult?.ok) errori.push(importResult?.reason || 'import_workflow_failed')
  for (const e of parseErrors) {
    errori.push(`${e.filename}: ${e.reasonCode || 'parse_error'}`)
  }

  // [TEST_LAB_RUN_GENERATED] log
  console.log('[TEST_LAB_RUN_GENERATED]')
  console.log(`runId=${runId}`)
  console.log(`societaCodice=${societa.codice}`)
  console.log(`countDocumenti=${cases.length}`)
  console.log(`elencoCaseCode=${cases.map(c => c.meta?.numeroDocumento || c.caseId).join(',')}`)
  console.log(`sourceRowKeyGenerati=${cases.map(c => c.id).join(',')}`)

  // [TEST_LAB_RUN_DOCUMENT_STATUS] log
  console.log('[TEST_LAB_RUN_DOCUMENT_STATUS]')
  stagingRows.forEach((row) => {
    const caseCode = row.parsedDocument?.numeroDocumento || ''
    const sourceRowKey = row.id
    const state = row.state || 'ready'
    const isContabilizzabile = !['processed', 'committed', 'registered'].includes(state.toLowerCase())
    console.log(`caseCode=${caseCode}, sourceRowKey=${sourceRowKey}, stato=${state}, contabilizzabile=${isContabilizzabile}, motivo=${isContabilizzabile ? 'none' : 'già contabilizzato'}`)
  })

  const report = {
    scenario: TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO,
    modalita: 'prepara_test',
    fase: TEST_LAB_PHASE_24E.id,
    societaDemo: resolveSocietaDisplayName(societa),
    societaCodice: societa.codice,
    societaId,
    casiPrevisti: cases.length,
    casiPreparati: stagingCount,
    documentiStagingWorking: stagingCount,
    documentiContabilizzati: 0,
    primeNoteCreate: 0,
    registriIvaCreati: 0,
    partitarioCreato: 0,
    errori,
    warning: warnings.map((w) => `${w.filename}: ${w.reasonCode || 'warning'}`),
    stato: computeReportStatus({
      casiPrevisti: cases.length,
      casiPreparati: stagingCount,
      errori,
      warning: warnings,
    }),
    preparedAt: new Date().toISOString(),
    cases: cases.map((c) => ({
      caseId: c.caseId,
      label: c.meta?.note ? `${c.caseId} — ${c.label || c.caseId}` : c.caseId,
      filename: c.name,
      meta: c.meta,
    })),
    runId,
  }

  return {
    report,
    importResult,
    cases,
    automationMetaByRowId,
    runId,
  }
}

/**
 * Scrive snapshot compatibile con Import Contabilità (solo sessionStorage, no DB).
 * @returns {boolean}
 */
export function writeTestLabImportSnapshot(societaId, importResult, automationMetaByRowId = {}, runId = '') {
  if (typeof window === 'undefined' || !societaId || !importResult) return false
  const payload = {
    storageVersion: 4,
    result: importResult,
    manualAccountByRowId: {},
    manualCausaleByRowId: {},
    manualRegistrationDateByRowId: {},
    anagraficheDecisioniByKey: {},
    percipientiDecisioniByKey: {},
    automationMetaByRowId: automationMetaByRowId || {},
    testLab: {
      source: TEST_LAB_SOURCE,
      scenario: TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO,
      phase: TEST_LAB_PHASE_24E.id,
      preparedAt: new Date().toISOString(),
      runId,
    },
  }
  try {
    window.sessionStorage.setItem(getImportSnapshotStorageKey(societaId), JSON.stringify(payload))
    return true
  } catch {
    return false
  }
}

export const CICLO_COMPLETO_DISABLED_REASON =
  'Ciclo completo massivo disabilitato in 24E: contabilizzare 1 documento demo dalla working view Import.'
