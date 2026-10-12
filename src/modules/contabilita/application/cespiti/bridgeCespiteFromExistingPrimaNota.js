/**
 * SG-P3-05: Bridge cespite from an already-posted acquisition Prima Nota.
 * Links beni_ammortizzabili to existing prima_nota_id; never invents a second PN.
 */
import {
  buildCespitePrimaNotaNote,
  extractPrimaNotaIdFromCespiteNote,
  normalizePrimaNotaId,
} from '../../domain/cespiti/cespitePrimaNotaLink.js'
import {
  calculatePianoAmmortamento,
  proposeQuotaAmmortamento,
} from '../../domain/cespiti/calculatePianoAmmortamento.js'

function text(value) {
  return String(value ?? '').trim()
}

function amount(value) {
  const parsed = Number.parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) / 100 : 0
}

async function findExistingBeneByPrimaNotaId(db, primaNotaId) {
  const pnId = normalizePrimaNotaId(primaNotaId)
  if (!db?.from || !pnId) return { data: null, error: null }

  try {
    const { data, error } = await db
      .from('beni_ammortizzabili')
      .select('*')
      .ilike('note', `%ID prima nota: ${pnId}%`)
      .maybeSingle()
    if (error) return { data: null, error }
    if (data && extractPrimaNotaIdFromCespiteNote(data.note) === pnId) {
      return { data, error: null }
    }
    // maybeSingle may return a loose ILIKE hit; filter in-memory if array-like
    return { data: data || null, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

function buildBenePayload({
  primaNotaId,
  source,
  descrizione,
  categoria,
  dataAcquisto,
  costo,
  aliquota,
  clienteId,
  clienteNome,
}) {
  const normalizedAliquota = aliquota > 0 ? aliquota : 20
  const anni = Math.ceil(100 / normalizedAliquota)
  return {
    cliente_id: clienteId || null,
    cliente_nome: clienteNome || '',
    descrizione: descrizione || 'Cespite da registrazione contabile',
    categoria: categoria || 'Attrezzatura',
    data_acquisto: dataAcquisto || '',
    costo_storico: costo,
    aliquota_ammortamento: normalizedAliquota,
    fondo_ammortamento: 0,
    valore_residuo: costo,
    anni_vita_utile: anni,
    note: buildCespitePrimaNotaNote({ source, primaNotaId }),
    attivo: true,
  }
}

/**
 * @returns {Promise<{
 *   linkedPrimaNotaId: string,
 *   created: boolean,
 *   duplicatePrevented: boolean,
 *   skipped: boolean,
 *   reason?: string,
 *   pnCreated: false,
 *   bene: object|null,
 *   payload: object|null,
 *   quotesProposed: object|null,
 *   quotesPersisted: boolean,
 *   error: any
 * }>}
 */
export async function bridgeCespiteFromExistingPrimaNota({
  db,
  primaNotaId,
  source = 'registrazione contabile',
  descrizione = '',
  categoria = 'Attrezzatura',
  dataAcquisto = '',
  costoStorico = 0,
  aliquotaAmmortamento = 20,
  clienteId = null,
  clienteNome = '',
  proposeQuotes = true,
  quoteAnno = null,
  persistQuotes = false,
  /** Hard guard: acquisition bridge must never create Prima Nota */
  allowCreatePrimaNota = false,
} = {}) {
  const pnId = normalizePrimaNotaId(primaNotaId)
  const costo = amount(costoStorico)
  const aliquota = amount(aliquotaAmmortamento) || 20

  if (allowCreatePrimaNota === true) {
    return {
      linkedPrimaNotaId: pnId,
      created: false,
      duplicatePrevented: false,
      skipped: true,
      reason: 'create_pn_forbidden',
      pnCreated: false,
      bene: null,
      payload: null,
      quotesProposed: null,
      quotesPersisted: false,
      error: new Error('SG-P3-05 bridge must not create Prima Nota for cespite acquisition'),
    }
  }

  if (!db?.from || !pnId) {
    return {
      linkedPrimaNotaId: pnId,
      created: false,
      duplicatePrevented: false,
      skipped: true,
      reason: 'missing_required_input',
      pnCreated: false,
      bene: null,
      payload: null,
      quotesProposed: null,
      quotesPersisted: false,
      error: null,
    }
  }

  if (!(costo > 0)) {
    return {
      linkedPrimaNotaId: pnId,
      created: false,
      duplicatePrevented: false,
      skipped: true,
      reason: 'invalid_cost',
      pnCreated: false,
      bene: null,
      payload: null,
      quotesProposed: null,
      quotesPersisted: false,
      error: null,
    }
  }

  const existing = await findExistingBeneByPrimaNotaId(db, pnId)
  if (existing.error) {
    return {
      linkedPrimaNotaId: pnId,
      created: false,
      duplicatePrevented: false,
      skipped: false,
      reason: 'lookup_error',
      pnCreated: false,
      bene: null,
      payload: null,
      quotesProposed: null,
      quotesPersisted: false,
      error: existing.error,
    }
  }

  let bene = existing.data
  let created = false
  let duplicatePrevented = false
  let payload = null

  if (bene) {
    duplicatePrevented = true
  } else {
    payload = buildBenePayload({
      primaNotaId: pnId,
      source,
      descrizione: text(descrizione),
      categoria: text(categoria) || 'Attrezzatura',
      dataAcquisto: text(dataAcquisto),
      costo,
      aliquota,
      clienteId,
      clienteNome: text(clienteNome),
    })

    try {
      const insertQuery = db.from('beni_ammortizzabili').insert([payload])
      const resultPromise = typeof insertQuery?.select === 'function'
        ? insertQuery.select()
        : insertQuery
      const resolved = await resultPromise
      const error = resolved?.error ?? null
      const data = resolved?.data ?? null

      if (error) {
        return {
          linkedPrimaNotaId: pnId,
          created: false,
          duplicatePrevented: false,
          skipped: false,
          reason: 'insert_error',
          pnCreated: false,
          bene: null,
          payload,
          quotesProposed: null,
          quotesPersisted: false,
          error,
        }
      }
      bene = Array.isArray(data) ? (data[0] || { ...payload }) : (data || { ...payload })
      created = true
    } catch (error) {
      return {
        linkedPrimaNotaId: pnId,
        created: false,
        duplicatePrevented: false,
        skipped: false,
        reason: 'insert_error',
        pnCreated: false,
        bene: null,
        payload,
        quotesProposed: null,
        quotesPersisted: false,
        error,
      }
    }
  }

  const quoteSource = bene || payload
  let quotesProposed = null
  if (proposeQuotes && quoteSource) {
    const piano = calculatePianoAmmortamento(quoteSource)
    const single = proposeQuotaAmmortamento(quoteSource, { anno: quoteAnno })
    quotesProposed = {
      piano,
      quota: single.ok ? single.quote : (piano.rows[0] || null),
      createsPrimaNota: false,
    }
  }

  let quotesPersisted = false
  if (persistQuotes && quotesProposed?.piano?.ok && bene?.id && db?.from) {
    try {
      const rows = quotesProposed.piano.rows.map((r) => ({
        bene_id: bene.id,
        anno: r.anno,
        quota_annua: r.quota_annua,
        fondo_progressivo: r.fondo_progressivo,
        valore_residuo: r.valore_residuo,
      }))
      if (rows.length) {
        const { error } = await db.from('quote_ammortamento').upsert(rows, {
          onConflict: 'bene_id,anno',
        })
        if (!error) quotesPersisted = true
      }
    } catch {
      quotesPersisted = false
    }
  }

  return {
    linkedPrimaNotaId: pnId,
    created,
    duplicatePrevented,
    skipped: false,
    pnCreated: false,
    bene,
    payload: payload || (bene ? {
      ...bene,
      note: bene.note,
    } : null),
    quotesProposed,
    quotesPersisted,
    error: null,
  }
}
