import test from 'node:test'
import assert from 'node:assert/strict'

import { parseFatturaXml } from '../application/importContabilitaParser.js'

function pickSummary(parsed) {
  return {
    tipoDocumento: parsed.tipoDocumento,
    dataDocumento: parsed.dataDocumento,
    numeroDocumento: parsed.numeroDocumento,
    fornitore: parsed.fornitore,
    cliente: parsed.cliente,
    imponibile: parsed.imponibile,
    iva: parsed.iva,
    totale: parsed.totale,
    lineeDocumento: parsed.lineeDocumento,
    ivaRows: parsed.ivaRows,
    flags: parsed.flags,
    warnings: parsed.warnings,
    errors: parsed.errors,
  }
}

test('XML TD01 passivo semplice', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <p:FatturaElettronica xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-13</Data>
          <Numero>QA-2026-001</Numero>
          <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Fornitore QA Sprint 1 Srl</Denominazione></Anagrafica>
          <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>01378570350</IdCodice></IdFiscaleIVA>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente QA FiscoSim Srl</Denominazione></Anagrafica>
          <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678901</IdCodice></IdFiscaleIVA>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>100.00</ImponibileImporto>
          <Imposta>22.00</Imposta>
          <EsigibilitaIVA>I</EsigibilitaIVA>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </p:FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'simple.xml' }))

  assert.equal(parsed.tipoDocumento, 'TD01')
  assert.equal(parsed.dataDocumento, '2026-04-13')
  assert.equal(parsed.numeroDocumento, 'QA-2026-001')
  assert.equal(parsed.fornitore?.denominazione, 'Fornitore QA Sprint 1 Srl')
  assert.equal(parsed.cliente?.denominazione, 'Cliente QA FiscoSim Srl')
  assert.equal(parsed.imponibile, 100)
  assert.equal(parsed.iva, 22)
  assert.equal(parsed.totale, 122)
  assert.equal(parsed.ivaRows.length, 1)
  assert.equal(parsed.ivaRows[0].aliquota, 22)
  assert.equal(parsed.ivaRows[0].imponibile, 100)
  assert.equal(parsed.ivaRows[0].imposta, 22)
  assert.equal(Array.isArray(parsed.lineeDocumento), true)
  assert.equal(parsed.errors.length, 0)
})

test('XML con CDATA in nome, cognome e denominazione', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>CDATA-1</Numero>
          <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>04737171001</IdCodice>
          </IdFiscaleIVA>
          <CodiceFiscale>FRNSFN67L11F127P</CodiceFiscale>
          <Anagrafica>
            <Nome><![CDATA[STEFANO]]></Nome>
            <Cognome><![CDATA[FIORENTINO]]></Cognome>
          </Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica>
            <Denominazione><![CDATA[Cliente CDATA Srl]]></Denominazione>
          </Anagrafica>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>12345678901</IdCodice>
          </IdFiscaleIVA>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>100.00</ImponibileImporto>
          <Imposta>22.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'cdata.xml' }))

  assert.equal(parsed.fornitore?.denominazione, 'STEFANO FIORENTINO')
  assert.equal(parsed.fornitore?.partitaIva, '04737171001')
  assert.equal(parsed.fornitore?.codiceFiscale, 'FRNSFN67L11F127P')
  assert.equal(parsed.cliente?.denominazione, 'Cliente CDATA Srl')
})

test('XML con denominazione fornitore in CDATA', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>DEN-CDATA-1</Numero>
          <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>03038290171</IdCodice>
          </IdFiscaleIVA>
          <Anagrafica>
            <Denominazione><![CDATA[DAC Spa]]></Denominazione>
          </Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>100.00</ImponibileImporto>
          <Imposta>22.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'denom-cdata-fornitore.xml' }))

  assert.equal(parsed.fornitore?.denominazione, 'DAC Spa')
  assert.equal(parsed.fornitore?.partitaIva, '03038290171')
})

test('XML con denominazione cliente in CDATA', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>DEN-CDATA-2</Numero>
          <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica>
            <Denominazione><![CDATA[SIRIA S.R.L.]]></Denominazione>
          </Anagrafica>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>12345678901</IdCodice>
          </IdFiscaleIVA>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>100.00</ImponibileImporto>
          <Imposta>22.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'denom-cdata-cliente.xml' }))

  assert.equal(parsed.cliente?.denominazione, 'SIRIA S.R.L.')
  assert.equal(parsed.cliente?.partitaIva, '12345678901')
})

test('XML con tag Denominazione corrotto ma testo recuperabile', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>CORRUPTED-TAG-1</Numero>
          <ImportoTotaleDocumento>64.50</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>03038290171</IdCodice>
          </IdFiscaleIVA>
          <Anagrafica>
            <Denominaz\u0004\u0003ione>DAC Spa</Denominazione>
          </Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>52.50</ImponibileImporto>
          <Imposta>12.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'corrupted-tag.xml' }))

  assert.equal(parsed.fornitore?.denominazione, 'DAC Spa')
  assert.equal(parsed.fornitore?.partitaIva, '03038290171')
})

test('XML con fornitore presente ma denominazione mancante', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>MISSING-DENOM-1</Numero>
          <ImportoTotaleDocumento>64.50</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>03038290171</IdCodice>
          </IdFiscaleIVA>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>52.50</ImponibileImporto>
          <Imposta>12.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'missing-denominazione.xml' }))
  const warningCodes = parsed.warnings.map((issue) => issue.code)

  assert.equal(parsed.fornitore?.partitaIva, '03038290171')
  assert.equal(parsed.fornitore?.denominazione, '')
  assert.ok(warningCodes.includes('fornitore_denominazione_missing'))
})

test('XML con cliente presente ma denominazione mancante', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>MISSING-CLIENTE-1</Numero>
          <ImportoTotaleDocumento>64.50</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>12345678901</IdCodice>
          </IdFiscaleIVA>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>52.50</ImponibileImporto>
          <Imposta>12.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'missing-cliente.xml' }))
  const warningCodes = parsed.warnings.map((issue) => issue.code)

  assert.equal(parsed.cliente?.partitaIva, '12345678901')
  assert.equal(parsed.cliente?.denominazione, '')
  assert.ok(warningCodes.includes('cliente_denominazione_missing'))
})

test('XML con denominazione in Anagrafica per fornitore e cliente', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>ANAG-1</Numero>
          <ImportoTotaleDocumento>122.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>03038290171</IdCodice>
          </IdFiscaleIVA>
          <CodiceFiscale>03038290171</CodiceFiscale>
          <Anagrafica>
            <Denominazione> DAC   Spa </Denominazione>
          </Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica>
            <Nome>Mario</Nome>
            <Cognome>Rossi</Cognome>
          </Anagrafica>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>12345678901</IdCodice>
          </IdFiscaleIVA>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>100.00</ImponibileImporto>
          <Imposta>22.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'anagrafica.xml' }))

  assert.equal(parsed.fornitore?.denominazione, 'DAC Spa')
  assert.equal(parsed.fornitore?.partitaIva, '03038290171')
  assert.equal(parsed.fornitore?.codiceFiscale, '03038290171')
  assert.equal(parsed.cliente?.denominazione, 'Mario Rossi')
  assert.equal(parsed.cliente?.partitaIva, '12345678901')
})

test('XML con anagrafica persona fisica', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD06</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>PF-1</Numero>
          <ImportoTotaleDocumento>50.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <Anagrafica>
            <Nome>Giulia</Nome>
            <Cognome>Bianchi</Cognome>
          </Anagrafica>
          <CodiceFiscale>BNCGLL80A41H501Z</CodiceFiscale>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>0.00</AliquotaIVA>
          <ImponibileImporto>50.00</ImponibileImporto>
          <Imposta>0.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'persona-fisica.xml' }))

  assert.equal(parsed.fornitore?.denominazione, 'Giulia Bianchi')
  assert.equal(parsed.fornitore?.codiceFiscale, 'BNCGLL80A41H501Z')
})

test('XML problematico con denominazione in Anagrafica', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-24</Data>
          <Numero>AHM-CR-1</Numero>
          <ImportoTotaleDocumento>64.50</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <IdFiscaleIVA>
            <IdPaese>IT</IdPaese>
            <IdCodice>03038290171</IdCodice>
          </IdFiscaleIVA>
          <Anagrafica>
            <Denominazione>
              DAC Spa
            </Denominazione>
          </Anagrafica>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>22.00</AliquotaIVA>
          <ImponibileImporto>52.50</ImponibileImporto>
          <Imposta>12.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'IT02663950984_AhmCr.xml.p7m' }))

  assert.equal(parsed.fornitore?.denominazione, 'DAC Spa')
  assert.equal(parsed.fornitore?.partitaIva, '03038290171')
  assert.equal(parsed.fornitore?.codiceFiscale, '')
})

test('XML con una riga documento', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-24</Data><Numero>L-1</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi>
        <DatiDettaglioLinee>
          <NumeroLinea>1</NumeroLinea>
          <Descrizione>Servizio unico</Descrizione>
          <Quantita>2</Quantita>
          <PrezzoUnitario>50.00</PrezzoUnitario>
          <PrezzoTotale>100.00</PrezzoTotale>
          <AliquotaIVA>22.00</AliquotaIVA>
        </DatiDettaglioLinee>
        <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta></DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'linea.xml' }))
  assert.equal(parsed.lineeDocumento.length, 1)
  assert.equal(parsed.lineeDocumento[0].descrizione, 'Servizio unico')
  assert.equal(parsed.lineeDocumento[0].quantita, 2)
  assert.equal(parsed.lineeDocumento[0].prezzoUnitario, 50)
  assert.equal(parsed.lineeDocumento[0].prezzoTotale, 100)
  assert.equal(parsed.lineeDocumento[0].aliquotaIVA, 22)
})

test('XML con più righe documento e natura', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-24</Data><Numero>L-2</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi>
        <DatiDettaglioLinee>
          <NumeroLinea>1</NumeroLinea>
          <Descrizione>Prima riga</Descrizione>
          <Quantita>1</Quantita>
          <PrezzoUnitario>60.00</PrezzoUnitario>
          <PrezzoTotale>60.00</PrezzoTotale>
          <AliquotaIVA>22.00</AliquotaIVA>
        </DatiDettaglioLinee>
        <DatiDettaglioLinee>
          <NumeroLinea>2</NumeroLinea>
          <Descrizione>Seconda riga</Descrizione>
          <Quantita>2</Quantita>
          <PrezzoUnitario>30.00</PrezzoUnitario>
          <PrezzoTotale>60.00</PrezzoTotale>
          <AliquotaIVA>0.00</AliquotaIVA>
          <Natura>N6.1</Natura>
        </DatiDettaglioLinee>
        <DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>60.00</ImponibileImporto><Imposta>13.20</Imposta></DatiRiepilogo>
        <DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><ImponibileImporto>60.00</ImponibileImporto><Imposta>0.00</Imposta><Natura>N6.1</Natura></DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'linee-multiple.xml' }))
  assert.equal(parsed.lineeDocumento.length, 2)
  assert.equal(parsed.lineeDocumento[1].natura, 'N6.1')
  assert.equal(parsed.lineeDocumento[1].aliquotaIVA, 0)
})

test('XML con namespace ns3', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <ns3:FatturaElettronica xmlns:ns3="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2">
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-22</Data>
          <Numero>NS00058/686</Numero>
          <ImportoTotaleDocumento>100.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Fornitore SRL</Denominazione></Anagrafica>
          <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>12345678901</IdCodice></IdFiscaleIVA>
        </DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici>
          <Anagrafica><Denominazione>Cliente SPA</Denominazione></Anagrafica>
          <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>10987654321</IdCodice></IdFiscaleIVA>
        </DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>10.00</AliquotaIVA>
          <ImponibileImporto>90.00</ImponibileImporto>
          <Imposta>10.00</Imposta>
          <EsigibilitaIVA>S</EsigibilitaIVA>
        </DatiRiepilogo>
        <DatiRiepilogo>
          <AliquotaIVA>0.00</AliquotaIVA>
          <ImponibileImporto>0.00</ImponibileImporto>
          <Imposta>0.00</Imposta>
          <Natura>N6.1</Natura>
        </DatiRiepilogo>
      </DatiBeniServizi>
      <DatiRitenuta>
        <ImportoRitenuta>20.00</ImportoRitenuta>
      </DatiRitenuta>
    </FatturaElettronicaBody>
  </ns3:FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'ns3.xml' }))

  assert.equal(parsed.tipoDocumento, 'TD01')
  assert.equal(parsed.dataDocumento, '2026-04-22')
  assert.equal(parsed.numeroDocumento, 'NS00058/686')
  assert.equal(parsed.fornitore?.denominazione, 'Fornitore SRL')
  assert.equal(parsed.cliente?.denominazione, 'Cliente SPA')
  assert.equal(parsed.imponibile, 90)
  assert.equal(parsed.iva, 10)
  assert.equal(parsed.totale, 100)
  assert.equal(parsed.ivaRows.length, 2)
  assert.equal(parsed.flags.reverseCharge, true)
  assert.equal(parsed.flags.splitPayment, true)
  assert.equal(parsed.flags.hasRitenuta, true)
  assert.equal(parsed.flags.isProfessional, true)
  assert.equal(parsed.errors.length, 0)
})

test('XML multi aliquota', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD01</TipoDocumento>
          <Data>2026-04-21</Data>
          <Numero>ABC/1</Numero>
          <ImportoTotaleDocumento>110.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore>
        <DatiAnagrafici><Anagrafica><Denominazione>Fornitore SRL</Denominazione></Anagrafica></DatiAnagrafici>
      </CedentePrestatore>
      <CessionarioCommittente>
        <DatiAnagrafici><Anagrafica><Denominazione>Cliente SPA</Denominazione></Anagrafica></DatiAnagrafici>
      </CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>4.00</AliquotaIVA>
          <ImponibileImporto>40.00</ImponibileImporto>
          <Imposta>1.60</Imposta>
        </DatiRiepilogo>
        <DatiRiepilogo>
          <AliquotaIVA>10.00</AliquotaIVA>
          <ImponibileImporto>60.00</ImponibileImporto>
          <Imposta>6.00</Imposta>
        </DatiRiepilogo>
      </DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'multi.xml' }))

  assert.equal(parsed.ivaRows.length, 2)
  assert.equal(parsed.imponibile, 100)
  assert.equal(parsed.iva, 7.6)
  assert.equal(parsed.totale, 110)
})

test('XML con DatiRitenuta', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali>
        <DatiGeneraliDocumento>
          <TipoDocumento>TD06</TipoDocumento>
          <Data>2026-04-20</Data>
          <Numero>RIT-1</Numero>
          <ImportoTotaleDocumento>50.00</ImportoTotaleDocumento>
        </DatiGeneraliDocumento>
      </DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Professionista</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi>
        <DatiRiepilogo>
          <AliquotaIVA>0.00</AliquotaIVA>
          <ImponibileImporto>50.00</ImponibileImporto>
          <Imposta>0.00</Imposta>
          <Natura>N2.2</Natura>
        </DatiRiepilogo>
      </DatiBeniServizi>
      <DatiRitenuta>
        <ImportoRitenuta>10.00</ImportoRitenuta>
      </DatiRitenuta>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'ritenuta.xml' }))
  assert.equal(parsed.flags.hasRitenuta, true)
  assert.equal(parsed.flags.isProfessional, true)
})

test('XML con EsigibilitaIVA = S', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento><Data>2026-04-19</Data><Numero>S-1</Numero><ImportoTotaleDocumento>122.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>22.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>22.00</Imposta><EsigibilitaIVA>S</EsigibilitaIVA></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'split.xml' }))
  assert.equal(parsed.flags.splitPayment, true)
})

test('XML con Natura N6', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD17</TipoDocumento><Data>2026-04-18</Data><Numero>N6-1</Numero><ImportoTotaleDocumento>100.00</ImportoTotaleDocumento></DatiGeneraliDocumento></DatiGenerali>
      <CedentePrestatore><DatiAnagrafici><Anagrafica><Denominazione>Fornitore</Denominazione></Anagrafica></DatiAnagrafici></CedentePrestatore>
      <CessionarioCommittente><DatiAnagrafici><Anagrafica><Denominazione>Cliente</Denominazione></Anagrafica></DatiAnagrafici></CessionarioCommittente>
      <DatiBeniServizi><DatiRiepilogo><AliquotaIVA>0.00</AliquotaIVA><ImponibileImporto>100.00</ImponibileImporto><Imposta>0.00</Imposta><Natura>N6.1</Natura></DatiRiepilogo></DatiBeniServizi>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'n6.xml' }))
  assert.equal(parsed.flags.reverseCharge, true)
})

test('XML con campi obbligatori mancanti', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <FatturaElettronica>
    <FatturaElettronicaBody>
      <DatiGenerali><DatiGeneraliDocumento><TipoDocumento>TD01</TipoDocumento></DatiGeneraliDocumento></DatiGenerali>
    </FatturaElettronicaBody>
  </FatturaElettronica>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'missing.xml' }))
  assert.equal(parsed.tipoDocumento, 'TD01')
  assert.equal(parsed.dataDocumento, '')
  assert.equal(parsed.numeroDocumento, '')
  assert.ok(parsed.warnings.length > 0)
  assert.ok(parsed.errors.length === 0 || Array.isArray(parsed.errors))
})

test('XML non FatturaPA', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
  <Documento>
    <Testo>abc</Testo>
  </Documento>`

  const parsed = pickSummary(parseFatturaXml(xml, { filename: 'plain.xml' }))
  const errorCodes = parsed.errors.map((e) => e.code)
  assert.ok(errorCodes.includes('not_fatturapa') || errorCodes.includes('root_unexpected'))
})
