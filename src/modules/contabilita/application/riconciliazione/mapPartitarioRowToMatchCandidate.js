/**
 * Map a live `partitario` row to the shape expected by bank matching engine.
 */
function text(value) {
  return String(value ?? '').trim()
}

function money(value) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0
}

export function mapPartitarioRowToMatchCandidate(row = {}) {
  const partitaId = text(row.id || row.partitaId || row.partita_id)
  if (!partitaId) return null

  const tipo = text(row.tipo || row.soggettoTipo || row.soggetto_tipo).toLowerCase()
  const soggettoTipo = ['cliente', 'fornitore', 'percipiente'].includes(tipo) ? tipo : 'cliente'

  const aperto = money(
    row.importo_residuo
      ?? row.importoAperto
      ?? row.importo_aperto
      ?? row.importo_originale
      ?? row.importoOriginario
      ?? 0,
  )
  if (!(aperto > 0)) return null

  return {
    partitaId,
    soggettoId: text(row.conto_id || row.soggettoId || row.soggetto_id),
    soggettoTipo,
    soggettoNome: text(
      row.controparte_nome
        || row.soggettoNome
        || row.soggetto_nome
        || row.cliente_fornitore_nome
        || row.descrizione
        || '',
    ),
    documentoId: text(row.documento_id || row.documentoId || row.prima_nota_id || ''),
    documentoTipo: text(row.documento_tipo || row.documentoTipo || ''),
    numeroDocumento: text(row.numero_documento || row.numeroDocumento || ''),
    dataDocumento: text(row.data_documento || row.dataDocumento || '').slice(0, 10),
    dataScadenza: text(row.data_scadenza || row.dataScadenza || '').slice(0, 10),
    importoOriginario: money(row.importo_originale ?? row.importoOriginario ?? aperto),
    importoAperto: aperto,
    contoPatrimonialeId: text(row.conto_id || row.contoPatrimonialeId || ''),
    contoPatrimonialeCodice: text(row.conto_codice || row.contoPatrimonialeCodice || ''),
    contoPatrimonialeDescrizione: text(row.conto_descrizione || row.contoPatrimonialeDescrizione || ''),
    causaleOrigine: text(row.causale || row.causaleOrigine || ''),
    ivaPerCassa: Boolean(row.iva_per_cassa ?? row.ivaPerCassa),
    ritenuta: Boolean(row.ritenuta),
    statoPartita: text(row.stato || row.statoPartita || 'aperta') || 'aperta',
  }
}

export function mapPartitarioRowsToMatchCandidates(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map(mapPartitarioRowToMatchCandidate)
    .filter(Boolean)
}

/**
 * Build matcher movement input from a working-table / statement row.
 */
export function buildMatcherMovementFromWorkingRow(row = {}, bankStatement = null) {
  const amount = Math.abs(Number(row.amount ?? row.entrata ?? row.uscita ?? 0) || 0)
  const direction = text(row.direction)
    || (Number(row.entrata || 0) > 0 ? 'in' : 'out')
  const descriptionRaw = text(
    row.description
      || row.detail?.movement?.descriptionRaw
      || row.descriptionRaw
      || '',
  )
  return {
    movementId: text(row.id || row.movementId),
    bankAccountId: text(bankStatement?.bankAccountId || bankStatement?.selectedAccountMeta?.id || ''),
    operationDate: text(row.dateOp || row.operationDate || row.detail?.movement?.operationDate || '').slice(0, 10),
    valueDate: text(row.dateVal || row.valueDate || row.detail?.movement?.valueDate || '').slice(0, 10),
    direction: direction === 'in' || direction === 'out' ? direction : 'in',
    amount,
    descriptionRaw,
    descriptionNormalized: descriptionRaw.toLowerCase(),
    counterpartyName: text(row.counterparty || row.counterpartyName || row.detail?.movement?.counterparty || ''),
    counterpartyIban: text(row.iban || row.counterpartyIban || row.detail?.movement?.iban || ''),
    bankCausal: text(row.match || row.bankCausal || row.detail?.movement?.bankCausal || ''),
    sourceStatementId: text(bankStatement?.sourceFileHash || bankStatement?.sourceFileName || ''),
    status: 'imported',
  }
}
