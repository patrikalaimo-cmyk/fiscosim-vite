import { useEffect, useMemo, useRef, useState } from 'react'
import { sb } from '../../../lib/supabase'
import * as contabilitaRepo from '../data/contabilitaRepo.js'
import { persistPrimaNotaDraft, mapPrimaNotaPayloadForDb, mapPrimaNotaRigaForDb, resolveDraftBundle } from '../application/persistPrimaNotaDraft.js'
import { getOperationGuards, updatePrimaNotaControllata, annullaPrimaNotaLogica, stornaPrimaNota } from '../application/primaNotaMutationService.js'
import { buildRegistrazioneDraft } from '../application/registrazioneOperations/buildRegistrazioneDraft.js'
import { buildRegistrazioneRowsFromTemplateResolved } from '../application/registrazioneOperations/buildRegistrazioneRowsFromTemplate.js'
import { applyRegistrazioneAutoResidualToRow } from '../application/registrazioneOperations/applyRegistrazioneAutoResidualToRow.js'
import { applyRegistrazioneAutoResidualChainToRows } from '../application/registrazioneOperations/applyRegistrazioneAutoResidualChainToRows.js'
import { normalizeRegistrazioneAmountInput } from '../application/registrazioneOperations/normalizeRegistrazioneAmountInput.js'
import { resolvePartitaImportoResiduo } from '../application/registrazioneOperations/resolvePartitaImportoResiduo.js'
import { normalizeRegistrazioneRowPatch } from '../application/registrazioneOperations/normalizeRegistrazioneRowPatch.js'
import { buildRegistrazioneContoSelection, resolveRegistrazioneContoDescrizione, resolveRegistrazioneContoLabel, resolveContoHierarchyView, resolveSubjectAccount } from '../application/registrazioneOperations/resolveRegistrazioneConti.js'
import { buildRegistrazioneContropartiList } from '../application/registrazioneOperations/resolveRegistrazioneControparti.js'
import { resolveRegistrazioneEsercizio } from '../application/registrazioneOperations/resolveRegistrazioneEsercizio.js'
import { resolveRegistrazioneFocusOrder } from '../application/registrazioneOperations/resolveRegistrazioneFocusOrder.js'
import { useRegistrazioneKeyboardShortcuts } from '../application/registrazioneOperations/useRegistrazioneKeyboardShortcuts.js'
import { buildCausaleStructureHistory } from '../application/registrazioneOperations/buildCausaleStructureHistory.js'
import { resolvePartitaSoggettoId } from '../application/registrazioneOperations/resolvePartitaSoggettoId.js'

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
import { buildCausaleContabilePolicy } from '../domain/causali/buildCausaleContabilePolicy.js'
import { resolveChiusuraPartiteBehavior } from '../domain/causali/resolveChiusuraPartiteBehavior.js'


const REAL_SAVE_TEMPORARILY_BLOCKED = false

function canUseRealSaveForSimplePrimaNota(draftModel = {}, selectedCausaleConfig = {}) {
  const config = selectedCausaleConfig && typeof selectedCausaleConfig === 'object' ? selectedCausaleConfig : {}
  const validation = draftModel?.validation && typeof draftModel.validation === 'object' ? draftModel.validation : {}
  const totals = draftModel?.totals && typeof draftModel.totals === 'object' ? draftModel.totals : {}

  return Boolean(
    validation.status !== 'blocked' &&
    totals.isBalanced === true &&
    !config.showRitenute
  )
}

function isValidSocietaId(id) {
  if (!id) return false
  const str = String(id).trim().toLowerCase()
  return str !== '' && str !== 'undefined' && str !== 'null'
}

async function loadPianoContiFromLocalApi(societaId) {
  if (!isValidSocietaId(societaId)) return []
  const id = String(societaId).trim()
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

function resolveCounterpartyRole(conto = {}) {
  if (conto?.is_fornitore) return 'fornitore'
  if (conto?.is_cliente) return 'cliente'
  return ''
}

function resolveCounterpartySide(conto = {}, fallback = '') {
  if (conto?.is_fornitore) return 'avere'
  if (conto?.is_cliente) return 'dare'
  return fallback === 'avere' || fallback === 'dare' ? fallback : ''
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
      selectedPartitaIds: [],
      importiChiusura: {},
      checkedPartiteIds: [],
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
      manualImportoCassaOverride: false,
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
  if (id === 'partitario') return 'Partitario'
  if (id === 'ivaPerCassaPreview') return 'Partitario IVA per cassa'
  if (id === 'ritenute') return 'Ritenute'
  return 'Righe prima nota'
}

async function resolveUtenteStudioId(utente) {
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session?.user?.id) {
      const { data: profile } = await sb.from('utenti_studio')
        .select('id')
        .eq('auth_user_id', session.user.id)
        .eq('attivo', true)
        .maybeSingle();
      if (profile?.id) {
        return profile.id;
      }
    }
  } catch (e) {
    console.warn('[resolveUtenteStudioId] failed to fetch from active auth session:', e);
  }
  
  if (utente?.id) return utente.id;
  if (utente?.utente_studio_id) return utente.utente_studio_id;
  if (utente?.user_id) return utente.user_id;
  return '00000000-0000-0000-0000-000000000000';
}

export function RegistrazioneManualeView({ societaAttiva, pianoConti = [], causaliContabili = [], causaliIva = [], onRefresh, initialDraft, utente }) {
  const currentYear = new Date().getFullYear()
  const [lastExerciseUsed, setLastExerciseUsed] = useState(String(currentYear))
  const [state, setState] = useState(() => makeInitialState(String(currentYear)))
  const [draftStarted, setDraftStarted] = useState(false)
  const [partiteRefreshKey, setPartiteRefreshKey] = useState(0)

  // Stati aggiuntivi per flussi di modifica/storno controllati
  const [operationGuards, setOperationGuards] = useState(null)
  const [loadingGuards, setLoadingGuards] = useState(false)
  const [motivoOperazione, setMotivoOperazione] = useState('Errata contabilizzazione')
  const [dataStornoInput, setDataStornoInput] = useState('')

  const isAnnullaOrStorno = state.meta?.operationMode === 'annulla' || state.meta?.operationMode === 'storno'

  useEffect(() => {
    if (state.meta?.primaNotaId && isAnnullaOrStorno && societaAttiva?.id) {
      let alive = true
      const fetchGuards = async () => {
        setLoadingGuards(true)
        setError('')
        try {
          const opType = state.meta.operationMode.toUpperCase()
          const res = await getOperationGuards(state.meta.primaNotaId, societaAttiva.id, opType)
          if (alive) {
            if (res.error) {
              setError('Errore caricamento barriere di sicurezza: ' + (res.error.message || String(res.error)))
              setOperationGuards(null)
            } else {
              setOperationGuards(res.data || null)
            }
          }
        } catch (e) {
          if (alive) {
            setError(e?.message || String(e))
            setOperationGuards(null)
          }
        } finally {
          if (alive) setLoadingGuards(false)
        }
      }
      void fetchGuards()
      
      if (state.meta.operationMode === 'storno' && state.header?.dataRegistrazione) {
        setDataStornoInput(state.header.dataRegistrazione)
      } else {
        setDataStornoInput(new Date().toISOString().slice(0, 10))
      }

      return () => {
        alive = false
      }
    }
  }, [state.meta?.primaNotaId, state.meta?.operationMode, societaAttiva?.id])

  const handleConfirmOperation = async () => {
    setError('')
    setSuccess('')
    if (!societaAttiva?.id) {
      setError('Seleziona una società attiva prima di procedere.')
      return
    }
    if (!state.meta?.primaNotaId) {
      setError('Identificativo prima nota mancante.')
      return
    }
    const opMode = state.meta?.operationMode
    if (opMode === 'storno' && state.meta?.stato !== 'confermata') {
      setError("Storno non consentito: lo storno è ammesso unicamente per le registrazioni in stato 'confermata'.")
      return
    }
    if (opMode === 'storno') {
      const confirmed = window.confirm("Sei sicuro di voler generare la contro-scrittura speculare di storno per questa registrazione?")
      if (!confirmed) return
    }
    if (motivoOperazione.trim().length < 15) {
      setError('Il motivo dell\'operazione deve contenere almeno 15 caratteri per finalità di audit.')
      return
    }
    if (!operationGuards) {
      setError('Controlli di sicurezza non caricati.')
      return
    }
    if (!operationGuards.can_execute) {
      const blockers = Array.isArray(operationGuards.blocking_reasons) ? operationGuards.blocking_reasons.join(' · ') : 'Operazione bloccata.'
      setError(`Operazione bloccata dai controlli di sicurezza: ${blockers}`)
      return
    }

    if (operationGuards.warning_level && operationGuards.warning_level !== 'verde') {
      const warningList = Array.isArray(operationGuards.warnings) ? operationGuards.warnings.join('\n- ') : 'Nessuno'
      const impactedList = Array.isArray(operationGuards.impacted_outputs) ? operationGuards.impacted_outputs.join('\n- ') : 'Nessuno'
      const followupList = Array.isArray(operationGuards.required_followups) ? operationGuards.required_followups.join('\n- ') : 'Nessuno'
      
      const confirmMsg = `Attenzione (Livello ${operationGuards.warning_level.toUpperCase()})\n\n` +
        `Warnings:\n- ${warningList}\n\n` +
        `Output Impattati:\n- ${impactedList}\n\n` +
        `Follow-up richiesti:\n- ${followupList}\n\n` +
        `Sei sicuro di voler procedere con l'operazione?`
        
      if (!window.confirm(confirmMsg)) {
        return
      }
    }

    setSaving(true)
    try {
      const opUtenteId = await resolveUtenteStudioId(utente)
      const opMode = state.meta.operationMode
      
      let res
      if (opMode === 'annulla') {
        res = await annullaPrimaNotaLogica(state.meta.primaNotaId, societaAttiva.id, motivoOperazione, opUtenteId)
      } else if (opMode === 'storno') {
        res = await stornaPrimaNota(state.meta.primaNotaId, societaAttiva.id, motivoOperazione, dataStornoInput, opUtenteId)
      }

      if (res.error || (res.data && !res.data.success)) {
        const detailMsg = res.data?.error || (res.error?.message || String(res.error || 'Errore sconosciuto'))
        throw new Error(`Impossibile completare l'operazione di ${opMode.toUpperCase()}: ${detailMsg}`)
      }

      const resData = res.data || {}
      if (opMode === 'annulla') {
        setSuccess('Scrittura contabile annullata logicamente con successo.')
      } else {
        setSuccess(`Storno contabile speculare completato con successo. Creato storno ID: ${resData.stornoId || 'n/d'} con N° Registrazione: ${resData.numeroStorno || 'n/d'}`)
      }
      
      resetDraft(true, false, state.header.esercizioContabile, false)
      onRefresh?.()
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (initialDraft) {
      setState(initialDraft)
      setDraftStarted(true)
      if (initialDraft.header?.esercizioContabile) {
        setLastExerciseUsed(initialDraft.header.esercizioContabile)
      }
    }
  }, [initialDraft])
  const [activeTab, setActiveTab] = useState('rows')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (activeTab === 'partitario' || activeTab === 'ivaPerCassaPreview') {
      setSidebarCollapsed(true)
    } else {
      setSidebarCollapsed(false)
    }
  }, [activeTab])

  const [previewMode, setPreviewMode] = useState('overview')
  const [modalState, setModalState] = useState(null)
  const [activeCell, setActiveCell] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [gotoTarget, setGotoTarget] = useState('')
  const [partiteAperte, setPartiteAperte] = useState([])
  const [ivaPerCassaPreviewData, setIvaPerCassaPreviewData] = useState({
    originalVatRows: [],
    releasedVatRows: [],
  })
  const [percipientiCatalog, setPercipientiCatalog] = useState([])
  const [ritenuteDaMaturare, setRitenuteDaMaturare] = useState([])
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
  const selectedIvaPerCassaPartitaIds = useMemo(() => {
    const selectedIds = new Set(
      (state.partitarioData?.selectedPartitaIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
    return selectedContropartePartite
      .filter((row) => selectedIds.has(String(row?.id || '').trim()) && Boolean(row?.iva_per_cassa ?? row?.ivaPerCassa))
      .map((row) => String(row.id))
  }, [selectedContropartePartite, state.partitarioData?.selectedPartitaIds])
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
    [state.rows, state.header, effectivePianoConti]
  )

  // ── FIX: calcolo righe PN sincrono per draftModel ────────────────────────
  // Il useEffect che aggiorna state.rows (importi dare/avere dal partitario) è
  // asincrono: scrive DOPO che draftModel è già stato costruito con le righe
  // vecchie. Questo useMemo replica la stessa logica in modo sincrono, nello
  // stesso render, così draftModel vede sempre gli importi aggiornati.
  // NON tocca state.rows: il useEffect continua a fare quello.
  const rowsForDraftModel = useMemo(() => {
    const mode = selectedCausaleConfig?.partitarioMode || selectedCausale?.gestione_partite || ''
    if (mode !== 'chiusura' && mode !== 'chiude') return rowsWithCounterpartySync

    const selectedPartitaIdsStr = (state.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
    if (!selectedPartitaIdsStr.length) return rowsWithCounterpartySync

    const selectedGames = (selectedContropartePartite || []).filter(p => selectedPartitaIdsStr.includes(String(p.id).trim()))
    const policy = buildCausaleContabilePolicy(selectedCausale)
    const chiusuraBehavior = resolveChiusuraPartiteBehavior(policy, state.header, selectedGames, effectivePianoConti)
    if (!chiusuraBehavior.isChiusura) return rowsWithCounterpartySync

    const isIncassoCliente = chiusuraBehavior.soggettoTipo === 'cliente'
    const isPagamentoFornitore = chiusuraBehavior.soggettoTipo === 'fornitore'
    if (!isIncassoCliente && !isPagamentoFornitore) return rowsWithCounterpartySync

    // Calcola netto (identico al useEffect)
    let netChiusura = 0
    selectedPartitaIdsStr.forEach(id => {
      const partita = (selectedContropartePartite || []).find(p => String(p.id).trim() === id)
      if (partita) {
        const residuo = resolvePartitaImportoResiduo(partita, 0)
        const enteredVal = state.partitarioData?.importiChiusura?.[id]
        let rowVal = 0
        if (enteredVal !== undefined && enteredVal !== null && enteredVal !== '') {
          rowVal = Number.parseFloat(String(enteredVal).replace(',', '.')) || 0
          rowVal = residuo < 0 ? -Math.abs(rowVal) : Math.abs(rowVal)
        } else {
          rowVal = residuo
        }
        netChiusura += rowVal
      }
    })

    const headerAmountVal = Number.parseFloat(String(state.header.importo || '').replace(',', '.')) || 0
    const finalAmount = selectedPartitaIdsStr.length > 0 ? Math.abs(netChiusura) : headerAmountVal
    const absNet = Number.isFinite(finalAmount) && finalAmount > 0 ? finalAmount : 0

    // Risolvi conti (identico al useEffect)
    const matchingHeaderConto = resolveSubjectAccount(state.header, effectivePianoConti)
    const subjectContoId = matchingHeaderConto ? String(matchingHeaderConto.id || '').trim() : ''
    const subjectContoCodice = String(matchingHeaderConto?.codice || state.header.clienteFornitoreCodice || state.header.cliente_fornitore_codice || '').trim()
    const subjectContoDescrizione = String(matchingHeaderConto?.descrizione || matchingHeaderConto?.nome || state.header.clienteFornitoreNome || state.header.cliente_fornitore_nome || state.header.soggetto || '').trim()
    const subjectContoQuery = (subjectContoCodice && subjectContoDescrizione) ? `${subjectContoCodice} - ${subjectContoDescrizione}` : (subjectContoDescrizione || subjectContoCodice)
    const bankContoId = String(state.header.bancaCassaId || state.header.banca_cassa_id || '').trim()
    const matchingBankConto = bankContoId ? (effectivePianoConti || []).find(c => String(c.id).trim() === bankContoId) : null
    const bankContoCodice = String(matchingBankConto?.codice || matchingBankConto?.code || matchingBankConto?.sigla || state.header.bancaCassaCodice || state.header.banca_cassa_codice || '').trim()
    const bankContoDescrizione = String(matchingBankConto?.nome || matchingBankConto?.descrizione || matchingBankConto?.description || matchingBankConto?.denominazione || state.header.bancaCassaNome || state.header.banca_cassa_nome || '').trim()
    const bankContoQuery = (bankContoCodice && bankContoDescrizione) ? `${bankContoCodice} - ${bankContoDescrizione}` : (bankContoDescrizione || bankContoCodice)

    // Aggiorna solo le prime 2 righe con gli importi corretti
    return rowsWithCounterpartySync.map((row, idx) => {
      if (idx >= 2) return row
      const amtStr = absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : ''
      const hasManualAmt = row.manualAmountOverride || row.manualEdited
      if (isIncassoCliente) {
        if (idx === 0) {
          const finalDare = hasManualAmt ? row.dare : (absNet > 0 ? amtStr : '')
          return { ...row, ruolo: 'altro', conto_id: bankContoId, conto_codice: bankContoCodice, conto_descrizione: bankContoDescrizione, contoQuery: bankContoQuery, lato: 'dare', dare: finalDare, avere: hasManualAmt ? row.avere : '', conto_resolved_finale: Boolean(bankContoId) }
        }
        if (idx === 1) {
          const finalAvere = hasManualAmt ? row.avere : (absNet > 0 ? amtStr : '')
          return { ...row, ruolo: 'soggetto', conto_id: subjectContoId, conto_codice: subjectContoCodice, conto_descrizione: subjectContoDescrizione, contoQuery: subjectContoQuery, lato: 'avere', avere: finalAvere, dare: hasManualAmt ? row.dare : '', conto_resolved_finale: Boolean(subjectContoId) }
        }
      }
      if (isPagamentoFornitore) {
        if (idx === 0) {
          const finalDare = hasManualAmt ? row.dare : (absNet > 0 ? amtStr : '')
          return { ...row, ruolo: 'soggetto', conto_id: subjectContoId, conto_codice: subjectContoCodice, conto_descrizione: subjectContoDescrizione, contoQuery: subjectContoQuery, lato: 'dare', dare: finalDare, avere: hasManualAmt ? row.avere : '', conto_resolved_finale: Boolean(subjectContoId) }
        }
        if (idx === 1) {
          const finalAvere = hasManualAmt ? row.avere : (absNet > 0 ? amtStr : '')
          return { ...row, ruolo: 'altro', conto_id: bankContoId, conto_codice: bankContoCodice, conto_descrizione: bankContoDescrizione, contoQuery: bankContoQuery, lato: 'avere', avere: finalAvere, dare: hasManualAmt ? row.dare : '', conto_resolved_finale: Boolean(bankContoId) }
        }
      }
      return row
    })
  }, [
    rowsWithCounterpartySync,
    selectedCausaleConfig?.partitarioMode,
    selectedCausale,
    state.partitarioData?.selectedPartitaIds,
    state.partitarioData?.importiChiusura,
    selectedContropartePartite,
    state.header,
    effectivePianoConti,
  ])
  // ── FINE FIX sincrono ────────────────────────────────────────────────────

  const draftModel = useMemo(
    () =>
      buildRegistrazioneDraft(
        {
          societaId: societaAttiva?.id || '',
          header: state.header,
          rows: rowsForDraftModel,
          documentData: state.documentData,
          ivaData: state.ivaData,
          partitarioData: state.partitarioData,
          ritenutaData: state.ritenutaData,
          historicalEntries: historicalCausaleEntries,
          causaliIva: effectiveCausaliIva,
          percipienti: percipientiCatalog,
          ritenute: ritenuteDaMaturare,
        },
        {
          pianoConti: effectivePianoConti,
          causaliContabili,
          causaliIva: effectiveCausaliIva,
          percipienti: percipientiCatalog,
          config: selectedCausaleConfig,
          partite: selectedContropartePartite,
          ivaPerCassaOriginalVatRows: ivaPerCassaPreviewData.originalVatRows,
          ivaPerCassaReleasedVatRows: ivaPerCassaPreviewData.releasedVatRows,
          selectedCausale,
          historicalEntries: historicalCausaleEntries,
        }
      ),
    [causaliContabili, effectiveCausaliIva, effectivePianoConti, historicalCausaleEntries, ivaPerCassaPreviewData, percipientiCatalog, ritenuteDaMaturare, selectedCausale, selectedCausaleConfig, selectedContropartePartite, societaAttiva?.id, state.documentData, state.header, state.ivaData, state.partitarioData, state.ritenutaData, rowsForDraftModel]
  )

  const resolvedRows = draftModel.normalized.rows
  const totals = draftModel.totals
  const templateRowsDraft = draftModel.templateRowsDraft || null
  const realSaveEnabled = canUseRealSaveForSimplePrimaNota(draftModel, selectedCausaleConfig)
  const isReadOnlyMode = Boolean(state.meta?.primaNotaId && ['annullata', 'stornata', 'storno'].includes(state.meta?.stato))
  const computedRealSaveBlocked = isReadOnlyMode
    ? "Scrittura bloccata (Neutralizzata)"
    : (REAL_SAVE_TEMPORARILY_BLOCKED && !realSaveEnabled)
  const canRunDryCommit = Boolean(draftStarted && totals?.isBalanced && draftModel.validation?.status === 'ok' && !saving)
  const dryCommitBlockReason = String(
    draftModel.validation?.blockers?.[0] ||
      draftModel.validation?.warnings?.[0] ||
      (draftStarted ? 'Bozza non ancora controllabile' : 'Avvia una nuova registrazione')
  ).trim()

  // ── AUDIT LOG: verifica sorgenti stato nello stesso render ──────────────────
  if (draftStarted) {
    console.log('[STATE SOURCES AUDIT]', {
      // Righe che alimentano la tabella visuale
      stateRows: state.rows?.map(r => ({ id: r.id, dare: r.dare, avere: r.avere, conto_id: r.conto_id, desc: r.descrizione })),
      rowsWithCounterpartySync: rowsWithCounterpartySync?.map(r => ({ id: r.id, dare: r.dare, avere: r.avere, conto_id: r.conto_id })),
      // Righe che alimentano la validazione e i pannelli
      resolvedRows: resolvedRows?.map(r => ({ id: r.id, dare: r.dare, avere: r.avere, conto_id: r.conto_id })),
      draftModelRows: draftModel?.draft?.rows?.map(r => ({ id: r.id, dare: r.dare, avere: r.avere })),
      // Errori banner
      draftValidationBlockers: draftModel?.validation?.blockers,
      draftValidationStatus: draftModel?.validation?.status,
      // Partitario
      partitarioDraftRows: draftModel?.draft?.partitarioDraft?.rows?.map(r => ({ id: r.id, selected: r.selected, importoChiusura: r.importoChiusura, residuo: r.residuo })),
      partitarioDraftTotals: draftModel?.draft?.partitarioDraft?.totals,
      partitarioDraftSelectedIds: draftModel?.draft?.partitarioDraft?.selectedPartitaIds,
      // Stato partitario grezzo
      checkedPartiteIds: state.partitarioData?.checkedPartiteIds,
      selectedPartitaIds: state.partitarioData?.selectedPartitaIds,
      importiChiusura: state.partitarioData?.importiChiusura,
      // Props che vanno ai pannelli
      previewProps: {
        pnRowsCount: resolvedRows?.length,
        pnRowsDareAvere: resolvedRows?.map(r => ({ id: r.id, dare: r.dare, avere: r.avere })),
        partitarioDraftRowsCount: draftModel?.draft?.partitarioDraft?.rows?.length,
        checkedPartiteIds: state.partitarioData?.checkedPartiteIds,
        selectedPartitaIds: state.partitarioData?.selectedPartitaIds,
      }
    })
  }
  // ── FINE AUDIT LOG ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (!draftStarted) return
    if (!templateRowsDraft?.applied) return
    if (!Array.isArray(templateRowsDraft.rows) || !templateRowsDraft.rows.length) return
    const templateKey = String(templateRowsDraft.templateKey || '')
    if (!templateKey) return

    const policy = buildCausaleContabilePolicy(selectedCausale)
    const isIcpf = policy.gestionePartitario === 'chiusura'
    if (isIcpf) return

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
  }, [draftStarted, state.rows, templateRowsDraft, selectedCausale, selectedCausaleConfig])

  // Effetto per aggiornare le righe contabili per IC/PF (Vincolo 3 & 4)
  useEffect(() => {
    if (!draftStarted) return
    const mode = selectedCausaleConfig?.partitarioMode || selectedCausale?.gestione_partite || ''
    if (mode !== 'chiusura' && mode !== 'chiude') return

    const policy = buildCausaleContabilePolicy(selectedCausale)
    const selectedPartitaIdsStr = (state.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
    const selectedGames = (selectedContropartePartite || []).filter(p => selectedPartitaIdsStr.includes(String(p.id).trim()))
    const chiusuraBehavior = resolveChiusuraPartiteBehavior(policy, state.header, selectedGames, effectivePianoConti)
    if (!chiusuraBehavior.isChiusura) return

    const isIncassoCliente = chiusuraBehavior.soggettoTipo === 'cliente'
    const isPagamentoFornitore = chiusuraBehavior.soggettoTipo === 'fornitore'
    const isClearlyClassified = isIncassoCliente || isPagamentoFornitore

    if (!isClearlyClassified) {
      setError('Attenzione: La causale non è chiaramente classificata come incasso o pagamento. Inserisci gli importi Dare/Avere manualmente.')
      return
    }

    // 1. Calcolo netto partitario
    const currentSelected = (state.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
    let netChiusura = 0
    currentSelected.forEach(id => {
      const partita = (selectedContropartePartite || []).find(p => String(p.id).trim() === id)
      if (partita) {
        const residuo = resolvePartitaImportoResiduo(partita, 0)
        const enteredVal = state.partitarioData?.importiChiusura?.[id]
        let rowVal = 0
        if (enteredVal !== undefined && enteredVal !== null && enteredVal !== '') {
          rowVal = Number.parseFloat(String(enteredVal).replace(',', '.')) || 0
          if (residuo < 0) {
            rowVal = -Math.abs(rowVal)
          } else {
            rowVal = Math.abs(rowVal)
          }
        } else {
          rowVal = residuo
        }
        netChiusura += rowVal
      }
    })

    const headerAmountVal = Number.parseFloat(String(state.header.importo || '').replace(',', '.')) || 0
    const finalAmount = currentSelected.length > 0 ? Math.abs(netChiusura) : headerAmountVal
    const absNet = Number.isFinite(finalAmount) && finalAmount > 0 ? finalAmount : 0

    console.log('[useEffect PN update - Start]', {
      selectedPartitaIds: state.partitarioData?.selectedPartitaIds,
      checkedPartiteIds: state.partitarioData?.checkedPartiteIds,
      selectedPartitaId: state.partitarioData?.selectedPartitaId,
      selectedPartitaRows: draftModel?.draft?.partitarioDraft?.rows?.filter(r => r.selected),
      partitarioDraftTotals: draftModel?.draft?.partitarioDraft?.totals,
      importo_movimento_testata: headerAmountVal,
      netto_partitario: netChiusura,
      righe_PN_prima: state.rows
    })

    // 2. Determiniamo i conti del soggetto e della banca
    const matchingHeaderConto = resolveSubjectAccount(state.header, effectivePianoConti)
    const subjectContoId = matchingHeaderConto ? String(matchingHeaderConto.id || '').trim() : ''

    const subjectContoCodice = String(
      matchingHeaderConto?.codice ||
      state.header.clienteFornitoreCodice ||
      state.header.cliente_fornitore_codice ||
      ''
    ).trim()

    const subjectContoDescrizione = String(
      matchingHeaderConto?.descrizione ||
      matchingHeaderConto?.nome ||
      state.header.clienteFornitoreNome ||
      state.header.cliente_fornitore_nome ||
      state.header.soggetto ||
      ''
    ).trim()

    const subjectContoQuery = (subjectContoCodice && subjectContoDescrizione) 
      ? `${subjectContoCodice} - ${subjectContoDescrizione}` 
      : (subjectContoDescrizione || subjectContoCodice)

    const bankContoId = String(
      state.header.bancaCassaId ||
      state.header.banca_cassa_id ||
      ''
    ).trim()

    const matchingBankConto = bankContoId ? (effectivePianoConti || []).find(c => String(c.id).trim() === bankContoId) : null

    const bankContoCodice = String(
      matchingBankConto?.codice ||
      matchingBankConto?.code ||
      matchingBankConto?.sigla ||
      state.header.bancaCassaCodice ||
      state.header.banca_cassa_codice ||
      ''
    ).trim()

    const bankContoDescrizione = String(
      matchingBankConto?.nome ||
      matchingBankConto?.descrizione ||
      matchingBankConto?.description ||
      matchingBankConto?.denominazione ||
      state.header.bancaCassaNome ||
      state.header.banca_cassa_nome ||
      ''
    ).trim()

    const bankContoQuery = (bankContoCodice && bankContoDescrizione) 
      ? `${bankContoCodice} - ${bankContoDescrizione}` 
      : (bankContoDescrizione || bankContoCodice)

    // 3. Aggiorna o genera le righe
    setState((prev) => {
      // Per IC: riga 1 = Banca, riga 2 = Cliente
      // Per PF: riga 1 = Fornitore, riga 2 = Banca
      const updatedRows = prev.rows.map((row, idx) => {
        if (idx >= 2) return row

        const isRow1 = idx === 0
        const isRow2 = idx === 1
        const hasManualAmt = row.manualAmountOverride || row.manualEdited

        if (isIncassoCliente) {
          if (isRow1) {
            // Riga 1: Banca/Cassa (Dare)
            return {
              ...row,
              ruolo: 'altro',
              descrizione_riga: 'Banca/Cassa',
              descrizione: 'Banca/Cassa',
              conto_id: bankContoId,
              conto_codice: bankContoCodice,
              conto_descrizione: bankContoDescrizione,
              contoQuery: bankContoQuery,
              lato: 'dare',
              dare: hasManualAmt ? row.dare : (absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : ''),
              avere: hasManualAmt ? row.avere : '',
              conto_resolved_finale: Boolean(bankContoId)
            }
          }
          if (isRow2) {
            // Riga 2: Cliente / chiusura partite (Avere)
            return {
              ...row,
              ruolo: 'soggetto',
              descrizione_riga: 'Cliente / chiusura partite',
              descrizione: 'Cliente / chiusura partite',
              conto_id: subjectContoId,
              conto_codice: subjectContoCodice,
              conto_descrizione: subjectContoDescrizione,
              contoQuery: subjectContoQuery,
              lato: 'avere',
              avere: hasManualAmt ? row.avere : (absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : ''),
              dare: hasManualAmt ? row.dare : '',
              conto_resolved_finale: Boolean(subjectContoId)
            }
          }
        }

        if (isPagamentoFornitore) {
          if (isRow1) {
            // Riga 1: Fornitore / chiusura partite (Dare)
            return {
              ...row,
              ruolo: 'soggetto',
              descrizione_riga: 'Fornitore / chiusura partite',
              descrizione: 'Fornitore / chiusura partite',
              conto_id: subjectContoId,
              conto_codice: subjectContoCodice,
              conto_descrizione: subjectContoDescrizione,
              contoQuery: subjectContoQuery,
              lato: 'dare',
              dare: hasManualAmt ? row.dare : (absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : ''),
              avere: hasManualAmt ? row.avere : '',
              conto_resolved_finale: Boolean(subjectContoId)
            }
          }
          if (isRow2) {
            // Riga 2: Banca/Cassa (Avere)
            return {
              ...row,
              ruolo: 'altro',
              descrizione_riga: 'Banca/Cassa',
              descrizione: 'Banca/Cassa',
              conto_id: bankContoId,
              conto_codice: bankContoCodice,
              conto_descrizione: bankContoDescrizione,
              contoQuery: bankContoQuery,
              lato: 'avere',
              avere: hasManualAmt ? row.avere : (absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : ''),
              dare: hasManualAmt ? row.dare : '',
              conto_resolved_finale: Boolean(bankContoId)
            }
          }
        }

        return row
      })

      if (updatedRows.length < 2) {
        const r1 = isIncassoCliente
          ? {
              id: 'row-1',
              ruolo: 'altro',
              descrizione_riga: 'Banca/Cassa',
              descrizione: 'Banca/Cassa',
              conto_id: bankContoId,
              conto_codice: bankContoCodice,
              conto_descrizione: bankContoDescrizione,
              contoQuery: bankContoQuery,
              lato: 'dare',
              dare: absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : '',
              avere: '',
              conto_resolved_finale: Boolean(bankContoId),
              templateGenerated: true
            }
          : {
              id: 'row-1',
              ruolo: 'soggetto',
              descrizione_riga: 'Fornitore / chiusura partite',
              descrizione: 'Fornitore / chiusura partite',
              conto_id: subjectContoId,
              conto_codice: subjectContoCodice,
              conto_descrizione: subjectContoDescrizione,
              contoQuery: subjectContoQuery,
              lato: 'dare',
              dare: absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : '',
              avere: '',
              conto_resolved_finale: Boolean(subjectContoId),
              templateGenerated: true
            }

        const r2 = isIncassoCliente
          ? {
              id: 'row-2',
              ruolo: 'soggetto',
              descrizione_riga: 'Cliente / chiusura partite',
              descrizione: 'Cliente / chiusura partite',
              conto_id: subjectContoId,
              conto_codice: subjectContoCodice,
              conto_descrizione: subjectContoDescrizione,
              contoQuery: subjectContoQuery,
              lato: 'avere',
              avere: absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : '',
              dare: '',
              conto_resolved_finale: Boolean(subjectContoId),
              templateGenerated: true
            }
          : {
              id: 'row-2',
              ruolo: 'altro',
              descrizione_riga: 'Banca/Cassa',
              descrizione: 'Banca/Cassa',
              conto_id: bankContoId,
              conto_codice: bankContoCodice,
              conto_descrizione: bankContoDescrizione,
              contoQuery: bankContoQuery,
              lato: 'avere',
              avere: absNet > 0 ? normalizeRegistrazioneAmountInput(absNet) : '',
              dare: '',
              conto_resolved_finale: Boolean(bankContoId),
              templateGenerated: true
            }

        console.log('[useEffect PN update - Enqueued updatedRows (length < 2)]', { r1, r2 })
        return { ...prev, rows: [r1, r2, ...updatedRows.slice(2)] }
      }

      const hasChanged = JSON.stringify(prev.rows) !== JSON.stringify(updatedRows)
      if (!hasChanged) return prev
      console.log('[useEffect PN update - Enqueued updatedRows (length >= 2)]', { updatedRows })
      return { ...prev, rows: updatedRows }
    })
  }, [
    state.partitarioData?.selectedPartitaIds,
    state.partitarioData?.importiChiusura,
    selectedContropartePartite,
    selectedCausale,
    draftStarted,
    state.header.clienteFornitoreId,
    state.header.cliente_fornitore_id,
    state.header.clienteFornitoreCodice,
    state.header.cliente_fornitore_codice,
    state.header.clienteFornitoreNome,
    state.header.cliente_fornitore_nome,
    state.header.soggettoId,
    state.header.soggetto_id,
    state.header.contoId,
    state.header.accountId,
    state.header.bancaCassaId,
    state.header.banca_cassa_id,
    state.header.bancaCassaCodice,
    state.header.banca_cassa_codice,
    state.header.bancaCassaNome,
    state.header.banca_cassa_nome,
    state.header.importo,
    effectivePianoConti
  ])

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
    if (!selectedCausaleConfig?.showIvaPerCassaPreview || selectedIvaPerCassaPartitaIds.length === 0) {
      setIvaPerCassaPreviewData({ originalVatRows: [], releasedVatRows: [] })
      return
    }
    let alive = true
    contabilitaRepo.getIvaPerCassaPreviewData(selectedIvaPerCassaPartitaIds)
      .then(({ data, error: queryError }) => {
        if (!alive) return
        if (queryError) throw queryError
        setIvaPerCassaPreviewData({
          originalVatRows: Array.isArray(data?.originalVatRows) ? data.originalVatRows : [],
          releasedVatRows: Array.isArray(data?.releasedVatRows) ? data.releasedVatRows : [],
        })
      })
      .catch(() => {
        if (!alive) return
        setIvaPerCassaPreviewData({ originalVatRows: [], releasedVatRows: [] })
      })
    return () => {
      alive = false
    }
  }, [selectedCausaleConfig?.showIvaPerCassaPreview, selectedIvaPerCassaPartitaIds.join('|')])

  useEffect(() => {
    if (!isValidSocietaId(societaAttiva?.id)) {
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
  }, [societaAttiva?.id, partiteRefreshKey])

  useEffect(() => {
    if (!isValidSocietaId(societaAttiva?.id)) {
      setRitenuteDaMaturare([])
      return
    }
    let alive = true
    contabilitaRepo.getRitenuteDaMaturare(societaAttiva.id)
      .then(({ data, error: qErr }) => {
        if (!alive) return
        if (qErr) throw qErr
        setRitenuteDaMaturare(Array.isArray(data) ? data : [])
      })
      .catch(() => {
        if (!alive) return
        setRitenuteDaMaturare([])
      })
    return () => {
      alive = false
    }
  }, [societaAttiva?.id, partiteRefreshKey])

  useEffect(() => {
    if (!isValidSocietaId(societaAttiva?.id)) {
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
    if (!isValidSocietaId(societaAttiva?.id)) {
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

    if (!isValidSocietaId(societaId)) {
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
    if (!isValidSocietaId(societaAttiva?.id) || !selectedCausale?.codice) {
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
      ...(field === 'isSimulata' ? { isSimulata: value } : {}),
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
    setState((prev) => {
      const selectedId = String(prev.partitarioData?.selectedPartitaId || '').trim()
      const nextImporti = { ...(prev.partitarioData?.importiChiusura || {}) }
      if (field === 'importoChiusura' && selectedId) {
        nextImporti[selectedId] = value
      }
      return {
        ...prev,
        partitarioData: {
          ...prev.partitarioData,
          [field]: value,
          importiChiusura: nextImporti,
        },
      }
    })
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
        ...(field === 'importoCassa' ? { manualImportoCassaOverride: true } : {}),
        ...(field === 'netto' ? { manualNettoOverride: true } : {}),
        [field]: value,
      },
    }))
  }

  const reloadPercipientiCatalog = async () => {
    if (!societaAttiva?.id) return
    try {
      const { data, error: qErr } = await contabilitaRepo.getPercipientiAttivi(societaAttiva.id)
      if (qErr) throw qErr
      setPercipientiCatalog(Array.isArray(data) ? data : [])
    } catch (e) {
      console.error('Errore nel ricaricare i percipienti:', e)
    }
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
              conto_id: String(selected.id || selected.value || '').trim(),
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

  const buildCounterpartyHeader = (prevHeader, { contoId = '', contoCode = '', contoName = '', soggetto = '', contoTipo = '', codiceFiscale = '', partitaIva = '', splitPayment = false, split_payment = false }) => {
    const nextSoggetto = String(soggetto || contoName || '').trim()
    const nextId = String(contoId || '').trim()
    const nextCode = String(contoCode || '').trim()
    const nextName = String(contoName || nextSoggetto || '').trim()
    const nextTipo = String(contoTipo || '').trim()
    const nextCf = String(codiceFiscale || '').trim()
    const nextPiva = String(partitaIva || '').trim()

    return {
      ...prevHeader,
      soggetto: nextSoggetto,
      clienteFornitoreId: nextId,
      cliente_fornitore_id: nextId,
      clienteFornitoreCodice: nextCode,
      cliente_fornitore_codice: nextCode,
      clienteFornitoreNome: nextName,
      cliente_fornitore_nome: nextName,
      clienteFornitoreTipo: nextTipo,
      cliente_fornitore_tipo: nextTipo,
      splitPayment: Boolean(splitPayment || split_payment),
      split_payment: Boolean(splitPayment || split_payment),
      codiceFiscale: nextCf || nextPiva,
      clienteFornitoreCodiceFiscale: nextCf || nextPiva
    }
  }

  function isTemplateSubjectRowCandidate(row = {}) {
    if (!row || row.manualEdited || row.manualAmountOverride) return false
    const role = String(row.templateRole || row.ruolo || '').trim().toLowerCase()
    if (role === 'soggetto') return true
    const hasTemplateMarkers = Boolean(row.templateGenerated || row.templateScope || row.isTemplateScope)
    if (!hasTemplateMarkers) return false
    
    const rowText = [row.contoQuery, row.conto_descrizione, row.conto_codice, row.contoQueryHint, row.templateSource, row.descrizione_riga, row.descrizione]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    if (/banca|cassa/.test(rowText)) return false

    const hasAccountOrHint = Boolean(row.conto_codice || row.contoQuery || row.conto_descrizione || row.contoQueryHint)
    if (!hasAccountOrHint) return false

    if (/fornitor|client|debiti v\/fornitori|crediti v\/clienti/.test(rowText)) return true
    const selection = buildRegistrazioneContoSelection(row, row.contoQuery || row.conto_descrizione || row.conto_codice || '')
    const hierarchy = resolveContoHierarchyView(selection)
    return Boolean(hierarchy && !hierarchy.isSelectableForRegistrazione)
  }

  function syncCounterpartySubjectRow(rows = [], selected = {}) {
    const resolvedAccount = resolveSubjectAccount(selected, effectivePianoConti)
    if (!resolvedAccount) return rows

    const resolvedId = String(resolvedAccount.id || '').trim()
    if (!resolvedId) return rows

    const resolvedCodice = String(resolvedAccount.codice || '').trim()
    const resolvedNome = String(resolvedAccount.descrizione || resolvedAccount.nome || '').trim()

    const isCustomer = Boolean(
      resolvedAccount.is_cliente || 
      ['cliente', 'client'].includes(String(resolvedAccount.clienteFornitoreTipo || resolvedAccount.cliente_fornitore_tipo || resolvedAccount.tipoControparte || resolvedAccount.tipo_controparte || resolvedAccount.tipo || '').trim().toLowerCase())
    )

    const isSupplier = Boolean(
      resolvedAccount.is_fornitore || 
      resolvedAccount.is_professionista || 
      ['fornitore', 'professionista', 'supplier'].includes(String(resolvedAccount.clienteFornitoreTipo || resolvedAccount.cliente_fornitore_tipo || resolvedAccount.tipoControparte || resolvedAccount.tipo_controparte || resolvedAccount.tipo || '').trim().toLowerCase())
    )

    const contoObject = {
      ...resolvedAccount,
      id: resolvedId,
      codice: resolvedCodice,
      nome: resolvedNome,
      descrizione: resolvedNome,
      is_cliente: isCustomer,
      is_fornitore: isSupplier
    }

    const subjectSelection = buildRegistrazioneContoSelection(
      contoObject,
      contoObject?.__label || contoObject?.conto_label || contoObject?.displayLabel || resolveRegistrazioneContoLabel(contoObject)
    )
    const hierarchy = resolveContoHierarchyView(subjectSelection)
    const contoDescrizione = subjectSelection.conto_descrizione || resolveRegistrazioneContoDescrizione(subjectSelection)
    const contoQuery = subjectSelection.__label || (subjectSelection.codice && contoDescrizione ? `${subjectSelection.codice} - ${contoDescrizione}` : contoDescrizione || subjectSelection.codice || '')
    let updated = false

    return rows.map((row) => {
      if (updated || !isTemplateSubjectRowCandidate(row)) return row
      if (row.manualEdited || row.manualAmountOverride) return row
      updated = true
      const role = resolveCounterpartyRole(contoObject)
      return {
        ...row,
        templateRole: role || 'soggetto',
        subjectAccountSynced: true,
        templateGenerated: row.templateGenerated !== false,
        templateScope: false,
        isTemplateScope: false,
        contoQuery,
        conto_id: resolvedId,
        conto_codice: resolvedCodice,
        conto_descrizione: resolvedNome,
        hierarchyType: String(hierarchy?.hierarchyType || subjectSelection.hierarchyType || row.hierarchyType || '').trim(),
        conto_resolved_finale: Boolean(hierarchy?.isSelectableForRegistrazione || resolvedId),
        contoQueryHint: '',
        templateSource: 'subject_header_sync',
        templateConfidence: 1,
        templateReasons: ['Conto risolto dal soggetto selezionato in testata'],
        templateWarnings: [],
        lato: resolveCounterpartySide(contoObject, row.lato),
      }
    })
  }

  const applyCounterpartySelection = (conto) => {
    if (!conto) return 'totaleDocumento'
    setError('')
    setSuccess('')
    const selected = buildRegistrazioneContoSelection(conto, conto?.__label || conto?.conto_label || conto?.displayLabel || resolveRegistrazioneContoLabel(conto))
    const contoId = String(selected.id || selected.value || '').trim()
    const contoCode = String(selected.code || selected.sigla || selected.id || '').trim()
    const selectedLabel = selected.__label || resolveRegistrazioneContoLabel(selected)
    const contoDescrizione = selected.conto_descrizione || resolveRegistrazioneContoDescrizione(selected)
    const contoTipo = resolveCounterpartyRole(selected)

    // Extract tax credentials
    const codiceFiscale = conto?.codice_fiscale || conto?.cf || selected?.codice_fiscale || selected?.cf || ''
    const partitaIva = conto?.partita_iva || conto?.piva || selected?.partita_iva || selected?.piva || ''

    setState((prev) => ({
      ...prev,
      header: buildCounterpartyHeader(prev.header, {
        contoId,
        contoCode,
        contoName: selectedLabel || contoDescrizione,
        soggetto: selectedLabel,
        contoTipo,
        codiceFiscale,
        partitaIva,
        splitPayment: Boolean(conto?.split_payment || conto?.splitPayment || selected?.split_payment || selected?.splitPayment),
      }),
      rows: syncCounterpartySubjectRow(prev.rows, selected),
      ritenutaData: {
        ...prev.ritenutaData,
        percipienteId: '',
        percipiente: '',
        percipienteNome: '',
        codiceFiscale: '',
        manualCompensoOverride: false,
        manualImportoCassaOverride: false,
        manualBaseOverride: false,
        manualRitenutaOverride: false,
        manualNettoOverride: false,
      },
      partitarioData: {
        ...prev.partitarioData,
        selectedPartitaId: '',
        selectedPartitaIds: [],
        importiChiusura: {},
        checkedPartiteIds: [],
        importoChiusura: '',
        manualImportoChiusuraOverride: false,
      }
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

  const onToggleCheckedPartita = (id) => {
    const idStr = String(id || '').trim()
    const currentSelected = (state.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
    const isSelected = currentSelected.includes(idStr)
    const clickedRow = (selectedContropartePartite || []).find(p => String(p.id || '').trim() === idStr)

    console.log('[Checkbox Click - Start]', {
      clickedIdOriginal: id,
      clickedIdNormalized: idStr,
      clickedRow,
      conto_id: clickedRow?.conto_id || clickedRow?.contoId,
      contoId: clickedRow?.contoId || clickedRow?.conto_id,
      soggettoId: clickedRow?.soggettoId || clickedRow?.soggetto_id,
      selectedPartitaIds_BEFORE: currentSelected,
      checkedPartiteIds_BEFORE: state.partitarioData?.checkedPartiteIds,
    })

    if (!isSelected) {
      const partitaToSelect = (selectedContropartePartite || []).find(p => String(p.id || '').trim() === idStr)
      if (partitaToSelect) {
        const newSoggettoId = resolvePartitaSoggettoId(partitaToSelect)
        
        const differentSubject = currentSelected.some(existingId => {
          const existingPartita = (selectedContropartePartite || []).find(p => String(p.id || '').trim() === existingId)
          if (existingPartita) {
            const existingSoggettoId = resolvePartitaSoggettoId(existingPartita)
            return existingSoggettoId !== newSoggettoId
          }
          return false
        })

        if (differentSubject) {
          console.warn('[Checkbox Click - Blocked for different subject]', {
            newSoggettoId,
            currentSelected
          })
          setError('Incassi/pagamenti multipli non ancora abilitati')
          return
        }
      }
    }

    setState((prev) => {
      const currentSelected = (prev.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
      const isSelected = currentSelected.includes(idStr)
      const nextSelected = isSelected ? currentSelected.filter(c => c !== idStr) : [...currentSelected, idStr]
      
      const checked = (prev.partitarioData?.checkedPartiteIds || []).map(x => String(x || '').trim())
      const nextChecked = isSelected ? checked.filter(c => c !== idStr) : Array.from(new Set([...checked, idStr]))

      const nextImporti = { ...(prev.partitarioData?.importiChiusura || {}) }
      
      if (!isSelected) {
        if (nextImporti[idStr] === undefined) {
          const partita = (selectedContropartePartite || []).find(p => String(p.id || '').trim() === idStr)
          if (partita) {
            const saldo = resolvePartitaImportoResiduo(partita, 0)
            nextImporti[idStr] = saldo
          }
        }
      }

      const newSelectedPartitaId = nextSelected[0] || ''
      const newImportoChiusura = newSelectedPartitaId ? nextImporti[newSelectedPartitaId] || '' : ''

      console.log('[Checkbox Click - State Update Enqueued]', {
        selectedPartitaIds_AFTER: nextSelected,
        checkedPartiteIds_AFTER: nextChecked,
        selectedPartitaId_focus: newSelectedPartitaId,
        importoChiusura: newImportoChiusura
      })

      return {
        ...prev,
        partitarioData: {
          ...prev.partitarioData,
          selectedPartitaIds: nextSelected,
          checkedPartiteIds: nextChecked,
          importiChiusura: nextImporti,
          selectedPartitaId: newSelectedPartitaId,
          importoChiusura: newImportoChiusura,
          tipoMovimento: 'chiusura'
        }
      }
    })
  }

  const onUpdateRowImportoChiusura = (id, value) => {
    setState((prev) => {
      const nextImporti = { ...(prev.partitarioData?.importiChiusura || {}) }
      nextImporti[id] = value
      const isFocused = String(prev.partitarioData?.selectedPartitaId || '').trim() === String(id).trim()
      return {
        ...prev,
        partitarioData: {
          ...prev.partitarioData,
          importiChiusura: nextImporti,
          ...(isFocused ? { importoChiusura: value } : {})
        }
      }
    })
  }

  const onBlurImportoChiusura = (id, value) => {
    setState((prev) => {
      const partita = (selectedContropartePartite || []).find(p => String(p.id).trim() === String(id).trim())
      if (!partita) return prev

      const residuo = resolvePartitaImportoResiduo(partita, 0)
      let val = Number.parseFloat(String(value).replace(',', '.'))
      if (Number.isNaN(val) || !Number.isFinite(val)) {
        val = 0
      }

      if (residuo > 0) {
        val = Math.max(0, val)
        val = Math.min(residuo, val)
      } else if (residuo < 0) {
        val = -Math.abs(val)
        val = Math.max(residuo, val)
        val = Math.min(0, val)
      } else {
        val = 0
      }

      const formattedVal = val.toFixed(2)
      const nextImporti = { ...(prev.partitarioData?.importiChiusura || {}) }
      nextImporti[id] = formattedVal
      const isFocused = String(prev.partitarioData?.selectedPartitaId || '').trim() === String(id).trim()

      return {
        ...prev,
        partitarioData: {
          ...prev.partitarioData,
          importiChiusura: nextImporti,
          ...(isFocused ? { importoChiusura: formattedVal } : {})
        }
      }
    })
  }

  const onApplyCheckedPartite = () => {
    setState((prev) => {
      const checked = (prev.partitarioData?.checkedPartiteIds || []).map(x => String(x || '').trim())
      const currentSelected = (prev.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
      const nextSelected = Array.from(new Set([...currentSelected, ...checked]))
      const nextImporti = { ...(prev.partitarioData?.importiChiusura || {}) }
      
      nextSelected.forEach(id => {
        if (nextImporti[id] === undefined) {
          const partita = (selectedContropartePartite || []).find(p => String(p.id).trim() === id)
          if (partita) {
            const saldo = resolvePartitaImportoResiduo(partita, 0)
            nextImporti[id] = saldo
          }
        }
      })
      
      const newSelectedPartitaId = nextSelected[0] || ''
      const newImportoChiusura = newSelectedPartitaId ? nextImporti[newSelectedPartitaId] || '' : ''

      return {
        ...prev,
        partitarioData: {
          ...prev.partitarioData,
          selectedPartitaIds: nextSelected,
          importiChiusura: nextImporti,
          selectedPartitaId: newSelectedPartitaId,
          importoChiusura: newImportoChiusura,
          tipoMovimento: 'chiusura'
        }
      }
    })
    
    setActiveTab('partitario')
  }

  const openPartite = () => {
    if (!selectedCausaleConfig?.supportsPartitePanel) return
    if (previewMode === 'partite') {
      onApplyCheckedPartite()
    } else {
      setPreviewMode('partite')
      scrollToSection('preview')
    }
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
    if (isReadOnlyMode) {
      setError("Modifica non consentita: questa registrazione è stata stornata o neutralizzata (stato di sola lettura).")
      return
    }
    if (draftModel.validation.status === 'blocked') {
      setError(draftModel.validation.blockers.join(' · '))
      return
    }
    if (computedRealSaveBlocked && !isReadOnlyMode) {
      setError('Salvataggio reale ancora non abilitato per questo caso. Usa Controlla registrazione.')
      return
    }
    setSaving(true)
    try {
      if (state.meta?.primaNotaId) {
        // 1. Modifica controllata: verificare se è un movimento generale non IVA
        const isIvaPanelActive = Boolean(selectedCausaleConfig?.showIvaPanel || draftModel.draft.ivaDraft?.active)
        if (isIvaPanelActive) {
          throw new Error("La modifica controllata con audit è abilitata unicamente per i movimenti generali non IVA in questa fase.")
        }
        
        // 2. Chiamare operation guards
        const guardsRes = await getOperationGuards(state.meta.primaNotaId, societaAttiva.id, 'UPDATE')
        if (guardsRes.error) {
          throw new Error('Errore nel recupero delle barriere di sicurezza: ' + (guardsRes.error.message || String(guardsRes.error)))
        }
        
        const guards = guardsRes.data || {}
        if (!guards.can_execute) {
          const reasons = Array.isArray(guards.blocking_reasons) ? guards.blocking_reasons.join(' · ') : 'Operazione non consentita'
          throw new Error(`Salvataggio bloccato: ${reasons}`)
        }
        
        // 3. Mostrare warning se presenti (giallo, rosso, nero)
        if (guards.warning_level && guards.warning_level !== 'verde') {
          const warningList = Array.isArray(guards.warnings) ? guards.warnings.join('\n- ') : 'Nessuno'
          const impactedList = Array.isArray(guards.impacted_outputs) ? guards.impacted_outputs.join('\n- ') : 'Nessuno'
          const followupList = Array.isArray(guards.required_followups) ? guards.required_followups.join('\n- ') : 'Nessuno'
          
          const confirmMsg = `Attenzione (Livello ${guards.warning_level.toUpperCase()})\n\n` +
            `Warnings:\n- ${warningList}\n\n` +
            `Output Impattati:\n- ${impactedList}\n\n` +
            `Follow-up richiesti:\n- ${followupList}\n\n` +
            `Vuoi procedere comunque con il salvataggio?`
            
          if (!window.confirm(confirmMsg)) {
            setSaving(false)
            return
          }
        }
        
        // 4. Chiedere motivo obbligatorio di almeno 15 caratteri
        let motivo = ''
        if (state.meta?.stato !== 'simulata') {
          motivo = window.prompt("Fornisci il motivo obbligatorio della modifica (almeno 15 caratteri):", "Errata contabilizzazione")
          if (motivo === null) {
            setSaving(false)
            return // User cancelled prompt
          }
          if (motivo.trim().length < 15) {
            throw new Error("Il motivo della modifica deve contenere almeno 15 caratteri per finalità di audit.")
          }
        } else {
          motivo = 'Modifica scrittura simulata'
        }
        
        // 5. Preparare payload mappati per la RPC
        const resolved = resolveDraftBundle(draftModel.draft)
        const headerDb = mapPrimaNotaPayloadForDb(resolved.pnPayload)
        
        // Assicurarsi che totali e metadati siano allineati
        headerDb.totale_dare = totals.dare
        headerDb.totale_avere = totals.avere
        
        const rowsDb = Array.isArray(resolved.righePayload)
          ? resolved.righePayload.map((row, index) => mapPrimaNotaRigaForDb(row, index))
          : []
          
        const opUtenteId = await resolveUtenteStudioId(utente)
        
        // 6. Eseguire l'RPC transazionale updatePrimaNotaControllata
        const updateRes = await updatePrimaNotaControllata(
          state.meta.primaNotaId,
          societaAttiva.id,
          headerDb,
          rowsDb,
          motivo,
          opUtenteId
        )
        
        if (updateRes.error || (updateRes.data && !updateRes.data.success)) {
          const detailMsg = updateRes.data?.error || (updateRes.error?.message || String(updateRes.error || 'Errore sconosciuto'))
          throw new Error('Impossibile effettuare la modifica controllata: ' + detailMsg)
        }
        
        const resData = updateRes.data || {}
        setSuccess(`Modifica salvata con successo. Nuova versione: ${resData.versione || 'n/d'}`)
        setLastExerciseUsed(state.header.esercizioContabile || lastExerciseUsed)
        resetDraft(true, false, state.header.esercizioContabile, false)
        onRefresh?.()
      } else {
        if (state.header.isSimulata) {
          if (!window.confirm("Attenzione: stai salvando in Prima Nota simulata. Sei sicuro?")) {
            setSaving(false);
            return;
          }
        }

        const activeDraft = {
          ...draftModel.draft,
          isSimulata: Boolean(state.header.isSimulata),
          pianoConti: effectivePianoConti,
          meta: {
            ...(draftModel.draft?.meta || {}),
            isSimulata: Boolean(state.header.isSimulata),
          }
        };

        console.log('[handleSave - Saving draft]', {
          activeDraft,
          partEntriesForDb: activeDraft.partitarioDraft?.rows
            ?.filter(row => row.selected)
            .map(row => {
              let amount = Math.abs(row.importoChiusura || 0)
              const isNC = (row.importoOriginario < 0 || row.residuo < 0)
              if (isNC) {
                amount = -amount
              }
              return {
                documento_id: row.id,
                importo_chiuso: amount,
                tipo_movimento: 'chiusura'
              }
            })
        })

        const result = await persistPrimaNotaDraft({ db: sb, draft: activeDraft })
        if (result?.error) {
          setError(result.error?.message || String(result.error))
          return
        }
        setSuccess(`Registrazione salvata con ID ${result?.data?.prima_nota_id || 'n/d'}`)
        setLastExerciseUsed(state.header.esercizioContabile || lastExerciseUsed)
        setPartiteRefreshKey((value) => value + 1)
        resetDraft(true, false, state.header.esercizioContabile, false)
        onRefresh?.()
      }
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
    allowedTabs,
    activeTab,
    setActiveTab,
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
          realSaveBlocked={computedRealSaveBlocked}
          draftStarted={draftStarted}
        />

        {state.meta?.primaNotaId && (
          <div
            className="erp-flat-panel"
            style={{
              marginBottom: '.55rem',
              padding: '.8rem 1.2rem',
              borderRadius: 16,
              background: 'linear-gradient(135deg, rgba(26, 168, 191, 0.15) 0%, rgba(9, 17, 30, 0.6) 100%)',
              border: '1px solid rgba(26, 168, 191, 0.4)',
              boxShadow: '0 8px 32px 0 rgba(31, 38, 135, 0.2)',
              backdropFilter: 'blur(4px)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <span style={{ fontSize: '1.25rem' }}>⚙️</span>
                <div>
                  <div style={{ fontSize: '.7rem', color: '#1AA8BF', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    Modalità Modifica Attiva (Audit-Safe)
                  </div>
                  <div style={{ fontSize: '.85rem', color: '#fff', fontWeight: 700, marginTop: '2px' }}>
                    Modifica registrazione N. {state.header.numeroRegistrazione || state.meta.numeroRegistrazione || '—'} | Stato: <span style={{ color: '#ffb054' }}>{state.meta.stato || 'confermata'}</span> | Data reg.: <span style={{ color: '#ffb054' }}>{state.header.dataRegistrazione}</span> | Causale: <span style={{ color: '#ffb054' }}>{state.header.causaleContabileId}</span>
                  </div>
                  <div style={{ fontSize: '.72rem', color: 'var(--mu)', marginTop: '2px' }}>
                    ID: <span style={{ fontFamily: 'monospace' }}>{state.meta.primaNotaId}</span> | Versione: {state.meta.versione || 1}
                  </div>
                </div>
              </div>
              <div>
                <span className={`bdg ${state.meta.stato === 'annullata' || state.meta.stato === 'stornata' || state.meta.stato === 'storno' ? 'bdg-red' : 'bdg-green'}`} style={{ textTransform: 'uppercase', fontWeight: 800, fontSize: '.7rem', padding: '.3rem .6rem' }}>
                  Stato: {state.meta.stato || 'confermata'}
                </span>
              </div>
            </div>
            
            {(state.meta.stato === 'annullata' || state.meta.stato === 'stornata' || state.meta.stato === 'storno') && (
              <div
                style={{
                  marginTop: '.6rem',
                  padding: '.6rem .8rem',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ff8f8f',
                  fontSize: '.78rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '.5rem',
                }}
              >
                <span>⚠️</span>
                <span>SCRITTURA BLOCCATA: questa scrittura è stata già ANNULLATA, STORNATA o è uno STORNO. Nessun salvataggio consentito.</span>
              </div>
            )}
          </div>
        )}

        <RegistrazioneContextBanner
          esercizio={state.header.esercizioContabile}
          exerciseWarning={exerciseResolution.warning}
          selectedCausale={selectedCausale}
          selectedCausaleConfig={selectedCausaleConfig}
          selectedCausaleBehavior={selectedCausaleConfig}
          activePanels={activePanels}
          onConfirmExerciseUpdate={confirmExerciseUpdate}
        />

        {isAnnullaOrStorno ? (
          <div className="card" style={{ margin: '0.5rem 0', padding: '1.5rem', borderRadius: 20, background: 'linear-gradient(180deg, rgba(17,32,56,.95), rgba(9,17,30,.98))', border: '1px solid rgba(26, 168, 191, 0.35)', boxShadow: '0 12px 40px rgba(0,0,0,.4)' }}>
            {/* Titolo e Intestazione */}
            <div style={{ borderBottom: '1px solid rgba(255,255,255,.08)', paddingBottom: '1rem', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '.6rem' }}>
                <span style={{ fontSize: '1.8rem' }}>🛡️</span>
                <div>
                  <div style={{ fontSize: '.75rem', color: '#ffb054', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.08em' }}>
                    Workspace Operazioni Protette
                  </div>
                  <h2 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', margin: '4px 0 0 0' }}>
                    {state.meta.operationMode === 'annulla' ? 'ANNULLAMENTO SCRITTURA CONTABILE' : 'STORNO SCRITTURA CONTABILE'}
                  </h2>
                </div>
              </div>
            </div>

            {/* Dettaglio della scrittura target */}
            <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem' }}>
              <h3 style={{ fontSize: '.85rem', color: '#1AA8BF', fontWeight: 800, textTransform: 'uppercase', marginTop: 0, marginBottom: '.65rem' }}>Dati Scrittura Target</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '.6rem', fontSize: '.78rem' }}>
                <div><span style={{ color: 'var(--mu)' }}>N° Registrazione:</span> <strong style={{ color: '#fff' }}>#{state.header.numeroDocumento || '—'}</strong></div>
                <div><span style={{ color: 'var(--mu)' }}>Data Registrazione:</span> <strong style={{ color: '#fff' }}>{state.header.dataRegistrazione}</strong></div>
                <div><span style={{ color: 'var(--mu)' }}>Causale Contabile:</span> <strong style={{ color: '#fff' }}>{state.header.causaleContabileId}</strong></div>
                <div><span style={{ color: 'var(--mu)' }}>Soggetto:</span> <strong style={{ color: '#fff' }}>{state.header.clienteFornitoreNome || '—'}</strong></div>
                <div><span style={{ color: 'var(--mu)' }}>Totale Dare:</span> <strong style={{ color: '#1AA8BF' }}>€ {formatMoney(totals.dare)}</strong></div>
                <div><span style={{ color: 'var(--mu)' }}>Totale Avere:</span> <strong style={{ color: '#E8922A' }}>€ {formatMoney(totals.avere)}</strong></div>
                <div style={{ gridColumn: '1 / -1' }}><span style={{ color: 'var(--mu)' }}>Descrizione:</span> <strong style={{ color: '#fff' }}>{state.header.descrizioneGenerale || '—'}</strong></div>
              </div>
            </div>

            {/* Anteprima storno (Dare e Avere invertiti) */}
            {state.meta.operationMode === 'storno' && (
              <div style={{ background: 'rgba(255,255,255,.02)', border: '1px solid rgba(255,255,255,.04)', borderRadius: 12, padding: '1rem', marginBottom: '1.25rem' }}>
                <h3 style={{ fontSize: '.85rem', color: '#ffb054', fontWeight: 800, textTransform: 'uppercase', marginTop: 0, marginBottom: '.65rem' }}>
                  Anteprima Contro-Scrittura di Storno (Dare ↔ Avere Invertiti)
                </h3>
                <table className="tbl" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: '.7rem', color: 'var(--mu)', background: 'transparent', padding: '4px', textAlign: 'left' }}>Conto</th>
                      <th style={{ fontSize: '.7rem', color: 'var(--mu)', background: 'transparent', padding: '4px', textAlign: 'right' }}>Dare</th>
                      <th style={{ fontSize: '.7rem', color: 'var(--mu)', background: 'transparent', padding: '4px', textAlign: 'right' }}>Avere</th>
                      <th style={{ fontSize: '.7rem', color: 'var(--mu)', background: 'transparent', padding: '4px', textAlign: 'left' }}>Descrizione</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.rows.map((row) => {
                      const dareVal = Number(row.avere) || 0
                      const avereVal = Number(row.dare) || 0
                      return (
                        <tr key={row.id} style={{ background: 'rgba(255,255,255,.005)' }}>
                          <td style={{ fontSize: '.74rem', padding: '6px 4px', color: '#fff', textAlign: 'left' }}>
                            {row.conto_codice} - {row.conto_descrizione}
                          </td>
                          <td style={{ fontSize: '.74rem', padding: '6px 4px', textAlign: 'right', color: '#1AA8BF', fontWeight: 700 }}>
                            {dareVal > 0 ? `€ ${formatMoney(dareVal)}` : '—'}
                          </td>
                          <td style={{ fontSize: '.74rem', padding: '6px 4px', textAlign: 'right', color: '#E8922A', fontWeight: 700 }}>
                            {avereVal > 0 ? `€ ${formatMoney(avereVal)}` : '—'}
                          </td>
                          <td style={{ fontSize: '.72rem', padding: '6px 4px', color: 'var(--mu)', textAlign: 'left' }}>
                            STORNO - {row.descrizione || '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Stato caricamento barriere o visualizzazione barriere */}
            {loadingGuards ? (
              <div style={{ padding: '1.5rem', textAlign: 'center', background: 'rgba(255,255,255,.01)', borderRadius: 12, border: '1px solid rgba(255,255,255,.03)', color: 'var(--mu)', fontSize: '.8rem' }}>
                ⏳ Analisi barriere di sicurezza e regole fiscali in corso…
              </div>
            ) : operationGuards ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginBottom: '1.25rem' }}>
                
                {/* Banner Warning Level */}
                <div style={{
                  padding: '1rem',
                  borderRadius: 12,
                  background: operationGuards.can_execute 
                    ? (operationGuards.warning_level === 'verde' ? 'rgba(16, 185, 129, 0.08)' : 'rgba(245, 158, 11, 0.08)')
                    : 'rgba(239, 68, 68, 0.08)',
                  border: `1px solid ${operationGuards.can_execute 
                    ? (operationGuards.warning_level === 'verde' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(245, 158, 11, 0.3)')
                    : 'rgba(239, 68, 68, 0.3)'}`,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '.4rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '.4rem', fontWeight: 800, fontSize: '.8rem', color: operationGuards.can_execute 
                    ? (operationGuards.warning_level === 'verde' ? '#10B981' : '#F59E0B')
                    : '#EF4444' }}>
                    <span>{operationGuards.can_execute ? '✓ CONTROLLO INTEGRITÀ SUPERATO' : '⚠️ OPERAZIONE BLOCCATA'}</span>
                    <span style={{ fontSize: '.7rem', padding: '2px 6px', borderRadius: 4, background: 'rgba(255,255,255,.05)', marginLeft: 'auto' }}>
                      Livello: {operationGuards.warning_level?.toUpperCase()}
                    </span>
                  </div>

                  <div style={{ fontSize: '.76rem', color: 'rgba(255,255,255,.85)', lineHeight: 1.35 }}>
                    {operationGuards.can_execute 
                      ? (operationGuards.warning_level === 'verde' 
                        ? 'Nessun vincolo bloccante o avvertimento rilevato. L\'operazione è sicura e può essere completata.' 
                        : 'L\'operazione è consentita ma presenta degli impatti o avvisi contabili importanti che richiedono attenzione.')
                      : 'I controlli fiscali ed amministrativi hanno rilevato dei blocchi inderogabili. Impossibile procedere:'}
                  </div>

                  {/* Blocking Reasons */}
                  {!operationGuards.can_execute && Array.isArray(operationGuards.blocking_reasons) && operationGuards.blocking_reasons.length > 0 && (
                    <ul style={{ margin: '.4rem 0 0 0', paddingLeft: '1.2rem', fontSize: '.74rem', color: '#ff8f8f', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                      {operationGuards.blocking_reasons.map((r, i) => <li key={i}>{r}</li>)}
                    </ul>
                  )}

                  {/* Warnings */}
                  {operationGuards.can_execute && Array.isArray(operationGuards.warnings) && operationGuards.warnings.length > 0 && (
                    <ul style={{ margin: '.4rem 0 0 0', paddingLeft: '1.2rem', fontSize: '.74rem', color: '#ffb054', display: 'flex', flexDirection: 'column', gap: '.25rem' }}>
                      {operationGuards.warnings.map((w, i) => <li key={i}>{w}</li>)}
                    </ul>
                  )}
                </div>

                {/* Riepilogo effetti ed impatti */}
                {operationGuards.can_execute && (
                  <div style={{ background: 'rgba(26, 168, 191, 0.02)', border: '1px solid rgba(26, 168, 191, 0.1)', borderRadius: 12, padding: '1rem' }}>
                    <h4 style={{ fontSize: '.76rem', color: '#1AA8BF', fontWeight: 800, textTransform: 'uppercase', margin: '0 0 .5rem 0' }}>Riepilogo Impatti Stimati</h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '.6rem', fontSize: '.74rem' }}>
                      <div>
                        <span style={{ color: 'var(--mu)' }}>Azione consigliata:</span>{' '}
                        <strong style={{ color: '#fff', textTransform: 'uppercase' }}>{operationGuards.suggested_workflow || 'procedi'}</strong>
                      </div>
                      
                      {/* Output Impattati */}
                      {Array.isArray(operationGuards.impacted_outputs) && operationGuards.impacted_outputs.length > 0 && (
                        <div>
                          <span style={{ color: 'var(--mu)', display: 'block', marginBottom: '2px' }}>Output ed elaborati impattati:</span>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'rgba(255,255,255,.85)' }}>
                            {operationGuards.impacted_outputs.map((out, i) => <li key={i}>{out}</li>)}
                          </ul>
                        </div>
                      )}

                      {/* Followup Richiesti */}
                      {Array.isArray(operationGuards.required_followups) && operationGuards.required_followups.length > 0 && (
                        <div>
                          <span style={{ color: 'var(--mu)', display: 'block', marginBottom: '2px' }}>Follow-up ed adempimenti richiesti dopo l'operazione:</span>
                          <ul style={{ margin: 0, paddingLeft: '1.2rem', color: 'rgba(255,255,255,.85)' }}>
                            {operationGuards.required_followups.map((fol, i) => <li key={i}>{fol}</li>)}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            ) : null}

            {/* Form inserimento motivazione e data storno */}
            {operationGuards?.can_execute && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '.85rem', borderTop: '1px solid rgba(255,255,255,.05)', paddingTop: '1.25rem' }}>
                
                {/* Data Storno (solo se storno) */}
                {state.meta.operationMode === 'storno' && (
                  <div className="fg" style={{ maxWidth: 260 }}>
                    <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx)', display: 'block', marginBottom: '4px' }}>
                      Data Registrazione Contro-Scrittura (Storno)
                    </label>
                    <input 
                      type="date" 
                      value={dataStornoInput}
                      onChange={(e) => setDataStornoInput(e.target.value)}
                      style={{ width: '100%', background: '#0e1d32', border: '1px solid #1c3254', borderRadius: 8, color: '#fff', padding: '.45rem' }}
                    />
                  </div>
                )}

                {/* Motivazione */}
                <div className="fg">
                  <label style={{ fontSize: '.75rem', fontWeight: 700, color: 'var(--tx)', display: 'block', marginBottom: '4px' }}>
                    Giustificazione dell'operazione contabile (obbligatoria, min. 15 caratteri)
                  </label>
                  <textarea
                    placeholder="Fornisci una descrizione dettagliata del motivo dell'operazione..."
                    value={motivoOperazione}
                    onChange={(e) => setMotivoOperazione(e.target.value)}
                    style={{ width: '100%', minHeight: 80, fontSize: '.78rem', background: '#0e1d32', border: '1px solid #1c3254', borderRadius: 8, color: '#fff', padding: '.5rem' }}
                  />
                  <div style={{ fontSize: '.68rem', color: motivoOperazione.trim().length >= 15 ? '#8be28e' : '#ff8f8f', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Stato validazione: {motivoOperazione.trim().length >= 15 ? 'Giustificazione valida' : 'Lunghezza insufficiente'}</span>
                    <span>{motivoOperazione.trim().length} / 15 caratteri</span>
                  </div>
                </div>

                {/* Azioni di conferma e annullamento */}
                <div style={{ display: 'flex', gap: '.6rem', justifyContent: 'flex-end', marginTop: '.75rem' }}>
                  <button 
                    type="button" 
                    className="btn-sec"
                    onClick={() => {
                      resetDraft(true, false, state.header.esercizioContabile, false)
                    }}
                    disabled={saving}
                  >
                    Annulla ed Esci
                  </button>
                  
                  <button
                    type="button"
                    className="btn-warn"
                    style={{ 
                      background: state.meta.operationMode === 'annulla' ? '#EF4444' : '#F59E0B', 
                      color: '#000', 
                      fontWeight: 'bold',
                      border: 'none',
                      borderRadius: 8,
                      padding: '.6rem 1.2rem',
                      cursor: 'pointer'
                    }}
                    onClick={handleConfirmOperation}
                    disabled={saving || motivoOperazione.trim().length < 15 || !operationGuards?.can_execute}
                  >
                    {saving 
                      ? 'Elaborazione in corso…' 
                      : (state.meta.operationMode === 'annulla' ? 'Conferma Annullamento Logico' : 'Conferma Storno Contabile')}
                  </button>
                </div>

              </div>
            )}

          </div>
        ) : (
          <>
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
                gridTemplateColumns: sidebarCollapsed ? '1fr' : 'minmax(0, 1.72fr) minmax(360px, .92fr)',
                gap: '.75rem',
                alignItems: 'start',
              }}
            >
              <div ref={rowsRef}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '.4rem', gap: '1rem' }}>
                  <RegistrazioneTabs
                    tabs={allowedTabs.map((id) => ({ id, label: tabLabel(id) }))}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                  />
                  <button
                    type="button"
                    className="btn btn-outline"
                    onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                    style={{
                      padding: '.25rem .5rem',
                      fontSize: '.72rem',
                      height: 'fit-content',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '.25rem'
                    }}
                  >
                    <span>{sidebarCollapsed ? 'Espandi F9' : 'Collassa F9'}</span>
                  </button>
                </div>

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
                  <div data-reg-section="rows">
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
                  </div>
                ) : activeTab === 'iva' ? (
                  <div data-reg-section="iva">
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
                      causaleContabile={selectedCausale}
                    />
                  </div>
                ) : activeTab === 'partitario' ? (
                  <div data-reg-section="partitario">
                    <RegistrazionePartitarioPanel
                      header={state.header}
                      partitarioData={state.partitarioData}
                      partite={selectedContropartePartite}
                      selectedCausale={selectedCausale}
                      onChange={applyPartitarioPatch}
                      pnRows={resolvedRows}
                      onApplySelected={(row) => {
                        if (!row) return
                        const saldoRaw = resolvePartitaImportoResiduo(row, 0)
                        const saldo = Number.parseFloat(String(saldoRaw).replace(',', '.')) || 0
                        const idStr = String(row.id || '').trim()

                        // Subject validation block
                        const currentSelected = (state.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
                        const isSelected = currentSelected.includes(idStr)

                        if (!isSelected) {
                          const partitaToSelect = (selectedContropartePartite || []).find(p => String(p.id || '').trim() === idStr)
                          if (partitaToSelect) {
                            const newSoggettoId = resolvePartitaSoggettoId(partitaToSelect)
                            
                            const differentSubject = currentSelected.some(existingId => {
                              const existingPartita = (selectedContropartePartite || []).find(p => String(p.id || '').trim() === existingId)
                              if (existingPartita) {
                                const existingSoggettoId = resolvePartitaSoggettoId(existingPartita)
                                return existingSoggettoId !== newSoggettoId
                              }
                              return false
                            })

                            if (differentSubject) {
                              setError('Incassi/pagamenti multipli non ancora abilitati')
                              return
                            }
                          }
                        }

                        setState((prev) => {
                          const currentSelected = (prev.partitarioData?.selectedPartitaIds || []).map(x => String(x || '').trim())
                          const isSelected = currentSelected.includes(idStr)
                          const nextSelected = isSelected ? currentSelected : [...currentSelected, idStr]
                          
                          const checked = (prev.partitarioData?.checkedPartiteIds || []).map(x => String(x || '').trim())
                          const nextChecked = isSelected ? checked : Array.from(new Set([...checked, idStr]))

                          const nextImporti = { ...(prev.partitarioData?.importiChiusura || {}) }
                          let currentChiusura = nextImporti[idStr]
                          if (currentChiusura === undefined) {
                            currentChiusura = String(saldo)
                            nextImporti[idStr] = currentChiusura
                          }
                          return {
                            ...prev,
                            partitarioData: {
                              ...prev.partitarioData,
                              selectedPartitaIds: nextSelected,
                              checkedPartiteIds: nextChecked,
                              selectedPartitaId: idStr,
                              selectedPartitaNumeroDocumento: String(row.numeroDocumento || row.numero_documento || ''),
                              selectedPartitaDataDocumento: String(row.dataDocumento || row.data_documento || ''),
                              selectedPartitaTipoDocumento: String(row.tipoDocumento || row.tipo_documento || ''),
                              selectedPartitaImportoOrigine: String(row.importoOriginario || row.importo_originale || row.totale || 0),
                              selectedPartitaSaldoResiduo: String(saldo),
                              importoChiusura: String(currentChiusura),
                              importiChiusura: nextImporti,
                              segnoChiusura: saldo < 0 ? 'D' : 'A',
                              tipoMovimento: 'chiusura',
                              manualImportoApertoOverride: false,
                              manualImportoChiusuraOverride: false,
                              stato: 'predisposto',
                            },
                          }
                        })
                      }}
                      focusOrder={focusOrder}
                      disabled={!draftStarted}
                      behavior={selectedCausaleConfig}
                      draft={draftModel.partitarioDraft}
                      validation={draftModel.partitarioDraft?.validation}
                      onToggleCheckedPartita={onToggleCheckedPartita}
                      onUpdateRowImportoChiusura={onUpdateRowImportoChiusura}
                      onBlurImportoChiusura={onBlurImportoChiusura}
                    />
                  </div>
                ) : activeTab === 'ivaPerCassaPreview' ? (
                  <div data-reg-section="iva-per-cassa-preview">
                    <RegistrazionePreviewPanel
                      mode="ivaPerCassaPreview"
                      ivaPerCassaPreview={draftModel.partitarioDraft?.ivaPerCassaPreview}
                    />
                  </div>
                ) : activeTab === 'ritenute' ? (
                  <div data-reg-section="ritenute">
                    <RegistrazioneRitenutePanel
                      ritenutaData={state.ritenutaData}
                      onChange={applyRitenutePatch}
                      focusOrder={focusOrder}
                      disabled={!draftStarted}
                      behavior={selectedCausaleConfig}
                      draft={draftModel.ritenutaDraft}
                      percipienti={percipientiCatalog}
                      onRefreshPercipienti={reloadPercipientiCatalog}
                      header={state.header}
                    />
                  </div>
                ) : null}
              </div>

              <div ref={previewRef} style={{ minHeight: 0, display: sidebarCollapsed ? 'none' : 'block' }}>
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
                  ivaPerCassaPreview={draftModel.partitarioDraft?.ivaPerCassaPreview}
                  ritenutaDraft={draftModel.ritenutaDraft}
                  checkedPartiteIds={state.partitarioData?.checkedPartiteIds || []}
                  onToggleCheckedPartita={onToggleCheckedPartita}
                  onApplyCheckedPartite={onApplyCheckedPartite}
                  pnRows={resolvedRows}
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
          </>
        )}
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
