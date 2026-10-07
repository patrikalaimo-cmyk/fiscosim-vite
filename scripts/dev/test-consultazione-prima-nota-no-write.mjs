import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const consultazioneViewFile = path.join(repoRoot, 'src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx')
const consultazioneHubFile = path.join(repoRoot, 'src/modules/contabilita/views/PrimaNotaHubView.jsx')
const consultazioneComponentsDir = path.join(repoRoot, 'src/modules/contabilita/components/consultazione')
const consultazioneOpsDir = path.join(repoRoot, 'src/modules/contabilita/application/consultazioneOperations')
const primaNotaOpsDir = path.join(repoRoot, 'src/modules/contabilita/application/primaNotaOperations')

const forbiddenPatterns = [
  { name: 'canonical/main persistence', regex: /\b(persistPrimaNotaDraft|commitCanonicalAccountingPayload|createPrimaNotaCompleta)\b/ },
  { name: 'mutation service call', regex: /\b(updatePrimaNotaControllata|stornaPrimaNota|annullaPrimaNotaLogica|deleteScritturaControllata|annullaRegistrazioneCollegata)\b/ },
  { name: 'edit handoff callback', regex: /\bonEditScrittura\b/ },
  { name: 'rpc write path', regex: /\.rpc\s*\(/ },
  { name: 'prima_nota write', regex: /\.from\(\s*['"]prima_nota['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/ },
  { name: 'prima_nota_righe write', regex: /\.from\(\s*['"]prima_nota_righe['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/ },
  { name: 'partitario write', regex: /\.from\(\s*['"]partitario['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/ },
  { name: 'registri_iva write', regex: /\.from\(\s*['"]registri_iva['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/ },
  { name: 'ritenute write', regex: /\.from\(\s*['"]ritenute_dacconto['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/ },
  { name: 'accounting_entries legacy', regex: /\baccounting_entries\b/ },
]

async function listJsFiles(targetPath) {
  const entries = await readdir(targetPath, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(targetPath, entry.name)
    if (entry.isDirectory()) files.push(...await listJsFiles(fullPath))
    else if (/\.(js|jsx|mjs|ts|tsx)$/i.test(entry.name)) files.push(fullPath)
  }
  return files
}

const [viewContent, hubContent, componentFiles, consultazioneFiles, primaNotaFiles] = await Promise.all([
  readFile(consultazioneViewFile, 'utf8'),
  readFile(consultazioneHubFile, 'utf8'),
  listJsFiles(consultazioneComponentsDir),
  listJsFiles(consultazioneOpsDir),
  listJsFiles(primaNotaOpsDir),
])

const fileViolations = []
for (const file of [consultazioneViewFile, ...componentFiles, ...consultazioneFiles, ...primaNotaFiles]) {
  const content = await readFile(file, 'utf8')
  const matches = forbiddenPatterns.filter((pattern) => pattern.regex.test(content)).map((pattern) => pattern.name)
  if (matches.length) fileViolations.push({ file: path.relative(repoRoot, file).split(path.sep).join('/'), matches })
}

assert.match(viewContent, /Consultazione Prima Nota è read-only:/, 'read-only banner missing from consultazione view')
assert.match(viewContent, /Modifica\/storno non disponibili da Consultazione\./, 'read-only table message missing from consultazione view')
assert.doesNotMatch(hubContent, /<ConsultazionePrimaNotaView[\s\S]{0,1200}\bonEditScrittura\s*=/, 'Consultazione must not receive mutation callbacks')

if (fileViolations.length) {
  console.error('Consultazione Prima Nota no-write guard failed:')
  for (const violation of fileViolations) console.error(`- ${violation.file}: ${violation.matches.join(', ')}`)
  process.exit(1)
}

console.log('Consultazione Prima Nota no-write guard checks passed.')
