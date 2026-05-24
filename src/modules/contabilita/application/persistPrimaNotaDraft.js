import { createPrimaNotaCompleta } from '../../../../services/primaNotaService.js'
import { calculatePrimaNotaDraftTotals } from './canonical_mapper/calculatePrimaNotaDraftTotals.js'
import { normalizeText, round2 } from './canonical_mapper/utils.js'

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

function mapPrimaNotaPayloadForDb(pnPayload = {}) {
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

function mapPrimaNotaRigaForDb(row = {}, index = 0, primaNotaId = null) {
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

function resolveDraftBundle(input = {}) {
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

  return {
    bundle,
    innerDraft,
    pnPayload,
    righePayload,
    validation: bundle.validation || innerDraft.validation || null,
    readiness: bundle.readiness || innerDraft.readiness || null,
    classification: bundle.classification || innerDraft.classification || null,
    meta: bundle.meta || innerDraft.meta || null,
  }
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

function buildPersistenceValidation(resolved = {}) {
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

  const societaId = normalizeText(pnPayload?.societa_id)
  const esercizioText = normalizeText(pnPayload?.esercizio ?? innerDraft?.header?.esercizioContabile ?? pnPayload?.esercizio_contabile)
  const esercizio = Number.parseInt(esercizioText, 10)
  const dataRegistrazione = normalizeText(pnPayload?.data_registrazione)
  const causaleId = normalizeText(pnPayload?.causale_id || pnPayload?.causale_codice)
  const controparteId = normalizeText(pnPayload?.cliente_fornitore_id)
  const controparteNome = normalizeText(pnPayload?.cliente_fornitore_nome)
  const controparteRequired = requiresControparteForPersistence({ innerDraft, pnPayload, readiness, validation })

  if (!societaId) blockers.push('societa_id mancante')
  if (!Number.isFinite(esercizio)) blockers.push('esercizio contabile mancante o non determinabile')
  if (!dataRegistrazione) blockers.push('data registrazione mancante')
  if (!causaleId) blockers.push('causale contabile mancante')
  if (controparteRequired && !controparteId && !controparteNome) blockers.push('controparte mancante')

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

  return {
    status: blockers.length ? 'blocked' : (warnings.length ? 'warning' : 'ok'),
    blockers: Array.from(new Set(blockers)),
    warnings: Array.from(new Set(warnings)),
    totals,
  }
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

export async function persistPrimaNotaDraft({
  db,
  draft = {},
  headerSelect = 'id',
  righeSelect = '*',
} = {}) {
  const resolved = resolveDraftBundle(draft)
  const validation = buildPersistenceValidation(resolved)
  if (validation.status === 'blocked') {
    return {
      data: null,
      error: buildPersistError(validation),
      validation,
      draft: resolved.innerDraft,
    }
  }

  const pnPayloadForDb = mapPrimaNotaPayloadForDb(resolved.pnPayload)
  pnPayloadForDb.totale_dare = validation.totals.dare
  pnPayloadForDb.totale_avere = validation.totals.avere

  const righePayloadForDb = Array.isArray(resolved.righePayload)
    ? resolved.righePayload.map((row, index) => mapPrimaNotaRigaForDb(row, index))
    : []

  const complete = await createPrimaNotaCompleta({
    db,
    pnPayload: pnPayloadForDb,
    righePayload: righePayloadForDb,
    partEntries: [],
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
      partIns: complete.partIns || null,
    }
    return {
      data: null,
      error,
      validation,
      draft: resolved.innerDraft,
      pn: complete.pn || null,
      righeIns: complete.righeIns || null,
      partIns: complete.partIns || null,
      rollback: complete.rollback || null,
    }
  }

  const primaNotaId = complete?.data?.primaNotaId || complete?.pn?.id || null
  const righeCreated = Array.isArray(complete?.righeIns?.data)
    ? complete.righeIns.data.length
    : Array.isArray(resolved.righePayload)
      ? resolved.righePayload.length
      : 0

  return {
    data: {
      prima_nota_id: primaNotaId,
      numero_righe: righeCreated,
      righe_create_count: righeCreated,
      totale_dare: validation.totals.dare,
      totale_avere: validation.totals.avere,
      isBalanced: validation.totals.isBalanced,
    },
    error: null,
    validation,
    draft: resolved.innerDraft,
    pn: complete.pn || null,
    righeIns: complete.righeIns || null,
    partIns: complete.partIns || null,
    rollback: complete.rollback || null,
  }
}
