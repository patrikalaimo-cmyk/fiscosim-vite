import assert from 'node:assert/strict'
import { getRiconciliazioneMatchingFixtures } from './riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from './runRiconciliazioneMatchForMovement.js'
import { buildReconciliationDecisionFromProposal } from './buildReconciliationDecisionFromProposal.js'
import { applyReconciliationDecisionAction } from './applyReconciliationDecisionAction.js'
import { RECONCILIATION_DECISION_OPERATOR_ACTION } from './reconciliationDecisionTypes.js'
import { mapReconciliationDecisionToCanonicalPayload } from './mapReconciliationDecisionToCanonicalPayload.js'
import { validateCanonicalReconciliationPayload } from './validateCanonicalReconciliationPayload.js'
import { buildReconciliationCommitPreview } from './buildReconciliationCommitPreview.js'
import { commitReconciliationCanonicalPayload } from './commitReconciliationCanonicalPayload.js'
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
  const headers = ['caseId', 'step', 'mode', 'status', 'reason']
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

function buildWorkingDecision(testCase, movement, fixtures) {
  const proposal = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
  const baseDecision = buildReconciliationDecisionFromProposal(proposal, { movementId: movement?.movementId || movement?.id || null })

  if (['A', 'B', 'C', 'D', 'G', 'I', 'J', 'K', 'L'].includes(testCase.caseId)) {
    const accepted = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.ACCEPT_PROPOSAL, { operatorNotes: `accept ${testCase.caseId}` })
    if (accepted.ok) return accepted.decision
  }

  if (testCase.caseId === 'O') {
    const ignored = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.IGNORE_MOVEMENT, { operatorNotes: 'ignore movement' })
    if (ignored.ok) return ignored.decision
  }

  if (testCase.caseId === 'F') {
    const review = applyReconciliationDecisionAction(baseDecision, RECONCILIATION_DECISION_OPERATOR_ACTION.MARK_NEEDS_REVIEW, { operatorNotes: 'review ambiguous' })
    if (review.ok) return review.decision
  }

  return baseDecision
}

function assertCase(condition, message) {
  assert.equal(Boolean(condition), true, message)
}

function createReconciliationDryRunRepo() {
  const commitsByKey = new Map()

  return {
    canWriteAudit: () => false,
    canRunAtomicCommit: () => false,
    async findCommitByIdempotencyKey(idempotencyKey) {
      const key = String(idempotencyKey || '').trim()
      const record = commitsByKey.get(key)
      return { data: record ? JSON.parse(JSON.stringify(record)) : null, error: null }
    },
    remember(result) {
      const key = String(result?.idempotencyKey || result?.audit?.idempotencyKey || '').trim()
      if (!key) return

      const createdIds = result?.createdIds || {}
      commitsByKey.set(key, {
        id: result?.audit?.auditId || `audit-${commitsByKey.size + 1}`,
        idempotency_key: key,
        payload_hash: String(result?.payloadHash || result?.audit?.payloadHash || ''),
        mode: result?.mode || 'dry_run',
        status: result?.status || 'dry_run',
        created_ids: {
          primaNotaId: createdIds.primaNotaId || null,
          primaNotaRigheIds: Array.isArray(createdIds.primaNotaRigheIds) ? [...createdIds.primaNotaRigheIds] : [],
          registriIvaIds: Array.isArray(createdIds.registriIvaIds) ? [...createdIds.registriIvaIds] : [],
          partitarioIds: Array.isArray(createdIds.partitarioMovementIds) ? [...createdIds.partitarioMovementIds] : [],
          bankMovementId: createdIds.bankMovementActionId || null,
          sourceDocumentId: createdIds.sourceDocumentId || null,
        },
        warnings: Array.isArray(result?.warnings) ? [...result.warnings] : [],
        blockers: Array.isArray(result?.blockers) ? [...result.blockers] : [],
        result_snapshot: {
          status: result?.status || 'dry_run',
          mode: result?.mode || 'dry_run',
          payloadHash: String(result?.payloadHash || result?.audit?.payloadHash || ''),
          sourceModule: result?.sourceModule || null,
          sourceDocumentId: result?.sourceDocumentId || result?.audit?.sourceDocumentId || null,
          idempotencyKey: key,
          createdIds,
          warnings: Array.isArray(result?.warnings) ? [...result.warnings] : [],
          blockers: Array.isArray(result?.blockers) ? [...result.blockers] : [],
        },
      })
    },
  }
}

export async function runReconciliationCommitFixtureChecks() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const rows = []
  const failures = []

  const supportedCases = new Set(['A', 'B', 'G', 'O'])
  const blockedCases = new Set(['E', 'F', 'H', 'J', 'K', 'L', 'M', 'N', 'O2'])

  for (const testCase of fixtures.expectedCases) {
    const movement = fixtures.movements.find((item) => item.movementId === testCase.movementId)
    const workingDecision = buildWorkingDecision(testCase, movement, fixtures)
    const context = buildBaseContext(movement)
    const payload = mapReconciliationDecisionToCanonicalPayload(workingDecision, context)
    const canonicalValidation = validateCanonicalReconciliationPayload(payload)
    const preview = buildReconciliationCommitPreview(payload, { allowRealCommit: false })
    const commitInput = buildReconciliationCommitInput({ canonicalPayload: payload, context })

    let status = 'PASS'
    let reason = ''

    try {
      assertCase(payload.payloadId, 'payloadId mancante')
      assertCase(payload.audit?.validationResult?.valid === canonicalValidation.valid, 'validazione canonica non coerente')
      assertCase(preview.noDbWriteInDryRun === true, 'preview deve essere dry_run')
      assertCase(commitInput.idempotencyKey === `reconciliation:${context.societaId}:${context.esercizioId}:${payload.movementId}:${payload.decisionId}`, 'idempotencyKey errata')
      assertCase(preview.idempotencyKey === commitInput.idempotencyKey, 'preview idempotencyKey incoerente')

      if (supportedCases.has(testCase.caseId)) {
        const repo = createReconciliationDryRunRepo()
        const dryRunResult = await commitReconciliationCanonicalPayload(payload, context, repo)
        repo.remember(dryRunResult)
        const replayResult = await commitReconciliationCanonicalPayload(payload, context, repo)

        assertCase(dryRunResult.mode === 'dry_run', 'dry_run atteso')
        assertCase(dryRunResult.committed === false, 'dry_run non deve scrivere')
        assertCase(dryRunResult.noDbWriteInDryRun === true, 'dry_run deve restare senza scritture')
        assertCase(dryRunResult.audit.idempotencyKey === commitInput.idempotencyKey, 'audit idempotencyKey mancante')
        assertCase(replayResult.status === 'replayed', 'replay dry_run atteso')
        assertCase(replayResult.reusedExistingCommit === true, 'replay deve riusare il commit esistente')
        assertCase(replayResult.audit.idempotencyKey === commitInput.idempotencyKey, 'replay audit idempotencyKey mancante')

        if (testCase.caseId === 'A') {
          assertCase(preview.primaNotaRighe.length === 2, 'incasso cliente: righe PN attese nel preview')
          assertCase(preview.partitarioMovements.length === 1, 'incasso cliente: partitario atteso nel preview')
        } else if (testCase.caseId === 'B') {
          assertCase(preview.primaNotaRighe.length === 2, 'pagamento fornitore: righe PN attese nel preview')
          assertCase(preview.partitarioMovements.length === 1, 'pagamento fornitore: partitario atteso nel preview')
        } else if (testCase.caseId === 'G') {
          assertCase(preview.primaNotaRighe.length === 2, 'spesa bancaria: righe PN attese nel preview')
          assertCase(preview.partitarioMovements.length === 0, 'spesa bancaria: nessun partitario atteso nel preview')
        } else if (testCase.caseId === 'O') {
          assertCase(preview.primaNotaRighe.length === 0, 'ignored: nessuna riga nel preview')
          assertCase(preview.partitarioMovements.length === 0, 'ignored: nessun partitario nel preview')
        }

      } else if (blockedCases.has(testCase.caseId)) {
        const commitResult = await commitReconciliationCanonicalPayload(payload, context, createReconciliationDryRunRepo())
        assertCase(commitResult.mode === 'dry_run', 'case bloccato: dry_run atteso')
        assertCase(commitResult.committed === false, 'case bloccato: nessuna scrittura attesa')
        assertCase(commitResult.blockers.length > 0, 'case bloccato: blocker attesi')

        if (testCase.caseId === 'H' || testCase.caseId === 'J' || testCase.caseId === 'K' || testCase.caseId === 'L' || testCase.caseId === 'E') {
          assertCase(commitResult.blockers.includes('Caso non ancora supportato in R9A') || commitResult.blockers.includes('payload_not_valid'), 'blocker R9A atteso')
        }
        if (testCase.caseId === 'M' || testCase.caseId === 'N' || testCase.caseId === 'O2') {
          assertCase(commitResult.blockers.includes('payload_not_valid') || commitResult.blockers.includes('sourceDecisionStatus deve essere accepted o ignored'), 'payload non valido/bloccato atteso')
        }
      }
    } catch (error) {
      status = 'FAIL'
      reason = error?.message || String(error)
    }

    rows.push({
      caseId: testCase.caseId,
      step: supportedCases.has(testCase.caseId) ? 'dry_run+replay' : 'dry_run',
      mode: 'dry_run',
      status,
      reason,
    })
    if (status === 'FAIL') {
      failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: reason || 'commit validation mismatch' })
    }
  }

  return { fixtures, rows, failures }
}