import test from 'node:test'
import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const repoRoot = process.cwd()
const viewFile = path.join(repoRoot, 'src/modules/contabilita/views/ConsultazionePrimaNotaView.jsx')
const hubFile = path.join(repoRoot, 'src/modules/contabilita/views/PrimaNotaHubView.jsx')
const componentsDir = path.join(repoRoot, 'src/modules/contabilita/components/consultazione')
const consultazioneOpsDir = path.join(repoRoot, 'src/modules/contabilita/application/consultazioneOperations')
const primaNotaOpsDir = path.join(repoRoot, 'src/modules/contabilita/application/primaNotaOperations')

const forbiddenPatterns = [
  ['canonical/main persistence', /\b(persistPrimaNotaDraft|commitCanonicalAccountingPayload|createPrimaNotaCompleta)\b/],
  ['mutation service call', /\b(updatePrimaNotaControllata|stornaPrimaNota|annullaPrimaNotaLogica|deleteScritturaControllata|annullaRegistrazioneCollegata)\b/],
  ['edit handoff callback', /\bonEditScrittura\b/],
  ['rpc write path', /\.rpc\s*\(/],
  ['prima_nota write', /\.from\(\s*['"]prima_nota['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/],
  ['prima_nota_righe write', /\.from\(\s*['"]prima_nota_righe['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/],
  ['partitario write', /\.from\(\s*['"]partitario['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/],
  ['registri_iva write', /\.from\(\s*['"]registri_iva['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/],
  ['ritenute write', /\.from\(\s*['"]ritenute_dacconto['"]\s*\)\s*\.(insert|update|delete|upsert)\s*\(/],
  ['accounting_entries legacy', /\baccounting_entries\b/],
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

test('CONSULTAZIONE-FREEZE — superficie consultazione resta strettamente read-only', async () => {
  const [viewContent, hubContent, components, consultOps, pnOps] = await Promise.all([
    readFile(viewFile, 'utf8'),
    readFile(hubFile, 'utf8'),
    listJsFiles(componentsDir),
    listJsFiles(consultazioneOpsDir),
    listJsFiles(primaNotaOpsDir),
  ])

  assert.match(viewContent, /Consultazione Prima Nota è read-only:/)
  assert.match(viewContent, /Modifica\/storno non disponibili da Consultazione\./)
  assert.doesNotMatch(
    hubContent,
    /<ConsultazionePrimaNotaView[\s\S]{0,1200}\bonEditScrittura\s*=/,
    'il parent non deve reintrodurre un handoff mutativo nella Consultazione'
  )

  const violations = []
  for (const file of [viewFile, ...components, ...consultOps, ...pnOps]) {
    const content = await readFile(file, 'utf8')
    for (const [name, regex] of forbiddenPatterns) {
      if (regex.test(content)) violations.push(`${path.relative(repoRoot, file)}: ${name}`)
    }
  }

  assert.deepEqual(violations, [])
})
