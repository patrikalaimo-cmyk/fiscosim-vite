import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { useAIStatus } from '../../context/AIStatusContext'
import { TagInput } from '../../shared/components'
import { TIPO_DOC_LABEL, TIPO_DOC_COLOR, MODULO_DEST_LABEL, STATO_DOC_LABEL, STATO_DOC_COLOR } from '../../shared/constants'
import { shouldUseAI, routeDocument } from '../../core/workflow'
import { extractTextFromPDFBrowser, analyzeDocumentWithVision, loadScript } from '../../shared/utils'

const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]

export function ModuloImportDocumenti({ruolo}){
  const [documenti,setDocumenti]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [societa,setSocieta]=useState([]);
  const [loading,setLoading]=useState(true);
  const [uploading,setUploading]=useState(false);
  const [analyzing,setAnalyzing]=useState(false);
  const [anaNESDoc,setAnaNESDoc]=useState(null); // doc da importare come anagrafica NES
  const [uploadProgress,setUploadProgress]=useState(null);
  const [selectedDoc,setSelectedDoc]=useState(null);
  const [filtroStato,setFiltroStato]=useState('tutti');
  const [aiEnabled,setAiEnabled]=useState(true);
  const [showFattureMassive,setShowFattureMassive]=useState(false);
  const [fattureDaConfermare,setFattureDaConfermare]=useState([]);
  const fileInputRef=useRef();
  const ai=useAIStatus();

  useEffect(()=>{caricaDati();},[]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:docs},{data:cli},{data:soc},{data:imp}]=await Promise.all([
      sb.from('documenti_import').select('*').order('created_at',{ascending:false}).limit(100),
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva,codice_cliente').eq('attivo',true).order('nome'),
      sb.from('societa').select('id,denominazione,partita_iva').eq('attiva',true).order('denominazione'),
      sb.from('impostazioni_studio').select('chiave,valore').eq('chiave','ai_enabled')
    ]);
    setDocumenti(docs||[]);
    setClienti(cli||[]);
    setSocieta(soc||[]);
    const impRow = Array.isArray(imp) ? imp[0] : imp;
    setAiEnabled(impRow?.valore!=='false'); // default true se riga mancante
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

        // 3a. Riconoscimento locale deterministico: ANA NES
        const isAnaNES = file.name.toUpperCase().startsWith('ANA') && (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.csv'));
        if(isAnaNES){
          await sb.from('documenti_import').update({
            tipo_documento: 'anagrafica_nes',
            confidence: 0.99,
            ai_summary: 'Anagrafica NES — import clienti',
            modulo_destinazione: 'clienti',
            stato: 'classified'
          }).eq('id', docRecord.id);
          ai.setAI('done','Classificazione locale ANA NES','local');
          continue;
        }

        // 3. Se AI attiva, analizza con AI
        console.log('[DocHub] aiEnabled:', aiEnabled);
        if(aiEnabled){
          ai.setAI('processing','Classificazione documento','ai');
          setAnalyzing(true);
          const analysis = await analyzeDocumentWithVision(file, 'generico');
          if(analysis){
          
            // 4. Trova cliente matching (robusto)
            let clienteMatch=null;
            const normPiva=(p)=>(p||'').replace(/\s|-/g,'').replace(/^IT/i,'').trim();
            const normCf=(c)=>(c||'').replace(/\s/g,'').toUpperCase().trim();
            
            // Match per P.IVA (normalizzata)
            if(analysis.partita_iva){
              const aiPiva=normPiva(analysis.partita_iva);
              if(aiPiva.length>=11)clienteMatch=clienti.find(c=>normPiva(c.partita_iva)===aiPiva);
            }
            // Fallback: match per CF
            if(!clienteMatch&&analysis.codice_fiscale){
              const aiCf=normCf(analysis.codice_fiscale);
              if(aiCf.length>=11)clienteMatch=clienti.find(c=>normCf(c.codice_fiscale)===aiCf||normPiva(c.partita_iva)===aiCf);
            }
            // Fallback: match per denominazione (fuzzy)
            if(!clienteMatch&&analysis.denominazione){
              const aiDen=(analysis.denominazione||'').toUpperCase().replace(/\s*(S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?)\s*/gi,'').trim();
              if(aiDen.length>3){
                clienteMatch=clienti.find(c=>{
                  const cDen=((c.ragione_sociale||c.nome||'')+' '+(c.cognome||'')).toUpperCase().replace(/\s*(S\.?R\.?L\.?|S\.?P\.?A\.?|S\.?N\.?C\.?|S\.?A\.?S\.?)\s*/gi,'').trim();
                  return cDen.includes(aiDen)||aiDen.includes(cDen);
                });
              }
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
          ai.setAI('done','Classificazione documento','ai');
        }else{
          ai.setAI('done','Upload documento','local');
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
    // Gestione speciale: anagrafica NES
    if(modulo==='__ana_nes__'){
      const{data:doc}=await sb.from('documenti_import').select('*').eq('id',docId).single();
      if(doc){setAnaNESDoc(doc);setSelectedDoc(null);}
      return;
    }
    // Get the full document data
    const{data:doc}=await sb.from('documenti_import').select('*').eq('id',docId).single();
    
    await sb.from('documenti_import').update({
      modulo_destinazione:modulo,
      stato:'processed',
      processato_at:new Date().toISOString()
    }).eq('id',docId);
    
    // Bridge: create record in documenti_contabilita for contabilità modules
    if(doc && (modulo==='prima_nota'||modulo==='contabilita')){
      const societaId=doc.societa_destinazione_id;
      if(societaId){
        // Generate public URL from storage path
        let fileUrl=doc.file_url||null;
        if(!fileUrl&&doc.file_path){
          const{data:urlData}=sb.storage.from('documenti').getPublicUrl(doc.file_path);
          fileUrl=urlData?.publicUrl||null;
        }
        await sb.from('documenti_contabilita').insert([{
          societa_id:societaId,
          filename:doc.filename,
          file_path:doc.file_path,
          file_url:fileUrl,
          mime_type:doc.mime_type,
          file_size:doc.file_size,
          tipo_documento:doc.tipo_documento||'fattura_passiva',
          numero_documento:null,
          data_documento:null,
          soggetto_denominazione:doc.ai_raw_response?.denominazione||null,
          soggetto_piva:doc.piva_estratta||doc.ai_raw_response?.partita_iva||null,
          soggetto_cf:doc.cf_estratto||doc.ai_raw_response?.codice_fiscale||null,
          imponibile:doc.ai_raw_response?.imponibile||null,
          iva:doc.ai_raw_response?.iva||null,
          totale:doc.ai_raw_response?.totale||null,
          workflow_status:'proposed',
          validation_status:'pending',
          ai_confidence:doc.confidence||0,
          cliente_id:doc.cliente_id||null,
          source_document_id:doc.id
        }]);
      }
    }
    
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
      {anaNESDoc&&<ModalImportAnagraficaNES
        doc={anaNESDoc}
        aiEnabled={aiEnabled}
        onComplete={()=>{setAnaNESDoc(null);caricaDati();window.dispatchEvent(new CustomEvent('fiscosim:navigate',{detail:{modulo:'clienti'}}));}}
        onClose={()=>setAnaNESDoc(null)}
      />}
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
            
            // Bridge: crea record in documenti_contabilita
            let fattUrl=fatt.file_url||null;
            if(!fattUrl&&fatt.file_path){
              const{data:u}=sb.storage.from('documenti').getPublicUrl(fatt.file_path);
              fattUrl=u?.publicUrl||null;
            }
            await sb.from('documenti_contabilita').insert([{
              societa_id: societaId,
              filename: fatt.filename,
              file_path: fatt.file_path,
              file_url: fattUrl,
              mime_type: fatt.mime_type,
              file_size: fatt.file_size,
              tipo_documento: tipoDoc||fatt.tipo_documento||'fattura_passiva',
              numero_documento: null,
              data_documento: null,
              soggetto_denominazione: fatt.ai_raw_response?.denominazione||null,
              soggetto_piva: fatt.piva_estratta||fatt.ai_raw_response?.partita_iva||null,
              soggetto_cf: fatt.cf_estratto||fatt.ai_raw_response?.codice_fiscale||null,
              imponibile: fatt.ai_raw_response?.imponibile||null,
              iva: fatt.ai_raw_response?.iva||null,
              totale: fatt.ai_raw_response?.totale||null,
              workflow_status: 'proposed',
              validation_status: 'pending',
              ai_confidence: fatt.confidence||0,
              cliente_id: fatt.cliente_id||null,
              source_document_id: fatt.id
            }]);
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
  const isAnaNES=doc.tipo_documento==='anagrafica_nes'||tipoDocumento==='anagrafica_nes';
  const datiAnag=analysis.dati_anagrafici||{};
  const datiEstrattiDisponibili=Object.keys(datiAnag).length>0||(doc.cf_estratto||doc.piva_estratta);

  // Tutti i tipi documento disponibili
  const TIPI_DOCUMENTO = {
    anagrafica_nes: "📋 Anagrafica NES (import multiplo clienti)",
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
      anagrafica_nes: 'clienti',
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
          {doc.stato!=='processed'&&doc.stato!=='manual_pending'&&(
            isAnaNES
              ? <button className="btn" style={{background:'var(--cy)'}} onClick={()=>{onClose();/* parent apre ModalImportAnagraficaNES */onProcessa(doc.id,'__ana_nes__');}}>📋 Importa Clienti NES</button>
              : <button className="btn" onClick={()=>onProcessa(doc.id,selModulo)}>✓ Elabora</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODULO EXPORT DATI (HUB CENTRALIZZATO) ──────────────────

// ─── PARSER ANAGRAFICA NES (ANA760 e simili) ─────────────────────────────────
// pdfjs estrae il testo con i label prima e i valori dopo, senza \f tra pagine.
// Strategia: split su "ANAGRAFICA SOCIETA'" per isolare ogni blocco cliente,
// poi cerca P.IVA inline e Rag.Soc. come prima riga-valore dopo il label.
function parseAnagraficaNES(testo) {
  // Split per blocco cliente (ogni pagina inizia con "ANAGRAFICA SOCIETA'")
  const SKIP_KW = /DATI|SEDE|RECAPITI|DOMICILIO|TIPO|STATO|NATURA|GESTIONE|REGIMI|VISTO|PREFER|IMU|IRAP|REDDITI|VERSAM|CONSOL|CALCOL|PUBBLICA|INVIO|RICEZIONE|BLOCC|SINDACI|COLLABORA|IMPOSTA/;
  
  // Splitta su ogni occorrenza di ANAGRAFICA SOCIETA'
  const blocchi = testo.split(/(?=ANAGRAFICA SOCIETA')/);
  const clienti = [];
  const seen = new Set();

  for (const blocco of blocchi) {
    // Salta blocchi rappresentante e sindaci
    if (blocco.includes("ANAGRAFICA SOCIETA' - RAPPRESENTANTE")) continue;
    if (!blocco.includes("ANAGRAFICA SOCIETA'")) continue;
    if (/Cod\.Anag\.|SINDACI/.test(blocco)) continue;

    const lines = blocco.split('\n').map(l => l.trim()).filter(Boolean);

    // P.IVA: appare inline "Partita iva : 06562351004"
    let piva = '';
    const mPiva = blocco.match(/Partita iva\s*:\s*(\d{11})/);
    if (mPiva) piva = mPiva[1];

    // CF: prima sequenza da 11 cifre nel blocco
    let cf = '';
    const mCf = blocco.match(/\b(\d{11})\b/);
    if (mCf) cf = mCf[1];

    const key = piva || cf;
    if (!key || seen.has(key)) continue;

    // Rag.Soc.: il valore è una riga isolata, NON inline con il label
    // Cerca "Rag.Soc.:" poi prende la prima riga-valore successiva
    let rag_soc = '';
    const ragIdx = lines.findIndex(l => l === 'Rag.Soc.:');
    if (ragIdx >= 0) {
      for (let i = ragIdx + 1; i < Math.min(ragIdx + 50, lines.length); i++) {
        const l = lines[i];
        if (!l || l.includes(':') && !l.match(/^[A-Z&.\s'-]+:/)) continue;
        // Match su suffissi societari
        if (/S\.?R\.?L|S\.?P\.?A|SNC|SAS|SRLS|GROUP|SERVICE|IMMOBIL|INVEST|CONSUL|STUDIO|COSTRUZ|HOLDING|TRADING|SOCIETA|ONLUS|COOP|ASSOCIAZ|FONDAZ/i.test(l)) {
          rag_soc = l; break;
        }
        // Riga tutta maiuscola, non numero puro, non keyword
        if (l.length > 4 && !(/^\d+$/.test(l)) && l === l.toUpperCase() && !SKIP_KW.test(l) && !l.includes(':')) {
          rag_soc = l; break;
        }
      }
    }

    if (!rag_soc) continue;
    seen.add(key);

    // Indirizzo: cerca "VIA/CORSO/PIAZZA..." 
    let indirizzo = '';
    const mInd = blocco.match(/\b(VIA|CORSO|PIAZZA|VIALE|LARGO|VICOLO|STRADA)\b[^\n]+/);
    if (mInd) indirizzo = mInd[0].trim().substring(0, 80);

    // Tipo cliente da natura giuridica
    const natM = blocco.match(/Societ[aà] a responsabilit[aà] limitata|S\.?R\.?L\b|S\.?N\.?C\b|S\.?A\.?S\b/i);
    const nat = (natM?.[0] || '').toLowerCase();
    let tipo_cliente = 'ordinario';
    if (/limit|srl|srls/.test(nat)) tipo_cliente = 'srl';
    else if (/snc|sas/.test(nat)) tipo_cliente = 'snc';

    clienti.push({
      ragione_sociale: rag_soc,
      partita_iva:     piva || cf,
      codice_fiscale:  cf || piva,
      indirizzo,
      email:    null,
      telefono: null,
      tipo_cliente,
      attivo: true,
    });
  }
  return clienti;
}


// ─── PARSER ANAGRAFICA NES DA CSV ────────────────────────────────────────────
// Formato: CSV punto-e-virgola, encoding latin-1 (gestito dal browser con TextDecoder)
// Colonne: Codice;Denominazione;Codice fiscale;Alias;Tipo società;...
function parseCsvAnagraficaNES(testo) {
  const lines = testo.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(';').map(h => h.trim());
  const idx = {
    codice:    header.findIndex(h => /^codice$/i.test(h)),
    denom:     header.findIndex(h => /denominazione/i.test(h)),
    cf:        header.findIndex(h => /codice.fisc/i.test(h)),
    tipo:      header.findIndex(h => /tipo.societ/i.test(h)),
  };
  const clienti = [];
  const seen = new Set();
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(';');
    const denom = (cols[idx.denom] || '').trim();
    if (!denom) continue;
    // CF: padda a 11 cifre con zero iniziale se mancante
    const cfRaw = (cols[idx.cf] || '').trim().replace(/\D/g, '');
    const cf = cfRaw ? cfRaw.padStart(11, '0') : '';
    if (!cf || seen.has(cf)) continue;
    seen.add(cf);
    const tipo_raw = (cols[idx.tipo] || '').toLowerCase();
    let tipo_cliente = 'ordinario';
    if (/s\.?r\.?l|srls|spa|s\.?p\.?a/.test(denom.toLowerCase()) || tipo_raw.includes('760')) tipo_cliente = 'srl';
    else if (/snc|sas|s\.?n\.?c|s\.?a\.?s/.test(denom.toLowerCase())) tipo_cliente = 'snc';
    clienti.push({
      ragione_sociale: denom,
      nome: denom,          // NOT NULL constraint — usa ragione_sociale come fallback
      cognome: '',
      partita_iva:     cf,
      codice_fiscale:  cf,
      codice_cliente:  (cols[idx.codice] || '').trim() || null,
      tipo_cliente,
      attivo: true,
    });
  }
  return clienti;
}

// ─── MODAL IMPORT ANAGRAFICA NES ─────────────────────────────────────────────
function ModalImportAnagraficaNES({ doc, onComplete, onClose, aiEnabled=true }) {
  const [clienti, setClienti]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [sel, setSel]           = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [done, setDone]         = useState(null); // {inseriti, saltati}
  const [manualMode, setManualMode] = useState(false); // AI OFF + PDF
  const [manualForm, setManualForm] = useState({ ragione_sociale:'', partita_iva:'', codice_fiscale:'', tipo_cliente:'srl' });

  useEffect(() => {
    (async () => {
      try {
        setProgress('Download file...');
        const { data: blob, error: dlErr } = await sb.storage
          .from('documenti').download(doc.file_path);
        if (dlErr) throw dlErr;
        const file = new File([blob], doc.filename, { type: blob.type || 'application/pdf' });
        const isCsv = doc.filename?.toLowerCase().endsWith('.csv');
        let trovati = [];
        if (isCsv) {
          // CSV: parsing deterministico locale (veloce, zero costi)
          setProgress('Parsing CSV anagrafica NES...');
          const decoder = new TextDecoder('windows-1252');
          const testo = decoder.decode(await blob.arrayBuffer());
          trovati = parseCsvAnagraficaNES(testo);
        } else if (aiEnabled) {
          // PDF/Immagine + AI ON: Claude vision legge il layout visivamente
          const result = await analyzeDocumentWithVision(file, 'anagrafica_nes', setProgress);
          trovati = (result.clienti || []).map(c => ({
            ragione_sociale: c.ragione_sociale || '',
            partita_iva:     (c.partita_iva || c.codice_fiscale || '').replace(/\D/g,'').padStart(11,'0'),
            codice_fiscale:  (c.codice_fiscale || c.partita_iva || '').replace(/\D/g,'').padStart(11,'0'),
            indirizzo:       c.indirizzo || '',
            tipo_cliente:    c.tipo_cliente || 'ordinario',
            attivo: true,
          })).filter(c => c.ragione_sociale && c.partita_iva.length >= 11)
          .map(c => ({ ...c, nome: c.ragione_sociale, cognome: '' }));
        }
        // AI OFF + PDF: non possiamo estrarre automaticamente — mostra form manuale
        if (!trovati.length && !isCsv && !aiEnabled) {
          setManualMode(true);
          setLoading(false);
          return;
        }
        if (!trovati.length) throw new Error('Nessun cliente trovato. Verifica che sia un\'esportazione ANA NES (PDF, immagine o CSV).');
        setClienti(trovati);
        setSel(new Set(trovati.map((_, i) => i))); // seleziona tutti di default
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
        setProgress('');
      }
    })();
  }, []);

  const toggleSel = (i) => setSel(p => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; });
  const toggleAll = () => setSel(p => p.size === clienti.length ? new Set() : new Set(clienti.map((_, i) => i)));

  const importa = async () => {
    setImporting(true);
    try {
      // Carica P.IVA già esistenti per evitare duplicati
      const { data: esistenti } = await sb.from('clienti')
        .select('partita_iva,codice_fiscale').eq('attivo', true);
      const pivaSet = new Set((esistenti || []).map(c => (c.partita_iva || '').replace(/\s/g, '')));
      const cfSet   = new Set((esistenti || []).map(c => (c.codice_fiscale || '').replace(/\s/g, '')));

      const daInserire = clienti
        .filter((_, i) => sel.has(i))
        .filter(c => {
          const piva = (c.partita_iva || '').replace(/\s/g, '');
          const cf   = (c.codice_fiscale || '').replace(/\s/g, '');
          return !pivaSet.has(piva) && !cfSet.has(cf);
        });

      const saltati = sel.size - daInserire.length;

      if (daInserire.length) {
        const BATCH = 100;
        for (let i = 0; i < daInserire.length; i += BATCH) {
          setProgress(`Inserimento ${Math.min(i + BATCH, daInserire.length)}/${daInserire.length}...`);
          const { error: insErr } = await sb.from('clienti').insert(daInserire.slice(i, i + BATCH));
          if (insErr) throw insErr;
        }
      }

      // Marca documento come processato
      await sb.from('documenti_import').update({ stato: 'processed' }).eq('id', doc.id);
      setDone({ inseriti: daInserire.length, saltati });
    } catch (e) {
      setError(e.message);
    } finally {
      setImporting(false);
      setProgress('');
    }
  };

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 680 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">📋 Import Anagrafica NES</div>
          <div className="modal-sub">{doc.filename}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--mu)' }}>
              ⏳ {progress || 'Analisi in corso...'}
            </div>
          )}
          {manualMode && (
            <div>
              <div className="alert alert-info" style={{marginBottom:'1rem',fontSize:'.8rem'}}>
                ⚠️ <strong>AI disattivata</strong> — inserisci manualmente i dati del cliente dal PDF.
                Puoi aggiungere più clienti uno alla volta.
              </div>
              <div className="form-grid">
                <div className="fg full"><label>Ragione Sociale *</label>
                  <input value={manualForm.ragione_sociale} onChange={e=>setManualForm(p=>({...p,ragione_sociale:e.target.value}))} placeholder="Es. ROSSI S.R.L."/></div>
                <div className="fg"><label>Partita IVA</label>
                  <input value={manualForm.partita_iva} onChange={e=>setManualForm(p=>({...p,partita_iva:e.target.value}))} placeholder="11 cifre"/></div>
                <div className="fg"><label>Codice Fiscale</label>
                  <input value={manualForm.codice_fiscale} onChange={e=>setManualForm(p=>({...p,codice_fiscale:e.target.value}))} placeholder="11 o 16 caratteri"/></div>
                <div className="fg"><label>Tipo</label>
                  <select value={manualForm.tipo_cliente} onChange={e=>setManualForm(p=>({...p,tipo_cliente:e.target.value}))}>
                    <option value="srl">S.r.l.</option>
                    <option value="snc">SNC/SAS</option>
                    <option value="ordinario">Ordinario</option>
                    <option value="forfettario">Forfettario</option>
                  </select>
                </div>
              </div>
              <button className="btn-sec" style={{marginTop:'.75rem'}} onClick={()=>{
                if(!manualForm.ragione_sociale)return;
                const c={...manualForm, partita_iva:manualForm.partita_iva||manualForm.codice_fiscale, codice_fiscale:manualForm.codice_fiscale||manualForm.partita_iva, attivo:true};
                setClienti(p=>[...p,c]);
                setSel(p=>new Set([...p,p.size]));
                setManualForm({ragione_sociale:'',partita_iva:'',codice_fiscale:'',tipo_cliente:'srl'});
              }}>+ Aggiungi cliente</button>
              {clienti.length>0&&<div style={{marginTop:'.5rem',fontSize:'.75rem',color:'var(--cy)'}}>✓ {clienti.length} clienti aggiunti</div>}
            </div>
          )}
          {error && <div className="alert alert-error">{error}</div>}
          {done && (
            <div className="alert alert-success" style={{ fontSize: '.9rem' }}>
              ✅ Completato — <strong>{done.inseriti}</strong> clienti inseriti,{' '}
              <strong>{done.saltati}</strong> già presenti (saltati).
              <div style={{ marginTop: '.75rem' }}>
                <button className="btn" onClick={onComplete}>Vai ai Clienti</button>
              </div>
            </div>
          )}
          {(!loading || manualMode) && !done && clienti.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '.75rem' }}>
                <span style={{ fontSize: '.8rem', color: 'var(--mu)' }}>
                  <strong style={{ color: 'var(--gold)' }}>{clienti.length}</strong> clienti trovati ·{' '}
                  <span style={{ cursor: 'pointer', color: 'var(--cy)' }} onClick={toggleAll}>
                    {sel.size === clienti.length ? 'Deseleziona tutti' : 'Seleziona tutti'}
                  </span>
                </span>
                <span style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{sel.size} selezionati</span>
              </div>
              <div style={{ maxHeight: 380, overflow: 'auto', border: '1px solid var(--bd)', borderRadius: 8 }}>
                {clienti.map((c, i) => (
                  <div key={i} onClick={() => toggleSel(i)}
                    style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.45rem .75rem', borderBottom: '1px solid rgba(33,40,58,.35)', cursor: 'pointer', background: sel.has(i) ? 'rgba(200,164,94,.06)' : 'transparent' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${sel.has(i) ? 'var(--gold)' : 'var(--bd2)'}`, background: sel.has(i) ? 'var(--gold)' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {sel.has(i) && <span style={{ color: '#0d1117', fontSize: '.5rem', fontWeight: 900 }}>✓</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: '.8rem', fontWeight: 500 }}>{c.ragione_sociale}</span>
                    <span style={{ fontSize: '.7rem', color: 'var(--mu)', fontFamily: 'monospace' }}>{c.partita_iva}</span>
                    <span className={`bdg ${c.tipo_cliente === 'srl' ? 'bdg-pu' : c.tipo_cliente === 'snc' ? 'bdg-green' : 'bdg-blue'}`} style={{ fontSize: '.55rem' }}>{c.tipo_cliente.toUpperCase()}</span>
                  </div>
                ))}
              </div>
              {progress && <div style={{ marginTop: '.5rem', fontSize: '.75rem', color: 'var(--mu)' }}>⏳ {progress}</div>}
              {error && <div className="alert alert-error" style={{ marginTop: '.5rem' }}>{error}</div>}
            </>
          )}
        </div>
        {(!loading || manualMode) && !done && clienti.length > 0 && (
          <div className="modal-foot">
            <button className="btn-sec" onClick={onClose}>Annulla</button>
            <button className="btn" disabled={importing || !sel.size} onClick={importa}>
              {importing ? '⏳ Importo...' : `📥 Importa ${sel.size} clienti`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
