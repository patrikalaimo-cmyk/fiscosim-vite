import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import { boundsMensile, boundsTrimestrale } from '../src/modules/contabilita/application/liquidazioneIvaClient.js'
import { getRegistriIvaByPeriodo } from '../src/modules/contabilita/data/contabilitaRepo.js'
import { getLiquidazioneIvaProvvisoriaProspetto } from '../src/modules/contabilita/application/iva/liquidazioneIvaProvvisoriaUiAdapter.js'

// Save original supabase client methods
const originalFrom = sb.from

test('Liquidazione IVA Provvisoria Fix - Test Suite', async (t) => {

  t.afterEach(() => {
    sb.from = originalFrom
  })

  await t.test('1. periodo mensile giugno 2026 calcola range corretto timezone-indipendente', () => {
    const bounds = boundsMensile(2026, 6)
    assert.deepEqual(bounds, {
      periodo_inizio: '2026-06-01',
      periodo_fine: '2026-06-30'
    })
  })

  await t.test('2. query verso registri_iva usa societa_id = SIRIA e range corretto', async () => {
    let selectCalled = false
    let queriedTables = []
    let queryEqs = {}
    let queryGtes = {}
    let queryLtes = {}

    sb.from = (table) => {
      queriedTables.push(table)
      const chain = {
        select: (cols) => {
          if (table === 'registri_iva') {
            selectCalled = true
            assert.ok(cols.includes('id'))
            assert.ok(cols.includes('societa_id'))
            assert.ok(!cols.includes('causali_iva('), 'La query non deve eseguire join con causali_iva tramite PostgREST')
          }
          return chain
        },
        eq: (col, val) => {
          queryEqs[col] = val
          return chain
        },
        gte: (col, val) => {
          queryGtes[col] = val
          return chain
        },
        lte: (col, val) => {
          queryLtes[col] = val
          return chain
        },
        in: () => chain,
        then: (resolve) => {
          // Return some mock rows
          return Promise.resolve({
            data: [
              { id: '1', societa_id: '4a728851-be5a-412c-9ce6-ec07b72fcdfa', tipo: 'acquisto', imponibile: 1000, iva: 220, iva_detraibile: 220, data: '2026-06-02', esigibilita: 'immediata', causale_iva_id: 'c1' }
            ],
            error: null
          }).then(resolve)
        }
      }
      return chain
    }

    const bounds = boundsMensile(2026, 6)
    await getRegistriIvaByPeriodo('4a728851-be5a-412c-9ce6-ec07b72fcdfa', bounds.periodo_inizio, bounds.periodo_fine)

    assert.ok(queriedTables.includes('registri_iva'))
    assert.ok(queriedTables.includes('causali_iva'))
    assert.strictEqual(selectCalled, true)
    assert.strictEqual(queryEqs.societa_id, '4a728851-be5a-412c-9ce6-ec07b72fcdfa')
    assert.strictEqual(queryGtes.data, '2026-06-01')
    assert.strictEqual(queryLtes.data, '2026-06-30')
  })

  await t.test('3 e 4. se il client riceve 28 righe IVA, UI adapter non restituisce nessun dato e aggrega i campi IVA reali correttamente', () => {
    // Generate 28 simulated rows matching June 2026 records
    const simulatedRows = Array.from({ length: 28 }, (_, index) => ({
      id: `row-${index}`,
      societa_id: '4a728851-be5a-412c-9ce6-ec07b72fcdfa',
      tipo: 'acquisto',
      imponibile: 100, // Totale = 2800
      iva: 22,        // Totale = 616
      iva_detraibile: 20, // Totale = 560
      iva_indetraibile: 2,
      aliquota: 22,
      data: '2026-06-05',
      esigibilita: 'immediata',
      split_payment: false,
      prima_nota_id: `pn-${index}`,
      causale_iva_id: `c-${index}`
    }))

    const options = {
      societaId: '4a728851-be5a-412c-9ce6-ec07b72fcdfa',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      periodicita: 'mensile',
      periodo: 6,
    }

    const prospetto = getLiquidazioneIvaProvvisoriaProspetto(simulatedRows, options)

    assert.ok(prospetto, 'Il prospetto deve essere generato')
    assert.strictEqual(prospetto.stato, 'provvisorio')
    assert.strictEqual(prospetto.righeIncluseCount, 28, 'Le 28 righe devono essere tutte incluse')
    
    // Verifichiamo aggregazione campi reali
    // Iva vendite lorda = 0 (tutti acquisti)
    assert.strictEqual(prospetto.ivaVenditeLorda, 0)
    // Iva acquisti = 560 (somma di iva_detraibile)
    assert.strictEqual(prospetto.ivaAcquisti, 560)
    // Saldo = ivaDebitoEffettiva (0) - ivaAcquisti (560) = -560
    assert.strictEqual(prospetto.saldoPeriodo, -560)
    assert.strictEqual(prospetto.saldoACredito, 560)
    assert.strictEqual(prospetto.saldoADebito, 0)
  })

  await t.test('5. nessun consolidamento viene eseguito durante anteprima provvisoria', () => {
    let rpcCalled = false
    sb.rpc = (name) => {
      if (name === 'consolida_periodo_iva_transazionale') {
        rpcCalled = true
      }
      return Promise.resolve({ data: null, error: null })
    }

    const options = {
      societaId: '4a728851-be5a-412c-9ce6-ec07b72fcdfa',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      periodicita: 'mensile',
      periodo: 6,
    }
    const prospetto = getLiquidazioneIvaProvvisoriaProspetto([], options)
    assert.ok(prospetto)
    assert.strictEqual(rpcCalled, false, 'L\'anteprima provvisoria non deve mai consolidare o scrivere sul database')
  })
})
