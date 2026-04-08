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
import { ModuleHeader } from '../../shared/components'


const SETTINGS_TABS = [
  { id: 'societa', label: 'Anagrafica società' },
  { id: 'piano_conti', label: 'Piano dei conti' },
  { id: 'causali', label: 'Causali contabili' },
  { id: 'causali_iva', label: 'Causali IVA' },
  { id: 'percipienti', label: 'Percipienti' },
  { id: 'regole', label: 'Regole AI' },
]

const BANCHE_TABS = [
  { id: 'movimenti_banca', label: 'Movimenti bancari' },
  { id: 'riconciliazione', label: 'Riconciliazione' },
]

const ADEMPIMENTI_TABS = [
  { id: 'liquidazioni_iva', label: 'Liquidazioni IVA' },
  { id: 'lipe', label: 'LIPE' },
  { id: 'iva_annuale', label: 'IVA annuale' },
  { id: 'cu', label: 'Certificazioni uniche' },
  { id: 'ritenute', label: 'Ritenute' },
  { id: 'f770', label: '770' },
  { id: 'intrastat', label: 'Intrastat' },
]

const STAMPE_TABS = [
  { id: 'registri_iva', label: 'Registri IVA' },
  { id: 'partitari', label: 'Partitari' },
  { id: 'giornale', label: 'Giornale' },
  { id: 'mastrini', label: 'Mastrini' },
  { id: 'bilancio', label: 'Bilancio' },
]

const CONT_SIDEBAR_MENU = [
  {
    section: 'OPERATIVO',
    items: [
      { id: 'da_validare', icon: 'inbox', label: 'Da validare', badge: true },
      { id: 'prima_nota_guidata', icon: 'wand', label: 'Inserimento guidato' },
      { id: 'prima_nota', icon: 'book', label: 'Registrazioni' },
    ],
  },
  {
    section: 'AREE',
    items: [
      { id: 'impostazioni', icon: 'building', label: 'Impostazioni' },
      { id: 'banche', icon: 'bank', label: 'Banche' },
      { id: 'adempimenti', icon: 'percent', label: 'Adempimenti' },
      { id: 'stampe', icon: 'book_open', label: 'Stampe' },
    ],
  },
];

function ContSidebarIcon({ name }) {
  const props = { viewBox: '0 0 24 24', fill: 'none', xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true' }
  switch (name) {
    case 'building': return <svg {...props}><path d="M5 20V6.5h10V20M9 10h2m-2 3h2m4-3h2m-2 3h2M4 20h16M8 6.5V4h4v2.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'book': return <svg {...props}><path d="M5 6.5A2.5 2.5 0 0 1 7.5 4H19v15H7.5A2.5 2.5 0 0 0 5 21V6.5Zm0 0V19" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'receipt': return <svg {...props}><path d="M7 4h10v16l-2-1.5L13 20l-2-1.5L9 20l-2-1.5L5 20V6a2 2 0 0 1 2-2Zm2 4h6m-6 4h6m-6 4h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'flow': return <svg {...props}><path d="M7 6h3v3H7zM14 15h3v3h-3zM10 7.5h4a2 2 0 0 1 2 2v1.5M14 16.5h-4a2 2 0 0 1-2-2V13" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'bank': return <svg {...props}><path d="M4 9.5 12 5l8 4.5M6 10.5v6M10 10.5v6M14 10.5v6M18 10.5v6M4 19.5h16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'wand': return <svg {...props}><path d="m6 18 12-12M13 5l1.2-2.5L15.5 5 18 6.2 15.5 7.5 14.2 10 13 7.5 10.5 6.2 13 5ZM6.5 9l.6-1.3L7.8 9l1.3.6-1.3.7-.7 1.3-.6-1.3L5.2 9.6 6.5 9Zm10 7 .8-1.7.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'link': return <svg {...props}><path d="M10 13.5 8 15.5a3 3 0 1 1-4.2-4.2L6 9M14 10.5l2-2a3 3 0 1 1 4.2 4.2L18 15M9 12h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'percent': return <svg {...props}><path d="m6 18 12-12M8 7.5h.01M16 16.5h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.7"/><circle cx="16" cy="16" r="2" stroke="currentColor" strokeWidth="1.7"/></svg>
    case 'report': return <svg {...props}><path d="M6 19.5h12M8 16V9m4 7V6m4 10v-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'calendar': return <svg {...props}><path d="M7 4.5v3M17 4.5v3M5.5 8h13M6 6.5h12A1.5 1.5 0 0 1 19.5 8v10A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V8A1.5 1.5 0 0 1 6 6.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'file': return <svg {...props}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A2.5 2.5 0 0 1 5 18V6A2.5 2.5 0 0 1 7 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="M14 3.5V8h4" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/></svg>
    case 'tag': return <svg {...props}><path d="M11 4H6a2 2 0 0 0-2 2v5l8 8 7-7-8-8Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="7.5" r="1" fill="currentColor"/></svg>
    case 'globe': return <svg {...props}><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.7"/><path d="M4.5 12h15M12 4.5a12 12 0 0 1 0 15M12 4.5a12 12 0 0 0 0 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
    case 'book_open': return <svg {...props}><path d="M12 19c-1.4-1-3.1-1.5-5-1.5H5V6h2c1.9 0 3.6.5 5 1.5M12 19c1.4-1 3.1-1.5 5-1.5h2V6h-2c-1.9 0-3.6.5-5 1.5M12 19V7.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'users': return <svg {...props}><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 18.5c.8-2.4 3-3.5 4.8-3.5 1.8 0 4 .9 4.7 3M13 18c.5-1.6 1.9-2.5 3.5-2.5 1.4 0 2.8.7 3.5 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'journal': return <svg {...props}><path d="M7 4.5h10a1.5 1.5 0 0 1 1.5 1.5v12A1.5 1.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Zm0 0V17a.5.5 0 0 0 .5.5H17M9 9h6M9 13h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'ledger': return <svg {...props}><path d="M6 5.5h12v13H6zM10 5.5v13M6 10h12M6 14.5h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'chart': return <svg {...props}><path d="M6 18V11M12 18V7M18 18v-4M4.5 19.5h15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'inbox': return <svg {...props}><path d="M4.5 13 6 6.5A2 2 0 0 1 8 5h8a2 2 0 0 1 2 1.5l1.5 6.5M4.5 13V17A2.5 2.5 0 0 0 7 19.5h10A2.5 2.5 0 0 0 19.5 17v-4M9 13a3 3 0 0 0 6 0" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    case 'checklist': return <svg {...props}><path d="m7 8 1.5 1.5L11 7M7 15l1.5 1.5L11 14M13.5 8H17M13.5 15H17" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>
    default: return <svg {...props}><circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.7"/></svg>
  }
}

const CONT_TAB_META = {
  da_validare: {
    title: 'Da validare',
    subtitle: 'Controllo rapido dei documenti in ingresso, conferma operativa e passaggio alla registrazione.',
  },
  registrate: {
    title: 'Completate',
    subtitle: 'Documenti gia registrati in contabilita, utili per verifiche veloci e controlli di quadratura.',
  },
  prima_nota: {
    title: 'Prima nota',
    subtitle: 'Vista operativa delle scritture, con ricerca rapida e consultazione immediata dei movimenti.',
  },
  prima_nota_guidata: {
    title: 'Prima nota guidata',
    subtitle: 'Percorso assistito per costruire e controllare una registrazione completa prima del salvataggio.',
  },
  movimenti_banca: {
    title: 'Movimenti bancari',
    subtitle: 'Riconciliazione e controllo dei movimenti con focus operativo sui flussi ancora aperti.',
  },
  riconciliazione: {
    title: 'Riconciliazione',
    subtitle: 'Workspace dedicato al matching fra movimenti e contabilita per chiudere i disallineamenti.',
  },
  liquidazioni_iva: {
    title: 'Liquidazioni IVA',
    subtitle: 'Lettura fiscale coerente con i registri, pensata per controlli periodici e chiusure rapide.',
  },
  registri_iva: {
    title: 'Registri IVA',
    subtitle: 'Consultazione dei registri e dei riepiloghi con la stessa base dati del motore fiscale.',
  },
  societa: {
    title: 'Anagrafica societa',
    subtitle: 'Configurazione societaria e parametri base del modulo contabile.',
  },
  piano_conti: {
    title: 'Piano dei conti',
    subtitle: 'Gestione strutturata dei conti e consultazione veloce delle anagrafiche contabili.',
  },
  causali: {
    title: 'Causali contabili',
    subtitle: 'Set di causali operative usate nei flussi di registrazione e automazione.',
  },
  causali_iva: {
    title: 'Causali IVA',
    subtitle: 'Base fiscale usata da draft, guidata e registri per mantenere coerenza sul percorso attivo.',
  },
  regole: {
    title: 'Regole AI',
    subtitle: 'Parametri e regole applicative che supportano i suggerimenti e i workflow assistiti.',
  },
}

const CONT_QUICK_STATS = [
  { key: 'daValidare', label: 'In attesa' },
  { key: 'confermati', label: 'Confermati' },
  { key: 'registrati', label: 'Registrati' },
]

export function ModuloContabilita({ruolo, onHeaderContextChange, onHeaderActionsChange}){
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
  
  const [pnGuidataDraft,setPnGuidataDraft]=useState(null);
  const [pnGuidataNav,setPnGuidataNav]=useState({ ids: [], idx: -1 });
  const [splitMode,setSplitMode]=useState('split'); // split, pdf, scrittura
  const [registrazioneInCorso, setRegistrazioneInCorso] = useState(false);
  const [settingsTab, setSettingsTab] = useState('societa');
  const [bankingTab, setBankingTab] = useState('movimenti_banca');
  const [adempimentiTab, setAdempimentiTab] = useState('liquidazioni_iva');
  const [stampeTab, setStampeTab] = useState('registri_iva');
  
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
            'Configura in Impostazioni Procedure -> Aliquote IVA una causale predefinita per ogni aliquota usata (0, 4, 5, 10, 22).'
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
  useEffect(() => {
    if (SETTINGS_TABS.some((tab) => tab.id === contTab)) setSettingsTab(contTab)
    if (BANCHE_TABS.some((tab) => tab.id === contTab)) setBankingTab(contTab)
    if (ADEMPIMENTI_TABS.some((tab) => tab.id === contTab)) setAdempimentiTab(contTab)
    if (STAMPE_TABS.some((tab) => tab.id === contTab)) setStampeTab(contTab)
  }, [contTab])

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

  const isSettingsArea = contTab === 'impostazioni' || SETTINGS_TABS.some((tab) => tab.id === contTab)
  const isBancheArea = contTab === 'banche' || BANCHE_TABS.some((tab) => tab.id === contTab)
  const isAdempimentiArea = contTab === 'adempimenti' || ADEMPIMENTI_TABS.some((tab) => tab.id === contTab)
  const isStampeArea = contTab === 'stampe' || STAMPE_TABS.some((tab) => tab.id === contTab)
  const effectiveTab =
    contTab === 'impostazioni' ? settingsTab :
    contTab === 'banche' ? bankingTab :
    contTab === 'adempimenti' ? adempimentiTab :
    contTab === 'stampe' ? stampeTab :
    contTab
  const isDaValidareWorkspace = effectiveTab === 'da_validare'

  const currentTabMeta = contTab === 'impostazioni'
    ? {
        title: 'Impostazioni',
        subtitle: 'Configurazioni e anagrafiche del modulo contabile.',
      }
    : CONT_TAB_META[effectiveTab] || {
    title: 'Contabilita',
    subtitle: 'Workspace operativo del modulo contabile con focus su controllo, registrazione e fiscale.',
  }
  const headerTitle = isDaValidareWorkspace
    ? `${currentTabMeta.title} — ${societaAttiva?.denominazione || ''}`.trim()
    : currentTabMeta.title
  const headerSubtitle = isDaValidareWorkspace ? '' : societaAttiva?.denominazione || ''

  useEffect(() => {
    if (!onHeaderContextChange) return
    if (!societaAttiva) {
      onHeaderContextChange('')
      return
    }
    onHeaderContextChange(`"${currentTabMeta.title}" — "${societaAttiva.denominazione}"`)
    return () => onHeaderContextChange('')
  }, [onHeaderContextChange, currentTabMeta.title, societaAttiva])

  const patchDocumento = (id, partial) => {
    setDocumenti((prev) => prev.map((d) => (d.id === id ? { ...d, ...partial } : d)))
  }

  // Conferma singola
  const confermaDoc=async(docId)=>{
    await contabilitaRepo.confirmDocumento(docId,new Date().toISOString());
    setDocumenti(prev=>prev.map(d=>d.id===docId?{...d,validation_status:'confirmed'}:d));
  };

  // Registra confermati -> crea scritture prima nota
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
      let msg = `Registrati ${registrati}/${daRegistrare.length} documenti in Prima Nota`;
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

  useEffect(() => {
    if (!onHeaderActionsChange) return
    if (effectiveTab === 'da_validare') {
      onHeaderActionsChange([
        {
          key: 'register-confirmed',
          label: registrazioneInCorso ? 'Registrazione in corso...' : `Registra confermati (${stats.confermati})`,
          variant: 'primary',
          disabled: stats.confermati === 0 || registrazioneInCorso,
          onClick: registraConfermati,
        },
        {
          key: 'refresh-data',
          label: 'Aggiorna dati',
          variant: 'secondary',
          disabled: false,
          onClick: () => void caricaTutto(),
        },
      ])
    } else {
      onHeaderActionsChange([])
    }
    return () => onHeaderActionsChange([])
  }, [onHeaderActionsChange, effectiveTab, registrazioneInCorso, stats.confermati, registraConfermati, caricaTutto])

  if(loading)return<div className="loading">Caricamento...</div>;

  return(
    <div className="cont-layout">
      <aside className="cont-sidebar" aria-label="Sottomenu contabilità">
        <div className="cont-sidebar-top">
          <div className="cont-sidebar-societa">
            <span className="cont-sidebar-top-label">Società</span>
            <select
              value={societaAttiva?.id||''}
              onChange={e=>{const s=societa.find(x=>x.id===e.target.value);setSocietaAttiva(s);try{if(s?.id)localStorage.setItem(LAST_SOCIETA_STORAGE_KEY,s.id);}catch{/* ignore */}}}
            >
              {societa.length===0&&<option value="">Nessuna società</option>}
              {societa.map(s=><option key={s.id} value={s.id}>{s.denominazione}</option>)}
            </select>
          </div>
          <button className="btn cont-sidebar-cta" onClick={() => setModalSocieta(true)}>+ Nuova società</button>
        </div>

        {CONT_SIDEBAR_MENU.map(sec=>(
          <div key={sec.section} className="cont-sidebar-group">
            <div className="cont-sidebar-section">{sec.section}</div>
            {sec.items.map(item=>(
              <button
                key={item.id}
                type="button"
                className={'cont-sidebar-item'+((item.id === 'impostazioni' ? isSettingsArea : effectiveTab===item.id)?' active':'')}
                onClick={()=>{
                  if(item.id === 'impostazioni'){
                    setSettingsTab((prev)=>prev || 'societa')
                    setContTab('impostazioni')
                    return
                  }
                  setContTab(item.id)
                }}
                title={item.label}
              >
                <span className="cont-sidebar-ico"><ContSidebarIcon name={item.icon} /></span>
                <span className="cont-sidebar-label">{item.label}</span>
                {item.badge && <span className="cont-sidebar-badge">{stats.daValidare}</span>}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <div className="cont-main">
        {!societaAttiva?(
          <div className="empty"><div className="empty-ico">🏢</div><div className="empty-t">Seleziona o crea una società</div></div>
        ):(
          <div className="cont-module-shell compact-shell">
            {!isDaValidareWorkspace && (
              <ModuleHeader
                sectionLabel="Contabilità"
                title={headerTitle}
                context={headerSubtitle}
                primaryAction={
                  effectiveTab === 'societa'
                    ? <button className="btn" onClick={() => setModalSocieta(true)}>+ Nuova società</button>
                    : null
                }
                secondaryAction={
                  effectiveTab !== 'societa'
                    ? <button className="btn-sec" onClick={() => void caricaTutto()}>Aggiorna dati</button>
                    : null
                }
              />
            )}

            <div className="cont-module-content">
                {isSettingsArea && (
                  <div className="cont-settings-tabs" role="tablist" aria-label="Impostazioni contabilità">
                    {SETTINGS_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={'cont-settings-tab' + (effectiveTab === tab.id ? ' active' : '')}
                        onClick={() => {
                          setSettingsTab(tab.id)
                          setContTab('impostazioni')
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                {isBancheArea && (
                  <div className="cont-settings-tabs" role="tablist" aria-label="Banche">
                    {BANCHE_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={'cont-settings-tab' + (effectiveTab === tab.id ? ' active' : '')}
                        onClick={() => {
                          setBankingTab(tab.id)
                          setContTab('banche')
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                {isAdempimentiArea && (
                  <div className="cont-settings-tabs" role="tablist" aria-label="Adempimenti">
                    {ADEMPIMENTI_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={'cont-settings-tab' + (effectiveTab === tab.id ? ' active' : '')}
                        onClick={() => {
                          setAdempimentiTab(tab.id)
                          setContTab('adempimenti')
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                {isStampeArea && (
                  <div className="cont-settings-tabs" role="tablist" aria-label="Stampe">
                    {STAMPE_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={'cont-settings-tab' + (effectiveTab === tab.id ? ' active' : '')}
                        onClick={() => {
                          setStampeTab(tab.id)
                          setContTab('stampe')
                        }}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                )}
                <PrimaNotaHubView
                  contTab={effectiveTab}
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
                  contTab={effectiveTab}
                  societaAttiva={societaAttiva}
                  pianoConti={pianoConti}
                  causaliContabili={causaliContabili}
                  causaliIva={causaliIva}
                  caricaTutto={caricaTutto}
                />

                <BankingView contTab={effectiveTab} societaAttiva={societaAttiva} setContTab={setContTab} />

                <StampeView
                  contTab={effectiveTab}
                  societaAttiva={societaAttiva}
                  scritture={scritture}
                  pianoConti={pianoConti}
                  causaliIva={causaliIva}
                />

                <TaxComplianceView
                  contTab={effectiveTab}
                  societaAttiva={societaAttiva}
                  scritture={scritture}
                  causaliIva={causaliIva}
                  caricaTutto={caricaTutto}
                />

                {/* Placeholder per altri moduli */}
                {['regole','scritture','cu'].includes(effectiveTab)&&(
                  <div className="card" style={{padding:'2rem',textAlign:'center'}}>
                    <div style={{fontSize:'2.5rem',marginBottom:'.5rem'}}>🚧</div>
                    <div style={{fontSize:'1rem',fontWeight:600}}>Modulo in sviluppo</div>
                    <div style={{fontSize:'.8rem',color:'var(--mu)',marginTop:'.25rem'}}>Questa sezione sarà disponibile a breve</div>
                  </div>
                )}
            </div>
          </div>
        )}
      </div>

      {/* Modali */}
      {modalSocieta&&<ModalNuovaSocieta onSave={async(d)=>{const{data:ns}=await contabilitaRepo.insertSocieta(d);await caricaSocieta();setModalSocieta(false);return ns;}} onClose={()=>setModalSocieta(false)}/>}
    </div>
  );
}


