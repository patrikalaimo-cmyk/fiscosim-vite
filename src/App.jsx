import { useState, useEffect } from 'react'
import { sb } from './lib/supabase'

// Context
import { AIStatusProvider, AIBadge } from './context/AIStatusContext'
import { TestModeBadge } from './context/TestModeContext'

// Shared
import { NAV, RUOLI_INFO, PERMESSI_MODULI, FISCAL_KNOWLEDGE_PANEL_SHORTCUT_LABEL } from './shared/constants'
import { getPermessi, canLeggi, canModifica, puoGestireUtenti, puoGestireRegoleFiscaliIA, tomorrowStr } from './shared/utils'
import { AccessDenied } from './shared/components'

// Modules
import { Dashboard }              from './modules/dashboard'
import { ModuloImpostazioni }     from './modules/impostazioni'
import { ModuloImpostazioniProcedure } from './modules/impostazioni_procedure'
import { ModuloDeleghe }          from './modules/deleghe'
import { ModuloImportUnificato }  from './modules/import_unificato'
import { ModuloExportDati }       from './modules/export_dati'
import { ModuloContabilita }      from './modules/contabilita'
import { ModuloPianoConti }       from './modules/piano_conti'
import { ModuloPartitario }       from './modules/partitario'
import { ModuloBilancio }         from './modules/bilancio'
import { ModuloLetturaMail }      from './modules/lettura_mail'
import { ModuloFattureADE }       from './modules/fatture_ade'
import { ModuloRichiesteFatture } from './modules/richieste_fatture'
import { ModuloClienti }          from './modules/clienti'
import { ModuloImportExcel }      from './modules/import_excel'
import { ModuloUtenti }           from './modules/utenti'
import { ModuloF24 }              from './modules/f24'
import { ModuloAmmortamenti }     from './modules/ammortamenti'
import { ModuloAdempimenti }      from './modules/adempimenti'
import { ModuloAgenda }           from './modules/agenda'
import { ModuloCU }               from './modules/cu'
import { ModuloAIAgent }          from './modules/ai_agent'
import { ModuloRevisioneDich }    from './modules/revisione_dich'
import { ModuloSimulatore }       from './modules/simulatore'
import { ModuloAgeCon }           from './modules/agecon'

// Login (inline - piccolo)
import { Login }                  from './modules/login'
import { ModuloTestMode }         from './modules/test_mode'

// Guida moduli (inline - dati statici)
import { GuidaModuliModal }       from './modules/guida'
import { PipelineDebugPanel }     from './components/PipelineDebugPanel.jsx'
import { useFiscalKnowledgeAdmin } from './components/FiscalKnowledgeAdmin.jsx'

const WORKSPACE_SECTION_COPY = {
  'AI AGENT': 'Assistente operativo e strumenti AI a supporto dello studio.',
  STUDIO: 'Panoramica studio, configurazione e aree amministrative.',
  'DOCUMENT HUB': 'Flussi documentali, raccolta input e lavorazione operativa.',
  CONTABILITA: 'Scritture, controlli contabili e workspace fiscale.',
  STRUMENTI: 'Moduli di supporto operativo e simulazione.',
  COMUNICAZIONI: 'Invii, agenda e adempimenti verso l\'esterno.',
}

function ShellIcon({ itemId, className = '' }) {
  const stroke = 'currentColor'
  const props = {
    className,
    viewBox: '0 0 24 24',
    fill: 'none',
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  }

  switch (itemId) {
    case 'dashboard':
      return <svg {...props}><path d="M4 5.5h7v5H4zM13 5.5h7v8h-7zM4 12.5h7v6H4zM13 15.5h7v3h-7z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" /></svg>
    case 'clienti':
    case 'utenti':
      return <svg {...props}><path d="M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM16.5 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5ZM3.5 18.5c.8-2.4 3-3.5 4.8-3.5 1.8 0 4 .9 4.7 3M13 18c.5-1.6 1.9-2.5 3.5-2.5 1.4 0 2.8.7 3.5 2" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'import':
    case 'import_unificato':
    case 'export_dati':
      return <svg {...props}><path d="M12 3v11M7.5 9.5 12 14l4.5-4.5M5 19h14" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'fatture_ade':
    case 'richieste_fatture':
    case 'cu':
    case 'adempimenti':
      return <svg {...props}><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A2.5 2.5 0 0 1 5 18V6a2.5 2.5 0 0 1 2-2.5Z" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" /><path d="M14 3.5V8h4" stroke={stroke} strokeWidth="1.7" strokeLinejoin="round" /></svg>
    case 'guide_moduli':
      return <svg {...props}><path d="M6 5.5A2.5 2.5 0 0 1 8.5 3H19v15.5H8.5A2.5 2.5 0 0 0 6 21V5.5Zm0 0H4.5V19A2 2 0 0 0 6.5 21H8" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'lettura_mail':
    case 'agenda':
      return <svg {...props}><path d="M4 7.5 12 13l8-5.5M5.5 18.5h13a1.5 1.5 0 0 0 1.5-1.5v-9A1.5 1.5 0 0 0 18.5 6.5h-13A1.5 1.5 0 0 0 4 8v9a1.5 1.5 0 0 0 1.5 1.5Z" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'contabilita':
      return <svg {...props}><rect x="3.75" y="6.25" width="16.5" height="11.5" rx="2.2" stroke={stroke} strokeWidth="1.7" /><path d="M3.75 10.25h16.5M8 14.25h3M14.25 14.25h1.75" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'piano_conti':
    case 'partitario':
    case 'bilancio':
    case 'ammortamenti':
      return <svg {...props}><path d="M5 6.5h14M5 12h14M5 17.5h9M7.5 4v16" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'f24':
      return <svg {...props}><path d="m6 7 2.2-2.2 3.1 3.1L9.1 10M14.9 14l2.2 2.2-3.1 3.1-2.2-2.2M8.6 17.7 17 9.3M13.3 6.2l4.5 4.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'simulatore':
    case 'revisione_dich':
    case 'agecon':
      return <svg {...props}><path d="M5 16.5 9.5 11l3 3L19 7.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /><path d="M18.5 12v-5h-5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'ai_agent':
      return <svg {...props}><path d="M9 4.5h6M12 3v3M7 10.5h10M8 20.5h8a2 2 0 0 0 2-2v-8a4 4 0 0 0-4-4H10a4 4 0 0 0-4 4v8a2 2 0 0 0 2 2ZM9.25 14.5h.01M14.75 14.5h.01" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'impostazioni':
    case 'impostazioni_procedure':
      return <svg {...props}><path d="m12 8.2.9-2.2 2.2.2.9 2 2.1 1-.7 2.1 1.5 1.6-1.5 1.6.7 2.1-2.1 1-.9 2-2.2.2-.9-2.2-2.2-.9-2 .9-.9 2.2-2.2-.2-.9-2-2.1-1 .7-2.1L3.5 13l1.5-1.6-.7-2.1 2.1-1 .9-2 2.2-.2.9 2.2L12 8.2Z" stroke={stroke} strokeWidth="1.4" strokeLinejoin="round" /><circle cx="12" cy="13" r="2.7" stroke={stroke} strokeWidth="1.7" /></svg>
    case 'deleghe':
      return <svg {...props}><path d="M7.5 8.5h9M7.5 12h9M7.5 15.5h5M6 4.5h12A1.5 1.5 0 0 1 19.5 6v12A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V6A1.5 1.5 0 0 1 6 4.5Z" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    case 'test_mode':
      return <svg {...props}><path d="M9 4.5h6M10 4.5v3.3l-4.4 7.8A3.2 3.2 0 0 0 8.4 20.5h7.2a3.2 3.2 0 0 0 2.8-4.9L14 7.8V4.5" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
    default:
      return <svg {...props}><circle cx="12" cy="12" r="6.5" stroke={stroke} strokeWidth="1.7" /></svg>
  }
}

function PinIcon({ pinned, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={pinned ? 'M9 4.5h6l-1.2 5.3 2.7 2.7H7.5l2.7-2.7L9 4.5ZM12 12.5v7' : 'M9 4.5h6l-1.2 5.3 2.7 2.7H7.5l2.7-2.7L9 4.5ZM12 12.5l3.5 6.5'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChevronIcon({ open, className = '' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d={open ? 'M7 10.5 12 15l5-4.5' : 'M10 7.5 14.5 12 10 16.5'} stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function buildNavIndex() {
  const byId = new Map()
  const sectionById = new Map()
  for (const section of NAV) {
    for (const item of section.items) {
      byId.set(item.id, item)
      sectionById.set(item.id, section)
    }
  }
  return { byId, sectionById }
}

const NAV_INDEX = buildNavIndex()
function App() {
  const [tab, setTab] = useState('dashboard')
  const [alertCount, setAlertCount] = useState(0)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [utente, setUtente] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showGuida, setShowGuida] = useState(false)
  const [fkPanelOpen, setFkPanelOpen] = useState(false)
  const [sidebarPinned, setSidebarPinned] = useState(false)
  const [openSection, setOpenSection] = useState(null)
  const [workspaceContext, setWorkspaceContext] = useState('')

  useEffect(() => {
    const h = e => { e.preventDefault(); setDeferredPrompt(e); setShowInstall(true) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])

  useEffect(() => {
    if (!utente) return
    const dom = tomorrowStr()
    sb.from('invii_schedulati').select('*', { count: 'exact', head: true })
      .eq('stato', 'programmato').eq('data_invio', dom)
      .then(({ count }) => setAlertCount(count || 0))
  }, [utente])

  useEffect(() => {
    if (!utente) return
    const syncFromHash = () => {
      const raw = (window.location.hash || '').replace(/^#\/?/, '')
      if (raw === 'impostazioni-procedure' || raw === 'impostazioni_procedure') setTab('impostazioni_procedure')
    }
    syncFromHash()
    window.addEventListener('hashchange', syncFromHash)
    return () => window.removeEventListener('hashchange', syncFromHash)
  }, [utente])

  useEffect(() => {
    if (!utente) return
    if (tab === 'impostazioni_procedure' && window.location.hash !== '#/impostazioni-procedure') {
      window.history.replaceState(null, '', '#/impostazioni-procedure')
    }
  }, [tab, utente])

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstall(false)
  }
  const logout = () => { setUtente(null); setTab('dashboard'); setShowLogoutConfirm(false) }
  const navigateTo = (nextTab) => {
    if (nextTab === 'import_nuovo') {
      setTab('import_unificato')
      return
    }
    if (nextTab === 'iva') {
      try {
        localStorage.setItem('contabilita_sub_tab', 'liquidazioni_iva')
      } catch {
        /* ignore */
      }
      setTab('contabilita')
      return
    }
    setTab(nextTab)
  }

  useEffect(() => {
    if (tab === 'import_nuovo') {
      navigateTo('import_nuovo')
    } else if (tab === 'iva') {
      navigateTo('iva')
    }
  }, [tab])

  const ruoloForFk = utente?.ruolo || 'collaboratore'
  const fkAdmin = useFiscalKnowledgeAdmin({
    utente,
    ruolo: ruoloForFk,
    panelOpen: fkPanelOpen,
    setPanelOpen: setFkPanelOpen,
  })

  const activeSection = NAV_INDEX.sectionById.get(tab) || null
  const activeVisibleSectionKey = activeSection?.section || null

  useEffect(() => {
    if (activeVisibleSectionKey) {
      setOpenSection(activeVisibleSectionKey)
    }
  }, [activeVisibleSectionKey])

  useEffect(() => {
    if (tab !== 'contabilita') {
      setWorkspaceContext('')
    }
  }, [tab])

  if (!utente) return <Login onLogin={u => { setUtente(u); setTab('dashboard') }} />

  const ruolo = utente.ruolo || 'collaboratore'
  const perm = getPermessi(utente)
  const initials = (utente.nome || '?').charAt(0) + (utente.cognome || '').charAt(0) || '?'
  const activeNavItem = NAV_INDEX.byId.get(tab) || { id: tab, label: 'Workspace' }
  const workspaceSubtitle = tab === 'contabilita'
    ? workspaceContext
    : activeSection
      ? (WORKSPACE_SECTION_COPY[activeSection.section] || '')
      : ''
  const activeShellIcon = activeNavItem.id

  const navFiltrato = NAV.map(s => ({
    ...s,
    items: s.items.filter(item => {
      if (item.id === 'utenti' && !puoGestireUtenti(ruolo)) return false
      if (ruolo === 'collaboratore' && !canLeggi(perm, item.id)) return false
      return true
    })
  })).filter(s => s.items.length > 0)
  const activeVisibleSection = navFiltrato.find((s) => s.section === activeSection?.section) || navFiltrato[0] || null

  const handleSectionClick = (section) => {
    if (section.items.length === 1) {
      navigateTo(section.items[0].id)
      return
    }
    setOpenSection((current) => (current === section.section ? null : section.section))
  }

  return (
    <AIStatusProvider>
      <div className={'app app-shell' + (sidebarPinned ? ' sidebar-pinned' : '')}>
        <AIBadge />
        <TestModeBadge />
        <PipelineDebugPanel />
        {fkAdmin.introModal}
        {fkAdmin.reviewModal}
        {fkAdmin.rulesPanel}

        {showGuida && <GuidaModuliModal onClose={() => setShowGuida(false)} />}

        {showLogoutConfirm && (
          <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setShowLogoutConfirm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <div className="modal-hdr">
                <div className="modal-drag" />
                <div className="modal-title">Disconnetti</div>
                <button className="modal-close" onClick={() => setShowLogoutConfirm(false)}>&times;</button>
              </div>
              <div className="modal-body">
                <div style={{ textAlign: 'center', padding: '.5rem 0' }}>
                  <div style={{ fontSize: '1.1rem', marginBottom: '.5rem', color: 'var(--gold)', fontWeight: 700 }}>FS</div>
                  <div style={{ fontWeight: 600, marginBottom: '.25rem' }}>Ciao {utente.nome}!</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>Vuoi disconnetterti da FiscoSim?</div>
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn-sec" onClick={() => setShowLogoutConfirm(false)}>Annulla</button>
                <button className="btn" style={{ background: 'var(--rd)', backgroundImage: 'none' }} onClick={logout}>Disconnetti</button>
              </div>
            </div>
          </div>
        )}
        <aside className="sidebar" aria-label="Navigazione principale">
          <div className="sb-logo">
            <div className="sb-logo-row">
              <div className="sb-logo-ico"><ShellIcon itemId={activeVisibleSection?.items?.[0]?.id || 'dashboard'} className="shell-icon shell-icon-brand" /></div>
              <div className="sb-logo-copy">
                <div className="sb-logo-t">FiscoSim</div>
                <div className="sb-logo-v">V6 Professional</div>
              </div>
              <button
                type="button"
                className={'sb-pin-btn' + (sidebarPinned ? ' active' : '')}
                onClick={() => setSidebarPinned((v) => !v)}
                title={sidebarPinned ? 'Sblocca menu' : 'Blocca menu'}
              >
                <PinIcon pinned={sidebarPinned} className="shell-icon shell-icon-pin" />
              </button>
            </div>
          </div>

          {navFiltrato.map((section) => {
            const isOpen = openSection === section.section
            const hasChildren = section.items.length > 1
            const isSectionActive = section.items.some((item) => item.id === tab)
            const primaryItem = section.items[0]

            return (
              <div key={section.section} className={'sb-group' + (isOpen ? ' open' : '')}>
                <button
                  type="button"
                  className={'sb-parent' + (isSectionActive ? ' active' : '')}
                  onClick={() => handleSectionClick(section)}
                  title={section.section}
                >
                  <span className="sb-item-ico"><ShellIcon itemId={primaryItem.id} className="shell-icon" /></span>
                  <span className="sb-item-label">{section.section}</span>
                  {hasChildren && (
                    <span className="sb-parent-chevron" aria-hidden="true">
                      <ChevronIcon open={isOpen} className="shell-icon" />
                    </span>
                  )}
                </button>

                {hasChildren && (
                  <div className="sb-submenu" aria-hidden={!isOpen}>
                    {section.items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={'sb-subitem' + (tab === item.id ? ' active' : '')}
                        onClick={() => navigateTo(item.id)}
                        title={item.label}
                      >
                        <span className="sb-item-ico"><ShellIcon itemId={item.id} className="shell-icon" /></span>
                        <span className="sb-item-label">{item.label}</span>
                        {item.id === 'agenda' && alertCount > 0 && <span className="sb-badge">{alertCount}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <div className="sb-footer">
            {ruolo === 'owner' && (
            <div className="sb-footer-entry">
              <button
                type="button"
                onClick={() => setTab('test_mode')}
                className={'sb-item sb-footer-item' + (tab === 'test_mode' ? ' active' : '')}
                title="Test Suite"
              >
                <span className="sb-item-ico"><ShellIcon itemId="test_mode" className="shell-icon" /></span>
                <span className="sb-item-label">Test Suite</span>
              </button>
            </div>
          )}
          <div className="sb-footer-entry">
              <button
                type="button"
                className="sb-item sb-footer-item sb-footer-guide"
                onClick={() => setShowGuida(true)}
                title="Guida moduli"
              >
                <span className="sb-item-ico"><ShellIcon itemId="guide_moduli" className="shell-icon" /></span>
                <span className="sb-item-label">Guida moduli</span>
              </button>
            </div>
            <div className="sb-user" style={{ cursor: 'pointer' }} onClick={() => setShowLogoutConfirm(true)} title="Clicca per disconnetterti">
              <div className="sb-avatar">{initials}</div>
              <div className="sb-user-copy" style={{ flex: 1, minWidth: 0 }}>
                <div className="sb-user-name">{utente.nome} {utente.cognome || ''}</div>
                <div className="sb-user-role">{RUOLI_INFO[ruolo]?.label || ruolo} &middot; Esci</div>
              </div>
            </div>
            </div>
        </aside>
        <main className="content workspace-shell">
          <div className="workspace-topbar">
            <div className="workspace-title-wrap">
              <div className="workspace-eyebrow">{activeVisibleSection?.section || 'Workspace'}</div>
              <div className="workspace-title-row">
                <h1 className="workspace-title">{activeNavItem.label}</h1>
                {activeShellIcon && (
                  <span className="workspace-title-ico">
                    <ShellIcon itemId={activeShellIcon} className="shell-icon shell-icon-title" />
                  </span>
                )}
              </div>
              {workspaceSubtitle && <p className="workspace-subtitle">{workspaceSubtitle}</p>}
            </div>
          </div>

          <div className="workspace-content">
          {/* STUDIO */}
          {tab === 'dashboard' && puoGestireRegoleFiscaliIA(ruolo) && (
            <div style={{ padding: '.35rem 1rem 0', fontSize: '.68rem', color: 'var(--mu)', lineHeight: 1.4 }}>
              Regole IA (nascosto): <kbd style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 4, padding: '1px 5px' }}>{FISCAL_KNOWLEDGE_PANEL_SHORTCUT_LABEL}</kbd>
              {' '}<span aria-hidden="true">&middot;</span>{' '}anche in Impostazioni studio
            </div>
          )}
          {tab === 'dashboard'    && <Dashboard onNavigate={navigateTo} />}
          {tab === 'clienti'      && (canLeggi(perm, 'clienti')   ? <ModuloClienti ruolo={ruolo} perm={perm} /> : <AccessDenied />)}
          {tab === 'import'       && (canModifica(perm, 'import')  ? <ModuloImportExcel />                       : <AccessDenied />)}
          {tab === 'utenti'       && puoGestireUtenti(ruolo)       && <ModuloUtenti ruolo={ruolo} />}
          {tab === 'impostazioni' && (
            <ModuloImpostazioni
              ruolo={ruolo}
              utente={utente}
              onOpenFiscalKnowledgePanel={puoGestireRegoleFiscaliIA(ruolo) ? () => setFkPanelOpen(true) : undefined}
              fiscalShortcutLabel={FISCAL_KNOWLEDGE_PANEL_SHORTCUT_LABEL}
            />
          )}
          {tab === 'impostazioni_procedure' && <ModuloImpostazioniProcedure />}
          {tab === 'deleghe'      && <ModuloDeleghe />}

          {/* DOCUMENT HUB */}
          {tab === 'import_unificato'  && <ModuloImportUnificato ruolo={ruolo} />}
          {tab === 'export_dati'       && <ModuloExportDati onNavigate={navigateTo} />}
          {tab === 'fatture_ade'       && <ModuloFattureADE />}
          {tab === 'lettura_mail'      && <ModuloLetturaMail />}
          {tab === 'richieste_fatture' && <ModuloRichiesteFatture />}
          {tab === 'contabilita' && <ModuloContabilita ruolo={ruolo} onHeaderContextChange={setWorkspaceContext} />}
          {tab === 'piano_conti' && <ModuloPianoConti />}
          {tab === 'partitario'  && <ModuloPartitario />}
          {tab === 'bilancio'    && <ModuloBilancio />}

          {/* STRUMENTI */}
          {tab === 'f24'          && (canLeggi(perm, 'f24')         ? <ModuloF24 ruolo={ruolo} perm={perm} />          : <AccessDenied />)}
          {tab === 'simulatore'   && (canLeggi(perm, 'simulatore')  ? <ModuloSimulatore />                             : <AccessDenied />)}
          {tab === 'ammortamenti' && (canLeggi(perm, 'ammortamenti')? <ModuloAmmortamenti ruolo={ruolo} perm={perm} /> : <AccessDenied />)}
          {tab === 'ai_agent'     && <ModuloAIAgent utente={utente} />}
          {tab === 'cu'           && <ModuloCU />}
          {tab === 'revisione_dich' && <ModuloRevisioneDich utente={utente} />}
          {tab === 'agecon'         && <ModuloAgeCon ruolo={ruolo} />}

          {/* COMUNICAZIONI */}
          {tab === 'adempimenti' && (canLeggi(perm, 'adempimenti') ? <ModuloAdempimenti ruolo={ruolo} perm={perm} /> : <AccessDenied />)}
          {tab === 'agenda'      && (canLeggi(perm, 'agenda')      ? <ModuloAgenda ruolo={ruolo} perm={perm} />      : <AccessDenied />)}
          {tab === 'test_mode' && ruolo === 'owner' && <ModuloTestMode utente={utente} />}
          </div>
        </main>
      </div>
    </AIStatusProvider>
  )
}

export default App


