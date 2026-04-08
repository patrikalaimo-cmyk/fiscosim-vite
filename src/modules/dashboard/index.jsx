import { useState, useEffect, useCallback } from 'react'
import { sb } from '../../lib/supabase'
import { TIPO_LABEL, TIPO_COLOR, LAST_SOCIETA_STORAGE_KEY } from '../../shared/constants'
import { ModuleHeader } from '../../shared/components'
import { CopilotInsightsBlock } from '../contabilita/CopilotInsightsBlock.jsx'

const fmt = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(n || 0)
const fmt0 = n => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0)
const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]

export function Dashboard({ onNavigate }) {
  const [stats, setStats] = useState({ clienti: 0, attivi: 0, f24: 0, f24_imp: 0, invii: 0, beni: 0 })
  const [recenti, setRecenti] = useState([])
  const [f24Prox, setF24Prox] = useState([])
  const [loading, setLoading] = useState(true)
  const [dashSocietaId, setDashSocietaId] = useState('')
  const [insightsRefreshKey, setInsightsRefreshKey] = useState(0)

  const refreshDashSocieta = useCallback(() => {
    try {
      setDashSocietaId(localStorage.getItem(LAST_SOCIETA_STORAGE_KEY) || '')
    } catch {
      setDashSocietaId('')
    }
  }, [])

  useEffect(() => {
    refreshDashSocieta()
  }, [refreshDashSocieta])

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshDashSocieta()
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', refreshDashSocieta)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', refreshDashSocieta)
    }
  }, [refreshDashSocieta])

  useEffect(() => {
    (async () => {
      const [{ count: tot }, { count: att }, { data: f }, { data: cli }, { data: inv }] = await Promise.all([
        sb.from('clienti').select('*', { count: 'exact', head: true }).eq('attivo', true),
        sb.from('clienti').select('*', { count: 'exact', head: true }).eq('attivo', true),
        sb.from('f24').select('*').eq('stato', 'da_pagare').order('data_scadenza').limit(5),
        sb.from('clienti').select('id,nome,cognome,ragione_sociale,tipo_cliente,created_at').eq('attivo', true).order('created_at', { ascending: false }).limit(6),
        sb.from('invii_schedulati').select('*', { count: 'exact', head: true }).eq('stato', 'programmato'),
      ])
      const f24Imp = (f || []).reduce((s, r) => s + parseFloat(r.importo || 0), 0)
      setStats({ clienti: tot || 0, attivi: att || 0, f24: (f || []).length, f24_imp: f24Imp, invii: inv?.count || 0, beni: 0 })
      setRecenti(cli || [])
      setF24Prox(f || [])
      setLoading(false)
    })()
  }, [])

  const today = todayStr()
  if (loading) return <div className="loading">⏳ Caricamento dashboard...</div>

  return (
    <div className="page">
      <ModuleHeader
        sectionLabel="Home"
        title="Dashboard"
        context={`Riepilogo attività studio · ${new Date().toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
      />

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-hdr">
          <div className="card-title">🤖 Insight Copilot</div>
          <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
            <button type="button" className="btn-sec btn-sm" onClick={() => setInsightsRefreshKey((k) => k + 1)}>
              Ricarica
            </button>
            <button type="button" className="btn-sec btn-sm" onClick={() => onNavigate('contabilita')}>
              Contabilità
            </button>
          </div>
        </div>
        {!dashSocietaId ? (
          <div className="empty" style={{ padding: '1rem' }}>
            <div className="empty-t" style={{ fontSize: '.82rem' }}>
              Nessuna società ricordata. Apri <strong>Contabilità</strong>, seleziona una società: gli insight compariranno qui e nel pannello Copilot.
            </div>
          </div>
        ) : (
          <CopilotInsightsBlock
            societaId={dashSocietaId}
            documentId={null}
            variant="dashboard"
            refreshKey={insightsRefreshKey}
            onFixNow={() => {
              try {
                if (dashSocietaId) localStorage.setItem(LAST_SOCIETA_STORAGE_KEY, dashSocietaId)
              } catch {
                /* ignore */
              }
              onNavigate('contabilita')
            }}
          />
        )}
      </div>

      <div className="stats-grid">
        <div className="stat-card" onClick={() => onNavigate('clienti')} style={{ cursor: 'pointer' }}>
          <div className="stat-ico">👥</div>
          <div className="stat-val" style={{ color: 'var(--pu)' }}>{stats.clienti}</div>
          <div className="stat-lbl">Clienti totali</div>
        </div>
        <div className="stat-card" onClick={() => onNavigate('f24')} style={{ cursor: 'pointer' }}>
          <div className="stat-ico">📋</div>
          <div className="stat-val" style={{ color: 'var(--rd)' }}>{stats.f24}</div>
          <div className="stat-lbl">F24 da pagare</div>
        </div>
        <div className="stat-card">
          <div className="stat-ico">💶</div>
          <div className="stat-val" style={{ color: 'var(--gold)', fontSize: '1.2rem' }}>{fmt0(stats.f24_imp)}</div>
          <div className="stat-lbl">Totale F24 aperti</div>
        </div>
        <div className="stat-card" onClick={() => onNavigate('agenda')} style={{ cursor: 'pointer' }}>
          <div className="stat-ico">📆</div>
          <div className="stat-val" style={{ color: 'var(--cy)' }}>{stats.invii}</div>
          <div className="stat-lbl">Invii programmati</div>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">👥 Clienti recenti</div>
            <button className="btn-sec btn-sm" onClick={() => onNavigate('clienti')}>Vedi tutti</button>
          </div>
          {recenti.map(c => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '.6rem', padding: '.45rem 0', borderBottom: '1px solid var(--bd)' }}>
              <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(167,139,250,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.75rem', flexShrink: 0 }}>👤</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()}
                </div>
              </div>
              <span className={'bdg ' + TIPO_COLOR[c.tipo_cliente]}>{TIPO_LABEL[c.tipo_cliente]}</span>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="card-hdr">
            <div className="card-title">📋 F24 in scadenza</div>
            <button className="btn-sec btn-sm" onClick={() => onNavigate('f24')}>Vedi tutti</button>
          </div>
          {f24Prox.length === 0
            ? <div className="empty" style={{ padding: '1.5rem' }}><div className="empty-s">Nessun F24 aperto</div></div>
            : f24Prox.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '.45rem 0', borderBottom: '1px solid var(--bd)', gap: '.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.descrizione}</div>
                  <div style={{ fontSize: '.68rem', color: f.data_scadenza < today ? '#ff8585' : 'var(--mu)' }}>{fmtDate(f.data_scadenza)}</div>
                </div>
                <div style={{ fontSize: '.85rem', fontWeight: 700, color: 'var(--gld2)', flexShrink: 0 }}>{fmt(f.importo)}</div>
              </div>
            ))
          }
        </div>
      </div>
      <div className="card">
        <div className="card-hdr"><div className="card-title">🚀 Moduli attivi</div></div>
        <div style={{ display: 'flex', gap: '.5rem', flexWrap: 'wrap' }}>
          {[
            { ico: '📊', label: 'Simulatore', id: 'simulatore' },
            { ico: '👥', label: 'Clienti', id: 'clienti' },
            { ico: '📤', label: 'Import Excel', id: 'import' },
            { ico: '👤', label: 'Utenti Studio', id: 'utenti' },
            {
              ico: '💧',
              label: 'IVA e Adempimenti',
              id: 'contabilita',
              onClick: () => {
                try {
                  localStorage.setItem(LAST_SOCIETA_STORAGE_KEY, dashSocietaId || '')
                  localStorage.setItem('contabilita_sub_tab', 'liquidazioni_iva')
                } catch {
                  /* ignore */
                }
                onNavigate('contabilita')
              },
            },
            { ico: '📋', label: 'Gestione F24', id: 'f24' },
            { ico: '🏢', label: 'Ammortamenti', id: 'ammortamenti' },
            { ico: '📬', label: 'Adempimenti', id: 'adempimenti' },
            { ico: '📆', label: 'Agenda', id: 'agenda' },
          ].map(({ ico, label, id, onClick }) => (
            <div key={id} onClick={onClick || (() => onNavigate(id))}
              style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 9, padding: '.55rem .85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '.45rem', fontSize: '.8rem', fontWeight: 500, transition: 'all .15s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--gold)'; e.currentTarget.style.color = 'var(--gld2)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--bd)'; e.currentTarget.style.color = '' }}>
              <span>{ico}</span>{label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
