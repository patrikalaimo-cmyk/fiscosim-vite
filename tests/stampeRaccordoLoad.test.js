import test from 'node:test'
import assert from 'node:assert/strict'
import { loadAuditRaccordoEsercizi } from '../src/modules/contabilita/application/stampe/loadAuditRaccordoEsercizi.js'

const S = 'soc-demo'
const conti = [
  { id: 'bank', societa_id: S, codice: '1', tipo: 'patrimoniale', natura: 'attivo', attivo: false },
  { id: 'utile', societa_id: S, codice: '2', tipo: 'patrimoniale', natura: 'passivo', attivo: true },
  { id: 'ricavi', societa_id: S, codice: '7', tipo: 'economico', natura: 'ricavo', attivo: true },
]
const causali = [
  { id: 'standard', societa_id: S, tipo: 'ordinaria', attivo: true },
  { id: 'close', societa_id: S, tipo: 'chiusura', attivo: false },
  { id: 'open', societa_id: S, tipo: 'apertura', attivo: false },
]
function p(id, date, causale_id, debit, credit, amount, societa_id = S) {
  return {
    id, societa_id, data_registrazione: date, causale_id, stato: 'confermata',
    totale_dare: amount, totale_avere: amount,
    righe: [
      { id: id + 'd', prima_nota_id: id, conto_id: debit, conto_codice: conti.find(c => c.id === debit).codice, importo_dare: amount, importo_avere: 0, riga_numero: 1 },
      { id: id + 'a', prima_nota_id: id, conto_id: credit, conto_codice: conti.find(c => c.id === credit).codice, importo_dare: 0, importo_avere: amount, riga_numero: 2 },
    ],
  }
}
function fixtures(extra = []) {
  const all = [
    p('sale', '2025-02-04', 'standard', 'bank', 'ricavi', 100),
    p('close-econ', '2025-12-29', 'close', 'ricavi', 'utile', 100),
    p('close-pat', '2025-12-31', 'close', 'utile', 'bank', 100),
    p('opening', '2026-01-04', 'open', 'bank', 'utile', 100),
    p('foreign', '2025-06-02', 'standard', 'bank', 'ricavi', 300, 'other-tenant'),
    ...extra,
  ]
  return {
    prima_nota: all.map(({ righe, ...head }) => head),
    prima_nota_righe: all.flatMap(pn => pn.righe),
    causali_contabili: causali,
    piano_conti: conti,
  }
}
function fakeDb(tables, { failTable = null } = {}) {
  const calls = []
  return {
    calls,
    from(table) {
      const filters = []
      const sort = []
      const q = {
        select(fields) { calls.push({ table, action: 'select', fields }); return q },
        eq(field, value) { filters.push(r => String(r[field]) === String(value)); return q },
        gte(field, value) { filters.push(r => String(r[field]) >= String(value)); return q },
        lte(field, value) { filters.push(r => String(r[field]) <= String(value)); return q },
        in(field, ids) { filters.push(r => ids.includes(r[field])); return q },
        order(field) { sort.push(field); return q },
        async range(from, to) {
          calls.push({ table, action: 'range', from, to })
          if (table === failTable) return { data: null, error: new Error('read-failed') }
          if (!Object.hasOwn(tables, table)) throw Error('Unknown table: ' + table)
          let list = tables[table].filter(r => filters.every(f => f(r)))
          list = list.sort((a, b) => {
            for (const field of sort) {
              const delta = String(a[field] ?? '').localeCompare(String(b[field] ?? ''))
              if (delta !== 0) return delta
            }
            return 0
          })
          return { data: list.slice(from, to + 1), error: null }
        },
      }
      return q
    },
  }
}
const options = {
  societaId: S, esercizioCorrente: '2026',
  idChiusurePatrimoniali: ['close-pat'], idRiaperture: ['opening'],
}

test('lettura completa e canonica di due esercizi, inclusi conti e causali storici inattivi', async () => {
  const db = fakeDb(fixtures())
  const result = await loadAuditRaccordoEsercizi(db, options)
  assert.equal(result.valid, true, result.blockers.join(', '))
  assert.equal(result.definitive, false)
  assert.equal(result.evidence.primaNotaAnnoPrecedenteLetta, 3)
  assert.equal(result.evidence.riapertureLette, 1)
  assert.equal(result.evidence.completenessCertified, false)
  assert.equal(result.evidence.snapshotCertified, false)
  assert.equal(result.raccordo.find(r => r.contoId === 'bank').differenza, 0)
  assert.ok(db.calls.some(c => c.table === 'causali_contabili'))
  assert.ok(db.calls.some(c => c.table === 'piano_conti'))
  assert.ok(db.calls.every(c => !['insert', 'upsert', 'update', 'delete'].includes(c.action)))
})

test('paginazione >500 PN e join batch completi; nessun limite silenzioso a 1000 righe', async () => {
  const neutral = Array.from({ length: 510 }, (_, i) =>
    p('neutral-' + String(i).padStart(4, '0'), '2025-10-01', 'standard', 'bank', 'bank', 1))
  const db = fakeDb(fixtures(neutral))
  const out = await loadAuditRaccordoEsercizi(db, options)
  assert.equal(out.valid, true, out.blockers.join(', '))
  assert.equal(out.evidence.primaNotaAnnoPrecedenteLetta, 513)
  assert.ok(db.calls.some(c => c.table === 'prima_nota' && c.action === 'range' && c.from === 500))
  assert.ok(db.calls.filter(c => c.table === 'prima_nota_righe' && c.action === 'range').length >= 6)
})

test('riapertura da altra societa non e resa apparentemente assente e valida', async () => {
  await assert.rejects(
    loadAuditRaccordoEsercizi(fakeDb(fixtures()), { ...options, idRiaperture: ['foreign'] }),
    /riapertura richiesta assente o fuori societa/
  )
})

test('PN senza righe e errore di lettura interrompono tutto, non generano saldi parziali', async () => {
  const missing = fixtures()
  missing.prima_nota_righe = missing.prima_nota_righe.filter(r => r.prima_nota_id !== 'sale')
  await assert.rejects(loadAuditRaccordoEsercizi(fakeDb(missing), options), /priva di righe/)
  await assert.rejects(loadAuditRaccordoEsercizi(fakeDb(fixtures(), { failTable: 'prima_nota_righe' }), options), /read-failed/)
})

test('chiusura indicata ma non presente nel precedente resta blocker, non fallback', async () => {
  const out = await loadAuditRaccordoEsercizi(fakeDb(fixtures()), { ...options, idChiusurePatrimoniali: ['not-a-closing'] })
  assert.equal(out.valid, false)
  assert.ok(out.blockers.includes('chiusura_non_presente_nel_dataset_precedente'))
})

test('identificativi espliciti e anno esercizio obbligatori', async () => {
  await assert.rejects(loadAuditRaccordoEsercizi(fakeDb(fixtures()), { ...options, idRiaperture: ['opening', 'opening'] }), /duplicati/)
  await assert.rejects(loadAuditRaccordoEsercizi(fakeDb(fixtures()), { ...options, esercizioCorrente: '203X' }), /non validi/)
  await assert.rejects(loadAuditRaccordoEsercizi(fakeDb(fixtures()), { ...options, idChiusurePatrimoniali: [] }), /assenti/)
})
