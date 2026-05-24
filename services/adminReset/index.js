import { getSupabaseAdmin } from '../../lib/db.js'
import { assertDocumentAccess, assertSocietaAccess } from '../../lib/authorization.js'
import { writeAdminResetAuditSafe } from './resetAuditRepo.js'
import { runResetDocumentClaims } from './resetClaimsService.js'
import { runResetImportQueue } from './resetImportQueueService.js'
import { runResetDocumentWorkflow } from './resetDocumentWorkflowService.js'
import { runPurgeTestImportDocument } from './purgeTestImportDocumentService.js'
import { runPurgeTestImportAccountingAll } from './purgeTestImportAccountingAllService.js'
import {
  ADMIN_RESET_ACTIONS,
  ADMIN_RESET_SCOPE_TYPES,
  normalizeId,
  normalizeResetAction,
  normalizeScopeType,
  toBoolean,
} from './resetUtils.js'

const handlers = {
  [ADMIN_RESET_ACTIONS.reset_document_claims]: runResetDocumentClaims,
  [ADMIN_RESET_ACTIONS.reset_import_queue]: runResetImportQueue,
  [ADMIN_RESET_ACTIONS.reset_document_workflow]: runResetDocumentWorkflow,
  [ADMIN_RESET_ACTIONS.purge_test_import_document]: runPurgeTestImportDocument,
  [ADMIN_RESET_ACTIONS.purge_test_import_accounting_all]: runPurgeTestImportAccountingAll,
}

function validateScopeForAction(action, scopeType, scopeId, societaId) {
  if (action === ADMIN_RESET_ACTIONS.reset_document_claims) {
    if (![ADMIN_RESET_SCOPE_TYPES.company, ADMIN_RESET_SCOPE_TYPES.document].includes(scopeType)) {
      throw new Error('scopeType non valido per reset_document_claims')
    }
    if (scopeType === ADMIN_RESET_SCOPE_TYPES.company && !societaId) {
      throw new Error('societaId obbligatoria per scope company')
    }
    if (scopeType === ADMIN_RESET_SCOPE_TYPES.document && !scopeId) {
      throw new Error('scopeId documento obbligatorio')
    }
    return
  }

  if (action === ADMIN_RESET_ACTIONS.reset_import_queue) {
    if (scopeType !== ADMIN_RESET_SCOPE_TYPES.company || !societaId) {
      throw new Error('reset_import_queue richiede scopeType=company e societaId')
    }
    return
  }

  if (
    action === ADMIN_RESET_ACTIONS.purge_test_import_document ||
    action === ADMIN_RESET_ACTIONS.purge_test_import_accounting_all
  ) {
    if (scopeType !== ADMIN_RESET_SCOPE_TYPES.company || !societaId) {
      throw new Error(`${action} richiede scopeType=company e societaId`)
    }
    return
  }

  if (action === ADMIN_RESET_ACTIONS.reset_document_workflow) {
    if (scopeType !== ADMIN_RESET_SCOPE_TYPES.document || !scopeId) {
      throw new Error('reset_document_workflow richiede scopeType=document e scopeId')
    }
  }
}

async function assertResetScopeAccess({ auth, action, scopeType, scopeId, societaId }) {
  const authUserId = auth?.user?.id || ''
  if (!authUserId) throw new Error('Utente autenticato mancante')

  if (scopeType === ADMIN_RESET_SCOPE_TYPES.company) {
    await assertSocietaAccess({ authUserId, societaId })
    return
  }

  if (scopeType === ADMIN_RESET_SCOPE_TYPES.document) {
    await assertDocumentAccess({ authUserId, documentId: scopeId, societaId })
  }

  if (action === ADMIN_RESET_ACTIONS.reset_import_queue && societaId) {
    await assertSocietaAccess({ authUserId, societaId })
  }
}

export async function runAdminReset({ body, auth, db: injectedDb = null }) {
  const rawAction = normalizeId(body?.action).toLowerCase()
  const rawScopeType = normalizeId(body?.scopeType).toLowerCase()
  const action = normalizeResetAction(body?.action)
  const scopeType = normalizeScopeType(body?.scopeType)
  const scopeId = normalizeId(body?.scopeId)
  const societaId = normalizeId(body?.societaId)
  const dryRun = toBoolean(body?.dryRun, true)
  let db = null

  try {
    db = injectedDb || await getSupabaseAdmin()
    if (!action || !handlers[action]) {
      throw new Error('Azione reset non supportata')
    }

    validateScopeForAction(action, scopeType, scopeId, societaId)
    await assertResetScopeAccess({ auth, action, scopeType, scopeId, societaId })

    const result = await handlers[action]({
      db,
      auth,
      dryRun,
      scopeType,
      scopeId,
      societaId,
      body,
    })

    await writeAdminResetAuditSafe(db, {
      action,
      auth,
      societaId,
      scopeType,
      scopeId,
      dryRun,
      status: result.status,
      touchedCount: result.touchedCount,
      blockedCount: result.blockedCount,
      skippedCount: result.skippedCount,
      resultSummary: result.summary,
      payload: {
        request: { action, scopeType, scopeId, societaId, dryRun },
        result,
      },
    })

    return result
  } catch (error) {
    await writeAdminResetAuditSafe(db, {
      action: action || rawAction || 'invalid_action',
      auth,
      societaId,
      scopeType: scopeType || rawScopeType || null,
      scopeId,
      dryRun,
      status: 'error',
      touchedCount: 0,
      blockedCount: 0,
      skippedCount: 0,
      resultSummary: error?.message || String(error),
      payload: {
        request: { action: rawAction || action, scopeType: rawScopeType || scopeType, scopeId, societaId, dryRun },
        error: error?.message || String(error),
      },
    })
    throw error
  }
}
