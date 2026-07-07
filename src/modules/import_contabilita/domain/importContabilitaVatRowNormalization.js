/**
 * Normalizzazione righe IVA Import — pruning placeholder 0/0 senza significato fiscale.
 */

function normalizeText(value) {
  return String(value || '').trim()
}

function roundAmount(value) {
  return Math.abs(Number(value ?? 0) || 0)
}

/**
 * Riga con natura/causale/regime compilati dall'operatore o dal tracciato.
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function hasImportVatRowFiscalSignificance(row) {
  if (!row || typeof row !== 'object') return false
  if (normalizeText(row?.causaleIvaId || row?.causale_iva_id)) return true
  if (normalizeText(row?.causaleIvaCode || row?.causale_iva_codice)) return true
  if (normalizeText(row?.natura ?? row?.nature)) return true
  if (normalizeText(row?.regime)) return true
  if (normalizeText(row?.codiceFiscale ?? row?.codice_fiscale)) return true
  if (row?.esente === true || row?.fuoriCampo === true) return true
  return false
}

/**
 * Placeholder: importi zero e nessun dato fiscale significativo.
 * @param {object|null|undefined} row
 * @returns {boolean}
 */
export function isEmptyImportVatRow(row) {
  if (!row || typeof row !== 'object') return true
  if (hasImportVatRowFiscalSignificance(row)) return false

  const imponibile = roundAmount(row?.imponibile ?? row?.taxable)
  const imposta = roundAmount(row?.imposta ?? row?.iva ?? row?.tax)
  const indetraibile = roundAmount(
    row?.indetraibileImposta ?? row?.indetraibileTax ?? row?.iva_indetraibile,
  )

  return imponibile === 0 && imposta === 0 && indetraibile === 0
}

/**
 * Rimuove righe IVA placeholder prima di validazione, preview e commit.
 * @param {Array<object>|null|undefined} rows
 * @returns {Array<object>}
 */
export function normalizeImportVatRows(rows) {
  const list = Array.isArray(rows) ? rows : []
  return list.filter((row) => !isEmptyImportVatRow(row))
}
