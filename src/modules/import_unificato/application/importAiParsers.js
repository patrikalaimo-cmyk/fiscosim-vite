import {
  buildAdvancedTextSnapshot,
  extractJsonErrorPosition,
  snippetAroundIndex,
} from '../../../utils/pipelineLogger.js'

export function extractFirstJsonObjectString(txt) {
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

export function parseAnalisiModelJson(raw) {
  const block = extractFirstJsonObjectString(raw)
  if (!block) throw new Error('Nessun JSON trovato nella risposta del modello')
  return JSON.parse(block)
}

export function summarizeClaudeContentForLog(content) {
  if (!Array.isArray(content)) {
    return { kind: 'flat', snapshot: buildAdvancedTextSnapshot(String(content ?? ''), { headMax: 3200, tailMax: 1000 }) }
  }
  const parts = content.map((p) => {
    if (!p || typeof p !== 'object') return { type: 'unknown' }
    if (p.type === 'image') {
      return { type: 'image', media_type: p.source?.media_type || 'image/jpeg', note: '[base64 omesso dal log]' }
    }
    if (p.type === 'text') {
      return { type: 'text', snapshot: buildAdvancedTextSnapshot(p.text || '', { headMax: 3200, tailMax: 1000 }) }
    }
    return { type: p.type || 'unknown' }
  })
  return { kind: 'multipart', parts }
}

export function buildJsonParseFailurePayload(error, raw, extractedBlock = null) {
  const pos = extractJsonErrorPosition(error?.message)
  const target = extractedBlock && extractedBlock.length ? extractedBlock : raw
  return {
    error: error?.message || String(error),
    raw_response: buildAdvancedTextSnapshot(raw, { headMax: 5500, tailMax: 2200 }),
    extracted_json_block: extractedBlock ? buildAdvancedTextSnapshot(extractedBlock, { headMax: 5500, tailMax: 2200 }) : null,
    at_error: pos != null ? snippetAroundIndex(target, pos, 180) : null,
  }
}

