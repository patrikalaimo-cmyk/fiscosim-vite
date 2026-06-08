import { normalizeText, round2 } from '../canonical_mapper/utils.js'
import { normalizeRegistrazioneAmountInput } from './normalizeRegistrazioneAmountInput.js'
import { buildRegistrazioneContoSelection } from './resolveRegistrazioneConti.js'
import { normalizeRegistrazioneRigheTemplate } from '../../domain/registrazione/normalizeRegistrazioneRigheTemplate.js'
import { resolveRegistrazioneTemplateRowAccount } from './resolveRegistrazioneTemplateRowAccount.js'
import { resolveRegistrazioneRigheTemplate } from '../../domain/registrazione/resolveRegistrazioneRigheTemplate.js'
import { resolveRegistrazioneCausaleBehavior } from '../../domain/registrazione/resolveRegistrazioneCausaleBehavior.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import { resolveIvaDocumentPostingDirection } from '../../domain/causali/resolveIvaDocumentPostingDirection.js'
import { shouldUseTaxableAmountForCounterparty } from './shouldUseTaxableAmountForCounterparty.js'

function toAmountNumber(value) {
  const text = normalizeText(value).replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function amountToInput(value) {
  const amount = toAmountNumber(value)
  return amount > 0 ? normalizeRegistrazioneAmountInput(amount) : ''
}

function isBlankRow(row = {}) {
  const textFields = [
    row?.contoQuery,
    row?.conto_id,
    row?.conto_codice,
    row?.conto_descrizione,
    row?.descrizione,
  ]
  const amountFields = [row?.dare, row?.avere]
  const hasText = textFields.some((value) => normalizeText(value))
  const hasAmount = amountFields.some((value) => {
    const text = normalizeText(value)
    if (!text) return false
    const parsed = Number.parseFloat(text.replace(',', '.'))
    return Number.isFinite(parsed) && Math.abs(parsed) > 0
  })
  const hasFlags = Boolean(row?.manualAmountOverride || row?.autoResidualApplied || row?.manualEdited)
  return !hasText && !hasAmount && !hasFlags
}

function hasManualContent(row = {}) {
  return Boolean(row?.manualEdited || row?.manualAmountOverride)
}

function canAutoApplyTemplateRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return true
  return list.every((row) => {
    if (!row) return true
    if (hasManualContent(row)) return false
    if (row?.templateGenerated) return true
    return isBlankRow(row)
  })
}

function resolveSubjectSelection(soggetto = {}) {
  const source = soggetto && typeof soggetto === 'object' ? soggetto : {}
  const contoId = normalizeText(source.clienteFornitoreId || source.cliente_fornitore_id || source.conto_id || source.id)
  const contoCodice = normalizeText(
    source.clienteFornitoreCodice ||
      source.cliente_fornitore_codice ||
      source.conto_codice ||
      source.codice ||
      source.code ||
      source.sigla
  )
  const contoDescrizione = normalizeText(
    source.clienteFornitoreNome ||
      source.cliente_fornitore_nome ||
      source.conto_descrizione ||
      source.soggetto ||
      source.nome ||
      source.denominazione ||
      source.label ||
      source.title ||
      source.description
  )

  if (!contoId && !contoCodice && !contoDescrizione) return null

  const item = {
    id: contoId,
    codice: contoCodice,
    descrizione: contoDescrizione,
    subjectRole: normalizeText(source.clienteFornitoreTipo || source.cliente_fornitore_tipo),
    is_cliente: normalizeText(source.clienteFornitoreTipo || source.cliente_fornitore_tipo) === 'cliente',
    is_fornitore: normalizeText(source.clienteFornitoreTipo || source.cliente_fornitore_tipo) === 'fornitore',
  }

  return buildRegistrazioneContoSelection(item, contoDescrizione || contoCodice || contoId)
}

function resolveTemplateAccount(row = {}, soggetto = {}) {
  const isSubjectRow = normalizeText(row?.ruolo) === 'soggetto'
  const hasTemplateAccount = Boolean(normalizeText(row?.conto_id) || normalizeText(row?.conto_codice) || normalizeText(row?.conto_descrizione))
  const subject = resolveSubjectSelection(soggetto)

  if (isSubjectRow || (!hasTemplateAccount && normalizeText(row?.formula_importo) === 'totale_documento')) {
    return subject
  }

  if (!hasTemplateAccount) return null

  return buildRegistrazioneContoSelection(
    {
      id: normalizeText(row?.conto_id),
      codice: normalizeText(row?.conto_codice),
      descrizione: normalizeText(row?.conto_descrizione),
      hierarchyType: normalizeText(row?.hierarchyType),
      isTemplateScope: Boolean(row?.isTemplateScope),
    },
    normalizeText(row?.conto_descrizione || row?.conto_codice)
  )
}

function resolveGeneratedRowAccount(row = {}, context = {}) {
  const rowRole = normalizeText(row?.ruolo)
  if (row?.manualSelectionOnly) {
    return {
      selection: {
        id: '',
        codice: '',
        descrizione: '',
        source: 'manual_required',
        confidence: 0,
        reasons: ['conto da selezionare'],
        warnings: ['conto da selezionare'],
      },
      source: 'manual_required',
      confidence: 0,
      reasons: ['conto da selezionare'],
      warnings: ['conto da selezionare'],
    }
  }
  const explicitTemplateAccount = resolveTemplateAccount(row, context?.soggetto || {})
  if (explicitTemplateAccount) {
    const hierarchy = explicitTemplateAccount?.hierarchyType ? explicitTemplateAccount : null
    const selectable = Boolean(explicitTemplateAccount?.isSelectableForRegistrazione)
    const scope = Boolean(explicitTemplateAccount?.hierarchyType === 'conto' || row?.isTemplateScope)
    return {
      selection: explicitTemplateAccount,
      source: selectable ? 'template_row_final' : scope ? 'template_row_scope' : 'template_row_final',
      confidence: 1,
      reasons: [selectable ? 'Template causale risolto' : 'Template causale come scope'],
      warnings: selectable ? [] : ['Template causale usato come scope, conto finale da completare se necessario'],
    }
  }

  const resolved = resolveRegistrazioneTemplateRowAccount({
    rowRole,
    causale: context?.causale,
    causaleBehavior: context?.causaleBehavior,
    soggetto: context?.soggetto,
    societaId: context?.societaId,
    templateRow: row,
    subjectAccountDefaults: context?.subjectAccountDefaults,
    subjectAccountHistory: context?.subjectAccountHistory,
    procedureDefaults: context?.procedureDefaults,
  })

  return {
    selection: resolved,
    source: resolved?.source || 'manual_required',
    confidence: Number(resolved?.confidence || 0),
    reasons: Array.isArray(resolved?.reasons) ? resolved.reasons : [],
    warnings: Array.isArray(resolved?.warnings) ? resolved.warnings : [],
  }
}

function resolveSubjectRowSide(row = {}, selection = null, behavior = {}) {
  if (behavior?.postingDirections?.subjectSide) {
    return behavior.postingDirections.subjectSide
  }

  const selected = selection && typeof selection === 'object' ? selection : {}
  const isFornitore = selected?.is_fornitore || normalizeText(selected?.subjectRole) === 'fornitore'
  const isCliente = selected?.is_cliente || normalizeText(selected?.subjectRole) === 'cliente'
  const isNotaCreditoPassiva = Boolean(behavior?.isNotaCreditoPassiva)
  const isNotaCreditoAttiva = Boolean(behavior?.isNotaCreditoAttiva)

  // Matrice Dare/Avere soggetto:
  //   FF (fattura passiva):  fornitore → Avere
  //   NCF (nota credito passiva): fornitore → Dare  (inversione rispetto a FF)
  //   FC (fattura attiva):   cliente → Dare
  //   NC (nota credito attiva):  cliente → Avere  (inversione rispetto a FC)
  if (isFornitore) return isNotaCreditoPassiva ? 'dare' : 'avere'
  if (isCliente)   return isNotaCreditoAttiva  ? 'avere' : 'dare'

  const explicitSide = normalizeText(row?.lato)
  if (explicitSide === 'dare' || explicitSide === 'avere') return explicitSide
  return 'avere'
}

function resolveIvaRowSide(row = {}, behavior = {}) {
  const isNotaCreditoPassiva = Boolean(behavior?.isNotaCreditoPassiva)
  const isNotaCreditoAttiva = Boolean(behavior?.isNotaCreditoAttiva)
  const explicitSide = normalizeText(row?.lato)
  const respectsExplicitSide = (
    behavior?.documentMode === 'autofattura' ||
    behavior?.ivaMode === 'autofattura' ||
    behavior?.documentMode === 'documento_iva_cee' ||
    behavior?.ivaMode === 'cee'
  )

  if (behavior?.postingDirections?.vatSide && !respectsExplicitSide) {
    return behavior.postingDirections.vatSide
  }

  if (respectsExplicitSide) {
    if (explicitSide === 'dare' || explicitSide === 'avere') return explicitSide
  }

  // Matrice Dare/Avere IVA:
  //   FF (fattura passiva):   IVA credito → Dare
  //   NCF (nota credito passiva): IVA credito → Avere  (inversione rispetto a FF)
  //   FC (fattura attiva):    IVA debito  → Avere
  //   NC (nota credito attiva):   IVA debito  → Dare   (inversione rispetto a FC)
  if (behavior?.isFatturaPassiva && !isNotaCreditoPassiva) return 'dare'
  if (isNotaCreditoPassiva) return 'avere'
  if (behavior?.isFatturaAttiva && !isNotaCreditoAttiva) return 'avere'
  if (isNotaCreditoAttiva) return 'dare'

  if (explicitSide === 'dare' || explicitSide === 'avere') return explicitSide
  return 'dare'
}

function buildManualDocumentEconomicRow(index = 0, behavior = {}) {
  const directions = behavior?.postingDirections
  if (directions) {
    const isAcquisti = directions.registroKind === 'acquisti'
    const isSottrae = directions.segnoRegistro === 'sottrae'
    let label = 'Costo'
    if (isAcquisti) {
      label = isSottrae ? 'Storno costo' : 'Costo'
    } else {
      label = isSottrae ? 'Storno ricavo' : 'Ricavo'
    }
    const side = directions.imputationSide

    return {
      id: `template-row-${index + 1}`,
      riga_numero: index + 1,
      templateGenerated: true,
      templateKey: '',
      manualEdited: false,
      templateScope: false,
      contoQuery: '',
      conto_id: '',
      conto_codice: '',
      conto_descrizione: '',
      hierarchyType: 'sottoconto',
      isTemplateScope: false,
      lato: side,
      formula_importo: 'manuale',
      descrizione: '',
      descrizione_riga: label,
      mastrino_hint: '',
      templateFormula: 'manuale',
      templateSide: side,
      templateSource: 'manual_required',
      templateConfidence: 0,
      templateReasons: ['Conto economico da selezionare'],
      dare: '',
      avere: '',
      obbligatoria: true,
      modificabile: true,
      attiva: true,
      conto_resolved_finale: false,
      contoQueryHint: 'Conto da selezionare',
      autoResidualApplied: false,
      manualAmountOverride: false,
      lastAmountSide: side,
      templateWarnings: ['Conto economico da selezionare'],
      manualSelectionOnly: true,
    }
  }

  const isAttiva = Boolean(behavior?.isFatturaAttiva)
  const isPassiva = Boolean(behavior?.isFatturaPassiva)
  const isNotaCreditoAttiva = Boolean(behavior?.isNotaCreditoAttiva)
  const isNotaCreditoPassiva = Boolean(behavior?.isNotaCreditoPassiva)
  if (!behavior?.showDocumentPanel || !behavior?.showIvaPanel || (!isAttiva && !isPassiva && !isNotaCreditoAttiva && !isNotaCreditoPassiva)) return null

  // Matrice Dare/Avere riga economica (costo/ricavo/storno):
  //   FF: costo → Dare
  //   NCF: storno costo → Avere  (inversione rispetto a FF)
  //   FC: ricavo → Avere
  //   NC: storno ricavo → Dare   (inversione rispetto a FC)
  let side
  let label
  if (isNotaCreditoPassiva) { side = 'avere'; label = 'Storno costo' }
  else if (isNotaCreditoAttiva) { side = 'dare'; label = 'Storno ricavo' }
  else if (isAttiva) { side = 'avere'; label = 'Ricavo' }
  else { side = 'dare'; label = 'Costo' }

  return {
    id: `template-row-${index + 1}`,
    riga_numero: index + 1,
    templateGenerated: true,
    ruolo: normalizeText(row.ruolo),
    templateKey: '',
    manualEdited: false,
    templateScope: false,
    contoQuery: '',
    conto_id: '',
    conto_codice: '',
    conto_descrizione: '',
    hierarchyType: 'sottoconto',
    isTemplateScope: false,
    lato: side,
    formula_importo: 'manuale',
    descrizione: '',
    descrizione_riga: label,
    mastrino_hint: '',
    templateFormula: 'manuale',
    templateSide: side,
    templateSource: 'manual_required',
    templateConfidence: 0,
    templateReasons: ['Conto economico da selezionare'],
    dare: '',
    avere: '',
    obbligatoria: true,
    modificabile: true,
    attiva: true,
    conto_resolved_finale: false,
    contoQueryHint: 'Conto da selezionare',
    autoResidualApplied: false,
    manualAmountOverride: false,
    lastAmountSide: side,
    templateWarnings: ['Conto economico da selezionare'],
    manualSelectionOnly: true,
  }
}

function appendManualDocumentEconomicRow(templateRows = [], behavior = {}) {
  const rows = Array.isArray(templateRows) ? templateRows.slice() : []
  const hasEconomicRow = rows.some((row) => ['costo', 'ricavo'].includes(normalizeText(row?.ruolo)))
  if (hasEconomicRow) return rows
  const manualRow = buildManualDocumentEconomicRow(rows.length, behavior)
  return manualRow ? [...rows, manualRow] : rows
}

function resolveFormulaAmount(formula = '', context = {}, runningTotals = { dare: 0, avere: 0 }, row = {}) {
  const documentData = context?.documentData || {}
  const ivaDraft = context?.ivaDraft || {}
  const causaleBehavior = context?.causaleBehavior || {}
  const causalePolicy = context?.causalePolicy || {}
  const useTaxableAmountForCounterparty = shouldUseTaxableAmountForCounterparty(causalePolicy, causaleBehavior)
  const isSubjectRow = normalizeText(row?.ruolo) === 'soggetto'
  const value = normalizeText(formula)

  if (value === 'totale_documento') {
    if (useTaxableAmountForCounterparty && isSubjectRow) {
      return toAmountNumber(
        documentData.imponibile ||
          documentData.totaleImponibile ||
          ivaDraft.imponibile ||
          ivaDraft.totaleImponibile ||
          documentData.totaleDocumento ||
          documentData.totale_documento ||
          ivaDraft.totaleDocumento ||
          ivaDraft.totale_documento
      )
    }
    return toAmountNumber(documentData.totaleDocumento || documentData.totale_documento || ivaDraft.totaleDocumento || ivaDraft.totale_documento)
  }

  if (value === 'imponibile') {
    return toAmountNumber(documentData.imponibile || documentData.totaleImponibile || ivaDraft.imponibile || ivaDraft.totaleImponibile)
  }

  if (value === 'iva_detraibile') {
    return toAmountNumber(ivaDraft.ivaDetraibile || ivaDraft.ivaDetratta || ivaDraft.imposta || ivaDraft.totaleImposta)
  }

  if (value === 'iva_indetraibile') {
    return toAmountNumber(ivaDraft.ivaIndetraibile || ivaDraft.impostaIndetraibile || 0)
  }

  if (value === 'netto') {
    const netto = documentData.netto
    if (netto !== undefined && netto !== null && normalizeText(netto) !== '') return toAmountNumber(netto)
    const totale = toAmountNumber(documentData.totaleDocumento || documentData.totale_documento)
    return totale > 0 ? totale : 0
  }

  if (value === 'residuo_sbilancio') {
    const differenza = round2((runningTotals?.dare || 0) - (runningTotals?.avere || 0))
    return Math.abs(differenza) > 0 ? Math.abs(differenza) : 0
  }

  return 0
}

function buildGeneratedRow(templateRow = {}, index = 0, context = {}, runningTotals = { dare: 0, avere: 0 }) {
  const row = templateRow && typeof templateRow === 'object' ? templateRow : {}
  const amount = resolveFormulaAmount(row.formula_importo, context, runningTotals, row)
  const accountResolution = resolveGeneratedRowAccount(row, context)
  const selection = accountResolution.selection
  const subjectContext = context?.soggetto && typeof context.soggetto === 'object' ? context.soggetto : {}
  const side = normalizeText(row?.ruolo) === 'soggetto'
    ? resolveSubjectRowSide(row, {
        ...selection,
        subjectRole: normalizeText(subjectContext.clienteFornitoreTipo || subjectContext.cliente_fornitore_tipo || selection?.subjectRole),
        is_cliente: selection?.is_cliente || normalizeText(subjectContext.clienteFornitoreTipo || subjectContext.cliente_fornitore_tipo) === 'cliente',
        is_fornitore: selection?.is_fornitore || normalizeText(subjectContext.clienteFornitoreTipo || subjectContext.cliente_fornitore_tipo) === 'fornitore',
      }, context?.causaleBehavior || {})
    : normalizeText(row?.ruolo) === 'iva'
      ? resolveIvaRowSide(row, context?.causaleBehavior || {})
    : normalizeText(row.lato) === 'avere'
      ? 'avere'
      : 'dare'
  const contoDescrizione = normalizeText(selection?.conto_descrizione || row.conto_descrizione)
  const contoCodice = normalizeText(selection?.codice || selection?.code || selection?.sigla || row.conto_codice || '')
  const contoId = normalizeText(selection?.id || row.conto_id || '')
  const templateScope = Boolean(selection?.hierarchyType === 'conto' || row?.isTemplateScope || accountResolution.source === 'template_row_scope')
  const movable = Boolean(selection?.isSelectableForRegistrazione || (!templateScope && contoId && selection?.hierarchyType === 'sottoconto'))
  const amountText = row.formula_importo === 'manuale' ? '' : amountToInput(amount)
  const dare = side === 'dare' ? amountText : ''
  const avere = side === 'avere' ? amountText : ''
  const nextRunningTotals = {
    dare: round2((runningTotals?.dare || 0) + toAmountNumber(dare)),
    avere: round2((runningTotals?.avere || 0) + toAmountNumber(avere)),
  }

  return {
    id: row.id || `template-row-${index + 1}`,
    riga_numero: index + 1,
    templateGenerated: true,
    manualSelectionOnly: Boolean(row.manualSelectionOnly),
    source: accountResolution.source || context?.templateSource || 'behavior_fallback',
    templateKey: context?.templateKey || '',
    manualEdited: false,
    templateScope,
    contoQuery: selection?.__label || (contoCodice && contoDescrizione ? `${contoCodice} - ${contoDescrizione}` : contoDescrizione || contoCodice || ''),
    conto_id: contoId,
    conto_codice: contoCodice,
    conto_descrizione: contoDescrizione,
    hierarchyType: normalizeText(selection?.hierarchyType || row?.hierarchyType),
    isTemplateScope: templateScope,
    lato: side,
    formula_importo: normalizeText(row.formula_importo) || 'manuale',
    descrizione: normalizeText(row.descrizione_riga || row.descrizione),
    descrizione_riga: normalizeText(row.descrizione_riga),
    mastrino_hint: normalizeText(row.mastrino_hint),
    templateFormula: normalizeText(row.formula_importo) || 'manuale',
    templateSide: side,
    templateSource: accountResolution.source || context?.templateSource || 'behavior_fallback',
    templateConfidence: accountResolution.confidence ?? context?.templateConfidence ?? 0,
    templateReasons: Array.isArray(accountResolution.reasons) ? accountResolution.reasons : [],
    dare,
    avere,
    obbligatoria: Boolean(row.obbligatoria),
    modificabile: row.modificabile !== false,
    attiva: row.attiva !== false,
    conto_resolved_finale: movable,
    contoQueryHint: templateScope ? 'Template scope' : '',
    autoResidualApplied: false,
    manualAmountOverride: false,
    lastAmountSide: side,
    templateWarnings: Array.isArray(accountResolution.warnings) ? accountResolution.warnings : [],
    _runningTotals: nextRunningTotals,
  }
}

export function buildRegistrazioneRowsFromTemplate(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const templateSource = source.templateRows || source.templateRowsTemplate || source.rows || []
  const normalizedTemplate = normalizeRegistrazioneRigheTemplate(templateSource)
  
  const causaleObj = source.causale || source.selectedCausale || {}
  const causalePolicy = buildCausaleContabilePolicy(causaleObj)
  const postingDirections = resolveIvaDocumentPostingDirection(causalePolicy)
  const behavior = options?.behavior || options?.causaleBehavior || source?.causaleBehavior || {}
  const resolvedBehavior = {
    ...behavior,
    postingDirections,
  }

  const templateRows = appendManualDocumentEconomicRow(Array.isArray(normalizedTemplate.rows) ? normalizedTemplate.rows : [], resolvedBehavior)
  const documentData = source.documentData && typeof source.documentData === 'object' ? source.documentData : {}
  const ivaDraft = source.ivaDraft && typeof source.ivaDraft === 'object' ? source.ivaDraft : {}
  const soggetto = source.soggetto && typeof source.soggetto === 'object' ? source.soggetto : {}
  const currentRows = Array.isArray(source.currentRows) ? source.currentRows : []
  const force = Boolean(options.force)
  const hasTemplate = templateRows.length > 0
  const pristineRows = canAutoApplyTemplateRows(currentRows)

  const isChiusuraPartite =
    causalePolicy?.gestionePartitario === 'chiusura' ||
    causalePolicy?.operazionePartite === 'chiude' ||
    causalePolicy?.operazione_partite === 'chiude'

  const hasExistingAmounts = currentRows.some((row) => {
    const dare = Number(String(row?.dare ?? row?.importo_dare ?? 0).replace(',', '.')) || 0
    const avere = Number(String(row?.avere ?? row?.importo_avere ?? 0).replace(',', '.')) || 0
    return Math.abs(dare) > 0.001 || Math.abs(avere) > 0.001
  })

  const canApply = hasTemplate && (force || (pristineRows && !(isChiusuraPartite && hasExistingAmounts)))
  const warnings = []
  const reasons = []

  if (!hasTemplate) {
    reasons.push('Nessun template righe configurato')
    return {
      rows: currentRows,
      applied: false,
      source: 'none',
      warnings,
      reasons,
      templateKey: '',
    }
  }

  const templateKey = templateRows
    .map((row) =>
      [
        row?.ordine,
        row?.conto_id,
        row?.conto_codice,
        row?.conto_descrizione,
        row?.hierarchyType,
        row?.isTemplateScope ? '1' : '0',
        row?.lato,
        row?.formula_importo,
        row?.descrizione_riga,
        row?.obbligatoria ? '1' : '0',
        row?.modificabile ? '1' : '0',
        row?.attiva ? '1' : '0',
      ].join('|')
    )
    .join('~')

  if (!canApply) {
    reasons.push('Righe già modificate manualmente')
    warnings.push('Template disponibile: applicazione automatica sospesa per preservare le modifiche manuali')
    return {
      rows: currentRows,
      applied: false,
      source: 'template',
      warnings: Array.from(new Set([...warnings, ...(normalizedTemplate?.warnings || [])])),
      reasons: Array.from(new Set(reasons)),
      templateKey,
    }
  }

  const generatedRows = []
  let runningTotals = { dare: 0, avere: 0 }

  templateRows.forEach((templateRow, index) => {
    const generated = buildGeneratedRow(templateRow, index, { documentData, ivaDraft, soggetto, templateKey, causaleBehavior: resolvedBehavior, causalePolicy }, runningTotals)
    const { _runningTotals, ...cleanRow } = generated
    generatedRows.push(cleanRow)
    runningTotals = _runningTotals
  })

  reasons.push('Righe proposte da template causale')

  return {
    rows: generatedRows,
    applied: true,
    source: 'template',
    warnings: Array.from(new Set([...warnings, ...(normalizedTemplate?.warnings || [])])),
    reasons: Array.from(new Set(reasons)),
    templateKey,
  }
}

function buildTemplateRowsKey(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) =>
      [
        row?.ordine,
        row?.conto_id,
        row?.conto_codice,
        row?.conto_descrizione,
        row?.hierarchyType,
        row?.isTemplateScope ? '1' : '0',
        row?.lato,
        row?.formula_importo,
        row?.descrizione_riga,
        row?.obbligatoria ? '1' : '0',
        row?.modificabile ? '1' : '0',
        row?.attiva ? '1' : '0',
      ].join('|')
    )
    .join('~')
}

export function buildRegistrazioneRowsFromTemplateResolved(input = {}, options = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const documentData = source.documentData && typeof source.documentData === 'object' ? source.documentData : {}
  const ivaDraft = source.ivaDraft && typeof source.ivaDraft === 'object' ? source.ivaDraft : {}
  const soggetto = source.soggetto && typeof source.soggetto === 'object' ? source.soggetto : {}
  const currentRows = Array.isArray(source.currentRows) ? source.currentRows : []
  const historicalCausaleStructure = source.historicalCausaleStructure && typeof source.historicalCausaleStructure === 'object' ? source.historicalCausaleStructure : null
  const causaleBehavior = source.causaleBehavior && typeof source.causaleBehavior === 'object' ? source.causaleBehavior : {}
  const subjectAccountDefaults = source.subjectAccountDefaults || source.subjectAccountDefault || null
  const subjectAccountHistory = source.subjectAccountHistory || historicalCausaleStructure?.accountHints || null
  const procedureDefaults = source.procedureDefaults || null
  const resolvedCausaleBehavior = source.documentBehavior || source.selectedCausaleBehavior || resolveRegistrazioneCausaleBehavior(source.causale || source.selectedCausale || {}, { useLegacyFallback: false })
  const causaleTypeText = normalizeText(
    source.causale?.tipoDocumento ||
      source.causale?.tipo_documento ||
      source.selectedCausale?.tipoDocumento ||
      source.selectedCausale?.tipo_documento ||
      resolvedCausaleBehavior?.tipoDocumento ||
      ''
  )
  const causaleObj = source.causale || source.selectedCausale || {}
  const causalePolicy = buildCausaleContabilePolicy(causaleObj)
  const causaleCode = normalizeText(causaleObj?.codice || causaleObj?.code || causaleObj?.sigla || causaleObj?.id || '').toUpperCase()
  const causaleRegistroIva = normalizeText(causaleObj?.registroIva || causaleObj?.registro_iva || causalePolicy?.registroIva || ivaDraft?.registroIva || '').toLowerCase()
  const causaleSegno = normalizeText(causaleObj?.segnoRegistroIva || causaleObj?.segno_registro_iva || '').toLowerCase()

  const postingDirections = resolveIvaDocumentPostingDirection(causalePolicy)

  const documentBehavior = {
    ...resolvedCausaleBehavior,
    isFatturaAttiva:      Boolean(resolvedCausaleBehavior?.isFatturaAttiva)  || causalePolicy.isFatturaAttiva || /attiv/.test(causaleTypeText),
    isFatturaPassiva:     Boolean(resolvedCausaleBehavior?.isFatturaPassiva) || causalePolicy.isFatturaPassiva || /passiv/.test(causaleTypeText),
    isNotaCreditoAttiva:  Boolean(resolvedCausaleBehavior?.isNotaCreditoAttiva)  || causalePolicy.isNotaCreditoAttiva || (causalePolicy.notaCredito && !causalePolicy.isNotaCreditoPassiva),
    isNotaCreditoPassiva: Boolean(resolvedCausaleBehavior?.isNotaCreditoPassiva) || causalePolicy.isNotaCreditoPassiva,
    postingDirections,
  }
  const resolvedTemplate =
    source.resolvedTemplate && typeof source.resolvedTemplate === 'object'
      ? source.resolvedTemplate
      : resolveRegistrazioneRigheTemplate({
          societaId: source.societaId || '',
          causale: source.causale || source.selectedCausale || null,
          causaleBehavior,
          soggetto,
          documentData,
          ivaDraft,
          causaleTemplateRows: source.templateRows || source.templateRowsTemplate || source.rows || [],
          historicalCausaleStructure,
          subjectAccountResolution: subjectAccountHistory,
        })
  const templateRows = appendManualDocumentEconomicRow(Array.isArray(resolvedTemplate.templateRows) ? resolvedTemplate.templateRows : [], documentBehavior)
  const force = Boolean(options.force || source.forceTemplateRows)
  const hasTemplate = templateRows.length > 0
  const pristineRows = canAutoApplyTemplateRows(currentRows)

  const isChiusuraPartite =
    causalePolicy?.gestionePartitario === 'chiusura' ||
    causalePolicy?.operazionePartite === 'chiude' ||
    causalePolicy?.operazione_partite === 'chiude'

  const hasExistingAmounts = currentRows.some((row) => {
    const dare = Number(String(row?.dare ?? row?.importo_dare ?? 0).replace(',', '.')) || 0
    const avere = Number(String(row?.avere ?? row?.importo_avere ?? 0).replace(',', '.')) || 0
    return Math.abs(dare) > 0.001 || Math.abs(avere) > 0.001
  })

  const canApply = hasTemplate && (force || (pristineRows && !(isChiusuraPartite && hasExistingAmounts)))
  const warnings = Array.isArray(resolvedTemplate?.warnings) ? [...resolvedTemplate.warnings] : []
  const reasons = Array.isArray(resolvedTemplate?.reasons) ? [...resolvedTemplate.reasons] : []

  if (!hasTemplate) {
    return {
      rows: currentRows,
      applied: false,
      source: resolvedTemplate?.source || 'none',
      warnings,
      reasons,
      templateKey: '',
    }
  }

  const templateKey = buildTemplateRowsKey(templateRows)

  if (!canApply) {
    reasons.push('Righe già modificate manualmente')
    warnings.push('Template disponibile: applicazione automatica sospesa per preservare le modifiche manuali')
    return {
      rows: currentRows,
      applied: false,
      source: resolvedTemplate?.source || 'causale_template',
      warnings: Array.from(new Set(warnings)),
      reasons: Array.from(new Set(reasons)),
      templateKey,
    }
  }

  const generatedRows = []
  let runningTotals = { dare: 0, avere: 0 }

  templateRows.forEach((templateRow, index) => {
    const generated = buildGeneratedRow(
      templateRow,
      index,
      {
        documentData,
        ivaDraft,
        soggetto,
        templateKey,
        societaId: source.societaId || '',
        causaleBehavior: documentBehavior,
        causale: source.causale || source.selectedCausale || null,
        templateSource: resolvedTemplate?.source || 'causale_template',
        templateConfidence: resolvedTemplate?.confidence ?? 1,
        subjectAccountDefaults,
        subjectAccountHistory,
        procedureDefaults,
      },
      runningTotals
    )
    const { _runningTotals, ...cleanRow } = generated
    generatedRows.push(cleanRow)
    runningTotals = _runningTotals
  })

  return {
    rows: generatedRows,
    applied: true,
    source: resolvedTemplate?.source || 'causale_template',
    warnings: Array.from(new Set(warnings)),
    reasons: Array.from(new Set(reasons)),
    templateKey,
  }
}
