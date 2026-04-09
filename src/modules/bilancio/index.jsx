import { useMemo, useState } from 'react'
import { ModuleHeader } from '../../shared/components'
import { BaseCombobox } from '../../shared/ui/BaseDropdown.jsx'

const BILANCIO_DATA = {
  stato_patrimoniale: [
    {
      id: 'attivo',
      title: 'Attivo',
      accounts: [
        {
          code: '100',
          label: 'Immobilizzazioni immateriali',
          current: 184000,
          previous: 169000,
          movements: [
            { date: '2026-01-15', description: 'Canoni software pluriennali', amount: 12000, primaNota: 'PN-260115-03' },
            { date: '2026-02-28', description: 'Sviluppo piattaforma interna', amount: 3000, primaNota: 'PN-260228-11' },
          ],
        },
        {
          code: '120',
          label: 'Crediti commerciali',
          current: 268500,
          previous: 231000,
          movements: [
            { date: '2026-03-31', description: 'Fatture clienti da incassare', amount: 41500, primaNota: 'PN-260331-07' },
            { date: '2026-03-18', description: 'Incasso parziale posizioni scadute', amount: -4000, primaNota: 'PN-260318-02' },
          ],
        },
        {
          code: '140',
          label: 'Disponibilità liquide',
          current: 96200,
          previous: 118400,
          movements: [
            { date: '2026-03-29', description: 'Pagamento fornitori strategici', amount: -22200, primaNota: 'PN-260329-05' },
            { date: '2026-03-25', description: 'Incasso bonifici clienti', amount: 9600, primaNota: 'PN-260325-04' },
          ],
        },
      ],
    },
    {
      id: 'passivo',
      title: 'Passivo',
      accounts: [
        {
          code: '200',
          label: 'Patrimonio netto',
          current: 305600,
          previous: 276800,
          movements: [
            { date: '2026-03-31', description: 'Risultato d’esercizio provvisorio', amount: 28800, primaNota: 'PN-260331-18' },
          ],
        },
        {
          code: '220',
          label: 'Debiti verso fornitori',
          current: 171300,
          previous: 154900,
          movements: [
            { date: '2026-03-27', description: 'Fatture ricevute mese corrente', amount: 24400, primaNota: 'PN-260327-09' },
            { date: '2026-03-30', description: 'Pagamenti scadenze fine mese', amount: -8000, primaNota: 'PN-260330-12' },
          ],
        },
        {
          code: '240',
          label: 'Debiti tributari e previdenziali',
          current: 71800,
          previous: 86800,
          movements: [
            { date: '2026-03-16', description: 'Versamenti F24 e contributi', amount: -15000, primaNota: 'PN-260316-06' },
          ],
        },
      ],
    },
  ],
  conto_economico: [
    {
      id: 'ricavi',
      title: 'Ricavi',
      accounts: [
        {
          code: '700',
          label: 'Ricavi da consulenza',
          current: 624000,
          previous: 581500,
          movements: [
            { date: '2026-03-31', description: 'Fatture consulenza marzo', amount: 52400, primaNota: 'PN-260331-01' },
          ],
        },
        {
          code: '710',
          label: 'Ricavi da servizi continuativi',
          current: 318500,
          previous: 289200,
          movements: [
            { date: '2026-03-31', description: 'Canoni ricorrenti trimestre', amount: 29300, primaNota: 'PN-260331-02' },
          ],
        },
      ],
    },
    {
      id: 'costi',
      title: 'Costi',
      accounts: [
        {
          code: '800',
          label: 'Costo del personale',
          current: 296000,
          previous: 264000,
          movements: [
            { date: '2026-03-27', description: 'Cedolini marzo', amount: 25800, primaNota: 'PN-260327-01' },
          ],
        },
        {
          code: '820',
          label: 'Servizi professionali',
          current: 121200,
          previous: 97300,
          movements: [
            { date: '2026-03-24', description: 'Parcelle consulenze esterne', amount: 14400, primaNota: 'PN-260324-03' },
          ],
        },
        {
          code: '840',
          label: 'Oneri finanziari',
          current: 18400,
          previous: 12900,
          movements: [
            { date: '2026-03-31', description: 'Interessi passivi e commissioni', amount: 2300, primaNota: 'PN-260331-13' },
          ],
        },
      ],
    },
  ],
}

const fmtCurrency = (value) =>
  new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(Number(value || 0))

const fmtSignedCurrency = (value) =>
  `${Number(value || 0) > 0 ? '+' : ''}${fmtCurrency(value)}`

const fmtPct = (value) => `${Number(value || 0).toFixed(1)}%`

function flattenAccounts(groups) {
  return groups.flatMap((group) =>
    group.accounts.map((account) => ({
      ...account,
      sectionId: group.id,
      sectionTitle: group.title,
      delta: account.current - account.previous,
      deltaPct: account.previous ? ((account.current - account.previous) / account.previous) * 100 : 0,
    })),
  )
}

export function ModuloBilancio() {
  const [periodMode, setPeriodMode] = useState('anno')
  const [year, setYear] = useState('2026')
  const [rangeFrom, setRangeFrom] = useState('2025')
  const [rangeTo, setRangeTo] = useState('2026')
  const [comparePrev, setComparePrev] = useState(true)
  const [viewType, setViewType] = useState('civilistico')
  const [riclassificazione, setRiclassificazione] = useState('standard')
  const [activeStatement, setActiveStatement] = useState('stato_patrimoniale')
  const [expandedSections, setExpandedSections] = useState({ attivo: true, passivo: true, ricavi: true, costi: true })
  const [selectedAccountCode, setSelectedAccountCode] = useState('120')

  const activeGroups = BILANCIO_DATA[activeStatement]
  const flatAccounts = useMemo(() => flattenAccounts(activeGroups), [activeGroups])
  const selectedAccount = flatAccounts.find((account) => account.code === selectedAccountCode) || flatAccounts[0]

  const allAccounts = useMemo(
    () => [...flattenAccounts(BILANCIO_DATA.stato_patrimoniale), ...flattenAccounts(BILANCIO_DATA.conto_economico)],
    [],
  )

  const confrontoRows = useMemo(
    () =>
      allAccounts
        .filter((account) => Math.abs(account.deltaPct) >= 8)
        .sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct))
        .slice(0, 6),
    [allAccounts],
  )

  const totals = useMemo(() => {
    const ricavi = flattenAccounts(BILANCIO_DATA.conto_economico.filter((group) => group.id === 'ricavi')).reduce((sum, row) => sum + row.current, 0)
    const costi = flattenAccounts(BILANCIO_DATA.conto_economico.filter((group) => group.id === 'costi')).reduce((sum, row) => sum + row.current, 0)
    const attivo = flattenAccounts(BILANCIO_DATA.stato_patrimoniale.filter((group) => group.id === 'attivo')).reduce((sum, row) => sum + row.current, 0)
    const passivo = flattenAccounts(BILANCIO_DATA.stato_patrimoniale.filter((group) => group.id === 'passivo')).reduce((sum, row) => sum + row.current, 0)
    return { ricavi, costi, attivo, passivo, mol: ricavi - costi, risultato: ricavi - costi }
  }, [])

  const indicators = useMemo(() => {
    const redditivita = totals.ricavi ? (totals.risultato / totals.ricavi) * 100 : 0
    const liquidita = totals.passivo ? totals.attivo / totals.passivo : 0
    const indebitamento = totals.attivo ? ((totals.passivo - 305600) / totals.attivo) * 100 : 0
    return [
      { id: 'mol', label: 'Margine operativo', value: fmtCurrency(totals.mol), trend: '+6,8%', badge: 'bdg-green', note: 'in crescita' },
      { id: 'redditivita', label: 'Redditivita', value: fmtPct(redditivita), trend: '+1,9 pt', badge: 'bdg-green', note: 'sopra il budget' },
      { id: 'liquidita', label: 'Liquidita', value: liquidita.toFixed(2), trend: '-0,18', badge: liquidita < 1.2 ? 'bdg-gold' : 'bdg-green', note: liquidita < 1.2 ? 'attenzione' : 'equilibrata' },
      { id: 'indebitamento', label: 'Indebitamento', value: fmtPct(indebitamento), trend: '+2,4 pt', badge: 'bdg-gold', note: 'da monitorare' },
    ]
  }, [totals])

  const aiInsights = useMemo(() => {
    const topIncrease = confrontoRows[0]
    const costAlert = allAccounts.find((row) => row.code === '820')
    return [
      topIncrease
        ? `Variazione anomala su ${topIncrease.label}: ${fmtPct(topIncrease.deltaPct)} rispetto al periodo precedente.`
        : 'Nessuna variazione anomala rilevata sul periodo selezionato.',
      costAlert
        ? `Incremento dei servizi professionali di ${fmtPct(costAlert.deltaPct)}: verificare consulenze straordinarie e contratti ricorrenti.`
        : 'I costi professionali risultano stabili.',
      `La liquidita rimane ${indicators[2].note}; valutare un riequilibrio tra incassi e debiti di breve periodo.`,
    ]
  }, [allAccounts, confrontoRows, indicators])

  const toggleSection = (sectionId) => setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }))

  const contextLabel =
    periodMode === 'anno'
      ? `Analisi interattiva ${year}${comparePrev ? ' con confronto anno precedente' : ''}`
      : `Analisi interattiva ${rangeFrom}–${rangeTo}${comparePrev ? ' con confronto omogeneo' : ''}`

  return (
    <div className="page">
      <ModuleHeader
        sectionLabel="Analisi"
        title="Bilancio"
        context={contextLabel}
        secondaryAction={
          <>
            <button className="btn-sec">Aggiorna dati</button>
            <button className="btn-sec">Esporta</button>
          </>
        }
      />

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-title">Filtri</div>
            <div className="card-subtitle">Periodo, vista di lettura e riclassificazione operativa del bilancio.</div>
          </div>
        </div>
        <div className="toolbar" style={{ flexWrap: 'wrap', alignItems: 'end' }}>
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
                onChange={(v) => setYear(v || '2026')}
                options={['2026', '2025', '2024'].map((y) => ({ id: y, label: y }))}
                getOptionId={(o) => o?.id}
                getOptionLabel={(o) => o?.label}
                searchable={false}
              />
            </div>
          ) : (
            <>
              <div className="fg" style={{ minWidth: 140 }}>
                <label>Da</label>
                <BaseCombobox
                  value={String(rangeFrom || '')}
                  onChange={(v) => setRangeFrom(v || '2024')}
                  options={['2024', '2025'].map((y) => ({ id: y, label: y }))}
                  getOptionId={(o) => o?.id}
                  getOptionLabel={(o) => o?.label}
                  searchable={false}
                />
              </div>
              <div className="fg" style={{ minWidth: 140 }}>
                <label>A</label>
                <BaseCombobox
                  value={String(rangeTo || '')}
                  onChange={(v) => setRangeTo(v || '2026')}
                  options={['2025', '2026'].map((y) => ({ id: y, label: y }))}
                  getOptionId={(o) => o?.id}
                  getOptionLabel={(o) => o?.label}
                  searchable={false}
                />
              </div>
            </>
          )}
          <div className="fg" style={{ minWidth: 180 }}>
            <label>Confronto</label>
            <BaseCombobox
              value={comparePrev ? 'si' : 'no'}
              onChange={(v) => setComparePrev(v === 'si')}
              options={[
                { id: 'si', label: 'Con anno precedente' },
                { id: 'no', label: 'Senza confronto' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>
          <div className="fg" style={{ minWidth: 180 }}>
            <label>Tipo vista</label>
            <BaseCombobox
              value={viewType}
              onChange={(v) => setViewType(v || 'civilistico')}
              options={[
                { id: 'civilistico', label: 'Civilistico' },
                { id: 'gestionale', label: 'Gestionale' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>
          <div className="fg" style={{ minWidth: 180 }}>
            <label>Riclassificazione</label>
            <BaseCombobox
              value={riclassificazione}
              onChange={(v) => setRiclassificazione(v || 'standard')}
              options={[
                { id: 'standard', label: 'Standard' },
                { id: 'banche', label: 'Rating bancario' },
                { id: 'margini', label: 'Margini e KPI' },
              ]}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              searchable={false}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-title">Bilancio principale</div>
            <div className="card-subtitle">Navigazione interattiva tra stato patrimoniale e conto economico con drill-down fino alle scritture.</div>
          </div>
          <div className="pills" style={{ marginBottom: 0 }}>
            <button className={`pill ${activeStatement === 'stato_patrimoniale' ? 'active' : ''}`} onClick={() => setActiveStatement('stato_patrimoniale')}>
              Stato patrimoniale
            </button>
            <button className={`pill ${activeStatement === 'conto_economico' ? 'active' : ''}`} onClick={() => setActiveStatement('conto_economico')}>
              Conto economico
            </button>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Voce</th>
                <th className="tar">Saldo attuale</th>
                {comparePrev ? <th className="tar">Saldo precedente</th> : null}
                {comparePrev ? <th className="tar">Delta</th> : null}
                {comparePrev ? <th className="tar">Delta %</th> : null}
              </tr>
            </thead>
            <tbody>
              {activeGroups.map((group) => {
                const sectionRows = flattenAccounts([group])
                const sectionCurrent = sectionRows.reduce((sum, row) => sum + row.current, 0)
                const sectionPrevious = sectionRows.reduce((sum, row) => sum + row.previous, 0)
                const sectionDelta = sectionCurrent - sectionPrevious
                const sectionDeltaPct = sectionPrevious ? (sectionDelta / sectionPrevious) * 100 : 0
                return (
                  <>
                    <tr key={group.id} className={expandedSections[group.id] ? 'is-selected' : ''}>
                      <td>
                        <button className="btn-icon" onClick={() => toggleSection(group.id)} style={{ marginRight: 8 }}>
                          {expandedSections[group.id] ? '−' : '+'}
                        </button>
                        <strong>{group.title}</strong>
                      </td>
                      <td className="tar"><strong>{fmtCurrency(sectionCurrent)}</strong></td>
                      {comparePrev ? <td className="tar"><strong>{fmtCurrency(sectionPrevious)}</strong></td> : null}
                      {comparePrev ? <td className="tar"><strong>{fmtSignedCurrency(sectionDelta)}</strong></td> : null}
                      {comparePrev ? <td className="tar"><span className={`bdg ${Math.abs(sectionDeltaPct) >= 10 ? 'bdg-gold' : 'bdg-gray'}`}>{fmtPct(sectionDeltaPct)}</span></td> : null}
                    </tr>
                    {expandedSections[group.id]
                      ? group.accounts.map((account) => {
                          const delta = account.current - account.previous
                          const deltaPct = account.previous ? (delta / account.previous) * 100 : 0
                          const isSelected = selectedAccount?.code === account.code
                          return (
                            <tr
                              key={account.code}
                              className={isSelected ? 'is-selected' : ''}
                              onClick={() => setSelectedAccountCode(account.code)}
                              style={{ cursor: 'pointer' }}
                            >
                              <td style={{ paddingLeft: 40 }}>
                                <div style={{ fontWeight: 600 }}>{account.code} · {account.label}</div>
                              </td>
                              <td className="tar">{fmtCurrency(account.current)}</td>
                              {comparePrev ? <td className="tar">{fmtCurrency(account.previous)}</td> : null}
                              {comparePrev ? <td className="tar">{fmtSignedCurrency(delta)}</td> : null}
                              {comparePrev ? <td className="tar"><span className={`bdg ${Math.abs(deltaPct) >= 12 ? 'bdg-gold' : 'bdg-gray'}`}>{fmtPct(deltaPct)}</span></td> : null}
                            </tr>
                          )
                        })
                      : null}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {selectedAccount ? (
          <div className="card" style={{ marginTop: 16, padding: 16 }}>
            <div className="card-hdr">
              <div>
                <div className="card-title">Drill-down</div>
                <div className="card-subtitle">
                  Bilancio → {selectedAccount.sectionTitle} → {selectedAccount.code} · {selectedAccount.label} → Movimenti → Prima nota
                </div>
              </div>
              <div className="bdg bdg-gray">Rif. prima nota disponibili</div>
            </div>
            <div className="tbl-wrap">
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Descrizione</th>
                    <th className="tar">Importo</th>
                    <th>Prima nota</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedAccount.movements.map((movement, index) => (
                    <tr key={`${selectedAccount.code}-${index}`}>
                      <td>{movement.date}</td>
                      <td>{movement.description}</td>
                      <td className="tar">{fmtSignedCurrency(movement.amount)}</td>
                      <td><span className="bdg bdg-gray">{movement.primaNota}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-title">Confronti</div>
            <div className="card-subtitle">Scostamenti assoluti e percentuali con evidenza immediata delle variazioni piu rilevanti.</div>
          </div>
        </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Area</th>
                <th>Voce</th>
                <th className="tar">Attuale</th>
                <th className="tar">Precedente</th>
                <th className="tar">Delta</th>
                <th className="tar">Delta %</th>
              </tr>
            </thead>
            <tbody>
              {confrontoRows.map((row) => (
                <tr key={`cmp-${row.code}`}>
                  <td>{row.sectionTitle}</td>
                  <td>{row.code} · {row.label}</td>
                  <td className="tar">{fmtCurrency(row.current)}</td>
                  <td className="tar">{fmtCurrency(row.previous)}</td>
                  <td className="tar">{fmtSignedCurrency(row.delta)}</td>
                  <td className="tar"><span className={`bdg ${Math.abs(row.deltaPct) >= 15 ? 'bdg-gold' : 'bdg-gray'}`}>{fmtPct(row.deltaPct)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-hdr">
          <div>
            <div className="card-title">Analisi</div>
            <div className="card-subtitle">Indicatori di performance, trend e lettura automatica delle variazioni anomale.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))', gap: 16, marginBottom: 16 }}>
          {indicators.map((item) => (
            <div key={item.id} className="stat-card">
              <div className="cont-toolbar-label">{item.label}</div>
              <div style={{ fontSize: '1.35rem', fontWeight: 700, marginTop: 6 }}>{item.value}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <span className={`bdg ${item.badge}`}>{item.note}</span>
                <span style={{ color: 'var(--mu)', fontSize: '.78rem' }}>{item.trend}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="alert alert-info">
          <strong>Analisi AI</strong>
          <div style={{ marginTop: 8, display: 'grid', gap: 6 }}>
            {aiInsights.map((insight, index) => (
              <div key={`insight-${index}`}>{insight}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
