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

/** Fase 24B: Prepara test — solo staging/working table, no contabilizzazione. */
export const TEST_LAB_PHASE_24B = Object.freeze({
  id: '24B',
  operational: true,
  scenariosEnabled: ['ordinarie_acquisto_24b'],
  allowPrepare: true,
  allowImport: true,
  allowCommit: false,
  allowCleanup: false,
  allowFullCycle: false,
  allowInvoiceGeneration: true,
})

/** Fase 24C: Ciclo completo controllato su una sola riga selezionata. */
export const TEST_LAB_PHASE_24C = Object.freeze({
  id: '24C',
  operational: true,
  scenariosEnabled: ['ordinarie_acquisto_24b'],
  allowPrepare: true,
  allowImport: true,
  allowCommit: true,
  allowCleanup: false,
  allowFullCycle: true,
  allowInvoiceGeneration: true,
})

/** Fase 24D: Riaggancio working area su società demo senza commit. */
export const TEST_LAB_PHASE_24D = Object.freeze({
  id: '24D',
  operational: true,
  scenariosEnabled: ['ordinarie_acquisto_24b'],
  allowPrepare: true,
  allowImport: true,
  allowCommit: false,
  allowCleanup: false,
  allowFullCycle: false,
  allowInvoiceGeneration: true,
})

/** Fase 24E: Commit reale controllato da working view — 1 documento demo. */
export const TEST_LAB_PHASE_24E = Object.freeze({
  id: '24E',
  operational: true,
  scenariosEnabled: ['ordinarie_acquisto_24b'],
  allowPrepare: true,
  allowImport: true,
  allowCommit: true,
  allowCleanup: false,
  allowFullCycle: true,
  allowSingleDocumentCommit: true,
  allowInvoiceGeneration: true,
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

/**
 * @param {object|null|undefined} societa
 * @returns {{ id: string, denominazione: string, codice: string }}
 */
export function formatDemoGuardDiagnostic(societa) {
  return {
    id: societa?.id ? String(societa.id).trim() : 'mancante',
    denominazione: societa?.denominazione ? String(societa.denominazione).trim() : 'mancante',
    codice: societa?.codice ? String(societa.codice).trim() : 'mancante',
  }
}

/**
 * Risolve la società selezionata nel flusso Import (id + codice + denominazione).
 * Nessun fallback su denominazione per qualificazione demo.
 *
 * @param {Array<object>|null|undefined} societaOptions
 * @param {string} societaId
 * @param {string} [fallbackDenominazione]
 * @returns {object|null}
 */
export function resolveSocietaFromImportOptions(societaOptions, societaId, fallbackDenominazione = '') {
  const id = String(societaId || '').trim()
  if (!id) return null

  const found = Array.isArray(societaOptions)
    ? societaOptions.find((row) => String(row?.id || '').trim() === id)
    : null

  if (found) {
    return {
      id: String(found.id || id).trim(),
      codice: String(found.codice || '').trim(),
      denominazione: String(found.denominazione || fallbackDenominazione || '').trim(),
    }
  }

  return {
    id,
    codice: '',
    denominazione: String(fallbackDenominazione || '').trim(),
  }
}

/**
 * Valuta se Import Contabilità può aprire la working area demo (solo codice società).
 *
 * @param {object|null|undefined} societa
 * @returns {{ allowed: boolean, reason: string, diagnostic: object }}
 */
export function evaluateDemoCompanyForImport(societa) {
  const diagnostic = formatDemoGuardDiagnostic(societa)

  if (!societa || typeof societa !== 'object' || !diagnostic.id || diagnostic.id === 'mancante') {
    return {
      allowed: false,
      reason: 'Società non selezionata nel flusso Import',
      diagnostic,
    }
  }

  if (!String(societa.codice || '').trim()) {
    return {
      allowed: false,
      reason: 'Codice società non disponibile nel flusso Import',
      diagnostic,
    }
  }

  if (!isDemoCompany(societa)) {
    return {
      allowed: false,
      reason: 'Contabilizzazione non consentita: la modalità Test Lab è attiva solo per la società demo',
      diagnostic,
    }
  }

  return { allowed: true, reason: '', diagnostic }
}

/**
 * @param {{ reason: string, diagnostic: object }} evaluation
 * @returns {string}
 */
export function buildImportDemoGuardBlockMessage(evaluation) {
  const { reason, diagnostic } = evaluation || {}
  const d = diagnostic || {}
  return `${reason || 'Accesso demo bloccato'} [id=${d.id || 'mancante'}; denominazione=${d.denominazione || 'mancante'}; codice=${d.codice || 'mancante'}]`
}
