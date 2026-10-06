import { normalizeMockText } from './riconciliazioneMockSelectors.js'

function scoreTextOverlap(text, needles = [], weight = 0.05) {
  const normalized = normalizeMockText(text)
  return needles.reduce((score, needle) => score + (normalized.includes(normalizeMockText(needle)) ? weight : 0), 0)
}

export function scoreRiconciliazioneMatch(movement = {}, partita = {}, classification = {}) {
  const amount = Math.abs(Number(movement.amount || 0))
  const openAmount = Math.abs(Number(partita.importoAperto ?? partita.importoOriginario ?? 0))
  const difference = Math.round((amount - openAmount) * 100) / 100
  const sameAmount = Math.abs(difference) <= 0.01
  const partial = amount > 0 && openAmount > 0 && amount < openAmount
  const counterpartyText = normalizeMockText([movement.descriptionRaw, movement.descriptionNormalized, movement.counterpartyName].filter(Boolean).join(' '))
  const subjectText = normalizeMockText([partita.soggettoNome, partita.numeroDocumento, partita.documentoTipo].filter(Boolean).join(' '))
  const ibanText = normalizeMockText(movement.counterpartyIban || '')
  const dueDate = String(partita.dataScadenza || '')
  const opDate = String(movement.operationDate || movement.valueDate || '')

  let score = 0
  const reasons = []

  if (classification.movementType === 'ignora_movimento') return { confidence: 1, score: 1, reasons: ['movimento_ignorato'] }
  if (classification.movementType === 'spesa_bancaria' || classification.movementType === 'f24' || classification.movementType === 'giroconto') {
    return { confidence: 0.95, score: 0.95, reasons: ['classificazione_diretta'] }
  }

  if (sameAmount) {
    score += 0.45
    reasons.push('importo_esatto')
  } else if (partial) {
    score += 0.22
    reasons.push('importo_parziale')
  } else {
    score += 0.05
  }

  if (normalizeMockText(partita.soggettoNome) && counterpartyText.includes(normalizeMockText(partita.soggettoNome))) {
    score += 0.22
    reasons.push('controparte_in_descrizione')
  }

  if (ibanText && normalizeMockText(partita.soggettoNome) && counterpartyText.includes(normalizeMockText(partita.soggettoNome))) {
    score += 0.05
    reasons.push('iban_presente')
  }

  if (dueDate && opDate && dueDate.slice(0, 10) >= opDate.slice(0, 10)) {
    score += 0.05
    reasons.push('scadenza_coerente')
  }

  if (normalizeMockText(partita.numeroDocumento) && counterpartyText.includes(normalizeMockText(partita.numeroDocumento))) {
    score += 0.12
    reasons.push('numero_documento_in_descrizione')
  }

  if (partita.soggettoTipo && ['cliente', 'fornitore', 'percipiente'].includes(partita.soggettoTipo)) {
    score += 0.05
    reasons.push('tipo_soggetto_coerente')
  }

  if (partita.ivaPerCassa) {
    score += 0.03
    reasons.push('iva_per_cassa')
  }

  if (partita.ritenuta) {
    score += 0.03
    reasons.push('ritenuta_collegata')
  }

  score += scoreTextOverlap(movement.descriptionRaw, [partita.soggettoNome, partita.numeroDocumento], 0.04)

  if (classification.reasons?.includes('parcella_o_ritenuta_rilevata')) score += 0.04
  if (classification.reasons?.includes('incasso_cliente_rilevato') || classification.reasons?.includes('pagamento_fornitore_rilevato')) score += 0.03

  if (difference !== 0 && Math.abs(difference) <= 0.01) score += 0.02
  if (difference !== 0 && Math.abs(difference) > 0.01) score -= 0.08

  const confidence = Math.max(0, Math.min(0.99, Math.round(score * 100) / 100))
  return { confidence, score: confidence, reasons }
}