import { sb } from '../../../lib/supabase'

export function findPianoContiByPiva(societaId, pivaNorm) {
  return sb
    .from('piano_conti')
    .select('id,codice,descrizione,contropartita,aliquota_iva,tipo_pagamento')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .or(`partita_iva.eq.${pivaNorm},anagrafica_piva.eq.${pivaNorm}`)
    .limit(1)
}

export function findPianoContiByCf(societaId, cfNorm) {
  return sb
    .from('piano_conti')
    .select('id,codice,descrizione,contropartita,aliquota_iva,tipo_pagamento')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .or(`codice_fiscale.eq.${cfNorm},anagrafica_cf.eq.${cfNorm}`)
    .limit(1)
}

export function findPianoContiByDenominazione(societaId, denominazione) {
  return sb
    .from('piano_conti')
    .select('id,codice,descrizione,contropartita,aliquota_iva,tipo_pagamento')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .ilike('descrizione', `%${denominazione.substring(0, 20)}%`)
    .limit(1)
}

export function updatePianoContiById(contoId, update) {
  return sb.from('piano_conti').update(update).eq('id', contoId)
}

export function getAccountingEntriesByDocumentId(documentId) {
  return sb
    .from('accounting_entries')
    .select('id, data, status, created_at')
    .eq('document_id', documentId)
    .order('created_at', { ascending: false })
}

export function getSocietaAttive() {
  return sb.from('societa').select('id,denominazione').eq('attiva', true).order('denominazione')
}

export function getImpostazioneStudioAiEnabled() {
  return sb.from('impostazioni_studio').select('valore').eq('chiave', 'ai_enabled')
}

export function getClientiAttivi() {
  return sb
    .from('clienti')
    .select('id,nome,cognome,ragione_sociale,partita_iva,codice_fiscale')
    .eq('attivo', true)
    .order('nome')
}

export function getPianoContiBySocieta(societaId) {
  return sb
    .from('piano_conti')
    .select(
      'id,codice,descrizione,livello,partita_iva,anagrafica_piva,codice_fiscale,anagrafica_cf,contropartita,aliquota_iva,causale_iva_id,is_fornitore,is_cliente,is_iva'
    )
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .order('codice')
}

export function getCausaliContabiliBySocieta(societaId) {
  return sb
    .from('causali_contabili')
    .select('id,codice,descrizione')
    .eq('societa_id', societaId)
    .eq('attivo', true)
    .order('codice')
}

export function getCausaliIvaAttive() {
  return sb
    .from('causali_iva')
    .select(
      'id,codice,codice_interno,usa_per_automazione,descrizione,aliquota,tipo,regime,detraibile,is_default_per_aliquota'
    )
    .eq('attivo', true)
    .order('codice')
}

export function getDocumentiImportInStaging(societaId) {
  return sb
    .from('documenti_import')
    .select('*')
    .eq('societa_destinazione_id', societaId)
    .in('stato', ['pending', 'classified', 'manual_pending'])
    .order('created_at', { ascending: false })
    .limit(50)
}

export function findDocumentoContabilitaByFilename(societaId, filename) {
  return sb
    .from('documenti_contabilita')
    .select('id,stato,validation_status')
    .eq('societa_id', societaId)
    .eq('filename', filename)
    .limit(1)
}

export function deleteDocumentoContabilitaById(id) {
  return sb.from('documenti_contabilita').delete().eq('id', id)
}

export function uploadDocumentoToStorage(filePath, file) {
  return sb.storage.from('documenti').upload(filePath, file)
}

export function insertDocumentoImport(documentiImportPayload) {
  return sb.from('documenti_import').insert([documentiImportPayload]).select().single()
}

export function updateDocumentoImportAiRawResponse(id, nextRaw) {
  return sb.from('documenti_import').update({ ai_raw_response: nextRaw }).eq('id', id)
}

export function updateDocumentoImportClienteMatch(id, clienteId, clienteMatchType) {
  return sb.from('documenti_import').update({ cliente_id: clienteId, cliente_match_type: clienteMatchType }).eq('id', id)
}

export function findCausaleIvaByCodice(codice) {
  return sb.from('causali_iva').select('id').eq('codice', codice).limit(1)
}

export function insertDocumentoContabilita(payload) {
  return sb.from('documenti_contabilita').insert([payload]).select()
}

export function insertAvvisoAde(payload) {
  return sb.from('avvisi_ade').insert([payload]).select()
}

export function markDocumentoImportProcessed(id, tipo) {
  return sb
    .from('documenti_import')
    .update({
      stato: 'processed',
      processato_at: new Date().toISOString(),
      modulo_destinazione: tipo,
    })
    .eq('id', id)
}

export function markDocumentoImportError(id) {
  return sb.from('documenti_import').update({ stato: 'error' }).eq('id', id)
}

export function markDocumentiImportErrorBulk(societaId) {
  return sb
    .from('documenti_import')
    .update({ stato: 'error' })
    .eq('societa_destinazione_id', societaId)
    .in('stato', ['pending', 'classified', 'manual_pending'])
}
