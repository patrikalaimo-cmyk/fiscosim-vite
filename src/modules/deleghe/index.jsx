import { useState, useEffect, useRef, useMemo } from 'react'
import { sb } from '../../lib/supabase'
import { ModuleHeader } from '../../shared/components'

const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
const todayStr = () => new Date().toISOString().split('T')[0]

function calcolaScadenzaDelega(dataDelega) {
  if (!dataDelega) return null
  const anno = new Date(dataDelega).getFullYear()
  return `${anno + 4}-12-31`
}

function statoDelega(dataScadenza) {
  if (!dataScadenza) return 'da_attivare'
  const oggi = new Date()
  const scad = new Date(dataScadenza)
  const diff = (scad - oggi) / (1000 * 60 * 60 * 24)
  if (diff < 0) return 'scaduto'
  if (diff <= 90) return 'in_scadenza'
  return 'attivo'
}

const DELEGA_STATO_CFG = {
  attivo:      { label: '✓ Attivo',      color: '#34c27a', bg: 'rgba(52,194,122,.12)',  border: 'rgba(52,194,122,.3)' },
  in_scadenza: { label: '⚠ In scadenza', color: '#c8a45e', bg: 'rgba(200,164,94,.12)',  border: 'rgba(200,164,94,.3)' },
  scaduto:     { label: '✕ Scaduto',     color: '#e05252', bg: 'rgba(224,82,82,.12)',   border: 'rgba(224,82,82,.3)' },
  da_attivare: { label: '— Da attivare', color: '#6b7a99', bg: 'rgba(107,122,153,.08)', border: 'rgba(107,122,153,.2)' },
}

function DelegaBadge({ stato }) {
  const c = DELEGA_STATO_CFG[stato] || DELEGA_STATO_CFG.da_attivare
  return (
    <span style={{ background: c.bg, color: c.color, border: `1px solid ${c.border}`, borderRadius: 5, padding: '.12rem .45rem', fontSize: '.68rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  )
}

function DelegaModal({ cliente, delegaEsistente, onSave, onClose, saving }) {
  const NOME = cliente.ragione_sociale || `${cliente.nome} ${cliente.cognome || ''}`.trim()
  const [dataDelega, setDataDelega] = useState(delegaEsistente?.data_delega || todayStr())
  const [note, setNote] = useState(delegaEsistente?.note || '')
  const scad = calcolaScadenzaDelega(dataDelega)
  const stato = scad ? statoDelega(scad) : 'da_attivare'

  const salva = () => {
    if (!dataDelega) return
    onSave({ cliente_id: cliente.id, data_delega: dataDelega, data_scadenza: scad, note, attivo: true })
  }

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">🔑 Delega Unica</div>
          <div className="modal-sub">{NOME}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-grid">
            <div className="fg">
              <label>CF / P.IVA</label>
              <input value={cliente.codice_fiscale || cliente.partita_iva || ''} disabled style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, color: 'var(--mu)', padding: '.52rem .75rem', fontSize: '.84rem', width: '100%' }} />
            </div>
            <div className="fg"><label>Data delega *</label><input type="date" value={dataDelega} onChange={e => setDataDelega(e.target.value)} /></div>
            <div className="fg full">
              <label>Scadenza (automatica)</label>
              <div style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 8, padding: '.52rem .75rem', fontSize: '.84rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: stato === 'scaduto' ? 'var(--rd)' : stato === 'in_scadenza' ? 'var(--gold)' : 'var(--gr)', fontWeight: 600 }}>{scad ? fmtDate(scad) : '—'}</span>
                {scad && <DelegaBadge stato={stato} />}
              </div>
              <div className="hint">31 Dicembre del 4° anno successivo alla data delega</div>
            </div>
            <div className="fg full"><label>Note</label><textarea value={note} onChange={e => setNote(e.target.value)} style={{ minHeight: 60 }} /></div>
          </div>
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={!dataDelega || saving} onClick={salva}>{saving ? 'Salvo...' : '💾 Salva'}</button>
        </div>
      </div>
    </div>
  )
}

function DelegheImportModal({ clienti, delegheMap, onSave, onClose }) {
  const [testo, setTesto] = useState('')
  const [parsed, setParsed] = useState([])
  const [saving, setSaving] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef()

  const parsaTesto = (txt) => {
    const righe = txt.split('\n')
    const risultati = []
    const cfRegex = /([A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]|\d{11})/gi
    const dateRegex = /(\d{2}[\/\-]\d{2}[\/\-]\d{4}|\d{4}[\/\-]\d{2}[\/\-]\d{2})/g

    for (const riga of righe) {
      const cfs = [...riga.matchAll(cfRegex)].map(m => m[1].toUpperCase())
      const date = [...riga.matchAll(dateRegex)].map(m => m[1])
      if (!cfs.length) continue

      for (const cf of cfs) {
        const cliente = clienti.find(c =>
          (c.codice_fiscale || '').toUpperCase() === cf || (c.partita_iva || '') === cf
        )
        let dataDelega = null
        if (date.length > 0) {
          const d = date[0]
          dataDelega = d.includes('/') ? d.split('/').reverse().join('-') : d
        }
        const scad = calcolaScadenzaDelega(dataDelega || todayStr())
        risultati.push({ cf, cliente, dataDelega: dataDelega || todayStr(), scadenza: scad, trovato: !!cliente, cliente_id: cliente?.id })
      }
    }
    setParsed(risultati)
  }

  const handleFile = async (file) => {
    if (!file) return
    const txt = await file.text()
    parsaTesto(txt)
  }

  const importa = async () => {
    setSaving(true)
    const items = parsed.filter(p => p.trovato).map(p => ({
      cliente_id: p.cliente_id,
      data_delega: p.dataDelega,
      data_scadenza: p.scadenza,
      attivo: true,
    }))
    await onSave(items)
    setSaving(false)
  }

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <div className="modal-hdr">
          <div className="modal-drag" />
          <div className="modal-title">📄 Importa Deleghe da file</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="alert alert-info" style={{ marginBottom: '.85rem' }}>Carica un file PDF, TXT o CSV con la lista delle deleghe ADE.</div>
          <div className={'upload-zone' + (drag ? ' drag' : '')} style={{ padding: '1.5rem', marginBottom: '.85rem' }}
            onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); handleFile(e.dataTransfer.files[0]) }}
            onClick={() => fileRef.current.click()}>
            <div className="upload-zone-ico">📄</div>
            <div className="upload-zone-t">Carica file deleghe</div>
            <div className="upload-zone-s">PDF, TXT, CSV con lista CF e date</div>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          <div className="fg" style={{ marginBottom: '.85rem' }}>
            <label>Oppure incolla il testo direttamente</label>
            <textarea value={testo} onChange={e => { setTesto(e.target.value); parsaTesto(e.target.value) }} style={{ minHeight: 100 }} placeholder={'CF BNCMRN80A01H501Z  01/01/2026\nRSSMRA75T10F205Z  15/03/2026\n...'} />
          </div>
          {parsed.length > 0 && (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--bd)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '.5rem .75rem', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: 'var(--mu)' }}>
                <span>{parsed.length} righe trovate</span>
                <span style={{ color: 'var(--gr)' }}>{parsed.filter(p => p.trovato).length} clienti abbinati</span>
              </div>
              <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                {parsed.map((p, i) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '.5rem', padding: '.4rem .75rem', borderBottom: '1px solid rgba(33,40,58,.4)', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '.75rem', fontFamily: 'monospace', fontWeight: 600 }}>{p.cf}</div>
                      <div style={{ fontSize: '.68rem', color: p.trovato ? 'var(--gr)' : 'var(--rd)' }}>
                        {p.trovato ? (p.cliente.ragione_sociale || `${p.cliente.nome} ${p.cliente.cognome || ''}`) : 'Non trovato in anagrafica'}
                      </div>
                    </div>
                    <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>Delega: {fmtDate(p.dataDelega)}<br />Scad: {fmtDate(p.scadenza)}</div>
                    <span className={p.trovato ? 'bdg bdg-green' : 'bdg bdg-red'}>{p.trovato ? '✓' : '✗'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn-sec" onClick={onClose}>Annulla</button>
          <button className="btn" disabled={!parsed.filter(p => p.trovato).length || saving} onClick={importa}>
            {saving ? 'Importo...' : `💾 Importa ${parsed.filter(p => p.trovato).length} deleghe`}
          </button>
        </div>
      </div>
    </div>
  )
}

export function ModuloDeleghe() {
  const [clienti, setClienti] = useState([])
  const [deleghe, setDeleghe] = useState([])
  const [utenti, setUtenti] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [modal, setModal] = useState(null)
  const [importModal, setImportModal] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => { carica() }, [])

  const carica = async () => {
    setLoading(true)
    const [{ data: cl }, { data: de }, { data: ut }] = await Promise.all([
      sb.from('clienti').select('id,nome,cognome,ragione_sociale,codice_fiscale,partita_iva,responsabile_id').eq('attivo', true).order('nome'),
      sb.from('deleghe_uniche').select('*').eq('attivo', true),
      sb.from('utenti_studio').select('id,nome,cognome,email').eq('attivo', true),
    ])
    setClienti(cl || [])
    setDeleghe(de || [])
    setUtenti(ut || [])
    setLoading(false)
  }

  const delegheMap = useMemo(() => Object.fromEntries((deleghe || []).map(d => [d.cliente_id, d])), [deleghe])

  const clientiConStato = useMemo(() => (clienti || []).map(c => {
    const d = delegheMap[c.id]
    const stato = d ? statoDelega(d.data_scadenza) : 'da_attivare'
    return { ...c, delega: d, stato }
  }), [clienti, delegheMap])

  const filtered = useMemo(() => clientiConStato.filter(c => {
    const nome = (c.ragione_sociale || `${c.nome} ${c.cognome || ''}`).toLowerCase()
    const mS = !search || nome.includes(search.toLowerCase()) ||
      (c.codice_fiscale || '').toLowerCase().includes(search.toLowerCase()) ||
      (c.partita_iva || '').includes(search)
    const mF = filtroStato === 'tutti' || c.stato === filtroStato
    return mS && mF
  }), [clientiConStato, search, filtroStato])

  const stats = useMemo(() => ({
    attivo: clientiConStato.filter(c => c.stato === 'attivo').length,
    in_scadenza: clientiConStato.filter(c => c.stato === 'in_scadenza').length,
    scaduto: clientiConStato.filter(c => c.stato === 'scaduto').length,
    da_attivare: clientiConStato.filter(c => c.stato === 'da_attivare').length,
  }), [clientiConStato])

  const salvaDelega = async (data) => {
    setSaving(true)
    try {
      const existing = delegheMap[data.cliente_id]
      if (existing) {
        const { error } = await sb.from('deleghe_uniche').update(data).eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await sb.from('deleghe_uniche').insert([data])
        if (error) throw error
      }
      await carica()
      setModal(null)
    } catch (e) { alert(e.message) }
    finally { setSaving(false) }
  }

  const eliminaDelega = async (id) => {
    if (!confirm('Eliminare questa delega?')) return
    await sb.from('deleghe_uniche').update({ attivo: false }).eq('id', id)
    carica()
  }

  const inviaAlertScadenze = async () => {
    const inScadenza = clientiConStato.filter(c => c.stato === 'in_scadenza')
    if (!inScadenza.length) { alert('Nessuna delega in scadenza.'); return }
    const perResponsabile = {}
    inScadenza.forEach(c => {
      const resp = utenti.find(u => u.id === c.responsabile_id) || utenti.find(u => u.ruolo === 'owner')
      if (!resp?.email) return
      if (!perResponsabile[resp.id]) perResponsabile[resp.id] = { utente: resp, clienti: [] }
      perResponsabile[resp.id].clienti.push(c)
    })
    let sent = 0
    for (const { utente, clienti: lista } of Object.values(perResponsabile)) {
      const oggetto = `⚠️ Deleghe Uniche in scadenza — ${lista.length} clienti`
      const corpo = `Gentile ${utente.nome},\n\nI seguenti clienti hanno la Delega Unica ADE in scadenza:\n\n${lista.map(c => `• ${c.ragione_sociale || `${c.nome} ${c.cognome || ''}`} — scadenza: ${fmtDate(c.delega?.data_scadenza)}`).join('\n')}\n\nStudio Envisioning`
      try {
        await fetch('/api/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'send', to: [utente.email], oggetto, corpo }) })
        sent++
      } catch (e) { console.error(e) }
    }
    alert(`Alert inviati a ${sent} responsabili.`)
  }

  const CF = c => c.codice_fiscale || c.partita_iva || '—'
  const NOME = c => c.ragione_sociale || `${c.nome} ${c.cognome || ''}`.trim()

  return (
    <div className="page">
      {modal && <DelegaModal cliente={modal} delegaEsistente={delegheMap[modal.id]} onSave={salvaDelega} onClose={() => setModal(null)} saving={saving} />}
      {importModal && (
        <DelegheImportModal clienti={clienti} delegheMap={delegheMap}
          onSave={async items => {
            for (const item of items) {
              const existing = delegheMap[item.cliente_id]
              if (existing) await sb.from('deleghe_uniche').update(item).eq('id', existing.id)
              else await sb.from('deleghe_uniche').insert([item])
            }
            await carica()
            setImportModal(false)
          }}
          onClose={() => setImportModal(false)} />
      )}

      <ModuleHeader
        sectionLabel="Fiscale"
        title="🔑 Deleghe Uniche ADE"
        context={`Gestione deleghe fatture elettroniche — aggiornato al ${new Date().toLocaleDateString('it-IT')}`}
      />

      <div className="stats-grid" style={{ marginBottom: '1rem' }}>
        {[['✓ Attive', stats.attivo, 'var(--gr)', 'attivo'], ['⚠ In scadenza', stats.in_scadenza, 'var(--gold)', 'in_scadenza'], ['✕ Scadute', stats.scaduto, 'var(--rd)', 'scaduto'], ['— Da attivare', stats.da_attivare, 'var(--mu)', 'da_attivare']].map(([l, v, c, f]) => (
          <div key={f} className="stat-card" style={{ cursor: 'pointer', border: filtroStato === f ? `1px solid ${c}` : '1px solid var(--bd)' }} onClick={() => setFiltroStato(filtroStato === f ? 'tutti' : f)}>
            <div className="stat-val" style={{ color: c, fontSize: '1.4rem' }}>{v}</div>
            <div className="stat-lbl">{l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: '.6rem', marginBottom: '.65rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input className="search-bar" style={{ margin: 0, flex: 1, minWidth: 200 }} placeholder="🔍 Cerca cliente, CF, P.IVA..." value={search} onChange={e => setSearch(e.target.value)} />
        <button className="btn-sec" onClick={() => setImportModal(true)}>📄 Importa PDF</button>
        {stats.in_scadenza > 0 && <button className="btn-sec" style={{ borderColor: 'rgba(200,164,94,.4)', color: 'var(--gld2)' }} onClick={inviaAlertScadenze}>📧 Invia alert ({stats.in_scadenza})</button>}
      </div>

      <div className="pills">
        {[['tutti', `Tutti (${clientiConStato.length})`], ['attivo', `✓ Attive (${stats.attivo})`], ['in_scadenza', `⚠ In scadenza (${stats.in_scadenza})`], ['scaduto', `✕ Scadute (${stats.scaduto})`], ['da_attivare', `— Da attivare (${stats.da_attivare})`]].map(([v, l]) => (
          <span key={v} className={'pill' + (filtroStato === v ? ' active' : '')} onClick={() => setFiltroStato(v)}>{l}</span>
        ))}
      </div>

      {loading ? <div className="loading">⏳</div> : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr>
                <th>Cliente</th><th>CF / P.IVA</th><th>Responsabile</th><th>Data Delega</th><th>Scadenza</th><th>Stato</th><th>Azioni</th>
              </tr></thead>
              <tbody>
                {filtered.map(c => {
                  const resp = utenti.find(u => u.id === c.responsabile_id)
                  return (
                    <tr key={c.id} style={c.stato === 'in_scadenza' ? { background: 'rgba(200,164,94,.03)' } : c.stato === 'scaduto' ? { background: 'rgba(224,82,82,.03)' } : {}}>
                      <td><span style={{ fontWeight: 600 }}>{NOME(c)}</span></td>
                      <td><span style={{ fontSize: '.75rem', fontFamily: 'monospace', color: 'var(--mu)' }}>{CF(c)}</span></td>
                      <td><span style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{resp ? `${resp.nome} ${resp.cognome || ''}` : '—'}</span></td>
                      <td><span style={{ fontSize: '.78rem', color: 'var(--mu)' }}>{c.delega ? fmtDate(c.delega.data_delega) : '—'}</span></td>
                      <td><span style={{ fontSize: '.78rem', color: c.stato === 'in_scadenza' ? 'var(--gold)' : c.stato === 'scaduto' ? 'var(--rd)' : 'var(--mu)' }}>{c.delega ? fmtDate(c.delega.data_scadenza) : '—'}</span></td>
                      <td><DelegaBadge stato={c.stato} /></td>
                      <td><div className="tbl-actions">
                        <button className="btn-icon" onClick={() => setModal(c)}>✏️</button>
                        {c.delega && <button className="btn-icon" style={{ borderColor: 'rgba(224,82,82,.3)', color: '#ff8585' }} onClick={() => eliminaDelega(c.delega.id)}>🗑</button>}
                      </div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding: '.5rem 1rem', fontSize: '.68rem', color: 'var(--mu)', borderTop: '1px solid var(--bd)' }}>
            {filtered.length} clienti · Clicca ✏️ per inserire o modificare la delega
          </div>
        </div>
      )}
    </div>
  )
}
