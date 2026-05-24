import { buildCanonicalPayloadHash } from './canonicalPayloadHash.js'

const ALLOWED_SOURCE_MODULES = new Set([
  'import_contabilita',
  'registrazione_manual',
  'riconciliazione_bancaria',
])

const LEGACY_REFERENCE_MARKERS = [
  'accounting_entries',
  'documenti_import',
  'import_fatture',
  'import_nuovo',
  'import_unificato',
  'createScritturaContabile',
]

const SUPPORTED_COMPLEX_CASE_MARKERS = [
  'f24',
  'iva per cassa',
  'iva_per_cassa',
  'ritenuta_incompleta',
  'reverse_charge_complex',
  'cumulativo',
  'giroconto_complex',
  'synthetic_reference_unresolved',
]

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function normalizeText(value) {
  return String(value ?? '').trim()
}

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function createEmptyTableRecords() {
  return {
    primaNota: [],
    primaNotaRighe: [],
    registriIva: [],
    partitario: [],
    movimentiBancari: [],
    documentiContabilita: [],
  }
}

export function createEmptyMockCanonicalCommitStore() {
  return {
    auditRecords: [],
    createdRecords: createEmptyTableRecords(),
    idempotencyIndex: new Map(),
    counters: {
      audit: 0,
      primaNota: 0,
      primaNotaRighe: 0,
      registriIva: 0,
      partitario: 0,
      movimentiBancari: 0,
      documentiContabilita: 0,
    },
  }
}

function ensureMockStore(mockStore = null) {
  const store = mockStore || createEmptyMockCanonicalCommitStore()
  if (!isPlainObject(store.createdRecords)) store.createdRecords = createEmptyTableRecords()
  for (const key of Object.keys(store.createdRecords)) {
    if (!Array.isArray(store.createdRecords[key])) store.createdRecords[key] = []
  }
  if (!Array.isArray(store.auditRecords)) store.auditRecords = []
  if (!(store.idempotencyIndex instanceof Map)) store.idempotencyIndex = new Map()
  if (!isPlainObject(store.counters)) {
    store.counters = {
      audit: 0,
      primaNota: 0,
      primaNotaRighe: 0,
      registriIva: 0,
      partitario: 0,
      movimentiBancari: 0,
      documentiContabilita: 0,
    }
  }
  return store
}

function nextId(store, prefix) {
  store.counters[prefix] = Number(store.counters[prefix] || 0) + 1
  return `${prefix}-${store.counters[prefix]}`
}

function collectPayloadText(canonicalPayload) {
  try {
    return JSON.stringify(canonicalPayload ?? {})
  } catch {
    return String(canonicalPayload ?? '')
  }
}

function extractCandidateSocietaIds(inputSocietaId, canonicalPayload) {
  const values = [
    inputSocietaId,
    canonicalPayload?.societaId,
    canonicalPayload?.company?.societaId,
    canonicalPayload?.document?.societaId,
    canonicalPayload?.header?.societaId,
    canonicalPayload?.source?.societaId,
    canonicalPayload?.audit?.societaId,
  ]
  return values.map((value) => normalizeText(value)).filter(Boolean)
}

function detectLegacyReference(canonicalPayload) {
  const text = collectPayloadText(canonicalPayload).toLowerCase()
  return LEGACY_REFERENCE_MARKERS.some((marker) => text.includes(marker.toLowerCase()))
}

function detectTenantScopeMismatch(inputSocietaId, canonicalPayload) {
  const ids = extractCandidateSocietaIds(inputSocietaId, canonicalPayload)
  if (!ids.length) return false
  const expected = ids[0]
  return ids.some((id) => id !== expected)
}

function detectUnsupportedCase(canonicalPayload) {
  const text = collectPayloadText(canonicalPayload).toLowerCase()
  if (SUPPORTED_COMPLEX_CASE_MARKERS.some((marker) => text.includes(marker.toLowerCase()))) return true

  const vat = isPlainObject(canonicalPayload?.vat) ? canonicalPayload.vat : {}
  const withholding = isPlainObject(canonicalPayload?.withholding) ? canonicalPayload.withholding : {}
  const ledger = isPlainObject(canonicalPayload?.ledger) ? canonicalPayload.ledger : {}

  if (canonicalPayload?.mockCase && SUPPORTED_COMPLEX_CASE_MARKERS.includes(normalizeText(canonicalPayload.mockCase))) return true
  if (vat.ivaPerCassa && !(Array.isArray(vat.rows) && vat.rows.length > 0 && normalizeText(vat.registerType))) return true
  if (vat.reverseCharge && !normalizeText(vat.reverseChargeMode) && !Array.isArray(vat.rows)) return true
  if (withholding.enabled && (!isPlainObject(withholding.recipient) || !Array.isArray(withholding.rows) || withholding.rows.length === 0)) return true
  if (ledger.mode === 'mixed') return true
  if (canonicalPayload?.flags?.cumulativo || canonicalPayload?.flags?.girocontoComplex) return true
  if (Array.isArray(canonicalPayload?.syntheticReferences) && canonicalPayload.syntheticReferences.some((item) => /unresolved|synthetic/i.test(normalizeText(item)))) return true
  return false
}

function hasValidationBlockers(canonicalPayload) {
  const direct = toArray(canonicalPayload?.blockers)
  const nested = toArray(canonicalPayload?.validation?.blockers)
  const validationBlocking = toArray(canonicalPayload?.validation?.blocking)
  const validationErrors = toArray(canonicalPayload?.validation?.errors)
  return [...direct, ...nested, ...validationBlocking, ...validationErrors].filter(Boolean)
}

function detectSourceModuleMismatch(inputSourceModule, canonicalPayload) {
  const payloadSourceModule = normalizeText(canonicalPayload?.sourceModule || canonicalPayload?.source?.module)
  if (!payloadSourceModule) return false
  return payloadSourceModule !== normalizeText(inputSourceModule)
}

function buildAuditRecord(store, input, options, { status, payloadHash, payloadId, createdIds, resultSnapshot, warnings, blockers, errorMessage = '', errorCode = '' }) {
  const auditId = nextId(store, 'audit')
  return {
    id: auditId,
    status,
    mode: options?.dryRun ? 'dry_run' : 'commit',
    success: ['dry_run', 'committed_mock', 'replayed'].includes(status),
    societaId: input.societaId,
    esercizioId: input.esercizioId,
    utenteId: input.utenteId,
    sourceModule: input.sourceModule,
    sourceDocumentId: input.sourceDocumentId,
    idempotencyKey: input.idempotencyKey,
    payloadId,
    payloadVersion: normalizeText(options?.expectedPayloadVersion || input.canonicalPayload?.schemaVersion || input.canonicalPayload?.payloadVersion || ''),
    payloadHash,
    requestId: normalizeText(options?.requestId || ''),
    createdIds: clone(createdIds),
    payloadSnapshot: clone(input.canonicalPayload),
    resultSnapshot: clone(resultSnapshot),
    warnings: [...new Set(toArray(warnings))],
    blockers: [...new Set(toArray(blockers))],
    errorMessage: normalizeText(errorMessage),
    errorCode: normalizeText(errorCode),
    tenantScopeSnapshot: {
      inputSocietaId: input.societaId,
      payloadSocietaIds: extractCandidateSocietaIds(input.societaId, input.canonicalPayload),
    },
    commitVersion: 'mock-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function buildEmptyCreatedIds() {
  return {
    primaNotaId: null,
    primaNotaRigheIds: [],
    registriIvaIds: [],
    partitarioIds: [],
    movimentiBancariId: null,
    documentiContabilitaId: null,
  }
}

function createRecord(store, tableName, payload) {
  const record = {
    id: nextId(store, tableName),
    ...clone(payload),
    createdAt: new Date().toISOString(),
  }
  store.createdRecords[tableName].push(record)
  return record
}

function removeRecordById(store, tableName, id) {
  if (!id) return
  const rows = store.createdRecords[tableName]
  const index = rows.findIndex((item) => item.id === id)
  if (index >= 0) rows.splice(index, 1)
}

function rollbackAttempt(store, createdIds) {
  for (const id of toArray(createdIds.primaNotaRigheIds).slice().reverse()) removeRecordById(store, 'primaNotaRighe', id)
  for (const id of toArray(createdIds.registriIvaIds).slice().reverse()) removeRecordById(store, 'registriIva', id)
  for (const id of toArray(createdIds.partitarioIds).slice().reverse()) removeRecordById(store, 'partitario', id)
  if (createdIds.movimentiBancariId) removeRecordById(store, 'movimentiBancari', createdIds.movimentiBancariId)
  if (createdIds.documentiContabilitaId) removeRecordById(store, 'documentiContabilita', createdIds.documentiContabilitaId)
  if (createdIds.primaNotaId) removeRecordById(store, 'primaNota', createdIds.primaNotaId)
}

function getSupportedPlan(canonicalPayload, sourceModule) {
  const sourceDecisionStatus = normalizeText(canonicalPayload?.sourceDecisionStatus || canonicalPayload?.decisionStatus || '').toLowerCase()
  const isIgnoredReconciliation = sourceModule === 'riconciliazione_bancaria' && sourceDecisionStatus === 'ignored'
  const primaNotaRows = toArray(canonicalPayload?.primaNotaRighe)
  const accountingRows = toArray(canonicalPayload?.accounting?.rows)
  const registriIvaRows = toArray(canonicalPayload?.vat?.rows)
  const partitarioRows = toArray(canonicalPayload?.partitarioMovements)
  const hasDocumentUpdate = sourceModule === 'import_contabilita'
  const hasMovementUpdate = sourceModule === 'riconciliazione_bancaria'
  const hasLedger = sourceModule === 'registrazione_manual' || sourceModule === 'riconciliazione_bancaria' || partitarioRows.length > 0 || canonicalPayload?.ledger?.enabled
  const hasWithholding = Boolean(canonicalPayload?.withholding?.enabled && toArray(canonicalPayload?.withholding?.rows).length)

  return {
    isIgnoredReconciliation,
    createPrimaNota: !isIgnoredReconciliation && (sourceModule !== 'import_contabilita' || accountingRows.length > 0 || primaNotaRows.length > 0 || canonicalPayload?.postCommitTargets?.shouldCreatePrimaNota),
    createPrimaNotaRighe: !isIgnoredReconciliation && (primaNotaRows.length > 0 || accountingRows.length > 0),
    createRegistriIva: !isIgnoredReconciliation && (registriIvaRows.length > 0 || canonicalPayload?.postCommitTargets?.shouldCreateIva),
    createPartitario: !isIgnoredReconciliation && (partitarioRows.length > 0 || hasLedger),
    createWithholding: !isIgnoredReconciliation && hasWithholding,
    updateSourceStatus: hasDocumentUpdate || hasMovementUpdate,
    sourceStatusTarget: hasDocumentUpdate ? 'documentiContabilita' : hasMovementUpdate ? 'movimentiBancari' : null,
  }
}

function buildRecordPayloads(input, plan, payloadHash) {
  const canonicalPayload = input.canonicalPayload
  const now = new Date().toISOString()
  const documentNumber = normalizeText(canonicalPayload?.document?.numeroDocumento || canonicalPayload?.document?.number || canonicalPayload?.header?.numeroRegistrazione || input.sourceDocumentId)
  const primaNotaRows = toArray(canonicalPayload?.primaNotaRighe)
  const accountingRows = toArray(canonicalPayload?.accounting?.rows)
  const registriIvaRows = toArray(canonicalPayload?.vat?.rows)
  const partitarioRows = toArray(canonicalPayload?.partitarioMovements)

  const primaNotaPayload = {
    societaId: input.societaId,
    esercizioId: input.esercizioId,
    sourceDocumentId: input.sourceDocumentId,
    idempotencyKey: input.idempotencyKey,
    payloadHash,
    documentNumber,
    sourceModule: input.sourceModule,
  }

  const documentiContabilitaPayload = {
    societaId: input.societaId,
    esercizioId: input.esercizioId,
    sourceDocumentId: input.sourceDocumentId,
    status: plan.isIgnoredReconciliation ? 'ignored' : 'registered',
    sourceModule: input.sourceModule,
    updatedAt: now,
  }

  const movimentiBancariPayload = {
    societaId: input.societaId,
    esercizioId: input.esercizioId,
    sourceDocumentId: input.sourceDocumentId,
    status: plan.isIgnoredReconciliation ? 'ignored' : 'reconciled',
    sourceModule: input.sourceModule,
    updatedAt: now,
  }

  const primaNotaRighePayloads = primaNotaRows.length > 0 ? primaNotaRows : accountingRows
  const registriIvaPayloads = registriIvaRows
  const partitarioPayloads = partitarioRows.length > 0 ? partitarioRows : (canonicalPayload?.ledger?.rows || [])

  return {
    primaNotaPayload,
    documentiContabilitaPayload,
    movimentiBancariPayload,
    primaNotaRighePayloads,
    registriIvaPayloads,
    partitarioPayloads,
  }
}

function makeSuccessSnapshot({ status, mode, payloadHash, createdIds, sourceModule, sourceDocumentId, noDbWriteInDryRun, reusedExistingCommit, auditId, warnings = [], blockers = [], resultDetails = {} }) {
  return {
    success: true,
    mode,
    status,
    noDbWriteInDryRun: Boolean(noDbWriteInDryRun),
    idempotencyKey: resultDetails.idempotencyKey || null,
    payloadId: resultDetails.payloadId || null,
    payloadHash,
    sourceModule,
    sourceDocumentId,
    createdIds: clone(createdIds),
    reusedExistingCommit: Boolean(reusedExistingCommit),
    warnings: [...new Set(toArray(warnings))],
    blockers: [...new Set(toArray(blockers))],
    auditId,
    resultSnapshot: clone({
      status,
      mode,
      payloadHash,
      createdIds,
      sourceModule,
      sourceDocumentId,
      noDbWriteInDryRun: Boolean(noDbWriteInDryRun),
      reusedExistingCommit: Boolean(reusedExistingCommit),
      ...resultDetails,
    }),
  }
}

function makeFailureSnapshot({ status, mode, payloadHash, sourceModule, sourceDocumentId, idempotencyKey, payloadId, createdIds, warnings = [], blockers = [], auditId = null, errorMessage = '', errorCode = '', resultDetails = {} }) {
  return {
    success: false,
    mode,
    status,
    idempotencyKey,
    payloadId,
    payloadHash,
    sourceModule,
    sourceDocumentId,
    createdIds: clone(createdIds),
    reusedExistingCommit: false,
    warnings: [...new Set(toArray(warnings))],
    blockers: [...new Set(toArray(blockers))],
    auditId,
    resultSnapshot: clone({
      status,
      mode,
      payloadHash,
      createdIds,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      errorMessage,
      errorCode,
      ...resultDetails,
    }),
  }
}

export function commitCanonicalAccountingPayloadMock(input = {}, mockStore = null) {
  const store = ensureMockStore(mockStore)
  const canonicalPayload = input?.canonicalPayload
  const options = isPlainObject(input?.options) ? input.options : {}
  const sourceModule = normalizeText(input?.sourceModule)
  const sourceDocumentId = normalizeText(input?.sourceDocumentId)
  const idempotencyKey = normalizeText(input?.idempotencyKey)
  const allowedDryRun = options.dryRun === true || options.allowRealCommit !== true
  const payloadId = normalizeText(canonicalPayload?.payloadId || canonicalPayload?.id || idempotencyKey || sourceDocumentId)

  const baseValidationBlockers = []
  if (!normalizeText(input?.societaId)) baseValidationBlockers.push('societaId_missing')
  if (!normalizeText(input?.esercizioId)) baseValidationBlockers.push('esercizioId_missing')
  if (!normalizeText(input?.utenteId)) baseValidationBlockers.push('utenteId_missing')
  if (!sourceModule) baseValidationBlockers.push('sourceModule_missing')
  if (!sourceDocumentId) baseValidationBlockers.push('sourceDocumentId_missing')
  if (!idempotencyKey) baseValidationBlockers.push('idempotencyKey_missing')
  if (!isPlainObject(canonicalPayload)) baseValidationBlockers.push('canonicalPayload_missing')

  const payloadHash = isPlainObject(canonicalPayload) ? buildCanonicalPayloadHash(canonicalPayload) : ''

  if (baseValidationBlockers.length > 0) {
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'missing_required_input' },
      warnings: [],
      blockers: baseValidationBlockers,
      errorCode: 'missing_required_input',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers: baseValidationBlockers,
      auditId: auditRecord.id,
      errorCode: 'missing_required_input',
      errorMessage: 'missing_required_input',
      resultDetails: { noDbWriteInDryRun: true },
    })
  }

  if (!ALLOWED_SOURCE_MODULES.has(sourceModule)) {
    const blockers = ['source_module_not_allowed']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'source_module_not_allowed' },
      warnings: [],
      blockers,
      errorCode: 'source_module_not_allowed',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'source_module_not_allowed',
      errorMessage: 'source_module_not_allowed',
    })
  }

  if (isPlainObject(canonicalPayload?.source) && normalizeText(canonicalPayload.source.module) && normalizeText(canonicalPayload.source.module) !== sourceModule) {
    const blockers = ['source_module_mismatch']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'source_module_mismatch' },
      warnings: [],
      blockers,
      errorCode: 'source_module_mismatch',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'source_module_mismatch',
      errorMessage: 'source_module_mismatch',
    })
  }

  const expectedPayloadVersion = normalizeText(options.expectedPayloadVersion)
  const payloadVersion = normalizeText(canonicalPayload.schemaVersion || canonicalPayload.payloadVersion)
  if (expectedPayloadVersion && payloadVersion && payloadVersion !== expectedPayloadVersion) {
    const blockers = ['payload_version_incompatible']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'payload_version_incompatible' },
      warnings: [],
      blockers,
      errorCode: 'payload_version_incompatible',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'payload_version_incompatible',
      errorMessage: 'payload_version_incompatible',
    })
  }

  const validationBlockers = hasValidationBlockers(canonicalPayload)
  if (validationBlockers.length > 0) {
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'payload_blockers_present' },
      warnings: [],
      blockers: validationBlockers,
      errorCode: 'payload_blockers_present',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers: validationBlockers,
      auditId: auditRecord.id,
      errorCode: 'payload_blockers_present',
      errorMessage: 'payload_blockers_present',
    })
  }

  if (detectSourceModuleMismatch(sourceModule, canonicalPayload)) {
    const blockers = ['source_module_payload_mismatch']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'source_module_payload_mismatch' },
      warnings: [],
      blockers,
      errorCode: 'source_module_payload_mismatch',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'source_module_payload_mismatch',
      errorMessage: 'source_module_payload_mismatch',
    })
  }

  if (detectLegacyReference(canonicalPayload)) {
    const blockers = ['legacy_reference_detected']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'legacy_reference_detected' },
      warnings: [],
      blockers,
      errorCode: 'legacy_reference_detected',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'legacy_reference_detected',
      errorMessage: 'legacy_reference_detected',
    })
  }

  if (detectTenantScopeMismatch(input.societaId, canonicalPayload)) {
    const blockers = ['tenant_scope_mismatch']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'tenant_scope_mismatch' },
      warnings: [],
      blockers,
      errorCode: 'tenant_scope_mismatch',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'tenant_scope_mismatch',
      errorMessage: 'tenant_scope_mismatch',
    })
  }

  if (detectUnsupportedCase(canonicalPayload)) {
    const blockers = ['unsupported_case_for_atomic_commit']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'unsupported_case_for_atomic_commit' },
      warnings: [],
      blockers,
      errorCode: 'unsupported_case_for_atomic_commit',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'unsupported_case_for_atomic_commit',
      errorMessage: 'unsupported_case_for_atomic_commit',
    })
  }

  const existingEntry = store.idempotencyIndex.get(idempotencyKey)
  if (existingEntry) {
    if (existingEntry.payloadHash === payloadHash) {
      const auditRecord = buildAuditRecord(store, input, options, {
        status: 'replayed',
        payloadHash,
        payloadId,
        createdIds: existingEntry.createdIds,
        resultSnapshot: existingEntry.resultSnapshot,
        warnings: existingEntry.resultSnapshot?.warnings || [],
        blockers: existingEntry.resultSnapshot?.blockers || [],
      })
      store.auditRecords.push(auditRecord)
      return makeSuccessSnapshot({
        status: 'replayed',
        mode: existingEntry.mode,
        payloadHash,
        createdIds: existingEntry.createdIds,
        sourceModule,
        sourceDocumentId,
        reusedExistingCommit: true,
        auditId: auditRecord.id,
        warnings: existingEntry.resultSnapshot?.warnings || [],
        blockers: existingEntry.resultSnapshot?.blockers || [],
        resultDetails: {
          idempotencyKey,
          payloadId,
          ...existingEntry.resultSnapshot,
        },
      })
    }

    const blockers = ['idempotency_conflict']
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'blocked',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: { blocked: true, reason: 'idempotency_conflict' },
      warnings: [],
      blockers,
      errorCode: 'idempotency_conflict',
    })
    store.auditRecords.push(auditRecord)
    return makeFailureSnapshot({
      status: 'blocked',
      mode: options.dryRun ? 'dry_run' : 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers,
      auditId: auditRecord.id,
      errorCode: 'idempotency_conflict',
      errorMessage: 'idempotency_conflict',
    })
  }

  if (allowedDryRun) {
    const plan = getSupportedPlan(canonicalPayload, sourceModule)
    const resultSnapshot = {
      status: 'dry_run',
      mode: 'dry_run',
      payloadHash,
      createdIds: buildEmptyCreatedIds(),
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      noDbWriteInDryRun: true,
      planned: plan,
    }
    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'dry_run',
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot,
      warnings: ['dry_run_only'],
      blockers: [],
    })
    store.auditRecords.push(auditRecord)
    return makeSuccessSnapshot({
      status: 'dry_run',
      mode: 'dry_run',
      payloadHash,
      createdIds: buildEmptyCreatedIds(),
      sourceModule,
      sourceDocumentId,
      noDbWriteInDryRun: true,
      auditId: auditRecord.id,
      warnings: ['dry_run_only'],
      blockers: [],
      resultDetails: {
        idempotencyKey,
        payloadId,
        noDbWriteInDryRun: true,
        planned: plan,
      },
    })
  }

  const plan = getSupportedPlan(canonicalPayload, sourceModule)
  const createdIds = buildEmptyCreatedIds()
  const createdStepLog = []
  let failedAt = ''
  let rollbackReason = ''
  const payloads = buildRecordPayloads(input, plan, payloadHash)

  const shouldFailAt = normalizeText(options.simulateFailureAt)

  function maybeFail(stepName) {
    if (shouldFailAt && shouldFailAt === stepName) {
      const error = new Error(`simulateFailureAt:${stepName}`)
      error.code = 'simulateFailureAt'
      throw error
    }
  }

  try {
    if (plan.createPrimaNota) {
      const primaNota = createRecord(store, 'primaNota', payloads.primaNotaPayload)
      createdIds.primaNotaId = primaNota.id
      createdStepLog.push({ table: 'primaNota', id: primaNota.id })
      maybeFail('primaNota')
    }

    if (plan.createPrimaNotaRighe) {
      for (let index = 0; index < payloads.primaNotaRighePayloads.length; index += 1) {
        const rowPayload = payloads.primaNotaRighePayloads[index]
        const rowRecord = createRecord(store, 'primaNotaRighe', {
          ...clone(rowPayload),
          primaNotaId: createdIds.primaNotaId,
          sourceDocumentId,
          sourceModule,
          payloadHash,
          rowIndex: index + 1,
        })
        createdIds.primaNotaRigheIds.push(rowRecord.id)
        createdStepLog.push({ table: 'primaNotaRighe', id: rowRecord.id })
      }
      maybeFail('primaNotaRighe')
    }

    if (plan.createRegistriIva) {
      for (let index = 0; index < payloads.registriIvaPayloads.length; index += 1) {
        const ivaRecord = createRecord(store, 'registriIva', {
          ...clone(payloads.registriIvaPayloads[index]),
          sourceDocumentId,
          sourceModule,
          payloadHash,
          primaNotaId: createdIds.primaNotaId,
          rowIndex: index + 1,
        })
        createdIds.registriIvaIds.push(ivaRecord.id)
        createdStepLog.push({ table: 'registriIva', id: ivaRecord.id })
      }
      maybeFail('registriIva')
    }

    if (plan.createPartitario) {
      for (let index = 0; index < payloads.partitarioPayloads.length; index += 1) {
        const partRecord = createRecord(store, 'partitario', {
          ...clone(payloads.partitarioPayloads[index]),
          sourceDocumentId,
          sourceModule,
          payloadHash,
          primaNotaId: createdIds.primaNotaId,
          rowIndex: index + 1,
        })
        createdIds.partitarioIds.push(partRecord.id)
        createdStepLog.push({ table: 'partitario', id: partRecord.id })
      }
      maybeFail('partitario')
    }

    if (plan.createWithholding) {
      const withholdingRows = toArray(canonicalPayload?.withholding?.rows)
      if (withholdingRows.length > 0) {
        const withholdingRecord = createRecord(store, 'primaNota', {
          type: 'withholding',
          sourceDocumentId,
          sourceModule,
          payloadHash,
          rows: clone(withholdingRows),
        })
        createdStepLog.push({ table: 'primaNota', id: withholdingRecord.id, kind: 'withholding' })
      }
      maybeFail('withholding')
    }

    if (plan.updateSourceStatus) {
      if (plan.sourceStatusTarget === 'documentiContabilita') {
        const docRecord = createRecord(store, 'documentiContabilita', payloads.documentiContabilitaPayload)
        createdIds.documentiContabilitaId = docRecord.id
        createdStepLog.push({ table: 'documentiContabilita', id: docRecord.id })
      } else if (plan.sourceStatusTarget === 'movimentiBancari') {
        const movRecord = createRecord(store, 'movimentiBancari', payloads.movimentiBancariPayload)
        createdIds.movimentiBancariId = movRecord.id
        createdStepLog.push({ table: 'movimentiBancari', id: movRecord.id })
      }
      maybeFail('sourceStatusUpdate')
    }

    maybeFail('auditCommit')

    const resultSnapshot = {
      status: 'committed_mock',
      mode: 'commit',
      payloadHash,
      createdIds: clone(createdIds),
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      noDbWriteInDryRun: false,
      reusedExistingCommit: false,
      committedAt: new Date().toISOString(),
      createdStepLog: clone(createdStepLog),
      sourceDecisionStatus: normalizeText(canonicalPayload?.sourceDecisionStatus || canonicalPayload?.decisionType || ''),
    }

    const auditRecord = buildAuditRecord(store, input, options, {
      status: 'committed_mock',
      payloadHash,
      payloadId,
      createdIds,
      resultSnapshot,
      warnings: toArray(canonicalPayload?.warnings),
      blockers: [],
    })
    store.auditRecords.push(auditRecord)
    store.idempotencyIndex.set(idempotencyKey, {
      payloadHash,
      createdIds: clone(createdIds),
      resultSnapshot: clone(resultSnapshot),
      auditId: auditRecord.id,
      mode: 'commit',
    })

    return makeSuccessSnapshot({
      status: 'committed_mock',
      mode: 'commit',
      payloadHash,
      createdIds,
      sourceModule,
      sourceDocumentId,
      auditId: auditRecord.id,
      warnings: toArray(canonicalPayload?.warnings),
      blockers: [],
      resultDetails: resultSnapshot,
    })
  } catch (error) {
    failedAt = normalizeText(shouldFailAt || error?.code || error?.message || 'commit')
    rollbackReason = `simulateFailureAt:${failedAt}`
    const hadCreatedRecords = Boolean(createdIds.primaNotaId || createdIds.primaNotaRigheIds.length || createdIds.registriIvaIds.length || createdIds.partitarioIds.length || createdIds.movimentiBancariId || createdIds.documentiContabilitaId)

    rollbackAttempt(store, createdIds)

    const status = hadCreatedRecords ? 'failed_rollback' : 'failed'
    const auditRecord = buildAuditRecord(store, input, options, {
      status,
      payloadHash,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      resultSnapshot: {
        status,
        mode: 'commit',
        payloadHash,
        createdIds: buildEmptyCreatedIds(),
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        payloadId,
        errorMessage: error?.message || String(error),
        failedAt,
        rollbackReason,
        rollbackApplied: true,
        createdStepLog: clone(createdStepLog),
      },
      warnings: [],
      blockers: [status],
      errorMessage: error?.message || String(error),
      errorCode: error?.code || status,
    })
    store.auditRecords.push(auditRecord)

    return makeFailureSnapshot({
      status,
      mode: 'commit',
      payloadHash,
      sourceModule,
      sourceDocumentId,
      idempotencyKey,
      payloadId,
      createdIds: buildEmptyCreatedIds(),
      blockers: [status],
      auditId: auditRecord.id,
      errorCode: error?.code || status,
      errorMessage: error?.message || String(error),
      resultDetails: {
        failedAt,
        rollbackReason,
        rollbackApplied: true,
        noDbWriteInDryRun: false,
      },
    })
  }
}
