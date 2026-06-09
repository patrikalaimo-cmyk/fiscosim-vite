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
import { buildIvaPerCassaGirocontoRows } from './buildIvaPerCassaGirocontoRows.js'
import { resolveRegistrazioneSplitPayment } from './resolveRegistrazioneSplitPayment.js'
import { buildSplitPaymentRows } from './buildSplitPaymentRows.js'
import { applyRegistrazioneRitenutaRows } from './applyRegistrazioneRitenutaRows.js'

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
  const templateSource = options?.selectedCausale || options?.causaleContabile || options?.causale || normalized?.header?.causaleContabile || {}
  const splitPayment = resolveRegistrazioneSplitPayment({
    header: normalized.header,
    documentData: normalized.documentData,
    ivaData: normalized.ivaData,
    causaleContabile: templateSource,
    pianoConti: Array.isArray(options?.pianoConti) ? options.pianoConti : [],
  })
  const ivaDraft = buildRegistrazioneIvaDraft(
    { header: normalized.header, documentData: normalized.documentData, ivaData: normalized.ivaData, causaliIva: options?.causaliIva || [] },
    { behavior, causaleContabile: templateSource, splitPayment, ...options }
  )
  const preliminaryRitenutaDraft = buildRegistrazioneRitenutaDraft(
    {
      header: normalized.header,
      documentData: normalized.documentData,
      ivaDraft,
      partitarioDraft: {},
      ritenutaData: normalized.ritenutaData,
      currentRitenutaDraft: normalized.ritenutaData,
      percipienti: Array.isArray(options?.percipienti) ? options.percipienti : [],
      rows: normalized.rows,
      partitarioData: normalized.partitarioData,
      partite: Array.isArray(options?.partite) ? options.partite : [],
      ritenute: Array.isArray(options?.ritenute) ? options.ritenute : [],
    },
    { behavior, causaleRitenutaDefaults: options?.causaleRitenutaDefaults || {}, ...options }
  )
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
      ritenutaDraft: preliminaryRitenutaDraft,
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
  const cleanedEffectiveRows = (Array.isArray(effectiveRows) ? effectiveRows : []).map(row => {
    const q = String(row.contoQuery ?? '').trim();
    const isPlaceholder = q.toLowerCase() === 'descrizione conto non disponibile' || q.toLowerCase() === 'conto da selezionare';
    return {
      ...row,
      contoQuery: isPlaceholder ? '' : row.contoQuery
    };
  });
  const filteredRows = cleanedEffectiveRows.filter(row => {
    const contoId = String(row.conto_id ?? row.contoId ?? '').trim();
    const query = String(row.contoQuery ?? row.conto ?? row.conto_codice ?? row.conto_descrizione ?? '').trim();
    const hasConto = Boolean(contoId || query);
    const dare = Number(row.dare ?? row.importo_dare ?? 0);
    const avere = Number(row.avere ?? row.importo_avere ?? 0);
    const hasAmount = dare !== 0 || avere !== 0;
    // A row without a conto AND without amounts is useless for validation — drop it
    // regardless of description (catches phantom "IVA a debito" rows with 0/0 from old templates)
    if (!hasConto && !hasAmount) {
      return false;
    }
    const desc = String(row.descrizione ?? row.descrizione_riga ?? '').trim();
    const isPlaceholderDesc = !desc || /^riga\s+\d+$/i.test(desc) || desc.toLowerCase() === 'riga contabile' || desc.toLowerCase() === 'riga contabile vuota' || desc.toLowerCase() === 'riga';
    if (!hasConto && !hasAmount && isPlaceholderDesc) {
      return false;
    }
    return hasConto || hasAmount || (!isPlaceholderDesc && desc);
  });
  const splitPaymentRows = buildSplitPaymentRows({
    rows: filteredRows,
    splitPayment,
    ivaDraft,
    documentData: normalized.documentData,
    causale: templateSource,
    header: normalized.header,
    pianoConti: Array.isArray(options?.pianoConti) ? options.pianoConti : [],
  })
  const ritenutaRows = applyRegistrazioneRitenutaRows(splitPaymentRows.rows, preliminaryRitenutaDraft, { causale: templateSource })
  const preliminaryNormalizedForDraft = {
    ...normalized,
    rows: ritenutaRows.rows,
  };
  const partitarioDraft = buildRegistrazionePartitarioDraft({
    header: preliminaryNormalizedForDraft.header,
    documentData: preliminaryNormalizedForDraft.documentData,
    ivaDraft,
    partite: Array.isArray(options?.partite) ? options.partite : Array.isArray(options?.partiteAperte) ? options.partiteAperte : [],
    openItems: Array.isArray(options?.partite) ? options.partite : Array.isArray(options?.partiteAperte) ? options.partiteAperte : [],
    partitarioData: preliminaryNormalizedForDraft.partitarioData,
    currentPartitarioDraft: preliminaryNormalizedForDraft.partitarioData,
    pianoConti: Array.isArray(options?.pianoConti) ? options.pianoConti : [],
    selectedCausale: templateSource,
  }, {
    behavior,
    splitPayment,
    splitPaymentImportoIncassabile: splitPaymentRows.importoIncassabile,
    ...options,
  })
  const ivaPerCassaGiroconto = buildIvaPerCassaGirocontoRows({
    rows: preliminaryNormalizedForDraft.rows,
    causale: templateSource,
    behavior,
    header: preliminaryNormalizedForDraft.header,
    partitarioPreview: partitarioDraft.ivaPerCassaPreview,
    causaliIva: Array.isArray(options?.causaliIva) ? options.causaliIva : [],
    pianoConti: Array.isArray(options?.pianoConti) ? options.pianoConti : [],
  })
  const normalizedForDraft = {
    ...preliminaryNormalizedForDraft,
    rows: ivaPerCassaGiroconto.rows,
  }
  const totals = calculateRegistrazioneTotals(normalizedForDraft.rows)
  const documentDraft = buildRegistrazioneDocumentDraft(normalizedForDraft, behavior)
  const ritenutaDraft = buildRegistrazioneRitenutaDraft(
    {
      header: normalized.header,
      documentData: normalized.documentData,
      ivaDraft,
      partitarioDraft,
      partitarioData: normalized.partitarioData,
      ritenutaData: normalized.ritenutaData,
      currentRitenutaDraft: normalized.ritenutaData,
      percipienti: Array.isArray(options?.percipienti) ? options.percipienti : [],
      rows: normalized.rows,
      partite: Array.isArray(options?.partite) ? options.partite : [],
      ritenute: Array.isArray(options?.ritenute) ? options.ritenute : [],
    },
    { behavior, causaleRitenutaDefaults: options?.causaleRitenutaDefaults || {}, ...options }
  )
  const baseValidation = validateRegistrazioneDraft(
    {
      header: normalizedForDraft.header,
      rows: normalizedForDraft.rows,
      totals,
      documentData: normalizedForDraft.documentData,
      ivaData: ivaDraft,
      partitarioData: partitarioDraft,
      ritenutaData: ritenutaDraft,
    },
    { ...options, behavior, documentDraft, ivaDraft, partitarioDraft, ritenutaDraft }
  )
  const girocontoBlockers = Array.isArray(ivaPerCassaGiroconto.blockers) ? ivaPerCassaGiroconto.blockers : []
  const splitPaymentBlockers = Array.isArray(splitPaymentRows.blockers) ? splitPaymentRows.blockers : []
  const technicalBlockers = [...girocontoBlockers, ...splitPaymentBlockers, ...(ritenutaRows.blockers || [])]
  const validation = technicalBlockers.length
    ? {
        ...baseValidation,
        status: 'blocked',
        blockers: Array.from(new Set([...technicalBlockers, ...(baseValidation.blockers || [])])),
      }
    : baseValidation
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
      soggetto: normalizedForDraft.header.soggetto,
      clienteFornitoreId: normalizedForDraft.header.clienteFornitoreId,
      clienteFornitoreNome: normalizedForDraft.header.clienteFornitoreNome,
      clienteFornitoreCodice: normalizedForDraft.header.clienteFornitoreCodice,
      clienteFornitoreTipo: normalizedForDraft.header.clienteFornitoreTipo,
      cliente_fornitore_id: normalizedForDraft.header.clienteFornitoreId,
      cliente_fornitore_nome: normalizedForDraft.header.clienteFornitoreNome,
      cliente_fornitore_codice: normalizedForDraft.header.clienteFornitoreCodice,
      cliente_fornitore_tipo: normalizedForDraft.header.clienteFornitoreTipo,
      splitPayment: Boolean(normalizedForDraft.header.splitPayment || normalizedForDraft.header.split_payment),
      split_payment: Boolean(normalizedForDraft.header.splitPayment || normalizedForDraft.header.split_payment),
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
      ivaPerCassaGiroconto: {
        active: Boolean(ivaPerCassaGiroconto.active),
        direction: ivaPerCassaGiroconto.direction || '',
        totalRelease: ivaPerCassaGiroconto.totalRelease || 0,
        blockers: girocontoBlockers,
      },
      splitPayment: {
        ...splitPayment,
        ivaSplit: splitPaymentRows.ivaSplit,
        importoIncassabile: splitPaymentRows.importoIncassabile,
        blockerCode: splitPaymentRows.blockerCode || splitPayment?.blockerCode || '',
        blockerMessage: splitPaymentRows.blockerMessage || splitPayment?.blockerMessage || '',
        blockers: splitPaymentBlockers,
      },
      ritenute: {
        appliedToRows: Boolean(ritenutaRows.applied),
        blockers: Array.isArray(ritenutaRows.blockers) ? ritenutaRows.blockers : [],
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
    documentDraft,
    ivaDraft,
    partitarioDraft,
    ritenutaDraft,
  }
}
