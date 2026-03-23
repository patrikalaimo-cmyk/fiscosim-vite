import { loadScript } from '../../shared/utils'
import { useState, useEffect, useRef } from 'react'
import { sb } from '../../lib/supabase'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

export function ModuloFattureADE(){
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
