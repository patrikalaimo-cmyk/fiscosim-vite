import { aiChatHandler } from '../services/api/ai/chat.js'
import { claudeHandler } from '../services/api/ai/claude.js'
import { ollamaAnalyzeHandler } from '../services/api/ai/ollama.js'
import { testClaudeHandler } from '../services/api/ai/test-claude.js'

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 120,
}

const handlers = {
  chat: aiChatHandler,
  claude: claudeHandler,
  ollama_analyze: ollamaAnalyzeHandler,
  test_claude: testClaudeHandler,
}

function inferAction(body) {
  if (!body || typeof body !== 'object') return 'chat'
  if (typeof body.message === 'string') return 'chat'
  if (typeof body.prompt === 'string') return 'ollama_analyze'
  // Claude "legacy": tipicamente { model, max_tokens, messages: [...] }
  if (Array.isArray(body.messages) && (body.model != null || body.max_tokens != null)) return 'claude'
  return 'chat'
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
    const actionRaw = typeof body.action === 'string' ? body.action : ''
    const action = actionRaw.trim().toLowerCase() || inferAction(body)

    const handlerFn = handlers[action] || handlers.chat
    const result = await handlerFn({ body })
    return res.status(result.status).json(result.json)
  } catch (e) {
    console.error('[api/ai]', e)
    return res.status(500).json({ error: e?.message || String(e) })
  }
}

