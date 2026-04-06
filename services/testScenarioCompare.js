/**
 * Confronto expected_results vs snapshot runtime per scenari test_scenarios.
 * Supporta: documento, array (min_count), campi annidati, pipeline, AI, insight, fasi pipeline.
 */

/**
 * @param {Record<string, unknown>} actualFlat
 * @param {Record<string, unknown>} expected
 * @param {{ pipelineResult?: { ok?: boolean } | null }} [ctx]
 * @returns {Array<{ path: string, message: string }>}
 */
export function compareExpectedResults(actualFlat, expected, ctx = {}) {
  const failures = []
  if (!expected || typeof expected !== 'object') return failures

  for (const [key, rule] of Object.entries(expected)) {
    if (rule === undefined || key === 'pipeline') continue
    if (
      key === 'ai_validation' ||
      key === 'insights' ||
      key === 'pipeline_phases' ||
      key === 'accounting_data' ||
      key === 'iva' ||
      key === 'liquidazione' ||
      key === 'batch_summary'
    )
      continue

    const actualVal = actualFlat[key]

    if (rule != null && typeof rule === 'object' && !Array.isArray(rule) && rule.min_count == null) {
      if (actualVal == null) {
        for (const fk of Object.keys(rule)) {
          failures.push({ path: `${key}.${fk}`, message: 'valore assente' })
        }
        continue
      }
    }

    if (rule != null && typeof rule === 'object' && !Array.isArray(rule) && rule.min_count != null) {
      const n = Array.isArray(actualVal) ? actualVal.length : 0
      const min = Number(rule.min_count)
      if (n < min) failures.push({ path: key, message: `attesi almeno ${min} elementi, trovati ${n}` })
      continue
    }

    if (rule != null && typeof rule === 'object' && !Array.isArray(rule) && actualVal != null && typeof actualVal === 'object' && !Array.isArray(actualVal)) {
      for (const [fk, fv] of Object.entries(rule)) {
        const av = actualVal[fk]
        if (fv === undefined) continue
        if (av !== fv && String(av) !== String(fv)) {
          failures.push({ path: `${key}.${fk}`, message: `atteso ${JSON.stringify(fv)}, ottenuto ${JSON.stringify(av)}` })
        }
      }
      continue
    }

    if (rule !== actualVal && String(rule) !== String(actualVal)) {
      failures.push({ path: key, message: `atteso ${JSON.stringify(rule)}, ottenuto ${JSON.stringify(actualVal)}` })
    }
  }

  if (expected.pipeline && typeof expected.pipeline === 'object') {
    if (expected.pipeline.completed === true) {
      if (ctx.pipelineResult == null) {
        failures.push({
          path: 'pipeline.completed',
          message:
            'Pipeline non eseguita (nessun risultato): serve almeno uno step run_pipeline o batch_upload_pipeline e XML/batch validi; verifica anche la colonna steps in test_scenarios',
        })
      } else if (!ctx.pipelineResult.ok) {
        failures.push({ path: 'pipeline.completed', message: `pipeline fallita: ${ctx.pipelineResult.error || 'ok false'}` })
      }
    }
  }

  const av = actualFlat.ai_validation
  if (expected.ai_validation && typeof expected.ai_validation === 'object' && expected.ai_validation != null) {
    failures.push(...compareAiValidationRules(av, expected.ai_validation))
  }

  const ins = actualFlat.insights
  if (expected.insights && typeof expected.insights === 'object' && expected.insights != null) {
    failures.push(...compareInsightRules(ins, expected.insights))
  }

  const ph = actualFlat.pipeline_phases
  if (expected.pipeline_phases && typeof expected.pipeline_phases === 'object' && expected.pipeline_phases != null) {
    failures.push(...comparePipelinePhaseRules(ph, expected.pipeline_phases))
  }

  const ad = actualFlat.accounting_data
  if (expected.accounting_data && typeof expected.accounting_data === 'object' && expected.accounting_data != null) {
    failures.push(...compareAccountingDataRules(ad, expected.accounting_data))
  }

  const iva = actualFlat.iva
  if (expected.iva && typeof expected.iva === 'object' && expected.iva != null) {
    failures.push(...compareIvaRules(iva, expected.iva))
  }

  const liq = actualFlat.liquidazione
  if (expected.liquidazione && typeof expected.liquidazione === 'object' && expected.liquidazione != null) {
    failures.push(...compareLiquidazioneRules(liq, expected.liquidazione))
  }

  const bs = actualFlat.batch_summary
  if (expected.batch_summary && typeof expected.batch_summary === 'object' && expected.batch_summary != null) {
    failures.push(...compareBatchSummaryRules(bs, expected.batch_summary))
  }

  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function compareAccountingDataRules(actual, rule) {
  const failures = []
  const a = actual && typeof actual === 'object' ? actual : {}
  if (rule.has_conto === true && !a.has_conto) {
    failures.push({ path: 'accounting_data.has_conto', message: 'atteso conto su documento o righe scrittura' })
  }
  if (rule.min_entry_rows != null) {
    const min = Number(rule.min_entry_rows)
    const n = Number(a.entry_row_count) || 0
    if (n < min) failures.push({ path: 'accounting_data.entry_row_count', message: `attese almeno ${min} righe, trovate ${n}` })
  }
  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function compareIvaRules(actual, rule) {
  const failures = []
  const a = actual && typeof actual === 'object' ? actual : {}
  if (rule.registri_iva != null && typeof rule.registri_iva === 'object' && rule.registri_iva.min_count != null) {
    const min = Number(rule.registri_iva.min_count)
    const n = Number(a.registri_count) || 0
    if (n < min) failures.push({ path: 'iva.registri_iva', message: `attesi almeno ${min} registri IVA, trovati ${n}` })
  }
  if (rule.min_iva_activity_sum != null) {
    const min = Number(rule.min_iva_activity_sum)
    const s = Number(a.iva_activity_sum) || 0
    if (s < min) failures.push({ path: 'iva.iva_activity_sum', message: `attesa somma attività IVA >= ${min}, ottenuta ${s}` })
  }
  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function compareLiquidazioneRules(actual, rule) {
  const failures = []
  const a = actual && typeof actual === 'object' ? actual : {}
  if (rule.row_for_document_month_exists === true && !a.row) {
    failures.push({ path: 'liquidazione.row', message: 'nessuna riga liquidazione_iva per mese/anno documento' })
  }
  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function compareBatchSummaryRules(actual, rule) {
  const failures = []
  const a = actual && typeof actual === 'object' ? actual : {}
  if (rule.min_documents != null) {
    const min = Number(rule.min_documents)
    const n = Number(a.documents_processed) || 0
    if (n < min) failures.push({ path: 'batch_summary.documents_processed', message: `attesi almeno ${min} documenti processati, trovati ${n}` })
  }
  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function compareAiValidationRules(actual, rule) {
  const failures = []
  const pe = rule.primary_entry
  if (!pe || typeof pe !== 'object') return failures

  const act = actual && typeof actual === 'object' ? actual.primary_entry : null
  if (pe.required === true && (act == null || typeof act !== 'object')) {
    failures.push({ path: 'ai_validation.primary_entry', message: 'primary_entry attesa, assente' })
    return failures
  }
  if (!act || typeof act !== 'object') return failures

  if (pe.ai_confidence != null && typeof pe.ai_confidence === 'object') {
    const min = pe.ai_confidence.min != null ? Number(pe.ai_confidence.min) : null
    const max = pe.ai_confidence.max != null ? Number(pe.ai_confidence.max) : null
    const v = act.ai_confidence != null ? Number(act.ai_confidence) : NaN
    if (min != null && (!Number.isFinite(v) || v < min)) {
      failures.push({ path: 'ai_validation.primary_entry.ai_confidence', message: `atteso min ${min}, ottenuto ${act.ai_confidence}` })
    }
    if (max != null && (!Number.isFinite(v) || v > max)) {
      failures.push({ path: 'ai_validation.primary_entry.ai_confidence', message: `atteso max ${max}, ottenuto ${act.ai_confidence}` })
    }
  }

  if (pe.ai_source != null && typeof pe.ai_source === 'object') {
    const src = act.ai_source != null ? String(act.ai_source) : ''
    if (pe.ai_source.equals != null && String(pe.ai_source.equals) !== src) {
      failures.push({ path: 'ai_validation.primary_entry.ai_source', message: `atteso ${pe.ai_source.equals}, ottenuto ${src || '—'}` })
    }
    if (Array.isArray(pe.ai_source.in) && pe.ai_source.in.length && !pe.ai_source.in.includes(src)) {
      failures.push({ path: 'ai_validation.primary_entry.ai_source', message: `atteso uno di ${pe.ai_source.in.join(', ')}, ottenuto ${src || '—'}` })
    }
  }

  if (pe.ai_explanation != null && typeof pe.ai_explanation === 'object') {
    const txt = act.ai_explanation != null ? String(act.ai_explanation) : ''
    const minL = pe.ai_explanation.min_length != null ? Number(pe.ai_explanation.min_length) : null
    if (minL != null && txt.trim().length < minL) {
      failures.push({
        path: 'ai_validation.primary_entry.ai_explanation',
        message: `lunghezza min ${minL}, ottenuta ${txt.trim().length}`,
      })
    }
    if (pe.ai_explanation.contains != null && !txt.includes(String(pe.ai_explanation.contains))) {
      failures.push({ path: 'ai_validation.primary_entry.ai_explanation', message: `atteso testo che contenga ${JSON.stringify(pe.ai_explanation.contains)}` })
    }
  }

  if (pe.ai_status != null && typeof pe.ai_status === 'object' && pe.ai_status.equals != null) {
    const st = act.ai_status != null ? String(act.ai_status) : ''
    if (String(pe.ai_status.equals) !== st) {
      failures.push({ path: 'ai_validation.primary_entry.ai_status', message: `atteso ${pe.ai_status.equals}, ottenuto ${st || '—'}` })
    }
  }

  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function compareInsightRules(actual, rule) {
  const failures = []
  const rows = actual && typeof actual === 'object' && Array.isArray(actual.rows_for_document) ? actual.rows_for_document : []
  const byTipo =
    actual && typeof actual === 'object' && actual.counts_by_tipo && typeof actual.counts_by_tipo === 'object'
      ? actual.counts_by_tipo
      : {}

  if (rule.min_total != null) {
    const min = Number(rule.min_total)
    if (rows.length < min) failures.push({ path: 'insights.min_total', message: `attesi almeno ${min} insight per documento, trovati ${rows.length}` })
  }

  const byRule = rule.by_tipo
  if (byRule && typeof byRule === 'object') {
    for (const [tipo, spec] of Object.entries(byRule)) {
      if (!spec || typeof spec !== 'object') continue
      const n = byTipo[tipo] != null ? Number(byTipo[tipo]) : 0
      if (spec.min_count != null && n < Number(spec.min_count)) {
        failures.push({ path: `insights.by_tipo.${tipo}`, message: `attesi almeno ${spec.min_count}, trovati ${n}` })
      }
    }
  }

  if (rule.require_tipos_present != null && Array.isArray(rule.require_tipos_present)) {
    for (const tipo of rule.require_tipos_present) {
      if (!rows.some((r) => String(r?.tipo) === String(tipo))) {
        failures.push({ path: `insights.tipo.${tipo}`, message: 'nessun insight di questo tipo legato al documento' })
      }
    }
  }

  return failures
}

/**
 * @param {unknown} actual
 * @param {Record<string, unknown>} rule
 */
function comparePipelinePhaseRules(actual, rule) {
  const failures = []
  const steps = actual && typeof actual === 'object' && Array.isArray(actual.steps) ? actual.steps : []
  const names = steps.map((s) => String(s?.step || ''))

  if (Array.isArray(rule.required_order) && rule.required_order.length) {
    let idx = 0
    for (const want of rule.required_order) {
      const j = names.indexOf(String(want), idx)
      if (j < 0) {
        failures.push({ path: 'pipeline_phases.required_order', message: `fase mancante o ordine errato: atteso "${want}" dopo indice ${idx}` })
        break
      }
      idx = j + 1
    }
  }

  if (rule.require_all_ok === true) {
    for (const s of steps) {
      if (String(s?.status) !== 'ok') {
        failures.push({
          path: `pipeline_phases.step.${s?.step || '?'}`,
          message: `stato atteso ok, ottenuto ${s?.status || '—'}${s?.error_message ? `: ${s.error_message}` : ''}`,
        })
      }
    }
  }

  if (rule.require_step_names != null && Array.isArray(rule.require_step_names)) {
    for (const name of rule.require_step_names) {
      if (!names.includes(String(name))) {
        failures.push({ path: 'pipeline_phases.require_step_names', message: `fase "${name}" non presente nel run` })
      }
    }
  }

  return failures
}
