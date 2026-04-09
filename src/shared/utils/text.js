const MOJIBAKE_REPLACEMENTS = [
  ['â€™', "'"],
  ['â€˜', "'"],
  ['â€œ', '"'],
  ['â€', '"'],
  ['â€"', '—'],
  ['â€“', '–'],
  ['â€¦', '...'],
  ['Â·', '·'],
  ['Ã ', 'à'],
  ['Ã¨', 'è'],
  ['Ã©', 'é'],
  ['Ã¬', 'ì'],
  ['Ã²', 'ò'],
  ['Ã¹', 'ù'],
  ['Ã€', 'À'],
  ['Ãˆ', 'È'],
  ['Ã‰', 'É'],
  ['ÃŒ', 'Ì'],
  ['Ã’', 'Ò'],
  ['Ã™', 'Ù'],
  ['Ã§', 'ç'],
  ['Ã', 'à'],
  ['Â', ''],
  ['ðŸ‘¤', ''],
  ['ðŸ­', ''],
  ['ðŸ“¥', ''],
  ['ðŸ—‘', ''],
  ['âœ•', '×'],
  ['âœ“', '✓'],
]

export function sanitizeUiText(value) {
  if (value == null) return value
  let text = String(value)
  for (const [from, to] of MOJIBAKE_REPLACEMENTS) {
    text = text.split(from).join(to)
  }
  return text
    .replace(/\uFFFD/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .trim()
}

export function sanitizeUiRecord(value) {
  if (Array.isArray(value)) return value.map(sanitizeUiRecord)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeUiRecord(entry)]))
  }
  return typeof value === 'string' ? sanitizeUiText(value) : value
}
