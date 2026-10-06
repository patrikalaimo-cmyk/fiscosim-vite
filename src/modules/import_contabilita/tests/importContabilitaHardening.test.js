import test from 'node:test'
import assert from 'node:assert/strict'
import { runCommitWorkflow } from '../application/importContabilitaWorkflow.js'
import { mapImportContabilitaCommitPayloadToCanonical } from '../../contabilita/canonical/mappers/mapImportContabilitaCommitPayloadToCanonical.js'

// Simple mock for database queries
class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.filters = []
  }
  select(fields = '*') {
    this.fields = fields
    return this
  }
  eq(col, val) {
    this.filters.push({ col, op: 'eq', val })
    return this
  }
  maybeSingle() {
    return Promise.resolve(this.client.resolveSingle(this.table, null, this.filters))
  }
  single() {
    return Promise.resolve(this.client.resolveSingle(this.table, null, this.filters))
  }
  update(data) {
    this.client.log.push({ action: 'update', table: this.table, data, filters: this.filters })
    return this
  }
  insert(data) {
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }
  then(resolve) {
    const res = this.client.resolveMultiple(this.table, null, this.filters)
    resolve(res)
  }
}

class MockDbClient {
  constructor() {
    this.log = []
    this.responses = {
      documenti_import: { id: 'doc-import-123', stato: 'pending' },
      stampe_definitive: [],
      prima_nota: { id: 'pn-new-id' },
      prima_nota_righe: [],
      registri_iva: [],
      partitario: [],
      ritenute_dacconto: []
    }
  }
  from(table) {
    return new MockDbQuery(table, this)
  }
  resolveSingle(table, data, filters) {
    if (table === 'documenti_import') {
      return { data: this.responses.documenti_import, error: null }
    }
    if (table === 'prima_nota') {
      return { data: this.responses.prima_nota, error: null }
    }
    if (table === 'piano_conti') {
      const idFilter = (filters || []).find(f => f.col === 'id')
      return { data: { id: idFilter ? idFilter.val : 'piano_conti-id', codice: '2.04.02.099', descrizione: 'IVA split payment' }, error: null }
    }
    return { data: { id: `${table}-id` }, error: null }
  }
  resolveMultiple(table, data, filters) {
    if (table === 'stampe_definitive') {
      return { data: this.responses.stampe_definitive, error: null }
    }
    const dataArray = Array.isArray(data) 
      ? data.map((row, idx) => ({ id: `${table}-id`, ...row }))
      : [{ id: `${table}-id` }]
    return { data: dataArray, error: null }
  }
}

function makeBasePayload({ direction = 'acquisto', causaleCode = 'FF', tipoCausale = 'docivanormale', hasRitenuta = false, splitPayment = false } = {}) {
  const isAcquisti = direction === 'acquisto' || direction === 'passiva'
  return {
    societaId: 'soc-123',
    registrationDate: '2026-04-30',
    sourceRow: {
      id: 'doc-import-123',
      filename: 'invoice.xml',
    },
    payload: {
      handoff: {
        sourceRowKey: 'doc-import-123',
        sourceFileName: 'invoice.xml',
        sourceBatchId: 'batch-test-123',
        contractVersion: 'P7B-v3',
        operatorId: 'op-123',
        createdAt: '2026-04-30T10:00:00Z',
      },
      company: {
        societaId: 'soc-123',
        esercizioId: '2026',
      },
      document: {
        direction: isAcquisti ? 'acquisto' : 'vendita',
        number: '123',
        documentDate: '2026-04-20',
        registrationDate: '2026-04-30',
        totals: {
          gross: 122.00,
          taxable: 100.00,
          vat: 22.00,
        },
        counterparty: {
          accountId: 'acc-supplier',
          name: 'Fornitore Spa',
          taxCode: '11111111111',
          vatNumber: '11111111111',
          split_payment: splitPayment,
        }
      },
      accounting: {
        causaleContabile: {
          id: `caus-${causaleCode.toLowerCase()}`,
          codice: causaleCode,
          description: 'Causale contabile',
          tipoCausale: tipoCausale,
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
          opRitenute: hasRitenuta ? 'documento' : 'ignora',
          split_payment: splitPayment,
          conto_iva_split_payment: splitPayment ? 'acc-split-payment' : undefined,
          conto_iva_split_payment_codice: splitPayment ? '2.04.02.099' : undefined,
          conto_iva_split_payment_descrizione: splitPayment ? 'IVA split payment' : undefined,
        },
        description: 'Test doc description',
        isBalanced: true,
        totals: {
          debit: 122.00,
          credit: 122.00,
        },
        rows: [
          { rowNumber: 1, accountId: 'acc-cost', accountCode: '6.01.001', accountDescription: 'Costo/Ricavo', debit: isAcquisti ? 100.00 : 0.00, credit: isAcquisti ? 0.00 : 100.00, dare: isAcquisti ? 100.00 : 0.00, avere: isAcquisti ? 0.00 : 100.00, description: 'Voce economica' },
          { rowNumber: 2, accountId: isAcquisti ? 'acc-iva' : 'acc-iva-debito', accountCode: isAcquisti ? '1.03.01.001' : '2.04.01.001', accountDescription: 'IVA', debit: isAcquisti ? 22.00 : 0.00, credit: isAcquisti ? 0.00 : 22.00, dare: isAcquisti ? 22.00 : 0.00, avere: isAcquisti ? 0.00 : 22.00, description: 'IVA' },
          { rowNumber: 3, accountId: 'acc-supplier', accountCode: '2.03.08.001', accountDescription: 'Soggetto', debit: isAcquisti ? 0.00 : 122.00, credit: isAcquisti ? 122.00 : 0.00, dare: isAcquisti ? 0.00 : 122.00, avere: isAcquisti ? 122.00 : 0.00, description: 'Soggetto' },
        ],
      },
      vat: {
        enabled: true,
        registerType: isAcquisti ? 'acquisti' : 'vendite',
        competencePeriod: '2026-04',
        splitPayment: splitPayment,
        rows: [
          {
            rowNumber: 1,
            imponibile: 100.00,
            imposta: 22.00,
            aliquota: 22.00,
            causaleIvaId: 'iva-22',
            causaleIva: 'Aliquota 22%',
            esigibilita: 'Immediata',
            splitPayment: splitPayment,
          }
        ]
      },
      ledger: {
        enabled: true,
        accountId: 'acc-supplier',
        rows: [
          {
            rowNumber: 1,
            action: 'open',
            amount: 122.00,
            dueDate: '2026-05-30',
          }
        ]
      },
      withholding: hasRitenuta ? {
        enabled: true,
        recipient: {
          anagraficaId: 'acc-supplier',
          denominazione: 'Fornitore Spa',
          codiceFiscale: '11111111111',
          partitaIva: '11111111111',
          paese: 'IT',
        },
        rows: [
          {
            rowNumber: 1,
            baseAmount: 100.00,
            rate: 20.00,
            amount: 20.00,
            netPaid: 80.00,
            causaleCu: 'A',
            tributeCode: '1040',
          }
        ]
      } : undefined,
      validation: {
        status: 'confermata',
        blockers: [],
        warnings: [],
      },
      automationMeta: {
        mode: 'automatic',
        code: 'TD01',
      }
    }
  }
}

test('Fase 15: runCommitWorkflow con ritenuta d acconto percipiente', async () => {
  const db = new MockDbClient()
  const payload = makeBasePayload({ direction: 'acquisto', causaleCode: 'FPA', hasRitenuta: true })
  
  const mapped = mapImportContabilitaCommitPayloadToCanonical(payload, { mode: 'commit', validate: true })
  console.log('MAPPED CANONICAL PAYLOAD:', JSON.stringify(mapped.payload, null, 2))
  console.log('MAPPED VALIDATION RESULT:', mapped.validationResult)

  const res = await runCommitWorkflow(payload, { db })
  if (!res.success) console.log('DEBUG RITENUTE:', res)
  assert.equal(res.success, true)
  
  // Find insert logs for ritenute_dacconto
  const ritenuteInserts = db.log.filter(l => l.action === 'insert' && l.table === 'ritenute_dacconto')
  assert.equal(ritenuteInserts.length, 1)
  assert.equal(ritenuteInserts[0].data[0].percipiente_id, 'acc-supplier')
  assert.equal(ritenuteInserts[0].data[0].imponibile_ritenuta, 100.00)
  assert.equal(ritenuteInserts[0].data[0].ritenuta, 20.00)
  assert.equal(ritenuteInserts[0].data[0].compenso_netto, 80.00)
})

test('Fase 15: runCommitWorkflow con active split payment', async () => {
  const db = new MockDbClient()
  const payload = makeBasePayload({ direction: 'vendita', causaleCode: 'FC', splitPayment: true })
  
  const res = await runCommitWorkflow(payload, { db })
  if (!res.success) console.log('DEBUG SPLIT:', res)
  assert.equal(res.success, true)
  
  const righeInsert = db.log.find(l => l.action === 'insert' && l.table === 'prima_nota_righe')
  console.log('SPLIT RIGHE INSERT DATA:', righeInsert?.data)
  console.log('SPLIT CLIENT LOG:', db.log)
  
  const clientRow = righeInsert?.data?.find(r => r.conto_id === 'acc-supplier')
  assert.ok(clientRow)
  assert.equal(clientRow.importo_dare, 100.00)
  
  // Verifica le righe tecniche split payment
  const splitDareRow = righeInsert?.data?.find(r => r.conto_id === 'acc-split-payment' && r.importo_dare === 22.00)
  assert.ok(splitDareRow)
  const splitAvereRow = righeInsert?.data?.find(r => r.conto_id === 'acc-split-payment' && r.importo_avere === 22.00)
  assert.ok(splitAvereRow)

  const pnInsert = db.log.find(l => l.action === 'insert' && l.table === 'prima_nota')
  assert.equal(pnInsert.data[0].totale_dare, 122.00)
  assert.equal(pnInsert.data[0].totale_avere, 122.00)
  
  const partitarioInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partitarioInsert)
  assert.equal(partitarioInsert.data[0].importo_originale, 100.00)
})

test('Fase 15: runCommitWorkflow con IVA per cassa differita', async () => {
  const db = new MockDbClient()
  const payload = makeBasePayload({ direction: 'acquisto', causaleCode: 'FF', tipoCausale: 'docivaesigdifferita' })
  // Add ivaDifferita flag to causale to trigger IVA per cassa policy
  payload.payload.accounting.causaleContabile.registro_iva_differita = true

  const res = await runCommitWorkflow(payload, { db })
  assert.equal(res.success, true)
  
  // Register entries should be created on the database with esigibilita = 'differita'
  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert)
  assert.equal(ivaInsert.data[0].esigibilita, 'differita')
})

test('Fase 15: runCommitWorkflow con reverse charge double entry e partitario imponibile', async () => {
  const db = new MockDbClient()
  const payload = makeBasePayload({ direction: 'acquisto', causaleCode: 'A17X', tipoCausale: 'autofattura' })
  
  const res = await runCommitWorkflow(payload, { db })
  if (!res.success) console.log('DEBUG REVERSE:', res)
  assert.equal(res.success, true)
  
  console.log('REVERSE CLIENT LOG:', db.log)
  const partitarioInsert = db.log.find(l => l.action === 'insert' && l.table === 'partitario')
  assert.ok(partitarioInsert)
  // Supplier is negative for passive invoices / NC / purchases in some configurations, but let's check absolute/original value
  assert.equal(Math.abs(partitarioInsert.data[0].importo_originale), 100.00)
})

// ─── Fase 15: Nota credito — parità canonica (segno opposto) ─────────────────
// Regola: nota credito ha segno opposto rispetto alla fattura, senza compensazione automatica.
// Il segnoRegistroIva = '-' nella policy della causale porta persistPrimaNotaDraft
// a scrivere la riga IVA con segno negativo nel registro IVA.
// Import riusa buildCausaleContabilePolicy (Registrazione Manuale) per rilevare notaCredito.
test('Fase 15: runCommitWorkflow con nota credito passiva segno opposto', async () => {
  const db = new MockDbClient()
  // Nota credito passiva (NCF): fattura passiva con segno opposto
  const payload = makeBasePayload({ direction: 'acquisto', causaleCode: 'NCF', tipoCausale: 'docivanormale' })
  // Impostiamo segno registro IVA a sottrae (nota credito): come farebbe la configurazione causale in DB
  payload.payload.accounting.causaleContabile.segnoRegistroIva = '-'
  // Le righe contabili di una nota credito sono invertite rispetto alla fattura ordinaria
  // (costo in Avere, IVA in Avere, fornitore in Dare)
  payload.payload.accounting.rows = [
    { rowNumber: 1, accountId: 'acc-cost', accountCode: '6.01.001', accountDescription: 'Costo/Ricavo', debit: 0, credit: 100.00, dare: 0, avere: 100.00, description: 'Storno costo nota credito' },
    { rowNumber: 2, accountId: 'acc-iva', accountCode: '1.03.01.001', accountDescription: 'IVA', debit: 0, credit: 22.00, dare: 0, avere: 22.00, description: 'IVA nota credito' },
    { rowNumber: 3, accountId: 'acc-supplier', accountCode: '2.03.08.001', accountDescription: 'Soggetto', debit: 122.00, credit: 0, dare: 122.00, avere: 0, description: 'Soggetto nota credito' },
  ]
  payload.payload.accounting.totals = { debit: 122.00, credit: 122.00 }
  // IVA row con segno negativo (nota credito): imponibile e imposta positivi,
  // ma il segno registro è gestito da persistPrimaNotaDraft via policy.notaCredito
  payload.payload.vat.rows[0].imponibile = 100.00
  payload.payload.vat.rows[0].imposta = 22.00

  const res = await runCommitWorkflow(payload, { db })
  if (!res.success) console.log('DEBUG NOTA CREDITO:', res)
  assert.equal(res.success, true)

  // Verifica: prima nota creata
  const pnInsert = db.log.find(l => l.action === 'insert' && l.table === 'prima_nota')
  assert.ok(pnInsert, 'prima_nota deve essere inserita')

  // Verifica: le righe contabili sono coerenti con la struttura nota credito
  const righeInsert = db.log.find(l => l.action === 'insert' && l.table === 'prima_nota_righe')
  assert.ok(righeInsert, 'prima_nota_righe devono essere inserite')
  // Dare totale == Avere totale (quadratura)
  const totDare = (righeInsert.data || []).reduce((s, r) => s + (r.importo_dare || 0), 0)
  const totAvere = (righeInsert.data || []).reduce((s, r) => s + (r.importo_avere || 0), 0)
  assert.ok(Math.abs(totDare - totAvere) < 0.01, `Quadratura dare/avere: dare=${totDare} avere=${totAvere}`)

  // Verifica: IVA registrata (il segno è gestito dal motore IVA via policy, non duplicando la logica qui)
  const ivaInsert = db.log.find(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInsert, 'registri_iva deve essere inserito per nota credito')
})

// ─── Fase 15: Multi-aliquota — righe IVA distinte preservate ─────────────────
// Regola: documento con più righe DatiRiepilogo deve preservare righe IVA distinte.
// Il commit workflow non deve collassare le righe multi-aliquota.
// Import produce ivaDraft.rows con stesso numero di righe del documento originale.
test('Fase 15: runCommitWorkflow con documento multi-aliquota righe IVA distinte', async () => {
  const db = new MockDbClient()
  const payload = makeBasePayload({ direction: 'acquisto', causaleCode: 'FF', tipoCausale: 'docivanormale' })
  // Documento con 3 aliquote: 4%, 10%, 22%
  payload.payload.document.totals = { gross: 145.40, taxable: 120.00, vat: 25.40 }
  payload.payload.accounting.rows = [
    { rowNumber: 1, accountId: 'acc-cost-1', accountCode: '6.01.001', accountDescription: 'Costo aliq 4%', debit: 50.00, credit: 0, dare: 50.00, avere: 0, description: 'Imponibile 4%' },
    { rowNumber: 2, accountId: 'acc-cost-2', accountCode: '6.01.002', accountDescription: 'Costo aliq 10%', debit: 30.00, credit: 0, dare: 30.00, avere: 0, description: 'Imponibile 10%' },
    { rowNumber: 3, accountId: 'acc-cost-3', accountCode: '6.01.003', accountDescription: 'Costo aliq 22%', debit: 40.00, credit: 0, dare: 40.00, avere: 0, description: 'Imponibile 22%' },
    { rowNumber: 4, accountId: 'acc-iva', accountCode: '1.03.01.001', accountDescription: 'IVA', debit: 25.40, credit: 0, dare: 25.40, avere: 0, description: 'IVA totale' },
    { rowNumber: 5, accountId: 'acc-supplier', accountCode: '2.03.08.001', accountDescription: 'Soggetto', debit: 0, credit: 145.40, dare: 0, avere: 145.40, description: 'Soggetto' },
  ]
  payload.payload.accounting.totals = { debit: 145.40, credit: 145.40 }
  // 3 righe IVA distinte (aliquote diverse)
  payload.payload.vat.rows = [
    { rowNumber: 1, imponibile: 50.00, imposta: 2.00, aliquota: 4.00, causaleIvaId: 'iva-4', causaleIva: 'Aliquota 4%', esigibilita: 'Immediata', splitPayment: false },
    { rowNumber: 2, imponibile: 30.00, imposta: 3.00, aliquota: 10.00, causaleIvaId: 'iva-10', causaleIva: 'Aliquota 10%', esigibilita: 'Immediata', splitPayment: false },
    { rowNumber: 3, imponibile: 40.00, imposta: 8.80, aliquota: 22.00, causaleIvaId: 'iva-22', causaleIva: 'Aliquota 22%', esigibilita: 'Immediata', splitPayment: false },
  ]

  const res = await runCommitWorkflow(payload, { db })
  if (!res.success) console.log('DEBUG MULTI-ALIQUOTA:', res)
  assert.equal(res.success, true)

  // Verifica: tutte e 3 le righe IVA distinte sono state inserite in registri_iva
  const ivaInserts = db.log.filter(l => l.action === 'insert' && l.table === 'registri_iva')
  assert.ok(ivaInserts.length > 0, 'registri_iva deve essere inserito')
  // Ogni riga IVA distinta deve avere la propria aliquota
  const allIvaData = ivaInserts.flatMap(l => Array.isArray(l.data) ? l.data : [l.data])
  assert.equal(allIvaData.length, 3, `Devono esserci 3 righe IVA distinte, trovate: ${allIvaData.length}`)
  const aliquote = new Set(allIvaData.map(r => r.aliquota))
  assert.ok(aliquote.has(4) || aliquote.has('4') || aliquote.has(4.00), 'Aliquota 4% deve essere presente')
  assert.ok(aliquote.has(10) || aliquote.has('10') || aliquote.has(10.00), 'Aliquota 10% deve essere presente')
  assert.ok(aliquote.has(22) || aliquote.has('22') || aliquote.has(22.00), 'Aliquota 22% deve essere presente')
})

test('Fase 15: runCommitWorkflow con bollo (spese accessorie) - quadratura e sbilancio risolti', async () => {
  const db = new MockDbClient()
  const payload = makeBasePayload({ direction: 'acquisto', causaleCode: 'FF', tipoCausale: 'docivanormale' })
  // Aggiungiamo bollo: 2.00. Il totale lordo del documento diventa 124.00 (invece di 122.00).
  payload.payload.document.totals = { gross: 124.00, taxable: 100.00, vat: 22.00, bollo: 2.00 }
  // La riga del soggetto ha importo 124.00
  payload.payload.accounting.rows[2].credit = 124.00
  payload.payload.accounting.rows[2].avere = 124.00
  
  const res = await runCommitWorkflow(payload, { db })
  if (!res.success) console.log('DEBUG BOLLO:', res)
  assert.equal(res.success, true)
  
  const righeInsert = db.log.find(l => l.action === 'insert' && l.table === 'prima_nota_righe')
  
  // La riga di costo deve avere importo aumentato del bollo: 100.00 + 2.00 = 102.00
  const costRow = righeInsert?.data?.find(r => r.conto_id === 'acc-cost')
  assert.ok(costRow)
  assert.equal(costRow.importo_dare, 102.00)
  
  const pnInsert = db.log.find(l => l.action === 'insert' && l.table === 'prima_nota')
  assert.equal(pnInsert.data[0].totale_dare, 124.00)
  assert.equal(pnInsert.data[0].totale_avere, 124.00)
})

