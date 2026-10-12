// Prospetto partitari clienti/fornitori da righe DB `partitario`.
// Anteprima interrogabile (non stampa definitiva / fascicolo).

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

/**
 * @param {Array<object>} rows - righe `partitario` (select *)
 * @param {object} options
 * @param {string} options.societaId
 * @param {string} [options.tipo] - clienti|fornitori|percipienti|tutti|cliente|fornitore|…
 * @param {string} [options.stato] - aperta|parziale|chiusa|tutti
 * @param {string} [options.periodoInizio] - YYYY-MM-DD (filtra data_documento, fallback data_scadenza)
 * @param {string} [options.periodoFine]
 */
export function buildPartitariStampaModel(rows = [], {
  societaId,
  tipo = 'tutti',
  stato = 'tutti',
  periodoInizio,
  periodoFine,
} = {}) {
  const blockers = []
  const warnings = []
  const company = str(societaId)
  const start = str(periodoInizio)
  const end = str(periodoFine)
  const tipoFilter = str(tipo).toLowerCase()
  const statoFilter = str(stato).toLowerCase()
  const wantTipo = (!tipoFilter || tipoFilter === 'tutti')
    ? null
    : normalizeTipo(tipoFilter)
  const wantStato = (!statoFilter || statoFilter === 'tutti')
    ? null
    : (VALID_STATI.has(statoFilter) ? statoFilter : null)

  if (!company) addBlocker(blockers, 'societa_id_mancante')
  if (start && !DATE.test(start)) addBlocker(blockers, 'periodo_non_valido')
  if (end && !DATE.test(end)) addBlocker(blockers, 'periodo_non_valido')
  if (DATE.test(start) && DATE.test(end) && start > end) addBlocker(blockers, 'periodo_non_valido')
  if (tipoFilter && tipoFilter !== 'tutti' && !wantTipo) addBlocker(blockers, 'tipo_soggetto_non_valido')
  if (statoFilter && statoFilter !== 'tutti' && !wantStato) addBlocker(blockers, 'stato_partita_non_valido')
  if (!Array.isArray(rows)) addBlocker(blockers, 'partitario_input_non_valido')

  const list = Array.isArray(rows) ? rows : []
  const seen = new Set()
  const printable = []
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
    // Righe anomale (segni negativi / saldi incoerenti) non abortiscono il prospetto:
    // restano escluse e segnalate, cosi l'anteprima resta interrogabile.
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

    const state = normalizeStato(row?.stato, residual)
    if (!state) {
      excluded += 1
      continue
    }

    const docDate = day(row?.data_documento)
    const dueDate = day(row?.data_scadenza)
    const periodAnchor = docDate || dueDate
    if ((start || end) && !periodAnchor) {
      excluded += 1
      continue
    }
    if (DATE.test(start) && periodAnchor && periodAnchor < start) {
      excluded += 1
      continue
    }
    if (DATE.test(end) && periodAnchor && periodAnchor > end) {
      excluded += 1
      continue
    }
    if (wantTipo && type !== wantTipo) {
      excluded += 1
      continue
    }
    if (wantStato && state !== wantStato) {
      excluded += 1
      continue
    }

    const subject = str(row?.controparte_nome)
      || str(row?.conto_descrizione)
      || '—'
    const doc = str(row?.numero_documento) || '—'

    printable.push({
      id,
      subject,
      type,
      doc,
      date: docDate || null,
      due: dueDate || null,
      original,
      paid,
      residual,
      state,
      pn_ap: str(row?.prima_nota_id) || '—',
      pn_ch: str(row?.chiusa_da_prima_nota_id) || '—',
      contoId: str(row?.conto_id) || null,
      contoCodice: str(row?.conto_codice) || null,
      primaNotaId: str(row?.prima_nota_id) || null,
    })
  }

  printable.sort((a, b) =>
    str(a.date).localeCompare(str(b.date))
    || str(a.subject).localeCompare(str(b.subject), 'it')
    || str(a.id).localeCompare(str(b.id))
  )

  const openRows = printable.filter((r) => r.residual > 0.01)
  const closedRows = printable.filter((r) => r.residual <= 0.01)
  const totaleAperto = openRows.reduce((s, r) => s + r.residual, 0)
  const totaleChiuso = closedRows.reduce((s, r) => s + r.paid, 0)
  const residuoComplessivo = printable.reduce((s, r) => s + r.residual, 0)

  if (excluded > 0) {
    warnings.push('Alcune partite sono escluse (filtri tipo/stato/periodo oppure importi/tipo non validi).')
  }
  warnings.push('Anteprima da tabella partitario collegata a Prima Nota; non costituisce stampa definitiva.')

  return {
    valid: blockers.length === 0,
    definitive: false,
    kind: 'partitari_clienti_fornitori',
    basis: 'partitario_da_prima_nota',
    period: {
      societaId: company,
      inizio: DATE.test(start) ? start : '',
      fine: DATE.test(end) ? end : '',
      tipo: wantTipo || 'tutti',
      stato: wantStato || 'tutti',
    },
    blockers,
    warnings,
    rows: printable,
    partiteIncluse: printable.length,
    partiteEscluse: excluded,
    totali: {
      aperte: openRows.length,
      chiuse: closedRows.length,
      totaleAperto: Math.round(totaleAperto * 100) / 100,
      totaleChiuso: Math.round(totaleChiuso * 100) / 100,
      residuoComplessivo: Math.round(residuoComplessivo * 100) / 100,
      count: printable.length,
    },
  }
}

/** Tipi stampa con anteprima operativa (non fac-simile). */
export const STAMPE_OPERATIVE_TYPES = [
  'registri_iva',
  'giornale',
  'liquidazione_iva_periodica',
  'partitari',
  'mastrini',
  'bilancio',
  'fascicolo',
]

export function isStampaOperativa(tipoStampa) {
  return STAMPE_OPERATIVE_TYPES.includes(String(tipoStampa || ''))
}
