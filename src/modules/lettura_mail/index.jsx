import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { ModuleHeader } from '../../shared/components'


const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]
const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

const EMAIL_ACCOUNTS = [
  { email: 'patenv25@gmail.com', label: 'Patenv (Test)' },
  { email: 'ilpapacommercialista@gmail.com', label: 'Il Papa Commercialista' },
  { email: 'patrik.alaimo@gmail.com', label: 'Patrik Alaimo' },
];

export function ModuloLetturaMail(){
  const [selectedAccount,setSelectedAccount]=useState(EMAIL_ACCOUNTS[0].email);
  const [emails,setEmails]=useState([]);
  const [clienti,setClienti]=useState([]);
  const [loading,setLoading]=useState(false);
  const [processing,setProcessing]=useState(null);
  const [selectedEmail,setSelectedEmail]=useState(null);
  const [stats,setStats]=useState({totali:0,conAllegati:0,elaborati:0});

  useEffect(()=>{
    sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva').eq('attivo',true).order('nome')
      .then(({data})=>setClienti(data||[]));
  },[]);

  const caricaEmail=async()=>{
    alert('Lettura inbox temporaneamente disattivata durante la messa in sicurezza della Fase A');
  };

  const elaboraEmail=async(email)=>{
    setProcessing(email.uid);
    try{
      // Check AI setting
      const{data:aiSetting}=await sb.from('impostazioni_studio').select('valore').eq('chiave','ai_enabled');
      const useAI=(Array.isArray(aiSetting)?aiSetting[0]:aiSetting)?.valore!=='false';

      // 1. Scarica allegati completi
      alert('Lettura inbox temporaneamente disattivata durante la messa in sicurezza della Fase A');
      setProcessing(null);
      return;

      // 2. Per ogni allegato, analizza (AI o skip) e salva
      for(const att of data.email.attachments){
        let analysis={tipo_documento:'altro',modulo_suggerito:'varie'};

        if(useAI){
          // AI MODE: classify with Claude
          const analyzeRes=await fetch('/api/document',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({
              fileBase64:att.content,
              filename:att.filename,
              mimeType:att.contentType
            })
          });
          if(analyzeRes.ok){
            const aiData=await analyzeRes.json();
            analysis=aiData.analysis||analysis;
          }
        }
        // else: no AI, keep default "altro"/"varie" → manual classification

        // Match cliente (works with or without AI, based on available data)
        let clienteMatch=null;
        if(analysis.partita_iva){
          clienteMatch=clienti.find(c=>c.partita_iva===analysis.partita_iva);
        }
        if(!clienteMatch&&analysis.codice_fiscale){
          clienteMatch=clienti.find(c=>c.codice_fiscale?.toUpperCase()===analysis.codice_fiscale?.toUpperCase());
        }

        // Salva nel database documenti_import
        const filePath=`email/${Date.now()}_${att.filename}`;
        
        // Upload file a Supabase Storage
        const fileBuffer=Uint8Array.from(atob(att.content),c=>c.charCodeAt(0));
        await sb.storage.from('documenti').upload(filePath,fileBuffer,{contentType:att.contentType});

        // Salva record
        await sb.from('documenti_import').insert([{
          filename:att.filename,
          file_path:filePath,
          file_size:att.size,
          mime_type:att.contentType,
          tipo_documento:analysis.tipo_documento,
          confidence:useAI?(analysis.confidence||0):0,
          ai_summary:useAI?analysis.descrizione_breve:null,
          ai_raw_response:useAI?analysis:null,
          cf_estratto:analysis.codice_fiscale,
          piva_estratta:analysis.partita_iva,
          cliente_id:clienteMatch?.id,
          cliente_match_type:clienteMatch?'auto':'none',
          modulo_destinazione:analysis.modulo_suggerito,
          stato:useAI?'classified':'manual_pending',
          note_operatore:`Importato da email: ${email.from} - ${email.subject}${useAI?'':' [no AI]'}`
        }]);
      }

      // Aggiorna stato email elaborata
      setEmails(prev=>prev.map(e=>e.uid===email.uid?{...e,elaborata:true}:e));
      setStats(prev=>({...prev,elaborati:prev.elaborati+1}));

    }catch(err){
      console.error('Errore elaborazione:',err);
      alert('Errore: '+err.message);
    }
    setProcessing(null);
  };

  const elaboraTutte=async()=>{
    const daElaborare=emails.filter(e=>e.hasAttachments&&!e.elaborata);
    for(const email of daElaborare){
      await elaboraEmail(email);
    }
  };

  return(
    <div className="page">
      {selectedEmail&&<EmailDetailModal email={selectedEmail} onClose={()=>setSelectedEmail(null)} onElabora={()=>{elaboraEmail(selectedEmail);setSelectedEmail(null);}}/>}
      
      <ModuleHeader
        sectionLabel="Operatività"
        title="📧 Lettura Mail Automatica"
        context="Leggi email, estrai allegati e classificali automaticamente con AI"
      />

      {/* Selezione account */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'.75rem',alignItems:'center',flexWrap:'wrap'}}>
          <div className="fg" style={{flex:1,minWidth:200,marginBottom:0}}>
            <label>Account Email</label>
            <select value={selectedAccount} onChange={e=>setSelectedAccount(e.target.value)}>
              {EMAIL_ACCOUNTS.map(a=><option key={a.email} value={a.email}>{a.label} ({a.email})</option>)}
            </select>
          </div>
          <button className="btn" onClick={caricaEmail} disabled={loading} style={{marginTop:'1.2rem'}}>
            {loading?'⏳ Caricamento...':'📥 Carica Email'}
          </button>
          {emails.filter(e=>e.hasAttachments&&!e.elaborata).length>0&&(
            <button className="btn-sec" onClick={elaboraTutte} disabled={processing} style={{marginTop:'1.2rem'}}>
              🤖 Elabora tutte ({emails.filter(e=>e.hasAttachments&&!e.elaborata).length})
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      {emails.length>0&&(
        <div className="stats-grid" style={{marginBottom:'1rem'}}>
          <div className="stat-card">
            <div className="stat-val" style={{color:'var(--bl)'}}>{stats.totali}</div>
            <div className="stat-lbl">Email trovate</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{color:'var(--gold)'}}>{stats.conAllegati}</div>
            <div className="stat-lbl">Con allegati</div>
          </div>
          <div className="stat-card">
            <div className="stat-val" style={{color:'var(--gr)'}}>{stats.elaborati}</div>
            <div className="stat-lbl">Elaborate</div>
          </div>
        </div>
      )}

      {/* Lista email */}
      {loading?<div className="loading">⏳ Connessione a {selectedAccount}...</div>:emails.length===0?(
        <div className="empty">
          <div className="empty-ico">📧</div>
          <div className="empty-t">Nessuna email caricata</div>
          <div className="empty-s">Seleziona un account e clicca "Carica Email" per leggere la posta</div>
        </div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th>Stato</th>
              <th>Da</th>
              <th>Oggetto</th>
              <th>Data</th>
              <th>Allegati</th>
              <th>Azioni</th>
            </tr></thead>
            <tbody>{emails.map(e=>(
              <tr key={e.uid} style={{opacity:e.elaborata?.6:1}}>
                <td>
                  {e.elaborata?(
                    <span className="bdg bdg-green">✓ Elaborata</span>
                  ):e.hasAttachments?(
                    <span className="bdg bdg-gold">📎 Da elaborare</span>
                  ):(
                    <span className="bdg bdg-gray">Senza allegati</span>
                  )}
                </td>
                <td>
                  <div style={{fontSize:'.78rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={e.from}>{e.from}</div>
                </td>
                <td>
                  <div style={{fontSize:'.8rem',fontWeight:500,maxWidth:250,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={e.subject}>{e.subject||'(nessun oggetto)'}</div>
                </td>
                <td style={{fontSize:'.75rem',color:'var(--mu)',whiteSpace:'nowrap'}}>{fmtDate(e.date?.split('T')[0])}</td>
                <td>
                  {e.attachments?.length>0?(
                    <div style={{display:'flex',gap:'.25rem',flexWrap:'wrap'}}>
                      {e.attachments.slice(0,3).map((a,i)=>(
                        <span key={i} title={a.filename} style={{fontSize:'.65rem',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:4,padding:'.1rem .35rem',maxWidth:80,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {a.filename?.includes('.pdf')?'📄':'📋'}{a.filename}
                        </span>
                      ))}
                      {e.attachments.length>3&&<span style={{fontSize:'.65rem',color:'var(--mu)'}}>+{e.attachments.length-3}</span>}
                    </div>
                  ):'—'}
                </td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn-icon" onClick={()=>setSelectedEmail(e)} title="Dettagli">👁️</button>
                    {e.hasAttachments&&!e.elaborata&&(
                      <button className="btn-icon" style={{borderColor:'rgba(200,164,94,.4)',color:'var(--gold)'}} onClick={()=>elaboraEmail(e)} disabled={processing===e.uid} title="Elabora">
                        {processing===e.uid?'⏳':'🤖'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          <div style={{padding:'.5rem 1rem',fontSize:'.68rem',color:'var(--mu)',borderTop:'1px solid var(--bd)'}}>
            {emails.length} email · Le email rimangono non lette nella casella originale
          </div>
        </div>
      )}

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        ℹ️ <strong>Come funziona:</strong> Il sistema legge le email non lette degli ultimi 7 giorni, estrae gli allegati PDF/XML, li classifica con AI e li salva in "Import Documenti". Le email rimangono non lette nella casella originale.
      </div>
    </div>
  );
}

function EmailDetailModal({email,onClose,onElabora}){
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">📧 Dettaglio Email</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>DA</div>
            <div style={{fontSize:'.85rem',fontWeight:500}}>{email.from}</div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>OGGETTO</div>
            <div style={{fontSize:'.9rem',fontWeight:600}}>{email.subject||'(nessun oggetto)'}</div>
          </div>
          <div style={{marginBottom:'1rem'}}>
            <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>DATA</div>
            <div style={{fontSize:'.85rem'}}>{new Date(email.date).toLocaleString('it-IT')}</div>
          </div>
          {email.attachments?.length>0&&(
            <div style={{marginBottom:'1rem'}}>
              <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.4rem'}}>ALLEGATI ({email.attachments.length})</div>
              <div style={{display:'flex',flexDirection:'column',gap:'.35rem'}}>
                {email.attachments.map((a,i)=>(
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'.5rem',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.5rem .7rem'}}>
                    <span style={{fontSize:'1.1rem'}}>{a.contentType?.includes('pdf')?'📄':'📋'}</span>
                    <div style={{flex:1}}>
                      <div style={{fontSize:'.8rem',fontWeight:500}}>{a.filename}</div>
                      <div style={{fontSize:'.68rem',color:'var(--mu)'}}>{(a.size/1024).toFixed(1)} KB</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {email.textPreview&&(
            <div>
              <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.2rem'}}>ANTEPRIMA</div>
              <div style={{fontSize:'.78rem',color:'var(--mu)',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,padding:'.6rem',lineHeight:1.5,maxHeight:150,overflow:'auto'}}>{email.textPreview}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Chiudi</button>
          {email.hasAttachments&&!email.elaborata&&<button className="btn" onClick={onElabora}>🤖 Elabora allegati</button>}
        </div>
      </div>
    </div>
  );
}

// ─── MODULO FATTURE MASSIVE ADE ──────────────────────────────
