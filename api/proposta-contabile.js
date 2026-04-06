// API per proposta contabile da fattura XML/PDF — motore unificato: runAiAccounting (pipeline)

import { getSupabaseAdmin } from '../lib/db.js'
import {
  getFiscalKnowledge,
  promptBodyFromFiscalRows,
  FISCAL_CATEGORIES_ACCOUNTING,
} from '../lib/fiscalKnowledge.js'
import {
  fetchAiMemoryContextForAccounting,
  AI_MEMORY_PROMPT_MAX_CHARS,
  extractPivaHintFromText,
} from '../services/aiMemoryRetrievalService.js'
import { runAiAccounting } from '../services/aiAccountingService.js'

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 120,
}

/** Estrazione leggera campi FatturaPA (regex) per popolare parsingJson. */
function extractXmlQuickFields(xml) {
  const t = String(xml || '')
  const g = (re) => {
    const m = t.match(re)
    return m ? String(m[1]).trim() : ''
  }
  const imponibile = parseFloat(String(g(/<ImponibileImporto>([^<]+)<\/ImponibileImporto>/) || '0').replace(',', '.')) || 0
  const ivaAmt = parseFloat(String(g(/<Imposta>([^<]+)<\/Imposta>/) || '0').replace(',', '.')) || 0
  const aliq = parseFloat(String(g(/<AliquotaIVA>([^<]+)<\/AliquotaIVA>/) || '0').replace(',', '.')) || 0
  return {
    data: g(/<Data>([^<]+)<\/Data>/),
    numero: g(/<Numero>([^<]+)<\/Numero>/),
    cedenteDenominazione: g(/<CedentePrestatore>[\s\S]*?<Denominazione>([^<]+)<\/Denominazione>/),
    cedentePiva: g(/<CedentePrestatore>[\s\S]*?<IdCodice>([^<]+)<\/IdCodice>/),
    cessionarioDenominazione: g(/<CessionarioCommittente>[\s\S]*?<Denominazione>([^<]+)<\/Denominazione>/),
    cessionarioPiva: g(/<CessionarioCommittente>[\s\S]*?<IdCodice>([^<]+)<\/IdCodice>/),
    imponibile,
    iva: ivaAmt,
    aliquota: aliq,
  }
}

async function extractPdfTextForProposta(buf) {
  if (!buf || !buf.length) return ''
  try {
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const data = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
    const loadingTask = getDocument({ data, disableRange: true, disableStream: true })
    const pdf = await loadingTask.promise
    const maxPages = Math.min(pdf.numPages, 50)
    const parts = []
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const tc = await page.getTextContent()
      const line = tc.items.map((it) => (it && typeof it.str === 'string' ? it.str : '')).join(' ')
      parts.push(line)
    }
    return parts.join('\n').trim()
  } catch {
    return ''
  }
}

function buildParsingJsonForProposta({
  isXML,
  xmlText,
  textContent,
  textFromPdf,
  filename,
  tipoFattura,
}) {
  const tipo = String(tipoFattura || '').includes('attiva') ? 'fattura_attiva' : 'fattura_passiva'
  if (isXML && xmlText) {
    const f = extractXmlQuickFields(xmlText)
    return {
      meta: { tipo_documento: tipo, confidence: 0.75, fonte: 'proposta-contabile-xml' },
      documento: {
        data: f.data || null,
        fornitore: {
          nome: f.cedenteDenominazione || null,
          piva: f.cedentePiva || null,
        },
        cessionario: {
          nome: f.cessionarioDenominazione || null,
          piva: f.cessionarioPiva || null,
        },
        numero_documento: f.numero || null,
      },
      contabile: {
        imponibile: f.imponibile,
        iva: f.iva,
        aliquota: f.aliquota,
      },
      estratto_xml: xmlText.substring(0, 100000),
    }
  }
  const raw = (textFromPdf || textContent || '').trim()
  return {
    meta: { tipo_documento: tipo, confidence: 0.6, fonte: 'proposta-contabile-testo' },
    documento: {
      fornitore: { nome: null, piva: null },
    },
    contabile: { imponibile: 0, iva: 0, aliquota: 0 },
    estratto_documento: raw.substring(0, 100000),
    nome_file: filename || null,
  }
}

function mapEngineToLegacyAnalysis({ acc, parsingJson, tipoFattura, rawText }) {
  const tipo =
    String(tipoFattura || '').includes('attiva') || parsingJson?.meta?.tipo_documento === 'fattura_attiva'
      ? 'fattura_attiva'
      : 'fattura_passiva'
  const isPassiva = tipo === 'fattura_passiva'
  const doc = parsingJson?.documento || {}
  const f = doc.fornitore || {}
  const ces = doc.cessionario || {}
  const cont = parsingJson?.contabile || {}

  if (!acc?.ok) {
    return {
      tipo_fattura: tipo,
      numero_documento: doc.numero_documento || null,
      data_documento: doc.data || null,
      cedente: {
        denominazione: f.nome || null,
        partita_iva: f.piva || null,
        codice_fiscale: null,
      },
      cessionario: {
        denominazione: ces.nome || null,
        partita_iva: ces.piva || null,
        codice_fiscale: null,
      },
      imponibile: cont.imponibile ?? 0,
      iva: cont.iva ?? 0,
      totale: (cont.imponibile ?? 0) + (cont.iva ?? 0),
      aliquota_iva: cont.aliquota ?? null,
      proposta_contabile: {
        causale_codice: isPassiva ? 'FF' : 'FC',
        causale_descrizione: isPassiva ? 'Fattura Fornitore' : 'Fattura Cliente',
        conto_costo_ricavo: '',
        conto_costo_ricavo_codice: '',
        causale_iva_codice: '',
        causale_iva_descrizione: '',
      },
      is_transitorio: true,
      motivo_transitorio: acc?.error || 'runAiAccounting non riuscito',
      confidence: 0.15,
      note: 'Motore: runAiAccounting (pipeline)',
      righe_prima_nota: [],
      engine: 'runAiAccounting',
    }
  }

  const rows = acc.rows || []
  const tot = acc.totale != null ? acc.totale : (cont.imponibile ?? 0) + (cont.iva ?? 0)

  return {
    tipo_fattura: tipo,
    numero_documento: doc.numero_documento || null,
    data_documento: doc.data || null,
    cedente: {
      denominazione: f.nome || null,
      partita_iva: f.piva || null,
      codice_fiscale: null,
    },
    cessionario: {
      denominazione: ces.nome || null,
      partita_iva: ces.piva || null,
      codice_fiscale: null,
    },
    imponibile: cont.imponibile ?? 0,
    iva: cont.iva ?? 0,
    totale: tot,
    aliquota_iva: cont.aliquota ?? null,
    proposta_contabile: {
      causale_codice: isPassiva ? 'FF' : 'FC',
      causale_descrizione: isPassiva ? 'Fattura Fornitore' : 'Fattura Cliente',
      conto_costo_ricavo: rows[0]?.conto || rows[0]?.descrizione || '',
      conto_costo_ricavo_codice: '',
      causale_iva_codice: '',
      causale_iva_descrizione: '',
    },
    is_transitorio: false,
    motivo_transitorio: null,
    confidence: acc.confidence ?? 0.5,
    note: 'Motore: runAiAccounting (pipeline)',
    righe_prima_nota: rows.map((r) => ({
      descrizione: r.descrizione || r.conto || 'Riga',
      conto_tipo: 'suggerito',
      dare: r.dare ?? 0,
      avere: r.avere ?? 0,
      conto: r.conto,
    })),
    engine: 'runAiAccounting',
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const {
      fileBase64,
      filename,
      mimeType,
      tipoFattura,
      regoleAutomatiche,
      memoryPartitaIva,
      memoryFornitoreNome,
      aiMode: aiModeBody,
    } = req.body

    if (!fileBase64) {
      return res.status(400).json({ error: 'File mancante' })
    }

    const aiMode = aiModeBody === 'online' ? 'online' : 'local'

    const isXML =
      (mimeType || '').includes('xml') || (filename || '').toLowerCase().endsWith('.xml')
    const isPDF =
      (mimeType || '') === 'application/pdf' || (filename || '').toLowerCase().endsWith('.pdf')

    const buf = Buffer.from(fileBase64, 'base64')

    let xmlText = ''
    let textContent = ''
    let textFromPdf = ''
    let layoutTextForHash = ''
    let fullTextForPiva = ''

    if (isXML) {
      xmlText = buf.toString('utf-8')
      layoutTextForHash = xmlText.substring(0, 15000)
      fullTextForPiva = xmlText
    } else if (isPDF) {
      textFromPdf = await extractPdfTextForProposta(buf)
      layoutTextForHash = textFromPdf ? textFromPdf.substring(0, 15000) : ''
      fullTextForPiva = textFromPdf
    } else {
      try {
        textContent = buf.toString('utf-8')
        layoutTextForHash = textContent.substring(0, 10000)
        fullTextForPiva = textContent
      } catch {
        /* ignore */
      }
    }

    let partitaHint =
      memoryPartitaIva != null && String(memoryPartitaIva).trim() !== ''
        ? String(memoryPartitaIva).trim().replace(/^IT/i, '').replace(/\s/g, '')
        : null
    let nomeHint =
      memoryFornitoreNome != null && String(memoryFornitoreNome).trim() !== ''
        ? String(memoryFornitoreNome).trim()
        : null
    if (!partitaHint && fullTextForPiva) {
      partitaHint = extractPivaHintFromText(fullTextForPiva)
    }

    let db = null
    try {
      db = await getSupabaseAdmin()
    } catch (e) {
      console.warn('PROPOSTA_CONTABILE_DB', e?.message || String(e))
    }

    let fiscalKnowledge = ''
    let fiscalRowsCount = 0
    let fiscalKnowledgeOk = false
    if (db) {
      try {
        const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
        fiscalKnowledgeOk = Boolean(fk.ok)
        fiscalRowsCount = Array.isArray(fk.rows) ? fk.rows.length : 0
        fiscalKnowledge = promptBodyFromFiscalRows(fk.rows || [])
      } catch (e) {
        console.warn('PROPOSTA_CONTABILE_KNOWLEDGE_ERROR', e?.message || String(e))
        fiscalKnowledge = promptBodyFromFiscalRows([])
      }
    } else {
      fiscalKnowledge = promptBodyFromFiscalRows([])
    }

    console.log('PROPOSTA_CONTABILE_KNOWLEDGE_ATTACHED', {
      rows: fiscalRowsCount,
      chars: fiscalKnowledge.length,
      db_ok: fiscalKnowledgeOk,
    })

    let memoryBlock = ''
    let memoryMatchCount = 0
    if (db) {
      try {
        const memCtx = await fetchAiMemoryContextForAccounting({
          db,
          documentId: null,
          parsingJson: null,
          layoutTextForHash: layoutTextForHash || null,
          partitaIvaHint: partitaHint,
          fornitoreNomeHint: nomeHint,
          maxChars: AI_MEMORY_PROMPT_MAX_CHARS,
          log: undefined,
        })
        memoryBlock = memCtx.block || ''
        memoryMatchCount = memCtx.matchCount ?? 0
        console.log('PROPOSTA_CONTABILE_MEMORY_ATTACHED', {
          match_count: memoryMatchCount,
          chars: memoryBlock.length,
          max_chars: AI_MEMORY_PROMPT_MAX_CHARS,
          layout_hash_source: layoutTextForHash ? 'document_text' : 'none',
        })
      } catch (e) {
        console.warn('PROPOSTA_CONTABILE_MEMORY_ERROR', e?.message || String(e))
      }
    }

    const parsingJson = buildParsingJsonForProposta({
      isXML,
      xmlText,
      textContent,
      textFromPdf,
      filename,
      tipoFattura,
    })

    console.log('PROPOSTA_CONTABILE_USING_PIPELINE_ENGINE', {
      aiMode,
      memory_chars: memoryBlock.length,
      fiscal_chars: fiscalKnowledge.length,
    })

    const acc = await runAiAccounting({
      documentId: null,
      parsingJson,
      fiscalKnowledge,
      memory: memoryBlock || undefined,
      aiMode,
      persist: false,
      deps: {
        db: db || undefined,
        log: (event, payload) => {
          if (String(event).includes('ERROR')) {
            console.warn(event, payload)
          }
        },
      },
    })

    let analysis = mapEngineToLegacyAnalysis({
      acc,
      parsingJson,
      tipoFattura,
      rawText: acc.rawText || '',
    })

    const rawResponse = acc.rawText || JSON.stringify({ ok: acc.ok, error: acc.error })

    if (regoleAutomatiche && regoleAutomatiche.length > 0 && analysis) {
      for (const regola of regoleAutomatiche.sort((a, b) => a.priorita - b.priorita)) {
        let match = true
        const cond = regola.condizioni

        if (cond.fornitore_piva && analysis.cedente?.partita_iva !== cond.fornitore_piva) match = false
        if (cond.cliente_piva && analysis.cessionario?.partita_iva !== cond.cliente_piva) match = false
        if (cond.descrizione_contiene) {
          const desc = (analysis.note || '').toLowerCase()
          if (!desc.includes(cond.descrizione_contiene.toLowerCase())) match = false
        }

        if (match && regola.azioni && analysis.proposta_contabile) {
          if (regola.azioni.conto_codice) {
            analysis.proposta_contabile.conto_costo_ricavo_codice = regola.azioni.conto_codice
            analysis.is_transitorio = false
          }
          if (regola.azioni.causale_iva) {
            analysis.proposta_contabile.causale_iva_codice = regola.azioni.causale_iva
          }
          analysis.regola_applicata = regola.nome
          break
        }
      }
    }

    if (analysis && !analysis.is_transitorio && (!analysis.righe_prima_nota || !analysis.righe_prima_nota.length)) {
      const isPassiva = analysis.tipo_fattura === 'fattura_passiva'
      analysis.righe_prima_nota = [
        {
          descrizione: isPassiva ? 'Costo/Acquisto' : 'Ricavo/Vendita',
          conto_tipo: isPassiva ? 'costo' : 'ricavo',
          dare: isPassiva ? analysis.imponibile : 0,
          avere: isPassiva ? 0 : analysis.imponibile,
        },
        {
          descrizione: isPassiva ? 'IVA a credito' : 'IVA a debito',
          conto_tipo: 'iva',
          dare: isPassiva ? analysis.iva : 0,
          avere: isPassiva ? 0 : analysis.iva,
        },
        {
          descrizione: isPassiva ? 'Fornitore' : 'Cliente',
          conto_tipo: isPassiva ? 'fornitore' : 'cliente',
          dare: isPassiva ? 0 : analysis.totale,
          avere: isPassiva ? analysis.totale : 0,
        },
      ]
    }

    return res.status(200).json({
      success: true,
      analysis,
      raw_response: rawResponse,
    })
  } catch (error) {
    console.error('Error:', error)
    return res.status(500).json({ error: 'Errore interno', message: error.message })
  }
}
