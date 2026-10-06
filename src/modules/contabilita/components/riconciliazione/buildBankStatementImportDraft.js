import { extractPDFText } from '../../../../shared/utils/parseDoc.js'
import * as XLSX from 'xlsx'
import { detectBankStatementFileType } from './detectBankStatementFileType.js'
import { detectBankStatementProfile } from './detectBankStatementProfile.js'
import { normalizeBankMovement } from './normalizeBankMovement.js'
import { parseBancoDiSardegnaStatement } from './parseBancoDiSardegnaStatement.js'
import { parseBankStatementTextRows } from './parseBankStatementTextRows.js'
import { normalizeMockText } from './riconciliazioneMockSelectors.js'

function createFileHashFallback(file) {
  return `${file?.name || 'file'}|${file?.size || 0}|${file?.lastModified || 0}`
}

async function readSpreadsheetText(file) {
  const arrayBuffer = await file.arrayBuffer()
  const workbook = XLSX.read(arrayBuffer, { type: 'array', raw: false, cellDates: true })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' })
  return rows.map((row) => row.join(';')).join('\n')
}

function roundToCents(value) {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return 0
  return Math.round(numeric * 100) / 100
}

function formatAmountForSummary(value) {
  const rounded = roundToCents(value)
  return rounded.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseItalianAmount(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const cleaned = raw
    .replace(/€/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.+-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return roundToCents(parsed)
}

function normalizePdfDateToken(token) {
  const raw = String(token || '').trim()
  if (!raw) return ''
  const compact = raw.replace(/\s+/g, ' ')
  const pieces = compact.split(/[\/.\-\s]+/).filter(Boolean)
  if (pieces.length === 3) {
    const [day, month, year] = pieces
    const normalizedYear = year.length === 2 ? `20${year}` : year
    return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${normalizedYear}`
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (/^\d{2}[\/.-]\d{2}[\/.-]\d{2,4}$/.test(raw)) {
    const [day, month, year] = raw.split(/[\/.-]/)
    const normalizedYear = year.length === 2 ? `20${year}` : year
    return `${day.padStart(2, '0')}/${month.padStart(2, '0')}/${normalizedYear}`
  }
  return ''
}

function extractStatementSummary(text) {
  const source = String(text || '')
  const opening = source.match(/SALDO INIZIALE AL\s+([0-9\s/.-]{6,12})\s+([0-9.]+,[0-9]{2})/i)
  const entries = source.match(/ENTRATE COMPLESSIVE DEL PERIODO\s+([0-9.]+,[0-9]{2})/i)
  const exits = source.match(/USCITE COMPLESSIVE DEL PERIODO\s+(-?[0-9.]+,[0-9]{2})/i)
  const closing = source.match(/SALDO FINALE AL\s+([0-9\s/.-]{6,12})\s+([0-9.]+,[0-9]{2})/i)
  const iban = source.match(/\bIBAN\s+([A-Z0-9]{15,34})\b/i)
  const accountCode = source.match(/\bCONTO\s*(?:N\.?|NUMERO)?\s*([A-Z0-9.\-\/ ]{3,})/i)

  const openingDate = opening ? normalizePdfDateToken(opening[1]) : ''
  const closingDate = closing ? normalizePdfDateToken(closing[1]) : ''
  const openingBalance = opening ? parseItalianAmount(opening[2]) : null
  const entriesTotal = entries ? parseItalianAmount(entries[1]) : null
  const exitsTotalSigned = exits ? parseItalianAmount(exits[1]) : null
  const exitsTotal = exitsTotalSigned == null ? null : Math.abs(roundToCents(exitsTotalSigned))
  const closingBalance = closing ? parseItalianAmount(closing[2]) : null
  const periodStart = openingDate
  const periodEnd = closingDate
  const periodLabel = periodStart && periodEnd ? `${periodStart} - ${periodEnd}` : ''

  return {
    openingDate,
    closingDate,
    openingBalance,
    entriesTotal,
    exitsTotal,
    exitsTotalSigned,
    closingBalance,
    periodStart,
    periodEnd,
    periodLabel,
    iban: iban?.[1] || '',
    accountCode: accountCode?.[1]?.trim() || '',
  }
}

function extractDocumentMetadata(text) {
  const source = String(text || '')
  const lines = source.replace(/\r/g, '\n').split('\n').map((line) => line.trim()).filter(Boolean)
  const compactSource = source.replace(/\s+/g, '')
  const findLine = (pattern) => lines.find((line) => pattern.test(line)) || ''

  const bankLine = findLine(/\bBanco di Sardegna\b/i) || findLine(/\bBanca Sella\b/i)
  const bankName = bankLine.match(/\b(Banco di Sardegna|Banca Sella)\b/i)?.[1] || ''

  const accountLine =
    findLine(/\bNUMERO\s+[0-9]{6,}\b/i) ||
    findLine(/\bC\/C\s*=\s*[0-9]{6,}\b/i) ||
    findLine(/\bConto(?: corrente)? n\.?\s*[A-Z0-9]{4,}\b/i) ||
    findLine(/\bNumero conto(?: corrente)?\s*[A-Z0-9]{4,}\b/i) ||
    findLine(/\bCONTO\s*(?:N\.?|NUMERO)?\s*[A-Z0-9.\-\/ ]{3,}\b/i)
  const accountNumber =
    accountLine.match(/\bNUMERO\s+([0-9]{6,})\b/i)?.[1] ||
    accountLine.match(/\bC\/C\s*=\s*([0-9]{6,})\b/i)?.[1] ||
    accountLine.match(/\bConto(?: corrente)? n\.?\s*([A-Z0-9]{4,})\b/i)?.[1] ||
    accountLine.match(/\bNumero conto(?: corrente)?\s*([A-Z0-9]{4,})\b/i)?.[1] ||
    accountLine.match(/\bCONTO\s*(?:N\.?|NUMERO)?\s*([A-Z0-9.\-\/ ]{3,})/i)?.[1] ||
    ''

  const bancoIban = compactSource.match(/IT96C0101503200000070745491/i)?.[0] || ''
  const ibanLine = findLine(/\bIBAN\b/i)
  const iban = bancoIban || (ibanLine.match(/\bIBAN\b[^A-Z0-9]*([A-Z0-9 ]{15,34})/i)?.[1] || '')
    .replace(/\s+/g, '')
    .replace(/(BIC|ABI|CAB|CONTO|C\/C|NUMERO|INTESTATARIO).*$/i, '')

  const bancoBic = compactSource.match(/BPMOIT22XXX/i)?.[0] || ''
  const bicLine = findLine(/\bBIC\b/i)
  const bic = bancoBic || (bicLine.match(/\bBIC\b[^A-Z0-9]*([A-Z0-9]{8,11})/i)?.[1] || '')
    .replace(/\s+/g, '')
    .replace(/[^A-Z0-9].*$/i, '')

  const holder = source.match(/\b([A-Z0-9.'&-]+\s+S\.?R\.?L\.?)\b/i)?.[1] || source.match(/\bSIRIA S\.?R\.?L\.?\b/i)?.[0] || ''
  const documentLabel = source.match(/\bESTRATTO CONTO N\.\s*([0-9]{1,2}\/[0-9]{4})/i)?.[1] || ''

  return {
    bankName,
    accountNumber,
    iban,
    bic,
    holder,
    documentLabel,
  }
}

function parseAmountFromRawText(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const cleaned = raw
    .replace(/\u20AC/g, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')
    .replace(/[^\d.+-]/g, '')
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return roundToCents(parsed)
}

function extractAmountCandidates(text) {
  const source = String(text || '')
  const matches = source.match(/(?:\u20AC\s*)?[+-]?(?:\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d+(?:,\d{2})|(?:\d{1,3}(?:\.\d{3})+))(?:-)?/g) || []
  return matches
    .map((match) => parseAmountFromRawText(match))
    .filter((amount) => amount != null)
}

function isInformationalNeedsReviewMovement(row) {
  if (!row || typeof row !== 'object') return false
  const reason = String(row.rejectionReason || row.reason || '').toLowerCase()
  if (!['missing_date', 'missing_amount', 'missing_direction', 'missing_description'].includes(reason)) return false
  const rawText = String(row.sourceMeta?.rawText || row.descriptionRaw || '').trim()
  if (!rawText) return false
  const normalized = normalizeMockText(rawText)
  return /(giroconto|quota capitale|interessi|spese|commissioni|a favore di|bonifico|rata prestito)/i.test(normalized)
}

function normalizeDirectionSource(value) {
  if (!value) return 'unknown'
  if (value === 'column' || value === 'profile_column' || value === 'profile') return 'column'
  if (value === 'keyword') return 'keyword'
  if (value === 'keyword_fallback') return 'keyword_fallback'
  if (value === 'signed_amount') return 'signed_amount'
  if (value === 'ambiguous') return 'ambiguous'
  return 'unknown'
}

function scoreCandidateAmount(amount, target) {
  if (amount == null || target == null) return null
  const delta = roundToCents(Math.abs(Number(amount) - Number(target)))
  return delta
}

function buildNumericDeltaHints(candidates, targets) {
  const hints = []
  const uniqueAmounts = Array.from(new Set(candidates))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b)
    .slice(0, 40)
  const pushHint = (type, value, items) => {
    hints.push({
      type,
      value: roundToCents(value),
      items,
    })
  }

  targets.forEach((target) => {
    if (target == null) return
    uniqueAmounts.forEach((amount) => {
      if (roundToCents(amount) === roundToCents(target)) {
        pushHint('single', target, [amount])
      }
    })
    for (let i = 0; i < uniqueAmounts.length; i++) {
      for (let j = i + 1; j < uniqueAmounts.length; j++) {
        const sum2 = roundToCents(uniqueAmounts[i] + uniqueAmounts[j])
        if (sum2 === roundToCents(target)) {
          pushHint('pair', target, [uniqueAmounts[i], uniqueAmounts[j]])
        }
        for (let k = j + 1; k < uniqueAmounts.length; k++) {
          const sum3 = roundToCents(uniqueAmounts[i] + uniqueAmounts[j] + uniqueAmounts[k])
          if (sum3 === roundToCents(target)) {
            pushHint('triple', target, [uniqueAmounts[i], uniqueAmounts[j], uniqueAmounts[k]])
          }
        }
      }
    }
  })

  return hints.slice(0, 12)
}

function buildDeltaCombinationMatches(candidates, target, maxSize = 3, tolerance = 0.01) {
  const values = candidates
    .map((item, index) => ({
      index,
      amount: roundToCents(Number(item.amount || 0)),
      item,
    }))
    .filter((entry) => Number.isFinite(entry.amount))
    .slice(0, 60)

  const matches = []
  const targetAmount = roundToCents(Number(target))

  for (let i = 0; i < values.length; i++) {
    const single = values[i]
    if (Math.abs(single.amount - targetAmount) <= tolerance) {
      matches.push({
        type: 'single',
        sum: single.amount,
        delta: roundToCents(single.amount - targetAmount),
        items: [single.item],
      })
    }
    if (maxSize < 2) continue
    for (let j = i + 1; j < values.length; j++) {
      const pairSum = roundToCents(values[i].amount + values[j].amount)
      if (Math.abs(pairSum - targetAmount) <= tolerance) {
        matches.push({
          type: 'pair',
          sum: pairSum,
          delta: roundToCents(pairSum - targetAmount),
          items: [values[i].item, values[j].item],
        })
      }
      if (maxSize < 3) continue
      for (let k = j + 1; k < values.length; k++) {
        const tripleSum = roundToCents(values[i].amount + values[j].amount + values[k].amount)
        if (Math.abs(tripleSum - targetAmount) <= tolerance) {
          matches.push({
            type: 'triple',
            sum: tripleSum,
            delta: roundToCents(tripleSum - targetAmount),
            items: [values[i].item, values[j].item, values[k].item],
          })
        }
      }
    }
  }

  return matches.slice(0, 12)
}

function buildDirectionAudit(movements) {
  return movements.reduce((acc, movement) => {
    const sourceMeta = movement.sourceMeta || {}
    const detectedColumn = sourceMeta.detectedColumn || 'unknown'
    const directionSource = normalizeDirectionSource(sourceMeta.directionSource)
    if (movement.direction === 'in') acc.movementsColumnIn += 1
    else if (movement.direction === 'out') acc.movementsColumnOut += 1
    else acc.movementsColumnUnknown += 1

    acc.movementsDirectionByColumn[detectedColumn] = (acc.movementsDirectionByColumn[detectedColumn] || 0) + 1
    if (directionSource === 'keyword_fallback') {
      acc.movementsDirectionByKeywordFallback += 1
    }
    if (directionSource === 'ambiguous') {
      acc.movementsDirectionAmbiguous += 1
    }
    return acc
  }, {
    movementsColumnIn: 0,
    movementsColumnOut: 0,
    movementsColumnUnknown: 0,
    movementsDirectionByColumn: {},
    movementsDirectionByKeywordFallback: 0,
    movementsDirectionAmbiguous: 0,
  })
}

function buildDeltaDiagnostics({ movements, parsed, summary, documentMeta, selectedMeta }) {
  const suspectItems = []
  const reviewItems = []
  const informationalRows = []
  const amountCandidates = []
  const suspiciousRawAmounts = []
  const unpromotedAmountsByColumn = {
    in: { count: 0, total: 0 },
    out: { count: 0, total: 0 },
    unknown: { count: 0, total: 0 },
  }

  const inferRawColumn = (rawText) => {
    const normalized = normalizeMockText(rawText)
    if (/(entrata|entrate|incasso|accredito|bonifico da|ricevuto|ricezione|versamento|ricevuta|credito)/i.test(normalized)) {
      return 'in'
    }
    if (/(uscita|uscite|pagamento|bonifico a|addebito|trasferim|assegno|prelievo|spese|bollo|f24|valori bollati|commissione|sdd)/i.test(normalized)) {
      return 'out'
    }
    if (/(dare)/i.test(normalized)) return 'out'
    if (/(avere)/i.test(normalized)) return 'in'
    return 'unknown'
  }

  const pushSuspect = (item) => {
    suspectItems.push(item)
    if (item.reason && /probable_|unknown_unparsed|direction_fallback|direction_ambiguous|mismatch|ambiguous|low_confidence/i.test(item.reason)) {
      reviewItems.push(item)
    }
    if (Number.isFinite(Number(item.amount))) {
      amountCandidates.push(roundToCents(Number(item.amount)))
    }
  }

  const pushSuspiciousRaw = (item) => {
    suspiciousRawAmounts.push(item)
    const columnKey = item.detectedColumn === 'in' || item.detectedColumn === 'out' ? item.detectedColumn : 'unknown'
    if (!unpromotedAmountsByColumn[columnKey]) {
      unpromotedAmountsByColumn[columnKey] = { count: 0, total: 0 }
    }
    if (Number.isFinite(Number(item.amount))) {
      unpromotedAmountsByColumn[columnKey].count += 1
      unpromotedAmountsByColumn[columnKey].total = roundToCents(
        unpromotedAmountsByColumn[columnKey].total + Number(item.amount)
      )
    }
  }

  const dedupeRows = (rows = []) => {
    const seen = new Set()
    return rows.filter((row) => {
      const key = [
        row?.rowIndex ?? '',
        row?.pageNumber ?? '',
        row?.reason ?? '',
        String(row?.raw || row?.text || '').trim(),
      ].join('|')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  const isInformationalMultiline = (reason, rawText) => {
    const normalizedReason = String(reason || '').toLowerCase()
    const normalizedText = normalizeMockText(rawText || '')
    if (!normalizedText) return false
    if (normalizedReason === 'multiline_description_attached') return true
    if (!['probable_movement_multiline_unresolved', 'probable_movement_missing_date', 'probable_movement_missing_amount'].includes(normalizedReason)) return false
    return /(giroconto|quota capitale|interessi|spese|commissioni)/i.test(normalizedText)
  }

  const isBlockingReviewReason = (reason) => {
    const normalized = String(reason || '').toLowerCase()
    if (!normalized) return false
    if (normalized === 'multiline_description_attached') return false
    if (normalized === 'probable_movement_multiline_unresolved') return false
    return /probable_|unknown_unparsed|direction_fallback|direction_ambiguous|mismatch|ambiguous|low_confidence|missing_/i.test(normalized)
  }

  movements.forEach((movement, index) => {
    const sourceMeta = movement.sourceMeta || {}
    const directionSource = normalizeDirectionSource(sourceMeta.directionSource)
    const detectedColumn = sourceMeta.detectedColumn || 'unknown'
    const lowConfidence = Number(movement.parseConfidence || 0) < 70
    const suspiciousDirection =
      directionSource === 'ambiguous' ||
      directionSource === 'semantic_fallback' ||
      (directionSource === 'keyword_fallback' && lowConfidence) ||
      (directionSource === 'signed_amount' && lowConfidence && detectedColumn === 'unknown')
    if (suspiciousDirection || lowConfidence || detectedColumn === 'unknown') {
      pushSuspect({
        movementId: movement.movementId || movement.id || `movement-${index}`,
        rawRowId: sourceMeta.rawRowId ?? index,
        pageNumber: sourceMeta.pageNumber || 0,
        rawText: sourceMeta.rawText || movement.descriptionRaw || '',
        amount: Number(movement.amount || 0),
        direction: movement.direction || '',
        detectedColumn,
        confidence: Number(movement.parseConfidence || 0),
        reason: [
          suspiciousDirection ? 'direction_fallback' : '',
          lowConfidence ? 'low_confidence' : '',
          detectedColumn === 'unknown' ? 'detectedColumn_unknown' : '',
        ].filter(Boolean).join('+') || 'suspicious_movement',
      })
    }
  })

  const rawAmountPatterns = dedupeRows([
    ...(parsed.ignoredRows || []),
    ...(parsed.rejectedRows || []),
    ...(parsed.blockedRows || []),
  ])
  rawAmountPatterns.forEach((row, index) => {
    const rawText = String(row.raw || row.text || '').trim()
    if (!rawText) return
    const amountValues = extractAmountCandidates(rawText)
    if (!amountValues.length) return
    const detectedColumn = inferRawColumn(rawText)
    const reason = row.reason || 'unknown_unparsed'
    const isRelevant = /probable_movement_|unknown_unparsed|missing_amount|missing_date|missing_direction|missing_description|multiline_unresolved/i.test(reason)
    if (!isRelevant) return
    if (isInformationalMultiline(reason, rawText)) {
      informationalRows.push({
        rawRowId: row.rowIndex ?? index,
        pageNumber: row.pageNumber || 0,
        rawText,
        reason,
        category: 'multiline_info',
      })
      return
    }
    amountValues.forEach((amount, amountIndex) => {
      pushSuspiciousRaw({
        rawRowId: row.rowIndex ?? index,
        pageNumber: row.pageNumber || 0,
        rawText,
        amount: roundToCents(amount),
        direction: detectedColumn === 'out' ? 'out' : detectedColumn === 'in' ? 'in' : '',
        detectedColumn,
        confidence: reason && /^probable_movement_/.test(reason) ? 55 : 30,
        reason,
        amountIndex,
      })
    })
  })

  const ignoredSources = dedupeRows([
    ...(parsed.rejectedRows || []),
    ...(parsed.ignoredRows || []),
    ...(parsed.blockedRows || []),
    ...(parsed.needsReviewRows || []),
  ])

  ignoredSources.forEach((row, index) => {
    const rawText = String(row.raw || row.text || '').trim()
    const probableReason = row.reason || 'unknown_unparsed'
    if (isInformationalMultiline(probableReason, rawText)) {
      informationalRows.push({
        rawRowId: row.rowIndex ?? index,
        pageNumber: row.pageNumber || 0,
        rawText,
        reason: probableReason,
        category: 'multiline_info',
      })
      return
    }
    const amountCandidatesInText = extractAmountCandidates(rawText)
    const hasAmount = amountCandidatesInText.length > 0
    const hasDate = /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}\b|\b\d{4}-\d{2}-\d{2}\b/.test(rawText)
    const isRelevant = /probable_movement_/i.test(probableReason) || (probableReason === 'unknown_unparsed' && (hasAmount || hasDate) && /incass|pagament|bonific|addebito|accredito|trasferim|assegno|f24|commission|spese|bollo|moviment|versament|prelievo/i.test(normalizeMockText(rawText)) && !['empty_line','page_header','bank_header','statement_header','table_header','customer_data','opening_balance','closing_balance','statement_summary','totals_row','legal_footer','page_footer','non_movement_text'].includes(probableReason))

    if (isRelevant) {
      const rawAmount = amountCandidatesInText[amountCandidatesInText.length - 1] ?? null
      pushSuspect({
        rawRowId: row.rowIndex ?? index,
        pageNumber: row.pageNumber || 0,
        rawText,
        amount: rawAmount,
        direction: '',
        detectedColumn: rawText.includes('entrate') ? 'in' : rawText.includes('uscite') ? 'out' : 'unknown',
        confidence: row.reason && /^probable_movement_/.test(row.reason) ? 55 : 28,
        reason: probableReason,
      })
    }
  })

  const filteredReviewItems = reviewItems.filter((item) => isBlockingReviewReason(item.reason))

  const exactDeltaTargets = [358, 1025, 700]
  const exactDeltaMatches = suspectItems.filter((item) => {
    const amount = roundToCents(Number(item.amount || 0))
    const normalizedText = normalizeMockText(item.rawText || '')
    return exactDeltaTargets.includes(amount) && /(trasferim|assegno|pagamento|addebito|bonifico a|spese|prelievo|f24|bollo|uscita)/i.test(normalizedText)
  })

  const exactDeltaMatchAmount = roundToCents(exactDeltaMatches.reduce((sum, item) => sum + Number(item.amount || 0), 0))
  const residualDeltaAfterDirectionFix = {
    entries: summary.entriesTotal == null ? null : roundToCents((movements.reduce((sum, movement) => sum + (movement.direction === 'in' ? Number(movement.amount || 0) : 0), 0) - exactDeltaMatchAmount) - summary.entriesTotal),
    exits: summary.exitsTotal == null ? null : roundToCents((movements.reduce((sum, movement) => sum + (movement.direction === 'out' ? Number(movement.amount || 0) : 0), 0) + exactDeltaMatchAmount) - summary.exitsTotal),
    balance: summary.closingBalance == null || summary.openingBalance == null
      ? null
      : roundToCents(
          (summary.openingBalance + movements.reduce((sum, movement) => sum + (movement.direction === 'in' ? Number(movement.amount || 0) : 0), 0) - movements.reduce((sum, movement) => sum + (movement.direction === 'out' ? Number(movement.amount || 0) : 0), 0)) - (2 * exactDeltaMatchAmount) - summary.closingBalance
        ),
    fixAmount: exactDeltaMatchAmount,
    itemCount: exactDeltaMatches.length,
  }

  const summaryTargets = [
    summary.entriesTotal != null ? roundToCents(summary.entriesTotal) : null,
    summary.exitsTotal != null ? roundToCents(summary.exitsTotal) : null,
    summary.closingBalance != null ? roundToCents(summary.closingBalance) : null,
    2083,
    3043,
    5126,
    960,
  ].filter((value) => value != null)

  const deltaHints = buildNumericDeltaHints(amountCandidates, summaryTargets)
  const residualTargets = buildNumericDeltaHints(
    suspiciousRawAmounts.map((item) => item.amount).filter((value) => Number.isFinite(Number(value))),
    [960]
  )

  const candidateMissingOutflows = suspiciousRawAmounts.filter((item) =>
    roundToCents(Number(item.amount || 0)) === 960 ||
    residualTargets.some((hint) => hint.value === 960 && hint.items.some((candidate) => roundToCents(candidate) === roundToCents(Number(item.amount || 0))))
  )
  const candidateMissingInflows = suspiciousRawAmounts.filter((item) => item.detectedColumn === 'in' && roundToCents(Number(item.amount || 0)) === 960)

  const topSuspects = [...suspectItems]
    .sort((a, b) => {
      const aScore = Number(a.confidence || 0) + (a.reason && /probable_|unknown_unparsed/i.test(a.reason) ? 10 : 0)
      const bScore = Number(b.confidence || 0) + (b.reason && /probable_|unknown_unparsed/i.test(b.reason) ? 10 : 0)
      return aScore - bScore
    })
    .slice(0, 10)

  const directionAudit = buildDirectionAudit(movements)
  const movementAmountAudit = (() => {
    const strictAmounts = (text) => {
      const source = String(text || '')
      const matches = source.match(/(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}-?/g) || []
      return matches
        .map((match) => parseAmountFromRawText(match))
        .filter((amount) => amount != null)
    }

    const exactAmount910Rows = []
    const nearAmount910Rows = []
    const possibleMultipleAmountRows = []
    const possibleWrongAmountMovements = []
    const possibleWrongDirectionMovements = []
    const possibleExcludedOutMovements = []
    const suspiciousAmountsNearDelta = []
    const rawAmountPool = []

    movements.forEach((movement, index) => {
      const sourceMeta = movement.sourceMeta || {}
      const amountAudit = sourceMeta.amountAudit || {}
      const rawText = String(sourceMeta.rawText || movement.descriptionRaw || '').trim()
      const rawAmounts = strictAmounts(rawText)
      const selectedAmountCandidate = amountAudit.selectedAmountCandidate || null
      const rejectedAmountCandidates = Array.isArray(amountAudit.rejectedAmountCandidates) ? amountAudit.rejectedAmountCandidates : []
      const currentAmount = roundToCents(Number(movement.amount || 0))
      const detectedColumn = sourceMeta.detectedColumn || 'unknown'
      const directionSource = normalizeDirectionSource(sourceMeta.directionSource)
      const rawAmountMatch = rawAmounts.some((amount) => Math.abs(roundToCents(amount) - currentAmount) <= 0.01)
      const alternateAmount = rawAmounts.find((amount) => Math.abs(roundToCents(amount) - currentAmount) > 0.01) ?? null
      const directionMismatch =
        (movement.direction === 'out' && detectedColumn === 'in') ||
        (movement.direction === 'in' && detectedColumn === 'out')
      const directionFallback = directionSource === 'semantic_fallback' || directionSource === 'keyword_fallback' || directionSource === 'ambiguous'
      const multipleAmountsInRawRow = rawAmounts.length > 1
      const near910 = [908, 909, 910, 911, 912].some((value) =>
        Math.abs(currentAmount - value) <= 0.01 || rawAmounts.some((amount) => Math.abs(roundToCents(amount) - value) <= 0.01)
      )

      rawAmounts.forEach((amount) => {
        rawAmountPool.push({
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: roundToCents(amount),
          currentDirection: movement.direction || '',
          detectedColumn,
          reason: 'raw_amount_in_row',
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: 'manual_review',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        })
      })

      if (multipleAmountsInRawRow) {
        possibleMultipleAmountRows.push({
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: alternateAmount != null ? roundToCents(alternateAmount) : null,
          currentDirection: movement.direction || '',
          detectedColumn,
          reason: 'multiple_amounts_in_raw_row',
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: 'manual_review',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        })
      }

      if (!rawAmountMatch && alternateAmount != null) {
        possibleWrongAmountMovements.push({
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: roundToCents(alternateAmount),
          currentDirection: movement.direction || '',
          detectedColumn,
          reason: 'raw_amount_does_not_match_movement_amount',
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: 'manual_review',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        })
      }

      if (directionMismatch || directionFallback || detectedColumn === 'unknown') {
        const reason = directionMismatch
          ? 'direction_and_column_mismatch'
          : detectedColumn === 'unknown'
            ? 'detected_column_unknown'
            : directionSource === 'semantic_fallback'
              ? 'semantic_direction_fallback'
              : directionSource === 'keyword_fallback'
                ? 'keyword_direction_fallback'
                : directionSource === 'ambiguous'
                  ? 'direction_ambiguous'
                  : 'direction_not_from_column'
        const item = {
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: alternateAmount != null ? roundToCents(alternateAmount) : null,
          currentDirection: movement.direction || '',
          detectedColumn,
          reason,
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: directionMismatch ? 'verify_column' : 'manual_review',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        }
        possibleWrongDirectionMovements.push(item)
        if (movement.direction === 'out' && detectedColumn !== 'out') {
          possibleExcludedOutMovements.push(item)
        }
      }

      if (Math.abs(currentAmount - 910) <= 0.01) {
        exactAmount910Rows.push({
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: 910,
          currentDirection: movement.direction || '',
          detectedColumn,
          reason: 'exact_amount_910',
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: 'verify_direction',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        })
      }

      if (near910) {
        nearAmount910Rows.push({
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: alternateAmount != null ? roundToCents(alternateAmount) : currentAmount,
          currentDirection: movement.direction || '',
          detectedColumn,
          reason: 'near_amount_910',
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: 'manual_review',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        })
      }

      if (near910) {
        suspiciousAmountsNearDelta.push({
          movementId: movement.movementId || movement.id || `movement-${index}`,
          rawRowId: sourceMeta.rawRowId ?? index,
          pageNumber: sourceMeta.pageNumber || 0,
          rawText,
          currentAmount,
          candidateAmount: alternateAmount != null ? roundToCents(alternateAmount) : currentAmount,
          currentDirection: movement.direction || '',
          detectedColumn,
          reason: 'amount_near_delta_910',
          confidence: Number(movement.parseConfidence || 0),
          proposedAction: 'manual_review',
          selectedAmountCandidate,
          rejectedAmountCandidates,
        })
      }
    })

    const combinationCandidates910 = buildDeltaCombinationMatches(
      rawAmountPool.map((item) => ({
        amount: item.candidateAmount,
        movementId: item.movementId,
        rawRowId: item.rawRowId,
        pageNumber: item.pageNumber,
        rawText: item.rawText,
      })),
      910,
      3,
      0.01
    ).map((combo) => ({ ...combo, proposedAction: 'manual_review' }))

    const suspects = [
      ...possibleWrongAmountMovements,
      ...possibleWrongDirectionMovements,
      ...possibleExcludedOutMovements,
      ...exactAmount910Rows,
      ...nearAmount910Rows,
    ]

    const topSuspects910 = suspects
      .slice()
      .sort((a, b) => {
        const aScore = Math.abs(Number(a.currentAmount || 0) - 910) + (a.reason && /direction|amount|multiple/i.test(a.reason) ? -5 : 0)
        const bScore = Math.abs(Number(b.currentAmount || 0) - 910) + (b.reason && /direction|amount|multiple/i.test(b.reason) ? -5 : 0)
        return aScore - bScore
      })
      .slice(0, 10)
      .map((item) => ({
        ...item,
        contributesToDelta910: Math.abs(Number(item.currentAmount || 0) - 910) <= 0.01 || Math.abs(Number(item.candidateAmount || 0) - 910) <= 0.01,
      }))

    return {
      exactAmount910Rows,
      nearAmount910Rows,
      possibleWrongAmountMovements,
      possibleWrongDirectionMovements,
      possibleExcludedOutMovements,
      possibleMultipleAmountRows,
      suspiciousAmountsNearDelta,
      rawAmountPool,
      combinationCandidates910,
      topSuspects910,
      runningBalanceAudit: {
        available: false,
        firstDivergenceMovementId: null,
        firstDivergencePage: null,
        expectedRunningBalance: null,
        calculatedRunningBalance: null,
        differenceAtPoint: null,
        reason: 'running_balance_not_available_in_pdf_layout',
      },
    }
  })()
  const totalEntrate = movements.reduce((sum, movement) => sum + (movement.direction === 'in' ? Number(movement.amount || 0) : 0), 0)
  const totalUscite = movements.reduce((sum, movement) => sum + (movement.direction === 'out' ? Number(movement.amount || 0) : 0), 0)
  const residualInDelta = summary.entriesTotal == null ? null : roundToCents(totalEntrate - summary.entriesTotal)
  const residualOutDelta = summary.exitsTotal == null ? null : roundToCents(totalUscite - summary.exitsTotal)
  const deltaResidual = summary.closingBalance == null || summary.openingBalance == null
    ? null
    : roundToCents(
        roundToCents(summary.openingBalance + totalEntrate - totalUscite) - roundToCents(summary.closingBalance)
      )
  const hasOfficialSummary = summary.openingBalance != null && summary.entriesTotal != null && summary.exitsTotal != null && summary.closingBalance != null
  const isFullyBalanced =
    hasOfficialSummary &&
    deltaResidual != null && Math.abs(Number(deltaResidual)) <= 0.01 &&
    residualInDelta != null && Math.abs(Number(residualInDelta)) <= 0.01 &&
    residualOutDelta != null && Math.abs(Number(residualOutDelta)) <= 0.01
  const strictBlockingReviewItems = isFullyBalanced
    ? filteredReviewItems.filter((item) => /missing_date|missing_amount|missing_direction|missing_description|direction_ambiguous|direction_and_column_mismatch/i.test(item.reason || ''))
    : filteredReviewItems
  const hasDelta910Case = [
    deltaResidual,
    residualOutDelta,
    residualDeltaAfterDirectionFix.balance,
    residualDeltaAfterDirectionFix.exits,
  ].some((value) => value != null && Math.abs(Number(value)) === 910)
  const exactAmountMatches910 = hasDelta910Case ? movementAmountAudit.exactAmount910Rows : []
  const suspiciousAmountsNearDelta = hasDelta910Case ? movementAmountAudit.suspiciousAmountsNearDelta : []
  const combinationMatches910 = hasDelta910Case ? movementAmountAudit.combinationCandidates910 : []
  const rawRowsWithAmountButNoMovement = movementAmountAudit.rawAmountPool.slice(0, 20)
  const topSuspects910 = hasDelta910Case ? movementAmountAudit.topSuspects910 : []
  const reviewRowsPreview = strictBlockingReviewItems
    .slice(0, 10)
    .map((item) => ({
      rawRowId: item.rawRowId ?? item.movementId ?? '',
      pageNumber: item.pageNumber || 0,
      rawText: item.rawText || '',
      amount: Number.isFinite(Number(item.amount)) ? roundToCents(Number(item.amount)) : null,
      reason: item.reason || 'unknown',
      contributesToDelta910: Number.isFinite(Number(item.amount)) && Math.abs(roundToCents(Number(item.amount)) - 910) <= 0.01,
    }))

  return {
    suspectItems,
    reviewItems: strictBlockingReviewItems,
    reviewRowsBlocking: strictBlockingReviewItems.length,
    reviewRowsInfo: informationalRows.length,
    informationalRows,
    topSuspects,
    topSuspects910,
    deltaHints,
    exactDeltaMatches,
    exactAmountMatches910,
    combinationMatches910,
    residualDeltaAfterDirectionFix,
    candidateMissingOutflows,
    candidateMissingInflows,
    rawRowsWithAmountButNoMovement,
    suspiciousRawAmounts,
    suspiciousAmountsNearDelta,
    reviewRowsPreview,
    unpromotedAmountsByColumn,
    directionAudit,
    movementAmountAudit,
    deltaResidual,
    residualOutDelta,
    hasDelta910Case,
    residualDeltaAfterDirectionFix910: deltaResidual,
    delta910: {
      residual: deltaResidual,
      residualOutDelta,
      enabled: hasDelta910Case,
      exactAmountMatches910,
      combinationMatches910,
      candidateMissingOutflows,
      candidateMissingInflows,
      rawRowsWithAmountButNoMovement,
      suspiciousAmountsNearDelta,
    },
    documentMeta,
    selectedMeta,
    mismatch: Boolean(
      documentMeta && selectedMeta && (
        (documentMeta.bankName && selectedMeta.bankName && normalizeMockText(documentMeta.bankName) !== normalizeMockText(selectedMeta.bankName)) ||
        (documentMeta.iban && selectedMeta.iban && normalizeMockText(documentMeta.iban) !== normalizeMockText(selectedMeta.iban)) ||
        (documentMeta.accountNumber && (selectedMeta.accountCode || selectedMeta.accountNumber) && normalizeMockText(documentMeta.accountNumber) !== normalizeMockText(selectedMeta.accountCode || selectedMeta.accountNumber))
      )
    ),
  }
}

function buildAuditOutcome({
  movements,
  summary,
  parsed,
  deltaDiagnostics = {},
}) {
  const totalEntrate = movements.reduce((sum, movement) => sum + (movement.direction === 'in' ? Number(movement.amount || 0) : 0), 0)
  const totalUscite = movements.reduce((sum, movement) => sum + (movement.direction === 'out' ? Number(movement.amount || 0) : 0), 0)
  const calculatedClosingBalance = summary.openingBalance == null
    ? null
    : roundToCents(Number(summary.openingBalance) + totalEntrate - totalUscite)
  const entriesDiff = summary.entriesTotal == null ? null : roundToCents(totalEntrate - summary.entriesTotal)
  const exitsDiff = summary.exitsTotal == null ? null : roundToCents(totalUscite - summary.exitsTotal)
  const balanceDiff = summary.closingBalance == null || calculatedClosingBalance == null
    ? null
    : roundToCents(calculatedClosingBalance - summary.closingBalance)
  const averageMovementConfidence = movements.length
    ? roundToCents(movements.reduce((sum, movement) => sum + Number(movement.parseConfidence || 0), 0) / movements.length)
    : 0
  const minimumMovementConfidence = movements.length
    ? roundToCents(Math.min(...movements.map((movement) => Number(movement.parseConfidence || 0))))
    : 0

  const hasStrongReviewRows = [
    ...(parsed.ignoredRows || []),
    ...(parsed.rejectedRows || []),
    ...(deltaDiagnostics.reviewItems || []),
  ].some((row) => /^(probable_movement_|unknown_unparsed$)/.test(row.reason || ''))
  const hasReviewRows = Boolean(
    (parsed.blockedRows || []).length ||
    (parsed.needsReviewRows || []).length ||
    Number(deltaDiagnostics.reviewRowsBlocking || (deltaDiagnostics.reviewItems || []).length) > 0 ||
    hasStrongReviewRows
  )
  const hasRelevantUnknown = (parsed.ignoredRows || []).some((row) => row.reason === 'unknown_unparsed' || row.reason === 'probable_movement_missing_amount' || row.reason === 'probable_movement_missing_date' || row.reason === 'probable_movement_multiline_unresolved')
  const hasAmbiguousRows = (parsed.ignoredRows || []).some((row) => /^probable_movement_/.test(row.reason || ''))
  const hasDuplicateSuspicious = (movements || []).some((movement) => movement.duplicateStatus && movement.duplicateStatus !== 'unique')
  const parsedHasCompleteMovements = Boolean(
    movements.length &&
    movements.every((movement) =>
      movement.operationDate &&
      Number.isFinite(Number(movement.amount)) &&
      Number(movement.amount) > 0 &&
      (movement.direction === 'in' || movement.direction === 'out') &&
      String(movement.descriptionRaw || '').trim()
    )
  )

  const hasOfficialSummary = summary.openingBalance != null && summary.entriesTotal != null && summary.exitsTotal != null && summary.closingBalance != null
  const hasAmbiguousOrRelevantIssues =
    hasAmbiguousRows || hasRelevantUnknown || hasDuplicateSuspicious || !parsedHasCompleteMovements || Boolean((deltaDiagnostics.reviewItems || []).length)
  const meetsHighConfidence = !hasOfficialSummary &&
    parsedHasCompleteMovements &&
    !hasAmbiguousRows &&
    !hasRelevantUnknown &&
    !hasDuplicateSuspicious &&
    !(deltaDiagnostics.reviewItems || []).length &&
    averageMovementConfidence >= 70 &&
    minimumMovementConfidence >= 55

  let parseStatus = 'parsed_with_review'
  if (!movements.length) {
    parseStatus = 'failed_parse'
  } else if (hasOfficialSummary && entriesDiff === 0 && exitsDiff === 0 && balanceDiff === 0 && !hasReviewRows) {
    parseStatus = 'parsed_balanced'
  } else if (hasOfficialSummary && (entriesDiff !== 0 || exitsDiff !== 0 || balanceDiff !== 0)) {
    parseStatus = 'parsed_unbalanced'
  } else if (hasReviewRows) {
    parseStatus = 'parsed_with_review'
  } else {
    parseStatus = 'parsed_with_review'
  }

  const reliabilityLevel = !movements.length
    ? 'blocked'
    : hasOfficialSummary && parseStatus === 'parsed_balanced'
      ? 'certified_balanced'
      : hasOfficialSummary && parseStatus === 'parsed_unbalanced'
        ? 'blocked'
      : !hasOfficialSummary && meetsHighConfidence
        ? 'high_confidence'
      : hasAmbiguousOrRelevantIssues
          ? 'blocked'
          : hasReviewRows
            ? 'needs_review'
            : 'needs_review'

  const differences = {
    entries: entriesDiff,
    exits: exitsDiff,
    balance: balanceDiff,
  }

  const blockingReasons = []
  if (reliabilityLevel !== 'certified_balanced' && reliabilityLevel !== 'high_confidence') {
    if (hasOfficialSummary && (summary.openingBalance == null || summary.entriesTotal == null || summary.exitsTotal == null || summary.closingBalance == null)) {
      blockingReasons.push('riepilogo_pdf_non_completo')
    }
    if (hasOfficialSummary && entriesDiff != null && entriesDiff !== 0) blockingReasons.push('entrate_non_quadrano')
    if (hasOfficialSummary && exitsDiff != null && exitsDiff !== 0) blockingReasons.push('uscite_non_quadrano')
    if (hasOfficialSummary && balanceDiff != null && balanceDiff !== 0) blockingReasons.push('saldo_finale_non_quadra')
    if (hasStrongReviewRows || hasAmbiguousRows) blockingReasons.push('righe_probabili_non_risolte')
    if ((deltaDiagnostics.reviewItems || []).length) blockingReasons.push('audit_delta_non_risolto')
    if (hasRelevantUnknown) blockingReasons.push('righe_non_classificate')
    if (!movements.length) blockingReasons.push('nessun_movimento_valido')
  }

  const parseConfidence = reliabilityLevel === 'certified_balanced'
    ? 96
    : reliabilityLevel === 'high_confidence'
      ? Math.max(74, minimumMovementConfidence)
      : reliabilityLevel === 'needs_review'
        ? 60
        : 18

  return {
    parseStatus,
    parseReliabilityLevel: reliabilityLevel,
    status: ['certified_balanced', 'high_confidence'].includes(reliabilityLevel)
      ? 'parsed'
      : parseStatus === 'failed_parse'
        ? 'failed'
        : reliabilityLevel === 'blocked'
          ? 'blocked'
          : 'needs_review',
    parseConfidence,
    averageMovementConfidence,
    minimumMovementConfidence,
    totalEntrate,
    totalUscite,
    calculatedClosingBalance,
    differences,
    hasReviewRows,
    hasStrongReviewRows,
    blockingReasons,
    confirmationBlockedReason: parseStatus === 'parsed_balanced'
      ? ''
      : reliabilityLevel === 'high_confidence'
        ? ''
        : blockingReasons.length
          ? `Audit non quadrato: ${blockingReasons.join(', ')}`
          : 'Audit non quadrato',
  }
}

export async function buildBankStatementImportDraft(file, context = {}) {
  const sourceFileType = detectBankStatementFileType(file)
  const sourceFileHash = createFileHashFallback(file)
  const importedAt = new Date().toISOString()
  const maxPdfPagesToParse = 999

  const statementDraft = {
    statementId: `st-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    companyId: context.companyId || '',
    bankAccountId: context.bankAccountId || '',
    bankName: context.bankName || '',
    iban: context.iban || '',
    accountCode: context.accountCode || '',
    sourceFile: file || null,
    sourceFileName: file?.name || '',
    sourceFileType,
    sourceFileSize: file?.size || 0,
    sourceFileHash,
    importedAt,
    importedBy: context.importedBy || '',
    profile: 'generic_statement_v1',
    profileLabel: 'Generico',
    periodStart: context.periodStart || '',
    periodEnd: context.periodEnd || '',
    openingBalance: context.openingBalance ?? null,
    closingBalance: context.closingBalance ?? null,
    calculatedClosingBalance: context.closingBalance ?? null,
    balanceDifference: context.balanceDifference ?? null,
    currency: context.currency || 'EUR',
    parseConfidence: 0,
    parseReliabilityLevel: 'blocked',
    parseStatus: 'uploaded',
    status: 'uploaded',
    totalRawRows: 0,
    ignoredRows: 0,
    parsedMovements: 0,
    rejectedRows: 0,
    blockedRows: 0,
    needsReviewRows: 0,
    parseWarnings: [],
    ignoredReasonSummary: {},
    pdfSummary: {
      openingBalance: null,
      entriesTotal: null,
      exitsTotal: null,
      exitsTotalSigned: null,
      closingBalance: null,
      periodStart: context.periodStart || '',
      periodEnd: context.periodEnd || '',
      periodLabel: '',
      iban: context.iban || '',
      accountCode: context.accountCode || '',
    },
    audit: null,
    confirmationBlockedReason: '',
    warnings: [],
    errors: [],
    movements: [],
    documentAccount: {
      bankName: '',
      iban: '',
      bic: '',
      accountNumber: '',
      holder: '',
    },
    selectedBankAccount: {
      bankName: context.bankName || '',
      iban: context.iban || '',
      accountNumber: context.accountCode || '',
      holder: '',
    },
  }

  if (!file) {
    statementDraft.errors.push('missing_file')
    statementDraft.parseStatus = 'failed_parse'
    statementDraft.status = 'failed'
    return statementDraft
  }

  if (sourceFileType === 'unsupported') {
    statementDraft.parseStatus = 'unsupported'
    statementDraft.status = 'unsupported'
    statementDraft.parseReliabilityLevel = 'blocked'
    statementDraft.warnings.push('Formato non supportato')
    return statementDraft
  }

  if (sourceFileType === 'image_candidate') {
    statementDraft.parseStatus = 'needs_ocr'
    statementDraft.status = 'needs_review'
    statementDraft.parseReliabilityLevel = 'needs_ocr'
    statementDraft.warnings.push('Immagine da OCR/AI')
    return statementDraft
  }

  try {
    statementDraft.parseStatus = 'parsing'
    statementDraft.status = 'parsing'

    let text = ''
    if (sourceFileType === 'csv_candidate') {
      text = await file.text()
    } else if (sourceFileType === 'spreadsheet_candidate') {
      text = await readSpreadsheetText(file)
    } else if (sourceFileType === 'pdf_pending_parse') {
      text = await extractPDFText(file, { maxPages: maxPdfPagesToParse })
      statementDraft.sourceFileType = String(text || '').replace(/\s/g, '').length >= 200
        ? 'pdf_digital_candidate'
        : 'pdf_scanned_candidate'
    }

    if (!String(text || '').trim()) {
      statementDraft.parseStatus = sourceFileType === 'pdf_pending_parse' ? 'needs_ocr' : 'failed_parse'
      statementDraft.status = sourceFileType === 'pdf_pending_parse' ? 'needs_review' : 'failed'
      statementDraft.parseReliabilityLevel = sourceFileType === 'pdf_pending_parse' ? 'needs_ocr' : 'blocked'
      statementDraft.warnings.push(
        sourceFileType === 'pdf_pending_parse' ? 'Da elaborare PDF' : 'Parsing automatico non disponibile'
      )
      return statementDraft
    }

    const pdfSummary = extractStatementSummary(text)
    const documentMeta = extractDocumentMetadata(text)
    const detectedProfile = detectBankStatementProfile(text, {
      sourceFileName: statementDraft.sourceFileName,
    })
    const normalizedFileName = normalizeMockText(statementDraft.sourceFileName || '')
    const fileNameLooksLikeBanco = /banco di sardegna|sardegna/.test(normalizedFileName)
    const documentLooksLikeBanco =
      /banco di sardegna/i.test(documentMeta.bankName || '') ||
      /banco di sardegna/i.test(documentMeta.holder || '') ||
      /01015/i.test(documentMeta.accountNumber || '') ||
      /^IT96C0101503200000070745491$/i.test(documentMeta.iban || '')
    const resolvedProfile = detectedProfile.profile === 'generic_statement_v1' && (documentLooksLikeBanco || fileNameLooksLikeBanco)
      ? {
          profile: 'banco_sardegna_quarterly_statement_v1',
          profileLabel: 'Banco di Sardegna',
          confidence: 'fallback',
        }
      : detectedProfile
    const normalizedDocumentMetaBank = normalizeMockText(documentMeta.bankName || '')
    const normalizedProfileBank = normalizeMockText(resolvedProfile.profileLabel || '')
    const resolvedDocumentBankName = String(
      normalizedDocumentMetaBank && normalizedProfileBank && normalizedDocumentMetaBank !== normalizedProfileBank
        ? resolvedProfile.profileLabel
        : (documentMeta.bankName || resolvedProfile.profileLabel || '')
    ).trim()

    const documentAccount = {
      bankName: resolvedDocumentBankName,
      iban: documentMeta.iban || statementDraft.iban || '',
      bic: documentMeta.bic || '',
      accountNumber: documentMeta.accountNumber || statementDraft.accountCode || '',
      holder: documentMeta.holder || '',
    }
    const selectedBankAccount = {
      bankName: context.bankName || '',
      iban: context.iban || '',
      accountNumber: context.accountCode || '',
      holder: context.holder || '',
    }
    statementDraft.documentAccount = documentAccount
    statementDraft.selectedBankAccount = selectedBankAccount
    statementDraft.bankName = selectedBankAccount.bankName || statementDraft.bankName || ''
    statementDraft.iban = documentAccount.iban || statementDraft.iban || ''
    statementDraft.accountCode = documentAccount.accountNumber || statementDraft.accountCode || ''

    // Route all Banco di Sardegna sub-profiles to the dedicated parser
    const isBancoProfile = /^banco_sardegna_|^banco_di_sardegna_/.test(resolvedProfile.profile)
    const parsed = isBancoProfile
      ? parseBancoDiSardegnaStatement(text, {
          statementId: statementDraft.statementId,
          bankAccountId: statementDraft.bankAccountId,
          sourceFileName: statementDraft.sourceFileName,
          sourceFileType: statementDraft.sourceFileType,
          parseMode: sourceFileType,
        })
      : parseBankStatementTextRows(text, {
          statementId: statementDraft.statementId,
          bankAccountId: statementDraft.bankAccountId,
          sourceFileName: statementDraft.sourceFileName,
          sourceFileType: statementDraft.sourceFileType,
          parseMode: sourceFileType,
        })

    const effectiveNeedsReviewRows = (parsed.needsReviewRows || []).filter(
      (row) => !isInformationalNeedsReviewMovement(row)
    )
    const parsedForAudit = {
      ...parsed,
      needsReviewRows: effectiveNeedsReviewRows,
    }

    const movements = parsed.movements.map((movement, index) =>
      normalizeBankMovement(
        {
          ...movement,
          rowIndex: index,
          bankAccountId: statementDraft.bankAccountId,
          statementId: statementDraft.statementId,
        },
        {
          statementId: statementDraft.statementId,
          bankAccountId: statementDraft.bankAccountId,
          sourceFileName: statementDraft.sourceFileName,
          sourceFileType: statementDraft.sourceFileType,
          parseMode: sourceFileType,
        }
      )
    )

    const deltaDiagnostics = buildDeltaDiagnostics({
      movements,
      parsed: parsedForAudit,
      summary: pdfSummary,
      documentMeta,
      selectedMeta: selectedBankAccount,
    })

    const dedupCounter = movements.reduce((map, movement) => {
      const key = movement.dedupKey || ''
      map.set(key, (map.get(key) || 0) + 1)
      return map
    }, new Map())

    statementDraft.movements = movements.map((movement) => {
      const duplicateCountForKey = dedupCounter.get(movement.dedupKey || '') || 0
      const isDuplicate = duplicateCountForKey > 1
      return {
        ...movement,
        duplicateStatus: isDuplicate ? 'duplicate_suspected' : 'unique',
        status: isDuplicate
          ? 'duplicate'
          : movement.status ||
            (movement.amount > 0 && movement.operationDate ? 'imported' : 'blocked'),
      }
    })
    statementDraft.documentMeta = documentAccount
    statementDraft.profile = parsed.profile || resolvedProfile.profile
    statementDraft.profileLabel = parsed.profileLabel || resolvedProfile.profileLabel
    statementDraft.selectedAccountMeta = selectedBankAccount
    statementDraft.accountMismatchWarning = deltaDiagnostics.mismatch
      ? 'Il conto selezionato non coincide con il conto rilevato nel documento.'
      : ''
    statementDraft.auditReviewRows = Math.max(
      effectiveNeedsReviewRows.length,
      Number(deltaDiagnostics.reviewRowsBlocking || deltaDiagnostics.reviewItems.length || 0),
    )
    statementDraft.deltaDiagnostics = deltaDiagnostics
    statementDraft.totalRawRows = parsed.rawRows.length
    statementDraft.ignoredRows = parsed.ignoredRows.length
    statementDraft.ignoredReasonSummary = parsed.ignoredRows.reduce((acc, row) => {
      const key = row.reason || 'unknown'
      acc[key] = (acc[key] || 0) + 1
      return acc
    }, {})
    statementDraft.parsedMovements = movements.length
    statementDraft.rejectedRows = parsed.rejectedRows.length
    statementDraft.blockedRows = parsed.blockedRows.length
    statementDraft.needsReviewRows = Math.max(
      effectiveNeedsReviewRows.length,
      Number(deltaDiagnostics.reviewRowsBlocking || deltaDiagnostics.reviewItems.length || 0)
    )
    statementDraft.parseWarnings = [...parsed.parseWarnings]
    statementDraft.pdfSummary = {
      ...pdfSummary,
      periodStart: pdfSummary.periodStart || context.periodStart || '',
      periodEnd: pdfSummary.periodEnd || context.periodEnd || '',
      periodLabel: pdfSummary.periodLabel || [context.periodStart, context.periodEnd].filter(Boolean).join(' - '),
    }
    const audit = buildAuditOutcome({
      movements: statementDraft.movements,
      summary: statementDraft.pdfSummary,
      parsed: parsedForAudit,
      deltaDiagnostics,
    })
    if (deltaDiagnostics.mismatch) {
      audit.parseReliabilityLevel = 'blocked'
      audit.status = 'blocked'
      audit.confirmationBlockedReason = statementDraft.accountMismatchWarning
        || 'Il conto selezionato non coincide con il conto rilevato nel documento.'
      audit.blockingReasons = Array.from(new Set([
        ...(audit.blockingReasons || []),
        'conto_documento_non_coincidente',
      ]))
    }
    statementDraft.periodStart = statementDraft.pdfSummary.periodStart || statementDraft.periodStart
    statementDraft.periodEnd = statementDraft.pdfSummary.periodEnd || statementDraft.periodEnd
    statementDraft.openingBalance = statementDraft.pdfSummary.openingBalance ?? statementDraft.openingBalance
    statementDraft.closingBalance = statementDraft.pdfSummary.closingBalance ?? statementDraft.closingBalance
    statementDraft.calculatedClosingBalance = audit.calculatedClosingBalance ?? statementDraft.calculatedClosingBalance
    statementDraft.balanceDifference = audit.differences.balance ?? statementDraft.balanceDifference
    if (statementDraft.pdfSummary.iban) {
      statementDraft.iban = statementDraft.pdfSummary.iban
    }
    if (statementDraft.pdfSummary.accountCode) {
      statementDraft.accountCode = statementDraft.pdfSummary.accountCode
    }
    statementDraft.audit = {
      ...audit,
      rawRows: parsed.rawRows.length,
      ignoredRows: parsed.ignoredRows.length,
      rejectedRows: parsed.rejectedRows.length,
      blockedRows: parsed.blockedRows.length,
      needsReviewRows: statementDraft.needsReviewRows,
      movements: movements.length,
      ignoredReasonSummary: statementDraft.ignoredReasonSummary,
      deltaDiagnostics,
    }
    statementDraft.parseConfidence = audit.parseConfidence
    statementDraft.parseReliabilityLevel = audit.parseReliabilityLevel || 'needs_review'
    statementDraft.parseStatus = audit.parseStatus
    statementDraft.status = audit.status
    statementDraft.warnings = [...parsed.warnings]
    statementDraft.confirmationBlockedReason = audit.confirmationBlockedReason
    if (!movements.length) {
      statementDraft.warnings.push('Nessun movimento bancario riconosciuto con sufficiente affidabilita')
    }
    if (statementDraft.accountMismatchWarning) {
      statementDraft.warnings.push(statementDraft.accountMismatchWarning)
    }
    if (audit.blockingReasons.length) {
      statementDraft.warnings.push(...audit.blockingReasons)
    }
    if (Math.abs(Number(audit.differences.balance || 0)) > 0.01 && deltaDiagnostics.exactDeltaMatches.length) {
      statementDraft.warnings.push(`Delta 2083 rilevato su ${deltaDiagnostics.exactDeltaMatches.length} movimenti sospetti`)
    }
    if (Math.abs(Number(audit.differences.balance || 0)) > 0.01 && deltaDiagnostics.candidateMissingOutflows.length) {
      statementDraft.warnings.push(`Candidati 960 rilevati: ${deltaDiagnostics.candidateMissingOutflows.length}`)
    }
    const duplicateCount = statementDraft.movements.filter((movement) => movement.duplicateStatus !== 'unique').length
    if (duplicateCount > 0) {
      statementDraft.warnings.push(`${duplicateCount} duplicati sospetti`)
    }
    statementDraft.errors = [...parsed.errors]
    return statementDraft
  } catch (error) {
    statementDraft.parseStatus = 'failed_parse'
    statementDraft.status = 'failed'
    statementDraft.parseReliabilityLevel = sourceFileType === 'image_candidate' ? 'needs_ocr' : 'blocked'
    statementDraft.errors.push(error?.message || 'parse_failed')
    return statementDraft
  }
}
