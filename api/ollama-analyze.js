// POST { prompt, model? } → { response: string } — stesso stack di aiParsingService (Ollama / Mistral)

import { callLocalAI } from '../lib/ollama.js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const prompt = String(body?.prompt || '')
    if (!prompt) return res.status(400).json({ error: 'prompt mancante' })

    const text = await callLocalAI(prompt, { model: body?.model })
    return res.status(200).json({ response: text })
  } catch (e) {
    const base = e?.message || String(e)
    const hint =
      /ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(base)
        ? ` Ollama non raggiungibile. Avvia ollama serve e: ollama pull mistral`
        : ''
    return res.status(502).json({ error: base + hint })
  }
}
