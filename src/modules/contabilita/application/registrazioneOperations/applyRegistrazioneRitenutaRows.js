function normalize(value) {
  return String(value ?? '').trim().toLowerCase()
}

function amountText(value) {
  const amount = Math.round((Number(value) || 0) * 100) / 100
  return amount ? amount.toFixed(2) : ''
}

export function applyRegistrazioneRitenutaRows(rows = [], ritenutaDraft = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  if (!ritenutaDraft?.active || ritenutaDraft?.mode !== 'documento') {
    return { rows: sourceRows, applied: false, blockers: [] }
  }

  const ritenuta = Number(ritenutaDraft.ritenuta || 0)
  if (!(ritenuta > 0)) return { rows: sourceRows, applied: false, blockers: [] }

  const subjectIndex = sourceRows.findIndex((row) => normalize(row?.ruolo) === 'soggetto')
  const withholdingIndex = sourceRows.findIndex((row) => ['ritenuta', 'erario_ritenute'].includes(normalize(row?.ruolo)))
  const blockers = []
  if (subjectIndex < 0) blockers.push('riga soggetto mancante per applicare la ritenuta')
  if (withholdingIndex < 0) blockers.push('conto Erario c/ritenute non configurato nel template causale')
  if (blockers.length) return { rows: sourceRows, applied: false, blockers }

  const nextRows = sourceRows.map((row) => ({ ...row }))
  const subject = nextRows[subjectIndex]
  const subjectDare = Number(String(subject.dare || 0).replace(',', '.')) || 0
  const subjectAvere = Number(String(subject.avere || 0).replace(',', '.')) || 0
  if (subjectDare > 0) subject.dare = amountText(Math.max(0, subjectDare - ritenuta))
  if (subjectAvere > 0) subject.avere = amountText(Math.max(0, subjectAvere - ritenuta))

  const withholding = nextRows[withholdingIndex]
  const side = normalize(withholding.lato || withholding.templateSide) === 'dare' ? 'dare' : 'avere'
  withholding.dare = side === 'dare' ? amountText(ritenuta) : ''
  withholding.avere = side === 'avere' ? amountText(ritenuta) : ''

  return { rows: nextRows, applied: true, blockers: [] }
}
