import test from 'node:test'
import assert from 'node:assert/strict'
import { buildSaldiPerContoEsercizioModel } from '../src/modules/contabilita/application/stampe/buildSaldiPerContoEsercizioModel.js'

const opts = {
  societaId: 'studio-demo', esercizioInizio: '2026-01-01',
  periodoInizio: '2026-03-01', periodoFine: '2026-03-31',
}
const conti = [
  { id: 'root', societa_id: 'studio-demo', codice: '1', descrizione: 'Patrimoniale', tipo: 'patrimoniale', natura: 'attivo' },
  { id: 'bank', societa_id: 'studio-demo', codice: '100', descrizione: 'Banca', tipo: 'patrimoniale', natura: 'attivo', parent_id: 'root', saldo_iniziale: 90000 },
  { id: 'costi', societa_id: 'studio-demo', codice: '600', descrizione: 'Costi', tipo: 'economico', natura: 'costo' },
  { id: 'ricavi', societa_id: 'studio-demo', codice: '700', descrizione: 'Ricavi', tipo: 'economico', natura: 'ricavo' },
  { id: 'vuoto', societa_id: 'studio-demo', codice: '200', descrizione: 'Conto senza movimenti', tipo: 'patrimoniale', natura: 'passivo' },
]
function pn(id, date, left, right, amount, extra = {}) {
  return {
    id, societa_id: 'studio-demo', stato: 'confermata',
    data_registrazione: date, esercizio: 2026,
    totale_dare: amount, totale_avere: amount,
    righe: [
      { id: id + '-d', conto_id: left, conto_codice: conti.find(c => c.id === left).codice, importo_dare: amount, importo_avere: 0 },
      { id: id + '-a', conto_id: right, conto_codice: conti.find(c => c.id === right).codice, importo_dare: 0, importo_avere: amount },
    ],
    ...extra,
  }
}
const entries = [
  pn('jan', '2026-01-20', 'bank', 'ricavi', 100),
  pn('mar1', '2026-03-01', 'costi', 'bank', 40),
  pn('mar2', '2026-03-03', 'bank', 'ricavi', 25),
  pn('nc', '2026-03-05', 'ricavi', 'bank', 10),
]
const build = (es = entries, chart = conti, options = opts) => buildSaldiPerContoEsercizioModel(es, chart, options)

test('saldo precedente intraesercizio, Dare/Avere, progressivi e quadratura', () => {
  const result = build()
  assert.equal(result.valid, true, result.blockers.join(', '))
  assert.equal(result.definitive, false)
  assert.equal(result.kind, 'saldi_infrannuali_per_conto')
  const bank = result.conti.find(c => c.contoId === 'bank')
  assert.equal(bank.saldoPrecedente, 100)
  assert.deepEqual(bank.movimenti.map(m => m.saldoProgressivo), [60, 85, 75])
  assert.equal(bank.dare, 25)
  assert.equal(bank.avere, 50)
  assert.equal(bank.saldoFinale, 75)
  assert.equal(result.totali.precedenteDare, 100)
  assert.equal(result.totali.precedenteAvere, 100)
  assert.equal(result.totali.dare, 75)
  assert.equal(result.totali.avere, 75)
  assert.equal(result.totali.quadrato, true)
  assert.ok(result.warnings.some(w => /Riapertura conti/i.test(w)))
})

test('piano dei conti canonico: non usa saldo_iniziale senza prova, mantiene conti a zero', () => {
  const r = build()
  assert.equal(r.conti.find(c => c.contoId === 'bank').saldoPrecedente, 100)
  assert.equal(r.conti.find(c => c.contoId === 'vuoto').saldoFinale, 0)
  assert.equal(r.conti.some(c => c.contoId === 'root'), false)
  assert.equal(r.conti.find(c => c.contoId === 'costi').tipo, 'economico')
})

test('note credito e segni opposti non invertono la sezione contabile', () => {
  const r = build()
  assert.equal(r.conti.find(c => c.contoId === 'ricavi').saldoFinale, -115)
  assert.equal(r.conti.find(c => c.contoId === 'costi').saldoFinale, 40)
})

test('storno e stornata non producono saldi né blocker', () => {
  const es = [...entries, pn('rev1', '2026-03-06', 'bank', 'ricavi', 99, { stato: 'stornata' }),
    pn('rev2', '2026-03-06', 'ricavi', 'bank', 99, { stato: 'storno' })]
  const r = build(es)
  assert.equal(r.valid, true, r.blockers.join(', '))
  assert.equal(r.primaNotaEscluse.length, 2)
  assert.equal(r.totali.dare, 75)
})

test('blocca PN di altro tenant, anno precedente e incongruenza esercizio', () => {
  const wrongTenant = build([{ ...entries[0], societa_id: 'altra' }])
  assert.ok(wrongTenant.blockers.includes('prima_nota_societa_non_coerente'))
  const oldYear = build([pn('old', '2025-12-31', 'bank', 'ricavi', 1)])
  assert.ok(oldYear.blockers.includes('prima_nota_fuori_periodo'))
  const wrongExercise = build([{ ...entries[0], esercizio: 2025 }])
  assert.ok(wrongExercise.blockers.includes('esercizio_prima_nota_non_coerente'))
})

test('blocca date non reali, fine anno oltre esercizio e saldi non quadrati', () => {
  assert.ok(build(entries, conti, { ...opts, periodoFine: '2026-02-30' }).blockers.includes('esercizio_o_periodo_non_valido'))
  assert.ok(build(entries, conti, { ...opts, periodoFine: '2027-03-31' }).blockers.includes('esercizio_o_periodo_non_valido'))
  const badDocumentDate = build([pn('bad-date', '2026-02-30', 'bank', 'ricavi', 1)])
  assert.ok(badDocumentDate.blockers.includes('data_prima_nota_non_valida'))
  const wrong = build([{ ...entries[0], righe: [{ ...entries[0].righe[0], importo_dare: 99 }, entries[0].righe[1]] }])
  assert.ok(wrong.blockers.includes('prima_nota_non_quadrata'))
})

test('blocca conti sconosciuti, codici discordanti, padre movimentato e gerarchia incompleta', () => {
  assert.ok(build(entries, conti.filter(c => c.id !== 'bank')).blockers.includes('conto_movimentato_assente_da_piano_conti'))
  const wrongCode = build([{ ...entries[0], righe: [{ ...entries[0].righe[0], conto_codice: '999' }, entries[0].righe[1]] }])
  assert.ok(wrongCode.blockers.includes('codice_conto_non_coerente'))
  const parent = pn('parent', '2026-03-15', 'root', 'ricavi', 1)
  assert.ok(build([...entries, parent]).blockers.includes('conto_non_foglia_movimentato'))
  assert.ok(build(entries, conti.filter(c => c.id !== 'root')).blockers.includes('piano_conti_gerarchia_incompleta'))
})

test('classificazione incompleta, duplicati e società piano dei conti non coerente bloccano', () => {
  assert.ok(build(entries, conti.map(c => c.id === 'bank' ? { ...c, natura: '' } : c))
    .blockers.includes('classificazione_conto_non_valida'))
  assert.ok(build(entries, [...conti, { ...conti[0] }]).blockers.includes('piano_conti_duplicato'))
  assert.ok(build(entries, conti.map(c => c.id === 'bank' ? { ...c, societa_id: 'altra' } : c))
    .blockers.includes('piano_conti_identita_non_coerente'))
  assert.ok(build([entries[0], entries[0]]).blockers.includes('prima_nota_id_mancante_o_duplicata'))
})

test('rimane non definitivo: nessuna inferenza automatica sui saldi di esercizi precedenti', () => {
  const r = build(entries.filter(e => e.data_registrazione >= '2026-03-01'))
  assert.equal(r.definitive, false)
  assert.equal(r.conti.find(c => c.contoId === 'bank').saldoPrecedente, 0)
  assert.ok(r.warnings.some(w => /non verificati/i.test(w)))
})

test('mastrino: ID e codice riferiti allo stesso conto seguono l\'ordine cronologico', () => {
  const codeOnly = (entry) => ({
    ...entry,
    righe: entry.righe.map(r => r.conto_id === 'bank' ? { ...r, conto_id: null } : r),
  })
  const es = [
    pn('mar2', '2026-03-09', 'bank', 'ricavi', 20),
    codeOnly(pn('mar1', '2026-03-01', 'bank', 'ricavi', 50)),
    codeOnly(pn('mar3', '2026-03-15', 'costi', 'bank', 30)),
  ]
  const out = build(es)
  assert.equal(out.valid, true, out.blockers.join(', '))
  const bank = out.conti.find(c => c.contoId === 'bank')
  assert.deepEqual(bank.movimenti.map(m => m.dataRegistrazione), ['2026-03-01', '2026-03-09', '2026-03-15'])
  assert.deepEqual(bank.movimenti.map(m => m.saldoProgressivo), [50, 70, 40])
  assert.equal(bank.saldoFinale, 40)
})
