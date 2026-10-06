import test from 'node:test'
import assert from 'node:assert/strict'
import { buildRegistrazioneDraft } from '../src/modules/contabilita/application/registrazioneOperations/buildRegistrazioneDraft.js'
import { mapRegistrazioneManualeToCanonical } from '../src/modules/contabilita/canonical/mappers/mapRegistrazioneManualeToCanonical.js'
import { validateCanonicalAccountingPayload } from '../src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js'

function buildMockPianoConti() {
  return [
    { id: 'acc-1', codice: '501001', descrizione: 'Acquisti merci', tipo: 'costo', hierarchyType: 'sottoconto' },
    { id: 'acc-2', codice: '101001', descrizione: 'Cassa contanti', tipo: 'attivo', hierarchyType: 'sottoconto' },
    { id: 'acc-3', codice: '102001', descrizione: 'Banca c/c', tipo: 'attivo', hierarchyType: 'sottoconto' },
  ]
}

function buildBaseUiDraftInput() {
  return {
    societaId: 'soc-123',
    header: {
      esercizioContabile: '2026',
      dataRegistrazione: '2026-05-29',
      dataDocumento: '2026-05-29',
      causaleContabile: {
        id: 'caus-generale',
        codice: 'GEN',
        tipoCausale: 'generale',
        descrizione: 'Movimento Generale Semplice'
      },
      descrizioneGenerale: 'Registrazione generica',
      soggetto: '',
      clienteFornitoreId: '',
      clienteFornitoreNome: '',
    },
    rows: [
      { id: 'row-1', conto_id: 'acc-1', contoQuery: '501001 - Acquisti merci', dare: '100,00', avere: '', descrizione: 'Riga 1' },
      { id: 'row-2', conto_id: 'acc-2', contoQuery: '101001 - Cassa contanti', dare: '', avere: '100,00', descrizione: 'Riga 2' }
    ],
    documentData: { divisa: 'EUR' },
    ivaData: { active: false, rows: [] },
    partitarioData: { active: false, rows: [] },
    ritenutaData: { active: false, rows: [] }
  }
}

test('1. Movimento generale a 2 righe valido passa validazione', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'GEN', family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false }
  })

  assert.equal(result.validation.status, 'ok', 'La validazione UI del draft dovrebbe passare')
  assert.equal(result.totals.isBalanced, true, 'Dovrebbe essere bilanciato')

  const { payload, validationResult } = mapRegistrazioneManualeToCanonical(result.draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T00:16:27Z'
  })
  assert.ok(validationResult.isValid, `La validazione canonica dovrebbe passare, errori: ${validationResult.errors?.join(', ')}`)
  assert.equal(payload.postCommitTargets.shouldCreateIva, false)
  assert.equal(payload.postCommitTargets.shouldCreateLedger, false)
  assert.equal(payload.postCommitTargets.shouldCreateWithholding, false)
})

test('2. Movimento generale multi-riga valido passa validazione', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()

  // Imposta 3 righe (due in Dare da 50 e una in Avere da 100)
  input.rows = [
    { id: 'row-1', conto_id: 'acc-1', contoQuery: '501001 - Acquisti merci', dare: '50,00', avere: '', descrizione: 'Dare 1' },
    { id: 'row-2', conto_id: 'acc-1', contoQuery: '501001 - Acquisti merci', dare: '50,00', avere: '', descrizione: 'Dare 2' },
    { id: 'row-3', conto_id: 'acc-2', contoQuery: '101001 - Cassa contanti', dare: '', avere: '100,00', descrizione: 'Avere' }
  ]

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'GEN', family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false }
  })

  assert.equal(result.validation.status, 'ok')
  assert.equal(result.totals.isBalanced, true)

  const { validationResult } = mapRegistrazioneManualeToCanonical(result.draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T00:16:27Z'
  })
  assert.ok(validationResult.isValid)
})

test('3. Movimento generale sbilanciato bloccato', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()

  // Dare 100, Avere 80
  input.rows[1].avere = '80,00'

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'GEN', family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false }
  })

  assert.equal(result.validation.status, 'blocked', 'Sbilanciato deve essere bloccato nel draft UI')
  assert.equal(result.totals.isBalanced, false)

  const { validationResult } = mapRegistrazioneManualeToCanonical(result.draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T00:16:27Z'
  })
  assert.equal(validationResult.isValid, false, 'Sbilanciato deve fallire validazione canonica commit')
})

test('4. Movimento generale con riga vuota UI ignorata/normalizzata', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()

  // Aggiungi una terza riga completamente vuota
  input.rows.push({
    id: 'row-empty',
    conto_id: '',
    contoQuery: '',
    dare: '',
    avere: '',
    descrizione: ''
  })

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'GEN', family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false }
  })

  // La riga vuota deve essere ignorata, quindi la scrittura rimane bilanciata con 2 righe attive
  assert.equal(result.validation.status, 'ok', 'La riga vuota dovrebbe essere ignorata')
  assert.equal(result.totals.isBalanced, true)
  assert.equal(result.draft.rows.length, 2, 'Il draft compilato deve contenere solo le 2 righe attive')

  const { payload, validationResult } = mapRegistrazioneManualeToCanonical(result.draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T00:16:27Z'
  })
  assert.ok(validationResult.isValid)
  assert.equal(payload.accounting.rows.length, 2, 'Il payload canonico finale deve contenere solo le 2 righe attive')
})

test('5. Movimento generale senza IVA/partitario/ritenute non crea target non pertinenti', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'GEN', family: 'generale', showIvaPanel: true, showPartitario: true, showRitenute: true }
  })

  const { payload } = mapRegistrazioneManualeToCanonical(result.draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T00:16:27Z'
  })
  console.log('TARGETS TEST 5:', payload.postCommitTargets)

  // Non avendo inserito righe reali di IVA, partitario o ritenute, i target devono restare disattivati
  assert.equal(payload.postCommitTargets.shouldCreateIva, false)
  assert.equal(payload.postCommitTargets.shouldCreateLedger, false)
  assert.equal(payload.postCommitTargets.shouldCreateWithholding, false)
})

test('6. Movimento generale con conto mancante bloccato', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()

  // Rimuovi conto della seconda riga
  input.rows[1].conto_id = ''
  input.rows[1].contoQuery = ''

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'GEN', family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false }
  })

  assert.equal(result.validation.status, 'blocked')
  assert.ok(result.validation.blockers.some(b => b.includes('conto inesistente') || b.includes('conto mancante')))
})

test('7. Regressione PD ancora valida', () => {
  const pianoConti = buildMockPianoConti()
  const input = buildBaseUiDraftInput()
  input.header.causaleContabile = {
    id: 'caus-pd',
    codice: 'PD',
    tipoCausale: 'generale',
    descrizione: 'Pagamenti Diversi'
  }

  const result = buildRegistrazioneDraft(input, {
    pianoConti,
    behavior: { code: 'PD', family: 'generale', showIvaPanel: false, showPartitario: false, showRitenute: false }
  })

  assert.equal(result.validation.status, 'ok')
  const { validationResult } = mapRegistrazioneManualeToCanonical(result.draft, {
    mode: 'commit',
    operatorId: 'op-123',
    createdAt: '2026-05-29T00:16:27Z'
  })
  assert.ok(validationResult.isValid)
})
