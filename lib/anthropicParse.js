/**
 * Chiamate Anthropic Messages da Node (aiParsingService).
 * Richiede ANTHROPIC_API_KEY in ambiente (stesso pattern di api/claude.js).
 */

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

function mustKey() {
  const k = process.env.ANTHROPIC_API_KEY
  if (!k) throw new Error('ANTHROPIC_API_KEY non configurata')
  return k
}

/**
 * Parsing documento da testo già composto (stesso payload che riceve Ollama).
 *
 * @param {{ userPrompt: string, log?: (e: string, p?: any) => void, documentId?: string | null }} p
 * @returns {Promise<string>} testo grezzo modello (JSON atteso)
 */
export async function callClaudeTextForParsing({ userPrompt, log, documentId }) {
  const key = mustKey()
  const text = String(userPrompt || '').slice(0, 200000)
  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system:
      'Sei un esperto contabile e fiscale italiano. Rispondi SOLO con JSON valido, senza testo prima o dopo, secondo lo schema richiesto nel messaggio utente.',
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    log?.('AI_PARSING_ONLINE_HTTP', { documentId, status: res.status, message: msg })
    throw new Error(msg)
  }

  const out = data?.content?.[0]?.text
  if (typeof out !== 'string') throw new Error('Risposta Claude senza testo')
  return out
}

/**
 * Scrittura contabile (partita doppia) da prompt utente; risposta solo JSON.
 *
 * @param {{ userPrompt: string, log?: (e: string, p?: any) => void, documentId?: string | null }} p
 * @returns {Promise<string>}
 */
export async function callClaudeTextForAccounting({ userPrompt, log, documentId }) {
  const key = mustKey()
  const text = String(userPrompt || '').slice(0, 200000)
  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 8192,
    system:
      'Sei un commercialista esperto italiano. Rispondi SOLO con JSON valido, senza testo prima o dopo, con chiavi rows (array di oggetti con conto, descrizione, dare, avere), totale (numero), confidence (numero 0–1, affidabilità della proposta). Nessun markdown.',
    messages: [{ role: 'user', content: [{ type: 'text', text }] }],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    log?.('AI_ACCOUNTING_ONLINE_HTTP', { documentId, status: res.status, message: msg })
    throw new Error(msg)
  }

  const out = data?.content?.[0]?.text
  if (typeof out !== 'string') throw new Error('Risposta Claude accounting senza testo')
  return out
}

/**
 * Copilot contabile: risposta JSON (answer, reasoning, actions).
 *
 * @param {{ systemPrompt: string, userPrompt: string, log?: function, documentId?: string | null, maxTokens?: number }} p
 * @returns {Promise<string>}
 */
export async function callClaudeCopilotAccounting({
  systemPrompt,
  userPrompt,
  log,
  documentId,
  maxTokens = 8192,
}) {
  const key = mustKey()
  const body = {
    model: DEFAULT_MODEL,
    max_tokens: maxTokens,
    system: String(systemPrompt || '').slice(0, 14000),
    messages: [{ role: 'user', content: [{ type: 'text', text: String(userPrompt || '').slice(0, 190000) }] }],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    log?.('COPILOT_ACCOUNTING_HTTP', { documentId, status: res.status, message: msg })
    throw new Error(msg)
  }

  const out = data?.content?.[0]?.text
  if (typeof out !== 'string') throw new Error('Risposta Copilot senza testo')
  return out
}

const MAX_COPILOT_TOOL_ROUNDS = 8

function contentBlocksToText(content) {
  if (!content) return ''
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

function extractToolUses(content) {
  if (!Array.isArray(content)) return []
  return content.filter((b) => b && b.type === 'tool_use' && b.name && b.id)
}

/**
 * Copilot con tool Anthropic: loop tool_use → tool_result fino a risposta testuale finale.
 *
 * @param {{
 *   systemPrompt: string,
 *   messages: Array<{ role: 'user' | 'assistant', content: unknown }>,
 *   tools: Array<{ name: string, description?: string, input_schema: object }>,
 *   executeTool: (name: string, input: object) => Promise<unknown>,
 *   log?: (e: string, p?: unknown) => void,
 *   documentId?: string | null,
 *   maxTokens?: number,
 * }} p
 * @returns {Promise<{ rawText: string, rounds: number, stopReason?: string }>}
 */
export async function callClaudeCopilotAccountingWithTools({
  systemPrompt,
  messages,
  tools,
  executeTool,
  log,
  documentId,
  maxTokens = 8192,
}) {
  const key = mustKey()
  const apiMessages = Array.isArray(messages) ? messages.map((m) => ({ role: m.role, content: m.content })) : []

  for (let round = 0; round < MAX_COPILOT_TOOL_ROUNDS; round++) {
    const body = {
      model: DEFAULT_MODEL,
      max_tokens: maxTokens,
      system: String(systemPrompt || '').slice(0, 14000),
      tools,
      messages: apiMessages,
    }

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
      log?.('COPILOT_TOOLS_HTTP', { documentId, round, status: res.status, message: msg })
      throw new Error(msg)
    }

    const content = data?.content
    log?.('COPILOT_TOOLS_ROUND', { documentId, round, stop_reason: data?.stop_reason })

    const toolUses = extractToolUses(content)
    const textOut = contentBlocksToText(content)

    if (!toolUses.length) {
      if (!textOut) throw new Error('Risposta Copilot senza testo né tool')
      return { rawText: textOut, rounds: round + 1, stopReason: data?.stop_reason }
    }

    apiMessages.push({ role: 'assistant', content })

    const toolResults = []
    for (const tu of toolUses) {
      let payload
      try {
        payload = await executeTool(tu.name, tu.input && typeof tu.input === 'object' ? tu.input : {})
      } catch (e) {
        payload = { error: e?.message || String(e) }
      }
      let contentStr
      try {
        contentStr = typeof payload === 'string' ? payload : JSON.stringify(payload)
      } catch {
        contentStr = '{"error":"serialize_tool_result"}'
      }
      if (contentStr.length > 120000) {
        contentStr = `${contentStr.slice(0, 119000)}…[truncated]`
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: contentStr,
      })
    }

    apiMessages.push({ role: 'user', content: toolResults })
  }

  throw new Error('Copilot: troppi turni tool (limite sicurezza)')
}

/**
 * Vision: un’immagine in base64 (JPEG/PNG/GIF/WebP).
 *
 * @param {{
 *   systemPrompt: string,
 * userText: string,
 * base64Data: string,
 * mediaType: string,
 * log?: (e: string, p?: any) => void,
 * documentId?: string | null,
 * }} p
 * @returns {Promise<string>}
 */
function stripDataUrl(b64) {
  const s = String(b64 || '')
  const i = s.indexOf('base64,')
  return i >= 0 ? s.slice(i + 7).replace(/\s/g, '') : s.replace(/\s/g, '')
}

export async function callClaudeVisionForParsing({
  systemPrompt,
  userText,
  base64Data,
  mediaType,
  log,
  documentId,
}) {
  const key = mustKey()
  const mt = String(mediaType || 'image/jpeg')
  const cleanB64 = stripDataUrl(base64Data)
  const body = {
    model: DEFAULT_MODEL,
    max_tokens: 4096,
    system: String(systemPrompt || '').slice(0, 12000),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mt, data: cleanB64 } },
          { type: 'text', text: String(userText || '').slice(0, 12000) },
        ],
      },
    ],
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = data?.error?.message || data?.error || `HTTP ${res.status}`
    log?.('AI_PARSING_ONLINE_HTTP', { documentId, status: res.status, phase: 'vision', message: msg })
    throw new Error(msg)
  }

  const out = data?.content?.[0]?.text
  if (typeof out !== 'string') throw new Error('Risposta Claude vision senza testo')
  return out
}
