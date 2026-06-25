/**
 * Provisioning società demo Test Lab — Fase 24B-FIX.
 * Crea o aggancia __TEST__FISCOSIM_DEMO senza contabilizzazione/fatture/pulizia.
 */

import { isDemoCompany } from './demoCompanyGuard.js'

export const TEST_LAB_DEMO_COMPANY_CODE = '__TEST__FISCOSIM_DEMO'
export const TEST_LAB_DEMO_COMPANY_DENOMINATION = 'FiscoSim Demo Test Lab SRL'

const ADMIN_OWNER_ROLES = new Set(['owner', 'admin'])

/**
 * @param {object|null|undefined} utente
 * @returns {boolean}
 */
export function isAdminOrOwnerForTestLab(utente) {
  const ruolo = String(utente?.ruolo || '').trim().toLowerCase()
  return ADMIN_OWNER_ROLES.has(ruolo)
}

/**
 * @returns {object}
 */
export function buildTestLabDemoCompanyPayload() {
  return {
    codice: TEST_LAB_DEMO_COMPANY_CODE,
    denominazione: TEST_LAB_DEMO_COMPANY_DENOMINATION,
    ragione_sociale: TEST_LAB_DEMO_COMPANY_DENOMINATION,
    partita_iva: '',
    codice_fiscale: '',
    regime_contabile: 'ordinaria',
    attiva: true,
    note: '[TEST_LAB] Società demo FiscoSim — solo dati di test',
  }
}

/**
 * @param {object} db — client Supabase-like
 * @returns {Promise<{ data: object|null, error: object|null }>}
 */
export async function findTestLabDemoCompany(db) {
  if (!db?.from) return { data: null, error: new Error('db_client_missing') }
  return db
    .from('societa')
    .select('id,codice,denominazione,ragione_sociale,partita_iva,attiva,note')
    .eq('codice', TEST_LAB_DEMO_COMPANY_CODE)
    .maybeSingle()
}

function isDuplicateKeyError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()
  return code === '23505' || message.includes('duplicate') || message.includes('unique')
}

/**
 * Idempotente: trova o crea la società demo canonica Test Lab.
 * @param {object} params
 * @param {object} params.db
 * @param {object|null|undefined} params.utente
 * @returns {Promise<{ societa: object, created: boolean, attached: boolean }>}
 */
export async function ensureTestLabDemoCompany({ db, utente }) {
  if (!isAdminOrOwnerForTestLab(utente)) {
    throw new Error(
      'Solo Admin/Owner possono creare o agganciare la società demo Test Lab.'
    )
  }

  const existing = await findTestLabDemoCompany(db)
  if (existing.error && !isDuplicateKeyError(existing.error)) {
    throw new Error(existing.error.message || 'Errore lettura società demo')
  }
  if (existing.data?.id) {
    if (existing.data.attiva === false) {
      const { data: reactivated, error: reactivateError } = await db
        .from('societa')
        .update({ attiva: true })
        .eq('id', existing.data.id)
        .select('id,codice,denominazione,ragione_sociale,partita_iva,attiva,note')
        .single()
      if (reactivateError) throw new Error(reactivateError.message || 'Errore riattivazione società demo')
      return { societa: reactivated, created: false, attached: true }
    }
    return { societa: existing.data, created: false, attached: true }
  }

  const payload = buildTestLabDemoCompanyPayload()
  const inserted = await db.from('societa').insert([payload]).select().single()
  if (inserted.error) {
    if (isDuplicateKeyError(inserted.error)) {
      const retry = await findTestLabDemoCompany(db)
      if (retry.data?.id) {
        return { societa: retry.data, created: false, attached: true }
      }
    }
    throw new Error(inserted.error.message || 'Errore creazione società demo')
  }

  return { societa: inserted.data, created: true, attached: false }
}

/**
 * @param {object|null|undefined} societa
 * @returns {boolean}
 */
export function isCanonicalTestLabDemoCompany(societa) {
  if (!isDemoCompany(societa)) return false
  return String(societa?.codice || '').trim() === TEST_LAB_DEMO_COMPANY_CODE
}
