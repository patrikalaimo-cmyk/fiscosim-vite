import test from 'node:test'
import assert from 'node:assert/strict'

import { buildScritturaContabileFromDraft } from './primaNotaPipeline.js'

test('buildScritturaContabileFromDraft uses explicit conto costo/ricavo when provided', () => {
  const result = buildScritturaContabileFromDraft({
    ivaRows: [
      {
        id: 'iva-1',
        aliquota: 22,
        imponibile: 100,
        iva: 22,
        causale_iva_id: 'iva-causale-1',
      },
    ],
    pianoConti: [
      { id: 'fornitore-1', codice: '201', descrizione: 'Fornitore test', livello: 4, is_fornitore: true },
      { id: 'costo-1', codice: '600', descrizione: 'Spese servizi', livello: 3 },
      { id: 'iva-credito-1', codice: '110', descrizione: 'IVA ns/credito', livello: 3, is_iva: true },
    ],
    causaliIva: [
      { id: 'iva-causale-1', codice_interno: 'A22', conto_id: 'iva-credito-1' },
    ],
    clientiFornitori: [
      { id: 'fornitore-1', codice: '201', descrizione: 'Fornitore test', livello: 4, is_fornitore: true },
    ],
    clienteFornitoreId: 'fornitore-1',
    contoCostoRicavoId: 'costo-1',
    causaleContabile: { codice: 'FF', descrizione: 'Fattura fornitore' },
    soggettoNomeFallback: 'Fornitore test',
    newRow: () => ({ id: 'row', conto_id: '', descrizione: '', dare: '', avere: '' }),
  })

  assert.equal(result.error, null)
  assert.equal(Array.isArray(result.rows), true)
  assert.equal(result.rows[0].conto_id, 'costo-1')
})
