import { CONSULTAZIONE_FILTER_DEFAULTS } from '../../domain/consultazione/consultazioneDefaults.js'

const ADVANCED_KEYS = [
  'dataDocumentoDa',
  'dataDocumentoA',
  'importoPreciso',
  'tolleranzaImporto',
  'importoDa',
  'importoA',
  'registroIva',
  'protocolloIva',
  'descrizioneRiga',
]

function isFilled(value) {
  return String(value ?? '').trim() !== ''
}

function countAdvanced(filters = {}) {
  return ADVANCED_KEYS.reduce((count, key) => {
    const current = filters?.[key]
    const fallback = CONSULTAZIONE_FILTER_DEFAULTS[key]
    return count + (isFilled(current) && String(current) !== String(fallback) ? 1 : 0)
  }, 0)
}

function Field({ label, children, span = 3 }) {
  return (
    <div className="fg" style={{ gridColumn: `span ${span}`, minWidth: 0, alignSelf: 'start' }}>
      <label style={{ marginBottom: '.1rem', fontSize: '.52rem', lineHeight: 1, letterSpacing: '.07em', whiteSpace: 'nowrap' }}>{label}</label>
      {children}
    </div>
  )
}

function resolveOptionValue(item) {
  if (item == null) return ''
  if (typeof item === 'string' || typeof item === 'number') return String(item)
  return String(item.codice ?? item.code ?? item.id ?? item.value ?? item.sigla ?? '').trim()
}

function resolveOptionLabel(item) {
  if (item == null) return ''
  if (typeof item === 'string' || typeof item === 'number') return String(item)
  const code = String(item.codice ?? item.code ?? item.id ?? item.value ?? item.sigla ?? '').trim()
  const label = String(item.descrizione ?? item.description ?? item.denominazione ?? item.nome ?? '').trim()
  if (!code && !label) return ''
  if (!code) return label
  if (!label || label === code) return code
  return `${code} - ${label}`
}

function AdvancedGroup({ title, subtitle, children }) {
  return (
    <div
      style={{
        background: 'rgba(255,255,255,.025)',
        border: '1px solid var(--bd)',
        borderRadius: 14,
        padding: '.58rem',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.02)',
      }}
    >
      <div className="card-title" style={{ fontSize: '.78rem', marginBottom: '.1rem' }}>
        {title}
      </div>
      {subtitle ? <div className="card-subtitle" style={{ marginBottom: '.36rem' }}>{subtitle}</div> : null}
      <div style={{ display: 'grid', gap: '.42rem' }}>{children}</div>
    </div>
  )
}

export function ConsultazioneFiltersPanel({
  filters,
  onChange,
  onReset,
  onSearch,
  advancedOpen,
  onToggleAdvanced,
  esercizi = [],
  causaliContabili = [],
  causaliIva = [],
}) {
  const advancedCount = countAdvanced(filters)
  const hasAdvancedActive = advancedCount > 0
  const contabiliOptions = Array.isArray(causaliContabili) ? causaliContabili : []
  const ivaOptions = Array.isArray(causaliIva) ? causaliIva : []
  const controlStyle = { fontSize: '.76rem', padding: '.34rem .45rem', minHeight: 32 }
  const setField = (field) => (event) => onChange(field, event?.target?.value ?? '')
  const handleEnter = (event) => {
    if (event?.key === 'Enter') {
      event.preventDefault()
      onSearch?.()
    }
  }

  return (
    <div
      style={{
        marginBottom: '.9rem',
        overflow: 'hidden',
        borderRadius: 18,
        border: '1px solid rgba(96,165,250,.1)',
        background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))',
        boxShadow: '0 18px 40px rgba(0,0,0,.13)',
      }}
    >
        <div className="card-hdr" style={{ alignItems: 'center', gap: '.72rem', padding: '.64rem .8rem .12rem' }}>
        <div style={{ minWidth: 0 }}>
          <div className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '.55rem', flexWrap: 'wrap' }}>
            Ricerca
            {hasAdvancedActive ? <span className="bdg bdg-yellow">{advancedCount} avanzati attivi</span> : null}
          </div>
          <div className="card-subtitle">Ricerca su prima nota e saldo progressivo, con base dati centrata sulle scritture.</div>
        </div>
        <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn-sec" type="button" onClick={onToggleAdvanced}>
            {advancedOpen ? 'Nascondi avanzati' : 'Mostra avanzati'}
          </button>
          <button className="btn-sec" type="button" onClick={onReset}>
            Pulisci filtri
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(13, minmax(0, 1fr))', gap: '.38rem', padding: '.44rem .74rem .66rem' }}>
        <Field label="Esercizio" span={1}>
          <select value={filters.esercizio} onChange={setField('esercizio')} onKeyDown={handleEnter} style={controlStyle}>
            <option value="">Tutti</option>
            {esercizi.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Data registrazione da" span={2}>
          <input type="date" value={filters.dataRegistrazioneDa} onChange={setField('dataRegistrazioneDa')} onKeyDown={handleEnter} style={controlStyle} />
        </Field>
        <Field label="Data registrazione a" span={2}>
          <input type="date" value={filters.dataRegistrazioneA} onChange={setField('dataRegistrazioneA')} onKeyDown={handleEnter} style={controlStyle} />
        </Field>
        <Field label="Conto" span={2}>
          <input value={filters.conto} onChange={setField('conto')} onKeyDown={handleEnter} placeholder="Codice, descrizione o id" style={controlStyle} />
        </Field>
        <Field label="Soggetto" span={2}>
          <input value={filters.soggetto} onChange={setField('soggetto')} onKeyDown={handleEnter} placeholder="Cliente, fornitore o soggetto" style={controlStyle} />
        </Field>
        <Field label="Numero documento" span={2}>
          <input value={filters.numeroDocumento} onChange={setField('numeroDocumento')} onKeyDown={handleEnter} style={controlStyle} />
        </Field>
        <Field label="Cerca" span={1}>
          <input value={filters.testoLibero} onChange={setField('testoLibero')} onKeyDown={handleEnter} placeholder="Testo libero..." style={controlStyle} />
        </Field>
        <div style={{ gridColumn: 'span 1', display: 'flex', alignItems: 'end' }}>
          <button
            className="btn"
            type="button"
            onClick={onSearch || onReset}
            style={{
              width: '100%',
              justifyContent: 'center',
              background: 'linear-gradient(180deg, #58c96a, #39a34c)',
              borderColor: 'rgba(64, 181, 88, .7)',
              color: '#f6fff6',
              boxShadow: '0 8px 18px rgba(40, 120, 52, .2)',
              paddingInline: '.72rem',
            }}
          >
            Cerca
          </button>
        </div>

        <Field label="Causale contabile" span={3}>
          <select value={filters.causaleContabile} onChange={setField('causaleContabile')} onKeyDown={handleEnter} style={controlStyle}>
            <option value="">Tutte</option>
            {contabiliOptions.map((item) => {
              const value = resolveOptionValue(item)
              if (!value) return null
              return (
                <option key={value} value={value}>
                  {resolveOptionLabel(item) || value}
                </option>
              )
            })}
          </select>
        </Field>
        <Field label="Causale IVA" span={3}>
          <select value={filters.causaleIva} onChange={setField('causaleIva')} onKeyDown={handleEnter} style={controlStyle}>
            <option value="">Tutte</option>
            {ivaOptions.map((item) => {
              const value = resolveOptionValue(item)
              if (!value) return null
              return (
                <option key={value} value={value}>
                  {resolveOptionLabel(item) || value}
                </option>
              )
            })}
          </select>
        </Field>
        <Field label="Stato quadratura" span={3}>
          <select value={filters.statoQuadratura} onChange={setField('statoQuadratura')} style={controlStyle}>
            <option value="tutti">Tutti</option>
            <option value="quadrata">Quadrata</option>
            <option value="non_quadrata">Non quadrata</option>
          </select>
        </Field>
        <div className="fg" style={{ gridColumn: 'span 4', display: 'flex', flexDirection: 'column', gap: '.3rem', alignSelf: 'center', marginTop: '.3rem' }}>
          <label style={{ fontSize: '.52rem', lineHeight: 1, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--mu)', marginBottom: '1px' }}>
            Tipo Scritture in Ricerca
          </label>
          <div style={{ display: 'flex', gap: '.85rem', alignItems: 'center' }}>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.35rem',
                fontSize: '.72rem',
                color: '#fff',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={filters.tipoScrittureOrdinarie}
                onChange={(e) => onChange('tipoScrittureOrdinarie', e.target.checked)}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: filters.tipoScrittureOrdinarie
                    ? '2.5px solid var(--gold)'
                    : '2.5px solid var(--bd)',
                  background: filters.tipoScrittureOrdinarie
                    ? 'rgba(232, 146, 42, 0.15)'
                    : 'transparent',
                  boxShadow: filters.tipoScrittureOrdinarie
                    ? '0 0 6px rgba(232, 146, 42, 0.4)'
                    : 'none',
                  transition: 'all 0.15s ease-in-out',
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ color: filters.tipoScrittureOrdinarie ? '#fff' : 'var(--mu)', fontWeight: 600 }}>
                Ordinarie
              </span>
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.35rem',
                fontSize: '.72rem',
                color: '#fff',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={filters.tipoScrittureStornate}
                onChange={(e) => onChange('tipoScrittureStornate', e.target.checked)}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: filters.tipoScrittureStornate
                    ? '2.5px solid var(--gold)'
                    : '2.5px solid var(--bd)',
                  background: filters.tipoScrittureStornate
                    ? 'rgba(232, 146, 42, 0.15)'
                    : 'transparent',
                  boxShadow: filters.tipoScrittureStornate
                    ? '0 0 6px rgba(232, 146, 42, 0.4)'
                    : 'none',
                  transition: 'all 0.15s ease-in-out',
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ color: filters.tipoScrittureStornate ? '#fff' : 'var(--mu)', fontWeight: 600 }}>
                Stornate
              </span>
            </label>
            <label
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '.35rem',
                fontSize: '.72rem',
                color: '#fff',
                cursor: 'pointer',
                userSelect: 'none',
              }}
            >
              <input
                type="checkbox"
                checked={filters.tipoScrittureSimulate}
                onChange={(e) => onChange('tipoScrittureSimulate', e.target.checked)}
                style={{
                  position: 'absolute',
                  opacity: 0,
                  width: 0,
                  height: 0,
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  border: filters.tipoScrittureSimulate
                    ? '2.5px solid var(--gold)'
                    : '2.5px solid var(--bd)',
                  background: filters.tipoScrittureSimulate
                    ? 'rgba(232, 146, 42, 0.15)'
                    : 'transparent',
                  boxShadow: filters.tipoScrittureSimulate
                    ? '0 0 6px rgba(232, 146, 42, 0.4)'
                    : 'none',
                  transition: 'all 0.15s ease-in-out',
                  display: 'inline-block',
                  boxSizing: 'border-box',
                }}
              />
              <span style={{ color: filters.tipoScrittureSimulate ? '#fff' : 'var(--mu)', fontWeight: 600 }}>
                Simulate
              </span>
            </label>
          </div>
        </div>
        {advancedOpen ? (
          <div style={{ gridColumn: '1 / -1', marginTop: '.1rem' }}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(12, minmax(0, 1fr))',
                gap: '.42rem',
                paddingTop: '.52rem',
                borderTop: '1px solid rgba(96,165,250,.1)',
              }}
            >
              <div style={{ gridColumn: 'span 3' }}>
                <AdvancedGroup title="A. Documento" subtitle="Data documento e riferimenti fiscali.">
                  <Field label="Data documento da" span={12}>
                    <input type="date" value={filters.dataDocumentoDa} onChange={setField('dataDocumentoDa')} style={controlStyle} />
                  </Field>
                  <Field label="Data documento a" span={12}>
                    <input type="date" value={filters.dataDocumentoA} onChange={setField('dataDocumentoA')} style={controlStyle} />
                  </Field>
                </AdvancedGroup>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <AdvancedGroup title="B. Importo" subtitle="Filtri numerici sulla base imponibile.">
                  <Field label="Importo preciso" span={12}>
                    <input type="number" step="0.01" value={filters.importoPreciso} onChange={setField('importoPreciso')} style={controlStyle} />
                  </Field>
                  <Field label="Tolleranza +/-" span={12}>
                    <input type="number" step="0.01" value={filters.tolleranzaImporto} onChange={setField('tolleranzaImporto')} style={controlStyle} />
                  </Field>
                  <Field label="Importo da" span={12}>
                    <input type="number" step="0.01" value={filters.importoDa} onChange={setField('importoDa')} style={controlStyle} />
                  </Field>
                  <Field label="Importo a" span={12}>
                    <input type="number" step="0.01" value={filters.importoA} onChange={setField('importoA')} style={controlStyle} />
                  </Field>
                </AdvancedGroup>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <AdvancedGroup title="C. IVA" subtitle="Registro e protocollo IVA.">
                  <Field label="Registro IVA" span={12}>
                    <input value={filters.registroIva} onChange={setField('registroIva')} placeholder="Registro" style={controlStyle} />
                  </Field>
                  <Field label="Protocollo IVA" span={12}>
                    <input value={filters.protocolloIva} onChange={setField('protocolloIva')} placeholder="Protocollo" style={controlStyle} />
                  </Field>
                </AdvancedGroup>
              </div>
              <div style={{ gridColumn: 'span 3' }}>
                <AdvancedGroup title="D. Testo / Soggetto" subtitle="Ricerca libera su contenuto e descrizione.">
                  <Field label="Testo libero" span={12}>
                    <input value={filters.testoLibero} onChange={setField('testoLibero')} placeholder="Testo libero / Descrizione..." style={controlStyle} />
                  </Field>
                  <Field label="Descrizione riga" span={12}>
                    <input value={filters.descrizioneRiga} onChange={setField('descrizioneRiga')} placeholder="Descrizione riga" style={controlStyle} />
                  </Field>
                </AdvancedGroup>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {hasAdvancedActive ? (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 .95rem .95rem', gap: '.75rem', flexWrap: 'wrap' }}>
          <div className="card-subtitle">I filtri si applicano progressivamente sulla consultazione corrente.</div>
          <div className="card-subtitle">Filtri avanzati attivi: {advancedCount}</div>
        </div>
      ) : null}
    </div>
  )
}
