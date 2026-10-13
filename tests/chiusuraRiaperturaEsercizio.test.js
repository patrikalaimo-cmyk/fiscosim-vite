import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildChiusuraRiaperturaPlans,
  buildCloseCePlan,
  buildCloseSpPlan,
  buildReopenSpPlan,
  applyRowsToSaldiCents,
  toCents,
  isPeriodoChiusoLock,
} from '../src/modules/contabilita/application/chiusuraEsercizio/buildChiusuraRiaperturaPlans.js'
import {
  mapPlanToGeneralJournalRequest,
  mapPlanToGeneralJournalRpcArgs,
} from '../src/modules/contabilita/application/chiusuraEsercizio/postGeneralJournalLab.js'
import { auditRaccordoEserciziModel } from '../src/modules/contabilita/application/stampe/auditRaccordoEserciziModel.js'

const societa_id = 'tenant-fixture'
const CAUSALE_ORD = 'ord'
const CAUSALE_CLOSE = 'close'
const CAUSALE_OPEN = 'open'
const CONTO_BANCA = 'banca'
const CONTO_UTILE = 'utile'
const CONTO_RICAVI = 'ricavi'

const pianoConti = [
  { id: CONTO_BANCA, societa_id, codice: '100', descrizione: 'Banca', tipo: 'patrimoniale', natura: 'attivo' },
  { id: CONTO_UTILE, societa_id, codice: '200', descrizione: 'Utile', tipo: 'patrimoniale', natura: 'passivo' },
  { id: CONTO_RICAVI, societa_id, codice: '700', descrizione: 'Ricavi', tipo: 'economico', natura: 'ricavo' },
]
const causaliContabili = [
  { id: CAUSALE_ORD, societa_id, tipo: 'fattura_cliente' },
  { id: CAUSALE_CLOSE, societa_id, tipo: 'chiusura' },
  { id: CAUSALE_OPEN, societa_id, tipo: 'apertura' },
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

test('builders: close CE + close SP + reopen SP balanced and opposite', () => {
  const saldiConti = [
    { contoId: CONTO_BANCA, codice: '100', tipo: 'patrimoniale', natura: 'attivo', saldoFinale: 100 },
    { contoId: CONTO_RICAVI, codice: '700', tipo: 'economico', natura: 'ricavo', saldoFinale: -100 },
    { contoId: CONTO_UTILE, codice: '200', tipo: 'patrimoniale', natura: 'passivo', saldoFinale: 0 },
  ]
  const plans = buildChiusuraRiaperturaPlans({
    saldiConti,
    contoUtileId: CONTO_UTILE,
    causaleChiusuraId: CAUSALE_CLOSE,
    causaleAperturaId: CAUSALE_OPEN,
    dates: { closeCe: '2025-12-30', closeSp: '2025-12-31', reopen: '2026-01-02' },
  })
  assert.equal(plans.valid, true, plans.blockers.join(', '))
  assert.equal(plans.closeCe.rows.length, 2)
  assert.ok(plans.closeCe.rows.some(r => r.conto_id === CONTO_RICAVI && r.dare === 100))
  assert.ok(plans.closeCe.rows.some(r => r.conto_id === CONTO_UTILE && r.avere === 100))

  const afterCe = new Map([
    [CONTO_BANCA, 10000],
    [CONTO_RICAVI, -10000],
    [CONTO_UTILE, 0],
  ])
  applyRowsToSaldiCents(afterCe, plans.closeCe.rows)
  assert.equal(afterCe.get(CONTO_RICAVI), 0)
  assert.equal(afterCe.get(CONTO_UTILE), -10000)
  assert.equal(afterCe.get(CONTO_BANCA), 10000)

  assert.equal(plans.closeSp.valid, true, plans.closeSp.blockers.join(', '))
  applyRowsToSaldiCents(afterCe, plans.closeSp.rows)
  assert.equal(afterCe.get(CONTO_BANCA), 0)
  assert.equal(afterCe.get(CONTO_UTILE), 0)

  for (const open of plans.reopenSp.rows) {
    const closed = plans.closeSp.rows.find(r => r.conto_id === open.conto_id)
    assert.equal(toCents(closed.dare), toCents(open.avere))
    assert.equal(toCents(closed.avere), toCents(open.dare))
  }
})

test('continuity: synthetic PN from plans pass auditRaccordoEserciziModel', () => {
  const saldiConti = [
    { contoId: CONTO_BANCA, codice: '100', tipo: 'patrimoniale', natura: 'attivo', saldoFinale: 100 },
    { contoId: CONTO_RICAVI, codice: '700', tipo: 'economico', natura: 'ricavo', saldoFinale: -100 },
    { contoId: CONTO_UTILE, codice: '200', tipo: 'patrimoniale', natura: 'passivo', saldoFinale: 0 },
  ]
  const plans = buildChiusuraRiaperturaPlans({
    saldiConti,
    contoUtileId: CONTO_UTILE,
    causaleChiusuraId: CAUSALE_CLOSE,
    causaleAperturaId: CAUSALE_OPEN,
    dates: { closeCe: '2025-12-30', closeSp: '2025-12-31', reopen: '2026-01-02' },
  })
  assert.equal(plans.valid, true)

  const sale = pn('sale', '2025-06-01', CAUSALE_ORD, CONTO_BANCA, CONTO_RICAVI, 100)
  function planToPn(id, plan) {
    const amount = plan.totale
    const dareRow = plan.rows.find(r => r.dare > 0)
    const avereRow = plan.rows.find(r => r.avere > 0)
    // multi-line support: build from rows
    return {
      id, societa_id, esercizio: Number(plan.header.data_registrazione.slice(0, 4)),
      stato: 'confermata',
      data_registrazione: plan.header.data_registrazione,
      causale_id: plan.header.causale_id,
      totale_dare: amount, totale_avere: amount,
      righe: plan.rows.map((r, i) => ({
        id: `${id}-${i + 1}`,
        conto_id: r.conto_id,
        conto_codice: pianoConti.find(a => a.id === r.conto_id).codice,
        importo_dare: r.dare,
        importo_avere: r.avere,
      })),
    }
  }
  const closeCe = planToPn('close-ce', plans.closeCe)
  const closePat = planToPn('close-pat', plans.closeSp)
  const opening = planToPn('open-pat', plans.reopenSp)

  const out = auditRaccordoEserciziModel({
    societaId: societa_id,
    esercizioCorrente: '2026',
    pianoConti,
    causaliContabili,
    primaNotaEsercizioPrecedente: [sale, closeCe, closePat],
    idChiusurePatrimoniali: ['close-pat'],
    scrittureRiapertura: [opening],
  })
  assert.equal(out.valid, true, out.blockers.join(', '))
  assert.equal(out.raccordo.find(c => c.contoId === CONTO_BANCA).saldoChiusura, -100)
  assert.equal(out.raccordo.find(c => c.contoId === CONTO_BANCA).saldoRiapertura, 100)
  assert.equal(out.raccordo.find(c => c.contoId === CONTO_UTILE).differenza, 0)
})

test('close CE alone and reopen mapper reject incomplete input', () => {
  assert.equal(buildCloseCePlan({ saldiConti: [] }).valid, false)
  assert.equal(buildCloseSpPlan({ saldiConti: [] }).valid, false)
  assert.equal(buildReopenSpPlan({ closeSpRows: [] }).valid, false)
  assert.equal(mapPlanToGeneralJournalRequest(null, {}), null)
  const banca = '72000000-0000-4000-8000-000000000010'
  const ricavi = '72000000-0000-4000-8000-000000000011'
  const utile = '72000000-0000-4000-8000-000000000020'
  const causaleClose = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  const causaleOpen = 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff'
  const plans = buildChiusuraRiaperturaPlans({
    saldiConti: [
      { contoId: banca, tipo: 'patrimoniale', saldoFinale: 50 },
      { contoId: ricavi, tipo: 'economico', saldoFinale: -50 },
      { contoId: utile, tipo: 'patrimoniale', saldoFinale: 0 },
    ],
    contoUtileId: utile,
    causaleChiusuraId: causaleClose,
    causaleAperturaId: causaleOpen,
    dates: { closeCe: '2025-12-30', closeSp: '2025-12-31', reopen: '2026-01-02' },
  })
  assert.equal(plans.valid, true, plans.blockers.join(', '))
  const body = mapPlanToGeneralJournalRequest(plans.closeCe, {
    societaId: '72000000-0000-4000-8000-000000000001',
    requestId: '72000000-0000-4000-8000-000000000099',
    motivazione: 'SG-E2E chiusura CE test payload',
  })
  assert.ok(body)
  assert.equal(body.header.causale_id, causaleClose)
  const rpc = mapPlanToGeneralJournalRpcArgs(plans.closeSp, {
    societaId: '72000000-0000-4000-8000-000000000001',
    authUserId: '72000000-0000-4000-8000-000000000003',
    requestId: '72000000-0000-4000-8000-000000000098',
    motivazione: 'SG-E2E chiusura SP test payload',
  })
  assert.ok(rpc)
  assert.equal(rpc.p_rows.length, plans.closeSp.rows.length)
})

test('periodo_chiuso_lock semantics reused', () => {
  assert.equal(isPeriodoChiusoLock({ periodo_chiuso_lock: true }), true)
  assert.equal(isPeriodoChiusoLock({ stampa_giornale_id: 'x' }), true)
  assert.equal(isPeriodoChiusoLock({ periodo_chiuso_lock: false, stampa_giornale_id: null }), false)
})
