import test from 'node:test'
import assert from 'node:assert/strict'
import {
  appendImportFileHashMarker,
  parseImportFileHashMarker,
} from '../src/modules/import_contabilita/application/cronologia/importFileHashMarker.js'
import {
  appendImportCronologiaEntry,
  loadImportCronologiaEntries,
  mergeImportCronologiaEntries,
} from '../src/modules/import_contabilita/application/cronologia/importCronologiaStore.js'
import {
  buildImportFiscalCommitHistoryQuery,
  normalizeImportFiscalCommitHistoryRows,
} from '../src/modules/import_contabilita/application/cronologia/listImportFiscalCommitHistory.js'
import { mapPersistencePlanToFiscalJournalRequest } from '../src/modules/contabilita/application/fiscalJournal/mapPersistencePlanToFiscalJournalRequest.js'

const SOCIETA = '72000000-0000-4000-8000-000000000001'
const CONTO_A = '72000000-0000-4000-8000-000000000014'
const CONTO_B = '72000000-0000-4000-8000-000000000016'
const DOC_IMPORT = '72000000-0000-4000-8000-0000000000aa'

test('import fileHash marker round-trips in motivazione', () => {
  const marked = appendImportFileHashMarker('LAB Stage3W import fiscal post', {
    sourceHash: 'deadbeefcafebabe',
    sourceFileName: 'SG-E2E-FP.xml',
  })
  assert.match(marked, /fileHash=deadbeefcafebabe/)
  assert.match(marked, /file=SG-E2E-FP\.xml/)
  const parsed = parseImportFileHashMarker(marked)
  assert.equal(parsed.sourceHash, 'deadbeefcafebabe')
  assert.equal(parsed.sourceFileName, 'SG-E2E-FP.xml')
})

test('import cronologia local store is interrogabile by societa', () => {
  const memory = new Map()
  const storage = {
    getItem: (k) => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => { memory.set(k, String(v)) },
  }
  const rows = appendImportCronologiaEntry(SOCIETA, {
    sourceFileName: 'a.xml',
    sourceHash: 'abc12345',
    esito: 'committed',
    primaNotaId: '72000000-0000-4000-8000-0000000000bb',
    requestId: DOC_IMPORT,
    numeroDocumento: 'FP-1',
  }, storage)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].interrogabile, true)
  assert.equal(loadImportCronologiaEntries(SOCIETA, storage)[0].sourceHash, 'abc12345')
})

test('mergeImportCronologiaEntries prefers server and dedupes by requestId', () => {
  const server = [{
    societaId: SOCIETA,
    requestId: 'req-1',
    primaNotaId: 'pn-server',
    sourceHash: 'aabbccdd',
    sourceFileName: 'server.xml',
    createdAt: '2026-10-12T12:00:00Z',
  }]
  const local = [{
    societaId: SOCIETA,
    requestId: 'req-1',
    primaNotaId: 'pn-local',
    sourceHash: '11223344',
    sourceFileName: 'local.xml',
    createdAt: '2026-10-12T11:00:00Z',
  }, {
    societaId: SOCIETA,
    requestId: 'req-2',
    primaNotaId: 'pn-only-local',
    sourceHash: '55667788',
    sourceFileName: 'local2.xml',
    createdAt: '2026-10-12T10:00:00Z',
  }]
  const merged = mergeImportCronologiaEntries(server, local, { societaId: SOCIETA })
  assert.equal(merged.length, 2)
  assert.equal(merged[0].primaNotaId, 'pn-server')
  assert.equal(merged[0].sourceHash, 'aabbccdd')
  assert.equal(merged[1].requestId, 'req-2')
})

test('import claim history query filters import_contabilita and exposes hash', () => {
  const sql = buildImportFiscalCommitHistoryQuery({ societaId: SOCIETA, limit: 10 })
  assert.match(sql, /import_contabilita/)
  assert.match(sql, /fiscosim_fiscal_journal_claim/)
  const normalized = normalizeImportFiscalCommitHistoryRows([{
    request_id: DOC_IMPORT,
    prima_nota_id: '72000000-0000-4000-8000-0000000000cc',
    created_at: '2026-10-12T10:00:00Z',
    contract_kind: 'documento_acquisto',
    motivazione: 'LAB Stage3W import fiscal post fileHash=aabbccdd file=doc.xml',
    numero_documento: 'N-1',
    data_registrazione: '2026-04-12',
  }], { societaId: SOCIETA })
  assert.equal(normalized[0].sourceHash, 'aabbccdd')
  assert.equal(normalized[0].sourceFileName, 'doc.xml')
  assert.equal(normalized[0].esito, 'committed')
})

test('mapPersistencePlan embeds import fileHash in motivazione', () => {
  const mapped = mapPersistencePlanToFiscalJournalRequest({
    sourceModule: 'import_contabilita',
    policy: { isFatturaPassiva: true, gestionePartitario: 'apertura' },
    pnPayload: {
      societa_id: SOCIETA,
      data_registrazione: '2026-04-12',
      data_documento: '2026-04-12',
      numero_documento: 'IMP-HASH-1',
      descrizione: 'Import FP con hash file',
      documento_import_id: DOC_IMPORT,
      scope: {
        source_file_name: 'imp-hash-1.xml',
        source_file_hash: '1122334455667788',
      },
    },
    righePayload: [
      { conto_id: CONTO_A, dare: 1000, avere: 0 },
      { conto_id: CONTO_B, dare: 0, avere: 1000 },
    ],
    vatEntries: [{
      tipo: 'acquisto',
      imponibile: 1000,
      iva: 0,
      aliquota: 0,
      data_documento: '2026-04-12',
      numero_documento: 'IMP-HASH-1',
    }],
    partEntries: [{
      tipo: 'fornitore',
      conto_id: CONTO_B,
      importo_originale: 1000,
      importo_residuo: 1000,
      numero_documento: 'IMP-HASH-1',
      data_documento: '2026-04-12',
    }],
  })
  assert.equal(mapped.ok, true, mapped.reason || 'map failed')
  assert.equal(mapped.request.source_module, 'import_contabilita')
  assert.match(mapped.request.motivazione, /fileHash=1122334455667788/)
  assert.match(mapped.request.motivazione, /file=imp-hash-1\.xml/)
})
