/**
 * Schema reale tabella `societa` — perimetro Test Lab (introspezione DB live 2026-06-25).
 * NON include `ragione_sociale` (assente nello schema produzione).
 */

/** Colonne rilevate su DB live (non usare per insert automatico). */
export const SOCIETA_LIVE_KNOWN_COLUMNS = Object.freeze([
  'id',
  'codice',
  'denominazione',
  'codice_fiscale',
  'partita_iva',
  'indirizzo',
  'cap',
  'citta',
  'provincia',
  'regime_contabile',
  'esercizio_da',
  'esercizio_a',
  'attiva',
  'note',
  'created_at',
  'updated_at',
  'ai_enabled',
  'tipo_liquidazione_iva',
  'email',
  'pec',
  'telefono',
  'attivo',
])

/** Select lista tendina Test Lab — solo colonne reali. */
export const SOCIETA_TEST_LAB_LIST_SELECT =
  'id,denominazione,codice,partita_iva,codice_fiscale,attiva'

/** Select provisioning/aggancio società demo. */
export const SOCIETA_TEST_LAB_PROVISION_SELECT =
  'id,codice,denominazione,partita_iva,codice_fiscale,attiva,note'

/** Colonne vietate nel perimetro Test Lab/società demo (schema live). */
export const SOCIETA_FORBIDDEN_COLUMNS = Object.freeze(['ragione_sociale'])

/**
 * @param {object|null|undefined} societa
 * @returns {string}
 */
export function resolveSocietaDisplayName(societa) {
  return String(societa?.denominazione || '').trim() || 'Società Demo'
}

/**
 * @param {object} payload
 * @returns {string[]}
 */
export function listForbiddenSocietaPayloadColumns(payload) {
  if (!payload || typeof payload !== 'object') return []
  return SOCIETA_FORBIDDEN_COLUMNS.filter((col) => Object.prototype.hasOwnProperty.call(payload, col))
}
