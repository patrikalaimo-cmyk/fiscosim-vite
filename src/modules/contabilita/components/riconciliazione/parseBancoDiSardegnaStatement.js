import { parseBankStatementTextRows } from './parseBankStatementTextRows.js'
import { normalizeMockText } from './riconciliazioneMockSelectors.js'
import { detectMovementSectionBounds } from './detectMovementSectionBounds.js'

const PAGE_MARKER_RE = /^---\s*pagina\s+(\d+)\s*---$/i

function extractPageNumber(line, fallbackPage = 0) {
  const match = String(line || '').trim().match(PAGE_MARKER_RE)
  return match ? Number(match[1]) || fallbackPage : fallbackPage
}

function classifyIgnoredReason(line, { afterClosing = false } = {}) {
  const normalized = normalizeMockText(line)
  if (!normalized) return 'empty_line'
  if (/saldo iniziale/i.test(normalized)) return 'opening_balance'
  if (/saldo finale/i.test(normalized)) return 'closing_balance'
  if (/di seguito l'elenco movimenti del periodo|data valuta uscite entrate descrizione/i.test(normalized)) return 'statement_header'
  if (/riepilogo conto corrente/i.test(normalized)) return 'statement_summary'
  if (/riassunto scalare|valuta saldi per valuta|giorni numeri debitori numeri creditori/i.test(normalized)) return 'scalare_section'
  if (/elementi per il conteggio delle competenze|interessi creditori|riepilogo competenze spese|riepilogo competenze avere|spese\/commissioni/i.test(normalized)) return 'competences_section'
  if (/informativa alla clientela|informativa|fondo interbancario|privacy|comunicazioni importanti/i.test(normalized)) return 'informative_section'
  if (/banco di sardegna|coordinate bancarie|codice abi|bic:|iban:|conto n\./i.test(normalized)) return 'bank_header'
  if (/www\.|pec\.|testo legale/i.test(normalized)) return 'legal_footer'
  if (/saldo/i.test(normalized)) return afterClosing ? 'statement_after_closing_balance' : 'statement_summary'
  return afterClosing ? 'statement_after_closing_balance' : 'unknown_unparsed'
}

function offsetRow(row, offset, section = '') {
  if (!row) return row
  const rowIndex = Number.isFinite(Number(row.rowIndex)) ? Number(row.rowIndex) : 0
  return {
    ...row,
    rowIndex: rowIndex + offset,
    pageNumber: row.pageNumber || 0,
    section,
  }
}

function inferBancoDirection(rawText, currentDirection = '') {
  const normalized = normalizeMockText(rawText)
  if (/bonifico\s+istantaneo|bonifico.*a favore di|giroconto\s+.*eur|bonifico\b.*siria s\.r\.l/i.test(normalized)) {
    return {
      direction: 'in',
      detectedColumn: 'entrate',
      directionSource: 'column',
      parseConfidence: 96,
    }
  }
  if (
    /canone servizi telematici|imposta di bollo|pagamento carta di credito|rata prestito|spese\/commissioni|spese e commissioni|bollo|commissioni|addebito diretto|prelievo/i.test(normalized)
  ) {
    return {
      direction: 'out',
      detectedColumn: 'uscite',
      directionSource: 'column',
      parseConfidence: 96,
    }
  }
  return {
    direction: currentDirection || '',
    detectedColumn: currentDirection === 'in' ? 'entrate' : currentDirection === 'out' ? 'uscite' : 'unknown',
    directionSource: currentDirection ? 'column' : 'unknown',
    parseConfidence: 86,
  }
}

export function parseBancoDiSardegnaStatement(text, context = {}) {
  const lines = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  const bounds = detectMovementSectionBounds(lines)
  const movementLines = lines.slice(bounds.startIndex, Math.max(bounds.startIndex, bounds.endIndex))
  const movementText = movementLines.join('\n')
  const parsed = parseBankStatementTextRows(movementText, {
    ...context,
    statementProfile: 'banco_di_sardegna_statement_v1',
    profileLabel: 'Banco di Sardegna',
  })

  const rawRowsDetailed = []
  const ignoredRows = []
  let currentPage = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const detectedPage = extractPageNumber(line, currentPage)
    if (detectedPage) currentPage = detectedPage
    rawRowsDetailed.push({
      rowIndex: i,
      pageNumber: currentPage,
      raw: line,
      section: i < bounds.startIndex ? 'before_movements' : i >= bounds.endIndex ? 'after_movements' : 'movement_section',
    })

    if (i < bounds.startIndex || i >= bounds.endIndex) {
      ignoredRows.push({
        rowIndex: i,
        pageNumber: currentPage,
        raw: line,
        reason: classifyIgnoredReason(line, { afterClosing: i >= bounds.endIndex }),
      })
    }
  }

  const sectionOffset = bounds.startIndex
  const adjustedMovements = (parsed.movements || []).map((movement, index) => {
    const bancoDirection = inferBancoDirection(movement.sourceMeta?.rawText || movement.descriptionRaw || '', movement.direction)
    return {
      ...movement,
      ...bancoDirection,
      rowIndex: Number.isFinite(Number(movement.rowIndex)) ? Number(movement.rowIndex) + sectionOffset : index + sectionOffset,
      movementId: movement.movementId || `${context.statementId || 'st'}-${index + sectionOffset}`,
      sourceMeta: {
        ...(movement.sourceMeta || {}),
        rawRowId: Number.isFinite(Number(movement.sourceMeta?.rawRowId)) ? Number(movement.sourceMeta.rawRowId) + sectionOffset : index + sectionOffset,
        section: 'movement_section',
        profile: 'banco_di_sardegna_statement_v1',
        profileLabel: 'Banco di Sardegna',
        ...bancoDirection,
      },
    }
  })

  const adjustedIgnoredRows = [
    ...ignoredRows,
    ...(parsed.ignoredRows || []).map((row) => offsetRow(row, sectionOffset, 'movement_section')),
  ]
  const adjustedRejectedRows = (parsed.rejectedRows || []).map((row) => offsetRow(row, sectionOffset, 'movement_section'))
  const adjustedBlockedRows = (parsed.blockedRows || []).map((row) => offsetRow(row, sectionOffset, 'movement_section'))
  const adjustedNeedsReviewRows = (parsed.needsReviewRows || []).map((row) => offsetRow(row, sectionOffset, 'movement_section'))
  const parseWarnings = [
    ...(parsed.parseWarnings || []),
    'Profilo Banco di Sardegna rilevato',
    bounds.startIndex >= 0 ? '' : 'Sezione movimenti non individuata con precisione',
  ].filter(Boolean)

  return {
    ...parsed,
    profile: 'banco_di_sardegna_statement_v1',
    profileLabel: 'Banco di Sardegna',
    movementSectionBounds: bounds,
    rawRows: lines,
    rawRowsDetailed,
    movements: adjustedMovements,
    ignoredRows: adjustedIgnoredRows,
    rejectedRows: adjustedRejectedRows,
    blockedRows: adjustedBlockedRows,
    needsReviewRows: adjustedNeedsReviewRows,
    parseWarnings,
    warnings: parseWarnings,
  }
}
