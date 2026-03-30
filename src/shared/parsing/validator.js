/**
 * VALIDATOR — controlli di coerenza cross-campo
 * Input:  { tipo, campi }
 * Output: { errori, warnings, score } 
 *   score: 0-1, percentuale campi con valore non null
 */

export function validateResult({ tipo, campi }) {
  const errori  = []
  const warnings = []

  // Campi obbligatori per tipo
  const REQUIRED = {
    cu:       ['anno_riferimento', 'percipiente_cf'],
    f24:      ['contribuente_cf', 'data_versamento'],
    fattura:  ['numero', 'data', 'totale'],
    liquidazione_iva: ['iva_debito'],
  }

  const required = REQUIRED[tipo] || []
  for (const campo of required) {
    if (!campi[campo]?.valore) {
      warnings.push(`Campo obbligatorio mancante: ${campo}`)
    }
  }

  // Validazioni CF
  if (campi.contribuente_cf?.valore || campi.percipiente_cf?.valore) {
    const cf = campi.contribuente_cf?.valore || campi.percipiente_cf?.valore
    if (cf && cf.length !== 16 && cf.length !== 11) {
      errori.push(`Codice fiscale non valido: ${cf} (lunghezza ${cf.length})`)
    }
  }

  // Calcola score: % campi con valore non null
  const vals = Object.values(campi)
  const conValore = vals.filter(v => v?.valore != null).length
  const score = vals.length > 0 ? conValore / vals.length : 0

  return { errori, warnings, score: Math.round(score * 100) }
}
