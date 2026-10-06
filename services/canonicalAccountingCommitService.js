import { buildCanonicalPayloadHash } from '../src/modules/contabilita/canonical/canonicalPayloadHash.js'
import { createCanonicalAccountingCommitRepository } from './canonicalAccountingCommitRepository.js'

const ALLOWED_SOURCE_MODULES = new Set([
  'import_contabilita',
  'registrazione_manual',
  'riconciliazione_bancaria',
])

const DEV_LOCAL_DIRECT_SOURCE_MODULE = 'registrazione_manual'

const ACCOUNTING_ENTRIES_MARKER = ['accounting', 'entries'].join('_')
const IMPORT_FATTURE_MARKER = ['import', 'fatture'].join('_')
const IMPORT_NUOVO_MARKER = ['import', 'nuovo'].join('_')
const IMPORT_UNIFICATO_MARKER = ['import', 'unificato'].join('_')
const CREATE_SCRITTURA_CONTABILE_MARKER = ['createScrittura', 'Contabile'].join('')

const LEGACY_REFERENCE_MARKERS = [
  ACCOUNTING_ENTRIES_MARKER,
  IMPORT_FATTURE_MARKER,
  IMPORT_NUOVO_MARKER,
  IMPORT_UNIFICATO_MARKER,
  CREATE_SCRITTURA_CONTABILE_MARKER,
]

function normalizeText(value) {
  return String(value ?? '').trim()
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function isLocalSupabaseUrl(value) {
  const text = normalizeText(value).toLowerCase()
  return Boolean(text) && (/127\.0\.0\.1/.test(text) || /localhost/.test(text))
}

function isLocalDevRuntime(options = {}) {
  return [
    options.supabaseUrl,
    options.localSupabaseUrl,
    process.env.SUPABASE_URL,
    process.env.VITE_SUPABASE_URL,
  ].some((value) => isLocalSupabaseUrl(value))
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function uniqueValues(values) {
  return [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]
}

function collectPayloadText(payload) {
  try {
    return JSON.stringify(payload ?? {})
  } catch {
    return String(payload ?? '')
  }
}

function extractTenantCandidates(inputSocietaId, canonicalPayload) {
  return uniqueValues([
    inputSocietaId,
    canonicalPayload?.societaId,
    canonicalPayload?.company?.societaId,
    canonicalPayload?.document?.societaId,
    canonicalPayload?.header?.societaId,
    canonicalPayload?.source?.societaId,
    canonicalPayload?.audit?.societaId,
  ])
}

function detectLegacyReference(canonicalPayload) {
  const text = collectPayloadText(canonicalPayload).toLowerCase()
  return LEGACY_REFERENCE_MARKERS.some((marker) => text.includes(marker.toLowerCase()))
}

function detectTenantScopeMismatch(inputSocietaId, canonicalPayload) {
  const ids = extractTenantCandidates(inputSocietaId, canonicalPayload)
  if (ids.length === 0) return false
  const expected = ids[0]
  return ids.some((id) => id !== expected)
}

function detectSourceModuleMismatch(inputSourceModule, canonicalPayload) {
  const payloadSourceModule = normalizeText(canonicalPayload?.sourceModule || canonicalPayload?.source?.module)
  if (!payloadSourceModule) return false
  return payloadSourceModule !== normalizeText(inputSourceModule)
}

function hasValidationBlockers(canonicalPayload) {
  return uniqueValues([
    ...toArray(canonicalPayload?.blockers),
    ...toArray(canonicalPayload?.validation?.blockers),
    ...toArray(canonicalPayload?.validation?.blocking),
    ...toArray(canonicalPayload?.validation?.errors),
  ])
}

function buildEmptyCreatedIds() {
  return {
    primaNotaId: null,
    primaNotaRigheIds: [],
    registriIvaIds: [],
    partitarioIds: [],
    sourceDocumentId: null,
    bankMovementId: null,
  }
}

function buildCommitPlan(canonicalPayload, sourceModule) {
  const primaNota = canonicalPayload?.primaNota || canonicalPayload?.header || null
  const primaNotaRighe = toArray(canonicalPayload?.primaNotaRighe)
  const registriIva = toArray(canonicalPayload?.registriIva || canonicalPayload?.vat?.rows)
  const partitario = toArray(canonicalPayload?.partitarioMovements || canonicalPayload?.ledger?.rows)
  const sourceDocumentId = normalizeText(canonicalPayload?.sourceDocumentId || canonicalPayload?.source?.sourceDocumentId || canonicalPayload?.document?.sourceDocumentId)

  return {
    sourceModule,
    sourceDocumentId,
    primaNota,
    primaNotaRighe,
    registriIva,
    partitario,
    updateSourceDocument: sourceModule === 'import_contabilita' && Boolean(sourceDocumentId),
    updateBankMovement: sourceModule === 'riconciliazione_bancaria' && Boolean(sourceDocumentId),
  }
}

function buildAuditPreview({
  status,
  mode,
  payloadHash,
  sourceModule,
  sourceDocumentId,
  idempotencyKey,
  createdIds,
  warnings = [],
  blockers = [],
  auditId = null,
  auditPersisted = false,
  noDbWriteInDryRun = false,
  reusedExistingCommit = false,
  resultDetails = {},
}) {
  const resultSnapshot = {
    status,
    mode,
    payloadHash,
    sourceModule,
    sourceDocumentId,
    idempotencyKey,
    createdIds: clone(createdIds),
    warnings: uniqueValues(warnings),
    blockers: uniqueValues(blockers),
    auditId,
    auditPersisted,
    noDbWriteInDryRun,
    reusedExistingCommit,
    ...clone(resultDetails),
  }

  return {
    success: status === 'dry_run' || status === 'replayed' || status === 'committed',
    mode,
    status,
    idempotencyKey,
    payloadHash,
    sourceModule,
    sourceDocumentId,
    createdIds: clone(createdIds),
    reusedExistingCommit,
    warnings: uniqueValues(warnings),
    blockers: uniqueValues(blockers),
    auditId,
    auditPersisted,
    noDbWriteInDryRun,
    auditPreview: {
      idempotencyKey,
      payloadHash,
      sourceModule,
      sourceDocumentId,
      mode,
      status,
      auditPersisted,
      noDbWriteInDryRun,
      createdIds: clone(createdIds),
      warnings: uniqueValues(warnings),
      blockers: uniqueValues(blockers),
    },
    resultSnapshot,
  }
}

function buildIdempotencyLookupMode(dryRun) {
  return dryRun ? 'dry_run' : 'commit'
}

function normalizeRpcResult(result, fallback = {}) {
  if (!result || typeof result !== 'object') {
    return buildBlockedResult({
      payloadHash: fallback.payloadHash || '',
      sourceModule: fallback.sourceModule || '',
      sourceDocumentId: fallback.sourceDocumentId || '',
      idempotencyKey: fallback.idempotencyKey || '',
      blockers: ['rpc_failed'],
      warnings: [],
      errorCode: 'rpc_failed',
      errorMessage: 'rpc_failed',
      mode: fallback.mode || 'commit',
    })
  }

  return buildAuditPreview({
    status: result.status || 'failed',
    mode: result.mode || fallback.mode || 'commit',
    payloadHash: result.payloadHash || fallback.payloadHash || '',
    sourceModule: result.sourceModule || fallback.sourceModule || '',
    sourceDocumentId: result.sourceDocumentId || fallback.sourceDocumentId || '',
    idempotencyKey: result.idempotencyKey || fallback.idempotencyKey || '',
    createdIds: result.createdIds || buildEmptyCreatedIds(),
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    auditId: result.auditId || null,
    auditPersisted: result.auditPersisted === true,
    noDbWriteInDryRun: result.noDbWriteInDryRun === true,
    reusedExistingCommit: result.reusedExistingCommit === true,
    resultDetails: result.resultSnapshot || result,
  })
}

function buildRealCommitRequiresRpcResult(payloadHash, sourceModule, sourceDocumentId, idempotencyKey, mode = 'commit') {
  return buildBlockedResult({
    payloadHash,
    sourceModule,
    sourceDocumentId,
    idempotencyKey,
    blockers: ['real_commit_requires_rpc'],
    warnings: [],
    errorCode: 'real_commit_requires_rpc',
    errorMessage: 'real_commit_requires_rpc',
    mode,
  })
}

function buildDevLocalDirectBlockedResult(payloadHash, sourceModule, sourceDocumentId, idempotencyKey, blockers, errorCode, errorMessage, mode = 'commit') {
  return buildBlockedResult({
    payloadHash,
    sourceModule,
    sourceDocumentId,
    idempotencyKey,
    blockers,
    warnings: [],
    errorCode,
    errorMessage,
    mode,
  })
}

function normalizeDevLocalDirectResult(result, fallback = {}) {
  if (!result || typeof result !== 'object') {
    return buildBlockedResult({
      payloadHash: fallback.payloadHash || '',
      sourceModule: fallback.sourceModule || '',
      sourceDocumentId: fallback.sourceDocumentId || '',
      idempotencyKey: fallback.idempotencyKey || '',
      blockers: ['dev_local_writer_failed'],
      warnings: [],
      errorCode: 'dev_local_writer_failed',
      errorMessage: 'dev_local_writer_failed',
      mode: fallback.mode || 'commit',
    })
  }

  return buildAuditPreview({
    status: result.status || 'committed',
    mode: result.mode || fallback.mode || 'commit',
    payloadHash: result.payloadHash || fallback.payloadHash || '',
    sourceModule: result.sourceModule || fallback.sourceModule || '',
    sourceDocumentId: result.sourceDocumentId || fallback.sourceDocumentId || '',
    idempotencyKey: result.idempotencyKey || fallback.idempotencyKey || '',
    createdIds: result.createdIds || buildEmptyCreatedIds(),
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
    blockers: Array.isArray(result.blockers) ? result.blockers : [],
    auditId: result.auditId || null,
    auditPersisted: result.auditPersisted === true,
    noDbWriteInDryRun: result.noDbWriteInDryRun === true,
    reusedExistingCommit: result.reusedExistingCommit === true,
    resultDetails: result.resultSnapshot || result,
  })
}

async function persistAuditIfAllowed(repo, auditRow, options) {
  if (!options?.auditWriteEnabled || !repo?.canWriteAudit?.() || typeof repo.insertCommitAudit !== 'function') {
    return { data: null, error: null, persisted: false }
  }

  const inserted = await repo.insertCommitAudit(auditRow)
  return {
    ...inserted,
    persisted: !inserted?.error,
  }
}

function buildAuditRow(input, options, payloadHash, payload, resultSnapshot, status) {
  return {
    id: options?.auditId || undefined,
    societa_id: input.societaId,
    esercizio_id: input.esercizioId,
    utente_id: input.utenteId || null,
    source_module: input.sourceModule,
    source_document_id: input.sourceDocumentId,
    idempotency_key: input.idempotencyKey,
    payload_hash: payloadHash,
    mode: buildIdempotencyLookupMode(options?.dryRun === true),
    status,
    payload_snapshot: clone(payload),
    result_snapshot: clone(resultSnapshot),
    created_ids: clone(resultSnapshot?.createdIds || buildEmptyCreatedIds()),
    warnings: uniqueValues(resultSnapshot?.warnings || []),
    blockers: uniqueValues(resultSnapshot?.blockers || []),
    error_code: resultSnapshot?.errorCode || null,
    error_message: resultSnapshot?.errorMessage || null,
    committed_at: resultSnapshot?.committedAt || null,
  }
}

function buildBlockedResult({
  payloadHash,
  sourceModule,
  sourceDocumentId,
  idempotencyKey,
  blockers,
  warnings = [],
  auditId = null,
  auditPersisted = false,
  errorCode = 'blocked',
  errorMessage = 'blocked',
  mode = 'commit',
}) {
  return buildAuditPreview({
    status: 'blocked',
    mode,
    payloadHash,
    sourceModule,
    sourceDocumentId,
    idempotencyKey,
    createdIds: buildEmptyCreatedIds(),
    warnings,
    blockers,
    auditId,
    auditPersisted,
    reusedExistingCommit: false,
    resultDetails: {
      errorCode,
      errorMessage,
    },
  })
}

function buildReplayResult(existing, input, payloadHash) {
  return buildAuditPreview({
    status: 'replayed',
    mode: existing?.mode || 'commit',
    payloadHash,
    sourceModule: input.sourceModule,
    sourceDocumentId: input.sourceDocumentId,
    idempotencyKey: input.idempotencyKey,
    createdIds: clone(existing?.created_ids || existing?.createdIds || buildEmptyCreatedIds()),
    warnings: toArray(existing?.warnings || existing?.result_snapshot?.warnings),
    blockers: toArray(existing?.blockers || existing?.result_snapshot?.blockers),
    auditId: existing?.id || null,
    auditPersisted: true,
    reusedExistingCommit: true,
    resultDetails: {
      existingAuditId: existing?.id || null,
      existingResultSnapshot: clone(existing?.result_snapshot || {}),
    },
  })
}

export async function commitCanonicalAccountingPayload(input = {}, options = {}) {
  const canonicalPayload = isPlainObject(input.canonicalPayload) ? input.canonicalPayload : null
  const repo = options.repo || createCanonicalAccountingCommitRepository({
    db: options.db || null,
    atomicTransaction: options.atomicTransaction || null,
    allowRealWrites: options.allowRealWrites === true,
  })
  const devLocalDirectRequested = options.devLocalDirect === true

  const sourceModule = normalizeText(input.sourceModule)
  const sourceDocumentId = normalizeText(input.sourceDocumentId)
  const idempotencyKey = normalizeText(input.idempotencyKey)
  const payloadHash = canonicalPayload ? buildCanonicalPayloadHash(canonicalPayload) : ''
  const mode = options.dryRun ? 'dry_run' : 'commit'

  const missingBlockers = []
  if (!normalizeText(input.societaId)) missingBlockers.push('societaId_missing')
  if (!normalizeText(input.esercizioId)) missingBlockers.push('esercizioId_missing')
  if (!normalizeText(input.utenteId)) missingBlockers.push('utenteId_missing')
  if (!sourceModule) missingBlockers.push('sourceModule_missing')
  if (!sourceDocumentId) missingBlockers.push('sourceDocumentId_missing')
  if (!idempotencyKey) missingBlockers.push('idempotencyKey_missing')
  if (!canonicalPayload) missingBlockers.push('canonicalPayload_missing')

  if (missingBlockers.length > 0) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: missingBlockers,
      warnings: [],
      errorCode: 'missing_required_input',
      errorMessage: 'missing_required_input',
      mode,
    })
  }

  if (devLocalDirectRequested) {
    if (options.allowRealCommit !== true) {
      return buildBlockedResult({
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        blockers: ['real_commit_disabled'],
        warnings: [],
        errorCode: 'real_commit_disabled',
        errorMessage: 'real_commit_disabled',
        mode,
      })
    }

    if (options.useRpc === true) {
      return buildDevLocalDirectBlockedResult(
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        ['dev_local_direct_conflicts_with_rpc'],
        'dev_local_direct_conflicts_with_rpc',
        'dev_local_direct_conflicts_with_rpc',
        mode,
      )
    }

    if (!isLocalDevRuntime(options)) {
      return buildDevLocalDirectBlockedResult(
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        ['dev_local_runtime_required'],
        'dev_local_runtime_required',
        'dev_local_runtime_required',
        mode,
      )
    }

    if (sourceModule !== DEV_LOCAL_DIRECT_SOURCE_MODULE) {
      return buildDevLocalDirectBlockedResult(
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        ['dev_local_source_module_not_allowed'],
        'dev_local_source_module_not_allowed',
        'dev_local_source_module_not_allowed',
        mode,
      )
    }

    if (typeof options.devLocalDirectWriter !== 'function') {
      return buildDevLocalDirectBlockedResult(
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        ['dev_local_writer_missing'],
        'dev_local_writer_missing',
        'dev_local_writer_missing',
        mode,
      )
    }

    try {
      const commitPlan = buildCommitPlan(canonicalPayload, sourceModule)
      const writerResult = await options.devLocalDirectWriter({
        input: clone(input),
        options: clone(options),
        repo,
        canonicalPayload: clone(canonicalPayload),
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        mode,
        commitPlan,
      })

      return normalizeDevLocalDirectResult(writerResult, {
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        mode,
      })
    } catch (error) {
      return buildDevLocalDirectBlockedResult(
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        ['dev_local_writer_failed'],
        error?.code || 'dev_local_writer_failed',
        error?.message || 'dev_local_writer_failed',
        mode,
      )
    }
  }

  if (options.allowRealCommit === true && options.useRpc !== true && !devLocalDirectRequested) {
    return buildRealCommitRequiresRpcResult(payloadHash, sourceModule, sourceDocumentId, idempotencyKey, mode)
  }

  if (devLocalDirectRequested && options.useRpc === true) {
    return buildDevLocalDirectBlockedResult(
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      ['dev_local_direct_conflicts_with_rpc'],
      'dev_local_direct_conflicts_with_rpc',
      'dev_local_direct_conflicts_with_rpc',
      mode,
    )
  }

  if (options.useRpc === true && options.dryRun !== true && options.allowRealCommit === true) {
    if (typeof repo?.callCommitCanonicalAccountingPayloadRpc !== 'function') {
      return buildBlockedResult({
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        blockers: ['rpc_repository_unavailable'],
        warnings: [],
        errorCode: 'rpc_repository_unavailable',
        errorMessage: 'rpc_repository_unavailable',
        mode,
      })
    }

    try {
      const rpcResult = await repo.callCommitCanonicalAccountingPayloadRpc(input, {
        ...options,
        payloadHash,
        mode,
      })
      return normalizeRpcResult(rpcResult, {
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        mode,
      })
    } catch (error) {
      return buildBlockedResult({
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        blockers: ['rpc_failed'],
        warnings: [],
        errorCode: error?.code || 'rpc_failed',
        errorMessage: error?.message || 'rpc_failed',
        mode,
      })
    }
  }

  if (!ALLOWED_SOURCE_MODULES.has(sourceModule)) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: ['source_module_not_allowed'],
      warnings: [],
      errorCode: 'source_module_not_allowed',
      errorMessage: 'source_module_not_allowed',
      mode,
    })
  }

  if (detectSourceModuleMismatch(sourceModule, canonicalPayload)) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: ['source_module_payload_mismatch'],
      warnings: [],
      errorCode: 'source_module_payload_mismatch',
      errorMessage: 'source_module_payload_mismatch',
      mode,
    })
  }

  if (detectLegacyReference(canonicalPayload)) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: ['legacy_reference_detected'],
      warnings: [],
      errorCode: 'legacy_reference_detected',
      errorMessage: 'legacy_reference_detected',
      mode,
    })
  }

  if (detectTenantScopeMismatch(input.societaId, canonicalPayload)) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: ['tenant_scope_mismatch'],
      warnings: [],
      errorCode: 'tenant_scope_mismatch',
      errorMessage: 'tenant_scope_mismatch',
      mode,
    })
  }

  const validationBlockers = hasValidationBlockers(canonicalPayload)
  if (validationBlockers.length > 0) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: validationBlockers,
      warnings: [],
      errorCode: 'payload_blockers_present',
      errorMessage: 'payload_blockers_present',
      mode,
    })
  }

  const lookupMode = buildIdempotencyLookupMode(options.dryRun === true)
  const existingCommitResult = typeof repo.findCommitByIdempotencyKey === 'function'
    ? await repo.findCommitByIdempotencyKey(idempotencyKey, lookupMode, sourceModule)
    : { data: null, error: null }
  const existingCommit = existingCommitResult?.data || null

  if (existingCommit?.idempotency_key && normalizeText(existingCommit.idempotency_key) === idempotencyKey && normalizeText(existingCommit.mode) === lookupMode) {
    if (normalizeText(existingCommit.payload_hash) === payloadHash) {
      return buildReplayResult(existingCommit, input, payloadHash)
    }

    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: ['idempotency_conflict'],
      warnings: [],
      errorCode: 'idempotency_conflict',
      errorMessage: 'idempotency_conflict',
      mode,
    })
  }

  if (options.dryRun === true) {
    const plan = buildCommitPlan(canonicalPayload, sourceModule)
    const previewSnapshot = {
      status: 'dry_run',
      mode: 'dry_run',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      createdIds: buildEmptyCreatedIds(),
      planned: {
        primaNota: Boolean(plan.primaNota || plan.primaNotaRighe.length > 0),
        registriIva: plan.registriIva.length,
        partitario: plan.partitario.length,
        updateSourceDocument: plan.updateSourceDocument,
        updateBankMovement: plan.updateBankMovement,
      },
      noDbWriteInDryRun: true,
    }
    const auditRow = buildAuditRow(input, { ...options, dryRun: true }, payloadHash, canonicalPayload, previewSnapshot, 'dry_run')
    const auditInsert = await persistAuditIfAllowed(repo, auditRow, options)

    return buildAuditPreview({
      status: 'dry_run',
      mode: 'dry_run',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      createdIds: buildEmptyCreatedIds(),
      warnings: ['dry_run_only'],
      blockers: [],
      auditId: auditInsert?.data?.id || null,
      auditPersisted: Boolean(auditInsert?.data?.id),
      noDbWriteInDryRun: true,
      reusedExistingCommit: false,
      resultDetails: previewSnapshot,
    })
  }

  if (options.allowRealCommit !== true) {
    return buildBlockedResult({
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      blockers: ['real_commit_disabled'],
      warnings: [],
      errorCode: 'real_commit_disabled',
      errorMessage: 'real_commit_disabled',
      mode,
    })
  }

  return buildRealCommitRequiresRpcResult(payloadHash, sourceModule, sourceDocumentId, idempotencyKey, mode)
}
