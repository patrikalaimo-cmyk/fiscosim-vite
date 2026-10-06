import { createPrimaNota } from '../../../../services/primaNotaService.js'
import * as contabilitaRepo from '../data/contabilitaRepo.js'

// LEGACY/DEPRECATED: do not use for new accounting writes. Manual registrations must pass through the guided canonical flow.
export async function createScritturaContabile(payload) {
  const pnPayload = payload && typeof payload === 'object' ? { ...payload } : null
  if (!pnPayload) return { data: null, error: new Error('Payload scrittura mancante') }
  // `causale_iva_codice` is not a canonical column on `prima_nota`.
  delete pnPayload.causale_iva_codice
  return createPrimaNota({ pnPayload, headerSelect: '*' })
}

export async function updateScritturaContabile(primaNotaId, updates = {}) {
  return contabilitaRepo.updateScritturaHeaderById(primaNotaId, updates)
}

export async function getScritturaOperationContext(primaNotaId, societaId = '') {
  return contabilitaRepo.getScritturaOperationContext(primaNotaId, societaId)
}

export async function deleteScritturaIsolata(primaNotaId, societaId = '') {
  const opCtxRes = await getScritturaOperationContext(primaNotaId, societaId)
  if (opCtxRes?.error) return { data: null, error: opCtxRes.error }
  const opCtx = opCtxRes?.data || null
  if (!opCtx?.actionModel?.canDeleteIsolated) {
    const err = new Error('Delete isolata non consentita dal contesto operativo')
    err.code = 'DELETE_ISOLATA_BLOCKED'
    err.details = {
      nextAction: opCtx?.actionModel?.requiresAnnullaRegistrazione ? 'annulla_registrazione_collegata' : null,
      reasons: Array.isArray(opCtx?.reasons) ? opCtx.reasons : [],
      operationContext: opCtx,
    }
    return { data: null, error: err }
  }
  return contabilitaRepo.deleteScritturaControllata(primaNotaId, societaId)
}

export async function prepareAnnullaRegistrazione(primaNotaId, societaId = '') {
  return contabilitaRepo.prepareAnnullaRegistrazione(primaNotaId, societaId)
}

export async function annullaRegistrazioneCollegata(primaNotaId, societaId = '') {
  return contabilitaRepo.annullaRegistrazioneCollegata(primaNotaId, societaId)
}
