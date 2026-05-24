function normalizeText(value) {
  return String(value ?? '').trim()
}

function normalizeKey(value) {
  return normalizeText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
}

function toInt(value) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function splitCodeSegments(value) {
  return normalizeText(value)
    .split(/[\s._/-]+/)
    .map((part) => part.trim())
    .filter(Boolean)
}

function readFirstText(item, keys = []) {
  for (const key of keys) {
    const text = normalizeText(item?.[key])
    if (text) return text
  }
  return ''
}

function readHierarchyHint(item) {
  const raw = readFirstText(item, [
    'hierarchyType',
    'hierarchy_type',
    'hierarchy',
    'tipo_conto',
    'tipoConto',
    'conto_tipo',
    'tipo_hierarchy',
    'natura_conto',
    'tipo',
  ])
  const normalized = normalizeKey(raw)
  if (!normalized) return ''
  if (normalized.includes('mastro') || normalized.includes('macro')) return 'mastro'
  if (normalized.includes('sottoconto') || normalized.includes('final') || normalized.includes('leaf') || normalized.includes('ultimo')) {
    return 'sottoconto'
  }
  if (normalized.includes('conto') || normalized.includes('gruppo') || normalized.includes('categoria') || normalized.includes('intermedio')) {
    return 'conto'
  }
  return ''
}

function hasFinalFlag(item) {
  return Boolean(
    item?.finale === true ||
      item?.is_finale === true ||
      item?.isFinale === true ||
      item?.leaf === true ||
      item?.is_leaf === true ||
      item?.isLeaf === true ||
      item?.ultimo_livello === true ||
      item?.movimentabile === true && normalizeKey(item?.tipo).includes('final')
  )
}

function hasMasterFlag(item) {
  return Boolean(item?.mastro === true || item?.is_mastro === true || item?.isMastro === true)
}

function hasContoFlag(item) {
  return Boolean(item?.conto === true || item?.is_conto === true || item?.isConto === true)
}

function resolveHierarchyType(item = {}) {
  const explicitHint = readHierarchyHint(item)
  if (explicitHint) return explicitHint

  if (hasMasterFlag(item)) return 'mastro'
  if (hasFinalFlag(item)) return 'sottoconto'
  if (hasContoFlag(item)) return 'conto'

  const level = toInt(item?.livello ?? item?.level ?? item?.depth)
  const codeSegments = splitCodeSegments(item?.codice || item?.code || item?.sigla || item?.id)

  if (level != null) {
    if (level <= 1) return 'mastro'
    if (level === 2) return 'conto'
    if (level >= 3) {
      if (codeSegments.length >= 4) return 'sottoconto'
      return 'conto'
    }
  }

  if (codeSegments.length <= 1) return 'mastro'
  if (codeSegments.length === 2) return 'conto'
  if (codeSegments.length >= 4) return 'sottoconto'
  return 'conto'
}

function resolveHierarchyLevel(item = {}, hierarchyType = '') {
  const explicitLevel = toInt(item?.livello ?? item?.level ?? item?.depth)
  if (explicitLevel != null) return explicitLevel
  const codeSegments = splitCodeSegments(item?.codice || item?.code || item?.sigla || item?.id)
  if (hierarchyType === 'mastro') return 1
  if (hierarchyType === 'conto') return Math.max(2, codeSegments.length || 2)
  if (hierarchyType === 'sottoconto') return Math.max(3, codeSegments.length || 3)
  return codeSegments.length || 1
}

function resolveDescription(item = {}) {
  return readFirstText(item, [
    'conto_descrizione',
    'descrizione_conto',
    'descrizioneConto',
    'contoDescription',
    'denominazione',
    'nome',
    'label',
    'title',
    'description',
    'descrizione',
  ]) || 'Descrizione conto non disponibile'
}

export function resolveContoHierarchyView(item = {}) {
  const hierarchyType = resolveHierarchyType(item)
  const level = resolveHierarchyLevel(item, hierarchyType)
  const displayCode = readFirstText(item, ['codice', 'code', 'sigla', 'id'])
  const displayDescription = resolveDescription(item)
  const hierarchyLabel =
    hierarchyType === 'mastro' ? 'Mastro' : hierarchyType === 'sottoconto' ? 'Sottoconto' : 'Conto'

  return {
    level,
    hierarchyType,
    hierarchyLabel,
    isMastro: hierarchyType === 'mastro',
    isConto: hierarchyType === 'conto',
    isSottoconto: hierarchyType === 'sottoconto',
    isSelectableForRegistrazione: hierarchyType === 'sottoconto',
    indentPx: Math.max(0, Number(level || 1) - 1) * 18,
    displayCode,
    displayDescription,
  }
}

export function isRegistrazioneContoSelectableForScope(item = {}, scope = 'registrazione') {
  const hierarchy = resolveContoHierarchyView(item)
  if (scope === 'template') return hierarchy.hierarchyType !== 'mastro'
  return hierarchy.isSelectableForRegistrazione
}

