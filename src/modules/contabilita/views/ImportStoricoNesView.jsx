import { useMemo, useRef, useState } from 'react'
import { ModuleHeader } from '../../../shared/components'
import {
  inspectNesHistoricalImport,
  parseNesHistoricalImportFile,
  runNesHistoricalImport,
} from '../application/historicalImportNesService.js'

function fmtDate(v) {
  if (!v) return '—'
  const s = String(v)
  return s.slice(0, 10)
}

function fmtMoney(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n === 0) return '0,00'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Badge({ children, tone = 'gray' }) {
  return <span className={`bdg bdg-${tone}`}>{children}</span>
}

function StatusBadge({ children, tone = 'gray' }) {
  return (
    <span
      className={`bdg bdg-${tone}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '.35rem',
        padding: '.3rem .6rem',
        borderRadius: 999,
        fontWeight: 700,
      }}
    >
      {children}
    </span>
  )
}

function defaultKinds() {
  return { prima_nota: true, invoice: true, master_data: true }
}

function matchesKind(group, includeKinds) {
  return includeKinds?.[group.kind] !== false
}

function withinDateRange(group, from, to) {
  const d = String(group?.data_registrazione || '').slice(0, 10)
  if (!d) return true
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

const WORKFLOW_STEPS = [
  { id: 'source', label: 'Sorgente' },
  { id: 'period', label: 'Periodo' },
  { id: 'kinds', label: 'Tipi dati' },
  { id: 'preview', label: 'Anteprima' },
  { id: 'import', label: 'Importazione' },
  { id: 'report', label: 'Report' },
]

function Stepper({ currentStep = 'source' }) {
  const currentIndex = WORKFLOW_STEPS.findIndex((s) => s.id === currentStep)
  return (
    <div className="card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem' }}>
        {WORKFLOW_STEPS.map((step, index) => {
          const done = index < currentIndex || currentStep === 'report'
          const active = step.id === currentStep
          return (
            <div
              key={step.id}
              style={{
                flex: '1 1 118px',
                minWidth: 118,
                borderRadius: 14,
                padding: '.8rem .85rem',
                border: `1px solid ${active ? 'rgba(199,160,63,.65)' : done ? 'rgba(95,124,154,.45)' : 'rgba(95,124,154,.22)'}`,
                background: active ? 'linear-gradient(180deg, rgba(199,160,63,.16), rgba(199,160,63,.06))' : 'rgba(255,255,255,.02)',
                boxShadow: active ? '0 0 0 1px rgba(199,160,63,.08) inset' : 'none',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem' }}>
                <div style={{ fontSize: '.72rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--mu)' }}>
                  {step.label}
                </div>
                <div
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: '50%',
                    background: active ? 'var(--gold)' : done ? 'var(--gr)' : 'rgba(126,146,171,.45)',
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TypeCard({ title, description, active, onToggle }) {
  return (
    <button
      type="button"
      className="card"
      onClick={onToggle}
      style={{
        textAlign: 'left',
        padding: '1rem',
        border: `1px solid ${active ? 'rgba(199,160,63,.7)' : 'rgba(95,124,154,.22)'}`,
        background: active ? 'linear-gradient(180deg, rgba(199,160,63,.14), rgba(199,160,63,.05))' : 'rgba(255,255,255,.02)',
        cursor: 'pointer',
        minHeight: 120,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
        <div>
          <div style={{ fontWeight: 800, color: 'var(--text)', fontSize: '1rem' }}>{title}</div>
          <div style={{ marginTop: '.4rem', color: 'var(--mu)', fontSize: '.82rem', lineHeight: 1.45 }}>{description}</div>
        </div>
        <StatusBadge tone={active ? 'gold' : 'gray'}>{active ? 'Attivo' : 'Spento'}</StatusBadge>
      </div>
    </button>
  )
}

function MetricCard({ label, value, hint, tone = 'gray' }) {
  return (
    <div className="card" style={{ padding: '1rem', minHeight: 98, border: '1px solid rgba(95,124,154,.22)', background: 'rgba(255,255,255,.02)' }}>
      <div className="card-subtitle">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '.55rem', marginTop: '.35rem' }}>
        <div style={{ fontSize: '1.45rem', fontWeight: 850, color: tone === 'gold' ? 'var(--gold)' : 'var(--text)' }}>{value}</div>
      </div>
      {hint ? <div style={{ marginTop: '.35rem', color: 'var(--mu)', fontSize: '.78rem', lineHeight: 1.4 }}>{hint}</div> : null}
    </div>
  )
}

function WorkflowSection({ eyebrow, title, subtitle, children, accent = false }) {
  return (
    <div
      className="card"
      style={{
        marginTop: '1rem',
        padding: '1rem',
        border: accent ? '1px solid rgba(199,160,63,.35)' : '1px solid rgba(95,124,154,.22)',
        background: accent ? 'linear-gradient(180deg, rgba(199,160,63,.08), rgba(255,255,255,.02))' : 'rgba(255,255,255,.02)',
      }}
    >
      <div className="card-hdr" style={{ padding: 0, marginBottom: '.9rem' }}>
        <div>
          <div style={{ fontSize: '.72rem', letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--gold)', fontWeight: 800 }}>
            {eyebrow}
          </div>
          <div className="card-title" style={{ marginTop: '.2rem' }}>{title}</div>
          <div className="card-subtitle" style={{ marginTop: '.2rem' }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  )
}

function StepHint({ label, value, tone = 'gray' }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', padding: '.65rem .8rem', borderRadius: 12, border: '1px solid rgba(95,124,154,.2)', background: 'rgba(255,255,255,.02)' }}>
      <span style={{ color: 'var(--mu)', fontSize: '.8rem' }}>{label}</span>
      <StatusBadge tone={tone}>{value}</StatusBadge>
    </div>
  )
}

function FileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={{ width: 22, height: 22 }}>
      <path
        d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10A2.5 2.5 0 0 1 5 18V6A2.5 2.5 0 0 1 7 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V8h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="M9 13h6M9 16h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  )
}

export default function ImportStoricoNesView({
  societaAttiva,
  pianoConti,
  causaliContabili,
  causaliIva,
  onRefresh,
}) {
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [dateFrom, setDateFrom] = useState('2026-01-01')
  const [dateTo, setDateTo] = useState('2026-03-31')
  const [includeKinds, setIncludeKinds] = useState(defaultKinds())
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadingImport, setLoadingImport] = useState(false)
  const [parsed, setParsed] = useState(null)
  const [preview, setPreview] = useState(null)
  const [groups, setGroups] = useState([])
  const [importReport, setImportReport] = useState(null)
  const [error, setError] = useState('')
  const [fileNotice, setFileNotice] = useState('')
  const [fileWarning, setFileWarning] = useState('')
  const [dragActive, setDragActive] = useState(false)

  const enabledKindsLabel = useMemo(() => {
    const items = []
    if (includeKinds.prima_nota) items.push('Prima nota')
    if (includeKinds.invoice) items.push('Fatture')
    if (includeKinds.master_data) items.push('Master data')
    return items.join(', ')
  }, [includeKinds])

  const filteredGroups = useMemo(() => {
    return (groups || []).filter((g) => matchesKind(g, includeKinds) && withinDateRange(g, dateFrom, dateTo))
  }, [groups, includeKinds, dateFrom, dateTo])

  const duplicateCount = preview?.duplicates ?? 0
  const sourceReady = Boolean(file)
  const periodReady = Boolean(dateFrom && dateTo)
  const typesReady = Object.values(includeKinds).some(Boolean)
  const previewReady = Boolean(preview)
  const importReady = Boolean(previewReady && parsed?.records?.length && !loadingImport)
  const currentStep = importReport
    ? 'report'
    : previewReady
      ? 'preview'
      : sourceReady
        ? 'kinds'
        : 'source'

  const expectedImportable = Math.max(0, (preview?.total ?? filteredGroups.length) - duplicateCount)
  const expectedLinkedSubjects = preview?.subjects ?? 0
  const expectedLinkedAccounts = preview?.accounts ?? 0
  const expectedLearningPatterns = Math.max(
    expectedLinkedSubjects,
    expectedLinkedAccounts,
    preview?.prima_nota ?? 0,
    preview?.invoice ?? 0
  )
  const expectedWarnings = [
    preview?.duplicates ? `${preview.duplicates} duplicati da saltare` : 'Nessun duplicato rilevato',
    preview?.missingKeyFields ? `${preview.missingKeyFields} record con campi mancanti` : 'Nessun campo chiave mancante',
    preview?.usefulness ? `Utilità AI stimata ${preview.usefulness}%` : 'Utilità AI in verifica',
  ]

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setParsed(null)
    setPreview(null)
    setGroups([])
    setImportReport(null)
    setError('')
    setFileWarning('')
    setFileNotice('')
    if (f) {
      const ext = String(f.name || '').split('.').pop()?.toLowerCase() || ''
      const supported = ['xlsx', 'xls', 'pdf', 'csv'].includes(ext)
      if (!supported) {
        setFileWarning('Formato non riconosciuto. Sono supportati CSV, XLSX, XLS e PDF.')
      } else {
        setFileNotice(`${f.name} · ${ext.toUpperCase()} · pronto per l'analisi`)
      }
    }
  }

  const acceptFile = (selected) => {
    if (!selected) return
    const ext = String(selected.name || '').split('.').pop()?.toLowerCase() || ''
    const supported = ['xlsx', 'xls', 'pdf', 'csv'].includes(ext)
    setFile(selected)
    setParsed(null)
    setPreview(null)
    setGroups([])
    setImportReport(null)
    setError('')
    setFileWarning(supported ? '' : 'Formato non riconosciuto. Sono supportati CSV, XLSX, XLS e PDF.')
    setFileNotice(`${selected.name} · ${ext ? ext.toUpperCase() : 'FILE'} · pronto per l'analisi`)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleBrowseClick = () => {
    fileRef.current?.click()
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const dropped = e.dataTransfer?.files?.[0] || null
    if (dropped) acceptFile(dropped)
  }

  const fileSummary = useMemo(() => {
    if (!file) return null
    const sizeMb = file.size ? (file.size / (1024 * 1024)).toFixed(2) : null
    const ext = String(file.name || '').split('.').pop()?.toLowerCase() || ''
    return {
      name: file.name,
      sizeLabel: sizeMb ? `${sizeMb} MB` : null,
      ext: ext ? ext.toUpperCase() : 'FILE',
    }
  }, [file])

  const toggleKind = (kind) => {
    setIncludeKinds((prev) => ({ ...prev, [kind]: !prev[kind] }))
  }

  const loadPreview = async () => {
    if (!societaAttiva?.id) {
      setError('Seleziona prima una societa attiva.')
      return
    }
    if (!file) {
      setError('Carica un file NES da importare.')
      return
    }
    setError('')
    setLoadingPreview(true)
    setImportReport(null)
    try {
      const parsedResult = await parseNesHistoricalImportFile(file, { allowAiFallback: true })
      setParsed(parsedResult)
      const filteredRecords = (parsedResult.records || []).filter((r) => {
        if (!matchesKind(r, includeKinds)) return false
        if (!withinDateRange({ data_registrazione: r.data_registrazione }, dateFrom, dateTo)) return false
        return true
      })
      const inspected = await inspectNesHistoricalImport({
        societaId: societaAttiva.id,
        records: filteredRecords,
        includeKinds,
      })
      setGroups(inspected.groups || [])
      setPreview(inspected.preview || null)
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoadingPreview(false)
    }
  }

  const runImport = async () => {
    if (!societaAttiva?.id) {
      setError('Seleziona prima una societa attiva.')
      return
    }
    if (!parsed?.records?.length) {
      setError('Esegui prima il preview.')
      return
    }
    setError('')
    setLoadingImport(true)
    try {
      const filteredRecords = (parsed.records || []).filter((r) => {
        if (!matchesKind(r, includeKinds)) return false
        if (!withinDateRange({ data_registrazione: r.data_registrazione }, dateFrom, dateTo)) return false
        return true
      })
      const result = await runNesHistoricalImport({
        societaId: societaAttiva.id,
        pianoConti,
        causaliContabili,
        causaliIva,
        records: filteredRecords,
        dateFrom,
        dateTo,
        fileName: file?.name || 'NES_IMPORT',
      })
      setImportReport(result.report || null)
      onRefresh?.()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoadingImport(false)
    }
  }

  const summaryCards = [
    { label: 'Righe trovate', value: preview?.total ?? 0 },
    { label: 'Prima nota', value: preview?.prima_nota ?? 0 },
    { label: 'Fatture', value: preview?.invoice ?? 0 },
    { label: 'Soggetti', value: preview?.subjects ?? 0 },
    { label: 'Conti', value: preview?.accounts ?? 0 },
    { label: 'Duplicati', value: preview?.duplicates ?? 0 },
    { label: 'Campi mancanti', value: preview?.missingKeyFields ?? 0 },
    { label: 'Utilita AI', value: `${preview?.usefulness ?? 0}%` },
  ]

  if (!societaAttiva) return null

  return (
    <div className="erp-view">
      <ModuleHeader
        sectionLabel="Contabilita"
        title="Import storico da NES"
        context="Migrazione controllata con preview, controllo duplicati e apprendimento storico per AI"
      />

      {error ? <div className="alert alert-err">{error}</div> : null}

      <Stepper currentStep={currentStep} />

      <WorkflowSection
        eyebrow="1. Sorgente"
        title="Origine NES e range operativo"
        subtitle="Seleziona il file storico e il periodo da migrare. Il controllo mantiene separati i dati importati dal flusso nativo FiscoSim."
      >
        <div className="form-grid">
          <div className="fg full">
            <label>File NES</label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.pdf,.csv" onChange={onPickFile} style={{ position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0,0,0,0)', border: 0 }} />
            <div
              onClick={handleBrowseClick}
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
              onDrop={handleDrop}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleBrowseClick()
                }
              }}
              aria-label="Seleziona export NES"
              style={{
                display: 'grid',
                gridTemplateColumns: 'auto 1fr auto',
                gap: '1rem',
                alignItems: 'center',
                padding: '1rem',
                borderRadius: 18,
                border: `1px solid ${dragActive ? 'rgba(199,160,63,.65)' : 'rgba(95,124,154,.24)'}`,
                background: dragActive
                  ? 'linear-gradient(180deg, rgba(199,160,63,.12), rgba(255,255,255,.03))'
                  : 'linear-gradient(180deg, rgba(255,255,255,.03), rgba(255,255,255,.015))',
                boxShadow: dragActive ? '0 0 0 1px rgba(199,160,63,.12) inset' : 'none',
                cursor: 'pointer',
                transition: 'border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease',
              }}
            >
              <div
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 14,
                  display: 'grid',
                  placeItems: 'center',
                  background: 'rgba(199,160,63,.12)',
                  color: 'var(--gold)',
                  border: '1px solid rgba(199,160,63,.18)',
                  flexShrink: 0,
                }}
              >
                <FileIcon />
              </div>

              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 850, fontSize: '1rem', color: 'var(--text)' }}>Seleziona export NES</div>
                <div style={{ marginTop: '.2rem', color: 'var(--mu)', fontSize: '.82rem' }}>
                  Trascina qui il file NES oppure clicca per selezionarlo.
                </div>
                <div style={{ marginTop: '.6rem', display: 'flex', flexWrap: 'wrap', gap: '.45rem', alignItems: 'center' }}>
                  {fileSummary ? (
                    <>
                      <StatusBadge tone="green">{fileSummary.name}</StatusBadge>
                      {fileSummary.sizeLabel ? <StatusBadge tone="gray">{fileSummary.sizeLabel}</StatusBadge> : null}
                      <StatusBadge tone="blue">{fileSummary.ext}</StatusBadge>
                    </>
                  ) : (
                    <StatusBadge tone="gray">Nessun file selezionato</StatusBadge>
                  )}
                </div>
                {fileNotice ? (
                  <div style={{ marginTop: '.45rem', color: 'var(--gr)', fontSize: '.78rem', fontWeight: 700 }}>{fileNotice}</div>
                ) : null}
                {fileWarning ? (
                  <div style={{ marginTop: '.45rem', color: 'var(--rd)', fontSize: '.78rem', fontWeight: 700 }}>{fileWarning}</div>
                ) : null}
              </div>

              <button
                type="button"
                className="btn-sec"
                onClick={(e) => {
                  e.stopPropagation()
                  handleBrowseClick()
                }}
                style={{ whiteSpace: 'nowrap' }}
              >
                Sfoglia file
              </button>
            </div>
          </div>
          <div className="fg">
            <label>Data iniziale</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div className="fg">
            <label>Data finale</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '.75rem', marginTop: '1rem' }}>
          <StepHint label="Sorgente pronta" value={sourceReady ? 'Sì' : 'In attesa'} tone={sourceReady ? 'green' : 'gray'} />
          <StepHint label="Periodo pronto" value={periodReady ? `${fmtDate(dateFrom)} → ${fmtDate(dateTo)}` : 'Definisci un range'} tone={periodReady ? 'blue' : 'gray'} />
        </div>
      </WorkflowSection>

      <WorkflowSection
        eyebrow="2. Tipi dati"
        title="Cosa importare dal storico"
        subtitle="Ogni opzione mostra in modo esplicito quali record saranno considerati nel preview e nell'import."
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '.85rem' }}>
          <TypeCard
            title="Prima nota"
            description="Importa le scritture contabili storiche, con progressivi, causali, dare/avere e descrizioni operative."
            active={includeKinds.prima_nota}
            onToggle={() => toggleKind('prima_nota')}
          />
          <TypeCard
            title="Fatture"
            description="Importa fatture attive e passive già registrate, con soggetto, imponibile, IVA, totale e riferimenti documento."
            active={includeKinds.invoice}
            onToggle={() => toggleKind('invoice')}
          />
          <TypeCard
            title="Master data"
            description="Importa anagrafiche soggetti, controparti, conti utilizzati e causali ricorrenti per rafforzare la memoria AI."
            active={includeKinds.master_data}
            onToggle={() => toggleKind('master_data')}
          />
        </div>
        <div style={{ marginTop: '.9rem', display: 'flex', flexWrap: 'wrap', gap: '.5rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>Attivi: {enabledKindsLabel || 'nessuno'}</div>
          <StatusBadge tone={typesReady ? 'green' : 'gray'}>{typesReady ? 'Selezione completa' : 'Seleziona almeno un tipo dati'}</StatusBadge>
        </div>
      </WorkflowSection>

      <WorkflowSection
        eyebrow="3. Anteprima"
        title="Controllo prima della migrazione"
        subtitle="Qui l'operatore vede cosa verrà importato, cosa verrà saltato e quale memoria storica aiuterà i suggerimenti successivi."
        accent
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.65rem', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>
            Il preview prende solo il periodo e i tipi dati attivi, poi segnala duplicati, campi mancanti e impatto AI.
          </div>
          <div style={{ display: 'flex', gap: '.6rem', flexWrap: 'wrap' }}>
            <button className="btn" onClick={loadPreview} disabled={loadingPreview || loadingImport || !sourceReady || !typesReady || !periodReady}>
              {loadingPreview ? 'Genero...' : 'Genera anteprima'}
            </button>
            <button className="btn-sec" onClick={runImport} disabled={loadingImport || !previewReady || !importReady}>
              {loadingImport ? 'Importo...' : 'Importa storico'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.75rem' }}>
          <MetricCard label="Entrate contabili trovate" value={preview?.prima_nota ?? 0} hint="Scritture storiche pronte alla migrazione." />
          <MetricCard label="Fatture trovate" value={preview?.invoice ?? 0} hint="Documenti già registrati nel periodo." />
          <MetricCard label="Soggetti coinvolti" value={preview?.subjects ?? 0} hint="Clienti, fornitori, professionisti e controparti." />
          <MetricCard label="Conti coinvolti" value={preview?.accounts ?? 0} hint="Piano dei conti toccato dallo storico." />
          <MetricCard label="Duplicati rilevati" value={duplicateCount} tone={duplicateCount ? 'gold' : 'gray'} hint={duplicateCount ? 'Saranno saltati in modo sicuro.' : 'Nessuna collisione trovata.'} />
          <MetricCard label="Record da saltare" value={(preview?.duplicates ?? 0) + (preview?.missingKeyFields ?? 0)} hint="Duplicati e record con dati chiave mancanti." />
          <MetricCard label="Anomalie / campi mancanti" value={preview?.missingKeyFields ?? 0} hint="Mancanze che possono ridurre l'automazione." />
          <MetricCard label="Pattern AI stimati" value={expectedLearningPatterns} tone="gold" hint="Stima dei legami storici che alimenteranno i suggerimenti." />
        </div>

        <div style={{ marginTop: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: '.75rem' }}>
          <WorkflowSection eyebrow="Esito atteso" title="Cosa avverrà con l'import" subtitle="Sintesi leggibile prima di confermare la migrazione.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.75rem' }}>
              <MetricCard label="Importabili stimati" value={expectedImportable} />
              <MetricCard label="Soggetti collegati" value={expectedLinkedSubjects} />
              <MetricCard label="Conti nuovi/agganciati" value={expectedLinkedAccounts} />
              <MetricCard label="Memoria AI generata" value={expectedLearningPatterns} tone="gold" />
            </div>
          </WorkflowSection>

          <WorkflowSection eyebrow="Fiducia operativa" title="Segnali e avvisi" subtitle="Le note qui sotto aiutano a capire subito dove serve un controllo umano.">
            <div style={{ display: 'grid', gap: '.55rem' }}>
              {expectedWarnings.map((item) => (
                <div key={item} style={{ padding: '.72rem .8rem', borderRadius: 12, border: '1px solid rgba(95,124,154,.2)', background: 'rgba(255,255,255,.02)', color: 'var(--txt)', fontSize: '.82rem' }}>
                  {item}
                </div>
              ))}
            </div>
          </WorkflowSection>
        </div>

        {preview ? (
          <div className="erp-data-card" style={{ marginTop: '1rem' }}>
            <div className="erp-table-head">
              <div>
                <div className="erp-table-title">Anteprima dettagliata</div>
                <div className="erp-table-meta">Controllo prima della migrazione. Fonte: {file?.name || 'file NES'}.</div>
              </div>
              <div className="erp-table-tools">
                <Badge tone="gold">{filteredGroups.length} righe visibili</Badge>
                <Badge tone="blue">{preview.duplicates || 0} duplicati</Badge>
              </div>
            </div>

            <div className="card-body" style={{ paddingTop: 0 }}>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: '.75rem' }}>
                {summaryCards.map((card) => (
                  <div key={card.label} className="card" style={{ padding: '.8rem' }}>
                    <div className="card-subtitle">{card.label}</div>
                    <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text)' }}>{card.value}</div>
                  </div>
                ))}
              </div>

              {preview.duplicates > 0 ? (
                <div className="alert alert-warn" style={{ marginTop: '1rem' }}>
                  Rilevati duplicati o re-import già presenti. Il sistema li salterà in modo sicuro.
                </div>
              ) : null}

              <div className="erp-table-shell" style={{ marginTop: '1rem' }}>
                <table className="erp-table">
                  <thead>
                    <tr>
                      <th>Tipo</th>
                      <th>Soggetto</th>
                      <th>Data</th>
                      <th>Documento / Reg.</th>
                      <th>Conto</th>
                      <th>Totale</th>
                      <th>Stato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.slice(0, 12).map((g) => (
                      <tr key={g.key}>
                        <td>
                          <Badge tone={g.kind === 'invoice' ? 'green' : g.kind === 'prima_nota' ? 'blue' : 'gray'}>{g.kind}</Badge>
                        </td>
                        <td style={{ fontWeight: 600 }}>{g.subject?.nome || '—'}</td>
                        <td>{fmtDate(g.data_registrazione)}</td>
                        <td>{g.numero_documento || g.numero_registrazione || '—'}</td>
                        <td>{g.conto_codice || g.conto_descrizione || '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmtMoney(g.totale || g.dare || g.avere)}</td>
                        <td>{preview.duplicates ? 'da controllare' : 'ok'}</td>
                      </tr>
                    ))}
                    {filteredGroups.length === 0 ? (
                      <tr>
                        <td colSpan="7" style={{ textAlign: 'center', color: 'var(--mu)' }}>
                          Nessun dato nel periodo o con i filtri selezionati.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </WorkflowSection>

      <WorkflowSection
        eyebrow="4. Importazione"
        title="Conferma della migrazione storica"
        subtitle="Quando l'operatore è soddisfatto della preview, può lanciare l'importazione controllata del batch NES."
        accent
      >
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.75rem', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>
            L'import usa solo i record confermati nella preview. I duplicati restano protetti e lo storico viene marchiato con metadata NES.
          </div>
          <button className="btn-sec" onClick={runImport} disabled={loadingImport || !previewReady || !importReady}>
            {loadingImport ? 'Importo...' : 'Importa storico'}
          </button>
        </div>
      </WorkflowSection>

      {importReport ? (
        <WorkflowSection
          eyebrow="5. Report"
          title="Esito finale import"
          subtitle={`Batch ${importReport.batchId}. Qui l'operatore verifica cosa è stato importato, saltato e appreso come memoria AI.`}
          accent
        >
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.75rem' }}>
            <MetricCard label="Importati" value={importReport.imported} />
            <MetricCard label="Saltati" value={importReport.skipped} />
            <MetricCard label="Duplicati" value={importReport.duplicates} />
            <MetricCard label="Soggetti creati" value={importReport.subjectsCreated} />
            <MetricCard label="Soggetti collegati" value={importReport.subjectsLinked} />
            <MetricCard label="Pattern generati" value={importReport.accountsLearned} tone="gold" />
            <MetricCard label="Documenti NES" value={importReport.documentiCreated} />
            <MetricCard label="Prima nota" value={importReport.primaNoteCreated} />
            <MetricCard label="Righe contabili" value={importReport.accountingEntriesCreated} />
            <MetricCard label="Master data" value={importReport.masterDataCreated} />
            <MetricCard label="Anomalie" value={importReport.anomalies?.length || 0} />
            <MetricCard label="Memoria AI arricchita" value={importReport.accountsLearned} tone="gold" />
          </div>

          {Array.isArray(importReport.warnings) && importReport.warnings.length > 0 ? (
            <div className="alert alert-warn" style={{ marginTop: '1rem' }}>
              <strong>Warnings:</strong>
              <ul style={{ margin: '.35rem 0 0 1rem' }}>
                {importReport.warnings.slice(0, 8).map((w, i) => (
                  <li key={`${i}-${w}`}>{w}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </WorkflowSection>
      ) : null}
    </div>
  )
}
