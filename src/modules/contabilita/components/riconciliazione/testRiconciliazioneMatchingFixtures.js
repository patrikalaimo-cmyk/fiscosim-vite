import { getRiconciliazioneMatchingFixtures } from './riconciliazioneMatchingFixtures.js'
import { runRiconciliazioneMatchForMovement } from './runRiconciliazioneMatchForMovement.js'

export function runRiconciliazioneMatchingFixtureChecks() {
  const fixtures = getRiconciliazioneMatchingFixtures()
  return fixtures.expectedCases.map((testCase) => {
    const movement = fixtures.movements.find((item) => item.movementId === testCase.movementId)
    const result = runRiconciliazioneMatchForMovement({ movement, partiteAperte: fixtures.partiteAperte })
    return {
      caseId: testCase.caseId,
      movementId: testCase.movementId,
      expectedDecisionType: testCase.expectedDecisionType,
      actualDecisionType: result.decisionType,
      expectedMovementType: testCase.expectedMovementType,
      actualMovementType: result.movementType,
      expectedMatchType: testCase.expectedMatchType,
      actualMatchType: result.selectedCandidate?.matchType || 'no_match',
      expectedPartitaId: testCase.expectedPartitaId || null,
      actualPartitaId: result.selectedCandidate?.partitaId || null,
      status: result.decisionType === testCase.expectedDecisionType && result.movementType === testCase.expectedMovementType ? 'PASS' : 'FAIL',
      reason: '',
    }
  })
}