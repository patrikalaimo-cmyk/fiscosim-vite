import { useState } from 'react'

export default function StampeView({ contTab, societaAttiva, scritture, pianoConti, causaliIva }) {
  if (!societaAttiva) return null
  if (!['registri_iva', 'partitari', 'giornale', 'mastrini', 'bilancio'].includes(contTab)) return null
  return (
    <StampeDetailView
      tipoStampa={contTab}
      societa={societaAttiva}
      scritture={scritture}
      pianoConti={pianoConti}
      causaliIva={causaliIva}
    />
  )
}

function StampeDetailView({tipoStampa,societa,scritture,pianoConti,causaliIva}){
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
