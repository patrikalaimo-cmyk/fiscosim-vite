function text(value) {
  return String(value ?? '').trim()
}

export function buildRitenutaMaturazionePayload(ritenuta = {}) {
  return {
    id: text(ritenuta.ritenutaId || ritenuta.id),
    data_pagamento: text(ritenuta.dataPagamento) || null,
    data_scadenza: text(ritenuta.dataScadenza) || null,
    periodo_riferimento: text(ritenuta.periodoRiferimento) || null,
    anno_riferimento: Number(ritenuta.annoRiferimento) || null,
    codice_tributo: text(ritenuta.codiceTributo) || null,
    stato: 'da_versare',
    inclusa_cu: true,
  }
}
