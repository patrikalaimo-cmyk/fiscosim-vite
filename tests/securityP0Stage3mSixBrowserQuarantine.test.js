import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const read = name => readFileSync(
  new URL('../sql/security_p0/' + name, import.meta.url),'utf8'
)

const patch = read('35_stage3m_six_browser_quarantine_LAB_ONLY.sql')
const negative = read('36_stage3m_six_browser_quarantine_TEST_ONLY.sql')
const rollback = read('37_stage3m_rollback_TEST_ONLY.sql')

const six = [
  'client_modules','client_responsabili','invii_log',
  'test_cases','test_datasets','test_runs'
]

test('Stage3M quarantines only six, preserves AgeCon and declaration workflows',()=>{
 for (const t of six) {
  assert.ok(patch.includes("'" + t + "'"),t)
  assert.ok(negative.includes("'" + t + "'"),t)
 }
 assert.match(patch,/isolated-six-table-browser-quarantine-only/)
 assert.match(patch,/REVOKE ALL PRIVILEGES ON TABLE/)
 assert.match(patch,/FROM authenticated, anon, PUBLIC/)
 assert.match(patch,/has_column_privilege\('authenticated'/)
 assert.match(patch,/has_column_privilege\('anon'/)
 assert.match(patch,/has_table_privilege\('service_role'/)
 assert.match(patch,/public\.avvisi_ade/)
 assert.match(patch,/public\.revisioni_dichiarativi/)
 assert.match(patch,/COMMIT;/)
 for (const mutation of [/\bINSERT\s+INTO\s+public\./i,/\bUPDATE\s+public\./i,/\bDELETE\s+FROM\s+public\./i])
  assert.doesNotMatch(patch,mutation)
})

test('Stage3M probes authenticated and anon with no row mutation',()=>{
 assert.match(negative,/SET LOCAL ROLE authenticated/)
 assert.match(negative,/SET LOCAL ROLE anon/)
 assert.match(negative,/WHERE false/)
 assert.match(negative,/LIMIT 0/)
 assert.match(negative,/insufficient_privilege/)
 assert.match(negative,/ROLLBACK;/)
 assert.doesNotMatch(negative,/\bCOMMIT\s*;/i)
})

test('Stage3M rollback explicitly dangerous and opt-in only',()=>{
 assert.match(rollback,/unsafe-lab-restore-six-browser-acls/)
 assert.match(rollback,/GRANT ALL PRIVILEGES ON TABLE/)
 assert.match(rollback,/TO anon/)
 assert.match(rollback,/TO authenticated/)
 assert.match(rollback,/DANGEROUS/)
})
