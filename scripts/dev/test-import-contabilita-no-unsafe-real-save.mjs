import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const indexFile = new URL('../../src/modules/import_contabilita/index.jsx', import.meta.url)
const workingViewFile = new URL('../../src/modules/import_contabilita/components/working_view/ImportContabilitaWorkingView.jsx', import.meta.url)
const helperFile = new URL('../../src/modules/import_contabilita/domain/buildImportContabilitaCommitInput.js', import.meta.url)
const workflowFile = new URL('../../src/modules/import_contabilita/application/importContabilitaWorkflow.js', import.meta.url)

const [workflowContent, indexContent, workingViewContent, helperContent] = await Promise.all([
  readFile(workflowFile, 'utf8'),
  readFile(indexFile, 'utf8'),
  readFile(workingViewFile, 'utf8'),
  readFile(helperFile, 'utf8'),
])

function mustMatch(content, pattern, message) {
  assert.ok(pattern.test(content), message)
}

function mustNotMatch(content, pattern, message) {
  assert.ok(!pattern.test(content), message)
}

mustMatch(workflowContent, /runCommitWorkflow\s*\(/, 'runCommitWorkflow missing from workflow file')
mustMatch(workflowContent, /Commit workflow not implemented yet/, 'commit workflow stub message missing')
mustNotMatch(workflowContent, /createPrimaNotaCompleta\s*\(/, 'workflow must not call createPrimaNotaCompleta')
mustNotMatch(workflowContent, /accounting_entries\s*\./, 'workflow must not write accounting_entries directly')

mustNotMatch(indexContent, /Verifica commit atomico import \(mock\/dry-run\)/, 'index should not expose import atomic mock button directly')

mustMatch(workingViewContent, /commitCanonicalAccountingPayload/, 'working view must call the shared canonical commit service')
mustMatch(workingViewContent, /allowRealCommit:\s*false/, 'working view must keep real commit disabled')
mustMatch(workingViewContent, /auditWriteEnabled:\s*false/, 'working view must keep audit write disabled')
mustMatch(workingViewContent, /Verifica commit atomico import \(gated\/dry-run\)/, 'working view gated/dry-run button label missing')
mustMatch(workingViewContent, /commitDryRunRunning/, 'working view running guard missing')
mustMatch(workingViewContent, /buildImportContabilitaCommitInput/, 'working view must build import commit input')
mustNotMatch(workingViewContent, /createPrimaNotaCompleta\s*\(/, 'working view must not call createPrimaNotaCompleta')
mustNotMatch(workingViewContent, /createScritturaContabile\s*\(/, 'working view must not call createScritturaContabile')
mustNotMatch(workingViewContent, /accounting_entries\s*\./, 'working view must not write accounting_entries directly')
mustNotMatch(workingViewContent, /commitCanonicalAccountingPayloadMock/, 'working view must not call the legacy mock adapter directly')

mustMatch(helperContent, /sourceModule:\s*'import_contabilita'/, 'import commit input helper missing sourceModule')
mustMatch(helperContent, /import:/, 'import commit input helper missing import idempotencyKey prefix')

console.log('Import Contabilità unsafe real-save guard checks passed.')