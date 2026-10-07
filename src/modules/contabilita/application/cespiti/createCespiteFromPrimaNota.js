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

export async function createCespiteFromManualRegistration({
  db,
  societa,
  primaNotaId,
  cespiteMatch,
  header = {},
  fallbackDate = '',
  aliquotaAmmortamento = 20,
} = {}) {
  const pnId = normalizeText(primaNotaId)
  if (!db?.from || !pnId || !cespiteMatch?.row) {
    return {
      data: null,
      error: null,
      skipped: true,
      reason: 'missing_required_input',
    }
  }

  const costo = resolveCespiteCost(cespiteMatch)
  if (!(costo > 0)) {
    return {
      data: null,
      error: null,
      skipped: true,
      reason: 'invalid_cost',
    }
  }

  const aliquota = Number(aliquotaAmmortamento)
  const normalizedAliquota = Number.isFinite(aliquota) && aliquota > 0 ? aliquota : 20
  const anni = Math.ceil(100 / normalizedAliquota)
  const cliente = await resolveClienteForCespite(db, societa)

  const payload = {
    cliente_id: cliente.id,
    cliente_nome: cliente.nome,
    descrizione: resolveCespiteDescription(cespiteMatch, header),
    categoria: 'Attrezzatura',
    data_acquisto: normalizeText(header?.dataDocumento || header?.data_documento || header?.dataRegistrazione || header?.data_registrazione || fallbackDate),
    costo_storico: costo,
    aliquota_ammortamento: normalizedAliquota,
    fondo_ammortamento: 0,
    valore_residuo: costo,
    anni_vita_utile: anni,
    note: `Cespite inserito automaticamente da registrazione contabile. ID prima nota: ${pnId}`,
    attivo: true,
  }

  try {
    const { data, error } = await db.from('beni_ammortizzabili').insert([payload]).select?.() ?? {}
    if (error) return { data: null, error, skipped: false, payload }
    return { data: data ?? null, error: null, skipped: false, payload }
  } catch (error) {
    return { data: null, error, skipped: false, payload }
  }
}
