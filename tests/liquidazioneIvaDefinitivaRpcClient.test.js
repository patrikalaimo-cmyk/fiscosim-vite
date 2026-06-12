import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import {
  getLiquidazioneIvaByPeriodo,
  getRigheLiquidazioneIvaSnapshot,
  consolidaLiquidazioneIvaDefinitiva as repoConsolidaLiquidazioneIvaDefinitiva,
  isIvaPeriodLiquidated,
  getRegistriIvaByPeriodo
} from '../src/modules/contabilita/data/contabilitaRepo.js'
import {
  consolidaLiquidazioneIvaDefinitiva,
  fetchLiquidazioneIvaDefinitiva,
  fetchRigheLiquidazioneIvaSnapshot,
  getRegistriIvaLiquidabili
} from '../src/modules/contabilita/application/liquidazioneIvaClient.js'

// Keep references to restore
const originalRpc = sb.rpc
const originalFrom = sb.from

function makeChainableMock(resolvedValue) {
  const result = { data: resolvedValue, error: null }
  const chain = {
    select: () => chain,
    eq: () => chain,
    gte: () => chain,
    lte: () => chain,
    limit: () => chain,
    order: () => chain,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject)
  }
  return chain
}

test('Liquidazione IVA Definitiva — Persistenza & RPC client suite', async (t) => {

  t.afterEach(() => {
    sb.rpc = originalRpc
    sb.from = originalFrom
  })

  await t.test('1. consolidaLiquidazioneIvaDefinitiva chiama correttamente l\'RPC e gestisce il successo', async () => {
    let selectCalled = false
    let rpcCalled = false
    let rpcArgs = null

    // Mock registri_iva fetch
    sb.from = (table) => {
      if (table === 'registri_iva') {
        selectCalled = true
        return makeChainableMock([
          {
            id: 'row-1',
            societa_id: 'soc-123',
            tipo: 'vendita',
            imponibile: 1000,
            iva: 220,
            iva_detraibile: 0,
            iva_indetraibile: 0,
            aliquota: 22,
            data: '2026-06-15',
            esigibilita: 'immediata',
            split_payment: false,
            prima_nota_id: 'pn-1',
            causale_iva_id: 'c-iva-1',
            causali_iva: { reverse_charge: false, natura: null }
          }
        ])
      }
      return makeChainableMock([])
    }

    // Mock RPC call
    sb.rpc = (name, args) => {
      if (name === 'consolida_periodo_iva_transazionale') {
        rpcCalled = true
        rpcArgs = args
        return Promise.resolve({
          data: {
            success: true,
            liquidazioneId: 'liq-999',
            stato: 'definitiva',
            periodoInizio: '2026-06-01',
            periodoFine: '2026-06-30',
            righeSnapshot: 1,
            message: 'Consolidamento della liquidazione IVA periodica completato con successo.'
          },
          error: null
        })
      }
      return Promise.resolve({ data: null, error: 'Unknown RPC' })
    }

    const res = await consolidaLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-777',
      motivo: 'Chiusura IVA Giugno 2026'
    })

    assert.strictEqual(selectCalled, true)
    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(res.data.success, true)
    assert.strictEqual(res.data.liquidazioneId, 'liq-999')
    assert.strictEqual(res.data.stato, 'definitiva')
    
    // Verifichiamo che i parametri dell'RPC siano corretti
    assert.strictEqual(rpcArgs.p_societa_id, 'soc-123')
    assert.strictEqual(rpcArgs.p_periodo_inizio, '2026-06-01')
    assert.strictEqual(rpcArgs.p_periodo_fine, '2026-06-30')
    assert.strictEqual(rpcArgs.p_tipo_periodicita, 'mensile')
    assert.strictEqual(rpcArgs.p_operatore_studio_id, 'op-777')
    assert.strictEqual(rpcArgs.p_motivo, 'Chiusura IVA Giugno 2026')
    assert.ok(rpcArgs.p_payload_calcolo !== null)
    assert.strictEqual(rpcArgs.p_payload_calcolo.ivaVenditeLorda, 220)
    assert.strictEqual(rpcArgs.p_payload_calcolo.saldoPeriodo, 220)
  })

  await t.test('2. consolidaLiquidazioneIvaDefinitiva propaga correttamente l\'errore dell\'RPC', async () => {
    sb.from = (table) => makeChainableMock([])
    sb.rpc = (name, args) => {
      return Promise.resolve({
        data: null,
        error: { message: 'Unique constraint violation or overlap detected.' }
      })
    }

    const res = await consolidaLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-777',
      motivo: 'Chiusura'
    })

    assert.strictEqual(res.data, null)
    assert.ok(res.error !== null)
    assert.strictEqual(res.error.message, 'Unique constraint violation or overlap detected.')
  })

  await t.test('3. getLiquidazioneIvaByPeriodo cerca per società e periodo corretti', async () => {
    let tableQueried = ''
    let queryEqs = {}

    sb.from = (table) => {
      tableQueried = table
      const chain = {
        select: () => chain,
        eq: (col, val) => {
          queryEqs[col] = val
          return chain
        },
        limit: () => chain,
        maybeSingle: () => Promise.resolve({ data: { id: 'liq-123', stato: 'definitiva' }, error: null }),
        then: (resolve) => Promise.resolve({ data: { id: 'liq-123', stato: 'definitiva' }, error: null }).then(resolve)
      }
      return chain
    }

    const res = await fetchLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30'
    })

    assert.strictEqual(tableQueried, 'liquidazione_iva')
    assert.strictEqual(queryEqs.societa_id, 'soc-123')
    assert.strictEqual(queryEqs.periodo_inizio, '2026-06-01')
    assert.strictEqual(queryEqs.periodo_fine, '2026-06-30')
    assert.strictEqual(res.data.id, 'liq-123')
    assert.strictEqual(res.data.stato, 'definitiva')
  })

  await t.test('4. getRigheLiquidazioneIvaSnapshot legge snapshot per liquidazione', async () => {
    let tableQueried = ''
    let queryEqs = {}

    sb.from = (table) => {
      tableQueried = table
      const chain = {
        select: () => chain,
        eq: (col, val) => {
          queryEqs[col] = val
          return chain
        },
        order: () => Promise.resolve({ data: [{ id: 'snap-1', imponibile: 100 }], error: null }),
        then: (resolve) => Promise.resolve({ data: [{ id: 'snap-1', imponibile: 100 }], error: null }).then(resolve)
      }
      return chain
    }

    const res = await fetchRigheLiquidazioneIvaSnapshot('liq-123')

    assert.strictEqual(tableQueried, 'liquidazioni_iva_righe')
    assert.strictEqual(queryEqs.liquidazione_id, 'liq-123')
    assert.deepEqual(res.data, [{ id: 'snap-1', imponibile: 100 }])
  })

  await t.test('5. isIvaPeriodLiquidated blocca solo per stato=definitiva ed esclude provvisoria', async () => {
    let tableQueried = ''
    let queryEqs = {}

    sb.from = (table) => {
      tableQueried = table
      const chain = {
        select: () => chain,
        eq: (col, val) => {
          queryEqs[col] = val
          return chain
        },
        lte: () => chain,
        gte: () => chain,
        limit: () => Promise.resolve({ data: [], error: null }),
        then: (resolve) => Promise.resolve({ data: [], error: null }).then(resolve)
      }
      return chain
    }

    const resFalse = await isIvaPeriodLiquidated('soc-123', '2026-06-15')
    assert.strictEqual(tableQueried, 'liquidazione_iva')
    assert.strictEqual(queryEqs.stato, 'definitiva') // Criterio fondamentale!
    assert.strictEqual(resFalse, false)

    // Simuliamo che esista un record con stato=definitiva
    sb.from = (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        lte: () => chain,
        gte: () => chain,
        limit: () => Promise.resolve({ data: [{ id: 'liq-123' }], error: null }),
        then: (resolve) => Promise.resolve({ data: [{ id: 'liq-123' }], error: null }).then(resolve)
      }
      return chain
    }

    const resTrue = await isIvaPeriodLiquidated('soc-123', '2026-06-15')
    assert.strictEqual(resTrue, true)
  })

  await t.test('6. Non viene effettuata alcuna chiamata a tabelle legacy deprecate', async () => {
    let tableQueried = ''
    sb.from = (table) => {
      tableQueried = table
      if (table === 'liquidazioni_iva_societa') {
        assert.fail('Errore: Rilevata chiamata a tabella legacy liquidazioni_iva_societa')
      }
      if (table === 'accounting_entries') {
        assert.fail('Errore: Rilevata chiamata a tabella legacy accounting_entries')
      }
      return makeChainableMock([])
    }

    await isIvaPeriodLiquidated('soc-123', '2026-06-15')
    await fetchLiquidazioneIvaDefinitiva({ societaId: 'soc-123', periodoInizio: '2026-06-01', periodoFine: '2026-06-30' })
    assert.ok(tableQueried !== 'liquidazioni_iva_societa')
    assert.ok(tableQueried !== 'accounting_entries')
  })
})
