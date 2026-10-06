function num(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

export function buildConsultazioneSummary(rows = [], { totalRows = null } = {}) {
  const uniqueConti = new Set()
  let totalDare = 0
  let totalAvere = 0

  for (const row of rows || []) {
    totalDare += num(row.dare)
    totalAvere += num(row.avere)
    const contoKey = row.contoId || row.conto_id || row.contoCodice || row.conto_codice
    if (contoKey) uniqueConti.add(String(contoKey))
  }

  totalDare = Math.round(totalDare * 100) / 100
  totalAvere = Math.round(totalAvere * 100) / 100

  return {
    righeViste: rows.length,
    righeTrovate: totalRows === null || totalRows === undefined ? rows.length : Number(totalRows),
    totaleDare: totalDare,
    totaleAvere: totalAvere,
    saldo: Math.round((totalDare - totalAvere) * 100) / 100,
    contiMovimentati: uniqueConti.size,
  }
}
