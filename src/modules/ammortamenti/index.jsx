import { useState, useEffect, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { ModuleHeader } from '../../shared/components'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloAmmortamenti(){
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
      <ModuleHeader
        sectionLabel="Contabilità"
        title="🏢 Ammortamenti"
        context="Registro beni ammortizzabili e piani di ammortamento"
        primaryAction={<button className="btn" onClick={()=>setModal({mode:"new",data:EMPTY})}>+ Nuovo Bene</button>}
        secondaryAction={<button className="btn-sec" onClick={()=>setXmlModal(true)}>📎 Importa da XML</button>}
      />
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
