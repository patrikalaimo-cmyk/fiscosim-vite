import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 120
};

// ─── DETERMINISTIC PARSER FOR PIANO DEI CONTI ──────────────────
function parsePianoContiFromText(text) {
  const lines = text.split('\n');
  const accounts = [];
  
  const skipPatterns = [
    /stampa piano/i, /codice.*descrizione/i, /pagina\s+\d+/i,
    /^\d{2}\/\d{2}\/\d{4}/, /^\s*$/
  ];

  for (const line of lines) {
    if (skipPatterns.some(p => p.test(line.trim()))) continue;
    if (!line.trim()) continue;
    
    let codeParts = [];
    let description = '';

    // Pattern 1: spaced format "1   00   01   0001   DESCRIZIONE"
    let match = line.match(/^\s*(\d{1,2})\s{2,}(?:(\d{2})\s{2,})?(?:(\d{2})\s{2,})?(?:(\d{4})\s{2,})?(.*\S)/);
    if (match) {
      const [, g1, g2, g3, g4, desc] = match;
      codeParts = [g1];
      if (g2) codeParts.push(g2);
      if (g3) codeParts.push(g3);
      if (g4) codeParts.push(g4);
      description = (desc || '').trim();
    }

    // Pattern 2: dot-separated "1.00.01.0001  DESCRIZIONE"
    if (!match) {
      match = line.match(/^\s*(\d{1,2})\.(\d{2})\.(\d{2})\.(\d{4})\s+(.*\S)/);
      if (match) {
        codeParts = [match[1], match[2], match[3], match[4]];
        description = match[5].trim();
      }
    }

    // Pattern 3: compact single-space "1 00 01 0001 DESCRIZIONE"
    if (!match) {
      match = line.match(/^\s*(\d{1,2})\s(\d{2})\s(\d{2})\s(\d{4})\s+(.*\S)/);
      if (match) {
        codeParts = [match[1], match[2], match[3], match[4]];
        description = match[5].trim();
      }
    }

    if (codeParts.length === 0 || !description) continue;

    const level = codeParts.length;
    const codice = codeParts.join(' ');
    const codice_mastro = codeParts[0] || null;
    const codice_conto = level >= 3 ? `${codeParts[0]} ${codeParts[1]} ${codeParts[2]}` : null;
    const codice_sottoconto = level >= 4 ? codice : null;

    const fd = parseInt(codeParts[0]);
    let natura = 'patrimoniale', tipo = 'patrimoniale', sezione = 'dare';
    if (fd === 1) { natura = 'attivo'; tipo = 'patrimoniale'; sezione = 'dare'; }
    else if (fd === 2) { natura = 'passivo'; tipo = 'patrimoniale'; sezione = 'avere'; }
    else if (fd === 3) { natura = 'ricavo'; tipo = 'economico'; sezione = 'avere'; }
    else if (fd === 4 || fd === 5) { natura = 'costo'; tipo = 'economico'; sezione = 'dare'; }
    else if (fd === 6) { natura = 'ordine'; tipo = 'ordine'; }
    else if (fd === 7) { natura = 'ordine'; tipo = 'ordine'; }
    else if (fd === 8) { natura = 'revisione'; tipo = 'ordine'; }

    const du = description.toUpperCase();
    const is_cliente = /^1 02 (10|15|20)/.test(codice) && level === 4;
    const is_fornitore_it = /^2 03 (07|08)/.test(codice) && level === 4;
    const is_fornitore_ext = /^2 03 09/.test(codice) && level === 4;
    const is_professionista = /^2 03 10/.test(codice) && level === 4;
    const is_fornitore = is_fornitore_it || is_fornitore_ext || is_professionista;
    const is_banca = /^1 02 60/.test(codice) && level === 4 && /BANCA|C\/C|CRED.*COOPER|CREDEM|POSTA\s+C\/C/i.test(du);
    const is_cassa = /^1 02 60/.test(codice) && level === 4 && /CASSA\s+(CONTANTI|ASSEGNI|VALORI)/i.test(du);
    const is_iva = /IVA\s+(NS|CREDITO|DEBITO|SOSPESO|VENDITE)/i.test(du);

    let anagrafica_tipo = null;
    if (is_professionista) anagrafica_tipo = 'professionista';
    else if (is_cliente && codice.startsWith('1 02 10')) anagrafica_tipo = 'cliente_estero';
    else if (is_cliente) anagrafica_tipo = 'cliente_italia';
    else if (is_fornitore_ext) anagrafica_tipo = 'fornitore_estero';
    else if (is_fornitore_it) anagrafica_tipo = 'fornitore_italia';

    accounts.push({
      codice, codice_mastro, codice_conto, codice_sottoconto,
      descrizione: description, tipo, natura, sezione, livello: level,
      is_cliente: is_cliente || false,
      is_fornitore: is_fornitore || false,
      is_banca: is_banca || false,
      is_cassa: is_cassa || false,
      is_iva: is_iva || false,
      anagrafica_tipo,
      attivo: true
    });
  }

  return accounts;
}

// ─── PDF TEXT EXTRACTION (serverless-compatible) ──────────────
async function extractTextFromPDFBase64(base64Data) {
  try {
    // Disable worker (not available in serverless)
    pdfjsLib.GlobalWorkerOptions.workerSrc = '';
    
    const data = Buffer.from(base64Data, 'base64');
    const doc = await pdfjsLib.getDocument({ 
      data: new Uint8Array(data),
      useWorkerFetch: false,
      isEvalSupported: false,
      useSystemFonts: true
    }).promise;
    let fullText = '';
    
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const items = content.items.filter(item => item.str !== undefined);
      if (items.length === 0) continue;
      
      // Sort by Y (reversed) then X
      items.sort((a, b) => {
        const yDiff = b.transform[5] - a.transform[5];
        if (Math.abs(yDiff) > 3) return yDiff;
        return a.transform[4] - b.transform[4];
      });
      
      // Group into lines
      let currentY = null, currentLine = [];
      const pageLines = [];
      for (const item of items) {
        const y = Math.round(item.transform[5]);
        if (currentY === null || Math.abs(y - currentY) > 3) {
          if (currentLine.length > 0) pageLines.push(currentLine);
          currentLine = [item]; currentY = y;
        } else {
          currentLine.push(item);
        }
      }
      if (currentLine.length > 0) pageLines.push(currentLine);
      
      for (const lineItems of pageLines) {
        lineItems.sort((a, b) => a.transform[4] - b.transform[4]);
        let lineText = '', lastX = 0;
        for (const item of lineItems) {
          const x = item.transform[4];
          const gap = x - lastX;
          if (lastX > 0 && gap > 5) {
            lineText += ' '.repeat(Math.min(Math.max(1, Math.round(gap / 4)), 20));
          }
          lineText += item.str;
          lastX = x + (item.width || item.str.length * 5);
        }
        fullText += lineText.trim() + '\n';
      }
      fullText += '\n';
    }
    return fullText;
  } catch (e) {
    console.error('PDF.js extraction failed:', e.message);
    return null;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { fileBase64, pdf, filename } = req.body;
    let { tipo } = req.body;
    const pdfData = fileBase64 || pdf;
    if (!pdfData || !tipo) return res.status(400).json({ error: 'File e tipo richiesti' });
    if (tipo === 'causali') tipo = 'causali_contabili';

    // ━━━ PIANO DEI CONTI: Deterministic parsing (no AI) ━━━━━━━
    if (tipo === 'piano_conti') {
      let text = await extractTextFromPDFBase64(pdfData);
      
      // Fallback: AI text extraction for scanned/complex PDFs
      if (!text || text.trim().length < 50) {
        const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
        if (ANTHROPIC_KEY) {
          try {
            const r = await fetch('https://api.anthropic.com/v1/messages', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-api-key': ANTHROPIC_KEY,
                'anthropic-version': '2023-06-01',
                'anthropic-beta': 'pdfs-2024-09-25',
              },
              body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 64000,
                system: 'Estrai il testo completo di questo piano dei conti mantenendo ESATTAMENTE il formato originale con i codici numerici separati da spazi e le descrizioni. Ogni riga: codice (segmenti numerici separati da spazi) poi descrizione. Solo il testo, niente commenti.',
                messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfData } }] }]
              })
            });
            if (r.ok) {
              const d = await r.json();
              text = d.content?.map(c => c.text || '').join('') || '';
            }
          } catch (e) {
            console.error('AI fallback failed:', e.message);
          }
        }
      }

      if (!text || text.trim().length < 50) {
        return res.status(500).json({ error: 'Impossibile estrarre testo dal PDF. Verifica che sia un PDF valido non protetto.' });
      }

      const items = parsePianoContiFromText(text);
      if (items.length === 0) {
        return res.status(500).json({ 
          error: 'Nessun conto trovato. Formato non riconosciuto.',
          debug: { textLength: text.length, sample: text.substring(0, 300) }
        });
      }

      const stats = {
        mastri: items.filter(i => i.livello === 1).length,
        gruppi: items.filter(i => i.livello === 2).length,
        conti: items.filter(i => i.livello === 3).length,
        sottoconti: items.filter(i => i.livello === 4).length,
        clienti: items.filter(i => i.is_cliente).length,
        fornitori: items.filter(i => i.is_fornitore).length,
        banche: items.filter(i => i.is_banca).length,
      };

      return res.status(200).json({ ok: true, tipo, count: items.length, items, records: items, stats });
    }

    // ━━━ CAUSALI IVA / CONTABILI: AI parsing ━━━━━━━━━━━━━━━━━
    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return res.status(500).json({ error: 'ANTHROPIC_API_KEY mancante' });

    const systemPrompts = {
      causali_contabili: 'Sei un esperto contabile italiano. Estrai TUTTE le causali contabili dal documento. Rispondi SOLO con JSON array: [{"codice":"VEN","descrizione":"Vendita merce","tipo":"vendite"}]. Nessun testo extra.',
      causali_iva: `Sei un esperto contabile italiano. Estrai TUTTE le causali IVA dal documento.
Rispondi SOLO con un JSON array. Per ogni causale:
- codice: codice causale (es. "A1", "A17W")
- descrizione: descrizione completa
- aliquota: percentuale IVA come numero (22, 10, 4, 0)
- tipo: "imponibile" | "non_imponibile" | "esente" | "escluso"
- regime: "normale" (default) | "acquisto_cee" (reverse charge/intra-CEE)
- detraibile: true/false
- percentuale_detraibilita: 100 default
- codice_natura_fe: codice natura FE (N1-N7) se non imponibile, null se imponibile

Esempio: [{"codice":"A1","descrizione":"IMPONIBILE 22%","aliquota":22,"tipo":"imponibile","regime":"normale","detraibile":true,"percentuale_detraibilita":100,"codice_natura_fe":null}]
SOLO JSON array, nessun testo extra.`
    };

    const systemPrompt = systemPrompts[tipo];
    if (!systemPrompt) return res.status(400).json({ error: `Tipo non valido: ${tipo}` });

    let aiText = '', lastError = '';
    try {
      const r1 = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'pdfs-2024-09-25',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 16000,
          system: systemPrompt,
          messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfData } }] }]
        })
      });
      if (r1.ok) {
        const d1 = await r1.json();
        aiText = d1.content?.map(c => c.text || '').join('') || '';
      } else {
        lastError = `PDF: ${r1.status} ${(await r1.text()).substring(0, 200)}`;
      }
    } catch (e1) { lastError = e1.message; }

    if (!aiText) {
      return res.status(500).json({ error: 'Impossibile leggere il PDF.', details: lastError });
    }

    let items = [];
    try {
      const clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const start = clean.indexOf('[');
      const end = clean.lastIndexOf(']');
      if (start >= 0 && end > start) items = JSON.parse(clean.substring(start, end + 1));
    } catch (e) {
      return res.status(500).json({ error: 'Parsing JSON fallito', raw: aiText.substring(0, 500) });
    }

    items = (items || []).filter(i => i.codice && i.descrizione);

    if (tipo === 'causali_contabili') {
      items = items.map(i => ({
        codice: String(i.codice || '').trim().toUpperCase(),
        descrizione: String(i.descrizione || '').trim(),
        tipo: i.tipo || 'generico',
        attivo: true
      }));
    } else if (tipo === 'causali_iva') {
      // ⚠️ Map to EXACT Supabase column names
      items = items.map(i => ({
        codice: String(i.codice || '').trim(),
        descrizione: String(i.descrizione || '').trim(),
        aliquota: parseFloat(i.aliquota) || 0,
        tipo: i.tipo || 'imponibile',
        regime: i.regime || 'normale',
        detraibile: i.detraibile !== false,
        percentuale_detraibilita: parseFloat(i.percentuale_detraibilita || i.perc_detraibilita) || 100,
        codice_natura_fe: i.codice_natura_fe || null,
        include_liquidazione: true,
        include_dichiarazione: true,
        attivo: true
      }));
    }

    return res.status(200).json({ ok: true, tipo, count: items.length, items, records: items });

  } catch (err) {
    console.error('Unhandled error:', err);
    return res.status(500).json({ error: err.message });
  }
}
