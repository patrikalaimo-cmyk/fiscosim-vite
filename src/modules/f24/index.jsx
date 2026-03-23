import { parseXMLFattura, formattaXML, CATEGORIE_CESPITI, suggerisciCespiteDeterministico } from '../../shared/utils/fatture'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { MESI } from '../../shared/constants'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloF24(){
  const [stato,setStato]=useState('loading'); // loading | error | ok
  const [errMsg,setErrMsg]=useState('');
  const [scadenze,setScadenze]=useState([]);
  const [active,setActive]=useState(null);
  const [clients,setClients]=useState([]);
  const [showNuova,setNuova]=useState(false);

  useEffect(()=>{ init(); },[]);

  const init=async()=>{
    setStato('loading');
    try{
      // Test connessione tabella f24_scadenze
      const{data:sc,error:scErr}=await sb.from('f24_scadenze').select('*').order('data_scadenza',{ascending:false});
      if(scErr) throw new Error('Tabelle F24 mancanti. Esegui schema_v3.sql su Supabase. ('+scErr.message+')');
      setScadenze(sc||[]);
      if(sc&&sc.length>0) setActive(sc[0]);

      // Carica clienti
      const{data:cl}=await sb.from('clienti').select('id,nome,cognome,ragione_sociale').eq('attivo',true).order('nome');
      const filtered=(cl||[]).filter(c=>!c.moduli_attivi||c.moduli_attivi.includes('f24'));
      setClients(filtered);

      setStato('ok');
    }catch(e){
      console.error('F24 init error:',e);
      setErrMsg(e.message||'Errore caricamento F24');
      setStato('error');
    }
  };

  const reload=async()=>{
    try{
      const{data,error}=await sb.from('f24_scadenze').select('*').order('data_scadenza',{ascending:false});
      if(error)throw error;
      setScadenze(data||[]);
    }catch(e){ console.error(e); }
  };

  const handleNuova=async({label,data_scadenza})=>{
    const{data,error}=await sb.from('f24_scadenze').insert({label,data_scadenza,stato:'aperta'}).select().single();
    if(error){alert('Errore: '+error.message);return;}
    setNuova(false);
    await reload();
    if(data) setActive(data);
  };

  const toggleChiudi=async(s)=>{
    await sb.from('f24_scadenze').update({stato:s.stato==='chiusa'?'aperta':'chiusa'}).eq('id',s.id);
    reload();
  };

  const deleteScadenza=async(id)=>{
    if(!confirm('Eliminare questa scadenza e tutti i dati F24 associati?'))return;
    await sb.from('f24_scadenze').delete().eq('id',id);
    setActive(null); reload();
  };

  // ── RENDER ────────────────────────────────────────────────
  if(stato==='loading') return(
    <div className="page">
      <div className="page-hdr"><div className="page-title">📋 Gestione F24</div></div>
      <div className="loading">⏳ Caricamento modulo F24...</div>
    </div>
  );

  if(stato==='error') return(
    <div className="page">
      <div className="page-hdr"><div className="page-title">📋 Gestione F24</div></div>
      <div className="alert alert-err" style={{marginBottom:'1rem'}}>
        <div style={{fontWeight:700,marginBottom:'.35rem'}}>⚠️ Errore caricamento</div>
        <div style={{fontSize:'.8rem',marginBottom:'.75rem'}}>{errMsg}</div>
        <div style={{fontSize:'.75rem',lineHeight:1.7,background:'rgba(0,0,0,.2)',borderRadius:6,padding:'.5rem .75rem',marginBottom:'.75rem'}}>
          <strong>Come risolvere:</strong><br/>
          1. Apri Supabase → SQL Editor<br/>
          2. Incolla ed esegui il contenuto di <strong>schema_v3.sql</strong><br/>
          3. Torna qui e clicca "Riprova"
        </div>
        <button className="btn" onClick={init}>🔄 Riprova</button>
      </div>
    </div>
  );

  return(
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">📋 Gestione F24</div>
        <div className="page-sub">Tabellone scadenze F24 — seleziona una scadenza per lavorarci</div>
      </div>

      {/* TABS SCADENZE */}
      <div style={{display:'flex',gap:'.5rem',marginBottom:'1.5rem',flexWrap:'wrap',alignItems:'center'}}>
        {scadenze.length===0
          ?<span style={{color:'var(--mu)',fontSize:'.82rem'}}>Nessuna scadenza — creane una con il pulsante →</span>
          :scadenze.map(s=>(
            <div key={s.id} onClick={()=>setActive(s)}
              style={{display:'flex',alignItems:'center',gap:'.5rem',background:active?.id===s.id?'rgba(200,164,94,.12)':'var(--s1)',border:`1px solid ${active?.id===s.id?'var(--gold)':'var(--bd)'}`,borderRadius:9,padding:'.45rem .9rem',cursor:'pointer',transition:'all .15s'}}>
              <span style={{fontSize:'.82rem',fontWeight:active?.id===s.id?700:400,color:active?.id===s.id?'var(--gold)':'var(--tx)'}}>📅 {s.label}</span>
              <span style={{fontSize:'.6rem',fontWeight:700,padding:'.06rem .35rem',borderRadius:4,
                background:s.stato==='chiusa'?'rgba(52,194,122,.12)':'rgba(200,164,94,.12)',
                color:s.stato==='chiusa'?'var(--gr)':'var(--gld2)',
                border:`1px solid ${s.stato==='chiusa'?'rgba(52,194,122,.3)':'rgba(200,164,94,.3)'}`}}>
                {s.stato==='chiusa'?'✓ Chiusa':'Aperta'}
              </span>
            </div>
          ))}
        <button className="btn" style={{marginLeft:'auto'}} onClick={()=>setNuova(true)}>+ Nuova scadenza</button>
      </div>

      {active&&(
        <div style={{display:'flex',gap:'.5rem',marginBottom:'1.25rem'}}>
          <button className="btn-sec" onClick={()=>toggleChiudi(active)}>
            {active.stato==='chiusa'?'🔓 Riapri':'🔒 Chiudi scadenza'}
          </button>
          <button className="btn-danger" onClick={()=>deleteScadenza(active.id)}>🗑 Elimina</button>
        </div>
      )}

      {active
        ?<F24Tabellone key={active.id} scadenza={active} clients={clients}/>
        :<div className="empty">
          <div className="empty-ico">📋</div>
          <div className="empty-t">Nessuna scadenza</div>
          <div className="empty-s">Crea la prima scadenza F24 con il pulsante in alto a destra</div>
        </div>
      }

      {showNuova&&<F24NuovaScadenzaModal onSave={handleNuova} onClose={()=>setNuova(false)}/>}
    </div>
  );
}

// ─── AMMORTAMENTI ────────────────────────────────────────────
// ─── AMMORTAMENTI (versione potenziata con import XML) ──────

function XMLImportModal({ clienti, onSave, onClose }) {
  const [step, setStep] = useState(1); // 1=upload, 2=review, 3=confirm
  const [xmlData, setXmlData] = useState(null);
  const [xmlFormatted, setXmlFormatted] = useState("");
  const [drag, setDrag] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSugg, setAiSugg] = useState(null);
  const [clienteMatch, setClienteMatch] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const fileRef = useRef();

  const [form, setForm] = useState({
    cliente_id: null, cliente_nome: "",
    descrizione: "", categoria: "Attrezzatura",
    data_acquisto: todayStr(), costo_storico: 0,
    aliquota_ammortamento: 20, fondo_ammortamento: 0, note: ""
  });
  const up = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const onClChange = id => {
    const cl = clienti.find(c => c.id === id);
    up("cliente_id", id || null);
    up("cliente_nome", cl ? (cl.ragione_sociale || `${cl.nome} ${cl.cognome || ""}`.trim()) : "");
  };

  const parseFile = async (file) => {
    setErr(null);
    const text = await file.text();
    try {
      const parsed = parseXMLFattura(text);
      setXmlData(parsed);
      setXmlFormatted(formattaXML(text));

      // match cliente per P.IVA cessionario
      const piva = parsed.piva_cessionario?.replace(/\D/g, "");
      const match = piva ? clienti.find(c => c.partita_iva?.replace(/\D/g, "") === piva) : null;
      setClienteMatch(match || null);

      // pre-compila form
      const primaLinea = parsed.lines[0];
      const desc = primaLinea?.desc || parsed.nome_cedente || "";
      const costo = parsed.imponibile || primaLinea?.totale || 0;
      const dataAcq = parsed.data ? parsed.data : todayStr();

      setForm(f => ({
        ...f,
        cliente_id: match?.id || null,
        cliente_nome: match ? (match.ragione_sociale || `${match.nome} ${match.cognome || ""}`.trim()) : "",
        descrizione: desc,
        costo_storico: costo,
        data_acquisto: dataAcq,
      }));

      setStep(2);

      // Suggerisci categoria (AI se attiva, deterministico se no)
      if (desc && costo > 0) {
        setAiLoading(true);
        try {
          const{data:aiSetting}=await sb.from('impostazioni_studio').select('valore').eq('chiave','ai_enabled');
          const useAI=(Array.isArray(aiSetting)?aiSetting[0]:aiSetting)?.valore!=='false';
          const sugg = await aiSuggerisciCespite(desc, costo, useAI);
          setAiSugg(sugg);
          setForm(f => ({
            ...f,
            categoria: sugg.categoria || f.categoria,
            aliquota_ammortamento: sugg.aliquota || f.aliquota_ammortamento,
            descrizione: sugg.descrizione_breve || f.descrizione,
          }));
        } catch (e) { /* ignora errori */ }
        setAiLoading(false);
      }
    } catch (e) {
      setErr("File non valido o non è una fattura elettronica XML italiana.");
    }
  };

  const handleDrop = e => { e.preventDefault(); setDrag(false); parseFile(e.dataTransfer.files[0]); };
  const handleFile = e => { if (e.target.files[0]) parseFile(e.target.files[0]); };

  const salva = async () => {
    setSaving(true);
    try {
      const anni = Math.ceil(100 / parseFloat(form.aliquota_ammortamento || 20));
      const vr = parseFloat(form.costo_storico || 0) - parseFloat(form.fondo_ammortamento || 0);
      await onSave({ ...form, anni_vita_utile: anni, valore_residuo: vr, attivo: true });
    } catch (e) { setErr(e.message); setSaving(false); }
  };

  const residuo = parseFloat(form.costo_storico || 0) - parseFloat(form.fondo_ammortamento || 0);
  const is = { background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: ".45rem .65rem", fontSize: ".82rem", width: "100%" };
  const ss = { ...is, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7a99' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right .7rem center", paddingRight: "2rem", WebkitAppearance: "none", appearance: "none" };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: step === 2 ? 900 : 580, width: "98vw" }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">📎 Importa da Fattura XML</div>
          <div className="modal-sub">
            {step === 1 && "Carica la fattura elettronica del bene"}
            {step === 2 && (xmlData ? `Fattura ${xmlData.numero || ""} · ${xmlData.nome_cedente || ""}` : "")}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ padding: step === 2 ? "1rem" : "1.25rem" }}>
          {err && <div className="alert alert-err" style={{ marginBottom: ".75rem" }}>⚠️ {err}</div>}

          {/* STEP 1 — Upload */}
          {step === 1 && (
            <div
              className={"upload-zone" + (drag ? " drag" : "")}
              onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current.click()}
              style={{ padding: "3rem 2rem" }}
            >
              <div className="upload-zone-ico">📄</div>
              <div className="upload-zone-t">Trascina la fattura elettronica XML</div>
              <div className="upload-zone-s">oppure clicca per selezionare · solo file .xml</div>
            </div>
          )}
          <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" style={{ display: "none" }} onChange={handleFile} />

          {/* STEP 2 — Split view */}
          {step === 2 && xmlData && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", alignItems: "start" }}>

              {/* SINISTRA — XML formattato */}
              <div>
                <div style={{ fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--mu)", marginBottom: ".4rem" }}>
                  📄 Fattura · {xmlData.nome_cedente}
                </div>
                {/* Riepilogo fattura */}
                <div style={{ background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 10, padding: ".75rem", marginBottom: ".65rem" }}>
                  {[
                    ["Fornitore", xmlData.nome_cedente],
                    ["P.IVA fornitore", xmlData.piva_cedente],
                    ["Cessionario", xmlData.nome_cessionario],
                    ["P.IVA cessionario", xmlData.piva_cessionario],
                    ["N. Fattura", xmlData.numero],
                    ["Data", xmlData.data],
                    ["Imponibile", fmt(xmlData.imponibile)],
                    ["Totale doc.", fmt(xmlData.totale_doc)],
                  ].filter(([, v]) => v).map(([l, v]) => (
                    <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: ".2rem 0", fontSize: ".75rem", borderBottom: "1px solid rgba(33,40,58,.5)" }}>
                      <span style={{ color: "var(--mu)" }}>{l}</span>
                      <span style={{ fontWeight: 600, textAlign: "right", maxWidth: "55%" }}>{v}</span>
                    </div>
                  ))}
                </div>
                {/* Linee fattura */}
                {xmlData.lines.length > 0 && (
                  <div style={{ background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ fontSize: ".6rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--mu)", padding: ".5rem .75rem", borderBottom: "1px solid var(--bd)" }}>Righe fattura</div>
                    {xmlData.lines.map((l, i) => (
                      <div key={i} style={{ padding: ".55rem .75rem", borderBottom: i < xmlData.lines.length - 1 ? "1px solid rgba(33,40,58,.5)" : "none" }}>
                        <div style={{ fontSize: ".78rem", fontWeight: 500 }}>{l.desc}</div>
                        <div style={{ fontSize: ".68rem", color: "var(--mu)", marginTop: ".15rem" }}>
                          Qty {l.qty} · {fmt(l.prezzo)} · <strong style={{ color: "var(--gld2)" }}>{fmt(l.totale)}</strong> · IVA {l.iva}%
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {/* XML raw toggle */}
                <details style={{ marginTop: ".65rem" }}>
                  <summary style={{ fontSize: ".7rem", color: "var(--mu)", cursor: "pointer", padding: ".3rem 0" }}>Visualizza XML grezzo</summary>
                  <pre style={{ fontSize: ".6rem", color: "#4e8ef7", background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 8, padding: ".65rem", overflow: "auto", maxHeight: 200, marginTop: ".4rem", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{xmlFormatted}</pre>
                </details>
              </div>

              {/* DESTRA — Form cespite */}
              <div>
                <div style={{ fontSize: ".65rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--mu)", marginBottom: ".4rem" }}>
                  🏢 Dati cespite
                </div>

                {/* AI suggestion box */}
                {aiLoading && (
                  <div style={{ background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 9, padding: ".65rem .85rem", marginBottom: ".75rem", fontSize: ".75rem", color: "#c4b5fd" }}>
                    ✨ Claude sta analizzando il bene...
                  </div>
                )}
                {aiSugg && !aiLoading && (
                  <div style={{ background: "rgba(167,139,250,.08)", border: "1px solid rgba(167,139,250,.25)", borderRadius: 9, padding: ".65rem .85rem", marginBottom: ".75rem" }}>
                    <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#c4b5fd", marginBottom: ".3rem" }}>✨ Suggerimento Claude AI</div>
                    <div style={{ fontSize: ".75rem", color: "var(--tx)" }}>{aiSugg.categoria} · {aiSugg.aliquota}% annuo</div>
                    {aiSugg.motivazione && <div style={{ fontSize: ".68rem", color: "var(--mu)", marginTop: ".15rem" }}>{aiSugg.motivazione}</div>}
                  </div>
                )}

                {/* Match cliente */}
                {clienteMatch ? (
                  <div style={{ background: "rgba(52,194,122,.08)", border: "1px solid rgba(52,194,122,.25)", borderRadius: 9, padding: ".6rem .85rem", marginBottom: ".75rem" }}>
                    <div style={{ fontSize: ".68rem", fontWeight: 700, color: "#4dde96", marginBottom: ".2rem" }}>✅ Cliente trovato per P.IVA</div>
                    <div style={{ fontSize: ".78rem" }}>{clienteMatch.ragione_sociale || `${clienteMatch.nome} ${clienteMatch.cognome || ""}`.trim()}</div>
                  </div>
                ) : xmlData.piva_cessionario ? (
                  <div style={{ background: "rgba(200,164,94,.08)", border: "1px solid rgba(200,164,94,.25)", borderRadius: 9, padding: ".6rem .85rem", marginBottom: ".75rem" }}>
                    <div style={{ fontSize: ".68rem", fontWeight: 700, color: "var(--gld2)", marginBottom: ".2rem" }}>⚠️ P.IVA {xmlData.piva_cessionario} non trovata — seleziona manualmente</div>
                  </div>
                ) : null}

                <div style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
                  <div className="fg">
                    <label>Cliente</label>
                    <select value={form.cliente_id || ""} onChange={e => onClChange(e.target.value || null)} style={ss}>
                      <option value="">— Studio —</option>
                      {clienti.map(c => <option key={c.id} value={c.id}>{c.ragione_sociale || `${c.nome} ${c.cognome || ""}`.trim()}</option>)}
                    </select>
                  </div>
                  <div className="fg">
                    <label>Descrizione *</label>
                    <input value={form.descrizione} onChange={e => up("descrizione", e.target.value)} style={is} />
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".5rem" }}>
                    <div className="fg">
                      <label>Categoria</label>
                      <select value={form.categoria} onChange={e => up("categoria", e.target.value)} style={ss}>
                        {["Attrezzatura", "Veicoli", "Software", "Mobili e arredi", "Immobili", "Altro"].map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="fg">
                      <label>Data acquisto</label>
                      <input type="date" value={form.data_acquisto} onChange={e => up("data_acquisto", e.target.value)} style={is} />
                    </div>
                    <div className="fg">
                      <label>Costo storico (€)</label>
                      <input type="number" step="0.01" value={form.costo_storico} onChange={e => up("costo_storico", parseFloat(e.target.value) || 0)} style={is} />
                    </div>
                    <div className="fg">
                      <label>Aliquota amm. (%)</label>
                      <input type="number" step="0.5" min="1" max="100" value={form.aliquota_ammortamento} onChange={e => up("aliquota_ammortamento", parseFloat(e.target.value) || 20)} style={is} />
                      <div className="hint">Vita utile: {Math.ceil(100 / (form.aliquota_ammortamento || 20))} anni</div>
                    </div>
                    <div className="fg">
                      <label>Fondo pregrasso (€)</label>
                      <input type="number" step="0.01" value={form.fondo_ammortamento} onChange={e => up("fondo_ammortamento", parseFloat(e.target.value) || 0)} style={is} />
                    </div>
                    <div className="fg">
                      <label>Valore residuo</label>
                      <div style={{ fontSize: "1rem", fontWeight: 700, color: residuo > 0 ? "var(--gld2)" : "var(--gr)", padding: ".45rem .65rem", background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 8 }}>{fmt(residuo)}</div>
                    </div>
                  </div>
                  <div className="fg">
                    <label>Note</label>
                    <textarea value={form.note || ""} onChange={e => up("note", e.target.value)} style={{ ...is, minHeight: 55, resize: "vertical" }} />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="modal-foot">
          {step === 2 && <button className="btn-sec" onClick={() => { setStep(1); setXmlData(null); setAiSugg(null); }}>← Ricarica</button>}
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          {step === 2 && <button className="btn" disabled={!form.descrizione || !form.data_acquisto || saving} onClick={salva}>{saving ? "Salvo..." : "💾 Salva cespite"}</button>}
        </div>
      </div>
    </div>
  );
}

function IVAModal({mode,data,clienti,onSave,onClose,saving}){
  const [f,setF]=useState({...data});
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  const saldo=parseFloat(f.iva_vendite||0)-parseFloat(f.iva_acquisti||0);
  const netto=saldo-parseFloat(f.iva_precedente||0);
  const onClienteChange=id=>{const cl=clienti.find(c=>c.id===id);up("cliente_id",id||null);if(cl)up("cliente_nome",cl.ragione_sociale||`${cl.nome} ${cl.cognome||""}`.trim());};
  const TRIMESTRI=["Q1 (Gen-Mar)","Q2 (Apr-Giu)","Q3 (Lug-Set)","Q4 (Ott-Dic)"];
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">{mode==="new"?"Nuova Liquidazione IVA":"Modifica Liquidazione"}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Cliente</label><select value={f.cliente_id||""} onChange={e=>onClienteChange(e.target.value||null)}><option value="">— Nessuno —</option>{clienti.map(c=><option key={c.id} value={c.id}>{c.ragione_sociale||`${c.nome} ${c.cognome||""}`.trim()}</option>)}</select></div>
            <div className="fg"><label>Anno</label><input type="number" value={f.anno} onChange={e=>up("anno",parseInt(e.target.value))}/></div>
            <div className="fg"><label>Tipo</label><select value={f.tipo_periodo} onChange={e=>up("tipo_periodo",e.target.value)}><option value="trimestrale">Trimestrale</option><option value="mensile">Mensile</option></select></div>
            {f.tipo_periodo==="trimestrale"?(
              <div className="fg full"><label>Trimestre</label><select value={f.trimestre} onChange={e=>{const t=parseInt(e.target.value);up("trimestre",t);up("periodo","Q"+t+" "+f.anno);}}>
                {TRIMESTRI.map((l,i)=><option key={i+1} value={i+1}>{l}</option>)}</select></div>
            ):(
              <div className="fg full"><label>Mese</label><select value={f.mese||1} onChange={e=>{const m=parseInt(e.target.value);up("mese",m);up("periodo",MESI[m]+" "+f.anno);}}>
                {MESI.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>
            )}
            <div className="fg"><label>IVA su Vendite (€)</label><input type="number" step="0.01" value={f.iva_vendite} onChange={e=>up("iva_vendite",parseFloat(e.target.value)||0)}/></div>
            <div className="fg"><label>IVA su Acquisti (€)</label><input type="number" step="0.01" value={f.iva_acquisti} onChange={e=>up("iva_acquisti",parseFloat(e.target.value)||0)}/></div>
            <div className="fg"><label>Credito periodo prec. (€)</label><input type="number" step="0.01" value={f.iva_precedente} onChange={e=>up("iva_precedente",parseFloat(e.target.value)||0)}/></div>
            <div className="fg"><label>Stato</label><select value={f.stato} onChange={e=>up("stato",e.target.value)}><option value="bozza">Bozza</option><option value="confermata">Confermata</option><option value="inviata">Inviata</option></select></div>
            <div className="fg full"><label>Note</label><textarea value={f.note||""} onChange={e=>up("note",e.target.value)} style={{minHeight:60}}/></div>
          </div>
          <div className="divider"/>
          <div className="iva-box">
            <div className="iva-row"><span className="iva-rl">IVA vendite</span><span className="iva-rv" style={{color:"var(--rd)"}}>{fmt(f.iva_vendite)}</span></div>
            <div className="iva-row"><span className="iva-rl">IVA acquisti detraibile</span><span className="iva-rv" style={{color:"var(--gr)"}}>- {fmt(f.iva_acquisti)}</span></div>
            <div className="iva-row"><span className="iva-rl">Credito periodo prec.</span><span className="iva-rv" style={{color:"var(--gr)"}}>- {fmt(f.iva_precedente)}</span></div>
            <div className="iva-total">
              <span className="iva-tl">{netto>0?"IVA da versare":"Credito IVA"}</span>
              <span className="iva-tv" style={{color:netto>0?"var(--rd)":"var(--gr)"}}>{fmt(Math.abs(netto))}</span>
            </div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={saving} onClick={()=>onSave(f)}>{saving?"Salvo...":"💾 Salva"}</button></div>
      </div>
    </div>
  );
}

// ─── GESTIONE F24 (portato da v4.2p) ─────────────────────────

const F24_TRIBUTI = [
  { key:'iva_rate',            label:'IVA Rate',             short:'IVA R' },
  { key:'iva_corrente',        label:'IVA Corrente',         short:'IVA C' },
  { key:'ritenute_dipendenti', label:'Rit. Dipendenti',      short:'Rit.Dip' },
  { key:'ritenute_autonomi',   label:'Rit. Autonomi',        short:'Rit.Aut' },
  { key:'altre_ritenute',      label:'Altre Ritenute',       short:'Alt.Rit' },
  { key:'agecon_36bis',        label:'36bis / 54bis Agecon', short:'36bis' },
  { key:'cciaa_separata',      label:'CCIAA Separata',       short:'CCIAA S' },
  { key:'inps_ca',             label:'INPS C/A',             short:'INPS' },
  { key:'imposte',             label:'Imposte / CCIAA',      short:'Imposte' },
  { key:'cciaa_red2024',       label:'TCG / Altri',          short:'TCG' },
  { key:'tcg_altri',           label:'Ravvedimenti',         short:'Ravv.' },
  { key:'ravvedimenti',        label:'Altro',                short:'Altro' },
];

const f24Fmt  = n => n ? Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) : '';
const f24FmtE = n => '€ '+Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const f24FmtN = n => Number(n||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});
const f24Debiti  = r => F24_TRIBUTI.reduce((s,t)=>s+(parseFloat(r[t.key])||0),0);
const f24Crediti = r => parseFloat(r.crediti_compensazione)||0;
const f24Totale  = r => f24Debiti(r)-f24Crediti(r);

const f24Stato = r => {
  if(r.stato_invio==='inviato') return 'inviato';
  if(r.f24_zero) return 'zero';
  if(f24Debiti(r)===0 && !r.f24_zero) return 'vuota';
  if(r.check_autonomi && r.check_dipendenti) return 'ok';
  return 'attesa';
};

const F24_STATO_CFG = {
  ok:      {label:'✓ OK',       color:'#34c27a', bg:'rgba(52,194,122,.12)',  border:'rgba(52,194,122,.35)'},
  attesa:  {label:'⏳ Attesa',  color:'#c8a45e', bg:'rgba(200,164,94,.12)',  border:'rgba(200,164,94,.35)'},
  inviato: {label:'📤 Inviato', color:'#4e8ef7', bg:'rgba(78,142,247,.12)',  border:'rgba(78,142,247,.35)'},
  zero:    {label:'0 Zero',     color:'#5e9fc8', bg:'rgba(94,159,200,.12)',  border:'rgba(94,159,200,.35)'},
  vuota:   {label:'— Vuota',    color:'#7a8599', bg:'rgba(122,133,153,.08)', border:'rgba(122,133,153,.2)'},
};

function F24StatoBadge({stato}){
  const c=F24_STATO_CFG[stato]||F24_STATO_CFG.vuota;
  return <span style={{background:c.bg,color:c.color,border:`1px solid ${c.border}`,borderRadius:5,padding:'.12rem .45rem',fontSize:'.68rem',fontWeight:700,whiteSpace:'nowrap'}}>{c.label}</span>;
}

// Export Excel
function f24ExportExcel(clients, righeMap, label){
  const XLSX=window.XLSX;
  if(!XLSX){alert('Libreria Excel non disponibile');return;}
  const rows=clients.map(c=>{
    const r=righeMap[c.id]||{};
    return {
      'Cliente': c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim(),
      ...F24_TRIBUTI.reduce((o,t)=>({...o,[t.label]:parseFloat(r[t.key])||0}),{}),
      'Crediti Comp.': f24Crediti(r),
      'Totale Debiti': f24Debiti(r),
      'Totale Netto': f24Totale(r),
      'N° F24': r.num_f24||0,
      'F24 Zero': r.f24_zero?'Sì':'No',
      'Check Dip.': r.check_dipendenti?'✓':'',
      'Check Aut.': r.check_autonomi?'✓':'',
      'Stato': F24_STATO_CFG[f24Stato(r)]?.label||'—',
      'Protocollo': r.protocollo||'',
      'Note': r.note||'',
    };
  });
  const ws=XLSX.utils.json_to_sheet(rows);
  ws['!cols']=[{wch:30},...F24_TRIBUTI.map(()=>({wch:12})),{wch:14},{wch:14},{wch:14},{wch:8},{wch:10},{wch:12},{wch:12},{wch:12},{wch:14},{wch:20}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,label.substring(0,31));
  XLSX.writeFile(wb,`F24_${label.replace(/\s/g,'_')}.xlsx`);
}

// Export PDF (apre nuova tab con stampa)
function f24ExportPDF(clients, righeMap, label){
  const rows=clients.map(c=>{
    const r=righeMap[c.id]||{};
    const debiti=f24Debiti(r), crediti=f24Crediti(r), totale=f24Totale(r);
    const stato=f24Stato(r);
    return {nome:c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim(),debiti,crediti,totale,stato,protocollo:r.protocollo||'',num_f24:r.num_f24||0,
      tributi:F24_TRIBUTI.map(t=>({label:t.short,val:parseFloat(r[t.key])||0})).filter(t=>t.val!==0)};
  });
  const html=`<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"/>
<title>F24 — ${label}</title>
<style>body{font-family:'Segoe UI',Arial,sans-serif;font-size:10px;color:#1a1a2e;margin:0;padding:16px}h1{font-size:16px;margin:0 0 4px}.sub{color:#666;font-size:10px;margin-bottom:16px}table{width:100%;border-collapse:collapse;margin-bottom:8px}th{background:#1a2235;color:#e4eaf5;font-size:8px;text-transform:uppercase;letter-spacing:.05em;padding:5px 6px;text-align:left}th.r{text-align:right}td{padding:4px 6px;border-bottom:1px solid #e8ecf0;font-size:9px}td.r{text-align:right;font-variant-numeric:tabular-nums}tr:nth-child(even)td{background:#f8f9fc}.ok{color:#1a7a4a;font-weight:700}.attesa{color:#a06000;font-weight:700}.inviato{color:#2255aa;font-weight:700}.zero{color:#3a7a9c}.vuota{color:#999}.totale-row td{font-weight:700;background:#f0f4ff!important;border-top:2px solid #252e42}.footer{margin-top:20px;font-size:8px;color:#999;text-align:center}@media print{body{padding:0}.no-print{display:none}}</style></head><body>
<button class="no-print" onclick="window.print()" style="margin-bottom:12px;padding:6px 14px;background:#c8a45e;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:11px">🖨️ Stampa / Salva PDF</button>
<h1>Tabellone F24 — ${label}</h1><div class="sub">Generato il ${new Date().toLocaleDateString('it-IT')} · ${clients.length} clienti</div>
<table><thead><tr><th>Cliente</th><th class="r">Totale Debiti</th><th class="r">Crediti Comp.</th><th class="r">Totale Netto</th><th class="r">N°F24</th><th>Stato</th><th>Protocollo</th><th>Dettaglio</th></tr></thead>
<tbody>${rows.map(r=>`<tr><td><strong>${r.nome}</strong></td><td class="r">${r.debiti>0?f24FmtN(r.debiti):'—'}</td><td class="r" style="color:#1a7a4a">${r.crediti>0?'- '+f24FmtN(r.crediti):'—'}</td><td class="r"><strong>${r.totale!==0?f24FmtN(r.totale):'—'}</strong></td><td class="r">${r.num_f24||'—'}</td><td class="${r.stato}">${F24_STATO_CFG[r.stato]?.label||'—'}</td><td>${r.protocollo||'—'}</td><td style="font-size:8px;color:#555">${r.tributi.map(t=>`${t.label}: ${f24FmtN(t.val)}`).join(' · ')||'—'}</td></tr>`).join('')}
<tr class="totale-row"><td><strong>TOTALE</strong></td><td class="r">${f24FmtN(rows.reduce((s,r)=>s+r.debiti,0))}</td><td class="r" style="color:#1a7a4a">- ${f24FmtN(rows.reduce((s,r)=>s+r.crediti,0))}</td><td class="r">${f24FmtN(rows.reduce((s,r)=>s+r.totale,0))}</td><td class="r">${rows.reduce((s,r)=>s+r.num_f24,0)}</td><td></td><td></td><td></td></tr>
</tbody></table><div class="footer">FiscoSim v3 — Documento generato automaticamente</div></body></html>`;
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const win=window.open(url,'_blank');
  if(win)win.focus();
  setTimeout(()=>URL.revokeObjectURL(url),10000);
}

// ── MODAL RIGA ──────────────────────────────────────────────
function F24RigaModal({riga,clienteNome,locked,onSave,onClose}){
  const [form,setForm]=useState({
    iva_rate:'',iva_corrente:'',ritenute_dipendenti:'',ritenute_autonomi:'',
    altre_ritenute:'',agecon_36bis:'',cciaa_separata:'',inps_ca:'',
    imposte:'',cciaa_red2024:'',tcg_altri:'',ravvedimenti:'',
    crediti_compensazione:'',f24_zero:false,num_f24:'',
    check_autonomi:false,check_dipendenti:false,note:'',...riga,
  });
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const debiti=f24Debiti(form), crediti=f24Crediti(form), totale=debiti-crediti;
  const stato=f24Stato(form);
  const IS={background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.42rem .6rem',fontSize:'.83rem',width:'100%',textAlign:'right'};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-title">📋 F24 — {clienteNome}</div>
          <div className="modal-sub">Importi a debito e crediti in compensazione</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {locked&&<div className="alert alert-info" style={{marginBottom:'1rem'}}>🔒 Già inviato — protocollo <strong>{riga.protocollo}</strong>. Usa "Ripristina" per modificare.</div>}
          <div style={{fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--gold)',marginBottom:'.6rem'}}>Tributi a debito</div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginBottom:'1.1rem'}}>
            {F24_TRIBUTI.map(t=>(
              <div key={t.key} className="fg" style={{marginBottom:0}}>
                <label style={{fontSize:'.64rem'}}>{t.label}</label>
                <input type="number" step="0.01" placeholder="0,00" value={form[t.key]||''} onChange={e=>up(t.key,e.target.value)} disabled={locked} style={IS}/>
              </div>
            ))}
          </div>
          <div style={{background:'rgba(52,194,122,.06)',border:'1px solid rgba(52,194,122,.25)',borderRadius:10,padding:'.9rem 1rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--gr)',marginBottom:'.6rem'}}>Crediti in compensazione</div>
            <div className="fg" style={{marginBottom:0}}>
              <label style={{fontSize:'.64rem'}}>Importo crediti (valore positivo)</label>
              <input type="number" step="0.01" placeholder="0,00" value={form.crediti_compensazione||''} onChange={e=>up('crediti_compensazione',e.target.value)} disabled={locked}
                style={{...IS,borderColor:'rgba(52,194,122,.4)',color:'var(--gr)',fontWeight:600}}/>
            </div>
          </div>
          {/* Riepilogo */}
          <div style={{background:'var(--s2)',borderRadius:9,padding:'.85rem 1rem',marginBottom:'.85rem'}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'.5rem'}}>
              {[['Totale debiti',f24FmtE(debiti),'var(--gld2)'],['Crediti comp.',crediti>0?'- '+f24FmtE(crediti):'—','var(--gr)'],['Totale netto',f24FmtE(totale),totale>0?'var(--gold)':totale<0?'var(--gr)':'var(--mu)']].map(([l,v,c])=>(
                <div key={l}><div style={{fontSize:'.58rem',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--mu)',fontWeight:600,marginBottom:'.2rem'}}>{l}</div><div style={{fontSize:'.95rem',fontWeight:700,color:c}}>{v}</div></div>
              ))}
            </div>
          </div>
          {/* N°F24 + Zero */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem',marginBottom:'.85rem'}}>
            <div className="fg" style={{marginBottom:0}}>
              <label>N° F24 generati</label>
              <input type="number" min="0" placeholder="0" value={form.num_f24||''} onChange={e=>up('num_f24',e.target.value)} disabled={locked} style={IS}/>
            </div>
            <div className="fg" style={{marginBottom:0}}>
              <label>F24 a zero</label>
              <div onClick={()=>!locked&&up('f24_zero',!form.f24_zero)} style={{display:'flex',alignItems:'center',gap:'.5rem',cursor:locked?'not-allowed':'pointer',padding:'.42rem 0',opacity:locked?.5:1}}>
                <div style={{width:36,height:20,background:form.f24_zero?'var(--bl)':'var(--bd)',borderRadius:10,position:'relative',transition:'background .2s',flexShrink:0}}>
                  <div style={{position:'absolute',top:3,left:form.f24_zero?19:3,width:14,height:14,borderRadius:'50%',background:'#fff',transition:'left .2s'}}/>
                </div>
                <span style={{fontSize:'.8rem',color:form.f24_zero?'var(--bl)':'var(--mu)'}}>{form.f24_zero?'Sì':'No'}</span>
              </div>
            </div>
          </div>
          {/* Check */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.55rem',marginBottom:'.85rem'}}>
            {[['check_dipendenti','✓ Check Dipendenti'],['check_autonomi','✓ Check Autonomi']].map(([k,lbl])=>(
              <div key={k} onClick={()=>!locked&&up(k,!form[k])} style={{background:form[k]?'rgba(52,194,122,.1)':'var(--s2)',border:`1px solid ${form[k]?'rgba(52,194,122,.4)':'var(--bd)'}`,borderRadius:8,padding:'.65rem .85rem',cursor:locked?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:'.6rem',opacity:locked?.6:1}}>
                <div style={{width:18,height:18,borderRadius:4,background:form[k]?'var(--gr)':'transparent',border:`2px solid ${form[k]?'var(--gr)':'var(--bd)'}`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  {form[k]&&<span style={{color:'#0e1118',fontSize:'.6rem',fontWeight:700}}>✓</span>}
                </div>
                <span style={{fontSize:'.8rem',fontWeight:500,color:form[k]?'var(--gr)':'var(--mu)'}}>{lbl}</span>
              </div>
            ))}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'.6rem',marginBottom:'.75rem'}}>
            <span style={{fontSize:'.72rem',color:'var(--mu)'}}>Stato:</span>
            <F24StatoBadge stato={stato}/>
            {form.protocollo&&<span style={{fontSize:'.72rem',color:'var(--cy)'}}>Prot. <strong>{form.protocollo}</strong></span>}
          </div>
          <div className="fg" style={{marginBottom:0}}>
            <label>Note</label>
            <textarea rows={2} placeholder="Note opzionali..." value={form.note||''} onChange={e=>up('note',e.target.value)} disabled={locked} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:'.5rem .75rem',fontSize:'.83rem',width:'100%',resize:'vertical',opacity:locked?.6:1}}/>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Chiudi</button>
          {!locked&&<button className="btn" onClick={()=>onSave(form)}>💾 Salva</button>}
        </div>
      </div>
    </div>
  );
}

// ── MODAL PROTOCOLLO ────────────────────────────────────────
function F24ProtocolloModal({clienti,onConfirm,onClose}){
  const [step,setStep]=useState(1);
  const [prot,setProt]=useState('');
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
        <div className="modal-hdr">
          <div className="modal-title">📤 Protocollo di invio</div>
          <div className="modal-sub">{clienti.length} F24 selezionati</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {step===1?(
            <>
              <div className="fg"><label>Numero protocollo Entratel</label><input autoFocus placeholder="es. 1499" value={prot} onChange={e=>setProt(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:'.6rem .85rem',fontSize:'1.1rem',width:'100%',textAlign:'center',letterSpacing:'.05em'}}/></div>
              <div className="alert alert-warn" style={{marginTop:'.75rem'}}>⚠️ Dopo la conferma lo stato passerà a <strong>INVIATO</strong> e i dati saranno bloccati.</div>
            </>
          ):(
            <>
              <div className="alert alert-info" style={{marginBottom:'1rem'}}>Protocollo: <strong style={{fontSize:'1rem'}}>{prot}</strong> · {clienti.length} F24</div>
              <div style={{fontSize:'.78rem',color:'var(--mu)',marginBottom:'.5rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em'}}>Clienti che passeranno a INVIATO:</div>
              <div style={{maxHeight:240,overflowY:'auto',display:'flex',flexDirection:'column',gap:'.3rem'}}>
                {clienti.map(c=>(
                  <div key={c.id} style={{background:'var(--s2)',borderRadius:7,padding:'.5rem .75rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <span style={{fontSize:'.83rem',fontWeight:500}}>{c.nome}</span>
                    <span style={{fontSize:'.72rem',color:'var(--gold)'}}>{f24FmtE(f24Totale(c.riga))}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          {step===1?<button className="btn" disabled={!prot.trim()} onClick={()=>setStep(2)}>Avanti →</button>
            :<><button className="btn-sec" onClick={()=>setStep(1)}>← Indietro</button><button className="btn" onClick={()=>onConfirm(prot.trim())}>✅ Conferma invio</button></>}
        </div>
      </div>
    </div>
  );
}

// ── MODAL RIPRISTINA ─────────────────────────────────────────
function F24RipristinaModal({clienteNome,protocollo,onConfirm,onClose}){
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
        <div className="modal-hdr">
          <div className="modal-title" style={{color:'var(--rd)'}}>⚠️ Ripristina F24</div>
          <div className="modal-sub">{clienteNome}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-err">Stai ripristinando un F24 già inviato con protocollo <strong>{protocollo}</strong>.<br/>Lo stato tornerà a <strong>OK</strong> e potrai modificarlo.<br/><br/><strong>Sei sicuro?</strong></div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" style={{background:'var(--rd)',backgroundImage:'none'}} onClick={onConfirm}>🔓 Sì, ripristina</button>
        </div>
      </div>
    </div>
  );
}

// ── MODAL NUOVA SCADENZA ────────────────────────────────────
function F24NuovaScadenzaModal({onSave,onClose}){
  const [label,setLabel]=useState('');
  const [data,setData]=useState('');
  const sugg=[['16 Marzo '+new Date().getFullYear(),''],['16 Giugno '+new Date().getFullYear(),''],['16 Settembre '+new Date().getFullYear(),''],['16 Novembre '+new Date().getFullYear(),''],['16 Dicembre '+new Date().getFullYear(),'']];
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:420}}>
        <div className="modal-hdr">
          <div className="modal-title">📅 Nuova scadenza F24</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{display:'flex',gap:'.4rem',flexWrap:'wrap',marginBottom:'.85rem'}}>
            {sugg.map(([l])=><span key={l} className="pill" style={{fontSize:'.7rem',cursor:'pointer'}} onClick={()=>setLabel(l)}>{l}</span>)}
          </div>
          <div className="fg"><label>Etichetta *</label><input value={label} onChange={e=>setLabel(e.target.value)} placeholder="es. 16 Marzo 2026" autoFocus/></div>
          <div className="fg"><label>Data scadenza *</label><input type="date" value={data} onChange={e=>setData(e.target.value)}/></div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={!label.trim()||!data} onClick={()=>onSave({label:label.trim(),data_scadenza:data})}>➕ Crea</button>
        </div>
      </div>
    </div>
  );
}

// ── TABELLONE ────────────────────────────────────────────────
function F24Tabellone({scadenza,clients}){
  const [righe,setRighe]=useState([]);
  const [loading,setLoading]=useState(true);
  const [editRiga,setEditRiga]=useState(null);
  const [ripristinaRiga,setRipristina]=useState(null);
  const [search,setSearch]=useState('');
  const [filterStato,setFilterStato]=useState('tutti');
  const [filterTributo,setFilterTributo]=useState('tutti');
  const [selected,setSelected]=useState(new Set());
  const [showProt,setShowProt]=useState(false);

  useEffect(()=>{loadRighe();},[scadenza.id]);

  const loadRighe=async()=>{setLoading(true);const{data}=await sb.from('f24_righe').select('*').eq('scadenza_id',scadenza.id);setRighe(data||[]);setSelected(new Set());setLoading(false);};
  const getRiga=useCallback(id=>righe.find(r=>r.client_id===id)||{},[righe]);

  const clientiOrd=useMemo(()=>[...clients].sort((a,b)=>{
    const na=(a.ragione_sociale||a.nome||'').toLowerCase();
    const nb=(b.ragione_sociale||b.nome||'').toLowerCase();
    return na.localeCompare(nb,'it');
  }),[clients]);

  const righeMap=useMemo(()=>Object.fromEntries(clientiOrd.map(c=>[c.id,getRiga(c.id)])),[clientiOrd,righe]);

  const handleSave=async(clientId,form)=>{
    const existing=righe.find(r=>r.client_id===clientId);
    const payload={
      scadenza_id:scadenza.id, client_id:clientId, updated_at:new Date().toISOString(),
      ...F24_TRIBUTI.reduce((o,t)=>({...o,[t.key]:parseFloat(form[t.key])||0}),{}),
      crediti_compensazione:parseFloat(form.crediti_compensazione)||0,
      f24_zero:form.f24_zero||false, num_f24:parseInt(form.num_f24)||0,
      check_autonomi:form.check_autonomi||false, check_dipendenti:form.check_dipendenti||false,
      note:form.note||null,
    };
    const statoCalc=f24Stato({...payload,stato_invio:'bozza'});
    const stato_invio=statoCalc==='ok'?'ok':'bozza';
    if(existing?.id){await sb.from('f24_righe').update({...payload,stato_invio}).eq('id',existing.id);}
    else{await sb.from('f24_righe').insert({...payload,stato_invio});}
    setEditRiga(null); loadRighe();
  };

  const handleProtocolloConfirm=async(protocollo)=>{
    const ids=[...selected].map(cId=>righe.find(r=>r.client_id===cId)?.id).filter(Boolean);
    if(ids.length>0)await sb.from('f24_righe').update({stato_invio:'inviato',protocollo}).in('id',ids);
    setShowProt(false); loadRighe();
  };

  const handleRipristina=async(rigaId)=>{
    await sb.from('f24_righe').update({stato_invio:'ok',protocollo:null}).eq('id',rigaId);
    setRipristina(null); loadRighe();
  };

  const stats=useMemo(()=>{
    const all=clientiOrd.map(c=>({c,r:getRiga(c.id)}));
    return{
      ok:all.filter(x=>f24Stato(x.r)==='ok').length,
      attesa:all.filter(x=>f24Stato(x.r)==='attesa').length,
      inviato:all.filter(x=>f24Stato(x.r)==='inviato').length,
      zero:all.filter(x=>f24Stato(x.r)==='zero').length,
      vuota:all.filter(x=>f24Stato(x.r)==='vuota').length,
      totDebiti:all.reduce((s,x)=>s+f24Debiti(x.r),0),
      totCrediti:all.reduce((s,x)=>s+f24Crediti(x.r),0),
      totNetto:all.reduce((s,x)=>s+f24Totale(x.r),0),
    };
  },[righe,clientiOrd]);

  const filtered=useMemo(()=>clientiOrd.filter(c=>{
    const r=getRiga(c.id);
    const nome=c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim();
    const mS=!search||nome.toLowerCase().includes(search.toLowerCase());
    const mSt=filterStato==='tutti'||f24Stato(r)===filterStato;
    const mT=filterTributo==='tutti'||(parseFloat(r[filterTributo])||0)!==0;
    return mS&&mSt&&mT;
  }),[clientiOrd,righe,search,filterStato,filterTributo]);

  const toggleSel=id=>setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>{
    const okIds=filtered.filter(c=>f24Stato(getRiga(c.id))==='ok').map(c=>c.id);
    const allSel=okIds.length>0&&okIds.every(id=>selected.has(id));
    setSelected(prev=>{const n=new Set(prev);allSel?okIds.forEach(id=>n.delete(id)):okIds.forEach(id=>n.add(id));return n;});
  };
  const selectedOk=[...selected].filter(id=>f24Stato(getRiga(id))==='ok');
  const selectedClienti=selectedOk.map(id=>({...clients.find(c=>c.id===id),riga:getRiga(id)}));

  const TH=(ex={})=>({background:'var(--s2)',color:'var(--mu)',fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',padding:'.6rem .5rem',borderBottom:'1px solid var(--bd)',...ex});
  const TD=(ex={})=>({padding:'.52rem .5rem',borderBottom:'1px solid rgba(37,46,66,.4)',...ex});

  if(loading)return<div className="loading">⏳ Caricamento...</div>;

  return(
    <div>
      {/* STATS */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))',gap:'.75rem',marginBottom:'1.25rem'}}>
        {[['✓ OK / pronti',stats.ok,'var(--gr)'],['⏳ In attesa',stats.attesa,'var(--gld2)'],['📤 Inviati',stats.inviato,'var(--bl)'],['0 A zero',stats.zero,'var(--cy)'],['⚠ Da compilare',stats.vuota,'var(--rd)'],['Tot. debiti',f24FmtE(stats.totDebiti),'var(--gld2)'],['Tot. crediti',stats.totCrediti>0?'- '+f24FmtE(stats.totCrediti):'—','var(--gr)'],['Tot. netto',f24FmtE(stats.totNetto),'var(--gold)']].map(([l,v,c])=>(
          <div key={l} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:10,padding:'.75rem .9rem'}}>
            <div style={{fontSize:'.58rem',textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',fontWeight:600,marginBottom:'.2rem'}}>{l}</div>
            <div style={{fontSize:'.9rem',fontWeight:700,color:c}}>{v}</div>
          </div>
        ))}
      </div>

      {/* TOOLBAR */}
      <div style={{display:'flex',gap:'.6rem',marginBottom:'1rem',flexWrap:'wrap',alignItems:'center'}}>
        <input className="search-bar" style={{margin:0,flex:1,minWidth:150}} placeholder="🔍 Cerca cliente..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <select value={filterStato} onChange={e=>setFilterStato(e.target.value)} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:9,color:'var(--tx)',padding:'.52rem .9rem',fontSize:'.82rem'}}>
          <option value="tutti">Tutti gli stati</option>
          <option value="ok">✓ OK</option>
          <option value="attesa">⏳ In attesa</option>
          <option value="inviato">📤 Inviato</option>
          <option value="zero">0 A zero</option>
          <option value="vuota">⚠ Da compilare</option>
        </select>
        <select value={filterTributo} onChange={e=>setFilterTributo(e.target.value)} style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:9,color:'var(--tx)',padding:'.52rem .9rem',fontSize:'.82rem'}}>
          <option value="tutti">Tutti i tributi</option>
          {F24_TRIBUTI.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
        <div style={{display:'flex',gap:'.4rem',marginLeft:'auto'}}>
          <button className="btn-sec btn-sm" onClick={()=>f24ExportExcel(clientiOrd,righeMap,scadenza.label)}>📊 Excel</button>
          <button className="btn-sec btn-sm" onClick={()=>f24ExportPDF(clientiOrd,righeMap,scadenza.label)}>📄 PDF</button>
          {selectedOk.length>0&&<button className="btn btn-sm" onClick={()=>setShowProt(true)}>📤 Protocollo ({selectedOk.length})</button>}
        </div>
      </div>

      {/* TABELLA */}
      <div style={{background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:12,overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.78rem',minWidth:1100}}>
            <thead>
              <tr>
                <th style={TH({textAlign:'center',width:36})}>
                  <div style={{width:15,height:15,borderRadius:3,border:'1.5px solid var(--bd2)',background:'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto'}} onClick={toggleAll}>
                    {filtered.filter(c=>f24Stato(getRiga(c.id))==='ok').every(c=>selected.has(c.id))&&filtered.filter(c=>f24Stato(getRiga(c.id))==='ok').length>0&&<span style={{color:'var(--gold)',fontSize:'.6rem'}}>✓</span>}
                  </div>
                </th>
                <th style={TH({textAlign:'left',position:'sticky',left:0,zIndex:2,minWidth:160})}>Cliente</th>
                {F24_TRIBUTI.map(t=><th key={t.key} style={TH({textAlign:'right',whiteSpace:'nowrap'})}>{t.short}</th>)}
                <th style={TH({textAlign:'right',color:'var(--gr)'})}>Crediti</th>
                <th style={TH({textAlign:'right'})}>Debiti</th>
                <th style={TH({textAlign:'right'})}>Netto</th>
                <th style={TH({textAlign:'center'})}>N°F24</th>
                <th style={TH({textAlign:'center'})}>Stato</th>
                <th style={TH({textAlign:'center'})}>Prot.</th>
                <th style={TH({textAlign:'center'})}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c=>{
                const r=getRiga(c.id);
                const stato=f24Stato(r);
                const isInviato=stato==='inviato';
                const isOk=stato==='ok';
                const debiti=f24Debiti(r), crediti=f24Crediti(r), totale=debiti-crediti;
                const nome=c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim();
                return(
                  <tr key={c.id} style={{opacity:isInviato?.75:1}}>
                    <td style={TD({textAlign:'center'})}>
                      {isOk&&<div style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${selected.has(c.id)?'var(--gold)':'var(--bd2)'}`,background:selected.has(c.id)?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto'}} onClick={()=>toggleSel(c.id)}>
                        {selected.has(c.id)&&<span style={{color:'#0d1117',fontSize:'.55rem',fontWeight:700}}>✓</span>}
                      </div>}
                    </td>
                    <td style={TD({fontWeight:500,position:'sticky',left:0,background:isInviato?'rgba(14,17,24,.97)':'var(--s1)',zIndex:1,cursor:'pointer'})}
                      onClick={()=>setEditRiga({clientId:c.id,nome,riga:r,locked:isInviato})}>
                      {nome}{r.note&&<span style={{marginLeft:'.35rem',fontSize:'.6rem'}}>💬</span>}
                    </td>
                    {F24_TRIBUTI.map(t=>{
                      const val=parseFloat(r[t.key])||0;
                      return <td key={t.key} style={TD({textAlign:'right',color:val>0?'var(--tx)':'var(--bd)',fontVariantNumeric:'tabular-nums',cursor:'pointer'})}
                        onClick={()=>setEditRiga({clientId:c.id,nome,riga:r,locked:isInviato})}>
                        {val>0?f24Fmt(val):''}
                      </td>;
                    })}
                    <td style={TD({textAlign:'right',color:'var(--gr)',fontWeight:600})}>{crediti>0?'- '+f24Fmt(crediti):'—'}</td>
                    <td style={TD({textAlign:'right',color:'var(--gld2)',fontWeight:600})}>{debiti>0?f24Fmt(debiti):'—'}</td>
                    <td style={TD({textAlign:'right',fontWeight:700,color:totale>0?'var(--gold)':totale<0?'var(--gr)':'var(--mu)'})}>{totale!==0?f24Fmt(totale):'—'}</td>
                    <td style={TD({textAlign:'center',color:'var(--mu)'})}>{r.num_f24||'—'}</td>
                    <td style={TD({textAlign:'center'})}><F24StatoBadge stato={stato}/></td>
                    <td style={TD({textAlign:'center',fontSize:'.7rem',color:'var(--cy)'})}>{r.protocollo||'—'}</td>
                    <td style={TD({textAlign:'center'})}>
                      <div style={{display:'flex',gap:'.3rem',justifyContent:'center'}}>
                        <button className="btn-icon" style={{fontSize:'.7rem',padding:'.22rem .5rem'}} onClick={()=>setEditRiga({clientId:c.id,nome,riga:r,locked:isInviato})}>{isInviato?'👁':'✏️'}</button>
                        {isInviato&&<button className="btn-icon" style={{fontSize:'.7rem',padding:'.22rem .5rem',borderColor:'rgba(78,142,247,.3)',color:'var(--bl)'}} onClick={()=>setRipristina({id:r.id,nome,protocollo:r.protocollo})}>🔓</button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{fontSize:'.68rem',color:'var(--mu)',marginTop:'.5rem'}}>
        {filtered.length} clienti · Clicca riga per inserire dati · Seleziona OK per inserire protocollo · 📊 Excel e 📄 PDF per esportare
      </div>

      {editRiga&&<F24RigaModal riga={editRiga.riga} clienteNome={editRiga.nome} locked={editRiga.locked} onSave={f=>handleSave(editRiga.clientId,f)} onClose={()=>setEditRiga(null)}/>}
      {showProt&&<F24ProtocolloModal clienti={selectedClienti} onConfirm={handleProtocolloConfirm} onClose={()=>setShowProt(false)}/>}
      {ripristinaRiga&&<F24RipristinaModal clienteNome={ripristinaRiga.nome} protocollo={ripristinaRiga.protocollo} onConfirm={()=>handleRipristina(ripristinaRiga.id)} onClose={()=>setRipristina(null)}/>}
    </div>
  );
}

// ── MODULO F24 PRINCIPALE ───────────────────────────────────
