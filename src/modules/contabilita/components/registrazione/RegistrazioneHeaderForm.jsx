import { useEffect, useMemo, useState } from 'react'
import { REG_INPUT_STYLE, REG_LABEL_STYLE, REG_SECTION_TITLE_STYLE, formatMoney, resolveContoLabel } from './registrazioneUi.js'
import { findRegistrazioneCausaleExactMatch, resolveRegistrazioneCausaleLabel } from '../../application/registrazioneOperations/resolveRegistrazioneCausali.js'
import { buildRegistrazioneContropartiList } from '../../application/registrazioneOperations/resolveRegistrazioneControparti.js'
import { resolveRegistrazioneHeaderCounterpartyDraft } from '../../application/registrazioneOperations/normalizeRegistrazioneInput.js'

function Field({ label, hint = '', span = 1, children, required = false }) {
  return (
    <div className="fg" style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      <label style={REG_LABEL_STYLE}>
        {label}
        {required ? <span style={{ color: '#ff8f8f' }}> *</span> : null}
      </label>
      {children}
      {hint ? <div style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.68)', marginTop: '.12rem' }}>{hint}</div> : null}
    </div>
  )
}

export function RegistrazioneHeaderForm({
  header,
  onChange,
  pianoConti = [],
  causaliContabili = [],
  config = null,
  dataRegistrazioneRef = null,
  focusOrder = null,
  disabled = false,
}) {
  const [draftCausale, setDraftCausale] = useState('')
  const [draftSoggetto, setDraftSoggetto] = useState(header.cliente_fornitore_nome || header.soggetto || '')
  const setField = (field) => (event) => onChange?.(field, event?.target?.value ?? '')

  const causali = Array.isArray(causaliContabili) ? causaliContabili : []
  const showDocumentPanel = Boolean(config?.showDocumentPanel)
  const requiresSoggetto = Boolean(config?.requiresSoggetto)
  const controparti = useMemo(
    () =>
      buildRegistrazioneContropartiList(pianoConti)
        .map((item) => ({
          id: String(item?.id || item?.codice || item?.code || '').trim(),
          label: resolveContoLabel(item),
        }))
        .filter((item) => item.id && item.label),
    [pianoConti]
  )
  const causaleOptions = useMemo(
    () =>
      causali
        .map((item) => {
          const value = resolveRegistrazioneCausaleLabel(item)
          return value ? { value, key: String(item?.id || item?.codice || item?.code || value) } : null
        })
        .filter(Boolean),
    [causali]
  )
  const selectedCausale = useMemo(() => {
    const current = header.causaleContabile
    if (current && typeof current === 'object') return current
    return findRegistrazioneCausaleExactMatch(causali, header.causaleContabileId || header.causaleContabile || '')
  }, [causali, header.causaleContabile, header.causaleContabileId])
  const causaleDisplayValue = useMemo(() => {
    if (selectedCausale) return resolveRegistrazioneCausaleLabel(selectedCausale)
    return String(header.causaleContabileId || header.causaleContabile || '')
  }, [header.causaleContabile, header.causaleContabileId, selectedCausale])

  useEffect(() => {
    setDraftCausale(causaleDisplayValue)
  }, [causaleDisplayValue])

  useEffect(() => {
    setDraftSoggetto(header.cliente_fornitore_nome || header.soggetto || '')
  }, [header.cliente_fornitore_nome, header.soggetto])

  const commitCausale = (value) => {
    const text = String(value ?? '').trim()
    setDraftCausale(text)
    const exact = findRegistrazioneCausaleExactMatch(causali, text)
    onChange?.('causaleContabile', exact || text)
    onChange?.('causaleContabileId', exact ? String(exact.id || exact.codice || exact.code || text).trim() : text)
  }

  const commitSoggetto = (value) => {
    const text = String(value ?? '').trim()
    setDraftSoggetto(text)
    if (!text) {
      onChange?.('soggetto', '')
      onChange?.('clienteFornitoreId', '')
      onChange?.('cliente_fornitore_id', '')
      onChange?.('clienteFornitoreCodice', '')
      onChange?.('cliente_fornitore_codice', '')
      onChange?.('clienteFornitoreNome', '')
      onChange?.('cliente_fornitore_nome', '')
      onChange?.('clienteFornitoreTipo', '')
      onChange?.('cliente_fornitore_tipo', '')
      return
    }

    const resolved = resolveRegistrazioneHeaderCounterpartyDraft({ ...header, soggetto: text }, pianoConti)
    const resolvedId = String(resolved.clienteFornitoreId || resolved.cliente_fornitore_id || '').trim()
    const resolvedName = resolvedId ? String(resolved.clienteFornitoreNome || resolved.cliente_fornitore_nome || '').trim() : ''
    const resolvedCode = resolvedId ? String(resolved.clienteFornitoreCodice || resolved.cliente_fornitore_codice || '').trim() : ''
    const resolvedType = resolvedId ? String(resolved.clienteFornitoreTipo || resolved.cliente_fornitore_tipo || '').trim() : ''
    const resolvedSubject = text

    onChange?.('soggetto', resolvedSubject)
    onChange?.('clienteFornitoreId', resolvedId)
    onChange?.('cliente_fornitore_id', resolvedId)
    onChange?.('clienteFornitoreCodice', resolvedCode)
    onChange?.('cliente_fornitore_codice', resolvedCode)
    onChange?.('clienteFornitoreNome', resolvedName)
    onChange?.('cliente_fornitore_nome', resolvedName)
    onChange?.('clienteFornitoreTipo', resolvedType)
    onChange?.('cliente_fornitore_tipo', resolvedType)
    setDraftSoggetto(resolvedSubject)
  }

  const showSoggettoField = Boolean(showDocumentPanel || requiresSoggetto)
  const showTotaleDocumento = Boolean(showDocumentPanel)
  const subjectNextKey = focusOrder?.nextByKey?.soggetto || (showTotaleDocumento ? 'totaleDocumento' : 'rowsConto')

  const renderSoggettoField = ({ nextKey, standalone = false, span = 1 } = {}) => (
    <Field
      label={config?.showRitenute ? 'Professionista' : 'Cliente / Fornitore'}
      span={span}
      required
      hint="F2 selezione rapida, F3 ricerca libera"
    >
      <input
        value={draftSoggetto}
        onChange={(event) => commitSoggetto(event?.target?.value ?? '')}
        onBlur={(event) => commitSoggetto(event?.target?.value ?? '')}
        disabled={disabled}
        placeholder={config?.showRitenute ? 'Professionista o studio' : 'Cliente o fornitore'}
        style={REG_INPUT_STYLE}
        list="registrazione-controparti"
        data-reg-focusable="true"
        data-reg-field="soggetto"
        data-reg-key="soggetto"
        data-reg-next={nextKey}
      />
      <datalist id="registrazione-controparti">
        {controparti.map((item) => (
          <option key={item.id} value={item.label}>
            {item.label}
          </option>
        ))}
      </datalist>
      {standalone ? <div style={{ fontSize: '.56rem', color: 'rgba(188,204,226,.68)', marginTop: '.12rem' }}>Richiesto dalla causale selezionata.</div> : null}
    </Field>
  )

  return (
    <div className="erp-flat-panel reg-header-shell" style={{ padding: '.82rem .92rem', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.55rem', flexWrap: 'wrap', marginBottom: '.42rem' }}>
        <div style={{ display: 'grid', gap: '.08rem' }}>
          <div style={REG_SECTION_TITLE_STYLE}>Testata registrazione</div>
        </div>
        {!header.primaNotaId && !header.prima_nota_id && (
          <label style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.78rem', color: '#6be3f9', cursor: 'pointer', userSelect: 'none', fontWeight: '500' }}>
            <input
              type="checkbox"
              checked={header.isSimulata || false}
              onChange={(e) => onChange?.('isSimulata', e.target.checked)}
              disabled={disabled}
              style={{ cursor: 'pointer', accentColor: '#1ab8bf' }}
            />
            <span>Prima nota simulata</span>
          </label>
        )}
      </div>

      <div className="reg-header-grid reg-header-grid-compact">
        <Field label="Data registrazione" required>
          <input
            ref={dataRegistrazioneRef}
            type="date"
            value={header.dataRegistrazione || ''}
            onChange={setField('dataRegistrazione')}
            disabled={disabled}
            style={REG_INPUT_STYLE}
            data-reg-focusable="true"
            data-reg-key="dataRegistrazione"
            data-reg-next="causaleContabile"
          />
        </Field>

        <Field label="Causale contabile" required>
          <input
            value={draftCausale}
            onChange={(event) => commitCausale(event?.target?.value ?? '')}
            onFocus={(event) => event?.target?.select?.()}
            disabled={disabled}
            placeholder="Codice o descrizione causale"
            style={REG_INPUT_STYLE}
            list="registrazione-causali"
            data-reg-focusable="true"
            data-reg-key="causaleContabile"
            data-reg-next={focusOrder?.nextByKey?.causaleContabile || (showDocumentPanel ? 'dataDocumento' : requiresSoggetto ? 'soggetto' : 'rowsConto')}
          />
        </Field>

        {showDocumentPanel ? (
          <Field label="Data documento" required>
            <input
              type="date"
              value={header.dataDocumento || ''}
              onChange={setField('dataDocumento')}
              disabled={disabled}
              style={REG_INPUT_STYLE}
              data-reg-focusable="true"
              data-reg-key="dataDocumento"
              data-reg-next="numeroDocumento"
            />
          </Field>
        ) : null}

        {showDocumentPanel ? (
          <Field label="Numero documento" required>
            <input
              value={header.numeroDocumento || ''}
              onChange={setField('numeroDocumento')}
              disabled={disabled}
              placeholder="FT 251/2026"
              style={REG_INPUT_STYLE}
              data-reg-focusable="true"
              data-reg-key="numeroDocumento"
              data-reg-next={focusOrder?.nextByKey?.dataDocumento || (config?.showPartitario ? 'soggetto' : 'rowsConto')}
            />
          </Field>
        ) : null}

        {showSoggettoField ? renderSoggettoField({ nextKey: subjectNextKey, standalone: !showDocumentPanel }) : null}

        {showTotaleDocumento ? (
          <Field label="Totale documento" required>
            <input
              value={header.totaleDocumento || ''}
              onChange={setField('totaleDocumento')}
              disabled={disabled}
              placeholder={formatMoney(0)}
              style={REG_INPUT_STYLE}
              data-reg-focusable="true"
              data-reg-key="totaleDocumento"
              data-reg-next={focusOrder?.nextByKey?.totaleDocumento || 'rowsConto'}
            />
          </Field>
        ) : null}
      </div>

      <datalist id="registrazione-causali">
        {causaleOptions.map((item) => (
          <option key={item.key} value={item.value}>
            {item.value}
          </option>
        ))}
      </datalist>
    </div>
  )
}
