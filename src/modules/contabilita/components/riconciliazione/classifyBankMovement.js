import { normalizeMockText } from './riconciliazioneMockSelectors.js'

function hasText(value, patterns = []) {
  const text = normalizeMockText(value)
  return patterns.some((pattern) => text.includes(pattern))
}

export function classifyBankMovement(movement = {}) {
  const direction = movement.direction === 'in' || movement.direction === 'out' ? movement.direction : ''
  const text = normalizeMockText([
    movement.descriptionRaw,
    movement.descriptionNormalized,
    movement.counterpartyName,
    movement.bankCausal,
    movement.sourceMeta?.rawText,
  ].filter(Boolean).join(' '))

  if (!text || hasText(text, ['saldo iniziale', 'saldo finale', 'informativa', 'storno tecnico', 'movimento tecnico'])) {
    return {
      movementType: 'movimento_da_classificare',
      decisionType: 'ignora_movimento',
      reasons: ['testo_tecnico_o_non_movimento'],
      warnings: [],
      blockers: [],
      readiness: 'ignored',
    }
  }

  if (hasText(text, ['duplicato', 'già riconciliato', 'gia riconciliato', 'già presente', 'gia presente', 'duplicate'])) {
    return {
      movementType: direction === 'in' ? 'incasso_cliente' : direction === 'out' ? 'pagamento_fornitore' : 'movimento_da_classificare',
      decisionType: 'blocked',
      reasons: ['duplicato_potenziale'],
      warnings: ['potenziale_duplicato', 'movimento_gia_riconciliato_o_presente'],
      blockers: ['duplicato_potenziale'],
      readiness: 'blocked',
    }
  }

  if (hasText(text, ['f24', 'agenzia entrate', 'delega', 'fiscale'])) {
    return {
      movementType: 'f24',
      decisionType: 'f24',
      reasons: ['f24_rilevato'],
      warnings: ['richiedere_dettaglio_tributi'],
      blockers: ['tributi_mancanti'],
      readiness: 'blocked',
    }
  }

  if (hasText(text, ['giroconto', 'riallineamento liquidita', 'trasferimento tra conti', 'tra conti banca', 'tra conti cassa'])) {
    return {
      movementType: 'giroconto',
      decisionType: 'giroconto',
      reasons: ['giroconto_rilevato'],
      warnings: [],
      blockers: [],
      readiness: 'needs_operator_choice',
    }
  }

  if (direction === 'out' && hasText(text, ['cumulativo', 'partite', 'bonifico cumulativo'])) {
    return {
      movementType: 'pagamento_fornitore',
      decisionType: 'match_parziale',
      reasons: ['pagamento_cumulativo_fornitore_rilevato'],
      warnings: ['candidato_cumulativo'],
      blockers: [],
      readiness: 'ready_to_review',
    }
  }

  if (hasText(text, ['spese bancarie', 'commissioni', 'commissione', 'bollo', 'addebito spese'])) {
    return {
      movementType: 'spesa_bancaria',
      decisionType: 'classificazione_diretta',
      reasons: ['spesa_bancaria_rilevata'],
      warnings: [],
      blockers: [],
      readiness: 'ready_without_partita',
    }
  }

  if (hasText(text, ['parcella', 'professionista', 'percipiente', 'ritenuta'])) {
    return {
      movementType: 'pagamento_parcella',
      decisionType: 'match_partita',
      reasons: ['parcella_o_ritenuta_rilevata'],
      warnings: [],
      blockers: [],
      readiness: 'ready_to_review',
    }
  }

  if (direction === 'in' && hasText(text, ['incasso', 'cliente', 'bonifico da', 'accredito'])) {
    return {
      movementType: 'incasso_cliente',
      decisionType: 'match_partita',
      reasons: ['incasso_cliente_rilevato'],
      warnings: [],
      blockers: [],
      readiness: 'ready_to_review',
    }
  }

  if (direction === 'out' && hasText(text, ['fornitore', 'bonifico a', 'saldo fattura', 'acconto fornitore', 'pagamento fornitore'])) {
    return {
      movementType: 'pagamento_fornitore',
      decisionType: 'match_partita',
      reasons: ['pagamento_fornitore_rilevato'],
      warnings: [],
      blockers: [],
      readiness: 'ready_to_review',
    }
  }

  return {
    movementType: 'movimento_da_classificare',
    decisionType: 'nessun_match',
    reasons: ['classificazione_residua'],
    warnings: [],
    blockers: [],
    readiness: 'needs_operator_choice',
  }
}