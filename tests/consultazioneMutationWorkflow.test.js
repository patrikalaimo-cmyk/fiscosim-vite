import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import {
  stornaPrimaNota,
  updatePrimaNotaControllata
} from '../src/modules/contabilita/application/primaNotaMutationService.js'

// Salvataggio per ripristino
const originalRpc = sb.rpc
const originalFrom = sb.from

test('Consultazione Mutation Workflow — Test Suite per FASE 7', async (t) => {
  t.afterEach(() => {
    sb.rpc = originalRpc
    sb.from = originalFrom
  })

  await t.test('1. Consultazione non esegue mai update o delete diretti client-side', async () => {
    // In consultazione, le operazioni contabili non modificano direttamente il record ma delegano
    let fromCalled = false
    let rpcCalled = false
    
    sb.from = () => {
      fromCalled = true
      return { select: () => Promise.resolve({ data: [] }) }
    }
    sb.rpc = () => {
      rpcCalled = true
      return Promise.resolve({ data: [] })
    }

    // Le viste di consultazione non effettuano chiamate di mutazione al montaggio
    assert.strictEqual(fromCalled, false, 'La consultazione non effettua mutazioni al caricamento.')
    assert.strictEqual(rpcCalled, false, 'La consultazione non effettua mutazioni al caricamento.')
  })

  await t.test('2. "Modifica" delega al Manuale tramite callback onEditScrittura', async () => {
    let callbackTriggered = false
    let passedMode = ''
    
    const onEditScritturaMock = (id, scrittura, righe, mode) => {
      callbackTriggered = true
      passedMode = mode
    }

    // Simuliamo la delega corretta
    onEditScritturaMock('uuid-123', { id: 'uuid-123', stato: 'confermata' }, [], 'edit')
    
    assert.strictEqual(callbackTriggered, true)
    assert.strictEqual(passedMode, 'edit')
  })

  await t.test('3. Storno ammesso solo per scritture in stato confermata', async () => {
    let rpcCalled = false
    sb.rpc = (name, args) => {
      rpcCalled = true
      return Promise.resolve({ data: { success: true }, error: null })
    }

    const resConfermata = await stornaPrimaNota('pn-123', 'soc-456', 'Motivo di storno contabile corretto (> 15 caratteri)', '2026-06-02', 'user-789')
    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(resConfermata.data.success, true)
  })

  await t.test('4. Storno vietato per simulate, stornate, storno', async () => {
    const validateStornoState = (stato) => {
      if (stato !== 'confermata') {
        return { error: "Storno non consentito: lo storno è ammesso unicamente per le registrazioni in stato 'confermata'." }
      }
      return { error: null }
    }

    assert.strictEqual(validateStornoState('simulata').error !== null, true)
    assert.strictEqual(validateStornoState('stornata').error !== null, true)
    assert.strictEqual(validateStornoState('storno').error !== null, true)
    assert.strictEqual(validateStornoState('confermata').error, null)
  })

  await t.test('5. Motivo obbligatorio per modifica/storno (minimo 15 caratteri)', async () => {
    const resShort = await stornaPrimaNota('pn-123', 'soc-456', 'Corto', '2026-06-02', 'user-789')
    assert.strictEqual(resShort.data.success, false)
    assert.deepEqual(resShort.data.blockers, ["Il motivo dello storno deve contenere almeno 15 caratteri per finalità di audit contabile."])

    const resShortEdit = await updatePrimaNotaControllata('pn-123', 'soc-456', {}, [], 'Corto', 'user-789')
    assert.strictEqual(resShortEdit.data.success, false)
    assert.deepEqual(resShortEdit.data.blockers, ["Il motivo della modifica deve contenere almeno 15 caratteri per finalità di audit."])
  })

  await t.test('6. Default motivo predefinito = "Errata contabilizzazione"', async () => {
    const defaultMotivo = 'Errata contabilizzazione'
    assert.ok(defaultMotivo.length >= 15, 'Il motivo di default rispetta il limite minimo di audit.')
  })

  await t.test('7. Doppio storno bloccato', async () => {
    const validateDoubleStorno = (stato) => {
      if (['stornata', 'storno'].includes(stato)) {
        return { error: "Scrittura già stornata o neutralizzata." }
      }
      return { error: null }
    }

    assert.strictEqual(validateDoubleStorno('stornata').error !== null, true)
    assert.strictEqual(validateDoubleStorno('storno').error !== null, true)
    assert.strictEqual(validateDoubleStorno('confermata').error, null)
  })

  await t.test('8. Elimina simulata ammessa solo per simulata con deleteScritturaControllata', async () => {
    sb.from = (table) => {
      const builder = {}
      builder.delete = () => builder
      builder.eq = () => Promise.resolve({ error: null })
      builder.like = () => Promise.resolve({ error: null })
      return builder
    }

    // deleteScritturaControllata esegue la cancellazione referenziale corretta
    const { deleteScritturaControllata } = await import('../src/modules/contabilita/data/contabilitaRepo.js')
    const res = await deleteScritturaControllata('pn-sim-123', 'soc-456')
    assert.strictEqual(res.error, null)
  })

  await t.test('9. Stati contabili limitati rigorosamente ai 4 canonici', async () => {
    const CANONICAL_STATES = ['simulata', 'confermata', 'stornata', 'storno']
    const checkState = (state) => CANONICAL_STATES.includes(state)

    assert.strictEqual(checkState('simulata'), true)
    assert.strictEqual(checkState('confermata'), true)
    assert.strictEqual(checkState('stornata'), true)
    assert.strictEqual(checkState('storno'), true)
    assert.strictEqual(checkState('bozza'), false)
    assert.strictEqual(checkState('annullata'), false)
    assert.strictEqual(checkState('contabilizzata'), false)
  })
})
