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

test('commit workflow stub', async () => {
  await assert.rejects(() => runCommitWorkflow(), /Commit workflow not implemented yet/)
})
