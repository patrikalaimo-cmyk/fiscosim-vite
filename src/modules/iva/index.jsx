import { loadScript } from '../../shared/utils'
import { useState, useEffect, useCallback, useRef } from 'react'
import { sb } from '../../lib/supabase'
import { TagInput } from '../../shared/components'
import { TIPO_LABEL, TIPO_CLIENTE } from '../../shared/constants'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloIVA(){
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
      // Check AI setting
      const{data:aiSetting}=await sb.from('impostazioni_studio').select('valore').eq('chiave','ai_enabled');
      const useAI=(Array.isArray(aiSetting)?aiSetting[0]:aiSetting)?.valore!=='false';

      const ext=file.name.split(".").pop().toLowerCase();
      let dati;
      if(ext==="pdf"){
        const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(",")[1]);r.onerror=rej;r.readAsDataURL(file);});
        dati=await estraiDatiIVADaPDF(base64,"application/pdf",useAI);
      } else if(["xlsx","xls","csv"].includes(ext)){
        dati=await estraiDatiIVADaExcel(file,useAI);
      } else {
        throw new Error("Formato non supportato. Usa PDF, Excel o CSV.");
      }
      // If AI disabled, show empty form for manual input
      if(!dati){
        dati={cliente_nome:"",partita_iva:"",periodo:"",tipo_periodo:"trimestrale",anno:new Date().getFullYear(),trimestre:1,mese:null,iva_vendite:0,iva_acquisti:0,iva_precedente:0,note:"Inserimento manuale (AI disattivata)"};
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
