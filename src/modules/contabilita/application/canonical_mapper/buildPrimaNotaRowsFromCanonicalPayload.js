import { buildPrimaNotaRighePayload, normalizeRigaForPrimaNotaPayload } from '../../../../../domain/primaNotaPayloadBuilder.js'

export function buildPrimaNotaRowsFromCanonicalPayload(normalized = {}) {
  const accountingRows = Array.isArray(normalized?.accounting?.rows) ? normalized.accounting.rows : []
  return buildPrimaNotaRighePayload(accountingRows, {
    mapRow: (row, index) => ({
      riga_numero: Number(row?.riga_numero || index + 1),
      ...normalizeRigaForPrimaNotaPayload({
        conto_id: row?.accountId || row?.conto_id || null,
        descrizione: row?.description || row?.descrizione || row?.descrizione_riga || '',
        dare: row?.debit ?? row?.dare ?? row?.importo_dare ?? 0,
        avere: row?.credit ?? row?.avere ?? row?.importo_avere ?? 0,
        causale_iva_id: row?.causaleIvaId || row?.causale_iva_id || null,
      }),
    }),
  })
}
