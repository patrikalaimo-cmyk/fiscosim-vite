import { normalizeBankMovement } from './normalizeBankMovement.js'
import { normalizeMockText } from './riconciliazioneMockSelectors.js'

const NOISE_HINTS = [
  'saldo iniziale',
  'saldo finale',
  'pagina',
  'copyright',
  'privacy',
  'informativa',
  'movimenti al',
  'estratto conto',
]

const PAGE_MARKER_RE = /^---\s*pagina\s+(\d+)\s*---$/i
const DATE_TOKEN_RE = /^(?:\d{2}[\/.-]\d{2}[\/.-]\d{2,4}|\d{4}-\d{2}-\d{2})$/
const AMOUNT_RE = /^(?:\u20AC\s*)?[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})|(?:\d{1,3}(?:\.\d{3})+))(?:-)?$/u

function splitCells(line, delimiter) {
  return line
    .split(delimiter)
    .map((cell) => cell.trim())
    .filter(Boolean)
}

function pickDelimiter(text) {
  const semicolons = (text.match(/;/g) || []).length
  const tabs = (text.match(/\t/g) || []).length
  const pipes = (text.match(/\|/g) || []).length
  if (tabs >= semicolons && tabs >= pipes) return '\t'
  if (pipes >= semicolons) return '|'
  return ';'
}

function isLikelyNoiseLine(line) {
  const text = normalizeMockText(line)
  if (!text) return true
  return NOISE_HINTS.some((token) => text.includes(token))
}

function tokenize(line, delimiter) {
  const base = delimiter && delimiter !== ';' ? splitCells(line, delimiter) : [line]
  return base
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean)
}

function extractPageNumber(line, fallbackPage = 0) {
  const match = String(line || '').trim().match(PAGE_MARKER_RE)
  return match ? Number(match[1]) || fallbackPage : fallbackPage
}

function extractDateFromCompactToken(token) {
  const text = String(token || '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) || /^\d{2}[\/.-]\d{2}[\/.-]\d{2,4}$/.test(text)) {
    return text
  }
  return ''
}

function extractDateFromTokens(tokens, startIndex) {
  const token = tokens[startIndex]
  const compact = extractDateFromCompactToken(token)
  if (compact) {
    return { date: compact, consumed: 1 }
  }

  const next2 = tokens.slice(startIndex, startIndex + 3)
  if (next2.length === 3 && next2.every((part) => /^\d{1,4}$/.test(part))) {
    const [a, b, c] = next2
    const day = String(a).padStart(2, '0')
    const month = String(b).padStart(2, '0')
    const year = c.length === 2 ? `20${c}` : c
    if (Number(day) >= 1 && Number(day) <= 31 && Number(month) >= 1 && Number(month) <= 12) {
      return { date: `${day}/${month}/${year}`, consumed: 3 }
    }
  }

  return null
}

function extractLeadingDates(tokens) {
  const dates = []
  let index = 0
  while (index < tokens.length && dates.length < 2) {
    const extracted = extractDateFromTokens(tokens, index)
    if (!extracted) break
    dates.push(extracted.date)
    index += extracted.consumed
  }
  return { dates, index }
}

function findDateSpans(tokens) {
  const spans = []
  for (let index = 0; index < tokens.length; index++) {
    const extracted = extractDateFromTokens(tokens, index)
    if (!extracted) continue
    spans.push({
      date: extracted.date,
      index,
      consumed: extracted.consumed,
    })
    index += extracted.consumed - 1
    if (spans.length >= 2) break
  }
  return spans
}

function parseAmountToken(token) {
  const raw = String(token || '').trim()
  if (!raw) return null
  if (!AMOUNT_RE.test(raw)) return null

  const normalized = raw
    .replace(/\u20AC/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^\d.+-]/g, '')

  if (!normalized) return null

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null

  const negative = /^-/.test(raw) || /-$/.test(raw) || /^\(.*\)$/.test(raw) || /dare/i.test(raw)
  return {
    amount: Math.abs(parsed),
    signedAmount: negative ? -Math.abs(parsed) : Math.abs(parsed),
    raw,
  }
}

function extractAmountFromTokens(tokens) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    const token = tokens[i]
    const parsed = parseAmountToken(token)
    if (parsed) {
      return { amount: parsed, index: i }
    }
  }
  return null
}

function isDescriptionToken(token) {
  const text = normalizeMockText(token)
  if (!text) return false
  if (DATE_TOKEN_RE.test(token)) return false
  if (parseAmountToken(token)) return false
  return /[a-z\u00E0-\u00FF]/i.test(token)
}

function buildDescriptionCandidate(tokens, startIndex, endIndex) {
  const slice = tokens.slice(startIndex, Math.max(startIndex, endIndex))
  const candidate = slice.join(' ').replace(/\s+/g, ' ').trim()
  const normalized = normalizeMockText(candidate)
  if (!normalized) return ''
  if (normalized.length < 3) return ''
  return candidate
}

function buildDescriptionFromTokens(tokens, dateSpans = [], amountIndex = -1) {
  const excludedIndexes = new Set()
  dateSpans.forEach((span) => {
    for (let i = span.index; i < span.index + span.consumed; i++) {
      excludedIndexes.add(i)
    }
  })
  if (Number.isFinite(Number(amountIndex)) && amountIndex >= 0) {
    excludedIndexes.add(amountIndex)
  }

  const remaining = tokens.filter((_, index) => !excludedIndexes.has(index))
  return buildDescriptionCandidate(remaining, 0, remaining.length)
}

function isStatementNoiseDescription(value) {
  const normalized = normalizeMockText(value)
  if (!normalized) return true
  return [
    'saldo iniziale',
    'saldo finale',
    'pagina',
    'estratto conto',
    'movimenti al',
    'privacy',
    'informativa',
    'riepilogo movimenti',
    'data contabile',
    'data valuta',
    'descrizione delle operazioni',
  ].some((token) => normalized.includes(token))
}

function classifyIgnoredRowReason(line, tokens = [], { hasPendingDescription = false } = {}) {
  const normalized = normalizeMockText(line)
  if (!normalized) return 'empty_line'
  if (/^pagina\s+\d+(\s+di\s+\d+)?$/.test(normalized) || normalized.startsWith('--- pagina ')) return 'page_header'
  if (normalized.includes('saldo iniziale')) return 'opening_balance'
  if (normalized.includes('saldo finale')) return 'closing_balance'
  if (normalized.includes('entrate complessive') || normalized.includes('uscite complessive')) return 'statement_summary'
  if (normalized.includes('estratto conto') || normalized.includes('riepilogo movimenti')) return 'statement_header'
  if (normalized.includes('data contabile') || normalized.includes('data valuta') || normalized.includes('descrizione delle operazioni')) return 'table_header'
  if (normalized.includes('comunicazioni importanti') || normalized.includes('privacy') || normalized.includes('informativa')) return 'legal_footer'
  if (normalized.includes('www.sella.it') || normalized.includes('bs_segreteria@pec.sella.it') || normalized.includes('appartenente al gruppo iva')) return 'bank_header'
  if (normalized.includes('banca sella') || normalized.includes('codice abi') || normalized.includes('bic:') || normalized.includes('iban:') || normalized.includes('conto n.')) return 'bank_header'
  if (normalized.includes('siria srl') || normalized.includes('viale ventuno aprile') || normalized.includes('roma rm') || normalized.includes('suo conto')) return 'customer_data'
  if (normalized.includes('totale')) return 'totals_row'

  const hasDate = extractLeadingDates(tokens).dates.length > 0
  const amount = extractAmountFromTokens(tokens)
  if (hasDate && !amount) return 'probable_movement_missing_amount'
  if (!hasDate && amount) return 'probable_movement_missing_date'

  if (hasPendingDescription && isReusableDescriptionLine(line)) return 'probable_movement_multiline_unresolved'
  if (/[a-z][a-z]/i.test(normalized) && /incasso|pagamento|bonifico|addebito|accredito|commission|spese|f24/i.test(normalized)) {
    return 'probable_movement_multiline_unresolved'
  }

  if (normalized.includes('saldo')) return 'non_movement_text'
  return 'unknown_unparsed'
}

function inferDirectionMeta(text, amount, tokens = []) {
  const normalized = normalizeMockText(text)
  if (/(commission|addebito|pagamento|bonifico a|trasferim|assegno|uscita|prelievo|spese|bollo|f24|valori bollati|sdd|addebito diretto|commissione)/i.test(normalized)) {
    return { direction: 'out', source: 'semantic_fallback', detectedColumn: 'semantic_out' }
  }
  if (/(incasso|accredito|bonifico da|entrata|ricevuto|ricezione|versamento|bonifico ricevuto)/i.test(normalized)) {
    return { direction: 'in', source: 'semantic_fallback', detectedColumn: 'semantic_in' }
  }
  if (amount?.signedAmount != null) {
    return {
      direction: amount.signedAmount < 0 ? 'out' : 'in',
      source: 'signed_amount',
      detectedColumn: 'signed_amount',
    }
  }
  if (/(dare|avere)/i.test(normalized)) {
    return {
      direction: /dare/i.test(normalized) ? 'out' : 'in',
      source: 'keyword_fallback',
      detectedColumn: /dare/i.test(normalized) ? 'dare' : 'avere',
    }
  }
  if (extractAmountFromTokens(tokens)) {
    return { direction: '', source: 'ambiguous', detectedColumn: 'unknown' }
  }
  return { direction: '', source: 'unknown', detectedColumn: 'unknown' }
}

function isMovementCandidate(tokens, line, delimiter) {
  if (isLikelyNoiseLine(line)) return false
  const dates = findDateSpans(tokens)
  const amount = extractAmountFromTokens(tokens)
  if (!dates.length || !amount) return false
  const desc = buildDescriptionFromTokens(tokens, dates, amount.index)
  if (desc) return true
  return tokens.some((token, index) => {
    if (amount.index === index) return false
    return !DATE_TOKEN_RE.test(token) && !parseAmountToken(token) && /[a-z\u00E0-\u00FF]/i.test(token)
  })
}

function buildMovementFromTokens(tokens, line, rowIndex, context, delimiter) {
  const dateSpans = findDateSpans(tokens)
  const dates = dateSpans.map((entry) => entry.date)
  const amount = extractAmountFromTokens(tokens)
  let descriptionRaw = buildDescriptionFromTokens(tokens, dateSpans, amount?.index ?? -1)
  if (!descriptionRaw) {
    const beforeAmount = amount ? tokens.slice(0, amount.index) : tokens
    descriptionRaw = buildDescriptionCandidate(beforeAmount, 0, beforeAmount.length)
  }
  if (!descriptionRaw && tokens.length) {
    descriptionRaw = tokens.join(' ').replace(/\s+/g, ' ').trim()
  }
  const text = tokens.join(' ')
  const directionMeta = inferDirectionMeta(text, amount?.amount, tokens)

  const raw = {
    rowIndex,
    bankAccountId: context.bankAccountId || '',
    operationDate: dates[0] || '',
    valueDate: dates[1] || dates[0] || '',
    descriptionRaw,
    descriptionNormalized: descriptionRaw,
    amount: amount?.amount ?? null,
    direction: directionMeta.direction,
    currency: context.currency || 'EUR',
    bankCausal: '',
    reference: '',
    counterpartyName: '',
    counterpartyIban: '',
    sourceMeta: {
      delimiter,
      parsedFrom: 'text',
      rawText: line,
      pageNumber: context.pageNumber || 0,
      detectedColumn: directionMeta.detectedColumn,
      directionSource: directionMeta.source,
      dateSpans,
      amountAudit: {
        allAmountCandidates: amount?.allAmountCandidates || [],
        selectedAmountCandidate: amount?.selectedAmountCandidate || null,
        rejectedAmountCandidates: amount?.rejectedAmountCandidates || [],
      },
    },
    parseConfidence: descriptionRaw && amount && directionMeta.direction && dates[0] ? 86 : 42,
  }

  return normalizeBankMovement(raw, context)
}

function isReusableDescriptionLine(line) {
  if (!line) return false
  if (isLikelyNoiseLine(line)) return false
  if (extractDateFromCompactToken(line)) return false
  if (parseAmountToken(line)) return false
  return /[a-z\u00E0-\u00FF]/i.test(line)
}

export function parseBankStatementTextRows(text, context = {}) {
  const lines = String(text || '')
    .replace(/\r/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return {
      movements: [],
      rawRows: [],
      ignoredRows: [],
      rejectedRows: [],
      blockedRows: [],
      needsReviewRows: [],
      parseWarnings: ['File vuoto o senza righe leggibili'],
      errors: ['empty_file'],
    }
  }

  const delimiter = pickDelimiter(lines.join('\n'))
  const rawRows = []
  const rawRowsDetailed = []
  const ignoredRows = []
  const rejectedRows = []
  const blockedRows = []
  const needsReviewRows = []
  const parseWarnings = []
  const errors = []
  const movements = []

  let pendingDescription = ''
  let currentPage = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    rawRows.push(line)
    const detectedPage = extractPageNumber(line, currentPage)
    if (detectedPage) currentPage = detectedPage
    rawRowsDetailed.push({ rowIndex: i, pageNumber: currentPage, raw: line })
    const tokens = tokenize(line, delimiter)

    if (!tokens.length) {
      rejectedRows.push({ rowIndex: i, pageNumber: currentPage, raw: line, reason: 'empty_line' })
      continue
    }

    if (PAGE_MARKER_RE.test(String(line || '').trim())) {
      ignoredRows.push({ rowIndex: i, pageNumber: currentPage, raw: line, reason: 'page_header' })
      continue
    }

    const movementCandidate = isMovementCandidate(tokens, line, delimiter)
    const hasDate = Boolean(extractLeadingDates(tokens).dates.length)
    const amountToken = extractAmountFromTokens(tokens)

    if (!movementCandidate) {
      const reason = classifyIgnoredRowReason(line, tokens, { hasPendingDescription: Boolean(pendingDescription) })
      if (pendingDescription && amountToken && !hasDate) {
        const combinedLine = `${pendingDescription} ${line}`.trim()
        const combinedTokens = tokenize(combinedLine, delimiter)
        const combinedMovement = buildMovementFromTokens(
          combinedTokens,
          combinedLine,
          movements.length,
          { ...context, pageNumber: currentPage },
          delimiter
        )
        const combinedAmount = Number(combinedMovement.amount || 0)
        if (
          combinedMovement &&
          combinedMovement.operationDate &&
          combinedMovement.descriptionRaw &&
          Number.isFinite(combinedAmount) &&
          combinedAmount > 0 &&
          combinedMovement.direction
        ) {
          if (!isStatementNoiseDescription(combinedMovement.descriptionRaw)) {
            movements.push(combinedMovement)
            pendingDescription = ''
            continue
          }
        }
      }
      if (reason === 'probable_movement_multiline_unresolved' || reason === 'probable_movement_missing_amount') {
        pendingDescription = pendingDescription ? `${pendingDescription} ${line}` : line
      }
      ignoredRows.push({ rowIndex: i, pageNumber: currentPage, raw: line, reason })
      continue
    }

    const movement = buildMovementFromTokens(tokens, line, movements.length, { ...context, pageNumber: currentPage }, delimiter)
    if (!movement.descriptionRaw && pendingDescription) {
      movement.descriptionRaw = pendingDescription
      movement.descriptionNormalized = pendingDescription
    }

    if (isStatementNoiseDescription(movement.descriptionRaw)) {
      rejectedRows.push({ rowIndex: i, pageNumber: currentPage, raw: line, reason: classifyIgnoredRowReason(line, tokens) })
      pendingDescription = ''
      continue
    }

    const hasMovementDate = Boolean(movement.operationDate)
    const hasMovementAmount = Number.isFinite(Number(movement.amount)) && Number(movement.amount) > 0
    const hasMovementDirection = movement.direction === 'in' || movement.direction === 'out'
    const hasMovementDescription = Boolean(String(movement.descriptionRaw || '').trim())

    if (!hasMovementDate || !hasMovementAmount || !hasMovementDirection || !hasMovementDescription) {
      movement.status = 'blocked'
      movement.parseConfidence = Math.min(Number(movement.parseConfidence || 0), 45)
      movement.rejectionReason = !hasMovementDate
        ? 'missing_date'
        : !hasMovementAmount
          ? 'missing_amount'
          : !hasMovementDirection
            ? 'missing_direction'
            : 'missing_description'
      blockedRows.push({ rowIndex: i, pageNumber: currentPage, raw: line, reason: movement.rejectionReason })
      needsReviewRows.push(movement)
      pendingDescription = ''
      continue
    }

    if (movement.parseConfidence < 70) {
      movement.status = 'needs_review'
      needsReviewRows.push(movement)
    }

    movements.push(movement)
    pendingDescription = ''
  }

  if (!movements.length && rawRows.length) {
    parseWarnings.push('PDF letto, ma nessun movimento bancario riconosciuto con sufficiente affidabilita.')
  }

  return {
    movements,
    rawRows,
    rawRowsDetailed,
    ignoredRows,
    rejectedRows,
    blockedRows,
    needsReviewRows,
    parseWarnings,
    warnings: parseWarnings,
    errors,
  }
}
