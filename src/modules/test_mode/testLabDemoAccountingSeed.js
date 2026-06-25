/**
 * Seed contabile minimo società demo Test Lab — Fase 24B-FIX-3.
 * Solo società demo, idempotente, zero contabilizzazione/fatture/pulizia.
 */

import { assertDemoCompanyForTestLab } from './demoCompanyGuard.js'
import { isAdminOrOwnerForTestLab } from './demoCompanyProvision.js'
import {
  TEST_LAB_ACCOUNTING_MARKER,
  DEMO_PIANO_CODICE,
  DEMO_CAUSALE_FF_CODICE,
  buildDemoPianoContiSeedDefs,
  buildDemoCausaleFfPayload,
  buildDemoCausaliIvaSeedDefs,
} from './testLabAccountingSchema.js'

const PIANO_CONTI_SELECT = 'id,codice,descrizione,societa_id,attivo'
const CAUSALI_CONTABILI_SELECT = 'id,codice,descrizione,societa_id,attivo'
const CAUSALI_IVA_SELECT = 'id,codice,descrizione,aliquota,societa_id,attivo'

function isDuplicateKeyError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return code === '23505' || message.includes('duplicate') || message.includes('unique')
}

function emptyBucket() {
  return { created: 0, existing: 0, errors: [] }
}

/**
 * @param {object} db
 * @param {string} table
 * @param {string} societaId
 * @param {string} codice
 * @returns {Promise<object|null>}
 */
async function findBySocietaCodice(db, table, societaId, codice) {
  const { data, error } = await db
    .from(table)
    .select(table === 'piano_conti' ? PIANO_CONTI_SELECT : table === 'causali_contabili' ? CAUSALI_CONTABILI_SELECT : CAUSALI_IVA_SELECT)
    .eq('societa_id', societaId)
    .eq('codice', codice)
    .maybeSingle()
  if (error && !isDuplicateKeyError(error)) {
    throw new Error(error.message || `Errore lettura ${table}.${codice}`)
  }
  return data || null
}

/**
 * @param {object} bucket
 * @param {object|null} existing
 * @returns {boolean}
 */
function markExisting(bucket, existing) {
  if (existing?.id) {
    bucket.existing += 1
    return true
  }
  return false
}

function computeSeedReportStatus(report) {
  const totalErrors = [
    ...report.pianoConti.errors,
    ...report.causaliContabili.errors,
    ...report.causaliIva.errors,
    ...report.errori,
  ]
  if (totalErrors.length > 0) return 'rosso'
  const created = report.pianoConti.created + report.causaliContabili.created + report.causaliIva.created
  if (created > 0) return 'verde'
  return 'giallo'
}

/**
 * @param {object} params
 * @param {object} params.db
 * @param {object|null|undefined} params.utente
 * @param {object} params.societa
 * @param {string} params.societaId
 * @returns {Promise<object>}
 */
export async function ensureTestLabDemoAccountingSetup({ db, utente, societa, societaId }) {
  assertDemoCompanyForTestLab(societa, 'ensureTestLabDemoAccountingSetup')
  if (!isAdminOrOwnerForTestLab(utente)) {
    throw new Error('Solo Admin/Owner possono preparare i dati contabili demo Test Lab.')
  }
  if (!societaId) throw new Error('Test Lab: societaId obbligatorio per seed contabile')

  const report = {
    scenario: 'demo_accounting_seed_24b_fix_3',
    societaCodice: societa?.codice,
    societaId,
    pianoConti: emptyBucket(),
    causaliContabili: emptyBucket(),
    causaliIva: emptyBucket(),
    registroIvaMovimenti: 0,
    primeNoteCreate: 0,
    documentiContabilizzati: 0,
    partitarioCreato: 0,
    fattureGenerate: 0,
    errori: [],
    preparedAt: new Date().toISOString(),
  }

  const pianoByKey = {}

  for (const def of buildDemoPianoContiSeedDefs()) {
    const { key, ...payload } = def
    try {
      const existing = await findBySocietaCodice(db, 'piano_conti', societaId, payload.codice)
      if (markExisting(report.pianoConti, existing)) {
        pianoByKey[key] = existing
        continue
      }
      const inserted = await db
        .from('piano_conti')
        .insert([{ ...payload, societa_id: societaId }])
        .select(PIANO_CONTI_SELECT)
        .single()
      if (inserted.error) {
        if (isDuplicateKeyError(inserted.error)) {
          const retry = await findBySocietaCodice(db, 'piano_conti', societaId, payload.codice)
          if (retry?.id) {
            report.pianoConti.existing += 1
            pianoByKey[key] = retry
            continue
          }
        }
        throw new Error(inserted.error.message || `Insert piano_conti ${payload.codice}`)
      }
      report.pianoConti.created += 1
      pianoByKey[key] = inserted.data
    } catch (err) {
      report.pianoConti.errors.push(`${payload.codice}: ${err?.message || err}`)
    }
  }

  try {
    const existingFf = await findBySocietaCodice(db, 'causali_contabili', societaId, DEMO_CAUSALE_FF_CODICE)
    if (!markExisting(report.causaliContabili, existingFf)) {
      const ffPayload = buildDemoCausaleFfPayload(societaId, pianoByKey.ivaCredito || null)
      const insertedFf = await db
        .from('causali_contabili')
        .insert([ffPayload])
        .select(CAUSALI_CONTABILI_SELECT)
        .single()
      if (insertedFf.error) {
        if (isDuplicateKeyError(insertedFf.error)) {
          report.causaliContabili.existing += 1
        } else {
          throw new Error(insertedFf.error.message || 'Insert causale FF')
        }
      } else {
        report.causaliContabili.created += 1
      }
    }
  } catch (err) {
    report.causaliContabili.errors.push(`FF: ${err?.message || err}`)
  }

  for (const def of buildDemoCausaliIvaSeedDefs(societaId)) {
    const { key, ...payload } = def
    try {
      const existing = await findBySocietaCodice(db, 'causali_iva', societaId, payload.codice)
      if (markExisting(report.causaliIva, existing)) continue

      const inserted = await db
        .from('causali_iva')
        .insert([payload])
        .select(CAUSALI_IVA_SELECT)
        .single()
      if (inserted.error) {
        if (isDuplicateKeyError(inserted.error)) {
          report.causaliIva.existing += 1
          continue
        }
        throw new Error(inserted.error.message || `Insert causali_iva ${payload.codice}`)
      }
      report.causaliIva.created += 1
    } catch (err) {
      report.causaliIva.errors.push(`${payload.codice}: ${err?.message || err}`)
    }
  }

  report.stato = computeSeedReportStatus(report)
  report.marker = TEST_LAB_ACCOUNTING_MARKER
  report.registroAcquisti01 = '01 (via causale FF codice_registro_iva)'
  report.contiMinimi = Object.values(DEMO_PIANO_CODICE)

  return {
    ok: report.stato !== 'rosso',
    report,
    pianoByKey,
  }
}

export { DEMO_PIANO_CODICE, DEMO_CAUSALE_FF_CODICE, TEST_LAB_ACCOUNTING_MARKER }
