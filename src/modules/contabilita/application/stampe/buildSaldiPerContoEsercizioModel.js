// Saldi di movimentazione e progressivi infrannuali derivati da PN canonica.
// NON certifica riaperture, saldi da esercizi precedenti o snapshot transazionali.
import { buildMovimentiPerContoModel } from './buildMovimentiPerContoModel.js'

const DAY = /^\d{4}-\d{2}-\d{2}$/
const text = (v) => String(v ?? '').trim()
const cent = (v) => Math.round(Number(v) * 100)
const euro = (v) => v / 100

function isDate(value) {
  if (!DAY.test(value)) return false
  const d = new Date(value + 'T00:00:00.000Z')
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

function add(blockers, code) {
  if (!blockers.includes(code)) blockers.push(code)
}

export function buildSaldiPerContoEsercizioModel(entries = [], pianoConti = [], {
  societaId,
  esercizioInizio,
  periodoInizio,
  periodoFine,
} = {}) {
  const company = text(societaId)
  const exerciseStart = text(esercizioInizio)
  const start = text(periodoInizio)
  const end = text(periodoFine)
  const blockers = []
  // Finche il workflow di esercizi non e verificato, il contratto limita il
  // prospetto a un unico anno solare. Non trascina implicitamente saldi esterni.
  const datesOk = [exerciseStart, start, end].every(isDate)
    && exerciseStart <= start && start <= end
    && exerciseStart.endsWith('-01-01')
    && exerciseStart.slice(0, 4) === end.slice(0, 4)
  if (!datesOk) add(blockers, 'esercizio_o_periodo_non_valido')
  if (!Array.isArray(pianoConti) || pianoConti.length === 0) {
    add(blockers, 'piano_conti_mancante')
  }
  const base = buildMovimentiPerContoModel(entries, {
    societaId: company,
    periodoInizio: exerciseStart,
    periodoFine: end,
  })
  for (const code of base.blockers) add(blockers, code)

  const byId = new Map()
  const byCode = new Map()
  const chart = Array.isArray(pianoConti) ? pianoConti : []
  for (const conto of chart) {
    const id = text(conto?.id)
    const code = text(conto?.codice)
    const tipo = text(conto?.tipo).toLowerCase()
    const natura = text(conto?.natura).toLowerCase()
    if (!id || !code || text(conto?.societa_id) !== company) {
      add(blockers, 'piano_conti_identita_non_coerente')
      continue
    }
    if (byId.has(id) || byCode.has(code)) {
      add(blockers, 'piano_conti_duplicato')
      continue
    }
    if (!['patrimoniale', 'economico'].includes(tipo)
      || (tipo === 'patrimoniale' && !['attivo', 'passivo'].includes(natura))
      || (tipo === 'economico' && !['costo', 'ricavo'].includes(natura))) {
      add(blockers, 'classificazione_conto_non_valida')
    }
    const normalized = {
      id, codice: code, descrizione: text(conto.descrizione),
      tipo, natura, parentId: text(conto.parent_id) || null,
      // saldi_iniziali eventualmente presenti su piano_conti NON sono una
      // prova di riapertura e non devono entrare nel computo.
    }
    byId.set(id, normalized)
    byCode.set(code, normalized)
  }

  const parentIds = new Set()
  for (const conto of byId.values()) {
    if (!conto.parentId) continue
    if (!byId.has(conto.parentId)) add(blockers, 'piano_conti_gerarchia_incompleta')
    if (conto.parentId === conto.id) add(blockers, 'piano_conti_gerarchia_ciclica')
    parentIds.add(conto.parentId)
  }

  for (const conto of byId.values()) {
    const seen = new Set()
    let next = conto
    while (next) {
      if (seen.has(next.id)) {
        add(blockers, 'piano_conti_gerarchia_ciclica')
        break
      }
      seen.add(next.id)
      next = next.parentId ? byId.get(next.parentId) : null
    }
  }

  const resultRows = new Map()
  for (const conto of byId.values()) {
    if (parentIds.has(conto.id)) continue
    resultRows.set(conto.id, {
      contoId: conto.id, codice: conto.codice, descrizione: conto.descrizione,
      tipo: conto.tipo, natura: conto.natura, parentId: conto.parentId,
      _openingD: 0, _openingA: 0, _periodD: 0, _periodA: 0,
      movimenti: [],
    })
  }
  const seenEntries = Array.isArray(entries) ? entries : []
  for (const pn of seenEntries) {
    if (pn?.data_registrazione && !isDate(text(pn.data_registrazione).slice(0, 10))) {
      add(blockers, 'data_prima_nota_non_valida')
    }
    if (pn?.esercizio != null && text(pn.esercizio) !== exerciseStart.slice(0, 4)) {
      add(blockers, 'esercizio_prima_nota_non_coerente')
    }
  }

  for (const movementAccount of base.conti) {
    const matching = movementAccount.contoId
      ? byId.get(movementAccount.contoId)
      : byCode.get(text(movementAccount.codice))
    if (!matching) {
      add(blockers, 'conto_movimentato_assente_da_piano_conti')
      continue
    }
    if (movementAccount.codice && movementAccount.codice !== matching.codice) {
      add(blockers, 'codice_conto_non_coerente')
    }
    const row = resultRows.get(matching.id)
    if (!row) {
      add(blockers, 'conto_non_foglia_movimentato')
      continue
    }
    for (const movement of movementAccount.movimenti) {
      const dare = cent(movement.dare)
      const avere = cent(movement.avere)
      if (!Number.isSafeInteger(dare) || !Number.isSafeInteger(avere)) {
        add(blockers, 'importo_movimento_non_sicuro')
        continue
      }
      if (movement.dataRegistrazione < start) {
        row._openingD += dare
        row._openingA += avere
      } else {
        row._periodD += dare
        row._periodA += avere
        row.movimenti.push({
          ...movement,
          saldoProgressivo: euro(row._openingD - row._openingA
            + row._periodD - row._periodA),
        })
      }
    }
  }

  const totals = {
    precedenteDare: 0, precedenteAvere: 0,
    dare: 0, avere: 0, saldoDare: 0, saldoAvere: 0,
  }
  const conti = [...resultRows.values()].sort((a, b) =>
    a.codice.localeCompare(b.codice, 'it', { numeric: true })
  ).map((a) => {
    const prior = a._openingD - a._openingA
    const period = a._periodD - a._periodA
    const finish = prior + period
    totals.precedenteDare += a._openingD
    totals.precedenteAvere += a._openingA
    totals.dare += a._periodD
    totals.avere += a._periodA
    totals.saldoDare += Math.max(finish, 0)
    totals.saldoAvere += Math.max(-finish, 0)
    return {
      contoId: a.contoId, codice: a.codice, descrizione: a.descrizione,
      tipo: a.tipo, natura: a.natura, parentId: a.parentId,
      saldoPrecedente: euro(prior),
      dare: euro(a._periodD), avere: euro(a._periodA),
      saldoFinale: euro(finish),
      saldoDare: euro(Math.max(finish, 0)),
      saldoAvere: euro(Math.max(-finish, 0)),
      movimenti: a.movimenti,
    }
  })

  if (totals.precedenteDare !== totals.precedenteAvere
    || totals.dare !== totals.avere
    || totals.saldoDare !== totals.saldoAvere) {
    add(blockers, 'saldi_esercizio_non_quadrati')
  }
  if (Object.values(totals).some(v => !Number.isSafeInteger(v))) {
    add(blockers, 'totali_esercizio_non_sicuri')
  }
  return {
    valid: blockers.length === 0,
    definitive: false,
    kind: 'saldi_infrannuali_per_conto',
    basis: 'prima_nota_canonica',
    period: { societaId: company, esercizioInizio: exerciseStart, inizio: start, fine: end },
    blockers,
    warnings: [
      'Il saldo precedente deriva soltanto dai movimenti canonici dall’inizio dell’esercizio.',
      'Riapertura conti da esercizi precedenti, completezza delle letture e snapshot coerente non verificati: bilancio definitivo non disponibile.',
      ...base.warnings.filter(x => !x.startsWith('Saldi riferiti ai soli movimenti')),
    ],
    primaNotaIncluse: base.primaNotaIncluse,
    primaNotaEscluse: base.primaNotaEscluse,
    conti,
    totali: {
      ...Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, euro(v)])),
      quadrato: totals.precedenteDare === totals.precedenteAvere
        && totals.dare === totals.avere
        && totals.saldoDare === totals.saldoAvere,
    },
  }
}
