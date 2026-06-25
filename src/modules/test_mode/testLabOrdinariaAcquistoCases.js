/**
 * Fase 24B — 10 casi fattura ordinaria acquisto per Test Lab (solo Prepara test).
 */

import { assertDemoCompanyForTestLab } from './demoCompanyGuard.js'
import { resolveSocietaDisplayName } from './societaTestLabSchema.js'

export const TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO = 'ordinarie_acquisto_24b'
export const TEST_LAB_SOURCE = 'test_lab'
export const TEST_LAB_MARKER = '[TEST_LAB]'

/** P.IVA usata per simulare fornitore già noto in anagrafica (case 09). */
export const TEST_LAB_FORNITORE_ESISTENTE_PIVA = '11111111111'

function round2(n) {
  return Math.round(Number(n) * 100) / 100
}

function buildXml({
  numero,
  data,
  cedentePiva,
  cedenteDenom,
  cedenteCf = '',
  cessionarioPiva,
  cessionarioDenom,
  linee = [],
  riepiloghi = [],
  bollo = null,
  totaleDocumento = null,
}) {
  const lineeXml = linee
    .map(
      (l, idx) => `
      <DettaglioLinee>
        <NumeroLinea>${idx + 1}</NumeroLinea>
        <Descrizione>${l.descrizione || 'Servizio test'}</Descrizione>
        <Quantita>${(l.quantita ?? 1).toFixed(2)}</Quantita>
        <PrezzoUnitario>${Number(l.prezzoUnitario).toFixed(2)}</PrezzoUnitario>
        <PrezzoTotale>${Number(l.prezzoTotale).toFixed(2)}</PrezzoTotale>
        <AliquotaIVA>${Number(l.aliquota).toFixed(2)}</AliquotaIVA>
      </DettaglioLinee>`
    )
    .join('')

  const riepilogoXml = riepiloghi
    .map(
      (r) => `
      <DatiRiepilogo>
        <AliquotaIVA>${Number(r.aliquota).toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${Number(r.imponibile).toFixed(2)}</ImponibileImporto>
        <Imposta>${Number(r.imposta).toFixed(2)}</Imposta>
      </DatiRiepilogo>`
    )
    .join('')

  const bolloXml = bollo
    ? `
      <DatiBollo>
        <BolloVirtuale>SI</BolloVirtuale>
        <ImportoBollo>${Number(bollo).toFixed(2)}</ImportoBollo>
      </DatiBollo>`
    : ''

  const totale =
    totaleDocumento != null
      ? Number(totaleDocumento)
      : riepiloghi.reduce((s, r) => s + Number(r.imponibile) + Number(r.imposta), 0) + (bollo || 0)

  const cfXml = cedenteCf
    ? `<CodiceFiscale>${cedenteCf}</CodiceFiscale>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/pdf/fisconet/v1.2">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cedentePiva}</IdCodice></IdFiscaleIVA>
        ${cfXml}
        <Anagrafica><Denominazione>${cedenteDenom}</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${cessionarioPiva}</IdCodice></IdFiscaleIVA>
        <Anagrafica><Denominazione>${cessionarioDenom}</Denominazione></Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>TD01</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${data}</Data>
        <Numero>${numero}</Numero>
        ${bolloXml}
        <ImportoTotaleDocumento>${totale.toFixed(2)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      ${lineeXml}
      ${riepilogoXml}
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`
}

function toFileLike(caseDef, xml) {
  return {
    caseId: caseDef.caseId,
    label: caseDef.label,
    scenario: TEST_LAB_SCENARIO_ORDINARIA_ACQUISTO,
    source: TEST_LAB_SOURCE,
    testLabMarker: TEST_LAB_MARKER,
    name: caseDef.filename,
    size: xml.length,
    text: async () => xml,
    meta: caseDef.meta,
  }
}

/**
 * Definizione dei 10 casi obbligatori — fattura ordinaria acquisto.
 * @param {object} societa
 * @returns {Array<object>}
 */
export function buildOrdinariaAcquisto10CaseDefinitions(societa) {
  assertDemoCompanyForTestLab(societa, 'buildOrdinariaAcquisto10CaseDefinitions')
  const myPiva = societa.partita_iva || '99999999999'
  const myDenom = resolveSocietaDisplayName(societa)
  const today = new Date().toISOString().split('T')[0]

  const baseMeta = {
    causaleSuggerita: 'FF',
    contoSuggerito: '6.01.001',
    dataDocumento: today,
    tipoDocumento: 'TD01',
    direction: 'acquisto',
  }

  return [
    {
      caseId: 'acq_01',
      filename: 'test_lab_acq_01_monoriga_22.xml',
      label: 'Monoriga IVA 22%',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Demo 22 S.r.l.',
        partitaIva: '22222222222',
        codiceFiscale: '',
        numeroDocumento: 'TL-ACQ-01',
        imponibile: 1000,
        iva: 220,
        totale: 1220,
        aliquota: 22,
        fornitoreEsistente: false,
        contoSuggerito: '6.01.001',
      },
      build: () => {
        const imp = 1000
        const iva = 220
        return buildXml({
          numero: 'TL-ACQ-01',
          data: today,
          cedentePiva: '22222222222',
          cedenteDenom: 'Fornitore Demo 22 S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Monoriga 22%`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 22 }],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
        })
      },
    },
    {
      caseId: 'acq_02',
      filename: 'test_lab_acq_02_monoriga_10.xml',
      label: 'Monoriga IVA 10%',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Demo 10 S.r.l.',
        partitaIva: '22222222223',
        numeroDocumento: 'TL-ACQ-02',
        imponibile: 500,
        iva: 50,
        totale: 550,
        aliquota: 10,
        fornitoreEsistente: false,
        contoSuggerito: '6.02.001',
      },
      build: () => {
        const imp = 500
        const iva = 50
        return buildXml({
          numero: 'TL-ACQ-02',
          data: today,
          cedentePiva: '22222222223',
          cedenteDenom: 'Fornitore Demo 10 S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Monoriga 10%`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 10 }],
          riepiloghi: [{ imponibile: imp, aliquota: 10, imposta: iva }],
        })
      },
    },
    {
      caseId: 'acq_03',
      filename: 'test_lab_acq_03_monoriga_04.xml',
      label: 'Monoriga IVA 4%',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Demo 04 S.r.l.',
        partitaIva: '22222222224',
        numeroDocumento: 'TL-ACQ-03',
        imponibile: 250,
        iva: 10,
        totale: 260,
        aliquota: 4,
        fornitoreEsistente: false,
        contoSuggerito: '6.03.001',
      },
      build: () => {
        const imp = 250
        const iva = 10
        return buildXml({
          numero: 'TL-ACQ-03',
          data: today,
          cedentePiva: '22222222224',
          cedenteDenom: 'Fornitore Demo 04 S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Monoriga 4%`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 4 }],
          riepiloghi: [{ imponibile: imp, aliquota: 4, imposta: iva }],
        })
      },
    },
    {
      caseId: 'acq_04',
      filename: 'test_lab_acq_04_multiriga_stesso_conto.xml',
      label: 'Multi-riga stesso conto costo',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Multi Riga S.r.l.',
        partitaIva: '22222222225',
        numeroDocumento: 'TL-ACQ-04',
        imponibile: 800,
        iva: 176,
        totale: 976,
        aliquota: 22,
        righeCosto: 2,
        fornitoreEsistente: false,
        contoSuggerito: '6.01.001',
        note: 'Due righe imputabili allo stesso conto costo',
      },
      build: () => {
        const l1 = 300
        const l2 = 500
        const imp = l1 + l2
        const iva = round2(imp * 0.22)
        return buildXml({
          numero: 'TL-ACQ-04',
          data: today,
          cedentePiva: '22222222225',
          cedenteDenom: 'Fornitore Multi Riga S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [
            { descrizione: `${TEST_LAB_MARKER} Riga A stesso conto`, prezzoUnitario: l1, prezzoTotale: l1, aliquota: 22 },
            { descrizione: `${TEST_LAB_MARKER} Riga B stesso conto`, prezzoUnitario: l2, prezzoTotale: l2, aliquota: 22 },
          ],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
        })
      },
    },
    {
      caseId: 'acq_05',
      filename: 'test_lab_acq_05_due_conti_costo.xml',
      label: 'Due conti costo diversi',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Doppio Conto S.r.l.',
        partitaIva: '22222222226',
        numeroDocumento: 'TL-ACQ-05',
        imponibile: 600,
        iva: 132,
        totale: 732,
        aliquota: 22,
        contoSuggerito: '6.01.001',
        contoSuggeritoSecondario: '6.05.001',
        fornitoreEsistente: false,
        note: 'Riga A → 6.01.001, Riga B → 6.05.001',
      },
      build: () => {
        const l1 = 200
        const l2 = 400
        const imp = l1 + l2
        const iva = round2(imp * 0.22)
        return buildXml({
          numero: 'TL-ACQ-05',
          data: today,
          cedentePiva: '22222222226',
          cedenteDenom: 'Fornitore Doppio Conto S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [
            { descrizione: `${TEST_LAB_MARKER} Costo materie`, prezzoUnitario: l1, prezzoTotale: l1, aliquota: 22 },
            { descrizione: `${TEST_LAB_MARKER} Costo servizi`, prezzoUnitario: l2, prezzoTotale: l2, aliquota: 22 },
          ],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
        })
      },
    },
    {
      caseId: 'acq_06',
      filename: 'test_lab_acq_06_multi_aliquota.xml',
      label: 'Multi-aliquota 4/10/22',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Multi Aliquota S.r.l.',
        partitaIva: '22222222227',
        numeroDocumento: 'TL-ACQ-06',
        imponibile: 600,
        iva: 86,
        totale: 686,
        fornitoreEsistente: false,
        contoSuggerito: '6.01.001',
        aliquote: [4, 10, 22],
      },
      build: () => {
        const r1 = { imponibile: 100, aliquota: 4, imposta: 4 }
        const r2 = { imponibile: 200, aliquota: 10, imposta: 20 }
        const r3 = { imponibile: 300, aliquota: 22, imposta: 66 }
        const imp = r1.imponibile + r2.imponibile + r3.imponibile
        const iva = r1.imposta + r2.imposta + r3.imposta
        return buildXml({
          numero: 'TL-ACQ-06',
          data: today,
          cedentePiva: '22222222227',
          cedenteDenom: 'Fornitore Multi Aliquota S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [
            { descrizione: `${TEST_LAB_MARKER} Aliquota 4%`, prezzoUnitario: r1.imponibile, prezzoTotale: r1.imponibile, aliquota: 4 },
            { descrizione: `${TEST_LAB_MARKER} Aliquota 10%`, prezzoUnitario: r2.imponibile, prezzoTotale: r2.imponibile, aliquota: 10 },
            { descrizione: `${TEST_LAB_MARKER} Aliquota 22%`, prezzoUnitario: r3.imponibile, prezzoTotale: r3.imponibile, aliquota: 22 },
          ],
          riepiloghi: [r1, r2, r3],
          totaleDocumento: imp + iva,
        })
      },
    },
    {
      caseId: 'acq_07',
      filename: 'test_lab_acq_07_bollo.xml',
      label: 'Fattura con bollo',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Con Bollo S.r.l.',
        partitaIva: '22222222228',
        numeroDocumento: 'TL-ACQ-07',
        imponibile: 400,
        iva: 88,
        totale: 490,
        bollo: 2,
        fornitoreEsistente: false,
        contoSuggerito: '6.01.001',
      },
      build: () => {
        const imp = 400
        const iva = 88
        const bollo = 2
        return buildXml({
          numero: 'TL-ACQ-07',
          data: today,
          cedentePiva: '22222222228',
          cedenteDenom: 'Fornitore Con Bollo S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          bollo,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Con bollo`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 22 }],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
          totaleDocumento: imp + iva + bollo,
        })
      },
    },
    {
      caseId: 'acq_08',
      filename: 'test_lab_acq_08_arrotondamento.xml',
      label: 'Arrotondamento centesimale',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Arrotondamento S.r.l.',
        partitaIva: '22222222229',
        numeroDocumento: 'TL-ACQ-08',
        imponibile: 333.33,
        iva: 73.33,
        totale: 406.66,
        fornitoreEsistente: false,
        contoSuggerito: '6.01.001',
        note: 'Totale con centesimi non tondi',
      },
      build: () => {
        const imp = 333.33
        const iva = 73.33
        return buildXml({
          numero: 'TL-ACQ-08',
          data: today,
          cedentePiva: '22222222229',
          cedenteDenom: 'Fornitore Arrotondamento S.r.l.',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Arrotondamento`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 22 }],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
          totaleDocumento: 406.66,
        })
      },
    },
    {
      caseId: 'acq_09',
      filename: 'test_lab_acq_09_fornitore_esistente.xml',
      label: 'Fornitore già esistente',
      meta: {
        ...baseMeta,
        fornitore: 'Fornitore Anagrafica Esistente S.r.l.',
        partitaIva: TEST_LAB_FORNITORE_ESISTENTE_PIVA,
        codiceFiscale: '11111111111',
        numeroDocumento: 'TL-ACQ-09',
        imponibile: 150,
        iva: 33,
        totale: 183,
        fornitoreEsistente: true,
        contoSuggerito: '6.01.001',
      },
      build: () => {
        const imp = 150
        const iva = 33
        return buildXml({
          numero: 'TL-ACQ-09',
          data: today,
          cedentePiva: TEST_LAB_FORNITORE_ESISTENTE_PIVA,
          cedenteDenom: 'Fornitore Anagrafica Esistente S.r.l.',
          cedenteCf: '11111111111',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Fornitore esistente`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 22 }],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
        })
      },
    },
    {
      caseId: 'acq_10',
      filename: 'test_lab_acq_10_fornitore_nuovo.xml',
      label: 'Fornitore nuovo da verificare',
      meta: {
        ...baseMeta,
        fornitore: 'Nuovo Fornitore Da Verificare S.r.l.',
        partitaIva: '98765432109',
        codiceFiscale: '98765432109',
        numeroDocumento: 'TL-ACQ-10',
        imponibile: 275,
        iva: 60.5,
        totale: 335.5,
        fornitoreEsistente: false,
        anagraficaDaVerificare: true,
        contoSuggerito: '6.01.001',
      },
      build: () => {
        const imp = 275
        const iva = 60.5
        return buildXml({
          numero: 'TL-ACQ-10',
          data: today,
          cedentePiva: '98765432109',
          cedenteDenom: 'Nuovo Fornitore Da Verificare S.r.l.',
          cedenteCf: '98765432109',
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          linee: [{ descrizione: `${TEST_LAB_MARKER} Fornitore nuovo`, prezzoUnitario: imp, prezzoTotale: imp, aliquota: 22 }],
          riepiloghi: [{ imponibile: imp, aliquota: 22, imposta: iva }],
        })
      },
    },
  ]
}

/**
 * Genera i 10 file XML con metadati test_lab.
 * @param {object} societa
 */
export function generateOrdinariaAcquisto10Cases(societa) {
  const defs = buildOrdinariaAcquisto10CaseDefinitions(societa)
  return defs.map((def) => {
    const xml = def.build()
    return toFileLike(def, xml)
  })
}
