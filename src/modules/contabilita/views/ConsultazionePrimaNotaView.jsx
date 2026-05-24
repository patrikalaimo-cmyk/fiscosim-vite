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
import { fetchConsultazioneExportRows } from '../application/consultazioneOperations/fetchConsultazioneExportRows.js'
import { ConsultazioneFiltersPanel } from '../components/consultazione/ConsultazioneFiltersPanel.jsx'
import { ConsultazioneSaldoSummary } from '../components/consultazione/ConsultazioneSaldoSummary.jsx'
import { ConsultazioneResultsTable } from '../components/consultazione/ConsultazioneResultsTable.jsx'

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

export function ConsultazionePrimaNotaView({ societaAttiva, pianoConti, causaliContabili, causaliIva }) {
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
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [stubNotice, setStubNotice] = useState('')
  const [refreshToken, setRefreshToken] = useState(0)
  const [gotoTarget, setGotoTarget] = useState('')
  const [showDemoRows, setShowDemoRows] = useState(() => Boolean(import.meta.env.DEV))

  const normalizedFilters = useMemo(() => normalizeConsultazioneFilters(filters), [filters])
  const queryParams = useMemo(() => buildConsultazioneQueryParams(normalizedFilters, { page, pageSize }), [normalizedFilters, page, pageSize])
  const querySignature = useMemo(() => `${JSON.stringify(queryParams.server)}|${refreshToken}`, [queryParams.server, refreshToken])
  const demoRows = useMemo(() => buildConsultazioneDemoRows(), [])

  useEffect(() => {
    if (!societaAttiva?.id) return
    let alive = true
    setLoading(true)
    setError('')
    contabilitaRepo
      .getPrimaNotaConsultazioneRowsAdvanced(societaAttiva.id, queryParams.server)
      .then(({ data, error: qErr, totalRows: nextTotalRows }) => {
        if (!alive) return
        if (qErr) throw qErr
        setTotalRows(Number(nextTotalRows || 0))
        setRawRows(Array.isArray(data) ? data : [])
      })
      .catch((e) => {
        if (!alive) return
        setError(e?.message || String(e))
        setTotalRows(0)
        setRawRows([])
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [societaAttiva?.id, querySignature, queryParams.server])

  const rowViewModels = useMemo(
    () => rawRows.map((row, index) => buildConsultazioneRowViewModel(row, index)),
    [rawRows]
  )

  const filteredRows = useMemo(
    () => filterConsultazioneRows(rowViewModels, queryParams.client),
    [rowViewModels, queryParams.client]
  )

  const orderedRows = useMemo(
    () => calculateConsultazioneSaldoProgressivo(filteredRows),
    [filteredRows]
  )

  const summary = useMemo(
    () => buildConsultazioneSummary(orderedRows),
    [orderedRows]
  )

  const totalPages = useMemo(() => {
    if (!totalRows) return 1
    return Math.max(1, Math.ceil(totalRows / Math.max(1, pageSize)))
  }, [totalRows, pageSize])

  const rangeLabel = useMemo(() => {
    if (!totalRows) return 'Nessun risultato filtrato'
    const start = (page - 1) * pageSize + 1
    const end = Math.min(page * pageSize, totalRows)
    return `Risultati ${start}-${end} di ${totalRows}`
  }, [page, pageSize, totalRows])

  useEffect(() => {
    if (!totalRows) return
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages, totalRows])

  const handleFilterChange = (field, value) => {
    setPage(1)
    setFilters((prev) => ({ ...prev, [field]: value }))
  }

  const handleReset = () => {
    setPage(1)
    setPageSize(DEFAULT_PAGE_SIZE)
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

  const handleExportCsv = async () => {
    if (showDemoRows) {
      const { csv, filename } = exportConsultazioneResults(demoRows, {
        mode: compactMode,
        meta: {
          societa: societaAttiva?.denominazione || 'Demo',
          esercizio: normalizedFilters.esercizio || '',
        },
      })
      downloadCsv(filename, csv)
      return
    }
    if (!societaAttiva?.id || exporting) return
    setExporting(true)
    try {
      const exportRows = await fetchConsultazioneExportRows({
        societaId: societaAttiva.id,
        serverFilters: queryParams.server,
        clientFilters: queryParams.client,
      })
      if (!exportRows.length) return
      const { csv, filename } = exportConsultazioneResults(exportRows, {
        mode: compactMode,
        meta: {
          societa: societaAttiva?.denominazione || '',
          esercizio: normalizedFilters.esercizio || '',
        },
      })
      downloadCsv(filename, csv)
    } catch (e) {
      setError(e?.message || String(e))
    } finally {
      setExporting(false)
    }
  }

  const handlePageChange = (nextPage) => {
    const safePage = Math.min(Math.max(1, Number(nextPage) || 1), totalPages)
    setPage(safePage)
  }

  const handleSearch = () => {
    setPage(1)
    setRefreshToken((v) => v + 1)
  }

  const handlePageSizeChange = (value) => {
    const nextSize = Math.max(1, Number(value) || DEFAULT_PAGE_SIZE)
    setPageSize(nextSize)
    setPage(1)
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

  const pagination = {
    page,
    pageSize,
    totalRows,
    totalPages,
    rangeLabel,
    canPrevious: page > 1,
    canNext: page < totalPages,
    onPageChange: handlePageChange,
    onPageSizeChange: handlePageSizeChange,
  }

  const visualRows = showDemoRows ? demoRows : orderedRows
  const visualTotalRows = showDemoRows ? demoRows.length : totalRows
  const visualSummary = useMemo(
    () => buildConsultazioneSummary(visualRows, { totalRows: visualTotalRows }),
    [visualRows, visualTotalRows]
  )
  const visualPagination = useMemo(() => {
    if (!showDemoRows) return pagination
    return {
      page: 1,
      pageSize,
      totalRows: demoRows.length,
      totalPages: 1,
      rangeLabel: `Demo locale | 1-${demoRows.length} di ${demoRows.length}`,
      canPrevious: false,
      canNext: false,
      onPageChange: () => {},
      onPageSizeChange: handlePageSizeChange,
    }
  }, [showDemoRows, pageSize, demoRows.length, pagination])

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
      <div className="alert alert-info" style={{ marginBottom: '.9rem' }}>
        Consultazione Prima Nota è read-only: export, ricerca, filtri e dettaglio restano operativi; modifica/storno devono passare dal flusso canonico di registrazione/commit atomico.
      </div>
      {error ? <div className="alert alert-warn" style={{ marginBottom: '.9rem' }}>{error}</div> : null}

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
        />
      </div>

      <div id="consultazione-sintesi">
        <ConsultazioneSaldoSummary
          summary={visualSummary}
          compact={compactMode === CONSULTAZIONE_TABLE_MODE.COMPACT}
          note={`Saldo progressivo calcolato sulla pagina corrente | ${showDemoRows ? 'Demo locale' : rangeLabel}`}
        />
      </div>

      <div id="consultazione-risultati">
        <ConsultazioneResultsTable
          rows={visualRows}
          compact={compactMode === CONSULTAZIONE_TABLE_MODE.COMPACT}
          loading={loading}
          pagination={visualPagination}
          onPageSizeChange={handlePageSizeChange}
          note={`Saldo progressivo calcolato sulla pagina corrente | ${showDemoRows ? 'Demo locale' : rangeLabel}`}
          compactMode={compactMode}
          onToggleCompact={(nextMode) => {
            if (nextMode === 'compact' || nextMode === 'full') {
              setCompactMode(nextMode === 'compact' ? CONSULTAZIONE_TABLE_MODE.COMPACT : CONSULTAZIONE_TABLE_MODE.FULL)
              return
            }
            setCompactMode((v) => (v === CONSULTAZIONE_TABLE_MODE.COMPACT ? CONSULTAZIONE_TABLE_MODE.FULL : CONSULTAZIONE_TABLE_MODE.COMPACT))
          }}
          onDetail={() => handleStub('Dettaglio')}
          onEdit={() => handleStub('Modifica')}
          onReverse={() => handleStub('Storno')}
          onOpenPartitario={() => handleStub('Apri partitario')}
          readOnlyMessage={readOnlyMessage}
        />
      </div>
    </div>
  )
}
