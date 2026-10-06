function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function getDocumentTotal(document) {
  return toNumber(document?.totals?.total ?? document?.totals?.gross ?? 0)
}

export function mapCommitPayloadToPartitario(normalized, ctx = {}) {
  const company = normalized?.company || {}
  const document = normalized?.document || {}
  const total = getDocumentTotal(document)
  const type = String(document?.type || '').toLowerCase().includes('attiva') ? 'cliente' : 'fornitore'

  return {
    societa_id: company.societaId || null,
    tipo: type,
    conto_id: document.counterparty?.accountId || null,
    conto_codice: document.counterparty?.accountCode || null,
    conto_descrizione: document.counterparty?.name || null,
    prima_nota_id: null,
    numero_documento: document.number || null,
    data_documento: document.documentDate || null,
    data_scadenza: document.dueDate || document.documentDate || null,
    importo_originale: total,
    importo_pagato: 0,
    importo_residuo: total,
    stato: 'aperta',
    chiusa_da_prima_nota_id: null,
    data_chiusura: null,
  }
}
