import { mapImportContabilitaCommitPayloadToCanonical } from '../../src/modules/contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js'

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function runCase(name, factory, check, options = {}) {
  const input = factory()
  const before = clone(input)
  const output = mapImportContabilitaCommitPayloadToCanonical(input, { mode: 'commit', ...options })

  assert(isPlainObject(output?.payload), `${name}: payload mancante`)
  assert(isPlainObject(output?.validationResult), `${name}: validationResult mancante`)
  assert(output.payload.schemaVersion, `${name}: schemaVersion mancante`)
  assert(Array.isArray(output.payload.subjects), `${name}: subjects non array`)
  assert(isPlainObject(output.payload.validation), `${name}: validation payload mancante`)

  check(output, input)

  const after = clone(input)
  assert(JSON.stringify(before) === JSON.stringify(after), `${name}: input mutato`)

  return { name, passed: true }
}

function basePayload() {
  return {
    handoff: {
      contractVersion: 'P7B-v3',
      sourceModule: 'import_contabilita',
      sourceBatchId: 'BATCH-2026-05-04',
      sourceRowKey: 'ROW-001',
      sourceFileName: 'fattura-esempio.xml',
      operatorId: 'OP-01',
      createdAt: '2026-05-04T10:00:00.000Z',
    },
    company: {
      societaId: 'SOC-01',
      esercizioId: '2026',
      periodoIva: '2026-05',
      regime: 'ordinario',
    },
    document: {
      direction: 'acquisto',
      type: 'fattura_passiva',
      number: 'FPR-123',
      documentDate: '2026-05-04',
      registrationDate: '2026-05-04',
      vatCompetence: '2026-05',
      counterparty: {
        name: 'Fornitore SRL',
        vatNumber: 'IT12345678901',
        taxCode: 'RSSMRA80A01F205X',
        accountId: 'ACC-CP-01',
      },
      totals: {
        taxable: 1000,
        vat: 220,
        gross: 1220,
        currency: 'EUR',
      },
      flags: {},
    },
    accounting: {
      causaleContabile: {
        id: 'CAU-ACQ',
        code: 'ACQ',
        description: 'Acquisto fattura',
      },
      rows: [
        { rowNumber: 1, accountId: '600100', accountCode: '600100', description: 'Imponibile', debit: 1000, credit: 0 },
        { rowNumber: 2, accountId: '210000', accountCode: '210000', description: 'Fornitore', debit: 0, credit: 1000 },
      ],
      totals: {
        debit: 1000,
        credit: 1000,
      },
      isBalanced: true,
      description: 'Acquisto fattura fornitore',
      soggettoCollegato: 'ACC-CP-01',
    },
    vat: {
      enabled: true,
      registerType: 'acquisti',
      competencePeriod: '2026-05',
      rows: [
        {
          rowNumber: 1,
          imponibile: 1000,
          imposta: 220,
          aliquota: 22,
          natura: '',
          causaleIvaId: 'IVA-22',
        },
      ],
      totals: {
        taxable: 1000,
        tax: 220,
      },
    },
    ledger: {
      enabled: true,
      type: 'fornitore',
      accountId: 'ACC-CP-01',
      amount: 1220,
      dueDate: '2026-06-04',
      rows: [
        {
          action: 'open',
          documentRef: 'FPR-123',
          amount: 1220,
          dueDate: '2026-06-04',
        },
      ],
    },
    withholding: {
      enabled: false,
      supported: false,
      rows: [],
    },
    validation: {
      status: 'ok',
      blockers: [],
      warnings: [],
    },
    automationMeta: {
      sourceMode: 'auto',
      operatorDecisions: [{ kind: 'match', value: true }],
      overrides: [],
      reasons: [],
    },
    readiness: {
      status: 'pronto_per_contabilita',
      label: 'Pronto per contabilita',
    },
    classification: {
      code: 'ordinario',
      label: 'Ordinario',
      managed: true,
    },
  }
}

const cases = [
  {
    name: 'Fattura fornitore ordinaria pronta',
    factory: () => basePayload(),
    check: ({ payload, validationResult }) => {
      assert(payload.source.module === 'import_contabilita', 'source.module errato')
      assert(payload.postCommitTargets.shouldCreateDocumentiContabilita === true, 'shouldCreateDocumentiContabilita errato')
      assert(payload.postCommitTargets.shouldCreatePrimaNota === true, 'shouldCreatePrimaNota errato')
      assert(payload.postCommitTargets.shouldCreateIva === true, 'shouldCreateIva errato')
      assert(payload.postCommitTargets.shouldCreateLedger === true, 'shouldCreateLedger errato')
      assert(payload.subjects.length > 0, 'subjects vuoto')
      assert(validationResult.targetValidabili.primaNota.valid === true, 'primaNota non valida')
      assert(validationResult.targetValidabili.iva.valid === true, 'iva non valida')
      assert(validationResult.targetValidabili.ledger.valid === true, 'ledger non valido')
    },
  },
  {
    name: 'Fattura cliente ordinaria pronta',
    factory: () => {
      const payload = basePayload()
      payload.document.direction = 'vendita'
      payload.document.type = 'fattura_attiva'
      payload.document.counterparty = {
        name: 'Cliente SPA',
        vatNumber: 'IT09876543210',
        taxCode: 'CLNPLA80A01H501X',
        accountId: 'ACC-CL-01',
      }
      payload.accounting.rows = [
        { rowNumber: 1, accountId: '700100', accountCode: '700100', description: 'Ricavo', debit: 0, credit: 1000 },
        { rowNumber: 2, accountId: '210000', accountCode: '210000', description: 'Cliente', debit: 1000, credit: 0 },
      ]
      payload.accounting.soggettoCollegato = 'ACC-CL-01'
      payload.accounting.totals = { debit: 1000, credit: 1000 }
      payload.vat.registerType = 'vendite'
      payload.ledger.type = 'cliente'
      payload.ledger.accountId = 'ACC-CL-01'
      payload.ledger.rows = [
        { action: 'open', documentRef: 'FAT-456', amount: 1220, dueDate: '2026-06-04' },
      ]
      return payload
    },
    check: ({ payload, validationResult }) => {
      assert(payload.vat.registerType === 'vendite', 'vat.registerType errato')
      assert(payload.subjects.length > 0, 'subjects vuoto')
      assert(validationResult.targetValidabili.primaNota.valid === true, 'primaNota non valida')
      assert(validationResult.targetValidabili.iva.valid === true, 'iva non valida')
      assert(validationResult.targetValidabili.ledger.valid === true, 'ledger non valido')
    },
  },
  {
    name: 'Fattura multi IVA',
    factory: () => {
      const payload = basePayload()
      payload.vat.rows = [
        { rowNumber: 1, imponibile: 800, imposta: 176, aliquota: 22, causaleIvaId: 'IVA-22' },
        { rowNumber: 2, imponibile: 200, imposta: 20, aliquota: 10, causaleIvaId: 'IVA-10' },
      ]
      payload.vat.totals = { taxable: 1000, tax: 196 }
      return payload
    },
    check: ({ payload, validationResult }) => {
      assert(payload.vat.rows.length >= 2, 'vat.rows insufficienti')
      assert(payload.postCommitTargets.shouldCreateIva === true, 'shouldCreateIva errato')
      assert(validationResult.targetValidabili.iva.valid === true, 'iva non valida')
    },
  },
  {
    name: 'Fattura senza conto patrimoniale controparte',
    factory: () => {
      const payload = basePayload()
      payload.document.counterparty = {
        name: 'Fornitore senza conto',
        vatNumber: 'IT11111111111',
        taxCode: 'FRNSNN80A01H501X',
      }
      payload.accounting.soggettoCollegato = ''
      payload.ledger.accountId = ''
      payload.ledger.rows = []
      return payload
    },
    check: ({ payload, validationResult }) => {
      assert(payload.ledger.enabled === true, 'ledger dovrebbe restare attivo nel payload')
      assert(validationResult.targetValidabili.ledger.valid === false, 'ledger dovrebbe risultare non valido')
      assert(Array.isArray(validationResult.blocking) && validationResult.blocking.length > 0, 'blocking attesi')
    },
  },
  {
    name: 'Fattura senza conto costo/ricavo',
    factory: () => {
      const payload = basePayload()
      payload.accounting.rows = []
      payload.accounting.totals = { debit: 0, credit: 0 }
      payload.accounting.isBalanced = false
      return payload
    },
    check: ({ payload, validationResult }) => {
      assert(payload.accounting.rows.length === 0, 'accounting.rows non vuoto')
      assert(validationResult.targetValidabili.primaNota.valid === false, 'primaNota dovrebbe essere non valida')
    },
  },
  {
    name: 'IVA attiva ma righe IVA mancanti',
    factory: () => {
      const payload = basePayload()
      payload.vat.rows = []
      payload.vat.enabled = true
      return payload
    },
    check: ({ payload, validationResult }) => {
      assert(payload.postCommitTargets.shouldCreateIva === true, 'shouldCreateIva errato')
      assert(validationResult.targetValidabili.iva.valid === false, 'iva dovrebbe essere non valida')
      assert(Array.isArray(validationResult.blocking) && validationResult.blocking.length > 0, 'blocking attesi')
    },
  },
  {
    name: 'Withholding unsupported',
    factory: () => {
      const payload = basePayload()
      payload.withholding.enabled = true
      payload.withholding.supported = false
      payload.withholding.rows = []
      return payload
    },
    check: ({ payload }) => {
      assert(payload.withholding.enabled === false, 'withholding non dovrebbe risultare attivo')
      assert(payload.postCommitTargets.shouldCreateWithholding === false, 'shouldCreateWithholding errato')
    },
  },
  {
    name: 'Attachment/source file presente',
    factory: () => basePayload(),
    check: ({ payload }) => {
      assert(payload.attachments.sourceFile === 'fattura-esempio.xml', 'sourceFile errato')
      assert(payload.postCommitTargets.shouldAttachSourceDocument === true, 'shouldAttachSourceDocument errato')
    },
  },
  {
    name: 'Payload incompleto in commit',
    factory: () => {
      const payload = basePayload()
      payload.company.societaId = ''
      payload.accounting.rows = []
      payload.accounting.totals = { debit: 0, credit: 0 }
      payload.accounting.isBalanced = false
      return payload
    },
    check: ({ validationResult }) => {
      assert(validationResult.readiness === 'blocked', 'readiness dovrebbe essere blocked')
      assert(Array.isArray(validationResult.blocking) && validationResult.blocking.length > 0, 'blocking attesi')
    },
  },
]

const results = []
const failures = []

for (const testCase of cases) {
  try {
    const result = runCase(testCase.name, testCase.factory, testCase.check, testCase.options)
    results.push(result)
    console.log(`PASS ${testCase.name}`)
  } catch (error) {
    failures.push({ name: testCase.name, reason: error?.message || String(error) })
    console.log(`FAIL ${testCase.name} - ${error?.message || String(error)}`)
  }
}

const total = cases.length
const passed = results.length
const failed = failures.length

console.log(`Totale: ${total}`)
console.log(`Passati: ${passed}`)
console.log(`Falliti: ${failed}`)

if (failures.length > 0) {
  console.log('Fallimenti:')
  for (const failure of failures) {
    console.log(`- ${failure.name}: ${failure.reason}`)
  }
  process.exit(1)
}

process.exit(0)
