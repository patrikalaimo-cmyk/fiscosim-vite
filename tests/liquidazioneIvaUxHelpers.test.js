import test from 'node:test'
import assert from 'node:assert/strict'
import { buildLiquidazioneIvaDashboardModel } from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaDashboardModel.js'
import { buildLiquidazioneIvaProspettoModel } from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaProspettoModel.js'
import { buildLiquidazioneIvaExportCsv, buildLiquidazioneIvaExportHtml } from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaExportModel.js'

test('VAT Settlement UX Helpers and Model Builders - Test Suite', async (t) => {

  const mockSocieta = {
    id: 'company-123',
    denominazione: 'TEST SRL',
    tipo_liquidazione_iva: 'mensile'
  }

  const mockOperatore = {
    nome: 'Patrik',
    cognome: 'Alaimo'
  }

  await t.test('1. buildLiquidazioneIvaDashboardModel returns Anteprima when no DB record is found', () => {
    const periodParams = { tipo_periodo: 'mensile', anno: 2026, periodo: 6 }
    const model = buildLiquidazioneIvaDashboardModel({
      societaAttiva: mockSocieta,
      periodParams,
      liquidazioniList: [],
      currentCalc: {
        ivaVenditeLorda: 1000,
        ivaSplitPayment: 100,
        ivaDebitoEffettiva: 900,
        ivaAcquistiDetraibile: 500,
        saldoPeriodo: 400,
        righeIncluseCount: 15,
        righeEscluseCount: 2,
        righeEscluse: [{ motivo: 'esigibilita_differita' }]
      },
      operatore: mockOperatore
    })

    assert.strictEqual(model.statoLiquidazione, 'Anteprima')
    assert.strictEqual(model.kpis.ivaVenditeLorda, 1000)
    assert.strictEqual(model.kpis.ivaSplitPayment, 100)
    assert.strictEqual(model.kpis.ivaDebitoEffettiva, 900)
    assert.strictEqual(model.kpis.ivaAcquisti, 500)
    assert.strictEqual(model.kpis.saldoPeriodo, 400)
    assert.strictEqual(model.meta.registriInclusiCount, 15)
    assert.strictEqual(model.meta.registriEsclusiCount, 2)
    assert.strictEqual(model.meta.righeEscluseDifferitaCount, 1)
  })

  await t.test('2. buildLiquidazioneIvaDashboardModel returns Consolidata when DB record has stato = provvisoria', () => {
    const periodParams = { tipo_periodo: 'mensile', anno: 2026, periodo: 6 }
    const liquidazioniList = [{
      id: 'liq-1',
      societa_id: 'company-123',
      periodicita: 'mensile',
      anno: 2026,
      mese: 6,
      stato: 'provvisoria',
      iva_debito: 800,
      iva_credito: 300,
      saldo: 500,
      updated_at: '2026-06-12T12:00:00Z'
    }]

    const model = buildLiquidazioneIvaDashboardModel({
      societaAttiva: mockSocieta,
      periodParams,
      liquidazioniList,
      currentCalc: null,
      operatore: mockOperatore
    })

    assert.strictEqual(model.statoLiquidazione, 'Consolidata')
    assert.strictEqual(model.kpis.ivaVenditeLorda, 800)
    assert.strictEqual(model.kpis.ivaAcquisti, 300)
    assert.strictEqual(model.kpis.saldoPeriodo, 500)
  })

  await t.test('3. buildLiquidazioneIvaDashboardModel returns Definitiva when DB record has stato = definitiva', () => {
    const periodParams = { tipo_periodo: 'mensile', anno: 2026, periodo: 6 }
    const liquidazioniList = [{
      id: 'liq-1',
      societa_id: 'company-123',
      periodicita: 'mensile',
      anno: 2026,
      mese: 6,
      stato: 'definitiva',
      iva_debito: 1200,
      iva_credito: 1000,
      saldo: 200,
      updated_at: '2026-06-13T10:00:00Z'
    }]

    const model = buildLiquidazioneIvaDashboardModel({
      societaAttiva: mockSocieta,
      periodParams,
      liquidazioniList,
      currentCalc: null,
      operatore: mockOperatore
    })

    assert.strictEqual(model.statoLiquidazione, 'Definitiva')
  })

  await t.test('4. buildLiquidazioneIvaProspettoModel groups vendite by code/aliquota/natura', () => {
    const rows = [
      { id: '1', tipo: 'vendita', imponibile: 1000, iva: 220, aliquota: 22, causale_codice: '22', causale_descrizione: 'IVA 22%' },
      { id: '2', tipo: 'vendita', imponibile: 500, iva: 110, aliquota: 22, causale_codice: '22', causale_descrizione: 'IVA 22%' },
      { id: '3', tipo: 'vendita', imponibile: 300, iva: 0, aliquota: 0, natura: 'N4', causale_codice: 'ES4', causale_descrizione: 'Esente Art 10' }
    ]

    const calcResult = {
      righeIncluse: rows,
      debitoPeriodo: 330,
      creditoPeriodoPrecedente: 0,
      saldoPeriodo: 330
    }

    const prospetto = buildLiquidazioneIvaProspettoModel({ rows, calcResult })

    assert.strictEqual(prospetto.dettaglioVendite.length, 2)
    
    const gr22 = prospetto.dettaglioVendite.find(g => g.codiceIva === '22')
    assert.ok(gr22)
    assert.strictEqual(gr22.imponibile, 1500)
    assert.strictEqual(gr22.ivaDebitoLorda, 330)
    assert.strictEqual(gr22.ivaDebitoEffettiva, 330)

    const grEs = prospetto.dettaglioVendite.find(g => g.codiceIva === 'ES4')
    assert.ok(grEs)
    assert.strictEqual(grEs.imponibile, 300)
    assert.strictEqual(grEs.ivaDebitoLorda, 0)
    assert.strictEqual(grEs.operazioniEsentiEscluse, 300)
  })

  await t.test('5. buildLiquidazioneIvaProspettoModel groups acquisti with detraibile/indetraibile', () => {
    const rows = [
      { id: '4', tipo: 'acquisto', imponibile: 1000, iva: 220, iva_detraibile: 110, iva_indetraibile: 110, aliquota: 22, causale_codice: '22D50', causale_descrizione: 'Acquisto Promiscua' }
    ]

    const calcResult = {
      righeIncluse: rows,
      ivaAcquistiDetraibile: 110,
      ivaAcquistiIndetraibile: 110,
      saldoPeriodo: -110
    }

    const prospetto = buildLiquidazioneIvaProspettoModel({ rows, calcResult })

    assert.strictEqual(prospetto.dettaglioAcquisti.length, 1)
    const gr = prospetto.dettaglioAcquisti[0]
    assert.strictEqual(gr.imponibile, 1000)
    assert.strictEqual(gr.ivaAcquisti, 220)
    assert.strictEqual(gr.ivaDetraibile, 110)
    assert.strictEqual(gr.ivaIndetraibile, 110)
    assert.strictEqual(gr.percentualeDetrazione, 50)
  })

  await t.test('6. buildLiquidazioneIvaProspettoModel handles split payment correctly', () => {
    const rows = [
      { id: '5', tipo: 'vendita', imponibile: 1000, iva: 220, aliquota: 22, split_payment: true, causale_codice: '22SP', causale_descrizione: 'IVA Split' }
    ]

    const calcResult = {
      righeIncluse: rows,
      ivaVenditeLorda: 220,
      ivaSplitEsclusa: 220,
      ivaDebitoEffettiva: 0,
      saldoPeriodo: 0
    }

    const prospetto = buildLiquidazioneIvaProspettoModel({ rows, calcResult })
    const gr = prospetto.dettaglioVendite[0]
    assert.strictEqual(gr.ivaDebitoLorda, 220)
    assert.strictEqual(gr.ivaSplitEsclusa, 220)
    assert.strictEqual(gr.ivaDebitoEffettiva, 0)
  })

  await t.test('7. buildLiquidazioneIvaProspettoModel handles cassa/differita rows', () => {
    const rows = [
      { id: '6', tipo: 'vendita', imponibile: 1000, iva: 220, aliquota: 22, esigibilita: 'differita', numero_documento: '100', data: '2026-06-05', soggetto_denominazione: 'CLIENTE SRL' }
    ]

    const prospetto = buildLiquidazioneIvaProspettoModel({ rows, calcResult: { righeIncluse: [] } })
    assert.strictEqual(prospetto.ivaPerCassa.length, 1)
    assert.strictEqual(prospetto.ivaPerCassa[0].ivaSospesa, 220)
    assert.strictEqual(prospetto.ivaPerCassa[0].clienteFornitore, 'CLIENTE SRL')
  })

  await t.test('8. buildLiquidazioneIvaExportModel CSV and HTML functions do not throw and return strings', () => {
    const prospetto = {
      riepilogoLiquidazione: {
        ivaVendite: 1000, ivaCorrispettivi: 0, ivaSplitPayment: 100, totaleImpostaEsigibile: 900,
        ivaAcquistiDetraibile: 500, ivaAcquistiIndetraibile: 100, totaleImpostaDetraibile: 500,
        ivaDebitoPeriodo: 400, creditoIvaPrecedente: 0, creditoCompensabileUsato: 0, accontoIva: 0,
        interessiTrimestrali: 0, risultatoFinale: 400, risultatoTipo: 'debito'
      },
      dettaglioVendite: [],
      totaliVendite: { imponibile: 0, ivaDebitoLorda: 0, ivaSplitEsclusa: 0, ivaDebitoEffettiva: 0 },
      dettaglioAcquisti: [],
      totaliAcquisti: { imponibile: 0, ivaAcquisti: 0, ivaDetraibile: 0, ivaIndetraibile: 0 },
      ivaPerCassa: [],
      creditoCompensabile: { inizioPeriodo: 0, usatoInLiquidazione: 0, usatoF24: 0, finale: 0, daRiportare: 0 },
      controlliWarning: { registriInclusi: 'Tutti', registriEsclusi: 'Nessuno', righeEscluse: 0, righeEscluseCassa: 0, operazioniSplit: 0, operazioniReverse: 0, ivaIndetraibileRilevata: 0, squadrature: 'Ok' }
    }

    const meta = { societa: 'TEST', periodo: 'Mese 6', periodicita: 'Mensile', stato: 'Anteprima', operatore: 'User', data: '14/06/2026' }
    
    const csv = buildLiquidazioneIvaExportCsv(prospetto, meta)
    assert.ok(typeof csv === 'string')
    assert.ok(csv.includes('PROSPETTO LIQUIDAZIONE IVA PERIODICA'))

    const html = buildLiquidazioneIvaExportHtml(prospetto, meta)
    assert.ok(typeof html === 'string')
    assert.ok(html.includes('<!doctype html>'))
  })

  await t.test('9. buildLiquidazioneIvaDashboardModel custom lastCalcTimestamp formatting', () => {
    const periodParams = { tipo_periodo: 'mensile', anno: 2026, periodo: 6 }
    const lastCalcTimestamp = new Date('2026-06-14T15:45:00')
    const model = buildLiquidazioneIvaDashboardModel({
      societaAttiva: mockSocieta,
      periodParams,
      liquidazioniList: [],
      currentCalc: {
        ivaVenditeLorda: 1000,
        ivaSplitPayment: 100,
        ivaDebitoEffettiva: 900,
        ivaAcquistiDetraibile: 500,
        saldoPeriodo: 400,
        righeIncluseCount: 15,
        righeEscluseCount: 2,
        righeEscluse: [{ motivo: 'esigibilita_differita' }]
      },
      operatore: mockOperatore,
      lastCalcTimestamp
    })

    assert.strictEqual(model.meta.ultimoAggiornamento, '14/06/2026 15:45')
  })
})
