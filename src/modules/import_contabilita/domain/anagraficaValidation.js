export function normalizeText(value) {
  return String(value || '').trim()
}

export function getDefaultMastrinoForTipo(tipo) {
  return tipo === 'cliente' ? '1.02.20' : '2.03.08'
}

export const ANAGRAFICA_MASTRINI_BY_TIPO = Object.freeze({
  fornitore: [
    { codice: '2.03.08', label: 'Fornitori Italia' },
    { codice: '2.03.09', label: 'Fornitori Estero' },
    { codice: '2.03.10', label: 'Professionisti' },
  ],
  cliente: [
    { codice: '1.02.20', label: 'Clienti Italia' },
    { codice: '1.02.21', label: 'Clienti Estero' },
  ],
})

export function getAllowedMastriniForTipo(tipo) {
  return ANAGRAFICA_MASTRINI_BY_TIPO[tipo === 'cliente' ? 'cliente' : 'fornitore'] || ANAGRAFICA_MASTRINI_BY_TIPO.fornitore
}

export function getAllowedMastrinoCodesForTipo(tipo) {
  return getAllowedMastriniForTipo(tipo).map((item) => item.codice)
}

export function isAllowedMastrinoForTipo(tipo, mastrino) {
  const normalizedMastrino = normalizeText(mastrino)
  return getAllowedMastriniForTipo(tipo).some((item) => item.codice === normalizedMastrino)
}

export function normalizeAccountCodeDigits(value) {
  return String(value || '').replace(/\D/g, '')
}

export function accountCodeBelongsToMastrino(accountCode, mastrinoCode) {
  const accountDigits = normalizeAccountCodeDigits(accountCode)
  const mastrinoDigits = normalizeAccountCodeDigits(mastrinoCode)
  return Boolean(accountDigits && mastrinoDigits && accountDigits.startsWith(mastrinoDigits))
}

export function getMastrinoCodeForAccountCode(accountCode, tipo) {
  const allowedMastrini = getAllowedMastriniForTipo(tipo)
  return allowedMastrini.find((item) => accountCodeBelongsToMastrino(accountCode, item.codice))?.codice || ''
}

export function findAnagraficaExistingAccount(row, pianoContiList) {
  const decision = row?.decision || {}
  const accountId = normalizeText(decision.existingAccountId)
  const accountCode = normalizeText(decision.existingAccountCode || row?.matchedPianoContoCode)
  const accountDigits = normalizeAccountCodeDigits(accountCode)
  const list = Array.isArray(pianoContiList) ? pianoContiList : []

  if (accountId) {
    const byId = list.find((conto) => normalizeText(conto?.id) === accountId)
    if (byId) return byId
  }

  if (accountDigits) {
    const byCode = list.find((conto) => normalizeAccountCodeDigits(conto?.codice) === accountDigits)
    if (byCode) return byCode
  }

  return null
}

export function validateAnagraficaDecision(row, decision, pianoContiList) {
  const normalized = normalizeAnagraficaDecisionForRow(row, decision, pianoContiList)
  const identityData = normalizeText([
    row?.denominazione,
    row?.partitaIva,
    row?.codiceFiscale,
  ].join(' '))
  const reasons = []
  const warnings = []

  if (normalized.accountMode === 'none') {
    return {
      status: 'ignored',
      label: 'Ignorata',
      blockingReasons: [],
      warnings,
      normalized,
    }
  }

  if (normalized.accountMode === 'choose' || !normalized.accountMode) {
    reasons.push('Seleziona azione')
    return {
      status: 'incomplete',
      label: 'Incompleta',
      blockingReasons: reasons,
      warnings,
      normalized,
    }
  }

  if (!normalized.tipo) {
    reasons.push('Seleziona tipo soggetto')
  }

  if (!isAllowedMastrinoForTipo(normalized.tipo, normalized.mastrino)) {
    reasons.push('Mastrino non valido')
  }

  if (normalized.accountMode === 'existing') {
    const selectedAccount = findAnagraficaExistingAccount(
      {
        decision: normalized,
        matchedPianoContoCode: normalized.existingAccountCode || row?.matchedPianoContoCode || '',
      },
      Array.isArray(pianoContiList) ? pianoContiList : [],
    )
    const selectedMastrino = selectedAccount ? getMastrinoCodeForAccountCode(selectedAccount.codice || '', normalized.tipo) : ''

    const idStr = normalizeText(normalized.existingAccountId)
    const codeStr = normalizeText(normalized.existingAccountCode)

    if (!idStr) {
      reasons.push('PK reale del conto mancante')
    } else if (idStr === codeStr || idStr.includes('.') || idStr.includes(' - ') || idStr.length < 10) {
      reasons.push('conto_id non può contenere codice o label')
    } else if (!selectedAccount) {
      reasons.push('Conto fuori mastrini ammessi')
    } else if (!isAllowedMastrinoForTipo(normalized.tipo, selectedMastrino)) {
      reasons.push('Conto fuori mastrini ammessi')
    }

    if (reasons.length) {
      const invalid = reasons.some((reason) => reason === 'Conto fuori mastrini ammessi' || reason === 'conto_id non può contenere codice o label')
      return {
        status: invalid ? 'invalid' : 'incomplete',
        label: invalid ? 'Errore' : 'Incompleta',
        blockingReasons: reasons,
        warnings,
        normalized,
      }
    }

    if (normalized.decisionStatus === 'confirmed') {
      warnings.push('Conto esistente confermato localmente')
    } else {
      warnings.push('Conto esistente da confermare localmente')
    }
    return {
      status: 'linked',
      label: 'Conto esistente',
      blockingReasons: [],
      warnings,
      normalized,
    }
  }

  if (!identityData) {
    reasons.push('Dati anagrafici insufficienti')
  }

  if (reasons.length) {
    const invalid = reasons.includes('Mastrino non valido')
    return {
      status: invalid ? 'invalid' : 'incomplete',
      label: invalid ? 'Errore' : 'Incompleta',
      blockingReasons: reasons,
      warnings,
      normalized,
    }
  }

  if (normalized.decisionStatus === 'confirmed') {
    warnings.push('Scelta confermata localmente')
  }

  return {
    status: 'ready',
    label: 'Pronta',
    blockingReasons: [],
    warnings,
    normalized,
  }
}

export function normalizeAnagraficaDecisionForRow(row, storedDecision, pianoContiList) {
  const defaults = getDefaultAnagraficaDecision(row, pianoContiList)
  const decision = {
    ...defaults,
    ...(storedDecision && typeof storedDecision === 'object' ? storedDecision : {}),
  }

  decision.tipo = decision.tipo === 'cliente' ? 'cliente' : 'fornitore'

  const allowedMastrini = getAllowedMastriniForTipo(decision.tipo)
  const requestedMastrino = normalizeText(decision.mastrino)
  const allowedMastrinoCodes = allowedMastrini.map((item) => item.codice)
  if (!requestedMastrino || !allowedMastrinoCodes.includes(requestedMastrino)) {
    decision.mastrino = defaults.mastrino
  } else {
    decision.mastrino = requestedMastrino
  }

  decision.accountMode = decision.accountMode === 'existing'
    ? 'existing'
    : decision.accountMode === 'none'
      ? 'none'
      : decision.accountMode === 'choose'
        ? 'choose'
        : 'new'

  const allowedExistingAccounts = getAllowedExistingAccounts(decision.tipo, pianoContiList, '', decision.mastrino)
  const selectedAccount = decision.accountMode === 'existing'
    ? findAnagraficaExistingAccount(
      {
        decision,
        matchedPianoContoCode: decision.existingAccountCode || row?.matchedPianoContoCode || '',
      },
      allowedExistingAccounts,
    )
    : null

  if (selectedAccount) {
    decision.existingAccountId = normalizeText(selectedAccount.id || '')
    decision.existingAccountCode = normalizeText(selectedAccount.codice || '')
  } else if (decision.accountMode !== 'existing') {
    decision.existingAccountId = ''
    decision.existingAccountCode = ''
  }

  decision.updatedAt = normalizeText(decision.updatedAt || '')
  decision.hiddenFromAnagrafiche = Boolean(decision.hiddenFromAnagrafiche)
  decision.accountDataUpdatedAt = normalizeText(decision.accountDataUpdatedAt || '')
  return decision
}

export function getDefaultAnagraficaDecision(row, pianoContiList = []) {
  const tipo = row?.tipoSuggerito === 'cliente' ? 'cliente' : 'fornitore'
  const fallbackMastrino = tipo === 'cliente' ? '1.02.20' : '2.03.08'
  const existingAccountCode = normalizeText(row?.matchedPianoContoCode || '')
  const matchStrength = normalizeText(row?.matchStrength || '')
  const isStrongMatch = matchStrength === 'strong'
  const isWeakMatch = matchStrength === 'weak'
  const hasIdentityData = Boolean(normalizeText([
    row?.denominazione,
    row?.partitaIva,
    row?.codiceFiscale,
  ].join(' ')))
  const safeExistingAccountCode = getAllowedMastriniForTipo(tipo).some((item) => accountCodeBelongsToMastrino(existingAccountCode, item.codice)) ? existingAccountCode : ''
  const strongMastrino = safeExistingAccountCode ? getMastrinoCodeForAccountCode(safeExistingAccountCode, tipo) : ''
  const resolvedExistingAccount = safeExistingAccountCode
    ? resolveAllowedAnagraficaAccountByCode({ matchedPianoContoCode: safeExistingAccountCode }, pianoContiList, tipo)
    : null

  if ((isStrongMatch || isWeakMatch) && resolvedExistingAccount) {
    return {
      decisionStatus: 'pending',
      tipo,
      accountMode: 'existing',
      mastrino: strongMastrino || fallbackMastrino,
      existingAccountId: normalizeText(resolvedExistingAccount.id || ''),
      existingAccountCode: normalizeText(resolvedExistingAccount.codice || safeExistingAccountCode),
      updatedAt: '',
    }
  }

  if (isWeakMatch) {
    return {
      decisionStatus: 'pending',
      tipo,
      accountMode: 'choose',
      mastrino: fallbackMastrino,
      existingAccountId: '',
      existingAccountCode: '',
      updatedAt: '',
    }
  }

  if (!hasIdentityData) {
    return {
      decisionStatus: 'pending',
      tipo,
      accountMode: 'choose',
      mastrino: fallbackMastrino,
      existingAccountId: '',
      existingAccountCode: '',
      updatedAt: '',
    }
  }

  return {
    decisionStatus: 'pending',
    tipo,
    accountMode: 'new',
    mastrino: fallbackMastrino,
    existingAccountId: '',
    existingAccountCode: '',
    updatedAt: '',
  }
}

export function mergeAnagraficaDecision(row, storedDecision, pianoContiList = []) {
  return normalizeAnagraficaDecisionForRow(row, storedDecision, pianoContiList)
}

export function getAllowedExistingAccounts(tipo, pianoContiList, searchTerm = '', selectedMastrino = '') {
  const normalizedTipo = tipo === 'cliente' ? 'cliente' : 'fornitore'
  const allowedPrefixes = getAllowedMastrinoCodesForTipo(normalizedTipo)
  const normalizedSearch = normalizeText(searchTerm).toLowerCase()
  const normalizedSelectedMastrino = normalizeText(selectedMastrino)
  const rows = Array.isArray(pianoContiList) ? pianoContiList : []

  const filtered = rows.filter((conto) => {
    const code = normalizeText(conto?.codice)
    if (!code) return false
    if (!allowedPrefixes.some((prefix) => accountCodeBelongsToMastrino(code, prefix))) return false
    if (normalizedSelectedMastrino && isAllowedMastrinoForTipo(normalizedTipo, normalizedSelectedMastrino)) {
      if (!accountCodeBelongsToMastrino(code, normalizedSelectedMastrino)) return false
    }

    if (!normalizedSearch) return true

    const haystack = [
      conto?.codice,
      conto?.descrizione,
      conto?.partitaIva,
      conto?.anagraficaPiva,
      conto?.codiceFiscale,
      conto?.anagraficaCf,
    ].join(' ').toLowerCase()

    return haystack.includes(normalizedSearch)
  })

  return filtered
}

export function resolveAllowedAnagraficaAccountByCode(row, pianoContiList, tipo) {
  const code = normalizeText(row?.matchedPianoContoCode || row?.existingAccountCode || '')
  if (!code) return null
  const mastrino = getMastrinoCodeForAccountCode(code, tipo)
  if (!isAllowedMastrinoForTipo(tipo, mastrino)) return null
  const allowedAccounts = getAllowedExistingAccounts(tipo, pianoContiList, '', mastrino)
  const normalizedDigits = normalizeAccountCodeDigits(code)
  return allowedAccounts.find((conto) => normalizeAccountCodeDigits(conto?.codice) === normalizedDigits) || null
}
