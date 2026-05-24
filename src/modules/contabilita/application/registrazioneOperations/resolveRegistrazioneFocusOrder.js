const DOCUMENT_FIELD_SEQUENCE = ['dataDocumento', 'numeroDocumento', 'soggetto', 'totaleDocumento']
const IVA_FIELD_SEQUENCE = [
  'ivaDraftCausale',
  'ivaDraftImponibile',
  'ivaDraftDetratta',
  'ivaDraftIndetraibile',
  'ivaDraftTotale',
  'ivaDraftAliquota',
  'ivaDraftNatura',
  'ivaDraftCompetenza',
  'ivaDraftOperazione',
]
const ROW_FIELD_SEQUENCE = ['conto', 'dare', 'avere', 'descrizione']

export function getRegistrazioneRowFieldKey(rowId, field) {
  return `row:${String(rowId || '')}:${String(field || '')}`
}

export function resolveRegistrazioneFocusOrder({ config = {}, rowIds = [] } = {}) {
  const normalizedRowIds = Array.isArray(rowIds) ? rowIds.map((rowId) => String(rowId || '').trim()).filter(Boolean) : []
  const nextByKey = {}
  const sequence = ['dataRegistrazione', 'causaleContabile']

  if (config?.showDocumentPanel) {
    sequence.push(...DOCUMENT_FIELD_SEQUENCE)
  } else if (config?.requiresSoggetto) {
    sequence.push('soggetto')
  }
  if (config?.showIvaPanel) sequence.push(...IVA_FIELD_SEQUENCE)

  normalizedRowIds.forEach((rowId) => {
    ROW_FIELD_SEQUENCE.forEach((field) => {
      sequence.push(getRegistrazioneRowFieldKey(rowId, field))
    })
  })

  sequence.forEach((key, index) => {
    nextByKey[key] = sequence[index + 1] || null
  })

  const firstRowId = normalizedRowIds[0] || ''
  const rowStartKey = firstRowId ? getRegistrazioneRowFieldKey(firstRowId, 'conto') : 'rowsConto'

  if (!nextByKey.causaleContabile) {
    nextByKey.causaleContabile = rowStartKey
  }

  if (normalizedRowIds.length) {
    const lastRowId = normalizedRowIds[normalizedRowIds.length - 1]
    nextByKey[getRegistrazioneRowFieldKey(lastRowId, 'avere')] = '__add_row__'
  }

  return {
    nextByKey,
    rowStartKey,
    firstFieldKey: 'dataRegistrazione',
    documentFieldSequence: DOCUMENT_FIELD_SEQUENCE,
    ivaFieldSequence: IVA_FIELD_SEQUENCE,
    rowFieldSequence: ROW_FIELD_SEQUENCE,
  }
}
