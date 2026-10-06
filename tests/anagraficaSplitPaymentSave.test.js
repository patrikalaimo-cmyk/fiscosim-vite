import test from 'node:test'
import assert from 'node:assert/strict'

import * as contabilitaRepo from '../src/modules/contabilita/data/contabilitaRepo.js'
import { sb } from '../src/lib/supabase.js'

function createSupabaseUpdateStub({ data, error } = {}) {
  const calls = { table: null, payload: null, eq: [], select: 0, single: 0 }
  const chain = {
    update(payload) {
      calls.payload = payload
      return chain
    },
    eq(field, value) {
      calls.eq.push([field, value])
      return chain
    },
    select() {
      calls.select += 1
      return chain
    },
    single() {
      calls.single += 1
      return Promise.resolve({ data, error })
    },
  }
  return {
    calls,
    from(table) {
      calls.table = table
      return chain
    },
  }
}

function createSupabaseReadStub({ data, error } = {}) {
  const calls = { table: null, select: 0, eq: [], single: 0 }
  const chain = {
    select() {
      calls.select += 1
      return chain
    },
    eq(field, value) {
      calls.eq.push([field, value])
      return chain
    },
    single() {
      calls.single += 1
      return Promise.resolve({ data, error })
    },
  }
  return {
    calls,
    from(table) {
      calls.table = table
      return chain
    },
  }
}

test('updatePianoConto restituisce il record aggiornato e preserva split_payment true/false', async (t) => {
  const stub = createSupabaseUpdateStub({ data: { id: 'conto-1', split_payment: true, causale_iva_id: null } })
  const originalSbFrom = sb.from
  sb.from = stub.from

  try {
    const resTrue = await contabilitaRepo.updatePianoConto('conto-1', {
      split_payment: true,
      causale_iva_id: '',
      banca_id: 'null',
      note: 'da ignorare',
    })
    assert.equal(stub.calls.table, 'piano_conti')
    assert.deepEqual(stub.calls.eq, [['id', 'conto-1']])
    assert.equal(stub.calls.select, 1)
    assert.equal(stub.calls.single, 1)
    assert.equal(stub.calls.payload.split_payment, true)
    assert.equal(stub.calls.payload.causale_iva_id, null)
    assert.equal(stub.calls.payload.banca_id, null)
    assert.equal(stub.calls.payload.note, undefined)
    assert.equal(resTrue.data.split_payment, true)

    const stubFalse = createSupabaseUpdateStub({ data: { id: 'conto-2', split_payment: false } })
    sb.from = stubFalse.from
    const resFalse = await contabilitaRepo.updatePianoConto('conto-2', {
      split_payment: false,
      tipo_pagamento_id: '',
    })
    assert.equal(stubFalse.calls.payload.split_payment, false)
    assert.equal('split_payment' in stubFalse.calls.payload, true)
    assert.equal(stubFalse.calls.payload.tipo_pagamento_id, null)
    assert.equal(resFalse.data.split_payment, false)
  } finally {
    sb.from = originalSbFrom
  }
})

test('updatePianoConto mantiene split_payment false nel payload e nel record aggiornato', async () => {
  const stub = createSupabaseUpdateStub({ data: { id: 'conto-3', split_payment: false, causale_iva_id: null } })
  const originalSbFrom = sb.from
  sb.from = stub.from

  try {
    const res = await contabilitaRepo.updatePianoConto('conto-3', {
      split_payment: false,
      consumatore_finale: false,
      includi_spesometro: false,
      soggetto_riepilogativo: false,
      proc_concorsuale: false,
      richiede_efat_b2b: false,
      singola_ft_elettronica: false,
      includi_esterometro: false,
      partecipa_gruppo_iva: false,
    })
    assert.equal(stub.calls.payload.split_payment, false)
    assert.equal(stub.calls.payload.consumatore_finale, false)
    assert.equal(stub.calls.payload.includi_spesometro, false)
    assert.equal(stub.calls.payload.soggetto_riepilogativo, false)
    assert.equal(stub.calls.payload.proc_concorsuale, false)
    assert.equal(stub.calls.payload.richiede_efat_b2b, false)
    assert.equal(stub.calls.payload.singola_ft_elettronica, false)
    assert.equal(stub.calls.payload.includi_esterometro, false)
    assert.equal(stub.calls.payload.partecipa_gruppo_iva, false)
    assert.equal(res.data.split_payment, false)
  } finally {
    sb.from = originalSbFrom
  }
})

test('updatePianoConto genera errore chiaro se non torna alcuna riga aggiornata', async (t) => {
  const originalSbFrom = sb.from
  const stub = createSupabaseUpdateStub({ data: null, error: null })
  sb.from = stub.from

  try {
    await assert.rejects(
      contabilitaRepo.updatePianoConto('conto-missing', { split_payment: true }),
      /Nessuna anagrafica aggiornata: verifica id record o permessi RLS/i
    )
  } finally {
    sb.from = originalSbFrom
  }
})

test('getPianoContoById legge il record fresco da DB e replacePianoContoInList sostituisce il vecchio record', async () => {
  const originalSbFrom = sb.from
  const stub = createSupabaseReadStub({
    data: { id: 'conto-fresco', split_payment: false, descrizione: 'Cliente fresco' },
  })
  sb.from = stub.from

  try {
    const fresh = await contabilitaRepo.getPianoContoById('conto-fresco')
    assert.equal(stub.calls.table, 'piano_conti')
    assert.equal(stub.calls.select, 1)
    assert.deepEqual(stub.calls.eq, [['id', 'conto-fresco']])
    assert.equal(stub.calls.single, 1)
    assert.equal(fresh.split_payment, false)

    const staleList = [{ id: 'conto-fresco', split_payment: true, descrizione: 'Cliente stale' }]
    const replaced = contabilitaRepo.replacePianoContoInList(staleList, fresh)
    assert.equal(replaced[0].split_payment, false)
    assert.equal(replaced[0].descrizione, 'Cliente fresco')
  } finally {
    sb.from = originalSbFrom
  }
})

test('getPianoContoById fallisce su id mancante o record non trovato', async () => {
  await assert.rejects(contabilitaRepo.getPianoContoById(''), /Id anagrafica mancante/i)

  const originalSbFrom = sb.from
  const stub = createSupabaseReadStub({ data: null, error: null })
  sb.from = stub.from
  try {
    await assert.rejects(contabilitaRepo.getPianoContoById('conto-missing'), /Anagrafica non trovata/i)
  } finally {
    sb.from = originalSbFrom
  }
})
