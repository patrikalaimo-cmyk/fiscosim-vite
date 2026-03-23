import { useState, useEffect, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { TIPO_LABEL, TIPO_COLOR, MESI, ALLEGATO_LABEL, CICLICITA_LABEL, TIPO_CLIENTE } from '../../shared/constants'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloAdempimenti(){
  const [list,setList]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [destModal,setDestModal]=useState(null);
  const [saving,setSaving]=useState(false);
  const EMPTY={nome:"",oggetto:"",corpo:"",allegato_tipo:"nessuno",ciclicita:"unica",giorno_invio:null,mese_invio:null,data_invio:null};
  const carica=useCallback(async()=>{setLoading(true);const[{data:a},{data:c}]=await Promise.all([sb.from("adempimenti_template").select("*").eq("attivo",true).order("nome"),sb.from("clienti").select("id,nome,cognome,ragione_sociale,tipo_cliente,email").eq("attivo",true).order("nome")]);setList(a||[]);setClienti(c||[]);setLoading(false);},[]);
  useEffect(()=>{carica();},[carica]);
  const salva=async(data)=>{setSaving(true);try{if(modal.mode==="new"){const{error}=await sb.from("adempimenti_template").insert([data]);if(error)throw error;}else{const{error}=await sb.from("adempimenti_template").update(data).eq("id",modal.data.id);if(error)throw error;}await carica();setModal(null);}catch(e){alert(e.message);}finally{setSaving(false);}};
  const elimina=async(id)=>{if(!confirm("Eliminare?"))return;await sb.from("adempimenti_template").update({attivo:false}).eq("id",id);carica();};
  return(
    <div className="page">
      {modal&&<AdempimentoModal mode={modal.mode} data={modal.data||EMPTY} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>}
      {destModal&&<DestinatariModal adempimento={destModal} clienti={clienti} onClose={()=>setDestModal(null)}/>}
      <div className="page-hdr"><div className="page-title">📬 Adempimenti</div><div className="page-sub">Template email per comunicazioni ai clienti</div></div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:".85rem"}}><button className="btn" onClick={()=>setModal({mode:"new",data:EMPTY})}>+ Nuovo Template</button></div>
      {loading?<div className="loading">⏳</div>:list.length===0?(
        <div className="empty"><div className="empty-ico">📬</div><div className="empty-t">Nessun adempimento</div><div className="empty-s">Crea template per TCG, liquidazione IVA, imposta di registro...</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <table className="tbl">
            <thead><tr><th>Nome</th><th>Oggetto</th><th>Ciclicità</th><th>Allegato</th><th>Azioni</th></tr></thead>
            <tbody>{list.map(a=>(
              <tr key={a.id}>
                <td style={{fontWeight:600}}>{a.nome}</td>
                <td style={{fontSize:".78rem",color:"var(--mu)",maxWidth:220,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.oggetto}</td>
                <td><span className="bdg bdg-blue">{CICLICITA_LABEL[a.ciclicita]}</span></td>
                <td><span className="bdg bdg-pu">{ALLEGATO_LABEL[a.allegato_tipo]}</span></td>
                <td><div className="tbl-actions">
                  <button className="btn-sec btn-sm" title="Destinatari" onClick={()=>setDestModal(a)}>👥</button>
                  <button className="btn-icon" onClick={()=>setModal({mode:"edit",data:a})}>✏️</button>
                  <button className="btn-icon" style={{borderColor:"rgba(224,82,82,.3)",color:"#ff8585"}} onClick={()=>elimina(a.id)}>🗑</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AdempimentoModal({mode,data,onSave,onClose,saving}){
  const [f,setF]=useState({...data});
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">{mode==="new"?"Nuovo Adempimento":"Modifica Adempimento"}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Nome *</label><input value={f.nome} onChange={e=>up("nome",e.target.value)} placeholder="es. Tassa Concessione Governativa"/></div>
            <div className="fg full"><label>Oggetto email *</label><input value={f.oggetto} onChange={e=>up("oggetto",e.target.value)}/></div>
            <div className="fg full"><label>Testo email</label><textarea value={f.corpo||""} onChange={e=>up("corpo",e.target.value)} style={{minHeight:130}}/></div>
            <div className="fg"><label>Allegato</label><select value={f.allegato_tipo} onChange={e=>up("allegato_tipo",e.target.value)}>{Object.entries(ALLEGATO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            <div className="fg"><label>Ciclicità</label><select value={f.ciclicita} onChange={e=>up("ciclicita",e.target.value)}>{Object.entries(CICLICITA_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
            {f.ciclicita==="unica"&&<div className="fg full"><label>Data invio</label><input type="date" value={f.data_invio||""} onChange={e=>up("data_invio",e.target.value)}/></div>}
            {(f.ciclicita!=="unica")&&<div className="fg"><label>Giorno del mese</label><input type="number" min="1" max="31" value={f.giorno_invio||""} onChange={e=>up("giorno_invio",parseInt(e.target.value)||null)}/></div>}
            {f.ciclicita==="annuale"&&<div className="fg"><label>Mese</label><select value={f.mese_invio||""} onChange={e=>up("mese_invio",parseInt(e.target.value)||null)}><option value="">Seleziona...</option>{MESI.slice(1).map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}</select></div>}
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={!f.nome||!f.oggetto||saving} onClick={()=>onSave(f)}>{saving?"Salvo...":"💾 Salva"}</button></div>
      </div>
    </div>
  );
}

function DestinatariModal({adempimento,clienti,onClose}){
  const [assoc,setAssoc]=useState([]);
  const [filtroTipo,setFiltroTipo]=useState("tutti");
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  useEffect(()=>{sb.from("adempimenti_clienti").select("cliente_id").eq("adempimento_id",adempimento.id).eq("attivo",true).then(({data})=>{setAssoc((data||[]).map(r=>r.cliente_id));setLoading(false);});},[adempimento.id]);
  const toggle=id=>setAssoc(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);
  const salva=async()=>{setSaving(true);await sb.from("adempimenti_clienti").delete().eq("adempimento_id",adempimento.id);if(assoc.length>0)await sb.from("adempimenti_clienti").insert(assoc.map(cid=>({adempimento_id:adempimento.id,cliente_id:cid,attivo:true})));setSaving(false);onClose();};
  const filtered=clienti.filter(c=>filtroTipo==="tutti"||c.tipo_cliente===filtroTipo);
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">👥 Destinatari</div><div className="modal-sub">{adempimento.nome}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="pills">{["tutti",...TIPO_CLIENTE].map(t=><span key={t} className={"pill"+(filtroTipo===t?" active":"")} onClick={()=>setFiltroTipo(t)}>{t==="tutti"?"Tutti":TIPO_LABEL[t]}</span>)}</div>
          {loading?<div className="loading">⏳</div>:filtered.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:".65rem",padding:".5rem .6rem",borderRadius:8,cursor:"pointer"}} onClick={()=>toggle(c.id)}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.03)"}
              onMouseLeave={e=>e.currentTarget.style.background=""}>
              <div style={{width:16,height:16,borderRadius:4,border:"1.5px solid "+(assoc.includes(c.id)?"var(--gold)":"var(--bd2)"),background:assoc.includes(c.id)?"var(--gold)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                {assoc.includes(c.id)&&<span style={{color:"#0d1117",fontSize:".6rem",fontWeight:700}}>✓</span>}
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:".82rem"}}>{c.ragione_sociale||`${c.nome} ${c.cognome||""}`.trim()}</div>
                <div style={{fontSize:".68rem",color:"var(--mu)"}}>{c.email||"Nessuna email"} · <span className={"bdg "+TIPO_COLOR[c.tipo_cliente]}>{TIPO_LABEL[c.tipo_cliente]}</span></div>
              </div>
            </div>
          ))}
          <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:".75rem"}}>{assoc.length} clienti selezionati</div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={saving} onClick={salva}>{saving?"Salvo...":"💾 Salva"}</button></div>
      </div>
    </div>
  );
}

// ─── AGENDA ──────────────────────────────────────────────────
