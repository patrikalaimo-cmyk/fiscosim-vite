import { runCanonicalReconciliationPayloadFixtureChecks } from '../../src/modules/contabilita/components/riconciliazione/testCanonicalReconciliationPayloadFixtures.js'
import { runReconciliationCommitFixtureChecks } from '../../src/modules/contabilita/components/riconciliazione/testReconciliationCommitFixtures.js'

function printSection(title, result) {
  console.log(title)
  console.log(`PASS: ${result.rows.filter((row) => row.status === 'PASS').length}/${result.rows.length}`)
  for (const row of result.rows) {
    console.log(`${row.caseId} | ${row.step} | ${row.status} | ${row.reason}`)
  }
  if (result.failures.length) {
    console.log('Failures:')
    for (const failure of result.failures) {
      console.log(`- ${failure.caseId} (${failure.movementId}): ${failure.reason}`)
    }
  }
  console.log('')
}

const canonicalResult = runCanonicalReconciliationPayloadFixtureChecks()
const commitResult = await runReconciliationCommitFixtureChecks()

printSection('Canonical reconciliation payload contract', canonicalResult)
printSection('Reconciliation commit contract', commitResult)

const failures = [...canonicalResult.failures, ...commitResult.failures]

if (failures.length > 0) {
  process.exit(1)
}

console.log('Riconciliazione atomic commit contract checks passed.')
process.exit(0)