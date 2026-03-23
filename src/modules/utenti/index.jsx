import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { RUOLO_LABEL, RUOLO_COLOR, PERMESSI_MODULI, PERMESSI_DEFAULT } from '../../shared/constants'
import { getPermessi, puoGestireUtenti } from '../../shared/utils'

const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'

export function ModuloUtenti(){
  const [utenti,setUtenti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [saving,setSaving]=useState(false);
  const [err,setErr]=useState(null);
  const EMPTY={nome:"",cognome:"",email:"",ruolo:"collaboratore",password_hash:""};
  const carica=useCallback(async()=>{setLoading(true);const{data}=await sb.from("utenti_studio").select("*").eq("attivo",true).order("nome");setUtenti(data||[]);setLoading(false);},[]);
  useEffect(()=>{carica();},[carica]);
  const salva=async(data)=>{
    setSaving(true);setErr(null);
    try{
      // Per nuovo utente, password è obbligatoria
      if(modal.mode==="new"&&!data.password_hash){throw new Error("La password è obbligatoria per i nuovi utenti");}
      // Per modifica, se password vuota non la aggiorniamo
      const saveData={...data};
      if(modal.mode==="edit"&&!saveData.password_hash){
        delete saveData.password_hash;
      }
      if(modal.mode==="new"){
        const{error}=await sb.from("utenti_studio").insert([saveData]);
        if(error)throw error;
      }else{
        const{error}=await sb.from("utenti_studio").update(saveData).eq("id",modal.data.id);
        if(error)throw error;
      }
      await carica();
      setModal(null);
    }catch(e){setErr(e.message);}
    finally{setSaving(false);}
  };
  const elimina=async(id)=>{if(!confirm("Eliminare questo utente?"))return;await sb.from("utenti_studio").update({attivo:false}).eq("id",id);carica();};
  return(
    <div className="page">
      {modal&&<UtenteModal mode={modal.mode} data={modal.data||EMPTY} onSave={salva} onClose={()=>setModal(null)} saving={saving} err={err}/>}
      <div className="page-hdr"><div className="page-title">👤 Utenti Studio</div><div className="page-sub">Gestione accessi e collaboratori</div></div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:".85rem"}}>
        <button className="btn" onClick={()=>setModal({mode:"new",data:EMPTY})}>+ Nuovo Utente</button>
      </div>
      {loading?<div className="loading">⏳</div>:(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <table className="tbl">
            <thead><tr><th>Utente</th><th>Email</th><th>Ruolo</th><th>Permessi</th><th>Azioni</th></tr></thead>
            <tbody>{utenti.map(u=>(
              <tr key={u.id}>
                <td><div style={{display:"flex",alignItems:"center",gap:".55rem"}}><div style={{width:28,height:28,borderRadius:"50%",background:"linear-gradient(135deg,var(--gold),var(--gld2))",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".7rem",fontWeight:700,color:"#0d1117",flexShrink:0}}>{u.nome.charAt(0)}{u.cognome?.charAt(0)||""}</div><span style={{fontWeight:600}}>{u.nome} {u.cognome||""}</span></div></td>
                <td style={{color:"var(--mu)",fontSize:".78rem"}}>{u.email}</td>
                <td><span className={"bdg "+RUOLO_COLOR[u.ruolo]}>{RUOLO_LABEL[u.ruolo]}</span></td>
                <td>
                  {u.ruolo==="collaboratore"?(
                    <div style={{display:"flex",gap:".25rem",flexWrap:"wrap"}}>
                      {PERMESSI_MODULI.map(m=>{
                        const p=(u.permessi||PERMESSI_DEFAULT)[m.id]||{};
                        const attivi=[p.leggi&&"L",p.modifica&&"M",p.elimina&&"E"].filter(Boolean);
                        return attivi.length>0?<span key={m.id} title={m.label+" · "+attivi.join("/")} style={{fontSize:".62rem",background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:4,padding:".05rem .3rem",color:"var(--mu)"}}>{m.ico}</span>:null;
                      })}
                      {u.permessi?.clienti?.solo_assegnati&&<span title="Solo clienti assegnati" style={{fontSize:".62rem",background:"rgba(34,211,238,.1)",border:"1px solid rgba(34,211,238,.3)",borderRadius:4,padding:".05rem .3rem",color:"var(--cy)"}}>👤</span>}
                    </div>
                  ):<span style={{fontSize:".72rem",color:"var(--mu)"}}>Accesso totale</span>}
                </td>
                <td><div className="tbl-actions">
                  <button className="btn-icon" onClick={()=>setModal({mode:"edit",data:u})}>✏️</button>
                  {u.ruolo!=="owner"&&<button className="btn-icon" style={{borderColor:"rgba(224,82,82,.3)",color:"#ff8585"}} onClick={()=>elimina(u.id)}>🗑</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function UtenteModal({mode,data,onSave,onClose,saving,err}){
  const [f,setF]=useState({...data,permessi:{...PERMESSI_DEFAULT,...(data.permessi||{})},clienti_assegnati:data.clienti_assegnati||[]});
  const [tuttiClienti,setTuttiClienti]=useState([]);
  const [searchCl,setSearchCl]=useState("");
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  const upPerm=(modulo,campo,val)=>setF(p=>({...p,permessi:{...p.permessi,[modulo]:{...p.permessi[modulo],[campo]:val}}}));
  const setTuttoLeggi=val=>setF(p=>({...p,permessi:Object.fromEntries(PERMESSI_MODULI.map(m=>[m.id,{...p.permessi[m.id],leggi:val}]))}));
  const setTuttoModifica=val=>setF(p=>({...p,permessi:Object.fromEntries(PERMESSI_MODULI.map(m=>[m.id,{...p.permessi[m.id],modifica:val}]))}));

  const isCollab = f.ruolo==="collaboratore";
  const soloAssegnati = f.permessi?.clienti?.solo_assegnati;

  // Carica clienti quando serve
  useEffect(()=>{
    if(isCollab && soloAssegnati && tuttiClienti.length===0){
      sb.from("clienti").select("id,nome,cognome,ragione_sociale").eq("attivo",true).order("nome")
        .then(({data})=>setTuttiClienti(data||[]));
    }
  },[isCollab, soloAssegnati]);

  const toggleCliente=id=>setF(p=>({...p,clienti_assegnati:p.clienti_assegnati.includes(id)?p.clienti_assegnati.filter(x=>x!==id):[...p.clienti_assegnati,id]}));
  const toggleTuttiClienti=()=>{
    const filtrati=tuttiClienti.filter(c=>{const n=(c.ragione_sociale||c.nome||"").toLowerCase();return !searchCl||n.includes(searchCl.toLowerCase());});
    const allSel=filtrati.every(c=>f.clienti_assegnati.includes(c.id));
    setF(p=>({...p,clienti_assegnati:allSel?p.clienti_assegnati.filter(id=>!filtrati.find(c=>c.id===id)):[...new Set([...p.clienti_assegnati,...filtrati.map(c=>c.id)])]}));
  };

  const clientiFiltrati=tuttiClienti.filter(c=>{const n=(c.ragione_sociale||c.nome||"").toLowerCase();return !searchCl||n.includes(searchCl.toLowerCase());});

  const ChkBox=({val,onChange,color="var(--gold)"})=>(
    <div onClick={onChange} style={{width:18,height:18,borderRadius:4,border:`1.5px solid ${val?color:"var(--bd2)"}`,background:val?color:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,transition:"all .15s"}}>
      {val&&<span style={{color:"#0d1117",fontSize:".62rem",fontWeight:700}}>✓</span>}
    </div>
  );

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:isCollab?680:480}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">{mode==="new"?"Nuovo Utente":"Modifica Utente"}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg"><label>Nome *</label><input value={f.nome} onChange={e=>up("nome",e.target.value)}/></div>
            <div className="fg"><label>Cognome</label><input value={f.cognome||""} onChange={e=>up("cognome",e.target.value)}/></div>
            <div className="fg full"><label>Email *</label><input type="email" value={f.email} onChange={e=>up("email",e.target.value)}/></div>
            <div className="fg full">
              <label>{mode==="new"?"Password *":"Nuova Password (lascia vuoto per non modificare)"}</label>
              <input type="password" value={f.password_hash||""} onChange={e=>up("password_hash",e.target.value)} placeholder={mode==="new"?"Inserisci password":"••••••••"}/>
              <div className="hint">La password deve essere comunicata all'utente in modo sicuro</div>
            </div>
            <div className="fg full">
              <label>Ruolo</label>
              <select value={f.ruolo} onChange={e=>up("ruolo",e.target.value)}>
                <option value="collaboratore">Collaboratore</option>
                <option value="admin">Admin</option>
                <option value="owner">Owner</option>
              </select>
              <div style={{marginTop:".35rem",background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:7,padding:".45rem .65rem",fontSize:".7rem",color:"var(--mu)"}}>
                {f.ruolo==="owner"&&"🔑 Accesso totale a tutto · Unico che gestisce utenti e ruoli"}
                {f.ruolo==="admin"&&"⚙️ Accesso totale a tutti i moduli · Non può gestire utenti studio"}
                {f.ruolo==="collaboratore"&&"👤 Permessi configurabili modulo per modulo (vedi sotto)"}
              </div>
            </div>
          </div>

          {/* GRIGLIA PERMESSI — solo per collaboratore */}
          {isCollab&&(
            <div style={{marginTop:"1rem"}}>
              <div style={{fontSize:".7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--gold)",marginBottom:".75rem"}}>
                ⚙️ Permessi collaboratore
              </div>

              {/* Header con toggle globali */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 100px",gap:".35rem",alignItems:"center",marginBottom:".4rem",padding:"0 .5rem"}}>
                <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em"}}>Modulo</div>
                <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",textAlign:"center"}}>Lettura</div>
                <div style={{fontSize:".62rem",color:"var(--mu)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",textAlign:"center"}}>Modifica</div>
                <div style={{fontSize:".62rem",color:"rgba(224,82,82,.7)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",textAlign:"center"}}>Elimina</div>
                <div style={{fontSize:".62rem",color:"var(--cy)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",textAlign:"center"}}>Solo assegnati</div>
              </div>

              {/* Riga toggle tutto */}
              <div style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 100px",gap:".35rem",alignItems:"center",padding:".4rem .5rem",background:"rgba(200,164,94,.06)",border:"1px solid rgba(200,164,94,.2)",borderRadius:7,marginBottom:".5rem"}}>
                <div style={{fontSize:".72rem",fontWeight:700,color:"var(--gld2)"}}>Seleziona tutto</div>
                <div style={{display:"flex",justifyContent:"center",gap:".3rem"}}>
                  <span style={{fontSize:".6rem",cursor:"pointer",color:"var(--gr)"}} onClick={()=>setTuttoLeggi(true)}>+</span>
                  <span style={{fontSize:".6rem",cursor:"pointer",color:"var(--rd)"}} onClick={()=>setTuttoLeggi(false)}>−</span>
                </div>
                <div style={{display:"flex",justifyContent:"center",gap:".3rem"}}>
                  <span style={{fontSize:".6rem",cursor:"pointer",color:"var(--gr)"}} onClick={()=>setTuttoModifica(true)}>+</span>
                  <span style={{fontSize:".6rem",cursor:"pointer",color:"var(--rd)"}} onClick={()=>setTuttoModifica(false)}>−</span>
                </div>
                <div style={{textAlign:"center",fontSize:".62rem",color:"var(--mu)"}}>—</div>
                <div style={{textAlign:"center",fontSize:".62rem",color:"var(--mu)"}}>—</div>
              </div>

              {/* Righe per modulo */}
              {PERMESSI_MODULI.map((m,i)=>{
                const p=f.permessi[m.id]||{leggi:true,modifica:false,elimina:false,solo_assegnati:false};
                return(
                  <div key={m.id} style={{display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 100px",gap:".35rem",alignItems:"center",padding:".45rem .5rem",background:i%2===0?"var(--s2)":"transparent",borderRadius:6,marginBottom:".2rem"}}>
                    <div style={{display:"flex",alignItems:"center",gap:".4rem",fontSize:".8rem"}}>
                      <span>{m.ico}</span><span>{m.label}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"center"}}>
                      <ChkBox val={p.leggi} onChange={()=>upPerm(m.id,"leggi",!p.leggi)} color="var(--gold)"/>
                    </div>
                    <div style={{display:"flex",justifyContent:"center"}}>
                      <ChkBox val={p.modifica} onChange={()=>upPerm(m.id,"modifica",!p.modifica)} color="var(--bl)"/>
                    </div>
                    <div style={{display:"flex",justifyContent:"center"}}>
                      <ChkBox val={p.elimina} onChange={()=>upPerm(m.id,"elimina",!p.elimina)} color="var(--rd)"/>
                    </div>
                    <div style={{display:"flex",justifyContent:"center"}}>
                      {m.hasSoloAssegnati
                        ?<ChkBox val={p.solo_assegnati} onChange={()=>upPerm(m.id,"solo_assegnati",!p.solo_assegnati)} color="var(--cy)"/>
                        :<span style={{fontSize:".7rem",color:"var(--bd2)",textAlign:"center"}}>—</span>
                      }
                    </div>
                  </div>
                );
              })}

              {/* LISTA CLIENTI ASSEGNATI — compare quando solo_assegnati è attivo */}
              {soloAssegnati&&(
                <div style={{marginTop:".85rem",background:"rgba(34,211,238,.05)",border:"1px solid rgba(34,211,238,.25)",borderRadius:10,padding:".85rem"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".6rem"}}>
                    <div style={{fontSize:".72rem",fontWeight:700,color:"var(--cy)"}}>
                      👤 Clienti assegnati · <span style={{color:"var(--tx)"}}>{f.clienti_assegnati.length} selezionati</span>
                    </div>
                    <span style={{fontSize:".68rem",cursor:"pointer",color:"var(--cy)",textDecoration:"underline"}} onClick={toggleTuttiClienti}>
                      {clientiFiltrati.every(c=>f.clienti_assegnati.includes(c.id))?"Deseleziona tutti":"Seleziona tutti"}
                    </span>
                  </div>
                  <input
                    value={searchCl} onChange={e=>setSearchCl(e.target.value)}
                    placeholder="🔍 Cerca cliente..."
                    style={{width:"100%",background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:7,color:"var(--tx)",padding:".4rem .65rem",fontSize:".78rem",marginBottom:".55rem"}}
                  />
                  {tuttiClienti.length===0?(
                    <div style={{fontSize:".75rem",color:"var(--mu)",textAlign:"center",padding:".5rem"}}>⏳ Caricamento clienti...</div>
                  ):(
                    <div style={{maxHeight:220,overflowY:"auto",display:"flex",flexDirection:"column",gap:".2rem"}}>
                      {clientiFiltrati.map(c=>{
                        const nome=c.ragione_sociale||`${c.nome} ${c.cognome||""}`.trim();
                        const sel=f.clienti_assegnati.includes(c.id);
                        return(
                          <div key={c.id} onClick={()=>toggleCliente(c.id)}
                            style={{display:"flex",alignItems:"center",gap:".55rem",padding:".38rem .5rem",borderRadius:6,cursor:"pointer",background:sel?"rgba(34,211,238,.08)":"transparent",transition:"background .1s"}}>
                            <div style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${sel?"var(--cy)":"var(--bd2)"}`,background:sel?"var(--cy)":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {sel&&<span style={{color:"#0d1117",fontSize:".55rem",fontWeight:700}}>✓</span>}
                            </div>
                            <span style={{fontSize:".8rem",color:sel?"var(--tx)":"var(--mu)"}}>{nome}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              <div style={{marginTop:".75rem",fontSize:".68rem",color:"var(--mu)",lineHeight:1.6,background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:7,padding:".5rem .75rem"}}>
                <strong style={{color:"var(--tx)"}}>Legenda:</strong> &nbsp;
                <span style={{color:"var(--gold)"}}>■ Lettura</span> — vede i dati &nbsp;·&nbsp;
                <span style={{color:"var(--bl)"}}>■ Modifica</span> — crea e modifica &nbsp;·&nbsp;
                <span style={{color:"var(--rd)"}}>■ Elimina</span> — può eliminare &nbsp;·&nbsp;
                <span style={{color:"var(--cy)"}}>■ Solo assegnati</span> — vede solo i clienti selezionati
              </div>
            </div>
          )}

          {err&&<div className="err-box" style={{marginTop:".75rem"}}>⚠️ {err}</div>}
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={!f.nome||!f.email||saving} onClick={()=>onSave(f)}>{saving?"Salvo...":"💾 Salva"}</button></div>
      </div>
    </div>
  );
}

// ─── LIQUIDAZIONE IVA ────────────────────────────────────────
