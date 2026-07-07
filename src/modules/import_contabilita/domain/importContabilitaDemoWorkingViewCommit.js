/**
 * Commit controllato 24E — working view Import su società demo (1 documento).
 */

import { isDemoCompany } from '../../test_mode/demoCompanyGuard.js'
import { DEMO_PIANO_CODICE } from '../../test_mode/testLabAccountingSchema.js'
import {
  buildContabilitaPayloadFromImportRow,
  buildImportContabilitaCommitPayload,
} from './buildImportContabilitaCommitPayload.js'
import {
  assessWorkingViewIvaDraftRows,
  mergeWorkingViewChecksWithIvaDraft,
} from './importContabilitaDemoCausaliIva.js'

function normalizeText(value) {
  return String(value || '').trim()
}

function round2(value) {
  return Math.round((Number(value || 0) || 0) * 100) / 100
}

function normalizePianoCodice(value) {
  return normalizeText(value).replace(/\./g, ' ').replace(/\s+/g, ' ')
}

/**
 * @param {Array<object>|null|undefined} pianoConti
 * @returns {object|null}
 */
export function resolveDemoIvaCreditAccount(pianoConti) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  const target = normalizePianoCodice(DEMO_PIANO_CODICE.ivaCredito)
  const byCode = list.find((row) => normalizePianoCodice(row?.codice) === target)
  if (byCode?.id) return byCode
  return list.find((row) => row?.is_iva === true && row?.id) || null
}

/**
 * @param {object|null|undefined} model
 * @param {object|null|undefined} ivaCreditAccount
 * @returns {Array<object>}
 */
export function parseNumberRobust(value) {
  if (value === '' || value == null) return 0
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0
  }
  
  let str = String(value).trim()
  if (!str) return 0

  if (str.includes('.') && str.includes(',')) {
    const dotIndex = str.indexOf('.')
    const commaIndex = str.indexOf(',')
    if (dotIndex < commaIndex) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      str = str.replace(/,/g, '')
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  }

  const parsed = Number(str)
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function normalizeImportWorkingViewAccountingRow(row) {
  const accountId = String(row?.accountId || row?.conto_id || row?.contoId || '').trim()
  const accountCode = String(row?.accountCode || row?.conto_codice || row?.contoCodice || '').trim()
  const accountDescription = String(row?.accountDescription || row?.conto_descrizione || row?.contoDescrizione || '').trim()
  const description = String(row?.description || row?.descrizione || row?.descrizione_riga || row?.note || '').trim()

  const rawDare = row?.dare ?? row?.debit ?? row?.importoDare ?? row?.importo_dare ?? 0
  const rawAvere = row?.avere ?? row?.credit ?? row?.importoAvere ?? row?.importo_avere ?? 0

  const dareNum = parseNumberRobust(rawDare)
  const avereNum = parseNumberRobust(rawAvere)

  if (dareNum > 0 && avereNum > 0) {
    throw new Error(`Riga contabile non valida: presenza di doppio importo Dare/Avere sulla stessa riga (conto: ${accountCode || accountId || 'non specificato'})`)
  }

  if (dareNum === 0 && avereNum === 0) {
    throw new Error(`Riga contabile non valida: importo pari a zero sia in Dare che in Avere (conto: ${accountCode || accountId || 'non specificato'})`)
  }

  return {
    lineNo: Number(row?.lineNo || row?.rowNumber || row?.riga || 1),
    accountId,
    accountCode,
    accountDescription,
    description,
    debit: dareNum,
    credit: avereNum,
  }
}

export function buildWorkingViewPrimaNotaDraftRowsFromModel(model, ivaCreditAccount = null) {
  const imponibile = round2(model?.imponibile)
  const iva = round2(model?.iva)
  const totale = round2(model?.totale)
  const costAccount = model?.costRevenueAccount || null
  const counterpartyAccount = model?.counterpartyAccount || null

  return [
    {
      lineNo: 1,
      accountId: normalizeText(costAccount?.id),
      accountCode: normalizeText(costAccount?.codice || costAccount?.code),
      accountDescription: normalizeText(costAccount?.descrizione || costAccount?.description),
      description: 'Imponibile su conto costi/ricavi',
      dare: imponibile,
      avere: 0,
    },
    {
      lineNo: 2,
      accountId: normalizeText(ivaCreditAccount?.id),
      accountCode: normalizeText(ivaCreditAccount?.codice || ivaCreditAccount?.code),
      accountDescription: normalizeText(ivaCreditAccount?.descrizione || ivaCreditAccount?.description),
      description: normalizeText(ivaCreditAccount?.descrizione) || 'IVA ns credito',
      dare: iva,
      avere: 0,
    },
    {
      lineNo: 3,
      accountId: normalizeText(counterpartyAccount?.id),
      accountCode: normalizeText(counterpartyAccount?.codice || counterpartyAccount?.code),
      accountDescription: normalizeText(counterpartyAccount?.descrizione || counterpartyAccount?.description),
      description: 'Fornitore',
      dare: 0,
      avere: totale,
    },
  ]
}

/**
 * @param {Array<object>|null|undefined} ivaDraftRows
 * @returns {Array<object>}
 */
export function mapWorkingViewIvaDraftToCommitRows(ivaDraftRows) {
  return (Array.isArray(ivaDraftRows) ? ivaDraftRows : []).map((row, index) => ({
    idx: index,
    rate: Number(row?.aliquota ?? 0) || 0,
    taxable: round2(row?.imponibile),
    tax: round2(row?.imposta ?? row?.iva),
    detraibilePercent: round2(row?.detraibilePercent ?? 100),
    indetraibilePercent: round2(row?.indetraibilePercent ?? 0),
    detraibileTax: round2(row?.detraibileImposta ?? row?.imposta ?? row?.iva),
    indetraibileTax: round2(row?.indetraibileImposta ?? 0),
    esigibilita: normalizeText(row?.esigibilita) || 'Immediata',
    causaleIvaId: normalizeText(row?.causaleIvaId || row?.causale_iva_id),
    causaleIvaCode: normalizeText(row?.causaleIvaCode),
  }))
}

/**
 * @param {object|null|undefined} model
 * @returns {{ status: 'ok'|'blocked', blockingIssues: string[], checks: Array<object> }}
 */
export function assessWorkingViewPartitarioDraft(model) {
  const blockingIssues = []
  const checks = []
  const counterpartyAccount = model?.counterpartyAccount || null
  const totale = round2(model?.totale)
  const label = normalizeText(model?.fornitoreCliente) || 'Controparte'

  if (!normalizeText(counterpartyAccount?.id)) {
    blockingIssues.push('Partitario incompleto: controparte patrimoniale mancante')
    checks.push({ key: 'partitario-account', label: 'Controparte patrimoniale mancante', status: 'blocked' })
  } else {
    checks.push({ key: 'partitario-account', label: 'Controparte patrimoniale collegata', status: 'ok', detail: label })
  }

  if (!(totale > 0)) {
    blockingIssues.push('Partitario incompleto: totale documento mancante')
    checks.push({ key: 'partitario-amount', label: 'Totale partita mancante', status: 'blocked' })
  } else {
    checks.push({ key: 'partitario-amount', label: 'Totale partita', status: 'ok', detail: String(totale) })
  }

  return {
    status: blockingIssues.length ? 'blocked' : 'ok',
    blockingIssues,
    warnings: [],
    checks,
  }
}

/**
 * @param {object} params
 * @returns {{ allowed: boolean, blockingIssues: string[], checks: object }}
 */
export function evaluateDemo24EWorkingViewCommitGuards({
  societa = null,
  selectedRowIds = new Set(),
  workingViewOpen = false,
  workingViewRowId = '',
  activeWorkingViewModel = null,
  baseWorkingViewChecks = null,
  ivaDraftRows = [],
  pnDraftRows = [],
  partitarioChecks = null,
  pianoConti = [],
} = {}) {
  const blockingIssues = []

  if (!isDemoCompany(societa)) {
    blockingIssues.push('Commit 24E consentito solo su società demo (__TEST__ / test_)')
  }

  if (!resolveDemoIvaCreditAccount(pianoConti)?.id) {
    blockingIssues.push('Conto IVA credito demo mancante nel piano conti')
  }

  const selectedCount = selectedRowIds instanceof Set ? selectedRowIds.size : 0
  if (selectedCount !== 1) {
    blockingIssues.push('Commit 24E: seleziona esattamente 1 riga pronta')
  }

  if (!workingViewOpen || !workingViewRowId) {
    blockingIssues.push('Commit 24E: apri la working view sul documento selezionato')
  }

  if (workingViewRowId && activeWorkingViewModel?.rowKey && workingViewRowId !== activeWorkingViewModel.rowKey) {
    blockingIssues.push('Commit 24E: working view non allineata alla riga selezionata')
  }

  if (activeWorkingViewModel?.readiness?.ready !== true) {
    blockingIssues.push('Commit 24E: la riga selezionata non è pronta')
  }

  const rowState = normalizeText(activeWorkingViewModel?.row?.state).toLowerCase()
  if (rowState === 'committed' || rowState === 'registered' || rowState === 'processed') {
    blockingIssues.push('Commit 24E: documento già contabilizzato')
  }

  const merged = mergeWorkingViewChecksWithIvaDraft(
    mergeWorkingViewChecksWithIvaDraft(baseWorkingViewChecks, assessWorkingViewIvaDraftRows(ivaDraftRows)),
    partitarioChecks || assessWorkingViewPartitarioDraft(activeWorkingViewModel),
  )

  if (merged.status === 'blocked') {
    blockingIssues.push(...merged.blockingIssues)
  }

  const costRow = Array.isArray(pnDraftRows) ? pnDraftRows[0] : null
  const counterpartyRow = Array.isArray(pnDraftRows) ? pnDraftRows[2] : null
  const costAccountId = costRow ? (costRow.accountId || costRow.contoId) : activeWorkingViewModel?.costRevenueAccount?.id
  const counterpartyAccountId = counterpartyRow ? (counterpartyRow.accountId || counterpartyRow.contoId) : activeWorkingViewModel?.counterpartyAccount?.id

  if (!normalizeText(costAccountId)) {
    blockingIssues.push('Conto costo/ricavo mancante')
  }

  if (!normalizeText(counterpartyAccountId)) {
    blockingIssues.push('Conto controparte patrimoniale mancante')
  }

  if (!normalizeText(activeWorkingViewModel?.causale?.id)) {
    blockingIssues.push('Causale contabile mancante')
  }

  const numeroDocumento = normalizeText(activeWorkingViewModel?.parsedDocument?.numeroDocumento)
  if (!numeroDocumento) {
    blockingIssues.push('Numero documento mancante')
  }

  return {
    allowed: blockingIssues.length === 0,
    blockingIssues: [...new Set(blockingIssues)],
    checks: merged,
  }
}

/**
 * @param {object} params
 * @returns {{ builderInput: object, packaged: object, guard: object }}
 */
export function buildDemoWorkingViewCommitBundle({
  societaId = '',
  operatorId = 'sistema',
  sourceBatchId = '',
  activeWorkingViewModel = null,
  ivaDraftRows = [],
  pnDraftRows = [],
  pianoConti = [],
  automationMeta = null,
  nowIso = new Date().toISOString(),
  guardParams = {},
} = {}) {
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    ...guardParams,
    activeWorkingViewModel,
    ivaDraftRows,
    pnDraftRows,
    pianoConti,
    partitarioChecks: assessWorkingViewPartitarioDraft(activeWorkingViewModel),
  })

  const model = activeWorkingViewModel || {}
  const row = model.row || {}
  const parsedDocument = model.parsedDocument || {}
  const ivaCreditAccount = resolveDemoIvaCreditAccount(pianoConti)

  const pnRowsToUse = Array.isArray(pnDraftRows) && pnDraftRows.length > 0
    ? pnDraftRows
    : buildWorkingViewPrimaNotaDraftRowsFromModel(model, ivaCreditAccount)

  const costRow = pnRowsToUse[0]
  const counterpartyRow = pnRowsToUse[2]

  const resolvedCostAccount = costRow ? {
    id: normalizeText(costRow.accountId || costRow.contoId),
    codice: normalizeText(costRow.accountCode || costRow.contoCodice),
    descrizione: normalizeText(costRow.accountDescription || costRow.contoDescrizione),
  } : model.costRevenueAccount

  const resolvedCounterpartyAccount = counterpartyRow ? {
    id: normalizeText(counterpartyRow.accountId || counterpartyRow.contoId),
    codice: normalizeText(counterpartyRow.accountCode || counterpartyRow.contoCodice),
    descrizione: normalizeText(counterpartyRow.accountDescription || counterpartyRow.contoDescrizione),
  } : model.counterpartyAccount

  const mappedPnRows = pnRowsToUse.map((r, index) => {
    const norm = normalizeImportWorkingViewAccountingRow(r)
    console.log(`[TEST_LAB_COMMIT_ROWS_NORMALIZED] index=${index}, conto=${norm.accountCode || norm.accountId}, dareRaw=${r?.dare ?? r?.debit ?? r?.importoDare ?? r?.importo_dare ?? 0}, avereRaw=${r?.avere ?? r?.credit ?? r?.importoAvere ?? r?.importo_avere ?? 0}, dareNormalized=${norm.debit}, avereNormalized=${norm.credit}`)
    return norm
  })

  const builderInput = {
    societaId: normalizeText(societaId),
    operatorId: normalizeText(operatorId) || 'sistema',
    sourceRow: row,
    sourceRowKey: normalizeText(model.rowKey || row?.id),
    sourceBatchId: normalizeText(sourceBatchId || row?.batchId),
    parsedDocument,
    registrationDate: normalizeText(model.registrationDate || parsedDocument?.dataDocumento),
    counterpartyAccount: resolvedCounterpartyAccount || null,
    costRevenueAccount: resolvedCostAccount || null,
    causaleContabile: model.causale || null,
    primaNotaDraftRows: mappedPnRows,
    ivaDraftRows: mapWorkingViewIvaDraftToCommitRows(ivaDraftRows),
    partitarioDraft: {
      enabled: true,
      type: 'fornitore',
      accountId: normalizeText(resolvedCounterpartyAccount?.id),
      amount: round2(model.totale),
      dueDate: normalizeText(parsedDocument?.dataDocumento) || normalizeText(model.registrationDate) || null,
    },
    automationMeta: automationMeta || model.automationMeta || null,
    options: { nowIso },
  }

  const packaged = buildContabilitaPayloadFromImportRow(builderInput, { nowIso })
  const direct = buildImportContabilitaCommitPayload(builderInput)

  return {
    guard,
    builderInput,
    packaged,
    directValidation: direct.validation,
    commitEnvelope: {
      societaId: builderInput.societaId,
      registrationDate: builderInput.registrationDate,
      sourceRow: builderInput.sourceRow,
      sourceRowKey: builderInput.sourceRowKey,
      sourceBatchId: builderInput.sourceBatchId,
      operatorId: builderInput.operatorId,
      automationMeta: builderInput.automationMeta,
      payload: packaged.payload,
      classification: packaged.classification,
      readiness: packaged.readiness,
    },
  }
}

/**
 * @param {object} commitResult
 * @param {object} context
 * @returns {string}
 */
export function formatDemoWorkingViewCommitReport(commitResult, context = {}) {
  if (!commitResult?.success) {
    const reasons = Array.isArray(commitResult?.blockingReasons) ? commitResult.blockingReasons : []
    return `Commit demo fallito.\n${reasons.join('\n') || 'Errore sconosciuto'}`
  }

  const doc = normalizeText(context?.numeroDocumento) || 'documento demo'
  const warnings = Array.isArray(commitResult?.warnings) ? commitResult.warnings : []
  return [
    `Documento contabilizzato: ${doc}`,
    `ID prima nota: ${commitResult.primaNotaId || 'n/a'}`,
    `Righe PN: ${commitResult.numeroRighe ?? 'n/a'}`,
    `Movimenti IVA: ${commitResult.numeroRigheIva ?? 'n/a'}`,
    `Partite fornitore previste: ${commitResult.partitaFornitorePreviste ?? commitResult.partitaFornitoreCount ?? 'n/a'}`,
    `Partite fornitore salvate: ${commitResult.partitaFornitoreSalvate ?? commitResult.partitaFornitoreCount ?? 0}`,
    `Totale Dare: ${commitResult.totaleDare ?? 'n/a'} · Avere: ${commitResult.totaleAvere ?? 'n/a'}`,
    `Stato documento: ${commitResult.status || 'processed'}`,
    `Righe non selezionate: non contabilizzate (${context?.unselectedCount ?? 0} escluse)`,
    warnings.length ? `Warning: ${warnings.join('; ')}` : null,
  ].filter(Boolean).join('\n')
}

export function buildDemoWorkingViewCommitConfirmMessage(model, ivaDraftRows = []) {
  const numero = normalizeText(model?.parsedDocument?.numeroDocumento) || model?.numeroDocumento || '—'
  const fornitore = normalizeText(model?.fornitoreCliente) || '—'
  const imponibile = round2(model?.imponibile)
  const iva = round2(model?.iva)
  const totale = round2(model?.totale)
  const ivaLabel = (Array.isArray(ivaDraftRows) ? ivaDraftRows[0]?.causaleIvaLabel : '') || '—'
  return [
    'Confermi la contabilizzazione REALE del documento demo selezionato?',
    '',
    `Numero: ${numero}`,
    `Fornitore: ${fornitore}`,
    `Imponibile: ${imponibile.toFixed(2)} · IVA: ${iva.toFixed(2)} · Totale: ${totale.toFixed(2)}`,
    `Causale IVA: ${ivaLabel}`,
    '',
    'Solo questo documento verrà registrato. Le altre righe staging restano non contabilizzate.',
  ].join('\n')
}
