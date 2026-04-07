import { trace } from '../../../core/debug/trace'
import { traceStep, traceDiff, traceIva, insertCausaleIvaMeta, newPipelineContext } from '../../../utils/pipelineLogger.js'
import { runImportIvaAndDraftPipeline } from '../importIvaPipeline.js'
import { ResolveIvaError } from '../../../../domain/resolveIva.js'
import { triggerAutoPipeline } from '../../../utils/autoPipeline.js'
import * as importRepo from '../data/importRepo.js'
import { analizzaDocumento, extractXmlFromP7m, saveOperatorCorrections } from './importAiActions.js'
import {
  buildAiRawResponse,
  buildAvvisoAdePayload,
  buildDocumentiImportPayload,
  buildDocumentoContabilitaPayload,
  buildF24Payload,
  resolveCausaleIVA,
} from './importMappers.js'

async function expandIncomingFiles(files, alertFn) {
  const toProcess = []
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      const JSZip = window.JSZip
      if (!JSZip) {
        alertFn('Ricarica la pagina — JSZip non disponibile')
        continue
      }
      const zip = await JSZip.loadAsync(await file.arrayBuffer())
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue
        const n = name.toLowerCase()
        if (n.endsWith('.p7m')) {
          const ab = await entry.async('arraybuffer')
          const xml = await extractXmlFromP7m(new File([ab], name))
          const xmlName = name.split('/').pop().replace(/\.p7m$/i, '.xml')
          toProcess.push({ file: new File([xml], xmlName, { type: 'application/xml' }), xmlContent: xml })
        } else if (n.endsWith('.xml') || n.endsWith('.pdf') || n.endsWith('.png') || n.endsWith('.jpg') || n.endsWith('.jpeg')) {
          const blob = await entry.async('blob')
          const mime = n.endsWith('.pdf') ? 'application/pdf' : n.endsWith('.xml') ? 'application/xml' : 'image/jpeg'
          toProcess.push({ file: new File([blob], name.split('/').pop(), { type: mime }) })
        }
      }
    } else if (file.name.toLowerCase().endsWith('.p7m')) {
      const xml = await extractXmlFromP7m(file)
      const xmlName = file.name.replace(/\.p7m$/i, '.xml')
      toProcess.push({ file: new File([xml], xmlName, { type: 'application/xml' }), xmlContent: xml })
    } else {
      toProcess.push({ file })
    }
  }
  return toProcess
}

export async function processImportedFile({
  file,
  xmlContent = null,
  societaId,
  causaliIva,
  causaliContabili,
  clienti,
  pianoConti,
  aiEnabled,
  tipoManuale,
  aiMode,
  aiPreprocessMode,
  ai,
  confirm,
  alert,
}) {
  const pipelineCtx = newPipelineContext()
  trace('IMPORT START', { filename: file?.name })

  const filePath = `inbox/${Date.now()}_${file.name}`
  const { data: existingDoc } = await importRepo.findDocumentoContabilitaByFilename(societaId, file.name)
  if (existingDoc?.length > 0) {
    const stato = existingDoc[0].validation_status || existingDoc[0].stato
    const isContabilizzata = stato === 'confirmed' || stato === 'registered' || stato === 'registrata'
    const msg = isContabilizzata
      ? `⚠️ "${file.name}" è già stata contabilizzata. Vuoi comunque reimportarla?`
      : `⚠️ "${file.name}" è già presente in Da Validare. Vuoi reimportarla?`
    const proceed = confirm(msg)
    if (!proceed) return { skipped: true }
    await importRepo.deleteDocumentoContabilitaById(existingDoc[0].id)
  }

  const { error: upErr } = await importRepo.uploadDocumentoToStorage(filePath, file)
  if (upErr) throw upErr

  let analisi
  const isXmlFile = xmlContent || file.name.toLowerCase().endsWith('.xml')
  if (isXmlFile) {
    ai.setAI('processing', `Parsing XML ${file.name}`, 'local')
    analisi = await analizzaDocumento(file, xmlContent, pipelineCtx, aiMode, aiPreprocessMode)
  } else if (aiEnabled) {
    ai.setAI('processing', `Analisi AI ${file.name}`, aiMode === 'online' ? 'ai' : 'local')
    analisi = await analizzaDocumento(file, xmlContent, pipelineCtx, aiMode, aiPreprocessMode)
  } else {
    ai.setAI('done', 'AI disattivata', 'local')
    analisi = {
      tipo: tipoManuale || 'fattura_passiva',
      confidenza: 0.5,
      metodo: 'manuale',
      dati: { cedente_denom: file.name.replace(/\.[^.]+$/, '') },
    }
  }

  trace('AFTER PARSE', {
    riepilogo_iva: analisi?.dati?.riepilogo_iva,
    raw_analysis: analisi?.dati,
  })

  trace('IMPORT', { file: file.name, tipo: analisi.tipo, confidenza: analisi.confidenza, metodo: analisi.metodo })
  const tipoFinale = tipoManuale || analisi.tipo

  let ivaDraftResult = null
  let importIvaPipelineFailed = false
  if ((tipoFinale === 'fattura_passiva' || tipoFinale === 'fattura_attiva') && causaliIva.length) {
    try {
      ivaDraftResult = await runImportIvaAndDraftPipeline({
        analisi,
        tipoFinale,
        societaId,
        pianoConti,
        causaliIva,
        causaliContabili,
        clienti,
        pipelineCtx,
      })
    } catch (e) {
      importIvaPipelineFailed = true
      if (e instanceof ResolveIvaError) {
        const hint = e.details?.aliquota_percent != null ? `\n\nAliquota: ${e.details.aliquota_percent}%` : ''
        alert(`Import bloccato — ${file.name}\n\n${e.message}${hint}\n\nImpostazioni Procedure → Aliquote IVA.`)
      } else {
        console.error('[import_unificato] IVA + draft pipeline', e)
        alert(`Import bloccato — ${file.name}\n\n${e?.message || String(e)}`)
      }
    }
  }

  if (importIvaPipelineFailed) {
    ai.setAI('done', 'Errore causale IVA', 'local')
    return { skipped: true }
  }

  const ai_raw_response = buildAiRawResponse({ analisi, tipoFinale, xmlContent, ivaDraftResult })
  const documentiImportPayload = buildDocumentiImportPayload({
    file,
    filePath,
    tipoFinale,
    analisi,
    ai_raw_response,
    societaId,
  })
  traceStep('INSERT_PAYLOAD', documentiImportPayload, { table: 'documenti_import', ...insertCausaleIvaMeta(documentiImportPayload) }, pipelineCtx)
  const { data: doc, error: dbErr } = await importRepo.insertDocumentoImport(documentiImportPayload)
  if (doc?.id) pipelineCtx.documentId = doc.id
  traceStep('INSERT_RESULT', { table: 'documenti_import', data: doc, error: dbErr }, {}, pipelineCtx)
  if (dbErr) throw dbErr

  if (doc?.id && aiEnabled && (tipoFinale === 'fattura_passiva' || tipoFinale === 'fattura_attiva')) {
    triggerAutoPipeline(doc.id, {
      source: 'import_unificato_staging',
      aiMode: aiMode === 'online' ? 'online' : 'local',
      aiPreprocessMode,
    })
  }

  if (doc?.id && ivaDraftResult?.primaNotaDraft) {
    const draft = JSON.parse(JSON.stringify(ivaDraftResult.primaNotaDraft))
    draft.meta = { ...draft.meta, documento_import_id: doc.id }
    const nextRaw = { ...ai_raw_response, prima_nota_guidata_draft: draft }
    await importRepo.updateDocumentoImportAiRawResponse(doc.id, nextRaw)
  }

  const piva = analisi.dati?.cedente_piva || analisi.dati?.cessionario_piva || analisi.dati?.codice_fiscale
  if (piva && clienti.length) {
    const norm = (p) => (p || '').replace(/\s|-/g, '').replace(/^IT/i, '').toUpperCase()
    const match = clienti.find((c) => norm(c.partita_iva) === norm(piva) || norm(c.codice_fiscale) === norm(piva))
    if (match) await importRepo.updateDocumentoImportClienteMatch(doc.id, match.id, 'auto')
  }

  ai.setAI('done', `${file.name} classificato`, 'ai')
  return { skipped: false, doc }
}

export async function processImportedFiles({
  fileList,
  societaId,
  aiEnabled,
  aiMode,
  aiPreprocessMode,
  tipoManuale,
  pianoConti,
  causaliIva,
  causaliContabili,
  clienti,
  ai,
  confirm,
  alert,
  onProgress,
}) {
  const files = Array.from(fileList)
  if (!files.length) return

  const toProcess = await expandIncomingFiles(files, alert)
  onProgress?.({ current: 0, total: toProcess.length, file: '' })

  for (let i = 0; i < toProcess.length; i++) {
    const { file, xmlContent } = toProcess[i]
    onProgress?.({ current: i + 1, total: toProcess.length, file: file.name })

    try {
      await processImportedFile({
        file,
        xmlContent,
        societaId,
        aiEnabled,
        aiMode,
        aiPreprocessMode,
        tipoManuale,
        pianoConti,
        causaliIva,
        causaliContabili,
        clienti,
        ai,
        confirm,
        alert,
      })
    } catch (e) {
      console.error('Errore processing:', file.name, e)
      ai.setAI('error', 'Errore AI', 'ai')
    }
  }
}

export async function confirmImportedDocument({
  doc,
  form,
  societaId,
  pianoConti,
  causaliIva,
  aiMode,
  aiPreprocessMode,
  alert,
}) {
  const confermaPipelineCtx = newPipelineContext(doc?.id)
  const tipo = form.tipo_documento
  const nullDate = (v) => {
    if (!v) return null
    const s = String(v).trim()
    return s ? s : null
  }
  const nullNum = (v) => {
    if (v === '' || v == null || isNaN(v)) return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  if (!doc?.id) {
    alert('Documento non valido o mancante.')
    return
  }
  if (!societaId) {
    alert('SocietÃ  non selezionata.')
    return
  }
  if (!form) {
    alert('Dati documento mancanti.')
    return
  }
  if (!tipo) {
    alert('Tipo documento mancante.')
    return
  }

  if (tipo === 'fattura_passiva' || tipo === 'fattura_attiva') {
    let imponibile = nullNum(form.imponibile)
    let iva = nullNum(form.iva_totale)
    if (form.riepilogo_iva?.length > 0) {
      imponibile = form.riepilogo_iva.reduce((s, r) => s + (r.imponibile || 0), 0)
      iva = form.riepilogo_iva.reduce((s, r) => s + (r.imposta || 0), 0)
    }
    const totale = nullNum(form.totale) || (imponibile || 0) + (iva || 0)
    if (!Number.isFinite(totale)) {
      alert('Totale documento non valido.')
      return
    }

    let contoId = form.conto_id || null
    let contoCodice = null
    let contoDesc = null
    let causaleIvaId = null
    if (contoId) {
      const c = pianoConti.find((x) => x.id === contoId)
      if (c) {
        contoCodice = c.codice
        contoDesc = c.descrizione
        if (c.causale_iva_id) causaleIvaId = c.causale_iva_id
      }
    }
    if (!causaleIvaId && form.causale_iva_id) causaleIvaId = form.causale_iva_id

    if (!causaleIvaId && form.riepilogo_iva?.length > 0) {
      const aliq = Math.round(parseFloat(form.riepilogo_iva[0]?.aliquota || 0))
      const codFS = aliq > 0 ? `F${aliq}` : 'F0FC'
      const { data: cfs } = await importRepo.findCausaleIvaByCodice(codFS)
      if (cfs?.[0]?.id) causaleIvaId = cfs[0].id
    }

    if (!contoCodice && form.conto_search) {
      const codFromSearch = form.conto_search.split('—')[0].trim()
      const c = pianoConti.find((x) => x.codice === codFromSearch)
      if (c) {
        contoId = c.id
        contoCodice = c.codice
        contoDesc = c.descrizione
        if (c.causale_iva_id) causaleIvaId = c.causale_iva_id
      }
    }

    if (!causaleIvaId) {
      trace('BEFORE ALIQUOTA EXTRACTION', { riepilogo_iva: form.riepilogo_iva })
      trace('ALIQUOTA RAW DEBUG', {
        form_aliquota_iva: form.aliquota_iva,
        riepilogo_iva: form.riepilogo_iva,
        first_riepilogo: form.riepilogo_iva?.[0],
        aliquota_from_riepilogo: form.riepilogo_iva?.[0]?.aliquota,
      })
      const rie0 = form.riepilogo_iva?.[0] || null
      const natura0 = rie0?.natura || ''
      const aliqRaw0 = form.aliquota_iva ?? rie0?.aliquota
      const aliqRaw = iva === 0 && !natura0 ? 0 : aliqRaw0
      trace('ALIQUOTA EXTRACTED', { aliquota: aliqRaw })
      trace('BEFORE MATCH', { aliquota: aliqRaw, causaliIva })
      traceStep('RESOLVE_IVA_INPUT', {
        aliquota: aliqRaw,
        natura: natura0,
        conto_id: contoId,
        causaliIva_count: (causaliIva || []).length,
      }, { filename: doc?.filename }, confermaPipelineCtx)
      const causaleIvaIdResolved = resolveCausaleIVA({
        aliquota: aliqRaw,
        natura: natura0,
        fornitore: pianoConti.find((x) => x.id === contoId) || null,
        clienteDefault: null,
        causaliIva: causaliIva || [],
      })
      traceStep('RESOLVE_IVA_OUTPUT', {
        causale_iva_id: causaleIvaIdResolved,
        causale_iva_id_typeof: typeof causaleIvaIdResolved,
      }, { filename: doc?.filename }, confermaPipelineCtx)
      traceIva('POST_RESOLVE_CAUSALE_IVA', 'builder', causaleIvaIdResolved, confermaPipelineCtx)
      trace('IVA RESOLUTION', { aliquota: aliqRaw, causaleIvaId: causaleIvaIdResolved })
      trace('MATCH RESULT', { causaleIvaId: causaleIvaIdResolved })
      if (causaleIvaIdResolved) causaleIvaId = causaleIvaIdResolved
    }

    traceIva('CONFIRM_BEFORE_PAYLOAD', 'UI', causaleIvaId, confermaPipelineCtx)
    if (!causaleIvaId) {
      alert('Causale IVA mancante. Verifica la causale o le aliquote.')
      return
    }

    const payload = buildDocumentoContabilitaPayload({
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
    })
    const aliquota = form.aliquota_iva ?? form.riepilogo_iva?.[0]?.aliquota

    console.log('=== DEBUG IVA MATCH ===')
    console.log('ALIQUOTA:', aliquota)
    console.log('CAUSALI IVA LIST:', causaliIva)
    const debugMatch = causaliIva.map((c) => {
      const testo = c.descrizione || c.codice || ''
      const numero = (testo.match(/\d+/) || [null])[0]
      return { descrizione: c.descrizione, codice: c.codice, extracted: numero }
    })
    console.log('PARSED CAUSALI:', debugMatch)
    trace('FINAL ALIQUOTA USED', {
      aliquota_final: aliquota,
      form_aliquota_iva: form.aliquota_iva,
      riepilogo_iva: form.riepilogo_iva,
    })
    trace('BEFORE INSERT', { payload: { causale_iva_id: causaleIvaId, conto_id: contoId, dati_estratti: form } })
    trace('DB', { action: 'INSERT documenti_contabilita', filename: doc.filename, tipo, contoId, causaleIvaId })
    console.log('[Import] Payload insert:', JSON.stringify(payload, null, 2))
    traceIva('PRE_INSERT_DOCUMENTI_CONT', 'DB', payload.causale_iva_id, confermaPipelineCtx)
    traceStep('INSERT_PAYLOAD', payload, { table: 'documenti_contabilita', ...insertCausaleIvaMeta(payload) }, confermaPipelineCtx)
    traceDiff('DB_MAPPING_DIFF', { causale_iva_id_form: form.causale_iva_id ?? null, causale_iva_id_resolved: causaleIvaId }, { causale_iva_id_payload: payload.causale_iva_id ?? null }, confermaPipelineCtx)
    const insRes = await importRepo.insertDocumentoContabilita(payload)
    if (insRes.data?.[0]?.id) confermaPipelineCtx.documentId = insRes.data[0].id
    traceStep('INSERT_RESULT', { table: 'documenti_contabilita', data: insRes.data, error: insRes.error }, {}, confermaPipelineCtx)
    const insErr = insRes.error
    if (insErr) {
      console.error('[Import] ERRORE INSERT:', insErr)
      alert('Errore: ' + insErr.message)
      return
    }
    const contId = insRes.data?.[0]?.id
    if (contId) {
      triggerAutoPipeline(contId, {
        source: 'import_unificato_conferma_fattura',
        aiMode,
        aiPreprocessMode,
      })
    }

    if (doc?.id && (tipo === 'fattura_passiva' || tipo === 'fattura_attiva')) {
      void (async () => {
        try {
          const res = await saveOperatorCorrections({ documentId: doc.id, form, tipo, pianoConti })
          if (!res.ok) console.warn('[Import] save-operator-corrections', await res.text())
        } catch (e) {
          console.warn('[Import] save-operator-corrections', e?.message || e)
        }
      })()
    }
  } else if (tipo === 'f24') {
    const f24Payload = buildF24Payload({ societaId, doc, form, nullDate, nullNum })
    traceStep('INSERT_PAYLOAD', f24Payload, { table: 'documenti_contabilita', ...insertCausaleIvaMeta(f24Payload) }, confermaPipelineCtx)
    traceDiff('DB_MAPPING_DIFF', { ui: { tipo: 'f24', cliente_id: form.cliente_id } }, { payload_keys: Object.keys(f24Payload) }, confermaPipelineCtx)
    const f24Ins = await importRepo.insertDocumentoContabilita(f24Payload)
    if (f24Ins.data?.[0]?.id) confermaPipelineCtx.documentId = f24Ins.data[0].id
    traceStep('INSERT_RESULT', { table: 'documenti_contabilita', data: f24Ins.data, error: f24Ins.error }, {}, confermaPipelineCtx)
    if (f24Ins.error) {
      alert('Errore: ' + f24Ins.error.message)
      return
    }
    const f24Id = f24Ins.data?.[0]?.id
    if (f24Id && !f24Ins.error) {
      triggerAutoPipeline(f24Id, {
        source: 'import_unificato_conferma_f24',
        aiMode,
        aiPreprocessMode,
      })
    }
  } else if (tipo === 'avviso_ade') {
    const avvisoPayload = buildAvvisoAdePayload({ doc, form, nullDate, nullNum })
    traceStep('INSERT_PAYLOAD', avvisoPayload, { table: 'avvisi_ade', ...insertCausaleIvaMeta(avvisoPayload) }, confermaPipelineCtx)
    traceDiff('DB_MAPPING_DIFF', { ui: { tipo_avviso: form.tipo_avviso, cliente_id: form.cliente_id } }, { payload_keys: Object.keys(avvisoPayload) }, confermaPipelineCtx)
    const avvIns = await importRepo.insertAvvisoAde(avvisoPayload)
    if (avvIns.data?.[0]?.id) confermaPipelineCtx.documentId = avvIns.data[0].id
    traceStep('INSERT_RESULT', { table: 'avvisi_ade', data: avvIns.data, error: avvIns.error }, {}, confermaPipelineCtx)
    if (avvIns.error) {
      alert('Errore: ' + avvIns.error.message)
      return
    }
  }

  await importRepo.markDocumentoImportProcessed(doc.id, tipo)
}
