import { normalizeTopSuggestions } from './historicalContoSuggestions.js'

const LEGAL_SUFFIXES = [
  'srl',
  's.r.l',
  'spa',
  's.p.a',
  'sas',
  's.a.s',
  'snc',
  's.n.c',
  'srls',
  's.r.l.s',
  'stp',
  'coop',
  'cooperativa',
  'societa',
  'società',
  'studio',
  'ditta',
  'impresa',
]

const ACCOUNT_KEYWORDS = [
  { label: 'arredamento', terms: ['arredamento', 'mobili', 'mobilio', 'cespiti', 'piccoli cespiti', 'attrezzature', 'impianti', 'macchinari'] },
  { label: 'tecnologia', terms: ['software', 'hardware', 'computer', 'pc', 'licenze', 'hosting', 'cloud', 'telefoni', 'telefonia', 'internet'] },
  { label: 'ufficio', terms: ['cancelleria', 'materiale di consumo', 'materiale ufficio', 'cartoleria', 'stampanti', 'stampa'] },
  { label: 'servizi', terms: ['consulenza', 'consulenze', 'servizi', 'prestazioni', 'onorari', 'professionali'] },
  { label: 'trasporti', terms: ['trasporto', 'trasporti', 'spedizione', 'spedizioni', 'corriere', 'logistica'] },
  { label: 'utenze', terms: ['energia', 'elettricita', 'gas', 'acqua', 'telefonia', 'internet'] },
  { label: 'locazioni', terms: ['affitto', 'locazione', 'noleggio', 'canone'] },
  { label: 'marketing', terms: ['pubblicita', 'pubblicità', 'marketing', 'sponsorizzazione', 'omaggi'] },
  { label: 'viaggi', terms: ['viaggio', 'viaggi', 'trasferta', 'hotel', 'albergo', 'ristorante'] },
  { label: 'manutenzioni', terms: ['manutenzione', 'riparazione', 'riparazioni', 'assistenza'] },
]

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeVat(value) {
  return String(value || '')
    .replace(/\s+/g, '')
    .replace(/^IT/i, '')
    .replace(/[^0-9a-z]/gi, '')
    .toUpperCase()
    .trim()
}

function stripLegalSuffixes(value) {
  const raw = normalizeText(value)
  if (!raw) return ''
  const tokens = raw.split(' ').filter(Boolean)
  const cleaned = tokens.filter((token) => !LEGAL_SUFFIXES.includes(token))
  return cleaned.join(' ').trim()
}

function uniqueById(rows) {
  const seen = new Set()
  const out = []
  for (const row of rows || []) {
    const id = String(row?.id || '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(row)
  }
  return out
}

function collectDocText(doc = {}) {
  const dati = doc?.dati_estratti && typeof doc.dati_estratti === 'string'
    ? (() => {
        try {
          return JSON.parse(doc.dati_estratti)
        } catch {
          return {}
        }
      })()
    : (doc?.dati_estratti || {})

  const rawLines = Array.isArray(dati?.linee) ? dati.linee : []
  const rawRiepilogo = Array.isArray(dati?.riepilogo_iva) ? dati.riepilogo_iva : []

  return normalizeText([
    doc?.soggetto_denominazione,
    doc?.ai_summary,
    doc?.filename,
    dati?.cedente_denom,
    dati?.cessionario_denom,
    dati?.causale,
    dati?.contenuto,
    ...(doc?.ai_raw_response?.linee || []).map((r) => r?.descrizione || r?.desc || ''),
    ...(doc?.ai_raw_response?.riepilogo_iva || []).map((r) => r?.natura || ''),
    ...rawLines.map((r) => r?.descrizione || r?.desc || r?.articolo || ''),
    ...rawRiepilogo.map((r) => r?.natura || ''),
  ].filter(Boolean).join(' | '))
}

function collectCounterpartyData(doc = {}) {
  const dati = doc?.dati_estratti && typeof doc.dati_estratti === 'string'
    ? (() => {
        try {
          return JSON.parse(doc.dati_estratti)
        } catch {
          return {}
        }
      })()
    : (doc?.dati_estratti || {})

  return {
    piva: normalizeVat(doc?.soggetto_piva || dati?.cedente_piva || dati?.cessionario_piva || ''),
    cf: normalizeVat(doc?.soggetto_cf || dati?.cedente_cf || dati?.cessionario_cf || ''),
    nome: stripLegalSuffixes(doc?.soggetto_denominazione || dati?.cedente_denom || dati?.cessionario_denom || ''),
    rawNome: normalizeText(doc?.soggetto_denominazione || dati?.cedente_denom || dati?.cessionario_denom || ''),
  }
}

function scoreKeywordSuggestion(conto, docText, docTokens) {
  const contoText = normalizeText([conto?.codice, conto?.descrizione].filter(Boolean).join(' '))
  let score = 0
  const reasons = []

  for (const group of ACCOUNT_KEYWORDS) {
    const hit = group.terms.find((term) => docText.includes(term) || contoText.includes(term))
    if (!hit) continue
    const groupHit = group.terms.some((term) => docText.includes(term) && contoText.includes(term))
    const pts = groupHit ? 45 : 28
    score += pts
    reasons.push(group.label)
  }

  if (docTokens.length > 0) {
    const contoTokens = new Set(contoText.split(' ').filter(Boolean))
    const overlap = docTokens.filter((token) => contoTokens.has(token)).length
    if (overlap > 0) {
      score += Math.min(20, overlap * 6)
      reasons.push(`testo comune ${overlap}`)
    }
  }

  return { score, reasons }
}

export function suggestContiPerDocumento({ doc, pianoConti = [], maxResults = 3 } = {}) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  if (!list.length) return []

  const docText = collectDocText(doc)
  const docTokens = docText.split(' ').filter((token) => token.length >= 4)
  const cp = collectCounterpartyData(doc)
  const tipo = String(doc?.tipo_documento || '').toLowerCase()
  const isPassiva = tipo.includes('passiva') || tipo.includes('td01') || tipo.includes('td24') || tipo.includes('td25') || tipo.includes('td27') || tipo.includes('td28') || tipo.includes('td29')

  const candidates = list
    .filter((conto) => conto && !conto.is_iva && Number(conto.livello || 0) >= 3)
    .map((conto) => {
      const contoText = normalizeText([conto.codice, conto.descrizione].filter(Boolean).join(' '))
      let score = 0
      const reasons = []

      if (cp.piva && (normalizeVat(conto.partita_iva) === cp.piva || normalizeVat(conto.anagrafica_piva) === cp.piva)) {
        score += 100
        reasons.push('P.IVA corrispondente')
      }
      if (cp.cf && (normalizeVat(conto.codice_fiscale) === cp.cf || normalizeVat(conto.anagrafica_cf) === cp.cf)) {
        score += 96
        reasons.push('Codice fiscale corrispondente')
      }

      if (cp.rawNome && contoText.includes(cp.rawNome)) {
        score += 70
        reasons.push('Denominazione simile')
      } else if (cp.nome && contoText.includes(cp.nome)) {
        score += 55
        reasons.push('Denominazione normalizzata')
      }

      const keywordScore = scoreKeywordSuggestion(conto, docText, docTokens)
      score += keywordScore.score
      reasons.push(...keywordScore.reasons)

      if (isPassiva && /arred|mobil|cespit|attrezz|impiant/i.test(contoText)) {
        score += 18
        reasons.push('Coerente con acquisto / cespite')
      }
      if (!isPassiva && /ricavi|vendite|prestaz|servizi/i.test(contoText)) {
        score += 18
        reasons.push('Coerente con ricavo')
      }

      return {
        id: conto.id,
        codice: conto.codice || '',
        descrizione: conto.descrizione || conto.nome || '',
        rawScore: score,
        reasons: Array.from(new Set(reasons)).filter(Boolean).slice(0, 4),
      }
    })
    .filter((row) => row.rawScore > 0)
    .sort((a, b) => b.rawScore - a.rawScore || String(a.codice).localeCompare(String(b.codice), 'it'))

  return normalizeTopSuggestions(uniqueById(candidates), maxResults)
}

export function matchContropartePerDocumento({ doc, pianoConti = [] } = {}) {
  const list = Array.isArray(pianoConti) ? pianoConti : []
  if (!list.length) return null

  const cp = collectCounterpartyData(doc)
  const docName = cp.rawNome
  if (!cp.piva && !cp.cf && !docName) return null

  const strongMatches = list
    .filter((conto) => conto && Number(conto.livello || 0) >= 3)
    .map((conto) => {
      const contoName = stripLegalSuffixes(conto.descrizione || conto.nome || '')
      let score = 0
      const reasons = []
      if (cp.piva && (normalizeVat(conto.partita_iva) === cp.piva || normalizeVat(conto.anagrafica_piva) === cp.piva)) {
        score += 100
        reasons.push('P.IVA corrispondente')
      }
      if (cp.cf && (normalizeVat(conto.codice_fiscale) === cp.cf || normalizeVat(conto.anagrafica_cf) === cp.cf)) {
        score += 95
        reasons.push('CF corrispondente')
      }
      if (docName && stripLegalSuffixes(contoName) === stripLegalSuffixes(docName)) {
        score += 80
        reasons.push('Ragione sociale normalizzata')
      }
      return {
        conto,
        score,
        reasons,
      }
    })
    .filter((row) => row.score >= 80)
    .sort((a, b) => b.score - a.score)

  const best = strongMatches[0]
  if (!best) return null

  return {
    id: best.conto.id,
    codice: best.conto.codice || '',
    descrizione: best.conto.descrizione || '',
    score: best.score,
    reasons: best.reasons,
    conto: best.conto,
  }
}
