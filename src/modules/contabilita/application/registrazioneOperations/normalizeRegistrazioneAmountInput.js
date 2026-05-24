import { round2 } from '../canonical_mapper/utils.js'
import { parseRegistrazioneAmount } from './parseRegistrazioneAmount.js'

export function normalizeRegistrazioneAmountInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  const numeric = parseRegistrazioneAmount(text)
  return String(round2(numeric).toFixed(2))
}
