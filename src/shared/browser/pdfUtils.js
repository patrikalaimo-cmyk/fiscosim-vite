let _pdfjsLib = null

async function getPdfjs() {
  if (_pdfjsLib) return _pdfjsLib
  _pdfjsLib = await import('pdfjs-dist')
  _pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()
  return _pdfjsLib
}

export async function extractTextFromPDFBrowser(file) {
  const pdfjsLib = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  let text = ''
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    text += content.items.map((s) => s.str).join('') + '\n'
  }
  return text
}

export async function renderPDFPagesToImages(file, { maxPages = 10, scale = 1.2 } = {}) {
  const pdfjsLib = await getPdfjs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
  const pagesToRender = Math.min(pdf.numPages, maxPages)
  const images = []

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    const base64 = canvas.toDataURL('image/jpeg', 0.85).split(',')[1]
    images.push(base64)
  }
  return images
}

export async function imageFileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

