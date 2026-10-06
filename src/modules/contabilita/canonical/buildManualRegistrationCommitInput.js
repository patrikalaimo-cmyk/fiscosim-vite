import { buildCanonicalPayloadHash } from './canonicalPayloadHash.js'
import { buildPrimaNotaPayloadFromState } from '../../../../domain/primaNotaPipeline.js'
import {
  normalizePartitarioEntry,
  normalizeRigaForPrimaNotaPayload,
} from '../../../../domain/primaNotaPayloadBuilder.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function toMoneyNumber(value) {
  const parsed = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function buildAccountingRowsFromPrimaNotaRows(righePayload = []) {
  return (Array.isArray(righePayload) ? righePayload : []).map((row, index) => ({
    rowNumber: Number.isInteger(Number(row?.riga_numero)) ? Number(row.riga_numero) : index + 1,
    accountId: row?.conto_id || null,
    accountCode: row?.conto_codice || null,
    accountDescription: row?.conto_descrizione || null,
    description: row?.descrizione_riga || row?.descrizione || '',
    debit: toMoneyNumber(row?.importo_dare ?? row?.dare),
    credit: toMoneyNumber(row?.importo_avere ?? row?.avere),
    amount: Math.max(toMoneyNumber(row?.importo_dare ?? row?.dare), toMoneyNumber(row?.importo_avere ?? row?.avere)),
  }))
}

function buildQuadraturaFromAccountingRows(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  const dare = list.reduce((sum, row) => sum + toMoneyNumber(row?.debit ?? row?.dare), 0)
  const avere = list.reduce((sum, row) => sum + toMoneyNumber(row?.credit ?? row?.avere), 0)
  const diff = Math.round((dare - avere) * 100) / 100
  return {
    totDare: dare,
    totAvere: avere,
    diff,
    isBalanced: diff === 0,
  }
}

function buildResolvedCausaleContabile({ header = {}, sourceDoc = null } = {}) {
  const resolved = sourceDoc?.causaleContabile || sourceDoc?.causale_contabile || header?.causaleContabile || null
  if (resolved && typeof resolved === 'object') {
    return {
      id: normalizeText(resolved.id || header?.causale_id || ''),
      codice: normalizeText(resolved.codice || resolved.code || header?.causale_codice || header?.causale_id || ''),
      descrizione: normalizeText(resolved.descrizione || resolved.label || resolved.nome || header?.causale_descrizione || ''),
    }
  }

  const causaleId = normalizeText(header?.causale_id || '')
  if (!causaleId) return null
  return {
    id: causaleId,
    codice: causaleId,
    descrizione: normalizeText(header?.causale_descrizione || header?.causale_label || ''),
  }
}

function buildResolvedDescription({ sourceDoc = null, header = {}, rows = [] } = {}) {
  const candidates = [
    header?.descrizione,
    sourceDoc?.descrizione_registrazione,
    sourceDoc?.descrizione,
    sourceDoc?.numero_documento ? `Registrazione ${sourceDoc.numero_documento}` : '',
    sourceDoc?.filename,
    rows.find((row) => normalizeText(row?.descrizione))?.descrizione,
    'Registrazione manuale',
  ]
  return normalizeText(candidates.find((candidate) => normalizeText(candidate)))
}

function buildFiscalContext({ header = {}, sourceDoc = null, validation = {} } = {}) {
  const dataRegistrazione = normalizeText(header?.data_registrazione || sourceDoc?.data_registrazione || validation?.dataRegistrazione || '')
  const tipoRegistro = normalizeText(validation?.tipoRegistro || (Array.isArray(validation?.ivaRows) && validation.ivaRows.length > 0 ? 'acquisti' : 'manuale'))
  const reverseCharge = Boolean(validation?.reverseCharge || sourceDoc?.reverse_charge)
  const splitPayment = Boolean(validation?.splitPayment || sourceDoc?.split_payment)
  const ivaPerCassa = Boolean(validation?.ivaPerCassa || sourceDoc?.iva_per_cassa)
  const ritenutaPresente = Boolean(validation?.ritenute || sourceDoc?.ritenuta_presente)

  return {
    dataRegistrazione,
    dataDocumento: normalizeText(sourceDoc?.data_documento || header?.data_documento || '') || null,
    competenza: null,
    periodoIva: normalizeText(validation?.periodoIva || sourceDoc?.periodo_iva || '') || null,
    tipoOperazione: normalizeText(validation?.tipoOperazione || sourceDoc?.tipo_operazione || 'manuale') || 'manuale',
    tipoRegistro: tipoRegistro || null,
    regimeIva: normalizeText(validation?.regimeIva || sourceDoc?.regime_iva || '') || null,
    reverseCharge,
    splitPayment,
    ivaPerCassa,
    proRata: validation?.proRata ?? null,
    ritenutaPresente,
  }
}

function buildVatRowsFromValidation(validation = {}) {
  const rows = Array.isArray(validation?.ivaRows) ? validation.ivaRows : []
  return rows.map((row, index) => ({
    rowNumber: index + 1,
    registerType: normalizeText(row?.registerType || validation?.tipoRegistro || 'acquisti') || 'acquisti',
    causaleIvaId: normalizeText(row?.causale_iva_id || row?.causaleIvaId || ''),
    causaleIva: normalizeText(row?.causale_iva || row?.causaleIva || ''),
    aliquota: Number.isFinite(Number(row?.aliquota)) ? Number(row.aliquota) : null,
    natura: row?.natura ?? null,
    imponibile: toMoneyNumber(row?.imponibile),
    imposta: toMoneyNumber(row?.iva ?? row?.imposta),
    detraibilitaPercent: Number.isFinite(Number(row?.percDetraibile)) ? Number(row.percDetraibile) : 100,
    indetraibileAmount: toMoneyNumber(row?.ivaIndetraibile ?? row?.indetraibileAmount),
    esigibilita: row?.esigibilita ?? null,
    splitPayment: Boolean(row?.splitPayment),
    reverseCharge: Boolean(row?.reverseCharge),
    reverseChargeMode: row?.reverseChargeMode ?? null,
    ivaPerCassa: Boolean(row?.ivaPerCassa),
    proRata: row?.proRata ?? null,
    autofattura: Boolean(row?.autofattura),
    integrazioneEstero: Boolean(row?.integrazioneEstero),
  }))
}

function buildOperatorDecisions(validation = {}, sourceDoc = null) {
  const decisions = []
  if (Array.isArray(validation?.blocking)) {
    for (const item of validation.blocking) {
      decisions.push({ type: 'blocking', message: String(item), source: 'manual_ui_validation' })
    }
  }
  if (Array.isArray(validation?.warnings)) {
    for (const item of validation.warnings) {
      decisions.push({ type: 'warning', message: String(item), source: 'manual_ui_validation' })
    }
  }
  if (sourceDoc?.id) {
    decisions.push({ type: 'source_document', message: `Documento sorgente ${sourceDoc.id}`, source: 'manual_ui_validation' })
  }
  return decisions
}

export function buildManualRegistrationCanonicalPayloadFromState({
  societaId,
  esercizioId,
  header = {},
  rows = [],
  progressivo = null,
  partitarioClosedMap = {},
  defaultDataRegistrazione,
  sourceDoc = null,
  utente = null,
  draftId = null,
  payloadId = null,
  sourceDocumentId = null,
  validation = {},
  postCommitTargets = {},
} = {}) {
  const { pnPayload, righePayload, partEntries } = buildPrimaNotaPayloadFromState({
    societaId,
    header,
    rows,
    progressivo,
    partitarioClosedMap,
    defaultDataRegistrazione,
    filterRiga: (row) => toMoneyNumber(row?.dare) > 0 || toMoneyNumber(row?.avere) > 0,
    mapRiga: normalizeRigaForPrimaNotaPayload,
    mapPartitarioEntry: normalizePartitarioEntry,
    filterPartitarioEntry: (entry) => toMoneyNumber(entry?.importo_chiuso) > 0,
  })

  const resolvedSourceDocumentId = normalizeText(
    sourceDocumentId || sourceDoc?.id || draftId || payloadId || header?.numero_registrazione || header?.cliente_fornitore_id || 'manual-registration'
  )
  const resolvedPayloadId = normalizeText(payloadId || draftId || resolvedSourceDocumentId)
  const accountingRows = buildAccountingRowsFromPrimaNotaRows(righePayload)
  const quadratura = buildQuadraturaFromAccountingRows(accountingRows)
  const causaleContabile = buildResolvedCausaleContabile({ header, sourceDoc })
  const description = buildResolvedDescription({ sourceDoc, header, rows })
  const fiscalContext = buildFiscalContext({ header, sourceDoc, validation })
  const vatRows = buildVatRowsFromValidation(validation)
  const shouldCreateIva = vatRows.length > 0
  const canonicalPayload = {
    schemaVersion: 'core-closure-06-manual-1',
    payloadId: resolvedPayloadId,
    idempotencyKey: normalizeText(validation?.idempotencyKey || ''),
    sourceModule: 'registrazione_manual',
    sourceDocumentId: resolvedSourceDocumentId,
    source: {
      module: 'registrazione_manual',
      sourceDocumentId: resolvedSourceDocumentId,
      sourceBatchId: normalizeText(draftId || payloadId || resolvedSourceDocumentId) || null,
      sourceMeta: {
        mode: 'manual_guided',
        source: 'prima_nota_guidata',
      },
    },
    company: {
      societaId: normalizeText(societaId),
      esercizioId: normalizeText(esercizioId),
    },
    fiscalContext,
    header: {
      ...clone(pnPayload),
      causaleContabile,
      descrizione,
      stato: 'confermato',
      progressivo: progressivo ?? null,
    },
    document: {
      numeroDocumento: normalizeText(sourceDoc?.numero_documento || header?.numero_documento || header?.numero_registrazione || resolvedSourceDocumentId) || null,
      dataDocumento: normalizeText(sourceDoc?.data_documento || header?.data_registrazione || defaultDataRegistrazione || '') || null,
      tipoDocumento: normalizeText(sourceDoc?.tipo_documento || 'manuale') || 'manuale',
      totals: {
        dare: quadratura.totDare,
        avere: quadratura.totAvere,
        diff: quadratura.diff,
        balanced: quadratura.isBalanced,
      },
    },
    accounting: {
      rows: accountingRows,
      quadratura,
      dare: quadratura.totDare,
      avere: quadratura.totAvere,
    },
    vat: {
      enabled: shouldCreateIva,
      registerType: normalizeText(fiscalContext?.tipoRegistro || 'manuale') || 'manuale',
      rows: vatRows,
    },
    ledger: {
      enabled: false,
      mode: 'none',
      rows: [],
    },
    withholding: {
      enabled: false,
      eventType: 'document',
      recipient: {},
      rows: [],
    },
    attachments: {
      sourceFile: sourceDoc?.filename ? {
        filename: sourceDoc.filename,
        mimeType: sourceDoc?.mime_type || null,
        url: sourceDoc?.file_url || null,
        storagePath: sourceDoc?.file_path || null,
      } : null,
    },
    primaNotaRighe: clone(righePayload),
    partitarioMovements: clone(partEntries),
    subjects: [
      {
        id: normalizeText(header?.cliente_fornitore_id || sourceDoc?.cliente_fornitore_id || 'manual-counterparty') || 'manual-counterparty',
        role: 'counterparty',
        tipoSoggetto: normalizeText(sourceDoc?.tipo_soggetto || header?.tipo_soggetto || 'cliente_fornitore') || 'cliente_fornitore',
        denominazione: normalizeText(sourceDoc?.soggetto_denominazione || header?.cliente_fornitore_nome || ''),
      },
    ],
    audit: {
      sourceModule: 'registrazione_manual',
      createdBy: normalizeText(utente?.id || utente?.user_id || utente?.uid || ''),
      createdAt: new Date().toISOString(),
      sourceAction: 'manual_guided_mock_commit',
      registrationMode: 'manual_guided',
      operatorDecisions: buildOperatorDecisions(validation, sourceDoc),
    },
    validation: {
      readiness: 'ready',
      blocking: Array.isArray(validation?.blocking) ? [...validation.blocking] : [],
      errors: Array.isArray(validation?.errors) ? [...validation.errors] : [],
      warnings: Array.isArray(validation?.warnings) ? [...validation.warnings] : [],
    },
    postCommitTargets: {
      shouldCreatePrimaNota: true,
      shouldCreateDocumentiContabilita: Boolean(sourceDoc?.id),
      shouldCreateIva,
      shouldCreateLedger: false,
      shouldCreateWithholding: false,
      shouldCreateScadenziario: false,
      shouldAttachSourceDocument: Boolean(sourceDoc?.id),
      shouldUpdateAuditTrail: true,
      ...clone(postCommitTargets),
    },
  }

  return canonicalPayload
}

export function buildManualRegistrationCommitInput({
  canonicalPayload,
  context = {},
  options = {},
} = {}) {
  const societaId = normalizeText(context.societaId || canonicalPayload?.company?.societaId)
  const esercizioId = normalizeText(context.esercizioId || canonicalPayload?.company?.esercizioId)
  const utenteId = normalizeText(context.utenteId || canonicalPayload?.audit?.createdBy || context.userId)
  const sourceDocumentId = normalizeText(
    context.sourceDocumentId || canonicalPayload?.sourceDocumentId || canonicalPayload?.source?.sourceDocumentId || context.draftId || context.payloadId
  )
  const draftRoot = normalizeText(context.draftId || context.payloadId || sourceDocumentId)
  const registrationFingerprint = normalizeText(
    context.registrationFingerprint || buildCanonicalPayloadHash(canonicalPayload).slice(0, 16)
  )
  const idempotencyKey = normalizeText(
    context.idempotencyKey || `manual:${societaId}:${esercizioId}:${draftRoot || registrationFingerprint}`
  )

  return {
    societaId,
    esercizioId,
    utenteId,
    sourceModule: 'registrazione_manual',
    sourceDocumentId: sourceDocumentId || draftRoot || registrationFingerprint,
    idempotencyKey,
    canonicalPayload,
    options: {
      dryRun: Boolean(options.dryRun),
      allowRealCommit: options.allowRealCommit === true,
      expectedPayloadVersion: options.expectedPayloadVersion || canonicalPayload?.schemaVersion || '1.0.0',
      requestId: normalizeText(options.requestId || ''),
      simulateFailureAt: normalizeText(options.simulateFailureAt || ''),
    },
    registrationFingerprint,
  }
}
