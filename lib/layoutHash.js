/**
 * Hash di "layout" documento: struttura simile indipendente dagli importi numerici.
 * Usa prime 20–30 righe, rimuove cifre, normalizza spazi, lowercase, MD5.
 */

import { createHash } from 'node:crypto'

/** Prime N righe da considerare (range richiesto 20–30). */
export const LAYOUT_HASH_LINE_COUNT = 25

/**
 * @param {string | null | undefined} text Tipicamente `preprocessed_text` o testo preprocessato equivalente
 * @returns {string | null} esadecimale MD5 (32 char) o null se non calcolabile
 */
export function createLayoutHash(text) {
  if (text == null || typeof text !== 'string') return null

  const lines = text.split(/\r?\n/)
  const head = lines.slice(0, LAYOUT_HASH_LINE_COUNT).join('\n')

  const withoutDigits = head.replace(/\d/g, '')

  const normalized = withoutDigits
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

  if (!normalized) return null

  return createHash('md5').update(normalized, 'utf8').digest('hex')
}
