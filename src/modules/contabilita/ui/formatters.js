export const fmtCurrency = (n) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
  }).format(n || 0)

export const fmtCurrency0 = (n) =>
  new Intl.NumberFormat('it-IT', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(n || 0)

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('it-IT') : '—')

export const fmtNumber = (n) =>
  n != null
    ? Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—'
