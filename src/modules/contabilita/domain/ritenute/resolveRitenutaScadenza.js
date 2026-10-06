function pad2(value) {
  return String(value).padStart(2, '0')
}

export function resolveRitenutaScadenza(dateValue) {
  const match = String(dateValue || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return { dataScadenza: '', periodoRiferimento: '', annoRiferimento: null }

  const year = Number(match[1])
  const month = Number(match[2])
  if (!year || month < 1 || month > 12) {
    return { dataScadenza: '', periodoRiferimento: '', annoRiferimento: null }
  }

  const dueMonth = month === 12 ? 1 : month + 1
  const dueYear = month === 12 ? year + 1 : year
  return {
    dataScadenza: `${dueYear}-${pad2(dueMonth)}-16`,
    periodoRiferimento: `${year}-${pad2(month)}`,
    annoRiferimento: year,
  }
}
