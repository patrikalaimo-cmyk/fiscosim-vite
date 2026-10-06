import { useState } from 'react'

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
    desc: "Calcolo e gestione delle liquidazioni IVA periodiche (mensili/trimestrali) nel percorso fiscale di Contabilità, con generazione prospetti e comunicazioni clienti.",
    uso: "Apri Contabilità e usa la sezione Adempimenti fiscali per liquidazioni IVA, LIPE e IVA annuale."
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

export function GuidaModuliModal({onClose}){
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
