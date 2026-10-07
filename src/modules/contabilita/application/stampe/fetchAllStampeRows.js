// Lettura paginata completa per anteprime e stampe canoniche.
// buildQuery deve ricostruire una query con ordinamento totale stabile (ultimo tie-breaker ID).
export async function fetchAllStampeRows(buildQuery, {
  pageSize = 500,
  maxPages = 200,
  label = 'Stampa',
} = {}) {
  if (typeof buildQuery !== 'function') throw new Error('Query stampa non valida')
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1000) {
    throw new Error('pageSize stampa non valido')
  }
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) {
    throw new Error('maxPages stampa non valido')
  }

  const all = []
  const ids = new Set()
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize
    const { data, error } = await buildQuery().range(from, from + pageSize - 1)
    if (error) throw error
    if (!Array.isArray(data)) {
      throw new Error(`${label}: risposta di lettura non valida`)
    }
    if (data.length > pageSize) {
      throw new Error(`${label}: pagina più grande del range richiesto`)
    }
    for (const row of data) {
      const id = String(row?.id ?? '').trim()
      if (!id) throw new Error(`${label}: riga priva di ID stabile`)
      if (ids.has(id)) throw new Error(`${label}: record duplicato tra pagine; stampa sospesa`)
      ids.add(id)
      all.push(row)
    }
    if (data.length < pageSize) return all
  }
  throw new Error(`${label}: limite paginazione raggiunto; stampa sospesa`)
}

export function chunkStampeIds(ids = [], size = 100) {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Dimensione batch stampa non valida')
  const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(Boolean))]
  const chunks = []
  for (let i = 0; i < unique.length; i += size) chunks.push(unique.slice(i, i + size))
  return chunks
}
