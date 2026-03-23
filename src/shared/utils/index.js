import { PERMESSI_MODULI, PERMESSI_DEFAULT } from '../constants'

// ─── FORMATTERS ──────────────────────────────────────────────────
export const fmt0 = n => n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
export const fmt2 = n => n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2 }).format(n)
export const fmtDate = d => d ? new Date(d).toLocaleDateString('it-IT') : '—'
export const tomorrowStr = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0] }

// ─── PERMESSI ────────────────────────────────────────────────────
export function getPermessi(utente) {
  if (!utente) return null
  if (utente.ruolo === 'owner' || utente.ruolo === 'admin') {
    return Object.fromEntries(
      PERMESSI_MODULI.map(m => [m.id, { leggi: true, modifica: true, elimina: true, solo_assegnati: false }])
    )
  }
  return { ...PERMESSI_DEFAULT, ...(utente.permessi || {}) }
}

export const canLeggi     = (perm, modulo) => perm?.[modulo]?.leggi    !== false
export const canModifica  = (perm, modulo) => perm?.[modulo]?.modifica === true
export const canElimina   = (perm, modulo) => perm?.[modulo]?.elimina  === true
export const isSoloAssegnati = (perm, modulo) => perm?.[modulo]?.solo_assegnati === true
export const puoGestireUtenti = ruolo => ruolo === 'owner'

// ─── API CALLS ───────────────────────────────────────────────────
export async function callAPI(endpoint, payload) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Errore')
  return data
}

// Legacy alias (usato dal SimulatoreModulo per send-email)
export async function callSendEmail(payload) {
  return callAPI('/api/send-email', payload)
}

// ─── PDF UTILS (browser-side) ────────────────────────────────────
export async function extractTextFromPDFBrowser(file) {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()

  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    // join('') senza spazi — il parser reversed-coda gestisce questo formato
    text += content.items.map(s => s.str).join('') + '\n'
  }
  return text
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
    const s = document.createElement('script')
    s.src = src
    s.onload = resolve
    s.onerror = reject
    document.head.appendChild(s)
  })
}

// ─── DELEGA UTILS ────────────────────────────────────────────────
export function calcolaScadenzaDelega(dataDelega) {
  if (!dataDelega) return null
  const d = new Date(dataDelega)
  d.setFullYear(d.getFullYear() + 4)
  return d.toISOString().split('T')[0]
}

export function statoDelega(dataScadenza) {
  if (!dataScadenza) return 'nessuna'
  const oggi = new Date()
  const scad = new Date(dataScadenza)
  const diff = Math.floor((scad - oggi) / 86400000)
  if (diff < 0) return 'scaduta'
  if (diff <= 30) return 'in_scadenza'
  return 'attiva'
}

