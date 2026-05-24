function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

export function buildRegistrationNumberRequest(plan, ctx = {}) {
  const societaId =
    plan?.primaNota?.societa_id
    || plan?.documentiContabilita?.societa_id
    || ctx?.societaId
    || null
  const esercizio = plan?.primaNota?.esercizio ?? ctx?.esercizio ?? null

  const blockers = []
  if (!hasValue(societaId)) {
    blockers.push({ code: 'P7_MISSING_SOCIETA', message: 'societaId mancante per allocazione numero registrazione.' })
  }
  if (!hasValue(esercizio)) {
    blockers.push({ code: 'P7_MISSING_ESERCIZIO', message: 'esercizio mancante per allocazione numero registrazione.' })
  }

  return {
    required: true,
    scope: {
      societaId,
      esercizio,
    },
    strategy: 'server_side_sequential_allocation',
    uniqueConstraint: ['societa_id', 'esercizio', 'numero_registrazione'],
    status: blockers.length > 0 ? 'blocked' : 'not_executed',
    blockers,
  }
}