import { statoDelega } from '../../shared/utils'
import { MODULI_DEFAULT, MODULI_DISPONIBILI } from '../../shared/constants'
import { useState, useEffect, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { TIPO_LABEL } from '../../shared/constants'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloRichiesteFatture(){
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
