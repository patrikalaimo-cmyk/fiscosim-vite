function normalizeText(value) {
  return String(value ?? '').trim()
}

function makeUnavailableResult(operation) {
  const error = new Error(`${operation}_unavailable`)
  error.code = 'canonical_commit_repository_unavailable'
  return { data: null, error, blocked: true, reason: `${operation}_unavailable` }
}

function makeDisabledResult(operation) {
  const error = new Error(`${operation}_disabled`)
  error.code = 'canonical_commit_write_disabled'
  return { data: null, error, blocked: true, reason: `${operation}_disabled` }
}

function createSelectInsertSingle(db, table, payload) {
  return db.from(table).insert([payload]).select('*').single()
}

function createSelectInsertOnConflictSingle(db, table, payload, onConflict) {
  return db.from(table).upsert([payload], { onConflict, ignoreDuplicates: true }).select('*').single()
}

function createSelectUpdateSingle(db, table, payload, id) {
  return db.from(table).update(payload).eq('id', id).select('*').single()
}

function safeRpcError(error, fallback = {}) {
  return {
    name: error?.name || 'SupabaseRpcError',
    message: error?.message || 'rpc_failed',
    code: error?.code || fallback.code || 'rpc_failed',
    details: error?.details || fallback.details || null,
    hint: error?.hint || fallback.hint || null,
  }
}

function normalizeRpcResult(result, fallback = {}) {
  if (!result || typeof result !== 'object') {
    return {
      success: false,
      status: 'failed',
      mode: fallback.mode || 'commit',
      idempotencyKey: fallback.idempotencyKey || '',
      payloadHash: fallback.payloadHash || '',
      sourceModule: fallback.sourceModule || '',
      sourceDocumentId: fallback.sourceDocumentId || '',
      createdIds: {},
      warnings: [],
      blockers: ['rpc_failed'],
      auditId: null,
      resultSnapshot: {},
      errorCode: 'rpc_failed',
      errorMessage: 'rpc_failed',
    }
  }

  return {
    ...result,
    success: result.success === true,
    mode: result.mode || fallback.mode || 'commit',
    status: result.status || 'failed',
    idempotencyKey: result.idempotencyKey || fallback.idempotencyKey || '',
    payloadHash: result.payloadHash || fallback.payloadHash || '',
    sourceModule: result.sourceModule || fallback.sourceModule || '',
    sourceDocumentId: result.sourceDocumentId || fallback.sourceDocumentId || '',
    createdIds: result.createdIds || {},
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    resultSnapshot: result.resultSnapshot || {},
  }
}

async function resolveRpcClient(options = {}, repoDb = null) {
  if (options.supabaseClient && typeof options.supabaseClient.rpc === 'function') {
    return options.supabaseClient
  }

  if (options.db && typeof options.db.rpc === 'function') {
    return options.db
  }

  if (repoDb && typeof repoDb.rpc === 'function') {
    return repoDb
  }

  try {
    const { getSupabaseAdmin } = await import('../lib/db.js')
    const client = await getSupabaseAdmin()
    if (client && typeof client.rpc === 'function') {
      return client
    }
  } catch {
    return null
  }

  return null
}

export function createCanonicalAccountingCommitRepository({
  db = null,
  atomicTransaction = null,
  allowRealWrites = false,
} = {}) {
  const canWriteReal = Boolean(db && allowRealWrites)

  function canWriteAudit() {
    return canWriteReal
  }

  async function findCommitByIdempotencyKey(idempotencyKey, mode = null, sourceModule = null) {
    const key = normalizeText(idempotencyKey)
    if (!key) return { data: null, error: null }
    if (!db) return makeUnavailableResult('find_commit')
    let query = db
      .from('canonical_accounting_commit_audit')
      .select('*')
      .eq('idempotency_key', key)

    if (normalizeText(mode)) {
      query = query.eq('mode', normalizeText(mode))
    }

    if (normalizeText(sourceModule)) {
      query = query.eq('source_module', normalizeText(sourceModule))
    }

    return query.maybeSingle()
  }

  async function insertCommitAudit(auditRow) {
    if (!canWriteReal) return makeDisabledResult('insert_commit_audit')
    return createSelectInsertOnConflictSingle(db, 'canonical_accounting_commit_audit', auditRow, 'source_module,idempotency_key,mode')
  }

  async function updateCommitAudit(id, patch) {
    if (!canWriteReal) return makeDisabledResult('update_commit_audit')
    return createSelectUpdateSingle(db, 'canonical_accounting_commit_audit', patch, id)
  }

  async function callCommitCanonicalAccountingPayloadRpc(input = {}, options = {}) {
    const mode = options.dryRun ? 'dry_run' : 'commit'
    const payloadHash = normalizeText(options.payloadHash || input.payloadHash || '')
    const idempotencyKey = normalizeText(input.idempotencyKey)
    const sourceModule = normalizeText(input.sourceModule)
    const sourceDocumentId = normalizeText(input.sourceDocumentId)

    if (options.useRpc !== true) {
      return {
        success: false,
        mode,
        status: 'blocked',
        idempotencyKey,
        payloadHash,
        sourceModule,
        sourceDocumentId,
        createdIds: {},
        warnings: [],
        blockers: ['rpc_not_enabled'],
        auditId: null,
        resultSnapshot: {},
        errorCode: 'rpc_not_enabled',
        errorMessage: 'rpc_not_enabled',
      }
    }

    const rpcClient = await resolveRpcClient(options, db)
    if (!rpcClient || typeof rpcClient.rpc !== 'function') {
      return {
        success: false,
        mode,
        status: 'blocked',
        idempotencyKey,
        payloadHash,
        sourceModule,
        sourceDocumentId,
        createdIds: {},
        warnings: [],
        blockers: ['rpc_client_unavailable'],
        auditId: null,
        resultSnapshot: {},
        errorCode: 'rpc_client_unavailable',
        errorMessage: 'rpc_client_unavailable',
      }
    }

    try {
      const { data, error } = await rpcClient.rpc('commit_canonical_accounting_payload', {
        p_societa_id: input.societaId || null,
        p_esercizio_id: input.esercizioId || null,
        p_utente_id: input.utenteId || null,
        p_source_module: sourceModule,
        p_source_document_id: sourceDocumentId,
        p_idempotency_key: idempotencyKey,
        p_payload_hash: payloadHash,
        p_canonical_payload: input.canonicalPayload || null,
        p_options: {
          dryRun: options.dryRun === true,
          allowRealCommit: options.allowRealCommit === true,
          expectedPayloadVersion: options.expectedPayloadVersion || '',
          requestId: options.requestId || '',
        },
      })

      if (error) {
        return normalizeRpcResult({
          success: false,
          status: 'failed',
          mode,
          idempotencyKey,
          payloadHash,
          sourceModule,
          sourceDocumentId,
          createdIds: {},
          warnings: [],
          blockers: ['rpc_failed'],
          auditId: null,
          resultSnapshot: {},
          errorCode: error.code || 'rpc_failed',
          errorMessage: error.message || 'rpc_failed',
          error: safeRpcError(error, { code: error.code || 'rpc_failed' }),
        }, { mode, idempotencyKey, payloadHash, sourceModule, sourceDocumentId })
      }

      return normalizeRpcResult(data, {
        mode,
        idempotencyKey,
        payloadHash,
        sourceModule,
        sourceDocumentId,
      })
    } catch (error) {
      return normalizeRpcResult({
        success: false,
        status: 'failed',
        mode,
        idempotencyKey,
        payloadHash,
        sourceModule,
        sourceDocumentId,
        createdIds: {},
        warnings: [],
        blockers: ['rpc_failed'],
        auditId: null,
        resultSnapshot: {},
        errorCode: error?.code || 'rpc_failed',
        errorMessage: error?.message || 'rpc_failed',
        error: safeRpcError(error),
      }, { mode, idempotencyKey, payloadHash, sourceModule, sourceDocumentId })
    }
  }

  return {
    db,
    canWriteAudit,
    findCommitByIdempotencyKey,
    insertCommitAudit,
    updateCommitAudit,
    callCommitCanonicalAccountingPayloadRpc,
  }
}
