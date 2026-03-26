import { useState, useEffect } from 'react'
import { sb } from './lib/supabase'

// Context
import { AIStatusProvider, AIBadge } from './context/AIStatusContext'
import { TestModeBadge } from './context/TestModeContext'

// Shared
import { NAV, RUOLI_INFO, PERMESSI_MODULI } from './shared/constants'
import { getPermessi, canLeggi, canModifica, puoGestireUtenti, tomorrowStr } from './shared/utils'
import { AccessDenied } from './shared/components'

// Modules
import { Dashboard }              from './modules/dashboard'
import { ModuloImpostazioni }     from './modules/impostazioni'
import { ModuloDeleghe }          from './modules/deleghe'
import { ModuloImportDocumenti }  from './modules/import_documenti'
import { ModuloExportDati }       from './modules/export_dati'
import { ModuloContabilita }      from './modules/contabilita'
import { ModuloPianoConti }       from './modules/piano_conti'
import { ModuloPartitario }       from './modules/partitario'
import { ModuloBilancio }         from './modules/bilancio'
import { ModuloLetturaMail }      from './modules/lettura_mail'
import { ModuloFattureADE }       from './modules/fatture_ade'
import { ModuloRichiesteFatture } from './modules/richieste_fatture'
import { ModuloClienti }          from './modules/clienti'
import { ModuloIVA }              from './modules/iva'
import { ModuloImportExcel }      from './modules/import_excel'
import { ModuloUtenti }           from './modules/utenti'
import { ModuloF24 }              from './modules/f24'
import { ModuloAmmortamenti }     from './modules/ammortamenti'
import { ModuloAdempimenti }      from './modules/adempimenti'
import { ModuloAgenda }           from './modules/agenda'
import { ModuloCU }               from './modules/cu'
import { ModuloSimulatore }       from './modules/simulatore'
import { AIChat}                  from './components/AIChat'

// Login (inline - piccolo)
import { Login }                  from './modules/login'
import { ModuloTestMode }         from './modules/test_mode'

// Guida moduli (inline - dati statici)
import { GuidaModuliModal }       from './modules/guida'

// ─── APP ROOT ─────────────────────────────────────────────────
function App() {
  const [tab, setTab] = useState('dashboard')
  const [alertCount, setAlertCount] = useState(0)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstall, setShowInstall] = useState(false)
  const [utente, setUtente] = useState(null)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showGuida, setShowGuida] = useState(false)

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

  const handleInstall = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    await deferredPrompt.userChoice
    setDeferredPrompt(null)
    setShowInstall(false)
  }
  const logout = () => { setUtente(null); setTab('dashboard'); setShowLogoutConfirm(false) }

  if (!utente) return <Login onLogin={u => { setUtente(u); setTab('dashboard') }} />

  const ruolo = utente.ruolo || 'collaboratore'
  const perm = getPermessi(utente)
  const initials = (utente.nome || '?').charAt(0) + (utente.cognome || '').charAt(0) || '?'

  const navFiltrato = NAV.map(s => ({
    ...s,
    items: s.items.filter(item => {
      if (item.id === 'utenti' && !puoGestireUtenti(ruolo)) return false
      if (ruolo === 'collaboratore' && !canLeggi(perm, item.id)) return false
      return true
    })
  })).filter(s => s.items.length > 0)

  return (
    <AIStatusProvider>
      <div className="app">
        <AIBadge />
        <TestModeBadge />
        <AIChat />

        {showGuida && <GuidaModuliModal onClose={() => setShowGuida(false)} />}

        {showLogoutConfirm && (
          <div className="overlay" onMouseDown={e => e.target === e.currentTarget && setShowLogoutConfirm(false)}>
            <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 360 }}>
              <div className="modal-hdr">
                <div className="modal-drag" />
                <div className="modal-title">Disconnetti</div>
                <button className="modal-close" onClick={() => setShowLogoutConfirm(false)}>✕</button>
              </div>
              <div className="modal-body">
                <div style={{ textAlign: 'center', padding: '.5rem 0' }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '.5rem' }}>👋</div>
                  <div style={{ fontWeight: 600, marginBottom: '.25rem' }}>Ciao {utente.nome}!</div>
                  <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>Vuoi disconnetterti da FiscoSim?</div>
                </div>
              </div>
              <div className="modal-foot">
                <button className="btn-sec" onClick={() => setShowLogoutConfirm(false)}>Annulla</button>
                <button className="btn" style={{ background: 'var(--rd)', backgroundImage: 'none' }} onClick={logout}>🚪 Disconnetti</button>
              </div>
            </div>
          </div>
        )}

        {/* ─── SIDEBAR ─────────────────────────────────────── */}
        <div className="sidebar">
          <div className="sb-logo">
            <div className="sb-logo-row">
              <div className="sb-logo-ico">§</div>
              <div>
                <div className="sb-logo-t">FiscoSim</div>
                <div className="sb-logo-v">V6 — PROFESSIONAL</div>
              </div>
            </div>
          </div>

          {navFiltrato.map(({ section, items }) => (
            <div key={section}>
              <div className="sb-section-label">{section}</div>
              {items.map(item => (
                <div key={item.id}
                  className={'sb-item' + (tab === item.id ? ' active' : '')}
                  onClick={() => setTab(item.id)}>
                  <span className="sb-item-ico">{item.ico}</span>
                  <span>{item.label}</span>
                  {item.id === 'agenda' && alertCount > 0 && <span className="sb-badge">{alertCount}</span>}
                </div>
              ))}
            </div>
          ))}

          <div className="sb-footer">
            {ruolo === 'owner' && (
            <div style={{ marginBottom: '.5rem' }}>
              <div
                onClick={() => setTab('test_mode')}
                className={'sb-item' + (tab === 'test_mode' ? ' active' : '')}
                style={{ borderRadius: 7, margin: '0 .5rem', padding: '.4rem .6rem', fontSize: '.72rem', color: tab === 'test_mode' ? 'var(--cy)' : 'var(--mu)' }}
              >
                <span className="sb-item-ico">🧪</span>
                <span>Test Suite</span>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', gap: '.5rem', marginBottom: '.6rem' }}>
              <button onClick={() => setShowGuida(true)}
                style={{ flex: 1, background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 7, padding: '.4rem .6rem', cursor: 'pointer', fontSize: '.72rem', color: 'var(--gold)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '.3rem', transition: 'all .15s' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.background = 'rgba(200,164,94,.08)' }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.background = 'var(--s2)' }}>
                ℹ️ Guida Moduli
              </button>
            </div>
            <div className="sb-user" style={{ cursor: 'pointer' }} onClick={() => setShowLogoutConfirm(true)} title="Clicca per disconnetterti">
              <div className="sb-avatar">{initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="sb-user-name">{utente.nome} {utente.cognome || ''}</div>
                <div className="sb-user-role">{RUOLI_INFO[ruolo]?.label || ruolo} · Esci 🚪</div>
              </div>
            </div>
          </div>
        </div>

        {/* ─── CONTENT (router) ────────────────────────────── */}
        <div className="content">
          {showInstall && (
            <div style={{ padding: '.75rem 1rem 0' }}>
              <div className="install-banner">
                <div style={{ flex: 1, fontSize: '.76rem', lineHeight: 1.45 }}>
                  <strong style={{ color: 'var(--gld2)' }}>📲 Installa FiscoSim</strong><br />
                  Aggiungi alla schermata home per accesso rapido
                </div>
                <button onClick={handleInstall}>Installa</button>
              </div>
            </div>
          )}

          {/* STUDIO */}
          {tab === 'dashboard'    && <Dashboard onNavigate={setTab} />}
          {tab === 'clienti'      && (canLeggi(perm, 'clienti')   ? <ModuloClienti ruolo={ruolo} perm={perm} /> : <AccessDenied />)}
          {tab === 'import'       && (canModifica(perm, 'import')  ? <ModuloImportExcel />                       : <AccessDenied />)}
          {tab === 'utenti'       && puoGestireUtenti(ruolo)       && <ModuloUtenti ruolo={ruolo} />}
          {tab === 'impostazioni' && <ModuloImpostazioni ruolo={ruolo} />}
          {tab === 'deleghe'      && <ModuloDeleghe />}

          {/* DOCUMENT HUB */}
          {tab === 'import_documenti'  && <ModuloImportDocumenti ruolo={ruolo} />}
          {tab === 'export_dati'       && <ModuloExportDati onNavigate={setTab} />}
          {tab === 'fatture_ade'       && <ModuloFattureADE />}
          {tab === 'lettura_mail'      && <ModuloLetturaMail />}
          {tab === 'richieste_fatture' && <ModuloRichiesteFatture />}

          {/* CONTABILITÀ */}
          {tab === 'contabilita' && <ModuloContabilita ruolo={ruolo} />}
          {tab === 'piano_conti' && <ModuloPianoConti />}
          {tab === 'partitario'  && <ModuloPartitario />}
          {tab === 'bilancio'    && <ModuloBilancio />}

          {/* STRUMENTI */}
          {tab === 'iva'          && (canLeggi(perm, 'iva')         ? <ModuloIVA ruolo={ruolo} perm={perm} />          : <AccessDenied />)}
          {tab === 'f24'          && (canLeggi(perm, 'f24')         ? <ModuloF24 ruolo={ruolo} perm={perm} />          : <AccessDenied />)}
          {tab === 'simulatore'   && (canLeggi(perm, 'simulatore')  ? <ModuloSimulatore />                             : <AccessDenied />)}
          {tab === 'ammortamenti' && (canLeggi(perm, 'ammortamenti')? <ModuloAmmortamenti ruolo={ruolo} perm={perm} /> : <AccessDenied />)}
          {tab === 'cu'           && <ModuloCU />}

          {/* COMUNICAZIONI */}
          {tab === 'adempimenti' && (canLeggi(perm, 'adempimenti') ? <ModuloAdempimenti ruolo={ruolo} perm={perm} /> : <AccessDenied />)}
          {tab === 'agenda'      && (canLeggi(perm, 'agenda')      ? <ModuloAgenda ruolo={ruolo} perm={perm} />      : <AccessDenied />)}

          {/* TEST MODE — solo owner */}
          {tab === 'test_mode' && ruolo === 'owner' && <ModuloTestMode utente={utente} />}
        </div>
      </div>
    </AIStatusProvider>
  )
}

export default App
