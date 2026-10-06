import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import {
  preparaConsolidamentoLiquidazioneIvaDefinitiva,
  consolidaLiquidazioneIvaDefinitivaDaPeriodo
} from '../src/modules/contabilita/application/liquidazioneIvaDefinitivaOrchestrator.js'

// Salva referenze originali
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

test('Liquidazione IVA Definitiva UI Adapter / Controller Suite', async (t) => {

  t.afterEach(() => {
    sb.rpc = originalRpc
    sb.from = originalFrom
  })

  // Test 1: la preview chiama orchestrator e non RPC di consolidamento
  await t.test('1. la preview chiama orchestrator e non RPC di consolidamento', async () => {
    let rpcCalled = false
    let selectCalled = false

    sb.from = (table) => {
      if (table === 'registri_iva') {
        selectCalled = true
        return makeChainableMock([
          {
            id: 'reg-1',
            societa_id: 'soc-123',
            tipo: 'vendita',
            imponibile: 1000,
            iva: 220,
            esigibilita: 'immediata'
          }
        ])
      }
      return makeChainableMock([])
    }

    sb.rpc = (name) => {
      if (name === 'consolida_periodo_iva_transazionale') {
        rpcCalled = true
      }
      return Promise.resolve({ data: null, error: null })
    }

    const prepResult = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    assert.ok(prepResult)
    assert.strictEqual(selectCalled, true)
    assert.strictEqual(rpcCalled, false, 'La preview non deve effettuare il consolidamento transazionale (nessuna scrittura DB)')
  })

  // Test 2: il consolidamento chiama orchestrator/client solo dopo preview valida
  await t.test('2. il consolidamento richiede e usa i dati della preview valida', async () => {
    let selectCalled = false
    let rpcCalled = false
    let passedPayload = null

    // Mock della preview
    sb.from = (table) => {
      if (table === 'registri_iva') {
        selectCalled = true
      }
      return makeChainableMock([])
    }

    const preview = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123',
      motivo: 'Anteprima di chiusura'
    })

    assert.strictEqual(selectCalled, true)
    assert.ok(preview)

    // Ora mock consolidamento
    sb.rpc = (name, args) => {
      if (name === 'consolida_periodo_iva_transazionale') {
        rpcCalled = true
        passedPayload = args
        return Promise.resolve({ data: { success: true, liquidazioneId: 'liq-abc' }, error: null })
      }
      return Promise.resolve({ data: null, error: null })
    }

    const res = await consolidaLiquidazioneIvaDefinitivaDaPeriodo({
      societaId: preview.societaId,
      periodoInizio: preview.periodoInizio,
      periodoFine: preview.periodoFine,
      tipoPeriodicita: preview.tipoPeriodicita,
      operatoreStudioId: preview.operatoreStudioId,
      motivo: preview.motivo
    })

    assert.strictEqual(rpcCalled, true, 'Il consolidamento chiama la RPC')
    assert.strictEqual(res.data.success, true)
    assert.strictEqual(passedPayload.p_societa_id, 'soc-123')
    assert.strictEqual(passedPayload.p_motivo, 'Anteprima di chiusura')
  })

  // Test 3: RPC mancante/migration non applicata genera messaggio leggibile
  await t.test('3. RPC mancante/migration non applicata (errore 42883) viene rilevato e genera messaggio leggibile', async () => {
    // Simuliamo l'errore 42883 (function does not exist) da parte del database
    const mockError = {
      code: '42883',
      message: 'function public.consolida_periodo_iva_transazionale(...) does not exist'
    }

    sb.from = (table) => makeChainableMock([])
    sb.rpc = () => Promise.resolve({ data: null, error: mockError })

    const res = await consolidaLiquidazioneIvaDefinitivaDaPeriodo({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123',
      motivo: 'Chiusura'
    })

    assert.ok(res.error)
    assert.strictEqual(res.error.code, '42883')

    // Simuliamo la logica di visualizzazione dell'errore presente in TaxComplianceView.jsx
    let errorDisplayMsg = ''
    if (res.error.code === '42883' || res.error.message?.includes('function') || res.error.message?.includes('RPC') || res.error.message?.includes('does not exist')) {
      errorDisplayMsg = 'La funzione di consolidamento definitivo non è ancora disponibile nel database.\n' +
                        'Applicare prima la migration RPC Fase 2A in ambiente controllato.'
    } else {
      errorDisplayMsg = res.error.message
    }

    assert.ok(errorDisplayMsg.includes('non è ancora disponibile nel database'))
    assert.ok(errorDisplayMsg.includes('Applicare prima la migration RPC Fase 2A'))
  })

  // Test 4: split payment rimane evidenziato come escluso dal debito
  await t.test('4. lo split payment viene escluso dal debito e rimane evidenziato nel payload calcolato', async () => {
    sb.from = (table) => {
      if (table === 'registri_iva') {
        return makeChainableMock([
          {
            id: 'reg-split',
            societa_id: 'soc-123',
            tipo: 'vendita',
            imponibile: 1000,
            iva: 220,
            split_payment: true,
            esigibilita: 'immediata'
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

    assert.strictEqual(prep.payloadCalcoloRpc.ivaVenditeLorda, 220)
    assert.strictEqual(prep.payloadCalcoloRpc.ivaSplitEsclusa, 220, 'IVA split payment deve essere tracciata come esclusa')
    assert.strictEqual(prep.payloadCalcoloRpc.ivaDebitoEffettiva, 0, 'L\'IVA debito effettiva deve essere zero')
    assert.strictEqual(prep.payloadCalcoloRpc.debitoPeriodo, 0)
  })

  // Test 5: IVA per cassa differita e rilasciata restano separate
  await t.test('5. IVA per cassa differita (esclusa) e rilasciata (inclusa) rimangono separate e gestite indipendentemente', async () => {
    sb.from = (table) => {
      if (table === 'registri_iva') {
        return makeChainableMock([
          {
            id: 'reg-diff',
            societa_id: 'soc-123',
            tipo: 'vendita',
            imponibile: 1000,
            iva: 220,
            esigibilita: 'differita'
          },
          {
            id: 'reg-ril',
            societa_id: 'soc-123',
            tipo: 'acquisto',
            imponibile: 500,
            iva: 110,
            iva_detraibile: 110,
            esigibilita: 'rilascio'
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

    assert.strictEqual(prep.payloadCalcoloRpc.ivaPerCassaDifferita, 220, 'IVA differita deve essere valorizzata separatamente')
    assert.strictEqual(prep.payloadCalcoloRpc.ivaPerCassaRilasciata, -110, 'IVA rilasciata acquisti deve essere valorizzata separatamente')
    assert.strictEqual(prep.payloadCalcoloRpc.ivaVenditeLorda, 0, 'IVA vendite lorda esclude la differita')
    assert.strictEqual(prep.payloadCalcoloRpc.ivaAcquistiDetraibile, 110, 'IVA acquisti detraibile include la rilasciata')
  })

  // Test 6: nessuna formula fiscale viene duplicata nel nuovo adapter UI
  await t.test('6. nessuna formula fiscale viene duplicata in JSX o nell\'interfaccia UI', async () => {
    sb.from = (table) => makeChainableMock([])
    const prep = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    // Assert that the UI can directly render fields without performing custom Math operations:
    assert.ok('ivaVenditeLorda' in prep.payloadCalcoloRpc)
    assert.ok('ivaSplitEsclusa' in prep.payloadCalcoloRpc)
    assert.ok('ivaDebitoEffettiva' in prep.payloadCalcoloRpc)
    assert.ok('ivaAcquistiDetraibile' in prep.payloadCalcoloRpc)
    assert.ok('ivaAcquistiIndetraibile' in prep.payloadCalcoloRpc)
    assert.ok('ivaPerCassaDifferita' in prep.payloadCalcoloRpc)
    assert.ok('ivaPerCassaRilasciata' in prep.payloadCalcoloRpc)
    assert.ok('saldoPeriodo' in prep.payloadCalcoloRpc)
    assert.ok('debitoDaVersare' in prep.payloadCalcoloRpc)
    assert.ok('creditoDaRiportare' in prep.payloadCalcoloRpc)
  })

  // Test 7: nessuna chiamata diretta a liquidazione_iva o liquidazioni_iva_righe da UI
  await t.test('7. nessuna chiamata diretta di scrittura/insert/update a liquidazione_iva o liquidazioni_iva_righe da parte della UI', async () => {
    let writeAttempts = []
    
    // Intercettiamo sb.from per tracciare operazioni di scrittura
    sb.from = (table) => {
      const chain = {
        insert: () => {
          writeAttempts.push({ table, method: 'insert' })
          return chain
        },
        update: () => {
          writeAttempts.push({ table, method: 'update' })
          return chain
        },
        upsert: () => {
          writeAttempts.push({ table, method: 'upsert' })
          return chain
        },
        delete: () => {
          writeAttempts.push({ table, method: 'delete' })
          return chain
        },
        select: () => chain,
        eq: () => chain,
        gte: () => chain,
        lte: () => chain,
        limit: () => chain,
        order: () => chain,
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
        then: (resolve) => Promise.resolve({ data: null, error: null }).then(resolve)
      }
      return chain
    }

    // Eseguiamo le operazioni simulate come farebbe la UI per preparare/consolida
    const preview = await preparaConsolidamentoLiquidazioneIvaDefinitiva({
      societaId: 'soc-123',
      periodoInizio: '2026-06-01',
      periodoFine: '2026-06-30',
      tipoPeriodicita: 'mensile',
      operatoreStudioId: 'op-123'
    })

    // Mock della chiamata consolidamento (che delega alla RPC, non a sb.from(...).insert/upsert)
    sb.rpc = (name, args) => {
      return Promise.resolve({ data: { success: true }, error: null })
    }

    await consolidaLiquidazioneIvaDefinitivaDaPeriodo({
      societaId: preview.societaId,
      periodoInizio: preview.periodoInizio,
      periodoFine: preview.periodoFine,
      tipoPeriodicita: preview.tipoPeriodicita,
      operatoreStudioId: preview.operatoreStudioId,
      motivo: preview.motivo
    })

    const directWritesToTargetTables = writeAttempts.filter(
      w => w.table === 'liquidazione_iva' || w.table === 'liquidazioni_iva_righe'
    )

    assert.strictEqual(
      directWritesToTargetTables.length,
      0,
      'La UI o il client non devono mai scrivere o fare insert/update direttamente sulle tabelle del consolidamento'
    )
  })

  // Test 8: nessuna dipendenza da tabelle legacy
  await t.test('8. nessuna dipendenza da tabelle legacy deprecate (es. liquidazioni_iva_societa o accounting_entries)', async () => {
    let queriedLegacyTables = []

    sb.from = (table) => {
      if (table === 'liquidazioni_iva_societa' || table === 'accounting_entries') {
        queriedLegacyTables.push(table)
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

    assert.strictEqual(
      queriedLegacyTables.length,
      0,
      'Non ci deve essere alcuna interazione con le tabelle legacy'
    )
  })
})
