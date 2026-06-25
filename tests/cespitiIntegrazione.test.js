import test from 'node:test'
import assert from 'node:assert/strict'
import { isCespiteAccount, findCespiteRow } from '../src/modules/contabilita/domain/registrazione/resolveCespiteAccount.js'
import { runCommitWorkflow } from '../src/modules/import_contabilita/application/importContabilitaWorkflow.js'

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
  ilike(col, val) {
    this.filters.push({ col, op: 'ilike', val })
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
  delete() {
    this.client.log.push({ action: 'delete', table: this.table, filters: this.filters })
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
      societa: { id: 'soc-123', denominazione: 'Test Societa', partita_iva: '12345678901' },
      clienti: { id: 'cli-789', ragione_sociale: 'Test Cliente Studio' },
      prima_nota: { id: 'pn-new-id' },
      beni_ammortizzabili: null
    }
  }
  from(table) {
    return new MockDbQuery(table, this)
  }
  resolveSingle(table, data, filters) {
    // Se stiamo cercando se esiste già un bene per evitare duplicazioni (beni_ammortizzabili),
    // filtriamo in base alla nota per simulare l'esistenza o meno.
    if (table === 'beni_ammortizzabili') {
      const noteFilter = (filters || []).find(f => f.col === 'note')
      if (noteFilter && this.responses.beni_ammortizzabili) {
        return { data: this.responses.beni_ammortizzabili, error: null }
      }
      return { data: null, error: null }
    }
    return { data: this.responses[table] || null, error: null }
  }
  resolveMultiple(table, data, filters) {
    if (table === 'stampe_definitive') {
      return { data: this.responses.stampe_definitive || [], error: null }
    }
    return { data: [], error: null }
  }
}

test('Fase 16 Cespiti Leggeri - isCespiteAccount helper tests', () => {
  assert.equal(isCespiteAccount({ codice: '1.01.01.001', descrizione: 'Marchi e Brevetti' }), true)
  assert.equal(isCespiteAccount({ codice: '1.02.05.003', descrizione: 'Autovetture' }), true)
  assert.equal(isCespiteAccount({ codice: '10101001', descrizione: 'Beni immateriali' }), true)
  assert.equal(isCespiteAccount({ codice: '1 02 01 002', descrizione: 'Fabbricati' }), true)
  
  // Test keyword fallbacks on patrimoniale/attivo
  assert.equal(isCespiteAccount({ tipo: 'patrimoniale', natura: 'attivo', descrizione: 'Acquisto attrezzature da ufficio' }), true)
  assert.equal(isCespiteAccount({ tipo: 'patrimoniale', natura: 'attivo', descrizione: 'Mobili e arredi' }), true)
  assert.equal(isCespiteAccount({ tipo: 'patrimoniale', natura: 'attivo', descrizione: 'Hardware PC' }), true)
  assert.equal(isCespiteAccount({ tipo: 'patrimoniale', descrizione: 'Software' }), true)

  // Test exclusions
  assert.equal(isCespiteAccount({ codice: '1.05.01.001', tipo: 'patrimoniale', natura: 'attivo', descrizione: 'Banca Popolare' }), false)
  assert.equal(isCespiteAccount({ codice: '2.01.01.001', tipo: 'patrimoniale', natura: 'passivo', descrizione: 'Debiti v/Fornitori' }), false)
  assert.equal(isCespiteAccount({ codice: '4.01.01.001', tipo: 'economico', natura: 'costi', descrizione: 'Cancelleria' }), false)
})

test('Fase 16 Cespiti Leggeri - findCespiteRow helper tests', () => {
  const piano = [
    { id: 'c-cespite', codice: '1.02.01.001', descrizione: 'Macchinari' },
    { id: 'c-costo', codice: '4.01.01.001', descrizione: 'Costo generico' }
  ]

  const rowsWithCespite = [
    { accountId: 'c-costo', dare: 100, avere: 0 },
    { accountId: 'c-cespite', dare: 500, avere: 0 }
  ]
  const match = findCespiteRow(rowsWithCespite, piano)
  assert.ok(match)
  assert.equal(match.conto.id, 'c-cespite')

  const rowsWithoutCespite = [
    { accountId: 'c-costo', dare: 100, avere: 0 }
  ]
  const noMatch = findCespiteRow(rowsWithoutCespite, piano)
  assert.equal(noMatch, null)
})

function makeTestCommitPayload({ assetAccount = false } = {}) {
  return {
    societaId: 'soc-123',
    registrationDate: '2026-06-25',
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
        createdAt: '2026-06-25T10:00:00Z',
      },
      company: {
        societaId: 'soc-123',
        esercizioId: '2026',
      },
      document: {
        direction: 'acquisto',
        number: '123',
        documentDate: '2026-06-25',
        registrationDate: '2026-06-25',
        totals: {
          gross: 1220.00,
          taxable: 1000.00,
          vat: 220.00,
        },
        counterparty: {
          accountId: 'acc-supplier',
          name: 'Fornitore Spa',
          taxCode: '11111111111',
          vatNumber: '11111111111',
        }
      },
      accounting: {
        causaleContabile: {
          id: 'caus-ff',
          codice: 'FF',
          description: 'Causale contabile',
          tipoCausale: 'docivanormale',
          isDocumentoIva: true,
          gestionePartitario: 'apertura',
          segnoRegistroIva: '+',
        },
        description: 'Test doc description',
        isBalanced: true,
        totals: {
          debit: 1220.00,
          credit: 1220.00,
        },
        rows: [
          {
            rowNumber: 1,
            accountId: assetAccount ? 'acc-cespite' : 'acc-cost',
            accountCode: assetAccount ? '1.02.01.001' : '6.01.001',
            accountDescription: assetAccount ? 'Macchinario industriale' : 'Costo generico',
            debit: 1000.00,
            credit: 0.00,
            dare: 1000.00,
            avere: 0.00,
            description: 'Acquisto'
          },
          {
            rowNumber: 2,
            accountId: 'acc-iva',
            accountCode: '1.03.01.001',
            accountDescription: 'IVA a credito',
            debit: 220.00,
            credit: 0.00,
            dare: 220.00,
            avere: 0.00,
            description: 'IVA'
          },
          {
            rowNumber: 3,
            accountId: 'acc-supplier',
            accountCode: '2.03.08.001',
            accountDescription: 'Fornitore c/acquisti',
            debit: 0.00,
            credit: 1220.00,
            dare: 0.00,
            avere: 1220.00,
            description: 'Soggetto'
          },
        ],
      },
      vat: {
        enabled: true,
        registerType: 'acquisti',
        competencePeriod: '2026-06',
        rows: [
          {
            rowNumber: 1,
            imponibile: 1000.00,
            imposta: 220.00,
            aliquota: 22.00,
            causaleIvaId: 'iva-22',
            causaleIva: 'Aliquota 22%',
            esigibilita: 'Immediata',
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
            amount: 1220.00,
            dueDate: '2026-07-30',
          }
        ]
      },
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

test('Fase 16 Cespiti Leggeri - runCommitWorkflow with asset account creates draft cespite', async () => {
  const dbMock = new MockDbClient()
  const commitPayload = makeTestCommitPayload({ assetAccount: true })

  const res = await runCommitWorkflow(commitPayload, { db: dbMock })
  
  if (!res.success) console.log('DEBUG INTEGRATION TEST ERROR:', res)
  assert.ok(res.success)
  
  const cespiteInsert = dbMock.log.find(c => c.table === 'beni_ammortizzabili' && c.action === 'insert')
  assert.ok(cespiteInsert, 'Il cespite deve essere inserito in beni_ammortizzabili')
  assert.equal(cespiteInsert.data[0].cliente_id, 'cli-789')
  assert.equal(cespiteInsert.data[0].costo_storico, 1000)
  assert.equal(cespiteInsert.data[0].aliquota_ammortamento, 20)
  assert.equal(cespiteInsert.data[0].valore_residuo, 1000)
  assert.ok(cespiteInsert.data[0].note.includes('ID prima nota:'))
})

test('Fase 16 Cespiti Leggeri - runCommitWorkflow with non-asset account does NOT create cespite', async () => {
  const dbMock = new MockDbClient()
  const commitPayload = makeTestCommitPayload({ assetAccount: false })

  const res = await runCommitWorkflow(commitPayload, { db: dbMock })
  assert.ok(res.success)
  
  const cespiteInsert = dbMock.log.find(c => c.table === 'beni_ammortizzabili' && c.action === 'insert')
  assert.equal(cespiteInsert, undefined, 'Nessun cespite deve essere creato per conti spesa ordinari')
})
