import { renderPDFPagesToImages } from '../../../shared/utils'

export async function extractTextFromFile(file) {
  try {
    const pdfjs = await import('pdfjs-dist')
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.mjs', import.meta.url).toString()
    const ab = await file.arrayBuffer()
    const pdf = await pdfjs.getDocument({ data: ab }).promise
    const pages = Math.min(pdf.numPages, 4)
    let text = ''
    for (let i = 1; i <= pages; i++) {
      const page = await pdf.getPage(i)
      const content = await page.getTextContent()
      const items = content.items.filter((it) => it.str?.trim())
      let lastY = null
      let line = []
      const lines = []
      for (const item of items) {
        const y = Math.round(item.transform[5])
        if (lastY !== null && Math.abs(y - lastY) > 3) {
          lines.push(line.join(' '))
          line = []
        }
        line.push(item.str)
        lastY = y
      }
      if (line.length) lines.push(line.join(' '))
      text += lines.join('\n') + '\n'
    }
    return text
  } catch {
    return ''
  }
}

export async function extractXmlFromP7m(file) {
  const ab = await file.arrayBuffer()
  const bytes = new Uint8Array(ab)
  let derBytes
  if (bytes[0] === 0x30) {
    derBytes = bytes
  } else {
    const b64 = Array.from(bytes).map((b) => String.fromCharCode(b)).join('').split('').filter((c) => c !== '\r' && c !== '\n' && c !== ' ').join('')
    const binStr = atob(b64)
    derBytes = new Uint8Array(binStr.length)
    for (let i = 0; i < binStr.length; i++) derBytes[i] = binStr.charCodeAt(i)
  }
  let xmlStart = -1
  for (let i = 0; i < Math.min(derBytes.length, 800); i++) {
    if (derBytes[i] === 0x3c && derBytes[i + 1] === 0x3f && derBytes[i + 2] === 0x78) { xmlStart = i; break }
    if (derBytes[i] === 0x3c && derBytes[i + 1] === 0x70 && derBytes[i + 2] === 0x3a) { xmlStart = i; break }
    if (derBytes[i] === 0x3c && derBytes[i + 1] === 0x46 && derBytes[i + 2] === 0x61) { xmlStart = i; break }
  }
  if (xmlStart === -1) throw new Error('XML non trovato nel P7M')
  let text = new TextDecoder('utf-8', { fatal: false }).decode(derBytes.slice(xmlStart))
  const e1 = text.lastIndexOf('</p:FatturaElettronica>')
  const e2 = text.lastIndexOf('</FatturaElettronica>')
  const ei = Math.max(e1, e2)
  if (ei > 0) text = text.substring(0, ei + (e1 >= e2 ? 23 : 21))
  return text.replace(/\u0000/g, '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
}

export async function renderImportPdfPagesToImages(file, options) {
  return renderPDFPagesToImages(file, options)
}

