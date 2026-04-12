import { useEffect, useMemo, useState } from 'react'
import { ModuleHeader } from '../../shared/components'
import { BaseCombobox } from '../../shared/ui/BaseDropdown.jsx'
import { LAST_SOCIETA_STORAGE_KEY } from '../../shared/constants'
import * as contabilitaRepo from '../contabilita/data/contabilitaRepo.js'
import { fmtCurrency as fmt, fmtDate } from '../contabilita/ui/formatters.js'

export function ModuloPartitario() {
  const [societa, setSocieta] = useState([])
  const [societaId, setSocietaId] = useState('')
  const [stato, setStato] = useState('aperta') // aperta | parziale | chiusa
  const [tipo, setTipo] = useState('tutti') // tutti | cliente | fornitore
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    contabilitaRepo.getSocietaAttiveBasic().then(({ data }) => {
      if (!alive) return
      const list = Array.isArray(data) ? data : []
      setSocieta(list)
      let pick = ''
      try {
        const last = localStorage.getItem(LAST_SOCIETA_STORAGE_KEY) || ''
        if (last && list.some((s) => String(s.id) === String(last))) pick = last
      } catch {
        // ignore
      }
      if (!pick && list[0]?.id) pick = list[0].id
      setSocietaId(pick)
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    if (!societaId) return
    setLoading(true)
    setError('')
    contabilitaRepo.getPartitarioBySocieta(societaId, { stato }).then(({ data, error }) => {
      if (!alive) return
      if (error) {
        setError(error.message || String(error))
        setRows([])
      } else {
        setRows(Array.isArray(data) ? data : [])
      }
    }).finally(() => {
      if (alive) setLoading(false)
    })
    return () => { alive = false }
  }, [societaId, stato])

  const filtered = useMemo(() => {
    const query = (q || '').trim().toLowerCase()
    return (rows || []).filter((r) => {
      if (tipo !== 'tutti' && String(r?.tipo || '') !== tipo) return false
      if (!query) return true
      const blob = `${r?.conto_descrizione || ''} ${r?.numero_documento || ''}`.toLowerCase()
      return blob.includes(query)
    })
  }, [rows, q, tipo])

  const stats = useMemo(() => {
    const all = rows || []
    const aperte = all.filter((r) => r.stato === 'aperta').length
    const parz = all.filter((r) => r.stato === 'parziale').length
    const chiuse = all.filter((r) => r.stato === 'chiusa').length
    const residuo = all.reduce((s, r) => s + Number(r?.importo_residuo || 0), 0)
    return { aperte, parz, chiuse, residuo }
  }, [rows])

  return (
    <div className="page">
      <ModuleHeader
        sectionLabel="Contabilità"
        title="Partitario"
        context="Partite aperte clienti/fornitori con stato e residui aggiornati"
      />

      <div className="card">
        <div className="toolbar" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="fg" style={{ minWidth: 220 }}>
            <label>Società</label>
            <BaseCombobox
              value={societaId}
              onChange={(v) => {
                const next = v || ''
                setSocietaId(next)
                try { if (next) localStorage.setItem(LAST_SOCIETA_STORAGE_KEY, next) } catch {}
              }}
              options={societa.map((s) => ({ id: s.id, label: s.denominazione }))}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable
              placeholder="Seleziona società…"
              maxItems={120}
            />
          </div>

          <div className="fg" style={{ minWidth: 170 }}>
            <label>Stato</label>
            <BaseCombobox
              value={stato}
              onChange={(v) => setStato(v || 'aperta')}
              options={[
                { id: 'aperta', label: 'Aperte' },
                { id: 'parziale', label: 'Parziali' },
                { id: 'chiusa', label: 'Chiuse' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>

          <div className="fg" style={{ minWidth: 190 }}>
            <label>Tipo</label>
            <BaseCombobox
              value={tipo}
              onChange={(v) => setTipo(v || 'tutti')}
              options={[
                { id: 'tutti', label: 'Tutti' },
                { id: 'cliente', label: 'Clienti' },
                { id: 'fornitore', label: 'Fornitori' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>

          <div className="fg" style={{ flex: 1, minWidth: 240 }}>
            <label>Cerca</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Denominazione, n. documento…" />
          </div>

          <div className="cont-toolbar-summary">
            <span className="cont-toolbar-pill"><strong>{stats.aperte}</strong> aperte</span>
            <span className="cont-toolbar-pill"><strong>{stats.parz}</strong> parziali</span>
            <span className="cont-toolbar-pill"><strong>{stats.chiuse}</strong> chiuse</span>
            <span className="cont-toolbar-pill"><strong>{fmt(stats.residuo)}</strong> residuo</span>
          </div>
        </div>
      </div>

      {error ? <div className="alert alert-warn">{error}</div> : null}

      {loading ? (
        <div className="empty"><div className="empty-t">Caricamento…</div></div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">💳</div>
          <div className="empty-t">Nessuna partita</div>
          <div className="empty-s">Non risultano partite con i filtri selezionati.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Controparte</th>
                <th>Documento</th>
                <th>Scadenza</th>
                <th className="tar">Orig.</th>
                <th className="tar">Pagato</th>
                <th className="tar">Residuo</th>
                <th>Stato</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 400).map((r) => (
                <tr key={r.id}>
                  <td><span className="bdg bdg-gray">{r.tipo}</span></td>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.conto_descrizione || '—'}</td>
                  <td style={{ fontFamily: 'monospace' }}>{r.numero_documento || '—'}</td>
                  <td style={{ fontSize: '.78rem' }}>{r.data_scadenza ? fmtDate(r.data_scadenza) : '—'}</td>
                  <td className="tar" style={{ fontWeight: 700 }}>{fmt(r.importo_originale)}</td>
                  <td className="tar">{fmt(r.importo_pagato)}</td>
                  <td className="tar" style={{ fontWeight: 700, color: Number(r.importo_residuo || 0) > 0 ? 'var(--gld2)' : 'var(--mu)' }}>{fmt(r.importo_residuo)}</td>
                  <td><span className="bdg bdg-gray">{r.stato}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
