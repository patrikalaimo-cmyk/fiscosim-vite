import test from 'node:test'
import assert from 'node:assert/strict'

import { createCespiteFromManualRegistration } from './createCespiteFromPrimaNota.js'

function makeDb({
  cliente = null,
  clienteError = null,
  insertError = null,
  existingBene = null,
} = {}) {
  const calls = []
  const beni = existingBene ? [existingBene] : []
  return {
    calls,
    beni,
    from(table) {
      if (table === 'clienti') {
        return {
          select() {
            return {
              eq() {
                return {
                  async maybeSingle() {
                    calls.push({ table: 'clienti', action: 'select' })
                    return { data: cliente, error: clienteError }
                  },
                }
              },
            }
          },
        }
      }
      if (table === 'beni_ammortizzabili') {
        return {
          select() {
            return {
              ilike(_col, pattern) {
                return {
                  async maybeSingle() {
                    calls.push({ table, action: 'select', pattern })
                    const hit = beni.find((b) => String(b.note || '').includes(String(pattern || '').replace(/%/g, '')))
                    return { data: hit || null, error: null }
                  },
                }
              },
            }
          },
          insert(rows) {
            calls.push({ table, action: 'insert', rows })
            return {
              async select() {
                if (insertError) return { data: null, error: insertError }
                const saved = rows.map((r, i) => ({ id: `bene-${beni.length + i + 1}`, ...r }))
                beni.push(...saved)
                return { data: saved, error: null }
              },
            }
          },
        }
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }
}

test('MANUALE-FREEZE — crea cespite fuori dalla UI dopo prima nota salvata', async () => {
  const db = makeDb({
    cliente: { id: 'cliente-1', ragione_sociale: 'Societa Demo Srl' },
  })

  const result = await createCespiteFromManualRegistration({
    db,
    societa: {
      id: 'soc-1',
      denominazione: 'Societa Demo',
      partita_iva: '99999999999',
    },
    primaNotaId: 'pn-1',
    cespiteMatch: {
      row: {
        dare: 1250,
        descrizione_riga: 'Computer studio',
      },
    },
    header: {
      dataDocumento: '2026-10-07',
    },
  })

  assert.equal(result.error, null)
  assert.equal(result.skipped, false)
  assert.equal(result.pnCreated, false)
  assert.equal(result.payload.cliente_id, 'cliente-1')
  assert.equal(result.payload.costo_storico, 1250)
  assert.equal(result.payload.valore_residuo, 1250)
  assert.equal(result.payload.aliquota_ammortamento, 20)
  assert.equal(result.payload.anni_vita_utile, 5)
  assert.equal(result.payload.data_acquisto, '2026-10-07')
  assert.match(result.payload.note, /pn-1/)
  assert.equal(result.linkedPrimaNotaId, 'pn-1')
  assert.equal(db.calls.filter((call) => call.table === 'beni_ammortizzabili' && call.action === 'insert').length, 1)
})

test('MANUALE-FREEZE — fallback societa se lookup cliente non trova corrispondenza', async () => {
  const db = makeDb()

  const result = await createCespiteFromManualRegistration({
    db,
    societa: {
      id: 'soc-2',
      ragione_sociale: 'Fallback Srl',
      partita_iva: '11111111111',
    },
    primaNotaId: 'pn-2',
    cespiteMatch: {
      row: {
        avere: 500,
        descrizione: 'Attrezzatura',
      },
    },
    header: {
      dataRegistrazione: '2026-10-07',
    },
  })

  assert.equal(result.error, null)
  assert.equal(result.payload.cliente_id, 'soc-2')
  assert.equal(result.payload.cliente_nome, 'Fallback Srl')
  assert.equal(result.payload.costo_storico, 500)
  assert.equal(result.pnCreated, false)
})

test('MANUALE-FREEZE — senza prima nota o costo valido non scrive cespiti', async () => {
  const db = makeDb()

  const missingPn = await createCespiteFromManualRegistration({
    db,
    societa: { id: 'soc-1' },
    primaNotaId: '',
    cespiteMatch: { row: { dare: 100 } },
  })
  assert.equal(missingPn.skipped, true)

  const invalidCost = await createCespiteFromManualRegistration({
    db,
    societa: { id: 'soc-1' },
    primaNotaId: 'pn-1',
    cespiteMatch: { row: { dare: 0, avere: 0 } },
  })
  assert.equal(invalidCost.skipped, true)

  assert.equal(db.calls.filter((call) => call.action === 'insert').length, 0)
})

test('SG-P3-05 — second bridge for same PN does not insert duplicate bene', async () => {
  const db = makeDb({
    existingBene: {
      id: 'bene-existing',
      note: 'Cespite inserito automaticamente da registrazione contabile. ID prima nota: pn-dup',
      costo_storico: 1000,
      aliquota_ammortamento: 20,
      data_acquisto: '2026-01-15',
      fondo_ammortamento: 0,
    },
  })

  const result = await createCespiteFromManualRegistration({
    db,
    societa: { id: 'soc-1', partita_iva: 'x' },
    primaNotaId: 'pn-dup',
    cespiteMatch: { row: { dare: 1000, descrizione_riga: 'PC' } },
    header: { dataDocumento: '2026-01-15' },
  })

  assert.equal(result.error, null)
  assert.equal(result.duplicatePrevented, true)
  assert.equal(result.created, false)
  assert.equal(result.pnCreated, false)
  assert.equal(result.linkedPrimaNotaId, 'pn-dup')
  assert.equal(db.calls.filter((c) => c.action === 'insert').length, 0)
  assert.ok(result.quotesProposed?.piano?.ok)
})
