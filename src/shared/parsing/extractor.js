/**
 * EXTRACTOR — estrae testo + blocchi con posizione da pdfjs
 * Input:  File (PDF)
 * Output: { pages: [{pageNum, text, blocks: [{text, x, y, w, h}]}], totalText, isScanned }
 */

let _pdfjsLib = null
async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib
  _pdfjsLib = await import('pdfjs-dist')
  _pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs', import.meta.url
  ).toString()
  return _pdfjsLib
}

export async function extractFromPDF(file, { maxPages = 10 } = {}) {
  const pdfjs = await getPdfjs()
  const ab = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: ab }).promise
  const pagesToRead = Math.min(pdf.numPages, maxPages)
  const pages = []
  let totalChars = 0

  for (let i = 1; i <= pagesToRead; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1.0 })

    const blocks = content.items
      .filter(item => item.str?.trim())
      .map(item => {
        // pdfjs: transform = [scaleX, skewY, skewX, scaleY, tx, ty]
        const [,,,, tx, ty] = item.transform
        return {
          text: item.str,
          x: Math.round(tx),
          y: Math.round(viewport.height - ty), // converti in coord top-left
          w: Math.round(item.width),
          h: Math.round(item.height || 10),
          fontSize: Math.round(Math.abs(item.transform[3])),
        }
      })

    const pageText = blocks.map(b => b.text).join(' ')
    totalChars += pageText.length

    pages.push({ pageNum: i, text: pageText, blocks })
  }

  const fullText = pages.map(p => p.text).join('\n')
  // Se meno di 100 chars per pagina → probabilmente scannerizzato
  const isScanned = (totalChars / pagesToRead) < 100

  return { pages, fullText, totalChars, isScanned, numPages: pdf.numPages }
}
