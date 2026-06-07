import { createEmptyCanonicalAccountingPayload } from '../canonicalAccountingPayload.defaults.js'
import { validateCanonicalAccountingPayload } from '../validateCanonicalAccountingPayload.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import { CANONICAL_ACCOUNTING_VAT_REGISTER_TYPES } from '../canonicalAccountingPayload.schema.js'


function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value) {
  return String(value ?? '').trim()
}

function toNumber(value) {
  if (value === '' || value == null) return null
  const parsed = Number(String(value).replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null
}

function numberOrZero(...values) {
  for (const value of values) {
    const parsed = toNumber(value)
    if (parsed !== null) return parsed
  }
  return 0
}

function firstText(...values) {
  for (const value of values) {
    const parsed = text(value)
    if (parsed) return parsed
  }
  return ''
}

function derivePeriod(value) {
  const parsed = text(value)
  if (parsed.length >= 7) return parsed.slice(0, 7)
  return ''
}

function resolveManualDraft(registrazioneDraftResult = {}) {
  if (isPlainObject(registrazioneDraftResult?.draft)) {
    return {
      root: registrazioneDraftResult,
      draft: registrazioneDraftResult.draft,
      normalized: isPlainObject(registrazioneDraftResult.normalized) ? registrazioneDraftResult.normalized : null,
    }
  }

  if (isPlainObject(registrazioneDraftResult)) {
    return {
      root: registrazioneDraftResult,
      draft: registrazioneDraftResult,
      normalized: isPlainObject(registrazioneDraftResult.normalized) ? registrazioneDraftResult.normalized : null,
    }
  }

  return {
    root: {},
    draft: {},
    normalized: null,
  }
}

function buildBehaviorSummary(draft = {}) {
  const behavior = isPlainObject(draft?.meta?.behavior) ? draft.meta.behavior : {}
  return {
    code: text(behavior.code),
    family: text(behavior.family),
    showDocumentPanel: Boolean(behavior.showDocumentPanel),
    showIvaPanel: Boolean(behavior.showIvaPanel),
    showPartitario: Boolean(behavior.showPartitario),
    showRitenute: Boolean(behavior.showRitenute),
  }
}

function buildSourceMeta(draft = {}, normalized = null) {
  const behavior = buildBehaviorSummary(draft)
  const panelStatus = isPlainObject(draft?.meta?.panelStatus) ? draft.meta.panelStatus : {}
  const templateRows = isPlainObject(draft?.meta?.templateRows) ? draft.meta.templateRows : {}
  return {
    sourceMode: text(normalized?.meta?.sourceMode || draft?.meta?.sourceMode || 'manuale'),
    behavior,
    panelStatus: {
      document: text(panelStatus.document),
      iva: text(panelStatus.iva),
      partitario: text(panelStatus.partitario),
      ritenute: text(panelStatus.ritenute),
    },
    templateRows: {
      source: text(templateRows.source),
      applied: Boolean(templateRows.applied),
    },
  }
}

function buildSubjectCandidate({
  role,
  tipoSoggetto,
  anagraficaId = '',
  pianoContiIdPatrimoniale = '',
  denominazione = '',
  codiceFiscale = '',
  partitaIva = '',
  paese = '',
}) {
  if (!text(role) || !text(tipoSoggetto)) return null
  if (!text(anagraficaId) && !text(pianoContiIdPatrimoniale) && !text(denominazione) && !text(codiceFiscale) && !text(partitaIva)) return null
  return {
    role: text(role),
    tipoSoggetto: text(tipoSoggetto),
    anagraficaId: text(anagraficaId),
    pianoContiIdPatrimoniale: text(pianoContiIdPatrimoniale),
    denominazione: text(denominazione),
    codiceFiscale: text(codiceFiscale),
    partitaIva: text(partitaIva),
    paese: text(paese),
  }
}

function subjectKey(subject = {}) {
  return [
    text(subject.role),
    text(subject.anagraficaId),
    text(subject.pianoContiIdPatrimoniale),
    text(subject.codiceFiscale),
    text(subject.partitaIva),
    text(subject.denominazione).toLowerCase(),
  ].join('|')
}

function addSubject(subjects, subject) {
  if (!subject) return
  const key = subjectKey(subject)
  if (!subjects.some((item) => subjectKey(item) === key)) subjects.push(subject)
}

function buildSubjects(draft = {}) {
  const subjects = []
  const header = isPlainObject(draft?.header) ? draft.header : {}
  const partitarioDraft = isPlainObject(draft?.partitarioDraft) ? draft.partitarioDraft : {}
  const ritenutaDraft = isPlainObject(draft?.ritenutaDraft) ? draft.ritenutaDraft : {}
  const percipienteRecord = isPlainObject(ritenutaDraft.percipienteRecord) ? ritenutaDraft.percipienteRecord : {}

  const primarySubject = buildSubjectCandidate({
    role: 'primary',
    tipoSoggetto: 'controparte',
    anagraficaId: header.clienteFornitoreId || header.cliente_fornitore_id || partitarioDraft.soggettoId || partitarioDraft.selectedControparteId,
    pianoContiIdPatrimoniale: partitarioDraft.pianoContiIdPatrimoniale || '',
    denominazione: header.clienteFornitoreNome || header.cliente_fornitore_nome || header.soggetto || partitarioDraft.soggettoNome || partitarioDraft.selectedControparteNome,
    codiceFiscale: header.clienteFornitoreCodice || header.cliente_fornitore_codice || '',
    partitaIva: header.clienteFornitorePartitaIva || header.cliente_fornitore_partita_iva || '',
    paese: header.paese || '',
  })
  addSubject(subjects, primarySubject)

  const counterpartySubject = buildSubjectCandidate({
    role: 'counterparty',
    tipoSoggetto: 'controparte',
    anagraficaId: partitarioDraft.soggettoId || partitarioDraft.selectedControparteId,
    pianoContiIdPatrimoniale: partitarioDraft.pianoContiIdPatrimoniale || '',
    denominazione: partitarioDraft.soggettoNome || partitarioDraft.selectedControparteNome,
    codiceFiscale: partitarioDraft.codiceFiscale || '',
    partitaIva: partitarioDraft.partitaIva || '',
    paese: partitarioDraft.paese || '',
  })
  addSubject(subjects, counterpartySubject)

  const withholdingSubject = buildSubjectCandidate({
    role: 'withholdingRecipient',
    tipoSoggetto: 'percipiente',
    anagraficaId: ritenutaDraft.percipienteId || percipienteRecord.id || '',
    denominazione: ritenutaDraft.percipienteNome || percipienteRecord.denominazione || percipienteRecord.nome || ritenutaDraft.percipiente || '',
    codiceFiscale: ritenutaDraft.codiceFiscale || percipienteRecord.codiceFiscale || percipienteRecord.cf || '',
    partitaIva: percipienteRecord.partitaIva || percipienteRecord.partita_iva || '',
    paese: percipienteRecord.paese || '',
    pianoContiIdPatrimoniale: '',
  })
  addSubject(subjects, withholdingSubject)

  return subjects
}

function normalizeAccountingRows(draft = {}) {
  const rows = Array.isArray(draft?.righePayload)
    ? draft.righePayload
    : Array.isArray(draft?.rows)
      ? draft.rows
      : []

  const activeRows = rows.filter(row => {
    const query = String(row.contoQuery ?? row.conto ?? row.conto_id ?? row.accountId ?? '').trim()
    const isPlaceholder = query.toLowerCase() === 'descrizione conto non disponibile' || query.toLowerCase() === 'conto da selezionare';
    const cleanQuery = isPlaceholder ? '' : query;
    const dare = Number(row.dare ?? row.importo_dare ?? 0)
    const avere = Number(row.avere ?? row.importo_avere ?? 0)
    const desc = String(row.descrizione ?? row.descrizione_riga ?? '').trim()
    return cleanQuery || dare > 0 || avere > 0 || desc
  })

  return activeRows.map((row, index) => {
    const dare = numberOrZero(row?.dare, row?.importo_dare)
    const avere = numberOrZero(row?.avere, row?.importo_avere)
    const q = String(row.contoQuery ?? '').trim();
    const isPlaceholder = q.toLowerCase() === 'descrizione conto non disponibile' || q.toLowerCase() === 'conto da selezionare';
    return {
      ...row,
      rowNumber: Number.isFinite(Number(row?.riga_numero)) ? Number(row.riga_numero) : index + 1,
      accountId: text(row?.conto_id || row?.accountId),
      accountCode: text(row?.conto_codice || row?.accountCode),
      accountDescription: text(row?.conto_descrizione || row?.accountDescription),
      contoQuery: isPlaceholder ? '' : row.contoQuery,
      description: text(row?.descrizione_riga || row?.descrizione || row?.description),
      dare,
      avere,
      amount: dare > 0 ? dare : avere,
    }
  })
}

function resolveRegisterType(draft) {
  const header = isPlainObject(draft?.header) ? draft.header : {}
  const causale = isPlainObject(header?.causaleContabile) ? header.causaleContabile : {}
  const policy = buildCausaleContabilePolicy(causale)
  const ivaDraft = isPlainObject(draft?.ivaDraft) ? draft.ivaDraft : {}
  
  // 1. policy causale contabile / tipo causale / tipo documento / codice registro IVA
  let reg = ''
  
  if (policy.isNotaCreditoPassiva || policy.isFatturaPassiva || String(policy.typeCausale || '').toLowerCase().includes('passiv') || String(policy.tipoDocumento || '').toLowerCase().includes('passiv')) {
    reg = 'acquisti'
  } else if (policy.isNotaCreditoAttiva || policy.isFatturaAttiva || String(policy.typeCausale || '').toLowerCase().includes('attiv') || String(policy.tipoDocumento || '').toLowerCase().includes('attiv')) {
    reg = 'vendite'
  } else if (policy.isCorrispettivo) {
    reg = 'corrispettivi'
  }
  
  if (!reg && policy.registroIva) {
    const r = String(policy.registroIva).toLowerCase()
    if (r.includes('acq') || r === '01' || r === 'acquisti') {
      reg = 'acquisti'
    } else if (r.includes('ven') || r === '02' || r === 'vendite') {
      reg = 'vendite'
    } else if (r.includes('corr') || r === '03' || r === 'corrispettivi') {
      reg = 'corrispettivi'
    }
  }

  // 2. registro IVA esplicito presente nel draft/pannello IVA
  if (!reg && (ivaDraft.registroIva || ivaDraft.registerType)) {
    const r = String(ivaDraft.registroIva || ivaDraft.registerType).toLowerCase()
    if (r.includes('acq') || r === '01' || r === 'acquisti') {
      reg = 'acquisti'
    } else if (r.includes('ven') || r === '02' || r === 'vendite') {
      reg = 'vendite'
    } else if (r.includes('corr') || r === '03' || r === 'corrispettivi') {
      reg = 'corrispettivi'
    } else if (CANONICAL_ACCOUNTING_VAT_REGISTER_TYPES.includes(r)) {
      reg = r
    }
  }

  // 3. mapping tecnico da codice registro, se già presente
  if (!reg && causale.codice_registro_iva) {
    const r = String(causale.codice_registro_iva).toLowerCase()
    if (r === '01') {
      reg = 'acquisti'
    } else if (r === '02') {
      reg = 'vendite'
    } else if (r === '03') {
      reg = 'corrispettivi'
    }
  }

  // 4. fallback da codice causale (FF, FC, NCF, NCC, ecc.)
  if (!reg && (causale.codice || draft?.pnPayload?.causale_codice)) {
    const code = String(causale.codice || draft?.pnPayload?.causale_codice || '').toUpperCase()
    if (code === 'FF' || code === 'NCF') {
      reg = 'acquisti'
    } else if (code === 'FC' || code === 'NCC') {
      reg = 'vendite'
    }
  }

  return reg
}

function normalizeVatRows(draft = {}) {
  const ivaDraft = isPlainObject(draft?.ivaDraft) ? draft.ivaDraft : {}
  const rows = Array.isArray(ivaDraft.rows) ? ivaDraft.rows : []
  const registerType = resolveRegisterType(draft) || text(ivaDraft.registroIva || ivaDraft.registerType)
  const sezionale = text(ivaDraft.sezionale)
  const protocolNumber = text(ivaDraft.protocolloDefinitivo || ivaDraft.protocolloProvvisorio || ivaDraft.protocolNumber)
  const competencePeriod = text(ivaDraft.competencePeriod || derivePeriod(ivaDraft.dataCompetenza))

  return {
    enabled: Boolean(ivaDraft.enabled || ivaDraft.active || rows.length),
    rows: rows.map((row, index) => {
      const civId = text(row?.causaleIvaId || ivaDraft.causaleIvaId);
      const civ = text(row?.causaleIva || row?.causaleIvaLabel || ivaDraft.causaleIva || ivaDraft.causaleIvaDescrizione);
      return {
        ...row,
        rowNumber: Number.isFinite(Number(row?.riga)) ? Number(row.riga) : index + 1,
        registerType: text(row?.registerType || registerType),
        sezionale: text(row?.sezionale || sezionale),
        protocolNumber: text(row?.protocolNumber || row?.protocolloProvvisorio || protocolNumber),
        competencePeriod: text(row?.competencePeriod || row?.competenzaIva || competencePeriod),
        causaleIvaId: civId.toLowerCase() === 'da selezionare' ? '' : civId,
        causaleIva: civ.toLowerCase() === 'da selezionare' ? '' : civ,
        imponibile: numberOrZero(row?.imponibile, row?.taxable, ivaDraft.imponibile, ivaDraft.totaleImponibile),
        imposta: numberOrZero(row?.imposta, row?.tax, ivaDraft.totaleIva, ivaDraft.totaleImposta),
        aliquota: row?.aliquota ?? row?.rate ?? ivaDraft.aliquota ?? ivaDraft.aliquotaIva ?? '',
        natura: text(row?.natura || ivaDraft.natura || ivaDraft.naturaIva),
        detraibilitaPercent: numberOrZero(row?.detraibilitaPercent, row?.percentualeDetraibilita, ivaDraft.percentualeDetraibilita),
        indetraibileAmount: numberOrZero(row?.indetraibileAmount, row?.ivaIndetraibile, ivaDraft.ivaIndetraibile),
        splitPayment: Boolean(row?.splitPayment || ivaDraft.splitPayment),
        reverseCharge: Boolean(row?.reverseCharge || ivaDraft.reverseCharge),
        ivaPerCassa: Boolean(row?.ivaPerCassa || ivaDraft.ivaPerCassa),
        proRata: text(row?.proRata || ivaDraft.proRata),
        esigibilita: ['immediata', 'differita', 'rilascio'].includes(String(row?.esigibilita || ivaDraft?.esigibilita || '').trim().toLowerCase())
          ? String(row?.esigibilita || ivaDraft.esigibilita).trim().toLowerCase()
          : 'immediata',
        origin_registro_iva_id: text(row?.origin_registro_iva_id || row?.originRegistroIvaId) || null,
      };
    }),
    registerType,
    sezionale,
    protocolNumber,
    competencePeriod,
    causaleIvaId: text(ivaDraft.causaleIvaId).toLowerCase() === 'da selezionare' ? '' : text(ivaDraft.causaleIvaId),
    causaleIva: text(ivaDraft.causaleIva || ivaDraft.causaleIvaDescrizione).toLowerCase() === 'da selezionare' ? '' : text(ivaDraft.causaleIva || ivaDraft.causaleIvaDescrizione),
    aliquota: ivaDraft.aliquota ?? ivaDraft.aliquotaIva ?? '',
    natura: text(ivaDraft.natura || ivaDraft.naturaIva),
    imponibile: numberOrZero(ivaDraft.imponibile, ivaDraft.totaleImponibile),
    imposta: numberOrZero(ivaDraft.totaleIva, ivaDraft.totaleImposta),
    detraibilitaPercent: numberOrZero(ivaDraft.percentualeDetraibilita),
    indetraibileAmount: numberOrZero(ivaDraft.ivaIndetraibile),
    esigibilita: text(ivaDraft.esigibilita),
    splitPayment: Boolean(ivaDraft.splitPayment),
    reverseCharge: Boolean(ivaDraft.reverseCharge),
    reverseChargeMode: text(ivaDraft.reverseChargeMode),
    ivaPerCassa: Boolean(ivaDraft.ivaPerCassa),
    proRata: text(ivaDraft.proRata),
    autofattura: Boolean(ivaDraft.autofattura),
    integrazioneEstero: Boolean(ivaDraft.integrazioneEstero),
  }
}

function resolveLedgerMode(partitarioDraft = {}) {
  const draftMode = text(partitarioDraft.mode || partitarioDraft.tipoMovimento).toLowerCase()
  const rowActions = new Set((Array.isArray(partitarioDraft.rows) ? partitarioDraft.rows : []).map((row) => text(row?.action || (text(row?.tipoMovimento).toLowerCase() === 'chiusura' ? 'close' : text(row?.tipoMovimento).toLowerCase() === 'apertura' ? 'open' : '')).toLowerCase()))
  if (draftMode === 'mixed' || (rowActions.has('open') && rowActions.has('close'))) return 'mixed'
  if (draftMode === 'open' || draftMode === 'apertura' || rowActions.has('open')) return 'open'
  if (draftMode === 'close' || draftMode === 'chiusura' || rowActions.has('close')) return 'close'
  return 'none'
}

function normalizeLedgerRows(draft = {}, policy = {}, totalDocument = 0) {
  const partitarioDraft = isPlainObject(draft?.partitarioDraft) ? draft.partitarioDraft : {}
  let rows = Array.isArray(partitarioDraft.rows) ? partitarioDraft.rows : []
  const mode = resolveLedgerMode(partitarioDraft)

  if (rows.length === 0 && policy.gestionePartitario === 'apertura') {
    const isPassiva = policy.isFatturaPassiva || policy.isNotaCreditoPassiva
    const subjectTipo = isPassiva ? 'fornitore' : 'cliente'
    const subjectId = draft.header?.clienteFornitoreId || draft.pnPayload?.cliente_fornitore_id || ''
    const subjectNome = draft.header?.clienteFornitoreNome || draft.pnPayload?.cliente_fornitore_nome || ''
    const docNum = draft.header?.numeroDocumento || draft.pnPayload?.numero_documento || draft.pnPayload?.numero_registrazione || ''
    const docDate = draft.header?.dataDocumento || draft.pnPayload?.data_documento || draft.pnPayload?.data_registrazione || ''
    const amount = totalDocument || numberOrZero(draft?.totals?.totaleDare)

    rows = [{
      soggettoId: subjectId,
      soggettoNome: subjectNome,
      soggettoTipo: subjectTipo,
      numeroDocumento: docNum,
      dataDocumento: docDate,
      tipoDocumento: draft.documentDraft?.tipoDocumento || (isPassiva ? 'FF' : 'FC'),
      importoAperto: amount,
      importoOriginario: amount,
      action: 'open'
    }]
  }

  const enabled = Boolean(partitarioDraft.enabled || partitarioDraft.active || rows.length || policy.gestionePartitario === 'apertura')
  const resolvedMode = mode === 'none' && policy.gestionePartitario === 'apertura' ? 'open' : mode

  return {
    enabled,
    mode: resolvedMode,
    accountId: text(partitarioDraft.accountId || partitarioDraft.contoId || partitarioDraft.selectedPartitaId),
    subjectId: text(partitarioDraft.subjectId || partitarioDraft.soggettoId || partitarioDraft.selectedControparteId || draft.header?.clienteFornitoreId || draft.pnPayload?.cliente_fornitore_id),
    rows: rows.map((row, index) => {
      const action = text(row?.action || (resolvedMode === 'close' ? 'close' : resolvedMode === 'open' ? 'open' : ''))
      return {
        ...row,
        rowNumber: Number.isFinite(Number(row?.riga)) ? Number(row.riga) : index + 1,
        action,
        documentRef: text(row?.documentRef || row?.numeroDocumento || row?.selectedPartitaNumeroDocumento),
        openItemId: text(row?.openItemId || row?.selectedPartitaId || row?.id),
        amount: numberOrZero(row?.amount, row?.importoAperto, row?.importoChiusura, row?.importoOriginario, row?.importoOrigine),
        dueDate: text(row?.dueDate || row?.dataScadenza),
        paymentDate: text(row?.paymentDate || row?.dataPagamento),
        residualAmount: numberOrZero(row?.residualAmount, row?.residuo, row?.selectedPartitaSaldoResiduo),
      }
    }),
  }
}

function normalizeWithholdingRows(draft = {}) {
  const ritenutaDraft = isPlainObject(draft?.ritenutaDraft) ? draft.ritenutaDraft : {}
  const rows = Array.isArray(ritenutaDraft.rows) ? ritenutaDraft.rows : []
  const mode = text(ritenutaDraft.mode).toLowerCase()
  const eventType = mode === 'pagamento' ? 'payment' : 'document'
  const recipientRecord = isPlainObject(ritenutaDraft.percipienteRecord) ? ritenutaDraft.percipienteRecord : null
  const recipient = recipientRecord
    ? {
        role: 'withholdingRecipient',
        tipoSoggetto: 'percipiente',
        anagraficaId: text(ritenutaDraft.percipienteId || recipientRecord.id),
        denominazione: text(ritenutaDraft.percipienteNome || recipientRecord.denominazione || recipientRecord.nome || ritenutaDraft.percipiente),
        codiceFiscale: text(ritenutaDraft.codiceFiscale || recipientRecord.codiceFiscale || recipientRecord.cf),
        partitaIva: text(recipientRecord.partitaIva || recipientRecord.partita_iva),
        paese: text(recipientRecord.paese),
      }
    : null

  return {
    enabled: Boolean(ritenutaDraft.enabled || ritenutaDraft.active || rows.length),
    eventType,
    recipient,
    rows: rows.map((row, index) => ({
      ...row,
      rowNumber: Number.isFinite(Number(row?.riga)) ? Number(row.riga) : index + 1,
      baseAmount: numberOrZero(row?.baseAmount, row?.baseRitenuta, row?.baseImponibile, row?.imponibileSoggettoRitenuta, row?.imponibileReddito, row?.imponibile),
      rate: numberOrZero(row?.rate, row?.aliquotaRitenuta),
      amount: numberOrZero(row?.amount, row?.ritenuta),
      netPaid: numberOrZero(row?.netPaid, row?.netto),
      causaleCu: text(row?.causaleCu || ritenutaDraft.causaleCu),
      paymentDate: text(row?.paymentDate || row?.dataPagamento || ritenutaDraft.dataPagamento),
      dueDateF24: text(row?.dueDateF24),
      tributeCode: text(row?.tributeCode || row?.codiceTributo || ritenutaDraft.codiceTributo),
      period: text(row?.period || derivePeriod(row?.paymentDate || row?.dataPagamento || ritenutaDraft.dataPagamento || draft?.header?.dataDocumento)),
    })),
    recipient,
  }
}

function buildCompletezzaDati(payload = {}) {
  return {
    source: Boolean(text(payload?.source?.module)),
    company: Boolean(text(payload?.company?.societaId)),
    header: Boolean(text(payload?.header?.descrizione) || text(payload?.header?.causaleContabile?.id) || text(payload?.header?.causaleContabile?.codice)),
    subjects: Array.isArray(payload?.subjects) && payload.subjects.length > 0,
    document: Boolean(payload?.document?.numeroDocumento || payload?.document?.dataDocumento || payload?.document?.totals),
    accounting: Array.isArray(payload?.accounting?.rows) && payload.accounting.rows.length > 0,
    vat: Array.isArray(payload?.vat?.rows) && payload.vat.rows.length > 0,
    ledger: Array.isArray(payload?.ledger?.rows) && payload.ledger.rows.length > 0,
    withholding: Array.isArray(payload?.withholding?.rows) && payload.withholding.rows.length > 0,
    attachments: Boolean(payload?.attachments?.sourceFile || payload?.attachments?.xml || payload?.attachments?.pdf || payload?.attachments?.p7m),
    audit: Boolean(text(payload?.audit?.sourceModule)),
  }
}

function buildValidationSnapshot(payload = {}, draft = {}) {
  const draftValidation = isPlainObject(draft?.validation) ? draft.validation : {}
  const draftTotals = isPlainObject(draft?.totals) ? draft.totals : {}
  const isBalanced = Boolean(draftValidation.isBalanced ?? draftTotals.isBalanced)
  const difference = Number.isFinite(Number(draftValidation?.totals?.differenza))
    ? Number(draftValidation.totals.differenza)
    : Number.isFinite(Number(draftTotals.differenza))
      ? Number(draftTotals.differenza)
      : 0
  const status = text(draftValidation.status)
  const readiness = status === 'blocked' ? 'blocked' : status === 'warning' ? 'draft' : 'draft'

  return {
    errors: Array.isArray(draftValidation.blockers) ? [...draftValidation.blockers] : [],
    warnings: Array.isArray(draftValidation.warnings) ? [...draftValidation.warnings] : [],
    blocking: Array.isArray(draftValidation.blockers) ? [...draftValidation.blockers] : [],
    readiness,
    quadratura: {
      isBalanced,
      difference,
    },
    completezzaDati: buildCompletezzaDati(payload),
    targetValidabili: {},
  }
}

export function mapRegistrazioneManualeToCanonical(registrazioneDraftResult, options = {}) {
  const resolved = resolveManualDraft(registrazioneDraftResult)
  const draft = isPlainObject(resolved.draft) ? resolved.draft : {}
  const normalized = isPlainObject(resolved.normalized) ? resolved.normalized : null
  const behavior = buildBehaviorSummary(draft)
  const documentDraft = isPlainObject(draft.documentDraft) ? draft.documentDraft : {}
  const ivaDraft = isPlainObject(draft.ivaDraft) ? draft.ivaDraft : {}
  const partitarioDraft = isPlainObject(draft.partitarioDraft) ? draft.partitarioDraft : {}
  const ritenutaDraft = isPlainObject(draft.ritenutaDraft) ? draft.ritenutaDraft : {}
  const validationDraft = isPlainObject(draft.validation) ? draft.validation : {}
  const totalDocument = numberOrZero(documentDraft.totaleDocumento, normalized?.documentData?.totaleDocumento, normalized?.header?.totaleDocumento)
  const totalTaxable = numberOrZero(
    ivaDraft.imponibile,
    ivaDraft.totaleImponibile,
    documentDraft.totaleImponibile,
    normalized?.documentData?.totaleImponibile,
  )
  const totalVat = numberOrZero(ivaDraft.totaleIva, ivaDraft.totaleImposta)
  const withholdingAmount = numberOrZero(ritenutaDraft.ritenuta)
  const socialSecurity = numberOrZero(ritenutaDraft.cassaPrevidenziale)
  const stampDuty = numberOrZero(documentDraft.bollo, documentDraft.impostaBollo)
  const rounding = numberOrZero(documentDraft.arrotondamento, documentDraft.rounding)
  const excluded = numberOrZero(ritenutaDraft.quotaNonSoggetta, ritenutaDraft.sommeNonSoggette)
  const currency = text(documentDraft.divisa) || 'EUR'

  const payload = createEmptyCanonicalAccountingPayload()
  payload.source.module = 'registrazione_manuale'
  payload.source.sourceRowId = text(normalized?.meta?.sourceRowKey || draft?.meta?.sourceRowKey)
  payload.source.sourceDocumentId = text(options?.sourceDocumentId || normalized?.meta?.sourceDocumentId || draft?.meta?.sourceDocumentId)
  payload.source.sourceBatchId = text(options?.sourceBatchId || normalized?.meta?.sourceBatchId || draft?.meta?.sourceBatchId)
  payload.source.sourceMeta = buildSourceMeta(draft, normalized)

  payload.company.societaId = text(draft?.header?.societaId || normalized?.header?.societaId)
  payload.company.esercizioId = text(draft?.header?.esercizioContabile || normalized?.header?.esercizioContabile)
  payload.company.periodoIva = text(ivaDraft.competencePeriod || derivePeriod(ivaDraft.dataCompetenza) || options?.periodoIva)
  payload.company.regime = text(options?.regime || draft?.fiscalContext?.regimeIva || '')

  payload.fiscalContext.dataRegistrazione = text(draft?.header?.dataRegistrazione || normalized?.header?.dataRegistrazione)
  payload.fiscalContext.dataDocumento = text(draft?.header?.dataDocumento || normalized?.header?.dataDocumento || documentDraft.dataDocumento)
  payload.fiscalContext.competenza = text(ivaDraft.dataCompetenza || payload.fiscalContext.dataDocumento)
  payload.fiscalContext.periodoIva = text(ivaDraft.competencePeriod || derivePeriod(ivaDraft.dataCompetenza) || payload.company.periodoIva)
  payload.fiscalContext.tipoOperazione = text(draft?.meta?.behavior?.family || draft?.meta?.behavior?.code)
  payload.fiscalContext.tipoRegistro = resolveRegisterType(draft) || text(ivaDraft.registerType || ivaDraft.registroIva)
  payload.fiscalContext.regimeIva = text(options?.regimeIva || '')
  payload.fiscalContext.reverseCharge = Boolean(ivaDraft.reverseCharge)
  payload.fiscalContext.splitPayment = Boolean(ivaDraft.splitPayment)
  payload.fiscalContext.ivaPerCassa = Boolean(ivaDraft.ivaPerCassa)
  payload.fiscalContext.proRata = text(ivaDraft.proRata)
  payload.fiscalContext.ritenutaPresente = Boolean(ritenutaDraft.enabled || ritenutaDraft.rows?.length)

  payload.header.causaleContabile = isPlainObject(draft?.header?.causaleContabile) ? { ...draft.header.causaleContabile } : null
  const policy = buildCausaleContabilePolicy(payload.header.causaleContabile)
  payload.header.descrizione = firstText(draft?.header?.descrizioneGenerale, draft?.pnPayload?.descrizione, documentDraft.note)
  payload.header.protocollo = firstText(ivaDraft.protocolloDefinitivo, ivaDraft.protocolloProvvisorio, draft?.pnPayload?.protocollo)
  payload.header.numeroRegistrazione = firstText(options?.numeroRegistrazione, draft?.pnPayload?.numero_documento, draft?.header?.numeroDocumento)
  const rawDraftStato = firstText(draft?.stato, draft?.header?.stato, draft?.pnPayload?.stato)
  let draftStato = 'confermata'
  if (draft?.isSimulata || draft?.meta?.isSimulata || normalized?.meta?.isSimulata) {
    draftStato = 'simulata'
  } else if (rawDraftStato) {
    const normalizedStato = rawDraftStato.toLowerCase().trim().replace(/ /g, '_')
    if (normalizedStato.includes('simulat') || normalizedStato.includes('mock') || normalizedStato.includes('temp')) {
      draftStato = 'simulata'
    } else if (normalizedStato.includes('bozza') || normalizedStato.includes('draft')) {
      draftStato = 'confermata'
    } else if (normalizedStato.includes('verific')) {
      draftStato = 'da_verificare'
    } else if (normalizedStato.includes('confermat') || normalizedStato.includes('confirm') || normalizedStato.includes('definitiva')) {
      draftStato = 'confermata'
    } else if (normalizedStato.includes('contabilizzat')) {
      draftStato = 'contabilizzata'
    } else if (normalizedStato.includes('annullat')) {
      draftStato = 'annullata'
    } else if (normalizedStato.includes('stornat')) {
      draftStato = 'stornata'
    } else if (normalizedStato.includes('storno')) {
      draftStato = 'storno'
    } else if (normalizedStato.includes('rettificat')) {
      draftStato = 'rettificata'
    } else if (normalizedStato.includes('chius')) {
      draftStato = 'chiusa'
    } else if (normalizedStato.includes('esportat')) {
      draftStato = 'esportata'
    } else {
      draftStato = rawDraftStato
    }
  }
  payload.header.stato = draftStato
  payload.header.currency = currency
  payload.header.totals = {
    totaleDare: numberOrZero(draft?.totals?.totaleDare),
    totaleAvere: numberOrZero(draft?.totals?.totaleAvere),
    differenza: numberOrZero(draft?.totals?.differenza),
    isBalanced: Boolean(draft?.totals?.isBalanced),
  }

  payload.subjects = buildSubjects({
    header: draft?.header,
    partitarioDraft,
    ritenutaDraft,
  })

  payload.document.numeroDocumento = text(draft?.header?.numeroDocumento || documentDraft.numeroDocumento)
  payload.document.dataDocumento = text(draft?.header?.dataDocumento || documentDraft.dataDocumento || normalized?.header?.dataDocumento)
  payload.document.tipoDocumento = text(documentDraft.tipoDocumento || partitarioDraft.tipoDocumento || normalized?.documentData?.tipoDocumento)
  payload.document.totals = {
    taxable: totalTaxable,
    vat: totalVat,
    gross: totalDocument,
    netPayable: numberOrZero(ritenutaDraft.netto, totalDocument - withholdingAmount),
    withholding: withholdingAmount,
    socialSecurity,
    stampDuty,
    rounding,
    excluded,
    currency,
  }
  payload.document.riferimentoDocumentoOrigine = text(options?.sourceDocumentId || options?.sourceRowId || normalized?.meta?.sourceRowKey)

  payload.accounting.rows = normalizeAccountingRows(draft)
  payload.accounting.dare = numberOrZero(draft?.totals?.totaleDare)
  payload.accounting.avere = numberOrZero(draft?.totals?.totaleAvere)
  payload.accounting.descrizione = text(draft?.header?.descrizioneGenerale || payload.header.descrizione)
  payload.accounting.importo = numberOrZero(totalDocument)
  payload.accounting.soggettoCollegato = text(draft?.header?.clienteFornitoreId || draft?.header?.cliente_fornitore_id || partitarioDraft?.soggettoId || partitarioDraft?.selectedControparteId)
  payload.accounting.quadratura = {
    isBalanced: Boolean(draft?.validation?.isBalanced ?? draft?.totals?.isBalanced),
    difference: numberOrZero(draft?.validation?.totals?.differenza, draft?.totals?.differenza),
  }

  const vatNormalized = normalizeVatRows(draft)
  payload.vat.enabled = Boolean(vatNormalized.enabled)
  payload.vat.rows = vatNormalized.rows
  payload.vat.registerType = vatNormalized.registerType
  payload.vat.sezionale = vatNormalized.sezionale
  payload.vat.protocolNumber = vatNormalized.protocolNumber
  payload.vat.competencePeriod = vatNormalized.competencePeriod
  payload.vat.causaleIvaId = vatNormalized.causaleIvaId
  payload.vat.causaleIva = vatNormalized.causaleIva
  payload.vat.aliquota = text(vatNormalized.aliquota)
  payload.vat.natura = vatNormalized.natura
  payload.vat.imponibile = numberOrZero(vatNormalized.imponibile)
  payload.vat.imposta = numberOrZero(vatNormalized.imposta)
  payload.vat.detraibilitaPercent = numberOrZero(vatNormalized.detraibilitaPercent)
  payload.vat.indetraibileAmount = numberOrZero(vatNormalized.indetraibileAmount)
  payload.vat.esigibilita = vatNormalized.esigibilita
  payload.vat.splitPayment = Boolean(vatNormalized.splitPayment)
  payload.vat.reverseCharge = Boolean(vatNormalized.reverseCharge)
  payload.vat.reverseChargeMode = vatNormalized.reverseChargeMode
  payload.vat.ivaPerCassa = Boolean(vatNormalized.ivaPerCassa)
  payload.vat.proRata = vatNormalized.proRata
  payload.vat.autofattura = Boolean(vatNormalized.autofattura)
  payload.vat.integrazioneEstero = Boolean(vatNormalized.integrazioneEstero)

  const ledgerNormalized = normalizeLedgerRows(draft, policy, totalDocument)
  payload.ledger.enabled = Boolean(ledgerNormalized.enabled)
  payload.ledger.mode = ledgerNormalized.mode
  payload.ledger.accountId = ledgerNormalized.accountId
  payload.ledger.subjectId = ledgerNormalized.subjectId
  payload.ledger.rows = ledgerNormalized.rows

  const withholdingNormalized = normalizeWithholdingRows(draft)
  payload.withholding.enabled = Boolean(withholdingNormalized.enabled)
  payload.withholding.eventType = withholdingNormalized.eventType
  payload.withholding.recipient = withholdingNormalized.recipient
  payload.withholding.rows = withholdingNormalized.rows

  payload.attachments = {
    ...payload.attachments,
    sourceFile: draft?.documentDraft?.sourceFile || null,
    xml: draft?.documentDraft?.xml || null,
    pdf: draft?.documentDraft?.pdf || null,
    p7m: draft?.documentDraft?.p7m || null,
    hash: text(draft?.documentDraft?.hash),
    storagePath: text(draft?.documentDraft?.storagePath),
    metadata: isPlainObject(draft?.documentDraft?.metadata) ? { ...draft.documentDraft.metadata } : {},
  }

  payload.audit.createdBy = text(options?.operatorId || draft?.meta?.operatorId)
  payload.audit.createdAt = options?.createdAt ? text(options.createdAt) : null
  payload.audit.sourceModule = 'registrazione_manuale'
  payload.audit.sourceAction = text(draft?.meta?.behavior?.code || draft?.meta?.behavior?.family || draft?.stato)
  payload.audit.importBatch = text(options?.importBatch || draft?.meta?.importBatch)
  payload.audit.operatorDecisions = Array.isArray(options?.operatorDecisions)
    ? [...options.operatorDecisions]
    : draft?.meta?.templateRows?.applied
      ? [{ kind: 'templateRows', source: text(draft?.meta?.templateRows?.source), applied: true }]
      : []
  payload.audit.warnings = Array.isArray(validationDraft.warnings) ? [...validationDraft.warnings] : []
  payload.audit.overrides = Array.isArray(options?.overrides) ? [...options.overrides] : []
  payload.audit.reasons = Array.isArray(draft?.meta?.templateRows?.reasons) ? [...draft.meta.templateRows.reasons] : []

  // Risoluzione policy causale contabile per FASE 2 (gia' eseguita sopra)

  const hasRealVatRows = (Array.isArray(ivaDraft?.rows) && ivaDraft.rows.length > 0 && ivaDraft.rows.some(r => toNumber(r.imponibile) > 0 || toNumber(r.imposta) > 0 || (text(r.causaleIvaId) && !String(r.causaleIvaId).startsWith('iva-row-')))) ||
    toNumber(ivaDraft?.imponibile) > 0 || toNumber(ivaDraft?.totaleImponibile) > 0 || toNumber(ivaDraft?.totaleIva) > 0 || toNumber(ivaDraft?.totaleImposta) > 0
  const hasRealLedgerRows = Array.isArray(partitarioDraft?.rows) && partitarioDraft.rows.length > 0 && partitarioDraft.rows.some(r => toNumber(r.amount) > 0 || text(r.documentRef))
  const hasRealWithholdingRows = (Array.isArray(ritenutaDraft?.rows) && ritenutaDraft.rows.length > 0 && ritenutaDraft.rows.some(r => toNumber(r.amount) > 0 || text(r.causaleCu))) ||
    toNumber(ritenutaDraft?.ritenuta) > 0 || toNumber(ritenutaDraft?.importoCompenso) > 0

  payload.postCommitTargets.shouldCreateDocumentiContabilita = false
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldCreateIva = Boolean(policy.isDocumentoIva === true || (behavior.showIvaPanel && hasRealVatRows))
  payload.postCommitTargets.shouldCreateLedger = Boolean((policy.gestionePartitario !== 'nessuno' && policy.gestionePartitario !== '') || (behavior.showPartitario && hasRealLedgerRows))
  payload.postCommitTargets.shouldCreateWithholding = Boolean((policy.gestioneRitenute !== 'nessuna' && policy.gestioneRitenute !== '') || (behavior.showRitenute && hasRealWithholdingRows))
  payload.postCommitTargets.shouldCreateScadenziario = false
  payload.postCommitTargets.shouldAttachSourceDocument = false
  payload.postCommitTargets.shouldUpdateAuditTrail = true

  // Pulizia payload in caso di moduli non attivi per PN semplice
  if (!payload.postCommitTargets.shouldCreateIva) {
    payload.vat.enabled = false
    payload.vat.rows = []
    payload.vat.registerType = ''
    payload.vat.sezionale = ''
    payload.vat.protocolNumber = ''
    payload.vat.competencePeriod = ''
    payload.vat.causaleIvaId = ''
    payload.vat.causaleIva = ''
    payload.vat.aliquota = ''
    payload.vat.natura = ''
    payload.vat.imponibile = 0
    payload.vat.imposta = 0
    payload.vat.detraibilitaPercent = 0
    payload.vat.indetraibileAmount = 0
    payload.vat.esigibilita = ''
    payload.vat.splitPayment = false
    payload.vat.reverseCharge = false
    payload.vat.reverseChargeMode = ''
    payload.vat.ivaPerCassa = false
    payload.vat.proRata = ''
    payload.vat.autofattura = false
    payload.vat.integrazioneEstero = false
    payload.fiscalContext.tipoRegistro = ''
  }

  if (!payload.postCommitTargets.shouldCreateLedger) {
    payload.ledger.enabled = false
    payload.ledger.mode = 'none'
    payload.ledger.accountId = ''
    payload.ledger.subjectId = ''
    payload.ledger.rows = []
  }

  if (!payload.postCommitTargets.shouldCreateWithholding) {
    payload.withholding.enabled = false
    payload.withholding.eventType = 'document'
    payload.withholding.recipient = null
    payload.withholding.rows = []
  }

  const baseValidation = buildValidationSnapshot(payload, draft)
  let validationResult = null
  if (options?.validate !== false) {
    validationResult = validateCanonicalAccountingPayload(payload, { mode: options?.mode || 'draft' })
    payload.validation = {
      ...baseValidation,
      ...validationResult,
      quadratura: baseValidation.quadratura,
      completezzaDati: baseValidation.completezzaDati,
    }
  } else {
    payload.validation = baseValidation
  }

  return {
    payload,
    validationResult,
  }
}
