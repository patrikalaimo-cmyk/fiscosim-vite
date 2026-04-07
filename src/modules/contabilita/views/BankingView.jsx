import { useEffect, useState } from 'react'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { fmtCurrency as fmt, fmtDate } from '../ui/formatters.js'
import { getBankConnectionBadgeClass, getRiconciliazioneBadgeClass } from '../ui/viewMappers.js'

export default function BankingView({ contTab, societaAttiva, setContTab }) {
  if (!societaAttiva) return null
  if (contTab !== 'movimenti_banca' && contTab !== 'riconciliazione') return null
  return <ModuloBanche societaId={societaAttiva?.id} contTab={contTab} setContTab={setContTab} />
}

function ModuloBanche({societaId,contTab,setContTab}){
  const [conti,setConti]=useState([]);
  const [movimenti,setMovimenti]=useState([]);
  const [fatture,setFatture]=useState([]);
  const [loading,setLoading]=useState(true);
  const [syncing,setSyncing]=useState(false);
  const [accessToken,setAccessToken]=useState(null);
  const [banks,setBanks]=useState([]);
  const [selectedConto,setSelectedConto]=useState(null);
  const [modalCollegaBanca,setModalCollegaBanca]=useState(false);
  const [matches,setMatches]=useState([]);
  const [pendingBankCallback,setPendingBankCallback]=useState(false);
  const [subView,setSubView]=useState('conti'); // conti, movimenti, riconcilia

  useEffect(()=>{if(societaId)caricaDati();},[societaId]);
  useEffect(()=>{
    try{
      const params=new URLSearchParams(window.location.search);
      if(params.get('bank_callback')){
        setPendingBankCallback(true);
        params.delete('bank_callback');
        const base=window.location.pathname+(params.toString()?`?${params.toString()}`:'');
        window.history.replaceState(null,'',base);
      }
    }catch(e){
      // ignore in environments without window
    }
  },[]);

  useEffect(()=>{
    if(!pendingBankCallback||!conti.length)return;
    const pendings=conti.filter(c=>c.stato==='pending');
    if(!pendings.length){
      setPendingBankCallback(false);
      return;
    }
    (async ()=>{
      for(const conto of pendings){
        await verificaCollegamento(conto);
      }
      setPendingBankCallback(false);
    })();
  },[pendingBankCallback,conti]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:c},{data:m},{data:f}]=await Promise.all([
      contabilitaRepo.getContiBancari(societaId),
      contabilitaRepo.getMovimentiBancariRecenti(societaId),
      contabilitaRepo.getPartitarioAperto(societaId)
    ]);
    setConti(c||[]);
    setMovimenti(m||[]);
    setFatture(f||[]);
    if(c?.length>0&&!selectedConto)setSelectedConto(c[0]);
    setLoading(false);
  };

  const authenticate=async()=>{
    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'authenticate'})
      });
      const data=await res.json();
      if(data.success){
        setAccessToken(data.access);
        return data.access;
      }else{
        alert(data.error||'Errore autenticazione');
        return null;
      }
    }catch(e){
      alert('Errore: '+e.message);
      return null;
    }
  };

  const loadBanks=async()=>{
    let token=accessToken;
    if(!token)token=await authenticate();
    if(!token)return;

    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'list_banks',accessToken:token,country:'IT'})
      });
      const data=await res.json();
      if(data.success){
        setBanks(data.banks);
        setModalCollegaBanca(true);
      }
    }catch(e){
      alert('Errore caricamento banche');
    }
  };

  const collegaBanca=async(bankId)=>{
    const token=accessToken||await authenticate();
    if(!token)return;

    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'create_link',
          accessToken:token,
          institutionId:bankId,
          redirectUrl:window.location.origin+'/contabilita?bank_callback=1'
        })
      });
      const data=await res.json();
      if(data.success){
        // Salva requisition
        await contabilitaRepo.insertContoBancario({
          societa_id:societaId,
          requisition_id:data.requisitionId,
          banca_id:bankId,
          banca_nome:banks.find(b=>b.id===bankId)?.name,
          stato:'pending'
        });
        // Apri link banca
        window.open(data.link,'_blank');
        setModalCollegaBanca(false);
        alert('Completa la procedura nella finestra della banca, poi torna qui e clicca "Verifica collegamento"');
      }
    }catch(e){
      alert('Errore: '+e.message);
    }
  };

  const verificaCollegamento=async(conto)=>{
    const token=accessToken||await authenticate();
    if(!token)return;

    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({action:'check_requisition',accessToken:token,requisitionId:conto.requisition_id})
      });
      const data=await res.json();
      
      if(data.status==='LN'&&data.accounts?.length>0){
        // Collegamento riuscito - salva account ID
        const accountId=data.accounts[0];
        
        // Ottieni dettagli conto
        const detRes=await fetch('/api/banking',{
          method:'POST',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({action:'get_account',accessToken:token,accountId})
        });
        const detData=await detRes.json();

        await contabilitaRepo.updateContoBancario(conto.id,{
          account_id:accountId,
          nome:detData.account?.name||conto.banca_nome,
          iban:detData.account?.iban,
          bic:detData.account?.bic,
          saldo_disponibile:detData.balances?.find(b=>b.balanceType==='interimAvailable')?.balanceAmount?.amount,
          saldo_contabile:detData.balances?.find(b=>b.balanceType==='closingBooked')?.balanceAmount?.amount,
          stato:'linked',
          data_ultimo_sync:new Date().toISOString()
        });

        await caricaDati();
        alert('Conto collegato con successo!');
      }else{
        alert('Collegamento non ancora completato. Stato: '+data.status);
      }
    }catch(e){
      alert('Errore verifica: '+e.message);
    }
  };

  const syncMovimenti=async(conto)=>{
    if(!conto?.account_id){alert('Conto non collegato');return;}
    
    setSyncing(true);
    const token=accessToken||await authenticate();
    if(!token){setSyncing(false);return;}

    try{
      // Ultimi 90 giorni
      const dateTo=new Date().toISOString().split('T')[0];
      const dateFrom=new Date(Date.now()-90*24*60*60*1000).toISOString().split('T')[0];

      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'get_transactions',
          accessToken:token,
          accountId:conto.account_id,
          dateFrom,
          dateTo
        })
      });
      const data=await res.json();

      if(data.success){
        // Salva movimenti
        let nuovi=0;
        for(const tx of data.transactions){
          const{error}=await contabilitaRepo.upsertMovimentoBancario({
            conto_bancario_id:conto.id,
            societa_id:societaId,
            transaction_id:tx.id,
            data_operazione:tx.date,
            importo:tx.amount,
            valuta:tx.currency,
            segno:tx.amount>=0?'avere':'dare',
            descrizione:tx.description,
            riferimento:tx.reference,
            controparte_nome:tx.counterparty,
            controparte_iban:tx.counterpartyIban,
            stato_riconciliazione:'da_riconciliare'
          });
          if(!error)nuovi++;
        }

        await contabilitaRepo.updateContoBancario(conto.id,{data_ultimo_sync:new Date().toISOString()});
        await caricaDati();
        alert(`Sincronizzati ${data.count} movimenti (${nuovi} nuovi)`);
      }
    }catch(e){
      alert('Errore sync: '+e.message);
    }
    setSyncing(false);
  };

  const autoMatch=async()=>{
    if(!movimenti.length||!fatture.length){alert('Servono movimenti e partite aperte');return;}

    const daRiconciliare=movimenti.filter(m=>m.stato_riconciliazione==='da_riconciliare');
    
    try{
      const res=await fetch('/api/banking',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          action:'auto_match',
          transactions:daRiconciliare,
          fatture
        })
      });
      const data=await res.json();
      
      if(data.success){
        setMatches(data.matches);
        
        // Aggiorna stato movimenti matchati
        for(const match of data.matches){
          await contabilitaRepo.updateMovimentoBancario(match.transaction.id,{
            stato_riconciliazione:'proposto',
            match_score:match.score,
            match_confidence:match.confidence,
            partita_id:match.fattura?.id
          });
        }

        await caricaDati();
        alert(`Trovati ${data.matches.length} match su ${daRiconciliare.length} movimenti\n(${data.stats.matchRate} match rate)`);
      }
    }catch(e){
      alert('Errore matching: '+e.message);
    }
  };

  const confermaMatch=async(movId,partitaId)=>{
    await contabilitaRepo.updateMovimentoBancario(movId,{
      stato_riconciliazione:'confermato',
      partita_id:partitaId,
      riconciliato_at:new Date().toISOString()
    });

    // Chiudi partita se importo corrisponde
    await contabilitaRepo.updatePartitario(partitaId,{stato:'chiusa',data_chiusura:new Date().toISOString().split('T')[0]});
    
    await caricaDati();
  };

  const stats={
    contiCollegati:conti.filter(c=>c.stato==='linked').length,
    movimentiTotali:movimenti.length,
    daRiconciliare:movimenti.filter(m=>m.stato_riconciliazione==='da_riconciliare').length,
    proposti:movimenti.filter(m=>m.stato_riconciliazione==='proposto').length,
    confermati:movimenti.filter(m=>m.stato_riconciliazione==='confermato').length
  };

  if(loading)return<div className="loading">⏳ Caricamento...</div>;

  return(
    <div>
      {/* Header */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🏦 Banche e Riconciliazione</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Collega i conti bancari via PSD2 e riconcilia automaticamente</div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          <button className="btn-sec" onClick={loadBanks}>+ Collega banca</button>
          {stats.daRiconciliare>0&&<button className="btn" onClick={autoMatch}>🤖 Auto-match ({stats.daRiconciliare})</button>}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid" style={{marginBottom:'1rem'}}>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--bl)'}}>{stats.contiCollegati}</div><div className="stat-lbl">Conti collegati</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--gold)'}}>{stats.daRiconciliare}</div><div className="stat-lbl">Da riconciliare</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--cy)'}}>{stats.proposti}</div><div className="stat-lbl">Match proposti</div></div>
        <div className="stat-card"><div className="stat-val" style={{color:'var(--gr)'}}>{stats.confermati}</div><div className="stat-lbl">Confermati</div></div>
      </div>

      {/* Sub-tabs */}
      <div className="pills" style={{marginBottom:'1rem'}}>
        <span className={'pill'+(subView==='conti'?' active':'')} onClick={()=>setSubView('conti')}>🏦 Conti</span>
        <span className={'pill'+(subView==='movimenti'?' active':'')} onClick={()=>setSubView('movimenti')}>📋 Movimenti</span>
        <span className={'pill'+(subView==='riconcilia'?' active':'')} onClick={()=>setSubView('riconcilia')}>🔗 Riconcilia {stats.proposti>0&&<span className="bdg bdg-cy" style={{marginLeft:'.3rem'}}>{stats.proposti}</span>}</span>
      </div>

      {/* CONTI */}
      {subView==='conti'&&(
        conti.length===0?(
          <div className="empty">
            <div className="empty-ico">🏦</div>
            <div className="empty-t">Nessun conto collegato</div>
            <div className="empty-s">Collega un conto bancario per iniziare la riconciliazione automatica</div>
            <button className="btn" onClick={loadBanks} style={{marginTop:'1rem'}}>+ Collega banca</button>
          </div>
        ):(
          <div style={{display:'grid',gap:'1rem',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))'}}>
            {conti.map(c=>(
              <div key={c.id} className="card" style={{padding:'1rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'.75rem',marginBottom:'.75rem'}}>
                  <div style={{width:40,height:40,background:'var(--s2)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.2rem'}}>🏦</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:600}}>{c.nome||c.banca_nome}</div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)'}}>{c.iban||'IBAN non disponibile'}</div>
                  </div>
                  <span className={'bdg '+getBankConnectionBadgeClass(c.stato)}>{c.stato}</span>
                </div>
                {c.stato==='linked'&&(
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.5rem',marginBottom:'.75rem',fontSize:'.8rem'}}>
                    <div><span style={{color:'var(--mu)'}}>Saldo:</span> <strong style={{color:'var(--gr)'}}>{fmt(c.saldo_disponibile)}</strong></div>
                    <div><span style={{color:'var(--mu)'}}>Ultimo sync:</span> {c.data_ultimo_sync?fmtDate(c.data_ultimo_sync.split('T')[0]):'Mai'}</div>
                  </div>
                )}
                <div style={{display:'flex',gap:'.5rem'}}>
                  {c.stato==='pending'&&<button className="btn-sec" style={{flex:1}} onClick={()=>verificaCollegamento(c)}>🔄 Verifica</button>}
                  {c.stato==='linked'&&<button className="btn" style={{flex:1}} onClick={()=>syncMovimenti(c)} disabled={syncing}>{syncing?'⏳':'📥'} Sincronizza</button>}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* MOVIMENTI */}
      {subView==='movimenti'&&(
        movimenti.length===0?(
          <div className="empty"><div className="empty-ico">📋</div><div className="empty-t">Nessun movimento</div><div className="empty-s">Sincronizza un conto per scaricare i movimenti</div></div>
        ):(
          <div className="card" style={{padding:0,overflow:'hidden'}}>
            <table className="tbl">
              <thead><tr><th>Data</th><th>Descrizione</th><th>Controparte</th><th>Importo</th><th>Stato</th></tr></thead>
              <tbody>{movimenti.slice(0,50).map(m=>(
                <tr key={m.id} className={'row-'+(m.stato_riconciliazione==='confermato'?'confirmed':m.stato_riconciliazione==='proposto'?'pending':'')}>
                  <td style={{fontSize:'.78rem'}}>{fmtDate(m.data_operazione)}</td>
                  <td style={{maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',fontSize:'.8rem'}}>{m.descrizione}</td>
                  <td style={{fontSize:'.78rem'}}>{m.controparte_nome||'—'}</td>
                  <td style={{fontWeight:600,color:m.importo>=0?'var(--gr)':'var(--rd)'}}>{m.importo>=0?'+':''}{fmt(m.importo)}</td>
                  <td><span className={'bdg '+getRiconciliazioneBadgeClass(m.stato_riconciliazione)}>{m.stato_riconciliazione}</span></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )
      )}

      {/* RICONCILIA */}
      {subView==='riconcilia'&&(
        <div>
          {movimenti.filter(m=>m.stato_riconciliazione==='proposto').length===0?(
            <div className="empty"><div className="empty-ico">🔗</div><div className="empty-t">Nessun match proposto</div><div className="empty-s">Clicca "Auto-match" per trovare corrispondenze automatiche</div></div>
          ):(
            <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>
              {movimenti.filter(m=>m.stato_riconciliazione==='proposto').map(m=>{
                const partita=fatture.find(f=>f.id===m.partita_id);
                return(
                  <div key={m.id} className="card" style={{padding:'1rem',borderLeft:'3px solid var(--cy)'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr auto 1fr',gap:'1rem',alignItems:'center'}}>
                      {/* Movimento */}
                      <div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.25rem'}}>MOVIMENTO BANCARIO</div>
                        <div style={{fontWeight:600}}>{fmtDate(m.data_operazione)}</div>
                        <div style={{fontSize:'.8rem'}}>{m.descrizione?.substring(0,50)}</div>
                        <div style={{fontSize:'1.1rem',fontWeight:700,color:m.importo>=0?'var(--gr)':'var(--rd)',marginTop:'.25rem'}}>{fmt(m.importo)}</div>
                      </div>
                      {/* Match indicator */}
                      <div style={{textAlign:'center'}}>
                        <div style={{fontSize:'1.5rem'}}>🔗</div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)'}}>Match {m.match_confidence}</div>
                        <div style={{fontSize:'.65rem',color:'var(--cy)'}}>{m.match_score}%</div>
                      </div>
                      {/* Partita */}
                      <div>
                        <div style={{fontSize:'.7rem',color:'var(--mu)',marginBottom:'.25rem'}}>PARTITA APERTA</div>
                        {partita?(
                          <>
                            <div style={{fontWeight:600}}>{fmtDate(partita.data_documento)} - {partita.numero_documento}</div>
                            <div style={{fontSize:'.8rem'}}>{partita.conto_descrizione}</div>
                            <div style={{fontSize:'1.1rem',fontWeight:700,color:'var(--gld2)',marginTop:'.25rem'}}>{fmt(partita.importo_originale)}</div>
                          </>
                        ):<div style={{color:'var(--mu)'}}>Partita non trovata</div>}
                      </div>
                    </div>
                    <div style={{display:'flex',gap:'.5rem',marginTop:'.75rem',justifyContent:'flex-end'}}>
                      <button className="btn-sec" onClick={()=>contabilitaRepo.updateMovimentoBancario(m.id,{stato_riconciliazione:'da_riconciliare',partita_id:null}).then(caricaDati)}>✗ Rifiuta</button>
                      <button className="btn" onClick={()=>confermaMatch(m.id,m.partita_id)}>✓ Conferma</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Modal Collega Banca */}
      {modalCollegaBanca&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalCollegaBanca(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500,maxHeight:'80vh'}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">🏦 Collega Conto Bancario</div>
              <div className="modal-sub">Seleziona la tua banca per collegarla via PSD2</div>
              <button className="modal-close" onClick={()=>setModalCollegaBanca(false)}>✕</button>
            </div>
            <div className="modal-body" style={{maxHeight:400,overflow:'auto'}}>
              <input placeholder="🔍 Cerca banca..." style={{marginBottom:'1rem',width:'100%'}} onChange={e=>{
                const s=e.target.value.toLowerCase();
                setBanks(prev=>banks.filter(b=>b.name.toLowerCase().includes(s)));
              }}/>
              <div style={{display:'flex',flexDirection:'column',gap:'.5rem'}}>
                {banks.slice(0,30).map(b=>(
                  <div key={b.id} onClick={()=>collegaBanca(b.id)} style={{display:'flex',alignItems:'center',gap:'.75rem',padding:'.6rem',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:8,cursor:'pointer',transition:'all .15s'}}
                    onMouseEnter={e=>e.currentTarget.style.borderColor='var(--gold)'}
                    onMouseLeave={e=>e.currentTarget.style.borderColor='var(--bd)'}>
                    {b.logo?<img src={b.logo} style={{width:32,height:32,borderRadius:4}}/>:<div style={{width:32,height:32,background:'var(--bd)',borderRadius:4,display:'flex',alignItems:'center',justifyContent:'center'}}>🏦</div>}
                    <div style={{flex:1}}>
                      <div style={{fontWeight:600,fontSize:'.85rem'}}>{b.name}</div>
                      {b.bic&&<div style={{fontSize:'.68rem',color:'var(--mu)'}}>{b.bic}</div>}
                    </div>
                    <span style={{color:'var(--gold)'}}>→</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
