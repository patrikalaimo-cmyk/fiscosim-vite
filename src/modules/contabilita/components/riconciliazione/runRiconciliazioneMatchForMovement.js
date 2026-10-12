import { classifyBankMovement } from './classifyBankMovement.js'
import { buildRiconciliazioneMatchCandidates } from './buildRiconciliazioneMatchCandidates.js'
import { buildRiconciliazioneDecisionProposal } from './buildRiconciliazioneDecisionProposal.js'
import {
  applyBankMatchMemoryBoost,
  lookupBankMatchMemory,
} from '../../application/learning/lookupBankMatchMemory.js'

export function runRiconciliazioneMatchForMovement({ movement = {}, partiteAperte = [], options = {} } = {}) {
  const classification = options.classification || classifyBankMovement(movement)
  let candidates = buildRiconciliazioneMatchCandidates(movement, partiteAperte, { classification, ...options })
  let matchMemory = null
  if (options.societaId && options.applyMatchMemory !== false) {
    matchMemory = lookupBankMatchMemory({
      societaId: options.societaId,
      movement,
      storage: options.storage,
    })
    candidates = applyBankMatchMemoryBoost(candidates, matchMemory)
  }
  const proposal = buildRiconciliazioneDecisionProposal({ movement, candidates, classification })
  if (matchMemory?.hits?.length) {
    return {
      ...proposal,
      matchMemoryHits: matchMemory.hits.length,
      matchMemoryPartitaIds: Array.from(matchMemory.partitaIds),
    }
  }
  return proposal
}