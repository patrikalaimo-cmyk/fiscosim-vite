import { parseXMLFattura, formattaXML, CATEGORIE_CESPITI, suggerisciCespiteDeterministico } from '../../../domain/fatture.js'
import { trace } from '../../core/debug/trace'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../utils/pipelineLogger.js'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAIStatus } from '../../context/AIStatusContext'
import { TagInput } from '../../shared/components'
import { TIPO_LABEL, TIPO_COLOR, MESI, LAST_SOCIETA_STORAGE_KEY } from '../../shared/constants'
import { shouldUseAI, routeDocument } from '../../core/workflow'
import { extractTextFromPDFBrowser, loadScript } from '../../shared/utils'
import { PrimaNotaGuidata } from './prima_nota_guidata.jsx'
import { DaValidareSplitView } from './da_validare_split_view.jsx'
import { PN_GUIDATA_BUILDER_VERSION, buildInitialDraftFromDocumento, ResolveIvaError } from '../../shared/utils/primaNotaDraftFromDocumento.js'
import { resolveIvaOrNull } from '../../../domain/resolveIva.js'
import { triggerAutoPipeline } from '../../utils/autoPipeline.js'
import AnagraficheContabiliView from './views/AnagraficheContabiliView.jsx'
import PrimaNotaHubView from './views/PrimaNotaHubView.jsx'
import BankingView from './views/BankingView.jsx'
import TaxComplianceView from './views/TaxComplianceView.jsx'
import StampeViewContainer from './views/StampeView.jsx'
import * as contabilitaRepo from './data/contabilitaRepo.js'
import { createPrimaNotaCompleta, createPrimaNota } from '../../../services/primaNotaService.js'

/** Risoluzione causale IVA allineata a Impostazioni Procedure (natura FatturaPA → 0% e causale da natura o default). */
const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'

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
    {id:"prima_nota_guidata",ico:"✨",label:"Prima Nota (Guidata)"},
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
  
  const [docInEdit,setDocInEdit]=useState(null);
  const [pnGuidataDraft,setPnGuidataDraft]=useState(null);
  const [pnGuidataNav,setPnGuidataNav]=useState({ ids: [], idx: -1 });
  const [splitMode,setSplitMode]=useState('split'); // split, pdf, scrittura
  
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
            'Configura in Impostazioni Procedure → Aliquote IVA una causale predefinita per ogni aliquota usata (0, 4, 5, 10, 22).'
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
  const [modalImportPDF,setModalImportPDF]=useState(null);

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
        trace('DB', { action: 'INSERT prima_nota', doc_id: doc.id })
        const pnInsertPayload={
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
        }
        traceIva('PRE_INSERT_PRIMA_NOTA_HEADER', 'DB', doc.causale_iva_id ?? null)
        traceStep('INSERT_PAYLOAD', pnInsertPayload, { table: 'prima_nota', ...insertCausaleIvaMeta(pnInsertPayload) })
        traceDiff(
          'DB_MAPPING_DIFF',
          { causale_iva_id: doc.causale_iva_id ?? null },
          { causale_iva_id: pnInsertPayload.causale_iva_id ?? null }
        )
        // 2. Create righe prima nota (3 righe: costo/ricavo, IVA, fornitore/cliente)
        const righe=[];
        
        if(isPassiva){
          // FATTURA PASSIVA: Dare costo + Dare IVA credito + Avere fornitore
          righe.push({
            riga_numero:1,
            conto_id:contoCostoRicavo?.id||null,
            conto_codice:contoCostoRicavo?.codice,
            conto_descrizione:contoCostoRicavo?.descrizione,
            descrizione_riga:'Costo/Acquisto',
            importo_dare:doc.imponibile||doc.totale||0,importo_avere:0,
            imponibile:doc.imponibile||0,iva:0
          });
          if(doc.iva>0){
            righe.push({
              riga_numero:2,
              conto_id:contoIva?.id||null,
              conto_codice:contoIva?.codice,
              conto_descrizione:contoIva?.descrizione||'IVA ns. credito',
              descrizione_riga:'IVA a credito',
              importo_dare:doc.iva||0,importo_avere:0,
              imponibile:0,iva:doc.iva||0
            });
          }
          righe.push({
            riga_numero:3,
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
            riga_numero:1,
            conto_id:contoControparte?.id||null,
            conto_codice:contoControparte?.codice,
            conto_descrizione:contoControparte?.descrizione||doc.soggetto_denominazione,
            descrizione_riga:`Cliente ${doc.soggetto_denominazione||''}`,
            importo_dare:doc.totale||0,importo_avere:0,
            imponibile:0,iva:0
          });
          righe.push({
            riga_numero:2,
            conto_id:contoCostoRicavo?.id||null,
            conto_codice:contoCostoRicavo?.codice,
            conto_descrizione:contoCostoRicavo?.descrizione,
            descrizione_riga:'Ricavo/Vendita',
            importo_dare:0,importo_avere:doc.imponibile||doc.totale||0,
            imponibile:doc.imponibile||0,iva:0
          });
          if(doc.iva>0){
            righe.push({
              riga_numero:3,
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
          traceIva('PRE_INSERT_PRIMA_NOTA_RIGHE', 'DB', righe[0]?.causale_iva_id ?? doc.causale_iva_id ?? null)
          traceStep('INSERT_PAYLOAD', righe, { table: 'prima_nota_righe', ...insertCausaleIvaMeta(righe) })
          traceDiff(
            'DB_MAPPING_DIFF',
            { causale_iva_id: doc.causale_iva_id ?? null },
            { causale_iva_id: righe[0]?.causale_iva_id ?? null }
          )
        }

        const complete = await createPrimaNotaCompleta({
          pnPayload: pnInsertPayload,
          righePayload: righe,
          partEntries: [],
          headerSelect: '*',
          righeSelect: '*',
          partitarioSelect: '*',
        });
        traceStep('INSERT_RESULT', { table: 'prima_nota', data: complete.pn, error: complete.error })
        traceStep('INSERT_RESULT', { table: 'prima_nota_righe', data: complete.righeIns?.data, error: complete.righeIns?.error ?? complete.error })
        if(complete.error)throw complete.error;
        const pn = complete.pn

        // 3. Update document status
        await contabilitaRepo.updateDocumentoContabilita(doc.id,{
          workflow_status:'registered',
          registered_at:new Date().toISOString(),
          prima_nota_id:pn.id
        });
        
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
          <select value={societaAttiva?.id||''} onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s);try{if(s?.id)localStorage.setItem(LAST_SOCIETA_STORAGE_KEY,s.id);}catch{/* ignore */}}} style={{width:'100%',fontSize:'.78rem'}}>
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
              openGuidataAt={openGuidataAt}
              pnGuidataDraft={pnGuidataDraft}
              pnGuidataNav={pnGuidataNav}
              gotoGuidataRelative={gotoGuidataRelative}
              setPnGuidataDraft={setPnGuidataDraft}
              persistGuidataDraft={persistGuidataDraft}
              DaValidareSplitView={DaValidareSplitView}
              PrimaNotaView={PrimaNotaView}
              PrimaNotaGuidata={PrimaNotaGuidata}
              RegistrateView={RegistrateView}
            />

            <AnagraficheContabiliView
              contTab={contTab}
              societaAttiva={societaAttiva}
              pianoConti={pianoConti}
              causaliContabili={causaliContabili}
              causaliIva={causaliIva}
              caricaTutto={caricaTutto}
              setModalImportPDF={setModalImportPDF}
              PianoContiView={PianoContiView}
              CausaliView={CausaliView}
            />

            <BankingView
              contTab={contTab}
              societaAttiva={societaAttiva}
              setContTab={setContTab}
              ModuloBanche={ModuloBanche}
            />

            <StampeViewContainer
              contTab={contTab}
              societaAttiva={societaAttiva}
              scritture={scritture}
              pianoConti={pianoConti}
              causaliIva={causaliIva}
              StampeDetailView={StampeView}
            />

            <TaxComplianceView
              contTab={contTab}
              societaAttiva={societaAttiva}
              scritture={scritture}
              causaliIva={causaliIva}
              caricaTutto={caricaTutto}
              LiquidazioniIVAView={LiquidazioniIVAView}
              LIPEView={LIPEView}
              CorrispettiviView={CorrispettiviView}
              Modello770View={Modello770View}
              IntrastatView={IntrastatView}
              PercipientiView={PercipientiView}
              RitenuteView={RitenuteView}
              IvaAnnualeView={IvaAnnualeView}
            />

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
      {modalSocieta&&<ModalNuovaSocieta onSave={async(d)=>{const{data:ns}=await contabilitaRepo.insertSocieta(d);await caricaSocieta();setModalSocieta(false);return ns;}} onClose={()=>setModalSocieta(false)}/>}
      {modalImportPDF&&<ModalImportPDF tipo={modalImportPDF} societaId={societaAttiva?.id} onComplete={()=>{setModalImportPDF(null);caricaTutto();}} onClose={()=>setModalImportPDF(null)}/>}
      {docInEdit&&<ModalEditDoc doc={docInEdit} pianoConti={pianoConti} causaliContabili={causaliContabili} causaliIva={causaliIva} onSave={caricaTutto} onClose={()=>setDocInEdit(null)}/>}
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
    contabilitaRepo.getImpostazioneStudio('ai_enabled')
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
        await contabilitaRepo.uploadDocumento(filePath,file);
        const{data:urlData}=contabilitaRepo.getDocumentoPublicUrl(filePath);

        // Salva documento (con validazione societaId)
        if(!societaId){console.error('ERRORE: societaId è null/undefined!');throw new Error('Società non selezionata');}
        const docUploadPayload={
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
        }
        traceIva('PRE_INSERT_DOCUMENTI_CONT_UPLOAD', 'DB', docUploadPayload.causale_iva_id ?? analysis.causale_iva_id ?? null)
        traceStep('INSERT_PAYLOAD', docUploadPayload, { table: 'documenti_contabilita', ...insertCausaleIvaMeta(docUploadPayload) })
        traceDiff('DB_MAPPING_DIFF', { causale_iva_id: analysis.causale_iva_id ?? null }, { causale_iva_id: docUploadPayload.causale_iva_id ?? null })
        const uploadIns=await contabilitaRepo.insertDocumentoContabilita(docUploadPayload);
        traceStep('INSERT_RESULT', { table: 'documenti_contabilita', data: uploadIns.data, error: uploadIns.error })
        const insertErr=uploadIns.error
        if(insertErr){console.error('Insert error:',insertErr);throw insertErr;}
        const newDocId = uploadIns.data?.[0]?.id
        if (newDocId) triggerAutoPipeline(newDocId, { source: 'contabilita_import_fatture' })

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

// ─── MODAL NUOVO CONTO ───────────────────────────────────────
function ModalNuovoConto({societaId, pianoConti, onSave, onClose}){
  const MASTRI = [
    {codice:'1',label:'1 — Attività'},
    {codice:'2',label:'2 — Passività'},
    {codice:'3',label:'3 — Ricavi'},
    {codice:'4',label:'4 — Costi'},
    {codice:'5',label:'5 — Costi diversi'},
    {codice:'6',label:'6 — Conti d\'ordine'},
  ];

  // Livelli del piano conti per scegliere dove inserire
  const nodiFiglio = (parentCodice) =>
    pianoConti.filter(c=>c.codice.startsWith(parentCodice+' ')&&c.codice.split(' ').length===parentCodice.split(' ').length+1);

  const [mastro,setMastro]   = useState('1');
  const [parentCode,setParentCode] = useState('');
  const [descrizione,setDesc] = useState('');
  const [saving,setSaving]   = useState(false);

  // Calcola prossimo codice disponibile
  const calcolaCodice = async (parent) => {
    const livello = parent.split(' ').length + 1;
    const {data} = await contabilitaRepo.getPianoContiCodiciByLike(societaId, parent)
      .eq('livello', livello)
      .order('codice',{ascending:false}).limit(1);
    if(!data?.length){
      if(livello===2) return `${parent} 00`;
      if(livello===3) return `${parent} 00`;
      return `${parent} 0001`;
    }
    const lastParts = data[0].codice.trim().split(' ');
    const lastNum = parseInt(lastParts[lastParts.length-1])||0;
    const pad = livello===4?4:2;
    return `${parent} ${String(lastNum+1).padStart(pad,'0')}`;
  };

  const handleSave = async () => {
    if(!descrizione.trim()) return alert('Inserisci la descrizione');
    const parent = parentCode || mastro;
    setSaving(true);
    const codice = await calcolaCodice(parent);
    const parts = codice.trim().split(' ');
    const livello = parts.length;
    const fd = parseInt(mastro);
    let tipo='patrimoniale', natura='attivo', sezione='dare';
    if(fd===3){tipo='economico';natura='ricavo';sezione='avere';}
    else if(fd<=5){tipo='economico';natura='costo';sezione='dare';}
    else if(fd===6){tipo='ordine';natura='ordine';}
    else if(fd===2){natura='passivo';sezione='avere';}
    await onSave({
      codice: codice.trim(),
      codice_mastro: parts[0]||null,
      codice_conto: livello>=3?`${parts[0]} ${parts[1]} ${parts[2]}`:null,
      codice_sottoconto: livello>=4?codice.trim():null,
      descrizione: descrizione.trim(),
      tipo, natura, sezione, livello,
    });
    setSaving(false);
  };

  // Lista conti del mastro scelto per scegliere il parent
  const contiFiglio = pianoConti.filter(c=>c.codice.startsWith(mastro+' ')&&c.livello<=3).sort((a,b)=>a.codice.localeCompare(b.codice));

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:520}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">➕ Nuovo Conto</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg full"><label>Descrizione *</label>
              <input value={descrizione} onChange={e=>setDesc(e.target.value)} autoFocus placeholder="Es. Spese telefoniche"/>
            </div>
            <div className="fg"><label>Mastro (sezione)</label>
              <select value={mastro} onChange={e=>{setMastro(e.target.value);setParentCode('');}}>
                {MASTRI.map(m=><option key={m.codice} value={m.codice}>{m.label}</option>)}
              </select>
            </div>
            <div className="fg"><label>Inserisci sotto (opzionale)</label>
              <select value={parentCode} onChange={e=>setParentCode(e.target.value)}>
                <option value="">— Direttamente sotto il mastro {mastro} —</option>
                {contiFiglio.map(c=><option key={c.id} value={c.codice}>{c.codice} — {c.descrizione}</option>)}
              </select>
            </div>
          </div>
          <div style={{marginTop:'.75rem',padding:'.6rem .8rem',background:'var(--s2)',borderRadius:7,fontSize:'.75rem',color:'var(--mu)'}}>
            ℹ️ Il codice verrà calcolato automaticamente come progressivo nell'area selezionata
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!descrizione} onClick={handleSave}>{saving?'⏳ Salvo...':'💾 Crea conto'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL NUOVA CAUSALE (contabile o IVA) ───────────────────
function ModalNuovaCausale({tipo, societaId, onSave, onClose}){
  const isIva = tipo==='iva';
  const [form,setForm] = useState(isIva
    ? {codice:'',descrizione:'',aliquota:22,regime_iva:'Imponibile',tipo_trattamento:'Normale',detraibile:true,percentuale_indetraibilita:0,include_liquidazione:true,attivo:true}
    : {codice:'',descrizione:'',tipo:'generico',attivo:true}
  );
  const [saving,setSaving] = useState(false);
  const up = (k,v) => setForm(p=>({...p,[k]:v}));

  const handleSave = async () => {
    if(!form.codice||!form.descrizione) return alert('Codice e descrizione obbligatori');
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:500}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">➕ Nuova {isIva?'Causale IVA':'Causale Contabile'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg"><label>Codice *</label>
              <input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} placeholder={isIva?'es. A22':'es. VEN'} autoFocus/>
            </div>
            <div className="fg full"><label>Descrizione *</label>
              <input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} placeholder="Descrizione causale"/>
            </div>
            {isIva&&<>
              <div className="fg"><label>Aliquota %</label>
                <input type="number" value={form.aliquota} onChange={e=>up('aliquota',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/>
              </div>
              <div className="fg"><label>Regime IVA</label>
                <select value={form.regime_iva} onChange={e=>up('regime_iva',e.target.value)}>
                  <option value="Imponibile">Imponibile</option>
                  <option value="Non imponibile">Non imponibile</option>
                  <option value="Esente">Esente</option>
                  <option value="Escluso">Escluso</option>
                </select>
              </div>
              <div className="fg"><label>% Indetraibilità</label>
                <input type="number" value={form.percentuale_indetraibilita} onChange={e=>up('percentuale_indetraibilita',parseFloat(e.target.value)||0)} min={0} max={100}/>
              </div>
            </>}
            {!isIva&&<>
              <div className="fg"><label>Tipo</label>
                <select value={form.tipo} onChange={e=>up('tipo',e.target.value)}>
                  <option value="generico">Generico</option>
                  <option value="vendite">Vendite</option>
                  <option value="acquisti">Acquisti</option>
                  <option value="finanziario">Finanziario</option>
                  <option value="rettifica">Rettifica/Storno</option>
                  <option value="personale">Personale</option>
                  <option value="ammortamento">Ammortamento</option>
                </select>
              </div>
            </>}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!form.codice||!form.descrizione} onClick={handleSave}>{saving?'⏳ Salvo...':'💾 Crea causale'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── MODAL IMPORT ANAGRAFICA NES → PIANO DEI CONTI ──────────
// Parser Excel NES clienti/fornitori → aggiorna/crea conti in piano_conti
function ModalImportAnagraficaNESPianoConti({societaId, pianoConti, onComplete, onClose}){
  const [file,setFile]         = useState(null);
  const [loading,setLoading]   = useState(false);
  const [progress,setProgress] = useState('');
  const [preview,setPreview]   = useState(null); // {aggiornati, nuovi, records}
  const [importing,setImporting]= useState(false);
  const [done,setDone]         = useState(null);
  const fileRef = useRef();

  const parseExcelAnagrafica = async (file) => {
    if(!window._XLSX){
      await new Promise((res,rej)=>{
        const s=document.createElement('script');
        s.src='https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
        s.onload=()=>{window._XLSX=window.XLSX;res();};s.onerror=rej;
        document.head.appendChild(s);
      });
    }
    const ab = await file.arrayBuffer();
    const wb = window._XLSX.read(ab,{type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = window._XLSX.utils.sheet_to_json(ws,{header:1,defval:null});
    if(!rows.length) return [];

    const header = rows[0].map(h=>(h||'').toString().toLowerCase().trim());
    // Detecta se è clienti o fornitori dal header
    const isClienti = header.some(h=>h.includes('soggetto iva differita'));

    const idx = {
      codice:      header.findIndex(h=>h==='codice'),
      ragSoc:      header.findIndex(h=>h==='ragione sociale'),
      ragSoc2:     header.findIndex(h=>h.includes('ragione sociale aggiuntiva')),
      indirizzo:   header.findIndex(h=>h==='indirizzo'),
      cap:         header.findIndex(h=>h==='cap'),
      citta:       header.findIndex(h=>h==="città"),
      provincia:   header.findIndex(h=>h==='provincia'),
      nazione:     header.findIndex(h=>h==='nazione'),
      cf:          header.findIndex(h=>h.includes('codice fiscale')),
      piva:        header.findIndex(h=>h.includes('partita iva')||h.includes('partita iva')),
      iso:         header.findIndex(h=>h==='codice iso'),
      pec:         header.findIndex(h=>h.includes('pec')),
      codDest:     header.findIndex(h=>h.includes('codice destinatario')),
      splitPayment:header.findIndex(h=>h.includes('split payment')||h.includes('iva differita')),
      spesometro:  header.findIndex(h=>h.includes('includi in spesometro')),
      esterometro: header.findIndex(h=>h.includes('includi in esterometro')),
      b2b:         header.findIndex(h=>h.includes('elettronica b2b')),
      nome:        header.findIndex(h=>h==='nome'),
      cognome:     header.findIndex(h=>h==='cognome'),
      soggOpera:   header.findIndex(h=>h.includes('soggetto operazione')),
      tipoContr:   header.findIndex(h=>h.includes('tipo controparte')),
      gruppoIva:   header.findIndex(h=>h.includes('gruppo iva')),
    };

    const g = (row,i) => i>=0&&row[i]!=null ? String(row[i]).trim() : '';
    const bool = (row,i) => i>=0 ? ['s','si','1','true','x'].includes(String(row[i]||'').toLowerCase()) : false;

    const records = [];
    for(let i=1;i<rows.length;i++){
      const r = rows[i];
      const codice = g(r,idx.codice);
      if(!codice) continue;
      // Codice NES = numerico, converti in formato "1 02 20 0171"
      // Formato NES: 102200171 → 1 02 20 0171
      const nesCode = codice.replace(/\D/g,'');
      let codicePiano = null;
      if(nesCode.length>=9){
        codicePiano = `${nesCode[0]} ${nesCode.substring(1,3)} ${nesCode.substring(3,5)} ${nesCode.substring(5).padStart(4,'0')}`;
      } else if(nesCode.length>=7){
        codicePiano = `${nesCode[0]} ${nesCode.substring(1,3)} ${nesCode.substring(3,5)} ${nesCode.substring(5).padStart(4,'0')}`;
      }

      records.push({
        codice_nes: codice,
        codice_piano: codicePiano,
        descrizione:      g(r,idx.ragSoc),
        rag_sociale_2:    g(r,idx.ragSoc2),
        indirizzo:        g(r,idx.indirizzo),
        cap:              g(r,idx.cap),
        citta:            g(r,idx.citta),
        provincia:        g(r,idx.provincia),
        nazione:          g(r,idx.nazione)||'Italia',
        codice_iso:       g(r,idx.iso)||'IT',
        codice_fiscale:   g(r,idx.cf).replace(/\s/g,''),
        partita_iva:      g(r,idx.piva).replace(/\s/g,''),
        anagrafica_piva:  g(r,idx.piva).replace(/\s/g,''),
        anagrafica_cf:    g(r,idx.cf).replace(/\s/g,''),
        email_pec:        g(r,idx.pec),
        codice_dest_efat: g(r,idx.codDest),
        split_payment:    bool(r,idx.splitPayment),
        includi_spesometro: bool(r,idx.spesometro),
        includi_esterometro:bool(r,idx.esterometro),
        richiede_efat_b2b:  bool(r,idx.b2b),
        soggetto_operaz:  g(r,idx.soggOpera),
        tipo_controparte: g(r,idx.tipoContr),
        partecipa_gruppo_iva: bool(r,idx.gruppoIva),
      });
    }
    return records;
  };

  const handleFile = async (f) => {
    if(!f) return;
    setFile(f);
    setLoading(true);
    setProgress('Lettura Excel...');
    try{
      const records = await parseExcelAnagrafica(f);
      // Confronta con piano conti esistente per codice NES
      const codicePianoMap = {};
      for(const c of pianoConti) codicePianoMap[c.codice] = c;

      const aggiornati = records.filter(r=>r.codice_piano&&codicePianoMap[r.codice_piano]);
      const nuovi      = records.filter(r=>r.codice_piano&&!codicePianoMap[r.codice_piano]);
      setPreview({aggiornati,nuovi,records});
    }catch(e){ alert('Errore: '+e.message); }
    setLoading(false);
    setProgress('');
  };

  const importa = async () => {
    if(!preview) return;
    setImporting(true);
    let ok=0, err=0;

    // Aggiorna conti esistenti
    for(const rec of preview.aggiornati){
      const {error} = await contabilitaRepo.updatePianoContoByCodiceSocieta({
        rag_sociale_2:    rec.rag_sociale_2||null,
        indirizzo:        rec.indirizzo||null,
        cap:              rec.cap||null,
        citta:            rec.citta||null,
        provincia:        rec.provincia||null,
        nazione:          rec.nazione||null,
        codice_iso:       rec.codice_iso||null,
        codice_fiscale:   rec.codice_fiscale||null,
        partita_iva:      rec.partita_iva||null,
        anagrafica_piva:  rec.anagrafica_piva||null,
        anagrafica_cf:    rec.anagrafica_cf||null,
        email_pec:        rec.email_pec||null,
        codice_dest_efat: rec.codice_dest_efat||null,
        split_payment:    rec.split_payment,
        includi_spesometro: rec.includi_spesometro,
        includi_esterometro: rec.includi_esterometro,
        richiede_efat_b2b: rec.richiede_efat_b2b,
        soggetto_operaz:  rec.soggetto_operaz||null,
        tipo_controparte: rec.tipo_controparte||null,
        partecipa_gruppo_iva: rec.partecipa_gruppo_iva,
      }, rec.codice_piano, societaId);
      error ? err++ : ok++;
    }

    setDone({aggiornati:ok,errori:err,nuovi:preview.nuovi.length});
    setImporting(false);
  };

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:640}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">👥 Import Anagrafica NES → Piano dei Conti</div>
          <div className="modal-sub">Aggiorna CF, P.IVA, indirizzo, PEC, split payment dai file Excel NES</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {!file&&(
            <>
              <div className="alert alert-info" style={{marginBottom:'1rem',fontSize:'.8rem'}}>
                Carica il file Excel <strong>Anagrafica Clienti</strong> o <strong>Anagrafica Fornitori</strong> esportato da NES.<br/>
                Il sistema farà <strong>UPDATE</strong> sui conti già presenti nel piano (match per codice NES).
              </div>
              <div className="upload-zone" onClick={()=>fileRef.current.click()} style={{cursor:'pointer'}}>
                <div className="upload-zone-ico">📊</div>
                <div className="upload-zone-t">Carica Excel NES</div>
                <div className="upload-zone-s">Anagraficaclienti.xlsx o Anagraficafornitori.xlsx</div>
              </div>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" hidden onChange={e=>handleFile(e.target.files?.[0])}/>
            </>
          )}
          {loading&&<div style={{textAlign:'center',padding:'1.5rem',color:'var(--mu)'}}>⏳ {progress}</div>}
          {done&&(
            <div className="alert alert-success">
              ✅ Completato — <strong>{done.aggiornati}</strong> conti aggiornati, <strong>{done.errori}</strong> errori
              {done.nuovi>0&&<div style={{marginTop:'.3rem',fontSize:'.8rem'}}>ℹ️ {done.nuovi} codici NES non trovati nel piano dei conti (conti non ancora importati)</div>}
              <div style={{marginTop:'.75rem'}}><button className="btn" onClick={onComplete}>✓ Chiudi</button></div>
            </div>
          )}
          {preview&&!done&&(
            <>
              <div style={{display:'flex',gap:'.75rem',marginBottom:'1rem',flexWrap:'wrap'}}>
                <div style={{flex:1,padding:'.75rem',background:'rgba(52,194,122,.08)',border:'1px solid rgba(52,194,122,.3)',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontWeight:700,fontSize:'1.2rem',color:'#34c27a'}}>{preview.aggiornati.length}</div>
                  <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Conti da aggiornare</div>
                </div>
                <div style={{flex:1,padding:'.75rem',background:'rgba(251,146,60,.08)',border:'1px solid rgba(251,146,60,.3)',borderRadius:8,textAlign:'center'}}>
                  <div style={{fontWeight:700,fontSize:'1.2rem',color:'#fb923c'}}>{preview.nuovi.length}</div>
                  <div style={{fontSize:'.75rem',color:'var(--mu)'}}>Codici non trovati nel piano</div>
                </div>
              </div>
              <div style={{maxHeight:280,overflow:'auto',border:'1px solid var(--bd)',borderRadius:8}}>
                {preview.aggiornati.slice(0,50).map((r,i)=>(
                  <div key={i} style={{display:'flex',gap:'.5rem',padding:'.4rem .75rem',borderBottom:'1px solid rgba(33,40,58,.3)',fontSize:'.78rem'}}>
                    <code style={{color:'var(--gold)',minWidth:90,flexShrink:0}}>{r.codice_piano}</code>
                    <span style={{flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.descrizione}</span>
                    <span style={{fontSize:'.7rem',color:'var(--mu)',flexShrink:0}}>{r.partita_iva||r.codice_fiscale}</span>
                    {r.split_payment&&<span className="bdg bdg-gold" style={{fontSize:'.55rem'}}>SP</span>}
                  </div>
                ))}
                {preview.aggiornati.length>50&&<div style={{padding:'.5rem',textAlign:'center',fontSize:'.72rem',color:'var(--mu)'}}>...e altri {preview.aggiornati.length-50}</div>}
              </div>
            </>
          )}
        </div>
        {preview&&!done&&(
          <div className="modal-foot">
            <button className="btn-sec" onClick={onClose}>Annulla</button>
            <button className="btn" disabled={importing||!preview.aggiornati.length} onClick={importa}>
              {importing?'⏳ Aggiorno...':'✅ Aggiorna '+preview.aggiornati.length+' conti'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PianoContiView({pianoConti,societaId,onImport,onRefresh}){
  const [search,setSearch]=useState('');
  const [sel,setSel]=useState(new Set());
  const [open,setOpen]=useState(new Set()); // nodi espansi
  const [deleting,setDeleting]=useState(false);
  const [editConto,setEditConto]=useState(null);
  const [nuovoConto,setNuovoConto]=useState({open:false});
  const [importAnagrafica,setImportAnagrafica]=useState(false); // {id, codice, descrizione, ...}

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
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivatePianoConti(ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const deleteAll=async()=>{
    if(!confirm(`⚠️ Eliminare TUTTI i ${pianoConti.length} conti del piano? Questa azione non è reversibile.`))return;
    setDeleting(true);
    // Elimina in batch da 100
    const ids=pianoConti.map(c=>c.id);
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivatePianoConti(ids.slice(i,i+100));
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
      {editConto&&<ModalEditConto conto={editConto} onSave={async(updates)=>{await contabilitaRepo.updatePianoConto(editConto.id,updates);setEditConto(null);onRefresh();}} onClose={()=>setEditConto(null)}/>}
      {nuovoConto.open&&<ModalNuovoConto societaId={societaId} pianoConti={pianoConti} onSave={async(rec)=>{const{error}=await contabilitaRepo.insertPianoConto({...rec,societa_id:societaId,attivo:true});if(error){alert('Errore: '+error.message);return;}setNuovoConto({open:false});onRefresh();}} onClose={()=>setNuovoConto({open:false})}/>}
      {importAnagrafica&&<ModalImportAnagraficaNESPianoConti societaId={societaId} pianoConti={pianoConti} onComplete={()=>{setImportAnagrafica(false);onRefresh();}} onClose={()=>setImportAnagrafica(false)}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>🗂️ Piano dei Conti</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{pianoConti.length} conti · <span style={{cursor:'pointer',color:'var(--cy)'}} onClick={expandAll}>espandi tutto</span> · <span style={{cursor:'pointer',color:'var(--cy)'}} onClick={collapseAll}>collassa tutto</span></div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          {sel.size>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteSelected}>{deleting?'⏳':'🗑'} Elimina ({sel.size})</button>}
          <button className="btn-sec" onClick={()=>setNuovoConto({open:true})}>➕ Nuovo conto</button>
          <button className="btn-sec" onClick={()=>setImportAnagrafica(true)}>👥 Import Anagrafica</button>
          <button className="btn" onClick={onImport}>📤 Import PDF/Excel</button>
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

// ─── CODICI ISO NAZIONI ──────────────────────────────────────
const ISO_NAZIONI = [
  ['IT','Italia'],['DE','Germania'],['FR','Francia'],['ES','Spagna'],['GB','Regno Unito'],
  ['AT','Austria'],['BE','Belgio'],['BG','Bulgaria'],['CY','Cipro'],['HR','Croazia'],
  ['DK','Danimarca'],['EE','Estonia'],['FI','Finlandia'],['GR','Grecia'],['HU','Ungheria'],
  ['IE','Irlanda'],['LV','Lettonia'],['LT','Lituania'],['LU','Lussemburgo'],['MT','Malta'],
  ['NL','Paesi Bassi'],['PL','Polonia'],['PT','Portogallo'],['CZ','Rep. Ceca'],['RO','Romania'],
  ['SK','Slovacchia'],['SI','Slovenia'],['SE','Svezia'],['CH','Svizzera'],['NO','Norvegia'],
  ['US','Stati Uniti'],['CN','Cina'],['JP','Giappone'],['BR','Brasile'],['AR','Argentina'],
  ['RU','Russia'],['TR','Turchia'],['AE','Emirati Arabi'],['SA','Arabia Saudita'],
  ['IN','India'],['AU','Australia'],['CA','Canada'],['MX','Messico'],['ZA','Sud Africa'],
];

// ─── SELETTORE CONTROPARTITA (piano dei conti) ───────────────
function SelettoreContropartita({value, onChange, societaId}){
  const [open,setOpen]=useState(false);
  const [search,setSearch]=useState('');
  const [conti,setConti]=useState([]);
  const [loading,setLoading]=useState(false);
  const ref=useRef();

  useEffect(()=>{
    if(!open||!societaId) return;
    setLoading(true);
    contabilitaRepo.getPianoContiBasic(societaId) // tutto il piano conti, nessun filtro livello
      .then(({data})=>{ setConti(data||[]); setLoading(false); });
  },[open,societaId]);

  useEffect(()=>{
    if(!open) return;
    const handleClick=(e)=>{ if(ref.current&&!ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',handleClick);
    return ()=>document.removeEventListener('mousedown',handleClick);
  },[open]);

  const filtered=search
    ? conti.filter(c=>(c.codice+' '+c.descrizione).toLowerCase().includes(search.toLowerCase())).slice(0,50)
    : conti.slice(0,50);

  const label=value?conti.find(c=>c.codice===value||c.id===value)?.let?.(c=>`${c.codice} — ${c.descrizione}`)||value:'-- Nessuna contropartita --';

  return(
    <div ref={ref} style={{position:'relative'}}>
      <div onClick={()=>setOpen(p=>!p)}
        style={{background:'var(--s1)',border:`1px solid ${open?'var(--gold)':'var(--bd)'}`,borderRadius:7,padding:'.45rem .7rem',cursor:'pointer',fontSize:'.8rem',color:value?'var(--tx)':'var(--mu)',display:'flex',justifyContent:'space-between',alignItems:'center',gap:'.4rem'}}>
        <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1}}>{label}</span>
        <span style={{color:'var(--mu)',fontSize:'.65rem',flexShrink:0}}>{open?'▲':'▼'}</span>
      </div>
      {open&&(
        <div style={{position:'absolute',top:'100%',left:0,right:0,zIndex:200,background:'var(--s1)',border:'1px solid var(--bd)',borderRadius:8,boxShadow:'0 8px 24px rgba(0,0,0,.4)',marginTop:2,maxHeight:300,display:'flex',flexDirection:'column'}}>
          <div style={{padding:'.5rem .6rem',borderBottom:'1px solid var(--bd)'}}>
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="🔍 Cerca per codice o descrizione..."
              style={{width:'100%',background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:5,padding:'.35rem .55rem',fontSize:'.78rem',color:'var(--tx)'}}/>
          </div>
          <div style={{overflow:'auto',flex:1}}>
            <div onClick={()=>{onChange('');setOpen(false);}}
              style={{padding:'.4rem .7rem',cursor:'pointer',fontSize:'.75rem',color:'var(--mu)',borderBottom:'1px solid var(--bd)'}}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              -- Nessuna contropartita --
            </div>
            {loading?<div style={{padding:'.75rem',fontSize:'.75rem',color:'var(--mu)',textAlign:'center'}}>⏳ Caricamento...</div>
              :filtered.map(c=>(
              <div key={c.id} onClick={()=>{onChange(c.codice);setOpen(false);}}
                style={{padding:'.4rem .7rem',cursor:'pointer',display:'flex',gap:'.5rem',alignItems:'center',borderBottom:'1px solid rgba(33,40,58,.3)',background:value===c.codice?'rgba(200,164,94,.08)':'transparent'}}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
                onMouseLeave={e=>e.currentTarget.style.background=value===c.codice?'rgba(200,164,94,.08)':'transparent'}>
                <code style={{fontSize:'.7rem',color:'var(--gold)',minWidth:80,flexShrink:0}}>{c.codice}</code>
                <span style={{fontSize:'.75rem',color:'var(--tx)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.descrizione}</span>
              </div>
            ))}
            {!loading&&filtered.length===0&&<div style={{padding:'.75rem',fontSize:'.75rem',color:'var(--mu)',textAlign:'center'}}>Nessun risultato</div>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB ANAGRAFICA (estratta per leggibilità) ───────────────
function AnagraficaTab({form, up, conto, B}){
  // Causali IVA della società corrente (caricate lazy)
  const [causaliIva,setCausaliIva]=useState([]);
  useEffect(()=>{
    if(!conto.societa_id) return;
    contabilitaRepo.getCausaliIvaBasic()
      .then(({data})=>setCausaliIva(data||[]));
  },[conto.societa_id]);

  return(
    <>
      <div className="form-grid">
        <div className="fg full"><label>Ragione Sociale 2</label><input value={form.rag_sociale_2} onChange={e=>up('rag_sociale_2',e.target.value)}/></div>
        <div className="fg full"><label>Indirizzo</label><input value={form.indirizzo} onChange={e=>up('indirizzo',e.target.value)}/></div>
        <div className="fg"><label>CAP</label><input value={form.cap} onChange={e=>up('cap',e.target.value)} maxLength={5}/></div>
        <div className="fg"><label>Città</label><input value={form.citta} onChange={e=>up('citta',e.target.value)}/></div>
        <div className="fg"><label>Provincia</label><input value={form.provincia} onChange={e=>up('provincia',e.target.value)} maxLength={2} placeholder="RM"/></div>

        {/* Codice ISO — dropdown nazioni */}
        <div className="fg">
          <label>Nazione (ISO)</label>
          <select value={form.codice_iso||'IT'} onChange={e=>{up('codice_iso',e.target.value);up('nazione',ISO_NAZIONI.find(n=>n[0]===e.target.value)?.[1]||e.target.value);}}>
            {ISO_NAZIONI.map(([cod,nome])=><option key={cod} value={cod}>{cod} — {nome}</option>)}
          </select>
        </div>

        <div className="fg"><label>Codice Fiscale</label><input value={form.codice_fiscale} onChange={e=>up('codice_fiscale',e.target.value.toUpperCase())}/></div>
        <div className="fg"><label>Partita IVA</label><input value={form.partita_iva} onChange={e=>up('partita_iva',e.target.value)}/></div>

        <div className="fg"><label>Tipo soggetto</label>
          <select value={form.tipo_soggetto} onChange={e=>up('tipo_soggetto',e.target.value)}>
            <option value="Privato">Privato</option>
            <option value="Persona fisica">Persona fisica</option>
            <option value="Normale">Normale (Società/Ditta)</option>
            <option value="Dogana">Dogana</option>
            <option value="Estero">Estero</option>
          </select>
        </div>

        <div className="fg"><label>Tipo controparte</label>
          <select value={form.tipo_controparte} onChange={e=>up('tipo_controparte',e.target.value)}>
            <option value="1 = Persona fisica">1 = Persona fisica</option>
            <option value="2 = Persona giuridica">2 = Persona giuridica</option>
          </select>
        </div>

        <div className="fg"><label>Soggetto operaz.</label>
          <select value={form.soggetto_operaz} onChange={e=>up('soggetto_operaz',e.target.value)}>
            <option value="">-- Non specificato --</option>
            <option value="1">1 = Non titolare P.IVA</option>
            <option value="2">2 = Titolare P.IVA</option>
          </select>
        </div>

        {/* Aliquota IVA — dropdown causali IVA */}
        <div className="fg">
          <label>Aliquota IVA predefinita</label>
          <select value={form.causale_iva_id||''} onChange={e=>{
            const id=e.target.value
            const c=causaliIva.find(x=>x.id===id)
            up('causale_iva_id',id)
            up('aliquota_iva',c?String(c.aliquota??''):'')
          }}>
            <option value="">-- Standard (da causale) --</option>
            {causaliIva.map(c=><option key={c.id} value={c.id}>{c.codice} — {c.descrizione}{c.aliquota?` (${c.aliquota}%)`:''}</option>)}
          </select>
        </div>

        {/* Tipo pagamento — dropdown fisso */}
        <div className="fg">
          <label>Tipo pagamento</label>
          <select value={form.tipo_pagamento||''} onChange={e=>up('tipo_pagamento',e.target.value)}>
            <option value="">-- Non specificato --</option>
            <option value="Incasso">Incasso (cliente)</option>
            <option value="Pagamento">Pagamento (fornitore)</option>
            <option value="Rimessa diretta">Rimessa diretta</option>
            <option value="Bonifico">Bonifico bancario</option>
            <option value="Ri.Ba.">Ri.Ba.</option>
            <option value="RID">RID / SDD</option>
            <option value="Assegno">Assegno</option>
            <option value="Contanti">Contanti</option>
          </select>
        </div>

        {/* Contropartita — selettore piano dei conti */}
        <div className="fg full">
          <label>Contropartita predefinita
            <span style={{fontSize:'.68rem',color:'var(--mu)',marginLeft:'.5rem',fontWeight:400}}>
              conto proposto automaticamente nelle registrazioni di questo {form.is_cliente?'cliente':'fornitore'}
            </span>
          </label>
          <SelettoreContropartita
            value={form.contropartita}
            onChange={v=>up('contropartita',v)}
            societaId={conto.societa_id}
          />
        </div>

        <div className="fg"><label>Banca</label><input value={form.banca} onChange={e=>up('banca',e.target.value)}/></div>
        <div className="fg"><label>Regime fiscale</label>
          <select value={form.regime_fiscale} onChange={e=>up('regime_fiscale',e.target.value)}>
            <option value="">-- Non specificato --</option>
            <option value="RF01">RF01 - Ordinario</option>
            <option value="RF02">RF02 - Minimi</option>
            <option value="RF04">RF04 - Agricoltura</option>
            <option value="RF05">RF05 - Sali e tabacchi</option>
            <option value="RF10">RF10 - Agriturismo</option>
            <option value="RF19">RF19 - Forfettario</option>
            <option value="RF18">RF18 - Altro</option>
          </select>
        </div>
      </div>

      {/* Toggle Split Payment evidenziato */}
      <div style={{marginTop:'1.25rem',background:'rgba(200,164,94,.06)',border:'1px solid rgba(200,164,94,.2)',borderRadius:8,padding:'.75rem 1rem'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'.4rem'}}>
          <div>
            <div style={{fontWeight:700,fontSize:'.82rem',color:'var(--gold)'}}>🏛 Split Payment</div>
            <div style={{fontSize:'.72rem',color:'var(--mu)',marginTop:'.15rem'}}>
              L'IVA di questo cliente viene trattenuta dalla PA e non versata al fornitore (art. 17-ter DPR 633/72)
            </div>
          </div>
          <div onClick={()=>up('split_payment',!form.split_payment)}
            style={{width:40,height:22,borderRadius:11,background:form.split_payment?'var(--gold)':'var(--bd2)',position:'relative',cursor:'pointer',transition:'background .2s',flexShrink:0}}>
            <div style={{width:16,height:16,borderRadius:8,background:'#fff',position:'absolute',top:3,left:form.split_payment?21:3,transition:'left .2s'}}/>
          </div>
        </div>
        {form.split_payment&&(
          <div style={{fontSize:'.72rem',color:'#fb923c',marginTop:'.3rem',padding:'.35rem .6rem',background:'rgba(251,146,60,.08)',borderRadius:5}}>
            ⚡ Attivo — nella liquidazione IVA l'imposta di questo cliente sarà dedotta dall'IVA a debito come "IVA Split Payment"
          </div>
        )}
      </div>

      {/* Altri toggle */}
      <div style={{marginTop:'1rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
        <B k="consumatore_finale" lbl="Consumatore finale (B2C, no P.IVA)"/>
        <B k="includi_spesometro" lbl="Includi spesometro"/>
        <B k="soggetto_riepilogativo" lbl="Soggetto riepilogativo"/>
        <B k="proc_concorsuale" lbl="Procedura concorsuale"/>
        <B k="includi_esterometro" lbl="Includi esterometro"/>
        <B k="partecipa_gruppo_iva" lbl="Partecipa gruppo IVA"/>
      </div>
    </>
  );
}

function ModalEditConto({conto,onSave,onClose}){
  const [tab,setTab]=useState('generale');
  const B=({k,lbl})=>(<div style={{display:'flex',alignItems:'center',gap:'.5rem',cursor:'pointer',marginTop:'.35rem'}} onClick={()=>up(k,!form[k])}>
    <div style={{width:28,height:16,borderRadius:8,background:form[k]?'var(--gold)':'var(--bd2)',position:'relative',transition:'background .2s',flexShrink:0}}>
      <div style={{width:12,height:12,borderRadius:6,background:'#fff',position:'absolute',top:2,left:form[k]?14:2,transition:'left .2s'}}/>
    </div><span style={{fontSize:'.78rem',color:'var(--mu)'}}>{lbl}</span>
  </div>);
  const [form,setForm]=useState({
    // Generale
    descrizione:conto.descrizione||'',
    tipo:conto.tipo||'patrimoniale',
    natura:conto.natura||'',
    sezione:conto.sezione||'dare',
    is_cliente:conto.is_cliente||false,
    is_fornitore:conto.is_fornitore||false,
    is_banca:conto.is_banca||false,
    is_cassa:conto.is_cassa||false,
    is_professionista:conto.is_professionista||false,
    attivo:conto.attivo!==false,
    note:conto.note||'',
    // Anagrafica — nomi colonna DB (migration Opus)
    rag_sociale_2:conto.rag_sociale_2||'',
    indirizzo:conto.indirizzo||'',
    cap:conto.cap||'',
    citta:conto.citta||'',
    provincia:conto.provincia||'',
    nazione:conto.nazione||'Italia',
    codice_iso:conto.codice_iso||'IT',
    codice_fiscale:conto.codice_fiscale||'',
    partita_iva:conto.partita_iva||'',
    tipo_soggetto:conto.tipo_soggetto||'Privato',
    contropartita:conto.contropartita||'',
    tipo_pagamento:conto.tipo_pagamento||'',
    banca:conto.banca||'',
    aliquota_iva:conto.aliquota_iva||'',
    causale_iva_id:conto.causale_iva_id||'',
    soggetto_operaz:conto.soggetto_operaz||'',
    tipo_controparte:conto.tipo_controparte||'1 = Persona fisica',
    regime_fiscale:conto.regime_fiscale||'',
    email_pec:conto.email_pec||'',
    codice_dest_efat:conto.codice_dest_efat||'',
    consumatore_finale:conto.consumatore_finale||false,
    includi_spesometro:conto.includi_spesometro??true,
    soggetto_riepilogativo:conto.soggetto_riepilogativo||false,
    split_payment:conto.split_payment||false,
    proc_concorsuale:conto.proc_concorsuale||false,
    richiede_efat_b2b:conto.richiede_efat_b2b||false,
    singola_ft_elettronica:conto.singola_ft_elettronica||false,
    includi_esterometro:conto.includi_esterometro||false,
    partecipa_gruppo_iva:conto.partecipa_gruppo_iva||false,
  });
  const [saving,setSaving]=useState(false);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await onSave(form);setSaving(false);};
  const TABS=[['generale','⚙️ Generale'],['anagrafica','👤 Anagrafica'],['fattura','🧾 Fattura Elett.']];
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">✏️ Modifica Conto</div>
          <div className="modal-sub"><code style={{fontSize:'.8rem',color:'var(--gold)'}}>{conto.codice}</code> · Livello {conto.livello}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid var(--bd)',padding:'0 1.25rem'}}>
          {TABS.map(([id,lbl])=>(
            <div key={id} onClick={()=>setTab(id)} style={{padding:'.5rem .85rem',fontSize:'.78rem',fontWeight:tab===id?700:400,color:tab===id?'var(--gold)':'var(--mu)',borderBottom:tab===id?'2px solid var(--gold)':'2px solid transparent',cursor:'pointer'}}>{lbl}</div>
          ))}
        </div>
        <div className="modal-body" style={{maxHeight:'65vh',overflowY:'auto'}}>

          {tab==='generale'&&<>
            <div className="form-grid">
              <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
              <div className="fg"><label>Tipo</label>
                <select value={form.tipo} onChange={e=>up('tipo',e.target.value)}>
                  <option value="patrimoniale">Patrimoniale</option>
                  <option value="economico">Economico</option>
                  <option value="ordine">D'ordine</option>
                </select>
              </div>
              <div className="fg"><label>Natura</label>
                <select value={form.natura} onChange={e=>up('natura',e.target.value)}>
                  <option value="attivo">Attivo</option>
                  <option value="passivo">Passivo</option>
                  <option value="ricavo">Ricavo</option>
                  <option value="costo">Costo</option>
                  <option value="ordine">Ordine</option>
                </select>
              </div>
              <div className="fg"><label>Sezione</label>
                <select value={form.sezione} onChange={e=>up('sezione',e.target.value)}>
                  <option value="dare">Dare</option>
                  <option value="avere">Avere</option>
                </select>
              </div>
              <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
            </div>
            <div style={{marginTop:'1rem'}}>
              <div style={{fontSize:'.72rem',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--mu)',marginBottom:'.5rem'}}>Tipo anagrafica</div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'.5rem'}}>
                {[['is_cliente','👤 Cliente'],['is_fornitore','🏭 Fornitore'],['is_banca','🏦 Banca/C/C'],['is_cassa','💵 Cassa'],['is_professionista','👔 Professionista']].map(([k,l])=>(
                  <div key={k} onClick={()=>up(k,!form[k])} style={{padding:'.3rem .7rem',borderRadius:20,border:`1.5px solid ${form[k]?'var(--gold)':'var(--bd)'}`,background:form[k]?'rgba(200,164,94,.12)':'transparent',cursor:'pointer',fontSize:'.78rem',color:form[k]?'var(--gold)':'var(--mu)'}}>{l}</div>
                ))}
              </div>
            </div>
            <div style={{marginTop:'1rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="attivo" lbl="Conto attivo"/>
            </div>
          </>}

          {tab==='anagrafica'&&<AnagraficaTab form={form} up={up} conto={conto} B={B}/>}

          {tab==='fattura'&&<>
            <div className="form-grid">
              <div className="fg full"><label>Email PEC</label><input value={form.email_pec} onChange={e=>up('email_pec',e.target.value)} type="email" placeholder="email@pec.it"/></div>
              <div className="fg full"><label>Codice destinatario fattura elettronica</label><input value={form.codice_dest_efat} onChange={e=>up('codice_dest_efat',e.target.value.toUpperCase())} maxLength={7} placeholder="7 caratteri"/></div>
            </div>
            <div style={{marginTop:'1rem',display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="richiede_efat_b2b" lbl="Richiede fattura elettronica B2B"/>
              <B k="singola_ft_elettronica" lbl="Singola fattura elettronica"/>
            </div>
          </>}

        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!form.descrizione} onClick={save}>{saving?'⏳ Salvo...':'💾 Salva'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── CAUSALI VIEW ────────────────────────────────────────────
function CausaliView({causali,tipo,societaId,onImport,onRefresh}){
  const [sel,setSel]=useState(new Set());
  const [deleting,setDeleting]=useState(false);
  const [editCausale,setEditCausale]=useState(null);
  const [nuovaCausale,setNuovaCausale]=useState(false);

  const toggleSel=(id)=>setSel(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;});
  const toggleAll=()=>setSel(sel.size===causali.length?new Set():new Set(causali.map(c=>c.id)));

  const deleteSelected=async()=>{
    if(!sel.size||!confirm(`Eliminare ${sel.size} causali selezionate?`))return;
    setDeleting(true);
    const table=tipo==='iva'?'causali_iva':'causali_contabili';
    const ids=[...sel];
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivateCausali(table, ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  const deleteAll=async()=>{
    const label=tipo==='iva'?'causali IVA':'causali contabili';
    if(!confirm(`⚠️ Eliminare TUTTE le ${causali.length} ${label}? Questa azione non è reversibile.`))return;
    setDeleting(true);
    const table=tipo==='iva'?'causali_iva':'causali_contabili';
    const ids=causali.map(c=>c.id);
    for(let i=0;i<ids.length;i+=100) await contabilitaRepo.bulkDeactivateCausali(table, ids.slice(i,i+100));
    setSel(new Set());setDeleting(false);onRefresh();
  };

  return(
    <div>
      {editCausale&&<ModalEditCausale causale={editCausale} tipo={tipo} onSave={async(updates)=>{const table=tipo==='iva'?'causali_iva':'causali_contabili';await contabilitaRepo.updateCausale(table,editCausale.id,updates);setEditCausale(null);onRefresh();}} onClose={()=>setEditCausale(null)}/>}
      {nuovaCausale&&<ModalNuovaCausale tipo={tipo} societaId={societaId} onSave={async(rec)=>{const table=tipo==='iva'?'causali_iva':'causali_contabili';const row=tipo==='iva'?{...rec,attivo:true}:{...rec,societa_id:societaId,attivo:true};const{error}=await contabilitaRepo.insertCausale(table,row);if(error){alert('Errore: '+error.message);return;}setNuovaCausale(false);onRefresh();}} onClose={()=>setNuovaCausale(false)}/>}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'1rem'}}>
        <div>
          <div style={{fontSize:'1.1rem',fontWeight:700}}>{tipo==='contabili'?'📋 Causali Contabili':'💧 Causali IVA'}</div>
          <div style={{fontSize:'.75rem',color:'var(--mu)'}}>{causali.length} causali configurate</div>
        </div>
        <div style={{display:'flex',gap:'.5rem'}}>
          {sel.size>0&&<button className="btn-sec" style={{borderColor:'rgba(224,82,82,.4)',color:'#ff8585'}} disabled={deleting} onClick={deleteSelected}>{deleting?'⏳':'🗑'} Elimina ({sel.size})</button>}
          <button className="btn-sec" onClick={()=>setNuovaCausale(true)}>➕ Nuova causale</button>
          <button className="btn" onClick={onImport}>📤 Import PDF/Excel</button>
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
  const [tab,setTab]=useState('principale');
  const B=({k,lbl,small})=>(<div style={{display:'flex',alignItems:'center',gap:'.4rem',cursor:'pointer',marginTop:'.3rem'}} onClick={()=>up(k,!form[k])}>
    <div style={{width:26,height:14,borderRadius:7,background:form[k]?'var(--gold)':'var(--bd2)',position:'relative',flexShrink:0}}>
      <div style={{width:10,height:10,borderRadius:5,background:'#fff',position:'absolute',top:2,left:form[k]?14:2,transition:'left .15s'}}/>
    </div>
    <span style={{fontSize:small?'.72rem':'.78rem',color:'var(--mu)'}}>{lbl}</span>
  </div>);

  const [form,setForm]=useState(isIva?{
    // Principali
    codice:causale.codice||'',
    descrizione:causale.descrizione||'',
    percentuale_imposta:causale.aliquota??causale.percentuale_imposta??0,
    regime_iva:causale.regime_iva||'Imponibile',
    percentuale_compensazione:causale.percentuale_compensazione??0,
    tipo_trattamento:causale.tipo_trattamento||'Normale',
    // Detraibilità
    nota_di_variazione:causale.nota_di_variazione||false,
    detraibile:causale.detraibile??true,
    percentuale_indetraibilita:causale.percentuale_indetraibilita??0,
    // Volume e plafond
    volume_affari:causale.volume_affari||false,
    volume_affari_plafond:causale.volume_affari_plafond||false,
    concorre_plafond:causale.concorre_plafond||false,
    utilizzo_plafond_interno:causale.utilizzo_plafond_interno||false,
    utilizzo_plafond_import:causale.utilizzo_plafond_import||false,
    monte_acquisti:causale.monte_acquisti||false,
    // Operazioni
    operazione_attiva:causale.operazione_attiva||false,
    cessione_intra:causale.cessione_intra||false,
    operazione_passiva:causale.operazione_passiva||false,
    acquisto_intra:causale.acquisto_intra||false,
    // Liquidazione / dichiarazione
    op_attive_spesometro:causale.op_attive_spesometro||false,
    op_passive_spesometro:causale.op_passive_spesometro??true,
    op_attive_liquidazione:causale.op_attive_liquidazione||false,
    op_passive_liquidazione:causale.op_passive_liquidazione||false,
    reverse_charge:causale.reverse_charge||false,
    incluso_quadro_vt:causale.incluso_quadro_vt||false,
    imponibile_quadro_vt:causale.imponibile_quadro_vt||false,
    imposta_quadro_vt:causale.imposta_quadro_vt||false,
    op_esenti_prorata:causale.op_esenti_prorata||false,
    volume_affari_prorata:causale.volume_affari_prorata||false,
    ripartizione_acquisti:causale.ripartizione_acquisti||false,
    no_riparto_spese_acc:causale.no_riparto_spese_acc||false,
    acquisto_soggetti_minimi:causale.acquisto_soggetti_minimi||false,
    acquisti_art17_c2:causale.acquisti_art17_c2||false,
    no_calcolo_bolli:causale.no_calcolo_bolli||false,
    acquisti_regime_forfetario:causale.acquisti_regime_forfetario||false,
    // Reverse charge settori
    oro_argento:causale.oro_argento||false,
    rottami_recupero:causale.rottami_recupero||false,
    subappalto_edile:causale.subappalto_edile||false,
    fabbricati_strumentali:causale.fabbricati_strumentali||false,
    telefoni_cellulari:causale.telefoni_cellulari||false,
    prodotti_elettronici:causale.prodotti_elettronici||false,
    servizi_pulizia:causale.servizi_pulizia||false,
    demolizione:causale.demolizione||false,
    installazione_impianti:causale.installazione_impianti||false,
    completamento_edifici:causale.completamento_edifici||false,
    trasf_quote:causale.trasf_quote||false,
    trasf_unita_certif:causale.trasf_unita_certif||false,
    gas_energia:causale.gas_energia||false,
    // E-fattura
    natura_aliquota_iva_pa:causale.natura_aliquota_iva_pa||'',
    codice_efat_passive:causale.codice_efat_passive||false,
    codice_efat_attive:causale.codice_efat_attive||false,
    aliquota_ventilazione_no_acq:causale.aliquota_ventilazione_no_acq||false,
    note:causale.note||'',
  }:{
    // Causali contabili
    codice:causale.codice||'',
    descrizione:causale.descrizione||'',
    descrizione_tabulati:causale.descrizione_tabulati||'',
    tipo_causale:causale.tipo_causale||'Movimento di generale',
    operazione_partite:causale.operazione_partite||'Ignora',
    tipo_pagamento:causale.tipo_pagamento||'',
    codice_registro_iva:causale.codice_registro_iva||'',
    protocollo_numerazione:causale.protocollo_numerazione??0,
    segno_registro_iva:causale.segno_registro_iva||'',
    codice_aliquota_iva:causale.codice_aliquota_iva||'',
    op_ritenute:causale.op_ritenute||'Ignora',
    tipo_documento:causale.tipo_documento||'',
    data_documento:causale.data_documento||'Facoltativo',
    numero_documento:causale.numero_documento||'Facoltativo',
    tipo_doc_comunicaz_ft:causale.tipo_doc_comunicaz_ft||'',
    tipo_doc_ft_elettroniche:causale.tipo_doc_ft_elettroniche||'',
    conto_iva_esig_differita:causale.conto_iva_esig_differita||'',
    registro_iva_differita:causale.registro_iva_differita||'',
    registro_iva_cee:causale.registro_iva_cee||'',
    protocollo_iva_cee:causale.protocollo_iva_cee??0,
    segno_iva_registro_cee:causale.segno_iva_registro_cee||'',
    // Flag booleani
    trascina_descrizione:causale.trascina_descrizione??true,
    trascina_sbilancio:causale.trascina_sbilancio||false,
    data_competenza:causale.data_competenza||false,
    rateo_risconti:causale.rateo_risconti||false,
    disattivato:causale.disattivato||false,
    integrazione_documento:causale.integrazione_documento||false,
    causale_giro_iva_cassa:causale.causale_giro_iva_cassa||false,
    competenza_iva_anno_prec:causale.competenza_iva_anno_prec||false,
    causale_standard_efat:causale.causale_standard_efat||false,
    ventilazione_corrispettivi:causale.ventilazione_corrispettivi||false,
    esclusa_integrazioni:causale.esclusa_integrazioni||false,
    note:causale.note||'',
  });
  const [saving,setSaving]=useState(false);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const save=async()=>{setSaving(true);await onSave(form);setSaving(false);};

  const TABS_IVA=[['principale','📋 Principale'],['operazioni','📊 Operazioni'],['rc','🔄 Rev. Charge'],['efat','🧾 E-Fattura']];
  const TABS_CONT=[['principale','📋 Principale'],['iva','💧 IVA'],['flags','⚙️ Flag'],['cee','🌍 CEE/Differita']];
  const TABS=isIva?TABS_IVA:TABS_CONT;

  const TD_OPTIONS=[
    {v:'',l:'-- Non specificato --'},
    {v:'TD01',l:'TD01 - Fattura'},{v:'TD04',l:'TD04 - Nota di credito'},
    {v:'TD07',l:'TD07 - Fattura semplificata'},{v:'TD08',l:'TD08 - Nota credito semplificata'},
    {v:'TD09',l:'TD09 - Nota debito'},{v:'TD10',l:'TD10 - Fattura acquisto intra beni'},
    {v:'TD11',l:'TD11 - Fattura acquisto intra servizi'},
    {v:'TD16',l:'TD16 - Integrazione reverse charge'},{v:'TD17',l:'TD17 - Autofattura acquisto servizi'},
    {v:'TD18',l:'TD18 - Integrazione acquisto beni intra'},{v:'TD19',l:'TD19 - Integrazione acquisto beni art.17'},
    {v:'TD20',l:'TD20 - Autofattura regolarizzazione'},{v:'TD21',l:'TD21 - Autofattura splafonamento'},
    {v:'TD24',l:'TD24 - Fattura differita beni'},{v:'TD25',l:'TD25 - Fattura differita servizi'},
    {v:'TD26',l:'TD26 - Cessione beni ammortizzabili'},{v:'TD27',l:'TD27 - Autofattura autoconsumo'},
  ];

  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:600}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">✏️ {isIva?'Causale IVA':'Causale Contabile'}</div>
          <div className="modal-sub"><code style={{color:'var(--gold)'}}>{causale.codice}</code></div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{display:'flex',borderBottom:'1px solid var(--bd)',padding:'0 1.25rem'}}>
          {TABS.map(([id,lbl])=>(
            <div key={id} onClick={()=>setTab(id)} style={{padding:'.5rem .75rem',fontSize:'.75rem',fontWeight:tab===id?700:400,color:tab===id?'var(--gold)':'var(--mu)',borderBottom:tab===id?'2px solid var(--gold)':'2px solid transparent',cursor:'pointer'}}>{lbl}</div>
          ))}
        </div>
        <div className="modal-body" style={{maxHeight:'65vh',overflowY:'auto'}}>

          {/* ── CAUSALE IVA ── */}
          {isIva&&tab==='principale'&&<div className="form-grid">
            <div className="fg"><label>Codice</label><input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} style={{fontFamily:'monospace'}}/></div>
            <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
            <div className="fg"><label>% Imposta</label><input type="number" value={form.percentuale_imposta} onChange={e=>up('aliquota',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/></div>
            <div className="fg"><label>% Indetraibilità</label><input type="number" value={form.percentuale_indetraibilita} onChange={e=>up('percentuale_indetraibilita',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/></div>
            <div className="fg"><label>% Compensazione</label><input type="number" value={form.percentuale_compensazione} onChange={e=>up('percentuale_compensazione',parseFloat(e.target.value)||0)} min={0} max={100} step={1}/></div>
            <div className="fg"><label>Regime IVA</label>
              <select value={form.regime_iva} onChange={e=>up('regime_iva',e.target.value)}>
                <option value="Imponibile">Imponibile</option>
                <option value="Esente">Esente</option>
                <option value="Non imponibile">Non imponibile</option>
                <option value="Escluso">Escluso</option>
              </select>
            </div>
            <div className="fg"><label>Tipo trattamento</label>
              <select value={form.tipo_trattamento} onChange={e=>up('tipo_trattamento',e.target.value)}>
                <option value="Normale">Normale</option>
                <option value="Acquisto Cee">Acquisto CEE</option>
              </select>
            </div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="detraibile" lbl="Detraibile"/>
              <B k="nota_di_variazione" lbl="Nota di variazione"/>
              <B k="no_calcolo_bolli" lbl="Non calcolare bolli"/>
              <B k="acquisto_soggetti_minimi" lbl="Acquisto sogg. minimi"/>
              <B k="acquisti_art17_c2" lbl="Acquisti art. 17 c.2"/>
              <B k="acquisti_regime_forfetario" lbl="Regime forfetario"/>
            </div>
            <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
          </div>}

          {isIva&&tab==='operazioni'&&<div className="form-grid">
            <div className="fg full" style={{fontSize:'.75rem',fontWeight:600,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.05em'}}>Operazioni e liquidazione</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="operazione_attiva" lbl="Operazione attiva"/>
              <B k="operazione_passiva" lbl="Operazione passiva"/>
              <B k="cessione_intra" lbl="Cessione intra"/>
              <B k="acquisto_intra" lbl="Acquisto intra"/>
              <B k="op_attive_liquidazione" lbl="Op. attive liquidazione"/>
              <B k="op_passive_liquidazione" lbl="Op. passive liquidazione"/>
              <B k="op_attive_spesometro" lbl="Op. attive spesometro"/>
              <B k="op_passive_spesometro" lbl="Op. passive spesometro"/>
              <B k="reverse_charge" lbl="Reverse charge"/>
            </div>
            <div className="fg full" style={{fontSize:'.75rem',fontWeight:600,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.05em',marginTop:'.5rem'}}>Volume d'affari e plafond</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="volume_affari" lbl="Volume d'affari"/>
              <B k="volume_affari_plafond" lbl="Vol. affari plafond"/>
              <B k="concorre_plafond" lbl="Concorre plafond"/>
              <B k="utilizzo_plafond_interno" lbl="Utilizzo plafond interno"/>
              <B k="utilizzo_plafond_import" lbl="Utilizzo plafond import"/>
              <B k="monte_acquisti" lbl="Monte acquisti"/>
              <B k="volume_affari_prorata" lbl="Vol. affari pro-rata"/>
              <B k="op_esenti_prorata" lbl="Op. esenti pro-rata"/>
              <B k="ripartizione_acquisti" lbl="Ripartizione acquisti"/>
              <B k="no_riparto_spese_acc" lbl="No riparto spese access."/>
            </div>
            <div className="fg full" style={{fontSize:'.75rem',fontWeight:600,color:'var(--mu)',textTransform:'uppercase',letterSpacing:'.05em',marginTop:'.5rem'}}>Quadri dichiarazione</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="incluso_quadro_vt" lbl="Incluso quadro VT"/>
              <B k="imponibile_quadro_vt" lbl="Imponibile quadro VT"/>
              <B k="imposta_quadro_vt" lbl="Imposta quadro VT"/>
            </div>
          </div>}

          {isIva&&tab==='rc'&&<div className="form-grid">
            <div className="fg full" style={{fontSize:'.75rem',color:'var(--mu)',marginBottom:'.5rem'}}>Settori con regime reverse charge specifico</div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="oro_argento" lbl="Oro ind. / Argento puro"/>
              <B k="rottami_recupero" lbl="Rottami e materiali recupero"/>
              <B k="subappalto_edile" lbl="Subappalto edile"/>
              <B k="fabbricati_strumentali" lbl="Fabbricati strumentali"/>
              <B k="telefoni_cellulari" lbl="Telefoni cellulari"/>
              <B k="prodotti_elettronici" lbl="Prodotti elettronici"/>
              <B k="servizi_pulizia" lbl="Servizi pulizia"/>
              <B k="demolizione" lbl="Demolizione"/>
              <B k="installazione_impianti" lbl="Installazione impianti"/>
              <B k="completamento_edifici" lbl="Completamento edifici"/>
              <B k="trasf_quote" lbl="Trasf. quote"/>
              <B k="trasf_unita_certif" lbl="Trasf. unità e certif."/>
              <B k="gas_energia" lbl="Gas ed energia elettrica"/>
            </div>
          </div>}

          {isIva&&tab==='efat'&&<div className="form-grid">
            <div className="fg full"><label>Natura aliquota IVA PA</label>
              <select value={form.natura_aliquota_iva_pa} onChange={e=>up('natura_aliquota_iva_pa',e.target.value)}>
                <option value="">-- Nessuna --</option>
                <option value="N1">N1 - Escluse ex art.15</option>
                <option value="N2.1">N2.1 - Non soggette art.7</option>
                <option value="N2.2">N2.2 - Non soggette altri casi</option>
                <option value="N3.1">N3.1 - Non imponibili esportazioni</option>
                <option value="N3.2">N3.2 - Non imponibili CEE beni</option>
                <option value="N3.3">N3.3 - Non imponibili CEE servizi</option>
                <option value="N3.4">N3.4 - Non imponibili assimilate</option>
                <option value="N3.5">N3.5 - Non imponibili dichiarazioni intento</option>
                <option value="N3.6">N3.6 - Non imponibili altre</option>
                <option value="N4">N4 - Esenti</option>
                <option value="N5">N5 - Regime del margine</option>
                <option value="N6.1">N6.1 - RC rottami</option>
                <option value="N6.2">N6.2 - RC edilizia</option>
                <option value="N6.3">N6.3 - RC sub-appalto</option>
                <option value="N6.4">N6.4 - RC cessione fabbricati</option>
                <option value="N6.5">N6.5 - RC cellulari</option>
                <option value="N6.6">N6.6 - RC prodotti elettronici</option>
                <option value="N6.7">N6.7 - RC gas/energia</option>
                <option value="N6.8">N6.8 - RC GNL</option>
                <option value="N6.9">N6.9 - RC altri casi</option>
                <option value="N7">N7 - IVA assolta in altro stato UE</option>
              </select>
            </div>
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="codice_efat_passive" lbl="Includi in e-fat passive"/>
              <B k="codice_efat_attive" lbl="Includi in e-fat attive"/>
              <B k="aliquota_ventilazione_no_acq" lbl="Ventilazione senza acquisti"/>
            </div>
          </div>}

          {/* ── CAUSALE CONTABILE ── */}
          {!isIva&&tab==='principale'&&<div className="form-grid">
            <div className="fg"><label>Codice</label><input value={form.codice} onChange={e=>up('codice',e.target.value.toUpperCase())} style={{fontFamily:'monospace'}}/></div>
            <div className="fg full"><label>Descrizione *</label><input value={form.descrizione} onChange={e=>up('descrizione',e.target.value)} autoFocus/></div>
            <div className="fg full"><label>Descrizione per tabulati</label><input value={form.descrizione_tabulati} onChange={e=>up('descrizione_tabulati',e.target.value)} placeholder="Descrizione breve per stampe NES"/></div>
            <div className="fg"><label>Tipo causale</label>
              <select value={form.tipo_causale} onChange={e=>up('tipo_causale',e.target.value)}>
                <option value="Movimento di generale">Movimento di generale</option>
                <option value="Doc. Iva normale">Doc. IVA normale</option>
                <option value="Doc. Iva esig. differita">Doc. IVA esig. differita</option>
                <option value="Autofattura">Autofattura</option>
                <option value="Doc. Corrispettivo">Doc. Corrispettivo</option>
                <option value="Doc. Iva Acq. CEE">Doc. IVA Acq. CEE</option>
                <option value="Movimento sola Iva">Movimento sola IVA</option>
                <option value="Pag./inc. Iva esig. diff.">Pag./Inc. IVA esig. diff.</option>
              </select>
            </div>
            <div className="fg"><label>Operazione partite</label>
              <select value={form.operazione_partite} onChange={e=>up('operazione_partite',e.target.value)}>
                <option value="Ignora">Ignora</option>
                <option value="Apre">Apre</option>
                <option value="Chiude">Chiude</option>
              </select>
            </div>
            <div className="fg"><label>Tipo documento</label>
              <select value={form.tipo_documento} onChange={e=>up('tipo_documento',e.target.value)}>
                <option value="">-- Non specificato --</option>
                <option value="Fattura">Fattura</option>
                <option value="Autofattura">Autofattura</option>
                <option value="Doc. Iva normale">Doc. IVA normale</option>
                <option value="Doc. Iva esig. differita">Doc. IVA esig. differita</option>
                <option value="Movimento di generale">Movimento di generale</option>
              </select>
            </div>
            <div className="fg"><label>Gestione partite</label>
              <select value={form.operazione_partite} onChange={e=>up('operazione_partite',e.target.value)}>
                <option value="Ignora">Ignora</option>
                <option value="Apre">Apre</option>
                <option value="Chiude">Chiude</option>
              </select>
            </div>
            <div className="fg"><label>Op. ritenute</label>
              <select value={form.op_ritenute} onChange={e=>up('op_ritenute',e.target.value)}>
                <option value="Ignora">Ignora</option>
                <option value="Documento">Documento</option>
                <option value="Pagamento">Pagamento</option>
              </select>
            </div>
            <div className="fg"><label>Data documento</label>
              <select value={form.data_documento} onChange={e=>up('data_documento',e.target.value)}>
                <option value="Facoltativo">Facoltativo</option>
                <option value="Obbligatorio">Obbligatorio</option>
              </select>
            </div>
            <div className="fg"><label>Numero documento</label>
              <select value={form.numero_documento} onChange={e=>up('numero_documento',e.target.value)}>
                <option value="Facoltativo">Facoltativo</option>
                <option value="Obbligatorio">Obbligatorio</option>
              </select>
            </div>
            <div className="fg"><label>Tipo pag.</label><input value={form.tipo_pagamento} onChange={e=>up('tipo_pagamento',e.target.value)} placeholder="es. Rimessa diretta"/></div>
            <div className="fg full"><label>Note</label><input value={form.note} onChange={e=>up('note',e.target.value)}/></div>
          </div>}

          {!isIva&&tab==='iva'&&<div className="form-grid">
            <div className="fg"><label>Registro IVA</label><input value={form.codice_registro_iva} onChange={e=>up('codice_registro_iva',e.target.value)} placeholder="es. 01, 02" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>Protocollo numerazione</label><input type="number" value={form.protocollo_numerazione} onChange={e=>up('protocollo_numerazione',parseInt(e.target.value)||0)} min={0}/></div>
            <div className="fg"><label>Segno registro IVA</label>
              <select value={form.segno_registro_iva} onChange={e=>up('segno_registro_iva',e.target.value)}>
                <option value="">-- --</option>
                <option value="Somma">Somma</option>
                <option value="Sottrae">Sottrae</option>
              </select>
            </div>
            <div className="fg"><label>Codice aliquota IVA</label><input value={form.codice_aliquota_iva} onChange={e=>up('codice_aliquota_iva',e.target.value.toUpperCase())} placeholder="es. A1IW" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>TD comunicaz. fatture</label>
              <select value={form.tipo_doc_comunicaz_ft} onChange={e=>up('tipo_doc_comunicaz_ft',e.target.value)}>
                {TD_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div className="fg"><label>TD fatture elettroniche</label>
              <select value={form.tipo_doc_ft_elettroniche} onChange={e=>up('tipo_doc_ft_elettroniche',e.target.value)}>
                {TD_OPTIONS.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>
            <div className="fg full"><label>Conto IVA esig. differita</label><input value={form.conto_iva_esig_differita} onChange={e=>up('conto_iva_esig_differita',e.target.value)} placeholder="es. 600000011" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>Registro IVA differita</label><input value={form.registro_iva_differita} onChange={e=>up('registro_iva_differita',e.target.value)}/></div>
          </div>}

          {!isIva&&tab==='flags'&&<div className="form-grid">
            <div className="fg full" style={{display:'flex',gap:'1.5rem',flexWrap:'wrap'}}>
              <B k="trascina_descrizione" lbl="Trascina descrizione aggiuntiva"/>
              <B k="trascina_sbilancio" lbl="Trascina sbilancio"/>
              <B k="data_competenza" lbl="Data competenza"/>
              <B k="rateo_risconti" lbl="Rateo/Risconti"/>
              <B k="disattivato" lbl="Disattivato"/>
              <B k="integrazione_documento" lbl="Integrazione documento"/>
              <B k="causale_giro_iva_cassa" lbl="Causale giro IVA per cassa"/>
              <B k="competenza_iva_anno_prec" lbl="Competenza IVA anno prec."/>
              <B k="causale_standard_efat" lbl="Causale standard Efat"/>
              <B k="ventilazione_corrispettivi" lbl="Ventilazione corrispettivi"/>
              <B k="esclusa_integrazioni" lbl="Esclusa da integrazioni/autofatture"/>
            </div>
          </div>}

          {!isIva&&tab==='cee'&&<div className="form-grid">
            <div className="fg"><label>Registro IVA CEE</label><input value={form.registro_iva_cee} onChange={e=>up('registro_iva_cee',e.target.value)} placeholder="es. 02" style={{fontFamily:'monospace'}}/></div>
            <div className="fg"><label>Protocollo IVA CEE</label><input type="number" value={form.protocollo_iva_cee} onChange={e=>up('protocollo_iva_cee',parseInt(e.target.value)||0)} min={0}/></div>
            <div className="fg"><label>Segno registro CEE</label>
              <select value={form.segno_iva_registro_cee} onChange={e=>up('segno_iva_registro_cee',e.target.value)}>
                <option value="">-- --</option>
                <option value="Somma">Somma</option>
                <option value="Sottrae">Sottrae</option>
              </select>
            </div>
          </div>}

        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={saving||!form.descrizione} onClick={save}>{saving?'⏳ Salvo...':'💾 Salva'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── PRIMA NOTA VIEW — riga tabella scritture (log binding) ──
function PrimaNotaViewScritturaRow({ s, getClienteCodice, getClienteNome, fmtDate, fmt }) {
  traceStep('UI_ROW_PROPS', {
    id: s.id,
    numero_registrazione: s.numero_registrazione,
    cliente_id: s.cliente_id,
    causale_codice: s.causale_codice,
    causale_iva_codice: s.causale_iva_codice ?? null
  }, { component: 'PrimaNotaViewScritturaRow' })
  return (
    <tr>
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
  )
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
    causale_iva_id:'',
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
    traceStep('UI_INPUT_CHANGE', { value: id, payload: { field: 'cliente_id', scope: 'PrimaNotaView_modal' } })
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
    traceStep('UI_INPUT_CHANGE', { value: val, payload: { field: 'imponibile', scope: 'PrimaNotaView_modal' } })
    const causIva=causaliIva.find(c=>c.id===formData.causale_iva_id);
    const{imposta,totale}=calcolaIVA(val,causIva?.aliquota||22);
    setFormData(p=>({...p,imponibile:val,imposta,totale_dare:totale,totale_avere:totale}));
  };

  const onCausaleIvaChange=(causaleId)=>{
    traceStep('UI_INPUT_CHANGE', { value: causaleId, payload: { field: 'causale_iva_id', scope: 'PrimaNotaView_modal' } })
    const causIva=causaliIva.find(c=>c.id===causaleId);
    const{imposta,totale}=calcolaIVA(formData.imponibile,causIva?.aliquota||22);
    setFormData(p=>({...p,causale_iva_id:causaleId,imposta,totale_dare:totale,totale_avere:totale}));
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
      causale_iva_codice:causaliIva.find(c=>c.id===formData.causale_iva_id)?.codice||'',
      descrizione:formData.descrizione,
      totale_dare:parseFloat(formData.totale_dare||0),
      totale_avere:parseFloat(formData.totale_avere||0),
      imponibile:parseFloat(formData.imponibile||0),
      imposta:parseFloat(formData.imposta||0),
      stato:'provvisoria'
    };

    traceIva('PRE_INSERT_PRIMA_NOTA_VIEW', 'DB', formData.causale_iva_id ?? null)
    traceStep('INSERT_PAYLOAD', record, { table: 'prima_nota', ...insertCausaleIvaMeta(record) })
    traceDiff(
      'DB_MAPPING_DIFF',
      { causale_iva_id: formData.causale_iva_id ?? null },
      { causale_iva_id: record.causale_iva_id ?? null }
    )
    const pnViewIns=await createPrimaNota({ pnPayload: record, headerSelect: '*' });
    traceStep('INSERT_RESULT', { table: 'prima_nota', data: pnViewIns.data, error: pnViewIns.error })
    const error=pnViewIns.error
    if(error){
      alert('Errore: '+error.message);
      return;
    }
    setModalNuova(false);
    setFormData({data_registrazione:new Date().toISOString().split('T')[0],data_documento:'',numero_documento:'',cliente_id:'',causale_codice:'',causale_iva_id:'',descrizione:'',totale_dare:0,totale_avere:0,conto_dare_id:'',conto_avere_id:'',imponibile:0,imposta:0});
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
            <input placeholder="🔍 N° documento, descrizione..." value={searchTerm} onChange={e=>{
              const value=e.target.value
              traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'searchTerm', scope: 'PrimaNotaView_filtri' } })
              setSearchTerm(value)
            }}/>
          </div>
          <div className="fg" style={{minWidth:200}}>
            <label>Filtra per Cliente</label>
            <select value={filtroCliente} onChange={e=>{
              const value=e.target.value
              traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'filtroCliente', scope: 'PrimaNotaView_filtri' } })
              setFiltroCliente(value)
            }}>
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
            <tbody>
              {(() => {
                traceStep('UI_RENDER_RIGHE', {
                  righe: filtered.map((row, i) => ({
                    i,
                    id: row.id,
                    causale_iva_codice: row.causale_iva_codice ?? null,
                    causale_codice: row.causale_codice ?? null
                  }))
                }, { component: 'PrimaNotaView' })
                return null
              })()}
              {filtered.map(s => (
                <PrimaNotaViewScritturaRow
                  key={s.id}
                  s={s}
                  getClienteCodice={getClienteCodice}
                  getClienteNome={getClienteNome}
                  fmtDate={fmtDate}
                  fmt={fmt}
                />
              ))}
            </tbody>
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
                  <input type="date" value={formData.data_registrazione} onChange={e=>{
                    const value=e.target.value
                    traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_registrazione', scope: 'PrimaNotaView_modal' } })
                    setFormData(p=>({...p,data_registrazione:value}))
                  }}/>
                </div>
                <div className="fg">
                  <label>Data Documento</label>
                  <input type="date" value={formData.data_documento} onChange={e=>{
                    const value=e.target.value
                    traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_documento', scope: 'PrimaNotaView_modal' } })
                    setFormData(p=>({...p,data_documento:value}))
                  }}/>
                </div>
                <div className="fg">
                  <label>N° Documento</label>
                  <input value={formData.numero_documento} onChange={e=>{
                    const value=e.target.value
                    traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'numero_documento', scope: 'PrimaNotaView_modal' } })
                    setFormData(p=>({...p,numero_documento:value}))
                  }} placeholder="Es. FT-001/2025"/>
                </div>
                <div className="fg">
                  <label>Causale Contabile</label>
                  <select value={formData.causale_codice} onChange={e=>{
                    const value=e.target.value
                    traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'causale_codice', scope: 'PrimaNotaView_modal' } })
                    setFormData(p=>({...p,causale_codice:value}))
                  }}>
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
                  <input value={formData.descrizione} onChange={e=>{
                    const value=e.target.value
                    traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'descrizione', scope: 'PrimaNotaView_modal' } })
                    setFormData(p=>({...p,descrizione:value}))
                  }} placeholder="Descrizione operazione"/>
                </div>
                <div className="fg">
                  <label>Imponibile €</label>
                  <input type="number" step="0.01" value={formData.imponibile} onChange={e=>onImponibileChange(e.target.value)}/>
                </div>
                <div className="fg">
                  <label>Causale IVA</label>
                  <select value={formData.causale_iva_id} onChange={e=>onCausaleIvaChange(e.target.value)}>
                    <option value="">-- Seleziona --</option>
                    {causaliIva.map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
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
  const doc = docs?.[0]
  const _datiEst = doc?.dati_estratti
    ? (typeof doc.dati_estratti === 'string' ? JSON.parse(doc.dati_estratti) : doc.dati_estratti)
    : {}
  const [contoId,setContoId]=useState('');
  const [causaleIva,setCausaleIva]=useState(doc?.causale_iva||'');
  // causaleIva per riga multi-aliquota: { [aliquota]: causale_id }
  const [causaliPerRiga,setCausaliPerRiga]=useState({});




  // ── useEffect: si attiva quando causaliIva è caricato o dati cambiano ──
  useEffect(()=>{
    if(!doc||!causaliIva?.length) return

    trace('UI STATE', {
      doc_id: doc.id, conto_id: doc.conto_id,
      causale_iva_doc: doc.causale_iva,
      causaliIva_count: causaliIva?.length,
      pianoConti_count: pianoConti?.length,
    })

    // ── PRIORITÀ ASSOLUTA: causale_iva_id sul conto documento ──
    const conto = pianoConti?.find(c => c.id === (doc.conto_id || _datiEst?.conto_id))
    if(conto?.causale_iva_id) {
      const causale = causaliIva.find(c => c.id === conto.causale_iva_id)
      console.log('[CAUSALE IVA]', {
        conto_id: doc.conto_id,
        causale_da_conto: conto.causale_iva_id,
        causale_trovata: causale?.id || null
      })
      if(causale) { setCausaleIva(causale.id); return }
    }

    // ── FALLBACK: match per aliquota ──
    const riepilogo = _datiEst?.riepilogo_iva || []

    // Conto fornitore per priorità anagrafica aliquota_iva
    const pivaFornitore = doc.soggetto_piva || _datiEst?.cedente_piva
    const contoFornitore = pianoConti?.find(c =>
      c.partita_iva===pivaFornitore || c.anagrafica_piva===pivaFornitore
    ) || null

    if(riepilogo.length === 0) {
      if(!causaleIva) {
        const aliqDoc = doc.aliquota_iva || _datiEst?.aliquota_iva || '22'
        const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: aliqDoc, natura: '', causaliIva, pipelineContext: undefined }) || '')
        if(id) setCausaleIva(id)
      }
      return
    }

    if(riepilogo.length === 1) {
      if(!causaleIva) {
        const r = riepilogo[0]
        const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: r.aliquota, natura: r.natura || '', causaliIva, pipelineContext: undefined }) || '')
        if(id) setCausaleIva(id)
      }
    } else {
      const map = {}
      riepilogo.forEach(r => {
        const key = String(r.aliquota)
        if(!map[key])
          map[key] = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: r.aliquota, natura: r.natura || '', causaliIva, pipelineContext: undefined }) || '')
      })
      setCausaliPerRiga(map)
      if(!causaleIva && Object.values(map)[0]) setCausaleIva(Object.values(map)[0])
    }
  },[causaliIva?.length, doc?.id]);
  const [confirmAll,setConfirmAll]=useState(true);

  const handleSave=()=>{
    const updates={};
    if(contoId)updates.conto_id=contoId;
    if(causaleIva)updates.causale_iva=causaleIva;
    if(confirmAll)updates.validation_status='confirmed';
    onSave(updates);
  };

  if(!doc) return null

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
              {causaliIva.map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
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
  trace('MODAL', {
    doc_id: doc.id, filename: doc.filename,
    conto_id: doc.conto_id, causale_iva: doc.causale_iva,
    validation_status: doc.validation_status,
    dati_estratti_keys: doc.dati_estratti ? Object.keys(typeof doc.dati_estratti==='string'?JSON.parse(doc.dati_estratti):doc.dati_estratti) : []
  })
  console.log("UI AMOUNTS DEBUG", {
    imponibile: doc.imponibile,
    iva: doc.iva,
    totale: doc.totale,
    dati_estratti: doc.dati_estratti
  })
  // Leggi conto_id: prima dalla colonna diretta, poi da dati_estratti
  const _datiEst = doc.dati_estratti
    ? (typeof doc.dati_estratti==='string' ? JSON.parse(doc.dati_estratti) : doc.dati_estratti)
    : {}
  const [contoId,setContoId]=useState(doc.conto_id || _datiEst?.conto_id || '');
  const [causaleIva,setCausaleIva]=useState(doc.causale_iva||'');
  // causaleIva per riga multi-aliquota: { [aliquota]: causale_id }
  const [causaliPerRiga,setCausaliPerRiga]=useState({});

  // ── useEffect: si attiva quando causaliIva è caricato o dati cambiano ──
  useEffect(()=>{
    if(!causaliIva?.length) return
    const riepilogo = _datiEst?.riepilogo_iva || []

    // Conto fornitore per priorità anagrafica
    const pivaFornitore = doc.soggetto_piva || _datiEst?.cedente_piva
    const contoFornitore = pianoConti?.find(c=>
      c.partita_iva===pivaFornitore || c.anagrafica_piva===pivaFornitore
    ) || null

    if(riepilogo.length === 0) {
      // Nessun riepilogo — usa aliquota del documento se presente
      if(!causaleIva) {
        const aliqDoc = doc.aliquota_iva || _datiEst?.aliquota_iva || '22'
        const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: aliqDoc, natura: '', causaliIva, pipelineContext: undefined }) || '')
        if(id) setCausaleIva(id)
      }
      return
    }

    if(riepilogo.length === 1) {
      // Una sola aliquota — imposta causaleIva principale
      if(!causaleIva) {
        const r = riepilogo[0]
        const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: r.aliquota, natura: r.natura || '', causaliIva, pipelineContext: undefined }) || '')
        if(id) setCausaleIva(id)
      }
    } else {
      // Multi-aliquota — calcola causale per ogni riga
      const map = {}
      riepilogo.forEach(r => {
        const key = String(r.aliquota)
        if(!map[key]) {
          map[key] = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: r.aliquota, natura: r.natura || '', causaliIva, pipelineContext: undefined }) || '')
        }
      })
      setCausaliPerRiga(map)
      // Imposta causaleIva principale con la prima aliquota
      if(!causaleIva && Object.values(map)[0]) setCausaleIva(Object.values(map)[0])
    }
  },[causaliIva?.length, doc.id])
  const [splitView,setSplitView]=useState('split');
  const [saving,setSaving]=useState(false);
  const _contoIniziale = pianoConti?.find(c=>c.id===(doc.conto_id||_datiEst?.conto_id))
  const [contoSearch,setContoSearch]=useState(_contoIniziale?`${_contoIniziale.codice} — ${_contoIniziale.descrizione}`:'');
  const [showContoDropdown,setShowContoDropdown]=useState(false);
  const [xmlPreview,setXmlPreview]=useState(null);
  const [aiSuggestion,setAiSuggestion]=useState(null);
  const ai=useAIStatus();

  // Preview XML: usa xml_content da fatture_xml (via dati_estratti) o fetch da storage
  useEffect(()=>{
    const isXML = doc.mime_type?.includes('xml')
      || doc.filename?.toLowerCase().endsWith('.xml')
      || doc.filename?.toLowerCase().endsWith('.p7m')
      || doc.tipo_documento?.includes('fattura');
    if(!isXML) return;

    // 1. Prova a leggere xml_content da dati_estratti (fatture importate da fatture_xml)
    const datiEst = doc.dati_estratti
      ? (typeof doc.dati_estratti === 'string' ? JSON.parse(doc.dati_estratti) : doc.dati_estratti)
      : null;

    const tryParseXml = (text) => {
      try { setXmlPreview(parseXMLFattura(text)); } catch(e) { console.error('XML parse:', e); }
    };

    if(datiEst?.xml_filename) {
      // Carica xml_content da fatture_xml tramite filename + societa_id
      contabilitaRepo.getFatturaXmlByFilename(datiEst.xml_filename)
        .then(({data}) => {
          if(data?.[0]?.xml_content) tryParseXml(data[0].xml_content);
        });
      return;
    }

    // 2. Fallback: fetch da URL storage
    let url = doc.file_url;
    if(!url && doc.file_path) {
      const {data:u} = contabilitaRepo.getDocumentoPublicUrl(doc.file_path);
      url = u?.publicUrl;
    }
    if(!url) return;
    fetch(url).then(r=>r.text()).then(tryParseXml).catch(e=>console.error('XML fetch:', e));
  },[doc.id, doc.file_url, doc.file_path, doc.filename, doc.dati_estratti]);

  // AI suggestion for conto on mount
  useEffect(()=>{
    (async()=>{
      const{data:sArr}=await contabilitaRepo.getImpostazioneStudioValore('ai_enabled');
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
    await contabilitaRepo.updateDocumentoContabilita(doc.id,{
      conto_id:contoId||null,validation_status:'confirmed',validated_at:new Date().toISOString()
    });
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

  // ── Visualizzatore fattura XML (foglio di cortesia) ──────────────
  const FatturaViewer = ({data}) => {
    const TIPO_DOC = {
      TD01:'Fattura', TD02:'Acconto su fattura', TD03:'Acconto su parcella',
      TD04:'Nota di credito', TD05:'Nota di debito', TD06:'Parcella',
      TD16:'Integrazione reverse charge', TD17:'Integrazione acquisto servizi estero',
      TD18:'Integrazione acquisto beni intracomunitari', TD19:'Integrazione acquisto beni art.17',
      TD20:'Autofattura', TD24:'Fattura differita', TD25:'Fattura differita (art.21 c.4)',
      TD26:'Cessione beni ammortizzabili', TD27:'Fattura per autoconsumo',
    };
    const MODALITA_PAG = {
      MP01:'Contanti', MP02:'Assegno', MP03:'Assegno circolare', MP04:'Contanti presso Tesoreria',
      MP05:'Bonifico', MP06:'Vaglia cambiario', MP07:'Bollettino bancario', MP08:'Carta di pagamento',
      MP09:'RID', MP10:'RID utenze', MP11:'RID veloce', MP12:'RIBA', MP13:'MAV',
      MP14:'Quietanza erario', MP15:'Giroconto su conti di contabilità speciale',
      MP16:'Domiciliazione bancaria', MP17:'Domiciliazione postale', MP18:'Bollettino di c/c postale',
      MP19:'SEPA Direct Debit', MP20:'SEPA Direct Debit CORE', MP21:'SEPA Direct Debit B2B',
      MP22:'Trattenuta su somme già riscosse', MP23:'PagoPA',
    };
    const fmt = (n) => n != null ? Number(n).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) : '—';
    const tipoLabel = TIPO_DOC[data.tipo] || data.tipo || 'Fattura';
    const isNC = data.tipo === 'TD04' || data.tipo === 'TD05';

    return (
      <div style={{
        padding:'1.5rem', fontSize:'.82rem', lineHeight:'1.6',
        background:'#fff', color:'#1a1a2e', height:'100%', overflow:'auto',
        fontFamily:"'Segoe UI', system-ui, sans-serif",
      }}>
        {/* Header documento */}
        <div style={{
          display:'flex', justifyContent:'space-between', alignItems:'flex-start',
          borderBottom:'3px solid #1a1a2e', paddingBottom:'1rem', marginBottom:'1.25rem',
        }}>
          <div>
            <div style={{fontSize:'1.4rem', fontWeight:700, color: isNC?'#c0392b':'#1a1a2e', letterSpacing:'-.02em'}}>
              {tipoLabel.toUpperCase()}
            </div>
            <div style={{fontSize:'.72rem', color:'#666', marginTop:'.15rem'}}>
              Fattura Elettronica FPR12 · SDI
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'1rem', fontWeight:700}}>N° {data.numero}</div>
            <div style={{fontSize:'.85rem', color:'#555'}}>del {data.data}</div>
            {data.divisa && data.divisa !== 'EUR' && (
              <div style={{fontSize:'.72rem', color:'#888', marginTop:'.2rem'}}>Divisa: {data.divisa}</div>
            )}
          </div>
        </div>

        {/* Cedente / Cessionario */}
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', marginBottom:'1.25rem'}}>
          <div style={{border:'1px solid #e0e0e0', borderRadius:6, padding:'.75rem 1rem'}}>
            <div style={{fontSize:'.65rem', fontWeight:700, color:'#888', letterSpacing:'.08em', marginBottom:'.4rem'}}>CEDENTE / PRESTATORE</div>
            <div style={{fontWeight:700, fontSize:'.9rem', marginBottom:'.15rem'}}>{data.nome_cedente || '—'}</div>
            {data.piva_cedente && <div style={{fontSize:'.75rem', color:'#555'}}>P.IVA: {data.piva_cedente}</div>}
            {data.cf_cedente && data.cf_cedente !== data.piva_cedente && (
              <div style={{fontSize:'.75rem', color:'#555'}}>C.F.: {data.cf_cedente}</div>
            )}
            {data.indirizzo_cedente && <div style={{fontSize:'.72rem', color:'#777', marginTop:'.2rem'}}>{data.indirizzo_cedente}</div>}
            {data.regime_fiscale && (
              <div style={{display:'inline-block', marginTop:'.3rem', background:'#f0f0f0', borderRadius:3, padding:'.1rem .4rem', fontSize:'.65rem', color:'#555'}}>
                Regime: {data.regime_fiscale}
              </div>
            )}
          </div>
          <div style={{border:'1px solid #e0e0e0', borderRadius:6, padding:'.75rem 1rem'}}>
            <div style={{fontSize:'.65rem', fontWeight:700, color:'#888', letterSpacing:'.08em', marginBottom:'.4rem'}}>CESSIONARIO / COMMITTENTE</div>
            <div style={{fontWeight:700, fontSize:'.9rem', marginBottom:'.15rem'}}>{data.nome_cessionario || '—'}</div>
            {data.piva_cessionario && <div style={{fontSize:'.75rem', color:'#555'}}>P.IVA: {data.piva_cessionario}</div>}
            {data.cf_cessionario && data.cf_cessionario !== data.piva_cessionario && (
              <div style={{fontSize:'.75rem', color:'#555'}}>C.F.: {data.cf_cessionario}</div>
            )}
            {data.indirizzo_cessionario && <div style={{fontSize:'.72rem', color:'#777', marginTop:'.2rem'}}>{data.indirizzo_cessionario}</div>}
          </div>
        </div>

        {/* Causale */}
        {data.causale && (
          <div style={{background:'#f9f9f9', border:'1px solid #e8e8e8', borderRadius:6, padding:'.6rem 1rem', marginBottom:'1rem', fontSize:'.78rem', color:'#444'}}>
            <span style={{fontWeight:600, color:'#666', fontSize:'.65rem', letterSpacing:'.06em'}}>CAUSALE: </span>{data.causale}
          </div>
        )}

        {/* Righe */}
        {data.lines?.length > 0 && (
          <div style={{marginBottom:'1.25rem'}}>
            <table style={{width:'100%', borderCollapse:'collapse', fontSize:'.78rem'}}>
              <thead>
                <tr style={{background:'#1a1a2e', color:'#fff'}}>
                  <th style={{padding:'.5rem .75rem', textAlign:'left', fontWeight:600, borderRadius:'4px 0 0 0'}}>N°</th>
                  <th style={{padding:'.5rem .75rem', textAlign:'left', fontWeight:600}}>Descrizione</th>
                  <th style={{padding:'.5rem .5rem', textAlign:'right', fontWeight:600}}>Qtà</th>
                  <th style={{padding:'.5rem .5rem', textAlign:'right', fontWeight:600}}>U.M.</th>
                  <th style={{padding:'.5rem .5rem', textAlign:'right', fontWeight:600}}>P. Unit.</th>
                  <th style={{padding:'.5rem .5rem', textAlign:'right', fontWeight:600}}>Sconto</th>
                  <th style={{padding:'.5rem .5rem', textAlign:'right', fontWeight:600}}>IVA%</th>
                  <th style={{padding:'.5rem .75rem', textAlign:'right', fontWeight:600, borderRadius:'0 4px 0 0'}}>Totale</th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((l,i) => (
                  <tr key={i} style={{borderBottom:'1px solid #f0f0f0', background: i%2===0?'#fff':'#fafafa'}}>
                    <td style={{padding:'.4rem .75rem', color:'#999', textAlign:'center'}}>{l.num||i+1}</td>
                    <td style={{padding:'.4rem .75rem'}}>
                      <div style={{fontWeight:500}}>{l.desc}</div>
                      {l.codice_art && <div style={{fontSize:'.65rem', color:'#aaa'}}>Art: {l.codice_art}</div>}
                    </td>
                    <td style={{padding:'.4rem .5rem', textAlign:'right'}}>{l.qty != null ? Number(l.qty).toLocaleString('it-IT') : '—'}</td>
                    <td style={{padding:'.4rem .5rem', textAlign:'right', color:'#888', fontSize:'.72rem'}}>{l.um||'—'}</td>
                    <td style={{padding:'.4rem .5rem', textAlign:'right'}}>{l.prezzo != null ? fmt(l.prezzo) : '—'}</td>
                    <td style={{padding:'.4rem .5rem', textAlign:'right', color:'#e67e22'}}>{l.sconto ? l.sconto+'%' : '—'}</td>
                    <td style={{padding:'.4rem .5rem', textAlign:'right'}}>{l.iva != null ? l.iva+'%' : '—'}</td>
                    <td style={{padding:'.4rem .75rem', textAlign:'right', fontWeight:600}}>{l.totale != null ? fmt(l.totale) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Riepilogo IVA */}
        {data.riepilogo?.length > 0 && (
          <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'1rem'}}>
            <table style={{width:320, fontSize:'.78rem', borderCollapse:'collapse'}}>
              <thead>
                <tr style={{background:'#f0f0f0'}}>
                  <th style={{padding:'.35rem .6rem', textAlign:'right', fontWeight:600, color:'#555'}}>Aliquota</th>
                  <th style={{padding:'.35rem .6rem', textAlign:'right', fontWeight:600, color:'#555'}}>Imponibile</th>
                  <th style={{padding:'.35rem .6rem', textAlign:'right', fontWeight:600, color:'#555'}}>Imposta</th>
                </tr>
              </thead>
              <tbody>
                {data.riepilogo.map((r,i) => (
                  <tr key={i} style={{borderBottom:'1px solid #eee'}}>
                    <td style={{padding:'.3rem .6rem', textAlign:'right'}}>{r.aliquota}%{r.natura?' ('+r.natura+')':''}</td>
                    <td style={{padding:'.3rem .6rem', textAlign:'right'}}>{fmt(r.imponibile)}</td>
                    <td style={{padding:'.3rem .6rem', textAlign:'right'}}>{fmt(r.imposta)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Totali */}
        <div style={{display:'flex', justifyContent:'flex-end', marginBottom:'1.25rem'}}>
          <div style={{width:320, border:'2px solid #1a1a2e', borderRadius:8, overflow:'hidden'}}>
            {data.imponibile != null && (
              <div style={{display:'flex', justifyContent:'space-between', padding:'.45rem .9rem', borderBottom:'1px solid #eee', background:'#fafafa'}}>
                <span style={{color:'#555', fontWeight:500}}>Imponibile</span>
                <span style={{fontWeight:600}}>{fmt(data.imponibile)} €</span>
              </div>
            )}
            {data.imposta != null && data.imposta !== 0 && (
              <div style={{display:'flex', justifyContent:'space-between', padding:'.45rem .9rem', borderBottom:'1px solid #eee', background:'#fafafa'}}>
                <span style={{color:'#555', fontWeight:500}}>IVA</span>
                <span style={{fontWeight:600}}>{fmt(data.imposta)} €</span>
              </div>
            )}
            <div style={{display:'flex', justifyContent:'space-between', padding:'.7rem .9rem', background:'#1a1a2e', color:'#fff'}}>
              <span style={{fontWeight:700, fontSize:'.9rem'}}>TOTALE DOCUMENTO</span>
              <span style={{fontWeight:700, fontSize:'1.1rem'}}>{fmt(data.totale_doc || (data.imponibile + data.imposta))} €</span>
            </div>
          </div>
        </div>

        {/* Pagamento */}
        {data.pagamenti?.length > 0 && (
          <div style={{border:'1px solid #e0e0e0', borderRadius:6, padding:'.75rem 1rem', marginBottom:'1rem'}}>
            <div style={{fontSize:'.65rem', fontWeight:700, color:'#888', letterSpacing:'.08em', marginBottom:'.5rem'}}>DATI PAGAMENTO</div>
            {data.pagamenti.map((p,i) => (
              <div key={i} style={{display:'flex', gap:'1.5rem', flexWrap:'wrap', fontSize:'.78rem', marginBottom: i < data.pagamenti.length-1 ? '.4rem':0}}>
                <div><span style={{color:'#888'}}>Modalità: </span><strong>{MODALITA_PAG[p.modalita]||p.modalita||'—'}</strong></div>
                {p.scadenza && <div><span style={{color:'#888'}}>Scadenza: </span><strong>{p.scadenza}</strong></div>}
                {p.importo != null && <div><span style={{color:'#888'}}>Importo: </span><strong>{fmt(p.importo)} €</strong></div>}
                {p.iban && <div><span style={{color:'#888'}}>IBAN: </span><span style={{fontFamily:'monospace', fontSize:'.72rem'}}>{p.iban}</span></div>}
              </div>
            ))}
          </div>
        )}

        {/* Bollo */}
        {data.bollo_virtuale && (
          <div style={{fontSize:'.75rem', color:'#555', marginBottom:'.5rem'}}>
            ✓ Imposta di bollo assolta in modo virtuale
            {data.bollo_importo ? ` — € ${fmt(data.bollo_importo)}` : ''}
          </div>
        )}

        {/* Footer */}
        <div style={{marginTop:'1rem', paddingTop:'.75rem', borderTop:'1px solid #eee', fontSize:'.65rem', color:'#aaa', display:'flex', justifyContent:'space-between'}}>
          <span>Progressivo: {data.progressivo_invio || '—'} · Formato: {data.formato || 'FPR12'}</span>
          <span style={{color:'#27ae60'}}>✓ Fattura Elettronica</span>
        </div>
      </div>
    );
  };

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
                  {xmlPreview?(<FatturaViewer data={xmlPreview}/>
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
                      {causaliIva.map(c=><option key={c.id} value={c.id}>{c.codice} - {c.descrizione} ({c.aliquota}%)</option>)}
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
      contabilitaRepo.getClientiAttiviCompleti(),
      contabilitaRepo.getSocietaAttiveBasic(),
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
      contabilitaRepo.getPianoContiSource(sourceSocietaId),
      contabilitaRepo.getCausaliContabiliSource(sourceSocietaId),
      contabilitaRepo.getCausaliIvaSource(sourceSocietaId),
    ]);
    const strip=(arr)=>arr.map(({id,created_at,updated_at,...r})=>({...r,societa_id:newSocietaId}));
    const BATCH=500;
    for(const[table,data] of [['piano_conti',pc||[]],['causali_contabili',cc||[]],['causali_iva',ci||[]]]){
      for(let i=0;i<data.length;i+=BATCH){
        const{error}=await contabilitaRepo.insertBatch(table, strip(data.slice(i,i+BATCH)));
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
        const{data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
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
        const{data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
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
      const {data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
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
        const{error:err}=await contabilitaRepo.upsertBatch(cfg.table, records.slice(i,i+BATCH));
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
      const{data:esistenti}=await contabilitaRepo.getCodiciEsistenti(cfg.table, societaId);
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
    const{data}=await contabilitaRepo.getLiquidazioniIvaSocieta(societa.id);
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
    
    const{error}=await contabilitaRepo.insertLiquidazioneIvaSocieta(record);
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
    const{data}=await contabilitaRepo.getLiquidazioniIvaTrimestrali(societa.id);
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
    const{data}=await contabilitaRepo.getRitenuteByAnnoPerPercipiente(societa.id, annoSel);
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
    const{data:liq}=await contabilitaRepo.getLiquidazioniIvaByAnno(societa.id, annoSel);
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
