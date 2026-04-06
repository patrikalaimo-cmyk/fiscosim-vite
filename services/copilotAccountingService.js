/**
 * Copilot Contabile: contesto strutturato + chiamata LLM (JSON answer / reasoning / actions).
 */

import { callClaudeCopilotAccountingWithTools } from '../lib/anthropicParse.js'
import {
  COPILOT_ACCOUNTING_ANTHROPIC_TOOLS,
  executeCopilotAccountingTool,
} from './copilotAccountingTools.js'
import {
  getFiscalKnowledge,
  formatFiscalKnowledgeForPrompt,
  FISCAL_CATEGORIES_ACCOUNTING,
} from '../lib/fiscalKnowledge.js'
import { findAnagraficaConto, normPiva } from './autoValidateAccountingEngine.js'

const COPILOT_SYSTEM_PROMPT = `Sei il Copilot Contabile di FiscoSim. Il tuo dominio è ESCLUSIVAMENTE: contabilità d’impresa italiana, principi contabili nazionali, IVA e adempimenti fiscali collegati al ciclo passivo/attivo.

STRUMENTI (tool):
Hai accesso a tool lato server. Per fatti su scritture contabili (accounting_entries), movimenti partitario, saldi per conto, dettaglio prima nota o aggiornamenti consentiti alle scritture DEVI usare il tool appropriato quando la domanda lo richiede. I JSON restituiti dai tool sono FONTE DI VERITÀ: hanno sempre priorità sul contesto statico del messaggio e sulla memoria; non contraddirli e non inventare importi, stati, ID o saldi diversi da quelli nei tool. Se un tool segnala errore o dati vuoti, dichiaralo esplicitamente nell’answer e nel reasoning.

REGOLE OBBLIGATORIE:
1) Non dare risposte generiche, da assistente generico o fuori ambito contabile/fiscale. Se la domanda non è pertinente, rispondi in italiano spiegando che operi solo in ambito contabile/fiscale e riproponi un angolo utile.
2) Combina contesto strutturato (documento, scrittura, storico, ai_learning, fiscal_knowledge) con i dati dei tool quando li usi. Se un dato manca ovunque, dichiaralo; non supporre valori numerici o stati senza tool o contesto.
3) Nel reasoning, quando usi tool, cita sinteticamente cosa hanno restituito (es. numero righe, campi chiave).

FORMATO OUTPUT FINALE: dopo eventuali chiamate tool, rispondi SOLO con un oggetto JSON valido, senza markdown, senza testo prima o dopo. Schema:
{
  "answer": "string — risposta operativa all’utente (italiano)",
  "reasoning": "string — perché, passo-passo, citando contesto/knowledge/tool dove utile",
  "actions": [
    { "id": "string", "label": "string", "type": "suggestion|open_guidata|refresh_auto_validate|none", "payload": {} }
  ]
}
Se non proponi azioni concrete, usa "actions": []. I tipi sono suggerimenti per l’interfaccia; "payload" è opzionale.`

function truncateJson(obj, maxLen) {
  try {
    const s = JSON.stringify(obj)
    if (s.length <= maxLen) return obj
    return { _truncated: true, preview: s.slice(0, maxLen) + '…' }
  } catch {
    return { _error: 'serialize' }
  }
}

function stripJsonFences(s) {
  let t = String(s || '').trim()
  const m = t.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (m) t = m[1].trim()
  return t
}

function normalizeCopilotResponse(obj) {
  const answer = String(obj?.answer ?? '').trim() || 'Nessuna risposta.'
  const reasoning = String(obj?.reasoning ?? '').trim() || '—'
  const raw = Array.isArray(obj?.actions) ? obj.actions : []
  const actions = raw
    .filter((a) => a && typeof a === 'object' && String(a.label || '').trim())
    .map((a) => ({
      id: String(a.id || `act_${Math.random().toString(36).slice(2, 9)}`),
      label: String(a.label).slice(0, 200),
      type: String(a.type || 'suggestion').slice(0, 64),
      payload: a.payload && typeof a.payload === 'object' ? a.payload : {},
    }))
  return { answer, reasoning, actions }
}

function parseCopilotModelOutput(raw) {
  const t = stripJsonFences(raw)
  try {
    return normalizeCopilotResponse(JSON.parse(t))
  } catch {
    return {
      answer: String(raw || '').slice(0, 4000),
      reasoning: 'Il modello non ha restituito JSON valido; sopra il testo grezzo.',
      actions: [],
    }
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} documentId
 * @param {string} societaId
 */
export async function buildAccountingCopilotContext(db, documentId, societaId) {
  if (!db || !documentId || !societaId) return null

  const { data: doc, error: dErr } = await db.from('documenti_contabilita').select('*').eq('id', documentId).maybeSingle()
  if (dErr || !doc) return null
  if (String(doc.societa_id) !== String(societaId)) return null

  const { data: pianoRows } = await db
    .from('piano_conti')
    .select('id,codice,descrizione,partita_iva,anagrafica_piva,is_fornitore,is_cliente,livello')
    .eq('societa_id', societaId)
    .eq('attivo', true)

  const pcFull = pianoRows || []
  const contoLabel = (cid) => {
    if (!cid) return null
    const c = pcFull.find((x) => String(x.id) === String(cid))
    return c ? `${String(c.codice || '').trim()} — ${c.descrizione || ''}`.trim() : String(cid)
  }

  const docSanitized = {
    id: doc.id,
    numero_documento: doc.numero_documento,
    data_documento: doc.data_documento,
    tipo_documento: doc.tipo_documento,
    soggetto_denominazione: doc.soggetto_denominazione,
    soggetto_piva: doc.soggetto_piva,
    totale: doc.totale,
    imponibile: doc.imponibile,
    iva: doc.iva,
    conto_id: doc.conto_id,
    conto_label: contoLabel(doc.conto_id),
    validation_status: doc.validation_status,
    workflow_status: doc.workflow_status,
    causale_iva: doc.causale_iva,
    dati_estratti: truncateJson(doc.dati_estratti, 12000),
  }

  const { data: entRows } = await db
    .from('accounting_entries')
    .select(
      'id,status,data,ai_confidence,ai_status,ai_source,ai_explanation,auto_validate_meta,created_at'
    )
    .eq('document_id', String(documentId))
    .order('created_at', { ascending: false })
    .limit(1)

  const entry = entRows?.[0] || null
  const accountingEntry = entry
    ? {
        id: entry.id,
        status: entry.status,
        ai_confidence: entry.ai_confidence,
        ai_status: entry.ai_status,
        ai_source: entry.ai_source,
        ai_explanation: entry.ai_explanation,
        auto_validate_meta: entry.auto_validate_meta,
        data_preview: truncateJson(entry.data, 14000),
        created_at: entry.created_at,
      }
    : null

  let supplierHistory = []
  if (doc.soggetto_piva) {
    const { data: hist } = await db
      .from('documenti_contabilita')
      .select('id,numero_documento,data_documento,totale,conto_id,validation_status,workflow_status')
      .eq('societa_id', societaId)
      .eq('soggetto_piva', doc.soggetto_piva)
      .order('data_documento', { ascending: false })
      .limit(18)

    supplierHistory = (hist || []).map((r) => ({
      id: r.id,
      numero_documento: r.numero_documento,
      data_documento: r.data_documento,
      totale: r.totale,
      conto_id: r.conto_id,
      conto_label: contoLabel(r.conto_id),
      validation_status: r.validation_status,
      workflow_status: r.workflow_status,
      is_current: String(r.id) === String(documentId),
    }))
  }

  const pivaNorm = normPiva(doc.soggetto_piva)
  const anag = findAnagraficaConto(pcFull, pivaNorm)

  let aiLearningRules = []
  if (anag?.id) {
    const { data: learn } = await db
      .from('ai_learning')
      .select('conto_id,frequenza,confidence_score,ultimo_utilizzo')
      .eq('societa_id', societaId)
      .eq('anagrafica_id', anag.id)
      .order('frequenza', { ascending: false })
      .limit(12)

    aiLearningRules = (learn || []).map((r) => ({
      conto_id: r.conto_id,
      conto_label: contoLabel(r.conto_id),
      frequenza: r.frequenza,
      confidence_score: r.confidence_score,
      ultimo_utilizzo: r.ultimo_utilizzo,
    }))
  }

  const fk = await getFiscalKnowledge(db, FISCAL_CATEGORIES_ACCOUNTING)
  const fiscalKnowledgeText = formatFiscalKnowledgeForPrompt(fk.rows || [], { maxChars: 16000 })

  return {
    current_document: docSanitized,
    accounting_entry: accountingEntry,
    supplier_history: supplierHistory,
    anagrafica_piano: anag
      ? { id: anag.id, codice: anag.codice, descrizione: anag.descrizione, partita_iva: anag.partita_iva || anag.anagrafica_piva }
      : null,
    ai_learning_rules: aiLearningRules,
    fiscal_knowledge: fiscalKnowledgeText || '(nessuna riga attiva nelle categorie contabile/iva/regime/supervisione)',
    meta: {
      societa_id: societaId,
      context_generated_at: new Date().toISOString(),
    },
  }
}

function buildConversationUserPrompt(context, messages) {
  const list = Array.isArray(messages) ? messages : []
  if (!list.length) throw new Error('messages vuoto')

  const lines = []
  for (let i = 0; i < list.length - 1; i++) {
    const m = list[i]
    if (!m || !m.role) continue
    if (m.role === 'user') {
      lines.push(`[UTENTE]: ${String(m.content || '').trim()}`)
    } else if (m.role === 'assistant') {
      const a = String(m.answer || m.content || '').trim()
      const r = String(m.reasoning || '').trim()
      lines.push(`[ASSISTENTE — risposta]: ${a}`)
      if (r) lines.push(`[ASSISTENTE — ragionamento]: ${r}`)
    }
  }

  const last = list[list.length - 1]
  if (!last || last.role !== 'user') throw new Error('Ultimo messaggio deve essere utente')

  return `## CONTESTO STRUTTURATO (JSON — fonte di verità; non contraddirlo)
${JSON.stringify(context, null, 2)}

## DIALOGO PRECEDENTE
${lines.length ? lines.join('\n') : '(nessun turno precedente)'}

## RICHIESTA ATTUALE
${String(last.content || '').trim()}`
}

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   documentId: string,
 *   societaId: string,
 *   messages: Array<{ role: string, content?: string, answer?: string, reasoning?: string }>,
 *   accountingEntryId?: string | null,
 *   log?: function,
 * }} p
 */
export async function runAccountingCopilotTurn({ db, documentId, societaId, messages, accountingEntryId, log }) {
  const context = await buildAccountingCopilotContext(db, documentId, societaId)
  if (!context) {
    return { ok: false, error: 'Documento non trovato o società non coerente' }
  }

  if (accountingEntryId) {
    const { data: fe, error: feErr } = await db
      .from('accounting_entries')
      .select(
        'id,document_id,status,ai_confidence,ai_status,ai_source,ai_explanation,auto_validate_meta,data,created_at'
      )
      .eq('id', accountingEntryId)
      .maybeSingle()
    if (!feErr && fe && String(fe.document_id) === String(documentId)) {
      context.focused_accounting_entry = {
        id: fe.id,
        status: fe.status,
        ai_confidence: fe.ai_confidence,
        ai_status: fe.ai_status,
        ai_source: fe.ai_source,
        ai_explanation: fe.ai_explanation,
        auto_validate_meta: fe.auto_validate_meta,
        data_preview: truncateJson(fe.data, 10000),
        created_at: fe.created_at,
      }
    }
  }

  const userPrompt = buildConversationUserPrompt(context, messages)
  const initialMessages = [
    { role: 'user', content: [{ type: 'text', text: String(userPrompt || '').slice(0, 190000) }] },
  ]

  const toolCtx = { societaId, documentId, log }
  const executeTool = (name, input) => executeCopilotAccountingTool(db, toolCtx, name, input)

  const { rawText, rounds, stopReason } = await callClaudeCopilotAccountingWithTools({
    systemPrompt: COPILOT_SYSTEM_PROMPT,
    messages: initialMessages,
    tools: COPILOT_ACCOUNTING_ANTHROPIC_TOOLS,
    executeTool,
    log,
    documentId,
  })

  const parsed = parseCopilotModelOutput(rawText)
  log?.('COPILOT_ACCOUNTING_DONE', { documentId, answerLen: parsed.answer.length, toolRounds: rounds, stopReason })

  if (process.env.COPILOT_DEBUG === '1') {
    return { ok: true, ...parsed, raw_model: rawText, _meta: { toolRounds: rounds, stopReason } }
  }
  return { ok: true, ...parsed }
}
