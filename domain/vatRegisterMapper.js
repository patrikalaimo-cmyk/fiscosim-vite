function toNumber(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function mapCommitPayloadToRegistriIva(normalized, ctx = {}) {
  const company = normalized?.company || {}
  const document = normalized?.document || {}
  const vatRows = Array.isArray(normalized?.vat?.rows) ? normalized.vat.rows : []
  const tipoDocumento = String(document?.type || '').toLowerCase()
  const tipo = tipoDocumento.includes('attiva') ? 'vendita' : 'acquisto'

  return vatRows.map((row, index) => {
    const imponibile = toNumber(row?.taxable ?? row?.imponibile)
    const iva = toNumber(row?.vat ?? row?.iva)
    return {
      societa_id: company.societaId || null,
      documento_id: document.id || document.number || null,
      accounting_entry_id: null,
      riga_idx: Number(row?.index ?? index),
      data: document.registrationDate || null,
      imponibile,
      iva,
      aliquota: row?.rate ?? row?.aliquota ?? null,
      tipo,
      detraibile: row?.detraibile !== false,
      percentuale_detraibilita: toNumber((row?.detraibilitaPercent ?? row?.percentuale_detraibilita) || 100),
      iva_detraibile: toNumber(row?.ivaDetraibile ?? iva),
      iva_indetraibile: toNumber(row?.ivaIndetraibile ?? 0),
      causale_iva_id: row?.causaleIvaId || null,
    }
  })
}
