import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function normalizeDetailRow(row) {
  return {
    id: normalizeText(row?.id || ''),
    riga_numero: Number(row?.riga_numero || 0) || null,
    prima_nota_id: normalizeText(row?.prima_nota_id || ''),
    conto_id: normalizeText(row?.conto_id || ''),
    conto_codice: normalizeText(row?.conto_codice || ''),
    conto_descrizione: normalizeText(row?.conto_descrizione || ''),
    descrizione_riga: normalizeText(row?.descrizione_riga || ''),
    importo_dare: round2(row?.importo_dare ?? row?.dare ?? 0),
    importo_avere: round2(row?.importo_avere ?? row?.avere ?? 0),
    causale_iva_codice: normalizeText(row?.causale_iva_codice || ''),
  }
}

function normalizeDetailHeader(header = {}, rows = []) {
  const normalizedRows = Array.isArray(rows) ? rows.map(normalizeDetailRow) : []
  const totals = normalizedRows.reduce((acc, row) => {
    acc.dare = round2(acc.dare + row.importo_dare)
    acc.avere = round2(acc.avere + row.importo_avere)
    return acc
  }, { dare: 0, avere: 0 })
  const headerDare = round2(header?.totale_dare ?? totals.dare)
  const headerAvere = round2(header?.totale_avere ?? totals.avere)
  const delta = round2(headerDare - headerAvere)
  const balanced = Math.abs(delta) <= 0.01 && Math.abs(totals.dare - totals.avere) <= 0.01

  return {
    id: normalizeText(header?.id || ''),
    societa_id: normalizeText(header?.societa_id || ''),
    numero_registrazione: Number(header?.numero_registrazione || 0) || null,
    data_registrazione: normalizeText(header?.data_registrazione || ''),
    data_documento: normalizeText(header?.data_documento || ''),
    numero_documento: normalizeText(header?.numero_documento || ''),
    causale_codice: normalizeText(header?.causale_codice || ''),
    causale_iva_codice: normalizeText(header?.causale_iva_codice || ''),
    descrizione: normalizeText(header?.descrizione || ''),
    cliente_fornitore_id: normalizeText(header?.cliente_fornitore_id || ''),
    cliente_fornitore_nome: normalizeText(header?.cliente_fornitore_nome || ''),
    totale_dare: headerDare,
    totale_avere: headerAvere,
    stato: normalizeText(header?.stato || (balanced ? 'quadrata' : 'da verificare')),
    statoQuadratura: normalizeText(header?.stato_quadratura || (balanced ? 'quadrata' : 'da verificare')),
    quadraturaBilanciata: balanced,
    saldo: round2(header?.saldo ?? delta),
    created_at: normalizeText(header?.created_at || ''),
  }
}

export function buildPrimaNotaDetailViewModel({ scrittura = null, righe = [] } = {}) {
  const header = normalizeDetailHeader(scrittura || {}, righe)
  const rows = Array.isArray(righe) ? righe.map(normalizeDetailRow) : []

  return {
    scrittura: header,
    righe: rows,
    totals: {
      dare: round2(rows.reduce((sum, row) => sum + row.importo_dare, 0)),
      avere: round2(rows.reduce((sum, row) => sum + row.importo_avere, 0)),
      isBalanced: header.quadraturaBilanciata,
    },
  }
}
