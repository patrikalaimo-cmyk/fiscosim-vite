/**
 * mergeGuidedImportStateWithTemplate
 *
 * Applica i suggerimenti strutturali di un template locale a uno stato
 * Guida FiscoSim già costruito da statement.
 *
 * REGOLA FONDAMENTALE:
 * - Non sostituisce valori specifici del documento corrente (saldi, IBAN, intestatario)
 *   con valori del vecchio import.
 * - Propone solo dati STRUTTURALI: columnPreset, ignoreSections, multiline, layout.
 * - I campi documento (bank_name, iban, bic, holder, period, balances) restano
 *   quelli dello statement corrente, non quelli memorizzati nel template.
 * - Se il documento corrente ha già un valore affidabile per un campo, non viene
 *   sovrascritto dal template.
 */

/**
 * Campi che appartengono ai dati specifici del documento (estratto conto corrente).
 * Il template NON deve riscrivere questi campi.
 */
const DOCUMENT_SPECIFIC_FIELDS = new Set([
  'bank_name',
  'iban',
  'bic',
  'account_number',
  'holder',
  'period_start',
  'period_end',
  'opening_balance',
  'total_in',
  'total_out',
  'closing_balance',
  'movement_header',
])

/**
 * Applica suggerimenti template a uno stato guida già costruito.
 *
 * @param {object} guidedState - stato costruito da buildGuidedImportInitialStateFromStatement
 * @param {object} templateMatch - { template, score, scoreLevel, reasons }
 * @returns {object} nuovo stato con suggerimenti template applicati
 */
export function mergeGuidedImportStateWithTemplate(guidedState, templateMatch) {
  if (!guidedState || !templateMatch?.matched || !templateMatch?.template) {
    return guidedState
  }

  const tpl = templateMatch.template
  const appliedFields = []

  // ─── columnPreset ─────────────────────────────────────────────────────────
  const newColumnPreset = tpl.columnPreset || guidedState.columnPreset
  if (tpl.columnPreset && tpl.columnPreset !== guidedState.columnPreset) {
    appliedFields.push('columnPreset')
  }

  // ─── ignoreSections ───────────────────────────────────────────────────────
  const tplIgnoreSections = Array.isArray(tpl.ignoreSections) ? tpl.ignoreSections : []
  // Unisce sezioni già suggerite dall'analisi statement con quelle del template
  const currentIgnored = Array.isArray(guidedState.ignoredSections) ? guidedState.ignoredSections : []
  const mergedIgnoreSections = Array.from(new Set([...currentIgnored, ...tplIgnoreSections]))
  if (tplIgnoreSections.length > 0) {
    appliedFields.push('ignoreSections')
  }

  // ─── multiline ────────────────────────────────────────────────────────────
  const newMultilineAttached = tpl.multilineAttached
    ? { attached: true, markedAsNonMovement: false }
    : guidedState.multiline
  if (tpl.multilineAttached && !guidedState.multiline?.attached) {
    appliedFields.push('multilineAttached')
  }

  // ─── fieldsByKey — aggiorna solo fonte per campi strutturali (NON doc-specific) ─
  // Per i campi documento, aggiungiamo solo metadato templateHint ma non cambiamo finalValue
  const newFieldsByKey = { ...guidedState.fieldsByKey }
  const fieldMappings = tpl.fieldMappings || {}

  Object.entries(fieldMappings).forEach(([key, tplField]) => {
    if (DOCUMENT_SPECIFIC_FIELDS.has(key)) {
      // Campo specifico documento: non sovrascriviamo il valore
      // Aggiungiamo solo un metadato templateHint
      if (newFieldsByKey[key]) {
        newFieldsByKey[key] = {
          ...newFieldsByKey[key],
          templateHint: tplField.finalValue,
          templateHintSource: tplField.source || 'template',
        }
      }
    } else {
      // Campo strutturale: aggiorniamo source a "template" se non già confermato
      if (newFieldsByKey[key] && newFieldsByKey[key].status !== 'confirmed') {
        newFieldsByKey[key] = {
          ...newFieldsByKey[key],
          source: 'template',
          status: 'proposed_from_template',
        }
        appliedFields.push(key)
      }
    }
  })

  if (newFieldsByKey.column_preset) {
    newFieldsByKey.column_preset = {
      ...newFieldsByKey.column_preset,
      finalValue: newColumnPreset,
      source: tpl.columnPreset ? 'template_suggestion' : newFieldsByKey.column_preset.source,
      status: tpl.columnPreset ? 'proposed_from_template' : newFieldsByKey.column_preset.status,
    }
  }

  if (newFieldsByKey.ignore_sections) {
    newFieldsByKey.ignore_sections = {
      ...newFieldsByKey.ignore_sections,
      source: tplIgnoreSections.length ? 'template_suggestion' : newFieldsByKey.ignore_sections.source,
      status: tplIgnoreSections.length ? 'proposed_from_template' : newFieldsByKey.ignore_sections.status,
    }
  }

  if (newFieldsByKey.multiline_rows) {
    newFieldsByKey.multiline_rows = {
      ...newFieldsByKey.multiline_rows,
      source: tpl.multilineAttached ? 'template_suggestion' : newFieldsByKey.multiline_rows.source,
      status: tpl.multilineAttached ? 'proposed_from_template' : newFieldsByKey.multiline_rows.status,
    }
  }

  return {
    ...guidedState,
    columnPreset: newColumnPreset,
    ignoredSections: mergedIgnoreSections,
    multiline: newMultilineAttached,
    fieldsByKey: newFieldsByKey,
    templateApplied: true,
    templateContext: {
      applied: true,
      templateId: tpl.templateId,
      templateLabel: tpl.templateLabel,
      score: templateMatch.score,
      scoreLevel: templateMatch.scoreLevel,
      reasons: templateMatch.reasons || [],
      reliability: tpl.reliability || '',
      certificationMode: tpl.certificationMode || '',
      appliedMode: 'suggested_only',
      appliedFields,
      appliedColumnPreset: tpl.columnPreset || null,
      appliedIgnoreSections: tplIgnoreSections,
      appliedMultilineRules: tpl.multilineAttached ? ['attach_multiline'] : [],
    },
    templateAppliedFrom: {
      templateId: tpl.templateId,
      templateLabel: tpl.templateLabel,
      score: templateMatch.score,
      scoreLevel: templateMatch.scoreLevel,
      reasons: templateMatch.reasons || [],
      certificationMode: tpl.certificationMode,
      reliability: tpl.reliability,
      appliedFields,
      appliedColumnPreset: tpl.columnPreset || null,
      appliedIgnoreSections: tplIgnoreSections,
      appliedMultilineAttached: tpl.multilineAttached || false,
      appliedMultilineRules: tpl.multilineAttached ? ['attach_multiline'] : [],
      appliedMode: 'suggested_only',
    },
  }
}
