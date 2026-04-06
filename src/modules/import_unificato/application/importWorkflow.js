import { sb } from '../../../lib/supabase'
import { renderPDFPagesToImages } from '../../../shared/utils'
import { parseXMLFattura } from '../../../../domain/fatture.js'
import { trace } from '../../../core/debug/trace'
import {
  traceStep,
  traceDiff,
  traceIva,
  insertCausaleIvaMeta,
  newPipelineContext,
  buildAdvancedTextSnapshot,
  extractJsonErrorPosition,
  snippetAroundIndex,
} from '../../../utils/pipelineLogger.js'
import { runImportIvaAndDraftPipeline } from '../importIvaPipeline.js'
import { ResolveIvaError } from '../../../shared/utils/primaNotaDraftFromDocumento.js'
import { triggerAutoPipeline } from '../../../utils/autoPipeline.js'
import { preprocessInvoiceTextForAi } from '../../../../domain/preprocessInvoiceTextForAi.js'

function extractFirstJsonObjectString(txt) {
  const s = String(txt).replace(/```json|```/gi, '').trim()
  const start = s.indexOf('{')
  if (start < 0) return null
  let depth = 0
  for (let i = start; i < s.length; i++) {
    const ch = s[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return s.slice(start, i + 1)
    }
  }
  return null
}

function parseAnalisiModelJson(raw) {
  const block = extractFirstJsonObjectString(raw)
  if (!block) throw new Error('Nessun JSON trovato nella risposta del modello')
  return JSON.parse(block)
}

function summarizeClaudeContentForLog(content) {
  if (!Array.isArray(content)) {
    return { kind: 'flat', snapshot: buildAdvancedTextSnapshot(String(content ?? ''), { headMax: 3200, tailMax: 1000 }) }
  }
  const parts = content.map((p) => {
    if (!p || typeof p !== 'object') return { type: 'unknown' }
    if (p.type === 'image') {
      return { type: 'image', media_type: p.source?.media_type || 'image/jpeg', note: '[base64 omesso dal log]' }
    }
    if (p.type === 'text') {
      return {
        type: 'text',
        snapshot: buildAdvancedTextSnapshot(p.text || '', { headMax: 3200, tailMax: 1000 }),
      }
    }
    return { type: p.type || 'unknown' }
  })
  return { kind: 'multipart', parts }
}

// Estrae testo da PDF usando pdfjs (evita dipendenza da parseDoc.js)
async function _extractTextFromFile(file) {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
    const ab = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: ab }).promise
    const pages = Math.min(pdf.numPages, 4)
    let text = ''
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const items = content.items.filter((it) => it.str?.trim())
      let lastY = null
      let line = []
      const lines = []
      for (const item of items) {
        const y = Math.round(item.transform[5])
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          lines.push(line.join(' '))
          line = []
        }
        line.push(item.str)
        lastY = y
      }
      if (line.length) lines.push(line.join(' '))
      text += lines.join('\n') + '\n'
    }
    return text
  } catch {
    return ''
  }
}

export async function extractXmlFromP7m(file) {
  const ab = await file.arrayBuffer()
  const bytes = new Uint8Array(ab)
  let derBytes
  if (bytes[0] === 0x30) {
    derBytes = bytes
  } else {
    const b64 = Array.from(bytes)
      .map((b) => String.fromCharCode(b))
      .join('')
      .split('')
      .filter((c) => c !== '\r' && c !== '\n' && c !== ' ')
      .join('')
    const binStr = atob(b64)
    derBytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) derBytes[i] = binStr.charCodeAt(i)
  }
  let xmlStart = -1
  for (let i = 0; i < Math.min(derBytes.length, 800); i++) {
    if (derBytes[i] === 0x3c && derBytes[i + 1] === 0x3f && derBytes[i + 2] === 0x78) { xmlStart = i; break }
    if (derBytes[i] === 0x3c && derBytes[i + 1] === 0x70 && derBytes[i + 2] === 0x3a) { xmlStart = i; break }
    if (derBytes[i] === 0x3c && derBytes[i + 1] === 0x46 && derBytes[i + 2] === 0x61) { xmlStart = i; break }
  }
  if (xmlStart === -1) throw new Error('XML non trovato nel P7M')
  let text = new TextDecoder('utf-8', { fatal: false }).decode(derBytes.slice(xmlStart))
  const e1 = text.lastIndexOf('</p:FatturaElettronica>')
  const e2 = text.lastIndexOf('</FatturaElettronica>')
  const ei = Math.max(e1, e2)
  if (ei > 0) text = text.substring(0, ei + (e1 >= e2 ? 23 : 21))
  return text.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

/** Analisi testo con Ollama (default Mistral). In dev: proxy Vite → :11434; in build: `/api/ollama-analyze`. */
export async function runOllamaAnalisiPrompt(fullPrompt, pipelineCtx, filename = '') {
  const model = import.meta.env.VITE_OLLAMA_MODEL || 'mistral'
  let data
  let res

  if (import.meta.env.DEV) {
    res = await fetch('/ollama-proxy/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: fullPrompt, stream: false }),
    })
    const raw = await res.text().catch(() => '')
    try {
      data = raw ? JSON.parse(raw) : {}
    } catch {
      data = {}
    }
    if (!res.ok) {
      const fromApi = typeof data?.error === 'string' ? data.error : ''
      const hint = fromApi || raw.slice(0, 400) || `HTTP ${res.status}`
      const fix =
        res.status === 404 || /not found/i.test(hint)
          ? ` Esegui: ollama pull ${model}`
          : res.status === 500
            ? ' Controlla che il modello sia scaricato (ollama list), che ci sia RAM/VRAM sufficiente e prova un prompt più corto.'
            : ''
      throw new Error(
        `Ollama (dev, proxy → 11434): ${hint}.${fix} Servizio: ollama serve — oppure OLLAMA_PROXY_TARGET se Ollama non è su localhost.`
      )
    }
  } else {
    res = await fetch('/api/ollama-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: fullPrompt, model }),
    })
    data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const hint = data?.error || `HTTP ${res.status}`
      if (res.status === 404) throw new Error('API /api/ollama-analyze non disponibile.')
      if (res.status === 502) {
        throw new Error(
          hint || 'Ollama non risponde (502). Avvia Ollama (ollama serve), poi: ollama pull mistral'
        )
      }
      throw new Error(hint)
    }
  }

  const raw = data.response || ''
  traceStep(
    'IMPORT_OLLAMA_OUTPUT_ADVANCED',
    buildAdvancedTextSnapshot(raw, { headMax: 5000, tailMax: 1800 }),
    { model, filename, response_total_chars: raw.length },
    pipelineCtx
  )

  let parsed
  try {
    parsed = parseAnalisiModelJson(raw)
  } catch (e) {
    const block = extractFirstJsonObjectString(raw) || ''
    const pos = extractJsonErrorPosition(e?.message)
    const target = block.length ? block : raw
    traceStep(
      'IMPORT_OLLAMA_JSON_PARSE_FAILED',
      {
        error: e?.message || String(e),
        filename,
        model,
        raw_response: buildAdvancedTextSnapshot(raw, { headMax: 5500, tailMax: 2200 }),
        extracted_json_block: block
          ? buildAdvancedTextSnapshot(block, { headMax: 5500, tailMax: 2200 })
          : null,
        at_error: pos != null ? snippetAroundIndex(target, pos, 180) : null,
      },
      { model, filename },
      pipelineCtx
    )
    throw e
  }

  traceStep('DOCUMENT_NORMALIZED', parsed, { metodo: 'ollama_mistral' }, pipelineCtx)
  traceStep(
    'IMPORT_OLLAMA_PARSE_OK',
    {
      filename,
      tipo_documento: parsed?.tipo_documento,
      confidenza: parsed?.confidenza,
      keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).slice(0, 40) : [],
    },
    { model },
    pipelineCtx
  )
  return {
    tipo: parsed.tipo_documento || 'altro',
    confidenza: parsed.confidenza ?? 0.7,
    metodo: 'ollama_mistral',
    dati: parsed,
  }
}

/** Analisi via /api/claude (solo modalità online). */
export async function runClaudeImportAnalisi(content, pipelineCtx, filename = '') {
  trace('AI_MODE_ONLINE', { phase: 'import_claude' })
  traceStep(
    'IMPORT_CLAUDE_INPUT_ADVANCED',
    summarizeClaudeContentForLog(content),
    { filename },
    pipelineCtx
  )
  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system:
        'Sei un esperto commercialista italiano. Analizza documenti fiscali. Rispondi SOLO con JSON valido, zero testo aggiuntivo.',
      messages: [{ role: 'user', content }],
    }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const hint = data?.error || data?.detail?.error?.message || `HTTP ${res.status}`
    throw new Error(
      res.status === 404 ? 'API /api/claude non raggiungibile: avvia `npm run dev:api` (porta 3001).' : hint
    )
  }
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
  traceStep(
    'IMPORT_CLAUDE_OUTPUT_ADVANCED',
    buildAdvancedTextSnapshot(txt, { headMax: 5000, tailMax: 1800 }),
    { filename, response_total_chars: txt.length },
    pipelineCtx
  )

  let parsed
  try {
    parsed = JSON.parse(txt)
  } catch (e1) {
    const block = extractFirstJsonObjectString(txt)
    try {
      parsed = block ? JSON.parse(block) : {}
    } catch (e2) {
      const pos = extractJsonErrorPosition(e2?.message || e1?.message)
      const target = block || txt
      traceStep(
        'IMPORT_CLAUDE_JSON_PARSE_FAILED',
        {
          error: e2?.message || e1?.message || String(e2 || e1),
          filename,
          text_snapshot: buildAdvancedTextSnapshot(txt, { headMax: 5500, tailMax: 2200 }),
          json_block_snapshot: block
            ? buildAdvancedTextSnapshot(block, { headMax: 5500, tailMax: 2200 })
            : null,
          at_error: pos != null ? snippetAroundIndex(target, pos, 180) : null,
        },
        { filename },
        pipelineCtx
      )
      parsed = {}
    }
  }
  traceStep('DOCUMENT_NORMALIZED', parsed, { metodo: 'claude_haiku' }, pipelineCtx)
  return {
    tipo: parsed.tipo_documento || 'altro',
    confidenza: parsed.confidenza || 0.7,
    metodo: 'claude_haiku',
    dati: parsed,
  }
}

/** Se Ollama e Claude non sono disponibili, l’import prosegue: operatore compila a mano. */
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
- Operazioni esenti / non imponibili (codice natura N1…N7, es. N4): imposta "aliquota" a 0 o "0" e il codice in "natura" (es. "N4"). Evita di usare solo "N4" come percentuale.

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

export async function analizzaDocumento(
  file,
  xmlContent = null,
  pipelineCtx,
  aiMode = 'local',
  aiPreprocessMode = 'on'
) {
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

      return {
        tipo: 'fattura_passiva',
        confidenza: 0.97,
        metodo: 'xml_deterministico',
        xml_content: xml,
        dati: normalizedDati,
      }
    }
  }

  const text = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    ? await _extractTextFromFile(file)
    : null

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

  const system =
    'Sei un esperto commercialista italiano. Analizza documenti fiscali. Rispondi SOLO con JSON valido, zero testo aggiuntivo.'
  const fullPrompt = `${system}\n\n${PROMPT_ANALISI}\n\n${docForAi}`

  if (!isScanned && docForAi) {
    traceStep(
      'IMPORT_AI_INPUT_ADVANCED',
      {
        document_block: buildAdvancedTextSnapshot(docForAi, { headMax: 3200, tailMax: 1200 }),
        full_prompt: buildAdvancedTextSnapshot(fullPrompt, { headMax: 4000, tailMax: 1500 }),
        sizes: {
          extracted_pdf_text_chars: (text || '').length,
          doc_for_ai_chars: docForAi.length,
          prompt_analisi_chars: PROMPT_ANALISI.length,
          system_chars: system.length,
          full_prompt_chars: fullPrompt.length,
        },
      },
      {
        file: file?.name,
        input_mode: usePreprocessed ? 'PREPROCESSED' : 'RAW',
        ai_mode: aiMode,
      },
      pipelineCtx
    )
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
      return await runClaudeImportAnalisi(
        [{ type: 'text', text: `${PROMPT_ANALISI}\n\n${docForAi}` }],
        pipelineCtx,
        file?.name
      )
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
    const fb = analisiFallbackSenzaAi(
      file,
      null,
      'Modalità locale: documento senza testo sufficiente — usa PDF con testo estraibile o passa a motore online.'
    )
    traceStep('DOCUMENT_NORMALIZED', fb.dati, { metodo: 'manuale_senza_ai' }, pipelineCtx)
    return fb
  }

  const imgs = await renderPDFPagesToImages(file, { maxPages: 3, scale: 1.2 })
  const content = [
    ...imgs.map((b64) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    })),
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

export async function processImportedFile({
  file,
  xmlContent = null,
  societaId,
  causaliIva,
  causaliContabili,
  clienti,
  pianoConti,
  aiEnabled,
  tipoManuale,
  aiMode,
  aiPreprocessMode,
  ai,
}) {
  const pipelineCtx = newPipelineContext()
  trace('IMPORT START', { filename: file?.name })

  const filePath = `inbox/${Date.now()}_${file.name}`
  const { data: existingDoc } = await sb.from('documenti_contabilita')
    .select('id,stato,validation_status')
    .eq('societa_id', societaId)
    .eq('filename', file.name)
    .limit(1)
  if (existingDoc?.length > 0) {
    const stato = existingDoc[0].validation_status || existingDoc[0].stato
    const isContabilizzata = stato === 'confirmed' || stato === 'registered' || stato === 'registrata'
    const msg = isContabilizzata
      ? `⚠️ "${file.name}" è già stata contabilizzata. Vuoi comunque reimportarla?`
      : `⚠️ "${file.name}" è già presente in Da Validare. Vuoi reimportarla?`
    const proceed = window.confirm(msg)
    if (!proceed) return { skipped: true }
    await sb.from('documenti_contabilita').delete().eq('id', existingDoc[0].id)
  }

  const { error: upErr } = await sb.storage.from('documenti').upload(filePath, file)
  if (upErr) throw upErr

  let analisi
  const isXmlFile = xmlContent || file.name.toLowerCase().endsWith('.xml')
  if (isXmlFile) {
    ai.setAI('processing', `Parsing XML ${file.name}`, 'local')
    analisi = await analizzaDocumento(file, xmlContent, pipelineCtx, aiMode, aiPreprocessMode)
  } else if (aiEnabled) {
    ai.setAI('processing', `Analisi AI ${file.name}`, aiMode === 'online' ? 'ai' : 'local')
    analisi = await analizzaDocumento(file, xmlContent, pipelineCtx, aiMode, aiPreprocessMode)
  } else {
    ai.setAI('done', 'AI disattivata', 'local')
    analisi = {
      tipo: tipoManuale || 'fattura_passiva',
      confidenza: 0.5,
      metodo: 'manuale',
      dati: { cedente_denom: file.name.replace(/\.[^.]+$/, '') },
    }
  }

  trace('AFTER PARSE', {
    riepilogo_iva: analisi?.dati?.riepilogo_iva,
    raw_analysis: analisi?.dati,
  })

  trace('IMPORT', { file: file.name, tipo: analisi.tipo, confidenza: analisi.confidenza, metodo: analisi.metodo })
  const tipoFinale = tipoManuale || analisi.tipo

  let ivaDraftResult = null
  let importIvaPipelineFailed = false
  if ((tipoFinale === 'fattura_passiva' || tipoFinale === 'fattura_attiva') && causaliIva.length) {
    try {
      ivaDraftResult = await runImportIvaAndDraftPipeline({
        analisi,
        tipoFinale,
        societaId,
        pianoConti,
        causaliIva,
        causaliContabili,
        clienti,
        pipelineCtx,
      })
    } catch (e) {
      importIvaPipelineFailed = true
      if (e instanceof ResolveIvaError) {
        const hint = e.details?.aliquota_percent != null ? `\n\nAliquota: ${e.details.aliquota_percent}%` : ''
        alert(`Import bloccato — ${file.name}\n\n${e.message}${hint}\n\nImpostazioni Procedure → Aliquote IVA.`)
      } else {
        console.error('[import_unificato] IVA + draft pipeline', e)
        alert(`Import bloccato — ${file.name}\n\n${e?.message || String(e)}`)
      }
    }
  }

  if (importIvaPipelineFailed) {
    ai.setAI('done', 'Errore causale IVA', 'local')
    return { skipped: true }
  }

  const ai_raw_response = {
    ...analisi.dati,
    tipo_documento: tipoFinale,
    metodo: analisi.metodo,
    xml_content: xmlContent || analisi.xml_content || null,
    ...(ivaDraftResult
      ? {
          riepilogo_iva: ivaDraftResult.enrichedDati.riepilogo_iva,
          linee: ivaDraftResult.enrichedDati.linee,
          causale_iva_id: ivaDraftResult.headerCausaleIvaId,
          prima_nota_guidata_draft: JSON.parse(JSON.stringify(ivaDraftResult.primaNotaDraft)),
        }
      : {}),
  }

  const documentiImportPayload = {
    filename: file.name,
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type,
    tipo_documento: tipoFinale,
    confidence: analisi.confidenza,
    ai_summary: `${tipoFinale} — ${analisi.dati?.cedente_denom || analisi.dati?.contribuente || file.name}`,
    ai_raw_response,
    stato: 'classified',
    societa_destinazione_id: societaId,
  }
  traceStep('INSERT_PAYLOAD', documentiImportPayload, { table: 'documenti_import', ...insertCausaleIvaMeta(documentiImportPayload) }, pipelineCtx)
  const { data: doc, error: dbErr } = await sb.from('documenti_import').insert([documentiImportPayload]).select().single()
  if (doc?.id) pipelineCtx.documentId = doc.id
  traceStep('INSERT_RESULT', { table: 'documenti_import', data: doc, error: dbErr }, {}, pipelineCtx)
  if (dbErr) throw dbErr

  if (
    doc?.id &&
    aiEnabled &&
    (tipoFinale === 'fattura_passiva' || tipoFinale === 'fattura_attiva')
  ) {
    triggerAutoPipeline(doc.id, {
      source: 'import_unificato_staging',
      aiMode: aiMode === 'online' ? 'online' : 'local',
      aiPreprocessMode,
    })
  }

  if (doc?.id && ivaDraftResult?.primaNotaDraft) {
    const draft = JSON.parse(JSON.stringify(ivaDraftResult.primaNotaDraft))
    draft.meta = { ...draft.meta, documento_import_id: doc.id }
    const nextRaw = { ...ai_raw_response, prima_nota_guidata_draft: draft }
    await sb.from('documenti_import').update({ ai_raw_response: nextRaw }).eq('id', doc.id)
  }

  const piva = analisi.dati?.cedente_piva || analisi.dati?.cessionario_piva || analisi.dati?.codice_fiscale
  if (piva && clienti.length) {
    const norm = (p) => (p || '').replace(/\s|-/g, '').replace(/^IT/i, '').toUpperCase()
    const match = clienti.find((c) => norm(c.partita_iva) === norm(piva) || norm(c.codice_fiscale) === norm(piva))
    if (match) await sb.from('documenti_import').update({ cliente_id: match.id, cliente_match_type: 'auto' }).eq('id', doc.id)
  }

  ai.setAI('done', `${file.name} classificato`, 'ai')
  return { skipped: false, doc }
}
