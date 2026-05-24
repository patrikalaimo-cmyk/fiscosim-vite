import { classifyBankMovement } from './classifyBankMovement.js'
import { buildRiconciliazioneMatchCandidates } from './buildRiconciliazioneMatchCandidates.js'
import { buildRiconciliazioneDecisionProposal } from './buildRiconciliazioneDecisionProposal.js'

export function runRiconciliazioneMatchForMovement({ movement = {}, partiteAperte = [], options = {} } = {}) {
  const classification = options.classification || classifyBankMovement(movement)
  const candidates = buildRiconciliazioneMatchCandidates(movement, partiteAperte, { classification, ...options })
  return buildRiconciliazioneDecisionProposal({ movement, candidates, classification })
}