function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function getDocumentTotal(document) {
  return toNumber(document?.totals?.total ?? document?.totals?.gross ?? 0)
}

function readSourceMetadata(normalized) {
  const raw = normalized?.raw || {}
  const document = normalized?.document || {}
  const handoff = raw?.handoff || {}
  const source = raw?.source || document?.source || {}
  return {
    sourceFileName: handoff?.sourceFileName || raw?.sourceFileName || document?.fileName || source?.fileName || null,
    sourceBatchId: handoff?.sourceBatchId || raw?.sourceBatchId || document?.sourceBatchId || source?.batchId || null,
    sourceRowKey: handoff?.sourceRowKey || raw?.sourceRowKey || document?.sourceRowKey || source?.rowKey || null,
  }
}

function getRegistrationYear(document) {
  const registrationDate = String(document?.registrationDate || '').trim()
  if (!registrationDate) return null
  const year = Number(registrationDate.slice(0, 4))
  return Number.isInteger(year) && year > 0 ? year : null
}

export function mapCommitPayloadToDocumentoContabilita(normalized, ctx = {}) {
  const document = normalized?.document || {}
  const counterparty = document.counterparty || {}
  const company = normalized?.company || {}
  const operatorId = ctx.operatorId || null
  const sourceMetadata = readSourceMetadata(normalized)
  return {
    societa_id: company.societaId || null,
    filename: sourceMetadata.sourceFileName,
    tipo_documento: document.type || 'fattura_passiva',
    numero_documento: document.number || null,
    data_documento: document.documentDate || null,
    soggetto_denominazione: counterparty.name || null,
    soggetto_piva: counterparty.piva || counterparty.vatNumber || null,
    soggetto_cf: counterparty.cf || counterparty.taxCode || null,
    imponibile: toNumber(document.totals?.taxable),
    iva: toNumber(document.totals?.vat),
    totale: getDocumentTotal(document),
    conto_id: counterparty.accountId || null,
    validation_status: 'confirmed',
    workflow_status: 'confirmed',
    validated_by: operatorId,
    validated_at: ctx.now || null,
    note_operatore: document.operatorNote || null,
  }
}

export function mapCommitPayloadToPrimaNota(normalized, ctx = {}) {
  const document = normalized?.document || {}
  const accounting = normalized?.accounting || {}
  const company = normalized?.company || {}
  const operatorId = ctx.operatorId || null
  const documentTotal = getDocumentTotal(document)
  const registrationNumber = ctx.registrationNumber ?? accounting.registrationNumber ?? null

  return {
    societa_id: company.societaId || null,
    esercizio: getRegistrationYear(document),
    numero_registrazione: registrationNumber,
    data_registrazione: document.registrationDate || null,
    data_documento: document.documentDate || null,
    numero_documento: document.number || null,
    causale_id: accounting.causaleContabile?.id || null,
    causale_codice: accounting.causaleContabile?.code || null,
    descrizione: document.description || null,
    conto_cliente_fornitore_id: document.counterparty?.accountId || null,
    cliente_fornitore_nome: document.counterparty?.name || null,
    totale_dare: documentTotal,
    totale_avere: documentTotal,
    totale_imponibile: toNumber(document.totals?.taxable),
    totale_iva: toNumber(document.totals?.vat),
    stato: 'provvisoria',
    documento_id: '__DOCUMENTI_CONTABILITA_ID__',
    tipo_registrazione: 'import_contabilita',
    created_by: operatorId,
  }
}

export function mapCommitPayloadToPrimaNotaRighe(normalized, ctx = {}) {
  const rows = Array.isArray(normalized?.accountingRows) ? normalized.accountingRows : []
  return rows.map((row, index) => ({
    riga_numero: Number(row?.lineNumber || index + 1),
    conto_id: row?.accountId || null,
    conto_codice: row?.accountCode || null,
    conto_descrizione: row?.accountDescription || row?.description || null,
    descrizione_riga: row?.description || null,
    importo_dare: toNumber(row?.debit),
    importo_avere: toNumber(row?.credit),
  }))
}

export function mapCommitPayloadToFinalization(normalized, ctx = {}) {
  const document = normalized?.document || {}
  const operatorId = ctx.operatorId || null
  const sourceMetadata = readSourceMetadata(normalized)

  return {
    targetTable: 'documenti_contabilita',
    executable: true,
    targetStatus: 'registered',
    workflowStatus: 'registered',
    validationStatus: 'validated',
    primaNotaIdField: 'prima_nota_id',
    primaNotaIdPlaceholder: '__PRIMA_NOTA_ID__',
    registeredAt: ctx.now || null,
    registeredBy: operatorId,
    noteOperatore: document.operatorNote || null,
    auditNote: 'P7C3 skeleton finalization contract only; no DB write executed.',
    sourceModule: 'import_contabilita',
    sourceBatchId: sourceMetadata.sourceBatchId,
    sourceRowKey: sourceMetadata.sourceRowKey,
    stateTransition: {
      from: ['draft', 'validated'],
      inFlight: 'registering',
      success: 'registered',
      failure: 'failed',
      compensationFallback: 'validated',
    },
  }
}
