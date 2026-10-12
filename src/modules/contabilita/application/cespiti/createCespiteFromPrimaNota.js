import { bridgeCespiteFromExistingPrimaNota } from './bridgeCespiteFromExistingPrimaNota.js'

function normalizeText(value) {
  return String(value ?? '').trim()
}

function resolveSocietaName(societa = {}) {
  return normalizeText(societa?.denominazione || societa?.ragione_sociale || societa?.nome)
}

function resolveCespiteDescription(cespiteMatch = {}, header = {}) {
  const row = cespiteMatch?.row || {}
  return normalizeText(
    row?.descrizione_riga
    || row?.descrizione
    || header?.descrizioneGenerale
    || header?.descrizione_generale
    || 'Cespite da registrazione contabile'
  )
}

function resolveCespiteCost(cespiteMatch = {}) {
  const row = cespiteMatch?.row || {}
  const raw = row?.dare || row?.avere || 0
  const value = Number(raw)
  return Number.isFinite(value) ? Math.abs(value) : 0
}

async function resolveClienteForCespite(db, societa = {}) {
  const fallback = {
    id: normalizeText(societa?.id),
    nome: resolveSocietaName(societa),
  }
  const partitaIva = normalizeText(societa?.partita_iva || societa?.partitaIva)
  if (!db?.from || !partitaIva) return fallback

  try {
    const { data, error } = await db
      .from('clienti')
      .select('id, ragione_sociale, nome, cognome')
      .eq('partita_iva', partitaIva)
      .maybeSingle()

    if (error || !data) return fallback
    return {
      id: normalizeText(data?.id) || fallback.id,
      nome: normalizeText(data?.ragione_sociale || [data?.nome, data?.cognome].filter(Boolean).join(' ')) || fallback.nome,
    }
  } catch {
    return fallback
  }
}

/**
 * Post-persist Manuale: bridge scheda cespite to existing prima_nota_id (no second PN).
 */
export async function createCespiteFromManualRegistration({
  db,
  societa,
  primaNotaId,
  cespiteMatch,
  header = {},
  fallbackDate = '',
  aliquotaAmmortamento = 20,
  proposeQuotes = true,
} = {}) {
  const pnId = normalizeText(primaNotaId)
  if (!db?.from || !pnId || !cespiteMatch?.row) {
    return {
      data: null,
      error: null,
      skipped: true,
      reason: 'missing_required_input',
      pnCreated: false,
    }
  }

  const costo = resolveCespiteCost(cespiteMatch)
  if (!(costo > 0)) {
    return {
      data: null,
      error: null,
      skipped: true,
      reason: 'invalid_cost',
      pnCreated: false,
    }
  }

  const cliente = await resolveClienteForCespite(db, societa)
  const bridge = await bridgeCespiteFromExistingPrimaNota({
    db,
    primaNotaId: pnId,
    source: 'registrazione contabile',
    descrizione: resolveCespiteDescription(cespiteMatch, header),
    categoria: 'Attrezzatura',
    dataAcquisto: normalizeText(
      header?.dataDocumento
      || header?.data_documento
      || header?.dataRegistrazione
      || header?.data_registrazione
      || fallbackDate
    ),
    costoStorico: costo,
    aliquotaAmmortamento,
    clienteId: cliente.id,
    clienteNome: cliente.nome,
    proposeQuotes,
  })

  return {
    data: bridge.bene,
    error: bridge.error,
    skipped: bridge.skipped,
    reason: bridge.reason,
    payload: bridge.payload,
    created: bridge.created,
    duplicatePrevented: bridge.duplicatePrevented,
    linkedPrimaNotaId: bridge.linkedPrimaNotaId,
    pnCreated: false,
    quotesProposed: bridge.quotesProposed,
  }
}
