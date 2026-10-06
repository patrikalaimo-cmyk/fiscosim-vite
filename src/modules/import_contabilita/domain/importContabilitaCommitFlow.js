/**
 * Separazione flusso commit Import reale vs Test Lab/demo.
 */

import { isDemoCompany } from '../../test_mode/demoCompanyGuard.js'

const DOCUMENTI_IMPORT_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
 * @param {object} [params]
 * @param {object|null} [params.societa]
 * @param {string} [params.documentId]
 * @returns {{ allowed: boolean, flowKind: 'test_lab'|'real_import', blockingIssue?: string }}
 */
export function evaluateRealImportStagingIdGuard({ societa = null, documentId = '' } = {}) {
  const flowKind = resolveImportCommitFlowKind({ societa, documentId })
  if (flowKind !== 'real_import') {
    return { allowed: true, flowKind }
  }
  if (isDocumentiImportStagingUuid(documentId)) {
    return { allowed: true, flowKind }
  }
  return {
    allowed: false,
    flowKind,
    blockingIssue: REAL_IMPORT_STAGING_ID_BLOCKER,
  }
}
