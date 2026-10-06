const EPS = 0.01

function toNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function normalizeConfidence(v) {
  if (v == null) return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  if (n > 1) return Math.max(0, Math.min(1, n / 100))
  return Math.max(0, Math.min(1, n))
}

function sumRows(rows) {
  let dare = 0
  let avere = 0
  for (const r of rows || []) {
    const d = toNum(r?.importo_dare ?? r?.dare ?? 0) || 0
    const a = toNum(r?.importo_avere ?? r?.avere ?? 0) || 0
    dare += d
    avere += a
  }
  return { dare, avere }
}

function pushReason(reasons, code, severity, message) {
  reasons.push({ code, severity, message })
}

export function evaluateDraftReliability({ doc = {}, form = null, righe = null } = {}) {
  const reasons = []
  let score = 100

  const confidence = normalizeConfidence(doc?.confidence ?? doc?.ai_confidence ?? form?.confidence)
  if (confidence != null) {
    if (confidence < 0.4) {
      score -= 30
      pushReason(reasons, 'PARSE_CONF_LOW', 'warning', 'Confidenza parsing bassa')
    } else if (confidence < 0.6) {
      score -= 20
      pushReason(reasons, 'PARSE_CONF_MED', 'warning', 'Confidenza parsing media')
    } else if (confidence < 0.75) {
      score -= 10
      pushReason(reasons, 'PARSE_CONF_OK', 'info', 'Confidenza parsing discreta')
    }
  } else {
    score -= 5
    pushReason(reasons, 'PARSE_CONF_UNKNOWN', 'info', 'Confidenza parsing non disponibile')
  }

  const piva =
    form?.cedente_piva ||
    form?.cessionario_piva ||
    doc?.soggetto_piva ||
    doc?.soggetto_cf ||
    form?.cedente_cf ||
    form?.cessionario_cf
  const nome =
    form?.cedente_denom || form?.cessionario_denom || doc?.soggetto_denominazione || doc?.cliente_fornitore_nome
  if (!piva && !nome && !doc?.cliente_id && !form?.cliente_id) {
    score -= 20
    pushReason(reasons, 'SUBJECT_MISSING', 'warning', 'Soggetto non risolto')
  } else if (!piva && nome) {
    score -= 10
    pushReason(reasons, 'SUBJECT_WEAK', 'info', 'Soggetto solo per denominazione')
  }

  const contoId = form?.conto_id || doc?.conto_id
  if (!contoId) {
    score -= 15
    pushReason(reasons, 'ACCOUNT_MISSING', 'warning', 'Conto non risolto')
  }

  const causaleIvaId = form?.causale_iva_id || doc?.causale_iva_id
  if (!causaleIvaId) {
    score -= 15
    pushReason(reasons, 'IVA_CAUSALE_MISSING', 'warning', 'Causale IVA non risolta')
  }

  const imponibile = toNum(form?.imponibile ?? doc?.imponibile)
  const iva = toNum(form?.iva_totale ?? doc?.iva)
  const totale = toNum(form?.totale ?? doc?.totale)

  if (Number.isFinite(imponibile) && Number.isFinite(iva) && Number.isFinite(totale)) {
    const sum = (imponibile || 0) + (iva || 0)
    if (Math.abs(sum - totale) > EPS) {
      score -= 10
      pushReason(reasons, 'TOTAL_MISMATCH', 'warning', 'Totale non coerente con imponibile + IVA')
    }
  }
  if ((iva ?? 0) > 0 && (!Number.isFinite(imponibile) || !Number.isFinite(iva))) {
    score -= 15
    pushReason(reasons, 'IVA_INCOMPLETE', 'warning', 'IVA incompleta o non numerica')
  }

  if (Array.isArray(righe) && righe.length) {
    const { dare, avere } = sumRows(righe)
    if (Math.abs(dare - avere) > EPS) {
      score -= 25
      pushReason(reasons, 'PN_NOT_BALANCED', 'warning', 'Scrittura non bilanciata')
    }
  }

  score = Math.max(0, Math.min(100, Math.round(score)))
  const tier = score >= 75 ? 'high' : score >= 50 ? 'medium' : 'low'

  return { score, tier, reasons }
}

export function reliabilityTierLabel(tier) {
  if (tier === 'high') return 'alta'
  if (tier === 'medium') return 'media'
  return 'bassa'
}

