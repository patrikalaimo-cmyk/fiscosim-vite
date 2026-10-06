import { isDefaultPerAliquotaFlag } from '../../../shared/utils/resolveIva.js'

function parseAiRaw(raw) {
  if (!raw) return {}
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw
  if (typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  const normalized = String(value ?? '').trim().replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : NaN
}

function parseAliquota(value) {
  const cleaned = String(value ?? '').replace(/[%\s]/g, '').replace(',', '.').trim()
  if (!cleaned) return null
  const parsed = Number(cleaned)
  if (!Number.isFinite(parsed)) return null
  return Math.round(parsed * 100) / 100
}

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

function normalizeNature(value) {
  return String(value || '').trim().toUpperCase()
}

function findCausaleById(causaliIva, id) {
  const key = String(id || '').trim()
  if (!key) return null
  return (causaliIva || []).find((row) => String(row?.id || '').trim() === key) || null
}

function findCausaleByCode(causaliIva, code) {
  const key = normalizeCode(code)
  if (!key) return null
  return (causaliIva || []).find((row) => normalizeCode(row?.codice) === key) || null
}

function isReverseNature(natura) {
  const value = String(natura || '').toLowerCase()
  return value.includes('n6') || value.includes('n7') || value.includes('rev')
}

export function resolveImportFattureIvaCausaleFromRow(row, causaliIva = []) {
  if (!row || !Array.isArray(causaliIva) || !causaliIva.length) return ''
  const explicitId = String(row?.causale_iva_id || '').trim()
  if (explicitId && findCausaleById(causaliIva, explicitId)) return explicitId

  const explicitCode = normalizeCode(row?.causale_iva_codice || row?.causale_iva)
  if (explicitCode) {
    const byCode = findCausaleByCode(causaliIva, explicitCode)
    if (byCode) return String(byCode.id)
  }

  let aliquota = parseAliquota(row?.aliquota)
  const imponibile = toNumber(row?.imponibile)
  const iva = toNumber(row?.imposta ?? row?.iva)
  if (aliquota == null && Number.isFinite(imponibile) && imponibile > 0 && Number.isFinite(iva) && iva >= 0) {
    aliquota = Math.round((iva / imponibile) * 10000) / 100
  }
  const natura = normalizeNature(row?.natura)
  if (aliquota == null) return ''

  const roundedAliquota = Math.round(aliquota)
  const expectedCode = roundedAliquota > 0 ? (isReverseNature(natura) ? `F${roundedAliquota}RC` : `F${roundedAliquota}`) : 'F0FC'
  const byExpectedCode = findCausaleByCode(causaliIva, expectedCode)
  if (byExpectedCode) return String(byExpectedCode.id)

  const byAliquota = causaliIva.find((c) => Math.round(Number(c?.aliquota ?? 0)) === roundedAliquota)
  return byAliquota ? String(byAliquota.id) : ''
}

export function extractImportFattureDocumentIvaRows(doc, causaliIva = []) {
  const raw = parseAiRaw(doc?.ai_raw_response)
  const riepilogo = Array.isArray(raw?.riepilogo_iva) ? raw.riepilogo_iva : []

  if (!riepilogo.length) {
    return [
      {
        index: 0,
        imponibile: raw?.imponibile != null ? String(raw.imponibile).trim() : '',
        iva: raw?.iva_totale != null ? String(raw.iva_totale).trim() : '',
        causale_iva_id: '',
        aliquota: null,
        natura: '',
      },
    ]
  }

  return riepilogo.map((row, index) => {
    const imponibile = row?.imponibile != null ? String(row.imponibile).trim() : ''
    const iva = row?.imposta != null ? String(row.imposta).trim() : row?.iva != null ? String(row.iva).trim() : ''
    const aliquota = parseAliquota(row?.aliquota)
    const natura = normalizeNature(row?.natura)
    const explicitCausaleId =
      String(row?.causale_iva_id || '').trim() ||
      String(findCausaleByCode(causaliIva, row?.causale_iva_codice || row?.causale_iva)?.id || '').trim()
    const causale_iva_id = explicitCausaleId || resolveImportFattureIvaCausaleFromRow(row, causaliIva)
    return {
      index,
      imponibile,
      iva,
      causale_iva_id,
      explicit_causale_iva_id: explicitCausaleId,
      aliquota,
      natura,
    }
  })
}

function findDefaultCausaleByPercent(causaliIva = [], aliquota = null) {
  const rounded = Math.round(Number(aliquota ?? NaN))
  if (!Number.isFinite(rounded)) return null
  return (
    (causaliIva || []).find(
      (row) =>
        Math.round(Number(row?.aliquota ?? NaN)) === rounded &&
        isDefaultPerAliquotaFlag(row?.is_default_per_aliquota),
    ) || null
  )
}

function isCausaleCompatibleWithDocument(causale, documentRows = []) {
  if (!causale) return false
  const candidateAliquota = Math.round(Number(causale?.aliquota ?? NaN))
  const rowAliquote = (documentRows || [])
    .map((row) => Math.round(Number(row?.aliquota ?? NaN)))
    .filter(Number.isFinite)
  if (!rowAliquote.length || !Number.isFinite(candidateAliquota)) return true
  return rowAliquote.every((aliquota) => aliquota === candidateAliquota)
}

function summarizeHistoricalCandidates(historicalDocs = [], causaliIva = [], documentRows = []) {
  const groups = new Map()
  const docAliquote = new Set(documentRows.map((row) => Math.round(Number(row?.aliquota ?? NaN))).filter(Number.isFinite))

  for (const row of historicalDocs || []) {
    const causale = findCausaleById(causaliIva, row?.causale_iva_codice) ||
      findCausaleByCode(causaliIva, row?.causale_iva_codice) ||
      findCausaleById(causaliIva, row?.causale_iva) ||
      findCausaleByCode(causaliIva, row?.causale_iva)
    if (!causale?.id) continue
    const key = String(causale.id)
    const current = groups.get(key) || {
      id: key,
      causale,
      count: 0,
      lastDate: '',
    }
    current.count += 1
    const candidateDate = String(row?.data_documento || row?.created_at || '').trim()
    if (candidateDate && (!current.lastDate || candidateDate > current.lastDate)) current.lastDate = candidateDate
    groups.set(key, current)
  }

  const total = [...groups.values()].reduce((sum, row) => sum + row.count, 0)
  const ranked = [...groups.values()]
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count
      return String(b.lastDate || '').localeCompare(String(a.lastDate || ''))
    })
    .map((row, index, list) => {
      const aliq = Math.round(Number(row?.causale?.aliquota ?? NaN))
      const compatibleWithDocument =
        !docAliquote.size || !Number.isFinite(aliq) || docAliquote.has(aliq) || documentRows.some((docRow) => String(docRow?.causale_iva_id || '') === row.id)
      const dominance = total > 0 ? row.count / total : 0
      const nextCount = index < list.length - 1 ? list[index + 1].count : 0
      const gap = row.count - nextCount
      const isStrong = row.count >= 2 && dominance >= 0.7 && gap >= 1
      return {
        ...row,
        dominance,
        gap,
        compatibleWithDocument,
        isStrong,
      }
    })
  return ranked.slice(0, 3)
}

export function buildImportFattureIvaProposal({
  doc,
  historicalDocs = [],
  causaliIva = [],
  masterCausaleIvaId = '',
} = {}) {
  const documentRows = extractImportFattureDocumentIvaRows(doc, causaliIva)
  const documentPrimary = documentRows.find((row) => String(row?.explicit_causale_iva_id || '').trim()) || null
  const documentCausaleId = String(documentPrimary?.causale_iva_id || '').trim()
  const documentAliquote = [...new Set(documentRows.map((row) => Math.round(Number(row?.aliquota ?? NaN))).filter(Number.isFinite))]
  const defaultByPercent = documentAliquote.length === 1 ? findDefaultCausaleByPercent(causaliIva, documentAliquote[0]) : null
  const masterCausale = findCausaleById(causaliIva, masterCausaleIvaId)
  const historicalSuggestions = summarizeHistoricalCandidates(historicalDocs, causaliIva, documentRows)
  const historicalTop = historicalSuggestions[0] || null
  const second = historicalSuggestions[1] || null

  let source = 'manual_review'
  let suggestedCausaleId = ''
  let warning = ''
  let status = 'review'

  if (masterCausale?.id && isCausaleCompatibleWithDocument(masterCausale, documentRows)) {
    source = 'anagrafica'
    suggestedCausaleId = String(masterCausale.id)
    status = 'strong'
  } else if (masterCausale?.id && !isCausaleCompatibleWithDocument(masterCausale, documentRows)) {
    warning = 'Causale IVA dell’anagrafica non coerente con il documento: proposta automatica non forzata.'
  }

  if (!suggestedCausaleId && historicalTop?.isStrong && historicalTop.compatibleWithDocument) {
    source = 'history'
    suggestedCausaleId = historicalTop.id
    status = 'strong'
  } else if (!suggestedCausaleId && documentCausaleId) {
    source = 'document'
    suggestedCausaleId = documentCausaleId
    status = 'suggested'
    if (historicalTop?.isStrong && !historicalTop.compatibleWithDocument && historicalTop.id !== documentCausaleId) {
      warning = 'Storico IVA e riepilogo documento non allineati: proposta documento mantenuta, verifica consigliata.'
      status = 'review'
    }
  } else if (!suggestedCausaleId && defaultByPercent?.id) {
    source = 'default_percentuale'
    suggestedCausaleId = String(defaultByPercent.id)
    status = 'suggested'
  } else if (!suggestedCausaleId && historicalTop) {
    source = 'manual_review'
    status = 'review'
    if (second && historicalTop.count === second.count) {
      warning = 'Storico IVA non dominante: piu causali usate per lo stesso soggetto.'
    } else if (!historicalTop.isStrong) {
      warning = 'Storico IVA presente ma non abbastanza chiaro per precompilare in automatico.'
    }
  }

  const prefillRows = documentRows.map((row, index) => {
    const current = String(row?.causale_iva_id || '').trim()
    if (current) return { ...row, suggested_causale_iva_id: current }
    if (source === 'document' && suggestedCausaleId && index === 0) {
      return { ...row, suggested_causale_iva_id: suggestedCausaleId }
    }
    if (source === 'history' && suggestedCausaleId) {
      const candidate = historicalTop?.causale || null
      const rowAliq = Math.round(Number(row?.aliquota ?? NaN))
      const candidateAliq = Math.round(Number(candidate?.aliquota ?? NaN))
      const compatible = !Number.isFinite(rowAliq) || !Number.isFinite(candidateAliq) || rowAliq === candidateAliq
      return { ...row, suggested_causale_iva_id: compatible ? suggestedCausaleId : '' }
    }
    return { ...row, suggested_causale_iva_id: '' }
  })

  return {
    source,
    status,
    suggestedCausaleId,
    warning,
    masterCausaleId: masterCausale?.id || '',
    historicalTop,
    historicalSuggestions,
    documentCausaleId,
    defaultByPercentId: defaultByPercent?.id || '',
    documentRows,
    prefillRows,
  }
}
