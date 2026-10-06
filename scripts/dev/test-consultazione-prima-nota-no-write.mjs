import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const consultazioneViewFile = path.join(repoRoot, 'src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx')
const consultazioneTableFile = path.join(repoRoot, 'src/modules/contabilita/components/consultazione/ConsultazioneResultsTable.jsx')
const consultazioneOpsDir = path.join(repoRoot, 'src/modules/contabilita/application/consultazioneOperations')
const primaNotaOpsDir = path.join(repoRoot, 'src/modules/contabilita/application/primaNotaOperations')

const forbiddenPatterns = [
  { name: 'createPrimaNotaCompleta', regex: /\bcreatePrimaNotaCompleta\s*\(/ },
  { name: 'prima_nota insert/update/delete', regex: /\.from\(\s*['"]prima_nota['"]\s*\)\s*\.(insert|update|delete)\s*\(/ },
  { name: 'prima_nota_righe insert/update/delete', regex: /\.from\(\s*['"]prima_nota_righe['"]\s*\)\s*\.(insert|update|delete)\s*\(/ },
  { name: 'partitario write', regex: /\.from\(\s*['"]partitario['"]\s*\)\s*\.(insert|update|delete)\s*\(/ },
  { name: 'registri_iva write', regex: /\.from\(\s*['"]registri_iva['"]\s*\)\s*\.(insert|update|delete)\s*\(/ },
  { name: 'accounting_entries', regex: /accounting_entries\b/ },
]

async function listJsFiles(targetPath) {
  const entries = await readdir(targetPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) {
      files.push(...await listJsFiles(fullPath))
      continue
    }
    if (/\.(js|jsx|mjs|ts|tsx)$/i.test(entry.name)) {
      files.push(fullPath)
    }
  }
  return files
}

function assertMatches(content, pattern, message) {
  assert.ok(pattern.test(content), message)
}

const [viewContent, tableContent, consultazioneFiles, primaNotaFiles] = await Promise.all([
  readFile(consultazioneViewFile, 'utf8'),
  readFile(consultazioneTableFile, 'utf8'),
  listJsFiles(consultazioneOpsDir),
  listJsFiles(primaNotaOpsDir),
])

const fileViolations = []
for (const file of [...consultazioneFiles, ...primaNotaFiles]) {
  const content = await readFile(file, 'utf8')
  const matches = forbiddenPatterns
    .filter((pattern) => pattern.regex.test(content))
    .map((pattern) => pattern.name)
  if (matches.length > 0) {
    fileViolations.push({ file: path.relative(repoRoot, file).split(path.sep).join('/'), matches })
  }
}

assertMatches(viewContent, /Consultazione Prima Nota è read-only:/, 'read-only banner missing from consultazione view')
assertMatches(viewContent, /Modifica\/storno non disponibili da Consultazione\. Usa il flusso canonico di registrazione\/commit atomico\./, 'read-only message missing from consultazione view')
assertMatches(viewContent, /Dettaglio consultazione disponibile in sola lettura\. Nessun write diretto\./, 'detail stub message missing from consultazione view')
assertMatches(tableContent, /disabled/, 'consultazione table must disable ambiguous action buttons')
assertMatches(tableContent, /title=\{readOnlyMessage\}/, 'consultazione table must expose the read-only guard message')

if (fileViolations.length > 0) {
  console.error('Consultazione Prima Nota no-write guard failed:')
  for (const violation of fileViolations) {
    console.error(`- ${violation.file}: ${violation.matches.join(', ')}`)
  }
  process.exit(1)
}

console.log('Consultazione Prima Nota no-write guard checks passed.')