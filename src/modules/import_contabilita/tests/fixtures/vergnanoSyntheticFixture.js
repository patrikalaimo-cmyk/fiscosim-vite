export const TEST_VERGNANO_DOCUMENT_ID = '9539bde9-b325-4246-a20d-6c1b9408b48e'

export const TEST_VERGNANO_XML = `<?xml version="1.0" encoding="UTF-8"?>
<FatturaElettronica>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>2026-09-30</Data>
        <Numero>TEST-VERGNANO-001</Numero>
        <ImportoTotaleDocumento>421.00</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>99999999999</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>99999999999</CodiceFiscale>
        <Anagrafica>
          <Denominazione>Fornitore Caffe Test Srl</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>88888888888</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>Societa Acquirente Test Srl</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
    <DatiBeniServizi>
      <DatiRiepilogo>
        <AliquotaIVA>22.00</AliquotaIVA>
        <ImponibileImporto>300.00</ImponibileImporto>
        <Imposta>66.00</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
      <DatiRiepilogo>
        <AliquotaIVA>10.00</AliquotaIVA>
        <ImponibileImporto>50.00</ImponibileImporto>
        <Imposta>5.00</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>
      <DatiRiepilogo>
        <AliquotaIVA>0.00</AliquotaIVA>
        <ImponibileImporto>0.00</ImponibileImporto>
        <Imposta>0.00</Imposta>
      </DatiRiepilogo>
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</FatturaElettronica>`

export const TEST_VERGNANO_CAUSALI_IVA = Object.freeze([
  {
    id: 'test-iva-22-standard',
    codice: 'TEST-AF22',
    descrizione: 'Acquisti test 22%',
    aliquota: 22,
    is_default_per_aliquota: true,
    registro_iva: 'acquisti',
  },
  {
    id: 'test-iva-10-standard',
    codice: 'TEST-AF10',
    descrizione: 'Acquisti test 10%',
    aliquota: 10,
    is_default_per_aliquota: true,
    registro_iva: 'acquisti',
  },
  {
    id: 'test-iva-0-standard',
    codice: 'TEST-AF0',
    descrizione: 'Aliquota zero test',
    aliquota: 0,
    is_default_per_aliquota: true,
    registro_iva: 'acquisti',
  },
  {
    id: 'test-iva-22-manual',
    codice: 'TEST-MAN22',
    descrizione: 'Override manuale test 22%',
    aliquota: 22,
    is_default_per_aliquota: false,
    registro_iva: 'acquisti',
  },
])

export const TEST_VERGNANO_FIXTURE = Object.freeze({
  societaId: 'societa-import-test',
  operatorId: 'operatore-import-test',
  registrationDate: '2026-09-30',
  supplier: Object.freeze({
    denominazione: 'Fornitore Caffe Test Srl',
    partitaIva: '99999999999',
    codiceFiscale: '99999999999',
  }),
  sourceRow: Object.freeze({
    id: TEST_VERGNANO_DOCUMENT_ID,
    filename: 'TEST-VERGNANO-001.xml',
    tipo_documento: 'fattura_passiva',
    state: 'imported',
  }),
  parsedDocument: Object.freeze({
    tipoDocumento: 'TD01',
    numeroDocumento: 'TEST-VERGNANO-001',
    dataDocumento: '2026-09-30',
    imponibile: 350,
    iva: 71,
    totale: 421,
    rawXml: TEST_VERGNANO_XML,
    fornitore: Object.freeze({
      denominazione: 'Fornitore Caffe Test Srl',
      partitaIva: '99999999999',
      codiceFiscale: '99999999999',
    }),
    flags: Object.freeze({
      reverseCharge: false,
      splitPayment: false,
      hasRitenuta: false,
      isForeign: false,
      isProfessional: false,
    }),
    ivaRows: Object.freeze([
      Object.freeze({ aliquota: 22, imponibile: 300, imposta: 66, iva: 66 }),
      Object.freeze({ aliquota: 10, imponibile: 50, imposta: 5, iva: 5 }),
      Object.freeze({ aliquota: 0, imponibile: 0, imposta: 0, iva: 0 }),
    ]),
  }),
  accounts: Object.freeze({
    counterparty: Object.freeze({
      id: 'test-account-fornitore',
      codice: '2.03.08.9999',
      descrizione: 'Fornitore Caffe Test Srl',
      partitaIva: '99999999999',
      isFornitore: true,
    }),
    cost: Object.freeze({
      id: 'test-account-costo',
      codice: '6.01.01.9999',
      descrizione: 'Costo acquisti caffe test',
    }),
    vat: Object.freeze({
      id: 'test-account-iva',
      codice: '1.02.40.9999',
      descrizione: 'IVA acquisti test',
      isIva: true,
    }),
  }),
  causaleContabile: Object.freeze({
    id: 'test-causale-contabile-ff',
    codice: 'TEST-FF',
    descrizione: 'Fattura acquisto test',
    tipo_causale: 'docivanormale',
    registro_iva: 'acquisti',
  }),
  primaNotaRows: Object.freeze([
    Object.freeze({
      lineNo: 1,
      accountId: 'test-account-costo',
      description: 'Costo acquisti caffe test',
      debit: 350,
      credit: 0,
    }),
    Object.freeze({
      lineNo: 2,
      accountId: 'test-account-iva',
      description: 'IVA acquisti test',
      debit: 71,
      credit: 0,
    }),
    Object.freeze({
      lineNo: 3,
      accountId: 'test-account-fornitore',
      description: 'Debito fornitore test',
      debit: 0,
      credit: 421,
    }),
  ]),
})

export function buildTestVergnanoCausaliIvaById() {
  return new Map(TEST_VERGNANO_CAUSALI_IVA.map((row) => [row.id, row]))
}

export function buildTestVergnanoCommitInput(ivaDraftRows) {
  return {
    societaId: TEST_VERGNANO_FIXTURE.societaId,
    operatorId: TEST_VERGNANO_FIXTURE.operatorId,
    sourceRow: { ...TEST_VERGNANO_FIXTURE.sourceRow },
    sourceRowKey: TEST_VERGNANO_FIXTURE.sourceRow.id,
    sourceBatchId: 'batch-test-vergnano',
    parsedDocument: {
      ...TEST_VERGNANO_FIXTURE.parsedDocument,
      fornitore: { ...TEST_VERGNANO_FIXTURE.parsedDocument.fornitore },
      flags: { ...TEST_VERGNANO_FIXTURE.parsedDocument.flags },
      ivaRows: TEST_VERGNANO_FIXTURE.parsedDocument.ivaRows.map((row) => ({ ...row })),
    },
    registrationDate: TEST_VERGNANO_FIXTURE.registrationDate,
    counterpartyAccount: { ...TEST_VERGNANO_FIXTURE.accounts.counterparty },
    costRevenueAccount: { ...TEST_VERGNANO_FIXTURE.accounts.cost },
    causaleContabile: { ...TEST_VERGNANO_FIXTURE.causaleContabile },
    primaNotaDraftRows: TEST_VERGNANO_FIXTURE.primaNotaRows.map((row) => ({ ...row })),
    ivaDraftRows: Array.isArray(ivaDraftRows) ? ivaDraftRows.map((row) => ({ ...row })) : [],
    partitarioDraft: {
      enabled: true,
      type: 'fornitore',
      accountId: TEST_VERGNANO_FIXTURE.accounts.counterparty.id,
      amount: TEST_VERGNANO_FIXTURE.parsedDocument.totale,
      dueDate: '2026-10-30',
    },
    automationMeta: {},
    options: {
      vatPeriodicity: 'mensile',
      nowIso: '2026-10-06T12:00:00.000Z',
    },
  }
}
