import test from 'node:test'
import assert from 'node:assert/strict'

import { createCespiteFromManualRegistration } from './createCespiteFromPrimaNota.js'

function makeDb({ cliente = null, clienteError = null, insertError = null } = {}) {
  const calls = []
  return {
    calls,
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
          insert(rows) {
            calls.push({ table, action: 'insert', rows })
            return {
              async select() {
                return { data: rows, error: insertError }
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
  assert.equal(result.payload.cliente_id, 'cliente-1')
  assert.equal(result.payload.costo_storico, 1250)
  assert.equal(result.payload.valore_residuo, 1250)
  assert.equal(result.payload.aliquota_ammortamento, 20)
  assert.equal(result.payload.anni_vita_utile, 5)
  assert.equal(result.payload.data_acquisto, '2026-10-07')
  assert.match(result.payload.note, /pn-1/)
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
