export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 120
};

// ─── DETERMINISTIC PARSER FOR PIANO DEI CONTI ──────────────────
// Claude extracts raw text, this function parses it into structured accounts
function parsePianoContiFromText(text) {
  const lines = text.split('\n');
  const accounts = [];
  const skipPatterns = [
    /stampa piano/i, /codice.*descrizione/i, /pagina\s+\d+/i,
    /^\d{2}\/\d{2}\/\d{4}/, /^\s*$/, /^19NOVANTA/i
  ];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (skipPatterns.some(p => p.test(trimmed))) continue;

    let codeParts = [], description = '';

    // Pattern A: "1 00 01 0001 DESCRIZIONE" (formato Claude pulito — spazio singolo)
    let match = trimmed.match(/^(\d)\s+(\d{2})\s+(\d{2})\s+(\d{4})\s+(.+)$/);
    if (match) { codeParts = [match[1],match[2],match[3],match[4]]; description = match[5].trim(); }

    if (!match) {
      match = trimmed.match(/^(\d)\s+(\d{2})\s+(\d{2})\s+(.+)$/);
      if (match) { codeParts = [match[1],match[2],match[3]]; description = match[4].trim(); }
    }
    if (!match) {
      match = trimmed.match(/^(\d)\s+(\d{2})\s+(.+)$/);
      if (match) { codeParts = [match[1],match[2]]; description = match[3].trim(); }
    }
    if (!match) {
      match = trimmed.match(/^(\d)\s+(\S.+)$/);
      if (match && !/^\d{2}/.test(match[2])) { codeParts = [match[1]]; description = match[2].trim(); }
    }

    // Pattern B: spazi doppi "1   00   01   0001   DESCRIZIONE"
    if (!match) {
      match = trimmed.match(/^\s*(\d{1,2})\s{2,}(?:(\d{2})\s{2,})?(?:(\d{2})\s{2,})?(?:(\d{4})\s{2,})?(.*\S)/);
      if (match) {
        const [, g1, g2, g3, g4, desc] = match;
        codeParts = [g1];
        if (g2) codeParts.push(g2);
        if (g3) codeParts.push(g3);
        if (g4) codeParts.push(g4);
        description = (desc || '').trim();
      }
    }

    // Pattern C: dot "1.00.01.0001 DESCRIZIONE"
    if (!match) {
      match = trimmed.match(/^(\d{1,2})\.(\d{2})\.(\d{2})\.(\d{4})\s+(.+)$/);
      if (match) { codeParts = [match[1],match[2],match[3],match[4]]; description = match[5].trim(); }
    }

    if (codeParts.length === 0 || !description) continue;
    if (/^\d+$/.test(description)) continue; // falso positivo

    const level = codeParts.length;
    const codice = codeParts.join(' ');
    const fd = parseInt(codeParts[0]);

    let natura = 'patrimoniale', tipo = 'patrimoniale', sezione = 'dare';
    if (fd === 1) { natura = 'attivo'; sezione = 'dare'; }
    else if (fd === 2) { natura = 'passivo'; sezione = 'avere'; }
    else if (fd === 3) { natura = 'ricavo'; tipo = 'economico'; sezione = 'avere'; }
    else if (fd <= 5) { natura = 'costo'; tipo = 'economico'; sezione = 'dare'; }
    else { natura = 'ordine'; tipo = 'ordine'; }

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
      codice,
      codice_mastro: codeParts[0] || null,
      codice_conto: level >= 3 ? `${codeParts[0]} ${codeParts[1]} ${codeParts[2]}` : null,
      codice_sottoconto: level >= 4 ? codice : null,
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

  // Deduplicazione per codice
  const seen = new Set();
  return accounts.filter(a => {
    if (seen.has(a.codice)) return false;
    seen.add(a.codice);
    return true;
  });
}

// ─── HANDLER ───────────────────────────────────────────────────
export async function parseContabilitaPdfHandler({ body }) {
  try {
    const { fileBase64, pdf, filename } = body || {};
    let { tipo } = body || {};
    const pdfData = fileBase64 || pdf;
    if (!pdfData || !tipo) return { status: 400, json: { error: 'File e tipo richiesti' } };
    if (tipo === 'causali') tipo = 'causali_contabili';

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_KEY) return { status: 500, json: { error: 'ANTHROPIC_API_KEY mancante' } };

    // Cost-effective model: Haiku for structured document parsing
    const MODEL = 'claude-haiku-4-5-20251001';

    const systemPrompts = {
      piano_conti: 'Estrai il testo completo di questo piano dei conti mantenendo ESATTAMENTE il formato originale con i codici numerici separati da spazi e le descrizioni. Ogni riga: codice (segmenti numerici separati da spazi) poi descrizione. Solo il testo grezzo, niente commenti o markdown.',
      causali_contabili: 'Sei un esperto contabile italiano. Estrai TUTTE le causali contabili dal documento. Rispondi SOLO con JSON array: [{"codice":"VEN","descrizione":"Vendita merce","tipo":"vendite"}]. Nessun testo extra.',
      causali_iva: 'Sei un esperto contabile italiano. Estrai TUTTE le causali IVA dal documento. Rispondi SOLO con JSON array: [{"codice":"A1","descrizione":"IMPONIBILE 22%","aliquota":22,"tipo":"imponibile","regime":"normale","detraibile":true,"percentuale_detraibilita":100,"codice_natura_fe":null}]. SOLO JSON array, nessun testo extra.'
    };

    const systemPrompt = systemPrompts[tipo];
    if (!systemPrompt) return { status: 400, json: { error: `Tipo non valido: ${tipo}` } };

    // Send PDF natively to Claude (no pdfjs needed)
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [{
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: pdfData }
          }]
        }]
      })
    });

    if (!r.ok) {
      const errBody = await r.text();
      console.error('Anthropic error:', r.status, errBody.substring(0, 300));
      return { status: 500, json: { error: 'Errore Anthropic API', status: r.status, detail: errBody.substring(0, 200) } };
    }

    const data = await r.json();
    const aiText = data.content?.map(c => c.text || '').join('') || '';

    if (!aiText || aiText.trim().length < 10) {
      return { status: 500, json: { error: 'Nessuna risposta dal modello AI' } };
    }

    // ━━━ PIANO DEI CONTI: deterministic parse of AI-extracted text ━━━
    if (tipo === 'piano_conti') {
      const items = parsePianoContiFromText(aiText);
      if (items.length === 0) {
        return { status: 500, json: {
          error: 'Nessun conto trovato nel testo estratto. Formato non riconosciuto.',
          debug: { aiTextLength: aiText.length, sample: aiText.substring(0, 400) }
        }};
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

      return { status: 200, json: { ok: true, tipo, count: items.length, items, records: items, stats } };
    }

    // ━━━ CAUSALI: parse JSON from AI response ━━━━━━━━━━━━━━━━━━
    let items = [];
    try {
      const clean = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const start = clean.indexOf('['), end = clean.lastIndexOf(']');
      if (start >= 0 && end > start) items = JSON.parse(clean.substring(start, end + 1));
    } catch (e) {
      return { status: 500, json: { error: 'Parsing JSON fallito', raw: aiText.substring(0, 500) } };
    }

    items = (items || []).filter(i => i.codice && i.descrizione);

    if (tipo === 'causali_contabili') {
      items = items.map(i => ({
        codice: String(i.codice).trim().toUpperCase(),
        descrizione: String(i.descrizione).trim(),
        tipo: i.tipo || 'generico',
        attivo: true
      }));
    } else if (tipo === 'causali_iva') {
      // Map to EXACT Supabase column names
      items = items.map(i => ({
        codice: String(i.codice).trim(),
        descrizione: String(i.descrizione).trim(),
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

    return { status: 200, json: { ok: true, tipo, count: items.length, items, records: items } };

  } catch (err) {
    console.error('Unhandled error:', err);
    return { status: 500, json: { error: err.message } };
  }
}
