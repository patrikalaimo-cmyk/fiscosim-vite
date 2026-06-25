/**
 * Recinto di sicurezza Test Lab — Fase 24A.
 * Criterio DEMO esplicito: solo prefisso codice società, nessuna euristica su denominazione.
 */

export const DEMO_COMPANY_CODE_PREFIXES = ['__test__', 'test_']

/** Fase 24A: solo fondazione sicura, nessun ciclo contabile operativo. */
export const TEST_LAB_PHASE_24A = Object.freeze({
  id: '24A',
  operational: false,
  scenariosEnabled: false,
  allowImport: false,
  allowCommit: false,
  allowCleanup: false,
  allowInvoiceGeneration: false,
})

/**
 * @param {object|null|undefined} societa
 * @returns {boolean}
 */
export function isDemoCompany(societa) {
  if (!societa || typeof societa !== 'object') return false
  const codice = String(societa.codice || '').trim().toLowerCase()
  if (!codice) return false
  return DEMO_COMPANY_CODE_PREFIXES.some((prefix) => codice.startsWith(prefix))
}

/**
 * @param {object|null|undefined} societa
 * @param {string} [context]
 * @returns {true}
 */
export function assertDemoCompanyForTestLab(societa, context = 'Test Lab') {
  if (!isDemoCompany(societa)) {
    const label = societa?.denominazione || societa?.codice || 'sconosciuta'
    throw new Error(
      `${context}: la società "${label}" non è qualificata come DEMO. ` +
        'Richiesto codice società con prefisso __TEST__ o test_.'
    )
  }
  return true
}

/** @deprecated Usare isDemoCompany — alias temporaneo per compatibilità interna. */
export const isTestCompany = isDemoCompany
