import { sb } from '../../../lib/supabase.js'
import {
  createPrimaNota,
  insertPrimaNotaRighe as insertPrimaNotaRigheService,
  insertPrimaNotaPartitario as insertPrimaNotaPartitarioService,
  deletePrimaNotaById,
} from '../../../../services/primaNotaService.js'
import { syncPercipienteFromDocumentoContabilita } from '../application/percipientiRegistryService.js'

export function normalizeUuidOrNull(value) {
  const text = String(value ?? '').trim()
  if (!text) return null
  const lowered = text.toLowerCase()
  if (lowered === 'null' || lowered === '__none__' || lowered === 'undefined') return null
  return text
}

function normalizeOptionalUuidFields(payload = {}) {
  const next = { ...(payload || {}) }
  for (const [key, value] of Object.entries(next)) {
    if (key === 'societa_id') continue
    if (/_id$/.test(key)) next[key] = normalizeUuidOrNull(value)
  }
  return next
}

function ensureUpdatedRow(result) {
  if (result?.error) throw result.error
  if (!result?.data) {
    throw new Error('Nessuna anagrafica aggiornata: verifica id record o permessi RLS.')
  }
  return result
}

export function getSocietaAttive() {
  return sb.from('societa').select('*').eq('attiva', true).order('denominazione')
}

export async function getPianoConti(societaId) {
  const PAGE = 1000
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await sb
      .from('piano_conti')
      .select('*')
      .eq('societa_id', societaId)
      .eq('attivo', true)
      .order('codice')
      .range(from, from + PAGE - 1)
    if (error) throw error
    all = [...all, ...(data || [])]
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return { data: all, error: null }
}

export function getDocumenti(societaId) {
  return sb
    .from('documenti_contabilita')
    .select('*')
    .eq('societa_id', societaId)
    .order('created_at', { ascending: false })
}

export function getArchivioStoricoAiDocumenti(societaIds = [], { limit = 5000 } = {}) {
  const ids = Array.from(new Set((Array.isArray(societaIds) ? societaIds : []).map((id) => String(id || '').trim()).filter(Boolean)))
  const select = 'id,societa_id,numero_documento,data_documento,tipo_documento,soggetto_denominazione,soggetto_piva,soggetto_cf,validation_status,workflow_status,conto_id,imponibile,iva,totale,causale_iva,causale_iva_codice,source_document_id,dati_estratti,created_at'

  if (!ids.length) {
    return Promise.resolve({ data: [], error: null })
  }

  return Promise.all(
    ids.map(async (societaId) => {
      const { data, error } = await sb
        .from('documenti_contabilita')
        .select(select)
        .eq('societa_id', societaId)
        .limit(limit)
      if (error) throw error
      return Array.isArray(data) ? data : []
    })
  )
    .then((chunks) => {
      const merged = []
      const seen = new Set()
      for (const chunk of chunks) {
        for (const row of chunk || []) {
          const key = String(row?.id || '')
          if (!key || seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
      }
      merged.sort((a, b) => {
        const da = String(a?.data_documento || '')
        const db = String(b?.data_documento || '')
        if (db !== da) return db.localeCompare(da)
        const ca = String(a?.created_at || '')
        const cb = String(b?.created_at || '')
        return cb.localeCompare(ca)
      })
      return { data: merged.slice(0, limit), error: null }
    })
    .catch((error) => ({ data: [], error }))
}

export function getArchivioStoricoAiLearning(societaIds = [], { limit = 5000 } = {}) {
  const ids = Array.from(new Set((Array.isArray(societaIds) ? societaIds : []).map((id) => String(id || '').trim()).filter(Boolean)))
  const select = 'id,societa_id,anagrafica_id,conto_id,frequenza,confidence_score,ultimo_utilizzo,created_at'

  if (!ids.length) {
    return Promise.resolve({ data: [], error: null })
  }

  return Promise.all(
    ids.map(async (societaId) => {
      const { data, error } = await sb
        .from('ai_learning')
        .select(select)
        .eq('societa_id', societaId)
        .limit(limit)
      if (error) throw error
      return Array.isArray(data) ? data : []
    })
  )
    .then((chunks) => {
      const merged = []
      const seen = new Set()
      for (const chunk of chunks) {
        for (const row of chunk || []) {
          const key = String(row?.id || '')
          if (!key || seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
      }
      merged.sort((a, b) => {
        const cb = Number(b?.confidence_score || 0)
        const ca = Number(a?.confidence_score || 0)
        if (cb !== ca) return cb - ca
        const fb = Number(b?.frequenza || 0)
        const fa = Number(a?.frequenza || 0)
        if (fb !== fa) return fb - fa
        const ub = String(b?.ultimo_utilizzo || '')
        const ua = String(a?.ultimo_utilizzo || '')
        return ub.localeCompare(ua)
      })
      return { data: merged.slice(0, limit), error: null }
    })
    .catch((error) => ({ data: [], error }))
}

export function getSocietaByIds(ids = []) {
  const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)))
  if (!cleanIds.length) return Promise.resolve({ data: [], error: null })
  return Promise.all(
    cleanIds.map(async (id) => {
      const { data, error } = await sb.from('societa').select('id,denominazione,codice,attiva').eq('id', id).limit(1)
      if (error) throw error
      return Array.isArray(data) ? data : []
    })
  )
    .then((chunks) => {
      const merged = []
      const seen = new Set()
      for (const chunk of chunks) {
        for (const row of chunk || []) {
          const key = String(row?.id || '')
          if (!key || seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
      }
      merged.sort((a, b) => String(a?.denominazione || '').localeCompare(String(b?.denominazione || ''), 'it'))
      return { data: merged, error: null }
    })
    .catch((error) => ({ data: [], error }))
}

export function getPianoContiBySocietaIds(ids = []) {
  const cleanIds = Array.from(new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean)))
  const select = 'id,societa_id,codice,descrizione,partita_iva,anagrafica_piva,anagrafica_cf,is_cliente,is_fornitore,is_professionista,livello,attivo'
  if (!cleanIds.length) return Promise.resolve({ data: [], error: null })
  return Promise.all(
    cleanIds.map(async (societaId) => {
      const { data, error } = await sb
        .from('piano_conti')
        .select(select)
        .eq('societa_id', societaId)
        .eq('attivo', true)
        .limit(3000)
      if (error) throw error
      return Array.isArray(data) ? data : []
    })
  )
    .then((chunks) => {
      const merged = []
      const seen = new Set()
      for (const chunk of chunks) {
        for (const row of chunk || []) {
          const key = String(row?.id || '')
          if (!key || seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
      }
      merged.sort((a, b) => String(a?.codice || '').localeCompare(String(b?.codice || ''), 'it'))
      return { data: merged, error: null }
    })
    .catch((error) => ({ data: [], error }))
}

export function getDocumentiContabilitaBySoggettoPiva(piva) {
  return sb
    .from('documenti_contabilita')
    .select('id, numero_documento, data_documento, totale, tipo_documento, soggetto_piva, soggetto_cf, soggetto_denominazione')
    .order('data_documento', { ascending: false })
    .limit(60)
    .eq('soggetto_piva', piva)
}

export function getDocumentiContabilitaBySoggettoCf(cf) {
  return sb
    .from('documenti_contabilita')
    .select('id, numero_documento, data_documento, totale, tipo_documento, soggetto_piva, soggetto_cf, soggetto_denominazione')
    .order('data_documento', { ascending: false })
    .limit(60)
    .eq('soggetto_cf', cf)
}

export function getCausali(societaId) {
  return sb
    .from('causali_contabili')
    .select('*')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .order('codice')
    .limit(2000)
}

export function getCausaliIvaAttive() {
  return sb.from('causali_iva').select('*').eq('attivo', true).order('codice', { ascending: true }).limit(2000)
}

export function getRegoleAutomatiche(societaId) {
  return sb.from('regole_automatiche').select('*').eq('societa_id', societaId).eq('attiva', true).order('priorita')
}

export function getScrittureRecenti(societaId) {
  return sb
    .from('prima_nota')
    .select('*')
    .eq('societa_id', societaId)
    .order('numero_registrazione', { ascending: false })
    .limit(100)
}

export function getPrimaNotaConsultazioneRows(
  societaId,
  {
    dateFrom = null,
    dateTo = null,
    contoIds = [],
    causaliContabili = [],
    causaliIva = [],
  } = {}
) {
  return sb
    .from('prima_nota')
    .select('id, societa_id, numero_registrazione, data_registrazione, data_documento, numero_documento, causale_codice, causale_iva_codice, descrizione, cliente_fornitore_id, cliente_fornitore_nome, stato')
    .eq('societa_id', societaId)
    .gte('data_registrazione', dateFrom || '0001-01-01')
    .lte('data_registrazione', dateTo || '9999-12-31')
    .then(async ({ data: headers, error }) => {
      if (error) return { data: [], error }
      const headerList = Array.isArray(headers) ? headers : []
      const headerById = new Map(headerList.map((h) => [String(h.id), h]))
      const pnIds = headerList.map((h) => h.id).filter(Boolean)
      if (!pnIds.length) return { data: [], error: null }

      const rowsRes = await sb
        .from('prima_nota_righe')
        .select('id, riga_numero, prima_nota_id, conto_id, conto_codice, conto_descrizione, descrizione_riga, dare, avere, importo_dare, importo_avere, causale_iva_codice, tipo_riga_auto, iva_row_id')
        .in('prima_nota_id', pnIds)

      if (rowsRes.error) return { data: [], error: rowsRes.error }

      const rows = (rowsRes.data || [])
        .map((r) => {
          const pn = headerById.get(String(r.prima_nota_id)) || null
          if (!pn) return null
          return {
            id: r.id,
            riga_numero: r.riga_numero,
            conto_id: r.conto_id,
            conto_codice: r.conto_codice,
            conto_descrizione: r.conto_descrizione,
            descrizione_riga: r.descrizione_riga,
            dare: r.dare,
            avere: r.avere,
            importo_dare: r.importo_dare,
            importo_avere: r.importo_avere,
            causale_iva_codice: r.causale_iva_codice || pn.causale_iva_codice || '',
            tipo_riga_auto: r.tipo_riga_auto,
            iva_row_id: r.iva_row_id,
            prima_nota: pn,
          }
        })
        .filter(Boolean)
        .filter((r) => {
          if (Array.isArray(contoIds) && contoIds.length > 0 && !contoIds.includes(r.conto_id)) return false
          if (Array.isArray(causaliContabili) && causaliContabili.length > 0 && !causaliContabili.includes(r.prima_nota?.causale_codice)) return false
          if (Array.isArray(causaliIva) && causaliIva.length > 0 && !causaliIva.includes(r.causale_iva_codice)) return false
          return true
        })
        .sort((a, b) => {
          const da = String(a.prima_nota?.data_registrazione || '')
          const db = String(b.prima_nota?.data_registrazione || '')
          if (da !== db) return da.localeCompare(db)
          const na = Number(a.prima_nota?.numero_registrazione || 0)
          const nb = Number(b.prima_nota?.numero_registrazione || 0)
          if (na !== nb) return na - nb
          return Number(a.riga_numero || 0) - Number(b.riga_numero || 0)
        })

      return { data: rows.slice(0, 10000), error: null }
    })
}

export function getAccountingEntriesByDocumentId(documentId) {
  return sb
    .from('accounting_entries')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(5)
}

export function getHistoricalConfirmedDocumentsForCounterparty({ piva = '', cf = '', nomeLike = '', limit = 80 } = {}) {
  const select = 'id, societa_id, conto_id, numero_documento, data_documento, tipo_documento, soggetto_denominazione, soggetto_piva, soggetto_cf, causale_iva, causale_iva_codice, validation_status, created_at'
  const base = sb
    .from('documenti_contabilita')
    .select(select)

  const queries = []
  if (piva) {
    queries.push(base.eq('soggetto_piva', piva))
  }
  if (cf) {
    queries.push(base.eq('soggetto_cf', cf))
  }
  if (!queries.length && nomeLike) {
    queries.push(base.ilike('soggetto_denominazione', `%${String(nomeLike).slice(0, 24)}%`))
  }
  if (!queries.length) return Promise.resolve({ data: [], error: null })

  return Promise.all(
    queries.map(async (q) => {
      const { data, error } = await q.limit(limit)
      if (error) throw error
      return Array.isArray(data) ? data : []
    })
  )
    .then((chunks) => {
      const merged = []
      const seen = new Set()
      for (const chunk of chunks) {
        for (const row of chunk || []) {
          if (String(row?.validation_status || '').toLowerCase() !== 'confirmed') continue
          if (String(row?.conto_id || '').trim() === '') continue
          const key = String(row?.id || '')
          if (!key || seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
      }
      merged.sort((a, b) => String(b?.data_documento || '').localeCompare(String(a?.data_documento || '')))
      return { data: merged.slice(0, limit), error: null }
    })
    .catch((error) => ({ data: [], error }))
}

export function insertAccountingEntry(payload) {
  return sb.from('accounting_entries').insert([payload]).select().maybeSingle()
}

export function getPercipientiAttivi(societaId) {
  return sb.from('percipienti').select('*').eq('societa_id', societaId).eq('attivo', true).order('ragione_sociale')
}

export function getPercipientiBySocieta(societaId) {
  return sb.from('percipienti').select('*').eq('societa_id', societaId).order('ragione_sociale')
}

export function getClientiBase() {
  return sb
    .from('clienti')
    .select('id,codice_cliente,nome,cognome,ragione_sociale,codice_fiscale,partita_iva')
    .eq('attivo', true)
    .order('codice_cliente')
}

export function confirmDocumento(docId, validatedAt) {
  return sb
    .from('documenti_contabilita')
    .update({ validation_status: 'confirmed', validated_at: validatedAt })
    .eq('id', docId)
}

export function insertPrimaNota(payload) {
  return createPrimaNota({ db: sb, pnPayload: payload, headerSelect: '*' })
}

export function insertPrimaNotaRighe(righe) {
  return insertPrimaNotaRigheService({ db: sb, righePayload: righe, righeSelect: '*' })
}

export function insertPrimaNotaPartitario(rows) {
  return insertPrimaNotaPartitarioService({ db: sb, partEntries: rows, partitarioSelect: '*' })
}

export function updateDocumentoContabilita(id, updates) {
  return sb.from('documenti_contabilita').update(updates).eq('id', id)
}

export function deleteDocumentoContabilita(id) {
  return sb.from('documenti_contabilita').delete().eq('id', id)
}

export function insertSocieta(payload) {
  return sb.from('societa').insert([payload]).select().single()
}

export function updateSocieta(id, updates) {
  return sb.from('societa').update(updates).eq('id', id).select().single()
}

export function getImpostazioneStudio(chiave) {
  return sb.from('impostazioni_studio').select('chiave,valore').eq('chiave', chiave)
}

export function getImpostazioneStudioValore(chiave) {
  return sb.from('impostazioni_studio').select('valore').eq('chiave', chiave)
}

export function insertDocumentoContabilita(payload) {
  return sb
    .from('documenti_contabilita')
    .insert([payload])
    .select()
    .then(async (res) => {
      if (!res.error && res.data?.[0]) {
        try {
          await syncPercipienteFromDocumentoContabilita(res.data[0])
        } catch (e) {
          console.warn('[Percipienti sync] contabilitaRepo', e?.message || e)
        }
      }
      return res
    })
}

export function uploadDocumento(filePath, file) {
  return sb.storage.from('documenti').upload(filePath, file)
}

export function getDocumentoPublicUrl(filePath) {
  return sb.storage.from('documenti').getPublicUrl(filePath)
}

export function getPianoContiCodiciByLike(societaId, parent) {
  return sb
    .from('piano_conti')
    .select('codice')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .like('codice', parent + ' %')
}

export async function getPianoContoById(id) {
  const cleanId = String(id || '').trim()
  if (!cleanId) {
    throw new Error('Id anagrafica mancante.')
  }
  const { data, error } = await sb
    .from('piano_conti')
    .select('*')
    .eq('id', cleanId)
    .single()
  if (error) throw error
  if (!data) {
    throw new Error('Anagrafica non trovata.')
  }
  return data
}

export function replacePianoContoInList(list = [], updatedConto = null) {
  const updatedId = String(updatedConto?.id || '').trim()
  if (!updatedId) return Array.isArray(list) ? [...list] : []
  return (Array.isArray(list) ? list : []).map((row) => (
    String(row?.id || '').trim() === updatedId ? { ...row, ...updatedConto } : row
  ))
}

export function updatePianoConto(id, updates) {
  const { note, ...safeUpdates } = updates || {}
  return sb
    .from('piano_conti')
    .update(normalizeOptionalUuidFields(safeUpdates))
    .eq('id', id)
    .select('*')
    .single()
    .then(ensureUpdatedRow)
}

export function updatePianoContoByCodiceSocieta(updates, codice, societaId) {
  const { note, ...safeUpdates } = updates || {}
  return sb
    .from('piano_conti')
    .update(normalizeOptionalUuidFields(safeUpdates))
    .eq('codice', codice)
    .eq('societa_id', societaId)
    .select('*')
    .single()
    .then(ensureUpdatedRow)
}

export function bulkDeactivatePianoConti(ids) {
  return sb.from('piano_conti').update({ attivo: false }).in('id', ids)
}

export function insertPianoConto(payload) {
  const { note, ...safePayload } = payload || {}
  return sb.from('piano_conti').insert([normalizeOptionalUuidFields(safePayload)]).select('*').maybeSingle()
}

export function getPianoContiBasic(societaId) {
  return sb
    .from('piano_conti')
    .select('id,codice,descrizione,livello')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .order('codice')
    .limit(3000)
}

export function getCausaliIvaBasic() {
  return sb.from('causali_iva').select('id,codice,descrizione,aliquota').eq('attivo', true).order('codice').limit(200)
}

export function bulkDeactivateCausali(table, ids) {
  return sb.from(table).update({ attivo: false }).in('id', ids)
}

export async function getCausaleById(table, id) {
  if (!table || !id) return { data: null, error: null }
  const { data, error } = await sb.from(table).select('*').eq('id', id).limit(1).maybeSingle()
  return { data: data || null, error: error || null }
}

export function updateCausale(table, id, updates) {
  return sb.from(table).update(updates).eq('id', id)
}

export function insertCausale(table, row) {
  return sb.from(table).insert([row])
}

export function getFatturaXmlByFilename(filename) {
  return sb.from('fatture_xml').select('xml_content').eq('filename', filename).limit(1)
}

export function deletePrimaNota(id) {
  return deletePrimaNotaById({ db: sb, primaNotaId: id })
}

export function getAiInsights(societaId) {
  return sb
    .from('ai_insights')
    .select('id,societa_id,tipo,titolo,descrizione,gravita,entity_ref,fingerprint,created_at,seen_at,resolved_at')
    .eq('societa_id', societaId)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(80)
}

export function markAiInsightSeen(rowId, societaId, now) {
  return sb.from('ai_insights').update({ seen_at: now }).eq('id', rowId).eq('societa_id', societaId)
}

export function markAiInsightResolved(rowId, societaId, now) {
  return sb.from('ai_insights').update({ resolved_at: now }).eq('id', rowId).eq('societa_id', societaId)
}

export function getSocietaAttiveBasic() {
  return sb.from('societa').select('id,denominazione,codice').eq('attiva', true).order('denominazione')
}

export function getClientiAttiviCompleti() {
  return sb.from('clienti').select('*').eq('attivo', true).order('ragione_sociale')
}

export function getPianoContiSource(sourceSocietaId) {
  return sb.from('piano_conti').select('*').eq('societa_id', sourceSocietaId).eq('attivo', true)
}

export function getCausaliContabiliSource(sourceSocietaId) {
  return sb.from('causali_contabili').select('*').eq('societa_id', sourceSocietaId).eq('attivo', true)
}

export function getCausaliIvaSource(sourceSocietaId) {
  return sb.from('causali_iva').select('*').eq('societa_id', sourceSocietaId).eq('attivo', true)
}

export function insertBatch(table, rows) {
  return sb.from(table).insert(rows)
}

export function getCodiciEsistenti(table, societaId) {
  return sb.from(table).select('codice').eq('societa_id', societaId).eq('attivo', true)
}

export function upsertBatch(table, rows) {
  return sb.from(table).upsert(rows, { onConflict: 'societa_id,codice', ignoreDuplicates: false })
}

export function getContiBancari(societaId) {
  return sb.from('conti_bancari').select('*').eq('societa_id', societaId).order('nome')
}

export function getMovimentiBancariRecenti(societaId) {
  return sb
    .from('movimenti_bancari')
    .select('*')
    .eq('societa_id', societaId)
    .order('data_operazione', { ascending: false })
    .limit(200)
}

export function getPartitarioAperto(societaId) {
  return sb.from('partitario').select('*').eq('societa_id', societaId).eq('stato', 'aperta')
}

export function getPartitarioBySocieta(societaId, { stato = null } = {}) {
  let q = sb.from('partitario').select('*').eq('societa_id', societaId).order('data_scadenza', { ascending: true })
  if (stato) q = q.eq('stato', stato)
  return q
}

export function getPartitarioByPrimaNotaId(primaNotaId) {
  return sb.from('partitario').select('id').eq('prima_nota_id', primaNotaId).limit(1)
}

export async function getIvaPerCassaPreviewData(partitaIds = []) {
  const ids = Array.from(new Set(
    (Array.isArray(partitaIds) ? partitaIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  ))
  if (!ids.length) return { data: { originalVatRows: [], releasedVatRows: [] }, error: null }

  try {
    const { data: partite, error: partiteError } = await sb
      .from('partitario')
      .select('id, prima_nota_id')
      .in('id', ids)
    if (partiteError) throw partiteError

    const partitaByPrimaNotaId = new Map(
      (partite || [])
        .filter((row) => row?.prima_nota_id)
        .map((row) => [String(row.prima_nota_id), String(row.id)])
    )
    const primaNotaIds = Array.from(partitaByPrimaNotaId.keys())
    if (!primaNotaIds.length) return { data: { originalVatRows: [], releasedVatRows: [] }, error: null }

    const { data: originalRows, error: originalError } = await sb
      .from('registri_iva')
      .select('*')
      .in('prima_nota_id', primaNotaIds)
      .eq('esigibilita', 'differita')
      .is('origin_registro_iva_id', null)
    if (originalError) throw originalError

    const originalVatRows = (originalRows || []).map((row) => ({
      ...row,
      partita_id: partitaByPrimaNotaId.get(String(row.prima_nota_id)) || null,
    }))
    const originIds = originalVatRows.map((row) => row.id).filter(Boolean)
    if (!originIds.length) return { data: { originalVatRows, releasedVatRows: [] }, error: null }

    const { data: releasedVatRows, error: releasedError } = await sb
      .from('registri_iva')
      .select('*')
      .in('origin_registro_iva_id', originIds)
      .eq('esigibilita', 'rilascio')
    if (releasedError) throw releasedError

    return {
      data: {
        originalVatRows,
        releasedVatRows: releasedVatRows || [],
      },
      error: null,
    }
  } catch (error) {
    console.error('[getIvaPerCassaPreviewData] Error:', error)
    return { data: { originalVatRows: [], releasedVatRows: [] }, error }
  }
}

export function insertPartitario(payload) {
  return sb.from('partitario').insert([payload]).select().single()
}

export function insertContoBancario(payload) {
  return sb.from('conti_bancari').insert([payload])
}

export function updateContoBancario(id, updates) {
  return sb.from('conti_bancari').update(updates).eq('id', id)
}

export function upsertMovimentoBancario(payload) {
  return sb.from('movimenti_bancari').upsert(payload, { onConflict: 'conto_bancario_id,transaction_id' })
}

export function updateMovimentoBancario(id, updates) {
  return sb.from('movimenti_bancari').update(updates).eq('id', id)
}

export function updatePartitario(id, updates) {
  return sb.from('partitario').update(updates).eq('id', id)
}

export function getLiquidazioniIvaSocieta(societaId) {
  return sb.from('liquidazioni_iva_societa').select('*').eq('societa_id', societaId).order('anno', { ascending: false }).order('periodo', { ascending: false })
}

export function insertLiquidazioneIvaSocieta(record) {
  return sb.from('liquidazioni_iva_societa').insert([record])
}

export function getLiquidazioniIvaTrimestrali(societaId) {
  return sb
    .from('liquidazioni_iva_societa')
    .select('*')
    .eq('societa_id', societaId)
    .eq('tipo_periodo', 'trimestrale')
    .order('anno', { ascending: false })
    .order('periodo', { ascending: false })
}

export function getLiquidazioniIvaCanoniche(societaId) {
  return sb
    .from('liquidazione_iva')
    .select('*')
    .eq('societa_id', societaId)
    .order('periodo_fine', { ascending: false })
    .limit(200)
}

export async function getLiquidazioniIvaCanonicheByPeriodicita(societaId, periodicita) {
  return sb
    .from('liquidazione_iva')
    .select('*')
    .eq('societa_id', societaId)
    .eq('periodicita', periodicita)
    .order('periodo_fine', { ascending: false })
    .limit(200)
}

export async function upsertLiquidazioneIvaCanonica(row) {
  const per = row?.periodicita
  const anno = row?.anno
  const societaId = row?.societa_id
  if (!societaId || !per || !anno) return { data: null, error: new Error('societa_id/periodicita/anno mancanti') }
  let sel = sb.from('liquidazione_iva').select('id').eq('societa_id', societaId).eq('periodicita', per).eq('anno', anno)
  if (per === 'mensile') {
    sel = sel.eq('mese', row?.mese || null).is('trimestre', null)
  } else {
    sel = sel.eq('trimestre', row?.trimestre || null).is('mese', null)
  }
  const { data: existing } = await sel.maybeSingle()
  if (existing?.id) {
    return sb.from('liquidazione_iva').update(row).eq('id', existing.id).select('*').maybeSingle()
  }
  return sb.from('liquidazione_iva').insert([row]).select('*').maybeSingle()
}

export async function getRegistriIvaByPeriodo(societaId, periodo_inizio, periodo_fine) {
  const { data: rows, error: rowsError } = await sb
    .from('registri_iva')
    .select('id, societa_id, tipo, imponibile, iva, iva_detraibile, iva_indetraibile, aliquota, data, esigibilita, split_payment, prima_nota_id, causale_iva_id')
    .eq('societa_id', societaId)
    .gte('data', periodo_inizio)
    .lte('data', periodo_fine)

  if (rowsError || !rows) return { data: [], error: rowsError }

  const causaleIvaIds = Array.from(new Set(rows.map(r => r.causale_iva_id).filter(Boolean)))
  let causaliMap = new Map()
  if (causaleIvaIds.length > 0) {
    const query = sb.from('causali_iva').select('*')
    if (typeof query.in === 'function') {
      const { data: causali, error: causaliError } = await query.in('id', causaleIvaIds)
      if (!causaliError && causali) {
        for (const c of causali) {
          causaliMap.set(c.id, c)
        }
      }
    }
  }

  const flattened = rows.map((row) => {
    const causale = (row.causale_iva_id ? causaliMap.get(row.causale_iva_id) : null) || row.causali_iva
    return {
      ...row,
      reverse_charge: causale?.reverse_charge || false,
      natura: causale?.codice_natura_fe !== undefined ? causale.codice_natura_fe : (causale?.natura || null),
      causale_codice: causale?.codice || row.causale_codice || '',
      causale_descrizione: causale?.descrizione || row.causale_descrizione || '',
    }
  })

  return { data: flattened, error: null }
}

export function getLiquidazioneIvaByPeriodo({ societaId, periodoInizio, periodoFine }) {
  return sb
    .from('liquidazione_iva')
    .select('*')
    .eq('societa_id', societaId)
    .eq('periodo_inizio', periodoInizio)
    .eq('periodo_fine', periodoFine)
    .limit(1)
    .maybeSingle()
}

export function getRigheLiquidazioneIvaSnapshot(liquidazioneId) {
  return sb
    .from('liquidazioni_iva_righe')
    .select('*')
    .eq('liquidazione_id', liquidazioneId)
    .order('tipo_riga', { ascending: true })
}

export async function consolidaLiquidazioneIvaDefinitiva({
  societaId,
  periodoInizio,
  periodoFine,
  tipoPeriodicita,
  operatoreStudioId,
  motivo = 'Consolidamento liquidazione IVA definitiva',
  payloadCalcolo,
}) {
  const { data, error } = await sb.rpc('consolida_periodo_iva_transazionale', {
    p_societa_id: societaId,
    p_periodo_inizio: periodoInizio,
    p_periodo_fine: periodoFine,
    p_tipo_periodicita: tipoPeriodicita,
    p_operatore_studio_id: operatoreStudioId,
    p_motivo: motivo,
    p_payload_calcolo: payloadCalcolo,
  })
  return { data, error }
}

export function getCorrispettiviGiornalieri(societaId, inizioMese, fineMese) {
  return sb
    .from('corrispettivi_giornalieri')
    .select('*')
    .eq('societa_id', societaId)
    .gte('data', inizioMese)
    .lte('data', fineMese)
    .order('data', { ascending: true })
}

export function insertCorrispettivoGiornaliero(record) {
  return sb.from('corrispettivi_giornalieri').insert([record])
}

export function getRitenuteByAnnoPerPercipiente(societaId, annoSel) {
  return sb
    .from('ritenute_dacconto')
    .select('*')
    .eq('societa_id', societaId)
    .gte('data_pagamento', `${annoSel}-01-01`)
    .lte('data_pagamento', `${annoSel}-12-31`)
    .order('percipiente_denominazione')
}

export function getIntrastatOperazioni(societaId, tipo, inizioMese, fineMese) {
  return sb
    .from('intrastat_operazioni')
    .select('*')
    .eq('societa_id', societaId)
    .eq('tipo', tipo)
    .gte('data', inizioMese)
    .lte('data', fineMese)
    .order('data', { ascending: false })
}

export function insertIntrastatOperazione(record) {
  return sb.from('intrastat_operazioni').insert([record])
}

export function getLiquidazioniIvaByAnno(societaId, annoSel) {
  return sb.from('liquidazioni_iva_societa').select('*').eq('societa_id', societaId).eq('anno', annoSel).order('periodo')
}

export function updatePercipiente(id, record) {
  return sb.from('percipienti').update(record).eq('id', id)
}

export function insertPercipiente(record) {
  return sb.from('percipienti').insert([record])
}

export function deactivatePercipiente(id) {
  return sb.from('percipienti').update({ attivo: false }).eq('id', id)
}

export function deletePercipiente(id) {
  return sb.from('percipienti').delete().eq('id', id)
}

export function getRitenuteByAnnoPerData(societaId, annoSel) {
  return sb
    .from('ritenute_dacconto')
    .select('*')
    .eq('societa_id', societaId)
    .gte('data_pagamento', `${annoSel}-01-01`)
    .lte('data_pagamento', `${annoSel}-12-31`)
    .order('data_pagamento', { ascending: false })
}

export function getRitenuteDaMaturare(societaId) {
  return sb
    .from('ritenute_dacconto')
    .select('*')
    .eq('societa_id', societaId)
    .in('stato', ['aperta', 'predisposta'])
    .order('data_documento', { ascending: true })
}

export function insertRitenuta(record) {
  return sb.from('ritenute_dacconto').insert([record]).select().single()
}

export function deleteRitenuta(id) {
  return sb.from('ritenute_dacconto').delete().eq('id', id)
}

// --- FASE 1.3: CONSULTAZIONE, STORNI E RETTIFICHE ---

export async function isIvaPeriodLiquidated(societaId, dataRegistrazioneStr) {
  if (!dataRegistrazioneStr) return false
  const date = new Date(dataRegistrazioneStr)
  if (isNaN(date.getTime())) return false
  const dateStr = dataRegistrazioneStr.slice(0, 10)

  const { data, error } = await sb
    .from('liquidazione_iva')
    .select('id')
    .eq('societa_id', societaId)
    .eq('stato', 'definitiva')
    .lte('periodo_inizio', dateStr)
    .gte('periodo_fine', dateStr)
    .limit(1)

  if (error || !data || data.length === 0) return false
  return true
}

export async function findPianoContoByCodice(societaId, codice) {
  const { data, error } = await sb
    .from('piano_conti')
    .select('*')
    .eq('societa_id', societaId)
    .eq('codice', codice)
    .maybeSingle()
  return { data: data || null, error: error || null }
}

export async function getScritturaDettaglioById(primaNotaId) {
  try {
    const headerRes = await sb
      .from('prima_nota')
      .select('*')
      .eq('id', primaNotaId)
      .maybeSingle()
    if (headerRes.error) throw headerRes.error
    if (!headerRes.data) return { data: null, error: new Error('Registrazione non trovata') }

    const righeRes = await sb
      .from('prima_nota_righe')
      .select('*')
      .eq('prima_nota_id', primaNotaId)
      .order('riga_numero', { ascending: true })
    if (righeRes.error) throw righeRes.error

    return {
      data: {
        scrittura: headerRes.data,
        righe: righeRes.data || [],
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

export async function getDeleteScritturaGuards(primaNotaId, societaId) {
  try {
    const opCtxRes = await getScritturaOperationContext(primaNotaId, societaId)
    if (opCtxRes.error) throw opCtxRes.error

    const opCtx = opCtxRes.data
    const reasons = []

    if (!opCtx.actionModel.canDeleteIsolated) {
      const detailRes = await getScritturaDettaglioById(primaNotaId)
      if (detailRes.error) throw detailRes.error
      const { scrittura } = detailRes.data

      if (scrittura.stato === 'annullata') {
        reasons.push('La registrazione è già annullata.')
      }

      const isLiquidated = await isIvaPeriodLiquidated(societaId, scrittura.data_registrazione)
      if (isLiquidated) {
        reasons.push('Il periodo IVA relativo alla registrazione è già stato liquidato.')
      }

      const { data: partEntries } = await sb
        .from('partitario')
        .select('*')
        .or(`prima_nota_id.eq.${primaNotaId},chiusa_da_prima_nota_id.eq.${primaNotaId}`)

      if (partEntries && partEntries.length > 0) {
        for (const entry of partEntries) {
          if (entry.prima_nota_id === primaNotaId && Number(entry.importo_pagato || 0) > 0) {
            reasons.push(`La fattura collegata ha pagamenti attivi per €${entry.importo_pagato}.`)
          }
          if (entry.chiusa_da_prima_nota_id === primaNotaId) {
            reasons.push(`La scrittura è registrata come pagamento per la scadenza partita ID ${entry.id}.`)
          }
        }
      }
    }

    return {
      data: {
        canDelete: reasons.length === 0,
        reasons,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

export async function getScritturaOperationContext(primaNotaId, societaId) {
  try {
    const detailRes = await getScritturaDettaglioById(primaNotaId)
    if (detailRes.error) throw detailRes.error
    const { scrittura, righe } = detailRes.data

    const isLiquidated = await isIvaPeriodLiquidated(societaId, scrittura.data_registrazione)

    const { data: partEntries, error: partErr } = await sb
      .from('partitario')
      .select('*')
      .or(`prima_nota_id.eq.${primaNotaId},chiusa_da_prima_nota_id.eq.${primaNotaId}`)
    if (partErr) throw partErr

    let hasPayments = false
    let isPayment = false
    const details = []

    if (partEntries && partEntries.length > 0) {
      for (const entry of partEntries) {
        if (entry.prima_nota_id === primaNotaId) {
          if (Number(entry.importo_pagato || 0) > 0) {
            hasPayments = true
            details.push(`Fattura incassata/pagata parzialmente o totalmente (pagato: €${entry.importo_pagato})`)
          }
        }
        if (entry.chiusa_da_prima_nota_id === primaNotaId) {
          isPayment = true
          details.push(`Registrazione di pagamento collegata alla partita ID ${entry.id}`)
        }
      }
    }

    const isAnnullata = scrittura.stato === 'annullata'
    const isIsolated = !hasPayments && !isPayment && !isLiquidated && !isAnnullata
    const canDeleteIsolated = isIsolated
    const requiresAnnullaRegistrazione = !isIsolated && !isAnnullata

    let guidance = ''
    if (isAnnullata) {
      guidance = 'La registrazione è già stata annullata.'
    } else if (isIsolated) {
      guidance = 'Scrittura isolata. È possibile procedere con la cancellazione diretta transazionale.'
    } else {
      guidance = 'Scrittura collegata. ' + (
        isLiquidated ? 'Il periodo IVA è già stato liquidato: è necessario eseguire uno storno contabile. ' : ''
      ) + (
        hasPayments ? 'La fattura è collegata a pagamenti attivi nel partitario: è necessario eseguire uno storno contabile. ' : ''
      ) + (
        isPayment ? 'Questa scrittura è un pagamento registrato nel partitario: è necessario eseguire uno storno contabile. ' : ''
      )
    }

    return {
      data: {
        isIsolated,
        actionModel: {
          canDeleteIsolated,
          requiresAnnullaRegistrazione,
        },
        guidance,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

export async function deleteScritturaControllata(primaNotaId, societaId) {
  try {
    const delRitRes = await sb.from('ritenute_dacconto').delete().eq('prima_nota_id', primaNotaId)
    if (delRitRes.error) throw delRitRes.error

    const delPartRes = await sb.from('partitario').delete().eq('prima_nota_id', primaNotaId)
    if (delPartRes.error) throw delPartRes.error

    const delIvaRes = await sb.from('registri_iva').delete().eq('prima_nota_id', primaNotaId)
    if (delIvaRes.error) throw delIvaRes.error

    const delRigheRes = await sb.from('prima_nota_righe').delete().eq('prima_nota_id', primaNotaId)
    if (delRigheRes.error) throw delRigheRes.error

    const delPnRes = await sb.from('prima_nota').delete().eq('id', primaNotaId)
    if (delPnRes.error) throw delPnRes.error

    return { data: { success: true }, error: null }
  } catch (error) {
    return { data: null, error }
  }
}

export async function prepareAnnullaRegistrazione(primaNotaId, societaId) {
  try {
    const detailRes = await getScritturaDettaglioById(primaNotaId)
    if (detailRes.error) throw detailRes.error
    const { scrittura, righe } = detailRes.data

    const isAnnullata = scrittura.stato === 'annullata'
    const reasons = []
    const impattiPrevisti = []

    if (isAnnullata) {
      reasons.push('La registrazione è già in stato annullata.')
    } else {
      impattiPrevisti.push(`Generazione scrittura di storno Prima Nota con descrizione "STORNO REGISTRAZIONE N. ${scrittura.numero_registrazione || ''}"`)
      impattiPrevisti.push('Inversione semantica delle righe contabili: Dare originario diventa Avere e viceversa')

      const hasIva = righe && righe.some(r => Number(r.importo_iva || r.iva || 0) > 0 || r.causale_iva_codice)
      if (hasIva || scrittura.causale_iva_codice) {
        impattiPrevisti.push("Storno IVA con importi negativi in registri_iva per neutralizzare l'imposta")
      }

      const { data: partEntries } = await sb
        .from('partitario')
        .select('*')
        .eq('prima_nota_id', primaNotaId)

      if (partEntries && partEntries.length > 0) {
        impattiPrevisti.push(`Chiusura delle partite aperte correlate nel partitario (${partEntries.length} scadenze)`)
      }
    }

    return {
      data: {
        canPrepare: reasons.length === 0,
        nextAction: 'annulla_registrazione_collegata',
        reasons,
        impattiPrevisti,
      },
      error: null,
    }
  } catch (error) {
    return { data: null, error }
  }
}

export async function annullaRegistrazioneCollegata(primaNotaId, societaId) {
  try {
    const detailRes = await getScritturaDettaglioById(primaNotaId)
    if (detailRes.error) throw detailRes.error
    const { scrittura, righe } = detailRes.data

    if (scrittura.stato === 'annullata') {
      throw new Error('La registrazione è già in stato annullata.')
    }

    const { data: maxPn } = await sb
      .from('prima_nota')
      .select('numero_registrazione')
      .eq('societa_id', societaId)
      .order('numero_registrazione', { ascending: false })
      .limit(1)
      .maybeSingle()
    const nextNum = (Number(maxPn?.numero_registrazione) || 0) + 1

    const todayStr = new Date().toISOString().slice(0, 10)

    const stornoPnPayload = {
      societa_id: societaId,
      numero_registrazione: nextNum,
      data_registrazione: todayStr,
      data_documento: scrittura.data_documento,
      numero_documento: scrittura.numero_documento,
      causale_codice: scrittura.causale_codice,
      causale_iva_codice: scrittura.causale_iva_codice,
      descrizione: `STORNO REGISTRAZIONE N. ${scrittura.numero_registrazione || ''}`,
      cliente_fornitore_id: scrittura.cliente_fornitore_id,
      cliente_fornitore_nome: scrittura.cliente_fornitore_nome,
      totale_dare: scrittura.totale_avere || 0,
      totale_avere: scrittura.totale_dare || 0,
      stato: 'definitiva',
    }

    const { data: stornoPn, error: stornoPnErr } = await sb
      .from('prima_nota')
      .insert([stornoPnPayload])
      .select()
      .single()

    if (stornoPnErr) throw stornoPnErr
    const stornoPnId = stornoPn.id

    const stornoRighe = righe.map((r) => ({
      prima_nota_id: stornoPnId,
      riga_numero: r.riga_numero,
      conto_id: r.conto_id,
      conto_codice: r.conto_codice,
      conto_descrizione: r.conto_descrizione,
      descrizione_riga: `STORNO - ${r.descrizione_riga || ''}`,
      dare: !r.dare,
      avere: !r.avere,
      importo_dare: r.importo_avere || 0,
      importo_avere: r.importo_dare || 0,
      causale_iva_codice: r.causale_iva_codice,
      tipo_riga_auto: r.tipo_riga_auto,
    }))

    const { error: stornoRigheErr } = await sb
      .from('prima_nota_righe')
      .insert(stornoRighe)

    if (stornoRigheErr) {
      await sb.from('prima_nota').delete().eq('id', stornoPnId)
      throw stornoRigheErr
    }

    const { data: originalIvaEntries } = await sb
      .from('registri_iva')
      .select('*')
      .eq('prima_nota_id', primaNotaId)

    if (originalIvaEntries && originalIvaEntries.length > 0) {
      const stornoIvaEntries = originalIvaEntries.map((e) => ({
        prima_nota_id: stornoPnId,
        societa_id: societaId,
        data: todayStr,
        tipo: e.tipo,
        registro_codice: e.registro_codice,
        registro_nome: e.registro_nome,
        causale_iva_codice: e.causale_iva_codice,
        causale_iva_id: e.causale_iva_id,
        documento_contabilita_id: e.documento_contabilita_id,
        imponibile: -(e.imponibile || 0),
        iva: -(e.iva || 0),
        iva_detraibile: -(e.iva_detraibile || 0),
        totale: -(e.totale || 0),
      }))

      const { error: stornoIvaErr } = await sb
        .from('registri_iva')
        .insert(stornoIvaEntries)

      if (stornoIvaErr) {
        await sb.from('prima_nota_righe').delete().eq('prima_nota_id', stornoPnId)
        await sb.from('prima_nota').delete().eq('id', stornoPnId)
        throw stornoIvaErr
      }
    }

    const { data: partEntries } = await sb
      .from('partitario')
      .select('*')
      .or(`prima_nota_id.eq.${primaNotaId},chiusa_da_prima_nota_id.eq.${primaNotaId}`)

    if (partEntries && partEntries.length > 0) {
      for (const entry of partEntries) {
        if (entry.prima_nota_id === primaNotaId) {
          const updates = {
            importo_pagato: entry.importo_originale,
            importo_residuo: 0,
            stato: 'chiusa',
            chiusa_da_prima_nota_id: stornoPnId,
            data_chiusura: todayStr,
            updated_at: new Date().toISOString(),
          }
          await sb.from('partitario').update(updates).eq('id', entry.id)
        } else if (entry.chiusa_da_prima_nota_id === primaNotaId) {
          const original = Number(entry.importo_originale || 0)
          const updates = {
            importo_pagato: 0,
            importo_residuo: original,
            stato: 'aperta',
            chiusa_da_prima_nota_id: null,
            data_chiusura: null,
            updated_at: new Date().toISOString(),
          }
          await sb.from('partitario').update(updates).eq('id', entry.id)
        }
      }
    }

    const { error: updateOrigErr } = await sb
      .from('prima_nota')
      .update({ stato: 'annullata' })
      .eq('id', primaNotaId)

    if (updateOrigErr) throw updateOrigErr

    return { data: { success: true, stornoPrimaNotaId: stornoPnId }, error: null }
  } catch (error) {
    console.error('[annullaRegistrazioneCollegata] Error:', error)
    return { data: null, error }
  }
}

export async function getPrimaNotaConsultazioneRowsAdvanced(
  societaId,
  {
    dateFrom = null,
    dateTo = null,
    contoLike = '',
    contoId = '',
    contoCodice = '',
    soggettoLike = '',
    numeroDocumentoLike = '',
    causaleContabile = '',
    causaleIva = '',
    testoLibero = '',
    importoPreciso = '',
    importoDa = '',
    importoA = '',
    registroIva = '',
    protocolloIva = '',
    page = 1,
    pageSize = 50,
    tipoScrittureOrdinarie = true,
    tipoScrittureStornate = false,
    tipoScrittureSimulate = false,
  } = {}
) {
  try {
    let q = sb
      .from('prima_nota_righe')
      .select('*, prima_nota!inner(*)', { count: 'exact' })
      .eq('prima_nota.societa_id', societaId)

    // Applica filtro sulle scritture ordinarie / stornate / simulate
    const ord = tipoScrittureOrdinarie !== false
    const storn = tipoScrittureStornate === true
    const sim = tipoScrittureSimulate === true

    const activeStates = []
    if (ord) {
      activeStates.push('confermata', 'definitiva')
    }
    if (storn) {
      activeStates.push('stornata', 'storno')
    }
    if (sim) {
      activeStates.push('simulata')
    }

    if (activeStates.length > 0) {
      q = q.in('prima_nota.stato', activeStates)
    } else {
      q = q.in('prima_nota.stato', ['confermata', 'definitiva'])
    }

    if (dateFrom) {
      q = q.gte('prima_nota.data_registrazione', dateFrom)
    }
    if (dateTo) {
      q = q.lte('prima_nota.data_registrazione', dateTo)
    }
    if (contoId) {
      q = q.eq('conto_id', contoId)
    } else if (contoCodice) {
      q = q.eq('conto_codice', contoCodice)
    } else if (contoLike) {
      q = q.or(`conto_codice.ilike.%${contoLike}%,conto_descrizione.ilike.%${contoLike}%,descrizione_riga.ilike.%${contoLike}%`)
    }
    if (soggettoLike) {
      q = q.ilike('prima_nota.cliente_fornitore_nome', `%${soggettoLike}%`)
    }
    if (numeroDocumentoLike) {
      q = q.ilike('prima_nota.numero_documento', `%${numeroDocumentoLike}%`)
    }
    if (causaleContabile) {
      q = q.eq('prima_nota.causale_codice', causaleContabile)
    }
    if (causaleIva) {
      q = q.or(`causale_iva_codice.eq.${causaleIva},prima_nota.causale_iva_codice.eq.${causaleIva}`)
    }

    if (testoLibero) {
      const cleanTerm = testoLibero.trim()
      if (cleanTerm) {
        const numberVal = parseFloat(cleanTerm.replace(/[^\d.,]/g, '').replace(',', '.'))
        let filterStr = `conto_codice.ilike.%${cleanTerm}%,conto_descrizione.ilike.%${cleanTerm}%,descrizione_riga.ilike.%${cleanTerm}%,prima_nota.cliente_fornitore_nome.ilike.%${cleanTerm}%,prima_nota.numero_documento.ilike.%${cleanTerm}%,prima_nota.descrizione.ilike.%${cleanTerm}%`
        
        if (Number.isFinite(numberVal)) {
          filterStr += `,importo_dare.eq.${numberVal},importo_avere.eq.${numberVal}`
        }
        q = q.or(filterStr)
      }
    }

    if (importoPreciso) {
      const imp = parseFloat(String(importoPreciso).replace(/[^\d.,]/g, '').replace(',', '.'))
      if (Number.isFinite(imp)) {
        q = q.or(`importo_dare.eq.${imp},importo_avere.eq.${imp}`)
      }
    }
    if (importoDa) {
      const imp = parseFloat(String(importoDa).replace(/[^\d.,]/g, '').replace(',', '.'))
      if (Number.isFinite(imp)) {
        q = q.or(`importo_dare.gte.${imp},importo_avere.gte.${imp}`)
      }
    }
    if (importoA) {
      const imp = parseFloat(String(importoA).replace(/[^\d.,]/g, '').replace(',', '.'))
      if (Number.isFinite(imp)) {
        q = q.or(`importo_dare.lte.${imp},importo_avere.lte.${imp}`)
      }
    }
    if (registroIva) {
      q = q.or(`prima_nota.registro_iva_codice.ilike.%${registroIva}%,registro_iva_codice.ilike.%${registroIva}%`)
    }
    if (protocolloIva) {
      q = q.or(`prima_nota.protocollo_iva.ilike.%${protocolloIva}%,protocollo_iva.ilike.%${protocolloIva}%`)
    }

    q = q
      .order('data_registrazione', { foreignTable: 'prima_nota', ascending: false })
      .order('numero_registrazione', { foreignTable: 'prima_nota', ascending: false })
      .order('riga_numero', { ascending: true })

    const fromIdx = (page - 1) * pageSize
    const toIdx = page * pageSize - 1
    q = q.range(fromIdx, toIdx)

    const { data, error, count } = await q

    if (error) throw error

    return {
      data: data || [],
      totalRows: count || 0,
      error: null,
    }
  } catch (error) {
    console.error('[getPrimaNotaConsultazioneRowsAdvanced] Error:', error)
    return {
      data: [],
      totalRows: 0,
      error,
    }
  }
}

export async function getContoSaldoPrecedente(
  societaId,
  contoId,
  dateBefore,
  {
    tipoScrittureOrdinarie = true,
    tipoScrittureStornate = false,
    tipoScrittureSimulate = false,
  } = {}
) {
  try {
    let q = sb
      .from('prima_nota_righe')
      .select('importo_dare, importo_avere, prima_nota!inner(data_registrazione, societa_id, stato)')
      .eq('prima_nota.societa_id', societaId)
      .eq('conto_id', contoId)
      .lt('prima_nota.data_registrazione', dateBefore)

    const ord = tipoScrittureOrdinarie !== false
    const storn = tipoScrittureStornate === true
    const sim = tipoScrittureSimulate === true

    const activeStates = []
    if (ord) {
      activeStates.push('confermata', 'definitiva')
    }
    if (storn) {
      activeStates.push('stornata', 'storno')
    }
    if (sim) {
      activeStates.push('simulata')
    }

    if (activeStates.length > 0) {
      q = q.in('prima_nota.stato', activeStates)
    } else {
      q = q.in('prima_nota.stato', ['confermata', 'definitiva'])
    }

    const { data, error } = await q

    if (error) throw error

    const sum = (data || []).reduce((acc, row) => {
      return acc + (Number(row.importo_dare) || 0) - (Number(row.importo_avere) || 0)
    }, 0)

    return { data: sum, error: null }
  } catch (error) {
    console.error('[getContoSaldoPrecedente] Error:', error)
    return { data: 0, error }
  }
}

export function updateScritturaHeaderById(id, updates) {
  return sb.from('prima_nota').update(updates).eq('id', id)
}

