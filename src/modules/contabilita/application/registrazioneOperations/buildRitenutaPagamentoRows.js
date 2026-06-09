import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function toAmount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? round2(parsed) : 0
}

function amountText(value) {
  const amount = toAmount(value)
  return amount > 0 ? amount.toFixed(2) : ''
}

function resolveErarioTemplateRow(causale = {}) {
  const rows = causale?.righe_prima_nota_template || causale?.righePrimaNotaTemplate || causale?.righe_prima_nota || []
  return (Array.isArray(rows) ? rows : []).find((row) =>
    ['ritenuta', 'erario_ritenute'].includes(normalizeText(row?.ruolo).toLowerCase()) &&
    normalizeText(row?.conto_id)
  ) || null
}

export function buildRitenutaPagamentoRows({ rows = [], ritenutaDraft = {}, causale = {} } = {}) {
  const sourceRows = Array.isArray(rows) ? rows : []
  if (!ritenutaDraft?.active || ritenutaDraft?.mode !== 'pagamento') {
    return { rows: sourceRows, applied: false, blockers: [] }
  }

  const ritenuta = toAmount(ritenutaDraft.ritenuta)
  const lordo = toAmount(ritenutaDraft.importoPagamento)
  const netto = round2(lordo - ritenuta)
  if (!(ritenuta > 0) || !(lordo > 0) || !(netto > 0)) {
    return { rows: sourceRows, applied: false, blockers: ['dati pagamento ritenuta incompleti'] }
  }

  const subjectId = normalizeText(ritenutaDraft?.partitarioDraft?.selectedControparteId || ritenutaDraft?.linkedPartitaRecord?.conto_id)
  const subjectIndex = sourceRows.findIndex((row) =>
    normalizeText(row?.ruolo).toLowerCase() === 'soggetto' ||
    (subjectId && normalizeText(row?.conto_id) === subjectId)
  )
  const bankIndex = sourceRows.findIndex((row, index) =>
    index !== subjectIndex &&
    (
      ['banca', 'cassa', 'altro'].includes(normalizeText(row?.ruolo).toLowerCase()) ||
      (toAmount(row?.avere) > 0 && normalizeText(row?.conto_id) !== subjectId)
    )
  )
  const erarioTemplate = resolveErarioTemplateRow(causale)
  const blockers = []
  if (subjectIndex < 0) blockers.push('riga fornitore/percipiente mancante nel pagamento')
  if (bankIndex < 0) blockers.push('riga banca/cassa mancante nel pagamento')
  if (!erarioTemplate) blockers.push('conto Debiti v/Erario ritenute non configurato nel template causale pagamento')
  if (blockers.length) return { rows: sourceRows, applied: false, blockers }

  const nextRows = sourceRows
    .filter((row) => !['ritenuta', 'erario_ritenute'].includes(normalizeText(row?.ruolo).toLowerCase()))
    .map((row) => ({ ...row }))
  const subject = nextRows.find((row) =>
    normalizeText(row?.ruolo).toLowerCase() === 'soggetto' ||
    (subjectId && normalizeText(row?.conto_id) === subjectId)
  )
  const bank = nextRows.find((row) =>
    row !== subject &&
    (
      ['banca', 'cassa', 'altro'].includes(normalizeText(row?.ruolo).toLowerCase()) ||
      (toAmount(row?.avere) > 0 && normalizeText(row?.conto_id) !== subjectId)
    )
  )

  subject.ruolo = 'soggetto'
  subject.lato = 'dare'
  subject.dare = amountText(lordo)
  subject.avere = ''
  bank.ruolo = normalizeText(bank.ruolo) || 'banca'
  bank.lato = 'avere'
  bank.dare = ''
  bank.avere = amountText(netto)

  nextRows.push({
    id: erarioTemplate.id || `ritenuta-pagamento-${nextRows.length + 1}`,
    riga_numero: nextRows.length + 1,
    templateGenerated: true,
    ruolo: normalizeText(erarioTemplate.ruolo) || 'erario_ritenute',
    conto_id: normalizeText(erarioTemplate.conto_id),
    conto_codice: normalizeText(erarioTemplate.conto_codice),
    conto_descrizione: normalizeText(erarioTemplate.conto_descrizione),
    contoQuery: normalizeText(erarioTemplate.conto_codice) && normalizeText(erarioTemplate.conto_descrizione)
      ? `${normalizeText(erarioTemplate.conto_codice)} - ${normalizeText(erarioTemplate.conto_descrizione)}`
      : normalizeText(erarioTemplate.conto_descrizione || erarioTemplate.conto_codice),
    hierarchyType: normalizeText(erarioTemplate.hierarchyType) || 'sottoconto',
    conto_resolved_finale: true,
    lato: 'avere',
    dare: '',
    avere: amountText(ritenuta),
    descrizione: 'Ritenuta maturata al pagamento',
    descrizione_riga: 'Debiti v/Erario ritenute',
    formula_importo: 'ritenuta',
    templateFormula: 'ritenuta',
    templateSide: 'avere',
    obbligatoria: true,
    modificabile: false,
    attiva: true,
  })

  return { rows: nextRows, applied: true, blockers: [], lordo, netto, ritenuta }
}
