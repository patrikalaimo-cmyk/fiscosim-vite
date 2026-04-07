import { parseXMLFattura } from '../../../../domain/fatture.js'
import { trace } from '../../../core/debug/trace'
import {
  traceStep,
  buildAdvancedTextSnapshot,
} from '../../../utils/pipelineLogger.js'
import { preprocessInvoiceTextForAi } from '../../../../domain/preprocessInvoiceTextForAi.js'
import {
  buildJsonParseFailurePayload,
  extractFirstJsonObjectString,
  parseAnalisiModelJson,
  summarizeClaudeContentForLog,
} from './importAiParsers.js'
import {
  extractTextFromFile,
  extractXmlFromP7m,
  renderImportPdfPagesToImages,
} from './importAiBrowser.js'
import {
  fetchClaudeImportAnalisi,
  fetchOllamaAnalisiDev,
  fetchOllamaAnalisiProd,
} from './importAiClient.js'
import { saveImportOperatorCorrections } from './importOperatorCorrections.js'

export { extractXmlFromP7m }
export async function runOllamaAnalisiPrompt(fullPrompt, pipelineCtx, filename = '') {
  const model = import.meta.env.VITE_OLLAMA_MODEL || 'mistral'
  let data
  let res
  let raw = ''

  if (import.meta.env.DEV) {
    const devRes = await fetchOllamaAnalisiDev(fullPrompt, model)
    res = devRes.res
    raw = devRes.raw
    data = devRes.data
    if (!res.ok) {
      const fromApi = typeof data?.error === 'string' ? data.error : ''
      const hint = fromApi || raw.slice(0, 400) || `HTTP ${res.status}`
      const fix =
        res.status === 404 || /not found/i.test(hint)
          ? ` Esegui: ollama pull ${model}`
          : res.status === 500
            ? ' Controlla che il modello sia scaricato (ollama list), che ci sia RAM/VRAM sufficiente e prova un prompt più corto.'
            : ''
      throw new Error(`Ollama (dev, proxy -> 11434): ${hint}.${fix} Servizio: ollama serve - oppure OLLAMA_PROXY_TARGET se Ollama non è su localhost.`)
    }
  } else {
    const prodRes = await fetchOllamaAnalisiProd(fullPrompt, model)
    res = prodRes.res
    data = prodRes.data
    if (!res.ok) {
      const hint = data?.error || `HTTP ${res.status}`
      if (res.status === 404) throw new Error('API /api/ollama-analyze non disponibile.')
      if (res.status === 502) {
        throw new Error(hint || 'Ollama non risponde (502). Avvia Ollama (ollama serve), poi: ollama pull mistral')
      }
      throw new Error(hint)
    }
    raw = data.response || ''
  }

  traceStep('IMPORT_OLLAMA_OUTPUT_ADVANCED', buildAdvancedTextSnapshot(raw, { headMax: 5000, tailMax: 1800 }), { model, filename, response_total_chars: raw.length }, pipelineCtx)

  let parsed
  try {
    parsed = parseAnalisiModelJson(raw)
  } catch (e) {
    const block = extractFirstJsonObjectString(raw) || ''
    traceStep('IMPORT_OLLAMA_JSON_PARSE_FAILED', {
      filename,
      model,
      ...buildJsonParseFailurePayload(e, raw, block),
    }, { model, filename }, pipelineCtx)
    throw e
  }

  traceStep('DOCUMENT_NORMALIZED', parsed, { metodo: 'ollama_mistral' }, pipelineCtx)
  traceStep('IMPORT_OLLAMA_PARSE_OK', {
    filename,
    tipo_documento: parsed?.tipo_documento,
    confidenza: parsed?.confidenza,
    keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 40) : [],
  }, { model }, pipelineCtx)
  return { tipo: parsed.tipo_documento || 'altro', confidenza: parsed.confidenza ?? 0.7, metodo: 'ollama_mistral', dati: parsed }
}

export async function runClaudeImportAnalisi(content, pipelineCtx, filename = '') {
  trace('AI_MODE_ONLINE', { phase: 'import_claude' })
  traceStep('IMPORT_CLAUDE_INPUT_ADVANCED', summarizeClaudeContentForLog(content), { filename }, pipelineCtx)
  const { res, data } = await fetchClaudeImportAnalisi(content)
  if (!res.ok) {
    const hint = data?.error || data?.detail?.error?.message || `HTTP ${res.status}`
    throw new Error(res.status === 404 ? 'API /api/claude non raggiungibile: avvia `npm run dev:api` (porta 3001).' : hint)
  }
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
  traceStep('IMPORT_CLAUDE_OUTPUT_ADVANCED', buildAdvancedTextSnapshot(txt, { headMax: 5000, tailMax: 1800 }), { filename, response_total_chars: txt.length }, pipelineCtx)

  let parsed
  try {
    parsed = JSON.parse(txt)
  } catch (e1) {
    const block = extractFirstJsonObjectString(txt)
    try {
      parsed = block ? JSON.parse(block) : {}
    } catch (e2) {
      traceStep('IMPORT_CLAUDE_JSON_PARSE_FAILED', {
        filename,
        text_snapshot: buildAdvancedTextSnapshot(txt, { headMax: 5500, tailMax: 2200 }),
        ...buildJsonParseFailurePayload(e2 || e1, txt, block),
      }, { filename }, pipelineCtx)
      parsed = {}
    }
  }
  traceStep('DOCUMENT_NORMALIZED', parsed, { metodo: 'claude_haiku' }, pipelineCtx)
  return { tipo: parsed.tipo_documento || 'altro', confidenza: parsed.confidenza || 0.7, metodo: 'claude_haiku', dati: parsed }
}

function analisiFallbackSenzaAi(file, textSlice, reason) {
  const base = file.name.replace(/\.[^.]+$/, '')
  return {
    tipo: 'fattura_passiva',
    confidenza: 0.15,
    metodo: 'manuale_senza_ai',
    dati: {
      cedente_denom: base,
      file_riferimento: file.name,
      note_ai: reason || 'Nessun motore AI disponibile',
      estratto_testo_breve: textSlice ? String(textSlice).slice(0, 500) : null,
    },
  }
}

const PROMPT_ANALISI = `Analizza questo documento fiscale italiano e rispondi SOLO con JSON.

Se vedi la sezione "RIEPILOGO_STRUTTURATO", usala come fonte primaria: contiene righe con importi già in formato 12.34 (EUR), P.IVA, CF, date e frammenti utili estratti dal PDF.

Determina il tipo:
- "fattura_passiva" = fattura ricevuta (acquisto)  
- "fattura_attiva" = fattura emessa (vendita)
- "f24" = modello F24 di pagamento
- "avviso_ade" = avviso/cartella Agenzia Entrate
- "cu" = Certificazione Unica
- "altro" = altro

Per FATTURA estrai:
{
  "tipo_documento": "fattura_passiva|fattura_attiva",
  "confidenza": 0.95,
  "numero": "numero fattura",
  "data": "YYYY-MM-DD",
  "tipo_doc": "TD01|TD04|...",
  "cedente_denom": "nome fornitore",
  "cedente_piva": "PIVA fornitore",
  "cedente_cf": "CF fornitore",
  "cessionario_denom": "nome cliente",
  "cessionario_piva": "PIVA cliente",
  "imponibile": 0.00,
  "iva": 0.00,
  "totale": 0.00,
  "riepilogo_iva": [{"aliquota":"22","imponibile":0,"imposta":0,"natura":""}],
  "causale": "descrizione servizio/bene",
  "linee": [{"desc":"","qty":1,"prezzo":0,"totale":0,"iva":"22"}]
}

Regole IVA e importi (Italia):
- Importi: preferisci numeri JSON (es. 2585.5); se usi stringhe, formato italiano tipo "2.585,50" è ammesso.
- Operazioni esenti / non imponibili (codice natura N1...N7, es. N4): imposta "aliquota" a 0 o "0" e il codice in "natura" (es. "N4"). Evita di usare solo "N4" come percentuale.

Per F24 estrai:
{
  "tipo_documento": "f24",
  "confidenza": 0.95,
  "contribuente": "nome contribuente",
  "codice_fiscale": "CF",
  "data_versamento": "YYYY-MM-DD",
  "saldo_finale": 0.00,
  "sezione_erario": [{"codice_tributo":"","mese_rif":"","anno_rif":"","debito":0,"credito":0}],
  "sezione_inps": [{"codice":"7014","causale":"","matricola":"","periodo":"","debito":0,"credito":0}],
  "sezione_regioni": [],
  "sezione_imu": [],
  "totale_debiti": 0.00,
  "totale_crediti": 0.00
}

Per AVVISO ADE estrai:
{
  "tipo_documento": "avviso_ade",
  "confidenza": 0.95,
  "tipo_avviso": "Cartella di pagamento|Avviso bonario|Comunicazione irregolarità (36-bis)|Accertamento|Altro",
  "numero_atto": "",
  "destinatario": "",
  "codice_fiscale": "",
  "importo": 0.00,
  "data_scadenza": "YYYY-MM-DD",
  "anno_imposta": 2024,
  "modello_dichiarativo": "Redditi 2024|IRAP|IVA|...",
  "contenuto": "descrizione debito"
}`

export async function analizzaDocumento(file, xmlContent = null, pipelineCtx, aiMode = 'local', aiPreprocessMode = 'on') {
  if (xmlContent || file.name.toLowerCase().endsWith('.xml') || file.name.toLowerCase().endsWith('.p7m')) {
    const xml = xmlContent || await file.text()
    if (xml.includes('FatturaElettronica') || xml.includes('CedentePrestatore')) {
      const dati = parseXMLFattura(xml)
      traceStep('PARSE_XML_OUTPUT', dati, { metodo: 'xml_deterministico' }, pipelineCtx)

      const normalizedDati = {
        numero: dati.numero,
        data: dati.data,
        tipo_doc: dati.tipo || 'TD01',
        cedente_denom: dati.nome_cedente || dati.fornitore,
        cedente_piva: dati.piva_cedente || dati.fornitore_cf,
        cedente_cf: dati.cf_cedente,
        cedente_ind: dati.indirizzo_cedente,
        cessionario_denom: dati.nome_cessionario || dati.cliente,
        cessionario_piva: dati.piva_cessionario,
        cessionario_cf: dati.cf_cessionario,
        imponibile: dati.imponibile,
        iva: dati.imposta,
        totale: dati.totale_doc || dati.totale,
        riepilogo_iva: dati.riepilogo || [],
        linee: dati.lines || [],
        pagamenti: dati.pagamenti || [],
        causale: dati.causale,
      }
      traceStep('DOCUMENT_NORMALIZED', normalizedDati, { metodo: 'xml_deterministico' }, pipelineCtx)

      return { tipo: 'fattura_passiva', confidenza: 0.97, metodo: 'xml_deterministico', xml_content: xml, dati: normalizedDati }
    }
  }

  const text = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf') ? await extractTextFromFile(file) : null
  const isScanned = !text || text.replace(/\s/g, '').length < 200
  const usePreprocessed = aiPreprocessMode !== 'off'
  let docForAi = ''

  if (!isScanned) {
    if (usePreprocessed) {
      trace('AI_INPUT_MODE: PREPROCESSED', { file: file?.name })
      const pre = preprocessInvoiceTextForAi(text || '', { maxChars: 12000 })
      trace('INVOICE_TEXT_PREPROCESSED', { file: file?.name, ...pre.stats })
      docForAi = pre.compactText
    } else {
      trace('AI_INPUT_MODE: RAW', { file: file?.name })
      docForAi = (text || '').substring(0, 12000)
    }
  }

  const system = 'Sei un esperto commercialista italiano. Analizza documenti fiscali. Rispondi SOLO con JSON valido, zero testo aggiuntivo.'
  const fullPrompt = `${system}\n\n${PROMPT_ANALISI}\n\n${docForAi}`

  if (!isScanned && docForAi) {
    traceStep('IMPORT_AI_INPUT_ADVANCED', {
      document_block: buildAdvancedTextSnapshot(docForAi, { headMax: 3200, tailMax: 1200 }),
      full_prompt: buildAdvancedTextSnapshot(fullPrompt, { headMax: 4000, tailMax: 1500 }),
      sizes: {
        extracted_pdf_text_chars: (text || '').length,
        doc_for_ai_chars: docForAi.length,
        prompt_analisi_chars: PROMPT_ANALISI.length,
        system_chars: system.length,
        full_prompt_chars: fullPrompt.length,
      },
    }, { file: file?.name, input_mode: usePreprocessed ? 'PREPROCESSED' : 'RAW', ai_mode: aiMode }, pipelineCtx)
  }

  if (!isScanned) {
    if (aiMode === 'local') {
      trace('AI_MODE_LOCAL', { file: file?.name, phase: 'import_text' })
      try {
        return await runOllamaAnalisiPrompt(fullPrompt, pipelineCtx, file?.name)
      } catch (eOllama) {
        const reason = eOllama?.message || String(eOllama)
        trace('AI_LOCAL_FAILED', { file: file?.name, error: reason })
        const fb = analisiFallbackSenzaAi(file, text?.substring(0, 800), reason)
        traceStep('DOCUMENT_NORMALIZED', fb.dati, { metodo: 'manuale_senza_ai' }, pipelineCtx)
        return fb
      }
    }
    try {
      return await runClaudeImportAnalisi([{ type: 'text', text: `${PROMPT_ANALISI}\n\n${docForAi}` }], pipelineCtx, file?.name)
    } catch (eClaude) {
      const reason = eClaude?.message || String(eClaude)
      trace('AI_ONLINE_FAILED', { file: file?.name, error: reason })
      const fb = analisiFallbackSenzaAi(file, text?.substring(0, 800), reason)
      traceStep('DOCUMENT_NORMALIZED', fb.dati, { metodo: 'manuale_senza_ai' }, pipelineCtx)
      return fb
    }
  }

  if (aiMode === 'local') {
    trace('AI_MODE_LOCAL', { file: file?.name, phase: 'import_scanned', note: 'no_vision' })
    const fb = analisiFallbackSenzaAi(file, null, 'Modalità locale: documento senza testo sufficiente - usa PDF con testo estraibile o passa a motore online.')
    traceStep('DOCUMENT_NORMALIZED', fb.dati, { metodo: 'manuale_senza_ai' }, pipelineCtx)
    return fb
  }

  const imgs = await renderImportPdfPagesToImages(file, { maxPages: 3, scale: 1.2 })
  const content = [
    ...imgs.map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })),
    { type: 'text', text: PROMPT_ANALISI },
  ]

  try {
    return await runClaudeImportAnalisi(content, pipelineCtx, file?.name)
  } catch (eClaude) {
    const reason = eClaude?.message || String(eClaude)
    trace('AI_ONLINE_FAILED', { file: file?.name, error: reason, phase: 'vision' })
    const fb = analisiFallbackSenzaAi(file, null, reason)
    traceStep('DOCUMENT_NORMALIZED', fb.dati, { metodo: 'manuale_senza_ai' }, pipelineCtx)
    return fb
  }
}

export async function saveOperatorCorrections({ documentId, form, tipo, pianoConti }) {
  return saveImportOperatorCorrections({ documentId, form, tipo, pianoConti })
}

