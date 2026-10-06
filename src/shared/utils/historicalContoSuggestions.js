const LEGAL_SUFFIXES = [
  'srl',
  's.r.l',
  'spa',
  's.p.a',
  'sas',
  's.a.s',
  'snc',
  's.n.c',
  'srls',
  's.r.l.s',
  'stp',
  'coop',
  'cooperativa',
  'societa',
  'societÃ ',
  'studio',
  'ditta',
  'impresa',
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeVat(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/^IT/i, '')
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase()
    .trim()
}

function parseDatiEstratti(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function parseAiRawResponse(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return raw
  if (typeof raw !== 'string') return {}
  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function stripLegalSuffixes(value) {
  const tokens = normalizeText(value).split(' ').filter(Boolean)
  return tokens.filter((token) => !LEGAL_SUFFIXES.includes(token)).join(' ').trim()
}

function tokenize(value) {
  return normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 3)
}

function jaccardSimilarity(left, right) {
  const a = new Set(tokenize(left))
  const b = new Set(tokenize(right))
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const token of a) {
    if (b.has(token)) inter += 1
  }
  const union = a.size + b.size - inter
  return union > 0 ? inter / union : 0
}

function daysSince(dateValue) {
  if (!dateValue) return null
  const ts = new Date(dateValue).getTime()
  if (!Number.isFinite(ts)) return null
  const diff = Date.now() - ts
  if (!Number.isFinite(diff) || diff < 0) return 0
  return diff / 86400000
}

function recencyWeight(dateValue) {
  const days = daysSince(dateValue)
  if (days == null) return 0
  return 1 / (1 + days / 90)
}

function formatRelativeAge(dateValue) {
  const days = daysSince(dateValue)
  if (days == null) return ''
  if (days < 1) return 'oggi'
  if (days < 7) return `${Math.max(1, Math.round(days))} gg fa`
  if (days < 30) return `${Math.max(1, Math.round(days / 7))} sett. fa`
  return `${Math.max(1, Math.round(days / 30))} mesi fa`
}

function clamp01(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(1, n))
}

function buildSearchBlob(doc = {}, accountLabel = '') {
  const dati = parseDatiEstratti(doc?.dati_estratti)
  const aiRaw = parseAiRawResponse(doc?.ai_raw_response)
  const rawLines = Array.isArray(dati?.linee) ? dati.linee : []
  const rawRiepilogo = Array.isArray(dati?.riepilogo_iva) ? dati.riepilogo_iva : []

  return normalizeText([
    doc?.soggetto_denominazione,
    doc?.ai_summary,
    doc?.filename,
    doc?.numero_documento,
    doc?.tipo_documento,
    doc?.causale_iva,
    doc?.causale_iva_codice,
    doc?.totale,
    doc?.imponibile,
    doc?.iva,
    accountLabel,
    dati?.cedente_denom,
    dati?.cessionario_denom,
    dati?.causale,
    dati?.contenuto,
    aiRaw?.causale,
    ...(aiRaw?.linee || []).map((r) => r?.descrizione || r?.desc || ''),
    ...(aiRaw?.riepilogo_iva || []).map((r) => r?.natura || ''),
    ...rawLines.map((r) => r?.descrizione || r?.desc || r?.articolo || ''),
    ...rawRiepilogo.map((r) => r?.natura || ''),
  ]
    .filter(Boolean)
    .join(' | '))
}

function currentDocIdentity(doc = {}) {
  const dati = parseDatiEstratti(doc?.dati_estratti)
  const aiRaw = parseAiRawResponse(doc?.ai_raw_response)
  const piva = normalizeVat(doc?.soggetto_piva || dati?.cedente_piva || dati?.cessionario_piva || aiRaw?.cedente_piva || aiRaw?.cessionario_piva || '')
  const cf = normalizeVat(doc?.soggetto_cf || dati?.cedente_cf || dati?.cessionario_cf || aiRaw?.cedente_cf || aiRaw?.cessionario_cf || '')
  const nome = String(
    doc?.soggetto_denominazione ||
    dati?.cedente_denom ||
    dati?.cessionario_denom ||
    aiRaw?.cedente_denom ||
    aiRaw?.cessionario_denom ||
    ''
  ).trim()
  const nomeNorm = stripLegalSuffixes(nome)
  const nomeLike = normalizeText(nome).split(' ').slice(0, 4).join(' ')
  return {
    piva,
    cf,
    nome,
    nomeNorm,
    nomeLike,
  }
}

function summarizeLearningRows(learningRows = []) {
  const byConto = new Map()
  for (const row of learningRows || []) {
    const contoId = String(row?.conto_id || '').trim()
    if (!contoId) continue
    const next = byConto.get(contoId) || {
      count: 0,
      maxConfidence: 0,
      lastDate: '',
      sameSocietaCount: 0,
      samples: 0,
    }
    const freq = Number(row?.frequenza || 0)
    const increment = Number.isFinite(freq) && freq > 0 ? freq : 1
    next.count += increment
    next.samples += 1
    const confidence = Number(row?.confidence_score || 0)
    if (Number.isFinite(confidence) && confidence > next.maxConfidence) next.maxConfidence = confidence
    const last = String(row?.ultimo_utilizzo || row?.created_at || '')
    if (last && (!next.lastDate || last > next.lastDate)) next.lastDate = last
    if (String(row?.societa_id || '').trim()) next.sameSocietaCount += 1
    byConto.set(contoId, next)
  }
  return byConto
}

function computeHistoricalWeights({
  count = 0,
  maxCount = 1,
  lastDate = '',
  sameClientCount = 0,
  learningCount = 0,
  learningConfidence = 0,
  currentText = '',
  candidateText = '',
  confirmedCount = 0,
} = {}) {
  const frequencyScore = maxCount > 0 ? count / maxCount : 0
  const recencyScore = recencyWeight(lastDate)
  const sameClientScore = count > 0 ? sameClientCount / count : 0
  const textSimilarityScore = clamp01(jaccardSimilarity(currentText, candidateText))
  const confirmationBase = Math.max(count, confirmedCount, learningCount)
  const confirmationScore = confirmationBase > 0
    ? clamp01((confirmedCount + learningCount + (learningConfidence / 100)) / (confirmationBase + 1))
    : 0

  const rawScore =
    (frequencyScore * 35) +
    (recencyScore * 20) +
    (sameClientScore * 15) +
    (textSimilarityScore * 15) +
    (confirmationScore * 15)

  return {
    frequencyScore,
    recencyScore,
    sameClientScore,
    textSimilarityScore,
    confirmationScore,
    rawScore,
  }
}

export function normalizeTopSuggestions(items = [], maxResults = 3) {
  const limit = Math.max(1, Math.min(Number(maxResults) || 3, 3))
  const ranked = (items || [])
    .filter((item) => item && Number(item.rawScore ?? item.score ?? 0) > 0)
    .sort((a, b) => Number(b.rawScore ?? b.score ?? 0) - Number(a.rawScore ?? a.score ?? 0))
    .slice(0, limit)

  if (!ranked.length) return []

  const total = ranked.reduce((sum, item) => sum + Math.max(0, Number(item.rawScore ?? item.score ?? 0) || 0), 0)
  if (!total) {
    const base = Math.floor(100 / ranked.length)
    const rem = 100 - (base * ranked.length)
    return ranked.map((item, index) => ({
      ...item,
      score: base + (index < rem ? 1 : 0),
    }))
  }

  const exact = ranked.map((item) => ({
    ...item,
    _exactScore: (Math.max(0, Number(item.rawScore ?? item.score ?? 0) || 0) / total) * 100,
  }))
  const floorScores = exact.map((item) => Math.floor(item._exactScore))
  let remainder = 100 - floorScores.reduce((sum, n) => sum + n, 0)
  const order = [...exact.entries()]
    .sort((a, b) => (b[1]._exactScore - floorScores[b[0]]) - (a[1]._exactScore - floorScores[a[0]]))
    .map(([index]) => index)
  const finalScores = [...floorScores]
  for (let i = 0; i < remainder; i += 1) {
    finalScores[order[i % order.length]] += 1
  }
  return exact.map((item, index) => {
    const { _exactScore, ...rest } = item
    return {
      ...rest,
      score: finalScores[index],
    }
  })
}

function buildCurrentDocText(doc = {}) {
  const identity = currentDocIdentity(doc)
  return buildSearchBlob(doc, identity.nome || identity.nomeLike || '')
}

export function extractHistoricalSearchIdentity(doc = {}) {
  return currentDocIdentity(doc)
}

export function buildHistoricalContoSuggestions({
  historicalDocs = [],
  learningRows = [],
  pianoConti = [],
  maxResults = 3,
  sourceLabel = '',
  currentDoc = null,
  currentSocietaId = '',
} = {}) {
  const docs = Array.isArray(historicalDocs) ? historicalDocs : []
  const conti = Array.isArray(pianoConti) ? pianoConti : []
  if (!docs.length || !conti.length) return []

  const currentText = currentDoc ? buildCurrentDocText(currentDoc) : ''
  const currentSocieta = String(currentSocietaId || currentDoc?.societa_id || '').trim()
  const learningByConto = summarizeLearningRows(learningRows)

  const groups = new Map()
  for (const row of docs) {
    const contoId = String(row?.conto_id || '').trim()
    if (!contoId) continue
    const conto = conti.find((c) => String(c.id) === contoId) || null
    if (!conto) continue
    const accountLabel = `${conto.codice || ''}${conto.codice ? ' - ' : ''}${conto.descrizione || conto.nome || ''}`.trim()
    const key = contoId
    if (!groups.has(key)) {
      groups.set(key, {
        contoId,
        conto,
        count: 0,
        confirmedCount: 0,
        sameClientCount: 0,
        docs: [],
        lastDate: '',
        searchBlob: '',
      })
    }
    const group = groups.get(key)
    group.count += 1
    if (String(row?.validation_status || '').toLowerCase() === 'confirmed') {
      group.confirmedCount += 1
    }
    if (currentSocieta && String(row?.societa_id || '').trim() === currentSocieta) {
      group.sameClientCount += 1
    }
    const rowDate = String(row?.data_documento || row?.created_at || '')
    if (rowDate && (!group.lastDate || rowDate > group.lastDate)) group.lastDate = rowDate
    const blob = buildSearchBlob(row, accountLabel)
    group.searchBlob = normalizeText([group.searchBlob, blob].filter(Boolean).join(' | '))
    group.docs.push(row)
  }

  if (!groups.size) return []

  const maxCount = Math.max(...Array.from(groups.values()).map((g) => g.count), 1)
  const maxConfirmed = Math.max(...Array.from(groups.values()).map((g) => g.confirmedCount), 1)
  const maxLearningCount = Math.max(...Array.from(learningByConto.values()).map((g) => g.count), 1)

  const rawSuggestions = Array.from(groups.values())
    .map((group) => {
      const learning = learningByConto.get(String(group.contoId)) || null
      const learningCount = Number(learning?.count || 0)
      const learningConfidence = Number(learning?.maxConfidence || 0)
      const learningLastDate = learning?.lastDate || ''
      const combinedLastDate = [group.lastDate, learningLastDate].filter(Boolean).sort().at(-1) || group.lastDate || learningLastDate
      const sameClientCount = group.sameClientCount + (learning?.sameSocietaCount || 0)
      const textSimilarity = currentText ? jaccardSimilarity(currentText, group.searchBlob) : 0
      const weights = computeHistoricalWeights({
        count: group.count,
        maxCount,
        lastDate: combinedLastDate,
        sameClientCount,
        learningCount: Math.max(learningCount, group.confirmedCount),
        learningConfidence,
        currentText,
        candidateText: group.searchBlob,
        confirmedCount: group.confirmedCount,
      })
      const reasons = [
        `Storico confermato ${group.count}x`,
      ]
      if (group.confirmedCount > 0 && group.confirmedCount !== group.count) {
        reasons.push(`Conferme operatore ${group.confirmedCount}x`)
      }
      if (sameClientCount > 0) {
        reasons.push('Stesso cliente')
      }
      if (learningCount > 0) {
        reasons.push(`Apprendimento ${Math.round(learningCount)}x`)
      }
      if (learningConfidence > 0) {
        reasons.push(`Confidence learning ${Math.round(learningConfidence)}%`)
      }
      if (textSimilarity > 0.18) {
        reasons.push(`Testo simile ${Math.round(textSimilarity * 100)}%`)
      }
      const age = formatRelativeAge(combinedLastDate)
      if (age) {
        reasons.push(`Ultimo uso ${age}`)
      }
      if (sourceLabel) {
        reasons.push(sourceLabel)
      }

      return {
        id: group.conto.id,
        codice: group.conto.codice || '',
        descrizione: group.conto.descrizione || group.conto.nome || '',
        count: group.count,
        total: docs.length,
        lastDate: combinedLastDate || group.lastDate || '',
        rawScore: weights.rawScore +
          (learningCount > 0 ? Math.min(12, (learningCount / maxLearningCount) * 12) : 0) +
          (learningConfidence > 0 ? Math.min(8, (learningConfidence / 100) * 8) : 0),
        reasons: Array.from(new Set(reasons)).filter(Boolean).slice(0, 5),
        breakdown: {
          frequency: Math.round(weights.frequencyScore * 100),
          recency: Math.round(weights.recencyScore * 100),
          sameClient: Math.round(weights.sameClientScore * 100),
          similarity: Math.round(weights.textSimilarityScore * 100),
          confirmations: Math.round(weights.confirmationScore * 100),
          learningCount: Math.round(learningCount),
          learningConfidence: Math.round(learningConfidence),
          maxConfirmed,
        },
      }
    })
    .filter((item) => Number(item.rawScore || 0) > 0)

  return normalizeTopSuggestions(rawSuggestions, maxResults)
}

export function filterArchivioStoricoAiGroups(groups = [], filters = {}) {
  const search = normalizeText(filters.search || '')
  const sourceClientId = String(filters.sourceClientId || '').trim()
  const accountId = String(filters.accountId || '').trim()
  const subjectType = String(filters.subjectType || '').trim()
  const documentType = String(filters.documentType || '').trim()
  const fromDate = String(filters.fromDate || '').trim()
  const toDate = String(filters.toDate || '').trim()
  const nesOnly = Boolean(filters.nesOnly)
  const nativeOnly = Boolean(filters.nativeOnly)
  const confirmedOnly = Boolean(filters.confirmedOnly)
  const sourceScope = String(filters.sourceScope || '').trim()

  return (groups || []).filter((g) => {
    if (search && !g.searchIndex.includes(search)) return false
    if (sourceClientId && !g.docs.some((d) => String(d.societa_id || '') === sourceClientId)) return false
    if (accountId && !g.docs.some((d) => String(d.conto_id || '') === accountId)) return false
    if (subjectType && subjectType !== 'all' && g.role !== subjectType) return false
    if (documentType && documentType !== 'all' && !g.docs.some((d) => String(d.document_type_label || '').toLowerCase() === documentType)) return false
    if (fromDate && !g.docs.some((d) => String(d.data_documento || '').slice(0, 10) >= fromDate)) return false
    if (toDate && !g.docs.some((d) => String(d.data_documento || '').slice(0, 10) <= toDate)) return false
    if (nesOnly && !g.docs.some((d) => d.is_nes)) return false
    if (nativeOnly && !g.docs.some((d) => !d.is_nes)) return false
    if (confirmedOnly && !g.docs.some((d) => String(d.validation_status || '').toLowerCase() === 'confirmed')) return false
    if (sourceScope && sourceScope !== 'all') {
      if (sourceScope === 'nes' && !g.docs.some((d) => d.is_nes)) return false
      if (sourceScope === 'native' && !g.docs.some((d) => !d.is_nes)) return false
    }
    return true
  })
}
