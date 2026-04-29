export const PARSE_REQUIRED_FIELDS = [
  'filename',
  'sourceHash',
  'rawXml',
  'tipoDocumento',
  'dataDocumento',
  'numeroDocumento',
  'fornitore',
  'cliente',
  'imponibile',
  'iva',
  'totale',
  'lineeDocumento',
  'ivaRows',
  'flags',
  'warnings',
  'errors',
]

export function createEmptyParsedDocument() {
  return {
    filename: '',
    sourceHash: '',
    rawXml: '',
    tipoDocumento: '',
    dataDocumento: '',
    numeroDocumento: '',
    fornitore: null,
    cliente: null,
    imponibile: 0,
    iva: 0,
    totale: 0,
    lineeDocumento: [],
    ivaRows: [],
    flags: {
      reverseCharge: false,
      splitPayment: false,
      hasRitenuta: false,
      isProfessional: false,
    },
    warnings: [],
    errors: [],
  }
}

export function isParsedDocumentShape(value) {
  if (!value || typeof value !== 'object') return false
  return PARSE_REQUIRED_FIELDS.every((key) => key in value)
}
