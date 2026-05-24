import { createPortal } from 'react-dom'
import { useCallback, useMemo, useRef, useState } from 'react'
import { normalizeText } from '../../application/canonical_mapper/utils.js'
import { buildRegistrazioneIvaRows } from '../../application/registrazioneOperations/buildRegistrazioneIvaRows.js'
import { REG_SECTION_TITLE_STYLE, formatMoney } from './registrazioneUi.js'

// ─── Helpers ────────────────────────────────────────────────────────────────

function resolveIvaLabel(item = {}) {
  const code = String(item?.codice || item?.code || item?.sigla || item?.codiceInterno || item?.codice_interno || '').trim()
  const descr = String(item?.descrizione || item?.description || item?.denominazione || item?.nome || '').trim()
  return [code, descr].filter(Boolean).join(' – ') || 'da selezionare'
}

function resolveIvaMeta(item = {}) {
  const aliquota = item?.aliquota != null && String(item.aliquota).trim() !== '' ? `${String(item.aliquota).replace('.', ',')}%` : ''
  const natura = String(item?.natura || item?.codice_natura || item?.natura_iva || '').trim()
  const registro = String(item?.registroIva || item?.registro_iva || item?.codice_registro_iva || '').trim()
  return { aliquota, natura, registro }
}

function normalizeQuery(value) {
  return normalizeText(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function searchCausaliIva(query = '', causaliIva = []) {
  const q = normalizeQuery(query)
  if (!q) return []
  return (Array.isArray(causaliIva) ? causaliIva : [])
    .map((item) => {
      const code = normalizeQuery(item?.codice || item?.code || item?.sigla || item?.codiceInterno || item?.codice_interno || '')
      const descr = normalizeQuery(item?.descrizione || item?.description || item?.denominazione || item?.nome || '')
      const aliquota = normalizeQuery(item?.aliquota != null ? String(item.aliquota).replace('.', ',') : '')
      const natura = normalizeQuery(item?.natura || item?.codice_natura || item?.natura_iva || '')
      const label = normalizeQuery(resolveIvaLabel(item))
      const exact = q === code || q === descr || q === label
      const partial = code.includes(q) || descr.includes(q) || label.includes(q) || aliquota.includes(q) || natura.includes(q)
      if (!exact && !partial) return null
      return { item, score: exact ? 0 : (code.startsWith(q) || descr.startsWith(q)) ? 1 : 2 }
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .map((e) => e.item)
}

function createPatchForField(row, field, value) {
  const next = { ...row, [field]: value, manualEdited: true, lastEditedField: field }
  if (field === 'totale') {
    next.manualTotalOverride = true; next.manualTotalCleared = String(value ?? '').trim() === ''
    next.manualImponibileOverride = false; next.manualIvaDetrattaOverride = false
    next.manualIvaIndetraibileOverride = false; next.autoResidualApplied = false
  }
  if (field === 'imponibile') {
    next.manualImponibileOverride = true; next.manualTotalCleared = false
    next.manualIvaDetrattaOverride = false; next.manualIvaIndetraibileOverride = false
    next.autoResidualApplied = false
  }
  if (field === 'ivaDetratta') { next.manualIvaDetrattaOverride = true; next.manualTotalCleared = false; next.autoResidualApplied = false }
  if (field === 'ivaIndetraibile') { next.manualIvaIndetraibileOverride = true; next.manualTotalCleared = false; next.autoResidualApplied = false }
  return next
}

function createEmptyIvaRow(index = 0) {
  return {
    id: `iva-row-${Date.now()}-${index}`,
    riga: index + 1,
    causaleIvaId: '', causaleIvaCodice: '', causaleIvaDescrizione: '',
    causaleIvaLabel: 'da selezionare', causaleIvaQuery: '',
    imponibile: '', ivaDetratta: '', ivaIndetraibile: '', totale: '',
    aliquota: '', natura: '', percentualeDetraibilita: '', percentualeIndetraibilita: '',
    competenzaIva: '', dataOperazione: '', registroIva: '', segnoRegistro: '+',
    protocolloProvvisorio: 'da assegnare', protocolloDefinitivo: 'da assegnare',
    manualTotalOverride: false, manualImponibileOverride: false,
    manualIvaDetrattaOverride: false, manualIvaIndetraibileOverride: false,
    manualEdited: false, lastEditedField: '', stato: 'predisposto', attiva: true,
  }
}

// ─── Campi navigabili per riga IVA ───────────────────────────────────────────
const IVA_FIELDS = ['causaleIva', 'imponibile', 'ivaDetratta', 'ivaIndetraibile', 'totale', 'aliquota', 'natura', 'competenzaIva', 'dataOperazione']

function ivaKey(rowId, field) { return `iva-row:${String(rowId || '')}:${String(field || '')}` }

// ─── Stili condivisi ─────────────────────────────────────────────────────────

const CELL_BASE = {
  width: '100%', boxSizing: 'border-box',
  minHeight: 30, height: 30,
  padding: '.22rem .44rem',
  fontSize: '.75rem', lineHeight: 1.2,
  borderRadius: 8,
  border: '1px solid rgba(136,169,204,.14)',
  background: 'rgba(255,255,255,.025)',
  color: 'var(--tx)',
  outline: 'none',
  transition: 'border-color .15s, box-shadow .15s, background .15s',
}

const CELL_ACTIVE = {
  ...CELL_BASE,
  borderColor: 'rgba(255,208,92,.65)',
  boxShadow: '0 0 0 2px rgba(255,208,92,.13), inset 0 1px 2px rgba(0,0,0,.12)',
  background: 'rgba(255,208,92,.05)',
}

const READONLY_CELL = {
  ...CELL_BASE,
  background: 'rgba(255,255,255,.012)',
  border: '1px solid rgba(136,169,204,.08)',
  color: 'rgba(188,204,226,.7)',
  cursor: 'default',
  fontVariantNumeric: 'tabular-nums',
}

// ─── IvaCell – input navigabile ───────────────────────────────────────────────
function IvaCell({ rowId, field, value, onChange, onBlur, onKeyDown, placeholder, type = 'text', inputMode, disabled, activeCellKey, style = {}, inputRef }) {
  const cellKey = ivaKey(rowId, field)
  const isActive = activeCellKey === cellKey
  return (
    <input
      ref={inputRef}
      type={type}
      inputMode={inputMode}
      value={value ?? ''}
      onChange={onChange}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      disabled={disabled}
      style={isActive ? { ...CELL_ACTIVE, ...style } : { ...CELL_BASE, ...style }}
      data-reg-focusable="true"
      data-reg-row-id={rowId}
      data-reg-section="iva"
      data-reg-key={cellKey}
      autoComplete="off"
    />
  )
}

// ─── Dropdown suggerimenti causale IVA ───────────────────────────────────────
function IvaSuggestDropdown({ anchor, matches, onPick, onClose }) {
  if (!anchor || !matches.length) return null

  const dropdown = (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 8000 }}
    >
      <div
        style={{
          position: 'fixed',
          top: anchor.top,
          left: anchor.left,
          width: anchor.width,
          maxHeight: anchor.maxHeight || 240,
          overflowY: 'auto',
          zIndex: 8001,
          borderRadius: 10,
          border: '1px solid rgba(96,165,250,.22)',
          background: 'rgba(8,18,32,.97)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 16px 40px rgba(0,0,0,.5)',
          padding: '.3rem',
          display: 'grid',
          gap: '.18rem',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {matches.map((item, i) => {
          const label = resolveIvaLabel(item)
          const meta = resolveIvaMeta(item)
          return (
            <button
              key={item?.id || item?.codice || i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick?.(item) }}
              style={{
                display: 'flex', flexDirection: 'column', gap: '.06rem',
                width: '100%', textAlign: 'left',
                padding: '.32rem .5rem', borderRadius: 7, border: 'none',
                background: i === 0 ? 'rgba(255,208,92,.08)' : 'transparent',
                outline: i === 0 ? '1px solid rgba(255,208,92,.25)' : 'none',
                color: 'rgba(236,244,255,.95)', cursor: 'pointer',
                transition: 'background .1s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.35rem' }}>
                <span style={{ fontWeight: 700, fontSize: '.75rem' }}>{label}</span>
                {meta.aliquota ? (
                  <span style={{
                    padding: '1px 6px', borderRadius: 20,
                    background: 'rgba(96,165,250,.15)', border: '1px solid rgba(96,165,250,.25)',
                    color: 'rgba(147,197,253,.9)', fontSize: '.58rem', fontWeight: 700,
                  }}>{meta.aliquota}</span>
                ) : null}
                {meta.natura ? (
                  <span style={{
                    padding: '1px 6px', borderRadius: 20,
                    background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.22)',
                    color: 'rgba(196,181,253,.9)', fontSize: '.58rem', fontWeight: 700,
                  }}>{meta.natura}</span>
                ) : null}
              </div>
              {meta.registro ? (
                <span style={{ fontSize: '.6rem', color: 'rgba(147,197,253,.55)' }}>Registro: {meta.registro}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )

  return typeof document === 'undefined' ? dropdown : createPortal(dropdown, document.body)
}

// ─── Etichetta colonna ────────────────────────────────────────────────────────
function ColHdr({ children, align = 'left' }) {
  return (
    <div style={{
      fontSize: '.58rem', fontWeight: 700, letterSpacing: '.07em',
      textTransform: 'uppercase', color: 'rgba(147,197,253,.45)',
      textAlign: align, paddingBottom: '.1rem',
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}>
      {children}
    </div>
  )
}

// ─── Badge readonly ───────────────────────────────────────────────────────────
function ReadBadge({ value, tone = 'neutral' }) {
  const color = tone === 'positive' ? 'rgba(134,239,172,.9)'
    : tone === 'negative' ? 'rgba(251,113,133,.9)'
    : 'rgba(188,204,226,.65)'
  const bg = tone === 'positive' ? 'rgba(34,197,94,.08)'
    : tone === 'negative' ? 'rgba(239,68,68,.08)'
    : 'rgba(255,255,255,.015)'
  const border = tone === 'positive' ? 'rgba(74,222,128,.15)'
    : tone === 'negative' ? 'rgba(239,68,68,.15)'
    : 'rgba(136,169,204,.1)'
  return (
    <div style={{
      ...READONLY_CELL,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color, background: bg, border: `1px solid ${border}`,
      fontWeight: 700, fontSize: '.7rem', textAlign: 'center',
    }}>
      {value || '—'}
    </div>
  )
}

// ─── RegistrazioneIvaPanel ────────────────────────────────────────────────────
export function RegistrazioneIvaPanel({
  ivaData,
  onChange,
  onAddRow,
  onDeleteRow,
  focusOrder = null,
  disabled = false,
  behavior = null,
  draft = null,
  causaliIva = [],
  causaleContabile = null,
}) {
  const active = Boolean(behavior?.showIvaPanel)
  const panelRef = useRef(null)
  const [activeCellKey, setActiveCellKey] = useState(null)
  const [suggestState, setSuggestState] = useState({ rowId: null, query: '', anchor: null })

  // ── Righe calcolate ────────────────────────────────────────────────────
  const computedRows = useMemo(() => {
    const sourceRows = Array.isArray(ivaData?.rows) ? ivaData.rows.filter(Boolean) : []
    const documentTotal = Number(draft?.totaleDocumento ?? ivaData?.totaleDocumento ?? ivaData?.totaleImponibile ?? 0)
    const result = buildRegistrazioneIvaRows({
      rows: sourceRows,
      documentData: { totaleDocumento: documentTotal, imponibile: draft?.imponibile ?? ivaData?.imponibile ?? '' },
      header: { dataRegistrazione: draft?.dataCompetenza || ivaData?.dataCompetenza || draft?.dataOperazione || ivaData?.dataOperazione || '' },
      causaliIva,
      causaleBehavior: behavior,
      causaleContabile,
      baseCausale: {
        id: ivaData?.causaleIvaId || draft?.causaleIvaId || '',
        codice: ivaData?.causaleIvaCodice || draft?.causaleIvaCodice || '',
        descrizione: ivaData?.causaleIvaDescrizione || draft?.causaleIvaDescrizione || '',
        aliquota: ivaData?.aliquotaIva || draft?.aliquota || '',
        percentualeDetraibilita: ivaData?.percentualeDetraibilita || draft?.percentualeDetraibilita || '',
        registroIva: ivaData?.registroIva || draft?.registroIva || '',
        segnoRegistro: ivaData?.segnoRegistro || draft?.segnoRegistro || '',
      },
    })
    return {
      rows: Array.isArray(result.rows) && result.rows.length ? result.rows : [createEmptyIvaRow(0)],
      summary: result.summary || { imponibile: 0, ivaTotale: 0, ivaDetratta: 0, ivaIndetraibile: 0, totaleDocumento: documentTotal, residualDocumento: documentTotal },
      warnings: Array.isArray(result.warnings) ? result.warnings : [],
    }
  }, [
    behavior, causaliIva, causaleContabile,
    draft?.aliquota, draft?.causaleIvaCodice, draft?.causaleIvaDescrizione, draft?.causaleIvaId,
    draft?.dataCompetenza, draft?.dataOperazione, draft?.imponibile, draft?.registroIva,
    draft?.segnoRegistro, draft?.totaleDocumento, draft?.percentualeDetraibilita,
    ivaData?.aliquotaIva, ivaData?.causaleIvaCodice, ivaData?.causaleIvaDescrizione, ivaData?.causaleIvaId,
    ivaData?.dataCompetenza, ivaData?.dataOperazione, ivaData?.imponibile, ivaData?.percentualeDetraibilita,
    ivaData?.registroIva, ivaData?.rows, ivaData?.segnoRegistro, ivaData?.totaleDocumento,
    ivaData?.totaleImponibile, ivaData?.ivaDetratta, ivaData?.ivaIndetraibile,
  ])

  const rows = computedRows.rows
  const summary = computedRows.summary
  const documentResidual = Number(draft?.residuoDocumento || 0)

  // ── Mutazione righe ────────────────────────────────────────────────────
  const mutateRow = useCallback((rowId, mapper, extraPatch = null) => {
    const currentRows = rows.length ? rows : [createEmptyIvaRow(0)]
    const nextRows = currentRows.map((row) =>
      String(row.id || '') !== String(rowId || '') ? row
        : typeof mapper === 'function' ? mapper(row) : { ...row, ...mapper }
    )
    onChange?.({ rows: nextRows, ...(extraPatch && typeof extraPatch === 'object' ? extraPatch : {}) })
  }, [rows, onChange])

  // ── Navigazione tastiera ───────────────────────────────────────────────
  const focusCell = useCallback((rowId, field) => {
    if (!panelRef.current) return
    const key = ivaKey(rowId, field)
    const el = panelRef.current.querySelector(`[data-reg-key="${key}"]`)
    if (el?.focus) { el.focus(); setActiveCellKey(key) }
  }, [])

  const handleKeyDown = useCallback((e, rowId, field) => {
    const rowIndex = rows.findIndex((r) => String(r.id) === String(rowId))
    const fieldIndex = IVA_FIELDS.indexOf(field)
    const isLastRow = rowIndex === rows.length - 1
    const isLastField = fieldIndex === IVA_FIELDS.length - 1
    const isFirstField = fieldIndex === 0

    // Non intercettare i tasti freccia quando c'è dropdown suggerimenti aperto
    if (suggestState.rowId === rowId && suggestState.query && field === 'causaleIva') {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') return
    }

    if (e.key === 'ArrowRight' || (e.key === 'Tab' && !e.shiftKey)) {
      if (isLastField) { if (!isLastRow) { e.preventDefault(); focusCell(rows[rowIndex + 1].id, IVA_FIELDS[0]) } }
      else { e.preventDefault(); focusCell(rowId, IVA_FIELDS[fieldIndex + 1]) }
      return
    }
    if (e.key === 'ArrowLeft' || (e.key === 'Tab' && e.shiftKey)) {
      if (isFirstField) { if (rowIndex > 0) { e.preventDefault(); focusCell(rows[rowIndex - 1].id, IVA_FIELDS[IVA_FIELDS.length - 1]) } }
      else { e.preventDefault(); focusCell(rowId, IVA_FIELDS[fieldIndex - 1]) }
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!isLastRow) focusCell(rows[rowIndex + 1].id, field)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (rowIndex > 0) focusCell(rows[rowIndex - 1].id, field)
      return
    }
    if (e.key === 'Escape') {
      setSuggestState({ rowId: null, query: '', anchor: null })
    }
    if (e.key === 'Enter' && field === 'causaleIva') {
      const matches = searchCausaliIva(suggestState.query, causaliIva)
      if (matches.length) {
        e.preventDefault()
        applyCausaleIva(rowId, matches[0], rowIndex)
        setSuggestState({ rowId: null, query: '', anchor: null })
        setTimeout(() => focusCell(rowId, 'imponibile'), 20)
      }
    }
  }, [rows, suggestState, focusCell, causaliIva])

  // ── Selezione causale IVA ──────────────────────────────────────────────
  const applyCausaleIva = useCallback((rowId, item, rowIndex) => {
    const label = resolveIvaLabel(item)
    const patch = {
      causaleIvaId: item?.id || item?.codice || label,
      causaleIvaCodice: item?.codice || '',
      causaleIvaDescrizione: item?.descrizione || '',
      causaleIvaLabel: label,
      causaleIvaQuery: '',
      aliquota: item?.aliquota != null ? String(item.aliquota) : '',
      natura: item?.natura || '',
      registroIva: item?.registroIva || '',
      segnoRegistro: item?.segnoRegistro || '',
      percentualeDetraibilita: item?.percentualeDetraibilita ?? '',
      percentualeIndetraibilita: item?.percentualeIndetraibilita ?? '',
      manualEdited: true, lastEditedField: 'causaleIva',
    }
    const extraPatch = rowIndex === 0 ? {
      causaleIvaId: patch.causaleIvaId, causaleIvaCodice: patch.causaleIvaCodice,
      causaleIvaDescrizione: patch.causaleIvaDescrizione, causaleIva: label,
      aliquotaIva: patch.aliquota, naturaIva: patch.natura,
      registroIva: patch.registroIva, segnoRegistro: patch.segnoRegistro,
      percentualeDetraibilita: patch.percentualeDetraibilita,
      percentualeIndetraibilita: patch.percentualeIndetraibilita,
    } : null
    mutateRow(rowId, (r) => ({ ...r, ...patch }), extraPatch)
  }, [mutateRow])

  // ── Griglia colonne ────────────────────────────────────────────────────
  // causaleIva | imponibile | ivaDetratta | ivaIndetr | totale | aliquota | natura | compIva | dataOp | registro | segno | prot.prov | prot.def | stato | ×
  const COLS = '210px 90px 90px 82px 90px 58px 64px 100px 100px 82px 44px 88px 88px 70px 28px'
  const colHeaders = ['Causale IVA', 'Imponibile', 'IVA detr.', 'IVA indetr.', 'Totale', 'Alic.', 'Natura', 'Comp. IVA', 'Data oper.', 'Registro', 'Segno', 'Prot. prov.', 'Prot. def.', 'Stato', '']

  const totalImponibile = summary.imponibile || 0
  const totalIva = summary.ivaTotale || summary.ivaDetratta || 0
  const totalDoc = summary.totaleDocumento || 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* ── Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.6rem',
        padding: '.55rem .8rem .45rem', borderBottom: '1px solid rgba(136,169,204,.07)', flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem' }}>
            <span style={REG_SECTION_TITLE_STYLE}>Movimenti IVA</span>
            <span style={{
              padding: '2px 8px', borderRadius: 20, fontSize: '.58rem', fontWeight: 700,
              background: 'rgba(34,197,94,.1)', border: '1px solid rgba(74,222,128,.2)',
              color: 'rgba(134,239,172,.9)',
            }}>Predisposto</span>
            <span style={{
              padding: '2px 8px', borderRadius: 20, fontSize: '.58rem', fontWeight: 700,
              background: 'rgba(96,165,250,.1)', border: '1px solid rgba(96,165,250,.22)',
              color: 'rgba(147,197,253,.8)',
            }}>{rows.length} {rows.length === 1 ? 'riga' : 'righe'}</span>
          </div>
          <span style={{ fontSize: '.68rem', color: 'rgba(188,204,226,.45)' }}>
            ↑↓ naviga righe · ←→ naviga campi · Invio seleziona causale
          </span>
        </div>
        <button
          type="button"
          onClick={() => onAddRow?.()}
          disabled={disabled}
          style={{
            display: 'flex', alignItems: 'center', gap: '.3rem',
            padding: '.3rem .65rem', borderRadius: 8,
            border: '1px solid rgba(96,165,250,.28)',
            background: 'linear-gradient(180deg,rgba(59,130,246,.18),rgba(37,99,235,.12))',
            color: 'rgba(147,197,253,.95)', fontSize: '.72rem', fontWeight: 600,
            cursor: 'pointer', transition: 'all .15s',
          }}
        >
          <span style={{ fontSize: '.9rem' }}>+</span> Aggiungi riga IVA
        </button>
      </div>

      {/* ── Griglia IVA ── */}
      <div style={{ overflowX: 'auto', overflowY: 'visible' }}>
        <div ref={panelRef} style={{ minWidth: 1380, display: 'flex', flexDirection: 'column', gap: 0 }}>

          {/* Intestazioni colonne */}
          <div style={{
            display: 'grid', gridTemplateColumns: COLS, gap: '.22rem',
            padding: '.32rem .8rem .2rem', borderBottom: '1px solid rgba(136,169,204,.07)',
          }}>
            {colHeaders.map((h, i) => <ColHdr key={i}>{h}</ColHdr>)}
          </div>

          {/* Righe IVA */}
          {rows.map((row, rowIndex) => {
            const query = String(row.causaleIvaQuery ?? '')
            const selectedLabel = normalizeText(row.causaleIvaLabel || row.causaleIvaCodice || '')
            const isActiveRow = activeCellKey?.startsWith(`iva-row:${String(row.id)}:`)
            const suggestions = isActiveRow && suggestState.rowId === row.id ? searchCausaliIva(suggestState.query, causaliIva) : []
            const segno = row.segnoRegistro || '+'

            const rowBg = isActiveRow
              ? 'linear-gradient(180deg,rgba(59,130,246,.07),rgba(37,99,235,.04))'
              : rowIndex % 2 === 0 ? 'rgba(255,255,255,.012)' : 'transparent'

            const rowBorder = isActiveRow
              ? '1px solid rgba(59,130,246,.22)'
              : '1px solid transparent'

            return (
              <div
                key={row.id || rowIndex}
                style={{
                  display: 'grid', gridTemplateColumns: COLS, gap: '.22rem',
                  alignItems: 'center', padding: '.3rem .8rem',
                  background: rowBg, border: rowBorder,
                  borderRadius: isActiveRow ? 8 : 4,
                  margin: isActiveRow ? '.04rem 0' : 0,
                  transition: 'background .12s, border-color .12s',
                  position: 'relative', zIndex: isActiveRow ? 20 : 1,
                }}
                onFocusCapture={(e) => {
                  const key = e.target?.getAttribute?.('data-reg-key')
                  if (key) setActiveCellKey(key)
                }}
              >
                {/* Causale IVA – con autocomplete */}
                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '.04rem' }}>
                  <IvaCell
                    rowId={row.id} field="causaleIva"
                    value={query || selectedLabel}
                    activeCellKey={activeCellKey}
                    disabled={disabled}
                    placeholder="Cerca causale IVA…"
                    onKeyDown={(e) => handleKeyDown(e, row.id, 'causaleIva')}
                    onChange={(e) => {
                      const v = e.target.value
                      mutateRow(row.id, (r) => createPatchForField(r, 'causaleIvaQuery', v))
                      setSuggestState({ rowId: row.id, query: v, anchor: null })
                    }}
                    onBlur={() => {
                      setTimeout(() => {
                        if (suggestState.rowId === row.id) setSuggestState({ rowId: null, query: '', anchor: null })
                      }, 150)
                    }}
                  />
                  {selectedLabel && !query ? (
                    <span style={{ fontSize: '.58rem', color: 'rgba(147,197,253,.55)', lineHeight: 1 }}>
                      ✓ {selectedLabel}
                    </span>
                  ) : null}
                  {/* Dropdown suggerimenti */}
                  {suggestions.length > 0 && suggestState.rowId === row.id && (
                    <IvaSuggestDropdown
                      anchor={{ top: 0, left: 0, width: 280, maxHeight: 220, _inline: true }}
                      matches={suggestions}
                      onPick={(item) => {
                        applyCausaleIva(row.id, item, rowIndex)
                        setSuggestState({ rowId: null, query: '', anchor: null })
                        setTimeout(() => focusCell(row.id, 'imponibile'), 20)
                      }}
                      onClose={() => setSuggestState({ rowId: null, query: '', anchor: null })}
                      inline
                    />
                  )}
                </div>

                {/* Imponibile */}
                <IvaCell rowId={row.id} field="imponibile" value={row.imponibile ?? ''} activeCellKey={activeCellKey}
                  disabled={disabled} placeholder="0,00" inputMode="decimal"
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'imponibile')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'imponibile', e.target.value))}
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono,monospace)' }}
                />

                {/* IVA detratta */}
                <IvaCell rowId={row.id} field="ivaDetratta" value={row.ivaDetratta ?? row.ivaDetraibile ?? ''} activeCellKey={activeCellKey}
                  disabled={disabled} placeholder="0,00" inputMode="decimal"
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'ivaDetratta')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'ivaDetratta', e.target.value))}
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono,monospace)', color: 'rgba(134,239,172,.9)' }}
                />

                {/* IVA indetraibile */}
                <IvaCell rowId={row.id} field="ivaIndetraibile" value={row.ivaIndetraibile ?? ''} activeCellKey={activeCellKey}
                  disabled={disabled} placeholder="0,00" inputMode="decimal"
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'ivaIndetraibile')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'ivaIndetraibile', e.target.value))}
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono,monospace)', color: 'rgba(251,113,133,.75)' }}
                />

                {/* Totale */}
                <IvaCell rowId={row.id} field="totale" value={row.totale ?? ''} activeCellKey={activeCellKey}
                  disabled={disabled} placeholder="0,00" inputMode="decimal"
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'totale')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'totale', e.target.value))}
                  style={{ textAlign: 'right', fontFamily: 'var(--font-mono,monospace)', fontWeight: 700 }}
                />

                {/* Aliquota */}
                <IvaCell rowId={row.id} field="aliquota" value={row.aliquota ?? ''} activeCellKey={activeCellKey}
                  disabled={disabled} placeholder="22"
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'aliquota')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'aliquota', e.target.value))}
                  style={{ textAlign: 'center' }}
                />

                {/* Natura */}
                <IvaCell rowId={row.id} field="natura" value={row.natura ?? ''} activeCellKey={activeCellKey}
                  disabled={disabled} placeholder="N2.1"
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'natura')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'natura', e.target.value))}
                  style={{ textAlign: 'center' }}
                />

                {/* Competenza IVA */}
                <IvaCell rowId={row.id} field="competenzaIva" value={row.competenzaIva ?? ''} activeCellKey={activeCellKey}
                  type="date" disabled={disabled}
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'competenzaIva')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'competenzaIva', e.target.value))}
                />

                {/* Data operazione */}
                <IvaCell rowId={row.id} field="dataOperazione" value={row.dataOperazione ?? ''} activeCellKey={activeCellKey}
                  type="date" disabled={disabled}
                  onKeyDown={(e) => handleKeyDown(e, row.id, 'dataOperazione')}
                  onChange={(e) => mutateRow(row.id, (r) => createPatchForField(r, 'dataOperazione', e.target.value))}
                />

                {/* Registro IVA (readonly) */}
                <ReadBadge value={row.registroIva || '—'} />

                {/* Segno (readonly) */}
                <ReadBadge value={segno} tone={segno === '-' ? 'negative' : 'positive'} />

                {/* Prot. provvisorio (readonly) */}
                <ReadBadge value={row.protocolloProvvisorio || '—'} />

                {/* Prot. definitivo (readonly) */}
                <ReadBadge value={row.protocolloDefinitivo || '—'} />

                {/* Stato (readonly) */}
                <div style={{
                  ...READONLY_CELL,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '.62rem', fontWeight: 700,
                  color: 'rgba(188,204,226,.7)',
                }}>
                  {row.stato || 'predis.'}
                </div>

                {/* Elimina */}
                <button
                  type="button"
                  tabIndex={-1}
                  title="Elimina riga IVA"
                  onClick={() => onDeleteRow?.(row.id)}
                  disabled={disabled || rows.length <= 1}
                  style={{
                    width: 24, height: 24, padding: 0, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    borderRadius: 6, border: '1px solid rgba(251,113,133,.18)',
                    background: 'rgba(251,113,133,.06)', color: 'rgba(251,113,133,.55)',
                    cursor: 'pointer', fontSize: '.65rem', transition: 'all .12s',
                    opacity: rows.length <= 1 ? 0.3 : 1,
                  }}
                >✕</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Dropdown inline suggerimenti (portal) ── */}
      {suggestState.rowId && suggestState.query && (
        <IvaSuggestDropdownPortal
          query={suggestState.query}
          causaliIva={causaliIva}
          panelRef={panelRef}
          rowId={suggestState.rowId}
          onPick={(item) => {
            const rowIndex = rows.findIndex((r) => String(r.id) === String(suggestState.rowId))
            applyCausaleIva(suggestState.rowId, item, rowIndex)
            setSuggestState({ rowId: null, query: '', anchor: null })
            setTimeout(() => focusCell(suggestState.rowId, 'imponibile'), 20)
          }}
          onClose={() => setSuggestState({ rowId: null, query: '', anchor: null })}
        />
      )}

      {/* ── Footer riepilogo ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '.5rem', flexWrap: 'wrap',
        padding: '.4rem .8rem', borderTop: '1px solid rgba(136,169,204,.07)', marginTop: '.2rem',
      }}>
        <SummaryPill label="Imponibile" value={formatMoney(totalImponibile)} color="rgba(147,197,253,.8)" />
        <SummaryPill label="IVA detratta" value={formatMoney(totalIva)} color="rgba(134,239,172,.8)" />
        {documentResidual !== 0 ? (
          <SummaryPill
            label="Residuo doc."
            value={formatMoney(Math.abs(documentResidual))}
            color={documentResidual > 0 ? 'rgba(251,191,36,.85)' : 'rgba(251,113,133,.8)'}
          />
        ) : null}
        {computedRows.warnings.length ? (
          <span style={{ fontSize: '.64rem', color: 'rgba(251,191,36,.8)', marginLeft: '.3rem' }}>
            ⚠ {computedRows.warnings.join(' · ')}
          </span>
        ) : null}
      </div>
    </div>
  )
}

// ─── Footer pill ─────────────────────────────────────────────────────────────
function SummaryPill({ label, value, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.3rem',
      padding: '.2rem .55rem', borderRadius: 20,
      border: '1px solid rgba(136,169,204,.1)',
      background: 'rgba(255,255,255,.02)',
    }}>
      <span style={{ fontSize: '.58rem', color: 'rgba(188,204,226,.4)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</span>
      <span style={{ fontSize: '.72rem', fontWeight: 700, color, fontFamily: 'var(--font-mono,monospace)' }}>{value}</span>
    </div>
  )
}

// ─── Portal dropdown (posizionato vicino al campo attivo) ─────────────────────
function IvaSuggestDropdownPortal({ query, causaliIva, panelRef, rowId, onPick, onClose }) {
  const matches = useMemo(() => searchCausaliIva(query, causaliIva), [query, causaliIva])
  if (!matches.length) return null

  // Trova il campo causale della riga attiva per posizionarsi
  const el = panelRef?.current?.querySelector(`[data-reg-key="iva-row:${rowId}:causaleIva"]`)
  if (!el) return null
  const rect = el.getBoundingClientRect()

  const dropdown = (
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{ position: 'fixed', inset: 0, zIndex: 8000 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: rect.bottom + 4,
          left: Math.max(8, rect.left),
          width: Math.max(280, rect.width + 60),
          maxHeight: Math.min(240, window.innerHeight - rect.bottom - 16),
          overflowY: 'auto',
          zIndex: 8001,
          borderRadius: 10,
          border: '1px solid rgba(96,165,250,.22)',
          background: 'rgba(8,18,32,.97)',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 16px 40px rgba(0,0,0,.5)',
          padding: '.3rem',
          display: 'grid', gap: '.15rem',
        }}
      >
        {matches.map((item, i) => {
          const label = resolveIvaLabel(item)
          const meta = resolveIvaMeta(item)
          return (
            <button
              key={item?.id || item?.codice || i}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onPick?.(item) }}
              style={{
                display: 'flex', flexDirection: 'column', gap: '.05rem',
                width: '100%', textAlign: 'left', padding: '.3rem .48rem',
                borderRadius: 7, border: 'none',
                background: i === 0 ? 'rgba(255,208,92,.08)' : 'transparent',
                outline: i === 0 ? '1px solid rgba(255,208,92,.2)' : 'none',
                color: 'rgba(236,244,255,.95)', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '.3rem' }}>
                <span style={{ fontWeight: 700, fontSize: '.74rem' }}>{label}</span>
                {meta.aliquota ? (
                  <span style={{ padding: '1px 5px', borderRadius: 20, background: 'rgba(96,165,250,.15)', border: '1px solid rgba(96,165,250,.25)', color: 'rgba(147,197,253,.9)', fontSize: '.57rem', fontWeight: 700 }}>{meta.aliquota}</span>
                ) : null}
                {meta.natura ? (
                  <span style={{ padding: '1px 5px', borderRadius: 20, background: 'rgba(167,139,250,.12)', border: '1px solid rgba(167,139,250,.2)', color: 'rgba(196,181,253,.9)', fontSize: '.57rem', fontWeight: 700 }}>{meta.natura}</span>
                ) : null}
              </div>
              {meta.registro ? (
                <span style={{ fontSize: '.58rem', color: 'rgba(147,197,253,.45)' }}>Registro: {meta.registro}</span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(dropdown, document.body)
}
