import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import {
  preparaConsolidamentoLiquidazioneIvaDefinitiva,
  consolidaLiquidazioneIvaDefinitivaDaPeriodo
} from '../src/modules/contabilita/application/liquidazioneIvaDefinitivaOrchestrator.js'

// Save original methods
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

test('Liquidazione IVA Definitiva Orchestrator Suite', async (t) => {

  t.afterEach(() => {
    sb.rpc = originalRpc
    sb.from = originalFrom
  })

  await t.test('1. input mancante blocca prima di leggere righe', async () => {
    let selectCalled = false
    sb.from = (table) => {
      selectCalled = true
      return makeChainableMock([])
    }

    // Missing societaId
    await assert.rejects(
      async () => {
        await preparaConsolidamentoLiquidazioneIvaDefinitiva({
          periodoInizio: '2026-06-01',
          periodoFine: '2026-06-30',
          tipoPeriodicita: 'mensile',
          operatoreStudioId: 'op-123'
        })
      },
      /societaId è obbligatorio/
    )

    // Missing operatoreStudioId
    await assert.rejects(
      async () => {
        await preparaConsolidamentoLiquidazioneIvaDefinitiva({
          societaId: 'soc-123',
          periodoInizio: '2026-06-01',
          periodoFine: '2026-06-30',
          tipoPeriodicita: 'mensile'
        })
      },
      /operatoreStudioId è obbligatorio/
    )

    // Invalid periodicita
    await assert.rejects(
      async () => {
        await preparaConsolidamentoLiquidazioneIvaDefinitiva({
          societaId: 'soc-123',
          periodoInizio: '2026-06-01',
          periodoFine: '2026-06-30',
          tipoPeriodicita: 'annuale',
          operatoreStudioId: 'op-123'
        })
      },
      /tipoPeriodicita deve essere "mensile" o "trimestrale"/
    )

    assert.strictEqual(selectCalled, false, 'Should not query DB if validation fails')
  })

  await t.test('2. periodo valido legge righe liquidabili dal repo', async () => {
    let selectCalled = false
    let queriedTable = ''

    sb.from = (table) => {
      if (table === 'registri_iva') {
        selectCalled = true
        queriedTable = table
      }
      return makeChainableMock([])
    }

    await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.strictEqual(selectCalled, true)
    assert.strictEqual(queriedTable, 'registri_iva')
  })

  await t.test('3. chiama il domain service e costruisce payload RPC coerente con valori calcolati', async () => {
    sb.from = (table) => {
      if (table === 'registri_iva') {
        return makeChainableMock([
          {
            id: 'reg-1',
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
          },
          {
            id: 'reg-2',
            societa_id: 'soc-123',
            tipo: 'acquisto',
            imponibile: 500,
            iva: 110,
            iva_detraibile: 110,
            iva_indetraibile: 0,
            aliquota: 22,
            data: '2026-06-20',
            esigibilita: 'immediata',
            split_payment: false,
            prima_nota_id: 'pn-2',
            causale_iva_id: 'c-iva-1',
            causali_iva: { reverse_charge: false, natura: null }
          }
        ])
      }
      return makeChainableMock([])
    }

    const prep = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.ok(prep.payloadCalcoloRpc)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaVenditeLorda, 220)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaAcquistiDetraibile, 110)
    assert.strictEqual(prep.payloadCalcoloRpc.debitoPeriodo, 110)
    assert.strictEqual(prep.payloadCalcoloRpc.debitoDaVersare, 110)
    assert.strictEqual(prep.payloadCalcoloRpc.righe.length, 2)
    assert.strictEqual(prep.payloadCalcoloRpc.righe[0].id, 'reg-1')
    assert.strictEqual(prep.payloadCalcoloRpc.righe[0].inclusa_in_liquidazione, true)
  })

  await t.test('4. propaga errore di lettura righe', async () => {
    sb.from = (table) => {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        then: (resolve) => Promise.resolve({ data: null, error: { message: 'DB Connection Timeout' } }).then(resolve)
      }
      return chain
    }

    await assert.rejects(
      async () => {
        await preparaConsolidamentoLiquidazioneIvaDefinitiva({
          societaId: 'soc-123',
          periodoInizio: '2026-06-01',
          periodoFine: '2026-06-30',
          tipoPeriodicita: 'mensile',
          operatoreStudioId: 'op-123'
        })
      },
      /DB Connection Timeout/
    )
  })

  await t.test('5. propaga errore di calcolo', async () => {
    // We use our Proxy trick to throw an error inside the calculator
    const throwingRow = new Proxy({ societa_id: 'soc-123' }, {
      get(target, prop) {
        throw new Error('Calculator Failure Mock')
      }
    })

    sb.from = (table) => {
      return makeChainableMock([throwingRow])
    }

    await assert.rejects(
      async () => {
        await preparaConsolidamentoLiquidazioneIvaDefinitiva({
          societaId: 'soc-123',
          periodoInizio: '2026-06-01',
          periodoFine: '2026-06-30',
          tipoPeriodicita: 'mensile',
          operatoreStudioId: 'op-123'
        })
      },
      /Calculator Failure Mock/
    )
  })

  await t.test('6. propaga errore RPC', async () => {
    sb.from = (table) => makeChainableMock([])
    sb.rpc = (name, args) => {
      return Promise.resolve({ data: null, error: { message: 'Overlap error' } })
    }

    const res = await consolidaLiquidazioneIvaDefinitivaDaPeriodo({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.strictEqual(res.data, null)
    assert.strictEqual(res.error.message, 'Overlap error')
  })

  await t.test('7. successo restituisce liquidazioneId, stato definitiva, periodo e totali', async () => {
    sb.from = (table) => makeChainableMock([])
    sb.rpc = (name, args) => {
      return Promise.resolve({
        data: {
          success: true,
          liquidazioneId: 'liq-456',
          stato: 'provvisoria',
          periodoInizio: '2026-06-01',
          periodoFine: '2026-06-30'
        },
        error: null
      })
    }

    const res = await consolidaLiquidazioneIvaDefinitivaDaPeriodo({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.strictEqual(res.error, null)
    assert.strictEqual(res.data.success, true)
    assert.strictEqual(res.data.liquidazioneId, 'liq-456')
    assert.strictEqual(res.data.stato, 'provvisoria')
  })

  await t.test('8. split payment escluso dal debito resta nel payload come evidenza separata', async () => {
    sb.from = (table) => {
      return makeChainableMock([
        {
          id: 'reg-1',
          societa_id: 'soc-123',
          tipo: 'vendita',
          imponibile: 1000,
          iva: 220,
          split_payment: true,
          causali_iva: { reverse_charge: false, natura: null }
        }
      ])
    }

    const prep = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.strictEqual(prep.payloadCalcoloRpc.ivaVenditeLorda, 220)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaSplitEsclusa, 220)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaDebitoEffettiva, 0)
    assert.strictEqual(prep.payloadCalcoloRpc.debitoPeriodo, 0)
  })

  await t.test('9. IVA per cassa differita esclusa e rilasciata inclusa restano distinguibili', async () => {
    sb.from = (table) => {
      return makeChainableMock([
        {
          id: 'reg-1',
          societa_id: 'soc-123',
          tipo: 'vendita',
          imponibile: 1000,
          iva: 220,
          esigibilita: 'differita',
          causali_iva: { reverse_charge: false, natura: null }
        },
        {
          id: 'reg-2',
          societa_id: 'soc-123',
          tipo: 'acquisto',
          imponibile: 500,
          iva: 110,
          iva_detraibile: 110,
          esigibilita: 'rilascio',
          causali_iva: { reverse_charge: false, natura: null }
        }
      ])
    }

    const prep = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.strictEqual(prep.payloadCalcoloRpc.ivaPerCassaDifferita, 220)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaPerCassaRilasciata, -110)
    assert.strictEqual(prep.risultatoCalcolo.ivaPerCassaRilasciataAcquisti, 110)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaVenditeLorda, 0) // Differita is excluded
    assert.strictEqual(prep.payloadCalcoloRpc.ivaAcquistiDetraibile, 110) // Rilasciata is included
    assert.strictEqual(prep.payloadCalcoloRpc.righe.find(r => r.id === 'reg-1').inclusa_in_liquidazione, false)
    assert.strictEqual(prep.payloadCalcoloRpc.righe.find(r => r.id === 'reg-2').inclusa_in_liquidazione, true)
  })

  await t.test('10. nessuna chiamata a tabelle legacy', async () => {
    let queriedLegacy = false
    sb.from = (table) => {
      if (table === 'liquidazioni_iva_societa' || table === 'accounting_entries') {
        queriedLegacy = true
      }
      return makeChainableMock([])
    }

    await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.strictEqual(queriedLegacy, false, 'Should not query legacy tables')
  })
})
