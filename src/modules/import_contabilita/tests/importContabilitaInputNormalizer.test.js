import test from 'node:test'
import assert from 'node:assert/strict'

import AdmZip from 'adm-zip'

import { normalizeImportContabilitaInputFiles } from '../application/importContabilitaInputNormalizer.js'

function makeInvoiceXml(index) {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>ZIP-${index}</Numero>
          <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore ${index}</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente ${index}</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>100.00</ImponibileImporto>
          <Imposta>22.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`
}

test('normalizer: XML singolo invariato', async () => {
  const xml = makeInvoiceXml('SINGLE')
  const res = await normalizeImportContabilitaInputFiles([
    { name: 'singolo.xml', text: async () => xml },
  ])

  assert.equal(res.uploadedFilesCount, 1)
  assert.equal(res.extractedXmlCount, 1)
  assert.equal(res.discardedFilesCount, 0)
  assert.equal(res.preparedFiles.length, 1)
  assert.equal(await res.preparedFiles[0].text(), xml)
})

test('normalizer: P7M singolo -> 1 xml', async () => {
  const xml = makeInvoiceXml('P7M')
  const res = await normalizeImportContabilitaInputFiles([
    {
      name: 'fattura.p7m',
      arrayBuffer: async () => Buffer.from(`noise ${xml} trailing`, 'utf8'),
    },
  ])

  assert.equal(res.uploadedFilesCount, 1)
  assert.equal(res.extractedXmlCount, 1)
  assert.equal(res.discardedFilesCount, 0)
  assert.equal(res.preparedFiles.length, 1)
  assert.equal(res.preparedFiles[0].name, 'fattura.xml')
  assert.match(await res.preparedFiles[0].text(), /FatturaElettronica/)
})

test('normalizer: ZIP con 100 file -> 50 xml', async () => {
  const zip = new AdmZip()
  for (let index = 1; index <= 50; index += 1) {
    zip.addFile(`fatture/fattura-${index}.xml`, Buffer.from(makeInvoiceXml(index), 'utf8'))
    zip.addFile(`metadati/meta-${index}.txt`, Buffer.from(`sidecar-${index}`, 'utf8'))
  }

  const res = await normalizeImportContabilitaInputFiles([
    {
      name: 'bundle.zip',
      arrayBuffer: async () => zip.toBuffer(),
    },
  ])

  assert.equal(res.uploadedFilesCount, 1)
  assert.equal(res.extractedXmlCount, 50)
  assert.equal(res.discardedFilesCount, 50)
  assert.equal(res.preparedFiles.length, 50)
  assert.ok(res.discardedReasons.some((reason) => reason.count === 50))
  assert.ok(res.preparedFiles.every((file) => file.name.endsWith('.xml')))
})
