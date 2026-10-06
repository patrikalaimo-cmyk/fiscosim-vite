/**
 * parseDoc.js — estrazione testo PDF + analisi AI
 * Strategia:
 *   1. pdfjs estrae testo (PDF nativi → ottimo, gratis)
 *   2. Se testo > 200 chars → manda TESTO a Claude (veloce, economico)
 *   3. Se testo < 200 chars (scansione) → rasterizza e manda IMMAGINI a Claude
 */

let _pdfjsLib = null
async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib
  _pdfjsLib = await import('pdfjs-dist')
  _pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
  ).toString()
  return _pdfjsLib
}

/** Estrae testo grezzo da PDF — tutte le pagine */
export async function extractPDFText(file, { maxPages = 8 } = {}) {
  const pdfjs = await getPdfjs()
  const ab = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: ab }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  const parts = []
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // Ricostruisce il testo rispettando le righe tramite le coordinate Y
    const items = content.items.filter(it => it.str?.trim())
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
    parts.push(`--- Pagina ${i} ---\n` + lines.join('\n'))
  }
  return parts.join('\n\n')
}

/** Rasterizza PDF in immagini JPEG base64 (fallback per scansioni) */
export async function rasterizePDF(file, { maxPages = 3, scale = 1.5 } = {}) {
  const pdfjs = await getPdfjs()
  const ab = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: ab }).promise
  const pages = Math.min(pdf.numPages, maxPages)
  const images = []
  for (let i = 1; i <= pages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = vp.width
    canvas.height = vp.height
    await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise
    images.push(canvas.toDataURL('image/jpeg', 0.85).split(',')[1])
  }
  return images
}

/**
 * Analizza un documento con Claude
 * - PDF nativo → estrae testo → manda testo
 * - Scansione/immagine → rasterizza → manda immagini
 * 
 * @param {File} file
 * @param {string} systemPrompt  — istruzioni specifiche per il tipo di documento
 * @param {string} userPrompt    — cosa estrarre (JSON schema)
 * @param {object} opts
 * @returns {object} JSON parsed dalla risposta Claude
 */
export async function analyzeWithClaude(file, systemPrompt, userPrompt, {
  model = 'claude-haiku-4-5-20251001',
  maxTokens = 1500,
  onProgress = null,
} = {}) {
  const isPDF = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')
  const isImage = file.type?.startsWith('image/')

  let messages = []

  if (isPDF) {
    onProgress?.('Estrazione testo PDF...')
    const text = await extractPDFText(file, { maxPages: 8 })
    const isScanned = text.replace(/\s/g, '').length < 200

    if (!isScanned) {
      // PDF nativo → usa testo (molto più veloce e preciso)
      onProgress?.('Analisi testo...')
      messages = [{
        role: 'user',
        content: `${userPrompt}\n\n=== TESTO DEL DOCUMENTO ===\n${text.substring(0, 12000)}`
      }]
    } else {
      // Scansione → usa immagini
      onProgress?.('PDF scannerizzato, uso analisi visiva...')
      const imgs = await rasterizePDF(file, { maxPages: 3, scale: 1.5 })
      messages = [{
        role: 'user',
        content: [
          ...imgs.map(b64 => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })),
          { type: 'text', text: userPrompt }
        ]
      }]
    }
  } else if (isImage) {
    onProgress?.('Analisi immagine...')
    const b64 = await new Promise(res => {
      const r = new FileReader()
      r.onload = () => res(r.result.split(',')[1])
      r.readAsDataURL(file)
    })
    messages = [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: file.type, data: b64 } },
        { type: 'text', text: userPrompt }
      ]
    }]
  } else {
    throw new Error('Formato non supportato: ' + file.type)
  }

  onProgress?.('Elaborazione AI...')
  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'claude', model, max_tokens: maxTokens, system: systemPrompt, messages })
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()

  try {
    return JSON.parse(txt)
  } catch {
    throw new Error('Risposta AI non parsabile: ' + txt.substring(0, 200))
  }
}
