import test from 'node:test'
import assert from 'node:assert/strict'
import { auditRaccordoEserciziModel } from '../src/modules/contabilita/application/stampe/auditRaccordoEserciziModel.js'

const societa_id = 'tenant-fixture'
const pianoConti = [
  { id: 'banca', societa_id, codice: '100', descrizione: 'Banca', tipo: 'patrimoniale', natura: 'attivo', saldo_iniziale: 9999 },
  { id: 'utile', societa_id, codice: '200', descrizione: 'Utile', tipo: 'patrimoniale', natura: 'passivo' },
  { id: 'ricavi', societa_id, codice: '700', descrizione: 'Ricavi', tipo: 'economico', natura: 'ricavo' },
]
const causaliContabili = [
  { id: 'ord', societa_id, tipo: 'fattura_cliente' },
  { id: 'close', societa_id, tipo: 'chiusura' },
  { id: 'open', societa_id, tipo: 'apertura' },
]
function pn(id, data, causale_id, dare, avere, amount, extra = {}) {
  return {
    id, societa_id, esercizio: Number(data.slice(0, 4)), stato: 'confermata',
    data_registrazione: data, causale_id,
    totale_dare: amount, totale_avere: amount,
    righe: [
      { id: id + '-1', conto_id: dare, conto_codice: pianoConti.find(a => a.id === dare).codice, importo_dare: amount, importo_avere: 0 },
      { id: id + '-2', conto_id: avere, conto_codice: pianoConti.find(a => a.id === avere).codice, importo_dare: 0, importo_avere: amount },
    ],
    ...extra,
  }
}
const prev = [
  pn('sale', '2025-06-01', 'ord', 'banca', 'ricavi', 100),
  pn('close-ce', '2025-12-30', 'close', 'ricavi', 'utile', 100),
  pn('close-pat', '2025-12-31', 'close', 'utile', 'banca', 100),
]
const opening = pn('open-pat', '2026-01-02', 'open', 'banca', 'utile', 100)
const fixture = {
  societaId: societa_id, esercizioCorrente: '2026',
  pianoConti, causaliContabili, primaNotaEsercizioPrecedente: prev,
  idChiusurePatrimoniali: ['close-pat'], scrittureRiapertura: [opening],
}
const build = patch => auditRaccordoEserciziModel({ ...fixture, ...patch })

test('raccordo positivo: economici chiusi, patrimoniali chiusi e riaperti in contropartita', () => {
  const out = build()
  assert.equal(out.valid, true, out.blockers.join(', '))
  assert.equal(out.definitive, false)
  assert.equal(out.counts.primaNotaPrecedente, 3)
  assert.equal(out.counts.chiusurePatrimoniali, 1)
  assert.equal(out.raccordo.find(c => c.contoId === 'banca').saldoChiusura, -100)
  assert.equal(out.raccordo.find(c => c.contoId === 'banca').saldoRiapertura, 100)
  assert.equal(out.raccordo.find(c => c.contoId === 'utile').differenza, 0)
  assert.ok(out.warnings.some(w => /snapshot/i.test(w)))
})

test('saldo_iniziale nel piano conti non altera il raccordo', () => {
  const out = build({ pianoConti: pianoConti.map(c => c.id === 'banca' ? { ...c, saldo_iniziale: 500000 } : c) })
  assert.equal(out.valid, true)
})

test('riapertura diversa da chiusura blocca e non promuove la stampa', () => {
  const out = build({ scrittureRiapertura: [pn('open-pat', '2026-01-02', 'open', 'banca', 'utile', 90)] })
  assert.equal(out.valid, false)
  assert.ok(out.blockers.includes('saldo_riapertura_non_corrispondente'))
  assert.equal(out.definitive, false)
})

test('chiusura economica non completata blocca il precedente esercizio', () => {
  const out = build({ primaNotaEsercizioPrecedente: prev.filter(a => a.id !== 'close-ce') })
  assert.ok(out.blockers.includes('esercizio_precedente_non_azzerato'))
})

test('non ammette conti economici tra le scritture di chiusura patrimoniale', () => {
  const out = build({ idChiusurePatrimoniali: ['close-ce', 'close-pat'] })
  assert.ok(out.blockers.includes('conto_economico_in_chiusura_patrimoniale_o_riapertura'))
})

test('blocca ID chiusura assenti o ripetuti e riaperture duplicate', () => {
  assert.ok(build({ idChiusurePatrimoniali: ['wrong'] }).blockers.includes('chiusura_non_presente_nel_dataset_precedente'))
  assert.ok(build({ idChiusurePatrimoniali: ['close-pat', 'close-pat'] }).blockers.includes('chiusure_selezionate_duplicate_o_senza_id'))
  assert.ok(build({ scrittureRiapertura: [opening, opening] }).blockers.includes('riapertura_id_non_univoco'))
})

test('causali reali obbligatorie: nessuna identificazione dalla descrizione', () => {
  const out = build({ scrittureRiapertura: [{ ...opening, causale_id: null, descrizione: 'APERTURA CONTI' }] })
  assert.ok(out.blockers.includes('causale_apertura_non_verificata'))
  assert.ok(build({ causaliContabili: causaliContabili.filter(a => a.id !== 'close') }).blockers.includes('causale_chiusura_non_verificata'))
  assert.ok(build({ causaliContabili: causaliContabili.map(a => a.id === 'open' ? { ...a, societa_id: 'other' } : a) })
    .blockers.includes('causali_raccordo_identita_non_coerente'))
})

test('societa, anno e stato verificati su ciascuna scrittura', () => {
  assert.ok(build({ scrittureRiapertura: [{ ...opening, societa_id: 'other' }] })
    .blockers.includes('scrittura_apertura_fuori_contesto'))
  assert.ok(build({ scrittureRiapertura: [{ ...opening, stato: 'bozza' }] })
    .blockers.includes('scrittura_apertura_non_contabilizzata'))
  assert.ok(build({ scrittureRiapertura: [pn('open-pat', '2027-01-02', 'open', 'banca', 'utile', 100)] })
    .blockers.includes('scrittura_apertura_fuori_contesto'))
  assert.ok(build({ primaNotaEsercizioPrecedente: prev.map(a => a.id === 'close-pat' ? { ...a, esercizio: 2024 } : a) })
    .blockers.includes('scrittura_chiusura_fuori_contesto'))
})

test('blocca dataset precedente non quadrato e societa errata', () => {
  const wrong = [{ ...prev[0], righe: [prev[0].righe[0]] }, ...prev.slice(1)]
  assert.ok(build({ primaNotaEsercizioPrecedente: wrong }).blockers.includes('prima_nota_precedente_non_valida'))
  assert.ok(build({ societaId: 'unrelated' }).blockers.includes('prima_nota_precedente_non_valida'))
})

test('non interpreta qualunque storno come chiusura contabilizzata', () => {
  const corrupted = prev.map(a => a.id === 'close-pat' ? { ...a, stato: 'stornata' } : a)
  assert.ok(build({ primaNotaEsercizioPrecedente: corrupted }).blockers.includes('chiusura_non_interamente_contabilizzata'))
})

test('dataset incompleto, causa sbagliata e chiusura patrimoniale vuota restano bloccati', () => {
  assert.ok(build({ primaNotaEsercizioPrecedente: [] }).blockers.includes('chiusura_non_presente_nel_dataset_precedente'))
  assert.ok(build({ scrittureRiapertura: [pn('open-pat', '2026-01-02', 'ord', 'banca', 'utile', 100)] })
    .blockers.includes('causale_apertura_non_verificata'))
  const emptyPatrimonial = pn('neutral', '2025-12-30', 'close', 'ricavi', 'ricavi', 1)
  assert.ok(build({ primaNotaEsercizioPrecedente: [...prev, emptyPatrimonial], idChiusurePatrimoniali: ['neutral'] })
    .blockers.includes('chiusura_patrimoniale_priva_di_movimenti'))
})
