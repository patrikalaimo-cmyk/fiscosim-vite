import { useEffect, useMemo, useState } from 'react'
import { ModuleHeader } from '../../../shared/components'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { CONSULTAZIONE_FILTER_DEFAULTS, CONSULTAZIONE_TABLE_MODE } from '../domain/consultazione/consultazioneDefaults.js'
import { normalizeConsultazioneFilters } from '../application/consultazioneOperations/normalizeConsultazioneFilters.js'
import { buildConsultazioneQueryParams } from '../application/consultazioneOperations/buildConsultazioneQueryParams.js'
import { buildConsultazioneRowViewModel } from '../application/consultazioneOperations/buildConsultazioneRowViewModel.js'
import { buildConsultazioneDemoRows } from '../application/consultazioneOperations/buildConsultazioneDemoRows.js'
import { filterConsultazioneRows } from '../application/consultazioneOperations/filterConsultazioneRows.js'
import { calculateConsultazioneSaldoProgressivo } from '../application/consultazioneOperations/calculateConsultazioneSaldoProgressivo.js'
import { buildConsultazioneSummary } from '../application/consultazioneOperations/buildConsultazioneSummary.js'
import { exportConsultazioneResults } from '../application/consultazioneOperations/exportConsultazioneResults.js'
import { ConsultazioneFiltersPanel } from '../components/consultazione/ConsultazioneFiltersPanel.jsx'
import { ConsultazioneSaldoSummary } from '../components/consultazione/ConsultazioneSaldoSummary.jsx'
import { ConsultazioneResultsTable } from '../components/consultazione/ConsultazioneResultsTable.jsx'
import { ConsultazioneDetailSidebar } from '../components/consultazione/ConsultazioneDetailSidebar.jsx'

function currentYearOptions(currentYear) {
  return [0, 1, 2, 3].map((offset) => String(currentYear - offset))
}

function downloadCsv(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const DEFAULT_PAGE_SIZE = 25

export function ConsultazionePrimaNotaView({ societaAttiva, pianoConti, causaliContabili, causaliIva, onEditScrittura, utente }) {
  const readOnlyMessage = 'Modifica/storno non disponibili da Consultazione. Usa il flusso canonico di registrazione/commit atomico.'
  const detailReadOnlyMessage = 'Dettaglio consultazione disponibile in sola lettura. Nessun write diretto.'
  const currentYear = new Date().getFullYear()
  const [filters, setFilters] = useState({
    ...CONSULTAZIONE_FILTER_DEFAULTS,
    esercizio: String(currentYear),
    dataRegistrazioneDa: `${currentYear}-01-01`,
    dataRegistrazioneA: new Date().toISOString().slice(0, 10),
  })
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [compactMode, setCompactMode] = useState(CONSULTAZIONE_TABLE_MODE.COMPACT)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')
  const [rawRows, setRawRows] = useState([])
  const [totalRows, setTotalRows] = useState(0)
  const [limitWarning, setLimitWarning] = useState(false)
  const [stubNotice, setStubNotice] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [gotoTarget, setGotoTarget] = useState('')
  const [showDemoRows, setShowDemoRows] = useState(() => Boolean(import.meta.env.DEV))

  const normalizedFilters = useMemo(() => normalizeConsultazioneFilters(filters), [filters])
  const queryParams = useMemo(() => buildConsultazioneQueryParams(normalizedFilters), [normalizedFilters])
  const querySignature = useMemo(() => `${JSON.stringify(queryParams.server)}|${refreshToken}`, [queryParams.server, refreshToken])
  const demoRows = useMemo(() => buildConsultazioneDemoRows(), [])

  useEffect(() => {
    if (!societaAttiva?.id) return
    let alive = true
    setLoading(true)
    setError('')
    setLimitWarning(false)

    async function loadAllChunks() {
      let accumulated = []
      let p = 1
      const CHUNK_SIZE = 1000
      const MAX_ROWS = 10000

      try {
        while (true) {
          if (!alive) break
          
          const params = {
            ...queryParams.server,
            page: p,
            pageSize: CHUNK_SIZE,
          }
          
          const { data, error: qErr, totalRows: nextTotalRows } = await contabilitaRepo.getPrimaNotaConsultazioneRowsAdvanced(
            societaAttiva.id,
            params
          )
          
          if (!alive) break
          if (qErr) throw qErr

          const fetchedRows = Array.isArray(data) ? data : []
          
          if (p === 1) {
            const total = Number(nextTotalRows || 0)
            setTotalRows(total)
            if (total > MAX_ROWS) {
              setLimitWarning(true)
            }
          }

          if (fetchedRows.length === 0) {
            break
          }

          accumulated = [...accumulated, ...fetchedRows]

          if (accumulated.length >= MAX_ROWS) {
            accumulated = accumulated.slice(0, MAX_ROWS)
            break
          }

          if (fetchedRows.length < CHUNK_SIZE) {
            break
          }

          if (p >= (MAX_ROWS / CHUNK_SIZE)) {
            break
          }

          p += 1
        }

        if (alive) {
          setRawRows(accumulated)
        }
      } catch (e) {
        if (alive) {
          setError(e?.message || String(e))
          setTotalRows(0)
          setRawRows([])
        }
      } finally {
        if (alive) {
          setLoading(false)
        }
      }
    }

    loadAllChunks()

    return () => {
      alive = false
    }
  }, [societaAttiva?.id, querySignature])

  const rowViewModels = useMemo(
    () => rawRows.map((row, index) => buildConsultazioneRowViewModel(row, index)),
    [rawRows]
  )

  const filteredRows = useMemo(
    () => filterConsultazioneRows(rowViewModels, queryParams.client),
    [rowViewModels, queryParams.client]
  )

  const [openingBalance, setOpeningBalance] = useState(0)

  const selectedContoObject = useMemo(() => {
    if (filters.contoId) {
      return pianoConti.find(c => String(c.id) === String(filters.contoId)) || null
    }
    const query = String(filters.conto || '').trim().toLowerCase()
    if (!query) return null
    return pianoConti.find(
      (c) =>
        String(c.id).toLowerCase() === query ||
        String(c.codice).toLowerCase() === query ||
        String(c.descrizione || '').toLowerCase() === query
    )
  }, [pianoConti, filters.contoId, filters.conto])

  useEffect(() => {
    if (!societaAttiva?.id || !selectedContoObject?.id || !filters.dataRegistrazioneDa) {
      setOpeningBalance(0)
      return
    }
    let alive = true
    contabilitaRepo
      .getContoSaldoPrecedente(
        societaAttiva.id,
        selectedContoObject.id,
        filters.dataRegistrazioneDa,
        {
          tipoScrittureOrdinarie: filters.tipoScrittureOrdinarie,
          tipoScrittureStornate: filters.tipoScrittureStornate,
          tipoScrittureSimulate: filters.tipoScrittureSimulate,
        }
      )
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          console.warn('[Consultazione] Error loading opening balance:', error)
          setOpeningBalance(0)
        } else {
          setOpeningBalance(Number(data || 0))
        }
      })
      .catch(() => {
        if (alive) setOpeningBalance(0)
      })
    return () => {
      alive = false
    }
  }, [
    societaAttiva?.id,
    selectedContoObject?.id,
    filters.dataRegistrazioneDa,
    filters.tipoScrittureOrdinarie,
    filters.tipoScrittureStornate,
    filters.tipoScrittureSimulate,
  ])

  const orderedRows = useMemo(() => {
    if (!selectedContoObject) {
      return filteredRows.map(r => ({ ...r, saldoProgressivo: undefined }))
    }
    return calculateConsultazioneSaldoProgressivo(filteredRows, { openingBalance })
  }, [filteredRows, openingBalance, selectedContoObject])

  const summary = useMemo(
    () => buildConsultazioneSummary(orderedRows),
    [orderedRows]
  )

  const rangeLabel = useMemo(() => {
    if (!totalRows) return 'Nessun risultato filtrato'
    if (totalRows > 10000) {
      return `Caricate 10.000 righe su ${totalRows} totali filtrate (invito a raffinare i filtri)`
    }
    return `Mostrate tutte le ${totalRows} righe filtrate`
  }, [totalRows])

  const handleFilterChange = (field, value) => {
    setFilters((prev) => {
      const next = { ...prev, [field]: value }
      if (!next.tipoScrittureOrdinarie && !next.tipoScrittureStornate && !next.tipoScrittureSimulate) {
        next.tipoScrittureOrdinarie = true
      }
      return next
    })
  }

  const handleReset = () => {
    setRefreshToken((v) => v + 1)
    setShowDemoRows(false)
    setFilters({
      ...CONSULTAZIONE_FILTER_DEFAULTS,
      esercizio: String(currentYear),
      dataRegistrazioneDa: `${currentYear}-01-01`,
      dataRegistrazioneA: new Date().toISOString().slice(0, 10),
    })
    setAdvancedOpen(false)
  }

  const handleExportCsv = () => {
    if (!visualRows.length) return
    const { csv, filename } = exportConsultazioneResults(visualRows, {
      mode: compactMode,
      meta: {
        societa: societaAttiva?.denominazione || 'Demo',
        esercizio: normalizedFilters.esercizio || '',
      },
    })
    downloadCsv(filename, csv)
  }

  const handleSearch = () => {
    setRefreshToken((v) => v + 1)
  }

  const handleStub = (label) => {
    if (label === 'Modifica' || label === 'Storno' || label === 'Apri partitario') {
      setStubNotice(readOnlyMessage)
      return
    }
    setStubNotice(detailReadOnlyMessage)
  }

  const handleGotoChange = (value) => {
    const next = String(value || '')
    setGotoTarget(next)
    const idMap = {
      filtri: 'consultazione-filtri',
      sintesi: 'consultazione-sintesi',
      risultati: 'consultazione-risultati',
    }
    const targetId = idMap[next]
    if (targetId) {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
    window.setTimeout(() => setGotoTarget(''), 100)
  }

  const [selectedRowId, setSelectedRowId] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)

  const [sortField, setSortField] = useState(null)
  const [sortDirection, setSortDirection] = useState(null)

  const handleSort = (field) => {
    if (sortField !== field) {
      setSortField(field)
      setSortDirection('asc')
    } else if (sortDirection === 'asc') {
      setSortDirection('desc')
    } else {
      setSortField(null)
      setSortDirection(null)
    }
  }

  const visualRows = useMemo(() => {
    const base = showDemoRows ? demoRows : orderedRows
    if (!sortField || !sortDirection) return base

    return [...base].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (sortField === 'dare' || sortField === 'avere' || sortField === 'saldoProgressivo') {
        const numA = Number(valA || 0)
        const numB = Number(valB || 0)
        return sortDirection === 'asc' ? numA - numB : numB - numA
      }

      if (sortField === 'numeroRegistrazione' || sortField === 'rigaNumero') {
        const sa = String(valA ?? '').trim()
        const sb = String(valB ?? '').trim()
        const numA = sa === '' ? NaN : Number(sa)
        const numB = sb === '' ? NaN : Number(sb)
        const aIsNum = !isNaN(numA) && Number.isFinite(numA)
        const bIsNum = !isNaN(numB) && Number.isFinite(numB)

        let res = 0
        if (aIsNum && bIsNum) {
          res = numA - numB
        } else if (aIsNum) {
          res = -1
        } else if (bIsNum) {
          res = 1
        } else {
          res = sa.localeCompare(sb, 'it')
        }
        return sortDirection === 'asc' ? res : -res
      }

      const strA = String(valA ?? '').toLowerCase()
      const strB = String(valB ?? '').toLowerCase()

      if (sortDirection === 'asc') {
        return strA.localeCompare(strB, 'it')
      } else {
        return strB.localeCompare(strA, 'it')
      }
    })
  }, [showDemoRows, demoRows, orderedRows, sortField, sortDirection])

  const visualTotalRows = showDemoRows ? demoRows.length : totalRows

  const visualSummary = useMemo(() => {
    const base = buildConsultazioneSummary(visualRows, { totalRows: visualTotalRows })
    const uniqueUnbalancedPnIds = new Set()
    for (const r of visualRows) {
      const isProvv = r.raw?.prima_nota?.stato === 'provvisoria' || r.raw?.prima_nota?.stato === 'da_verificare'
      const isNonQuad = r.statoQuadratura === 'non_quadrata'
      if (isProvv || isNonQuad) {
        uniqueUnbalancedPnIds.add(r.primaNotaId || r.raw?.prima_nota_id || r.raw?.prima_nota?.id)
      }
    }
    return {
      ...base,
      daVerificare: uniqueUnbalancedPnIds.size,
    }
  }, [visualRows, visualTotalRows])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      const rowsCount = visualRows.length
      if (!rowsCount) return

      if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) {
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        const nextIdx = selectedIndex === -1 ? 0 : Math.min(selectedIndex + 1, rowsCount - 1)
        setSelectedIndex(nextIdx)
        setSelectedRowId(visualRows[nextIdx]?.id || null)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        const prevIdx = selectedIndex === -1 ? 0 : Math.max(selectedIndex - 1, 0)
        setSelectedIndex(prevIdx)
        setSelectedRowId(visualRows[prevIdx]?.id || null)
      } else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        if (selectedIndex >= 0 && selectedIndex < rowsCount) {
          e.preventDefault()
          setSelectedRowId(visualRows[selectedIndex].id)
        }
      } else if (e.key === 'Escape' || e.key === 'ArrowLeft') {
        e.preventDefault()
        setSelectedRowId(null)
        setSelectedIndex(-1)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [visualRows, selectedIndex])

  if (!societaAttiva) return null

  return (
    <div
      className="erp-view"
      style={{
        background: 'linear-gradient(180deg, rgba(10,26,43,.96), rgba(8,20,34,.98))',
        minHeight: '100%',
        paddingBottom: '1rem',
      }}
    >
      <ModuleHeader
        sectionLabel="CONTABILITA"
        title="Consulta Prima Nota"
        context="Ricerca centrale su prima nota, schede conto e saldo progressivo"
        secondaryAction={
          <div style={{ display: 'flex', gap: '.45rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'flex-end' }}>
            {societaAttiva ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.6rem',
                  padding: '.55rem .8rem',
                  borderRadius: 14,
                  border: '1px solid var(--bd)',
                  background: 'rgba(255,255,255,.035)',
                  minWidth: 240,
                }}
              >
                <div style={{ fontSize: '.72rem', color: 'var(--mu)', letterSpacing: '.08em', textTransform: 'uppercase' }}>Società</div>
                <div style={{ fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {societaAttiva.denominazione || societaAttiva.ragioneSociale || societaAttiva.nome || 'Società attiva'}
                </div>
              </div>
            ) : null}
            <button className="btn-sec" onClick={handleExportCsv} disabled={!orderedRows.length || loading || exporting}>
              {exporting ? 'Esporta CSV...' : 'Esporta CSV'}
            </button>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.45rem',
                fontSize: '.78rem',
                color: 'var(--mu)',
                padding: '.45rem .7rem',
                borderRadius: 14,
                border: '1px solid var(--bd)',
                background: 'rgba(255,255,255,.03)',
              }}
            >
              Vai a
              <select value={gotoTarget} onChange={(e) => handleGotoChange(e.target.value)} style={{ minWidth: 130 }}>
                <option value="">Sezione...</option>
                <option value="filtri">Filtri</option>
                <option value="sintesi">Sintesi</option>
                <option value="risultati">Risultati</option>
              </select>
            </label>
            <button
              type="button"
              className={showDemoRows ? 'btn' : 'btn-sec'}
              onClick={() => setShowDemoRows((current) => !current)}
            >
              {showDemoRows ? 'Demo attiva' : 'Mostra demo'}
            </button>
          </div>
        }
      />

      {stubNotice ? <div className="alert alert-info" style={{ marginBottom: '.9rem' }}>{stubNotice}</div> : null}
      {error ? <div className="alert alert-warn" style={{ marginBottom: '.9rem' }}>{error}</div> : null}
      {limitWarning ? (
        <div className="alert alert-warn" style={{ marginBottom: '.9rem' }}>
          ⚠️ <strong>Limite tecnico superato:</strong> Il risultato filtrato ({totalRows} righe) supera il limite massimo di 10.000 righe.
          Vengono visualizzate solo le prime 10.000 righe. Ti invitiamo a raffinare i filtri per visualizzare il dataset completo.
        </div>
      ) : null}

      {/* CONTENITORE DOUBLE COLUMN SPLIT SCREEN */}
      <div style={{ display: 'flex', gap: '1rem', padding: '0 1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {/* COLONNA SINISTRA: Filtri, KPIs, Tabella */}
        <div style={{ flex: 1, minWidth: 600, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
          <div id="consultazione-filtri">
            <ConsultazioneFiltersPanel
              filters={normalizedFilters}
              onChange={handleFilterChange}
              onReset={handleReset}
              onSearch={handleSearch}
              advancedOpen={advancedOpen}
              onToggleAdvanced={() => setAdvancedOpen((v) => !v)}
              esercizi={currentYearOptions(currentYear)}
              causaliContabili={causaliContabili}
              causaliIva={causaliIva}
              pianoConti={pianoConti}
            />
          </div>

          <div id="consultazione-sintesi">
            <ConsultazioneSaldoSummary
              summary={visualSummary}
              compact={compactMode === CONSULTAZIONE_TABLE_MODE.COMPACT}
              note={`Saldo progressivo calcolato sull'intero dataset filtrato | ${showDemoRows ? 'Demo locale' : rangeLabel}`}
            />
          </div>

          <div id="consultazione-risultati">
            <ConsultazioneResultsTable
              rows={visualRows}
              selectedRowId={selectedRowId}
              onRowClick={(row, index) => {
                setSelectedIndex(index)
                setSelectedRowId(row.id)
              }}
              onRowDoubleClick={(row, index) => {
                setSelectedIndex(index)
                setSelectedRowId(row.id)
              }}
              compact={compactMode === CONSULTAZIONE_TABLE_MODE.COMPACT}
              loading={loading}
              note={selectedContoObject
                ? `Saldo progressivo calcolato sull'intero dataset filtrato | ${showDemoRows ? 'Demo locale' : rangeLabel}`
                : `Seleziona un conto per visualizzare il saldo progressivo | ${showDemoRows ? 'Demo locale' : rangeLabel}`
              }
              compactMode={compactMode}
              onToggleCompact={(nextMode) => {
                if (nextMode === 'compact' || nextMode === 'full') {
                  setCompactMode(nextMode === 'compact' ? CONSULTAZIONE_TABLE_MODE.COMPACT : CONSULTAZIONE_TABLE_MODE.FULL)
                  return
                }
                setCompactMode((v) => (v === CONSULTAZIONE_TABLE_MODE.COMPACT ? CONSULTAZIONE_TABLE_MODE.FULL : CONSULTAZIONE_TABLE_MODE.COMPACT))
              }}
              readOnlyMessage={readOnlyMessage}
              isContoSelected={Boolean(selectedContoObject)}
              sortField={sortField}
              sortDirection={sortDirection}
              onSort={handleSort}
            />
          </div>

          <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginTop: '.2rem' }}>
            💡 <strong>Scorciatoie da tastiera:</strong> usa <kbd>↑</kbd> e <kbd>↓</kbd> per selezionare le righe, <kbd>Invio</kbd> o <kbd>→</kbd> per ispezionare, <kbd>Esc</kbd> o <kbd>←</kbd> per chiudere.
          </div>
        </div>

        {/* COLONNA DESTRA: Cassetto Dettaglio Sidebar */}
        {selectedRowId && (
          <ConsultazioneDetailSidebar
            primaNotaId={visualRows.find(r => r.id === selectedRowId)?.primaNotaId || selectedRowId}
            societaId={societaAttiva.id}
            onClose={() => {
              setSelectedRowId(null)
              setSelectedIndex(-1)
            }}
            onRefreshList={handleSearch}
            onEditScrittura={onEditScrittura}
            utente={utente}
          />
        )}
      </div>
    </div>
  )
}

