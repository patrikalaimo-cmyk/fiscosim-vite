import { sb } from '../../../lib/supabase.js'

function notImplemented(methodName) {
  throw new Error(`Not implemented: ${methodName}`)
}

const DEDUP_STAGING_ACTIVE_STATES = new Set(['pending', 'classified', 'manual_pending'])
const DEDUP_STAGING_REIMPORTABLE_STATES = new Set(['processed', 'error', 'deleted', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived'])
const DEDUP_ACCOUNTING_ACTIVE_STATES = new Set(['confirmed', 'registered', 'registrata'])
const DEDUP_ACCOUNTING_REIMPORTABLE_STATES = new Set(['deleted', 'cancelled', 'canceled', 'annullato', 'annullata', 'archived'])

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeSocietaId(societaId) {
  return normalizeText(societaId)
}

const IMPORT_CONTABILITA_ALLOWED_MASTRINI = Object.freeze({
  fornitore: ['2.03.08', '2.03.09', '2.03.10'],
  cliente: ['1.02.20', '1.02.21'],
  professionista: ['2.03.10'],
})

function convertPianoContiParentToMastrino(parentCode) {
  return String(parentCode || '')
    .trim()
    .replace(/\s+/g, '.')
}

export function convertMastrinoToPianoContiParent(mastrino) {
  return String(mastrino || '')
    .trim()
    .replace(/\./g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizePianoContoRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: String(row?.id || '').trim(),
    codice: String(row?.codice || '').trim(),
    descrizione: String(row?.descrizione || '').trim(),
    livello: Number(row?.livello || 0) || 0,
    codiceMastro: String(row?.codice_mastro || row?.codiceMastro || '').trim(),
    codiceConto: String(row?.codice_conto || row?.codiceConto || '').trim(),
    codiceSottoconto: String(row?.codice_sottoconto || row?.codiceSottoconto || '').trim(),
    tipo: String(row?.tipo || '').trim(),
    natura: String(row?.natura || '').trim(),
    sezione: String(row?.sezione || '').trim(),
    partitaIva: String(row?.partita_iva || row?.partitaIva || '').trim(),
    anagraficaPiva: String(row?.anagrafica_piva || row?.anagraficaPiva || '').trim(),
    codiceFiscale: String(row?.codice_fiscale || row?.codiceFiscale || '').trim(),
    anagraficaCf: String(row?.anagrafica_cf || row?.anagraficaCf || '').trim(),
    isFornitore: Boolean(row?.is_fornitore ?? row?.isFornitore),
    isCliente: Boolean(row?.is_cliente ?? row?.isCliente),
    isProfessionista: Boolean(row?.is_professionista ?? row?.isProfessionista),
    anagraficaTipo: String(row?.anagrafica_tipo || row?.anagraficaTipo || '').trim(),
    isIva: Boolean(row?.is_iva ?? row?.isIva),
    causaleIvaId: String(row?.causale_iva_id || row?.causaleIvaId || '').trim(),
  }
}

function isAllowedImportContabilitaMastrino(tipo, mastrino) {
  const normalizedMastrino = String(mastrino || '').trim()
  if (!normalizedMastrino) return false

  const normalizedTipo = String(tipo || '').trim().toLowerCase()
  if (normalizedTipo === 'cliente') {
    return IMPORT_CONTABILITA_ALLOWED_MASTRINI.cliente.includes(normalizedMastrino)
  }

  if (normalizedTipo === 'professionista') {
    return IMPORT_CONTABILITA_ALLOWED_MASTRINI.professionista.includes(normalizedMastrino)
  }

  return IMPORT_CONTABILITA_ALLOWED_MASTRINI.fornitore.includes(normalizedMastrino)
}

async function fetchPagedRows({
  table,
  societaColumn,
  societaId,
  select,
  orderBy = 'created_at',
  ascending = false,
}) {
  const sid = normalizeSocietaId(societaId)
  if (!sid) return []

  const PAGE_SIZE = 1000
  const allRows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await sb
      .from(table)
      .select(select)
      .eq(societaColumn, sid)
      .order(orderBy, { ascending })
      .range(from, to)

    if (error) throw error

    const chunk = Array.isArray(data) ? data : []
    allRows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return allRows
}

function normalizeDedupCandidateRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    ...row,
    id: normalizeText(row?.id),
    filename: normalizeText(row?.filename),
    stato: normalizeText(row?.stato),
    workflow_status: normalizeText(row?.workflow_status),
    validation_status: normalizeText(row?.validation_status),
    numero_documento: normalizeText(row?.numero_documento),
    data_documento: normalizeText(row?.data_documento),
    tipo_documento: normalizeText(row?.tipo_documento),
    soggetto_denominazione: normalizeText(row?.soggetto_denominazione),
    soggetto_piva: normalizeText(row?.soggetto_piva),
    soggetto_cf: normalizeText(row?.soggetto_cf),
    totale: row?.totale,
    imponibile: row?.imponibile,
    iva: row?.iva,
    registered_at: normalizeText(row?.registered_at),
    prima_nota_id: normalizeText(row?.prima_nota_id),
    ai_raw_response: row?.ai_raw_response || null,
  }
}

export async function loadImportContabilitaDedupCandidatesBySocieta(societaId) {
  const sid = normalizeSocietaId(societaId)
  if (!sid) {
    return {
      stagingRows: [],
      accountingRows: [],
    }
  }

  const [stagingRows, accountingRows] = await Promise.all([
    fetchPagedRows({
      table: 'documenti_import',
      societaColumn: 'societa_destinazione_id',
      societaId: sid,
      select: 'id,filename,stato,created_at,ai_raw_response',
      orderBy: 'created_at',
      ascending: false,
    }),
    fetchPagedRows({
      table: 'documenti_contabilita',
      societaColumn: 'societa_id',
      societaId: sid,
      select:
        'id,numero_documento,data_documento,tipo_documento,soggetto_denominazione,soggetto_piva,soggetto_cf,validation_status,workflow_status,conto_id,imponibile,iva,totale,registered_at,prima_nota_id,created_at',
      orderBy: 'created_at',
      ascending: false,
    }),
  ])

  return {
    stagingRows: stagingRows.map(normalizeDedupCandidateRow),
    accountingRows: accountingRows.map(normalizeDedupCandidateRow),
    meta: {
      stagingActiveStates: Array.from(DEDUP_STAGING_ACTIVE_STATES),
      stagingReimportableStates: Array.from(DEDUP_STAGING_REIMPORTABLE_STATES),
      accountingActiveStates: Array.from(DEDUP_ACCOUNTING_ACTIVE_STATES),
      accountingReimportableStates: Array.from(DEDUP_ACCOUNTING_REIMPORTABLE_STATES),
    },
  }
}

export async function loadSocietaAttive() {
  const { data, error } = await sb
    .from('societa')
    .select('id,denominazione')
    .eq('attiva', true)
    .order('denominazione')

  if (error) throw error

  return Array.isArray(data)
    ? data
        .map((row) => ({
          id: String(row?.id || '').trim(),
          denominazione: String(row?.denominazione || '').trim(),
        }))
        .filter((row) => row.id && row.denominazione)
    : []
}

function normalizeImportContabilitaPercipienteCf(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

function isPercipienteSchemaColumnError(error) {
  const text = String(error?.message || error || '').toLowerCase()
  return text.includes('column') || text.includes('schema cache') || text.includes('does not exist')
}

function createPercipienteInsertVariants(payload) {
  const societaId = normalizeText(payload?.societa_id)
  const codiceFiscale = normalizeImportContabilitaPercipienteCf(payload?.codice_fiscale)
  const partitaIva = normalizeText(payload?.partita_iva || '') || null
  const ragioneSociale = normalizeText(payload?.ragione_sociale || '') || null
  const nome = normalizeText(payload?.nome || '') || null
  const cognome = normalizeText(payload?.cognome || '') || null

  const variants = [
    {
      societa_id: societaId,
      codice_fiscale: codiceFiscale,
      partita_iva: partitaIva,
      ragione_sociale: ragioneSociale,
      nome,
      cognome,
      attivo: true,
    },
    {
      societa_id: societaId,
      codice_fiscale: codiceFiscale,
      partita_iva: partitaIva,
      ragione_sociale: ragioneSociale,
      nome,
      cognome,
    },
    {
      societa_id: societaId,
      codice_fiscale: codiceFiscale,
      partita_iva: partitaIva,
      nome,
      cognome,
    },
    {
      societa_id: societaId,
      codice_fiscale: codiceFiscale,
    },
  ]

  return variants
    .map((variant) => {
      const compact = {}
      Object.entries(variant).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') return
        compact[key] = value
      })
      return compact
    })
    .filter((variant) => variant.societa_id && variant.codice_fiscale)
}

export function normalizeImportContabilitaPercipienteRow(row) {
  if (!row || typeof row !== 'object') return null
  const nome = String(row?.nome || '').trim()
  const cognome = String(row?.cognome || '').trim()
  const ragioneSociale = String(row?.ragione_sociale || '').trim()
  return {
    id: String(row?.id || '').trim(),
    societa_id: String(row?.societa_id || '').trim(),
    codice_fiscale: String(row?.codice_fiscale || '').trim(),
    partita_iva: String(row?.partita_iva || '').trim(),
    ragione_sociale: ragioneSociale,
    nome,
    cognome,
    tipo_percipiente: String(row?.tipo_percipiente || '').trim(),
    soggetto_cu: Boolean(row?.soggetto_cu),
    soggetto_770: Boolean(row?.soggetto_770),
    soggetto_ritenuta: Boolean(row?.soggetto_ritenuta),
    attivo: row?.attivo === undefined ? true : Boolean(row?.attivo),
    codiceFiscale: String(row?.codice_fiscale || '').trim(),
    partitaIva: String(row?.partita_iva || '').trim(),
    denominazione: ragioneSociale || [nome, cognome].filter(Boolean).join(' ').trim(),
  }
}

export async function loadPercipientiBySocieta(societaId) {
  const sid = String(societaId || '').trim()
  if (!sid) return []

  const attempts = [
    { select: 'id,societa_id,codice_fiscale,partita_iva,ragione_sociale,nome,cognome,attivo', useAttivoFilter: true, orderBy: 'ragione_sociale' },
    { select: 'id,societa_id,codice_fiscale,partita_iva,nome,cognome,attivo', useAttivoFilter: true, orderBy: 'id' },
    { select: 'id,societa_id,codice_fiscale,partita_iva,ragione_sociale,nome,cognome', useAttivoFilter: false, orderBy: 'ragione_sociale' },
    { select: 'id,societa_id,codice_fiscale,partita_iva,nome,cognome', useAttivoFilter: false, orderBy: 'id' },
  ]

  const runQuery = async ({ select, useAttivoFilter, orderBy }) => {
    let query = sb.from('percipienti').select(select).eq('societa_id', sid)
    if (useAttivoFilter) query = query.eq('attivo', true)
    return query.order(orderBy)
  }

  let lastError = null
  for (const attempt of attempts) {
    const response = await runQuery(attempt)
    if (!response?.error) {
      return Array.isArray(response.data) ? response.data.map(normalizeImportContabilitaPercipienteRow).filter(Boolean) : []
    }

    lastError = response.error
    if (!isPercipienteSchemaColumnError(response.error)) {
      throw response.error
    }
  }

  if (lastError) throw lastError
  return []
}

export async function findImportContabilitaPercipienteByCf(societaId, codiceFiscale) {
  const sid = String(societaId || '').trim()
  const cf = normalizeImportContabilitaPercipienteCf(codiceFiscale)
  if (!sid) {
    return { data: null, error: new Error('societa_id obbligatoria per percipienti') }
  }
  if (!cf) {
    return { data: null, error: new Error('codice_fiscale obbligatorio per percipienti') }
  }

  const attempts = [
    { select: 'id,societa_id,codice_fiscale,partita_iva,ragione_sociale,nome,cognome,attivo', useAttivoFilter: true },
    { select: 'id,societa_id,codice_fiscale,partita_iva,nome,cognome,attivo', useAttivoFilter: true },
    { select: 'id,societa_id,codice_fiscale,partita_iva,ragione_sociale,nome,cognome', useAttivoFilter: false },
    { select: 'id,societa_id,codice_fiscale,partita_iva,nome,cognome', useAttivoFilter: false },
  ]

  let lastError = null
  for (const attempt of attempts) {
    let query = sb
      .from('percipienti')
      .select(attempt.select)
      .eq('societa_id', sid)
      .eq('codice_fiscale', cf)
    if (attempt.useAttivoFilter) {
      query = query.eq('attivo', true)
    }

    const { data, error } = await query.maybeSingle()
    if (!error) {
      return {
        data: data ? normalizeImportContabilitaPercipienteRow(data) : null,
        error: null,
      }
    }

    lastError = error
    if (!isPercipienteSchemaColumnError(error)) {
      return { data: null, error }
    }
  }

  return { data: null, error: lastError }
}

export async function createImportContabilitaPercipiente(payload) {
  const societaId = normalizeText(payload?.societa_id)
  const codiceFiscale = normalizeImportContabilitaPercipienteCf(payload?.codice_fiscale)
  if (!societaId) {
    return { data: null, error: new Error('societa_id obbligatoria per percipienti') }
  }
  if (!codiceFiscale) {
    return { data: null, error: new Error('codice_fiscale obbligatorio per percipienti') }
  }

  const preflight = await findImportContabilitaPercipienteByCf(societaId, codiceFiscale)
  if (preflight?.error) return preflight
  if (preflight?.data?.id) {
    return { data: preflight.data, alreadyExists: true, error: null }
  }

  const { societa_id: _ignoredSocietaId, codice_fiscale: _ignoredCf, ...rest } = payload && typeof payload === 'object' ? payload : {}
  const insertVariants = createPercipienteInsertVariants({
    societa_id: societaId,
    codice_fiscale: codiceFiscale,
    partita_iva: rest.partita_iva,
    ragione_sociale: rest.ragione_sociale,
    nome: rest.nome,
    cognome: rest.cognome,
  })

  let lastError = null
  for (const variant of insertVariants) {
    const { data, error } = await sb
      .from('percipienti')
      .insert([variant])
      .select('id,societa_id,codice_fiscale,partita_iva,ragione_sociale,nome,cognome,attivo')
      .maybeSingle()

    if (!error) {
      return {
        data: data ? normalizeImportContabilitaPercipienteRow(data) : null,
        alreadyExists: false,
        error: null,
      }
    }

    lastError = error
    const errorText = String(error?.message || error || '').toLowerCase()
    if (errorText.includes('duplicate') || errorText.includes('unique') || errorText.includes('violates unique') || errorText.includes('23505')) {
      const retry = await findImportContabilitaPercipienteByCf(societaId, codiceFiscale)
      if (!retry?.error && retry?.data?.id) {
        return { data: retry.data, alreadyExists: true, error: null }
      }
    }

    if (!isPercipienteSchemaColumnError(error)) {
      return { data: null, alreadyExists: false, error }
    }
  }

  return { data: null, alreadyExists: false, error: lastError }
}

export async function loadPianoContiBySocieta(societaId) {
  const sid = String(societaId || '').trim()
  if (!sid) return []

  const PAGE_SIZE = 1000
  const allRows = []
  let from = 0

  while (true) {
    const to = from + PAGE_SIZE - 1
    const { data, error } = await sb
      .from('piano_conti')
      .select('id,codice,descrizione,livello,codice_mastro,codice_conto,codice_sottoconto,tipo,natura,sezione,partita_iva,anagrafica_piva,codice_fiscale,anagrafica_cf,is_fornitore,is_cliente,is_professionista,anagrafica_tipo,is_iva,causale_iva_id')
      .eq('societa_id', sid)
      .eq('attivo', true)
      .order('codice')
      .range(from, to)

    if (error) throw error

    const chunk = Array.isArray(data)
      ? data
          .map(normalizePianoContoRow)
          .filter((row) => row && row.id && (row.codice || row.descrizione))
      : []

    allRows.push(...chunk)
    if (chunk.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return allRows
}

export async function getNextPianoContoCodeByParent(societaId, parentCode) {
  const sid = String(societaId || '').trim()
  const parent = String(parentCode || '').trim()
  if (!sid) {
    return { data: null, error: new Error('societa_id obbligatoria per piano_conti') }
  }
  if (!parent) {
    return { data: null, error: new Error('parentCode obbligatorio per piano_conti') }
  }

  const parentParts = parent.split(' ').filter(Boolean)
  const level = parentParts.length + 1
  const { data, error } = await sb
    .from('piano_conti')
    .select('codice')
    .eq('societa_id', sid)
    .eq('attivo', true)
    .like('codice', `${parent} %`)
    .eq('livello', level)
    .order('codice', { ascending: false })
    .limit(1)

  if (error) {
    return { data: null, error }
  }

  const existingCode = Array.isArray(data) && data.length ? String(data[0]?.codice || '').trim() : ''
  if (!existingCode) {
    return {
      data: level === 4 ? `${parent} 0001` : `${parent} 01`,
      error: null,
    }
  }

  const lastParts = existingCode.split(' ').filter(Boolean)
  const lastNum = Number.parseInt(lastParts[lastParts.length - 1], 10) || 0
  const padLength = level === 4 ? 4 : 2
  return {
    data: `${parent} ${String(lastNum + 1).padStart(padLength, '0')}`,
    error: null,
  }
}

export async function createImportContabilitaPianoConto(payload) {
  const societaId = normalizeText(payload?.societa_id)
  const codice = normalizeText(payload?.codice)
  const descrizione = normalizeText(payload?.descrizione)
  const codiceConto = normalizeText(payload?.codice_conto)
  const anagraficaTipo = normalizeText(payload?.anagrafica_tipo)
  const mastrinoUi = convertPianoContiParentToMastrino(codiceConto)

  if (!societaId) {
    return { data: null, error: new Error('societa_id obbligatoria per piano_conti') }
  }
  if (!codice) {
    return { data: null, error: new Error('codice obbligatorio per piano_conti') }
  }
  if (!descrizione) {
    return { data: null, error: new Error('descrizione obbligatoria per piano_conti') }
  }
  if (!codiceConto) {
    return { data: null, error: new Error('codice_conto obbligatorio per piano_conti') }
  }
  if (!isAllowedImportContabilitaMastrino(anagraficaTipo, mastrinoUi)) {
    return { data: null, error: new Error('mastrino non ammesso per Import Contabilita') }
  }

  const { note: _ignoredNote, ...payloadWithoutNote } = payload && typeof payload === 'object' ? payload : {}
  const normalizedPayload = {
    ...payloadWithoutNote,
    societa_id: societaId,
    codice,
    codice_mastro: normalizeText(payload?.codice_mastro || '') || null,
    codice_conto: codiceConto,
    codice_sottoconto: normalizeText(payload?.codice_sottoconto || '') || null,
    descrizione,
    tipo: normalizeText(payload?.tipo || 'patrimoniale') || 'patrimoniale',
    natura: normalizeText(payload?.natura || '') || null,
    sezione: normalizeText(payload?.sezione || '') || null,
    livello: Number(payload?.livello || 0) || codice.split(' ').filter(Boolean).length,
    is_cliente: Boolean(payload?.is_cliente),
    is_fornitore: Boolean(payload?.is_fornitore),
    is_professionista: Boolean(payload?.is_professionista),
    anagrafica_tipo: anagraficaTipo || null,
    partita_iva: normalizeText(payload?.partita_iva || '') || null,
    codice_fiscale: normalizeText(payload?.codice_fiscale || '') || null,
    anagrafica_piva: normalizeText(payload?.anagrafica_piva || '') || null,
    anagrafica_cf: normalizeText(payload?.anagrafica_cf || '') || null,
    attivo: payload?.attivo !== false,
  }

  const { data, error } = await sb
    .from('piano_conti')
    .insert([normalizedPayload])
    .select('*')
    .maybeSingle()

  if (error) {
    return { data: null, error }
  }

  return {
    data: normalizePianoContoRow(data),
    error: null,
  }
}

export async function updateImportContabilitaPianoContoAnagrafica(contoId, updates) {
  const id = normalizeText(contoId)
  if (!id) {
    return { data: null, error: new Error('contoId obbligatorio per piano_conti') }
  }

  const sourceUpdates = updates && typeof updates === 'object' ? updates : {}
  const normalizedUpdates = {}
  const setTextIfPresent = (key, value) => {
    const text = normalizeText(value)
    if (!text) return
    normalizedUpdates[key] = text
  }
  const setBooleanIfDefined = (key, value) => {
    if (value === undefined) return
    normalizedUpdates[key] = Boolean(value)
  }

  setTextIfPresent('partita_iva', sourceUpdates.partita_iva ?? sourceUpdates.partitaIva)
  setTextIfPresent('codice_fiscale', sourceUpdates.codice_fiscale ?? sourceUpdates.codiceFiscale)
  setTextIfPresent('anagrafica_piva', sourceUpdates.anagrafica_piva ?? sourceUpdates.anagraficaPiva)
  setTextIfPresent('anagrafica_cf', sourceUpdates.anagrafica_cf ?? sourceUpdates.anagraficaCf)
  setTextIfPresent('descrizione', sourceUpdates.descrizione)
  setBooleanIfDefined('is_cliente', sourceUpdates.is_cliente ?? sourceUpdates.isCliente)
  setBooleanIfDefined('is_fornitore', sourceUpdates.is_fornitore ?? sourceUpdates.isFornitore)
  setBooleanIfDefined('is_professionista', sourceUpdates.is_professionista ?? sourceUpdates.isProfessionista)
  setTextIfPresent('anagrafica_tipo', sourceUpdates.anagrafica_tipo ?? sourceUpdates.anagraficaTipo)

  const allowedKeys = ['partita_iva', 'codice_fiscale', 'anagrafica_piva', 'anagrafica_cf', 'descrizione', 'is_cliente', 'is_fornitore', 'is_professionista', 'anagrafica_tipo']
  Object.keys(normalizedUpdates).forEach((key) => {
    if (!allowedKeys.includes(key)) delete normalizedUpdates[key]
  })

  if (!Object.keys(normalizedUpdates).length) {
    return { data: null, error: new Error('Nessun aggiornamento valido per piano_conti') }
  }

  const { data, error } = await sb
    .from('piano_conti')
    .update(normalizedUpdates)
    .eq('id', id)
    .select('id,codice,descrizione,livello,codice_mastro,codice_conto,codice_sottoconto,tipo,natura,sezione,partita_iva,anagrafica_piva,codice_fiscale,anagrafica_cf,is_fornitore,is_cliente,is_professionista,anagrafica_tipo,is_iva')
    .maybeSingle()

  if (error) {
    return { data: null, error }
  }

  return {
    data: normalizePianoContoRow(data),
    error: null,
  }
}

export async function loadCausaliContabiliBySocieta(societaId) {
  const sid = String(societaId || '').trim()
  if (!sid) return []

  const { data, error } = await sb
    .from('causali_contabili')
    .select('id,codice,descrizione')
    .eq('societa_id', sid)
    .eq('attivo', true)
    .order('codice')

  if (error) throw error

  return Array.isArray(data)
    ? data
        .map((row) => ({
          id: String(row?.id || '').trim(),
          codice: String(row?.codice || '').trim(),
          descrizione: String(row?.descrizione || '').trim(),
        }))
        .filter((row) => row.id && (row.codice || row.descrizione))
    : []
}

export async function loadCausaliIvaBySocieta(societaId) {
  const sid = String(societaId || '').trim()
  const mapRows = (rows) => (Array.isArray(rows)
    ? rows
        .map((row) => ({
          id: String(row?.id || '').trim(),
          codice: String(row?.codice || '').trim(),
          codiceInterno: String(row?.codice_interno || '').trim(),
          descrizione: String(row?.descrizione || '').trim(),
          aliquota: row?.aliquota ?? null,
          detraibile: row?.detraibile ?? null,
          percentualeDetraibilita: row?.percentuale_detraibilita ?? null,
          percentualeIndetraibilita: row?.percentuale_indetraibilita ?? null,
          note: String(row?.note || '').trim(),
          societaId: String(row?.societa_id || '').trim(),
        }))
        .filter((row) => row.id && (row.codice || row.codiceInterno || row.descrizione || row.aliquota != null))
    : [])

  const baseSelect = '*'

  if (!sid) {
    const { data, error } = await sb
      .from('causali_iva')
      .select(baseSelect)
      .eq('attivo', true)
      .order('codice')

    if (error) throw error
    return mapRows(data)
  }

  const { data, error } = await sb
    .from('causali_iva')
    .select(baseSelect)
    .eq('attivo', true)
    .or(`societa_id.eq.${sid},societa_id.is.null`)
    .order('codice')

  if (error) throw error

  const mapped = mapRows(data)
  if (mapped.length) return mapped

  const { data: fallbackData, error: fallbackError } = await sb
    .from('causali_iva')
    .select(baseSelect)
    .eq('attivo', true)
    .order('codice')

  if (fallbackError) throw fallbackError

  return mapRows(fallbackData)
}

export async function loadStaging() {
  notImplemented('loadStaging')
}

export async function saveBatch() {
  notImplemented('saveBatch')
}

export async function saveReport() {
  notImplemented('saveReport')
}

export async function commitRows() {
  notImplemented('commitRows')
}
