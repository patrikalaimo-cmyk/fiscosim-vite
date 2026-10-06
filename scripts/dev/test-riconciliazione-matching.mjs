import { getRiconciliazioneMatchingFixtures } from '../../src/modules/contabilita/components/riconciliazione/riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from '../../src/modules/contabilita/components/riconciliazione/runRiconciliazioneMatchForMovement.js'

function formatCell(value) {
  return String(value ?? '')
}

function assertCase(condition, message) {
  if (!condition) throw new Error(message)
}

function containsAny(values = [], needles = []) {
  const list = values.map((value) => String(value || '').toLowerCase())
  return needles.some((needle) => list.some((value) => value.includes(String(needle).toLowerCase())))
}

function summarizeCase(testCase, result) {
  return {
    caseId: testCase.caseId,
    movementId: testCase.movementId,
    expectedDecisionType: testCase.expectedDecisionType,
    actualDecisionType: result.decisionType,
    expectedMovementType: testCase.expectedMovementType,
    actualMovementType: result.movementType,
    expectedMatchType: testCase.expectedMatchType,
    actualMatchType: result.selectedCandidate?.matchType || 'no_match',
    expectedPartitaId: testCase.expectedPartitaId || null,
    actualPartitaId: result.selectedCandidate?.partitaId || null,
    status: 'PASS',
    reason: '',
  }
}

function printTable(rows) {
  const headers = ['caseId', 'movementId', 'expectedDecisionType', 'actualDecisionType', 'expectedMovementType', 'actualMovementType', 'expectedMatchType', 'actualMatchType', 'expectedPartitaId', 'actualPartitaId', 'status', 'reason']
  const widths = Object.fromEntries(headers.map((header) => [header, header.length]))
  for (const row of rows) {
    for (const header of headers) {
      widths[header] = Math.max(widths[header], formatCell(row[header]).length)
    }
  }
  const line = headers.map((header) => '-'.repeat(widths[header])).join('-+-')
  console.log(headers.map((header) => formatCell(header).padEnd(widths[header])).join(' | '))
  console.log(line)
  for (const row of rows) {
    console.log(headers.map((header) => formatCell(row[header]).padEnd(widths[header])).join(' | '))
  }
}

function validateResult(testCase, result) {
  const failures = []
  const expectedPartitaId = testCase.expectedPartitaId || null
  const actualPartitaId = result.selectedCandidate?.partitaId || null
  const actualMatchType = result.selectedCandidate?.matchType || 'no_match'

  if (result.decisionType !== testCase.expectedDecisionType) failures.push(`decisionType atteso ${testCase.expectedDecisionType} ma trovato ${result.decisionType}`)
  if (result.movementType !== testCase.expectedMovementType) failures.push(`movementType atteso ${testCase.expectedMovementType} ma trovato ${result.movementType}`)
  if (actualMatchType !== testCase.expectedMatchType) failures.push(`matchType atteso ${testCase.expectedMatchType} ma trovato ${actualMatchType}`)
  if (expectedPartitaId && actualPartitaId !== expectedPartitaId) failures.push(`partitaId atteso ${expectedPartitaId} ma trovato ${actualPartitaId || 'null'}`)

  if (['match_parziale', 'match_partita'].includes(testCase.expectedDecisionType) && !result.accountingProposal) {
    failures.push('accountingProposal mancante per caso classificabile')
  }

  if (testCase.caseId === 'G') {
    const righe = result.accountingProposal?.righe || []
    if (!(righe[0]?.sezione === 'Dare' && /spese/i.test(String(righe[0]?.conto || '')))) failures.push('spesa bancaria: Dare conto spese bancarie non coerente')
    if (!(righe[1]?.sezione === 'Avere' && /banca/i.test(String(righe[1]?.tipoConto || '')))) failures.push('spesa bancaria: Avere conto banca non coerente')
  }

  if (testCase.caseId === 'A') {
    const righe = result.accountingProposal?.righe || []
    if (!(righe[0]?.sezione === 'Dare' && /banca/i.test(String(righe[0]?.conto || '')))) failures.push('incasso cliente: Dare conto banca non coerente')
    if (!(righe[1]?.sezione === 'Avere' && /cliente/i.test(String(righe[1]?.tipoConto || '')))) failures.push('incasso cliente: Avere conto cliente non coerente')
  }

  if (testCase.caseId === 'B' || testCase.caseId === 'C') {
    const righe = result.accountingProposal?.righe || []
    if (!(righe[0]?.sezione === 'Dare' && /fornitori/i.test(String(righe[0]?.conto || '')))) failures.push('pagamento fornitore: Dare conto fornitore non coerente')
    if (!(righe[1]?.sezione === 'Avere' && /banca/i.test(String(righe[1]?.tipoConto || '')))) failures.push('pagamento fornitore: Avere conto banca non coerente')
  }

  if (testCase.caseId === 'I') {
    const righe = result.accountingProposal?.righe || []
    if (!(righe[0]?.tipoConto === 'conto_banca' && righe[1]?.tipoConto === 'conto_banca')) failures.push('giroconto: entrambe le righe devono essere tra conti banca/cassa')
  }

  if (testCase.expectedDecisionType === 'f24') {
    if (result.accountingProposal) failures.push('F24 non deve produrre una proposta prima nota definitiva')
    if (!containsAny(result.blockers, testCase.expectedBlockers) && !containsAny(result.warnings, testCase.expectedWarnings)) failures.push('F24: mancano blocker/warning tributi')
  }

  if (testCase.caseId === 'K') {
    if (!result.cashVatImpact?.applies) failures.push('cashVatImpact.applies deve essere true per IVA per cassa')
  }

  if (testCase.caseId === 'L') {
    if (!result.cashVatImpact?.applies) failures.push('cashVatImpact.applies deve essere true per IVA per cassa')
  }

  if (testCase.caseId === 'J') {
    if (!result.withholdingPaymentProposal?.applies) failures.push('withholdingPaymentProposal.applies deve essere true per parcella/ritenuta')
  }

  if (testCase.caseId === 'O') {
    if (result.decisionType !== 'ignora_movimento') failures.push('movimento da ignorare deve avere decisionType ignora_movimento')
    if (result.readiness !== 'ignored') failures.push('movimento da ignorare deve avere readiness ignored')
  }

  if (['F', 'N'].includes(testCase.caseId) && !result.warnings.length && !result.blockers.length) {
    failures.push('caso ambiguo/bloccante deve riportare warning o blocker')
  }

  return failures
}

async function main() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  const summaryRows = []
  const failures = []

  for (const testCase of fixtures.expectedCases) {
    const movement = fixtures.movements.find((item) => item.movementId === testCase.movementId)
    const result = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
    const row = summarizeCase(testCase, result)
    const caseFailures = validateResult(testCase, result)
    if (caseFailures.length) {
      row.status = 'FAIL'
      row.reason = caseFailures.join(' | ')
      failures.push({ caseId: testCase.caseId, movementId: testCase.movementId, reason: row.reason })
    }
    summaryRows.push(row)
  }

  printTable(summaryRows)

  const total = summaryRows.length
  const pass = summaryRows.filter((row) => row.status === 'PASS').length
  const fail = total - pass

  console.log('')
  console.log(`Totale casi: ${total}`)
  console.log(`PASS: ${pass}`)
  console.log(`FAIL: ${fail}`)

  if (failures.length) {
    console.log('')
    console.log('Elenco fail:')
    for (const failure of failures) {
      console.log(`- ${failure.caseId} (${failure.movementId}): ${failure.reason}`)
    }
    process.exitCode = 1
    return
  }

  console.log('All riconciliazione matching fixture checks passed.')
}

main().catch((error) => {
  console.error('Matching fixture test failed:', error)
  process.exitCode = 1
})