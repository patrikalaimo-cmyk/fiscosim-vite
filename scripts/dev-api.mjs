/**
 * Minimal local API server for Vite dev proxy.
 *
 * Why:
 * - Vite frontend runs on :5173.
 * - Vite proxy forwards /api/* to :3001 (see vite.config.js).
 * - If you don't run `vercel dev`, you'll otherwise get proxy 500/empty responses.
 *
 * Run:
 * - node scripts/dev-api.mjs
 * - npm run dev:api
 *
 * Carica sempre `.env` dalla root del repo (non dipende dalla cwd), così
 * SUPABASE_* sono disponibili anche se lanci `node` da un'altra cartella.
 */

import dotenv from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import { runFullPipeline } from '../services/pipelineService.js'
import { saveOperatorCorrectionsMemory } from '../services/operatorCorrectionsMemoryService.js'
import { callLocalAI } from '../lib/ollama.js'
import { runPrimaNotaBulkUpdate } from '../services/primaNotaBulkUpdateService.js'
import { getSupabaseAdmin } from '../lib/db.js'
import { runAutoValidateOnAccountingEntries } from '../services/autoValidateAccountingEngine.js'
import { recordAiAccountingFeedback, recordAiAccountingFeedbackBatch } from '../services/aiAccountingFeedbackService.js'
import { propostaContabileHandler } from '../services/api/accounting/proposta-contabile.js'
import { copilotAccountingHandler } from '../services/api/accounting/copilot-accounting.js'
import { runProactiveInsightEngine } from '../services/proactiveInsightEngine.js'
import { runTestScenario } from '../services/testScenarioEngine.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const PORT = parseInt(process.env.PORT || '3001', 10)

if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
  console.warn(
    '[dev-api] SUPABASE_URL / VITE_SUPABASE_URL non impostati in .env — le route /api che usano il DB falliranno.'
  )
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let buf = ''
    req.on('data', (c) => { buf += c })
    req.on('end', () => {
      if (!buf) return resolve({})
      try { resolve(JSON.parse(buf)) } catch (e) { reject(e) }
    })
  })
}

function send(res, status, obj) {
  const body = JSON.stringify(obj)
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.end(body)
}

function pathnameOnly(url) {
  try {
    return new URL(url, 'http://127.0.0.1').pathname
  } catch {
    return url?.split('?')[0] || ''
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 200, { ok: true })

    const path = pathnameOnly(req.url)

    // Browser su http://localhost:3001/ → nessuna pagina HTML: solo API (il frontend è su Vite :5173)
    if (path === '/' && (req.method === 'GET' || req.method === 'HEAD')) {
      const info = {
        service: 'fiscosim-dev-api',
        message:
          'Questo è solo il backend API. Apri il frontend su http://localhost:5173 (npm run dev). Le chiamate /api/* dal browser passano dal proxy Vite a questa porta.',
        postEndpoints: [
          '/api/document',
          '/api/process-document',
          '/api/save-operator-corrections',
          '/api/ai',
          '/api/claude',
          '/api/ollama-analyze',
          '/api/prima-nota/bulk-update',
          '/prima-nota/bulk-update',
          '/api/accounting/auto-validate',
          '/api/accounting/feedback',
          '/api/accounting/feedback-batch',
          '/api/accounting/ai',
          '/api/insights/run',
          '/api/test-scenario/run',
        ],
      }
      if (req.method === 'HEAD') {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end()
        return
      }
      return send(res, 200, info)
    }

    if (path === '/api/ai' && req.method === 'POST') {
      const body = await readJson(req)
      const actionRaw = typeof body?.action === 'string' ? body.action : ''
      const action =
        actionRaw.trim().toLowerCase()
        || (typeof body?.message === 'string' ? 'chat' : '')
        || (typeof body?.prompt === 'string' ? 'ollama_analyze' : '')
        || (Array.isArray(body?.messages) ? 'claude' : '')
        || 'chat'

      if (action === 'ollama_analyze') {
        const prompt = String(body?.prompt || '')
        if (!prompt) return send(res, 400, { error: 'prompt mancante' })
        try {
          const response = await callLocalAI(prompt, { model: body?.model })
          return send(res, 200, { response })
        } catch (e) {
          console.error('[dev-api] /api/ai ollama_analyze', e)
          const base = e?.message || String(e)
          const hint =
            /ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(base)
              ? ` Ollama non raggiungibile. Avvia il servizio (terminale: ollama serve) e verifica il modello: ollama pull mistral. URL: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`
              : ''
          return send(res, 502, { error: base + hint })
        }
      }

      if (action === 'claude' || action === 'test_claude') {
        const apiKey = process.env.ANTHROPIC_API_KEY
        if (!apiKey) {
          console.warn('[dev-api] /api/ai: ANTHROPIC_API_KEY mancante nel .env')
          return send(res, 503, {
            error:
              'ANTHROPIC_API_KEY non configurata. Aggiungila al file .env nella root del progetto e riavvia dev-api (Import unificato PDF con AI usa Claude).',
          })
        }

        const payload =
          action === 'test_claude'
            ? {
                model: 'claude-haiku-4-5-20251001',
                max_tokens: 50,
                messages: [{ role: 'user', content: 'Rispondi solo: OK' }],
              }
            : (() => {
                const { action: _a, ...rest } = body || {}
                return rest
              })()

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(payload),
        })

        const data = await response.json().catch(() => ({}))
        if (!response.ok) {
          console.error('[dev-api] /api/ai anthropic error', response.status, data)
          return send(res, response.status >= 400 && response.status < 600 ? response.status : 502, {
            error: data.error?.message || 'Errore API Anthropic',
            detail: data,
          })
        }

        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.setHeader('Access-Control-Allow-Origin', '*')
        res.end(JSON.stringify(data))
        return
      }

      // chat (OpenAI): best effort
      try {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) return send(res, 500, { error: 'OPENAI_API_KEY non configurata sul server (dev-api)' })
        const message = body?.message
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-3.5-turbo',
            messages: [
              { role: 'system', content: `Sei l'assistente di FiscoSim. Rispondi in modo operativo e concreto.` },
              { role: 'user', content: message },
            ],
          }),
        })
        if (!response.ok) {
          const text = await response.text().catch(() => '')
          return send(res, 200, { reply: text || `HTTP ${response.status}` })
        }
        const data = await response.json().catch(() => ({}))
        const content = data.choices?.[0]?.message?.content
        return send(res, 200, { reply: typeof content === 'string' ? content : 'Nessuna risposta' })
      } catch (e) {
        console.error('[dev-api] /api/ai chat', e)
        return send(res, 200, { reply: 'Errore interno AI' })
      }
    }

    if (path === '/api/document' && req.method === 'POST') {
      const body = await readJson(req)
      const actionRaw = typeof body?.action === 'string' ? body.action : ''
      const action =
        actionRaw.trim().toLowerCase()
        || (body?.documentId ? 'process' : '')
        || (typeof body?.tipo === 'string' ? 'parse_contabilita_pdf' : '')
        || (body?.pdfBase64 ? 'split_cu' : '')
        || (body?.fileBase64 ? 'analyze' : '')
        || 'analyze'

      if (action !== 'process') {
        return send(res, 501, { error: 'dev-api: action non supportata su /api/document', action })
      }

      const documentId = body?.documentId
      if (!documentId) return send(res, 400, { error: 'documentId mancante' })
      const aiMode = body?.aiMode === 'online' ? 'online' : 'local'
      const aiPreprocessMode = body?.aiPreprocessMode === 'off' ? 'off' : 'on'

      console.log('AUTO_PIPELINE_TRIGGERED', { documentId, via: 'dev-api', aiMode, aiPreprocessMode })
      console.log('[dev-api] /api/document', { documentId, aiMode, aiPreprocessMode })
      const r = await runFullPipeline(documentId, { aiMode, aiPreprocessMode })
      if (!r.ok) {
        return send(res, 500, {
          error: r.error || 'Pipeline error',
          step: r.step || null,
          pipeline_run_id: r.pipeline_run_id ?? null,
          pipeline_trace: r.pipeline_trace ?? null,
        })
      }
      return send(res, 200, {
        status: 'ok',
        documentId,
        pipeline_run_id: r.pipeline_run_id ?? null,
        pipeline_trace: r.pipeline_trace ?? null,
      })
    }

    if (path === '/api/ollama-analyze' && req.method === 'POST') {
      const body = await readJson(req)
      const prompt = String(body?.prompt || '')
      if (!prompt) return send(res, 400, { error: 'prompt mancante' })
      try {
        const response = await callLocalAI(prompt, { model: body?.model })
        return send(res, 200, { response })
      } catch (e) {
        console.error('[dev-api] /api/ollama-analyze', e)
        const base = e?.message || String(e)
        const hint =
          /ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(base)
            ? ` Ollama non raggiungibile. Avvia il servizio (terminale: ollama serve) e verifica il modello: ollama pull mistral. URL: ${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}`
            : ''
        return send(res, 502, { error: base + hint })
      }
    }

    if (path === '/api/claude' && req.method === 'POST') {
      const body = await readJson(req)
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        console.warn('[dev-api] /api/claude: ANTHROPIC_API_KEY mancante nel .env')
        return send(res, 503, {
          error:
            'ANTHROPIC_API_KEY non configurata. Aggiungila al file .env nella root del progetto e riavvia dev-api (Import unificato PDF con AI usa Claude).',
        })
      }

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok) {
        console.error('[dev-api] /api/claude anthropic error', response.status, data)
        return send(res, response.status >= 400 && response.status < 600 ? response.status : 502, {
          error: data.error?.message || 'Errore API Anthropic',
          detail: data,
        })
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.end(JSON.stringify(data))
      return
    }

    if (
      (path === '/api/prima-nota/bulk-update' || path === '/prima-nota/bulk-update') &&
      req.method === 'POST'
    ) {
      const body = await readJson(req)
      try {
        const out = await runPrimaNotaBulkUpdate(body)
        if (!out.ok) return send(res, out.status || 500, { error: out.error })
        const { ok: _o, status: _s, ...rest } = out
        return send(res, out.status || 200, rest)
      } catch (e) {
        console.error('[dev-api] prima-nota/bulk-update', e)
        return send(res, 500, { error: e?.message || String(e) })
      }
    }

    if (path === '/api/accounting/auto-validate' && req.method === 'POST') {
      const body = await readJson(req)
      const entryIds = Array.isArray(body?.entryIds) ? body.entryIds : null
      const documentIds = Array.isArray(body?.documentIds) ? body.documentIds : null
      if ((!entryIds || !entryIds.length) && (!documentIds || !documentIds.length)) {
        return send(res, 400, { error: 'entryIds o documentIds (array) richiesto' })
      }
      try {
        const db = await getSupabaseAdmin()
        const out = await runAutoValidateOnAccountingEntries(db, { entryIds, documentIds })
        if (!out.ok) return send(res, 400, { error: out.error })
        return send(res, 200, {
          ok: true,
          entries: out.entries.map((e) => ({
            id: e.id,
            document_id: e.document_id,
            status: e.status,
            ai_confidence: e.ai_confidence,
            ai_status: e.ai_status,
            ai_source: e.ai_source,
            ai_explanation: e.ai_explanation,
            auto_validate_meta: e.auto_validate_meta,
            data: e.data,
            created_at: e.created_at,
          })),
        })
      } catch (e) {
        console.error('[dev-api] accounting/auto-validate', e)
        return send(res, 500, { error: e?.message || String(e) })
      }
    }

    if (path === '/api/accounting/feedback' && req.method === 'POST') {
      const body = await readJson(req)
      const documentId = body?.documentId
      if (!documentId) return send(res, 400, { error: 'documentId richiesto' })
      try {
        const db = await getSupabaseAdmin()
        const out = await recordAiAccountingFeedback(db, {
          documentId,
          finalContoId: body.finalContoId,
          primaNotaRigaId: body.primaNotaRigaId ?? null,
        })
        if (!out.ok) return send(res, 400, { error: out.error })
        return send(res, 200, out)
      } catch (e) {
        console.error('[dev-api] accounting/feedback', e)
        return send(res, 500, { error: e?.message || String(e) })
      }
    }

    if (path === '/api/accounting/feedback-batch' && req.method === 'POST') {
      const body = await readJson(req)
      const documentIds = Array.isArray(body?.documentIds) ? body.documentIds.filter(Boolean) : []
      if (!documentIds.length) return send(res, 400, { error: 'documentIds (array) richiesto' })
      try {
        const db = await getSupabaseAdmin()
        const out = await recordAiAccountingFeedbackBatch(db, documentIds)
        return send(res, 200, out)
      } catch (e) {
        console.error('[dev-api] accounting/feedback-batch', e)
        return send(res, 500, { error: e?.message || String(e) })
      }
    }

    if (path === '/api/insights/run' && req.method === 'POST') {
      const body = await readJson(req)
      const societaId = body?.societaId
      if (!societaId) return send(res, 400, { error: 'societaId richiesto' })
      try {
        const db = await getSupabaseAdmin()
        const out = await runProactiveInsightEngine(db, {
          societaId,
          log: (e, p) => console.log(`[dev-api] insights ${e}`, p || ''),
        })
        if (!out.ok) return send(res, 500, { error: 'Persistenza insight fallita', ...out })
        return send(res, 200, out)
      } catch (e) {
        console.error('[dev-api] /api/insights/run', e)
        return send(res, 500, { error: e?.message || String(e) })
      }
    }

    if (path === '/api/accounting/ai' && req.method === 'POST') {
      const body = await readJson(req)
      const actionRaw = typeof body?.action === 'string' ? body.action : ''
      const action =
        actionRaw.trim().toLowerCase()
        || (Array.isArray(body?.messages) ? 'copilot_turn' : '')
        || 'proposta_contabile'

      if (action === 'copilot_turn' && !process.env.ANTHROPIC_API_KEY) {
        return send(res, 503, {
          error:
            'ANTHROPIC_API_KEY non configurata. Aggiungila al .env e riavvia dev-api per usare il Copilot contabile.',
        })
      }

      try {
        const handlerFn = action === 'copilot_turn' ? copilotAccountingHandler : propostaContabileHandler
        const out = await handlerFn({ body })
        return send(res, out.status, out.json)
      } catch (e) {
        console.error('[dev-api] /api/accounting/ai', e)
        return send(res, 500, { error: e?.message || String(e) })
      }
    }

    if (path === '/api/process-document' && req.method === 'POST') {
      const body = await readJson(req)
      const documentId = body?.documentId
      if (!documentId) return send(res, 400, { error: 'documentId mancante' })
      const aiMode = body?.aiMode === 'online' ? 'online' : 'local'
      const aiPreprocessMode = body?.aiPreprocessMode === 'off' ? 'off' : 'on'

      console.log('AUTO_PIPELINE_TRIGGERED', { documentId, via: 'dev-api', aiMode, aiPreprocessMode })
      console.log('[dev-api] /api/process-document', { documentId, aiMode, aiPreprocessMode })
      const r = await runFullPipeline(documentId, { aiMode, aiPreprocessMode })
      if (!r.ok) {
        return send(res, 500, {
          error: r.error || 'Pipeline error',
          step: r.step || null,
          pipeline_run_id: r.pipeline_run_id ?? null,
          pipeline_trace: r.pipeline_trace ?? null,
        })
      }
      return send(res, 200, {
        status: 'ok',
        documentId,
        pipeline_run_id: r.pipeline_run_id ?? null,
        pipeline_trace: r.pipeline_trace ?? null,
      })
    }

    if (path === '/api/test-scenario/run' && req.method === 'POST') {
      try {
        const body = await readJson(req)
        const scenarioId = body?.scenarioId
        const societaId = body?.societaId
        const xmlText = body?.xmlText != null ? String(body.xmlText) : ''
        const filename = body?.filename || 'fattura.xml'
        const pipelineOptions = body?.pipelineOptions && typeof body.pipelineOptions === 'object' ? body.pipelineOptions : {}
        let xmlBatch = undefined
        if (Array.isArray(body?.xmlBatch)) {
          xmlBatch = body.xmlBatch.map((x) => ({
            xmlText: x?.xmlText != null ? String(x.xmlText) : '',
            filename: x?.filename || 'fattura.xml',
          }))
        }
        if (!scenarioId) return send(res, 400, { error: 'scenarioId richiesto' })
        if (!societaId) return send(res, 400, { error: 'societaId richiesto' })
        let db
        try {
          db = await getSupabaseAdmin()
        } catch (envErr) {
          console.error('[dev-api] getSupabaseAdmin', envErr)
          return send(res, 503, {
            error: envErr?.message || String(envErr),
            hint: 'Imposta SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (o le variabili VITE_* equivalenti) nel file .env nella root del progetto, poi riavvia npm run dev:api',
            pass: false,
          })
        }
        const out = await runTestScenario(scenarioId, {
          db,
          societaId,
          xmlText,
          filename,
          xmlBatch,
          pipelineOptions,
          onStep: (e, p) => console.log(`[test-scenario] ${e}`, p || ''),
        })
        return send(res, 200, out)
      } catch (e) {
        console.error('[dev-api] /api/test-scenario/run', e)
        return send(res, 500, {
          error: e?.message || String(e),
          hint: 'Controlla il terminale dove gira dev-api. Spesso: JSON body non valido, errore Supabase o scenario.',
          pass: false,
        })
      }
    }

    if (path === '/api/save-operator-corrections' && req.method === 'POST') {
      const body = await readJson(req)
      const documentId = body?.documentId
      const parsingAfter = body?.parsingAfter
      const accountingAfter = body?.accountingAfter ?? {}
      if (!documentId) return send(res, 400, { error: 'documentId mancante' })
      if (!parsingAfter || typeof parsingAfter !== 'object') {
        return send(res, 400, { error: 'parsingAfter mancante o non valido' })
      }
      const result = await saveOperatorCorrectionsMemory({
        documentId,
        parsingAfter,
        accountingAfter,
        deps: { log: (e, p) => console.log(e, p) },
      })
      return send(res, 200, result)
    }

    return send(res, 404, { error: 'Not found', path })
  } catch (e) {
    console.error('[dev-api] error', e)
    return send(res, 500, { error: e?.message || String(e) })
  }
})

server.on('error', (err) => {
  if (err?.code === 'EADDRINUSE') {
    console.error(
      `[dev-api] Porta ${PORT} già in uso (probabilmente un'altra istanza di dev-api).\n` +
        `  • Chiudi quella finestra/terminale, oppure termina il processo:\n` +
        `    netstat -ano | findstr :${PORT}\n` +
        `    taskkill /PID <PID> /F\n` +
        `  • Oppure usa un'altra porta (ricorda di allineare vite.config.js → server.proxy['/api'].target):\n` +
        `    set PORT=3002&& node scripts/dev-api.mjs`
    )
    process.exit(1)
  }
  throw err
})

server.listen(PORT, () => {
  console.log(`[dev-api] listening on http://localhost:${PORT}`)
})
