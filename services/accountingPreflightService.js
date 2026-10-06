import { buildDocumentDedupeRequest } from '../domain/documentDedupePolicy.js'
import { buildRegistrationNumberRequest } from '../domain/registrationNumberPolicy.js'

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function getDedupeSubjectMatch(row, key) {
  const rowPiva = normalizeText(row?.soggetto_piva)
  const rowCf = normalizeText(row?.soggetto_cf)
  const rowDen = normalizeText(row?.soggetto_denominazione)
  const keyPiva = normalizeText(key?.soggettoPiva)
  const keyCf = normalizeText(key?.soggettoCf)
  const keyDen = normalizeText(key?.soggettoDenominazione)

  if (keyPiva && rowPiva && keyPiva === rowPiva) return true
  if (keyCf && rowCf && keyCf === rowCf) return true
  if (keyDen && rowDen && keyDen === rowDen) return true
  return false
}

function buildDedupeBlockers(matches) {
  const blockers = []
  for (const row of matches) {
    const workflow = normalizeText(row?.workflow_status)
    if (workflow === 'registering') {
      blockers.push({ code: 'P7_DOCUMENT_REGISTERING', message: 'Documento già in stato registering.' })
    }
    if (workflow === 'registered') {
      blockers.push({ code: 'P7_DOCUMENT_REGISTERED', message: 'Documento già registered.' })
    }
    if (row?.prima_nota_id) {
      blockers.push({ code: 'P7_DOCUMENT_ALREADY_LINKED', message: 'Documento già collegato a prima nota.' })
    }
    if (row?.registered_at) {
      blockers.push({ code: 'P7_DOCUMENT_ALREADY_REGISTERED_AT', message: 'Documento già marcato con registered_at.' })
    }
  }
  return blockers
}

export async function checkDocumentDedupe(db, dedupeRequest, options = {}) {
  if (!dedupeRequest || dedupeRequest.status === 'blocked') {
    return {
      status: 'blocked',
      matches: [],
      blockers: Array.isArray(dedupeRequest?.blockers) ? dedupeRequest.blockers : [{ code: 'P7_DEDUPE_REQUEST_INVALID', message: 'Dedupe request non valida.' }],
    }
  }

  const key = dedupeRequest.key || {}
  const queryResult = await db
    .from('documenti_contabilita')
    .select('id,workflow_status,prima_nota_id,registered_at,soggetto_piva,soggetto_cf,soggetto_denominazione,numero_documento,data_documento,totale')
    .eq('societa_id', key.societaId)
    .eq('numero_documento', key.numeroDocumento)
    .eq('data_documento', key.dataDocumento)
    .eq('totale', key.totale)

  const rows = Array.isArray(queryResult?.data) ? queryResult.data : []
  const matches = rows.filter((row) => getDedupeSubjectMatch(row, key))
  if (matches.length === 0) {
    return { status: 'clear', matches: [], blockers: [] }
  }

  const blockers = buildDedupeBlockers(matches)
  const hasRegistering = blockers.some((b) => b.code === 'P7_DOCUMENT_REGISTERING')
  return {
    status: hasRegistering ? 'blocked' : 'duplicate',
    matches,
    blockers,
  }
}

export async function previewNextRegistrationNumber(db, registrationNumberRequest, options = {}) {
  if (!registrationNumberRequest || registrationNumberRequest.status === 'blocked') {
    return {
      status: 'blocked',
      nextNumber: null,
      currentMax: null,
      scope: registrationNumberRequest?.scope || null,
      blockers: Array.isArray(registrationNumberRequest?.blockers)
        ? registrationNumberRequest.blockers
        : [{ code: 'P7_REGISTRATION_REQUEST_INVALID', message: 'Registration number request non valida.' }],
      warnings: [],
    }
  }

  const scope = registrationNumberRequest.scope || {}
  const result = await db
    .from('prima_nota')
    .select('numero_registrazione')
    .eq('societa_id', scope.societaId)
    .eq('esercizio', scope.esercizio)
    .order('numero_registrazione', { ascending: false })
    .limit(1)

  const rows = Array.isArray(result?.data) ? result.data : []
  const currentMax = hasValue(rows[0]?.numero_registrazione) ? Number(rows[0].numero_registrazione) : 0
  const nextNumber = currentMax + 1

  return {
    status: 'ready',
    nextNumber,
    currentMax,
    scope,
    blockers: [],
    warnings: [{ code: 'number_not_reserved', message: 'Preview only: registration number is not reserved.' }],
  }
}

export async function runAccountingWritePreflight(db, plan, options = {}) {
  const dedupeRequest = buildDocumentDedupeRequest(plan, options)
  const registrationNumberRequest = buildRegistrationNumberRequest(plan, options)

  const dedupe = await checkDocumentDedupe(db, dedupeRequest, options)
  const registrationNumber = await previewNextRegistrationNumber(db, registrationNumberRequest, options)

  const blockers = [
    ...(dedupe.blockers || []),
    ...(registrationNumber.blockers || []),
  ]
  const warnings = [
    ...(registrationNumber.warnings || []),
  ]

  return {
    status: blockers.length > 0 || dedupe.status === 'blocked' ? 'blocked' : 'ready',
    blockers,
    warnings,
    dedupe,
    registrationNumber,
  }
}