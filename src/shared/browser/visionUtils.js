import { imageFileToBase64, renderPDFPagesToImages } from './pdfUtils.js'

export async function analyzeDocumentWithVision(file, tipoDocumento = 'generico', onProgress = null) {
  const isPDF = file.type === 'application/pdf' || file.name?.toLowerCase().endsWith('.pdf')
  const isCSV = file.name?.toLowerCase().endsWith('.csv')

  if (isCSV) {
    const ab = await file.arrayBuffer()
    const testo = new TextDecoder('windows-1252').decode(ab)
    return { _testo: testo, _tipo: 'csv' }
  }

  let imageBlocks = []

  if (isPDF) {
    onProgress?.('Rasterizzazione pagine PDF...')
    if (tipoDocumento === 'anagrafica_nes') {
      const pdfjsLib = await import('pdfjs-dist')
      pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.mjs',
        import.meta.url
      ).toString()
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
      const totalPages = pdf.numPages
      const BATCH = 10
      const allClienti = []
      const seen = new Set()

      for (let start = 1; start <= totalPages; start += BATCH) {
        const end = Math.min(start + BATCH - 1, totalPages)
        onProgress?.(`Analisi pagine ${start}-${end} di ${totalPages}...`)
        const batchImages = []
        for (let i = start; i <= end; i++) {
          const page = await pdf.getPage(i)
          const viewport = page.getViewport({ scale: 1.2 })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
          batchImages.push({
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: canvas.toDataURL('image/jpeg', 0.75).split(',')[1],
            },
          })
        }
        if (start > 1) await new Promise((r) => setTimeout(r, 1000))

        let batchRes
        for (let attempt = 0; attempt < 3; attempt++) {
          batchRes = await fetch('/api/ai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              action: 'claude',
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 4000,
              system: 'Sei un assistente specializzato in documenti fiscali italiani. Rispondi SEMPRE e SOLO con JSON valido, zero testo aggiuntivo.',
              messages: [{
                role: 'user',
                content: [...batchImages, {
                  type: 'text',
                  text: `Sei un esperto di software gestionale TeamSystem/NES. Stai analizzando le pagine di una stampa "ANAGRAFICA SOCIETA'" esportata da NES. Ogni cliente occupa 2+ pagine. Estrai TUTTI i clienti presenti in queste pagine. Rispondi SOLO con JSON valido:\n{"clienti":[{"ragione_sociale":"nome completo","partita_iva":"11 cifre","codice_fiscale":"11 cifre","indirizzo":"indirizzo o stringa vuota","tipo_cliente":"srl|snc|ordinario|forfettario"}]}`,
                }],
              }],
            }),
          })
          if (batchRes.status === 429) {
            const wait = (attempt + 1) * 3000
            onProgress?.(`Rate limit, attendo ${wait / 1000}s...`)
            await new Promise((r) => setTimeout(r, wait))
            continue
          }
          break
        }
        if (!batchRes.ok) {
          console.warn('[ANA batch HTTP error]', batchRes.status, start, '-', end)
        } else {
          const batchData = await batchRes.json()
          const txt = (batchData.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
          try {
            const parsed = JSON.parse(txt)
            for (const c of (parsed.clienti || [])) {
              const key = (c.partita_iva || c.codice_fiscale || '').replace(/\D/g, '')
              if (key && !seen.has(key)) {
                seen.add(key)
                allClienti.push(c)
              }
            }
          } catch (e) {
            console.warn('[ANA batch parse error]', e.message, txt?.substring(0, 100))
          }
        }
      }
      return { clienti: allClienti }
    }
    const images = await renderPDFPagesToImages(file, { maxPages: 3, scale: 1.2 })
    imageBlocks = images.map((b64) => ({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: b64 },
    }))
  } else {
    onProgress?.('Preparazione immagine...')
    const b64 = await imageFileToBase64(file)
    const mime = file.type || 'image/jpeg'
    imageBlocks = [{ type: 'image', source: { type: 'base64', media_type: mime, data: b64 } }]
  }

  onProgress?.('Analisi AI in corso...')

  const PROMPTS = {
    anagrafica_nes: `Sei un esperto di software gestionale TeamSystem/NES.
Stai analizzando le pagine di una stampa "ANAGRAFICA SOCIETA'" esportata da NES.
Ogni cliente occupa 2+ pagine. La prima pagina contiene: Ragione Sociale, Partita IVA, Codice Fiscale, Indirizzo, Tipo società.
Estrai TUTTI i clienti presenti in queste pagine.
Rispondi SOLO con JSON valido, zero testo aggiuntivo:
{
  "clienti": [
    {
      "ragione_sociale": "nome completo",
      "partita_iva": "11 cifre con zero iniziale se necessario",
      "codice_fiscale": "11 cifre",
      "indirizzo": "indirizzo completo o stringa vuota",
      "tipo_cliente": "srl|snc|ordinario|forfettario"
    }
  ]
}`,
    fattura: `Sei un esperto di fatturazione italiana.
Estrai i dati principali da questa fattura.
Rispondi SOLO con JSON valido:
{
  "tipo": "fattura_attiva|fattura_passiva",
  "numero": "",
  "data": "YYYY-MM-DD",
  "fornitore_denominazione": "",
  "fornitore_piva": "",
  "cliente_denominazione": "",
  "cliente_piva": "",
  "imponibile": 0.00,
  "iva": 0.00,
  "totale": 0.00,
  "descrizione": ""
}`,
    f24: `Sei un esperto di tributi italiani.
Estrai i dati dal modello F24.
Rispondi SOLO con JSON valido:
{
  "contribuente": "",
  "codice_fiscale": "",
  "periodo_riferimento": "",
  "tributi": [{"codice_tributo":"","descrizione":"","importo":0.00}],
  "totale_debiti": 0.00,
  "totale_crediti": 0.00,
  "saldo": 0.00
}`,
    estratto_conto: `Sei un esperto di contabilità bancaria.
Estrai i movimenti dall'estratto conto.
Rispondi SOLO con JSON valido:
{
  "banca": "",
  "iban": "",
  "periodo_dal": "YYYY-MM-DD",
  "periodo_al": "YYYY-MM-DD",
  "saldo_iniziale": 0.00,
  "saldo_finale": 0.00,
  "movimenti": [{"data":"YYYY-MM-DD","descrizione":"","dare":0.00,"avere":0.00}]
}`,
    generico: `Analizza questo documento e classificalo.
Rispondi SOLO con JSON valido:
{
  "tipo_documento": "fattura_attiva|fattura_passiva|f24|cu|estratto_conto|anagrafica|avviso_ade|contratto|altro",
  "confidence": 0.95,
  "descrizione_breve": "breve descrizione del contenuto",
  "partita_iva": "",
  "codice_fiscale": "",
  "denominazione": "",
  "data_documento": "YYYY-MM-DD o null",
  "importo": null
}`,
  }

  const prompt = PROMPTS[tipoDocumento] || PROMPTS.generico
  const maxTokens = tipoDocumento === 'anagrafica_nes' ? 4000 : 1000

  const res = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'claude',
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      system: 'Sei un assistente specializzato in documenti fiscali italiani. Rispondi SEMPRE e SOLO con JSON valido, zero testo aggiuntivo prima o dopo.',
      messages: [{
        role: 'user',
        content: [
          ...imageBlocks,
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || 'Errore API Claude vision: ' + res.status)
  }

  const data = await res.json()
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
  try {
    return JSON.parse(txt)
  } catch {
    throw new Error('Risposta AI non valida: ' + txt.substring(0, 100))
  }
}
