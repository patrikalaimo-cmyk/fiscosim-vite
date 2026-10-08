// Digest del file EFFETTIVAMENTE emesso, non di metadati della stampa.
// Non e un gate di consolidamento: la verifica di snapshot/lock e ancora separata.
const DATE = /^\d{4}-\d{2}-\d{2}$/
const val = v => String(v ?? '').trim()
function realDate(text) {
  if (!DATE.test(text)) return false
  const date = new Date(text + 'T00:00:00.000Z')
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text
}

export async function hashStampaContenuto({
  fileBytes,
  mimeType,
  societaId,
  tipoStampa,
  annoFiscale,
  periodoInizio,
  periodoFine,
} = {}, { subtle = globalThis.crypto?.subtle } = {}) {
  const start = val(periodoInizio)
  const end = val(periodoFine)
  const year = String(annoFiscale ?? '')
  const mime = val(mimeType).toLowerCase()
  if (!val(societaId) || !val(tipoStampa) || !mime
    || !/^\d{4}$/.test(year) || !realDate(start) || !realDate(end)
    || start > end || start.slice(0, 4) !== year || end.slice(0, 4) !== year) {
    throw new Error('Stampa: identita o periodo checksum contenuto non valido')
  }
  if (!(fileBytes instanceof Uint8Array) && !(fileBytes instanceof ArrayBuffer)) {
    throw new Error('Stampa: richiede i byte effettivi del file, non un conteggio righe')
  }
  const content = fileBytes instanceof Uint8Array
    ? fileBytes
    : new Uint8Array(fileBytes)
  if (!content.byteLength) throw new Error('Stampa: file vuoto non certificabile')
  if (!subtle || typeof subtle.digest !== 'function') {
    throw new Error('Stampa: SHA-256 non disponibile; nessun checksum debole ammesso')
  }
  const metadata = JSON.stringify({
    version: 'FISCOSIM_STAMPA_BYTES_V1',
    societaId: val(societaId),
    tipoStampa: val(tipoStampa),
    annoFiscale: year,
    periodoInizio: start,
    periodoFine: end,
    mimeType: mime,
    byteLength: content.byteLength,
  })
  // Includere il dominio e la lunghezza dei metadati elimina ambiguita
  // fra header e contenuto binario. Il digest e sui byte finali immutabili.
  const encoder = new TextEncoder()
  const head = encoder.encode(String(metadata.length) + ':' + metadata + '\u0000')
  const combined = new Uint8Array(head.length + content.byteLength)
  combined.set(head, 0)
  combined.set(content, head.length)
  const result = await subtle.digest('SHA-256', combined)
  const out = Array.from(new Uint8Array(result), x => x.toString(16).padStart(2, '0')).join('')
  if (!/^[0-9a-f]{64}$/.test(out)) throw new Error('Stampa: digest SHA-256 non valido')
  return out
}
