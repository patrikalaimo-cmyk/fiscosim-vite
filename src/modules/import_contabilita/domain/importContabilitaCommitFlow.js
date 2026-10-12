/**
 * Separazione flusso commit Import reale vs Test Lab/demo.
 */

import { isDemoCompany } from '../../test_mode/demoCompanyGuard.js'
import { isFiscalJournalPersistLabEnabled } from '../../contabilita/application/fiscalJournal/isFiscalJournalPersistLabEnabled.js'

const DOCUMENTI_IMPORT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SG_E2E_SOCIETA_CODE_RE = /^sg-e2e/i

export const REAL_IMPORT_STAGING_ID_BLOCKER = 'Documento import reale senza ID staging valido: impossibile aggiornare lo stato import. Riaprire il documento dalla lista import reale o verificare il mapping staging.'

/**
 * @param {string|null|undefined} documentId
 * @returns {boolean}
 */
export function isDocumentiImportStagingUuid(documentId) {
  return DOCUMENTI_IMPORT_UUID_RE.test(String(documentId || '').trim())
}

/**
 * @param {string|null|undefined} documentId
 * @returns {boolean}
 */
export function isSyntheticTestLabImportDocumentId(documentId) {
  const id = String(documentId || '').trim()
  if (!id) return false
  return /^test_lab_/i.test(id)
}

/**
 * @param {object} [params]
 * @param {object|null} [params.societa]
 * @param {string} [params.documentId]
 * @returns {'test_lab'|'real_import'}
 */
export function resolveImportCommitFlowKind({ societa = null, documentId = '' } = {}) {
  if (isDemoCompany(societa)) return 'test_lab'
  if (isSyntheticTestLabImportDocumentId(documentId)) return 'test_lab'
  return 'real_import'
}

/**
 * @param {'test_lab'|'real_import'} flowKind
 * @returns {string}
 */
export function getImportCommitLogTag(flowKind) {
  return flowKind === 'test_lab' ? 'TEST_LAB_COMMIT' : 'IMPORT_REAL_COMMIT'
}

/**
 * LAB-only: SG-E2E browser upload builds ephemeral `ic-*` staging ids (no documenti_import row yet).
 * Allow fiscal commit when Stage3W persist LAB flag is on; never for ordinary companies.
 * @param {object|null|undefined} societa
 * @param {boolean} [labPersistOverride]
 * @returns {boolean}
 */
export function isLabEphemeralImportStagingBypassEnabled(societa = null, labPersistOverride) {
  const codice = String(societa?.codice || '').trim()
  if (!SG_E2E_SOCIETA_CODE_RE.test(codice)) return false
  return isFiscalJournalPersistLabEnabled(labPersistOverride)
}

/**
 * @param {object} [params]
 * @param {object|null} [params.societa]
 * @param {string} [params.documentId]
 * @param {boolean} [params.labPersistOverride]
 * @returns {{ allowed: boolean, flowKind: 'test_lab'|'real_import', blockingIssue?: string, labStagingBypass?: boolean }}
 */
export function evaluateRealImportStagingIdGuard({
  societa = null,
  documentId = '',
  labPersistOverride,
} = {}) {
  const flowKind = resolveImportCommitFlowKind({ societa, documentId })
  if (flowKind !== 'real_import') {
    return { allowed: true, flowKind }
  }
  if (isDocumentiImportStagingUuid(documentId)) {
    return { allowed: true, flowKind }
  }
  if (isLabEphemeralImportStagingBypassEnabled(societa, labPersistOverride)) {
    return { allowed: true, flowKind, labStagingBypass: true }
  }
  return {
    allowed: false,
    flowKind,
    blockingIssue: REAL_IMPORT_STAGING_ID_BLOCKER,
  }
}
