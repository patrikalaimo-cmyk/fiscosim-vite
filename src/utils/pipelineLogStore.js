/** Store in-memory per i log della pipeline FiscoSim (globale al modulo). */

const logs = []

/**
 * Normalizza entry verso forma unica { contextId, step, timestamp, data, meta }.
 * @param {unknown} entry
 */
export function addLog(entry) {
  try {
    if (!entry || typeof entry !== 'object') return
    const meta =
      entry.meta != null && typeof entry.meta === 'object' && !Array.isArray(entry.meta)
        ? { ...entry.meta }
        : {}
    if (entry.documentId != null && meta.documentId === undefined) meta.documentId = entry.documentId
    logs.push({
      contextId: entry.contextId,
      step: entry.step,
      timestamp: entry.timestamp,
      data: 'data' in entry ? entry.data : undefined,
      meta
    })
  } catch {
    // non deve mai rompere l'app
  }
}

/**
 * @returns {unknown[]}
 */
export function getLogs() {
  try {
    return logs.slice()
  } catch {
    return []
  }
}

export function clearLogs() {
  try {
    logs.length = 0
  } catch {
    // ignore
  }
}
