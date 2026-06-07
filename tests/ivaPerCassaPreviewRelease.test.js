import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateIvaPerCassaPreviewRelease } from '../src/modules/contabilita/application/registrazioneOperations/calculateIvaPerCassaPreviewRelease.js'

function preview({
  closure = 1540,
  residual = 1540,
  original = 1540,
  released = [],
  vatRows = [{ id: 'iva-1', partita_id: 'partita-1', imponibile: 1400, iva: 140, aliquota: 10 }],
  ivaPerCassa = true,
} = {}) {
  return calculateIvaPerCassaPreviewRelease({
    partitarioRows: [{
      id: 'partita-1',
      selected: true,
      iva_per_cassa: ivaPerCassa,
      importo_originale: original,
      importo_residuo: residual,
      importoChiusura: closure,
      numero_documento: 'FT-1',
    }],
    originalVatRows: vatRows,
    releasedVatRows: released,
  })
}

test('pagamento totale rilascia il 100% dell IVA', () => {
  const [item] = preview()
  assert.equal(item.percentualeChiusura, 100)
  assert.equal(item.ivaDaRilasciareOra, 140)
  assert.equal(item.ivaResiduaDopo, 0)
  assert.equal(item.coerente, true)
})

test('pagamento parziale 770 su 1540 rilascia il 50%', () => {
  const [item] = preview({ closure: 770 })
  assert.equal(item.percentualeChiusura, 50)
  assert.equal(item.importoChiusuraIvaPerCassa, 770)
  assert.equal(item.residuoIvaPerCassaDopo, 770)
  assert.equal(item.ivaDaRilasciareOra, 70)
  assert.equal(item.ivaResiduaDopo, 70)
  assert.equal(item.coerente, true)
})

test('pagamento 1000 su 1540 mantiene la partita IVA per cassa a 1000 e deriva IVA 90,91', () => {
  const [item] = preview({ closure: 1000 })
  assert.equal(item.importoOriginale, 1540)
  assert.equal(item.importoChiusura, 1000)
  assert.equal(item.importoResiduoDopo, 540)
  assert.equal(item.importoOriginaleIvaPerCassa, 1540)
  assert.equal(item.importoChiusuraIvaPerCassa, 1000)
  assert.equal(item.residuoIvaPerCassaDopo, 540)
  assert.equal(item.percentualeChiusura, 64.94)
  assert.equal(item.percentualeChiusuraIvaPerCassa, 64.94)
  assert.equal(item.ivaDaRilasciareOra, 90.91)
  assert.equal(item.imponibileDaRilasciare, 909.09)
  assert.equal(item.coerente, true)
})

test('pagamento 1400 su 1540 usa il totale commerciale come denominatore', () => {
  const [item] = preview({ closure: 1400 })
  assert.equal(item.percentualeChiusura, 90.91)
  assert.equal(item.ivaDaRilasciareOra, 127.27)
  assert.equal(item.ivaResiduaDopo, 12.73)
  assert.equal(item.coerente, true)
})

test('secondo pagamento rilascia solo il residuo disponibile', () => {
  const [item] = preview({
    closure: 770,
    residual: 770,
    released: [{ origin_registro_iva_id: 'iva-1', imponibile: 700, iva: 70 }],
  })
  assert.equal(item.ivaGiaRilasciata, 70)
  assert.equal(item.ivaDaRilasciareOra, 70)
  assert.equal(item.ivaResiduaDopo, 0)
})

test('secondo pagamento 540 su residuo 540 rilascia IVA residua 49,09', () => {
  const [item] = preview({
    closure: 540,
    residual: 540,
    released: [{ origin_registro_iva_id: 'iva-1', imponibile: 909.09, iva: 90.91 }],
  })
  assert.equal(item.importoOriginale, 1540)
  assert.equal(item.importoChiusura, 540)
  assert.equal(item.importoResiduoDopo, 0)
  assert.equal(item.ivaGiaRilasciata, 90.91)
  assert.equal(item.ivaDaRilasciareOra, 49.09)
  assert.equal(item.ivaResiduaDopo, 0)
  assert.equal(item.coerente, true)
})

test('ultimo pagamento applica il capping al centesimo', () => {
  const [item] = preview({
    closure: 0.01,
    residual: 0.01,
    released: [{ origin_registro_iva_id: 'iva-1', imponibile: 1399.91, iva: 139.99 }],
  })
  assert.equal(item.isFinalPayment, true)
  assert.equal(item.ivaDaRilasciareOra, 0.01)
  assert.equal(item.ivaResiduaDopo, 0)
})

test('multi-fattura mantiene calcoli separati', () => {
  const items = calculateIvaPerCassaPreviewRelease({
    partitarioRows: [
      { id: 'p1', selected: true, iva_per_cassa: true, importo_originale: 110, importo_residuo: 110, importoChiusura: 55 },
      { id: 'p2', selected: true, iva_per_cassa: true, importo_originale: 220, importo_residuo: 220, importoChiusura: 220 },
    ],
    originalVatRows: [
      { id: 'i1', partita_id: 'p1', imponibile: 100, iva: 10 },
      { id: 'i2', partita_id: 'p2', imponibile: 200, iva: 20 },
    ],
  })
  assert.deepEqual(items.map((item) => item.ivaDaRilasciareOra), [5, 20])
})

test('partita ordinaria non genera preview IVA per cassa', () => {
  assert.deepEqual(preview({ ivaPerCassa: false }), [])
})

test('chiusura superiore all originale viene cappata e segnalata', () => {
  const [item] = preview({ closure: 1600 })
  assert.equal(item.ivaDaRilasciareOra, 140)
  assert.equal(item.coerente, false)
  assert.equal(item.stato, 'chiusura_superiore_all_originale')
})

test('multi-aliquota rilascia ogni riga originaria separatamente', () => {
  const [item] = preview({
    closure: 610,
    residual: 1220,
    original: 1220,
    vatRows: [
      { id: 'iva-10', partita_id: 'partita-1', imponibile: 500, iva: 50, aliquota: 10 },
      { id: 'iva-22', partita_id: 'partita-1', imponibile: 500, iva: 110, aliquota: 22 },
    ],
  })
  assert.equal(item.righeIvaOriginarie.length, 2)
  assert.deepEqual(item.righeIvaOriginarie.map((row) => row.ivaDaRilasciareOra), [25, 55])
  assert.equal(item.ivaDaRilasciareOra, 80)
})

test('il calcolo non dipende dal codice causale', () => {
  const baseInput = {
    partitarioRows: [{
      id: 'partita-1',
      selected: true,
      iva_per_cassa: true,
      importo_originale: 1540,
      importo_residuo: 1540,
      importoChiusura: 770,
      codiceCausale: 'CODICE-CASUALE-IRRILEVANTE',
    }],
    originalVatRows: [{ id: 'iva-1', partita_id: 'partita-1', imponibile: 1400, iva: 140 }],
  }
  const [item] = calculateIvaPerCassaPreviewRelease(baseInput)
  assert.equal(item.ivaDaRilasciareOra, 70)
})
