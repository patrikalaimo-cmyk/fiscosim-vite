import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCanonicalAccountingCommitRepository } from '../../services/canonicalAccountingCommitRepository.js'
import { commitCanonicalAccountingPayload } from '../../services/canonicalAccountingCommitService.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const servicePath = path.join(repoRoot, 'services', 'canonicalAccountingCommitService.js')
const repositoryPath = path.join(repoRoot, 'services', 'canonicalAccountingCommitRepository.js')

const serviceSource = await readFile(servicePath, 'utf8')
const repositorySource = await readFile(repositoryPath, 'utf8')
const forbiddenTokens = [
  'accounting_entries',
  'createScritturaContabile',
  'createPrimaNotaCompleta',
  'import_fatture',
  'import_nuovo',
  'import_unificato',
  '.from(\'prima_nota\')',
  '.from(\'prima_nota_righe\')',
  '.from(\'registri_iva\')',
  '.from(\'partitario\')',
  '.from(\'documenti_contabilita\')',
  '.from(\'movimenti_bancari\')',
]

for (const token of forbiddenTokens) {
  assert.equal(
    serviceSource.includes(token),
    false,
    `Forbidden token still present in canonical commit service: ${token}`
  )
}

const forbiddenRepositoryTokens = [
  'createPrimaNota',
  'createPrimaNotaRighe',
  'createRegistriIva',
  'createPartitario',
  'updateSourceDocumentStatus',
  'updateBankMovementStatus',
  'local_real_write_disabled',
  'runAtomicCommit',
  'canRunAtomicCommit',
]

for (const token of forbiddenRepositoryTokens) {
  assert.equal(
    repositorySource.includes(token),
    false,
    `Forbidden token still present in canonical commit repository: ${token}`
  )
}

const repo = createCanonicalAccountingCommitRepository({})
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'createPrimaNota'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'createPrimaNotaRighe'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'createRegistriIva'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'createPartitario'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'updateSourceDocumentStatus'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'updateBankMovementStatus'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'runAtomicCommit'), false)
assert.equal(Object.prototype.hasOwnProperty.call(repo, 'canRunAtomicCommit'), false)

const blocked = await commitCanonicalAccountingPayload({
  societaId: 'soc-001',
  esercizioId: '2026',
  utenteId: 'user-001',
  sourceModule: 'registrazione_manual',
  sourceDocumentId: 'source-doc-001',
  idempotencyKey: 'manual:soc-001:2026:source-doc-001',
  canonicalPayload: {
    schemaVersion: 'core-closure-13-atomic-1',
    payloadId: 'payload-001',
    sourceModule: 'registrazione_manual',
    source: { module: 'registrazione_manual', sourceDocumentId: 'source-doc-001' },
    company: { societaId: 'soc-001', esercizioId: '2026' },
    primaNotaRighe: [],
    validation: { blockers: [], blocking: [], errors: [], warnings: [] },
  },
}, {
  dryRun: false,
  allowRealCommit: true,
  auditWriteEnabled: false,
})

assert.equal(blocked.status, 'blocked')
assert.equal(blocked.blockers.includes('real_commit_requires_rpc'), true)

console.log('No unsafe canonical real write references detected and real commit requires RPC.')
