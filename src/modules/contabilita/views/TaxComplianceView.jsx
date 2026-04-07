import { useEffect, useState } from 'react'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { fmtNumber } from '../ui/formatters.js'
import { getLiquidazioneBadgeClass, getLipeBadgeClass } from '../ui/viewMappers.js'
import {
  aggregateRegistriIvaRows,
  buildLiquidazionePayload,
  mapLiquidazioneForUi,
  boundsMensile,
  boundsTrimestrale,
} from '../application/liquidazioneIvaClient.js'

export default function TaxComplianceView({
  contTab,
  societaAttiva,
  scritture,
  causaliIva,
  caricaTutto,
}) {
  if (!societaAttiva) return null

  return (
    <>
      {contTab === 'liquidazioni_iva' && (
        <LiquidazioniIVAView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva} />
      )}

      {contTab === 'lipe' && <LIPEView societa={societaAttiva} />}

      {contTab === 'corrispettivi' && <CorrispettiviView societa={societaAttiva} />}

      {contTab === 'f770' && <Modello770View societa={societaAttiva} />}

      {contTab === 'intrastat' && <IntrastatView societa={societaAttiva} />}

      {contTab === 'percipienti' && <PercipientiView societa={societaAttiva} onRefresh={caricaTutto} />}

      {contTab === 'ritenute' && <RitenuteView societa={societaAttiva} />}

      {contTab === 'iva_annuale' && (
        <IvaAnnualeView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva} />
      )}
    </>
  )
}

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
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaLiquidazioni();
  },[societa]);

  const caricaLiquidazioni=async()=>{
    setLoading(true);
    const { data } = await contabilitaRepo.getLiquidazioniIvaCanoniche();
    const mapped = (data || []).map(mapLiquidazioneForUi).filter(Boolean);
    setLiquidazioni(mapped);
    setLoading(false);
  };

  const calcolaDaRegistri=async()=>{
    const anno=formData.anno;
    const periodo=formData.periodo;
    const isTrimestrale=formData.tipo_periodo==='trimestrale';
    const bounds = isTrimestrale ? boundsTrimestrale(anno, periodo) : boundsMensile(anno, periodo);

    const { data, error } = await contabilitaRepo.getRegistriIvaByPeriodo(bounds.periodo_inizio, bounds.periodo_fine);
    if (error) {
      alert('Errore lettura registri IVA: ' + error.message);
      return;
    }
    const agg = aggregateRegistriIvaRows(data || []);
    setFormData(prev=>({...prev,iva_vendite:agg.iva_debito.toFixed(2),iva_acquisti:agg.iva_credito.toFixed(2)}));
  };

  const salvaLiquidazione=async()=>{
    const ivaDebito=parseFloat(formData.iva_vendite||0);
    const ivaCredito=parseFloat(formData.iva_acquisti||0);

    const agg = {
      iva_debito: ivaDebito,
      iva_credito: ivaCredito,
      saldo: Math.round((ivaDebito - ivaCredito) * 100) / 100,
    };
    const record = buildLiquidazionePayload({
      periodicita: formData.tipo_periodo,
      anno: formData.anno,
      mese: formData.tipo_periodo === 'mensile' ? formData.periodo : null,
      trimestre: formData.tipo_periodo === 'trimestrale' ? formData.periodo : null,
      agg,
      note: formData.note,
    });
    
    const{error}=await contabilitaRepo.upsertLiquidazioneIvaCanonica(record);
    if(error){
      // Se la tabella non esiste, la creiamo
      if(error.code==='42P01'){
        alert('Tabella liquidazione_iva non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuova(false);
    caricaLiquidazioni();
  };

  const fmt = fmtNumber;
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
                    <td style={{textAlign:'right',color:l.iva_dovuta>0?'var(--rd)':'inherit',fontWeight:l.iva_dovuta>0?700:'normal'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):'—'}</td>
                    <td style={{textAlign:'right',color:l.credito_da_riportare>0?'var(--gr)':'inherit'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):'—'}</td>
                    <td><span className={'bdg '+getLiquidazioneBadgeClass(l.stato)}>{l.stato}</span></td>
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
                  <button className="btn-sec" onClick={calcolaDaRegistri} style={{width:'100%'}}>🔄 Calcola da Registri IVA</button>
                </div>
                <div className="fg">
                  <label>IVA Vendite (debito)</label>
                  <input type="number" step="0.01" value={formData.iva_vendite} onChange={e=>setFormData(p=>({...p,iva_vendite:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>IVA Acquisti (credito)</label>
                  <input type="number" step="0.01" value={formData.iva_acquisti} onChange={e=>setFormData(p=>({...p,iva_acquisti:e.target.value}))}/>
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
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:'.5rem',borderTop:'1px solid var(--bd)'}}>
                  <span style={{fontWeight:700}}>SALDO:</span>
                  <span style={{fontWeight:700,color:(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_acquisti||0))>0?'var(--rd)':'var(--gr)'}}>
                    {fmt(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_acquisti||0))}
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
    const { data } = await contabilitaRepo.getLiquidazioniIvaCanonicheByPeriodicita('trimestrale');
    const mapped = (data || []).map(mapLiquidazioneForUi).filter(Boolean);
    setLiquidazioni(mapped);
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
        <DebitoCredPeriodPrec>0.00</DebitoCredPeriodPrec>
        <CreditoAnnoPrec>0.00</CreditoAnnoPrec>
        <Interessi>0.00</Interessi>
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

  const fmt = fmtNumber;

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
                    <td><span className={'bdg '+getLipeBadgeClass(l.stato)}>{l.stato}</span></td>
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
    
    const{data}=await contabilitaRepo.getCorrispettiviGiornalieri(societa.id, inizioMese, fineMese);
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
    
    const{error}=await contabilitaRepo.insertCorrispettivoGiornaliero(record);
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

  const fmt = fmtNumber;
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
    const{data}=await contabilitaRepo.getRitenuteByAnnoPerPercipiente(societa.id, annoSel);
    setPercipienti(data||[]);
    setLoading(false);
  };

  const fmt = fmtNumber;

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
    
    const{data}=await contabilitaRepo.getIntrastatOperazioni(societa.id, tipoSel==='cessioni'?'cessione':'acquisto', inizioMese, fineMese);
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
    
    const{error}=await contabilitaRepo.insertIntrastatOperazione(record);
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

  const fmt = fmtNumber;
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
    
    // Carica liquidazioni canoniche dell'anno
    const { data } = await contabilitaRepo.getLiquidazioniIvaCanoniche();
    const mapped = (data || []).map(mapLiquidazioneForUi).filter((l) => l && l.anno === annoSel);
    setLiquidazioni(mapped);
    
    if(mapped.length>0){
      const totIvaVendite=mapped.reduce((s,l)=>s+parseFloat(l.iva_vendite||0),0);
      const totIvaAcquisti=mapped.reduce((s,l)=>s+parseFloat(l.iva_acquisti||0),0);
      const totSaldo=mapped.reduce((s,l)=>s+parseFloat(l.saldo||0),0);
      const creditoFinale=mapped.length>0?parseFloat(mapped[mapped.length-1]?.credito_da_riportare||0):0;
      
      setDatiIva({
        operazioni_attive:totIvaVendite/0.22, // stima imponibile
        operazioni_passive:totIvaAcquisti/0.22,
        iva_esigibile:totIvaVendite,
        iva_detratta:totIvaAcquisti,
        iva_dovuta:Math.max(0,totSaldo),
        credito_anno_prec:0,
        acconti_versati:0,
        totale_dovuto:Math.max(0,totSaldo),
        credito_risultante:creditoFinale
      });
    }else{
      setDatiIva({
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
    }

    setLoading(false);
  };

  const fmt = fmtNumber;

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
    const{data}=await contabilitaRepo.getPercipientiAttivi(societa.id);
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
      ({error}=await contabilitaRepo.updatePercipiente(editingId, record));
    }else{
      ({error}=await contabilitaRepo.insertPercipiente(record));
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
    await contabilitaRepo.deactivatePercipiente(id);
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
      contabilitaRepo.getRitenuteByAnnoPerData(societa.id, annoSel),
      contabilitaRepo.getPercipientiAttivi(societa.id)
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
    
    const{error}=await contabilitaRepo.insertRitenuta(record);
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
    await contabilitaRepo.deleteRitenuta(id);
    caricaDati();
  };

  const fmt = fmtNumber;

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

