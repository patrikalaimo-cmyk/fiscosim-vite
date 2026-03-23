import { useState, useEffect, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { ALLEGATO_LABEL } from '../../shared/constants'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloAgenda(){
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
async function estraiDatiRicevuta(base64, mimeType, useAI=true) {
  if(!useAI)return null; // Caller will show manual input form
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
      model:'claude-haiku-4-5-20251001',
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
