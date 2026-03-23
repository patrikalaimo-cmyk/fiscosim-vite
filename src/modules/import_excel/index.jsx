import { useState, useRef } from 'react'
import { sb } from '../../lib/supabase'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloImportExcel(){
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
