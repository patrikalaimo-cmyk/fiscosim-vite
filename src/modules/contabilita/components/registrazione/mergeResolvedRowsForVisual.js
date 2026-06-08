function isOrdinaryVatRow(row = {}) {
  const role = String(row?.ruolo || row?.templateRole || '').toLowerCase()
  const textBlob = [
    row?.contoQuery,
    row?.conto_descrizione,
    row?.conto_codice,
    row?.descrizione_riga,
    row?.descrizione,
    row?.source,
    row?.templateSource,
  ]
    .filter(Boolean)
    .map((value) => String(value).toLowerCase())
    .join(' ')

  return (
    role === 'iva' ||
    role === 'iva_ns.debito' ||
    role === 'iva_nsdebito' ||
    role === 'iva_debito' ||
    role === 'iva_debito_ordinaria' ||
    role === 'iva_ordinaria' ||
    role === 'iva_vendite' ||
    role === 'iva_attiva' ||
    textBlob.includes('iva ns.debito') ||
    textBlob.includes('iva ns debito') ||
    textBlob.includes('iva debito') ||
    textBlob.includes('iva-debito') ||
    textBlob.includes('iva ordinaria')
  )
}

export function mergeResolvedRowsForVisual(rows = [], resolvedRows = []) {
  const baseRows = Array.isArray(rows) ? rows : []
  const resolvedList = Array.isArray(resolvedRows) ? resolvedRows : []
  const resolvedById = new Map(resolvedList.map((row) => [String(row?.id || ''), row]))
  const resolvedIds = new Set(resolvedList.map((row) => String(row?.id || '')))

  const resolvedFirstRows = resolvedList.map((row) => {
    const original = baseRows.find((candidate) => String(candidate?.id || '') === String(row?.id || ''))
    if (!original) return row
    return {
      ...original,
      ...row,
      manualEdited: original?.manualEdited ?? row?.manualEdited,
      manualAmountOverride: original?.manualAmountOverride ?? row?.manualAmountOverride,
      autoResidualApplied: original?.autoResidualApplied ?? row?.autoResidualApplied,
      templateGenerated: original?.templateGenerated ?? row?.templateGenerated,
      templateScope: original?.templateScope ?? row?.templateScope,
    }
  })

  const appendedRows = baseRows
    .filter((row) => !resolvedIds.has(String(row?.id || '')))
    .filter((row) => !row?.technicalDerived)
    .filter((row) => !(row?.source !== 'split_payment' && isOrdinaryVatRow(row) && resolvedList.some((resolved) => Boolean(resolved?.splitPayment || resolved?.technicalDerived))))
    .map((row) => resolvedById.get(String(row?.id || '')) || row)
    .filter((row) => !row?.technicalDerived)

  return [...resolvedFirstRows, ...appendedRows]
}
