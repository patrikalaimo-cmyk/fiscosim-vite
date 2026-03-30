// ─── MODULO IMPORT UNIFICATO ─────────────────────────────────────────────────
// Regole fondamentali:
// 1. AI propone, operatore conferma — mai azione automatica senza conferma
// 2. Tutto ciò che fa l'AI lo può fare l'operatore manualmente
// 3. Scelta manuale sempre disponibile

import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { useAIStatus } from '../../context/AIStatusContext'
import { renderPDFPagesToImages } from '../../shared/utils'
import { parseXMLFattura } from '../../shared/utils/fatture'
import { trace } from '../../core/debug/trace'

// ─── COSTANTI ────────────────────────────────────────────────────────────────

const TIPI_DOCUMENTO = [
  { id: 'fattura_passiva', label: '📥 Fattura Passiva',  color: '#4e8ef7' },
  { id: 'fattura_attiva',  label: '📤 Fattura Attiva',   color: '#34c27a' },
  { id: 'f24',             label: '📋 F24',               color: '#e05252' },
  { id: 'avviso_ade',      label: '⚡ Avviso ADE',        color: '#f59e0b' },
  { id: 'cu',              label: '📜 CU',                color: '#a78bfa' },
  { id: 'altro',           label: '📄 Altro',             color: '#7d8590' },
]

const ALIQUOTE_IVA = [
  { val: '22', label: '22% — Ordinaria' },
  { val: '10', label: '10% — Ridotta' },
  { val: '5',  label: '5% — Ridotta speciale' },
  { val: '4',  label: '4% — Super ridotta' },
  { val: '0-esente',    label: '0% — Esente art. 10' },
  { val: '0-escl',      label: '0% — Escluso art. 15' },
  { val: '0-fc',        label: '0% — Fuori campo IVA' },
  { val: '0-ns',        label: '0% — Non soggetto' },
  { val: '0-rev',       label: '0% — Reverse charge' },
]

const fmt = n => n != null ? Number(n).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) : '—'
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'

// ─── LOOKUP ANAGRAFICA FORNITORE/CLIENTE ────────────────────────────────────

async function getAnagraficaConto(societaId, piva, cf, denominazione) {
  // Cerca il conto nel piano dei conti per PIVA, CF o nome
  // Restituisce il conto con contropartita e aliquota_iva preimpostati
  if (!societaId) return null
  const norm = v => (v||'').replace(/\s|-/g,'').replace(/^IT/i,'').toUpperCase().trim()

  let query = sb.from('piano_conti')
    .select('id,codice,descrizione,contropartita,aliquota_iva,tipo_pagamento')
    .eq('societa_id', societaId).eq('attivo', true)

  // Cerca per PIVA
  if (piva && norm(piva).length >= 8) {
    const {data} = await query.or(`partita_iva.eq.${norm(piva)},anagrafica_piva.eq.${norm(piva)}`).limit(1)
    if (data?.[0]) return data[0]
  }
  // Cerca per CF
  if (cf && norm(cf).length >= 11) {
    const {data} = await sb.from('piano_conti')
      .select('id,codice,descrizione,contropartita,aliquota_iva,tipo_pagamento')
      .eq('societa_id', societaId).eq('attivo', true)
      .or(`codice_fiscale.eq.${norm(cf)},anagrafica_cf.eq.${norm(cf)}`).limit(1)
    if (data?.[0]) return data[0]
  }
  // Cerca per nome (ilike)
  if (denominazione && denominazione.length >= 4) {
    const {data} = await sb.from('piano_conti')
      .select('id,codice,descrizione,contropartita,aliquota_iva,tipo_pagamento')
      .eq('societa_id', societaId).eq('attivo', true)
      .ilike('descrizione', `%${denominazione.substring(0,20)}%`).limit(1)
    if (data?.[0]) return data[0]
  }
  return null
}

async function aggiornaContropartita(contoId, contropartitaCodice, aliquotaIva) {
  // Aggiorna contropartita predefinita nell'anagrafica del fornitore/cliente
  const update = {}
  if (contropartitaCodice) update.contropartita = contropartitaCodice
  if (aliquotaIva) update.aliquota_iva = aliquotaIva
  if (Object.keys(update).length === 0) return
  await sb.from('piano_conti').update(update).eq('id', contoId)
}

// ─── P7M → XML ───────────────────────────────────────────────────────────────

// Estrae testo da PDF usando pdfjs (evita dipendenza da parseDoc.js)
async function _extractTextFromFile(file) {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
    const ab = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({data: ab}).promise
    const pages = Math.min(pdf.numPages, 4)
    let text = ''
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const items = content.items.filter(it => it.str?.trim())
      let lastY = null, line = []
      const lines = []
      for (const item of items) {
        const y = Math.round(item.transform[5])
        if (lastY !== null && Math.abs(y - lastY) > 3) { lines.push(line.join(' ')); line = [] }
        line.push(item.str)
        lastY = y
      }
      if (line.length) lines.push(line.join(' '))
      text += lines.join('\n') + '\n'
    }
    return text
  } catch(e) { return '' }
}

async function extractXmlFromP7m(file) {
  const ab = await file.arrayBuffer()
  const bytes = new Uint8Array(ab)
  let derBytes
  if (bytes[0] === 0x30) {
    derBytes = bytes
  } else {
    const b64 = Array.from(bytes).map(b => String.fromCharCode(b)).join('')
      .split('').filter(c => c !== '\r' && c !== '\n' && c !== ' ').join('')
    const binStr = atob(b64)
    derBytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) derBytes[i] = binStr.charCodeAt(i)
  }
  let xmlStart = -1
  for (let i = 0; i < Math.min(derBytes.length, 800); i++) {
    if (derBytes[i]===0x3C && derBytes[i+1]===0x3F && derBytes[i+2]===0x78) { xmlStart=i; break }
    if (derBytes[i]===0x3C && derBytes[i+1]===0x70 && derBytes[i+2]===0x3A) { xmlStart=i; break }
    if (derBytes[i]===0x3C && derBytes[i+1]===0x46 && derBytes[i+2]===0x61) { xmlStart=i; break }
  }
  if (xmlStart === -1) throw new Error('XML non trovato nel P7M')
  let text = new TextDecoder('utf-8', {fatal:false}).decode(derBytes.slice(xmlStart))
  const e1 = text.lastIndexOf('</p:FatturaElettronica>')
  const e2 = text.lastIndexOf('</FatturaElettronica>')
  const ei = Math.max(e1, e2)
  if (ei > 0) text = text.substring(0, ei + (e1 >= e2 ? 23 : 21))
  return text.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

// ─── AI PARSING ──────────────────────────────────────────────────────────────

async function analizzaDocumento(file, xmlContent = null) {
  // Per XML/p7m: parsing deterministico diretto, zero AI
  if (xmlContent || file.name.toLowerCase().endsWith('.xml') || file.name.toLowerCase().endsWith('.p7m')) {
    const xml = xmlContent || await file.text()
    if (xml.includes('FatturaElettronica') || xml.includes('CedentePrestatore')) {
      const dati = parseXMLFattura(xml)
      // Cerca contropartita predefinita nell'anagrafica (viene usata nel form)
      // Il societaId non è disponibile qui, lo passiamo come parametro opzionale
      return {
        tipo: 'fattura_passiva', // default conservativo, operatore può cambiare
        confidenza: 0.97,
        metodo: 'xml_deterministico',
        xml_content: xml,
        dati: {
          // Fattura
          numero:        dati.numero,
          data:          dati.data,
          tipo_doc:      dati.tipo || 'TD01',
          // Cedente (fornitore per passiva)
          cedente_denom: dati.nome_cedente || dati.fornitore,
          cedente_piva:  dati.piva_cedente || dati.fornitore_cf,
          cedente_cf:    dati.cf_cedente,
          cedente_ind:   dati.indirizzo_cedente,
          // Cessionario (cliente per passiva)
          cessionario_denom: dati.nome_cessionario || dati.cliente,
          cessionario_piva:  dati.piva_cessionario,
          cessionario_cf:    dati.cf_cessionario,
          // Importi
          imponibile: dati.imponibile,
          iva:        dati.imposta,
          totale:     dati.totale_doc || dati.totale,
          // Aliquote IVA multiple
          riepilogo_iva: dati.riepilogo || [],
          // Righe
          linee: dati.lines || [],
          // Pagamento
          pagamenti: dati.pagamenti || [],
          causale: dati.causale,
        }
      }
    }
  }

  // PDF o immagine → AI
  const text = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    ? await _extractTextFromFile(file)
    : null

  const isScanned = !text || text.replace(/\s/g,'').length < 200

  let content
  if (isScanned) {
    const imgs = await renderPDFPagesToImages(file, {maxPages: 3, scale: 1.2})
    content = [
      ...imgs.map(b64 => ({type:'image', source:{type:'base64', media_type:'image/jpeg', data:b64}})),
      {type:'text', text: PROMPT_ANALISI}
    ]
  } else {
    content = [{type:'text', text: `${PROMPT_ANALISI}\n\n=== TESTO DOCUMENTO ===\n${text.substring(0, 8000)}`}]
  }

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: 'Sei un esperto commercialista italiano. Analizza documenti fiscali. Rispondi SOLO con JSON valido, zero testo aggiuntivo.',
      messages: [{role:'user', content}]
    })
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  const data = await res.json()
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g,'').trim()
  const parsed = JSON.parse(txt)
  return {
    tipo: parsed.tipo_documento || 'altro',
    confidenza: parsed.confidenza || 0.7,
    metodo: 'ai_vision',
    dati: parsed
  }
}

const PROMPT_ANALISI = `Analizza questo documento fiscale italiano e rispondi SOLO con JSON.

Determina il tipo:
- "fattura_passiva" = fattura ricevuta (acquisto)  
- "fattura_attiva" = fattura emessa (vendita)
- "f24" = modello F24 di pagamento
- "avviso_ade" = avviso/cartella Agenzia Entrate
- "cu" = Certificazione Unica
- "altro" = altro

Per FATTURA estrai:
{
  "tipo_documento": "fattura_passiva|fattura_attiva",
  "confidenza": 0.95,
  "numero": "numero fattura",
  "data": "YYYY-MM-DD",
  "tipo_doc": "TD01|TD04|...",
  "cedente_denom": "nome fornitore",
  "cedente_piva": "PIVA fornitore",
  "cedente_cf": "CF fornitore",
  "cessionario_denom": "nome cliente",
  "cessionario_piva": "PIVA cliente",
  "imponibile": 0.00,
  "iva": 0.00,
  "totale": 0.00,
  "riepilogo_iva": [{"aliquota":"22","imponibile":0,"imposta":0,"natura":""}],
  "causale": "descrizione servizio/bene",
  "linee": [{"desc":"","qty":1,"prezzo":0,"totale":0,"iva":"22"}]
}

Per F24 estrai:
{
  "tipo_documento": "f24",
  "confidenza": 0.95,
  "contribuente": "nome contribuente",
  "codice_fiscale": "CF",
  "data_versamento": "YYYY-MM-DD",
  "saldo_finale": 0.00,
  "sezione_erario": [{"codice_tributo":"","mese_rif":"","anno_rif":"","debito":0,"credito":0}],
  "sezione_inps": [{"codice":"7014","causale":"","matricola":"","periodo":"","debito":0,"credito":0}],
  "sezione_regioni": [],
  "sezione_imu": [],
  "totale_debiti": 0.00,
  "totale_crediti": 0.00
}

Per AVVISO ADE estrai:
{
  "tipo_documento": "avviso_ade",
  "confidenza": 0.95,
  "tipo_avviso": "Cartella di pagamento|Avviso bonario|Comunicazione irregolarità (36-bis)|Accertamento|Altro",
  "numero_atto": "",
  "destinatario": "",
  "codice_fiscale": "",
  "importo": 0.00,
  "data_scadenza": "YYYY-MM-DD",
  "anno_imposta": 2024,
  "modello_dichiarativo": "Redditi 2024|IRAP|IVA|...",
  "contenuto": "descrizione debito"
}`

// ─── COMPONENTE CARD DOCUMENTO ───────────────────────────────────────────────

function CardDocumento({ doc, onConferma, onElimina, clienti, pianoConti, societaId }) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(null)
  const [cercaConto, setCercaConto] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!doc.ai_raw_response) return
    const d = doc.ai_raw_response
    setForm({
      tipo_documento: doc.tipo_documento || d.tipo_documento || 'fattura_passiva',
      // Fattura
      numero:        d.numero || '',
      data:          d.data || '',
      cedente_denom: d.cedente_denom || '',
      cedente_piva:  d.cedente_piva || '',
      cedente_cf:    d.cedente_cf || '',
      cessionario_denom: d.cessionario_denom || '',
      cessionario_piva:  d.cessionario_piva || '',
      imponibile:    d.imponibile ?? '',
      iva_totale:    d.iva ?? '',
      totale:        d.totale ?? '',
      riepilogo_iva: d.riepilogo_iva || [],
      causale:       d.causale || '',
      conto_id:      null,
      conto_search:  '',
      // F24
      contribuente:  d.contribuente || '',
      cf_f24:        d.codice_fiscale || '',
      data_versamento: d.data_versamento || '',
      saldo_finale:  d.saldo_finale ?? '',
      sezione_erario: d.sezione_erario || [],
      sezione_inps:   d.sezione_inps || [],
      // Avviso
      tipo_avviso:   d.tipo_avviso || '',
      numero_atto:   d.numero_atto || '',
      importo_avviso: d.importo ?? '',
      scadenza:      d.data_scadenza || '',
      anno_imposta:  d.anno_imposta || '',
      modello_dich:  d.modello_dichiarativo || '',
      contenuto:     d.contenuto || '',
      // Cliente match
      cliente_id:    doc.cliente_id || null,
    })
  }, [doc])

  // Auto-match fornitore/cliente + preimposta contropartita e aliquota IVA
  useEffect(() => {
    if (!form || !pianoConti?.length || !societaId) return
    const piva = form.cedente_piva || form.cessionario_piva
    const cf   = form.cedente_cf  || form.cessionario_piva
    const nome = form.cedente_denom || form.cessionario_denom
    if (!piva && !cf && !nome) return

    const norm = v => (v||'').replace(/\s|-/g,'').replace(/^IT/i,'').toUpperCase().trim()

    // Cerca il conto fornitore/cliente nel piano dei conti locale (senza query)
    const match = pianoConti.find(c =>
      (piva && piva.length >= 8 && (norm(c.partita_iva)===norm(piva)||norm(c.anagrafica_piva)===norm(piva))) ||
      (cf   && cf.length >= 11  && (norm(c.codice_fiscale)===norm(cf)||norm(c.anagrafica_cf)===norm(cf))) ||
      (nome?.length > 4 && (c.is_fornitore||c.is_cliente) &&
        (c.descrizione||'').toLowerCase().includes(nome.toLowerCase().substring(0,12)))
    )
    if (!match) return

    const updates = {
      fornitore_conto_id:     match.id,
      fornitore_conto_search: `${match.codice} — ${match.descrizione}`,
    }

    // Se il conto ha contropartita predefinita → preimposta conto costo
    if (match.contropartita && !form.conto_id) {
      // Cerca il conto costo per codice
      const contoCosto = pianoConti.find(c => c.codice === match.contropartita)
      if (contoCosto) {
        updates.conto_id = contoCosto.id
        updates.conto_search = `${contoCosto.codice} — ${contoCosto.descrizione}`
        updates.conto_da_anagrafica = true
      } else {
        // Salva il codice anche se non trovato localmente
        updates.conto_search = match.contropartita
        updates.conto_da_anagrafica = true
      }
    }

    // Se il conto ha aliquota IVA predefinita → preimposta
    if (match.aliquota_iva && (!form.riepilogo_iva?.length || form.riepilogo_iva[0]?.aliquota === '22')) {
      updates.aliquota_iva_default = match.aliquota_iva
    }

    setForm(f => ({...f, ...updates}))
  }, [form?.cedente_piva, form?.cedente_cf, form?.cedente_denom, pianoConti, societaId])

  if (!form) return null

  const up = (k, v) => setForm(f => ({...f, [k]: v}))
  const tipo = TIPI_DOCUMENTO.find(t => t.id === form.tipo_documento)
  const isFattura = form.tipo_documento?.startsWith('fattura')
  const isF24 = form.tipo_documento === 'f24'
  const isAvviso = form.tipo_documento === 'avviso_ade'

  const contiFiltered = pianoConti?.filter(c => {
    if (!cercaConto) return c.livello >= 3
    const s = cercaConto.toLowerCase()
    return c.livello >= 3 && (
      (c.descrizione||'').toLowerCase().includes(s) ||
      (c.codice||'').replace(/\s/g,'').startsWith(s.replace(/[\s.]/g,''))
    )
  }).slice(0, 60) || []

  const handleConferma = async () => {
    setSaving(true)
    // Se operatore ha flaggato "usa per future" → aggiorna contropartita nell'anagrafica
    if (form.salva_contropartita && form.conto_id) {
      // Trova codice del conto costo selezionato
      let codContoCosto = null
      const contoCosto = pianoConti?.find(c => c.id === form.conto_id)
      if (contoCosto) {
        codContoCosto = contoCosto.codice
      } else if (form.conto_search) {
        codContoCosto = form.conto_search.split('—')[0].trim()
      }
      const aliquotaIva = form.riepilogo_iva?.[0]?.aliquota || form.aliquota_iva || null
      // Aggiorna conto FORNITORE con la contropartita predefinita
      const contoFornId = form.fornitore_conto_id
      if (contoFornId && codContoCosto) {
        const {error: updErr} = await sb.from('piano_conti').update({
          contropartita: codContoCosto,
          aliquota_iva:  aliquotaIva || null,
        }).eq('id', contoFornId)
        if (!updErr) {
          console.log('[Import] ✓ Contropartita', codContoCosto, 'salvata su conto fornitore', contoFornId)
        } else {
          console.error('[Import] Errore update contropartita:', updErr.message)
        }
      }
    }
    await onConferma(doc, form)
    setSaving(false)
  }

  return (
    <div style={{
      background:'var(--s2)', border:'1px solid var(--bd)', borderRadius:10,
      marginBottom:'1rem', overflow:'hidden',
    }}>
      {/* Header */}
      <div style={{
        display:'flex', alignItems:'center', gap:'.75rem',
        padding:'.75rem 1rem', borderBottom:'1px solid var(--bd)',
        background:'var(--s1)',
      }}>
        <div style={{
          background: `${tipo?.color}22`, border:`1px solid ${tipo?.color}66`,
          color: tipo?.color, borderRadius:6, padding:'.2rem .6rem',
          fontSize:'.72rem', fontWeight:700, whiteSpace:'nowrap',
        }}>{tipo?.label || form.tipo_documento}</div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{fontWeight:600, fontSize:'.85rem', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
            {doc.filename}
          </div>
          <div style={{fontSize:'.7rem', color:'var(--mu)'}}>
            {doc.confidence != null && `Confidenza AI: ${Math.round(doc.confidence*100)}%`}
            {doc.ai_raw_response?.metodo === 'xml_deterministico' && ' · XML deterministico ✓'}
          </div>
        </div>
        {/* Selettore tipo manuale */}
        <select
          value={form.tipo_documento}
          onChange={e => up('tipo_documento', e.target.value)}
          style={{
            background:'var(--s2)', border:'1px solid var(--bd)', color:'var(--tx)',
            borderRadius:6, padding:'.3rem .5rem', fontSize:'.75rem',
          }}>
          {TIPI_DOCUMENTO.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>

      {/* Body */}
      <div style={{padding:'1rem'}}>

        {/* ── FATTURA ── */}
        {isFattura && (
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem'}}>
            {/* Colonna sinistra: dati documento */}
            <div>
              <div style={{fontSize:'.7rem', fontWeight:700, color:'var(--mu)', marginBottom:'.5rem', letterSpacing:'.06em'}}>DATI DOCUMENTO</div>
              <Row label="N° Fattura" value={form.numero} onChange={v=>up('numero',v)} />
              <Row label="Data" value={form.data} onChange={v=>up('data',v)} type="date" />
              <Row label="Tipo doc" value={form.tipo_doc||'TD01'} onChange={v=>up('tipo_doc',v)} />

              <div style={{marginTop:'.75rem', fontSize:'.7rem', fontWeight:700, color:'var(--mu)', marginBottom:'.5rem', letterSpacing:'.06em'}}>
                {form.tipo_documento === 'fattura_passiva' ? 'FORNITORE (CEDENTE)' : 'CLIENTE (CESSIONARIO)'}
              </div>
              <Row label="Denominazione"
                value={form.tipo_documento==='fattura_passiva'?form.cedente_denom:form.cessionario_denom}
                onChange={v=>up(form.tipo_documento==='fattura_passiva'?'cedente_denom':'cessionario_denom',v)} />
              <Row label="P.IVA"
                value={form.tipo_documento==='fattura_passiva'?form.cedente_piva:form.cessionario_piva}
                onChange={v=>up(form.tipo_documento==='fattura_passiva'?'cedente_piva':'cessionario_piva',v)} />

              {/* Match cliente FiscoSim */}
              <div style={{marginTop:'.5rem'}}>
                <div style={{fontSize:'.7rem', color:'var(--mu)', marginBottom:'.2rem'}}>Cliente FiscoSim</div>
                <select
                  value={form.cliente_id||''}
                  onChange={e=>up('cliente_id',e.target.value||null)}
                  style={{width:'100%', background:'var(--s2)', border:'1px solid var(--bd)', color:'var(--tx)', borderRadius:6, padding:'.35rem .5rem', fontSize:'.78rem'}}>
                  <option value="">— Non associato —</option>
                  {clienti?.map(c=>(
                    <option key={c.id} value={c.id}>{c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Colonna destra: importi + conto + IVA */}
            <div>
              <div style={{fontSize:'.7rem', fontWeight:700, color:'var(--mu)', marginBottom:'.5rem', letterSpacing:'.06em'}}>IMPORTI</div>

              {/* Riepilogo IVA per aliquota */}
              {form.riepilogo_iva?.length > 0 ? (
                <div style={{marginBottom:'.75rem'}}>
                  <table style={{width:'100%', fontSize:'.75rem', borderCollapse:'collapse'}}>
                    <thead>
                      <tr style={{borderBottom:'1px solid var(--bd)'}}>
                        <th style={{padding:'.3rem',textAlign:'left',color:'var(--mu)',fontWeight:600}}>Aliquota</th>
                        <th style={{padding:'.3rem',textAlign:'right',color:'var(--mu)',fontWeight:600}}>Imponibile</th>
                        <th style={{padding:'.3rem',textAlign:'right',color:'var(--mu)',fontWeight:600}}>IVA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.riepilogo_iva.map((r,i)=>(
                        <tr key={i} style={{borderBottom:'1px solid var(--bd)'}}>
                          <td style={{padding:'.25rem'}}>
                            <select
                              value={r.aliquota}
                              onChange={e=>{
                                const nv=[...form.riepilogo_iva]
                                nv[i]={...nv[i],aliquota:e.target.value}
                                up('riepilogo_iva',nv)
                              }}
                              style={{background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:4,padding:'.15rem .3rem',fontSize:'.72rem',width:'100%'}}>
                              {ALIQUOTE_IVA.map(a=><option key={a.val} value={a.val}>{a.label}</option>)}
                              {!ALIQUOTE_IVA.find(a=>a.val===r.aliquota) && <option value={r.aliquota}>{r.aliquota}%</option>}
                            </select>
                          </td>
                          <td style={{padding:'.25rem'}}>
                            <input type="number" value={r.imponibile||''} step="0.01"
                              onChange={e=>{const nv=[...form.riepilogo_iva];nv[i]={...nv[i],imponibile:parseFloat(e.target.value)||0};up('riepilogo_iva',nv)}}
                              style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:4,padding:'.15rem .3rem',fontSize:'.72rem',textAlign:'right'}}/>
                          </td>
                          <td style={{padding:'.25rem'}}>
                            <input type="number" value={r.imposta||''} step="0.01"
                              onChange={e=>{const nv=[...form.riepilogo_iva];nv[i]={...nv[i],imposta:parseFloat(e.target.value)||0};up('riepilogo_iva',nv)}}
                              style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:4,padding:'.15rem .3rem',fontSize:'.72rem',textAlign:'right'}}/>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <button
                    onClick={()=>up('riepilogo_iva',[...form.riepilogo_iva,{aliquota:'22',imponibile:0,imposta:0,natura:''}])}
                    style={{marginTop:'.3rem',fontSize:'.7rem',background:'transparent',border:'1px dashed var(--bd)',color:'var(--mu)',borderRadius:4,padding:'.2rem .5rem',cursor:'pointer'}}>
                    + Aliquota
                  </button>
                </div>
              ) : (
                // Singola aliquota
                <div style={{marginBottom:'.75rem'}}>
                  <Row label="Imponibile €" value={form.imponibile} onChange={v=>up('imponibile',v)} type="number" />
                  <div style={{marginTop:'.3rem'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'.4rem',marginBottom:'.2rem'}}>
                      <div style={{fontSize:'.7rem', color:'var(--mu)'}}>Aliquota IVA</div>
                      {form.aliquota_iva_default && (
                        <span style={{fontSize:'.65rem',background:'rgba(52,194,122,.12)',border:'1px solid rgba(52,194,122,.3)',color:'#34c27a',borderRadius:4,padding:'.1rem .35rem'}}>da anagrafica</span>
                      )}
                    </div>
                    <select
                      value={form.aliquota_iva||form.aliquota_iva_default||'22'}
                      onChange={e=>up('aliquota_iva',e.target.value)}
                      style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:6,padding:'.35rem .5rem',fontSize:'.78rem'}}>
                      {ALIQUOTE_IVA.map(a=><option key={a.val} value={a.val}>{a.label}</option>)}
                    </select>
                  </div>
                  <Row label="IVA €" value={form.iva_totale} onChange={v=>up('iva_totale',v)} type="number" />
                </div>
              )}

              <div style={{background:'rgba(200,164,94,.08)',border:'1px solid rgba(200,164,94,.2)',borderRadius:6,padding:'.5rem .75rem',marginBottom:'.75rem'}}>
                <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                  <span style={{fontSize:'.78rem',fontWeight:600,color:'var(--mu)'}}>TOTALE</span>
                  <input type="number" value={form.totale||''} step="0.01"
                    onChange={e=>up('totale',parseFloat(e.target.value)||0)}
                    style={{width:120,background:'transparent',border:'none',color:'var(--gold)',fontSize:'1rem',fontWeight:700,textAlign:'right'}}/>
                </div>
              </div>

              {/* Conto contabile */}
              <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.4rem'}}>
                <div style={{fontSize:'.7rem', fontWeight:700, color:'var(--mu)', letterSpacing:'.06em'}}>CONTO CONTABILE</div>
                {form.conto_da_anagrafica && (
                  <span style={{fontSize:'.65rem',background:'rgba(52,194,122,.12)',border:'1px solid rgba(52,194,122,.3)',color:'#34c27a',borderRadius:4,padding:'.1rem .4rem'}}>
                    📋 da anagrafica
                  </span>
                )}
              </div>
              <input
                placeholder="Cerca conto (es. fornitori, acquisti...)"
                value={form.conto_search||cercaConto}
                onChange={e=>{setCercaConto(e.target.value);up('conto_search',e.target.value);if(!e.target.value)up('conto_id',null)}}
                style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:6,padding:'.35rem .5rem',fontSize:'.78rem',marginBottom:'.3rem'}}/>
              {cercaConto && contiFiltered.length > 0 && (
                <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:6,maxHeight:160,overflowY:'auto',marginBottom:'.5rem'}}>
                  {contiFiltered.map(c=>(
                    <div key={c.id}
                      onClick={()=>{up('conto_id',c.id);up('conto_search',`${c.codice} — ${c.descrizione}`);setCercaConto('')}}
                      style={{padding:'.4rem .6rem',cursor:'pointer',fontSize:'.75rem',borderBottom:'1px solid var(--bd)',display:'flex',gap:'.5rem'}}
                      onMouseEnter={e=>e.currentTarget.style.background='var(--s2)'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <code style={{color:'var(--gold)',flexShrink:0}}>{c.codice}</code>
                      <span>{c.descrizione}</span>
                    </div>
                  ))}
                </div>
              )}
              {form.conto_id && (
                <div>
                  <div style={{fontSize:'.72rem',color:'#34c27a',marginBottom:'.4rem'}}>
                    ✓ {form.conto_search || pianoConti?.find(c=>c.id===form.conto_id)?.descrizione}
                  </div>
                  {/* Switch: salva come contropartita predefinita nell'anagrafica */}
                  <label style={{display:'flex',alignItems:'center',gap:'.5rem',cursor:'pointer',fontSize:'.72rem',color:'var(--mu)'}}>
                    <div
                      onClick={()=>up('salva_contropartita',!form.salva_contropartita)}
                      style={{
                        width:32,height:18,borderRadius:9,cursor:'pointer',transition:'background .2s',
                        background:form.salva_contropartita?'var(--gold)':'var(--bd)',
                        position:'relative',flexShrink:0,
                      }}>
                      <div style={{
                        position:'absolute',top:2,left:form.salva_contropartita?14:2,
                        width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left .2s',
                      }}/>
                    </div>
                    <span>Usa questo conto per le future registrazioni di questo fornitore</span>
                  </label>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── F24 ── */}
        {isF24 && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.75rem',marginBottom:'1rem'}}>
              <Row label="Contribuente" value={form.contribuente} onChange={v=>up('contribuente',v)} />
              <Row label="Codice Fiscale" value={form.cf_f24} onChange={v=>up('cf_f24',v)} />
              <Row label="Data versamento" value={form.data_versamento} onChange={v=>up('data_versamento',v)} type="date"/>
            </div>
            {form.sezione_erario?.length > 0 && (
              <div style={{marginBottom:'1rem'}}>
                <div style={{fontSize:'.7rem',fontWeight:700,color:'var(--mu)',marginBottom:'.4rem',letterSpacing:'.06em'}}>SEZIONE ERARIO</div>
                <table style={{width:'100%',fontSize:'.75rem',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'var(--s1)'}}>
                    <th style={{padding:'.3rem',textAlign:'left'}}>Cod. Tributo</th>
                    <th style={{padding:'.3rem',textAlign:'left'}}>Periodo</th>
                    <th style={{padding:'.3rem',textAlign:'right',color:'#e05252'}}>Debito €</th>
                    <th style={{padding:'.3rem',textAlign:'right',color:'#34c27a'}}>Credito €</th>
                  </tr></thead>
                  <tbody>
                    {form.sezione_erario.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--bd)'}}>
                        <td style={{padding:'.3rem'}}><code style={{color:'var(--gold)'}}>{r.codice_tributo}</code></td>
                        <td style={{padding:'.3rem',color:'var(--mu)'}}>{r.mese_rif}/{r.anno_rif}</td>
                        <td style={{padding:'.3rem',textAlign:'right',color:r.debito>0?'#e05252':'var(--mu)'}}>{r.debito>0?fmt(r.debito):'—'}</td>
                        <td style={{padding:'.3rem',textAlign:'right',color:r.credito>0?'#34c27a':'var(--mu)'}}>{r.credito>0?fmt(r.credito):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {form.sezione_inps?.length > 0 && (
              <div style={{marginBottom:'1rem'}}>
                <div style={{fontSize:'.7rem',fontWeight:700,color:'var(--mu)',marginBottom:'.4rem',letterSpacing:'.06em'}}>SEZIONE INPS</div>
                <table style={{width:'100%',fontSize:'.75rem',borderCollapse:'collapse'}}>
                  <thead><tr style={{background:'var(--s1)'}}>
                    <th style={{padding:'.3rem',textAlign:'left'}}>Cod/Causale</th>
                    <th style={{padding:'.3rem',textAlign:'left'}}>Matricola</th>
                    <th style={{padding:'.3rem',textAlign:'left'}}>Periodo</th>
                    <th style={{padding:'.3rem',textAlign:'right',color:'#e05252'}}>Debito €</th>
                    <th style={{padding:'.3rem',textAlign:'right',color:'#34c27a'}}>Credito €</th>
                  </tr></thead>
                  <tbody>
                    {form.sezione_inps.map((r,i)=>(
                      <tr key={i} style={{borderBottom:'1px solid var(--bd)'}}>
                        <td style={{padding:'.3rem'}}><code style={{color:'var(--gold)'}}>{r.codice} {r.causale}</code></td>
                        <td style={{padding:'.3rem',color:'var(--mu)',fontSize:'.7rem'}}>{r.matricola}</td>
                        <td style={{padding:'.3rem',color:'var(--mu)'}}>{r.periodo}</td>
                        <td style={{padding:'.3rem',textAlign:'right',color:r.debito>0?'#e05252':'var(--mu)'}}>{r.debito>0?fmt(r.debito):'—'}</td>
                        <td style={{padding:'.3rem',textAlign:'right',color:r.credito>0?'#34c27a':'var(--mu)'}}>{r.credito>0?fmt(r.credito):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{display:'flex',justifyContent:'flex-end'}}>
              <div style={{background:'rgba(200,164,94,.08)',border:'1px solid rgba(200,164,94,.3)',borderRadius:8,padding:'.6rem 1rem',textAlign:'right'}}>
                <div style={{fontSize:'.72rem',color:'var(--mu)'}}>Saldo finale</div>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--gold)'}}>{fmt(form.saldo_finale)} €</div>
              </div>
            </div>
          </div>
        )}

        {/* ── AVVISO ADE ── */}
        {isAvviso && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem'}}>
            <div>
              <Row label="Tipo avviso" value={form.tipo_avviso} onChange={v=>up('tipo_avviso',v)} />
              <Row label="N° Atto" value={form.numero_atto} onChange={v=>up('numero_atto',v)} />
              <Row label="Destinatario" value={form.cedente_denom} onChange={v=>up('cedente_denom',v)} />
              <Row label="Codice Fiscale" value={form.cedente_cf||form.cf_f24} onChange={v=>up('cedente_cf',v)} />
            </div>
            <div>
              <Row label="Importo €" value={form.importo_avviso} onChange={v=>up('importo_avviso',v)} type="number"/>
              <Row label="Scadenza" value={form.scadenza} onChange={v=>up('scadenza',v)} type="date"/>
              <Row label="Anno imposta" value={form.anno_imposta} onChange={v=>up('anno_imposta',v)} />
              <Row label="Modello dichiar." value={form.modello_dich} onChange={v=>up('modello_dich',v)} />
            </div>
          </div>
        )}

        {/* Causale/note per tutti */}
        {form.causale !== undefined && (
          <div style={{marginTop:'.75rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>Causale / Descrizione</div>
            <input value={form.causale||''} onChange={e=>up('causale',e.target.value)}
              style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:6,padding:'.35rem .5rem',fontSize:'.78rem'}}/>
          </div>
        )}
      </div>

      {/* Footer azioni */}
      <div style={{
        display:'flex', justifyContent:'flex-end', gap:'.5rem',
        padding:'.75rem 1rem', borderTop:'1px solid var(--bd)', background:'var(--s1)',
      }}>
        <button onClick={()=>onElimina(doc.id)}
          style={{background:'transparent',border:'1px solid rgba(224,82,82,.3)',color:'#e05252',borderRadius:6,padding:'.35rem .75rem',fontSize:'.78rem',cursor:'pointer'}}>
          🗑 Scarta
        </button>
        <button onClick={handleConferma} disabled={saving}
          style={{background:'var(--gold)',border:'none',color:'#0d1117',borderRadius:6,padding:'.35rem 1rem',fontSize:'.78rem',fontWeight:700,cursor:'pointer',opacity:saving?.4:1}}>
          {saving ? '⏳ Conferma...' : '✓ Conferma e invia'}
        </button>
      </div>
    </div>
  )
}

// Helper componente riga form
function Row({label, value, onChange, type='text'}) {
  return (
    <div style={{marginBottom:'.35rem'}}>
      <div style={{fontSize:'.68rem',color:'var(--mu)',marginBottom:'.1rem'}}>{label}</div>
      <input
        type={type}
        value={value ?? ''}
        onChange={e=>onChange(type==='number'?parseFloat(e.target.value)||0:e.target.value)}
        style={{
          width:'100%', background:'var(--s2)', border:'1px solid var(--bd)',
          color:'var(--tx)', borderRadius:5, padding:'.3rem .45rem', fontSize:'.78rem',
        }}/>
    </div>
  )
}

// ─── MODULO PRINCIPALE ───────────────────────────────────────────────────────

export function ModuloImportUnificato({ ruolo }) {
  const ai = useAIStatus()
  const fileInputRef = useRef()
  const dropRef = useRef()

  const [aiEnabled, setAiEnabled] = useState(true) // letto da impostazioni_studio
  const [societa, setSocieta] = useState([])
  const [societaId, setSocietaId] = useState('')
  const [clienti, setClienti] = useState([])
  const [pianoConti, setPianoConti] = useState([])
  const [documenti, setDocumenti] = useState([]) // lista in staging
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(null) // {current, total, file}
  const [dragOver, setDragOver] = useState(false)
  // Modalità manuale: se l'operatore sa già il tipo
  const [tipoManuale, setTipoManuale] = useState('')

  // Carica dati base + impostazione AI
  useEffect(() => {
    sb.from('societa').select('id,denominazione').order('denominazione').then(({data})=>setSocieta(data||[]))
    // Leggi ai_enabled da impostazioni_studio
    sb.from('impostazioni_studio').select('valore').eq('chiave','ai_enabled').then(({data})=>{
      const val = Array.isArray(data) ? data[0]?.valore : data?.valore
      setAiEnabled(val !== 'false')
    })
  }, [])

  useEffect(() => {
    if (!societaId) return
    sb.from('clienti').select('id,nome,cognome,ragione_sociale,partita_iva,codice_fiscale')
      .eq('attivo',true).order('nome').then(({data})=>setClienti(data||[]))
    sb.from('piano_conti')
      .select('id,codice,descrizione,livello,partita_iva,anagrafica_piva,codice_fiscale,anagrafica_cf,contropartita,aliquota_iva')
      .eq('societa_id',societaId).eq('attivo',true).order('codice')
      .then(({data})=>setPianoConti(data||[]))
    caricaDocumenti()
  }, [societaId])

  const caricaDocumenti = useCallback(async () => {
    if (!societaId) return
    const {data} = await sb.from('documenti_import')
      .select('*')
      .eq('societa_destinazione_id', societaId)
      .in('stato', ['pending','classified','manual_pending'])
      .order('created_at', {ascending:false})
      .limit(50)
    setDocumenti(data||[])
    trace('LOAD DATA', { count: data?.length, societa_id: societaId })
  }, [societaId])

  // Drag & drop
  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    const over = e => { e.preventDefault(); setDragOver(true) }
    const leave = () => setDragOver(false)
    const drop = e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => { el.removeEventListener('dragover',over); el.removeEventListener('dragleave',leave); el.removeEventListener('drop',drop) }
  }, [societaId, tipoManuale])

  const handleFiles = async (fileList) => {
    if (!societaId) { alert('Seleziona prima la società'); return }
    const files = Array.from(fileList)
    if (!files.length) return
    setUploading(true)

    // Espandi ZIP e converti p7m → xml
    const toProcess = []
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.zip')) {
        const JSZip = window.JSZip
        if (!JSZip) { alert('Ricarica la pagina — JSZip non disponibile'); continue }
        const zip = await JSZip.loadAsync(await file.arrayBuffer())
        for (const [name, entry] of Object.entries(zip.files)) {
          if (entry.dir) continue
          const n = name.toLowerCase()
          if (n.endsWith('.p7m')) {
            const ab = await entry.async('arraybuffer')
            const xml = await extractXmlFromP7m(new File([ab], name))
            const xmlName = name.split('/').pop().replace(/\.p7m$/i,'.xml')
            toProcess.push({file: new File([xml], xmlName, {type:'application/xml'}), xmlContent: xml})
          } else if (n.endsWith('.xml')||n.endsWith('.pdf')||n.endsWith('.png')||n.endsWith('.jpg')||n.endsWith('.jpeg')) {
            const blob = await entry.async('blob')
            const mime = n.endsWith('.pdf')?'application/pdf':n.endsWith('.xml')?'application/xml':'image/jpeg'
            toProcess.push({file: new File([blob], name.split('/').pop(), {type:mime})})
          }
        }
      } else if (file.name.toLowerCase().endsWith('.p7m')) {
        const xml = await extractXmlFromP7m(file)
        const xmlName = file.name.replace(/\.p7m$/i,'.xml')
        toProcess.push({file: new File([xml], xmlName, {type:'application/xml'}), xmlContent: xml})
      } else {
        toProcess.push({file})
      }
    }

    setProgress({current:0, total:toProcess.length, file:''})

    for (let i=0; i<toProcess.length; i++) {
      const {file, xmlContent} = toProcess[i]
      setProgress({current:i+1, total:toProcess.length, file:file.name})

      try {
        // 1. Upload a Supabase Storage
        const filePath = `inbox/${Date.now()}_${file.name}`
        // DEDUP — controlla se fattura già presente in documenti_contabilita
        const {data:existingDoc} = await sb.from('documenti_contabilita')
          .select('id,stato,validation_status')
          .eq('societa_id', societaId)
          .eq('filename', file.name)
          .limit(1)
        if (existingDoc?.length > 0) {
          const stato = existingDoc[0].validation_status || existingDoc[0].stato
          const isContabilizzata = stato === 'confirmed' || stato === 'registered' || stato === 'registrata'
          const msg = isContabilizzata
            ? `⚠️ "${file.name}" è già stata contabilizzata. Vuoi comunque reimportarla?`
            : `⚠️ "${file.name}" è già presente in Da Validare. Vuoi reimportarla?`
          const proceed = window.confirm(msg)
          if (!proceed) continue
          // Se procede, elimina il vecchio record in staging
          await sb.from('documenti_contabilita').delete().eq('id', existingDoc[0].id)
        }

        const {error:upErr} = await sb.storage.from('documenti').upload(filePath, file)
        if (upErr) throw upErr

        // 2. Analisi: deterministica sempre, AI solo se abilitata
        let analisi
        const isXmlFile = xmlContent || file.name.toLowerCase().endsWith('.xml')
        if (isXmlFile) {
          // XML → sempre deterministico, mai AI
          ai.setAI('processing', `Parsing XML ${file.name}`, 'local')
          analisi = await analizzaDocumento(file, xmlContent)
        } else if (aiEnabled) {
          // PDF/immagine con AI attiva
          ai.setAI('processing', `Analisi AI ${file.name}`, 'ai')
          analisi = await analizzaDocumento(file, xmlContent)
        } else {
          // AI disattivata: classificazione base da filename/tipo manuale
          ai.setAI('done', 'AI disattivata', 'local')
          analisi = {
            tipo: tipoManuale || 'fattura_passiva',
            confidenza: 0.5,
            metodo: 'manuale',
            dati: { cedente_denom: file.name.replace(/\.[^.]+$/, '') }
          }
        }

        // 3. Salva in documenti_import con stato classified
        trace('IMPORT', { file: file.name, tipo: analisi.tipo, confidenza: analisi.confidenza, metodo: analisi.metodo })
        const tipoFinale = tipoManuale || analisi.tipo
        const {data:doc, error:dbErr} = await sb.from('documenti_import').insert([{
          filename:     file.name,
          file_path:    filePath,
          file_size:    file.size,
          mime_type:    file.type,
          tipo_documento: tipoFinale,
          confidence:   analisi.confidenza,
          ai_summary:   `${tipoFinale} — ${analisi.dati?.cedente_denom||analisi.dati?.contribuente||file.name}`,
          ai_raw_response: {...analisi.dati, tipo_documento:tipoFinale, metodo:analisi.metodo, xml_content:xmlContent||analisi.xml_content||null},
          stato:        'classified',
          societa_destinazione_id: societaId,
        }]).select().single()
        if (dbErr) throw dbErr

        // Auto-match cliente per PIVA
        const piva = analisi.dati?.cedente_piva || analisi.dati?.cessionario_piva || analisi.dati?.codice_fiscale
        if (piva && clienti.length) {
          const norm = p => (p||'').replace(/\s|-/g,'').replace(/^IT/i,'').toUpperCase()
          const match = clienti.find(c => norm(c.partita_iva)===norm(piva)||norm(c.codice_fiscale)===norm(piva))
          if (match) await sb.from('documenti_import').update({cliente_id:match.id,cliente_match_type:'auto'}).eq('id',doc.id)
        }

        ai.setAI('done', `${file.name} classificato`, 'ai')
      } catch(e) {
        console.error('Errore processing:', file.name, e)
        ai.setAI('done','Errore','ai')
      }
    }

    setUploading(false)
    setProgress(null)
    caricaDocumenti()
  }

  // Conferma documento → smista al modulo giusto
  const confermaDocumento = async (doc, form) => {
    try {
      const tipo = form.tipo_documento
      const nullDate = v => { if(!v) return null; const s=String(v).trim(); return s?s:null }
      const nullNum  = v => { if(v===''||v==null||isNaN(v)) return null; const n=parseFloat(v); return isNaN(n)?null:n }

      if (tipo === 'fattura_passiva' || tipo === 'fattura_attiva') {
        // Calcola totali da riepilogo IVA se disponibile
        let imponibile = nullNum(form.imponibile)
        let iva = nullNum(form.iva_totale)
        if (form.riepilogo_iva?.length > 0) {
          imponibile = form.riepilogo_iva.reduce((s,r)=>s+(r.imponibile||0),0)
          iva = form.riepilogo_iva.reduce((s,r)=>s+(r.imposta||0),0)
        }
        const totale = nullNum(form.totale) || (imponibile||0)+(iva||0)

        // Cerca conto nel piano dei conti
        let contoId=form.conto_id||null, contoCodice=null, contoDesc=null
        let causaleIvaId=null
        if (contoId) {
          const c = pianoConti.find(x=>x.id===contoId)
          if (c) {
            contoCodice=c.codice; contoDesc=c.descrizione
            // PRIORITÀ 1: causale_iva_id predefinita sul conto
            if(c.causale_iva_id) causaleIvaId=c.causale_iva_id
          }
        }
        // Fallback codice da conto_search
        if (!contoCodice && form.conto_search) {
          const codFromSearch = form.conto_search.split('—')[0].trim()
          const c = pianoConti.find(x => x.codice === codFromSearch)
          if (c) {
            contoId=c.id; contoCodice=c.codice; contoDesc=c.descrizione
            if(c.causale_iva_id) causaleIvaId=c.causale_iva_id
          }
        }

        const _payload = {
          societa_id:       societaId,
          tipo:             tipo,
          tipo_documento:   tipo,
          nome_file:        doc.filename,
          filename:         doc.filename,
          file_path:        doc.file_path,
          file_url:         null,
          mime_type:        doc.mime_type,
          stato:            'da_validare',
          workflow_status:  'pending',
          validation_status:'pending',
          data_documento:   nullDate(form.data),
          numero_documento: form.numero||null,
          soggetto_denominazione: (tipo==='fattura_passiva'?form.cedente_denom:form.cessionario_denom)||null,
          soggetto_piva:    (tipo==='fattura_passiva'?form.cedente_piva:form.cessionario_piva)||null,
          soggetto_cf:      (tipo==='fattura_passiva'?form.cedente_cf:form.cessionario_piva)||null,
          imponibile:       imponibile,
          iva:              iva,
          totale:           totale,
          ai_confidence:    doc.confidence||0,
          cliente_id:       form.cliente_id||null,  // uuid o null
          source_document_id: doc.id||null,
          conto_id:         contoId||null,
          causale_iva:      causaleIvaId||null,
          conto_match_type: contoId?'piano_conti':'none',
          dati_estratti: JSON.stringify({
            xml_content:      doc.ai_raw_response?.xml_content||null,
            conto_id:         contoId,
            conto_codice:     contoCodice,
            conto_descrizione:contoDesc,
            riepilogo_iva:    form.riepilogo_iva,
            linee:            form.linee||[],
            cedente_piva:     form.cedente_piva,
            cedente_denom:    form.cedente_denom,
            pagamenti:        form.pagamenti||[],
          }),
        }
        trace('DB', { action: 'INSERT documenti_contabilita', filename: doc.filename, tipo, contoId, causaleIvaId })
        console.log('[Import] Payload insert:', JSON.stringify(_payload, null, 2))
        const {error: _insErr} = await sb.from('documenti_contabilita').insert([_payload])
        if (_insErr) { console.error('[Import] ERRORE INSERT:', _insErr); alert('Errore: ' + _insErr.message); return }

      } else if (tipo === 'f24') {
        // Salva in documenti_contabilita con tipo f24
        await sb.from('documenti_contabilita').insert([{
          societa_id:       societaId,
          tipo:             'f24',
          tipo_documento:   'f24',
          nome_file:        doc.filename,
          filename:         doc.filename,
          file_path:        doc.file_path,
          stato:            'da_validare',
          workflow_status:  'pending',
          validation_status:'pending',
          data_documento:   nullDate(form.data_versamento),
          soggetto_denominazione: form.contribuente||null,
          soggetto_cf:      form.cf_f24||null,
          totale:           nullNum(form.saldo_finale),
          ai_confidence:    doc.confidence||0,
          cliente_id:       form.cliente_id||null,  // uuid o null
          source_document_id: doc.id||null,
          dati_estratti: JSON.stringify({
            sezione_erario:  form.sezione_erario,
            sezione_inps:    form.sezione_inps,
            saldo_finale:    form.saldo_finale,
          }),
        }])

      } else if (tipo === 'avviso_ade') {
        // Inserisce direttamente in avvisi_ade
        const codStudio = `AGE-${String(Date.now()).slice(-4)}`
        await sb.from('avvisi_ade').insert([{
          codice_studio:    codStudio,
          cliente_id:       form.cliente_id||null,  // uuid o null
          cliente_nome:     form.cedente_denom||null,
          tipo_avviso:      form.tipo_avviso||'Altro',
          importo:          nullNum(form.importo_avviso),
          data_scadenza:    nullDate(form.scadenza),
          data_ricezione_studio: new Date().toISOString().split('T')[0],
          contenuto:        form.contenuto||null,
          note:             form.numero_atto?`N° Atto: ${form.numero_atto}`:'',
          dati_estratti:    JSON.stringify(doc.ai_raw_response||{}),
        }])
      }

      // Segna come processato
      await sb.from('documenti_import').update({
        stato:'processed',
        processato_at: new Date().toISOString(),
        modulo_destinazione: tipo,
      }).eq('id', doc.id)

      caricaDocumenti()
    } catch(e) {
      alert('Errore: '+e.message)
    }
  }

  const eliminaDocumento = async (id) => {
    await sb.from('documenti_import').update({stato:'error'}).eq('id',id)
    setDocumenti(prev=>prev.filter(d=>d.id!==id))
  }

  return (
    <div className="page">
      <div className="page-hdr">
        <div className="page-hdr-l">
          <div className="page-title">📁 Import Documenti</div>
          <div className="page-sub">Carica · AI analizza · Operatore conferma · Sistema smista</div>
        </div>
      </div>

      {/* Selettore società */}
      <div className="card" style={{marginBottom:'1rem',padding:'.75rem 1rem',display:'flex',alignItems:'center',gap:'1rem',flexWrap:'wrap'}}>
        <div style={{fontWeight:600,fontSize:'.85rem'}}>Società:</div>
        <select
          value={societaId}
          onChange={e=>setSocietaId(e.target.value)}
          style={{flex:1,minWidth:200,background:'var(--s2)',border:'1px solid var(--bd)',color:'var(--tx)',borderRadius:7,padding:'.4rem .75rem',fontSize:'.85rem'}}>
          <option value="">— Seleziona società —</option>
          {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
        </select>

        {/* Badge AI status */}
        <div style={{
          display:'inline-flex', alignItems:'center', gap:'.3rem',
          background: aiEnabled ? 'rgba(52,194,122,.12)' : 'rgba(224,82,82,.12)',
          border: `1px solid ${aiEnabled ? 'rgba(52,194,122,.3)' : 'rgba(224,82,82,.3)'}`,
          color: aiEnabled ? '#34c27a' : '#e05252',
          borderRadius:6, padding:'.25rem .6rem', fontSize:'.72rem', fontWeight:600,
        }}>
          {aiEnabled ? '🤖 AI ON' : '🤖 AI OFF'}
        </div>
        {/* Tipo manuale: se so già cosa sto caricando */}
        <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
          <span style={{fontSize:'.78rem',color:'var(--mu)'}}>Tipo manuale:</span>
          <select
            value={tipoManuale}
            onChange={e=>setTipoManuale(e.target.value)}
            style={{background:'var(--s2)',border:'1px solid var(--bd)',color:tipoManuale?'var(--gold)':'var(--mu)',borderRadius:7,padding:'.4rem .6rem',fontSize:'.78rem'}}>
            <option value="">AI decide</option>
            {TIPI_DOCUMENTO.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </div>
      </div>

      {/* Drop zone */}
      <div
        ref={dropRef}
        onClick={()=>!uploading&&fileInputRef.current?.click()}
        style={{
          border:`2px dashed ${dragOver?'var(--gold)':'var(--bd)'}`,
          borderRadius:12, padding:'2.5rem 2rem', textAlign:'center',
          cursor:uploading?'not-allowed':'pointer',
          background:dragOver?'rgba(200,164,94,.06)':'var(--s2)',
          marginBottom:'1rem', transition:'all .2s',
        }}>
        <input ref={fileInputRef} type="file" multiple
          accept=".pdf,.xml,.p7m,.png,.jpg,.jpeg,.zip"
          style={{display:'none'}}
          onChange={e=>handleFiles(e.target.files)}/>
        {uploading && progress ? (
          <div>
            <div style={{fontSize:'1.5rem',marginBottom:'.5rem'}}>⏳</div>
            <div style={{fontWeight:600}}>Analisi in corso... {progress.current}/{progress.total}</div>
            <div style={{fontSize:'.78rem',color:'var(--mu)',marginTop:'.3rem'}}>{progress.file}</div>
            <div style={{marginTop:'.75rem',height:4,background:'var(--bd)',borderRadius:4,overflow:'hidden'}}>
              <div style={{height:'100%',background:'var(--gold)',width:`${(progress.current/progress.total)*100}%`,transition:'width .3s'}}/>
            </div>
          </div>
        ) : (
          <div>
            <div style={{fontSize:'2.5rem',marginBottom:'.5rem'}}>📂</div>
            <div style={{fontWeight:600,fontSize:'1rem',marginBottom:'.25rem'}}>Trascina i documenti qui</div>
            <div style={{fontSize:'.78rem',color:'var(--mu)'}}>PDF · XML · P7M · Immagini · ZIP</div>
            {tipoManuale && (
              <div style={{marginTop:'.5rem',display:'inline-block',background:'rgba(200,164,94,.12)',border:'1px solid rgba(200,164,94,.3)',color:'var(--gold)',borderRadius:6,padding:'.2rem .6rem',fontSize:'.75rem'}}>
                ✓ Modalità: {TIPI_DOCUMENTO.find(t=>t.id===tipoManuale)?.label}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lista documenti da confermare */}
      {!societaId ? (
        <div style={{textAlign:'center',padding:'3rem',color:'var(--mu)'}}>Seleziona una società per iniziare</div>
      ) : documenti.length === 0 ? (
        <div style={{textAlign:'center',padding:'3rem',color:'var(--mu)'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>✅</div>
          <div>Nessun documento in attesa di conferma</div>
        </div>
      ) : (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.75rem',flexWrap:'wrap',gap:'.5rem'}}>
            <div style={{fontSize:'.78rem',color:'var(--mu)'}}>
              {documenti.length} documento{documenti.length>1?'i':''} da confermare
            </div>
            <div style={{display:'flex',gap:'.5rem'}}>
              <button
                onClick={async()=>{
                  if(!window.confirm(`Confermi l'invio di tutti i ${documenti.length} documenti in Da Validare?`)) return
                  for(const doc of documenti){
                    // usa i dati già estratti senza modifiche operatore
                    const form = doc.ai_raw_response || {}
                    await confermaDocumento(doc, {
                      tipo_documento: doc.tipo_documento || 'fattura_passiva',
                      numero: form.numero||'', data: form.data||'',
                      cedente_denom: form.cedente_denom||'', cedente_piva: form.cedente_piva||'',
                      cedente_cf: form.cedente_cf||'', cessionario_denom: form.cessionario_denom||'',
                      cessionario_piva: form.cessionario_piva||'',
                      imponibile: form.imponibile||0, iva_totale: form.iva||0,
                      totale: form.totale||0, riepilogo_iva: form.riepilogo_iva||[],
                      causale: form.causale||'', conto_id: null, cliente_id: doc.cliente_id||null,
                      contribuente: form.contribuente||'', cf_f24: form.codice_fiscale||'',
                      data_versamento: form.data_versamento||'', saldo_finale: form.saldo_finale||0,
                      sezione_erario: form.sezione_erario||[], sezione_inps: form.sezione_inps||[],
                      tipo_avviso: form.tipo_avviso||'', numero_atto: form.numero_atto||'',
                      importo_avviso: form.importo||0, scadenza: form.data_scadenza||'',
                      anno_imposta: form.anno_imposta||'', modello_dich: form.modello_dichiarativo||'',
                      salva_contropartita: false,
                    })
                  }
                }}
                style={{background:'var(--gold)',border:'none',color:'#0d1117',borderRadius:6,padding:'.35rem .9rem',fontSize:'.75rem',fontWeight:700,cursor:'pointer'}}>
                ✓ Conferma tutti
              </button>
              <button
                onClick={async()=>{
                  if(!window.confirm('Eliminare tutti i documenti in staging?')) return
                  await sb.from('documenti_import')
                    .update({stato:'error'})
                    .eq('societa_destinazione_id', societaId)
                    .in('stato',['pending','classified','manual_pending'])
                  setDocumenti([])
                }}
                style={{background:'transparent',border:'1px solid rgba(224,82,82,.4)',color:'#e05252',borderRadius:6,padding:'.35rem .9rem',fontSize:'.75rem',cursor:'pointer'}}>
                🗑 Svuota tutto
              </button>
            </div>
          </div>
          {documenti.map(doc=>(
            <CardDocumento
              key={doc.id}
              doc={doc}
              onConferma={confermaDocumento}
              onElimina={eliminaDocumento}
              clienti={clienti}
              pianoConti={pianoConti}
              societaId={societaId}
            />
          ))}
        </div>
      )}
    </div>
  )
}
