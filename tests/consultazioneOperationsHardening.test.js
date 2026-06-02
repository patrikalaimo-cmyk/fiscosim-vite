import test from 'node:test'
import assert from 'node:assert/strict'
import { sb } from '../src/lib/supabase.js'
import { getPrimaNotaConsultazioneRowsAdvanced, getContoSaldoPrecedente } from '../src/modules/contabilita/data/contabilitaRepo.js'
import { buildConsultazioneRowViewModel } from '../src/modules/contabilita/application/consultazioneOperations/buildConsultazioneRowViewModel.js'
import { exportConsultazioneResults } from '../src/modules/contabilita/application/consultazioneOperations/exportConsultazioneResults.js'
import { calculateConsultazioneSaldoProgressivo } from '../src/modules/contabilita/application/consultazioneOperations/calculateConsultazioneSaldoProgressivo.js'
import { normalizeConsultazioneFilters } from '../src/modules/contabilita/application/consultazioneOperations/normalizeConsultazioneFilters.js'
import { buildConsultazioneQueryParams } from '../src/modules/contabilita/application/consultazioneOperations/buildConsultazioneQueryParams.js'
import { filterConsultazioneRows } from '../src/modules/contabilita/application/consultazioneOperations/filterConsultazioneRows.js'

// Mock Supabase Query class to record chained method calls
class MockSupabaseQuery {
  constructor() {
    this.calls = []
  }
  from(table) {
    this.calls.push({ method: 'from', args: [table] })
    return this
  }
  select(fields, options) {
    this.calls.push({ method: 'select', args: [fields, options] })
    return this
  }
  eq(col, val) {
    this.calls.push({ method: 'eq', args: [col, val] })
    return this
  }
  in(col, array) {
    this.calls.push({ method: 'in', args: [col, array] })
    return this
  }
  not(col, op, val) {
    this.calls.push({ method: 'not', args: [col, op, val] })
    return this
  }
  gte(col, val) {
    this.calls.push({ method: 'gte', args: [col, val] })
    return this
  }
  lte(col, val) {
    this.calls.push({ method: 'lte', args: [col, val] })
    return this
  }
  lt(col, val) {
    this.calls.push({ method: 'lt', args: [col, val] })
    return this
  }
  or(expr) {
    this.calls.push({ method: 'or', args: [expr] })
    return this
  }
  order(col, options) {
    this.calls.push({ method: 'order', args: [col, options] })
    return this
  }
  range(from, to) {
    this.calls.push({ method: 'range', args: [from, to] })
    return this
  }
  then(resolve, reject) {
    resolve({ data: [], count: 0, error: null })
  }
}

test('Consultazione Prima Nota - Hardening Test Suite', async (t) => {
  let queryInstance = null
  const originalFrom = sb.from

  t.beforeEach(() => {
    sb.from = (table) => {
      queryInstance = new MockSupabaseQuery()
      return queryInstance.from(table)
    }
  })

  t.afterEach(() => {
    sb.from = originalFrom
    queryInstance = null
  })

  await t.test('1. Default stati: solo ordinaria (confermata + definitiva)', async () => {
    await getPrimaNotaConsultazioneRowsAdvanced('soc-123', {
      tipoScrittureOrdinarie: true,
      tipoScrittureStornate: false,
      tipoScrittureSimulate: false,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall, 'Dovrebbe applicare il filtro in sullo stato')
    assert.deepEqual(inCall.args[1], ['confermata', 'definitiva'])
  })

  await t.test('2. Filtro Stornate: include stornata + storno', async () => {
    await getPrimaNotaConsultazioneRowsAdvanced('soc-123', {
      tipoScrittureOrdinarie: false,
      tipoScrittureStornate: true,
      tipoScrittureSimulate: false,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall, 'Dovrebbe applicare il filtro in sullo stato')
    assert.deepEqual(inCall.args[1], ['stornata', 'storno'])
  })

  await t.test('3. Filtro Simulate: include simulata', async () => {
    await getPrimaNotaConsultazioneRowsAdvanced('soc-123', {
      tipoScrittureOrdinarie: false,
      tipoScrittureStornate: false,
      tipoScrittureSimulate: true,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall, 'Dovrebbe applicare il filtro in sullo stato')
    assert.deepEqual(inCall.args[1], ['simulata'])
  })

  await t.test('4. Combinazione toggle multipli (Ordinarie + Simulate)', async () => {
    await getPrimaNotaConsultazioneRowsAdvanced('soc-123', {
      tipoScrittureOrdinarie: true,
      tipoScrittureStornate: false,
      tipoScrittureSimulate: true,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall)
    assert.deepEqual(inCall.args[1], ['confermata', 'definitiva', 'simulata'])
  })

  await t.test('5. Esclusione simulate, stornate, storno dal default implicito', async () => {
    // Senza passare parametri espliciti sugli stati (fallback default)
    await getPrimaNotaConsultazioneRowsAdvanced('soc-123', {})

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall)
    assert.deepEqual(inCall.args[1], ['confermata', 'definitiva'])
    assert.ok(!inCall.args[1].includes('simulata'))
    assert.ok(!inCall.args[1].includes('stornata'))
    assert.ok(!inCall.args[1].includes('storno'))
  })

  await t.test('6. Saldo progressivo e precedente getContoSaldoPrecedente coerente con filtri stato', async () => {
    await getContoSaldoPrecedente('soc-123', 'conto-abc', '2026-06-01', {
      tipoScrittureOrdinarie: true,
      tipoScrittureStornate: true,
      tipoScrittureSimulate: false,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall, 'Anche il saldo precedente dovrebbe filtrare per stato')
    assert.deepEqual(inCall.args[1], ['confermata', 'definitiva', 'stornata', 'storno'])
  })

  await t.test('7. Storno bilaterale nel Row View Model', () => {
    // Caso 1: record originale che punta allo storno
    const rowOrig = {
      id: 'r-1',
      importo_dare: 100,
      prima_nota: {
        id: 'pn-orig',
        stato: 'stornata',
        storno_id: 'pn-storno-linked'
      }
    }
    const vmOrig = buildConsultazioneRowViewModel(rowOrig, 0)
    assert.strictEqual(vmOrig.stornoCollegatoId, 'pn-storno-linked')

    // Caso 2: record di storno che punta all'originale
    const rowStorno = {
      id: 'r-2',
      importo_avere: 100,
      prima_nota: {
        id: 'pn-storno',
        stato: 'storno',
        storno_of_id: 'pn-orig-linked'
      }
    }
    const vmStorno = buildConsultazioneRowViewModel(rowStorno, 1)
    assert.strictEqual(vmStorno.stornoCollegatoId, 'pn-orig-linked')
  })

  await t.test('8. Export CSV base e ordinamento corretto', () => {
    const data = [
      { dataRegistrazione: '2026-01-02', dare: 50, avere: 0, saldoProgressivo: 50, descrizione: 'A riga' },
      { dataRegistrazione: '2026-01-01', dare: 100, avere: 0, saldoProgressivo: 150, descrizione: 'B riga' },
    ]

    // Formatta export compatto
    const result = exportConsultazioneResults(data, { mode: 'compact' })
    assert.ok(result.csv.includes('A riga'))
    assert.ok(result.csv.includes('B riga'))
    assert.ok(result.csv.includes('50;0;50'))
  })

  await t.test('9. Ordinamento iniziale e numerico corretto (no lessicografico)', () => {
    const rawRows = [
      { id: '1', dataRegistrazione: '2026-01-01', numeroRegistrazione: '10', rigaNumero: 2, dare: 100, avere: 0 },
      { id: '2', dataRegistrazione: '2026-01-01', numeroRegistrazione: '2', rigaNumero: 1, dare: 50, avere: 0 },
      { id: '3', dataRegistrazione: '2026-01-01', numeroRegistrazione: '10', rigaNumero: 10, dare: 200, avere: 0 },
      { id: '4', dataRegistrazione: '2026-01-02', numeroRegistrazione: '1', rigaNumero: 1, dare: 300, avere: 0 },
    ]

    const processed = calculateConsultazioneSaldoProgressivo(rawRows, { openingBalance: 0 })

    // processed should be sorted by:
    // 1. dataRegistrazione asc
    // 2. numeroRegistrazione numeric asc (2 before 10)
    // 3. rigaNumero numeric asc (2 before 10)
    
    assert.strictEqual(processed[0].id, '2') // 2026-01-01, N. 2
    assert.strictEqual(processed[1].id, '1') // 2026-01-01, N. 10, riga 2
    assert.strictEqual(processed[2].id, '3') // 2026-01-01, N. 10, riga 10
    assert.strictEqual(processed[3].id, '4') // 2026-01-02, N. 1
  })

  await t.test('10. Export CSV include colonna N. Prima Nota', () => {
    const data = [
      { dataRegistrazione: '2026-01-01', numeroRegistrazione: '123', numeroDocumento: 'DOC-01', dare: 50, avere: 0, saldoProgressivo: 50, descrizione: 'Test riga' },
    ]

    const compactResult = exportConsultazioneResults(data, { mode: 'compact' })
    const fullResult = exportConsultazioneResults(data, { mode: 'full' })

    // Headers assertion
    assert.ok(compactResult.csv.includes('N. Prima Nota'), 'L\'export compatto dovrebbe includere l\'intestazione N. Prima Nota')
    assert.ok(fullResult.csv.includes('N. Prima Nota'), 'L\'export completo dovrebbe includere l\'intestazione N. Prima Nota')

    // Value assertion
    assert.ok(compactResult.csv.includes(';123;'), 'L\'export compatto dovrebbe contenere il valore 123 per N. Prima Nota')
    assert.ok(fullResult.csv.includes(';123;'), 'L\'export completo dovrebbe contenere il valore 123 per N. Prima Nota')
  })

  await t.test('11. Selezione conto produce filtro strutturato con contoId', () => {
    const rawFilters = { contoId: 'uuid-123', contoCodice: '50100', contoDescrizione: 'Merci c/acquisti', conto: '50100 - Merci c/acquisti' }
    const normalized = normalizeConsultazioneFilters(rawFilters)
    assert.strictEqual(normalized.contoId, 'uuid-123')
    assert.strictEqual(normalized.contoCodice, '50100')
    assert.strictEqual(normalized.contoDescrizione, 'Merci c/acquisti')
    assert.strictEqual(normalized.conto, '50100 - Merci c/acquisti')

    const params = buildConsultazioneQueryParams(rawFilters)
    assert.strictEqual(params.server.contoId, 'uuid-123')
    assert.strictEqual(params.server.contoCodice, '50100')
  })

  await t.test('12. Fallback su contoCodice se contoId manca', () => {
    const rawFilters = { contoCodice: '50100', conto: '50100' }
    const normalized = normalizeConsultazioneFilters(rawFilters)
    assert.strictEqual(normalized.contoId, '')
    assert.strictEqual(normalized.contoCodice, '50100')

    const params = buildConsultazioneQueryParams(rawFilters)
    assert.strictEqual(params.server.contoId, '')
    assert.strictEqual(params.server.contoCodice, '50100')
  })

  await t.test('13. Filtro conto mostra solo righe del conto selezionato', () => {
    const rows = [
      { id: 'r1', contoId: 'uuid-1', contoCodice: '50100', contoDescrizione: 'Conto A', soggetto: 'Sogg' },
      { id: 'r2', contoId: 'uuid-2', contoCodice: '50200', contoDescrizione: 'Conto B', soggetto: 'Sogg' },
    ]

    const filteredById = filterConsultazioneRows(rows, { contoId: 'uuid-1' })
    assert.strictEqual(filteredById.length, 1)
    assert.strictEqual(filteredById[0].id, 'r1')

    const filteredByCodice = filterConsultazioneRows(rows, { contoCodice: '50200' })
    assert.strictEqual(filteredByCodice.length, 1)
    assert.strictEqual(filteredByCodice[0].id, 'r2')

    const filteredByText = filterConsultazioneRows(rows, { conto: 'conto b' })
    assert.strictEqual(filteredByText.length, 1)
    assert.strictEqual(filteredByText[0].id, 'r2')
  })

  await t.test('14. Saldo precedente richiesto con conto selezionato e stati attivi', async () => {
    await getContoSaldoPrecedente('soc-123', 'uuid-1', '2026-06-01', {
      tipoScrittureOrdinarie: true,
      tipoScrittureStornate: true,
      tipoScrittureSimulate: false,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall)
    assert.deepEqual(inCall.args[1], ['confermata', 'definitiva', 'stornata', 'storno'])
    
    const eqContoCall = queryInstance.calls.find(c => c.method === 'eq' && c.args[0] === 'conto_id')
    assert.ok(eqContoCall)
    assert.strictEqual(eqContoCall.args[1], 'uuid-1')
  })

  await t.test('15. Saldo progressivo calcolato solo su righe del conto selezionato', () => {
    const rawRows = [
      { id: '1', dataRegistrazione: '2026-01-01', numeroRegistrazione: '1', rigaNumero: 1, dare: 100, avere: 0 },
      { id: '2', dataRegistrazione: '2026-01-01', numeroRegistrazione: '1', rigaNumero: 2, dare: 0, avere: 50 },
    ]

    const processed = calculateConsultazioneSaldoProgressivo(rawRows, { openingBalance: 10 })
    assert.strictEqual(processed[0].saldoProgressivo, 110)
    assert.strictEqual(processed[1].saldoProgressivo, 60)
  })

  await t.test('16. Stati PN in ricerca avanzata continuano a rispettare default/stornate/simulate', async () => {
    await getPrimaNotaConsultazioneRowsAdvanced('soc-123', {
      contoId: 'uuid-1',
      tipoScrittureOrdinarie: true,
      tipoScrittureStornate: false,
      tipoScrittureSimulate: true,
    })

    assert.ok(queryInstance)
    const inCall = queryInstance.calls.find(c => c.method === 'in' && c.args[0] === 'prima_nota.stato')
    assert.ok(inCall)
    assert.deepEqual(inCall.args[1], ['confermata', 'definitiva', 'simulata'])

    const eqContoCall = queryInstance.calls.find(c => c.method === 'eq' && c.args[0] === 'conto_id')
    assert.ok(eqContoCall)
    assert.strictEqual(eqContoCall.args[1], 'uuid-1')
  })
})
