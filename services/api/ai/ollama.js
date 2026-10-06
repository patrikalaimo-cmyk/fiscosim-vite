// POST { prompt, model? } -> { response: string }

import { callLocalAI } from '../../../lib/ollama.js'

export async function ollamaAnalyzeHandler({ body }) {
  try {
    const prompt = String(body?.prompt || '')
    if (!prompt) return { status: 400, json: { error: 'prompt mancante' } }

    const text = await callLocalAI(prompt, { model: body?.model })
    return { status: 200, json: { response: text } }
  } catch (e) {
    const base = e?.message || String(e)
    const hint =
      /ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(base)
        ? ` Ollama non raggiungibile. Avvia ollama serve e: ollama pull mistral`
        : ''
    return { status: 502, json: { error: base + hint } }
  }
}

