export function getPrimaNotaStatoBadgeClass(stato) {
  return stato === 'definitiva' ? 'bdg-green' : 'bdg-gold'
}

export function getDocumentoTipoBadge(tipoDocumento) {
  const isAttiva = String(tipoDocumento || '').includes('attiva')
  return {
    className: isAttiva ? 'bdg-green' : 'bdg-gold',
    label: isAttiva ? '📤' : '📥',
  }
}

export function getContoLabelByTipoDocumento(tipoDocumento) {
  return String(tipoDocumento || '').includes('attiva') ? 'Cliente' : 'Fornitore/Costo'
}

export function mapScritturaRowForTrace(row, i) {
  return {
    i,
    id: row.id,
    causale_iva_codice: row.causale_iva_codice ?? null,
    causale_codice: row.causale_codice ?? null,
  }
}

export function getBankConnectionBadgeClass(stato) {
  return stato === 'linked' ? 'bdg-green' : stato === 'pending' ? 'bdg-gold' : 'bdg-red'
}

export function getRiconciliazioneBadgeClass(statoRiconciliazione) {
  return statoRiconciliazione === 'confermato'
    ? 'bdg-green'
    : statoRiconciliazione === 'proposto'
      ? 'bdg-cy'
      : 'bdg-gray'
}

export function getLiquidazioneBadgeClass(stato) {
  return stato === 'inviata' ? 'bdg-green' : stato === 'calcolata' ? 'bdg-blue' : 'bdg-gray'
}

export function getLipeBadgeClass(stato) {
  return stato === 'inviata' ? 'bdg-green' : 'bdg-blue'
}
