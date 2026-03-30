/**
 * CLASSIFIER — identifica il tipo di documento da testo e filename
 * Input:  { fullText, filename }
 * Output: { tipo, confidenza, metodo }
 *   tipo: 'cu' | 'fattura_attiva' | 'fattura_passiva' | 'f24' | 'liquidazione_iva' | 
 *         'estratto_conto' | 'anagrafica_nes' | 'avviso_ade' | 'altro'
 */

const RULES = [
  // CU - Certificazione Unica
  {
    tipo: 'cu',
    patterns: [
      /CERTIFICAZIONE\s+UNICA/i,
      /\bCU\s+20\d{2}\b/i,
      /sostituto\s+d.imposta/i,
      /redditi\s+di\s+lavoro\s+(dipendente|autonomo)/i,
      /mod\.?\s*cu\b/i,
    ],
    score: 0,
  },
  // F24
  {
    tipo: 'f24',
    patterns: [
      /modello\s+f24/i,
      /codice\s+tributo/i,
      /\bf24\b/i,
      /sezione\s+erario/i,
      /saldo\s+a\s+(debito|credito)/i,
    ],
    score: 0,
  },
  // Liquidazione IVA
  {
    tipo: 'liquidazione_iva',
    patterns: [
      /liquidazione\s+i\.?v\.?a/i,
      /iva\s+(a\s+debito|a\s+credito|trimestrale|mensile)/i,
      /riepilogo\s+iva/i,
      /volume\s+d.affari/i,
    ],
    score: 0,
  },
  // Fattura
  {
    tipo: 'fattura',
    patterns: [
      /\bfattura\b/i,
      /fattura\s+(n\.|numero|elettronica)/i,
      /partita\s+iva.*\d{11}/i,
      /imponibile.*iva/i,
      /totale\s+(documento|fattura)/i,
    ],
    score: 0,
  },
  // Estratto conto
  {
    tipo: 'estratto_conto',
    patterns: [
      /estratto\s+conto/i,
      /\biban\b/i,
      /saldo\s+(contabile|disponibile)/i,
      /movimenti\s+(bancari|del\s+conto)/i,
    ],
    score: 0,
  },
  // Anagrafica NES
  {
    tipo: 'anagrafica_nes',
    patterns: [
      /anagrafica\s+societ/i,
      /codice\s+anagrafica/i,
      /codice\s+dichiarante/i,
      /stato\s+anagrafica/i,
    ],
    score: 0,
  },
  // Avviso ADE — copre: cartelle, avvisi bonari, comunicazioni, accertamenti
  {
    tipo: 'avviso_ade',
    patterns: [
      /agenzia\s+delle\s+entrate/i,
      /cartella\s+di\s+pagamento/i,
      /agente\s+della\s+riscossione/i,
      /agenzia\s+entrate.{0,20}riscossione/i,
      /comunicazione\s+irregolarit/i,
      /avviso\s+bonario/i,
      /codice\s+atto/i,
      /liquidazione\s+automatizzata/i,
      /somme\s+da\s+pagare/i,
      /iscritto\s+a\s+ruolo/i,
      /ruolo\s+emesso/i,
      /codice\s+tributo/i,
      /art\.?\s*36.bis/i,
      /accertamento/i,
      /atto\s+di\s+recupero/i,
    ],
    score: 0,
  },
]

// Pattern filename rapidi
const FILENAME_RULES = [
  { pattern: /^CU\d*/i,    tipo: 'cu' },
  { pattern: /cartella/i,   tipo: 'avviso_ade' },
  { pattern: /avviso/i,     tipo: 'avviso_ade' },
  { pattern: /accertam/i,   tipo: 'avviso_ade' },
  // Fatture elettroniche — pattern filename SDI: IT + PIVA + _ + progressivo
  { pattern: /^IT\d{11}_/i, tipo: 'fattura' },
  { pattern: /fattur/i,     tipo: 'fattura' },
  { pattern: /^F24/i,      tipo: 'f24' },
  { pattern: /^ANA/i,      tipo: 'anagrafica_nes' },
  { pattern: /fattur/i,    tipo: 'fattura' },
  { pattern: /estratto/i,  tipo: 'estratto_conto' },
]

export function classifyDocument({ fullText, filename = '' }) {
  // 1. Check filename (fast path)
  for (const rule of FILENAME_RULES) {
    if (rule.pattern.test(filename)) {
      return { tipo: rule.tipo, confidenza: 'alto', metodo: 'filename' }
    }
  }

  // Per p7m: se il testo è l'XML grezzo, classificalo come fattura
  if (filename && (filename.toLowerCase().endsWith('.p7m') || filename.toLowerCase().endsWith('.xml'))) {
    if (/^IT\d{11}_/i.test(filename)) {
      return { tipo: 'fattura', confidenza: 'alto', metodo: 'filename_sdi' }
    }
  }
  if (!fullText || fullText.length < 20) {
    return { tipo: 'altro', confidenza: 'basso', metodo: 'testo_insufficiente' }
  }

  const text = fullText.substring(0, 3000) // analizza solo inizio

  // 2. Score per ogni tipo
  const scores = RULES.map(rule => {
    const matched = rule.patterns.filter(p => p.test(text)).length
    return { tipo: rule.tipo, matched, total: rule.patterns.length }
  })

  // Ordina per match
  scores.sort((a, b) => b.matched - a.matched)
  const best = scores[0]

  if (best.matched === 0) {
    return { tipo: 'altro', confidenza: 'basso', metodo: 'nessun_match' }
  }

  const ratio = best.matched / best.total
  const confidenza = ratio >= 0.6 ? 'alto' : ratio >= 0.3 ? 'medio' : 'basso'

  return { tipo: best.tipo, confidenza, metodo: 'pattern', score: ratio }
}
