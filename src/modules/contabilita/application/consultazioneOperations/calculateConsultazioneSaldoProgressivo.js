function toDateKey(value) {
  const v = String(value ?? '').trim()
  if (!v) return '9999-12-31'
  return v.slice(0, 10)
}

function num(value) {
  const n = Number(value ?? 0)
  return Number.isFinite(n) ? n : 0
}

function compareMaybeNumber(a, b) {
  const na = Number(a)
  const nb = Number(b)
  const aIsNum = Number.isFinite(na)
  const bIsNum = Number.isFinite(nb)
  if (aIsNum && bIsNum) return na - nb
  return String(a ?? '').localeCompare(String(b ?? ''))
}

export function calculateConsultazioneSaldoProgressivo(rows = [], { openingBalance = 0 } = {}) {
  const sorted = [...rows]
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const da = toDateKey(a.row.dataRegistrazione)
      const db = toDateKey(b.row.dataRegistrazione)
      if (da !== db) return da.localeCompare(db)
      const na = compareMaybeNumber(a.row.numeroRegistrazione, b.row.numeroRegistrazione)
      if (na !== 0) return na
      const ra = compareMaybeNumber(a.row.rigaNumero, b.row.rigaNumero)
      if (ra !== 0) return ra
      const ida = compareMaybeNumber(a.row.id, b.row.id)
      if (ida !== 0) return ida
      return a.index - b.index
    })
    .map(({ row }) => ({ ...row }))

  let running = num(openingBalance)
  return sorted.map((row) => {
    running = Math.round((running + num(row.dare) - num(row.avere)) * 100) / 100
    return { ...row, saldoProgressivo: running }
  })
}
