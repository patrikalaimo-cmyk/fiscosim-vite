import { findAnagraficaConto, normPiva } from '../../../../services/autoValidateAccountingEngine.js'

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

function normalizeName(value) {
  const tokens = normalizeText(value).split(' ').filter(Boolean)
  return tokens.filter((t) => !LEGAL_SUFFIXES.includes(t)).join(' ').trim()
}

function parseJsonSafe(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(String(value))
  } catch {
    return {}
  }
}

function isNesSource(doc = {}) {
  const d0 = parseJsonSafe(doc?.dati_estratti)
  const source = String(d0?.import_metadata?.source || '').toUpperCase()
  const sourceKey = String(doc?.source_document_id || '').toUpperCase()
  return source === 'NES_IMPORT' || sourceKey.startsWith('NES_IMPORT::') || String(doc?.mime_type || '').includes('nes-historical')
}

function subjectIdentity(doc = {}) {
  const piva = normPiva(doc?.soggetto_piva || '')
  const cf = normPiva(doc?.soggetto_cf || '')
  const nome = String(doc?.soggetto_denominazione || '').trim()
  const nomeNorm = normalizeName(nome)
  const key = piva || cf || nomeNorm || `doc_${doc?.id || ''}`
  return { piva, cf, nome, nomeNorm, key }
}

function docTypeLabel(doc = {}) {
  const tipo = String(doc?.tipo_documento || '').trim().toLowerCase()
  if (!tipo) return 'altro'
  if (tipo.includes('fattura_attiva')) return 'fattura_attiva'
  if (tipo.includes('fattura_passiva')) return 'fattura_passiva'
  if (tipo.includes('historical_prima_nota')) return 'prima_nota'
  if (tipo.includes('prima_nota')) return 'prima_nota'
  if (tipo.includes('nota_credito')) return 'nota_credito'
  if (tipo.includes('parcella')) return 'parcella'
  return tipo
}

function amountNum(v) {
  const n = Number(v || 0)
  return Number.isFinite(n) ? n : 0
}

function mapDocAccountLabel(doc, pianoById) {
  const conto = doc?.conto_id ? pianoById.get(String(doc.conto_id)) : null
  if (!conto) return doc?.conto_id ? String(doc.conto_id) : '—'
  return `${String(conto.codice || '').trim()}${conto.codice ? ' - ' : ''}${conto.descrizione || ''}`.trim()
}

function buildSearchBlob(doc = {}, accountLabel = '') {
  const d0 = parseJsonSafe(doc?.dati_estratti)
  const parts = [
    doc?.soggetto_denominazione,
    doc?.soggetto_piva,
    doc?.soggetto_cf,
    doc?.numero_documento,
    doc?.tipo_documento,
    doc?.causale_iva,
    doc?.causale_iva_codice,
    doc?.totale,
    doc?.imponibile,
    doc?.iva,
    accountLabel,
    d0?.import_metadata?.file_name,
    d0?.import_metadata?.batch_id,
    d0?.records?.map?.((r) => `${r?.descrizione || ''} ${r?.conto_descrizione || ''} ${r?.causale_codice || ''}`) || '',
  ]
  return normalizeText(parts.filter(Boolean).join(' '))
}

function pickTop(entries, keyField, valueField) {
  const counts = new Map()
  for (const entry of entries || []) {
    const key = String(entry?.[keyField] || '').trim()
    if (!key) continue
    const next = counts.get(key) || { count: 0, last: '', sample: entry }
    next.count += 1
    const date = String(entry?.data_documento || entry?.data_registrazione || entry?.created_at || '')
    if (date && (!next.last || date > next.last)) next.last = date
    counts.set(key, next)
  }
  return Array.from(counts.entries())
    .map(([key, meta]) => ({ key, value: meta[valueField] || key, count: meta.count, last: meta.last }))
    .sort((a, b) => b.count - a.count || String(a.value).localeCompare(String(b.value), 'it'))
}

function docRole(doc = {}) {
  const tipo = docTypeLabel(doc)
  if (tipo === 'fattura_passiva' || tipo === 'parcella') return 'fornitore'
  if (tipo === 'fattura_attiva') return 'cliente'
  return 'misto'
}

function isImportedNes(doc = {}) {
  return isNesSource(doc)
}

function buildSubjectLabel(doc = {}) {
  return doc?.soggetto_denominazione || doc?.soggetto_piva || doc?.soggetto_cf || 'Soggetto senza nome'
}

function confidenceFromGroup(group) {
  const occurrences = group.docs.length || 1
  const topAccountCount = group.accountRows[0]?.count || 0
  const concentration = Math.round((topAccountCount / occurrences) * 100)
  const learningBoost = Math.min(20, Math.round((group.learningRows[0]?.confidence_score || 0) / 5))
  const confirmationBoost = Math.min(10, Math.round((group.confirmedCount / occurrences) * 10))
  return Math.max(0, Math.min(100, concentration + learningBoost + confirmationBoost))
}

function mapLearningBySubject(learningRows, subject, pianoConti) {
  const piva = normPiva(subject.piva || '')
  const cf = normPiva(subject.cf || '')
  const nomeLike = normalizeName(subject.nome || '').slice(0, 40)
  const anag = findAnagraficaConto(pianoConti || [], piva || cf || '')
  if (anag?.id) {
    const matched = (learningRows || []).filter((row) => String(row?.anagrafica_id || '') === String(anag.id))
    if (matched.length) return matched
  }

  const out = []
  for (const row of learningRows || []) {
    const matched =
      (piva && String(row?.partita_iva || '').replace(/^IT/i, '').replace(/\s/g, '') === piva) ||
      (cf && String(row?.codice_fiscale || '').replace(/^IT/i, '').replace(/\s/g, '') === cf) ||
      (nomeLike && normalizeName(row?.fornitore_nome || row?.ragione_sociale || '').includes(nomeLike))
    if (matched) out.push(row)
  }
  return out
}

export function buildArchivioStoricoAiGroups({ docs = [], learningRows = [], pianoConti = [] } = {}) {
  const pianoById = new Map((pianoConti || []).map((c) => [String(c.id), c]))
  const groups = new Map()

  for (const doc of docs || []) {
    const subject = subjectIdentity(doc)
    const key = subject.key
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        subject,
        docs: [],
        societaIds: new Set(),
        accountCounts: new Map(),
        vatCounts: new Map(),
        typeCounts: new Map(),
        examples: [],
        totalAmount: 0,
        nesCount: 0,
        nativeCount: 0,
        confirmedCount: 0,
        amountCount: 0,
        searchable: [],
      })
    }
    const group = groups.get(key)
    const accountLabel = mapDocAccountLabel(doc, pianoById)
    const docType = docTypeLabel(doc)
    const srcNes = isImportedNes(doc)
    const total = amountNum(doc?.totale ?? doc?.imponibile ?? 0)
    const vat = String(doc?.causale_iva_codice || doc?.causale_iva || '').trim()
    const normalizedAccount = String(doc?.conto_id || '').trim()

    group.docs.push({
      ...doc,
      account_label: accountLabel,
      subject_label: buildSubjectLabel(doc),
      document_type_label: docType,
      is_nes: srcNes,
    })
    group.societaIds.add(String(doc?.societa_id || ''))
    if (normalizedAccount) {
      const cur = group.accountCounts.get(normalizedAccount) || { count: 0, label: accountLabel }
      cur.count += 1
      cur.label = accountLabel
      group.accountCounts.set(normalizedAccount, cur)
    }
    if (vat) {
      const cur = group.vatCounts.get(vat) || { count: 0, label: vat }
      cur.count += 1
      group.vatCounts.set(vat, cur)
    }
    if (docType) {
      const cur = group.typeCounts.get(docType) || 0
      group.typeCounts.set(docType, cur + 1)
    }
    group.totalAmount += total
    group.amountCount += total ? 1 : 0
    if (srcNes) group.nesCount += 1
    else group.nativeCount += 1
    if (String(doc?.validation_status || '').toLowerCase() === 'confirmed') group.confirmedCount += 1
    group.searchable.push(
      buildSearchBlob(doc, accountLabel),
      normalizeText(doc?.numero_documento || ''),
      normalizeText(doc?.soggetto_denominazione || ''),
      normalizeText(doc?.causale_iva_codice || doc?.causale_iva || '')
    )
    const example = {
      id: doc?.id,
      numero_documento: doc?.numero_documento || '',
      data_documento: doc?.data_documento || '',
      tipo_documento: docType,
      conto_label: accountLabel,
      totale: total,
      validation_status: doc?.validation_status || '',
      workflow_status: doc?.workflow_status || '',
      source: srcNes ? 'NES_IMPORT' : 'NATIVE',
    }
    group.examples.push(example)
  }

  return Array.from(groups.values()).map((group) => {
    const docsSorted = [...group.docs].sort((a, b) => String(b.data_documento || b.created_at || '').localeCompare(String(a.data_documento || a.created_at || '')))
    const accountRows = Array.from(group.accountCounts.entries())
      .map(([contoId, meta]) => ({ contoId, count: meta.count, label: meta.label }))
      .sort((a, b) => b.count - a.count || String(a.label).localeCompare(String(b.label), 'it'))
    const vatRows = Array.from(group.vatCounts.entries())
      .map(([vat, meta]) => ({ vat, count: meta.count, label: meta.label }))
      .sort((a, b) => b.count - a.count || String(a.vat).localeCompare(String(b.vat), 'it'))
    const typeRows = Array.from(group.typeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || String(a.type).localeCompare(String(b.type), 'it'))
    const learningMatchedRows = mapLearningBySubject(learningRows, group.subject, pianoConti)
    const learningTop = [...learningMatchedRows]
      .sort((a, b) => Number(b.frequenza || 0) - Number(a.frequenza || 0) || Number(b.confidence_score || 0) - Number(a.confidence_score || 0))
    const preferredLearning = learningTop[0] || null
    const preferredAccountId = accountRows[0]?.contoId || preferredLearning?.conto_id || null
    const preferredAccountLabel = accountRows[0]?.label || (preferredAccountId ? pianoById.get(String(preferredAccountId))?.descrizione || String(preferredAccountId) : '—')
    const lastUsageDate = docsSorted[0]?.data_documento || docsSorted[0]?.created_at || ''
    const avgAmount = group.amountCount > 0 ? group.totalAmount / group.amountCount : 0
    const sourceClientCount = new Set(group.docs.map((d) => String(d.societa_id || ''))).size
    const docNumbers = [...new Set(group.docs.map((d) => String(d.numero_documento || '').trim()).filter(Boolean))]
    const searchIndex = normalizeText(
      [
        group.subject.nome,
        group.subject.piva,
        group.subject.cf,
        preferredAccountLabel,
        accountRows.map((x) => x.label).join(' '),
        vatRows.map((x) => x.vat).join(' '),
        docNumbers.join(' '),
        docsSorted.map((d) => `${d.numero_documento || ''} ${d.tipo_documento || ''} ${d.causale_iva_codice || d.causale_iva || ''}`).join(' '),
      ]
        .filter(Boolean)
        .join(' ')
    )

    return {
      key: group.key,
      subject: {
        ...group.subject,
        label: buildSubjectLabel(group.subject),
      },
      role: docRole(docsSorted[0] || {}),
      count: docsSorted.length,
      preferredAccountId,
      preferredAccountLabel,
      lastUsageDate,
      confidenceScore: confidenceFromGroup({ ...group, accountRows, learningRows: learningTop }),
      sourceClientCount,
      confirmedCount: group.confirmedCount,
      nesCount: group.nesCount,
      nativeCount: group.nativeCount,
      avgAmount,
      docNumbers,
      accountRows,
      vatRows,
      typeRows,
      learningRows: learningTop.slice(0, 8),
      docs: docsSorted,
      recentExamples: docsSorted.slice(0, 6).map((d) => ({
        id: d.id,
        numero_documento: d.numero_documento || '',
        data_documento: d.data_documento || '',
        tipo_documento: d.document_type_label || docTypeLabel(d),
        account_label: d.account_label || mapDocAccountLabel(d, pianoById),
        totale: amountNum(d.totale ?? d.imponibile ?? 0),
        source: isImportedNes(d) ? 'NES_IMPORT' : 'NATIVE',
        validation_status: d.validation_status || '',
      })),
      searchIndex,
      pinned: false,
    }
  })
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
