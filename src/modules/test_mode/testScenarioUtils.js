/**
 * Analisi step scenario (JSON da test_scenarios.steps) per UI.
 *
 * expected_results (L5): vedi `docs/TEST_ROADMAP_INTELLIGENT.md` e `services/testScenarioCompare.js`
 * — ai_validation (primary_entry + ai_confidence / ai_source / ai_explanation),
 *   insights (by_tipo, require_tipos_present), pipeline_phases (required_order, require_all_ok).
 */

export function parseScenarioSteps(raw) {
  if (raw == null) return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const j = JSON.parse(raw)
      return Array.isArray(j) ? j : []
    } catch {
      return []
    }
  }
  return []
}

/** True se serve file XML (o altro) lato client prima di eseguire. */
export function scenarioNeedsBatchFiles(steps) {
  const list = parseScenarioSteps(steps)
  return list.some((s) => String(s?.action || '').toLowerCase() === 'batch_upload_pipeline')
}

export function scenarioNeedsClientFile(steps) {
  const list = parseScenarioSteps(steps)
  return (
    scenarioNeedsBatchFiles(steps) ||
    list.some((s) => String(s?.action || '').toLowerCase() === 'upload_xml')
  )
}

/** Numero minimo file XML per scenari batch (da expected_results.batch_summary.min_documents, default 3). */
export function getBatchMinDocuments(expectedResultsRaw) {
  const j = parseExpectedResults(expectedResultsRaw)
  const n = j?.batch_summary?.min_documents
  return Number.isFinite(Number(n)) && Number(n) > 0 ? Number(n) : 3
}

function parseExpectedResults(raw) {
  if (raw == null) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return {}
}

/** Fasi pipeline come in UI utente (allineate a pipeline_steps.step). */
export const PIPELINE_USER_PHASES = [
  { id: 'parsing', label: 'Parsing', desc: 'Lettura XML / PDF' },
  { id: 'ai_accounting', label: 'Contabilità', desc: 'Registrazione AI' },
  { id: 'partitari', label: 'Partitari', desc: 'Movimenti soggetto' },
  { id: 'iva', label: 'IVA', desc: 'Registri IVA' },
  { id: 'liquidazione', label: 'Liquidazione', desc: 'IVA periodo' },
  { id: 'insights', label: 'Insight', desc: 'Anomalie e suggerimenti' },
]

export function humanizeStepAction(step) {
  const a = String(step?.action || '').toLowerCase()
  const map = {
    upload_xml: 'Caricamento XML',
    run_pipeline: 'Pipeline completa',
    batch_upload_pipeline: 'Import multiplo + pipeline per ogni fattura',
    open_entry: 'Apertura scritture contabili',
    validate: 'Validazione risultati',
    wait_ms: 'Attesa',
  }
  return map[a] || a || 'step'
}
