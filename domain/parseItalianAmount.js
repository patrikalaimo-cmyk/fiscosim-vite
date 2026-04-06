/**
 * Converte stringhe importo in stile italiano (1.234,56) in numero.
 * @param {unknown} v
 * @returns {number | null} null se non interpretabile
 */
export function parseItalianAmount(v) {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  let s = String(v).trim().replace(/\u00a0/g, ' ').replace(/\s/g, '')
  if (!s) return null
  if (/^\d{1,3}(\.\d{3})+(,\d{1,6})?$/.test(s)) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else if (/^\d+,\d{1,6}$/.test(s)) {
    s = s.replace(',', '.')
  }
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}
