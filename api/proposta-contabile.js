// API per proposta contabile AI da fattura XML/PDF
// Analizza fattura e propone registrazione contabile

export const config = {
  api: { bodyParser: { sizeLimit: '15mb' } },
  maxDuration: 120
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { 
      fileBase64, 
      filename, 
      mimeType,
      tipoFattura, // attiva o passiva
      pianoConti, // array di conti disponibili
      causaliContabili, // array causali
      causaliIva, // array causali IVA
      regoleAutomatiche // regole personalizzate
    } = req.body;

    if (!fileBase64) {
      return res.status(400).json({ error: 'File mancante' });
    }

    const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

    // Prompt per analisi contabile
    const systemPrompt = `Sei un esperto contabile italiano. Analizza questa fattura e proponi la registrazione contabile.

TIPO FATTURA: ${tipoFattura || 'da determinare'}

DATI DA ESTRARRE:
1. Tipo: fattura_attiva (emessa) o fattura_passiva (ricevuta)
2. Numero documento
3. Data documento
4. Cedente: denominazione, P.IVA, CF
5. Cessionario: denominazione, P.IVA, CF
6. Importi: imponibile, IVA, totale
7. Aliquota IVA prevalente

PROPOSTA CONTABILE:
Basandoti sul tipo di fattura e sul contenuto, proponi:
- Causale contabile suggerita (es: FF per fattura fornitore, FC per fattura cliente)
- Conto costo/ricavo più appropriato (es: Acquisti merci, Ricavi vendite, Consulenze, etc.)
- Causale IVA (es: A1IW per 22%, A2 per 10%, etc.)
- Confidence: 0.0-1.0

Se NON riesci a determinare il conto costo/ricavo appropriato, imposta:
- is_transitorio: true
- motivo: "descrizione del motivo"

RISPONDI SOLO con JSON valido (senza markdown):
{
  "tipo_fattura": "fattura_attiva|fattura_passiva",
  "numero_documento": "123",
  "data_documento": "2024-01-15",
  "cedente": {
    "denominazione": "...",
    "partita_iva": "...",
    "codice_fiscale": "..."
  },
  "cessionario": {
    "denominazione": "...",
    "partita_iva": "...",
    "codice_fiscale": "..."
  },
  "imponibile": 1000.00,
  "iva": 220.00,
  "totale": 1220.00,
  "aliquota_iva": 22,
  "proposta_contabile": {
    "causale_codice": "FF",
    "causale_descrizione": "Fattura Fornitore",
    "conto_costo_ricavo": "Acquisti merci",
    "conto_costo_ricavo_codice": "04 01 0001",
    "causale_iva_codice": "A1IW",
    "causale_iva_descrizione": "IMPONIBILE 22%"
  },
  "is_transitorio": false,
  "motivo_transitorio": null,
  "confidence": 0.95,
  "note": "eventuali note"
}`;

    // Chiamata a Gemini
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
              source: {
                type: 'base64',
                media_type: mimeType || 'application/pdf',
                data: fileBase64
              }
            },
            { type: 'text', text: systemPrompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API error:', errorText);
      return res.status(500).json({ error: 'Errore analisi AI', details: errorText });
    }

    const data = await response.json();
    
    let aiText = '';
    if (data.content) {
      aiText = data.content.map(c => c.text || '').join('');
    }

    // Parse JSON
    let analysis = null;
    try {
      let cleanText = aiText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysis = JSON.parse(cleanText);
    } catch (parseErr) {
      console.error('JSON parse error:', parseErr);
      // Fallback
      analysis = {
        tipo_fattura: tipoFattura || 'fattura_passiva',
        is_transitorio: true,
        motivo_transitorio: 'Impossibile analizzare il documento',
        confidence: 0.1,
        proposta_contabile: {
          causale_codice: tipoFattura === 'fattura_attiva' ? 'FC' : 'FF'
        }
      };
    }

    // Applica regole automatiche se fornite
    if (regoleAutomatiche && regoleAutomatiche.length > 0 && analysis) {
      for (const regola of regoleAutomatiche.sort((a, b) => a.priorita - b.priorita)) {
        let match = true;
        const cond = regola.condizioni;
        
        // Verifica condizioni
        if (cond.fornitore_piva && analysis.cedente?.partita_iva !== cond.fornitore_piva) match = false;
        if (cond.cliente_piva && analysis.cessionario?.partita_iva !== cond.cliente_piva) match = false;
        if (cond.descrizione_contiene) {
          const desc = (analysis.note || '').toLowerCase();
          if (!desc.includes(cond.descrizione_contiene.toLowerCase())) match = false;
        }
        
        // Se match, applica azioni
        if (match && regola.azioni) {
          if (regola.azioni.conto_codice) {
            analysis.proposta_contabile.conto_costo_ricavo_codice = regola.azioni.conto_codice;
            analysis.is_transitorio = false;
          }
          if (regola.azioni.causale_iva) {
            analysis.proposta_contabile.causale_iva_codice = regola.azioni.causale_iva;
          }
          analysis.regola_applicata = regola.nome;
          break;
        }
      }
    }

    // Genera righe prima nota proposte
    if (analysis && !analysis.is_transitorio) {
      const isPassiva = analysis.tipo_fattura === 'fattura_passiva';
      
      analysis.righe_prima_nota = [
        {
          descrizione: isPassiva ? 'Costo/Acquisto' : 'Ricavo/Vendita',
          conto_tipo: isPassiva ? 'costo' : 'ricavo',
          dare: isPassiva ? analysis.imponibile : 0,
          avere: isPassiva ? 0 : analysis.imponibile
        },
        {
          descrizione: isPassiva ? 'IVA a credito' : 'IVA a debito',
          conto_tipo: 'iva',
          dare: isPassiva ? analysis.iva : 0,
          avere: isPassiva ? 0 : analysis.iva
        },
        {
          descrizione: isPassiva ? 'Fornitore' : 'Cliente',
          conto_tipo: isPassiva ? 'fornitore' : 'cliente',
          dare: isPassiva ? 0 : analysis.totale,
          avere: isPassiva ? analysis.totale : 0
        }
      ];
    }

    return res.status(200).json({
      success: true,
      analysis,
      raw_response: aiText
    });

  } catch (error) {
    console.error('Error:', error);
    return res.status(500).json({ error: 'Errore interno', message: error.message });
  }
}
