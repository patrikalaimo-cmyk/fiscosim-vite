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
  compact = true,
  loading = false,
  pagination = null,
  note = '',
  compactMode = 'compact',
  onToggleCompact,
  onPageSizeChange,
  onDetail,
  onEdit,
  onReverse,
  onOpenPartitario,
  readOnlyMessage = 'Modifica/storno non disponibili da Consultazione. Usa il flusso canonico di registrazione/commit atomico.',
}) {
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

  const pageItems = pagination ? buildPageItems(pagination.page, pagination.totalPages, 5) : []
  const isCompact = compactMode === 'compact' || compact

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

      <div style={{ overflow: 'auto' }}>
        <table className="tbl" style={{ minWidth: isCompact ? 1280 : 1760, fontSize: '.75rem', lineHeight: 1.15 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
            <tr>
              <th>Data registrazione</th>
              {isCompact ? null : <th>Data documento</th>}
              <th>{isCompact ? 'Documento' : 'Numero documento'}</th>
              <th>Conto</th>
              {isCompact ? null : <th>Descrizione conto</th>}
              <th>{isCompact ? 'Descrizione' : 'Descrizione riga'}</th>
              {isCompact ? null : <th>Causale</th>}
              {isCompact ? null : <th>Causale IVA</th>}
              <th className="tar">Dare</th>
              <th className="tar">Avere</th>
              <th className="tar">Saldo progressivo</th>
              {isCompact ? null : <th>Soggetto</th>}
              {isCompact ? null : <th>Stato quadratura</th>}
              {isCompact ? null : <th>Registro IVA</th>}
              {isCompact ? null : <th>Protocollo IVA</th>}
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const saldo = Number(row.saldoProgressivo || 0)
              const saldoTone = saldo >= 0 ? 'var(--gr)' : 'var(--rd)'
              return (
                <tr key={row.id}>
                  <td style={{ fontSize: '.78rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.dataRegistrazione || '-'}</td>
                  {isCompact ? null : <td style={{ fontSize: '.78rem', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.dataDocumento || '-'}</td>}
                  <td style={{ fontFamily: 'monospace', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{row.numeroDocumento || '-'}</td>
                  <td>
                    <div style={{ fontWeight: 700 }}>{row.contoCodice || '-'}</div>
                    <div style={{ fontSize: '.72rem', color: 'var(--mu)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {row.contoDescrizione || '-'}
                    </div>
                  </td>
                  {isCompact ? null : <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.contoDescrizione || '-'}</td>}
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.descrizioneRiga || row.descrizione || '-'}</td>
                  {isCompact ? null : (
                    <td>
                      <span className="bdg bdg-blue">{row.causaleContabile || '-'}</span>
                    </td>
                  )}
                  {isCompact ? null : <td>{row.causaleIva || '-'}</td>}
                  <td className="tar" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(row.dare)}
                  </td>
                  <td className="tar" style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>
                    {fmt(row.avere)}
                  </td>
                  <td className="tar" style={{ fontWeight: 800, color: saldoTone, whiteSpace: 'nowrap' }}>
                    {saldo >= 0 ? fmt(saldo) : `-${fmt(Math.abs(saldo))}`}
                  </td>
                  {isCompact ? null : <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.soggetto || '-'}</td>}
                  {isCompact ? null : <td>{row.statoQuadratura || '-'}</td>}
                  {isCompact ? null : <td>{row.registroIva || '-'}</td>}
                  {isCompact ? null : <td>{row.protocolloIva || '-'}</td>}
                  <td>
                    <CellActions
                      row={row}
                      onDetail={onDetail}
                      onEdit={onEdit}
                      onReverse={onReverse}
                      onOpenPartitario={onOpenPartitario}
                      readOnlyMessage={readOnlyMessage}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <div
          className="card-hdr"
          style={{
            borderTop: '1px solid rgba(96,165,250,.1)',
            alignItems: 'center',
            gap: '.5rem',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            padding: '.55rem .85rem .72rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap' }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem', color: 'var(--mu)' }}>
              Righe/pagina
              <select value={pagination.pageSize} onChange={(e) => onPageSizeChange?.(e.target.value)}>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
            </label>
            <div className="card-subtitle">
              {pagination.rangeLabel || `Pagina ${pagination.page} di ${pagination.totalPages}`}
              {pagination.totalRows ? ` | ${pagination.totalRows} risultati` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '.3rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn-sec" type="button" onClick={() => pagination.onPageChange?.(pagination.page - 1)} disabled={!pagination.canPrevious}>
              Precedente
            </button>
            {pageItems.map((item) => (
              <button
                key={item}
                type="button"
                className="btn-sec"
                onClick={() => pagination.onPageChange?.(item)}
                style={{
                  minWidth: 36,
                  paddingInline: '.65rem',
                  background: item === pagination.page ? 'rgba(255,255,255,.14)' : undefined,
                  boxShadow: item === pagination.page ? 'inset 0 0 0 1px rgba(255,255,255,.12)' : undefined,
                }}
              >
                {item}
              </button>
            ))}
            <button className="btn-sec" type="button" onClick={() => pagination.onPageChange?.(pagination.page + 1)} disabled={!pagination.canNext}>
              Successiva
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
