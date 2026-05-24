import { calculateRegistrazioneTotals } from './calculateRegistrazioneTotals.js'
import { normalizeRegistrazioneInput } from './normalizeRegistrazioneInput.js'
import { validateRegistrazioneDraft } from './validateRegistrazioneDraft.js'
import { buildRegistrazioneIvaDraft } from './buildRegistrazioneIvaDraft.js'
import { buildRegistrazionePartitarioDraft } from './buildRegistrazionePartitarioDraft.js'
import { buildRegistrazioneRitenutaDraft } from './buildRegistrazioneRitenutaDraft.js'
import { normalizeRegistrazioneRigheTemplate } from '../../domain/registrazione/normalizeRegistrazioneRigheTemplate.js'
import { buildRegistrazioneRowsFromTemplateResolved } from './buildRegistrazioneRowsFromTemplate.js'
import { buildCausaleStructureHistory } from './buildCausaleStructureHistory.js'
import { resolveRegistrazioneRigheTemplate } from '../../domain/registrazione/resolveRegistrazioneRigheTemplate.js'

function buildRegistrazioneDocumentDraft(normalized = {}, behavior = {}) {
  const documentData = normalized?.documentData || {}
  const header = normalized?.header || {}
  return {
    active: Boolean(behavior?.showDocumentPanel),
    divisa: documentData.divisa || 'EUR',
    cambio: documentData.cambio || '1,000000',
    condizioniPagamento: documentData.condizioniPagamento || '',
    modalitaPagamento: documentData.modalitaPagamento || '',
    totaleImponibile: documentData.totaleImponibile || 0,
    totaleImposte: documentData.totaleImposte || 0,
    totaleDocumento: documentData.totaleDocumento || header.totaleDocumento || 0,
    info: behavior?.showDocumentPanel ? ['Documento predisposto, registri IVA non generati in questa fase'] : [],
  }
}

function buildPnPayload(normalized, totals) {
  const header = normalized?.header || {}
  const causale = header.causaleContabile || {}
  const fallbackSubject = header.descrizioneGenerale || header.numeroDocumento || 'Registrazione manuale'
  const clienteFornitoreId = header.clienteFornitoreId || header.cliente_fornitore_id || null
  const clienteFornitoreNome = header.clienteFornitoreNome || header.cliente_fornitore_nome || null
  const esercizioText = String(header.esercizioContabile || '').trim()
  const esercizio = Number.parseInt(esercizioText, 10)

  return {
    societa_id: header.societaId || null,
    esercizio: Number.isFinite(esercizio) ? esercizio : null,
    data_registrazione: header.dataRegistrazione || null,
    data_documento: header.dataDocumento || header.dataRegistrazione || null,
    numero_documento: header.numeroDocumento || null,
    causale_id: causale.id || causale.codice || null,
    causale_codice: causale.codice || causale.id || null,
    descrizione: fallbackSubject,
    cliente_fornitore_id: clienteFornitoreId,
    cliente_fornitore_nome: clienteFornitoreNome,
    totale_dare: totals.totaleDare,
    totale_avere: totals.totaleAvere,
    stato: 'bozza',
    documento_import_id: null,
  }
}

function buildRighePayload(rows = []) {
  return (Array.isArray(rows) ? rows : []).map((row, index) => ({
    riga_numero: Number.isFinite(Number(row?.riga_numero)) ? Number(row.riga_numero) : index + 1,
    conto_id: row?.conto_id || null,
    conto_codice: row?.conto_codice || null,
    conto_descrizione: row?.conto_descrizione || '',
    descrizione_riga: row?.descrizione || '',
    dare: row?.dare ?? 0,
    avere: row?.avere ?? 0,
  }))
}

export function buildRegistrazioneDraft(input = {}, options = {}) {
  const normalized = normalizeRegistrazioneInput(input, options)
  const behavior = options?.behavior || options?.config || options?.causaleConfig || {}
  const ivaDraft = buildRegistrazioneIvaDraft(
    { header: normalized.header, documentData: normalized.documentData, ivaData: normalized.ivaData, causaliIva: options?.causaliIva || [] },
    { behavior, ...options }
  )
  const templateSource = options?.selectedCausale || options?.causaleContabile || options?.causale || normalized?.header?.causaleContabile || {}
  const normalizedTemplate = normalizeRegistrazioneRigheTemplate(
    templateSource?.righe_prima_nota_template || templateSource?.righePrimaNotaTemplate || templateSource?.righe_prima_nota || []
  )
  const historicalEntries = Array.isArray(options?.historicalEntries) ? options.historicalEntries : []
  const historicalCausaleStructure = buildCausaleStructureHistory({
    societaId: normalized.header.societaId || options?.societaId || '',
    causaleCodice: normalized.header.causaleContabile?.codice || normalized.header.causaleContabile?.id || templateSource?.codice || templateSource?.id || '',
    historicalEntries,
  })
  const resolvedTemplate = resolveRegistrazioneRigheTemplate({
    societaId: normalized.header.societaId || options?.societaId || '',
    causale: templateSource,
    causaleBehavior: behavior,
    soggetto: normalized.header,
    documentData: normalized.documentData,
    ivaDraft,
    causaleTemplateRows: normalizedTemplate.rows,
    historicalCausaleStructure,
    subjectAccountResolution: null,
  })
  const templateRowsDraft = buildRegistrazioneRowsFromTemplateResolved(
    {
      societaId: normalized.header.societaId || options?.societaId || '',
      causale: templateSource,
      selectedCausale: templateSource,
      templateRows: normalizedTemplate.rows,
      resolvedTemplate,
      documentData: normalized.documentData,
      ivaDraft,
      soggetto: normalized.header,
      causaleBehavior: behavior,
      historicalCausaleStructure,
      currentRows: normalized.rows,
      subjectAccountDefaults: {
        conto_id: normalized.header.clienteFornitoreId || normalized.header.cliente_fornitore_id || '',
        conto_codice: normalized.header.clienteFornitoreCodice || normalized.header.cliente_fornitore_codice || '',
        conto_descrizione: normalized.header.clienteFornitoreNome || normalized.header.cliente_fornitore_nome || normalized.header.soggetto || '',
      },
      subjectAccountHistory: historicalCausaleStructure?.accountHints || null,
      procedureDefaults: options?.procedureDefaults || null,
    },
    { force: Boolean(options?.forceTemplateRows) }
  )
  const effectiveRows = templateRowsDraft.applied ? templateRowsDraft.rows : normalized.rows
  const normalizedForDraft = {
    ...normalized,
    rows: effectiveRows,
  }
  const totals = calculateRegistrazioneTotals(normalizedForDraft.rows)
  const documentDraft = buildRegistrazioneDocumentDraft(normalizedForDraft, behavior)
  const partitarioDraft = buildRegistrazionePartitarioDraft({
    header: normalizedForDraft.header,
    documentData: normalizedForDraft.documentData,
    partite: Array.isArray(options?.partite) ? options.partite : Array.isArray(options?.partiteAperte) ? options.partiteAperte : [],
    openItems: Array.isArray(options?.partite) ? options.partite : Array.isArray(options?.partiteAperte) ? options.partiteAperte : [],
    partitarioData: normalizedForDraft.partitarioData,
    currentPartitarioDraft: normalizedForDraft.partitarioData,
    pianoConti: Array.isArray(options?.pianoConti) ? options.pianoConti : [],
    selectedCausale: templateSource,
  }, { behavior, ...options })
  const ritenutaDraft = buildRegistrazioneRitenutaDraft(
    {
      header: normalizedForDraft.header,
      documentData: normalizedForDraft.documentData,
      ivaDraft,
      partitarioDraft,
      ritenutaData: normalizedForDraft.ritenutaData,
      currentRitenutaDraft: normalizedForDraft.ritenutaData,
      percipienti: Array.isArray(options?.percipienti) ? options.percipienti : [],
    },
    { behavior, causaleRitenutaDefaults: options?.causaleRitenutaDefaults || {}, ...options }
  )
  const validation = validateRegistrazioneDraft(
    {
      header: normalizedForDraft.header,
      rows: normalizedForDraft.rows,
      totals,
      documentData: normalizedForDraft.documentData,
      ivaData: normalizedForDraft.ivaData,
      partitarioData: normalizedForDraft.partitarioData,
      ritenutaData: normalizedForDraft.ritenutaData,
    },
    { ...options, behavior, documentDraft, ivaDraft, partitarioDraft, ritenutaDraft }
  )
  const readiness = validation.status === 'ok' ? 'pronto_per_contabilita' : 'incompleto'

  const draft = {
    stato: validation.status === 'ok' ? 'bozza_pronta' : 'bozza_bloccata',
    header: {
      societaId: normalizedForDraft.header.societaId,
      esercizioContabile: normalizedForDraft.header.esercizioContabile,
      dataRegistrazione: normalizedForDraft.header.dataRegistrazione,
      dataDocumento: normalizedForDraft.header.dataDocumento,
      numeroDocumento: normalizedForDraft.header.numeroDocumento,
      causaleContabile: normalizedForDraft.header.causaleContabile,
      descrizioneGenerale: normalizedForDraft.header.descrizioneGenerale,
    },
    rows: normalizedForDraft.rows,
    meta: {
      ...normalizedForDraft.meta,
      behavior: {
        code: behavior?.code || '',
        family: behavior?.family || '',
        showDocumentPanel: Boolean(behavior?.showDocumentPanel),
        showIvaPanel: Boolean(behavior?.showIvaPanel),
        showPartitario: Boolean(behavior?.showPartitario),
        showRitenute: Boolean(behavior?.showRitenute),
      },
      templateRows: {
        source: templateRowsDraft.source || 'none',
        applied: Boolean(templateRowsDraft.applied),
        templateKey: templateRowsDraft.templateKey || '',
        warnings: Array.isArray(templateRowsDraft.warnings) ? templateRowsDraft.warnings : [],
        reasons: Array.isArray(templateRowsDraft.reasons) ? templateRowsDraft.reasons : [],
      },
      panelStatus: {
        document: documentDraft.status || 'ok',
        iva: ivaDraft.status || 'idle',
        partitario: partitarioDraft.status || 'idle',
        ritenute: ritenutaDraft.status || 'idle',
      },
    },
    totals,
    validation,
    readiness,
    documentDraft,
    ivaDraft,
    partitarioDraft,
    ritenutaDraft,
    pnPayload: buildPnPayload(normalizedForDraft, totals),
    righePayload: buildRighePayload(normalizedForDraft.rows),
  }

  return {
    normalized: normalizedForDraft,
    totals,
    validation,
    readiness,
    draft,
    templateRowsDraft,
  }
}
