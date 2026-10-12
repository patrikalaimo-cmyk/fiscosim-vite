import {
  sanitizeImportFileHash,
  sanitizeImportFileName,
} from '../../../import_contabilita/application/cronologia/importFileHashMarker.js'

function text(value) {
  return String(value ?? '').trim()
}

/**
 * Normalize a bank commit cronologia row (UI store or claim history).
 */
export function buildBankCronologiaEntry({
  societaId = '',
  sourceFileName = '',
  sourceHash = '',
  esito = 'committed',
  primaNotaId = '',
  requestId = '',
  numeroDocumento = '',
  dataRegistrazione = '',
  createdAt = '',
  contractKind = '',
  descrizione = '',
  movementId = '',
} = {}) {
  const hash = sanitizeImportFileHash(sourceHash)
  const file = sanitizeImportFileName(sourceFileName)
  const at = text(createdAt) || new Date().toISOString()
  return {
    societaId: text(societaId),
    sourceFileName: file,
    sourceHash: hash,
    esito: text(esito) || 'committed',
    primaNotaId: text(primaNotaId),
    requestId: text(requestId),
    numeroDocumento: text(numeroDocumento),
    dataRegistrazione: text(dataRegistrazione).slice(0, 10),
    createdAt: at,
    contractKind: text(contractKind) || 'pagamento',
    descrizione: text(descrizione).slice(0, 200),
    movementId: text(movementId),
    interrogabile: Boolean(hash || file || text(primaNotaId) || text(requestId)),
  }
}
