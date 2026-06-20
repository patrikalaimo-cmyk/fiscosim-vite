import { createPrimaNotaCompleta } from '../../../../services/primaNotaService.js'
import { calculatePrimaNotaDraftTotals } from './canonical_mapper/calculatePrimaNotaDraftTotals.js'
import { normalizeText, round2 } from './canonical_mapper/utils.js'
import { mapRegistrazioneManualeToCanonical } from '../canonical/mappers/mapRegistrazioneManualeToCanonical.js'
import { buildCausaleContabilePolicy } from '../domain/causali/buildCausaleContabilePolicy.js'
import { handleIvaPerCassaRelease } from './registrazioneOperations/ivaPerCassaRelease.js'
import { buildRitenutaPersistencePayload } from './ritenute/buildRitenutaPersistencePayload.js'
import { buildRitenutaMaturazionePayload } from './ritenute/buildRitenutaMaturazionePayload.js'
import { buildVatRegisterEntriesFromCanonicalPayload } from './iva/buildVatRegisterEntriesFromCanonicalPayload.js'


function normalizeDbText(value) {
  const text = normalizeText(value)
  return text ? text : undefined
}

function normalizeDbInteger(value) {
  const text = normalizeText(value)
  if (!text) return undefined

  const parsed = Number.parseInt(text, 10)
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeDbAmount(value) {
  if (value === undefined || value === null || value === '') return 0
  const amount = round2(value)
  return Number.isFinite(amount) ? amount : 0
}

function setIfPresent(target, key, value) {
  if (value !== undefined && value !== null && !(typeof value === 'string' && value.trim() === '')) {
    target[key] = value
  }
}

export function mapPrimaNotaPayloadForDb(pnPayload = {}) {
  const source = pnPayload && typeof pnPayload === 'object' ? pnPayload : {}
  const mapped = {}

  setIfPresent(mapped, 'societa_id', normalizeDbText(source.societa_id ?? source.societaId))
  setIfPresent(mapped, 'numero_registrazione', normalizeDbText(source.numero_registrazione ?? source.numeroDocumento ?? source.numero_documento))
  setIfPresent(mapped, 'data_registrazione', normalizeDbText(source.data_registrazione ?? source.dataRegistrazione))
  setIfPresent(mapped, 'data_documento', normalizeDbText(source.data_documento ?? source.dataDocumento ?? source.data_registrazione ?? source.dataRegistrazione))
  setIfPresent(mapped, 'causale_id', normalizeDbText(source.causale_id ?? source.causaleId))
  setIfPresent(mapped, 'causale_codice', normalizeDbText(source.causale_codice ?? source.causaleCodice))
  setIfPresent(mapped, 'descrizione', normalizeDbText(source.descrizione ?? source.descrizioneGenerale))
  setIfPresent(mapped, 'cliente_fornitore_id', normalizeDbText(source.cliente_fornitore_id ?? source.clienteFornitoreId))
  setIfPresent(mapped, 'cliente_fornitore_nome', normalizeDbText(source.cliente_fornitore_nome ?? source.clienteFornitoreNome))
  mapped.totale_dare = normalizeDbAmount(source.totale_dare)
  mapped.totale_avere = normalizeDbAmount(source.totale_avere)
  setIfPresent(mapped, 'stato', normalizeDbText(source.stato))
  setIfPresent(mapped, 'fattura_xml_id', normalizeDbText(source.fattura_xml_id ?? source.fatturaXmlId))
  setIfPresent(mapped, 'documento_import_id', normalizeDbText(source.documento_import_id ?? source.documentoImportId))
  setIfPresent(mapped, 'created_by', normalizeDbText(source.created_by ?? source.createdBy))
  setIfPresent(mapped, 'created_at', normalizeDbText(source.created_at ?? source.createdAt))
  setIfPresent(mapped, 'updated_at', normalizeDbText(source.updated_at ?? source.updatedAt))
  setIfPresent(mapped, 'cliente_id', normalizeDbText(source.cliente_id ?? source.clienteId))
  setIfPresent(mapped, 'tenant_id', normalizeDbText(source.tenant_id ?? source.tenantId))
  setIfPresent(mapped, 'company_id', normalizeDbText(source.company_id ?? source.companyId))
  setIfPresent(mapped, 'owner_user_id', normalizeDbText(source.owner_user_id ?? source.ownerUserId))
  setIfPresent(mapped, 'visibility', normalizeDbText(source.visibility))
  setIfPresent(mapped, 'locked_by', normalizeDbText(source.locked_by ?? source.lockedBy))
  setIfPresent(mapped, 'locked_at', normalizeDbText(source.locked_at ?? source.lockedAt))
  setIfPresent(mapped, 'documento_contabilita_id', normalizeDbText(source.documento_contabilita_id ?? source.documentoContabilitaId))
  setIfPresent(mapped, 'esercizio', normalizeDbInteger(source.esercizio ?? source.esercizioContabile))

  return mapped
}

export function mapPrimaNotaRigaForDb(row = {}, index = 0, primaNotaId = null) {
  const source = row && typeof row === 'object' ? row : {}
  const mapped = {}

  if (primaNotaId !== undefined && primaNotaId !== null && String(primaNotaId).trim() !== '') {
    mapped.prima_nota_id = primaNotaId
  }

  const rigaNumero = normalizeDbInteger(source.riga_numero ?? source.rigaNumero)
  mapped.riga_numero = Number.isFinite(rigaNumero) ? rigaNumero : index + 1

  setIfPresent(mapped, 'conto_id', normalizeDbText(source.conto_id ?? source.contoId ?? source.accountId))
  setIfPresent(mapped, 'conto_codice', normalizeDbText(source.conto_codice ?? source.contoCodice))
  setIfPresent(mapped, 'conto_descrizione', normalizeDbText(source.conto_descrizione ?? source.contoDescrizione))
  setIfPresent(mapped, 'descrizione_riga', normalizeDbText(source.descrizione_riga ?? source.descrizioneRiga ?? source.descrizione))
  mapped.importo_dare = normalizeDbAmount(source.importo_dare ?? source.dare)
  mapped.importo_avere = normalizeDbAmount(source.importo_avere ?? source.avere)
  setIfPresent(mapped, 'causale_iva_id', normalizeDbText(source.causale_iva_id ?? source.causaleIvaId))
  setIfPresent(mapped, 'causale_iva_codice', normalizeDbText(source.causale_iva_codice ?? source.causaleIvaCodice ?? source.causaleIvaCode))
  mapped.imponibile = normalizeDbAmount(source.imponibile)
  mapped.iva = normalizeDbAmount(source.iva)
  setIfPresent(mapped, 'partita_aperta', source.partita_aperta ?? source.partitaAperta)
  setIfPresent(mapped, 'partita_id', normalizeDbText(source.partita_id ?? source.partitaId))
  setIfPresent(mapped, 'created_at', normalizeDbText(source.created_at ?? source.createdAt))
  setIfPresent(mapped, 'tenant_id', normalizeDbText(source.tenant_id ?? source.tenantId))
  setIfPresent(mapped, 'company_id', normalizeDbText(source.company_id ?? source.companyId))
  setIfPresent(mapped, 'created_by', normalizeDbText(source.created_by ?? source.createdBy))
  setIfPresent(mapped, 'owner_user_id', normalizeDbText(source.owner_user_id ?? source.ownerUserId))
  setIfPresent(mapped, 'visibility', normalizeDbText(source.visibility))
  setIfPresent(mapped, 'locked_by', normalizeDbText(source.locked_by ?? source.lockedBy))
  setIfPresent(mapped, 'locked_at', normalizeDbText(source.locked_at ?? source.lockedAt))

  return mapped
}

export function resolveDraftBundle(input = {}) {
  const bundle = input && typeof input === 'object' ? input : {}
  const innerDraft = bundle.draft && typeof bundle.draft === 'object' ? bundle.draft : bundle
  const pnPayload = bundle.pnPayload && typeof bundle.pnPayload === 'object'
    ? bundle.pnPayload
    : innerDraft.pnPayload && typeof innerDraft.pnPayload === 'object'
      ? innerDraft.pnPayload
      : null
  const righePayload = Array.isArray(bundle.righePayload)
    ? bundle.righePayload
    : Array.isArray(innerDraft.righePayload)
      ? innerDraft.righePayload
      : Array.isArray(innerDraft.rows)
        ? innerDraft.rows
        : []

  const ivaDraft = bundle.ivaDraft || innerDraft.ivaDraft || null
  const ivaRows = Array.isArray(ivaDraft?.rows) ? ivaDraft.rows : []

  const partitarioDraft = bundle.partitarioDraft || innerDraft.partitarioDraft || null
  const partitarioRows = Array.isArray(partitarioDraft?.rows) ? partitarioDraft.rows : []

  const mapped = {
    bundle,
    innerDraft,
    pnPayload,
    righePayload,
    ivaDraft,
    ivaRows,
    partitarioDraft,
    partitarioRows,
    validation: bundle.validation || innerDraft.validation || null,
    readiness: bundle.readiness || innerDraft.readiness || null,
    classification: bundle.classification || innerDraft.classification || null,
    meta: bundle.meta || innerDraft.meta || null,
  }
  return mapped
}

function requiresControparteForPersistence(resolved = {}) {
  const draft = resolved.innerDraft && typeof resolved.innerDraft === 'object' ? resolved.innerDraft : {}
  const pnPayload = resolved.pnPayload && typeof resolved.pnPayload === 'object' ? resolved.pnPayload : {}
  const behavior = draft.meta?.behavior || draft.behavior || pnPayload.behavior || {}

  if (behavior.requiresSoggetto === true) return true

  return Boolean(
    behavior.showDocumentPanel ||
    behavior.showIvaPanel ||
    behavior.showPartitario ||
    behavior.showRitenute ||
    pnPayload.requires_soggetto ||
    pnPayload.requiresSoggetto ||
    pnPayload.showDocumentPanel ||
    pnPayload.showIvaPanel ||
    pnPayload.showPartitario ||
    pnPayload.showRitenute
  )
}

export function buildPersistenceValidation(resolved = {}) {
  const {
    pnPayload,
    righePayload,
    validation,
    readiness,
    innerDraft,
  } = resolved || {}
  const blockers = []
  const warnings = []
  const rows = Array.isArray(righePayload) ? righePayload : []
  const totals = calculatePrimaNotaDraftTotals(rows)

  if (!pnPayload) blockers.push('draft canonico mancante')

  const headerCausale = innerDraft?.header?.causaleContabile || pnPayload?.causaleContabile
  const causaleObj = {
    ...headerCausale,
    codice: pnPayload?.causale_codice || headerCausale?.codice
  }
  const policy = buildCausaleContabilePolicy(causaleObj)

  if (!policy.isCoerente) {
    blockers.push(...policy.erroriCoerenza)
  }

  const societaId = normalizeText(pnPayload?.societa_id)
  const esercizioText = normalizeText(pnPayload?.esercizio ?? innerDraft?.header?.esercizioContabile ?? pnPayload?.esercizio_contabile)
  const esercizio = Number.parseInt(esercizioText, 10)
  const dataRegistrazione = normalizeText(pnPayload?.data_registrazione)
  const causaleId = normalizeText(pnPayload?.causale_id || pnPayload?.causale_codice)
  const controparteId = normalizeText(pnPayload?.cliente_fornitore_id)
  const controparteNome = normalizeText(pnPayload?.cliente_fornitore_nome)
  const controparteRequired =
    requiresControparteForPersistence({ innerDraft, pnPayload, readiness, validation }) ||
    (policy.gestionePartitario !== 'nessuno' && policy.gestionePartitario !== '')

  if (!societaId) blockers.push('societa_id mancante')
  if (!Number.isFinite(esercizio)) blockers.push('esercizio contabile mancante o non determinabile')
  if (!dataRegistrazione) blockers.push('data registrazione mancante')
  if (!causaleId) blockers.push('causale contabile mancante')
  if (controparteRequired && !controparteId && !controparteNome) {
    blockers.push('controparte mancante')
  }

  if (!rows.length) blockers.push('righe prima nota assenti')

  rows.forEach((row, index) => {
    const contoId = normalizeText(row?.conto_id || row?.accountId)
    const dare = round2(row?.dare ?? row?.importo_dare ?? 0)
    const avere = round2(row?.avere ?? row?.importo_avere ?? 0)

    if (!contoId) blockers.push(`riga ${index + 1}: conto mancante`)
    if (dare < 0 || avere < 0) blockers.push(`riga ${index + 1}: importo negativo`)
    if (dare === 0 && avere === 0) blockers.push(`riga ${index + 1}: importo assente`)
    if (dare > 0 && avere > 0) blockers.push(`riga ${index + 1}: dare/avere entrambi valorizzati`)
  })

  if (!totals.isBalanced) blockers.push('Dare/Avere non quadrati')
  if (readiness?.status === 'bloccato_per_casistica_non_gestita') blockers.push('casistica non gestita')
  if (validation?.status === 'blocked' && Array.isArray(validation?.blockers)) {
    blockers.push(...validation.blockers)
  }
  if (Array.isArray(validation?.warnings)) warnings.push(...validation.warnings)

  const ivaPerCassaPreview = innerDraft?.partitarioDraft?.ivaPerCassaPreview
  if (ivaPerCassaPreview?.active) {
    const previewItems = Array.isArray(ivaPerCassaPreview.items) ? ivaPerCassaPreview.items : []
    previewItems.forEach((item) => {
      if (!item?.coerente) {
        blockers.push(`partita ${item?.partitaId || 'IVA per cassa'}: rilascio IVA non coerente al centesimo`)
      }
    })
  }

  const mapped = {
    status: blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    totals,
  }
  return mapped
}

function buildPersistError(validation) {
  const message = Array.isArray(validation?.blockers) && validation.blockers.length
    ? validation.blockers.join('; ')
    : 'Persistenza prima nota bloccata'
  const error = new Error(message)
  error.code = 'PERSIST_PRIMA_NOTA_DRAFT_BLOCKED'
  error.details = {
    blockers: Array.isArray(validation?.blockers) ? validation.blockers : [],
    warnings: Array.isArray(validation?.warnings) ? validation.warnings : [],
  }
  return error
}

function mapRegistriIvaRowForDb(row = {}, index = 0, pnPayload = {}, ivaDraft = {}, resolvedDraft = {}) {
  const headerCausale = resolvedDraft.innerDraft?.header?.causaleContabile || resolvedDraft.pnPayload?.causaleContabile
  const causaleObj = {
    ...headerCausale,
    codice: pnPayload.causale_codice || headerCausale?.codice
  }
  const policy = buildCausaleContabilePolicy(causaleObj)
  const isSottrae = policy.notaCredito === true || 
                    policy.segnoRegistroIva === '-' || 
                    String(policy.segnoRegistroIva).toLowerCase() === 'sottrae' ||
                    String(row.segnoRegistro || ivaDraft?.segnoRegistro || '').trim() === '-'
  const mult = isSottrae ? -1 : 1

  const imponibile = normalizeDbAmount(row.imponibile) * mult
  const ivaAmount = normalizeDbAmount(row.ivaTotale ?? row.ivaDetraibile ?? row.iva ?? row.imposta ?? 0) * mult
  const pct = Number.isFinite(Number(row.percentualeDetraibilita ?? row.detraibilitaPercent))
    ? Number(row.percentualeDetraibilita ?? row.detraibilitaPercent)
    : 100
  const iva_detraibile = (Number.isFinite(Number(row.ivaDetraibile ?? row.ivaDetraibile))
    ? normalizeDbAmount(row.ivaDetraibile)
    : round2(Math.abs(ivaAmount) * (pct / 100))) * mult
  const iva_indetraibile = (Number.isFinite(Number(row.ivaIndetraibile))
    ? normalizeDbAmount(row.ivaIndetraibile)
    : round2(Math.abs(ivaAmount) - Math.abs(iva_detraibile))) * mult

  const explicitTipo = normalizeDbText(row.tipo || row.tipoRegistro || row.registroTipo || row.tipo_riga)
  let tipo = explicitTipo || 'acquisto'
  if (!explicitTipo) {
    if (policy.isFatturaAttiva || policy.isNotaCreditoAttiva) {
      tipo = 'vendita'
    } else if (policy.isFatturaPassiva || policy.isNotaCreditoPassiva) {
      tipo = 'acquisto'
    } else {
      const reg = String(row.registroIva || row.registerType || ivaDraft?.registroIva || policy.registroIva || '').toLowerCase().trim()
      if (reg === '02' || reg === '03' || reg.includes('ven') || reg.includes('corr')) {
        tipo = 'vendita'
      } else {
        tipo = 'acquisto'
      }
    }
  }

  const esigibilita = ['immediata', 'differita', 'rilascio'].includes(String(row.esigibilita || ivaDraft?.esigibilita || '').trim().toLowerCase())
    ? String(row.esigibilita || ivaDraft.esigibilita).trim().toLowerCase()
    : 'immediata'

  const origin_registro_iva_id = normalizeDbText(row.origin_registro_iva_id || row.originRegistroIvaId) || null

  const headerObj = resolvedDraft.innerDraft?.header || {}
  const partitarioDraft = resolvedDraft.innerDraft?.partitarioDraft || {}
  const cfcf = headerObj.clienteFornitoreCodice || headerObj.cliente_fornitore_codice || partitarioDraft.codiceFiscale || ''
  const cfpi = headerObj.clienteFornitorePartitaIva || headerObj.cliente_fornitore_partita_iva || partitarioDraft.partitaIva || partitarioDraft.selectedContropartePartitaIva || ''
  const resolvedPiva = cfpi || cfcf || null
  const resolvedDenom = headerObj.clienteFornitoreNome || headerObj.cliente_fornitore_nome || partitarioDraft.soggettoNome || partitarioDraft.selectedControparteNome || pnPayload.cliente_fornitore_nome || null

  const mapped = {
    documento_id: pnPayload.numero_documento || 'manual-reg-doc',
    riga_idx: index,
    data: pnPayload.data_documento || pnPayload.data_registrazione,
    imponibile,
    iva: ivaAmount,
    aliquota: Number.isFinite(Number(row.aliquota)) ? Number(row.aliquota) : null,
    tipo,
    detraibile: pct > 0,
    percentuale_detraibilita: pct,
    iva_detraibile,
    iva_indetraibile,
    causale_iva_id: normalizeDbText(row.causaleIvaId || row.causale_iva_id),
    societa_id: pnPayload.societa_id || null,
    numero_documento: pnPayload.numero_documento || null,
    data_documento: pnPayload.data_documento || null,
    soggetto_denominazione: resolvedDenom,
    soggetto_piva: resolvedPiva,
    esigibilita,
    origin_registro_iva_id,
  }
  if (row.splitPayment || row.split_payment || ivaDraft?.splitPayment) mapped.split_payment = true
  return mapped
}

function expandAutofatturaVatEntries(rows = [], resolvedDraft = {}) {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : []
  const header = resolvedDraft?.innerDraft?.header || {}
  const policy = buildCausaleContabilePolicy(header?.causaleContabile || resolvedDraft?.pnPayload?.causaleContabile || {})
  const needsDuplicate = Boolean((policy.isAutofattura || policy.isCee) && list.length === 1)

  if (!needsDuplicate) return list

  const baseRow = list[0]
  const acquistoRow = {
    ...baseRow,
    tipo: baseRow?.tipo || 'acquisto',
  }
  const venditaRow = {
    ...baseRow,
    ui_id: `${normalizeText(baseRow?.id || 'iva-row-1')}-vendita`,
    tipo: 'vendita',
  }

  return [acquistoRow, venditaRow]
}

function sanitizeRegistroIvaForInsert(row = {}) {
  const source = row && typeof row === 'object' ? row : {}
  const {
    ui_id,
    uiId,
    rowId,
    tempId,
    key,
    label,
    display,
    totale,
    registerType,
    segnoRegistro,
    caseType,
    ...safeRow
  } = source
  return safeRow
}

function mapPartitarioRowForDb(row = {}, pnPayload = {}, resolvedDraft = {}) {
  const headerCausale = resolvedDraft.innerDraft?.header?.causaleContabile || resolvedDraft.pnPayload?.causaleContabile
  const causaleObj = {
    ...headerCausale,
    codice: pnPayload.causale_codice || headerCausale?.codice
  }
  const policy = buildCausaleContabilePolicy(causaleObj)
  
  if (policy.gestionePartitario === 'nessuno' || policy.gestionePartitario === '') {
    return null
  }

  let subjectTipo = row.soggettoTipo
  if (!subjectTipo) {
    if (policy.isFatturaPassiva || policy.isNotaCreditoPassiva) {
      subjectTipo = 'fornitore'
    } else if (policy.isFatturaAttiva || policy.isNotaCreditoAttiva) {
      subjectTipo = 'cliente'
    } else {
      const isAcquistiReg = ['acquisti', '01'].includes(String(policy.registroIva).trim().toLowerCase())
      subjectTipo = isAcquistiReg ? 'fornitore' : 'cliente'
    }
  }

  const imp = normalizeDbAmount(row.importoAperto || row.importoOriginario || 0)
  const isNC = policy.notaCredito || policy.isNotaCreditoAttiva || policy.isNotaCreditoPassiva || String(policy.segnoRegistroIva).trim() === '-' || String(policy.segnoRegistroIva).trim().toLowerCase() === 'sottrae'
  const sign = isNC ? -1 : 1
  const baseAmount = Math.abs(imp)
  const finalAmount = baseAmount * sign

  const iva_per_cassa = Boolean(row.iva_per_cassa ?? row.ivaPerCassa ?? policy.ivaPerCassa ?? false)

  // Resolve account details from pianoConti to populate missing DB columns
  const pianoConti = resolvedDraft.innerDraft?.pianoConti || resolvedDraft.bundle?.pianoConti || []
  const subjectId = row.soggettoId || pnPayload.cliente_fornitore_id || null
  const subjectAccount = Array.isArray(pianoConti)
    ? pianoConti.find(c => String(c.id).trim() === String(subjectId || '').trim())
    : null

  const contoCodice = subjectAccount?.codice || row.conto_codice || null
  const contoDescrizione = subjectAccount?.descrizione || subjectAccount?.nome || row.conto_descrizione || pnPayload.cliente_fornitore_nome || row.soggettoNome || null

  return {
    societa_id: pnPayload.societa_id || null,
    tipo: subjectTipo,
    conto_id: subjectId,
    numero_documento: row.numeroDocumento || pnPayload.numero_registrazione || null,
    data_documento: row.dataDocumento || pnPayload.data_documento || null,
    data_scadenza: row.dataScadenza || row.dataDocumento || pnPayload.data_documento || null,
    importo_originale: finalAmount,
    importo_pagato: 0,
    importo_residuo: finalAmount,
    stato: 'aperta',
    tipo_movimento: 'apertura',
    iva_per_cassa,
    controparte_id: subjectId,
    controparte_nome: contoDescrizione,
    conto_codice: contoCodice,
    conto_descrizione: contoDescrizione,
    causale_id: pnPayload.causale_id || null
  }
}

function mapPartitarioClosureForDb(row = {}, pnPayload = {}) {
  let amount = Math.abs(normalizeDbAmount(row.importoChiusura || row.importo_chiuso || 0))
  const isNC = (row.importoOriginario < 0 || row.residuo < 0 || row.importo_originale < 0 || row.saldo_residuo < 0 || row.importo_residuo < 0)
  if (isNC) {
    amount = -amount
  }
  return {
    documento_id: row.id,
    importo_chiuso: amount,
    tipo_movimento: 'chiusura'
  }
}

function mapRitenutaRowForDb(ritDraft = {}, pnPayload = {}) {
  return buildRitenutaPersistencePayload(ritDraft, pnPayload)
}

export async function persistPrimaNotaDraft({
  db,
  draft = {},
  headerSelect = 'id',
  righeSelect = '*',
} = {}) {
  const resolved = resolveDraftBundle(draft)
  const headerCausale = resolved.innerDraft?.header?.causaleContabile || resolved.pnPayload?.causaleContabile
  const causaleObj = {
    ...headerCausale,
    codice: resolved.pnPayload?.causale_codice || headerCausale?.codice
  }
  const policy = buildCausaleContabilePolicy(causaleObj)
  const validation = buildPersistenceValidation(resolved)

  // FASE 2: Esecuzione della validazione canonica prima del write
  let canonicalBlockers = []
  let canonicalWarnings = []
  let canonicalPayload = null
  let ordinaryVatResult = null
  try {
    const operatorId = draft?.meta?.operatorId || draft?.pnPayload?.created_by || 'sistema'
    const createdAt = draft?.meta?.createdAt || draft?.pnPayload?.created_at || new Date().toISOString()
    const { payload, validationResult } = mapRegistrazioneManualeToCanonical(draft, {
      mode: 'commit',
      operatorId,
      createdAt
    })
    canonicalPayload = payload
    if (validationResult) {
      canonicalBlockers = validationResult.blocking || []
      canonicalWarnings = validationResult.warnings || []
    }
    ordinaryVatResult = buildVatRegisterEntriesFromCanonicalPayload(canonicalPayload, {
      persistenceContext: resolved.pnPayload,
    })
  } catch (err) {
    if (err?.code === 'VAT_REGISTER_ENTRIES_BLOCKED') {
      canonicalBlockers.push(...(err?.details?.blockers || [err.message]))
    } else {
      console.error('[persistPrimaNotaDraft] Errore durante il mapping canonico:', err)
      canonicalBlockers.push(`Errore mapping canonico: ${err.message}`)
    }
  }

  if (canonicalBlockers.length > 0) {
    validation.status = 'blocked'
    validation.blockers = Array.from(new Set([...(validation.blockers || []), ...canonicalBlockers]))
  }
  if (canonicalWarnings.length > 0) {
    validation.warnings = Array.from(new Set([...(validation.warnings || []), ...canonicalWarnings]))
  }

  if (validation.status === 'blocked') {
    return {
      data: null,
      error: buildPersistError(validation),
      validation,
      draft: resolved.innerDraft,
    }
  }

  const pnPayloadForDb = mapPrimaNotaPayloadForDb(resolved.pnPayload)
  if (!pnPayloadForDb.stato || pnPayloadForDb.stato === 'bozza' || pnPayloadForDb.stato === 'provvisoria') {
    pnPayloadForDb.stato = resolved.innerDraft?.isSimulata || resolved.innerDraft?.meta?.isSimulata || resolved.innerDraft?.pnPayload?.isSimulata || resolved.innerDraft?.header?.isSimulata ? 'simulata' : 'confermata'
  }
  pnPayloadForDb.totale_dare = validation.totals.dare
  pnPayloadForDb.totale_avere = validation.totals.avere

  const righePayloadForDb = Array.isArray(resolved.righePayload)
    ? resolved.righePayload.map((row, index) => mapPrimaNotaRigaForDb(row, index))
    : []

  const ivaEnabled = Boolean(resolved.ivaDraft?.active || resolved.innerDraft?.meta?.behavior?.showIvaPanel)
  let vatEntriesForDb = ordinaryVatResult?.handled
    ? ordinaryVatResult.entries
    : (ivaEnabled && Array.isArray(resolved.ivaRows)
        ? resolved.ivaRows.map((row, index) => mapRegistriIvaRowForDb(row, index, pnPayloadForDb, resolved.ivaDraft, resolved))
        : [])
  if (!ordinaryVatResult?.handled) {
    vatEntriesForDb = expandAutofatturaVatEntries(vatEntriesForDb, resolved)
  }
  vatEntriesForDb = vatEntriesForDb.map(sanitizeRegistroIvaForInsert)

  const partitarioEnabled = Boolean(
    resolved.partitarioDraft?.active ||
    resolved.innerDraft?.meta?.behavior?.showPartitario ||
    (policy.gestionePartitario !== 'nessuno' && policy.gestionePartitario !== '')
  )
  let partRows = Array.isArray(resolved.partitarioRows) ? resolved.partitarioRows : []
  const draftMode = resolved.partitarioDraft?.mode
  const partMode = (draftMode && draftMode !== 'none') ? draftMode : (policy.gestionePartitario === 'apertura' ? 'apertura' : (policy.gestionePartitario === 'chiusura' ? 'chiusura' : 'nessuno'))

  if (partitarioEnabled && partRows.length === 0 && policy.gestionePartitario === 'apertura') {
    const isPassiva = policy.isFatturaPassiva || policy.isNotaCreditoPassiva
    const subjectTipo = isPassiva ? 'fornitore' : 'cliente'
    const subjectId = resolved.innerDraft?.header?.clienteFornitoreId || resolved.pnPayload?.cliente_fornitore_id || ''
    const subjectNome = resolved.innerDraft?.header?.clienteFornitoreNome || resolved.pnPayload?.cliente_fornitore_nome || ''
    const docNum = resolved.innerDraft?.header?.numeroDocumento || resolved.pnPayload?.numero_documento || resolved.pnPayload?.numero_registrazione || ''
    const docDate = resolved.pnPayload?.data_documento || resolved.pnPayload?.data_registrazione || resolved.innerDraft?.header?.dataDocumento || resolved.innerDraft?.header?.dataRegistrazione || ''
    const amount = validation.totals.dare || resolved.pnPayload?.totale_dare || 0

    partRows = [{
      soggettoId: subjectId,
      soggettoNome: subjectNome,
      soggettoTipo: subjectTipo,
      numeroDocumento: docNum,
      dataDocumento: docDate,
      importoAperto: amount,
      importoOriginario: amount,
    }]
  }

  const partEntriesForDb = partitarioEnabled
    ? partRows
        .filter(row => partMode === 'apertura' || (partMode === 'chiusura' && row.selected && Math.abs(normalizeDbAmount(row.importoChiusura || row.importo_chiuso || 0)) > 0.001))
        .map(row => {
          if (partMode === 'apertura') {
            return mapPartitarioRowForDb(row, pnPayloadForDb, resolved)
          } else {
            return mapPartitarioClosureForDb(row, pnPayloadForDb)
          }
        })
        .filter(Boolean)
    : []

  const closures = partMode === 'chiusura'
    ? partRows.filter(row => row.selected && Math.abs(normalizeDbAmount(row.importoChiusura || row.importo_chiuso || 0)) > 0.001)
    : []

  if (partMode === 'chiusura' && closures.length > 0) {
    const releaseRows = await handleIvaPerCassaRelease(db, closures, pnPayloadForDb)
    if (releaseRows && releaseRows.length > 0) {
      const baseIdx = vatEntriesForDb.length
      releaseRows.forEach((r, idx) => {
        r.riga_idx = baseIdx + idx
      })
      vatEntriesForDb = [...vatEntriesForDb, ...releaseRows]
    }
  }

  const ritenuteDraft = resolved.innerDraft?.ritenutaDraft || resolved.bundle?.ritenutaDraft || resolved.innerDraft?.ritenutaData || null
  const ritenutaMode = String(ritenuteDraft?.mode || '').trim().toLowerCase()
  const ritenutaEnabled = Boolean(ritenuteDraft?.active && ritenutaMode === 'documento')
  const ritenutaEntriesForDb = ritenutaEnabled
    ? (Array.isArray(ritenuteDraft?.rows)
        ? ritenuteDraft.rows.map(row => mapRitenutaRowForDb(row, pnPayloadForDb))
        : [mapRitenutaRowForDb(ritenuteDraft, pnPayloadForDb)])
    : []
  const ritenutaUpdatesForDb = ritenuteDraft?.active && ritenutaMode === 'pagamento'
    ? [buildRitenutaMaturazionePayload(ritenuteDraft)]
    : []

  const complete = await createPrimaNotaCompleta({
    db,
    pnPayload: pnPayloadForDb,
    righePayload: righePayloadForDb,
    vatEntries: vatEntriesForDb,
    partEntries: partEntriesForDb,
    ritenutaEntries: ritenutaEntriesForDb,
    ritenutaUpdates: ritenutaUpdatesForDb,
    headerSelect,
    righeSelect,
    partitarioSelect: '*',
    rollbackOnRigheError: true,
  })

  if (complete?.error) {
    const error = new Error(complete.error?.message || String(complete.error))
    error.code = complete.error?.code || 'PERSIST_PRIMA_NOTA_DRAFT_FAILED'
    error.details = {
      pn: complete.pn || null,
      righeIns: complete.righeIns || null,
      vatIns: complete.vatIns || null,
      partIns: complete.partIns || null,
      ritenuteIns: complete.ritenuteIns || null,
      ritenuteUpd: complete.ritenuteUpd || null,
    }
    return {
      data: null,
      error,
      validation,
      draft: resolved.innerDraft,
      pn: complete.pn || null,
      righeIns: complete.righeIns || null,
      vatIns: complete.vatIns || null,
      partIns: complete.partIns || null,
      ritenuteIns: complete.ritenuteIns || null,
      rollback: complete.rollback || null,
    }
  }

  const primaNotaId = complete?.data?.primaNotaId || complete?.pn?.id || null
  const righeCreated = Array.isArray(complete?.righeIns?.data)
    ? complete.righeIns.data.length
    : Array.isArray(resolved.righePayload)
      ? resolved.righePayload.length
      : 0
  const vatCreated = Array.isArray(complete?.vatIns?.data)
    ? complete.vatIns.data.length
    : vatEntriesForDb.length

  // Trace tecnico temporaneo per FASE 2
  console.log('[AUDIT_PN_SEMPLICE_TRACE]', {
    event: 'prima_nota_salvata',
    primaNotaId,
    societaId: pnPayloadForDb.societa_id,
    dataRegistrazione: pnPayloadForDb.data_registrazione,
    totaleDare: pnPayloadForDb.totale_dare,
    totaleAvere: pnPayloadForDb.totale_avere,
    operatore: pnPayloadForDb.created_by || 'sistema',
    timestamp: new Date().toISOString(),
  })

  return {
    data: {
      prima_nota_id: primaNotaId,
      numero_righe: righeCreated,
      righe_create_count: righeCreated,
      numero_righe_iva: vatCreated,
      vat_create_count: vatCreated,
      totale_dare: validation.totals.dare,
      totale_avere: validation.totals.avere,
      isBalanced: validation.totals.isBalanced,
    },
    error: null,
    validation,
    draft: resolved.innerDraft,
    pn: complete.pn || null,
    righeIns: complete.righeIns || null,
    vatIns: complete.vatIns || null,
    partIns: complete.partIns || null,
    ritenuteIns: complete.ritenuteIns || null,
    ritenuteUpd: complete.ritenuteUpd || null,
    rollback: complete.rollback || null,
  }
}

