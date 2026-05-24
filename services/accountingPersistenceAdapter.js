import { buildAccountingRollbackPlan } from '../domain/accountingRollbackPolicy.js'
import { buildDocumentClaimPlan } from '../domain/documentClaimPolicy.js'
import { buildDocumentDedupeRequest } from '../domain/documentDedupePolicy.js'
import { buildRegistrationNumberRequest } from '../domain/registrationNumberPolicy.js'
import { runAccountingWritePreflight } from './accountingPreflightService.js'

const BLOCKER_CODES = {
  PLAN_MISSING: 'P7_PLAN_MISSING',
  DOCUMENT_MISSING: 'P7_DOCUMENTI_CONTABILITA_MISSING',
  PRIMA_NOTA_MISSING: 'P7_PRIMA_NOTA_MISSING',
  RIGHE_MISSING: 'P7_PRIMA_NOTA_RIGHE_MISSING',
  LEGACY_FIELD: 'P7_FORBIDDEN_LEGACY_REFERENCE',
  MISSING_FILENAME: 'P7_MISSING_FILENAME',
  MISSING_ESERCIZIO: 'P7_MISSING_ESERCIZIO',
  MISSING_REGISTRATION_NUMBER: 'P7_MISSING_REGISTRATION_NUMBER',
  MISSING_COUNTERPARTY_ACCOUNT: 'P7_MISSING_COUNTERPARTY_ACCOUNT',
  MISSING_TIPO_REGISTRAZIONE: 'P7_MISSING_TIPO_REGISTRAZIONE',
  FORBIDDEN_RIGHE_FIELD: 'P7_FORBIDDEN_PRIMA_NOTA_RIGHE_FIELD',
  DB_CLIENT_REQUIRED: 'P7_DB_CLIENT_REQUIRED',
  DOCUMENT_INSERT_FAILED: 'P7_DOCUMENTI_CONTABILITA_INSERT_FAILED',
  WRITE_NOT_IMPLEMENTED_AFTER_PREFLIGHT: 'P7_WRITE_NOT_IMPLEMENTED_AFTER_PREFLIGHT',
  WRITE_NOT_IMPLEMENTED: 'P7_WRITE_NOT_IMPLEMENTED',
}

const ALLOWED_PRIMA_NOTA_RIGHE_FIELDS = new Set([
  'riga_numero',
  'conto_id',
  'conto_codice',
  'conto_descrizione',
  'descrizione_riga',
  'importo_dare',
  'importo_avere',
])

function buildBlocked(code, message) {
  return {
    status: 'blocked',
    executed: false,
    operations: [],
    blockers: [{ code, message }],
  }
}

function buildBlockedFromList(blockers) {
  return {
    status: 'blocked',
    executed: false,
    operations: [],
    blockers: Array.isArray(blockers) ? blockers : [],
  }
}

function buildDocumentInsertPayload(plan, options = {}) {
  // Alcune colonne generate dal mapper non sono presenti nello schema Supabase live (schema cache error).
  // Strip difensivo: note_operatore, validated_by, validated_at.
  const {
    note_operatore: _n,
    validated_by: _vb,
    validated_at: _va,
    ...docBase
  } = plan.documentiContabilita || {}
  return {
    ...docBase,
    workflow_status: 'registering',
    validation_status: 'validated',
    locked_by: options.operatorId || null,
    locked_at: options.now || null,
  }
}

function includesForbiddenLegacyReference(plan) {
  const serialized = JSON.stringify(plan)
  return serialized.includes('"documenti_import"')
    || serialized.includes('"accounting_entries"')
    || serialized.includes('"partitari"')
}

function buildOperations(plan) {
  return [
    {
      step: 'create_documenti_contabilita',
      table: 'documenti_contabilita',
      payload: plan.documentiContabilita,
    },
    {
      step: 'create_prima_nota',
      table: 'prima_nota',
      payload: plan.primaNota,
    },
    {
      step: 'create_prima_nota_righe',
      table: 'prima_nota_righe',
      payload: plan.primaNotaRighe,
    },
  ]
}

function buildPrimaNotaRigheIds(plan) {
  return plan.primaNotaRighe.map((_, index) => `__PRIMA_NOTA_RIGA_${index + 1}_ID__`)
}

function buildSimulatedResult(plan) {
  const documentiContabilitaId = '__DOCUMENTI_CONTABILITA_ID__'
  const primaNotaId = '__PRIMA_NOTA_ID__'
  const primaNotaRigheIds = buildPrimaNotaRigheIds(plan)

  return {
    documentiContabilitaId,
    primaNotaId,
    primaNotaRigheIds,
    finalization: {
      targetTable: 'documenti_contabilita',
      targetId: documentiContabilitaId,
      primaNotaId,
      targetStatus: 'registered',
    },
  }
}

function buildRollbackRefs(simulatedResult) {
  return {
    documentiContabilitaId: simulatedResult.documentiContabilitaId,
    primaNotaId: simulatedResult.primaNotaId,
    primaNotaRigheIds: simulatedResult.primaNotaRigheIds,
  }
}

function buildDedupeCheck() {
  return {
    required: true,
    strategy: 'documenti_contabilita_functional_key',
    fields: [
      'societa_id',
      'numero_documento',
      'data_documento',
      'soggetto_piva_or_cf_or_denominazione',
      'totale',
    ],
    status: 'not_executed',
  }
}

function buildClaimContract() {
  return {
    targetTable: 'documenti_contabilita',
    inFlightStatus: 'registering',
    successStatus: 'registered',
    failureFallbackStatus: 'confirmed',
    status: 'not_executed',
  }
}

function getReadinessBlockers(plan) {
  const blockers = []

  if (!plan?.documentiContabilita?.filename) {
    blockers.push({
      code: BLOCKER_CODES.MISSING_FILENAME,
      message: 'documentiContabilita.filename mancante per WRITE1.',
    })
  }

  if (!plan?.primaNota?.esercizio) {
    blockers.push({
      code: BLOCKER_CODES.MISSING_ESERCIZIO,
      message: 'primaNota.esercizio mancante per WRITE1.',
    })
  }

  if (!plan?.primaNota?.numero_registrazione) {
    blockers.push({
      code: BLOCKER_CODES.MISSING_REGISTRATION_NUMBER,
      message: 'primaNota.numero_registrazione mancante per WRITE1.',
    })
  }

  if (!plan?.primaNota?.conto_cliente_fornitore_id) {
    blockers.push({
      code: BLOCKER_CODES.MISSING_COUNTERPARTY_ACCOUNT,
      message: 'primaNota.conto_cliente_fornitore_id mancante per WRITE1.',
    })
  }

  if (!plan?.primaNota?.tipo_registrazione) {
    blockers.push({
      code: BLOCKER_CODES.MISSING_TIPO_REGISTRAZIONE,
      message: 'primaNota.tipo_registrazione mancante per WRITE1.',
    })
  }

  for (const row of plan?.primaNotaRighe || []) {
    for (const key of Object.keys(row || {})) {
      if (!ALLOWED_PRIMA_NOTA_RIGHE_FIELDS.has(key)) {
        blockers.push({
          code: BLOCKER_CODES.FORBIDDEN_RIGHE_FIELD,
          message: `primaNotaRighe contiene campo non ammesso in WRITE1: ${key}.`,
        })
        return blockers
      }
    }
  }

  return blockers
}

function validatePlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return buildBlocked(BLOCKER_CODES.PLAN_MISSING, 'Plan mancante o non valido.')
  }

  if (!plan.documentiContabilita || typeof plan.documentiContabilita !== 'object') {
    return buildBlocked(BLOCKER_CODES.DOCUMENT_MISSING, 'Plan.documentiContabilita mancante.')
  }

  if (!plan.primaNota || typeof plan.primaNota !== 'object') {
    return buildBlocked(BLOCKER_CODES.PRIMA_NOTA_MISSING, 'Plan.primaNota mancante.')
  }

  if (!Array.isArray(plan.primaNotaRighe) || plan.primaNotaRighe.length === 0) {
    return buildBlocked(BLOCKER_CODES.RIGHE_MISSING, 'Plan.primaNotaRighe assente o vuoto.')
  }

  if (includesForbiddenLegacyReference(plan)) {
    return buildBlocked(BLOCKER_CODES.LEGACY_FIELD, 'Plan contiene riferimenti legacy vietati.')
  }

  return null
}

export async function persistAccountingPlan(plan, options = {}) {
  const blocked = validatePlan(plan)
  if (blocked) {
    return blocked
  }

  const registrationNumberRequest = buildRegistrationNumberRequest(plan, options)
  const dedupeCheck = buildDocumentDedupeRequest(plan, options)
  const claimContract = buildDocumentClaimPlan(plan, options)
  const rollbackPlan = buildAccountingRollbackPlan(plan, options)

  const readinessBlockers = [
    ...getReadinessBlockers(plan),
    ...(registrationNumberRequest.blockers || []),
    ...(dedupeCheck.blockers || []),
  ]

  if (options.execute === true) {
    if (!options.db) {
      return buildBlocked(BLOCKER_CODES.DB_CLIENT_REQUIRED, 'DB client is required when execute=true.')
    }

    if (readinessBlockers.length > 0) {
      return buildBlockedFromList(readinessBlockers)
    }

    const preflight = await runAccountingWritePreflight(options.db, plan, options)
    if (preflight.status === 'blocked') {
      return {
        ...buildBlockedFromList(preflight.blockers || []),
        preflight,
      }
    }

    if (options.writeScope === 'document_only') {
      const insertPayload = buildDocumentInsertPayload(plan, options)
      const insertResult = await options.db
        .from('documenti_contabilita')
        .insert([insertPayload])
        .select('id')
        .single()

      if (insertResult?.error || !insertResult?.data?.id) {
        return {
          ...buildBlocked(BLOCKER_CODES.DOCUMENT_INSERT_FAILED, insertResult?.error?.message || 'Insert documenti_contabilita failed.'),
          preflight,
        }
      }

      return {
        status: 'partial_written',
        executed: true,
        writeScope: 'document_only',
        documentiContabilitaId: insertResult.data.id,
        nextAction: 'create_prima_nota',
        warnings: [
          'Only documenti_contabilita was written. Prima nota not created yet.',
        ],
        preflight,
      }
    }

    return {
      status: 'blocked',
      executed: false,
      operations: [],
      blockers: [{
        code: BLOCKER_CODES.WRITE_NOT_IMPLEMENTED_AFTER_PREFLIGHT,
        message: 'Preflight passed, real write not implemented yet.',
      }],
      preflight,
      executionContext: {
        registrationNumber: preflight.registrationNumber?.nextNumber ?? null,
        dedupe: preflight.dedupe || null,
      },
    }
  }

  const simulatedResult = buildSimulatedResult(plan)

  return {
    status: 'dry_run',
    executed: false,
    operations: buildOperations(plan),
    simulatedResult,
    rollbackRefs: buildRollbackRefs(simulatedResult),
    registrationNumberRequest,
    dedupeCheck: dedupeCheck.required ? dedupeCheck : buildDedupeCheck(),
    claimContract: claimContract.targetTable ? claimContract : buildClaimContract(),
    rollbackPlan,
    readyForWrite: readinessBlockers.length === 0,
    blockers: readinessBlockers,
    warnings: [],
  }
}