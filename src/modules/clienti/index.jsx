import { useState, useEffect, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { TIPO_LABEL, TIPO_COLOR, MODULI_DEFAULT, MODULI_DISPONIBILI, TIPO_CLIENTE } from '../../shared/constants'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloClienti(){
  const [clienti,setClienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState("");
  const [filtroTipo,setFiltroTipo]=useState("tutti");
  const [modal,setModal]=useState(null);
  const [mailModal,setMailModal]=useState(null);
  const [moduliModal,setModuliModal]=useState(null);
  const [bulkModal,setBulkModal]=useState(false);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState(null);
  const [selected,setSelected]=useState(new Set());
  const EMPTY={nome:"",cognome:"",ragione_sociale:"",tipo_cliente:"forfettario",email:"",email_cc:[],codice_fiscale:"",partita_iva:"",note:"",moduli_attivi:MODULI_DEFAULT};

  const carica=useCallback(async()=>{
    setLoading(true);
    const{data}=await sb.from("clienti").select("*").eq("attivo",true).order("nome");
    setClienti(data||[]);setLoading(false);
  },[]);
  useEffect(()=>{carica();},[carica]);

  const filtered=clienti.filter(c=>{
    const q=search.toLowerCase();
    const mQ=!q||(c.nome+" "+(c.cognome||"")+" "+(c.ragione_sociale||"")+" "+(c.email||"")).toLowerCase().includes(q);
    const mT=filtroTipo==="tutti"||c.tipo_cliente===filtroTipo;
    return mQ&&mT;
  });

  const salva=async(data)=>{setSaving(true);setErr(null);try{if(modal.mode==="new"){const{error}=await sb.from("clienti").insert([data]);if(error)throw error;}else{const{error}=await sb.from("clienti").update(data).eq("id",modal.data.id);if(error)throw error;}await carica();setModal(null);}catch(e){setErr(e.message);}finally{setSaving(false);}};
  const elimina=async(id)=>{if(!confirm("Eliminare questo cliente?"))return;await sb.from("clienti").update({attivo:false}).eq("id",id);carica();};

  const salvaModuli=async(clienteId,moduli)=>{
    await sb.from("clienti").update({moduli_attivi:moduli}).eq("id",clienteId);
    await carica();
  };

  const toggleSel=id=>setSelected(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSelected(p=>p.size===filtered.length?new Set():new Set(filtered.map(c=>c.id)));
  const selClienti=clienti.filter(c=>selected.has(c.id));
  const allSel=filtered.length>0&&filtered.every(c=>selected.has(c.id));

  return(
    <div className="page">
      {modal&&<ClienteModal mode={modal.mode} data={modal.data||EMPTY} onSave={salva} onClose={()=>setModal(null)} saving={saving} err={err}/>}
      {mailModal&&<SendMailModal cliente={mailModal} onClose={()=>setMailModal(null)}/>}
      {moduliModal&&<ModuliModal cliente={moduliModal} onSave={salvaModuli} onClose={()=>setModuliModal(null)}/>}
      {bulkModal&&<ModuliBulkModal clienti={selClienti} onSave={salvaModuli} onClose={()=>{setBulkModal(false);setSelected(new Set());}}/>}

      <div className="page-hdr"><div className="page-title">👥 Clienti</div><div className="page-sub">{clienti.length} clienti in archivio</div></div>

      <div style={{display:"flex",gap:".6rem",marginBottom:".85rem",alignItems:"center",flexWrap:"wrap"}}>
        <input className="search-bar" style={{margin:0,flex:1,minWidth:200}} placeholder="🔍  Cerca nome, email, P.IVA..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="btn" onClick={()=>setModal({mode:"new",data:EMPTY})}>+ Nuovo Cliente</button>
      </div>

      <div className="pills">{["tutti",...TIPO_CLIENTE].map(t=><span key={t} className={"pill"+(filtroTipo===t?" active":"")} onClick={()=>setFiltroTipo(t)}>{t==="tutti"?"Tutti ("+clienti.length+")":TIPO_LABEL[t]}</span>)}</div>

      {/* Barra selezione bulk */}
      {selected.size>0&&(
        <div style={{background:"rgba(200,164,94,.08)",border:"1px solid rgba(200,164,94,.3)",borderRadius:10,padding:".65rem 1rem",marginBottom:".75rem",display:"flex",alignItems:"center",gap:".75rem",flexWrap:"wrap"}}>
          <span style={{fontSize:".8rem",fontWeight:600,color:"var(--gld2)"}}>{selected.size} selezionati</span>
          <button className="btn btn-sm" onClick={()=>setBulkModal(true)}>⚙️ Gestisci moduli</button>
          <button className="btn-sec btn-sm" onClick={()=>setSelected(new Set())}>Deseleziona tutti</button>
        </div>
      )}

      {loading?<div className="loading">⏳ Caricamento...</div>:filtered.length===0?(
        <div className="empty"><div className="empty-ico">👥</div><div className="empty-t">{clienti.length===0?"Nessun cliente":"Nessun risultato"}</div><div className="empty-s">{clienti.length===0?"Aggiungi il primo cliente o importa da Excel":"Cambia la ricerca o il filtro"}</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th style={{width:32}}>
                  <div style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${allSel?"var(--gold)":"var(--bd2)"}`,background:allSel?"var(--gold)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={toggleAll}>
                    {allSel&&<span style={{color:"#0d1117",fontSize:".6rem",fontWeight:700}}>✓</span>}
                  </div>
                </th>
                <th>Codice</th><th>Cliente</th><th>Tipo</th><th>Moduli</th><th>Email</th><th>P.IVA / C.F.</th><th>Azioni</th>
              </tr></thead>
              <tbody>{filtered.map(c=>{
                const moduli=(c.moduli_attivi||MODULI_DEFAULT);
                const isSel=selected.has(c.id);
                return(
                  <tr key={c.id} style={isSel?{background:"rgba(200,164,94,.04)"}:{}}>
                    <td>
                      <div style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${isSel?"var(--gold)":"var(--bd2)"}`,background:isSel?"var(--gold)":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}} onClick={()=>toggleSel(c.id)}>
                        {isSel&&<span style={{color:"#0d1117",fontSize:".6rem",fontWeight:700}}>✓</span>}
                      </div>
                    </td>
                    <td><span style={{fontFamily:'monospace',fontWeight:700,color:'var(--gold)',background:'rgba(200,164,94,.1)',padding:'.15rem .4rem',borderRadius:4,fontSize:'.75rem'}}>{c.codice_cliente||'—'}</span></td>
                    <td><span style={{fontWeight:600,cursor:"pointer"}} onClick={()=>setModal({mode:"edit",data:c})}>{c.ragione_sociale||`${c.nome} ${c.cognome||""}`.trim()}</span></td>
                    <td><span className={"bdg "+TIPO_COLOR[c.tipo_cliente]}>{TIPO_LABEL[c.tipo_cliente]}</span></td>
                    <td>
                      <div style={{display:"flex",gap:".2rem",flexWrap:"wrap"}}>
                        {MODULI_DISPONIBILI.map(m=>(
                          <span key={m.id} title={m.label} style={{fontSize:".75rem",opacity:moduli.includes(m.id)?1:.2,cursor:"pointer"}} onClick={()=>setModuliModal(c)}>{m.ico}</span>
                        ))}
                      </div>
                    </td>
                    <td><span style={{fontSize:".78rem",color:"var(--mu)"}}>{c.email||"—"}</span></td>
                    <td><span style={{fontSize:".75rem",color:"var(--mu)"}}>{c.partita_iva||c.codice_fiscale||"—"}</span></td>
                    <td><div className="tbl-actions">
                      <button className="btn-icon" title="Moduli" onClick={()=>setModuliModal(c)}>⚙️</button>
                      <button className="btn-icon" onClick={()=>setModal({mode:"edit",data:c})}>✏️</button>
                      {c.email&&<button className="btn-icon" onClick={()=>setMailModal(c)}>📧</button>}
                      <button className="btn-icon" style={{borderColor:"rgba(224,82,82,.3)",color:"#ff8585"}} onClick={()=>elimina(c.id)}>🗑</button>
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}


// ─── MODAL NUOVO/MODIFICA CLIENTE ────────────────────────────
function ClienteModal({mode, data, onSave, onClose, saving, err}){
  const [form,setForm]=useState({...data});
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const isNew=mode==='new';

  const handleSave=()=>{
    if(!form.nome&&!form.ragione_sociale){alert('Inserisci almeno il nome o la ragione sociale.');return;}
    onSave(form);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:580}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">{isNew?'➕ Nuovo Cliente':'✏️ Modifica Cliente'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {err&&<div className="alert alert-error" style={{marginBottom:'1rem'}}>{err}</div>}
          <div className="form-grid">
            <div className="fg"><label>Nome</label><input value={form.nome||''} onChange={e=>up('nome',e.target.value)} placeholder="Nome"/></div>
            <div className="fg"><label>Cognome</label><input value={form.cognome||''} onChange={e=>up('cognome',e.target.value)} placeholder="Cognome"/></div>
            <div className="fg full"><label>Ragione Sociale</label><input value={form.ragione_sociale||''} onChange={e=>up('ragione_sociale',e.target.value)} placeholder="Per società e ditte"/></div>
            <div className="fg"><label>Tipo Cliente</label>
              <select value={form.tipo_cliente||'forfettario'} onChange={e=>up('tipo_cliente',e.target.value)}>
                {TIPO_CLIENTE.map(t=><option key={t} value={t}>{TIPO_LABEL[t]}</option>)}
              </select>
            </div>
            <div className="fg"><label>Codice Cliente</label><input value={form.codice_cliente||''} onChange={e=>up('codice_cliente',e.target.value)} placeholder="Es. CLI001"/></div>
            <div className="fg"><label>Partita IVA</label><input value={form.partita_iva||''} onChange={e=>up('partita_iva',e.target.value)} placeholder="IT12345678901"/></div>
            <div className="fg"><label>Codice Fiscale</label><input value={form.codice_fiscale||''} onChange={e=>up('codice_fiscale',e.target.value)} placeholder="RSSMRA80A01H501Z"/></div>
            <div className="fg"><label>Email</label><input type="email" value={form.email||''} onChange={e=>up('email',e.target.value)} placeholder="email@esempio.it"/></div>
            <div className="fg"><label>Telefono</label><input value={form.telefono||''} onChange={e=>up('telefono',e.target.value)} placeholder="+39 06 12345678"/></div>
            <div className="fg full"><label>Indirizzo</label><input value={form.indirizzo||''} onChange={e=>up('indirizzo',e.target.value)} placeholder="Via Roma 1, 00100 Roma"/></div>
            <div className="fg full"><label>Note</label><textarea value={form.note||''} onChange={e=>up('note',e.target.value)} rows={2} placeholder="Note interne" style={{resize:'vertical'}}/></div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving} onClick={handleSave}>{saving?'⏳ Salvo...':'💾 Salva'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL INVIO EMAIL ────────────────────────────────────────
function SendMailModal({cliente, onClose}){
  const [oggetto,setOggetto]=useState('');
  const [testo,setTesto]=useState('');
  const [sending,setSending]=useState(false);
  const send=async()=>{
    if(!oggetto||!testo){alert('Compila oggetto e testo.');return;}
    setSending(true);
    try{
      await sb.from('notifiche_clienti').insert([{cliente_id:cliente.id,tipo:'email',oggetto,testo,stato:'da_inviare'}]);
      alert("Email accodata per l'invio.");onClose();
    }catch(e){alert('Errore: '+e.message);}
    finally{setSending(false);}
  };
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">📧 Invia Email a {cliente.ragione_sociale||cliente.nome}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Oggetto</label><input value={oggetto} onChange={e=>setOggetto(e.target.value)} placeholder="Oggetto email"/></div>
            <div className="fg full"><label>Testo</label><textarea value={testo} onChange={e=>setTesto(e.target.value)} rows={6} placeholder="Testo email..." style={{resize:'vertical'}}/></div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={sending} onClick={send}>{sending?'⏳ Invio...':'📤 Invia'}</button></div>
      </div>
    </div>
  );
}

// ─── MODAL GESTIONE MODULI SINGOLO CLIENTE ────────────────────
function ModuliModal({cliente, onSave, onClose}){
  const [moduli,setModuli]=useState(cliente.moduli_attivi||MODULI_DEFAULT);
  const [saving,setSaving]=useState(false);
  const toggle=id=>setModuli(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const save=async()=>{setSaving(true);await onSave(cliente.id,moduli);setSaving(false);onClose();};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">⚙️ Moduli — {cliente.ragione_sociale||cliente.nome}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
            {MODULI_DISPONIBILI.map(m=>(
              <div key={m.id} onClick={()=>toggle(m.id)} style={{display:'flex',alignItems:'center',gap:'.75rem',padding:'.65rem .9rem',borderRadius:8,border:`1.5px solid ${moduli.includes(m.id)?'var(--gold)':'var(--bd)'}`,background:moduli.includes(m.id)?'rgba(200,164,94,.08)':'transparent',cursor:'pointer',transition:'all .15s'}}>
                <span style={{fontSize:'1.1rem'}}>{m.ico}</span>
                <span style={{fontWeight:500,color:moduli.includes(m.id)?'var(--gold)':'var(--mu)'}}>{m.label}</span>
                <span style={{marginLeft:'auto',fontSize:'.75rem',color:moduli.includes(m.id)?'var(--gold)':'var(--bd2)'}}>{moduli.includes(m.id)?'✓ Attivo':'—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={saving} onClick={save}>{saving?'⏳...':'💾 Salva'}</button></div>
      </div>
    </div>
  );
}

// ─── MODAL GESTIONE MODULI BULK ───────────────────────────────
function ModuliBulkModal({clienti, onSave, onClose}){
  const [moduli,setModuli]=useState(MODULI_DEFAULT);
  const [saving,setSaving]=useState(false);
  const toggle=id=>setModuli(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const save=async()=>{
    setSaving(true);
    for(const c of clienti) await onSave(c.id,moduli);
    setSaving(false);onClose();
  };
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:400}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">⚙️ Moduli per {clienti.length} clienti</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="alert alert-info" style={{marginBottom:'1rem',fontSize:'.8rem'}}>I moduli selezionati verranno applicati a tutti i {clienti.length} clienti selezionati.</div>
          <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
            {MODULI_DISPONIBILI.map(m=>(
              <div key={m.id} onClick={()=>toggle(m.id)} style={{display:'flex',alignItems:'center',gap:'.75rem',padding:'.65rem .9rem',borderRadius:8,border:`1.5px solid ${moduli.includes(m.id)?'var(--gold)':'var(--bd)'}`,background:moduli.includes(m.id)?'rgba(200,164,94,.08)':'transparent',cursor:'pointer',transition:'all .15s'}}>
                <span style={{fontSize:'1.1rem'}}>{m.ico}</span>
                <span style={{fontWeight:500,color:moduli.includes(m.id)?'var(--gold)':'var(--mu)'}}>{m.label}</span>
                <span style={{marginLeft:'auto',fontSize:'.75rem',color:moduli.includes(m.id)?'var(--gold)':'var(--bd2)'}}>{moduli.includes(m.id)?'✓':'—'}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={saving} onClick={save}>{saving?'⏳ Salvo...':'💾 Applica a tutti'}</button></div>
      </div>
    </div>
  );
}

// ─── IVA IMPORT (PDF / Excel via Claude AI) ──────────────────
async function estraiDatiIVADaPDF(base64, mimeType, useAI=true) {
  if(!useAI)return null; // Caller will show manual input form
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "claude",
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `Sei un esperto di contabilità IVA italiana. Analizza il documento e rispondi SOLO con JSON valido, zero testo aggiuntivo.`,
      messages: [{
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: `Estrai i dati di liquidazione IVA da questo documento. Rispondi SOLO con JSON:
{
  "cliente_nome": "nome cliente/contribuente o stringa vuota",
  "partita_iva": "P.IVA o stringa vuota",
  "periodo": "es. Q1 2025 o Gennaio 2025",
  "tipo_periodo": "trimestrale o mensile",
  "anno": 2025,
  "trimestre": 1,
  "mese": null,
  "iva_vendite": 0.00,
  "iva_acquisti": 0.00,
  "iva_precedente": 0.00,
  "note": "eventuali note rilevanti"
}` }
        ]
      }]
    })
  });
  const data = await res.json();
  const txt = data.content?.[0]?.text || "{}";
  return JSON.parse(txt.replace(/```json|```/g, "").trim());
}

async function estraiDatiIVADaExcel(file, useAI=true) {
  if(!useAI)return null; // Caller will show manual input form
  const XLSX = window.XLSX;
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const testo = XLSX.utils.sheet_to_csv(ws).slice(0, 4000);

  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: "claude",
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: `Sei un esperto di contabilità IVA italiana. Analizza il testo CSV di un foglio Excel e rispondi SOLO con JSON valido, zero testo aggiuntivo.`,
      messages: [{
        role: "user",
        content: `Dati Excel (CSV):\n${testo}\n\nEstrai i dati di liquidazione IVA. Rispondi SOLO con JSON:
{
  "cliente_nome": "",
  "partita_iva": "",
  "periodo": "es. Q1 2025",
  "tipo_periodo": "trimestrale",
  "anno": 2025,
  "trimestre": 1,
  "mese": null,
  "iva_vendite": 0.00,
  "iva_acquisti": 0.00,
  "iva_precedente": 0.00,
  "note": ""
}`
      }]
    })
  });
  const data = await res.json();
  const txt = data.content?.[0]?.text || "{}";
  return JSON.parse(txt.replace(/```json|```/g, "").trim());
}

// ─── MODULO LIQUIDAZIONE IVA (con import superiore) ──────────
