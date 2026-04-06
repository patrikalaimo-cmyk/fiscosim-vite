/**
 * FiscoSim AI Agent
 * Agente conversazionale con tool use, voce, supervisione operatore
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { createPrimaNota } from '../../../services/primaNotaService.js'

// ─── TOOLS DEFINIZIONE ───────────────────────────────────────
// Strumenti che l'agente può usare — divisi in lettura e scrittura
const TOOLS = [
  // ── LETTURA (esecuzione immediata, no conferma) ──
  {
    name: 'get_statistiche',
    desc: 'Legge statistiche della società: fatture, clienti attivi, saldo IVA, F24 in scadenza',
    tipo: 'lettura',
    params: { societa_id: 'string' }
  },
  {
    name: 'cerca_clienti',
    desc: 'Cerca clienti nel piano dei conti per nome, partita IVA o codice fiscale',
    tipo: 'lettura',
    params: { query: 'string', societa_id: 'string' }
  },
  {
    name: 'get_fatture',
    desc: 'Legge lista fatture importate, filtra per tipo (attiva/passiva), periodo, stato',
    tipo: 'lettura',
    params: { societa_id: 'string', tipo: 'string?', mese: 'number?', anno: 'number?' }
  },
  {
    name: 'get_liquidazioni_iva',
    desc: 'Legge liquidazioni IVA di un periodo con saldi e stato',
    tipo: 'lettura',
    params: { societa_id: 'string', anno: 'number?' }
  },
  {
    name: 'get_documenti_da_validare',
    desc: 'Legge documenti in stato da_validare che attendono contabilizzazione',
    tipo: 'lettura',
    params: { societa_id: 'string' }
  },
  {
    name: 'get_piano_conti',
    desc: 'Cerca conti nel piano dei conti per codice o descrizione',
    tipo: 'lettura',
    params: { societa_id: 'string', query: 'string' }
  },
  // ── SCRITTURA (richiede conferma operatore) ──
  {
    name: 'contabilizza_documenti',
    desc: 'Contabilizza uno o più documenti da_validare creando registrazioni in prima nota',
    tipo: 'scrittura',
    params: { documento_ids: 'string[]', societa_id: 'string' }
  },
  {
    name: 'crea_liquidazione_iva',
    desc: 'Crea una nuova liquidazione IVA per il periodo specificato',
    tipo: 'scrittura',
    params: { societa_id: 'string', tipo_periodo: 'string', anno: 'number', trimestre: 'number?', mese: 'number?' }
  },
  {
    name: 'crea_f24',
    desc: 'Genera un modello F24 da una liquidazione IVA confermata',
    tipo: 'scrittura',
    params: { liquidazione_id: 'string', societa_id: 'string' }
  },
  {
    name: 'aggiorna_anagrafica_conto',
    desc: 'Aggiorna i dati anagrafici di un conto nel piano dei conti',
    tipo: 'scrittura',
    params: { conto_id: 'string', updates: 'object' }
  },
]

// ─── ESECUTORE TOOLS ─────────────────────────────────────────
async function executeTool(name, params) {
  switch(name) {

    case 'get_statistiche': {
      const { societa_id } = params
      const [fatture, clienti, liquidazioni, f24] = await Promise.all([
        sb.from('fatture_xml').select('id,tipo_fattura,importo_totale,stato').eq('societa_id', societa_id),
        sb.from('piano_conti').select('id').eq('societa_id', societa_id).eq('attivo', true).eq('is_cliente', true),
        sb.from('liquidazioni_iva').select('id,periodo,iva_saldo,stato').eq('societa_id', societa_id).order('created_at', {ascending:false}).limit(4),
        sb.from('f24_righe').select('id,importo,stato_invio').eq('societa_id', societa_id).neq('stato_invio','inviato'),
      ])
      const totAttive  = (fatture.data||[]).filter(f=>f.tipo_fattura==='attiva').reduce((s,f)=>s+(f.importo_totale||0),0)
      const totPassive = (fatture.data||[]).filter(f=>f.tipo_fattura==='passiva').reduce((s,f)=>s+(f.importo_totale||0),0)
      return {
        fatture_attive: (fatture.data||[]).filter(f=>f.tipo_fattura==='attiva').length,
        fatture_passive: (fatture.data||[]).filter(f=>f.tipo_fattura==='passiva').length,
        totale_attive: totAttive,
        totale_passive: totPassive,
        clienti_attivi: (clienti.data||[]).length,
        liquidazioni_recenti: liquidazioni.data||[],
        f24_da_inviare: (f24.data||[]).length,
      }
    }

    case 'cerca_clienti': {
      const { query, societa_id } = params
      const { data } = await sb.from('piano_conti')
        .select('id,codice,descrizione,partita_iva,codice_fiscale,is_cliente,is_fornitore,split_payment')
        .eq('societa_id', societa_id).eq('attivo', true)
        .or(`descrizione.ilike.%${query}%,partita_iva.ilike.%${query}%,codice_fiscale.ilike.%${query}%`)
        .limit(10)
      return { risultati: data || [] }
    }

    case 'get_fatture': {
      const { societa_id, tipo, mese, anno } = params
      let q = sb.from('fatture_xml').select('id,numero_fattura,data_fattura,tipo_fattura,importo_totale,conto_codice,conto_descrizione,soggetto_denominazione,stato')
        .eq('societa_id', societa_id).order('data_fattura', {ascending:false}).limit(30)
      if(tipo) q = q.eq('tipo_fattura', tipo)
      if(anno) q = q.gte('data_fattura', `${anno}-01-01`).lte('data_fattura', `${anno}-12-31`)
      const { data } = await q
      return { fatture: data || [], totale: (data||[]).length }
    }

    case 'get_liquidazioni_iva': {
      const { societa_id, anno } = params
      let q = sb.from('liquidazioni_iva').select('*').eq('societa_id', societa_id).order('created_at', {ascending:false}).limit(8)
      if(anno) q = q.eq('anno', anno)
      const { data } = await q
      return { liquidazioni: data || [] }
    }

    case 'get_documenti_da_validare': {
      const { societa_id } = params
      const { data } = await sb.from('documenti_contabilita')
        .select('id,nome_file,tipo_documento,importo,data_documento,conto_proposto,causale_proposta,stato')
        .eq('societa_id', societa_id).eq('stato', 'da_validare').limit(20)
      return { documenti: data || [], totale: (data||[]).length }
    }

    case 'get_piano_conti': {
      const { societa_id, query } = params
      const { data } = await sb.from('piano_conti')
        .select('id,codice,descrizione,tipo,natura,is_cliente,is_fornitore')
        .eq('societa_id', societa_id).eq('attivo', true)
        .or(`descrizione.ilike.%${query}%,codice.ilike.%${query}%`)
        .limit(10)
      return { conti: data || [] }
    }

    case 'contabilizza_documenti': {
      const { documento_ids, societa_id } = params
      const risultati = []
      for(const id of documento_ids) {
        const { data: doc } = await sb.from('documenti_contabilita').select('*').eq('id', id).single()
        if(!doc) { risultati.push({ id, ok: false, msg: 'Documento non trovato' }); continue }
        // Crea prima nota
        const { data: pn, error } = await createPrimaNota({ db: sb, pnPayload: {
          societa_id,
          data_registrazione: doc.data_documento || new Date().toISOString().split('T')[0],
          causale_id: doc.causale_id || null,
          descrizione: doc.nome_file,
          importo: doc.importo || 0,
          documento_id: id,
        }, headerSelect: 'id' })
        if(error) { risultati.push({ id, ok: false, msg: error.message }); continue }
        // Aggiorna stato documento
        await sb.from('documenti_contabilita').update({ stato: 'registrato' }).eq('id', id)
        risultati.push({ id, ok: true, prima_nota_id: pn.id })
      }
      return { risultati, ok: risultati.filter(r=>r.ok).length, errori: risultati.filter(r=>!r.ok).length }
    }

    case 'crea_liquidazione_iva': {
      const { societa_id, tipo_periodo, anno, trimestre, mese } = params
      const periodo = tipo_periodo === 'trimestrale'
        ? `Q${trimestre} ${anno}` : `${['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][mese]} ${anno}`
      const { data, error } = await sb.from('liquidazioni_iva').insert([{
        societa_id, tipo_periodo, anno, trimestre: trimestre||null, mese: mese||null,
        periodo, iva_vendite:0, iva_acquisti:0, iva_saldo:0, iva_dovuta:0, iva_credito:0, stato:'bozza'
      }]).select('id').single()
      if(error) return { ok: false, msg: error.message }
      return { ok: true, liquidazione_id: data.id, periodo, msg: `Liquidazione ${periodo} creata in bozza` }
    }

    case 'crea_f24': {
      const { liquidazione_id, societa_id } = params
      const { data: liq } = await sb.from('liquidazioni_iva').select('*').eq('id', liquidazione_id).single()
      if(!liq) return { ok: false, msg: 'Liquidazione non trovata' }
      const isTrim = liq.tipo_periodo === 'trimestrale'
      const codiciTrim = {1:'6031',2:'6032',3:'6033',4:'6035'}
      const codiciMens = {1:'6001',2:'6002',3:'6003',4:'6004',5:'6005',6:'6006',7:'6007',8:'6008',9:'6009',10:'6010',11:'6011',12:'6012'}
      const codice_tributo = isTrim ? codiciTrim[liq.trimestre] : codiciMens[liq.mese]
      const { data, error } = await sb.from('f24_righe').insert([{
        societa_id, liquidazione_id, codice_tributo,
        anno_riferimento: liq.anno, importo: liq.iva_dovuta || 0, stato_invio: 'da_inviare'
      }]).select('id').single()
      if(error) return { ok: false, msg: error.message }
      return { ok: true, f24_id: data.id, codice_tributo, importo: liq.iva_dovuta }
    }

    case 'aggiorna_anagrafica_conto': {
      const { conto_id, updates } = params
      const { error } = await sb.from('piano_conti').update(updates).eq('id', conto_id)
      if(error) return { ok: false, msg: error.message }
      return { ok: true, msg: 'Conto aggiornato' }
    }

    default:
      return { ok: false, msg: `Tool sconosciuto: ${name}` }
  }
}

// ─── SISTEMA PROMPT AGENTE ───────────────────────────────────
function buildSystemPrompt(societaInfo) {
  return `Sei FiscoSim AI, l'assistente intelligente integrato nel gestionale fiscale FiscoSim per studi di commercialisti italiani.
Stai operando per la società: ${societaInfo?.denominazione || 'non selezionata'} (ID: ${societaInfo?.id || 'n/d'}).

PERSONALITÀ: Sei preciso, professionale ma diretto. Rispondi in italiano. Sei un esperto di fiscalità italiana.

CAPACITÀ: Puoi leggere dati in tempo reale dal database e, con conferma dell'operatore, eseguire azioni.

STRUMENTI DISPONIBILI:
- LETTURA (esegui subito): get_statistiche, cerca_clienti, get_fatture, get_liquidazioni_iva, get_documenti_da_validare, get_piano_conti
- SCRITTURA (richiedi conferma): contabilizza_documenti, crea_liquidazione_iva, crea_f24, aggiorna_anagrafica_conto

REGOLE FONDAMENTALI:
1. Prima di eseguire tool di SCRITTURA, descrivi SEMPRE cosa farai e aspetta conferma esplicita
2. Per tool di LETTURA, esegui subito e presenta i dati in modo chiaro
3. Se l'utente ti chiede di fare più cose, pianifica tutto e mostra il piano completo prima di chiedere conferma
4. Usa numeri e importi sempre in formato italiano (€ 1.234,56)
5. Se mancano dati per completare un'operazione, chiedi solo quello che serve
6. Quando presenti dati, sii conciso ma completo — usa liste quando utile
7. Ricorda il contesto della conversazione per comandi successivi come "fai lo stesso per marzo"`
}

// ─── SPEECH (riconoscimento + sintesi) ───────────────────────
function useSpeech(onTranscript) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(false)
  const recRef = useRef(null)

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if(SpeechRecognition) {
      setSupported(true)
      const rec = new SpeechRecognition()
      rec.lang = 'it-IT'
      rec.continuous = false
      rec.interimResults = false
      rec.onresult = (e) => {
        const text = e.results[0][0].transcript
        onTranscript(text)
        setListening(false)
      }
      rec.onerror = () => setListening(false)
      rec.onend = () => setListening(false)
      recRef.current = rec
    }
  }, [onTranscript])

  const startListening = () => {
    if(!recRef.current || listening) return
    setListening(true)
    recRef.current.start()
  }

  const stopListening = () => {
    recRef.current?.stop()
    setListening(false)
  }

  const speak = (text) => {
    if(!window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'it-IT'
    utt.rate = 1.05
    utt.pitch = 1
    // Preferisci voce italiana se disponibile
    const voices = window.speechSynthesis.getVoices()
    const itVoice = voices.find(v=>v.lang.startsWith('it'))
    if(itVoice) utt.voice = itVoice
    window.speechSynthesis.speak(utt)
  }

  return { listening, supported, startListening, stopListening, speak }
}

// ─── MESSAGGIO CHAT ───────────────────────────────────────────
function ChatMessage({ msg, onApprove, onReject }) {
  const isUser = msg.role === 'user'
  const isSystem = msg.role === 'system'

  return (
    <div style={{
      display: 'flex', gap: '.75rem', marginBottom: '1rem',
      flexDirection: isUser ? 'row-reverse' : 'row',
      alignItems: 'flex-start',
    }}>
      {!isUser && (
        <div style={{width:32,height:32,borderRadius:16,background:'linear-gradient(135deg,var(--gold),#e8c078)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',flexShrink:0}}>
          🤖
        </div>
      )}
      <div style={{
        maxWidth: '78%',
        background: isUser ? 'rgba(200,164,94,.15)' : isSystem ? 'rgba(251,146,60,.08)' : 'var(--s2)',
        border: `1px solid ${isUser ? 'rgba(200,164,94,.3)' : isSystem ? 'rgba(251,146,60,.3)' : 'var(--bd)'}`,
        borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
        padding: '.7rem 1rem',
      }}>
        {/* Testo messaggio */}
        <div style={{fontSize:'.85rem',color:'var(--tx)',lineHeight:1.6,whiteSpace:'pre-wrap'}}>
          {msg.content}
        </div>

        {/* Tool results inline */}
        {msg.toolResults && msg.toolResults.map((tr, i) => (
          <div key={i} style={{marginTop:'.5rem',padding:'.5rem .75rem',background:'rgba(78,142,247,.06)',border:'1px solid rgba(78,142,247,.2)',borderRadius:8,fontSize:'.78rem'}}>
            <div style={{color:'#4e8ef7',fontWeight:600,marginBottom:'.25rem'}}>📊 {tr.tool}</div>
            <pre style={{margin:0,color:'var(--mu)',fontSize:'.72rem',overflow:'auto',maxHeight:200}}>
              {JSON.stringify(tr.result, null, 2)}
            </pre>
          </div>
        ))}

        {/* Piano azioni da approvare */}
        {msg.pendingPlan && (
          <div style={{marginTop:'.75rem',padding:'.75rem',background:'rgba(52,194,122,.06)',border:'1px solid rgba(52,194,122,.25)',borderRadius:8}}>
            <div style={{fontWeight:700,fontSize:'.8rem',color:'#34c27a',marginBottom:'.5rem'}}>📋 Piano di esecuzione</div>
            {msg.pendingPlan.map((step, i) => (
              <div key={i} style={{display:'flex',gap:'.5rem',marginBottom:'.3rem',fontSize:'.78rem'}}>
                <span style={{color:'var(--gold)',flexShrink:0}}>{i+1}.</span>
                <span style={{color:'var(--tx)'}}>{step}</span>
              </div>
            ))}
            <div style={{display:'flex',gap:'.5rem',marginTop:'.75rem'}}>
              <button onClick={()=>onApprove(msg.id)} className="btn" style={{fontSize:'.75rem',padding:'.35rem .8rem'}}>
                ✅ Conferma ed esegui
              </button>
              <button onClick={()=>onReject(msg.id)} className="btn-sec" style={{fontSize:'.75rem',padding:'.35rem .8rem'}}>
                ✕ Annulla
              </button>
            </div>
          </div>
        )}

        {/* Timestamp */}
        <div style={{fontSize:'.65rem',color:'var(--mu)',marginTop:'.35rem',textAlign:isUser?'right':'left'}}>
          {msg.ts}
        </div>
      </div>
    </div>
  )
}

// ─── MODULO PRINCIPALE ────────────────────────────────────────
export function ModuloAIAgent({ utente }) {
  const [societaAttiva, setSocietaAttiva] = useState(null)
  const [societa, setSocieta] = useState([])

  useEffect(() => {
    sb.from('societa').select('id,denominazione,partita_iva,codice_fiscale')
      .order('denominazione').then(({ data }) => {
        setSocieta(data || [])
        if (data?.length) setSocietaAttiva(data[0])
      })
  }, [])
  const [messages, setMessages]     = useState([])   // storia chat
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)
  const [speaking, setSpeaking]     = useState(false)
  const [voiceMode, setVoiceMode]   = useState(false)
  const [pendingTools, setPendingTools] = useState({}) // id → {tools, resolve}
  const bottomRef = useRef()
  const inputRef  = useRef()

  // Scrolls automatico in fondo
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const addMsg = useCallback((role, content, extra = {}) => {
    const id = Date.now() + Math.random()
    const ts = new Date().toLocaleTimeString('it-IT', {hour:'2-digit',minute:'2-digit'})
    setMessages(prev => [...prev, { id, role, content, ts, ...extra }])
    return id
  }, [])

  // Speech
  const handleTranscript = useCallback((text) => {
    setInput(text)
    setTimeout(() => sendMessage(text), 300)
  }, [])

  const { listening, supported, startListening, stopListening, speak } = useSpeech(handleTranscript)

  // Invia messaggio all'agente
  const sendMessage = useCallback(async (textOverride) => {
    const text = textOverride || input.trim()
    if(!text || loading) return
    setInput('')

    // Aggiunge messaggio utente
    addMsg('user', text)
    setLoading(true)

    try {
      // Costruisci storia per API (solo role+content)
      const history = messages
        .filter(m => m.role === 'user' || m.role === 'assistant')
        .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }))
      history.push({ role: 'user', content: text })

      // Prima chiamata API — l'agente ragiona e decide quali tool usare
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 2000,
          system: buildSystemPrompt(societaAttiva),
          tools: TOOLS.map(t => ({
            name: t.name,
            description: t.desc,
            input_schema: {
              type: 'object',
              properties: Object.fromEntries(
                Object.entries(t.params).map(([k,v]) => [k, { type: v.replace('?','').replace('[]','array') === 'string' ? 'string' : v.includes('number') ? 'number' : 'array', description: k }])
              ),
              required: Object.entries(t.params).filter(([k,v])=>!v.includes('?')).map(([k])=>k)
            }
          })),
          messages: history,
        })
      })

      const data = await res.json()
      const blocks = data.content || []

      // Separa testo e tool_use
      const textBlocks   = blocks.filter(b => b.type === 'text')
      const toolUseBlocks = blocks.filter(b => b.type === 'tool_use')

      const agentText = textBlocks.map(b => b.text).join('\n').trim()

      if(toolUseBlocks.length === 0) {
        // Risposta solo testuale
        const msgId = addMsg('assistant', agentText || 'Fatto.')
        if(voiceMode && agentText) speak(agentText.substring(0, 300))
        setLoading(false)
        return
      }

      // Dividi tool in lettura e scrittura
      const toolsLettura   = toolUseBlocks.filter(t => TOOLS.find(tt=>tt.name===t.name)?.tipo === 'lettura')
      const toolsScrittura = toolUseBlocks.filter(t => TOOLS.find(tt=>tt.name===t.name)?.tipo === 'scrittura')

      // Esegui subito i tool di lettura
      const letturResults = []
      for(const tool of toolsLettura) {
        const result = await executeTool(tool.name, tool.input)
        letturResults.push({ tool: tool.name, id: tool.id, result })
      }

      if(toolsScrittura.length === 0) {
        // Solo lettura — fai seconda chiamata con risultati e mostra risposta finale
        const finalRes = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1500,
            system: buildSystemPrompt(societaAttiva),
            messages: [
              ...history,
              { role: 'assistant', content: blocks },
              { role: 'user', content: letturResults.map(r => ({
                  type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result)
                }))
              }
            ],
          })
        })
        const finalData = await finalRes.json()
        const finalText = (finalData.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n')
        addMsg('assistant', finalText, { toolResults: letturResults })
        if(voiceMode) speak(finalText.substring(0, 300))
        setLoading(false)
        return
      }

      // Ci sono tool di scrittura → mostra piano e chiedi conferma
      const piano = toolsScrittura.map(t => {
        const tool = TOOLS.find(tt=>tt.name===t.name)
        return `${tool?.name}: ${JSON.stringify(t.input)}`
      })

      const pianoLeggibile = toolsScrittura.map(t => {
        switch(t.name) {
          case 'contabilizza_documenti': return `Contabilizza ${t.input.documento_ids?.length || '?'} documento/i in prima nota`
          case 'crea_liquidazione_iva':  return `Crea liquidazione IVA ${t.input.tipo_periodo} ${t.input.anno}`
          case 'crea_f24':               return `Genera F24 dalla liquidazione`
          case 'aggiorna_anagrafica_conto': return `Aggiorna conto ${t.input.conto_id}`
          default: return t.name
        }
      })

      const msgId = addMsg('assistant',
        agentText || `Ho bisogno di eseguire ${toolsScrittura.length} operazione/i. Rivedi il piano qui sotto e conferma:`,
        {
          pendingPlan: pianoLeggibile,
          _pendingTools: toolsScrittura,
          _pendingHistory: history,
          _pendingBlocks: blocks,
          _letturResults: letturResults,
        }
      )

      if(voiceMode) speak(`Ho un piano in ${toolsScrittura.length} passi. Vuoi che proceda?`)

    } catch(e) {
      addMsg('assistant', '❌ Errore: ' + e.message)
    }
    setLoading(false)
  }, [input, loading, messages, societaAttiva, voiceMode, speak, addMsg])

  // Approva piano di scrittura
  const handleApprove = useCallback(async (msgId) => {
    const msg = messages.find(m => m.id === msgId)
    if(!msg?._pendingTools) return

    setLoading(true)

    // Aggiorna messaggio — rimuove i pulsanti
    setMessages(prev => prev.map(m => m.id === msgId ? {...m, pendingPlan: null, content: m.content + '\n\n⏳ Esecuzione in corso...'} : m))

    // Esegui tool di scrittura
    const scritturaResults = []
    for(const tool of msg._pendingTools) {
      const result = await executeTool(tool.name, tool.input)
      scritturaResults.push({ tool: tool.name, id: tool.id, result })
    }

    // Tutti i risultati (lettura + scrittura)
    const allResults = [...(msg._letturResults||[]), ...scritturaResults]

    // Chiamata finale per risposta sintetica
    const finalRes = await fetch('/api/claude', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 800,
        system: buildSystemPrompt(societaAttiva),
        messages: [
          ...(msg._pendingHistory||[]),
          { role: 'assistant', content: msg._pendingBlocks || [] },
          { role: 'user', content: allResults.map(r => ({
              type: 'tool_result', tool_use_id: r.id, content: JSON.stringify(r.result)
            }))
          }
        ],
      })
    })
    const finalData = await finalRes.json()
    const finalText = (finalData.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n')

    addMsg('assistant', finalText, { toolResults: scritturaResults })
    if(voiceMode) speak(finalText.substring(0, 300))
    setLoading(false)
  }, [messages, societaAttiva, voiceMode, speak, addMsg])

  // Rifiuta piano
  const handleReject = useCallback((msgId) => {
    setMessages(prev => prev.map(m => m.id === msgId ? {...m, pendingPlan: null, content: m.content + '\n\n❌ Operazione annullata dall\'operatore.'} : m))
    addMsg('assistant', 'Ok, operazione annullata. Posso aiutarti con qualcos\'altro?')
  }, [addMsg])

  // Messaggi suggeriti iniziali
  const SUGGERIMENTI = [
    { ico: '📊', label: 'Statistiche società', cmd: 'Mostrami le statistiche della società attiva' },
    { ico: '📄', label: 'Fatture da contabilizzare', cmd: 'Quanti documenti devo ancora contabilizzare?' },
    { ico: '🧾', label: 'Saldo IVA', cmd: 'Qual è il saldo IVA degli ultimi periodi?' },
    { ico: '🔍', label: 'Cerca cliente', cmd: 'Cerca il cliente' },
    { ico: '📦', label: 'Contabilizza tutto', cmd: 'Contabilizza tutti i documenti in attesa di validazione' },
    { ico: '📋', label: 'Crea liquidazione IVA', cmd: 'Crea la liquidazione IVA del primo trimestre 2024' },
  ]

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 60px)', padding: 0 }}>

      {/* Header */}
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--s1)', flexShrink: 0 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
            <div style={{ width: 36, height: 36, borderRadius: 18, background: 'linear-gradient(135deg,var(--gold),#e8c078)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem' }}>🤖</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>FiscoSim AI</div>
              <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>
                {societaAttiva ? `Operativo su: ${societaAttiva.denominazione}` : '⚠️ Nessuna società'}
                {loading && <span style={{ color: 'var(--gold)', marginLeft: '.5rem' }}>· elaborazione...</span>}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
          <select value={societaAttiva?.id||''} onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s||null)}}
            style={{fontSize:'.78rem',maxWidth:180,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.3rem .5rem',color:'var(--tx)'}}>
            {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
          </select>
          {supported && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem' }}>
              <span style={{ fontSize: '.72rem', color: 'var(--mu)' }}>Voce</span>
              <div onClick={() => setVoiceMode(p => !p)}
                style={{ width: 36, height: 20, borderRadius: 10, background: voiceMode ? 'var(--gold)' : 'var(--bd2)', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
                <div style={{ width: 14, height: 14, borderRadius: 7, background: '#fff', position: 'absolute', top: 3, left: voiceMode ? 19 : 3, transition: 'left .2s' }} />
              </div>
            </div>
          )}
          <button className="btn-sec" style={{ fontSize: '.72rem', padding: '.3rem .6rem' }}
            onClick={() => setMessages([])}>🗑 Pulisci chat</button>
        </div>
      </div>

      {/* Area chat */}
      <div style={{ flex: 1, overflow: 'auto', padding: '1.25rem 1.5rem' }}>

        {/* Benvenuto se chat vuota */}
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', paddingTop: '2rem' }}>
            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🤖</div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '.4rem' }}>Ciao! Sono FiscoSim AI</div>
            <div style={{ fontSize: '.85rem', color: 'var(--mu)', marginBottom: '2rem', maxWidth: 400, margin: '0 auto .75rem' }}>
              Posso leggere i tuoi dati in tempo reale ed eseguire operazioni contabili con la tua supervisione.
              {voiceMode && <span> Parla o scrivi!</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.6rem', maxWidth: 700, margin: '1.5rem auto 0' }}>
              {SUGGERIMENTI.map(s => (
                <button key={s.cmd} onClick={() => sendMessage(s.cmd)}
                  style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 10, padding: '.65rem .85rem', cursor: 'pointer', textAlign: 'left', transition: 'border-color .15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--gold)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--bd)'}>
                  <div style={{ fontSize: '1.2rem', marginBottom: '.25rem' }}>{s.ico}</div>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--tx)' }}>{s.label}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messaggi */}
        {messages.map(msg => (
          <ChatMessage key={msg.id} msg={msg} onApprove={handleApprove} onReject={handleReject} />
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem', alignItems: 'flex-start' }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: 'linear-gradient(135deg,var(--gold),#e8c078)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', flexShrink: 0 }}>🤖</div>
            <div style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: '4px 16px 16px 16px', padding: '.7rem 1rem' }}>
              <div style={{ display: 'flex', gap: '.3rem', alignItems: 'center' }}>
                {[0,1,2].map(i => (
                  <div key={i} style={{ width: 8, height: 8, borderRadius: 4, background: 'var(--gold)', animation: `pulse 1.2s ${i*0.2}s infinite` }} />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--bd)', background: 'var(--s1)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: '.6rem', alignItems: 'flex-end' }}>

          {/* Mic button */}
          <select value={societaAttiva?.id||''} onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s||null)}}
            style={{fontSize:'.78rem',maxWidth:180,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.3rem .5rem',color:'var(--tx)'}}>
            {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
          </select>
          {supported && (
            <button
              onClick={listening ? stopListening : startListening}
              style={{
                width: 44, height: 44, borderRadius: 22, border: 'none', cursor: 'pointer', flexShrink: 0,
                background: listening ? '#e05252' : 'var(--s2)', borderColor: listening ? '#e05252' : 'var(--bd)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem',
                boxShadow: listening ? '0 0 0 4px rgba(224,82,82,.25)' : 'none',
                transition: 'all .2s',
              }}>
              {listening ? '⏹' : '🎤'}
            </button>
          )}

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={listening ? '🎤 Ascolto...' : 'Scrivi o parla... (Invio per inviare, Shift+Invio per andare a capo)'}
            rows={1}
            style={{ flex: 1, resize: 'none', borderRadius: 12, padding: '.65rem 1rem', fontSize: '.85rem', minHeight: 44, maxHeight: 120 }}
            disabled={loading || listening}
          />

          {/* Send button */}
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            className="btn"
            style={{ height: 44, borderRadius: 22, padding: '0 1.2rem', flexShrink: 0 }}>
            {loading ? '⏳' : '▶'}
          </button>
        </div>
        <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.4rem', textAlign: 'center' }}>
          {voiceMode ? '🎤 Modalità vocale attiva — parla o scrivi · ' : ''}
          I tool di lettura si eseguono subito · Le azioni di scrittura richiedono conferma
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: .3; transform: scale(.8); }
          50% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  )
}
