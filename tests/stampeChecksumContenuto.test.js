import test from 'node:test'
import assert from 'node:assert/strict'
import { webcrypto } from 'node:crypto'
import { hashStampaContenuto } from '../src/modules/contabilita/application/stampe/hashStampaContenuto.js'

const options = { subtle: webcrypto.subtle }
const encoder = new TextEncoder()
const sample = {
  societaId: 'tenant-fittizio',
  tipoStampa: 'libro_giornale',
  annoFiscale: 2026,
  periodoInizio: '2026-01-01',
  periodoFine: '2026-12-31',
  mimeType: 'application/pdf',
  fileBytes: encoder.encode('%PDF-1.7\nFISCOSIM SAMPLE CONTENT\n'),
}
const hash = values => hashStampaContenuto({ ...sample, ...values }, options)

test('hash SHA-256 a 64 caratteri del contenuto reale: stabile sul medesimo byte array', async () => {
  const first = await hash()
  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, await hash({ fileBytes: new Uint8Array(sample.fileBytes) }))
  assert.equal(first, await hash({ fileBytes: sample.fileBytes.buffer.slice(0) }))
})

test('differenze di un solo byte o di metadata cambiano il digest', async () => {
  const digest = await hash()
  const changed = new Uint8Array(sample.fileBytes)
  changed[changed.length - 1] = changed[changed.length - 1] ^ 1
  assert.notEqual(await hash({ fileBytes: changed }), digest)
  assert.notEqual(await hash({ periodoFine: '2026-11-30' }), digest)
  assert.notEqual(await hash({ societaId: 'tenant-altro' }), digest)
  assert.notEqual(await hash({ tipoStampa: 'registro_iva_vendite' }), digest)
  assert.notEqual(await hash({ mimeType: 'text/html' }), digest)
})

test('non accetta metadata-only, stringhe, bytes vuoti o anni/periodi non validi', async () => {
  await assert.rejects(hash({ fileBytes: undefined }), /byte effettivi/)
  await assert.rejects(hash({ fileBytes: 'contenuto PDF' }), /byte effettivi/)
  await assert.rejects(hash({ fileBytes: new Uint8Array() }), /file vuoto/)
  await assert.rejects(hash({ periodoInizio: '2026-02-30' }), /non valido/)
  await assert.rejects(hash({ periodoFine: '2027-01-01' }), /non valido/)
  await assert.rejects(hash({ annoFiscale: 0 }), /non valido/)
})

test('SHA-256 mancante o fallito: errore esplicito, mai hash debole', async () => {
  await assert.rejects(hashStampaContenuto(sample, { subtle: null }), /non disponibile/)
  await assert.rejects(
    hashStampaContenuto(sample, { subtle: { digest: async () => { throw Error('crypto-failure') } } }),
    /crypto-failure/
  )
})
