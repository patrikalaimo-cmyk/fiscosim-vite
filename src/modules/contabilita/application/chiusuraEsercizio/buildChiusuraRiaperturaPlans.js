/**
 * Pure builders for year-end close (CE + SP) and reopen (SP opposite).
 * Does not post, lock, or certify completeness — plans only.
 */

const str = (v) => String(v ?? '').trim()
const ISO = /^\d{4}-\d{2}-\d{2}$/

export function toCents(value) {
  return Math.round(Number(value) * 100)
}

export function fromCents(cents) {
  return cents / 100
}

function addBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code)
}

function money(cents) {
  return fromCents(cents)
}

/** Reverse a non-zero saldoFinale (dare−avere) to zero the account. */
export function invertSaldoToCloseMovement(contoId, saldoFinaleCents) {
  const id = str(contoId)
  const c = Number(saldoFinaleCents)
  if (!id || !Number.isSafeInteger(c) || c === 0) return null
  if (c > 0) return { conto_id: id, dare: 0, avere: money(c) }
  return { conto_id: id, dare: money(-c), avere: 0 }
}

/** Opposite of a close movement (for riapertura). */
export function invertMovement(row) {
  const d = toCents(row?.dare)
  const a = toCents(row?.avere)
  return {
    conto_id: str(row?.conto_id),
    dare: money(a),
    avere: money(d),
    ...(row?.descrizione !== undefined ? { descrizione: row.descrizione } : {}),
  }
}

function sumDareAvereCents(rows) {
  let dare = 0
  let avere = 0
  for (const row of rows) {
    dare += toCents(row.dare)
    avere += toCents(row.avere)
  }
  return { dare, avere }
}

function assertBalanced(rows, blockers, code) {
  const { dare, avere } = sumDareAvereCents(rows)
  if (dare <= 0 || dare !== avere) addBlocker(blockers, code)
  return { dare, avere }
}

/**
 * Apply journal rows to a Map(contoId → saldoCents). Mutates map.
 */
export function applyRowsToSaldiCents(saldiMap, rows) {
  for (const row of rows || []) {
    const id = str(row.conto_id)
    if (!id) continue
    const next = (saldiMap.get(id) || 0) + toCents(row.dare) - toCents(row.avere)
    saldiMap.set(id, next)
  }
  return saldiMap
}

/**
 * Build close-CE plan: zero economici into conto utile/perdita.
 */
export function buildCloseCePlan({
  saldiConti = [],
  contoUtileId,
  causaleChiusuraId,
  dataRegistrazione,
  descrizione = 'Chiusura conto economico',
} = {}) {
  const blockers = []
  const utileId = str(contoUtileId)
  const causaleId = str(causaleChiusuraId)
  const date = str(dataRegistrazione)
  if (!utileId) addBlocker(blockers, 'conto_utile_mancante')
  if (!causaleId) addBlocker(blockers, 'causale_chiusura_mancante')
  if (!ISO.test(date)) addBlocker(blockers, 'data_chiusura_ce_non_valida')

  const rows = []
  let utileDelta = 0
  for (const conto of saldiConti) {
    if (str(conto?.tipo).toLowerCase() !== 'economico') continue
    const saldoC = toCents(conto.saldoFinale)
    if (!Number.isSafeInteger(saldoC) || saldoC === 0) continue
    const move = invertSaldoToCloseMovement(conto.contoId || conto.id, saldoC)
    if (!move) continue
    rows.push({ ...move, descrizione: `Chiusura ${str(conto.codice || conto.contoId)}` })
    // Opposite effect on utile: closing +saldo (cost) debits utile; −saldo (ricavo) credits utile
    utileDelta -= saldoC
  }
  if (!rows.length) addBlocker(blockers, 'nessun_economico_da_chiudere')
  // utileDelta > 0 ⇒ profit (credit utile); < 0 ⇒ loss (debit utile)
  if (utileDelta !== 0 && utileId) {
    const u = invertSaldoToCloseMovement(utileId, utileDelta)
    if (u) rows.push({ ...u, descrizione: 'Risultato esercizio' })
  }
  assertBalanced(rows, blockers, 'chiusura_ce_non_quadrata')
  const total = sumDareAvereCents(rows)
  return {
    kind: 'chiusura_ce',
    valid: blockers.length === 0,
    blockers,
    header: {
      data_registrazione: date,
      descrizione: str(descrizione).slice(0, 500),
      causale_id: causaleId || undefined,
    },
    rows,
    totale: money(total.dare),
  }
}

/**
 * Build close-SP plan: zero patrimoniali (post-CE). Must balance.
 */
export function buildCloseSpPlan({
  saldiConti = [],
  causaleChiusuraId,
  dataRegistrazione,
  descrizione = 'Chiusura stato patrimoniale',
} = {}) {
  const blockers = []
  const causaleId = str(causaleChiusuraId)
  const date = str(dataRegistrazione)
  if (!causaleId) addBlocker(blockers, 'causale_chiusura_mancante')
  if (!ISO.test(date)) addBlocker(blockers, 'data_chiusura_sp_non_valida')

  const rows = []
  for (const conto of saldiConti) {
    if (str(conto?.tipo).toLowerCase() !== 'patrimoniale') continue
    const saldoC = toCents(conto.saldoFinale)
    if (!Number.isSafeInteger(saldoC) || saldoC === 0) continue
    const move = invertSaldoToCloseMovement(conto.contoId || conto.id, saldoC)
    if (!move) continue
    rows.push({ ...move, descrizione: `Chiusura ${str(conto.codice || conto.contoId)}` })
  }
  if (!rows.length) addBlocker(blockers, 'nessun_patrimoniale_da_chiudere')
  if (rows.some((r) => {
    const hit = saldiConti.find((c) => str(c.contoId || c.id) === r.conto_id)
    return hit && str(hit.tipo).toLowerCase() === 'economico'
  })) {
    addBlocker(blockers, 'conto_economico_in_chiusura_sp')
  }
  assertBalanced(rows, blockers, 'chiusura_sp_non_quadrata')
  const total = sumDareAvereCents(rows)
  return {
    kind: 'chiusura_sp',
    valid: blockers.length === 0,
    blockers,
    header: {
      data_registrazione: date,
      descrizione: str(descrizione).slice(0, 500),
      causale_id: causaleId || undefined,
    },
    rows,
    totale: money(total.dare),
  }
}

/**
 * Build reopen-SP plan: opposite of close-SP rows, causale apertura.
 */
export function buildReopenSpPlan({
  closeSpRows = [],
  causaleAperturaId,
  dataRegistrazione,
  descrizione = 'Riapertura stato patrimoniale',
} = {}) {
  const blockers = []
  const causaleId = str(causaleAperturaId)
  const date = str(dataRegistrazione)
  if (!causaleId) addBlocker(blockers, 'causale_apertura_mancante')
  if (!ISO.test(date)) addBlocker(blockers, 'data_riapertura_non_valida')
  if (!Array.isArray(closeSpRows) || closeSpRows.length < 2) {
    addBlocker(blockers, 'chiusura_sp_righe_mancanti')
  }
  const rows = (closeSpRows || []).map((r) => ({
    ...invertMovement(r),
    descrizione: r?.descrizione
      ? String(r.descrizione).replace(/^Chiusura/i, 'Riapertura')
      : 'Riapertura',
  }))
  assertBalanced(rows, blockers, 'riapertura_sp_non_quadrata')
  const total = sumDareAvereCents(rows)
  return {
    kind: 'riapertura_sp',
    valid: blockers.length === 0,
    blockers,
    header: {
      data_registrazione: date,
      descrizione: str(descrizione).slice(0, 500),
      causale_id: causaleId || undefined,
    },
    rows,
    totale: money(total.dare),
  }
}

/**
 * From saldi/conti produce balanced close-CE, close-SP, reopen-SP plans.
 * `saldiConti`: [{ contoId|id, codice?, tipo, natura?, saldoFinale }]
 */
export function buildChiusuraRiaperturaPlans({
  saldiConti = [],
  contoUtileId,
  causaleChiusuraId,
  causaleAperturaId,
  dates = {},
} = {}) {
  const blockers = []
  const yearClose = str(dates.closeCe || dates.closeSp || '').slice(0, 4)
  const closeCeDate = str(dates.closeCe || (yearClose ? `${yearClose}-12-30` : ''))
  const closeSpDate = str(dates.closeSp || (yearClose ? `${yearClose}-12-31` : ''))
  const reopenDate = str(dates.reopen || (yearClose ? `${Number(yearClose) + 1}-01-02` : ''))

  if (!Array.isArray(saldiConti) || !saldiConti.length) {
    addBlocker(blockers, 'saldi_conti_mancanti')
  }

  const closeCe = buildCloseCePlan({
    saldiConti,
    contoUtileId,
    causaleChiusuraId,
    dataRegistrazione: closeCeDate,
  })

  // Simulate CE on saldi for SP input
  const saldiMap = new Map()
  const meta = new Map()
  for (const c of saldiConti) {
    const id = str(c.contoId || c.id)
    if (!id) continue
    saldiMap.set(id, toCents(c.saldoFinale))
    meta.set(id, c)
  }
  if (closeCe.valid) applyRowsToSaldiCents(saldiMap, closeCe.rows)

  const saldiAfterCe = [...saldiMap.entries()].map(([contoId, saldoC]) => {
    const base = meta.get(contoId) || { contoId, tipo: contoId === str(contoUtileId) ? 'patrimoniale' : 'patrimoniale' }
    return {
      ...base,
      contoId,
      id: contoId,
      tipo: str(base.tipo || (contoId === str(contoUtileId) ? 'patrimoniale' : base.tipo)),
      saldoFinale: money(saldoC),
    }
  })
  // Ensure utile meta exists
  if (str(contoUtileId) && !meta.has(str(contoUtileId))) {
    saldiAfterCe.push({
      contoId: str(contoUtileId),
      id: str(contoUtileId),
      tipo: 'patrimoniale',
      natura: 'passivo',
      codice: 'utile',
      saldoFinale: money(saldiMap.get(str(contoUtileId)) || 0),
    })
  }

  const closeSp = buildCloseSpPlan({
    saldiConti: saldiAfterCe,
    causaleChiusuraId,
    dataRegistrazione: closeSpDate,
  })
  const reopenSp = buildReopenSpPlan({
    closeSpRows: closeSp.rows,
    causaleAperturaId,
    dataRegistrazione: reopenDate,
  })

  for (const part of [closeCe, closeSp, reopenSp]) {
    for (const b of part.blockers) addBlocker(blockers, b)
  }

  // Continuity: reopen must be exact opposite of close SP
  if (closeSp.rows.length && reopenSp.rows.length) {
    const closeBy = new Map(closeSp.rows.map((r) => [r.conto_id, r]))
    for (const open of reopenSp.rows) {
      const closed = closeBy.get(open.conto_id)
      if (!closed
        || toCents(closed.dare) !== toCents(open.avere)
        || toCents(closed.avere) !== toCents(open.dare)) {
        addBlocker(blockers, 'continuita_saldi_non_opposta')
      }
    }
  }

  return {
    valid: blockers.length === 0,
    blockers,
    closeCe,
    closeSp,
    reopenSp,
    period: {
      closeCe: closeCeDate,
      closeSp: closeSpDate,
      reopen: reopenDate,
    },
  }
}

/** Existing UI/RPC semantics: PN locked when periodo_chiuso_lock or stampa definitiva. */
export function isPeriodoChiusoLock(scrittura = {}) {
  return Boolean(scrittura?.periodo_chiuso_lock || scrittura?.stampa_giornale_id)
}
