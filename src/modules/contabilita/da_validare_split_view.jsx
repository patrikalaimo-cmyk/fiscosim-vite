import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { resolveIvaOrNull } from '../../../domain/resolveIva.js'
import { evaluateDraftReliability, reliabilityTierLabel } from '../../../domain/draftReliability.js'
import { sb } from '../../lib/supabase.js'
import { ContabileCopilotPanel } from './ContabileCopilotPanel.jsx'
import { buildCopilotFixPromptFromInsight } from './CopilotInsightsBlock.jsx'
import { loadIvaInsightsForSocieta } from './application/ivaInsightsClient.js'
import {
  buildParcellaAudit,
  buildParcellaAuditRecord,
  buildParcellaDecision,
  extractParcellaInvoiceSignals,
  isProfessionalParcellaDocument,
} from './application/parcellaDecisionEngine.js'
import {
  buildAvailableColumns,
  buildInsertRecord,
  classifyPercipienteOutcome,
  findExistingPercipiente as findExistingPercipienteByCandidate,
  inferPercipienteCandidate,
  mergeForUpdate,
} from './application/percipientiRegistryService.js'
import * as contabilitaRepo from './data/contabilitaRepo.js'
import { fmtCurrency as fmt, fmtDate } from './ui/formatters.js'
import { BaseInput } from './ui/BaseControls.jsx'
import { BaseCombobox } from './ui/BaseDropdown.jsx'
import { DocumentPreviewModal } from '../../shared/ui/DocumentPreviewModal.jsx'
import { suggestContiPerDocumento } from '../../shared/utils/pianoContiSuggestions.js'
import { buildHistoricalContoSuggestions, extractHistoricalSearchIdentity } from '../../shared/utils/historicalContoSuggestions.js'
import { buildOperatorAssistItems, appendOperatorClarification } from '../../shared/utils/operatorAssist.js'
import { OperatorAssistPanel } from '../../shared/components/OperatorAssistPanel.jsx'
import { OperatorClarificationModal } from '../../shared/components/OperatorClarificationModal.jsx'
import {
  CAUSALI_REDDITUALI_OPTIONS,
  SOMME_NON_SOGGETTE_OPTIONS,
} from '../../shared/constants/fiscalCatalog.js'

function parseDati(raw) {
  if (!raw) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }
  return typeof raw === 'object' ? { ...raw } : {}
}

function normalizeTextMatch(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

function normalizeVatMatch(value) {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase()
}

function findMatchingPercipiente(percipienti, doc) {
  const dati = parseDati(doc?.dati_estratti)
  const cf = normalizeTextMatch(doc?.soggetto_cf || dati?.cedente_cf || '')
  const piva = normalizeVatMatch(doc?.soggetto_piva || dati?.cedente_piva || '')
  const denom = normalizeTextMatch(doc?.soggetto_denominazione || dati?.cedente_denom || '')
  return (percipienti || []).find((row) => {
    if (cf && normalizeTextMatch(row?.codice_fiscale) === cf) return true
    if (piva && normalizeVatMatch(row?.partita_iva) === piva) return true
    const rowName = normalizeTextMatch(row?.ragione_sociale || `${row?.cognome || ''} ${row?.nome || ''}`.trim())
    return denom && rowName === denom
  }) || null
}

function toDecimal(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function mapPaymentCausale(registrationCausale) {
  if (registrationCausale === 'FF') return 'PF'
  if (registrationCausale === 'RPPC') return 'PPPC'
  return 'PF80'
}

function buildPercipienteFromConfirmation({ societaId, doc, matchedPercipiente, finalValues }) {
  const inferred = inferPercipienteCandidate(doc)
  const candidate = inferred?.candidate ? { ...inferred.candidate } : {}
  const displayName = doc?.soggetto_denominazione || matchedPercipiente?.ragione_sociale || ''
  const isCompany = /\b(SRL|SPA|SNC|SAS|STP|ASSOCIATI|STUDIO)\b/i.test(displayName || '')
  return {
    ...candidate,
    societa_id: societaId,
    tipo_persona: matchedPercipiente?.tipo_persona || candidate.tipo_persona || (isCompany ? 'giuridica' : 'fisica'),
    ragione_sociale: matchedPercipiente?.ragione_sociale || candidate.ragione_sociale || (isCompany ? displayName : ''),
    nome: matchedPercipiente?.nome || candidate.nome || '',
    cognome: matchedPercipiente?.cognome || candidate.cognome || '',
    codice_fiscale: matchedPercipiente?.codice_fiscale || candidate.codice_fiscale || doc?.soggetto_cf || '',
    partita_iva: matchedPercipiente?.partita_iva || candidate.partita_iva || doc?.soggetto_piva || '',
    causale_prevalente: finalValues?.causaleReddituale || matchedPercipiente?.causale_prevalente || candidate.causale_prevalente || 'A',
    codice_somme_non_soggette: finalValues?.codiceSommeNonSoggette || matchedPercipiente?.codice_somme_non_soggette || '',
    soggetto_ritenuta: finalValues?.withholdingRate > 0,
    aliquota_ritenuta: finalValues?.withholdingRate ?? matchedPercipiente?.aliquota_ritenuta ?? candidate.aliquota_ritenuta ?? 0,
    tipo_ritenuta: finalValues?.withholdingRate > 0 ? 'acconto' : (matchedPercipiente?.tipo_ritenuta || candidate.tipo_ritenuta || 'nessuna'),
    soggetto_cu: finalValues?.downstream?.updateCu ?? matchedPercipiente?.soggetto_cu ?? candidate.soggetto_cu ?? true,
    soggetto_770: finalValues?.downstream?.update770 ?? matchedPercipiente?.soggetto_770 ?? candidate.soggetto_770 ?? true,
    cassa_previdenziale: finalValues?.cassaFlag ? finalValues?.cassaPercent : 0,
    inps_flag: Boolean(finalValues?.inpsFlag),
    enasarco_flag: Boolean(finalValues?.enasarcoFlag),
    payment_schedule_1040: finalValues?.downstream?.paymentSchedule1040 ?? matchedPercipiente?.payment_schedule_1040 ?? candidate.payment_schedule_1040 ?? false,
    regime_fiscale: finalValues?.codiceSommeNonSoggette === '24' ? 'forfettario' : (matchedPercipiente?.regime_fiscale || candidate.regime_fiscale || 'ordinario'),
    validation_state: !String(doc?.soggetto_cf || matchedPercipiente?.codice_fiscale || '').trim()
      ? 'incomplete'
      : finalValues?.withholdingRate > 0 && !finalValues?.causaleReddituale
        ? 'da_validare'
        : 'complete',
    linked_documents_count: Math.max(Number(matchedPercipiente?.linked_documents_count || 0), 0) + 1,
    last_invoice_date: doc?.data_documento || matchedPercipiente?.last_invoice_date || null,
    compensi_ytd: Math.max(Number(matchedPercipiente?.compensi_ytd || 0), 0) + Number(finalValues?.imponibileCompenso || 0),
    ritenute_ytd: Math.max(Number(matchedPercipiente?.ritenute_ytd || 0), 0) + Number(finalValues?.withholdingAmount || 0),
    auto_imported: true,
    attivo: matchedPercipiente?.attivo ?? true,
  }
}

/** Stile badge punteggio 0–100 */
function confidenceBadgeStyle(c) {
  if (c == null || c === '' || !Number.isFinite(Number(c))) {
    return { background: 'var(--s2)', color: 'var(--mu)', border: '1px solid var(--bd)' }
  }
  const n = Number(c)
  if (n > 90) return { background: 'rgba(46,125,50,.35)', color: '#a5d6a7', border: '1px solid rgba(76,175,80,.5)' }
  if (n >= 70) return { background: 'rgba(245,180,0,.35)', color: '#ffe082', border: '1px solid rgba(255,193,7,.55)' }
  return { background: 'rgba(183,28,28,.4)', color: '#ffcdd2', border: '1px solid rgba(239,83,80,.5)' }
}

/** Tooltip testuale: spiegazione breve + fonte AI + breakdown punteggi */
function buildAutoValidateTooltip(row) {
  if (!row) {
    return 'Nessuna scrittura contabile in pipeline per questo documento.\nEsegui l’import con pipeline AI oppure “Aggiorna punteggi” per calcolare.'
  }
  const lines = []
  const expl = String(row.ai_explanation || '').trim()
  if (expl) lines.push(expl)
  const src = row.ai_source
  if (src === 'memory') {
    lines.push('Fonte: memoria — conto collegato in anagrafica sul piano dei conti (P.IVA).')
  } else if (src === 'learning') {
    lines.push('Fonte: apprendimento — conto proposto da regole ai_learning (conferme/correzioni cumulative per anagrafica).')
  } else if (src === 'pattern') {
    lines.push('Fonte: pattern — stesso conto o abitudine ricavata da documenti precedenti della stessa anagrafica.')
  } else if (src === 'fallback') {
    lines.push('Fonte: fallback — pochi segnali automatici; decisione da verificare.')
  } else {
    lines.push(`Fonte: ${src || 'non assegnata'}.`)
  }
  const b = row.auto_validate_meta && typeof row.auto_validate_meta === 'object' ? row.auto_validate_meta : {}
  const parts = []
  if (b.ai_learning_frequenza) parts.push(`Apprendimento ${b.ai_learning_frequenza}×`)
  if (b.combined_boost) parts.push(`Rafforzamento +${b.combined_boost}`)
  if (b.mapping_piano_anagrafica) parts.push(`Mapping piano +${b.mapping_piano_anagrafica}`)
  if (b.stessa_anagrafica_stesso_conto) parts.push(`Stesso conto in passato +${b.stessa_anagrafica_stesso_conto}`)
  if (b.ai_pattern_storico) parts.push(`Pattern storico +${b.ai_pattern_storico}`)
  if (b.nuova_anagrafica) parts.push(`Anagrafica nuova ${b.nuova_anagrafica}`)
  if (parts.length) lines.push('Punteggio: ' + parts.join(', ') + '.')
  if (row.ai_status) lines.push(`Stato automatico: ${row.ai_status}.`)
  return lines.join('\n')
}

function learningFrequenzaFromMeta(row) {
  const b = row?.auto_validate_meta && typeof row.auto_validate_meta === 'object' ? row.auto_validate_meta : {}
  const n = Number(b.ai_learning_frequenza)
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function isAiLearningSource(row) {
  return row?.ai_source === 'learning'
}

/** Raggruppa accounting_entries per document_id (più recente). */
function latestEntryByDocumentId(rows) {
  const map = {}
  const list = Array.isArray(rows) ? rows : []
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime()
    const tb = new Date(b.created_at || 0).getTime()
    return tb - ta
  })
  for (const r of sorted) {
    const id = r.document_id != null ? String(r.document_id) : ''
    if (id && map[id] == null) map[id] = r
  }
  return map
}

function normContoCode(c) {
  return String(c || '')
    .replace(/\s+/g, '')
    .replace(/\./g, '')
    .trim()
}

function getDocImponibileIva(doc) {
  const d = parseDati(doc?.dati_estratti)
  const imponibile =
    Number(doc?.imponibile ?? d?.imponibile ?? d?.totale_imponibile ?? d?.base_imponibile ?? 0) || 0
  let iva =
    Number(doc?.imposta ?? doc?.iva ?? d?.imposta ?? d?.iva ?? d?.totale_iva ?? 0) || 0

  if ((!iva || iva === 0) && Array.isArray(d?.riepilogo_iva)) {
    iva = d.riepilogo_iva.reduce((acc, row) => acc + (Number(row?.imposta ?? row?.iva ?? 0) || 0), 0)
  }

  return { imponibile, iva }
}

function AccountingForm({
  doc,
  pianoConti,
  causaliIva,
  onSave,
  onClose,
  onOpenGuidata,
  onOpenDocumentPreview,
  listIds,
  idxInList,
  autoValidateMode = false,
  entryMeta = null,
  onTogglePinExplanation = null,
  onRefreshEntryMeta = null,
  copilotHighlight = null,
  ivaInsights = [],
  ivaInsightsLoading = false,
}) {
  const [contoId, setContoId] = useState('')
  const [causaleIva, setCausaleIva] = useState('')
  const [dataReg, setDataReg] = useState('')
  const [tipoPag, setTipoPag] = useState('')
  const [contoSearch, setContoSearch] = useState('')
  const [showDd, setShowDd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [learningRuleModal, setLearningRuleModal] = useState(null)
  const [learningRuleBusy, setLearningRuleBusy] = useState(false)
  const [percipienti, setPercipienti] = useState([])
  const [percipientiLoading, setPercipientiLoading] = useState(false)
  const [parcellaForm, setParcellaForm] = useState(null)
  const [showParcellaAudit, setShowParcellaAudit] = useState(false)
  const [possiblePercipienteModalOpen, setPossiblePercipienteModalOpen] = useState(false)
  const [possiblePercipienteDecision, setPossiblePercipienteDecision] = useState(null) // 'create' | 'leave' | 'defer'
  const possiblePercipienteDecisionRef = useRef(null)
  const pendingPersistArgsRef = useRef(null)
  const [historicalContoSuggestions, setHistoricalContoSuggestions] = useState([])
  const [historicalContoLoading, setHistoricalContoLoading] = useState(false)
  const [historicalLearningRows, setHistoricalLearningRows] = useState([])
  const [operatorClarifications, setOperatorClarifications] = useState([])
  const [clarificationModalItem, setClarificationModalItem] = useState(null)
  const [parcellaConfirmationOverride, setParcellaConfirmationOverride] = useState(null)

  useEffect(() => {
    setLearningRuleModal(null)
    setShowParcellaAudit(false)
    setPossiblePercipienteModalOpen(false)
    setPossiblePercipienteDecision(null)
    possiblePercipienteDecisionRef.current = null
    setClarificationModalItem(null)
    setParcellaConfirmationOverride(null)
    setOperatorClarifications(parseDati(doc?.dati_estratti)?.operator_clarifications || [])
  }, [doc?.id])

  useEffect(() => {
    if (!doc) return
    const d = parseDati(doc.dati_estratti)
    setContoId(doc.conto_id || d.conto_id || '')
    setCausaleIva(doc.causale_iva || '')
    setDataReg((d.data_registrazione || doc.data_documento || '').toString().slice(0, 10))
    setTipoPag(d.tipo_pagamento || '')
    setContoSearch('')
    setShowDd(false)
  }, [doc?.id])

  useEffect(() => {
    if (!doc || !causaliIva?.length) return
    const de = parseDati(doc.dati_estratti)
    const riepilogo = de?.riepilogo_iva || []
    const pivaFornitore = doc.soggetto_piva || de?.cedente_piva
    const contoFornitore =
      pianoConti?.find((c) => c.partita_iva === pivaFornitore || c.anagrafica_piva === pivaFornitore) || null
    if (riepilogo.length === 0) {
      if (!causaleIva) {
        const aliqDoc = doc.aliquota_iva || de?.aliquota_iva || '22'
        const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: aliqDoc, natura: '', causaliIva, pipelineContext: undefined }) || '')
        if (id) setCausaleIva(id)
      }
      return
    }
    if (riepilogo.length === 1 && !causaleIva) {
      const r = riepilogo[0]
      const id = (resolveIvaOrNull({ conto: contoFornitore || null, aliquota: r.aliquota, natura: r.natura || '', causaliIva, pipelineContext: undefined }) || '')
      if (id) setCausaleIva(id)
    }
  }, [causaliIva?.length, doc?.id])

  const engineSource = useMemo(() => {
    const metodo = String(doc?.ai_raw_response?.metodo || '').toLowerCase()
    if (metodo.includes('ollama') || metodo.includes('xml_deterministico') || metodo.includes('local')) return 'locale'
    if (metodo.includes('openai') || metodo.includes('online') || metodo.includes('gateway') || metodo.includes('api')) return 'online'
    return 'sconosciuto'
  }, [doc?.ai_raw_response?.metodo])

  const parcellaAssistRaw = useMemo(() => {
    const txt = [
      doc?.tipo_documento,
      doc?.ai_raw_response?.tipo_documento,
      doc?.ai_raw_response?.xml_content,
      doc?.ai_raw_response?.causale,
      doc?.soggetto_denominazione,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return /parcella|onorario|ritenuta|cassa|inps|enasarco|compenso|prestazione|consulenza/.test(txt)
  }, [doc?.tipo_documento, doc?.ai_raw_response?.tipo_documento, doc?.ai_raw_response?.xml_content, doc?.ai_raw_response?.causale, doc?.soggetto_denominazione])

  const effectiveDocForParcella = useMemo(() => {
    if (parcellaConfirmationOverride == null) return doc
    const parsed = parseDati(doc?.dati_estratti)
    return {
      ...doc,
      dati_estratti: {
        ...parsed,
        parcella_confirmation: parcellaConfirmationOverride,
      },
    }
  }, [doc, parcellaConfirmationOverride])

  const isProfessionalDoc = useMemo(() => isProfessionalParcellaDocument(effectiveDocForParcella), [effectiveDocForParcella])

  useEffect(() => {
    let cancelled = false
    if (!isProfessionalDoc || !doc?.societa_id) {
      setPercipienti([])
      setParcellaForm(null)
      return () => {}
    }
    setPercipientiLoading(true)
    contabilitaRepo
      .getPercipientiAttivi(doc.societa_id)
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          console.warn('[DaValidare] percipienti load', error)
          setPercipienti([])
        } else {
          setPercipienti(Array.isArray(data) ? data : [])
        }
      })
      .finally(() => {
        if (!cancelled) setPercipientiLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [doc?.societa_id, doc?.id, isProfessionalDoc])

  const matchedPercipiente = useMemo(
    () => (isProfessionalDoc ? findMatchingPercipiente(percipienti, doc) : null),
    [doc, isProfessionalDoc, percipienti]
  )

  useEffect(() => {
    if (!doc || !isProfessionalDoc || percipientiLoading) return
    const savedData = parseDati(doc.dati_estratti)
    const saved = savedData?.parcella_confirmation
    const savedAuditRecord = savedData?.parcella_audit
    const initialPercipiente =
      percipienti.find((row) => String(row.id) === String(saved?.finalValues?.percipienteId || '')) ||
      matchedPercipiente ||
      null
    const decision = buildParcellaDecision({ percipiente: initialPercipiente, documentRow: effectiveDocForParcella, draft: {} })
    const proposal = decision.proposal
    const finalValues = saved?.finalValues || {}
    setParcellaForm({
      percipienteId: finalValues.percipienteId || initialPercipiente?.id || '',
      causaleReddituale: finalValues.causaleReddituale || proposal.causaleReddituale,
      cassaFlag: finalValues.cassaFlag ?? proposal.cassaFlag,
      cassaPercent: finalValues.cassaPercent ?? proposal.cassaPercent,
      inpsFlag: finalValues.inpsFlag ?? proposal.inpsFlag,
      enasarcoFlag: finalValues.enasarcoFlag ?? proposal.enasarcoFlag,
      compensoLordo: finalValues.imponibileCompenso ?? proposal.imponibileCompenso,
      quotaNonSoggetta: finalValues.quotaNonSoggetta ?? proposal.quotaNonSoggetta,
      codiceSommeNonSoggette: finalValues.codiceSommeNonSoggette ?? proposal.codiceSommeNonSoggette,
      withholdingRate: finalValues.withholdingRate ?? proposal.withholdingRate,
      withholdingAmount: finalValues.withholdingAmount ?? proposal.withholdingAmount,
      registrationCausale: finalValues.registrationCausale || proposal.registrationCausale,
      paymentCausale: finalValues.paymentCausale || proposal.paymentCausale,
      downstream: finalValues.downstream || proposal.downstream,
      auditStatus: savedAuditRecord?.status || saved?.audit?.status || '',
      savedStatus: saved?.status || '',
    })
  }, [doc, isProfessionalDoc, matchedPercipiente, percipienti, percipientiLoading])

  const selectedConto = pianoConti.find((c) => c.id === contoId)
  const contoSuggestions = useMemo(
    () => suggestContiPerDocumento({ doc, pianoConti, maxResults: 3 }),
    [
      doc?.id,
      doc?.tipo_documento,
      doc?.soggetto_denominazione,
      doc?.soggetto_piva,
      doc?.soggetto_cf,
      doc?.dati_estratti,
      pianoConti,
    ]
  )

  const historicalIdentity = useMemo(
    () => extractHistoricalSearchIdentity(doc),
    [doc?.id, doc?.soggetto_piva, doc?.soggetto_cf, doc?.soggetto_denominazione, doc?.dati_estratti, doc?.ai_raw_response]
  )

  useEffect(() => {
    let alive = true
    if (!doc?.societa_id) {
      setHistoricalLearningRows([])
      return () => {
        alive = false
      }
    }
    contabilitaRepo
      .getArchivioStoricoAiLearning([doc.societa_id], { limit: 5000 })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          console.warn('[DaValidare] historical learning rows', error.message)
          setHistoricalLearningRows([])
          return
        }
        setHistoricalLearningRows(Array.isArray(data) ? data : [])
      })
      .catch((error) => {
        if (!alive) return
        console.warn('[DaValidare] historical learning rows', error?.message || error)
        setHistoricalLearningRows([])
      })
    return () => {
      alive = false
    }
  }, [doc?.societa_id])

  useEffect(() => {
    let alive = true
    const { piva, cf, nomeLike, nome } = historicalIdentity || {}
    if (!doc?.id || (!piva && !cf && !nomeLike)) {
      setHistoricalContoSuggestions([])
      return () => {
        alive = false
      }
    }
    setHistoricalContoLoading(true)
    contabilitaRepo
      .getHistoricalConfirmedDocumentsForCounterparty({
        piva,
        cf,
        nomeLike: nomeLike || nome,
        limit: 80,
      })
      .then(({ data, error }) => {
        if (!alive) return
        if (error) {
          console.warn('[DaValidare] historical conto suggestions', error.message)
          setHistoricalContoSuggestions([])
          return
        }
        const label = piva
          ? `${(data || []).length} fatture confermate con stessa P.IVA`
          : cf
            ? `${(data || []).length} fatture confermate con stesso CF`
            : `${(data || []).length} documenti confermati con ragione sociale simile`
        setHistoricalContoSuggestions(
          buildHistoricalContoSuggestions({
            historicalDocs: data || [],
            learningRows: historicalLearningRows,
            pianoConti,
            maxResults: 3,
            sourceLabel: label,
            currentDoc: doc,
            currentSocietaId: doc?.societa_id,
          })
        )
      })
      .finally(() => {
        if (alive) setHistoricalContoLoading(false)
      })
    return () => {
      alive = false
    }
  }, [doc?.id, historicalIdentity?.piva, historicalIdentity?.cf, historicalIdentity?.nomeLike, historicalLearningRows, pianoConti, doc?.societa_id])

  const selectedPercipiente = useMemo(() => {
    if (!isProfessionalDoc) return null
    return (
      percipienti.find((row) => String(row.id) === String(parcellaForm?.percipienteId || matchedPercipiente?.id || '')) ||
      matchedPercipiente ||
      null
    )
  }, [isProfessionalDoc, matchedPercipiente, parcellaForm?.percipienteId, percipienti])

  const parcellaDecision = useMemo(() => {
    if (!doc || !isProfessionalDoc) return null
    return buildParcellaDecision({ percipiente: selectedPercipiente, documentRow: effectiveDocForParcella, draft: {} })
  }, [effectiveDocForParcella, isProfessionalDoc, selectedPercipiente])

  const parcellaFinalValues = useMemo(() => {
    if (!parcellaDecision || !parcellaForm) return null
    const compensoLordo = toDecimal(parcellaForm.compensoLordo, parcellaDecision.proposal.imponibileCompenso)
    const quotaNonSoggetta = toDecimal(parcellaForm.quotaNonSoggetta, parcellaDecision.proposal.quotaNonSoggetta)
    const withholdingRate = toDecimal(parcellaForm.withholdingRate, parcellaDecision.proposal.withholdingRate)
    const withholdingAmount = toDecimal(parcellaForm.withholdingAmount, parcellaDecision.proposal.withholdingAmount)
    const registrationCausale = parcellaForm.registrationCausale || parcellaDecision.proposal.registrationCausale
    return {
      percipienteId: parcellaForm.percipienteId || selectedPercipiente?.id || '',
      causaleReddituale: parcellaForm.causaleReddituale || parcellaDecision.proposal.causaleReddituale,
      cassaFlag: Boolean(parcellaForm.cassaFlag),
      cassaPercent: toDecimal(parcellaForm.cassaPercent, parcellaDecision.proposal.cassaPercent),
      inpsFlag: Boolean(parcellaForm.inpsFlag),
      enasarcoFlag: Boolean(parcellaForm.enasarcoFlag),
      imponibileCompenso: compensoLordo,
      quotaNonSoggetta,
      codiceSommeNonSoggette: parcellaForm.codiceSommeNonSoggette || '',
      withholdingRate,
      withholdingAmount,
      compensoNetto: Math.round((compensoLordo - withholdingAmount) * 100) / 100,
      deductionRule: parcellaDecision.proposal.deductionRule,
      registrationCausale,
      paymentCausale: parcellaForm.paymentCausale || mapPaymentCausale(registrationCausale),
      downstream: parcellaForm.downstream || parcellaDecision.proposal.downstream,
    }
  }, [parcellaDecision, parcellaForm, selectedPercipiente])

  const percipienteIntake = useMemo(() => {
    if (!doc) return null
    const inferred = inferPercipienteCandidate(doc)
    const cls = classifyPercipienteOutcome({
      documentRow: doc,
      inferred,
      matchedPercipiente: selectedPercipiente,
    })
    return { inferred, ...cls }
  }, [doc, selectedPercipiente])

  const percipienteIntakeSummary = useMemo(() => {
    if (!percipienteIntake?.inferred?.relevant) return null
    const cand = percipienteIntake?.inferred?.candidate || {}
    const denom = doc?.soggetto_denominazione || cand.ragione_sociale || ''
    return {
      denominazione: denom || 'Soggetto',
      codiceFiscale: String(cand.codice_fiscale || doc?.soggetto_cf || '').trim(),
      partitaIva: String(cand.partita_iva || doc?.soggetto_piva || '').trim(),
      reasons: percipienteIntake.reasons || [],
      outcome: percipienteIntake.outcome,
    }
  }, [percipienteIntake, doc])

  const buildPercipienteReviewAudit = useCallback(
    ({ decision, d0, classification }) => {
      const existingAuditId = d0?.percipiente_review_audit?.audit_id || null
      const auditId = existingAuditId || `pr_${Math.random().toString(16).slice(2)}_${Date.now()}`
      return {
        audit_id: auditId,
        version: 1,
        document_id: doc?.id || null,
        classification,
        reasons: percipienteIntake?.reasons || [],
        signals: percipienteIntake?.signals || percipienteIntake?.inferred?.signals || {},
        operator_decision: decision,
        user: 'Operatore',
        timestamp: new Date().toISOString(),
      }
    },
    [doc?.id, percipienteIntake]
  )

  const parcellaWarnings = useMemo(() => {
    if (!parcellaDecision) return []
    const extra = []
    if (!selectedPercipiente) extra.push('Percipiente non collegato: verifica anagrafica e classificazione prima della conferma.')
    if (selectedPercipiente?.validation_state && selectedPercipiente.validation_state !== 'complete') {
      extra.push(`Percipiente ${selectedPercipiente.validation_state === 'da_validare' ? 'da validare' : 'incompleto'}: controllare i dati fiscali.`)
    }
    return [...new Set([...(parcellaDecision.warnings || []), ...extra])]
  }, [parcellaDecision, selectedPercipiente])

  const parcellaAuditPreview = useMemo(() => {
    if (!parcellaDecision || !parcellaFinalValues) return null
    return buildParcellaAudit({
      proposal: parcellaDecision.proposal,
      finalValues: parcellaFinalValues,
      userLabel: 'Operatore',
    })
  }, [parcellaDecision, parcellaFinalValues])

  const proposedPayable = useMemo(() => {
    if (!doc || !parcellaFinalValues) return 0
    return Math.round((toDecimal(doc.totale, parcellaFinalValues.imponibileCompenso) - parcellaFinalValues.withholdingAmount) * 100) / 100
  }, [doc, parcellaFinalValues])
  const filteredConti = pianoConti
    .filter((c) => {
      if (c.livello < 3) return false
      if (!contoSearch) return true
      const s = contoSearch.toLowerCase().trim()
      if ((c.descrizione || '').toLowerCase().includes(s)) return true
      const codeNorm = (c.codice || '').replace(/\s+/g, '')
      const searchNorm = s.replace(/[.\s]+/g, '')
      return codeNorm.startsWith(searchNorm)
    })
    .slice(0, 80)

  const persistRegistration = async ({ confirmRegistration = false } = {}) => {
    if (!doc) return
    setSaving(true)
    try {
      const d0 = parseDati(doc.dati_estratti)
      let nextDati = {
        ...d0,
        ...(dataReg ? { data_registrazione: dataReg } : {}),
        ...(tipoPag ? { tipo_pagamento: tipoPag } : {}),
      }

      if (isProfessionalDoc && parcellaDecision && parcellaFinalValues) {
        const availableColumns = buildAvailableColumns(percipienti)
        const percipienteCandidate = buildPercipienteFromConfirmation({
          societaId: doc.societa_id,
          doc,
          matchedPercipiente: selectedPercipiente,
          finalValues: parcellaFinalValues,
        })
        const matchedByCandidate = findExistingPercipienteByCandidate(percipienti, percipienteCandidate)
        let persistedPercipienteId = selectedPercipiente?.id || matchedByCandidate?.id || ''

        const currentDecision = possiblePercipienteDecisionRef.current || possiblePercipienteDecision || null
        const needsOperatorConfirmForPercipiente =
          percipienteIntake?.outcome === 'possible_percipiente' &&
          !persistedPercipienteId &&
          !currentDecision

        if (needsOperatorConfirmForPercipiente) {
          pendingPersistArgsRef.current = { confirmRegistration }
          setPossiblePercipienteModalOpen(true)
          setSaving(false)
          return
        }

        const intakeDecision = currentDecision
        const classification = percipienteIntake?.outcome || null
        const shouldCreatePercipiente =
          !persistedPercipienteId &&
          (classification === 'confirmed_percipiente' || intakeDecision === 'create')

        if (persistedPercipienteId) {
          const updates = mergeForUpdate(
            matchedByCandidate || selectedPercipiente || {},
            percipienteCandidate,
            availableColumns
          )
          if (Object.keys(updates).length > 0) {
            const { error } = await contabilitaRepo.updatePercipiente(persistedPercipienteId, updates)
            if (error) throw error
          }
        } else if (shouldCreatePercipiente) {
          const insertPayload = buildInsertRecord(doc.societa_id, percipienteCandidate, availableColumns)
          const { data, error } = await sb.from('percipienti').insert([insertPayload]).select('id').single()
          if (error) throw error
          persistedPercipienteId = data?.id || ''
        }

        const finalValuesWithPercipiente = {
          ...parcellaFinalValues,
          percipienteId: persistedPercipienteId || parcellaFinalValues.percipienteId || '',
        }
        const audit = buildParcellaAudit({
          proposal: parcellaDecision.proposal,
          finalValues: finalValuesWithPercipiente,
          userLabel: 'Operatore',
        })
        const auditRecord = buildParcellaAuditRecord({
          proposal: parcellaDecision.proposal,
          finalValues: finalValuesWithPercipiente,
          warnings: parcellaWarnings,
          userLabel: 'Operatore',
          existingAuditId: d0?.parcella_audit?.audit_id || null,
        })

        const percipienteReviewAudit =
          classification === 'possible_percipiente'
            ? buildPercipienteReviewAudit({ decision: intakeDecision || 'pending', d0, classification })
            : null
        nextDati = {
          ...nextDati,
          parcella_confirmation: {
            status: confirmRegistration ? 'confirmed' : 'draft',
            saved_at: new Date().toISOString(),
            existing_percipiente: Boolean(selectedPercipiente?.id || matchedByCandidate?.id),
            proposal: parcellaDecision.proposal,
            finalValues: finalValuesWithPercipiente,
            warnings: parcellaWarnings,
            audit,
          },
          parcella_audit: auditRecord,
          ...(percipienteReviewAudit ? { percipiente_review_audit: percipienteReviewAudit } : {}),
        }

        // reset decision after a successful write path
        if (currentDecision) {
          setPossiblePercipienteDecision(null)
          possiblePercipienteDecisionRef.current = null
        }
      }

      const now = new Date().toISOString()
      if (parcellaConfirmationOverride != null) {
        nextDati.parcella_confirmation = parcellaConfirmationOverride
      }
      if (operatorClarifications.length > 0) {
        nextDati.operator_clarifications = operatorClarifications
      }
      const updatePayload = {
        conto_id: contoId || null,
        causale_iva: causaleIva || null,
        dati_estratti: nextDati,
      }
      if (confirmRegistration) {
        updatePayload.validation_status = 'confirmed'
        updatePayload.validated_at = now
      }

      await sb
        .from('documenti_contabilita')
        .update(updatePayload)
        .eq('id', doc.id)

      const prevConto = String(doc.conto_id ?? '')
      const nextConto = String(contoId ?? '')
      if (prevConto !== nextConto && nextConto !== '') {
        setLearningRuleModal({ documentId: doc.id, contoId: contoId || null })
      }

      await onSave?.({
        id: doc.id,
        ...updatePayload,
      })

      if (confirmRegistration) onClose?.()
    } finally {
      setSaving(false)
    }
  }

  const handleSave = async () => persistRegistration()
  const handleConfirmRegistration = async () => persistRegistration({ confirmRegistration: true })

  const handlePercipienteChange = (value) => {
    const nextPercipiente = percipienti.find((row) => String(row.id) === String(value || '')) || null
    const nextDecision = buildParcellaDecision({ percipiente: nextPercipiente, documentRow: effectiveDocForParcella, draft: {} })
    setParcellaForm((prev) => ({
      ...(prev || {}),
      percipienteId: value || '',
      causaleReddituale: nextDecision.proposal.causaleReddituale,
      cassaFlag: nextDecision.proposal.cassaFlag,
      cassaPercent: nextDecision.proposal.cassaPercent,
      inpsFlag: nextDecision.proposal.inpsFlag,
      enasarcoFlag: nextDecision.proposal.enasarcoFlag,
      compensoLordo: nextDecision.proposal.imponibileCompenso,
      quotaNonSoggetta: nextDecision.proposal.quotaNonSoggetta,
      codiceSommeNonSoggette: nextDecision.proposal.codiceSommeNonSoggette,
      withholdingRate: nextDecision.proposal.withholdingRate,
      withholdingAmount: nextDecision.proposal.withholdingAmount,
      registrationCausale: nextDecision.proposal.registrationCausale,
      paymentCausale: nextDecision.proposal.paymentCausale,
      downstream: nextDecision.proposal.downstream,
    }))
  }

  const reliability = useMemo(() => evaluateDraftReliability({ doc }), [doc])
  const operatorAssistItems = useMemo(
    () =>
      buildOperatorAssistItems({
        doc,
        form: { conto_id: contoId, causale_iva_id: causaleIva, operator_clarifications: operatorClarifications },
        reliability,
        contoSuggestions,
        historicalContoSuggestions,
        causaliIva,
        includeDocumentType: false,
        includeAccountMapping: true,
        includeVatCausale: true,
        includeParcellaConfirmation: parcellaAssistRaw && !isProfessionalDoc,
      }),
    [doc, contoId, causaleIva, operatorClarifications, reliability, contoSuggestions, historicalContoSuggestions, causaliIva, parcellaAssistRaw, isProfessionalDoc]
  )
  const insightRows = useMemo(() => {
    if (!Array.isArray(ivaInsights)) return []
    const seen = new Set()
    const out = []
    for (const ins of ivaInsights) {
      const key = ins.fingerprint || ins.titolo || ins.descrizione
      if (!key || seen.has(key)) continue
      seen.add(key)
      out.push(ins)
    }
    return out
  }, [ivaInsights])
  const insightRowsLimited = useMemo(() => insightRows.slice(0, 3), [insightRows])
  const insightExtraCount = insightRows.length > insightRowsLimited.length ? (insightRows.length - insightRowsLimited.length) : 0
  const learnFq = learningFrequenzaFromMeta(entryMeta)
  const showLearningInsight = isAiLearningSource(entryMeta)

  const hl = copilotHighlight && typeof copilotHighlight === 'object' ? copilotHighlight : null
  const contoCodHl =
    hl?.contoCodes?.length > 0 &&
    selectedConto &&
    hl.contoCodes.some((c) => normContoCode(c) === normContoCode(selectedConto.codice))

  const blockStyle = {
    background: 'var(--s2)',
    borderRadius: 10,
    padding: '.75rem',
    marginBottom: '.7rem',
  }
  const blockTitleStyle = {
    fontSize: '.72rem',
    textTransform: 'uppercase',
    letterSpacing: '.06em',
    color: 'var(--mu)',
    marginBottom: '.55rem',
    fontWeight: 700,
  }
  const changedPillStyle = {
    display: 'inline-flex',
    alignItems: 'center',
    marginLeft: '.35rem',
    padding: '.08rem .35rem',
    borderRadius: 999,
    fontSize: '.62rem',
    fontWeight: 700,
    background: 'rgba(212,175,55,.12)',
    color: 'var(--gold)',
    border: '1px solid rgba(212,175,55,.24)',
  }
  const isChangedFromProposal = useCallback(
    (key, transform = (value) => value) => {
      if (!parcellaDecision || !parcellaFinalValues) return false
      return transform(parcellaDecision.proposal?.[key]) !== transform(parcellaFinalValues?.[key])
    },
    [parcellaDecision, parcellaFinalValues]
  )

  const parcellaSignals = useMemo(() => extractParcellaInvoiceSignals(effectiveDocForParcella), [effectiveDocForParcella])
  const showBorderlineParcellaWarning = useMemo(() => {
    if (!doc || isProfessionalDoc) return false
    if (!parcellaSignals) return false
    const strong =
      parcellaSignals.hasExplicitWithholding ||
      parcellaSignals.hasCassa ||
      parcellaSignals.hasInps ||
      parcellaSignals.hasEnasarco ||
      parcellaSignals.isDirittiAutore ||
      parcellaSignals.isOccasionale ||
      parcellaSignals.hasParcellaWord
    if (strong) return false
    return Boolean(parcellaSignals.weakProfessionalWording || parcellaSignals.isArt15)
  }, [doc, isProfessionalDoc, parcellaSignals])

  const resolveOperatorAssist = (item, option, manualText = '', context = {}) => {
    if (!item) return
    if (item.type === 'uncertain_account_mapping') {
      if (option?.patch && Object.prototype.hasOwnProperty.call(option.patch, 'conto_id')) {
        setContoId(option?.patch?.conto_id || '')
      }
      if (option?.patch && Object.prototype.hasOwnProperty.call(option.patch, 'conto_search')) {
        setContoSearch(option?.patch?.conto_search || '')
      } else if (manualText) {
        setContoSearch(manualText)
      }
    }
    if (item.type === 'uncertain_vat_causale') {
      if (option?.patch && Object.prototype.hasOwnProperty.call(option.patch, 'causale_iva_id')) {
        setCausaleIva(option?.patch?.causale_iva_id || '')
      }
    }
    if (item.type === 'uncertain_parcella_confirmation' && option?.patch && Object.prototype.hasOwnProperty.call(option.patch, 'parcella_confirmation')) {
      setParcellaConfirmationOverride(Boolean(option?.patch?.parcella_confirmation))
    }
    setOperatorClarifications((prev) => appendOperatorClarification(prev, item, option, manualText, {
      issue_type: item.type,
      shown_options: item.options,
      selected_answer: option?.label || manualText || 'Manuale',
      rerun_result: context.rerun_result || 'continue',
      engine_source: engineSource,
    }))
    setClarificationModalItem(null)
  }

  if (!doc) {
    return (
      <div className="split-pane" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="split-pane-header">
          <span style={{ fontWeight: 600 }}>Scrittura</span>
        </div>
        <div className="split-pane-content" style={{ color: 'var(--mu)' }}>
          Seleziona un documento dalla lista.
        </div>
      </div>
    )
  }

  return (
    <div className="split-pane" style={{ minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="split-pane-header" style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', minWidth: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '.85rem' }}>
            {isProfessionalDoc ? 'Conferma parcella' : 'Registrazione'}
          </span>
          <span className={'bdg status-' + doc.validation_status}>
            {doc.validation_status === 'pending' ? 'In attesa' : doc.validation_status === 'confirmed' ? 'Confermato' : 'Errore'}
          </span>
          {isProfessionalDoc && parcellaForm?.savedStatus === 'draft' && <span className="bdg bdg-gray">Bozza</span>}
          {isProfessionalDoc && parcellaAuditPreview?.status && (
            <button
              type="button"
              className={'bdg ' + (parcellaAuditPreview.status === 'Variato' ? 'bdg-gold' : 'bdg-green')}
              onClick={() => setShowParcellaAudit((v) => !v)}
              style={{ border: 'none', cursor: 'pointer' }}
              title="Apri differenze tra proposta FiscoSim e conferma operatore"
            >
              {parcellaAuditPreview.status}
            </button>
          )}
        </div>
        {isProfessionalDoc ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '.45rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button type="button" className="btn-sec" disabled={saving} onClick={handleSave}>
              {saving ? '...' : 'Salva bozza'}
            </button>
            <button type="button" className="btn-sec" disabled={saving} onClick={() => onClose?.()}>
              Annulla
            </button>
            <button type="button" className="btn" disabled={saving} onClick={handleConfirmRegistration}>
              {saving ? '...' : 'Conferma registrazione'}
            </button>
          </div>
        ) : null}
      </div>
      <div className="split-pane-content" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {showLearningInsight && (
          <div
            style={{
              marginBottom: '.55rem',
              padding: '.45rem .55rem',
              borderRadius: 8,
              fontSize: '.7rem',
              lineHeight: 1.35,
              border: '1px solid rgba(76, 175, 80, .45)',
              background: 'rgba(46, 125, 50, .12)',
              color: '#c8e6c9',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: '.15rem' }}>Learned from your past corrections</div>
            <div style={{ opacity: 0.95 }}>{learnFq != null ? `Used ${learnFq} times` : 'Based on your usage history'}</div>
          </div>
        )}
        {showBorderlineParcellaWarning && (
          <div
            style={{
              marginBottom: '.65rem',
              padding: '.55rem .65rem',
              borderRadius: 10,
              fontSize: '.75rem',
              lineHeight: 1.35,
              background: 'rgba(212,175,55,.08)',
              border: '1px solid rgba(212,175,55,.22)',
              color: 'var(--tx)',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: '.15rem' }}>Segnali parcella (deboli)</div>
            <div style={{ color: 'var(--mu)' }}>
              Il documento contiene indicatori compatibili con parcella/prestazione, ma senza evidenze fiscali forti (ritenuta/cassa). Manteniamo la registrazione standard.
            </div>
          </div>
        )}
        {isProfessionalDoc && showParcellaAudit && parcellaAuditPreview && (
          <div
            style={{
              marginBottom: '.65rem',
              padding: '.7rem .8rem',
              borderRadius: 10,
              background: 'var(--s2)',
              border: '1px solid var(--bd)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '.75rem', marginBottom: '.45rem' }}>
              <div>
                <div style={{ fontSize: '.74rem', fontWeight: 700 }}>Differenze proposta / conferma</div>
                <div style={{ fontSize: '.68rem', color: 'var(--mu)' }}>
                  {parcellaAuditPreview.changedFields.length
                    ? `${parcellaAuditPreview.changedFields.length} campi modificati · ${parcellaAuditPreview.user} · ${new Date(parcellaAuditPreview.timestamp).toLocaleString('it-IT')}`
                    : 'Nessuna modifica rispetto alla proposta FiscoSim.'}
                </div>
              </div>
              <button type="button" className="btn-sec btn-sm" onClick={() => setShowParcellaAudit(false)}>
                Chiudi
              </button>
            </div>
            {parcellaAuditPreview.diffRows.length > 0 ? (
              <div className="tbl-wrap">
                <table className="tbl" style={{ fontSize: '.72rem' }}>
                  <thead>
                    <tr>
                      <th>Campo</th>
                      <th>Proposta</th>
                      <th>Finale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parcellaAuditPreview.diffRows.map((row) => (
                      <tr key={row.label}>
                        <td>{row.label}</td>
                        <td>{String(row.proposta)}</td>
                        <td>{String(row.finale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ fontSize: '.75rem', color: 'var(--mu)' }}>Conferma pienamente allineata alla proposta FiscoSim.</div>
            )}
          </div>
        )}
        {autoValidateMode && (
          <div
            role="button"
            tabIndex={0}
            title={`${buildAutoValidateTooltip(entryMeta)}\n\nClic per fissare la spiegazione sotto l’elenco documenti.`}
            onClick={() => onTogglePinExplanation?.()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                onTogglePinExplanation?.()
              }
            }}
            style={{
              marginBottom: '.65rem',
              padding: '.45rem .6rem',
              borderRadius: 8,
              fontSize: '.72rem',
              cursor: onTogglePinExplanation ? 'pointer' : 'help',
              ...confidenceBadgeStyle(entryMeta?.ai_confidence),
            }}
          >
            <strong>Auto-validazione</strong>
            {entryMeta?.ai_confidence != null && Number.isFinite(Number(entryMeta.ai_confidence)) ? (
              <>
                {' '}
                · {Math.round(Number(entryMeta.ai_confidence))}% · {entryMeta.ai_source || '—'} · {entryMeta.ai_status || '—'}
              </>
            ) : (
              <span style={{ opacity: 0.85 }}> · nessun punteggio — usa &quot;Aggiorna punteggi&quot; o la pipeline</span>
            )}
          </div>
        )}
        <div style={{ background: 'var(--s2)', borderRadius: 8, padding: '.75rem', marginBottom: '.75rem', fontSize: '.78rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.35rem' }}>
            <div className={hl?.numeroDocumento ? 'copilot-highlight' : undefined} style={{ padding: 2, margin: -2, borderRadius: 6 }}>
              <span style={{ color: 'var(--mu)' }}>N°</span> <strong>{doc.numero_documento}</strong>
            </div>
            <div>
              <span style={{ color: 'var(--mu)' }}>Data doc.</span> <strong>{fmtDate(doc.data_documento)}</strong>
            </div>
            <div
              className={hl?.soggetto || hl?.piva ? 'copilot-highlight' : undefined}
              style={{ gridColumn: '1 / -1', padding: 2, margin: -2, borderRadius: 6 }}
            >
              <span style={{ color: 'var(--mu)' }}>Soggetto</span> <strong>{doc.soggetto_denominazione}</strong>
            </div>
            <div
              className={hl?.totale || hl?.imponibile || hl?.iva ? 'copilot-highlight' : undefined}
              style={{ padding: 2, margin: -2, borderRadius: 6 }}
            >
              <span style={{ color: 'var(--mu)' }}>Totale</span> <strong style={{ color: 'var(--gld2)' }}>{fmt(doc.totale)}</strong>
            </div>
          </div>
        </div>
        {reliability && (
          <div style={{ marginBottom: '.75rem', fontSize: '.72rem', color: 'var(--mu)' }}>
            Affidabilita bozza: <strong>{reliabilityTierLabel(reliability.tier)}</strong> · {reliability.score}%
            {reliability.reasons?.length > 0 && (
              <div style={{ marginTop: '.2rem', color: 'var(--mu)' }}>
                Motivi: {reliability.reasons.slice(0, 2).map((r) => r.message).join('; ')}
              </div>
            )}
          </div>
        )}
        <OperatorAssistPanel
          items={operatorAssistItems}
          onResolve={resolveOperatorAssist}
          onManualResolve={(item, value) => resolveOperatorAssist(item, { id: 'manual', label: value, patch: {} }, value)}
          onRequestClarification={setClarificationModalItem}
          title="Chiarimenti guidati"
        />
        <OperatorClarificationModal
          open={Boolean(clarificationModalItem)}
          item={clarificationModalItem}
          onClose={() => setClarificationModalItem(null)}
          engineSource={engineSource}
          subtitle={doc?.filename || doc?.numero_documento || 'Documento da validare'}
          onOpenPreview={() => setDocumentPreviewOpen(true)}
          onContinue={(item, option, manualText) => resolveOperatorAssist(item, option, manualText, { rerun_result: 'continue' })}
          onSkip={(item) => resolveOperatorAssist(item, { id: 'skip', label: 'Salta e gestisci manualmente', patch: {} }, '', { rerun_result: 'skip' })}
          onReviewLater={(item) => resolveOperatorAssist(item, { id: 'review_later', label: 'Rivedi dopo', patch: {} }, '', { rerun_result: 'review_later' })}
        />
        {(ivaInsightsLoading || insightRowsLimited.length > 0) && (
          <div style={{ marginBottom: '.75rem', display: 'grid', gap: '.4rem' }}>
            {ivaInsightsLoading && insightRowsLimited.length === 0 && (
              <div className="alert alert-info" style={{ margin: 0 }}>
                Analisi IVA in corso…
              </div>
            )}
            {insightRowsLimited.map((ins) => {
              const sev = String(ins.gravita || '').toLowerCase()
              const tipo = String(ins.tipo || '').toLowerCase()
              const isWarn = tipo === 'iva_anomaly'
                ? (sev === 'critical' || sev === 'warning' || sev === 'high' || sev === 'medium')
                : false
              return (
                <div key={ins.fingerprint || ins.titolo} className={`alert ${isWarn ? 'alert-warn' : 'alert-info'}`} style={{ margin: 0 }}>
                  <strong>{ins.titolo || 'Segnale IVA'}</strong>
                  <div style={{ fontSize: '.72rem', marginTop: '.2rem' }}>{ins.descrizione}</div>
                </div>
              )
            })}
            {insightExtraCount > 0 && (
              <div className="alert alert-info" style={{ margin: 0 }}>
                Altri {insightExtraCount} segnali IVA disponibili.
              </div>
            )}
          </div>
        )}

        {isProfessionalDoc && parcellaDecision && parcellaForm && parcellaFinalValues ? (
          <>
            <div style={blockStyle}>
              <div style={blockTitleStyle}>Percipiente</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '.65rem' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Selezione percipiente</label>
                  <BaseCombobox
                    value={parcellaForm.percipienteId || ''}
                    onChange={(v) => handlePercipienteChange(v || '')}
                    options={[
                      { id: '', label: matchedPercipiente ? 'Usa percipiente rilevato' : 'Nuovo / non collegato' },
                      ...(percipienti || []).map((p) => ({
                        id: p.id,
                        label: `${p.ragione_sociale || `${p.cognome || ''} ${p.nome || ''}`.trim()} (${p.codice_fiscale || 'CF mancante'})`,
                      })),
                    ]}
                    getOptionId={(o) => o?.id}
                    getOptionLabel={(o) => o?.label}
                    placeholder="Seleziona..."
                    maxItems={140}
                    searchable
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'end', gap: '.4rem', flexWrap: 'wrap' }}>
                  <span className={'bdg ' + (selectedPercipiente?.id ? 'bdg-green' : 'bdg-gold')}>
                    {selectedPercipiente?.id ? 'Percipiente esistente' : 'Nuovo percipiente'}
                  </span>
                  {selectedPercipiente?.validation_state && selectedPercipiente.validation_state !== 'complete' && (
                    <span className="bdg bdg-gold">Dati incompleti</span>
                  )}
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Denominazione</div>
                  <strong>{selectedPercipiente?.ragione_sociale || `${selectedPercipiente?.cognome || ''} ${selectedPercipiente?.nome || ''}`.trim() || doc.soggetto_denominazione || 'Da verificare'}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Codice fiscale / Partita IVA</div>
                  <strong>{selectedPercipiente?.codice_fiscale || doc.soggetto_cf || 'CF mancante'}</strong>
                  <span style={{ color: 'var(--mu)' }}> · {selectedPercipiente?.partita_iva || doc.soggetto_piva || 'P.IVA n/d'}</span>
                </div>
              </div>
            </div>

            <div style={blockStyle}>
              <div style={blockTitleStyle}>Classificazione fiscale</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '.65rem' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Causale reddituale{isChangedFromProposal('causaleReddituale') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <BaseCombobox
                    value={parcellaForm.causaleReddituale || ''}
                    onChange={(v) => setParcellaForm((prev) => ({ ...prev, causaleReddituale: v || '' }))}
                    options={CAUSALI_REDDITUALI_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))}
                    getOptionId={(o) => o?.id}
                    getOptionLabel={(o) => o?.label}
                    searchable
                    maxItems={80}
                    placeholder="Seleziona..."
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.2rem' }}>Regime</div>
                  <strong>{parcellaDecision.signals.isForfettario || selectedPercipiente?.regime_fiscale === 'forfettario' ? 'Forfettario' : selectedPercipiente?.regime_fiscale || 'Ordinario'}</strong>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Cassa previdenza{isChangedFromProposal('cassaPercent', (v) => `${Boolean(parcellaForm?.cassaFlag)}-${v}`) ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <div style={{ display: 'flex', gap: '.4rem', alignItems: 'center' }}>
                    <label className={'erp-inline-toggle' + (parcellaForm.cassaFlag ? ' active' : '')} style={{ margin: 0 }}>
                      <input type="checkbox" checked={Boolean(parcellaForm.cassaFlag)} onChange={(e) => setParcellaForm((prev) => ({ ...prev, cassaFlag: e.target.checked }))} />
                      <span>Attiva</span>
                    </label>
                    <input style={{ maxWidth: 80 }} value={parcellaForm.cassaPercent ?? ''} onChange={(e) => setParcellaForm((prev) => ({ ...prev, cassaPercent: e.target.value }))} />
                  </div>
                </div>
                <div style={{ display: 'grid', gap: '.35rem', alignContent: 'start' }}>
                  <label className={'erp-inline-toggle' + (parcellaForm.inpsFlag ? ' active' : '')} style={{ margin: 0 }}>
                    <input type="checkbox" checked={Boolean(parcellaForm.inpsFlag)} onChange={(e) => setParcellaForm((prev) => ({ ...prev, inpsFlag: e.target.checked }))} />
                    <span>INPS</span>
                  </label>
                  <label className={'erp-inline-toggle' + (parcellaForm.enasarcoFlag ? ' active' : '')} style={{ margin: 0 }}>
                    <input type="checkbox" checked={Boolean(parcellaForm.enasarcoFlag)} onChange={(e) => setParcellaForm((prev) => ({ ...prev, enasarcoFlag: e.target.checked }))} />
                    <span>Enasarco</span>
                  </label>
                </div>
              </div>
            </div>

            <div style={blockStyle}>
              <div style={blockTitleStyle}>Importi fiscali</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '.65rem' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Compenso lordo{isChangedFromProposal('imponibileCompenso') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <input value={parcellaForm.compensoLordo ?? ''} onChange={(e) => setParcellaForm((prev) => ({ ...prev, compensoLordo: e.target.value }))} />
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Imponibile soggetto a ritenuta</div>
                  <strong>{fmt(Math.max(0, toDecimal(parcellaForm.compensoLordo, 0) - toDecimal(parcellaForm.quotaNonSoggetta, 0)))}</strong>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Quota non soggetta{isChangedFromProposal('quotaNonSoggetta') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <input value={parcellaForm.quotaNonSoggetta ?? ''} onChange={(e) => setParcellaForm((prev) => ({ ...prev, quotaNonSoggetta: e.target.value }))} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Codice somme non soggette{isChangedFromProposal('codiceSommeNonSoggette') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <BaseCombobox
                    value={parcellaForm.codiceSommeNonSoggette || ''}
                    onChange={(v) => setParcellaForm((prev) => ({ ...prev, codiceSommeNonSoggette: v || '' }))}
                    options={[{ id: '', label: 'Nessuno' }, ...SOMME_NON_SOGGETTE_OPTIONS.map((opt) => ({ id: opt.value, label: opt.label }))]}
                    getOptionId={(o) => o?.id}
                    getOptionLabel={(o) => o?.label}
                    searchable={false}
                    placeholder="Nessuno"
                    maxItems={80}
                  />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Ritenuta % {isChangedFromProposal('withholdingRate') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <input value={parcellaForm.withholdingRate ?? ''} onChange={(e) => setParcellaForm((prev) => ({ ...prev, withholdingRate: e.target.value }))} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Ritenuta importo{isChangedFromProposal('withholdingAmount') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <input value={parcellaForm.withholdingAmount ?? ''} onChange={(e) => setParcellaForm((prev) => ({ ...prev, withholdingAmount: e.target.value }))} />
                </div>
              </div>
            </div>

            <div style={blockStyle}>
              <div style={blockTitleStyle}>Regole speciali</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1.1fr 1fr 1fr', gap: '.65rem' }}>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Diritti d'autore</div>
                  <strong>{parcellaDecision.signals.isDirittiAutore ? parcellaDecision.proposal.deductionRule : 'Non rilevati'}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Art. 15</div>
                  <strong>{parcellaDecision.signals.isArt15 ? `Si · ${fmt(parcellaDecision.signals.art15Amount)}` : 'No'}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>CU / 770 / Scadenziario</div>
                  <strong>{parcellaFinalValues.downstream?.updateCu ? 'CU' : 'No CU'}</strong>
                  <span style={{ color: 'var(--mu)' }}> · {parcellaFinalValues.downstream?.update770 ? '770' : 'No 770'}</span>
                  <span style={{ color: 'var(--mu)' }}> · {parcellaFinalValues.downstream?.updateWithholdingSchedule ? 'Scadenz.' : 'No scadenz.'}</span>
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Pagamento fiscale</div>
                  <strong>{parcellaFinalValues.paymentCausale}</strong>
                </div>
              </div>
            </div>

            <div style={blockStyle}>
              <div style={blockTitleStyle}>Contabilità proposta</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1fr', gap: '.65rem' }}>
                <div
                  className={`fg${contoCodHl ? ' copilot-highlight' : ''}`}
                  style={{ marginBottom: 0, position: 'relative', padding: contoCodHl ? '.35rem' : undefined, borderRadius: 8 }}
                >
                  <label>Conto proposto</label>
                  <input
                    placeholder="Cerca conto…"
                    value={contoSearch || (selectedConto ? `${selectedConto.codice} — ${selectedConto.descrizione}` : '')}
                    onChange={(e) => {
                      setContoSearch(e.target.value)
                      setShowDd(true)
                      if (!e.target.value) setContoId('')
                    }}
                    onFocus={() => setShowDd(true)}
                    style={{ width: '100%' }}
                  />
                  {showDd && contoSearch && (
                    <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'var(--s1)', border: '1px solid var(--bd)', borderRadius: 8, maxHeight: 200, overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.25)' }}>
                      {filteredConti.length === 0 ? (
                        <div style={{ padding: '.5rem', fontSize: '.75rem', color: 'var(--mu)' }}>Nessun risultato</div>
                      ) : (
                        filteredConti.map((c) => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setContoId(c.id)
                              setContoSearch('')
                              setShowDd(false)
                            }}
                            style={{ padding: '.4rem .6rem', cursor: 'pointer', fontSize: '.75rem', borderBottom: '1px solid var(--s2)' }}
                          >
                            <code style={{ color: 'var(--gold)', fontSize: '.65rem' }}>{c.codice}</code> {c.descrizione}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Causale contabile{isChangedFromProposal('registrationCausale') ? <span style={changedPillStyle}>Variato</span> : null}</label>
                  <BaseCombobox
                    value={parcellaForm.registrationCausale || ''}
                    onChange={(v) => setParcellaForm((prev) => ({ ...prev, registrationCausale: v || '', paymentCausale: mapPaymentCausale(v || '') }))}
                    options={[
                      { id: 'RP', label: 'RP' },
                      { id: 'RPPC', label: 'RPPC' },
                      { id: 'FF', label: 'FF' },
                    ]}
                    getOptionId={(o) => o?.id}
                    getOptionLabel={(o) => o?.label}
                    searchable={false}
                    placeholder="Seleziona..."
                    maxItems={10}
                  />
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Debito professionista</div>
                  <strong>{fmt(proposedPayable)}</strong>
                </div>
                <div>
                  <div style={{ color: 'var(--mu)', fontSize: '.68rem', marginBottom: '.15rem' }}>Debito ritenuta</div>
                  <strong>{fmt(parcellaFinalValues.withholdingAmount)}</strong>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '.65rem', marginTop: '.65rem' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Data registrazione</label>
                  <input type="date" value={dataReg || ''} onChange={(e) => setDataReg(e.target.value)} />
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Tipo pagamento</label>
                  <input value={tipoPag} onChange={(e) => setTipoPag(e.target.value)} placeholder="es. MP05 Bonifico" />
                </div>
                <div className={`fg${hl?.causaleIva ? ' copilot-highlight' : ''}`} style={{ marginBottom: 0, padding: hl?.causaleIva ? '.35rem' : undefined, borderRadius: 8 }}>
                  <label>Causale IVA</label>
                  <BaseCombobox
                    value={causaleIva}
                    onChange={(v) => setCausaleIva(v || '')}
                    options={[
                      { id: '', label: 'Seleziona...' },
                      ...(causaliIva || []).map((c) => ({
                        id: c.id,
                        label: `${c.codice} - ${c.descrizione} (${c.aliquota}%)`,
                      })),
                    ]}
                    getOptionId={(o) => o?.id}
                    getOptionLabel={(o) => o?.label}
                    placeholder="Seleziona..."
                    searchable
                    maxItems={160}
                  />
                </div>
              </div>
            </div>

            {parcellaWarnings.length > 0 && (
              <div style={{ ...blockStyle, marginBottom: 0 }}>
                <div style={blockTitleStyle}>Warnings</div>
                <div style={{ display: 'grid', gap: '.4rem' }}>
                  {parcellaWarnings.map((warning) => (
                    <div key={warning} className="alert alert-warn" style={{ margin: 0, padding: '.5rem .65rem' }}>
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="fg" style={{ marginBottom: '.65rem' }}>
              <label>Data registrazione</label>
              <input type="date" value={dataReg || ''} onChange={(e) => setDataReg(e.target.value)} />
            </div>
            <div className="fg" style={{ marginBottom: '.65rem' }}>
              <label>Tipo pagamento</label>
              <input value={tipoPag} onChange={(e) => setTipoPag(e.target.value)} placeholder="es. MP05 Bonifico" />
            </div>

            <div
              className={`fg${contoCodHl ? ' copilot-highlight' : ''}`}
              style={{ marginBottom: '.65rem', position: 'relative', padding: contoCodHl ? '.35rem' : undefined, borderRadius: 8 }}
            >
              <label>Conto {doc.tipo_documento?.includes('attiva') ? 'Cliente' : 'Fornitore/Costo'}</label>
              <input
                placeholder="Cerca conto…"
                value={contoSearch || (selectedConto ? `${selectedConto.codice} — ${selectedConto.descrizione}` : '')}
                onChange={(e) => {
                  setContoSearch(e.target.value)
                  setShowDd(true)
                  if (!e.target.value) setContoId('')
                }}
                onFocus={() => setShowDd(true)}
                style={{ width: '100%' }}
              />
              {showDd && contoSearch && (
                <div
                  style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: 'var(--s1)',
                    border: '1px solid var(--bd)',
                    borderRadius: 8,
                    maxHeight: 200,
                    overflow: 'auto',
                    boxShadow: '0 8px 24px rgba(0,0,0,.25)',
                  }}
                >
                  {filteredConti.length === 0 ? (
                    <div style={{ padding: '.5rem', fontSize: '.75rem', color: 'var(--mu)' }}>Nessun risultato</div>
                  ) : (
                    filteredConti.map((c) => (
                      <div
                        key={c.id}
                        onClick={() => {
                          setContoId(c.id)
                          setContoSearch('')
                          setShowDd(false)
                        }}
                        style={{ padding: '.4rem .6rem', cursor: 'pointer', fontSize: '.75rem', borderBottom: '1px solid var(--s2)' }}
                      >
                        <code style={{ color: 'var(--gold)', fontSize: '.65rem' }}>{c.codice}</code> {c.descrizione}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div style={{ marginBottom: '.75rem' }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--mu)', marginBottom: '.25rem', letterSpacing: '.06em' }}>
                SUGGERIMENTI AI
              </div>
              {Array.isArray(contoSuggestions) && contoSuggestions.length > 0 ? (
                <div style={{ display: 'grid', gap: '.35rem' }}>
                  {contoSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="btn-sec"
                      onClick={() => {
                        setContoId(s.id)
                        setContoSearch(`${s.codice} — ${s.descrizione}`)
                        setShowDd(false)
                      }}
                      style={{ textAlign: 'left', padding: '.4rem .55rem', borderRadius: 8 }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 700 }}>
                          <code style={{ color: 'var(--gold)' }}>{s.codice}</code> {s.descrizione}
                        </div>
                        <span style={{ fontSize: '.65rem', color: 'var(--mu)' }}>{s.score}%</span>
                      </div>
                      {Array.isArray(s.reasons) && s.reasons.length > 0 && (
                        <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.15rem' }}>
                          {s.reasons.join(' · ')}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.74rem', color: 'var(--mu)', padding: '.4rem .5rem', borderRadius: 8, border: '1px dashed var(--bd)' }}>
                  Nessun conto da suggerire con sufficiente confidenza.
                </div>
              )}
            </div>

            <div style={{ marginBottom: '.75rem' }}>
              <div style={{ fontSize: '.68rem', fontWeight: 700, color: '#34c27a', marginBottom: '.25rem', letterSpacing: '.06em' }}>
                STORICO CONFERMATO
              </div>
              {historicalContoLoading ? (
                <div style={{ fontSize: '.74rem', color: 'var(--mu)', padding: '.4rem .5rem', borderRadius: 8, border: '1px dashed var(--bd)' }}>
                  Cerco fatture confermate nello storico...
                </div>
              ) : Array.isArray(historicalContoSuggestions) && historicalContoSuggestions.length > 0 ? (
                <div style={{ display: 'grid', gap: '.35rem' }}>
                  {historicalContoSuggestions.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="btn-sec"
                      onClick={() => {
                        setContoId(s.id)
                        setContoSearch(`${s.codice} — ${s.descrizione}`)
                        setShowDd(false)
                      }}
                      style={{
                        textAlign: 'left',
                        width: '100%',
                        background: 'rgba(52,194,122,.08)',
                        border: '1px solid rgba(52,194,122,.25)',
                        color: 'var(--tx)',
                        borderRadius: 8,
                        padding: '.45rem .55rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '.5rem', alignItems: 'baseline' }}>
                        <div style={{ fontWeight: 700 }}>
                          <code style={{ color: '#34c27a' }}>{s.codice}</code> {s.descrizione}
                        </div>
                        <span style={{ fontSize: '.65rem', color: 'var(--mu)' }}>{s.score}%</span>
                      </div>
                      <div style={{ fontSize: '.68rem', color: 'var(--mu)', marginTop: '.15rem' }}>
                        {Array.isArray(s.reasons) && s.reasons.length > 0 ? s.reasons.join(' · ') : 'Storico confermato'}
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: '.74rem', color: 'var(--mu)', padding: '.4rem .5rem', borderRadius: 8, border: '1px dashed var(--bd)' }}>
                  Nessun storico confermato utile trovato.
                </div>
              )}
            </div>

            <div className={`fg${hl?.causaleIva ? ' copilot-highlight' : ''}`} style={{ marginBottom: '.75rem', padding: hl?.causaleIva ? '.35rem' : undefined, borderRadius: 8 }}>
              <label>Causale IVA</label>
              <BaseCombobox
                value={causaleIva}
                onChange={(v) => setCausaleIva(v || '')}
                options={[
                  { id: '', label: 'Seleziona...' },
                  ...(causaliIva || []).map((c) => ({
                    id: c.id,
                    label: `${c.codice} - ${c.descrizione} (${c.aliquota}%)`,
                  })),
                ]}
                getOptionId={(o) => o?.id}
                getOptionLabel={(o) => o?.label}
                placeholder="Seleziona..."
                searchable
                maxItems={160}
              />
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.4rem' }}>
              <button type="button" className="btn" disabled={saving} onClick={handleSave}>
                {saving ? '…' : 'Salva bozza'}
              </button>
              <button type="button" className="btn-sec" onClick={() => onOpenGuidata?.(doc, listIds, idxInList)}>
                Scheda completa (guidata)
              </button>
            </div>
          </>
        )}
      </div>

      {learningRuleModal && (
        <div
          className="overlay"
          style={{ zIndex: 200 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !learningRuleBusy) setLearningRuleModal(null)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420, width: '90%' }}>
            <div className="modal-hdr">
              <div className="modal-title">Learning rule</div>
              <button type="button" className="modal-close" disabled={learningRuleBusy} onClick={() => setLearningRuleModal(null)}>
                ?
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '.85rem', lineHeight: 1.45 }}>
              <p style={{ margin: '0 0 1rem' }}>Apply this rule in future?</p>
              <p style={{ margin: '0 0 1rem', fontSize: '.78rem', color: 'var(--mu)' }}>
                Saving records this account choice for the supplier profile and improves future suggestions. Ignore leaves the document saved without updating learning.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'flex-end' }}>
                <button type="button" className="btn-sec" disabled={learningRuleBusy} onClick={() => setLearningRuleModal(null)}>
                  Ignore
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={learningRuleBusy}
                  onClick={async () => {
                    const m = learningRuleModal
                    if (!m?.documentId) return
                    setLearningRuleBusy(true)
                    try {
                      const res = await fetch('/api/accounting/feedback', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentId: m.documentId, finalContoId: m.contoId }),
                      })
                      if (!res.ok) {
                        const j = await res.json().catch(() => ({}))
                        console.warn('[DaValidare] learning feedback', j.error || res.statusText)
                      }
                      await onRefreshEntryMeta?.(m.documentId)
                    } catch (e) {
                      console.warn('[DaValidare] learning feedback', e)
                    } finally {
                      setLearningRuleBusy(false)
                      setLearningRuleModal(null)
                    }
                  }}
                >
                  {learningRuleBusy ? '…' : 'Save rule'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {possiblePercipienteModalOpen && percipienteIntakeSummary?.outcome === 'possible_percipiente' && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setPossiblePercipienteModalOpen(false)
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 720, width: '92%' }}>
            <div className="modal-hdr">
              <div className="modal-title">Possibile percipiente</div>
              <button type="button" className="modal-close" onClick={() => setPossiblePercipienteModalOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body" style={{ fontSize: '.85rem', lineHeight: 1.45 }}>
              <div className="alert alert-warn" style={{ margin: '0 0 .75rem', padding: '.55rem .65rem' }}>
                Individuata possibile parcella / possibile percipiente. Vuoi creare l’anagrafica Percipiente?
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '.65rem', marginBottom: '.75rem' }}>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Soggetto</label>
                  <div style={{ padding: '.55rem .65rem', borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--s1)' }}>
                    <div style={{ fontWeight: 700 }}>{percipienteIntakeSummary.denominazione}</div>
                    <div style={{ color: 'var(--mu)', fontSize: '.78rem', marginTop: 4 }}>
                      CF: <span style={{ color: 'var(--tx)' }}>{percipienteIntakeSummary.codiceFiscale || '—'}</span> · P.IVA:{' '}
                      <span style={{ color: 'var(--tx)' }}>{percipienteIntakeSummary.partitaIva || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="fg" style={{ marginBottom: 0 }}>
                  <label>Motivi</label>
                  <div style={{ padding: '.55rem .65rem', borderRadius: 10, border: '1px solid var(--bd)', background: 'var(--s1)' }}>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {(percipienteIntakeSummary.reasons || []).slice(0, 6).map((r) => (
                        <div key={r} style={{ color: 'var(--mu)', fontSize: '.78rem' }}>
                          • {r}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '.75rem', flexWrap: 'wrap' }}>
                <button type="button" className="btn-sec" onClick={() => onOpenDocumentPreview?.(doc)}>
                  Anteprima fattura
                </button>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '.5rem', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="btn-sec"
                    onClick={async () => {
                      possiblePercipienteDecisionRef.current = 'defer'
                      setPossiblePercipienteDecision('defer')
                      setPossiblePercipienteModalOpen(false)
                      pendingPersistArgsRef.current = null
                      await persistRegistration({ confirmRegistration: false })
                    }}
                  >
                    Rivedi dopo
                  </button>
                  <button
                    type="button"
                    className="btn-sec"
                    onClick={async () => {
                      possiblePercipienteDecisionRef.current = 'leave'
                      setPossiblePercipienteDecision('leave')
                      setPossiblePercipienteModalOpen(false)
                      const args = pendingPersistArgsRef.current || { confirmRegistration: false }
                      pendingPersistArgsRef.current = null
                      await persistRegistration(args)
                    }}
                  >
                    Lascia come fornitore
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      possiblePercipienteDecisionRef.current = 'create'
                      setPossiblePercipienteDecision('create')
                      setPossiblePercipienteModalOpen(false)
                      const args = pendingPersistArgsRef.current || { confirmRegistration: false }
                      pendingPersistArgsRef.current = null
                      await persistRegistration(args)
                    }}
                  >
                    Crea percipiente
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DaValidareSplitView({
  documenti,
  pianoConti,
  causaliIva,
  societaId,
  stats,
  onRefresh,
  onEdit,
  patchDocumento,
  confermaDoc,
  registraConfermati,
  registrazioneInCorso = false,
}) {
  const [filtroStato, setFiltroStato] = useState('tutti')
  const [filtroFornitore, setFiltroFornitore] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [focusedId, setFocusedId] = useState(null)
  const [selectedIds, setSelectedIds] = useState([])
  const lastAnchorRef = useRef(-1)

  const [bulkDataReg, setBulkDataReg] = useState('')
  const [bulkTipoPag, setBulkTipoPag] = useState('')
  const [bulkContoId, setBulkContoId] = useState('')
  const [bulkCausaleIva, setBulkCausaleIva] = useState('')
  const [bulkApprove, setBulkApprove] = useState(false)
  const [bulkRegister, setBulkRegister] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewRows, setPreviewRows] = useState([])
  const [bulkLoading, setBulkLoading] = useState(false)
  const [pendingFlags, setPendingFlags] = useState(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [documentPreviewOpen, setDocumentPreviewOpen] = useState(false)
  const [documentPreviewDoc, setDocumentPreviewDoc] = useState(null)

  const [autoValidateMode, setAutoValidateMode] = useState(false)
  const [entryMetaByDocId, setEntryMetaByDocId] = useState({})
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [pinnedExplanation, setPinnedExplanation] = useState(null)
  const [focusedOnlyEntryMeta, setFocusedOnlyEntryMeta] = useState(null)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotHighlights, setCopilotHighlights] = useState(null)
  const sendCopilotPromptRef = useRef(null)
  const [insightToPromptOnOpen, setInsightToPromptOnOpen] = useState(null)
  const requestAutoSelectHighRef = useRef(false)
  const [ivaInsightsByDocId, setIvaInsightsByDocId] = useState({})
  const [ivaInsightsLoading, setIvaInsightsLoading] = useState(false)

  const handleInsightFixNow = useCallback(
    (insight) => {
      const ref = insight?.entity_ref || {}
      const docId = ref.document_id
      if (docId) {
        const doc = documenti.find((d) => d.id === docId)
        const listIds = documenti.map((d) => d.id)
        const idx = listIds.indexOf(docId)
        if (doc && idx >= 0) {
          onEdit?.(doc, listIds, idx)
          return
        }
      }
      setInsightToPromptOnOpen(insight)
      setCopilotOpen(true)
    },
    [documenti, onEdit]
  )

  const openDocumentPreview = useCallback((doc) => {
    if (!doc) return
    setDocumentPreviewDoc(doc)
    setDocumentPreviewOpen(true)
  }, [])

  const resolveDocPublicUrl = useCallback((filePath) => {
    if (!filePath) return ''
    try {
      const { data } = contabilitaRepo.getDocumentoPublicUrl(filePath)
      return data?.publicUrl || ''
    } catch {
      return ''
    }
  }, [])

  const fetchXmlForPreview = useCallback(async (xmlFilename) => {
    if (!xmlFilename) return ''
    const { data } = await contabilitaRepo.getFatturaXmlByFilename(xmlFilename)
    return data?.[0]?.xml_content || ''
  }, [])

  useEffect(() => {
    if (!copilotOpen || !insightToPromptOnOpen) return
    const ins = insightToPromptOnOpen
    setInsightToPromptOnOpen(null)
    const text = buildCopilotFixPromptFromInsight(ins)
    if (sendCopilotPromptRef.current) {
      sendCopilotPromptRef.current(text)
      return
    }
    const t = window.setTimeout(() => sendCopilotPromptRef.current?.(text), 120)
    return () => clearTimeout(t)
  }, [copilotOpen, insightToPromptOnOpen])

  useEffect(() => {
    setCopilotHighlights(null)
  }, [focusedId])

  useEffect(() => {
    let alive = true
    if (!societaId) return () => { alive = false }
    setIvaInsightsLoading(true)
    loadIvaInsightsForSocieta(societaId)
      .then((res) => {
        if (!alive) return
        setIvaInsightsByDocId(res.byDocId || {})
      })
      .finally(() => {
        if (alive) setIvaInsightsLoading(false)
      })
    return () => { alive = false }
  }, [societaId])

  useEffect(() => {
    if (!autoValidateMode) setPinnedExplanation(null)
  }, [autoValidateMode])

  const togglePinExplanationForDoc = useCallback((docId, meta) => {
    const text = String(meta?.ai_explanation || '').trim() || buildAutoValidateTooltip(meta)
    setPinnedExplanation((p) => (p?.docId === docId ? null : { docId, text }))
  }, [])

  const filtered = useMemo(() => {
    return documenti.filter((d) => {
      if (filtroStato !== 'tutti' && d.validation_status !== filtroStato) return false
      if (filtroFornitore && d.soggetto_piva !== filtroFornitore) return false
      if (searchTerm) {
        const s = searchTerm.toLowerCase()
        if (
          !(d.soggetto_denominazione || '').toLowerCase().includes(s) &&
          !(d.numero_documento || '').toLowerCase().includes(s)
        )
          return false
      }
      return true
    })
  }, [documenti, filtroStato, filtroFornitore, searchTerm])

  const fornitori = useMemo(
    () => [...new Set((documenti || []).map((d) => d.soggetto_piva).filter(Boolean))],
    [documenti]
  )

  const listIds = useMemo(() => filtered.map((d) => d.id), [filtered])
  const filteredIdsKey = useMemo(() => filtered.map((d) => d.id).join(','), [filtered])

  const fornitoriOptions = useMemo(() => {
    const denomByPiva = new Map()
    ;(documenti || []).forEach((d) => {
      const piva = d?.soggetto_piva
      if (!piva) return
      if (!denomByPiva.has(piva) && d?.soggetto_denominazione) denomByPiva.set(piva, d.soggetto_denominazione)
    })
    return [
      { id: '', label: 'Tutti i soggetti' },
      ...(fornitori || []).map((piva) => ({
        id: piva,
        label: denomByPiva.get(piva) || piva,
      })),
    ]
  }, [fornitori, documenti])

  const handleSelectAllVisible = useCallback(() => {
    // Explicit: select only the currently visible (filtered) rows.
    setSelectedIds(listIds)
  }, [listIds])

  const loadAccountingEntryMeta = useCallback(async (docIds, opts = {}) => {
    const merge = opts.merge === true
    if (!docIds?.length) {
      if (!merge) setEntryMetaByDocId({})
      return
    }
    setEntriesLoading(true)
    let merged = {}
    try {
      const chunkSize = 60
      const all = []
      for (let i = 0; i < docIds.length; i += chunkSize) {
        const part = docIds.slice(i, i + chunkSize)
        const { data, error } = await sb
          .from('accounting_entries')
          .select('id, document_id, ai_confidence, ai_status, ai_source, ai_explanation, auto_validate_meta, created_at')
          .in('document_id', part)
        if (error) {
          console.warn('[DaValidare] accounting_entries', error.message)
          continue
        }
        all.push(...(data || []))
      }
      merged = latestEntryByDocumentId(all)
      if (merge) {
        setEntryMetaByDocId((prev) => ({ ...prev, ...merged }))
      } else {
        setEntryMetaByDocId(merged)
      }
    } finally {
      setEntriesLoading(false)
    }
    if (Object.keys(merged).length === 0 && requestAutoSelectHighRef.current && !merge) {
      requestAutoSelectHighRef.current = false
    }
  }, [])

  const fetchEntryMetaForSingleDoc = useCallback(async (docId) => {
    if (!docId) return null
    const { data, error } = await sb
      .from('accounting_entries')
      .select('id, document_id, ai_confidence, ai_status, ai_source, ai_explanation, auto_validate_meta, created_at')
      .eq('document_id', docId)
      .order('created_at', { ascending: false })
      .limit(8)
    if (error) {
      console.warn('[DaValidare] accounting_entries single', error.message)
      return null
    }
    const map = latestEntryByDocumentId(data || [])
    return map[docId] || null
  }, [])

  const refreshEntryMetaForDocument = useCallback(
    async (docId) => {
      if (!docId) return
      await loadAccountingEntryMeta([docId], { merge: true })
      const row = await fetchEntryMetaForSingleDoc(docId)
      setFocusedOnlyEntryMeta((prev) => {
        if (autoValidateMode) return null
        return row && String(row.document_id) === String(docId) ? row : prev
      })
    },
    [loadAccountingEntryMeta, fetchEntryMetaForSingleDoc, autoValidateMode]
  )

  useEffect(() => {
    let cancelled = false
    if (autoValidateMode) {
      setFocusedOnlyEntryMeta(null)
      return () => {
        cancelled = true
      }
    }
    if (!focusedId) {
      setFocusedOnlyEntryMeta(null)
      return () => {
        cancelled = true
      }
    }
    void fetchEntryMetaForSingleDoc(focusedId).then((row) => {
      if (!cancelled) setFocusedOnlyEntryMeta(row)
    })
    return () => {
      cancelled = true
    }
  }, [autoValidateMode, focusedId, fetchEntryMetaForSingleDoc])

  useEffect(() => {
    if (!autoValidateMode) {
      setEntryMetaByDocId({})
      return
    }
    const ids = filtered.map((d) => d.id)
    void loadAccountingEntryMeta(ids)
  }, [autoValidateMode, filteredIdsKey, loadAccountingEntryMeta])

  useEffect(() => {
    if (!autoValidateMode || !requestAutoSelectHighRef.current) return
    if (!Object.keys(entryMetaByDocId).length) return
    requestAutoSelectHighRef.current = false
    const high = filtered
      .filter((d) => {
        const c = entryMetaByDocId[d.id]?.ai_confidence
        return c != null && Number(c) > 90 && d.validation_status === 'pending'
      })
      .map((d) => d.id)
    if (high.length) setSelectedIds((prev) => [...new Set([...prev, ...high])])
  }, [autoValidateMode, entryMetaByDocId, filtered])

  const toggleAutoValidateMode = useCallback(() => {
    setAutoValidateMode((prev) => {
      const next = !prev
      if (next) requestAutoSelectHighRef.current = true
      else requestAutoSelectHighRef.current = false
      return next
    })
  }, [])

  const refreshAutoValidateScores = useCallback(async () => {
    const ids = filtered.map((d) => d.id)
    if (!ids.length) return
    setEntriesLoading(true)
    try {
      const res = await fetch('/api/accounting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'auto_validate', documentIds: ids }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) console.warn('[DaValidare] auto-validate API', j.error || res.statusText)
      await loadAccountingEntryMeta(ids)
    } catch (e) {
      console.warn('[DaValidare] refreshAutoValidateScores', e)
      await loadAccountingEntryMeta(ids)
    } finally {
      setEntriesLoading(false)
    }
  }, [filtered, loadAccountingEntryMeta])

  const getConfidence = useCallback(
    (docId) => {
      const row = entryMetaByDocId[docId]
      if (row?.ai_confidence == null) return null
      return Number(row.ai_confidence)
    },
    [entryMetaByDocId]
  )

  const approveDocumentsByIds = useCallback(
    async (ids) => {
      if (!ids?.length) return
      const now = new Date().toISOString()
      const { error } = await sb
        .from('documenti_contabilita')
        .update({ validation_status: 'confirmed', validated_at: now })
        .in('id', ids)
      if (error) {
        alert(error.message || String(error))
        return
      }
      ids.forEach((id) => patchDocumento?.(id, { validation_status: 'confirmed', validated_at: now }))
      void fetch('/api/accounting/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'feedback_batch', documentIds: ids }),
      }).catch(() => {})
      await onRefresh?.()
    },
    [onRefresh, patchDocumento]
  )

  const handleApproveAllHighConfidence = useCallback(() => {
    const ids = filtered
      .filter((d) => {
        if (d.validation_status !== 'pending') return false
        const c = getConfidence(d.id)
        return c != null && c > 90
      })
      .map((d) => d.id)
    if (!ids.length) {
      alert('Nessun documento in attesa con punteggio > 90%.')
      return
    }
    if (!confirm(`Confermare ${ids.length} documenti con punteggio > 90%?`)) return
    void approveDocumentsByIds(ids)
  }, [filtered, getConfidence, approveDocumentsByIds])

  const handleApproveAllFilteredPending = useCallback(() => {
    const ids = filtered.filter((d) => d.validation_status === 'pending').map((d) => d.id)
    if (!ids.length) {
      alert('Nessun documento in attesa nella lista filtrata.')
      return
    }
    if (!confirm(`Confermare ${ids.length} documenti in attesa?`)) return
    void approveDocumentsByIds(ids)
  }, [filtered, approveDocumentsByIds])

  const handleSelectLowConfidenceOnly = useCallback(() => {
    const ids = filtered
      .filter((d) => {
        if (d.validation_status !== 'pending') return false
        const c = getConfidence(d.id)
        return c == null || c < 70
      })
      .map((d) => d.id)
    setSelectedIds(ids)
    if (!ids.length) alert('Nessun documento in attesa con punteggio sotto 70% (o senza dato).')
  }, [filtered, getConfidence])

  useEffect(() => {
    if (!filtered.length) {
      setFocusedId(null)
      return
    }
    if (!focusedId || !filtered.some((d) => d.id === focusedId)) {
      setFocusedId(filtered[0].id)
    }
  }, [filtered, focusedId])

  const focusedDoc = useMemo(() => filtered.find((d) => d.id === focusedId) || null, [filtered, focusedId])
  useEffect(() => {
    if (!focusedDoc) setDetailPanelOpen(false)
  }, [focusedDoc])
  const copilotContextDoc = useMemo(() => focusedDoc || filtered[0] || null, [focusedDoc, filtered])
  const copilotDocumentIdForApi = copilotContextDoc?.id || null
  const focusedEntryMetaDisplay = useMemo(() => {
    if (!focusedDoc) return null
    return entryMetaByDocId[focusedDoc.id] ?? focusedOnlyEntryMeta
  }, [focusedDoc, entryMetaByDocId, focusedOnlyEntryMeta])
  const idxInList = focusedDoc ? listIds.indexOf(focusedDoc.id) : -1

  const toggleSelected = useCallback((id) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }, [])

  const selectAllFiltered = useCallback(() => {
    setSelectedIds((prev) => {
      const all = filtered.map((d) => d.id)
      const allSelected = all.length > 0 && all.every((id) => prev.includes(id))
      return allSelected ? prev.filter((id) => !all.includes(id)) : [...new Set([...prev, ...all])]
    })
  }, [filtered])

  const handleRowClick = useCallback(
    (e, d, index) => {
      if (e.target.closest('input[type="checkbox"]')) return
      const isMac = typeof navigator !== 'undefined' && navigator.platform?.toLowerCase().includes('mac')
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (e.shiftKey && lastAnchorRef.current >= 0) {
        const a = Math.min(lastAnchorRef.current, index)
        const b = Math.max(lastAnchorRef.current, index)
        const range = filtered.slice(a, b + 1).map((x) => x.id)
        setSelectedIds((prev) => [...new Set([...prev, ...range])])
      } else if (mod) {
        toggleSelected(d.id)
        lastAnchorRef.current = index
      } else {
        setFocusedId(d.id)
        setDetailPanelOpen(true)
        lastAnchorRef.current = index
      }
    },
    [filtered, toggleSelected]
  )

  const selectSameAnagrafica = useCallback(() => {
    if (!focusedDoc?.soggetto_piva) return
    const ids = filtered.filter((d) => d.soggetto_piva === focusedDoc.soggetto_piva).map((d) => d.id)
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }, [filtered, focusedDoc])

  const selectSameAiConto = useCallback(() => {
    const cid = focusedDoc?.conto_id
    if (!cid) {
      const ids = filtered.filter((d) => !d.conto_id).map((d) => d.id)
      setSelectedIds((prev) => [...new Set([...prev, ...ids])])
      return
    }
    const ids = filtered.filter((d) => d.conto_id === cid).map((d) => d.id)
    setSelectedIds((prev) => [...new Set([...prev, ...ids])])
  }, [filtered, focusedDoc])

  const buildBulkBody = useCallback(
    (preview, flags) => {
      const updates = {}
      if (bulkContoId) updates.conto_id = bulkContoId
      if (bulkDataReg) updates.data_registrazione = bulkDataReg
      if (bulkTipoPag) updates.tipo_pagamento = bulkTipoPag
      if (bulkCausaleIva) updates.causale_iva = bulkCausaleIva
      const reg = flags?.approveAndRegister ?? bulkRegister
      const appr = flags?.approve ?? bulkApprove
      return {
        societaId,
        documentIds: selectedIds,
        preview,
        updates,
        approve: appr || reg,
        approveAndRegister: reg,
      }
    },
    [societaId, selectedIds, bulkContoId, bulkDataReg, bulkTipoPag, bulkCausaleIva, bulkApprove, bulkRegister]
  )

  const runBulkPreview = async (flags) => {
    if (!selectedIds.length) {
      alert('Seleziona almeno un documento.')
      return
    }
    setBulkLoading(true)
    try {
      const res = await fetch('/prima-nota/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBulkBody(true, flags)),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setPreviewRows(j.preview || [])
      setPendingFlags(flags || null)
      setPreviewOpen(true)
    } catch (err) {
      alert(err?.message || String(err))
    } finally {
      setBulkLoading(false)
    }
  }

  const runBulkApply = async () => {
    setBulkLoading(true)
    try {
      const res = await fetch('/prima-nota/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildBulkBody(false, pendingFlags || undefined)),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(j.error || res.statusText)
      setPreviewOpen(false)
      setPendingFlags(null)
      setSelectedIds([])
      await onRefresh?.()
      const n = j.results?.filter((r) => r.ok).length
      alert(j.results ? `Operazione completata: ${n}/${j.results.length} documenti.` : 'Completato.')
    } catch (err) {
      alert(err?.message || String(err))
    } finally {
      setBulkLoading(false)
    }
  }

  const onSingleSave = async (partial) => {
    const nextPartial = { ...partial }
    delete nextPartial.id
    patchDocumento?.(partial.id, nextPartial)
  }

  const handleQuickConfirm = useCallback(
    (row) => {
      if (isProfessionalParcellaDocument(row)) {
        setFocusedId(row.id)
        setDetailPanelOpen(true)
        return
      }
      void confermaDoc?.(row.id)
    },
    [confermaDoc]
  )

  const allFilteredSelected = filtered.length > 0 && filtered.every((d) => selectedIds.includes(d.id))

  return (
    <div className="erp-view erp-table-dominant" style={{ flex: 1, minHeight: 0 }}>
      <div className="erp-filter-card erp-filter-card-compact">
        <div className="erp-filter-zones">
        <div className="erp-filter-zone erp-filter-zone-main">
          <div className="fg erp-search-field" style={{ flex: 1, minWidth: 280, marginBottom: 0 }}>
            <input placeholder="Cerca numero documento o soggetto" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
          <div className="fg" style={{ minWidth: 220, marginBottom: 0 }}>
            <BaseCombobox
              value={filtroFornitore}
              onChange={(v) => setFiltroFornitore(v || '')}
              options={fornitoriOptions}
              getOptionId={(o) => o?.id}
              getOptionLabel={(o) => o?.label}
              placeholder="Tutti i soggetti"
              maxItems={120}
              searchable
            />
          </div>
          <div className="cont-toolbar-summary">
            <span className="cont-toolbar-pill"><strong>{filtered.length}</strong> documenti</span>
            {selectedIds.length > 0 && <span className="cont-toolbar-pill"><strong>{selectedIds.length}</strong> selezionati</span>}
          </div>
        </div>

        <div className="erp-filter-zone erp-filter-zone-states-actions">
          <div className="erp-status-tabs erp-status-segmented">
            {[
              ['tutti', filtered.length, 'Tutti'],
              ['pending', stats.daValidare, 'In attesa'],
              ['confirmed', stats.confermati, 'Confermati'],
              ['error', stats.errori, 'Da rivedere'],
            ].map(([value, count, label]) => (
              <button
                type="button"
                key={value}
                className={'erp-status-tab' + (filtroStato === value ? ' active' : '')}
                onClick={() => setFiltroStato(value)}
              >
                <span>{label}</span>
                <span className="erp-status-count">{count}</span>
              </button>
            ))}
          </div>
          <div className="erp-toolbar-group erp-toolbar-group-actions erp-toolbar-group-actions-end">
            <button type="button" className="btn-sec btn-sm" onClick={selectSameAnagrafica}>Stessa anagrafica</button>
            <button type="button" className="btn-sec btn-sm" onClick={selectSameAiConto}>Stesso conto AI</button>
            {autoValidateMode && (
              <>
                <button type="button" className="btn-sec btn-sm" disabled={entriesLoading} onClick={() => void refreshAutoValidateScores()}>
                  {entriesLoading ? '...' : 'Aggiorna punteggi'}
                </button>
                <button type="button" className="btn-sec btn-sm" onClick={handleApproveAllHighConfidence}>Approva &gt;90%</button>
                <button type="button" className="btn-sec btn-sm" onClick={handleApproveAllFilteredPending}>Approva lista</button>
              </>
            )}
            <label className={'erp-inline-toggle' + (autoValidateMode ? ' active' : '')}>
              <input type="checkbox" checked={autoValidateMode} onChange={toggleAutoValidateMode} />
              <span>Auto Validate</span>
            </label>
            <button type="button" className={copilotOpen ? 'btn' : 'btn-sec'} onClick={() => setCopilotOpen((v) => !v)}>
              {copilotOpen ? 'Chiudi Copilot' : 'Copilot contabile'}
            </button>
          </div>
        </div>
        </div>
      </div>

      {selectedIds.length >= 1 && (
        <div className="erp-bulkbar">
          <div className="erp-bulkbar-group erp-bulkbar-group-select">
            <div className="erp-bulkbar-title">
              Selezione: <strong>{selectedIds.length}</strong>
            </div>
            <button type="button" className="btn-sec btn-sm" disabled={bulkLoading} onClick={handleSelectAllVisible}>
              Seleziona tutte
            </button>
            <button type="button" className="btn btn-sm" disabled={bulkLoading} onClick={() => setSelectedIds([])}>
              Deseleziona
            </button>
          </div>

          <div className="erp-bulkbar-group erp-bulkbar-group-overrides">
            <BaseInput
              type="date"
              value={bulkDataReg}
              onChange={(e) => setBulkDataReg(e.target.value)}
              className="erp-bulkbar-field erp-bulkbar-field-date"
              aria-label="Data registrazione (massivo)"
            />
            <BaseCombobox
              value={bulkContoId}
              onChange={(v) => setBulkContoId(v)}
              options={(pianoConti || []).filter((c) => c.livello >= 3).slice(0, 400)}
              getOptionId={(c) => c?.id}
              getOptionLabel={(c) => `${c?.codice || ''} - ${c?.descrizione || ''}`.trim()}
              placeholder="Conto (nessun cambio)"
              className="erp-bulkbar-field erp-bulkbar-field-wide"
              maxItems={220}
            />
            <BaseInput
              placeholder="Tipo pagamento"
              value={bulkTipoPag}
              onChange={(e) => setBulkTipoPag(e.target.value)}
              className="erp-bulkbar-field erp-bulkbar-field-tipo"
              aria-label="Tipo pagamento (massivo)"
            />
            <BaseCombobox
              value={bulkCausaleIva}
              onChange={(v) => setBulkCausaleIva(v)}
              options={causaliIva || []}
              getOptionId={(c) => c?.id}
              getOptionLabel={(c) => String(c?.codice || '').trim()}
              placeholder="Causale IVA (nessun cambio)"
              className="erp-bulkbar-field erp-bulkbar-field-iva"
              maxItems={120}
              searchable
            />
          </div>

          <div className="erp-bulkbar-group erp-bulkbar-group-flags">
            <label className={'erp-inline-toggle' + (bulkApprove ? ' active' : '')}>
              <input type="checkbox" checked={bulkApprove} onChange={(e) => setBulkApprove(e.target.checked)} />
              <span>Approva</span>
            </label>
            <label className={'erp-inline-toggle' + (bulkRegister ? ' active' : '')}>
              <input type="checkbox" checked={bulkRegister} onChange={(e) => setBulkRegister(e.target.checked)} />
              <span>Contabilizza</span>
            </label>
          </div>

          <div className="erp-bulkbar-group erp-bulkbar-group-actions">
            <button
              type="button"
              className="btn-sec btn-sm"
              disabled={bulkLoading}
              onClick={() => {
                setBulkApprove(true)
                setBulkRegister(false)
                void runBulkPreview({ approve: true, approveAndRegister: false })
              }}
            >
              Anteprima approva
            </button>
            <button
              type="button"
              className="btn-sec btn-sm"
              disabled={bulkLoading}
              onClick={() => {
                setBulkApprove(true)
                setBulkRegister(true)
                void runBulkPreview({ approve: true, approveAndRegister: true })
              }}
            >
              Anteprima approva + contabilizza
            </button>
            <button type="button" className="btn-sec btn-sm" disabled={bulkLoading} onClick={() => runBulkPreview()}>
              Anteprima (caselle)
            </button>
            <button
              type="button"
              className="btn-sec btn-sm"
              style={{ borderColor: 'rgba(224,82,82,.35)', color: '#ff8585' }}
              disabled={bulkLoading}
              onClick={async () => {
                if (!confirm(`Eliminare ${selectedIds.length} documenti selezionati?`)) return
                for (const id of selectedIds) {
                  await contabilitaRepo.deleteDocumentoContabilita(id)
                }
                setSelectedIds([])
                await onRefresh?.()
              }}
            >
              Elimina selezionati
            </button>
          </div>
        </div>
      )}

      {autoValidateMode && (
        <div className="erp-inline-note">
          Verde &gt;90%, giallo 70-90%, rosso &lt;70%. Passa sul punteggio o clicca per fissare il motivo sotto l'elenco.
          <button type="button" className="btn-sec btn-sm" onClick={handleSelectLowConfidenceOnly}>Solo bassa confidenza</button>
        </div>
      )}

      <div className="erp-dominant-main">
        <div className="erp-table-shell table-dominant erp-data-card" style={{ flex: 1, minHeight: 0 }}>
            <div className="erp-table-head">
              <div>
                <div className="erp-table-title">Documenti da validare</div>
                <div className="erp-table-meta">Elenco operativo per conferma, revisione e contabilizzazione.</div>
              </div>
              <div className="erp-table-tools">
                <span className="cont-toolbar-pill"><strong>{filtered.length}</strong> righe</span>
                {selectedIds.length > 0 && <span className="cont-toolbar-pill"><strong>{selectedIds.length}</strong> selezionati</span>}
              </div>
            </div>
            {autoValidateMode && pinnedExplanation && (
              <div style={{ padding: '.55rem .75rem', borderBottom: '1px solid var(--bd)', background: 'rgba(200,164,94,.06)', fontSize: '.72rem', lineHeight: 1.4 }}>
                <strong style={{ color: 'var(--gold)' }}>Motivo</strong> {pinnedExplanation.text}
              </div>
            )}
            <div className="erp-table-body">
              {filtered.length === 0 ? (
                <div className="empty" style={{ padding: '1rem' }}>
                  <div className="empty-t">Nessun documento</div>
                </div>
              ) : (
                <div className="tbl-wrap">
                  <table className="tbl" style={{ fontSize: '.74rem' }}>
                    <thead>
                      <tr>
                        <th style={{ width: 36 }}></th>
                        <th>Stato</th>
                        {autoValidateMode && <th style={{ width: 76 }}>AI %</th>}
                        <th>N° documento</th>
                        <th>Data</th>
                        <th>Soggetto</th>
                        <th style={{ textAlign: 'right' }}>Imponibile</th>
                        <th style={{ textAlign: 'right' }}>IVA</th>
                        <th style={{ textAlign: 'right' }}>Totale</th>
                        <th>Conto</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((d, i) => {
                        const rh = focusedId === d.id ? copilotHighlights : null
                        const pcRow = pianoConti.find((c) => c.id === d.conto_id)
                        const { imponibile, iva } = getDocImponibileIva(d)
                        const contoCellHl =
                          rh?.contoCodes?.length > 0 &&
                          pcRow &&
                          rh.contoCodes.some((c) => normContoCode(c) === normContoCode(pcRow.codice))
                        return (
                          <tr
                            key={d.id}
                            onClick={(e) => handleRowClick(e, d, i)}
                            className={[
                              'tbl-row-clickable',
                              focusedId === d.id ? ' is-focused' : '',
                              selectedIds.includes(d.id) ? ' is-selected' : '',
                            ].join(' ')}
                            style={{ cursor: 'pointer' }}
                          >
                            <td onClick={(e) => e.stopPropagation()}>
                              <input type="checkbox" checked={selectedIds.includes(d.id)} onChange={() => toggleSelected(d.id)} />
                            </td>
                            <td>
                              <span className={'bdg status-' + d.validation_status}>
                                {d.validation_status === 'pending' ? 'In attesa' : d.validation_status === 'confirmed' ? 'Confermato' : 'Errore'}
                              </span>
                            </td>
                            {autoValidateMode && (
                              <td onClick={(e) => e.stopPropagation()}>
                                {(() => {
                                  const meta = entryMetaByDocId[d.id]
                                  const c = meta?.ai_confidence
                                  const label = c != null && Number.isFinite(Number(c)) ? `${Math.round(Number(c))}%` : '—'
                                  const tip = `${buildAutoValidateTooltip(meta)}\n\nClic per fissare sotto l'elenco.`
                                  const learnRow = isAiLearningSource(meta)
                                  const learnFqRow = learningFrequenzaFromMeta(meta)
                                  return (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                      <span
                                        role="button"
                                        tabIndex={0}
                                        title={tip}
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          togglePinExplanationForDoc(d.id, meta)
                                        }}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault()
                                            e.stopPropagation()
                                            togglePinExplanationForDoc(d.id, meta)
                                          }
                                        }}
                                        style={{
                                          display: 'inline-block',
                                          minWidth: 40,
                                          textAlign: 'center',
                                          padding: '.12rem .35rem',
                                          borderRadius: 6,
                                          fontSize: '.68rem',
                                          fontWeight: 700,
                                          cursor: 'pointer',
                                          ...confidenceBadgeStyle(c),
                                        }}
                                      >
                                        {label}
                                      </span>
                                      {learnRow && (
                                        <span style={{ fontSize: '.58rem', color: 'var(--mu)', lineHeight: 1.15, textAlign: 'center', maxWidth: 72 }} title="Learned from your past corrections">
                                          {learnFqRow != null ? `Used ${learnFqRow}x` : 'Learning'}
                                        </span>
                                      )}
                                    </div>
                                  )
                                })()}
                              </td>
                            )}
                            <td className={rh?.numeroDocumento ? 'copilot-highlight' : undefined} style={{ fontWeight: 600, padding: rh?.numeroDocumento ? 6 : undefined }}>
                              {d.numero_documento || '—'}
                            </td>
                            <td>{fmtDate(d.data_documento)}</td>
                            <td className={rh?.soggetto || rh?.piva ? 'copilot-highlight' : undefined} style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', padding: rh?.soggetto || rh?.piva ? 6 : undefined }}>
                              {d.soggetto_denominazione}
                            </td>
                            <td className={(rh?.imponibile ? 'copilot-highlight ' : '') + 'tbl-num'} style={{ fontVariantNumeric: 'tabular-nums', padding: rh?.imponibile ? 6 : undefined }}>
                              {fmt(imponibile)}
                            </td>
                            <td className={(rh?.iva ? 'copilot-highlight ' : '') + 'tbl-num'} style={{ fontVariantNumeric: 'tabular-nums', padding: rh?.iva ? 6 : undefined }}>
                              {fmt(iva)}
                            </td>
                            <td className={(rh?.totale ? 'copilot-highlight ' : '') + 'tbl-num'} style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, padding: rh?.totale ? 6 : undefined }}>
                              {fmt(d.totale)}
                            </td>
                            <td className={contoCellHl ? 'copilot-highlight' : undefined} style={{ color: 'var(--mu)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', padding: contoCellHl ? 6 : undefined }}>
                              {pianoConti.find((c) => c.id === d.conto_id)?.descrizione || '—'}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {d.validation_status === 'pending' && (
                                <button type="button" className="btn-icon" title="Conferma" onClick={() => handleQuickConfirm(d)}>
                                  ✓
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
      </div>

      {detailPanelOpen && focusedDoc && (
        <div className="overlay" style={{ zIndex: 120 }} onMouseDown={(e) => {
          if (e.target === e.currentTarget) setDetailPanelOpen(false)
        }}>
          <div className="modal erp-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-hdr">
              <div className="modal-title">Documento selezionato</div>
              <div className="modal-sub">{focusedDoc.numero_documento || 'Documento'} · {focusedDoc.soggetto_denominazione || 'Soggetto'}</div>
              <button type="button" className="modal-close" onClick={() => setDetailPanelOpen(false)}>
                ×
              </button>
            </div>
            <div className="modal-body erp-detail-modal-body">
              <div className="erp-detail-rail-tabs">
                <button type="button" className="erp-inline-tab active" onClick={() => {}}>
                  Registrazione
                </button>
                <button type="button" className="erp-inline-tab" onClick={() => openDocumentPreview(focusedDoc)}>
                  Anteprima
                </button>
              </div>
              <div className="erp-detail-modal-content">
                <AccountingForm
                  doc={focusedDoc}
                  pianoConti={pianoConti}
                  causaliIva={causaliIva}
                  onSave={onSingleSave}
                  onClose={() => setDetailPanelOpen(false)}
                  onOpenGuidata={onEdit}
                  onOpenDocumentPreview={openDocumentPreview}
                  listIds={listIds}
                  idxInList={idxInList}
                  autoValidateMode={autoValidateMode}
                  entryMeta={focusedEntryMetaDisplay}
                  onRefreshEntryMeta={refreshEntryMetaForDocument}
                  copilotHighlight={copilotHighlights}
                  ivaInsights={focusedDoc ? (ivaInsightsByDocId[String(focusedDoc.id)] || []) : []}
                  ivaInsightsLoading={ivaInsightsLoading}
                  onTogglePinExplanation={
                    focusedDoc && autoValidateMode
                      ? () => togglePinExplanationForDoc(focusedDoc.id, focusedEntryMetaDisplay)
                      : null
                  }
                />
              </div>
            </div>
          </div>
        </div>
      )}

      <DocumentPreviewModal
        open={documentPreviewOpen}
        onClose={() => setDocumentPreviewOpen(false)}
        title="Anteprima documento"
        subtitle={
          documentPreviewDoc
            ? `${documentPreviewDoc.numero_documento || 'Documento'} · ${documentPreviewDoc.soggetto_denominazione || 'Soggetto'}`
            : ''
        }
        document={documentPreviewDoc}
        resolvePublicUrl={resolveDocPublicUrl}
        fetchXmlByFilename={fetchXmlForPreview}
        fallback={(() => {
          const d = documentPreviewDoc
          if (!d) return null
          const de = parseDati(d.dati_estratti)
          return {
            tipo_documento: d.tipo_documento,
            numero_documento: d.numero_documento,
            data_documento: d.data_documento,
            soggetto_denominazione: d.soggetto_denominazione,
            soggetto_piva: d.soggetto_piva,
            soggetto_cf: d.soggetto_cf,
            imponibile: d.imponibile,
            iva: d.iva,
            totale: d.totale,
            cedente_denom: de?.cedente_denom,
            cedente_piva: de?.cedente_piva,
            cedente_cf: de?.cedente_cf,
            cessionario_denom: de?.cessionario_denom,
            cessionario_piva: de?.cessionario_piva,
            cessionario_cf: de?.cessionario_cf,
          }
        })()}
      />

      {previewOpen && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) {
              setPreviewOpen(false)
              setPendingFlags(null)
            }
          }}
        >
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 900, width: '92%', maxHeight: '85vh' }}>
            <div className="modal-hdr">
              <div className="modal-title">Anteprima modifiche massive</div>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setPreviewOpen(false)
                  setPendingFlags(null)
                }}
              >
                ×
              </button>
            </div>
            <div className="modal-body" style={{ overflow: 'auto', maxHeight: '58vh' }}>
              <table className="tbl" style={{ fontSize: '.72rem' }}>
                <thead>
                  <tr>
                    <th>File</th>
                    <th>Prima</th>
                    <th>Dopo</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.filename}</td>
                      <td>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '.62rem' }}>
                          {JSON.stringify(row.before, null, 2)}
                        </pre>
                      </td>
                      <td>
                        <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '.62rem' }}>
                          {JSON.stringify(row.after, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-foot">
              <button
                type="button"
                className="btn-sec"
                onClick={() => {
                  setPreviewOpen(false)
                  setPendingFlags(null)
                }}
              >
                Annulla
              </button>
              <button type="button" className="btn" disabled={bulkLoading} onClick={runBulkApply}>
                {bulkLoading ? '…' : 'Applica'}
              </button>
            </div>
          </div>
        </div>
      )}

      {copilotOpen && (
        <ContabileCopilotPanel
          layout="sidebar"
          documentId={focusedDoc?.id}
          copilotDocumentId={copilotDocumentIdForApi}
          societaId={societaId}
          accountingEntryId={focusedEntryMetaDisplay?.id || null}
          contextDoc={copilotContextDoc}
          pianoConti={pianoConti}
          causaliIva={causaliIva}
          docLabel={
            copilotContextDoc
              ? `${copilotContextDoc.numero_documento || '—'} · ${String(copilotContextDoc.soggetto_denominazione || '').slice(0, 42)}`
              : ''
          }
          onClose={() => setCopilotOpen(false)}
          onRefreshAutoValidate={() => void refreshAutoValidateScores()}
          onOpenGuidata={() => focusedDoc && onEdit?.(focusedDoc, listIds, idxInList)}
          onRefreshEntryMeta={refreshEntryMetaForDocument}
          onHighlightsChange={setCopilotHighlights}
          onRegisterSendPrompt={(fn) => {
            sendCopilotPromptRef.current = fn
          }}
          onInsightFixNow={handleInsightFixNow}
        />
      )}
    </div>
  )
}


