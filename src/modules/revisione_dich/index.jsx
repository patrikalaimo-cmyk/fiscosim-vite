import { useState, useEffect, useRef, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { useAIStatus } from '../../context/AIStatusContext'
import { renderPDFPagesToImages } from '../../shared/utils'

const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'

// ─── COSTANTI ────────────────────────────────────────────────
const STATO_BADGE = {
  ok:      { ico: '✅', label: 'OK',           color: '#34c27a' },
  warning: { ico: '⚠️', label: 'Da valutare',  color: '#f59e0b' },
  error:   { ico: '❌', label: 'Attenzione',   color: '#e05252' },
}

// ─── HELPER: analisi AI dichiarativo ─────────────────────────
async function analizzaDichiarativo(dichiarativo, documenti, onProgress) {
  onProgress('Preparazione immagini dichiarativo...')

  // Rasterizza prime 5 pagine del dichiarativo (quelle con i quadri principali)
  const imgsDich = await renderPDFPagesToImages(dichiarativo, { maxPages: 5, scale: 1.3 })

  // Rasterizza prima pagina di ogni documento di supporto (max 8 doc)
  const imgsDoc = []
  for (const doc of documenti.slice(0, 8)) {
    onProgress(`Analisi documento: ${doc.file.name}...`)
    const imgs = await renderPDFPagesToImages(doc.file, { maxPages: 1, scale: 1.2 })
    if (imgs.length) imgsDoc.push({ nome: doc.file.name, img: imgs[0] })
  }

  onProgress('Analisi AI in corso...')

  const dichBlocks = imgsDich.map(b64 => ({
    type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 }
  }))

  const docBlocks = imgsDoc.flatMap(d => [
    { type: 'text', text: `\n--- Documento di supporto: ${d.nome} ---` },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: d.img } }
  ])

  const prompt = `Sei un esperto commercialista italiano con 20 anni di esperienza nella revisione di dichiarazioni fiscali elaborate con TeamSystem.
Stai analizzando una dichiarazione dei redditi italiana (Redditi PF / SC / SP / IRAP) esportata da TeamSystem in formato PDF.
${imgsDoc.length > 0 ? `Hai allegati ${imgsDoc.length} documenti di supporto (CU, F24, spese, fatture, ecc.).` : 'Nessun documento di supporto allegato.'}

STRUTTURA MODELLI REDDITI (identici ai modelli ADE):
- Redditi PF: Quadro RC (lavoro dip./pensioni) | RP (oneri detraibili/deducibili) | RN (liquidazione IRPEF) | RV (addizionali) | CR (crediti) | RX (utilizzo credito)
- Redditi SC: Quadro RF (reddito impresa) | RQ (imposte) | RX (utilizzo credito)  
- IRAP: Quadro IQ (valore produzione) | IR (imposta)

AREE CRITICHE DA CONTROLLARE CON PRIORITÀ:

**QUADRO RC — Lavoro dipendente/pensioni (ALTA PRIORITÀ)**
Dati inseriti manualmente da CU → alto rischio errori di trascrizione:
- Verificare che reddito imponibile RC coincida con punto 1 delle CU allegate
- Verificare ritenute IRPEF (punto 4 CU) coincidano con RC col.9
- Controllare addizionale regionale (punto 12 CU) e comunale (punto 15 CU)
- Verificare codice comune addizionale comunale corretto
- Segnalare se CU non allegata ma RC presente

**QUADRO RP — Oneri detraibili/deducibili (ALTA PRIORITÀ)**  
Dati sempre manuali, soglie e percentuali cambiano ogni anno:
- RP1/RP2: Spese sanitarie → 19% su eccedenza €129. Verificare importo ragionevole e documentazione
- RP8: Interessi passivi mutuo → max €4.000 detrazione 19%. Verificare anno acquisto e documentazione
- RP12-RP16: Erogazioni liberali → verificare limiti percentuali applicabili
- RP17: Assicurazioni vita/infortuni → max €530 (vita) + €1.291 (infortuni)
- RP21: Spese istruzione → limiti per tipo (università/scuole private)
- RP26: Contributi previdenza complementare → max €5.164,57
- RP29: Contributi colf/badanti → max €1.549,37
- RP33: Assegno coniuge → verificare CF coniuge presente
- RP41-RP57: Ristrutturazioni/risparmio energetico → verificare % corretta (50%/65%/110%) e anno inizio lavori
- Segnalare se importi sembrano anomali rispetto alla tipologia di spesa

**QUADRO RF — Reddito impresa SC/SP (ALTA PRIORITÀ)**
- Verificare coerenza con bilancio se allegato
- Controllare variazioni in aumento/diminuzione più comuni (quote amm., spese indeducibili, ACE)
- Verificare perdite pregresse utilizzate correttamente
- Segnalare se risultato fiscale molto diverso da risultato civilistico senza variazioni evidenti

**QUADRO RN — Liquidazione IRPEF**
- Reddito complessivo = somma quadri RC + altri redditi
- Verificare calcolo IRPEF lorda sulle aliquote progressive 2024 (23%/25%/35%/43%)
- Detrazioni per carichi famiglia: verificare CF figli e coniuge
- Imposta netta = lorda - detrazioni
- Saldo = imposta netta - ritenute - acconti versati
- Verificare acconti versati (codice tributo 4033/4034) con F24 se allegati

**IRAP**
- Verificare aliquota corretta per settore (ordinaria 3,9% / ridotta per settori specifici)
- Controllare deduzioni IRAP (cuneo fiscale, deduzione forfetaria)
- Saldo IRAP coerente con acconti F24 (cod.tributo 3800/3812)

FORMATO RISPOSTA — Rispondi SOLO con JSON valido:
{
  "tipo_dichiarativo": "es. Redditi PF 2025 (anno imposta 2024)",
  "contribuente": "cognome nome o denominazione",
  "codice_fiscale": "CF estratto",
  "anno_imposta": 2024,
  "reddito_imponibile": 0,
  "imposta_lorda": 0,
  "imposta_netta": 0,
  "acconti_versati": 0,
  "saldo_dovuto": 0,
  "quadri_rilevati": ["RC","RP","RN","RF"],
  "controlli": [
    {
      "area": "Quadro RC — Lavoro dipendente",
      "descrizione": "Verifica coerenza dati CU con quadro RC",
      "esito": "ok",
      "dettaglio": "Reddito RC €XX.XXX coincide con CU allegata punto 1 €XX.XXX"
    }
  ],
  "confronto_anno_precedente": {
    "disponibile": false,
    "note": "Nessuna dichiarazione precedente in memoria per questo contribuente"
  },
  "aree_critiche": ["Quadro RP: spese ristrutturazione da verificare - documentazione non allegata"],
  "note_generali": "considerazioni generali"
}

Per ogni controllo: "ok" = tutto corretto, "warning" = da valutare/approfondire, "error" = dato errato/mancante critico.
Sii specifico nei dettagli: indica importi, quadri, righi quando possibile.`

  const res = await fetch('/api/claude', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514', // Sonnet per analisi complessa
      max_tokens: 4000,
      system: 'Sei un esperto commercialista italiano. Rispondi SEMPRE e SOLO con JSON valido, zero testo aggiuntivo.',
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Analizza questa dichiarazione fiscale italiana:' },
          ...dichBlocks,
          ...docBlocks,
          { type: 'text', text: prompt }
        ]
      }]
    })
  })

  if (!res.ok) throw new Error(`API error: ${res.status}`)
  const data = await res.json()
  const txt = (data.content?.[0]?.text || '{}').replace(/```json|```/g, '').trim()
  return JSON.parse(txt)
}

// ─── COMPONENTE PRINCIPALE ────────────────────────────────────
export function ModuloRevisioneDich({ utente }) {
  const ai = useAIStatus()

  // Fase del wizard: 'upload' | 'conferma_arch' | 'analisi' | 'report' | 'storico'
  const [fase, setFase] = useState('upload')
  const [dichiarativo, setDichiarativo] = useState(null)       // File PDF principale
  const [documenti, setDocumenti] = useState([])               // File supporto [{file, id}]
  const [progress, setProgress] = useState('')
  const [report, setReport] = useState(null)                   // Risultato AI
  const [errore, setErrore] = useState(null)
  const [analizzando, setAnalizzando] = useState(false)

  // Archiviazione
  const [sceltaArch, setSceltaArch] = useState(null) // 'archivia'|'senza'|'annulla'
  const [clienti, setClienti] = useState([])
  const [clienteSelId, setClienteSelId] = useState('')
  const [creaCliente, setCreaCliente] = useState(false)
  const [nuovoCliente, setNuovoCliente] = useState({ nome: '', cognome: '', ragione_sociale: '', codice_fiscale: '', tipo_cliente: 'ordinario' })

  // Storico
  const [storico, setStorico] = useState([])
  const [loadingStorico, setLoadingStorico] = useState(false)

  const dichRef  = useRef()
  const docRef   = useRef()

  useEffect(() => {
    sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale')
      .eq('attivo', true).order('nome').then(({ data }) => setClienti(data || []))
  }, [])

  const loadStorico = useCallback(async () => {
    setLoadingStorico(true)
    const { data } = await sb.from('revisioni_dichiarativi')
      .select('*,clienti(nome,cognome,ragione_sociale)').order('created_at', { ascending: false }).limit(30)
    setStorico(data || [])
    setLoadingStorico(false)
  }, [])

  // Drag & drop dichiarativo
  const handleDichFile = (f) => {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.pdf')) return alert('Carica un file PDF')
    setDichiarativo(f)
    setErrore(null)
  }

  const addDocumento = (f) => {
    if (!f) return
    setDocumenti(prev => [...prev, { file: f, id: Date.now() }])
  }

  const removeDoc = (id) => setDocumenti(prev => prev.filter(d => d.id !== id))

  const avviaAnalisi = async () => {
    if (!dichiarativo) return alert('Carica prima il dichiarativo')
    setAnalizzando(true)
    setErrore(null)
    ai.setAI('processing', 'Revisione dichiarativo', 'ai')
    try {
      const result = await analizzaDichiarativo(dichiarativo, documenti, setProgress)
      // Cerca revisioni precedenti per stesso CF per confronto storico
      if (result.codice_fiscale) {
        setProgress('Ricerca storico anni precedenti...')
        const { data: prev } = await sb.from('revisioni_dichiarativi')
          .select('anno_imposta,reddito_imponibile,imposta_netta,saldo_dovuto,report_json')
          .eq('codice_fiscale', result.codice_fiscale)
          .order('anno_imposta', { ascending: false })
          .limit(2)
        if (prev?.length) {
          result.confronto_anno_precedente = {
            disponibile: true,
            anni: prev.map(p => ({
              anno: p.anno_imposta,
              reddito_imponibile: p.reddito_imponibile,
              imposta_netta: p.imposta_netta,
              saldo_dovuto: p.saldo_dovuto,
              quadri: p.report_json?.quadri_rilevati || [],
            }))
          }
        }
      }
      setReport(result)
      setFase('conferma_arch')
    } catch (e) {
      setErrore(e.message)
    } finally {
      setAnalizzando(false)
      setProgress('')
      ai.setAI('done', 'Revisione dichiarativo', 'ai')
    }
  }

  const salvaArchiviazione = async () => {
    let clienteId = clienteSelId || null

    // Crea nuovo cliente se richiesto
    if (creaCliente && nuovoCliente.nome || creaCliente && nuovoCliente.ragione_sociale) {
      const { data: newC } = await sb.from('clienti').insert([{
        ...nuovoCliente, nome: nuovoCliente.nome || nuovoCliente.ragione_sociale, attivo: true
      }]).select('id').single()
      clienteId = newC?.id || null
    }

    // Salva revisione
    await sb.from('revisioni_dichiarativi').insert([{
      cliente_id: clienteId,
      anno_imposta: report?.anno_imposta,
      tipo_dichiarativo: report?.tipo_dichiarativo,
      contribuente: report?.contribuente,
      codice_fiscale: report?.codice_fiscale,
      reddito_imponibile: report?.reddito_imponibile,
      imposta_netta: report?.imposta_netta,
      saldo_dovuto: report?.saldo_dovuto,
      report_json: report,
      num_documenti: documenti.length,
      created_by: utente?.id,
    }])
    setFase('report')
  }

  const reset = () => {
    setFase('upload'); setDichiarativo(null); setDocumenti([])
    setReport(null); setErrore(null); setSceltaArch(null)
    setClienteSelId(''); setCreaCliente(false)
  }

  // ── RENDER ──────────────────────────────────────────────────
  return (
    <div className="page">
      <div className="page-hdr">
        <div>
          <div className="page-title">🔍 Revisione Dichiarativi</div>
          <div className="page-sub">Analisi AI · Controlli incrociati · Aree critiche · Confronto storico</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem' }}>
          {fase !== 'upload' && <button className="btn-sec" onClick={reset}>+ Nuova revisione</button>}
          <button className="btn-sec" onClick={() => { setFase('storico'); loadStorico() }}>📚 Storico</button>
        </div>
      </div>

      {/* ── FASE UPLOAD ───────────────────────────────────── */}
      {fase === 'upload' && (
        <div>
          {/* Zona dichiarativo principale */}
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.75rem', color: 'var(--gold)' }}>
              📄 1. Carica il modello Redditi da analizzare
            </div>
            {!dichiarativo ? (
              <div className="upload-zone" onClick={() => dichRef.current.click()}
                style={{ cursor: 'pointer', minHeight: 120 }}>
                <div className="upload-zone-ico">📄</div>
                <div className="upload-zone-t">Carica il dichiarativo PDF</div>
                <div className="upload-zone-s">Redditi PF / SC / SP / 730 — esportato da TeamSystem</div>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: '.75rem', padding: '.75rem 1rem', background: 'rgba(52,194,122,.08)', border: '1px solid rgba(52,194,122,.3)', borderRadius: 8 }}>
                <span style={{ fontSize: '1.5rem' }}>📄</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: '.85rem' }}>{dichiarativo.name}</div>
                  <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>{(dichiarativo.size / 1024).toFixed(0)} KB</div>
                </div>
                <button className="btn-sec" style={{ fontSize: '.75rem' }} onClick={() => setDichiarativo(null)}>✕ Rimuovi</button>
              </div>
            )}
            <input ref={dichRef} type="file" accept=".pdf" hidden onChange={e => handleDichFile(e.target.files?.[0])} />
          </div>

          {/* Zona documenti supporto */}
          {dichiarativo && (
            <div className="card" style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.75rem', color: 'var(--gold)' }}>
                📎 2. Carica i documenti di supporto <span style={{ fontWeight: 400, color: 'var(--mu)', fontSize: '.8rem' }}>(opzionale — uno alla volta)</span>
              </div>
              <div className="upload-zone" onClick={() => docRef.current.click()}
                style={{ cursor: 'pointer', minHeight: 80, marginBottom: '.75rem' }}>
                <div className="upload-zone-ico" style={{ fontSize: '1.5rem' }}>📎</div>
                <div className="upload-zone-t" style={{ fontSize: '.85rem' }}>Aggiungi documento</div>
                <div className="upload-zone-s">CU, F24, spese mediche, visure, atti, ecc.</div>
              </div>
              <input ref={docRef} type="file" accept=".pdf,.xml,.jpg,.png" hidden onChange={e => { addDocumento(e.target.files?.[0]); docRef.current.value = '' }} />

              {documenti.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                  {documenti.map(d => (
                    <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.45rem .75rem', background: 'var(--s2)', borderRadius: 7, border: '1px solid var(--bd)' }}>
                      <span>📎</span>
                      <span style={{ flex: 1, fontSize: '.8rem' }}>{d.file.name}</span>
                      <span style={{ fontSize: '.7rem', color: 'var(--mu)' }}>{(d.file.size / 1024).toFixed(0)} KB</span>
                      <button onClick={() => removeDoc(d.id)} style={{ background: 'none', border: 'none', color: 'var(--mu)', cursor: 'pointer', fontSize: '.85rem' }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Avvia analisi */}
          {dichiarativo && (
            <div className="card">
              {errore && <div className="alert alert-error" style={{ marginBottom: '.75rem' }}>{errore}</div>}
              {analizzando ? (
                <div style={{ textAlign: 'center', padding: '1.5rem' }}>
                  <div style={{ fontSize: '2rem', marginBottom: '.75rem' }}>🤖</div>
                  <div style={{ fontWeight: 600, marginBottom: '.4rem' }}>Analisi AI in corso...</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>{progress}</div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>
                      ✓ {dichiarativo.name}{documenti.length > 0 ? ` + ${documenti.length} documento/i allegato/i` : ''}
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--mu)', marginTop: '.2rem' }}>
                      Clicca "Avvia analisi" per procedere
                    </div>
                  </div>
                  <button className="btn" onClick={avviaAnalisi} style={{ minWidth: 160 }}>
                    🔍 Avvia analisi AI
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── FASE CONFERMA ARCHIVIAZIONE ───────────────────── */}
      {fase === 'conferma_arch' && report && (
        <div>
          <div className="alert alert-info" style={{ marginBottom: '1.25rem', fontSize: '.85rem' }}>
            ✅ Analisi completata — <strong>{report.tipo_dichiarativo}</strong> · {report.contribuente}
          </div>

          {!sceltaArch && (
            <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '1.8rem', marginBottom: '.75rem' }}>📁</div>
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '.4rem' }}>Archiviare questa revisione?</div>
              <div style={{ fontSize: '.8rem', color: 'var(--mu)', marginBottom: '1.5rem' }}>
                Archiviando potrai confrontare con gli anni precedenti e tenere traccia delle revisioni effettuate
              </div>
              <div style={{ display: 'flex', gap: '.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button className="btn" onClick={() => setSceltaArch('archivia')}>📁 Archivia per confronti futuri</button>
                <button className="btn-sec" onClick={() => setFase('report')}>▶ Avanti senza archiviare</button>
                <button className="btn-sec" style={{ color: 'var(--rd)', borderColor: 'rgba(224,82,82,.4)' }} onClick={reset}>✕ Annulla</button>
              </div>
            </div>
          )}

          {sceltaArch === 'archivia' && (
            <div className="card">
              <div style={{ fontWeight: 700, fontSize: '.9rem', marginBottom: '.75rem', color: 'var(--gold)' }}>
                📁 Collega a cliente studio
              </div>
              <div style={{ marginBottom: '.75rem' }}>
                <label style={{ fontSize: '.78rem', color: 'var(--mu)', display: 'block', marginBottom: '.3rem' }}>Cliente</label>
                <select value={clienteSelId} onChange={e => { setClienteSelId(e.target.value); setCreaCliente(false) }} style={{ width: '100%', marginBottom: '.5rem' }}>
                  <option value="">-- Seleziona cliente --</option>
                  {clienti.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()} · {c.codice_fiscale || ''}
                    </option>
                  ))}
                </select>

                {/* Match automatico da CF estratto dall'AI */}
                {report.codice_fiscale && !clienteSelId && (() => {
                  const match = clienti.find(c => c.codice_fiscale === report.codice_fiscale)
                  if (match) return (
                    <div style={{ fontSize: '.75rem', color: '#34c27a', marginBottom: '.5rem' }}>
                      ✓ Trovato cliente corrispondente: <strong>{match.ragione_sociale || match.nome}</strong>
                      <button className="btn-sec" style={{ fontSize: '.7rem', marginLeft: '.5rem', padding: '.15rem .5rem' }}
                        onClick={() => setClienteSelId(match.id)}>Usa questo</button>
                    </div>
                  )
                  return null
                })()}

                {!clienteSelId && (
                  <div>
                    <span style={{ fontSize: '.75rem', color: 'var(--mu)' }}>Il cliente non è in archivio? </span>
                    <span style={{ fontSize: '.75rem', color: 'var(--cy)', cursor: 'pointer' }}
                      onClick={() => setCreaCliente(p => !p)}>
                      {creaCliente ? 'Annulla creazione' : 'Crea nuova anagrafica'}
                    </span>
                  </div>
                )}
              </div>

              {creaCliente && (
                <div className="form-grid" style={{ marginBottom: '.75rem' }}>
                  <div className="fg"><label>Nome</label><input value={nuovoCliente.nome} onChange={e => setNuovoCliente(p => ({ ...p, nome: e.target.value }))} placeholder={report.contribuente?.split(' ')[0] || ''} /></div>
                  <div className="fg"><label>Cognome / Rag. Soc.</label><input value={nuovoCliente.ragione_sociale} onChange={e => setNuovoCliente(p => ({ ...p, ragione_sociale: e.target.value }))} placeholder={report.contribuente || ''} /></div>
                  <div className="fg"><label>Codice Fiscale</label><input value={nuovoCliente.codice_fiscale} onChange={e => setNuovoCliente(p => ({ ...p, codice_fiscale: e.target.value }))} placeholder={report.codice_fiscale || ''} /></div>
                  <div className="fg"><label>Tipo</label>
                    <select value={nuovoCliente.tipo_cliente} onChange={e => setNuovoCliente(p => ({ ...p, tipo_cliente: e.target.value }))}>
                      <option value="ordinario">Ordinario</option>
                      <option value="forfettario">Forfettario</option>
                      <option value="srl">S.r.l.</option>
                      <option value="snc">SNC/SAS</option>
                    </select>
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button className="btn-sec" onClick={() => setFase('report')}>Salta → vai al report</button>
                <button className="btn" onClick={salvaArchiviazione}
                  disabled={!clienteSelId && !creaCliente}>
                  💾 Archivia e vai al report
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── FASE REPORT ───────────────────────────────────── */}
      {fase === 'report' && report && (
        <ReportDichiarativo report={report} onNuova={reset} />
      )}

      {/* ── FASE STORICO ──────────────────────────────────── */}
      {fase === 'storico' && (
        <div>
          <div style={{ fontWeight: 700, marginBottom: '1rem' }}>📚 Storico revisioni</div>
          {loadingStorico ? <div className="loading">⏳ Caricamento...</div>
            : storico.length === 0 ? (
              <div className="empty"><div className="empty-ico">📚</div><div className="empty-t">Nessuna revisione archiviata</div></div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                <table className="tbl">
                  <thead><tr><th>Data</th><th>Tipo</th><th>Contribuente</th><th>Anno</th><th>Cliente</th><th>Azioni</th></tr></thead>
                  <tbody>
                    {storico.map(r => (
                      <tr key={r.id}>
                        <td style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{fmtDate(r.created_at)}</td>
                        <td style={{ fontSize: '.78rem' }}>{r.tipo_dichiarativo}</td>
                        <td style={{ fontWeight: 600, fontSize: '.82rem' }}>{r.contribuente}</td>
                        <td style={{ textAlign: 'center' }}>{r.anno_imposta}</td>
                        <td style={{ fontSize: '.75rem', color: 'var(--mu)' }}>
                          {r.clienti?.ragione_sociale || `${r.clienti?.nome || ''} ${r.clienti?.cognome || ''}`.trim() || '—'}
                        </td>
                        <td>
                          <button className="btn-icon" onClick={() => { setReport(r.report_json); setFase('report') }}>👁</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}
    </div>
  )
}

// ─── COMPONENTE REPORT ────────────────────────────────────────
function ReportDichiarativo({ report, onNuova }) {
  const totCtrl    = report.controlli?.length || 0
  const okCount    = report.controlli?.filter(c => c.esito === 'ok').length || 0
  const warnCount  = report.controlli?.filter(c => c.esito === 'warning').length || 0
  const errCount   = report.controlli?.filter(c => c.esito === 'error').length || 0
  const [openCtrl, setOpenCtrl] = useState(null)

  return (
    <div>
      {/* Header report */}
      <div className="card" style={{ marginBottom: '1rem', background: 'linear-gradient(135deg,var(--s2),var(--s1))', border: '1px solid var(--bd)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '.75rem' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--gold)', marginBottom: '.25rem' }}>
              {report.tipo_dichiarativo}
            </div>
            <div style={{ fontSize: '.85rem', marginBottom: '.15rem' }}>{report.contribuente}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>CF: {report.codice_fiscale} · Anno imposta: {report.anno_imposta}</div>
          </div>
          <button className="btn-sec" style={{ fontSize: '.78rem' }} onClick={onNuova}>+ Nuova revisione</button>
        </div>

        {/* Dati principali */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: '.6rem', marginTop: '1rem' }}>
          {[
            ['Reddito imponibile', report.reddito_imponibile],
            ['Imposta netta',      report.imposta_netta],
            ['Acconti versati',    report.acconti_versati],
            ['Saldo dovuto',       report.saldo_dovuto],
          ].map(([lbl, val]) => (
            <div key={lbl} style={{ background: 'var(--s1)', borderRadius: 8, padding: '.6rem .8rem', border: '1px solid var(--bd)' }}>
              <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginBottom: '.2rem' }}>{lbl}</div>
              <div style={{ fontWeight: 700, fontSize: '.95rem', color: 'var(--gold)' }}>
                {val != null ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(val) : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Semaforo globale */}
      <div style={{ display: 'flex', gap: '.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        {[['✅', okCount, '#34c27a', 'OK'], ['⚠️', warnCount, '#f59e0b', 'Da valutare'], ['❌', errCount, '#e05252', 'Attenzione']].map(([ico, n, color, lbl]) => (
          <div key={lbl} style={{ flex: 1, minWidth: 100, background: 'var(--s1)', border: `1px solid ${color}40`, borderRadius: 10, padding: '.75rem', textAlign: 'center' }}>
            <div style={{ fontSize: '1.4rem' }}>{ico}</div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem', color }}>{n}</div>
            <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>{lbl}</div>
          </div>
        ))}
      </div>

      {/* Lista controlli */}
      <div className="card" style={{ marginBottom: '1rem', padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '.75rem 1.25rem', borderBottom: '1px solid var(--bd)', fontWeight: 700, fontSize: '.85rem' }}>
          🔎 Controlli effettuati ({totCtrl})
        </div>
        {(report.controlli || []).map((ctrl, i) => {
          const st = STATO_BADGE[ctrl.esito] || STATO_BADGE.warning
          const isOpen = openCtrl === i
          return (
            <div key={i} style={{ borderBottom: '1px solid rgba(33,40,58,.4)', background: isOpen ? 'rgba(255,255,255,.02)' : 'transparent' }}>
              <div onClick={() => setOpenCtrl(isOpen ? null : i)}
                style={{ display: 'flex', alignItems: 'center', gap: '.65rem', padding: '.65rem 1.25rem', cursor: 'pointer' }}>
                <span style={{ fontSize: '1.1rem', flexShrink: 0 }}>{st.ico}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 600, color: st.color }}>{ctrl.area}</div>
                  <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{ctrl.descrizione}</div>
                </div>
                <span style={{ fontSize: '.65rem', color: 'var(--mu)', flexShrink: 0 }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div style={{ padding: '.5rem 1.25rem 1rem 3rem', fontSize: '.78rem', color: 'var(--tx)', borderTop: '1px solid rgba(33,40,58,.3)', background: `${st.color}08` }}>
                  {ctrl.dettaglio}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Aree critiche */}
      {report.aree_critiche?.length > 0 && (
        <div className="card" style={{ marginBottom: '1rem', background: 'rgba(224,82,82,.05)', border: '1px solid rgba(224,82,82,.25)' }}>
          <div style={{ fontWeight: 700, fontSize: '.88rem', color: '#e05252', marginBottom: '.6rem' }}>
            🚨 Aree di maggiore attenzione
          </div>
          {report.aree_critiche.map((area, i) => (
            <div key={i} style={{ display: 'flex', gap: '.5rem', marginBottom: '.35rem', fontSize: '.8rem' }}>
              <span style={{ color: '#e05252', flexShrink: 0 }}>▶</span>
              <span>{area}</span>
            </div>
          ))}
        </div>
      )}

      {/* Confronto anni precedenti */}
      {report.confronto_anno_precedente?.disponibile && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div style={{ fontWeight: 700, fontSize: '.88rem', color: 'var(--cy)', marginBottom: '.75rem' }}>
            📊 Confronto anni precedenti
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="tbl">
              <thead><tr>
                <th>Anno</th><th>Reddito imponibile</th><th>Imposta netta</th><th>Saldo</th><th>Variazione reddito</th>
              </tr></thead>
              <tbody>
                {/* Anno corrente */}
                <tr style={{ background: 'rgba(200,164,94,.06)' }}>
                  <td><strong style={{ color: 'var(--gold)' }}>{report.anno_imposta} ← attuale</strong></td>
                  <td style={{ fontWeight: 600 }}>{report.reddito_imponibile != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(report.reddito_imponibile) : '—'}</td>
                  <td>{report.imposta_netta != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(report.imposta_netta) : '—'}</td>
                  <td style={{ color: report.saldo_dovuto > 0 ? '#e05252' : '#34c27a' }}>
                    {report.saldo_dovuto != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(report.saldo_dovuto) : '—'}
                  </td>
                  <td>—</td>
                </tr>
                {report.confronto_anno_precedente.anni.map((prev, i) => {
                  const varReddito = report.reddito_imponibile != null && prev.reddito_imponibile
                    ? ((report.reddito_imponibile - prev.reddito_imponibile) / prev.reddito_imponibile * 100).toFixed(1)
                    : null
                  return (
                    <tr key={prev.anno}>
                      <td style={{ color: 'var(--mu)' }}>{prev.anno}</td>
                      <td>{prev.reddito_imponibile != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(prev.reddito_imponibile) : '—'}</td>
                      <td>{prev.imposta_netta != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(prev.imposta_netta) : '—'}</td>
                      <td style={{ color: prev.saldo_dovuto > 0 ? '#e05252' : '#34c27a' }}>
                        {prev.saldo_dovuto != null ? new Intl.NumberFormat('it-IT',{style:'currency',currency:'EUR'}).format(prev.saldo_dovuto) : '—'}
                      </td>
                      <td style={{ color: varReddito > 20 ? '#e05252' : varReddito < -20 ? '#f59e0b' : '#34c27a', fontWeight: 600 }}>
                        {varReddito != null ? `${varReddito > 0 ? '+' : ''}${varReddito}%` : '—'}
                        {Math.abs(varReddito) > 30 && <span style={{ marginLeft: '.3rem', fontSize: '.7rem' }}>⚠️</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {report.confronto_anno_precedente.anni.some((p) =>
            report.reddito_imponibile != null && p.reddito_imponibile &&
            Math.abs((report.reddito_imponibile - p.reddito_imponibile) / p.reddito_imponibile) > 0.3
          ) && (
            <div style={{ marginTop: '.75rem', fontSize: '.78rem', color: '#f59e0b', padding: '.5rem .75rem', background: 'rgba(245,158,11,.08)', borderRadius: 6 }}>
              ⚠️ Variazione significativa del reddito imponibile rispetto all'anno precedente — verificare la causa
            </div>
          )}
        </div>
      )}

      {/* Note generali */}
      {report.note_generali && (
        <div className="card" style={{ fontSize: '.8rem', color: 'var(--mu)', fontStyle: 'italic' }}>
          💬 {report.note_generali}
        </div>
      )}
    </div>
  )
}
