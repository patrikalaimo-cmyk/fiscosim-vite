import test from 'node:test'
import assert from 'node:assert/strict'
import { buildMovimentiPerContoModel } from '../src/modules/contabilita/application/stampe/buildMovimentiPerContoModel.js'

const options = {
  societaId: 'soc-test',
  periodoInizio: '2026-01-01',
  periodoFine: '2026-12-31',
}

const entries = [
  {
    id: 'pn-1',
    societa_id: 'soc-test',
    stato: 'confermata',
    numero_registrazione: 1,
    data_registrazione: '2026-02-01',
    descrizione: 'Incasso',
    totale_dare: 100,
    totale_avere: 100,
    righe: [
      { id: 'r-1', riga_numero: 1, conto_id: 'banca', conto_codice: '100', conto_descrizione: 'Banca', importo_dare: 100, importo_avere: 0 },
      { id: 'r-2', riga_numero: 2, conto_id: 'ricavo', conto_codice: '700', conto_descrizione: 'Ricavi', importo_dare: 0, importo_avere: 100 },
    ],
  },
  {
    id: 'pn-2',
    societa_id: 'soc-test',
    stato: 'definitiva',
    numero_registrazione: 2,
    data_registrazione: '2026-02-03',
    descrizione: 'Spesa',
    totale_dare: 40,
    totale_avere: 40,
    righe: [
      { id: 'r-3', riga_numero: 1, conto_id: 'costo', conto_codice: '600', conto_descrizione: 'Costi', importo_dare: 40, importo_avere: 0 },
      { id: 'r-4', riga_numero: 2, conto_id: 'banca', conto_codice: '100', conto_descrizione: 'Banca', importo_dare: 0, importo_avere: 40 },
    ],
  },
]

test('movimenti per conto da PN canonica, saldi periodici e quadratura', () => {
  const result = buildMovimentiPerContoModel(entries, options)
  assert.equal(result.valid, true)
  assert.equal(result.definitive, false)
  assert.equal(result.basis, 'prima_nota_canonica')
  assert.equal(result.conti.length, 3)
  assert.deepEqual(result.totali, {
    dare: 140, avere: 140, saldoDare: 100, saldoAvere: 100, quadrato: true,
  })
  const bank = result.conti.find(x => x.contoId === 'banca')
  assert.equal(bank.saldoMovimentiPeriodo, 60)
  assert.deepEqual(bank.movimenti.map(x => x.saldoProgressivoPeriodo), [100, 60])
  assert.equal(result.conti.find(x => x.contoId === 'ricavo').saldoAvere, 100)
})

test('non aggrega bozze o simulazioni ai saldi dei movimenti contabili', () => {
  const demo = { ...entries[0], id: 'pn-sim', stato: 'simulata' }
  const result = buildMovimentiPerContoModel([...entries, demo], options)
  assert.equal(result.valid, true)
  assert.equal(result.primaNotaIncluse, 2)
  assert.deepEqual(result.primaNotaEscluse, [{ primaNotaId: 'pn-sim', stato: 'simulata' }])
  assert.equal(result.totali.dare, 140)
})

test('societa diversa e periodo incoerente bloccano il modello contabile', () => {
  const otherTenant = buildMovimentiPerContoModel([{ ...entries[0], societa_id: 'soc-altro' }], options)
  assert.equal(otherTenant.valid, false)
  assert.ok(otherTenant.blockers.includes('prima_nota_societa_non_coerente'))

  const wrongPeriod = buildMovimentiPerContoModel(entries, { ...options, periodoFine: '2026-01-01' })
  assert.equal(wrongPeriod.valid, false)
  assert.ok(wrongPeriod.blockers.includes('prima_nota_fuori_periodo'))
})

test('non pubblica PN sbilanciata o totali di testata incongruenti', () => {
  const notBalanced = {
    ...entries[0],
    righe: [{ ...entries[0].righe[0], importo_dare: 99 }, entries[0].righe[1]],
  }
  const r1 = buildMovimentiPerContoModel([notBalanced], options)
  assert.equal(r1.valid, false)
  assert.ok(r1.blockers.includes('prima_nota_non_quadrata'))
  const wrongTotal = buildMovimentiPerContoModel([{ ...entries[0], totale_dare: 200 }], options)
  assert.equal(wrongTotal.valid, false)
  assert.ok(wrongTotal.blockers.includes('totali_prima_nota_non_coerenti'))
})

test('rifiuta righe prive di conto, importi non validi e doppioni', () => {
  const wrongAccount = buildMovimentiPerContoModel([{
    ...entries[0],
    righe: [{ ...entries[0].righe[0], conto_id: null, conto_codice: null }, entries[0].righe[1]],
  }], options)
  assert.ok(wrongAccount.blockers.includes('conto_prima_nota_mancante'))

  const wrongAmount = buildMovimentiPerContoModel([{
    ...entries[0],
    righe: [{ ...entries[0].righe[0], importo_dare: -100 }, entries[0].righe[1]],
  }], options)
  assert.ok(wrongAmount.blockers.includes('riga_prima_nota_importo_non_valido'))

  const duplicate = buildMovimentiPerContoModel([entries[0], entries[0]], options)
  assert.ok(duplicate.blockers.includes('prima_nota_id_mancante_o_duplicata'))
})

test('modello movimenti non dichiara mai bilancio definitivo né copertura saldi iniziali', () => {
  const result = buildMovimentiPerContoModel(entries, options)
  assert.equal(result.definitive, false)
  assert.ok(result.warnings.some(x => /saldo iniziale/i.test(x)))
  const missing = buildMovimentiPerContoModel(entries, { ...options, societaId: '' })
  assert.equal(missing.valid, false)
  assert.ok(missing.blockers.includes('societa_id_mancante'))
})
