import { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../../../lib/supabase'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { persistPrimaNotaDraft } from '../application/persistPrimaNotaDraft.js'
import { buildRegistrazioneDraft } from '../application/registrazioneOperations/buildRegistrazioneDraft.js'
import { buildRegistrazioneRowsFromTemplateResolved } from '../application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js'
import { applyRegistrazioneAutoResidualToRow } from '../application/registrazioneOperations/applyRegistrazioneAutoResidualToRow.js'
import { applyRegistrazioneAutoResidualChainToRows } from '../application/registrazioneOperations/applyRegistrazioneAutoResidualChainToRows.js'
import { normalizeRegistrazioneAmountInput } from '../application/registrazioneOperations/normalizeRegistrazioneAmountInput.js'
import { normalizeRegistrazioneRowPatch } from '../application/registrazioneOperations/normalizeRegistrazioneRowPatch.js'
import { buildRegistrazioneContoSelection, resolveRegistrazioneContoDescrizione, resolveRegistrazioneContoLabel, resolveContoHierarchyView } from '../application/registrazioneOperations/resolveRegistrazioneConti.js'
import { buildRegistrazioneContropartiList } from '../application/registrazioneOperations/resolveRegistrazioneControparti.js'
import { resolveRegistrazioneEsercizio } from '../application/registrazioneOperations/resolveRegistrazioneEsercizio.js'
import { resolveRegistrazioneFocusOrder } from '../application/registrazioneOperations/resolveRegistrazioneFocusOrder.js'
import { useRegistrazioneKeyboardShortcuts } from '../application/registrazioneOperations/useRegistrazioneKeyboardShortcuts.js'
import { buildCausaleStructureHistory } from '../application/registrazioneOperations/buildCausaleStructureHistory.js'
import { resolveRegistrazioneCausaleBehavior } from '../domain/registrazione/resolveRegistrazioneCausaleBehavior.js'
import { buildRegistrazioneManualeUiPolicy } from '../domain/registrazione/buildRegistrazioneManualeUiPolicy.js'
import {
  REG_PAGE_STYLE,
  REG_CONTAINER_STYLE,
  formatMoney,
  resolveContoLabel,
} from '../components/registrazione/registrazioneUi.js'
import { RegistrazioneWorkspaceHeader } from '../components/registrazione/RegistrazioneWorkspaceHeader.jsx'
import { RegistrazioneContextBanner } from '../components/registrazione/RegistrazioneContextBanner.jsx'
import { RegistrazioneHeaderForm } from '../components/registrazione/RegistrazioneHeaderForm.jsx'
import { RegistrazioneDocumentPanel } from '../components/registrazione/RegistrazioneDocumentPanel.jsx'
import { RegistrazioneIvaPanel } from '../components/registrazione/RegistrazioneIvaPanel.jsx'
import { RegistrazionePartitarioPanel } from '../components/registrazione/RegistrazionePartitarioPanel.jsx'
import { RegistrazioneRitenutePanel } from '../components/registrazione/RegistrazioneRitenutePanel.jsx'
import { RegistrazioneTabs } from '../components/registrazione/RegistrazioneTabs.jsx'
import { RegistrazioneRowsTable } from '../components/registrazione/RegistrazioneRowsTable.jsx'
import { RegistrazionePreviewPanel } from '../components/registrazione/RegistrazionePreviewPanel.jsx'
import { RegistrazioneTotalsBar } from '../components/registrazione/RegistrazioneTotalsBar.jsx'
import { RegistrazioneShortcutFooter } from '../components/registrazione/RegistrazioneShortcutFooter.jsx'
import { RegistrazioneAccountPickerModal } from '../components/registrazione/RegistrazioneAccountPickerModal.jsx'
import { RegistrazioneAccountSearchModal } from '../components/registrazione/RegistrazioneAccountSearchModal.jsx'

const REAL_SAVE_TEMPORARILY_BLOCKED = true

async function loadPianoContiFromLocalApi(societaId) {
  const id = String(societaId || '').trim()
  if (!id) return []
  const response = await fetch(`/api/contabilita/piano-conti?societaId=${encodeURIComponent(id)}`, {
    method: 'GET',
    credentials: 'same-origin',
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(payload?.message || payload?.error || 'Impossibile caricare il piano conti dalla lettura locale')
  }
  return Array.isArray(payload?.data) ? payload.data : []
}

function currentYearOptions(currentYear) {
  return [0, 1, 2, 3].map((offset) => String(currentYear - offset))
}

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function focusRowField(root, rowId, field) {
  const selector = `[data-reg-key="row:${String(rowId || '')}:${String(field || '')}"]`
  const el = root?.querySelector?.(selector)
  if (el?.focus) {
    el.focus()
    return true
  }
  return false
}

function resolveRowFieldAfterContoSelection(row = {}, residualResult = null) {
  if (residualResult?.applied && residualResult.side === 'avere') return 'avere'
  if (residualResult?.applied && residualResult.side === 'dare') return 'dare'
  if (String(row?.dare || '').trim()) return 'dare'
  if (String(row?.avere || '').trim()) return 'avere'
  return 'dare'
}

function makeEmptyRow(index = 0) {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `row-${Date.now()}-${index}`,
    contoQuery: '',
    descrizione: '',
    dare: '',
    avere: '',
    autoResidualApplied: false,
    manualAmountOverride: false,
    manualEdited: false,
    templateGenerated: false,
    templateKey: '',
    templateScope: false,
  }
}

function makeEmptyIvaRow(index = 0) {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `iva-row-${Date.now()}-${index}`,
    riga: index + 1,
    causaleIvaId: '',
    causaleIvaCodice: '',
    causaleIvaDescrizione: '',
    causaleIvaLabel: '',
    causaleIvaQuery: '',
    imponibile: '',
    ivaDetratta: '',
    ivaIndetraibile: '',
    totale: '',
    aliquota: '',
    natura: '',
    percentualeDetraibilita: '',
    percentualeIndetraibilita: '',
    competenzaIva: '',
    dataOperazione: '',
    registroIva: '',
    segnoRegistro: '',
    protocolloProvvisorio: 'da assegnare',
    protocolloDefinitivo: 'da assegnare',
    manualTotalOverride: false,
    manualImponibileOverride: false,
    manualIvaDetrattaOverride: false,
    manualIvaIndetraibileOverride: false,
    manualEdited: false,
    lastEditedField: '',
    stato: 'predisposto',
    attiva: true,
  }
}

function hasManualRegistrazioneRowContent(row = {}) {
  if (!row || typeof row !== 'object') return false
  if (row.manualEdited || row.manualAmountOverride || row.subjectAccountSynced) return true
  const fields = [
    row.contoQuery,
    row.conto_id,
    row.conto_codice,
    row.conto_descrizione,
    row.descrizione,
    row.dare,
    row.avere,
  ]
  return fields.some((value) => String(value ?? '').trim())
}

function canAutoApplyRegistrazioneTemplate(rows = []) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return true
  return list.every((row) => {
    if (!row || typeof row !== 'object') return true
    if (hasManualRegistrazioneRowContent(row)) return Boolean(row.templateGenerated && !row.manualEdited && !row.manualAmountOverride)
    return true
  })
}

function areTemplateRowsInSync(currentRows = [], templateRows = []) {
  const current = Array.isArray(currentRows) ? currentRows : []
  const next = Array.isArray(templateRows) ? templateRows : []
  if (current.length !== next.length) return false

  const keys = [
    'templateGenerated',
    'templateKey',
    'templateScope',
    'contoQuery',
    'conto_id',
    'conto_codice',
    'conto_descrizione',
    'hierarchyType',
    'isTemplateScope',
    'lato',
    'formula_importo',
    'descrizione',
    'descrizione_riga',
    'mastrino_hint',
    'dare',
    'avere',
    'obbligatoria',
    'modificabile',
    'attiva',
    'conto_resolved_finale',
  ]

  return current.every((row, index) => {
    const other = next[index] || {}
    return keys.every((key) => String(row?.[key] ?? '') === String(other?.[key] ?? ''))
  })
}

function makeInitialState(exercise = String(new Date().getFullYear())) {
  const today = todayIso()
  return {
      header: {
        esercizioContabile: exercise,
        dataRegistrazione: today,
        dataDocumento: today,
        numeroDocumento: '',
        causaleContabileId: '',
        soggetto: '',
        clienteFornitoreId: '',
        clienteFornitoreNome: '',
        clienteFornitoreCodice: '',
        totaleDocumento: '',
        descrizioneGenerale: '',
      },
    documentData: {
      divisa: 'EUR',
      cambio: '1,000000',
      condizioniPagamento: '',
      modalitaPagamento: '',
      totaleImponibile: '',
      totaleImposte: '',
      totaleDocumento: '',
    },
    ivaData: {
      causaleIvaId: '',
      causaleIvaCodice: '',
      causaleIvaDescrizione: '',
      registroIva: '',
      segnoRegistro: '',
      protocolloProvvisorio: '',
      protocolloDefinitivo: '',
      protocolloCee: '',
      dataCompetenza: today,
      dataOperazione: today,
      imponibile: '',
      totaleImponibile: '',
      totaleImposta: '',
      totaleDocumento: '',
      ivaDetratta: '',
      ivaIndetraibile: '',
      percentualeDetraibilita: '',
      percentualeIndetraibilita: '',
      causaleIva: '',
      aliquotaIva: '',
      naturaIva: '',
      rows: [makeEmptyIvaRow(0)],
      stato: 'predisposto',
    },
    partitarioData: {
      selectedPartitaId: '',
      tipoMovimento: '',
      numeroDocumento: '',
      dataDocumento: '',
      tipoDocumento: '',
      importoOrigine: '',
      saldoResiduo: '',
      importoAperto: '',
      selectedPartitaNumeroDocumento: '',
      selectedPartitaDataDocumento: '',
      selectedPartitaTipoDocumento: '',
      selectedPartitaImportoOrigine: '',
      selectedPartitaSaldoResiduo: '',
      importoChiusura: '',
      manualImportoApertoOverride: false,
      manualImportoChiusuraOverride: false,
      segnoChiusura: 'A',
      stato: 'predisposto',
    },
    ritenutaData: {
      mode: '',
      percipienteId: '',
      percipiente: '',
      percipienteNome: '',
      codiceFiscale: '',
      causaleCu: '',
      causaleReddituale: '',
      codiceTributo: '',
      imponibile: '',
      imponibileReddito: '',
      importoCompenso: '',
      quotaNonSoggetta: '',
      sommeNonSoggette: '',
      codiceQuotaNonSoggetta: '',
      codiceSommeNonSoggette: '',
      codiceEsclusione: '',
      cassaPrevidenziale: '',
      baseImponibile: '',
      baseRitenuta: '',
      imponibileSoggettoRitenuta: '',
      aliquotaRitenuta: '',
      ritenuta: '',
      netto: '',
      importoPagamento: '',
      dataPagamento: '',
      note: '',
      escludiDaCu: false,
      manualBaseOverride: false,
      manualRitenutaOverride: false,
      manualNettoOverride: false,
      manualCompensoOverride: false,
      stato: 'predisposto',
    },
    rows: [makeEmptyRow(0), makeEmptyRow(1)],
  }
}

function resolveSelectedCausale(causaliContabili, causaleValue) {
  if (causaleValue && typeof causaleValue === 'object') {
    const byId = String(causaleValue.id || '').trim().toUpperCase()
    const byCode = String(causaleValue.codice || causaleValue.code || '').trim().toUpperCase()
    const byDescr = String(causaleValue.descrizione || causaleValue.description || causaleValue.denominazione || causaleValue.nome || '').trim().toUpperCase()
    return (Array.isArray(causaliContabili) ? causaliContabili : []).find((item) => {
      const id = String(item?.id || '').trim().toUpperCase()
      const code = String(item?.codice || item?.code || '').trim().toUpperCase()
      const label = String(item?.descrizione || item?.description || item?.denominazione || item?.nome || '').trim().toUpperCase()
      return (byId && id === byId) || (byCode && code === byCode) || (byDescr && label === byDescr)
    }) || causaleValue
  }

  const target = String(causaleValue || '').trim().toUpperCase()
  if (!target) return null
  return (Array.isArray(causaliContabili) ? causaliContabili : []).find((item) => {
    const id = String(item?.id || '').trim().toUpperCase()
    const code = String(item?.codice || item?.code || '').trim().toUpperCase()
    const label = String(item?.descrizione || item?.description || item?.denominazione || item?.nome || '').trim().toUpperCase()
    return id === target || code === target || label === target
  }) || null
}

function tabLabel(id) {
  if (id === 'iva') return 'Movimenti IVA'
  if (id === 'partitario') return 'Movimenti partitario'
  if (id === 'ritenute') return 'Ritenute'
  return 'Righe prima nota'
}

export function RegistrazioneManualeView({ societaAttiva, pianoConti = [], causaliContabili = [], causaliIva = [], onRefresh }) {
  const currentYear = new Date().getFullYear()
  const [lastExerciseUsed, setLastExerciseUsed] = useState(String(currentYear))
  const [state, setState] = useState(() => makeInitialState(String(currentYear)))
  const [draftStarted, setDraftStarted] = useState(false)
  const [activeTab, setActiveTab] = useState('rows')
  const [previewMode, setPreviewMode] = useState('overview')
  const [modalState, setModalState] = useState(null)
  const [activeCell, setActiveCell] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [gotoTarget, setGotoTarget] = useState('')
  const [partiteAperte, setPartiteAperte] = useState([])
  const [percipientiCatalog, setPercipientiCatalog] = useState([])
  const [historicalCausaleEntries, setHistoricalCausaleEntries] = useState([])
  const [causaliIvaCatalog, setCausaliIvaCatalog] = useState([])
  const [fallbackPianoConti, setFallbackPianoConti] = useState([])
  const [pianoContiLoadStatus, setPianoContiLoadStatus] = useState('idle')
  const [pianoContiLoadError, setPianoContiLoadError] = useState('')
  const rootRef = useRef(null)
  const dataRegistrazioneRef = useRef(null)
  const headerRef = useRef(null)
  const documentRef = useRef(null)
  const ivaRef = useRef(null)
  const rowsRef = useRef(null)
  const previewRef = useRef(null)
  const footerRef = useRef(null)
  const lastTemplateRowsAppliedKeyRef = useRef('')

  const selectedCausale = useMemo(() => resolveSelectedCausale(causaliContabili, state.header.causaleContabileId), [causaliContabili, state.header.causaleContabileId])
  const exerciseOptions = useMemo(() => currentYearOptions(currentYear), [currentYear])
  const selectedControparteId = String(
    state.header.cliente_fornitore_id ||
    state.header.clienteFornitoreId ||
    ''
  ).trim()
  const effectiveCausaliIva = useMemo(
    () => (Array.isArray(causaliIva) && causaliIva.length ? causaliIva : causaliIvaCatalog),
    [causaliIva, causaliIvaCatalog]
  )
  const effectivePianoConti = useMemo(
    () => (Array.isArray(pianoConti) && pianoConti.length ? pianoConti : fallbackPianoConti),
    [fallbackPianoConti, pianoConti]
  )
  const selectedContropartePartite = useMemo(() => {
    if (!selectedControparteId) return []
    return (Array.isArray(partiteAperte) ? partiteAperte : []).filter((row) => {
      const contoId = String(row?.conto_id || row?.contoId || row?.cliente_fornitore_id || row?.clienteFornitoreId || '').trim()
      return contoId === selectedControparteId
    })
  }, [partiteAperte, selectedControparteId])
  const modalContoList = effectivePianoConti
  const modalControparteList = useMemo(() => buildRegistrazioneContropartiList(effectivePianoConti), [effectivePianoConti])
  const selectedCausaleBehavior = useMemo(
    () => resolveRegistrazioneCausaleBehavior(selectedCausale || state.header.causaleContabileId || ''),
    [selectedCausale, state.header.causaleContabileId]
  )
  const selectedCausaleConfig = useMemo(
    () => buildRegistrazioneManualeUiPolicy(selectedCausaleBehavior),
    [selectedCausaleBehavior]
  )
  const rowsWithCounterpartySync = useMemo(
    () => syncCounterpartySubjectRow(state.rows, state.header),
    [state.rows, state.header]
  )
  const draftModel = useMemo(
    () =>
      buildRegistrazioneDraft(
        {
          societaId: societaAttiva?.id || '',
          header: state.header,
          rows: rowsWithCounterpartySync,
          documentData: state.documentData,
          ivaData: state.ivaData,
          partitarioData: state.partitarioData,
          ritenutaData: state.ritenutaData,
          historicalEntries: historicalCausaleEntries,
          causaliIva: effectiveCausaliIva,
          percipienti: percipientiCatalog,
        },
        {
          pianoConti: effectivePianoConti,
          causaliContabili,
          causaliIva: effectiveCausaliIva,
          percipienti: percipientiCatalog,
          config: selectedCausaleConfig,
          partite: selectedContropartePartite,
          selectedCausale,
          historicalEntries: historicalCausaleEntries,
        }
      ),
    [causaliContabili, effectiveCausaliIva, effectivePianoConti, historicalCausaleEntries, percipientiCatalog, selectedCausale, selectedCausaleConfig, selectedContropartePartite, societaAttiva?.id, state.documentData, state.header, state.ivaData, state.partitarioData, state.ritenutaData, rowsWithCounterpartySync]
  )

  const resolvedRows = draftModel.normalized.rows
  const totals = draftModel.totals
  const templateRowsDraft = draftModel.templateRowsDraft || null
  const canRunDryCommit = Boolean(draftStarted && totals?.isBalanced && draftModel.validation?.status === 'ok' && !saving)
  const dryCommitBlockReason = String(
    draftModel.validation?.blockers?.[0] ||
      draftModel.validation?.warnings?.[0] ||
      (draftStarted ? 'Bozza non ancora controllabile' : 'Avvia una nuova registrazione')
  ).trim()

  useEffect(() => {
    if (!draftStarted) return
    if (!templateRowsDraft?.applied) return
    if (!Array.isArray(templateRowsDraft.rows) || !templateRowsDraft.rows.length) return
    const templateKey = String(templateRowsDraft.templateKey || '')
    if (!templateKey) return
    const currentRowsMatchTemplate =
      Array.isArray(state.rows) &&
      state.rows.length === templateRowsDraft.rows.length &&
      state.rows.every((row) => String(row?.templateKey || '') === templateKey && Boolean(row?.templateGenerated))
    if (currentRowsMatchTemplate && areTemplateRowsInSync(state.rows, templateRowsDraft.rows)) return
    if (!canAutoApplyRegistrazioneTemplate(state.rows)) return

    lastTemplateRowsAppliedKeyRef.current = templateKey
    setState((prev) => {
      if (!canAutoApplyRegistrazioneTemplate(prev.rows)) return prev
      if (areTemplateRowsInSync(prev.rows, templateRowsDraft.rows)) return prev
      return { ...prev, rows: templateRowsDraft.rows.map((row) => ({ ...row, templateGenerated: true, templateKey })) }
    })
  }, [draftStarted, state.rows, templateRowsDraft])

  const allowedTabs = useMemo(() => {
    const baseTabs = Array.isArray(selectedCausaleConfig?.activeTabs) ? selectedCausaleConfig.activeTabs : ['rows']
    return Array.from(new Set(['rows', ...baseTabs].filter(Boolean)))
  }, [selectedCausaleConfig])

  const focusOrder = useMemo(
    () =>
      resolveRegistrazioneFocusOrder({
        config: selectedCausaleConfig,
        rowIds: state.rows.map((row) => row.id),
      }),
    [selectedCausaleConfig, state.rows]
  )

  const exerciseResolution = useMemo(
    () =>
      resolveRegistrazioneEsercizio({
        esercizio: state.header.esercizioContabile,
        dataRegistrazione: state.header.dataRegistrazione,
        lastExerciseUsed,
        currentYear,
      }),
    [currentYear, lastExerciseUsed, state.header.dataRegistrazione, state.header.esercizioContabile]
  )

  useEffect(() => {
    if (!allowedTabs.includes(activeTab)) setActiveTab(allowedTabs[0] || 'rows')
  }, [activeTab, allowedTabs])

  useEffect(() => {
    if (!societaAttiva?.id) {
      setPartiteAperte([])
      return
    }
    let alive = true
    contabilitaRepo.getPartitarioBySocieta(societaAttiva.id, { stato: 'aperta' })
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        setPartiteAperte(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!alive) return
        setPartiteAperte([])
      })
    return () => {
      alive = false
    }
  }, [societaAttiva?.id])

  useEffect(() => {
    if (!societaAttiva?.id) {
      setPercipientiCatalog([])
      return
    }
    let alive = true
    contabilitaRepo
      .getPercipientiAttivi(societaAttiva.id)
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        setPercipientiCatalog(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!alive) return
        setPercipientiCatalog([])
      })
    return () => {
      alive = false
    }
  }, [societaAttiva?.id])

  useEffect(() => {
    if (!societaAttiva?.id) {
      setCausaliIvaCatalog([])
      return
    }
    if (Array.isArray(causaliIva) && causaliIva.length) {
      setCausaliIvaCatalog([])
      return
    }
    let alive = true
    contabilitaRepo
      .getCausaliIvaAttive(societaAttiva.id)
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        setCausaliIvaCatalog(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!alive) return
        setCausaliIvaCatalog([])
      })
    return () => {
      alive = false
    }
  }, [causaliIva, societaAttiva?.id])

  useEffect(() => {
    const societaId = String(societaAttiva?.id || '').trim()
    const hasPropPianoConti = Array.isArray(pianoConti) && pianoConti.length > 0

    if (!societaId) {
      setFallbackPianoConti([])
      setPianoContiLoadStatus('idle')
      setPianoContiLoadError('')
      return
    }

    if (hasPropPianoConti) {
      setFallbackPianoConti([])
      setPianoContiLoadStatus('prop')
      setPianoContiLoadError('')
      return
    }

    let alive = true
    setPianoContiLoadStatus('loading')
    setPianoContiLoadError('')
    contabilitaRepo
      .getPianoConti(societaId)
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        const rows = Array.isArray(data) ? data : []
        if (rows.length > 0) {
          setFallbackPianoConti(rows)
          setPianoContiLoadStatus('loaded')
          setPianoContiLoadError('')
          return
        }
        return loadPianoContiFromLocalApi(societaId)
          .then((apiRows) => {
            if (!alive) return
            const safeRows = Array.isArray(apiRows) ? apiRows : []
            setFallbackPianoConti(safeRows)
            setPianoContiLoadStatus(safeRows.length > 0 ? 'api' : 'empty')
            setPianoContiLoadError(
              safeRows.length > 0 ? '' : 'Piano dei conti non caricato per la società selezionata'
            )
          })
          .catch((apiError) => {
            if (!alive) return
            setFallbackPianoConti([])
            setPianoContiLoadStatus('error')
            setPianoContiLoadError(apiError?.message || 'Piano dei conti non caricato per la società selezionata')
          })
      })
      .catch((error) => {
        if (!alive) return
        loadPianoContiFromLocalApi(societaId)
          .then((apiRows) => {
            if (!alive) return
            const safeRows = Array.isArray(apiRows) ? apiRows : []
            setFallbackPianoConti(safeRows)
            setPianoContiLoadStatus(safeRows.length > 0 ? 'api' : 'empty')
            setPianoContiLoadError(
              safeRows.length > 0 ? '' : 'Piano dei conti non caricato per la società selezionata'
            )
          })
          .catch((apiError) => {
            if (!alive) return
            setFallbackPianoConti([])
            setPianoContiLoadStatus('error')
            setPianoContiLoadError(apiError?.message || error?.message || 'Piano dei conti non caricato per la società selezionata')
          })
      })

    return () => {
      alive = false
    }
  }, [pianoConti, societaAttiva?.id])

  useEffect(() => {
    if (!societaAttiva?.id || !selectedCausale?.codice) {
      setHistoricalCausaleEntries([])
      return
    }
    let alive = true
    const exercise = String(state.header.esercizioContabile || currentYear || new Date().getFullYear()).trim()
    const year = Number.parseInt(exercise, 10)
    const dateFrom = Number.isFinite(year) ? `${year}-01-01` : `${new Date().getFullYear()}-01-01`
    const dateTo = todayIso()
    contabilitaRepo
      .getPrimaNotaConsultazioneRows(societaAttiva.id, {
        dateFrom,
        dateTo,
        causaliContabili: [selectedCausale.codice],
      })
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        setHistoricalCausaleEntries(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!alive) return
        setHistoricalCausaleEntries([])
      })
    return () => {
      alive = false
    }
  }, [currentYear, selectedCausale?.codice, societaAttiva?.id, state.header.esercizioContabile])

  useEffect(() => {
    if (!gotoTarget) return
    const map = {
      header: headerRef,
      document: documentRef,
      iva: ivaRef,
      rows: rowsRef,
      preview: previewRef,
      footer: footerRef,
    }
    const ref = map[gotoTarget]
    if (ref?.current?.scrollIntoView) ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [gotoTarget])

  const focusDataRegistrazione = () => {
    const el = dataRegistrazioneRef.current
    if (el?.focus) {
      el.focus()
      if (el.select) el.select()
      return true
    }
    return false
  }

  const applyHeaderPatch = (field, value) => {
    setError('')
    setSuccess('')
    setState((prev) => ({
      ...prev,
      header: { ...prev.header, [field]: value },
      documentData:
        field === 'totaleDocumento'
          ? { ...prev.documentData, totaleDocumento: value }
          : prev.documentData,
      ivaData:
        field === 'totaleDocumento'
          ? { ...prev.ivaData, totaleDocumento: value }
          : prev.ivaData,
    }))
  }

  const applyDocumentPatch = (field, value) => {
    setError('')
    setSuccess('')
    setState((prev) => ({
      ...prev,
      documentData: { ...prev.documentData, [field]: value },
      header:
        field === 'totaleDocumento'
          ? { ...prev.header, totaleDocumento: value }
          : prev.header,
      ivaData:
        field === 'totaleDocumento'
          ? { ...prev.ivaData, totaleDocumento: value }
          : prev.ivaData,
    }))
  }

  const applyIvaPatch = (field, value) => {
    setError('')
    setSuccess('')
    if (field && typeof field === 'object' && !Array.isArray(field)) {
      setState((prev) => ({
        ...prev,
        ivaData: { ...prev.ivaData, ...field },
        header:
          Object.prototype.hasOwnProperty.call(field, 'totaleDocumento')
            ? { ...prev.header, totaleDocumento: field.totaleDocumento }
            : prev.header,
        documentData:
          Object.prototype.hasOwnProperty.call(field, 'totaleDocumento')
            ? { ...prev.documentData, totaleDocumento: field.totaleDocumento }
            : prev.documentData,
      }))
      return
    }
    setState((prev) => ({
      ...prev,
      ivaData: { ...prev.ivaData, [field]: value },
      header:
        field === 'totaleDocumento'
          ? { ...prev.header, totaleDocumento: value }
          : prev.header,
      documentData:
        field === 'totaleDocumento'
        ? { ...prev.documentData, totaleDocumento: value }
        : prev.documentData,
    }))
  }

  const getCurrentIvaRows = () => {
    const rows = Array.isArray(state.ivaData?.rows) ? state.ivaData.rows : []
    return rows.length ? rows : [makeEmptyIvaRow(0)]
  }

  const handleAddIvaRow = ({ focusAfterAdd = true } = {}) => {
    const currentRows = getCurrentIvaRows()
    const nextRows = [...currentRows, makeEmptyIvaRow(currentRows.length)]
    setState((prev) => ({
      ...prev,
      ivaData: {
        ...prev.ivaData,
        rows: nextRows,
      },
    }))
    return focusAfterAdd ? nextRows[nextRows.length - 1]?.id || null : nextRows[nextRows.length - 1]?.id || null
  }

  const handleDeleteIvaRow = (rowId) => {
    const currentRows = getCurrentIvaRows()
    if (!rowId) return null
    const nextRows = currentRows.filter((row) => String(row.id || '') !== String(rowId || ''))
    const finalRows = nextRows.length ? nextRows : [makeEmptyIvaRow(0)]
    setState((prev) => ({
      ...prev,
      ivaData: {
        ...prev.ivaData,
        rows: finalRows,
      },
    }))
    return finalRows[0]?.id || null
  }

  const applyPartitarioPatch = (field, value) => {
    setError('')
    setSuccess('')
    setState((prev) => ({
      ...prev,
      partitarioData: { ...prev.partitarioData, [field]: value },
    }))
  }

  const applyRitenutePatch = (field, value) => {
    setError('')
    setSuccess('')
    setState((prev) => ({
      ...prev,
      ritenutaData: {
        ...prev.ritenutaData,
        ...(field === 'importoCompenso' || field === 'imponibileReddito' || field === 'imponibile'
          ? { importoCompenso: value, imponibileReddito: value, imponibile: value, manualCompensoOverride: true }
          : {}),
        ...(field === 'baseImponibile' || field === 'baseRitenuta' || field === 'imponibileSoggettoRitenuta'
          ? { baseImponibile: value, baseRitenuta: value, imponibileSoggettoRitenuta: value, manualBaseOverride: true }
          : {}),
        ...(field === 'ritenuta' ? { manualRitenutaOverride: true } : {}),
        ...(field === 'netto' ? { manualNettoOverride: true } : {}),
        [field]: value,
      },
    }))
  }

  const applyRowPatch = (rowId, patch, options = {}) => {
    setError('')
    setSuccess('')
    const source = String(options.source || 'manual')
    const currentRow = state.rows.find((row) => String(row.id || '') === String(rowId || '')) || null
    const nextPatch = normalizeRegistrazioneRowPatch(patch, { ...options, previousRow: currentRow })
    const shouldApplyResidual = Boolean(options.applyResidual)
    const amountChanged = Object.prototype.hasOwnProperty.call(nextPatch, 'dare') || Object.prototype.hasOwnProperty.call(nextPatch, 'avere')
    if (source === 'manual') {
      nextPatch.manualEdited = true
    }

    setState((prev) => {
      let rows = prev.rows.map((row) => (row.id === rowId ? { ...row, ...nextPatch } : row))

      if (shouldApplyResidual) {
        const residualResult = applyRegistrazioneAutoResidualToRow(rows, options.residualRowId || rowId, {
          activeRowId: options.activeRowId || rowId,
        })
        rows = residualResult.rows
      }

      if (source === 'manual' && amountChanged) {
        const currentIndex = rows.findIndex((row) => String(row.id || '') === String(rowId || ''))
        const nextIndex = currentIndex >= 0 ? currentIndex + 1 : -1
        if (nextIndex >= 0 && nextIndex < rows.length) {
          const cascade = applyRegistrazioneAutoResidualChainToRows(rows, nextIndex, {
            activeRowId: rows[currentIndex]?.id || rowId,
          })
          rows = cascade.rows
        }
      }

      return { ...prev, rows }
    })
  }

  const applyContoToRow = (rowId, conto) => {
    if (!rowId || !conto) return
    const selected = buildRegistrazioneContoSelection(conto, conto?.__label || conto?.conto_label || conto?.displayLabel || resolveRegistrazioneContoLabel(conto))
    const hierarchy = resolveContoHierarchyView(selected)
    if (!hierarchy.isSelectableForRegistrazione) {
      setError('Per registrare serve un sottoconto')
      return null
    }
    const contoLabel = selected.__label || resolveRegistrazioneContoLabel(selected)
    const contoDescrizione = selected.conto_descrizione || resolveRegistrazioneContoDescrizione(selected)
    let focusField = 'dare'
    setState((prev) => {
      const patchedRows = prev.rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              contoQuery: contoLabel || contoDescrizione,
              conto_id: selected.id || selected.value || selected.codice || selected.code || '',
              conto_codice: String(selected.codice || selected.code || selected.sigla || selected.id || '').trim(),
              conto_descrizione: contoDescrizione,
              manualEdited: true,
            }
          : row
      )
      const residualResult = applyRegistrazioneAutoResidualToRow(patchedRows, rowId, { activeRowId: rowId })
      focusField = resolveRowFieldAfterContoSelection(
        residualResult.rows.find((row) => String(row.id || '') === String(rowId || '')) || {},
        residualResult
      )
      return { ...prev, rows: residualResult.rows }
    })
    return focusField
  }

  const buildCounterpartyHeader = (prevHeader, { contoId = '', contoCode = '', contoName = '', soggetto = '' }) => {
    const nextSoggetto = String(soggetto || contoName || '').trim()
    const nextId = String(contoId || '').trim()
    const nextCode = String(contoCode || '').trim()
    const nextName = String(contoName || nextSoggetto || '').trim()

    return {
      ...prevHeader,
      soggetto: nextSoggetto,
      clienteFornitoreId: nextId,
      cliente_fornitore_id: nextId,
      clienteFornitoreCodice: nextCode,
      cliente_fornitore_codice: nextCode,
      clienteFornitoreNome: nextName,
      cliente_fornitore_nome: nextName,
    }
  }

  function isTemplateSubjectRowCandidate(row = {}) {
    if (!row || row.manualEdited || row.manualAmountOverride) return false
    const role = String(row.templateRole || row.ruolo || '').trim().toLowerCase()
    if (role === 'soggetto') return true
    const hasTemplateMarkers = Boolean(row.templateGenerated || row.templateScope || row.isTemplateScope)
    if (!hasTemplateMarkers) return false
    const rowText = [row.contoQuery, row.conto_descrizione, row.conto_codice, row.contoQueryHint, row.templateSource]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (/fornitor|client|debiti v\/fornitori|crediti v\/clienti/.test(rowText)) return true
    const selection = buildRegistrazioneContoSelection(row, row.contoQuery || row.conto_descrizione || row.conto_codice || '')
    const hierarchy = resolveContoHierarchyView(selection)
    return Boolean(hierarchy && !hierarchy.isSelectableForRegistrazione)
  }

  function syncCounterpartySubjectRow(rows = [], selected = {}) {
    const subjectSelection = buildRegistrazioneContoSelection(
      selected,
      selected?.__label || selected?.conto_label || selected?.displayLabel || resolveRegistrazioneContoLabel(selected)
    )
    const hierarchy = resolveContoHierarchyView(subjectSelection)
    const contoDescrizione = subjectSelection.conto_descrizione || resolveRegistrazioneContoDescrizione(subjectSelection)
    const contoQuery = subjectSelection.__label || (subjectSelection.codice && contoDescrizione ? `${subjectSelection.codice} - ${contoDescrizione}` : contoDescrizione || subjectSelection.codice || '')
    let updated = false

    return rows.map((row) => {
      if (updated || !isTemplateSubjectRowCandidate(row)) return row
      if (row.manualEdited || row.manualAmountOverride) return row
      updated = true
      return {
        ...row,
        templateRole: 'soggetto',
        subjectAccountSynced: true,
        templateGenerated: row.templateGenerated !== false,
        templateScope: false,
        isTemplateScope: false,
        contoQuery,
        conto_id: String(subjectSelection.id || subjectSelection.value || subjectSelection.codice || subjectSelection.code || '').trim(),
        conto_codice: String(subjectSelection.codice || subjectSelection.code || subjectSelection.sigla || subjectSelection.id || '').trim(),
        conto_descrizione: contoDescrizione,
        hierarchyType: String(hierarchy?.hierarchyType || subjectSelection.hierarchyType || row.hierarchyType || '').trim(),
        conto_resolved_finale: Boolean(hierarchy?.isSelectableForRegistrazione),
        contoQueryHint: '',
        templateSource: 'subject_header_sync',
        templateConfidence: 1,
        templateReasons: ['Conto risolto dal soggetto selezionato in testata'],
        templateWarnings: [],
      }
    })
  }

  const applyCounterpartySelection = (conto) => {
    if (!conto) return 'totaleDocumento'
    setError('')
    setSuccess('')
    const selected = buildRegistrazioneContoSelection(conto, conto?.__label || conto?.conto_label || conto?.displayLabel || resolveRegistrazioneContoLabel(conto))
    const contoId = String(selected.id || selected.value || selected.codice || selected.code || '').trim()
    const contoCode = String(selected.codice || selected.code || selected.sigla || selected.id || '').trim()
    const selectedLabel = selected.__label || resolveRegistrazioneContoLabel(selected)
    const contoDescrizione = selected.conto_descrizione || resolveRegistrazioneContoDescrizione(selected)
    setState((prev) => ({
      ...prev,
      header: buildCounterpartyHeader(prev.header, {
        contoId,
        contoCode,
        contoName: selectedLabel || contoDescrizione,
        soggetto: selectedLabel,
      }),
      rows: syncCounterpartySubjectRow(prev.rows, selected),
    }))
    setTimeout(() => {
      const nextField = rootRef.current?.querySelector?.('[data-reg-key="totaleDocumento"]')
      if (nextField?.focus) nextField.focus()
    }, 0)
    return 'totaleDocumento'
  }

  const handleAddRow = () => {
    const newRow = makeEmptyRow(state.rows.length)
    setState((prev) => {
      const rows = [...prev.rows, newRow]
      const residual = applyRegistrazioneAutoResidualChainToRows(rows, newRow.id, { activeRowId: newRow.id })
      return { ...prev, rows: residual.rows }
    })
    setActiveCell({ rowId: newRow.id, field: 'conto' })
    setTimeout(() => {
      focusRowField(rootRef.current, newRow.id, 'conto')
    }, 0)
    return newRow.id
  }

  const handleDeleteRow = (rowId) => {
    let focusRowId = null
    setState((prev) => {
      const rowIndex = prev.rows.findIndex((row) => String(row.id || '') === String(rowId || ''))
      const nextRows = prev.rows.filter((row) => row.id !== rowId)
      const normalizedRows = nextRows.length >= 2 ? nextRows : [makeEmptyRow(0), makeEmptyRow(1)]
      const cascadeStart = rowIndex >= 0 ? Math.min(rowIndex, normalizedRows.length - 1) : 0
      const cascade = applyRegistrazioneAutoResidualChainToRows(normalizedRows, cascadeStart, {
        activeRowId: normalizedRows[cascadeStart]?.id || '',
      })
      const recalculatedRows = cascade.rows
      const focusRow = recalculatedRows[Math.max(0, Math.min(rowIndex - 1, recalculatedRows.length - 1))] || recalculatedRows[0] || null
      focusRowId = focusRow?.id || null
      return { ...prev, rows: recalculatedRows }
    })
    if (focusRowId) {
      setTimeout(() => {
        setActiveCell({ rowId: focusRowId, field: 'conto' })
        focusRowField(rootRef.current, focusRowId, 'conto')
      }, 0)
    }
  }

  const resetDraft = (preserveExercise = true, clearMessages = true, exerciseOverride = null, activateDraft = false) => {
    const nextExercise = preserveExercise ? String(exerciseOverride || lastExerciseUsed || currentYear) : String(currentYear)
    setState(makeInitialState(nextExercise))
    setActiveTab('rows')
    setPreviewMode('overview')
    setModalState(null)
    setActiveCell(null)
    setGotoTarget('')
    setDraftStarted(Boolean(activateDraft))
    lastTemplateRowsAppliedKeyRef.current = ''
    if (clearMessages) {
      setError('')
      setSuccess('')
    }
    if (activateDraft) {
      setTimeout(() => focusDataRegistrazione(), 0)
    }
  }

  const handleNewRegistration = () => resetDraft(true, true, state.header.esercizioContabile, true)
  const handleReset = () => resetDraft(true, true, state.header.esercizioContabile, false)

  const scrollToSection = (target) => {
    setGotoTarget(target)
  }

  const confirmExerciseUpdate = () => {
    if (!exerciseResolution?.needsConfirm) return
    applyHeaderPatch('esercizioContabile', exerciseResolution.suggestedExercise)
  }

  const closeOverlay = () => {
    if (modalState) {
      setModalState(null)
      return
    }
    if (previewMode === 'partite') {
      setPreviewMode('overview')
    }
  }

  const openAccountPicker = (payload = {}) => {
    const rowId = payload?.rowId || activeCell?.rowId || state.rows[0]?.id || null
    setModalState({ type: 'picker', rowId })
  }

  const openAccountSearch = (payload = {}) => {
    const rowId = payload?.rowId || activeCell?.rowId || state.rows[0]?.id || null
    setModalState({ type: 'search', rowId })
  }

  const openCounterpartyPicker = (payload = {}) => {
    setModalState({ type: 'counterparty-picker', rowId: payload?.rowId || null })
  }

  const openCounterpartySearch = (payload = {}) => {
    setModalState({ type: 'counterparty-search', rowId: payload?.rowId || null })
  }

  const openPartite = () => {
    if (!selectedCausaleConfig?.supportsPartitePanel) return
    setPreviewMode('partite')
    scrollToSection('preview')
  }

  const resolveTemplateRowsDraft = (force = false) =>
    buildRegistrazioneRowsFromTemplateResolved(
      {
        societaId: societaAttiva?.id || '',
        causale: selectedCausale,
        selectedCausale,
        templateRows:
          selectedCausale?.righe_prima_nota_template ||
          selectedCausale?.righePrimaNotaTemplate ||
          selectedCausale?.righe_prima_nota ||
          [],
        documentData: state.documentData,
        ivaDraft: draftModel.ivaDraft,
        soggetto: state.header,
        causaleBehavior: selectedCausaleConfig,
        historicalCausaleStructure: buildCausaleStructureHistory({
          societaId: societaAttiva?.id || '',
          causaleCodice: selectedCausale?.codice || selectedCausale?.id || state.header.causaleContabileId || '',
          historicalEntries: historicalCausaleEntries,
        }),
        subjectAccountDefaults: {
          conto_id: state.header.clienteFornitoreId || state.header.cliente_fornitore_id || '',
          conto_codice: state.header.clienteFornitoreCodice || state.header.cliente_fornitore_codice || '',
          conto_descrizione: state.header.clienteFornitoreNome || state.header.cliente_fornitore_nome || state.header.soggetto || '',
        },
        subjectAccountHistory: null,
        currentRows: state.rows,
      },
      { force }
    )

  const applySuggestedTemplateRows = (force = false) => {
    setError('')
    const result = resolveTemplateRowsDraft(force)
    if (!result?.rows?.length) {
      setSuccess('Nessun template righe configurato')
      return
    }

    if (!result.applied && !force) {
      if (typeof window !== 'undefined' && window.confirm) {
        const confirmed = window.confirm('Le righe sono già state modificate manualmente. Sostituirle con il template causale?')
        if (!confirmed) return
      } else {
        return
      }
      applySuggestedTemplateRows(true)
      return
    }

    lastTemplateRowsAppliedKeyRef.current = String(result.templateKey || '')
    setState((prev) => ({
      ...prev,
      rows: Array.isArray(result.rows) ? result.rows.map((row) => ({ ...row, templateGenerated: true, templateKey: String(result.templateKey || '') })) : prev.rows,
    }))
    setActiveCell({ rowId: result.rows[0]?.id || '', field: 'conto' })
    setTimeout(() => {
      const firstRow = result.rows[0]?.id || ''
      if (firstRow) focusRowField(rootRef.current, firstRow, 'conto')
    }, 0)
    setSuccess(result.reasons?.[0] || 'Righe proposte da template causale')
  }

  const applySbilancio = (payload = {}) => {
    const activeRowId = payload?.rowId || activeCell?.rowId || null
    if (!activeRowId) {
      setSuccess('Nessun residuo da applicare')
      return
    }
    const result = applyRegistrazioneAutoResidualToRow(state.rows, activeRowId, { activeRowId })
    if (result?.applied && Array.isArray(result.rows)) {
      setState((prev) => ({ ...prev, rows: result.rows }))
      setSuccess(`Residuo applicato: € ${formatMoney(result.amount)} in ${result.side === 'dare' ? 'Dare' : 'Avere'}`)
      return
    }
    setSuccess(result?.reason === 'manual_override' ? 'Importo manuale già presente' : 'Nessun residuo da applicare')
  }

  const handleSave = async () => {
    setError('')
    setSuccess('')
    if (!societaAttiva?.id) {
      setError('Seleziona una società attiva prima di salvare.')
      return
    }
    if (REAL_SAVE_TEMPORARILY_BLOCKED) {
      setError('Salvataggio reale disabilitato. Usa Controlla registrazione.')
      return
    }
    if (draftModel.validation.status === 'blocked') {
      setError(draftModel.validation.blockers.join(' · '))
      return
    }
    setSaving(true)
    try {
      const result = await persistPrimaNotaDraft({ db: sb, draft: draftModel.draft })
      if (result?.error) {
        setError(result.error?.message || String(result.error))
        return
      }
      setSuccess(`Registrazione salvata con ID ${result?.data?.prima_nota_id || 'n/d'}`)
      setLastExerciseUsed(state.header.esercizioContabile || lastExerciseUsed)
      resetDraft(true, false, state.header.esercizioContabile, false)
      onRefresh?.()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleControlRegistration = () => {
    setError('')
    setSuccess('')
    if (!draftStarted) {
      setError('Avvia una nuova registrazione prima del controllo.')
      return
    }
    if (!draftModel.validation || draftModel.validation.status !== 'ok' || !totals?.isBalanced) {
      const reason = draftModel.validation?.blockers?.[0] || draftModel.validation?.warnings?.[0] || 'Bozza non ancora controllabile'
      setError(reason)
      return
    }
    setSuccess('Controllo registrazione completato. Nessuna scrittura reale eseguita.')
    setPreviewMode('overview')
  }

  useRegistrazioneKeyboardShortcuts({
    rootRef,
    onNewRegistration: handleNewRegistration,
    onSave: handleSave,
    onAddRow: handleAddRow,
    onDeleteRow: handleDeleteRow,
    onAddIvaRow: handleAddIvaRow,
    onDeleteIvaRow: handleDeleteIvaRow,
    onOpenAccountPicker: openAccountPicker,
    onOpenAccountSearch: openAccountSearch,
    onOpenCounterpartyPicker: openCounterpartyPicker,
    onOpenCounterpartySearch: openCounterpartySearch,
    onApplySbilancio: applySbilancio,
    onOpenPartite: openPartite,
    onCloseActiveOverlay: closeOverlay,
    isOverlayOpen: Boolean(modalState),
    isEnabled: true,
    canOpenPartite: Boolean(selectedCausaleConfig?.supportsPartitePanel),
    focusDataRegistrazione,
    activeCell,
  })

  if (!societaAttiva) return null

  const activePanels = [
    selectedCausaleConfig?.showIvaPanel ? 'IVA' : null,
    selectedCausaleConfig?.showPartitario ? 'Partitario' : null,
    selectedCausaleConfig?.showRitenute ? 'Ritenute' : null,
  ].filter(Boolean)

  const topPanels = [
    <div key="header" ref={headerRef} style={{ display: 'flex' }}>
        <RegistrazioneHeaderForm
          header={state.header}
          onChange={applyHeaderPatch}
          pianoConti={effectivePianoConti}
          causaliContabili={causaliContabili}
              config={selectedCausaleConfig}
          dataRegistrazioneRef={dataRegistrazioneRef}
          focusOrder={focusOrder}
        disabled={!draftStarted}
      />
    </div>,
  ]

  const targetRowId = modalState?.rowId || activeCell?.rowId || state.rows[0]?.id || null
  const targetRow = state.rows.find((row) => String(row.id || '') === String(targetRowId || '')) || null

  return (
    <div className="erp-view" style={REG_PAGE_STYLE} ref={rootRef}>
      <div
        style={{
          ...REG_CONTAINER_STYLE,
          minHeight: '100%',
          paddingBottom: '0.75rem',
        }}
      >
        <RegistrazioneWorkspaceHeader
          societaAttiva={societaAttiva}
          esercizio={state.header.esercizioContabile}
          exerciseOptions={exerciseOptions}
          onExerciseChange={(value) => applyHeaderPatch('esercizioContabile', value)}
          onSave={handleSave}
          onReset={handleReset}
          onNewRegistration={handleNewRegistration}
          onGotoChange={scrollToSection}
          gotoTarget={gotoTarget}
          saving={saving}
          realSaveBlocked={REAL_SAVE_TEMPORARILY_BLOCKED}
          draftStarted={draftStarted}
        />

        <RegistrazioneContextBanner
          esercizio={state.header.esercizioContabile}
          exerciseWarning={exerciseResolution.warning}
          selectedCausale={selectedCausale}
          selectedCausaleConfig={selectedCausaleConfig}
          selectedCausaleBehavior={selectedCausaleConfig}
          activePanels={activePanels}
          onConfirmExerciseUpdate={confirmExerciseUpdate}
        />

        <div className="alert alert-warn" style={{ marginBottom: '.55rem', padding: '.45rem .72rem', borderRadius: 12, display: 'block', lineHeight: 1.35 }}>
          <strong>Salvataggio reale disabilitato.</strong>
          <div style={{ fontSize: '.75rem', marginTop: '.15rem' }}>
            Usa <strong>Controlla registrazione</strong> per il dry-run. Il salvataggio reale resta bloccato in questa fase.
          </div>
        </div>

        <div
          className={Array.isArray(effectivePianoConti) && effectivePianoConti.length > 0 ? 'alert alert-info' : 'alert alert-err'}
          style={{ marginBottom: '.55rem', padding: '.45rem .72rem', borderRadius: 12, display: 'block', lineHeight: 1.35 }}
        >
          <strong>Piano conti</strong>
          <div style={{ fontSize: '.75rem', marginTop: '.15rem' }}>
            {Array.isArray(effectivePianoConti) && effectivePianoConti.length > 0
              ? `Caricato ${effectivePianoConti.length} conto/i per la società selezionata.`
              : pianoContiLoadError || 'Piano dei conti non caricato per la società selezionata'}
          </div>
        </div>

        {error ? (
          <div className="bdg bdg-red" style={{ marginBottom: '.55rem', padding: '.5rem .72rem', borderRadius: 12, display: 'block', lineHeight: 1.35 }}>
            {error}
          </div>
        ) : null}
        {success ? (
          <div className="bdg bdg-green" style={{ marginBottom: '.55rem', padding: '.5rem .72rem', borderRadius: 12, display: 'block', lineHeight: 1.35 }}>
            {success}
          </div>
        ) : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '.7rem', alignItems: 'stretch', marginBottom: '.7rem' }}>
          {topPanels}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.72fr) minmax(360px, .92fr)',
            gap: '.75rem',
            alignItems: 'start',
          }}
        >
          <div ref={rowsRef}>
            <RegistrazioneTabs
              tabs={allowedTabs.map((id) => ({ id, label: tabLabel(id) }))}
              activeTab={activeTab}
              onChange={setActiveTab}
            />

            {!draftStarted ? (
              <div className="card" style={{ margin: 0, padding: '.95rem', borderRadius: 18, background: 'linear-gradient(180deg, rgba(19,45,70,.82), rgba(12,31,49,.9))', border: '1px solid rgba(96,165,250,.1)' }}>
                <div style={{ display: 'grid', gap: '.55rem' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 800, color: 'var(--tx)' }}>Nuova registrazione</div>
                  <div style={{ fontSize: '.74rem', color: 'rgba(188,204,226,.78)', lineHeight: 1.45 }}>
                    Premi <strong>ALT+N</strong> oppure usa il pulsante dedicato per iniziare una nuova scrittura. Solo dopo si attivano i blocchi da compilare.
                  </div>
                  <button type="button" className="btn" onClick={handleNewRegistration} style={{ width: 'fit-content' }}>
                    Nuova registrazione
                  </button>
                </div>
              </div>
            ) : activeTab === 'rows' ? (
              <RegistrazioneRowsTable
                rows={rowsWithCounterpartySync}
                resolvedRows={resolvedRows}
                pianoConti={effectivePianoConti}
              onChangeRow={applyRowPatch}
              onAddRow={handleAddRow}
              onDeleteRow={handleDeleteRow}
              onOpenAccountPicker={openAccountPicker}
              onOpenAccountSearch={openAccountSearch}
              onApplySbilancio={applySbilancio}
              onOpenPartite={openPartite}
              activeCell={activeCell}
              onFocusCell={(rowId, field) => setActiveCell({ rowId, field })}
              focusOrder={focusOrder}
              totals={totals}
              validation={draftModel.validation}
              disabled={!draftStarted}
              templateNotice={
                templateRowsDraft?.source === 'causale_template'
                  ? 'Righe proposte da template causale'
                  : templateRowsDraft?.source === 'causale_structure_history'
                    ? 'Righe proposte da storico causale'
                    : templateRowsDraft?.source === 'behavior_fallback'
                      ? 'Righe proposte da fallback causale'
                      : templateRowsDraft?.source === 'none'
                        ? 'Nessun template righe configurato'
                        : ''
              }
              templateActionLabel={!templateRowsDraft?.applied && templateRowsDraft?.source && templateRowsDraft?.source !== 'none' ? 'Applica righe suggerite' : ''}
              onApplySuggestedRows={!templateRowsDraft?.applied && templateRowsDraft?.source && templateRowsDraft?.source !== 'none' ? () => applySuggestedTemplateRows(false) : null}
            />
            ) : activeTab === 'iva' ? (
              <RegistrazioneIvaPanel
                ivaData={state.ivaData}
                onChange={applyIvaPatch}
                onAddRow={handleAddIvaRow}
                onDeleteRow={handleDeleteIvaRow}
                focusOrder={focusOrder}
                disabled={!draftStarted}
                behavior={selectedCausaleConfig}
                draft={draftModel.ivaDraft}
                causaliIva={effectiveCausaliIva}
              />
            ) : activeTab === 'partitario' ? (
              <RegistrazionePartitarioPanel
                header={state.header}
                partitarioData={state.partitarioData}
                partite={selectedContropartePartite}
                selectedCausale={selectedCausale}
                onChange={applyPartitarioPatch}
                onApplySelected={(row) => {
                  if (!row) return
                  const saldoRaw = row.saldoResiduo ?? row.importo_residuo ?? row.saldo ?? 0
                  const saldo = Number.parseFloat(String(saldoRaw).replace(',', '.')) || 0
                  setState((prev) => ({
                    ...prev,
                    partitarioData: {
                      ...prev.partitarioData,
                      selectedPartitaId: String(row.id || ''),
                      selectedPartitaNumeroDocumento: String(row.numeroDocumento || row.numero_documento || ''),
                      selectedPartitaDataDocumento: String(row.dataDocumento || row.data_documento || ''),
                      selectedPartitaTipoDocumento: String(row.tipoDocumento || row.tipo_documento || ''),
                      selectedPartitaImportoOrigine: String(row.importoOrigine || row.importo_originale || row.totale || 0),
                      selectedPartitaSaldoResiduo: String(saldo),
                      importoChiusura: String(Math.abs(saldo)),
                      segnoChiusura: saldo < 0 ? 'D' : 'A',
                      tipoMovimento: 'chiusura',
                      manualImportoApertoOverride: false,
                      manualImportoChiusuraOverride: false,
                      stato: 'predisposto',
                    },
                  }))
                  setPreviewMode('partite')
                  scrollToSection('preview')
                }}
                focusOrder={focusOrder}
                disabled={!draftStarted}
                behavior={selectedCausaleConfig}
                draft={draftModel.partitarioDraft}
                validation={draftModel.partitarioDraft?.validation}
              />
            ) : activeTab === 'ritenute' ? (
              <RegistrazioneRitenutePanel
                ritenutaData={state.ritenutaData}
                onChange={applyRitenutePatch}
                focusOrder={focusOrder}
                disabled={!draftStarted}
                behavior={selectedCausaleConfig}
                draft={draftModel.ritenutaDraft}
                percipienti={percipientiCatalog}
              />
            ) : null}
          </div>

          <div ref={previewRef} style={{ minHeight: 0 }}>
            <RegistrazionePreviewPanel
              header={state.header}
              selectedCausale={selectedCausale}
              totals={totals}
              validation={draftModel.validation}
              dryRunReady={canRunDryCommit}
              dryRunBlockedReason={dryCommitBlockReason}
              onControlRegistration={handleControlRegistration}
              showPartite={Boolean(selectedCausaleConfig?.showPartitario)}
              partite={selectedContropartePartite}
              mode={previewMode}
              onSelectPartita={() => setPreviewMode('overview')}
              documentDraft={draftModel.documentDraft}
              ivaDraft={draftModel.ivaDraft}
              partitarioDraft={draftModel.partitarioDraft}
              ritenutaDraft={draftModel.ritenutaDraft}
            />
            {previewMode === 'partite' && selectedCausaleConfig?.showPartitario ? (
              <div style={{ marginTop: '.45rem', fontSize: '.62rem', color: 'rgba(188,204,226,.72)' }}>
                Partite in evidenza tramite scorciatoia F9.
              </div>
            ) : null}
          </div>
        </div>

        <RegistrazioneTotalsBar totals={totals} validation={draftModel.validation} />

        <div ref={footerRef}>
          <RegistrazioneShortcutFooter />
        </div>
      </div>

        <RegistrazioneAccountPickerModal
          open={modalState?.type === 'picker'}
          conti={modalContoList}
          activeContoId={targetRow?.conto_id || ''}
          selectionMode="registrazione"
          emptyMessage={
            pianoContiLoadError ||
            (pianoContiLoadStatus === 'empty' || pianoContiLoadStatus === 'error'
              ? 'Piano dei conti non caricato per la società selezionata'
              : 'Nessun conto disponibile')
          }
          onClose={() => setModalState(null)}
          onSelect={(conto) => {
            const nextField = applyContoToRow(targetRowId, conto) || 'dare'
          setActiveCell({ rowId: targetRowId, field: nextField })
          setModalState(null)
          setTimeout(() => {
            const rowInput = rootRef.current?.querySelector?.('[data-reg-key="row:' + String(targetRowId) + ':' + String(nextField) + '"]')
            if (rowInput?.focus) rowInput.focus()
          }, 0)
        }}
      />
        <RegistrazioneAccountSearchModal
          open={modalState?.type === 'search'}
          conti={modalContoList}
          activeContoId={targetRow?.conto_id || ''}
          selectionMode="registrazione"
          emptyMessage={
            pianoContiLoadError ||
            (pianoContiLoadStatus === 'empty' || pianoContiLoadStatus === 'error'
              ? 'Piano dei conti non caricato per la società selezionata'
              : 'Nessun conto disponibile')
          }
          onClose={() => setModalState(null)}
          onSelect={(conto) => {
            const nextField = applyContoToRow(targetRowId, conto) || 'dare'
          setActiveCell({ rowId: targetRowId, field: nextField })
          setModalState(null)
          setTimeout(() => {
            const rowInput = rootRef.current?.querySelector?.('[data-reg-key="row:' + String(targetRowId) + ':' + String(nextField) + '"]')
            if (rowInput?.focus) rowInput.focus()
          }, 0)
        }}
      />
        <RegistrazioneAccountPickerModal
          open={modalState?.type === 'counterparty-picker'}
          conti={modalControparteList}
          activeContoId={state.header.clienteFornitoreId || state.header.cliente_fornitore_id || ''}
          title="Cliente / Fornitore"
          subtitle="F2 selezione rapida"
          introText="Digita codice o descrizione per salto rapido. La lista mostra solo i conti compatibili con la controparte."
          emptyMessage={
            pianoContiLoadError ||
            (pianoContiLoadStatus === 'empty' || pianoContiLoadStatus === 'error'
              ? 'Piano dei conti non caricato per la società selezionata'
              : 'Piano dei conti non caricato o nessuna controparte disponibile')
          }
          bufferLabel="Buffer"
          selectionMode="template"
          onClose={() => setModalState(null)}
          onSelect={(conto) => {
            applyCounterpartySelection(conto)
          setModalState(null)
          setActiveCell({ rowId: null, field: 'soggetto' })
        }}
      />
        <RegistrazioneAccountSearchModal
          open={modalState?.type === 'counterparty-search'}
          conti={modalControparteList}
          activeContoId={state.header.clienteFornitoreId || state.header.cliente_fornitore_id || ''}
          title="Ricerca cliente / fornitore"
          subtitle="F3 ricerca libera"
          placeholder="Cerca cliente o fornitore"
          emptyMessage="Nessuna controparte trovata"
          selectionMode="template"
          onClose={() => setModalState(null)}
          onSelect={(conto) => {
            applyCounterpartySelection(conto)
          setModalState(null)
          setActiveCell({ rowId: null, field: 'soggetto' })
        }}
      />
    </div>
  )
}
