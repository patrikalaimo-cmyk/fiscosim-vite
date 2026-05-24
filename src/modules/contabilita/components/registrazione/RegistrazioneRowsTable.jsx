import { useEffect, useRef, useState, useCallback } from 'react'
import { REG_INPUT_STYLE, REG_SECTION_TITLE_STYLE, formatMoney } from './registrazioneUi.js'
import { getRegistrazioneRowFieldKey } from '../../application/registrazioneOperations/resolveRegistrazioneFocusOrder.js'
import { buildRegistrazioneContoSelection, findRegistrazioneContoExactMatch, resolveContoHierarchyView, resolveRegistrazioneContoDescrizione, resolveRegistrazioneContoLabel } from '../../application/registrazioneOperations/resolveRegistrazioneConti.js'
import { normalizeRegistrazioneAmountInput } from '../../application/registrazioneOperations/normalizeRegistrazioneAmountInput.js'
import { resolveRegistrazioneRowState } from '../../domain/registrazione/resolveRegistrazioneRowState.js'

// ─── Field order per riga ────────────────────────────────────────────────────
const ROW_FIELDS = ['conto', 'dare', 'avere', 'descrizione']

// ─── Ghost row ID marker ─────────────────────────────────────────────────────
const GHOST_PREFIX = '__ghost__'
function isGhostRow(row) { return String(row?.id || '').startsWith(GHOST_PREFIX) }
function makeGhostId() { return `${GHOST_PREFIX}${Date.now()}` }

// ─── Stili condivisi ─────────────────────────────────────────────────────────
const CELL_INPUT_BASE = {
  ...REG_INPUT_STYLE,
  minHeight: 30,
  height: 30,
  padding: '.22rem .44rem',
  fontSize: '.76rem',
  lineHeight: 1.2,
  borderRadius: 8,
  border: '1px solid rgba(136,169,204,.14)',
  background: 'rgba(255,255,255,.025)',
  color: 'var(--tx)',
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s, background .15s',
  width: '100%',
  boxSizing: 'border-box',
}

const CELL_INPUT_ACTIVE = {
  ...CELL_INPUT_BASE,
  borderColor: 'rgba(255,208,92,.65)',
  boxShadow: '0 0 0 2px rgba(255,208,92,.13), inset 0 1px 2px rgba(0,0,0,.12)',
  background: 'rgba(255,208,92,.05)',
}

const CELL_INPUT_ERROR = {
  ...CELL_INPUT_BASE,
  borderColor: 'rgba(251,113,133,.65)',
  boxShadow: '0 0 0 2px rgba(251,113,133,.1)',
}

// ─── RowInput – input cell singola ──────────────────────────────────────────
function RowInput({
  value,
  onChange,
  onBlur,
  onKeyDown,
  disabled = false,
  placeholder,
  type = 'text',
  inputMode,
  list = '',
  field,
  rowId,
  activeCellKey,
  style = {},
  inputRef,
}) {
  const cellKey = getRegistrazioneRowFieldKey(rowId, field)
  const isActive = activeCellKey === cellKey
  const isAmount = field === 'dare' || field === 'avere'
  const [draft, setDraft] = useState(value ?? '')

  useEffect(() => { setDraft(value ?? '') }, [value])

  const computedStyle = isActive ? { ...CELL_INPUT_ACTIVE, ...style }
    : style?.borderColor?.includes('251,113,133') ? { ...CELL_INPUT_ERROR, ...style }
    : { ...CELL_INPUT_BASE, ...style }

  return (
    <input
      ref={inputRef}
      type={type}
      inputMode={inputMode}
      list={list || undefined}
      disabled={disabled}
      value={isAmount ? (isActive ? draft : (value ?? '')) : (value ?? '')}
      placeholder={placeholder}
      data-reg-focusable="true"
      data-reg-row-id={rowId}
      data-reg-field={field}
      data-reg-key={cellKey}
      style={computedStyle}
      onChange={(e) => {
        if (isAmount) setDraft(e.target.value)
        onChange?.(e)
      }}
      onBlur={(e) => {
        if (isAmount) setDraft(e.target.value)
        onBlur?.(e)
      }}
      onKeyDown={onKeyDown}
    />
  )
}

// ─── RegistrazioneRowsTable ──────────────────────────────────────────────────
export function RegistrazioneRowsTable({
  rows = [],
  resolvedRows = [],
  pianoConti = [],
  onChangeRow,
  onAddRow,
  onDeleteRow,
  onOpenAccountPicker,
  onOpenAccountSearch,
  onApplySbilancio,
  onOpenPartite,
  activeCell = null,
  onFocusCell,
  focusOrder = null,
  totals = null,
  validation = null,
  disabled = false,
  templateNotice = '',
  templateActionLabel = '',
  onApplySuggestedRows = null,
}) {
  // ── Gestione ghost row ──────────────────────────────────────────────────
  const [ghostId, setGhostId] = useState(null)
  const tableRef = useRef(null)

  // La lista effettiva di righe: righe reali + ghost se esiste
  const effectiveRows = ghostId
    ? [...rows, { id: ghostId, contoQuery: '', dare: '', avere: '', descrizione: '', riga_numero: rows.length + 1, _isGhost: true }]
    : rows

  const resolvedById = new Map(
    (Array.isArray(resolvedRows) ? resolvedRows : []).map((r) => [String(r?.id || ''), r])
  )
  const datalistId = 'registrazione-piano-conti-v2'

  // ── Logica conto ─────────────────────────────────────────────────────────
  const resolveContoState = useCallback((row) => {
    const exact = findRegistrazioneContoExactMatch(
      pianoConti,
      row?.contoQuery || row?.conto_id || row?.conto_codice || row?.conto_descrizione
    )
    const effective = exact || resolvedById.get(String(row?.id || '')) || row || {}
    const hierarchy = resolveContoHierarchyView(effective)
    const isSelectable = hierarchy.isSelectableForRegistrazione
    const isResolved = Boolean(String(effective?.conto_id || exact?.id || row?.conto_id || '').trim()) && isSelectable
    return {
      exact,
      effective,
      isResolved,
      isSelectable,
      hierarchy,
      contoDescription: String(effective?.conto_descrizione || (exact ? resolveRegistrazioneContoDescrizione(exact || effective) : '') || '').trim(),
      contoCode: String(effective?.conto_codice || exact?.codice || exact?.code || exact?.sigla || '').trim(),
    }
  }, [pianoConti, resolvedById])

  // ── Navigazione tastiera ─────────────────────────────────────────────────
  const focusCell = useCallback((rowId, field) => {
    if (!tableRef.current) return
    const key = getRegistrazioneRowFieldKey(rowId, field)
    const el = tableRef.current.querySelector(`[data-reg-key="${key}"]`)
    if (el) {
      el.focus()
      onFocusCell?.(rowId, field)
    }
  }, [onFocusCell])

  const handleKeyDown = useCallback((e, rowId, field) => {
    const rowIndex = effectiveRows.findIndex((r) => String(r.id) === String(rowId))
    const fieldIndex = ROW_FIELDS.indexOf(field)
    const isLastRow = rowIndex === effectiveRows.length - 1
    const isLastField = fieldIndex === ROW_FIELDS.length - 1
    const isFirstField = fieldIndex === 0

    if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      if (isLastField) {
        // vai alla prima colonna della riga successiva
        if (!isLastRow) {
          e.preventDefault()
          focusCell(effectiveRows[rowIndex + 1].id, ROW_FIELDS[0])
        }
      } else {
        e.preventDefault()
        focusCell(rowId, ROW_FIELDS[fieldIndex + 1])
      }
      return
    }

    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      if (isFirstField) {
        if (rowIndex > 0) {
          e.preventDefault()
          focusCell(effectiveRows[rowIndex - 1].id, ROW_FIELDS[ROW_FIELDS.length - 1])
        }
      } else {
        e.preventDefault()
        focusCell(rowId, ROW_FIELDS[fieldIndex - 1])
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (isLastRow) {
        // crea ghost row se non esiste
        if (!ghostId) {
          const gid = makeGhostId()
          setGhostId(gid)
          // focus sulla ghost row dopo il render
          setTimeout(() => focusCell(gid, ROW_FIELDS[0]), 30)
        } else {
          focusCell(ghostId, field)
        }
      } else {
        focusCell(effectiveRows[rowIndex + 1].id, field)
      }
      return
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rowIndex > 0) {
        focusCell(effectiveRows[rowIndex - 1].id, field)
      }
      return
    }

    if (e.key === 'Escape') {
      // se riga ghost vuota, rimuovi ghost
      if (isGhostRow({ id: rowId }) && ghostId) {
        setGhostId(null)
        if (rows.length > 0) {
          focusCell(rows[rows.length - 1].id, ROW_FIELDS[ROW_FIELDS.length - 1])
        }
      }
      return
    }

    if (e.key === 'Delete' && e.ctrlKey) {
      e.preventDefault()
      if (!isGhostRow({ id: rowId })) {
        onDeleteRow?.(rowId)
      }
    }
  }, [effectiveRows, ghostId, focusCell, onDeleteRow, rows])

  // ── Commit ghost row ─────────────────────────────────────────────────────
  // Quando la ghost row perde il focus completamente (e non ha un conto valido)
  // viene eliminata; se ha un conto valido viene promossa a riga reale
  const handleGhostBlur = useCallback((ghostRow, field, value) => {
    // piccolo delay per verificare se il focus è rimasto nella stessa ghost row
    setTimeout(() => {
      if (!tableRef.current) return
      const focused = tableRef.current.querySelector(':focus')
      const focusedRowId = focused?.getAttribute('data-reg-row-id')
      if (String(focusedRowId) === String(ghostRow.id)) return // focus ancora nella ghost

      // La ghost row perde il focus: decidere se promuovere o eliminare
      const hasContoValid = Boolean(ghostRow.contoQuery && ghostRow.contoQuery.trim())
      if (hasContoValid) {
        // promuovi: aggiungi riga reale e rimuovi ghost
        onAddRow?.()
        setGhostId(null)
      } else {
        // elimina ghost silenziosamente
        setGhostId(null)
      }
    }, 80)
  }, [onAddRow])

  // ── Cambio conto ─────────────────────────────────────────────────────────
  const handleContoChange = useCallback((rowId, value, isGhost) => {
    if (isGhost) {
      // aggiorna solo lo state locale della ghost (non esiste ancora in rows)
      // Usiamo un trucco: aggiorniamo la ghost via effectiveRows update
      // In realtà il ghost è solo locale, non chiamiamo onChangeRow
      return
    }
    onChangeRow?.(rowId, { contoQuery: value })
    const exact = findRegistrazioneContoExactMatch(pianoConti, value)
    const hierarchy = resolveContoHierarchyView(exact || {})
    if (exact && hierarchy.isSelectableForRegistrazione) {
      const selected = buildRegistrazioneContoSelection(exact, value)
      onChangeRow?.(
        rowId,
        {
          contoQuery: selected.__label || resolveRegistrazioneContoLabel(exact),
          conto_id: selected.id || selected.value || selected.codice || selected.code || '',
          conto_codice: String(selected.codice || selected.code || selected.sigla || selected.id || '').trim(),
          conto_descrizione: selected.conto_descrizione || resolveRegistrazioneContoDescrizione(selected),
        },
        { source: 'system' }
      )
    }
  }, [pianoConti, onChangeRow])

  const handleContoBlur = useCallback((rowId, value, isGhost) => {
    if (!isGhost) {
      const selected = findRegistrazioneContoExactMatch(pianoConti, value)
      if (selected) {
        const hierarchy = resolveContoHierarchyView(selected)
        if (!hierarchy.isSelectableForRegistrazione) return
        const sel = buildRegistrazioneContoSelection(selected, value)
        onChangeRow?.(
          rowId,
          {
            contoQuery: sel.__label || resolveRegistrazioneContoLabel(selected),
            conto_id: sel.id || sel.value || sel.codice || sel.code || '',
            conto_codice: String(sel.codice || sel.code || sel.sigla || sel.id || '').trim(),
            conto_descrizione: sel.conto_descrizione || resolveRegistrazioneContoDescrizione(sel),
          },
          { source: 'system' }
        )
      }
    }
  }, [pianoConti, onChangeRow])

  // ── Ghost row state locale ────────────────────────────────────────────────
  const [ghostData, setGhostData] = useState({ contoQuery: '', dare: '', avere: '', descrizione: '' })
  useEffect(() => { if (!ghostId) setGhostData({ contoQuery: '', dare: '', avere: '', descrizione: '' }) }, [ghostId])

  const commitGhost = useCallback(() => {
    if (!ghostId) return
    setTimeout(() => {
      if (!tableRef.current) return
      const focused = tableRef.current.querySelector(':focus')
      const focusedRowId = focused?.getAttribute('data-reg-row-id')
      if (String(focusedRowId) === String(ghostId)) return
      // Il conto è valido?
      const exact = findRegistrazioneContoExactMatch(pianoConti, ghostData.contoQuery)
      const hierarchy = resolveContoHierarchyView(exact || {})
      if (exact && hierarchy.isSelectableForRegistrazione) {
        // Aggiungi riga reale
        onAddRow?.()
        // TODO: in futuro passeremo il payload della ghost row ad onAddRow
      }
      setGhostId(null)
      setGhostData({ contoQuery: '', dare: '', avere: '', descrizione: '' })
    }, 100)
  }, [ghostId, ghostData, pianoConti, onAddRow])

  // ── Calcolo stato e stile di ogni riga ──────────────────────────────────
  const getRowMeta = (row, index) => {
    const canonicalRow = resolvedById.get(String(row?.id || '')) || row
    const contoState = resolveContoState(canonicalRow)
    const hasRawConto = Boolean(String(canonicalRow.contoQuery || '').trim())
    const hasAnyAmount = Boolean(String(canonicalRow.dare || '').trim() || String(canonicalRow.avere || '').trim())
    const hasBothAmounts = Boolean(String(canonicalRow.dare || '').trim() && String(canonicalRow.avere || '').trim())
    const contoIsInvalid = hasRawConto && !contoState.isResolved
    const rowState = resolveRegistrazioneRowState(canonicalRow)
    const isActiveRow = String(activeCell?.rowId || '') === String(row.id || '')
    const activeCellKey = activeCell ? getRegistrazioneRowFieldKey(activeCell.rowId, activeCell.field) : null
    const isGhost = isGhostRow(row)

    const rowIssue = !contoState.isResolved
      ? hasRawConto
        ? contoState.exact && !contoState.hierarchy.isSelectableForRegistrazione
          ? 'Serve un sottoconto'
          : 'Conto non trovato'
        : ''
      : hasBothAmounts
        ? 'Dare e Avere entrambi valorizzati'
        : !hasAnyAmount && !isGhost
          ? 'Importo mancante'
          : ''

    return { canonicalRow, contoState, contoIsInvalid, rowState, isActiveRow, activeCellKey, isGhost, rowIssue, hasRawConto, hasAnyAmount }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const isBalanced = totals?.isBalanced && validation?.status === 'ok'
  const sbilancio = totals?.differenza

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {/* ── Header toolbar ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '.6rem',
        padding: '.55rem .8rem .45rem',
        borderBottom: '1px solid rgba(136,169,204,.07)',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
          <span style={REG_SECTION_TITLE_STYLE}>Righe Prima Nota</span>
          <span style={{ fontSize: '.68rem', color: 'rgba(188,204,226,.55)' }}>
            ↑↓ naviga righe · ←→ naviga campi · ↓ su ultima riga aggiunge
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', flexWrap: 'wrap' }}>
          <KbdButton onClick={() => onOpenAccountPicker?.()} label="Piano conti" kbd="F2" />
          <KbdButton onClick={() => onOpenAccountSearch?.()} label="Cerca conto" kbd="F3" />
          <KbdButton onClick={() => onApplySbilancio?.()} label="Ricalcola residuo" kbd="F8" />
          <KbdButton onClick={() => onOpenPartite?.()} label="Partite" kbd="F9" />
          <button
            type="button"
            onClick={() => onAddRow?.()}
            disabled={disabled}
            style={{
              display: 'flex', alignItems: 'center', gap: '.3rem',
              padding: '.3rem .65rem',
              borderRadius: 8,
              border: '1px solid rgba(96,165,250,.28)',
              background: 'linear-gradient(180deg,rgba(59,130,246,.18),rgba(37,99,235,.12))',
              color: 'rgba(147,197,253,.95)',
              fontSize: '.72rem', fontWeight: 600, cursor: 'pointer',
              transition: 'all .15s',
            }}
          >
            <span style={{ fontSize: '.9rem', lineHeight: 1 }}>+</span> Aggiungi riga
          </button>
        </div>
      </div>

      {/* ── Template notice ── */}
      {templateNotice ? (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem',
          margin: '.4rem .8rem 0',
          padding: '.28rem .52rem',
          borderRadius: 8,
          border: '1px solid rgba(96,165,250,.12)',
          background: 'rgba(96,165,250,.04)',
          fontSize: '.65rem', color: 'rgba(147,197,253,.8)',
        }}>
          <span>📋 {templateNotice}</span>
          {templateActionLabel && onApplySuggestedRows ? (
            <button type="button" onClick={onApplySuggestedRows} style={{
              padding: '.18rem .42rem', borderRadius: 6,
              border: '1px solid rgba(96,165,250,.22)',
              background: 'rgba(96,165,250,.1)',
              color: 'rgba(147,197,253,.9)', fontSize: '.63rem', cursor: 'pointer',
            }}>
              {templateActionLabel}
            </button>
          ) : null}
        </div>
      ) : null}

      {/* ── Piano conti warning ── */}
      {(!Array.isArray(pianoConti) || pianoConti.length === 0) ? (
        <div style={{
          margin: '.4rem .8rem 0', padding: '.32rem .52rem', borderRadius: 8,
          border: '1px dashed rgba(251,191,36,.2)',
          background: 'rgba(251,191,36,.04)',
          color: 'rgba(251,191,36,.8)', fontSize: '.65rem',
        }}>
          ⚠ Piano dei conti non caricato per la società selezionata
        </div>
      ) : null}

      {/* ── Griglia intestazioni ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr 1fr 110px 110px 1fr 32px',
        gap: '.25rem',
        padding: '.3rem .8rem .18rem',
        marginTop: '.5rem',
        borderBottom: '1px solid rgba(136,169,204,.07)',
      }}>
        {['#', 'Conto', 'Denominazione conto', 'Dare', 'Avere', 'Descrizione riga', ''].map((h, i) => (
          <div key={i} style={{
            fontSize: '.6rem',
            fontWeight: 700,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
            color: 'rgba(147,197,253,.5)',
            textAlign: (h === 'Dare' || h === 'Avere') ? 'right' : 'left',
            paddingRight: (h === 'Dare' || h === 'Avere') ? '.2rem' : 0,
          }}>
            {h}
          </div>
        ))}
      </div>

      {/* ── Righe ── */}
      <div ref={tableRef} style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {effectiveRows.map((row, index) => {
          const { canonicalRow, contoState, contoIsInvalid, rowState, isActiveRow, activeCellKey, isGhost, rowIssue } = getRowMeta(row, index)
          const isLastReal = !isGhost && index === rows.length - 1
          const displayConto = isGhost ? ghostData.contoQuery : (row.contoQuery || '')
          const displayDare = isGhost ? ghostData.dare : (row.dare ?? '')
          const displayAvere = isGhost ? ghostData.avere : (row.avere ?? '')
          const displayDesc = isGhost ? ghostData.descrizione : (row.descrizione || '')

          const rowBg = isGhost
            ? 'rgba(255,208,92,.025)'
            : isActiveRow
              ? 'linear-gradient(180deg,rgba(59,130,246,.07),rgba(37,99,235,.04))'
              : rowState.isIncomplete
                ? 'rgba(251,191,36,.025)'
                : index % 2 === 0 ? 'rgba(255,255,255,.012)' : 'transparent'

          const rowBorder = isGhost
            ? '1px dashed rgba(255,208,92,.25)'
            : isActiveRow
              ? '1px solid rgba(59,130,246,.22)'
              : rowIssue
                ? '1px solid rgba(251,113,133,.1)'
                : '1px solid transparent'

          return (
            <div
              key={row.id || index}
              style={{
                display: 'grid',
                gridTemplateColumns: '36px 1fr 1fr 110px 110px 1fr 32px',
                gap: '.25rem',
                alignItems: 'center',
                padding: '.28rem .8rem',
                background: rowBg,
                border: rowBorder,
                borderRadius: isActiveRow || isGhost ? 8 : 4,
                margin: isActiveRow || isGhost ? '.05rem 0' : 0,
                transition: 'background .12s, border-color .12s',
                opacity: isGhost ? 0.75 : 1,
              }}
            >
              {/* # riga */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.12rem' }}>
                <span style={{
                  fontSize: '.65rem', fontWeight: 700,
                  color: isActiveRow ? 'rgba(147,197,253,.9)' : 'rgba(188,204,226,.4)',
                  lineHeight: 1,
                }}>
                  {isGhost ? '＋' : (row.riga_numero || index + 1)}
                </span>
                {row.autoResidualApplied && !isGhost ? (
                  <span style={{
                    fontSize: '.44rem', fontWeight: 700, letterSpacing: '.06em',
                    padding: '1px 4px', borderRadius: 4,
                    background: 'rgba(34,197,94,.15)', color: 'rgba(134,239,172,.9)',
                  }}>AUTO</span>
                ) : null}
              </div>

              {/* Conto */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.06rem', minWidth: 0 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 24px', gap: '.2rem', alignItems: 'center' }}>
                  <RowInput
                    value={displayConto}
                    onChange={(e) => {
                      const v = e.target.value
                      if (isGhost) {
                        setGhostData((prev) => ({ ...prev, contoQuery: v }))
                      } else {
                        handleContoChange(row.id, v, false)
                      }
                    }}
                    onBlur={(e) => {
                      if (isGhost) {
                        commitGhost()
                      } else {
                        handleContoBlur(row.id, e.target.value, false)
                      }
                    }}
                    onKeyDown={(e) => handleKeyDown(e, row.id, 'conto')}
                    placeholder={isGhost ? 'Digita conto…' : 'Codice o descrizione'}
                    list={datalistId}
                    disabled={disabled}
                    field="conto"
                    rowId={row.id}
                    activeCellKey={activeCellKey}
                    style={contoIsInvalid ? { borderColor: 'rgba(251,113,133,.6)', boxShadow: '0 0 0 1.5px rgba(251,113,133,.1)' } : {}}
                  />
                  <button
                    type="button"
                    title="Apri piano dei conti"
                    tabIndex={-1}
                    onClick={() => onOpenAccountPicker?.({ rowId: row.id })}
                    style={{
                      width: 24, height: 24,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      borderRadius: 6,
                      border: '1px solid rgba(136,169,204,.12)',
                      background: 'rgba(255,255,255,.04)',
                      color: 'rgba(147,197,253,.6)',
                      cursor: 'pointer', fontSize: '.7rem',
                      transition: 'all .12s',
                      padding: 0,
                    }}
                  >⊕</button>
                </div>
                {contoIsInvalid ? (
                  <span style={{ fontSize: '.57rem', color: 'rgba(251,113,133,.8)', lineHeight: 1 }}>
                    Conto non trovato nel piano dei conti
                  </span>
                ) : null}
              </div>

              {/* Denominazione conto */}
              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                {contoState.isResolved ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '.06rem' }}>
                    <span style={{
                      fontSize: '.72rem', fontWeight: 600,
                      color: isActiveRow ? 'rgba(147,197,253,.95)' : 'rgba(188,204,226,.85)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {contoState.contoDescription}
                    </span>
                    {contoState.contoCode ? (
                      <span style={{ fontSize: '.58rem', color: 'rgba(147,197,253,.5)', lineHeight: 1 }}>
                        {contoState.contoCode}
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <span style={{ fontSize: '.65rem', color: 'rgba(188,204,226,.3)', fontStyle: 'italic' }}>
                    {isGhost ? '' : '—'}
                  </span>
                )}
              </div>

              {/* Dare */}
              <div style={{ textAlign: 'right' }}>
                <RowInput
                  type="text"
                  inputMode="decimal"
                  disabled={disabled}
                  value={displayDare}
                  onChange={(e) => {
                    if (isGhost) setGhostData((p) => ({ ...p, dare: e.target.value, avere: '' }))
                    else onChangeRow?.(row.id, { dare: e.target.value, avere: '' }, { source: 'manual', amountSide: 'dare' })
                  }}
                  onBlur={(e) => {
                    const n = normalizeRegistrazioneAmountInput(e.target.value)
                    if (isGhost) { setGhostData((p) => ({ ...p, dare: n })); commitGhost() }
                    else if (n !== String(e.target.value ?? '').trim()) {
                      onChangeRow?.(row.id, { dare: n, avere: '' }, { source: 'manual', amountSide: 'dare' })
                    }
                  }}
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'dare')}
                  placeholder="0,00"
                  field="dare"
                  rowId={row.id}
                  activeCellKey={activeCellKey}
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}
                />
              </div>

              {/* Avere */}
              <div style={{ textAlign: 'right' }}>
                <RowInput
                  type="text"
                  inputMode="decimal"
                  disabled={disabled}
                  value={displayAvere}
                  onChange={(e) => {
                    if (isGhost) setGhostData((p) => ({ ...p, avere: e.target.value, dare: '' }))
                    else onChangeRow?.(row.id, { avere: e.target.value, dare: '' }, { source: 'manual', amountSide: 'avere' })
                  }}
                  onBlur={(e) => {
                    const n = normalizeRegistrazioneAmountInput(e.target.value)
                    if (isGhost) { setGhostData((p) => ({ ...p, avere: n })); commitGhost() }
                    else if (n !== String(e.target.value ?? '').trim()) {
                      onChangeRow?.(row.id, { avere: n, dare: '' }, { source: 'manual', amountSide: 'avere' })
                    }
                  }}
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'avere')}
                  placeholder="0,00"
                  field="avere"
                  rowId={row.id}
                  activeCellKey={activeCellKey}
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono, monospace)' }}
                />
                {rowIssue ? (
                  <div style={{
                    marginTop: '.1rem', fontSize: '.56rem',
                    color: contoState.isResolved ? 'rgba(251,191,36,.8)' : 'rgba(251,113,133,.8)',
                    textAlign: 'right', lineHeight: 1.2,
                  }}>
                    {rowIssue}
                  </div>
                ) : null}
              </div>

              {/* Descrizione */}
              <RowInput
                value={displayDesc}
                disabled={disabled}
                onChange={(e) => {
                  if (isGhost) setGhostData((p) => ({ ...p, descrizione: e.target.value }))
                  else onChangeRow?.(row.id, { descrizione: e.target.value }, { source: 'manual' })
                }}
                onBlur={() => { if (isGhost) commitGhost() }}
                onKeyDown={(e) => handleKeyDown(e, row.id, 'descrizione')}
                placeholder="Nota…"
                field="descrizione"
                rowId={row.id}
                activeCellKey={activeCellKey}
              />

              {/* Delete */}
              {isGhost ? (
                <button
                  type="button"
                  tabIndex={-1}
                  title="Annulla riga"
                  onClick={() => setGhostId(null)}
                  style={DELETE_BTN_STYLE}
                >✕</button>
              ) : (
                <button
                  type="button"
                  tabIndex={-1}
                  title="Elimina riga (Ctrl+Canc)"
                  onClick={() => onDeleteRow?.(row.id)}
                  disabled={disabled}
                  style={DELETE_BTN_STYLE}
                >✕</button>
              )}
            </div>
          )
        })}

        {/* Riga vuota placeholder quando non ci sono righe */}
        {effectiveRows.length === 0 && (
          <div style={{
            padding: '1.2rem .8rem',
            textAlign: 'center',
            color: 'rgba(188,204,226,.3)',
            fontSize: '.72rem',
            fontStyle: 'italic',
            borderTop: '1px dashed rgba(136,169,204,.07)',
          }}>
            Nessuna riga. Premi <kbd style={KBD_STYLE}>+ Aggiungi riga</kbd> o usa <kbd style={KBD_STYLE}>↓</kbd> per iniziare.
          </div>
        )}
      </div>

      {/* ── Footer bilancio ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '.4rem .8rem',
        marginTop: '.25rem',
        borderTop: '1px solid rgba(136,169,204,.07)',
        gap: '.5rem',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem', fontSize: '.65rem', color: 'rgba(188,204,226,.4)' }}>
          <span>↳</span>
          <span>Premi <kbd style={KBD_STYLE}>F8</kbd> o posizionati sull&apos;ultima riga importo per il ricalcolo automatico del residuo</span>
        </div>
        {totals ? (
          <BalanceBadge isBalanced={isBalanced} sbilancio={sbilancio} validation={validation} totals={totals} />
        ) : null}
      </div>

      <datalist id={datalistId}>
        {Array.isArray(pianoConti)
          ? pianoConti.map((item) => {
              const v = resolveRegistrazioneContoLabel(item)
              if (!v) return null
              return <option key={String(item?.id || v)} value={v}>{v}</option>
            })
          : null}
      </datalist>
    </div>
  )
}

// ─── Sub-componenti ────────────────────────────────────────────────────────

const DELETE_BTN_STYLE = {
  width: 24, height: 24,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 6,
  border: '1px solid rgba(251,113,133,.18)',
  background: 'rgba(251,113,133,.06)',
  color: 'rgba(251,113,133,.55)',
  cursor: 'pointer', fontSize: '.65rem',
  transition: 'all .12s',
  padding: 0,
  flexShrink: 0,
}

const KBD_STYLE = {
  display: 'inline-block',
  padding: '1px 5px',
  borderRadius: 4,
  border: '1px solid rgba(136,169,204,.18)',
  background: 'rgba(255,255,255,.05)',
  fontSize: '.58rem',
  fontFamily: 'inherit',
  color: 'rgba(188,204,226,.7)',
}

function KbdButton({ onClick, label, kbd }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '.28rem',
        padding: '.28rem .5rem',
        borderRadius: 7,
        border: '1px solid rgba(136,169,204,.13)',
        background: 'rgba(255,255,255,.03)',
        color: 'rgba(188,204,226,.75)',
        fontSize: '.67rem', cursor: 'pointer',
        transition: 'all .12s',
      }}
    >
      {label}
      <span style={{
        padding: '1px 5px', borderRadius: 4,
        border: '1px solid rgba(147,197,253,.2)',
        background: 'rgba(147,197,253,.07)',
        fontSize: '.56rem', fontWeight: 700,
        color: 'rgba(147,197,253,.7)',
      }}>{kbd}</span>
    </button>
  )
}

function BalanceBadge({ isBalanced, sbilancio, validation, totals }) {
  const color = isBalanced ? '#4ade80' : '#fbbf24'
  const bg = isBalanced ? 'rgba(34,197,94,.12)' : 'rgba(251,191,36,.1)'
  const border = isBalanced ? 'rgba(74,222,128,.25)' : 'rgba(251,191,36,.25)'
  const icon = isBalanced ? '✓' : '⚖'

  let label
  if (isBalanced && validation?.status === 'ok') {
    label = 'Prima nota quadrata'
  } else if (sbilancio) {
    label = `Sbilancio ${formatMoney(Math.abs(sbilancio))} in ${sbilancio > 0 ? 'Avere' : 'Dare'}`
  } else if (validation?.blockers?.[0]) {
    label = validation.blockers[0]
  } else {
    label = 'Da completare'
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.35rem',
      padding: '.28rem .65rem',
      borderRadius: 20,
      border: `1px solid ${border}`,
      background: bg,
      color,
      fontSize: '.68rem', fontWeight: 700,
      letterSpacing: '.03em',
    }}>
      <span style={{ fontSize: '.75rem' }}>{icon}</span>
      {label}
      {totals && (
        <span style={{ fontSize: '.6rem', opacity: .7, fontWeight: 400 }}>
          D {formatMoney(totals.dare)} / A {formatMoney(totals.avere)}
        </span>
      )}
    </div>
  )
}
