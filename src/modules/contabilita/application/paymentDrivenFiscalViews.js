import { parseParcellaAuditNote } from './parcellaDecisionEngine.js'
import { readParcellaWorkflowState } from './parcellaWorkflowState.js'
import { getCausaleReddituale, getSommaNonSoggetta } from '../../../shared/constants/fiscalCatalog.js'

function parseJson(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function normalize(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, ' ')
}

function normalizeVat(value) {
  return String(value || '').trim().toUpperCase().replace(/\s+/g, '')
}

function toNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function buildPercipienteKey(record) {
  return normalize(record?.codice_fiscale) || normalizeVat(record?.partita_iva) || normalize(record?.ragione_sociale || `${record?.cognome || ''} ${record?.nome || ''}`.trim())
}

function getPercipienteDisplayName(record) {
  return record?.ragione_sociale || `${record?.cognome || ''} ${record?.nome || ''}`.trim() || record?.percipiente_denominazione || 'Percipiente non identificato'
}

function getPercipienteTipo(record) {
  return record?.tipo_percipiente || (record?.tipo_persona === 'giuridica' ? 'altro' : 'professionista') || 'professionista'
}

function getDueDate(paymentDate) {
  if (!paymentDate) return null
  const [year, month] = String(paymentDate).split('-').map(Number)
  if (!year || !month) return null
  return new Date(year, month, 16)
}

function getDuePeriodLabel(paymentDate) {
  const dueDate = getDueDate(paymentDate)
  if (!dueDate) return 'Periodo non definito'
  return dueDate.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
}

function getScheduleStatus(row) {
  if (row.f24Linked) return 'collegato_f24'
  const dueDate = getDueDate(row.paymentDate)
  if (!dueDate) return 'da_verificare'
  const now = new Date()
  if (dueDate < now) return 'scaduto'
  return 'da_versare'
}

function computeWarnings({ percipiente, linkedDocument, finalValues, row }) {
  const warnings = []
  if (!linkedDocument?.id) warnings.push('Pagamento senza parcella collegata.')
  if (!(percipiente?.codice_fiscale || row.percipienteCf || '').trim()) warnings.push('Codice fiscale percipiente mancante.')
  if (!finalValues.causaleReddituale) warnings.push('Causale reddituale mancante.')
  if (toNumber(finalValues.quotaNonSoggetta, 0) > 0 && !String(finalValues.codiceSommeNonSoggette || '').trim()) {
    warnings.push('Quota non soggetta presente senza codice dedicato.')
  }
  if ((row.withholdingApplied > 0 || finalValues.fiscalFlags?.soggettoRitenuta) && !toNumber(finalValues.withholdingRate, 0)) {
    warnings.push('Parcella con ritenuta ma aliquota non definita.')
  }
  if (!percipiente?.id) warnings.push('Percipiente non agganciato all anagrafica fiscale.')
  return warnings
}

function buildPercipientiIndex(percipienti) {
  const byId = new Map()
  const byKey = new Map()
  ;(percipienti || []).forEach((row) => {
    if (row?.id) byId.set(String(row.id), row)
    const key = buildPercipienteKey(row)
    if (key) byKey.set(key, row)
  })
  return { byId, byKey }
}

function matchPercipiente(paymentRow, linkedDocument, percipientiIndex) {
  const explicitId = paymentRow?.percipiente_id ? percipientiIndex.byId.get(String(paymentRow.percipiente_id)) : null
  if (explicitId) return explicitId

  const docData = parseJson(linkedDocument?.dati_estratti)
  const candidateKey =
    normalize(paymentRow?.percipiente_cf) ||
    normalizeVat(paymentRow?.percipiente_piva) ||
    normalize(paymentRow?.percipiente_denominazione) ||
    normalize(linkedDocument?.soggetto_cf) ||
    normalizeVat(linkedDocument?.soggetto_piva) ||
    normalize(linkedDocument?.soggetto_denominazione) ||
    normalize(docData?.supplier_cf) ||
    normalizeVat(docData?.supplier_piva) ||
    normalize(docData?.supplier_name)

  return candidateKey ? percipientiIndex.byKey.get(candidateKey) || null : null
}

export function collectPaymentDrivenFiscalRows({ percipienti = [], documenti = [], payments = [], year }) {
  const percipientiIndex = buildPercipientiIndex(percipienti)
  const documentMap = new Map((documenti || []).map((row) => [String(row.id), row]))

  return (payments || [])
    .filter((paymentRow) => {
      if (!year) return true
      return String(paymentRow?.data_pagamento || '').startsWith(String(year))
    })
    .map((paymentRow) => {
      const parsed = parseParcellaAuditNote(paymentRow?.note)
      const audit = parsed.audit || {}
      const linkedDocumentId = audit.documentId || paymentRow?.linked_document_id || null
      const linkedDocument = linkedDocumentId ? documentMap.get(String(linkedDocumentId)) || null : null
      const percipiente = matchPercipiente(paymentRow, linkedDocument, percipientiIndex)
      const workflow = readParcellaWorkflowState(linkedDocument)
      const datiEstratti = parseJson(linkedDocument?.dati_estratti)
      const confirmation = datiEstratti?.parcella_confirmation || {}
      const storedAudit = datiEstratti?.parcella_audit || {}
      const finalValues = confirmation?.finalValues || audit.finalValues || {}
      const proposal = confirmation?.proposal || audit.proposal || {}

      const registrationCausale = String(audit.registrationCausale || finalValues.registrationCausale || workflow?.registrationCausale || proposal.registrationCausale || '').trim().toUpperCase()
      const paymentCausale = String(audit.paymentCausale || finalValues.paymentCausale || workflow?.paymentCausale || proposal.paymentCausale || '').trim().toUpperCase()
      const nonSubjectCode = String(finalValues.codiceSommeNonSoggette || proposal.codiceSommeNonSoggette || '').trim()
      const causaleReddituale = String(paymentRow?.causale || finalValues.causaleReddituale || proposal.causaleReddituale || percipiente?.causale_prevalente || '').trim().toUpperCase()
      const causaleMeta = getCausaleReddituale(causaleReddituale)
      const nonSubjectMeta = getSommaNonSoggetta(nonSubjectCode)
      const paidCompensation = round2(toNumber(audit.taxableBasePaid, toNumber(paymentRow?.compenso_lordo, 0)))
      const withholdingApplied = round2(toNumber(audit.withholdingPaid, toNumber(paymentRow?.ritenuta, 0)))
      const accountingPaid = round2(toNumber(audit.accountingPaid, Math.max(0, toNumber(paymentRow?.compenso_netto, 0))))
      const isForfettario =
        registrationCausale === 'FF' ||
        paymentCausale === 'PF' ||
        nonSubjectCode === '24' ||
        workflow?.excludedFromCu770Schedule === true ||
        String(percipiente?.regime_fiscale || '').toLowerCase() === 'forfettario'

      const downstream = {
        updateCu: !isForfettario && Boolean(finalValues?.downstream?.updateCu ?? proposal?.downstream?.updateCu ?? percipiente?.soggetto_cu ?? true),
        update770: !isForfettario && Boolean(finalValues?.downstream?.update770 ?? proposal?.downstream?.update770 ?? percipiente?.soggetto_770 ?? true),
        updateWithholdingSchedule:
          !isForfettario &&
          Boolean(finalValues?.downstream?.updateWithholdingSchedule ?? proposal?.downstream?.updateWithholdingSchedule ?? withholdingApplied > 0),
      }

      const row = {
        id: paymentRow?.id,
        societaId: paymentRow?.societa_id || linkedDocument?.societa_id || percipiente?.societa_id || null,
        linkedDocumentId,
        linkedDocument,
        sourceParcella: linkedDocument?.numero_documento || paymentRow?.numero_documento || 'Parcella senza numero',
        paymentDate: paymentRow?.data_pagamento || null,
        paymentCausale,
        registrationCausale,
        paidCompensation,
        withholdingApplied,
        accountingPaid,
        nonSubjectAmount: round2(toNumber(finalValues.quotaNonSoggetta, proposal.quotaNonSoggetta)),
        nonSubjectCode,
        nonSubjectMeta,
        causaleReddituale,
        causaleMeta,
        percipiente,
        percipienteName: getPercipienteDisplayName(percipiente || paymentRow),
        percipienteCf: percipiente?.codice_fiscale || paymentRow?.percipiente_cf || linkedDocument?.soggetto_cf || '',
        percipientePiva: percipiente?.partita_iva || linkedDocument?.soggetto_piva || '',
        tipoPercipiente: getPercipienteTipo(percipiente || {}),
        regimeFiscale: percipiente?.regime_fiscale || 'ordinario',
        percipienteState: percipiente?.attivo === false ? 'inattivo' : percipiente?.validation_state || 'complete',
        downstream,
        isForfettario,
        duePeriod: getDuePeriodLabel(paymentRow?.data_pagamento),
        f24Linked: Boolean(paymentRow?.f24_id || audit?.f24Id || paymentRow?.protocollo_f24),
        f24Reference: paymentRow?.protocollo_f24 || audit?.f24Protocol || paymentRow?.f24_id || null,
        accountingState: workflow?.status || 'open',
        auditStatus: storedAudit?.status || audit?.audit?.status || 'Confermato',
        auditBadge: storedAudit?.status || audit?.audit?.status || 'Confermato',
        auditPayload: storedAudit?.audit_id ? storedAudit : audit,
        percipiente_denominazione: getPercipienteDisplayName(percipiente || paymentRow),
      }

      row.scheduleStatus = getScheduleStatus(row)
      row.warnings = computeWarnings({ percipiente, linkedDocument, finalValues, row })
      row.completenessState = row.warnings.length ? 'warning' : 'ok'
      return row
    })
}

export function buildCuRowsFromPayments(input) {
  const grouped = new Map()
  collectPaymentDrivenFiscalRows(input)
    .filter((row) => row.downstream.updateCu && !row.isForfettario)
    .forEach((row) => {
      const key = [row.percipienteCf || row.percipienteName, row.causaleReddituale, row.nonSubjectCode || ''].join('::')
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          societaId: row.societaId,
          percipiente: row.percipienteName,
          codiceFiscale: row.percipienteCf,
          partitaIva: row.percipientePiva,
          tipoPercipiente: row.tipoPercipiente,
          causaleReddituale: row.causaleReddituale,
          causaleLabel: row.causaleMeta?.title || row.causaleReddituale || 'Da definire',
          nonSubjectCode: row.nonSubjectCode,
          nonSubjectLabel: row.nonSubjectMeta?.title || 'Nessuno',
          compensi: 0,
          ritenute: 0,
          annoRilevanza: String(row.paymentDate || '').slice(0, 4),
          stato: 'validata',
          warnings: [],
          sources: [],
        })
      }
      const bucket = grouped.get(key)
      bucket.compensi = round2(bucket.compensi + row.paidCompensation)
      bucket.ritenute = round2(bucket.ritenute + row.withholdingApplied)
      bucket.sources.push(row)
      bucket.warnings.push(...row.warnings)
      if (row.warnings.length) bucket.stato = 'bozza'
    })

  return [...grouped.values()].map((row) => ({
    ...row,
    warnings: [...new Set(row.warnings)],
    warningCount: [...new Set(row.warnings)].length,
  }))
}

export function build770RowsFromPayments(input) {
  const grouped = new Map()
  collectPaymentDrivenFiscalRows(input)
    .filter((row) => row.downstream.update770 && !row.isForfettario)
    .forEach((row) => {
      const key = [row.percipienteCf || row.percipienteName, row.causaleReddituale].join('::')
      if (!grouped.has(key)) {
        grouped.set(key, {
          key,
          societaId: row.societaId,
          percipiente: row.percipienteName,
          codiceFiscale: row.percipienteCf,
          causaleReddituale: row.causaleReddituale,
          causaleLabel: row.causaleMeta?.title || row.causaleReddituale || 'Da definire',
          baseCompensi: 0,
          ritenuteMaturate: 0,
          stato: 'ok',
          warnings: [],
          reviewPoints: [],
          movimenti: [],
        })
      }
      const bucket = grouped.get(key)
      bucket.baseCompensi = round2(bucket.baseCompensi + row.paidCompensation)
      bucket.ritenuteMaturate = round2(bucket.ritenuteMaturate + row.withholdingApplied)
      bucket.movimenti.push(row)
      bucket.warnings.push(...row.warnings)
      if (row.warnings.length) bucket.reviewPoints.push(`Verificare ${row.sourceParcella}`)
      if (row.warnings.length) bucket.stato = 'warning'
    })

  return [...grouped.values()].map((row) => ({
    ...row,
    warnings: [...new Set(row.warnings)],
    reviewPoints: [...new Set(row.reviewPoints)],
  }))
}

export function buildWithholdingScheduleRows(input) {
  return collectPaymentDrivenFiscalRows(input)
    .filter((row) => row.downstream.updateWithholdingSchedule && !row.isForfettario && row.withholdingApplied > 0)
    .map((row) => ({
      key: `schedule-${row.id}`,
      societaId: row.societaId,
      percipiente: row.percipienteName,
      codiceFiscale: row.percipienteCf,
      sourceParcella: row.sourceParcella,
      paymentDate: row.paymentDate,
      maturedWithholding: row.withholdingApplied,
      paidCompensation: row.paidCompensation,
      duePeriod: row.duePeriod,
      paymentStatus: row.scheduleStatus,
      f24Linked: row.f24Linked,
      f24Reference: row.f24Reference,
      warnings: row.warnings,
      auditStatus: row.auditStatus,
      sourcePayment: row,
    }))
}
