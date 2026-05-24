import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const filePath = new URL('../../src/modules/contabilita/prima_nota_guidata.jsx', import.meta.url)
const content = await readFile(filePath, 'utf8')

function mustMatch(pattern, message) {
  assert.ok(pattern.test(content), message)
}

function mustNotMatch(pattern, message) {
  assert.ok(!pattern.test(content), message)
}

mustMatch(/const REAL_SAVE_TEMPORARILY_BLOCKED = true/, 'real save guard constant missing')
mustMatch(/Salvataggio reale non atomico temporaneamente bloccato\. Usa Verifica commit atomico gated\/dry-run\./, 'guard message missing')
mustMatch(/Salvataggio reale bloccato/, 'blocked save button label missing')
mustMatch(/handleMockAtomicCommit/, 'mock handler missing')
mustMatch(/commitCanonicalAccountingPayload/, 'manual view must call the shared canonical commit service')
mustMatch(/Verifica commit atomico \(gated\/dry-run\)/, 'gated dry-run button label missing')
mustMatch(/buildManualRegistrationCommitInput/, 'manual commit input helper no longer used')
mustNotMatch(/commitCanonicalAccountingPayloadMock/, 'manual view must not call the legacy mock adapter directly')
mustNotMatch(/createPrimaNotaCompleta\s*\(/, 'legacy createPrimaNotaCompleta call reintroduced in guided manual view')
mustNotMatch(/createScritturaContabile\s*\(/, 'legacy createScritturaContabile call reintroduced in guided manual view')
mustNotMatch(/accounting_entries/, 'manual guided view must not talk directly to accounting_entries')

const realSaveGuarded = /REAL_SAVE_TEMPORARILY_BLOCKED\s*\|\|\s*saving/.test(content) || /REAL_SAVE_TEMPORARILY_BLOCKED\s*\|\|\s*\(!totals\.bilanciata/.test(content)
assert.ok(realSaveGuarded, 'real save button is not guarded/disabled')

console.log('Manual registration real-save guard checks passed.')