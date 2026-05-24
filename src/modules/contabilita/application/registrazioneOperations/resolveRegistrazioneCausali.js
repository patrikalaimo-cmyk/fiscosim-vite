import { normalizeText } from '../canonical_mapper/utils.js'

function normalizeCausaleKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function resolveRawCausaleDescription(item) {
  const candidates = [
    item?.descrizione,
    item?.description,
    item?.denominazione,
    item?.nome,
    item?.label,
    item?.title,
  ]

  for (const candidate of candidates) {
    const text = String(candidate || '').trim()
    if (text) return text
  }

  return ''
}

export function resolveRegistrazioneCausaleLabel(item) {
  if (!item || typeof item !== 'object') return 'â€”'
  const code = String(item.codice || item.code || item.sigla || item.id || '').trim()
  const descr = resolveRawCausaleDescription(item)
  if (!code && !descr) return 'â€”'
  if (!code) return descr
  if (!descr || descr === code) return code
  return `${code} - ${descr}`
}

function extractCausaleCode(value) {
  const text = String(value || '').trim()
  if (!text) return ''
  const parts = text.split(/\s+-\s+/)
  if (parts.length >= 2) {
    const head = String(parts.shift() || '').trim()
    if (head) return head
  }
  return ''
}

export function findRegistrazioneCausaleExactMatch(causali = [], input = '') {
  const q = normalizeCausaleKey(input)
  if (!q) return null
  const qCode = normalizeCausaleKey(extractCausaleCode(input))
  const list = Array.isArray(causali) ? causali : []

  return list.find((item) => {
    const exactId = normalizeCausaleKey(item?.id)
    const exactCode = normalizeCausaleKey(item?.codice || item?.code || item?.sigla)
    const exactDescr = normalizeCausaleKey(resolveRawCausaleDescription(item))
    const exactLabel = normalizeCausaleKey(resolveRegistrazioneCausaleLabel(item))
    return q === exactId || q === exactCode || q === exactDescr || q === exactLabel || (qCode && qCode === exactCode)
  }) || null
}
