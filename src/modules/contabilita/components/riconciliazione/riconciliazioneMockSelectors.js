const directionFromMovement = (movement) => {
  if (movement.entrata && movement.entrata > 0) return 'entrata'
  if (movement.uscita && movement.uscita > 0) return 'uscita'
  return 'tutto'
}

export const isMovementBlocked = (movement) =>
  ['Bloccata', 'Duplicata', 'Ignorata', 'Sospesa'].includes(movement.status)

export const isMovementSelectableForMassActions = (movement) => movement.ready && !isMovementBlocked(movement)

export const getMovementKind = (movement) => {
  const text = [
    movement.description,
    movement.match,
    movement.action,
    movement.detail?.movement?.bankCausal,
    movement.detail?.movement?.descriptionRaw,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()

  if (movement.detail?.giroconto || text.includes('giroconto')) return 'giroconto'
  if (text.includes('f24')) return 'f24'
  if (movement.detail?.withholding?.status === 'Da generare' || text.includes('ritenuta')) return 'ritenute'
  if (movement.detail?.cashVat?.status === 'Da sbloccare' || text.includes('cassa')) return 'iva_cassa'
  if (text.includes('commission')) return 'commissioni'
  if (text.includes('incasso')) return 'incasso'
  if (text.includes('pagamento professionista') || text.includes('parcella')) return 'parcella'
  if (text.includes('pagamento fornitore')) return 'fornitore'
  if (movement.uscita && movement.uscita > 0) return 'uscita'
  if (movement.entrata && movement.entrata > 0) return 'entrata'
  return 'altro'
}

export const normalizeMockText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

export const matchesMockSearch = (movement, search) => {
  const term = normalizeMockText(search)
  if (!term) return true
  const haystack = [
    movement.description,
    movement.counterparty,
    movement.match,
    movement.action,
    movement.detail?.movement?.descriptionRaw,
    movement.detail?.movement?.bankCausal,
    movement.detail?.movement?.reference,
    movement.detail?.match?.title,
    movement.detail?.pn?.causale,
    movement.detail?.ledger?.document,
    movement.detail?.ledger?.subject,
    movement.detail?.giroconto?.sourceBank,
    movement.detail?.giroconto?.targetBank,
    movement.entrata,
    movement.uscita,
  ]
    .filter((value) => value !== undefined && value !== null)
    .map(normalizeMockText)
    .join(' ')
  return haystack.includes(term)
}

export const matchesMockFilters = (movement, filters) => {
  if (!matchesMockSearch(movement, filters.search)) return false

  if (filters.status !== 'all' && normalizeMockText(movement.status) !== filters.status) return false
  if (filters.onlyReady && !movement.ready) return false
  if (filters.onlyBlocked && !isMovementBlocked(movement)) return false
  if (filters.onlyWithoutMatch && normalizeMockText(movement.match).trim() && normalizeMockText(movement.match) !== 'n/d') return false

  if (filters.direction !== 'all') {
    const direction = directionFromMovement(movement)
    if (direction !== filters.direction) return false
  }

  if (filters.confidence !== 'all') {
    const confidence = Number(movement.confidence || 0)
    if (filters.confidence === 'high' && confidence < 85) return false
    if (filters.confidence === 'medium' && (confidence < 70 || confidence >= 85)) return false
    if (filters.confidence === 'low' && confidence >= 70) return false
  }

  if (filters.kind !== 'all' && getMovementKind(movement) !== filters.kind) return false

  if (filters.ivaCassa && movement.ivaCassa === 'No') return false
  if (filters.withholding && movement.withholding === 'Non applicabile') return false
  if (filters.f24 && !normalizeMockText(movement.match).includes('f24') && getMovementKind(movement) !== 'f24') return false
  if (filters.giroconti && getMovementKind(movement) !== 'giroconto') return false

  return true
}

export const filterMockMovements = (movements, filters) =>
  movements.filter((movement) => matchesMockFilters(movement, filters))

export const buildMockKpis = (movements) => {
  const totalIn = movements.reduce((sum, movement) => sum + (Number(movement.entrata) || 0), 0)
  const totalOut = movements.reduce((sum, movement) => sum + (Number(movement.uscita) || 0), 0)
  return [
    { label: 'Movimenti importati', value: movements.length, tone: 'blue', secondary: 'Estratto filtrato' },
    { label: 'Da riconciliare', value: movements.filter((movement) => movement.status === 'Da abbinare' || movement.status === 'Da dettagliare').length, tone: 'amber', secondary: 'Ancora da verificare' },
    { label: 'Proposte forti', value: movements.filter((movement) => Number(movement.confidence || 0) >= 85).length, tone: 'green', secondary: 'Confidence alta' },
    { label: 'Pronti', value: movements.filter((movement) => movement.ready).length, tone: 'green', secondary: 'Selezionabili' },
    { label: 'Bloccati', value: movements.filter((movement) => isMovementBlocked(movement)).length, tone: 'red', secondary: 'Serve revisione' },
    { label: 'Differenza saldo', value: '0,00 €', tone: 'green', secondary: `Entrate ${totalIn.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })} / Uscite ${totalOut.toLocaleString('it-IT', { style: 'currency', currency: 'EUR' })}` },
  ]
}

export const buildMockFooter = (movements) => {
  const entrate = movements.reduce((sum, movement) => sum + (Number(movement.entrata) || 0), 0)
  const uscite = movements.reduce((sum, movement) => sum + (Number(movement.uscita) || 0), 0)
  return {
    totalEntrate: entrate,
    totalUscite: uscite,
    rows: movements.length,
  }
}

export const buildMockSelectableIds = (movements) =>
  movements.filter(isMovementSelectableForMassActions).map((movement) => movement.id)
