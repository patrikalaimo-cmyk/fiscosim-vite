import { sanitizeImportFileHash, sanitizeImportFileName } from './importFileHashMarker.js'

function text(value) {
  return String(value ?? '').trim()
}

/**
 * Normalize a cronologia row (UI store or claim history).
 */
export function buildImportCronologiaEntry({
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
    contractKind: text(contractKind),
    interrogabile: Boolean(hash || file || text(primaNotaId) || text(requestId)),
  }
}
