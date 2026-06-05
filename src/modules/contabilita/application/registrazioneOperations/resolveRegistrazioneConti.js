import { normalizeText } from '../canonical_mapper/utils.js'
import { resolveContoHierarchyView } from '../../domain/piano_conti/resolveContoHierarchyView.js'

function normalizeContoKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function isGenericContoLabel(value) {
  const normalized = normalizeContoKey(value)
  if (!normalized) return true
  return [
    'passivita',
    'passivo',
    'attivita',
    'attivo',
    'costo',
    'ricavo',
    'patrimoniale',
    'economico',
    'ordine',
    'mastro',
    'gruppo',
    'categoria',
    'famiglia',
  ].some((token) => normalized === token || normalized.startsWith(token))
}

function extractLabelDescription(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const parts = text.split(/\s+-\s+/)
  if (parts.length >= 2) {
    const head = String(parts.shift() || '').trim()
    const tail = String(parts.join(' - ') || '').trim()
    if (tail && (/^[0-9.\s]+$/.test(head) || normalizeContoKey(head).length >= 4)) {
      return tail
    }
  }
  return text
}

function extractLabelCode(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const parts = text.split(/\s+-\s+/)
  if (parts.length >= 2) {
    const head = String(parts.shift() || '').trim()
    if (head) return head
  }
  return ''
}

function resolveSelectionDescription(item, selectedLabel = '') {
  const labelDescription = extractLabelDescription(selectedLabel)
  if (labelDescription && !isGenericContoLabel(labelDescription)) {
    return labelDescription
  }

  const itemDescription = resolveRawContoDescription(item)
  if (itemDescription && !isGenericContoLabel(itemDescription)) {
    return itemDescription
  }

  if (labelDescription) {
    return labelDescription
  }

  return itemDescription
}

function resolveRawContoDescription(item) {
  const candidates = [
    item?.conto_descrizione,
    item?.descrizione_conto,
    item?.descrizioneConto,
    item?.contoDescription,
    item?.denominazione,
    item?.nome,
    item?.label,
    item?.title,
    item?.description,
    item?.descrizione,
  ]

  for (const candidate of candidates) {
    const text = String(candidate || '').trim()
    if (text) return text
  }

  return ''
}

function buildExactContoLabel(item) {
  const codice = String(item?.codice || item?.code || item?.sigla || item?.id || '').trim()
  const descrizione = resolveRawContoDescription(item)
  if (!codice && !descrizione) return ''
  if (!codice) return descrizione
  if (!descrizione) return codice
  return `${codice} - ${descrizione}`
}

export function resolveRegistrazioneContoLabel(item) {
  const codice = String(item?.codice || item?.code || item?.sigla || item?.id || '').trim()
  const descrizione = resolveRegistrazioneContoDescrizione(item)
  if (!codice && !descrizione) return '—'
  if (!codice) return descrizione
  if (descrizione === 'Descrizione conto non disponibile') return codice
  if (!descrizione || descrizione === codice) return codice
  return `${codice} - ${descrizione}`
}

export function resolveRegistrazioneContoDescrizione(item) {
  const candidates = [
    { value: item?.__selectionDescription, priority: -1 },
    { value: extractLabelDescription(item?.__label), priority: 0 },
    { value: extractLabelDescription(item?.conto_label), priority: 1 },
    { value: extractLabelDescription(item?.displayLabel), priority: 2 },
    { value: extractLabelDescription(item?.label_full), priority: 3 },
    { value: item?.conto_descrizione, priority: 4 },
    { value: item?.descrizione_conto, priority: 5 },
    { value: item?.descrizioneConto, priority: 6 },
    { value: item?.contoDescription, priority: 7 },
    { value: item?.nome, priority: 8 },
    { value: item?.label, priority: 9 },
    { value: item?.title, priority: 10 },
    { value: item?.denominazione, priority: 11 },
    { value: item?.descrizione, priority: 12 },
    { value: item?.description, priority: 13 },
    { value: item?.nome_conto, priority: 14 },
    { value: item?.label_conto, priority: 15 },
    { value: item?.description_conto, priority: 16 },
  ]

  const sorted = candidates
    .map((candidate) => ({
      ...candidate,
      text: String(candidate.value || '').trim(),
    }))
    .filter((candidate) => candidate.text)
    .sort((a, b) => a.priority - b.priority)

  const nonGeneric = sorted.find((candidate) => !isGenericContoLabel(candidate.text))
  if (nonGeneric) return nonGeneric.text

  const nonCode = sorted.find((candidate) => {
    const code = String(item?.codice || item?.code || item?.sigla || item?.id || '').trim()
    return candidate.text && candidate.text !== code && !/^[0-9.\s-]+$/.test(candidate.text)
  })
  if (nonCode) return nonCode.text

  for (const candidate of sorted) {
    if (candidate.text) return candidate.text
  }

  return 'Descrizione conto non disponibile'
}

export function buildRegistrazioneContoSelection(item, selectedLabel = '') {
  const label = String(selectedLabel || resolveRegistrazioneContoLabel(item) || '').trim()
  const selectionDescription = resolveSelectionDescription(item, label)
  const hierarchy = resolveContoHierarchyView(item)
  return {
    ...item,
    ...hierarchy,
    __label: label,
    conto_label: label,
    displayLabel: label,
    label_full: label,
    __selectionDescription: selectionDescription,
    conto_descrizione: selectionDescription || resolveRegistrazioneContoDescrizione(item),
  }
}

function resolveRegistrazioneContoSearchBlob(item) {
  const parts = [
    item?.id,
    item?.codice,
    item?.code,
    item?.sigla,
    item?.descrizione,
    item?.description,
    item?.denominazione,
    item?.nome,
    item?.tipo,
    item?.mastrino,
    item?.gruppo,
    item?.categoria,
    item?.famiglia,
  ]
  return normalizeText(parts.filter(Boolean).join(' ')).toLowerCase()
}

function rankRegistrazioneConto(item, query, mode = 'search') {
  const label = resolveRegistrazioneContoLabel(item).toLowerCase()
  const code = String(item?.codice || item?.code || item?.sigla || item?.id || '').trim().toLowerCase()
  const descrizione = String(item?.descrizione || item?.description || item?.denominazione || item?.nome || item?.label || item?.title || '').trim().toLowerCase()
  const blob = resolveRegistrazioneContoSearchBlob(item)
  const q = normalizeText(query).toLowerCase()

  if (!q) {
    return {
      score: mode === 'picker' ? 0 : 1,
      matched: true,
    }
  }

  const startsWithCode = code.startsWith(q)
  const startsWithDescr = descrizione.startsWith(q)
  const containsCode = code.includes(q)
  const containsDescr = descrizione.includes(q)
  const containsBlob = blob.includes(q)
  const containsLabel = label.includes(q)

  if (mode === 'picker') {
    let score = Number.POSITIVE_INFINITY
    if (startsWithDescr) score = 0
    else if (startsWithCode) score = 1
    else if (containsDescr) score = 2
    else if (containsCode) score = 3
    else if (containsLabel || containsBlob) score = 4
    return { score, matched: Number.isFinite(score) }
  }

  let score = Number.POSITIVE_INFINITY
  if (containsDescr) score = 0
  else if (containsCode) score = 1
  else if (containsLabel || containsBlob) score = 2
  return { score, matched: Number.isFinite(score) }
}

export function filterRegistrazioneConti(conti = [], query = '', { mode = 'search', limit = 500 } = {}) {
  const list = Array.isArray(conti) ? conti : []
  const q = normalizeText(query).toLowerCase()
  const ranked = list
    .map((item, index) => ({
      item,
      index,
      ...rankRegistrazioneConto(item, q, mode),
    }))
    .filter((entry) => entry.matched)
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      const labelA = resolveRegistrazioneContoLabel(a.item)
      const labelB = resolveRegistrazioneContoLabel(b.item)
      return labelA.localeCompare(labelB, 'it-IT')
    })

  return ranked.slice(0, Number.isFinite(Number(limit)) ? Number(limit) : 500).map((entry) => ({
    ...entry.item,
    __index: entry.index,
    __label: resolveRegistrazioneContoLabel(entry.item),
  }))
}

export function findRegistrazioneContoByPrefix(conti = [], prefix = '') {
  const q = normalizeText(prefix).toLowerCase()
  if (!q) return null
  const list = Array.isArray(conti) ? conti : []
  const byDescr = list.find((item) => String(item?.descrizione || item?.description || item?.denominazione || item?.nome || item?.label || item?.title || '').trim().toLowerCase().startsWith(q))
  if (byDescr) return byDescr
  const byCode = list.find((item) => String(item?.codice || item?.code || item?.sigla || item?.id || '').trim().toLowerCase().startsWith(q))
  if (byCode) return byCode
  return list.find((item) => resolveRegistrazioneContoLabel(item).toLowerCase().includes(q)) || null
}

export function findRegistrazioneContoByQuery(conti = [], query = '') {
  const list = filterRegistrazioneConti(conti, query, { mode: 'search', limit: 500 })
  return list[0] || null
}

export function findRegistrazioneContoExactMatch(conti = [], input = '') {
  const q = normalizeContoKey(input)
  if (!q) return null
  const qCode = normalizeContoKey(extractLabelCode(input))
  const list = Array.isArray(conti) ? conti : []
  return list.find((item) => {
    const exactId = normalizeContoKey(item?.id)
    const exactCode = normalizeContoKey(item?.codice || item?.code || item?.sigla)
    const exactDescr = normalizeContoKey(resolveRawContoDescription(item))
    const exactLabel = normalizeContoKey(buildExactContoLabel(item))
    const displayLabel = normalizeContoKey(resolveRegistrazioneContoLabel(item))
    return q === exactId || q === exactCode || q === exactDescr || q === exactLabel || q === displayLabel || (qCode && qCode === exactCode)
  }) || null
}

export function resolveSubjectAccount(selected, pianoConti = []) {
  if (!selected || typeof selected !== 'object') return null

  const getSafeId = (val) => {
    if (val === undefined || val === null) return ''
    const s = String(val).trim()
    return s.toLowerCase() !== 'undefined' && s.toLowerCase() !== 'null' ? s : ''
  }

  // 1. Gather all potential IDs from different aliases
  const potentialIds = [
    getSafeId(selected.conto_id),
    getSafeId(selected.contoId),
    getSafeId(selected.clienteFornitoreId),
    getSafeId(selected.cliente_fornitore_id),
    getSafeId(selected.soggettoId),
    getSafeId(selected.soggetto_id),
    getSafeId(selected.accountId),
    getSafeId(selected.contoPatrimonialeId),
    getSafeId(selected.conto_patrimoniale_id),
    getSafeId(selected.id),
    getSafeId(selected.value),
    // Nested objects
    selected.clienteFornitore && typeof selected.clienteFornitore === 'object' ? getSafeId(selected.clienteFornitore.id || selected.clienteFornitore.value) : '',
    selected.conto && typeof selected.conto === 'object' ? getSafeId(selected.conto.id || selected.conto.value) : '',
    selected.account && typeof selected.account === 'object' ? getSafeId(selected.account.id || selected.account.value) : '',
    selected.soggetto_conto && typeof selected.soggetto_conto === 'object' ? getSafeId(selected.soggetto_conto.id || selected.soggetto_conto.value) : '',
    selected.contoPatrimoniale && typeof selected.contoPatrimoniale === 'object' ? getSafeId(selected.contoPatrimoniale.id || selected.contoPatrimoniale.value) : ''
  ].filter(Boolean)

  // 2. Try to find the account in pianoConti by ID
  let matchedAccount = null
  for (const id of potentialIds) {
    matchedAccount = pianoConti.find(c => String(c.id).trim() === id)
    if (matchedAccount) break
  }

  // 3. If not found by ID, check potential objects that might be resolved accounts themselves
  if (!matchedAccount) {
    const potentialObjects = [
      selected.conto,
      selected.account,
      selected.clienteFornitore,
      selected.soggetto_conto,
      selected.contoPatrimoniale,
      selected
    ]
    for (const obj of potentialObjects) {
      if (obj && typeof obj === 'object') {
        const code = String(obj.codice || obj.code || obj.sigla || '').trim()
        const name = String(obj.nome || obj.descrizione || obj.description || obj.denominazione || '').trim()
        if (code && name) {
          const matchedByCode = pianoConti.find(c => String(c.codice).trim() === code)
          if (matchedByCode) {
            matchedAccount = matchedByCode
            break
          }
          matchedAccount = {
            id: getSafeId(obj.id || obj.value),
            codice: code,
            descrizione: name,
            is_cliente: Boolean(obj.is_cliente || obj.isCliente),
            is_fornitore: Boolean(obj.is_fornitore || obj.isFornitore || obj.is_professionista || obj.isProfessionista)
          }
          break
        }
      }
    }
  }

  // 4. Fallback search by text/soggetto
  if (!matchedAccount) {
    const textQuery = String(
      selected.soggetto ||
      selected.clienteFornitoreNome ||
      selected.cliente_fornitore_nome ||
      ''
    ).trim()

    if (textQuery) {
      matchedAccount = pianoConti.find(c => {
        const label = String(c.descrizione || c.nome || '').trim().toLowerCase()
        const code = String(c.codice || '').trim().toLowerCase()
        const matchText = textQuery.toLowerCase()
        return label === matchText || code === matchText
      })
    }
  }

  return matchedAccount
}

export { resolveContoHierarchyView } from '../../domain/piano_conti/resolveContoHierarchyView.js'

