import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const pdfjsPath = new URL('../node_modules/pdfjs-dist/build/pdf.mjs', import.meta.url).href
const pdfjsLib = await import(pdfjsPath)
if (pdfjsLib.GlobalWorkerOptions) pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath.replace('pdf.mjs', 'pdf.worker.mjs')

const files = [
  { name: 'ottobre',   path: 'C:/Users/patri/Downloads/Siria/SIRIA SARDEGNA OTTOBRE 2025.pdf' },
  { name: 'trimestre', path: 'C:/Users/patri/Downloads/Siria/SIRIA BANCO DI SARDEGNA 4 TRIMESTRE 2025.pdf' },
  { name: 'sella_dic', path: 'C:/Users/patri/Downloads/Siria/SELLA SIRIA DICEMBRE 2025.pdf' },
]

for (const f of files) {
  const buf = await fs.readFile(f.path)
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise
  let text = ''
  for (let i = 1; i <= Math.min(4, doc.numPages); i++) {
    const page = await doc.getPage(i)
    const ct = await page.getTextContent()
    text += ct.items.map(it => it.str).join(' ') + '\n'
  }
  const normalized = text.toLowerCase().replace(/\s+/g, ' ')
  console.log('=== ' + f.name.toUpperCase() + ' ===')
  console.log(text.slice(0, 4000))
  console.log('')
}
