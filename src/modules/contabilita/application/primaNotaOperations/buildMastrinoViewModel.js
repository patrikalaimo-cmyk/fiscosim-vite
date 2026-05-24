import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function normalizeMastrinoRow(row = {}) {
  const header = row?.prima_nota && typeof row.prima_nota === 'object' ? row.prima_nota : {}
  return {
    id: normalizeText(row?.id || ''),
    prima_nota_id: normalizeText(row?.prima_nota_id || header?.id || ''),
    data_registrazione: normalizeText(header?.data_registrazione || row?.data_registrazione || ''),
    numero_registrazione: Number(header?.numero_registrazione || row?.numero_registrazione || 0) || null,
    numero_documento: normalizeText(header?.numero_documento || row?.numero_documento || ''),
    causale_codice: normalizeText(header?.causale_codice || row?.causale_codice || ''),
    descrizione: normalizeText(row?.descrizione_riga || header?.descrizione || row?.descrizione || ''),
    conto_id: normalizeText(row?.conto_id || ''),
    conto_codice: normalizeText(row?.conto_codice || ''),
    conto_descrizione: normalizeText(row?.conto_descrizione || ''),
    dare: round2(row?.dare ?? row?.importo_dare ?? 0),
    avere: round2(row?.avere ?? row?.importo_avere ?? 0),
    causale_iva_codice: normalizeText(row?.causale_iva_codice || header?.causale_iva_codice || ''),
  }
}

export function buildMastrinoViewModel(rows = [], { contoId = '', contoDescrizione = '', contoCodice = '' } = {}) {
  const normalizedRows = (Array.isArray(rows) ? rows : [])
    .map(normalizeMastrinoRow)
    .filter((row) => !contoId || row.conto_id === contoId)
    .sort((a, b) => {
      const da = String(a.data_registrazione || '')
      const db = String(b.data_registrazione || '')
      if (da !== db) return da.localeCompare(db)
      const na = Number(a.numero_registrazione || 0)
      const nb = Number(b.numero_registrazione || 0)
      if (na !== nb) return na - nb
      const ra = Number(a.id || 0)
      const rb = Number(b.id || 0)
      return String(ra).localeCompare(String(rb))
    })

  let saldoProgressivo = 0
  const entries = normalizedRows.map((row) => {
    saldoProgressivo = round2(saldoProgressivo + row.dare - row.avere)
    return {
      ...row,
      saldoProgressivo,
    }
  })

  const totals = entries.reduce((acc, row) => {
    acc.dare = round2(acc.dare + row.dare)
    acc.avere = round2(acc.avere + row.avere)
    return acc
  }, { dare: 0, avere: 0 })

  return {
    contoId: normalizeText(contoId || ''),
    contoDescrizione: normalizeText(contoDescrizione || ''),
    contoCodice: normalizeText(contoCodice || ''),
    entries,
    totals,
    saldoFinale: saldoProgressivo,
    isBalanced: Math.abs(round2(totals.dare - totals.avere)) <= 0.01,
  }
}
