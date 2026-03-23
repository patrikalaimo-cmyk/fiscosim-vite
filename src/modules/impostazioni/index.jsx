import { useState, useEffect } from 'react'
import { sb } from '../../lib/supabase'
import { invalidateAICache } from '../../core/workflow'

export function ModuloImpostazioni({ ruolo }) {
  const canEdit = ruolo === 'owner' || ruolo === 'admin'
  const [imp, setImp] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    sb.from('impostazioni_studio').select('chiave,valore')
      .then(({ data }) => {
        const map = Object.fromEntries((data || []).map(r => [r.chiave, r.valore || '']))
        if (!map.ai_enabled)  map.ai_enabled  = 'true'
        if (!map.test_mode)   map.test_mode   = 'false'
        setImp(map)
        setLoading(false)
      })
  }, [])

  const up = (k, v) => setImp(p => ({ ...p, [k]: v }))

  const salva = async () => {
    setSaving(true)
    setSaved(false)
    try {
      for (const [chiave, valore] of Object.entries(imp)) {
        await sb.from('impostazioni_studio')
          .upsert({ chiave, valore, updated_at: new Date().toISOString() }, { onConflict: 'chiave' })
      }
      invalidateAICache()
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const IS = { background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, color: canEdit ? 'var(--tx)' : 'var(--mu)', padding: '.52rem .75rem', fontSize: '.84rem', width: '100%' }

  if (loading) return <div className="loading">⏳</div>

  const isTestMode = imp.test_mode === 'true'
  const isAIOn     = imp.ai_enabled === 'true'

  return (
    <div className="page">
      <div className="page-hdr">
        <div className="page-title">⚙️ Impostazioni Studio</div>
        <div className="page-sub">Dati del titolare, studio e configurazione AI</div>
      </div>

      {/* ─── TEST MODE ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem', background: isTestMode ? 'linear-gradient(135deg,rgba(99,217,196,.08),rgba(99,217,196,.02))' : 'var(--s1)', border: isTestMode ? '1px solid rgba(99,217,196,.4)' : '1px solid var(--bd)' }}>
        <div className="card-hdr">
          <div className="card-title">🧪 Test Mode</div>
          <span className={'bdg ' + (isTestMode ? 'bdg-cy' : 'bdg-gray')}>
            {isTestMode ? 'ATTIVA' : 'DISATTIVA'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div
            onClick={() => canEdit && up('test_mode', isTestMode ? 'false' : 'true')}
            style={{ width: 56, height: 30, borderRadius: 15, background: isTestMode ? '#63d9c4' : 'var(--bd2)', cursor: canEdit ? 'pointer' : 'not-allowed', position: 'relative', transition: 'background .2s', opacity: canEdit ? 1 : 0.6 }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 12, background: 'white', position: 'absolute', top: 3, left: isTestMode ? 29 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{isTestMode ? '🧪 Test Mode Attiva' : 'Test Mode Disattiva'}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>
              {isTestMode ? 'Le API sono simulate — nessuna email inviata, nessuna chiamata AI reale' : 'Modalità produzione — tutte le operazioni sono reali'}
            </div>
          </div>
        </div>
        {isTestMode && (
          <div className="alert" style={{ background: 'rgba(99,217,196,.1)', border: '1px solid rgba(99,217,196,.3)', margin: 0 }}>
            🧪 <strong>Test Mode attiva.</strong> Tutte le chiamate API restituiscono risposte simulate.
            Nessuna email verrà inviata. Nessuna chiamata a Claude Haiku verrà effettuata.
            Il badge <strong>🧪 TEST</strong> è visibile in basso a destra.
          </div>
        )}
        {!isTestMode && (
          <div className="alert alert-info" style={{ margin: 0 }}>
            💡 Attiva il Test Mode per testare i flussi senza costi AI e senza inviare email reali.
          </div>
        )}
      </div>

      {/* ─── AI TOGGLE ─────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem', background: 'linear-gradient(135deg,rgba(200,164,94,.1),rgba(200,164,94,.02))', border: '1px solid rgba(200,164,94,.3)' }}>
        <div className="card-hdr">
          <div className="card-title">🤖 Intelligenza Artificiale</div>
          <span className={'bdg ' + (isAIOn ? 'bdg-green' : 'bdg-gray')}>
            {isAIOn ? 'AI ATTIVA' : 'AI DISATTIVATA'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <div
            onClick={() => canEdit && up('ai_enabled', isAIOn ? 'false' : 'true')}
            style={{ width: 56, height: 30, borderRadius: 15, background: isAIOn ? 'var(--gr)' : 'var(--bd2)', cursor: canEdit ? 'pointer' : 'not-allowed', position: 'relative', transition: 'background .2s', opacity: canEdit ? 1 : 0.6 }}
          >
            <div style={{ width: 24, height: 24, borderRadius: 12, background: 'white', position: 'absolute', top: 3, left: isAIOn ? 29 : 3, transition: 'left .2s', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{isAIOn ? 'AI Attiva' : 'AI Disattivata'}</div>
            <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>
              {isAIOn ? "I documenti vengono classificati automaticamente dall'AI" : "Classificazione manuale — l'operatore sceglie tipo documento"}
            </div>
          </div>
        </div>
        <div className="alert alert-info" style={{ margin: 0 }}>
          💡 <strong>Modalità senza AI:</strong> Il sistema funziona al 100% anche con AI disattivata.
        </div>
      </div>

      {/* ─── TITOLARE ──────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-hdr">
          <div className="card-title">👤 Titolare dello Studio</div>
          <span className="bdg bdg-gold">Persona fisica</span>
        </div>
        <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
          Le deleghe ADE vengono intestate al titolare. Usati nella generazione richieste XML per il download massivo fatture.
        </div>
        <div className="form-grid">
          <div className="fg"><label>Nome *</label><input value={imp.titolare_nome || ''} onChange={e => up('titolare_nome', e.target.value)} disabled={!canEdit} style={IS} /></div>
          <div className="fg"><label>Cognome *</label><input value={imp.titolare_cognome || ''} onChange={e => up('titolare_cognome', e.target.value)} disabled={!canEdit} style={IS} /></div>
          <div className="fg"><label>Codice Fiscale *</label><input value={imp.titolare_cf || ''} onChange={e => up('titolare_cf', e.target.value.toUpperCase())} disabled={!canEdit} placeholder="RSSMRA75T10F205Z" style={IS} /></div>
          <div className="fg">
            <label>P.IVA (utenza lavoro ADE)</label>
            <input value={imp.titolare_piva || ''} onChange={e => up('titolare_piva', e.target.value)} disabled={!canEdit} placeholder="11 cifre" style={IS} />
            <div className="hint">Usata come utenza di lavoro per le richieste massive ADE</div>
          </div>
        </div>
      </div>

      {/* ─── STUDIO ────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div className="card-hdr"><div className="card-title">🏢 Dati Studio</div></div>
        <div className="form-grid">
          <div className="fg full"><label>Nome Studio</label><input value={imp.studio_nome || ''} onChange={e => up('studio_nome', e.target.value)} disabled={!canEdit} style={IS} /></div>
          <div className="fg"><label>P.IVA Studio</label><input value={imp.studio_piva || ''} onChange={e => up('studio_piva', e.target.value)} disabled={!canEdit} style={IS} /></div>
        </div>
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: '.75rem', alignItems: 'center' }}>
          <button className="btn" disabled={saving} onClick={salva}>{saving ? '⏳ Salvo...' : '💾 Salva impostazioni'}</button>
          {saved && <span style={{ color: 'var(--gr)', fontSize: '.82rem', fontWeight: 600 }}>✓ Salvato</span>}
        </div>
      )}
      {!canEdit && <div className="alert alert-warn">🔒 Solo Owner e Admin possono modificare le impostazioni studio.</div>}
    </div>
  )
}
