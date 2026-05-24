import { round2 } from '../../application/canonical_mapper/utils.js'

export function resolveRegistrazioneRowState(row = {}) {
  const dare = round2(row?.dare ?? row?.importo_dare ?? 0)
  const avere = round2(row?.avere ?? row?.importo_avere ?? 0)
  const contoId = String(row?.conto_id || '').trim()

  const hasDare = dare > 0
  const hasAvere = avere > 0
  const hasConto = Boolean(contoId)
  const isIncomplete = !hasConto || (!hasDare && !hasAvere) || (hasDare && hasAvere)

  return {
    contoId,
    dare,
    avere,
    hasConto,
    hasDare,
    hasAvere,
    hasMovement: hasDare || hasAvere,
    isIncomplete,
    side: hasDare && !hasAvere ? 'dare' : hasAvere && !hasDare ? 'avere' : null,
  }
}
