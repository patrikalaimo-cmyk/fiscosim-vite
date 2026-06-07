import React, { useMemo } from 'react'
import { REG_CARD_STYLE, REG_INPUT_STYLE, REG_LABEL_STYLE, REG_SECTION_TITLE_STYLE, formatMoney, formatShortDate } from './registrazioneUi.js'
import { buildCausaleContabilePolicy } from '../../domain/causali/buildCausaleContabilePolicy.js'
import { resolveChiusuraPartiteBehavior } from '../../domain/causali/resolveChiusuraPartiteBehavior.js'


const GRID_COLS = '130px 90px 95px 85px 100px 110px 140px 70px'

function toAmount(value) {
  const text = String(value ?? '').trim().replace(',', '.')
  const parsed = Number.parseFloat(text)
  return Number.isFinite(parsed) ? parsed : 0
}

function safeFormatMoney(value) {
  if (value === null || value === undefined) return '—'
  return formatMoney(value)
}

const PencilIcon = ({ color }) => (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
    <path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

const InfoIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)

function Row({
  row,
  active = false,
  isSelected: isSelectedProp = false,
  onSelect,
  onToggleSelect,
  onUpdateImportoChiusura,
  onBlurImportoChiusura,
  disabled = false,
  isSuggested = false
}) {
  const isSelected = isSelectedProp || Boolean(row.selected)

  const handleInputChange = (e) => {
    const value = e.target.value
    onUpdateImportoChiusura?.(row.id, value)
  }

  let border = '1px solid rgba(136,169,204,.12)'
  let background = 'rgba(255,255,255,.012)'
  let outline = 'none'
  let boxShadow = 'none'

  // Suggested state style
  if (isSuggested) {
    border = '1px solid rgba(26, 168, 191, 0.4)'
    background = 'rgba(26, 168, 191, 0.05)'
  }

  // Selected state style (takes precedence over suggested)
  if (isSelected) {
    const isNegative = row.residuo < 0
    border = isNegative ? '1px solid #ef4444' : '1px solid #10b981'
    background = isNegative ? 'rgba(239, 68, 68, 0.06)' : 'rgba(16, 185, 129, 0.06)'
    boxShadow = isNegative ? '0 0 6px rgba(239, 68, 68, 0.15)' : '0 0 6px rgba(16, 185, 129, 0.15)'
  }

  // Keyboard focus state style
  if (active) {
    outline = '2px solid #f59e0b'
  }

  // Status Badge Logic
  let badgeText = ''
  let badgeStyle = {}

  if (isSelected) {
    badgeText = 'Selezionata'
    badgeStyle = {
      fontSize: '.56rem',
      padding: '2px 5px',
      fontWeight: 'bold',
      backgroundColor: '#10b981',
      color: '#ffffff',
      borderRadius: '4px',
      textTransform: 'uppercase',
      boxShadow: '0 0 4px rgba(16, 185, 129, 0.3)',
      marginLeft: '8px'
    }
  } else if (isSuggested) {
    badgeText = 'Suggerita'
    badgeStyle = {
      fontSize: '.56rem',
      padding: '2px 5px',
      fontWeight: 'bold',
      backgroundColor: 'rgba(26, 168, 191, 0.15)',
      color: '#1aa8bf',
      border: '1px solid rgba(26, 168, 191, 0.3)',
      borderRadius: '4px',
      textTransform: 'uppercase',
      marginLeft: '8px'
    }
  }

  const docType = String(row.tipoDocumento || 'FT').toUpperCase()
  const isNC = docType.startsWith('NC') || docType.includes('NOTACREDITO') || docType.includes('NOTA_CREDITO')
  const typeLabel = isNC ? 'Nota credito' : 'Fattura'
  const typeBadgeStyle = isNC ? {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    color: '#f87171',
    border: '1px solid rgba(239, 68, 68, 0.25)',
    fontSize: '.62rem',
    padding: '2px 6px',
    borderRadius: '8px',
    fontWeight: '600',
    display: 'inline-block',
    textAlign: 'center',
    width: 'fit-content'
  } : {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    color: '#34d399',
    border: '1px solid rgba(16, 185, 129, 0.25)',
    fontSize: '.62rem',
    padding: '2px 6px',
    borderRadius: '8px',
    fontWeight: '600',
    display: 'inline-block',
    textAlign: 'center',
    width: 'fit-content'
  }

  return (
    <div
      onClick={() => onSelect?.(row)}
      style={{
        display: 'grid',
        gridTemplateColumns: GRID_COLS,
        gap: '.28rem',
        alignItems: 'center',
        padding: '.32rem .34rem',
        borderRadius: 12,
        border,
        background,
        outline,
        outlineOffset: active ? '-1px' : undefined,
        boxShadow,
        color: 'var(--tx)',
        transition: 'all 0.15s ease-in-out',
        cursor: 'pointer'
      }}
    >
      {/* 1. SELEZIONA (Checkbox + badge) */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <input
          type="checkbox"
          checked={isSelected}
          disabled={disabled}
          onClick={(e) => e.stopPropagation()}
          onChange={() => onToggleSelect?.(row.id)}
          style={{
            width: '14px',
            height: '14px',
            cursor: 'pointer',
            accentColor: '#10b981'
          }}
        />
        {badgeText ? (
          <span style={badgeStyle}>{badgeText}</span>
        ) : null}
      </div>

      {/* 2. N. DOCUMENTO (Numero + NON SEL.) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {row.numeroDocumento || '—'}
        </span>
        <span style={{ fontSize: '.52rem', color: 'rgba(188,204,226,.35)', fontWeight: 'normal', textTransform: 'uppercase' }}>
          NON SEL.
        </span>
      </div>

      {/* 3. DATA DOC. */}
      <span style={{ whiteSpace: 'nowrap', fontSize: '.72rem' }}>
        {formatShortDate(row.dataDocumento)}
      </span>

      {/* 4. SOGGETTO */}
      <span style={{ whiteSpace: 'nowrap', textTransform: 'capitalize', fontSize: '.72rem', color: 'rgba(188,204,226,.85)' }}>
        {row.soggettoTipo || 'cliente'}
      </span>

      {/* 5. TIPO */}
      <div style={typeBadgeStyle}>{typeLabel}</div>

      {/* 6. SALDO RESIDUO */}
      <span style={{ color: row.residuo < 0 ? '#ff8f8f' : '#8be28e', fontWeight: 700, fontSize: '.76rem', textAlign: 'right', paddingRight: '.4rem' }}>
        {safeFormatMoney(row.residuo)}
      </span>

      {/* 7. IMPORTO CHIUSURA */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }} onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={isSelected ? (row.importoChiusura ?? '') : (row.residuo !== null ? row.residuo : '')}
          onChange={handleInputChange}
          onBlur={(e) => onBlurImportoChiusura?.(row.id, e.target.value)}
          disabled={disabled || !isSelected}
          style={{
            ...REG_INPUT_STYLE,
            width: '100%',
            minHeight: 28,
            padding: '.15rem 1.6rem .15rem .3rem',
            fontSize: '.74rem',
            textAlign: 'right',
            background: isSelected ? '#1e293b' : 'rgba(0,0,0,.25)',
            border: isSelected 
              ? (row.residuo < 0 ? '1px solid #ef4444' : '1px solid #10b981')
              : '1px solid rgba(255,255,255,.05)',
            boxShadow: isSelected 
              ? (row.residuo < 0 ? '0 0 6px rgba(239, 68, 68, 0.25)' : '0 0 6px rgba(16, 185, 129, 0.25)')
              : 'none',
            color: isSelected ? '#ffffff' : 'rgba(188,204,226,.3)',
            fontWeight: isSelected ? '700' : 'normal',
            transition: 'all 0.15s ease-in-out',
          }}
        />
        <div style={{ position: 'absolute', right: '8px', display: 'flex', alignItems: 'center', pointerEvents: 'none' }}>
          <PencilIcon color={isSelected ? (row.residuo < 0 ? '#ef4444' : '#10b981') : 'rgba(188,204,226,.2)'} />
        </div>
      </div>

      {/* 8. ESITO */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <span style={{ fontWeight: 800, color: row.segno === 'D' ? '#ff8f8f' : '#8be28e', fontSize: '.76rem' }}>
          {row.segno || (row.residuo < 0 ? 'D' : 'A')}
        </span>
        <span style={{ fontSize: '.64rem', color: 'rgba(188,204,226,.6)' }}>
          {row.stato || 'aperta'}
        </span>
      </div>
    </div>
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
  onToggleCheckedPartita,
  onUpdateRowImportoChiusura,
  onBlurImportoChiusura,
  pnRows = []
}) {
  const setField = (field, { manualOverride = false } = {}) => (event) => {
    const value = event?.target?.value ?? ''
    onChange?.(field, value)
    if (manualOverride) {
      onChange?.(field === 'importoAperto' ? 'manualImportoApertoOverride' : 'manualImportoChiusuraOverride', true)
    }
  }

  const active = Boolean(behavior?.showPartitario)
  const mode = draft?.mode || draft?.tipoMovimento || partitarioData?.tipoMovimento || behavior?.partitarioMode || 'none'
  const isApertura = mode === 'apertura'
  const isChiusura = mode === 'chiusura'
  const listRaw = Array.isArray(draft?.rows) && draft.rows.length ? draft.rows : Array.isArray(partite) ? partite : []
  
  const checkedPartiteIds = useMemo(() => {
    const fromPartitarioChecked = Array.isArray(partitarioData?.checkedPartiteIds) ? partitarioData.checkedPartiteIds : []
    const fromPartitarioSelected = Array.isArray(partitarioData?.selectedPartitaIds) ? partitarioData.selectedPartitaIds : []
    const fromDraftSelected = Array.isArray(draft?.selectedPartitaIds) ? draft.selectedPartitaIds : []
    return Array.from(new Set([
      ...fromPartitarioChecked.map(id => String(id || '').trim()),
      ...fromPartitarioSelected.map(id => String(id || '').trim()),
      ...fromDraftSelected.map(id => String(id || '').trim())
    ])).filter(Boolean)
  }, [partitarioData?.checkedPartiteIds, partitarioData?.selectedPartitaIds, draft?.selectedPartitaIds])

  const list = listRaw.map(row => {
    const rowResiduo = row.importo_residuo !== undefined && row.importo_residuo !== null
      ? row.importo_residuo
      : (row.importoResiduo !== undefined && row.importoResiduo !== null
          ? row.importoResiduo
          : (row.residuo !== undefined && row.residuo !== null
              ? row.residuo
              : (row.saldoResiduo !== undefined && row.saldoResiduo !== null
                  ? row.saldoResiduo
                  : (row.saldo_residuo !== undefined && row.saldo_residuo !== null
                      ? row.saldo_residuo
                      : (row.saldo !== undefined && row.saldo !== null ? row.saldo : null)))))
    
    const importoOriginario = row.importoOriginario !== undefined && row.importoOriginario !== null
      ? row.importoOriginario
      : (row.importo_originale !== undefined && row.importo_originale !== null
          ? row.importo_originale
          : (row.importoOrigine !== undefined && row.importoOrigine !== null
              ? row.importoOrigine
              : (row.totale !== undefined && row.totale !== null ? row.totale : null)))

    const importoPagato = row.importoPagato !== undefined && row.importoPagato !== null
      ? row.importoPagato
      : (row.importo_pagato !== undefined && row.importo_pagato !== null ? row.importo_pagato : null)

    const rawVal = partitarioData?.importiChiusura?.[row.id]
    const importoChiusura = rawVal !== undefined ? rawVal : (row.importoChiusura ?? row.importo_chiuso ?? 0)

    const rowIdStr = String(row.id || '').trim()
    const isSelected = row.selected === true || checkedPartiteIds.includes(rowIdStr)

    return {
      ...row,
      id: row.id,
      numeroDocumento: row.numeroDocumento || row.numero_documento || row.numeroFattura || '—',
      dataDocumento: row.dataDocumento || row.data_documento || row.data || '',
      tipoDocumento: row.tipoDocumento || row.tipo_documento || row.tipo || '—',
      importoOriginario,
      importoPagato,
      importoAperto: row.importoAperto || row.importo_aperto || 0,
      importoChiusura,
      residuo: rowResiduo,
      segno: row.segno || '',
      stato: row.stato || 'aperta',
      selected: isSelected
    }
  })

  const selectedId = String(partitarioData?.selectedPartitaId || draft?.selectedPartitaId || '').trim()
  const headerTotal = toAmount(header?.totaleDocumento || header?.totale_documento || '')
  const selectedCausaleTipo = String(selectedCausale?.tipoDocumento || selectedCausale?.tipo_documento || '').trim()
  
  const importoOriginario = isApertura
    ? (toAmount(draft?.importoOriginario) || headerTotal || toAmount(partitarioData?.importoOrigine) || 0)
    : (toAmount(draft?.importoOriginario) || toAmount(partitarioData?.importoOrigine) || 0)
  
  const importoAperto = isApertura
    ? (toAmount(draft?.importoAperto) || headerTotal || toAmount(partitarioData?.importoAperto) || 0)
    : (toAmount(draft?.importoAperto) || toAmount(partitarioData?.importoAperto) || 0)
  
  const rawImportoChiusura = partitarioData?.importoChiusura !== undefined ? partitarioData.importoChiusura : (draft?.importoChiusura ?? '')
  const importoChiusura = isApertura ? 0 : toAmount(rawImportoChiusura)

  const handleTopBlur = (e) => {
    if (!isApertura && selectedId) {
      onBlurImportoChiusura?.(selectedId, e.target.value)
    }
  }
  
  const residuo = isApertura
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
      ? 'Seleziona le partite da chiudere e modifica l’importo per chiusure parziali.'
      : 'Partitario non attivo per la causale selezionata.'

  const soggettoId = String(
    draft?.soggettoId ||
    draft?.selectedControparteId ||
    partitarioData?.soggettoId ||
    header?.clienteFornitoreId ||
    header?.cliente_fornitore_id ||
    ''
  ).trim()

  const pnSubjectAmount = useMemo(() => {
    if (!Array.isArray(pnRows)) return 0
    const policy = buildCausaleContabilePolicy(selectedCausale)
    const chiusuraBehavior = resolveChiusuraPartiteBehavior(policy, header, list, [])
    const isIncassoCliente = chiusuraBehavior.soggettoTipo === 'cliente'
    const isPagamentoFornitore = chiusuraBehavior.soggettoTipo === 'fornitore'

    const subjectRow = pnRows.find(row => {
      const rowContoId = String(row.conto_id || row.contoId || '').trim()
      if (soggettoId && rowContoId === soggettoId) return true
      const role = String(row.ruolo || '').toLowerCase()
      const desc = String(row.descrizione_riga || '').toLowerCase()
      return role === 'soggetto' || desc.includes('cliente') || desc.includes('fornitore')
    })
    if (!subjectRow) return 0

    if (isIncassoCliente) {
      return toAmount(subjectRow.avere)
    } else if (isPagamentoFornitore) {
      return toAmount(subjectRow.dare)
    }

    const d = toAmount(subjectRow.dare)
    const a = toAmount(subjectRow.avere)
    return Math.max(d, a)
  }, [pnRows, selectedCausale, mode, header, list, soggettoId])


  // 2. Partitario totals calculation
  const partitarioTotals = useMemo(() => {
    let positive = 0
    let negative = 0
    let net = 0
    list.forEach(row => {
      if (row.selected) {
        const val = toAmount(row.importoChiusura)
        if (val > 0) {
          positive += val
        } else {
          negative += val
        }
        net += val
      }
    })
    return {
      positive,
      negative,
      net: Math.abs(net),
      rawNet: net
    }
  }, [list])

  // 3. Quadratura PN calculation
  const pnTotals = useMemo(() => {
    let dare = 0
    let avere = 0
    if (Array.isArray(pnRows)) {
      pnRows.forEach(row => {
        dare += toAmount(row.dare)
        avere += toAmount(row.avere)
      })
    }
    const diff = dare - avere
    return {
      dare,
      avere,
      differenza: Math.round(diff * 100) / 100,
      isBalanced: Math.abs(diff) < 0.01
    }
  }, [pnRows])

  const diffPartitarioPn = Math.abs(Math.abs(partitarioTotals.rawNet) - Math.abs(pnSubjectAmount))
  const isDiffPartitarioPnQuadrato = diffPartitarioPn < 0.01

  // 4. Match suggestions logic
  const suggestedMatchId = useMemo(() => {
    const headerAmount = toAmount(header?.importo)
    const dataReg = header?.dataRegistrazione || ''
    if (headerAmount <= 0) return null

    const candidates = list.filter(row => {
      if (row.dataDocumento && dataReg && row.dataDocumento > dataReg) return false
      return Math.abs(toAmount(row.residuo) - headerAmount) < 0.01
    })

    if (!candidates.length) return null

    candidates.sort((a, b) => {
      const da = a.dataDocumento || '9999-12-31'
      const db = b.dataDocumento || '9999-12-31'
      return da.localeCompare(db)
    })

    return candidates[0].id
  }, [list, header?.importo, header?.dataRegistrazione])

  const greenBadgeStyle = {
    fontSize: '.56rem',
    padding: '2px 6px',
    fontWeight: 'bold',
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    color: '#10b981',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '4px',
    textTransform: 'uppercase',
    display: 'inline-block',
    marginTop: '4px'
  }

  const redBadgeStyle = {
    fontSize: '.56rem',
    padding: '2px 6px',
    fontWeight: 'bold',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    color: '#ef4444',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '4px',
    textTransform: 'uppercase',
    display: 'inline-block',
    marginTop: '4px'
  }

  return (
    <div className="erp-flat-panel" style={{ padding: '.8rem .9rem', height: '100%' }}>
      {/* 1. Header Tab */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.5rem', marginBottom: '.5rem' }}>
        <div style={{ display: 'grid', gap: '.08rem', minWidth: 0 }}>
          <div style={{ ...REG_SECTION_TITLE_STYLE, color: 'rgba(188,204,226,.92)' }}>MOVIMENTI PARTITARIO</div>
          <div style={{ fontSize: '.66rem', color: 'rgba(188,204,226,.7)' }}>{microcopy}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span className={`bdg ${isApertura || isChiusura ? 'bdg-green' : 'bdg-blue'}`} style={{ fontSize: '.64rem', padding: '.2rem .45rem' }}>{modeLabel}</span>
          <span className="bdg bdg-gold" style={{ fontSize: '.64rem', padding: '.2rem .45rem' }}>{list.length || 0} righe</span>
        </div>
      </div>

      <div style={{ overflowX: 'auto', marginBottom: '.5rem' }}>
        <div style={{ minWidth: 960, display: 'grid', gap: '.2rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(90px, .8fr) minmax(160px, 1.25fr) 104px 96px 88px 96px 90px 72px 74px', gap: '.28rem', fontSize: '.58rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.08em', marginBottom: '.25rem' }}>
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
            <input value={safeFormatMoney(importoOriginario)} disabled placeholder="0,00" style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioImportoOrigine" />
            <input
              value={isApertura ? importoAperto : rawImportoChiusura}
              onChange={setField(isApertura ? 'importoAperto' : 'importoChiusura', { manualOverride: true })}
              onBlur={handleTopBlur}
              disabled={disabled}
              placeholder="0,00"
              style={REG_INPUT_STYLE}
              data-reg-focusable="true"
              data-reg-key={isApertura ? 'partitarioImportoAperto' : 'partitarioImporto'}
              data-reg-next={focusOrder?.nextByKey?.partitarioImporto || 'rowsConto'}
            />
            <input value={safeFormatMoney(residuo)} disabled placeholder="0,00" style={REG_INPUT_STYLE} data-reg-focusable="true" data-reg-key="partitarioResiduo" />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 10, border: '1px solid rgba(136,169,204,.12)', background: 'rgba(255,255,255,.02)', fontSize: '.67rem', fontWeight: 800, color: 'rgba(188,204,226,.9)' }}>{draft?.stato || partitarioData?.stato || 'predisposto'}</div>
          </div>
        </div>
      </div>

      {isChiusura ? (
        <>
          {/* 2. Riepilogo Superiore */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: '1rem',
              padding: '.75rem',
              borderRadius: 12,
              background: 'rgba(255, 255, 255, 0.015)',
              border: '1px solid rgba(136, 169, 204, 0.08)',
              marginBottom: '.75rem',
            }}
          >
            <div>
              <div style={{ fontSize: '.58rem', color: 'rgba(188, 204, 226, 0.65)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>POSITIVI SELEZIONATI</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#8be28e', marginTop: '2px' }}>{safeFormatMoney(partitarioTotals.positive)}</div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', color: 'rgba(188, 204, 226, 0.65)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>NEGATIVI SELEZIONATI</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ff8f8f', marginTop: '2px' }}>{safeFormatMoney(partitarioTotals.negative)}</div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', color: 'rgba(188, 204, 226, 0.65)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>NETTO CHIUSURA</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffd05c', marginTop: '2px' }}>{safeFormatMoney(partitarioTotals.rawNet)}</div>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', color: 'rgba(188, 204, 226, 0.65)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>DIFFERENZA PARTITARIO/PN</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: isDiffPartitarioPnQuadrato ? '#8be28e' : '#ff8f8f', marginTop: '2px' }}>
                {safeFormatMoney(diffPartitarioPn)}
              </div>
              <span style={isDiffPartitarioPnQuadrato ? greenBadgeStyle : redBadgeStyle}>
                {isDiffPartitarioPnQuadrato ? 'ALLINEATO' : 'DISALLINEATO'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: '.58rem', color: 'rgba(188, 204, 226, 0.65)', textTransform: 'uppercase', letterSpacing: '.06em', fontWeight: 700 }}>QUADRATURA PN</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: pnTotals.isBalanced ? '#8be28e' : '#ff8f8f', marginTop: '2px' }}>
                {safeFormatMoney(Math.abs(pnTotals.differenza))}
              </div>
              <span style={pnTotals.isBalanced ? greenBadgeStyle : redBadgeStyle}>
                {pnTotals.isBalanced ? 'QUADRATO' : 'SBILANCIATO'}
              </span>
            </div>
          </div>

          {/* 3. Barra Istruzioni */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              padding: '.5rem .75rem',
              borderRadius: 8,
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(136, 169, 204, 0.08)',
              marginBottom: '.75rem',
              fontSize: '.72rem',
              color: 'rgba(188, 204, 226, 0.8)',
            }}
          >
            <InfoIcon />
            <span>
              <strong>1.</strong> Clicca la casella per selezionare la partita &nbsp;&nbsp;&nbsp;&nbsp;
              <strong>2.</strong> Modifica l’importo chiusura per il parziale &nbsp;&nbsp;&nbsp;&nbsp;
              <strong>3.</strong> Premi <strong>F10</strong> per confermare
            </span>
          </div>

          {/* 4. Griglia Unica */}
          <div style={{ overflowX: 'auto', display: 'grid', gap: '.32rem', minWidth: 920 }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID_COLS, gap: '.28rem', fontSize: '.6rem', color: 'rgba(188,204,226,.72)', textTransform: 'uppercase', letterSpacing: '.08em', borderBottom: '1px solid rgba(136,169,204,.15)', paddingBottom: '.25rem', marginBottom: '.25rem' }}>
              <span>Seleziona</span>
              <span>N. documento</span>
              <span>Data doc.</span>
              <span>Soggetto</span>
              <span>Tipo</span>
              <span style={{ textAlign: 'right' }}>Saldo residuo</span>
              <span style={{ textAlign: 'right' }}>Importo chiusura</span>
              <span style={{ textAlign: 'center' }}>Esito</span>
            </div>
            {list.length ? (
              list.map((row, idx) => {
                const rowIdStr = String(row?.id || '').trim()
                const isSelected = row.selected === true || checkedPartiteIds.includes(rowIdStr)
                return (
                  <Row
                    key={row.id || idx}
                    row={row}
                    isSelected={isSelected}
                    active={rowIdStr === selectedId}
                    onSelect={(selected) => onApplySelected?.(selected)}
                    onToggleSelect={onToggleCheckedPartita}
                    onUpdateImportoChiusura={onUpdateRowImportoChiusura}
                    onBlurImportoChiusura={onBlurImportoChiusura}
                    disabled={disabled}
                    isSuggested={row.id === suggestedMatchId}
                  />
                )
              })
            ) : (
              <div style={{ padding: '.7rem .4rem', color: 'rgba(188,204,226,.76)', fontSize: '.68rem', textAlign: 'center' }}>
                Nessuna partita aperta reale per il soggetto selezionato.
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
              Metti a fuoco selezionata (F9)
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
