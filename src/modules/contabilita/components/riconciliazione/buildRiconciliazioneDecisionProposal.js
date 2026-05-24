import { normalizeMockText } from './riconciliazioneMockSelectors.js'

function pickTopCandidate(candidates = []) {
  const list = Array.isArray(candidates) ? candidates : []
  if (!list.length) return null
  return [...list].sort((a, b) => b.confidence - a.confidence)[0] || null
}

function buildAccountingProposal(movement, classification, selectedCandidate) {
  const amount = Math.abs(Number(movement.amount || 0))
  const movementType = classification.movementType

  if (movementType === 'spesa_bancaria') {
    return {
      causaleBancaria: 'SPESE_BANCARIE',
      descrizione: movement.descriptionRaw || 'Spesa bancaria',
      righe: [
        { sezione: 'Dare', conto: 'Spese bancarie', tipoConto: 'conto_costo', importo: amount },
        { sezione: 'Avere', conto: 'Conto banca', tipoConto: 'conto_banca', importo: amount },
      ],
      partitarioImpact: { action: 'nessuna' },
    }
  }

  if (movementType === 'f24') {
    return null
  }

  if (movementType === 'giroconto') {
    return {
      causaleBancaria: 'GIROCONTO',
      descrizione: movement.descriptionRaw || 'Giroconto',
      righe: [
        { sezione: 'Dare', conto: 'Conto banca destinazione', tipoConto: 'conto_banca', importo: amount },
        { sezione: 'Avere', conto: 'Conto banca origine', tipoConto: 'conto_banca', importo: amount },
      ],
      partitarioImpact: { action: 'nessuna' },
    }
  }

  if (movementType === 'pagamento_parcella') {
    return {
      causaleBancaria: 'PAGAMENTO_PARCELLA',
      descrizione: movement.descriptionRaw || 'Pagamento parcella',
      righe: [
        { sezione: 'Dare', conto: 'Debiti verso percipiente', tipoConto: 'conto_patrimoniale_percipiente', importo: amount },
        { sezione: 'Avere', conto: 'Conto banca', tipoConto: 'conto_banca', importo: amount },
      ],
      partitarioImpact: selectedCandidate?.partitaId
        ? { action: 'chiusura_partita', partitaId: selectedCandidate.partitaId, importoChiusura: amount }
        : { action: 'nessuna' },
    }
  }

  if (movementType === 'incasso_cliente') {
    return {
      causaleBancaria: 'INCASSO_CLIENTE',
      descrizione: movement.descriptionRaw || 'Incasso cliente',
      righe: [
        { sezione: 'Dare', conto: 'Conto banca', tipoConto: 'conto_banca', importo: amount },
        { sezione: 'Avere', conto: 'Crediti verso clienti', tipoConto: 'conto_patrimoniale_cliente', importo: amount },
      ],
      partitarioImpact: selectedCandidate?.matchType === 'cumulative_candidate'
        ? { action: 'chiusura_multipla', partitaIds: selectedCandidate.subsetPartitaIds || [], importoChiusura: amount }
        : selectedCandidate?.partitaId
          ? { action: 'chiusura_partita', partitaId: selectedCandidate.partitaId, importoChiusura: amount }
          : { action: 'richiedi_scelta_operatore' },
    }
  }

  if (movementType === 'pagamento_fornitore') {
    const usesIvaPerCassa = Boolean(selectedCandidate?.ivaPerCassa)
    const isCumulative = selectedCandidate?.matchType === 'cumulative_candidate'
    const bankAccountLabel = movement.bankAccountCode === '1.01.01.002' ? 'Banca spese e commissioni' : 'Banca c/c ordinario'
    const supplierAccountLabel = usesIvaPerCassa ? 'Debiti verso fornitori con IVA per cassa' : 'Debiti verso fornitori'
    return {
      causaleBancaria: isCumulative ? 'PAGAMENTO_FORNITORE_MULTIPLO' : 'PAGAMENTO_FORNITORE',
      descrizione: isCumulative
        ? `Pagamento cumulativo a ${selectedCandidate?.soggettoNome || 'fornitore'} per ${(selectedCandidate?.subsetNumeroDocumenti || []).join(' ')}`
        : movement.descriptionRaw || 'Pagamento fornitore',
      righe: [
        { sezione: 'Dare', conto: supplierAccountLabel, tipoConto: 'conto_patrimoniale_fornitore', importo: amount },
        { sezione: 'Avere', conto: bankAccountLabel, tipoConto: 'conto_banca', importo: amount },
      ],
      partitarioImpact: isCumulative
        ? { action: 'chiusura_multipla', partitaIds: selectedCandidate.subsetPartitaIds || [], importoChiusura: amount, requireOperatorConfirmation: true }
        : selectedCandidate?.partitaId
          ? { action: 'chiusura_partita', partitaId: selectedCandidate.partitaId, importoChiusura: amount }
          : { action: 'richiedi_scelta_operatore' },
    }
  }

  return null
}

function buildCashVatImpact(movement, selectedCandidate, classification) {
  if (!selectedCandidate?.ivaPerCassa) return { applies: false }
  const amount = Math.abs(Number(movement.amount || 0))
  const base = Math.abs(Number(selectedCandidate.importoOriginario || selectedCandidate.importoAperto || 0))
  const proportion = base > 0 ? Math.min(1, Math.round((amount / base) * 10000) / 10000) : 0
  const direction = classification.movementType === 'incasso_cliente' ? 'iva_esigibile' : 'iva_detraibile'
  return {
    applies: true,
    direction,
    documentId: selectedCandidate.documentoId || null,
    taxableAmountReleased: Math.round((base * proportion) * 100) / 100,
    vatAmountReleased: 0,
    proportion,
    warning: 'Effetto IVA per cassa collegato in modo concettuale.',
  }
}

function buildWithholdingPaymentProposal(movement, selectedCandidate, classification) {
  if (!selectedCandidate?.ritenuta || classification.movementType !== 'pagamento_parcella') return { applies: false }
  return {
    applies: true,
    percipienteId: selectedCandidate.soggettoId || null,
    ritenutaId: selectedCandidate.documentoId ? `${selectedCandidate.documentoId}-ritenuta` : null,
    amount: Math.round(Math.abs(Number(movement.amount || 0)) * 0.2 * 100) / 100,
    warning: 'Ritenuta collegata alla parcella da verificare nel flusso fiscale futuro.',
  }
}

export function buildRiconciliazioneDecisionProposal({ movement = {}, candidates = [], classification = null } = {}) {
  const movementType = classification?.movementType || 'movimento_da_classificare'
  let selectedCandidate = pickTopCandidate(candidates)

  if (!selectedCandidate && (classification?.decisionType === 'ignora_movimento' || ['spesa_bancaria', 'f24', 'giroconto'].includes(movementType))) {
    selectedCandidate = {
      candidateId: `${movement.movementId || movement.id || 'movement'}::not_required`,
      movementId: movement.movementId || movement.id || null,
      partitaId: null,
      soggettoId: null,
      soggettoNome: null,
      soggettoTipo: null,
      matchType: 'not_required',
      amountDelta: 0,
      amountMatched: Math.abs(Number(movement.amount || 0)),
      residualAfterMatch: 0,
      confidence: 0.95,
      reasons: ['classificazione_diretta'],
      warnings: [],
      blockers: [],
    }
  }

  if (selectedCandidate?.matchType === 'cumulative_candidate') {
    selectedCandidate = {
      ...selectedCandidate,
      warnings: Array.from(new Set([...(selectedCandidate.warnings || []), 'candidato_cumulativo', 'richiesta_conferma_operatore'])),
    }
  }

  if (classification?.blockers?.includes('duplicato_potenziale')) {
    selectedCandidate = {
      ...(selectedCandidate || {}),
      matchType: 'ambiguous',
      warnings: Array.from(new Set([...(selectedCandidate?.warnings || []), 'potenziale_duplicato'])),
      blockers: Array.from(new Set([...(selectedCandidate?.blockers || []), 'duplicato_potenziale'])),
    }
  }

  const selectedMatchType = selectedCandidate?.matchType || 'no_match'
  const decisionType =
    classification?.decisionType === 'blocked'
      ? 'blocked'
      : selectedMatchType === 'partial_amount' || selectedMatchType === 'cumulative_candidate'
        ? 'match_parziale'
        : selectedMatchType === 'not_required'
          ? classification?.decisionType || 'classificazione_diretta'
          : selectedMatchType === 'ambiguous' && classification?.blockers?.includes('duplicato_potenziale')
            ? 'blocked'
            : selectedMatchType === 'ambiguous'
              ? 'match_partita'
              : classification?.decisionType || 'nessun_match'

  const confidence = selectedCandidate?.confidence ?? 0

  const warnings = Array.from(new Set([
    ...(classification?.warnings || []),
    ...(selectedCandidate?.warnings || []),
  ]))
  const blockers = Array.from(new Set([
    ...(classification?.blockers || []),
    ...(selectedCandidate?.blockers || []),
  ]))

  const accountingProposal = buildAccountingProposal(movement, classification || {}, selectedCandidate)
  const cashVatImpact = buildCashVatImpact(movement, selectedCandidate, classification || {})
  const withholdingPaymentProposal = buildWithholdingPaymentProposal(movement, selectedCandidate, classification || {})

  const readiness =
    decisionType === 'ignora_movimento'
      ? 'ignored'
      : decisionType === 'blocked'
        ? 'blocked'
        : decisionType === 'f24'
          ? (warnings.length || blockers.length ? 'blocked' : 'needs_operator_choice')
          : decisionType === 'giroconto'
            ? (movement.counterpartyIban ? 'ready_to_review' : 'needs_operator_choice')
            : decisionType === 'classificazione_diretta'
              ? 'ready_without_partita'
              : selectedCandidate?.matchType === 'ambiguous' || warnings.some((warning) => /scelta_operatore|ambiguous|candidato_cumulativo|duplicato/i.test(normalizeMockText(warning)))
                ? 'needs_operator_choice'
                : 'ready_to_review'

  return {
    movementId: movement.movementId || movement.id || null,
    decisionType,
    movementType,
    selectedCandidate,
    candidates: Array.isArray(candidates) ? candidates : [],
    confidence,
    warnings,
    blockers,
    accountingProposal,
    cashVatImpact,
    withholdingPaymentProposal,
    readiness,
  }
}