import { normalizeText, round2 } from '../canonical_mapper/utils.js'

function getEntryId(entry = {}) {
  return normalizeText(entry?.prima_nota_id || entry?.prima_nota?.id || entry?.prima_notaId || entry?.documento_id || entry?.id)
}

function getRowSide(row = {}) {
  const dare = Math.abs(Number.parseFloat(String(row?.dare ?? row?.importo_dare ?? 0).replace(',', '.')) || 0)
  const avere = Math.abs(Number.parseFloat(String(row?.avere ?? row?.importo_avere ?? 0).replace(',', '.')) || 0)
  if (avere > dare) return 'avere'
  if (dare > avere) return 'dare'
  return normalizeText(row?.lato || row?.side) === 'avere' ? 'avere' : 'dare'
}

function classifyHistoricalRole(row = {}, group = [], index = 0) {
  const text = normalizeText([
    row?.conto_descrizione,
    row?.descrizione_riga,
    row?.prima_nota?.cliente_fornitore_nome,
    row?.prima_nota?.soggetto_denominazione,
    row?.prima_nota?.soggetto_nome,
    row?.prima_nota?.descrizione,
    row?.causale_iva_codice,
  ]
    .filter(Boolean)
    .join(' '))
    .toLowerCase()
  const code = normalizeText(row?.conto_codice || '')
  const side = getRowSide(row)
  const first = index === 0
  const last = index === Math.max(0, group.length - 1)
  const likelyParty = /fornit|client|soggett|anagraf|debiti v\/forn|crediti v\/client|partita/.test(text) || ((first || last) && code.startsWith('2'))
  if (likelyParty) return 'soggetto'
  if (text.includes('iva') || normalizeText(row?.causale_iva_codice)) return 'iva'
  if (text.includes('banca') || text.includes('banche')) return 'banca'
  if (text.includes('cassa')) return 'cassa'
  if (text.includes('ricav') || text.includes('vendit') || text.startsWith('7') || (side === 'avere' && code.startsWith('7'))) return 'ricavo'
  if (text.includes('cost') || text.includes('spes') || text.includes('acquist') || text.includes('oner') || text.startsWith('6') || side === 'dare') return 'costo'
  return 'altro'
}

function classifyFormula(role, side) {
  if (role === 'soggetto') return 'totale_documento'
  if (role === 'iva') return side === 'avere' ? 'iva_indetraibile' : 'iva_detraibile'
  if (role === 'costo' || role === 'ricavo') return 'imponibile'
  if (role === 'banca' || role === 'cassa') return 'residuo_sbilancio'
  return 'manuale'
}

export function buildCausaleStructureHistory({ societaId = '', causaleCodice = '', historicalEntries = [] } = {}) {
  const list = Array.isArray(historicalEntries) ? historicalEntries.filter(Boolean) : []
  const normalizedCausale = normalizeText(causaleCodice).toLowerCase()
  const filtered = list.filter((entry) => {
    const pn = entry?.prima_nota || {}
    const code = normalizeText(pn.causale_codice || pn.causaleContabileCodice || pn.causale_id || pn.causaleContabile || pn.causale || entry?.causale_codice || entry?.causaleContabile)
    if (!normalizedCausale) return true
    return code.toLowerCase() === normalizedCausale
  })

  const groups = new Map()
  filtered.forEach((entry) => {
    const id = getEntryId(entry)
    if (!id) return
    if (!groups.has(id)) groups.set(id, [])
    groups.get(id).push(entry)
  })

  const grouped = Array.from(groups.values())
    .map((rows) =>
      rows
        .slice()
        .sort((a, b) => Number(a?.riga_numero || 0) - Number(b?.riga_numero || 0))
    )
    .filter((rows) => rows.length > 0)

  if (!grouped.length) {
    return {
      found: false,
      sampleSize: 0,
      confidence: 0,
      patternRows: [],
      accountHints: {},
      reasons: ['Nessuno storico causale utile trovato'],
      warnings: ['Storico struttura causale non disponibile o troppo scarno'],
    }
  }

  const maxLength = grouped.reduce((max, rows) => Math.max(max, rows.length), 0)
  const positions = Array.from({ length: maxLength }, (_, index) => index)
  const patternRows = []
  const accountHintMap = new Map()
  let confidenceAccumulator = 0

  positions.forEach((position) => {
    const rowsAtPosition = grouped.map((rows) => rows[position]).filter(Boolean)
    if (!rowsAtPosition.length) return

    const roleCounts = new Map()
    const sideCounts = new Map()
    const accountCounts = new Map()

    rowsAtPosition.forEach((row, index) => {
      const role = classifyHistoricalRole(row, rowsAtPosition, index)
      const side = getRowSide(row)
      const accountKey = [
        normalizeText(row?.conto_id),
        normalizeText(row?.conto_codice),
        normalizeText(row?.conto_descrizione),
      ].join('|')

      roleCounts.set(role, (roleCounts.get(role) || 0) + 1)
      sideCounts.set(side, (sideCounts.get(side) || 0) + 1)
      if (accountKey.trim() !== '||') {
        accountCounts.set(accountKey, {
          count: (accountCounts.get(accountKey)?.count || 0) + 1,
          conto_id: normalizeText(row?.conto_id),
          conto_codice: normalizeText(row?.conto_codice),
          conto_descrizione: normalizeText(row?.conto_descrizione),
          hierarchyType: normalizeText(row?.hierarchyType),
        })
      }
    })

    const [dominantRole, dominantRoleCount] = Array.from(roleCounts.entries()).sort((a, b) => b[1] - a[1])[0] || ['altro', 0]
    const [dominantSide, dominantSideCount] = Array.from(sideCounts.entries()).sort((a, b) => b[1] - a[1])[0] || ['dare', 0]
    const dominantAccount = Array.from(accountCounts.values()).sort((a, b) => b.count - a.count)[0] || null

    confidenceAccumulator += rowsAtPosition.length ? dominantRoleCount / rowsAtPosition.length : 0
    patternRows.push({
      ordine: position + 1,
      ruolo: dominantRole,
      lato: dominantSide,
      formula_importo: classifyFormula(dominantRole, dominantSide),
      attiva: true,
      obbligatoria: dominantRole === 'soggetto' || dominantRole === 'iva',
      modificabile: true,
      descrizione_riga: dominantRole,
      hierarchyType: dominantAccount?.hierarchyType || '',
      conto_id: '',
      conto_codice: '',
      conto_descrizione: '',
    })

    if (dominantAccount && dominantAccount.count > 0) {
      accountHintMap.set(dominantRole, dominantAccount)
    }
  })

  const sampleSize = grouped.length
  const confidence = grouped.length ? round2(confidenceAccumulator / grouped.length) : 0
  const reasons = [
    normalizedCausale ? `Trovate ${grouped.length} registrazioni con causale ${normalizedCausale}` : `Trovate ${grouped.length} registrazioni storiche`,
    `Pattern ricorrente rilevato su ${patternRows.length} righe`,
  ]
  const warnings = confidence < 0.5 ? ['Storico causale con confidenza bassa'] : []

  return {
    found: patternRows.length > 0,
    sampleSize,
    confidence,
    patternRows,
    accountHints: Object.fromEntries(accountHintMap.entries()),
    reasons,
    warnings,
  }
}
