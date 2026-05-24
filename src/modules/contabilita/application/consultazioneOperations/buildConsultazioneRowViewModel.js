function num(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function trim(value) {
  return String(value ?? '').trim()
}

function pickPrimaNota(row = {}) {
  return row.prima_nota || row.primaNota || {}
}

export function buildConsultazioneRowViewModel(row = {}, index = 0) {
  const pn = pickPrimaNota(row)
  const dare = num(row.importo_dare ?? row.dare)
  const avere = num(row.importo_avere ?? row.avere)
  const totaleDare = num(pn.totale_dare)
  const totaleAvere = num(pn.totale_avere)
  const quadrata = Math.abs(totaleDare - totaleAvere) < 0.005
  const numeroRegistrazione = String(pn.numero_registrazione ?? row.numero_registrazione ?? '')
  const dataRegistrazione = String(pn.data_registrazione ?? row.data_registrazione ?? '')
  const dataDocumento = String(pn.data_documento ?? row.data_documento ?? '')
  const numeroDocumento = String(pn.numero_documento ?? row.numero_documento ?? '')
  const contoCodice = String(row.conto_codice ?? '')
  const contoDescrizione = String(row.conto_descrizione ?? '')
  const descrizioneRiga = String(row.descrizione_riga ?? '')
  const causaleContabile = String(pn.causale_codice ?? row.causale_codice ?? '')
  const causaleIva = String(pn.causale_iva_codice ?? row.causale_iva_codice ?? '')
  const soggetto = trim(pn.cliente_fornitore_nome || row.controparte || row.soggetto || '')

  return {
    id: String(row.id ?? `${pn.id || 'pn'}-${index}`),
    rowId: String(row.id ?? ''),
    primaNotaId: String(pn.id ?? row.prima_nota_id ?? ''),
    rigaNumero: Number(row.riga_numero || index + 1),
    numeroRegistrazione,
    dataRegistrazione,
    dataDocumento,
    numeroDocumento,
    contoId: String(row.conto_id ?? ''),
    contoCodice,
    contoDescrizione,
    descrizioneRiga,
    descrizione: descrizioneRiga || contoDescrizione || numeroDocumento || '—',
    causaleContabile,
    causaleIva,
    dare,
    avere,
    saldoRiga: Math.round((dare - avere) * 100) / 100,
    saldoProgressivo: 0,
    soggetto,
    statoQuadratura: quadrata ? 'quadrata' : 'non_quadrata',
    registroIva: String(pn.registro_iva_codice ?? row.registro_iva_codice ?? ''),
    protocolloIva: String(pn.protocollo_iva ?? row.protocollo_iva ?? ''),
    contoSearch: `${contoCodice} ${contoDescrizione}`.trim(),
    textSearch: [
      numeroRegistrazione,
      dataRegistrazione,
      dataDocumento,
      numeroDocumento,
      contoCodice,
      contoDescrizione,
      descrizioneRiga,
      causaleContabile,
      causaleIva,
      soggetto,
      String(row.tipo_riga_auto ?? ''),
    ]
      .join(' ')
      .toLowerCase(),
    raw: row,
  }
}
