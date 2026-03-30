import { useState, useEffect, useRef, useCallback } from 'react'
import { analyzeWithClaude } from '../../shared/utils/parseDoc'
import { sb } from '../../lib/supabase'

// ─── COSTANTI ────────────────────────────────────────────────
const TIPI_AVVISO = [
  'Comunicazione irregolarità (36-bis)',
  'Comunicazione irregolarità (36-ter)',
  'Avviso bonario',
  'Cartella di pagamento',
  'Accertamento',
  'Atto di recupero',
  'Invito al contraddittorio',
  'Altro',
]

const MODELLI = [
  'red25','red24','red23','red22','red21',
  'irap25','irap24','irap23','irap22',
  '770_25','770_24',
  'iva25','iva24','iva23',
  'Altro',
]

const CONTENUTI = [
  'Acconti non versati',
  'Rate non versate',
  'Errore in dichiarazione',
  'Credito anno precedente',
  'IVA non versata',
  'Ritenute non versate',
  'Manuale',
]

const ESITI = [
  { val: '', label: '— In lavorazione —' },
  { val: 'confermato',     label: '✓ Confermato' },
  { val: 'sgravio_totale', label: '✅ Sgravio totale' },
  { val: 'sgravio_parziale',label: '🟡 Sgravio parziale' },
  { val: 'rateazione',     label: '📅 Rateazione' },
  { val: 'chiuso',         label: '🔒 Chiuso' },
]

const fmt = n => n != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(n) : '—'
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const today = () => new Date().toISOString().split('T')[0]

const ESITO_COLORS = {
  '':               'var(--mu)',
  confermato:       '#e05252',
  sgravio_totale:   '#34c27a',
  sgravio_parziale: '#f59e0b',
  rateazione:       '#4e8ef7',
  chiuso:           '#7a8599',
}


// ─── MODAL IMPORT PDF AVVISO ─────────────────────────────────
function ModalImportPDFAvviso({ clienti, utenti, onSave, onClose }) {
  const [file, setFile]       = useState(null)
  const [parsing, setParsing] = useState(false)
  const [parsed, setParsed]   = useState(null)  // dati estratti
  const [form, setForm]       = useState(null)   // form pre-compilato
  const [saving, setSaving]   = useState(false)
  const fileRef = useRef()
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleFile = async (f) => {
    if (!f) return
    const ext = f.name.toLowerCase()
    if (!ext.endsWith('.pdf') && !f.type?.startsWith('image/')) {
      return alert('Carica un PDF o un\'immagine')
    }
    setFile(f)
    setParsing(true)
    try {
      const systemPrompt = 'Sei un esperto commercialista italiano specializzato in documenti ADE. Estrai i dati richiesti con precisione. Rispondi SOLO con JSON valido, zero testo aggiuntivo.'

      const userPrompt = `Analizza questo documento dell\'Agenzia delle Entrate italiana ed estrai TUTTI i dati presenti.
Rispondi SOLO con JSON valido, null per campi non trovati:
{
  "tipo_avviso": "Cartella di pagamento | Avviso bonario | Comunicazione irregolarità (36-bis) | Comunicazione irregolarità (36-ter) | Accertamento | Atto di recupero | Altro",
  "numero_atto": "numero cartella o codice atto",
  "numero_comunicazione": "numero comunicazione se presente",
  "protocollo_telematico": "protocollo telematico se presente",
  "codice_fiscale": "CF o PIVA destinatario — solo cifre per PIVA 11 char, alfanumerico per CF 16 char",
  "destinatario": "ragione sociale o nome completo",
  "indirizzo": "indirizzo destinatario",
  "citta": "città",
  "cap": "CAP",
  "provincia": "sigla 2 lettere",
  "importo": 0.00,
  "periodo_imposta_inizio": "YYYY-MM-DD",
  "periodo_imposta_fine": "YYYY-MM-DD",
  "anno_riferimento": 2024,
  "modello": "red24 | irap24 | iva24 | 770_24 | altro",
  "contenuto": "Acconti non versati | Rate non versate | Errore in dichiarazione | Credito anno precedente | IVA non versata | Ritenute non versate | Manuale",
  "data_notifica": "YYYY-MM-DD",
  "data_scadenza": "YYYY-MM-DD obbligatorio — se è una cartella di pagamento calcola data_notifica + 60 giorni e scrivi la data esatta nel formato YYYY-MM-DD, NON scrivere testo descrittivo",
  "direttore_centrale": "nome se presente",
  "soggetto_trasmittente": "nome se presente",
  "variazioni_crediti_imposta": [{"codice_credito":"","descrizione_credito":"","importo_dichiarato":0,"importo_variato":0}],
  "codici_tributo": ["7146","7147"],
  "note_estratte": "altre info rilevanti"
}`

      const estratto = await analyzeWithClaude(f, systemPrompt, userPrompt, {
        maxTokens: 1500,
        onProgress: msg => setParsing(msg),
      })

      const preform = {
        tipo_avviso:              estratto.tipo_avviso          || 'Cartella di pagamento',
        modello:                  estratto.modello               || '',
        importo:                  estratto.importo               || '',
        contenuto:                estratto.contenuto             || 'Manuale',
        data_scadenza:            estratto.data_scadenza         || '',
        data_ricezione_studio:    new Date().toISOString().split('T')[0],
        data_ricezione_cliente:   '',
        attivita:                 '',
        esito:                    '',
        responsabile_id:          '',
        note:                     estratto.note_estratte         || '',
        cliente_id:               '',
        cliente_nome:             estratto.destinatario          || '',
        _cf_estratto:             estratto.codice_fiscale        || '',
        _warnings:                [],
        _extra: {
          numero_comunicazione:   estratto.numero_comunicazione  || null,
          protocollo_telematico:  estratto.protocollo_telematico || null,
          numero_atto:            estratto.numero_atto           || null,
          periodo_imposta_inizio: estratto.periodo_imposta_inizio|| null,
          periodo_imposta_fine:   estratto.periodo_imposta_fine  || null,
          indirizzo:              estratto.indirizzo             || null,
          citta:                  estratto.citta                 || null,
          cap:                    estratto.cap                   || null,
          provincia:              estratto.provincia             || null,
          direttore_centrale:     estratto.direttore_centrale    || null,
          soggetto_trasmittente:  estratto.soggetto_trasmittente || null,
          variazioni_crediti:     estratto.variazioni_crediti_imposta || [],
          codici_tributo:         estratto.codici_tributo        || [],
        }
      }

      // Auto-match cliente per CF/PIVA
      const cf = estratto.codice_fiscale
      if (cf && clienti.length) {
        const match = clienti.find(cl =>
          cl.codice_fiscale === cf || cl.partita_iva === cf
        )
        if (match) {
          preform.cliente_id   = match.id
          preform.cliente_nome = match.ragione_sociale || `${match.nome} ${match.cognome||''}`.trim()
        } else {
          preform._warnings = [`CF/PIVA ${cf} non trovato tra i clienti — seleziona manualmente`]
        }
      }

      setParsed(estratto)
      setForm(preform)
    } catch (e) {
      alert('Errore analisi: ' + e.message)
    }
    setParsing(false)
  }


  const handleSave = async () => {
    if (!form.tipo_avviso) return alert('Tipo avviso obbligatorio')
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:660}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📄 Import PDF Avviso ADE</div>
          <div className="modal-sub">Carica cartella, avviso bonario, comunicazione ADE</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{maxHeight:'75vh',overflowY:'auto'}}>
          {!file ? (
            <>
              <div className="upload-zone" onClick={()=>fileRef.current.click()} style={{cursor:'pointer',marginBottom:'1rem'}}>
                <div className="upload-zone-ico">📄</div>
                <div className="upload-zone-t">Carica PDF avviso ADE</div>
                <div className="upload-zone-s">Cartella di pagamento, avviso bonario, comunicazione irregolarità...</div>
              </div>
              <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png" hidden onChange={e=>handleFile(e.target.files?.[0])}/>
            </>
          ) : (parsing === true || typeof parsing === 'string') ? (
            <div style={{textAlign:'center',padding:'2rem',color:'var(--mu)'}}>
              <div style={{fontSize:'2rem',marginBottom:'.75rem'}}>⏳</div>
              <div>{typeof parsing === 'string' ? parsing : 'Lettura documento in corso...'}</div>
            </div>
          ) : form && (
            <>
              {/* Alert warnings */}
              {form._warnings?.length > 0 && (
                <div className="alert alert-warn" style={{marginBottom:'1rem',fontSize:'.78rem'}}>
                  ⚠️ {form._warnings.join(' · ')}
                </div>
              )}
              {/* Match cliente */}
              {form._cf_estratto && (
                <div style={{padding:'.5rem .75rem',background:'rgba(78,142,247,.08)',border:'1px solid rgba(78,142,247,.2)',borderRadius:7,marginBottom:'.75rem',fontSize:'.78rem'}}>
                  CF estratto: <code style={{color:'var(--gold)'}}>{form._cf_estratto}</code>
                  {form.cliente_id
                    ? <span style={{color:'#34c27a',marginLeft:'.5rem'}}>✓ Cliente trovato: <strong>{form.cliente_nome}</strong></span>
                    : <span style={{color:'#f59e0b',marginLeft:'.5rem'}}>⚠️ Nessun cliente con questo CF — seleziona manualmente</span>
                  }
                </div>
              )}
              {/* Pannello dati AI estratti */}
              {form._extra && (form._extra.variazioni_crediti?.length > 0 || form._extra.numero_comunicazione) && (
                <div style={{marginBottom:'1rem',padding:'.75rem',background:'rgba(78,142,247,.06)',border:'1px solid rgba(78,142,247,.2)',borderRadius:8}}>
                  <div style={{fontWeight:700,fontSize:'.78rem',color:'#4e8ef7',marginBottom:'.5rem'}}>📊 Dati estratti AI</div>
                  {form._extra.numero_comunicazione&&<div style={{fontSize:'.73rem',color:'var(--mu)'}}>N° comunicazione: <code style={{color:'var(--tx)'}}>{form._extra.numero_comunicazione}</code></div>}
                  {form._extra.numero_atto&&<div style={{fontSize:'.73rem',color:'var(--mu)'}}>N° atto/cartella: <code style={{color:'var(--tx)'}}>{form._extra.numero_atto}</code></div>}
                  {form._extra.periodo_imposta_inizio&&<div style={{fontSize:'.73rem',color:'var(--mu)'}}>Periodo imposta: {form._extra.periodo_imposta_inizio} → {form._extra.periodo_imposta_fine}</div>}
                  {form._extra.soggetto_trasmittente&&<div style={{fontSize:'.73rem',color:'var(--mu)'}}>Trasmittente: {form._extra.soggetto_trasmittente}</div>}
                  {form._extra.variazioni_crediti?.length > 0 && (
                    <div style={{marginTop:'.5rem'}}>
                      <div style={{fontSize:'.72rem',fontWeight:600,color:'var(--mu)',marginBottom:'.3rem'}}>Variazioni crediti:</div>
                      {form._extra.variazioni_crediti.map((v,i)=>(
                        <div key={i} style={{fontSize:'.71rem',color:'var(--mu)',display:'flex',gap:'.5rem'}}>
                          <code style={{color:'var(--gold)'}}>{v.codice_credito}</code>
                          <span>{v.descrizione_credito}</span>
                          <span style={{marginLeft:'auto',color:'#e05252'}}>dichiarato: {v.importo_dichiarato} → variato: {v.importo_variato}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {form._extra.codici_tributo?.length > 0 && (
                    <div style={{fontSize:'.72rem',color:'var(--mu)',marginTop:'.3rem'}}>Codici tributo: {form._extra.codici_tributo.join(', ')}</div>
                  )}
                </div>
              )}

              {/* Form dati estratti */}
              <div className="form-grid">
                <div className="fg full">
                  <label>Cliente *</label>
                  <select value={form.cliente_id} onChange={e=>{
                    const c=clienti.find(x=>x.id===e.target.value)
                    up('cliente_id',e.target.value)
                    up('cliente_nome',c?(c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()):'')
                  }}>
                    <option value="">— Seleziona cliente —</option>
                    {clienti.map(c=><option key={c.id} value={c.id}>{c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Tipo avviso</label>
                  <select value={form.tipo_avviso} onChange={e=>up('tipo_avviso',e.target.value)}>
                    {TIPI_AVVISO.map(t=><option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Modello</label>
                  <select value={form.modello||''} onChange={e=>up('modello',e.target.value)}>
                    <option value="">— Non rilevato —</option>
                    {MODELLI.map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Importo (€)</label>
                  <input type="number" step="0.01" value={form.importo} onChange={e=>up('importo',e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Contenuto</label>
                  <select value={form.contenuto} onChange={e=>up('contenuto',e.target.value)}>
                    {CONTENUTI.map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Data scadenza</label>
                  <input type="date" value={form.data_scadenza} onChange={e=>up('data_scadenza',e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Data ricezione studio</label>
                  <input type="date" value={form.data_ricezione_studio} onChange={e=>up('data_ricezione_studio',e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Responsabile</label>
                  <select value={form.responsabile_id} onChange={e=>up('responsabile_id',e.target.value)}>
                    <option value="">— Non assegnato —</option>
                    {utenti.map(u=><option key={u.id} value={u.id}>{u.nome} {u.cognome||''}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}
        </div>
        {form && !parsing && (
          <div className="modal-foot">
            <button className="btn-sec" onClick={()=>{setFile(null);setParsed(null);setForm(null)}}>← Ricarica</button>
            <button className="btn-sec" onClick={onClose}>Annulla</button>
            <button className="btn" disabled={saving||!form.cliente_id} onClick={handleSave}>
              {saving?'⏳ Salvo...':'💾 Crea avviso'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── MODAL CIVIS AI ──────────────────────────────────────────
function ModalCivisAI({ avviso, onClose }) {
  const [descrizione, setDescrizione] = useState('')
  const [testo, setTesto] = useState('')
  const [loading, setLoading] = useState(false)
  const [listening, setListening] = useState(false)
  const recRef = useRef()

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SR) {
      const rec = new SR()
      rec.lang = 'it-IT'
      rec.continuous = false
      rec.onresult = e => { setDescrizione(p => p + ' ' + e.results[0][0].transcript); setListening(false) }
      rec.onerror = () => setListening(false)
      rec.onend = () => setListening(false)
      recRef.current = rec
    }
  }, [])

  const genera = async () => {
    if (!descrizione.trim()) return alert('Inserisci una descrizione della situazione')
    setLoading(true)
    try {
      const res = await fetch('/api/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 1500,
          system: `Sei un esperto commercialista italiano specializzato nella gestione degli avvisi ADE e nella redazione di istanze CIVIS per conto dei contribuenti. Redigi testi formali, precisi e professionali in italiano.`,
          messages: [{
            role: 'user',
            content: `Devi redigere un testo per un'istanza CIVIS da inviare all'Agenzia delle Entrate.

DATI AVVISO:
- Tipo: ${avviso.tipo_avviso || 'non specificato'}
- Modello dichiarativo: ${avviso.modello || 'non specificato'}
- Anno imposta: ${avviso.modello ? avviso.modello.replace(/\D/g,'') : 'non specificato'}
- Importo contestato: ${avviso.importo ? fmt(avviso.importo) : 'non specificato'}
- Contenuto: ${avviso.contenuto || 'non specificato'}
- Cliente/Contribuente: ${avviso.cliente_nome || 'contribuente'}

DESCRIZIONE DELL'OPERATORE:
${descrizione}

Redigi un testo CIVIS completo, formale e professionale che:
1. Si riferisce specificamente all'avviso indicato
2. Spiega la situazione descritta dall'operatore
3. Chiede lo sgravio o la rettifica motivata
4. Usa linguaggio tecnico-fiscale appropriato
5. È pronto per essere copiato e incollato nel portale CIVIS dell'ADE

Rispondi SOLO con il testo CIVIS, senza preamboli o spiegazioni.`
          }]
        })
      })
      const data = await res.json()
      setTesto(data.content?.[0]?.text || '')
    } catch (e) {
      alert('Errore: ' + e.message)
    }
    setLoading(false)
  }

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">📝 CIVIS AI</div>
          <div className="modal-sub">Genera testo istanza CIVIS per {avviso.cliente_nome} · {avviso.tipo_avviso}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!testo ? (
            <>
              <div style={{ fontSize: '.82rem', color: 'var(--mu)', marginBottom: '.75rem' }}>
                Descrivi brevemente la situazione (es: "acconti 2024 già versati in data xx, ho i bonifici, errore nel calcolo da parte dell'ADE")
              </div>
              <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.5rem' }}>
                <textarea
                  value={descrizione}
                  onChange={e => setDescrizione(e.target.value)}
                  rows={4}
                  placeholder="Descrivi la situazione da inserire nel CIVIS..."
                  style={{ flex: 1, resize: 'vertical' }}
                  autoFocus
                />
                {recRef.current && (
                  <button
                    onClick={() => { if (listening) { recRef.current.stop(); setListening(false) } else { recRef.current.start(); setListening(true) } }}
                    style={{ width: 44, alignSelf: 'stretch', borderRadius: 8, border: `2px solid ${listening ? '#e05252' : 'var(--bd)'}`, background: listening ? 'rgba(224,82,82,.15)' : 'var(--s2)', cursor: 'pointer', fontSize: '1.3rem', flexShrink: 0 }}>
                    {listening ? '⏹' : '🎤'}
                  </button>
                )}
              </div>
              {listening && <div style={{ fontSize: '.75rem', color: '#e05252', marginBottom: '.5rem' }}>🔴 Ascolto in corso...</div>}
            </>
          ) : (
            <>
              <div style={{ fontSize: '.78rem', color: '#34c27a', marginBottom: '.5rem', fontWeight: 600 }}>✅ Testo CIVIS generato — copia e incolla nel portale ADE</div>
              <textarea
                value={testo}
                onChange={e => setTesto(e.target.value)}
                rows={16}
                style={{ width: '100%', fontSize: '.82rem', lineHeight: 1.6, resize: 'vertical' }}
              />
            </>
          )}
        </div>
        <div className="modal-foot">
          {!testo ? (
            <>
              <button className="btn-sec" onClick={onClose}>Annulla</button>
              <button className="btn" disabled={loading || !descrizione.trim()} onClick={genera}>
                {loading ? '⏳ Generazione...' : '🤖 Genera CIVIS'}
              </button>
            </>
          ) : (
            <>
              <button className="btn-sec" onClick={() => setTesto('')}>← Riscrivi</button>
              <button className="btn-sec" onClick={onClose}>Chiudi</button>
              <button className="btn" onClick={() => { navigator.clipboard.writeText(testo); alert('Copiato negli appunti!') }}>
                📋 Copia testo
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MODAL ANALISI AI ────────────────────────────────────────
function ModalAnalisiAI({ avviso, onClose }) {
  const [analisi, setAnalisi] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const analizza = async () => {
      try {
        const res = await fetch('/api/claude', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 1200,
            system: 'Sei un esperto commercialista italiano. Rispondi in italiano con analisi precise e pratiche.',
            messages: [{
              role: 'user',
              content: `Analizza questo avviso dell'Agenzia delle Entrate e dimmi esattamente cosa devo verificare/controllare per gestirlo correttamente.

DATI AVVISO:
- Tipo: ${avviso.tipo_avviso}
- Modello: ${avviso.modello}
- Importo: ${avviso.importo ? fmt(avviso.importo) : 'non specificato'}
- Contenuto: ${avviso.contenuto}
- Data scadenza: ${fmtDate(avviso.data_scadenza)}
- Cliente: ${avviso.cliente_nome || 'non specificato'}

Fornisci:
1. **Cosa verificare** — lista precisa di cosa controllare (es. F24 acconti versati, dichiarazione anno X, ecc.)
2. **Documenti da reperire** — cosa serve per rispondere
3. **Scadenze critiche** — tempi di risposta e rischi
4. **Azioni consigliate** — procedura step by step
5. **Probabilità di sgravio** — valutazione se ci sono margini

Sii specifico e pratico, non generico.`
            }]
          })
        })
        const data = await res.json()
        setAnalisi(data.content?.[0]?.text || 'Nessuna analisi disponibile')
      } catch (e) {
        setAnalisi('Errore: ' + e.message)
      }
      setLoading(false)
    }
    analizza()
  }, [])

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">🔍 Analisi AI</div>
          <div className="modal-sub">{avviso.tipo_avviso} · {avviso.modello} · {avviso.cliente_nome}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--mu)' }}>
              <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>🤖</div>
              <div>Analisi in corso...</div>
            </div>
          ) : (
            <div style={{ fontSize: '.83rem', lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--tx)' }}>
              {analisi}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Chiudi</button>
          {!loading && (
            <button className="btn" onClick={() => navigator.clipboard.writeText(analisi).then(() => alert('Copiato!'))}>
              📋 Copia analisi
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── MODAL AVVISO (nuovo / modifica) ─────────────────────────
function ModalAvviso({ avviso, clienti, utenti, onSave, onClose }) {
  const isNew = !avviso?.id
  const [form, setForm] = useState({
    cliente_id: '', cliente_nome: '',
    tipo_avviso: TIPI_AVVISO[0],
    modello: MODELLI[0],
    importo: '',
    contenuto: CONTENUTI[0],
    data_ricezione_cliente: today(),
    data_scadenza: '',
    data_ricezione_studio: today(),
    attivita: '',
    esito: '',
    responsabile_id: '',
    note: '',
    ...avviso,
  })
  const [saving, setSaving] = useState(false)
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    if (!form.cliente_id && !form.cliente_nome) return alert('Seleziona o inserisci il cliente')
    if (!form.tipo_avviso) return alert('Tipo avviso obbligatorio')
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 660 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">{isNew ? '➕ Nuovo Avviso ADE' : '✏️ Modifica Avviso'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="form-grid">
            {/* Cliente */}
            <div className="fg full">
              <label>Cliente *</label>
              <select value={form.cliente_id} onChange={e => {
                const c = clienti.find(x => x.id === e.target.value)
                up('cliente_id', e.target.value)
                up('cliente_nome', c ? (c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()) : '')
              }}>
                <option value="">— Seleziona cliente —</option>
                {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}</option>)}
              </select>
            </div>

            {/* Tipo avviso e modello */}
            <div className="fg">
              <label>Tipo avviso *</label>
              <select value={form.tipo_avviso} onChange={e => up('tipo_avviso', e.target.value)}>
                {TIPI_AVVISO.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Modello dichiarativo</label>
              <select value={form.modello} onChange={e => up('modello', e.target.value)}>
                {MODELLI.map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
              </select>
            </div>

            {/* Importo e contenuto */}
            <div className="fg">
              <label>Importo (€)</label>
              <input type="number" step="0.01" value={form.importo} onChange={e => up('importo', e.target.value)} placeholder="0.00" />
            </div>
            <div className="fg">
              <label>Contenuto</label>
              <select value={form.contenuto} onChange={e => up('contenuto', e.target.value)}>
                {CONTENUTI.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Date */}
            <div className="fg">
              <label>Data ricezione cliente</label>
              <input type="date" value={form.data_ricezione_cliente} onChange={e => up('data_ricezione_cliente', e.target.value)} />
            </div>
            <div className="fg">
              <label>Data scadenza</label>
              <input type="date" value={form.data_scadenza} onChange={e => up('data_scadenza', e.target.value)} />
            </div>
            <div className="fg">
              <label>Data ricezione studio</label>
              <input type="date" value={form.data_ricezione_studio} onChange={e => up('data_ricezione_studio', e.target.value)} />
            </div>

            {/* Responsabile ed esito */}
            <div className="fg">
              <label>Responsabile</label>
              <select value={form.responsabile_id} onChange={e => up('responsabile_id', e.target.value)}>
                <option value="">— Non assegnato —</option>
                {utenti.map(u => <option key={u.id} value={u.id}>{u.nome} {u.cognome || ''}</option>)}
              </select>
            </div>
            <div className="fg">
              <label>Esito</label>
              <select value={form.esito} onChange={e => up('esito', e.target.value)}>
                {ESITI.map(e => <option key={e.val} value={e.val}>{e.label}</option>)}
              </select>
            </div>

            {/* Attività svolta */}
            <div className="fg full">
              <label>Attività svolta <span style={{ fontWeight: 400, color: 'var(--mu)', fontSize: '.72rem' }}>(es. CIVIS inviato il 15/03/2025)</span></label>
              <input value={form.attivita} onChange={e => up('attivita', e.target.value)} placeholder="Descrizione attività svolta" />
            </div>

            {/* Note */}
            <div className="fg full">
              <label>Note</label>
              <textarea value={form.note} onChange={e => up('note', e.target.value)} rows={2} style={{ resize: 'vertical' }} />
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving} onClick={handleSave}>
            {saving ? '⏳ Salvo...' : '💾 Salva'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── MODULO PRINCIPALE ────────────────────────────────────────
export function ModuloAgeCon({ utente, ruolo }) {
  const [avvisi, setAvvisi]         = useState([])
  const [clienti, setClienti]       = useState([])
  const [utenti, setUtenti]         = useState([])
  const [loading, setLoading]       = useState(true)
  const [modalAvviso, setModalAvviso] = useState(null)   // null | {} | avviso
  const [modalCivis, setModalCivis]   = useState(null)
  const [modalImportPDF, setModalImportPDF] = useState(false)
  const [modalAnalisi, setModalAnalisi] = useState(null)
  const [filtroEsito, setFiltroEsito]   = useState('aperti')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [search, setSearch]         = useState('')

  const carica = useCallback(async () => {
    setLoading(true)
    const [{ data: av }, { data: cl }, { data: ut }] = await Promise.all([
      sb.from('avvisi_ade').select('*').order('data_scadenza', { ascending: true }),
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale').eq('attivo', true).order('nome'),
      sb.from('utenti_studio').select('id,nome,cognome,ruolo').eq('attivo', true),
    ])
    setAvvisi(av || [])
    setClienti(cl || [])
    setUtenti(ut || [])
    setLoading(false)
  }, [])

  useEffect(() => { carica() }, [carica])

  // Calcola codice progressivo studio
  const nextCodice = () => {
    if (!avvisi.length) return 'AGE-0001'
    const nums = avvisi.map(a => parseInt((a.codice_studio || '').replace(/\D/g, '') || '0'))
    return `AGE-${String(Math.max(...nums) + 1).padStart(4, '0')}`
  }

  const salvaAvviso = async (form) => {
    // Rimuovi campi interni (prefisso _) che non sono colonne DB
    const { _cf_estratto, _warnings, ...formClean } = form
    const nullDate = v => { if(!v) return null; const s=String(v).trim(); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null; }
    const { _extra, ...formNoExtra } = formClean
    const rec = {
      ...formNoExtra,
      importo:               parseFloat(formNoExtra.importo) || null,
      codice_studio:         formNoExtra.codice_studio || nextCodice(),
      cliente_id:            formNoExtra.cliente_id || null,
      responsabile_id:       formNoExtra.responsabile_id || null,
      data_scadenza:         nullDate(formNoExtra.data_scadenza),
      data_ricezione_cliente:nullDate(formNoExtra.data_ricezione_cliente),
      data_ricezione_studio: nullDate(formNoExtra.data_ricezione_studio),
      modello:               formNoExtra.modello || null,
      esito:                 formNoExtra.esito || null,
      attivita:              formNoExtra.attivita || null,
      note:                  formNoExtra.note || null,
      dati_estratti:         _extra ? JSON.stringify(_extra) : null,
    }
    if (form.id) {
      const {error:ue} = await sb.from('avvisi_ade').update(rec).eq('id', form.id)
      if(ue) { alert('Errore update: '+ue.message+' | '+ue.details); return; }
    } else {
      const {error:ie} = await sb.from('avvisi_ade').insert([rec])
      if(ie) { alert('Errore insert: '+ie.message+' | '+ie.details+' | hint: '+ie.hint); return; }
    }
    setModalAvviso(null)
    carica()
  }

  const eliminaAvviso = async (id) => {
    if (!confirm('Eliminare questo avviso?')) return
    await sb.from('avvisi_ade').delete().eq('id', id)
    carica()
  }

  // Filtri
  const filtered = avvisi.filter(a => {
    if (filtroEsito === 'aperti' && ['chiuso', 'sgravio_totale'].includes(a.esito)) return false
    if (filtroEsito === 'chiusi' && !['chiuso', 'sgravio_totale'].includes(a.esito)) return false
    if (filtroCliente && a.cliente_id !== filtroCliente) return false
    if (search) {
      const hay = `${a.cliente_nome} ${a.tipo_avviso} ${a.modello} ${a.codice_studio}`.toLowerCase()
      if (!search.toLowerCase().split(' ').every(w => hay.includes(w))) return false
    }
    return true
  })

  // Stats
  const totImporto  = avvisi.filter(a => !['chiuso','sgravio_totale'].includes(a.esito)).reduce((s, a) => s + (a.importo || 0), 0)
  const inScadenza  = avvisi.filter(a => {
    if (!a.data_scadenza || ['chiuso','sgravio_totale'].includes(a.esito)) return false
    const diff = (new Date(a.data_scadenza) - new Date()) / 86400000
    return diff >= 0 && diff <= 30
  }).length
  const senzaEsito = avvisi.filter(a => !a.esito).length

  // Colore riga per scadenza
  const rowColor = (a) => {
    if (['chiuso','sgravio_totale'].includes(a.esito)) return 'rgba(52,194,122,.04)'
    if (!a.data_scadenza) return 'transparent'
    const diff = (new Date(a.data_scadenza) - new Date()) / 86400000
    if (diff < 0)  return 'rgba(224,82,82,.08)'
    if (diff <= 7) return 'rgba(224,82,82,.05)'
    if (diff <= 30) return 'rgba(245,158,11,.05)'
    return 'transparent'
  }

  return (
    <div className="page">
      {/* Modali */}
      {modalAvviso !== null && (
        <ModalAvviso
          avviso={modalAvviso}
          clienti={clienti}
          utenti={utenti}
          onSave={salvaAvviso}
          onClose={() => setModalAvviso(null)}
        />
      )}
      {modalCivis && <ModalCivisAI avviso={modalCivis} onClose={() => setModalCivis(null)} />}
      {modalImportPDF && <ModalImportPDFAvviso clienti={clienti} utenti={utenti} onSave={async(form)=>{await salvaAvviso(form);setModalImportPDF(false);}} onClose={()=>setModalImportPDF(false)}/>}
      {modalAnalisi && <ModalAnalisiAI avviso={modalAnalisi} onClose={() => setModalAnalisi(null)} />}

      {/* Header */}
      <div className="page-hdr">
        <div>
          <div className="page-title">⚡ AgeCon — Avvisi ADE</div>
          <div className="page-sub">Gestione comunicazioni e avvisi Agenzia delle Entrate · AI-assisted</div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          <button className="btn-sec" onClick={() => setModalImportPDF(true)}>📄 Import PDF</button>
          <button className="btn" onClick={() => setModalAvviso({})}>➕ Nuovo avviso</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        <div className="stat-card">
          <div className="stat-val" style={{ color: '#e05252' }}>{avvisi.filter(a => !['chiuso','sgravio_totale'].includes(a.esito)).length}</div>
          <div className="stat-lbl">Avvisi aperti</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color: '#f59e0b' }}>{inScadenza}</div>
          <div className="stat-lbl">In scadenza 30gg</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color: 'var(--gold)' }}>{fmt(totImporto)}</div>
          <div className="stat-lbl">Importo totale aperto</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{ color: avvisi.filter(a => ['chiuso','sgravio_totale'].includes(a.esito)).length > 0 ? '#34c27a' : 'var(--mu)' }}>
            {avvisi.filter(a => ['chiuso','sgravio_totale'].includes(a.esito)).length}
          </div>
          <div className="stat-lbl">Chiusi / Sgravati</div>
        </div>
      </div>

      {/* Filtri */}
      <div style={{ display: 'flex', gap: '.6rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          placeholder="🔍 Cerca cliente, tipo avviso, codice..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200 }}
        />
        <select value={filtroEsito} onChange={e => setFiltroEsito(e.target.value)}>
          <option value="tutti">Tutti gli stati</option>
          <option value="aperti">Solo aperti</option>
          <option value="chiusi">Solo chiusi/sgravati</option>
        </select>
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ minWidth: 180 }}>
          <option value="">Tutti i clienti</option>
          {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale || `${c.nome} ${c.cognome||''}`.trim()}</option>)}
        </select>
      </div>

      {/* Lista avvisi */}
      {loading ? <div className="loading">⏳ Caricamento...</div>
        : filtered.length === 0 ? (
          <div className="empty">
            <div className="empty-ico">⚡</div>
            <div className="empty-t">Nessun avviso</div>
            <div className="empty-s">Clicca "Nuovo avviso" per inserire manualmente o importa dal Document Hub</div>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead>
                <tr>
                  <th style={{width:80}}>Codice</th>
                  <th style={{minWidth:140}}>Cliente</th>
                  <th style={{minWidth:160}}>Tipo avviso</th>
                  <th style={{width:80}}>Modello</th>
                  <th style={{width:100}}>Importo</th>
                  <th style={{width:110}}>Scadenza</th>
                  <th style={{width:90}}>Ric. Cliente</th>
                  <th style={{width:90}}>Ric. Studio</th>
                  <th style={{minWidth:130}}>Contenuto</th>
                  <th style={{minWidth:140}}>Attività svolta</th>
                  <th style={{width:120}}>Esito</th>
                  <th style={{width:80}}>Resp.</th>
                  <th style={{width:130}}>Azioni AI</th>
                  <th style={{width:80}}>Modifica</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(a => {
                  const diffGiorni = a.data_scadenza ? Math.ceil((new Date(a.data_scadenza) - new Date()) / 86400000) : null
                  const resp = utenti.find(u => u.id === a.responsabile_id)
                  const isChiuso = ['chiuso','sgravio_totale'].includes(a.esito)
                  return (
                    <tr key={a.id} style={{ background: rowColor(a) }}>
                      <td><code style={{ fontSize: '.72rem', color: 'var(--gold)' }}>{a.codice_studio || '—'}</code></td>
                      <td>
                        <div style={{ fontWeight: 600, fontSize: '.82rem' }}>{a.cliente_nome || '—'}</div>
                        {a.note && <div style={{fontSize:'.65rem',color:'var(--mu)',marginTop:'.1rem',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={a.note}>📝 {a.note}</div>}
                      </td>
                      <td style={{ fontSize: '.78rem' }}>{a.tipo_avviso}</td>
                      <td>
                        {a.modello && <span className="bdg" style={{ background: 'rgba(78,142,247,.15)', color: '#4e8ef7', fontSize: '.7rem' }}>{a.modello.toUpperCase()}</span>}
                      </td>
                      <td style={{ fontWeight: 700, color: 'var(--gld2)', fontSize: '.82rem' }}>{fmt(a.importo)}</td>
                      <td>
                        {a.data_scadenza ? (
                          <div>
                            <div style={{ fontSize: '.78rem', fontWeight: 600 }}>{fmtDate(a.data_scadenza)}</div>
                            {!isChiuso && diffGiorni !== null && (
                              <div style={{ fontSize: '.65rem', color: diffGiorni < 0 ? '#e05252' : diffGiorni <= 7 ? '#f59e0b' : diffGiorni <= 30 ? '#fb923c' : 'var(--mu)', fontWeight: diffGiorni <= 7 ? 700 : 400 }}>
                                {diffGiorni < 0 ? `⚠️ scaduto ${Math.abs(diffGiorni)}gg fa` : diffGiorni === 0 ? '🔴 oggi!' : `${diffGiorni}gg`}
                              </div>
                            )}
                          </div>
                        ) : <span style={{color:'var(--mu)',fontSize:'.72rem'}}>—</span>}
                      </td>
                      <td style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{fmtDate(a.data_ricezione_cliente)}</td>
                      <td style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{fmtDate(a.data_ricezione_studio)}</td>
                      <td style={{ fontSize: '.75rem' }}>{a.contenuto || '—'}</td>
                      <td>
                        {a.attivita
                          ? <div style={{fontSize:'.73rem',color:'var(--tx)',maxWidth:160}}>{a.attivita}</div>
                          : <span style={{color:'var(--mu)',fontSize:'.72rem'}}>—</span>}
                      </td>
                      <td>
                        <span style={{ fontSize: '.72rem', fontWeight: 600, color: ESITO_COLORS[a.esito || ''] }}>
                          {ESITI.find(e => e.val === (a.esito || ''))?.label || '—'}
                        </span>
                      </td>
                      <td style={{ fontSize: '.72rem', color: 'var(--mu)' }}>{resp ? resp.nome : '—'}</td>
                      <td>
                        <div style={{display:'flex',gap:'.3rem'}}>
                          <button
                            onClick={() => setModalAnalisi({ ...a, cliente_nome: a.cliente_nome })}
                            style={{fontSize:'.68rem',padding:'.25rem .5rem',background:'rgba(78,142,247,.12)',border:'1px solid rgba(78,142,247,.3)',borderRadius:6,color:'#4e8ef7',cursor:'pointer',whiteSpace:'nowrap'}}
                            title="Analizza con AI cosa controllare">
                            🔍 Analizza
                          </button>
                          <button
                            onClick={() => setModalCivis({ ...a, cliente_nome: a.cliente_nome })}
                            style={{fontSize:'.68rem',padding:'.25rem .5rem',background:'rgba(52,194,122,.1)',border:'1px solid rgba(52,194,122,.3)',borderRadius:6,color:'#34c27a',cursor:'pointer',whiteSpace:'nowrap'}}
                            title="Genera testo CIVIS con AI">
                            📝 CIVIS
                          </button>
                        </div>
                      </td>
                      <td>
                        <div className="tbl-actions">
                          <button className="btn-icon" title="Modifica" onClick={() => setModalAvviso(a)}>✏️</button>
                          <button className="btn-icon" title="Elimina" style={{ borderColor: 'rgba(224,82,82,.3)', color: '#ff8585' }} onClick={() => eliminaAvviso(a.id)}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            </div>
          <div style={{ padding: '.5rem 1rem', fontSize: '.68rem', color: 'var(--mu)', borderTop: '1px solid var(--bd)' }}>
              {filtered.length} avvisi · {avvisi.length} totali
            </div>
          </div>
        )}
    </div>
  )
}
