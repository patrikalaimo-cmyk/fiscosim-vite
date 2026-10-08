// Prospetto analitico dei movimenti per conto ricostruiti dalla Prima Nota canonica.
// NON e un bilancio definitivo: per la chiusura servono saldi di apertura e policy esercizio.
const VALID_STATES = new Set(['confermata', 'definitiva'])
const EXCLUDED_STATES = new Set(['bozza', 'simulata', 'annullata', 'stornata', 'storno'])
const DATE = /^\d{4}-\d{2}-\d{2}$/

function str(value) {
  return String(value ?? '').trim()
}

function cents(value) {
  const v = Number(value ?? 0)
  if (!Number.isFinite(v) || v < 0) return null
  const c = Math.round(v * 100)
  return Number.isSafeInteger(c) ? c : null
}

function money(value) {
  return Math.round(value) / 100
}

function addBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code)
}

export function buildMovimentiPerContoModel(entries = [], {
  societaId,
  periodoInizio,
  periodoFine,
} = {}) {
  const blockers = []
  const excluded = []
  const company = str(societaId)
  const start = str(periodoInizio)
  const end = str(periodoFine)
  if (!company) addBlocker(blockers, 'societa_id_mancante')
  if (!DATE.test(start) || !DATE.test(end) || start > end) {
    addBlocker(blockers, 'periodo_non_valido')
  }
  if (!Array.isArray(entries)) addBlocker(blockers, 'prima_nota_input_non_valido')

  const sorted = [...(Array.isArray(entries) ? entries : [])].sort((a, b) =>
    str(a?.data_registrazione).localeCompare(str(b?.data_registrazione))
    || (Number(a?.numero_registrazione || 0) - Number(b?.numero_registrazione || 0))
    || str(a?.id).localeCompare(str(b?.id))
  )
  const pnIds = new Set()
  const conti = new Map()
  let sumDare = 0
  let sumAvere = 0
  let included = 0

  for (const pn of sorted) {
    const pnId = str(pn?.id)
    const stato = str(pn?.stato).toLowerCase()
    const date = str(pn?.data_registrazione).slice(0, 10)
    if (!pnId || pnIds.has(pnId)) {
      addBlocker(blockers, 'prima_nota_id_mancante_o_duplicata')
      continue
    }
    pnIds.add(pnId)
    if (str(pn?.societa_id) !== company) {
      addBlocker(blockers, 'prima_nota_societa_non_coerente')
      continue
    }
    if (!DATE.test(date) || (DATE.test(start) && DATE.test(end) && (date < start || date > end))) {
      addBlocker(blockers, 'prima_nota_fuori_periodo')
      continue
    }
    if (EXCLUDED_STATES.has(stato)) {
      excluded.push({ primaNotaId: pnId, stato })
      continue
    }
    if (!VALID_STATES.has(stato)) {
      addBlocker(blockers, 'stato_prima_nota_non_definito')
      continue
    }
    if (!Array.isArray(pn?.righe) || pn.righe.length === 0) {
      addBlocker(blockers, 'prima_nota_senza_righe')
      continue
    }

    let pnDare = 0
    let pnAvere = 0
    const validated = []
    const lineKeys = new Set()
    for (const [idx, r] of pn.righe.entries()) {
      const lineKey = str(r?.id) || str(r?.riga_numero) || String(idx + 1)
      if (lineKeys.has(lineKey)) {
        addBlocker(blockers, 'riga_prima_nota_duplicata')
        continue
      }
      lineKeys.add(lineKey)
      const accountId = str(r?.conto_id)
      const code = str(r?.conto_codice)
      const key = accountId ? `id:${accountId}` : code ? `codice:${code}` : ''
      if (!key) {
        addBlocker(blockers, 'conto_prima_nota_mancante')
        continue
      }
      const dare = cents(r?.importo_dare ?? r?.dare)
      const avere = cents(r?.importo_avere ?? r?.avere)
      if (dare === null || avere === null || (dare === 0 && avere === 0) || (dare > 0 && avere > 0)) {
        addBlocker(blockers, 'riga_prima_nota_importo_non_valido')
        continue
      }
      pnDare += dare
      pnAvere += avere
      validated.push({ key, accountId, code, descrizione: str(r?.conto_descrizione), dare, avere, row: r })
    }
    if (validated.length !== pn.righe.length) continue
    if (pnDare !== pnAvere) {
      addBlocker(blockers, 'prima_nota_non_quadrata')
      continue
    }
    const declaredDare = pn?.totale_dare == null ? pnDare : cents(pn.totale_dare)
    const declaredAvere = pn?.totale_avere == null ? pnAvere : cents(pn.totale_avere)
    if (declaredDare !== pnDare || declaredAvere !== pnAvere) {
      addBlocker(blockers, 'totali_prima_nota_non_coerenti')
      continue
    }

    included += 1
    sumDare += pnDare
    sumAvere += pnAvere
    for (const r of validated) {
      const existing = conti.get(r.key)
      if (existing && (existing.contoId !== r.accountId || existing.codice !== r.code)) {
        addBlocker(blockers, 'anagrafica_conto_non_coerente')
        continue
      }
      const acc = existing || {
        contoId: r.accountId || null,
        codice: r.code || null,
        descrizione: r.descrizione || null,
        dareCents: 0,
        avereCents: 0,
        movimenti: [],
      }
      acc.dareCents += r.dare
      acc.avereCents += r.avere
      acc.movimenti.push({
        primaNotaId: pnId,
        numeroRegistrazione: pn.numero_registrazione ?? null,
        dataRegistrazione: date,
        rigaNumero: r.row.riga_numero ?? null,
        descrizione: str(r.row.descrizione_riga || pn.descrizione),
        dare: money(r.dare),
        avere: money(r.avere),
        saldoProgressivoPeriodo: money(acc.dareCents - acc.avereCents),
      })
      conti.set(r.key, acc)
    }
  }

  if (sumDare !== sumAvere) addBlocker(blockers, 'movimenti_periodo_non_quadrati')
  const rows = [...conti.values()].sort((a, b) =>
    str(a.codice).localeCompare(str(b.codice), 'it', { numeric: true })
    || str(a.contoId).localeCompare(str(b.contoId))
  ).map((a) => ({
    contoId: a.contoId,
    codice: a.codice,
    descrizione: a.descrizione,
    dare: money(a.dareCents),
    avere: money(a.avereCents),
    saldoMovimentiPeriodo: money(a.dareCents - a.avereCents),
    saldoDare: money(Math.max(a.dareCents - a.avereCents, 0)),
    saldoAvere: money(Math.max(a.avereCents - a.dareCents, 0)),
    movimenti: a.movimenti,
  }))
  const saldiDare = rows.reduce((x, r) => x + Math.round(r.saldoDare * 100), 0)
  const saldiAvere = rows.reduce((x, r) => x + Math.round(r.saldoAvere * 100), 0)
  if (saldiDare !== saldiAvere) addBlocker(blockers, 'saldi_periodo_non_quadrati')

  return {
    valid: blockers.length === 0,
    definitive: false,
    kind: 'movimenti_per_conto_periodo',
    basis: 'prima_nota_canonica',
    period: { societaId: company, inizio: start, fine: end },
    primaNotaIncluse: included,
    primaNotaEscluse: excluded,
    blockers,
    warnings: [
      'Saldi riferiti ai soli movimenti del periodo; saldo iniziale ed esercizi precedenti non ricostruiti.',
      ...(excluded.length ? ['Scritture non confermate/escluse dal conteggio.'] : []),
    ],
    conti: rows,
    totali: {
      dare: money(sumDare),
      avere: money(sumAvere),
      saldoDare: money(saldiDare),
      saldoAvere: money(saldiAvere),
      quadrato: sumDare === sumAvere && saldiDare === saldiAvere,
    },
  }
}
