import { runReconciliationCommitFixtureChecks } from '../../src/modules/contabilita/components/riconciliazione/testReconciliationCommitFixtures.js'

const result = await runReconciliationCommitFixtureChecks()

console.log(`Fixture commit base: ${result.rows.filter((row) => row.status === 'PASS').length}/${result.rows.length} PASS`)
for (const row of result.rows) {
  console.log(`${row.caseId} | ${row.step} | ${row.mode} | ${row.status} | ${row.reason}`)
}

if (result.failures.length > 0) {
  console.error('Failures:')
  for (const failure of result.failures) {
    console.error(`- ${failure.caseId} (${failure.movementId}): ${failure.reason}`)
  }
  process.exit(1)
}

process.exit(0)