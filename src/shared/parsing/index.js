/**
 * ENTRY POINT — pipeline completa
 * 
 * Uso:
 *   import { analyzeDocument } from '../shared/parsing'
 *   const result = await analyzeDocument(file, { aiEnabled: true, onProgress: setProgress })
 * 
 * Output:
 * {
 *   documento: 'cu' | 'f24' | 'fattura' | ...,
 *   classificazione: { confidenza, metodo },
 *   campi: { [campo]: { valore, confidenza, fonte } },
 *   warnings: string[],
 *   errori: string[],
 *   score: number,          // 0-100, % campi trovati
 *   metodo_parsing: 'deterministico' | 'vision' | 'ibrido',
 *   testo_estratto: string, // per debug
 * }
 */

import { extractFromPDF }    from './extractor.js'
import { classifyDocument }  from './classifier.js'
import { normalizeText }     from './normalizer.js'
import { parseCU }           from './parsers/cu.js'
import { parseF24 }          from './parsers/f24.js'
import { parseFattura }      from './parsers/fattura.js'
import { validateResult }    from './validator.js'
import { visionFallback }    from './vision.js'

// Soglia: se score deterministico < VISION_THRESHOLD e AI è ON → usa vision
const VISION_THRESHOLD = 30 // %

export async function analyzeDocument(file, {
  aiEnabled = true,
  tipoForzato = null,   // forza il tipo senza classificazione
  onProgress = null,
} = {}) {

  const result = {
    documento: 'altro',
    classificazione: {},
    campi: {},
    warnings: [],
    errori: [],
    score: 0,
    metodo_parsing: 'deterministico',
    testo_estratto: '',
  }

  try {
    // ── STEP 1: Estrai testo ──────────────────────────────────────
    onProgress?.('Estrazione testo...')
    let fullText = ''
    let pages = []
    let isScanned = false

    const isPDF = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')

    if (isPDF) {
      const extracted = await extractFromPDF(file, { maxPages: 10 })
      fullText = normalizeText(extracted.fullText)
      pages    = extracted.pages
      isScanned = extracted.isScanned
    } else if (file.type?.startsWith('image/')) {
      // Immagine: testo non estraibile deterministicamente
      isScanned = true
    }

    result.testo_estratto = fullText.substring(0, 2000) // trunca per debug

    // ── STEP 2: Classifica ────────────────────────────────────────
    onProgress?.('Classificazione documento...')
    const classificazione = tipoForzato
      ? { tipo: tipoForzato, confidenza: 'alto', metodo: 'forzato' }
      : classifyDocument({ fullText, filename: file.name })

    result.documento = classificazione.tipo
    result.classificazione = classificazione

    // ── STEP 3: Parsing deterministico ───────────────────────────
    if (!isScanned && fullText.length > 50) {
      onProgress?.(`Parsing ${classificazione.tipo}...`)
      let parseResult = { campi: {}, warnings: [] }

      switch (classificazione.tipo) {
        case 'cu':
          parseResult = parseCU(fullText, pages); break
        case 'f24':
          parseResult = parseF24(fullText); break
        case 'fattura':
        case 'fattura_attiva':
        case 'fattura_passiva':
          parseResult = parseFattura(fullText); break
        default:
          // Nessun parser specifico → score 0 → triggera vision se AI ON
          break
      }

      result.campi    = parseResult.campi
      result.warnings = [...result.warnings, ...parseResult.warnings]
    }

    // ── STEP 4: Validazione ───────────────────────────────────────
    const validation = validateResult({ tipo: result.documento, campi: result.campi })
    result.errori    = [...result.errori, ...validation.errori]
    result.warnings  = [...result.warnings, ...validation.warnings]
    result.score     = validation.score

    // ── STEP 5: Vision fallback ───────────────────────────────────
    // Attiva se: AI ON + (documento scannerizzato OPPURE score basso)
    const needsVision = isScanned || result.score < VISION_THRESHOLD
    if (aiEnabled && needsVision && (isPDF || file.type?.startsWith('image/'))) {
      onProgress?.('Testo insufficiente, attivo analisi AI...')
      try {
        const visionResult = await visionFallback(file, result.documento, onProgress)
        // Merge: vision riempie solo i campi ancora null
        for (const [k, v] of Object.entries(visionResult.campi)) {
          if (!result.campi[k]?.valore) {
            result.campi[k] = v // confidenza 'basso' già impostata in vision.js
          }
        }
        result.metodo_parsing = result.score < VISION_THRESHOLD ? 'vision' : 'ibrido'
        // Ricalcola score dopo merge
        const v2 = validateResult({ tipo: result.documento, campi: result.campi })
        result.score = v2.score
      } catch (e) {
        result.warnings.push(`Vision fallback non disponibile: ${e.message}`)
      }
    }

  } catch (e) {
    result.errori.push(`Errore pipeline: ${e.message}`)
  }

  return result
}

// Helper: converte result pipeline → formato documenti_import per Supabase
export function pipelineResultToDocRecord(result, filename) {
  const cf  = result.campi?.percipiente_cf?.valore
            || result.campi?.contribuente_cf?.valore
            || result.campi?.emittente_cf?.valore
  const piva = result.campi?.emittente_piva?.valore

  return {
    tipo_documento:      result.documento,
    confidence:          result.score / 100,
    ai_summary:          buildSummary(result),
    ai_raw_response:     result.campi,
    cf_estratto:         cf || null,
    piva_estratta:       piva || null,
    metodo_parsing:      result.metodo_parsing,
  }
}

function buildSummary(result) {
  const tipo = result.documento
  const c = result.campi
  if (tipo === 'cu') {
    const nome = `${c.percipiente_cognome?.valore || ''} ${c.percipiente_nome?.valore || ''}`.trim()
    return `CU ${c.anno_riferimento?.valore || ''} — ${nome || 'percipiente sconosciuto'} — reddito: ${c.reddito_imponibile?.valore ?? '?'}`
  }
  if (tipo === 'f24') {
    return `F24 del ${c.data_versamento?.valore || '?'} — saldo: ${c.saldo?.valore ?? '?'}`
  }
  if (tipo === 'fattura') {
    return `Fattura n. ${c.numero?.valore || '?'} del ${c.data?.valore || '?'} — totale: ${c.totale?.valore ?? '?'}`
  }
  return `Documento: ${tipo} — score: ${result.score}%`
}
