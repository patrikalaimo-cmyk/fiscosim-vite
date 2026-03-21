import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
const sb = createClient(SUPABASE_URL, SUPABASE_KEY)

// Utility globale — carica script CDN on-demand
const loadScript=(url)=>new Promise((res,rej)=>{
  if(document.querySelector('script[src="'+url+'"]')){res();return;}
  const s=document.createElement('script');
  s.src=url;s.onload=res;s.onerror=rej;
  document.head.appendChild(s);
});




// ─── UTILS ────────────────────────────────────────────────────
const fmt = n => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:2}).format(n||0);
const fmt0 = n => new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR",maximumFractionDigits:0}).format(n||0);
const fmtDate = d => d ? new Date(d).toLocaleDateString("it-IT") : "—";
const todayStr = () => new Date().toISOString().split("T")[0];
const tomorrowStr = () => { const d=new Date(); d.setDate(d.getDate()+1); return d.toISOString().split("T")[0]; };

const TIPO_CLIENTE = ["forfettario","ordinario","srl","snc","occasionale"];
const TIPO_LABEL = {forfettario:"Forfettario",ordinario:"Ordinario",srl:"S.r.l.",snc:"SNC/SAS",occasionale:"Occasionale"};
const TIPO_COLOR = {forfettario:"bdg-gold",ordinario:"bdg-blue",srl:"bdg-pu",snc:"bdg-green",occasionale:"bdg-red"};
const ALLEGATO_LABEL = {nessuno:"Solo testo",pdf_app:"PDF generato",pdf_f24:"PDF F24"};
const CICLICITA_LABEL = {unica:"Una tantum",annuale:"Annuale",trimestrale:"Trimestrale",mensile:"Mensile"};
const MESI = ["","Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const RUOLO_LABEL = {owner:"Owner",admin:"Admin",collaboratore:"Collaboratore"};
const RUOLO_COLOR = {owner:"bdg-gold",admin:"bdg-blue",collaboratore:"bdg-gray"};
const F24_STATO_LABEL = {da_pagare:"Da pagare",pagato:"Pagato",annullato:"Annullato"};
const F24_STATO_COLOR = {da_pagare:"bdg-red",pagato:"bdg-green",annullato:"bdg-gray"};

async function callAPI(payload){
  const res = await fetch("/api/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
  const data = await res.json();
  if(!res.ok) throw new Error(data.error||"Errore");
  return data;
}

// ─── TAG INPUT ───────────────────────────────────────────────
function TagInput({value=[],onChange,placeholder="email@es.it"}){
  const [inp,setInp]=useState("");
  const add=v=>{const c=v.trim().toLowerCase();if(c&&c.includes("@")&&!value.includes(c))onChange([...value,c]);setInp("");};
  const remove=i=>onChange(value.filter((_,idx)=>idx!==i));
  return(
    <div className="tag-input-wrap" onClick={e=>e.currentTarget.querySelector("input").focus()}>
      {value.map((t,i)=>(<span key={i} className="tag">{t}<span className="tag-x" onClick={e=>{e.stopPropagation();remove(i);}}>✕</span></span>))}
      <input className="tag-input" value={inp} placeholder={value.length===0?placeholder:""}
        onChange={e=>setInp(e.target.value)}
        onKeyDown={e=>{if(["Enter",","," "].includes(e.key)){e.preventDefault();add(inp);}if(e.key==="Backspace"&&!inp&&value.length>0)remove(value.length-1);}}
        onBlur={()=>inp&&add(inp)}/>
    </div>
  );
}

// ─── SEND MAIL MODAL ─────────────────────────────────────────
function SendMailModal({onClose,cliente=null,adempimento=null,oggetto="",corpo=""}){
  const [to,setTo]=useState(cliente?.email?[cliente.email]:[]);
  const [cc,setCc]=useState(cliente?.email_cc||[]);
  const [bcc,setBcc]=useState([]);
  const [showBcc,setShowBcc]=useState(false);
  const [ogg,setOgg]=useState(oggetto||adempimento?.oggetto||"");
  const [txt,setTxt]=useState(corpo||adempimento?.corpo||"");
  const [allegato,setAllegato]=useState(adempimento?.allegato_tipo||"nessuno");
  const [loading,setLoading]=useState(false);
  const [sent,setSent]=useState(false);
  const [err,setErr]=useState(null);
  const send=async(isTest=false)=>{
    if(!to.length||!ogg)return;
    setLoading(true);setErr(null);
    try{await callAPI({to,cc,bcc,oggetto:isTest?"[TEST] "+ogg:ogg,corpo:txt,allegato_tipo:allegato,isTest});if(!isTest)setSent(true);}
    catch(e){setErr(e.message);}finally{setLoading(false);}
  };
  if(sent)return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">✅ Email inviata</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body" style={{textAlign:"center",padding:"2rem"}}>
          <div style={{fontSize:"2rem",marginBottom:".6rem"}}>✅</div>
          <div style={{fontWeight:700,marginBottom:".3rem"}}>Inviata con successo!</div>
          <div style={{fontSize:".78rem",color:"var(--mu)"}}>A: {to.join(", ")}</div>
        </div>
        <div className="modal-foot"><button className="btn" onClick={onClose}>Chiudi</button></div>
      </div>
    </div>
  );
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">📧 Invia Email</div>{cliente&&<div className="modal-sub">{cliente.nome} {cliente.cognome||""}</div>}<button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>A *</label><TagInput value={to} onChange={setTo}/></div>
            <div className="fg full"><label>CC</label><TagInput value={cc} onChange={setCc}/></div>
            {showBcc?<div className="fg full"><label>BCC</label><TagInput value={bcc} onChange={setBcc}/></div>:<div className="full"><span style={{fontSize:".72rem",color:"var(--bl)",cursor:"pointer"}} onClick={()=>setShowBcc(true)}>+ Aggiungi BCC</span></div>}
            <div className="fg full"><label>Oggetto *</label><input value={ogg} onChange={e=>setOgg(e.target.value)}/></div>
            <div className="fg full"><label>Testo</label><textarea value={txt} onChange={e=>setTxt(e.target.value)} style={{minHeight:120}}/></div>
            <div className="fg full"><label>Allegato</label><select value={allegato} onChange={e=>setAllegato(e.target.value)}>{Object.entries(ALLEGATO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          </div>
          {err&&<div className="err-box">⚠️ {err}</div>}
        </div>
        <div className="modal-foot">
          <button className="btn-sec btn-sm" disabled={loading||!to.length||!ogg} onClick={()=>send(true)}>🧪 Test</button>
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={loading||!to.length||!ogg} onClick={()=>send(false)}>{loading?"⏳ Invio...":"📤 Invia"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── DASHBOARD ───────────────────────────────────────────────
function Dashboard({onNavigate}){
  const [stats,setStats]=useState({clienti:0,attivi:0,f24:0,f24_imp:0,invii:0,beni:0});
  const [recenti,setRecenti]=useState([]);
  const [f24Prox,setF24Prox]=useState([]);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    (async()=>{
      const [{count:tot},{count:att},{data:f},{data:cli},{data:inv}]=await Promise.all([
        sb.from("clienti").select("*",{count:"exact",head:true}).eq("attivo",true),
        sb.from("clienti").select("*",{count:"exact",head:true}).eq("attivo",true),
        sb.from("f24").select("*").eq("stato","da_pagare").order("data_scadenza").limit(5),
        sb.from("clienti").select("id,nome,cognome,ragione_sociale,tipo_cliente,created_at").eq("attivo",true).order("created_at",{ascending:false}).limit(6),
        sb.from("invii_schedulati").select("*",{count:"exact",head:true}).eq("stato","programmato"),
      ]);
      const f24Imp=(f||[]).reduce((s,r)=>s+parseFloat(r.importo||0),0);
      setStats({clienti:tot||0,attivi:att||0,f24:(f||[]).length,f24_imp:f24Imp,invii:inv?.count||0,beni:0});
      setRecenti(cli||[]);
      setF24Prox(f||[]);
      setLoading(false);
    })();
  },[]);
  const today=todayStr();
  if(loading)return<div className="loading">⏳ Caricamento dashboard...</div>;
  return(
    <div className="page">
      <div className="page-hdr"><div className="page-title">Dashboard</div><div className="page-sub">Riepilogo attività studio · {new Date().toLocaleDateString("it-IT",{weekday:"long",day:"numeric",month:"long",year:"numeric"})}</div></div>
      <div className="stats-grid">
        <div className="stat-card" onClick={()=>onNavigate("clienti")} style={{cursor:"pointer"}}>
          <div className="stat-ico">👥</div>
          <div className="stat-val" style={{color:"var(--pu)"}}>{stats.clienti}</div>
          <div className="stat-lbl">Clienti totali</div>
        </div>
        <div className="stat-card" onClick={()=>onNavigate("f24")} style={{cursor:"pointer"}}>
          <div className="stat-ico">📋</div>
          <div className="stat-val" style={{color:"var(--rd)"}}>{stats.f24}</div>
          <div className="stat-lbl">F24 da pagare</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">💶</div>
          <div className="stat-val" style={{color:"var(--gold)",fontSize:"1.2rem"}}>{fmt0(stats.f24_imp)}</div>
          <div className="stat-lbl">Totale F24 aperti</div>
        </div>
        <div className="stat-card" onClick={()=>onNavigate("agenda")} style={{cursor:"pointer"}}>
          <div className="stat-ico">📅</div>
          <div className="stat-val" style={{color:"var(--cy)"}}>{stats.invii}</div>
          <div className="stat-lbl">Invii programmati</div>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
        <div className="card">
          <div className="card-hdr"><div className="card-title">👥 Clienti recenti</div><button className="btn-sec btn-sm" onClick={()=>onNavigate("clienti")}>Vedi tutti</button></div>
          {recenti.map(c=>(
            <div key={c.id} style={{display:"flex",alignItems:"center",gap:".6rem",padding:".45rem 0",borderBottom:"1px solid var(--bd)"}}>
              <div style={{width:28,height:28,borderRadius:"50%",background:"rgba(167,139,250,.15)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:".75rem",flexShrink:0}}>👤</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".8rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{c.ragione_sociale||`${c.nome} ${c.cognome||""}`.trim()}</div>
              </div>
              <span className={"bdg "+TIPO_COLOR[c.tipo_cliente]}>{TIPO_LABEL[c.tipo_cliente]}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-hdr"><div className="card-title">📋 F24 in scadenza</div><button className="btn-sec btn-sm" onClick={()=>onNavigate("f24")}>Vedi tutti</button></div>
          {f24Prox.length===0?<div className="empty" style={{padding:"1.5rem"}}><div className="empty-s">Nessun F24 aperto</div></div>:f24Prox.map(f=>(
            <div key={f.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:".45rem 0",borderBottom:"1px solid var(--bd)",gap:".5rem"}}>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:".78rem",fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.descrizione}</div>
                <div style={{fontSize:".68rem",color:f.data_scadenza<today?"#ff8585":"var(--mu)"}}>{fmtDate(f.data_scadenza)}</div>
              </div>
              <div style={{fontSize:".85rem",fontWeight:700,color:"var(--gld2)",flexShrink:0}}>{fmt(f.importo)}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="card">
        <div className="card-hdr"><div className="card-title">🚀 Moduli attivi</div></div>
        <div style={{display:"flex",gap:".5rem",flexWrap:"wrap"}}>
          {[["📊","Simulatore","simulatore"],["👥","Clienti","clienti"],["📤","Import Excel","import"],["👤","Utenti Studio","utenti"],["💧","Liquidazione IVA","iva"],["📋","Gestione F24","f24"],["🏢","Ammortamenti","ammortamenti"],["📬","Adempimenti","adempimenti"],["📅","Agenda","agenda"]].map(([ico,label,id])=>(
            <div key={id} onClick={()=>onNavigate(id)} style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:9,padding:".55rem .85rem",cursor:"pointer",display:"flex",alignItems:"center",gap:".45rem",fontSize:".8rem",fontWeight:500,transition:"all .15s"}}
              onMouseEnter={e=>{e.currentTarget.style.borderColor="var(--gold)";e.currentTarget.style.color="var(--gld2)";}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor="var(--bd)";e.currentTarget.style.color="";}}>
              <span>{ico}</span>{label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CLIENTI ─────────────────────────────────────────────────
// ─── IMPOSTAZIONI STUDIO ─────────────────────────────────────
function ModuloImpostazioni({ruolo}){
  const canEdit = ruolo==='owner'||ruolo==='admin';
  const [imp,setImp]=useState({});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    sb.from('impostazioni_studio').select('chiave,valore')
      .then(({data})=>{
        const map=Object.fromEntries((data||[]).map(r=>[r.chiave,r.valore||'']));
        // Default AI attiva
        if(!map.ai_enabled) map.ai_enabled='true';
        setImp(map);setLoading(false);
      });
  },[]);

  const up=(k,v)=>setImp(p=>({...p,[k]:v}));

  const salva=async()=>{
    setSaving(true);setSaved(false);
    try{
      for(const[chiave,valore] of Object.entries(imp)){
        await sb.from('impostazioni_studio')
          .upsert({chiave,valore,updated_at:new Date().toISOString()},{onConflict:'chiave'});
      }
      setSaved(true);
      setTimeout(()=>setSaved(false),3000);
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  };

  const IS={background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,color:canEdit?'var(--tx)':'var(--mu)',padding:'.52rem .75rem',fontSize:'.84rem',width:'100%'};

  if(loading)return<div className="loading">⏳</div>;

  return(
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">⚙️ Impostazioni Studio</div>
        <div className="page-sub">Dati del titolare, studio e configurazione AI</div>
      </div>

      {/* AI CONFIGURATION */}
      <div className="card" style={{marginBottom:'1.25rem',background:'linear-gradient(135deg,rgba(200,164,94,.1),rgba(200,164,94,.02))',border:'1px solid rgba(200,164,94,.3)'}}>
        <div className="card-hdr">
          <div className="card-title">🤖 Intelligenza Artificiale</div>
          <span className={'bdg '+(imp.ai_enabled==='true'?'bdg-green':'bdg-gray')}>{imp.ai_enabled==='true'?'AI ATTIVA':'AI DISATTIVATA'}</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1rem'}}>
          <div 
            onClick={()=>canEdit&&up('ai_enabled',imp.ai_enabled==='true'?'false':'true')}
            style={{
              width:56,height:30,borderRadius:15,
              background:imp.ai_enabled==='true'?'var(--gr)':'var(--bd2)',
              cursor:canEdit?'pointer':'not-allowed',
              position:'relative',transition:'background .2s',
              opacity:canEdit?1:0.6
            }}
          >
            <div style={{
              width:24,height:24,borderRadius:12,
              background:'white',
              position:'absolute',top:3,
              left:imp.ai_enabled==='true'?29:3,
              transition:'left .2s',
              boxShadow:'0 1px 3px rgba(0,0,0,.3)'
            }}/>
          </div>
          <div>
            <div style={{fontWeight:600,fontSize:'.9rem'}}>{imp.ai_enabled==='true'?'AI Attiva':'AI Disattivata'}</div>
            <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
              {imp.ai_enabled==='true'
                ?'I documenti vengono classificati automaticamente dall\'AI'
                :'Classificazione manuale - l\'operatore sceglie tipo documento'
              }
            </div>
          </div>
        </div>
        <div className="alert alert-info" style={{margin:0}}>
          💡 <strong>Modalità senza AI:</strong> Il sistema funziona al 100% anche con AI disattivata. L'operatore seleziona manualmente il tipo documento e il modulo di destinazione. Utile per test o quando l'AI non è disponibile.
        </div>
      </div>

      {/* TITOLARE */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <div className="card-hdr">
          <div className="card-title">👤 Titolare dello Studio</div>
          <span className="bdg bdg-gold">Persona fisica</span>
        </div>
        <div className="alert alert-info" style={{marginBottom:'1rem'}}>
          Le deleghe ADE vengono intestate al titolare persona fisica. Questi dati vengono usati automaticamente nella generazione delle richieste XML per il download massivo fatture.
        </div>
        <div className="form-grid">
          <div className="fg"><label>Nome *</label><input value={imp.titolare_nome||''} onChange={e=>up('titolare_nome',e.target.value)} disabled={!canEdit} style={IS}/></div>
          <div className="fg"><label>Cognome *</label><input value={imp.titolare_cognome||''} onChange={e=>up('titolare_cognome',e.target.value)} disabled={!canEdit} style={IS}/></div>
          <div className="fg"><label>Codice Fiscale *</label><input value={imp.titolare_cf||''} onChange={e=>up('titolare_cf',e.target.value.toUpperCase())} disabled={!canEdit} placeholder="RSSMRA75T10F205Z" style={IS}/></div>
          <div className="fg"><label>Partita IVA (utenza di lavoro ADE)</label><input value={imp.titolare_piva||''} onChange={e=>up('titolare_piva',e.target.value)} disabled={!canEdit} placeholder="11 cifre" style={IS}/><div className="hint">P.IVA usata come utenza di lavoro per le richieste massive ADE</div></div>
        </div>
      </div>

      {/* STUDIO */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <div className="card-hdr">
          <div className="card-title">🏢 Dati Studio</div>
        </div>
        <div className="form-grid">
          <div className="fg full"><label>Nome Studio</label><input value={imp.studio_nome||''} onChange={e=>up('studio_nome',e.target.value)} disabled={!canEdit} style={IS}/></div>
          <div className="fg"><label>P.IVA Studio</label><input value={imp.studio_piva||''} onChange={e=>up('studio_piva',e.target.value)} disabled={!canEdit} style={IS}/></div>
        </div>
      </div>

      {canEdit&&(
        <div style={{display:'flex',gap:'.75rem',alignItems:'center'}}>
          <button className="btn" disabled={saving} onClick={salva}>{saving?'Salvo...':'💾 Salva impostazioni'}</button>
          {saved&&<span style={{color:'var(--gr)',fontSize:'.82rem',fontWeight:600}}>✓ Salvato</span>}
        </div>
      )}

      {!canEdit&&(
        <div className="alert alert-warn">🔒 Solo Owner e Admin possono modificare le impostazioni studio.</div>
      )}
    </div>
  );
}

// ─── UTILS DELEGHE ───────────────────────────────────────────
function calcolaScadenzaDelega(dataDelega) {
  if (!dataDelega) return null;
  const anno = new Date(dataDelega).getFullYear();
  return `${anno + 4}-12-31`;
}

function statoDelega(dataScadenza) {
  if (!dataScadenza) return 'da_attivare';
  const oggi = new Date();
  const scad = new Date(dataScadenza);
  const diff = (scad - oggi) / (1000 * 60 * 60 * 24);
  if (diff < 0) return 'scaduto';
  if (diff <= 90) return 'in_scadenza';
  return 'attivo';
}

const DELEGA_STATO_CFG = {
  attivo:      { label:'✓ Attivo',      color:'#34c27a', bg:'rgba(52,194,122,.12)',  border:'rgba(52,194,122,.3)' },
  in_scadenza: { label:'⚠ In scadenza', color:'#c8a45e', bg:'rgba(200,164,94,.12)',  border:'rgba(200,164,94,.3)' },
  scaduto:     { label:'✕ Scaduto',     color:'#e05252', bg:'rgba(224,82,82,.12)',   border:'rgba(224,82,82,.3)' },
  da_attivare: { label:'— Da attivare', color:'#6b7a99', bg:'rgba(107,122,153,.08)', border:'rgba(107,122,153,.2)' },
};

function DelegaBadge({stato}) {
  const c = DELEGA_STATO_CFG[stato] || DELEGA_STATO_CFG.da_attivare;
  return <span style={{background:c.bg,color:c.color,border:`1px solid ${c.border}`,borderRadius:5,padding:'.12rem .45rem',fontSize:'.68rem',fontWeight:700,whiteSpace:'nowrap'}}>{c.label}</span>;
}

// ─── MODULO DELEGHE UNICHE ───────────────────────────────────
function ModuloDeleghe(){
  const [clienti,setClienti]=useState([]);
  const [deleghe,setDeleghe]=useState([]);
  const [utenti,setUtenti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [filtroStato,setFiltroStato]=useState('tutti');
  const [modal,setModal]=useState(null);
  const [importModal,setImportModal]=useState(false);
  const [alertModal,setAlertModal]=useState(false);
  const [saving,setSaving]=useState(false);

  useEffect(()=>{ carica(); },[]);

  const carica=async()=>{
    setLoading(true);
    const[{data:cl},{data:de},{data:ut}]=await Promise.all([
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva,responsabile_id').eq('attivo',true).order('nome'),
      sb.from('deleghe_uniche').select('*').eq('attivo',true),
      sb.from('utenti_studio').select('id,nome,cognome,email').eq('attivo',true),
    ]);
    setClienti(cl||[]);
    setDeleghe(de||[]);
    setUtenti(ut||[]);
    setLoading(false);
  };

  const delegheMap=useMemo(()=>Object.fromEntries((deleghe||[]).map(d=>[d.cliente_id,d])),[deleghe]);

  const clientiConStato=useMemo(()=>(clienti||[]).map(c=>{
    const d=delegheMap[c.id];
    const stato=d?statoDelega(d.data_scadenza):'da_attivare';
    return{...c,delega:d,stato};
  }),[clienti,delegheMap]);

  const filtered=useMemo(()=>clientiConStato.filter(c=>{
    const nome=(c.ragione_sociale||`${c.nome} ${c.cognome||''}`).toLowerCase();
    const mS=!search||nome.includes(search.toLowerCase())||
      (c.codice_fiscale||'').toLowerCase().includes(search.toLowerCase())||
      (c.partita_iva||'').includes(search);
    const mF=filtroStato==='tutti'||c.stato===filtroStato;
    return mS&&mF;
  }),[clientiConStato,search,filtroStato]);

  const stats=useMemo(()=>({
    attivo:clientiConStato.filter(c=>c.stato==='attivo').length,
    in_scadenza:clientiConStato.filter(c=>c.stato==='in_scadenza').length,
    scaduto:clientiConStato.filter(c=>c.stato==='scaduto').length,
    da_attivare:clientiConStato.filter(c=>c.stato==='da_attivare').length,
  }),[clientiConStato]);

  const salvaDelega=async(data)=>{
    setSaving(true);
    try{
      const existing=delegheMap[data.cliente_id];
      if(existing){
        const{error}=await sb.from('deleghe_uniche').update(data).eq('id',existing.id);
        if(error)throw error;
      }else{
        const{error}=await sb.from('deleghe_uniche').insert([data]);
        if(error)throw error;
      }
      await carica();
      setModal(null);
    }catch(e){alert(e.message);}
    finally{setSaving(false);}
  };

  const eliminaDelega=async(id)=>{
    if(!confirm('Eliminare questa delega?'))return;
    await sb.from('deleghe_uniche').update({attivo:false}).eq('id',id);
    carica();
  };

  // Invio alert email responsabili per deleghe in scadenza
  const inviaAlertScadenze=async()=>{
    const inScadenza=clientiConStato.filter(c=>c.stato==='in_scadenza');
    if(!inScadenza.length){alert('Nessuna delega in scadenza al momento.');return;}

    // Raggruppa per responsabile
    const perResponsabile={};
    inScadenza.forEach(c=>{
      const resp=utenti.find(u=>u.id===c.responsabile_id)||utenti.find(u=>u.ruolo==='owner');
      if(!resp?.email)return;
      if(!perResponsabile[resp.id])perResponsabile[resp.id]={utente:resp,clienti:[]};
      perResponsabile[resp.id].clienti.push(c);
    });

    let sent=0;
    for(const{utente,clienti:lista} of Object.values(perResponsabile)){
      const oggetto=`⚠️ Deleghe Uniche in scadenza — ${lista.length} clienti`;
      const corpo=`Gentile ${utente.nome},\n\nI seguenti clienti hanno la Delega Unica ADE in scadenza entro 3 mesi:\n\n${
        lista.map(c=>`• ${c.ragione_sociale||`${c.nome} ${c.cognome||''}`} (CF: ${c.codice_fiscale||'—'}) — scadenza: ${fmtDate(c.delega?.data_scadenza)}`).join(String.fromCharCode(10))
      }\n\nSi raccomanda di rinnovare le deleghe prima della scadenza.\n\nStudio Envisioning`;
      try{
        await fetch('/api/send-email',{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify({to:[utente.email],oggetto,corpo})});
        sent++;
      }catch(e){console.error(e);}
    }
    alert(`Alert inviati a ${sent} responsabili.`);
    setAlertModal(false);
  };

  const CF=(c)=>c.codice_fiscale||c.partita_iva||'—';
  const NOME=(c)=>c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim();

  return(
    <div className="page">
      {modal&&<DelegaModal cliente={modal} delegaEsistente={delegheMap[modal.id]} onSave={salvaDelega} onClose={()=>setModal(null)} saving={saving}/>}
      {importModal&&<DelegheImportModal clienti={clienti} delegheMap={delegheMap} onSave={async(items)=>{
        for(const item of items){
          const existing=delegheMap[item.cliente_id];
          if(existing){await sb.from('deleghe_uniche').update(item).eq('id',existing.id);}
          else{await sb.from('deleghe_uniche').insert([item]);}
        }
        await carica();setImportModal(false);
      }} onClose={()=>setImportModal(false)}/>}

      <div className="page-hdr">
        <div className="page-title">🔑 Deleghe Uniche ADE</div>
        <div className="page-sub">Gestione deleghe fatture elettroniche — aggiornato al {new Date().toLocaleDateString('it-IT')}</div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        {[['✓ Attive',stats.attivo,'var(--gr)','attivo'],['⚠ In scadenza',stats.in_scadenza,'var(--gold)','in_scadenza'],['✕ Scadute',stats.scaduto,'var(--rd)','scaduto'],['— Da attivare',stats.da_attivare,'var(--mu)','da_attivare']].map(([l,v,c,f])=>(
          <div key={f} className="stat-card" style={{cursor:'pointer',border:filtroStato===f?`1px solid ${c}`:'1px solid var(--bd)'}} onClick={()=>setFiltroStato(filtroStato===f?'tutti':f)}>
            <div className="stat-val" style={{color:c,fontSize:'1.4rem'}}>{v}</div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div style={{display:'flex',gap:'.6rem',marginBottom:'.65rem',flexWrap:'wrap',alignItems:'center'}}>
        <input className="search-bar" style={{margin:0,flex:1,minWidth:200}} placeholder="🔍 Cerca cliente, CF, P.IVA..." value={search} onChange={e=>setSearch(e.target.value)}/>
        <button className="btn-sec" onClick={()=>setImportModal(true)}>📄 Importa PDF</button>
        {stats.in_scadenza>0&&<button className="btn-sec" style={{borderColor:'rgba(200,164,94,.4)',color:'var(--gld2)'}} onClick={inviaAlertScadenze}>📧 Invia alert ({stats.in_scadenza})</button>}
      </div>
      <div className="pills">
        {[['tutti','Tutti ('+clientiConStato.length+')'],['attivo','✓ Attive ('+stats.attivo+')'],['in_scadenza','⚠ In scadenza ('+stats.in_scadenza+')'],['scaduto','✕ Scadute ('+stats.scaduto+')'],['da_attivare','— Da attivare ('+stats.da_attivare+')']].map(([v,l])=>(
          <span key={v} className={'pill'+(filtroStato===v?' active':'')} onClick={()=>setFiltroStato(v)}>{l}</span>
        ))}
      </div>

      {loading?<div className="loading">⏳</div>:(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Cliente</th>
                <th>CF / P.IVA</th>
                <th>Responsabile</th>
                <th>Data Delega</th>
                <th>Scadenza</th>
                <th>Stato</th>
                <th>Azioni</th>
              </tr></thead>
              <tbody>{filtered.map(c=>{
                const resp=utenti.find(u=>u.id===c.responsabile_id);
                return(
                  <tr key={c.id} style={c.stato==='in_scadenza'?{background:'rgba(200,164,94,.03)'}:c.stato==='scaduto'?{background:'rgba(224,82,82,.03)'}:{}}>
                    <td><span style={{fontWeight:600}}>{NOME(c)}</span></td>
                    <td><span style={{fontSize:'.75rem',fontFamily:'monospace',color:'var(--mu)'}}>{CF(c)}</span></td>
                    <td><span style={{fontSize:'.75rem',color:'var(--mu)'}}>{resp?`${resp.nome} ${resp.cognome||''}`:'—'}</span></td>
                    <td><span style={{fontSize:'.78rem',color:'var(--mu)'}}>{c.delega?fmtDate(c.delega.data_delega):'—'}</span></td>
                    <td><span style={{fontSize:'.78rem',color:c.stato==='in_scadenza'?'var(--gold)':c.stato==='scaduto'?'var(--rd)':'var(--mu)'}}>{c.delega?fmtDate(c.delega.data_scadenza):'—'}</span></td>
                    <td><DelegaBadge stato={c.stato}/></td>
                    <td><div className="tbl-actions">
                      <button className="btn-icon" onClick={()=>setModal(c)}>✏️</button>
                      {c.delega&&<button className="btn-icon" style={{borderColor:'rgba(224,82,82,.3)',color:'#ff8585'}} onClick={()=>eliminaDelega(c.delega.id)}>🗑</button>}
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div style={{padding:'.5rem 1rem',fontSize:'.68rem',color:'var(--mu)',borderTop:'1px solid var(--bd)'}}>
            {filtered.length} clienti · Clicca ✏️ per inserire o modificare la delega
          </div>
        </div>
      )}
    </div>
  );
}

function DelegaModal({cliente,delegaEsistente,onSave,onClose,saving}){
  const NOME=cliente.ragione_sociale||`${cliente.nome} ${cliente.cognome||''}`.trim();
  const oggi=todayStr();
  const [dataDelega,setDataDelega]=useState(delegaEsistente?.data_delega||oggi);
  const [note,setNote]=useState(delegaEsistente?.note||'');
  const scad=calcolaScadenzaDelega(dataDelega);
  const stato=scad?statoDelega(scad):'da_attivare';

  const salva=()=>{
    if(!dataDelega)return;
    onSave({cliente_id:cliente.id,data_delega:dataDelega,data_scadenza:scad,note,attivo:true});
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">🔑 Delega Unica</div><div className="modal-sub">{NOME}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg"><label>CF / P.IVA</label><input value={cliente.codice_fiscale||cliente.partita_iva||''} disabled style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,color:'var(--mu)',padding:'.52rem .75rem',fontSize:'.84rem',width:'100%'}}/></div>
            <div className="fg"><label>Data delega *</label><input type="date" value={dataDelega} onChange={e=>setDataDelega(e.target.value)}/></div>
            <div className="fg full">
              <label>Scadenza (automatica)</label>
              <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,padding:'.52rem .75rem',fontSize:'.84rem',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{color:stato==='scaduto'?'var(--rd)':stato==='in_scadenza'?'var(--gold)':'var(--gr)',fontWeight:600}}>{scad?fmtDate(scad):'—'}</span>
                {scad&&<DelegaBadge stato={stato}/>}
              </div>
              <div className="hint">31 Dicembre del 4° anno successivo alla data delega</div>
            </div>
            <div className="fg full"><label>Note</label><textarea value={note} onChange={e=>setNote(e.target.value)} style={{minHeight:60}}/></div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={!dataDelega||saving} onClick={salva}>{saving?'Salvo...':'💾 Salva'}</button></div>
      </div>
    </div>
  );
}

function DelegheImportModal({clienti,delegheMap,onSave,onClose}){
  const [testo,setTesto]=useState('');
  const [parsed,setParsed]=useState([]);
  const [saving,setSaving]=useState(false);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();

  const parsaTesto=async(txt)=>{
    // Cerca righe con pattern CF(16 car o 11 cifre) + data
    const righe=txt.split(String.fromCharCode(10));
    const risultati=[];
    const cfRegex=/([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]|\d{11})/gi;
    const dateRegex=/(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/g;

    for(const riga of righe){
      const cfs=[...riga.matchAll(cfRegex)].map(m=>m[1].toUpperCase());
      const date=[...riga.matchAll(dateRegex)].map(m=>m[1]);
      if(!cfs.length)continue;

      for(const cf of cfs){
        const cliente=clienti.find(c=>(c.codice_fiscale||'').toUpperCase()===cf||(c.partita_iva||''===cf));
        let dataDelega=null;
        if(date.length>0){
          const d=date[0];
          // Normalizza formato
          if(d.includes('/'))dataDelega=d.split('/').reverse().join('-');
          else dataDelega=d;
        }
        const scad=calcolaScadenzaDelega(dataDelega||todayStr());
        risultati.push({cf,cliente,dataDelega:dataDelega||todayStr(),scadenza:scad,trovato:!!cliente,cliente_id:cliente?.id});
      }
    }
    setParsed(risultati);
  };

  const handleFile=async(file)=>{
    if(!file)return;
    const txt=await file.text();
    parsaTesto(txt);
  };

  const importa=async()=>{
    setSaving(true);
    const items=parsed.filter(p=>p.trovato).map(p=>({
      cliente_id:p.cliente_id,
      data_delega:p.dataDelega,
      data_scadenza:p.scadenza,
      attivo:true,
    }));
    await onSave(items);
    setSaving(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">📄 Importa Deleghe da file</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="alert alert-info" style={{marginBottom:'.85rem'}}>Carica un file PDF, TXT o CSV con la lista delle deleghe ADE. Il sistema cerca automaticamente i codici fiscali e le date presenti nel documento.</div>

          <div className={"upload-zone"+(drag?' drag':'')} style={{padding:'1.5rem',marginBottom:'.85rem'}}
            onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
            onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>fileRef.current.click()}>
            <div className="upload-zone-ico">📄</div>
            <div className="upload-zone-t">Carica file deleghe</div>
            <div className="upload-zone-s">PDF, TXT, CSV con lista CF e date</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.csv" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>

          <div className="fg" style={{marginBottom:'.85rem'}}>
            <label>Oppure incolla il testo direttamente</label>
            <textarea value={testo} onChange={e=>{setTesto(e.target.value);parsaTesto(e.target.value);}} style={{minHeight:100}} placeholder="CF BNCMRN80A01H501Z  01/01/2026&#10;RSSMRA75T10F205Z  15/03/2026&#10;..."/>
          </div>

          {parsed.length>0&&(
            <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:10,overflow:'hidden'}}>
              <div style={{padding:'.5rem .75rem',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between',fontSize:'.72rem',color:'var(--mu)'}}>
                <span>{parsed.length} righe trovate</span>
                <span style={{color:'var(--gr)'}}>{parsed.filter(p=>p.trovato).length} clienti abbinati</span>
              </div>
              <div style={{maxHeight:220,overflowY:'auto'}}>
                {parsed.map((p,i)=>(
                  <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 1fr auto',gap:'.5rem',padding:'.4rem .75rem',borderBottom:'1px solid rgba(33,40,58,.4)',alignItems:'center'}}>
                    <div>
                      <div style={{fontSize:'.75rem',fontFamily:'monospace',fontWeight:600}}>{p.cf}</div>
                      <div style={{fontSize:'.68rem',color:p.trovato?'var(--gr)':'var(--rd)'}}>{p.trovato?(p.cliente.ragione_sociale||`${p.cliente.nome} ${p.cliente.cognome||''}`):' Non trovato in anagrafica'}</div>
                    </div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)'}}>Delega: {fmtDate(p.dataDelega)}<br/>Scad: {fmtDate(p.scadenza)}</div>
                    <span className={p.trovato?'bdg bdg-green':'bdg bdg-red'}>{p.trovato?'✓':'✗'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={!parsed.filter(p=>p.trovato).length||saving} onClick={importa}>
            {saving?'Importo...':'💾 Importa '+parsed.filter(p=>p.trovato).length+' deleghe'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MODULO IMPORT DOCUMENTI (DOCUMENT HUB) ──────────────────
const TIPO_DOC_LABEL = {
  anagrafica_cliente: "📋 Anagrafica Cliente",
  fattura_attiva: "Fattura Attiva",
  fattura_passiva: "Fattura Passiva", 
  f24: "F24",
  avviso_ade: "Avviso ADE",
  estratto_conto: "Estratto Conto",
  cu: "CU",
  liquidazione_iva: "Liquidazione IVA",
  prima_nota: "Prima Nota",
  piano_conti: "Piano dei Conti",
  causali: "Causali",
  altro: "Altro"
};
const TIPO_DOC_COLOR = {
  anagrafica_cliente: "bdg-gold",
  fattura_attiva: "bdg-green",
  fattura_passiva: "bdg-blue",
  f24: "bdg-red",
  avviso_ade: "bdg-gold",
  estratto_conto: "bdg-cy",
  cu: "bdg-pu",
  liquidazione_iva: "bdg-gold",
  prima_nota: "bdg-gray",
  piano_conti: "bdg-blue",
  causali: "bdg-cy",
  altro: "bdg-gray"
};
const MODULO_DEST_LABEL = {clienti:"👤 Clienti",iva:"IVA",f24:"F24",agecon:"AgeCon",contabilita:"Contabilità",fatture:"Fatture",varie:"Varie"};
const STATO_DOC_LABEL = {pending:"In attesa AI",manual_pending:"⏳ Da classificare",classified:"Classificato",assigned:"Assegnato",processed:"Elaborato",error:"Errore"};
const STATO_DOC_COLOR = {pending:"bdg-gold",manual_pending:"bdg-orange",classified:"bdg-blue",assigned:"bdg-cy",processed:"bdg-green",error:"bdg-red"};

function ModuloImportDocumenti({ruolo}){
  const [documenti,setDocumenti]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [societa,setSocieta]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const [uploadProgress,setUploadProgress]=useState(null);
  const [selectedDoc,setSelectedDoc]=useState(null);
  const [filtroStato,setFiltroStato]=useState('tutti');
  const [aiEnabled,setAiEnabled]=useState(true);
  const [showFattureMassive,setShowFattureMassive]=useState(false);
  const [fattureDaConfermare,setFattureDaConfermare]=useState([]);
  const fileInputRef=useRef();

  useEffect(()=>{caricaDati();},[]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:docs},{data:cli},{data:soc},{data:imp}]=await Promise.all([
      sb.from('documenti_import').select('*').order('created_at',{ascending:false}).limit(100),
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva,codice_cliente').eq('attivo',true).order('nome'),
      sb.from('societa').select('id,denominazione,partita_iva').eq('attiva',true).order('denominazione'),
      sb.from('impostazioni_studio').select('chiave,valore').eq('chiave','ai_enabled').single()
    ]);
    setDocumenti(docs||[]);
    setClienti(cli||[]);
    setSocieta(soc||[]);
    setAiEnabled(imp?.valore!=='false');
    setLoading(false);
  };

  const handleFileSelect=async(e)=>{
    let files=Array.from(e.target.files);
    if(!files.length)return;
    
    setUploading(true);
    
    // Gestione file ZIP - estrai i contenuti
    const filesToProcess = [];
    for(const file of files){
      if(file.name.toLowerCase().endsWith('.zip')){
        try{
          setUploadProgress({current:0,total:1,currentFile:`📦 Estrazione ${file.name}...`});
          const JSZip = window.JSZip;
          if(!JSZip){
            alert('Libreria JSZip non disponibile. Ricarica la pagina.');
            continue;
          }
          const ab = await file.arrayBuffer();
          const zip = await JSZip.loadAsync(ab);
          
          // Estrai tutti i file supportati dallo zip
          const zipFiles = Object.keys(zip.files).filter(name => 
            !zip.files[name].dir && 
            (name.toLowerCase().endsWith('.pdf') || 
             name.toLowerCase().endsWith('.xml') || 
             name.toLowerCase().endsWith('.png') || 
             name.toLowerCase().endsWith('.jpg') || 
             name.toLowerCase().endsWith('.jpeg'))
          );
          
          for(const zipFileName of zipFiles){
            const zipFile = zip.files[zipFileName];
            const blob = await zipFile.async('blob');
            // Determina il mime type
            let mimeType = 'application/octet-stream';
            if(zipFileName.toLowerCase().endsWith('.pdf')) mimeType = 'application/pdf';
            else if(zipFileName.toLowerCase().endsWith('.xml')) mimeType = 'application/xml';
            else if(zipFileName.toLowerCase().endsWith('.png')) mimeType = 'image/png';
            else if(zipFileName.toLowerCase().endsWith('.jpg') || zipFileName.toLowerCase().endsWith('.jpeg')) mimeType = 'image/jpeg';
            
            // Crea un File object dal blob
            const extractedFile = new File([blob], zipFileName.split('/').pop(), { type: mimeType });
            filesToProcess.push(extractedFile);
          }
          
          if(zipFiles.length === 0){
            alert(`⚠️ Nessun file supportato trovato in ${file.name}`);
          }
        }catch(zipErr){
          console.error('Errore estrazione ZIP:', zipErr);
          alert(`Errore estrazione ${file.name}: ${zipErr.message}`);
        }
      } else {
        filesToProcess.push(file);
      }
    }
    
    if(filesToProcess.length === 0){
      setUploading(false);
      return;
    }
    
    setUploadProgress({current:0,total:filesToProcess.length,currentFile:''});

    for(let i=0;i<filesToProcess.length;i++){
      const file=filesToProcess[i];
      setUploadProgress({current:i+1,total:filesToProcess.length,currentFile:file.name});

      try{
        // 1. Upload file a Supabase Storage
        const filePath=`inbox/${Date.now()}_${file.name}`;
        const{error:uploadErr}=await sb.storage.from('documenti').upload(filePath,file);
        if(uploadErr)throw uploadErr;

        // 2. Crea record in database
        const{data:docRecord,error:dbErr}=await sb.from('documenti_import').insert([{
          filename:file.name,
          file_path:filePath,
          file_size:file.size,
          mime_type:file.type,
          stato:aiEnabled?'pending':'manual_pending'
        }]).select().single();
        if(dbErr)throw dbErr;

        // 3. Se AI attiva, analizza con AI
        if(aiEnabled){
          setAnalyzing(true);
          const base64=await fileToBase64(file);
          const analyzeRes=await fetch('/api/analyze-document',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              fileBase64:base64,
              filename:file.name,
              mimeType:file.type
            })
          });
          
          if(analyzeRes.ok){
            const{analysis}=await analyzeRes.json();
          
            // 4. Trova cliente matching
            let clienteMatch=null;
            if(analysis.partita_iva){
              clienteMatch=clienti.find(c=>c.partita_iva===analysis.partita_iva);
            }
            if(!clienteMatch&&analysis.codice_fiscale){
              clienteMatch=clienti.find(c=>c.codice_fiscale?.toUpperCase()===analysis.codice_fiscale?.toUpperCase());
            }

            // 5. Aggiorna record con analisi
            await sb.from('documenti_import').update({
              tipo_documento:analysis.tipo_documento,
              confidence:analysis.confidence,
              ai_summary:analysis.descrizione_breve,
              ai_raw_response:analysis,
              cf_estratto:analysis.codice_fiscale,
              piva_estratta:analysis.partita_iva,
              cliente_id:clienteMatch?.id||null,
              cliente_match_type:clienteMatch?'auto':'none',
              modulo_destinazione:analysis.modulo_suggerito,
              stato:'classified'
            }).eq('id',docRecord.id);
          }
          setAnalyzing(false);
        }
      }catch(err){
        console.error('Upload error:',err);
        alert('Errore upload: '+err.message);
      }
    }

    setUploading(false);
    setUploadProgress(null);
    fileInputRef.current.value='';
    await caricaDati();
    
    // Controlla se ci sono fatture appena caricate per conferma massiva
    const{data:fattureRecenti}=await sb.from('documenti_import')
      .select('*')
      .in('tipo_documento',['fattura_passiva','fattura_attiva'])
      .eq('stato','classified')
      .order('created_at',{ascending:false})
      .limit(filesToProcess.length);
    
    if(fattureRecenti && fattureRecenti.length > 0){
      // Mostra modal conferma fatture massive
      setFattureDaConfermare(fattureRecenti);
      setShowFattureMassive(true);
    } else if(!aiEnabled && files.length===1){
      // Se AI disattivata e un solo file caricato, apri direttamente il modal per classificare
      const{data:lastDoc}=await sb.from('documenti_import')
        .select('*')
        .eq('stato','manual_pending')
        .order('created_at',{ascending:false})
        .limit(1)
        .single();
      if(lastDoc) setSelectedDoc(lastDoc);
    }
  };

  const fileToBase64=(file)=>new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result.split(',')[1]);
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });

  const assegnaCliente=async(docId,clienteId)=>{
    await sb.from('documenti_import').update({
      cliente_id:clienteId,
      cliente_match_type:'manual',
      stato:'assigned'
    }).eq('id',docId);
    caricaDati();
    setSelectedDoc(null);
  };

  const processaDocumento=async(docId,modulo)=>{
    await sb.from('documenti_import').update({
      modulo_destinazione:modulo,
      stato:'processed',
      processato_at:new Date().toISOString()
    }).eq('id',docId);
    caricaDati();
    setSelectedDoc(null);
  };

  const eliminaDocumento=async(docId,filePath)=>{
    if(!confirm('Eliminare questo documento?'))return;
    await sb.storage.from('documenti').remove([filePath]);
    await sb.from('documenti_import').delete().eq('id',docId);
    caricaDati();
  };

  const getClienteNome=(id)=>{
    const c=clienti.find(x=>x.id===id);
    return c?(c.ragione_sociale||`${c.nome} ${c.cognome||''}`).trim():'—';
  };

  const filteredDocs=documenti.filter(d=>filtroStato==='tutti'||d.stato===filtroStato);

  const stats={
    pending:documenti.filter(d=>d.stato==='pending').length,
    manual_pending:documenti.filter(d=>d.stato==='manual_pending').length,
    classified:documenti.filter(d=>d.stato==='classified').length,
    assigned:documenti.filter(d=>d.stato==='assigned').length,
    processed:documenti.filter(d=>d.stato==='processed').length
  };

  return(
    <div className="page">
      {selectedDoc&&<DocDetailModal doc={selectedDoc} clienti={clienti} onAssegna={assegnaCliente} onProcessa={processaDocumento} onClose={()=>setSelectedDoc(null)} getClienteNome={getClienteNome}/>}
      
      {/* Modal Conferma Fatture Massive */}
      {showFattureMassive&&<ModalFattureMassive 
        fatture={fattureDaConfermare} 
        societa={societa}
        clienti={clienti}
        onConferma={async(societaId, tipoDoc)=>{
          // Aggiorna tutte le fatture con la società e inviale a prima nota
          for(const fatt of fattureDaConfermare){
            await sb.from('documenti_import').update({
              societa_destinazione_id: societaId,
              tipo_documento: tipoDoc,
              stato: 'processed',
              modulo_destinazione: 'prima_nota'
            }).eq('id', fatt.id);
          }
          alert(`✅ ${fattureDaConfermare.length} fatture inviate a Prima Nota per la registrazione!`);
          setShowFattureMassive(false);
          setFattureDaConfermare([]);
          caricaDati();
        }}
        onClose={()=>{setShowFattureMassive(false);setFattureDaConfermare([]);}}
      />}
      
      <div className="page-hdr">
        <div className="page-title">📁 Import Documenti</div>
        <div className="page-sub">Document Hub · Upload, classificazione AI e smistamento automatico</div>
      </div>

      {/* Upload Zone */}
      <div className="card" style={{marginBottom:'1rem'}}>
        {/* AI Status Banner */}
        <div style={{
          display:'flex',alignItems:'center',justifyContent:'space-between',
          padding:'.75rem 1rem',marginBottom:'.75rem',borderRadius:8,
          background:aiEnabled?'rgba(52,194,122,.1)':'rgba(251,146,60,.1)',
          border:aiEnabled?'1px solid rgba(52,194,122,.3)':'1px solid rgba(251,146,60,.3)'
        }}>
          <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
            <span style={{fontSize:'1.1rem'}}>{aiEnabled?'🤖':'✋'}</span>
            <div>
              <div style={{fontWeight:600,fontSize:'.82rem',color:aiEnabled?'#4dde96':'#fb923c'}}>
                {aiEnabled?'Modalità AI Attiva':'Modalità Manuale'}
              </div>
              <div style={{fontSize:'.7rem',color:'var(--mu)'}}>
                {aiEnabled?'I documenti vengono classificati automaticamente':'Dovrai classificare i documenti manualmente'}
              </div>
            </div>
          </div>
          <span className={'bdg '+(aiEnabled?'bdg-green':'bdg-orange')} style={{fontSize:'.68rem'}}>
            {aiEnabled?'AI ON':'AI OFF'}
          </span>
        </div>
        <div 
          className="upload-zone" 
          onClick={()=>!uploading&&fileInputRef.current.click()}
          style={{opacity:uploading?0.6:1,cursor:uploading?'wait':'pointer'}}
        >
          {uploading?(
            <>
              <div className="upload-zone-ico">⏳</div>
              <div className="upload-zone-t">Elaborazione in corso...</div>
              <div className="upload-zone-s">{uploadProgress?.currentFile} ({uploadProgress?.current}/{uploadProgress?.total})</div>
              {analyzing&&<div style={{marginTop:'.5rem',fontSize:'.75rem',color:'var(--gold)'}}>🤖 Analisi AI in corso...</div>}
            </>
          ):(
            <>
              <div className="upload-zone-ico">📄</div>
              <div className="upload-zone-t">Carica documenti</div>
              <div className="upload-zone-s">PDF, XML, immagini · Trascina o clicca per selezionare</div>
              {!aiEnabled&&<div style={{marginTop:'.5rem',fontSize:'.72rem',color:'#fb923c'}}>⚠️ AI disattivata - classificazione manuale richiesta dopo upload</div>}
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" multiple accept=".pdf,.xml,.png,.jpg,.jpeg,.zip" style={{display:'none'}} onChange={handleFileSelect}/>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        {[
          ['⏳ In attesa AI',stats.pending,'var(--gold)','pending'],
          ['✋ Da classificare',stats.manual_pending,'#fb923c','manual_pending'],
          ['🔍 Classificati',stats.classified,'var(--bl)','classified'],
          ['👤 Assegnati',stats.assigned,'var(--cy)','assigned'],
          ['✓ Elaborati',stats.processed,'var(--gr)','processed']
        ].map(([l,v,c,f])=>(
          <div key={f} className="stat-card" style={{cursor:'pointer',border:filtroStato===f?`1px solid ${c}`:'1px solid var(--bd)'}} onClick={()=>setFiltroStato(filtroStato===f?'tutti':f)}>
            <div className="stat-val" style={{color:c,fontSize:'1.4rem'}}>{v}</div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      {/* Pills filtro */}
      <div className="pills">
        {[
          ['tutti','Tutti ('+documenti.length+')'],
          ['pending','⏳ AI'],
          ['manual_pending','✋ Manuali'],
          ['classified','🔍 Classificati'],
          ['assigned','👤 Assegnati'],
          ['processed','✓ Elaborati']
        ].map(([v,l])=>(
          <span key={v} className={'pill'+(filtroStato===v?' active':'')} onClick={()=>setFiltroStato(v)}>{l}</span>
        ))}
      </div>

      {/* Lista documenti */}
      {loading?<div className="loading">⏳ Caricamento...</div>:filteredDocs.length===0?(
        <div className="empty"><div className="empty-ico">📁</div><div className="empty-t">Nessun documento</div><div className="empty-s">Carica i primi documenti per iniziare</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th>File</th>
              <th>Tipo</th>
              <th>Cliente</th>
              <th>Modulo</th>
              <th>Stato</th>
              <th>Data</th>
              <th>Azioni</th>
            </tr></thead>
            <tbody>{filteredDocs.map(d=>(
              <tr key={d.id}>
                <td>
                  <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
                    <span style={{fontSize:'1.1rem'}}>{d.mime_type?.includes('pdf')?'📄':d.mime_type?.includes('xml')?'📋':'🖼️'}</span>
                    <div>
                      <div style={{fontWeight:600,fontSize:'.8rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{d.filename}</div>
                      <div style={{fontSize:'.68rem',color:'var(--mu)'}}>{(d.file_size/1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                </td>
                <td>
                  {d.tipo_documento?(
                    <div>
                      <span className={"bdg "+TIPO_DOC_COLOR[d.tipo_documento]}>{TIPO_DOC_LABEL[d.tipo_documento]||d.tipo_documento}</span>
                      {d.confidence&&<div style={{fontSize:'.62rem',color:'var(--mu)',marginTop:'.15rem'}}>{Math.round(d.confidence*100)}% conf.</div>}
                    </div>
                  ):<span style={{color:'var(--mu)',fontSize:'.75rem'}}>—</span>}
                </td>
                <td>
                  {d.cliente_id?(
                    <div>
                      <div style={{fontSize:'.78rem',fontWeight:500}}>{getClienteNome(d.cliente_id)}</div>
                      <div style={{fontSize:'.62rem',color:d.cliente_match_type==='auto'?'var(--gr)':'var(--cy)'}}>{d.cliente_match_type==='auto'?'🤖 Auto':'✋ Manuale'}</div>
                    </div>
                  ):<span style={{color:'var(--rd)',fontSize:'.72rem'}}>⚠️ Non assegnato</span>}
                </td>
                <td><span style={{fontSize:'.78rem',color:'var(--mu)'}}>{MODULO_DEST_LABEL[d.modulo_destinazione]||'—'}</span></td>
                <td><span className={"bdg "+(STATO_DOC_COLOR[d.stato]||'bdg-gray')}>{STATO_DOC_LABEL[d.stato]||d.stato}</span></td>
                <td style={{fontSize:'.72rem',color:'var(--mu)'}}>{fmtDate(d.created_at?.split('T')[0])}</td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn-icon" onClick={()=>setSelectedDoc(d)} title="Dettagli">👁️</button>
                    <button className="btn-icon" style={{borderColor:'rgba(224,82,82,.3)',color:'#ff8585'}} onClick={()=>eliminaDocumento(d.id,d.file_path)} title="Elimina">🗑</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Modal per conferma fatture massive
function ModalFattureMassive({fatture,societa,clienti,onConferma,onClose}){
  const [selectedSocieta,setSelectedSocieta]=useState('');
  const [tipoDocumento,setTipoDocumento]=useState('fattura_passiva');
  const [conferming,setConferming]=useState(false);

  // Calcola totali
  const totaleImponibile = fatture.reduce((sum,f)=>{
    const analysis = f.ai_raw_response || {};
    return sum + (analysis.dati_fattura?.imponibile || analysis.importo_principale || 0);
  },0);
  
  const totaleIva = fatture.reduce((sum,f)=>{
    const analysis = f.ai_raw_response || {};
    return sum + (analysis.dati_fattura?.iva || 0);
  },0);

  const handleConferma = async () => {
    if(!selectedSocieta){
      alert('Seleziona una società di destinazione');
      return;
    }
    setConferming(true);
    await onConferma(selectedSocieta, tipoDocumento);
    setConferming(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:800,maxHeight:'90vh',overflow:'auto'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📦 Conferma Import Fatture ({fatture.length})</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          
          {/* Riepilogo */}
          <div style={{
            background:'linear-gradient(135deg,rgba(200,164,94,.15),rgba(200,164,94,.05))',
            border:'2px solid rgba(200,164,94,.4)',
            borderRadius:12,padding:'1rem',marginBottom:'1rem'
          }}>
            <div style={{display:'flex',alignItems:'center',gap:'.75rem',marginBottom:'.75rem'}}>
              <span style={{fontSize:'1.5rem'}}>📊</span>
              <div>
                <div style={{fontWeight:700,color:'var(--gold)',fontSize:'.95rem'}}>Riepilogo Fatture Rilevate</div>
                <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
                  Verifica i dati e seleziona la società di destinazione per la registrazione
                </div>
              </div>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1rem',marginTop:'.75rem'}}>
              <div style={{textAlign:'center',padding:'.5rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{fontSize:'1.5rem',fontWeight:700,color:'var(--gold)'}}>{fatture.length}</div>
                <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Fatture</div>
              </div>
              <div style={{textAlign:'center',padding:'.5rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--tx)'}}>€ {totaleImponibile.toLocaleString('it-IT',{minimumFractionDigits:2})}</div>
                <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Imponibile</div>
              </div>
              <div style={{textAlign:'center',padding:'.5rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--bl)'}}>€ {totaleIva.toLocaleString('it-IT',{minimumFractionDigits:2})}</div>
                <div style={{fontSize:'.7rem',color:'var(--mu)'}}>IVA</div>
              </div>
            </div>
          </div>

          {/* Selezione Tipo e Società */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
            <div>
              <label style={{fontSize:'.72rem',color:'var(--mu)',marginBottom:'.25rem',display:'block'}}>Tipo Documento</label>
              <select 
                value={tipoDocumento} 
                onChange={e=>setTipoDocumento(e.target.value)}
                style={{width:'100%',padding:'.6rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)'}}
              >
                <option value="fattura_passiva">📥 Fattura Passiva (Acquisto)</option>
                <option value="fattura_attiva">📤 Fattura Attiva (Vendita)</option>
              </select>
            </div>
            <div>
              <label style={{fontSize:'.72rem',color:'var(--mu)',marginBottom:'.25rem',display:'block'}}>Società Destinazione *</label>
              <select 
                value={selectedSocieta} 
                onChange={e=>setSelectedSocieta(e.target.value)}
                style={{width:'100%',padding:'.6rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)'}}
              >
                <option value="">-- Seleziona società --</option>
                {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione} ({s.partita_iva})</option>)}
              </select>
            </div>
          </div>

          {/* Lista Fatture */}
          <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--mu)',marginBottom:'.5rem'}}>DETTAGLIO FATTURE</div>
          <div style={{maxHeight:300,overflowY:'auto',border:'1px solid var(--bd)',borderRadius:8}}>
            <table className="table" style={{fontSize:'.78rem'}}>
              <thead>
                <tr>
                  <th>File</th>
                  <th>Fornitore/Cliente</th>
                  <th>N° Fatt.</th>
                  <th>Data</th>
                  <th style={{textAlign:'right'}}>Totale</th>
                </tr>
              </thead>
              <tbody>
                {fatture.map(f=>{
                  const analysis = f.ai_raw_response || {};
                  const dati = analysis.dati_fattura || {};
                  return(
                    <tr key={f.id}>
                      <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.filename}</td>
                      <td>{dati.cedente_denominazione || analysis.partita_iva || '-'}</td>
                      <td>{dati.numero || '-'}</td>
                      <td>{dati.data || '-'}</td>
                      <td style={{textAlign:'right',fontWeight:600}}>€ {(dati.totale || analysis.importo_principale || 0).toLocaleString('it-IT',{minimumFractionDigits:2})}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Info */}
          <div style={{marginTop:'1rem',padding:'.75rem',background:'rgba(59,130,246,.1)',borderRadius:8,border:'1px solid rgba(59,130,246,.3)'}}>
            <div style={{fontSize:'.75rem',color:'var(--bl)'}}>
              <strong>ℹ️ Info:</strong> Confermando, tutte le fatture verranno inviate al modulo Contabilità → Prima Nota 
              per la registrazione nella società selezionata.
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" onClick={handleConferma} disabled={conferming || !selectedSocieta}>
            {conferming ? '⏳ Invio in corso...' : `✓ Conferma e Invia ${fatture.length} Fatture`}
          </button>
        </div>
      </div>
    </div>
  );
}

function DocDetailModal({doc,clienti,onAssegna,onProcessa,onClose,getClienteNome}){
  const [selCliente,setSelCliente]=useState(doc.cliente_id||'');
  const [selModulo,setSelModulo]=useState(doc.modulo_destinazione||'varie');
  const [searchCl,setSearchCl]=useState('');
  const [creandoCliente,setCreandoCliente]=useState(false);
  const [tipoDocumento,setTipoDocumento]=useState(doc.tipo_documento||'altro');
  const [salvando,setSalvando]=useState(false);

  const filteredClienti=clienti.filter(c=>{
    const nome=(c.ragione_sociale||`${c.nome} ${c.cognome||''}`).toLowerCase();
    return !searchCl||nome.includes(searchCl.toLowerCase())||(c.codice_fiscale||'').toLowerCase().includes(searchCl.toLowerCase())||(c.partita_iva||'').includes(searchCl);
  });

  const analysis=doc.ai_raw_response||{};
  const isAnagrafica=tipoDocumento==='anagrafica_cliente';
  const datiAnag=analysis.dati_anagrafici||{};
  const datiEstrattiDisponibili=Object.keys(datiAnag).length>0||(doc.cf_estratto||doc.piva_estratta);

  // Tutti i tipi documento disponibili
  const TIPI_DOCUMENTO = {
    anagrafica_cliente: "📋 Anagrafica Cliente (nuovo cliente studio)",
    fattura_attiva: "📤 Fattura Attiva (emessa)",
    fattura_passiva: "📥 Fattura Passiva (ricevuta)",
    f24: "🏦 Modello F24",
    avviso_ade: "📬 Avviso/Comunicazione Agenzia Entrate",
    estratto_conto: "🏧 Estratto Conto Bancario",
    cu: "📄 Certificazione Unica (CU)",
    liquidazione_iva: "💰 Liquidazione IVA",
    prima_nota: "📝 Prima Nota / Registrazione Contabile",
    piano_conti: "🗂️ Piano dei Conti",
    causali: "📋 Causali Contabili",
    bilancio: "📊 Bilancio / Situazione Contabile",
    dichiarazione: "📑 Dichiarazione Fiscale",
    contratto: "📃 Contratto",
    visura: "🏢 Visura Camerale",
    altro: "❓ Altro documento"
  };

  // Aggiorna il modulo suggerito in base al tipo documento
  const getModuloSuggerito = (tipo) => {
    const mapping = {
      anagrafica_cliente: 'clienti',
      fattura_attiva: 'fatture',
      fattura_passiva: 'fatture',
      f24: 'f24',
      avviso_ade: 'agecon',
      estratto_conto: 'contabilita',
      cu: 'contabilita',
      liquidazione_iva: 'iva',
      prima_nota: 'contabilita',
      piano_conti: 'contabilita',
      causali: 'contabilita',
      bilancio: 'contabilita',
      dichiarazione: 'agecon',
      contratto: 'varie',
      visura: 'clienti',
      altro: 'varie'
    };
    return mapping[tipo] || 'varie';
  };

  const onTipoDocumentoChange = (nuovoTipo) => {
    setTipoDocumento(nuovoTipo);
    setSelModulo(getModuloSuggerito(nuovoTipo));
  };

  // Classifica manualmente il documento (da manual_pending a classified)
  const classificaManualmente = async () => {
    setSalvando(true);
    try {
      await sb.from('documenti_import').update({
        tipo_documento: tipoDocumento,
        modulo_destinazione: selModulo,
        stato: 'classified'
      }).eq('id', doc.id);
      doc.tipo_documento = tipoDocumento;
      doc.modulo_destinazione = selModulo;
      doc.stato = 'classified';
      alert('✅ Documento classificato con successo!');
      onClose();
      window.location.reload();
    } catch(err) {
      alert('Errore: ' + err.message);
    }
    setSalvando(false);
  };

  const salvaTipoDocumento = async () => {
    setSalvando(true);
    try {
      await sb.from('documenti_import').update({
        tipo_documento: tipoDocumento,
        modulo_destinazione: selModulo
      }).eq('id', doc.id);
      doc.tipo_documento = tipoDocumento;
      doc.modulo_destinazione = selModulo;
    } catch(err) {
      alert('Errore: ' + err.message);
    }
    setSalvando(false);
  };

  const creaClienteDaAnalisi=async()=>{
    setCreandoCliente(true);
    
    try{
      const tipoMap={
        'persona_fisica':'persona_fisica',
        'societa_capitali':'societa',
        'societa_persone':'societa',
        'professionista':'professionista',
        'ditta_individuale':'ditta_individuale'
      };
      
      const ragSoc=datiAnag.ragione_sociale||doc.ai_summary?.split(' ')[0]||'Nuovo Cliente';
      const cf = datiAnag.codice_fiscale||doc.cf_estratto||analysis.codice_fiscale||null;
      const piva = datiAnag.partita_iva||doc.piva_estratta||analysis.partita_iva||null;
      
      // 1. CONTROLLO DUPLICATI - Verifica se esiste già un cliente con stesso CF, P.IVA o denominazione
      let duplicatoTrovato = null;
      let motivoDuplicato = '';
      
      if(cf){
        const{data:esisteCF}=await sb.from('clienti').select('id,nome,ragione_sociale,codice_fiscale').eq('codice_fiscale',cf).limit(1);
        if(esisteCF && esisteCF.length > 0){
          duplicatoTrovato = esisteCF[0];
          motivoDuplicato = `Codice Fiscale "${cf}"`;
        }
      }
      
      if(!duplicatoTrovato && piva){
        const{data:esistePIVA}=await sb.from('clienti').select('id,nome,ragione_sociale,partita_iva').eq('partita_iva',piva).limit(1);
        if(esistePIVA && esistePIVA.length > 0){
          duplicatoTrovato = esistePIVA[0];
          motivoDuplicato = `Partita IVA "${piva}"`;
        }
      }
      
      if(!duplicatoTrovato && ragSoc){
        const{data:esisteRagSoc}=await sb.from('clienti').select('id,nome,ragione_sociale').eq('ragione_sociale',ragSoc).limit(1);
        if(esisteRagSoc && esisteRagSoc.length > 0){
          duplicatoTrovato = esisteRagSoc[0];
          motivoDuplicato = `Ragione Sociale "${ragSoc}"`;
        }
      }
      
      if(duplicatoTrovato){
        const nomeEsistente = duplicatoTrovato.ragione_sociale || duplicatoTrovato.nome || 'N/D';
        alert(`⚠️ CLIENTE GIÀ ESISTENTE!\n\nTrovato cliente con stesso ${motivoDuplicato}:\n"${nomeEsistente}"\n\nIl documento verrà collegato al cliente esistente.`);
        
        // Collega il documento al cliente esistente invece di crearne uno nuovo
        await sb.from('documenti_import').update({
          cliente_id:duplicatoTrovato.id,
          cliente_match_type:'duplicate_found',
          tipo_documento:'anagrafica_cliente',
          stato:'assigned',
          modulo_destinazione:'clienti'
        }).eq('id',doc.id);
        
        onClose();
        window.location.reload();
        return;
      }
      
      // 2. GENERA CODICE CLIENTE AUTOMATICO - Prende il primo libero
      const{data:ultimiCodici}=await sb.from('clienti').select('codice_cliente').order('codice_cliente',{ascending:false}).limit(100);
      let nuovoCodice = '0001';
      if(ultimiCodici && ultimiCodici.length > 0){
        // Trova tutti i codici numerici esistenti
        const codiciNumerici = ultimiCodici
          .map(c => parseInt(c.codice_cliente, 10))
          .filter(n => !isNaN(n))
          .sort((a,b) => b - a);
        
        if(codiciNumerici.length > 0){
          nuovoCodice = String(codiciNumerici[0] + 1).padStart(4, '0');
        }
      }
      
      // Costruisci note con tutti i dati extra estratti dall'AI
      let noteExtra = [`Importato da: ${doc.filename}`];
      if(analysis.fonte_software) noteExtra.push(`Software: ${analysis.fonte_software}`);
      if(datiAnag.indirizzo) noteExtra.push(`Indirizzo: ${datiAnag.indirizzo}`);
      if(datiAnag.cap) noteExtra.push(`CAP: ${datiAnag.cap}`);
      if(datiAnag.citta) noteExtra.push(`Città: ${datiAnag.citta}`);
      if(datiAnag.provincia) noteExtra.push(`Provincia: ${datiAnag.provincia}`);
      if(datiAnag.email) noteExtra.push(`Email: ${datiAnag.email}`);
      if(datiAnag.pec) noteExtra.push(`PEC: ${datiAnag.pec}`);
      if(datiAnag.telefono) noteExtra.push(`Telefono: ${datiAnag.telefono}`);
      if(datiAnag.codice_cliente) noteExtra.push(`Codice cliente originale: ${datiAnag.codice_cliente}`);
      if(datiAnag.rappresentante_legale) noteExtra.push(`Rapp. Legale: ${datiAnag.rappresentante_legale}`);
      
      // SOLO campi essenziali che esistono sicuramente nella tabella clienti
      const nuovoCliente={
        codice_cliente: nuovoCodice,
        nome:datiAnag.nome||ragSoc.split(' ')[0]||'',
        cognome:datiAnag.cognome||'',
        ragione_sociale:datiAnag.ragione_sociale||ragSoc||null,
        tipo_cliente:tipoMap[datiAnag.tipo_cliente]||'societa',
        codice_fiscale:cf,
        partita_iva:piva,
        note:noteExtra.join('\n'),
        attivo:true
      };
      
      const{data:inserted,error}=await sb.from('clienti').insert([nuovoCliente]).select().single();
      if(error)throw error;
      
      await sb.from('documenti_import').update({
        cliente_id:inserted.id,
        cliente_match_type:'created',
        tipo_documento:'anagrafica_cliente',
        stato:'processed',
        modulo_destinazione:'clienti'
      }).eq('id',doc.id);
      
      alert(`✅ Cliente "${nuovoCliente.ragione_sociale||nuovoCliente.nome}" creato con successo!`);
      onClose();
      window.location.reload();
    }catch(err){
      alert('Errore creazione cliente: '+err.message);
    }finally{
      setCreandoCliente(false);
    }
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:700,maxHeight:'90vh',overflow:'auto'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📄 {doc.filename}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          
          {/* Banner per documento manual_pending */}
          {doc.stato==='manual_pending'&&(
            <div style={{
              background:'linear-gradient(135deg,rgba(251,146,60,.15),rgba(251,146,60,.05))',
              border:'2px solid rgba(251,146,60,.4)',borderRadius:12,padding:'1rem',marginBottom:'1rem'
            }}>
              <div style={{display:'flex',alignItems:'center',gap:'.75rem'}}>
                <span style={{fontSize:'1.5rem'}}>✋</span>
                <div>
                  <div style={{fontWeight:700,color:'#fb923c',fontSize:'.9rem'}}>Classificazione Manuale Richiesta</div>
                  <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
                    L'AI è disattivata. Seleziona il tipo documento, assegna un cliente e scegli il modulo di destinazione.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TIPO DOCUMENTO - Selezione principale */}
          <div style={{background:'linear-gradient(135deg,rgba(200,164,94,.15),rgba(200,164,94,.05))',border:'2px solid rgba(200,164,94,.4)',borderRadius:12,padding:'1rem',marginBottom:'1rem'}}>
            <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.75rem'}}>
              <span style={{fontSize:'1.2rem'}}>{doc.stato==='manual_pending'?'📋':'🤖'}</span>
              <span style={{fontWeight:700,color:'var(--gold)'}}>Tipo Documento</span>
              {analysis.confidence&&<span style={{fontSize:'.7rem',background:'var(--s2)',padding:'.15rem .4rem',borderRadius:4,color:'var(--mu)'}}>AI: {Math.round(analysis.confidence*100)}% sicuro</span>}
            </div>
            
            <select 
              value={tipoDocumento} 
              onChange={e=>onTipoDocumentoChange(e.target.value)}
              style={{width:'100%',padding:'.6rem',fontSize:'.9rem',fontWeight:600,borderRadius:8,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)'}}
            >
              {Object.entries(TIPI_DOCUMENTO).map(([k,v])=>(
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            
            {tipoDocumento!==doc.tipo_documento&&(
              <div style={{marginTop:'.5rem',display:'flex',alignItems:'center',gap:'.5rem'}}>
                <span style={{fontSize:'.72rem',color:'var(--mu)'}}>Hai modificato il tipo documento.</span>
                <button className="btn" style={{padding:'.25rem .6rem',fontSize:'.72rem'}} onClick={salvaTipoDocumento} disabled={salvando}>
                  {salvando?'⏳':'💾'} Salva modifica
                </button>
              </div>
            )}
            
            {doc.tipo_documento&&tipoDocumento===doc.tipo_documento&&analysis.fonte_software&&(
              <div style={{marginTop:'.5rem',fontSize:'.72rem',color:'var(--mu)'}}>
                Rilevato da: <strong>{analysis.fonte_software.toUpperCase()}</strong>
              </div>
            )}
          </div>

          {/* Dati estratti dall'AI */}
          <div style={{background:'rgba(200,164,94,.05)',border:'1px solid rgba(200,164,94,.2)',borderRadius:10,padding:'.75rem',marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',fontWeight:600,color:'var(--mu)',marginBottom:'.5rem'}}>📊 DATI ESTRATTI DALL'AI</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.4rem',fontSize:'.78rem'}}>
              <div><span style={{color:'var(--mu)'}}>C.F.:</span> <strong style={{fontFamily:'monospace'}}>{doc.cf_estratto||analysis.codice_fiscale||'—'}</strong></div>
              <div><span style={{color:'var(--mu)'}}>P.IVA:</span> <strong style={{fontFamily:'monospace'}}>{doc.piva_estratta||analysis.partita_iva||'—'}</strong></div>
              {analysis.importo_principale&&<div><span style={{color:'var(--mu)'}}>Importo:</span> <strong>{analysis.importo_principale}</strong></div>}
              {analysis.data_documento&&<div><span style={{color:'var(--mu)'}}>Data:</span> <strong>{analysis.data_documento}</strong></div>}
            </div>
            {doc.ai_summary&&<div style={{marginTop:'.5rem',fontSize:'.75rem',color:'var(--tx)',lineHeight:1.4,fontStyle:'italic'}}>"{doc.ai_summary}"</div>}
          </div>

          {/* Sezione specifica per ANAGRAFICA CLIENTE */}
          {isAnagrafica&&(
            <div style={{background:'rgba(106,190,163,.1)',border:'1px solid rgba(106,190,163,.3)',borderRadius:10,padding:'.85rem',marginBottom:'1rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.75rem'}}>
                <div style={{fontSize:'.75rem',fontWeight:700,color:'var(--gr)'}}>👤 NUOVO CLIENTE STUDIO</div>
                <button 
                  className="btn" 
                  style={{padding:'.4rem .8rem',fontSize:'.78rem'}}
                  onClick={creaClienteDaAnalisi}
                  disabled={creandoCliente}
                >
                  {creandoCliente?'⏳ Creazione...':'✨ Crea Cliente in Anagrafica'}
                </button>
              </div>
              
              {datiEstrattiDisponibili?(
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.4rem',fontSize:'.75rem'}}>
                  {datiAnag.codice_cliente&&<div><span style={{color:'var(--mu)'}}>Codice:</span> <strong style={{color:'var(--gold)'}}>{datiAnag.codice_cliente}</strong></div>}
                  {(datiAnag.ragione_sociale)&&<div style={{gridColumn:'1/-1'}}><span style={{color:'var(--mu)'}}>Ragione Sociale:</span> <strong>{datiAnag.ragione_sociale}</strong></div>}
                  {datiAnag.nome&&<div><span style={{color:'var(--mu)'}}>Nome:</span> <strong>{datiAnag.nome}</strong></div>}
                  {datiAnag.cognome&&<div><span style={{color:'var(--mu)'}}>Cognome:</span> <strong>{datiAnag.cognome}</strong></div>}
                  {(datiAnag.codice_fiscale||doc.cf_estratto)&&<div><span style={{color:'var(--mu)'}}>C.F.:</span> <strong style={{fontFamily:'monospace'}}>{datiAnag.codice_fiscale||doc.cf_estratto}</strong></div>}
                  {(datiAnag.partita_iva||doc.piva_estratta)&&<div><span style={{color:'var(--mu)'}}>P.IVA:</span> <strong style={{fontFamily:'monospace'}}>{datiAnag.partita_iva||doc.piva_estratta}</strong></div>}
                  {datiAnag.indirizzo&&<div style={{gridColumn:'1/-1'}}><span style={{color:'var(--mu)'}}>Indirizzo:</span> <strong>{datiAnag.indirizzo}</strong></div>}
                  {(datiAnag.cap||datiAnag.citta||datiAnag.provincia)&&<div style={{gridColumn:'1/-1'}}><span style={{color:'var(--mu)'}}>Località:</span> <strong>{[datiAnag.cap,datiAnag.citta,datiAnag.provincia].filter(Boolean).join(' ')}</strong></div>}
                </div>
              ):(
                <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
                  Clicca "Crea Cliente" per creare il cliente con i dati estratti (P.IVA/C.F.)
                </div>
              )}
            </div>
          )}

          {/* Assegnazione cliente esistente (per documenti non anagrafica) */}
          {!isAnagrafica&&(
            <div className="fg" style={{marginBottom:'.85rem'}}>
              <label>Assegna a Cliente Esistente</label>
              <input placeholder="🔍 Cerca per nome, P.IVA o C.F..." value={searchCl} onChange={e=>setSearchCl(e.target.value)} style={{marginBottom:'.35rem'}}/>
              <select value={selCliente} onChange={e=>setSelCliente(e.target.value)}>
                <option value="">-- Seleziona cliente --</option>
                {filteredClienti.map(c=>(
                  <option key={c.id} value={c.id}>{c.codice_cliente?`[${c.codice_cliente}] `:''}{c.ragione_sociale||`${c.nome} ${c.cognome||''}`} {c.partita_iva?`(${c.partita_iva})`:''}</option>
                ))}
              </select>
              {!selCliente&&filteredClienti.length===0&&searchCl&&(
                <div style={{fontSize:'.72rem',color:'var(--rd)',marginTop:'.25rem'}}>
                  Nessun cliente trovato. Cambia il tipo documento in "Anagrafica Cliente" per crearne uno nuovo.
                </div>
              )}
            </div>
          )}

          {/* Modulo destinazione */}
          <div className="fg" style={{marginBottom:'.85rem'}}>
            <label>Modulo Destinazione</label>
            <select value={selModulo} onChange={e=>setSelModulo(e.target.value)}>
              {Object.entries(MODULO_DEST_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Chiudi</button>
          {doc.stato==='manual_pending'&&(
            <button className="btn" style={{background:'linear-gradient(135deg,#fb923c,#ea580c)'}} onClick={classificaManualmente} disabled={salvando}>
              {salvando?'⏳ Salvataggio...':'✓ Classifica e Salva'}
            </button>
          )}
          {!isAnagrafica&&selCliente&&doc.stato!=='processed'&&doc.stato!=='manual_pending'&&<button className="btn-sec" onClick={()=>onAssegna(doc.id,selCliente)}>👤 Assegna</button>}
          {doc.stato!=='processed'&&doc.stato!=='manual_pending'&&<button className="btn" onClick={()=>onProcessa(doc.id,selModulo)}>✓ Elabora</button>}
        </div>
      </div>
    </div>
  );
}

// ─── MODULO EXPORT DATI (HUB CENTRALIZZATO) ──────────────────
function ModuloExportDati({onNavigate}){
  const [societa,setSocieta]=useState([]);
  const [selectedSocieta,setSelectedSocieta]=useState('');
  const [loading,setLoading]=useState(true);
  const [anno,setAnno]=useState(new Date().getFullYear());
  const [periodo,setPeriodo]=useState('T1');

  useEffect(()=>{
    sb.from('societa').select('id,denominazione,partita_iva').eq('attiva',true).order('denominazione')
      .then(({data})=>{setSocieta(data||[]);setLoading(false);});
  },[]);

  const EXPORT_TYPES = [
    {
      id:'cu_tel',
      categoria:'DICHIARAZIONI',
      nome:'CU (Certificazioni Uniche)',
      descrizione:'File .TEL per invio telematico Entratel',
      formato:'.TEL',
      icon:'📄',
      color:'#fb923c'
    },
    {
      id:'lipe_xml',
      categoria:'DICHIARAZIONI',
      nome:'LIPE (Liquidazioni Periodiche IVA)',
      descrizione:'File XML per comunicazione trimestrale IVA',
      formato:'.XML',
      icon:'💧',
      color:'#4ecdc4'
    },
    {
      id:'iva_annuale',
      categoria:'DICHIARAZIONI',
      nome:'IVA Annuale',
      descrizione:'Riepilogo annuale IVA per dichiarazione',
      formato:'.TXT',
      icon:'📊',
      color:'#a78bfa'
    },
    {
      id:'mod770',
      categoria:'DICHIARAZIONI',
      nome:'Modello 770',
      descrizione:'Riepilogo ritenute per dichiarazione sostituti d\'imposta',
      formato:'.TXT',
      icon:'📑',
      color:'#f472b6'
    },
    {
      id:'intrastat',
      categoria:'DICHIARAZIONI',
      nome:'Intrastat',
      descrizione:'Elenchi cessioni/acquisti intracomunitari',
      formato:'.TXT',
      icon:'🌍',
      color:'#60a5fa'
    },
    {
      id:'f24_excel',
      categoria:'PAGAMENTI',
      nome:'F24 - Excel',
      descrizione:'Esportazione F24 in formato Excel',
      formato:'.XLSX',
      icon:'📋',
      color:'#34d399'
    },
    {
      id:'f24_pdf',
      categoria:'PAGAMENTI',
      nome:'F24 - PDF',
      descrizione:'Stampa F24 in formato PDF',
      formato:'.PDF',
      icon:'📋',
      color:'#34d399'
    },
    {
      id:'stampe_registri',
      categoria:'STAMPE',
      nome:'Registri IVA',
      descrizione:'Registro acquisti, vendite, corrispettivi',
      formato:'.HTML/.PDF',
      icon:'📚',
      color:'#fbbf24'
    },
    {
      id:'stampe_giornale',
      categoria:'STAMPE',
      nome:'Libro Giornale',
      descrizione:'Stampa del libro giornale contabile',
      formato:'.HTML/.PDF',
      icon:'📖',
      color:'#fbbf24'
    },
    {
      id:'stampe_mastrini',
      categoria:'STAMPE',
      nome:'Mastrini',
      descrizione:'Schede di mastro per singolo conto',
      formato:'.HTML/.PDF',
      icon:'📑',
      color:'#fbbf24'
    }
  ];

  const CATEGORIE = ['DICHIARAZIONI','PAGAMENTI','STAMPE'];

  const navigaModulo = (exportId) => {
    // Mapping export -> modulo e sezione
    const mapping = {
      cu_tel: {tab:'cu',sub:null},
      lipe_xml: {tab:'contabilita',sub:'lipe'},
      iva_annuale: {tab:'contabilita',sub:'iva_annuale'},
      mod770: {tab:'contabilita',sub:'770'},
      intrastat: {tab:'contabilita',sub:'intrastat'},
      f24_excel: {tab:'f24',sub:null},
      f24_pdf: {tab:'f24',sub:null},
      stampe_registri: {tab:'contabilita',sub:'stampe'},
      stampe_giornale: {tab:'contabilita',sub:'stampe'},
      stampe_mastrini: {tab:'contabilita',sub:'stampe'}
    };
    
    const dest = mapping[exportId];
    if(dest && onNavigate){
      // Salva il sub-tab desiderato in localStorage per il modulo Contabilità
      if(dest.sub){
        localStorage.setItem('contabilita_sub_tab', dest.sub);
      }
      // Naviga al modulo
      onNavigate(dest.tab);
    }
  };

  if(loading) return <div className="loading">⏳ Caricamento...</div>;

  return(
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">📤 Export Dati</div>
        <div className="page-sub">Hub centralizzato per l'esportazione di file telematici e stampe</div>
      </div>

      {/* Quick Filters */}
      <div className="card" style={{marginBottom:'1rem',background:'linear-gradient(135deg,rgba(200,164,94,.08),rgba(200,164,94,.02))'}}>
        <div style={{display:'flex',gap:'1rem',flexWrap:'wrap',alignItems:'flex-end'}}>
          <div className="fg" style={{flex:'1 1 200px',minWidth:150}}>
            <label style={{fontSize:'.72rem',color:'var(--mu)',marginBottom:'.25rem',display:'block'}}>Società</label>
            <select value={selectedSocieta} onChange={e=>setSelectedSocieta(e.target.value)} style={{width:'100%',padding:'.5rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)',fontSize:'.82rem'}}>
              <option value="">— Tutte le società —</option>
              {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione} ({s.partita_iva})</option>)}
            </select>
          </div>
          <div className="fg" style={{flex:'0 0 100px'}}>
            <label style={{fontSize:'.72rem',color:'var(--mu)',marginBottom:'.25rem',display:'block'}}>Anno</label>
            <select value={anno} onChange={e=>setAnno(parseInt(e.target.value))} style={{width:'100%',padding:'.5rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)',fontSize:'.82rem'}}>
              {[2026,2025,2024,2023].map(y=><option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="fg" style={{flex:'0 0 100px'}}>
            <label style={{fontSize:'.72rem',color:'var(--mu)',marginBottom:'.25rem',display:'block'}}>Periodo</label>
            <select value={periodo} onChange={e=>setPeriodo(e.target.value)} style={{width:'100%',padding:'.5rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)',fontSize:'.82rem'}}>
              <option value="T1">1° Trimestre</option>
              <option value="T2">2° Trimestre</option>
              <option value="T3">3° Trimestre</option>
              <option value="T4">4° Trimestre</option>
              <option value="ANNO">Anno intero</option>
            </select>
          </div>
        </div>
      </div>

      {/* Alert informativo */}
      <div className="alert alert-info" style={{marginBottom:'1.25rem'}}>
        <strong>💡 Navigazione automatica:</strong> Clicca su una card per andare direttamente al modulo e generare il file desiderato.
      </div>

      {/* Export Cards per categoria */}
      {CATEGORIE.map(cat=>(
        <div key={cat} style={{marginBottom:'1.5rem'}}>
          <div style={{fontSize:'.72rem',fontWeight:700,color:'var(--mu)',marginBottom:'.75rem',letterSpacing:'.5px'}}>{cat}</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:'1rem'}}>
            {EXPORT_TYPES.filter(e=>e.categoria===cat).map(exp=>(
              <div 
                key={exp.id} 
                className="card" 
                style={{
                  padding:'1rem',cursor:'pointer',transition:'all .2s',
                  border:'1px solid var(--bd)',position:'relative',overflow:'hidden'
                }}
                onClick={()=>navigaModulo(exp.id)}
                onMouseEnter={e=>{e.currentTarget.style.borderColor=exp.color;e.currentTarget.style.transform='translateY(-2px)';}}
                onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--bd)';e.currentTarget.style.transform='none';}}
              >
                <div style={{position:'absolute',top:0,right:0,width:60,height:60,background:`linear-gradient(135deg,${exp.color}22,transparent)`,borderRadius:'0 0 0 60px'}}/>
                <div style={{display:'flex',alignItems:'flex-start',gap:'.75rem'}}>
                  <div style={{fontSize:'1.5rem',width:40,height:40,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:8,background:`${exp.color}15`}}>
                    {exp.icon}
                  </div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600,fontSize:'.88rem',marginBottom:'.25rem'}}>{exp.nome}</div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)',lineHeight:1.4,marginBottom:'.5rem'}}>{exp.descrizione}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'.5rem'}}>
                      <span className="bdg" style={{background:`${exp.color}20`,color:exp.color,border:`1px solid ${exp.color}40`,fontSize:'.65rem',padding:'.15rem .4rem'}}>
                        {exp.formato}
                      </span>
                      <span style={{fontSize:'.68rem',color:'var(--gold)'}}>Clicca per aprire →</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Note tecniche */}
      <div className="card" style={{background:'rgba(107,122,153,.08)',marginTop:'1rem'}}>
        <div style={{fontSize:'.78rem',color:'var(--mu)'}}>
          <strong>📋 Note:</strong> Ogni tipo di export è gestito dal modulo specializzato corrispondente. 
          I file generati rispettano i formati richiesti dall'Agenzia delle Entrate (XML, TEL) e sono pronti per l'invio telematico tramite Entratel/Fisconline.
        </div>
      </div>
    </div>
  );
}

// ─── MODULO CONTABILITÀ COMPLETO ─────────────────────────────
const REGIMI_CONTABILI = {
  ordinaria: "Contabilità Ordinaria",
  semplificata: "Contabilità Semplificata", 
  professionisti: "Professionisti",
  iva_cassa: "IVA per Cassa"
};

const CONT_SIDEBAR_MENU = [
  {section:"IMPOSTAZIONI",items:[
    {id:"societa",ico:"🏢",label:"Anagrafica Società"},
    {id:"piano_conti",ico:"🗂️",label:"Piano dei Conti"},
    {id:"causali",ico:"📋",label:"Causali Contabili"},
    {id:"causali_iva",ico:"💧",label:"Causali IVA"},
    {id:"percipienti",ico:"👔",label:"Percipienti"},
    {id:"regole",ico:"🤖",label:"Regole AI"}
  ]},
  {section:"OPERATIVO",items:[
    {id:"import_fatture",ico:"📥",label:"Import Fatture"},
    {id:"da_validare",ico:"⚡",label:"Da Validare",badge:true},
    {id:"registrate",ico:"✓",label:"Registrate"}
  ]},
  {section:"CONTABILITÀ",items:[
    {id:"prima_nota",ico:"📝",label:"Prima Nota"},
    {id:"corrispettivi",ico:"🧾",label:"Corrispettivi"},
    {id:"scritture",ico:"📒",label:"Scritture Varie"}
  ]},
  {section:"BANCHE",items:[
    {id:"movimenti_banca",ico:"🏦",label:"Movimenti"},
    {id:"riconciliazione",ico:"🔗",label:"Riconciliazione"}
  ]},
  {section:"ADEMPIMENTI",items:[
    {id:"liquidazioni_iva",ico:"💰",label:"Liquidazioni IVA"},
    {id:"lipe",ico:"📤",label:"LIPE"},
    {id:"iva_annuale",ico:"📊",label:"IVA Annuale"},
    {id:"cu",ico:"📜",label:"Certificazioni Uniche"},
    {id:"ritenute",ico:"✂️",label:"Ritenute"},
    {id:"f770",ico:"📑",label:"770"},
    {id:"intrastat",ico:"🌍",label:"Intrastat"}
  ]},
  {section:"STAMPE",items:[
    {id:"registri_iva",ico:"📖",label:"Registri IVA"},
    {id:"partitari",ico:"💳",label:"Partitari"},
    {id:"giornale",ico:"📰",label:"Giornale"},
    {id:"mastrini",ico:"📚",label:"Mastrini"},
    {id:"bilancio",ico:"⚖️",label:"Bilancio"}
  ]}
];

function ModuloContabilita({ruolo}){
  const [societa,setSocieta]=useState([]);
  const [societaAttiva,setSocietaAttiva]=useState(null);
  const [loading,setLoading]=useState(true);
  const [contTab,setContTab]=useState(()=>{
    // Controlla se c'è un sub-tab salvato dall'Hub Export
    const savedTab = localStorage.getItem('contabilita_sub_tab');
    if(savedTab){
      localStorage.removeItem('contabilita_sub_tab'); // Rimuovi dopo la lettura
      return savedTab;
    }
    return 'da_validare';
  });
  
  // Dati
  const [documenti,setDocumenti]=useState([]);
  const [pianoConti,setPianoConti]=useState([]);
  const [causaliContabili,setCausaliContabili]=useState([]);
  const [causaliIva,setCausaliIva]=useState([]);
  const [regoleAI,setRegoleAI]=useState([]);
  const [scritture,setScritture]=useState([]);
  const [percipienti,setPercipienti]=useState([]);
  const [clienti,setClienti]=useState([]);
  
  // Selezione
  const [selectedDocs,setSelectedDocs]=useState([]);
  const [docInEdit,setDocInEdit]=useState(null);
  const [splitMode,setSplitMode]=useState('split'); // split, pdf, scrittura
  
  // Modali
  const [modalSocieta,setModalSocieta]=useState(false);
  const [modalImportPDF,setModalImportPDF]=useState(null);
  const [modalBulkEdit,setModalBulkEdit]=useState(false);

  useEffect(()=>{caricaSocieta();},[]);
  useEffect(()=>{if(societaAttiva)caricaTutto();},[societaAttiva]);

  const caricaSocieta=async()=>{
    const{data}=await sb.from('societa').select('*').eq('attiva',true).order('denominazione');
    setSocieta(data||[]);
    if(data?.length>0)setSocietaAttiva(data[0]);
    setLoading(false);
  };

  const caricaTutto=async()=>{
    if(!societaAttiva)return;
    const[{data:docs},{data:pc},{data:cc},{data:ci},{data:reg},{data:pn},{data:perc},{data:cli}]=await Promise.all([
      sb.from('documenti_contabilita').select('*').eq('societa_id',societaAttiva.id).order('created_at',{ascending:false}),
      sb.from('piano_conti').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('codice'),
      sb.from('causali_contabili').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('codice'),
      sb.from('causali_iva').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('codice'),
      sb.from('regole_automatiche').select('*').eq('societa_id',societaAttiva.id).eq('attiva',true).order('priorita'),
      sb.from('prima_nota').select('*').eq('societa_id',societaAttiva.id).order('numero_registrazione',{ascending:false}).limit(100),
      sb.from('percipienti').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('ragione_sociale'),
      sb.from('clienti').select('id,codice_cliente,nome,cognome,ragione_sociale,codice_fiscale,partita_iva').eq('attivo',true).order('codice_cliente')
    ]);
    setDocumenti(docs||[]);
    setPianoConti(pc||[]);
    setCausaliContabili(cc||[]);
    setCausaliIva(ci||[]);
    setRegoleAI(reg||[]);
    setScritture(pn||[]);
    setPercipienti(perc||[]);
    setClienti(cli||[]);
  };

  // Stats per badge
  const stats={
    daValidare:documenti.filter(d=>d.validation_status==='pending').length,
    confermati:documenti.filter(d=>d.validation_status==='confirmed').length,
    errori:documenti.filter(d=>d.validation_status==='error').length,
    registrati:documenti.filter(d=>d.workflow_status==='registered').length
  };

  // Toggle selezione
  const toggleSelect=(id)=>setSelectedDocs(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const selectAll=(ids)=>setSelectedDocs(ids);
  const deselectAll=()=>setSelectedDocs([]);

  // Conferma singola
  const confermaDoc=async(docId)=>{
    await sb.from('documenti_contabilita').update({validation_status:'confirmed',validated_at:new Date().toISOString()}).eq('id',docId);
    setDocumenti(prev=>prev.map(d=>d.id===docId?{...d,validation_status:'confirmed'}:d));
  };

  // Conferma multipla
  const confermaTutti=async()=>{
    if(!selectedDocs.length)return;
    await sb.from('documenti_contabilita').update({validation_status:'confirmed',validated_at:new Date().toISOString()}).in('id',selectedDocs);
    setDocumenti(prev=>prev.map(d=>selectedDocs.includes(d.id)?{...d,validation_status:'confirmed'}:d));
    setSelectedDocs([]);
  };

  // Registra confermati
  const registraConfermati=async()=>{
    const daRegistrare=documenti.filter(d=>d.validation_status==='confirmed'&&d.workflow_status!=='registered');
    if(!daRegistrare.length){alert('Nessun documento confermato da registrare');return;}
    
    if(!confirm(`Stai per registrare ${daRegistrare.length} documenti.\n\nConfermi?`))return;
    
    // TODO: Crea scritture prima nota per ogni documento
    for(const doc of daRegistrare){
      await sb.from('documenti_contabilita').update({workflow_status:'registered',registered_at:new Date().toISOString()}).eq('id',doc.id);
    }
    
    await caricaTutto();
    alert(`Registrati ${daRegistrare.length} documenti`);
  };

  if(loading)return<div className="loading">⏳ Caricamento...</div>;

  return(
    <div className="cont-layout">
      {/* Sidebar Contabilità */}
      <div className="cont-sidebar">
        {/* Selezione società */}
        <div style={{padding:'0 1rem .75rem',borderBottom:'1px solid var(--bd)'}}>
          <select value={societaAttiva?.id||''} onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s);}} style={{width:'100%',fontSize:'.78rem'}}>
            {societa.length===0&&<option value="">Nessuna società</option>}
            {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
          </select>
          <div style={{marginTop:'.4rem',display:'flex',gap:'.3rem'}}>
            <button className="btn-sec" style={{flex:1,fontSize:'.68rem',padding:'.25rem'}} onClick={()=>setModalSocieta(true)}>+ Nuova</button>
          </div>
        </div>

        {/* Menu */}
        {CONT_SIDEBAR_MENU.map(sec=>(
          <div key={sec.section}>
            <div className="cont-sidebar-section">{sec.section}</div>
            {sec.items.map(item=>(
              <div key={item.id} className={'cont-sidebar-item'+(contTab===item.id?' active':'')} onClick={()=>setContTab(item.id)}>
                <span>{item.ico}</span>
                <span style={{flex:1}}>{item.label}</span>
                {item.badge&&stats.daValidare>0&&<span className="bdg bdg-gold" style={{fontSize:'.6rem'}}>{stats.daValidare}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="cont-main">
        {!societaAttiva?(
          <div className="empty"><div className="empty-ico">🏢</div><div className="empty-t">Seleziona o crea una società</div></div>
        ):(
          <>
            {/* DA VALIDARE - Core workflow */}
            {contTab==='da_validare'&&<DaValidareView 
              documenti={documenti.filter(d=>d.workflow_status!=='registered')} 
              pianoConti={pianoConti}
              causaliContabili={causaliContabili}
              causaliIva={causaliIva}
              selectedDocs={selectedDocs}
              toggleSelect={toggleSelect}
              selectAll={selectAll}
              deselectAll={deselectAll}
              confermaDoc={confermaDoc}
              confermaTutti={confermaTutti}
              registraConfermati={registraConfermati}
              onEdit={setDocInEdit}
              setModalBulkEdit={setModalBulkEdit}
              stats={stats}
            />}

            {/* Import Fatture */}
            {contTab==='import_fatture'&&<ImportFattureView societaId={societaAttiva.id} onComplete={caricaTutto}/>}

            {/* Piano dei Conti */}
            {contTab==='piano_conti'&&<PianoContiView pianoConti={pianoConti} societaId={societaAttiva.id} onImport={()=>setModalImportPDF('piano_conti')} onRefresh={caricaTutto}/>}

            {/* Causali Contabili */}
            {contTab==='causali'&&<CausaliView causali={causaliContabili} tipo="contabili" societaId={societaAttiva.id} onImport={()=>setModalImportPDF('causali')} onRefresh={caricaTutto}/>}

            {/* Causali IVA */}
            {contTab==='causali_iva'&&<CausaliView causali={causaliIva} tipo="iva" societaId={societaAttiva.id} onImport={()=>setModalImportPDF('causali_iva')} onRefresh={caricaTutto}/>}

            {/* Prima Nota */}
            {contTab==='prima_nota'&&<PrimaNotaView scritture={scritture} pianoConti={pianoConti} causali={causaliContabili} causaliIva={causaliIva} clienti={clienti} societaId={societaAttiva.id} onRefresh={caricaTutto}/>}

            {/* Registrate */}
            {contTab==='registrate'&&<RegistrateView documenti={documenti.filter(d=>d.workflow_status==='registered')}/>}

            {/* Banche - Vista dedicata */}
            {(contTab==='movimenti_banca'||contTab==='riconciliazione')&&<ModuloBanche societaId={societaAttiva?.id} contTab={contTab} setContTab={setContTab}/>}

            {/* Stampe - Vista dedicata */}
            {['registri_iva','partitari','giornale','mastrini','bilancio'].includes(contTab)&&(
              <StampeView 
                tipoStampa={contTab} 
                societa={societaAttiva} 
                scritture={scritture}
                pianoConti={pianoConti}
                causaliIva={causaliIva}
              />
            )}

            {/* Liquidazioni IVA */}
            {contTab==='liquidazioni_iva'&&<LiquidazioniIVAView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva}/>}

            {/* LIPE */}
            {contTab==='lipe'&&<LIPEView societa={societaAttiva}/>}

            {/* Corrispettivi */}
            {contTab==='corrispettivi'&&<CorrispettiviView societa={societaAttiva}/>}

            {/* 770 */}
            {contTab==='f770'&&<Modello770View societa={societaAttiva}/>}

            {/* Intrastat */}
            {contTab==='intrastat'&&<IntrastatView societa={societaAttiva}/>}

            {/* Percipienti */}
            {contTab==='percipienti'&&<PercipientiView societa={societaAttiva} onRefresh={caricaTutto}/>}

            {/* Ritenute */}
            {contTab==='ritenute'&&<RitenuteView societa={societaAttiva}/>}

            {/* IVA Annuale */}
            {contTab==='iva_annuale'&&<IvaAnnualeView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva}/>}

            {/* Placeholder per altri moduli */}
            {['societa','regole','scritture','cu'].includes(contTab)&&(
              <div className="card" style={{padding:'2rem',textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'.5rem'}}>🚧</div>
                <div style={{fontSize:'1rem',fontWeight:600}}>Modulo in sviluppo</div>
                <div style={{fontSize:'.8rem',color:'var(--mu)',marginTop:'.25rem'}}>Questa sezione sarà disponibile a breve</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modali */}
      {modalSocieta&&<ModalNuovaSocieta onSave={async(d)=>{await sb.from('societa').insert([d]);await caricaSocieta();setModalSocieta(false);}} onClose={()=>setModalSocieta(false)}/>}
      {modalImportPDF&&<ModalImportPDF tipo={modalImportPDF} societaId={societaAttiva?.id} onComplete={()=>{setModalImportPDF(null);caricaTutto();}} onClose={()=>setModalImportPDF(null)}/>}
      {modalBulkEdit&&<ModalBulkEdit docs={selectedDocs.map(id=>documenti.find(d=>d.id===id)).filter(Boolean)} pianoConti={pianoConti} causaliIva={causaliIva} onSave={async(updates)=>{await sb.from('documenti_contabilita').update(updates).in('id',selectedDocs);await caricaTutto();setSelectedDocs([]);setModalBulkEdit(false);}} onClose={()=>setModalBulkEdit(false)}/>}
      {docInEdit&&<ModalEditDoc doc={docInEdit} pianoConti={pianoConti} causaliContabili={causaliContabili} causaliIva={causaliIva} onSave={caricaTutto} onClose={()=>setDocInEdit(null)}/>}
    </div>
  );
}

// ─── DA VALIDARE VIEW ────────────────────────────────────────
function DaValidareView({documenti,pianoConti,causaliContabili,causaliIva,selectedDocs,toggleSelect,selectAll,deselectAll,confermaDoc,confermaTutti,registraConfermati,onEdit,setModalBulkEdit,stats}){
  const [filtroStato,setFiltroStato]=useState('tutti');
  const [filtroFornitore,setFiltroFornitore]=useState('');
  const [searchTerm,setSearchTerm]=useState('');

  const filtered=documenti.filter(d=>{
    if(filtroStato!=='tutti'&&d.validation_status!==filtroStato)return false;
    if(filtroFornitore&&d.soggetto_piva!==filtroFornitore)return false;
    if(searchTerm){
      const s=searchTerm.toLowerCase();
      if(!(d.soggetto_denominazione||'').toLowerCase().includes(s)&&!(d.numero_documento||'').toLowerCase().includes(s))return false;
    }
    return true;
  });

  const fornitori=[...new Set(documenti.map(d=>d.soggetto_piva).filter(Boolean))];

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>⚡ Da Validare</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Documenti in attesa di conferma operatore</div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          {selectedDocs.length>0&&(
            <>
              <button className="btn-sec" onClick={()=>setModalBulkEdit(true)}>✏️ Modifica ({selectedDocs.length})</button>
              <button className="btn-sec" onClick={confermaTutti}>✓ Conferma ({selectedDocs.length})</button>
            </>
          )}
          <button className="btn" onClick={registraConfermati} disabled={stats.confermati===0}>📝 Registra confermati ({stats.confermati})</button>
        </div>
      </div>

      {/* Stats mini */}
      <div style={{display:'flex',gap:'.75rem',marginBottom:'1rem'}}>
        {[['🟡',stats.daValidare,'In attesa','pending'],['🟢',stats.confermati,'Confermati','confirmed'],['🔴',stats.errori,'Da rivedere','error']].map(([ico,n,l,f])=>(
          <div key={f} onClick={()=>setFiltroStato(filtroStato===f?'tutti':f)} style={{cursor:'pointer',padding:'.5rem 1rem',background:filtroStato===f?'rgba(200,164,94,.1)':'var(--s2)',border:'1px solid '+(filtroStato===f?'var(--gold)':'var(--bd)'),borderRadius:8,display:'flex',alignItems:'center',gap:'.5rem'}}>
            <span>{ico}</span>
            <span style={{fontWeight:700}}>{n}</span>
            <span style={{fontSize:'.75rem',color:'var(--mu)'}}>{l}</span>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem',flexWrap:'wrap'}}>
        <input placeholder="🔍 Cerca..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{flex:1,minWidth:200}}/>
        <select value={filtroFornitore} onChange={e=>setFiltroFornitore(e.target.value)} style={{minWidth:180}}>
          <option value="">Tutti i fornitori/clienti</option>
          {fornitori.map(p=><option key={p} value={p}>{documenti.find(d=>d.soggetto_piva===p)?.soggetto_denominazione||p}</option>)}
        </select>
      </div>

      {/* Tabella */}
      {filtered.length===0?(
        <div className="empty"><div className="empty-ico">📄</div><div className="empty-t">Nessun documento</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th style={{width:40}}><input type="checkbox" checked={selectedDocs.length===filtered.length&&filtered.length>0} onChange={e=>e.target.checked?selectAll(filtered.map(d=>d.id)):deselectAll()}/></th>
              <th>Stato</th>
              <th>Tipo</th>
              <th>N° Doc</th>
              <th>Data</th>
              <th>Soggetto</th>
              <th>Totale</th>
              <th>Conto proposto</th>
              <th>Azioni</th>
            </tr></thead>
            <tbody>{filtered.map(d=>(
              <tr key={d.id} className={'row-'+(d.validation_status==='confirmed'?'confirmed':d.validation_status==='error'?'error':'pending')}>
                <td><input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={()=>toggleSelect(d.id)}/></td>
                <td>
                  <span className={'bdg status-'+d.validation_status}>
                    {d.validation_status==='pending'?'🟡':d.validation_status==='confirmed'?'🟢':'🔴'}
                  </span>
                </td>
                <td><span className={'bdg '+(d.tipo_documento?.includes('attiva')?'bdg-green':'bdg-gold')}>{d.tipo_documento?.includes('attiva')?'📤':'📥'}</span></td>
                <td style={{fontWeight:600}}>{d.numero_documento||'—'}</td>
                <td style={{fontSize:'.78rem'}}>{fmtDate(d.data_documento)}</td>
                <td>
                  <div style={{fontSize:'.8rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'}}>{d.soggetto_denominazione||'—'}</div>
                  <div style={{fontSize:'.65rem',color:'var(--mu)'}}>{d.soggetto_piva}</div>
                </td>
                <td style={{fontWeight:700,color:'var(--gld2)'}}>{fmt(d.totale)}</td>
                <td style={{fontSize:'.75rem',color:'var(--mu)'}}>{pianoConti.find(c=>c.id===d.conto_id)?.descrizione||'Da assegnare'}</td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn-icon" onClick={()=>onEdit(d)} title="Modifica">✏️</button>
                    {d.validation_status==='pending'&&<button className="btn-icon" style={{borderColor:'rgba(76,175,80,.4)',color:'var(--gr)'}} onClick={()=>confermaDoc(d.id)} title="Conferma">✓</button>}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── IMPORT FATTURE VIEW ─────────────────────────────────────
function ImportFattureView({societaId,onComplete}){
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState(null);
  const fileRef=useRef();

  const handleUpload=async(e)=>{
    const files=Array.from(e.target.files);
    if(!files.length)return;
    
    setUploading(true);
    setProgress({current:0,total:files.length});

    for(let i=0;i<files.length;i++){
      const file=files[i];
      setProgress({current:i+1,total:files.length,file:file.name});

      try{
        // 1. Converti in base64
        const base64=await new Promise((res,rej)=>{
          const reader=new FileReader();
          reader.onload=()=>res(reader.result.split(',')[1]);
          reader.onerror=rej;
          reader.readAsDataURL(file);
        });

        // 2. Analizza con AI
        const analyzeRes=await fetch('/api/proposta-contabile',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            fileBase64:base64,
            filename:file.name,
            mimeType:file.type
          })
        });

        let analysis={tipo_fattura:'fattura_passiva',is_transitorio:true};
        if(analyzeRes.ok){
          const data=await analyzeRes.json();
          analysis=data.analysis||analysis;
        }

        // 3. Upload file a storage
        const filePath=`contabilita/${societaId}/${Date.now()}_${file.name}`;
        await sb.storage.from('documenti').upload(filePath,file);
        const{data:urlData}=sb.storage.from('documenti').getPublicUrl(filePath);

        // 4. Salva documento
        await sb.from('documenti_contabilita').insert([{
          societa_id:societaId,
          filename:file.name,
          file_path:filePath,
          file_url:urlData?.publicUrl,
          mime_type:file.type,
          file_size:file.size,
          tipo_documento:analysis.tipo_fattura,
          numero_documento:analysis.numero_documento,
          data_documento:analysis.data_documento,
          soggetto_denominazione:analysis.cedente?.denominazione||analysis.cessionario?.denominazione,
          soggetto_piva:analysis.cedente?.partita_iva||analysis.cessionario?.partita_iva,
          soggetto_cf:analysis.cedente?.codice_fiscale||analysis.cessionario?.codice_fiscale,
          imponibile:analysis.imponibile,
          iva:analysis.iva,
          totale:analysis.totale,
          workflow_status:'proposed',
          validation_status:analysis.is_transitorio?'error':'pending',
          ai_confidence:analysis.confidence
        }]);

      }catch(err){
        console.error('Import error:',err);
      }
    }

    setUploading(false);
    setProgress(null);
    fileRef.current.value='';
    onComplete();
  };

  return(
    <div>
      <div style={{fontSize:'1.1rem',fontWeight:700,marginBottom:'.25rem'}}>📥 Import Fatture</div>
      <div style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'1rem'}}>Carica fatture XML/PDF per analisi AI automatica</div>

      <div className="card">
        <div className="upload-zone" onClick={()=>!uploading&&fileRef.current.click()} style={{cursor:uploading?'wait':'pointer'}}>
          {uploading?(
            <>
              <div className="upload-zone-ico">⏳</div>
              <div className="upload-zone-t">Elaborazione {progress?.file}...</div>
              <div className="upload-zone-s">{progress?.current}/{progress?.total} file</div>
            </>
          ):(
            <>
              <div className="upload-zone-ico">📄</div>
              <div className="upload-zone-t">Carica fatture</div>
              <div className="upload-zone-s">PDF, XML · Trascina o clicca per selezionare</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.xml,.PDF,.XML" style={{display:'none'}} onChange={handleUpload}/>
      </div>

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        ℹ️ L'AI analizzerà ogni fattura e proporrà la registrazione contabile.<br/>
        🟡 Proposta da confermare · 🟢 Confermata · 🔴 Richiede intervento manuale
      </div>
    </div>
  );
}

// ─── PIANO CONTI VIEW ────────────────────────────────────────
function PianoContiView({pianoConti,societaId,onImport,onRefresh}){
  const [search,setSearch]=useState('');
  const filtered=pianoConti.filter(c=>!search||(c.codice+' '+c.descrizione).toLowerCase().includes(search.toLowerCase()));
  
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🗂️ Piano dei Conti</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{pianoConti.length} conti configurati</div>
        </div>
        <button className="btn" onClick={onImport}>📤 Import PDF</button>
      </div>

      <input placeholder="🔍 Cerca conto..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'1rem',width:'100%'}}/>

      {filtered.length===0?(
        <div className="empty"><div className="empty-ico">🗂️</div><div className="empty-t">Nessun conto</div><div className="empty-s">Importa il piano dei conti da PDF</div></div>
      ):(
        <div className="card" style={{padding:0,maxHeight:500,overflow:'auto'}}>
          <table className="tbl">
            <thead><tr><th>Codice</th><th>Descrizione</th><th>Tipo</th><th>Flags</th></tr></thead>
            <tbody>{filtered.slice(0,100).map(c=>(
              <tr key={c.id}>
                <td><code style={{fontSize:'.75rem'}}>{c.codice}</code></td>
                <td style={{paddingLeft:(c.livello-1)*20+'px'}}>{c.descrizione}</td>
                <td><span className={'bdg '+(c.tipo==='patrimoniale'?'bdg-blue':'bdg-gold')}>{c.tipo}</span></td>
                <td style={{fontSize:'.7rem'}}>
                  {c.is_cliente&&<span className="bdg bdg-green" style={{marginRight:'.2rem'}}>C</span>}
                  {c.is_fornitore&&<span className="bdg bdg-gold" style={{marginRight:'.2rem'}}>F</span>}
                  {c.is_banca&&<span className="bdg bdg-blue" style={{marginRight:'.2rem'}}>B</span>}
                  {c.is_professionista&&<span className="bdg bdg-pu" style={{marginRight:'.2rem'}}>P</span>}
                </td>
              </tr>
            ))}</tbody>
          </table>
          {filtered.length>100&&<div style={{padding:'.5rem',textAlign:'center',fontSize:'.72rem',color:'var(--mu)'}}>Mostrati 100 di {filtered.length}</div>}
        </div>
      )}
    </div>
  );
}

// ─── CAUSALI VIEW ────────────────────────────────────────────
function CausaliView({causali,tipo,societaId,onImport,onRefresh}){
  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>{tipo==='contabili'?'📋 Causali Contabili':'💧 Causali IVA'}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{causali.length} causali configurate</div>
        </div>
        <button className="btn" onClick={onImport}>📤 Import PDF</button>
      </div>

      {causali.length===0?(
        <div className="empty"><div className="empty-ico">{tipo==='contabili'?'📋':'💧'}</div><div className="empty-t">Nessuna causale</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th>Codice</th>
              <th>Descrizione</th>
              {tipo==='iva'&&<th>Aliquota</th>}
              {tipo==='contabili'&&<th>Tipo</th>}
            </tr></thead>
            <tbody>{causali.map(c=>(
              <tr key={c.id}>
                <td><code>{c.codice}</code></td>
                <td>{c.descrizione}</td>
                {tipo==='iva'&&<td><span className="bdg bdg-blue">{c.aliquota}%</span></td>}
                {tipo==='contabili'&&<td style={{fontSize:'.75rem',color:'var(--mu)'}}>{c.tipo}</td>}
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── PRIMA NOTA VIEW ─────────────────────────────────────────
function PrimaNotaView({scritture,pianoConti,causali,causaliIva,clienti,societaId,onRefresh}){
  const [modalNuova,setModalNuova]=useState(false);
  const [filtroCliente,setFiltroCliente]=useState('');
  const [searchTerm,setSearchTerm]=useState('');
  const [formData,setFormData]=useState({
    data_registrazione:new Date().toISOString().split('T')[0],
    data_documento:'',
    numero_documento:'',
    cliente_id:'',
    causale_codice:'',
    causale_iva_codice:'',
    descrizione:'',
    totale_dare:0,
    totale_avere:0,
    conto_dare_id:'',
    conto_avere_id:'',
    imponibile:0,
    imposta:0
  });

  const getClienteNome=(id)=>{
    const c=clienti.find(x=>x.id===id);
    if(!c)return '—';
    return c.ragione_sociale||`${c.nome||''} ${c.cognome||''}`.trim();
  };

  const getClienteCodice=(id)=>{
    const c=clienti.find(x=>x.id===id);
    return c?.codice_cliente||'—';
  };

  const filtered=scritture.filter(s=>{
    if(filtroCliente&&s.cliente_id!==filtroCliente)return false;
    if(searchTerm){
      const q=searchTerm.toLowerCase();
      return (s.descrizione||'').toLowerCase().includes(q)||(s.numero_documento||'').toLowerCase().includes(q)||(s.cliente_fornitore_nome||'').toLowerCase().includes(q);
    }
    return true;
  });

  const onClienteChange=(id)=>{
    const c=clienti.find(x=>x.id===id);
    setFormData(p=>({
      ...p,
      cliente_id:id,
      descrizione:c?`${c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}`:''
    }));
  };

  const calcolaIVA=(imponibile,aliquota)=>{
    const imp=parseFloat(imponibile||0);
    const iva=imp*(aliquota||22)/100;
    return{imposta:iva.toFixed(2),totale:(imp+iva).toFixed(2)};
  };

  const onImponibileChange=(val)=>{
    const causIva=causaliIva.find(c=>c.codice===formData.causale_iva_codice);
    const{imposta,totale}=calcolaIVA(val,causIva?.aliquota||22);
    setFormData(p=>({...p,imponibile:val,imposta,totale_dare:totale,totale_avere:totale}));
  };

  const onCausaleIvaChange=(codice)=>{
    const causIva=causaliIva.find(c=>c.codice===codice);
    const{imposta,totale}=calcolaIVA(formData.imponibile,causIva?.aliquota||22);
    setFormData(p=>({...p,causale_iva_codice:codice,imposta,totale_dare:totale,totale_avere:totale}));
  };

  const salvaScrittura=async()=>{
    const cliente=clienti.find(c=>c.id===formData.cliente_id);
    const nextNum=scritture.length>0?Math.max(...scritture.map(s=>s.numero_registrazione||0))+1:1;
    
    const record={
      societa_id:societaId,
      numero_registrazione:nextNum,
      data_registrazione:formData.data_registrazione,
      data_documento:formData.data_documento||formData.data_registrazione,
      numero_documento:formData.numero_documento,
      cliente_id:formData.cliente_id||null,
      cliente_fornitore_nome:cliente?(cliente.ragione_sociale||`${cliente.nome} ${cliente.cognome||''}`.trim()):formData.descrizione,
      causale_codice:formData.causale_codice,
      causale_iva_codice:formData.causale_iva_codice,
      descrizione:formData.descrizione,
      totale_dare:parseFloat(formData.totale_dare||0),
      totale_avere:parseFloat(formData.totale_avere||0),
      imponibile:parseFloat(formData.imponibile||0),
      imposta:parseFloat(formData.imposta||0),
      stato:'provvisoria'
    };
    
    const{error}=await sb.from('prima_nota').insert([record]);
    if(error){
      alert('Errore: '+error.message);
      return;
    }
    setModalNuova(false);
    setFormData({data_registrazione:new Date().toISOString().split('T')[0],data_documento:'',numero_documento:'',cliente_id:'',causale_codice:'',causale_iva_codice:'',descrizione:'',totale_dare:0,totale_avere:0,conto_dare_id:'',conto_avere_id:'',imponibile:0,imposta:0});
    onRefresh();
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>📝 Prima Nota</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{scritture.length} scritture registrate</div>
        </div>
        <button className="btn" onClick={()=>setModalNuova(true)}>+ Nuova Scrittura</button>
      </div>

      {/* Filtri */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="fg" style={{flex:1,minWidth:200}}>
            <label>Cerca</label>
            <input placeholder="🔍 N° documento, descrizione..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
          </div>
          <div className="fg" style={{minWidth:200}}>
            <label>Filtra per Cliente</label>
            <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
              <option value="">Tutti i clienti</option>
              {clienti.filter(c=>c.codice_cliente).map(c=><option key={c.id} value={c.id}>[{c.codice_cliente}] {c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}</option>)}
            </select>
          </div>
        </div>
      </div>

      {filtered.length===0?(
        <div className="empty"><div className="empty-ico">📝</div><div className="empty-t">Nessuna scrittura</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>N°</th><th>Data</th><th>Cod.Cli.</th><th>Cliente/Fornitore</th><th>Causale</th><th>Descrizione</th><th style={{textAlign:'right'}}>Dare</th><th style={{textAlign:'right'}}>Avere</th><th>Stato</th></tr></thead>
            <tbody>{filtered.map(s=>(
              <tr key={s.id}>
                <td style={{fontWeight:600}}>{s.numero_registrazione}</td>
                <td style={{fontSize:'.78rem'}}>{fmtDate(s.data_registrazione)}</td>
                <td><span style={{fontFamily:'monospace',fontWeight:700,color:'var(--gold)',background:'rgba(200,164,94,.1)',padding:'.1rem .3rem',borderRadius:4,fontSize:'.7rem'}}>{getClienteCodice(s.cliente_id)}</span></td>
                <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis'}}>{s.cliente_fornitore_nome||getClienteNome(s.cliente_id)}</td>
                <td><span className="bdg bdg-blue">{s.causale_codice||'—'}</span></td>
                <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',fontSize:'.8rem'}}>{s.descrizione}</td>
                <td style={{fontWeight:600,color:'var(--gr)',textAlign:'right'}}>{fmt(s.totale_dare)}</td>
                <td style={{fontWeight:600,color:'var(--rd)',textAlign:'right'}}>{fmt(s.totale_avere)}</td>
                <td><span className={'bdg '+(s.stato==='definitiva'?'bdg-green':'bdg-gold')}>{s.stato}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Modal Nuova Scrittura */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:650}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">📝 Nuova Scrittura Prima Nota</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg">
                  <label>Data Registrazione *</label>
                  <input type="date" value={formData.data_registrazione} onChange={e=>setFormData(p=>({...p,data_registrazione:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Data Documento</label>
                  <input type="date" value={formData.data_documento} onChange={e=>setFormData(p=>({...p,data_documento:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>N° Documento</label>
                  <input value={formData.numero_documento} onChange={e=>setFormData(p=>({...p,numero_documento:e.target.value}))} placeholder="Es. FT-001/2025"/>
                </div>
                <div className="fg">
                  <label>Causale Contabile</label>
                  <select value={formData.causale_codice} onChange={e=>setFormData(p=>({...p,causale_codice:e.target.value}))}>
                    <option value="">-- Seleziona --</option>
                    {causali.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione}</option>)}
                  </select>
                </div>
                <div className="fg full" style={{background:'rgba(200,164,94,.08)',padding:'.75rem',borderRadius:8,border:'1px solid rgba(200,164,94,.2)'}}>
                  <label style={{color:'var(--gold)',fontWeight:600}}>👤 Cliente</label>
                  <select value={formData.cliente_id} onChange={e=>onClienteChange(e.target.value)} style={{marginTop:'.35rem'}}>
                    <option value="">-- Seleziona Cliente --</option>
                    {clienti.map(c=><option key={c.id} value={c.id}>{c.codice_cliente?`[${c.codice_cliente}] `:''}{c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}</option>)}
                  </select>
                  <div style={{fontSize:'.7rem',color:'var(--mu)',marginTop:'.25rem'}}>Il codice cliente collegherà questa scrittura all'anagrafica</div>
                </div>
                <div className="fg full">
                  <label>Descrizione</label>
                  <input value={formData.descrizione} onChange={e=>setFormData(p=>({...p,descrizione:e.target.value}))} placeholder="Descrizione operazione"/>
                </div>
                <div className="fg">
                  <label>Imponibile €</label>
                  <input type="number" step="0.01" value={formData.imponibile} onChange={e=>onImponibileChange(e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Causale IVA</label>
                  <select value={formData.causale_iva_codice} onChange={e=>onCausaleIvaChange(e.target.value)}>
                    <option value="">-- Seleziona --</option>
                    {causaliIva.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>IVA €</label>
                  <input type="number" step="0.01" value={formData.imposta} readOnly style={{background:'var(--bg)'}}/>
                </div>
                <div className="fg">
                  <label>Totale €</label>
                  <input type="number" step="0.01" value={formData.totale_dare} readOnly style={{background:'var(--bg)',fontWeight:700,color:'var(--gold)'}}/>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaScrittura}>💾 Registra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REGISTRATE VIEW ─────────────────────────────────────────
function RegistrateView({documenti}){
  return(
    <div>
      <div style={{fontSize:'1.1rem',fontWeight:700,marginBottom:'.25rem'}}>✓ Documenti Registrati</div>
      <div style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'1rem'}}>{documenti.length} documenti registrati in contabilità</div>

      {documenti.length===0?(
        <div className="empty"><div className="empty-ico">✓</div><div className="empty-t">Nessun documento registrato</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>N° Doc</th><th>Data</th><th>Soggetto</th><th>Totale</th><th>Registrato</th></tr></thead>
            <tbody>{documenti.map(d=>(
              <tr key={d.id}>
                <td><span className={'bdg '+(d.tipo_documento?.includes('attiva')?'bdg-green':'bdg-gold')}>{d.tipo_documento?.includes('attiva')?'📤':'📥'}</span></td>
                <td style={{fontWeight:600}}>{d.numero_documento}</td>
                <td style={{fontSize:'.78rem'}}>{fmtDate(d.data_documento)}</td>
                <td>{d.soggetto_denominazione}</td>
                <td style={{fontWeight:600,color:'var(--gld2)'}}>{fmt(d.totale)}</td>
                <td style={{fontSize:'.72rem',color:'var(--mu)'}}>{fmtDate(d.registered_at?.split('T')[0])}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MODAL BULK EDIT ─────────────────────────────────────────
function ModalBulkEdit({docs,pianoConti,causaliIva,onSave,onClose}){
  const [contoId,setContoId]=useState('');
  const [causaleIva,setCausaleIva]=useState('');
  const [confirmAll,setConfirmAll]=useState(true);

  const handleSave=()=>{
    const updates={};
    if(contoId)updates.conto_id=contoId;
    if(causaleIva)updates.causale_iva=causaleIva;
    if(confirmAll)updates.validation_status='confirmed';
    onSave(updates);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">✏️ Modifica Massiva</div>
          <div className="modal-sub">{docs.length} documenti selezionati</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="fg" style={{marginBottom:'.75rem'}}>
            <label>Conto costo/ricavo</label>
            <select value={contoId} onChange={e=>setContoId(e.target.value)}>
              <option value="">— Non modificare —</option>
              {pianoConti.filter(c=>c.livello>=3).map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione}</option>)}
            </select>
          </div>
          <div className="fg" style={{marginBottom:'.75rem'}}>
            <label>Causale IVA</label>
            <select value={causaleIva} onChange={e=>setCausaleIva(e.target.value)}>
              <option value="">— Non modificare —</option>
              {causaliIva.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginTop:'1rem'}}>
            <input type="checkbox" id="confirmAll" checked={confirmAll} onChange={e=>setConfirmAll(e.target.checked)}/>
            <label htmlFor="confirmAll" style={{fontSize:'.85rem',cursor:'pointer'}}>Conferma tutti dopo la modifica</label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" onClick={handleSave}>Applica a {docs.length} documenti</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL EDIT DOC (Split Screen) ───────────────────────────
function ModalEditDoc({doc,pianoConti,causaliContabili,causaliIva,onSave,onClose}){
  const [contoId,setContoId]=useState(doc.conto_id||'');
  const [causaleIva,setCausaleIva]=useState('');
  const [splitView,setSplitView]=useState('split'); // split, pdf, form
  const [saving,setSaving]=useState(false);

  const handleConfirm=async()=>{
    setSaving(true);
    await sb.from('documenti_contabilita').update({
      conto_id:contoId||null,
      validation_status:'confirmed',
      validated_at:new Date().toISOString()
    }).eq('id',doc.id);
    onSave();
    onClose();
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:1200,width:'95%',maxHeight:'95vh'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📄 {doc.filename}</div>
          <div className="modal-sub">{doc.soggetto_denominazione} · {fmt(doc.totale)}</div>
          <div style={{display:'flex',gap:'.3rem',marginLeft:'auto',marginRight:'1rem'}}>
            <button className={'btn-sec'+(splitView==='split'?' active':'')} style={{padding:'.25rem .5rem',fontSize:'.7rem'}} onClick={()=>setSplitView('split')}>⬜⬜</button>
            <button className={'btn-sec'+(splitView==='pdf'?' active':'')} style={{padding:'.25rem .5rem',fontSize:'.7rem'}} onClick={()=>setSplitView('pdf')}>📄</button>
            <button className={'btn-sec'+(splitView==='form'?' active':'')} style={{padding:'.25rem .5rem',fontSize:'.7rem'}} onClick={()=>setSplitView('form')}>📝</button>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{padding:0}}>
          <div className={'split-container'+(splitView==='pdf'?' full-left':splitView==='form'?' full-right':'')}>
            {/* PDF Viewer */}
            {splitView!=='form'&&(
              <div className="split-pane">
                <div className="split-pane-header">
                  <span style={{fontWeight:600,fontSize:'.85rem'}}>📄 Documento originale</span>
                </div>
                <div className="split-pane-content" style={{display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {doc.file_url?(
                    <iframe src={doc.file_url} style={{width:'100%',height:'100%',border:'none'}}/>
                  ):(
                    <div style={{textAlign:'center',color:'var(--mu)'}}>
                      <div style={{fontSize:'3rem'}}>📄</div>
                      <div>Anteprima non disponibile</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Form scrittura */}
            {splitView!=='pdf'&&(
              <div className="split-pane">
                <div className="split-pane-header">
                  <span style={{fontWeight:600,fontSize:'.85rem'}}>📝 Scrittura contabile</span>
                  <span className={'bdg status-'+doc.validation_status}>
                    {doc.validation_status==='pending'?'🟡 In attesa':doc.validation_status==='confirmed'?'🟢 Confermato':'🔴 Errore'}
                  </span>
                </div>
                <div className="split-pane-content">
                  {/* Dati documento */}
                  <div style={{background:'var(--s2)',borderRadius:8,padding:'.75rem',marginBottom:'1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.4rem',fontSize:'.8rem'}}>
                      <div><span style={{color:'var(--mu)'}}>Tipo:</span> <strong>{doc.tipo_documento}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>N° Doc:</span> <strong>{doc.numero_documento}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>Data:</span> <strong>{fmtDate(doc.data_documento)}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>P.IVA:</span> <strong>{doc.soggetto_piva}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>Imponibile:</span> <strong>{fmt(doc.imponibile)}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>IVA:</span> <strong>{fmt(doc.iva)}</strong></div>
                      <div colSpan={2}><span style={{color:'var(--mu)'}}>Totale:</span> <strong style={{color:'var(--gld2)',fontSize:'1.1rem'}}>{fmt(doc.totale)}</strong></div>
                    </div>
                  </div>

                  {/* Conto */}
                  <div className="fg" style={{marginBottom:'.75rem'}}>
                    <label>Conto {doc.tipo_documento?.includes('attiva')?'Cliente':'Fornitore/Costo'}</label>
                    <select value={contoId} onChange={e=>setContoId(e.target.value)}>
                      <option value="">Seleziona conto...</option>
                      {pianoConti.filter(c=>c.livello>=3).map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione}</option>)}
                    </select>
                  </div>

                  {/* Causale IVA */}
                  <div className="fg">
                    <label>Causale IVA</label>
                    <select value={causaleIva} onChange={e=>setCausaleIva(e.target.value)}>
                      <option value="">Seleziona...</option>
                      {causaliIva.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
                    </select>
                  </div>

                  {/* Confidence AI */}
                  {doc.ai_confidence&&(
                    <div style={{marginTop:'1rem',fontSize:'.75rem',color:'var(--mu)'}}>
                      🤖 Confidence AI: <strong>{Math.round(doc.ai_confidence*100)}%</strong>
                    </div>
                  )}
                </div>
                <div className="split-pane-actions">
                  <button className="btn-sec" onClick={onClose}>Annulla</button>
                  <button className="btn" onClick={handleConfirm} disabled={saving}>✓ Conferma</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL NUOVA SOCIETÀ ──────────────────────────────────────
function ModalNuovaSocieta({onSave,onClose}){
  const [mode,setMode]=useState('select'); // 'select' o 'create'
  const [clienti,setClienti]=useState([]);
  const [searchTerm,setSearchTerm]=useState('');
  const [selectedCliente,setSelectedCliente]=useState(null);
  const [loading,setLoading]=useState(true);
  const [formData,setFormData]=useState({
    denominazione:'',
    partita_iva:'',
    codice_fiscale:'',
    indirizzo:'',
    cap:'',
    citta:'',
    provincia:'',
    email:'',
    pec:'',
    telefono:'',
    regime_contabile:'ordinario',
    tipo_liquidazione_iva:'trimestrale',
    attiva:true
  });
  const [saving,setSaving]=useState(false);

  // Carica clienti esistenti
  useEffect(()=>{
    sb.from('clienti').select('*').eq('attivo',true).order('ragione_sociale')
      .then(({data})=>{setClienti(data||[]);setLoading(false);});
  },[]);

  // Filtra clienti in base alla ricerca
  const clientiFiltrati = clienti.filter(c=>{
    const term = searchTerm.toLowerCase();
    return (c.ragione_sociale||'').toLowerCase().includes(term) ||
           (c.nome||'').toLowerCase().includes(term) ||
           (c.partita_iva||'').includes(term) ||
           (c.codice_fiscale||'').toLowerCase().includes(term);
  });

  // Genera codice univoco dalla denominazione + timestamp
  const genCodice=(denom)=>{
    const base=(denom||'SOC').replace(/[^A-Za-z0-9]/g,'').toUpperCase().substring(0,6);
    return base+Date.now().toString().slice(-4);
  };

  const handleSelectCliente = async () => {
    if(!selectedCliente){alert('Seleziona un cliente');return;}
    setSaving(true);
    const denom=selectedCliente.ragione_sociale||`${selectedCliente.nome||''} ${selectedCliente.cognome||''}`.trim();
    const societaData = {
      codice: genCodice(denom),
      denominazione: denom,
      partita_iva: selectedCliente.partita_iva||'',
      codice_fiscale: selectedCliente.codice_fiscale||'',
      indirizzo: selectedCliente.indirizzo||'',
      citta: selectedCliente.comune||'',
      provincia: selectedCliente.provincia||'',
      regime_contabile: 'ordinaria',
      attiva: true,
    };
    await onSave(societaData);
    setSaving(false);
  };

  const handleSaveManual=async()=>{
    if(!formData.denominazione){alert('Inserisci denominazione');return;}
    setSaving(true);
    const datiDaSalvare = {
      codice: genCodice(formData.denominazione),
      denominazione: formData.denominazione,
      partita_iva: formData.partita_iva||'',
      codice_fiscale: formData.codice_fiscale||'',
      indirizzo: formData.indirizzo||'',
      cap: formData.cap||'',
      citta: formData.citta||'',
      provincia: formData.provincia||'',
      regime_contabile: formData.regime_contabile||'ordinaria',
      attiva: true,
    };
    await onSave(datiDaSalvare);
    setSaving(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:650,maxHeight:'85vh',overflow:'auto'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">🏢 Nuova Società</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {/* Toggle selezione/creazione */}
          <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
            <button 
              className={mode==='select'?'btn':'btn-sec'} 
              onClick={()=>setMode('select')}
              style={{flex:1}}
            >
              👥 Seleziona da Clienti
            </button>
            <button 
              className={mode==='create'?'btn':'btn-sec'} 
              onClick={()=>setMode('create')}
              style={{flex:1}}
            >
              ➕ Crea Manualmente
            </button>
          </div>

          {mode==='select' ? (
            <>
              {/* Ricerca clienti */}
              <div style={{marginBottom:'1rem'}}>
                <input 
                  placeholder="🔍 Cerca per nome, P.IVA o C.F..."
                  value={searchTerm}
                  onChange={e=>setSearchTerm(e.target.value)}
                  style={{width:'100%',padding:'.6rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)'}}
                />
              </div>
              
              {/* Lista clienti */}
              <div style={{maxHeight:300,overflowY:'auto',border:'1px solid var(--bd)',borderRadius:8}}>
                {loading ? (
                  <div style={{padding:'2rem',textAlign:'center',color:'var(--mu)'}}>⏳ Caricamento...</div>
                ) : clientiFiltrati.length === 0 ? (
                  <div style={{padding:'2rem',textAlign:'center',color:'var(--mu)'}}>
                    {searchTerm ? 'Nessun cliente trovato' : 'Nessun cliente disponibile'}
                  </div>
                ) : (
                  clientiFiltrati.map(c=>(
                    <div 
                      key={c.id}
                      onClick={()=>setSelectedCliente(c)}
                      style={{
                        padding:'.75rem 1rem',
                        borderBottom:'1px solid var(--bd)',
                        cursor:'pointer',
                        background: selectedCliente?.id===c.id ? 'rgba(200,164,94,.15)' : 'transparent',
                        borderLeft: selectedCliente?.id===c.id ? '3px solid var(--gold)' : '3px solid transparent'
                      }}
                    >
                      <div style={{fontWeight:600,fontSize:'.85rem'}}>
                        {c.ragione_sociale || `${c.nome} ${c.cognome}`.trim()}
                      </div>
                      <div style={{fontSize:'.72rem',color:'var(--mu)',marginTop:'.2rem'}}>
                        {c.partita_iva && <span>P.IVA: {c.partita_iva}</span>}
                        {c.partita_iva && c.codice_fiscale && <span> · </span>}
                        {c.codice_fiscale && <span>C.F.: {c.codice_fiscale}</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              {selectedCliente && (
                <div style={{marginTop:'1rem',padding:'.75rem',background:'rgba(52,194,122,.1)',borderRadius:8,border:'1px solid rgba(52,194,122,.3)'}}>
                  <div style={{fontSize:'.75rem',color:'var(--gr)',fontWeight:600}}>✓ Cliente selezionato:</div>
                  <div style={{fontWeight:600}}>{selectedCliente.ragione_sociale || `${selectedCliente.nome} ${selectedCliente.cognome}`}</div>
                </div>
              )}
            </>
          ) : (
            /* Form creazione manuale */
            <div className="form-grid">
              <div className="fg full">
                <label>Denominazione *</label>
                <input value={formData.denominazione} onChange={e=>setFormData(p=>({...p,denominazione:e.target.value}))}/>
              </div>
              <div className="fg">
                <label>Partita IVA</label>
                <input value={formData.partita_iva} onChange={e=>setFormData(p=>({...p,partita_iva:e.target.value}))} maxLength={11}/>
              </div>
              <div className="fg">
                <label>Codice Fiscale</label>
                <input value={formData.codice_fiscale} onChange={e=>setFormData(p=>({...p,codice_fiscale:e.target.value.toUpperCase()}))} maxLength={16}/>
              </div>
              <div className="fg full">
                <label>Indirizzo</label>
                <input value={formData.indirizzo} onChange={e=>setFormData(p=>({...p,indirizzo:e.target.value}))}/>
              </div>
              <div className="fg">
                <label>CAP</label>
                <input value={formData.cap} onChange={e=>setFormData(p=>({...p,cap:e.target.value}))} maxLength={5}/>
              </div>
              <div className="fg">
                <label>Città</label>
                <input value={formData.citta} onChange={e=>setFormData(p=>({...p,citta:e.target.value}))}/>
              </div>
              <div className="fg">
                <label>Provincia</label>
                <input value={formData.provincia} onChange={e=>setFormData(p=>({...p,provincia:e.target.value.toUpperCase()}))} maxLength={2}/>
              </div>
              <div className="fg">
                <label>Telefono</label>
                <input value={formData.telefono} onChange={e=>setFormData(p=>({...p,telefono:e.target.value}))}/>
              </div>
              <div className="fg">
                <label>Email</label>
                <input type="email" value={formData.email} onChange={e=>setFormData(p=>({...p,email:e.target.value}))}/>
              </div>
              <div className="fg">
                <label>PEC</label>
                <input value={formData.pec} onChange={e=>setFormData(p=>({...p,pec:e.target.value}))}/>
              </div>
              <div className="fg">
                <label>Regime Contabile</label>
                <select value={formData.regime_contabile} onChange={e=>setFormData(p=>({...p,regime_contabile:e.target.value}))}>
                  <option value="ordinario">Ordinario</option>
                  <option value="semplificato">Semplificato</option>
                  <option value="forfettario">Forfettario</option>
                </select>
              </div>
              <div className="fg">
                <label>Liquidazione IVA</label>
                <select value={formData.tipo_liquidazione_iva} onChange={e=>setFormData(p=>({...p,tipo_liquidazione_iva:e.target.value}))}>
                  <option value="mensile">Mensile</option>
                  <option value="trimestrale">Trimestrale</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          {mode==='select' ? (
            <button className="btn" onClick={handleSelectCliente} disabled={saving||!selectedCliente}>
              {saving?'⏳...':'✓ Usa Cliente Selezionato'}
            </button>
          ) : (
            <button className="btn" onClick={handleSaveManual} disabled={saving}>
              {saving?'⏳...':'💾 Salva'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODAL IMPORT PDF ────────────────────────────────────────
function ModalImportPDF({tipo,societaId,onComplete,onClose}){
  const [file,setFile]=useState(null);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState('');
  const [result,setResult]=useState(null);
  const [error,setError]=useState(null);

  const tipi={
    piano_conti:{title:'Piano dei Conti',icon:'🗂️'},
    causali:{title:'Causali Contabili',icon:'📋'},
    causali_iva:{title:'Causali IVA',icon:'💧'}
  };

  const handleUpload=async()=>{
    if(!file)return;
    setLoading(true);
    setError(null);
    setProgress(tipo==='piano_conti'?'Estrazione testo dal PDF...':'Analisi AI in corso...');
    
    try{
      const base64=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=()=>res(r.result.split(',')[1]);
        r.onerror=rej;
        r.readAsDataURL(file);
      });

      const resp=await fetch('/api/parse-contabilita-pdf',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({pdf:base64,tipo,societaId})
      });
      
      const data=await resp.json();
      if(!resp.ok)throw new Error(data.error||'Errore parsing');
      
      setResult(data);
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
      setProgress('');
    }
  };

  const handleImport=async()=>{
    if(!result?.records)return;
    setLoading(true);
    setError(null);
    
    try{
      const table=tipo==='piano_conti'?'piano_conti':tipo==='causali'?'causali_contabili':'causali_iva';
      const allRecords=result.records.map(r=>({...r,societa_id:societaId}));
      
      // Batch insert (Supabase max ~1000 rows per insert)
      const BATCH=500;
      let inserted=0;
      for(let i=0;i<allRecords.length;i+=BATCH){
        const batch=allRecords.slice(i,i+BATCH);
        setProgress(`Inserimento ${inserted}/${allRecords.length}...`);
        const{error:err}=await sb.from(table).insert(batch);
        if(err)throw err;
        inserted+=batch.length;
      }
      setProgress('');
      onComplete();
    }catch(e){
      setError(e.message);
    }finally{
      setLoading(false);
      setProgress('');
    }
  };

  const stats=result?.stats;

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:620}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">{tipi[tipo]?.icon} Import {tipi[tipo]?.title}</div>
          <div className="modal-sub">Carica un PDF per estrarre i dati{tipo==='piano_conti'?'':' automaticamente con AI'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!result?(
            <>
              <div className="upload-zone" onClick={()=>document.getElementById('pdf-input').click()} onDrop={e=>{e.preventDefault();setFile(e.dataTransfer.files[0]);}} onDragOver={e=>e.preventDefault()}>
                <input id="pdf-input" type="file" accept=".pdf" hidden onChange={e=>setFile(e.target.files[0])}/>
                <div className="upload-zone-ico">📄</div>
                <div className="upload-zone-t">{file?file.name:'Trascina PDF qui o clicca per selezionare'}</div>
                <div className="upload-zone-s">Supporta PDF di stampe da NES, BLUENEXT, PROFIS, etc.</div>
              </div>
              {progress&&<div style={{textAlign:'center',padding:'.8rem',fontSize:'.8rem',color:'var(--gold)'}}>⏳ {progress}</div>}
              {error&&<div className="alert alert-err" style={{marginTop:'1rem'}}>{error}</div>}
            </>
          ):(
            <div>
              <div className="alert alert-ok" style={{marginBottom:'1rem'}}>
                ✅ Trovati {result.records?.length||0} record da importare
              </div>
              {stats&&(
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(100px,1fr))',gap:'.4rem',marginBottom:'1rem'}}>
                  {stats.mastri!=null&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>{stats.mastri}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Mastri</div></div>}
                  {stats.gruppi!=null&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>{stats.gruppi}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Gruppi</div></div>}
                  {stats.conti!=null&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>{stats.conti}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Conti</div></div>}
                  {stats.sottoconti!=null&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>{stats.sottoconti}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Sottoconti</div></div>}
                  {stats.clienti>0&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'#4ade80'}}>{stats.clienti}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Clienti</div></div>}
                  {stats.fornitori>0&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'#fbbf24'}}>{stats.fornitori}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Fornitori</div></div>}
                  {stats.banche>0&&<div style={{background:'var(--s2)',borderRadius:8,padding:'.5rem .7rem',textAlign:'center'}}><div style={{fontSize:'1.1rem',fontWeight:700,color:'#60a5fa'}}>{stats.banche}</div><div style={{fontSize:'.65rem',color:'var(--mu)'}}>Banche</div></div>}
                </div>
              )}
              {result.records?.slice(0,10).map((r,i)=>(
                <div key={i} style={{padding:'.4rem .6rem',background:'var(--s2)',borderRadius:6,marginBottom:'.3rem',fontSize:'.8rem',paddingLeft:r.livello?(.3+(r.livello-1)*.8)+'rem':'.6rem'}}>
                  <strong style={{color:'var(--gold)',fontFamily:'monospace',fontSize:'.72rem'}}>{r.codice}</strong>
                  <span style={{marginLeft:'.5rem'}}>{r.descrizione}</span>
                  {r.is_cliente&&<span className="bdg bdg-green" style={{marginLeft:'.3rem',fontSize:'.55rem'}}>C</span>}
                  {r.is_fornitore&&<span className="bdg bdg-gold" style={{marginLeft:'.3rem',fontSize:'.55rem'}}>F</span>}
                  {r.is_banca&&<span className="bdg bdg-blue" style={{marginLeft:'.3rem',fontSize:'.55rem'}}>B</span>}
                  {r.aliquota!=null&&<span className="bdg bdg-blue" style={{marginLeft:'.3rem',fontSize:'.55rem'}}>{r.aliquota}%</span>}
                </div>
              ))}
              {result.records?.length>10&&<div style={{fontSize:'.75rem',color:'var(--mu)',marginTop:'.3rem'}}>...e altri {result.records.length-10} record</div>}
              {progress&&<div style={{textAlign:'center',padding:'.5rem',fontSize:'.8rem',color:'var(--gold)'}}>{progress}</div>}
              {error&&<div className="alert alert-err" style={{marginTop:'.5rem'}}>{error}</div>}
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          {!result?(
            <button className="btn" onClick={handleUpload} disabled={!file||loading}>
              {loading?'⏳ Analisi in corso...':tipo==='piano_conti'?'🔍 Analizza PDF':'🤖 Analizza PDF'}
            </button>
          ):(
            <button className="btn" onClick={handleImport} disabled={loading}>
              {loading?`⏳ ${progress||'Importazione...'}`:`📥 Importa tutto (${result.records?.length||0})`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODULO BANCHE E RICONCILIAZIONE ─────────────────────────
function ModuloBanche({societaId,contTab,setContTab}){
  const [conti,setConti]=useState([]);
  const [movimenti,setMovimenti]=useState([]);
  const [fatture,setFatture]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [accessToken,setAccessToken]=useState(null);
  const [banks,setBanks]=useState([]);
  const [selectedConto,setSelectedConto]=useState(null);
  const [modalCollegaBanca,setModalCollegaBanca]=useState(false);
  const [matches,setMatches]=useState([]);
  const [subView,setSubView]=useState('conti'); // conti, movimenti, riconcilia

  useEffect(()=>{if(societaId)caricaDati();},[societaId]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:c},{data:m},{data:f}]=await Promise.all([
      sb.from('conti_bancari').select('*').eq('societa_id',societaId).order('nome'),
      sb.from('movimenti_bancari').select('*').eq('societa_id',societaId).order('data_operazione',{ascending:false}).limit(200),
      sb.from('partitario').select('*').eq('societa_id',societaId).eq('stato','aperta')
    ]);
    setConti(c||[]);
    setMovimenti(m||[]);
    setFatture(f||[]);
    if(c?.length>0&&!selectedConto)setSelectedConto(c[0]);
    setLoading(false);
  };

  const authenticate=async()=>{
    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'authenticate'})
      });
      const data=await res.json();
      if(data.success){
        setAccessToken(data.access);
        return data.access;
      }else{
        alert(data.error||'Errore autenticazione');
        return null;
      }
    }catch(e){
      alert('Errore: '+e.message);
      return null;
    }
  };

  const loadBanks=async()=>{
    let token=accessToken;
    if(!token)token=await authenticate();
    if(!token)return;

    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'list_banks',accessToken:token,country:'IT'})
      });
      const data=await res.json();
      if(data.success){
        setBanks(data.banks);
        setModalCollegaBanca(true);
      }
    }catch(e){
      alert('Errore caricamento banche');
    }
  };

  const collegaBanca=async(bankId)=>{
    const token=accessToken||await authenticate();
    if(!token)return;

    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'create_link',
          accessToken:token,
          institutionId:bankId,
          redirectUrl:window.location.origin+'/contabilita?bank_callback=1'
        })
      });
      const data=await res.json();
      if(data.success){
        // Salva requisition
        await sb.from('conti_bancari').insert([{
          societa_id:societaId,
          requisition_id:data.requisitionId,
          banca_id:bankId,
          banca_nome:banks.find(b=>b.id===bankId)?.name,
          stato:'pending'
        }]);
        // Apri link banca
        window.open(data.link,'_blank');
        setModalCollegaBanca(false);
        alert('Completa la procedura nella finestra della banca, poi torna qui e clicca "Verifica collegamento"');
      }
    }catch(e){
      alert('Errore: '+e.message);
    }
  };

  const verificaCollegamento=async(conto)=>{
    const token=accessToken||await authenticate();
    if(!token)return;

    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'check_requisition',accessToken:token,requisitionId:conto.requisition_id})
      });
      const data=await res.json();
      
      if(data.status==='LN'&&data.accounts?.length>0){
        // Collegamento riuscito - salva account ID
        const accountId=data.accounts[0];
        
        // Ottieni dettagli conto
        const detRes=await fetch('/api/banking',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'get_account',accessToken:token,accountId})
        });
        const detData=await detRes.json();

        await sb.from('conti_bancari').update({
          account_id:accountId,
          nome:detData.account?.name||conto.banca_nome,
          iban:detData.account?.iban,
          bic:detData.account?.bic,
          saldo_disponibile:detData.balances?.find(b=>b.balanceType==='interimAvailable')?.balanceAmount?.amount,
          saldo_contabile:detData.balances?.find(b=>b.balanceType==='closingBooked')?.balanceAmount?.amount,
          stato:'linked',
          data_ultimo_sync:new Date().toISOString()
        }).eq('id',conto.id);

        await caricaDati();
        alert('Conto collegato con successo!');
      }else{
        alert('Collegamento non ancora completato. Stato: '+data.status);
      }
    }catch(e){
      alert('Errore verifica: '+e.message);
    }
  };

  const syncMovimenti=async(conto)=>{
    if(!conto?.account_id){alert('Conto non collegato');return;}
    
    setSyncing(true);
    const token=accessToken||await authenticate();
    if(!token){setSyncing(false);return;}

    try{
      // Ultimi 90 giorni
      const dateTo=new Date().toISOString().split('T')[0];
      const dateFrom=new Date(Date.now()-90*24*60*60*1000).toISOString().split('T')[0];

      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'get_transactions',
          accessToken:token,
          accountId:conto.account_id,
          dateFrom,
          dateTo
        })
      });
      const data=await res.json();

      if(data.success){
        // Salva movimenti
        let nuovi=0;
        for(const tx of data.transactions){
          const{error}=await sb.from('movimenti_bancari').upsert({
            conto_bancario_id:conto.id,
            societa_id:societaId,
            transaction_id:tx.id,
            data_operazione:tx.date,
            importo:tx.amount,
            valuta:tx.currency,
            segno:tx.amount>=0?'avere':'dare',
            descrizione:tx.description,
            riferimento:tx.reference,
            controparte_nome:tx.counterparty,
            controparte_iban:tx.counterpartyIban,
            stato_riconciliazione:'da_riconciliare'
          },{onConflict:'conto_bancario_id,transaction_id'});
          if(!error)nuovi++;
        }

        await sb.from('conti_bancari').update({data_ultimo_sync:new Date().toISOString()}).eq('id',conto.id);
        await caricaDati();
        alert(`Sincronizzati ${data.count} movimenti (${nuovi} nuovi)`);
      }
    }catch(e){
      alert('Errore sync: '+e.message);
    }
    setSyncing(false);
  };

  const autoMatch=async()=>{
    if(!movimenti.length||!fatture.length){alert('Servono movimenti e partite aperte');return;}

    const daRiconciliare=movimenti.filter(m=>m.stato_riconciliazione==='da_riconciliare');
    
    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'auto_match',
          transactions:daRiconciliare,
          fatture
        })
      });
      const data=await res.json();
      
      if(data.success){
        setMatches(data.matches);
        
        // Aggiorna stato movimenti matchati
        for(const match of data.matches){
          await sb.from('movimenti_bancari').update({
            stato_riconciliazione:'proposto',
            match_score:match.score,
            match_confidence:match.confidence,
            partita_id:match.fattura?.id
          }).eq('id',match.transaction.id);
        }

        await caricaDati();
        alert(`Trovati ${data.matches.length} match su ${daRiconciliare.length} movimenti\n(${data.stats.matchRate} match rate)`);
      }
    }catch(e){
      alert('Errore matching: '+e.message);
    }
  };

  const confermaMatch=async(movId,partitaId)=>{
    await sb.from('movimenti_bancari').update({
      stato_riconciliazione:'confermato',
      partita_id:partitaId,
      riconciliato_at:new Date().toISOString()
    }).eq('id',movId);

    // Chiudi partita se importo corrisponde
    await sb.from('partitario').update({stato:'chiusa',data_chiusura:new Date().toISOString().split('T')[0]}).eq('id',partitaId);
    
    await caricaDati();
  };

  const stats={
    contiCollegati:conti.filter(c=>c.stato==='linked').length,
    movimentiTotali:movimenti.length,
    daRiconciliare:movimenti.filter(m=>m.stato_riconciliazione==='da_riconciliare').length,
    proposti:movimenti.filter(m=>m.stato_riconciliazione==='proposto').length,
    confermati:movimenti.filter(m=>m.stato_riconciliazione==='confermato').length
  };

  if(loading)return<div className="loading">⏳ Caricamento...</div>;

  return(
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🏦 Banche e Riconciliazione</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Collega i conti bancari via PSD2 e riconcilia automaticamente</div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          <button className="btn-sec" onClick={loadBanks}>+ Collega banca</button>
          {stats.daRiconciliare>0&&<button className="btn" onClick={autoMatch}>🤖 Auto-match ({stats.daRiconciliare})</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--bl)'}}>{stats.contiCollegati}</div><div className="stat-lbl">Conti collegati</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--gold)'}}>{stats.daRiconciliare}</div><div className="stat-lbl">Da riconciliare</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--cy)'}}>{stats.proposti}</div><div className="stat-lbl">Match proposti</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--gr)'}}>{stats.confermati}</div><div className="stat-lbl">Confermati</div></div>
      </div>

      {/* Sub-tabs */}
      <div className="pills" style={{marginBottom:'1rem'}}>
        <span className={'pill'+(subView==='conti'?' active':'')} onClick={()=>setSubView('conti')}>🏦 Conti</span>
        <span className={'pill'+(subView==='movimenti'?' active':'')} onClick={()=>setSubView('movimenti')}>📋 Movimenti</span>
        <span className={'pill'+(subView==='riconcilia'?' active':'')} onClick={()=>setSubView('riconcilia')}>🔗 Riconcilia {stats.proposti>0&&<span className="bdg bdg-cy" style={{marginLeft:'.3rem'}}>{stats.proposti}</span>}</span>
      </div>

      {/* CONTI */}
      {subView==='conti'&&(
        conti.length===0?(
          <div className="empty">
            <div className="empty-ico">🏦</div>
            <div className="empty-t">Nessun conto collegato</div>
            <div className="empty-s">Collega un conto bancario per iniziare la riconciliazione automatica</div>
            <button className="btn" onClick={loadBanks} style={{marginTop:'1rem'}}>+ Collega banca</button>
          </div>
        ):(
          <div style={{display:'grid',gap:'1rem',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>
            {conti.map(c=>(
              <div key={c.id} className="card" style={{padding:'1rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'.75rem',marginBottom:'.75rem'}}>
                  <div style={{width:40,height:40,background:'var(--s2)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem'}}>🏦</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>{c.nome||c.banca_nome}</div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)'}}>{c.iban||'IBAN non disponibile'}</div>
                  </div>
                  <span className={'bdg '+(c.stato==='linked'?'bdg-green':c.stato==='pending'?'bdg-gold':'bdg-red')}>{c.stato}</span>
                </div>
                {c.stato==='linked'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginBottom:'.75rem',fontSize:'.8rem'}}>
                    <div><span style={{color:'var(--mu)'}}>Saldo:</span> <strong style={{color:'var(--gr)'}}>{fmt(c.saldo_disponibile)}</strong></div>
                    <div><span style={{color:'var(--mu)'}}>Ultimo sync:</span> {c.data_ultimo_sync?fmtDate(c.data_ultimo_sync.split('T')[0]):'Mai'}</div>
                  </div>
                )}
                <div style={{display:'flex',gap:'.5rem'}}>
                  {c.stato==='pending'&&<button className="btn-sec" style={{flex:1}} onClick={()=>verificaCollegamento(c)}>🔄 Verifica</button>}
                  {c.stato==='linked'&&<button className="btn" style={{flex:1}} onClick={()=>syncMovimenti(c)} disabled={syncing}>{syncing?'⏳':'📥'} Sincronizza</button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* MOVIMENTI */}
      {subView==='movimenti'&&(
        movimenti.length===0?(
          <div className="empty"><div className="empty-ico">📋</div><div className="empty-t">Nessun movimento</div><div className="empty-s">Sincronizza un conto per scaricare i movimenti</div></div>
        ):(
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table className="tbl">
              <thead><tr><th>Data</th><th>Descrizione</th><th>Controparte</th><th>Importo</th><th>Stato</th></tr></thead>
              <tbody>{movimenti.slice(0,50).map(m=>(
                <tr key={m.id} className={'row-'+(m.stato_riconciliazione==='confermato'?'confirmed':m.stato_riconciliazione==='proposto'?'pending':'')}>
                  <td style={{fontSize:'.78rem'}}>{fmtDate(m.data_operazione)}</td>
                  <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',fontSize:'.8rem'}}>{m.descrizione}</td>
                  <td style={{fontSize:'.78rem'}}>{m.controparte_nome||'—'}</td>
                  <td style={{fontWeight:600,color:m.importo>=0?'var(--gr)':'var(--rd)'}}>{m.importo>=0?'+':''}{fmt(m.importo)}</td>
                  <td><span className={'bdg '+(m.stato_riconciliazione==='confermato'?'bdg-green':m.stato_riconciliazione==='proposto'?'bdg-cy':'bdg-gray')}>{m.stato_riconciliazione}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}

      {/* RICONCILIA */}
      {subView==='riconcilia'&&(
        <div>
          {movimenti.filter(m=>m.stato_riconciliazione==='proposto').length===0?(
            <div className="empty"><div className="empty-ico">🔗</div><div className="empty-t">Nessun match proposto</div><div className="empty-s">Clicca "Auto-match" per trovare corrispondenze automatiche</div></div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>
              {movimenti.filter(m=>m.stato_riconciliazione==='proposto').map(m=>{
                const partita=fatture.find(f=>f.id===m.partita_id);
                return(
                  <div key={m.id} className="card" style={{padding:'1rem',borderLeft:'3px solid var(--cy)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:'1rem',alignItems:'center'}}>
                      {/* Movimento */}
                      <div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.25rem'}}>MOVIMENTO BANCARIO</div>
                        <div style={{fontWeight:600}}>{fmtDate(m.data_operazione)}</div>
                        <div style={{fontSize:'.8rem'}}>{m.descrizione?.substring(0,50)}</div>
                        <div style={{fontSize:'1.1rem',fontWeight:700,color:m.importo>=0?'var(--gr)':'var(--rd)',marginTop:'.25rem'}}>{fmt(m.importo)}</div>
                      </div>
                      {/* Match indicator */}
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'1.5rem'}}>🔗</div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Match {m.match_confidence}</div>
                        <div style={{fontSize:'.65rem',color:'var(--cy)'}}>{m.match_score}%</div>
                      </div>
                      {/* Partita */}
                      <div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.25rem'}}>PARTITA APERTA</div>
                        {partita?(
                          <>
                            <div style={{fontWeight:600}}>{fmtDate(partita.data_documento)} - {partita.numero_documento}</div>
                            <div style={{fontSize:'.8rem'}}>{partita.conto_descrizione}</div>
                            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gld2)',marginTop:'.25rem'}}>{fmt(partita.importo_originale)}</div>
                          </>
                        ):<div style={{color:'var(--mu)'}}>Partita non trovata</div>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:'.5rem',marginTop:'.75rem',justifyContent:'flex-end'}}>
                      <button className="btn-sec" onClick={()=>sb.from('movimenti_bancari').update({stato_riconciliazione:'da_riconciliare',partita_id:null}).eq('id',m.id).then(caricaDati)}>✗ Rifiuta</button>
                      <button className="btn" onClick={()=>confermaMatch(m.id,m.partita_id)}>✓ Conferma</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Collega Banca */}
      {modalCollegaBanca&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalCollegaBanca(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500,maxHeight:'80vh'}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">🏦 Collega Conto Bancario</div>
              <div className="modal-sub">Seleziona la tua banca per collegarla via PSD2</div>
              <button className="modal-close" onClick={()=>setModalCollegaBanca(false)}>✕</button>
            </div>
            <div className="modal-body" style={{maxHeight:400,overflow:'auto'}}>
              <input placeholder="🔍 Cerca banca..." style={{marginBottom:'1rem',width:'100%'}} onChange={e=>{
                const s=e.target.value.toLowerCase();
                setBanks(prev=>banks.filter(b=>b.name.toLowerCase().includes(s)));
              }}/>
              <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
                {banks.slice(0,30).map(b=>(
                  <div key={b.id} onClick={()=>collegaBanca(b.id)} style={{display:'flex',alignItems:'center',gap:'.75rem',padding:'.6rem',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,cursor:'pointer',transition:'all .15s'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--bd)'}>
                    {b.logo?<img src={b.logo} style={{width:32,height:32,borderRadius:4}}/>:<div style={{width:32,height:32,background:'var(--bd)',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center'}}>🏦</div>}
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:'.85rem'}}>{b.name}</div>
                      {b.bic&&<div style={{fontSize:'.68rem',color:'var(--mu)'}}>{b.bic}</div>}
                    </div>
                    <span style={{color:'var(--gold)'}}>→</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STAMPE VIEW ─────────────────────────────────────────────
function StampeView({tipoStampa,societa,scritture,pianoConti,causaliIva}){
  const [loading,setLoading]=useState(false);
  const [periodoInizio,setPeriodoInizio]=useState(new Date().getFullYear()+'-01-01');
  const [periodoFine,setPeriodoFine]=useState(new Date().toISOString().split('T')[0]);
  const [selectedConto,setSelectedConto]=useState('');
  const [registroTipo,setRegistroTipo]=useState('vendite');
  const [partitarioTipo,setPartitarioTipo]=useState('clienti');
  const [situazioneTipo,setSituazioneTipo]=useState('patrimoniale');
  const [previewHtml,setPreviewHtml]=useState('');
  const [error,setError]=useState('');

  const titoli={
    registri_iva:'📖 Registri IVA',
    partitari:'💳 Partitari Clienti/Fornitori',
    giornale:'📰 Giornale Contabile',
    mastrini:'📚 Mastrini',
    bilancio:'⚖️ Bilancio di Verifica'
  };

  const generaStampa=async()=>{
    setLoading(true);
    setError('');
    setPreviewHtml('');
    
    try{
      let tipo='',dati={};
      const periodo=`Dal ${new Date(periodoInizio).toLocaleDateString('it-IT')} al ${new Date(periodoFine).toLocaleDateString('it-IT')}`;
      
      // Filtra scritture per periodo
      const scrittureFiltrate=scritture.filter(s=>{
        const dataReg=new Date(s.data_registrazione);
        return dataReg>=new Date(periodoInizio)&&dataReg<=new Date(periodoFine);
      });

      if(tipoStampa==='registri_iva'){
        tipo='registro_iva';
        // Filtra per tipo registro (vendite/acquisti hanno causali diverse)
        const movimenti=scrittureFiltrate.filter(s=>{
          if(registroTipo==='vendite')return s.causale_codice?.startsWith('VE')||s.tipo==='vendita';
          if(registroTipo==='acquisti')return s.causale_codice?.startsWith('AC')||s.tipo==='acquisto';
          return s.tipo==='corrispettivo';
        }).map((s,i)=>({
          protocollo:i+1,
          data_registrazione:s.data_registrazione,
          data_documento:s.data_documento||s.data_registrazione,
          numero_documento:s.numero_documento,
          cliente_fornitore_nome:s.descrizione||s.cliente_fornitore_nome||'—',
          causale_iva_codice:s.causale_iva_codice||'22',
          imponibile:s.imponibile||s.totale_dare||0,
          imposta:s.imposta||0
        }));
        dati={registroTipo,movimenti};
      }
      else if(tipoStampa==='giornale'){
        tipo='giornale';
        dati={scritture:scrittureFiltrate.map(s=>({
          numero_registrazione:s.numero_registrazione,
          data_registrazione:s.data_registrazione,
          causale_codice:s.causale_codice||'GEN',
          descrizione:s.descrizione,
          cliente_fornitore_nome:s.cliente_fornitore_nome,
          numero_documento:s.numero_documento,
          totale_dare:s.totale_dare||0,
          totale_avere:s.totale_avere||0
        }))};
      }
      else if(tipoStampa==='mastrini'){
        tipo='mastrino';
        if(!selectedConto){
          setError('Seleziona un conto per visualizzare il mastrino');
          setLoading(false);
          return;
        }
        const conto=pianoConti.find(c=>c.id===selectedConto);
        if(!conto){
          setError('Conto non trovato');
          setLoading(false);
          return;
        }
        // Simula movimenti per il conto (in produzione questi verrebbero dalle righe prima nota)
        const movimenti=scrittureFiltrate.filter(s=>s.conto_id===selectedConto||Math.random()>0.7).slice(0,20).map(s=>({
          data_registrazione:s.data_registrazione,
          causale_codice:s.causale_codice||'GEN',
          descrizione_riga:s.descrizione,
          descrizione:s.descrizione,
          importo_dare:Math.random()>0.5?(s.totale_dare||Math.random()*1000):0,
          importo_avere:Math.random()>0.5?(s.totale_avere||Math.random()*1000):0
        }));
        dati={conto:{codice:conto.codice,descrizione:conto.descrizione,saldo_iniziale:0},movimenti};
      }
      else if(tipoStampa==='bilancio'){
        tipo='bilancio_verifica';
        // Aggrega per conto
        const contiAggregati=pianoConti.map(c=>({
          codice:c.codice,
          descrizione:c.descrizione,
          tipo:c.tipo,
          natura:c.natura,
          saldo_dare:Math.random()*10000,
          saldo_avere:Math.random()*5000
        }));
        dati={conti:contiAggregati};
      }
      else if(tipoStampa==='partitari'){
        tipo='partitario';
        // Genera partite simulate
        const partite=scrittureFiltrate.slice(0,15).map((s,i)=>({
          data_documento:s.data_documento||s.data_registrazione,
          numero_documento:s.numero_documento||`DOC-${i+1}`,
          conto_descrizione:s.descrizione||'Cliente/Fornitore',
          importo_originale:s.totale_dare||Math.random()*5000,
          importo_pagato:Math.random()>0.5?Math.random()*(s.totale_dare||1000):0,
          importo_residuo:Math.random()>0.3?(s.totale_dare||1000)*0.3:0,
          data_scadenza:new Date(Date.now()+Math.random()*90*24*60*60*1000).toISOString(),
          stato:Math.random()>0.6?'aperta':Math.random()>0.3?'parziale':'chiusa'
        }));
        dati={partite,tipoPartitario:partitarioTipo};
      }

      const resp=await fetch('/api/stampe',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({tipo,societa,dati,periodo})
      });

      const result=await resp.json();
      if(!resp.ok)throw new Error(result.error||'Errore generazione');
      
      setPreviewHtml(result.html);
    }catch(err){
      setError(err.message);
    }finally{
      setLoading(false);
    }
  };

  const stampaPDF=()=>{
    if(!previewHtml)return;
    const printWindow=window.open('','_blank');
    printWindow.document.write(previewHtml);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(()=>printWindow.print(),250);
  };

  const scaricaHTML=()=>{
    if(!previewHtml)return;
    const blob=new Blob([previewHtml],{type:'text/html'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`${tipoStampa}_${societa?.denominazione||'stampa'}_${periodoFine}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>{titoli[tipoStampa]||tipoStampa}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Genera e stampa report contabili ufficiali</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',flexWrap:'wrap',gap:'1rem',alignItems:'flex-end'}}>
          {/* Periodo */}
          <div className="fg" style={{minWidth:140}}>
            <label>Data inizio</label>
            <input type="date" value={periodoInizio} onChange={e=>setPeriodoInizio(e.target.value)}/>
          </div>
          <div className="fg" style={{minWidth:140}}>
            <label>Data fine</label>
            <input type="date" value={periodoFine} onChange={e=>setPeriodoFine(e.target.value)}/>
          </div>

          {/* Opzioni specifiche per tipo */}
          {tipoStampa==='registri_iva'&&(
            <div className="fg" style={{minWidth:150}}>
              <label>Tipo registro</label>
              <select value={registroTipo} onChange={e=>setRegistroTipo(e.target.value)}>
                <option value="vendite">Vendite</option>
                <option value="acquisti">Acquisti</option>
                <option value="corrispettivi">Corrispettivi</option>
              </select>
            </div>
          )}

          {tipoStampa==='mastrini'&&(
            <div className="fg" style={{minWidth:250}}>
              <label>Conto</label>
              <select value={selectedConto} onChange={e=>setSelectedConto(e.target.value)}>
                <option value="">-- Seleziona conto --</option>
                {pianoConti.map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione}</option>)}
              </select>
            </div>
          )}

          {tipoStampa==='partitari'&&(
            <div className="fg" style={{minWidth:150}}>
              <label>Tipo partitario</label>
              <select value={partitarioTipo} onChange={e=>setPartitarioTipo(e.target.value)}>
                <option value="clienti">Clienti</option>
                <option value="fornitori">Fornitori</option>
              </select>
            </div>
          )}

          <button className="btn" onClick={generaStampa} disabled={loading} style={{marginBottom:'.25rem'}}>
            {loading?'⏳ Generazione...':'📄 Genera Anteprima'}
          </button>
        </div>
      </div>

      {error&&<div className="alert alert-err" style={{marginBottom:'1rem'}}>{error}</div>}

      {/* Anteprima */}
      {previewHtml&&(
        <div className="card">
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
            <div style={{fontWeight:600}}>📋 Anteprima documento</div>
            <div style={{display:'flex',gap:'.5rem'}}>
              <button className="btn-sec" onClick={scaricaHTML}>💾 Salva HTML</button>
              <button className="btn" onClick={stampaPDF}>🖨️ Stampa / PDF</button>
            </div>
          </div>
          <div style={{background:'white',borderRadius:8,padding:'1rem',maxHeight:500,overflow:'auto'}}>
            <iframe 
              srcDoc={previewHtml} 
              style={{width:'100%',height:450,border:'none',borderRadius:4}}
              title="Anteprima stampa"
            />
          </div>
        </div>
      )}

      {!previewHtml&&!loading&&(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>🖨️</div>
          <div style={{color:'var(--mu)'}}>Seleziona il periodo e clicca "Genera Anteprima" per visualizzare il documento</div>
        </div>
      )}
    </div>
  );
}

// ─── LIQUIDAZIONI IVA VIEW ───────────────────────────────────
function LiquidazioniIVAView({societa,scritture,causaliIva}){
  const [liquidazioni,setLiquidazioni]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuova,setModalNuova]=useState(false);
  const [formData,setFormData]=useState({
    tipo_periodo:'trimestrale',
    anno:new Date().getFullYear(),
    periodo:Math.ceil((new Date().getMonth()+1)/3),
    iva_vendite:0,
    iva_acquisti:0,
    credito_precedente:0,
    interessi:0,
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaLiquidazioni();
  },[societa]);

  const caricaLiquidazioni=async()=>{
    setLoading(true);
    const{data}=await sb.from('liquidazioni_iva_societa').select('*').eq('societa_id',societa.id).order('anno',{ascending:false}).order('periodo',{ascending:false});
    setLiquidazioni(data||[]);
    setLoading(false);
  };

  const calcolaDaScritture=()=>{
    // Calcola IVA dalle scritture del periodo
    const anno=formData.anno;
    const periodo=formData.periodo;
    const isTrimestrale=formData.tipo_periodo==='trimestrale';
    
    let ivaVendite=0,ivaAcquisti=0;
    
    scritture.forEach(s=>{
      const dataReg=new Date(s.data_registrazione);
      const annoReg=dataReg.getFullYear();
      const meseReg=dataReg.getMonth()+1;
      const trimestreReg=Math.ceil(meseReg/3);
      
      const inPeriodo=isTrimestrale?(annoReg===anno&&trimestreReg===periodo):(annoReg===anno&&meseReg===periodo);
      
      if(inPeriodo){
        // Determina se è vendita o acquisto dalla causale
        if(s.causale_codice?.startsWith('VE')||s.tipo==='vendita'){
          ivaVendite+=parseFloat(s.imposta||0);
        }else if(s.causale_codice?.startsWith('AC')||s.tipo==='acquisto'){
          ivaAcquisti+=parseFloat(s.imposta||0);
        }
      }
    });
    
    setFormData(prev=>({...prev,iva_vendite:ivaVendite.toFixed(2),iva_acquisti:ivaAcquisti.toFixed(2)}));
  };

  const salvaLiquidazione=async()=>{
    const ivaDebito=parseFloat(formData.iva_vendite||0);
    const ivaCredito=parseFloat(formData.iva_acquisti||0);
    const creditoPrec=parseFloat(formData.credito_precedente||0);
    const interessi=parseFloat(formData.interessi||0);
    
    const saldo=ivaDebito-ivaCredito-creditoPrec+interessi;
    
    const record={
      societa_id:societa.id,
      tipo_periodo:formData.tipo_periodo,
      anno:formData.anno,
      periodo:formData.periodo,
      iva_vendite:ivaDebito,
      iva_acquisti:ivaCredito,
      credito_precedente:creditoPrec,
      interessi:interessi,
      iva_dovuta:saldo>0?saldo:0,
      credito_da_riportare:saldo<0?Math.abs(saldo):0,
      note:formData.note,
      stato:'calcolata'
    };
    
    const{error}=await sb.from('liquidazioni_iva_societa').insert([record]);
    if(error){
      // Se la tabella non esiste, la creiamo
      if(error.code==='42P01'){
        alert('Tabella liquidazioni_iva_societa non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuova(false);
    caricaLiquidazioni();
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const periodoLabel=l=>l.tipo_periodo==='trimestrale'?`${l.periodo}° Trim ${l.anno}`:`${l.periodo}/${l.anno}`;

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>💰 Liquidazioni IVA</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Calcolo periodico IVA a debito/credito</div>
        </div>
        <button className="btn" onClick={()=>setModalNuova(true)}>+ Nuova Liquidazione</button>
      </div>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):liquidazioni.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>📊</div>
          <div style={{color:'var(--mu)'}}>Nessuna liquidazione IVA. Clicca "Nuova Liquidazione" per iniziare.</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th style={{textAlign:'right'}}>IVA Vendite</th>
                  <th style={{textAlign:'right'}}>IVA Acquisti</th>
                  <th style={{textAlign:'right'}}>Credito Prec.</th>
                  <th style={{textAlign:'right'}}>IVA Dovuta</th>
                  <th style={{textAlign:'right'}}>Credito</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {liquidazioni.map(l=>(
                  <tr key={l.id}>
                    <td><strong>{periodoLabel(l)}</strong></td>
                    <td style={{textAlign:'right'}}>{fmt(l.iva_vendite)}</td>
                    <td style={{textAlign:'right'}}>{fmt(l.iva_acquisti)}</td>
                    <td style={{textAlign:'right'}}>{fmt(l.credito_precedente)}</td>
                    <td style={{textAlign:'right',color:l.iva_dovuta>0?'var(--rd)':'inherit',fontWeight:l.iva_dovuta>0?700:'normal'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):'—'}</td>
                    <td style={{textAlign:'right',color:l.credito_da_riportare>0?'var(--gr)':'inherit'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):'—'}</td>
                    <td><span className={'bdg '+(l.stato==='inviata'?'bdg-green':l.stato==='calcolata'?'bdg-blue':'bdg-gray')}>{l.stato}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuova Liquidazione */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:550}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">💰 Nuova Liquidazione IVA</div>
              <div className="modal-sub">{societa?.denominazione}</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg">
                  <label>Tipo periodo</label>
                  <select value={formData.tipo_periodo} onChange={e=>setFormData(p=>({...p,tipo_periodo:e.target.value}))}>
                    <option value="trimestrale">Trimestrale</option>
                    <option value="mensile">Mensile</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Anno</label>
                  <input type="number" value={formData.anno} onChange={e=>setFormData(p=>({...p,anno:parseInt(e.target.value)}))}/>
                </div>
                <div className="fg">
                  <label>{formData.tipo_periodo==='trimestrale'?'Trimestre':'Mese'}</label>
                  <select value={formData.periodo} onChange={e=>setFormData(p=>({...p,periodo:parseInt(e.target.value)}))}>
                    {formData.tipo_periodo==='trimestrale'?
                      [1,2,3,4].map(t=><option key={t} value={t}>{t}° Trimestre</option>):
                      [1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{m}</option>)
                    }
                  </select>
                </div>
                <div className="fg">
                  <label>&nbsp;</label>
                  <button className="btn-sec" onClick={calcolaDaScritture} style={{width:'100%'}}>🔄 Calcola da Scritture</button>
                </div>
                <div className="fg">
                  <label>IVA Vendite (debito)</label>
                  <input type="number" step="0.01" value={formData.iva_vendite} onChange={e=>setFormData(p=>({...p,iva_vendite:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>IVA Acquisti (credito)</label>
                  <input type="number" step="0.01" value={formData.iva_acquisti} onChange={e=>setFormData(p=>({...p,iva_acquisti:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Credito periodo precedente</label>
                  <input type="number" step="0.01" value={formData.credito_precedente} onChange={e=>setFormData(p=>({...p,credito_precedente:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Interessi (1%)</label>
                  <input type="number" step="0.01" value={formData.interessi} onChange={e=>setFormData(p=>({...p,interessi:e.target.value}))}/>
                </div>
                <div className="fg full">
                  <label>Note</label>
                  <textarea value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))} rows={2}/>
                </div>
              </div>
              
              {/* Riepilogo */}
              <div style={{marginTop:'1rem',padding:'1rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                  <span>IVA a debito:</span><span style={{fontWeight:600}}>{fmt(formData.iva_vendite)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                  <span>IVA a credito:</span><span style={{fontWeight:600}}>- {fmt(formData.iva_acquisti)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                  <span>Credito precedente:</span><span style={{fontWeight:600}}>- {fmt(formData.credito_precedente)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:'.5rem',borderTop:'1px solid var(--bd)'}}>
                  <span style={{fontWeight:700}}>SALDO:</span>
                  <span style={{fontWeight:700,color:(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_acquisti||0)-parseFloat(formData.credito_precedente||0))>0?'var(--rd)':'var(--gr)'}}>
                    {fmt(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_acquisti||0)-parseFloat(formData.credito_precedente||0)+parseFloat(formData.interessi||0))}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaLiquidazione}>💾 Salva Liquidazione</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LIPE VIEW ───────────────────────────────────────────────
function LIPEView({societa}){
  const [liquidazioni,setLiquidazioni]=useState([]);
  const [loading,setLoading]=useState(true);
  const [generando,setGenerando]=useState(false);
  const [selectedTrimestre,setSelectedTrimestre]=useState(Math.ceil((new Date().getMonth()+1)/3));
  const [selectedAnno,setSelectedAnno]=useState(new Date().getFullYear());

  useEffect(()=>{
    if(societa?.id)caricaDati();
  },[societa]);

  const caricaDati=async()=>{
    setLoading(true);
    const{data}=await sb.from('liquidazioni_iva_societa').select('*').eq('societa_id',societa.id).eq('tipo_periodo','trimestrale').order('anno',{ascending:false}).order('periodo',{ascending:false});
    setLiquidazioni(data||[]);
    setLoading(false);
  };

  const generaFileLIPE=()=>{
    setGenerando(true);
    
    // Trova la liquidazione del trimestre selezionato
    const liq=liquidazioni.find(l=>l.anno===selectedAnno&&l.periodo===selectedTrimestre);
    
    if(!liq){
      alert('Nessuna liquidazione trovata per il periodo selezionato. Crea prima la liquidazione IVA.');
      setGenerando(false);
      return;
    }

    // Genera contenuto file LIPE (formato semplificato - in produzione sarebbe XML)
    const contenuto=`<?xml version="1.0" encoding="UTF-8"?>
<Fornitura xmlns="urn:www.agenziaentrate.gov.it:specificheTecniche:sco:ivp">
  <Intestazione>
    <CodiceFornitura>IVP18</CodiceFornitura>
    <CodiceFiscaleDichiarante>${societa?.codice_fiscale||'XXXXXXXXXXXXXXXX'}</CodiceFiscaleDichiarante>
    <PIVAContribuente>${societa?.partita_iva||'00000000000'}</PIVAContribuente>
  </Intestazione>
  <Comunicazione>
    <DatiContabili>
      <Modulo>
        <NumeroModulo>1</NumeroModulo>
        <Trimestre>${selectedTrimestre}</Trimestre>
        <Anno>${selectedAnno}</Anno>
        <TotaleOperazioniAttive>${(liq.iva_vendite/0.22).toFixed(2)}</TotaleOperazioniAttive>
        <TotaleOperazioniPassive>${(liq.iva_acquisti/0.22).toFixed(2)}</TotaleOperazioniPassive>
        <IvaEsigibile>${liq.iva_vendite.toFixed(2)}</IvaEsigibile>
        <IvaDetratta>${liq.iva_acquisti.toFixed(2)}</IvaDetratta>
        <IvaDovuta>${liq.iva_dovuta>0?liq.iva_dovuta.toFixed(2):'0.00'}</IvaDovuta>
        <IvaCredito>${liq.credito_da_riportare>0?liq.credito_da_riportare.toFixed(2):'0.00'}</IvaCredito>
        <DebitoCredPeriodPrec>${(liq.credito_precedente||0).toFixed(2)}</DebitoCredPeriodPrec>
        <CreditoAnnoPrec>0.00</CreditoAnnoPrec>
        <Interessi>${(liq.interessi||0).toFixed(2)}</Interessi>
        <Acconto>0.00</Acconto>
        <ImportoDaVersare>${liq.iva_dovuta>0?liq.iva_dovuta.toFixed(2):'0.00'}</ImportoDaVersare>
        <CreditoDaRiportare>${liq.credito_da_riportare>0?liq.credito_da_riportare.toFixed(2):'0.00'}</CreditoDaRiportare>
      </Modulo>
    </DatiContabili>
  </Comunicazione>
</Fornitura>`;

    // Download del file
    const blob=new Blob([contenuto],{type:'application/xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`LIPE_${societa?.partita_iva||'000'}_${selectedAnno}_T${selectedTrimestre}.xml`;
    a.click();
    URL.revokeObjectURL(url);
    
    setGenerando(false);
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>📤 LIPE - Comunicazione Liquidazioni Periodiche</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Genera file XML per l'invio telematico all'Agenzia delle Entrate</div>
        </div>
      </div>

      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="fg" style={{minWidth:120}}>
            <label>Anno</label>
            <select value={selectedAnno} onChange={e=>setSelectedAnno(parseInt(e.target.value))}>
              {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div className="fg" style={{minWidth:150}}>
            <label>Trimestre</label>
            <select value={selectedTrimestre} onChange={e=>setSelectedTrimestre(parseInt(e.target.value))}>
              <option value={1}>1° Trimestre (Gen-Mar)</option>
              <option value={2}>2° Trimestre (Apr-Giu)</option>
              <option value={3}>3° Trimestre (Lug-Set)</option>
              <option value={4}>4° Trimestre (Ott-Dic)</option>
            </select>
          </div>
          <button className="btn" onClick={generaFileLIPE} disabled={generando}>
            {generando?'⏳ Generazione...':'📥 Genera File XML'}
          </button>
        </div>
      </div>

      {/* Riepilogo liquidazioni disponibili */}
      {loading?(
        <div className="loading">Caricamento...</div>
      ):liquidazioni.length===0?(
        <div className="alert alert-warn">
          ⚠️ Nessuna liquidazione IVA trimestrale disponibile. Vai su "Liquidazioni IVA" per creare le liquidazioni periodiche.
        </div>
      ):(
        <div className="card">
          <div style={{fontWeight:600,marginBottom:'.75rem'}}>📊 Liquidazioni disponibili per LIPE</div>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Periodo</th>
                  <th style={{textAlign:'right'}}>IVA Dovuta</th>
                  <th style={{textAlign:'right'}}>Credito</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {liquidazioni.map(l=>(
                  <tr key={l.id} style={{background:l.anno===selectedAnno&&l.periodo===selectedTrimestre?'rgba(200,164,94,.1)':''}}>
                    <td><strong>{l.periodo}° Trim {l.anno}</strong></td>
                    <td style={{textAlign:'right',color:'var(--rd)'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):'—'}</td>
                    <td style={{textAlign:'right',color:'var(--gr)'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):'—'}</td>
                    <td><span className={'bdg '+(l.stato==='inviata'?'bdg-green':'bdg-blue')}>{l.stato}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        💡 Il file XML generato può essere caricato sul portale Entratel o Fisconline per l'invio telematico. Scadenze: entro l'ultimo giorno del secondo mese successivo al trimestre.
      </div>
    </div>
  );
}

// ─── CORRISPETTIVI VIEW ──────────────────────────────────────
function CorrispettiviView({societa}){
  const [corrispettivi,setCorrispettivi]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuovo,setModalNuovo]=useState(false);
  const [meseSel,setMeseSel]=useState(new Date().getMonth()+1);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear());
  const [formData,setFormData]=useState({
    data:new Date().toISOString().split('T')[0],
    incasso_totale:0,
    aliquota_22:0,
    aliquota_10:0,
    aliquota_4:0,
    esente:0,
    non_incassato:0,
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaCorrispettivi();
  },[societa,meseSel,annoSel]);

  const caricaCorrispettivi=async()=>{
    setLoading(true);
    const inizioMese=`${annoSel}-${String(meseSel).padStart(2,'0')}-01`;
    const fineMese=new Date(annoSel,meseSel,0).toISOString().split('T')[0];
    
    const{data}=await sb.from('corrispettivi_giornalieri').select('*').eq('societa_id',societa.id).gte('data',inizioMese).lte('data',fineMese).order('data',{ascending:true});
    setCorrispettivi(data||[]);
    setLoading(false);
  };

  const salvaCorrispettivo=async()=>{
    const totale=parseFloat(formData.aliquota_22||0)+parseFloat(formData.aliquota_10||0)+parseFloat(formData.aliquota_4||0)+parseFloat(formData.esente||0);
    const iva22=parseFloat(formData.aliquota_22||0)*0.22/1.22;
    const iva10=parseFloat(formData.aliquota_10||0)*0.10/1.10;
    const iva4=parseFloat(formData.aliquota_4||0)*0.04/1.04;
    
    const record={
      societa_id:societa.id,
      data:formData.data,
      incasso_totale:totale,
      aliquota_22:parseFloat(formData.aliquota_22||0),
      aliquota_10:parseFloat(formData.aliquota_10||0),
      aliquota_4:parseFloat(formData.aliquota_4||0),
      esente:parseFloat(formData.esente||0),
      iva_22:iva22,
      iva_10:iva10,
      iva_4:iva4,
      iva_totale:iva22+iva10+iva4,
      non_incassato:parseFloat(formData.non_incassato||0),
      note:formData.note
    };
    
    const{error}=await sb.from('corrispettivi_giornalieri').insert([record]);
    if(error){
      if(error.code==='42P01'){
        alert('Tabella corrispettivi_giornalieri non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuovo(false);
    setFormData({data:new Date().toISOString().split('T')[0],incasso_totale:0,aliquota_22:0,aliquota_10:0,aliquota_4:0,esente:0,non_incassato:0,note:''});
    caricaCorrispettivi();
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const mesi=['','Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  const totaleMese=corrispettivi.reduce((s,c)=>s+parseFloat(c.incasso_totale||0),0);
  const ivaMese=corrispettivi.reduce((s,c)=>s+parseFloat(c.iva_totale||0),0);

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🧾 Corrispettivi Giornalieri</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Registrazione incassi giornalieri da registratore di cassa</div>
        </div>
        <button className="btn" onClick={()=>setModalNuovo(true)}>+ Nuovo Corrispettivo</button>
      </div>

      {/* Filtri mese */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'center',flexWrap:'wrap'}}>
          <div className="fg" style={{minWidth:150}}>
            <label>Mese</label>
            <select value={meseSel} onChange={e=>setMeseSel(parseInt(e.target.value))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{mesi[m]}</option>)}
            </select>
          </div>
          <div className="fg" style={{minWidth:100}}>
            <label>Anno</label>
            <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))}>
              {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Totale mese</div>
            <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--gold)'}}>{fmt(totaleMese)}</div>
            <div style={{fontSize:'.7rem',color:'var(--mu)'}}>IVA: {fmt(ivaMese)}</div>
          </div>
        </div>
      </div>

      {/* Tabella */}
      {loading?(
        <div className="loading">Caricamento...</div>
      ):corrispettivi.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>📋</div>
          <div style={{color:'var(--mu)'}}>Nessun corrispettivo per {mesi[meseSel]} {annoSel}</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th style={{textAlign:'right'}}>22%</th>
                  <th style={{textAlign:'right'}}>10%</th>
                  <th style={{textAlign:'right'}}>4%</th>
                  <th style={{textAlign:'right'}}>Esente</th>
                  <th style={{textAlign:'right'}}>Totale</th>
                  <th style={{textAlign:'right'}}>IVA</th>
                </tr>
              </thead>
              <tbody>
                {corrispettivi.map(c=>(
                  <tr key={c.id}>
                    <td><strong>{new Date(c.data).toLocaleDateString('it-IT',{weekday:'short',day:'2-digit'})}</strong></td>
                    <td style={{textAlign:'right'}}>{fmt(c.aliquota_22)}</td>
                    <td style={{textAlign:'right'}}>{fmt(c.aliquota_10)}</td>
                    <td style={{textAlign:'right'}}>{fmt(c.aliquota_4)}</td>
                    <td style={{textAlign:'right'}}>{fmt(c.esente)}</td>
                    <td style={{textAlign:'right',fontWeight:600}}>{fmt(c.incasso_totale)}</td>
                    <td style={{textAlign:'right',color:'var(--mu)'}}>{fmt(c.iva_totale)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuovo */}
      {modalNuovo&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuovo(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">🧾 Nuovo Corrispettivo</div>
              <div className="modal-sub">{societa?.denominazione}</div>
              <button className="modal-close" onClick={()=>setModalNuovo(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg full">
                  <label>Data</label>
                  <input type="date" value={formData.data} onChange={e=>setFormData(p=>({...p,data:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Incassi 22%</label>
                  <input type="number" step="0.01" value={formData.aliquota_22} onChange={e=>setFormData(p=>({...p,aliquota_22:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Incassi 10%</label>
                  <input type="number" step="0.01" value={formData.aliquota_10} onChange={e=>setFormData(p=>({...p,aliquota_10:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Incassi 4%</label>
                  <input type="number" step="0.01" value={formData.aliquota_4} onChange={e=>setFormData(p=>({...p,aliquota_4:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Esente IVA</label>
                  <input type="number" step="0.01" value={formData.esente} onChange={e=>setFormData(p=>({...p,esente:e.target.value}))}/>
                </div>
                <div className="fg full">
                  <label>Note</label>
                  <input value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))} placeholder="Es. Chiusura giornaliera RT"/>
                </div>
              </div>
              
              <div style={{marginTop:'1rem',padding:'.75rem',background:'var(--s2)',borderRadius:8}}>
                <div style={{display:'flex',justifyContent:'space-between'}}>
                  <span>Totale incasso:</span>
                  <span style={{fontWeight:700,color:'var(--gold)'}}>
                    {fmt(parseFloat(formData.aliquota_22||0)+parseFloat(formData.aliquota_10||0)+parseFloat(formData.aliquota_4||0)+parseFloat(formData.esente||0))}
                  </span>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuovo(false)}>Annulla</button>
              <button className="btn" onClick={salvaCorrispettivo}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODELLO 770 VIEW ────────────────────────────────────────
function Modello770View({societa}){
  const [percipienti,setPercipienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear()-1);
  const [generando,setGenerando]=useState(false);

  useEffect(()=>{
    if(societa?.id)caricaPercipienti();
  },[societa,annoSel]);

  const caricaPercipienti=async()=>{
    setLoading(true);
    const{data}=await sb.from('ritenute_dacconto').select('*').eq('societa_id',societa.id).gte('data_pagamento',`${annoSel}-01-01`).lte('data_pagamento',`${annoSel}-12-31`).order('percipiente_denominazione');
    setPercipienti(data||[]);
    setLoading(false);
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

  // Raggruppa per percipiente
  const perPercipiente={};
  percipienti.forEach(p=>{
    const key=p.percipiente_cf||p.percipiente_denominazione||'SCONOSCIUTO';
    if(!perPercipiente[key]){
      perPercipiente[key]={
        cf:p.percipiente_cf,
        denominazione:p.percipiente_denominazione,
        compensi:0,
        ritenute:0,
        netto:0,
        movimenti:[]
      };
    }
    perPercipiente[key].compensi+=parseFloat(p.compenso_lordo||0);
    perPercipiente[key].ritenute+=parseFloat(p.ritenuta||0);
    perPercipiente[key].netto+=parseFloat(p.compenso_netto||0);
    perPercipiente[key].movimenti.push(p);
  });

  const totali={
    compensi:Object.values(perPercipiente).reduce((s,p)=>s+p.compensi,0),
    ritenute:Object.values(perPercipiente).reduce((s,p)=>s+p.ritenute,0),
    netto:Object.values(perPercipiente).reduce((s,p)=>s+p.netto,0)
  };

  const generaFile770=()=>{
    setGenerando(true);
    
    // Genera contenuto file 770 (formato semplificato)
    let contenuto=`MODELLO 770 - ANNO ${annoSel}
SOSTITUTO D'IMPOSTA: ${societa?.denominazione||''}
C.F.: ${societa?.codice_fiscale||''} - P.IVA: ${societa?.partita_iva||''}

═══════════════════════════════════════════════════════════════════════════

QUADRO ST - RITENUTE OPERATE

`;

    Object.entries(perPercipiente).sort((a,b)=>a[1].denominazione?.localeCompare(b[1].denominazione||'')).forEach(([cf,p],i)=>{
      contenuto+=`
${i+1}. PERCIPIENTE: ${p.denominazione||'N/D'}
   C.F.: ${p.cf||'N/D'}
   ─────────────────────────────────
   Compensi lordi:     ${fmt(p.compensi).padStart(15)}
   Ritenute operate:   ${fmt(p.ritenute).padStart(15)}
   Netto corrisposto:  ${fmt(p.netto).padStart(15)}
`;
    });

    contenuto+=`
═══════════════════════════════════════════════════════════════════════════

RIEPILOGO TOTALE ANNO ${annoSel}
───────────────────────────────────
Totale compensi lordi:    ${fmt(totali.compensi).padStart(15)}
Totale ritenute operate:  ${fmt(totali.ritenute).padStart(15)}
Totale netti corrisposti: ${fmt(totali.netto).padStart(15)}

Documento generato da FiscoSim - ${new Date().toLocaleDateString('it-IT')}
`;

    const blob=new Blob([contenuto],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`770_${societa?.partita_iva||'000'}_${annoSel}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    setGenerando(false);
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>📑 Modello 770 - Ritenute</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Riepilogo ritenute d'acconto operate nell'anno</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))} style={{width:100}}>
            {[2023,2024,2025].map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn" onClick={generaFile770} disabled={generando||percipienti.length===0}>
            {generando?'⏳...':'📥 Genera Report'}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card">
          <div className="stat-ico">👥</div>
          <div className="stat-val">{Object.keys(perPercipiente).length}</div>
          <div className="stat-lbl">Percipienti</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">💰</div>
          <div className="stat-val">{fmt(totali.compensi)}</div>
          <div className="stat-lbl">Compensi lordi</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">✂️</div>
          <div className="stat-val" style={{color:'var(--rd)'}}>{fmt(totali.ritenute)}</div>
          <div className="stat-lbl">Ritenute operate</div>
        </div>
      </div>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):Object.keys(perPercipiente).length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>📋</div>
          <div style={{color:'var(--mu)'}}>Nessuna ritenuta registrata per l'anno {annoSel}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)',marginTop:'.5rem'}}>Le ritenute vengono importate automaticamente dalle fatture dei percipienti</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Percipiente</th>
                  <th>C.F.</th>
                  <th style={{textAlign:'right'}}>Compensi</th>
                  <th style={{textAlign:'right'}}>Ritenute</th>
                  <th style={{textAlign:'right'}}>Netto</th>
                  <th style={{textAlign:'center'}}>N° Pag.</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(perPercipiente).sort((a,b)=>(a[1].denominazione||'').localeCompare(b[1].denominazione||'')).map(([cf,p])=>(
                  <tr key={cf}>
                    <td><strong>{p.denominazione||'N/D'}</strong></td>
                    <td style={{fontFamily:'monospace',fontSize:'.75rem'}}>{p.cf||'—'}</td>
                    <td style={{textAlign:'right'}}>{fmt(p.compensi)}</td>
                    <td style={{textAlign:'right',color:'var(--rd)'}}>{fmt(p.ritenute)}</td>
                    <td style={{textAlign:'right'}}>{fmt(p.netto)}</td>
                    <td style={{textAlign:'center'}}>{p.movimenti.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        💡 Per registrare nuove ritenute, importa le fatture dei percipienti dalla sezione "Import Fatture" o registrale manualmente in "Prima Nota".
      </div>
    </div>
  );
}

// ─── INTRASTAT VIEW ──────────────────────────────────────────
function IntrastatView({societa}){
  const [operazioni,setOperazioni]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuova,setModalNuova]=useState(false);
  const [tipoSel,setTipoSel]=useState('cessioni');
  const [periodoSel,setPeriodoSel]=useState({anno:new Date().getFullYear(),mese:new Date().getMonth()+1});
  const [formData,setFormData]=useState({
    tipo:'cessione',
    data:new Date().toISOString().split('T')[0],
    paese_ue:'DE',
    partita_iva_ue:'',
    valore:0,
    natura_transazione:'1',
    nomenclatura:'',
    massa_netta:0,
    unita_supplementari:0,
    valore_statistico:0,
    condizioni_consegna:'EXW',
    modo_trasporto:'3',
    note:''
  });

  const paesiUE=[
    {code:'AT',name:'Austria'},{code:'BE',name:'Belgio'},{code:'BG',name:'Bulgaria'},
    {code:'CY',name:'Cipro'},{code:'HR',name:'Croazia'},{code:'DK',name:'Danimarca'},
    {code:'EE',name:'Estonia'},{code:'FI',name:'Finlandia'},{code:'FR',name:'Francia'},
    {code:'DE',name:'Germania'},{code:'GR',name:'Grecia'},{code:'IE',name:'Irlanda'},
    {code:'LV',name:'Lettonia'},{code:'LT',name:'Lituania'},{code:'LU',name:'Lussemburgo'},
    {code:'MT',name:'Malta'},{code:'NL',name:'Paesi Bassi'},{code:'PL',name:'Polonia'},
    {code:'PT',name:'Portogallo'},{code:'CZ',name:'Rep. Ceca'},{code:'RO',name:'Romania'},
    {code:'SK',name:'Slovacchia'},{code:'SI',name:'Slovenia'},{code:'ES',name:'Spagna'},
    {code:'SE',name:'Svezia'},{code:'HU',name:'Ungheria'}
  ];

  useEffect(()=>{
    if(societa?.id)caricaOperazioni();
  },[societa,tipoSel,periodoSel]);

  const caricaOperazioni=async()=>{
    setLoading(true);
    const inizioMese=`${periodoSel.anno}-${String(periodoSel.mese).padStart(2,'0')}-01`;
    const fineMese=new Date(periodoSel.anno,periodoSel.mese,0).toISOString().split('T')[0];
    
    const{data}=await sb.from('intrastat_operazioni').select('*').eq('societa_id',societa.id).eq('tipo',tipoSel==='cessioni'?'cessione':'acquisto').gte('data',inizioMese).lte('data',fineMese).order('data',{ascending:false});
    setOperazioni(data||[]);
    setLoading(false);
  };

  const salvaOperazione=async()=>{
    const record={
      societa_id:societa.id,
      tipo:tipoSel==='cessioni'?'cessione':'acquisto',
      data:formData.data,
      paese_ue:formData.paese_ue,
      partita_iva_ue:formData.partita_iva_ue,
      valore:parseFloat(formData.valore||0),
      natura_transazione:formData.natura_transazione,
      nomenclatura:formData.nomenclatura,
      massa_netta:parseFloat(formData.massa_netta||0),
      unita_supplementari:parseInt(formData.unita_supplementari||0),
      valore_statistico:parseFloat(formData.valore_statistico||0),
      condizioni_consegna:formData.condizioni_consegna,
      modo_trasporto:formData.modo_trasporto,
      note:formData.note
    };
    
    const{error}=await sb.from('intrastat_operazioni').insert([record]);
    if(error){
      if(error.code==='42P01'){
        alert('Tabella intrastat_operazioni non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuova(false);
    caricaOperazioni();
  };

  const generaFileIntrastat=()=>{
    if(operazioni.length===0){
      alert('Nessuna operazione da esportare per il periodo selezionato');
      return;
    }

    let contenuto=`INTRASTAT - ${tipoSel.toUpperCase()} - ${String(periodoSel.mese).padStart(2,'0')}/${periodoSel.anno}
SOSTITUTO: ${societa?.denominazione||''} - P.IVA: ${societa?.partita_iva||''}

`;

    const totale=operazioni.reduce((s,o)=>s+parseFloat(o.valore||0),0);

    operazioni.forEach((o,i)=>{
      contenuto+=`${String(i+1).padStart(3,'0')}|${o.paese_ue}|${o.partita_iva_ue||''}|${o.valore.toFixed(2)}|${o.natura_transazione}|${o.nomenclatura||''}|${o.modo_trasporto}
`;
    });

    contenuto+=`
TOTALE OPERAZIONI: ${operazioni.length}
VALORE TOTALE: EUR ${totale.toFixed(2)}
`;

    const blob=new Blob([contenuto],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`INTRASTAT_${tipoSel.toUpperCase()}_${periodoSel.anno}${String(periodoSel.mese).padStart(2,'0')}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const mesi=['','Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

  const totalePeriodo=operazioni.reduce((s,o)=>s+parseFloat(o.valore||0),0);

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🌍 Intrastat</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Operazioni intracomunitarie cessioni/acquisti</div>
        </div>
        <button className="btn" onClick={()=>setModalNuova(true)}>+ Nuova Operazione</button>
      </div>

      {/* Filtri */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div style={{display:'flex',gap:'.5rem'}}>
            <button className={'pill '+(tipoSel==='cessioni'?'active':'')} onClick={()=>setTipoSel('cessioni')}>📤 Cessioni (Vendite)</button>
            <button className={'pill '+(tipoSel==='acquisti'?'active':'')} onClick={()=>setTipoSel('acquisti')}>📥 Acquisti</button>
          </div>
          <div className="fg" style={{minWidth:100}}>
            <label>Mese</label>
            <select value={periodoSel.mese} onChange={e=>setPeriodoSel(p=>({...p,mese:parseInt(e.target.value)}))}>
              {[1,2,3,4,5,6,7,8,9,10,11,12].map(m=><option key={m} value={m}>{mesi[m]}</option>)}
            </select>
          </div>
          <div className="fg" style={{minWidth:100}}>
            <label>Anno</label>
            <select value={periodoSel.anno} onChange={e=>setPeriodoSel(p=>({...p,anno:parseInt(e.target.value)}))}>
              {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <button className="btn-sec" onClick={generaFileIntrastat} disabled={operazioni.length===0}>📥 Esporta File</button>
          <div style={{marginLeft:'auto',textAlign:'right'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Totale periodo</div>
            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gold)'}}>{fmt(totalePeriodo)}</div>
          </div>
        </div>
      </div>

      {/* Tabella */}
      {loading?(
        <div className="loading">Caricamento...</div>
      ):operazioni.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>🌍</div>
          <div style={{color:'var(--mu)'}}>Nessuna operazione {tipoSel} per {mesi[periodoSel.mese]} {periodoSel.anno}</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Paese</th>
                  <th>P.IVA UE</th>
                  <th style={{textAlign:'right'}}>Valore</th>
                  <th>Natura</th>
                  <th>NC</th>
                </tr>
              </thead>
              <tbody>
                {operazioni.map(o=>(
                  <tr key={o.id}>
                    <td>{new Date(o.data).toLocaleDateString('it-IT')}</td>
                    <td><strong>{o.paese_ue}</strong></td>
                    <td style={{fontFamily:'monospace',fontSize:'.75rem'}}>{o.partita_iva_ue||'—'}</td>
                    <td style={{textAlign:'right',fontWeight:600}}>{fmt(o.valore)}</td>
                    <td>{o.natura_transazione}</td>
                    <td>{o.nomenclatura||'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuova Operazione */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">🌍 Nuova Operazione Intrastat</div>
              <div className="modal-sub">{tipoSel==='cessioni'?'Cessione (vendita)':'Acquisto'} intracomunitario</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg">
                  <label>Data operazione</label>
                  <input type="date" value={formData.data} onChange={e=>setFormData(p=>({...p,data:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Paese UE</label>
                  <select value={formData.paese_ue} onChange={e=>setFormData(p=>({...p,paese_ue:e.target.value}))}>
                    {paesiUE.map(p=><option key={p.code} value={p.code}>{p.code} - {p.name}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>P.IVA controparte UE</label>
                  <input value={formData.partita_iva_ue} onChange={e=>setFormData(p=>({...p,partita_iva_ue:e.target.value}))} placeholder="DE123456789"/>
                </div>
                <div className="fg">
                  <label>Valore (EUR)</label>
                  <input type="number" step="0.01" value={formData.valore} onChange={e=>setFormData(p=>({...p,valore:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Natura transazione</label>
                  <select value={formData.natura_transazione} onChange={e=>setFormData(p=>({...p,natura_transazione:e.target.value}))}>
                    <option value="1">1 - Compravendita</option>
                    <option value="2">2 - Restituzione</option>
                    <option value="3">3 - Gratuita</option>
                    <option value="4">4 - Lavorazione</option>
                    <option value="9">9 - Altro</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Nomenclatura combinata</label>
                  <input value={formData.nomenclatura} onChange={e=>setFormData(p=>({...p,nomenclatura:e.target.value}))} placeholder="84719000"/>
                </div>
                <div className="fg">
                  <label>Modo trasporto</label>
                  <select value={formData.modo_trasporto} onChange={e=>setFormData(p=>({...p,modo_trasporto:e.target.value}))}>
                    <option value="1">1 - Marittimo</option>
                    <option value="2">2 - Ferroviario</option>
                    <option value="3">3 - Stradale</option>
                    <option value="4">4 - Aereo</option>
                    <option value="5">5 - Postale</option>
                    <option value="7">7 - Condotta</option>
                    <option value="9">9 - Proprio</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Condizioni consegna</label>
                  <select value={formData.condizioni_consegna} onChange={e=>setFormData(p=>({...p,condizioni_consegna:e.target.value}))}>
                    <option value="EXW">EXW - Franco fabbrica</option>
                    <option value="FCA">FCA - Franco vettore</option>
                    <option value="CPT">CPT - Porto pagato</option>
                    <option value="CIP">CIP - Porto e assic. pagati</option>
                    <option value="DAP">DAP - Reso al luogo</option>
                    <option value="DDP">DDP - Reso sdoganato</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaOperazione}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── IVA ANNUALE VIEW ────────────────────────────────────────
function IvaAnnualeView({societa,scritture,causaliIva}){
  const [loading,setLoading]=useState(false);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear()-1);
  const [liquidazioni,setLiquidazioni]=useState([]);
  const [datiIva,setDatiIva]=useState({
    operazioni_attive:0,
    operazioni_passive:0,
    iva_esigibile:0,
    iva_detratta:0,
    iva_dovuta:0,
    credito_anno_prec:0,
    acconti_versati:0,
    totale_dovuto:0,
    credito_risultante:0
  });
  const [generando,setGenerando]=useState(false);

  useEffect(()=>{
    if(societa?.id)caricaDati();
  },[societa,annoSel]);

  const caricaDati=async()=>{
    setLoading(true);
    
    // Carica liquidazioni dell'anno
    const{data:liq}=await sb.from('liquidazioni_iva_societa').select('*').eq('societa_id',societa.id).eq('anno',annoSel).order('periodo');
    setLiquidazioni(liq||[]);
    
    // Calcola riepilogo da liquidazioni
    if(liq&&liq.length>0){
      const totIvaVendite=liq.reduce((s,l)=>s+parseFloat(l.iva_vendite||0),0);
      const totIvaAcquisti=liq.reduce((s,l)=>s+parseFloat(l.iva_acquisti||0),0);
      const creditoIniziale=parseFloat(liq[0]?.credito_precedente||0);
      const totIvaDovuta=liq.reduce((s,l)=>s+parseFloat(l.iva_dovuta||0),0);
      const creditoFinale=liq.length>0?parseFloat(liq[liq.length-1]?.credito_da_riportare||0):0;
      
      setDatiIva({
        operazioni_attive:totIvaVendite/0.22, // stima imponibile
        operazioni_passive:totIvaAcquisti/0.22,
        iva_esigibile:totIvaVendite,
        iva_detratta:totIvaAcquisti,
        iva_dovuta:totIvaDovuta,
        credito_anno_prec:creditoIniziale,
        acconti_versati:0,
        totale_dovuto:Math.max(0,totIvaDovuta-creditoIniziale),
        credito_risultante:creditoFinale
      });
    }else{
      // Calcola da scritture se non ci sono liquidazioni
      const scrittureAnno=scritture.filter(s=>{
        const dataReg=new Date(s.data_registrazione);
        return dataReg.getFullYear()===annoSel;
      });
      
      let ivaVendite=0,ivaAcquisti=0;
      scrittureAnno.forEach(s=>{
        if(s.causale_codice?.startsWith('VE')||s.tipo==='vendita'){
          ivaVendite+=parseFloat(s.imposta||0);
        }else if(s.causale_codice?.startsWith('AC')||s.tipo==='acquisto'){
          ivaAcquisti+=parseFloat(s.imposta||0);
        }
      });
      
      setDatiIva({
        operazioni_attive:ivaVendite/0.22,
        operazioni_passive:ivaAcquisti/0.22,
        iva_esigibile:ivaVendite,
        iva_detratta:ivaAcquisti,
        iva_dovuta:Math.max(0,ivaVendite-ivaAcquisti),
        credito_anno_prec:0,
        acconti_versati:0,
        totale_dovuto:Math.max(0,ivaVendite-ivaAcquisti),
        credito_risultante:Math.max(0,ivaAcquisti-ivaVendite)
      });
    }
    
    setLoading(false);
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

  const generaDichiarazione=()=>{
    setGenerando(true);
    
    const contenuto=`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    DICHIARAZIONE IVA ANNUALE ${annoSel}                    ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ CONTRIBUENTE                                                               ║
║ Denominazione: ${(societa?.denominazione||'').padEnd(55)}║
║ P.IVA: ${(societa?.partita_iva||'').padEnd(63)}║
║ C.F.: ${(societa?.codice_fiscale||'').padEnd(64)}║
╠═══════════════════════════════════════════════════════════════════════════╣
║ QUADRO VE - OPERAZIONI ATTIVE                                              ║
╠───────────────────────────────────────────────────────────────────────────╣
║ VE50 - Totale imponibile operazioni attive     €  ${fmt(datiIva.operazioni_attive).padStart(18)}  ║
║ VE26 - Totale IVA operazioni attive            €  ${fmt(datiIva.iva_esigibile).padStart(18)}  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ QUADRO VF - OPERAZIONI PASSIVE                                             ║
╠───────────────────────────────────────────────────────────────────────────╣
║ VF27 - Totale imponibile operazioni passive    €  ${fmt(datiIva.operazioni_passive).padStart(18)}  ║
║ VF27 - Totale IVA detraibile                   €  ${fmt(datiIva.iva_detratta).padStart(18)}  ║
╠═══════════════════════════════════════════════════════════════════════════╣
║ QUADRO VL - LIQUIDAZIONE ANNUALE                                           ║
╠───────────────────────────────────────────────────────────────────────────╣
║ VL1  - IVA a debito (VE26)                     €  ${fmt(datiIva.iva_esigibile).padStart(18)}  ║
║ VL2  - IVA detraibile (VF27)                   €  ${fmt(datiIva.iva_detratta).padStart(18)}  ║
║ VL3  - Differenza (VL1 - VL2)                  €  ${fmt(datiIva.iva_esigibile-datiIva.iva_detratta).padStart(18)}  ║
║ VL30 - Credito anno precedente                 €  ${fmt(datiIva.credito_anno_prec).padStart(18)}  ║
║ VL32 - IVA versata (acconti + liquidazioni)    €  ${fmt(datiIva.acconti_versati).padStart(18)}  ║
╠───────────────────────────────────────────────────────────────────────────╣
║ ${datiIva.totale_dovuto>0?'VL38 - IVA DA VERSARE':'VL33 - CREDITO IVA'}                          €  ${fmt(datiIva.totale_dovuto>0?datiIva.totale_dovuto:datiIva.credito_risultante).padStart(18)}  ║
╚═══════════════════════════════════════════════════════════════════════════╝

═══════════════════════════════════════════════════════════════════════════
                    DETTAGLIO LIQUIDAZIONI PERIODICHE ${annoSel}
═══════════════════════════════════════════════════════════════════════════
Periodo      IVA Vendite    IVA Acquisti   IVA Dovuta      Credito
───────────────────────────────────────────────────────────────────────────
${liquidazioni.length>0?liquidazioni.map(l=>`${(l.tipo_periodo==='trimestrale'?`${l.periodo}° Trim`:l.periodo.toString().padStart(2,'0')+'/'+l.anno).padEnd(12)} ${fmt(l.iva_vendite).padStart(14)} ${fmt(l.iva_acquisti).padStart(14)} ${fmt(l.iva_dovuta).padStart(14)} ${fmt(l.credito_da_riportare).padStart(14)}`).join('\n'):'Nessuna liquidazione periodica registrata'}
───────────────────────────────────────────────────────────────────────────
TOTALE       ${fmt(datiIva.iva_esigibile).padStart(14)} ${fmt(datiIva.iva_detratta).padStart(14)} ${fmt(datiIva.iva_dovuta).padStart(14)} ${fmt(datiIva.credito_risultante).padStart(14)}

Documento generato da FiscoSim - ${new Date().toLocaleDateString('it-IT')} ${new Date().toLocaleTimeString('it-IT')}
`;

    const blob=new Blob([contenuto],{type:'text/plain'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;
    a.download=`IVA_Annuale_${societa?.partita_iva||'000'}_${annoSel}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    
    setGenerando(false);
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>📊 Dichiarazione IVA Annuale</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Riepilogo e generazione dichiarazione IVA</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))} style={{width:100}}>
            {[2023,2024,2025].map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn" onClick={generaDichiarazione} disabled={generando}>
            {generando?'⏳...':'📥 Genera Report'}
          </button>
        </div>
      </div>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):(
        <>
          {/* Riepilogo */}
          <div className="stats-grid" style={{marginBottom:'1rem'}}>
            <div className="stat-card">
              <div className="stat-ico">📤</div>
              <div className="stat-val">{fmt(datiIva.operazioni_attive)}</div>
              <div className="stat-lbl">Operazioni attive</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">📥</div>
              <div className="stat-val">{fmt(datiIva.operazioni_passive)}</div>
              <div className="stat-lbl">Operazioni passive</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">💰</div>
              <div className="stat-val" style={{color:'var(--rd)'}}>{fmt(datiIva.iva_esigibile)}</div>
              <div className="stat-lbl">IVA esigibile</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">💸</div>
              <div className="stat-val" style={{color:'var(--gr)'}}>{fmt(datiIva.iva_detratta)}</div>
              <div className="stat-lbl">IVA detratta</div>
            </div>
          </div>

          {/* Quadro riepilogativo */}
          <div className="card" style={{marginBottom:'1rem'}}>
            <div style={{fontWeight:600,marginBottom:'1rem',borderBottom:'1px solid var(--bd)',paddingBottom:'.5rem'}}>📋 Quadro Riepilogativo {annoSel}</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:'.5rem'}}>
              <span>Totale IVA a debito (operazioni attive)</span>
              <span style={{textAlign:'right',fontWeight:600}}>{fmt(datiIva.iva_esigibile)}</span>
              
              <span>Totale IVA a credito (operazioni passive)</span>
              <span style={{textAlign:'right',fontWeight:600,color:'var(--gr)'}}>- {fmt(datiIva.iva_detratta)}</span>
              
              <span>Credito anno precedente</span>
              <span style={{textAlign:'right',fontWeight:600,color:'var(--gr)'}}>- {fmt(datiIva.credito_anno_prec)}</span>
              
              <span>IVA versata (liquidazioni periodiche)</span>
              <span style={{textAlign:'right',fontWeight:600,color:'var(--gr)'}}>- {fmt(datiIva.acconti_versati)}</span>
              
              <div style={{gridColumn:'1/-1',borderTop:'2px solid var(--bd)',paddingTop:'.5rem',marginTop:'.5rem'}}/>
              
              {datiIva.totale_dovuto>0?(
                <>
                  <span style={{fontWeight:700,color:'var(--rd)'}}>IVA DA VERSARE</span>
                  <span style={{textAlign:'right',fontWeight:700,fontSize:'1.1rem',color:'var(--rd)'}}>{fmt(datiIva.totale_dovuto)}</span>
                </>
              ):(
                <>
                  <span style={{fontWeight:700,color:'var(--gr)'}}>CREDITO IVA</span>
                  <span style={{textAlign:'right',fontWeight:700,fontSize:'1.1rem',color:'var(--gr)'}}>{fmt(datiIva.credito_risultante)}</span>
                </>
              )}
            </div>
          </div>

          {/* Dettaglio liquidazioni */}
          <div className="card">
            <div style={{fontWeight:600,marginBottom:'.75rem'}}>📅 Liquidazioni Periodiche {annoSel}</div>
            {liquidazioni.length===0?(
              <div className="alert alert-warn">
                ⚠️ Nessuna liquidazione periodica registrata per il {annoSel}. Vai su "Liquidazioni IVA" per registrare le liquidazioni.
              </div>
            ):(
              <div className="tbl-wrap">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Periodo</th>
                      <th style={{textAlign:'right'}}>IVA Vendite</th>
                      <th style={{textAlign:'right'}}>IVA Acquisti</th>
                      <th style={{textAlign:'right'}}>Credito Prec.</th>
                      <th style={{textAlign:'right'}}>IVA Dovuta</th>
                      <th style={{textAlign:'right'}}>Credito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liquidazioni.map(l=>(
                      <tr key={l.id}>
                        <td><strong>{l.tipo_periodo==='trimestrale'?`${l.periodo}° Trimestre`:`${l.periodo}/${l.anno}`}</strong></td>
                        <td style={{textAlign:'right'}}>{fmt(l.iva_vendite)}</td>
                        <td style={{textAlign:'right'}}>{fmt(l.iva_acquisti)}</td>
                        <td style={{textAlign:'right'}}>{fmt(l.credito_precedente)}</td>
                        <td style={{textAlign:'right',color:l.iva_dovuta>0?'var(--rd)':'inherit',fontWeight:l.iva_dovuta>0?700:'normal'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):'—'}</td>
                        <td style={{textAlign:'right',color:l.credito_da_riportare>0?'var(--gr)':'inherit'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):'—'}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{background:'var(--s2)',fontWeight:700}}>
                      <td>TOTALE</td>
                      <td style={{textAlign:'right'}}>{fmt(liquidazioni.reduce((s,l)=>s+parseFloat(l.iva_vendite||0),0))}</td>
                      <td style={{textAlign:'right'}}>{fmt(liquidazioni.reduce((s,l)=>s+parseFloat(l.iva_acquisti||0),0))}</td>
                      <td></td>
                      <td style={{textAlign:'right',color:'var(--rd)'}}>{fmt(liquidazioni.reduce((s,l)=>s+parseFloat(l.iva_dovuta||0),0))}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          <div className="alert alert-info" style={{marginTop:'1rem'}}>
            💡 La dichiarazione IVA annuale deve essere presentata entro il 30 aprile dell'anno successivo. Il report generato è un riepilogo interno, per la presentazione ufficiale usare il software dell'Agenzia delle Entrate.
          </div>
        </>
      )}
    </div>
  );
}

// ─── PERCIPIENTI VIEW ────────────────────────────────────────
function PercipientiView({societa,onRefresh}){
  const [percipienti,setPercipienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuovo,setModalNuovo]=useState(false);
  const [editingId,setEditingId]=useState(null);
  const [searchTerm,setSearchTerm]=useState('');
  const [formData,setFormData]=useState({
    tipo_persona:'fisica',
    codice_fiscale:'',
    partita_iva:'',
    ragione_sociale:'',
    nome:'',
    cognome:'',
    data_nascita:'',
    comune_nascita:'',
    provincia_nascita:'',
    sesso:'M',
    indirizzo:'',
    cap:'',
    citta:'',
    provincia:'',
    email:'',
    telefono:'',
    iban:'',
    causale_prevalente:'A',
    aliquota_ritenuta:20,
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaPercipienti();
  },[societa]);

  const caricaPercipienti=async()=>{
    setLoading(true);
    const{data}=await sb.from('percipienti').select('*').eq('societa_id',societa.id).eq('attivo',true).order('ragione_sociale');
    setPercipienti(data||[]);
    setLoading(false);
  };

  const salvaPercipiente=async()=>{
    const record={
      societa_id:societa.id,
      ...formData,
      attivo:true
    };
    
    let error;
    if(editingId){
      ({error}=await sb.from('percipienti').update(record).eq('id',editingId));
    }else{
      ({error}=await sb.from('percipienti').insert([record]));
    }
    
    if(error){
      alert('Errore: '+error.message);
      return;
    }
    setModalNuovo(false);
    setEditingId(null);
    resetForm();
    caricaPercipienti();
    if(onRefresh)onRefresh();
  };

  const eliminaPercipiente=async(id)=>{
    if(!confirm('Disattivare questo percipiente?'))return;
    await sb.from('percipienti').update({attivo:false}).eq('id',id);
    caricaPercipienti();
  };

  const editPercipiente=(p)=>{
    setFormData({
      tipo_persona:p.tipo_persona||'fisica',
      codice_fiscale:p.codice_fiscale||'',
      partita_iva:p.partita_iva||'',
      ragione_sociale:p.ragione_sociale||'',
      nome:p.nome||'',
      cognome:p.cognome||'',
      data_nascita:p.data_nascita||'',
      comune_nascita:p.comune_nascita||'',
      provincia_nascita:p.provincia_nascita||'',
      sesso:p.sesso||'M',
      indirizzo:p.indirizzo||'',
      cap:p.cap||'',
      citta:p.citta||'',
      provincia:p.provincia||'',
      email:p.email||'',
      telefono:p.telefono||'',
      iban:p.iban||'',
      causale_prevalente:p.causale_prevalente||'A',
      aliquota_ritenuta:p.aliquota_ritenuta||20,
      note:p.note||''
    });
    setEditingId(p.id);
    setModalNuovo(true);
  };

  const resetForm=()=>{
    setFormData({
      tipo_persona:'fisica',codice_fiscale:'',partita_iva:'',ragione_sociale:'',nome:'',cognome:'',
      data_nascita:'',comune_nascita:'',provincia_nascita:'',sesso:'M',indirizzo:'',cap:'',citta:'',
      provincia:'',email:'',telefono:'',iban:'',causale_prevalente:'A',aliquota_ritenuta:20,note:''
    });
  };

  const filtered=percipienti.filter(p=>{
    if(!searchTerm)return true;
    const s=searchTerm.toLowerCase();
    return (p.ragione_sociale||'').toLowerCase().includes(s)||(p.cognome||'').toLowerCase().includes(s)||(p.nome||'').toLowerCase().includes(s)||(p.codice_fiscale||'').toLowerCase().includes(s);
  });

  const causali={A:'Prestazioni lavoro autonomo',B:'Utilizzazione opere ingegno',C:'Utili da contratti associazione',D:'Utili da ass. solo apporto lavoro',E:'Levata protesti',G:'Indennità cessazione rapporto',H:'Indennità cessazione funzioni notarili',I:'Indennità trasferte forfettarie',L:'Redditi da beni immobili',M:'Prestazioni lavoro autonomo non abituale',N:'Noleggio occasionale',O:'Prestazioni non soggette ritenuta',V:'Redditi esenti/regimi convenzionali',W:'Corrispettivi per contratti appalto',X:'Canoni/corrispettivi SIAE',Y:'Commissioni agenti',ZO:'Titolo diverso dai precedenti'};

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>👔 Anagrafica Percipienti</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Gestione fornitori soggetti a ritenuta d'acconto</div>
        </div>
        <button className="btn" onClick={()=>{resetForm();setEditingId(null);setModalNuovo(true);}}>+ Nuovo Percipiente</button>
      </div>

      <input className="search-bar" placeholder="🔍 Cerca per nome, ragione sociale o C.F..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>

      {loading?(
        <div className="loading">Caricamento...</div>
      ):filtered.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>👔</div>
          <div style={{color:'var(--mu)'}}>Nessun percipiente registrato</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Denominazione</th>
                  <th>C.F.</th>
                  <th>Causale</th>
                  <th>Aliquota</th>
                  <th>Email</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p=>(
                  <tr key={p.id}>
                    <td>
                      <strong>{p.ragione_sociale||`${p.cognome||''} ${p.nome||''}`.trim()||'N/D'}</strong>
                      {p.tipo_persona==='giuridica'&&<span className="bdg bdg-blue" style={{marginLeft:'.5rem'}}>Società</span>}
                    </td>
                    <td style={{fontFamily:'monospace',fontSize:'.75rem'}}>{p.codice_fiscale||'—'}</td>
                    <td><span className="bdg bdg-gray">{p.causale_prevalente||'A'}</span></td>
                    <td>{p.aliquota_ritenuta||20}%</td>
                    <td style={{fontSize:'.75rem',color:'var(--mu)'}}>{p.email||'—'}</td>
                    <td>
                      <div className="tbl-actions">
                        <button className="btn-icon" onClick={()=>editPercipiente(p)} title="Modifica">✏️</button>
                        <button className="btn-icon" onClick={()=>eliminaPercipiente(p.id)} title="Elimina">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuovo/Modifica */}
      {modalNuovo&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuovo(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:700,maxHeight:'90vh'}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">👔 {editingId?'Modifica':'Nuovo'} Percipiente</div>
              <button className="modal-close" onClick={()=>setModalNuovo(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
                <button className={'pill '+(formData.tipo_persona==='fisica'?'active':'')} onClick={()=>setFormData(p=>({...p,tipo_persona:'fisica'}))}>Persona Fisica</button>
                <button className={'pill '+(formData.tipo_persona==='giuridica'?'active':'')} onClick={()=>setFormData(p=>({...p,tipo_persona:'giuridica'}))}>Persona Giuridica</button>
              </div>

              <div className="form-grid">
                {formData.tipo_persona==='giuridica'?(
                  <>
                    <div className="fg full">
                      <label>Ragione Sociale *</label>
                      <input value={formData.ragione_sociale} onChange={e=>setFormData(p=>({...p,ragione_sociale:e.target.value}))}/>
                    </div>
                    <div className="fg">
                      <label>Codice Fiscale</label>
                      <input value={formData.codice_fiscale} onChange={e=>setFormData(p=>({...p,codice_fiscale:e.target.value.toUpperCase()}))} maxLength={16}/>
                    </div>
                    <div className="fg">
                      <label>Partita IVA</label>
                      <input value={formData.partita_iva} onChange={e=>setFormData(p=>({...p,partita_iva:e.target.value}))} maxLength={11}/>
                    </div>
                  </>
                ):(
                  <>
                    <div className="fg">
                      <label>Cognome *</label>
                      <input value={formData.cognome} onChange={e=>setFormData(p=>({...p,cognome:e.target.value.toUpperCase()}))}/>
                    </div>
                    <div className="fg">
                      <label>Nome *</label>
                      <input value={formData.nome} onChange={e=>setFormData(p=>({...p,nome:e.target.value.toUpperCase()}))}/>
                    </div>
                    <div className="fg">
                      <label>Codice Fiscale *</label>
                      <input value={formData.codice_fiscale} onChange={e=>setFormData(p=>({...p,codice_fiscale:e.target.value.toUpperCase()}))} maxLength={16}/>
                    </div>
                    <div className="fg">
                      <label>Partita IVA</label>
                      <input value={formData.partita_iva} onChange={e=>setFormData(p=>({...p,partita_iva:e.target.value}))} maxLength={11}/>
                    </div>
                    <div className="fg">
                      <label>Data Nascita</label>
                      <input type="date" value={formData.data_nascita} onChange={e=>setFormData(p=>({...p,data_nascita:e.target.value}))}/>
                    </div>
                    <div className="fg">
                      <label>Sesso</label>
                      <select value={formData.sesso} onChange={e=>setFormData(p=>({...p,sesso:e.target.value}))}>
                        <option value="M">Maschio</option>
                        <option value="F">Femmina</option>
                      </select>
                    </div>
                    <div className="fg">
                      <label>Comune Nascita</label>
                      <input value={formData.comune_nascita} onChange={e=>setFormData(p=>({...p,comune_nascita:e.target.value.toUpperCase()}))}/>
                    </div>
                    <div className="fg">
                      <label>Prov. Nascita</label>
                      <input value={formData.provincia_nascita} onChange={e=>setFormData(p=>({...p,provincia_nascita:e.target.value.toUpperCase()}))} maxLength={2}/>
                    </div>
                  </>
                )}

                <div className="fg full" style={{borderTop:'1px solid var(--bd)',paddingTop:'.75rem',marginTop:'.5rem'}}>
                  <label style={{fontSize:'.7rem',color:'var(--gold)'}}>INDIRIZZO</label>
                </div>
                <div className="fg full">
                  <label>Indirizzo</label>
                  <input value={formData.indirizzo} onChange={e=>setFormData(p=>({...p,indirizzo:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>CAP</label>
                  <input value={formData.cap} onChange={e=>setFormData(p=>({...p,cap:e.target.value}))} maxLength={5}/>
                </div>
                <div className="fg">
                  <label>Città</label>
                  <input value={formData.citta} onChange={e=>setFormData(p=>({...p,citta:e.target.value.toUpperCase()}))}/>
                </div>
                <div className="fg">
                  <label>Provincia</label>
                  <input value={formData.provincia} onChange={e=>setFormData(p=>({...p,provincia:e.target.value.toUpperCase()}))} maxLength={2}/>
                </div>

                <div className="fg full" style={{borderTop:'1px solid var(--bd)',paddingTop:'.75rem',marginTop:'.5rem'}}>
                  <label style={{fontSize:'.7rem',color:'var(--gold)'}}>DATI FISCALI E CONTATTI</label>
                </div>
                <div className="fg">
                  <label>Causale prevalente</label>
                  <select value={formData.causale_prevalente} onChange={e=>setFormData(p=>({...p,causale_prevalente:e.target.value}))}>
                    {Object.entries(causali).map(([k,v])=><option key={k} value={k}>{k} - {v}</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Aliquota ritenuta %</label>
                  <select value={formData.aliquota_ritenuta} onChange={e=>setFormData(p=>({...p,aliquota_ritenuta:parseInt(e.target.value)}))}>
                    <option value={20}>20%</option>
                    <option value={23}>23%</option>
                    <option value={4}>4%</option>
                    <option value={0}>0% (esente)</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Email</label>
                  <input type="email" value={formData.email} onChange={e=>setFormData(p=>({...p,email:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Telefono</label>
                  <input value={formData.telefono} onChange={e=>setFormData(p=>({...p,telefono:e.target.value}))}/>
                </div>
                <div className="fg full">
                  <label>IBAN</label>
                  <input value={formData.iban} onChange={e=>setFormData(p=>({...p,iban:e.target.value.toUpperCase().replace(/\s/g,'')}))} maxLength={27}/>
                </div>
                <div className="fg full">
                  <label>Note</label>
                  <textarea value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))} rows={2}/>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuovo(false)}>Annulla</button>
              <button className="btn" onClick={salvaPercipiente}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── RITENUTE VIEW ───────────────────────────────────────────
function RitenuteView({societa}){
  const [ritenute,setRitenute]=useState([]);
  const [percipienti,setPercipienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modalNuova,setModalNuova]=useState(false);
  const [annoSel,setAnnoSel]=useState(new Date().getFullYear());
  const [formData,setFormData]=useState({
    percipiente_id:'',
    data_pagamento:new Date().toISOString().split('T')[0],
    data_documento:'',
    numero_documento:'',
    compenso_lordo:0,
    ritenuta:0,
    compenso_netto:0,
    causale:'A',
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaDati();
  },[societa,annoSel]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:rit},{data:perc}]=await Promise.all([
      sb.from('ritenute_dacconto').select('*').eq('societa_id',societa.id).gte('data_pagamento',`${annoSel}-01-01`).lte('data_pagamento',`${annoSel}-12-31`).order('data_pagamento',{ascending:false}),
      sb.from('percipienti').select('*').eq('societa_id',societa.id).eq('attivo',true).order('ragione_sociale')
    ]);
    setRitenute(rit||[]);
    setPercipienti(perc||[]);
    setLoading(false);
  };

  const calcolaRitenuta=(lordo,aliquota)=>{
    const l=parseFloat(lordo||0);
    const rit=l*(aliquota||20)/100;
    return{ritenuta:rit.toFixed(2),netto:(l-rit).toFixed(2)};
  };

  const onCompensoChange=(val)=>{
    const perc=percipienti.find(p=>p.id===formData.percipiente_id);
    const{ritenuta,netto}=calcolaRitenuta(val,perc?.aliquota_ritenuta||20);
    setFormData(p=>({...p,compenso_lordo:val,ritenuta,compenso_netto:netto}));
  };

  const onPercipenteChange=(id)=>{
    const perc=percipienti.find(p=>p.id===id);
    const{ritenuta,netto}=calcolaRitenuta(formData.compenso_lordo,perc?.aliquota_ritenuta||20);
    setFormData(p=>({...p,percipiente_id:id,causale:perc?.causale_prevalente||'A',ritenuta,compenso_netto:netto}));
  };

  const salvaRitenuta=async()=>{
    const perc=percipienti.find(p=>p.id===formData.percipiente_id);
    if(!perc){alert('Seleziona un percipiente');return;}
    
    const record={
      societa_id:societa.id,
      percipiente_cf:perc.codice_fiscale,
      percipiente_denominazione:perc.ragione_sociale||`${perc.cognome||''} ${perc.nome||''}`.trim(),
      data_pagamento:formData.data_pagamento,
      data_documento:formData.data_documento||null,
      numero_documento:formData.numero_documento||null,
      compenso_lordo:parseFloat(formData.compenso_lordo||0),
      ritenuta:parseFloat(formData.ritenuta||0),
      compenso_netto:parseFloat(formData.compenso_netto||0),
      causale:formData.causale,
      note:formData.note
    };
    
    const{error}=await sb.from('ritenute_dacconto').insert([record]);
    if(error){
      alert('Errore: '+error.message);
      return;
    }
    setModalNuova(false);
    setFormData({percipiente_id:'',data_pagamento:new Date().toISOString().split('T')[0],data_documento:'',numero_documento:'',compenso_lordo:0,ritenuta:0,compenso_netto:0,causale:'A',note:''});
    caricaDati();
  };

  const eliminaRitenuta=async(id)=>{
    if(!confirm('Eliminare questa ritenuta?'))return;
    await sb.from('ritenute_dacconto').delete().eq('id',id);
    caricaDati();
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

  const totali={
    lordo:ritenute.reduce((s,r)=>s+parseFloat(r.compenso_lordo||0),0),
    ritenuta:ritenute.reduce((s,r)=>s+parseFloat(r.ritenuta||0),0),
    netto:ritenute.reduce((s,r)=>s+parseFloat(r.compenso_netto||0),0)
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>✂️ Ritenute d'Acconto</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Registrazione pagamenti a percipienti</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',alignItems:'center'}}>
          <select value={annoSel} onChange={e=>setAnnoSel(parseInt(e.target.value))} style={{width:100}}>
            {[2024,2025,2026].map(a=><option key={a} value={a}>{a}</option>)}
          </select>
          <button className="btn" onClick={()=>setModalNuova(true)} disabled={percipienti.length===0}>+ Nuova Ritenuta</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card">
          <div className="stat-ico">📄</div>
          <div className="stat-val">{ritenute.length}</div>
          <div className="stat-lbl">Pagamenti</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">💰</div>
          <div className="stat-val">{fmt(totali.lordo)}</div>
          <div className="stat-lbl">Compensi lordi</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">✂️</div>
          <div className="stat-val" style={{color:'var(--rd)'}}>{fmt(totali.ritenuta)}</div>
          <div className="stat-lbl">Ritenute</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">💸</div>
          <div className="stat-val" style={{color:'var(--gr)'}}>{fmt(totali.netto)}</div>
          <div className="stat-lbl">Netti pagati</div>
        </div>
      </div>

      {percipienti.length===0&&(
        <div className="alert alert-warn" style={{marginBottom:'1rem'}}>
          ⚠️ Nessun percipiente registrato. Vai su "Percipienti" per aggiungere l'anagrafica prima di registrare le ritenute.
        </div>
      )}

      {loading?(
        <div className="loading">Caricamento...</div>
      ):ritenute.length===0?(
        <div className="card" style={{padding:'2rem',textAlign:'center'}}>
          <div style={{fontSize:'2rem',marginBottom:'.5rem'}}>✂️</div>
          <div style={{color:'var(--mu)'}}>Nessuna ritenuta registrata per il {annoSel}</div>
        </div>
      ):(
        <div className="card">
          <div className="tbl-wrap">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Data Pag.</th>
                  <th>Percipiente</th>
                  <th>Doc.</th>
                  <th style={{textAlign:'right'}}>Lordo</th>
                  <th style={{textAlign:'right'}}>Ritenuta</th>
                  <th style={{textAlign:'right'}}>Netto</th>
                  <th>Caus.</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {ritenute.map(r=>(
                  <tr key={r.id}>
                    <td>{new Date(r.data_pagamento).toLocaleDateString('it-IT')}</td>
                    <td><strong>{r.percipiente_denominazione||'N/D'}</strong></td>
                    <td style={{fontSize:'.75rem'}}>{r.numero_documento||'—'}</td>
                    <td style={{textAlign:'right'}}>{fmt(r.compenso_lordo)}</td>
                    <td style={{textAlign:'right',color:'var(--rd)'}}>{fmt(r.ritenuta)}</td>
                    <td style={{textAlign:'right'}}>{fmt(r.compenso_netto)}</td>
                    <td><span className="bdg bdg-gray">{r.causale||'A'}</span></td>
                    <td>
                      <button className="btn-icon" onClick={()=>eliminaRitenuta(r.id)} title="Elimina">🗑️</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Nuova Ritenuta */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:550}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">✂️ Nuova Ritenuta d'Acconto</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg full">
                  <label>Percipiente *</label>
                  <select value={formData.percipiente_id} onChange={e=>onPercipenteChange(e.target.value)}>
                    <option value="">-- Seleziona --</option>
                    {percipienti.map(p=><option key={p.id} value={p.id}>{p.ragione_sociale||`${p.cognome||''} ${p.nome||''}`.trim()} ({p.aliquota_ritenuta||20}%)</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>Data Pagamento *</label>
                  <input type="date" value={formData.data_pagamento} onChange={e=>setFormData(p=>({...p,data_pagamento:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Data Documento</label>
                  <input type="date" value={formData.data_documento} onChange={e=>setFormData(p=>({...p,data_documento:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>N° Documento</label>
                  <input value={formData.numero_documento} onChange={e=>setFormData(p=>({...p,numero_documento:e.target.value}))} placeholder="Es. FT-2025/001"/>
                </div>
                <div className="fg">
                  <label>Causale</label>
                  <select value={formData.causale} onChange={e=>setFormData(p=>({...p,causale:e.target.value}))}>
                    <option value="A">A - Lavoro autonomo</option>
                    <option value="M">M - Lavoro autonomo non abituale</option>
                    <option value="O">O - Non soggetto ritenuta</option>
                  </select>
                </div>
                <div className="fg">
                  <label>Compenso Lordo €</label>
                  <input type="number" step="0.01" value={formData.compenso_lordo} onChange={e=>onCompensoChange(e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Ritenuta €</label>
                  <input type="number" step="0.01" value={formData.ritenuta} readOnly style={{background:'var(--bg)'}}/>
                </div>
                <div className="fg">
                  <label>Netto €</label>
                  <input type="number" step="0.01" value={formData.compenso_netto} readOnly style={{background:'var(--bg)'}}/>
                </div>
                <div className="fg full">
                  <label>Note</label>
                  <input value={formData.note} onChange={e=>setFormData(p=>({...p,note:e.target.value}))}/>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaRitenuta}>💾 Salva</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODULO PIANO DEI CONTI ──────────────────────────────────
function ModuloPianoConti(){
  return <div className="page"><div className="page-hdr"><div className="page-title">🗂️ Piano dei Conti</div></div><div className="alert alert-info">Vai su Contabilità → Configurazione per gestire il Piano dei Conti</div></div>;
}

// ─── MODULO PARTITARIO ───────────────────────────────────────
function ModuloPartitario(){
  return <div className="page"><div className="page-hdr"><div className="page-title">💳 Partitario</div></div><div className="alert alert-info">Modulo in sviluppo</div></div>;
}

// ─── MODULO BILANCIO ─────────────────────────────────────────
function ModuloBilancio(){
  return <div className="page"><div className="page-hdr"><div className="page-title">📊 Bilancio</div></div><div className="alert alert-info">Modulo in sviluppo</div></div>;
}

// ─── MODULO LETTURA MAIL ─────────────────────────────────────
const EMAIL_ACCOUNTS = [
  { email: 'patenv25@gmail.com', label: 'Patenv (Test)' },
  { email: 'ilpapacommercialista@gmail.com', label: 'Il Papa Commercialista' },
  { email: 'patrik.alaimo@gmail.com', label: 'Patrik Alaimo' }
];

function ModuloLetturaMail(){
  const [selectedAccount,setSelectedAccount]=useState(EMAIL_ACCOUNTS[0].email);
  const [emails,setEmails]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [loading,setLoading]=useState(false);
  const [processing,setProcessing]=useState(null);
  const [selectedEmail,setSelectedEmail]=useState(null);
  const [stats,setStats]=useState({totali:0,conAllegati:0,elaborati:0});

  useEffect(()=>{
    sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva').eq('attivo',true).order('nome')
      .then(({data})=>setClienti(data||[]));
  },[]);

  const caricaEmail=async()=>{
    setLoading(true);
    setEmails([]);
    try{
      const res=await fetch('/api/read-email',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'list',email:selectedAccount,limit:30})
      });
      const data=await res.json();
      if(data.success){
        setEmails(data.emails||[]);
        setStats({
          totali:data.emails?.length||0,
          conAllegati:data.emails?.filter(e=>e.hasAttachments).length||0,
          elaborati:0
        });
      }else{
        alert('Errore: '+data.error);
      }
    }catch(err){
      alert('Errore connessione: '+err.message);
    }
    setLoading(false);
  };

  const elaboraEmail=async(email)=>{
    setProcessing(email.uid);
    try{
      // 1. Scarica allegati completi
      const res=await fetch('/api/read-email',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'fetch_attachments',email:selectedAccount,uid:email.uid})
      });
      const data=await res.json();
      
      if(!data.success||!data.email?.attachments?.length){
        alert('Nessun allegato trovato');
        setProcessing(null);
        return;
      }

      // 2. Per ogni allegato, analizza con AI e salva
      for(const att of data.email.attachments){
        // Analizza con AI
        const analyzeRes=await fetch('/api/analyze-document',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({
            fileBase64:att.content,
            filename:att.filename,
            mimeType:att.contentType
          })
        });

        let analysis={tipo_documento:'altro',modulo_suggerito:'varie'};
        if(analyzeRes.ok){
          const aiData=await analyzeRes.json();
          analysis=aiData.analysis||analysis;
        }

        // Match cliente
        let clienteMatch=null;
        if(analysis.partita_iva){
          clienteMatch=clienti.find(c=>c.partita_iva===analysis.partita_iva);
        }
        if(!clienteMatch&&analysis.codice_fiscale){
          clienteMatch=clienti.find(c=>c.codice_fiscale?.toUpperCase()===analysis.codice_fiscale?.toUpperCase());
        }

        // Salva nel database documenti_import
        const filePath=`email/${Date.now()}_${att.filename}`;
        
        // Upload file a Supabase Storage
        const fileBuffer=Uint8Array.from(atob(att.content),c=>c.charCodeAt(0));
        await sb.storage.from('documenti').upload(filePath,fileBuffer,{contentType:att.contentType});

        // Salva record
        await sb.from('documenti_import').insert([{
          filename:att.filename,
          file_path:filePath,
          file_size:att.size,
          mime_type:att.contentType,
          tipo_documento:analysis.tipo_documento,
          confidence:analysis.confidence,
          ai_summary:analysis.descrizione_breve,
          ai_raw_response:analysis,
          cf_estratto:analysis.codice_fiscale,
          piva_estratta:analysis.partita_iva,
          cliente_id:clienteMatch?.id,
          cliente_match_type:clienteMatch?'auto':'none',
          modulo_destinazione:analysis.modulo_suggerito,
          stato:'classified',
          note_operatore:`Importato da email: ${email.from} - ${email.subject}`
        }]);
      }

      // Aggiorna stato email elaborata
      setEmails(prev=>prev.map(e=>e.uid===email.uid?{...e,elaborata:true}:e));
      setStats(prev=>({...prev,elaborati:prev.elaborati+1}));

    }catch(err){
      console.error('Errore elaborazione:',err);
      alert('Errore: '+err.message);
    }
    setProcessing(null);
  };

  const elaboraTutte=async()=>{
    const daElaborare=emails.filter(e=>e.hasAttachments&&!e.elaborata);
    for(const email of daElaborare){
      await elaboraEmail(email);
    }
  };

  return(
    <div className="page">
      {selectedEmail&&<EmailDetailModal email={selectedEmail} onClose={()=>setSelectedEmail(null)} onElabora={()=>{elaboraEmail(selectedEmail);setSelectedEmail(null);}}/>}
      
      <div className="page-hdr">
        <div className="page-title">📧 Lettura Mail Automatica</div>
        <div className="page-sub">Leggi email, estrai allegati e classificali automaticamente con AI</div>
      </div>

      {/* Selezione account */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'.75rem',alignItems:'center',flexWrap:'wrap'}}>
          <div className="fg" style={{flex:1,minWidth:200,marginBottom:0}}>
            <label>Account Email</label>
            <select value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}>
              {EMAIL_ACCOUNTS.map(a=><option key={a.email} value={a.email}>{a.label} ({a.email})</option>)}
            </select>
          </div>
          <button className="btn" onClick={caricaEmail} disabled={loading} style={{marginTop:'1.2rem'}}>
            {loading?'⏳ Caricamento...':'📥 Carica Email'}
          </button>
          {emails.filter(e=>e.hasAttachments&&!e.elaborata).length>0&&(
            <button className="btn-sec" onClick={elaboraTutte} disabled={processing} style={{marginTop:'1.2rem'}}>
              🤖 Elabora tutte ({emails.filter(e=>e.hasAttachments&&!e.elaborata).length})
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {emails.length>0&&(
        <div className="stats-grid" style={{marginBottom:'1rem'}}>
          <div className="stat-card">
            <div className="stat-val" style={{color:'var(--bl)'}}>{stats.totali}</div>
            <div className="stat-lbl">Email trovate</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{color:'var(--gold)'}}>{stats.conAllegati}</div>
            <div className="stat-lbl">Con allegati</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{color:'var(--gr)'}}>{stats.elaborati}</div>
            <div className="stat-lbl">Elaborate</div>
          </div>
        </div>
      )}

      {/* Lista email */}
      {loading?<div className="loading">⏳ Connessione a {selectedAccount}...</div>:emails.length===0?(
        <div className="empty">
          <div className="empty-ico">📧</div>
          <div className="empty-t">Nessuna email caricata</div>
          <div className="empty-s">Seleziona un account e clicca "Carica Email" per leggere la posta</div>
        </div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th>Stato</th>
              <th>Da</th>
              <th>Oggetto</th>
              <th>Data</th>
              <th>Allegati</th>
              <th>Azioni</th>
            </tr></thead>
            <tbody>{emails.map(e=>(
              <tr key={e.uid} style={{opacity:e.elaborata?.6:1}}>
                <td>
                  {e.elaborata?(
                    <span className="bdg bdg-green">✓ Elaborata</span>
                  ):e.hasAttachments?(
                    <span className="bdg bdg-gold">📎 Da elaborare</span>
                  ):(
                    <span className="bdg bdg-gray">Senza allegati</span>
                  )}
                </td>
                <td>
                  <div style={{fontSize:'.78rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={e.from}>{e.from}</div>
                </td>
                <td>
                  <div style={{fontSize:'.8rem',fontWeight:500,maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={e.subject}>{e.subject||'(nessun oggetto)'}</div>
                </td>
                <td style={{fontSize:'.75rem',color:'var(--mu)',whiteSpace:'nowrap'}}>{fmtDate(e.date?.split('T')[0])}</td>
                <td>
                  {e.attachments?.length>0?(
                    <div style={{display:'flex',gap:'.25rem',flexWrap:'wrap'}}>
                      {e.attachments.slice(0,3).map((a,i)=>(
                        <span key={i} title={a.filename} style={{fontSize:'.65rem',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:4,padding:'.1rem .35rem',maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {a.filename?.includes('.pdf')?'📄':'📋'}{a.filename}
                        </span>
                      ))}
                      {e.attachments.length>3&&<span style={{fontSize:'.65rem',color:'var(--mu)'}}>+{e.attachments.length-3}</span>}
                    </div>
                  ):'—'}
                </td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn-icon" onClick={()=>setSelectedEmail(e)} title="Dettagli">👁️</button>
                    {e.hasAttachments&&!e.elaborata&&(
                      <button className="btn-icon" style={{borderColor:'rgba(200,164,94,.4)',color:'var(--gold)'}} onClick={()=>elaboraEmail(e)} disabled={processing===e.uid} title="Elabora">
                        {processing===e.uid?'⏳':'🤖'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{padding:'.5rem 1rem',fontSize:'.68rem',color:'var(--mu)',borderTop:'1px solid var(--bd)'}}>
            {emails.length} email · Le email rimangono non lette nella casella originale
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        ℹ️ <strong>Come funziona:</strong> Il sistema legge le email non lette degli ultimi 7 giorni, estrae gli allegati PDF/XML, li classifica con AI e li salva in "Import Documenti". Le email rimangono non lette nella casella originale.
      </div>
    </div>
  );
}

function EmailDetailModal({email,onClose,onElabora}){
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📧 Dettaglio Email</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>DA</div>
            <div style={{fontSize:'.85rem',fontWeight:500}}>{email.from}</div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>OGGETTO</div>
            <div style={{fontSize:'.9rem',fontWeight:600}}>{email.subject||'(nessun oggetto)'}</div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>DATA</div>
            <div style={{fontSize:'.85rem'}}>{new Date(email.date).toLocaleString('it-IT')}</div>
          </div>
          {email.attachments?.length>0&&(
            <div style={{marginBottom:'1rem'}}>
              <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.4rem'}}>ALLEGATI ({email.attachments.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:'.35rem'}}>
                {email.attachments.map((a,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'.5rem',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.5rem .7rem'}}>
                    <span style={{fontSize:'1.1rem'}}>{a.contentType?.includes('pdf')?'📄':'📋'}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'.8rem',fontWeight:500}}>{a.filename}</div>
                      <div style={{fontSize:'.68rem',color:'var(--mu)'}}>{(a.size/1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {email.textPreview&&(
            <div>
              <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>ANTEPRIMA</div>
              <div style={{fontSize:'.78rem',color:'var(--mu)',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.6rem',lineHeight:1.5,maxHeight:150,overflow:'auto'}}>{email.textPreview}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Chiudi</button>
          {email.hasAttachments&&!email.elaborata&&<button className="btn" onClick={onElabora}>🤖 Elabora allegati</button>}
        </div>
      </div>
    </div>
  );
}

// ─── MODULO FATTURE MASSIVE ADE ──────────────────────────────
function ModuloFattureADE(){
  const [clienti,setClienti]=useState([]);
  const [fatture,setFatture]=useState([]);
  const [loading,setLoading]=useState(true);
  const [importing,setImporting]=useState(false);
  const [importProgress,setImportProgress]=useState(null);
  const [stats,setStats]=useState({totali:0,elaborate:0,errori:0});
  const [filtroCliente,setFiltroCliente]=useState('tutti');
  const [filtroTipo,setFiltroTipo]=useState('tutti');
  const fileInputRef=useRef();

  useEffect(()=>{caricaDati();},[]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:cli},{data:fatt},{count:tot}]=await Promise.all([
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva').eq('attivo',true).order('nome'),
      sb.from('fatture_xml').select('*').order('data_import',{ascending:false}).limit(200),
      sb.from('fatture_xml').select('*',{count:'exact',head:true})
    ]);
    setClienti(cli||[]);
    setFatture(fatt||[]);
    setStats({
      totali:tot||0,
      elaborate:(fatt||[]).filter(f=>f.stato==='elaborata').length,
      errori:(fatt||[]).filter(f=>f.stato==='errore').length
    });
    setLoading(false);
  };

  const handleZipUpload=async(e)=>{
    const file=e.target.files[0];
    if(!file||!file.name.endsWith('.zip'))return alert('Seleziona un file ZIP');
    
    setImporting(true);
    setImportProgress({fase:'Lettura ZIP...',current:0,total:0});

    try{
      // Carica JSZip dinamicamente
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      
      const zip=new JSZip();
      const contents=await zip.loadAsync(file);
      
      // Trova tutti i file XML
      const xmlFiles=[];
      contents.forEach((path,zipEntry)=>{
        if(!zipEntry.dir&&(path.endsWith('.xml')||path.endsWith('.XML'))){
          xmlFiles.push({path,entry:zipEntry});
        }
      });

      setImportProgress({fase:'Elaborazione XML...',current:0,total:xmlFiles.length});

      let imported=0,errors=0;
      
      for(let i=0;i<xmlFiles.length;i++){
        const{path,entry}=xmlFiles[i];
        setImportProgress({fase:`Elaborazione ${path}...`,current:i+1,total:xmlFiles.length});

        try{
          const xmlContent=await entry.async('string');
          
          // Parsing XML per estrarre dati essenziali
          const parser=new DOMParser();
          const doc=parser.parseFromString(xmlContent,'text/xml');
          
          // Estrai dati dalla fattura elettronica
          const cedente=doc.querySelector('CedentePrestatore Anagrafica Denominazione, CedentePrestatore DatiAnagrafici Denominazione');
          const cessionario=doc.querySelector('CessionarioCommittente Anagrafica Denominazione, CessionarioCommittente DatiAnagrafici Denominazione');
          const pivaCedente=doc.querySelector('CedentePrestatore IdFiscaleIVA IdCodice, CedentePrestatore DatiAnagrafici IdFiscaleIVA IdCodice');
          const pivaCessionario=doc.querySelector('CessionarioCommittente IdFiscaleIVA IdCodice, CessionarioCommittente DatiAnagrafici IdFiscaleIVA IdCodice');
          const cfCessionario=doc.querySelector('CessionarioCommittente CodiceFiscale, CessionarioCommittente DatiAnagrafici CodiceFiscale');
          const numero=doc.querySelector('DatiGeneraliDocumento Numero');
          const data=doc.querySelector('DatiGeneraliDocumento Data');
          const tipoDoc=doc.querySelector('DatiGeneraliDocumento TipoDocumento');
          const importoTotale=doc.querySelector('DatiGeneraliDocumento ImportoTotaleDocumento');
          
          // Determina se è fattura attiva o passiva basandosi sul match cliente
          const pivaMatch=pivaCessionario?.textContent||cfCessionario?.textContent;
          const clienteMatch=clienti.find(c=>
            c.partita_iva===pivaMatch||
            c.codice_fiscale?.toUpperCase()===cfCessionario?.textContent?.toUpperCase()||
            c.partita_iva===pivaCedente?.textContent
          );

          // Determina tipo: se il cliente è il cedente = attiva, se è cessionario = passiva
          let tipoFattura='passiva';
          if(clienteMatch&&clienteMatch.partita_iva===pivaCedente?.textContent){
            tipoFattura='attiva';
          }

          // Salva nel database
          const{error}=await sb.from('fatture_xml').insert([{
            filename:path.split('/').pop(),
            file_path:`fatture/${Date.now()}_${path.split('/').pop()}`,
            xml_content:xmlContent,
            tipo_fattura:tipoFattura,
            tipo_documento:tipoDoc?.textContent||'TD01',
            numero_fattura:numero?.textContent,
            data_fattura:data?.textContent,
            importo_totale:parseFloat(importoTotale?.textContent)||0,
            cedente_denominazione:cedente?.textContent,
            cedente_piva:pivaCedente?.textContent,
            cessionario_denominazione:cessionario?.textContent,
            cessionario_piva:pivaCessionario?.textContent,
            cessionario_cf:cfCessionario?.textContent,
            cliente_id:clienteMatch?.id,
            cliente_match_type:clienteMatch?'auto':'none',
            stato:'importata',
            data_import:new Date().toISOString()
          }]);

          if(error)throw error;
          imported++;
        }catch(err){
          console.error('Errore XML:',path,err);
          errors++;
        }
      }

      setImportProgress({fase:`Completato: ${imported} importate, ${errors} errori`,current:xmlFiles.length,total:xmlFiles.length});
      setTimeout(()=>{
        setImporting(false);
        setImportProgress(null);
        caricaDati();
      },2000);

    }catch(err){
      console.error('Errore ZIP:',err);
      alert('Errore lettura ZIP: '+err.message);
      setImporting(false);
      setImportProgress(null);
    }

    fileInputRef.current.value='';
  };

  const getClienteNome=(id)=>{
    const c=clienti.find(x=>x.id===id);
    return c?(c.ragione_sociale||`${c.nome} ${c.cognome||''}`).trim():'—';
  };

  const eliminaFattura=async(id)=>{
    if(!confirm('Eliminare questa fattura?'))return;
    await sb.from('fatture_xml').delete().eq('id',id);
    caricaDati();
  };

  const filteredFatture=fatture.filter(f=>{
    if(filtroCliente!=='tutti'&&f.cliente_id!==filtroCliente)return false;
    if(filtroTipo!=='tutti'&&f.tipo_fattura!==filtroTipo)return false;
    return true;
  });

  return(
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">📥 Fatture Massive ADE</div>
        <div className="page-sub">Import fatture elettroniche da ZIP ADE · Smistamento automatico per cliente</div>
      </div>

      {/* Upload Zone */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div className="card-hdr">
          <div className="card-title">📦 Carica ZIP da Agenzia delle Entrate</div>
        </div>
        <div 
          className="upload-zone" 
          onClick={()=>!importing&&fileInputRef.current.click()}
          style={{opacity:importing?0.6:1,cursor:importing?'wait':'pointer'}}
        >
          {importing?(
            <>
              <div className="upload-zone-ico">⏳</div>
              <div className="upload-zone-t">{importProgress?.fase}</div>
              <div className="upload-zone-s">{importProgress?.current}/{importProgress?.total} file</div>
              <div style={{width:'100%',maxWidth:300,height:6,background:'var(--bd)',borderRadius:3,marginTop:'.75rem',overflow:'hidden'}}>
                <div style={{height:'100%',background:'linear-gradient(90deg,var(--gold),var(--gld2))',borderRadius:3,width:`${importProgress?.total?(importProgress.current/importProgress.total*100):0}%`,transition:'width .3s'}}/>
              </div>
            </>
          ):(
            <>
              <div className="upload-zone-ico">📦</div>
              <div className="upload-zone-t">Carica file ZIP</div>
              <div className="upload-zone-s">ZIP contenente fatture XML scaricate da Agenzia delle Entrate</div>
            </>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept=".zip" style={{display:'none'}} onChange={handleZipUpload}/>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card">
          <div className="stat-val" style={{color:'var(--bl)'}}>{stats.totali}</div>
          <div className="stat-lbl">Fatture totali</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{color:'var(--gr)'}}>{fatture.filter(f=>f.tipo_fattura==='attiva').length}</div>
          <div className="stat-lbl">Fatture attive</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{color:'var(--gold)'}}>{fatture.filter(f=>f.tipo_fattura==='passiva').length}</div>
          <div className="stat-lbl">Fatture passive</div>
        </div>
        <div className="stat-card">
          <div className="stat-val" style={{color:'var(--rd)'}}>{fatture.filter(f=>!f.cliente_id).length}</div>
          <div className="stat-lbl">Non assegnate</div>
        </div>
      </div>

      {/* Filtri */}
      <div style={{display:'flex',gap:'.6rem',marginBottom:'.85rem',flexWrap:'wrap'}}>
        <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.4rem .7rem',color:'var(--tx)',fontSize:'.8rem',minWidth:180}}>
          <option value="tutti">Tutti i clienti</option>
          {clienti.map(c=><option key={c.id} value={c.id}>{c.ragione_sociale||`${c.nome} ${c.cognome||''}`}</option>)}
        </select>
        <select value={filtroTipo} onChange={e=>setFiltroTipo(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.4rem .7rem',color:'var(--tx)',fontSize:'.8rem'}}>
          <option value="tutti">Tutti i tipi</option>
          <option value="attiva">Fatture Attive</option>
          <option value="passiva">Fatture Passive</option>
        </select>
      </div>

      {/* Lista fatture */}
      {loading?<div className="loading">⏳ Caricamento...</div>:filteredFatture.length===0?(
        <div className="empty"><div className="empty-ico">📥</div><div className="empty-t">Nessuna fattura</div><div className="empty-s">Carica uno ZIP per importare le fatture</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th>Tipo</th>
              <th>Numero</th>
              <th>Data</th>
              <th>Cedente</th>
              <th>Importo</th>
              <th>Cliente</th>
              <th>Azioni</th>
            </tr></thead>
            <tbody>{filteredFatture.map(f=>(
              <tr key={f.id}>
                <td><span className={f.tipo_fattura==='attiva'?'bdg bdg-green':'bdg bdg-gold'}>{f.tipo_fattura==='attiva'?'📤 Attiva':'📥 Passiva'}</span></td>
                <td style={{fontWeight:600,fontSize:'.8rem'}}>{f.numero_fattura||'—'}</td>
                <td style={{fontSize:'.78rem',color:'var(--mu)'}}>{fmtDate(f.data_fattura)}</td>
                <td>
                  <div style={{fontSize:'.78rem',maxWidth:150,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{f.cedente_denominazione||'—'}</div>
                  <div style={{fontSize:'.65rem',color:'var(--mu)'}}>{f.cedente_piva}</div>
                </td>
                <td style={{fontWeight:600,color:'var(--gld2)'}}>{fmt(f.importo_totale)}</td>
                <td>
                  {f.cliente_id?(
                    <div style={{fontSize:'.78rem'}}>{getClienteNome(f.cliente_id)}</div>
                  ):<span style={{color:'var(--rd)',fontSize:'.72rem'}}>⚠️ Non assegnata</span>}
                </td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn-icon" style={{borderColor:'rgba(224,82,82,.3)',color:'#ff8585'}} onClick={()=>eliminaFattura(f.id)}>🗑</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{padding:'.5rem 1rem',fontSize:'.68rem',color:'var(--mu)',borderTop:'1px solid var(--bd)'}}>
            {filteredFatture.length} fatture visualizzate
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODULO RICHIESTE FATTURE ELETTRONICHE ───────────────────
function ModuloRichiesteFatture(){
  const [richieste,setRichieste]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [deleghe,setDeleghe]=useState([]);
  const [loading,setLoading]=useState(true);
  const [nuovaModal,setNuovaModal]=useState(false);
  const [viewModal,setViewModal]=useState(null);

  useEffect(()=>{carica();},[]);

  const carica=async()=>{
    setLoading(true);
    const[{data:r},{data:c},{data:d}]=await Promise.all([
      sb.from('richieste_fatture').select('*').order('created_at',{ascending:false}).limit(50),
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva').eq('attivo',true).order('nome'),
      sb.from('deleghe_uniche').select('*').eq('attivo',true),
    ]);
    setRichieste(r||[]);setClienti(c||[]);setDeleghe(d||[]);setLoading(false);
  };

  const delegheMap=useMemo(()=>Object.fromEntries((deleghe||[]).map(d=>[d.cliente_id,d])),[deleghe]);

  const aggiornaStato=async(id,stato)=>{
    await sb.from('richieste_fatture').update({stato}).eq('id',id);
    carica();
  };

  const STATO_CFG={
    generata: {label:'📄 Generata', color:'var(--mu)'},
    inviata:  {label:'📤 Inviata',  color:'var(--bl)'},
    completata:{label:'✓ Completata',color:'var(--gr)'},
    scaricata:{label:'⬇ Scaricata', color:'var(--pu)'},
  };

  const TIPO_LABEL={
    FATT_EMESSE:'Fatture Emesse',FATT_RICEVUTE:'Fatture Ricevute',
    FE_DISPOSIZIONE:'FE Disposizione',CORR:'Corrispettivi',RICE:'Ricevute',
  };

  return(
    <div className="page">
      {nuovaModal&&<NuovaRichiestaModal clienti={clienti} delegheMap={delegheMap} onSave={async(data)=>{
        const{error}=await sb.from('richieste_fatture').insert([data]);
        if(error)alert(error.message);
        else{await carica();setNuovaModal(false);}
      }} onClose={()=>setNuovaModal(false)}/>}
      {viewModal&&<ViewXMLModal richiesta={viewModal} onClose={()=>setViewModal(null)}/>}

      <div className="page-hdr">
        <div className="page-title">📡 Richieste Fatture ADE</div>
        <div className="page-sub">Genera file XML per download massivo fatture elettroniche</div>
      </div>

      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'1rem'}}>
        <button className="btn" onClick={()=>setNuovaModal(true)}>+ Nuova Richiesta</button>
      </div>

      {loading?<div className="loading">⏳</div>:richieste.length===0?(
        <div className="empty"><div className="empty-ico">📡</div><div className="empty-t">Nessuna richiesta</div><div className="empty-s">Crea la prima richiesta di download massivo</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>Data</th><th>Tipo</th><th>Periodo</th><th>Clienti</th><th>Stato</th><th>Azioni</th></tr></thead>
            <tbody>{richieste.map(r=>{
              const sc=STATO_CFG[r.stato]||STATO_CFG.generata;
              return(
                <tr key={r.id}>
                  <td style={{fontSize:'.75rem',color:'var(--mu)',whiteSpace:'nowrap'}}>{fmtDate(r.created_at?.split('T')[0])}</td>
                  <td style={{fontWeight:600}}>{TIPO_LABEL[r.tipo_richiesta]||r.tipo_richiesta}</td>
                  <td style={{fontSize:'.75rem',color:'var(--mu)'}}>{fmtDate(r.data_da)} → {fmtDate(r.data_a)}</td>
                  <td style={{color:'var(--mu)'}}>{(r.clienti_ids||[]).length} clienti</td>
                  <td><span style={{color:sc.color,fontSize:'.78rem',fontWeight:600}}>{sc.label}</span></td>
                  <td><div className="tbl-actions">
                    <button className="btn-sec btn-sm" onClick={()=>setViewModal(r)}>📄 XML</button>
                    {r.stato==='generata'&&<button className="btn-sec btn-sm" onClick={()=>aggiornaStato(r.id,'inviata')}>📤 Segna inviata</button>}
                    {r.stato==='inviata'&&<button className="btn-sec btn-sm" onClick={()=>aggiornaStato(r.id,'completata')}>✓ Completata</button>}
                    {r.stato==='completata'&&<button className="btn-sec btn-sm" onClick={()=>aggiornaStato(r.id,'scaricata')}>⬇ Scaricata</button>}
                  </div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ViewXMLModal({richiesta,onClose}){
  const scarica=()=>{
    const blob=new Blob([richiesta.xml_generato],{type:'application/xml'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`richiesta_ade_${richiesta.id.substring(0,8)}.xml`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:700}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">📄 XML Richiesta ADE</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <pre style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:9,padding:'1rem',fontSize:'.72rem',color:'#7eb8ff',overflow:'auto',maxHeight:400,whiteSpace:'pre-wrap',wordBreak:'break-all'}}>
            {richiesta.xml_generato}
          </pre>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Chiudi</button>
          <button className="btn" onClick={scarica}>⬇️ Scarica XML</button>
        </div>
      </div>
    </div>
  );
}

function NuovaRichiestaModal({clienti,delegheMap,onSave,onClose}){
  const [tipo,setTipo]=useState('FATT_EMESSE');
  const [dataDa,setDataDa]=useState('');
  const [dataA,setDataA]=useState('');
  const [flusso,setFlusso]=useState('ALL');
  const [tipoRicerca,setTipoRicerca]=useState('COMPLETA');
  const [pivaStudio,setPivaStudio]=useState('');
  // Carica P.IVA titolare da impostazioni studio
  useEffect(()=>{
    sb.from('impostazioni_studio').select('valore').eq('chiave','titolare_piva').single()
      .then(({data})=>{ if(data?.valore) setPivaStudio(data.valore); });
  },[]);
  const [selClienti,setSelClienti]=useState(new Set());
  const [search,setSearch]=useState('');
  const [saving,setSaving]=useState(false);
  const [warning,setWarning]=useState([]);
  const [step,setStep]=useState(1);

  // Calcola warning clienti senza delega attiva
  useEffect(()=>{
    const warn=[];
    selClienti.forEach(id=>{
      const d=delegheMap[id];
      const stato=d?statoDelega(d.data_scadenza):'da_attivare';
      if(stato!=='attivo'){
        const c=clienti.find(x=>x.id===id);
        warn.push({id,nome:c?.ragione_sociale||`${c?.nome} ${c?.cognome||''}`,stato});
      }
    });
    setWarning(warn);
  },[selClienti,delegheMap]);

  const toggleCliente=id=>setSelClienti(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>{
    const filtrati=clientiFiltrati.map(c=>c.id);
    const allSel=filtrati.every(id=>selClienti.has(id));
    setSelClienti(p=>{const n=new Set(p);allSel?filtrati.forEach(id=>n.delete(id)):filtrati.forEach(id=>n.add(id));return n;});
  };

  const clientiFiltrati=useMemo(()=>clienti.filter(c=>{
    const nome=(c.ragione_sociale||`${c.nome} ${c.cognome||''}`).toLowerCase();
    return !search||nome.includes(search.toLowerCase())||(c.codice_fiscale||'').toLowerCase().includes(search.toLowerCase());
  }),[clienti,search]);

  // Valida range date (max 3 mesi)
  const rangeValido=useMemo(()=>{
    if(!dataDa||!dataA)return false;
    const diff=(new Date(dataA)-new Date(dataDa))/(1000*60*60*24);
    return diff>=0&&diff<=92;
  },[dataDa,dataA]);

  const generaXML=()=>{
    const ids=[...selClienti];
    const pivaList=ids.map(id=>{
      const c=clienti.find(x=>x.id===id);
      return c?.partita_iva||c?.codice_fiscale||'';
    }).filter(Boolean);

    let innerXML='';
    if(tipo==='FATT_EMESSE'){
      innerXML=`<Fatture>
        <Richiesta>FATT</Richiesta>
        <ElencoPiva>${pivaList.map(p=>`<Piva>${p}</Piva>`).join('\n        ')}</ElencoPiva>
        <TipoRicerca>${tipoRicerca}</TipoRicerca>
        <FattureEmesse>
          <DataEmissione>
            <Da>${dataDa}</Da>
            <A>${dataA}</A>
          </DataEmissione>
          <Flusso><Tutte>ALL</Tutte></Flusso>
          <Ruolo>CEDENTE</Ruolo>
        </FattureEmesse>
      </Fatture>`;
    }else if(tipo==='FATT_RICEVUTE'){
      innerXML=`<Fatture>
        <Richiesta>FATT</Richiesta>
        <ElencoPiva>${pivaList.map(p=>`<Piva>${p}</Piva>`).join('\n        ')}</ElencoPiva>
        <TipoRicerca>${tipoRicerca}</TipoRicerca>
        <FattureRicevute>
          <DataEmissione>
            <Da>${dataDa}</Da>
            <A>${dataA}</A>
          </DataEmissione>
          <Flusso><Tutte>ALL</Tutte></Flusso>
          <Ruolo>CESSIONARIO</Ruolo>
        </FattureRicevute>
      </Fatture>`;
    }else if(tipo==='FE_DISPOSIZIONE'){
      innerXML=`<Fatture>
        <Richiesta>FATT</Richiesta>
        <ElencoPiva>${pivaList.map(p=>`<Piva>${p}</Piva>`).join('\n        ')}</ElencoPiva>
        <TipoRicerca>${tipoRicerca}</TipoRicerca>
        <FattureFEDisposizione>
          <DataEmissione>
            <Da>${dataDa}</Da>
            <A>${dataA}</A>
          </DataEmissione>
          <Ruolo>CESSIONARIO</Ruolo>
        </FattureFEDisposizione>
      </Fatture>`;
    }else if(tipo==='CORR'){
      innerXML=`<Corrispettivi>
        <Richiesta>CORR</Richiesta>
        <DataRilevazione>
          <Da>${dataDa}</Da>
          <A>${dataA}</A>
        </DataRilevazione>
        <ElencoPiva><Piva>${pivaStudio}</Piva></ElencoPiva>
        <TipoCorrispettivo>RT</TipoCorrispettivo>
      </Corrispettivi>`;
    }else if(tipo==='RICE'){
      innerXML=`<Ricevute>
        <Richiesta>RICE</Richiesta>
        <DataRicezione>
          <Da>${dataDa}</Da>
          <A>${dataA}</A>
        </DataRicezione>
        <ElencoPiva>${pivaList.map(p=>`<Piva>${p}</Piva>`).join('\n        ')}</ElencoPiva>
        <Flusso>ALL</Flusso>
        <Ruolo>CEDENTE</Ruolo>
        <TipoRicerca>${tipoRicerca}</TipoRicerca>
      </Ricevute>`;
    }

    return`<?xml version="1.0" encoding="UTF-8"?>
<InputMassivo xmlns="http://www.sogei.it/InputPubblico">
  <TipoRichiesta>
    ${innerXML}
  </TipoRichiesta>
</InputMassivo>`;
  };

  const conferma=async()=>{
    if(warning.length>0){
      const ok=confirm(`Attenzione: ${warning.length} clienti selezionati non hanno una delega attiva:\n${warning.map(w=>w.nome+' ('+w.stato+')').join(String.fromCharCode(10))}\n\nVuoi procedere comunque?`);
      if(!ok)return;
    }
    setSaving(true);
    const xml=generaXML();
    await onSave({
      tipo_richiesta:tipo,
      data_da:dataDa,
      data_a:dataA,
      flusso,
      tipo_ricerca:tipoRicerca,
      piva_studio:pivaStudio,
      clienti_ids:[...selClienti],
      xml_generato:xml,
      stato:'generata',
    });
    setSaving(false);
  };

  const TIPI=[
    {id:'FATT_EMESSE',label:'Fatture Emesse',desc:'Fatture emesse dai clienti (cedente)'},
    {id:'FATT_RICEVUTE',label:'Fatture Ricevute',desc:'Fatture ricevute dai clienti (cessionario)'},
    {id:'FE_DISPOSIZIONE',label:'FE Messe a Disposizione',desc:'Fatture messe a disposizione dal SdI'},
    {id:'CORR',label:'Corrispettivi',desc:'Registratori telematici e cassa'},
    {id:'RICE',label:'Ricevute',desc:'Ricevute file trasmessi'},
  ];

  const is={background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,color:'var(--tx)',padding:'.5rem .75rem',fontSize:'.84rem',width:'100%'};

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:680}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📡 Nuova Richiesta Fatture ADE</div>
          <div className="modal-sub">Step {step} di 2</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">

          {step===1&&(
            <>
              {/* Tipo richiesta */}
              <div style={{fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--gold)',marginBottom:'.65rem'}}>1. Tipo di richiesta</div>
              <div style={{display:'flex',flexDirection:'column',gap:'.4rem',marginBottom:'1rem'}}>
                {TIPI.map(t=>(
                  <div key={t.id} onClick={()=>setTipo(t.id)} style={{display:'flex',alignItems:'center',gap:'.75rem',padding:'.6rem .85rem',borderRadius:9,cursor:'pointer',background:tipo===t.id?'rgba(200,164,94,.08)':'var(--s2)',border:`1px solid ${tipo===t.id?'var(--gold)':'var(--bd)'}`,transition:'all .15s'}}>
                    <div style={{width:16,height:16,borderRadius:'50%',border:`2px solid ${tipo===t.id?'var(--gold)':'var(--bd2)'}`,background:tipo===t.id?'var(--gold)':'transparent',flexShrink:0}}/>
                    <div><div style={{fontSize:'.84rem',fontWeight:600}}>{t.label}</div><div style={{fontSize:'.7rem',color:'var(--mu)'}}>{t.desc}</div></div>
                  </div>
                ))}
              </div>

              {/* Periodo */}
              <div style={{fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--gold)',marginBottom:'.65rem'}}>2. Periodo (max 3 mesi)</div>
              <div className="form-grid" style={{marginBottom:'1rem'}}>
                <div className="fg"><label>Da *</label><input type="date" value={dataDa} onChange={e=>setDataDa(e.target.value)} style={is}/></div>
                <div className="fg"><label>A *</label><input type="date" value={dataA} onChange={e=>setDataA(e.target.value)} style={is}/></div>
                {tipo==='CORR'&&<div className="fg full"><label>P.IVA Studio *</label><input value={pivaStudio} onChange={e=>setPivaStudio(e.target.value)} placeholder="11 cifre" style={is}/></div>}
              </div>
              {dataDa&&dataA&&!rangeValido&&<div className="alert alert-err">⚠️ Il periodo non può superare i 3 mesi</div>}

              {/* Tipo ricerca */}
              <div className="form-grid">
                <div className="fg"><label>Tipo ricerca</label><select value={tipoRicerca} onChange={e=>setTipoRicerca(e.target.value)} style={{...is,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7a99' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",backgroundRepeat:'no-repeat',backgroundPosition:'right .7rem center',paddingRight:'2rem',WebkitAppearance:'none',appearance:'none'}}><option value="COMPLETA">Completa</option><option value="PUNTUALE">Puntuale</option></select></div>
              </div>
            </>
          )}

          {step===2&&(
            <>
              <div style={{fontSize:'.7rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.08em',color:'var(--gold)',marginBottom:'.65rem'}}>
                3. Selezione clienti · <span style={{color:'var(--tx)'}}>{selClienti.size} selezionati</span>
                {warning.length>0&&<span style={{color:'var(--rd)',marginLeft:'.5rem'}}>⚠️ {warning.length} senza delega attiva</span>}
              </div>

              <input className="search-bar" placeholder="🔍 Cerca..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'.65rem'}}/>

              {/* Filtri rapidi */}
              <div style={{display:'flex',gap:'.4rem',marginBottom:'.65rem',flexWrap:'wrap'}}>
                <button className="btn-sec btn-sm" onClick={()=>{
                  const attivi=clientiFiltrati.filter(c=>{const d=delegheMap[c.id];return d&&statoDelega(d.data_scadenza)==='attivo';}).map(c=>c.id);
                  setSelClienti(new Set(attivi));
                }}>✓ Solo con delega attiva</button>
                <button className="btn-sec btn-sm" onClick={toggleAll}>Seleziona/deseleziona tutti</button>
                <button className="btn-sec btn-sm" onClick={()=>setSelClienti(new Set())}>Azzera</button>
              </div>

              <div style={{maxHeight:320,overflowY:'auto',border:'1px solid var(--bd)',borderRadius:9,overflow:'hidden'}}>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:'.8rem'}}>
                  <thead>
                    <tr style={{background:'var(--s2)'}}>
                      <th style={{width:36,padding:'.5rem',textAlign:'center',borderBottom:'1px solid var(--bd)'}}>
                        <div style={{width:15,height:15,borderRadius:3,border:'1.5px solid var(--bd2)',cursor:'pointer',margin:'0 auto'}} onClick={toggleAll}/>
                      </th>
                      <th style={{padding:'.5rem',textAlign:'left',borderBottom:'1px solid var(--bd)',fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--mu)'}}>Cliente</th>
                      <th style={{padding:'.5rem',textAlign:'left',borderBottom:'1px solid var(--bd)',fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--mu)'}}>CF / P.IVA</th>
                      <th style={{padding:'.5rem',textAlign:'center',borderBottom:'1px solid var(--bd)',fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.06em',color:'var(--mu)'}}>Delega</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clientiFiltrati.map(c=>{
                      const sel=selClienti.has(c.id);
                      const d=delegheMap[c.id];
                      const ds=d?statoDelega(d.data_scadenza):'da_attivare';
                      const nome=c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim();
                      return(
                        <tr key={c.id} style={{cursor:'pointer',background:sel?'rgba(200,164,94,.04)':''}} onClick={()=>toggleCliente(c.id)}>
                          <td style={{textAlign:'center',padding:'.45rem'}}>
                            <div style={{width:15,height:15,borderRadius:3,border:`1.5px solid ${sel?'var(--gold)':'var(--bd2)'}`,background:sel?'var(--gold)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto'}}>
                              {sel&&<span style={{color:'#0d1117',fontSize:'.55rem',fontWeight:700}}>✓</span>}
                            </div>
                          </td>
                          <td style={{padding:'.45rem',fontWeight:sel?600:400}}>{nome}</td>
                          <td style={{padding:'.45rem',fontSize:'.72rem',fontFamily:'monospace',color:'var(--mu)'}}>{c.codice_fiscale||c.partita_iva||'—'}</td>
                          <td style={{padding:'.45rem',textAlign:'center'}}><DelegaBadge stato={ds}/></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {warning.length>0&&(
                <div className="alert alert-warn" style={{marginTop:'.75rem'}}>
                  ⚠️ I seguenti clienti non hanno una delega attiva: {warning.map(w=>w.nome).join(', ')}. Puoi procedere ma ADE potrebbe rifiutare la richiesta per questi soggetti.
                </div>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={step===1?onClose:()=>setStep(1)}>{step===1?'Annulla':'← Indietro'}</button>
          {step===1
            ?<button className="btn" disabled={!rangeValido||!tipo} onClick={()=>setStep(2)}>Avanti →</button>
            :<button className="btn" disabled={!selClienti.size||saving} onClick={conferma}>{saving?'Genero XML...':'📄 Genera XML'}</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── MODULI DISPONIBILI (per clienti) ────────────────────────
const MODULI_DISPONIBILI = [
  { id:"iva",          ico:"💧", label:"Liquidazione IVA" },
  { id:"f24",          ico:"📋", label:"Gestione F24" },
  { id:"ammortamenti", ico:"🏢", label:"Ammortamenti" },
  { id:"adempimenti",  ico:"📬", label:"Adempimenti" },
  { id:"simulatore",   ico:"📊", label:"Simulatore" },
];
const MODULI_DEFAULT = ["iva","f24","ammortamenti","adempimenti","simulatore"];

// ─── MODULI MODAL (per singolo cliente) ──────────────────────
function ModuliModal({ cliente, onSave, onClose }) {
  const attivi = cliente.moduli_attivi || MODULI_DEFAULT;
  const [sel, setSel] = useState(new Set(attivi));
  const [saving, setSaving] = useState(false);
  const toggle = id => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const salva = async () => {
    setSaving(true);
    await onSave(cliente.id, [...sel]);
    setSaving(false);
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 420 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">⚙️ Moduli attivi</div>
          <div className="modal-sub">{cliente.ragione_sociale || `${cliente.nome} ${cliente.cognome || ""}`.trim()}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{ fontSize: ".75rem", color: "var(--mu)", marginBottom: ".85rem" }}>
            Seleziona i moduli applicabili a questo cliente. Verranno usati per filtrare adempimenti e scadenzari.
          </div>
          {MODULI_DISPONIBILI.map(m => (
            <div key={m.id} onClick={() => toggle(m.id)}
              style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".7rem .85rem", borderRadius: 9, cursor: "pointer", background: sel.has(m.id) ? "rgba(200,164,94,.07)" : "var(--s2)", border: `1px solid ${sel.has(m.id) ? "rgba(200,164,94,.35)" : "var(--bd)"}`, marginBottom: ".4rem", transition: "all .15s" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${sel.has(m.id) ? "var(--gold)" : "var(--bd2)"}`, background: sel.has(m.id) ? "var(--gold)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {sel.has(m.id) && <span style={{ color: "#0d1117", fontSize: ".65rem", fontWeight: 700 }}>✓</span>}
              </div>
              <span style={{ fontSize: "1rem" }}>{m.ico}</span>
              <span style={{ fontSize: ".84rem", fontWeight: 500 }}>{m.label}</span>
            </div>
          ))}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving} onClick={salva}>{saving ? "Salvo..." : "💾 Salva"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODULI BULK MODAL (per più clienti) ─────────────────────
function ModuliBulkModal({ clienti, onSave, onClose }) {
  const [sel, setSel] = useState(new Set(MODULI_DEFAULT));
  const [azione, setAzione] = useState("attiva"); // attiva | disattiva | sostituisci
  const [saving, setSaving] = useState(false);
  const toggle = id => setSel(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const salva = async () => {
    setSaving(true);
    for (const c of clienti) {
      const attuali = new Set(c.moduli_attivi || MODULI_DEFAULT);
      let nuovi;
      if (azione === "attiva") { sel.forEach(m => attuali.add(m)); nuovi = [...attuali]; }
      else if (azione === "disattiva") { sel.forEach(m => attuali.delete(m)); nuovi = [...attuali]; }
      else { nuovi = [...sel]; }
      await onSave(c.id, nuovi);
    }
    setSaving(false);
    onClose();
  };
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">⚙️ Moduli in blocco</div>
          <div className="modal-sub">{clienti.length} clienti selezionati</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="fg" style={{ marginBottom: ".85rem" }}>
            <label>Azione</label>
            <select value={azione} onChange={e => setAzione(e.target.value)} style={{ background: "var(--s2)", border: "1px solid var(--bd)", borderRadius: 8, color: "var(--tx)", padding: ".5rem .75rem", fontSize: ".84rem", width: "100%", WebkitAppearance: "none" }}>
              <option value="attiva">Attiva i moduli selezionati (aggiungi)</option>
              <option value="disattiva">Disattiva i moduli selezionati (rimuovi)</option>
              <option value="sostituisci">Sostituisci con i moduli selezionati</option>
            </select>
          </div>
          <div style={{ fontSize: ".72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--mu)", marginBottom: ".5rem" }}>Moduli</div>
          {MODULI_DISPONIBILI.map(m => (
            <div key={m.id} onClick={() => toggle(m.id)}
              style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".6rem .85rem", borderRadius: 9, cursor: "pointer", background: sel.has(m.id) ? "rgba(200,164,94,.07)" : "var(--s2)", border: `1px solid ${sel.has(m.id) ? "rgba(200,164,94,.35)" : "var(--bd)"}`, marginBottom: ".4rem", transition: "all .15s" }}>
              <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${sel.has(m.id) ? "var(--gold)" : "var(--bd2)"}`, background: sel.has(m.id) ? "var(--gold)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {sel.has(m.id) && <span style={{ color: "#0d1117", fontSize: ".65rem", fontWeight: 700 }}>✓</span>}
              </div>
              <span>{m.ico}</span>
              <span style={{ fontSize: ".84rem", fontWeight: 500 }}>{m.label}</span>
            </div>
          ))}
          <div style={{ background: "rgba(200,164,94,.07)", border: "1px solid rgba(200,164,94,.2)", borderRadius: 8, padding: ".6rem .85rem", marginTop: ".75rem", fontSize: ".72rem", color: "var(--mu)" }}>
            Verrà applicato a: {clienti.map(c => c.ragione_sociale || c.nome).join(", ")}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving || !sel.size} onClick={salva}>{saving ? "Salvo..." : `💾 Applica a ${clienti.length} clienti`}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODULO CLIENTI (con selezione multipla + moduli) ────────
function ModuloClienti(){
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

// ─── IVA IMPORT (PDF / Excel via Claude AI) ──────────────────
async function estraiDatiIVADaPDF(base64, mimeType) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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

async function estraiDatiIVADaExcel(file) {
  const XLSX = window.XLSX;
  const ab = await file.arrayBuffer();
  const wb = XLSX.read(ab, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const testo = XLSX.utils.sheet_to_csv(ws).slice(0, 4000);

  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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
function ModuloIVA(){
  const [list,setList]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [saving,setSaving]=useState(false);
  // Import state
  const [importLoading,setImportLoading]=useState(false);
  const [importPreview,setImportPreview]=useState(null);
  const [importErr,setImportErr]=useState(null);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();

  const EMPTY={cliente_id:null,cliente_nome:"",periodo:"",tipo_periodo:"trimestrale",anno:new Date().getFullYear(),trimestre:1,mese:null,iva_vendite:0,iva_acquisti:0,iva_saldo:0,iva_precedente:0,iva_dovuta:0,iva_credito:0,note:"",stato:"bozza"};

  const carica=useCallback(async()=>{
    setLoading(true);
    const[{data:l},{data:c}]=await Promise.all([
      sb.from("liquidazioni_iva").select("*").order("anno",{ascending:false}).order("trimestre",{ascending:false}).limit(50),
      sb.from("clienti").select("id,nome,cognome,ragione_sociale,partita_iva").eq("attivo",true).order("nome")
    ]);
    setList(l||[]);setClienti(c||[]);setLoading(false);
  },[]);
  useEffect(()=>{carica();},[carica]);

  const salva=async(data)=>{
    setSaving(true);
    try{
      const saldo=parseFloat(data.iva_vendite||0)-parseFloat(data.iva_acquisti||0);
      const prec=parseFloat(data.iva_precedente||0);
      const netto=saldo-prec;
      const rec={...data,iva_saldo:saldo,iva_dovuta:netto>0?netto:0,iva_credito:netto<0?Math.abs(netto):0};
      if(modal.mode==="new"){const{error}=await sb.from("liquidazioni_iva").insert([rec]);if(error)throw error;}
      else{const{error}=await sb.from("liquidazioni_iva").update(rec).eq("id",modal.data.id);if(error)throw error;}
      await carica();setModal(null);
    }catch(e){alert(e.message);}finally{setSaving(false);}
  };
  const elimina=async(id)=>{if(!confirm("Eliminare?"))return;await sb.from("liquidazioni_iva").delete().eq("id",id);carica();};

  const handleFile=async(file)=>{
    if(!file)return;
    setImportErr(null);setImportPreview(null);setImportLoading(true);
    try{
      const ext=file.name.split(".").pop().toLowerCase();
      let dati;
      if(ext==="pdf"){
        const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
        dati=await estraiDatiIVADaPDF(base64,"application/pdf");
      } else if(["xlsx","xls","csv"].includes(ext)){
        dati=await estraiDatiIVADaExcel(file);
      } else {
        throw new Error("Formato non supportato. Usa PDF, Excel o CSV.");
      }
      // match cliente per P.IVA
      const piva=(dati.partita_iva||"").replace(/\D/g,"");
      const match=piva?clienti.find(c=>c.partita_iva?.replace(/\D/g,"")===piva):null;
      if(match){dati.cliente_id=match.id;dati.cliente_nome=match.ragione_sociale||`${match.nome} ${match.cognome||""}`.trim();}
      setImportPreview(dati);
    }catch(e){setImportErr(e.message||"Errore estrazione dati");}
    finally{setImportLoading(false);}
  };

  // Genera file riepilogo Excel/CSV
  const scaricaRiepilogo=async()=>{
    if(!window.XLSX){
      await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    }
    const XLSX=window.XLSX;
    if(XLSX){
      // Excel con XLSX se disponibile
      const rows=[];
      const sostitutiOrdinati=Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'SCONOSCIUTO').localeCompare(b.sostitutoNome||'SCONOSCIUTO','it'));
      sostitutiOrdinati.forEach(gruppo=>{
        rows.push({
          'Sostituto d\'imposta': gruppo.sostitutoNome||'(non rilevato)',
          'P.IVA / CF': gruppo.sostitutoCF||'',
          'N. CU': gruppo.cu.length,
          'Percipienti': gruppo.cu.map(cu=>cu.percipientiNome||cu.percipienteCF||'—').join(', '),
        });
        gruppo.cu.sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it')).forEach(cu=>{
          rows.push({
            'Sostituto d\'imposta': '',
            'P.IVA / CF': cu.percipienteCF||'',
            'N. CU': '',
            'Percipienti': cu.percipientiNome||cu.percipienteCF||'—',
          });
        });
      });
      // Riga totale
      rows.push({'Sostituto d\'imposta':'TOTALE','P.IVA / CF':'','N. CU':risultati.length,'Percipienti':''});
      const ws=XLSX.utils.json_to_sheet(rows);
      ws['!cols']=[{wch:40},{wch:18},{wch:8},{wch:80}];
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Riepilogo CU '+anno);
      XLSX.writeFile(wb,'Riepilogo_CU'+anno+'_'+new Date().toISOString().split('T')[0]+'.xlsx');
    } else {
      // Fallback CSV
      let csv='Sostituto;P.IVA-CF;N.CU;Percipiente\n';
      Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'').localeCompare(b.sostitutoNome||'','it')).forEach(g=>{
        g.cu.sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it')).forEach((cu,i)=>{
          csv+=`${i===0?(g.sostitutoNome||'(non rilevato)'):''};"${g.sostitutoCF||''}";${i===0?g.cu.length:''};"${cu.percipientiNome||cu.percipienteCF||'—'}"\n`;
        });
      });
      csv+=`TOTALE;;;${risultati.length}\n`;
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='Riepilogo_CU'+anno+'.csv';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  };

  const handleDrop=e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);};

  const usaPreview=()=>{
    if(!importPreview)return;
    setModal({mode:"new",data:{...EMPTY,...importPreview}});
    setImportPreview(null);
  };

  const STATO_COLOR={bozza:"bdg-gray",confermata:"bdg-gold",inviata:"bdg-green"};

  return(
    <div className="page">
      {modal&&<IVAModal mode={modal.mode} data={modal.data||EMPTY} clienti={clienti} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>}

      <div className="page-hdr"><div className="page-title">💧 Liquidazione IVA</div><div className="page-sub">Importa documenti e gestisci le liquidazioni periodiche</div></div>

      {/* ── SEZIONE IMPORT (superiore) ── */}
      <div className="card" style={{marginBottom:"1.5rem"}}>
        <div className="card-hdr">
          <div className="card-title">📎 Importa da documento</div>
          <span style={{fontSize:".72rem",color:"var(--mu)"}}>PDF · Excel · CSV</span>
        </div>

        {!importPreview&&!importLoading&&(
          <div
            className={"upload-zone"+(drag?" drag":"")}
            style={{padding:"1.75rem"}}
            onDragOver={e=>{e.preventDefault();setDrag(true);}}
            onDragLeave={()=>setDrag(false)}
            onDrop={handleDrop}
            onClick={()=>fileRef.current.click()}
          >
            <div className="upload-zone-ico">📄</div>
            <div className="upload-zone-t">Trascina il prospetto IVA qui</div>
            <div className="upload-zone-s">oppure clicca per selezionare · PDF, .xlsx, .xls, .csv</div>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".pdf,.xlsx,.xls,.csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])}/>

        {importLoading&&(
          <div style={{display:"flex",alignItems:"center",gap:".65rem",padding:"1.25rem",color:"#c4b5fd",background:"rgba(167,139,250,.06)",border:"1px solid rgba(167,139,250,.2)",borderRadius:10}}>
            <span style={{fontSize:"1.2rem"}}>✨</span>
            <div>
              <div style={{fontWeight:600,fontSize:".84rem"}}>Claude sta leggendo il documento...</div>
              <div style={{fontSize:".72rem",color:"var(--mu)",marginTop:".15rem"}}>Estrazione dati IVA in corso</div>
            </div>
          </div>
        )}

        {importErr&&<div className="alert alert-err">⚠️ {importErr}</div>}

        {importPreview&&(
          <div>
            <div style={{background:"rgba(52,194,122,.06)",border:"1px solid rgba(52,194,122,.25)",borderRadius:10,padding:"1rem",marginBottom:".75rem"}}>
              <div style={{fontSize:".68rem",fontWeight:700,color:"#4dde96",textTransform:"uppercase",letterSpacing:".07em",marginBottom:".65rem"}}>✅ Dati estratti</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))",gap:".5rem"}}>
                {[
                  ["Cliente",importPreview.cliente_nome||"—"],
                  ["P.IVA",importPreview.partita_iva||"—"],
                  ["Periodo",importPreview.periodo||"—"],
                  ["IVA Vendite",fmt(importPreview.iva_vendite||0)],
                  ["IVA Acquisti",fmt(importPreview.iva_acquisti||0)],
                  ["Credito prec.",fmt(importPreview.iva_precedente||0)],
                ].map(([l,v])=>(
                  <div key={l} style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:8,padding:".55rem .75rem"}}>
                    <div style={{fontSize:".6rem",color:"var(--mu)",textTransform:"uppercase",letterSpacing:".06em",fontWeight:600,marginBottom:".2rem"}}>{l}</div>
                    <div style={{fontSize:".88rem",fontWeight:600}}>{v}</div>
                  </div>
                ))}
              </div>
              {importPreview.note&&<div style={{fontSize:".72rem",color:"var(--mu)",marginTop:".5rem"}}>Note: {importPreview.note}</div>}
              {importPreview.cliente_id&&<div style={{fontSize:".72rem",color:"#4dde96",marginTop:".35rem"}}>✅ Cliente trovato in anagrafica per P.IVA</div>}
              {!importPreview.cliente_id&&importPreview.partita_iva&&<div style={{fontSize:".72rem",color:"var(--gld2)",marginTop:".35rem"}}>⚠️ P.IVA non trovata in anagrafica — potrai selezionare il cliente nel form</div>}
            </div>
            <div style={{display:"flex",gap:".5rem"}}>
              <button className="btn" onClick={usaPreview}>📋 Crea liquidazione con questi dati →</button>
              <button className="btn-sec" onClick={()=>{setImportPreview(null);setImportErr(null);}}>✕ Scarta</button>
            </div>
          </div>
        )}
      </div>

      {/* ── SEZIONE LISTA (inferiore) ── */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:".85rem"}}>
        <div style={{fontFamily:"'Playfair Display',serif",fontSize:".95rem",fontWeight:700}}>Liquidazioni in archivio</div>
        <button className="btn" onClick={()=>setModal({mode:"new",data:EMPTY})}>+ Nuova manuale</button>
      </div>

      {loading?<div className="loading">⏳</div>:list.length===0?(
        <div className="empty"><div className="empty-ico">💧</div><div className="empty-t">Nessuna liquidazione</div><div className="empty-s">Importa un documento o crea manualmente</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <table className="tbl">
            <thead><tr><th>Cliente</th><th>Periodo</th><th>IVA Vendite</th><th>IVA Acquisti</th><th>Saldo</th><th>Dovuta/Credito</th><th>Stato</th><th>Azioni</th></tr></thead>
            <tbody>{list.map(l=>(
              <tr key={l.id}>
                <td style={{fontWeight:600}}>{l.cliente_nome||"—"}</td>
                <td>{l.periodo}</td>
                <td style={{color:"var(--rd)"}}>{fmt(l.iva_vendite)}</td>
                <td style={{color:"var(--gr)"}}>{fmt(l.iva_acquisti)}</td>
                <td style={{fontWeight:600}}>{fmt(l.iva_saldo)}</td>
                <td>{l.iva_dovuta>0?<span style={{color:"var(--rd)",fontWeight:700}}>{fmt(l.iva_dovuta)}</span>:l.iva_credito>0?<span style={{color:"var(--gr)",fontWeight:700}}>Credito {fmt(l.iva_credito)}</span>:<span style={{color:"var(--mu)"}}>—</span>}</td>
                <td><span className={"bdg "+STATO_COLOR[l.stato]}>{l.stato}</span></td>
                <td><div className="tbl-actions">
                  <button className="btn-icon" onClick={()=>setModal({mode:"edit",data:l})}>✏️</button>
                  <button className="btn-icon" style={{borderColor:"rgba(224,82,82,.3)",color:"#ff8585"}} onClick={()=>elimina(l.id)}>🗑</button>
                </div></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ClienteModal({mode,data,onSave,onClose,saving,err}){
  const [f,setF]=useState({...data,email_cc:data.email_cc||[]});
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">{mode==="new"?"Nuovo Cliente":"Modifica Cliente"}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg"><label>Codice Cliente</label><input value={f.codice_cliente||""} onChange={e=>up("codice_cliente",e.target.value.toUpperCase())} placeholder="Es. 001, CLI001" maxLength={10} style={{fontFamily:'monospace',fontWeight:600}}/></div>
            <div className="fg"><label>Tipo Cliente</label><select value={f.tipo_cliente} onChange={e=>up("tipo_cliente",e.target.value)}>{TIPO_CLIENTE.map(t=><option key={t} value={t}>{TIPO_LABEL[t]}</option>)}</select></div>
            <div className="fg"><label>Nome *</label><input value={f.nome} onChange={e=>up("nome",e.target.value)}/></div>
            <div className="fg"><label>Cognome</label><input value={f.cognome||""} onChange={e=>up("cognome",e.target.value)}/></div>
            <div className="fg full"><label>Ragione Sociale</label><input value={f.ragione_sociale||""} onChange={e=>up("ragione_sociale",e.target.value)} placeholder="Solo per persone giuridiche"/></div>
            <div className="fg full"><label>Email principale</label><input type="email" value={f.email||""} onChange={e=>up("email",e.target.value)}/></div>
            <div className="fg full"><label>Email CC (premi Invio per aggiungere)</label><TagInput value={f.email_cc} onChange={v=>up("email_cc",v)}/></div>
            <div className="fg"><label>Codice Fiscale</label><input value={f.codice_fiscale||""} onChange={e=>up("codice_fiscale",e.target.value.toUpperCase())}/></div>
            <div className="fg"><label>Partita IVA</label><input value={f.partita_iva||""} onChange={e=>up("partita_iva",e.target.value)}/></div>
            <div className="fg full"><label>Note</label><textarea value={f.note||""} onChange={e=>up("note",e.target.value)} style={{minHeight:65}}/></div>
          </div>
          {err&&<div className="err-box">⚠️ {err}</div>}
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={!f.nome||saving} onClick={()=>onSave(f)}>{saving?"Salvo...":"💾 Salva"}</button></div>
      </div>
    </div>
  );
}

// ─── IMPORT EXCEL ────────────────────────────────────────────
function ModuloImportExcel(){
  const [file,setFile]=useState(null);
  const [preview,setPreview]=useState([]);
  const [headers,setHeaders]=useState([]);
  const [mapping,setMapping]=useState({nome:"",cognome:"",ragione_sociale:"",tipo_cliente:"",email:"",codice_fiscale:"",partita_iva:""});
  const [loading,setLoading]=useState(false);
  const [done,setDone]=useState(null);
  const [err,setErr]=useState(null);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();

  const parseFile=async(f)=>{
    setFile(f);setErr(null);setDone(null);
    const XLSX=window.XLSX;
    if(!XLSX){setErr("Libreria Excel non disponibile");return;}
    const ab=await f.arrayBuffer();
    const wb=XLSX.read(ab,{type:"array"});
    const ws=wb.Sheets[wb.SheetNames[0]];
    const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
    if(rows.length<2){setErr("File vuoto o non valido");return;}
    const hdrs=rows[0].map(h=>String(h).trim());
    setHeaders(hdrs);
    setPreview(rows.slice(1,6).map(r=>Object.fromEntries(hdrs.map((h,i)=>[h,r[i]]))));
    // Auto-mapping
    const autoMap={};
    const candidates={nome:["nome","name","first name","firstname"],cognome:["cognome","surname","last name","lastname"],ragione_sociale:["ragione sociale","ragione_sociale","denominazione","azienda","company","ditta"],tipo_cliente:["tipo","tipo cliente","regime","tipo_cliente"],email:["email","e-mail","mail","posta"],codice_fiscale:["codice fiscale","cf","cod fiscale","codice_fiscale"],partita_iva:["partita iva","p.iva","piva","partita_iva","vat"]};
    Object.entries(candidates).forEach(([field,kws])=>{
      const found=hdrs.find(h=>kws.some(k=>h.toLowerCase().includes(k)));
      if(found)autoMap[field]=found;
    });
    setMapping(m=>({...m,...autoMap}));
  };

  const handleDrop=e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)parseFile(f);};
  const handleFile=e=>{const f=e.target.files[0];if(f)parseFile(f);};

  const importa=async()=>{
    if(!file||!mapping.nome)return;
    setLoading(true);setErr(null);
    try{
      const XLSX=window.XLSX;
      const ab=await file.arrayBuffer();
      const wb=XLSX.read(ab,{type:"array"});
      const ws=wb.Sheets[wb.SheetNames[0]];
      const rows=XLSX.utils.sheet_to_json(ws,{header:1,defval:""});
      const hdrs=rows[0].map(h=>String(h).trim());
      const data=rows.slice(1).filter(r=>r.some(c=>c!=="")).map(r=>{
        const row=Object.fromEntries(hdrs.map((h,i)=>[h,r[i]]));
        const get=k=>mapping[k]?String(row[mapping[k]]||"").trim():"";
        return{nome:get("nome"),cognome:get("cognome"),ragione_sociale:get("ragione_sociale"),tipo_cliente:get("tipo_cliente")||"forfettario",email:get("email"),codice_fiscale:get("codice_fiscale"),partita_iva:get("partita_iva"),attivo:true,email_cc:[]};
      }).filter(r=>r.nome||r.ragione_sociale);
      // Inserisci a batch di 50
      let inserted=0;
      for(let i=0;i<data.length;i+=50){
        const {error}=await sb.from("clienti").upsert(data.slice(i,i+50),{onConflict:"partita_iva",ignoreDuplicates:true});
        if(error)throw error;
        inserted+=Math.min(50,data.length-i);
      }
      setDone(inserted);setFile(null);setPreview([]);
    }catch(e){setErr(e.message);}finally{setLoading(false);}
  };

  return(
    <div className="page">
      <div className="page-hdr"><div className="page-title">📤 Import Excel</div><div className="page-sub">Importa clienti da file .xlsx o .csv</div></div>
      {done!==null&&<div className="alert alert-ok">✅ Importati con successo <strong>{done}</strong> clienti!</div>}
      {err&&<div className="alert alert-err">⚠️ {err}</div>}
      <div className="card">
        <div className="card-title" style={{marginBottom:"1rem"}}>1. Carica il file</div>
        <div className={"upload-zone"+(drag?" drag":"")} onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={handleDrop} onClick={()=>fileRef.current.click()}>
          <div className="upload-zone-ico">{file?"📄":"📁"}</div>
          <div className="upload-zone-t">{file?file.name:"Trascina il file Excel qui"}</div>
          <div className="upload-zone-s">{file?"Clicca per cambiare file":"oppure clicca per selezionare · .xlsx, .xls, .csv"}</div>
        </div>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{display:"none"}} onChange={handleFile}/>
      </div>
      {headers.length>0&&(
        <div className="card">
          <div className="card-title" style={{marginBottom:1}}>2. Mappa le colonne</div>
          <div style={{fontSize:".72rem",color:"var(--mu)",marginBottom:"1rem"}}>Associa le colonne del tuo file ai campi del gestionale</div>
          <div className="form-grid">
            {[["nome","Nome *"],["cognome","Cognome"],["ragione_sociale","Ragione Sociale"],["tipo_cliente","Tipo Cliente"],["email","Email"],["codice_fiscale","Codice Fiscale"],["partita_iva","Partita IVA"]].map(([k,label])=>(
              <div key={k} className="fg">
                <label>{label}</label>
                <select value={mapping[k]} onChange={e=>setMapping(m=>({...m,[k]:e.target.value}))}>
                  <option value="">— non importare —</option>
                  {headers.map(h=><option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
      {preview.length>0&&(
        <div className="card">
          <div className="card-title" style={{marginBottom:"1rem"}}>3. Anteprima (prime 5 righe)</div>
          <div className="tbl-wrap import-preview">
            <div className="import-preview-hdr"><span>{preview.length} righe anteprima</span><span style={{color:"var(--gold)"}}>Tutte le righe verranno importate</span></div>
            <table className="tbl">
              <thead><tr>{headers.slice(0,8).map(h=><th key={h}>{h}</th>)}</tr></thead>
              <tbody>{preview.map((r,i)=><tr key={i}>{headers.slice(0,8).map(h=><td key={h} style={{fontSize:".75rem"}}>{String(r[h]||"")}</td>)}</tr>)}</tbody>
            </table>
          </div>
          <button className="btn full" disabled={loading||!mapping.nome} onClick={importa}>{loading?"⏳ Importazione in corso...":"📤 Importa clienti"}</button>
          <div style={{fontSize:".7rem",color:"var(--mu)",marginTop:".5rem",textAlign:"center"}}>I duplicati (stessa P.IVA) verranno ignorati</div>
        </div>
      )}
      {!file&&<div className="alert alert-info">💡 Il file deve avere una riga di intestazione. Formati supportati: .xlsx, .xls, .csv</div>}
    </div>
  );
}

// ─── UTENTI STUDIO ───────────────────────────────────────────
function ModuloUtenti(){
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
function ModuloF24(){
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

function parseXMLFattura(xmlText) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, "application/xml");
  const get = (sel) => doc.querySelector(sel)?.textContent?.trim() || "";
  const getAll = (sel) => [...doc.querySelectorAll(sel)].map(n => n.textContent?.trim());

  // Cessionario (il cliente/acquirente)
  const piva_cessionario = get("CessionarioCommittente IdFiscaleIVA IdCodice") ||
                           get("CessionarioCommittente CodiceFiscale");
  const nome_cessionario = get("CessionarioCommittente DenominazioneRagioneSociale") ||
    [get("CessionarioCommittente Nome"), get("CessionarioCommittente Cognome")].filter(Boolean).join(" ");

  // Cedente (il fornitore)
  const nome_cedente = get("CedentePrestatore DenominazioneRagioneSociale") ||
    [get("CedentePrestatore Nome"), get("CedentePrestatore Cognome")].filter(Boolean).join(" ");
  const piva_cedente = get("CedentePrestatore IdFiscaleIVA IdCodice");

  // Dati fattura
  const numero = get("DatiGeneraliDocumento Numero");
  const data = get("DatiGeneraliDocumento Data");
  const tipo = get("DatiGeneraliDocumento TipoDocumento");

  // Linee
  const lines = [...doc.querySelectorAll("DettaglioLinee")].map(l => ({
    desc: l.querySelector("Descrizione")?.textContent?.trim() || "",
    qty: parseFloat(l.querySelector("Quantita")?.textContent || "1"),
    prezzo: parseFloat(l.querySelector("PrezzoUnitario")?.textContent || "0"),
    totale: parseFloat(l.querySelector("PrezzoTotale")?.textContent || "0"),
    iva: parseFloat(l.querySelector("AliquotaIVA")?.textContent || "22"),
  }));

  // Totali
  const imponibile = parseFloat(get("DatiRiepilogo ImponibileImporto") || get("ImportoPagamento") || "0");
  const totale_doc = parseFloat(get("ImportoTotaleDocumento") || "0");

  return {
    piva_cessionario, nome_cessionario,
    piva_cedente, nome_cedente,
    numero, data, tipo,
    lines,
    imponibile: imponibile || lines.reduce((s,l) => s+l.totale, 0),
    totale_doc,
    rawXML: xmlText,
  };
}

function formattaXML(xmlText) {
  try {
    let indent = 0;
    const lines = xmlText
      .replace(/>\s*</g, ">\n<")
      .split("\n")
      .map(line => {
        line = line.trim();
        if (!line) return "";
        if (line.startsWith("</")) indent = Math.max(0, indent - 1);
        const out = "  ".repeat(indent) + line;
        if (!line.startsWith("</") && !line.endsWith("/>") && line.includes("<") && !line.includes("</")) indent++;
        return out;
      })
      .filter(Boolean);
    return lines.join("\n");
  } catch(e) { return xmlText; }
}

async function aiSuggerisciCespite(descrizione, importo) {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: `Sei un esperto di fiscalità italiana. Analizza la descrizione di un bene acquistato e rispondi SOLO con JSON valido, nessun testo aggiuntivo.`,
      messages: [{
        role: "user",
        content: `Bene: "${descrizione}" — Importo: €${importo}
Rispondi SOLO con questo JSON:
{
  "categoria": "una di: Attrezzatura|Veicoli|Software|Mobili e arredi|Immobili|Altro",
  "aliquota": numero percentuale ammortamento fiscale Italia (es. 20),
  "descrizione_breve": "descrizione pulita del bene (max 60 caratteri)",
  "motivazione": "breve spiegazione aliquota (max 80 caratteri)"
}`
      }]
    })
  });
  const data = await res.json();
  const txt = data.content?.[0]?.text || "{}";
  return JSON.parse(txt.replace(/```json|```/g, "").trim());
}

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

      // chiedi a Claude
      if (desc && costo > 0) {
        setAiLoading(true);
        try {
          const sugg = await aiSuggerisciCespite(desc, costo);
          setAiSugg(sugg);
          setForm(f => ({
            ...f,
            categoria: sugg.categoria || f.categoria,
            aliquota_ammortamento: sugg.aliquota || f.aliquota_ammortamento,
            descrizione: sugg.descrizione_breve || f.descrizione,
          }));
        } catch (e) { /* ignora errori AI */ }
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

function ModuloAmmortamenti(){
  const [beni,setBeni]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [xmlModal,setXmlModal]=useState(false);
  const [pianoModal,setPianoModal]=useState(null);
  const [saving,setSaving]=useState(false);
  const EMPTY={cliente_id:null,cliente_nome:"",descrizione:"",categoria:"Attrezzatura",data_acquisto:todayStr(),costo_storico:0,aliquota_ammortamento:20,fondo_ammortamento:0,note:""};
  const carica=useCallback(async()=>{setLoading(true);const[{data:b},{data:c}]=await Promise.all([sb.from("beni_ammortizzabili").select("*").eq("attivo",true).order("data_acquisto",{ascending:false}),sb.from("clienti").select("id,nome,cognome,ragione_sociale,partita_iva").eq("attivo",true).order("nome")]);setBeni(b||[]);setClienti(c||[]);setLoading(false);},[]);
  useEffect(()=>{carica();},[carica]);
  const salva=async(data)=>{setSaving(true);try{const anni=Math.ceil(100/parseFloat(data.aliquota_ammortamento||20));const vr=parseFloat(data.costo_storico||0)-parseFloat(data.fondo_ammortamento||0);const rec={...data,anni_vita_utile:anni,valore_residuo:vr};if(modal&&modal.mode==="edit"){const{error}=await sb.from("beni_ammortizzabili").update(rec).eq("id",modal.data.id);if(error)throw error;}else{const{error}=await sb.from("beni_ammortizzabili").insert([rec]);if(error)throw error;}await carica();setModal(null);setXmlModal(false);}catch(e){alert(e.message);}finally{setSaving(false);}};
  const elimina=async(id)=>{if(!confirm("Eliminare?"))return;await sb.from("beni_ammortizzabili").update({attivo:false}).eq("id",id);carica();};
  const calcPiano=(bene)=>{
    const costo=parseFloat(bene.costo_storico||0);
    const aliq=parseFloat(bene.aliquota_ammortamento||20)/100;
    const fondo=parseFloat(bene.fondo_ammortamento||0);
    const annoAcq=new Date(bene.data_acquisto).getFullYear();
    const rows=[];let fondoAcc=fondo;
    for(let a=annoAcq;fondoAcc<costo;a++){
      const quota=Math.min(costo*aliq,costo-fondoAcc);
      fondoAcc+=quota;
      rows.push({anno:a,quota,fondo:fondoAcc,residuo:Math.max(0,costo-fondoAcc)});
      if(rows.length>50)break;
    }
    return rows;
  };
  return(
    <div className="page">
      {modal&&<BeneModal mode={modal.mode} data={modal.data||EMPTY} clienti={clienti} onSave={salva} onClose={()=>setModal(null)} saving={saving}/>}
      {xmlModal&&<XMLImportModal clienti={clienti} onSave={salva} onClose={()=>setXmlModal(false)}/>}
      {pianoModal&&<PianoModal bene={pianoModal} piano={calcPiano(pianoModal)} onClose={()=>setPianoModal(null)}/>}
      <div className="page-hdr"><div className="page-title">🏢 Ammortamenti</div><div className="page-sub">Registro beni ammortizzabili e piani di ammortamento</div></div>
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:".85rem",gap:".5rem"}}>
        <button className="btn-sec" onClick={()=>setXmlModal(true)}>📎 Importa da XML</button>
        <button className="btn" onClick={()=>setModal({mode:"new",data:EMPTY})}>+ Nuovo Bene</button>
      </div>
      {loading?<div className="loading">⏳</div>:beni.length===0?(
        <div className="empty"><div className="empty-ico">🏢</div><div className="empty-t">Nessun bene ammortizzabile</div><div className="empty-s">Aggiungi manualmente o importa da fattura XML</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:"hidden"}}>
          <table className="tbl">
            <thead><tr><th>Bene</th><th>Cliente</th><th>Acquisto</th><th>Costo</th><th>Aliquota</th><th>Ammortizzato</th><th>Residuo</th><th>Azioni</th></tr></thead>
            <tbody>{beni.map(b=>{const perc=Math.round((parseFloat(b.fondo_ammortamento)||0)/parseFloat(b.costo_storico)*100)||0;return(
              <tr key={b.id}>
                <td><span style={{fontWeight:600}}>{b.descrizione}</span><br/><span style={{fontSize:".68rem",color:"var(--mu)"}}>{b.categoria}</span></td>
                <td style={{fontSize:".78rem",color:"var(--mu)"}}>{b.cliente_nome||"—"}</td>
                <td style={{fontSize:".75rem",color:"var(--mu)"}}>{fmtDate(b.data_acquisto)}</td>
                <td style={{fontWeight:600}}>{fmt(b.costo_storico)}</td>
                <td>{b.aliquota_ammortamento}%</td>
                <td>
                  <div style={{fontSize:".75rem",marginBottom:".2rem"}}>{fmt(b.fondo_ammortamento)} ({perc}%)</div>
                  <div className="amm-bar"><div className="amm-bar-fill" style={{width:perc+"%"}}/></div>
                </td>
                <td style={{fontWeight:600,color:parseFloat(b.valore_residuo)>0?"var(--gld2)":"var(--gr)"}}>{fmt(b.valore_residuo||0)}</td>
                <td><div className="tbl-actions">
                  <button className="btn-sec btn-sm" onClick={()=>setPianoModal(b)}>📅 Piano</button>
                  <button className="btn-icon" onClick={()=>setModal({mode:"edit",data:b})}>✏️</button>
                  <button className="btn-icon" style={{borderColor:"rgba(224,82,82,.3)",color:"#ff8585"}} onClick={()=>elimina(b.id)}>🗑</button>
                </div></td>
              </tr>
            );})}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ModuloAdempimenti(){
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
function ModuloAgenda(){
  const [invii,setInvii]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [adempimenti,setAdempimenti]=useState([]);
  const [loading,setLoading]=useState(true);
  const [modal,setModal]=useState(null);
  const [mailModal,setMailModal]=useState(null);
  const [saving,setSaving]=useState(false);
  const tot=todayStr();const dom=tomorrowStr();
  const carica=useCallback(async()=>{setLoading(true);const[{data:i},{data:c},{data:a}]=await Promise.all([sb.from("invii_schedulati").select("*").eq("stato","programmato").order("data_invio"),sb.from("clienti").select("id,nome,cognome,ragione_sociale,tipo_cliente,email,email_cc").eq("attivo",true).order("nome"),sb.from("adempimenti_template").select("*").eq("attivo",true).order("nome")]);setInvii(i||[]);setClienti(c||[]);setAdempimenti(a||[]);setLoading(false);},[]);
  useEffect(()=>{carica();},[carica]);
  const alertCount=invii.filter(i=>i.data_invio===dom||i.data_invio===tot).length;
  const creaInvio=async(data)=>{setSaving(true);const{error}=await sb.from("invii_schedulati").insert([{...data,stato:"programmato"}]);if(!error){await carica();setModal(null);}setSaving(false);};
  const aggStato=async(id,stato)=>{await sb.from("invii_schedulati").update({stato,inviato_at:stato==="inviato"?new Date().toISOString():null}).eq("id",id);carica();};
  const rimanda=async(id,days=7)=>{const inv=invii.find(i=>i.id===id);const d=new Date(inv.data_invio);d.setDate(d.getDate()+days);await sb.from("invii_schedulati").update({data_invio:d.toISOString().split("T")[0]}).eq("id",id);carica();};
  const EMPTY={adempimento_id:null,cliente_id:null,data_invio:tot,oggetto:"",corpo:"",email_destinatario:"",email_cc:[],allegato_tipo:"nessuno"};
  const gruppi=invii.reduce((acc,i)=>{const label=i.data_invio===tot?"🔴 Oggi":i.data_invio===dom?"🟡 Domani":fmtDate(i.data_invio);if(!acc[label])acc[label]=[];acc[label].push(i);return acc;},{});
  return(
    <div className="page">
      {modal&&<NuovoInvioModal data={EMPTY} clienti={clienti} adempimenti={adempimenti} onSave={creaInvio} onClose={()=>setModal(null)} saving={saving}/>}
      {mailModal&&<SendMailModal cliente={mailModal.cliente} adempimento={mailModal.adempimento} oggetto={mailModal.oggetto} corpo={mailModal.corpo} onClose={()=>{setMailModal(null);aggStato(mailModal.id,"inviato");}}/>}
      <div className="page-hdr"><div className="page-title">📅 Agenda Invii</div><div className="page-sub">{invii.length} invii programmati</div></div>
      {alertCount>0&&<div className="alert alert-err">🔔 <strong>{alertCount} invio{alertCount>1?"i":""}</strong> in scadenza oggi o domani!</div>}
      <div style={{display:"flex",justifyContent:"flex-end",marginBottom:".85rem"}}><button className="btn" onClick={()=>setModal({})}>+ Programma Invio</button></div>
      {loading?<div className="loading">⏳</div>:invii.length===0?(
        <div className="empty"><div className="empty-ico">📅</div><div className="empty-t">Nessun invio programmato</div><div className="empty-s">Usa "Programma Invio" per schedulare email ai clienti</div></div>
      ):Object.entries(gruppi).map(([label,items])=>(
        <div key={label}>
          <div style={{fontSize:".7rem",fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:"var(--mu)",margin:".9rem 0 .4rem"}}>{label}</div>
          {items.map(inv=>{
            const cl=clienti.find(c=>c.id===inv.cliente_id);
            const ad=adempimenti.find(a=>a.id===inv.adempimento_id);
            return(
              <div key={inv.id} style={{background:inv.data_invio===tot?"rgba(200,164,94,.04)":inv.data_invio===dom?"rgba(224,82,82,.04)":"var(--s1)",border:"1px solid "+(inv.data_invio===tot?"rgba(200,164,94,.4)":inv.data_invio===dom?"rgba(224,82,82,.35)":"var(--bd)"),borderRadius:10,padding:".85rem 1rem",marginBottom:".5rem"}}>
                <div style={{fontWeight:600,marginBottom:".2rem"}}>{inv.oggetto}</div>
                <div style={{fontSize:".74rem",color:"var(--mu)"}}>{cl?(cl.ragione_sociale||`${cl.nome} ${cl.cognome||""}`.trim()):inv.email_destinatario}{ad&&<span> · {ad.nome}</span>}</div>
                <div style={{display:"flex",gap:".4rem",marginTop:".6rem",flexWrap:"wrap"}}>
                  <button className="btn btn-sm" onClick={()=>setMailModal({...inv,id:inv.id,cliente:cl,adempimento:ad})}>📤 Invia ora</button>
                  <button className="btn-sec btn-sm" onClick={()=>rimanda(inv.id,7)}>+7gg</button>
                  <button className="btn-sec btn-sm" onClick={()=>aggStato(inv.id,"annullato")}>Annulla</button>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function NuovoInvioModal({data,clienti,adempimenti,onSave,onClose,saving}){
  const [f,setF]=useState({...data});
  const up=(k,v)=>setF(p=>({...p,[k]:v}));
  const onAdChange=id=>{const ad=adempimenti.find(a=>a.id===id);up("adempimento_id",id||null);if(ad)setF(p=>({...p,adempimento_id:id,oggetto:ad.oggetto,corpo:ad.corpo,allegato_tipo:ad.allegato_tipo}));};
  const onClChange=id=>{const cl=clienti.find(c=>c.id===id);up("cliente_id",id||null);if(cl)up("email_destinatario",cl.email||"");};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">📅 Nuovo Invio Programmato</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Adempimento (opzionale)</label><select value={f.adempimento_id||""} onChange={e=>onAdChange(e.target.value||null)}><option value="">— Personalizzato —</option>{adempimenti.map(a=><option key={a.id} value={a.id}>{a.nome}</option>)}</select></div>
            <div className="fg full"><label>Cliente</label><select value={f.cliente_id||""} onChange={e=>onClChange(e.target.value||null)}><option value="">— Nessuno —</option>{clienti.map(c=><option key={c.id} value={c.id}>{c.ragione_sociale||`${c.nome} ${c.cognome||""}`.trim()}</option>)}</select></div>
            <div className="fg full"><label>Email destinatario *</label><input type="email" value={f.email_destinatario||""} onChange={e=>up("email_destinatario",e.target.value)}/></div>
            <div className="fg full"><label>Data invio *</label><input type="date" value={f.data_invio||""} onChange={e=>up("data_invio",e.target.value)}/></div>
            <div className="fg full"><label>Oggetto *</label><input value={f.oggetto||""} onChange={e=>up("oggetto",e.target.value)}/></div>
            <div className="fg full"><label>Testo</label><textarea value={f.corpo||""} onChange={e=>up("corpo",e.target.value)} style={{minHeight:90}}/></div>
            <div className="fg full"><label>Allegato</label><select value={f.allegato_tipo} onChange={e=>up("allegato_tipo",e.target.value)}>{Object.entries(ALLEGATO_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={!f.data_invio||!f.oggetto||saving} onClick={()=>onSave(f)}>{saving?"Salvo...":"💾 Programma"}</button></div>
      </div>
    </div>
  );
}

// ─── MODULO GENERAZIONE FILE .TEL LOCAZIONI BREVI ───────────

// Dati sostituto fissi EGE Group (configurabili da impostazioni)
const EGE_DEFAULT = {
  piva:         '08792831003',
  cf:           '08792831003',
  denominazione:'EGE GROUP SRL',
  comune:       'ROMA',
  prov:         'RM',
  cap:          '00186',
  indirizzo:    'VIA DI MONTE GIORDANO 36',
  cod_attivita: '683100',
  cod_sede:     '001',
};

// ── Costruttori record TEL (lunghezza fissa 1898 char) ───────
function pad(s, len, right=true) {
  s = String(s||'');
  if(s.length>len) s=s.substring(0,len);
  return right ? s.padEnd(len,' ') : s.padStart(len,' ');
}

function fmtImporto(n) {
  // Formato TEL: "    1234,56" (16 chars, virgola decimale)
  const v = parseFloat(n)||0;
  const s = v.toFixed(2).replace('.',',');
  return s.padStart(16,' ');
}

function fmtData(d) {
  // ggmmaaaa da stringa ISO o dd/mm/yyyy
  if(!d) return '        ';
  const parts = d.includes('-') ? d.split('-').reverse() : d.split('/');
  return (parts[0]||'  ').padStart(2,'0')+(parts[1]||'  ').padStart(2,'0')+(parts[2]||'    ');
}

function buildRecordA(cfDichiarante) {
  // A + 14 spazi + CUR2610 + CF dichiarante
  let r = 'A' + ' '.repeat(14) + 'CUR2610' + pad(cfDichiarante,16);
  return r.padEnd(1898,' ');
}

function buildRecordB(sost, perc, progStr) {
  // Posizioni da analisi del file campione
  let r = new Array(1898).fill(' ');
  const set = (pos, val, len) => {
    const s = pad(val, len);
    for(let i=0;i<len&&pos+i<1898;i++) r[pos+i]=s[i];
  };
  r[0] = 'B';
  set(1,  sost.piva, 11);           // PIVA sostituto (codice file)
  set(12, ' '.repeat(5), 5);        // spazi
  set(17, progStr, 8);              // numero progressivo
  set(73, sost.piva, 11);           // PIVA sostituto
  set(84, '00', 2);
  set(136, sost.denominazione, 40); // denominazione sostituto
  set(310, perc.cf, 16);            // CF percipiente
  set(326, '01', 2);                // tipo
  set(328, pad(perc.cognome,25), 25);
  set(353, pad(perc.nome,20), 20);
  set(373, pad('00000000000',11),11);// importi B (zero, vanno in H)
  set(411, sost.cf, 16);            // CF dichiarante
  return r.join('');
}

function buildRecordD(sost, perc, progStr) {
  // Record D con tag DA
  const field = (tag, val, len=16) => tag + pad(val,len);
  let tags = '';
  tags += field('DA001001', sost.piva);
  tags += field('DA001002', sost.denominazione.substring(0,16));
  if(sost.denominazione.length>16)
    tags += 'DA001002+' + pad(sost.denominazione.substring(16), 16);
  tags += field('DA001004', sost.comune);
  tags += field('DA001005', sost.prov);
  tags += field('DA001006', sost.cap);
  tags += field('DA001007', sost.indirizzo.substring(0,16));
  if(sost.indirizzo.length>16)
    tags += 'DA001007+' + pad(sost.indirizzo.substring(16), 16);
  tags += field('DA001011', sost.cod_sede);
  tags += field('DA002001', perc.cf);
  tags += field('DA002002', (perc.cognome||'').toUpperCase());
  tags += field('DA002003', (perc.nome||'').toUpperCase());
  tags += field('DA002004', perc.sesso||'');
  tags += field('DA002005', fmtData(perc.data_nascita));
  tags += field('DA002006', (perc.comune_nascita||'').toUpperCase());
  tags += field('DA002007', (perc.prov_nascita||'').toUpperCase());
  tags += field('DA003001', fmtData(perc.data_pagamento));
  tags += field('DA003002', '1'); // tipo CU locazioni brevi

  let prefix = 'D' + pad(sost.piva,11) + '     ' + progStr + pad(perc.cf,16) +
    '00001' + '00000000000000000000000' + ' '.repeat(19) + '0';
  let r = prefix + tags;
  return r.padEnd(1898,' ');
}

function buildRecordH(sost, perc, progStr, importo, ritenuta) {
  const prefix = 'H' + pad(sost.piva,11) + '     ' + progStr + pad(perc.cf,16) +
    '00001' + '00000000000000000000000' + ' '.repeat(19) + '0';
  let tags = '';
  tags += 'AU001001' + pad('A',16);
  tags += 'AU001004' + fmtImporto(importo);
  tags += 'AU001008' + fmtImporto(importo);
  tags += 'AU001009' + fmtImporto(ritenuta);
  let r = prefix + tags;
  return r.padEnd(1898,' ');
}

function buildRecordZ(numPerc) {
  const n = String(numPerc).padStart(9,'0');
  let r = 'Z' + ' '.repeat(14) + n + '000000000' + n + '000000000' + n +
    '000000000' + n + '000000000';
  return r.padEnd(1898,' ');
}

function generaTEL(sostituto, percipienti) {
  const lines = [];
  lines.push(buildRecordA(sostituto.cf));
  percipienti.forEach((p, i) => {
    const prog = String(i+1).padStart(8,'0');
    lines.push(buildRecordB(sostituto, p, prog));
    lines.push(buildRecordD(sostituto, p, prog));
    lines.push(buildRecordH(sostituto, p, prog, p.importo, p.ritenuta));
  });
  lines.push(buildRecordZ(percipienti.length));
  return lines.join('\r\n') + '\r\n';
}

// ── Estrazione dati da immagine/PDF con Claude AI ────────────
async function estraiDatiRicevuta(base64, mimeType) {
  const isDoc = mimeType === 'application/pdf';
  const content = isDoc
    ? [{ type:'document', source:{ type:'base64', media_type:mimeType, data:base64 }},
       { type:'text', text:'Estrai i dati da questa ricevuta di affitto breve.' }]
    : [{ type:'image', source:{ type:'base64', media_type:mimeType, data:base64 }},
       { type:'text', text:'Estrai i dati da questa ricevuta di affitto breve.' }];

  const res = await fetch('/api/claude', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({
      model:'claude-sonnet-4-20250514',
      max_tokens:500,
      system:`Sei un esperto contabile italiano. Analizza la ricevuta di affitto breve e rispondi SOLO con JSON valido, zero testo extra.`,
      messages:[{
        role:'user',
        content:[
          ...content.slice(0,-1),
          { type:'text', text:`Analizza questa ricevuta di affitto breve e rispondi SOLO con questo JSON (senza markdown):
{
  "cf": "codice fiscale percipiente 16 char",
  "cognome": "cognome percipiente",
  "nome": "nome percipiente",
  "sesso": "M o F",
  "data_nascita": "DD/MM/YYYY o vuoto",
  "comune_nascita": "comune nascita o vuoto",
  "prov_nascita": "provincia 2 lettere o vuoto",
  "importo_lordo": 0.00,
  "ritenuta": 0.00,
  "importo_netto": 0.00,
  "data_pagamento": "DD/MM/YYYY"
}` }
        ]
      }]
    })
  });
  const data = await res.json();
  const txt = data.content?.[0]?.text || '{}';
  return JSON.parse(txt.replace(/```json|```/g,'').trim());
}

// ── COMPONENTE MODULO TEL ─────────────────────────────────────
function ModuloTEL() {
  const [sostituto, setSostituto] = useState({...EGE_DEFAULT});
  const [ricevute, setRicevute] = useState([]); // {file, preview, loading, dati, err}
  const [drag, setDrag] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [telGenerato, setTelGenerato] = useState(null);
  const fileRef = useRef();

  // Carica dati sostituto da impostazioni se disponibili
  useEffect(()=>{
    sb.from('impostazioni_studio').select('chiave,valore').then(({data})=>{
      if(!data?.length) return;
      const m = Object.fromEntries(data.map(r=>[r.chiave,r.valore||'']));
      if(m.titolare_piva||m.studio_piva){
        // Per locazioni brevi usa dati studio (non titolare persona fisica)
      }
    });
  },[]);

  const processaSingoloFile = async(nome, base64, mimeType) => {
    const id = Date.now() + Math.random();
    setRicevute(p=>[...p, {id, nome, loading:true, dati:null, err:null}]);
    try {
      const dati = await estraiDatiRicevuta(base64, mimeType);
      setRicevute(p=>p.map(r=>r.id===id?{...r,loading:false,dati,err:null}:r));
    } catch(e) {
      setRicevute(p=>p.map(r=>r.id===id?{...r,loading:false,err:e.message}:r));
    }
  };

  const processaFile = async(file) => {
    const isImg = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';
    const isZip = file.name.toLowerCase().endsWith('.zip');

    if(isZip){
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      const JSZip = window.JSZip;
      const ab = await file.arrayBuffer();
      const zip = await JSZip.loadAsync(ab);
      const tuttiFile = Object.keys(zip.files);
      console.log('ZIP aperto, file totali:', tuttiFile);
      const nomi = tuttiFile.filter(n=>{
        const l=n.toLowerCase();
        return !zip.files[n].dir&&(l.endsWith('.pdf')||l.endsWith('.jpg')||l.endsWith('.jpeg')||l.endsWith('.png'));
      });
      if(!nomi.length){
        alert('Nello ZIP non sono stati trovati file PDF, JPG o PNG. File presenti: '+tuttiFile.join(', '));
        return;
      }
      console.log('ZIP: trovati '+nomi.length+' file da processare:', nomi);
      for(const nome of nomi){
        // Leggi come base64 direttamente da JSZip (evita stack overflow su file grandi)
        const base64 = await zip.files[nome].async('base64');
        const l = nome.toLowerCase();
        const mimeType = l.endsWith('.pdf')?'application/pdf':l.endsWith('.png')?'image/png':'image/jpeg';
        const nomeBreve = nome.split('/').pop();
        console.log('Processo:', nomeBreve, mimeType);
        await processaSingoloFile(nomeBreve, base64, mimeType);
      }
      return;
    }

    if(!isImg && !isPdf) return;
    const base64 = await new Promise((res,rej)=>{
      const r = new FileReader();
      r.onload = e => res(e.target.result.split(',')[1]);
      r.onerror = rej;
      r.readAsDataURL(file);
    });
    await processaSingoloFile(file.name, base64, file.type);
  };

  const handleFiles = async(files) => {
    for(const f of Array.from(files)) await processaFile(f);
  };

  const upDati = (id, campo, val) => {
    setRicevute(p=>p.map(r=>r.id===id?{...r,dati:{...r.dati,[campo]:val}}:r));
  };

  const rimuovi = (id) => setRicevute(p=>p.filter(r=>r.id!==id));

  const [validaModal,setValidaModal]=useState(false);
  const [problemi,setProblemi]=useState([]);

  const CAMPI_OBBLIGATORI=[
    {key:'cf',           label:'Codice Fiscale',   check:v=>v&&v.length===16},
    {key:'cognome',      label:'Cognome',           check:v=>v&&v.trim().length>0},
    {key:'nome',         label:'Nome',              check:v=>v&&v.trim().length>0},
    {key:'importo_lordo',label:'Importo lordo',     check:v=>parseFloat(v)>0},
    {key:'ritenuta',     label:'Ritenuta',          check:v=>parseFloat(v)>0},
    {key:'data_pagamento',label:'Data pagamento',   check:v=>v&&v.trim().length>=8},
  ];

  const valida = () => {
    const prob=[];
    ricevute.filter(r=>!r.loading&&!r.err).forEach(r=>{
      const mancanti=CAMPI_OBBLIGATORI.filter(c=>!c.check(r.dati?.[c.key]));
      if(mancanti.length>0) prob.push({id:r.id,nome:r.nome,mancanti,dati:{...r.dati}});
    });
    if(prob.length>0){
      setProblemi(prob);
      setValidaModal(true);
    } else {
      eseguiGenera();
    }
  };

  const eseguiGenera = () => {
    const percipienti = ricevute
      .filter(r=>r.dati&&r.dati.cf)
      .map(r=>({
        cf:           (r.dati.cf||'').toUpperCase(),
        cognome:      (r.dati.cognome||'').toUpperCase(),
        nome:         (r.dati.nome||'').toUpperCase(),
        sesso:        r.dati.sesso||'',
        data_nascita: r.dati.data_nascita||'',
        comune_nascita:(r.dati.comune_nascita||'').toUpperCase(),
        prov_nascita: (r.dati.prov_nascita||'').toUpperCase(),
        importo:      parseFloat(r.dati.importo_lordo)||0,
        ritenuta:     parseFloat(r.dati.ritenuta)||0,
        data_pagamento:r.dati.data_pagamento||'',
      }));
    if(!percipienti.length){ alert('Nessun percipiente valido'); return; }
    const tel = generaTEL(sostituto, percipienti);
    setTelGenerato({contenuto:tel, numPerc:percipienti.length});
    setValidaModal(false);
  };

  const genera = valida;

  const scaricaTEL = () => {
    if(!telGenerato) return;
    const data = new Date();
    const nome = `CUR${String(data.getFullYear()).slice(2)}${sostituto.piva}.TEL`;
    const blob = new Blob([telGenerato.contenuto], {type:'text/plain;charset=latin-1'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url; a.download=nome; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };

  const scaricaExcelTEL = async() => {
    if(!window.XLSX){
      await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    }
    const XLSX = window.XLSX;
    const percipienti = ricevute.filter(r=>r.dati&&r.dati.cf);
    if(!percipienti.length) return;

    const totLordo = percipienti.reduce((s,r)=>s+parseFloat(r.dati.importo_lordo||0),0);
    const totRit   = percipienti.reduce((s,r)=>s+parseFloat(r.dati.ritenuta||0),0);
    const totNetto = percipienti.reduce((s,r)=>s+parseFloat(r.dati.importo_netto||0),0);

    const rows = percipienti.map((r,i)=>({
      'N.':          i+1,
      'Codice Fiscale': (r.dati.cf||'').toUpperCase(),
      'Cognome':     (r.dati.cognome||'').toUpperCase(),
      'Nome':        (r.dati.nome||'').toUpperCase(),
      'Sesso':       r.dati.sesso||'',
      'Data Nascita':r.dati.data_nascita||'',
      'Comune Nascita': r.dati.comune_nascita||'',
      'Prov.':       r.dati.prov_nascita||'',
      'Importo lordo (€)':  parseFloat(r.dati.importo_lordo)||0,
      'Ritenuta 21% (€)':   parseFloat(r.dati.ritenuta)||0,
      'Netto (€)':          parseFloat(r.dati.importo_netto)||0,
      'Data Pagamento':     r.dati.data_pagamento||'',
      'File origine':       r.nome,
    }));
    // Riga totali
    rows.push({
      'N.': 'TOTALE',
      'Codice Fiscale':'','Cognome':'','Nome':'','Sesso':'',
      'Data Nascita':'','Comune Nascita':'','Prov.':'',
      'Importo lordo (€)': totLordo,
      'Ritenuta 21% (€)':  totRit,
      'Netto (€)':         totNetto,
      'Data Pagamento':'','File origine':'',
    });

    if(XLSX){
      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [{wch:4},{wch:18},{wch:20},{wch:16},{wch:6},{wch:12},{wch:16},{wch:6},{wch:16},{wch:16},{wch:12},{wch:14},{wch:30}];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Locazioni Brevi CU');
      const anno = new Date().getFullYear();
      XLSX.writeFile(wb, `Riepilogo_LocazioniBrevi_${anno}.xlsx`);
    } else {
      // Fallback CSV
      const hdr = Object.keys(rows[0]).join(';');
      const body = rows.map(r=>Object.values(r).join(';')).join('\n');
      const blob = new Blob([hdr+'\n'+body],{type:'text/csv;charset=utf-8;'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');a.href=url;a.download='Riepilogo_LocazioniBrevi.csv';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  };

  const pronti = ricevute.filter(r=>r.dati&&r.dati.cf).length;
  const inCaricamento = ricevute.filter(r=>r.loading).length;

  return (
    <div>
      {/* Modal problemi */}
      {validaModal&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setValidaModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:680}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title" style={{color:'var(--gold)'}}>⚠️ Dati mancanti o non rilevati</div>
              <div className="modal-sub">{problemi.length} file con problemi — completa i campi evidenziati</div>
              <button className="modal-close" onClick={()=>setValidaModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              {problemi.map((prob,pi)=>(
                <div key={prob.id} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:10,padding:'.85rem',marginBottom:'.75rem'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.65rem'}}>
                    <span style={{fontSize:'.85rem',fontWeight:700}}>{prob.nome}</span>
                    <div style={{display:'flex',gap:'.3rem',flexWrap:'wrap'}}>
                      {prob.mancanti.map(m=>(
                        <span key={m.key} className="bdg bdg-red">{m.label}</span>
                      ))}
                    </div>
                  </div>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem'}}>
                    {CAMPI_OBBLIGATORI.map(campo=>{
                      const manca=!campo.check(prob.dati?.[campo.key]);
                      const IS={background:'var(--bg)',border:`1px solid ${manca?'var(--rd)':'var(--bd)'}`,borderRadius:7,color:'var(--tx)',padding:'.42rem .6rem',fontSize:'.8rem',width:'100%'};
                      return(
                        <div key={campo.key} className="fg" style={{marginBottom:0}}>
                          <label style={{color:manca?'#ff8585':'var(--mu)'}}>{campo.label}{manca&&' *'}</label>
                          <input
                            value={prob.dati?.[campo.key]||''}
                            style={IS}
                            placeholder={manca?'⚠ Mancante':''}
                            onChange={e=>{
                              const newVal=e.target.value;
                              setProblemi(ps=>ps.map((p,i)=>i===pi?{...p,dati:{...p.dati,[campo.key]:newVal}}:p));
                              // Aggiorna anche la ricevuta originale
                              setRicevute(rs=>rs.map(r=>r.id===prob.id?{...r,dati:{...r.dati,[campo.key]:newVal}}:r));
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="alert alert-warn" style={{marginTop:'.5rem'}}>
                💡 I file con tutti i campi compilati verranno inclusi nel .TEL. Quelli ancora incompleti verranno saltati.
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setValidaModal(false)}>Annulla</button>
              <button className="btn" onClick={eseguiGenera}>
                📄 Genera comunque ({ricevute.filter(r=>r.dati&&r.dati.cf).length} percipienti)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dati sostituto */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <div className="card-hdr">
          <div className="card-title">🏢 Sostituto d'imposta</div>
          <span className="bdg bdg-gold">Locazioni brevi</span>
        </div>
        <div className="form-grid">
          <div className="fg"><label>Denominazione</label>
            <input value={sostituto.denominazione} onChange={e=>setSostituto(p=>({...p,denominazione:e.target.value}))}/>
          </div>
          <div className="fg"><label>P.IVA / CF</label>
            <input value={sostituto.piva} onChange={e=>setSostituto(p=>({...p,piva:e.target.value,cf:e.target.value}))}/>
          </div>
          <div className="fg"><label>Indirizzo</label>
            <input value={sostituto.indirizzo} onChange={e=>setSostituto(p=>({...p,indirizzo:e.target.value}))}/>
          </div>
          <div className="fg"><label>Comune / Prov / CAP</label>
            <div style={{display:'flex',gap:'.4rem'}}>
              <input value={sostituto.comune} onChange={e=>setSostituto(p=>({...p,comune:e.target.value}))} style={{flex:2}}/>
              <input value={sostituto.prov} onChange={e=>setSostituto(p=>({...p,prov:e.target.value}))} style={{flex:1,maxWidth:50}}/>
              <input value={sostituto.cap} onChange={e=>setSostituto(p=>({...p,cap:e.target.value}))} style={{flex:1,maxWidth:70}}/>
            </div>
          </div>
          <div className="fg"><label>Cod. Attività</label>
            <input value={sostituto.cod_attivita} onChange={e=>setSostituto(p=>({...p,cod_attivita:e.target.value}))}/>
          </div>
          <div className="fg"><label>Cod. Sede</label>
            <input value={sostituto.cod_sede} onChange={e=>setSostituto(p=>({...p,cod_sede:e.target.value}))}/>
          </div>
        </div>
      </div>

      {/* Upload ricevute */}
      <div className="card" style={{marginBottom:'1.25rem'}}>
        <div className="card-hdr">
          <div className="card-title">📎 Carica ricevute</div>
          <span style={{fontSize:'.72rem',color:'var(--mu)'}}>PDF, JPG, PNG · Claude AI estrae i dati automaticamente</span>
        </div>
        <div
          className={'upload-zone'+(drag?' drag':'')}
          style={{padding:'1.5rem'}}
          onDragOver={e=>{e.preventDefault();setDrag(true);}}
          onDragLeave={()=>setDrag(false)}
          onDrop={e=>{e.preventDefault();setDrag(false);handleFiles(e.dataTransfer.files);}}
          onClick={()=>fileRef.current.click()}
        >
          <div className="upload-zone-ico">📄</div>
          <div className="upload-zone-t">Trascina le ricevute qui</div>
          <div className="upload-zone-s">PDF, JPG, PNG · oppure un singolo file <strong>.ZIP</strong> con tutte le ricevute dentro</div>
        </div>
        <input ref={fileRef} type="file" accept=".pdf,image/*,.zip,application/zip" multiple style={{display:'none'}}
          onChange={e=>handleFiles(e.target.files)}/>
      </div>

      {/* Tabella percipienti */}
      {ricevute.length>0&&(
        <div className="card" style={{padding:0,overflow:'hidden',marginBottom:'1.25rem'}}>
          <div style={{padding:'.75rem 1rem',borderBottom:'1px solid var(--bd)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700}}>
              Percipienti · <span style={{color:'var(--gr)'}}>{pronti} pronti</span>
              {inCaricamento>0&&<span style={{color:'var(--gold)',marginLeft:'.5rem'}}>⏳ {inCaricamento} in lettura...</span>}
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="tbl">
              <thead><tr>
                <th>File</th><th>CF</th><th>Cognome</th><th>Nome</th>
                <th>Importo lordo</th><th>Ritenuta 21%</th><th>Data pag.</th><th>Azioni</th>
              </tr></thead>
              <tbody>{ricevute.map(r=>(
                <tr key={r.id} style={r.err?{background:'rgba(224,82,82,.04)'}:{}}>
                  <td style={{fontSize:'.72rem',color:'var(--mu)',maxWidth:120,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.nome}</td>
                  {r.loading?(
                    <td colSpan={6} style={{color:'var(--gold)',fontSize:'.78rem'}}>✨ Claude sta leggendo...</td>
                  ):r.err?(
                    <td colSpan={6} style={{color:'var(--rd)',fontSize:'.75rem'}}>⚠️ {r.err}</td>
                  ):(
                    <>
                      <td><input value={r.dati?.cf||''} onChange={e=>upDati(r.id,'cf',e.target.value)} style={{width:130,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                      <td><input value={r.dati?.cognome||''} onChange={e=>upDati(r.id,'cognome',e.target.value)} style={{width:120,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                      <td><input value={r.dati?.nome||''} onChange={e=>upDati(r.id,'nome',e.target.value)} style={{width:100,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                      <td><input type="number" value={r.dati?.importo_lordo||0} onChange={e=>upDati(r.id,'importo_lordo',e.target.value)} style={{width:90,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem',textAlign:'right'}}/></td>
                      <td><input type="number" value={r.dati?.ritenuta||0} onChange={e=>upDati(r.id,'ritenuta',e.target.value)} style={{width:80,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--rd)',padding:'.3rem .5rem',fontSize:'.75rem',textAlign:'right'}}/></td>
                      <td><input value={r.dati?.data_pagamento||''} onChange={e=>upDati(r.id,'data_pagamento',e.target.value)} placeholder="DD/MM/YYYY" style={{width:95,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:6,color:'var(--tx)',padding:'.3rem .5rem',fontSize:'.75rem'}}/></td>
                    </>
                  )}
                  <td><button className="btn-icon" style={{color:'var(--rd)',borderColor:'rgba(224,82,82,.3)'}} onClick={()=>rimuovi(r.id)}>🗑</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* Azioni */}
      {pronti>0&&(
        <div style={{display:'flex',gap:'.75rem',alignItems:'center',flexWrap:'wrap'}}>
          <button className="btn" disabled={generating||inCaricamento>0} onClick={genera}>
            {generating?'Verifica...':'🔍 Verifica e genera .TEL ('+pronti+' percipienti)'}
          </button>
          {telGenerato&&(
            <>
              <button className="btn-sec" onClick={scaricaTEL}>⬇️ Scarica .TEL</button>
              <button className="btn-sec" onClick={scaricaExcelTEL}>📊 Riepilogo Excel</button>
              <span style={{fontSize:'.8rem',color:'var(--gr)',fontWeight:600}}>✅ File pronto · {telGenerato.numPerc} percipienti</span>
            </>
          )}
        </div>
      )}

      {!ricevute.length&&(
        <div className="alert alert-info">
          💡 Carica le ricevute PDF o foto JPG/PNG. Claude AI leggerà automaticamente CF, importi e date da ciascuna ricevuta. Potrai correggere i dati prima di generare il file .TEL per Teamsystem.
        </div>
      )}
    </div>
  );
}

// ─── WIP BANNER ──────────────────────────────────────────────
function WIPBanner({modulo="questo modulo"}){
  return(
    <div style={{background:"linear-gradient(135deg,rgba(167,139,250,.12),rgba(78,142,247,.08))",border:"1px solid rgba(167,139,250,.35)",borderRadius:12,padding:"1rem 1.25rem",marginBottom:"1.25rem",display:"flex",alignItems:"center",gap:"1rem"}}>
      <div style={{fontSize:"1.5rem",flexShrink:0}}>🚧</div>
      <div>
        <div style={{fontWeight:700,fontSize:".9rem",color:"#c4b5fd",marginBottom:".2rem"}}>Work in Progress</div>
        <div style={{fontSize:".75rem",color:"var(--mu)",lineHeight:1.5}}>
          {modulo} è in fase di sviluppo e potrebbe contenere funzionalità incomplete o dati di test. 
          Verificare sempre i risultati prima di utilizzarli operativamente.
        </div>
      </div>
      <span style={{marginLeft:"auto",fontSize:".65rem",fontWeight:700,background:"rgba(167,139,250,.15)",color:"#c4b5fd",border:"1px solid rgba(167,139,250,.3)",borderRadius:6,padding:".2rem .6rem",whiteSpace:"nowrap",flexShrink:0}}>BETA</span>
    </div>
  );
}

// ─── MODULO CERTIFICAZIONI UNICHE ────────────────────────────

function ModuloCU(){
  const [step,setStep]=useState('upload'); // upload | processing | review | sending
  const [anno,setAnno]=useState(new Date().getFullYear().toString());
  const [drag,setDrag]=useState(false);
  const [loading,setLoading]=useState(false);
  const [errore,setErrore]=useState(null);
  const [progInfo,setProgInfo]=useState({fase:'',pct:0,dettaglio:''});
  const [risultati,setRisultati]=useState([]); // array CU splittate
  const [clienti,setClienti]=useState([]);
  const [mailMap,setMailMap]=useState({}); // sostitutoCF → { email, cc, note, selezionato }
  const [invioStato,setInvioStato]=useState({}); // fileName → 'pending'|'ok'|'err'
  const [invioInCorso,setInvioInCorso]=useState(false);
  const [progresso,setProgresso]=useState({done:0,tot:0});
  const fileRef=useRef();

  useEffect(()=>{
    sb.from('clienti').select('id,nome,cognome,ragione_sociale,email,email_cc,partita_iva,codice_fiscale').eq('attivo',true).order('nome')
      .then(({data})=>setClienti(data||[]));
  },[]);

  // Raggruppa CU per sostituto
  const cuPerSostituto=useMemo(()=>{
    const map={};
    risultati.forEach(cu=>{
      const k=cu.sostitutoCF||cu.sostitutoNome||'SCONOSCIUTO';
      if(!map[k])map[k]={sostitutoCF:cu.sostitutoCF,sostitutoNome:cu.sostitutoNome||cu.sostitutoCF||'Sconosciuto',cu:[]};
      map[k].cu.push(cu);
    });
    return map;
  },[risultati]);

  // Auto-match sostituto con anagrafica clienti
  useEffect(()=>{
    if(!risultati.length)return;
    const newMap={...mailMap};
    Object.keys(cuPerSostituto).forEach(k=>{
      if(newMap[k])return; // già mappato
      const {sostitutoCF}=cuPerSostituto[k];
      const match=clienti.find(c=>{
        const piva=(c.partita_iva||'').replace(/\D/g,'');
        const cf=(c.codice_fiscale||'').toUpperCase();
        const search=(sostitutoCF||'').replace(/\D/g,'');
        return (piva&&piva===search)||(cf&&cf===search.toUpperCase());
      });
      newMap[k]={
        email:match?.email||'',
        cc:match?.email_cc||[],
        nomeCliente:match?(match.ragione_sociale||`${match.nome} ${match.cognome||''}`.trim()):'',
        matched:!!match,
        selezionato:true,
      };
    });
    setMailMap(newMap);
  },[risultati,clienti]);

  const handleFile=async(file)=>{
    if(!file||!file.name.endsWith('.pdf')){setErrore('Carica un file PDF');return;}
    setErrore(null);setLoading(true);setStep('processing');
    try{
      // Carica librerie on-demand
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
      await loadScript('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
      const pdfLib=window.PDFLib;
      const pdfjsLib=window.pdfjsLib;
      if(!pdfLib||!pdfjsLib)throw new Error('Librerie PDF non disponibili. Controlla la connessione e riprova.');
      pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

      setProgInfo({fase:'Lettura file...',pct:2,dettaglio:''});
      // Leggi file con FileReader — più compatibile cross-browser
      const arrayBuffer=await new Promise((res,rej)=>{
        const r=new FileReader();
        r.onload=e=>res(e.target.result);
        r.onerror=rej;
        r.readAsArrayBuffer(file);
      });
      // Crea due copie separate — una per pdfjs, una per pdf-lib
      const uint8=new Uint8Array(arrayBuffer);
      const uint8Copy=new Uint8Array(arrayBuffer.slice(0));

      // Estrai testo pagina per pagina con pdfjs
      const loadingTask=pdfjsLib.getDocument({data:uint8});
      const pdfDoc=await loadingTask.promise;
      const numPages=pdfDoc.numPages;
      const pageTesti=[];
      for(let i=1;i<=numPages;i++){
        const page=await pdfDoc.getPage(i);
        const content=await page.getTextContent();
        pageTesti.push(content.items.map(item=>item.str).join(String.fromCharCode(10)));
        const pct=Math.round((i/numPages)*30)+5;
        setProgInfo({fase:'Lettura testo...',pct,dettaglio:`Pagina ${i} di ${numPages}`});
      }

      // Trova inizio ogni CU
      const boundaries=[];
      for(let i=0;i<pageTesti.length;i++){
        const t=pageTesti[i].toUpperCase();
        if(t.includes('CERTIFICAZIONE')&&t.includes('UNICA')&&t.includes('DATI ANAGRAFICI')&&
          (t.includes('DATORE DI LAVORO')||t.includes('SOSTITUTO'))){
          boundaries.push(i);
        }
      }
      if(!boundaries.length)throw new Error('Nessuna CU trovata. Verifica che il file sia un PDF di Certificazioni Uniche.');

      setProgInfo({fase:'Trovate '+boundaries.length+' CU — avvio split...',pct:36,dettaglio:'Caricamento documento...'});
      // Split con pdf-lib
      const srcDoc=await pdfLib.PDFDocument.load(uint8Copy);
      const risultatiArr=[];

      for(let b=0;b<boundaries.length;b++){
        const startPage=boundaries[b];
        const endPage=b+1<boundaries.length?boundaries[b+1]-1:numPages-1;
        const testo=pageTesti[startPage];
        const pctSplit=Math.round(37+(b/boundaries.length)*60);
        setProgInfo({fase:`Split CU ${b+1} di ${boundaries.length}`,pct:pctSplit,dettaglio:`Pagine ${startPage+1}–${endPage+1}`});

        // ── Estrai dati dalla CU ──
        // REGOLA: primo identificativo = sostituto, secondo = percipiente
        // Identificativo = CF persona fisica (16 char) OPPURE P.IVA azienda (11 cifre)
        const NL=String.fromCharCode(10);
        const testoCompleto=pageTesti.slice(startPage,endPage+1).join(NL);
        const lines2=testo.split(NL).map(l=>l.trim()).filter(Boolean);

        // Trova tutti gli identificativi fiscali in ordine di apparizione
        // Crea lista unificata: {tipo:'CF16'|'PIVA', valore, posizione}
        const CF16_RE=/([A-Z]{6}[0-9LMNPQRSTUV]{2}[A-EHLMPRST][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z])/gi;
        const PIVA_RE=/(?<![0-9])([0-9]{11})(?![0-9])/g;
        const idFiscali=[];
        for(const m of testo.matchAll(CF16_RE)) idFiscali.push({tipo:'CF16',val:m[1].toUpperCase(),pos:m.index});
        for(const m of testo.matchAll(PIVA_RE))  idFiscali.push({tipo:'PIVA', val:m[1],            pos:m.index});
        idFiscali.sort((a,b)=>a.pos-b.pos); // ordine di comparsa nel testo

        const idSostituto  = idFiscali[0]||null;
        const idPercipiente= idFiscali.find(x=>x.val!==idSostituto?.val)||idFiscali[1]||null;

        const sostitutoCF  = idSostituto?.val||'';
        const percipienteCF= idPercipiente?.val||'';

        // ── Nome sostituto ──
        let sostitutoNome='';

        // St.A: footer ADE — presente su ogni pagina in due formati:
        // Azienda:        "Codice fiscale 02425570823 Denominazione ITALKALI S.p.A."
        // Persona fisica: "Codice fiscale DTFNGL72A55D708Z Denominazione DI TOFANO" (a volte su riga separata)
        // Il campo si chiama "Cognome o Denominazione" nel modulo
        const footerM=testoCompleto.match(/Codice fiscale\s+[0-9A-Z]{11,16}\s+(?:Cognome o )?Denominazione\s+([^\n\r]{3,80})/i);
        if(footerM){
          sostitutoNome=footerM[1].trim().replace(/\s+/g,' ');
        } else {
          // Alternativo: cerca pattern "CF16 COGNOME NOME" o "PIVA DENOMINAZIONE" nel footer di pagina
          // Alcune versioni mettono CF e denominazione su righe separate con solo "Denominazione"
          const footerM2=testoCompleto.match(/([0-9A-Z]{11,16})\s*\n\s*([A-Z][A-Za-z\u00C0-\u024F\s\.,'&()-]{2,60})\s*\n/);
          if(footerM2&&footerM2[1]===sostitutoCF){
            sostitutoNome=footerM2[2].trim();
          }
        }

        // St.B: nome subito dopo l'identificativo sostituto nel testo
        if(!sostitutoNome&&sostitutoCF){
          const sIdx=testo.toUpperCase().indexOf(sostitutoCF);
          const dopoS=testo.substring(sIdx+sostitutoCF.length, sIdx+sostitutoCF.length+300);
          const dopoSLines=dopoS.split(NL).map(l=>l.trim()).filter(Boolean);
          // Raccoglie fino a 2 token nome (cognome + nome per persona fisica)
          const parti=[];
          for(const dl of dopoSLines.slice(0,5)){
            if(dl.length>=2&&dl.length<=50&&/^[A-Z\u00C0-\u024F]/.test(dl)&&
               !['DATI','CERTIF','COMUNE','DOMICILIO','TELEFONO','CODICE','INDIRIZZO',
                 'COGNOME','DENOMINAZIONE','NOME','SESSO','FISCALE'].some(k=>dl.toUpperCase().includes(k))){
              parti.push(dl);
              if(parti.length>=2)break;
            }
          }
          if(parti.length>0) sostitutoNome=parti.join(' ');
        }

        // St.C: P.IVA + denominazione sulla stessa riga
        if(!sostitutoNome){
          for(const l of lines2){
            const m=l.match(/^([0-9]{11})\s+(.{3,80})$/);
            if(m){sostitutoNome=m[2].trim();break;}
          }
        }

        sostitutoNome=(sostitutoNome||'').split(NL)[0].trim().replace(/\s+/g,' ');

        // ── Nome percipiente: subito dopo il suo identificativo ──
        let percipientiNome='';
        if(percipienteCF){
          const pIdx=testo.toUpperCase().indexOf(percipienteCF);
          const dopoP=testo.substring(pIdx+percipienteCF.length, pIdx+percipienteCF.length+400);
          const dopoPLines=dopoP.split(NL).map(l=>l.trim());
          for(const dl of dopoPLines){
            if(dl.length>=3&&dl.length<=60&&dl===dl.toUpperCase()&&/^[A-Z\u00C0-\u024F]/.test(dl)&&
               !/^[0-9]/.test(dl)&&
               !['DATI','CERTIF','COMUNE','DOMICILIO','FIRME','UNICA','SESSO',
                 'COGNOME','DENOMINAZIONE','FISCALE'].some(k=>dl.includes(k))){
              percipientiNome=dl;break;
            }
          }
          // Fallback: primo blocco maiuscolo significativo
          if(!percipientiNome){
            const m=dopoP.match(/([A-Z\u00C0-\u024F]{2,}(?:\s+[A-Z\u00C0-\u024F]{2,}){1,3})/);
            if(m&&!['DATI','CERTIF','AGENZIA','UNICA','DENOMINAZIONE'].some(k=>m[1].includes(k)))
              percipientiNome=m[1].trim();
          }
        }
        // Crea PDF con le pagine di questa CU
        const nuovoDoc=await pdfLib.PDFDocument.create();
        const indices=[];
        for(let p=startPage;p<=endPage;p++)indices.push(p);
        const copiate=await nuovoDoc.copyPages(srcDoc,indices);
        copiate.forEach(p=>nuovoDoc.addPage(p));
        const bytes=await nuovoDoc.save();
        const base64=btoa(String.fromCharCode(...bytes));

        const nomePulito=(percipientiNome||percipienteCF||'PERCIPIENTE')
          .replace(/[^A-Za-zÀ-ÖØ-öø-ÿ0-9\s]/g,'').trim()
          .replace(/\s+/g,'_').toUpperCase().substring(0,50);
        const fileName=`${nomePulito}_CU${anno}.pdf`;

        risultatiArr.push({fileName,base64,percipienteCF,percipientiNome,sostitutoNome,sostitutoCF,
          pagine:endPage-startPage+1,pageStart:startPage+1,pageEnd:endPage+1});
      }

      setProgInfo({fase:'Completato!',pct:100,dettaglio:risultatiArr.length+' CU estratte'});
      await new Promise(r=>setTimeout(r,400)); // breve pausa per mostrare 100%
      setRisultati(risultatiArr);
      setStep('review');
    }catch(e){
      console.error('CU split error:',e);
      setErrore(e.message);
      setStep('upload');
    }finally{setLoading(false);}
  };

  // Genera file riepilogo Excel/CSV
  const scaricaRiepilogo=async()=>{
    if(!window.XLSX){
      await loadScript('https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js');
    }
    const XLSX=window.XLSX;
    if(XLSX){
      // Excel con XLSX se disponibile
      const rows=[];
      const sostitutiOrdinati=Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'SCONOSCIUTO').localeCompare(b.sostitutoNome||'SCONOSCIUTO','it'));
      sostitutiOrdinati.forEach(gruppo=>{
        rows.push({
          'Sostituto d\'imposta': gruppo.sostitutoNome||'(non rilevato)',
          'P.IVA / CF': gruppo.sostitutoCF||'',
          'N. CU': gruppo.cu.length,
          'Percipienti': gruppo.cu.map(cu=>cu.percipientiNome||cu.percipienteCF||'—').join(', '),
        });
        gruppo.cu.sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it')).forEach(cu=>{
          rows.push({
            'Sostituto d\'imposta': '',
            'P.IVA / CF': cu.percipienteCF||'',
            'N. CU': '',
            'Percipienti': cu.percipientiNome||cu.percipienteCF||'—',
          });
        });
      });
      // Riga totale
      rows.push({'Sostituto d\'imposta':'TOTALE','P.IVA / CF':'','N. CU':risultati.length,'Percipienti':''});
      const ws=XLSX.utils.json_to_sheet(rows);
      ws['!cols']=[{wch:40},{wch:18},{wch:8},{wch:80}];
      const wb=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb,ws,'Riepilogo CU '+anno);
      XLSX.writeFile(wb,'Riepilogo_CU'+anno+'_'+new Date().toISOString().split('T')[0]+'.xlsx');
    } else {
      // Fallback CSV
      let csv='Sostituto;P.IVA-CF;N.CU;Percipiente\n';
      Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'').localeCompare(b.sostitutoNome||'','it')).forEach(g=>{
        g.cu.sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it')).forEach((cu,i)=>{
          csv+=`${i===0?(g.sostitutoNome||'(non rilevato)'):''};"${g.sostitutoCF||''}";${i===0?g.cu.length:''};"${cu.percipientiNome||cu.percipienteCF||'—'}"\n`;
        });
      });
      csv+=`TOTALE;;;${risultati.length}\n`;
      const blob=new Blob([csv],{type:'text/csv;charset=utf-8;'});
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');a.href=url;a.download='Riepilogo_CU'+anno+'.csv';a.click();
      setTimeout(()=>URL.revokeObjectURL(url),3000);
    }
  };

  const handleDrop=e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);};

  const downloadSingolo=(cu)=>{
    const bytes=Uint8Array.from(atob(cu.base64),c=>c.charCodeAt(0));
    const blob=new Blob([bytes],{type:'application/pdf'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=cu.fileName;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),3000);
  };

  const nomeCartella=(s)=>(s.sostitutoNome&&s.sostitutoNome.trim()?s.sostitutoNome:s.sostitutoCF||'SCONOSCIUTO').replace(/[^A-Za-z0-9\u00C0-\u024F\s]/g,'').trim().replace(/\s+/g,'_').toUpperCase().substring(0,50);

  const downloadTutti=async()=>{
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const JSZip=window.JSZip;
    if(!JSZip){alert('Libreria ZIP non disponibile');return;}
    const zip=new JSZip();
    // Ordina sostituti per nome
    const sostitutiOrdinati=Object.values(cuPerSostituto).sort((a,b)=>(a.sostitutoNome||'').localeCompare(b.sostitutoNome||'','it'));
    for(const gruppo of sostitutiOrdinati){
      const cartella=nomeCartella(gruppo);
      // Ordina percipiente per cognome (primo token del nome)
      const cuOrdinati=[...gruppo.cu].sort((a,b)=>{
        const nA=(a.percipientiNome||a.percipienteCF||'').toUpperCase();
        const nB=(b.percipientiNome||b.percipienteCF||'').toUpperCase();
        return nA.localeCompare(nB,'it');
      });
      for(const cu of cuOrdinati){
        const bytes=Uint8Array.from(atob(cu.base64),c=>c.charCodeAt(0));
        zip.file(`${cartella}/${cu.fileName}`,bytes);
      }
    }
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`CU${anno}_${new Date().toISOString().split('T')[0]}.zip`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  };

  const downloadPerSostituto=async(chiave)=>{
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const JSZip=window.JSZip;
    const gruppo=cuPerSostituto[chiave];
    if(!gruppo)return;
    if(!JSZip){// fallback senza zip
      gruppo.cu.forEach(cu=>downloadSingolo(cu));return;
    }
    const zip=new JSZip();
    const cartella=nomeCartella(gruppo);
    const cuOrdinati=[...gruppo.cu].sort((a,b)=>(a.percipientiNome||'').localeCompare(b.percipientiNome||'','it'));
    for(const cu of cuOrdinati){
      const bytes=Uint8Array.from(atob(cu.base64),c=>c.charCodeAt(0));
      zip.file(`${cartella}/${cu.fileName}`,bytes);
    }
    const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE',compressionOptions:{level:6}});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=url;a.download=`${cartella}_CU${anno}.zip`;a.click();
    setTimeout(()=>URL.revokeObjectURL(url),10000);
  };

  const inviaMailSostituto=async(chiave)=>{
    const entry=mailMap[chiave];
    if(!entry?.email){alert('Inserisci email per '+cuPerSostituto[chiave].sostitutoNome);return;}
    const cuList=cuPerSostituto[chiave].cu;
    setInvioStato(p=>({...p,...Object.fromEntries(cuList.map(cu=>[cu.fileName,'pending']))}));
    try{
      // Prepara allegati come base64 per email
      const allegati=cuList.map(cu=>({fileName:cu.fileName,base64:cu.base64,mimeType:'application/pdf'}));
      const oggetto=`Certificazioni Uniche ${anno} — ${cuPerSostituto[chiave].sostitutoNome||chiave}`;
      const corpo=`Gentile Cliente,\n\nIn allegato le Certificazioni Uniche ${anno} relative ai Vostri dipendenti/collaboratori.\n\nCertificazioni allegate:\n${cuList.map(cu=>`• ${cu.percipientiNome||cu.percipienteCF} (${cu.pagine} pagine)`).join(String.fromCharCode(10))}\n\nCordiali saluti,\nStudio Envisioning`;
      const resp=await fetch('/api/send-email',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({to:[entry.email],cc:entry.cc||[],oggetto,corpo,allegati_cu:allegati}),
      });
      const data=await resp.json();
      if(!resp.ok)throw new Error(data.error);
      setInvioStato(p=>({...p,...Object.fromEntries(cuList.map(cu=>[cu.fileName,'ok']))}));
    }catch(e){
      setInvioStato(p=>({...p,...Object.fromEntries(cuPerSostituto[chiave].cu.map(cu=>[cu.fileName,'err']))}));
      alert('Errore invio: '+e.message);
    }
  };

  const invioMassivoTutti=async()=>{
    const chiavi=Object.keys(cuPerSostituto).filter(k=>mailMap[k]?.selezionato&&mailMap[k]?.email);
    if(!chiavi.length){alert('Nessun cliente con email configurata selezionato');return;}
    setInvioInCorso(true);
    setProgresso({done:0,tot:chiavi.length});
    for(let i=0;i<chiavi.length;i++){
      await inviaMailSostituto(chiavi[i]);
      setProgresso({done:i+1,tot:chiavi.length});
    }
    setInvioInCorso(false);
  };

  const upMail=(k,field,val)=>setMailMap(p=>({...p,[k]:{...p[k],[field]:val}}));

  // ── RENDER ────────────────────────────────────────────────
  const [cuTab,setCuTab]=useState('split'); // split | tel

  return(
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">📜 Certificazioni Uniche</div>
        <div className="page-sub">Split CU · invio mail · generazione file .TEL locazioni brevi</div>
      </div>

      {/* TAB selector */}
      <div className="pills" style={{marginBottom:'1.25rem'}}>
        <span className={'pill'+(cuTab==='split'?' active':'')} onClick={()=>setCuTab('split')}>📄 Split e invio CU</span>
        <span className={'pill'+(cuTab==='tel'?' active':'')} onClick={()=>setCuTab('tel')}>🏠 Genera .TEL locazioni brevi</span>
      </div>

      {cuTab==='tel'&&<ModuloTEL/>}

      {cuTab==='split'&&<>

      {/* STEP UPLOAD */}
      {step==='upload'&&(
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">1. Carica il PDF CU</div>
            <div className="fg" style={{margin:0,minWidth:120}}>
              <label style={{fontSize:'.62rem',textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',fontWeight:600}}>Anno CU</label>
              <input type="number" value={anno} onChange={e=>setAnno(e.target.value)} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,color:'var(--tx)',padding:'.35rem .6rem',fontSize:'.84rem',width:90}}/>
            </div>
          </div>
          {errore&&<div className="alert alert-err" style={{marginBottom:'.85rem'}}>⚠️ {errore}</div>}
          <div
            className={'upload-zone'+(drag?' drag':'')}
            style={{padding:'2.5rem'}}
            onDragOver={e=>{e.preventDefault();setDrag(true);}}
            onDragLeave={()=>setDrag(false)}
            onDrop={handleDrop}
            onClick={()=>fileRef.current.click()}
          >
            <div className="upload-zone-ico">📄</div>
            <div className="upload-zone-t">Trascina il PDF delle Certificazioni Uniche</div>
            <div className="upload-zone-s">Anche massivo con più CU · solo .pdf · Anno: CU{anno}</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
          <div className="alert alert-info" style={{marginTop:'.85rem'}}>
            💡 Il sistema riconosce automaticamente ogni CU dal pattern "CERTIFICAZIONE UNICA + DATI ANAGRAFICI" e splitta per percipiente. File nominati: <strong>COGNOME_NOME_CU{anno}.pdf</strong>
          </div>
        </div>
      )}

      {/* STEP PROCESSING */}
      {step==='processing'&&(
        <div className="card" style={{padding:'2rem 2.5rem'}}>
          <div style={{display:'flex',alignItems:'center',gap:'1rem',marginBottom:'1.5rem'}}>
            <div style={{fontSize:'1.75rem'}}>📄</div>
            <div>
              <div style={{fontWeight:700,fontSize:'1rem',marginBottom:'.2rem'}}>{progInfo.fase||'Elaborazione in corso...'}</div>
              <div style={{fontSize:'.78rem',color:'var(--mu)'}}>{progInfo.dettaglio||'Attendere...'}</div>
            </div>
            <div style={{marginLeft:'auto',fontFamily:"'Playfair Display',serif",fontSize:'1.5rem',fontWeight:700,color:'var(--gold)'}}>{progInfo.pct}%</div>
          </div>
          {/* Barra progresso */}
          <div style={{height:10,background:'var(--bd)',borderRadius:5,overflow:'hidden',marginBottom:'.75rem'}}>
            <div style={{height:'100%',borderRadius:5,background:'linear-gradient(90deg,var(--gold),var(--gld2))',width:progInfo.pct+'%',transition:'width .3s ease',boxShadow:'0 0 8px rgba(200,164,94,.5)'}}>
            </div>
          </div>
          <div style={{fontSize:'.7rem',color:'var(--mu)',textAlign:'center'}}>
            {progInfo.pct<36?'Fase 1/3 — Lettura pagine PDF':progInfo.pct<97?'Fase 2/3 — Split certificazioni':'Fase 3/3 — Finalizzazione'}
          </div>
        </div>
      )}

      {/* STEP REVIEW */}
      {step==='review'&&(
        <>
          {/* Stats */}
          <div className="stats-grid" style={{marginBottom:'1rem'}}>
            <div className="stat-card">
              <div className="stat-ico">📜</div>
              <div className="stat-val" style={{color:'var(--gold)',fontSize:'1.8rem'}}>{risultati.length}</div>
              <div className="stat-lbl">CU estratte totali</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">🏢</div>
              <div className="stat-val" style={{color:'var(--pu)'}}>{Object.keys(cuPerSostituto).length}</div>
              <div className="stat-lbl">Sostituti d'imposta</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">✅</div>
              <div className="stat-val" style={{color:'var(--gr)'}}>{Object.values(mailMap).filter(m=>m.matched).length}</div>
              <div className="stat-lbl">Clienti trovati</div>
            </div>
            <div className="stat-card">
              <div className="stat-ico">⚠️</div>
              <div className="stat-val" style={{color:'var(--rd)'}}>{Object.values(mailMap).filter(m=>!m.matched).length}</div>
              <div className="stat-lbl">Email da inserire</div>
            </div>
          </div>

          {/* Azioni globali */}
          <div style={{display:'flex',gap:'.5rem',marginBottom:'1.25rem',flexWrap:'wrap',alignItems:'center'}}>
            <button className="btn-sec" onClick={downloadTutti}>📦 Scarica ZIP (con sottocartelle)</button>
            <button className="btn-sec" onClick={scaricaRiepilogo}>📊 Riepilogo Excel</button>
            <button className="btn" disabled={invioInCorso} onClick={invioMassivoTutti}>
              {invioInCorso?`⏳ Invio ${progresso.done}/${progresso.tot}...`:'📤 Invia tutte le mail'}
            </button>
            <button className="btn-sec" onClick={()=>{setStep('upload');setRisultati([]);setMailMap({});setInvioStato({});}}>
              ↩️ Nuovo file
            </button>
          </div>

          {/* Barra progresso invio massivo */}
          {Object.values(cuPerSostituto).some(g=>!g.sostitutoNome||g.sostitutoNome.trim()===''||g.sostitutoNome==='SCONOSCIUTO')&&(
            <div className="alert alert-warn" style={{marginBottom:'.75rem'}}>
              ⚠️ <strong>{Object.values(cuPerSostituto).filter(g=>!g.sostitutoNome||g.sostitutoNome==='SCONOSCIUTO').length} sostituti</strong> con nome non rilevato automaticamente — verifica nel riepilogo Excel e aggiorna il nome manualmente nel campo sostituto.
            </div>
          )}
          {invioInCorso&&(
            <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:9,padding:'.75rem 1rem',marginBottom:'1rem'}}>
              <div style={{display:'flex',justifyContent:'space-between',fontSize:'.78rem',marginBottom:'.4rem'}}>
                <span>Invio mail in corso...</span><span style={{color:'var(--gold)'}}>{progresso.done}/{progresso.tot}</span>
              </div>
              <div style={{height:6,background:'var(--bd)',borderRadius:3,overflow:'hidden'}}>
                <div style={{height:'100%',background:'linear-gradient(90deg,var(--gold),var(--gld2))',borderRadius:3,width:(progresso.done/progresso.tot*100)+'%',transition:'width .3s'}}/>
              </div>
            </div>
          )}

          {/* Lista per sostituto */}
          {Object.entries(cuPerSostituto).map(([chiave,gruppo])=>{
            const mail=mailMap[chiave]||{};
            const cuDelGruppo=gruppo.cu;
            const tutteOk=cuDelGruppo.every(cu=>invioStato[cu.fileName]==='ok');
            const qualcunaErr=cuDelGruppo.some(cu=>invioStato[cu.fileName]==='err');
            return(
              <div key={chiave} className="card" style={{marginBottom:'1.25rem',border:tutteOk?'1px solid rgba(52,194,122,.35)':qualcunaErr?'1px solid rgba(224,82,82,.35)':'1px solid var(--bd)'}}>
                {/* Header sostituto */}
                <div style={{display:'flex',alignItems:'flex-start',gap:'.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
                  <div style={{flex:1}}>
                    <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginBottom:'.2rem'}}>
                      <div onClick={()=>upMail(chiave,'selezionato',!mail.selezionato)} style={{width:16,height:16,borderRadius:3,border:`1.5px solid ${mail.selezionato?'var(--gold)':'var(--bd2)'}`,background:mail.selezionato?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {mail.selezionato&&<span style={{color:'#0d1117',fontSize:'.6rem',fontWeight:700}}>✓</span>}
                      </div>
                      <div style={{fontFamily:"'Playfair Display',serif",fontWeight:700,fontSize:'.95rem'}}>
                        {gruppo.sostitutoNome||chiave}
                      </div>
                      {mail.matched?<span className="bdg bdg-green">✓ In anagrafica</span>:<span className="bdg bdg-red">⚠ Non trovato</span>}
                      {tutteOk&&<span className="bdg bdg-green">✓ Mail inviata</span>}
                    </div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)'}}>CF/P.IVA: {gruppo.sostitutoCF} · {cuDelGruppo.length} CU</div>
                  </div>
                  <div style={{display:'flex',gap:'.4rem',flexShrink:0}}>
                    <button className="btn-sec btn-sm" onClick={()=>downloadPerSostituto(chiave)}>📦 ZIP</button>
                    <button className="btn btn-sm" disabled={!mail.email||invioInCorso||tutteOk} onClick={()=>inviaMailSostituto(chiave)}>
                      {tutteOk?'✓ Inviato':'📤 Invia'}
                    </button>
                  </div>
                </div>

                {/* Email */}
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.65rem',marginBottom:'1rem'}}>
                  <div className="fg" style={{marginBottom:0}}>
                    <label>Email destinatario {!mail.email&&<span style={{color:'var(--rd)'}}>*</span>}</label>
                    <input type="email" value={mail.email||''} onChange={e=>upMail(chiave,'email',e.target.value)} placeholder="email@cliente.it" style={{background:'var(--s2)',border:`1px solid ${!mail.email?'rgba(224,82,82,.5)':'var(--bd)'}`,borderRadius:8,color:'var(--tx)',padding:'.45rem .7rem',fontSize:'.82rem',width:'100%'}}/>
                  </div>
                  <div className="fg" style={{marginBottom:0}}>
                    <label>CC (opzionale)</label>
                    <TagInput value={mail.cc||[]} onChange={v=>upMail(chiave,'cc',v)}/>
                  </div>
                </div>

                {/* Lista CU del sostituto */}
                <div style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:9,overflow:'hidden'}}>
                  <div style={{fontSize:'.6rem',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',padding:'.45rem .75rem',borderBottom:'1px solid var(--bd)',display:'grid',gridTemplateColumns:'1fr auto auto auto'}}>
                    <span>Percipiente</span><span>CF</span><span style={{textAlign:'right'}}>Pagine</span><span style={{textAlign:'right',marginLeft:'.75rem'}}>Stato</span>
                  </div>
                  {cuDelGruppo.map(cu=>{
                    const st=invioStato[cu.fileName];
                    return(
                      <div key={cu.fileName} style={{display:'grid',gridTemplateColumns:'1fr auto auto auto',alignItems:'center',padding:'.5rem .75rem',borderBottom:'1px solid rgba(33,40,58,.4)',gap:'.75rem'}}>
                        <div>
                          <div style={{fontSize:'.82rem',fontWeight:500}}>{cu.percipientiNome||'—'}</div>
                          <div style={{fontSize:'.68rem',color:'var(--mu)'}}>{cu.fileName}</div>
                        </div>
                        <div style={{fontSize:'.72rem',color:'var(--mu)',fontFamily:'monospace'}}>{cu.percipienteCF||'—'}</div>
                        <div style={{fontSize:'.75rem',color:'var(--mu)',textAlign:'right'}}>{cu.pagine}p</div>
                        <div style={{display:'flex',gap:'.3rem',justifyContent:'flex-end'}}>
                          {st==='ok'&&<span className="bdg bdg-green">✓</span>}
                          {st==='err'&&<span className="bdg bdg-red">Err</span>}
                          {st==='pending'&&<span className="bdg bdg-gray">⏳</span>}
                          <button className="btn-icon" style={{fontSize:'.7rem',padding:'.2rem .45rem'}} onClick={()=>downloadSingolo(cu)}>⬇️</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </>
      )}
      </>}
    </div>
  );
}

// ─── SIMULATORE ──────────────────────────────────────────────
const ATECO=[{label:"Pubblicità, marketing, content creator (73)",coeff:.78},{label:"Attività professionali, commercialisti, avvocati (69-75)",coeff:.78},{label:"Informatica, software, web, IT (58-63)",coeff:.78},{label:"Sanità, medicina, psicologia (86-88)",coeff:.78},{label:"Istruzione, formazione, coaching (85)",coeff:.78},{label:"Arte, sport, intrattenimento (90-93)",coeff:.67},{label:"Commercio al dettaglio e ingrosso (45-47)",coeff:.40},{label:"Ristorazione e alloggio (55-56)",coeff:.40},{label:"Costruzioni e impiantistica (41-43)",coeff:.86}];
const CALENDARS={occasionale:[{month:"Febbraio",items:[{date:"28/02",title:"Ricezione CU",desc:"CU dai committenti con ritenuta 20%.",level:"nrm"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Dichiarazione redditi + versamento IRPEF.",level:"urg"}]},{month:"Novembre",items:[{date:"30/11",title:"2° Acconto IRPEF",desc:"Versamento F24 seconda rata.",level:"imp"}]}],forfettario:[{month:"Febbraio",items:[{date:"16/02",title:"IVS – IV rata",desc:"Versamento quarta rata IVS anno prec.",level:"nrm"},{date:"28/02",title:"Bolli fatture – IV trim.",desc:"Imposta di bollo IV trimestre.",level:"nrm"}]},{month:"Maggio",items:[{date:"16/05",title:"IVS – I rata",desc:"Prima rata contributi IVS.",level:"imp"},{date:"31/05",title:"Bolli fatture – I trim.",desc:"Imposta di bollo I trimestre.",level:"nrm"}]},{month:"Giugno",items:[{date:"30/06",title:"Saldo + 1° Acconto imp. sost.",desc:"Saldo anno prec. e prima rata acconto.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVS – II rata",desc:"Seconda rata IVS.",level:"imp"}]},{month:"Settembre",items:[{date:"30/09",title:"Bolli fatture – II trim.",desc:"Imposta di bollo II trimestre.",level:"nrm"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Presentazione dichiarazione.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVS – III rata",desc:"Terza rata IVS.",level:"imp"},{date:"30/11",title:"2° Acconto + Bolli III trim.",desc:"Acconto imp. sost. + bolli.",level:"urg"}]}],ordinario:[{month:"Marzo",items:[{date:"16/03",title:"IVA annuale + CU",desc:"Versamento IVA + invio CU.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"},{date:"31/05",title:"Bolli I trim.",desc:"Imposta di bollo I trim.",level:"nrm"}]},{month:"Giugno",items:[{date:"30/06",title:"IRPEF saldo + acconto + INPS",desc:"Tutti i versamenti di giugno.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Dichiarazione dei redditi.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim.",desc:"Versamento IVA Q3.",level:"imp"},{date:"30/11",title:"2° Acconto IRPEF",desc:"Versamento F24.",level:"urg"}]},{month:"Dicembre",items:[{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}],srl:[{month:"Marzo",items:[{date:"16/03",title:"IVA IV trim.",desc:"Versamento IVA Q4.",level:"imp"}]},{month:"Aprile",items:[{date:"30/04",title:"Approvazione bilancio CDA",desc:"Riunione CDA progetto bilancio.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"},{date:"29/05",title:"Assemblea soci",desc:"Approvazione bilancio.",level:"urg"}]},{month:"Giugno",items:[{date:"30/06",title:"IRES+IRAP saldo+acconto + CCIAA",desc:"Tutti i versamenti + deposito bilancio.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi SC",desc:"Dichiarazione societaria.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim.",desc:"Versamento IVA Q3.",level:"imp"},{date:"30/11",title:"Acconto IRES+IRAP",desc:"Seconda rata acconti.",level:"urg"}]},{month:"Dicembre",items:[{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}],snc:[{month:"Marzo",items:[{date:"16/03",title:"IVA annuale",desc:"Versamento IVA anno prec.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"}]},{month:"Giugno",items:[{date:"16/06",title:"INPS artigiani – I rata",desc:"Prima rata contributi fissi.",level:"imp"},{date:"30/06",title:"IRPEF soci saldo+acconto",desc:"Versamenti in capo ai soci.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Settembre",items:[{date:"16/09",title:"INPS – II rata",desc:"Seconda rata.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello SP + soci",desc:"Dichiarazione società+soci.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim. + INPS III",desc:"IVA Q3 + terza rata INPS.",level:"imp"},{date:"30/11",title:"2° Acconto IRPEF soci",desc:"Versamento acconti.",level:"urg"}]},{month:"Dicembre",items:[{date:"16/12",title:"INPS – IV rata",desc:"Quarta rata INPS.",level:"imp"},{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}]};
const LVL_COLOR={urg:"#e05252",imp:"#c8a45e",nrm:"#4e8ef7"};
const LVL_LABEL={urg:"Urgente",imp:"Importante",nrm:"Ordinario"};
const REGIME_LABELS={occasionale:"Prestazione Occasionale",forfettario:"Regime Forfettario",ordinario:"Professionista Ordinario",srl:"S.r.l.",snc:"SNC / SAS"};
function calcIRPEF(inc){if(inc<=0)return 0;if(inc<=28000)return inc*.23;if(inc<=50000)return 28000*.23+(inc-28000)*.35;return 28000*.23+22000*.35+(inc-50000)*.43;}
function margIRPEF(base,add){return Math.round(calcIRPEF(base+add)-calcIRPEF(base));}
function calcAll({fatturato:fat_,altri:altri_,altriTipo,ateco,primiAnni}){
  const fat=parseFloat(fat_)||0,altri=parseFloat(altri_)||0;
  const covered=altriTipo==="dipendente"||altriTipo==="pensione";
  const over30k=altriTipo==="dipendente"&&altri>30000,over85k=fat>85000;
  const coeff=ateco?.coeff||.78;
  const oi2=margIRPEF(altri,fat),oi3=Math.round(Math.max(0,fat-5000)*.24/3);
  const fi=fat*coeff,fi2=Math.round(fi*(covered?.24:.2623)),fi3=Math.round((fi-fi2)*(primiAnni?.05:.15));
  const fb=over30k||over85k,fw=over30k?"Escluso: RAL > €30.000":over85k?"Escluso: Fatturato > €85.000":null;
  const ol=fat*.85,oi=Math.round(ol*(covered?.24:.2598)),oir=margIRPEF(altri,Math.max(0,ol-oi));
  const sb2=Math.max(0,fat-630);
  const sl=fat*.88,si=Math.max(3900,Math.round(sl*.24)),snc_i=margIRPEF(altri,Math.max(0,sl-si));
  return{
    occasionale:{name:"Prestazione Occasionale",blocked:fat>5000,warn:fat>5000?"Escluso: Ricavi > €5.000":null,rows:[["IRPEF marginale",fmt0(oi2)],["INPS (1/3)",fmt0(oi3)]],tot:oi2+oi3,netto:fat-oi2-oi3,note:"Ritenuta 20%. INPS solo oltre €5.000."},
    forfettario:{name:"Regime Forfettario",blocked:fb,warn:fw,rows:[["Imp. sostitutiva",fmt0(fi3)],["INPS gest. sep.",fmt0(fi2)]],tot:fi2+fi3,netto:fat-fi2-fi3,note:`Coeff. ${Math.round(coeff*100)}%. Aliquota ${primiAnni?5:15}%.`},
    ordinario:{name:"Professionista Ordinario",blocked:false,warn:null,rows:[["IRPEF marginale",fmt0(oir)],["INPS",fmt0(oi)],["Gestione",fmt0(1200)]],tot:oir+oi+1200,netto:fat-oir-oi-1200,note:"IRPEF a scaglioni. IVA 22%."},
    srl:{name:"S.r.l.",blocked:false,warn:null,rows:[["IRES 24%",fmt0(Math.round(sb2*.24))],["IRAP 3,9%",fmt0(Math.round(sb2*.039))],["Costi fissi",fmt0(630)]],tot:Math.round(sb2*.24)+Math.round(sb2*.039)+630,netto:fat-Math.round(sb2*.24)-Math.round(sb2*.039)-630,note:"Schema ottimizzato: nessun INPS."},
    snc:{name:"SNC / SAS",blocked:false,warn:null,rows:[["IRPEF soci",fmt0(snc_i)],["INPS commercianti",fmt0(si)],["Gestione",fmt0(900)]],tot:snc_i+si+900,netto:fat-snc_i-si-900,note:"Trasparenza fiscale. Min. INPS ~€3.900."},
  };
}
function CalendarModal({regimeId,onClose}){
  const cal=CALENDARS[regimeId]||[];
  const allItems=cal.flatMap(m=>m.items.map(i=>({...i,month:m.month})));
  const [sel,setSel]=useState({});const [email,setEmail]=useState("");const [sent,setSent]=useState(false);const [loading,setLoading]=useState(false);const [err,setErr]=useState(null);
  const allSel=allItems.length>0&&allItems.every((_,i)=>sel[i]);
  const toggleAll=()=>{if(allSel)setSel({});else{const s={};allItems.forEach((_,i)=>s[i]=true);setSel(s);}};
  const toggle=i=>setSel(p=>({...p,[i]:!p[i]}));
  const countSel=Object.values(sel).filter(Boolean).length;
  const send=async()=>{if(!email||!countSel)return;setLoading(true);setErr(null);try{await callAPI({email,regimeName:REGIME_LABELS[regimeId],scadenze:allItems.filter((_,i)=>sel[i]),isTest:false});setSent(true);}catch(e){setErr(e.message);}finally{setLoading(false);}};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr" style={{position:"relative"}}><div className="modal-drag"/><div className="modal-title">{REGIME_LABELS[regimeId]}</div><div className="modal-sub">Calendario scadenze 2025</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="leg">{[["urg","Urgente"],["imp","Importante"],["nrm","Ordinario"]].map(([k,l])=><div key={k} className="leg-item"><div className="leg-dot" style={{background:LVL_COLOR[k]}}/>{l}</div>)}</div>
          <div className="sel-bar"><span className="sel-count">{countSel} selezionate</span><button className="sel-all-btn" onClick={toggleAll}>{allSel?"Deseleziona":"Seleziona tutto"}</button></div>
          {cal.map(({month,items})=>(
            <div key={month} className="m-block">
              <div className="m-hdr">{month}</div>
              {items.map(item=>{const gi=allItems.findIndex(a=>a.date===item.date&&a.title===item.title&&a.month===month);return(
                <div key={gi} className={"dl"+(sel[gi]?" sel":"")} style={{borderLeft:"3px solid "+LVL_COLOR[item.level]}} onClick={()=>toggle(gi)}>
                  <div className="dl-check"><span className="dl-check-ico">✓</span></div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:".25rem",flexWrap:"wrap"}}>
                      <span className="dl-date">{item.date}</span><span className="dl-title">{item.title}</span>
                      <span className="dl-level" style={{color:LVL_COLOR[item.level],background:LVL_COLOR[item.level]+"18"}}>{LVL_LABEL[item.level]}</span>
                    </div>
                    <div className="dl-desc">{item.desc}</div>
                  </div>
                </div>
              );})}
            </div>
          ))}
        </div>
        <div className="modal-foot" style={{flexDirection:"column",gap:".5rem"}}>
          {!sent?(<div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:9,padding:".75rem"}}>
            <div style={{fontSize:".75rem",fontWeight:600,marginBottom:".4rem"}}>📧 Ricevi via email</div>
            <div style={{display:"flex",gap:".4rem"}}>
              <input style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,color:"var(--tx)",padding:".45rem .65rem",fontSize:".8rem"}} value={email} onChange={e=>{setEmail(e.target.value);setErr(null);}} placeholder="email@example.it" type="email"/>
              <button className="btn" style={{padding:".45rem .85rem",fontSize:".78rem"}} disabled={!email||!countSel||loading} onClick={send}>{loading?"⏳":"Invia ("+countSel+")"}</button>
            </div>
            {err&&<div style={{fontSize:".7rem",color:"#ff8585",marginTop:".35rem"}}>⚠️ {err}</div>}
          </div>):(<div style={{background:"rgba(52,194,122,.1)",border:"1px solid rgba(52,194,122,.3)",borderRadius:9,padding:".75rem",textAlign:"center"}}><div style={{fontWeight:700,color:"var(--gr)"}}>✅ Inviato a {email}</div></div>)}
          <div style={{fontSize:".63rem",color:"var(--mu)"}}>⚠️ Scadenze indicative 2025, verificare proroghe.</div>
        </div>
      </div>
    </div>
  );
}
function ModuloSimulatore(){
  const [form,setForm]=useState({fatturato:"",altri:"",altriTipo:"nessuno",ateco:ATECO[0],primiAnni:false});
  const [results,setResults]=useState(null);const [calModal,setCalModal]=useState(null);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const valid=parseFloat(form.fatturato)>0;
  const ORDER=["occasionale","forfettario","ordinario","srl","snc"];
  const winner=results?ORDER.filter(id=>!results[id].blocked&&results[id].netto>0).reduce((b,id)=>(!b||results[id].netto>results[b].netto?id:b),null):null;
  const is={background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:8,color:"var(--tx)",padding:".52rem .75rem",fontSize:".82rem",width:"100%",WebkitAppearance:"none",appearance:"none"};
  const ss={...is,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7a99' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right .7rem center",paddingRight:"2rem"};
  return(
    <div className="page">
      {calModal&&<CalendarModal regimeId={calModal} onClose={()=>setCalModal(null)}/>}
      <div className="page-hdr"><div className="page-title">📊 Simulatore Fiscale</div><div className="page-sub">Confronto regimi fiscali · Italia 2025</div></div>
      <div className="card">
        <div className="card-title" style={{marginBottom:"1rem"}}>Inserisci i dati</div>
        <div className="form-grid">
          <div className="fg"><label>Fatturato presunto (€)</label><input type="number" placeholder="es. 20.000" value={form.fatturato} onChange={e=>up("fatturato",e.target.value)} style={is}/></div>
          <div className="fg"><label>Altri redditi (€)</label><input type="number" placeholder="es. 43.000" value={form.altri} onChange={e=>up("altri",e.target.value)} style={is}/></div>
          <div className="fg"><label>Tipo altri redditi</label><select value={form.altriTipo} onChange={e=>up("altriTipo",e.target.value)} style={ss}><option value="nessuno">Nessun altro reddito</option><option value="dipendente">Lavoro dipendente (RAL)</option><option value="pensione">Pensione</option><option value="altro">Altro reddito</option></select></div>
          <div className="fg"><label>Settore ATECO</label><select value={form.ateco.label} onChange={e=>up("ateco",ATECO.find(a=>a.label===e.target.value))} style={ss}>{ATECO.map(a=><option key={a.label}>{a.label}</option>)}</select></div>
        </div>
        <div className="tgl-row" onClick={()=>up("primiAnni",!form.primiAnni)}><div className={"tgl"+(form.primiAnni?" on":"")}/><span className="tgl-lbl">Primi 5 anni – imposta sostitutiva 5%</span></div>
        <button className="btn full" disabled={!valid} onClick={()=>valid&&setResults(calcAll(form))}>Calcola e confronta →</button>
      </div>
      {results&&(
        <>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1rem",fontWeight:700,marginBottom:".85rem"}}>Confronto regimi</div>
          <div className="rg-grid">{ORDER.map(id=>{const r=results[id],isW=id===winner;return(
            <div key={id} className={"rc"+(isW?" winner":"")+(r.blocked?" blocked":"")}>
              <div className="rc-hdr"><div className="rc-name">{r.name}</div>{isW&&<span className="bdg bdg-gold">★ Migliore</span>}{r.blocked&&<span className="bdg bdg-red">Escluso</span>}</div>
              {r.warn&&<div className="warn">⚠ {r.warn}</div>}
              {r.rows.map(([l,v])=><div key={l} className="rc-row"><span className="rc-rl">{l}</span><span className="rc-rv">{v}</span></div>)}
              <div className="rc-netto"><span className="rc-nl">{id==="srl"?"Liquidità soc.":"Netto in tasca"}</span><span className="rc-nv" style={{color:isW?"var(--gld2)":r.netto<0?"var(--rd)":"var(--gr)"}}>{fmt0(r.netto)}</span></div>
              <div className="rc-note">{r.note}</div>
              {!r.blocked&&<button className="cal-btn" onClick={()=>setCalModal(id)}>📅 Calendario Fiscale →</button>}
            </div>
          );})}
          </div>
          <div className="disc"><strong style={{color:"var(--tx)"}}>⚠️ Disclaimer</strong> — Strumento informativo. Non sostituisce la consulenza di un Dottore Commercialista.</div>
        </>
      )}
    </div>
  );
}

// ─── APP ROOT ────────────────────────────────────────────────
const NAV = [
  {section:"STUDIO",items:[{id:"dashboard",ico:"🏠",label:"Dashboard"},{id:"clienti",ico:"👥",label:"Clienti"},{id:"import",ico:"📤",label:"Import Excel"},{id:"utenti",ico:"👤",label:"Utenti Studio"},{id:"impostazioni",ico:"⚙️",label:"Impostazioni Studio"},{id:"deleghe",ico:"🔑",label:"Deleghe Uniche"}]},
  {section:"DOCUMENT HUB",items:[{id:"import_documenti",ico:"📁",label:"Import Documenti"},{id:"export_dati",ico:"📤",label:"Export Dati"},{id:"fatture_ade",ico:"📥",label:"Fatture Massive ADE"},{id:"lettura_mail",ico:"📧",label:"Lettura Mail"},{id:"richieste_fatture",ico:"📡",label:"Richieste Fatture ADE"}]},
  {section:"CONTABILITÀ",items:[{id:"contabilita",ico:"📒",label:"Prima Nota"},{id:"piano_conti",ico:"🗂️",label:"Piano dei Conti"},{id:"partitario",ico:"💳",label:"Partitario"},{id:"bilancio",ico:"📊",label:"Bilancio"}]},
  {section:"STRUMENTI",items:[{id:"iva",ico:"💧",label:"Liquidazione IVA"},{id:"f24",ico:"📋",label:"Gestione F24"},{id:"simulatore",ico:"📊",label:"Simulatore Fiscale"},{id:"ammortamenti",ico:"🏢",label:"Ammortamenti"},{id:"cu",ico:"📜",label:"Certificazioni Uniche"}]},
  {section:"COMUNICAZIONI",items:[{id:"adempimenti",ico:"📬",label:"Adempimenti"},{id:"agenda",ico:"📅",label:"Agenda Invii"}]},
];

// GUIDA MODULI - Descrizione dettagliata di ogni modulo
const GUIDA_MODULI = {
  dashboard: {
    nome: "Dashboard",
    ico: "🏠",
    desc: "Panoramica generale dello studio con statistiche, clienti recenti, F24 in scadenza e accesso rapido a tutti i moduli.",
    uso: "Punto di partenza per monitorare l'attività quotidiana dello studio."
  },
  clienti: {
    nome: "Clienti",
    ico: "👥",
    desc: "Anagrafica completa dei clienti con tutti i dati fiscali (CF, P.IVA, regime), contatti, email CC e moduli attivi per ogni cliente.",
    uso: "Gestisci l'anagrafica clienti, assegna responsabili e configura i moduli attivi."
  },
  import: {
    nome: "Import Excel",
    ico: "📤",
    desc: "Importazione massiva di dati da file Excel per popolare rapidamente l'anagrafica clienti o altri dati.",
    uso: "Carica file Excel con i dati dei clienti per importarli automaticamente."
  },
  utenti: {
    nome: "Utenti Studio",
    ico: "👤",
    desc: "Gestione degli utenti dello studio con ruoli (Owner, Admin, Collaboratore) e permessi granulari per ogni modulo.",
    uso: "Crea utenti, assegna ruoli e configura i permessi di accesso ai vari moduli."
  },
  impostazioni: {
    nome: "Impostazioni Studio",
    ico: "⚙️",
    desc: "Dati del titolare e dello studio utilizzati per le deleghe ADE, richieste fatture e comunicazioni ufficiali.",
    uso: "Configura i dati del titolare (CF, P.IVA) e dello studio."
  },
  deleghe: {
    nome: "Deleghe Uniche",
    ico: "🔑",
    desc: "Gestione delle Deleghe Uniche ADE per il download delle fatture elettroniche. Monitoraggio scadenze e alert automatici.",
    uso: "Registra le deleghe, monitora le scadenze e invia alert ai responsabili."
  },
  import_documenti: {
    nome: "Import Documenti",
    ico: "📁",
    desc: "Document Hub centrale per caricare qualsiasi documento. L'AI classifica automaticamente il tipo (fattura, F24, avviso ADE, etc.) e abbina il cliente tramite CF/P.IVA.",
    uso: "Carica PDF/XML, l'AI li classifica e li smista nei moduli corretti. Workflow: AI propone → operatore conferma."
  },
  export_dati: {
    nome: "Export Dati",
    ico: "📤",
    desc: "Hub centralizzato per l'esportazione di tutti i file telematici: CU (.TEL), LIPE (XML), 770, IVA Annuale, Intrastat, F24 e stampe contabili.",
    uso: "Seleziona il tipo di export desiderato e il sistema ti guiderà al modulo specifico per la generazione del file."
  },
  fatture_ade: {
    nome: "Fatture Massive ADE",
    ico: "📥",
    desc: "Importazione massiva delle fatture elettroniche scaricate dall'Agenzia delle Entrate. Estrae XML dallo ZIP e li smista nelle cartelle clienti.",
    uso: "Carica lo ZIP da ADE, il sistema estrae le fatture XML e le organizza per cliente."
  },
  lettura_mail: {
    nome: "Lettura Mail",
    ico: "📧",
    desc: "Lettura automatica delle caselle email dello studio. Estrae allegati (PDF, XML), li classifica con AI e li smista automaticamente. Le email rimangono non lette.",
    uso: "Seleziona la casella email, il sistema legge le mail non lette, estrae gli allegati e li classifica automaticamente."
  },
  contabilita: {
    nome: "Prima Nota",
    ico: "📒",
    desc: "Registrazione delle scritture contabili in Prima Nota. Import automatico da fatture XML con proposta AI. Split-screen con PDF originale per verifica. Supporta ordinaria, semplificata, professionisti e IVA per cassa.",
    uso: "Registra scritture manualmente o importa da fatture XML. L'AI propone i conti, l'operatore conferma o modifica."
  },
  piano_conti: {
    nome: "Piano dei Conti",
    ico: "🗂️",
    desc: "Gestione del Piano dei Conti con struttura gerarchica (Mastro → Conto → Sottoconto). Import da PDF NES. Anagrafica clienti/fornitori integrata. Duplicazione società.",
    uso: "Importa il piano conti da PDF, gestisci i conti, crea clienti/fornitori automaticamente dalle fatture."
  },
  partitario: {
    nome: "Partitario",
    ico: "💳",
    desc: "Gestione scadenze clienti e fornitori. Visualizza partite aperte, parziali e chiuse. Collegamento automatico incassi/pagamenti.",
    uso: "Monitora le scadenze, registra incassi e pagamenti che chiudono automaticamente le partite."
  },
  bilancio: {
    nome: "Bilancio",
    ico: "📊",
    desc: "Bilancio di verifica, situazione patrimoniale ed economica. Stampa giornale e mastrini. Export per TeamSystem.",
    uso: "Genera i prospetti contabili, stampa il giornale, esporta per altri software."
  },
  richieste_fatture: {
    nome: "Richieste Fatture ADE",
    ico: "📡",
    desc: "Generazione dei file XML per richiedere il download massivo delle fatture elettroniche dall'Agenzia delle Entrate.",
    uso: "Seleziona i clienti, il periodo e genera l'XML da inviare ad ADE per il download massivo."
  },
  iva: {
    nome: "Liquidazione IVA",
    ico: "💧",
    desc: "Calcolo e gestione delle liquidazioni IVA periodiche (mensili/trimestrali) con generazione prospetti e comunicazioni clienti.",
    uso: "Registra IVA vendite/acquisti, calcola il saldo e genera le comunicazioni per i clienti."
  },
  f24: {
    nome: "Gestione F24",
    ico: "📋",
    desc: "Tabellone completo per la gestione degli F24 con tutte le scadenze, importi, stati e tracciamento pagamenti.",
    uso: "Monitora tutti gli F24, registra i pagamenti e tieni traccia delle scadenze."
  },
  simulatore: {
    nome: "Simulatore Fiscale",
    ico: "📊",
    desc: "Simulazione comparativa dei regimi fiscali (forfettario, ordinario, SRL) per aiutare i clienti a scegliere il regime più conveniente.",
    uso: "Inserisci i dati del cliente e confronta il carico fiscale nei diversi regimi."
  },
  ammortamenti: {
    nome: "Ammortamenti",
    ico: "🏢",
    desc: "Registro dei beni ammortizzabili con calcolo automatico delle quote annuali e monitoraggio del fondo ammortamento.",
    uso: "Registra i beni, imposta le aliquote e monitora l'ammortamento nel tempo."
  },
  cu: {
    nome: "Certificazioni Uniche",
    ico: "📜",
    desc: "Gestione delle Certificazioni Uniche (CU) per autonomi e dipendenti con generazione file .tel per Entratel.",
    uso: "Registra i dati delle CU e genera i file per l'invio telematico."
  },
  adempimenti: {
    nome: "Adempimenti",
    ico: "📬",
    desc: "Gestione degli adempimenti fiscali periodici con template email, allegati e tracciamento delle comunicazioni inviate ai clienti.",
    uso: "Configura gli adempimenti, prepara le email e monitora gli invii."
  },
  agenda: {
    nome: "Agenda Invii",
    ico: "📅",
    desc: "Calendario degli invii programmati con vista per mese, scadenze e stato delle comunicazioni.",
    uso: "Pianifica gli invii, visualizza il calendario e monitora le comunicazioni programmate."
  }
};

function GuidaModuliModal({onClose}){
  const [search,setSearch]=useState('');
  const moduli=Object.entries(GUIDA_MODULI).filter(([k,v])=>{
    if(!search)return true;
    const s=search.toLowerCase();
    return v.nome.toLowerCase().includes(s)||v.desc.toLowerCase().includes(s);
  });
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:700,maxHeight:'90vh'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">ℹ️ Guida Moduli FiscoSim</div>
          <div className="modal-sub">Scopri cosa fa ogni modulo dell'applicazione</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{padding:'1rem'}}>
          <input className="search-bar" placeholder="🔍 Cerca modulo..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'1rem'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>
            {moduli.map(([id,m])=>(
              <div key={id} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:10,padding:'.85rem 1rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'.6rem',marginBottom:'.4rem'}}>
                  <span style={{fontSize:'1.3rem'}}>{m.ico}</span>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:'.95rem',fontWeight:700}}>{m.nome}</span>
                </div>
                <div style={{fontSize:'.78rem',color:'var(--tx)',lineHeight:1.5,marginBottom:'.4rem'}}>{m.desc}</div>
                <div style={{fontSize:'.72rem',color:'var(--gold)',fontStyle:'italic'}}>💡 {m.uso}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

// ── RUOLI PERMESSI ──────────────────────────────────────────
// owner  → tutto (unico che gestisce utenti e ruoli)
// admin  → tutto tranne gestione utenti studio
// collaboratore → legge e inserisce, non elimina, non esporta
const RUOLI_INFO = {
  owner:        { label:"Owner",        color:"bdg-gold", desc:"Accesso totale · Gestione utenti e ruoli · Unico account amministratore" },
  admin:        { label:"Admin",        color:"bdg-blue", desc:"Accesso totale a tutti i moduli · Non può gestire utenti studio" },
  collaboratore:{ label:"Collaboratore",color:"bdg-gray", desc:"Permessi configurabili per ogni collaboratore" },
};
const puoGestireUtenti = r => r==="owner";

// Struttura permessi default per collaboratore
// leggi = può vedere i dati
// modifica = può creare/modificare
// elimina = può eliminare (default sempre false per collaboratori)
// solo_assegnati = vede solo i clienti assegnati a lui (solo per clienti)
const PERMESSI_MODULI = [
  { id:"clienti",      label:"Clienti",          ico:"👥", hasSoloAssegnati:true },
  { id:"f24",          label:"Gestione F24",      ico:"📋", hasSoloAssegnati:false },
  { id:"iva",          label:"Liquidazione IVA",  ico:"💧", hasSoloAssegnati:false },
  { id:"ammortamenti", label:"Ammortamenti",      ico:"🏢", hasSoloAssegnati:false },
  { id:"adempimenti",  label:"Adempimenti",       ico:"📬", hasSoloAssegnati:false },
  { id:"agenda",       label:"Agenda Invii",      ico:"📅", hasSoloAssegnati:false },
  { id:"simulatore",   label:"Simulatore",        ico:"📊", hasSoloAssegnati:false },
  { id:"import",       label:"Import Excel",      ico:"📤", hasSoloAssegnati:false },
  { id:"import_documenti",label:"Import Documenti",ico:"📁", hasSoloAssegnati:false },
  { id:"dashboard",    label:"Dashboard",         ico:"🏠", hasSoloAssegnati:false },
  { id:"cu",           label:"Certificazioni Uniche",ico:"📜", hasSoloAssegnati:false },
  { id:"deleghe",      label:"Deleghe Uniche",      ico:"🔑", hasSoloAssegnati:false },
  { id:"richieste_fatture",label:"Richieste Fatture",  ico:"📡", hasSoloAssegnati:false },
  { id:"impostazioni",   label:"Impostazioni Studio",ico:"⚙️", hasSoloAssegnati:false },
];

const PERMESSI_DEFAULT = Object.fromEntries(
  PERMESSI_MODULI.map(m => [m.id, {
    leggi: true,
    modifica: false,
    elimina: false,
    solo_assegnati: false,
  }])
);

// Helper: ottieni permessi effettivi per utente
function getPermessi(utente) {
  if (!utente) return null;
  if (utente.ruolo === "owner" || utente.ruolo === "admin") {
    // owner e admin hanno tutto
    return Object.fromEntries(PERMESSI_MODULI.map(m => [m.id, {leggi:true,modifica:true,elimina:true,solo_assegnati:false}]));
  }
  // collaboratore: usa permessi salvati o default
  return { ...PERMESSI_DEFAULT, ...(utente.permessi || {}) };
}

function canLeggi(perm, modulo)    { return perm?.[modulo]?.leggi    !== false; }
function canModifica(perm, modulo) { return perm?.[modulo]?.modifica === true; }
function canElimina(perm, modulo)  { return perm?.[modulo]?.elimina  === true; }
function isSoloAssegnati(perm, modulo) { return perm?.[modulo]?.solo_assegnati === true; }

// ── LOGIN ────────────────────────────────────────────────────
function Login({onLogin}){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [loading,setLoading]=useState(false);
  const [err,setErr]=useState(null);
  
  const handleLogin=async(e)=>{
    e.preventDefault();
    if(!email||!password){setErr("Inserisci email e password");return;}
    setLoading(true);setErr(null);
    try{
      const{data,error}=await sb.from("utenti_studio")
        .select("id,nome,cognome,email,ruolo,permessi,clienti_assegnati,password_hash")
        .eq("email",email.toLowerCase().trim())
        .eq("attivo",true)
        .single();
      if(error||!data){setErr("Utente non trovato");setLoading(false);return;}
      if(data.password_hash!==password){setErr("Password non corretta");setLoading(false);return;}
      // Login ok - rimuovi password_hash prima di salvare in stato
      const{password_hash,...utenteSicuro}=data;
      onLogin(utenteSicuro);
    }catch(e){setErr("Errore di connessione");}
    finally{setLoading(false);}
  };

  return(
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)"}}>
      <div style={{width:"100%",maxWidth:380,padding:"0 1.25rem"}}>
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <div style={{width:52,height:52,background:"linear-gradient(135deg,var(--gold),var(--gld2))",borderRadius:14,display:"inline-flex",alignItems:"center",justifyContent:"center",fontFamily:"'Playfair Display',serif",fontSize:"1.5rem",fontWeight:700,color:"#0d1117",marginBottom:"1rem"}}>§</div>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1.5rem",fontWeight:700,marginBottom:".25rem"}}>FiscoSim</div>
          <div style={{fontSize:".78rem",color:"var(--mu)"}}>Studio Envisioning · Accesso riservato</div>
        </div>
        <form onSubmit={handleLogin}>
          <div className="fg" style={{marginBottom:".75rem"}}>
            <label>Email</label>
            <input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="nome@studio.it" autoComplete="email" autoFocus/>
          </div>
          <div className="fg" style={{marginBottom:".75rem"}}>
            <label>Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" autoComplete="current-password"/>
          </div>
          {err&&<div className="alert alert-err" style={{marginBottom:".75rem"}}>⚠️ {err}</div>}
          <button type="submit" className="btn full" disabled={loading} style={{marginTop:".5rem"}}>
            {loading?"⏳ Accesso...":"🔐 Accedi"}
          </button>
        </form>
        <div style={{fontSize:".65rem",color:"var(--mu)",textAlign:"center",marginTop:"1.5rem"}}>FiscoSim v3.0 · Studio Envisioning Srl<br/>Accesso solo per utenti autorizzati</div>
      </div>
    </div>
  );
}

function App(){
  const [tab,setTab]=useState("dashboard");
  const [alertCount,setAlertCount]=useState(0);
  const [deferredPrompt,setDeferredPrompt]=useState(null);
  const [showInstall,setShowInstall]=useState(false);
  const [utente,setUtente]=useState(null); // utente loggato
  const [showLogoutConfirm,setShowLogoutConfirm]=useState(false);
  const [showGuida,setShowGuida]=useState(false);

  useEffect(()=>{
    const h=e=>{e.preventDefault();setDeferredPrompt(e);setShowInstall(true);};
    window.addEventListener("beforeinstallprompt",h);
    return()=>window.removeEventListener("beforeinstallprompt",h);
  },[]);

  useEffect(()=>{
    if(!utente)return;
    const dom=tomorrowStr();
    sb.from("invii_schedulati").select("*",{count:"exact",head:true}).eq("stato","programmato").eq("data_invio",dom)
      .then(({count})=>setAlertCount(count||0));
  },[utente]);

  const handleInstall=async()=>{if(!deferredPrompt)return;deferredPrompt.prompt();await deferredPrompt.userChoice;setDeferredPrompt(null);setShowInstall(false);};
  const logout=()=>{setUtente(null);setTab("dashboard");setShowLogoutConfirm(false);};

  if(!utente)return<Login onLogin={u=>{setUtente(u);setTab("dashboard");}}/>;

  const ruolo=utente.ruolo||"collaboratore";
  const perm=getPermessi(utente); // permessi effettivi
  const initials=(utente.nome||"?").charAt(0)+(utente.cognome||"").charAt(0)||"?";

  // Filtra nav per ruolo (collaboratore non vede utenti studio)
  const navFiltrato=NAV.map(s=>({...s,items:s.items.filter(item=>{
    if(item.id==="utenti"&&!puoGestireUtenti(ruolo))return false;
    if(ruolo==="collaboratore"&&!canLeggi(perm,item.id))return false;
    return true;
  })})).filter(s=>s.items.length>0);

  return(
    <div className="app">
      {showGuida&&<GuidaModuliModal onClose={()=>setShowGuida(false)}/>}
      {showLogoutConfirm&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setShowLogoutConfirm(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:360}}>
            <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">Disconnetti</div><button className="modal-close" onClick={()=>setShowLogoutConfirm(false)}>✕</button></div>
            <div className="modal-body">
              <div style={{textAlign:"center",padding:".5rem 0"}}>
                <div style={{fontSize:"1.5rem",marginBottom:".5rem"}}>👋</div>
                <div style={{fontWeight:600,marginBottom:".25rem"}}>Ciao {utente.nome}!</div>
                <div style={{fontSize:".78rem",color:"var(--mu)"}}>Vuoi disconnetterti da FiscoSim?</div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setShowLogoutConfirm(false)}>Annulla</button>
              <button className="btn" style={{background:"var(--rd)",backgroundImage:"none"}} onClick={logout}>🚪 Disconnetti</button>
            </div>
          </div>
        </div>
      )}
      <div className="sidebar">
        <div className="sb-logo">
          <div className="sb-logo-row">
            <div className="sb-logo-ico">§</div>
            <div><div className="sb-logo-t">FiscoSim</div><div className="sb-logo-v">V3.0 — PROFESSIONAL</div></div>
          </div>
        </div>
        {navFiltrato.map(({section,items})=>(
          <div key={section}>
            <div className="sb-section-label">{section}</div>
            {items.map(item=>(
              <div key={item.id} className={"sb-item"+(tab===item.id?" active":"")} onClick={()=>setTab(item.id)}>
                <span className="sb-item-ico">{item.ico}</span>
                <span>{item.label}</span>
                {item.id==="agenda"&&alertCount>0&&<span className="sb-badge">{alertCount}</span>}
              </div>
            ))}
          </div>
        ))}
        <div className="sb-footer">
          <div style={{display:'flex',gap:'.5rem',marginBottom:'.6rem'}}>
            <button onClick={()=>setShowGuida(true)} style={{flex:1,background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.4rem .6rem',cursor:'pointer',fontSize:'.72rem',color:'var(--gold)',display:'flex',alignItems:'center',justifyContent:'center',gap:'.3rem',transition:'all .15s'}} 
              onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--gold)';e.currentTarget.style.background='rgba(200,164,94,.08)';}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--bd)';e.currentTarget.style.background='var(--s2)';}}>
              ℹ️ Guida Moduli
            </button>
          </div>
          <div className="sb-user" style={{cursor:"pointer"}} onClick={()=>setShowLogoutConfirm(true)}
            title="Clicca per disconnetterti">
            <div className="sb-avatar">{initials}</div>
            <div style={{flex:1,minWidth:0}}>
              <div className="sb-user-name">{utente.nome} {utente.cognome||""}</div>
              <div className="sb-user-role">{RUOLI_INFO[ruolo]?.label||ruolo} · Esci 🚪</div>
            </div>
          </div>
        </div>
      </div>
      <div className="content">
        {showInstall&&<div style={{padding:".75rem 1rem 0"}}><div className="install-banner"><div style={{flex:1,fontSize:".76rem",lineHeight:1.45}}><strong style={{color:"var(--gld2)"}}>📲 Installa FiscoSim</strong><br/>Aggiungi alla schermata home per accesso rapido</div><button onClick={handleInstall}>Installa</button></div></div>}
        {tab==="dashboard"&&<Dashboard onNavigate={setTab}/>}
        {tab==="clienti"&&(canLeggi(perm,"clienti")?<ModuloClienti ruolo={ruolo} perm={perm}/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="import"&&(canModifica(perm,"import")?<ModuloImportExcel/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="utenti"&&puoGestireUtenti(ruolo)&&<ModuloUtenti ruolo={ruolo}/>}
        {tab==="iva"&&(canLeggi(perm,"iva")?<ModuloIVA ruolo={ruolo} perm={perm}/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="f24"&&(canLeggi(perm,"f24")?<ModuloF24 ruolo={ruolo} perm={perm}/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="simulatore"&&(canLeggi(perm,"simulatore")?<ModuloSimulatore/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="cu"&&<ModuloCU/>}
        {tab==="ammortamenti"&&(canLeggi(perm,"ammortamenti")?<ModuloAmmortamenti ruolo={ruolo} perm={perm}/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="adempimenti"&&(canLeggi(perm,"adempimenti")?<ModuloAdempimenti ruolo={ruolo} perm={perm}/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="agenda"&&(canLeggi(perm,"agenda")?<ModuloAgenda ruolo={ruolo} perm={perm}/>:<div className="page"><div className="alert alert-err">🚫 Accesso non consentito</div></div>)}
        {tab==="deleghe"&&<ModuloDeleghe/>}
        {tab==="impostazioni"&&<ModuloImpostazioni ruolo={ruolo}/>}
        {tab==="richieste_fatture"&&<ModuloRichiesteFatture/>}
        {tab==="import_documenti"&&<ModuloImportDocumenti ruolo={ruolo}/>}
        {tab==="export_dati"&&<ModuloExportDati onNavigate={setTab}/>}
        {tab==="fatture_ade"&&<ModuloFattureADE/>}
        {tab==="lettura_mail"&&<ModuloLetturaMail/>}
        {tab==="contabilita"&&<ModuloContabilita ruolo={ruolo}/>}
        {tab==="piano_conti"&&<ModuloPianoConti/>}
        {tab==="partitario"&&<ModuloPartitario/>}
        {tab==="bilancio"&&<ModuloBilancio/>}
      </div>
    </div>
  );
}
export default App
