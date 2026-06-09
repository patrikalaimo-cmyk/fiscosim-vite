function text(value) {
  return String(value ?? '').trim()
}

function amount(value) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0
}

export function buildRitenutaPersistencePayload(ritenuta = {}, pnPayload = {}) {
  return {
    societa_id: pnPayload.societa_id || null,
    percipiente_id: text(ritenuta.percipienteId || ritenuta.percipienteRecord?.id) || null,
    percipiente_cf: text(ritenuta.codiceFiscale || ritenuta.percipienteRecord?.codice_fiscale),
    percipiente_denominazione: text(ritenuta.percipiente || ritenuta.percipienteNome),
    data_pagamento: text(ritenuta.mode) === 'pagamento'
      ? text(ritenuta.dataPagamento || pnPayload.data_registrazione) || null
      : null,
    data_documento: text(ritenuta.dataDocumento || pnPayload.data_documento) || null,
    numero_documento: text(ritenuta.numeroDocumento || pnPayload.numero_documento) || null,
    compenso_lordo: amount(ritenuta.importoCompenso),
    imponibile_ritenuta: amount(ritenuta.baseRitenuta || ritenuta.baseImponibile),
    aliquota_ritenuta: amount(ritenuta.aliquotaRitenuta),
    ritenuta: amount(ritenuta.ritenuta),
    importo_ritenuta: amount(ritenuta.ritenuta),
    compenso_netto: amount(ritenuta.netto),
    contributo_cassa_prev: amount(ritenuta.importoCassa),
    causale: text(ritenuta.causaleCu || ritenuta.causaleReddituale),
    causale_prestazione: text(ritenuta.causaleCu || ritenuta.causaleReddituale),
    codice_tributo: text(ritenuta.codiceTributo) || '1040',
    data_scadenza: text(ritenuta.dataScadenza) || null,
    periodo_riferimento: text(ritenuta.periodoRiferimento) || null,
    anno_riferimento: Number(ritenuta.annoRiferimento) || null,
    stato: text(ritenuta.statoVersamento) || 'aperta',
    inclusa_cu: text(ritenuta.mode) === 'pagamento' && !ritenuta.escludiDaCu,
    note: text(ritenuta.note) || null,
  }
}
