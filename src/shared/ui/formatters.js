export const fmt0 = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)

export const fmt2 = (n) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '—')

export const tomorrowStr = () => {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

