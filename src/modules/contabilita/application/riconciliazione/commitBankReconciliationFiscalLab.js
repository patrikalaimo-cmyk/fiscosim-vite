import { isBankFiscalCommitLabEnabled } from './isBankFiscalCommitLabEnabled.js'
import { mapBankPayloadToFiscalJournalRequest } from './mapBankPayloadToFiscalJournalRequest.js'

const DEFAULT_API = 'http://127.0.0.1:3001/api/studio/fiscal-journal-post'

/**
 * Real bank commit via Stage3W fiscal journal (LAB only).
 * Does not call Manuale createPrimaNotaCompleta.
 */
export async function commitBankReconciliationFiscalLab({
  payload = {},
  context = {},
  accessToken,
  apiUrl = DEFAULT_API,
  fetchImpl = globalThis.fetch,
  env = process.env,
} = {}) {
  if (!isBankFiscalCommitLabEnabled(env)) {
    return {
      status: 'blocked',
      mode: 'dry_run',
      committed: false,
      blockers: ['bank_lab_commit_disabled'],
      noDbWriteInDryRun: true,
    }
  }
  if (!accessToken) {
    return {
      status: 'blocked',
      mode: 'commit',
      committed: false,
      blockers: ['bank_lab_token_missing'],
    }
  }

  const mapped = mapBankPayloadToFiscalJournalRequest({ payload, context })
  if (!mapped.ok) {
    return {
      status: 'blocked',
      mode: 'commit',
      committed: false,
      blockers: [mapped.reason, ...(mapped.blockers || [])],
    }
  }

  const res = await fetchImpl(apiUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mapped.request),
  })
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    /* keep */
  }

  if (res.status !== 201 || !json?.ok || !json?.id) {
    return {
      status: 'failed',
      mode: 'commit',
      committed: false,
      blockers: ['bank_lab_fiscal_post_failed'],
      httpStatus: res.status,
      errorBody: String(text || '').slice(0, 400),
      requestId: mapped.request.request_id,
    }
  }

  return {
    status: 'committed',
    mode: 'commit',
    committed: true,
    createdIds: {
      primaNotaId: json.id,
      primaNotaRigheIds: [],
      registriIvaIds: [],
      partitarioMovementIds: [],
      bankMovementActionId: payload.movementId || context.movementId || null,
      sourceDocumentId: mapped.request.request_id,
    },
    audit: {
      idempotencyKey: mapped.request.request_id,
      sourceModule: 'riconciliazione_bancaria',
      mode: 'commit',
      status: 'committed',
      auditPersisted: true,
      requestId: mapped.request.request_id,
      contractKind: 'pagamento',
    },
    requestId: mapped.request.request_id,
    primaNotaId: json.id,
    fiscalRequest: mapped.request,
  }
}
