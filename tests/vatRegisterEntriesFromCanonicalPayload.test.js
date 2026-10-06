import test from 'node:test'
import assert from 'node:assert/strict'
import { buildVatRegisterEntriesFromCanonicalPayload } from '../src/modules/contabilita/application/iva/buildVatRegisterEntriesFromCanonicalPayload.js'

function buildPayload({
  registerType = 'vendite',
  sign = '+',
  tipoCausale = 'docivanormale',
  operazioneGestita = '',
  rows = [{ imponibile: 100, imposta: 22, aliquota: 22, causaleIvaId: 'iva-22', detraibilitaPercent: 100 }],
  causaleOverrides = {},
  vatOverrides = {},
} = {}) {
  return {
    company: { societaId: 'soc-1' },
    fiscalContext: {
      dataRegistrazione: '2026-06-11',
      tipoRegistro: registerType,
      reverseCharge: false,
      splitPayment: false,
      ivaPerCassa: false,
    },
    header: {
      causaleContabile: {
        tipoCausale,
        operazioneGestita,
        registroIva: registerType,
        segnoRegistroIva: sign,
        ...causaleOverrides,
      },
    },
    document: {
      numeroDocumento: 'DOC-1',
      dataDocumento: '2026-06-10',
      tipoDocumento: '',
    },
    vat: {
      enabled: true,
      registerType,
      rows: rows.map((row) => ({ registerType, segnoRegistro: sign, ...row })),
      splitPayment: false,
      reverseCharge: false,
      ivaPerCassa: false,
      autofattura: false,
      integrazioneEstero: false,
      ...vatOverrides,
    },
    postCommitTargets: { shouldCreateIva: true },
  }
}

test('fattura attiva genera registro vendite con importi e totale positivi', () => {
  const result = buildVatRegisterEntriesFromCanonicalPayload(buildPayload({
    operazioneGestita: 'Fattura attiva',
  }))
  assert.equal(result.handled, true)
  assert.deepEqual(
    {
      tipo: result.entries[0].tipo,
      imponibile: result.entries[0].imponibile,
      iva: result.entries[0].iva,
      totale: result.entries[0].totale,
      caseType: result.entries[0].caseType,
    },
    { tipo: 'vendita', imponibile: 100, iva: 22, totale: 122, caseType: 'fattura_attiva' }
  )
})

test('fattura passiva genera registro acquisti e detraibilita corretta', () => {
  const result = buildVatRegisterEntriesFromCanonicalPayload(buildPayload({
    registerType: 'acquisti',
    operazioneGestita: 'Fattura passiva',
    rows: [{ imponibile: 100, imposta: 22, aliquota: 22, detraibilitaPercent: 40 }],
  }))
  assert.equal(result.entries[0].tipo, 'acquisto')
  assert.equal(result.entries[0].iva_detraibile, 8.8)
  assert.equal(result.entries[0].iva_indetraibile, 13.2)
})

test('nota credito attiva sottrae dal registro vendite', () => {
  const result = buildVatRegisterEntriesFromCanonicalPayload(buildPayload({
    tipoCausale: 'docivanormale',
    registerType: 'vendite',
    sign: '-',
    operazioneGestita: 'Nota credito attiva',
  }))
  assert.equal(result.entries[0].tipo, 'vendita')
  assert.equal(result.entries[0].imponibile, -100)
  assert.equal(result.entries[0].iva, -22)
  assert.equal(result.entries[0].totale, -122)
})

test('nota credito passiva sottrae dal registro acquisti', () => {
  const result = buildVatRegisterEntriesFromCanonicalPayload(buildPayload({
    tipoCausale: 'notacredito',
    registerType: 'acquisti',
    sign: '-',
    operazioneGestita: 'Nota credito passiva',
  }))
  assert.equal(result.entries[0].tipo, 'acquisto')
  assert.equal(result.entries[0].iva_detraibile, -22)
  assert.equal(result.entries[0].totale, -122)
})

test('multi-aliquota genera una riga per aliquota con arrotondamento ai centesimi', () => {
  const result = buildVatRegisterEntriesFromCanonicalPayload(buildPayload({
    rows: [
      { imponibile: 10.005, imposta: 2.201, aliquota: 22, detraibilitaPercent: 100 },
      { imponibile: 20.004, imposta: 2.0004, aliquota: 10, detraibilitaPercent: 100 },
    ],
  }))
  assert.equal(result.entries.length, 2)
  assert.deepEqual(
    result.entries.map(({ imponibile, iva, totale }) => ({ imponibile, iva, totale })),
    [
      { imponibile: 10.01, iva: 2.2, totale: 12.21 },
      { imponibile: 20, iva: 2, totale: 22 },
    ]
  )
})

test('prima nota semplice senza IVA non genera righe', () => {
  const payload = buildPayload()
  payload.postCommitTargets.shouldCreateIva = false
  payload.vat.enabled = false
  payload.vat.rows = []
  const result = buildVatRegisterEntriesFromCanonicalPayload(payload)
  assert.deepEqual(result.entries, [])
})

test('registro o segno mancanti sono bloccanti', () => {
  const missingRegister = buildPayload({ registerType: '' })
  assert.throws(
    () => buildVatRegisterEntriesFromCanonicalPayload(missingRegister),
    (error) => error.code === 'VAT_REGISTER_ENTRIES_BLOCKED' && error.message.includes('Registro IVA')
  )

  const missingSign = buildPayload({ sign: '' })
  assert.throws(
    () => buildVatRegisterEntriesFromCanonicalPayload(missingSign),
    (error) => error.code === 'VAT_REGISTER_ENTRIES_BLOCKED' && error.message.includes('Segno registro IVA')
  )
})

test('codice e descrizione causale non attivano classificazioni produttive', () => {
  const payload = buildPayload({
    tipoCausale: '',
    registerType: 'vendite',
    sign: '+',
    causaleOverrides: {
      codice: 'FC',
      descrizione: 'Fattura vendita cliente',
    },
  })
  assert.throws(
    () => buildVatRegisterEntriesFromCanonicalPayload(payload),
    (error) => error.code === 'VAT_REGISTER_ENTRIES_BLOCKED' && error.message.includes('Tipo causale tecnico')
  )
})

test('casi IVA speciali restano fuori dal motore ordinario', () => {
  const payload = buildPayload({ vatOverrides: { splitPayment: true } })
  const result = buildVatRegisterEntriesFromCanonicalPayload(payload)
  assert.equal(result.handled, false)
  assert.equal(result.reason, 'special_vat_posting')
})

test('mappatura soggetto_piva e soggetto_denominazione da subjects', () => {
  const payload = buildPayload({
    operazioneGestita: 'Fattura attiva',
  })
  payload.subjects = [
    {
      role: 'primary',
      tipoSoggetto: 'controparte',
      denominazione: 'Cliente Test S.p.A.',
      partitaIva: '09876543210',
    }
  ]

  const result = buildVatRegisterEntriesFromCanonicalPayload(payload)
  assert.equal(result.handled, true)
  assert.equal(result.entries[0].soggetto_denominazione, 'Cliente Test S.p.A.')
  assert.equal(result.entries[0].soggetto_piva, '09876543210')
})
