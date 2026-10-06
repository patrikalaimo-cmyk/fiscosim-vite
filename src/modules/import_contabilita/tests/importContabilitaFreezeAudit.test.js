import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('IMPORT-25A-FREEZE — commit richiede Working View pronta e conferma esplicita operatore', async () => {
  const source = await readFile(
    new URL('../components/working_view/ImportContabilitaWorkingView.jsx', import.meta.url),
    'utf8',
  )

  assert.match(
    source,
    /disabled=\{commitBusy \|\| isCommittingDemoDocument \|\| mergedWorkingViewChecks\.status !== 'ok'\}/,
  )
  assert.match(source, /buildDemoWorkingViewCommitConfirmMessage\(/)
  assert.match(source, /if \(!window\.confirm\(message\)\) return/)
  assert.match(source, /onCommitDemoWorkingView\(\{ ivaDraftRows: effectiveIvaDraftRows, pnDraftRows \}\)/)
})

test('IMPORT-25A-FREEZE — Working Table apre il flusso di lavorazione e non chiama direttamente runCommitWorkflow', async () => {
  const source = await readFile(new URL('../index.jsx', import.meta.url), 'utf8')
  const tableRenderStart = source.search(/<ImportContabilitaWorkingTable\s/)
  const tableRenderEnd = source.indexOf('/>', tableRenderStart)
  const tableBlock = source.slice(tableRenderStart, tableRenderEnd + 2)

  assert.ok(tableRenderStart >= 0)
  assert.match(tableBlock, /onStagingRowClick=\{onStagingRowClick\}/)
  assert.doesNotMatch(tableBlock, /runCommitWorkflow/)
})

test('IMPORT-25A-FREEZE — commit DB resta concentrato nel handler esplicito della Working View', async () => {
  const source = await readFile(new URL('../index.jsx', import.meta.url), 'utf8')
  const handlerStart = source.indexOf('const handleDemoWorkingViewCommit = async')
  const handlerEnd = source.indexOf('const onGoToPreviousWorkingViewRow', handlerStart)
  const handlerBlock = source.slice(handlerStart, handlerEnd)

  assert.ok(handlerStart >= 0)
  assert.ok(handlerEnd > handlerStart)
  assert.match(handlerBlock, /runCommitWorkflow\(bundle\.commitEnvelope, \{ db: sb \}\)/)

  const outsideHandler = source.slice(0, handlerStart) + source.slice(handlerEnd)
  assert.doesNotMatch(outsideHandler, /runCommitWorkflow\(/)
})
