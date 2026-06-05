import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { REG_INPUT_STYLE, REG_LABEL_STYLE, REG_SECTION_TITLE_STYLE, formatMoney, resolveContoLabel } from './registrazioneUi.js'
import {
  findRegistrazioneCausaleExactMatch,
  findRegistrazioneCausalePrefixMatches,
  causaleHasLongerSiblings,
  resolveRegistrazioneCausaleLabel,
} from '../../application/registrazioneOperations/resolveRegistrazioneCausali.js'
import { buildRegistrazioneContropartiList } from '../../application/registrazioneOperations/resolveRegistrazioneControparti.js'
import { resolveRegistrazioneHeaderCounterpartyDraft } from '../../application/registrazioneOperations/normalizeRegistrazioneInput.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import { resolveChiusuraPartiteBehavior } from '../../domain/causali/resolveChiusuraPartiteBehavior.js'


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

/**
 * CausaleAutocomplete — input keyboard-oriented che NON conferma automaticamente
 * quando il codice digitato è prefisso di codici più lunghi.
 *
 * Regola chiave:
 *  - Durante la digitazione: aggiorna solo inputText + highlighted, NON confirmed.
 *  - Enter/Tab/click: conferma il match evidenziato.
 *  - Blur: conferma solo se il testo corrisponde esattamente e univocamente (senza sibling).
 *  - Escape: chiude la lista senza cambiare la causale confermata.
 */
function CausaleAutocomplete({ causali = [], value: externalValue, onChange, disabled, placeholder, inputProps = {} }) {
  const [inputText, setInputText] = useState('')
  const [open, setOpen] = useState(false)
  const [highlightIdx, setHighlightIdx] = useState(0)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  // Sincronizza il testo quando il valore esterno cambia (es. reset, navigazione)
  useEffect(() => {
    const label = externalValue && typeof externalValue === 'object'
      ? resolveRegistrazioneCausaleLabel(externalValue)
      : String(externalValue || '')
    setInputText(label)
  }, [externalValue])

  // Calcola i match prefix in base al testo corrente
  const matches = useMemo(() => {
    const text = inputText.trim()
    if (!text) return causali.slice(0, 40)
    return findRegistrazioneCausalePrefixMatches(causali, text)
  }, [causali, inputText])

  const confirmByItem = useCallback((item) => {
    const label = resolveRegistrazioneCausaleLabel(item)
    setInputText(label)
    setOpen(false)
    onChange?.(item)
  }, [onChange])

  const confirmByText = useCallback((text) => {
    const t = String(text || '').trim()
    setInputText(t)
    setOpen(false)
    if (!t) { onChange?.(null); return }
    const exact = findRegistrazioneCausaleExactMatch(causali, t)
    onChange?.(exact || t)
  }, [causali, onChange])

  const handleInputChange = (e) => {
    const text = e.target.value
    setInputText(text)
    setHighlightIdx(0)
    setOpen(true)
    // NON chiamare onChange qui — la conferma avviene solo su Enter/Tab/click/blur
  }

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlightIdx((i) => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setHighlightIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      // Legge il valore DOM reale (evita stale closure React).
      // Regola di priorità su Enter:
      //   1. Match esatto sul testo digitato → garantisce che NCF selezioni NCF e non NC
      //   2. Match evidenziato (safeIdx) se coerente con la lista ricalcolata
      //   3. Primo match come fallback
      //   4. confirmByText se nessun match
      const domText = e.target.value
      const currentMatches = domText.trim()
        ? findRegistrazioneCausalePrefixMatches(causali, domText)
        : causali.slice(0, 40)
      const exactMatch = domText.trim() ? findRegistrazioneCausaleExactMatch(causali, domText) : null
      const safeIdx = highlightIdx < currentMatches.length ? highlightIdx : 0
      const target = exactMatch || currentMatches[safeIdx] || currentMatches[0] || null
      if (target) {
        confirmByItem(target)
      } else {
        confirmByText(domText)
      }
    } else if (e.key === 'Tab') {
      const domText = e.target.value
      const currentMatches = domText.trim()
        ? findRegistrazioneCausalePrefixMatches(causali, domText)
        : causali.slice(0, 40)
      const exactMatch = domText.trim() ? findRegistrazioneCausaleExactMatch(causali, domText) : null
      const safeIdx = highlightIdx < currentMatches.length ? highlightIdx : 0
      const target = exactMatch || currentMatches[safeIdx] || currentMatches[0] || null
      if (target) {
        confirmByItem(target)
      } else {
        confirmByText(domText)
      }
    } else if (e.key === 'Escape') {
      setOpen(false)
      // Ripristina testo al valore confermato corrente senza cambiare la selezione
      const label = externalValue && typeof externalValue === 'object'
        ? resolveRegistrazioneCausaleLabel(externalValue)
        : String(externalValue || '')
      setInputText(label)
    }
  }

  const handleBlur = (e) => {
    // onMouseDown sul container del dropdown fa preventDefault() → il blur non scatta
    // mai durante un click sulle opzioni. Questo handler gestisce solo il blur reale
    // (es. Tab o click fuori dal dropdown).
    setOpen(false)
    // Si usa e.target.value (DOM) per evitare stale closure su inputText
    const t = (e?.target?.value ?? inputText).trim()
    if (!t) { onChange?.(null); return }
    // Conferma su blur solo se il testo è un match esatto e senza sibling più lunghi
    const exact = findRegistrazioneCausaleExactMatch(causali, t)
    if (exact && !causaleHasLongerSiblings(causali, t)) {
      confirmByItem(exact)
    } else {
      // Altrimenti torna al valore esterno confermato (nessuna conferma automatica)
      const label = externalValue && typeof externalValue === 'object'
        ? resolveRegistrazioneCausaleLabel(externalValue)
        : String(externalValue || '')
      setInputText(label)
    }
  }

  const handleFocus = (e) => {
    e.target.select?.()
    setOpen(true)
  }

  // Click semplice sull'opzione — blur non scatta grazie al preventDefault sul container
  const handleOptionClick = (item) => {
    confirmByItem(item)
    inputRef.current?.focus()
  }

  // Scroll automatico dell'elemento evidenziato nella lista
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-highlighted="true"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [highlightIdx, open])

  const dropdownStyle = {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 9999,
    background: '#1a2235',
    border: '1px solid #2e4060',
    borderRadius: '4px',
    maxHeight: '220px',
    overflowY: 'auto',
    boxShadow: '0 4px 16px rgba(0,0,0,.55)',
    marginTop: '2px',
  }
  const optionStyle = (isHighlighted) => ({
    padding: '.38rem .62rem',
    cursor: 'pointer',
    fontSize: '.8rem',
    color: isHighlighted ? '#fff' : '#a8bfd4',
    background: isHighlighted ? '#2253a0' : 'transparent',
    borderBottom: '1px solid rgba(46,64,96,.35)',
    userSelect: 'none',
  })

  return (
    <div style={{ position: 'relative' }}>
      <input
        ref={inputRef}
        value={inputText}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onFocus={handleFocus}
        disabled={disabled}
        placeholder={placeholder}
        style={REG_INPUT_STYLE}
        autoComplete="off"
        data-has-suggestions="true"
        aria-haspopup="listbox"
        aria-expanded={open}
        {...inputProps}
      />
      {open && matches.length > 0 && !disabled && (
        <div
          style={dropdownStyle}
          ref={listRef}
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {matches.map((item, idx) => {
            const label = resolveRegistrazioneCausaleLabel(item)
            const isHighlighted = idx === highlightIdx
            return (
              <div
                key={String(item?.id || item?.codice || item?.code || label)}
                role="option"
                aria-selected={isHighlighted}
                data-highlighted={isHighlighted ? 'true' : undefined}
                style={optionStyle(isHighlighted)}
                onMouseDown={() => handleOptionClick(item)}
                onMouseEnter={() => setHighlightIdx(idx)}
              >
                {label}
              </div>
            )
          })}
        </div>
      )}
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
  const [draftSoggetto, setDraftSoggetto] = useState(header.cliente_fornitore_nome || header.soggetto || '')
  const setField = (field) => (event) => onChange?.(field, event?.target?.value ?? '')

  const liquidAccounts = useMemo(() => {
    return (pianoConti || [])
      .filter(row => row && (row.is_banca || row.is_cassa || String(row.codice || '').trim().startsWith('1.01.01') || /banca|cassa/i.test(row.descrizione || '')))
      .map(row => ({
        id: String(row.id || '').trim(),
        codice: String(row.codice || '').trim(),
        descrizione: String(row.descrizione || '').trim(),
        label: resolveContoLabel(row)
      }))
  }, [pianoConti])

  const commitBancaCassa = (value) => {
    const text = String(value ?? '').trim()
    if (!text) {
      onChange?.('bancaCassaId', '')
      onChange?.('bancaCassaNome', '')
      onChange?.('bancaCassaCodice', '')
      return
    }

    const match = (pianoConti || []).find(row => {
      const label = resolveContoLabel(row)
      return label === text || String(row.id).trim() === text || String(row.codice).trim() === text
    })

    if (match) {
      onChange?.('bancaCassaId', String(match.id).trim())
      onChange?.('bancaCassaNome', String(match.descrizione).trim())
      onChange?.('bancaCassaCodice', String(match.codice).trim())
    } else {
      onChange?.('bancaCassaId', '')
      onChange?.('bancaCassaNome', text)
      onChange?.('bancaCassaCodice', '')
    }
  }

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

  // La causale confermata deriva dallo stato esterno (header)
  const selectedCausale = useMemo(() => {
    const current = header.causaleContabile
    if (current && typeof current === 'object') return current
    return findRegistrazioneCausaleExactMatch(causali, header.causaleContabileId || header.causaleContabile || '')
  }, [causali, header.causaleContabile, header.causaleContabileId])

  // Valore passato a CausaleAutocomplete come "valore confermato corrente"
  const causaleConfirmedValue = useMemo(() => {
    return selectedCausale || String(header.causaleContabileId || header.causaleContabile || '')
  }, [selectedCausale, header.causaleContabile, header.causaleContabileId])

  const policy = useMemo(() => buildCausaleContabilePolicy(selectedCausale), [selectedCausale])
  const chiusuraBehavior = useMemo(() => resolveChiusuraPartiteBehavior(policy, header, [], pianoConti), [policy, header, pianoConti])
  const isChiusura = chiusuraBehavior.isChiusura
  const isIcpf = chiusuraBehavior.isChiusura


  const handleCausaleConfirm = useCallback((itemOrText) => {
    if (!itemOrText) {
      onChange?.('causaleContabile', '')
      onChange?.('causaleContabileId', '')
      return
    }
    if (typeof itemOrText === 'object') {
      const id = String(itemOrText.id || itemOrText.codice || itemOrText.code || '').trim()
      onChange?.('causaleContabile', itemOrText)
      onChange?.('causaleContabileId', id)
    } else {
      const text = String(itemOrText).trim()
      const exact = findRegistrazioneCausaleExactMatch(causali, text)
      onChange?.('causaleContabile', exact || text)
      onChange?.('causaleContabileId', exact ? String(exact.id || exact.codice || exact.code || text).trim() : text)
    }
  }, [causali, onChange])

  useEffect(() => {
    setDraftSoggetto(header.cliente_fornitore_nome || header.soggetto || '')
  }, [header.cliente_fornitore_nome, header.soggetto])

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

  const renderSoggettoField = ({ nextKey, standalone = false, span = 1, required = true } = {}) => (
    <Field
      label={config?.showRitenute ? 'Professionista' : 'Cliente / Fornitore'}
      span={span}
      required={required}
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
          <CausaleAutocomplete
            causali={causali}
            value={causaleConfirmedValue}
            onChange={handleCausaleConfirm}
            disabled={disabled}
            placeholder="Codice o descrizione causale"
            inputProps={{
              'data-reg-focusable': 'true',
              'data-reg-key': 'causaleContabile',
              'data-reg-next': focusOrder?.nextByKey?.causaleContabile || (showDocumentPanel ? 'dataDocumento' : requiresSoggetto ? 'soggetto' : 'rowsConto'),
            }}
          />
        </Field>

        {showDocumentPanel && !isIcpf ? (
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

        {showDocumentPanel && !isIcpf ? (
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

        {showSoggettoField ? renderSoggettoField({ nextKey: isIcpf ? 'bancaCassa' : subjectNextKey, standalone: !showDocumentPanel, required: !isIcpf }) : null}

        {isIcpf ? (
          <Field label="Banca / Cassa" required={false}>
            <input
              value={header.bancaCassaNome || ''}
              onChange={(e) => commitBancaCassa(e.target.value)}
              onBlur={(e) => commitBancaCassa(e.target.value)}
              disabled={disabled}
              placeholder="Seleziona conto banca o cassa"
              style={REG_INPUT_STYLE}
              list="registrazione-bancacassa"
              data-reg-focusable="true"
              data-reg-key="bancaCassa"
              data-reg-next="importo"
            />
            <datalist id="registrazione-bancacassa">
              {liquidAccounts.map((item) => (
                <option key={item.id} value={item.label}>
                  {item.label}
                </option>
              ))}
            </datalist>
          </Field>
        ) : null}

        {isIcpf ? (
          <Field label="Importo movimento" required={false}>
            <input
              value={header.importo || ''}
              onChange={(e) => onChange?.('importo', e.target.value)}
              disabled={disabled}
              placeholder={formatMoney(0)}
              style={REG_INPUT_STYLE}
              data-reg-focusable="true"
              data-reg-key="importo"
              data-reg-next="rowsConto"
            />
          </Field>
        ) : null}

        {showTotaleDocumento && !isIcpf ? (
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
    </div>
  )
}
