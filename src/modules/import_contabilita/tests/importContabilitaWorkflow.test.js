import test from 'node:test'
import assert from 'node:assert/strict'

import { runImportWorkflow, runCommitWorkflow } from '../application/importContabilitaWorkflow.js'

test('workflow: 1 file valido', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-24</Data><Numero>W-1</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`
  const fileLike = { name: 'ok.xml', text: async () => xml }
  const res = await runImportWorkflow([fileLike], { batchId: 'batch-test' })
  assert.equal(res.ok, true)
  assert.equal(res.batchId, 'batch-test')
  assert.equal(res.parsedDocs.length, 1)
  assert.equal(res.stagingRows.length, 1)
  assert.equal(res.report.items.length, 1)
  assert.equal(res.report.totals.files, 1)
  assert.equal(res.report.uploadedFilesCount, 1)
  assert.equal(res.report.extractedXmlCount, 1)
  assert.equal(res.report.discardedFilesCount, 0)
  assert.ok(String(res.report.deletedDetectionNote || '').includes('I casi cancellati'))
})

test('workflow: files vuoto', async () => {
  const res = await runImportWorkflow([], {})
  assert.equal(res.ok, false)
  assert.equal(res.reason, 'no_files')
  assert.equal(res.parsedDocs.length, 0)
})

test('workflow: p7m singolo -> 1 xml', async () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-24</Data><Numero>P-1</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`
  const fileLike = {
    name: 'invoice.p7m',
    arrayBuffer: async () => Buffer.from(`random-bytes ${xml} trailing-bytes`, 'utf8'),
  }
  const res = await runImportWorkflow([fileLike], { batchId: 'batch-p7m' })
  assert.equal(res.ok, true)
  assert.equal(res.parsedDocs.length, 1)
  assert.equal(res.parsedDocs[0].tipoDocumento, 'TD01')
  assert.equal(res.report.uploadedFilesCount, 1)
  assert.equal(res.report.extractedXmlCount, 1)
  assert.equal(res.report.discardedFilesCount, 0)
})

test('workflow: file con xml invalido', async () => {
  const fileLike = { name: 'bad.xml', text: async () => '<not-xml' }
  const res = await runImportWorkflow([fileLike], {})
  assert.equal(res.ok, true)
  assert.equal(res.parsedDocs.length, 1)
  assert.equal(res.parsedDocs[0].errors.length > 0, true)
  assert.equal(res.report.totals.errors >= 1, true)
})

test('workflow: deletedInStaging e deletedInAccounting vengono reimportati solo in report e non in stagingRows', async () => {
  const xmlStagingDeleted = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-24</Data><Numero>D-STG</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore Staging</Denominazione></Anagrafica><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>11111111111</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente Staging</Denominazione></Anagrafica><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>22222222222</IdCodice></IdFiscaleIVA></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const xmlAccountingDeleted = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-25</Data><Numero>D-ACC</Numero><ImportoTotaleDocumento>244.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore Contabilita</Denominazione></Anagrafica><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>33333333333</IdCodice></IdFiscaleIVA></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente Contabilita</Denominazione></Anagrafica><IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>44444444444</IdCodice></IdFiscaleIVA></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>200.00</ImponibileImporto><Imposta>44.00</Imposta></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const res = await runImportWorkflow(
    [
      { name: 'deleted-staging.xml', text: async () => xmlStagingDeleted },
      { name: 'deleted-accounting.xml', text: async () => xmlAccountingDeleted },
    ],
    {
      batchId: 'batch-deleted',
      dedupCandidates: {
        stagingRows: [
          {
            id: 'stg-deleted',
            filename: 'deleted-staging.xml',
            stato: 'deleted',
            ai_raw_response: {
              tipo_documento: 'TD01',
              numero_documento: 'D-STG',
              data_documento: '2026-04-24',
              cedente_piva: '11111111111',
              cessionario_piva: '22222222222',
              totale: 122,
            },
          },
        ],
        accountingRows: [
          {
            id: 'acc-deleted',
            numero_documento: 'D-ACC',
            data_documento: '2026-04-25',
            tipo_documento: 'TD01',
            soggetto_denominazione: 'Fornitore Contabilita',
            soggetto_piva: '33333333333',
            soggetto_cf: '',
            validation_status: 'deleted',
            workflow_status: 'deleted',
            totale: 244,
          },
        ],
      },
    },
  )

  assert.equal(res.ok, true)
  assert.equal(res.stagingRows.length, 0)
  assert.equal(res.report.duplicateInStagingCount, 0)
  assert.equal(res.report.duplicateInAccountingCount, 0)
  assert.equal(res.report.deletedInStagingCount, 1)
  assert.equal(res.report.deletedInAccountingCount, 1)
  assert.equal(res.report.deletedInStagingRows[0].classification, 'deletedInStaging')
  assert.equal(res.report.deletedInAccountingRows[0].classification, 'deletedInAccounting')
  assert.ok(res.report.deletedInStagingRows[0].parsedDoc)
  assert.ok(res.report.deletedInAccountingRows[0].parsedDoc)
  assert.ok(String(res.report.deletedDetectionNote || '').includes('I casi cancellati'))
})

export class MockDbQuery {
  constructor(table, client) {
    this.table = table
    this.client = client
    this.filters = {}
    this.insertedData = null
    this.updatedData = null
  }
  select(fields = '*') {
    this.client.log.push({ action: 'select', table: this.table, fields })
    return this
  }
  insert(data) {
    this.insertedData = data
    this.client.log.push({ action: 'insert', table: this.table, data })
    return this
  }
  update(data) {
    this.updatedData = data
    this.client.log.push({ action: 'update', table: this.table, data })
    return this
  }
  delete() {
    this.client.log.push({ action: 'delete', table: this.table })
    return this
  }
  eq(field, value) {
    this.filters[field] = value
    this.client.log.push({ action: 'eq', table: this.table, field, value })
    return this
  }
  maybeSingle() {
    this.client.log.push({ action: 'maybeSingle', table: this.table })
    return Promise.resolve(this.client.resolveSingle(this.table, this.insertedData || this.updatedData, this.filters))
  }
  single() {
    this.client.log.push({ action: 'single', table: this.table })
    return Promise.resolve(this.client.resolveSingle(this.table, this.insertedData || this.updatedData, this.filters))
  }
  then(resolve, reject) {
    const isDelete = this.client.log.some(l => l.table === this.table && l.action === 'delete')
    if (isDelete) {
      resolve({ data: [], error: null })
      return
    }
    Promise.resolve(this.client.resolveMultiple(this.table, this.insertedData || this.updatedData, this.filters))
      .then(resolve, reject)
  }
}

export class MockDbClient {
  constructor() {
    this.log = []
    this.responses = {
      documenti_import: null,
      stampe_definitive: [],
      prima_nota: { id: 'prima_nota-id' },
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

export function makeValidCommitPayload() {
  const innerPayload = {
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
      direction: 'acquisto',
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
      }
    },
    accounting: {
      causaleContabile: {
        id: 'caus-ff',
        codice: 'FF',
        description: 'Fattura passiva',
        tipoCausale: 'docivanormale',
        isDocumentoIva: true,
        gestionePartitario: 'apertura',
        segnoRegistroIva: '+',
      },
      description: 'Fattura passiva n. 123',
      isBalanced: true,
      totals: {
        debit: 122.00,
        credit: 122.00,
      },
      rows: [
        { rowNumber: 1, accountId: 'acc-cost', accountCode: '6.01.001', accountDescription: 'Costo', debit: 100.00, credit: 0.00, dare: 100.00, avere: 0.00, description: 'Costo' },
        { rowNumber: 2, accountId: 'acc-iva', accountCode: '22.01', accountDescription: 'IVA c/acquisti', debit: 22.00, credit: 0.00, dare: 22.00, avere: 0.00, description: 'IVA' },
        { rowNumber: 3, accountId: 'acc-supplier', accountCode: '2.03.08.001', accountDescription: 'Fornitore', debit: 0.00, credit: 122.00, dare: 0.00, avere: 122.00, description: 'Debito Fornitore' },
      ],
    },
    vat: {
      enabled: true,
      registerType: 'acquisti',
      competencePeriod: '2026-04',
      rows: [
        {
          rowNumber: 1,
          imponibile: 100.00,
          imposta: 22.00,
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
          amount: 122.00,
          dueDate: '2026-05-30',
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

  return {
    societaId: 'soc-123',
    registrationDate: '2026-04-30',
    sourceRow: {
      id: 'doc-import-123',
      filename: 'invoice.xml',
    },
    payload: innerPayload,
    classification: {
      code: 'TD01',
      label: 'Fattura passiva',
      managed: true,
    },
    readiness: {
      status: 'confermata',
      label: 'Pronto per contabilità',
    }
  }
}

test('runCommitWorkflow: payload valido ordinario', async () => {
  const db = new MockDbClient()
  const payload = makeValidCommitPayload()
  
  const res = await runCommitWorkflow(payload, { db })
  assert.equal(res.success, true)
  assert.equal(res.primaNotaId, 'prima_nota-id')
  assert.equal(res.documentoId, 'doc-import-123')
  assert.equal(res.status, 'processed')
  
  const updates = db.log.filter(l => l.action === 'update' && l.table === 'documenti_import')
  assert.equal(updates.length, 1)
  assert.equal(updates[0].data.stato, 'processed')
})

test('runCommitWorkflow: payload non valido per validatore canonico', async () => {
  const db = new MockDbClient()
  const payload = makeValidCommitPayload()
  // Rendi sbilanciata la PN per fallire validazione canonica
  payload.payload.accounting.rows[0].debit = 999.00

  const res = await runCommitWorkflow(payload, { db })
  assert.equal(res.success, false)
  assert.ok(res.blockingReasons.length > 0)
  
  // Nessuna scrittura DB avvenuta
  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts.length, 0)
})

test('runCommitWorkflow: periodo stampato definitivo consolidato', async () => {
  const db = new MockDbClient()
  // Imposta stampa definitiva valida sul periodo del documento
  db.responses.stampe_definitive = [
    {
      tipo_stampa: 'libro_giornale',
      periodo_inizio: '2026-04-01',
      periodo_fine: '2026-04-30',
      stato: 'valida',
      societa_id: 'soc-123'
    }
  ]
  const payload = makeValidCommitPayload()

  const res = await runCommitWorkflow(payload, { db })
  assert.equal(res.success, false)
  assert.ok(res.blockingReasons[0].includes('Periodo stampato definitivo'))
  
  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts.length, 0)
})

test('runCommitWorkflow: documento già contabilizzato in staging', async () => {
  const db = new MockDbClient()
  db.responses.documenti_import = { stato: 'processed' }
  const payload = makeValidCommitPayload()

  const res = await runCommitWorkflow(payload, { db })
  assert.equal(res.success, false)
  assert.ok(res.blockingReasons[0].includes('già contabilizzato'))
  
  const inserts = db.log.filter(l => l.action === 'insert')
  assert.equal(inserts.length, 0)
})

test('runCommitWorkflow: fallimento update stato non causa rollback logico (staging accessorio)', async () => {
  const db = new MockDbClient()
  // Mock query builder eq and single/maybeSingle responses to simulate update error
  const originalFrom = db.from;
  db.from = function(table) {
    const query = originalFrom.call(db, table);
    if (table === 'documenti_import') {
      query.then = (resolve, reject) => {
        if (query.updatedData) {
          resolve({ data: null, error: new Error('Simulated update error') })
        } else {
          resolve({ data: null, error: null })
        }
      }
    }
    return query;
  }
  const payload = makeValidCommitPayload()

  const res = await runCommitWorkflow(payload, { db })
  assert.equal(res.success, true)
  assert.ok(res.warnings.some(w => w.includes('Aggiornamento staging import non eseguito')))
  
  // Controlla che NON ci sia rollback logico (nessun delete della prima nota creata)
  const hasPnDelete = db.log.some(l => l.table === 'prima_nota' && l.action === 'delete')
  assert.equal(hasPnDelete, false)
})

import { sb } from '../../../lib/supabase.js'
import { loadImportContabilitaDedupCandidatesBySocieta } from '../data/importContabilitaRepo.js'

test('loadImportContabilitaDedupCandidatesBySocieta: select documenti_import usa solo colonne fisiche reali (schema audit Prompt n.11)', async () => {
  const originalFrom = sb.from
  const queries = []
  
  sb.from = (table) => {
    const query = {
      select: (fields) => {
        queries.push({ action: 'select', table, fields })
        return query
      },
      eq: (field, val) => {
        queries.push({ action: 'eq', table, field, val })
        return query
      },
      order: (field, opts) => {
        queries.push({ action: 'order', table, field, opts })
        return query
      },
      range: (from, to) => {
        queries.push({ action: 'range', table, from, to })
        return query
      },
      then: (resolve, reject) => {
        resolve({ data: [{ id: '1' }], error: null })
      }
    }
    return query
  }

  try {
    const res = await loadImportContabilitaDedupCandidatesBySocieta('soc-123')
    assert.ok(res.stagingRows)
    assert.ok(res.accountingRows)
    
    // ── Verifica tenant-safe: solo societa corretta ──────────────────────────
    const eqQueries = queries.filter(q => q.action === 'eq')
    assert.ok(eqQueries.length > 0, 'Deve filtrare per societa')
    assert.ok(eqQueries.every(q => q.val === 'soc-123'), 'Tutti i filtri devono usare soc-123')
    
    // ── Verifica range con limit 500 ─────────────────────────────────────────
    const rangeQueries = queries.filter(q => q.action === 'range')
    assert.equal(rangeQueries.length, 2, 'Deve usare range su entrambe le tabelle')
    assert.deepEqual(rangeQueries[0], { action: 'range', table: 'documenti_import', from: 0, to: 499 })
    assert.deepEqual(rangeQueries[1], { action: 'range', table: 'documenti_contabilita', from: 0, to: 499 })

    // ── SCHEMA AUDIT documenti_import ────────────────────────────────────────
    // Schema fisico (migration 20260412090500): id, societa_id, societa_destinazione_id,
    // filename, file_path, file_url, mime_type, file_size, tipo_documento, stato,
    // metadata, created_at, updated_at + colonne access-scope.
    // COLONNE NON ESISTENTI: numero_documento, data_documento, imponibile, iva, totale.
    // I dati dedup stanno in ai_raw_response (JSONB).
    const stagingSelect = queries.find(q => q.action === 'select' && q.table === 'documenti_import')
    assert.ok(stagingSelect, 'Deve esistere una select su documenti_import')
    
    // ai_raw_response DEVE esserci: contiene numero/data/tipo/soggetto per la dedup
    assert.ok(
      stagingSelect.fields.includes('ai_raw_response'),
      'ai_raw_response deve essere nel select di documenti_import (unica fonte di numero/data/soggetto)'
    )
    
    // Colonne fisicamente inesistenti NON devono apparire
    const inexistentColumns = ['numero_documento', 'data_documento', 'totale', 'imponibile', 'iva']
    for (const col of inexistentColumns) {
      assert.ok(
        !stagingSelect.fields.includes(col),
        `documenti_import.${col} NON esiste come colonna fisica — non deve essere nel select`
      )
    }

    // ── SCHEMA AUDIT documenti_contabilita ───────────────────────────────────
    // Schema fisico (migration 20260412090000): ha numero_documento, data_documento,
    // tipo_documento, soggetto_*, validation_status, workflow_status, totale, ecc.
    const accountingSelect = queries.find(q => q.action === 'select' && q.table === 'documenti_contabilita')
    assert.ok(accountingSelect, 'Deve esistere una select su documenti_contabilita')
    // numero_documento esiste fisicamente in documenti_contabilita
    assert.ok(
      accountingSelect.fields.includes('numero_documento'),
      'numero_documento deve essere nel select di documenti_contabilita (esiste fisicamente)'
    )
  } finally {
    sb.from = originalFrom
  }
})

test('workflow: import massivo simulato con 200 file XML - nessuna query DB massiva', async () => {
  const makeXml = (i) => `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-01-${String((i % 28) + 1).padStart(2, '0')}</Data><Numero>FPA-${i}</Numero><ImportoTotaleDocumento>${100 + i}.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore ${i}</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>${100 + i}.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const files = Array.from({ length: 200 }, (_, i) => ({
    name: `fattura-${i}.xml`,
    text: async () => makeXml(i),
  }))

  // Pass dedupCandidates to avoid any DB call
  const res = await runImportWorkflow(files, {
    batchId: 'batch-massivo-test',
    dedupCandidates: { stagingRows: [], accountingRows: [] },
  })

  assert.equal(res.ok, true)
  assert.equal(res.parsedDocs.length, 200)
  // All 200 files should be importable (no dedup candidates)
  assert.equal(res.stagingRows.length, 200)
  assert.equal(res.report.totals.files, 200)
  assert.equal(res.report.totals.imported, 200)
  assert.equal(res.report.uploadedFilesCount, 200)
})


