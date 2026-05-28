import test from 'node:test'
import assert from 'node:assert/strict'
import { validateCanonicalAccountingPayload } from '../src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js'
import { createEmptyCanonicalAccountingPayload } from '../src/modules/contabilita/canonical/canonicalAccountingPayload.defaults.js'

function buildValidSimplePnPayload() {
  const payload = createEmptyCanonicalAccountingPayload()

  // Schema and source metadata
  payload.schemaVersion = '1.0.0'
  payload.source.module = 'registrazione_manuale'

  // Company context
  payload.company.societaId = 'soc-123'
  payload.company.esercizioId = 'ese-2026'

  // Fiscal Context
  payload.fiscalContext.dataRegistrazione = '2026-05-28'

  // Header Details
  payload.header.causaleContabile = {
    id: 'caus-generale',
    codice: 'GEN',
    tipoCausale: 'generale',
    descrizione: 'Movimento Generale Semplice'
  }
  payload.header.descrizione = 'Registrazione generica semplice'
  payload.header.stato = 'bozza'

  // Subjects (Mandatory when subjects are validated)
  payload.subjects = [
    { role: 'primary', tipoSoggetto: 'cliente', denominazione: 'Mario Rossi' }
  ]

  // Accounting Rows and Balance
  payload.accounting.rows = [
    { accountId: 'acc-costo', dare: 150.50, avere: 0, description: 'Riga costo' },
    { accountId: 'acc-cassa', dare: 0, avere: 150.50, description: 'Riga cassa' }
  ]
  payload.accounting.quadratura = {
    isBalanced: true,
    difference: 0
  }

  // Audit Metadata (Mandatory when shouldUpdateAuditTrail is true)
  payload.audit.sourceModule = 'registrazione_manuale'
  payload.audit.createdAt = '2026-05-28T23:34:24Z'
  payload.audit.operatorDecisions = []

  // Targets - Simple PN has shouldCreatePrimaNota = true, no IVA, no Ledger, no Withholding
  payload.postCommitTargets.shouldCreatePrimaNota = true
  payload.postCommitTargets.shouldCreateIva = false
  payload.postCommitTargets.shouldCreateLedger = false
  payload.postCommitTargets.shouldCreateWithholding = false
  payload.postCommitTargets.shouldUpdateAuditTrail = true

  return payload
}

test('1. PN semplice bilanciata Dare/Avere valida', () => {
  const payload = buildValidSimplePnPayload()
  const resultDraft = validateCanonicalAccountingPayload(payload, { mode: 'draft' })
  assert.equal(resultDraft.errors.length, 0, `Dovrebbero esserci 0 errori in draft, trovati: ${resultDraft.errors.join(', ')}`)
  assert.equal(resultDraft.isValid, true, 'Dovrebbe essere valido in modalità draft')

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, true, 'Dovrebbe essere valido in modalità commit')
  assert.equal(resultCommit.readiness, 'ready', 'Lo stato di readiness dovrebbe essere ready')
  assert.equal(resultCommit.blocking.length, 0, 'Non dovrebbero esserci elementi bloccanti')
})

test('2. PN semplice non bilanciata bloccata', () => {
  const payload = buildValidSimplePnPayload()
  payload.accounting.quadratura.isBalanced = false
  payload.accounting.quadratura.difference = 10.00

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, false)
  assert.equal(resultCommit.readiness, 'blocked')
  assert.ok(resultCommit.blocking.includes('accounting.quadratura.isBalanced deve essere true'))
})

test('3. PN semplice senza IVA valida solo se causale non IVA', () => {
  // Con causale non IVA (generale) deve essere valido
  const payload = buildValidSimplePnPayload()
  const resultGenerale = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultGenerale.isValid, true)

  // Con causale IVA (es. FF) e modulo IVA disattivato deve essere bloccato
  payload.header.causaleContabile = {
    id: 'caus-ff',
    codice: 'FF',
    tipoCausale: 'docivanormale', // Policy determines isDocumentoIva === true
    descrizione: 'Fattura Acquisto'
  }
  const resultIvaBlocked = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultIvaBlocked.isValid, false)
  assert.equal(resultIvaBlocked.readiness, 'blocked')
  assert.ok(resultIvaBlocked.blocking.includes('causale contabile richiede IVA ma modulo IVA non attivo'))
})

test('4. PN semplice senza partitario valida solo se causale non richiede soggetto/partita', () => {
  // Con causale che non richiede partitario deve essere valido
  const payload = buildValidSimplePnPayload()
  const resultGenerale = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultGenerale.isValid, true)

  // Con causale che richiede partitario (partiteOpen) e modulo partitario disattivato deve essere bloccato
  payload.header.causaleContabile = {
    id: 'caus-partite',
    codice: 'PG',
    tipoCausale: 'generale',
    operazionePartite: 'apertura', // Policy determines gestionePartitario !== 'nessuno'
    descrizione: 'Generale con Apertura Partite'
  }
  const resultPartitarioBlocked = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultPartitarioBlocked.isValid, false)
  assert.equal(resultPartitarioBlocked.readiness, 'blocked')
  assert.ok(resultPartitarioBlocked.blocking.includes('causale contabile richiede partitario ma modulo partitario non attivo'))
})

test('5. Righe con conto mancante bloccate', () => {
  const payload = buildValidSimplePnPayload()
  payload.accounting.rows[0].accountId = ''

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, false)
  assert.equal(resultCommit.readiness, 'blocked')
  assert.ok(resultCommit.blocking.includes('accounting.rows[0].accountId mancante'))
})

test('6. Importi zero o negativi gestiti correttamente', () => {
  // Caso 6a: Importo negativo in Dare
  let payload = buildValidSimplePnPayload()
  payload.accounting.rows[0].dare = -10.00
  let result = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(result.isValid, false)
  assert.ok(result.blocking.includes('accounting.rows[0].dare deve essere un numero non negativo'))

  // Caso 6b: Importo zero in entrambi
  payload = buildValidSimplePnPayload()
  payload.accounting.rows[0].dare = 0
  payload.accounting.rows[0].avere = 0
  result = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(result.isValid, false)
  assert.ok(result.blocking.includes('accounting.rows[0] deve avere un importo in dare o avere maggiore di zero'))

  // Caso 6c: Importi in entrambi (Dare > 0 AND Avere > 0)
  payload = buildValidSimplePnPayload()
  payload.accounting.rows[0].dare = 50.00
  payload.accounting.rows[0].avere = 50.00
  result = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(result.isValid, false)
  assert.ok(result.blocking.includes('accounting.rows[0] non può avere importi sia in dare che in avere'))
})

test('7. societa_id obbligatorio', () => {
  const payload = buildValidSimplePnPayload()
  payload.company.societaId = ''

  // In draft mode, isValid is true because there are no blocking issues, but the error must be logged
  const resultDraft = validateCanonicalAccountingPayload(payload, { mode: 'draft' })
  assert.equal(resultDraft.isValid, true)
  assert.ok(resultDraft.errors.includes('company.societaId mancante'))

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, false)
  assert.equal(resultCommit.readiness, 'blocked')
  assert.ok(resultCommit.blocking.includes('company.societaId mancante'))
})

test('8. data registrazione obbligatoria', () => {
  const payload = buildValidSimplePnPayload()
  payload.fiscalContext.dataRegistrazione = ''

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, false)
  assert.equal(resultCommit.readiness, 'blocked')
  assert.ok(resultCommit.blocking.includes('fiscalContext.dataRegistrazione mancante'))
})

test('9. causale contabile obbligatoria', () => {
  const payload = buildValidSimplePnPayload()
  payload.header.causaleContabile = null

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, false)
  assert.equal(resultCommit.readiness, 'blocked')
  assert.ok(resultCommit.blocking.includes('header.causaleContabile mancante'))
})

test('10. stato ammesso', () => {
  const payload = buildValidSimplePnPayload()
  payload.header.stato = 'stato_non_esistente'

  const resultCommit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  assert.equal(resultCommit.isValid, false)
  assert.equal(resultCommit.readiness, 'blocked')
  assert.ok(resultCommit.blocking.includes('header.stato non valido'))
})
