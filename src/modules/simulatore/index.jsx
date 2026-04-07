import { useState } from 'react'
import { callBackend } from '../../core/workflow'

const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)

const ATECO=[{label:"Pubblicità, marketing, content creator (73)",coeff:.78},{label:"Attività professionali, commercialisti, avvocati (69-75)",coeff:.78},{label:"Informatica, software, web, IT (58-63)",coeff:.78},{label:"Sanità, medicina, psicologia (86-88)",coeff:.78},{label:"Istruzione, formazione, coaching (85)",coeff:.78},{label:"Arte, sport, intrattenimento (90-93)",coeff:.67},{label:"Commercio al dettaglio e ingrosso (45-47)",coeff:.40},{label:"Ristorazione e alloggio (55-56)",coeff:.40},{label:"Costruzioni e impiantistica (41-43)",coeff:.86}];
const CALENDARS={occasionale:[{month:"Febbraio",items:[{date:"28/02",title:"Ricezione CU",desc:"CU dai committenti con ritenuta 20%.",level:"nrm"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Dichiarazione redditi + versamento IRPEF.",level:"urg"}]},{month:"Novembre",items:[{date:"30/11",title:"2° Acconto IRPEF",desc:"Versamento F24 seconda rata.",level:"imp"}]}],forfettario:[{month:"Febbraio",items:[{date:"16/02",title:"IVS – IV rata",desc:"Versamento quarta rata IVS anno prec.",level:"nrm"},{date:"28/02",title:"Bolli fatture – IV trim.",desc:"Imposta di bollo IV trimestre.",level:"nrm"}]},{month:"Maggio",items:[{date:"16/05",title:"IVS – I rata",desc:"Prima rata contributi IVS.",level:"imp"},{date:"31/05",title:"Bolli fatture – I trim.",desc:"Imposta di bollo I trimestre.",level:"nrm"}]},{month:"Giugno",items:[{date:"30/06",title:"Saldo + 1° Acconto imp. sost.",desc:"Saldo anno prec. e prima rata acconto.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVS – II rata",desc:"Seconda rata IVS.",level:"imp"}]},{month:"Settembre",items:[{date:"30/09",title:"Bolli fatture – II trim.",desc:"Imposta di bollo II trimestre.",level:"nrm"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Presentazione dichiarazione.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVS – III rata",desc:"Terza rata IVS.",level:"imp"},{date:"30/11",title:"2° Acconto + Bolli III trim.",desc:"Acconto imp. sost. + bolli.",level:"urg"}]}],ordinario:[{month:"Marzo",items:[{date:"16/03",title:"IVA annuale + CU",desc:"Versamento IVA + invio CU.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"},{date:"31/05",title:"Bolli I trim.",desc:"Imposta di bollo I trim.",level:"nrm"}]},{month:"Giugno",items:[{date:"30/06",title:"IRPEF saldo + acconto + INPS",desc:"Tutti i versamenti di giugno.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi PF",desc:"Dichiarazione dei redditi.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim.",desc:"Versamento IVA Q3.",level:"imp"},{date:"30/11",title:"2° Acconto IRPEF",desc:"Versamento F24.",level:"urg"}]},{month:"Dicembre",items:[{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}],srl:[{month:"Marzo",items:[{date:"16/03",title:"IVA IV trim.",desc:"Versamento IVA Q4.",level:"imp"}]},{month:"Aprile",items:[{date:"30/04",title:"Approvazione bilancio CDA",desc:"Riunione CDA progetto bilancio.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"},{date:"29/05",title:"Assemblea soci",desc:"Approvazione bilancio.",level:"urg"}]},{month:"Giugno",items:[{date:"30/06",title:"IRES+IRAP saldo+acconto + CCIAA",desc:"Tutti i versamenti + deposito bilancio.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello Redditi SC",desc:"Dichiarazione societaria.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim.",desc:"Versamento IVA Q3.",level:"imp"},{date:"30/11",title:"Acconto IRES+IRAP",desc:"Seconda rata acconti.",level:"urg"}]},{month:"Dicembre",items:[{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}],snc:[{month:"Marzo",items:[{date:"16/03",title:"IVA annuale",desc:"Versamento IVA anno prec.",level:"urg"}]},{month:"Maggio",items:[{date:"16/05",title:"IVA I trim.",desc:"Versamento IVA Q1.",level:"imp"}]},{month:"Giugno",items:[{date:"16/06",title:"INPS artigiani – I rata",desc:"Prima rata contributi fissi.",level:"imp"},{date:"30/06",title:"IRPEF soci saldo+acconto",desc:"Versamenti in capo ai soci.",level:"urg"}]},{month:"Agosto",items:[{date:"20/08",title:"IVA II trim.",desc:"Versamento IVA Q2.",level:"imp"}]},{month:"Settembre",items:[{date:"16/09",title:"INPS – II rata",desc:"Seconda rata.",level:"imp"}]},{month:"Ottobre",items:[{date:"31/10",title:"Modello SP + soci",desc:"Dichiarazione società+soci.",level:"imp"}]},{month:"Novembre",items:[{date:"16/11",title:"IVA III trim. + INPS III",desc:"IVA Q3 + terza rata INPS.",level:"imp"},{date:"30/11",title:"2° Acconto IRPEF soci",desc:"Versamento acconti.",level:"urg"}]},{month:"Dicembre",items:[{date:"16/12",title:"INPS – IV rata",desc:"Quarta rata INPS.",level:"imp"},{date:"27/12",title:"Acconto IVA",desc:"Acconto IVA dicembre.",level:"imp"}]}]};
const LVL_COLOR={urg:"#e05252",imp:"#c8a45e",nrm:"#4e8ef7"};
const LVL_LABEL={urg:"Urgente",imp:"Importante",nrm:"Ordinario"};
const REGIME_LABELS={occasionale:"Prestazione Occasionale",forfettario:"Regime Forfettario",ordinario:"Professionista Ordinario",srl:"S.r.l.",snc:"SNC / SAS"};
function calcIRPEF(inc){if(inc<=0)return 0;if(inc<=28000)return inc*.23;if(inc<=50000)return 28000*.23+(inc-28000)*.35;return 28000*.23+22000*.35+(inc-50000)*.43;}
function margIRPEF(base,add){return Math.round(calcIRPEF(base+add)-calcIRPEF(base));}
function calcAll({fatturato:fat_,altri:altri_,altriTipo,ateco,primiAnni}){
  const fat=parseFloat(fat_)||0,altri=parseFloat(altri_)||0;
  const covered=altriTipo==="dipendente"||altriTipo==="pensione";
  const over30k=altriTipo==="dipendente"&&altri>30000,over85k=fat>85000;
  const coeff=ateco?.coeff||.78;
  const oi2=margIRPEF(altri,fat),oi3=Math.round(Math.max(0,fat-5000)*.24/3);
  const fi=fat*coeff,fi2=Math.round(fi*(covered?.24:.2623)),fi3=Math.round((fi-fi2)*(primiAnni?.05:.15));
  const fb=over30k||over85k,fw=over30k?"Escluso: RAL > €30.000":over85k?"Escluso: Fatturato > €85.000":null;
  const ol=fat*.85,oi=Math.round(ol*(covered?.24:.2598)),oir=margIRPEF(altri,Math.max(0,ol-oi));
  const sb2=Math.max(0,fat-630);
  const sl=fat*.88,si=Math.max(3900,Math.round(sl*.24)),snc_i=margIRPEF(altri,Math.max(0,sl-si));
  return{
    occasionale:{name:"Prestazione Occasionale",blocked:fat>5000,warn:fat>5000?"Escluso: Ricavi > €5.000":null,rows:[["IRPEF marginale",fmt0(oi2)],["INPS (1/3)",fmt0(oi3)]],tot:oi2+oi3,netto:fat-oi2-oi3,note:"Ritenuta 20%. INPS solo oltre €5.000."},
    forfettario:{name:"Regime Forfettario",blocked:fb,warn:fw,rows:[["Imp. sostitutiva",fmt0(fi3)],["INPS gest. sep.",fmt0(fi2)]],tot:fi2+fi3,netto:fat-fi2-fi3,note:`Coeff. ${Math.round(coeff*100)}%. Aliquota ${primiAnni?5:15}%.`},
    ordinario:{name:"Professionista Ordinario",blocked:false,warn:null,rows:[["IRPEF marginale",fmt0(oir)],["INPS",fmt0(oi)],["Gestione",fmt0(1200)]],tot:oir+oi+1200,netto:fat-oir-oi-1200,note:"IRPEF a scaglioni. IVA 22%."},
    srl:{name:"S.r.l.",blocked:false,warn:null,rows:[["IRES 24%",fmt0(Math.round(sb2*.24))],["IRAP 3,9%",fmt0(Math.round(sb2*.039))],["Costi fissi",fmt0(630)]],tot:Math.round(sb2*.24)+Math.round(sb2*.039)+630,netto:fat-Math.round(sb2*.24)-Math.round(sb2*.039)-630,note:"Schema ottimizzato: nessun INPS."},
    snc:{name:"SNC / SAS",blocked:false,warn:null,rows:[["IRPEF soci",fmt0(snc_i)],["INPS commercianti",fmt0(si)],["Gestione",fmt0(900)]],tot:snc_i+si+900,netto:fat-snc_i-si-900,note:"Trasparenza fiscale. Min. INPS ~€3.900."},
  };
}
function CalendarModal({regimeId,onClose}){
  const cal=CALENDARS[regimeId]||[];
  const allItems=cal.flatMap(m=>m.items.map(i=>({...i,month:m.month})));
  const [sel,setSel]=useState({});const [email,setEmail]=useState("");const [sent,setSent]=useState(false);const [loading,setLoading]=useState(false);const [err,setErr]=useState(null);
  const allSel=allItems.length>0&&allItems.every((_,i)=>sel[i]);
  const toggleAll=()=>{if(allSel)setSel({});else{const s={};allItems.forEach((_,i)=>s[i]=true);setSel(s);}};
  const toggle=i=>setSel(p=>({...p,[i]:!p[i]}));
  const countSel=Object.values(sel).filter(Boolean).length;
  const send=async()=>{if(!email||!countSel)return;setLoading(true);setErr(null);try{await callBackend('/api/email', {action:'send',email,regimeName:REGIME_LABELS[regimeId],scadenze:allItems.filter((_,i)=>sel[i]),isTest:false});setSent(true);}catch(e){setErr(e.message);}finally{setLoading(false);}};
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-hdr" style={{position:"relative"}}><div className="modal-drag"/><div className="modal-title">{REGIME_LABELS[regimeId]}</div><div className="modal-sub">Calendario scadenze 2025</div><button className="modal-close" onClick={onClose}>✕</button></div>
        <div className="modal-body">
          <div className="leg">{[["urg","Urgente"],["imp","Importante"],["nrm","Ordinario"]].map(([k,l])=><div key={k} className="leg-item"><div className="leg-dot" style={{background:LVL_COLOR[k]}}/>{l}</div>)}</div>
          <div className="sel-bar"><span className="sel-count">{countSel} selezionate</span><button className="sel-all-btn" onClick={toggleAll}>{allSel?"Deseleziona":"Seleziona tutto"}</button></div>
          {cal.map(({month,items})=>(
            <div key={month} className="m-block">
              <div className="m-hdr">{month}</div>
              {items.map(item=>{const gi=allItems.findIndex(a=>a.date===item.date&&a.title===item.title&&a.month===month);return(
                <div key={gi} className={"dl"+(sel[gi]?" sel":"")} style={{borderLeft:"3px solid "+LVL_COLOR[item.level]}} onClick={()=>toggle(gi)}>
                  <div className="dl-check"><span className="dl-check-ico">✓</span></div>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:".25rem",flexWrap:"wrap"}}>
                      <span className="dl-date">{item.date}</span><span className="dl-title">{item.title}</span>
                      <span className="dl-level" style={{color:LVL_COLOR[item.level],background:LVL_COLOR[item.level]+"18"}}>{LVL_LABEL[item.level]}</span>
                    </div>
                    <div className="dl-desc">{item.desc}</div>
                  </div>
                </div>
              );})}
            </div>
          ))}
        </div>
        <div className="modal-foot" style={{flexDirection:"column",gap:".5rem"}}>
          {!sent?(<div style={{background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:9,padding:".75rem"}}>
            <div style={{fontSize:".75rem",fontWeight:600,marginBottom:".4rem"}}>📧 Ricevi via email</div>
            <div style={{display:"flex",gap:".4rem"}}>
              <input style={{flex:1,background:"var(--bg)",border:"1px solid var(--bd)",borderRadius:7,color:"var(--tx)",padding:".45rem .65rem",fontSize:".8rem"}} value={email} onChange={e=>{setEmail(e.target.value);setErr(null);}} placeholder="email@example.it" type="email"/>
              <button className="btn" style={{padding:".45rem .85rem",fontSize:".78rem"}} disabled={!email||!countSel||loading} onClick={send}>{loading?"⏳":"Invia ("+countSel+")"}</button>
            </div>
            {err&&<div style={{fontSize:".7rem",color:"#ff8585",marginTop:".35rem"}}>⚠️ {err}</div>}
          </div>):(<div style={{background:"rgba(52,194,122,.1)",border:"1px solid rgba(52,194,122,.3)",borderRadius:9,padding:".75rem",textAlign:"center"}}><div style={{fontWeight:700,color:"var(--gr)"}}>✅ Inviato a {email}</div></div>)}
          <div style={{fontSize:".63rem",color:"var(--mu)"}}>⚠️ Scadenze indicative 2025, verificare proroghe.</div>
        </div>
      </div>
    </div>
  );
}
export function ModuloSimulatore(){
  const [form,setForm]=useState({fatturato:"",altri:"",altriTipo:"nessuno",ateco:ATECO[0],primiAnni:false});
  const [results,setResults]=useState(null);const [calModal,setCalModal]=useState(null);
  const up=(k,v)=>setForm(p=>({...p,[k]:v}));
  const valid=parseFloat(form.fatturato)>0;
  const ORDER=["occasionale","forfettario","ordinario","srl","snc"];
  const winner=results?ORDER.filter(id=>!results[id].blocked&&results[id].netto>0).reduce((b,id)=>(!b||results[id].netto>results[b].netto?id:b),null):null;
  const is={background:"var(--s2)",border:"1px solid var(--bd)",borderRadius:8,color:"var(--tx)",padding:".52rem .75rem",fontSize:".82rem",width:"100%",WebkitAppearance:"none",appearance:"none"};
  const ss={...is,backgroundImage:"url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%236b7a99' stroke-width='1.5' fill='none'/%3E%3C/svg%3E\")",backgroundRepeat:"no-repeat",backgroundPosition:"right .7rem center",paddingRight:"2rem"};
  return(
    <div className="page">
      {calModal&&<CalendarModal regimeId={calModal} onClose={()=>setCalModal(null)}/>}
      <div className="page-hdr"><div className="page-title">📊 Simulatore Fiscale</div><div className="page-sub">Confronto regimi fiscali · Italia 2025</div></div>
      <div className="card">
        <div className="card-title" style={{marginBottom:"1rem"}}>Inserisci i dati</div>
        <div className="form-grid">
          <div className="fg"><label>Fatturato presunto (€)</label><input type="number" placeholder="es. 20.000" value={form.fatturato} onChange={e=>up("fatturato",e.target.value)} style={is}/></div>
          <div className="fg"><label>Altri redditi (€)</label><input type="number" placeholder="es. 43.000" value={form.altri} onChange={e=>up("altri",e.target.value)} style={is}/></div>
          <div className="fg"><label>Tipo altri redditi</label><select value={form.altriTipo} onChange={e=>up("altriTipo",e.target.value)} style={ss}><option value="nessuno">Nessun altro reddito</option><option value="dipendente">Lavoro dipendente (RAL)</option><option value="pensione">Pensione</option><option value="altro">Altro reddito</option></select></div>
          <div className="fg"><label>Settore ATECO</label><select value={form.ateco.label} onChange={e=>up("ateco",ATECO.find(a=>a.label===e.target.value))} style={ss}>{ATECO.map(a=><option key={a.label}>{a.label}</option>)}</select></div>
        </div>
        <div className="tgl-row" onClick={()=>up("primiAnni",!form.primiAnni)}><div className={"tgl"+(form.primiAnni?" on":"")}/><span className="tgl-lbl">Primi 5 anni – imposta sostitutiva 5%</span></div>
        <button className="btn full" disabled={!valid} onClick={()=>valid&&setResults(calcAll(form))}>Calcola e confronta →</button>
      </div>
      {results&&(
        <>
          <div style={{fontFamily:"'Playfair Display',serif",fontSize:"1rem",fontWeight:700,marginBottom:".85rem"}}>Confronto regimi</div>
          <div className="rg-grid">{ORDER.map(id=>{const r=results[id],isW=id===winner;return(
            <div key={id} className={"rc"+(isW?" winner":"")+(r.blocked?" blocked":"")}>
              <div className="rc-hdr"><div className="rc-name">{r.name}</div>{isW&&<span className="bdg bdg-gold">★ Migliore</span>}{r.blocked&&<span className="bdg bdg-red">Escluso</span>}</div>
              {r.warn&&<div className="warn">⚠ {r.warn}</div>}
              {r.rows.map(([l,v])=><div key={l} className="rc-row"><span className="rc-rl">{l}</span><span className="rc-rv">{v}</span></div>)}
              <div className="rc-netto"><span className="rc-nl">{id==="srl"?"Liquidità soc.":"Netto in tasca"}</span><span className="rc-nv" style={{color:isW?"var(--gld2)":r.netto<0?"var(--rd)":"var(--gr)"}}>{fmt0(r.netto)}</span></div>
              <div className="rc-note">{r.note}</div>
              {!r.blocked&&<button className="cal-btn" onClick={()=>setCalModal(id)}>📅 Calendario Fiscale →</button>}
            </div>
          );})}
          </div>
          <div className="disc"><strong style={{color:"var(--tx)"}}>⚠️ Disclaimer</strong> — Strumento informativo. Non sostituisce la consulenza di un Dottore Commercialista.</div>
        </>
      )}
    </div>
  );
}

// ─── APP ROOT ────────────────────────────────────────────────
const NAV = [
  {section:"STUDIO",items:[{id:"dashboard",ico:"🏠",label:"Dashboard"},{id:"clienti",ico:"👥",label:"Clienti"},{id:"import",ico:"📤",label:"Import Excel"},{id:"utenti",ico:"👤",label:"Utenti Studio"},{id:"impostazioni",ico:"⚙️",label:"Impostazioni Studio"},{id:"deleghe",ico:"🔑",label:"Deleghe Uniche"}]},
  {section:"DOCUMENT HUB",items:[{id:"import_documenti",ico:"📁",label:"Import Documenti"},{id:"export_dati",ico:"📤",label:"Export Dati"},{id:"fatture_ade",ico:"📥",label:"Fatture Massive ADE"},{id:"lettura_mail",ico:"📧",label:"Lettura Mail"},{id:"richieste_fatture",ico:"📡",label:"Richieste Fatture ADE"}]},
  {section:"CONTABILITÀ",items:[{id:"contabilita",ico:"📒",label:"Prima Nota"},{id:"piano_conti",ico:"🗂️",label:"Piano dei Conti"},{id:"partitario",ico:"💳",label:"Partitario"},{id:"bilancio",ico:"📊",label:"Bilancio"}]},
  {section:"STRUMENTI",items:[{id:"iva",ico:"💧",label:"Liquidazione IVA"},{id:"f24",ico:"📋",label:"Gestione F24"},{id:"simulatore",ico:"📊",label:"Simulatore Fiscale"},{id:"ammortamenti",ico:"🏢",label:"Ammortamenti"},{id:"cu",ico:"📜",label:"Certificazioni Uniche"}]},
  {section:"COMUNICAZIONI",items:[{id:"adempimenti",ico:"📬",label:"Adempimenti"},{id:"agenda",ico:"📅",label:"Agenda Invii"}]},
];

// GUIDA MODULI - Descrizione dettagliata di ogni modulo
const GUIDA_MODULI = {
  dashboard: {
    nome: "Dashboard",
    ico: "🏠",
    desc: "Panoramica generale dello studio con statistiche, clienti recenti, F24 in scadenza e accesso rapido a tutti i moduli.",
    uso: "Punto di partenza per monitorare l'attività quotidiana dello studio."
  },
  clienti: {
    nome: "Clienti",
    ico: "👥",
    desc: "Anagrafica completa dei clienti con tutti i dati fiscali (CF, P.IVA, regime), contatti, email CC e moduli attivi per ogni cliente.",
    uso: "Gestisci l'anagrafica clienti, assegna responsabili e configura i moduli attivi."
  },
  import: {
    nome: "Import Excel",
    ico: "📤",
    desc: "Importazione massiva di dati da file Excel per popolare rapidamente l'anagrafica clienti o altri dati.",
    uso: "Carica file Excel con i dati dei clienti per importarli automaticamente."
  },
  utenti: {
    nome: "Utenti Studio",
    ico: "👤",
    desc: "Gestione degli utenti dello studio con ruoli (Owner, Admin, Collaboratore) e permessi granulari per ogni modulo.",
    uso: "Crea utenti, assegna ruoli e configura i permessi di accesso ai vari moduli."
  },
  impostazioni: {
    nome: "Impostazioni Studio",
    ico: "⚙️",
    desc: "Dati del titolare e dello studio utilizzati per le deleghe ADE, richieste fatture e comunicazioni ufficiali.",
    uso: "Configura i dati del titolare (CF, P.IVA) e dello studio."
  },
  deleghe: {
    nome: "Deleghe Uniche",
    ico: "🔑",
    desc: "Gestione delle Deleghe Uniche ADE per il download delle fatture elettroniche. Monitoraggio scadenze e alert automatici.",
    uso: "Registra le deleghe, monitora le scadenze e invia alert ai responsabili."
  },
  import_documenti: {
    nome: "Import Documenti",
    ico: "📁",
    desc: "Document Hub centrale per caricare qualsiasi documento. L'AI classifica automaticamente il tipo (fattura, F24, avviso ADE, etc.) e abbina il cliente tramite CF/P.IVA.",
    uso: "Carica PDF/XML, l'AI li classifica e li smista nei moduli corretti. Workflow: AI propone → operatore conferma."
  },
  export_dati: {
    nome: "Export Dati",
    ico: "📤",
    desc: "Hub centralizzato per l'esportazione di tutti i file telematici: CU (.TEL), LIPE (XML), 770, IVA Annuale, Intrastat, F24 e stampe contabili.",
    uso: "Seleziona il tipo di export desiderato e il sistema ti guiderà al modulo specifico per la generazione del file."
  },
  fatture_ade: {
    nome: "Fatture Massive ADE",
    ico: "📥",
    desc: "Importazione massiva delle fatture elettroniche scaricate dall'Agenzia delle Entrate. Estrae XML dallo ZIP e li smista nelle cartelle clienti.",
    uso: "Carica lo ZIP da ADE, il sistema estrae le fatture XML e le organizza per cliente."
  },
  lettura_mail: {
    nome: "Lettura Mail",
    ico: "📧",
    desc: "Lettura automatica delle caselle email dello studio. Estrae allegati (PDF, XML), li classifica con AI e li smista automaticamente. Le email rimangono non lette.",
    uso: "Seleziona la casella email, il sistema legge le mail non lette, estrae gli allegati e li classifica automaticamente."
  },
  contabilita: {
    nome: "Prima Nota",
    ico: "📒",
    desc: "Registrazione delle scritture contabili in Prima Nota. Import automatico da fatture XML con proposta AI. Split-screen con PDF originale per verifica. Supporta ordinaria, semplificata, professionisti e IVA per cassa.",
    uso: "Registra scritture manualmente o importa da fatture XML. L'AI propone i conti, l'operatore conferma o modifica."
  },
  piano_conti: {
    nome: "Piano dei Conti",
    ico: "🗂️",
    desc: "Gestione del Piano dei Conti con struttura gerarchica (Mastro → Conto → Sottoconto). Import da PDF NES. Anagrafica clienti/fornitori integrata. Duplicazione società.",
    uso: "Importa il piano conti da PDF, gestisci i conti, crea clienti/fornitori automaticamente dalle fatture."
  },
  partitario: {
    nome: "Partitario",
    ico: "💳",
    desc: "Gestione scadenze clienti e fornitori. Visualizza partite aperte, parziali e chiuse. Collegamento automatico incassi/pagamenti.",
    uso: "Monitora le scadenze, registra incassi e pagamenti che chiudono automaticamente le partite."
  },
  bilancio: {
    nome: "Bilancio",
    ico: "📊",
    desc: "Bilancio di verifica, situazione patrimoniale ed economica. Stampa giornale e mastrini. Export per TeamSystem.",
    uso: "Genera i prospetti contabili, stampa il giornale, esporta per altri software."
  },
  richieste_fatture: {
    nome: "Richieste Fatture ADE",
    ico: "📡",
    desc: "Generazione dei file XML per richiedere il download massivo delle fatture elettroniche dall'Agenzia delle Entrate.",
    uso: "Seleziona i clienti, il periodo e genera l'XML da inviare ad ADE per il download massivo."
  },
  iva: {
    nome: "Liquidazione IVA",
    ico: "💧",
    desc: "Calcolo e gestione delle liquidazioni IVA periodiche (mensili/trimestrali) con generazione prospetti e comunicazioni clienti.",
    uso: "Registra IVA vendite/acquisti, calcola il saldo e genera le comunicazioni per i clienti."
  },
  f24: {
    nome: "Gestione F24",
    ico: "📋",
    desc: "Tabellone completo per la gestione degli F24 con tutte le scadenze, importi, stati e tracciamento pagamenti.",
    uso: "Monitora tutti gli F24, registra i pagamenti e tieni traccia delle scadenze."
  },
  simulatore: {
    nome: "Simulatore Fiscale",
    ico: "📊",
    desc: "Simulazione comparativa dei regimi fiscali (forfettario, ordinario, SRL) per aiutare i clienti a scegliere il regime più conveniente.",
    uso: "Inserisci i dati del cliente e confronta il carico fiscale nei diversi regimi."
  },
  ammortamenti: {
    nome: "Ammortamenti",
    ico: "🏢",
    desc: "Registro dei beni ammortizzabili con calcolo automatico delle quote annuali e monitoraggio del fondo ammortamento.",
    uso: "Registra i beni, imposta le aliquote e monitora l'ammortamento nel tempo."
  },
  cu: {
    nome: "Certificazioni Uniche",
    ico: "📜",
    desc: "Gestione delle Certificazioni Uniche (CU) per autonomi e dipendenti con generazione file .tel per Entratel.",
    uso: "Registra i dati delle CU e genera i file per l'invio telematico."
  },
  adempimenti: {
    nome: "Adempimenti",
    ico: "📬",
    desc: "Gestione degli adempimenti fiscali periodici con template email, allegati e tracciamento delle comunicazioni inviate ai clienti.",
    uso: "Configura gli adempimenti, prepara le email e monitora gli invii."
  },
  agenda: {
    nome: "Agenda Invii",
    ico: "📅",
    desc: "Calendario degli invii programmati con vista per mese, scadenze e stato delle comunicazioni.",
    uso: "Pianifica gli invii, visualizza il calendario e monitora le comunicazioni programmate."
  }
};

function GuidaModuliModal({onClose}){
  const [search,setSearch]=useState('');
  const moduli=Object.entries(GUIDA_MODULI).filter(([k,v])=>{
    if(!search)return true;
    const s=search.toLowerCase();
    return v.nome.toLowerCase().includes(s)||v.desc.toLowerCase().includes(s);
  });
  return(
    <div className="overlay" onMouseDown={e=>e.target===e.currentTarget&&onClose()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:700,maxHeight:'90vh'}}>
        <div className="modal-hdr">
          <div className="modal-drag"/>
          <div className="modal-title">ℹ️ Guida Moduli FiscoSim</div>
          <div className="modal-sub">Scopri cosa fa ogni modulo dell'applicazione</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{padding:'1rem'}}>
          <input className="search-bar" placeholder="🔍 Cerca modulo..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:'1rem'}}/>
          <div style={{display:'flex',flexDirection:'column',gap:'.75rem'}}>
            {moduli.map(([id,m])=>(
              <div key={id} style={{background:'var(--s2)',border:'1px solid var(--bd)',borderRadius:10,padding:'.85rem 1rem'}}>
                <div style={{display:'flex',alignItems:'center',gap:'.6rem',marginBottom:'.4rem'}}>
                  <span style={{fontSize:'1.3rem'}}>{m.ico}</span>
                  <span style={{fontFamily:"'Playfair Display',serif",fontSize:'.95rem',fontWeight:700}}>{m.nome}</span>
                </div>
                <div style={{fontSize:'.78rem',color:'var(--tx)',lineHeight:1.5,marginBottom:'.4rem'}}>{m.desc}</div>
                <div style={{fontSize:'.72rem',color:'var(--gold)',fontStyle:'italic'}}>💡 {m.uso}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn" onClick={onClose}>Chiudi</button>
        </div>
      </div>
    </div>
  );
}

// ── RUOLI PERMESSI ──────────────────────────────────────────
// owner  → tutto (unico che gestisce utenti e ruoli)
// admin  → tutto tranne gestione utenti studio
// collaboratore → legge e inserisce, non elimina, non esporta
const RUOLI_INFO = {
  owner:        { label:"Owner",        color:"bdg-gold", desc:"Accesso totale · Gestione utenti e ruoli · Unico account amministratore" },
  admin:        { label:"Admin",        color:"bdg-blue", desc:"Accesso totale a tutti i moduli · Non può gestire utenti studio" },
  collaboratore:{ label:"Collaboratore",color:"bdg-gray", desc:"Permessi configurabili per ogni collaboratore" },
};
const puoGestireUtenti = r => r==="owner";

// Struttura permessi default per collaboratore
// leggi = può vedere i dati
// modifica = può creare/modificare
// elimina = può eliminare (default sempre false per collaboratori)
// solo_assegnati = vede solo i clienti assegnati a lui (solo per clienti)
const PERMESSI_MODULI = [
  { id:"clienti",      label:"Clienti",          ico:"👥", hasSoloAssegnati:true },
  { id:"f24",          label:"Gestione F24",      ico:"📋", hasSoloAssegnati:false },
  { id:"iva",          label:"Liquidazione IVA",  ico:"💧", hasSoloAssegnati:false },
  { id:"ammortamenti", label:"Ammortamenti",      ico:"🏢", hasSoloAssegnati:false },
  { id:"adempimenti",  label:"Adempimenti",       ico:"📬", hasSoloAssegnati:false },
  { id:"agenda",       label:"Agenda Invii",      ico:"📅", hasSoloAssegnati:false },
  { id:"simulatore",   label:"Simulatore",        ico:"📊", hasSoloAssegnati:false },
  { id:"import",       label:"Import Excel",      ico:"📤", hasSoloAssegnati:false },
  { id:"import_documenti",label:"Import Documenti",ico:"📁", hasSoloAssegnati:false },
  { id:"dashboard",    label:"Dashboard",         ico:"🏠", hasSoloAssegnati:false },
  { id:"cu",           label:"Certificazioni Uniche",ico:"📜", hasSoloAssegnati:false },
  { id:"deleghe",      label:"Deleghe Uniche",      ico:"🔑", hasSoloAssegnati:false },
  { id:"richieste_fatture",label:"Richieste Fatture",  ico:"📡", hasSoloAssegnati:false },
  { id:"impostazioni",   label:"Impostazioni Studio",ico:"⚙️", hasSoloAssegnati:false },
];

const PERMESSI_DEFAULT = Object.fromEntries(
  PERMESSI_MODULI.map(m => [m.id, {
    leggi: true,
    modifica: false,
    elimina: false,
    solo_assegnati: false,
  }])
);

// Helper: ottieni permessi effettivi per utente
function getPermessi(utente) {
  if (!utente) return null;
  if (utente.ruolo === "owner" || utente.ruolo === "admin") {
    // owner e admin hanno tutto
    return Object.fromEntries(PERMESSI_MODULI.map(m => [m.id, {leggi:true,modifica:true,elimina:true,solo_assegnati:false}]));
  }
  // collaboratore: usa permessi salvati o default
  return { ...PERMESSI_DEFAULT, ...(utente.permessi || {}) };
}

function canLeggi(perm, modulo)    { return perm?.[modulo]?.leggi    !== false; }
function canModifica(perm, modulo) { return perm?.[modulo]?.modifica === true; }
function canElimina(perm, modulo)  { return perm?.[modulo]?.elimina  === true; }
function isSoloAssegnati(perm, modulo) { return perm?.[modulo]?.solo_assegnati === true; }

// ── LOGIN ────────────────────────────────────────────────────
