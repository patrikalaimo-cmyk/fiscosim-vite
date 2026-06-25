/**
 * Generatori di documenti XML per il Test Lab Contabile Reale.
 * Genera dati sintattici compatibili con il parser di FiscoSim.
 * Fase 24A: generatori presenti ma non invocabili dalla UI operativa.
 */

import { assertDemoCompanyForTestLab, isDemoCompany } from './demoCompanyGuard.js'

export { isDemoCompany, isDemoCompany as isTestCompany }

function generateXml({
  tipoDocumento = 'TD01',
  numero = '1',
  data = '2026-06-25',
  cedentePiva = '12345678901',
  cedenteDenom = 'Fornitore Test S.r.l.',
  cessionarioPiva = '98765432109',
  cessionarioDenom = 'Cliente Test S.p.A.',
  imponibile = 100.0,
  aliquota = 22,
  imposta = 22.0,
  totale = 122.0,
  esigibilita = null,
  ritenuta = null, // { aliquota, importo }
  bollo = null,
  cassa = null,
  natura = null,
  multiAliquota = null, // array di { imponibile, aliquota, imposta }
}) {
  let riepilogoXml = ''
  if (Array.isArray(multiAliquota)) {
    for (const r of multiAliquota) {
      riepilogoXml += `
      <DatiRiepilogo>
        <AliquotaIVA>${r.aliquota.toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${r.imponibile.toFixed(2)}</ImponibileImporto>
        <Imposta>${r.imposta.toFixed(2)}</Imposta>
        ${esigibilita ? `<EsigibilitaIVA>${esigibilita}</EsigibilitaIVA>` : ''}
      </DatiRiepilogo>`
    }
  } else {
    riepilogoXml = `
      <DatiRiepilogo>
        <AliquotaIVA>${aliquota.toFixed(2)}</AliquotaIVA>
        <ImponibileImporto>${imponibile.toFixed(2)}</ImponibileImporto>
        <Imposta>${imposta.toFixed(2)}</Imposta>
        ${natura ? `<Natura>${natura}</Natura>` : ''}
        ${esigibilita ? `<EsigibilitaIVA>${esigibilita}</EsigibilitaIVA>` : ''}
      </DatiRiepilogo>`
  }

  const ritenutaXml = ritenuta
    ? `
      <DatiRitenuta>
        <TipoRitenuta>RT02</TipoRitenuta>
        <ImportoRitenuta>${ritenuta.importo.toFixed(2)}</ImportoRitenuta>
        <AliquotaRitenuta>${ritenuta.aliquota.toFixed(2)}</AliquotaRitenuta>
        <CausalePagamento>A</CausalePagamento>
      </DatiRitenuta>`
    : ''

  const bolloXml = bollo
    ? `
      <DatiBollo>
        <BolloVirtuale>SI</BolloVirtuale>
        <ImportoBollo>${bollo.toFixed(2)}</ImportoBollo>
      </DatiBollo>`
    : ''

  return `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:p="http://ivaservizi.agenziaentrate.gov.it/pdf/fisconet/v1.2" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <FatturaElettronicaHeader>
    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${cedentePiva}</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>${cedenteDenom}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CedentePrestatore>
    <CessionarioCommittente>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${cessionarioPiva}</IdCodice>
        </IdFiscaleIVA>
        <Anagrafica>
          <Denominazione>${cessionarioDenom}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>
  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${tipoDocumento}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${data}</Data>
        <Numero>${numero}</Numero>
        ${ritenutaXml}
        ${bolloXml}
        <ImportoTotaleDocumento>${totale.toFixed(2)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>
    <DatiBeniServizi>
      <DettaglioLinee>
        <NumeroLinea>1</NumeroLinea>
        <Descrizione>Prestazione di servizi di prova [TEST_LAB]</Descrizione>
        <PrezzoUnitario>${imponibile.toFixed(2)}</PrezzoUnitario>
        <PrezzoTotale>${imponibile.toFixed(2)}</PrezzoTotale>
        <AliquotaIVA>${aliquota.toFixed(2)}</AliquotaIVA>
      </DettaglioLinee>
      ${riepilogoXml}
    </DatiBeniServizi>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`
}

export function generateScenarioDocuments(scenarioId, societa) {
  assertDemoCompanyForTestLab(societa, 'generateScenarioDocuments')

  const myPiva = societa.partita_iva || '99999999999'
  const myDenom = societa.denominazione || societa.ragione_sociale || 'Società Test'
  const today = new Date().toISOString().split('T')[0]

  const docs = []

  switch (scenarioId) {
    case 'ordinarie_acquisto':
      // 10 fatture passive ordinarie
      for (let i = 1; i <= 10; i++) {
        const imp = 100 * i
        const iva = Math.round(imp * 0.22 * 100) / 100
        const tot = imp + iva
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `FACQ-${i}`,
          data: today,
          cedentePiva: `111111111${i.toString().padStart(2, '0')}`,
          cedenteDenom: `Fornitore TEST ORD ${i} S.r.l.`,
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          imponibile: imp,
          aliquota: 22,
          imposta: iva,
          totale: tot,
        })
        docs.push({
          name: `test_lab_acq_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'ordinarie_vendita':
      // 10 fatture attive ordinarie
      for (let i = 1; i <= 10; i++) {
        const imp = 150 * i
        const iva = Math.round(imp * 0.22 * 100) / 100
        const tot = imp + iva
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `FVEN-${i}`,
          data: today,
          cedentePiva: myPiva,
          cedenteDenom: myDenom,
          cessionarioPiva: `222222222${i.toString().padStart(2, '0')}`,
          cessionarioDenom: `Cliente TEST ORD ${i} S.p.A.`,
          imponibile: imp,
          aliquota: 22,
          imposta: iva,
          totale: tot,
        })
        docs.push({
          name: `test_lab_ven_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'note_credito':
      // 10 note di credito (5 acquisto, 5 vendita)
      for (let i = 1; i <= 10; i++) {
        const isAcquisto = i <= 5
        const imp = 80 * i
        const iva = Math.round(imp * 0.22 * 100) / 100
        const tot = imp + iva
        const xml = generateXml({
          tipoDocumento: 'TD04',
          numero: `NC-${i}`,
          data: today,
          cedentePiva: isAcquisto ? `111111111${i.toString().padStart(2, '0')}` : myPiva,
          cedenteDenom: isAcquisto ? `Fornitore TEST NC ${i} S.r.l.` : myDenom,
          cessionarioPiva: isAcquisto ? myPiva : `222222222${i.toString().padStart(2, '0')}`,
          cessionarioDenom: isAcquisto ? myDenom : `Cliente TEST NC ${i} S.p.A.`,
          imponibile: imp,
          aliquota: 22,
          imposta: iva,
          totale: tot,
        })
        docs.push({
          name: `test_lab_nc_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'multi_aliquota':
      // 10 fatture multi-aliquota passive
      for (let i = 1; i <= 10; i++) {
        const imp1 = 100 * i
        const iva1 = Math.round(imp1 * 0.22 * 100) / 100
        const imp2 = 50 * i
        const iva2 = Math.round(imp2 * 0.10 * 100) / 100
        const tot = imp1 + iva1 + imp2 + iva2
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `FMULTI-${i}`,
          data: today,
          cedentePiva: `111111111${i.toString().padStart(2, '0')}`,
          cedenteDenom: `Fornitore TEST MULTI ${i} S.r.l.`,
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          totale: tot,
          multiAliquota: [
            { imponibile: imp1, aliquota: 22, imposta: iva1 },
            { imponibile: imp2, aliquota: 10, imposta: iva2 },
          ],
        })
        docs.push({
          name: `test_lab_multi_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'iva_cassa':
      // 10 fatture con IVA per cassa differita
      for (let i = 1; i <= 10; i++) {
        const imp = 120 * i
        const iva = Math.round(imp * 0.22 * 100) / 100
        const tot = imp + iva
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `FCASSA-${i}`,
          data: today,
          cedentePiva: `111111111${i.toString().padStart(2, '0')}`,
          cedenteDenom: `Fornitore TEST CASSA ${i} S.r.l.`,
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          imponibile: imp,
          aliquota: 22,
          imposta: iva,
          totale: tot,
          esigibilita: 'D', // Differita / Cassa
        })
        docs.push({
          name: `test_lab_cassa_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'split_payment':
      // 10 fatture con split payment (vendita a PA)
      for (let i = 1; i <= 10; i++) {
        const imp = 200 * i
        const iva = Math.round(imp * 0.22 * 100) / 100
        const tot = imp + iva
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `FSPLIT-${i}`,
          data: today,
          cedentePiva: myPiva,
          cedenteDenom: myDenom,
          cessionarioPiva: `333333333${i.toString().padStart(2, '0')}`,
          cessionarioDenom: `Comune TEST SPLIT ${i} PA`,
          imponibile: imp,
          aliquota: 22,
          imposta: iva,
          totale: tot,
          esigibilita: 'S', // Split Payment
        })
        docs.push({
          name: `test_lab_split_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'reverse_estero':
      // 10 fatture reverse charge ed estero (TD16, TD17, TD18, TD19)
      for (let i = 1; i <= 10; i++) {
        const imp = 150 * i
        const iva = Math.round(imp * 0.22 * 100) / 100
        const tot = imp + iva
        const kind = i % 4
        const tipoDoc = kind === 0 ? 'TD16' : kind === 1 ? 'TD17' : kind === 2 ? 'TD18' : 'TD19'
        const isEstero = tipoDoc !== 'TD16'
        const xml = generateXml({
          tipoDocumento: tipoDoc,
          numero: `FREV-${i}`,
          data: today,
          cedentePiva: isEstero ? `DE81111111${i}` : `111111111${i.toString().padStart(2, '0')}`,
          cedenteDenom: `Fornitore TEST REVERSE ${i} ${isEstero ? 'ESTERO' : 'IT'}`,
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          imponibile: imp,
          aliquota: 22,
          imposta: iva,
          totale: tot,
          natura: isEstero ? 'N6.2' : null,
        })
        docs.push({
          name: `test_lab_rev_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'parcelle_ritenute':
      // 10 parcelle professionisti con ritenuta d'acconto
      for (let i = 1; i <= 10; i++) {
        const imp = 300 * i
        const cassaVal = Math.round(imp * 0.04 * 100) / 100 // Cassa 4%
        const imponibileIva = imp + cassaVal
        const iva = Math.round(imponibileIva * 0.22 * 100) / 100
        const rit = Math.round(imp * 0.20 * 100) / 100 // Ritenuta 20%
        const tot = imponibileIva + iva
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `PARC-${i}`,
          data: today,
          cedentePiva: `111111111${i.toString().padStart(2, '0')}`,
          cedenteDenom: `Prof. TEST RITENUTA ${i} Ing.`,
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          imponibile: imponibileIva,
          aliquota: 22,
          imposta: iva,
          totale: tot,
          ritenuta: { aliquota: 20, importo: rit },
        })
        docs.push({
          name: `test_lab_rit_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'forfettari_esenti':
      // 10 fatture con natura IVA esente/forfettario (no iva)
      for (let i = 1; i <= 10; i++) {
        const imp = 100 * i
        const kind = i % 3
        const natura = kind === 0 ? 'N2.2' : kind === 1 ? 'N4' : 'N1'
        const xml = generateXml({
          tipoDocumento: 'TD01',
          numero: `FEX-${i}`,
          data: today,
          cedentePiva: `111111111${i.toString().padStart(2, '0')}`,
          cedenteDenom: `Forfettario/Esente TEST ${i} S.r.l.`,
          cessionarioPiva: myPiva,
          cessionarioDenom: myDenom,
          imponibile: imp,
          aliquota: 0,
          imposta: 0,
          totale: imp,
          natura,
        })
        docs.push({
          name: `test_lab_ex_${i}.xml`,
          size: xml.length,
          text: async () => xml,
        })
      }
      break

    case 'massivo_completo':
      // Unione di vari scenari (20 documenti complessivi)
      const subScenarios = [
        'ordinarie_acquisto',
        'ordinarie_vendita',
        'note_credito',
        'multi_aliquota',
        'iva_cassa',
        'split_payment',
        'reverse_estero',
        'parcelle_ritenute',
        'forfettari_esenti',
      ]
      for (const sub of subScenarios) {
        const subDocs = generateScenarioDocuments(sub, societa)
        // Aggiungiamo i primi 2 o 3 di ogni sub-scenario per non sovraccaricare
        docs.push(...subDocs.slice(0, 3))
      }
      break

    case 'cespiti':
      // Placeholder non operativo
      break

    default:
      throw new Error(`Scenario non supportato: ${scenarioId}`)
  }

  return docs
}
