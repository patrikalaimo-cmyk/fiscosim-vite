import { parseXMLFattura, formattaXML, CATEGORIE_CESPITI, suggerisciCespiteDeterministico } from '../../shared/utils/fatture'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { useAIStatus } from '../../context/AIStatusContext'
import { TagInput } from '../../shared/components'
import { TIPO_LABEL, TIPO_COLOR, MESI } from '../../shared/constants'
import { shouldUseAI, routeDocument } from '../../core/workflow'
import { extractTextFromPDFBrowser, loadScript } from '../../shared/utils'

const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]

const CONT_SIDEBAR_MENU = [
  {section:"IMPOSTAZIONI",items:[
    {id:"societa",ico:"🏢",label:"Anagrafica Società"},
    {id:"piano_conti",ico:"🗂️",label:"Piano dei Conti"},
    {id:"causali",ico:"📋",label:"Causali Contabili"},
    {id:"causali_iva",ico:"💧",label:"Causali IVA"},
    {id:"percipienti",ico:"👔",label:"Percipienti"},
    {id:"regole",ico:"🤖",label:"Regole AI"}
  ]},
  {section:"OPERATIVO",items:[
    {id:"da_validare",ico:"⚡",label:"Da Validare",badge:true},
    {id:"registrate",ico:"✓",label:"Registrate"}
  ]},
  {section:"CONTABILITÀ",items:[
    {id:"prima_nota",ico:"📝",label:"Prima Nota"},
    {id:"corrispettivi",ico:"🧾",label:"Corrispettivi"},
    {id:"scritture",ico:"📒",label:"Scritture Varie"}
  ]},
  {section:"BANCHE",items:[
    {id:"movimenti_banca",ico:"🏦",label:"Movimenti"},
    {id:"riconciliazione",ico:"🔗",label:"Riconciliazione"}
  ]},
  {section:"ADEMPIMENTI",items:[
    {id:"liquidazioni_iva",ico:"💰",label:"Liquidazioni IVA"},
    {id:"lipe",ico:"📤",label:"LIPE"},
    {id:"iva_annuale",ico:"📊",label:"IVA Annuale"},
    {id:"cu",ico:"📜",label:"Certificazioni Uniche"},
    {id:"ritenute",ico:"✂️",label:"Ritenute"},
    {id:"f770",ico:"📑",label:"770"},
    {id:"intrastat",ico:"🌍",label:"Intrastat"}
  ]},
  {section:"STAMPE",items:[
    {id:"registri_iva",ico:"📖",label:"Registri IVA"},
    {id:"partitari",ico:"💳",label:"Partitari"},
    {id:"giornale",ico:"📰",label:"Giornale"},
    {id:"mastrini",ico:"📚",label:"Mastrini"},
    {id:"bilancio",ico:"⚖️",label:"Bilancio"}
  ]}
];

export function ModuloContabilita({ruolo}){
  const [societa,setSocieta]=useState([]);
  const [societaAttiva,setSocietaAttiva]=useState(null);
  const [loading,setLoading]=useState(true);
  const [contTab,setContTab]=useState(()=>{
    // Controlla se c'è un sub-tab salvato dall'Hub Export
    const savedTab = localStorage.getItem('contabilita_sub_tab');
    if(savedTab){
      localStorage.removeItem('contabilita_sub_tab'); // Rimuovi dopo la lettura
      return savedTab;
    }
    return 'da_validare';
  });
  
  // Dati
  const [documenti,setDocumenti]=useState([]);
  const [pianoConti,setPianoConti]=useState([]);
  const [causaliContabili,setCausaliContabili]=useState([]);
  const [causaliIva,setCausaliIva]=useState([]);
  const [regoleAI,setRegoleAI]=useState([]);
  const [scritture,setScritture]=useState([]);
  const [percipienti,setPercipienti]=useState([]);
  const [clienti,setClienti]=useState([]);
  
  // Selezione
  const [selectedDocs,setSelectedDocs]=useState([]);
  const [docInEdit,setDocInEdit]=useState(null);
  const [splitMode,setSplitMode]=useState('split'); // split, pdf, scrittura
  
  // Modali
  const [modalSocieta,setModalSocieta]=useState(false);
  const [modalImportPDF,setModalImportPDF]=useState(null);
  const [modalBulkEdit,setModalBulkEdit]=useState(false);

  useEffect(()=>{caricaSocieta();},[]);
  useEffect(()=>{if(societaAttiva)caricaTutto();},[societaAttiva]);

  const caricaSocieta=async()=>{
    const{data}=await sb.from('societa').select('*').eq('attiva',true).order('denominazione');
    setSocieta(data||[]);
    if(data?.length>0)setSocietaAttiva(data[0]);
    setLoading(false);
  };

  const caricaTutto=async()=>{
    if(!societaAttiva)return;
    const[{data:docs},{data:pc},{data:cc},{data:ci},{data:reg},{data:pn},{data:perc},{data:cli}]=await Promise.all([
      sb.from('documenti_contabilita').select('*').eq('societa_id',societaAttiva.id).order('created_at',{ascending:false}),
      (async()=>{const PAGE=1000;let all=[],from=0;while(true){const{data,error}=await sb.from('piano_conti').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('codice').range(from,from+PAGE-1);if(error)throw error;all=[...all,...(data||[])];if(!data||data.length<PAGE)break;from+=PAGE;}return{data:all,error:null};})(),
      sb.from('causali_contabili').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('codice').limit(2000),
      sb.from('causali_iva').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('codice').limit(2000),
      sb.from('regole_automatiche').select('*').eq('societa_id',societaAttiva.id).eq('attiva',true).order('priorita'),
      sb.from('prima_nota').select('*').eq('societa_id',societaAttiva.id).order('numero_registrazione',{ascending:false}).limit(100),
      sb.from('percipienti').select('*').eq('societa_id',societaAttiva.id).eq('attivo',true).order('ragione_sociale'),
      sb.from('clienti').select('id,codice_cliente,nome,cognome,ragione_sociale,codice_fiscale,partita_iva').eq('attivo',true).order('codice_cliente')
    ]);
    setDocumenti(docs||[]);
    setPianoConti(pc||[]);
    setCausaliContabili(cc||[]);
    setCausaliIva(ci||[]);
    setRegoleAI(reg||[]);
    setScritture(pn||[]);
    setPercipienti(perc||[]);
    setClienti(cli||[]);
  };

  // Stats per badge
  const stats={
    daValidare:documenti.filter(d=>d.validation_status==='pending').length,
    confermati:documenti.filter(d=>d.validation_status==='confirmed').length,
    errori:documenti.filter(d=>d.validation_status==='error').length,
    registrati:documenti.filter(d=>d.workflow_status==='registered').length
  };

  // Toggle selezione
  const toggleSelect=(id)=>setSelectedDocs(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  const selectAll=(ids)=>setSelectedDocs(ids);
  const deselectAll=()=>setSelectedDocs([]);

  // Conferma singola
  const confermaDoc=async(docId)=>{
    await sb.from('documenti_contabilita').update({validation_status:'confirmed',validated_at:new Date().toISOString()}).eq('id',docId);
    setDocumenti(prev=>prev.map(d=>d.id===docId?{...d,validation_status:'confirmed'}:d));
  };

  // Conferma multipla
  const confermaTutti=async()=>{
    if(!selectedDocs.length)return;
    await sb.from('documenti_contabilita').update({validation_status:'confirmed',validated_at:new Date().toISOString()}).in('id',selectedDocs);
    setDocumenti(prev=>prev.map(d=>selectedDocs.includes(d.id)?{...d,validation_status:'confirmed'}:d));
    setSelectedDocs([]);
  };

  // Registra confermati → crea scritture prima nota
  const registraConfermati=async()=>{
    const daRegistrare=documenti.filter(d=>d.validation_status==='confirmed'&&d.workflow_status!=='registered');
    if(!daRegistrare.length){alert('Nessun documento confermato da registrare');return;}
    
    if(!confirm(`Stai per registrare ${daRegistrare.length} documenti in Prima Nota.\n\nConfermi?`))return;
    
    let registrati=0;
    for(const doc of daRegistrare){
      try{
        const isPassiva=doc.tipo_documento?.includes('passiva');
        const isAttiva=doc.tipo_documento?.includes('attiva');
        
        // Find conto from doc
        const conto=doc.conto_id?pianoConti.find(c=>c.id===doc.conto_id):null;
        
        // Find IVA account in piano conti
        const contoIva=pianoConti.find(c=>c.is_iva&&c.livello>=3&&
          (isPassiva?/credito/i.test(c.descrizione):/debito/i.test(c.descrizione)));
        
        // Find fornitore/cliente account
        const contoControparte=doc.conto_id?conto:
          pianoConti.find(c=>(isPassiva?c.is_fornitore:c.is_cliente)&&c.livello>=4);
        
        // Generic cost/revenue if no specific conto assigned
        const contoCostoRicavo=conto||(isPassiva
          ?pianoConti.find(c=>c.codice?.startsWith('4')&&c.livello>=3)
          :pianoConti.find(c=>c.codice?.startsWith('3')&&c.livello>=3));

        const causale=isPassiva
          ?causaliContabili.find(c=>/FF|fatt.*forn/i.test(c.codice+c.descrizione))
          :causaliContabili.find(c=>/FC|fatt.*cli/i.test(c.codice+c.descrizione));

        // 1. Create prima nota header
        const{data:pn,error:pnErr}=await sb.from('prima_nota').insert([{
          societa_id:societaAttiva.id,
          data_registrazione:doc.data_documento||new Date().toISOString().slice(0,10),
          data_documento:doc.data_documento,
          numero_documento:doc.numero_documento,
          causale_codice:causale?.codice||(isPassiva?'FF':'FC'),
          descrizione:`${isPassiva?'Fatt. passiva':'Fatt. attiva'} ${doc.soggetto_denominazione||''} n.${doc.numero_documento||'?'}`,
          cliente_fornitore_nome:doc.soggetto_denominazione,
          totale_dare:doc.totale||0,
          totale_avere:doc.totale||0,
          stato:'provvisoria',
          documento_import_id:doc.source_document_id||null
        }]).select().single();
        
        if(pnErr)throw pnErr;

        // 2. Create righe prima nota (3 righe: costo/ricavo, IVA, fornitore/cliente)
        const righe=[];
        
        if(isPassiva){
          // FATTURA PASSIVA: Dare costo + Dare IVA credito + Avere fornitore
          righe.push({
            prima_nota_id:pn.id,riga_numero:1,
            conto_id:contoCostoRicavo?.id||null,
            conto_codice:contoCostoRicavo?.codice,
            conto_descrizione:contoCostoRicavo?.descrizione,
            descrizione_riga:'Costo/Acquisto',
            importo_dare:doc.imponibile||doc.totale||0,importo_avere:0,
            imponibile:doc.imponibile||0,iva:0
          });
          if(doc.iva>0){
            righe.push({
              prima_nota_id:pn.id,riga_numero:2,
              conto_id:contoIva?.id||null,
              conto_codice:contoIva?.codice,
              conto_descrizione:contoIva?.descrizione||'IVA ns. credito',
              descrizione_riga:'IVA a credito',
              importo_dare:doc.iva||0,importo_avere:0,
              imponibile:0,iva:doc.iva||0
            });
          }
          righe.push({
            prima_nota_id:pn.id,riga_numero:3,
            conto_id:contoControparte?.id||null,
            conto_codice:contoControparte?.codice,
            conto_descrizione:contoControparte?.descrizione||doc.soggetto_denominazione,
            descrizione_riga:`Fornitore ${doc.soggetto_denominazione||''}`,
            importo_dare:0,importo_avere:doc.totale||0,
            imponibile:0,iva:0
          });
        }else{
          // FATTURA ATTIVA: Dare cliente + Avere ricavo + Avere IVA debito
          righe.push({
            prima_nota_id:pn.id,riga_numero:1,
            conto_id:contoControparte?.id||null,
            conto_codice:contoControparte?.codice,
            conto_descrizione:contoControparte?.descrizione||doc.soggetto_denominazione,
            descrizione_riga:`Cliente ${doc.soggetto_denominazione||''}`,
            importo_dare:doc.totale||0,importo_avere:0,
            imponibile:0,iva:0
          });
          righe.push({
            prima_nota_id:pn.id,riga_numero:2,
            conto_id:contoCostoRicavo?.id||null,
            conto_codice:contoCostoRicavo?.codice,
            conto_descrizione:contoCostoRicavo?.descrizione,
            descrizione_riga:'Ricavo/Vendita',
            importo_dare:0,importo_avere:doc.imponibile||doc.totale||0,
            imponibile:doc.imponibile||0,iva:0
          });
          if(doc.iva>0){
            righe.push({
              prima_nota_id:pn.id,riga_numero:3,
              conto_id:contoIva?.id||null,
              conto_codice:contoIva?.codice,
              conto_descrizione:contoIva?.descrizione||'IVA ns. debito',
              descrizione_riga:'IVA a debito',
              importo_dare:0,importo_avere:doc.iva||0,
              imponibile:0,iva:doc.iva||0
            });
          }
        }

        if(righe.length>0){
          const{error:righeErr}=await sb.from('prima_nota_righe').insert(righe);
          if(righeErr)console.error('Righe error:',righeErr);
        }

        // 3. Update document status
        await sb.from('documenti_contabilita').update({
          workflow_status:'registered',
          registered_at:new Date().toISOString(),
          prima_nota_id:pn.id
        }).eq('id',doc.id);
        
        registrati++;
      }catch(err){
        console.error('Registrazione error per doc',doc.id,err);
      }
    }
    
    await caricaTutto();
    alert(`✅ Registrati ${registrati}/${daRegistrare.length} documenti in Prima Nota`);
  };

  if(loading)return<div className="loading">⏳ Caricamento...</div>;

  return(
    <div className="cont-layout">
      {/* Sidebar Contabilità */}
      <div className="cont-sidebar">
        {/* Selezione società */}
        <div style={{padding:'0 1rem .75rem',borderBottom:'1px solid var(--bd)'}}>
          <select value={societaAttiva?.id||''} onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s);}} style={{width:'100%',fontSize:'.78rem'}}>
            {societa.length===0&&<option value="">Nessuna società</option>}
            {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
          </select>
          <div style={{marginTop:'.4rem',display:'flex',gap:'.3rem'}}>
            <button className="btn-sec" style={{flex:1,fontSize:'.68rem',padding:'.25rem'}} onClick={()=>setModalSocieta(true)}>+ Nuova</button>
          </div>
        </div>

        {/* Menu */}
        {CONT_SIDEBAR_MENU.map(sec=>(
          <div key={sec.section}>
            <div className="cont-sidebar-section">{sec.section}</div>
            {sec.items.map(item=>(
              <div key={item.id} className={'cont-sidebar-item'+(contTab===item.id?' active':'')} onClick={()=>setContTab(item.id)}>
                <span>{item.ico}</span>
                <span style={{flex:1}}>{item.label}</span>
                {item.badge&&stats.daValidare>0&&<span className="bdg bdg-gold" style={{fontSize:'.6rem'}}>{stats.daValidare}</span>}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Main Content */}
      <div className="cont-main">
        {!societaAttiva?(
          <div className="empty"><div className="empty-ico">🏢</div><div className="empty-t">Seleziona o crea una società</div></div>
        ):(
          <>
            {/* DA VALIDARE - Core workflow */}
            {contTab==='da_validare'&&<DaValidareView 
              documenti={documenti.filter(d=>d.workflow_status!=='registered')} 
              pianoConti={pianoConti}
              causaliContabili={causaliContabili}
              causaliIva={causaliIva}
              selectedDocs={selectedDocs}
              toggleSelect={toggleSelect}
              selectAll={selectAll}
              deselectAll={deselectAll}
              confermaDoc={confermaDoc}
              confermaTutti={confermaTutti}
              registraConfermati={registraConfermati}
              onEdit={setDocInEdit}
              setModalBulkEdit={setModalBulkEdit}
              stats={stats}
              onRefresh={caricaTutto}
            />}

            {/* Piano dei Conti */}
            {contTab==='piano_conti'&&<PianoContiView pianoConti={pianoConti} societaId={societaAttiva.id} onImport={()=>setModalImportPDF('piano_conti')} onRefresh={caricaTutto}/>}

            {/* Causali Contabili */}
            {contTab==='causali'&&<CausaliView causali={causaliContabili} tipo="contabili" societaId={societaAttiva.id} onImport={()=>setModalImportPDF('causali')} onRefresh={caricaTutto}/>}

            {/* Causali IVA */}
            {contTab==='causali_iva'&&<CausaliView causali={causaliIva} tipo="iva" societaId={societaAttiva.id} onImport={()=>setModalImportPDF('causali_iva')} onRefresh={caricaTutto}/>}

            {/* Prima Nota */}
            {contTab==='prima_nota'&&<PrimaNotaView scritture={scritture} pianoConti={pianoConti} causali={causaliContabili} causaliIva={causaliIva} clienti={clienti} societaId={societaAttiva.id} onRefresh={caricaTutto}/>}

            {/* Registrate */}
            {contTab==='registrate'&&<RegistrateView documenti={documenti.filter(d=>d.workflow_status==='registered')}/>}

            {/* Banche - Vista dedicata */}
            {(contTab==='movimenti_banca'||contTab==='riconciliazione')&&<ModuloBanche societaId={societaAttiva?.id} contTab={contTab} setContTab={setContTab}/>}

            {/* Stampe - Vista dedicata */}
            {['registri_iva','partitari','giornale','mastrini','bilancio'].includes(contTab)&&(
              <StampeView 
                tipoStampa={contTab} 
                societa={societaAttiva} 
                scritture={scritture}
                pianoConti={pianoConti}
                causaliIva={causaliIva}
              />
            )}

            {/* Liquidazioni IVA */}
            {contTab==='liquidazioni_iva'&&<LiquidazioniIVAView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva}/>}

            {/* LIPE */}
            {contTab==='lipe'&&<LIPEView societa={societaAttiva}/>}

            {/* Corrispettivi */}
            {contTab==='corrispettivi'&&<CorrispettiviView societa={societaAttiva}/>}

            {/* 770 */}
            {contTab==='f770'&&<Modello770View societa={societaAttiva}/>}

            {/* Intrastat */}
            {contTab==='intrastat'&&<IntrastatView societa={societaAttiva}/>}

            {/* Percipienti */}
            {contTab==='percipienti'&&<PercipientiView societa={societaAttiva} onRefresh={caricaTutto}/>}

            {/* Ritenute */}
            {contTab==='ritenute'&&<RitenuteView societa={societaAttiva}/>}

            {/* IVA Annuale */}
            {contTab==='iva_annuale'&&<IvaAnnualeView societa={societaAttiva} scritture={scritture} causaliIva={causaliIva}/>}

            {/* Placeholder per altri moduli */}
            {['societa','regole','scritture','cu'].includes(contTab)&&(
              <div className="card" style={{padding:'2rem',textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'.5rem'}}>🚧</div>
                <div style={{fontSize:'1rem',fontWeight:600}}>Modulo in sviluppo</div>
                <div style={{fontSize:'.8rem',color:'var(--mu)',marginTop:'.25rem'}}>Questa sezione sarà disponibile a breve</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modali */}
      {modalSocieta&&<ModalNuovaSocieta onSave={async(d)=>{const{data:ns}=await sb.from('societa').insert([d]).select().single();await caricaSocieta();setModalSocieta(false);return ns;}} onClose={()=>setModalSocieta(false)}/>}
      {modalImportPDF&&<ModalImportPDF tipo={modalImportPDF} societaId={societaAttiva?.id} onComplete={()=>{setModalImportPDF(null);caricaTutto();}} onClose={()=>setModalImportPDF(null)}/>}
      {modalBulkEdit&&<ModalBulkEdit docs={selectedDocs.map(id=>documenti.find(d=>d.id===id)).filter(Boolean)} pianoConti={pianoConti} causaliIva={causaliIva} onSave={async(updates)=>{await sb.from('documenti_contabilita').update(updates).in('id',selectedDocs);await caricaTutto();setSelectedDocs([]);setModalBulkEdit(false);}} onClose={()=>setModalBulkEdit(false)}/>}
      {docInEdit&&<ModalEditDoc doc={docInEdit} pianoConti={pianoConti} causaliContabili={causaliContabili} causaliIva={causaliIva} onSave={caricaTutto} onClose={()=>setDocInEdit(null)}/>}
    </div>
  );
}

// ─── DA VALIDARE VIEW ────────────────────────────────────────
function DaValidareView({documenti,pianoConti,causaliContabili,causaliIva,selectedDocs,toggleSelect,selectAll,deselectAll,confermaDoc,confermaTutti,registraConfermati,onEdit,setModalBulkEdit,stats,onRefresh}){
  const [filtroStato,setFiltroStato]=useState('tutti');
  const [filtroFornitore,setFiltroFornitore]=useState('');
  const [searchTerm,setSearchTerm]=useState('');

  const filtered=documenti.filter(d=>{
    if(filtroStato!=='tutti'&&d.validation_status!==filtroStato)return false;
    if(filtroFornitore&&d.soggetto_piva!==filtroFornitore)return false;
    if(searchTerm){
      const s=searchTerm.toLowerCase();
      if(!(d.soggetto_denominazione||'').toLowerCase().includes(s)&&!(d.numero_documento||'').toLowerCase().includes(s))return false;
    }
    return true;
  });

  const fornitori=[...new Set(documenti.map(d=>d.soggetto_piva).filter(Boolean))];

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>⚡ Da Validare</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Documenti in attesa di conferma operatore</div>
        </div>
        <div style={{display:'flex',gap:'.5rem',flexWrap:'wrap'}}>
          {selectedDocs.length>0&&(
            <>
              <button className="btn-sec" onClick={()=>setModalBulkEdit(true)}>✏️ Modifica ({selectedDocs.length})</button>
              <button className="btn-sec" onClick={confermaTutti}>✓ Conferma ({selectedDocs.length})</button>
              <button className="btn-sec" style={{borderColor:'rgba(224,82,82,.3)',color:'#ff8585'}} onClick={async()=>{
                if(!confirm('Eliminare '+selectedDocs.length+' documenti selezionati?'))return;
                for(const id of selectedDocs){await sb.from('documenti_contabilita').delete().eq('id',id);}
                deselectAll();if(onRefresh)onRefresh();
              }}>🗑 Elimina ({selectedDocs.length})</button>
            </>
          )}
          <button className="btn" onClick={registraConfermati} disabled={stats.confermati===0}>📝 Registra confermati ({stats.confermati})</button>
        </div>
      </div>

      {/* Stats mini */}
      <div style={{display:'flex',gap:'.75rem',marginBottom:'1rem'}}>
        {[['🟡',stats.daValidare,'In attesa','pending'],['🟢',stats.confermati,'Confermati','confirmed'],['🔴',stats.errori,'Da rivedere','error']].map(([ico,n,l,f])=>(
          <div key={f} onClick={()=>setFiltroStato(filtroStato===f?'tutti':f)} style={{cursor:'pointer',padding:'.5rem 1rem',background:filtroStato===f?'rgba(200,164,94,.1)':'var(--s2)',border:'1px solid '+(filtroStato===f?'var(--gold)':'var(--bd)'),borderRadius:8,display:'flex',alignItems:'center',gap:'.5rem'}}>
            <span>{ico}</span>
            <span style={{fontWeight:700}}>{n}</span>
            <span style={{fontSize:'.75rem',color:'var(--mu)'}}>{l}</span>
          </div>
        ))}
      </div>

      {/* Filtri */}
      <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem',flexWrap:'wrap'}}>
        <input placeholder="🔍 Cerca..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{flex:1,minWidth:200}}/>
        <select value={filtroFornitore} onChange={e=>setFiltroFornitore(e.target.value)} style={{minWidth:180}}>
          <option value="">Tutti i fornitori/clienti</option>
          {fornitori.map(p=><option key={p} value={p}>{documenti.find(d=>d.soggetto_piva===p)?.soggetto_denominazione||p}</option>)}
        </select>
      </div>

      {/* Tabella */}
      {filtered.length===0?(
        <div className="empty"><div className="empty-ico">📄</div><div className="empty-t">Nessun documento</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th style={{width:40}}><input type="checkbox" checked={selectedDocs.length===filtered.length&&filtered.length>0} onChange={e=>e.target.checked?selectAll(filtered.map(d=>d.id)):deselectAll()}/></th>
              <th>Stato</th>
              <th>Tipo</th>
              <th>N° Doc</th>
              <th>Data</th>
              <th>Soggetto</th>
              <th>Totale</th>
              <th>Conto proposto</th>
              <th>Azioni</th>
            </tr></thead>
            <tbody>{filtered.map(d=>(
              <tr key={d.id} className={'row-'+(d.validation_status==='confirmed'?'confirmed':d.validation_status==='error'?'error':'pending')}>
                <td><input type="checkbox" checked={selectedDocs.includes(d.id)} onChange={()=>toggleSelect(d.id)}/></td>
                <td>
                  <span className={'bdg status-'+d.validation_status}>
                    {d.validation_status==='pending'?'🟡':d.validation_status==='confirmed'?'🟢':'🔴'}
                  </span>
                </td>
                <td><span className={'bdg '+(d.tipo_documento?.includes('attiva')?'bdg-green':'bdg-gold')}>{d.tipo_documento?.includes('attiva')?'📤':'📥'}</span></td>
                <td style={{fontWeight:600}}>{d.numero_documento||'—'}</td>
                <td style={{fontSize:'.78rem'}}>{fmtDate(d.data_documento)}</td>
                <td>
                  <div style={{fontSize:'.8rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis'}}>{d.soggetto_denominazione||'—'}</div>
                  <div style={{fontSize:'.65rem',color:'var(--mu)'}}>{d.soggetto_piva}</div>
                </td>
                <td style={{fontWeight:700,color:'var(--gld2)'}}>{fmt(d.totale)}</td>
                <td style={{fontSize:'.75rem',color:'var(--mu)'}}>{pianoConti.find(c=>c.id===d.conto_id)?.descrizione||'Da assegnare'}</td>
                <td>
                  <div className="tbl-actions">
                    <button className="btn-icon" onClick={()=>onEdit(d)} title="Modifica">✏️</button>
                    {d.validation_status==='pending'&&<button className="btn-icon" style={{borderColor:'rgba(76,175,80,.4)',color:'var(--gr)'}} onClick={()=>confermaDoc(d.id)} title="Conferma">✓</button>}
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

// ─── IMPORT FATTURE VIEW ─────────────────────────────────────
function ImportFattureView({societaId,onComplete}){
  const [uploading,setUploading]=useState(false);
  const [progress,setProgress]=useState(null);
  const [aiEnabled,setAiEnabled]=useState(true);
  const fileRef=useRef();
  const ai=useAIStatus();

  // Load AI setting
  useEffect(()=>{
    sb.from('impostazioni_studio').select('chiave,valore').eq('chiave','ai_enabled')
      .then(({data})=>setAiEnabled(data?.valore!=='false'));
  },[]);

  // Deterministic XML fattura parser (no AI needed)
  const parseXMLFile=async(file)=>{
    const text=await file.text();
    const parsed=parseXMLFattura(text);
    const isPassiva=parsed.tipo==='TD01'||parsed.tipo==='TD02'||parsed.tipo==='TD04';
    const aliquota=parsed.lines?.[0]?.iva||22;
    const iva=parsed.imponibile*(aliquota/100);
    return {
      tipo_fattura:isPassiva?'fattura_passiva':'fattura_attiva',
      numero_documento:parsed.numero,
      data_documento:parsed.data,
      cedente:{denominazione:parsed.nome_cedente,partita_iva:parsed.piva_cedente},
      cessionario:{denominazione:parsed.nome_cessionario,partita_iva:parsed.piva_cessionario},
      imponibile:parsed.imponibile,
      iva:Math.round(iva*100)/100,
      totale:parsed.totale_doc||parsed.imponibile+iva,
      aliquota_iva:aliquota,
      is_transitorio:true, // senza AI, sempre transitorio (operatore conferma conto)
      motivo_transitorio:'Classificazione manuale richiesta',
      confidence:0,
      proposta_contabile:{
        causale_codice:isPassiva?'FF':'FC',
        causale_descrizione:isPassiva?'Fattura Fornitore':'Fattura Cliente',
      }
    };
  };

  const handleUpload=async(e)=>{
    const files=Array.from(e.target.files);
    if(!files.length)return;
    if(!societaId){alert('Nessuna società selezionata. Seleziona una società prima di importare.');return;}
    
    setUploading(true);
    setProgress({current:0,total:files.length});
    const method=aiEnabled?'ai':'local';
    if(aiEnabled)ai.setAI('processing','Import fatture','ai');

    for(let i=0;i<files.length;i++){
      const file=files[i];
      setProgress({current:i+1,total:files.length,file:file.name});

      try{
        let analysis={tipo_fattura:'fattura_passiva',is_transitorio:true};
        const isXML=file.name.toLowerCase().endsWith('.xml');

        if(aiEnabled){
          // ━━━ AI MODE: send to Claude for full analysis ━━━
          const base64=await new Promise((res,rej)=>{
            const reader=new FileReader();
            reader.onload=()=>res(reader.result.split(',')[1]);
            reader.onerror=rej;
            reader.readAsDataURL(file);
          });
          const analyzeRes=await fetch('/api/proposta-contabile',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({fileBase64:base64,filename:file.name,mimeType:file.type})
          });
          if(analyzeRes.ok){
            const data=await analyzeRes.json();
            analysis=data.analysis||analysis;
          }
        }else if(isXML){
          // ━━━ LOCAL MODE (XML): deterministic parsing ━━━
          analysis=await parseXMLFile(file);
        }else{
          // ━━━ LOCAL MODE (PDF): save as manual_pending ━━━
          analysis={tipo_fattura:'fattura_passiva',is_transitorio:true,
            motivo_transitorio:'PDF senza AI - classificazione manuale',confidence:0};
        }

        // Upload file a storage
        const filePath=`contabilita/${societaId}/${Date.now()}_${file.name}`;
        await sb.storage.from('documenti').upload(filePath,file);
        const{data:urlData}=sb.storage.from('documenti').getPublicUrl(filePath);

        // Salva documento (con validazione societaId)
        if(!societaId){console.error('ERRORE: societaId è null/undefined!');throw new Error('Società non selezionata');}
        const{error:insertErr}=await sb.from('documenti_contabilita').insert([{
          societa_id:societaId,
          filename:file.name,
          file_path:filePath,
          file_url:urlData?.publicUrl,
          mime_type:file.type,
          file_size:file.size,
          tipo_documento:analysis.tipo_fattura,
          numero_documento:analysis.numero_documento,
          data_documento:analysis.data_documento,
          soggetto_denominazione:analysis.cedente?.denominazione||analysis.cessionario?.denominazione,
          soggetto_piva:analysis.cedente?.partita_iva||analysis.cessionario?.partita_iva,
          soggetto_cf:analysis.cedente?.codice_fiscale||analysis.cessionario?.codice_fiscale,
          imponibile:analysis.imponibile,
          iva:analysis.iva,
          totale:analysis.totale,
          workflow_status:aiEnabled?'proposed':'manual',
          validation_status:analysis.is_transitorio?'error':'pending',
          ai_confidence:analysis.confidence||0
        }]);
        if(insertErr){console.error('Insert error:',insertErr);throw insertErr;}

      }catch(err){
        console.error('Import error:',err);
      }
    }

    ai.setAI('done','Import fatture',method);
    setUploading(false);
    setProgress(null);
    fileRef.current.value='';
    onComplete();
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'.5rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>📥 Import Fatture</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>
            {aiEnabled?'AI analizza e propone registrazione':'XML: parsing locale · PDF: classificazione manuale'}
          </div>
        </div>
        <span className={'bdg '+(aiEnabled?'bdg-green':'bdg-orange')} style={{fontSize:'.65rem'}}>
          {aiEnabled?'🤖 AI':'⚡ Locale'}
        </span>
      </div>

      <div className="card">
        <div className="upload-zone" onClick={()=>!uploading&&fileRef.current.click()} style={{cursor:uploading?'wait':'pointer'}}>
          {uploading?(
            <>
              <div className="upload-zone-ico">⏳</div>
              <div className="upload-zone-t">Elaborazione {progress?.file}...</div>
              <div className="upload-zone-s">{progress?.current}/{progress?.total} file</div>
            </>
          ):(
            <>
              <div className="upload-zone-ico">📄</div>
              <div className="upload-zone-t">Carica fatture</div>
              <div className="upload-zone-s">PDF, XML · Trascina o clicca per selezionare</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" multiple accept=".pdf,.xml,.PDF,.XML" style={{display:'none'}} onChange={handleUpload}/>
      </div>

      <div className="alert alert-info" style={{marginTop:'1rem'}}>
        {aiEnabled?(
          <>ℹ️ L'AI analizzerà ogni fattura e proporrà la registrazione contabile.<br/>🟡 Proposta da confermare · 🟢 Confermata · 🔴 Richiede intervento</>
        ):(
          <>⚡ <strong>Modalità locale:</strong> Le fatture XML vengono analizzate senza AI (dati estratti dal file). I PDF vengono salvati per classificazione manuale. Vai nelle impostazioni per attivare l'AI.</>
        )}
      </div>
    </div>
  );
}

// ─── PIANO CONTI VIEW ────────────────────────────────────────
function PianoContiView({pianoConti,societaId,onImport,onRefresh}){
  const [search,setSearch]=useState('');
  const [sel,setSel]=useState(new Set());
  const [open,setOpen]=useState(new Set()); // nodi espansi
  const [deleting,setDeleting]=useState(false);
  const [editConto,setEditConto]=useState(null); // {id, codice, descrizione, ...}

  // Costruisce albero da array flat
  const tree=useMemo(()=>{
    const roots=[];
    const getParentCode=(codice)=>{
      if(!codice)return null;
      const parts=codice.trim().split(/\s+/);
      if(parts.length<=1)return null;
      return parts.slice(0,-1).join(' ');
    };
    const map={};
    const valid=pianoConti.filter(c=>c?.codice);
    // Prima passata: popola map con tutti i nodi reali
    for(const c of valid) map[c.codice.trim()]={...c,codice:c.codice.trim(),children:[]};
    // FIX: seconda passata — crea nodi placeholder per parent mancanti (nodi intermedi non importati)
    for(const c of valid){
      let par=getParentCode(c.codice.trim());
      while(par&&!map[par]){
        const parParts=par.split(' ');
        const lvl=parParts.length;
        map[par]={codice:par,descrizione:'['+par+']',livello:lvl,children:[],_placeholder:true};
        par=getParentCode(par);
      }
    }
    // Terza passata: collega figli ai parent
    for(const key of Object.keys(map)){
      const node=map[key];
      const par=getParentCode(key);
      if(par&&map[par]) map[par].children.push(node);
      else roots.push(node);
    }
    // Ordina figli per codice
    const sortChildren=(node)=>{node.children.sort((a,b)=>a.codice.localeCompare(b.codice,undefined,{numeric:true}));node.children.forEach(sortChildren);};
    roots.sort((a,b)=>a.codice.localeCompare(b.codice,undefined,{numeric:true}));
    roots.forEach(sortChildren);
    return roots;
  },[pianoConti]);

  const filtered=useMemo(()=>{
    if(!search) return tree;
    const s=search.toLowerCase();
    // Filtra flat e restituisce array senza struttura ad albero
    return pianoConti.filter(c=>(c.codice+' '+c.descrizione).toLowerCase().includes(s));
  },[search,tree,pianoConti]);

  const toggleOpen=(codice)=>setOpen(p=>{const n=new Set(p);n.has(codice)?n.delete(codice):n.add(codice);return n;});
  const toggleSel=(id)=>setSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSel(sel.size===pianoConti.length?new Set():new Set(pianoConti.map(c=>c.id)));

  const deleteSelected=async()=>{
    if(!sel.size||!confirm(`Eliminare ${sel.size} conti selezionati?`))return;
    setDeleting(true);
    const ids=[...sel];
    for(let i=0;i<ids.length;i+=100) await sb.from('piano_conti').update({attivo:false}).in('id',ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const deleteAll=async()=>{
    if(!confirm(`⚠️ Eliminare TUTTI i ${pianoConti.length} conti del piano? Questa azione non è reversibile.`))return;
    setDeleting(true);
    // Elimina in batch da 100
    const ids=pianoConti.map(c=>c.id);
    for(let i=0;i<ids.length;i+=100) await sb.from('piano_conti').update({attivo:false}).in('id',ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const expandAll=()=>{const s=new Set();pianoConti.forEach(c=>c.livello<4&&s.add(c.codice));setOpen(s);};
  // Conta figli diretti per un nodo (per decidere se espandere di default)
  const childCount=(codice)=>pianoConti.filter(c=>{
    const parts=c.codice.split(' ');
    const parentParts=codice.split(' ');
    return parts.length===parentParts.length+1&&c.codice.startsWith(codice+' ');
  }).length;
  const collapseAll=()=>setOpen(new Set());

  // Render ricorsivo nodo albero
  const [nodePage,setNodePage]=useState({}); // paginazione nodi grandi
  const renderNode=(node,depth=0)=>{
    const hasChildren=node.children?.length>0;
    const isOpen=open.has(node.codice);
    // Paginazione per nodi con molti figli (es. 2 03 08 con 955 figli)
    const PAGE_SIZE=200;
    const currentPage=nodePage[node.codice]||1;
    const visibleChildren=hasChildren&&isOpen
      ?node.children.slice(0,currentPage*PAGE_SIZE)
      :[];
    const hasMore=hasChildren&&isOpen&&node.children.length>currentPage*PAGE_SIZE;
    const isSelected=sel.has(node.id);
    const indent=depth*20;
    const lvlColors=['var(--gold)','var(--cy)','var(--tx)','var(--mu)'];
    const lvlSize=['1rem','0.88rem','0.82rem','0.78rem'];
    return(
      <div key={node.codice}>
        <div
          style={{
            display:'flex',alignItems:'center',gap:'.4rem',
            padding:`.3rem .65rem .3rem ${indent+8}px`,
            borderBottom:'1px solid rgba(33,40,58,.35)',
            background:isSelected?'rgba(200,164,94,.07)':'transparent',
            cursor:'pointer',
          }}
          onMouseEnter={e=>e.currentTarget.style.background=isSelected?'rgba(200,164,94,.1)':'rgba(255,255,255,.03)'}
          onMouseLeave={e=>e.currentTarget.style.background=isSelected?'rgba(200,164,94,.07)':'transparent'}
        >
          {/* Checkbox */}
          <div onClick={e=>{e.stopPropagation();toggleSel(node.id);}} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${isSelected?'var(--gold)':'var(--bd2)'}`,background:isSelected?'var(--gold)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center'}}>
            {isSelected&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
          </div>
          {/* Toggle espansione */}
          {hasChildren?(
            <div onClick={()=>toggleOpen(node.codice)} style={{width:16,height:16,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,color:'var(--mu)',fontSize:'.7rem',transition:'transform .15s',transform:isOpen?'rotate(90deg)':'rotate(0deg)'}}>▶</div>
          ):<div style={{width:16,flexShrink:0}}/>}
          {/* Codice + Descrizione */}
          <code style={{fontSize:'.7rem',color:lvlColors[depth]||'var(--mu)',minWidth:depth===3?90:depth===2?70:depth===1?50:30,flexShrink:0}}>{node.codice}</code>
          <span style={{flex:1,fontSize:lvlSize[depth]||'.75rem',fontWeight:depth<2?600:400,color:depth<2?'var(--tx)':'var(--mu)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{node.descrizione}</span>
          {/* Flags */}
          <div style={{display:'flex',gap:'.2rem',flexShrink:0}}>
            {node.is_cliente&&<span className="bdg bdg-green" style={{fontSize:'.5rem',padding:'1px 4px'}}>C</span>}
            {node.is_fornitore&&<span className="bdg bdg-gold" style={{fontSize:'.5rem',padding:'1px 4px'}}>F</span>}
            {node.is_banca&&<span className="bdg bdg-blue" style={{fontSize:'.5rem',padding:'1px 4px'}}>B</span>}
          </div>
          {/* Matita edit */}
          <div onClick={e=>{e.stopPropagation();setEditConto(node);}} style={{width:22,height:22,display:'flex',alignItems:'center',justifyContent:'center',borderRadius:5,color:'var(--mu)',fontSize:'.75rem',cursor:'pointer',flexShrink:0}}
            onMouseEnter={e=>{e.currentTarget.style.background='rgba(200,164,94,.15)';e.currentTarget.style.color='var(--gold)';}}
            onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--mu)';}}>
            ✏️
          </div>
        </div>
        {isOpen&&hasChildren&&visibleChildren.map(child=>renderNode(child,depth+1))}
        {hasMore&&(
          <div onClick={e=>{e.stopPropagation();setNodePage(p=>({...p,[node.codice]:(p[node.codice]||1)+1}));}}
            style={{padding:'.4rem 1rem',cursor:'pointer',color:'var(--cy)',fontSize:'.75rem',background:'rgba(78,142,247,.05)',borderBottom:'1px solid var(--bd)'}}>
            ⬇ Mostra altri {Math.min(PAGE_SIZE, node.children.length-currentPage*PAGE_SIZE)} di {node.children.length-currentPage*PAGE_SIZE} rimasti...
          </div>
        )}
      </div>
    );
  };

  // Render flat per ricerca
  const renderFlat=(items)=>items.map(c=>{
    const depth=c.livello-1;
    const lvlColors=['var(--gold)','var(--cy)','var(--tx)','var(--mu)'];
    return(
      <div key={c.codice} style={{display:'flex',alignItems:'center',gap:'.4rem',padding:'.3rem .65rem',borderBottom:'1px solid rgba(33,40,58,.35)'}}>
        <div onClick={()=>toggleSel(c.id)} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel.has(c.id)?'var(--gold)':'var(--bd2)'}`,background:sel.has(c.id)?'var(--gold)':'transparent',flexShrink:0,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer'}}>
          {sel.has(c.id)&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
        </div>
        <code style={{fontSize:'.7rem',color:lvlColors[depth]||'var(--mu)',minWidth:90,flexShrink:0}}>{c.codice}</code>
        <span style={{flex:1,fontSize:'.8rem',color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.descrizione}</span>
        <div onClick={()=>setEditConto(c)} style={{padding:'.15rem .35rem',borderRadius:5,color:'var(--mu)',fontSize:'.75rem',cursor:'pointer'}}
          onMouseEnter={e=>{e.currentTarget.style.color='var(--gold)';}}
          onMouseLeave={e=>{e.currentTarget.style.color='var(--mu)';}}>✏️</div>
      </div>
    );
  });

  return(
    <div>
      {editConto&&<ModalEditConto conto={editConto} onSave={async(updates)=>{await sb.from('piano_conti').update(updates).eq('id',editConto.id);setEditConto(null);onRefresh();}} onClose={()=>setEditConto(null)}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🗂️ Piano dei Conti</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{pianoConti.length} conti · <span style={{cursor:'pointer',color:'var(--cy)'}} onClick={expandAll}>espandi tutto</span> · <span style={{cursor:'pointer',color:'var(--cy)'}} onClick={collapseAll}>collassa tutto</span></div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          {sel.size>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteSelected}>{deleting?'⏳':'🗑'} Elimina ({sel.size})</button>}
          <button className="btn" onClick={onImport}>📤 Import PDF</button>
          {pianoConti.length>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteAll}>{deleting?'⏳':'🗑'} Elimina tutto ({pianoConti.length})</button>}
        </div>
      </div>

      <input placeholder="🔍 Cerca conto per codice o descrizione..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'1rem',width:'100%'}}/>

      {pianoConti.length===0?(
        <div className="empty"><div className="empty-ico">🗂️</div><div className="empty-t">Nessun conto</div><div className="empty-s">Importa il piano dei conti da PDF</div></div>
      ):(
        <div className="card" style={{padding:0,maxHeight:'calc(100vh - 280px)',overflow:'auto'}}>
          {search
            ? renderFlat(filtered)
            : tree.map(node=>renderNode(node,0))
          }
        </div>
      )}
    </div>
  );
}

// ─── MODAL EDIT CONTO ────────────────────────────────────────
function ModalEditConto({conto,onSave,onClose}){
  const [form,setForm]=useState({
    descrizione:conto.descrizione||'',
    tipo:conto.tipo||'patrimoniale',
    natura:conto.natura||'',
    is_cliente:conto.is_cliente||false,
    is_fornitore:conto.is_fornitore||false,
    is_banca:conto.is_banca||false,
    is_cassa:conto.is_cassa||false,
    is_professionista:conto.is_professionista||false,
    note:conto.note||'',
  });
  const [saving,setSaving]=useState(false);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await onSave(form);setSaving(false);};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">✏️ Modifica Conto</div><div className="modal-sub"><code style={{fontSize:'.8rem',color:'var(--gold)'}}>{conto.codice}</code></div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
            <div className="fg"><label>Tipo</label><select value={form.tipo} onChange={e=>up('tipo',e.target.value)}><option value="patrimoniale">Patrimoniale</option><option value="economico">Economico</option><option value="ordine">D'ordine</option></select></div>
            <div className="fg"><label>Natura</label><select value={form.natura} onChange={e=>up('natura',e.target.value)}><option value="attivo">Attivo</option><option value="passivo">Passivo</option><option value="ricavo">Ricavo</option><option value="costo">Costo</option><option value="ordine">Ordine</option></select></div>
            <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)} placeholder="Note opzionali"/></div>
          </div>
          <div style={{marginTop:'1rem'}}>
            <div style={{fontSize:'.72rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',marginBottom:'.5rem'}}>Tipo anagrafica</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem'}}>
              {[['is_cliente','👤 Cliente'],['is_fornitore','🏭 Fornitore'],['is_banca','🏦 Banca/C/C'],['is_cassa','💵 Cassa'],['is_professionista','👔 Professionista']].map(([k,l])=>(
                <div key={k} onClick={()=>up(k,!form[k])} style={{padding:'.35rem .75rem',borderRadius:20,border:`1.5px solid ${form[k]?'var(--gold)':'var(--bd)'}`,background:form[k]?'rgba(200,164,94,.12)':'transparent',cursor:'pointer',fontSize:'.78rem',color:form[k]?'var(--gold)':'var(--mu)',transition:'all .15s'}}>{l}</div>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={saving||!form.descrizione} onClick={save}>{saving?'⏳ Salvo...':'💾 Salva'}</button></div>
      </div>
    </div>
  );
}

// ─── CAUSALI VIEW ────────────────────────────────────────────
function CausaliView({causali,tipo,societaId,onImport,onRefresh}){
  const [sel,setSel]=useState(new Set());
  const [deleting,setDeleting]=useState(false);
  const [editCausale,setEditCausale]=useState(null);

  const toggleSel=(id)=>setSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSel(sel.size===causali.length?new Set():new Set(causali.map(c=>c.id)));

  const deleteSelected=async()=>{
    if(!sel.size||!confirm(`Eliminare ${sel.size} causali selezionate?`))return;
    setDeleting(true);
    const table=tipo==='iva'?'causali_iva':'causali_contabili';
    const ids=[...sel];
    for(let i=0;i<ids.length;i+=100) await sb.from(table).update({attivo:false}).in('id',ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const deleteAll=async()=>{
    const label=tipo==='iva'?'causali IVA':'causali contabili';
    if(!confirm(`⚠️ Eliminare TUTTE le ${causali.length} ${label}? Questa azione non è reversibile.`))return;
    setDeleting(true);
    const table=tipo==='iva'?'causali_iva':'causali_contabili';
    const ids=causali.map(c=>c.id);
    for(let i=0;i<ids.length;i+=100) await sb.from(table).update({attivo:false}).in('id',ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  return(
    <div>
      {editCausale&&<ModalEditCausale causale={editCausale} tipo={tipo} onSave={async(updates)=>{const table=tipo==='iva'?'causali_iva':'causali_contabili';await sb.from(table).update(updates).eq('id',editCausale.id);setEditCausale(null);onRefresh();}} onClose={()=>setEditCausale(null)}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>{tipo==='contabili'?'📋 Causali Contabili':'💧 Causali IVA'}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{causali.length} causali configurate</div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          {sel.size>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteSelected}>{deleting?'⏳':'🗑'} Elimina ({sel.size})</button>}
          <button className="btn" onClick={onImport}>📤 Import PDF</button>
          {causali.length>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteAll}>{deleting?'⏳':'🗑'} Elimina tutto ({causali.length})</button>}
        </div>
      </div>

      {causali.length===0?(
        <div className="empty"><div className="empty-ico">{tipo==='contabili'?'📋':'💧'}</div><div className="empty-t">Nessuna causale</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr>
              <th style={{width:32}}>
                <div onClick={toggleAll} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel.size===causali.length?'var(--gold)':'var(--bd2)'}`,background:sel.size===causali.length?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                  {sel.size===causali.length&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
                </div>
              </th>
              <th>Codice</th>
              <th>Descrizione</th>
              {tipo==='iva'&&<th>Aliquota</th>}
              {tipo==='iva'&&<th>Tipo</th>}
              {tipo==='contabili'&&<th>Tipo</th>}
              <th style={{width:40}}></th>
            </tr></thead>
            <tbody>{causali.map(c=>(
              <tr key={c.id} style={sel.has(c.id)?{background:'rgba(200,164,94,.06)'}:{}}>
                <td>
                  <div onClick={()=>toggleSel(c.id)} style={{width:14,height:14,borderRadius:3,border:`1.5px solid ${sel.has(c.id)?'var(--gold)':'var(--bd2)'}`,background:sel.has(c.id)?'var(--gold)':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
                    {sel.has(c.id)&&<span style={{color:'#0d1117',fontSize:'.5rem',fontWeight:900}}>✓</span>}
                  </div>
                </td>
                <td><code style={{fontSize:'.8rem'}}>{c.codice}</code></td>
                <td style={{fontSize:'.82rem'}}>{c.descrizione}</td>
                {tipo==='iva'&&<td><span className="bdg bdg-blue">{c.aliquota}%</span></td>}
                {tipo==='iva'&&<td><span style={{fontSize:'.72rem',color:'var(--mu)'}}>{c.tipo}</span></td>}
                {tipo==='contabili'&&<td style={{fontSize:'.75rem',color:'var(--mu)'}}>{c.tipo}</td>}
                <td>
                  <button className="btn-icon" style={{fontSize:'.75rem'}} onClick={()=>setEditCausale(c)}>✏️</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MODAL EDIT CAUSALE ──────────────────────────────────────
function ModalEditCausale({causale,tipo,onSave,onClose}){
  const isIva=tipo==='iva';
  const [form,setForm]=useState(
    isIva?{
      codice:causale.codice||'',
      descrizione:causale.descrizione||'',
      aliquota:causale.aliquota??0,
      tipo:causale.tipo||'imponibile',
      regime:causale.regime||'normale',
      detraibile:causale.detraibile??true,
      percentuale_detraibilita:causale.percentuale_detraibilita??100,
      include_liquidazione:causale.include_liquidazione??true,
      note:causale.note||'',
    }:{
      codice:causale.codice||'',
      descrizione:causale.descrizione||'',
      tipo:causale.tipo||'',
      note:causale.note||'',
    }
  );
  const [saving,setSaving]=useState(false);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await onSave(form);setSaving(false);};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:480}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">✏️ {isIva?'Causale IVA':'Causale Contabile'}</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg"><label>Codice</label><input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} style={{fontFamily:'monospace'}}/></div>
            <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
            {isIva&&<>
              <div className="fg"><label>Aliquota %</label><input type="number" value={form.aliquota} onChange={e=>up('aliquota',parseFloat(e.target.value)||0)} min={0} max={100}/></div>
              <div className="fg"><label>Tipo IVA</label><select value={form.tipo} onChange={e=>up('tipo',e.target.value)}><option value="imponibile">Imponibile</option><option value="non_imponibile">Non imponibile</option><option value="esente">Esente</option><option value="escluso">Escluso</option></select></div>
              <div className="fg"><label>Regime</label><select value={form.regime} onChange={e=>up('regime',e.target.value)}><option value="normale">Normale</option><option value="acquisto_cee">Acquisto CEE/Intracom</option><option value="reverse_charge">Reverse Charge</option><option value="split_payment">Split Payment</option></select></div>
              <div className="fg"><label>Detraibilità %</label><input type="number" value={form.percentuale_detraibilita} onChange={e=>up('percentuale_detraibilita',parseFloat(e.target.value)||0)} min={0} max={100}/></div>
            </>}
            {!isIva&&<div className="fg"><label>Tipo</label><input value={form.tipo} onChange={e=>up('tipo',e.target.value)} placeholder="es. acquisto, vendita..."/></div>}
            <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
          </div>
          {isIva&&<div className="tgl-row" style={{marginTop:'.75rem'}} onClick={()=>up('include_liquidazione',!form.include_liquidazione)}>
            <div className={'tgl'+(form.include_liquidazione?' on':'')}/>
            <span className="tgl-lbl">Includi in liquidazione IVA</span>
          </div>}
        </div>
        <div className="modal-foot"><button className="btn-sec" onClick={onClose}>Annulla</button><button className="btn" disabled={saving||!form.descrizione} onClick={save}>{saving?'⏳ Salvo...':'💾 Salva'}</button></div>
      </div>
    </div>
  );
}

// ─── PRIMA NOTA VIEW ─────────────────────────────────────────
function PrimaNotaView({scritture,pianoConti,causali,causaliIva,clienti,societaId,onRefresh}){
  const [modalNuova,setModalNuova]=useState(false);
  const [filtroCliente,setFiltroCliente]=useState('');
  const [searchTerm,setSearchTerm]=useState('');
  const [formData,setFormData]=useState({
    data_registrazione:new Date().toISOString().split('T')[0],
    data_documento:'',
    numero_documento:'',
    cliente_id:'',
    causale_codice:'',
    causale_iva_codice:'',
    descrizione:'',
    totale_dare:0,
    totale_avere:0,
    conto_dare_id:'',
    conto_avere_id:'',
    imponibile:0,
    imposta:0
  });

  const getClienteNome=(id)=>{
    const c=clienti.find(x=>x.id===id);
    if(!c)return '—';
    return c.ragione_sociale||`${c.nome||''} ${c.cognome||''}`.trim();
  };

  const getClienteCodice=(id)=>{
    const c=clienti.find(x=>x.id===id);
    return c?.codice_cliente||'—';
  };

  const filtered=scritture.filter(s=>{
    if(filtroCliente&&s.cliente_id!==filtroCliente)return false;
    if(searchTerm){
      const q=searchTerm.toLowerCase();
      return (s.descrizione||'').toLowerCase().includes(q)||(s.numero_documento||'').toLowerCase().includes(q)||(s.cliente_fornitore_nome||'').toLowerCase().includes(q);
    }
    return true;
  });

  const onClienteChange=(id)=>{
    const c=clienti.find(x=>x.id===id);
    setFormData(p=>({
      ...p,
      cliente_id:id,
      descrizione:c?`${c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}`:''
    }));
  };

  const calcolaIVA=(imponibile,aliquota)=>{
    const imp=parseFloat(imponibile||0);
    const iva=imp*(aliquota||22)/100;
    return{imposta:iva.toFixed(2),totale:(imp+iva).toFixed(2)};
  };

  const onImponibileChange=(val)=>{
    const causIva=causaliIva.find(c=>c.codice===formData.causale_iva_codice);
    const{imposta,totale}=calcolaIVA(val,causIva?.aliquota||22);
    setFormData(p=>({...p,imponibile:val,imposta,totale_dare:totale,totale_avere:totale}));
  };

  const onCausaleIvaChange=(codice)=>{
    const causIva=causaliIva.find(c=>c.codice===codice);
    const{imposta,totale}=calcolaIVA(formData.imponibile,causIva?.aliquota||22);
    setFormData(p=>({...p,causale_iva_codice:codice,imposta,totale_dare:totale,totale_avere:totale}));
  };

  const salvaScrittura=async()=>{
    const cliente=clienti.find(c=>c.id===formData.cliente_id);
    const nextNum=scritture.length>0?Math.max(...scritture.map(s=>s.numero_registrazione||0))+1:1;
    
    const record={
      societa_id:societaId,
      numero_registrazione:nextNum,
      data_registrazione:formData.data_registrazione,
      data_documento:formData.data_documento||formData.data_registrazione,
      numero_documento:formData.numero_documento,
      cliente_id:formData.cliente_id||null,
      cliente_fornitore_nome:cliente?(cliente.ragione_sociale||`${cliente.nome} ${cliente.cognome||''}`.trim()):formData.descrizione,
      causale_codice:formData.causale_codice,
      causale_iva_codice:formData.causale_iva_codice,
      descrizione:formData.descrizione,
      totale_dare:parseFloat(formData.totale_dare||0),
      totale_avere:parseFloat(formData.totale_avere||0),
      imponibile:parseFloat(formData.imponibile||0),
      imposta:parseFloat(formData.imposta||0),
      stato:'provvisoria'
    };
    
    const{error}=await sb.from('prima_nota').insert([record]);
    if(error){
      alert('Errore: '+error.message);
      return;
    }
    setModalNuova(false);
    setFormData({data_registrazione:new Date().toISOString().split('T')[0],data_documento:'',numero_documento:'',cliente_id:'',causale_codice:'',causale_iva_codice:'',descrizione:'',totale_dare:0,totale_avere:0,conto_dare_id:'',conto_avere_id:'',imponibile:0,imposta:0});
    onRefresh();
  };

  return(
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>📝 Prima Nota</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{scritture.length} scritture registrate</div>
        </div>
        <button className="btn" onClick={()=>setModalNuova(true)}>+ Nuova Scrittura</button>
      </div>

      {/* Filtri */}
      <div className="card" style={{marginBottom:'1rem'}}>
        <div style={{display:'flex',gap:'1rem',alignItems:'flex-end',flexWrap:'wrap'}}>
          <div className="fg" style={{flex:1,minWidth:200}}>
            <label>Cerca</label>
            <input placeholder="🔍 N° documento, descrizione..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)}/>
          </div>
          <div className="fg" style={{minWidth:200}}>
            <label>Filtra per Cliente</label>
            <select value={filtroCliente} onChange={e=>setFiltroCliente(e.target.value)}>
              <option value="">Tutti i clienti</option>
              {clienti.filter(c=>c.codice_cliente).map(c=><option key={c.id} value={c.id}>[{c.codice_cliente}] {c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}</option>)}
            </select>
          </div>
        </div>
      </div>

      {filtered.length===0?(
        <div className="empty"><div className="empty-ico">📝</div><div className="empty-t">Nessuna scrittura</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>N°</th><th>Data</th><th>Cod.Cli.</th><th>Cliente/Fornitore</th><th>Causale</th><th>Descrizione</th><th style={{textAlign:'right'}}>Dare</th><th style={{textAlign:'right'}}>Avere</th><th>Stato</th></tr></thead>
            <tbody>{filtered.map(s=>(
              <tr key={s.id}>
                <td style={{fontWeight:600}}>{s.numero_registrazione}</td>
                <td style={{fontSize:'.78rem'}}>{fmtDate(s.data_registrazione)}</td>
                <td><span style={{fontFamily:'monospace',fontWeight:700,color:'var(--gold)',background:'rgba(200,164,94,.1)',padding:'.1rem .3rem',borderRadius:4,fontSize:'.7rem'}}>{getClienteCodice(s.cliente_id)}</span></td>
                <td style={{maxWidth:150,overflow:'hidden',textOverflow:'ellipsis'}}>{s.cliente_fornitore_nome||getClienteNome(s.cliente_id)}</td>
                <td><span className="bdg bdg-blue">{s.causale_codice||'—'}</span></td>
                <td style={{maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',fontSize:'.8rem'}}>{s.descrizione}</td>
                <td style={{fontWeight:600,color:'var(--gr)',textAlign:'right'}}>{fmt(s.totale_dare)}</td>
                <td style={{fontWeight:600,color:'var(--rd)',textAlign:'right'}}>{fmt(s.totale_avere)}</td>
                <td><span className={'bdg '+(s.stato==='definitiva'?'bdg-green':'bdg-gold')}>{s.stato}</span></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {/* Modal Nuova Scrittura */}
      {modalNuova&&(
        <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&setModalNuova(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:650}}>
            <div className="modal-hdr">
              <div className="modal-drag"/>
              <div className="modal-title">📝 Nuova Scrittura Prima Nota</div>
              <button className="modal-close" onClick={()=>setModalNuova(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid">
                <div className="fg">
                  <label>Data Registrazione *</label>
                  <input type="date" value={formData.data_registrazione} onChange={e=>setFormData(p=>({...p,data_registrazione:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Data Documento</label>
                  <input type="date" value={formData.data_documento} onChange={e=>setFormData(p=>({...p,data_documento:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>N° Documento</label>
                  <input value={formData.numero_documento} onChange={e=>setFormData(p=>({...p,numero_documento:e.target.value}))} placeholder="Es. FT-001/2025"/>
                </div>
                <div className="fg">
                  <label>Causale Contabile</label>
                  <select value={formData.causale_codice} onChange={e=>setFormData(p=>({...p,causale_codice:e.target.value}))}>
                    <option value="">-- Seleziona --</option>
                    {causali.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione}</option>)}
                  </select>
                </div>
                <div className="fg full" style={{background:'rgba(200,164,94,.08)',padding:'.75rem',borderRadius:8,border:'1px solid rgba(200,164,94,.2)'}}>
                  <label style={{color:'var(--gold)',fontWeight:600}}>👤 Cliente</label>
                  <select value={formData.cliente_id} onChange={e=>onClienteChange(e.target.value)} style={{marginTop:'.35rem'}}>
                    <option value="">-- Seleziona Cliente --</option>
                    {clienti.map(c=><option key={c.id} value={c.id}>{c.codice_cliente?`[${c.codice_cliente}] `:''}{c.ragione_sociale||`${c.nome} ${c.cognome||''}`.trim()}</option>)}
                  </select>
                  <div style={{fontSize:'.7rem',color:'var(--mu)',marginTop:'.25rem'}}>Il codice cliente collegherà questa scrittura all'anagrafica</div>
                </div>
                <div className="fg full">
                  <label>Descrizione</label>
                  <input value={formData.descrizione} onChange={e=>setFormData(p=>({...p,descrizione:e.target.value}))} placeholder="Descrizione operazione"/>
                </div>
                <div className="fg">
                  <label>Imponibile €</label>
                  <input type="number" step="0.01" value={formData.imponibile} onChange={e=>onImponibileChange(e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Causale IVA</label>
                  <select value={formData.causale_iva_codice} onChange={e=>onCausaleIvaChange(e.target.value)}>
                    <option value="">-- Seleziona --</option>
                    {causaliIva.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
                  </select>
                </div>
                <div className="fg">
                  <label>IVA €</label>
                  <input type="number" step="0.01" value={formData.imposta} readOnly style={{background:'var(--bg)'}}/>
                </div>
                <div className="fg">
                  <label>Totale €</label>
                  <input type="number" step="0.01" value={formData.totale_dare} readOnly style={{background:'var(--bg)',fontWeight:700,color:'var(--gold)'}}/>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn-sec" onClick={()=>setModalNuova(false)}>Annulla</button>
              <button className="btn" onClick={salvaScrittura}>💾 Registra</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── REGISTRATE VIEW ─────────────────────────────────────────
function RegistrateView({documenti}){
  return(
    <div>
      <div style={{fontSize:'1.1rem',fontWeight:700,marginBottom:'.25rem'}}>✓ Documenti Registrati</div>
      <div style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'1rem'}}>{documenti.length} documenti registrati in contabilità</div>

      {documenti.length===0?(
        <div className="empty"><div className="empty-ico">✓</div><div className="empty-t">Nessun documento registrato</div></div>
      ):(
        <div className="card" style={{padding:0,overflow:'hidden'}}>
          <table className="tbl">
            <thead><tr><th>Tipo</th><th>N° Doc</th><th>Data</th><th>Soggetto</th><th>Totale</th><th>Registrato</th></tr></thead>
            <tbody>{documenti.map(d=>(
              <tr key={d.id}>
                <td><span className={'bdg '+(d.tipo_documento?.includes('attiva')?'bdg-green':'bdg-gold')}>{d.tipo_documento?.includes('attiva')?'📤':'📥'}</span></td>
                <td style={{fontWeight:600}}>{d.numero_documento}</td>
                <td style={{fontSize:'.78rem'}}>{fmtDate(d.data_documento)}</td>
                <td>{d.soggetto_denominazione}</td>
                <td style={{fontWeight:600,color:'var(--gld2)'}}>{fmt(d.totale)}</td>
                <td style={{fontSize:'.72rem',color:'var(--mu)'}}>{fmtDate(d.registered_at?.split('T')[0])}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── MODAL BULK EDIT ─────────────────────────────────────────
function ModalBulkEdit({docs,pianoConti,causaliIva,onSave,onClose}){
  const [contoId,setContoId]=useState('');
  const [causaleIva,setCausaleIva]=useState('');
  const [confirmAll,setConfirmAll]=useState(true);

  const handleSave=()=>{
    const updates={};
    if(contoId)updates.conto_id=contoId;
    if(causaleIva)updates.causale_iva=causaleIva;
    if(confirmAll)updates.validation_status='confirmed';
    onSave(updates);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">✏️ Modifica Massiva</div>
          <div className="modal-sub">{docs.length} documenti selezionati</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="fg" style={{marginBottom:'.75rem'}}>
            <label>Conto costo/ricavo</label>
            <select value={contoId} onChange={e=>setContoId(e.target.value)}>
              <option value="">— Non modificare —</option>
              {pianoConti.filter(c=>c.livello>=3).map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione}</option>)}
            </select>
          </div>
          <div className="fg" style={{marginBottom:'.75rem'}}>
            <label>Causale IVA</label>
            <select value={causaleIva} onChange={e=>setCausaleIva(e.target.value)}>
              <option value="">— Non modificare —</option>
              {causaliIva.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
            </select>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'.5rem',marginTop:'1rem'}}>
            <input type="checkbox" id="confirmAll" checked={confirmAll} onChange={e=>setConfirmAll(e.target.checked)}/>
            <label htmlFor="confirmAll" style={{fontSize:'.85rem',cursor:'pointer'}}>Conferma tutti dopo la modifica</label>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" onClick={handleSave}>Applica a {docs.length} documenti</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL EDIT DOC (Split Screen) ───────────────────────────
function ModalEditDoc({doc,pianoConti,causaliContabili,causaliIva,onSave,onClose}){
  const [contoId,setContoId]=useState(doc.conto_id||'');
  const [causaleIva,setCausaleIva]=useState('');
  const [splitView,setSplitView]=useState('split');
  const [saving,setSaving]=useState(false);
  const [contoSearch,setContoSearch]=useState('');
  const [showContoDropdown,setShowContoDropdown]=useState(false);
  const [xmlPreview,setXmlPreview]=useState(null);
  const [aiSuggestion,setAiSuggestion]=useState(null);
  const ai=useAIStatus();

  // If XML, fetch and parse for nice preview (foglio di cortesia)
  useEffect(()=>{
    const isXML=doc.mime_type?.includes('xml')||doc.filename?.endsWith('.xml');
    if(!isXML)return;
    
    // Get URL: from file_url or generate from file_path
    let url=doc.file_url;
    if(!url&&doc.file_path){
      const{data:u}=sb.storage.from('documenti').getPublicUrl(doc.file_path);
      url=u?.publicUrl;
    }
    if(!url)return;
    
    fetch(url).then(r=>r.text()).then(text=>{
      try{setXmlPreview(parseXMLFattura(text));}catch(e){console.error('XML parse error:',e);}
    }).catch(e=>console.error('XML fetch error:',e));
  },[doc.file_url,doc.file_path,doc.filename]);

  // AI suggestion for conto on mount
  useEffect(()=>{
    (async()=>{
      const{data:sArr}=await sb.from('impostazioni_studio').select('valore').eq('chiave','ai_enabled');
      const s=Array.isArray(sArr)?sArr[0]:sArr;
      if(s?.valore==='false')return;
      const isPassiva=doc.tipo_documento?.includes('passiva');
      // Match by P.IVA in piano conti
      let best=null;
      if(doc.soggetto_piva){best=pianoConti.find(c=>c.anagrafica_piva===doc.soggetto_piva&&c.livello>=3);}
      // Fallback: generic cost/revenue
      if(!best){
        const prefix=isPassiva?'4':'3';
        best=pianoConti.find(c=>c.codice?.startsWith(prefix)&&c.livello>=3&&/servi|consul|acquist|merce|general/i.test(c.descrizione||''));
      }
      if(best){setAiSuggestion(best);if(!contoId)setContoId(best.id);}
    })();
  },[]);

  const handleConfirm=async()=>{
    setSaving(true);
    await sb.from('documenti_contabilita').update({
      conto_id:contoId||null,validation_status:'confirmed',validated_at:new Date().toISOString()
    }).eq('id',doc.id);
    onSave();onClose();
  };

  const filteredConti=pianoConti.filter(c=>{
    if(c.livello<3)return false;
    if(!contoSearch)return true;
    const s=contoSearch.toLowerCase().trim();
    // Search by description (partial match anywhere: "telef" finds "SPESE TELEFONICHE")
    if((c.descrizione||'').toLowerCase().includes(s))return true;
    // Search by code: "4.01" or "4 01" or "401" all match "4 01 xx"
    const codeNorm=(c.codice||'').replace(/\s+/g,'');
    const searchNorm=s.replace(/[.\s]+/g,'');
    if(codeNorm.startsWith(searchNorm))return true;
    // Also match with dots: "4.01.03" matches "4 01 03"
    const codeDot=(c.codice||'').replace(/\s+/g,'.');
    if(codeDot.startsWith(s.replace(/\s+/g,'.')))return true;
    return false;
  }).slice(0,80);
  const selectedConto=pianoConti.find(c=>c.id===contoId);

  const XMLPreview=({data})=>(
    <div style={{padding:'1.2rem',fontSize:'.82rem',lineHeight:'1.7',background:'var(--s1)',height:'100%',overflow:'auto'}}>
      <div style={{background:'var(--s2)',borderRadius:10,padding:'1rem 1.2rem',marginBottom:'1rem',border:'1px solid var(--bd)'}}>
        <div style={{fontSize:'1rem',fontWeight:700,color:'var(--gold)',marginBottom:'.5rem'}}>Fattura {data.tipo==='TD01'?'Ordinaria':data.tipo==='TD04'?'Nota di Credito':data.tipo}</div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.3rem'}}>
          <div><span style={{color:'var(--mu)'}}>N\u00b0:</span> <strong>{data.numero}</strong></div>
          <div><span style={{color:'var(--mu)'}}>Data:</span> <strong>{data.data}</strong></div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'1rem',marginBottom:'1rem'}}>
        <div style={{background:'var(--s2)',borderRadius:8,padding:'.8rem',border:'1px solid var(--bd)'}}>
          <div style={{fontSize:'.7rem',color:'var(--mu)',fontWeight:700,marginBottom:'.3rem'}}>CEDENTE / PRESTATORE</div>
          <div style={{fontWeight:600}}>{data.nome_cedente}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>P.IVA: {data.piva_cedente}</div>
        </div>
        <div style={{background:'var(--s2)',borderRadius:8,padding:'.8rem',border:'1px solid var(--bd)'}}>
          <div style={{fontSize:'.7rem',color:'var(--mu)',fontWeight:700,marginBottom:'.3rem'}}>CESSIONARIO / COMMITTENTE</div>
          <div style={{fontWeight:600}}>{data.nome_cessionario}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>P.IVA: {data.piva_cessionario}</div>
        </div>
      </div>
      {data.lines?.length>0&&(
        <div style={{marginBottom:'1rem'}}>
          <table style={{width:'100%',fontSize:'.78rem',borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'1px solid var(--bd)'}}>
              <th style={{textAlign:'left',padding:'.3rem'}}>Descrizione</th>
              <th style={{textAlign:'right',padding:'.3rem'}}>Qta</th>
              <th style={{textAlign:'right',padding:'.3rem'}}>Prezzo</th>
              <th style={{textAlign:'right',padding:'.3rem'}}>IVA%</th>
              <th style={{textAlign:'right',padding:'.3rem'}}>Totale</th>
            </tr></thead>
            <tbody>{data.lines.map((l,i)=>(
              <tr key={i} style={{borderBottom:'1px solid var(--s2)'}}>
                <td style={{padding:'.3rem'}}>{l.desc}</td>
                <td style={{textAlign:'right',padding:'.3rem'}}>{l.qty}</td>
                <td style={{textAlign:'right',padding:'.3rem'}}>{l.prezzo?.toFixed(2)}</td>
                <td style={{textAlign:'right',padding:'.3rem'}}>{l.iva}%</td>
                <td style={{textAlign:'right',padding:'.3rem',fontWeight:600}}>{l.totale?.toFixed(2)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div style={{background:'rgba(200,164,94,.1)',border:'1px solid rgba(200,164,94,.3)',borderRadius:8,padding:'.8rem',textAlign:'right'}}>
        <div style={{fontSize:'.78rem'}}>Imponibile: <strong>{data.imponibile?.toFixed(2)}</strong></div>
        <div style={{fontSize:'1.2rem',fontWeight:700,color:'var(--gold)'}}>Totale: {data.totale_doc?.toFixed(2)||data.imponibile?.toFixed(2)}</div>
      </div>
    </div>
  );

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:1200,width:'95%',maxHeight:'95vh'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">{doc.filename}</div>
          <div className="modal-sub">{doc.soggetto_denominazione} {doc.totale?fmt(doc.totale):''}</div>
          <div style={{display:'flex',gap:'.3rem',marginLeft:'auto',marginRight:'1rem'}}>
            <button className={'btn-sec'+(splitView==='split'?' active':'')} style={{padding:'.25rem .5rem',fontSize:'.7rem'}} onClick={()=>setSplitView('split')}>Split</button>
            <button className={'btn-sec'+(splitView==='pdf'?' active':'')} style={{padding:'.25rem .5rem',fontSize:'.7rem'}} onClick={()=>setSplitView('pdf')}>Doc</button>
            <button className={'btn-sec'+(splitView==='form'?' active':'')} style={{padding:'.25rem .5rem',fontSize:'.7rem'}} onClick={()=>setSplitView('form')}>Form</button>
          </div>
          <button className="modal-close" onClick={onClose}>X</button>
        </div>
        <div className="modal-body" style={{padding:0}}>
          <div className={'split-container'+(splitView==='pdf'?' full-left':splitView==='form'?' full-right':'')}>
            {splitView!=='form'&&(
              <div className="split-pane">
                <div className="split-pane-header"><span style={{fontWeight:600,fontSize:'.85rem'}}>Documento originale</span></div>
                <div className="split-pane-content" style={{overflow:'auto'}}>
                  {xmlPreview?(<XMLPreview data={xmlPreview}/>
                  ):doc.file_url?(
                    <iframe src={doc.file_url} style={{width:'100%',height:'100%',border:'none'}}/>
                  ):(
                    <div style={{textAlign:'center',color:'var(--mu)',padding:'2rem'}}>
                      <div style={{fontSize:'3rem'}}>No preview</div>
                    </div>
                  )}
                </div>
              </div>
            )}
            {splitView!=='pdf'&&(
              <div className="split-pane">
                <div className="split-pane-header">
                  <span style={{fontWeight:600,fontSize:'.85rem'}}>Scrittura contabile</span>
                  <span className={'bdg status-'+doc.validation_status}>
                    {doc.validation_status==='pending'?'In attesa':doc.validation_status==='confirmed'?'Confermato':'Errore'}
                  </span>
                </div>
                <div className="split-pane-content">
                  <div style={{background:'var(--s2)',borderRadius:8,padding:'.75rem',marginBottom:'1rem'}}>
                    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.4rem',fontSize:'.8rem'}}>
                      <div><span style={{color:'var(--mu)'}}>Tipo:</span> <strong>{doc.tipo_documento}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>N Doc:</span> <strong>{doc.numero_documento}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>Data:</span> <strong>{fmtDate(doc.data_documento)}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>P.IVA:</span> <strong>{doc.soggetto_piva}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>Imponibile:</span> <strong>{fmt(doc.imponibile)}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>IVA:</span> <strong>{fmt(doc.iva)}</strong></div>
                      <div><span style={{color:'var(--mu)'}}>Totale:</span> <strong style={{color:'var(--gld2)',fontSize:'1.1rem'}}>{fmt(doc.totale)}</strong></div>
                    </div>
                  </div>
                  <div className="fg" style={{marginBottom:'.75rem',position:'relative'}}>
                    <label>Conto {doc.tipo_documento?.includes('attiva')?'Cliente':'Fornitore/Costo'}
                      {aiSuggestion&&<span style={{fontSize:'.65rem',color:'var(--gr)',marginLeft:'.4rem'}}>suggerito</span>}
                    </label>
                    <input
                      placeholder="Cerca conto per codice o descrizione..."
                      value={contoSearch||(selectedConto?selectedConto.codice+' - '+selectedConto.descrizione:'')}
                      onChange={e=>{setContoSearch(e.target.value);setShowContoDropdown(true);if(!e.target.value)setContoId('');}}
                      onFocus={()=>setShowContoDropdown(true)}
                      style={{width:'100%'}}
                    />
                    {showContoDropdown&&contoSearch&&(
                      <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:100,background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:8,maxHeight:250,overflow:'auto',boxShadow:'0 8px 24px rgba(0,0,0,.3)'}}>
                        {filteredConti.length===0?(
                          <div style={{padding:'.6rem',fontSize:'.78rem',color:'var(--mu)'}}>Nessun conto trovato</div>
                        ):filteredConti.map(c=>(
                          <div key={c.id} onClick={()=>{setContoId(c.id);setContoSearch('');setShowContoDropdown(false);}}
                            style={{padding:'.45rem .7rem',cursor:'pointer',fontSize:'.78rem',borderBottom:'1px solid var(--s2)'}}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(200,164,94,.1)'}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <code style={{color:'var(--gold)',fontSize:'.7rem'}}>{c.codice}</code> {c.descrizione}
                            {c.is_cliente&&<span className="bdg bdg-green" style={{marginLeft:'.3rem',fontSize:'.5rem'}}>C</span>}
                            {c.is_fornitore&&<span className="bdg bdg-gold" style={{marginLeft:'.3rem',fontSize:'.5rem'}}>F</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {selectedConto&&!contoSearch&&(
                      <div style={{fontSize:'.72rem',color:'var(--gr)',marginTop:'.2rem'}}>
                        {selectedConto.codice} - {selectedConto.descrizione}
                        {aiSuggestion?.id===selectedConto.id&&<span style={{marginLeft:'.3rem',color:'var(--mu)'}}>(suggerito)</span>}
                      </div>
                    )}
                  </div>
                  <div className="fg">
                    <label>Causale IVA</label>
                    <select value={causaleIva} onChange={e=>setCausaleIva(e.target.value)}>
                      <option value="">Seleziona...</option>
                      {causaliIva.map(c=><option key={c.id} value={c.codice}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
                    </select>
                  </div>
                  {doc.ai_confidence>0&&(
                    <div style={{marginTop:'1rem',fontSize:'.75rem',color:'var(--mu)'}}>
                      AI Confidence: <strong style={{color:doc.ai_confidence>0.7?'var(--gr)':'#fb923c'}}>{Math.round((doc.ai_confidence||0)*100)}%</strong>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" onClick={handleConfirm} disabled={saving}>{saving?'...':'Conferma e registra'}</button>
        </div>
      </div>
    </div>
  );
}


// ─── MODAL NUOVA SOCIETÀ ──────────────────────────────────────
function ModalNuovaSocieta({onSave,onClose}){
  const [mode,setMode]=useState('select'); // 'select' | 'create'
  const [clienti,setClienti]=useState([]);
  const [societa,setSocieta]=useState([]); // lista società esistenti per duplicazione
  const [searchTerm,setSearchTerm]=useState('');
  const [selectedCliente,setSelectedCliente]=useState(null);
  const [loading,setLoading]=useState(true);
  const [formData,setFormData]=useState({
    denominazione:'',partita_iva:'',codice_fiscale:'',
    indirizzo:'',cap:'',citta:'',provincia:'',
    email:'',pec:'',telefono:'',
    regime_contabile:'ordinario',tipo_liquidazione_iva:'trimestrale',attiva:true
  });
  const [saving,setSaving]=useState(false);
  // Duplicazione
  const [duplicaDa,setDuplicaDa]=useState(null); // società sorgente selezionata
  const [showDuplica,setShowDuplica]=useState(false);

  useEffect(()=>{
    Promise.all([
      sb.from('clienti').select('*').eq('attivo',true).order('ragione_sociale'),
      sb.from('societa').select('id,denominazione,codice').eq('attiva',true).order('denominazione'),
    ]).then(([{data:cl},{data:soc}])=>{
      setClienti(cl||[]);
      setSocieta(soc||[]);
      setLoading(false);
    });
  },[]);

  const clientiFiltrati=clienti.filter(c=>{
    const t=searchTerm.toLowerCase();
    return (c.ragione_sociale||'').toLowerCase().includes(t)||(c.nome||'').toLowerCase().includes(t)||(c.partita_iva||'').includes(t)||(c.codice_fiscale||'').toLowerCase().includes(t);
  });

  const genCodice=(denom)=>(denom||'SOC').replace(/[^A-Za-z0-9]/g,'').toUpperCase().substring(0,6)+Date.now().toString().slice(-4);

  // Duplica piano conti + causali dalla società sorgente
  const duplicaDati=async(newSocietaId,sourceSocietaId)=>{
    const[{data:pc},{data:cc},{data:ci}]=await Promise.all([
      sb.from('piano_conti').select('*').eq('societa_id',sourceSocietaId).eq('attivo',true),
      sb.from('causali_contabili').select('*').eq('societa_id',sourceSocietaId).eq('attivo',true),
      sb.from('causali_iva').select('*').eq('societa_id',sourceSocietaId).eq('attivo',true),
    ]);
    const strip=(arr)=>arr.map(({id,created_at,updated_at,...r})=>({...r,societa_id:newSocietaId}));
    const BATCH=500;
    for(const[table,data] of [['piano_conti',pc||[]],['causali_contabili',cc||[]],['causali_iva',ci||[]]]){
      for(let i=0;i<data.length;i+=BATCH){
        const{error}=await sb.from(table).insert(strip(data.slice(i,i+BATCH)));
        if(error)console.error(`Errore duplica ${table}:`,error);
      }
    }
  };

  const handleSelectCliente=async()=>{
    if(!selectedCliente){alert('Seleziona un cliente');return;}
    setSaving(true);
    const denom=selectedCliente.ragione_sociale||`${selectedCliente.nome||''} ${selectedCliente.cognome||''}`.trim();
    const societaData={codice:genCodice(denom),denominazione:denom,partita_iva:selectedCliente.partita_iva||'',codice_fiscale:selectedCliente.codice_fiscale||'',indirizzo:selectedCliente.indirizzo||'',citta:selectedCliente.comune||'',provincia:selectedCliente.provincia||'',regime_contabile:'ordinaria',attiva:true};
    const newSoc=await onSave(societaData);
    if(newSoc?.id&&duplicaDa) await duplicaDati(newSoc.id,duplicaDa);
    setSaving(false);
  };

  const handleSaveManual=async()=>{
    if(!formData.denominazione){alert('Inserisci denominazione');return;}
    setSaving(true);
    const datiDaSalvare={codice:genCodice(formData.denominazione),denominazione:formData.denominazione,partita_iva:formData.partita_iva||'',codice_fiscale:formData.codice_fiscale||'',indirizzo:formData.indirizzo||'',cap:formData.cap||'',citta:formData.citta||'',provincia:formData.provincia||'',regime_contabile:formData.regime_contabile||'ordinaria',attiva:true};
    const newSoc=await onSave(datiDaSalvare);
    if(newSoc?.id&&duplicaDa) await duplicaDati(newSoc.id,duplicaDa);
    setSaving(false);
  };

  // Sezione duplicazione (comune a entrambe le modalità)
  const renderDuplicaSection=()=>(
    <div style={{background:'rgba(200,164,94,.06)',border:'1px solid rgba(200,164,94,.25)',borderRadius:10,padding:'.85rem 1rem',marginTop:'1rem'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.5rem'}}>
        <div style={{fontSize:'.82rem',fontWeight:600,color:'var(--gold)'}}>📋 Duplica piano conti e causali</div>
        <div onClick={()=>{setShowDuplica(p=>!p);if(!showDuplica)setDuplicaDa(null);}} className={'tgl'+(showDuplica?' on':'')} style={{cursor:'pointer'}}/>
      </div>
      {showDuplica&&(
        societa.length===0?(
          <div style={{fontSize:'.78rem',color:'var(--mu)'}}>Nessuna società esistente da cui duplicare.</div>
        ):(
          <>
            <div style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'.5rem'}}>Seleziona la società da cui copiare Piano dei Conti, Causali Contabili e Causali IVA:</div>
            <select value={duplicaDa||''} onChange={e=>setDuplicaDa(e.target.value||null)} style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:7,color:'var(--tx)',padding:'.45rem .7rem',fontSize:'.82rem'}}>
              <option value="">— Seleziona società —</option>
              {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
            </select>
            {duplicaDa&&<div className="alert alert-info" style={{marginTop:'.5rem',padding:'.45rem .65rem',fontSize:'.72rem'}}>✓ Verranno duplicati piano conti e causali da <strong>{societa.find(s=>s.id===duplicaDa)?.denominazione}</strong></div>}
          </>
        )
      )}
    </div>
  );

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:650,maxHeight:'85vh',overflow:'auto'}}>
        <div className="modal-hdr"><div className="modal-drag"/><div className="modal-title">🏢 Nuova Società</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div style={{display:'flex',gap:'.5rem',marginBottom:'1rem'}}>
            <button className={mode==='select'?'btn':'btn-sec'} onClick={()=>setMode('select')} style={{flex:1}}>👥 Da Anagrafica Clienti</button>
            <button className={mode==='create'?'btn':'btn-sec'} onClick={()=>setMode('create')} style={{flex:1}}>➕ Crea Manualmente</button>
          </div>

          {mode==='select'?(
            <>
              <input placeholder="🔍 Cerca per nome, P.IVA o C.F..." value={searchTerm} onChange={e=>setSearchTerm(e.target.value)} style={{width:'100%',padding:'.6rem',borderRadius:6,border:'1px solid var(--bd)',background:'var(--s2)',color:'var(--tx)',marginBottom:'1rem'}}/>
              <div style={{maxHeight:260,overflowY:'auto',border:'1px solid var(--bd)',borderRadius:8}}>
                {loading?<div style={{padding:'2rem',textAlign:'center',color:'var(--mu)'}}>⏳</div>
                :clientiFiltrati.length===0?<div style={{padding:'2rem',textAlign:'center',color:'var(--mu)'}}>Nessun cliente</div>
                :clientiFiltrati.map(c=>(
                  <div key={c.id} onClick={()=>setSelectedCliente(c)} style={{padding:'.75rem 1rem',borderBottom:'1px solid var(--bd)',cursor:'pointer',background:selectedCliente?.id===c.id?'rgba(200,164,94,.15)':'transparent',borderLeft:selectedCliente?.id===c.id?'3px solid var(--gold)':'3px solid transparent'}}>
                    <div style={{fontWeight:600,fontSize:'.85rem'}}>{c.ragione_sociale||`${c.nome} ${c.cognome}`.trim()}</div>
                    <div style={{fontSize:'.72rem',color:'var(--mu)',marginTop:'.2rem'}}>{c.partita_iva&&`P.IVA: ${c.partita_iva}`}{c.partita_iva&&c.codice_fiscale&&' · '}{c.codice_fiscale&&`C.F.: ${c.codice_fiscale}`}</div>
                  </div>
                ))}
              </div>
              {selectedCliente&&<div style={{marginTop:'1rem',padding:'.75rem',background:'rgba(52,194,122,.1)',borderRadius:8,border:'1px solid rgba(52,194,122,.3)'}}><div style={{fontSize:'.75rem',color:'var(--gr)',fontWeight:600}}>✓ Selezionato:</div><div style={{fontWeight:600}}>{selectedCliente.ragione_sociale||`${selectedCliente.nome} ${selectedCliente.cognome}`}</div></div>}
            </>
          ):(
            <div className="form-grid">
              <div className="fg full"><label>Denominazione *</label><input value={formData.denominazione} onChange={e=>setFormData(p=>({...p,denominazione:e.target.value}))}/></div>
              <div className="fg"><label>P.IVA</label><input value={formData.partita_iva} onChange={e=>setFormData(p=>({...p,partita_iva:e.target.value}))} maxLength={11}/></div>
              <div className="fg"><label>Codice Fiscale</label><input value={formData.codice_fiscale} onChange={e=>setFormData(p=>({...p,codice_fiscale:e.target.value.toUpperCase()}))} maxLength={16}/></div>
              <div className="fg full"><label>Indirizzo</label><input value={formData.indirizzo} onChange={e=>setFormData(p=>({...p,indirizzo:e.target.value}))}/></div>
              <div className="fg"><label>CAP</label><input value={formData.cap} onChange={e=>setFormData(p=>({...p,cap:e.target.value}))} maxLength={5}/></div>
              <div className="fg"><label>Città</label><input value={formData.citta} onChange={e=>setFormData(p=>({...p,citta:e.target.value}))}/></div>
              <div className="fg"><label>Provincia</label><input value={formData.provincia} onChange={e=>setFormData(p=>({...p,provincia:e.target.value.toUpperCase()}))} maxLength={2}/></div>
              <div className="fg"><label>Regime Contabile</label><select value={formData.regime_contabile} onChange={e=>setFormData(p=>({...p,regime_contabile:e.target.value}))}><option value="ordinario">Ordinario</option><option value="semplificato">Semplificato</option><option value="forfettario">Forfettario</option></select></div>
              <div className="fg"><label>Liquidazione IVA</label><select value={formData.tipo_liquidazione_iva} onChange={e=>setFormData(p=>({...p,tipo_liquidazione_iva:e.target.value}))}><option value="mensile">Mensile</option><option value="trimestrale">Trimestrale</option></select></div>
            </div>
          )}

          {/* Sezione duplicazione — comune a entrambe le modalità */}
          {renderDuplicaSection()}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          {mode==='select'
            ?<button className="btn" onClick={handleSelectCliente} disabled={saving||!selectedCliente}>{saving?'⏳ Salvo...':'✓ Crea Società'}</button>
            :<button className="btn" onClick={handleSaveManual} disabled={saving||!formData.denominazione}>{saving?'⏳ Salvo...':'💾 Crea Società'}</button>
          }
        </div>
      </div>
    </div>
  );
}

// ─── MODAL IMPORT PDF ────────────────────────────────────────
// ─── BROWSER-SIDE PDF TEXT EXTRACTION + DETERMINISTIC PARSER ───
// Piano dei conti: parsed entirely in the browser, zero API calls

// ─── DETERMINISTIC PARSER: PIANO CONTI DA EXCEL NES ───────────
// Formato colonne Excel NES: Codice, Descrizione, Mastro, Mastrino, Conto, Sottoconto, ...Tipo, Natura conto
// Questo parser è deterministico al 100%: legge le colonne direttamente, niente regex su testo
function parsePianoContiFromExcel(workbook){
  const XLSX = window._XLSX; // SheetJS già caricato
  const sheetName = workbook.SheetNames[0];
  const ws = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  if(!rows.length) return [];

  const accounts = [];
  const seen = new Set();

  for(let i=1; i<rows.length; i++){
    const r = rows[i];
    if(!r || !r[2]) continue; // mastro obbligatorio

    const mastro    = String(r[2]).trim();
    const mastrino  = r[3]!=null ? String(r[3]).trim().padStart(2,'0') : null;
    const conto     = r[4]!=null ? String(r[4]).trim().padStart(2,'0') : null;
    const sottoconto= r[5]!=null ? String(r[5]).trim().padStart(4,'0') : null;
    const descrizione = r[1] ? String(r[1]).trim() : null;
    if(!descrizione) continue;

    let codice, level;
    if(mastro && !mastrino)                           { codice=mastro;                                    level=1; }
    else if(mastro && mastrino && !conto)             { codice=`${mastro} ${mastrino}`;                   level=2; }
    else if(mastro && mastrino && conto && !sottoconto){ codice=`${mastro} ${mastrino} ${conto}`;         level=3; }
    else if(sottoconto)                               { codice=`${mastro} ${mastrino} ${conto} ${sottoconto}`; level=4; }
    else continue;

    codice = codice.trim();
    if(seen.has(codice)) continue;
    seen.add(codice);

    const tipoExcel  = r[7] ? String(r[7]).toLowerCase() : '';
    const naturaExcel= r[8] ? String(r[8]).toLowerCase() : '';
    const tipoSogg   = r[12]? String(r[12]).toLowerCase(): '';

    const fd = parseInt(mastro);
    let tipo='patrimoniale', natura='attivo', sezione='dare';
    if(tipoExcel.includes('economic'))    { tipo='economico'; }
    if(naturaExcel.includes('passiv'))    { natura='passivo'; sezione='avere'; }
    else if(naturaExcel.includes('ricav')){ natura='ricavo';  sezione='avere'; tipo='economico'; }
    else if(naturaExcel.includes('cost')) { natura='costo';   sezione='dare';  tipo='economico'; }
    else if(fd===1)                       { natura='attivo';  sezione='dare'; }
    else if(fd===2)                       { natura='passivo'; sezione='avere'; }
    else if(fd===3)                       { natura='ricavo';  sezione='avere'; tipo='economico'; }
    else if(fd<=5)                        { natura='costo';   sezione='dare';  tipo='economico'; }
    else                                  { natura='ordine';  tipo='ordine'; }

    const du = descrizione.toUpperCase();
    const is_cliente   = /^1 02 (10|15|20)/.test(codice) && level===4;
    const is_forn_it   = /^2 03 (07|08)/.test(codice) && level===4;
    const is_forn_ext  = /^2 03 09/.test(codice) && level===4;
    const is_prof      = /^2 03 10/.test(codice) && level===4 || tipoSogg.includes('profes');
    const is_fornitore = is_forn_it || is_forn_ext || is_prof;
    const is_banca     = /^1 02 60/.test(codice) && level===4 && /BANCA|C\/C|CRED.*COOPER|CREDEM|POSTA\s+C\/C/i.test(du);
    const is_cassa     = /^1 02 60/.test(codice) && level===4 && /CASSA\s+(CONTANTI|ASSEGNI|VALORI)/i.test(du);

    let anagrafica_tipo = null;
    if(is_prof)                                          anagrafica_tipo='professionista';
    else if(is_cliente && codice.startsWith('1 02 10'))  anagrafica_tipo='cliente_estero';
    else if(is_cliente)                                  anagrafica_tipo='cliente_italia';
    else if(is_forn_ext)                                 anagrafica_tipo='fornitore_estero';
    else if(is_forn_it)                                  anagrafica_tipo='fornitore_italia';

    const parts = codice.split(' ');
    accounts.push({
      codice,
      codice_mastro: parts[0]||null,
      codice_conto: level>=3 ? `${parts[0]} ${parts[1]} ${parts[2]}` : null,
      codice_sottoconto: level>=4 ? codice : null,
      descrizione, tipo, natura, sezione, livello: level,
      is_cliente:!!is_cliente, is_fornitore:!!is_fornitore,
      is_banca:!!is_banca, is_cassa:!!is_cassa,
      is_iva: /IVA\s+(NS|CREDITO|DEBITO|SOSPESO|VENDITE)/i.test(du),
      anagrafica_tipo, attivo: true
    });
  }
  return accounts;
}

function parsePianoContiFromText(text){
  // Il testo da pdfjs browser arriva senza newline tra i record — tutto su una riga.
  // Formato: "1 ATTIVITA'1 CREDITI V/SOCI001 SOCI C/SOTTOSCRIZIONE00 01..."
  // Strategia: inserisce \n prima di ogni "cifra_singola SPAZIO LETTERA_MAIUSCOLA"
  // preceduto da un carattere non-spazio (fine del codice/descrizione precedente)

  // Split per record: inserisce newline prima di ogni inizio record
  // FIX: rimuove timestamp pdfjs iniettati (es "20/03/2026 00:11:45"), poi
  // splitta SOLO quando preceduto da cifra o spazio — non da lettera/apostrofo
  // In questo modo "PASSIVITA'2 PASSIVO..." non genera uno split errato su '2
  const normalized = text
    .replace(/\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/g, ' ')
    .replace(/(?<=[\d\s])([1-9] [A-Z])/g, '\n$1');

  const lines = normalized.split('\n');
  const accounts = [];
  const skip = [/stampa piano/i, /codice.*descrizione/i, /pagina\s+\d+/i,
                /^\d{2}\/\d{2}\/\d{4}/, /^\s*$/, /^19NOVANTA/i,
                /^\d{2}:\d{2}:\d{2}$/, /^\d+$/ // FIX: salta timestamp isolati e numeri puri
                ];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (skip.some(p => p.test(line))) continue;

    const mBase = line.match(/^(\d)\s+(.+)$/);
    if (!mBase) continue;
    const mastro = mBase[1];
    const rest = mBase[2];
    let desc = '', codice = '', level = 1;

    // Cerca coda numerica alla FINE: "DESC[NN NN NNNN]" o "DESC[NN NN]" o "DESC[NN]"
    const m4 = rest.match(/^(.*\S)\s*(\d{2})\s(\d{2})\s(\d{4})$/);
    const m3 = !m4 && rest.match(/^(.*\S)\s*(\d{2})\s(\d{2})$/);
    const m2 = !m4 && !m3 && rest.match(/^(.*\S)\s*(\d{2})$/);

    if (m4)      { codice=`${mastro} ${m4[2]} ${m4[3]} ${m4[4]}`; desc=m4[1].trim(); level=4; }
    else if (m3) { codice=`${mastro} ${m3[2]} ${m3[3]}`;           desc=m3[1].trim(); level=3; }
    else if (m2) { codice=`${mastro} ${m2[2]}`;                    desc=m2[1].trim(); level=2; }
    else         { codice=mastro;                                   desc=rest.trim();  level=1; }

    if (!desc || /^\d+$/.test(desc)) continue;

    const parts = codice.trim().split(' ');
    const fd = parseInt(mastro);
    let tipo='patrimoniale', natura='attivo', sezione='dare';
    if (fd===1)      { natura='attivo';  sezione='dare';  }
    else if (fd===2) { natura='passivo'; sezione='avere'; }
    else if (fd===3) { natura='ricavo';  tipo='economico'; sezione='avere'; }
    else if (fd<=5)  { natura='costo';   tipo='economico'; sezione='dare';  }
    else             { natura='ordine';  tipo='ordine'; }

    const du = desc.toUpperCase();
    const is_cliente   = /^1 02 (10|15|20)/.test(codice) && level===4;
    const is_forn_it   = /^2 03 (07|08)/.test(codice) && level===4;
    const is_forn_ext  = /^2 03 09/.test(codice) && level===4;
    const is_prof      = /^2 03 10/.test(codice) && level===4;
    const is_fornitore = is_forn_it || is_forn_ext || is_prof;
    const is_banca     = /^1 02 60/.test(codice) && level===4 && /BANCA|C\/C|CRED.*COOPER|CREDEM|POSTA\s+C\/C/i.test(du);
    const is_cassa     = /^1 02 60/.test(codice) && level===4 && /CASSA\s+(CONTANTI|ASSEGNI|VALORI)/i.test(du);

    let anagrafica_tipo = null;
    if (is_prof)                              anagrafica_tipo = 'professionista';
    else if (is_cliente && codice.startsWith('1 02 10')) anagrafica_tipo = 'cliente_estero';
    else if (is_cliente)                      anagrafica_tipo = 'cliente_italia';
    else if (is_forn_ext)                     anagrafica_tipo = 'fornitore_estero';
    else if (is_forn_it)                      anagrafica_tipo = 'fornitore_italia';

    accounts.push({
      codice: codice.trim(),
      codice_mastro: parts[0] || null,
      codice_conto: level>=3 ? `${parts[0]} ${parts[1]} ${parts[2]}` : null,
      codice_sottoconto: level>=4 ? codice.trim() : null,
      descrizione: desc, tipo, natura, sezione, livello: level,
      is_cliente: !!is_cliente, is_fornitore: !!is_fornitore,
      is_banca: !!is_banca, is_cassa: !!is_cassa,
      is_iva: /IVA\s+(NS|CREDITO|DEBITO|SOSPESO|VENDITE)/i.test(du),
      anagrafica_tipo, attivo: true
    });
  }

  // Deduplicazione finale
  const seen = new Set();
  return accounts.filter(a => {
    if (seen.has(a.codice)) return false;
    seen.add(a.codice); return true;
  });
}

// ─── DETERMINISTIC PARSER: CAUSALI IVA ─────────────────────────
// Format: "A1 - IMPONIBILE 20%", "A17W - 22% AUTOF. ART.17 C.3 633/72", etc.
function parseCausaliIvaFromText(text){
  const lines=text.split('\n');
  const items=[];
  const skip=[/causali\s+iva/i,/codice.*descrizione/i,/pagina\s+\d+/i,/^\d{2}\/\d{2}\/\d{4}/,/^\s*$/,/stampa/i];
  
  for(const line of lines){
    const trimmed=line.trim();
    if(!trimmed)continue;
    if(skip.some(p=>p.test(trimmed)))continue;
    
    // Pattern: CODE - DESCRIPTION (or CODE  DESCRIPTION with multiple spaces)
    let m=trimmed.match(/^([A-Z0-9]{1,10})\s+[-–]\s+(.+)$/i);
    if(!m)m=trimmed.match(/^([A-Z0-9]{1,10})\s{2,}(.+)$/i);
    if(!m)continue;
    
    const codice=m[1].trim().toUpperCase();
    const descrizione=m[2].trim();
    
    // Skip if codice looks like a page number or date
    if(/^\d{1,2}$/.test(codice)&&parseInt(codice)>31)continue;
    
    // Extract aliquota from description (e.g., "IMPONIBILE 20%", "22% AUTOF...")
    let aliquota=0;
    const aliqMatch=descrizione.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
    if(aliqMatch)aliquota=parseFloat(aliqMatch[1].replace(',','.'))||0;
    
    // Determine tipo from description
    let tipo='imponibile';
    const du=descrizione.toUpperCase();
    if(/NON\s*IMP|ART\s*\.?\s*8|ESPORTAZ/i.test(du))tipo='non_imponibile';
    else if(/ESENT|ART\s*\.?\s*10/i.test(du))tipo='esente';
    else if(/ESCLU|ART\s*\.?\s*15|FUORI\s*CAMPO/i.test(du))tipo='escluso';
    
    // Determine regime
    let regime='normale';
    if(/INTRA|CEE|REVERSE|REV\.?\s*CHARGE|AUTOFATT/i.test(du))regime='acquisto_cee';
    
    // Detraibilità
    let detraibile=true;
    let percentuale_detraibilita=100;
    if(/INDETR|NON\s*DETR|0\s*%\s*DET/i.test(du)){detraibile=false;percentuale_detraibilita=0;}
    else if(/50\s*%\s*DET|PARZ/i.test(du)){percentuale_detraibilita=50;}
    
    // Codice natura FE (for non-imponibili, esenti, esclusi)
    let codice_natura_fe=null;
    if(tipo==='escluso')codice_natura_fe='N1';
    else if(tipo==='non_imponibile')codice_natura_fe='N3';
    else if(tipo==='esente')codice_natura_fe='N4';
    
    items.push({
      codice,descrizione,aliquota,tipo,regime,detraibile,
      percentuale_detraibilita,codice_natura_fe,
      include_liquidazione:true,include_dichiarazione:true,attivo:true
    });
  }
  return items;
}

// ─── DETERMINISTIC PARSER: CAUSALI CONTABILI ───────────────────
// Format: "VEN - Vendita merce", "ACQ - Acquisto merce", etc.
function parseCausaliContabiliFromText(text){
  const lines=text.split('\n');
  const items=[];
  const skip=[/causali\s+contab/i,/codice.*descrizione/i,/pagina\s+\d+/i,/^\d{2}\/\d{2}\/\d{4}/,/^\s*$/,/stampa/i];
  
  for(const line of lines){
    const trimmed=line.trim();
    if(!trimmed)continue;
    if(skip.some(p=>p.test(trimmed)))continue;
    
    // Pattern: CODE - DESCRIPTION or CODE  DESCRIPTION
    let m=trimmed.match(/^([A-Z0-9]{1,10})\s+[-–]\s+(.+)$/i);
    if(!m)m=trimmed.match(/^([A-Z0-9]{1,10})\s{2,}(.+)$/i);
    if(!m)continue;
    
    const codice=m[1].trim().toUpperCase();
    const descrizione=m[2].trim();
    if(/^\d{1,2}$/.test(codice)&&parseInt(codice)>31)continue;
    
    // Determine tipo from description
    let tipo='generico';
    const du=descrizione.toUpperCase();
    if(/VENDITA|CESSIONE|FATTURA\s*ATT/i.test(du))tipo='vendite';
    else if(/ACQUIST|FATTURA\s*PASS/i.test(du))tipo='acquisti';
    else if(/PAGA|INCASSO|BANCA|CASSA/i.test(du))tipo='finanziario';
    else if(/GIRO|RETTIFIC|STORNO/i.test(du))tipo='rettifica';
    else if(/STIPEND|SALARI|PERSON/i.test(du))tipo='personale';
    else if(/AMMORT/i.test(du))tipo='ammortamento';
    
    items.push({codice,descrizione,tipo,attivo:true});
  }
  return items;
}


// ─── DETERMINISTIC PARSER: CAUSALI CONTABILI DA EXCEL NES ─────
// Colonne: 0=Codice, 1=Descrizione, 2=Descr.tabulati, 3=Tipo causale, 6=Cod.registro IVA
function parseCausaliContabiliFromExcel(workbook){
  const XLSX = window._XLSX;
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const items = []; const seen = new Set();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const codice=(r[0]||'').toString().trim().toUpperCase();
    const descrizione=(r[1]||'').toString().trim();
    if(!codice||!descrizione)continue;
    if(seen.has(codice))continue; seen.add(codice);
    const disattivato=(r[27]||'').toString().trim().toUpperCase()==='T';
    if(disattivato)continue;
    const tipoRaw=(r[3]||'').toString().toLowerCase();
    let tipo='generico';
    if(/vendita|cessione|fattura.att/i.test(tipoRaw)||/fattura.att/i.test(descrizione))tipo='vendite';
    else if(/acquist|fattura.pass/i.test(tipoRaw)||/acquist/i.test(descrizione))tipo='acquisti';
    else if(/paga|incasso|banca|cassa/i.test(descrizione))tipo='finanziario';
    else if(/giro|rettific|storno/i.test(descrizione))tipo='rettifica';
    else if(/stipend|salari|person/i.test(descrizione))tipo='personale';
    else if(/ammort/i.test(descrizione))tipo='ammortamento';
    else if(/autofattura/i.test(tipoRaw))tipo='acquisti';
    const codice_registro_iva=(r[6]||null)?.toString().trim()||null;
    items.push({codice, descrizione, tipo, codice_registro_iva, attivo:true});
  }
  return items;
}


// ─── DETERMINISTIC PARSER: CAUSALI IVA DA EXCEL NES ──────────
// Colonne: 0=Codice, 1=Descrizione, 2=%imposta, 3=Operazione, 7=Detraibile, 8=%indetraibilità
function parseCausaliIvaFromExcel(workbook){
  const XLSX = window._XLSX;
  const ws = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null});
  const items = []; const seen = new Set();
  for(let i=1;i<rows.length;i++){
    const r=rows[i];
    const codice=(r[0]||'').toString().trim().toUpperCase();
    const descrizione=(r[1]||'').toString().trim();
    if(!codice||!descrizione)continue;
    if(seen.has(codice))continue; seen.add(codice);
    const aliquota=parseFloat(r[2])||0;
    const operazione=(r[3]||'').toString().toLowerCase();
    const detraibileRaw=(r[7]||'').toString().trim().toUpperCase();
    const percIndetr=parseFloat(r[8])||0;
    const detraibile=detraibileRaw==='T';
    const percentuale_detraibilita=detraibile?(100-percIndetr):0;
    let tipo='imponibile';
    if(/non.imp|esportaz/i.test(operazione)||/non.imp/i.test(descrizione))tipo='non_imponibile';
    else if(/esent/i.test(operazione)||/esent/i.test(descrizione))tipo='esente';
    else if(/esclu|fuori.campo/i.test(operazione)||/esclu/i.test(descrizione))tipo='escluso';
    let regime='normale';
    if(/intra|cee/i.test(descrizione))regime='acquisto_cee';
    else if(/reverse|autof/i.test(descrizione))regime='reverse_charge';
    let codice_natura_fe=null;
    if(tipo==='escluso')codice_natura_fe='N1';
    else if(tipo==='non_imponibile')codice_natura_fe='N3';
    else if(tipo==='esente')codice_natura_fe='N4';
    // natura IVA PA col 44
    const naturaPa=(r[44]||'').toString().trim()||null;
    if(naturaPa)codice_natura_fe=naturaPa;
    items.push({
      codice, descrizione, aliquota, tipo, regime,
      detraibile, percentuale_detraibilita, codice_natura_fe,
      include_liquidazione:true, include_dichiarazione:true, attivo:true
    });
  }
  return items;
}

function ModalImportPDF({tipo,societaId,onComplete,onClose}){
  const [file,setFile]=useState(null);
  const [loading,setLoading]=useState(false);
  const [progress,setProgress]=useState('');
  const [result,setResult]=useState(null); // {records, nuovi, duplicati, aggiornati}
  const [error,setError]=useState(null);
  const [drag,setDrag]=useState(false);
  const fileRef=useRef();
  const ai=useAIStatus();

  const tipi={
    piano_conti:{title:'Piano dei Conti',icon:'🗂️',table:'piano_conti',keyField:'codice'},
    causali:{title:'Causali Contabili',icon:'📋',table:'causali_contabili',keyField:'codice'},
    causali_iva:{title:'Causali IVA',icon:'💧',table:'causali_iva',keyField:'codice'}
  };
  const cfg=tipi[tipo];

  const handleFile=(f)=>{if(f&&(f.type==='application/pdf'||f.name?.endsWith('.xlsx')||f.name?.endsWith('.xls'))){setFile(f);setResult(null);setError(null);}};

  const handleUpload=async()=>{
    if(!file)return;
    setLoading(true);setError(null);
    ai.setAI('processing','Import '+cfg.title,'local');
    try{
      // BRANCH EXCEL: se file è xlsx, usa parser Excel diretto (solo piano_conti)
      if(tipo==='piano_conti'&&(file.name?.endsWith('.xlsx')||file.name?.endsWith('.xls'))){
        setProgress('Caricamento Excel...');
        // Carica SheetJS se non già presente
        if(!window._XLSX){
          await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>{window._XLSX=window.XLSX;res();};s.onerror=rej;document.head.appendChild(s);});
        }
        const ab=await file.arrayBuffer();
        const wb=window._XLSX.read(ab,{type:'array'});
        setProgress('Parsing Excel...');
        const parsed=parsePianoContiFromExcel(wb);
        if(!parsed.length)throw new Error('Nessun conto trovato nel file Excel.');
        setProgress('Controllo duplicati...');
        const{data:esistenti}=await sb.from(cfg.table).select('codice').eq('societa_id',societaId).eq('attivo',true);
        const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
        const nuovi=parsed.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
        const duplicati=parsed.filter(r=>esistentiSet.has(r.codice?.toString().trim()));
        const stats={
          mastri:nuovi.filter(i=>i.livello===1).length,
          gruppi:nuovi.filter(i=>i.livello===2).length,
          conti:nuovi.filter(i=>i.livello===3).length,
          sottoconti:nuovi.filter(i=>i.livello===4).length,
          clienti:nuovi.filter(i=>i.is_cliente).length,
          fornitori:nuovi.filter(i=>i.is_fornitore).length,
          banche:nuovi.filter(i=>i.is_banca).length,
        };
        setResult({parsed,nuovi,duplicati,stats,method:'excel'});
        setLoading(false);setProgress('');
        ai.setAI('done','Import '+cfg.title,'local');
        return;
      }
      // BRANCH EXCEL causali contabili e IVA
      if((tipo==='causali'||tipo==='causali_iva')&&(file.name?.endsWith('.xlsx')||file.name?.endsWith('.xls'))){
        setProgress('Caricamento Excel...');
        if(!window._XLSX){
          await new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';s.onload=()=>{window._XLSX=window.XLSX;res();};s.onerror=rej;document.head.appendChild(s);});
        }
        const ab=await file.arrayBuffer();
        const wb=window._XLSX.read(ab,{type:'array'});
        setProgress('Parsing Excel...');
        const parsed=tipo==='causali_iva'?parseCausaliIvaFromExcel(wb):parseCausaliContabiliFromExcel(wb);
        if(!parsed.length)throw new Error('Nessuna causale trovata nel file Excel.');
        setProgress('Controllo duplicati...');
        const{data:esistenti}=await sb.from(cfg.table).select('codice').eq('societa_id',societaId).eq('attivo',true);
        const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
        const nuovi=parsed.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
        const duplicati=parsed.filter(r=>esistentiSet.has(r.codice?.toString().trim()));
        setResult({parsed,nuovi,duplicati,stats:null,method:'excel'});
        setLoading(false);setProgress('');
        ai.setAI('done','Import '+cfg.title,'local');
        return;
      }
      // 1. Estrai testo nel browser (leggero, zero costi) — BRANCH PDF
      setProgress('Estrazione testo dal PDF...');
      const text=await extractTextFromPDFBrowser(file);
      console.log('TESTO ESTRATTO lunghezza:', text?.length, 'chars');
      console.log('PRIME 500 CHARS:', JSON.stringify(text?.substring(0,500)));
      if(!text||text.trim().length<20)throw new Error('Impossibile estrarre testo dal PDF.');

      // 2. Parsing locale deterministico
      setProgress('Parsing struttura...');
      let parsed=[];
      if(tipo==='piano_conti') parsed=parsePianoContiFromText(text);
      else if(tipo==='causali_iva') parsed=parseCausaliIvaFromText(text);
      else parsed=parseCausaliContabiliFromText(text);
      console.log('PARSED:', parsed.length, 'conti');

      if(!parsed.length)throw new Error('Nessun record trovato. Verifica il formato del PDF (NES, BLUENEXT, PROFIS).');

      // 4. Controllo doppioni
      setProgress('Controllo duplicati...');
      const {data:esistenti}=await sb.from(cfg.table)
        .select('codice').eq('societa_id',societaId).eq('attivo',true);
      const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
      const nuovi=parsed.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
      const duplicati=parsed.filter(r=>esistentiSet.has(r.codice?.toString().trim()));

      const stats=tipo==='piano_conti'?{
        mastri:nuovi.filter(i=>i.livello===1).length,
        gruppi:nuovi.filter(i=>i.livello===2).length,
        conti:nuovi.filter(i=>i.livello===3).length,
        sottoconti:nuovi.filter(i=>i.livello===4).length,
        clienti:nuovi.filter(i=>i.is_cliente).length,
        fornitori:nuovi.filter(i=>i.is_fornitore).length,
        banche:nuovi.filter(i=>i.is_banca).length,
      }:null;

      setResult({parsed,nuovi,duplicati,stats});
    }catch(e){setError(e.message);}
    finally{setLoading(false);setProgress('');ai.setAI('done','Import '+cfg.title,'local');}
  };

  const handleImport=async(soloNuovi=true)=>{
    if(!result)return;
    const toImport=soloNuovi?result.nuovi:result.parsed;
    if(!toImport.length){alert('Nessun record da importare.');return;}
    setLoading(true);setError(null);
    try{
      // Deduplica per codice prima di inviare (evita ON CONFLICT su stesso batch)
      const seen=new Set();
      const records=toImport
        .map(r=>({...r,societa_id:societaId}))
        .filter(r=>{
          const key=r.codice?.toString().trim();
          if(seen.has(key))return false;
          seen.add(key);return true;
        });
      const BATCH=500;
      for(let i=0;i<records.length;i+=BATCH){
        setProgress(`Inserimento ${Math.min(i+BATCH,records.length)}/${records.length}...`);
        const{error:err}=await sb.from(cfg.table).upsert(records.slice(i,i+BATCH),{onConflict:'societa_id,codice',ignoreDuplicates:false});
        if(err)throw err;
      }
      setProgress('');onComplete();
    }catch(e){setError(e.message);}
    finally{setLoading(false);setProgress('');}
  };

  const handleRetryAI=async()=>{
    if(!file)return;
    setLoading(true);setError(null);
    ai.setAI('processing','Import AI '+cfg.title,'ai');
    try{
      setProgress('Analisi AI in corso...');
      const base64=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=rej;r.readAsDataURL(file);});
      const apiTipo=tipo==='causali'?'causali_contabili':tipo;
      const resp=await fetch('/api/parse-contabilita-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pdf:base64,tipo:apiTipo})});
      if(!resp.ok){const d=await resp.json();throw new Error(d.error||'Errore AI');}
      const data=await resp.json();
      if(!data.records?.length)throw new Error('AI non ha trovato risultati.');

      // controllo doppioni anche per AI
      const{data:esistenti}=await sb.from(cfg.table).select('codice').eq('societa_id',societaId).eq('attivo',true);
      const esistentiSet=new Set((esistenti||[]).map(r=>r.codice?.toString().trim()));
      const nuovi=data.records.filter(r=>!esistentiSet.has(r.codice?.toString().trim()));
      const duplicati=data.records.filter(r=>esistentiSet.has(r.codice?.toString().trim()));
      setResult({parsed:data.records,nuovi,duplicati,stats:null,method:'ai'});
    }catch(e){setError(e.message);}
    finally{setLoading(false);setProgress('');ai.setAI('done','Import AI','ai');}
  };

  const s=result?.stats;

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">{cfg.icon} Import {cfg.title}</div>
          <div className="modal-sub">PDF o Excel NES · parsing locale · zero costi AI</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!result?(
            <>
              <div className={'upload-zone'+(drag?' drag':'')}
                style={{marginBottom:'1rem'}}
                onDragOver={e=>{e.preventDefault();setDrag(true);}}
                onDragLeave={()=>setDrag(false)}
                onDrop={e=>{e.preventDefault();setDrag(false);handleFile(e.dataTransfer.files[0]);}}
                onClick={()=>fileRef.current.click()}>
                <input ref={fileRef} type="file" accept='.pdf,.xlsx,.xls' hidden onChange={e=>handleFile(e.target.files[0])}/>
                <div className="upload-zone-ico">📄</div>
                <div className="upload-zone-t">{file?file.name:'Trascina PDF qui o clicca'}</div>
                <div className="upload-zone-s">NES · BLUENEXT · PROFIS e altri formati contabili</div>
              </div>
              {progress&&<div style={{textAlign:'center',color:'var(--gold)',fontSize:'.8rem',padding:'.5rem'}}>⏳ {progress}</div>}
              {error&&<div className="alert alert-err">{error}</div>}
            </>
          ):(
            <div>
              {/* ── RIEPILOGO ── */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'.65rem',marginBottom:'1rem'}}>
                <div style={{background:'rgba(52,194,122,.08)',border:'1px solid rgba(52,194,122,.25)',borderRadius:10,padding:'.85rem 1rem',textAlign:'center'}}>
                  <div style={{fontSize:'1.6rem',fontWeight:700,color:'var(--gr)'}}>{result.nuovi.length}</div>
                  <div style={{fontSize:'.72rem',color:'var(--gr)',fontWeight:600}}>✨ Nuovi da importare</div>
                </div>
                <div style={{background:'rgba(200,164,94,.08)',border:'1px solid rgba(200,164,94,.25)',borderRadius:10,padding:'.85rem 1rem',textAlign:'center'}}>
                  <div style={{fontSize:'1.6rem',fontWeight:700,color:'var(--gold)'}}>{result.duplicati.length}</div>
                  <div style={{fontSize:'.72rem',color:'var(--gold)',fontWeight:600}}>⚠ Già presenti (skip)</div>
                </div>
              </div>

              {/* ── STATS PIANO CONTI ── */}
              {s&&(
                <div style={{display:'flex',flexWrap:'wrap',gap:'.4rem',marginBottom:'1rem'}}>
                  {[['Mastri',s.mastri,'var(--gold)'],['Gruppi',s.gruppi,'var(--pu)'],['Conti',s.conti,'var(--cy)'],['Sottoconti',s.sottoconti,'var(--tx)'],['Clienti',s.clienti,'var(--gr)'],['Fornitori',s.fornitori,'var(--gold)'],['Banche',s.banche,'#60a5fa']].filter(([,v])=>v>0).map(([l,v,c])=>(
                    <div key={l} style={{background:'var(--s2)',borderRadius:8,padding:'.4rem .7rem',textAlign:'center',minWidth:60}}>
                      <div style={{fontSize:'1rem',fontWeight:700,color:c}}>{v}</div>
                      <div style={{fontSize:'.6rem',color:'var(--mu)'}}>{l}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── ANTEPRIMA NUOVI ── */}
              {result.nuovi.length>0&&(
                <div style={{marginBottom:'1rem'}}>
                  <div style={{fontSize:'.68rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',marginBottom:'.4rem'}}>Anteprima nuovi ({Math.min(result.nuovi.length,8)} di {result.nuovi.length})</div>
                  <div style={{background:'var(--s2)',borderRadius:8,maxHeight:160,overflowY:'auto'}}>
                    {result.nuovi.slice(0,8).map((r,i)=>(
                      <div key={i} style={{padding:'.35rem .65rem',borderBottom:'1px solid rgba(33,40,58,.4)',fontSize:'.78rem',display:'flex',gap:'.5rem',alignItems:'center'}}>
                        <code style={{color:'var(--gold)',fontSize:'.72rem',minWidth:70}}>{r.codice}</code>
                        <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descrizione}</span>
                        {r.aliquota!=null&&<span className="bdg bdg-blue" style={{fontSize:'.55rem'}}>{r.aliquota}%</span>}
                        {r.is_cliente&&<span className="bdg bdg-green" style={{fontSize:'.55rem'}}>C</span>}
                        {r.is_fornitore&&<span className="bdg bdg-gold" style={{fontSize:'.55rem'}}>F</span>}
                        {r.is_banca&&<span className="bdg bdg-blue" style={{fontSize:'.55rem'}}>B</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── DUPLICATI ── */}
              {result.duplicati.length>0&&(
                <div className="alert alert-warn" style={{marginBottom:'1rem'}}>
                  ⚠ <strong>{result.duplicati.length} codici già presenti</strong> verranno saltati automaticamente.
                  {result.duplicati.length<=5&&<span style={{opacity:.7}}> ({result.duplicati.map(d=>d.codice).join(', ')})</span>}
                </div>
              )}

              {progress&&<div style={{textAlign:'center',color:'var(--gold)',fontSize:'.8rem',padding:'.4rem'}}>⏳ {progress}</div>}
              {error&&<div className="alert alert-err">{error}</div>}
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn-sec" onClick={()=>result?((setResult(null)||true)&&setError(null)):onClose()}>
            {result?'← Ricarica':'Annulla'}
          </button>
          {!result?(
            <button className="btn" onClick={handleUpload} disabled={!file||loading}>
              {loading?`⏳ ${progress||'Analisi...'}`:'🔍 Analizza PDF'}
            </button>
          ):(
            <div style={{display:'flex',gap:'.5rem'}}>
              {tipo!=='piano_conti'&&(
                <button className="btn-sec" onClick={handleRetryAI} disabled={loading} title="Riprova con AI">
                  🤖 AI
                </button>
              )}
              {result.nuovi.length===0?(
                <button className="btn" disabled style={{opacity:.5}}>Nessun nuovo da importare</button>
              ):(
                <button className="btn" onClick={()=>handleImport(true)} disabled={loading}>
                  {loading?`⏳ ${progress}`:`📥 Importa ${result.nuovi.length} nuovi`}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MODULO BANCHE E RICONCILIAZIONE ─────────────────────────
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
  const [subView,setSubView]=useState('conti'); // conti, movimenti, riconcilia

  useEffect(()=>{if(societaId)caricaDati();},[societaId]);

  const caricaDati=async()=>{
    setLoading(true);
    const[{data:c},{data:m},{data:f}]=await Promise.all([
      sb.from('conti_bancari').select('*').eq('societa_id',societaId).order('nome'),
      sb.from('movimenti_bancari').select('*').eq('societa_id',societaId).order('data_operazione',{ascending:false}).limit(200),
      sb.from('partitario').select('*').eq('societa_id',societaId).eq('stato','aperta')
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
        await sb.from('conti_bancari').insert([{
          societa_id:societaId,
          requisition_id:data.requisitionId,
          banca_id:bankId,
          banca_nome:banks.find(b=>b.id===bankId)?.name,
          stato:'pending'
        }]);
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

        await sb.from('conti_bancari').update({
          account_id:accountId,
          nome:detData.account?.name||conto.banca_nome,
          iban:detData.account?.iban,
          bic:detData.account?.bic,
          saldo_disponibile:detData.balances?.find(b=>b.balanceType==='interimAvailable')?.balanceAmount?.amount,
          saldo_contabile:detData.balances?.find(b=>b.balanceType==='closingBooked')?.balanceAmount?.amount,
          stato:'linked',
          data_ultimo_sync:new Date().toISOString()
        }).eq('id',conto.id);

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
          const{error}=await sb.from('movimenti_bancari').upsert({
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
          },{onConflict:'conto_bancario_id,transaction_id'});
          if(!error)nuovi++;
        }

        await sb.from('conti_bancari').update({data_ultimo_sync:new Date().toISOString()}).eq('id',conto.id);
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
          await sb.from('movimenti_bancari').update({
            stato_riconciliazione:'proposto',
            match_score:match.score,
            match_confidence:match.confidence,
            partita_id:match.fattura?.id
          }).eq('id',match.transaction.id);
        }

        await caricaDati();
        alert(`Trovati ${data.matches.length} match su ${daRiconciliare.length} movimenti\n(${data.stats.matchRate} match rate)`);
      }
    }catch(e){
      alert('Errore matching: '+e.message);
    }
  };

  const confermaMatch=async(movId,partitaId)=>{
    await sb.from('movimenti_bancari').update({
      stato_riconciliazione:'confermato',
      partita_id:partitaId,
      riconciliato_at:new Date().toISOString()
    }).eq('id',movId);

    // Chiudi partita se importo corrisponde
    await sb.from('partitario').update({stato:'chiusa',data_chiusura:new Date().toISOString().split('T')[0]}).eq('id',partitaId);
    
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
                  <span className={'bdg '+(c.stato==='linked'?'bdg-green':c.stato==='pending'?'bdg-gold':'bdg-red')}>{c.stato}</span>
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
                  <td><span className={'bdg '+(m.stato_riconciliazione==='confermato'?'bdg-green':m.stato_riconciliazione==='proposto'?'bdg-cy':'bdg-gray')}>{m.stato_riconciliazione}</span></td>
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
                      <button className="btn-sec" onClick={()=>sb.from('movimenti_bancari').update({stato_riconciliazione:'da_riconciliare',partita_id:null}).eq('id',m.id).then(caricaDati)}>✗ Rifiuta</button>
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

// ─── STAMPE VIEW ─────────────────────────────────────────────
function StampeView({tipoStampa,societa,scritture,pianoConti,causaliIva}){
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

// ─── LIQUIDAZIONI IVA VIEW ───────────────────────────────────
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
    credito_precedente:0,
    interessi:0,
    note:''
  });

  useEffect(()=>{
    if(societa?.id)caricaLiquidazioni();
  },[societa]);

  const caricaLiquidazioni=async()=>{
    setLoading(true);
    const{data}=await sb.from('liquidazioni_iva_societa').select('*').eq('societa_id',societa.id).order('anno',{ascending:false}).order('periodo',{ascending:false});
    setLiquidazioni(data||[]);
    setLoading(false);
  };

  const calcolaDaScritture=()=>{
    // Calcola IVA dalle scritture del periodo
    const anno=formData.anno;
    const periodo=formData.periodo;
    const isTrimestrale=formData.tipo_periodo==='trimestrale';
    
    let ivaVendite=0,ivaAcquisti=0;
    
    scritture.forEach(s=>{
      const dataReg=new Date(s.data_registrazione);
      const annoReg=dataReg.getFullYear();
      const meseReg=dataReg.getMonth()+1;
      const trimestreReg=Math.ceil(meseReg/3);
      
      const inPeriodo=isTrimestrale?(annoReg===anno&&trimestreReg===periodo):(annoReg===anno&&meseReg===periodo);
      
      if(inPeriodo){
        // Determina se è vendita o acquisto dalla causale
        if(s.causale_codice?.startsWith('VE')||s.tipo==='vendita'){
          ivaVendite+=parseFloat(s.imposta||0);
        }else if(s.causale_codice?.startsWith('AC')||s.tipo==='acquisto'){
          ivaAcquisti+=parseFloat(s.imposta||0);
        }
      }
    });
    
    setFormData(prev=>({...prev,iva_vendite:ivaVendite.toFixed(2),iva_acquisti:ivaAcquisti.toFixed(2)}));
  };

  const salvaLiquidazione=async()=>{
    const ivaDebito=parseFloat(formData.iva_vendite||0);
    const ivaCredito=parseFloat(formData.iva_acquisti||0);
    const creditoPrec=parseFloat(formData.credito_precedente||0);
    const interessi=parseFloat(formData.interessi||0);
    
    const saldo=ivaDebito-ivaCredito-creditoPrec+interessi;
    
    const record={
      societa_id:societa.id,
      tipo_periodo:formData.tipo_periodo,
      anno:formData.anno,
      periodo:formData.periodo,
      iva_vendite:ivaDebito,
      iva_acquisti:ivaCredito,
      credito_precedente:creditoPrec,
      interessi:interessi,
      iva_dovuta:saldo>0?saldo:0,
      credito_da_riportare:saldo<0?Math.abs(saldo):0,
      note:formData.note,
      stato:'calcolata'
    };
    
    const{error}=await sb.from('liquidazioni_iva_societa').insert([record]);
    if(error){
      // Se la tabella non esiste, la creiamo
      if(error.code==='42P01'){
        alert('Tabella liquidazioni_iva_societa non trovata. Crea la tabella nel database.');
      }else{
        alert('Errore: '+error.message);
      }
      return;
    }
    setModalNuova(false);
    caricaLiquidazioni();
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
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
                  <th style={{textAlign:'right'}}>Credito Prec.</th>
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
                    <td style={{textAlign:'right'}}>{fmt(l.credito_precedente)}</td>
                    <td style={{textAlign:'right',color:l.iva_dovuta>0?'var(--rd)':'inherit',fontWeight:l.iva_dovuta>0?700:'normal'}}>{l.iva_dovuta>0?fmt(l.iva_dovuta):'—'}</td>
                    <td style={{textAlign:'right',color:l.credito_da_riportare>0?'var(--gr)':'inherit'}}>{l.credito_da_riportare>0?fmt(l.credito_da_riportare):'—'}</td>
                    <td><span className={'bdg '+(l.stato==='inviata'?'bdg-green':l.stato==='calcolata'?'bdg-blue':'bdg-gray')}>{l.stato}</span></td>
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
                  <button className="btn-sec" onClick={calcolaDaScritture} style={{width:'100%'}}>🔄 Calcola da Scritture</button>
                </div>
                <div className="fg">
                  <label>IVA Vendite (debito)</label>
                  <input type="number" step="0.01" value={formData.iva_vendite} onChange={e=>setFormData(p=>({...p,iva_vendite:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>IVA Acquisti (credito)</label>
                  <input type="number" step="0.01" value={formData.iva_acquisti} onChange={e=>setFormData(p=>({...p,iva_acquisti:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Credito periodo precedente</label>
                  <input type="number" step="0.01" value={formData.credito_precedente} onChange={e=>setFormData(p=>({...p,credito_precedente:e.target.value}))}/>
                </div>
                <div className="fg">
                  <label>Interessi (1%)</label>
                  <input type="number" step="0.01" value={formData.interessi} onChange={e=>setFormData(p=>({...p,interessi:e.target.value}))}/>
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
                <div style={{display:'flex',justifyContent:'space-between',marginBottom:'.5rem'}}>
                  <span>Credito precedente:</span><span style={{fontWeight:600}}>- {fmt(formData.credito_precedente)}</span>
                </div>
                <div style={{display:'flex',justifyContent:'space-between',paddingTop:'.5rem',borderTop:'1px solid var(--bd)'}}>
                  <span style={{fontWeight:700}}>SALDO:</span>
                  <span style={{fontWeight:700,color:(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_acquisti||0)-parseFloat(formData.credito_precedente||0))>0?'var(--rd)':'var(--gr)'}}>
                    {fmt(parseFloat(formData.iva_vendite||0)-parseFloat(formData.iva_acquisti||0)-parseFloat(formData.credito_precedente||0)+parseFloat(formData.interessi||0))}
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

// ─── LIPE VIEW ───────────────────────────────────────────────
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
    const{data}=await sb.from('liquidazioni_iva_societa').select('*').eq('societa_id',societa.id).eq('tipo_periodo','trimestrale').order('anno',{ascending:false}).order('periodo',{ascending:false});
    setLiquidazioni(data||[]);
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
        <DebitoCredPeriodPrec>${(liq.credito_precedente||0).toFixed(2)}</DebitoCredPeriodPrec>
        <CreditoAnnoPrec>0.00</CreditoAnnoPrec>
        <Interessi>${(liq.interessi||0).toFixed(2)}</Interessi>
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

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

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
                    <td><span className={'bdg '+(l.stato==='inviata'?'bdg-green':'bdg-blue')}>{l.stato}</span></td>
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

// ─── CORRISPETTIVI VIEW ──────────────────────────────────────
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
    
    const{data}=await sb.from('corrispettivi_giornalieri').select('*').eq('societa_id',societa.id).gte('data',inizioMese).lte('data',fineMese).order('data',{ascending:true});
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
    
    const{error}=await sb.from('corrispettivi_giornalieri').insert([record]);
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

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
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

// ─── MODELLO 770 VIEW ────────────────────────────────────────
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
    const{data}=await sb.from('ritenute_dacconto').select('*').eq('societa_id',societa.id).gte('data_pagamento',`${annoSel}-01-01`).lte('data_pagamento',`${annoSel}-12-31`).order('percipiente_denominazione');
    setPercipienti(data||[]);
    setLoading(false);
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

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

// ─── INTRASTAT VIEW ──────────────────────────────────────────
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
    
    const{data}=await sb.from('intrastat_operazioni').select('*').eq('societa_id',societa.id).eq('tipo',tipoSel==='cessioni'?'cessione':'acquisto').gte('data',inizioMese).lte('data',fineMese).order('data',{ascending:false});
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
    
    const{error}=await sb.from('intrastat_operazioni').insert([record]);
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

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
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

// ─── IVA ANNUALE VIEW ────────────────────────────────────────
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
    
    // Carica liquidazioni dell'anno
    const{data:liq}=await sb.from('liquidazioni_iva_societa').select('*').eq('societa_id',societa.id).eq('anno',annoSel).order('periodo');
    setLiquidazioni(liq||[]);
    
    // Calcola riepilogo da liquidazioni
    if(liq&&liq.length>0){
      const totIvaVendite=liq.reduce((s,l)=>s+parseFloat(l.iva_vendite||0),0);
      const totIvaAcquisti=liq.reduce((s,l)=>s+parseFloat(l.iva_acquisti||0),0);
      const creditoIniziale=parseFloat(liq[0]?.credito_precedente||0);
      const totIvaDovuta=liq.reduce((s,l)=>s+parseFloat(l.iva_dovuta||0),0);
      const creditoFinale=liq.length>0?parseFloat(liq[liq.length-1]?.credito_da_riportare||0):0;
      
      setDatiIva({
        operazioni_attive:totIvaVendite/0.22, // stima imponibile
        operazioni_passive:totIvaAcquisti/0.22,
        iva_esigibile:totIvaVendite,
        iva_detratta:totIvaAcquisti,
        iva_dovuta:totIvaDovuta,
        credito_anno_prec:creditoIniziale,
        acconti_versati:0,
        totale_dovuto:Math.max(0,totIvaDovuta-creditoIniziale),
        credito_risultante:creditoFinale
      });
    }else{
      // Calcola da scritture se non ci sono liquidazioni
      const scrittureAnno=scritture.filter(s=>{
        const dataReg=new Date(s.data_registrazione);
        return dataReg.getFullYear()===annoSel;
      });
      
      let ivaVendite=0,ivaAcquisti=0;
      scrittureAnno.forEach(s=>{
        if(s.causale_codice?.startsWith('VE')||s.tipo==='vendita'){
          ivaVendite+=parseFloat(s.imposta||0);
        }else if(s.causale_codice?.startsWith('AC')||s.tipo==='acquisto'){
          ivaAcquisti+=parseFloat(s.imposta||0);
        }
      });
      
      setDatiIva({
        operazioni_attive:ivaVendite/0.22,
        operazioni_passive:ivaAcquisti/0.22,
        iva_esigibile:ivaVendite,
        iva_detratta:ivaAcquisti,
        iva_dovuta:Math.max(0,ivaVendite-ivaAcquisti),
        credito_anno_prec:0,
        acconti_versati:0,
        totale_dovuto:Math.max(0,ivaVendite-ivaAcquisti),
        credito_risultante:Math.max(0,ivaAcquisti-ivaVendite)
      });
    }
    
    setLoading(false);
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

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
                      <th style={{textAlign:'right'}}>Credito Prec.</th>
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
                        <td style={{textAlign:'right'}}>{fmt(l.credito_precedente)}</td>
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
                      <td></td>
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

// ─── PERCIPIENTI VIEW ────────────────────────────────────────
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
    const{data}=await sb.from('percipienti').select('*').eq('societa_id',societa.id).eq('attivo',true).order('ragione_sociale');
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
      ({error}=await sb.from('percipienti').update(record).eq('id',editingId));
    }else{
      ({error}=await sb.from('percipienti').insert([record]));
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
    await sb.from('percipienti').update({attivo:false}).eq('id',id);
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

// ─── RITENUTE VIEW ───────────────────────────────────────────
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
      sb.from('ritenute_dacconto').select('*').eq('societa_id',societa.id).gte('data_pagamento',`${annoSel}-01-01`).lte('data_pagamento',`${annoSel}-12-31`).order('data_pagamento',{ascending:false}),
      sb.from('percipienti').select('*').eq('societa_id',societa.id).eq('attivo',true).order('ragione_sociale')
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
    
    const{error}=await sb.from('ritenute_dacconto').insert([record]);
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
    await sb.from('ritenute_dacconto').delete().eq('id',id);
    caricaDati();
  };

  const fmt=n=>n!=null?Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';

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
