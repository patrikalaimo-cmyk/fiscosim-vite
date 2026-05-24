/**
 * runGuidedImportDryRun
 *
 * Esegue una prova di parsing guidata locale usando i dati reali dello staging.
 * NON modifica movimenti reali.
 * NON crea movimenti artificiali.
 * Ricalcola solo il risultato audit usando i movimenti già estratti.
 */

import { deriveTemplateDecisionFromImportAudit } from './deriveTemplateDecisionFromImportAudit.js'

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function asText(value) {
  return String(value || '').trim()
}

function safeAdd(a, b) {
  const na = asNumber(a) ?? 0
  const nb = asNumber(b) ?? 0
  return na + nb
}

function extractMovementTotals(movements) {
  let totalIn = 0
  let totalOut = 0

  if (!Array.isArray(movements) || movements.length === 0) {
    return { totalIn: null, totalOut: null }
  }

  movements.forEach((movement) => {
    const amount = asNumber(movement.amount) ?? asNumber(movement.importo) ?? 0
    const direction = asText(movement.direction || movement.segno || movement.type || '').toLowerCase()
    if (direction === 'in' || direction === 'entrata' || direction === 'avere' || direction === 'credit' || direction === 'c') {
      totalIn = safeAdd(totalIn, amount > 0 ? amount : -amount)
    } else if (direction === 'out' || direction === 'uscita' || direction === 'dare' || direction === 'debit' || direction === 'd') {
      totalOut = safeAdd(totalOut, amount > 0 ? amount : -amount)
    } else if (amount > 0) {
      totalIn = safeAdd(totalIn, amount)
    } else if (amount < 0) {
      totalOut = safeAdd(totalOut, -amount)
    }
  })

  return { totalIn, totalOut }
}

function pickBestValue(flowFieldValue, statementValue) {
  // Preferisce il valore modificato dall'operatore nel flusso
  const fromFlow = asNumber(flowFieldValue)
  if (fromFlow != null) return fromFlow
  return asNumber(statementValue)
}

export function runGuidedImportDryRun({ statement, guidedState }) {
  if (!statement) {
    return {
      movementsExtracted: 0,
      totalIn: null,
      totalOut: null,
      openingBalance: null,
      closingBalanceOfficial: null,
      calculatedClosingBalance: null,
      difference: null,
      parseReliabilityLevel: 'blocked',
      parseStatus: 'failed',
      finalDecision: 'unusable_import',
      importDecision: 'unusable_import',
      templateDecision: 'template_not_savable',
      warnings: [{ code: 'no_statement', reason: 'Nessun import presente' }],
      blockers: [{ code: 'no_statement', reason: 'Statement assente' }],
    }
  }

  const movements = statement.movements || []
  const movementsExtracted = movements.length

  const statementAudit = statement.audit || {}

  // Valori dall'operatore (modifiche manuali nel flusso) o dallo staging
  const flowFields = guidedState?.fieldsByKey || {}

  const openingBalance = pickBestValue(
    flowFields.opening_balance?.finalValue,
    statement.pdfSummary?.openingBalance ?? statement.openingBalance ?? statementAudit.openingBalance
  )

  const closingBalanceOfficial = pickBestValue(
    flowFields.closing_balance?.finalValue,
    statement.pdfSummary?.closingBalance ?? statement.closingBalanceOfficial ?? statement.closingBalance ?? statementAudit.closingBalanceOfficial
  )

  // Ricalcola totali dai movimenti reali (fonte di verità)
  const { totalIn: computedTotalIn, totalOut: computedTotalOut } = extractMovementTotals(movements)

  // Se l'operatore ha inserito valori manuali, usa quelli come attesi; altrimenti usa quelli estratti
  const operatorTotalIn = asNumber(flowFields.total_in?.finalValue)
  const operatorTotalOut = asNumber(flowFields.total_out?.finalValue)

  const effectiveTotalIn = operatorTotalIn ?? asNumber(statementAudit.totalIn ?? statementAudit.totalEntrate ?? statement.totalIn) ?? computedTotalIn ?? 0
  const effectiveTotalOut = operatorTotalOut ?? asNumber(statementAudit.totalOut ?? statementAudit.totalUscite ?? statement.totalOut) ?? computedTotalOut ?? 0

  const calculatedClosingBalance =
    openingBalance != null
      ? Math.round((openingBalance + effectiveTotalIn - effectiveTotalOut) * 100) / 100
      : asNumber(statementAudit.calculatedClosingBalance ?? statement.calculatedClosingBalance) ?? null

  const difference =
    closingBalanceOfficial != null && calculatedClosingBalance != null
      ? Math.round((closingBalanceOfficial - calculatedClosingBalance) * 100) / 100
      : asNumber(statementAudit?.differences?.balance ?? statement.balanceDifference ?? statementAudit?.difference) ?? null

  const blockers = []
  const warnings = []

  if (movementsExtracted <= 0) {
    blockers.push({ code: 'no_movements', reason: 'Nessun movimento estratto dallo staging' })
  }

  if (difference != null && Math.abs(difference) > 0.01) {
    warnings.push({ code: 'balance_difference', reason: `Differenza saldo: ${difference}` })
  }

  const parseStatus = asText(statement.parseStatus || 'parsed')
  const originalReliabilityLevel = asText(statement.parseReliabilityLevel || '')

  // Ridetermina parseReliabilityLevel post dry-run
  let parseReliabilityLevel = originalReliabilityLevel
  if (movementsExtracted <= 0 || ['failed', 'blocked', 'needs_ocr'].includes(parseStatus)) {
    parseReliabilityLevel = 'blocked'
  } else if (closingBalanceOfficial != null && difference != null && Math.abs(difference) <= 0.01) {
    parseReliabilityLevel = 'certified_balanced'
  } else if (closingBalanceOfficial == null || difference == null) {
    parseReliabilityLevel = 'high_confidence'
  } else {
    parseReliabilityLevel = 'needs_review'
  }

  const templateDecision = deriveTemplateDecisionFromImportAudit({
    movementsExtracted,
    difference,
    closingBalanceOfficial,
    parseStatus,
    blockers,
  })

  // Decisione import
  let finalDecision
  if (movementsExtracted <= 0 || blockers.length > 0) {
    finalDecision = 'unusable_import'
  } else if (templateDecision === 'template_savable') {
    finalDecision = 'certified_import'
  } else if (warnings.length > 0 || parseReliabilityLevel === 'needs_review') {
    finalDecision = 'low_confidence_review'
  } else {
    finalDecision = 'high_confidence_review'
  }

  return {
    movementsExtracted,
    totalIn: effectiveTotalIn,
    totalOut: effectiveTotalOut,
    openingBalance,
    closingBalanceOfficial,
    calculatedClosingBalance,
    difference,
    parseReliabilityLevel,
    parseStatus,
    finalDecision,
    importDecision: finalDecision,
    templateDecision,
    warnings,
    blockers,
  }
}

export default runGuidedImportDryRun
