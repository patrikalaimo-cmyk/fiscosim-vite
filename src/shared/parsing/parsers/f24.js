/**
 * F24 PARSER
 * Estrae codici tributo, importi, periodo di riferimento
 */
import { findAmount, findDate, findCF } from '../normalizer.js'

export function parseF24(fullText) {
  const campi = {}
  const warnings = []

  // Contribuente
  campi.contribuente_cf = findCF(fullText)
  campi.data_versamento = findDate(fullText, [/data.*versamento/i, /eseguito\s+il/i])

  // Saldo finale
  campi.saldo = findAmount(fullText, [/saldo/i, /totale\s+a\s+debito/i, /importo\s+totale/i])

  // Estrai righe tributi: ogni riga ha codice tributo (4 cifre), rateazione, anno, importo
  const tributi = []
  // Pattern: 4 cifre seguite da anno (4 cifre) e importo
  const tributePattern = /\b(\d{4})\b[\s\S]{0,50}?\b(20\d{2})\b[\s\S]{0,50}?(\d{1,3}(?:\.\d{3})*,\d{2})/g
  let match
  while ((match = tributePattern.exec(fullText)) !== null) {
    const codice = match[1]
    // Filtra codici tributo noti (range 1000-9999 comuni in F24)
    if (parseInt(codice) >= 1000) {
      tributi.push({
        codice_tributo: codice,
        anno: parseInt(match[2]),
        importo: parseFloat(match[3].replace(/\./g, '').replace(',', '.')),
        offset: match.index,
      })
    }
  }

  if (tributi.length > 0) {
    campi.tributi = { valore: tributi, confidenza: 'alto', fonte: null }
  } else {
    warnings.push('Nessun codice tributo trovato — verifica manuale richiesta')
    campi.tributi = { valore: [], confidenza: 'basso', fonte: null }
  }

  return { campi, warnings }
}
