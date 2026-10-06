import { normalizeRegistrazioneAmountInput } from './normalizeRegistrazioneAmountInput.js'

export function normalizeRegistrazioneRowPatch(patch = {}, options = {}) {
  const nextPatch = { ...patch }
  const source = String(options.source || 'manual')
  const amountSide = options.amountSide === 'dare' || options.amountSide === 'avere' ? options.amountSide : null
  const hasDarePatch = Object.prototype.hasOwnProperty.call(nextPatch, 'dare')
  const hasAverePatch = Object.prototype.hasOwnProperty.call(nextPatch, 'avere')
  const inferredAmountSide = amountSide || (hasDarePatch && !hasAverePatch ? 'dare' : null) || (hasAverePatch && !hasDarePatch ? 'avere' : null)

  if (inferredAmountSide) {
    const oppositeSide = inferredAmountSide === 'dare' ? 'avere' : 'dare'
    const currentValue = nextPatch[inferredAmountSide]
    nextPatch[inferredAmountSide] = source === 'manual' ? String(currentValue ?? '') : normalizeRegistrazioneAmountInput(currentValue)
    nextPatch[oppositeSide] = ''
    nextPatch.lastAmountSide = inferredAmountSide
    if (source === 'manual') {
      nextPatch.manualAmountOverride = true
      nextPatch.autoResidualApplied = false
      nextPatch.manualEdited = true
    }
    return nextPatch
  }

  if (hasDarePatch) {
    nextPatch.dare = source === 'manual' ? String(nextPatch.dare ?? '') : normalizeRegistrazioneAmountInput(nextPatch.dare)
    nextPatch.avere = ''
    nextPatch.lastAmountSide = 'dare'
    if (source === 'manual') {
      nextPatch.manualAmountOverride = true
      nextPatch.autoResidualApplied = false
      nextPatch.manualEdited = true
    }
  }

  if (hasAverePatch) {
    nextPatch.avere = source === 'manual' ? String(nextPatch.avere ?? '') : normalizeRegistrazioneAmountInput(nextPatch.avere)
    nextPatch.dare = ''
    nextPatch.lastAmountSide = 'avere'
    if (source === 'manual') {
      nextPatch.manualAmountOverride = true
      nextPatch.autoResidualApplied = false
      nextPatch.manualEdited = true
    }
  }

  return nextPatch
}
