import assert from 'node:assert/strict'
import { buildImportContabilitaCommitInput } from '../../src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js'
import { buildContabilitaPayloadFromImportRow } from '../../src/modules/import_contabilita/domain/buildImportContabilitaCommitPayload.js'
import { buildCanonicalPayloadHash } from '../../src/modules/contabilita/canonical/canonicalPayloadHash.js'
import { commitCanonicalAccountingPayload } from '../../services/canonicalAccountingCommitService.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function printTable(rows) {
  const headers = ['case', 'status', 'detail']
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

function makeImportBuilderInput(direction, overrides = {}) {
  const isVendita = direction === 'vendita'
  const primaNotaRows = isVendita
    ? [
      { lineNo: 1, accountId: 'acc-cliente', description: 'Cliente', debit: 122, credit: 0 },
      { lineNo: 2, accountId: 'acc-ricavo', description: 'Ricavo', debit: 0, credit: 100 },
      { lineNo: 3, accountId: 'acc-iva', description: 'IVA', debit: 0, credit: 22 },
    ]
    : [
      { lineNo: 1, accountId: 'acc-costo', description: 'Costo', debit: 100, credit: 0 },
      { lineNo: 2, accountId: 'acc-iva', description: 'IVA', debit: 22, credit: 0 },
      { lineNo: 3, accountId: 'acc-fornitore', description: 'Fornitore', debit: 0, credit: 122 },
    ]

  return {
    societaId: 'soc-001',
    operatorId: 'user-001',
    sourceRow: {
      id: overrides.sourceRowId || `src-${direction}`,
      filename: overrides.filename || `import-${direction}.xml`,
      direction,
      tipo_documento: 'fattura_passiva',
    },
    sourceRowKey: overrides.sourceRowKey || `row-${direction}`,
    sourceBatchId: overrides.sourceBatchId || 'batch-import-001',
    parsedDocument: {
      tipoDocumento: 'TD01',
      numeroDocumento: overrides.numeroDocumento || `IMP-${direction.toUpperCase()}`,
      dataDocumento: '2026-04-30',
      imponibile: 100,
      iva: 22,
      totale: 122,
      rawXml: '<xml />',
      fornitore: {
        denominazione: isVendita ? 'Cliente Demo' : 'Fornitore Demo',
        partitaIva: isVendita ? 'IT09876543210' : 'IT12345678901',
        codiceFiscale: isVendita ? 'CLNPLA80A01H501X' : 'RSSMRA80A01H501U',
      },
      cliente: {
        denominazione: isVendita ? 'Cliente Demo' : 'Fornitore Demo',
        partitaIva: isVendita ? 'IT09876543210' : 'IT12345678901',
        codiceFiscale: isVendita ? 'CLNPLA80A01H501X' : 'RSSMRA80A01H501U',
      },
      flags: { reverseCharge: false, hasRitenuta: false, isForeign: false },
    },
    registrationDate: '2026-04-30',
    counterpartyAccount: {
      id: isVendita ? 'acc-cliente' : 'acc-fornitore',
      codice: isVendita ? '1.02.20' : '2.03.08',
    },
    costRevenueAccount: {
      id: isVendita ? 'acc-ricavo' : 'acc-costo',
      codice: isVendita ? '7.01.001' : '6.01.001',
    },
    causaleContabile: {
      id: 'caus-1',
      codice: isVendita ? 'FV' : 'FF',
      descrizione: isVendita ? 'Fattura cliente' : 'Fattura fornitore',
    },
    primaNotaDraftRows: primaNotaRows,
    ivaDraftRows: [
      {
        idx: 0,
        rate: 22,
        taxable: 100,
        tax: 22,
        detraibilePercent: 100,
        indetraibilePercent: 0,
        detraibileTax: 22,
        indetraibileTax: 0,
        esigibilita: 'Immediata',
        causaleIvaId: 'iva-22',
      },
    ],
    partitarioDraft: {
      enabled: true,
      type: isVendita ? 'cliente' : 'fornitore',
      accountId: isVendita ? 'acc-cliente' : 'acc-fornitore',
      amount: 122,
      dueDate: '2026-05-30',
    },
    percipienteDecision: null,
    readiness: { status: 'ready' },
    automationMeta: {},
    options: { vatPeriodicity: 'mensile', nowIso: '2026-04-30T10:00:00.000Z' },
  }
}

function makeCommitInputFromBuilderInput(builderInput, extraContext = {}, extraOptions = {}) {
  const { payload, validation } = buildContabilitaPayloadFromImportRow(builderInput)
  const commitInput = buildImportContabilitaCommitInput({
    canonicalPayload: payload,
    context: {
      societaId: builderInput.societaId,
      esercizioId: '2026',
      utenteId: builderInput.operatorId,
      sourceDocumentId: builderInput.sourceRow?.id || builderInput.sourceRowKey || builderInput.sourceRow?.filename || '',
      sourceRowKey: builderInput.sourceRowKey,
      payloadId: builderInput.sourceRow?.id || builderInput.sourceRowKey || '',
      ...extraContext,
    },
    options: {
      dryRun: true,
      allowRealCommit: false,
      expectedPayloadVersion: payload?.schemaVersion || payload?.payloadVersion || '',
      requestId: 'import-atomic-test',
      ...extraOptions,
    },
  })
  return { payload, validation, commitInput }
}

function createPreviewStore() {
  return {
    auditRecords: [],
    auditsByKey: new Map(),
  }
}

function createPreviewRepo(store) {
  return {
    canWriteAudit: () => false,
    async findCommitByIdempotencyKey(idempotencyKey) {
      const key = String(idempotencyKey || '').trim()
      return { data: key ? clone(store.auditsByKey.get(key) || null) : null, error: null }
    },
  }
}

function rememberPreview(store, commitInput, result) {
  if (!result || !commitInput?.idempotencyKey) return
  if (!['dry_run', 'replayed'].includes(result.status)) return

  const audit = {
    id: result.auditId || `preview-${store.auditRecords.length + 1}`,
    idempotency_key: commitInput.idempotencyKey,
    payload_hash: result.payloadHash || buildCanonicalPayloadHash(commitInput.canonicalPayload),
    mode: result.mode || 'dry_run',
    status: result.status,
    created_ids: clone(result.createdIds || {}),
    warnings: clone(result.warnings || []),
    blockers: clone(result.blockers || []),
    result_snapshot: clone(result.resultSnapshot || result.auditPreview || {}),
  }

  const existingIndex = store.auditRecords.findIndex((entry) => entry.idempotency_key === commitInput.idempotencyKey)
  if (existingIndex >= 0) {
    store.auditRecords[existingIndex] = audit
  } else {
    store.auditRecords.push(audit)
  }
  store.auditsByKey.set(commitInput.idempotencyKey, audit)
}

async function runGatedCommit(commitInput, store, options = {}) {
  const result = await commitCanonicalAccountingPayload(commitInput, {
    repo: createPreviewRepo(store),
    dryRun: options.dryRun !== false,
    allowRealCommit: false,
    auditWriteEnabled: false,
    expectedPayloadVersion: options.expectedPayloadVersion || commitInput?.canonicalPayload?.schemaVersion || '1.0.0',
  })
  rememberPreview(store, commitInput, result)
  return result
}

function counts(store) {
  return {
    audit: store.auditRecords.length,
  }
}

function assertReplayShape(firstResult, secondResult) {
  assert.equal(secondResult.status, 'replayed')
  assert.equal(secondResult.reusedExistingCommit, true)
  assert.deepEqual(secondResult.createdIds, firstResult.createdIds)
}

async function runCase(name, fn) {
  try {
    await fn()
    return { case: name, status: 'PASS', detail: '' }
  } catch (error) {
    return { case: name, status: 'FAIL', detail: error?.message || String(error) }
  }
}

const rows = []

rows.push(await runCase('1 helper costruisce input import', async () => {
  const builderInput = makeImportBuilderInput('vendita')
  const { commitInput } = makeCommitInputFromBuilderInput(builderInput)
  assert.equal(commitInput.sourceModule, 'import_contabilita')
  assert.ok(commitInput.idempotencyKey.startsWith('import:soc-001:2026:'))
  assert.equal(commitInput.societaId, 'soc-001')
  assert.equal(commitInput.esercizioId, '2026')
  assert.equal(commitInput.utenteId, 'user-001')
}))

rows.push(await runCase('2 helper idempotency stabile', async () => {
  const first = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  const second = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  assert.equal(first.commitInput.idempotencyKey, second.commitInput.idempotencyKey)
}))

rows.push(await runCase('3 dry_run import non crea record finali', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'dry_run')
  assert.equal(result.mode, 'dry_run')
  assert.equal(result.noDbWriteInDryRun, true)
  assert.equal(result.auditPersisted, false)
  assert.equal(counts(store).audit, 1)
  assert.ok(result.auditPreview)
}))

rows.push(await runCase('4 allowRealCommit false blocca write finale', async () => {
  const result = await commitCanonicalAccountingPayload({
    societaId: 'soc-001',
    esercizioId: '2026',
    utenteId: 'user-001',
    sourceModule: 'import_contabilita',
    sourceDocumentId: 'source-doc-001',
    idempotencyKey: 'import:soc-001:2026:source-doc-001',
    canonicalPayload: makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita')).payload,
  }, {
    dryRun: false,
    allowRealCommit: false,
    auditWriteEnabled: false,
  })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('real_commit_disabled'), true)
}))

rows.push(await runCase('5 replay same key same payload', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  const first = await runGatedCommit(commitInput, store, { dryRun: true })
  const second = await runGatedCommit(clone(commitInput), store, { dryRun: true })
  assert.equal(first.status, 'dry_run')
  assertReplayShape(first, second)
  assert.equal(counts(store).audit, 1)
}))

rows.push(await runCase('6 same key different payload conflicts', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  const first = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(first.status, 'dry_run')
  const conflicted = clone(commitInput)
  conflicted.canonicalPayload.document.totals.gross = 999
  conflicted.canonicalPayload.accounting.rows[0].debit = 999
  conflicted.canonicalPayload.accounting.rows[1].credit = 999
  const second = await runGatedCommit(conflicted, store, { dryRun: true })
  assert.equal(second.status, 'blocked')
  assert.equal(second.blockers.includes('idempotency_conflict'), true)
}))

rows.push(await runCase('7 legacy reference blocked', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  commitInput.canonicalPayload.legacyReference = 'createScritturaContabile'
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('legacy_reference_detected'), true)
}))

rows.push(await runCase('8 tenant mismatch blocked', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'), { societaId: 'soc-001' })
  commitInput.canonicalPayload.company.societaId = 'soc-other'
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('tenant_scope_mismatch'), true)
}))

rows.push(await runCase('9 missing idempotencyKey blocked', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  commitInput.idempotencyKey = ''
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'blocked')
  assert.equal(result.blockers.includes('idempotencyKey_missing'), true)
}))

rows.push(await runCase('10 output compatibile con UI import', async () => {
  const store = createPreviewStore()
  const { commitInput } = makeCommitInputFromBuilderInput(makeImportBuilderInput('vendita'))
  const result = await runGatedCommit(commitInput, store, { dryRun: true })
  assert.equal(result.status, 'dry_run')
  assert.equal(result.mode, 'dry_run')
  assert.equal(result.idempotencyKey, commitInput.idempotencyKey)
  assert.equal(result.payloadHash, buildCanonicalPayloadHash(commitInput.canonicalPayload))
  assert.ok(result.auditPreview)
  assert.ok(Array.isArray(result.warnings))
  assert.equal(result.noDbWriteInDryRun, true)
}))

printTable(rows)

const failures = rows.filter((row) => row.status !== 'PASS')
console.log('')
console.log(`Totale casi: ${rows.length}`)
console.log(`PASS: ${rows.length - failures.length}`)
console.log(`FAIL: ${failures.length}`)

if (failures.length > 0) {
  console.log('')
  console.log('Elenco fail:')
  for (const failure of failures) {
    console.log(`- ${failure.case}: ${failure.detail}`)
  }
  process.exitCode = 1
} else {
  console.log('All import contabilita atomic commit contract checks passed.')
}
