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
      description: 'Imponibile su conto costi/ricavi',
      debit: imponibile,
      credit: 0,
    },
    {
      lineNo: 2,
      accountId: normalizeText(ivaCreditAccount?.id),
      description: normalizeText(ivaCreditAccount?.descrizione) || 'IVA ns credito',
      debit: iva,
      credit: 0,
    },
    {
      lineNo: 3,
      accountId: normalizeText(counterpartyAccount?.id),
      description: normalizeText(counterpartyAccount?.descrizione) || 'Fornitore',
      debit: 0,
      credit: totale,
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

  if (!normalizeText(activeWorkingViewModel?.costRevenueAccount?.id)) {
    blockingIssues.push('Conto costo/ricavo mancante')
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
  pianoConti = [],
  automationMeta = null,
  nowIso = new Date().toISOString(),
  guardParams = {},
} = {}) {
  const guard = evaluateDemo24EWorkingViewCommitGuards({
    ...guardParams,
    activeWorkingViewModel,
    ivaDraftRows,
    pianoConti,
    partitarioChecks: assessWorkingViewPartitarioDraft(activeWorkingViewModel),
  })

  const model = activeWorkingViewModel || {}
  const row = model.row || {}
  const parsedDocument = model.parsedDocument || {}
  const ivaCreditAccount = resolveDemoIvaCreditAccount(pianoConti)

  const builderInput = {
    societaId: normalizeText(societaId),
    operatorId: normalizeText(operatorId) || 'sistema',
    sourceRow: row,
    sourceRowKey: normalizeText(model.rowKey || row?.id),
    sourceBatchId: normalizeText(sourceBatchId || row?.batchId),
    parsedDocument,
    registrationDate: normalizeText(model.registrationDate || parsedDocument?.dataDocumento),
    counterpartyAccount: model.counterpartyAccount || null,
    costRevenueAccount: model.costRevenueAccount || null,
    causaleContabile: model.causale || null,
    primaNotaDraftRows: buildWorkingViewPrimaNotaDraftRowsFromModel(model, ivaCreditAccount),
    ivaDraftRows: mapWorkingViewIvaDraftToCommitRows(ivaDraftRows),
    partitarioDraft: {
      enabled: true,
      type: 'fornitore',
      accountId: normalizeText(model.counterpartyAccount?.id),
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
    `Partite fornitore: ${commitResult.partitaFornitoreCount ?? 'n/a'}`,
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
