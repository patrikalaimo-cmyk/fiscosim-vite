import { normalizeText } from '../../application/canonical_mapper/utils.js'
import { normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow } from './normalizeRegistrazioneCausaleDetail.js'

function parseJsonArray(value) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') {
    const text = value.trim()
    if (!text) return []
    try {
      const parsed = JSON.parse(text)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

function rowKey(row = {}) {
  return [
    row?.ordine,
    row?.conto_id,
    row?.conto_codice,
    row?.conto_descrizione,
    row?.hierarchyType,
    row?.isTemplateScope ? '1' : '0',
    row?.lato,
    row?.formula_importo,
    row?.descrizione_riga,
    row?.obbligatoria ? '1' : '0',
    row?.modificabile ? '1' : '0',
    row?.attiva ? '1' : '0',
  ]
    .map((part) => normalizeText(part))
    .join('|')
}

export function normalizeRegistrazioneRigheTemplate(value) {
  const rawRows = parseJsonArray(value)
  const warnings = []
  const blockers = []
  const rows = rawRows
    .map((row, index) => normalizeRegistrazioneCausaleRighePrimaNotaTemplateRow(row, index))
    .filter((row) => row.attiva !== false)
    .map((row, index) => {
      const nextRow = {
        ...row,
        hierarchyType: normalizeText(row.hierarchyType),
        isTemplateScope: Boolean(row.isTemplateScope || normalizeText(row.hierarchyType) === 'conto'),
      }

      if (!normalizeText(nextRow.conto_id) && normalizeText(nextRow.formula_importo) !== 'manuale') {
        warnings.push(`riga ${index + 1}: template da completare con un conto`)
      }

      if (normalizeText(nextRow.hierarchyType) === 'mastro') {
        warnings.push(`riga ${index + 1}: mastro non selezionabile nel template`)
      }

      return nextRow
    })
    .sort((a, b) => {
      const diff = (Number(a?.ordine) || 0) - (Number(b?.ordine) || 0)
      if (diff) return diff
      return rowKey(a).localeCompare(rowKey(b))
    })

  return {
    rows,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
  }
}

export function resolveRegistrazioneRigheTemplateSource(value) {
  return normalizeRegistrazioneRigheTemplate(value)
}
