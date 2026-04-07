export async function fetchOllamaAnalisiDev(fullPrompt, model) {
  const res = await fetch('/ollama-proxy/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, prompt: fullPrompt, stream: false }),
  })
  const raw = await res.text().catch(() => '')
  let data
  try {
    data = raw ? JSON.parse(raw) : {}
  } catch {
    data = {}
  }
  return { res, raw, data }
}

export async function fetchOllamaAnalisiProd(fullPrompt, model) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'ollama_analyze', prompt: fullPrompt, model }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

export async function fetchClaudeImportAnalisi(content) {
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'claude',
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      system: 'Sei un esperto commercialista italiano. Analizza documenti fiscali. Rispondi SOLO con JSON valido, zero testo aggiuntivo.',
      messages: [{ role: 'user', content }],
    }),
  })
  const data = await res.json().catch(() => ({}))
  return { res, data }
}

export async function postOperatorCorrections({ documentId, parsingAfter, accountingAfter }) {
  const res = await fetch('/api/accounting/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'save_operator_corrections', documentId, parsingAfter, accountingAfter }),
  })
  return res
}
