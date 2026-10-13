/**
 * Embed / parse Import file hash markers for Stage3W claim motivazione.
 * Marker is interrogable from fiscosim_fiscal_journal_claim.request_payload.
 */

function text(value) {
  return String(value ?? '').trim()
}

export function sanitizeImportFileHash(value) {
  const hash = text(value).toLowerCase().replace(/[^a-f0-9]/g, '')
  return hash.slice(0, 64)
}

export function sanitizeImportFileName(value) {
  return text(value).replace(/[\r\n|]+/g, ' ').slice(0, 120)
}

/**
 * @returns {string} motivazione with optional `fileHash=` / `file=` markers (max 500)
 */
export function appendImportFileHashMarker(baseMotivazione, { sourceHash = '', sourceFileName = '' } = {}) {
  const base = text(baseMotivazione) || 'LAB Stage3W import fiscal post'
  const hash = sanitizeImportFileHash(sourceHash)
  const file = sanitizeImportFileName(sourceFileName)
  const parts = [base]
  if (hash) parts.push(`fileHash=${hash}`)
  if (file) parts.push(`file=${file}`)
  return parts.join(' ').slice(0, 500)
}

export function parseImportFileHashMarker(motivazione = '') {
  const raw = text(motivazione)
  const hashMatch = raw.match(/\bfileHash=([a-f0-9]{4,64})\b/i)
  const fileMatch = raw.match(/\bfile=([^\s|]+)/i)
  return {
    sourceHash: hashMatch ? sanitizeImportFileHash(hashMatch[1]) : '',
    sourceFileName: fileMatch ? sanitizeImportFileName(fileMatch[1]) : '',
  }
}
