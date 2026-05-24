import { resolveRegistrazioneContoLabel } from './resolveRegistrazioneConti.js'

function normalizeControparteKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function isGenericControparteLabel(value) {
  const normalized = normalizeControparteKey(value)
  if (!normalized) return true
  return [
    'immobilizzazioni',
    'banca',
    'cassa',
    'costi',
    'ricavi',
    'iva',
    'fornitori',
    'clienti',
    'professionisti',
    'clienti e fornitori',
    'attivo',
    'passivo',
    'patrimoniale',
    'economico',
    'mastro',
    'gruppo',
    'categoria',
    'famiglia',
  ].some((token) => normalized === token || normalized.startsWith(token))
}

function resolveControparteType(item = {}) {
  const rawType = String(
    item?.clienteFornitoreTipo ||
      item?.cliente_fornitore_tipo ||
      item?.tipoControparte ||
      item?.tipo_controparte ||
      item?.tipo ||
      ''
  )
    .trim()
    .toLowerCase()

  if (rawType.includes('fornit')) return 'fornitore'
  if (rawType.includes('client')) return 'cliente'
  if (rawType.includes('prof')) return 'professionista'
  if (item?.is_fornitore) return 'fornitore'
  if (item?.is_cliente) return 'cliente'
  if (item?.is_professionista) return 'professionista'
  return ''
}

function resolveAllowedControparteTypes(header = {}, existingType = '') {
  const explicitType = resolveControparteType({
    clienteFornitoreTipo: existingType,
    cliente_fornitore_tipo: existingType,
  })
  if (explicitType) return [explicitType]

  const causaleCode = normalizeControparteKey(
    header?.causaleContabile?.codice ??
      header?.causaleContabile?.code ??
      header?.causaleContabileId ??
      header?.causaleContabile ??
      header?.causale_codice ??
      ''
  )

  if (causaleCode.startsWith('ff')) return ['fornitore']
  if (causaleCode.startsWith('fc')) return ['cliente']

  return ['fornitore', 'cliente']
}

function isAllowedControparteType(item, allowedTypes = []) {
  const type = resolveControparteType(item)
  if (!type) return false
  if (!Array.isArray(allowedTypes) || allowedTypes.length === 0) return true
  return allowedTypes.includes(type)
}

function getControparteCandidateLabel(item = {}) {
  return String(resolveRegistrazioneContoLabel(item) || '').trim()
}

export function isRegistrazioneControparte(item) {
  return Boolean(resolveControparteType(item))
}

export function filterRegistrazioneControparti(conti = []) {
  return (Array.isArray(conti) ? conti : []).filter((item) => isRegistrazioneControparte(item) && !isGenericControparteLabel(getControparteCandidateLabel(item)))
}

export function buildRegistrazioneContropartiList(conti = []) {
  return filterRegistrazioneControparti(conti)
    .map((item) => ({
      ...item,
      __label: resolveRegistrazioneContoLabel(item),
    }))
    .filter((item) => String(item.__label || '').trim())
}

export function findRegistrazioneControparteExactMatch(conti = [], input = '', { allowedTypes = [] } = {}) {
  const query = normalizeControparteKey(input)
  if (!query) return null

  const list = filterRegistrazioneControparti(conti).filter((item) => isAllowedControparteType(item, allowedTypes))
  return list.find((item) => {
    const exactId = normalizeControparteKey(item?.id)
    const exactCode = normalizeControparteKey(item?.codice || item?.code || item?.sigla)
    const exactDescr = normalizeControparteKey(
      item?.conto_descrizione ||
      item?.descrizione_conto ||
      item?.descrizioneConto ||
      item?.contoDescription ||
      item?.denominazione ||
      item?.nome ||
      item?.label ||
      item?.title ||
      item?.description ||
      item?.descrizione
    )
    const exactLabel = normalizeControparteKey(resolveRegistrazioneContoLabel(item))
    return query === exactId || query === exactCode || query === exactDescr || query === exactLabel
  }) || null
}

export function resolveRegistrazioneControparteListByHeader(header = {}, conti = []) {
  const existingType = resolveControparteType(header)
  const allowedTypes = resolveAllowedControparteTypes(header, existingType)
  return buildRegistrazioneContropartiList(conti).filter((item) => isAllowedControparteType(item, allowedTypes))
}
