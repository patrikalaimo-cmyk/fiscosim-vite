// Aging / insoluti da residui partitario aperti, bucket per giorni di ritardo vs asOf.
// Coerenza attesa: somma residui per conto ≈ |saldo mastrini| dello stesso conto (centesimi).

const DATE = /^\d{4}-\d{2}-\d{2}$/
const VALID_STATI = new Set(['aperta', 'parziale', 'chiusa'])
const TIPO_MAP = {
  cliente: 'clienti',
  clienti: 'clienti',
  fornitore: 'fornitori',
  fornitori: 'fornitori',
  percipiente: 'percipienti',
  percipienti: 'percipienti',
}

export const AGING_BUCKET_KEYS = Object.freeze([
  'current',
  'd1_30',
  'd31_60',
  'd61_90',
  'd90_plus',
  'senza_scadenza',
])

function str(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return null
  return Math.round(n * 100) / 100
}

function day(value) {
  const raw = str(value).slice(0, 10)
  return DATE.test(raw) ? raw : ''
}

function addBlocker(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code)
}

function normalizeTipo(value) {
  const key = str(value).toLowerCase()
  return TIPO_MAP[key] || ''
}

function normalizeStato(value, residuo) {
  const stato = str(value).toLowerCase()
  if (VALID_STATI.has(stato)) return stato
  if (residuo == null) return ''
  if (Math.abs(residuo) <= 0.01) return 'chiusa'
  return 'aperta'
}

function emptyBuckets() {
  return Object.fromEntries(AGING_BUCKET_KEYS.map((k) => [k, 0]))
}

function daysBetween(fromIso, toIso) {
  const a = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  )
  return Math.floor((b - a) / 86400000)
}

function resolveBucket(dueIso, asOfIso) {
  if (!DATE.test(dueIso)) {
    return { bucket: 'senza_scadenza', daysOverdue: null }
  }
  const daysOverdue = daysBetween(dueIso, asOfIso)
  if (daysOverdue <= 0) return { bucket: 'current', daysOverdue }
  if (daysOverdue <= 30) return { bucket: 'd1_30', daysOverdue }
  if (daysOverdue <= 60) return { bucket: 'd31_60', daysOverdue }
  if (daysOverdue <= 90) return { bucket: 'd61_90', daysOverdue }
  return { bucket: 'd90_plus', daysOverdue }
}

/**
 * @param {Array<object>} rows - righe `partitario`
 * @param {object} options
 * @param {string} options.societaId
 * @param {string} options.asOf - YYYY-MM-DD
 * @param {string} [options.tipo] - clienti|fornitori|percipienti|tutti|cliente|…
 */
export function buildAgingInsolutiModel(rows = [], {
  societaId,
  asOf,
  tipo = 'tutti',
} = {}) {
  const blockers = []
  const warnings = []
  const company = str(societaId)
  const asOfDay = day(asOf)
  const tipoFilter = str(tipo).toLowerCase()
  const wantTipo = (!tipoFilter || tipoFilter === 'tutti')
    ? null
    : normalizeTipo(tipoFilter)

  if (!company) addBlocker(blockers, 'societa_id_mancante')
  if (!DATE.test(asOfDay)) addBlocker(blockers, 'as_of_non_valido')
  if (tipoFilter && tipoFilter !== 'tutti' && !wantTipo) {
    addBlocker(blockers, 'tipo_soggetto_non_valido')
  }
  if (!Array.isArray(rows)) addBlocker(blockers, 'partitario_input_non_valido')

  const list = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const openRows = []
  let excluded = 0

  for (const row of list) {
    const id = str(row?.id)
    if (!id || seen.has(id)) {
      addBlocker(blockers, 'partita_id_mancante_o_duplicata')
      continue
    }
    seen.add(id)

    if (str(row?.societa_id) !== company) {
      addBlocker(blockers, 'partita_societa_non_coerente')
      continue
    }

    const original = money(row?.importo_originale)
    const paid = money(row?.importo_pagato)
    const residual = money(row?.importo_residuo)
    if (original === null || paid === null || residual === null) {
      addBlocker(blockers, 'partita_importo_non_valido')
      continue
    }
    if (original < 0 || paid < 0 || residual < 0) {
      excluded += 1
      continue
    }
    if (Math.abs(original - paid - residual) > 0.02) {
      excluded += 1
      continue
    }

    const type = normalizeTipo(row?.tipo)
    if (!type) {
      excluded += 1
      continue
    }
    if (wantTipo && type !== wantTipo) {
      excluded += 1
      continue
    }

    const state = normalizeStato(row?.stato, residual)
    if (!state) {
      excluded += 1
      continue
    }

    // Solo residui aperti (insoluti / scadenzario aperto).
    if (residual <= 0.01) {
      excluded += 1
      continue
    }

    const docDate = day(row?.data_documento)
    const dueDate = day(row?.data_scadenza)
    const dueAnchor = dueDate || docDate
    const { bucket, daysOverdue } = resolveBucket(dueAnchor, asOfDay)

    openRows.push({
      id,
      subject: str(row?.controparte_nome)
        || str(row?.conto_descrizione)
        || '—',
      type,
      doc: str(row?.numero_documento) || '—',
      date: docDate || null,
      due: dueDate || null,
      dueAnchor: dueAnchor || null,
      original,
      paid,
      residual,
      state,
      bucket,
      daysOverdue,
      contoId: str(row?.conto_id) || null,
      contoCodice: str(row?.conto_codice) || null,
      primaNotaId: str(row?.prima_nota_id) || null,
    })
  }

  openRows.sort((a, b) =>
    (Number(b.daysOverdue ?? -1) - Number(a.daysOverdue ?? -1))
    || str(a.subject).localeCompare(str(b.subject), 'it')
    || str(a.id).localeCompare(str(b.id))
  )

  const byBucket = emptyBuckets()
  const byContoMap = new Map()
  for (const r of openRows) {
    byBucket[r.bucket] = Math.round((byBucket[r.bucket] + r.residual) * 100) / 100
    const key = r.contoId || `codice:${r.contoCodice || 'unknown'}`
    const acc = byContoMap.get(key) || {
      contoId: r.contoId,
      contoCodice: r.contoCodice,
      type: r.type,
      subject: r.subject,
      residual: 0,
      count: 0,
      buckets: emptyBuckets(),
    }
    acc.residual = Math.round((acc.residual + r.residual) * 100) / 100
    acc.count += 1
    acc.buckets[r.bucket] = Math.round((acc.buckets[r.bucket] + r.residual) * 100) / 100
    if (!acc.contoCodice && r.contoCodice) acc.contoCodice = r.contoCodice
    byContoMap.set(key, acc)
  }

  const byConto = [...byContoMap.values()].sort((a, b) =>
    str(a.contoCodice).localeCompare(str(b.contoCodice), 'it', { numeric: true })
    || str(a.contoId).localeCompare(str(b.contoId))
  )

  const residuoComplessivo = Math.round(
    openRows.reduce((s, r) => s + r.residual, 0) * 100,
  ) / 100

  if (excluded > 0) {
    warnings.push('Alcune partite sono escluse (chiuse, filtri tipo, oppure importi/tipo non validi).')
  }
  warnings.push('Aging da residui partitario aperti; coerenza attesa vs mastrini per conto cliente/fornitore.')

  return {
    valid: blockers.length === 0,
    definitive: false,
    kind: 'aging_insoluti',
    basis: 'partitario_da_prima_nota',
    asOf: asOfDay,
    period: {
      societaId: company,
      asOf: asOfDay,
      tipo: wantTipo || 'tutti',
    },
    blockers,
    warnings,
    rows: openRows,
    byConto,
    partiteIncluse: openRows.length,
    partiteEscluse: excluded,
    totali: {
      count: openRows.length,
      residuoComplessivo,
      byBucket,
    },
  }
}

/**
 * Coerenza aging vs mastrini / partitari.
 *
 * Modes:
 * - `partitario` (default): aging.residuoComplessivo ≈ partitari.totaleAperto
 *   + ogni partita aperta con primaNotaId ha movimento mastrini sul conto (apertura presente).
 * - `ledger`: |saldoMovimentiPeriodo| ≈ somma residui aging per conto (strict; fallisce se
 *   mastrini includono riaperture SP / movimenti non partitario).
 *
 * @param {ReturnType<typeof buildAgingInsolutiModel>} agingModel
 * @param {{ conti?: Array<object>, valid?: boolean }} mastriniModel
 * @param {object} [options]
 * @param {'partitario'|'ledger'} [options.mode='partitario']
 * @param {number} [options.toleranceCents=1]
 * @param {{ totali?: { residuoComplessivo?: number, totaleAperto?: number } }} [options.partitariModel]
 * @param {string[]} [options.contoIds] - se valorizzato, confronta solo questi conti (mode ledger)
 * @param {string[]} [options.requirePrimaNotaIds] - partite che devono matchare movimento mastrini
 */
export function checkAgingMastriniCoherence(agingModel, mastriniModel, {
  mode = 'partitario',
  toleranceCents = 1,
  partitariModel = null,
  contoIds = null,
  requirePrimaNotaIds = null,
} = {}) {
  const mismatches = []
  const compared = []
  const want = Array.isArray(contoIds) && contoIds.length
    ? new Set(contoIds.map((id) => str(id)).filter(Boolean))
    : null
  const requirePn = Array.isArray(requirePrimaNotaIds) && requirePrimaNotaIds.length
    ? new Set(requirePrimaNotaIds.map((id) => str(id)).filter(Boolean))
    : null

  const conti = Array.isArray(mastriniModel?.conti) ? mastriniModel.conti : []
  const byId = new Map()
  const movementIndex = new Map()
  for (const c of conti) {
    const id = str(c?.contoId)
    if (id) byId.set(id, c)
    for (const mov of c?.movimenti || []) {
      const pn = str(mov?.primaNotaId)
      if (!pn) continue
      const key = `${id}|${pn}`
      const prev = movementIndex.get(key) || { dare: 0, avere: 0 }
      prev.dare = Math.round((prev.dare + Number(mov.dare || 0)) * 100) / 100
      prev.avere = Math.round((prev.avere + Number(mov.avere || 0)) * 100) / 100
      movementIndex.set(key, prev)
    }
  }

  let partitariOk = null
  if (partitariModel?.totali) {
    const openPart = partitariModel.totali.totaleAperto
      ?? partitariModel.totali.residuoComplessivo
    const agingTot = agingModel?.totali?.residuoComplessivo
    if (openPart != null && agingTot != null) {
      const delta = Math.abs(Math.round(Number(openPart) * 100) - Math.round(Number(agingTot) * 100))
      partitariOk = delta <= toleranceCents
      if (!partitariOk) {
        mismatches.push({
          contoId: null,
          reason: 'aging_vs_partitari_residuo',
          agingResidual: agingTot,
          partitariAperto: openPart,
          deltaCents: delta,
        })
      }
    }
  }

  // Ogni partita aperta rilevante: apertura presente nei mastrini sul conto.
  for (const row of agingModel?.rows || []) {
    const pn = str(row?.primaNotaId)
    const contoId = str(row?.contoId)
    if (requirePn && !requirePn.has(pn)) continue
    if (!requirePn && want && contoId && !want.has(contoId)) continue
    if (!pn || !contoId) {
      if (requirePn) {
        mismatches.push({
          contoId: contoId || null,
          primaNotaId: pn || null,
          reason: 'aging_row_pn_o_conto_mancante',
          agingResidual: row?.residual ?? null,
        })
      }
      continue
    }
    const mov = movementIndex.get(`${contoId}|${pn}`)
    const net = mov ? Math.round((mov.dare - mov.avere) * 100) / 100 : null
    const entry = {
      contoId,
      primaNotaId: pn,
      doc: row.doc,
      agingResidual: row.residual,
      agingOriginal: row.original,
      mastriniNet: net,
      mastriniDare: mov?.dare ?? null,
      mastriniAvere: mov?.avere ?? null,
    }
    compared.push(entry)
    if (!mov) {
      mismatches.push({ ...entry, reason: 'mastrini_movimento_apertura_assente' })
      continue
    }
    // Apertura cliente tipicamente dare=originale; fornitore avere=originale.
    const absNet = Math.abs(net)
    const originalCents = Math.round(Number(row.original) * 100)
    const absNetCents = Math.round(absNet * 100)
    if (Math.abs(absNetCents - originalCents) > toleranceCents) {
      mismatches.push({
        ...entry,
        reason: 'mastrini_apertura_vs_originale',
        deltaCents: Math.abs(absNetCents - originalCents),
      })
    }
  }

  if (mode === 'ledger') {
    for (const row of agingModel?.byConto || []) {
      const id = str(row?.contoId)
      if (!id) {
        mismatches.push({
          contoId: null,
          reason: 'aging_conto_id_mancante',
          agingResidual: row?.residual ?? null,
          mastriniSaldoAbs: null,
        })
        continue
      }
      if (want && !want.has(id)) continue

      const m = byId.get(id)
      if (!m) {
        mismatches.push({
          contoId: id,
          reason: 'mastrini_conto_assente',
          agingResidual: row.residual,
          mastriniSaldoAbs: null,
        })
        continue
      }

      const agingCents = Math.round(Number(row.residual) * 100)
      const saldo = Number(m.saldoMovimentiPeriodo)
      const mastriniAbsCents = Math.round(Math.abs(saldo) * 100)
      const delta = Math.abs(agingCents - mastriniAbsCents)
      const entry = {
        contoId: id,
        contoCodice: row.contoCodice || m.codice || null,
        agingResidual: row.residual,
        mastriniSaldo: saldo,
        mastriniSaldoAbs: Math.round(mastriniAbsCents) / 100,
        deltaCents: delta,
      }
      compared.push(entry)
      if (delta > toleranceCents) {
        mismatches.push({
          ...entry,
          reason: 'residuo_vs_mastrini_delta',
        })
      }
    }
  }

  const coherent = mismatches.length === 0
    && (agingModel?.valid !== false)
    && (mastriniModel?.valid !== false)
    && (partitariModel == null || partitariOk === true)

  return {
    coherent,
    mode,
    compared,
    mismatches,
    partitariEquivalence: partitariOk,
    toleranceCents,
  }
}
