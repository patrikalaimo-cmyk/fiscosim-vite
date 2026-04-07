import { parseXMLFattura } from '../../../domain/fatture.js'
import { trace } from '../../core/debug/trace'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../utils/pipelineLogger.js'
import { useState, useEffect, useCallback } from 'react'
import { useAIStatus } from '../../context/AIStatusContext'
import { TIPO_LABEL, TIPO_COLOR, MESI, LAST_SOCIETA_STORAGE_KEY } from '../../shared/constants'
import { routeDocument } from '../../core/workflow'
import { PN_GUIDATA_BUILDER_VERSION, buildInitialDraftFromDocumento } from '../../shared/utils/primaNotaDraftFromDocumento.js'
import { ResolveIvaError, resolveIvaOrNull } from '../../../domain/resolveIva.js'
import AnagraficheContabiliView, { ModalNuovaSocieta } from './views/AnagraficheContabiliView.jsx'
import PrimaNotaHubView from './views/PrimaNotaHubView.jsx'
import BankingView from './views/BankingView.jsx'
import TaxComplianceView from './views/TaxComplianceView.jsx'
import StampeView from './views/StampeView.jsx'
import * as contabilitaRepo from './data/contabilitaRepo.js'
import { registraDocumentiConfermati } from './application/contabilitaRegistrationWorkflow.js'
import { fmtCurrency as fmt, fmtDate, fmtNumber } from './ui/formatters.js'


const CONT_SIDEBAR_MENU = [
  {section:"IMPOSTAZIONI",items:[
    {id:"societa",ico:"ðŸ¢",label:"Anagrafica SocietÃ "},
    {id:"piano_conti",ico:"ðŸ—‚ï¸",label:"Piano dei Conti"},
    {id:"causali",ico:"ðŸ“‹",label:"Causali Contabili"},
    {id:"causali_iva",ico:"ðŸ’§",label:"Causali IVA"},
    {id:"percipienti",ico:"ðŸ‘”",label:"Percipienti"},
    {id:"regole",ico:"ðŸ¤–",label:"Regole AI"}
  ]},
  {section:"OPERATIVO",items:[
    {id:"da_validare",ico:"âš¡",label:"Da Validare",badge:true},
    {id:"registrate",ico:"âœ“",label:"Registrate"}
  ]},
  {section:"CONTABILITÃ€",items:[
    {id:"prima_nota",ico:"ðŸ“",label:"Prima Nota"},
    {id:"prima_nota_guidata",ico:"âœ¨",label:"Prima Nota (Guidata)"},
    {id:"corrispettivi",ico:"ðŸ§¾",label:"Corrispettivi"},
    {id:"scritture",ico:"ðŸ“’",label:"Scritture Varie"}
  ]},
  {section:"BANCHE",items:[
    {id:"movimenti_banca",ico:"ðŸ¦",label:"Movimenti"},
    {id:"riconciliazione",ico:"ðŸ”—",label:"Riconciliazione"}
  ]},
  {section:"ADEMPIMENTI",items:[
    {id:"liquidazioni_iva",ico:"ðŸ’°",label:"Liquidazioni IVA"},
    {id:"lipe",ico:"ðŸ“¤",label:"LIPE"},
    {id:"iva_annuale",ico:"ðŸ“Š",label:"IVA Annuale"},
    {id:"cu",ico:"ðŸ“œ",label:"Certificazioni Uniche"},
    {id:"ritenute",ico:"âœ‚ï¸",label:"Ritenute"},
    {id:"f770",ico:"ðŸ“‘",label:"770"},
    {id:"intrastat",ico:"ðŸŒ",label:"Intrastat"}
  ]},
  {section:"STAMPE",items:[
    {id:"registri_iva",ico:"ðŸ“–",label:"Registri IVA"},
    {id:"partitari",ico:"ðŸ’³",label:"Partitari"},
    {id:"giornale",ico:"ðŸ“°",label:"Giornale"},
    {id:"mastrini",ico:"ðŸ“š",label:"Mastrini"},
    {id:"bilancio",ico:"âš–ï¸",label:"Bilancio"}
  ]}
];

export function ModuloContabilita({ruolo}){
  const [societa,setSocieta]=useState([]);
  const [societaAttiva,setSocietaAttiva]=useState(null);
  const [loading,setLoading]=useState(true);
  const [contTab,setContTab]=useState(()=>{
    // Controlla se c'Ã¨ un sub-tab salvato dall'Hub Export
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
  
  const [pnGuidataDraft,setPnGuidataDraft]=useState(null);
  const [pnGuidataNav,setPnGuidataNav]=useState({ ids: [], idx: -1 });
  const [splitMode,setSplitMode]=useState('split'); // split, pdf, scrittura
  const [registrazioneInCorso, setRegistrazioneInCorso] = useState(false);
  
  const getDraftKey = (docId) => `pnGuidataDraft:${societaAttiva?.id || 'no_soc'}:${docId}`

  const openGuidataAt = async (doc, ids, idx) => {
    const k = getDraftKey(doc.id)
    const saved = (() => {
      try { return JSON.parse(localStorage.getItem(k) || 'null') } catch { return null }
    })()

    const hasValidSaved = saved?.meta?.builder_version === PN_GUIDATA_BUILDER_VERSION
    let computedDraft
    try {
      computedDraft = await buildInitialDraftFromDocumento(doc, {
        societaId: societaAttiva?.id,
        pianoConti,
        causaliContabili,
        causaliIva,
        clienti
      })
    } catch (e) {
      if (e instanceof ResolveIvaError) {
        const atteso = e.details?.aliquota_percent != null ? ` (aliquota ${e.details.aliquota_percent}%)` : ''
        alert(
          `Impossibile generare la prima nota guidata${atteso}:\n\n${e.message}\n\n` +
            'Configura in Impostazioni Procedure â†’ Aliquote IVA una causale predefinita per ogni aliquota usata (0, 4, 5, 10, 22).'
        )
      } else {
        console.error('[openGuidataAt] buildInitialDraftFromDocumento', e)
        alert(`Errore nella generazione della bozza:\n\n${e?.message || String(e)}`)
      }
      return
    }

    // Se esiste una bozza valida, preserva le modifiche ma allinea SEMPRE la causale IVA al draft calcolato.
    const computedIvaId = computedDraft?.meta?.causale_iva_id || null
    const initialDraft = hasValidSaved
      ? {
          ...computedDraft,
          ...saved,
          header: saved?.header || computedDraft?.header,
          rows: saved?.rows || computedDraft?.rows,
          ivaRows:
            Array.isArray(saved?.ivaRows) && saved.ivaRows.length > 0
              ? saved.ivaRows
              : (computedDraft?.ivaRows ?? []),
          ivaUi: {
            ...(computedDraft?.ivaUi || {}),
            ...(saved?.ivaUi || {}),
            causale_iva_id: computedIvaId || (saved?.ivaUi?.causale_iva_id || ''),
            multi_riepilogo: computedDraft?.ivaUi?.multi_riepilogo === true || saved?.ivaUi?.multi_riepilogo === true
          },
          meta: {
            ...(saved?.meta || {}),
            ...(computedDraft?.meta || {}),
            causale_iva_id: computedIvaId || (saved?.meta?.causale_iva_id || '')
          }
        }
      : computedDraft
    setPnGuidataDraft(initialDraft)
    // Aggiorna anche localStorage per evitare rientri incoerenti
    persistGuidataDraft(initialDraft)
    setPnGuidataNav({ ids, idx })
    setContTab('prima_nota_guidata')
  }

  const persistGuidataDraft = (draft) => {
    try {
      const docId = draft?.meta?.documento_import_id
      if (!docId) return
      localStorage.setItem(getDraftKey(docId), JSON.stringify(draft))
    } catch (e) {
      console.error('[PrimaNotaGuidata] persist draft failed', e)
    }
  }

  const gotoGuidataRelative = async (delta) => {
    const ids = pnGuidataNav.ids || []
    const idx = pnGuidataNav.idx
    const nextIdx = idx + delta
    if (nextIdx < 0 || nextIdx >= ids.length) return
    const nextDoc = documenti.find(d => d.id === ids[nextIdx])
    if (!nextDoc) return
    await openGuidataAt(nextDoc, ids, nextIdx)
  }

  // Modali
  const [modalSocieta,setModalSocieta]=useState(false);

  useEffect(()=>{caricaSocieta();},[]);
  useEffect(()=>{if(societaAttiva)caricaTutto();},[societaAttiva]);

  const caricaSocieta=async()=>{
    const{data}=await contabilitaRepo.getSocietaAttive();
    const list=data||[];
    setSocieta(list);
    if(list.length>0){
      let preferred=null;
      try{
        const saved=localStorage.getItem(LAST_SOCIETA_STORAGE_KEY);
        if(saved&&list.some(s=>s.id===saved))preferred=saved;
      }catch{/* ignore */}
      const pick=list.find(s=>s.id===(preferred||list[0].id))||list[0];
      setSocietaAttiva(pick);
    }
    setLoading(false);
  };

  const caricaTutto=async()=>{
    if(!societaAttiva)return;
    const[{data:docs},{data:pc},{data:cc},{data:ci},{data:reg},{data:pn},{data:perc},{data:cli}]=await Promise.all([
      contabilitaRepo.getDocumenti(societaAttiva.id),
      contabilitaRepo.getPianoConti(societaAttiva.id),
      contabilitaRepo.getCausali(societaAttiva.id),
      contabilitaRepo.getCausaliIvaAttive(),
      contabilitaRepo.getRegoleAutomatiche(societaAttiva.id),
      contabilitaRepo.getScrittureRecenti(societaAttiva.id),
      contabilitaRepo.getPercipientiAttivi(societaAttiva.id),
      contabilitaRepo.getClientiBase()
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

  const patchDocumento = (id, partial) => {
    setDocumenti((prev) => prev.map((d) => (d.id === id ? { ...d, ...partial } : d)))
  }

  // Conferma singola
  const confermaDoc=async(docId)=>{
    await contabilitaRepo.confirmDocumento(docId,new Date().toISOString());
    setDocumenti(prev=>prev.map(d=>d.id===docId?{...d,validation_status:'confirmed'}:d));
  };

  // Registra confermati â†’ crea scritture prima nota
  const registraConfermati=async()=>{
    if (registrazioneInCorso) return;
    const daRegistrare=documenti.filter(d=>d.validation_status==='confirmed'&&d.workflow_status!=='registered');
    if(!daRegistrare.length){alert('Nessun documento confermato da registrare');return;}
    
    if(!confirm(`Stai per registrare ${daRegistrare.length} documenti in Prima Nota.\n\nConfermi?`))return;

    setRegistrazioneInCorso(true);
    try {
      const { registrati, errors, warnings } = await registraDocumentiConfermati({
        documenti,
        societaId: societaAttiva.id,
        pianoConti,
        causaliContabili,
        causaliIva,
        clienti,
        updateDocumento: (id, updates) => contabilitaRepo.updateDocumentoContabilita(id, updates),
        trace,
        traceStep,
        traceDiff,
        traceIva,
        insertCausaleIvaMeta,
      });

      await caricaTutto();
      const failed = Array.isArray(errors) ? errors.length : 0;
      const warningsCount = Array.isArray(warnings) ? warnings.length : 0;
      let msg = `âœ… Registrati ${registrati}/${daRegistrare.length} documenti in Prima Nota`;
      if (failed) msg += `\n\nErrori: ${failed}`;
      if (warningsCount) msg += `\nAvvisi: ${warningsCount}`;
      if (warningsCount && warningsCount <= 3) {
        const warnLines = warnings
          .map((w) => `- Doc ${w.docId}: ${w.warnings.map((c) => c.message).join('; ')}`)
          .join('\n');
        msg += `\n\nDettagli avvisi:\n${warnLines}`;
      }
      alert(msg);
    } catch (e) {
      alert('Errore: ' + (e?.message || String(e)));
    } finally {
      setRegistrazioneInCorso(false);
    }
  };

  if(loading)return<div className="loading">â³ Caricamento...</div>;

  return(
    <div className="cont-layout">
      {/* Sidebar ContabilitÃ  */}
      <div className="cont-sidebar">
        {/* Selezione societÃ  */}
        <div style={{padding:'0 1rem .75rem',borderBottom:'1px solid var(--bd)'}}>
          <select value={societaAttiva?.id||''} onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s);try{if(s?.id)localStorage.setItem(LAST_SOCIETA_STORAGE_KEY,s.id);}catch{/* ignore */}}} style={{width:'100%',fontSize:'.78rem'}}>
            {societa.length===0&&<option value="">Nessuna societÃ </option>}
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
          <div className="empty"><div className="empty-ico">ðŸ¢</div><div className="empty-t">Seleziona o crea una societÃ </div></div>
        ):(
          <>
            <PrimaNotaHubView
              contTab={contTab}
              documenti={documenti}
              scritture={scritture}
              pianoConti={pianoConti}
              causaliIva={causaliIva}
              causaliContabili={causaliContabili}
              clienti={clienti}
              societaAttiva={societaAttiva}
              stats={stats}
              caricaTutto={caricaTutto}
              patchDocumento={patchDocumento}
              confermaDoc={confermaDoc}
              registraConfermati={registraConfermati}
              registrazioneInCorso={registrazioneInCorso}
              openGuidataAt={openGuidataAt}
              pnGuidataDraft={pnGuidataDraft}
              pnGuidataNav={pnGuidataNav}
              gotoGuidataRelative={gotoGuidataRelative}
              setPnGuidataDraft={setPnGuidataDraft}
              persistGuidataDraft={persistGuidataDraft}
            />

            <AnagraficheContabiliView
              contTab={contTab}
              societaAttiva={societaAttiva}
              pianoConti={pianoConti}
              causaliContabili={causaliContabili}
              causaliIva={causaliIva}
              caricaTutto={caricaTutto}
            />

            <BankingView contTab={contTab} societaAttiva={societaAttiva} setContTab={setContTab} />

            <StampeView
              contTab={contTab}
              societaAttiva={societaAttiva}
              scritture={scritture}
              pianoConti={pianoConti}
              causaliIva={causaliIva}
            />

            <TaxComplianceView
              contTab={contTab}
              societaAttiva={societaAttiva}
              scritture={scritture}
              causaliIva={causaliIva}
              caricaTutto={caricaTutto}
            />

            {/* Placeholder per altri moduli */}
            {['regole','scritture','cu'].includes(contTab)&&(
              <div className="card" style={{padding:'2rem',textAlign:'center'}}>
                <div style={{fontSize:'2.5rem',marginBottom:'.5rem'}}>ðŸš§</div>
                <div style={{fontSize:'1rem',fontWeight:600}}>Modulo in sviluppo</div>
                <div style={{fontSize:'.8rem',color:'var(--mu)',marginTop:'.25rem'}}>Questa sezione sarÃ  disponibile a breve</div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modali */}
      {modalSocieta&&<ModalNuovaSocieta onSave={async(d)=>{const{data:ns}=await contabilitaRepo.insertSocieta(d);await caricaSocieta();setModalSocieta(false);return ns;}} onClose={()=>setModalSocieta(false)}/>}
    </div>
  );
}


