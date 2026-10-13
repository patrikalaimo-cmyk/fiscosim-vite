import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parseFiscalJournalHistoryQuery } from '../api/studio/fiscal-journal-history.js'
import { matchesStudioRoute } from '../lib/devStudioHttp.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

test('fiscal-journal-history route is registered', () => {
  assert.equal(matchesStudioRoute('/api/studio/fiscal-journal-history'), true)
})

test('parseFiscalJournalHistoryQuery accepts import and bank modules', () => {
  const societa = '72000000-0000-4000-8000-000000000001'
  const imp = parseFiscalJournalHistoryQuery({
    societa_id: societa,
    source_module: 'import_contabilita',
    limit: 20,
  })
  assert.equal(imp.societa_id, societa)
  assert.equal(imp.source_module, 'import_contabilita')
  assert.equal(imp.limit, 20)

  const bank = parseFiscalJournalHistoryQuery({
    societaId: societa,
    sourceModule: 'riconciliazione_bancaria',
  })
  assert.equal(bank.source_module, 'riconciliazione_bancaria')
  assert.equal(bank.limit, 50)
})

test('parseFiscalJournalHistoryQuery rejects invalid input', () => {
  assert.equal(parseFiscalJournalHistoryQuery({}), null)
  assert.equal(parseFiscalJournalHistoryQuery({
    societa_id: '72000000-0000-4000-8000-000000000001',
    source_module: 'manuale',
  }), null)
})

test('fiscal-journal-history handler is LAB-gated like post', () => {
  const src = readFileSync(join(root, 'api/studio/fiscal-journal-history.js'), 'utf8')
  assert.match(src, /FISCOSIM_FISCAL_JOURNAL_POST_LAB_ENABLED/)
  assert.match(src, /isIsolatedStudioEnvironment/)
  assert.match(src, /scopedCompanyIds/)
  assert.match(src, /fiscosim_fiscal_journal_claim/)
})
