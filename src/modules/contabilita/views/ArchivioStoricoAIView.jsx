import { useEffect, useMemo, useState } from 'react'
import { ModuleHeader } from '../../../shared/components'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import {
  buildArchivioStoricoAiGroups,
  filterArchivioStoricoAiGroups,
} from '../application/archivioStoricoAiService.js'

function fmtDate(v) {
  if (!v) return '—'
  return String(v).slice(0, 10)
}

function fmtMoney(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function Badge({ children, tone = 'gray' }) {
  return <span className={`bdg bdg-${tone}`}>{children}</span>
}

function MetricCard({ label, value, hint, tone = 'gray' }) {
  return (
    <div className="card" style={{ padding: '1rem', border: '1px solid rgba(95,124,154,.22)', background: 'rgba(255,255,255,.02)' }}>
      <div className="card-subtitle">{label}</div>
      <div style={{ marginTop: '.35rem', fontSize: '1.35rem', fontWeight: 850, color: tone === 'gold' ? 'var(--gold)' : 'var(--text)' }}>{value}</div>
      {hint ? <div style={{ marginTop: '.35rem', fontSize: '.78rem', color: 'var(--mu)' }}>{hint}</div> : null}
    </div>
  )
}

function Drawer({ open, onClose, group, onTogglePin, pinned }) {
  if (!open || !group) return null
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2,6,23,.56)',
        zIndex: 80,
        display: 'flex',
        justifyContent: 'flex-end',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(980px, calc(100vw - 24px))',
          height: '100%',
          background: 'linear-gradient(180deg, rgba(24,31,45,.98), rgba(19,26,38,.98))',
          borderLeft: '1px solid rgba(95,124,154,.22)',
          boxShadow: '-24px 0 60px rgba(0,0,0,.36)',
          overflow: 'auto',
          padding: '1.1rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'start' }}>
          <div>
            <div style={{ fontSize: '.72rem', textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--gold)', fontWeight: 800 }}>
              Archivio Storico AI
            </div>
            <h2 style={{ margin: '.2rem 0 .35rem', fontSize: '1.3rem' }}>{group.subject.label}</h2>
            <div style={{ color: 'var(--mu)', fontSize: '.9rem' }}>
              {group.subject.piva || group.subject.cf ? `${group.subject.piva || ''} ${group.subject.cf ? ` · ${group.subject.cf}` : ''}` : 'Nessuna P.IVA / CF rilevata'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
            <button type="button" className="btn-sec" onClick={() => onTogglePin(group.key)}>
              {pinned ? 'Rimuovi fonte AI' : 'Usa come fonte AI'}
            </button>
            <button type="button" className="btn-sec" onClick={onClose}>Chiudi</button>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.75rem', marginTop: '1rem' }}>
          <MetricCard label="Occorrenze" value={group.count} hint="Documenti storici collegati al soggetto." />
          <MetricCard label="Conto preferito" value={group.preferredAccountLabel || '—'} hint="Account piu frequente nello storico." />
          <MetricCard label="Ultimo utilizzo" value={fmtDate(group.lastUsageDate)} hint="Ultima registrazione trovata." />
          <MetricCard label="Confidence" value={`${group.confidenceScore}%`} tone="gold" hint="Stima dalla coerenza storica." />
          <MetricCard label="Clienti coinvolti" value={group.sourceClientCount} hint="Numero di societa presenti nello storico." />
          <MetricCard label="Media importi" value={fmtMoney(group.avgAmount)} hint="Totale medio dei documenti." />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(260px,1fr))', gap: '.75rem', marginTop: '1rem' }}>
          <div className="card" style={{ padding: '1rem', border: '1px solid rgba(95,124,154,.22)' }}>
            <div className="card-title">Uso conti</div>
            <div style={{ marginTop: '.75rem', display: 'grid', gap: '.45rem' }}>
              {(group.accountRows || []).slice(0, 6).map((row) => (
                <div key={row.contoId} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', fontSize: '.85rem' }}>
                  <span>{row.label || row.contoId}</span>
                  <strong>{row.count}</strong>
                </div>
              ))}
              {!group.accountRows?.length ? <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>Nessun conto storico utile.</div> : null}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', border: '1px solid rgba(95,124,154,.22)' }}>
            <div className="card-title">Memoria AI globale</div>
            <div style={{ marginTop: '.75rem', display: 'grid', gap: '.45rem' }}>
              {(group.learningRows || []).slice(0, 6).map((row) => (
                <div key={`${row.id || row.conto_id}`} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', fontSize: '.85rem' }}>
                  <span>
                    {row.conto_id || '—'}
                    {row.confidence_score != null ? ` · ${Math.round(Number(row.confidence_score))}%` : ''}
                  </span>
                  <strong>{row.frequenza || 0}x</strong>
                </div>
              ))}
              {!group.learningRows?.length ? <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>Nessuna regola AI consolidata.</div> : null}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', border: '1px solid rgba(95,124,154,.22)' }}>
            <div className="card-title">Frequenza causali IVA</div>
            <div style={{ marginTop: '.75rem', display: 'grid', gap: '.45rem' }}>
              {(group.vatRows || []).slice(0, 6).map((row) => (
                <div key={row.vat} style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem', fontSize: '.85rem' }}>
                  <span>{row.vat}</span>
                  <strong>{row.count}</strong>
                </div>
              ))}
              {!group.vatRows?.length ? <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>Nessuna causale IVA rilevata.</div> : null}
            </div>
          </div>

          <div className="card" style={{ padding: '1rem', border: '1px solid rgba(95,124,154,.22)' }}>
            <div className="card-title">Esempi recenti</div>
            <div style={{ marginTop: '.75rem', display: 'grid', gap: '.45rem' }}>
              {(group.recentExamples || []).slice(0, 6).map((row) => (
                <div key={row.id} style={{ padding: '.6rem .65rem', borderRadius: 10, border: '1px solid rgba(95,124,154,.16)', background: 'rgba(255,255,255,.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.75rem' }}>
                    <strong>{row.numero_documento || '—'}</strong>
                    <span>{fmtDate(row.data_documento)}</span>
                  </div>
                  <div style={{ color: 'var(--mu)', fontSize: '.8rem', marginTop: '.2rem' }}>
                    {row.tipo_documento} · {row.account_label} · {fmtMoney(row.totale)}
                  </div>
                </div>
              ))}
              {!group.recentExamples?.length ? <div style={{ color: 'var(--mu)', fontSize: '.82rem' }}>Nessun esempio disponibile.</div> : null}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginTop: '1rem', padding: '1rem', border: '1px solid rgba(95,124,154,.22)' }}>
          <div className="card-title">Storico uso</div>
          <div style={{ marginTop: '.75rem', overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Conto</th>
                  <th>Totale</th>
                  <th>Fonte</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                {(group.docs || []).slice(0, 16).map((doc) => (
                  <tr key={doc.id}>
                    <td>{fmtDate(doc.data_documento)}</td>
                    <td>{doc.numero_documento || '—'}</td>
                    <td>{doc.document_type_label || '—'}</td>
                    <td>{doc.account_label || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{fmtMoney(doc.totale)}</td>
                    <td><Badge tone={doc.is_nes ? 'gold' : 'gray'}>{doc.is_nes ? 'NES' : 'Native'}</Badge></td>
                    <td><Badge tone={String(doc.validation_status) === 'confirmed' ? 'green' : 'gray'}>{doc.validation_status || '—'}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function typeLabel(role) {
  if (role === 'fornitore') return 'Fornitore'
  if (role === 'cliente') return 'Cliente'
  if (role === 'professionista') return 'Professionista'
  return 'Misto'
}

export default function ArchivioStoricoAIView({ societaAttiva, societaList = [] }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [docs, setDocs] = useState([])
  const [groups, setGroups] = useState([])
  const [pianoConti, setPianoConti] = useState([])
  const [societaById, setSocietaById] = useState(new Map())
  const [search, setSearch] = useState('')
  const [supplierType, setSupplierType] = useState('all')
  const [sourceClientId, setSourceClientId] = useState('all')
  const [accountId, setAccountId] = useState('all')
  const [documentType, setDocumentType] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [nesOnly, setNesOnly] = useState(false)
  const [nativeOnly, setNativeOnly] = useState(false)
  const [confirmedOnly, setConfirmedOnly] = useState(true)
  const [selectedKey, setSelectedKey] = useState('')
  const [pinnedKeys, setPinnedKeys] = useState([])

  const societaScope = useMemo(() => {
    const ids = Array.isArray(societaList) && societaList.length > 0 ? societaList.map((s) => s.id).filter(Boolean) : societaAttiva?.id ? [societaAttiva.id] : []
    return ids
  }, [societaList, societaAttiva?.id])

  useEffect(() => {
    try {
      const raw = localStorage.getItem('fiscosim_ai_archive_pins')
      setPinnedKeys(raw ? JSON.parse(raw) : [])
    } catch {
      setPinnedKeys([])
    }
  }, [])

  useEffect(() => {
    if (!societaScope.length) return
    let alive = true
    setLoading(true)
    setError('')

    Promise.all([
      contabilitaRepo.getArchivioStoricoAiDocumenti(societaScope, { limit: 5000 }),
      contabilitaRepo.getArchivioStoricoAiLearning(societaScope, { limit: 5000 }),
      contabilitaRepo.getPianoContiBySocietaIds(societaScope),
      contabilitaRepo.getSocietaByIds(societaScope),
    ])
      .then(([docsRes, learningRes, pianoRes, socRes]) => {
        if (!alive) return
        if (docsRes?.error) throw docsRes.error
        if (learningRes?.error) throw learningRes.error
        if (pianoRes?.error) throw pianoRes.error
        if (socRes?.error) throw socRes.error
        setDocs(docsRes?.data || [])
        setPianoConti(pianoRes?.data || [])
        setSocietaById(new Map((socRes?.data || []).map((s) => [String(s.id), s])))
        const built = buildArchivioStoricoAiGroups({
          docs: docsRes?.data || [],
          learningRows: learningRes?.data || [],
          pianoConti: pianoRes?.data || [],
        })
        setGroups(built)
      })
      .catch((err) => {
        if (!alive) return
        setError(err?.message || String(err))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })

    return () => {
      alive = false
    }
  }, [societaScope.join('|')])

  const decoratedGroups = useMemo(
    () => groups.map((g) => ({ ...g, pinned: pinnedKeys.includes(g.key) })),
    [groups, pinnedKeys]
  )

  const filteredGroups = useMemo(
    () =>
      filterArchivioStoricoAiGroups(decoratedGroups, {
        search,
        sourceClientId: sourceClientId === 'all' ? '' : sourceClientId,
        accountId: accountId === 'all' ? '' : accountId,
        subjectType: supplierType,
        documentType,
        fromDate,
        toDate,
        nesOnly,
        nativeOnly,
        confirmedOnly,
        sourceScope: 'all',
      }).sort((a, b) => {
        const pinA = pinnedKeys.includes(a.key) ? 1 : 0
        const pinB = pinnedKeys.includes(b.key) ? 1 : 0
        if (pinA !== pinB) return pinB - pinA
        if (b.count !== a.count) return b.count - a.count
        if (b.confidenceScore !== a.confidenceScore) return b.confidenceScore - a.confidenceScore
        return String(a.subject.label).localeCompare(String(b.subject.label), 'it')
      }),
    [decoratedGroups, search, sourceClientId, accountId, supplierType, documentType, fromDate, toDate, nesOnly, nativeOnly, confirmedOnly]
  )

  useEffect(() => {
    if (!filteredGroups.length) {
      setSelectedKey('')
      return
    }
    if (!selectedKey || !filteredGroups.some((g) => g.key === selectedKey)) {
      setSelectedKey(filteredGroups[0].key)
    }
  }, [filteredGroups, selectedKey])

  const selectedGroup = filteredGroups.find((g) => g.key === selectedKey) || null

  const stats = useMemo(() => {
    const docsConfirmed = docs.filter((d) => String(d.validation_status || '').toLowerCase() === 'confirmed').length
    const nesCount = docs.filter((d) => d.is_nes).length
    const nativeCount = docs.length - nesCount
    return {
      groups: filteredGroups.length,
      docs: docs.length,
      confirmed: docsConfirmed,
      nesCount,
      nativeCount,
      pinned: pinnedKeys.length,
    }
  }, [docs, filteredGroups.length, pinnedKeys.length])

  const togglePin = (key) => {
    setPinnedKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((x) => x !== key) : [...prev, key]
      try {
        localStorage.setItem('fiscosim_ai_archive_pins', JSON.stringify(next))
      } catch {}
      return next
    })
  }

  if (!societaAttiva) return null

  return (
    <div className="erp-view">
      <ModuleHeader
        sectionLabel="Contabilita"
        title="Archivio Storico AI"
        context="Motore di ricerca della memoria storica globale usata dai suggerimenti AI"
      />

      {error ? <div className="alert alert-err">{error}</div> : null}

      <div className="card" style={{ padding: '1rem', marginTop: '1rem' }}>
        <div className="card-title">Ordine AI</div>
        <div className="card-subtitle">1) storia cliente 2) archivio storico globale 3) regole statiche 4) richiesta operatore.</div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: '.75rem', marginTop: '1rem' }}>
        <MetricCard label="Soggetti" value={stats.groups} hint="Gruppi storici individuati" />
        <MetricCard label="Documenti" value={stats.docs} hint="Record indicizzati" />
        <MetricCard label="Confermati" value={stats.confirmed} hint="Usabili come memoria affidabile" />
        <MetricCard label="NES" value={stats.nesCount} hint="Import storici marcati" />
        <MetricCard label="Native" value={stats.nativeCount} hint="Movimenti nativi FiscoSim" />
        <MetricCard label="Preferiti AI" value={stats.pinned} hint="Fonti selezionate dall'operatore" tone="gold" />
      </div>

      <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
        <div className="form-grid">
          <div className="fg full">
            <label>Ricerca globale</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cerca fornitori, clienti, descrizioni, conti, numeri documento, parole chiave..."
            />
          </div>
          <div className="fg">
            <label>Tipo soggetto</label>
            <select value={supplierType} onChange={(e) => setSupplierType(e.target.value)}>
              <option value="all">Tutti</option>
              <option value="fornitore">Fornitori</option>
              <option value="cliente">Clienti</option>
              <option value="professionista">Professionisti</option>
              <option value="misto">Misti</option>
            </select>
          </div>
          <div className="fg">
            <label>Cliente sorgente</label>
            <select value={sourceClientId} onChange={(e) => setSourceClientId(e.target.value)}>
              <option value="all">Tutti i clienti</option>
              {societaList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.denominazione || s.id}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label>Conto usato</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              <option value="all">Tutti i conti</option>
              {pianoConti.slice(0, 800).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codice ? `${c.codice} - ` : ''}{c.descrizione}
                </option>
              ))}
            </select>
          </div>
          <div className="fg">
            <label>Tipo documento</label>
            <select value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
              <option value="all">Tutti</option>
              <option value="fattura_passiva">Fattura passiva</option>
              <option value="fattura_attiva">Fattura attiva</option>
              <option value="prima_nota">Prima nota</option>
              <option value="parcella">Parcella</option>
              <option value="nota_credito">Nota di credito</option>
              <option value="altro">Altro</option>
            </select>
          </div>
          <div className="fg"><label>Dal</label><input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} /></div>
          <div className="fg"><label>Al</label><input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} /></div>
          <div className="fg" style={{ display: 'flex', flexDirection: 'column', gap: '.45rem' }}>
            <label>Origine dati</label>
            <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' }}>
              <input type="checkbox" checked={nesOnly} onChange={(e) => setNesOnly(e.target.checked)} /> Solo NES
            </label>
            <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' }}>
              <input type="checkbox" checked={nativeOnly} onChange={(e) => setNativeOnly(e.target.checked)} /> Solo nativi
            </label>
            <label style={{ display: 'flex', gap: '.5rem', alignItems: 'center', fontSize: '.85rem' }}>
              <input type="checkbox" checked={confirmedOnly} onChange={(e) => setConfirmedOnly(e.target.checked)} /> Confermati soltanto
            </label>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: '1rem', padding: '1rem' }}>
        <div className="card-title">Risultati archivio</div>
        <div className="card-subtitle">Soggetti ordinati per frequenza e affidabilita storica.</div>
        {loading ? (
          <div style={{ padding: '1rem 0', color: 'var(--mu)' }}>Caricamento archivio storico...</div>
        ) : (
          <div style={{ marginTop: '.9rem', overflowX: 'auto' }}>
            <table className="erp-table">
              <thead>
                <tr>
                  <th>Soggetto</th>
                  <th>Tipo</th>
                  <th>Occorrenze</th>
                  <th>Conto preferito</th>
                  <th>Ultimo uso</th>
                  <th>Confidence</th>
                  <th>Origine</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {filteredGroups.map((g) => (
                  <tr key={g.key} onClick={() => setSelectedKey(g.key)} style={{ cursor: 'pointer', background: g.pinned ? 'rgba(199,160,63,.06)' : 'transparent' }}>
                    <td>
                      <div style={{ fontWeight: 700 }}>{g.subject.label}</div>
                      <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>
                        {g.subject.piva || g.subject.cf || 'Nessun identificativo forte'}
                      </div>
                    </td>
                    <td><Badge tone="gray">{typeLabel(g.role)}</Badge></td>
                    <td style={{ fontWeight: 700 }}>{g.count}</td>
                    <td>{g.preferredAccountLabel || '—'}</td>
                    <td>{fmtDate(g.lastUsageDate)}</td>
                    <td><Badge tone={g.confidenceScore >= 80 ? 'green' : g.confidenceScore >= 60 ? 'gold' : 'gray'}>{g.confidenceScore}%</Badge></td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.35rem' }}>
                        {g.nesCount ? <Badge tone="gold">NES</Badge> : null}
                        {g.nativeCount ? <Badge tone="blue">Native</Badge> : null}
                        {g.pinned ? <Badge tone="green">AI source</Badge> : null}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button type="button" className="btn-sec" onClick={(e) => { e.stopPropagation(); togglePin(g.key) }}>
                        {g.pinned ? 'Rimuovi' : 'Usa come fonte AI'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!filteredGroups.length ? (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', color: 'var(--mu)' }}>
                      Nessun risultato per i filtri selezionati.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <Drawer
        open={Boolean(selectedGroup)}
        group={selectedGroup}
        pinned={selectedGroup ? pinnedKeys.includes(selectedGroup.key) : false}
        onClose={() => setSelectedKey('')}
        onTogglePin={togglePin}
      />
    </div>
  )
}
