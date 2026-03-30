/**
 * FATTURA PARSER
 * Estrae dati principali da fattura PDF
 */
import { findAmount, findCF, findPIVA, findDate } from '../normalizer.js'

export function parseFattura(fullText) {
  const campi = {}
  const warnings = []

  // Numero fattura
  const numMatch = fullText.match(/fattura\s+(?:n\.|numero|nr\.?)\s*([A-Z0-9\/\-]+)/i)
  campi.numero = {
    valore: numMatch?.[1]?.trim() || null,
    confidenza: numMatch ? 'alto' : 'basso',
    fonte: numMatch ? { offset: numMatch.index } : null,
  }

  // Data
  campi.data = findDate(fullText, [/data\s+(?:fattura|documento|emissione)/i, /del\s+\d/i])

  // Fornitore / emittente (prima PIVA trovata)
  campi.emittente_piva = findPIVA(fullText)
  campi.emittente_cf   = findCF(fullText)

  // Importi
  campi.imponibile = findAmount(fullText, [/imponibile/i, /base\s+imponibile/i])
  campi.iva        = findAmount(fullText, [/i\.?v\.?a\b/i, /imposta/i])
  campi.totale     = findAmount(fullText, [/totale\s+(?:documento|fattura|da\s+pagare)/i, /totale\s+€/i, /netto\s+a\s+pagare/i])

  // Aliquota IVA
  const aliqMatch = fullText.match(/(\d{1,2}(?:,\d{1,2})?)\s*%/)
  campi.aliquota_iva = {
    valore: aliqMatch ? parseFloat(aliqMatch[1].replace(',', '.')) : null,
    confidenza: aliqMatch ? 'alto' : 'basso',
    fonte: aliqMatch ? { offset: aliqMatch.index } : null,
  }

  // Validazione: imponibile + IVA ≈ totale
  const imp = campi.imponibile?.valore
  const iva = campi.iva?.valore
  const tot = campi.totale?.valore
  if (imp && iva && tot) {
    const atteso = imp + iva
    const diff = Math.abs(atteso - tot)
    if (diff > 1) {
      warnings.push(`Totale non quadra: imponibile ${imp} + IVA ${iva} = ${atteso.toFixed(2)} ≠ totale ${tot}`)
    }
  }

  return { campi, warnings }
}
