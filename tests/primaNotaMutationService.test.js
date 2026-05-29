import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import {
  getOperationGuards,
  updatePrimaNotaControllata,
  annullaPrimaNotaLogica,
  stornaPrimaNota,
} from '../src/modules/contabilita/application/primaNotaMutationService.js'

// Salvataggio del metodo rpc originale per il ripristino post-test
const originalRpc = sb.rpc

test('PrimaNotaMutationService — Suite di Test per Modifiche e Storni Controllati (RPC)', async (t) => {

  t.afterEach(() => {
    sb.rpc = originalRpc
  })

  await t.test('1. getOperationGuards chiama correttamente l\'RPC con i parametri corretti', async () => {
    let rpcCalled = false
    let rpcName = ''
    let rpcArgs = null

    sb.rpc = (name, args) => {
      rpcCalled = true
      rpcName = name
      rpcArgs = args
      return Promise.resolve({
        data: {
          can_execute: true,
          blocking_reasons: [],
          warnings: ['Avviso test'],
          suggested_action: 'procedi'
        },
        error: null
      })
    }

    const res = await getOperationGuards('pn-uuid-123', 'soc-uuid-456', 'UPDATE')
    
    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(rpcName, 'rpc_get_prima_nota_operation_guards')
    assert.deepEqual(rpcArgs, {
      p_prima_nota_id: 'pn-uuid-123',
      p_societa_id: 'soc-uuid-456',
      p_operation_type: 'UPDATE'
    })
    assert.strictEqual(res.data.can_execute, true)
    assert.strictEqual(res.data.suggested_action, 'procedi')
    assert.deepEqual(res.data.warnings, ['Avviso test'])
  })

  await t.test('2. getOperationGuards blocca preventivamente in caso di parametri mancanti', async () => {
    const res = await getOperationGuards('', 'soc-uuid-456', 'UPDATE')
    assert.strictEqual(res.data.can_execute, false)
    assert.deepEqual(res.data.blocking_reasons, ['Parametri obbligatori mancanti per getOperationGuards.'])
  })

  await t.test('3. updatePrimaNotaControllata blocca localmente se il motivo ha meno di 15 caratteri', async () => {
    let rpcCalled = false
    sb.rpc = () => {
      rpcCalled = true
      return Promise.resolve({ data: {}, error: null })
    }

    const res = await updatePrimaNotaControllata(
      'pn-uuid-123',
      'soc-uuid-456',
      { data_registrazione: '2026-05-29' },
      [{ riga_numero: 1, importo_dare: 100 }],
      'Corto',
      'user-uuid-999'
    )

    assert.strictEqual(rpcCalled, false)
    assert.strictEqual(res.data.success, false)
    assert.deepEqual(res.data.blockers, ['Il motivo della modifica deve contenere almeno 15 caratteri per finalità di audit.'])
  })

  await t.test('4. updatePrimaNotaControllata invoca rpc_update_prima_nota_generale_controllata se i parametri sono validi', async () => {
    let rpcCalled = false
    let rpcName = ''
    let rpcArgs = null

    sb.rpc = (name, args) => {
      rpcCalled = true
      rpcName = name
      rpcArgs = args
      return Promise.resolve({
        data: { success: true, primaNotaId: 'pn-uuid-123', versione: 2, message: 'OK' },
        error: null
      })
    }

    const header = { data_registrazione: '2026-05-29', causale_codice: 'GEN' }
    const rows = [{ riga_numero: 1, conto_id: 'conto-1', importo_dare: 100, importo_avere: 0 }]
    const motivo = 'Modifica giustificata di oltre 15 caratteri contabili'

    const res = await updatePrimaNotaControllata('pn-uuid-123', 'soc-uuid-456', header, rows, motivo, 'user-uuid-999')

    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(rpcName, 'rpc_update_prima_nota_generale_controllata')
    assert.deepEqual(rpcArgs, {
      p_prima_nota_id: 'pn-uuid-123',
      p_societa_id: 'soc-uuid-456',
      p_header: header,
      p_rows: rows,
      p_motivo: motivo,
      p_utente_id: 'user-uuid-999'
    })
    assert.strictEqual(res.data.success, true)
    assert.strictEqual(res.data.versione, 2)
  })

  await t.test('5. annullaPrimaNotaLogica richiede una giustificazione valida e chiama l\'RPC', async () => {
    let rpcCalled = false
    let rpcName = ''
    let rpcArgs = null

    sb.rpc = (name, args) => {
      rpcCalled = true
      rpcName = name
      rpcArgs = args
      return Promise.resolve({
        data: { success: true, primaNotaId: 'pn-uuid-123', message: 'Annullata' },
        error: null
      })
    }

    const motivo = 'Annullamento della registrazione a causa di duplicato fattura'
    const res = await annullaPrimaNotaLogica('pn-uuid-123', 'soc-uuid-456', motivo, 'user-uuid-999')

    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(rpcName, 'rpc_annulla_prima_nota_logica')
    assert.deepEqual(rpcArgs, {
      p_prima_nota_id: 'pn-uuid-123',
      p_societa_id: 'soc-uuid-456',
      p_motivo: motivo,
      p_utente_id: 'user-uuid-999'
    })
    assert.strictEqual(res.data.success, true)
  })

  await t.test('6. stornaPrimaNota invoca l\'RPC rpc_storna_prima_nota_generale con storno speculare', async () => {
    let rpcCalled = false
    let rpcName = ''
    let rpcArgs = null

    sb.rpc = (name, args) => {
      rpcCalled = true
      rpcName = name
      rpcArgs = args
      return Promise.resolve({
        data: { success: true, stornoId: 'storno-uuid-777', numeroStorno: 101, message: 'Stornata' },
        error: null
      })
    }

    const motivo = 'Storno per errata imputazione conto patrimoniale'
    const res = await stornaPrimaNota('pn-uuid-123', 'soc-uuid-456', motivo, '2026-05-29', 'user-uuid-999')

    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(rpcName, 'rpc_storna_prima_nota_generale')
    assert.deepEqual(rpcArgs, {
      p_prima_nota_id: 'pn-uuid-123',
      p_societa_id: 'soc-uuid-456',
      p_motivo: motivo,
      p_data_storno: '2026-05-29',
      p_utente_id: 'user-uuid-999'
    })
    assert.strictEqual(res.data.success, true)
    assert.strictEqual(res.data.stornoId, 'storno-uuid-777')
  })

  await t.test('7. I nuovi servizi contabili non eseguono mai rimozioni fisiche delete + reinsert', async () => {
    // Verifichiamo che l'integrazione non contenga cancellazioni fisiche silenziose
    let deleteInvoked = false
    sb.rpc = () => Promise.resolve({ data: { success: true }, error: null })
    
    // Intercettiamo chiamate generiche sulla tabella nel caso in cui qualcuno provasse a fare fallback
    const originalFrom = sb.from
    sb.from = (table) => {
      return {
        delete: () => {
          deleteInvoked = true
          return { eq: () => Promise.resolve({ error: null }) }
        }
      }
    }

    await updatePrimaNotaControllata(
      'pn-uuid-123',
      'soc-uuid-456',
      { data_registrazione: '2026-05-29' },
      [],
      'Giustificazione valida per non scattare eliminazioni',
      'user-uuid-999'
    )

    sb.from = originalFrom
    assert.strictEqual(deleteInvoked, false, 'I nuovi servizi definitivi non devono mai invocare delete fisici client-side.')
  })

  await t.test('8. getOperationGuards con can_execute=false restituisce correttamente blocking_reasons', async () => {
    sb.rpc = () => Promise.resolve({
      data: {
        can_execute: false,
        blocking_reasons: ['Esercizio chiuso in sola lettura', 'Periodo chiuso definitivo'],
        warning_level: 'nero',
        warnings: [],
        suggested_action: 'blocca'
      },
      error: null
    })

    const res = await getOperationGuards('pn-uuid-123', 'soc-uuid-456', 'UPDATE')
    assert.strictEqual(res.data.can_execute, false)
    assert.strictEqual(res.data.warning_level, 'nero')
    assert.deepEqual(res.data.blocking_reasons, ['Esercizio chiuso in sola lettura', 'Periodo chiuso definitivo'])
  })

  await t.test('9. getOperationGuards supporta correttamente i warning level graduati (giallo, rosso, nero)', async () => {
    // Caso warning giallo (es. liquidazione IVA provvisoria)
    sb.rpc = () => Promise.resolve({
      data: {
        can_execute: true,
        blocking_reasons: [],
        warning_level: 'giallo',
        warnings: ['Attenzione: liquidazione IVA provvisoria esistente'],
        suggested_action: 'procedi_con_conferma'
      },
      error: null
    })

    const resGiallo = await getOperationGuards('pn-uuid-123', 'soc-uuid-456', 'UPDATE')
    assert.strictEqual(resGiallo.data.can_execute, true)
    assert.strictEqual(resGiallo.data.warning_level, 'giallo')
    assert.deepEqual(resGiallo.data.warnings, ['Attenzione: liquidazione IVA provvisoria esistente'])
  })

  await t.test('10. I mappers esportati per DB convertono correttamente le strutture dati della UI', async () => {
    const { mapPrimaNotaPayloadForDb, mapPrimaNotaRigaForDb } = await import('../src/modules/contabilita/application/persistPrimaNotaDraft.js')
    
    // Test mapper testata UI -> DB
    const uiHeader = {
      societaId: 'soc-123',
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-29',
      causaleCodice: 'GEN',
      descrizioneGenerale: 'Modifica test'
    }
    const dbHeader = mapPrimaNotaPayloadForDb(uiHeader)
    assert.strictEqual(dbHeader.societa_id, 'soc-123')
    assert.strictEqual(dbHeader.causale_codice, 'GEN')
    assert.strictEqual(dbHeader.esercizio, 2026)
    assert.strictEqual(dbHeader.descrizione, 'Modifica test')

    // Test mapper riga UI -> DB
    const uiRow = {
      accountId: 'conto-777',
      dare: '150.00',
      avere: ''
    }
    const dbRow = mapPrimaNotaRigaForDb(uiRow, 0)
    assert.strictEqual(dbRow.conto_id, 'conto-777')
    assert.strictEqual(dbRow.importo_dare, 150.00)
    assert.strictEqual(dbRow.importo_avere, 0)
    assert.strictEqual(dbRow.riga_numero, 1)
  })
})

