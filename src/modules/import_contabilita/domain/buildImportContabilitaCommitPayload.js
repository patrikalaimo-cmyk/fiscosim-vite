function normalizeText(value) {
  return String(value || '').trim()
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function toNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function round2(value) {
  return Math.round(toNumber(value) * 100) / 100
}

function hasAccountRef(account) {
  if (!account || typeof account !== 'object') return false
  return Boolean(normalizeText(account.id) || normalizeText(account.codice) || normalizeText(account.code))
}

function hasCausaleRef(causale) {
  if (!causale || typeof causale !== 'object') return false
  return Boolean(normalizeText(causale.id) || normalizeText(causale.codice) || normalizeText(causale.code))
}

function parseIsoDateStrict(value) {
  const raw = normalizeText(value)
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return { year, month, day, isoDate: raw }
}

function inferEsteroFlag(parsedDocument, direction) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const fornitorePiva = normalizeText(parsed?.fornitore?.partitaIva)
  const clientePiva = normalizeText(parsed?.cliente?.partitaIva)

  const piva = direction === 'vendita' ? clientePiva : fornitorePiva
  if (!piva) return false
  if (/^IT/i.test(piva)) return false
  if (/^\d{11}$/.test(piva)) return false
  return true
}

function inferIvaPerCassaFlag(input, parsedDocument, sourceRow) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const source = sourceRow && typeof sourceRow === 'object' ? sourceRow : {}
  const flags = parsed?.flags && typeof parsed.flags === 'object' ? parsed.flags : {}
  const candidates = [
    flags.ivaPerCassa,
    flags.cashAccounting,
    flags.regimeContabile,
    flags.regime_contabile,
    parsed?.regimeContabile,
    parsed?.regime_contabile,
    parsed?.regimeIva,
    parsed?.regime_iva,
    source?.regimeContabile,
    source?.regime_contabile,
    source?.regimeIva,
    source?.regime_iva,
    input?.regimeContabile,
    input?.regime_contabile,
    input?.regimeIva,
    input?.regime_iva,
  ]

  return candidates.some((value) => {
    const normalized = normalizeText(value).toLowerCase()
    return normalized === 'iva_cassa' || normalized === 'iva per cassa' || normalized === 'cassa' || normalized.includes('cash accounting')
  })
}

function classifyContabilitaScenario(input = {}, payload = null) {
  const sourceRow = input?.sourceRow && typeof input.sourceRow === 'object' ? input.sourceRow : {}
  const parsedDocument = input?.parsedDocument && typeof input.parsedDocument === 'object' ? input.parsedDocument : {}
  const flags = parsedDocument?.flags && typeof parsedDocument.flags === 'object' ? parsedDocument.flags : {}
  const direction = payload?.document?.direction || deriveDirection(sourceRow, parsedDocument)
  const isRitenuta = Boolean(flags.hasRitenuta)
  const isReverseOrEstero = Boolean(flags.reverseCharge || flags.isForeign || flags.estero || inferEsteroFlag(parsedDocument, direction))
  const isSplitPayment = Boolean(flags.splitPayment)
  const isIvaPerCassa = inferIvaPerCassaFlag(input, parsedDocument, sourceRow)
  const isProfessional = Boolean(flags.isProfessional)

  if (isRitenuta) {
    return {
      code: 'ritenuta_professionista',
      label: 'Ritenuta / professionista',
      managed: false,
    }
  }

  if (isProfessional) {
    return {
      code: 'professionista',
      label: 'Professionista',
      managed: true,
    }
  }

  if (isReverseOrEstero) {
    return {
      code: 'reverse_o_autofattura_estera',
      label: 'Reverse / autofattura estera',
      managed: false,
    }
  }

  if (isSplitPayment) {
    return {
      code: 'split_payment',
      label: 'Split payment',
      managed: true,
    }
  }

  if (isIvaPerCassa) {
    return {
      code: 'iva_per_cassa',
      label: 'IVA per cassa',
      managed: false,
    }
  }

  return {
    code: 'ordinario',
    label: 'Ordinario',
    managed: true,
  }
}

function buildContabilitaReadinessSummary(validation = {}, classification = null) {
  const blockers = Array.isArray(validation?.blockers) ? validation.blockers : []
  const warnings = Array.isArray(validation?.warnings) ? validation.warnings : []
  const unsupportedBlockerMatches = [
    'ritenuta presente ma non supportata',
    'reverse/estero presente ma non supportato',
    'iva per cassa non supportata',
  ]
  const hasUnsupportedCase = blockers.some((item) => unsupportedBlockerMatches.some((match) => String(item || '').toLowerCase().includes(match)))
    || Boolean(classification && classification.managed === false && (classification.code === 'ritenuta_professionista' || classification.code === 'reverse_o_autofattura_estera' || classification.code === 'iva_per_cassa'))

  if (hasUnsupportedCase) {
    return {
      status: 'bloccato_per_casistica_non_gestita',
      label: 'Bloccato per casistica non gestita',
      blockers,
      warnings,
    }
  }

  if (blockers.length || warnings.length) {
    return {
      status: 'incompleto',
      label: 'Incompleto',
      blockers,
      warnings,
    }
  }

  return {
    status: 'pronto_per_contabilita',
    label: 'Pronto per contabilità',
    blockers,
    warnings,
  }
}

function deriveDirection(sourceRow, parsedDocument) {
  const fromRow = normalizeText(sourceRow?.direction || sourceRow?.tipo || '')
  if (fromRow === 'acquisto' || fromRow === 'vendita') return fromRow

  const tipoDocumento = normalizeText(parsedDocument?.tipoDocumento || parsedDocument?.tipo_documento || '').toUpperCase()
  if (tipoDocumento.startsWith('TD')) {
    if (tipoDocumento === 'TD04' || tipoDocumento === 'TD16' || tipoDocumento === 'TD17' || tipoDocumento === 'TD18' || tipoDocumento === 'TD19') {
      return 'acquisto'
    }
    return 'acquisto'
  }

  return 'acquisto'
}

function extractCounterparty(parsedDocument, sourceRow, direction) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  const source = sourceRow && typeof sourceRow === 'object' ? sourceRow : {}
  const isVendita = direction === 'vendita'

  if (isVendita) {
    const name = pickFirstText(
      parsed?.cliente?.denominazione,
      parsed?.cessionario_denom,
      parsed?.denominazioneCliente,
      parsed?.customerName,
      parsed?.soggettoDenominazione,
      source?.soggetto_denominazione
    )
    const vatNumber = pickFirstText(
      parsed?.cliente?.partitaIva,
      parsed?.cessionario_piva,
      parsed?.partitaIvaCliente,
      parsed?.customerVat,
      source?.soggetto_piva
    )
    const taxCode = pickFirstText(
      parsed?.cliente?.codiceFiscale,
      parsed?.cessionario_cf,
      parsed?.codiceFiscaleCliente,
      parsed?.customerTaxCode,
      source?.soggetto_cf
    )
    return { name, vatNumber, taxCode }
  }

  const name = pickFirstText(
    parsed?.fornitore?.denominazione,
    parsed?.cedente_denom,
    parsed?.denominazioneFornitore,
    parsed?.supplierName,
    parsed?.soggettoDenominazione,
    source?.soggetto_denominazione
  )
  const vatNumber = pickFirstText(
    parsed?.fornitore?.partitaIva,
    parsed?.cedente_piva,
    parsed?.partitaIva,
    parsed?.pivaFornitore,
    parsed?.supplierVat,
    source?.soggetto_piva
  )
  const taxCode = pickFirstText(
    parsed?.fornitore?.codiceFiscale,
    parsed?.cedente_cf,
    parsed?.codiceFiscale,
    parsed?.cfFornitore,
    parsed?.supplierTaxCode,
    source?.soggetto_cf
  )

  return { name, vatNumber, taxCode }
}

function normalizePrimaNotaRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows
    .map((row, index) => {
      const debit = round2(row?.debit ?? row?.dare)
      const credit = round2(row?.credit ?? row?.avere)
      return {
        lineNo: Number.isInteger(Number(row?.lineNo)) ? Number(row.lineNo) : index + 1,
        accountId: normalizeText(row?.accountId || row?.conto_id || row?.contoId),
        description: normalizeText(row?.description || row?.descrizione || row?.descrizione_riga),
        debit,
        credit,
        vatCausaleId: normalizeText(row?.vatCausaleId || row?.causale_iva_id),
        vatCausaleCode: normalizeText(row?.vatCausaleCode || row?.causale_iva_codice),
        vatRowRef: normalizeText(row?.vatRowRef || row?.iva_row_id),
        rowType: normalizeText(row?.rowType || row?.tipo_riga_auto || 'core') || 'core',
      }
    })
    .filter((row) => row.accountId || row.debit > 0 || row.credit > 0)
}

function normalizeIvaRows(rows) {
  if (!Array.isArray(rows)) return []
  return rows.map((row, index) => {
    const taxable = round2(row?.taxable ?? row?.imponibile)
    const tax = round2(row?.tax ?? row?.imposta ?? row?.iva)
    const detraibilePercent = round2(row?.detraibilePercent ?? row?.percentualeDetraibilita ?? row?.percentuale_detraibilita ?? 100)
    const indetraibilePercent = round2(row?.indetraibilePercent ?? row?.percentualeIndetraibilita ?? row?.percentuale_indetraibilita ?? (100 - detraibilePercent))
    const detraibileTax = round2(row?.detraibileTax ?? row?.detraibileImposta ?? row?.iva_detraibile ?? (tax * detraibilePercent) / 100)
    const indetraibileTax = round2(row?.indetraibileTax ?? row?.indetraibileImposta ?? row?.iva_indetraibile ?? Math.max(0, tax - detraibileTax))

    return {
      idx: Number.isInteger(Number(row?.idx)) ? Number(row.idx) : index,
      rate: toNumber(row?.rate ?? row?.aliquota),
      nature: normalizeText(row?.nature ?? row?.natura) || null,
      taxable,
      tax,
      detraibilePercent,
      indetraibilePercent,
      detraibileTax,
      indetraibileTax,
      esigibilita: normalizeText(row?.esigibilita) || 'Immediata',
      causaleIvaId: normalizeText(row?.causaleIvaId || row?.causale_iva_id) || null,
      causaleIvaCode: normalizeText(row?.causaleIvaCode || row?.causale_iva_codice) || null,
    }
  })
}

export function deriveVatCompetence(registrationDate, periodicity) {
  const parsed = parseIsoDateStrict(registrationDate)
  if (!parsed) return null

  const normalizedPeriodicity = periodicity === 'trimestrale' ? 'trimestrale' : 'mensile'
  const quarter = Math.floor((parsed.month - 1) / 3) + 1

  if (normalizedPeriodicity === 'trimestrale') {
    return {
      mode: 'by_registration_date',
      periodicity: 'trimestrale',
      year: parsed.year,
      month: parsed.month,
      quarter,
      periodKey: `${parsed.year}-Q${quarter}`,
    }
  }

  return {
    mode: 'by_registration_date',
    periodicity: 'mensile',
    year: parsed.year,
    month: parsed.month,
    quarter,
    periodKey: `${parsed.year}-${String(parsed.month).padStart(2, '0')}`,
  }
}

export function buildImportContabilitaCommitPayload(input = {}) {
  const options = input?.options && typeof input.options === 'object' ? input.options : {}
  const periodicity = options.vatPeriodicity === 'trimestrale' ? 'trimestrale' : 'mensile'
  const nowIso = normalizeText(options.nowIso) || new Date().toISOString()

  const parsedDocument = input?.parsedDocument && typeof input.parsedDocument === 'object' ? input.parsedDocument : {}
  const sourceRow = input?.sourceRow && typeof input.sourceRow === 'object' ? input.sourceRow : null

  const documentNumber = normalizeText(
    parsedDocument?.numeroDocumento ||
      parsedDocument?.numero_documento ||
      sourceRow?.numeroDocumento ||
      sourceRow?.numero_documento
  )
  const documentDate = normalizeText(
    parsedDocument?.dataDocumento ||
      parsedDocument?.data_documento ||
      sourceRow?.dataDocumento ||
      sourceRow?.data_documento
  )
  const registrationDate = normalizeText(input?.registrationDate)

  const totals = {
    taxable: round2(parsedDocument?.imponibile ?? sourceRow?.imponibile),
    vat: round2(parsedDocument?.iva ?? sourceRow?.iva),
    gross: round2(parsedDocument?.totale ?? sourceRow?.totale),
  }

  const accountingRows = normalizePrimaNotaRows(input?.primaNotaDraftRows)
  const vatRows = normalizeIvaRows(input?.ivaDraftRows)
  const totalDebit = round2(accountingRows.reduce((sum, row) => sum + row.debit, 0))
  const totalCredit = round2(accountingRows.reduce((sum, row) => sum + row.credit, 0))
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01

  const direction = deriveDirection(sourceRow, parsedDocument)
  const vatCompetence = deriveVatCompetence(registrationDate, periodicity)
  const mappedCounterparty = extractCounterparty(parsedDocument, sourceRow, direction)

  const counterparty = {
    name: mappedCounterparty.name || null,
    vatNumber: mappedCounterparty.vatNumber || null,
    taxCode: mappedCounterparty.taxCode || null,
    accountId: normalizeText(input?.counterpartyAccount?.id || input?.counterpartyAccount?.accountId) || null,
    accountCode: normalizeText(input?.counterpartyAccount?.codice || input?.counterpartyAccount?.code) || null,
  }

  const flags = parsedDocument?.flags && typeof parsedDocument.flags === 'object' ? parsedDocument.flags : {}
  const hasRitenuta = Boolean(flags.hasRitenuta)
  const hasReverseOrEstero = Boolean(flags.reverseCharge || flags.isForeign || flags.estero || inferEsteroFlag(parsedDocument, direction))

  const blockers = []
  const warnings = []

  if (!normalizeText(input?.societaId)) blockers.push('societaId mancante')
  if (!sourceRow) blockers.push('sourceRow mancante')
  if (!documentNumber) blockers.push('numero documento mancante')
  if (!documentDate) blockers.push('data documento mancante')
  if (!registrationDate) blockers.push('data registrazione mancante')
  if (registrationDate && !parseIsoDateStrict(registrationDate)) blockers.push('data registrazione non valida')
  if (!hasAccountRef(input?.counterpartyAccount)) blockers.push('conto controparte mancante')
  if (!hasAccountRef(input?.costRevenueAccount)) blockers.push('conto costo/ricavo mancante')
  if (!hasCausaleRef(input?.causaleContabile)) blockers.push('causale contabile mancante')
  if (!accountingRows.length) blockers.push('righe prima nota assenti')
  if (accountingRows.length && !isBalanced) blockers.push('Dare/Avere non quadrati')
  if (!(totals.gross > 0)) blockers.push('totale documento non valido')

  if (totals.vat > 0 && vatRows.length === 0) {
    blockers.push('righe IVA mancanti se documento con IVA')
  }

  if (vatRows.some((row) => row.tax > 0 && !normalizeText(row.causaleIvaId || row.causaleIvaCode))) {
    blockers.push('causale IVA mancante su riga IVA')
  }

  if (hasRitenuta) blockers.push('ritenuta presente ma non supportata in P7C1')
  if (hasReverseOrEstero) blockers.push('reverse/estero presente ma non supportato in P7C1')

  const rawXmlMissing = !normalizeText(parsedDocument?.rawXml)
  if (rawXmlMissing) warnings.push('rawXml assente')

  if (input?.automationMeta && typeof input.automationMeta === 'object' && Object.keys(input.automationMeta).length > 0) {
    warnings.push('automationMeta presente')
  }

  if (counterparty.accountId && !counterparty.name && !counterparty.vatNumber && !counterparty.taxCode) {
    warnings.push('dati controparte incompleti ma conto presente')
  }

  if (vatRows.some((row) => row.indetraibilePercent > 0 || row.indetraibileTax > 0)) {
    warnings.push('iva indetraibile presente e regola non ancora definitiva')
  }

  const withholding = {
    enabled: hasRitenuta,
    supported: false,
    percipienteId: normalizeText(input?.percipienteDecision?.percipienteId) || null,
    blockedReason: hasRitenuta ? 'ritenuta non supportata in P7C1' : null,
    rows: [],
  }

  const ledgerDraft = input?.partitarioDraft && typeof input.partitarioDraft === 'object' ? input.partitarioDraft : {}
  const ledgerEnabled = Boolean(ledgerDraft.enabled ?? true)
  const ledgerAmount = round2(ledgerDraft.amount ?? totals.gross)
  const ledger = {
    enabled: ledgerEnabled,
    type: normalizeText(ledgerDraft.type) || (direction === 'vendita' ? 'cliente' : 'fornitore'),
    accountId: normalizeText(ledgerDraft.accountId || counterparty.accountId) || null,
    amount: ledgerAmount,
    documentNumber,
    documentDate,
    dueDate: normalizeText(ledgerDraft.dueDate) || null,
  }

  const validation = {
    status: blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockers,
    warnings,
  }

  const payload = {
    handoff: {
      contractVersion: 'P7B-v3',
      sourceModule: 'import_contabilita',
      sourceBatchId: normalizeText(input?.sourceBatchId) || null,
      sourceRowKey: normalizeText(input?.sourceRowKey) || null,
      sourceFileName: normalizeText(sourceRow?.filename || sourceRow?.name || parsedDocument?.filename) || null,
      operatorId: normalizeText(input?.operatorId) || null,
      createdAt: nowIso,
    },
    company: {
      societaId: normalizeText(input?.societaId) || null,
    },
    document: {
      direction,
      type: normalizeText(sourceRow?.tipo_documento || parsedDocument?.tipoDocumento || parsedDocument?.tipo_documento) || 'fattura_passiva',
      number: documentNumber || null,
      documentDate: documentDate || null,
      registrationDate: registrationDate || null,
      vatCompetence,
      counterparty,
      totals,
    },
    accounting: {
      causaleContabile: {
        id: normalizeText(input?.causaleContabile?.id) || null,
        code: normalizeText(input?.causaleContabile?.codice || input?.causaleContabile?.code) || null,
        description: normalizeText(input?.causaleContabile?.descrizione || input?.causaleContabile?.description) || null,
      },
      rows: accountingRows,
      totals: {
        debit: totalDebit,
        credit: totalCredit,
      },
      isBalanced,
    },
    vat: {
      enabled: totals.vat > 0,
      registerType: direction === 'vendita' ? 'vendite' : 'acquisti',
      competenceDate: registrationDate || null,
      rows: vatRows,
      totals: {
        taxable: round2(vatRows.reduce((sum, row) => sum + row.taxable, 0)),
        tax: round2(vatRows.reduce((sum, row) => sum + row.tax, 0)),
        detraibileTax: round2(vatRows.reduce((sum, row) => sum + row.detraibileTax, 0)),
        indetraibileTax: round2(vatRows.reduce((sum, row) => sum + row.indetraibileTax, 0)),
      },
    },
    ledger,
    withholding,
    validation,
    automationMeta: input?.automationMeta && typeof input.automationMeta === 'object' ? input.automationMeta : {},
  }

  return {
    payload,
    validation,
  }
}

export function buildContabilitaPayloadFromImportRow(importRow = {}, options = {}) {
  const source = importRow && typeof importRow === 'object' ? importRow : {}
  const builderInput = source?.builderInput && typeof source.builderInput === 'object'
    ? source.builderInput
    : {
        ...source,
        options: options && typeof options === 'object' ? options : source?.options,
      }
  const result = buildImportContabilitaCommitPayload(builderInput)
  const classification = classifyContabilitaScenario(builderInput, result.payload)
  const readiness = buildContabilitaReadinessSummary(result.validation, classification)

  return {
    ...result,
    classification,
    readiness,
    payload: {
      ...result.payload,
      classification,
      readiness,
    },
  }
}
