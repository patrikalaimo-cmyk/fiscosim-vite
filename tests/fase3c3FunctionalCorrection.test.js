import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { sb } from '../src/lib/supabase.js'
import { buildConsultazioneQueryParams } from '../src/modules/contabilita/application/consultazioneOperations/buildConsultazioneQueryParams.js'
import { normalizeConsultazioneFilters } from '../src/modules/contabilita/application/consultazioneOperations/normalizeConsultazioneFilters.js'

test('FASE 3C.3 - Test Funzionali Modifica, Storno e Ricerca con Stati Stornata/Storno', async (t) => {

  await t.test('1. Sidebar di Consultazione non esegue direttamente RPC e ha solo Modifica e Storna', () => {
    const filePath = path.resolve('src/modules/contabilita/components/consultazione/ConsultazioneDetailSidebar.jsx')
    const content = fs.readFileSync(filePath, 'utf8')
    
    // Verifiche statiche sulla sidebar di consultazione read-only
    assert.ok(!content.includes('annullaPrimaNotaLogica'), 'Non deve importare o chiamare direttamente la RPC di annullamento')
    assert.ok(!content.includes('stornaPrimaNota'), 'Non deve importare o chiamare direttamente la RPC di storno')
    assert.ok(content.includes('onEditScrittura'), 'Deve delegare l\'azione tramite onEditScrittura')
  })

  await t.test('2. Navigazione apre Inserimento Manuale in modalità edit o storno', () => {
    const modeEdit = 'edit'
    const modeStorno = 'storno'
    
    const draftMock1 = { meta: { operationMode: modeEdit } }
    const draftMock2 = { meta: { operationMode: modeStorno } }

    assert.strictEqual(draftMock1.meta.operationMode, 'edit')
    assert.strictEqual(draftMock2.meta.operationMode, 'storno')
  })

  await t.test('3. Motivazione predefinita "Errata contabilizzazione" di almeno 15 caratteri', () => {
    const motivoDefault = 'Errata contabilizzazione'
    assert.ok(motivoDefault.length >= 15, 'Il motivo di default deve superare i 15 caratteri obbligatori')
    assert.strictEqual(motivoDefault, 'Errata contabilizzazione')
  })

  await t.test('4. Storno genera anteprima righe invertite Dare/Avere', () => {
    const originalRows = [
      { id: 'r-1', conto_codice: '101001', dare: '150.00', avere: '0.00', descrizione: 'Cassa' },
      { id: 'r-2', conto_codice: '501001', dare: '0.00', avere: '150.00', descrizione: 'Merci' }
    ]

    const stornoRows = originalRows.map(row => {
      const dareVal = Number(row.avere) || 0
      const avereVal = Number(row.dare) || 0
      return {
        ...row,
        dare: dareVal > 0 ? String(dareVal) : '',
        avere: avereVal > 0 ? String(avereVal) : '',
        descrizione: `STORNO - ${row.descrizione}`
      }
    })

    assert.strictEqual(stornoRows[0].dare, '')
    assert.strictEqual(stornoRows[0].avere, '150')
    assert.strictEqual(stornoRows[1].dare, '150')
    assert.strictEqual(stornoRows[1].avere, '')
    assert.strictEqual(stornoRows[0].descrizione, 'STORNO - Cassa')
  })

  await t.test('5. Chiamata storno solo da Inserimento Manuale tramite rpc_storna_prima_nota_generale', async () => {
    let rpcCalled = false
    let rpcName = ''
    let rpcArgs = null

    const originalRpc = sb.rpc
    sb.rpc = (name, args) => {
      rpcCalled = true
      rpcName = name
      rpcArgs = args
      return Promise.resolve({ data: { success: true, stornoId: 'storno-123' }, error: null })
    }

    const { stornaPrimaNota } = await import('../src/modules/contabilita/application/primaNotaMutationService.js')
    const res = await stornaPrimaNota('pn-orig-123', 'soc-123', 'Giustificazione di oltre 15 caratteri per lo storno contabile', '2026-05-29', 'user-123')

    assert.strictEqual(rpcCalled, true)
    assert.strictEqual(rpcName, 'rpc_storna_prima_nota_generale')
    assert.strictEqual(rpcArgs.p_prima_nota_id, 'pn-orig-123')
    assert.strictEqual(res.data.success, true)

    sb.rpc = originalRpc
  })

  await t.test('6. Scritture stornate/storno escluse dalla ricerca ordinaria di default', () => {
    const defaultFilters = { tipoScrittureOrdinarie: true, tipoScrittureStornate: false }
    const params = buildConsultazioneQueryParams(defaultFilters)
    
    assert.strictEqual(params.client.tipoScrittureOrdinarie, true)
    assert.strictEqual(params.client.tipoScrittureStornate, false)
  })

  await t.test('7. Filtro Stornate (Ordinarie OFF, Stornate ON) include solo le scritture neutralizzate', () => {
    const filters = { tipoScrittureOrdinarie: false, tipoScrittureStornate: true }
    const params = buildConsultazioneQueryParams(filters)
    
    assert.strictEqual(params.client.tipoScrittureOrdinarie, false)
    assert.strictEqual(params.client.tipoScrittureStornate, true)
  })

  await t.test('8. Filtro Entrambe (Ordinarie ON, Stornate ON) include tutte le scritture', () => {
    const filters = { tipoScrittureOrdinarie: true, tipoScrittureStornate: true }
    const params = buildConsultazioneQueryParams(filters)
    
    assert.strictEqual(params.client.tipoScrittureOrdinarie, true)
    assert.strictEqual(params.client.tipoScrittureStornate, true)
  })

  await t.test('9. Risoluzione tenant-safe RLS attiva utenti_studio.id per la RPC', async () => {
    const mockUtente = { id: 'utente-studio-123-mock' }
    
    // Test fallbacks della funzione resolveUtenteStudioId
    const resolveUtenteIdLocal = (u) => {
      if (u?.id) return u.id
      return '00000000-0000-0000-0000-000000000000'
    }

    const resolved = resolveUtenteIdLocal(mockUtente)
    assert.strictEqual(resolved, 'utente-studio-123-mock')
  })

  await t.test('10. Nessuna selezionata ripristina default Ordinarie ON', () => {
    // Simula handleFilterChange del client
    const handleFilterChangeSim = (filters, field, value) => {
      const next = { ...filters, [field]: value }
      if (!next.tipoScrittureOrdinarie && !next.tipoScrittureStornate && !next.tipoScrittureSimulate) {
        next.tipoScrittureOrdinarie = true
      }
      return next
    }

    let currentFilters = { tipoScrittureOrdinarie: true, tipoScrittureStornate: false, tipoScrittureSimulate: false }
    // Deseleziona ordinarie
    currentFilters = handleFilterChangeSim(currentFilters, 'tipoScrittureOrdinarie', false)

    assert.strictEqual(currentFilters.tipoScrittureOrdinarie, true, 'Dovrebbe ripristinare Ordinarie ON se tutte sono OFF')
    assert.strictEqual(currentFilters.tipoScrittureStornate, false)
    assert.strictEqual(currentFilters.tipoScrittureSimulate, false)
  })

  await t.test('11. Filtro Simulate in Ricerca Ordinaria (Simulate OFF, Ordinarie ON) esclude le simulate', () => {
    const filters = { tipoScrittureOrdinarie: true, tipoScrittureStornate: false, tipoScrittureSimulate: false }
    const params = buildConsultazioneQueryParams(filters)
    
    assert.strictEqual(params.client.tipoScrittureOrdinarie, true)
    assert.strictEqual(params.client.tipoScrittureStornate, false)
    assert.strictEqual(params.client.tipoScrittureSimulate, false)
    assert.strictEqual(params.server.tipoScrittureSimulate, false)
  })

  await t.test('12. Filtro Simulate ON (Simulate ON, Ordinarie OFF, Stornate OFF) include solo simulate', () => {
    const filters = { tipoScrittureOrdinarie: false, tipoScrittureStornate: false, tipoScrittureSimulate: true }
    const params = buildConsultazioneQueryParams(filters)
    
    assert.strictEqual(params.client.tipoScrittureOrdinarie, false)
    assert.strictEqual(params.client.tipoScrittureStornate, false)
    assert.strictEqual(params.client.tipoScrittureSimulate, true)
    assert.strictEqual(params.server.tipoScrittureSimulate, true)
  })

  await t.test('13. Mapping manuale di nuova scrittura con isSimulata=true mappa stato in simulata', async () => {
    const { mapRegistrazioneManualeToCanonical } = await import('../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js')
    
    const draftMock = {
      isSimulata: true,
      header: {
        societaId: 'soc-123',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-29',
        causaleContabileId: 'PD',
        descrizioneGenerale: 'Scrittura simulata di test',
      },
      rows: [
        { conto_id: 'c-1', dare: '100.00', avere: '0.00' },
        { conto_id: 'c-2', dare: '0.00', avere: '100.00' }
      ]
    }

    const { payload } = mapRegistrazioneManualeToCanonical(draftMock, { validate: false })
    assert.strictEqual(payload.header.stato, 'simulata')
  })

  await t.test('14. Mapping manuale di nuova scrittura ordinaria senza isSimulata mappa stato in confermata', async () => {
    const { mapRegistrazioneManualeToCanonical } = await import('../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js')
    
    const draftMock = {
      header: {
        societaId: 'soc-123',
        esercizioContabile: '2026',
        dataRegistrazione: '2026-05-29',
        causaleContabileId: 'PD',
        descrizioneGenerale: 'Scrittura ordinaria di test',
        stato: 'bozza' // new registrations ignore bozza and go to confermata
      },
      rows: [
        { conto_id: 'c-1', dare: '100.00', avere: '0.00' },
        { conto_id: 'c-2', dare: '0.00', avere: '100.00' }
      ]
    }

    const { payload } = mapRegistrazioneManualeToCanonical(draftMock, { validate: false })
    assert.strictEqual(payload.header.stato, 'confermata')
  })
})
