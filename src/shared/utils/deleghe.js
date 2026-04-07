export function calcolaScadenzaDelega(dataDelega) {
  if (!dataDelega) return null
  const d = new Date(dataDelega)
  d.setFullYear(d.getFullYear() + 4)
  return d.toISOString().split('T')[0]
}

export function statoDelega(dataScadenza) {
  if (!dataScadenza) return 'nessuna'
  const oggi = new Date()
  const scad = new Date(dataScadenza)
  const diff = Math.floor((scad - oggi) / 86400000)
  if (diff < 0) return 'scaduta'
  if (diff <= 30) return 'in_scadenza'
  return 'attiva'
}

