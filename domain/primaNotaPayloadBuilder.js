function toMoneyNumber(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function normalizeNullableString(v) {
  if (v == null || v === '') return null
  return String(v)
}

export function buildPrimaNotaHeaderPayload({
  societa_id,
  data_registrazione,
  data_documento,
  numero_documento,
  causale_id,
  causale_codice,
  descrizione,
  cliente_fornitore_id,
  cliente_fornitore_nome,
  totale_dare,
  totale_avere,
  progressivo,
  stato,
  documento_import_id,
  scope,
}) {
  const payload = {
    societa_id,
    data_registrazione,
    stato,
  }

  if (data_documento !== undefined) payload.data_documento = data_documento || null
  if (numero_documento !== undefined) payload.numero_documento = numero_documento || null
  if (causale_id !== undefined) payload.causale_id = causale_id || null
  if (causale_codice !== undefined) payload.causale_codice = causale_codice || null
  if (descrizione !== undefined) payload.descrizione = descrizione || ''
  if (cliente_fornitore_id !== undefined) payload.cliente_fornitore_id = cliente_fornitore_id || null
  if (cliente_fornitore_nome !== undefined) payload.cliente_fornitore_nome = cliente_fornitore_nome || ''
  if (totale_dare !== undefined) payload.totale_dare = toMoneyNumber(totale_dare)
  if (totale_avere !== undefined) payload.totale_avere = toMoneyNumber(totale_avere)
  if (progressivo !== undefined) payload.progressivo = progressivo ?? null
  if (documento_import_id !== undefined) payload.documento_import_id = documento_import_id || null
  if (scope !== undefined) payload.scope = scope || null

  return payload
}

export function buildPrimaNotaRighePayload(rows = [], { mapRow, filterRow } = {}) {
  const list = Array.isArray(rows) ? rows : []
  return list
    .filter((row, index) => (typeof filterRow === 'function' ? filterRow(row, index) : true))
    .map((row, index) => {
      const mapped = typeof mapRow === 'function' ? mapRow(row, index) : row
      return mapped ?? row
    })
}

export function buildPrimaNotaPartitarioPayload(entries = [], { mapEntry, filterEntry } = {}) {
  const list = Array.isArray(entries) ? entries : []
  return list
    .filter((entry, index) => (typeof filterEntry === 'function' ? filterEntry(entry, index) : true))
    .map((entry, index) => {
      const mapped = typeof mapEntry === 'function' ? mapEntry(entry, index) : entry
      return mapped ?? entry
    })
}

export function buildDocumentoContabilePrimaNotaPayload({
  doc,
  societaId,
  dataRegistrazione,
  causaleCodice,
  isPassiva,
  contoCostoRicavo,
  contoIva,
  contoControparte,
  stato = 'provvisoria',
}) {
  const pnPayload = buildPrimaNotaHeaderPayload({
    societa_id: societaId,
    data_registrazione: dataRegistrazione,
    data_documento: doc?.data_documento,
    numero_documento: doc?.numero_documento,
    causale_codice: causaleCodice || (isPassiva ? 'FF' : 'FC'),
    descrizione: `${isPassiva ? 'Fatt. passiva' : 'Fatt. attiva'} ${doc?.soggetto_denominazione || ''} n.${doc?.numero_documento || '?'}`,
    cliente_fornitore_nome: doc?.soggetto_denominazione,
    totale_dare: doc?.totale || 0,
    totale_avere: doc?.totale || 0,
    stato,
    documento_import_id: doc?.source_document_id || null,
  })

  const righe = []
  if (isPassiva) {
    righe.push({
      riga_numero: 1,
      conto_id: contoCostoRicavo?.id || null,
      conto_codice: contoCostoRicavo?.codice,
      conto_descrizione: contoCostoRicavo?.descrizione,
      descrizione_riga: 'Costo/Acquisto',
      importo_dare: doc?.imponibile || doc?.totale || 0,
      importo_avere: 0,
      imponibile: doc?.imponibile || 0,
      iva: 0,
    })
    if ((doc?.iva || 0) > 0) {
      righe.push({
        riga_numero: 2,
        conto_id: contoIva?.id || null,
        conto_codice: contoIva?.codice,
        conto_descrizione: contoIva?.descrizione || 'IVA ns. credito',
        descrizione_riga: 'IVA a credito',
        importo_dare: doc?.iva || 0,
        importo_avere: 0,
        imponibile: 0,
        iva: doc?.iva || 0,
      })
    }
    righe.push({
      riga_numero: 3,
      conto_id: contoControparte?.id || null,
      conto_codice: contoControparte?.codice,
      conto_descrizione: contoControparte?.descrizione || doc?.soggetto_denominazione,
      descrizione_riga: `Fornitore ${doc?.soggetto_denominazione || ''}`,
      importo_dare: 0,
      importo_avere: doc?.totale || 0,
      imponibile: 0,
      iva: 0,
    })
  } else {
    righe.push({
      riga_numero: 1,
      conto_id: contoControparte?.id || null,
      conto_codice: contoControparte?.codice,
      conto_descrizione: contoControparte?.descrizione || doc?.soggetto_denominazione,
      descrizione_riga: `Cliente ${doc?.soggetto_denominazione || ''}`,
      importo_dare: doc?.totale || 0,
      importo_avere: 0,
      imponibile: 0,
      iva: 0,
    })
    righe.push({
      riga_numero: 2,
      conto_id: contoCostoRicavo?.id || null,
      conto_codice: contoCostoRicavo?.codice,
      conto_descrizione: contoCostoRicavo?.descrizione,
      descrizione_riga: 'Ricavo/Vendita',
      importo_dare: 0,
      importo_avere: doc?.imponibile || doc?.totale || 0,
      imponibile: doc?.imponibile || 0,
      iva: 0,
    })
    if ((doc?.iva || 0) > 0) {
      righe.push({
        riga_numero: 3,
        conto_id: contoIva?.id || null,
        conto_codice: contoIva?.codice,
        conto_descrizione: contoIva?.descrizione || 'IVA ns. debito',
        descrizione_riga: 'IVA a debito',
        importo_dare: 0,
        importo_avere: doc?.iva || 0,
        imponibile: 0,
        iva: doc?.iva || 0,
      })
    }
  }

  return {
    pnPayload,
    righePayload: righe,
    partEntries: [],
  }
}

export function normalizePartitarioEntry({ documento_id, importo_chiuso }) {
  return {
    documento_id: normalizeNullableString(documento_id),
    importo_chiuso: toMoneyNumber(importo_chiuso),
  }
}

export function normalizeRigaForPrimaNotaPayload(r) {
  const out = {
    conto_id: r?.conto_id || null,
    descrizione: r?.descrizione || '',
    dare: toMoneyNumber(r?.dare),
    avere: toMoneyNumber(r?.avere),
  }
  if (r?.causale_iva_id) out.causale_iva_id = r.causale_iva_id
  return out
}

