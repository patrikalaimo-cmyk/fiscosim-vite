import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function buildCounterpartyLookup(pianoConti = []) {
  const map = new Map()
  for (const conto of Array.isArray(pianoConti) ? pianoConti : []) {
    const id = normalizeText(conto?.id)
    if (!id || map.has(id)) continue
    map.set(id, {
      codice: normalizeText(conto?.codice || ''),
      descrizione: normalizeText(conto?.descrizione || conto?.ragione_sociale || ''),
      nome: normalizeText(`${conto?.nome || ''} ${conto?.cognome || ''}`),
    })
  }
  return map
}

function resolveCounterpartyLabel(row, lookup) {
  const id = normalizeText(row?.cliente_fornitore_id)
  const entry = lookup.get(id) || null
  const nome = normalizeText(row?.cliente_fornitore_nome || entry?.descrizione || entry?.nome || '')
  const codice = normalizeText(entry?.codice || '')
  return { id: id || null, nome, codice }
}

function normalizeListRow(row, lookup) {
  const counterparty = resolveCounterpartyLabel(row, lookup)
  const totaleDare = round2(row?.totale_dare ?? 0)
  const totaleAvere = round2(row?.totale_avere ?? 0)
  const saldo = round2(row?.saldo ?? (totaleDare - totaleAvere))
  const quadraturaBilanciata = Boolean(row?.quadratura_bilanciata ?? (Math.abs(totaleDare - totaleAvere) <= 0.01))

  return {
    id: normalizeText(row?.id || ''),
    primaNotaId: normalizeText(row?.prima_nota_id || row?.id || ''),
    documentoContabilitaId: normalizeText(row?.documento_contabilita_id || ''),
    societaId: normalizeText(row?.societa_id || ''),
    numeroRegistrazione: Number(row?.numero_registrazione || 0) || null,
    dataRegistrazione: normalizeText(row?.data_registrazione || ''),
    dataDocumento: normalizeText(row?.data_documento || ''),
    numeroDocumento: normalizeText(row?.numero_documento || ''),
    causaleCodice: normalizeText(row?.causale_codice || ''),
    causaleIvaCodice: normalizeText(row?.causale_iva_codice || ''),
    descrizione: normalizeText(row?.descrizione || ''),
    clienteFornitoreId: counterparty.id,
    clienteFornitoreNome: counterparty.nome,
    clienteFornitoreCodice: counterparty.codice,
    totaleDare,
    totaleAvere,
    stato: normalizeText(row?.stato || (quadraturaBilanciata ? 'quadrata' : 'da verificare')),
    statoQuadratura: normalizeText(row?.stato_quadratura || (quadraturaBilanciata ? 'quadrata' : 'da verificare')),
    quadraturaBilanciata,
    saldo,
    createdAt: normalizeText(row?.created_at || ''),
    docCreatedAt: normalizeText(row?._doc_created_at || ''),
    hasPrimaNotaHeader: Boolean(row?.has_prima_nota_header ?? row?.hasPrimaNotaHeader ?? false),
    numero_registrazione: Number(row?.numero_registrazione || 0) || null,
    data_registrazione: normalizeText(row?.data_registrazione || ''),
    data_documento: normalizeText(row?.data_documento || ''),
    numero_documento: normalizeText(row?.numero_documento || ''),
    causale_codice: normalizeText(row?.causale_codice || ''),
    causale_iva_codice: normalizeText(row?.causale_iva_codice || ''),
    cliente_fornitore_id: counterparty.id,
    cliente_fornitore_nome: counterparty.nome,
    totale_dare: totaleDare,
    totale_avere: totaleAvere,
    stato_quadratura: normalizeText(row?.stato_quadratura || (quadraturaBilanciata ? 'quadrata' : 'da verificare')),
  }
}

export function buildPrimaNotaListViewModel(rows = [], { pianoConti = [] } = {}) {
  const lookup = buildCounterpartyLookup(pianoConti)
  const normalizedRows = (Array.isArray(rows) ? rows : []).map((row) => normalizeListRow(row, lookup))
  const totals = normalizedRows.reduce((acc, row) => {
    acc.dare = round2(acc.dare + row.totaleDare)
    acc.avere = round2(acc.avere + row.totaleAvere)
    return acc
  }, { dare: 0, avere: 0 })

  return {
    rows: normalizedRows,
    count: normalizedRows.length,
    totals,
    hasLimitWarning: normalizedRows.length >= 500,
  }
}
