import { createEmptyCanonicalAccountingPayload } from '../canonicalAccountingPayload.defaults.js'
import { validateCanonicalAccountingPayload } from '../validateCanonicalAccountingPayload.js'

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return String(value ?? '').trim()
}

function toNumber(value) {
  if (value == null || value === '') return null
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
    const normalized = text(value)
    if (normalized) return normalized
  }
  return ''
}

function derivePeriod(value) {
  const normalized = text(value)
  if (!normalized) return ''
  if (normalized.length >= 7) return normalized.slice(0, 7)
  return normalized
}

function resolveImportCommitPayload(importCommitPayload = {}) {
  if (isPlainObject(importCommitPayload?.payload)) {
    return {
      root: importCommitPayload,
      payload: importCommitPayload.payload,
    }
  }

  if (isPlainObject(importCommitPayload)) {
    return {
      root: importCommitPayload,
      payload: importCommitPayload,
    }
  }

  return {
    root: {},
    payload: {},
  }
}

function buildImportSourceMeta(root = {}, payload = {}) {
  const handoff = isPlainObject(payload?.handoff) ? payload.handoff : {}
  const classification = isPlainObject(root?.classification) ? root.classification : isPlainObject(payload?.classification) ? payload.classification : null
  const readiness = isPlainObject(root?.readiness) ? root.readiness : isPlainObject(payload?.readiness) ? payload.readiness : null
  const automationMeta = isPlainObject(root?.automationMeta) ? root.automationMeta : isPlainObject(payload?.automationMeta) ? payload.automationMeta : {}

  return {
    contractVersion: text(handoff.contractVersion),
    sourceFileName: text(handoff.sourceFileName),
    classification: classification
      ? {
          code: text(classification.code),
          label: text(classification.label),
          managed: Boolean(classification.managed),
        }
      : null,
    readiness: readiness
      ? {
          status: text(readiness.status),
          label: text(readiness.label),
        }
      : null,
    automationMeta: {
      sourceMode: text(automationMeta.sourceMode || automationMeta.mode),
      code: text(automationMeta.code || automationMeta.scenarioCode || classification?.code),
      managed: typeof automationMeta.managed === 'boolean' ? automationMeta.managed : undefined,
    },
  }
}

function resolveSubjectTipoSoggetto(direction) {
  return text(direction).toLowerCase() === 'vendita' ? 'cliente' : 'fornitore'
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
  if (!subjects.some((item) => subjectKey(item) === key)) {
    subjects.push(subject)
  }
}

function buildSubjects(payload = {}) {
  const subjects = []
  const document = isPlainObject(payload?.document) ? payload.document : {}
  const accounting = isPlainObject(payload?.accounting) ? payload.accounting : {}
  const ledger = isPlainObject(payload?.ledger) ? payload.ledger : {}
  const withholding = isPlainObject(payload?.withholding) ? payload.withholding : {}
  const counterparty = isPlainObject(document.counterparty) ? document.counterparty : {}
  const direction = text(document.direction)
  const tipoSoggetto = resolveSubjectTipoSoggetto(direction)
  const counterpartyAccountId = text(counterparty.accountId || ledger.accountId || accounting.soggettoCollegato)

  addSubject(
    subjects,
    buildSubjectCandidate({
      role: 'primary',
      tipoSoggetto,
      anagraficaId: counterpartyAccountId,
      pianoContiIdPatrimoniale: counterpartyAccountId,
      denominazione: firstText(counterparty.name, counterparty.denominazione),
      codiceFiscale: firstText(counterparty.taxCode, counterparty.codiceFiscale),
      partitaIva: firstText(counterparty.vatNumber, counterparty.partitaIva),
      paese: text(counterparty.paese),
    })
  )

  const withholdingRecipient = isPlainObject(withholding.recipient) ? withholding.recipient : null
  if (withholding.enabled && withholdingRecipient) {
    addSubject(
      subjects,
      buildSubjectCandidate({
        role: 'withholdingRecipient',
        tipoSoggetto: 'percipiente',
        anagraficaId: text(withholdingRecipient.anagraficaId || withholdingRecipient.id),
        pianoContiIdPatrimoniale: '',
        denominazione: firstText(withholdingRecipient.denominazione, withholdingRecipient.nome),
        codiceFiscale: firstText(withholdingRecipient.codiceFiscale, withholdingRecipient.cf),
        partitaIva: firstText(withholdingRecipient.partitaIva, withholdingRecipient.partita_iva),
        paese: text(withholdingRecipient.paese),
      })
    )
  }

  return subjects
}

function normalizeAccountingRows(payload = {}) {
  const accounting = isPlainObject(payload?.accounting) ? payload.accounting : {}
  const rows = asArray(accounting.rows)
  return rows.map((row, index) => {
    const debit = numberOrZero(row?.debit, row?.dare, row?.importoDare, row?.importo_dare)
    const credit = numberOrZero(row?.credit, row?.avere, row?.importoAvere, row?.importo_avere)
    return {
      ...row,
      rowNumber: Number.isFinite(Number(row?.rowNumber || row?.lineNo || row?.idx || row?.riga)) ? Number(row.rowNumber || row.lineNo || row.idx || row.riga) : index + 1,
      accountId: text(row?.accountId || row?.conto_id || row?.contoId),
      accountCode: text(row?.accountCode || row?.conto_codice || row?.contoCodice),
      accountDescription: text(row?.accountDescription || row?.conto_descrizione || row?.contoDescrizione),
      description: text(row?.description || row?.descrizione || row?.descrizione_riga),
      debit,
      credit,
      amount: numberOrZero(row?.amount, debit, credit),
    }
  })
}

function normalizeVatRows(payload = {}) {
  const vat = isPlainObject(payload?.vat) ? payload.vat : {}
  const rows = asArray(vat.rows)
  const registerType = text(vat.registerType)
  const competencePeriod = text(vat.competencePeriod || vat.competenceDate || payload?.document?.vatCompetence)
  const sezionale = text(vat.sezionale)
  const protocolNumber = text(vat.protocolNumber)
  const causaleIvaId = text(vat.causaleIvaId)
  const causaleIva = text(vat.causaleIva)

  return {
    enabled: Boolean(vat.enabled || rows.length),
    rows: rows.map((row, index) => ({
      ...row,
      rowNumber: Number.isFinite(Number(row?.rowNumber || row?.idx || row?.riga)) ? Number(row.rowNumber || row.idx || row.riga) : index + 1,
      registerType: text(row?.registerType || registerType),
      sezionale: text(row?.sezionale || sezionale),
      protocolNumber: text(row?.protocolNumber || protocolNumber),
      competencePeriod: text(row?.competencePeriod || competencePeriod),
      causaleIvaId: text(row?.causaleIvaId || causaleIvaId),
      causaleIva: text(row?.causaleIva || row?.causaleIvaLabel || causaleIva),
      imponibile: numberOrZero(row?.imponibile, row?.taxable),
      imposta: numberOrZero(row?.imposta, row?.tax),
      aliquota: row?.aliquota ?? row?.rate ?? '',
      natura: text(row?.natura),
      detraibilitaPercent: numberOrZero(row?.detraibilitaPercent, row?.percentualeDetraibilita),
      indetraibileAmount: numberOrZero(row?.indetraibileAmount, row?.ivaIndetraibile, row?.indetraibileTax),
      splitPayment: Boolean(row?.splitPayment),
      reverseCharge: Boolean(row?.reverseCharge),
      ivaPerCassa: Boolean(row?.ivaPerCassa),
      proRata: text(row?.proRata),
    })),
    registerType,
    competencePeriod,
    sezionale,
    protocolNumber,
    causaleIvaId,
    causaleIva,
    imponibile: numberOrZero(vat.imponibile, vat.totaleImponibile),
    imposta: numberOrZero(vat.imposta, vat.totaleIva, vat.totaleImposta),
    aliquota: vat.aliquota ?? vat.aliquotaIva ?? '',
    natura: text(vat.natura),
    detraibilitaPercent: numberOrZero(vat.detraibilitaPercent, vat.percentualeDetraibilita),
    indetraibileAmount: numberOrZero(vat.indetraibileAmount, vat.ivaIndetraibile),
    esigibilita: text(vat.esigibilita),
    splitPayment: Boolean(vat.splitPayment),
    reverseCharge: Boolean(vat.reverseCharge),
    reverseChargeMode: text(vat.reverseChargeMode),
    ivaPerCassa: Boolean(vat.ivaPerCassa),
    proRata: text(vat.proRata),
    autofattura: Boolean(vat.autofattura),
    integrazioneEstero: Boolean(vat.integrazioneEstero),
  }
}

function resolveLedgerMode(payload = {}) {
  const ledger = isPlainObject(payload?.ledger) ? payload.ledger : {}
  const rows = asArray(ledger.rows)
  const actions = new Set(rows.map((row) => text(row?.action).toLowerCase()).filter(Boolean))
  if (actions.has('open') && actions.has('close')) return 'mixed'
  if (actions.has('close')) return 'close'
  if (actions.has('open')) return 'open'

  const type = text(ledger.type).toLowerCase()
  if (type === 'close' || type === 'chiusura' || type === 'pagamento') return 'close'
  if (type === 'mixed') return 'mixed'
  if (ledger.enabled || text(ledger.accountId) || rows.length) return 'open'
  return 'none'
}

function normalizeLedgerRows(payload = {}) {
  const ledger = isPlainObject(payload?.ledger) ? payload.ledger : {}
  const rows = asArray(ledger.rows)
  const mode = resolveLedgerMode(payload)
  const normalizedRows = rows.length
    ? rows
    : ledger.enabled || text(ledger.accountId)
      ? [{
          action: mode === 'close' ? 'close' : 'open',
          documentRef: text(payload?.document?.number),
          openItemId: '',
          amount: numberOrZero(ledger.amount, payload?.document?.totals?.gross),
          dueDate: text(ledger.dueDate),
          paymentDate: text(ledger.paymentDate),
          residualAmount: numberOrZero(ledger.residualAmount, ledger.amount, payload?.document?.totals?.gross),
        }]
      : []

  return {
    enabled: Boolean(ledger.enabled || ledger.accountId || normalizedRows.length),
    mode,
    accountId: text(ledger.accountId),
    subjectId: text(ledger.subjectId || payload?.accounting?.soggettoCollegato || payload?.subjects?.[0]?.anagraficaId || payload?.subjects?.[0]?.pianoContiIdPatrimoniale),
    rows: normalizedRows.map((row, index) => ({
      ...row,
      rowNumber: Number.isFinite(Number(row?.rowNumber || row?.idx || row?.riga)) ? Number(row.rowNumber || row.idx || row.riga) : index + 1,
      action: text(row?.action || mode || 'open'),
      documentRef: text(row?.documentRef || payload?.document?.number),
      openItemId: text(row?.openItemId),
      amount: numberOrZero(row?.amount, row?.importoAperto, row?.importoChiusura, ledger.amount, payload?.document?.totals?.gross),
      dueDate: text(row?.dueDate || row?.dataScadenza || ledger.dueDate),
      paymentDate: text(row?.paymentDate || row?.dataPagamento || ledger.paymentDate),
      residualAmount: numberOrZero(row?.residualAmount, row?.residuo, ledger.residualAmount),
    })),
  }
}

function normalizeWithholding(payload = {}) {
  const withholding = isPlainObject(payload?.withholding) ? payload.withholding : {}
  const rows = asArray(withholding.rows)
  const supported = withholding.supported !== false
  const enabled = Boolean(withholding.enabled && supported && rows.length)
  const recipient = enabled && isPlainObject(withholding.recipient)
    ? {
        ...withholding.recipient,
        role: text(withholding.recipient.role || 'withholdingRecipient'),
        tipoSoggetto: text(withholding.recipient.tipoSoggetto || 'percipiente'),
        codiceFiscale: text(withholding.recipient.codiceFiscale || withholding.recipient.cf),
        anagraficaId: text(withholding.recipient.anagraficaId || withholding.recipient.id),
      }
    : null

  return {
    enabled,
    eventType: text(withholding.eventType || 'document'),
    recipient,
    rows: enabled
      ? rows.map((row, index) => ({
          ...row,
          rowNumber: Number.isFinite(Number(row?.rowNumber || row?.idx || row?.riga)) ? Number(row.rowNumber || row.idx || row.riga) : index + 1,
          baseAmount: numberOrZero(row?.baseAmount, row?.baseRitenuta, row?.baseImponibile, row?.imponibileReddito, row?.imponibile),
          rate: numberOrZero(row?.rate, row?.aliquotaRitenuta),
          amount: numberOrZero(row?.amount, row?.ritenuta),
          netPaid: numberOrZero(row?.netPaid, row?.netto),
          causaleCu: text(row?.causaleCu),
          paymentDate: text(row?.paymentDate || row?.dataPagamento),
          dueDateF24: text(row?.dueDateF24),
          tributeCode: text(row?.tributeCode || row?.codiceTributo),
          period: text(row?.period || derivePeriod(row?.paymentDate || row?.dataPagamento || payload?.document?.dataDocumento)),
        }))
      : [],
  }
}

function buildCompletezzaDati(payload = {}) {
  return {
    source: Boolean(text(payload?.source?.module)),
    company: Boolean(text(payload?.company?.societaId)),
    header: Boolean(text(payload?.header?.descrizione) || text(payload?.header?.causaleContabile?.id) || text(payload?.header?.causaleContabile?.codice)),
    subjects: Array.isArray(payload?.subjects) && payload.subjects.length > 0,
    document: Boolean(text(payload?.document?.numeroDocumento) || text(payload?.document?.dataDocumento) || Number.isFinite(Number(payload?.document?.totals?.gross))),
    accounting: Array.isArray(payload?.accounting?.rows) && payload.accounting.rows.length > 0,
    vat: Array.isArray(payload?.vat?.rows) && payload.vat.rows.length > 0,
    ledger: Array.isArray(payload?.ledger?.rows) && payload.ledger.rows.length > 0,
    withholding: Array.isArray(payload?.withholding?.rows) && payload.withholding.rows.length > 0,
    attachments: Boolean(text(payload?.attachments?.sourceFile) || payload?.attachments?.xml || payload?.attachments?.pdf || payload?.attachments?.p7m),
    audit: Boolean(text(payload?.audit?.sourceModule)),
  }
}

function buildValidationSnapshot(payload = {}, root = {}) {
  const importedValidation = isPlainObject(root?.validation) ? root.validation : isPlainObject(payload?.validation) ? payload.validation : {}
  const readiness = isPlainObject(root?.readiness) ? root.readiness : isPlainObject(payload?.readiness) ? payload.readiness : {}
  const classification = isPlainObject(root?.classification) ? root.classification : isPlainObject(payload?.classification) ? payload.classification : {}
  const blockers = Array.isArray(importedValidation.blockers) ? [...importedValidation.blockers] : []
  const warnings = Array.isArray(importedValidation.warnings) ? [...importedValidation.warnings] : []
  const status = text(importedValidation.status)
  const readinessStatus = text(readiness.status)
  const derivedReadiness = status === 'blocked'
    ? 'blocked'
    : readinessStatus === 'pronto_per_contabilita' || status === 'ok'
      ? 'ready'
      : warnings.length
        ? 'draft'
        : 'draft'

  return {
    errors: [...blockers],
    warnings,
    blocking: [...blockers],
    readiness: derivedReadiness,
    quadratura: {
      isBalanced: Boolean(payload?.accounting?.isBalanced),
      difference: numberOrZero(payload?.accounting?.totals?.debit) - numberOrZero(payload?.accounting?.totals?.credit),
    },
    completezzaDati: buildCompletezzaDati(payload),
    targetValidabili: {},
    classification: classification && Object.keys(classification).length
      ? {
          code: text(classification.code),
          label: text(classification.label),
          managed: Boolean(classification.managed),
        }
      : null,
  }
}

export function mapImportContabilitaCommitPayloadToCanonical(importCommitPayload, options = {}) {
  const resolved = resolveImportCommitPayload(importCommitPayload)
  const root = isPlainObject(resolved.root) ? resolved.root : {}
  const payloadSource = isPlainObject(resolved.payload) ? resolved.payload : {}
  const payload = createEmptyCanonicalAccountingPayload()

  const handoff = isPlainObject(payloadSource.handoff) ? payloadSource.handoff : {}
  const document = isPlainObject(payloadSource.document) ? payloadSource.document : {}
  const accounting = isPlainObject(payloadSource.accounting) ? payloadSource.accounting : {}
  const vat = isPlainObject(payloadSource.vat) ? payloadSource.vat : {}
  const ledger = isPlainObject(payloadSource.ledger) ? payloadSource.ledger : {}
  const withholding = isPlainObject(payloadSource.withholding) ? payloadSource.withholding : {}
  const validation = isPlainObject(payloadSource.validation) ? payloadSource.validation : {}
  const automationMeta = isPlainObject(payloadSource.automationMeta) ? payloadSource.automationMeta : {}
  const classification = isPlainObject(root.classification) ? root.classification : isPlainObject(payloadSource.classification) ? payloadSource.classification : null
  const readiness = isPlainObject(root.readiness) ? root.readiness : isPlainObject(payloadSource.readiness) ? payloadSource.readiness : null

  const documentTotals = isPlainObject(document.totals) ? document.totals : {}
  const vatRows = asArray(vat.rows)
  const vatTotals = isPlainObject(vat.totals) ? vat.totals : {}
  const ledgerRowsNormalized = normalizeLedgerRows(payloadSource)
  const withholdingNormalized = normalizeWithholding(payloadSource)
  const accountingRows = normalizeAccountingRows(payloadSource)
  const currency = text(documentTotals.currency || options?.currency || 'EUR') || 'EUR'
  const gross = numberOrZero(documentTotals.gross)
  const withholdingAmount = numberOrZero(documentTotals.withholding, withholdingNormalized.rows.reduce((sum, row) => sum + numberOrZero(row.amount), 0))

  payload.source.module = 'import_contabilita'
  payload.source.sourceRowId = text(handoff.sourceRowKey || root.sourceRowKey || root.sourceRow?.id)
  payload.source.sourceDocumentId = text(options?.sourceDocumentId || root.sourceDocumentId || payloadSource.sourceDocumentId)
  payload.source.sourceBatchId = text(handoff.sourceBatchId || root.sourceBatchId || options?.sourceBatchId)
  payload.source.sourceMeta = buildImportSourceMeta(root, payloadSource)

  payload.company.societaId = text(payloadSource.company?.societaId || root.company?.societaId)
  payload.company.esercizioId = text(payloadSource.company?.esercizioId || root.company?.esercizioId || options?.esercizioId)
  payload.company.periodoIva = text(
    document.vatCompetence ||
    vat.competencePeriod ||
    vat.competenceDate ||
    payloadSource.company?.periodoIva ||
    root.company?.periodoIva ||
    options?.periodoIva
  )
  payload.company.regime = text(payloadSource.company?.regime || root.company?.regime || options?.regime)

  payload.fiscalContext.dataRegistrazione = text(document.registrationDate || payloadSource.fiscalContext?.dataRegistrazione || options?.dataRegistrazione)
  payload.fiscalContext.dataDocumento = text(document.documentDate || payloadSource.fiscalContext?.dataDocumento || options?.dataDocumento)
  payload.fiscalContext.competenza = text(document.vatCompetence || vat.competenceDate || payload.fiscalContext.dataDocumento)
  payload.fiscalContext.periodoIva = text(document.vatCompetence || vat.competencePeriod || payload.company.periodoIva)
  payload.fiscalContext.tipoOperazione = text(document.direction || payloadSource.fiscalContext?.tipoOperazione)
  payload.fiscalContext.tipoRegistro = text(vat.registerType || payloadSource.fiscalContext?.tipoRegistro || document.direction)
  payload.fiscalContext.regimeIva = text(payloadSource.fiscalContext?.regimeIva || options?.regimeIva)
  payload.fiscalContext.reverseCharge = Boolean(document.flags?.reverseCharge || payloadSource.fiscalContext?.reverseCharge)
  payload.fiscalContext.splitPayment = Boolean(document.flags?.splitPayment || payloadSource.fiscalContext?.splitPayment)
  payload.fiscalContext.ivaPerCassa = Boolean(document.flags?.ivaPerCassa || payloadSource.fiscalContext?.ivaPerCassa)
  payload.fiscalContext.proRata = text(vat.proRata || payloadSource.fiscalContext?.proRata)
  payload.fiscalContext.ritenutaPresente = Boolean(withholding.enabled || withholding.rows?.length || document.flags?.hasRitenuta)

  payload.header.causaleContabile = isPlainObject(accounting.causaleContabile) ? { ...accounting.causaleContabile } : null
  payload.header.descrizione = firstText(
    accounting.description,
    accounting.causaleContabile?.description,
    document.counterparty?.name,
    document.counterparty?.denominazione,
    document.type
  )
  payload.header.protocollo = text(vat.protocolNumber || options?.protocollo)
  payload.header.numeroRegistrazione = text(options?.numeroRegistrazione || root.numeroRegistrazione || payloadSource.numeroRegistrazione)
  payload.header.stato = text(validation.status || readiness?.status || root.readiness?.status || 'bozza') || 'bozza'
  payload.header.currency = currency
  payload.header.totals = {
    totaleDare: numberOrZero(accounting.totals?.debit, accounting.totals?.dare),
    totaleAvere: numberOrZero(accounting.totals?.credit, accounting.totals?.avere),
    differenza: numberOrZero(accounting.totals?.debit, accounting.totals?.dare) - numberOrZero(accounting.totals?.credit, accounting.totals?.avere),
    isBalanced: Boolean(accounting.isBalanced),
  }

  payload.subjects = buildSubjects({
    document,
    accounting,
    ledger: ledgerRowsNormalized,
    withholding: withholdingNormalized,
  })

  payload.document.numeroDocumento = text(document.number)
  payload.document.dataDocumento = text(document.documentDate)
  payload.document.tipoDocumento = text(document.type)
  payload.document.xmlOrigine = null
  payload.document.allegato = null
  payload.document.totals = {
    taxable: numberOrZero(documentTotals.taxable),
    vat: numberOrZero(documentTotals.vat),
    gross,
    netPayable: numberOrZero(documentTotals.netPayable, gross - withholdingAmount, gross),
    withholding: numberOrZero(documentTotals.withholding, withholdingAmount),
    socialSecurity: numberOrZero(documentTotals.socialSecurity),
    stampDuty: numberOrZero(documentTotals.stampDuty),
    rounding: numberOrZero(documentTotals.rounding),
    excluded: numberOrZero(documentTotals.excluded),
    currency,
  }
  payload.document.riferimentoDocumentoOrigine = firstText(handoff.sourceFileName, handoff.sourceRowKey, payload.source.sourceRowId)

  payload.accounting.rows = accountingRows
  payload.accounting.dare = numberOrZero(accounting.totals?.debit, accounting.totals?.dare)
  payload.accounting.avere = numberOrZero(accounting.totals?.credit, accounting.totals?.avere)
  payload.accounting.conto = text(accounting.conto || accounting.accountId)
  payload.accounting.descrizione = text(accounting.description || payload.header.descrizione)
  payload.accounting.importo = gross
  payload.accounting.soggettoCollegato = text(accounting.soggettoCollegato || ledgerRowsNormalized.subjectId || payload.subjects?.[0]?.anagraficaId || payload.subjects?.[0]?.pianoContiIdPatrimoniale)
  payload.accounting.collegamentoRigaIva = text(accounting.collegamentoRigaIva)
  payload.accounting.collegamentoPartitario = text(accounting.collegamentoPartitario)
  payload.accounting.quadratura = {
    isBalanced: Boolean(accounting.isBalanced),
    difference: numberOrZero(accounting.totals?.debit, accounting.totals?.dare) - numberOrZero(accounting.totals?.credit, accounting.totals?.avere),
  }

  payload.vat.enabled = Boolean(vat.enabled || vatRows.length)
  payload.vat.rows = vatRows.map((row, index) => ({
    ...row,
    rowNumber: Number.isFinite(Number(row?.rowNumber || row?.idx || row?.riga)) ? Number(row.rowNumber || row.idx || row.riga) : index + 1,
    registerType: text(row?.registerType || vat.registerType || document.direction),
    sezionale: text(row?.sezionale || vat.sezionale),
    protocolNumber: text(row?.protocolNumber || vat.protocolNumber),
    competencePeriod: text(row?.competencePeriod || vat.competencePeriod || vat.competenceDate || document.vatCompetence),
    causaleIvaId: text(row?.causaleIvaId || vat.causaleIvaId),
    causaleIva: text(row?.causaleIva || vat.causaleIva),
    imponibile: numberOrZero(row?.imponibile, row?.taxable, vatTotals.taxable),
    imposta: numberOrZero(row?.imposta, row?.tax, vatTotals.tax),
    aliquota: row?.aliquota ?? row?.rate ?? vat.aliquota ?? '',
    natura: text(row?.natura || vat.natura),
    detraibilitaPercent: numberOrZero(row?.detraibilitaPercent, row?.percentualeDetraibilita, vat.detraibilitaPercent),
    indetraibileAmount: numberOrZero(row?.indetraibileAmount, row?.ivaIndetraibile, vatTotals.indetraibileTax, vat.indetraibileAmount),
    splitPayment: Boolean(row?.splitPayment || vat.splitPayment),
    reverseCharge: Boolean(row?.reverseCharge || vat.reverseCharge),
    ivaPerCassa: Boolean(row?.ivaPerCassa || vat.ivaPerCassa),
    proRata: text(row?.proRata || vat.proRata),
  }))
  payload.vat.registerType = text(vat.registerType || document.direction)
  payload.vat.sezionale = text(vat.sezionale)
  payload.vat.protocolNumber = text(vat.protocolNumber)
  payload.vat.competencePeriod = text(vat.competencePeriod || vat.competenceDate || document.vatCompetence)
  payload.vat.causaleIvaId = text(vat.causaleIvaId)
  payload.vat.causaleIva = text(vat.causaleIva)
  payload.vat.aliquota = text(vat.aliquota)
  payload.vat.natura = text(vat.natura)
  payload.vat.imponibile = numberOrZero(vatTotals.taxable, vat.imponibile)
  payload.vat.imposta = numberOrZero(vatTotals.tax, vat.imposta)
  payload.vat.detraibilitaPercent = numberOrZero(vat.detraibilitaPercent)
  payload.vat.indetraibileAmount = numberOrZero(vatTotals.indetraibileTax, vat.indetraibileAmount)
  payload.vat.esigibilita = text(vat.esigibilita)
  payload.vat.splitPayment = Boolean(vat.splitPayment)
  payload.vat.reverseCharge = Boolean(vat.reverseCharge)
  payload.vat.reverseChargeMode = text(vat.reverseChargeMode)
  payload.vat.ivaPerCassa = Boolean(vat.ivaPerCassa)
  payload.vat.proRata = text(vat.proRata)
  payload.vat.autofattura = Boolean(vat.autofattura)
  payload.vat.integrazioneEstero = Boolean(vat.integrazioneEstero)

  payload.ledger.enabled = Boolean(ledgerRowsNormalized.enabled)
  payload.ledger.mode = ledgerRowsNormalized.mode
  payload.ledger.accountId = text(ledgerRowsNormalized.accountId || ledger.accountId)
  payload.ledger.subjectId = text(ledgerRowsNormalized.subjectId || payload.subjects?.[0]?.anagraficaId || payload.subjects?.[0]?.pianoContiIdPatrimoniale)
  payload.ledger.rows = ledgerRowsNormalized.rows

  payload.withholding.enabled = Boolean(withholdingNormalized.enabled)
  payload.withholding.eventType = withholdingNormalized.eventType
  payload.withholding.recipient = withholdingNormalized.recipient
  payload.withholding.rows = withholdingNormalized.rows

  payload.attachments = {
    ...payload.attachments,
    sourceFile: text(handoff.sourceFileName),
    xml: payloadSource.attachments?.xml || null,
    pdf: payloadSource.attachments?.pdf || null,
    p7m: payloadSource.attachments?.p7m || null,
    hash: text(root.sourceHash || payloadSource.sourceHash || payloadSource.handoff?.sourceHash),
    storagePath: text(payloadSource.attachments?.storagePath),
    metadata: {
      sourceModule: 'import_contabilita',
      sourceRowKey: text(handoff.sourceRowKey || root.sourceRowKey),
      sourceBatchId: text(handoff.sourceBatchId || root.sourceBatchId),
      contractVersion: text(handoff.contractVersion),
      classification: classification
        ? {
            code: text(classification.code),
            label: text(classification.label),
            managed: Boolean(classification.managed),
          }
        : null,
      readiness: readiness
        ? {
            status: text(readiness.status),
            label: text(readiness.label),
          }
        : null,
    },
  }

  payload.audit.createdBy = text(handoff.operatorId || options?.operatorId)
  payload.audit.createdAt = text(handoff.createdAt || options?.createdAt) || null
  payload.audit.sourceModule = 'import_contabilita'
  payload.audit.sourceAction = 'commit_payload_mapping'
  payload.audit.importBatch = text(handoff.sourceBatchId || root.sourceBatchId)
  payload.audit.operatorDecisions = Array.isArray(automationMeta.operatorDecisions) ? [...automationMeta.operatorDecisions] : []
  payload.audit.warnings = Array.isArray(validation.warnings) ? [...validation.warnings] : []
  payload.audit.overrides = Array.isArray(automationMeta.overrides) ? [...automationMeta.overrides] : []
  payload.audit.reasons = Array.isArray(automationMeta.reasons) ? [...automationMeta.reasons] : []

  payload.postCommitTargets.shouldCreateDocumentiContabilita = true
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldCreateIva = Boolean(payload.vat.enabled || payload.vat.rows.length)
  payload.postCommitTargets.shouldCreateLedger = Boolean(payload.ledger.enabled || payload.ledger.accountId || payload.ledger.rows.length)
  payload.postCommitTargets.shouldCreateWithholding = Boolean(payload.withholding.enabled && payload.withholding.rows.length)
  payload.postCommitTargets.shouldCreateScadenziario = false
  payload.postCommitTargets.shouldAttachSourceDocument = Boolean(payload.attachments.sourceFile || payload.attachments.xml || payload.attachments.pdf || payload.attachments.p7m)
  payload.postCommitTargets.shouldUpdateAuditTrail = true

  const baseValidation = buildValidationSnapshot(payload, root)
  let validationResult = null

  if (options?.validate !== false) {
    validationResult = validateCanonicalAccountingPayload(payload, { mode: options?.mode || 'draft' })
    payload.validation = {
      ...baseValidation,
      ...validationResult,
      quadratura: baseValidation.quadratura,
      completezzaDati: baseValidation.completezzaDati,
      classification: baseValidation.classification,
    }
  } else {
    payload.validation = baseValidation
  }

  return {
    payload,
    validationResult,
  }
}
