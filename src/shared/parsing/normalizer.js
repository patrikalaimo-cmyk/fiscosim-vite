/**
 * NORMALIZER — pulisce e normalizza testo estratto da pdfjs
 * pdfjs a volte produce: spazi doppi, newline strane, caratteri spuri
 */

export function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')      // spazi multipli → singolo
    .replace(/\n{3,}/g, '\n\n')      // max 2 newline consecutivi
    .trim()
}

/**
 * Cerca un valore numerico monetario vicino a un'etichetta
 * Gestisce formati: 1.234,56 / 1234,56 / 1234.56 / € 1.234
 */
export function findAmount(text, labelPatterns, { window = 200 } = {}) {
  for (const pattern of labelPatterns) {
    const match = pattern.exec(text)
    if (!match) continue

    const start = match.index
    const segment = text.substring(start, start + window)

    // Prova formato italiano: 1.234,56
    const itMatch = segment.match(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?)\b/)
    if (itMatch) {
      const val = parseFloat(itMatch[1].replace(/\./g, '').replace(',', '.'))
      if (!isNaN(val) && val > 0) {
        return {
          valore: val,
          raw: itMatch[1],
          confidenza: 'alto',
          fonte: { offset: start + segment.indexOf(itMatch[1]) }
        }
      }
    }

    // Prova formato con punto decimale: 1234.56
    const enMatch = segment.match(/(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?)\b/)
    if (enMatch) {
      const val = parseFloat(enMatch[1].replace(/,/g, ''))
      if (!isNaN(val) && val > 0) {
        return {
          valore: val,
          raw: enMatch[1],
          confidenza: 'medio',
          fonte: { offset: start + segment.indexOf(enMatch[1]) }
        }
      }
    }
  }
  return { valore: null, confidenza: 'basso', fonte: null }
}

/**
 * Cerca un codice fiscale nel testo
 * CF: 16 caratteri alfanumerici con pattern noto
 * PIVA: 11 cifre (con o senza IT)
 */
export function findCF(text) {
  const cfMatch = text.match(/\b([A-Z]{6}\d{2}[A-EHLMPRST]\d{2}[A-Z]\d{3}[A-Z])\b/i)
  if (cfMatch) return { valore: cfMatch[1].toUpperCase(), confidenza: 'alto' }
  return { valore: null, confidenza: 'basso' }
}

export function findPIVA(text) {
  const m = text.match(/(?:IT\s*)?(\d{11})\b/)
  if (m) return { valore: m[1], confidenza: 'alto' }
  return { valore: null, confidenza: 'basso' }
}

export function findDate(text, labelPatterns = []) {
  // Formato italiano: GG/MM/AAAA o GG-MM-AAAA
  const segment = labelPatterns.length
    ? (() => {
        for (const p of labelPatterns) {
          const m = p.exec(text)
          if (m) return text.substring(m.index, m.index + 50)
        }
        return text.substring(0, 500)
      })()
    : text.substring(0, 500)

  const m = segment.match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})/)
  if (m) {
    return {
      valore: `${m[3]}-${m[2]}-${m[1]}`, // ISO
      raw: m[0],
      confidenza: 'alto'
    }
  }
  return { valore: null, confidenza: 'basso' }
}
