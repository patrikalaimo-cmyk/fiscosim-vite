import { validateCommitInput } from '../domain/accountingValidation.js'
import {
  mapCommitPayloadToDocumentoContabilita,
  mapCommitPayloadToFinalization,
  mapCommitPayloadToPrimaNota,
  mapCommitPayloadToPrimaNotaRighe,
} from '../domain/accountingCommitPayload.js'
import { mapCommitPayloadToRegistriIva } from '../domain/vatRegisterMapper.js'
import { mapCommitPayloadToPartitario } from '../domain/ledgerMapper.js'

function buildPlannedCalls() {
  return [
    'create documenti_contabilita',
    'createPrimaNotaCompleta',
    'insert registri_iva direct',
    'insert partitario direct',
    'finalize documenti_contabilita',
  ]
}

function buildRollbackOrder() {
  return [
    'partitario',
    'registri_iva',
    'prima_nota_righe',
    'prima_nota',
    'documenti_contabilita',
  ]
}

export async function planSingleInvoiceCommitFromImport(payload, ctx = {}) {
  const validation = validateCommitInput(payload, ctx)
  if (!validation.ok) {
    return {
      status: 'blocked',
      blockers: validation.blockers,
      warnings: validation.warnings,
      plan: null,
      plannedCalls: [],
      rollbackOrder: [],
    }
  }

  const normalized = validation.normalized
  const documentiContabilita = mapCommitPayloadToDocumentoContabilita(normalized, ctx)
  const primaNota = mapCommitPayloadToPrimaNota(normalized, ctx)
  const primaNotaRighe = mapCommitPayloadToPrimaNotaRighe(normalized, ctx)
  const registriIva = mapCommitPayloadToRegistriIva(normalized, ctx)
  const partitario = mapCommitPayloadToPartitario(normalized, ctx)
  const finalization = mapCommitPayloadToFinalization(normalized, ctx)

  return {
    status: 'ready',
    blockers: [],
    warnings: validation.warnings,
    plan: {
      documentiContabilita,
      primaNota,
      primaNotaRighe,
      registriIva,
      partitario,
      finalization,
    },
    plannedCalls: buildPlannedCalls(),
    rollbackOrder: buildRollbackOrder(),
  }
}
