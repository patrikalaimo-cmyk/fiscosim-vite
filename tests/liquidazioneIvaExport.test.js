import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { buildLiquidazioneIvaDashboardModel } from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaDashboardModel.js'
import { buildLiquidazioneIvaProspettoModel } from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaProspettoModel.js'
import {
  buildLiquidazioneIvaExportModel,
  buildLiquidazioneIvaExportCsv,
  buildLiquidazioneIvaExportHtml,
  buildLiquidazioneIvaExportXlsx,
  resolveLiquidazioneIvaTributo,
  resolveLiquidazioneIvaDueDate,
  buildLiquidazioneIvaClienteModel,
  buildLiquidazioneIvaClienteHtml,
  buildLiquidazioneIvaClienteXlsx
} from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaExportModel.js'

function fmt(n) {
  const val = Number(n || 0)
  return val.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
}

function escapeCsv(value) {
  const text = String(value ?? '')
  if (/[",\r\n;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

const esc = (val) => escapeCsv(fmt(val))

test('VAT Settlement Prospetto Export Suite', async (t) => {

  const mockProspettoModel = {
    riepilogoLiquidazione: {
      ivaVendite: 1500.50,
      ivaCorrispettivi: 0,
      ivaSplitPayment: 200.00,
      totaleImpostaEsigibile: 1300.50,
      ivaAcquistiDetraibile: 600.25,
      ivaAcquistiIndetraibile: 150.00,
      totaleImpostaDetraibile: 600.25,
      ivaDebitoPeriodo: 700.25,
      creditoIvaPrecedente: 100.00,
      creditoCompensabileUsato: 50.00,
      accontoIva: 120.00,
      interessiTrimestrali: 13.00,
      risultatoFinale: 443.25,
      risultatoTipo: 'debito'
    },
    dettaglioVendite: [
      { codiceIva: '22', descrizione: 'IVA 22%', imponibile: 6820.45, ivaDebitoLorda: 1500.50, ivaSplitEsclusa: 200.00, ivaDebitoEffettiva: 1300.50, operazioniEsentiEscluse: 0, operazioniNonImponibili: 0, righe: 12 }
    ],
    totaliVendite: { imponibile: 6820.45, ivaDebitoLorda: 1500.50, ivaSplitEsclusa: 200.00, ivaDebitoEffettiva: 1300.50 },
    dettaglioAcquisti: [
      { codiceIva: '22D', descrizione: 'IVA 22% Detraibile', imponibile: 2728.41, ivaAcquisti: 600.25, ivaDetraibile: 600.25, ivaIndetraibile: 150.00, percentualeDetrazione: 80, operazioniEsentiEscluse: 0, operazioniNonImponibili: 0, righe: 8 }
    ],
    totaliAcquisti: { imponibile: 2728.41, ivaAcquisti: 600.25, ivaDetraibile: 600.25, ivaIndetraibile: 150.00 },
    ivaPerCassa: [
      { documento: 'Fattura n. 1 del 01/06/2026', clienteFornitore: 'ROSSI SPA', dataDocumento: '2026-06-01', totaleDocumento: 1220.00, ivaSospesa: 220.00, ivaRilasciata: 0, residuoIvaSospesa: 220.00, motivo: 'Esigibilità differita' }
    ],
    creditoCompensabile: { inizioPeriodo: 500.00, usatoInLiquidazione: 50.00, usatoF24: 100.00, finale: 350.00, daRiportare: 350.00 },
    controlliWarning: { registriInclusi: 'Tutti', registriEsclusi: 'Nessuno', righeEscluse: 2, righeEscluseCassa: 1, operazioniSplit: 1, operazioniReverse: 0, ivaIndetraibileRilevata: 150.00, squadrature: 'Ok', statoControlli: 'OK' }
  }

  const mockMeta = {
    societa: 'SIRIA SRL',
    partitaIva: '01234567890',
    codiceFiscale: '01234567890',
    periodo: 'Maggio 2026',
    periodoLabel: 'Maggio 2026',
    periodicitaLabel: 'Mensile',
    operatore: 'Patrik Alaimo',
    periodicita: 'mensile',
    periodoNum: 5,
    anno: 2026,
    data: '14/06/2026'
  }

  await t.test('1. Unified export model contains all required metadata and sections', () => {
    const model = buildLiquidazioneIvaExportModel(mockProspettoModel, mockMeta)

    // Check Testata
    assert.strictEqual(model.testata.societa, 'SIRIA SRL')
    assert.strictEqual(model.testata.periodo, 'Maggio 2026')
    assert.strictEqual(model.testata.periodicita, 'mensile')
    assert.strictEqual(model.testata.stato, '—')
    assert.strictEqual(model.testata.operatore, 'Patrik Alaimo')

    // Check Riepilogo KPIs
    assert.strictEqual(model.riepilogoKpi.ivaVendite, 1500.50)
    assert.strictEqual(model.riepilogoKpi.ivaSplitPayment, 200.00)
    assert.strictEqual(model.riepilogoKpi.totaleImpostaEsigibile, 1300.50)
    assert.strictEqual(model.riepilogoKpi.ivaAcquistiDetraibile, 600.25)
    assert.strictEqual(model.riepilogoKpi.ivaAcquistiIndetraibile, 150.00)
    assert.strictEqual(model.riepilogoKpi.totaleImpostaDetraibile, 600.25)
    assert.strictEqual(model.riepilogoKpi.creditoIvaPrecedente, 100.00)
    assert.strictEqual(model.riepilogoKpi.creditoCompensabileUsato, 50.00)
    assert.strictEqual(model.riepilogoKpi.accontoIva, 120.00)
    assert.strictEqual(model.riepilogoKpi.interessiTrimestrali, 13.00)
    assert.strictEqual(model.riepilogoKpi.risultatoFinale, 443.25)
    assert.strictEqual(model.riepilogoKpi.risultatoTipo, 'debito')

    // Check detail sections are present
    assert.ok(Array.isArray(model.registroVendite.dettaglio))
    assert.ok(Array.isArray(model.registroAcquisti.dettaglio))
    assert.ok(Array.isArray(model.ivaPerCassa))
    assert.ok(model.creditoCompensabile)
    assert.ok(model.controlliWarning)
  })

  await t.test('2. Export model uses already calculated data, does not recalculate fiscally', () => {
    const modifiedMock = {
      ...mockProspettoModel,
      riepilogoLiquidazione: {
        ...mockProspettoModel.riepilogoLiquidazione,
        risultatoFinale: 9999.99
      }
    }
    const model = buildLiquidazioneIvaExportModel(modifiedMock, mockMeta)
    assert.strictEqual(model.riepilogoKpi.risultatoFinale, 9999.99)
  })

  await t.test('3. Registro vendite exported with totals', () => {
    const csv = buildLiquidazioneIvaExportCsv(mockProspettoModel, mockMeta)
    const expected = `TOTALE;;${fmt(6820.45)};${fmt(1500.50)};${fmt(200.00)};${fmt(1300.50)};;;`
    assert.ok(csv.includes(expected), `Expected CSV to contain: ${expected}`)
  })

  await t.test('4. Registro acquisti exported with detraibile/indetraibile split', () => {
    const csv = buildLiquidazioneIvaExportCsv(mockProspettoModel, mockMeta)
    const expectedRow = `22D;IVA 22% Detraibile;${esc(2728.41)};${esc(600.25)};${esc(600.25)};${esc(150.00)};80%;`
    const expectedTotal = `TOTALE;;${fmt(2728.41)};${fmt(600.25)};${fmt(600.25)};${fmt(150.00)};;;;`
    assert.ok(csv.includes(expectedRow), `Expected CSV to contain: ${expectedRow}`)
    assert.ok(csv.includes(expectedTotal), `Expected CSV to contain: ${expectedTotal}`)
  })

  await t.test('5. IVA per cassa / esigibilita differita section is formatted correctly', () => {
    const csv = buildLiquidazioneIvaExportCsv(mockProspettoModel, mockMeta)
    const expectedRow = `Fattura n. 1 del 01/06/2026;ROSSI SPA;2026-06-01;${esc(1220.00)};${esc(220.00)};${esc(0)};${esc(220.00)};Esigibilità differita`
    assert.ok(csv.includes(expectedRow), `Expected CSV to contain: ${expectedRow}`)

    const emptyProspetto = { ...mockProspettoModel, ivaPerCassa: [] }
    const emptyCsv = buildLiquidazioneIvaExportCsv(emptyProspetto, mockMeta)
    assert.ok(emptyCsv.includes('Nessuna operazione IVA per cassa o a esigibilità differita nel periodo.'))
  })

  await t.test('6. Diagnostics/warnings are included in CSV and HTML', () => {
    const csv = buildLiquidazioneIvaExportCsv(mockProspettoModel, mockMeta)
    assert.ok(csv.includes('Registri inclusi;Tutti'))
    assert.ok(csv.includes('Righe escluse per competenza;2'))
    assert.ok(csv.includes('Righe escluse per esigibilità;1'))
    assert.ok(csv.includes('Stato quadratura controlli;Ok'))

    const html = buildLiquidazioneIvaExportHtml(mockProspettoModel, mockMeta)
    assert.ok(html.includes('Registri inclusi:</strong> Tutti'))
    assert.ok(html.includes('Quadratura: Ok'))
  })

  await t.test('7. SheetJS XLSX workbook builds successfully with 6 sheets', () => {
    const wb = buildLiquidazioneIvaExportXlsx(mockProspettoModel, mockMeta)

    assert.ok(wb)
    assert.ok(wb.SheetNames)
    assert.deepEqual(wb.SheetNames, [
      'Riepilogo',
      'Registro vendite',
      'Registro acquisti',
      'IVA per cassa',
      'Crediti',
      'Controlli'
    ])
  })

  await t.test('8. Numerical fields in XLSX workbook sheets are written as raw numbers', () => {
    const wb = buildLiquidazioneIvaExportXlsx(mockProspettoModel, mockMeta)
    const riepSheet = wb.Sheets['Riepilogo']
    const cellB11 = riepSheet['B11']
    assert.ok(cellB11)
    assert.strictEqual(cellB11.v, 1500.50)
    assert.strictEqual(typeof cellB11.v, 'number')

    const venditeSheet = wb.Sheets['Registro vendite']
    const cellC5 = venditeSheet['C5']
    assert.ok(cellC5)
    assert.strictEqual(cellC5.v, 6820.45)
    assert.strictEqual(typeof cellC5.v, 'number')
  })

  // NUOVI TEST PER RIFINITURE LIQUIDAZIONE IVA
  await t.test('9. Month index converts correctly to Italian names in storico labels', () => {
    const periodParams = { tipo_periodo: 'mensile', anno: 2026, periodo: 6 }
    const mockSocieta = { id: 'company-123', denominazione: 'TEST SRL', tipo_liquidazione_iva: 'mensile' }
    const liquidazioniList = [
      { societa_id: 'company-123', periodicita: 'mensile', anno: 2026, mese: 1, stato: 'definitiva', saldo: 100, updated_at: '2026-06-14T10:00:00Z' },
      { societa_id: 'company-123', periodicita: 'mensile', anno: 2026, mese: 5, stato: 'definitiva', saldo: 200, updated_at: '2026-06-14T10:00:00Z' },
      { societa_id: 'company-123', periodicita: 'mensile', anno: 2026, mese: 12, stato: 'definitiva', saldo: 300, updated_at: '2026-06-14T10:00:00Z' }
    ]
    const model = buildLiquidazioneIvaDashboardModel({
      societaAttiva: mockSocieta,
      periodParams,
      liquidazioniList,
      currentCalc: null
    })

    assert.strictEqual(model.storico[0].periodoLabel, 'Gennaio 2026')
    assert.strictEqual(model.storico[1].periodoLabel, 'Maggio 2026')
    assert.strictEqual(model.storico[2].periodoLabel, 'Dicembre 2026')
  })

  await t.test('10. Periodicity mismatch is correctly detected as override without altering database values', () => {
    const mockSocieta = { id: 'company-123', denominazione: 'TEST SRL', tipo_liquidazione_iva: 'mensile' }
    const periodParams = { tipo_periodo: 'trimestrale', anno: 2026, periodo: 1 }
    
    const dashboardModel = buildLiquidazioneIvaDashboardModel({
      societaAttiva: mockSocieta,
      periodParams,
      liquidazioniList: []
    })

    assert.strictEqual(dashboardModel.periodicita, 'trimestrale')
    assert.strictEqual(mockSocieta.tipo_liquidazione_iva, 'mensile', 'Anagrafica remains untouched')
  })

  await t.test('11. Client Model for Maggio 2026 monthly generates correct tax codes and due date', () => {
    const clientModel = buildLiquidazioneIvaClienteModel(mockProspettoModel, mockMeta)

    assert.strictEqual(clientModel.testata.societa, 'SIRIA SRL')
    assert.strictEqual(clientModel.versamento.tributo, '6005')
    assert.strictEqual(clientModel.sezioneErario.codiceTributo, '6005')
    assert.strictEqual(clientModel.versamento.scadenza, '16 Giugno 2026')
    assert.strictEqual(clientModel.sezioneErario.annoRiferimento, '2026')
  })

  await t.test('12. Client Model with balance at debito vs credito shows correct mutual exclusivity', () => {
    // 1. Debito scenario (debit is 418.30)
    const debitProspetto = {
      ...mockProspettoModel,
      riepilogoLiquidazione: {
        ...mockProspettoModel.riepilogoLiquidazione,
        risultatoFinale: 418.30,
        risultatoTipo: 'debito'
      }
    }
    const modelDebito = buildLiquidazioneIvaClienteModel(debitProspetto, { periodicita: 'mensile', periodoNum: 5, anno: 2026 })
    assert.strictEqual(modelDebito.risultato.differenzaDebito, 418.30)
    assert.strictEqual(modelDebito.risultato.differenzaCredito, 0.00)
    assert.strictEqual(modelDebito.versamento.isDebito, true)

    // 2. Credito scenario (credit is 418.30)
    const creditProspetto = {
      ...mockProspettoModel,
      riepilogoLiquidazione: {
        ...mockProspettoModel.riepilogoLiquidazione,
        risultatoFinale: 418.30,
        risultatoTipo: 'credito'
      }
    }
    const modelCredito = buildLiquidazioneIvaClienteModel(creditProspetto, { periodicita: 'mensile', periodoNum: 5, anno: 2026 })
    assert.strictEqual(modelCredito.risultato.differenzaDebito, 0.00)
    assert.strictEqual(modelCredito.risultato.differenzaCredito, 418.30)
    assert.strictEqual(modelCredito.versamento.isDebito, false)
  })

  await t.test('13. Client Prospetto HTML and Excel exports do not throw and contain F24 section', () => {
    const model = buildLiquidazioneIvaClienteModel(mockProspettoModel, mockMeta)
    
    const html = buildLiquidazioneIvaClienteHtml(model)
    assert.ok(html.includes('Sezione Erario'))
    assert.ok(html.includes('SIRIA SRL'))

    const wb = buildLiquidazioneIvaClienteXlsx(model)
    assert.ok(wb)
    assert.ok(wb.Sheets['Prospetto Cliente'])
  })

  await t.test('14. Prospetto model flags credit correctly even if raw period balance is positive', () => {
    const mockCalcResult = {
      saldoPeriodo: 200.00, // raw period is debit
      debitoDaVersare: 0,   // covered by credit carryover
      creditoDaRiportare: 914.98,
      creditoPeriodoPrecedente: 1114.98,
      creditoAnnoPrecedente: 0,
      creditoCompensatoF24: 0,
      accontoIvaVersato: 0,
      interessiTrimestrali: 0
    }

    const prospetto = buildLiquidazioneIvaProspettoModel({
      rows: [],
      calcResult: mockCalcResult,
      options: { societaId: 'soc-123' }
    })

    assert.strictEqual(prospetto.riepilogoLiquidazione.risultatoTipo, 'credito')
    assert.strictEqual(prospetto.riepilogoLiquidazione.risultatoFinale, 914.98)

    const clientModel = buildLiquidazioneIvaClienteModel(prospetto, { periodicita: 'mensile', periodoNum: 6, anno: 2026 })
    assert.strictEqual(clientModel.versamento.isDebito, false)
    assert.strictEqual(clientModel.risultato.differenzaDebito, 0.00)
    assert.strictEqual(clientModel.risultato.differenzaCredito, 914.98)
    assert.strictEqual(clientModel.sezioneErario.importoDebito, 0.00)
    assert.strictEqual(clientModel.sezioneErario.totaleA, 0.00)

    const html = buildLiquidazioneIvaClienteHtml(clientModel)
    assert.ok(html.includes('Nessun importo da esporre in delega F24.'))
    assert.ok(!html.includes('IMPOSTE DIRETTE - IVA'))

    const wb = buildLiquidazioneIvaClienteXlsx(clientModel)
    const sheet = wb.Sheets['Prospetto Cliente']
    const csv = XLSX.utils.sheet_to_csv(sheet)
    assert.ok(csv.includes('Nessun importo da esporre in delega F24.'))
  })
})

