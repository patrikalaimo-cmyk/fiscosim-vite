import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta } from '../../utils/pipelineLogger.js'
import { parseIvaPercent, classifyIvaRegime, formatIvaRegimeLabel } from '../../../domain/resolveIva.js'
import {
  buildScritturaContabileFromDraft,
  buildPrimaNotaPayloadFromState,
} from '../../../domain/primaNotaPipeline.js'
import {
  normalizePartitarioEntry,
  normalizeRigaForPrimaNotaPayload,
} from '../../../domain/primaNotaPayloadBuilder.js'
import { loadIvaInsightsForSocieta } from './application/ivaInsightsClient.js'
import * as contabilitaRepo from './data/contabilitaRepo.js'
import { createPrimaNotaCompleta } from '../../../services/primaNotaService.js'
import { fmtCurrency as fmtMoney, fmtDate } from './ui/formatters.js'

const todayStr = () => new Date().toISOString().split('T')[0]

function toMoneyNumber(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v || '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function moneyInputValue(n) {
  if (n == null) return ''
  if (!Number.isFinite(n)) return ''
  return String(n)
}

function newRow() {
  return { id: crypto.randomUUID?.() || String(Math.random()), conto_id: '', descrizione: '', dare: '', avere: '' }
}

function hasImporto(r) {
  return toMoneyNumber(r?.dare) > 0 || toMoneyNumber(r?.avere) > 0
}

function newIvaRowId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `iva-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** Normalizza ivaRows dal draft; migrazione da bozza solo ivaUi. */
function normalizeIvaRowsFromDraft(initialDraft) {
  const raw = initialDraft?.ivaRows
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map((r) => ({
      id: r.id || newIvaRowId(),
      aliquota: Number.isFinite(r.aliquota) ? r.aliquota : (parseIvaPercent(r.aliquota) ?? 0),
      imponibile: toMoneyNumber(r.imponibile),
      iva: toMoneyNumber(r.iva),
      causale_iva_id: r.causale_iva_id ? String(r.causale_iva_id) : null,
      codice_interno: r.codice_interno ?? null,
      autoResolved: r.autoResolved === true,
      natura: r.natura ?? null,
      regime_iva: r.regime_iva ?? null
    }))
  }
  const u = initialDraft?.ivaUi
  if (u && (u.imponibile != null || u.iva != null || u.causale_iva_id)) {
    const aliqRaw = u.aliquota
    const aliq = typeof aliqRaw === 'number' && Number.isFinite(aliqRaw)
      ? Math.round(aliqRaw)
      : (parseIvaPercent(aliqRaw) ?? 0)
    return [{
      id: newIvaRowId(),
      aliquota: aliq,
      imponibile: toMoneyNumber(u.imponibile),
      iva: toMoneyNumber(u.iva),
      causale_iva_id: u.causale_iva_id ? String(u.causale_iva_id) : null,
      codice_interno: null,
      autoResolved: false,
      natura: u.natura ?? null,
      regime_iva: u.regime_iva ?? null
    }]
  }
  return []
}

/** Snapshot compatto per pipeline log (traccia perdita causale_iva_id). */
function buildGuidataSnapshot({ header, rows, ivaUi, ivaRows, stato, progressivo, activeTab, partitarioClosedMap }) {
  return {
    stato,
    progressivo,
    activeTab,
    header,
    ivaUi_causale_iva_id: ivaUi?.causale_iva_id ?? null,
    ivaUi,
    ivaRows_count: Array.isArray(ivaRows) ? ivaRows.length : 0,
    righe: (rows || []).map((r, i) => ({
      i,
      id: r?.id,
      conto_id: r?.conto_id,
      descrizione: r?.descrizione,
      dare: r?.dare,
      avere: r?.avere,
      causale_iva_id: r?.causale_iva_id ?? null
    })),
    partitarioClosedMap_count: Object.keys(partitarioClosedMap || {}).length
  }
}

function SearchSelect({ label, value, onChange, options, placeholder = 'Cerca…', formatOption, defaultValue }) {
  const [q, setQ] = useState('')
  const defaultLoggedRef = useRef(false)
  useEffect(() => {
    if (defaultValue === undefined || defaultValue === null || defaultValue === '') return
    if (defaultLoggedRef.current) return
    defaultLoggedRef.current = true
    traceStep('UI_DEFAULT_VALUE', { defaultValue, field: label || 'SearchSelect' }, { component: 'SearchSelect' })
  }, [defaultValue, label])

  const filtered = useMemo(() => {
    const query = (q || '').trim().toLowerCase()
    if (!query) return options
    return options.filter(o => {
      const text = (formatOption ? formatOption(o) : o.label || o.name || o.descrizione || o.codice || o.id || '')
      return String(text).toLowerCase().includes(query)
    })
  }, [q, options, formatOption])

  return (
    <div className="fg">
      {label && <label>{label}</label>}
      <input
        value={q}
        onChange={e => {
          const v = e.target.value
          traceStep('UI_INPUT_CHANGE', { value: v, payload: { field: label, control: 'SearchSelect_filter' } })
          setQ(v)
        }}
        placeholder={placeholder}
      />
      <select
        value={value || ''}
        onChange={e => {
          const v = e.target.value
          traceStep('UI_INPUT_CHANGE', { value: v, payload: { field: label, control: 'SearchSelect' } })
          onChange(v)
        }}
        style={{ marginTop: '.35rem' }}
      >
        <option value="">— Seleziona —</option>
        {filtered.map(o => (
          <option key={o.id} value={o.id}>
            {formatOption ? formatOption(o) : (o.label || o.name || o.descrizione || o.codice || o.id)}
          </option>
        ))}
      </select>
    </div>
  )
}

/** Combobox: input + filtro + elenco (un solo controllo, niente doppio select + stringa operatore). */
function CausaleIvaCombobox({
  value,
  onChange,
  causaliIva,
  rowAliquota,
  buildCausaleIvaLabel,
  parseAliquota,
  disabled
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('')
  const wrapRef = useRef(null)
  const selected = causaliIva.find(c => String(c.id) === String(value))

  useEffect(() => {
    const onDoc = (e) => {
      if (!wrapRef.current?.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const displayLabel = selected
    ? `${buildCausaleIvaLabel(selected)} — ${selected.descrizione || ''}`.trim()
    : ''

  const options = useMemo(() => {
    const ra = Math.round(Number(rowAliquota))
    const sorted = [...(causaliIva || [])].sort((a, b) => {
      const ma = parseAliquota(a?.aliquota)
      const mb = parseAliquota(b?.aliquota)
      const sa = ma === ra ? 0 : 1
      const sb = mb === ra ? 0 : 1
      if (sa !== sb) return sa - sb
      const la = `${buildCausaleIvaLabel(a)} ${a?.descrizione || ''}`.toLowerCase()
      const lb = `${buildCausaleIvaLabel(b)} ${b?.descrizione || ''}`.toLowerCase()
      return la.localeCompare(lb, 'it')
    })
    const q = (filter || '').trim().toLowerCase()
    if (!q) return sorted
    return sorted.filter(c => {
      const t = `${buildCausaleIvaLabel(c)} ${c?.descrizione || ''} ${c?.codice || ''}`.toLowerCase()
      return t.includes(q)
    })
  }, [causaliIva, filter, rowAliquota, buildCausaleIvaLabel, parseAliquota])

  return (
    <div ref={wrapRef} style={{ position: 'relative', minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 2, alignItems: 'stretch' }}>
        <input
          type="text"
          readOnly={!open}
          value={open ? filter : displayLabel}
          placeholder="Cerca causale IVA…"
          disabled={disabled}
          onFocus={() => {
            setOpen(true)
            setFilter(displayLabel)
          }}
          onChange={e => {
            setFilter(e.target.value)
            setOpen(true)
            traceStep('UI_INPUT_CHANGE', { value: e.target.value, payload: { field: 'causale_iva_combobox_filter', rowAliquota } })
          }}
          style={{ flex: 1, minWidth: 0 }}
        />
        <button
          type="button"
          className="btn-sec"
          disabled={disabled}
          aria-label="Apri elenco causali IVA"
          onClick={() => {
            setOpen(o => !o)
            if (!open) setFilter(displayLabel)
          }}
          style={{ padding: '.25rem .45rem', fontSize: '.7rem' }}
        >
          ▼
        </button>
      </div>
      {open && (
        <ul
          style={{
            position: 'absolute',
            zIndex: 50,
            left: 0,
            right: 0,
            maxHeight: 220,
            overflowY: 'auto',
            margin: '.2rem 0 0',
            padding: '.25rem 0',
            listStyle: 'none',
            background: 'var(--card, #fff)',
            border: '1px solid var(--bd)',
            borderRadius: 4,
            boxShadow: '0 4px 12px rgba(0,0,0,.12)'
          }}
        >
          {options.map(c => (
            <li
              key={c.id}
              style={{
                padding: '.35rem .6rem',
                cursor: 'pointer',
                fontSize: '.78rem',
                background: String(c.id) === String(value) ? 'rgba(212,175,55,.12)' : undefined
              }}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                onChange(c.id)
                setOpen(false)
                setFilter('')
                traceStep('UI_INPUT_CHANGE', { value: c.id, payload: { field: 'causale_iva_combobox', rowAliquota } })
              }}
            >
              {buildCausaleIvaLabel(c)} — {c.descrizione || ''}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Riga tabella scrittura guidata — log props per binding causale_iva_id (anche a livello riga se presente). */
function PrimaNotaGuidataRigaRow({
  r,
  rowIndex,
  stato,
  pianoConti,
  totalsBilanciata,
  updateRow,
  deleteRow,
  onFocusRow,
  rowsLength,
  ivaUiCausaleIvaId
}) {
  const props = {
    rowIndex,
    riga: {
      id: r.id,
      conto_id: r.conto_id,
      descrizione: r.descrizione,
      dare: r.dare,
      avere: r.avere,
      causale_iva_id: r.causale_iva_id ?? null
    },
    ivaUi_causale_iva_id: ivaUiCausaleIvaId
  }
  traceStep('UI_ROW_PROPS', props, { component: 'PrimaNotaGuidataRigaRow' })

  return (
    <tr style={!totalsBilanciata ? { background: 'rgba(255,92,92,.05)' } : undefined}>
      <td onFocus={() => onFocusRow(r.id)}>
        <select
          value={r.conto_id || ''}
          onChange={e => {
            const value = e.target.value
            traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'conto_id', rowId: r.id, rowIndex } })
            updateRow(r.id, { conto_id: value })
          }}
          disabled={stato === 'confermata'}
          style={{ width: '100%' }}
        >
          <option value="">— Seleziona conto —</option>
          {pianoConti.map(c => (
            <option key={c.id} value={c.id}>
              {(c.codice ? `${c.codice} · ` : '') + (c.descrizione || c.nome || '')}
            </option>
          ))}
        </select>
      </td>
      <td onFocus={() => onFocusRow(r.id)}>
        <input
          value={r.descrizione || ''}
          onChange={e => {
            const value = e.target.value
            traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'descrizione', rowId: r.id, rowIndex } })
            updateRow(r.id, { descrizione: value })
          }}
          placeholder="Descrizione riga…"
          disabled={stato === 'confermata'}
        />
      </td>
      <td style={{ textAlign: 'right' }} onFocus={() => onFocusRow(r.id)}>
        <input
          inputMode="decimal"
          style={{ textAlign: 'right' }}
          value={moneyInputValue(r.dare)}
          onChange={e => {
            const value = e.target.value
            traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'dare', rowId: r.id, rowIndex } })
            // UX: se compila Dare, azzera Avere (evita doppio importo).
            updateRow(r.id, { dare: value, avere: value ? '' : r.avere })
          }}
          placeholder="0,00"
          disabled={stato === 'confermata'}
        />
      </td>
      <td style={{ textAlign: 'right' }} onFocus={() => onFocusRow(r.id)}>
        <input
          inputMode="decimal"
          style={{ textAlign: 'right' }}
          value={moneyInputValue(r.avere)}
          onChange={e => {
            const value = e.target.value
            traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'avere', rowId: r.id, rowIndex } })
            updateRow(r.id, { avere: value, dare: value ? '' : r.dare })
          }}
          placeholder="0,00"
          disabled={stato === 'confermata'}
        />
      </td>
      <td style={{ textAlign: 'right' }}>
        <button
          className="btn-sec"
          onClick={() => deleteRow(r.id)}
          disabled={stato === 'confermata' || rowsLength <= 1}
          style={{ padding: '.25rem .45rem', fontSize: '.72rem' }}
          title="Elimina riga"
        >
          🗑️
        </button>
      </td>
    </tr>
  )
}

function Tabs({ tabs, activeId, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
      {tabs.map(t => (
        <button
          key={t.id}
          className={activeId === t.id ? 'btn' : 'btn-sec'}
          onClick={() => onChange(t.id)}
          style={{ fontSize: '.72rem', padding: '.35rem .6rem' }}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function Partitario({ clienteFornitoreId, clientiFornitori, closedMap, setClosedMap }) {
  const cliente = useMemo(
    () => clientiFornitori.find(c => String(c.id) === String(clienteFornitoreId)) || null,
    [clientiFornitori, clienteFornitoreId]
  )

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [fatture, setFatture] = useState([])
  const [selectedIds, setSelectedIds] = useState([])

  const soggettoKey = useMemo(() => {
    const piva = cliente?.partita_iva ? String(cliente.partita_iva).trim() : ''
    const cf = cliente?.codice_fiscale ? String(cliente.codice_fiscale).trim().toUpperCase() : ''
    return { piva, cf }
  }, [cliente])

  useEffect(() => {
    let alive = true
    const load = async () => {
      if (!clienteFornitoreId) return
      setLoading(true)
      setError(null)
      try {
        // Nota: niente backend nuovo. Usiamo in lettura `documenti_contabilita` filtrando per soggetto.
        // "Aperte" qui = fatture del soggetto con totale>0 e non già “chiuse” nella UI corrente.
        const { data, error: e } = soggettoKey.piva
          ? await contabilitaRepo.getDocumentiContabilitaBySoggettoPiva(soggettoKey.piva)
          : await contabilitaRepo.getDocumentiContabilitaBySoggettoCf(soggettoKey.cf)
        if (e) throw e

        const onlyFatture = (data || []).filter(d => String(d.tipo_documento || '').toLowerCase().includes('fattura'))
        const list = (onlyFatture.length ? onlyFatture : (data || []))
          .filter(d => toMoneyNumber(d.totale) > 0)

        if (!alive) return
        setFatture(list)
      } catch (e) {
        if (!alive) return
        setError(e?.message || 'Errore caricamento partitario')
        setFatture([])
      } finally {
        if (alive) setLoading(false)
      }
    }
    load()
    return () => { alive = false }
  }, [clienteFornitoreId, soggettoKey.piva, soggettoKey.cf])

  const items = useMemo(() => {
    return fatture.map(f => {
      const closed = toMoneyNumber(closedMap[f.id] || 0)
      const totale = toMoneyNumber(f.totale)
      const residuo = Math.max(0, Math.round((totale - closed) * 100) / 100)
      return { ...f, totale, closed, residuo }
    }).filter(f => f.residuo > 0)
  }, [fatture, closedMap])

  const saldoResiduo = useMemo(() => items.reduce((s, x) => s + toMoneyNumber(x.residuo), 0), [items])
  const saldoChiuso = useMemo(() => items.reduce((s, x) => s + toMoneyNumber(x.closed), 0), [items])

  const onSelect = (f) => {
    const id = f.id
    setSelectedIds(prev => {
      const isSelected = prev.includes(id)
      const next = isSelected ? prev.filter(x => x !== id) : [...prev, id]
      return next
    })
    setClosedMap(prev => {
      const next = { ...prev }
      const isSelected = selectedIds.includes(id)
      if (isSelected) delete next[id]
      else next[id] = f.totale
      return next
    })
  }

  const selected = items.find(x => x.id === selectedIds[selectedIds.length - 1]) || null

  return (
    <div className="card" style={{ marginTop: '.75rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 800 }}>Partitario</div>
          <div style={{ fontSize: '.78rem', color: 'var(--mu)' }}>
            {cliente
              ? <>Fatture aperte per <strong>{cliente.ragione_sociale || `${cliente.nome || ''} ${cliente.cognome || ''}`.trim()}</strong></>
              : 'Seleziona un Cliente/Fornitore per vedere le fatture aperte.'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="bdg bdg-blue" style={{ fontSize: '.65rem' }}>
            Aperto {fmtMoney(saldoResiduo)}
          </span>
          <span className="bdg bdg-green" style={{ fontSize: '.65rem' }}>
            Chiuso {fmtMoney(saldoChiuso)}
          </span>
        </div>
      </div>

      <div style={{ marginTop: '.75rem' }}>
        {loading && <div style={{ fontSize: '.8rem', color: 'var(--mu)' }}>⏳ Carico fatture…</div>}
        {!loading && error && <div style={{ fontSize: '.8rem', color: 'var(--rd)' }}>{error}</div>}
        {!loading && !error && items.length === 0 && (
          <div style={{ fontSize: '.8rem', color: 'var(--mu)' }}>Nessuna fattura aperta trovata.</div>
        )}

        {!loading && !error && items.length > 0 && (
          <div style={{ display: 'grid', gap: '.45rem' }}>
            {items.map(f => {
              const isSel = selectedIds.includes(f.id)
              const isClosed = f.residuo === 0
              return (
                <div
                  key={f.id}
                  onClick={() => onSelect(f)}
                  style={{
                    cursor: 'pointer',
                    border: '1px solid ' + (isSel ? 'var(--cy)' : 'var(--bd)'),
                    background: isSel ? 'rgba(0,200,255,.08)' : 'var(--s2)',
                    borderRadius: 10,
                    padding: '.6rem .7rem',
                    display: 'grid',
                    gridTemplateColumns: '1fr auto',
                    gap: '.35rem .75rem',
                    alignItems: 'center',
                    opacity: isClosed ? 0.6 : 1
                  }}
                  title="Clicca per selezionare e chiudere"
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'baseline', flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, fontSize: '.85rem' }}>{f.numero_documento || '—'}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>{fmtDate(f.data_documento)}</div>
                    </div>
                    <div style={{ fontSize: '.75rem', color: 'var(--mu)', marginTop: '.1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {f.soggetto_denominazione || ''}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '.74rem', color: 'var(--mu)' }}>Totale</div>
                    <div style={{ fontWeight: 800 }}>{fmtMoney(f.totale)}</div>
                    <div style={{ fontSize: '.74rem', color: 'var(--mu)', marginTop: '.25rem' }}>Residuo</div>
                    <div style={{ fontWeight: 800, color: f.residuo > 0 ? 'var(--gld2)' : 'var(--gr)' }}>{fmtMoney(f.residuo)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {selected && (
          <div style={{ marginTop: '.75rem', paddingTop: '.75rem', borderTop: '1px solid var(--bd)', fontSize: '.78rem', color: 'var(--mu)' }}>
            Selezionata: <strong style={{ color: 'var(--tx)' }}>{selected.numero_documento || '—'}</strong> · importo chiusura impostato a <strong style={{ color: 'var(--gr)' }}>{fmtMoney(selected.totale)}</strong>
          </div>
        )}
      </div>
    </div>
  )
}

export function PrimaNotaGuidata({
  pianoConti = [],
  causali = [],
  causaliIva = [],
  clientiFornitori = [],
  initialDraft = null,
  fromImport = false
  // societaId viene passato dal parent (no backend change)
  ,societaId = null
  ,onPrev = null
  ,onNext = null
  ,canPrev = false
  ,canNext = false
  ,onDraftChange = null
}) {
  // ─── HEADER (semplice) ────────────────────────────────────────
  const [header, setHeaderInternal] = useState(() => ({
    data_registrazione: initialDraft?.header?.data_registrazione || todayStr(),
    causale_id: initialDraft?.header?.causale_id || '',
    cliente_fornitore_id: initialDraft?.header?.cliente_fornitore_id || ''
  }))

  // ─── RIGHE (core) ─────────────────────────────────────────────
  const [rows, setRowsInternal] = useState(() => {
    const start = initialDraft?.rows?.length ? initialDraft.rows : []
    if (start.length) return start.map(r => ({ ...newRow(), ...r }))
    if (fromImport) {
      // Se arriva da import, evitiamo la tabella vuota.
      return [
        { ...newRow(), descrizione: 'Riga da import (esempio)', dare: 0, avere: '' },
        { ...newRow(), descrizione: 'Contropartita (esempio)', dare: '', avere: 0 }
      ]
    }
    return [newRow()]
  })

  const [partitarioClosedMap, setPartitarioClosedMapInternal] = useState(() => initialDraft?.partitarioClosedMap || ({})) // { [docId]: importoChiuso }

  const [stato, setStatoInternal] = useState(() => initialDraft?.stato || 'bozza') // bozza | confermata
  const [progressivo, setProgressivoInternal] = useState(() => initialDraft?.progressivo || null)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTabInternal] = useState('scrittura')

  const [ivaRows, setIvaRowsInternal] = useState(() => normalizeIvaRowsFromDraft(initialDraft))

  const [ivaUi, setIvaUiInternal] = useState(() => ({
    causale_iva_id: initialDraft?.ivaUi?.causale_iva_id || initialDraft?.meta?.causale_iva_id || '',
    label: '',
    aliquota: null,
    percDetraibile: initialDraft?.ivaUi?.percDetraibile ?? 100,
    imponibile: null,
    iva: null,
    ivaIndetraibile: initialDraft?.ivaUi?.ivaIndetraibile ?? 0,
    regime_iva: initialDraft?.ivaUi?.regime_iva ?? null,
    multi_riepilogo: initialDraft?.ivaUi?.multi_riepilogo === true
  }))
  const [ivaInsights, setIvaInsights] = useState([])
  const [ivaInsightsLoading, setIvaInsightsLoading] = useState(false)
  const ivaInsightsDisplay = useMemo(() => {
    if (!Array.isArray(ivaInsights)) return []
    const seen = new Set()
    const out = []
    for (const ins of ivaInsights) {
      const key = ins.fingerprint || ins.titolo || ins.descrizione
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(ins)
    }
    return out
  }, [ivaInsights])
  const ivaInsightsLimited = useMemo(() => ivaInsightsDisplay.slice(0, 3), [ivaInsightsDisplay])
  const ivaInsightsExtraCount = ivaInsightsDisplay.length > ivaInsightsLimited.length ? (ivaInsightsDisplay.length - ivaInsightsLimited.length) : 0

  const latestGuidataRef = useRef({})
  latestGuidataRef.current = { header, rows, ivaUi, ivaRows, stato, progressivo, activeTab, partitarioClosedMap }

  const runSetHeader = useCallback((updaterOrValue) => {
    setHeaderInternal(prevH => {
      const nextH = typeof updaterOrValue === 'function' ? updaterOrValue(prevH) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, header: prevH })
      const snapNext = buildGuidataSnapshot({ ...base, header: nextH })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'header' })
      return nextH
    })
  }, [])

  const runSetRows = useCallback((updaterOrValue) => {
    setRowsInternal(prevR => {
      const nextR = typeof updaterOrValue === 'function' ? updaterOrValue(prevR) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, rows: prevR })
      const snapNext = buildGuidataSnapshot({ ...base, rows: nextR })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'rows' })
      return nextR
    })
  }, [])

  const runSetIvaUi = useCallback((updaterOrValue) => {
    setIvaUiInternal(prevI => {
      const nextI = typeof updaterOrValue === 'function' ? updaterOrValue(prevI) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, ivaUi: prevI })
      const snapNext = buildGuidataSnapshot({ ...base, ivaUi: nextI })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'ivaUi' })
      return nextI
    })
  }, [])

  const runSetIvaRows = useCallback((updaterOrValue) => {
    setIvaRowsInternal(prevR => {
      const nextR = typeof updaterOrValue === 'function' ? updaterOrValue(prevR) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, ivaRows: prevR })
      const snapNext = buildGuidataSnapshot({ ...base, ivaRows: nextR })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'ivaRows' })
      traceStep('IVA_ROWS_UPDATED', { ivaRows: nextR }, {})
      return nextR
    })
  }, [])

  const runSetStato = useCallback((updaterOrValue) => {
    setStatoInternal(prevS => {
      const nextS = typeof updaterOrValue === 'function' ? updaterOrValue(prevS) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, stato: prevS })
      const snapNext = buildGuidataSnapshot({ ...base, stato: nextS })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'stato' })
      return nextS
    })
  }, [])

  const runSetProgressivo = useCallback((updaterOrValue) => {
    setProgressivoInternal(prevP => {
      const nextP = typeof updaterOrValue === 'function' ? updaterOrValue(prevP) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, progressivo: prevP })
      const snapNext = buildGuidataSnapshot({ ...base, progressivo: nextP })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'progressivo' })
      return nextP
    })
  }, [])

  const runSetActiveTab = useCallback((updaterOrValue) => {
    setActiveTabInternal(prevA => {
      const nextA = typeof updaterOrValue === 'function' ? updaterOrValue(prevA) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, activeTab: prevA })
      const snapNext = buildGuidataSnapshot({ ...base, activeTab: nextA })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'activeTab' })
      return nextA
    })
  }, [])

  const runSetPartitarioClosedMap = useCallback((updaterOrValue) => {
    setPartitarioClosedMapInternal(prevM => {
      const nextM = typeof updaterOrValue === 'function' ? updaterOrValue(prevM) : updaterOrValue
      const base = latestGuidataRef.current
      const snapPrev = buildGuidataSnapshot({ ...base, partitarioClosedMap: prevM })
      const snapNext = buildGuidataSnapshot({ ...base, partitarioClosedMap: nextM })
      if (typeof updaterOrValue === 'function') traceDiff('STATE_DIFF', snapPrev, snapNext)
      traceStep('STATE_BEFORE_SET', snapNext, { slice: 'partitarioClosedMap' })
      return nextM
    })
  }, [])

  useEffect(() => {
    traceStep('STATE_UPDATED', buildGuidataSnapshot({ header, rows, ivaUi, ivaRows, stato, progressivo, activeTab, partitarioClosedMap }))
    traceIva('STATE_AFTER_COMMIT', 'state', ivaUi?.causale_iva_id ?? null)
  }, [header, rows, ivaUi, ivaRows, stato, progressivo, activeTab, partitarioClosedMap])

  const docIdForInsights = initialDraft?.meta?.documento_import_id
  useEffect(() => {
    let alive = true
    if (!societaId || !docIdForInsights) {
      setIvaInsights([])
      return () => { alive = false }
    }
    setIvaInsightsLoading(true)
    loadIvaInsightsForSocieta(societaId, { docIds: [docIdForInsights] })
      .then((res) => {
        if (!alive) return
        const rows = res.byDocId?.[String(docIdForInsights)] || []
        setIvaInsights(rows)
      })
      .finally(() => {
        if (alive) setIvaInsightsLoading(false)
      })
    return () => { alive = false }
  }, [societaId, docIdForInsights])

  const selectedCausale = useMemo(
    () => causali.find(c => String(c.id) === String(header.causale_id)),
    [causali, header.causale_id]
  )

  const isFornitoreRow = (r) => {
    const d = String(r?.descrizione || '').toLowerCase()
    if (d.includes('fornitore')) return true
    // Fallback: nella scrittura import, la riga fornitore è tipicamente quella con AVERE valorizzato
    return toMoneyNumber(r?.avere) > 0
  }

  const syncScritturaFromIvaRows = useCallback((nextIvaRows) => {
    if (!nextIvaRows?.length) return
    const { rows: built, error } = buildScritturaContabileFromDraft({
      ivaRows: nextIvaRows,
      pianoConti,
      causaliIva,
      clientiFornitori,
      clienteFornitoreId: header.cliente_fornitore_id,
      causaleContabile: selectedCausale,
      soggettoNomeFallback: '',
      newRow
    })
    if (error) {
      traceStep('AUTO_CONTABILITA_ERROR', { error }, {})
      return
    }
    if (built?.length) {
      traceStep('AUTO_CONTABILITA_GENERATA', { righe: built }, {})
      runSetRows(built)
    }
  }, [
    runSetRows,
    pianoConti,
    causaliIva,
    clientiFornitori,
    header.cliente_fornitore_id,
    selectedCausale
  ])

  useEffect(() => {
    if (!ivaRows?.length) return
    syncScritturaFromIvaRows(ivaRows)
  }, [ivaRows, syncScritturaFromIvaRows, header.cliente_fornitore_id, header.causale_id])

  useEffect(() => {
    const totaleSelezionato = Object.values(partitarioClosedMap || {}).reduce((s, v) => s + toMoneyNumber(v), 0)
    if (totaleSelezionato <= 0) return
    runSetRows(prev => {
      const idx = prev.findIndex(isFornitoreRow)
      if (idx < 0) return prev
      const old = prev[idx]
      const next = [...prev]
      next[idx] = {
        ...old,
        avere: totaleSelezionato
      }
      return next
    })
  }, [partitarioClosedMap, runSetRows])

  const isFattura = useMemo(() => {
    if (!selectedCausale) return false
    const txt = `${selectedCausale.codice || ''} ${selectedCausale.descrizione || ''}`.toLowerCase()
    return txt.includes('fattura') || txt.includes('ft') || txt.includes('fa')
  }, [selectedCausale])

  const showPartitario = !!header.cliente_fornitore_id

  const totals = useMemo(() => {
    const totDare = rows.reduce((s, r) => s + toMoneyNumber(r.dare), 0)
    const totAvere = rows.reduce((s, r) => s + toMoneyNumber(r.avere), 0)
    const diff = Math.round((totDare - totAvere) * 100) / 100
    return { totDare, totAvere, diff, bilanciata: diff === 0 }
  }, [rows])

  // Quando cambio documento (nuovo initialDraft), resetta lo stato della UI guidata
  useEffect(() => {
    runSetHeader({
      data_registrazione: initialDraft?.header?.data_registrazione || todayStr(),
      causale_id: initialDraft?.header?.causale_id || '',
      cliente_fornitore_id: initialDraft?.header?.cliente_fornitore_id || ''
    })

    runSetIvaRows(normalizeIvaRowsFromDraft(initialDraft))

    runSetRows(() => {
      const start = initialDraft?.rows?.length ? initialDraft.rows : []
      if (start.length) return start.map(r => ({ ...newRow(), ...r }))
      return [newRow()]
    })

    runSetPartitarioClosedMap(initialDraft?.partitarioClosedMap || {})
    runSetStato(initialDraft?.stato || 'bozza')
    runSetProgressivo(initialDraft?.progressivo || null)

    // Reset completo (evita di trascinare label/aliquota dal documento precedente)
    runSetIvaUi({
      causale_iva_id: initialDraft?.ivaUi?.causale_iva_id || initialDraft?.meta?.causale_iva_id || '',
      label: initialDraft?.ivaUi?.label || '',
      aliquota: initialDraft?.ivaUi?.aliquota ?? null,
      percDetraibile: initialDraft?.ivaUi?.percDetraibile ?? 100,
      imponibile: initialDraft?.ivaUi?.imponibile ?? null,
      iva: initialDraft?.ivaUi?.iva ?? null,
      ivaIndetraibile: initialDraft?.ivaUi?.ivaIndetraibile ?? 0,
      regime_iva: initialDraft?.ivaUi?.regime_iva ?? null,
      multi_riepilogo: initialDraft?.ivaUi?.multi_riepilogo === true
    })
  }, [initialDraft?.meta?.documento_import_id, runSetHeader, runSetRows, runSetIvaRows, runSetPartitarioClosedMap, runSetStato, runSetProgressivo, runSetIvaUi])

  // Persist bozza (parent/localStorage) quando cambia lo stato rilevante
  useEffect(() => {
    if (!onDraftChange) return
    const draft = {
      stato,
      progressivo,
      header,
      rows,
      meta: initialDraft?.meta || {},
      partitarioClosedMap,
      ivaRows,
      ivaUi
    }
    onDraftChange(draft)
  }, [stato, progressivo, header, rows, partitarioClosedMap, ivaRows, ivaUi])

  const selectedCausaleIva = useMemo(
    () => causaliIva.find(c => String(c.id) === String(ivaUi.causale_iva_id)) || null,
    [causaliIva, ivaUi.causale_iva_id]
  )

  const parseAliquota = (a) => {
    const x = typeof a === 'number' ? a : parseFloat(String(a ?? '').replace(',', '.'))
    return Number.isFinite(x) ? x : null
  }

  const parsePercent = (p) => {
    if (p == null) return 0
    if (typeof p === 'number') return Number.isFinite(p) ? p : 0
    const s = String(p).trim().toLowerCase()
    // Supporta valori come "100%", "40 %", "100,00", "0", ecc.
    const m = s.match(/(\d+(?:[.,]\d+)?)/)
    if (!m) return 0
    const x = parseFloat(m[1].replace(',', '.'))
    return Number.isFinite(x) ? x : 0
  }

  const isDetraibileFalse = (v) => {
    if (v === false || v === 0) return true
    const s = String(v ?? '').trim().toLowerCase()
    return s === 'false' || s === '0' || s === 'no' || s === 'n' || s === 'off' || s === 'f'
  }

  const getPercDetraibileFromCausale = (c) => {
    if (!c) return 100
    if (isDetraibileFalse(c.detraibile)) return 0

    // Schema corrente: percentuale_detraibilita (0..100)
    const det = parsePercent(c.percentuale_detraibilita)
    if (String(c.percentuale_detraibilita ?? '').trim() !== '') {
      return Math.max(0, Math.min(100, det))
    }

    // Fallback legacy: percentuale_indetraibilita (0..100)
    const ind = parsePercent(c.percentuale_indetraibilita)
    return Math.max(0, Math.min(100, 100 - ind))
  }

  const buildCausaleIvaLabel = (c) => {
    if (!c) return ''
    const aliq = parseAliquota(c.aliquota)
    const det = getPercDetraibileFromCausale(c)
    const aliqTxt = aliq != null ? `${aliq}%` : ''
    const detTxt = det === 100 ? 'detraibile 100%' : (det === 0 ? 'indetraibile 100%' : `detraibile ${det}%`)
    return [c.codice, aliqTxt, detTxt].filter(Boolean).join(' · ')
  }

  const applyIvaToRows = useCallback(({ imponibile, iva, ivaIndetraibile }) => {
    if (ivaRows.length > 0) return
    if (ivaUi.multi_riepilogo) return
    const ivaDetraibile = Math.max(0, Math.round((iva - ivaIndetraibile) * 100) / 100)
    const costoConIndet = Math.round((imponibile + ivaIndetraibile) * 100) / 100

    runSetRows(prev => {
      const next = [...prev]
      const idxImp = next.findIndex(r => String(r?.descrizione || '').toLowerCase().includes('imponibile'))
      const idxIva = next.findIndex(r => /^iva(\b|\s*\()/i.test(String(r?.descrizione || '').trim()))
      if (idxImp >= 0) next[idxImp] = { ...next[idxImp], dare: costoConIndet }
      if (idxIva >= 0) next[idxIva] = { ...next[idxIva], dare: ivaDetraibile }
      return next
    })
  }, [runSetRows, ivaUi.multi_riepilogo, ivaRows.length])

  useEffect(() => {
    if (ivaRows.length > 0) return
    if (!selectedCausaleIva) return
    const aliq = parseAliquota(selectedCausaleIva.aliquota) ?? 0
    const percDet = getPercDetraibileFromCausale(selectedCausaleIva)

    // Da import: imponibile/IVA arrivano dal documento (e da più DatiRiepilogo). NON ricalcolare da
    // totale documento / (1+aliquota): con più aliquote (o 0% + 22%) produrrebbe IVA errata (es. 10,81 vs 10,45).
    if (fromImport) {
      const nextRegime = classifyIvaRegime({
        causale: selectedCausaleIva,
        natura: null,
        aliquota: aliq,
      })
      runSetIvaUi(prev => ({
        ...prev,
        label: prev.label || buildCausaleIvaLabel(selectedCausaleIva),
        percDetraibile: percDet,
        aliquota: prev.aliquota != null ? prev.aliquota : aliq,
        ivaIndetraibile: Math.round((toMoneyNumber(prev.iva) * (100 - percDet) / 100) * 100) / 100,
        regime_iva: prev.regime_iva || nextRegime
      }))
      return
    }

    // Usa il totale attuale (tipicamente Avere fornitore) come base per ricalcolo (solo bozza manuale).
    const totaleBase = Math.max(totals.totAvere, totals.totDare, 0)
    const impon = aliq > 0 ? Math.round((totaleBase / (1 + aliq / 100)) * 100) / 100 : totaleBase
    const ivaCalc = Math.round((totaleBase - impon) * 100) / 100
    const ivaInd = Math.round((ivaCalc * (100 - percDet) / 100) * 100) / 100

    runSetIvaUi(prev => ({
      ...prev,
      label: prev.label || buildCausaleIvaLabel(selectedCausaleIva),
      aliquota: aliq,
      percDetraibile: percDet,
      imponibile: impon,
      iva: ivaCalc,
      ivaIndetraibile: ivaInd,
      regime_iva: prev.regime_iva || classifyIvaRegime({ causale: selectedCausaleIva, natura: null, aliquota: aliq })
    }))

    applyIvaToRows({ imponibile: impon, iva: ivaCalc, ivaIndetraibile: ivaInd })
  }, [ivaRows.length, selectedCausaleIva?.id, fromImport, runSetIvaUi, applyIvaToRows, totals.totAvere, totals.totDare])

  const totaleDerivato = useMemo(() => {
    // In UI guidata mostriamo un "totale" unico: se bilanciata, usa il maggiore (di solito sono uguali).
    if (!totals.bilanciata) return Math.max(totals.totDare, totals.totAvere)
    return totals.totDare
  }, [totals])

  const primaryIvaCausaleForTrace = useMemo(
    () => ivaRows.find(r => r.causale_iva_id)?.causale_iva_id ?? ivaUi.causale_iva_id ?? '',
    [ivaRows, ivaUi.causale_iva_id]
  )

  const ivaRowsDisplay = useMemo(
    () => [...ivaRows].sort((a, b) => a.aliquota - b.aliquota),
    [ivaRows]
  )

  const regimeSummary = useMemo(() => {
    const regimes = ivaRows.map(r => r.regime_iva || null).filter(Boolean)
    const uniq = Array.from(new Set(regimes))
    return {
      list: uniq,
      unknown: ivaRows.some(r => r.regime_iva === 'unknown' || !r.regime_iva),
      mixed: uniq.length > 1
    }
  }, [ivaRows])

  const ivaTotalsFromRows = useMemo(() => {
    const ti = ivaRows.reduce((s, r) => s + r.imponibile, 0)
    const tv = ivaRows.reduce((s, r) => s + r.iva, 0)
    return { totImponibile: ti, totIva: tv, totDoc: ti + tv }
  }, [ivaRows])

  const tabs = useMemo(() => {
    const t = [{ id: 'scrittura', label: 'Scrittura' }]
    if (isFattura) t.push({ id: 'iva', label: 'Movimenti IVA' })
    if (showPartitario) t.push({ id: 'partitario', label: 'Partitario' })
    return t
  }, [isFattura, showPartitario])

  useEffect(() => {
    // Se la tab attiva sparisce (causale/cliente cambiati), torna alla scrittura.
    if (!tabs.some(t => t.id === activeTab)) runSetActiveTab('scrittura')
  }, [tabs, activeTab, runSetActiveTab])

  const addRow = () => runSetRows(prev => [...prev, newRow()])
  const deleteRow = (rowId) => runSetRows(prev => (prev.length <= 1 ? prev : prev.filter(r => r.id !== rowId)))
  const updateRow = (rowId, patch) =>
    runSetRows(prev => prev.map(r => (r.id === rowId ? { ...r, ...patch } : r)))

  const lastFocusedRowId = useRef(null)
  const onFocusRow = (rowId) => { lastFocusedRowId.current = rowId }

  const onConfirm = () => {
    const year = new Date(header.data_registrazione || todayStr()).getFullYear()
    const key = `primaNotaProg_${year}`
    const current = parseInt(localStorage.getItem(key) || '0', 10)
    const next = Number.isFinite(current) ? current + 1 : 1
    localStorage.setItem(key, String(next))
    runSetProgressivo(next)
    runSetStato('confermata')
  }

  const onBackToDraft = () => {
    runSetStato('bozza')
    runSetProgressivo(null)
  }

  async function handleSave() {
    if (saving) return null
    try {
      setSaving(true)
      if (!totals?.bilanciata) {
        alert('Scrittura non bilanciata')
        return null
      }
      if (!header?.data_registrazione) {
        alert('Data registrazione mancante')
        return null
      }
      if (!rows.some(hasImporto)) {
        alert('Inserisci almeno una riga con importo')
        return null
      }
      if (isFattura) {
        if (ivaRows.length > 0) {
          const missing = ivaRows.filter(r => !String(r.causale_iva_id || '').trim())
          if (missing.length) {
            missing.forEach(row => traceStep('IVA_ROW_MISSING_CAUSALE', { row }, {}))
            alert('Una o più righe IVA non hanno causale assegnata')
            return null
          }
          const invalidRows = ivaRows.filter(r => !Number.isFinite(r.imponibile) || !Number.isFinite(r.iva))
          if (invalidRows.length) {
            invalidRows.forEach(row => traceStep('IVA_ROW_INVALID', { row }, {}))
            alert('Una o piÃ¹ righe IVA hanno importi non validi')
            return null
          }
        } else if (!String(ivaUi.causale_iva_id || '').trim()) {
          traceStep('IVA_ROW_MISSING_CAUSALE', { row: null, legacy_ivaUi: true }, {})
          alert('Una o più righe IVA non hanno causale assegnata')
          return null
        }
      }
      if (!societaId) throw new Error('societaId mancante')

      const {
        pnPayload,
        righePayload,
        partEntries,
      } = buildPrimaNotaPayloadFromState({
        societaId,
        header,
        rows,
        progressivo,
        partitarioClosedMap,
        defaultDataRegistrazione: todayStr(),
        filterRiga: hasImporto,
        mapRiga: normalizeRigaForPrimaNotaPayload,
        mapPartitarioEntry: normalizePartitarioEntry,
        filterPartitarioEntry: (x) => toMoneyNumber(x.importo_chiuso) > 0,
      })

      traceIva('PRE_INSERT_PRIMA_NOTA_HEADER', 'DB', primaryIvaCausaleForTrace || null)
      traceStep('INSERT_PAYLOAD', pnPayload, { table: 'prima_nota', ...insertCausaleIvaMeta(pnPayload) })
      traceDiff(
        'DB_MAPPING_DIFF',
        { causale_iva_id: primaryIvaCausaleForTrace || null },
        { causale_iva_id: pnPayload.causale_iva_id ?? null }
      )
      if (righePayload.length > 0) {
        traceIva('PRE_INSERT_PRIMA_NOTA_RIGHE', 'DB', righePayload[0]?.causale_iva_id ?? primaryIvaCausaleForTrace ?? null)
        traceStep('INSERT_PAYLOAD', righePayload, { table: 'prima_nota_righe', ...insertCausaleIvaMeta(righePayload) })
        traceDiff(
          'DB_MAPPING_DIFF',
          { causale_iva_id: primaryIvaCausaleForTrace || null },
          { causale_iva_id: righePayload[0]?.causale_iva_id ?? null }
        )
      }

      if (partEntries.length > 0) {
        traceStep('INSERT_PAYLOAD', partEntries, { table: 'prima_nota_partitario', ...insertCausaleIvaMeta(partEntries) })
      }

      const complete = await createPrimaNotaCompleta({
        pnPayload,
        righePayload,
        partEntries,
        headerSelect: 'id',
        righeSelect: '*',
        partitarioSelect: '*',
      })

      traceStep('INSERT_RESULT', { table: 'prima_nota', data: complete.pn, error: complete.error })
      traceStep('INSERT_RESULT', { table: 'prima_nota_righe', data: complete.righeIns?.data, error: complete.righeIns?.error ?? complete.error })
      traceStep('INSERT_RESULT', { table: 'prima_nota_partitario', data: complete.partIns?.data, error: complete.partIns?.error ?? null })
      if (complete.error) throw complete.error
      if (complete.partIns?.error) console.error('[PrimaNotaGuidata] partitario insert error', complete.partIns.error)

      return { primaNotaId: complete.data?.primaNotaId }
    } catch (e) {
      console.error('[PrimaNotaGuidata] handleSave error', e)
      return null
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: '1rem', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>📝 Prima Nota (Guidata)</div>
          <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>
            {stato === 'confermata'
              ? <>Confermata {progressivo ? <>· Progressivo <strong style={{ color: 'var(--gld2)' }}>{progressivo}</strong></> : null}</>
              : 'Bozza · Modifica rapida'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div style={{ display: 'flex', gap: '.35rem', alignItems: 'center' }}>
            <button className="btn-sec" onClick={() => onPrev && onPrev()} disabled={!onPrev || !canPrev} style={{ fontSize: '.72rem', padding: '.35rem .6rem' }}>
              ← Fattura precedente
            </button>
            <button className="btn-sec" onClick={() => onNext && onNext()} disabled={!onNext || !canNext} style={{ fontSize: '.72rem', padding: '.35rem .6rem' }}>
              Fattura successiva →
            </button>
          </div>
          <span className={'bdg ' + (totals.bilanciata ? 'bdg-green' : 'bdg-red')} style={{ fontSize: '.65rem' }}>
            {totals.bilanciata ? 'Bilanciata' : `Sbilanciata (${totals.diff > 0 ? '+' : ''}${totals.diff.toFixed(2)})`}
          </span>
          {stato !== 'confermata' ? (
            <button className="btn" onClick={onConfirm} disabled={!totals.bilanciata}>
              ✓ Conferma
            </button>
          ) : (
            <button className="btn-sec" onClick={onBackToDraft}>
              ↩ Torna in bozza
            </button>
          )}
        </div>
      </div>

      {/* HEADER */}
      <div className="card" style={{ marginTop: '.9rem' }}>
        <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4, minmax(160px, 1fr))' }}>
          <div className="fg">
            <label>Data registrazione</label>
            <input
              type="date"
              value={header.data_registrazione}
              onChange={e => {
                const value = e.target.value
                traceStep('UI_INPUT_CHANGE', { value, payload: { field: 'data_registrazione', scope: 'header' } })
                runSetHeader(p => ({ ...p, data_registrazione: value }))
              }}
              disabled={stato === 'confermata'}
            />
          </div>

          <SearchSelect
            label="Causale"
            value={header.causale_id}
            onChange={(id) => runSetHeader(p => ({ ...p, causale_id: id }))}
            options={causali.map(c => ({ ...c, id: c.id }))}
            formatOption={(c) => `${c.codice || '—'} · ${c.descrizione || c.label || ''}`.trim()}
            placeholder="Cerca causale…"
          />

          <SearchSelect
            label="Cliente / Fornitore"
            value={header.cliente_fornitore_id}
            onChange={(id) => runSetHeader(p => ({ ...p, cliente_fornitore_id: id }))}
            options={clientiFornitori.map(c => ({ ...c, id: c.id }))}
            formatOption={(c) => {
              const nome = c.ragione_sociale || `${c.nome || ''} ${c.cognome || ''}`.trim()
              const cod = c.codice_cliente ? `[${c.codice_cliente}] ` : ''
              return `${cod}${nome}`.trim()
            }}
            placeholder="Cerca cliente/fornitore…"
          />

          <div className="fg">
            <label>Totale</label>
            <input value={totaleDerivato.toFixed(2)} readOnly />
            <div style={{ fontSize: '.7rem', color: 'var(--mu)', marginTop: '.25rem' }}>
              Derivato dalle righe (Dare/Avere)
            </div>
          </div>
        </div>
      </div>

      {(ivaInsightsLoading || ivaInsightsLimited.length > 0) && (
        <div className="card" style={{ marginTop: '.75rem' }}>
          {ivaInsightsLoading && ivaInsightsLimited.length === 0 && (
            <div className="alert alert-info" style={{ margin: 0 }}>
              Analisi IVA in corso…
            </div>
          )}
          {ivaInsightsLimited.map((ins) => {
            const sev = String(ins.gravita || '').toLowerCase()
            const tipo = String(ins.tipo || '').toLowerCase()
            const isWarn = tipo === 'iva_anomaly'
              ? (sev === 'critical' || sev === 'warning' || sev === 'high' || sev === 'medium')
              : false
            return (
              <div key={ins.fingerprint || ins.titolo} className={`alert ${isWarn ? 'alert-warn' : 'alert-info'}`} style={{ marginBottom: '.35rem' }}>
                <strong>{ins.titolo || 'Segnale IVA'}</strong>
                <div style={{ fontSize: '.72rem', marginTop: '.2rem' }}>{ins.descrizione}</div>
              </div>
            )
          })}
          {ivaInsightsExtraCount > 0 && (
            <div className="alert alert-info" style={{ marginBottom: '.35rem' }}>
              Altri {ivaInsightsExtraCount} segnali IVA disponibili.
            </div>
          )}
        </div>
      )}

      {/* TABS DINAMICHE */}
      <div className="card" style={{ marginTop: '.75rem' }}>
        <Tabs
          tabs={tabs}
          activeId={activeTab}
          onChange={(id) => {
            traceStep('UI_INPUT_CHANGE', { value: id, payload: { field: 'activeTab', control: 'Tabs' } })
            runSetActiveTab(id)
          }}
        />
      </div>

      {/* TAB: SCRITTURA */}
      {activeTab === 'scrittura' && (
        <div className="card" style={{ marginTop: '.75rem', padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '.75rem 1rem', borderBottom: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
            <div style={{ fontSize: '.8rem', fontWeight: 700 }}>Righe Prima Nota</div>
            <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
              <button className="btn-sec" onClick={addRow} disabled={stato === 'confermata'}>+ Riga</button>
              <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>
                Totale Dare <strong style={{ color: 'var(--gr)' }}>{totals.totDare.toFixed(2)}</strong> · Totale Avere <strong style={{ color: 'var(--rd)' }}>{totals.totAvere.toFixed(2)}</strong>
              </div>
            </div>
          </div>

          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: '34%' }}>Conto</th>
                <th>Descrizione</th>
                <th style={{ width: 140, textAlign: 'right' }}>Dare</th>
                <th style={{ width: 140, textAlign: 'right' }}>Avere</th>
                <th style={{ width: 56 }} />
              </tr>
            </thead>
            <tbody>
              {(() => {
                traceStep('UI_RENDER_RIGHE', {
                  righe: rows.map((row, i) => ({
                    i,
                    id: row.id,
                    causale_iva_id: row.causale_iva_id ?? null,
                    conto_id: row.conto_id
                  })),
                  ivaUi_causale_iva_id: primaryIvaCausaleForTrace,
                  ivaRows_count: ivaRows.length
                })
                return null
              })()}
              {rows.map((r, rowIndex) => (
                <PrimaNotaGuidataRigaRow
                  key={r.id}
                  r={r}
                  rowIndex={rowIndex}
                  stato={stato}
                  pianoConti={pianoConti}
                  totalsBilanciata={totals.bilanciata}
                  updateRow={updateRow}
                  deleteRow={deleteRow}
                  onFocusRow={onFocusRow}
                  rowsLength={rows.length}
                  ivaUiCausaleIvaId={primaryIvaCausaleForTrace}
                />
              ))}
            </tbody>
          </table>

          {!totals.bilanciata && (
            <div style={{ padding: '.7rem 1rem', borderTop: '1px solid var(--bd)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
              <div style={{ fontSize: '.78rem', color: 'var(--rd)', fontWeight: 700 }}>
                Scrittura sbilanciata: correggi Dare/Avere per confermare.
              </div>
              <div style={{ fontSize: '.72rem', color: 'var(--mu)' }}>
                Ultima riga toccata: <strong>{lastFocusedRowId.current ? '✓' : '—'}</strong>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: MOVIMENTI IVA — una riga per aliquota (ivaRows) */}
      {activeTab === 'iva' && (
        <div className="card" style={{ marginTop: '.75rem' }}>
          <div style={{ fontWeight: 800, marginBottom: '.35rem' }}>Movimenti IVA</div>
          <div style={{ fontSize: '.78rem', color: 'var(--mu)', marginBottom: '.75rem' }}>
            Una riga per ogni aliquota presente nel documento. La verità IVA è in queste righe; la scrittura si aggiorna di conseguenza.
          </div>
          {regimeSummary.unknown && (
            <div className="alert alert-warn" style={{ marginBottom: '.6rem' }}>
              Regime IVA non determinato su una o più righe. Verifica causale e natura FE.
            </div>
          )}
          {regimeSummary.mixed && (
            <div className="alert alert-info" style={{ marginBottom: '.6rem' }}>
              Regime IVA misto: {regimeSummary.list.map(r => formatIvaRegimeLabel(r)).join(', ')}
            </div>
          )}

          {ivaRows.length === 0 ? (
            <div style={{ fontSize: '.85rem', color: 'var(--mu)' }}>
              Nessuna riga IVA. Usa la tab Scrittura o importa un documento con dati IVA.
            </div>
          ) : (
            <>
              <div style={{ display: 'grid', gap: '.5rem' }}>
                {ivaRowsDisplay.map((row, idx) => {
                  const hue = (row.aliquota * 17) % 360
                  const bg = idx % 2 === 0 ? `hsla(${hue}, 32%, 93%, 0.55)` : 'transparent'
                  return (
                    <div
                      key={row.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(72px, 88px) minmax(100px, 1fr) minmax(100px, 1fr) minmax(180px, 2fr)',
                        gap: '.5rem',
                        alignItems: 'start',
                        padding: '.55rem .65rem',
                        borderRadius: 6,
                        border: '1px solid var(--bd)',
                        background: bg
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '.65rem', color: 'var(--mu)' }}>Aliquota</div>
                        <div style={{ fontWeight: 800 }}>{row.aliquota}%</div>
                        <div style={{ fontSize: '.62rem', color: 'var(--mu)', marginTop: '.2rem' }}>
                          {formatIvaRegimeLabel(row.regime_iva)}
                        </div>
                        {row.autoResolved && (
                          <span className="bdg bdg-green" style={{ fontSize: '.58rem', marginTop: '.25rem', display: 'inline-block' }}>AUTO</span>
                        )}
                      </div>
                      <div className="fg">
                        <label>Imponibile</label>
                        <input
                          type="number"
                          step="0.01"
                          value={moneyInputValue(row.imponibile)}
                          disabled={stato === 'confermata'}
                          onChange={e => {
                            const imponibile = toMoneyNumber(e.target.value)
                            const al = row.aliquota
                            const ivaCalc = Math.round((imponibile * al / 100) * 100) / 100
                            traceStep('UI_INPUT_CHANGE', { value: e.target.value, payload: { field: 'ivaRow_imponibile', rowId: row.id, aliquota: row.aliquota } })
                            runSetIvaRows(prev => prev.map(r => (r.id === row.id ? { ...r, imponibile, iva: ivaCalc } : r)))
                          }}
                        />
                      </div>
                      <div className="fg">
                        <label>IVA</label>
                        <input
                          type="number"
                          step="0.01"
                          value={moneyInputValue(row.iva)}
                          disabled={stato === 'confermata'}
                          onChange={e => {
                            const iva = toMoneyNumber(e.target.value)
                            traceStep('UI_INPUT_CHANGE', { value: e.target.value, payload: { field: 'ivaRow_iva', rowId: row.id } })
                            runSetIvaRows(prev => prev.map(r => (r.id === row.id ? { ...r, iva } : r)))
                          }}
                        />
                      </div>
                      <div className="fg" style={{ minWidth: 0 }}>
                        <label>Causale IVA</label>
                        <CausaleIvaCombobox
                          value={row.causale_iva_id || ''}
                          onChange={(id) => {
                            const c = causaliIva.find(x => String(x.id) === String(id))
                            traceIva('UI_CAUSALE_IVA_SELECT', 'UI', id)
                            runSetIvaRows(prev => prev.map(r => (r.id === row.id ? {
                              ...r,
                              causale_iva_id: id || null,
                              codice_interno: c?.codice_interno ?? null,
                              autoResolved: false,
                              regime_iva: classifyIvaRegime({ causale: c, natura: r.natura, aliquota: r.aliquota })
                            } : r)))
                          }}
                          causaliIva={causaliIva}
                          rowAliquota={row.aliquota}
                          buildCausaleIvaLabel={buildCausaleIvaLabel}
                          parseAliquota={parseAliquota}
                          disabled={stato === 'confermata'}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{ marginTop: '.85rem', display: 'flex', gap: '1.5rem', flexWrap: 'wrap', fontSize: '.82rem' }}>
                <div>Tot. imponibile: <strong>{fmtMoney(ivaTotalsFromRows.totImponibile)}</strong></div>
                <div>Tot. IVA: <strong>{fmtMoney(ivaTotalsFromRows.totIva)}</strong></div>
                <div>Tot. documento (impon. + IVA): <strong>{fmtMoney(ivaTotalsFromRows.totDoc)}</strong></div>
                <div style={{ color: 'var(--mu)' }}>Scrittura (Dare): <strong>{totaleDerivato.toFixed(2)}</strong></div>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB: PARTITARIO (placeholder semplice) */}
      {activeTab === 'partitario' && (
        <Partitario
          clienteFornitoreId={header.cliente_fornitore_id}
          clientiFornitori={clientiFornitori}
          closedMap={partitarioClosedMap}
          setClosedMap={runSetPartitarioClosedMap}
        />
      )}
    </div>
  )
}
