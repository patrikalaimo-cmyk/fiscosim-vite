import { getLogs } from './pipelineLogStore.js'

const FILENAME = 'fiscosim-debug-log.txt'

/**
 * Esporta i log della pipeline in un file .txt (JSON formattato) e avvia il download nel browser.
 */
export function downloadLogs() {
  try {
    const logs = getLogs()
    const body = JSON.stringify(logs, null, 2)
    const blob = new Blob([body], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = FILENAME
    a.rel = 'noopener'
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch {
    // non bloccare l'app
  }
}
