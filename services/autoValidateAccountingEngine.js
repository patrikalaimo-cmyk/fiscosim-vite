/**
 * Auto Validate Engine: punteggio 0–100, ai_status, ai_source per accounting_entries.
 *
 * Regole:
 * +50 storico mapping piano conti (conto anagrafica legato a P.IVA fornitore/cliente)
 * +30 stessa anagrafica ha già usato lo stesso conto nelle ultime registrazioni (documenti_contabilita)
 * +20 proposta (conto documento / righe AI) coincide con conto modale storico per quella P.IVA
 * -20 anagrafica nuova (nessun documento precedente con stessa P.IVA)
 */

export function normPiva(v) {
  if (v == null) return ''
  return String(v)
    .replace(/\s/g, '')
    .replace(/^IT/i, '')
    .toUpperCase()
}

function toNum(v) {
  if (v == null || v === '') return 0
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\s/g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

function statusFromScore(score) {
  if (score > 90) return 'auto'
  if (score >= 70) return 'review'
  return 'manual'
}

function sourceFromSignals({ hasAnagraficaMapping, hasPatternSignal }) {
  if (hasAnagraficaMapping) return 'memory'
  if (hasPatternSignal) return 'pattern'
  return 'fallback'
}

const MAX_AI_EXPLANATION_LEN = 200

function clampExplanation(s) {
  const t = String(s || '').trim()
  if (t.length <= MAX_AI_EXPLANATION_LEN) return t
  return `${t.slice(0, MAX_AI_EXPLANATION_LEN - 1)}…`
}

function codiceContoDisplay(pianoConti, contoId) {
  if (!contoId || !Array.isArray(pianoConti)) return null
  const c = pianoConti.find((x) => String(x.id) === String(contoId))
  if (!c) return null
  const code = String(c.codice || '').replace(/\s+/g, '').trim()
  return code || String(c.descrizione || '').slice(0, 32).trim() || null
}

function supplierLabel(documentRow) {
  const n = String(documentRow?.soggetto_denominazione || '').trim()
  if (!n) return 'questo fornitore'
  if (n.length <= 28) return n
  return `${n.slice(0, 25)}…`
}

/**
 * Frase breve (≤200 caratteri) per operatore.
 *
 * @param {{
 *   evalResult: ReturnType<typeof evaluateAutoValidateScore>,
 *   pianoConti: object[],
 *   documentRow: object | null,
 *   priorSameContoCount: number,
 *   dominantContoCount: number,
 * }} p
 */
export function generateAutoValidateExplanation({
  evalResult,
  pianoConti,
  documentRow,
  priorSameContoCount = 0,
  dominantContoCount = 0,
}) {
  const b = evalResult?.breakdown || {}
  const cod = codiceContoDisplay(pianoConti, evalResult?.proposedContoId) || '—'
  const sup = supplierLabel(documentRow)

  let text = ''

  if ((b.ai_learning_frequenza || 0) > 2 && evalResult?.ai_source === 'learning' && evalResult?.proposedContoId) {
    const f = b.ai_learning_frequenza
    text = `Conto ${cod}: apprendimento da ${f} utilizzi confermati/corretti per ${sup}.`
  } else if (priorSameContoCount > 0 && evalResult?.proposedContoId) {
    const volte = priorSameContoCount === 1 ? '1 volta' : `${priorSameContoCount} volte`
    text = `Conto ${cod}: ${sup} ha usato questo conto ${volte} in passato.`
  } else if (b.ai_pattern_storico && dominantContoCount > 0 && evalResult?.proposedContoId) {
    const volte = dominantContoCount === 1 ? '1 documento' : `${dominantContoCount} documenti`
    text = `Conto ${cod}: è il più usato per ${sup} (${volte} precedenti).`
  } else if (b.mapping_piano_anagrafica && evalResult?.proposedContoId) {
    text = `Conto ${cod}: collegamento anagrafica sul piano dei conti per ${sup}.`
  } else if (b.nuova_anagrafica && evalResult?.proposedContoId) {
    text = `Fornitore nuovo; conto ${cod} da verificare con attenzione.`
  } else if (evalResult?.proposedContoId) {
    text = `Conto ${cod}: pochi segnali dallo storico; revisione consigliata.`
  } else {
    text = 'Nessun conto proposto con certezza; assegnazione manuale consigliata.'
  }

  return clampExplanation(text)
}

/**
 * Trova conto piano collegato in anagrafica alla P.IVA (fornitore/cliente).
 */
export function findAnagraficaConto(pianoConti, pivaNorm) {
  if (!pivaNorm || !Array.isArray(pianoConti)) return null
  return (
    pianoConti.find((c) => {
      const p = normPiva(c.partita_iva || c.anagrafica_piva)
      return p && p === pivaNorm && (c.is_fornitore || c.is_cliente) && c.livello >= 3
    }) || null
  )
}

/**
 * Match etichetta riga AI (codice o descrizione) a piano_conti.
 */
function matchContoLabelToAccount(label, pianoConti) {
  const L = String(label || '').trim().toLowerCase()
  if (!L || !Array.isArray(pianoConti)) return null
  const byCode = pianoConti.find((c) => {
    const cod = String(c.codice || '').trim().toLowerCase()
    return cod && (L === cod || L.startsWith(cod) || L.includes(cod))
  })
  if (byCode) return byCode
  return (
    pianoConti.find((c) => {
      const d = String(c.descrizione || '').trim().toLowerCase()
      return d.length >= 4 && (L.includes(d.slice(0, 24)) || d.includes(L.slice(0, 24)))
    }) || null
  )
}

/**
 * Stima conto principale costo/ricavo dalle righe AI.
 */
export function inferContoIdFromAccountingRows(rows, pianoConti) {
  const arr = Array.isArray(rows) ? rows : []
  let bestId = null
  let bestAmt = 0
  for (const r of arr) {
    const amt = Math.max(toNum(r.dare), toNum(r.avere))
    const label = r.conto ?? r.codice_conto ?? r.descrizione_conto ?? ''
    const pc = matchContoLabelToAccount(label, pianoConti)
    if (pc?.id && amt >= bestAmt) {
      bestAmt = amt
      bestId = pc.id
    }
  }
  return bestId
}

/**
 * Calcola punteggio e metadati (senza scrivere sul DB).
 *
 * @param {{
 *   documentRow: object | null,
 *   entryData: object,
 *   pianoConti: object[],
 *   priorSameContoCount: number,
 *   dominantContoId: string | null,
 *   isNewAnagrafica: boolean,
 *   learningMatch?: { contoId: string, frequenza: number } | null,
 * }} ctx
 */
export function evaluateAutoValidateScore(ctx) {
  const {
    documentRow,
    entryData,
    pianoConti,
    priorSameContoCount = 0,
    dominantContoId = null,
    isNewAnagrafica = false,
    learningMatch = null,
  } = ctx

  const pivaNorm = normPiva(documentRow?.soggetto_piva)
  const docContoId = documentRow?.conto_id || null
  const rows = entryData?.rows
  const inferredFromAi = inferContoIdFromAccountingRows(rows, pianoConti || [])

  const strongLearning =
    learningMatch &&
    Number(learningMatch.frequenza) > 2 &&
    learningMatch.contoId != null &&
    learningMatch.contoId !== ''

  let proposedContoId = null
  if (strongLearning) {
    proposedContoId = learningMatch.contoId
  } else {
    proposedContoId = docContoId || inferredFromAi || null
  }

  const anagConto = findAnagraficaConto(pianoConti || [], pivaNorm)
  const hasAnagraficaMapping = Boolean(anagConto?.id)

  const breakdown = {
    mapping_piano_anagrafica: 0,
    stessa_anagrafica_stesso_conto: 0,
    ai_pattern_storico: 0,
    nuova_anagrafica: 0,
    ai_learning_frequenza: 0,
    combined_boost: 0,
  }

  if (strongLearning) {
    const fq = Number(learningMatch.frequenza) || 0
    breakdown.ai_learning_frequenza = fq
    let score = fq > 5 ? 95 : 85
    const agreesDominant =
      dominantContoId && String(dominantContoId) === String(learningMatch.contoId)
    if (priorSameContoCount > 0) {
      breakdown.combined_boost = 5
      score = Math.min(100, score + 5)
    } else if (agreesDominant) {
      breakdown.combined_boost = 5
      score = Math.min(100, score + 5)
    }
    score = Math.max(0, Math.min(100, Math.round(score)))
    const ai_status = statusFromScore(score)
    return {
      ai_confidence: score,
      ai_status,
      ai_source: 'learning',
      proposedContoId,
      pivaNorm,
      breakdown,
    }
  }

  breakdown.ai_learning_frequenza = 0

  let score = 0

  if (hasAnagraficaMapping) {
    breakdown.mapping_piano_anagrafica = 50
    score += 50
  }

  if (pivaNorm && proposedContoId && priorSameContoCount > 0) {
    breakdown.stessa_anagrafica_stesso_conto = 30
    score += 30
  }

  if (
    pivaNorm &&
    proposedContoId &&
    dominantContoId &&
    String(proposedContoId) === String(dominantContoId)
  ) {
    breakdown.ai_pattern_storico = 20
    score += 20
  }

  if (isNewAnagrafica && pivaNorm) {
    breakdown.nuova_anagrafica = -20
    score -= 20
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const ai_status = statusFromScore(score)
  const hasPatternSignal =
    breakdown.stessa_anagrafica_stesso_conto > 0 || breakdown.ai_pattern_storico > 0
  const ai_source = sourceFromSignals({ hasAnagraficaMapping, hasPatternSignal })

  return {
    ai_confidence: score,
    ai_status,
    ai_source,
    proposedContoId,
    pivaNorm,
    breakdown,
  }
}

/**
 * Carica contesto storico da Supabase per un documento contabilità.
 */
export async function loadAutoValidateContext(db, { documentRow, proposedContoId }) {
  if (!documentRow?.societa_id || !db) {
    return {
      priorSameContoCount: 0,
      dominantContoId: null,
      dominantContoCount: 0,
      isNewAnagrafica: false,
      pianoConti: [],
      learningMatch: null,
    }
  }

  const societaId = documentRow.societa_id
  const piva = documentRow.soggetto_piva
  const docId = documentRow.id

  const { data: pianoConti, error: pcErr } = await db
    .from('piano_conti')
    .select('id,codice,descrizione,partita_iva,anagrafica_piva,is_fornitore,is_cliente,livello')
    .eq('societa_id', societaId)
    .eq('attivo', true)

  if (pcErr) {
    console.warn('[autoValidate] piano_conti', pcErr.message)
  }

  const pcList = pianoConti || []
  const anagForLearning = findAnagraficaConto(pcList, normPiva(piva))
  let learningMatch = null
  if (anagForLearning?.id) {
    const { data: learnRows, error: lErr } = await db
      .from('ai_learning')
      .select('conto_id, frequenza, confidence_score, ultimo_utilizzo')
      .eq('societa_id', societaId)
      .eq('anagrafica_id', anagForLearning.id)
      .order('frequenza', { ascending: false })
      .order('confidence_score', { ascending: false })
      .order('ultimo_utilizzo', { ascending: false })
      .limit(1)
    if (lErr) {
      console.warn('[autoValidate] ai_learning', lErr.message)
    } else {
      const top = learnRows?.[0]
      if (top?.conto_id != null && top.conto_id !== '') {
        learningMatch = { contoId: top.conto_id, frequenza: Number(top.frequenza) || 0 }
      }
    }
  }

  const strongLearning =
    learningMatch && Number(learningMatch.frequenza) > 2 && learningMatch.contoId != null && learningMatch.contoId !== ''
  const statsContoId = strongLearning ? learningMatch.contoId : proposedContoId

  let priorSameContoCount = 0
  const contoHistogram = new Map()
  let isNewAnagrafica = false

  if (piva) {
    const { data: docs, error: dErr } = await db
      .from('documenti_contabilita')
      .select('id, conto_id, created_at')
      .eq('societa_id', societaId)
      .eq('soggetto_piva', piva)
      .order('created_at', { ascending: false })
      .limit(40)

    if (dErr) {
      console.warn('[autoValidate] documenti_contabilita', dErr.message)
    } else {
      const list = docs || []
      const others = docId ? list.filter((d) => d.id !== docId) : list
      isNewAnagrafica = others.length === 0
      for (const d of others) {
        if (statsContoId && d.conto_id && String(d.conto_id) === String(statsContoId)) {
          priorSameContoCount += 1
        }
        if (d.conto_id) {
          const k = String(d.conto_id)
          contoHistogram.set(k, (contoHistogram.get(k) || 0) + 1)
        }
      }
    }
  }

  let dominantContoId = null
  let maxC = 0
  for (const [cid, c] of contoHistogram) {
    if (c > maxC) {
      maxC = c
      dominantContoId = cid
    }
  }

  return {
    pianoConti: pcList,
    priorSameContoCount,
    dominantContoId: maxC > 0 ? dominantContoId : null,
    dominantContoCount: maxC > 0 ? maxC : 0,
    isNewAnagrafica,
    learningMatch,
  }
}

/**
 * Valuta e aggiorna una riga accounting_entries; ritorna entry arricchita.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} db
 * @param {string} entryId
 * @param {{ log?: function }} [options]
 */
export async function enrichAndPersistAccountingEntry(db, entryId, options = {}) {
  const { log } = options
  if (!db || !entryId) return null

  const { data: entry, error: e0 } = await db.from('accounting_entries').select('*').eq('id', entryId).maybeSingle()
  if (e0 || !entry) {
    log?.('AUTO_VALIDATE_SKIP', { entryId, reason: 'entry_not_found' })
    return null
  }

  const documentId = entry.document_id
  const { data: documentRow } = await db.from('documenti_contabilita').select('*').eq('id', documentId).maybeSingle()

  const entryData = typeof entry.data === 'object' && entry.data ? entry.data : {}
  const tempPiano = documentRow?.societa_id
    ? (
        await db
          .from('piano_conti')
          .select('id,codice,descrizione,partita_iva,anagrafica_piva,is_fornitore,is_cliente,livello')
          .eq('societa_id', documentRow.societa_id)
          .eq('attivo', true)
      ).data
    : []

  const proposedGuess = documentRow?.conto_id || inferContoIdFromAccountingRows(entryData?.rows, tempPiano || [])

  const ctxBase = await loadAutoValidateContext(db, {
    documentRow,
    proposedContoId: proposedGuess,
  })

  const evalResult = evaluateAutoValidateScore({
    documentRow,
    entryData,
    pianoConti: ctxBase.pianoConti,
    priorSameContoCount: ctxBase.priorSameContoCount,
    dominantContoId: ctxBase.dominantContoId,
    isNewAnagrafica: ctxBase.isNewAnagrafica,
    learningMatch: ctxBase.learningMatch,
  })

  const ai_explanation = generateAutoValidateExplanation({
    evalResult,
    pianoConti: ctxBase.pianoConti,
    documentRow,
    priorSameContoCount: ctxBase.priorSameContoCount,
    dominantContoCount: ctxBase.dominantContoCount ?? 0,
  })

  const auto_validate_meta = {
    ...evalResult.breakdown,
    proposedContoId: evalResult.proposedContoId,
    document_id: documentId,
    evaluated_at: new Date().toISOString(),
  }

  const { data: updated, error: upErr } = await db
    .from('accounting_entries')
    .update({
      ai_confidence: evalResult.ai_confidence,
      ai_status: evalResult.ai_status,
      ai_source: evalResult.ai_source,
      ai_explanation,
      auto_validate_meta,
    })
    .eq('id', entryId)
    .select('*')
    .maybeSingle()

  if (upErr) {
    log?.('AUTO_VALIDATE_PERSIST_ERROR', { entryId, message: upErr.message })
    return { ...entry, ...evalResult, ai_explanation, auto_validate_meta }
  }

  log?.('AUTO_VALIDATE_DONE', {
    entryId,
    documentId,
    ai_confidence: evalResult.ai_confidence,
    ai_status: evalResult.ai_status,
    ai_source: evalResult.ai_source,
    ai_explanation,
  })

  return updated || { ...entry, ...evalResult, ai_explanation, auto_validate_meta }
}

/**
 * Batch: entryIds o tutte le entry per document_id in lista.
 *
 * @returns {Promise<{ ok: true, entries: object[] } | { ok: false, error: string }>}
 */
export async function runAutoValidateOnAccountingEntries(db, { entryIds = null, documentIds = null } = {}) {
  if (!db) return { ok: false, error: 'db mancante' }
  try {
    let rows = []
    if (Array.isArray(entryIds) && entryIds.length) {
      const { data, error } = await db.from('accounting_entries').select('*').in('id', entryIds)
      if (error) return { ok: false, error: error.message }
      rows = data || []
    } else if (Array.isArray(documentIds) && documentIds.length) {
      const { data, error } = await db.from('accounting_entries').select('*').in('document_id', documentIds)
      if (error) return { ok: false, error: error.message }
      rows = data || []
    } else {
      return { ok: false, error: 'entryIds o documentIds richiesti' }
    }

    const out = []
    for (const row of rows) {
      const enriched = await enrichAndPersistAccountingEntry(db, row.id, {})
      if (enriched) out.push(enriched)
    }
    return { ok: true, entries: out }
  } catch (e) {
    return { ok: false, error: e?.message || String(e) }
  }
}

export async function maybeAutoValidateAfterPersist(db, entry, log) {
  if (!entry?.id) return entry
  try {
    const enriched = await enrichAndPersistAccountingEntry(db, entry.id, { log })
    return enriched || entry
  } catch (e) {
    log?.('AUTO_VALIDATE_ERROR', { message: e?.message || String(e) })
    return entry
  }
}
