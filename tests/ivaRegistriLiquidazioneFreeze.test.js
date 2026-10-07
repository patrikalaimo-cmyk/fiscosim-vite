import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

import { calcoloLiquidazioneIvaDefinitiva } from '../src/modules/contabilita/domain/iva/calcoloLiquidazioneIvaDefinitiva.js'
import { buildLiquidazioneIvaDashboardModel } from '../src/modules/contabilita/application/helper/buildLiquidazioneIvaDashboardModel.js'

test('IVA freeze - zero detraibile esplicito non viene convertito in IVA detraibile piena', () => {
  const result = calcoloLiquidazioneIvaDefinitiva([{
    societa_id: 'soc-freeze',
    data: '2026-06-15',
    tipo: 'acquisto',
    imponibile: 100,
    iva: 22,
    iva_detraibile: 0,
    iva_indetraibile: 22,
    esigibilita: 'immediata',
  }], {
    societaId: 'soc-freeze',
    periodoInizio: '2026-06-01',
    periodoFine: '2026-06-30',
    periodicita: 'mensile',
  })

  assert.equal(result.ivaAcquistiDetraibile, 0)
  assert.equal(result.ivaAcquistiIndetraibile, 22)
})

test('IVA freeze - dashboard espone dati reali senza fallback dimostrativi', () => {
  const model = buildLiquidazioneIvaDashboardModel({
    societaAttiva: { id: 'soc-freeze', tipo_liquidazione_iva: 'mensile' },
    periodParams: { tipo_periodo: 'mensile', anno: 2026, periodo: 6 },
    liquidazioniList: [],
    currentCalc: {
      ivaVenditeLorda: 220,
      ivaSplitEsclusa: 44,
      ivaDebitoEffettiva: 176,
      ivaAcquistiDetraibile: 0,
      saldoPeriodo: 176,
      righeIncluseCount: 0,
      righeEscluseCount: 0,
      righeEscluse: [],
    },
    operatore: null,
  })

  assert.equal(model.kpis.ivaSplitPayment, 44)
  assert.equal(model.meta.registriInclusiCount, 0)
  assert.equal(model.meta.operatoreStudio, '—')
})

test('IVA freeze - UI non contiene numero registri o operatore hardcoded', () => {
  const dashboard = readFileSync(new URL('../src/modules/contabilita/components/liquidazione/LiquidazioneIvaDashboard.jsx', import.meta.url), 'utf8')
  const model = readFileSync(new URL('../src/modules/contabilita/application/helper/buildLiquidazioneIvaDashboardModel.js', import.meta.url), 'utf8')

  assert.doesNotMatch(dashboard, /registriInclusiCount\s*\|\|\s*27/)
  assert.doesNotMatch(model, /Patrik Alaimo/)
  assert.doesNotMatch(model, /Pro-rata:\s*100%/)
})

test('IVA freeze - letture registri e snapshot sono tenant-scoped', () => {
  const repoSource = readFileSync(new URL('../src/modules/contabilita/data/contabilitaRepo.js', import.meta.url), 'utf8')
  const registriStart = repoSource.indexOf('export async function getRegistriIvaByPeriodo')
  const snapshotStart = repoSource.indexOf('export async function getRigheLiquidazioneIvaSnapshot')
  assert.ok(registriStart >= 0)
  assert.ok(snapshotStart >= 0)

  const registriSection = repoSource.slice(registriStart, snapshotStart)
  const snapshotSection = repoSource.slice(snapshotStart, repoSource.indexOf('export async function consolidaLiquidazioneIvaDefinitiva', snapshotStart))

  assert.match(registriSection, /\.eq\('societa_id', societaId\)/)
  assert.match(snapshotSection, /\.eq\('societa_id', societaId\)/)
  assert.match(snapshotSection, /liquidazioneId e societaId sono obbligatori/)
})

test('IVA freeze - TaxCompliance usa il percorso IVA canonico, non i servizi legacy accounting_entries', () => {
  const source = readFileSync(new URL('../src/modules/contabilita/views/TaxComplianceView.jsx', import.meta.url), 'utf8')
  assert.match(source, /liquidazioneIvaClient\.js/)
  assert.match(source, /calcoloLiquidazioneIvaDefinitiva\.js/)
  assert.doesNotMatch(source, /ivaRegistriSyncService/)
  assert.doesNotMatch(source, /services\/liquidazioneIvaService/)
})
