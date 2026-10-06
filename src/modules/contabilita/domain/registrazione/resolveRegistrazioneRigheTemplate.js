import { normalizeText } from '../../application/canonical_mapper/utils.js'
import { normalizeRegistrazioneRigheTemplate } from './normalizeRegistrazioneRigheTemplate.js'

function normalizePatternRow(row = {}, index = 0) {
  const source = row && typeof row === 'object' ? row : {}
  return {
    ordine: Number.isFinite(Number(source.ordine)) ? Number(source.ordine) : index + 1,
    ruolo: normalizeText(source.ruolo) || 'altro',
    lato: normalizeText(source.lato) === 'avere' ? 'avere' : 'dare',
    formula_importo: normalizeText(source.formula_importo) || 'manuale',
    conto_id: normalizeText(source.conto_id),
    conto_codice: normalizeText(source.conto_codice),
    conto_descrizione: normalizeText(source.conto_descrizione),
    hierarchyType: normalizeText(source.hierarchyType),
    isTemplateScope: Boolean(source.isTemplateScope),
    descrizione_riga: normalizeText(source.descrizione_riga || source.descrizione || source.ruolo),
    obbligatoria: Boolean(source.obbligatoria),
    modificabile: source.modificabile !== false,
    attiva: source.attiva !== false,
  }
}

function buildBehaviorFallbackRows(causaleBehavior = {}) {
  const behavior = causaleBehavior && typeof causaleBehavior === 'object' ? causaleBehavior : {}
  const rows = []
  if (behavior?.showPartitario || behavior?.requiresSoggetto) {
    rows.push({
      ordine: rows.length + 1,
      ruolo: 'soggetto',
      lato: 'avere',
      formula_importo: 'totale_documento',
      descrizione_riga: 'Soggetto',
      obbligatoria: true,
      modificabile: true,
      attiva: true,
    })
  }
  if (behavior?.showIvaPanel) {
    rows.push({
      ordine: rows.length + 1,
      ruolo: 'iva',
      lato: 'dare',
      formula_importo: 'iva_detraibile',
      descrizione_riga: 'IVA',
      obbligatoria: true,
      modificabile: true,
      attiva: true,
    })
  }
  if (rows.length === 0 && (behavior?.showDocumentPanel || behavior?.showRitenute)) {
    rows.push({
      ordine: 1,
      ruolo: 'altro',
      lato: 'dare',
      formula_importo: 'manuale',
      descrizione_riga: 'Riga manuale',
      obbligatoria: false,
      modificabile: true,
      attiva: true,
    })
  }
  return rows
}

export function resolveRegistrazioneRigheTemplate({
  societaId = '',
  causale = null,
  causaleBehavior = null,
  soggetto = null,
  documentData = null,
  ivaDraft = null,
  causaleTemplateRows = [],
  historicalCausaleStructure = null,
  subjectAccountResolution = null,
} = {}) {
  const normalizedTemplate = normalizeRegistrazioneRigheTemplate(causaleTemplateRows)
  const templateRows = Array.isArray(normalizedTemplate.rows) ? normalizedTemplate.rows : []
  if (templateRows.length) {
    return {
      source: 'causale_template',
      confidence: 1,
      reasons: ['Template righe causale configurato'],
      warnings: Array.isArray(normalizedTemplate.warnings) ? normalizedTemplate.warnings : [],
      templateRows,
    }
  }

  const historical = historicalCausaleStructure && typeof historicalCausaleStructure === 'object' ? historicalCausaleStructure : null
  if (historical?.found && Array.isArray(historical.patternRows) && historical.patternRows.length) {
    return {
      source: 'causale_structure_history',
      confidence: Number(historical.confidence || 0),
      reasons: Array.isArray(historical.reasons) && historical.reasons.length ? historical.reasons : ['Storico causale rilevato'],
      warnings: Array.isArray(historical.warnings) ? historical.warnings : [],
      templateRows: historical.patternRows.map((row, index) => normalizePatternRow(row, index)),
    }
  }

  const fallbackRows = buildBehaviorFallbackRows(causaleBehavior || {})
  return {
    source: 'behavior_fallback',
    confidence: 0.2,
    reasons: ['Nessun template causale o storico disponibile', 'Applicato fallback minimo da behavior'],
    warnings: ['Struttura righe dedotta in modo conservativo'],
    templateRows: fallbackRows.map((row, index) => normalizePatternRow(row, index)),
  }
}
