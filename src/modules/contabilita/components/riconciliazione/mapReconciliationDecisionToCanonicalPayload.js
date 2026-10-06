import { buildPayloadId, cloneCanonical, normalizeText, round2 } from './canonicalReconciliationPayloadUtils.js'
import { buildCanonicalPrimaNotaPayload } from './buildCanonicalPrimaNotaPayload.js'
import { buildCanonicalPartitarioPayload } from './buildCanonicalPartitarioPayload.js'
import { buildCanonicalCashVatPayload } from './buildCanonicalCashVatPayload.js'
import { buildCanonicalWithholdingPayload } from './buildCanonicalWithholdingPayload.js'
import { validateCanonicalReconciliationPayload } from './validateCanonicalReconciliationPayload.js'

function mapPrimaNotaRighe(decision = {}, context = {}) {
  const accountingRows = Array.isArray(decision?.accountingProposal?.righe) ? decision.accountingProposal.righe : []
  return accountingRows.map((row, index) => {
    const section = String(row?.sezione || '').toLowerCase() === 'dare' ? 'Dare' : 'Avere'
    const normalizedTipoConto = String(row?.tipoConto || '').toLowerCase()
    const sourceRole = row?.sourceRole || (
      normalizedTipoConto === 'conto_banca' ? 'conto_banca'
      : normalizedTipoConto === 'conto_patrimoniale_cliente' ? 'conto_patrimoniale_cliente'
      : normalizedTipoConto === 'conto_patrimoniale_fornitore' ? 'conto_patrimoniale_fornitore'
      : normalizedTipoConto === 'conto_patrimoniale_percipiente' ? 'conto_patrimoniale_percipiente'
      : normalizedTipoConto === 'conto_passivo' ? 'conto_tributo'
      : normalizedTipoConto === 'conto_costo' ? 'conto_imputazione'
      : normalizedTipoConto === 'conto_transitorio' ? 'conto_transitorio'
      : 'conto_imputazione'
    )
    const contoId = row?.contoId || row?.conto_id || (sourceRole === 'conto_banca' ? context.bankAccountId : null)
    const contoCodice = row?.contoCodice || row?.conto_codice || (sourceRole === 'conto_banca' ? context.bankAccountCode : null)
    const contoDescrizione = row?.contoDescrizione || row?.conto_desrizione || row?.conto || row?.descrizione || (sourceRole === 'conto_banca' ? context.bankAccountDescription : null)
    const importo = round2(row?.importo)
    return {
      rigaId: `pnr-${normalizeText(decision?.decisionId || decision?.movementId || 'movement')}-${index + 1}`,
      sezione: section,
      contoId: contoId || (sourceRole === 'conto_banca' ? context.bankAccountId || null : null),
      contoCodice: contoCodice || (sourceRole === 'conto_banca' ? context.bankAccountCode || null : null),
      contoDescrizione: contoDescrizione || (sourceRole === 'conto_banca' ? context.bankAccountDescription || null : null),
      tipoConto: row?.tipoConto || row?.tipo_conto || sourceRole,
      importo,
      descrizione: row?.descrizione || row?.contoDescrizione || row?.conto || context.bankAccountDescription || '',
      sourceRole,
    }
  })
}

function buildIgnoredPayload(decision = {}, context = {}) {
  return {
    payloadId: buildPayloadId(decision.movementId, decision.decisionId),
    source: 'riconciliazione_bancaria',
    movementId: normalizeText(decision.movementId) || null,
    decisionId: normalizeText(decision.decisionId) || null,
    decisionType: normalizeText(decision.decisionType) || null,
    sourceDecisionStatus: normalizeText(decision.status) || null,
    sourceReadiness: normalizeText(decision.readiness) || null,
    sourceWarnings: Array.isArray(decision.warnings) ? [...decision.warnings] : [],
    sourceBlockers: Array.isArray(decision.blockers) ? [...decision.blockers] : [],
    societaId: normalizeText(context.societaId) || null,
    esercizioId: normalizeText(context.esercizioId) || null,
    bankStatementId: normalizeText(context.bankStatementId) || null,
    bankAccountId: normalizeText(context.bankAccountId) || null,
    bankAccountCode: normalizeText(context.bankAccountCode) || null,
    bankAccountDescription: normalizeText(context.bankAccountDescription) || null,
    registrationDate: normalizeText(context.registrationDate) || null,
    operationDate: normalizeText(context.operationDate) || null,
    primaNota: null,
    primaNotaRighe: [],
    partitarioMovements: [],
    cashVatMovements: [],
    withholdingMovements: [],
    audit: {
      createdAt: new Date().toISOString(),
      mapperVersion: 'r8-1',
      sourceDecisionStatus: normalizeText(decision.status) || null,
      sourceReadiness: normalizeText(decision.readiness) || null,
      sourceWarnings: Array.isArray(decision.warnings) ? [...decision.warnings] : [],
      sourceBlockers: Array.isArray(decision.blockers) ? [...decision.blockers] : [],
      validationResult: {
        valid: true,
        ignored: true,
        reason: 'no accounting payload required',
      },
      canonicalLanguageCheck: {
        contoBancaSeparatoDaContoImputazione: true,
        movimentoBancarioSeparatoDaPrimaNota: true,
        nessunCommitEseguito: true,
        payloadDraft: true,
      },
    },
    warnings: [],
    blockers: [],
    valid: true,
  }
}

export function mapReconciliationDecisionToCanonicalPayload(reconciliationDecision = {}, context = {}) {
  const decision = cloneCanonical(reconciliationDecision) || {}
  const safeContext = cloneCanonical(context) || {}
  const decisionStatus = normalizeText(decision.status).toLowerCase()
  const payloadId = buildPayloadId(decision.movementId, decision.decisionId)

  if (decisionStatus === 'ignored') {
    return buildIgnoredPayload(decision, safeContext)
  }

  const primaNotaRighe = mapPrimaNotaRighe(decision, safeContext)
  const movementAmount = round2(primaNotaRighe.reduce((sum, row) => sum + round2(row?.importo), 0))
  const primaNota = buildCanonicalPrimaNotaPayload({
    decision,
    context: safeContext,
    accountingRows: primaNotaRighe,
  })
  const partitarioMovements = buildCanonicalPartitarioPayload({ decision, context: { ...safeContext, movementAmount } })
  const cashVatMovements = buildCanonicalCashVatPayload({ decision, context: safeContext })
  const withholdingMovements = buildCanonicalWithholdingPayload({ decision, context: safeContext })

  const payload = {
    payloadId,
    source: 'riconciliazione_bancaria',
    movementId: normalizeText(decision.movementId) || null,
    decisionId: normalizeText(decision.decisionId) || null,
    decisionType: normalizeText(decision.decisionType) || null,
    sourceDecisionStatus: normalizeText(decision.status) || null,
    sourceReadiness: normalizeText(decision.readiness) || null,
    sourceWarnings: Array.isArray(decision.warnings) ? [...decision.warnings] : [],
    sourceBlockers: Array.isArray(decision.blockers) ? [...decision.blockers] : [],
    societaId: normalizeText(safeContext.societaId) || null,
    esercizioId: normalizeText(safeContext.esercizioId) || null,
    bankStatementId: normalizeText(safeContext.bankStatementId) || null,
    bankAccountId: normalizeText(safeContext.bankAccountId) || null,
    bankAccountCode: normalizeText(safeContext.bankAccountCode) || null,
    bankAccountDescription: normalizeText(safeContext.bankAccountDescription) || null,
    registrationDate: normalizeText(safeContext.registrationDate) || null,
    operationDate: normalizeText(safeContext.operationDate) || null,
    primaNota,
    primaNotaRighe,
    partitarioMovements,
    cashVatMovements,
    withholdingMovements,
    audit: {
      createdAt: new Date().toISOString(),
      mapperVersion: 'r8-1',
      sourceDecisionStatus: decisionStatus || null,
      sourceReadiness: normalizeText(decision.readiness) || null,
      sourceWarnings: Array.isArray(decision.warnings) ? [...decision.warnings] : [],
      sourceBlockers: Array.isArray(decision.blockers) ? [...decision.blockers] : [],
      validationResult: null,
      canonicalLanguageCheck: {
        contoBancaSeparatoDaContoImputazione: true,
        movimentoBancarioSeparatoDaPrimaNota: true,
        nessunCommitEseguito: true,
        payloadDraft: true,
      },
    },
    warnings: Array.from(new Set([
      ...(Array.isArray(decision.warnings) ? decision.warnings : []),
      ...cashVatMovements.map((item) => item.warning).filter(Boolean),
      ...withholdingMovements.map((item) => item.warning).filter(Boolean),
    ])),
    blockers: Array.from(new Set(Array.isArray(decision.blockers) ? decision.blockers : [])),
  }

  const validationResult = validateCanonicalReconciliationPayload({
    ...payload,
    decisionType: decision.decisionType,
    sourceDecisionStatus: decisionStatus,
  })
  payload.audit.validationResult = validationResult
  payload.valid = validationResult.valid
  payload.warnings = validationResult.warnings
  payload.blockers = validationResult.blockers
  return payload
}