import { sb } from '../../../lib/supabase'
import {
  createPrimaNota,
  insertPrimaNotaRighe as insertPrimaNotaRigheService,
  insertPrimaNotaPartitario as insertPrimaNotaPartitarioService,
  deletePrimaNotaById,
} from '../../../../services/primaNotaService.js'
import { syncPercipienteFromDocumentoContabilita } from '../application/percipientiRegistryService.js'
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

export function getAccountingEntriesByDocumentId(documentId) {
  return sb
    .from('accounting_entries')
    .select('*')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
    .limit(5)
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

export function updatePianoConto(id, updates) {
  return sb.from('piano_conti').update(updates).eq('id', id)
}

export function updatePianoContoByCodiceSocieta(updates, codice, societaId) {
  return sb.from('piano_conti').update(updates).eq('codice', codice).eq('societa_id', societaId)
}

export function bulkDeactivatePianoConti(ids) {
  return sb.from('piano_conti').update({ attivo: false }).in('id', ids)
}

export function insertPianoConto(payload) {
  return sb.from('piano_conti').insert([payload])
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

export function getLiquidazioniIvaCanoniche() {
  return sb
    .from('liquidazione_iva')
    .select('*')
    .order('periodo_fine', { ascending: false })
    .limit(200)
}

export async function getLiquidazioniIvaCanonicheByPeriodicita(periodicita) {
  return sb
    .from('liquidazione_iva')
    .select('*')
    .eq('periodicita', periodicita)
    .order('periodo_fine', { ascending: false })
    .limit(200)
}

export async function upsertLiquidazioneIvaCanonica(row) {
  const per = row?.periodicita
  const anno = row?.anno
  if (!per || !anno) return { data: null, error: new Error('periodicita/anno mancanti') }
  let sel = sb.from('liquidazione_iva').select('id').eq('periodicita', per).eq('anno', anno)
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

export function getRegistriIvaByPeriodo(periodo_inizio, periodo_fine) {
  return sb
    .from('registri_iva')
    .select('tipo, iva, iva_detraibile, data')
    .gte('data', periodo_inizio)
    .lte('data', periodo_fine)
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

export function insertRitenuta(record) {
  return sb.from('ritenute_dacconto').insert([record]).select().single()
}

export function deleteRitenuta(id) {
  return sb.from('ritenute_dacconto').delete().eq('id', id)
}
