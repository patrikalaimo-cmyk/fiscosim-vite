import { useEffect, useMemo, useRef, useState } from 'react'

let workingViewPrimaNotaRowSequence = 0

function nextWorkingViewPrimaNotaRowId() {
  workingViewPrimaNotaRowSequence += 1
  return `working-view-prima-nota-${workingViewPrimaNotaRowSequence}`
}

function normalizeWorkingViewAccountSearch(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .toLowerCase()
    .trim()
}

function toWorkingViewAmount(value) {
  if (value === '' || value == null) return ''
  const normalized = Number(String(value).replace(',', '.'))
  return Number.isFinite(normalized) ? normalized : ''
}

function formatWorkingViewAmountInput(value) {
  if (value === '' || value == null) return ''
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return String(value)
  return numericValue.toFixed(2).replace('.', ',')
}

function createWorkingViewPrimaNotaRow({ account = null, fallbackCode = '', fallbackDescription = '', dare = 0, avere = 0, note = '' } = {}) {
  const dareValue = Number(toWorkingViewAmount(dare) || 0) || 0
  const avereValue = Number(toWorkingViewAmount(avere) || 0) || 0
  return {
    id: nextWorkingViewPrimaNotaRowId(),
    accountId: String(account?.id || '').trim(),
    accountCode: String(account?.codice || fallbackCode || '').trim(),
    accountDescription: String(account?.descrizione || fallbackDescription || '').trim(),
    dare: dareValue,
    avere: avereValue,
    dareInput: formatWorkingViewAmountInput(dareValue),
    avereInput: formatWorkingViewAmountInput(avereValue),
    note: String(note || '').trim(),
  }
}

function buildWorkingViewPrimaNotaRows(activeWorkingViewModel) {
  return [
    createWorkingViewPrimaNotaRow({
      account: activeWorkingViewModel?.costRevenueAccount || null,
      dare: Number(activeWorkingViewModel?.imponibile || 0),
      note: 'Imponibile su conto costi/ricavi',
    }),
    createWorkingViewPrimaNotaRow({
      fallbackCode: 'IVA',
      fallbackDescription: 'Imposta sul valore aggiunto',
      dare: Number(activeWorkingViewModel?.iva || 0),
      note: 'IVA in detrazione',
    }),
    createWorkingViewPrimaNotaRow({
      account: activeWorkingViewModel?.counterpartyAccount || null,
      fallbackCode: activeWorkingViewModel?.counterpartyAccount ? '' : 'Non collegato',
      fallbackDescription: activeWorkingViewModel?.counterpartyAccount ? '' : 'Non collegato',
      avere: Number(activeWorkingViewModel?.totale || 0),
      note: `Causale: ${activeWorkingViewModel?.causale ? '' : ''}`,
    }),
  ]
}

function getWorkingViewPrimaNotaAccountLabel(row) {
  const code = String(row?.accountCode || '').trim()
  const description = String(row?.accountDescription || '').trim()
  if (!code && !description) return 'Seleziona conto...'
  return description ? `${code || '—'} · ${description}` : code || '—'
}

function isNearlyEqual(a, b) {
  const left = Number(a || 0)
  const right = Number(b || 0)
  return Math.abs(left - right) < 0.005
}

export function WorkingViewPrimaNotaTable({
  activeWorkingViewModel,
  formatMoney,
  formatManualCausale,
  pianoConti,
}) {
  const [rows, setRows] = useState(() => {
    const baseRows = buildWorkingViewPrimaNotaRows(activeWorkingViewModel)
    if (baseRows[2]) {
      baseRows[2].note = `Causale: ${formatManualCausale(activeWorkingViewModel?.causale)}`
    }
    return baseRows
  })
  const [selectedRowId, setSelectedRowId] = useState(null)
  const [accountPickerRowId, setAccountPickerRowId] = useState('')
  const [accountSearchTerm, setAccountSearchTerm] = useState('')
  const accountSearchInputRef = useRef(null)

  useEffect(() => {
    const baseRows = buildWorkingViewPrimaNotaRows(activeWorkingViewModel)
    if (baseRows[2]) {
      baseRows[2].note = `Causale: ${formatManualCausale(activeWorkingViewModel?.causale)}`
    }
    setRows(baseRows)
    setSelectedRowId(baseRows[0]?.id || null)
    setAccountPickerRowId('')
    setAccountSearchTerm('')
  }, [activeWorkingViewModel?.rowKey, activeWorkingViewModel?.causale, formatManualCausale])

  useEffect(() => {
    if (!rows.length) {
      setSelectedRowId(null)
      setAccountPickerRowId('')
      return
    }
    if (!selectedRowId || !rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(rows[0].id)
    }
    if (accountPickerRowId && !rows.some((row) => row.id === accountPickerRowId)) {
      setAccountPickerRowId('')
      setAccountSearchTerm('')
    }
  }, [rows, selectedRowId, accountPickerRowId])

  useEffect(() => {
    if (!accountPickerRowId) return
    accountSearchInputRef.current?.focus?.()
    accountSearchInputRef.current?.select?.()
  }, [accountPickerRowId])

  const filteredPianoConti = useMemo(() => {
    const query = normalizeWorkingViewAccountSearch(accountSearchTerm)
    const queryTokens = query ? query.split(' ').filter(Boolean) : []
    const items = Array.isArray(pianoConti) ? [...pianoConti] : []

    const filtered = items.filter((conto) => {
      const haystack = normalizeWorkingViewAccountSearch([
        conto?.codice,
        conto?.descrizione,
        conto?.partitaIva,
        conto?.anagraficaPiva,
        conto?.codiceFiscale,
        conto?.anagraficaCf,
      ].join(' '))
      if (!queryTokens.length) return true
      return queryTokens.every((token) => haystack.includes(token))
    })

    return filtered.sort((left, right) => {
      const leftLabel = normalizeWorkingViewAccountSearch(`${left?.codice || ''} ${left?.descrizione || ''}`)
      const rightLabel = normalizeWorkingViewAccountSearch(`${right?.codice || ''} ${right?.descrizione || ''}`)
      const leftStarts = queryTokens.length && queryTokens.some((token) => leftLabel.startsWith(token)) ? 1 : 0
      const rightStarts = queryTokens.length && queryTokens.some((token) => rightLabel.startsWith(token)) ? 1 : 0
      if (rightStarts !== leftStarts) return rightStarts - leftStarts
      return String(left?.codice || '').localeCompare(String(right?.codice || ''), 'it')
    })
  }, [accountSearchTerm, pianoConti])

  const updateRow = (rowId, field, value) => {
    setRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) return row
      if (field === 'dare' || field === 'avere') {
        const parsedValue = toWorkingViewAmount(value)
        return {
          ...row,
          [field]: parsedValue === '' ? 0 : Number(parsedValue || 0) || 0,
          [`${field}Input`]: value,
        }
      }
      return {
        ...row,
        [field]: value,
      }
    }))
  }

  const handleAmountBlur = (rowId, field) => {
    setRows((currentRows) => currentRows.map((row) => {
      if (row.id !== rowId) return row
      return {
        ...row,
        [`${field}Input`]: formatWorkingViewAmountInput(row[field]),
      }
    }))
  }

  const addRow = () => {
    const nextRow = createWorkingViewPrimaNotaRow({})
    setRows((currentRows) => [...currentRows, nextRow])
    setSelectedRowId(nextRow.id)
  }

  const removeRow = (rowId) => {
    setRows((currentRows) => {
      if (currentRows.length <= 1) return currentRows
      const nextRows = currentRows.filter((row) => row.id !== rowId)
      if (selectedRowId === rowId) {
        setSelectedRowId(nextRows[0]?.id || null)
      }
      if (accountPickerRowId === rowId) {
        setAccountPickerRowId('')
        setAccountSearchTerm('')
      }
      return nextRows
    })
  }

  const totalDare = rows.reduce((sum, row) => sum + Number(row.dare || 0), 0)
  const totalAvere = rows.reduce((sum, row) => sum + Number(row.avere || 0), 0)
  const isBalanced = isNearlyEqual(totalDare, totalAvere)

  return (
    <div style={{ display: 'grid', gap: '.14rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.2rem', flexWrap: 'wrap' }}>
        <div style={{ fontSize: '.6rem', color: 'rgba(188,204,226,.73)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
          Prima nota
        </div>
        <div style={{ display: 'flex', gap: '.08rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={addRow}
            style={{
              minHeight: 32,
              padding: '.1rem .14rem',
              borderRadius: 10,
              border: '1px solid rgba(61,211,110,.24)',
              background: 'linear-gradient(180deg, rgba(35,118,69,.42), rgba(24,86,49,.34))',
              color: '#eafff0',
              fontSize: '.68rem',
              fontWeight: 800,
            }}
          >
            + Aggiungi riga
          </button>
          <button
            type="button"
            onClick={() => selectedRowId && removeRow(selectedRowId)}
            disabled={!selectedRowId || rows.length <= 1}
            style={{
              minHeight: 32,
              padding: '.1rem .14rem',
              borderRadius: 10,
              border: '1px solid rgba(220,53,69,.22)',
              background: 'linear-gradient(180deg, rgba(220,53,69,.16), rgba(220,53,69,.08))',
              color: '#ffd8dd',
              fontSize: '.68rem',
              fontWeight: 800,
              opacity: !selectedRowId || rows.length <= 1 ? 0.45 : 1,
            }}
          >
            Elimina riga selezionata
          </button>
        </div>
      </div>

      <section
        style={{
          border: '1px solid rgba(124,157,202,.15)',
          borderRadius: 10,
          background: 'rgba(9,33,49,.5)',
          overflow: 'hidden',
          display: 'grid',
          gap: '.12rem',
        }}
      >
        <div style={{ padding: '.14rem .22rem 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.16rem', flexWrap: 'wrap' }}>
          <strong style={{ fontSize: '.76rem', color: '#e6eeff' }}>Scrittura proposta</strong>
        </div>

        <div style={{ overflowX: 'auto', padding: '0 .22rem .08rem', scrollbarWidth: 'thin' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', minWidth: 0 }}>
            <colgroup>
              <col style={{ width: '24%' }} />
              <col style={{ width: '28%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '18%' }} />
              <col style={{ width: '6%' }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(124,157,202,.14)', background: 'rgba(9,31,47,.52)' }}>
                <th style={{ padding: '.1rem .12rem', textAlign: 'left', fontSize: '.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(188,204,226,.74)', whiteSpace: 'nowrap' }}>Conto</th>
                <th style={{ padding: '.1rem .12rem', textAlign: 'left', fontSize: '.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(188,204,226,.74)', whiteSpace: 'nowrap' }}>Descrizione conto</th>
                <th style={{ padding: '.1rem .12rem', textAlign: 'right', fontSize: '.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(188,204,226,.74)', whiteSpace: 'nowrap' }}>Dare</th>
                <th style={{ padding: '.1rem .12rem', textAlign: 'right', fontSize: '.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(188,204,226,.74)', whiteSpace: 'nowrap' }}>Avere</th>
                <th style={{ padding: '.1rem .12rem', textAlign: 'left', fontSize: '.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(188,204,226,.74)', whiteSpace: 'nowrap' }}>Note</th>
                <th style={{ padding: '.1rem .12rem', textAlign: 'center', fontSize: '.56rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'rgba(188,204,226,.74)', whiteSpace: 'nowrap' }}>Azioni</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const isSelected = row.id === selectedRowId
                const isPickerOpen = row.id === accountPickerRowId
                return [
                  <tr key={row.id} style={{ borderBottom: isPickerOpen ? 'none' : '1px solid rgba(124,157,202,.1)', background: isSelected ? 'rgba(240,185,11,.06)' : 'transparent' }} onClick={() => setSelectedRowId(row.id)}>
                    <td style={{ padding: '.13rem .12rem', verticalAlign: 'top' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRowId(row.id)
                          setAccountPickerRowId(isPickerOpen ? '' : row.id)
                          setAccountSearchTerm('')
                        }}
                        style={{
                          width: '100%',
                          minHeight: 36,
                          borderRadius: 10,
                          border: '1px solid rgba(124,157,202,.12)',
                          background: 'rgba(11,33,51,.72)',
                          color: '#edf4ff',
                          fontSize: '.68rem',
                          padding: '.08rem .12rem',
                          textAlign: 'left',
                          display: 'grid',
                          gridTemplateColumns: 'minmax(0, 1fr) auto',
                          gap: '.08rem',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 700 }}>
                          {getWorkingViewPrimaNotaAccountLabel(row)}
                        </span>
                        <span style={{ color: 'rgba(188,204,226,.74)' }}>⌄</span>
                      </button>
                    </td>
                    <td style={{ padding: '.13rem .12rem', verticalAlign: 'top' }}>
                      <div style={{ fontSize: '.64rem', lineHeight: 1.34, color: '#c7d8f4', whiteSpace: 'normal', wordBreak: 'break-word' }}>
                        {row.accountDescription || 'Conto non selezionato'}
                      </div>
                    </td>
                    <td style={{ padding: '.13rem .12rem', verticalAlign: 'top' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.dareInput ?? formatWorkingViewAmountInput(row.dare)}
                        onChange={(event) => updateRow(row.id, 'dare', event.target.value)}
                        onFocus={() => setSelectedRowId(row.id)}
                        onBlur={() => handleAmountBlur(row.id, 'dare')}
                        style={{ width: '100%', minHeight: 34, borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(11,33,51,.72)', color: '#dff6ea', textAlign: 'right', fontWeight: 700, fontSize: '.72rem', padding: '.08rem .12rem' }}
                      />
                    </td>
                    <td style={{ padding: '.13rem .12rem', verticalAlign: 'top' }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={row.avereInput ?? formatWorkingViewAmountInput(row.avere)}
                        onChange={(event) => updateRow(row.id, 'avere', event.target.value)}
                        onFocus={() => setSelectedRowId(row.id)}
                        onBlur={() => handleAmountBlur(row.id, 'avere')}
                        style={{ width: '100%', minHeight: 34, borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(11,33,51,.72)', color: '#f1e2ce', textAlign: 'right', fontWeight: 700, fontSize: '.72rem', padding: '.08rem .12rem' }}
                      />
                    </td>
                    <td style={{ padding: '.13rem .12rem', verticalAlign: 'top' }}>
                      <textarea
                        value={row.note}
                        onChange={(event) => updateRow(row.id, 'note', event.target.value)}
                        onFocus={() => setSelectedRowId(row.id)}
                        rows={2}
                        style={{ width: '100%', minHeight: 48, resize: 'vertical', borderRadius: 10, border: '1px solid rgba(124,157,202,.12)', background: 'rgba(11,33,51,.72)', color: 'var(--tx)', fontSize: '.66rem', padding: '.08rem .12rem' }}
                      />
                    </td>
                    <td style={{ padding: '.13rem .12rem', textAlign: 'center', verticalAlign: 'top' }}>
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={rows.length <= 1}
                        style={{ width: 32, minWidth: 32, height: 32, borderRadius: 10, border: '1px solid rgba(220,53,69,.2)', background: 'rgba(220,53,69,.08)', color: '#ffd6dc', fontSize: '.82rem', fontWeight: 800, opacity: rows.length <= 1 ? 0.45 : 1 }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>,
                  isPickerOpen ? (
                    <tr key={`${row.id}-picker`} style={{ borderBottom: '1px solid rgba(124,157,202,.1)' }}>
                      <td colSpan={6} style={{ padding: '0 .12rem .12rem' }}>
                        <div style={{ borderRadius: 12, border: '1px solid rgba(124,157,202,.18)', background: 'linear-gradient(180deg, rgba(14,35,54,.98), rgba(10,26,42,.98))', boxShadow: '0 14px 32px rgba(0,0,0,.34)', padding: '.1rem', display: 'grid', gap: '.08rem' }}>
                          <input
                            ref={accountSearchInputRef}
                            type="text"
                            value={accountSearchTerm}
                            onChange={(event) => setAccountSearchTerm(event.target.value)}
                            placeholder="Cerca conto per codice o descrizione"
                            style={{ width: '100%', minHeight: 36, borderRadius: 10, border: '1px solid rgba(240,185,11,.68)', background: 'rgba(9,31,47,.9)', color: '#e6eeff', padding: '.1rem .14rem', fontSize: '.68rem', outline: 'none' }}
                          />
                          <div style={{ maxHeight: 240, overflow: 'auto', display: 'grid', gap: '.08rem' }}>
                            {filteredPianoConti.length ? filteredPianoConti.map((conto) => (
                              <button
                                key={conto.id}
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => {
                                  setRows((currentRows) => currentRows.map((currentRow) => currentRow.id === row.id ? {
                                    ...currentRow,
                                    accountId: String(conto?.id || '').trim(),
                                    accountCode: String(conto?.codice || '').trim(),
                                    accountDescription: String(conto?.descrizione || '').trim(),
                                  } : currentRow))
                                  setAccountPickerRowId('')
                                  setAccountSearchTerm('')
                                }}
                                style={{ width: '100%', border: '1px solid rgba(148,163,184,.14)', borderRadius: 8, background: 'rgba(255,255,255,.015)', color: '#dbeafe', padding: '.2rem .28rem', cursor: 'pointer', display: 'grid', gridTemplateColumns: '124px minmax(0, 1fr)', gap: '.28rem', alignItems: 'center', textAlign: 'left' }}
                              >
                                <strong style={{ fontSize: '.7rem' }}>{conto.codice || '—'}</strong>
                                <span style={{ fontSize: '.68rem', color: 'var(--tx)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{conto.descrizione || '—'}</span>
                              </button>
                            )) : (
                              <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>Nessun conto trovato</div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </table>
        </div>

        <div style={{ borderTop: '1px solid rgba(124,157,202,.12)', padding: '.12rem .22rem .18rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '.1rem' }}>
          <div style={{ border: '1px solid rgba(124,157,202,.14)', borderRadius: 8, background: 'rgba(9,33,49,.48)', padding: '.12rem .14rem', display: 'grid', gap: '.03rem' }}>
            <span style={{ fontSize: '.55rem', color: 'rgba(188,204,226,.75)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Totale Dare</span>
            <strong style={{ fontSize: '.7rem', color: '#dff6ea', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalDare)}</strong>
          </div>
          <div style={{ border: '1px solid rgba(124,157,202,.14)', borderRadius: 8, background: 'rgba(9,33,49,.48)', padding: '.12rem .14rem', display: 'grid', gap: '.03rem' }}>
            <span style={{ fontSize: '.55rem', color: 'rgba(188,204,226,.75)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Totale Avere</span>
            <strong style={{ fontSize: '.7rem', color: '#f1e2ce', fontVariantNumeric: 'tabular-nums' }}>{formatMoney(totalAvere)}</strong>
          </div>
          <div style={{ border: `1px solid ${isBalanced ? 'rgba(126,196,157,.32)' : 'rgba(207,134,139,.3)'}`, borderRadius: 8, background: isBalanced ? 'rgba(23,68,55,.34)' : 'rgba(102,44,50,.3)', padding: '.12rem .14rem', display: 'grid', gap: '.03rem' }}>
            <span style={{ fontSize: '.55rem', color: 'rgba(188,204,226,.75)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Quadratura</span>
            <strong style={{ fontSize: '.7rem', color: isBalanced ? '#cfeede' : '#f2d3d7' }}>
              {isBalanced ? 'Quadrata' : 'Non quadrata'}
            </strong>
          </div>
        </div>
      </section>
    </div>
  )
}
