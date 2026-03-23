// API per analisi documenti con AI (Anthropic Claude)
// Vercel Serverless Function - Supporta stampe TeamSystem, Profis, fatture XML, etc.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { fileBase64, filename, mimeType } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: 'File mancante' });
    }

    // Anthropic API Key per Claude
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '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';

    const systemPrompt = `Sei un assistente esperto in documenti fiscali italiani, fatturazione elettronica (SDI) e software gestionali (TeamSystem, Profis, Bluenext, NES, Zucchetti).

Analizza il documento allegato e rispondi SOLO con un JSON valido (senza markdown, senza backtick) con questa struttura ESATTA:

{
  "tipo_documento": "fattura_passiva",
  "fonte_software": "sdi",
  "confidence": 0.95,
  "is_anagrafica": false,
  "is_fattura": true,
  "dati_fattura": {
    "numero": "123",
    "data": "2024-01-15",
    "tipo_fattura": "TD01",
    "cedente_denominazione": "FORNITORE SRL",
    "cedente_partita_iva": "12345678901",
    "cedente_codice_fiscale": "12345678901",
    "cessionario_denominazione": "CLIENTE SRL",
    "cessionario_partita_iva": "98765432109",
    "imponibile": 1000.00,
    "iva": 220.00,
    "totale": 1220.00,
    "aliquota_iva": "22",
    "descrizione": "Acquisto merci"
  },
  "dati_anagrafici": {},
  "codice_fiscale": "12345678901",
  "partita_iva": "12345678901",
  "importo_principale": 1220.00,
  "data_documento": "2024-01-15",
  "descrizione_breve": "Fattura passiva n.123 del 15/01/2024",
  "modulo_suggerito": "prima_nota",
  "azioni_suggerite": ["Registrare in prima nota"]
}

REGOLE PER FATTURE ELETTRONICHE XML:
1. Se vedi tag come <FatturaElettronica>, <CedentePrestatore>, <CessionarioCommittente> = è una fattura elettronica SDI
2. <TipoDocumento>TD01</TipoDocumento> = Fattura, TD04 = Nota di credito
3. Se il <CessionarioCommittente> è l'azienda dell'utente = fattura_passiva (acquisto)
4. Se il <CedentePrestatore> è l'azienda dell'utente = fattura_attiva (vendita)
5. Estrai SEMPRE: numero fattura, data, P.IVA cedente/cessionario, imponibile, IVA, totale
6. tipo_documento deve essere "fattura_passiva" o "fattura_attiva"

REGOLE PER ANAGRAFICHE:
1. Se vedi "Dati anagrafici", "Sede legale", "Codice anagrafica" = è TeamSystem, tipo_documento="anagrafica_cliente"
2. is_anagrafica=true solo per stampe anagrafiche

Tipi documento possibili:
- fattura_passiva: fattura ricevuta/acquisto
- fattura_attiva: fattura emessa/vendita  
- nota_credito: nota di credito
- anagrafica_cliente: stampa anagrafica
- f24: modello F24
- avviso_ade: comunicazione Agenzia Entrate
- cu: certificazione unica
- altro: altro tipo

Rispondi SOLO con il JSON, nessun testo prima o dopo.`;

    // Determina se è un file XML (testo) o binario (PDF/immagine)
    const isXML = mimeType === 'application/xml' || mimeType === 'text/xml' || 
                  (filename && filename.toLowerCase().endsWith('.xml'));
    
    let requestBody;
    
    if (isXML) {
      // Per file XML, decodifica il base64 e passa come testo
      const xmlContent = Buffer.from(fileBase64, 'base64').toString('utf-8');
      
      requestBody = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `Analizza questa fattura elettronica XML ed estrai i dati. Rispondi SOLO con il JSON.\n\nContenuto XML:\n${xmlContent}`
          }
        ]
      };
    } else {
      // Per PDF e immagini
      let mediaType = mimeType || 'application/pdf';
      const isPDF = mediaType === 'application/pdf';
      const isImage = mediaType.startsWith('image/');
      
      const fileContent = isPDF
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileBase64 } }
        : isImage
        ? { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileBase64 } }
        : { type: 'text', text: `File non riconosciuto: ${filename}` };
      
      requestBody = {
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: [
            fileContent,
            { type: 'text', text: 'Analizza questo documento ed estrai i dati. Rispondi SOLO con il JSON.' }
          ]
        }]
      };
    }

    // Chiamata a Claude API
    const isPDFRequest = (mimeType || '').includes('pdf');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        ...(isPDFRequest ? { 'anthropic-beta': 'pdfs-2024-09-25' } : {})
      },
      body: JSON.stringify(requestBody)
    });

    let analysis = {
      tipo_documento: 'altro',
      confidence: 0.3,
      is_anagrafica: false,
      is_fattura: false,
      codice_fiscale: null,
      partita_iva: null,
      descrizione_breve: 'Analisi non disponibile',
      modulo_suggerito: 'varie',
      dati_anagrafici: {},
      dati_fattura: {},
      azioni_suggerite: ['Verifica manuale richiesta']
    };

    if (response.ok) {
      const data = await response.json();
      
      // Estrai la risposta testuale da Claude
      let aiText = '';
      if (data.content && data.content[0]?.text) {
        aiText = data.content[0].text;
      }

      // Prova a parsare il JSON dalla risposta
      try {
        // Rimuovi eventuali markdown code blocks
        let cleanText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        analysis = JSON.parse(cleanText);
        
        // Assicurati che is_fattura sia impostato per le fatture
        if(analysis.tipo_documento === 'fattura_passiva' || analysis.tipo_documento === 'fattura_attiva'){
          analysis.is_fattura = true;
        }
      } catch (parseErr) {
        console.error('JSON parse error:', parseErr, 'Raw:', aiText.substring(0, 500));
        analysis.descrizione_breve = aiText.substring(0, 200);
      }
    } else {
      const errorText = await response.text();
      console.error('Claude API error:', response.status, errorText);
      analysis.descrizione_breve = 'Errore Claude API: ' + response.status;
    }

    return res.status(200).json({
      success: true,
      analysis
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(200).json({ 
      success: true,
      analysis: {
        tipo_documento: 'altro',
        confidence: 0.1,
        is_anagrafica: false,
        is_fattura: false,
        codice_fiscale: null,
        partita_iva: null,
        descrizione_breve: 'Errore: ' + error.message,
        modulo_suggerito: 'varie',
        dati_anagrafici: {},
        dati_fattura: {},
        azioni_suggerite: ['Verifica manuale']
      }
    });
  }
}
