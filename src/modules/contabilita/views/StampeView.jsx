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
        const movimenti=scrittureFiltrate.filter(s=>s.conto_id===selectedConto).map(s=>({
          data_registrazione:s.data_registrazione,
          causale_codice:s.causale_codice||'GEN',
          descrizione_riga:s.descrizione,
          descrizione:s.descrizione,
          importo_dare:s.totale_dare||0,
          importo_avere:s.totale_avere||0
        }));
        if(!movimenti.length){
          setError('Nessun movimento disponibile per il conto selezionato.');
          setLoading(false);
          return;
        }
        const saldoIniziale=movimenti.reduce((acc,m)=>acc+(m.importo_dare-m.importo_avere),0);
        dati={conto:{codice:conto.codice,descrizione:conto.descrizione,saldo_iniziale:saldoIniziale},movimenti};
      }
      else if(tipoStampa==='bilancio'){
        tipo='bilancio_verifica';
        // Aggrega per conto
        const aggregati=pianoConti.map(c=>({
          ...c,
          saldo_dare:0,
          saldo_avere:0
        }));
        scrittureFiltrate.forEach(s=>{
          const index=aggregati.findIndex(c=>c.id===s.conto_id);
          if(index===-1)return;
          aggregati[index].saldo_dare += s.totale_dare||0;
          aggregati[index].saldo_avere += s.totale_avere||0;
        });
        dati={conti:aggregati};
      }
      else if(tipoStampa==='partitari'){
        tipo='partitario';
        const partite=scrittureFiltrate
          .filter(s=>partitarioTipo==='clienti' ? !!s.cliente_fornitore_nome : !!s.fornitore_nome)
          .map(s=>({
            data_documento:s.data_documento||s.data_registrazione,
            numero_documento:s.numero_documento||'',
            conto_descrizione:s.cliente_fornitore_nome||s.fornitore_nome||s.descrizione||'Cliente/Fornitore',
            importo_originale:s.totale_dare||s.totale_avere||0,
            importo_pagato:s.pagato||0,
            importo_residuo:(s.totale_dare||s.totale_avere||0)-(s.pagato||0),
            data_scadenza:s.scadenza||s.data_documento,
            stato:s.stato_partitario||'aperta'
          }));
        if(!partite.length){
          setError('Nessuna partita aperta disponibile per il tipo selezionato.');
          setLoading(false);
          return;
        }
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
          <div style={{background:'var(--bg-surface)',border:'1px solid var(--border-subtle)',borderRadius:12,padding:'1rem',maxHeight:500,overflow:'auto'}}>
            <iframe 
              srcDoc={previewHtml} 
              style={{width:'100%',height:450,border:'none',borderRadius:8,background:'var(--bg-card)'}}
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
