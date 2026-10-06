/**
 * VISION FALLBACK — usato solo quando parsing deterministico è insufficiente
 * Input:  { file, tipo, scoreAttuale }
 * Output: campi estratti da Claude vision
 */

const VISION_PROMPTS = {
  cu: `Stai analizzando una Certificazione Unica (CU) italiana.
Estrai questi campi e rispondi SOLO con JSON valido:
{
  "anno_riferimento": number,
  "percipiente_cf": "string",
  "percipiente_cognome": "string",
  "percipiente_nome": "string",
  "sostituto_cf": "string",
  "reddito_imponibile": number,
  "ritenute_irpef": number,
  "addizionale_regionale": number,
  "addizionale_comunale": number
}
Se un campo non è presente usa null.`,

  f24: `Stai analizzando un modello F24 italiano.
Rispondi SOLO con JSON:
{
  "contribuente_cf": "string",
  "data_versamento": "YYYY-MM-DD",
  "saldo": number,
  "tributi": [{"codice_tributo":"string","anno":number,"importo":number}]
}`,

  fattura: `Stai analizzando una fattura italiana.
Rispondi SOLO con JSON:
{
  "numero": "string",
  "data": "YYYY-MM-DD",
  "emittente_piva": "string",
  "imponibile": number,
  "iva": number,
  "totale": number,
  "aliquota_iva": number
}`,

  generico: `Analizza questo documento fiscale italiano.
Rispondi SOLO con JSON:
{
  "tipo_documento": "string",
  "data": "YYYY-MM-DD",
  "cf_o_piva": "string",
  "importo_principale": number,
  "descrizione_breve": "string"
}`,
}

export async function visionFallback(file, tipo, onProgress) {
  onProgress?.('Analisi AI in corso (fallback)...')

  // Rasterizza max 3 pagine
  const { renderPDFPagesToImages, imageFileToBase64 } = await import('../utils/index.js')
  const isPDF = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')

  let imageBlocks = []
  if (isPDF) {
    const images = await renderPDFPagesToImages(file, { maxPages: 3, scale: 1.5 })
    imageBlocks = images.map(b64 => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
    }))
  } else {
    const b64 = await imageFileToBase64(file)
    imageBlocks = [{ type: 'image', source: { type: 'base64', media_type: file.type || 'image/jpeg', data: b64 } }]
  }

  const prompt = VISION_PROMPTS[tipo] || VISION_PROMPTS.generico

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'claude',
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'Sei un esperto di documenti fiscali italiani. Rispondi SEMPRE e SOLO con JSON valido.',
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }]
    })
  })

  if (!res.ok) throw new Error(`Vision API error: ${res.status}`)
  const data = await res.json()
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(txt)
    // Converte output vision nello stesso formato dei parser deterministici
    const campi = {}
    for (const [k, v] of Object.entries(parsed)) {
      campi[k] = { valore: v, confidenza: 'basso', fonte: { metodo: 'vision' } }
    }
    return { campi, metodo: 'vision' }
  } catch {
    throw new Error('Vision: risposta non parsabile')
  }
}
