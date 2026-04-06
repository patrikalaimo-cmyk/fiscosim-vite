/**
 * Tool server-side per Copilot contabile: esecuzione vincolata a società / documento contesto.
 */

import {
  normPiva,
  findAnagraficaConto,
  loadAutoValidateContext,
  evaluateAutoValidateScore,
  generateAutoValidateExplanation,
} from './autoValidateAccountingEngine.js'

const MAX_ENTRIES_LIST = 40
const MAX_ENTRIES_BALANCE = 500
const MAX_DOC_IDS = 400

function truncateJson(obj, maxLen) {
  try {
    const s = JSON.stringify(obj)
    if (s.length <= maxLen) return obj
    return { _truncated: true, preview: s.slice(0, maxLen) + '…' }
  } catch {
    return { _error: 'serialize' }
  }
}

function parseRowAmount(v) {
  if (v == null) return 0
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const t = String(v).trim().replace(/\s/g, '').replace(',', '.')
  const n = parseFloat(t)
  return Number.isFinite(n) ? n : 0
}

function round2(n) {
  return Math.round(n * 100) / 100
}

async function documentIdsForSocieta(db, societaId) {
  const { data, error } = await db
    .from('documenti_contabilita')
    .select('id')
    .eq('societa_id', societaId)
    .limit(MAX_DOC_IDS)
  if (error) return { error: error.message, ids: [] }
  return { ids: (data || []).map((r) => String(r.id)) }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {{ societaId: string, documentId: string, log?: function }} ctx
 * @param {string} name
 * @param {Record<string, unknown>} input
 */
export async function executeCopilotAccountingTool(db, ctx, name, input) {
  const { societaId, documentId } = ctx
  const i = input && typeof input === 'object' ? input : {}

  switch (name) {
    case 'get_entries':
      return toolGetEntries(db, societaId, documentId, i)
    case 'get_partitario':
      return toolGetPartitario(db, societaId, i)
    case 'get_balance':
      return toolGetBalance(db, societaId)
    case 'explain_entry':
      return toolExplainEntry(db, societaId, i)
    case 'update_entries':
      return toolUpdateEntries(db, societaId, i)
    default:
      return { error: `Tool sconosciuto: ${name}` }
  }
}

async function toolGetEntries(db, societaId, currentDocumentId, filters) {
  const limit = Math.min(Math.max(Number(filters.limit) || 15, 1), MAX_ENTRIES_LIST)
  const status = filters.status != null ? String(filters.status).trim() : ''
  const societyWide = Boolean(filters.society_wide)

  if (societyWide) {
    const { ids: docIds, error: dErr } = await documentIdsForSocieta(db, societaId)
    if (dErr) return { error: dErr, entries: [] }
    if (!docIds.length) return { entries: [], count: 0, note: 'Nessun documento per la società.' }

    let q = db
      .from('accounting_entries')
      .select('id,document_id,status,data,ai_confidence,ai_status,ai_source,ai_explanation,auto_validate_meta,created_at')
      .in('document_id', docIds)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) return { error: error.message, entries: [] }
    const entries = (data || []).map(mapEntryRow)
    return { entries, count: entries.length, scope: 'society_wide' }
  }

  const docFilter =
    filters.document_id != null && String(filters.document_id).trim() !== ''
      ? String(filters.document_id).trim()
      : String(currentDocumentId || '')

  if (!docFilter) {
    return {
      error: 'Specifica document_id oppure society_wide: true, oppure apri un documento in contesto.',
      entries: [],
    }
  }

  const { data: docCheck } = await db
    .from('documenti_contabilita')
    .select('id')
    .eq('societa_id', societaId)
    .eq('id', docFilter)
    .maybeSingle()

  if (!docCheck) {
    return {
      error: 'document_id non valido per questa società.',
      entries: [],
    }
  }

  let q = db
    .from('accounting_entries')
    .select('id,document_id,status,data,ai_confidence,ai_status,ai_source,ai_explanation,auto_validate_meta,created_at')
    .eq('document_id', docFilter)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return { error: error.message, entries: [] }

  const entries = (data || []).map(mapEntryRow)
  return { entries, count: entries.length, document_id: docFilter, scope: 'document' }
}

function mapEntryRow(e) {
  return {
    id: e.id,
    document_id: e.document_id,
    status: e.status,
    ai_confidence: e.ai_confidence,
    ai_status: e.ai_status,
    ai_source: e.ai_source,
    ai_explanation: e.ai_explanation,
    auto_validate_meta: e.auto_validate_meta,
    data: truncateJson(e.data, 12000),
    created_at: e.created_at,
  }
}

async function toolGetPartitario(db, societaId, input) {
  const anagraficaId = input.anagrafica_id != null ? String(input.anagrafica_id).trim() : ''
  if (!anagraficaId) return { error: 'anagrafica_id obbligatorio (UUID conto piano anagrafica fornitore/cliente).', movimenti: [] }

  const { data: pc, error: pcErr } = await db
    .from('piano_conti')
    .select('id,codice,descrizione,partita_iva,anagrafica_piva')
    .eq('id', anagraficaId)
    .eq('societa_id', societaId)
    .maybeSingle()

  if (pcErr || !pc) return { error: 'Anagrafica non trovata per questa società.', movimenti: [] }

  const piva = normPiva(pc.partita_iva || pc.anagrafica_piva || '')
  if (!piva) {
    return {
      anagrafica: { id: pc.id, codice: pc.codice, descrizione: pc.descrizione },
      movimenti: [],
      note: 'Nessuna P.IVA sull’anagrafica: tabella partitari è legata a clienti per P.IVA.',
    }
  }

  const variants = Array.from(new Set([piva, piva.length === 11 ? `IT${piva}` : null].filter(Boolean)))
  let clienteId = null
  for (const v of variants) {
    const { data: cl } = await db.from('clienti').select('id,ragione_sociale,partita_iva').eq('partita_iva', v).limit(1).maybeSingle()
    if (cl?.id) {
      clienteId = cl.id
      break
    }
  }
  if (!clienteId) {
    const { data: list } = await db.from('clienti').select('id,ragione_sociale,partita_iva').ilike('partita_iva', `%${piva}%`).limit(3)
    if (list?.length === 1) clienteId = list[0].id
  }

  if (!clienteId) {
    return {
      anagrafica: { id: pc.id, codice: pc.codice, descrizione: pc.descrizione, partita_iva: piva },
      movimenti: [],
      note: 'Nessun record clienti con questa P.IVA; partitari non interrogabile.',
    }
  }

  const { data: mov, error } = await db
    .from('partitari')
    .select('id,data,dare,avere,saldo_progressivo,descrizione,documento_id,accounting_entry_id')
    .eq('soggetto_id', clienteId)
    .order('data', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(80)

  if (error) return { error: error.message, movimenti: [] }

  return {
    anagrafica: { id: pc.id, codice: pc.codice, descrizione: pc.descrizione, partita_iva: piva },
    cliente_id: clienteId,
    movimenti: mov || [],
    count: (mov || []).length,
  }
}

async function toolGetBalance(db, societaId) {
  const { ids: docIds, error: dErr } = await documentIdsForSocieta(db, societaId)
  if (dErr) return { error: dErr, saldi: [] }
  if (!docIds.length) return { saldi: [], note: 'Nessun documento in contabilità per la società.' }

  const { data: aes, error } = await db
    .from('accounting_entries')
    .select('id,document_id,status,data')
    .in('document_id', docIds)
    .limit(MAX_ENTRIES_BALANCE)

  if (error) return { error: error.message, saldi: [] }

  const byConto = new Map()
  for (const ae of aes || []) {
    const rows = ae.data?.rows
    if (!Array.isArray(rows)) continue
    for (const r of rows) {
      const cid = String(r.conto_id ?? r.conto ?? '').trim()
      if (!cid) continue
      const dare = parseRowAmount(r.dare)
      const avere = parseRowAmount(r.avere)
      const cur = byConto.get(cid) || { dare: 0, avere: 0 }
      cur.dare += dare
      cur.avere += avere
      byConto.set(cid, cur)
    }
  }

  const saldi = []
  for (const [conto_id, v] of byConto) {
    saldi.push({
      conto_id,
      totale_dare: round2(v.dare),
      totale_avere: round2(v.avere),
      saldo: round2(v.dare - v.avere),
    })
  }
  saldi.sort((a, b) => Math.abs(b.saldo) - Math.abs(a.saldo))

  const { data: pianoSample } = await db
    .from('piano_conti')
    .select('id,codice,descrizione')
    .eq('societa_id', societaId)
    .limit(500)

  const label = new Map((pianoSample || []).map((p) => [String(p.id), `${p.codice || ''} — ${p.descrizione || ''}`.trim()]))

  const enriched = saldi.slice(0, 50).map((s) => ({
    ...s,
    conto_label: label.get(String(s.conto_id)) || s.conto_id,
  }))

  return {
    conti_distinti: saldi.length,
    entries_considerate: (aes || []).length,
    documenti_considerati_max: docIds.length,
    saldi_top: enriched,
    note:
      'Saldi aggregati da accounting_entries.data.rows per documenti della società (campione limitato per performance). Non include documenti oltre il limite documenti_considerati_max.',
  }
}

function pickPrimaryAccountRiga(righe) {
  const rows = Array.isArray(righe) ? righe : []
  const byDesc = (re) => rows.find((r) => re.test(String(r.descrizione_riga || '')))

  const cost = byDesc(/costo|acquisto/i)
  if (cost?.conto_id) {
    return { riga: cost, role: 'costo_ricavo' }
  }
  const ric = byDesc(/ricavo|vendita/i)
  if (ric?.conto_id) {
    return { riga: ric, role: 'costo_ricavo' }
  }

  const skipLine = (r) => /IVA|^(Fornitore|Cliente)\b/i.test(String(r.descrizione_riga || '').trim())
  const scored = rows
    .filter((r) => r?.conto_id && !skipLine(r))
    .map((r) => ({
      r,
      amt: Math.max(parseRowAmount(r.importo_dare), parseRowAmount(r.importo_avere)),
    }))
    .sort((a, b) => b.amt - a.amt)

  if (scored[0]?.r) return { riga: scored[0].r, role: 'costo_ricavo' }

  const any = rows.find((r) => r?.conto_id)
  if (any) {
    const role = /IVA/i.test(String(any.descrizione_riga || '')) ? 'iva' : 'controparte'
    return { riga: any, role }
  }
  return { riga: null, role: null }
}

function classifyAccountBucket(pc) {
  if (!pc) return null
  const t = `${pc.codice || ''} ${pc.descrizione || ''}`.toLowerCase()
  if (/enel|energia|elettric|luce|gas|utilities|utenze|acquedotto|acqua\b/i.test(t)) return 'utilities'
  if (/telecom|telefonia|internet|connessione|voce dati/i.test(t)) return 'telecommunications'
  if (/affitto|locazione|canone/i.test(t)) return 'rent'
  if (/consulenz|profession|avvoc|notaio|commercialist/i.test(t)) return 'professional_services'
  if (/carburante|benzin|diesel|autostrada/i.test(t)) return 'travel_and_vehicle'
  if (/materia|merce|fornitura|acquist[oi]/i.test(t)) return 'goods_and_supplies'
  return null
}

function aiSourceLabelIt(source) {
  const s = String(source || '').toLowerCase()
  if (s === 'learning') return 'apprendimento (ai_learning / feedback operatore)'
  if (s === 'memory') return 'mappa anagrafica sul piano dei conti (P.IVA fornitore/cliente)'
  if (s === 'pattern') return 'ricorrenza storica su documenti precedenti stesso soggetto'
  if (s === 'fallback') return 'proposta senza segnali forti (revisione consigliata)'
  return source || 'non disponibile'
}

function entryDataFromPrimaNotaRighe(righe) {
  const rows = (righe || []).map((r) => ({
    conto_id: r.conto_id,
    dare: r.importo_dare,
    avere: r.importo_avere,
    descrizione: r.descrizione_riga,
    conto_codice: r.conto_codice,
  }))
  return { rows }
}

async function resolveDocumentForPrimaNota(db, societaId, pn, primaNotaId) {
  const { data: byPn, error: ePn } = await db
    .from('documenti_contabilita')
    .select('*')
    .eq('societa_id', societaId)
    .eq('prima_nota_id', primaNotaId)
    .limit(2)

  if (!ePn && byPn?.length === 1) {
    return { doc: byPn[0], link: 'prima_nota_id' }
  }

  if (pn.documento_import_id) {
    const { data: dImp, error: eImp } = await db
      .from('documenti_contabilita')
      .select('*')
      .eq('societa_id', societaId)
      .eq('id', pn.documento_import_id)
      .maybeSingle()
    if (!eImp && dImp) return { doc: dImp, link: 'documento_import_id' }
  }

  if (pn.numero_documento && pn.data_documento) {
    const { data: list, error: eList } = await db
      .from('documenti_contabilita')
      .select('*')
      .eq('societa_id', societaId)
      .eq('numero_documento', pn.numero_documento)
      .eq('data_documento', pn.data_documento)
      .limit(3)
    if (!eList && list?.length === 1) return { doc: list[0], link: 'numero_e_data_documento' }
  }

  return { doc: null, link: null, note: byPn?.length > 1 ? 'Più documenti con stessa prima_nota_id' : null }
}

function buildSummaryLine({
  codice,
  supplierName,
  mappedTimes,
  bucket,
  aiSource,
}) {
  const cod = codice || '—'
  const sup = String(supplierName || '').trim() || 'il fornitore/cliente'
  const parts = [`Account ${cod} selected`]
  if (mappedTimes > 0) {
    parts.push(
      `because supplier ${sup} was mapped ${mappedTimes} time${mappedTimes === 1 ? '' : 's'}`
    )
  } else if (aiSource === 'memory' || aiSource === 'learning') {
    parts.push(`because ${aiSource === 'learning' ? 'learning rules' : 'anagrafica mapping'} support this account`)
  } else {
    parts.push('based on the registration lines and available context')
  }
  if (bucket) {
    parts.push(`and classified as ${bucket.replace(/_/g, ' ')}`)
  }
  return `${parts.join(' ')}.`
}

/**
 * Spiegazione strutturata registrazione prima nota (conto usato, AI, storico, fisco).
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} societaId
 * @param {string} primaNotaId
 */
export async function explainPrimaNotaEntry(db, societaId, primaNotaId) {
  const id = primaNotaId != null ? String(primaNotaId).trim() : ''
  if (!id) return { error: 'prima_nota_id obbligatorio.' }

  const { data: pn, error: pnErr } = await db
    .from('prima_nota')
    .select('*')
    .eq('id', id)
    .eq('societa_id', societaId)
    .maybeSingle()

  if (pnErr || !pn) return { error: 'Prima nota non trovata per questa società.' }

  const { data: righe, error: rErr } = await db
    .from('prima_nota_righe')
    .select('*')
    .eq('prima_nota_id', id)
    .order('riga_numero', { ascending: true })

  if (rErr) return { error: rErr.message }

  const { data: pianoRows } = await db
    .from('piano_conti')
    .select('id,codice,descrizione,partita_iva,anagrafica_piva,is_fornitore,is_cliente,livello,tipo,natura')
    .eq('societa_id', societaId)
    .eq('attivo', true)

  const pcList = pianoRows || []
  const { riga: primaryRiga, role } = pickPrimaryAccountRiga(righe)
  const pcPrimary =
    primaryRiga?.conto_id != null
      ? pcList.find((c) => String(c.id) === String(primaryRiga.conto_id))
      : null

  const account_used = primaryRiga
    ? {
        conto_id: primaryRiga.conto_id,
        codice: primaryRiga.conto_codice || pcPrimary?.codice || null,
        descrizione: primaryRiga.conto_descrizione || pcPrimary?.descrizione || null,
        riga_numero: primaryRiga.riga_numero,
        role: role || 'other',
        descrizione_riga: primaryRiga.descrizione_riga || null,
      }
    : null

  const { doc, link: document_link } = await resolveDocumentForPrimaNota(db, societaId, pn, id)

  let accounting_entry_id = null
  let entryRow = null
  if (doc?.id) {
    const { data: ent } = await db
      .from('accounting_entries')
      .select(
        'id,status,data,ai_confidence,ai_status,ai_source,ai_explanation,auto_validate_meta,created_at'
      )
      .eq('document_id', String(doc.id))
      .order('created_at', { ascending: false })
      .limit(1)
    entryRow = ent?.[0] || null
    accounting_entry_id = entryRow?.id || null
  }

  const proposedForEval =
    account_used?.conto_id != null ? String(account_used.conto_id) : doc?.conto_id || null
  const entryData =
    entryRow?.data && typeof entryRow.data === 'object'
      ? entryRow.data
      : entryDataFromPrimaNotaRighe(righe)

  let evalResult = null
  let ctxBase = null
  let whyShort = ''
  if (doc) {
    ctxBase = await loadAutoValidateContext(db, {
      documentRow: doc,
      proposedContoId: proposedForEval,
    })
    evalResult = evaluateAutoValidateScore({
      documentRow: doc,
      entryData,
      pianoConti: ctxBase.pianoConti,
      priorSameContoCount: ctxBase.priorSameContoCount,
      dominantContoId: ctxBase.dominantContoId,
      isNewAnagrafica: ctxBase.isNewAnagrafica,
      learningMatch: ctxBase.learningMatch,
    })
    whyShort = generateAutoValidateExplanation({
      evalResult,
      pianoConti: ctxBase.pianoConti,
      documentRow: doc,
      priorSameContoCount: ctxBase.priorSameContoCount,
      dominantContoCount: ctxBase.dominantContoCount ?? 0,
    })
  }

  const ai_source = entryRow?.ai_source != null ? entryRow.ai_source : evalResult?.ai_source ?? null
  const ai_confidence =
    entryRow?.ai_confidence != null ? Number(entryRow.ai_confidence) : evalResult?.ai_confidence ?? null
  const ai_explanation_stored = entryRow?.ai_explanation != null ? String(entryRow.ai_explanation).trim() : null

  const anag = doc ? findAnagraficaConto(pcList, normPiva(doc.soggetto_piva)) : null
  let learningFrequenzaForAccount = 0
  if (anag?.id && account_used?.conto_id) {
    const { data: learnRow } = await db
      .from('ai_learning')
      .select('frequenza,confidence_score,ultimo_utilizzo')
      .eq('societa_id', societaId)
      .eq('anagrafica_id', anag.id)
      .eq('conto_id', account_used.conto_id)
      .order('frequenza', { ascending: false })
      .limit(1)
    learningFrequenzaForAccount = Number(learnRow?.[0]?.frequenza) || 0
  }

  const mappedTimes =
    learningFrequenzaForAccount > 0 ? learningFrequenzaForAccount : ctxBase?.priorSameContoCount ?? 0

  const bucket = classifyAccountBucket(pcPrimary || { codice: account_used?.codice, descrizione: account_used?.descrizione })
  const supplierName = String(doc?.soggetto_denominazione || pn.cliente_fornitore_nome || '').trim()

  const why_account_chosen = [
    ai_explanation_stored ? `Persistito su accounting_entry: ${ai_explanation_stored}` : null,
    whyShort ? `Motore auto-validazione: ${whyShort}` : null,
    ai_source ? `Fonte logica AI: ${aiSourceLabelIt(ai_source)}.` : null,
    !doc ? 'Documento collegato non trovato: spiegazione basata solo su righe prima nota.' : null,
  ]
    .filter(Boolean)
    .join(' ')

  const b = evalResult?.breakdown || entryRow?.auto_validate_meta || {}
  const historical_usage = doc
    ? [
        ctxBase?.priorSameContoCount != null
          ? `Stesso conto su altri documenti con stessa P.IVA: ${ctxBase.priorSameContoCount} occorrenze (campione recente).`
          : null,
        learningFrequenzaForAccount > 0
          ? `Tabella ai_learning per questa anagrafica e conto: frequenza ${learningFrequenzaForAccount}.`
          : ctxBase?.learningMatch?.frequenza
            ? `Miglior conto in ai_learning per l’anagrafica: frequenza ${ctxBase.learningMatch.frequenza} (può differire dal conto della riga).`
            : null,
        ctxBase?.dominantContoCount > 0
          ? `Conto più usato nello storico documenti del soggetto: ${ctxBase.dominantContoCount} documenti.`
          : null,
        ctxBase?.isNewAnagrafica ? 'Soggetto considerato nuovo nello storico documenti recenti.' : null,
      ]
        .filter(Boolean)
        .join(' ') || 'Storico non disponibile o campione vuoto.'
    : 'Collegare un documento contabilità per calcolare lo storico fornitore e ai_learning.'

  const imponibileSum = (righe || []).reduce((s, r) => s + parseRowAmount(r.imponibile), 0)
  const ivaSum = (righe || []).reduce((s, r) => s + parseRowAmount(r.iva), 0)
  const tipoDoc = String(doc?.tipo_documento || '').trim()
  const fiscal_reasoning = doc
    ? [
        tipoDoc ? `Tipo documento: ${tipoDoc}.` : null,
        imponibileSum || ivaSum
          ? `Righe PN: imponibile complessivo indicativo €${round2(imponibileSum)}, IVA €${round2(ivaSum)} (da righe).`
          : null,
        doc.causale_iva
          ? `Causale IVA documento presente in anagrafica documento (verificare registro acquisti/vendite).`
          : null,
        /passiv/i.test(tipoDoc)
          ? 'Schema tipico acquisti: costo e IVA a credito in dare, debito verso fornitore in avere.'
          : /attiv/i.test(tipoDoc)
            ? 'Schema tipico vendite: credito cliente in dare, ricavo e IVA a debito in avere.'
            : null,
      ]
        .filter(Boolean)
        .join(' ')
    : `Testata PN: ${pn.causale_codice || 'causale n/d'}; verificare registrazione IVA in base a causale e registro società.`

  const summary = buildSummaryLine({
    codice: account_used?.codice,
    supplierName,
    mappedTimes,
    bucket,
    ai_source,
  })

  return {
    prima_nota_id: id,
    document_linked: Boolean(doc),
    document_link_hint: document_link,
    document_id: doc?.id || null,
    accounting_entry_id,
    account_used,
    ai_source,
    ai_source_label_it: aiSourceLabelIt(ai_source),
    ai_confidence,
    ai_explanation: ai_explanation_stored || whyShort || null,
    explanation: {
      why_account_chosen: why_account_chosen || 'Dati insufficienti per una motivazione automatica.',
      historical_usage,
      fiscal_reasoning,
    },
    summary,
    breakdown: truncateJson(b, 4000),
    prima_nota: truncateJson(
      {
        id: pn.id,
        data_registrazione: pn.data_registrazione,
        numero_documento: pn.numero_documento,
        descrizione: pn.descrizione,
        stato: pn.stato,
        causale_codice: pn.causale_codice,
        cliente_fornitore_nome: pn.cliente_fornitore_nome,
      },
      6000
    ),
    righe: (righe || []).map((r) =>
      truncateJson(
        {
          riga_numero: r.riga_numero,
          conto_id: r.conto_id,
          conto_codice: r.conto_codice,
          conto_descrizione: r.conto_descrizione,
          descrizione_riga: r.descrizione_riga,
          importo_dare: r.importo_dare,
          importo_avere: r.importo_avere,
          imponibile: r.imponibile,
          iva: r.iva,
        },
        3000
      )
    ),
    righe_count: (righe || []).length,
  }
}

async function toolExplainEntry(db, societaId, input) {
  const primaNotaId = input.prima_nota_id != null ? String(input.prima_nota_id).trim() : ''
  return explainPrimaNotaEntry(db, societaId, primaNotaId)
}

const ALLOWED_STATUS = new Set(['CREATED', 'DRAFT', 'AI_PROPOSED', 'VALIDATED', 'REJECTED', 'APPROVED', 'PENDING'])

async function toolUpdateEntries(db, societaId, input) {
  const ids = Array.isArray(input.ids) ? input.ids.map((x) => String(x).trim()).filter(Boolean) : []
  const changes = input.changes && typeof input.changes === 'object' ? input.changes : null

  if (!ids.length) return { error: 'ids (array di UUID accounting_entries) obbligatorio.', updated: [] }
  if (!changes || !Object.keys(changes).length) return { error: 'changes obbligatorio con almeno un campo consentito.', updated: [] }

  const patch = {}
  if (changes.status != null) {
    const s = String(changes.status).trim()
    if (!ALLOWED_STATUS.has(s)) {
      return { error: `status non consentito. Valori: ${[...ALLOWED_STATUS].join(', ')}`, updated: [] }
    }
    patch.status = s
  }
  if (changes.ai_explanation != null) patch.ai_explanation = String(changes.ai_explanation).slice(0, 500)
  const dataDelta = changes.data != null && typeof changes.data === 'object' ? changes.data : null

  if (!Object.keys(patch).length && !dataDelta) {
    return { error: 'Nessun campo aggiornabile in changes (consentiti: status, ai_explanation, data oggetto da fondere con data esistente).', updated: [] }
  }

  const { data: entries, error: eErr } = await db.from('accounting_entries').select('id,document_id,data').in('id', ids)
  if (eErr) return { error: eErr.message, updated: [] }

  const allowedIds = []
  for (const e of entries || []) {
    const { data: doc } = await db
      .from('documenti_contabilita')
      .select('id')
      .eq('id', e.document_id)
      .eq('societa_id', societaId)
      .maybeSingle()
    if (doc) allowedIds.push(e.id)
  }

  if (!allowedIds.length) return { error: 'Nessun id appartiene a documenti di questa società.', updated: [] }

  const idSet = new Set(allowedIds.map(String))
  const scalarPatch = { ...patch }
  for (const e of entries || []) {
    if (!idSet.has(String(e.id))) continue
    const rowUpdate = { ...scalarPatch }
    if (dataDelta) {
      rowUpdate.data = { ...(e.data && typeof e.data === 'object' ? e.data : {}), ...dataDelta }
    }
    if (!Object.keys(rowUpdate).length) continue
    const { error: uErr } = await db.from('accounting_entries').update(rowUpdate).eq('id', e.id)
    if (uErr) return { error: uErr.message, updated: [] }
  }

  const applied = [...Object.keys(patch), ...(dataDelta ? ['data (merge)'] : [])]
  return { updated: allowedIds, count: allowedIds.length, applied }
}

/** Definizioni tool per Anthropic Messages API */
export const COPILOT_ACCOUNTING_ANTHROPIC_TOOLS = [
  {
    name: 'get_entries',
    description:
      'Legge le scritture contabili (accounting_entries) per un documento della società. Usa sempre questo tool per fatti su stati, righe, punteggi AI — non supporre dati non restituiti qui.',
    input_schema: {
      type: 'object',
      properties: {
        document_id: {
          type: 'string',
          description: 'ID documento contabilità; se omesso nel contesto viene usato il documento aperto.',
        },
        society_wide: {
          type: 'boolean',
          description: 'Se true, ultime scritture su tutti i documenti della società (limitate), ignorando document_id singolo.',
        },
        status: { type: 'string', description: 'Filtro opzionale su status scrittura (es. CREATED, AI_PROPOSED).' },
        limit: { type: 'integer', description: 'Numero massimo di scritture (default 15, max 40).' },
      },
      required: [],
    },
  },
  {
    name: 'get_partitario',
    description:
      'Elenco movimenti dalla tabella partitari per un soggetto identificato dall’anagrafica piano conti (UUID). Richiede P.IVA allineata a tabella clienti.',
    input_schema: {
      type: 'object',
      properties: {
        anagrafica_id: { type: 'string', description: 'UUID del conto piano anagrafica (fornitore/cliente).' },
      },
      required: ['anagrafica_id'],
    },
  },
  {
    name: 'get_balance',
    description:
      'Saldi aggregati per conto (dare/avere/saldo) calcolati dalle righe in accounting_entries dei documenti della società. Usa per bilanci parziali / conti più movimentati; campione limitato.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'explain_entry',
    description:
      'Spiega una registrazione prima nota: conto costo/ricavo usato, ai_source/ai_confidence da accounting_entry (se collegato), testo motivazione (storico/learning/pattern), reasoning fiscale e summary tipo "Account 601000 selected because…".',
    input_schema: {
      type: 'object',
      properties: {
        prima_nota_id: { type: 'string', description: 'UUID registrazione prima nota.' },
      },
      required: ['prima_nota_id'],
    },
  },
  {
    name: 'update_entries',
    description:
      'Aggiorna accounting_entries solo se collegate a documenti della società. Consentiti: status (whitelist), ai_explanation, oppure data (merge superficiale con data esistente per ogni id).',
    input_schema: {
      type: 'object',
      properties: {
        ids: { type: 'array', items: { type: 'string' }, description: 'UUID accounting_entries da aggiornare.' },
        changes: {
          type: 'object',
          description: 'Campi: status, ai_explanation, data (oggetto; viene fuso con data corrente).',
        },
      },
      required: ['ids', 'changes'],
    },
  },
]
