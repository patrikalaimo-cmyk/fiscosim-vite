import { REG_CARD_STYLE, REG_INPUT_STYLE, REG_LABEL_STYLE, REG_SECTION_TITLE_STYLE, formatMoney, formatShortDate } from './registrazioneUi.js'

function toAmount(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function Field({ label, span = 1, children, dataRegKey = '' }) {
  return (
    <div className="fg" style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <label style={REG_LABEL_STYLE}>{label}</label>
      <div data-reg-key={dataRegKey}>{children}</div>
    </div>
  )
}

function Row({ row, active = false, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(row)}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: '20px minmax(140px, 1.1fr) 98px 88px 88px 98px 88px 60px',
        gap: '.32rem',
        alignItems: 'center',
        textAlign: 'left',
        padding: '.32rem .34rem',
        borderRadius: 12,
        border: active ? '1px solid rgba(255,208,92,.45)' : '1px solid rgba(136,169,204,.12)',
        background: active ? 'rgba(255,208,92,.08)' : 'rgba(255,255,255,.012)',
        color: 'var(--tx)',
      }}
    >
      <span style={{ fontSize: '.7rem' }}>{active ? '●' : '○'}</span>
      <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.numeroDocumento || '—'}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{formatShortDate(row.dataDocumento)}</span>
      <span style={{ whiteSpace: 'nowrap' }}>{row.tipoDocumento || '—'}</span>
      <span style={{ color: 'rgba(188,204,226,.88)', whiteSpace: 'nowrap' }}>{formatMoney(row.importoOriginario || 0)}</span>
      <span style={{ color: 'rgba(188,204,226,.88)', whiteSpace: 'nowrap' }}>{formatMoney(row.importoAperto || row.importoChiusura || 0)}</span>
      <span style={{ color: row.residuo < 0 ? '#ff8f8f' : '#8be28e', whiteSpace: 'nowrap' }}>{formatMoney(row.residuo || 0)}</span>
      <span style={{ fontWeight: 800, color: row.segno === 'D' ? '#ff8f8f' : '#8be28e' }}>{row.segno || 'A'}</span>
    </button>
  )
}

export function RegistrazionePartitarioPanel({
  partitarioData,
  partite = [],
  header = {},
  selectedCausale = null,
  onChange,
  onApplySelected,
  focusOrder = null,
  disabled = false,
  behavior = null,
  validation = null,
  draft = null,
}) {
  const setField = (field, { manualOverride = false } = {}) => (event) => {
    const value = event?.target?.value ?? ''
    onChange?.(field, value)
    if (manualOverride) {
      onChange?.(field === 'importoAperto' ? 'manualImportoApertoOverride' : 'manualImportoChiusuraOverride', true)
    }
  }
  const active = Boolean(behavior?.showPartitario)
  const list = Array.isArray(draft?.rows) && draft.rows.length ? draft.rows : Array.isArray(partite) ? partite : []
  const selectedId = String(partitarioData?.selectedPartitaId || draft?.selectedPartitaId || '').trim()
  const mode = draft?.mode || draft?.tipoMovimento || partitarioData?.tipoMovimento || behavior?.partitarioMode || 'none'
  const isApertura = mode === 'apertura'
  const isChiusura = mode === 'chiusura'
  const headerTotal = toAmount(header?.totaleDocumento || header?.totale_documento || '')
  const selectedCausaleTipo = String(selectedCausale?.tipoDocumento || selectedCausale?.tipo_documento || '').trim()
  const importoOriginario =
    isApertura
      ? (toAmount(draft?.importoOriginario) || headerTotal || toAmount(partitarioData?.importoOrigine) || 0)
      : (toAmount(draft?.importoOriginario) || toAmount(partitarioData?.importoOrigine) || 0)
  const importoAperto =
    isApertura
      ? (toAmount(draft?.importoAperto) || headerTotal || toAmount(partitarioData?.importoAperto) || 0)
      : (toAmount(draft?.importoAperto) || toAmount(partitarioData?.importoAperto) || 0)
  const importoChiusura = toAmount(draft?.importoChiusura ?? partitarioData?.importoChiusura ?? '')
  const residuo =
    isApertura
      ? (toAmount(draft?.residuo) || headerTotal || toAmount(partitarioData?.saldoResiduo) || 0)
      : (toAmount(draft?.residuo) || toAmount(partitarioData?.saldoResiduo) || 0)
  const modeLabel = isApertura ? 'Apertura' : isChiusura ? 'Chiusura' : 'Nessuno'
  let tipoDocumentoValue = draft?.tipoDocumento || partitarioData?.tipoDocumento || header?.tipoDocumento || selectedCausaleTipo || ''
  if (!tipoDocumentoValue) {
    const selectedCode = String(selectedCausale?.codice || selectedCausale?.code || selectedCausale?.id || '').trim().toUpperCase()
    if (selectedCode.startsWith('NC') || selectedCode.includes('NOTACREDITO')) tipoDocumentoValue = 'NC'
    else if (selectedCode.startsWith('FF') || selectedCode.startsWith('FT') || selectedCode.includes('FATTURA')) tipoDocumentoValue = 'FT'
  }
  const microcopy = isApertura
    ? 'Partitario predisposto. L apertura reale sara collegata in fase successiva.'
    : isChiusura
      ? 'Chiusura partita predisposta. La chiusura reale non viene ancora scritta.'
      : 'Partitario non attivo per la causale selezionata.'

  return (
    <div className="erp-flat-panel" style={{ padding: '.8rem .9rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.5rem' }}>
        <div style={{ display: 'grid', gap: '.08rem', minWidth: 0 }}>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)' }}>Movimenti partitario</div>
          <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.7)' }}>{microcopy}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className={`bdg ${isApertura || isChiusura ? 'bdg-green' : 'bdg-blue'}`} style={{ fontSize: '.64rem', padding: '.2rem .45rem' }}>{modeLabel}</span>
          <span className="bdg bdg-gold" style={{ fontSize: '.64rem', padding: '.2rem .45rem' }}>{list.length || 0} righe</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: '.5rem' }}>
        <div style={{ minWidth: 960, display: 'grid', gap: '.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, .8fr) minmax(160px, 1.25fr) 104px 96px 88px 96px 90px 72px 74px', gap: '.28rem', fontSize: '.58rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
            <span>Tipo mov.</span>
            <span>Soggetto</span>
            <span>N. documento</span>
            <span>Data doc.</span>
            <span>Tipo doc.</span>
            <span>Importo ori.</span>
            <span>Importo</span>
            <span>Residuo</span>
            <span>Stato</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, .8fr) minmax(160px, 1.25fr) 104px 96px 88px 96px 90px 72px 74px', gap: '.28rem', alignItems: 'stretch' }}>
            <div style={{ ...REG_INPUT_STYLE, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, color: 'rgba(236,244,255,.94)', background: 'rgba(255,255,255,.02)' }}>
              {modeLabel}
            </div>
            <input value={draft?.soggettoNome || header?.clienteFornitoreNome || header?.soggetto || ''} disabled placeholder="Soggetto selezionato" style={REG_INPUT_STYLE} />
            <input value={draft?.numeroDocumento || partitarioData?.numeroDocumento || header?.numeroDocumento || ''} onChange={setField('numeroDocumento')} disabled={disabled} placeholder="N. documento" style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioNumeroDocumento" />
            <input type="date" value={draft?.dataDocumento || partitarioData?.dataDocumento || header?.dataDocumento || header?.dataRegistrazione || ''} onChange={setField('dataDocumento')} disabled={disabled} style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioDataDocumento" />
            <input value={tipoDocumentoValue} onChange={setField('tipoDocumento')} disabled={disabled} placeholder="FT / NC" style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioTipoDocumento" />
            <input value={formatMoney(importoOriginario || 0)} disabled placeholder="0,00" style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioImportoOrigine" />
            <input
              value={isApertura ? importoAperto : importoChiusura}
              onChange={setField(isApertura ? 'importoAperto' : 'importoChiusura', { manualOverride: true })}
              disabled={disabled}
              placeholder="0,00"
              style={REG_INPUT_STYLE}
              data-reg-focusable="true"
              data-reg-key={isApertura ? 'partitarioImportoAperto' : 'partitarioImporto'}
              data-reg-next={focusOrder?.nextByKey?.partitarioImporto || 'rowsConto'}
            />
            <input value={formatMoney(residuo || 0)} disabled placeholder="0,00" style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioResiduo" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid rgba(136,169,204,.12)', background: 'rgba(255,255,255,.02)', fontSize: '.67rem', fontWeight: 800, color: 'rgba(188,204,226,.9)' }}>{draft?.stato || partitarioData?.stato || 'predisposto'}</div>
          </div>
        </div>
      </div>

      {isChiusura ? (
        <>
          <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.68)', marginBottom: '.4rem' }}>
            {validation?.info?.length ? validation.info.join(' · ') : 'Partite aperte non ancora collegate al read model reale'}
          </div>
          <div style={{ display: 'grid', gap: '.32rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '20px minmax(140px, 1.2fr) 92px 72px 92px 92px 54px', gap: '.35rem', fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.08em' }}>
              <span />
              <span>N. documento</span>
              <span>Data</span>
              <span>Tipo</span>
              <span>Saldo residuo</span>
              <span>Imp. chiusura</span>
              <span>Segno</span>
            </div>
            {list.length ? (
              list.map((row, idx) => (
                <Row key={row.id || idx} row={row} active={String(row?.id || '').trim() === selectedId} onSelect={(selected) => onApplySelected?.(selected)} />
              ))
            ) : (
              <div style={{ padding: '.7rem .4rem', color: 'rgba(188,204,226,.76)', fontSize: '.68rem' }}>
                Partite aperte non ancora collegate al read model reale.
              </div>
            )}
          </div>
          {list.length ? (
            <button
              type="button"
              className="btn-sec"
              style={{ width: '100%', marginTop: '.55rem', padding: '.42rem .7rem' }}
              onClick={() => onApplySelected?.(list.find((item) => String(item?.id || '').trim() === selectedId) || list[0] || null)}
            >
              Applica selezionata (F9)
            </button>
          ) : null}
        </>
      ) : isApertura ? null : (
        <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.68)', marginTop: '.45rem' }}>
          Nessuna modalità partitario attiva per la causale selezionata.
        </div>
      )}

      {active && draft?.validation?.info?.length ? (
        <div style={{ marginTop: '.45rem', fontSize: '.65rem', color: 'rgba(188,204,226,.72)' }}>
          {draft.validation.info.join(' · ')}
        </div>
      ) : null}
    </div>
  )
}
