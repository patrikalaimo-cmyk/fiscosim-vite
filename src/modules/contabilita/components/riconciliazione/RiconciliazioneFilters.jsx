const shellStyle = {
  padding: '.35rem .55rem',
  borderRadius: 14,
  border: '1px solid rgba(127, 154, 182, 0.16)',
  background: 'rgba(7, 18, 31, 0.93)',
}

const fieldStyle = {
  width: '100%',
  minHeight: 26,
  padding: '0 .5rem',
  borderRadius: 10,
  border: '1px solid rgba(150, 180, 208, 0.14)',
  background: 'rgba(16, 31, 49, 0.9)',
  color: '#dce8f5',
  fontSize: '.66rem',
  outline: 'none',
}

const toggleStyle = (active) => ({
  minHeight: 26,
  padding: '0 .55rem',
  borderRadius: 999,
  border: `1px solid ${active ? 'rgba(79, 185, 255, 0.45)' : 'rgba(150, 180, 208, 0.14)'}`,
  background: active ? 'rgba(20, 58, 90, 0.95)' : 'rgba(16, 31, 49, 0.9)',
  color: active ? '#d5efff' : '#dce8f5',
  fontSize: '.64rem',
  cursor: 'pointer',
})

export default function RiconciliazioneFilters({
  filters,
  onChange,
  advancedOpen,
  onToggleAdvanced,
  onClearFilters,
}) {
  return (
    <div style={shellStyle}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.7fr .9fr .9fr .9fr .95fr repeat(4, auto) auto auto',
          gap: '.3rem',
          alignItems: 'center',
        }}
      >
        <input
          value={filters.search}
          onChange={(event) => onChange({ search: event.target.value })}
          placeholder="Ricerca movimenti"
          style={fieldStyle}
        />

        <select value={filters.status} onChange={(event) => onChange({ status: event.target.value })} style={fieldStyle}>
          <option value="all">Stato</option>
          <option value="pronta">Pronta</option>
          <option value="da dettagliare">Da dettagliare</option>
          <option value="da abbinare">Da abbinare</option>
          <option value="duplicata">Duplicata</option>
          <option value="bloccata">Bloccata</option>
        </select>

        <select value={filters.direction} onChange={(event) => onChange({ direction: event.target.value })} style={fieldStyle}>
          <option value="all">Entrate/Uscite</option>
          <option value="entrata">Entrate</option>
          <option value="uscita">Uscite</option>
        </select>

        <select value={filters.confidence} onChange={(event) => onChange({ confidence: event.target.value })} style={fieldStyle}>
          <option value="all">Confidence</option>
          <option value="high">Alta</option>
          <option value="medium">Media</option>
          <option value="low">Bassa</option>
        </select>

        <select value={filters.kind} onChange={(event) => onChange({ kind: event.target.value })} style={fieldStyle}>
          <option value="all">Tipo movimento</option>
          <option value="incasso">Incasso cliente</option>
          <option value="fornitore">Pagamento fornitore</option>
          <option value="parcella">Parcella</option>
          <option value="commissioni">Commissioni bancarie</option>
          <option value="f24">F24</option>
          <option value="giroconto">Giroconto</option>
          <option value="iva_cassa">IVA per cassa</option>
          <option value="ritenute">Ritenute</option>
          <option value="altro">Altro</option>
        </select>

        <button type="button" style={toggleStyle(filters.ivaCassa)} onClick={() => onChange({ ivaCassa: !filters.ivaCassa })}>
          IVA per cassa
        </button>
        <button type="button" style={toggleStyle(filters.withholding)} onClick={() => onChange({ withholding: !filters.withholding })}>
          Ritenute
        </button>
        <button type="button" style={toggleStyle(filters.f24)} onClick={() => onChange({ f24: !filters.f24 })}>
          F24
        </button>
        <button type="button" style={toggleStyle(filters.giroconti)} onClick={() => onChange({ giroconti: !filters.giroconti })}>
          Giroconti
        </button>

        <button className="btn-sec" type="button" onClick={onToggleAdvanced} style={{ minHeight: 26, padding: '0 .55rem' }}>
          {advancedOpen ? 'Nascondi filtri avanzati' : 'Filtri avanzati'}
        </button>

        <button className="btn-sec" type="button" onClick={onClearFilters} style={{ minHeight: 26, padding: '0 .55rem' }}>
          Pulisci filtri
        </button>
      </div>

      {advancedOpen && (
        <div
          style={{
            marginTop: '.3rem',
            display: 'grid',
            gap: '.3rem',
          }}
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem' }}>
            {[
              ['solo pronti', filters.onlyReady],
              ['solo bloccati', filters.onlyBlocked],
              ['solo senza match', filters.onlyWithoutMatch],
            ].map(([label, active]) => (
              <button
                key={label}
                type="button"
                onClick={() => onChange({ [label === 'solo pronti' ? 'onlyReady' : label === 'solo bloccati' ? 'onlyBlocked' : 'onlyWithoutMatch']: !active })}
                style={toggleStyle(Boolean(active))}
              >
                {label}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.3rem', fontSize: '.62rem', color: '#bde8ff' }}>
            {[
              'Data operazione da/a',
              'Data valuta da/a',
              'Importo da/a',
              'Banca/conto',
              'Causale bancaria',
              'Conto contabile proposto',
              'Partita aperta',
              'PN collegata',
              'Documento collegato',
              'decisionType',
              'cashVatImpact',
              'withholdingPaymentProposal',
            ].map((label) => (
              <span key={label} className="bdg bdg-cy" style={{ padding: '.14rem .38rem', background: 'rgba(10, 35, 52, 0.85)' }}>
                {label}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
