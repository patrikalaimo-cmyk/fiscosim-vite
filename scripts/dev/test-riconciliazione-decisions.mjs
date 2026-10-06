import { runReconciliationDecisionFixtureChecks } from '../../src/modules/contabilita/components/riconciliazione/testReconciliationDecisionFixtures.js'

function printTable(rows) {
  const headers = ['caseId', 'movementId', 'step', 'status', 'reason']
  const widths = Object.fromEntries(headers.map((header) => [header, header.length]))
  for (const row of rows) {
    for (const header of headers) {
      widths[header] = Math.max(widths[header], String(row[header] ?? '').length)
    }
  }
  console.log(headers.map((header) => header.padEnd(widths[header])).join(' | '))
  console.log(headers.map((header) => '-'.repeat(widths[header])).join('-+-'))
  for (const row of rows) {
    console.log(headers.map((header) => String(row[header] ?? '').padEnd(widths[header])).join(' | '))
  }
}

const { rows, failures } = runReconciliationDecisionFixtureChecks()
printTable(rows)
console.log('')
console.log(`Totale casi: ${rows.length}`)
console.log(`PASS: ${rows.filter((row) => row.status === 'PASS').length}`)
console.log(`FAIL: ${rows.filter((row) => row.status === 'FAIL').length}`)

if (failures.length) {
  console.log('')
  console.log('Elenco fail:')
  for (const failure of failures) {
    console.log(`- ${failure.caseId} (${failure.movementId}): ${failure.reason}`)
  }
  process.exitCode = 1
} else {
  console.log('All reconciliation decision fixture checks passed.')
}
