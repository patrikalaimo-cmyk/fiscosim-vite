import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeConsultazioneFilters } from './normalizeConsultazioneFilters.js'
import { buildConsultazioneQueryParams } from './buildConsultazioneQueryParams.js'
import { buildConsultazioneRowViewModel } from './buildConsultazioneRowViewModel.js'
import { calculateConsultazioneSaldoProgressivo } from './calculateConsultazioneSaldoProgressivo.js'
import { buildConsultazioneSummary } from './buildConsultazioneSummary.js'
import { exportConsultazioneResults } from './exportConsultazioneResults.js'

test('normalizeConsultazioneFilters normalizza date, numeri e testo', () => {
  const filters = normalizeConsultazioneFilters({
    esercizio: 2025,
    dataRegistrazioneDa: '2025-01-01T12:30:00Z',
    conto: '  100.10  ',
    importoPreciso: '10,5',
    tolleranzaImporto: '0,25',
    testoLibero: '  casa  ',
  })

  assert.equal(filters.esercizio, '2025')
  assert.equal(filters.dataRegistrazioneDa, '2025-01-01')
  assert.equal(filters.conto, '100.10')
  assert.equal(filters.importoPreciso, '10.5')
  assert.equal(filters.tolleranzaImporto, '0.25')
  assert.equal(filters.testoLibero, 'casa')
})

test('buildConsultazioneQueryParams prepara server page e client normalizzato', () => {
  const params = buildConsultazioneQueryParams(
    {
      esercizio: '2025',
      dataRegistrazioneDa: '2025-01-01',
      conto: '100',
      soggetto: 'Demo',
      numeroDocumento: 'F-1',
      causaleContabile: 'FF',
      causaleIva: 'IVA22',
    },
    { page: 2, pageSize: 25 }
  )

  assert.equal(params.server.page, 2)
  assert.equal(params.server.pageSize, 25)
  assert.equal(params.server.dateFrom, '2025-01-01')
  assert.equal(params.server.dateTo, '2025-12-31')
  assert.equal(params.server.contoLike, '100')
  assert.equal(params.client.causaleIva, 'IVA22')
})

test('buildConsultazioneRowViewModel appiattisce la riga', () => {
  const row = buildConsultazioneRowViewModel({
    id: 'r1',
    riga_numero: 2,
    conto_id: 'c1',
    conto_codice: '100',
    conto_descrizione: 'Cassa',
    descrizione_riga: 'Pagamento',
    importo_dare: 100,
    importo_avere: 0,
    prima_nota: {
      id: 'pn1',
      numero_registrazione: 12,
      data_registrazione: '2025-01-02',
      data_documento: '2025-01-01',
      numero_documento: 'F-1',
      causale_codice: 'FF',
      causale_iva_codice: 'IVA22',
      cliente_fornitore_nome: 'Fornitore Demo',
      totale_dare: 100,
      totale_avere: 100,
      registro_iva_codice: 'ACQ',
      protocollo_iva: '12',
    },
  })

  assert.equal(row.primaNotaId, 'pn1')
  assert.equal(row.numeroRegistrazione, '12')
  assert.equal(row.dataRegistrazione, '2025-01-02')
  assert.equal(row.causaleContabile, 'FF')
  assert.equal(row.causaleIva, 'IVA22')
  assert.equal(row.statoQuadratura, 'quadrata')
  assert.equal(row.soggetto, 'Fornitore Demo')
})

test('calculateConsultazioneSaldoProgressivo ordina e calcola il saldo cumulato', () => {
  const rows = calculateConsultazioneSaldoProgressivo([
    { id: 'b', dataRegistrazione: '2025-01-02', numeroRegistrazione: '2', rigaNumero: 1, dare: 0, avere: 30 },
    { id: 'a', dataRegistrazione: '2025-01-01', numeroRegistrazione: '1', rigaNumero: 1, dare: 50, avere: 0 },
  ])

  assert.equal(rows[0].id, 'a')
  assert.equal(rows[0].saldoProgressivo, 50)
  assert.equal(rows[1].saldoProgressivo, 20)
})

test('buildConsultazioneSummary calcola totali, saldo e conti movimentati', () => {
  const summary = buildConsultazioneSummary([
    { contoId: 'c1', dare: 100, avere: 0 },
    { contoId: 'c2', dare: 0, avere: 40 },
  ])

  assert.equal(summary.righeTrovate, 2)
  assert.equal(summary.totaleDare, 100)
  assert.equal(summary.totaleAvere, 40)
  assert.equal(summary.saldo, 60)
  assert.equal(summary.contiMovimentati, 2)
})

test('buildConsultazioneSummary usa il totale disponibile quando arriva dalla paginazione', () => {
  const summary = buildConsultazioneSummary([{ contoId: 'c1', dare: 10, avere: 0 }], { totalRows: 99 })
  assert.equal(summary.righeTrovate, 99)
  assert.equal(summary.totaleDare, 10)
})

test('exportConsultazioneResults produce CSV pulito', () => {
  const out = exportConsultazioneResults([
    { dataRegistrazione: '2025-01-01', numeroDocumento: 'D1', contoCodice: '100', descrizione: 'Riga', dare: 10, avere: 0, saldoProgressivo: 10 },
  ])

  assert.match(out.csv, /Data registrazione;Documento;Conto;Descrizione;Dare;Avere;Saldo progressivo/)
  assert.match(out.csv, /2025-01-01;D1;100;Riga;10;0;10/)
})
