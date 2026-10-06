import { fmtCurrency } from '../../ui/formatters.js'
import { isMovementSelectableForMassActions } from './riconciliazioneMockSelectors.js'

const statusMap = {
  Pronta: 'bdg-gr',
  'Da dettagliare': 'bdg-gld',
  'Da abbinare': 'bdg-cy',
  Duplicata: 'bdg-rd',
  Bloccata: 'bdg-rd',
}

const reviewToneMap = {
  green: { color: '#8ee7b6', border: 'rgba(88, 182, 132, 0.23)' },
  amber: { color: '#ffd38c', border: 'rgba(219, 170, 80, 0.25)' },
  red: { color: '#ff9fb0', border: 'rgba(231, 99, 121, 0.22)' },
  blue: { color: '#9fd0ff', border: 'rgba(98, 154, 214, 0.24)' },
}

const rowColors = {
  Pronta: 'rgba(22, 41, 57, 0.92)',
  'Da dettagliare': 'rgba(43, 32, 10, 0.92)',
  'Da abbinare': 'rgba(17, 36, 58, 0.92)',
  Duplicata: 'rgba(59, 23, 31, 0.95)',
}

const columnsTemplate =
  '30px 88px 82px 82px minmax(220px, 1.55fr) minmax(120px, .9fr) 94px 94px 102px 82px 116px 106px 106px 84px 84px 108px 56px'

export default function RiconciliazioneWorkingTable({
  movements = [],
  selectedId,
  selectedIds = [],
  onSelectRow,
  onToggleMovement,
  onToggleAllVisible,
  allVisibleSelected,
  someVisibleSelected,
  onClearFilters,
  footer,
  hasImportedStatement = false,
  importParseStatus = '',
  importStatementStatus = '',
  onRestoreDemo,
  onLoadStatement,
  sourceFileName = '',
  sourceFileType = '',
}) {
  const visibleSelectableCount = movements.filter(isMovementSelectableForMassActions).length
  const selectedVisibleCount = selectedIds.filter((id) => movements.some((movement) => movement.id === id)).length
  const indeterminate = someVisibleSelected && !allVisibleSelected

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden', borderRadius: 18, minHeight: 500 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '.6rem',
          padding: '.28rem .55rem',
          background: 'rgba(7, 17, 30, 0.98)',
          borderBottom: '1px solid rgba(128, 153, 180, 0.14)',
          color: 'rgba(222, 234, 245, 0.82)',
          fontSize: '.62rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '.55rem' }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: '.4rem', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={allVisibleSelected}
              ref={(node) => {
                if (node) node.indeterminate = indeterminate
              }}
              onChange={onToggleAllVisible}
            />
            Seleziona visibili
          </label>
          <span className="bdg" style={{ background: 'rgba(14, 32, 54, 0.96)', color: '#bde8ff' }}>
            Visibili {movements.length}
          </span>
          <span className="bdg" style={{ background: 'rgba(14, 32, 54, 0.96)', color: '#8ee7b6' }}>
            Selezionate {selectedVisibleCount}
          </span>
          <span className="bdg" style={{ background: 'rgba(14, 32, 54, 0.96)', color: '#ffd38c' }}>
            Pronte {visibleSelectableCount}
          </span>
        </div>
        <div style={{ fontSize: '.66rem', color: 'rgba(210, 223, 237, 0.72)' }}>Righe filtrate e ordinate per priorita</div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columnsTemplate,
          gap: 0,
          padding: '.28rem .55rem',
          background: 'linear-gradient(180deg, rgba(11, 24, 41, 0.98) 0%, rgba(7, 17, 30, 0.98) 100%)',
          borderBottom: '1px solid rgba(128, 153, 180, 0.14)',
          fontSize: '.62rem',
          color: 'rgba(222, 234, 245, 0.76)',
          textTransform: 'uppercase',
          letterSpacing: '.05em',
        }}
      >
        {['', 'Stato', 'Data op.', 'Data valuta', 'Descrizione banca', 'Controparte', 'Entrata', 'Uscita', 'Match proposto', 'Confidence', 'Azione proposta', 'PN', 'Partitario', 'IVA cassa', 'Ritenuta', 'Esito / blocco', 'Azioni'].map((label) => (
          <div key={label} style={{ paddingRight: '.35rem' }} title={label === 'PN' ? 'PN proposta/collegata' : undefined}>
            {label}
          </div>
        ))}
      </div>

      {movements.length === 0 ? (
      <div style={{ padding: '1rem .85rem .85rem' }}>
        <div className="empty" style={{ margin: 0 }}>
          <div className="empty-ico">-</div>
          <div className="empty-t">Nessun movimento trovato</div>
          <div className="empty-s">
              {hasImportedStatement
                ? importParseStatus === 'parsed_unbalanced'
                  ? 'PDF letto, ma audit non quadrato al centesimo. Movimenti mantenuti per review.'
                  : importParseStatus === 'parsed_with_review'
                    ? 'PDF letto, ma richiede review operativa.'
                    : importParseStatus === 'failed_parse'
                      ? 'PDF letto, ma nessun movimento bancario riconosciuto con sufficiente affidabilita.'
                    : importParseStatus === 'needs_review'
                      ? 'PDF letto, ma nessun movimento bancario riconosciuto con sufficiente affidabilita.'
                      : 'File caricato. Parsing automatico non ancora disponibile per questo formato. Da elaborare con OCR/AI o mapping manuale.'
                : 'Prova a pulire i filtri o cambiare la ricerca.'}
          </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'center', marginTop: '1rem' }}>
              <button className="btn-sec" type="button" onClick={onClearFilters}>
                Pulisci filtri
              </button>
              {hasImportedStatement && onRestoreDemo ? (
                <button className="btn-sec" type="button" onClick={onRestoreDemo}>
                  Ripristina demo
                </button>
              ) : null}
              {hasImportedStatement && onLoadStatement ? (
                <button className="btn-sec" type="button" onClick={onLoadStatement}>
                  Carica altro file
                </button>
              ) : null}
              {hasImportedStatement ? (
                <button className="btn-sec" type="button" disabled>
                  Da elaborare con OCR/AI
                </button>
              ) : null}
              {hasImportedStatement ? (
                <button className="btn-sec" type="button" disabled>
                  Mapping manuale
                </button>
              ) : null}
            </div>
            {hasImportedStatement ? (
              <div style={{ marginTop: '1rem', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '.35rem', fontSize: '.68rem' }}>
                <span className="bdg bdg-cy">File {sourceFileName || '-'}</span>
                <span className="bdg bdg-cy">Tipo {sourceFileType || '-'}</span>
                <span className="bdg bdg-gld">Stato {importParseStatus || importStatementStatus || 'needs_review'}</span>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div>
          {movements.map((movement) => {
            const active = movement.id === selectedId
            const checked = selectedIds.includes(movement.id)
            return (
              <button
                key={movement.id}
                type="button"
                onClick={() => onSelectRow(movement.id)}
                style={{
                  display: 'grid',
                  width: '100%',
                  gridTemplateColumns: columnsTemplate,
                  alignItems: 'stretch',
                  gap: 0,
                  border: 'none',
                  borderTop: '1px solid rgba(122, 148, 175, 0.1)',
                  background: active ? 'rgba(22, 49, 74, 0.96)' : rowColors[movement.status] || 'rgba(9, 18, 30, 0.92)',
                  color: '#eef6ff',
                  textAlign: 'left',
                  cursor: 'pointer',
                  padding: 0,
                  outline: 'none',
                }}
              >
                <div style={{ padding: '.34rem .38rem' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      event.stopPropagation()
                      onToggleMovement(movement.id)
                    }}
                    onClick={(event) => event.stopPropagation()}
                  />
                </div>
                <div style={{ padding: '.34rem .34rem' }}>
                  <span className={'bdg ' + (statusMap[movement.status] || 'bdg')} style={{ whiteSpace: 'nowrap' }}>
                    {movement.status}
                  </span>
                  {movement.reviewLabel ? (
                    <div style={{ marginTop: '.18rem' }}>
                      <span
                        className="bdg"
                        style={{
                          background: 'rgba(14, 32, 54, 0.96)',
                          color: reviewToneMap[movement.reviewTone || 'amber'].color,
                          border: `1px solid ${reviewToneMap[movement.reviewTone || 'amber'].border}`,
                          fontSize: '.58rem',
                          padding: '.08rem .32rem',
                        }}
                      >
                        {movement.reviewLabel}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8' }}>{movement.dateOp}</div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8' }}>{movement.dateVal}</div>
                <div style={{ padding: '.34rem .36rem', fontWeight: 700, color: '#f5f8fc', fontSize: '.72rem', lineHeight: 1.1 }}>
                  {movement.description}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#d2deec', lineHeight: 1.1 }}>{movement.counterparty}</div>
                <div style={{ padding: '.34rem .32rem', fontWeight: 700, color: movement.entrata ? '#8ee7b6' : '#cbd8e6', fontSize: '.68rem' }}>
                  {movement.entrata ? fmtCurrency(movement.entrata) : '-'}
                </div>
                <div style={{ padding: '.34rem .32rem', fontWeight: 700, color: movement.uscita ? '#ff9fb0' : '#cbd8e6', fontSize: '.68rem' }}>
                  {movement.uscita ? fmtCurrency(movement.uscita) : '-'}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8', lineHeight: 1.1 }}>{movement.match}</div>
                <div style={{ padding: '.34rem .32rem', fontWeight: 800, color: '#9fd0ff', fontSize: '.68rem' }}>{movement.confidence}%</div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8', lineHeight: 1.1 }}>{movement.action}</div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8', lineHeight: 1.1 }} title={movement.pn === 'Da creare' ? 'PN proposta/collegata' : movement.pn}>
                  {movement.pn === 'Da creare' ? 'PN' : movement.pn}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8', lineHeight: 1.1 }}>{movement.partitario}</div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: movement.ivaCassa === 'Da sbloccare' ? '#ffd38c' : '#dce9f8' }}>
                  {movement.ivaCassa}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: movement.withholding === 'Da generare' ? '#ffd38c' : '#dce9f8' }}>
                  {movement.withholding}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: movement.esito === 'OK' ? '#8ee7b6' : '#ff9fb0', fontWeight: 700 }}>
                  {movement.esito}
                </div>
                <div style={{ padding: '.34rem .32rem', fontSize: '.68rem', color: '#dce9f8' }}>...</div>
              </button>
            )
          })}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '.75rem',
          padding: '.32rem .55rem',
          borderTop: '1px solid rgba(128, 153, 180, 0.14)',
          background: 'rgba(8, 18, 31, 0.94)',
          color: 'rgba(222, 234, 245, 0.82)',
          fontSize: '.64rem',
        }}
      >
        <div>
          Righe visualizzate: <strong style={{ color: '#eef6ff' }}>{footer.rows}</strong>
        </div>
        <div style={{ display: 'flex', gap: '.8rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span>
            Totale entrate: <strong style={{ color: '#8ee7b6' }}>{fmtCurrency(footer.totalEntrate)}</strong>
          </span>
          <span>
            Totale uscite: <strong style={{ color: '#ff9fb0' }}>{fmtCurrency(footer.totalUscite)}</strong>
          </span>
        </div>
      </div>
    </div>
  )
}

