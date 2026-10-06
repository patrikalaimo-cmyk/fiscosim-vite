import { normalizeMockText } from './riconciliazioneMockSelectors.js'
import { classifyBankMovement } from './classifyBankMovement.js'
import { scoreRiconciliazioneMatch } from './scoreRiconciliazioneMatch.js'

function sum(values = []) {
  return Math.round(values.reduce((acc, value) => acc + Math.abs(Number(value || 0)), 0) * 100) / 100
}

function hasSameCounterparty(movement, partita) {
  const movementText = normalizeMockText([movement.descriptionRaw, movement.descriptionNormalized, movement.counterpartyName].filter(Boolean).join(' '))
  const subjectName = normalizeMockText(partita.soggettoNome || '')
  const documentNumber = normalizeMockText(partita.numeroDocumento || '')
  return Boolean(subjectName && movementText.includes(subjectName)) || Boolean(documentNumber && movementText.includes(documentNumber))
}

export function buildRiconciliazioneMatchCandidates(movement = {}, partite = [], options = {}) {
  const classification = options.classification || classifyBankMovement(movement)
  const amount = Math.abs(Number(movement.amount || 0))
  const rows = Array.isArray(partite) ? partite : []
  const normalizedMovementText = normalizeMockText([movement.descriptionRaw, movement.descriptionNormalized, movement.counterpartyName, movement.bankCausal].filter(Boolean).join(' '))

  if (classification.decisionType === 'ignora_movimento' || classification.movementType === 'spesa_bancaria' || classification.movementType === 'f24' || classification.movementType === 'giroconto') {
    return []
  }

  const candidates = rows
    .map((partita) => {
      const openAmount = Math.abs(Number(partita.importoAperto ?? partita.importoOriginario ?? 0))
      const sameCounterparty = hasSameCounterparty(movement, partita)
      const exactAmount = Math.abs(amount - openAmount) <= 0.01
      const partialAmount = amount > 0 && openAmount > 0 && amount < openAmount && sameCounterparty
      const amountMatched = exactAmount ? amount : partialAmount ? amount : 0
      const residualAfterMatch = Math.max(0, Math.round((openAmount - amountMatched) * 100) / 100)
      const amountDelta = Math.round((amount - openAmount) * 100) / 100
      const score = scoreRiconciliazioneMatch(movement, partita, classification)
      const reasons = [...score.reasons]
      const warnings = []
      const blockers = []
      let matchType = 'no_match'

      if (classification.movementType === 'pagamento_parcella' && sameCounterparty && amount > 0 && openAmount >= amount) {
        matchType = 'exact_amount'
        reasons.push('parcella_netta_coerente')
      } else if (exactAmount && sameCounterparty) {
        matchType = 'exact_amount'
        reasons.push('importo_esatto_e_soggetto_coerente')
      } else if (partialAmount) {
        matchType = 'partial_amount'
        warnings.push('residuo_partita_da_mantenere')
        reasons.push('importo_parziale_e_soggetto_coerente')
      } else if (sameCounterparty && amount > 0 && openAmount > 0 && amount !== openAmount) {
        matchType = 'counterparty_only'
        warnings.push('soggetto_coerente_importo_diverso')
      }

      if (partita.statoPartita === 'contestata') {
        blockers.push('partita_contestata')
      }
      if (partita.ivaPerCassa) {
        warnings.push('iva_per_cassa_presente')
        reasons.push('iva_per_cassa')
      }
      if (partita.ritenuta) {
        warnings.push('ritenuta_presente')
        reasons.push('ritenuta_presente')
        if (classification.movementType === 'pagamento_parcella' && sameCounterparty && amount > 0 && amount <= openAmount) {
          warnings.push('ritenuta_collegata_da_verificare')
        }
      }

      return {
        candidateId: `${movement.movementId || 'movement'}::${partita.partitaId}`,
        movementId: movement.movementId,
        partitaId: partita.partitaId,
        soggettoId: partita.soggettoId,
        soggettoNome: partita.soggettoNome,
        soggettoTipo: partita.soggettoTipo,
        matchType,
        amountDelta,
        amountMatched,
        residualAfterMatch,
        confidence: score.confidence,
        reasons,
        warnings,
        blockers,
        ivaPerCassa: Boolean(partita.ivaPerCassa),
        ritenuta: Boolean(partita.ritenuta),
        importoOriginario: partita.importoOriginario ?? openAmount,
        exactAmount,
        sameCounterparty,
      }
    })
    .filter((candidate) => candidate.matchType !== 'no_match')

  const exactCandidates = candidates.filter((candidate) => candidate.matchType === 'exact_amount')
  if (exactCandidates.length > 1) {
    return candidates.map((candidate) => ({
      ...candidate,
      matchType: 'ambiguous',
      warnings: Array.from(new Set([...candidate.warnings, 'piu_candidati_stesso_importo'])),
    }))
  }

  if (classification.movementType === 'pagamento_fornitore' && normalizedMovementText.includes('cumulativo')) {
    const eligible = rows.filter((partita) => hasSameCounterparty(movement, partita))
    const cumulativeMatches = []

    const search = (startIndex, selected) => {
      const total = sum(selected.map((partita) => partita.importoAperto ?? partita.importoOriginario ?? 0))
      if (selected.length >= 2 && Math.abs(total - amount) <= 0.01) {
        cumulativeMatches.push(selected.slice())
        return
      }
      if (selected.length >= 4 || total > amount + 0.01) return
      for (let index = startIndex; index < eligible.length; index += 1) {
        selected.push(eligible[index])
        search(index + 1, selected)
        selected.pop()
      }
    }

    search(0, [])

    if (cumulativeMatches.length > 0) {
      const subset = cumulativeMatches[0]
      return [{
        candidateId: `${movement.movementId || 'movement'}::cumulative`,
        movementId: movement.movementId,
        partitaId: null,
        soggettoId: subset[0].soggettoId,
        soggettoNome: subset[0].soggettoNome,
        soggettoTipo: subset[0].soggettoTipo,
        matchType: 'cumulative_candidate',
        amountDelta: 0,
        amountMatched: amount,
        residualAfterMatch: 0,
        confidence: 0.79,
        reasons: ['somma_partite_coerente'],
        warnings: ['candidato_cumulativo', 'richiesta_conferma_operatore'],
        blockers: [],
        subsetPartitaIds: subset.map((partita) => partita.partitaId),
        subsetNumeroDocumenti: subset.map((partita) => partita.numeroDocumento).filter(Boolean),
      }]
    }
  }

  if (candidates.length === 0) {
    if (classification.movementType === 'pagamento_fornitore' && normalizedMovementText.includes('iva per cassa')) {
      return [{
        candidateId: `${movement.movementId || 'movement'}::iva_per_cassa`,
        movementId: movement.movementId,
        partitaId: null,
        soggettoId: null,
        soggettoNome: movement.counterpartyName || null,
        soggettoTipo: 'fornitore',
        matchType: 'exact_amount',
        amountDelta: 0,
        amountMatched: amount,
        residualAfterMatch: 0,
        confidence: 0.92,
        reasons: ['iva_per_cassa_virtuale'],
        warnings: ['iva_per_cassa_presente'],
        blockers: [],
        ivaPerCassa: true,
        ritenuta: false,
        importoOriginario: amount,
        exactAmount: true,
        sameCounterparty: true,
      }]
    }

    const eligible = rows.filter((partita) => hasSameCounterparty(movement, partita))
    const cumulativeMatches = []

    const search = (startIndex, selected) => {
      const total = sum(selected.map((partita) => partita.importoAperto ?? partita.importoOriginario ?? 0))
      if (selected.length >= 2 && Math.abs(total - amount) <= 0.01) {
        cumulativeMatches.push(selected.slice())
        return
      }
      if (selected.length >= 4 || total > amount + 0.01) return
      for (let index = startIndex; index < eligible.length; index += 1) {
        selected.push(eligible[index])
        search(index + 1, selected)
        selected.pop()
      }
    }

    search(0, [])

    if (cumulativeMatches.length > 0) {
      const subset = cumulativeMatches[0]
      return [{
        candidateId: `${movement.movementId || 'movement'}::cumulative`,
        movementId: movement.movementId,
        partitaId: null,
        soggettoId: subset[0].soggettoId,
        soggettoNome: subset[0].soggettoNome,
        soggettoTipo: subset[0].soggettoTipo,
        matchType: 'cumulative_candidate',
        amountDelta: 0,
        amountMatched: amount,
        residualAfterMatch: 0,
        confidence: 0.79,
        reasons: ['somma_partite_coerente'],
        warnings: ['candidato_cumulativo', 'richiesta_conferma_operatore'],
        blockers: [],
        subsetPartitaIds: subset.map((partita) => partita.partitaId),
        subsetNumeroDocumenti: subset.map((partita) => partita.numeroDocumento).filter(Boolean),
      }]
    }
  }

  return candidates.sort((a, b) => b.confidence - a.confidence)
}