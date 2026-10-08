import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
const path = new URL('../sql/security_p0/01_containment_STAGING_ONLY.sql', import.meta.url)
const load = () => readFile(path, 'utf8')

test('P0 containment is an explicit opt-in transaction for the isolated test DB', async () => {
  const source = await load()
  assert.match(source, /^BEGIN;/m)
  assert.match(source, /SET LOCAL lock_timeout/)
  assert.match(source, /current_setting\('fiscosim\.p0_isolated_approval', true\)/)
  assert.match(source, /approved-test-environment-only/)
  assert.match(source, /^COMMIT;\s*$/m)
  assert.doesNotMatch(source, /DROP\s+TABLE|TRUNCATE|DELETE\s+FROM|UPDATE\s+public\./i)
})

test('P0 removes anonymous EXECUTE inherited from PUBLIC and defers unsafe RPC for authenticated', async () => {
  const source = await load()
  assert.match(source, /REVOKE EXECUTE ON FUNCTION[\s\S]*?FROM PUBLIC, anon;/)
  assert.match(source, /REVOKE EXECUTE ON FUNCTION[\s\S]*?consolidazione_stampa_definitiva\(uuid,text,integer,date,date,uuid,text,text,jsonb\)[\s\S]*?FROM PUBLIC, anon, authenticated;/)
  assert.match(source, /has_function_privilege\('anon',f\.oid,'EXECUTE'\)/)
  assert.match(source, /has_function_privilege\('authenticated',[\s\S]*?'EXECUTE'\)/)
})

test('P0 drops broad TRUE policies only when scoped replacements have been inspected', async () => {
  const source = await load()
  for (const name of ['"allow_all_pn_righe"', '"public_access"', '"causali_iva_all"',
    '"causali_contabili_all"', '"allow_all_doc_cont"', '"allow_all_documenti"']) {
    assert.ok(source.includes('DROP POLICY IF EXISTS ' + name), name)
  }
  assert.match(source, /prima_nota_righe_policy/)
  assert.match(source, /utenti_studio_self_or_owner_select/)
  assert.match(source, /FROM anon;/)
})

test('P0 candidate explicitly refuses to certify full RLS tenant isolation', async () => {
  const source = await load()
  assert.match(source, /Broad authenticated policies on other legacy tables remain a P0 residual/)
  assert.doesNotMatch(source, /ALTER TABLE[^;]*DISABLE ROW LEVEL SECURITY/i)
})
