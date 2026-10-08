import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (file) => readFileSync(new URL('../sql/security_p0/' + file, import.meta.url), 'utf8')
const lab = read('28_stage3j_legacy_quarantine_LAB_ONLY.sql')
const negative = read('29_stage3j_legacy_quarantine_TEST_ONLY.sql')
const rollback = read('30_stage3j_rollback_TEST_ONLY.sql')
const legacyTables = ['studios','users','clients','f24_scadenze','f24_righe','liquidazioni_iva']

test('P0 Stage3J six legacy tables are quarantined, never mapped by assumption', () => {
  for (const table of legacyTables) {
    assert.ok(lab.includes("'" + table + "'"), table)
    assert.ok(negative.includes("'" + table + "'"), table)
  }
  assert.match(lab, /local-legacy-six-table-quarantine/)
  assert.match(lab, /REVOKE ALL PRIVILEGES ON TABLE/)
  assert.match(lab, /FROM authenticated, anon, PUBLIC/)
  assert.match(lab, /has_column_privilege\('authenticated'/)
  assert.match(lab, /has_table_privilege\('service_role'/)
  assert.match(lab, /FOREIGN KEY \(studio_id\)/)
  assert.match(lab, /is_nullable='YES'/)
  assert.match(lab, /COMMIT;/)
  assert.doesNotMatch(lab, /\bUPDATE\s+public\./i)
  assert.doesNotMatch(lab, /\bINSERT\s+INTO\s+public\./i)
  assert.doesNotMatch(lab, /\bDELETE\s+FROM\s+public\./i)
})

test('P0 Stage3J actual SQL role probes are zero-row and transactional', () => {
  assert.match(negative, /SET LOCAL ROLE authenticated/)
  assert.match(negative, /local-legacy-quarantine-test-only/)
  assert.match(negative, /WHERE false/)
  assert.match(negative, /LIMIT 0/)
  assert.match(negative, /insufficient_privilege/)
  assert.match(negative, /ROLLBACK;/)
  assert.doesNotMatch(negative, /\bCOMMIT\s*;/i)
})

test('P0 Stage3J rollback is unsafe, gated, and never automatic', () => {
  assert.match(rollback, /unsafe-lab-restore-legacy-browser-dml/)
  assert.match(rollback, /GRANT SELECT,INSERT,UPDATE,DELETE/)
  assert.match(rollback, /TO authenticated/)
  assert.doesNotMatch(lab, /GRANT ALL PRIVILEGES/)
})
