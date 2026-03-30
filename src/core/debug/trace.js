// ─── FISCOSIM TRACE SYSTEM ────────────────────────────────────────────────
// Uso: import { trace } from '../../core/debug/trace'
// Console: window.__TRACE per vedere tutto lo storico
// Rimozione: basta commentare le righe trace() — zero impatto sulla logica

if (typeof window !== 'undefined') {
  window.__TRACE = window.__TRACE || []
}

export function trace(label, data) {
  try {
    const safeData = JSON.parse(JSON.stringify(data ?? {}))
    const entry = {
      label,
      data: safeData,
      time: new Date().toISOString(),
      ms: performance.now().toFixed(1)
    }
    if (typeof window !== 'undefined') window.__TRACE.push(entry)
    console.log(`🧠 [TRACE] ${label}`, safeData)
  } catch(e) {
    console.log(`🧠 [TRACE] ${label}`, data)
  }
}

// Helper per stampare tutto lo storico in console
export function traceDump() {
  if (typeof window === 'undefined') return
  console.table((window.__TRACE||[]).map(e=>({time:e.time, label:e.label})))
  return window.__TRACE
}

// Helper per pulire lo storico
export function traceClear() {
  if (typeof window !== 'undefined') window.__TRACE = []
}
