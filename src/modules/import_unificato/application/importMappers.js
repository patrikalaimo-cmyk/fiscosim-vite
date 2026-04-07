import { resolveIvaOrNull } from '../../../../domain/resolveIva.js'

export function resolveCausaleIVA({
  aliquota,
  natura,
  fornitore,
  clienteDefault,
  causaliIva,
}) {
  void clienteDefault
  return resolveIvaOrNull({
    conto: fornitore || null,
    aliquota,
    natura,
    causaliIva,
    pipelineContext: undefined,
  })
}

export function buildAiRawResponse({
  analisi,
  tipoFinale,
  xmlContent,
  ivaDraftResult,
}) {
  return {
    ...analisi.dati,
    tipo_documento: tipoFinale,
    metodo: analisi.metodo,
    xml_content: xmlContent || analisi.xml_content || null,
    ...(ivaDraftResult
      ? {
          riepilogo_iva: ivaDraftResult.enrichedDati.riepilogo_iva,
          linee: ivaDraftResult.enrichedDati.linee,
          causale_iva_id: ivaDraftResult.headerCausaleIvaId,
          prima_nota_guidata_draft: JSON.parse(JSON.stringify(ivaDraftResult.primaNotaDraft)),
        }
      : {}),
  }
}

export function buildDocumentiImportPayload({
  file,
  filePath,
  tipoFinale,
  analisi,
  ai_raw_response,
  societaId,
}) {
  return {
    filename: file.name,
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type,
    tipo_documento: tipoFinale,
    confidence: analisi.confidenza,
    ai_summary: `${tipoFinale} — ${analisi.dati?.cedente_denom || analisi.dati?.contribuente || file.name}`,
    ai_raw_response,
    stato: 'classified',
    societa_destinazione_id: societaId,
  }
}

export function buildDocumentoContabilitaPayload({
  societaId,
  tipo,
  doc,
  form,
  contoId,
  causaleIvaId,
  contoCodice,
  contoDesc,
  imponibile,
  iva,
  totale,
  nullDate,
}) {
  return {
    societa_id: societaId,
    tipo,
    tipo_documento: tipo,
    nome_file: doc.filename,
    filename: doc.filename,
    file_path: doc.file_path,
    file_url: null,
    mime_type: doc.mime_type,
    stato: 'da_validare',
    workflow_status: 'pending',
    validation_status: 'pending',
    data_documento: nullDate(form.data),
    numero_documento: form.numero || null,
    soggetto_denominazione: (tipo === 'fattura_passiva' ? form.cedente_denom : form.cessionario_denom) || null,
    soggetto_piva: (tipo === 'fattura_passiva' ? form.cedente_piva : form.cessionario_piva) || null,
    soggetto_cf: (tipo === 'fattura_passiva' ? form.cedente_cf : form.cessionario_piva) || null,
    imponibile,
    iva,
    totale,
    ai_confidence: doc.confidence || 0,
    cliente_id: form.cliente_id || null,
    source_document_id: doc.id || null,
    conto_id: contoId || null,
    causale_iva_id: causaleIvaId || null,
    conto_match_type: contoId ? 'piano_conti' : 'none',
    dati_estratti: JSON.stringify({
      xml_content: doc.ai_raw_response?.xml_content || null,
      conto_id: contoId,
      conto_codice: contoCodice,
      conto_descrizione: contoDesc,
      riepilogo_iva: form.riepilogo_iva,
      linee: form.linee || [],
      cedente_piva: form.cedente_piva,
      cedente_denom: form.cedente_denom,
      pagamenti: form.pagamenti || [],
    }),
  }
}

export function buildF24Payload({ societaId, doc, form, nullDate, nullNum }) {
  return {
    societa_id: societaId,
    tipo: 'f24',
    tipo_documento: 'f24',
    nome_file: doc.filename,
    filename: doc.filename,
    file_path: doc.file_path,
    stato: 'da_validare',
    workflow_status: 'pending',
    validation_status: 'pending',
    data_documento: nullDate(form.data_versamento),
    soggetto_denominazione: form.contribuente || null,
    soggetto_cf: form.cf_f24 || null,
    totale: nullNum(form.saldo_finale),
    ai_confidence: doc.confidence || 0,
    cliente_id: form.cliente_id || null,
    source_document_id: doc.id || null,
    dati_estratti: JSON.stringify({
      sezione_erario: form.sezione_erario,
      sezione_inps: form.sezione_inps,
      saldo_finale: form.saldo_finale,
    }),
  }
}

export function buildAvvisoAdePayload({ doc, form, nullDate, nullNum }) {
  const codStudio = `AGE-${String(Date.now()).slice(-4)}`
  return {
    codice_studio: codStudio,
    cliente_id: form.cliente_id || null,
    cliente_nome: form.cedente_denom || null,
    tipo_avviso: form.tipo_avviso || 'Altro',
    importo: nullNum(form.importo_avviso),
    data_scadenza: nullDate(form.scadenza),
    data_ricezione_studio: new Date().toISOString().split('T')[0],
    contenuto: form.contenuto || null,
    note: form.numero_atto ? `N° Atto: ${form.numero_atto}` : '',
    dati_estratti: JSON.stringify(doc.ai_raw_response || {}),
  }
}

export function buildBulkConfirmFormFromDocument(doc) {
  const form = doc.ai_raw_response || {}
  return {
    tipo_documento: doc.tipo_documento || 'fattura_passiva',
    numero: form.numero || '',
    data: form.data || '',
    cedente_denom: form.cedente_denom || '',
    cedente_piva: form.cedente_piva || '',
    cedente_cf: form.cedente_cf || '',
    cessionario_denom: form.cessionario_denom || '',
    cessionario_piva: form.cessionario_piva || '',
    imponibile: form.imponibile || 0,
    iva_totale: form.iva_totale ?? form.iva ?? 0,
    totale: form.totale || 0,
    riepilogo_iva: form.riepilogo_iva || [],
    causale: form.causale || '',
    conto_id: null,
    cliente_id: doc.cliente_id || null,
    contribuente: form.contribuente || '',
    cf_f24: form.codice_fiscale || '',
    data_versamento: form.data_versamento || '',
    saldo_finale: form.saldo_finale || 0,
    sezione_erario: form.sezione_erario || [],
    sezione_inps: form.sezione_inps || [],
    tipo_avviso: form.tipo_avviso || '',
    numero_atto: form.numero_atto || '',
    importo_avviso: form.importo || 0,
    scadenza: form.data_scadenza || '',
    anno_imposta: form.anno_imposta || '',
    modello_dich: form.modello_dichiarativo || '',
    salva_contropartita: false,
  }
}
