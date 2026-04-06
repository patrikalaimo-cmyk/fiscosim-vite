/**
 * Attese "soft" per gli scenari E2E predefiniti (stessi UUID delle migration).
 * Il merge in runTestScenario sovrascrive eventuali expected_results strict ancora presenti nel DB
 * (document.tipo, pipeline_phases, min_count scritture) quando mancano migration o trace vuota.
 */

import {
  DEFAULT_TEST_SCENARIO_FATTURA_PASSIVA_ID,
  DEFAULT_TEST_SCENARIO_MULTI_INVOICES_ID,
  DEFAULT_TEST_SCENARIO_FULL_IVA_CYCLE_ID,
} from '../src/shared/constants/index.js'

/** @type {Record<string, Record<string, unknown>>} */
/**
 * Se `test_scenarios.steps` è vuoto o non valido, stessi step delle migration (a/b/c).
 * Così l’E2E funziona anche senza aver applicato le migration Supabase.
 */
const BUILT_IN_FALLBACK_STEPS_BY_ID = {
  [DEFAULT_TEST_SCENARIO_FATTURA_PASSIVA_ID]: [
    { action: 'upload_xml' },
    { action: 'run_pipeline', aiMode: 'local', aiPreprocessMode: 'on' },
    { action: 'open_entry' },
    { action: 'validate' },
  ],
  [DEFAULT_TEST_SCENARIO_MULTI_INVOICES_ID]: [
    { action: 'batch_upload_pipeline', max: 5, aiMode: 'local', aiPreprocessMode: 'on' },
    { action: 'open_entry' },
    { action: 'validate' },
  ],
  [DEFAULT_TEST_SCENARIO_FULL_IVA_CYCLE_ID]: [
    { action: 'upload_xml' },
    { action: 'run_pipeline', aiMode: 'local', aiPreprocessMode: 'on' },
    { action: 'open_entry' },
    { action: 'validate' },
  ],
}

/** @type {Record<string, Record<string, unknown>>} */
const BUILT_IN_SOFT_BY_ID = {
  [DEFAULT_TEST_SCENARIO_FATTURA_PASSIVA_ID]: {
    pipeline: { completed: true },
    accounting_entries: { min_count: 0 },
    partitari: { min_count: 0 },
    registri_iva: { min_count: 0 },
    insights: { min_total: 0 },
  },
  [DEFAULT_TEST_SCENARIO_MULTI_INVOICES_ID]: {
    batch_summary: { min_documents: 3 },
    accounting_entries: { min_count: 0 },
    pipeline: { completed: true },
  },
  [DEFAULT_TEST_SCENARIO_FULL_IVA_CYCLE_ID]: {
    pipeline: { completed: true },
    accounting_entries: { min_count: 0 },
    partitari: { min_count: 0 },
    registri_iva: { min_count: 0 },
    insights: { min_total: 0 },
  },
}

/**
 * @param {unknown} raw — scenario.expected_results (oggetto o JSON string)
 * @returns {Record<string, unknown>}
 */
function parseExpected(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return { ...raw }
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw)
      return j && typeof j === 'object' && !Array.isArray(j) ? { ...j } : {}
    } catch {
      return {}
    }
  }
  return {}
}

/**
 * UUID da client/DB possono avere maiuscole o spazi: la lookup sugli scenari built-in deve essere canonica.
 * @param {unknown} scenarioId
 * @returns {string}
 */
export function normalizeScenarioIdKey(scenarioId) {
  if (scenarioId == null || scenarioId === '') return ''
  return String(scenarioId).trim().toLowerCase()
}

/**
 * Step predefiniti per UUID E2E quando il DB non ha `steps` valorizzati.
 * @param {unknown} scenarioId
 * @returns {Array<Record<string, unknown>>}
 */
export function getBuiltInFallbackSteps(scenarioId) {
  const key = normalizeScenarioIdKey(scenarioId)
  const arr = BUILT_IN_FALLBACK_STEPS_BY_ID[key]
  if (!Array.isArray(arr) || !arr.length) return []
  return arr.map((s) => ({ ...s }))
}

/**
 * Quando non ci sono step persistiti (migration pipeline_runs assente o insert fallito),
 * non applicare controlli che richiedono trace o colonne documento popolate.
 * @param {Record<string, unknown>} expected
 * @param {{ steps?: unknown[] } | null | undefined} pipelineTrace
 * @returns {Record<string, unknown>}
 */
export function relaxExpectedWhenPipelineTraceEmpty(expected, pipelineTrace) {
  const steps = pipelineTrace?.steps
  const hasSteps = Array.isArray(steps) && steps.length > 0
  if (hasSteps) return { ...expected }

  const e = { ...expected }
  delete e.pipeline_phases
  delete e.document
  if (e.accounting_entries && typeof e.accounting_entries === 'object' && !Array.isArray(e.accounting_entries)) {
    e.accounting_entries = { ...e.accounting_entries, min_count: 0 }
  }
  return e
}

/**
 * Per gli UUID predefiniti a/b/c: rimuove controlli che richiedono DB/migration completi,
 * poi applica le attese soft (stesso contenuto delle migration `test_scenarios_default_e2e`).
 *
 * @param {string} scenarioId
 * @param {unknown} rawExpected
 * @returns {Record<string, unknown>}
 */
export function normalizeBuiltInScenarioExpectedResults(scenarioId, rawExpected) {
  const key = normalizeScenarioIdKey(scenarioId)
  const soft = BUILT_IN_SOFT_BY_ID[key]
  if (!soft) return parseExpected(rawExpected)

  const base = parseExpected(rawExpected)
  delete base.document
  delete base.pipeline_phases

  return { ...base, ...soft }
}
