/**
 * Inserimento documento contabile da XML fattura passiva (parità con upload Contabilità, senza AI).
 */

import { parseXMLFatturaNode, buildPassiveAnalysisFromParsed } from './fatturaXmlNode.js'

/**
 * @param {{
 *   db: import('@supabase/supabase-js').SupabaseClient,
 *   societaId: string,
 *   xmlText: string,
 *   filename?: string,
 *   tryStorage?: boolean,
 * }} p
 * @returns {Promise<{ ok: true, documentId: string, analysis: object, storage_ok?: boolean } | { ok: false, error: string }>}
 */
export async function insertPassiveDocumentFromXml({ db, societaId, xmlText, filename = 'test-fattura.xml', tryStorage = true }) {
  if (!db?.from || !societaId || !xmlText) {
    return { ok: false, error: 'db, societaId e xmlText richiesti' }
  }
  let parsed
  try {
    parsed = parseXMLFatturaNode(xmlText)
  } catch (e) {
    return { ok: false, error: `XML parse: ${e?.message || String(e)}` }
  }
  const analysis = buildPassiveAnalysisFromParsed(parsed)

  const safeName = String(filename || 'fattura.xml').replace(/[^\w.\-]+/g, '_')
  const filePath = `contabilita/${societaId}/${Date.now()}_${safeName}`
  let publicUrl = null
  let storage_ok = false

  if (tryStorage) {
    try {
      const buf = Buffer.from(xmlText, 'utf8')
      const up = await db.storage.from('documenti').upload(filePath, buf, {
        contentType: 'application/xml',
        upsert: false,
      })
      if (!up.error) {
        storage_ok = true
        const { data: urlData } = db.storage.from('documenti').getPublicUrl(filePath)
        publicUrl = urlData?.publicUrl || null
      }
    } catch {
      storage_ok = false
    }
  }

  const tipoDoc = analysis.tipo_fattura || 'fattura_passiva'

  const docUploadPayload = {
    societa_id: societaId,
    filename: safeName,
    file_path: storage_ok ? filePath : `test_inline/${Date.now()}_${safeName}`,
    file_url: publicUrl,
    mime_type: 'application/xml',
    file_size: Buffer.byteLength(xmlText, 'utf8'),
    tipo_documento: tipoDoc,
    numero_documento: analysis.numero_documento,
    data_documento: analysis.data_documento,
    soggetto_denominazione: analysis.cedente?.denominazione || analysis.cessionario?.denominazione,
    soggetto_piva: analysis.cedente?.partita_iva || analysis.cessionario?.partita_iva,
    soggetto_cf: analysis.cedente?.codice_fiscale || analysis.cessionario?.codice_fiscale,
    imponibile: analysis.imponibile,
    iva: analysis.iva,
    totale: analysis.totale,
    workflow_status: 'manual',
    validation_status: analysis.is_transitorio ? 'error' : 'pending',
    ai_confidence: analysis.confidence || 0,
  }

  const uploadIns = await db.from('documenti_contabilita').insert([docUploadPayload]).select('id').maybeSingle()
  if (uploadIns.error) {
    return { ok: false, error: uploadIns.error.message || String(uploadIns.error) }
  }
  const row = Array.isArray(uploadIns.data) ? uploadIns.data[0] : uploadIns.data
  const documentId = row?.id
  if (!documentId) return { ok: false, error: 'Insert documento senza id' }

  return { ok: true, documentId, analysis, storage_ok }
}
