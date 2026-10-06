import { calculateRegistrazioneTotals } from './calculateRegistrazioneTotals.js'
import { resolveRegistrazioneRowState } from '../../domain/registrazione/resolveRegistrazioneRowState.js'
import { validateRegistrazioneIvaDraft } from './validateRegistrazioneIvaDraft.js'
import { validateRegistrazionePartitarioDraft } from './validateRegistrazionePartitarioDraft.js'
import { validateRegistrazioneRitenutaDraft } from './validateRegistrazioneRitenutaDraft.js'
import { resolveContoHierarchyView } from '../../domain/piano_conti/resolveContoHierarchyView.js'
import { buildRegistrazioneManualeUiPolicy } from '../../domain/registrazione/buildRegistrazioneManualeUiPolicy.js'

const IMPLEMENTED_REQUIRED_FIELDS = new Set([
  'dataRegistrazione',
  'esercizioContabile',
  'causaleContabile',
  'dataDocumento',
  'numeroDocumento',
  'soggetto',
  'totaleDocumento',
])

function resolveRequiredFields(behavior = {}) {
  const required = Array.isArray(behavior?.requiredFields) ? behavior.requiredFields : []
  return Array.from(new Set(required.filter((field) => IMPLEMENTED_REQUIRED_FIELDS.has(field))))
}

export function validateRegistrazioneDraft(draft = {}, options = {}) {
  const header = draft?.header && typeof draft.header === 'object' ? draft.header : {}
  const rows = Array.isArray(draft?.rows) ? draft.rows : []
  const totals = draft?.totals && typeof draft.totals === 'object' ? draft.totals : calculateRegistrazioneTotals(rows)
  const pianoConti = Array.isArray(options?.pianoConti) ? options.pianoConti : []
  const behavior = options?.behavior && typeof options.behavior === 'object' ? options.behavior : options?.config && typeof options.config === 'object' ? options.config : options?.causaleConfig && typeof options.causaleConfig === 'object' ? options.causaleConfig : {}
  const documentData = draft?.documentData && typeof draft.documentData === 'object' ? draft.documentData : {}
  const ivaData = draft?.ivaData && typeof draft.ivaData === 'object' ? draft.ivaData : {}
  const partitarioData = draft?.partitarioData && typeof draft.partitarioData === 'object' ? draft.partitarioData : {}
  const ritenutaData = draft?.ritenutaData && typeof draft.ritenutaData === 'object' ? draft.ritenutaData : {}
  const blockers = []
  const warnings = []
  const info = []
  const rowIssues = []
  const clienteFornitoreId = String(header.clienteFornitoreId || header.cliente_fornitore_id || '').trim()

  if (!String(header.dataRegistrazione || '').trim()) blockers.push('data registrazione mancante')
  if (!String(header.esercizioContabile || '').trim()) blockers.push('esercizio contabile mancante')
  if (!String(header.causaleContabile?.id || header.causaleContabile?.codice || '').trim()) blockers.push('causale contabile mancante')
  if (rows.length < 2) blockers.push('servono almeno 2 righe')
  if (Array.isArray(behavior?.warnings)) warnings.push(...behavior.warnings)
  if (Array.isArray(behavior?.reasons)) info.push(...behavior.reasons)
  const soggettoText = String(header.soggetto || '').trim()
  if ((behavior?.showPartitario || behavior?.requiresSoggetto) && !clienteFornitoreId) {
    if (soggettoText) blockers.push('cliente / fornitore non selezionato')
    else blockers.push('cliente / fornitore mancante')
  }

  const manualUiPolicy = buildRegistrazioneManualeUiPolicy(behavior)
  const requiredFields = resolveRequiredFields(manualUiPolicy)
  const fieldLabels = {
    dataRegistrazione: 'data registrazione',
    esercizioContabile: 'esercizio contabile',
    causaleContabile: 'causale contabile',
    dataDocumento: 'data documento',
    numeroDocumento: 'numero documento',
    soggetto: 'soggetto',
    totaleDocumento: 'totale documento',
    clienteFornitoreId: 'cliente / fornitore',
  }

  requiredFields.forEach((field) => {
    const value =
      field === 'causaleContabile'
        ? header.causaleContabile
        : field === 'clienteFornitoreId'
          ? clienteFornitoreId
          : header[field]
    const isEmpty =
      field === 'causaleContabile'
        ? !String(value?.id || value?.codice || '').trim()
        : field === 'clienteFornitoreId'
          ? !String(value || '').trim()
        : !String(value || '').trim()
    if (isEmpty) blockers.push(`${fieldLabels[field] || field} mancante`)
  })

  if (behavior?.requiresDocumentDate && !String(header.dataDocumento || '').trim()) blockers.push('data documento mancante')
  if (behavior?.requiresDocumentNumber && !String(header.numeroDocumento || '').trim()) blockers.push('numero documento mancante')
  if (behavior?.requiresDocumentTotal && !String(header.totaleDocumento || '').trim()) blockers.push('totale documento mancante')
  if (behavior?.requiresSoggetto && !String(header.soggetto || '').trim()) blockers.push('soggetto mancante')

  const isDocumentoIva = Boolean(behavior?.showIvaPanel || behavior?.isDocumentoIva)
  if (isDocumentoIva) {
    if (!clienteFornitoreId) {
      blockers.push('soggetto mancante')
    }
    if (!String(header.dataDocumento || '').trim()) {
      blockers.push('data documento mancante')
    }
    if (!String(header.numeroDocumento || '').trim()) {
      blockers.push('numero documento mancante')
    }

    const ivaDraft = options?.ivaDraft || options?.ivaData || draft?.ivaData || ivaData || {}
    const ivaRows = Array.isArray(ivaDraft?.rows) ? ivaDraft.rows : []
    const hasValidIvaRow = ivaRows.some((row) => {
      const imp = Number(String(row?.imponibile || 0).replace(',', '.')) || 0
      const tax = Number(String(row?.imposta || row?.iva || 0).replace(',', '.')) || 0
      const cIva = String(row?.causaleIvaId || row?.causale_iva_id || '').trim()
      return imp > 0 || tax > 0 || (cIva && cIva.toLowerCase() !== 'da selezionare')
    })
    if (!hasValidIvaRow) {
      blockers.push('riga IVA mancante')
    }

    const hasVatDocumentImputationRow = rows.some((row) => {
      const tipo = String(row.tipo || row.tipoConto || row.tipo_conto || '').toLowerCase()
      const code = String(row.conto_codice || row.accountId || row.conto_id || '').trim().replace(/\s+/g, '')
      const desc = String(row.conto_descrizione || row.accountDescription || '').toLowerCase()
      
      // priority 1: metadata tipoConto / role
      if (tipo === 'costo' || tipo === 'ricavo' || tipo === 'conto_costo' || tipo === 'conto_ricavo' || tipo === 'conto_imputazione') {
        return true
      }
      if (tipo === 'cliente' || tipo === 'fornitore' || tipo === 'iva' || tipo === 'controparte') {
        return false
      }

      // priority 2: exclude IVA accounts
      const isIva = tipo === 'iva' ||
                    code.startsWith('22') ||
                    desc.includes('erario c/iva') ||
                    desc.includes('iva credito') ||
                    desc.includes('iva debito') ||
                    desc.includes('iva a credito') ||
                    desc.includes('iva a debito') ||
                    desc.includes('iva acquisti') ||
                    desc.includes('iva vendite')
      if (isIva) return false

      // priority 3: exclude customer/vendor / patrimoniale
      const isClientVendor = tipo === 'cliente' ||
                             tipo === 'fornitore' ||
                             tipo === 'controparte' ||
                             (clienteFornitoreId && (row.conto_id === clienteFornitoreId || row.accountId === clienteFornitoreId || row.contoId === clienteFornitoreId)) ||
                             (code.startsWith('4') && (
                               code.startsWith('4001') ||
                               code.startsWith('4501') ||
                               code.startsWith('4010') ||
                               code.startsWith('4510') ||
                               desc.includes('crediti v/') ||
                               desc.includes('debiti v/') ||
                               desc.includes('crediti verso') ||
                               desc.includes('debiti verso') ||
                               desc.includes('cliente') ||
                               desc.includes('fornitore')
                             ))
      if (isClientVendor) return false

      // priority 4: any valid row with non-zero amount
      const dare = Number(String(row.dare || 0).replace(',', '.')) || 0
      const avere = Number(String(row.avere || 0).replace(',', '.')) || 0
      const hasAmount = dare > 0 || avere > 0
      const hasAccount = Boolean(row.conto_id || row.accountId || row.conto_codice)

      return hasAccount && hasAmount
    })
    if (!hasVatDocumentImputationRow) {
      blockers.push('riga di imputazione documento IVA mancante')
    }
  }
  if (behavior?.requiresRitenuteData) {
    const hasRitenuteAnchor = Boolean(String(header.soggetto || '').trim() || String(header.clienteFornitoreId || header.cliente_fornitore_id || '').trim())
    if (!hasRitenuteAnchor) warnings.push('dati ritenute da completare')
  }

  const dataRegStr = String(header.dataRegistrazione || '').trim()
  const dataDocStr = String(header.dataDocumento || '').trim()
  if (dataRegStr && dataDocStr) {
    const dReg = new Date(dataRegStr)
    const dDoc = new Date(dataDocStr)
    if (!isNaN(dReg.getTime()) && !isNaN(dDoc.getTime())) {
      const diffMs = Math.abs(dReg.getTime() - dDoc.getTime())
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24))
      if (diffDays > 30) {
        warnings.push('La data del documento differisce dalla data di registrazione di oltre 30 giorni.')
      }
    }
  }

  if (behavior?.requiresDocumentTotal && header.totaleDocumento) {
    const totDoc = Number(String(header.totaleDocumento || '').replace(',', '.')) || 0
    const totRows = totals.dare || 0
    if (Math.abs(totRows - totDoc) > 0.01) {
      warnings.push(`Il totale del documento (${totDoc.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €) non coincide con il totale delle righe registrate (${totRows.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €).`)
    }
  }

  const rowStates = rows.map((row, index) => {
    const state = resolveRegistrazioneRowState(row)
    const rowLabel = `riga ${index + 1}`
    const rawContoQuery = String(row?.contoQuery || '').trim()
    const hasContaText = Boolean(rawContoQuery)
    const hasPianoConti = pianoConti.length > 0
    const contoItem = hasPianoConti && state.hasConto ? pianoConti.find((item) => String(item?.id || '').trim() === state.contoId) || null : null
    const contoHierarchy = contoItem ? resolveContoHierarchyView(contoItem) : null
    const contoInCatalog = Boolean(contoItem)
    if (!state.hasConto) {
      blockers.push(hasPianoConti && hasContaText ? `${rowLabel}: conto inesistente, selezionare un conto oppure eliminare la riga` : `${rowLabel}: conto mancante`)
    }
    if (hasPianoConti && ((hasContaText && !state.hasConto) || (state.hasConto && !contoInCatalog))) {
      blockers.push(`${rowLabel}: conto inesistente, selezionare un conto oppure eliminare la riga`)
    }
    if (state.hasConto && contoHierarchy && !contoHierarchy.isSelectableForRegistrazione) {
      blockers.push(`${rowLabel}: per registrare serve un sottoconto`)
    }
    if (state.dare < 0 || state.avere < 0) blockers.push(`${rowLabel}: importi negativi non ammessi`)
    if (!state.hasMovement) blockers.push(`${rowLabel}: dare/avere entrambi a zero`)
    if (state.hasDare && state.hasAvere) blockers.push(`${rowLabel}: dare e avere entrambi valorizzati`)
    if (state.isIncomplete) rowIssues.push({ rowId: row?.id || `row-${index + 1}`, rowLabel, ...state })
    return state
  })

  const hasPositiveDebit = rowStates.some((row) => row.hasDare)
  const hasPositiveCredit = rowStates.some((row) => row.hasAvere)
  if (!hasPositiveDebit) blockers.push('manca almeno un dare')
  if (!hasPositiveCredit) blockers.push('manca almeno un avere')

  if (!totals.isBalanced) {
    const residualSide = totals.differenza > 0 ? 'Avere' : 'Dare'
    blockers.push(`scrittura non quadrata: sbilancio ${Math.abs(totals.differenza).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} in ${residualSide}`)
  }

  if (behavior?.showDocumentPanel) {
    if (!String(documentData.divisa || '').trim()) info.push('documento predisposto con divisa standard')
    if (!String(documentData.modalitaPagamento || '').trim()) info.push('modalita pagamento non definita')
  }

  const ivaValidation = validateRegistrazioneIvaDraft({ header, ivaData, behavior, documentData }, options)
  const partitarioValidation = validateRegistrazionePartitarioDraft({ header, partitarioData, behavior }, options)
  const ritenutaValidation = validateRegistrazioneRitenutaDraft(
    { header, ritenutaData, behavior, documentData, ivaData, partitarioData, percipienti: Array.isArray(options?.percipienti) ? options.percipienti : Array.isArray(draft?.percipienti) ? draft.percipienti : [] },
    { ...options, documentData, ivaData, partitarioData, percipienti: Array.isArray(options?.percipienti) ? options.percipienti : Array.isArray(draft?.percipienti) ? draft.percipienti : [] }
  )

  if (ivaValidation?.status === 'blocked') blockers.push(...(ivaValidation.blockers || []))
  if (ivaValidation?.status === 'warning') warnings.push(...(ivaValidation.warnings || []))
  if (ivaValidation?.info?.length) info.push(...ivaValidation.info)

  if (partitarioValidation?.status === 'blocked') blockers.push(...(partitarioValidation.blockers || []))
  if (partitarioValidation?.status === 'warning') warnings.push(...(partitarioValidation.warnings || []))
  if (partitarioValidation?.info?.length) info.push(...partitarioValidation.info)

  if (ritenutaValidation?.status === 'blocked') blockers.push(...(ritenutaValidation.blockers || []))
  if (ritenutaValidation?.status === 'warning') warnings.push(...(ritenutaValidation.warnings || []))
  if (ritenutaValidation?.info?.length) info.push(...ritenutaValidation.info)

  const status = blockers.length ? 'blocked' : warnings.length ? 'warning' : 'ok'
  return {
    status,
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    info: Array.from(new Set(info)),
    totals,
    isBalanced: totals.isBalanced,
    rowIssues,
  }
}
