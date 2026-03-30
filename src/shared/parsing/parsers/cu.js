/**
 * CU PARSER — Certificazione Unica
 * Estrae i campi principali dal testo CU
 * I numeri di campo CU sono stabili per legge (es. punto 1 = reddito lavoro dipendente)
 */
import { findAmount, findCF, findDate } from '../normalizer.js'

// Mappa punti CU → campi semantici (stabili per legge)
const CU_FIELDS = [
  // Dati sostituto
  { campo: 'sostituto_cf',          label: 'codice fiscale sostituto',     tipo: 'cf' },
  { campo: 'sostituto_denominazione',label: 'denominazione',               tipo: 'testo', window: 60 },
  // Dati percipiente
  { campo: 'percipiente_cf',        label: 'codice fiscale',               tipo: 'cf' },
  { campo: 'percipiente_cognome',   label: 'cognome',                      tipo: 'testo', window: 40 },
  { campo: 'percipiente_nome',      label: 'nome',                         tipo: 'testo', window: 30 },
  // Redditi lavoro dipendente
  { campo: 'reddito_imponibile',    patterns: [/punto\s+1\b/i, /reddito\s+imponibile/i, /\bpunto\s+1\s*[\:\-]/i], tipo: 'importo' },
  { campo: 'ritenute_irpef',        patterns: [/punto\s+4\b/i, /ritenute?\s+irpef/i, /imposta\s+lorda/i],         tipo: 'importo' },
  { campo: 'addizionale_regionale', patterns: [/punto\s+12\b/i, /addizionale\s+regionale/i],                       tipo: 'importo' },
  { campo: 'addizionale_comunale',  patterns: [/punto\s+15\b/i, /addizionale\s+comunale/i],                        tipo: 'importo' },
  { campo: 'detrazioni_lavoro',     patterns: [/punto\s+6\b/i, /detrazioni?\s+lavoro/i],                           tipo: 'importo' },
  // Redditi lavoro autonomo
  { campo: 'compensi_lavoro_autonomo', patterns: [/punto\s+4\b.*autonomo/i, /compensi\s+lordi/i, /ammontare\s+lordo/i], tipo: 'importo' },
  { campo: 'ritenute_autonomo',     patterns: [/ritenute?\s+operate/i, /ritenuta\s+operata/i],                     tipo: 'importo' },
  { campo: 'anno_riferimento',      patterns: [/anno\s+di\s+riferimento/i, /anno\s+d.imposta/i, /cu\s+20\d{2}/i], tipo: 'anno' },
]

export function parseCU(fullText, pages) {
  const campi = {}
  const warnings = []

  for (const field of CU_FIELDS) {
    let result = { valore: null, confidenza: 'basso', fonte: null }

    if (field.tipo === 'cf') {
      result = findCF(fullText)
    } else if (field.tipo === 'importo') {
      result = findAmount(fullText, field.patterns || [new RegExp(field.label, 'i')])
    } else if (field.tipo === 'anno') {
      const patterns = field.patterns || []
      for (const p of patterns) {
        const m = p.exec(fullText)
        if (m) {
          const anno = fullText.substring(m.index, m.index + 30).match(/\b(20\d{2})\b/)
          if (anno) { result = { valore: parseInt(anno[1]), confidenza: 'alto', fonte: { offset: m.index } }; break }
        }
      }
    } else if (field.tipo === 'testo') {
      const p = new RegExp(field.label + '[\\s\\S]{0,' + (field.window || 60) + '}', 'i')
      const m = p.exec(fullText)
      if (m) {
        const val = m[0].replace(new RegExp(field.label, 'i'), '').replace(/[:\-\s]+/, '').split('\n')[0].trim().substring(0, field.window || 60)
        result = { valore: val || null, confidenza: val ? 'medio' : 'basso', fonte: { offset: m.index } }
      }
    }

    campi[field.campo] = result
  }

  // Validazione coerenza CU
  const reddito = campi.reddito_imponibile?.valore
  const ritenute = campi.ritenute_irpef?.valore
  if (reddito && ritenute) {
    const aliquotaEff = (ritenute / reddito) * 100
    if (aliquotaEff < 5 || aliquotaEff > 55) {
      warnings.push(`Aliquota effettiva IRPEF anomala: ${aliquotaEff.toFixed(1)}% (ritenute ${ritenute} su reddito ${reddito})`)
    }
  }

  return { campi, warnings }
}
