import { useEffect, useMemo, useState } from 'react'
import { sb } from '../../lib/supabase'
import { ModuleHeader } from '../../shared/components'
import { BaseCombobox } from '../../shared/ui/BaseDropdown.jsx'
import { LAST_SOCIETA_STORAGE_KEY } from '../../shared/constants'
import * as contabilitaRepo from '../contabilita/data/contabilitaRepo.js'
import { fmtCurrency as fmt, fmtDate } from '../contabilita/ui/formatters.js'

function toIsoDate(d) {
  if (!d) return ''
  return String(d).slice(0, 10)
}

function sumByConto(righe) {
  const map = new Map()
  for (const r of righe || []) {
    const key = String(r?.conto_id || '')
    if (!key) continue
    const cur = map.get(key) || {
      conto_id: key,
      conto_codice: r?.conto_codice || '',
      conto_descrizione: r?.conto_descrizione || '',
      dare: 0,
      avere: 0,
    }
    cur.dare += Number(r?.importo_dare || 0)
    cur.avere += Number(r?.importo_avere || 0)
    if (!cur.conto_codice && r?.conto_codice) cur.conto_codice = r.conto_codice
    if (!cur.conto_descrizione && r?.conto_descrizione) cur.conto_descrizione = r.conto_descrizione
    map.set(key, cur)
  }
  return Array.from(map.values())
}

export function ModuloBilancio() {
  const [societa, setSocieta] = useState([])
  const [societaId, setSocietaId] = useState('')
  const [periodMode, setPeriodMode] = useState('anno') // anno | range
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [rangeFrom, setRangeFrom] = useState(String(new Date().getFullYear()) + '-01-01')
  const [rangeTo, setRangeTo] = useState(toIsoDate(new Date().toISOString()))
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [righe, setRighe] = useState([])
  const [selectedContoId, setSelectedContoId] = useState('')
  const [drillRows, setDrillRows] = useState([])
  const [drillLoading, setDrillLoading] = useState(false)

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

  const { fromDate, toDate, labelPeriodo } = useMemo(() => {
    if (periodMode === 'anno') {
      const y = String(year || new Date().getFullYear())
      return { fromDate: `${y}-01-01`, toDate: `${y}-12-31`, labelPeriodo: y }
    }
    return { fromDate: rangeFrom || '', toDate: rangeTo || '', labelPeriodo: `${rangeFrom}–${rangeTo}` }
  }, [periodMode, year, rangeFrom, rangeTo])

  const carica = async () => {
    if (!societaId) return
    setLoading(true)
    setError('')
    setSelectedContoId('')
    setDrillRows([])
    try {
      const q = sb
        .from('prima_nota_righe')
        .select('conto_id, conto_codice, conto_descrizione, importo_dare, importo_avere, prima_nota!inner(id, societa_id, data_registrazione)')
        .eq('prima_nota.societa_id', societaId)
        .gte('prima_nota.data_registrazione', fromDate)
        .lte('prima_nota.data_registrazione', toDate)
        .limit(10000)
      const { data, error } = await q
      if (error) throw error
      setRighe(Array.isArray(data) ? data : [])
    } catch (e) {
      setError(e?.message || String(e))
      setRighe([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void carica()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societaId, fromDate, toDate])

  const bilancioRows = useMemo(() => {
    const summed = sumByConto(righe)
      .map((r) => {
        const saldo = Number(r.dare || 0) - Number(r.avere || 0)
        return { ...r, saldo }
      })
      .filter((r) => (Number(r.dare || 0) !== 0) || (Number(r.avere || 0) !== 0))
      .sort((a, b) => String(a.conto_codice || '').localeCompare(String(b.conto_codice || '')))
    return summed
  }, [righe])

  useEffect(() => {
    let alive = true
    if (!selectedContoId || !societaId) return
    setDrillLoading(true)
    setDrillRows([])
    sb
      .from('prima_nota_righe')
      .select('id, descrizione_riga, importo_dare, importo_avere, prima_nota!inner(id, numero_registrazione, data_registrazione, descrizione)')
      .eq('conto_id', selectedContoId)
      .eq('prima_nota.societa_id', societaId)
      .gte('prima_nota.data_registrazione', fromDate)
      .lte('prima_nota.data_registrazione', toDate)
      .order('data_registrazione', { ascending: false, foreignTable: 'prima_nota' })
      .limit(300)
      .then(({ data }) => {
        if (!alive) return
        setDrillRows(Array.isArray(data) ? data : [])
      })
      .finally(() => {
        if (alive) setDrillLoading(false)
      })
    return () => { alive = false }
  }, [selectedContoId, societaId, fromDate, toDate])

  const selected = useMemo(() => bilancioRows.find((r) => String(r.conto_id) === String(selectedContoId)) || null, [bilancioRows, selectedContoId])

  return (
    <div className="page">
      <ModuleHeader
        sectionLabel="Analisi"
        title="Bilancio"
        context={`Bilancio di verifica · ${labelPeriodo}`}
        secondaryAction={<button className="btn-sec" onClick={carica} disabled={loading}>Aggiorna</button>}
      />

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-title">Filtri</div>
            <div className="card-subtitle">Società e periodo di lettura del bilancio di verifica.</div>
          </div>
        </div>
        <div className="toolbar" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
          <div className="fg" style={{ minWidth: 260 }}>
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

          <div className="fg" style={{ minWidth: 150 }}>
            <label>Periodo</label>
            <BaseCombobox
              value={periodMode}
              onChange={(v) => setPeriodMode(v || 'anno')}
              options={[
                { id: 'anno', label: 'Anno' },
                { id: 'range', label: 'Range' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>

          {periodMode === 'anno' ? (
            <div className="fg" style={{ minWidth: 140 }}>
              <label>Anno</label>
              <BaseCombobox
                value={String(year || '')}
                onChange={(v) => setYear(v || String(new Date().getFullYear()))}
                options={[
                  String(new Date().getFullYear()),
                  String(new Date().getFullYear() - 1),
                  String(new Date().getFullYear() - 2),
                ].map((y) => ({ id: y, label: y }))}
                getOptionId={(o) => o?.id}
                getOptionLabel={(o) => o?.label}
                searchable={false}
              />
            </div>
          ) : (
            <>
              <div className="fg" style={{ minWidth: 160 }}>
                <label>Da</label>
                <input type="date" value={fromDate} onChange={(e) => setRangeFrom(e.target.value)} />
              </div>
              <div className="fg" style={{ minWidth: 160 }}>
                <label>A</label>
                <input type="date" value={toDate} onChange={(e) => setRangeTo(e.target.value)} />
              </div>
            </>
          )}

          <div className="cont-toolbar-summary">
            <span className="cont-toolbar-pill"><strong>{bilancioRows.length}</strong> conti</span>
          </div>
        </div>
      </div>

      {error ? <div className="alert alert-warn">{error}</div> : null}

      {loading ? (
        <div className="empty"><div className="empty-t">Caricamento…</div></div>
      ) : bilancioRows.length === 0 ? (
        <div className="empty">
          <div className="empty-ico">⚖️</div>
          <div className="empty-t">Nessun movimento</div>
          <div className="empty-s">Nel periodo selezionato non risultano righe di prima nota.</div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Conto</th>
                <th className="tar">Dare</th>
                <th className="tar">Avere</th>
                <th className="tar">Saldo</th>
              </tr>
            </thead>
            <tbody>
              {bilancioRows.slice(0, 700).map((r) => (
                <tr
                  key={r.conto_id}
                  className={String(selectedContoId) === String(r.conto_id) ? 'is-selected' : ''}
                  onClick={() => setSelectedContoId(r.conto_id)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    <div style={{ fontWeight: 700 }}>
                      <span style={{ fontFamily: 'monospace', color: 'var(--mu)', marginRight: 8 }}>{r.conto_codice || '—'}</span>
                      {r.conto_descrizione || '—'}
                    </div>
                  </td>
                  <td className="tar">{fmt(r.dare)}</td>
                  <td className="tar">{fmt(r.avere)}</td>
                  <td className="tar" style={{ fontWeight: 800, color: r.saldo >= 0 ? 'var(--gr)' : 'var(--rd)' }}>
                    {r.saldo >= 0 ? '+' : ''}{fmt(r.saldo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected ? (
        <div className="card" style={{ marginTop: 16, padding: 16 }}>
          <div className="card-hdr">
            <div>
              <div className="card-title">Drill-down</div>
              <div className="card-subtitle">
                Conto {selected.conto_codice || '—'} · {selected.conto_descrizione || '—'} · {labelPeriodo}
              </div>
            </div>
          </div>
          {drillLoading ? (
            <div className="empty"><div className="empty-t">Caricamento movimenti…</div></div>
          ) : drillRows.length === 0 ? (
            <div className="empty"><div className="empty-s">Nessun movimento per il conto selezionato.</div></div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Prima nota</th>
                    <th>Descrizione</th>
                    <th className="tar">Dare</th>
                    <th className="tar">Avere</th>
                  </tr>
                </thead>
                <tbody>
                  {drillRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ fontSize: '.78rem' }}>{r?.prima_nota?.data_registrazione ? fmtDate(r.prima_nota.data_registrazione) : '—'}</td>
                      <td><span className="bdg bdg-gray">{r?.prima_nota?.numero_registrazione || '—'}</span></td>
                      <td style={{ maxWidth: 520, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.descrizione_riga || r?.prima_nota?.descrizione || '—'}
                      </td>
                      <td className="tar">{fmt(r.importo_dare)}</td>
                      <td className="tar">{fmt(r.importo_avere)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}

