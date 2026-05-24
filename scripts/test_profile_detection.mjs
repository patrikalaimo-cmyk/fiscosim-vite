/**
 * Test isolato detectBankStatementProfile sui 3 PDF reali.
 * Eseguire con: node scripts/test_profile_detection.mjs
 */
import fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const pdfjsPath = new URL('../node_modules/pdfjs-dist/build/pdf.mjs', import.meta.url).href
const pdfjsLib = await import(pdfjsPath)
if (pdfjsLib.GlobalWorkerOptions) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsPath.replace('pdf.mjs', 'pdf.worker.mjs')
}

// Inline normalizeMockText (identica a riconciliazioneMockSelectors.js)
const normalizeMockText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// ── Import detector ──────────────────────────────────────────────────────────
const detectorPath = new URL(
  '../src/modules/contabilita/components/riconciliazione/detectBankStatementProfile.js',
  import.meta.url
).href

// The detector imports normalizeMockText from a local path; we stub the module
// by inlining the logic with a mock of the selector module.
// Since we can't reuse the ESM module directly here without a full Vite env,
// we inline the scoring logic as a copy for isolated test.
function detectBankStatementProfile(text, context = {}) {
  const normalized = normalizeMockText(text)
  const fileName = normalizeMockText(context.sourceFileName || '')
  const compact = normalized.replace(/\s+/g, '')

  const sellaHits = []
  if (/banca sella/.test(normalized))           sellaHits.push({ label: 'header_banca_sella',       w: 10 })
  if (/selbit/.test(normalized))                sellaHits.push({ label: 'bic_selbit',                w: 10 })
  if (/it39i03268/.test(compact))              sellaHits.push({ label: 'iban_sella_abi03268',       w: 10 })
  if (/estratto conto in sintesi/.test(normalized)) sellaHits.push({ label: 'estratto_conto_in_sintesi', w: 8 })
  if (/riepilogo movimenti/.test(normalized))   sellaHits.push({ label: 'riepilogo_movimenti',      w: 5 })
  if (/data contabile/.test(normalized))        sellaHits.push({ label: 'col_data_contabile',       w: 5 })
  if (/sella/.test(fileName))                   sellaHits.push({ label: 'filename_sella',           w: 5 })

  const bancoHits = []
  if (/mod\.\s*05\.13\.0011/.test(normalized))  bancoHits.push({ label: 'mod_05_13_0011',           w: 10 })
  if (/it96c0101503200000070745491/.test(compact)) bancoHits.push({ label: 'iban_banco_exact',      w: 10 })
  if (/sardit3s/.test(normalized))              bancoHits.push({ label: 'bic_sardit3s',             w: 10 })
  if (/bpmoit22/.test(normalized))              bancoHits.push({ label: 'bic_bpmoit22',             w: 8 })
  if (/abi[\s:]+01015/.test(normalized))        bancoHits.push({ label: 'abi_01015',                w: 8 })
  if (/riepilogo mensile/.test(normalized))     bancoHits.push({ label: 'riepilogo_mensile',        w: 8 })
  if (/operazioni su servizi di pagamento/.test(normalized)) bancoHits.push({ label: 'operazioni_servizi_pagamento', w: 8 })
  if (/data segno/.test(normalized))            bancoHits.push({ label: 'col_data_segno_da',        w: 8 })
  if (/riepilogo conto corrente/.test(normalized)) bancoHits.push({ label: 'riepilogo_conto_corrente', w: 8 })
  if (/elenco movimenti del periodo/.test(normalized)) bancoHits.push({ label: 'di_seguito_elenco', w: 8 })
  if (/uscite\s+entrate\s+descrizione/.test(normalized)) bancoHits.push({ label: 'col_uscite_entrate_desc', w: 8 })
  if (/000070745491/.test(compact))             bancoHits.push({ label: 'conto_banco_known',        w: 5 })
  if (/banco di sardegna|sardegna/.test(fileName)) bancoHits.push({ label: 'filename_banco',        w: 5 })

  const sellaScore = sellaHits.reduce((s, h) => s + h.w, 0)
  const bancoScore = bancoHits.reduce((s, h) => s + h.w, 0)
  const matchedSignals = { sella: sellaHits.map(h => h.label), banco: bancoHits.map(h => h.label) }
  const scores = { sella: sellaScore, banco: bancoScore }

  const STRONG_SELLA = sellaHits.some(h => ['header_banca_sella', 'bic_selbit', 'iban_sella_abi03268'].includes(h.label))
  const STRONG_BANCO = bancoHits.some(h => ['mod_05_13_0011', 'iban_banco_exact', 'bic_sardit3s'].includes(h.label))

  const bankoBancoSubprofile = () => {
    const isMonthly = bancoHits.some(h => ['riepilogo_mensile','operazioni_servizi_pagamento','col_data_segno_da','bic_sardit3s'].includes(h.label))
    return isMonthly ? 'banco_sardegna_monthly_services_v1' : 'banco_sardegna_quarterly_statement_v1'
  }

  if (STRONG_SELLA && !STRONG_BANCO) return { profile: 'banca_sella_statement_v1', profileLabel: 'Banca Sella', confidence: 'high', matchedSignals, scores }
  if (STRONG_BANCO && !STRONG_SELLA) return { profile: bankoBancoSubprofile(), profileLabel: 'Banco di Sardegna', confidence: 'high', matchedSignals, scores }
  if (STRONG_SELLA && STRONG_BANCO)  return sellaScore >= bancoScore
    ? { profile: 'banca_sella_statement_v1', profileLabel: 'Banca Sella', confidence: 'medium', matchedSignals, scores }
    : { profile: bankoBancoSubprofile(), profileLabel: 'Banco di Sardegna', confidence: 'medium', matchedSignals, scores }
  if (bancoScore > sellaScore && bancoScore >= 5) return { profile: bankoBancoSubprofile(), profileLabel: 'Banco di Sardegna', confidence: 'low', matchedSignals, scores }
  if (sellaScore > bancoScore && sellaScore >= 5) return { profile: 'banca_sella_statement_v1', profileLabel: 'Banca Sella', confidence: 'low', matchedSignals, scores }
  return { profile: 'generic_statement_v1', profileLabel: 'Generico', confidence: 'none', matchedSignals, scores }
}

// ── Extract PDF text (browser-like: group by Y, join lines) ─────────────────
async function extractPDFText(filePath, maxPages = 20) {
  const buf = await fs.readFile(filePath)
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf), disableWorker: true }).promise
  const pages = Math.min(doc.numPages, maxPages)
  const parts = []
  for (let i = 1; i <= pages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    const items = content.items.filter(it => it.str?.trim())
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
    parts.push(`--- Pagina ${i} ---\n` + lines.join('\n'))
  }
  return parts.join('\n\n')
}

// ── Test cases ───────────────────────────────────────────────────────────────
const tests = [
  {
    name:     'A. SIRIA SARDEGNA OTTOBRE 2025 (Banco mensile)',
    path:     'C:/Users/patri/Downloads/Siria/SIRIA SARDEGNA OTTOBRE 2025.pdf',
    fileName: 'SIRIA SARDEGNA OTTOBRE 2025.pdf',
    expected: { profile: 'banco_sardegna_monthly_services_v1', label: 'Banco di Sardegna' },
  },
  {
    name:     'B. SIRIA BANCO DI SARDEGNA 4 TRIMESTRE 2025 (Banco trimestrale)',
    path:     'C:/Users/patri/Downloads/Siria/SIRIA BANCO DI SARDEGNA 4 TRIMESTRE 2025.pdf',
    fileName: 'SIRIA BANCO DI SARDEGNA 4 TRIMESTRE 2025.pdf',
    expected: { profile: 'banco_sardegna_quarterly_statement_v1', label: 'Banco di Sardegna' },
  },
  {
    name:     'C. SELLA SIRIA DICEMBRE 2025 (Banca Sella)',
    path:     'C:/Users/patri/Downloads/Siria/SELLA SIRIA DICEMBRE 2025.pdf',
    fileName: 'SELLA SIRIA DICEMBRE 2025.pdf',
    expected: { profile: 'banca_sella_statement_v1', label: 'Banca Sella' },
  },
]

let allPassed = true
for (const t of tests) {
  const text = await extractPDFText(t.path)
  const result = detectBankStatementProfile(text, { sourceFileName: t.fileName })
  const profileOK = result.profile === t.expected.profile
  const labelOK   = result.profileLabel === t.expected.label
  const pass = profileOK && labelOK
  if (!pass) allPassed = false

  console.log(`\n${pass ? '✅' : '❌'} ${t.name}`)
  console.log(`   profile  : ${result.profile}  ${profileOK ? '✓' : `✗ expected ${t.expected.profile}`}`)
  console.log(`   label    : ${result.profileLabel}  ${labelOK ? '✓' : `✗ expected ${t.expected.label}`}`)
  console.log(`   confidence: ${result.confidence}`)
  console.log(`   scores   : sella=${result.scores.sella}  banco=${result.scores.banco}`)
  console.log(`   sella signals : ${result.matchedSignals.sella.join(', ') || '(none)'}`)
  console.log(`   banco signals : ${result.matchedSignals.banco.join(', ') || '(none)'}`)
}

console.log(`\n${'─'.repeat(60)}`)
console.log(allPassed ? '✅ TUTTI I TEST PASSATI' : '❌ UNO O PIÙ TEST FALLITI')
