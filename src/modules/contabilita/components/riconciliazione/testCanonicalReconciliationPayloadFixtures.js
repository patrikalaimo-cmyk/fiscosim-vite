import { getRiconciliazioneMatchingFixtures } from './riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from './runRiconciliazioneMatchForMovement.js'
import { buildReconciliationDecisionFromProposal } from './buildReconciliationDecisionFromProposal.js'
import { applyReconciliationDecisionAction } from './applyReconciliationDecisionAction.js'
import { RECONCILIATION_DECISION_OPERATOR_ACTION } from './reconciliationDecisionTypes.js'
import { mapReconciliationDecisionToCanonicalPayload } from './mapReconciliationDecisionToCanonicalPayload.js'
import { validateCanonicalReconciliationPayload } from './validateCanonicalReconciliationPayload.js'
import { buildReconciliationCommitInput } from '../../canonical/buildReconciliationCommitInput.js'

function buildBaseContext(movement = {}) {
  return {
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    bankStatementId: movement.sourceStatementId || 'stmt-001',
    bankAccountId: movement.bankAccountId || 'bank-acc-001',
    bankAccountCode: movement.bankAccountCode || '1.01.01.001',
    bankAccountDescription: movement.bankAccountCode === '1.01.01.002' ? 'Banca spese e commissioni' : 'Banca c/c ordinario',
    operationDate: movement.operationDate || null,
    registrationDate: movement.operationDate || null,
  }
}

function formatCell(value) {
  return String(value ?? '')
}

function printTable(rows) {
  const headers = ['caseId', 'movementId', 'step', 'status', 'reason']
  const widths = Object.fromEntries(headers.map((header) => [header, header.length]))
  for (const row of rows) {
    for (const header of headers) {
      widths[header] = Math.max(widths[header], formatCell(row[header]).length)
    }
  }
  console.log(headers.map((header) => header.padEnd(widths[header])).join(' | '))
  console.log(headers.map((header) => '-'.repeat(widths[header])).join('-+-'))
  for (const row of rows) {
    console.log(headers.map((header) => formatCell(row[header]).padEnd(widths[header])).join(' | '))
  }
}

export function runCanonicalReconciliationPayloadFixtureChecks() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const rows = []
  const failures = []

  const assertCase = (condition, message) => {
    if (!condition) throw new Error(message)
  }

  for (const testCase of fixtures.expectedCases) {
    const movement = fixtures.movements.find((item) => item.movementId === testCase.movementId)
    const proposal = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
    const baseDecision = buildReconciliationDecisionFromProposal(proposal, { movementId: movement?.movementId || movement?.id || null })
    const context = buildBaseContext(movement)

    let workingDecision = baseDecision
    if (['A', 'B', 'C', 'D', 'G', 'I', 'J', 'K', 'L'].includes(testCase.caseId)) {
      const accepted = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL, { operatorNotes: `accept ${testCase.caseId}` })
      if (accepted.ok) workingDecision = accepted.decision
    } else if (testCase.caseId === 'O') {
      const ignored = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT, { operatorNotes: 'ignore movement' })
      if (ignored.ok) workingDecision = ignored.decision
    } else if (testCase.caseId === 'F') {
      const review = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.MARK_NEEDS_REVIEW, { operatorNotes: 'review ambiguous' })
      if (review.ok) workingDecision = review.decision
    }

    const payload = mapReconciliationDecisionToCanonicalPayload(workingDecision, context)
    const validation = validateCanonicalReconciliationPayload(payload)
    const commitInput = buildReconciliationCommitInput({ canonicalPayload: payload, context })

    let status = 'PASS'
    let reason = ''

    try {
      assertCase(payload.payloadId, 'payloadId mancante')
      assertCase(payload.source === 'riconciliazione_bancaria', 'source canonico errato')
      assertCase(payload.societaId === context.societaId, 'societaId mancante o errato')
      assertCase(payload.esercizioId === context.esercizioId, 'esercizioId mancante o errato')
      assertCase(payload.bankAccountId === context.bankAccountId, 'bankAccountId mancante o errato')
      assertCase(commitInput.sourceModule === 'riconciliazione_bancaria', 'sourceModule commit input errato')
      assertCase(commitInput.idempotencyKey === `reconciliation:${context.societaId}:${context.esercizioId}:${payload.movementId}:${payload.decisionId}`, 'idempotencyKey commit input errata')

      if (testCase.caseId === 'A') {
        assertCase(validation.valid === true, 'incasso cliente non valido')
        assertCase(payload.primaNotaRighe.length === 2, 'incasso cliente: righe PN attese')
        assertCase(payload.partitarioMovements.length === 1, 'incasso cliente: partitario atteso')
        assertCase(payload.partitarioMovements[0].action === 'chiusura_totale', 'incasso cliente: chiusura_totale attesa')
      } else if (testCase.caseId === 'B') {
        assertCase(validation.valid === true, 'pagamento fornitore non valido')
        assertCase(payload.primaNotaRighe.length === 2, 'pagamento fornitore: righe PN attese')
        assertCase(payload.partitarioMovements.length === 1, 'pagamento fornitore: partitario atteso')
        assertCase(payload.partitarioMovements[0].action === 'chiusura_totale', 'pagamento fornitore: chiusura_totale attesa')
      } else if (testCase.caseId === 'C') {
        assertCase(validation.valid === true, 'pagamento parziale non valido')
        assertCase(payload.primaNotaRighe.length === 2, 'pagamento parziale: righe PN attese')
        assertCase(payload.partitarioMovements.length === 1, 'pagamento parziale: partitario atteso')
        assertCase(payload.partitarioMovements[0].action === 'chiusura_parziale', 'pagamento parziale: chiusura_parziale attesa')
      } else if (testCase.caseId === 'D') {
        assertCase(validation.valid === true, 'incasso parziale non valido')
        assertCase(payload.primaNotaRighe.length === 2, 'incasso parziale: righe PN attese')
        assertCase(payload.partitarioMovements.length === 1, 'incasso parziale: partitario atteso')
        assertCase(payload.partitarioMovements[0].action === 'chiusura_parziale', 'incasso parziale: chiusura_parziale attesa')
      } else if (testCase.caseId === 'E') {
        assertCase(validation.valid === false, 'cumulativo deve restare non mappabile in R8')
        assertCase(validation.blockers.includes('decision_status_not_accepted_or_ignored') || validation.blockers.includes('selectedMatch_partitaId_missing'), 'cumulativo: blocker atteso')
      } else if (testCase.caseId === 'G') {
        assertCase(validation.valid === true, 'spesa bancaria non valida')
        assertCase(payload.primaNotaRighe.length === 2, 'spesa bancaria: righe PN attese')
        assertCase(payload.partitarioMovements.length === 0, 'spesa bancaria: nessun partitario atteso')
      } else if (testCase.caseId === 'H') {
        assertCase(validation.valid === false, 'F24 deve essere bloccato')
        assertCase(validation.blockers.length > 0, 'F24: blocker attesi')
      } else if (testCase.caseId === 'I') {
        assertCase(validation.valid === true, 'giroconto non valido')
        assertCase(payload.primaNotaRighe.length === 2, 'giroconto: righe PN attese')
        assertCase(payload.partitarioMovements.length === 0, 'giroconto: nessun partitario atteso')
      } else if (testCase.caseId === 'J') {
        assertCase(validation.valid === true, 'parcella non valida')
        assertCase(payload.withholdingMovements.length > 0, 'parcella: withholding atteso')
      } else if (testCase.caseId === 'K' || testCase.caseId === 'L') {
        assertCase(validation.valid === true, 'IVA per cassa non valida')
        assertCase(payload.cashVatMovements.length > 0, 'IVA per cassa: cashVat atteso')
      } else if (testCase.caseId === 'M') {
        assertCase(validation.valid === false, 'nessun match deve essere non valido')
      } else if (testCase.caseId === 'N') {
        assertCase(validation.valid === false, 'duplicato potenziale deve essere non valido')
      } else if (testCase.caseId === 'O') {
        assertCase(validation.valid === true, 'ignored deve essere valido')
        assertCase(validation.reason === 'no accounting payload required', 'ignored: reason atteso')
        assertCase(payload.primaNota === null, 'ignored: primaNota deve essere null')
        assertCase(payload.primaNotaRighe.length === 0, 'ignored: primaNotaRighe vuote')
      } else if (testCase.caseId === 'O2') {
        assertCase(validation.valid === false, 'no match deve essere non valido')
      }
    } catch (error) {
      status = 'FAIL'
      reason = error?.message || String(error)
    }

    rows.push({
      caseId: testCase.caseId,
      movementId: testCase.movementId,
      step: 'map',
      status,
      reason,
    })
    if (status === 'FAIL') {
      failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: reason || 'validation mismatch' })
    }
  }

  return { fixtures, rows, failures }
}