import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildCespitePrimaNotaNote,
  extractPrimaNotaIdFromCespiteNote,
  noteMatchesPrimaNotaId,
} from '../src/modules/contabilita/domain/cespiti/cespitePrimaNotaLink.js'
import {
  calculatePianoAmmortamento,
  proposeQuotaAmmortamento,
} from '../src/modules/contabilita/domain/cespiti/calculatePianoAmmortamento.js'
import { bridgeCespiteFromExistingPrimaNota } from '../src/modules/contabilita/application/cespiti/bridgeCespiteFromExistingPrimaNota.js'

function makeBridgeDb({ existing = null } = {}) {
  const log = []
  const beni = existing ? [existing] : []
  const quotes = []
  return {
    log,
    beni,
    quotes,
    from(table) {
      if (table === 'beni_ammortizzabili') {
        return {
          select() {
            return {
              ilike(_col, pattern) {
                return {
                  async maybeSingle() {
                    log.push({ table, action: 'select', pattern })
                    const needle = String(pattern || '').replace(/%/g, '')
                    const hit = beni.find((b) => String(b.note || '').includes(needle))
                    return { data: hit || null, error: null }
                  },
                }
              },
            }
          },
          insert(rows) {
            log.push({ table, action: 'insert', rows })
            return {
              async select() {
                const saved = rows.map((r, i) => ({ id: `b-${beni.length + i + 1}`, ...r }))
                beni.push(...saved)
                return { data: saved, error: null }
              },
            }
          },
        }
      }
      if (table === 'quote_ammortamento') {
        return {
          async upsert(rows) {
            log.push({ table, action: 'upsert', rows })
            quotes.push(...rows)
            return { data: rows, error: null }
          },
        }
      }
      if (table === 'prima_nota') {
        log.push({ table, action: 'FORBIDDEN' })
        throw new Error('bridge must not touch prima_nota')
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

test('cespite note link round-trips prima_nota_id', () => {
  const note = buildCespitePrimaNotaNote({
    source: 'Import Contabilità',
    primaNotaId: '72000000-0000-4000-8000-0000000000aa',
  })
  assert.match(note, /ID prima nota:/)
  assert.equal(
    extractPrimaNotaIdFromCespiteNote(note),
    '72000000-0000-4000-8000-0000000000aa',
  )
  assert.equal(noteMatchesPrimaNotaId(note, '72000000-0000-4000-8000-0000000000aa'), true)
  assert.equal(noteMatchesPrimaNotaId(note, 'other'), false)
})

test('calculatePianoAmmortamento proposes 20% quotes without inventing PN', () => {
  const piano = calculatePianoAmmortamento({
    costo_storico: 1000,
    aliquota_ammortamento: 20,
    fondo_ammortamento: 0,
    data_acquisto: '2026-03-15',
  })
  assert.equal(piano.ok, true)
  assert.equal(piano.rows.length, 5)
  assert.equal(piano.rows[0].anno, 2026)
  assert.equal(piano.rows[0].quota_annua, 200)
  assert.equal(piano.rows[0].fondo_progressivo, 200)
  assert.equal(piano.rows[0].valore_residuo, 800)
  assert.equal(piano.rows[4].valore_residuo, 0)

  const q = proposeQuotaAmmortamento({
    costo_storico: 1000,
    aliquota_ammortamento: 20,
    data_acquisto: '2026-03-15',
  }, { anno: 2027 })
  assert.equal(q.ok, true)
  assert.equal(q.quote.anno, 2027)
  assert.equal(q.quote.quota_annua, 200)
})

test('bridge links existing PN and does not create second PN / duplicate bene', async () => {
  const db = makeBridgeDb()
  const pnId = '72000000-0000-4000-8000-0000000000bb'

  const first = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: pnId,
    source: 'Import Contabilità',
    descrizione: 'Macchinario LAB',
    dataAcquisto: '2026-05-12',
    costoStorico: 5000,
    aliquotaAmmortamento: 20,
    clienteId: 'cli-1',
    clienteNome: 'Cliente',
    proposeQuotes: true,
  })

  assert.equal(first.error, null)
  assert.equal(first.created, true)
  assert.equal(first.pnCreated, false)
  assert.equal(first.linkedPrimaNotaId, pnId)
  assert.match(first.bene.note, new RegExp(pnId))
  assert.equal(first.quotesProposed.createsPrimaNota, false)
  assert.equal(first.quotesProposed.piano.rows[0].quota_annua, 1000)
  assert.equal(db.log.filter((c) => c.table === 'prima_nota').length, 0)

  const second = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: pnId,
    source: 'Import Contabilità',
    descrizione: 'Macchinario LAB',
    dataAcquisto: '2026-05-12',
    costoStorico: 5000,
    proposeQuotes: true,
  })

  assert.equal(second.created, false)
  assert.equal(second.duplicatePrevented, true)
  assert.equal(second.pnCreated, false)
  assert.equal(db.beni.length, 1)
  assert.equal(db.log.filter((c) => c.action === 'insert').length, 1)
})

test('bridge refuses allowCreatePrimaNota and skips invalid cost', async () => {
  const db = makeBridgeDb()
  const forbidden = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: 'pn-x',
    costoStorico: 100,
    allowCreatePrimaNota: true,
  })
  assert.equal(forbidden.skipped, true)
  assert.equal(forbidden.reason, 'create_pn_forbidden')
  assert.equal(forbidden.pnCreated, false)

  const invalid = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: 'pn-y',
    costoStorico: 0,
  })
  assert.equal(invalid.skipped, true)
  assert.equal(invalid.reason, 'invalid_cost')
})
