const ACTION_STYLE = {
  display: 'inline-flex',
  gap: '.35rem',
  flexWrap: 'wrap',
}

function CellActions({ row, onDetail, onEdit, onReverse, onOpenPartitario, readOnlyMessage }) {
  return (
    <div style={ACTION_STYLE}>
      <button type="button" className="btn-sec" style={{ padding: '.28rem .45rem', fontSize: '.72rem' }} onClick={() => onDetail?.(row)}>
        Dettaglio
      </button>
      <button
        type="button"
        className="btn-sec"
        style={{ padding: '.28rem .45rem', fontSize: '.72rem' }}
        onClick={() => onEdit?.(row)}
        disabled
        title={readOnlyMessage}
      >
        Modifica
      </button>
      <button
        type="button"
        className="btn-sec"
        style={{ padding: '.28rem .45rem', fontSize: '.72rem' }}
        onClick={() => onReverse?.(row)}
        disabled
        title={readOnlyMessage}
      >
        Storna
      </button>
      <button
        type="button"
        className="btn-sec"
        style={{ padding: '.28rem .45rem', fontSize: '.72rem' }}
        onClick={() => onOpenPartitario?.(row)}
        disabled
        title={readOnlyMessage}
      >
        Apri partitario
      </button>
    </div>
  )
}

function fmt(value) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return '0,00'
  return n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function buildPageItems(current, total, maxItems = 5) {
  const pages = []
  if (total <= 1) return [1]
  const span = Math.max(1, maxItems)
  let start = Math.max(1, current - Math.floor(span / 2))
  let end = Math.min(total, start + span - 1)
  start = Math.max(1, end - span + 1)
  for (let i = start; i <= end; i += 1) pages.push(i)
  return pages
}

export function ConsultazioneResultsTable({
  rows = [],
  selectedRowId = null,
  onRowClick = null,
  onRowDoubleClick = null,
  compact = true,
  loading = false,
  note = '',
  compactMode = 'compact',
  onToggleCompact,
  onDetail,
  onEdit,
  onReverse,
  onOpenPartitario,
  readOnlyMessage = 'Modifica/storno non disponibili da Consultazione. Usa il flusso canonico di registrazione/commit atomico.',
  isContoSelected = false,
  sortField = null,
  sortDirection = null,
  onSort = null,
}) {
  const renderHeader = (label, field, isNumeric = false) => {
    const isSorted = sortField === field
    const icon = isSorted ? (sortDirection === 'asc' ? ' ▲' : ' ▼') : ''
    return (
      <th
        className={isNumeric ? 'tar' : ''}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '.3rem .75rem',
          cursor: 'pointer',
          userSelect: 'none',
          color: isSorted ? 'var(--gold)' : 'var(--text)',
          transition: 'color .15s',
          whiteSpace: 'nowrap',
        }}
        onClick={() => onSort?.(field)}
        title={`Clicca per ordinare per ${label}`}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
          {label}
          <span style={{ fontSize: '.65rem', opacity: isSorted ? 1 : 0.4 }}>{icon || ' ⇅'}</span>
        </span>
      </th>
    )
  }

  if (loading) {
    return (
      <div
        style={{
          marginBottom: '1rem',
          overflow: 'hidden',
          borderRadius: 20,
          border: '1px solid rgba(96,165,250,.1)',
          background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))',
          boxShadow: '0 18px 40px rgba(0,0,0,.13)',
          padding: '1rem',
        }}
      >
        <div className="empty" style={{ padding: '1.5rem 1rem' }}>
          <div className="empty-t">Caricamento consultazione...</div>
          <div className="empty-s">Sto preparando i risultati filtrati e la progressione del saldo.</div>
        </div>
      </div>
    )
  }

  if (!rows.length) {
    return (
      <div
        style={{
          marginBottom: '1rem',
          overflow: 'hidden',
          borderRadius: 20,
          border: '1px solid rgba(96,165,250,.1)',
          background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))',
          boxShadow: '0 18px 40px rgba(0,0,0,.13)',
          padding: '1rem',
        }}
      >
        <div className="empty" style={{ padding: '1.5rem 1rem' }}>
          <div className="empty-t">Nessun movimento trovato</div>
          <div className="empty-s">Raffina i filtri per consultare prima nota e saldo progressivo.</div>
        </div>
      </div>
    )
  }

  const isCompact = compactMode === 'compact' || compact

  function renderStatoBadge(row) {
    const statoPn = row.raw?.prima_nota?.stato || 'definitiva'
    const statoQuad = row.statoQuadratura || 'quadrata'

    if (statoPn === 'stornata') {
      return <span className="bdg" style={{ fontSize: '.68rem', padding: '2px 6px', background: 'rgba(239,68,68,.12)', color: '#ff8f8f', border: '1px solid rgba(239,68,68,.22)', borderRadius: 6 }}>Stornata</span>
    }
    if (statoPn === 'storno') {
      return <span className="bdg" style={{ fontSize: '.68rem', padding: '2px 6px', background: 'rgba(59,130,246,.12)', color: '#60a5fa', border: '1px solid rgba(59,130,246,.22)', borderRadius: 6 }}>Storno</span>
    }
    if (statoPn === 'annullata') {
      return <span className="bdg bdg-gray" style={{ fontSize: '.68rem', padding: '2px 6px' }}>Annullata</span>
    }
    if (statoQuad === 'non_quadrata') {
      return (
        <span
          className="bdg"
          style={{
            fontSize: '.68rem',
            padding: '2px 6px',
            background: 'rgba(239,68,68,.15)',
            color: '#ff8f8f',
            border: '1px solid rgba(239,68,68,.3)',
            borderRadius: 6,
          }}
        >
          Non quadrata
        </span>
      )
    }
    if (statoPn === 'provvisoria' || statoPn === 'da_verificare') {
      return (
        <span
          className="bdg"
          style={{
            fontSize: '.68rem',
            padding: '2px 6px',
            background: 'rgba(232,146,42,.15)',
            color: '#ffb054',
            border: '1px solid rgba(232,146,42,.3)',
            borderRadius: 6,
          }}
        >
          Da verificare
        </span>
      )
    }
    return (
      <span
        className="bdg"
        style={{
          fontSize: '.68rem',
          padding: '2px 6px',
          background: 'rgba(34,197,94,.15)',
          color: '#8be28e',
          border: '1px solid rgba(34,197,94,.3)',
          borderRadius: 6,
        }}
      >
        Registrata
      </span>
    )
  }

  return (
    <div
      style={{
        padding: 0,
        overflow: 'hidden',
        marginBottom: '.85rem',
        borderRadius: 18,
        border: '1px solid rgba(96,165,250,.1)',
        background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))',
        boxShadow: '0 18px 40px rgba(0,0,0,.13)',
      }}
    >
      <div className="card-hdr" style={{ alignItems: 'center', gap: '.8rem', padding: '.65rem .85rem .12rem' }}>
        <div>
          <div className="card-title">Risultati ricerca</div>
          <div className="card-subtitle">{isCompact ? 'Vista compatta' : 'Vista completa con dettagli fiscali'}</div>
          {note ? <div className="card-subtitle" style={{ marginTop: '.2rem' }}>{note}</div> : null}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '.4rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button type="button" className={compactMode === 'compact' ? 'btn' : 'btn-sec'} onClick={() => onToggleCompact?.('compact')}>
            Vista compatta
          </button>
          <button type="button" className={compactMode === 'full' ? 'btn' : 'btn-sec'} onClick={() => onToggleCompact?.('full')}>
            Vista completa
          </button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', padding: '0.85rem' }}>
        <table
          className="tbl"
          style={{
            width: '100%',
            borderCollapse: 'separate',
            borderSpacing: '0 6px',
          }}
        >
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr style={{ background: 'transparent' }}>
              {renderHeader('Data reg.', 'dataRegistrazione')}
              {renderHeader('N. Prima Nota', 'numeroRegistrazione')}
              {isCompact ? null : renderHeader('Data doc.', 'dataDocumento')}
              {renderHeader(isCompact ? 'Documento' : 'Numero documento', 'numeroDocumento')}
              {renderHeader('Conto', 'contoCodice')}
              {isCompact ? null : renderHeader('Descrizione conto', 'contoDescrizione')}
              {renderHeader(isCompact ? 'Descrizione' : 'Descrizione riga', 'descrizioneRiga')}
              {isCompact ? null : renderHeader('Causale', 'causaleContabile')}
              {isCompact ? null : renderHeader('Causale IVA', 'causaleIva')}
              {renderHeader('Dare', 'dare', true)}
              {renderHeader('Avere', 'avere', true)}
              {renderHeader('Saldo progressivo', 'saldoProgressivo', true)}
              {isCompact ? null : renderHeader('Soggetto', 'soggetto')}
              <th style={{ background: 'transparent', border: 'none', padding: '.3rem .75rem' }}>Stato</th>
              {isCompact ? null : renderHeader('Registro IVA', 'registroIva')}
              {isCompact ? null : renderHeader('Protocollo IVA', 'protocolloIva')}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const saldo = Number(row.saldoProgressivo || 0)
              const saldoTone = saldo >= 0 ? '#8be28e' : '#ff8f8f'
              const isActive = selectedRowId === row.id

              const rowBg = isActive
                ? '#0E3A4A'
                : index % 2 === 0
                  ? 'rgba(255, 255, 255, .015)'
                  : 'rgba(255, 255, 255, .005)'

              const rowBorderColor = isActive
                ? 'rgba(13, 122, 140, .4)'
                : 'rgba(255, 255, 255, .035)'

              const tdStyle = (isFirst, isLast) => ({
                background: rowBg,
                borderTop: `1px solid ${rowBorderColor}`,
                borderBottom: `1px solid ${rowBorderColor}`,
                padding: '.52rem .75rem',
                verticalAlign: 'middle',
                transition: 'background .12s, border-color .12s',
                color: isActive ? '#fff' : 'var(--text)',
                ...(isFirst ? {
                  borderLeft: isActive ? '4px solid #E8922A' : `1px solid ${rowBorderColor}`,
                  borderTopLeftRadius: 8,
                  borderBottomLeftRadius: 8,
                } : {}),
                ...(isLast ? {
                  borderRight: `1px solid ${rowBorderColor}`,
                  borderTopRightRadius: 8,
                  borderBottomRightRadius: 8,
                } : {}),
              })

              return (
                <tr
                  key={row.id}
                  onClick={() => onRowClick?.(row, index)}
                  onDoubleClick={() => onRowDoubleClick?.(row, index)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={tdStyle(true, false)}>
                    <div style={{ fontSize: '.78rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.dataRegistrazione || '-'}</div>
                  </td>
                  <td style={tdStyle(false, false)}>
                    <span style={{ fontWeight: 700, fontFamily: 'monospace', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.numeroRegistrazione || '-'}</span>
                  </td>
                  {isCompact ? null : (
                    <td style={tdStyle(false, false)}>
                      <div style={{ fontSize: '.78rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.dataDocumento || '-'}</div>
                    </td>
                  )}
                  <td style={tdStyle(false, false)}>
                    <span style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.numeroDocumento || '-'}</span>
                  </td>
                  <td style={tdStyle(false, false)}>
                    <div style={{ fontWeight: 700 }}>{row.contoCodice || '-'}</div>
                    {isCompact ? (
                      <div style={{ fontSize: '.72rem', color: 'var(--mu)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {row.contoDescrizione || '-'}
                      </div>
                    ) : null}
                  </td>
                  {isCompact ? null : (
                    <td style={tdStyle(false, false)}>
                      <div style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.contoDescrizione || '-'}</div>
                    </td>
                  )}
                  <td style={tdStyle(false, false)}>
                    <div style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.descrizioneRiga || row.descrizione || '-'}</div>
                  </td>
                  {isCompact ? null : (
                    <td style={tdStyle(false, false)}>
                      <span className="bdg bdg-blue">{row.causaleContabile || '-'}</span>
                    </td>
                  )}
                  {isCompact ? null : (
                    <td style={tdStyle(false, false)}>
                      <div>{row.causaleIva || '-'}</div>
                    </td>
                  )}
                  <td className="tar" style={{ ...tdStyle(false, false), fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#1AA8BF' }}>
                    {row.dare > 0 ? fmt(row.dare) : '—'}
                  </td>
                  <td className="tar" style={{ ...tdStyle(false, false), fontWeight: 700, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', color: '#E8922A' }}>
                    {row.avere > 0 ? fmt(row.avere) : '—'}
                  </td>
                  <td className="tar" style={{ ...tdStyle(false, false), fontWeight: 800, color: isContoSelected ? saldoTone : 'var(--mu)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                    {isContoSelected ? (saldo >= 0 ? fmt(saldo) : `-${fmt(Math.abs(saldo))}`) : '—'}
                  </td>
                  {isCompact ? null : (
                    <td style={tdStyle(false, false)}>
                      <div style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.soggetto || '-'}</div>
                    </td>
                  )}
                  <td style={tdStyle(false, isCompact)}>
                    {renderStatoBadge(row)}
                  </td>
                  {isCompact ? null : (
                    <td style={tdStyle(false, false)}>
                      <div>{row.registroIva || '-'}</div>
                    </td>
                  )}
                  {isCompact ? null : (
                    <td style={tdStyle(false, true)}>
                      <div>{row.protocolloIva || '-'}</div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

    </div>
  )
}
