import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(
  new URL('../sql/security_p0/' + file, import.meta.url), 'utf8'
)
const preflight=read('41_stage3p_ownership_preflight_READ_ONLY.sql')
const schema=read('42_stage3p_empty_crm_link_LAB_ONLY.sql')
const qa=read('43_stage3p_empty_crm_link_TEST_ONLY.sql')

test('Stage3P preflight reads only schema and aggregate counts, not personal rows',()=>{
 for(const item of ['3P_TABLE','3P_COLUMN','3P_CONSTRAINT','3P_POLICY','3P_FUNCTION','3P_COUNT',
  "'clienti'","'societa'","'avvisi_ade'","'revisioni_dichiarativi'"]){
  assert.ok(preflight.includes(item),item)
 }
 const src=preflight.split('\n').filter(x=>!/^\s*--/.test(x)).join('\n')
 for(const mutation of [
  /\bINSERT\s+INTO\b/i,/\bUPDATE\s+[a-z_]+\s+SET\b/i,/\bDELETE\s+FROM\b/i,
  /\bALTER\s+TABLE\b/i,/\bDROP\s+TABLE\b/i,/\bCREATE\s+(?:TABLE|POLICY|FUNCTION)\b/i,
  /\bCOMMIT\s*;/i
 ]) assert.doesNotMatch(src,mutation)
})

test('Stage3P isolated link is explicit, empty, revocation-resistant, non-public',()=>{
 for(const fragment of [
  'local-empty-crm-company-link-foundation',
  'REFERENCES public.clienti(id) ON DELETE RESTRICT',
  'REFERENCES public.societa(id) ON DELETE RESTRICT',
  'REFERENCES auth.users(id) ON DELETE RESTRICT',
  'assigned_by uuid NOT NULL',
  'decision_reason text NOT NULL',
  'PRIMARY KEY (cliente_id,societa_id)',
  'ENABLE ROW LEVEL SECURITY',
  'FROM PUBLIC, anon, authenticated, service_role',
  'GRANT SELECT,INSERT',
  'TO service_role',
  'Stage3P new link must start empty',
  'COMMIT;',
 ]) assert.ok(schema.includes(fragment),fragment)
 assert.doesNotMatch(schema,/\bINSERT\s+INTO\s+public\./i)
 assert.doesNotMatch(schema,/\bUPDATE\s+public\./i)
 assert.doesNotMatch(schema,/\bDELETE\s+FROM\s+public\./i)
 assert.doesNotMatch(schema,/GRANT\s+SELECT[^;]*TO\s+authenticated/i)
 assert.doesNotMatch(schema,/\bDROP\s+POLICY\b/i)
 assert.doesNotMatch(schema,/\bCREATE\s+POLICY\b/i)
})

test('Stage3P SQL roles deny browser access and grant insert-only service role',()=>{
 assert.match(qa,/SET LOCAL ROLE authenticated/)
 assert.match(qa,/SET LOCAL ROLE anon/)
 assert.match(qa,/SET LOCAL ROLE service_role/)
 assert.match(qa,/LIMIT 0/)
 assert.match(qa,/WHERE false/)
 assert.match(qa,/insufficient_privilege/)
 assert.match(qa,/ROLLBACK;/)
 assert.doesNotMatch(qa,/\bCOMMIT\s*;/i)
 assert.match(qa,/Stage3P QA unexpectedly wrote CRM bindings/)
})

test('Stage3P preflight runner uses pinned SHA and READ ONLY rollback',()=>{
 const runner=readFileSync(new URL('../scripts/security_p0/run-stage3p-preflight.ps1',import.meta.url),'utf8')
 for(const token of [
  '$ExpectedCommit','rev-parse HEAD','BEGIN READ ONLY','ROLLBACK;',
  'LASTEXITCODE','STAGE3P READ-ONLY PASS','STAGE3P_OWNERSHIP_PREFLIGHT',
  'No database modifications','Test-Path -LiteralPath $base'
 ]) assert.ok(runner.includes(token),token)
 assert.ok(!runner.includes('Tee-Object'))
 assert.ok(!runner.includes('Invoke-Expression'))
})

test('Stage3P PostgreSQL pg_proc volatility is explicitly cast from internal char',()=>{
 // pg_proc.provolatile is an internal \"char\" in PostgreSQL, so text || \"char\"
 // can raise \"operator is not unique\". Keep the cast in the live catalog query.
 assert.match(preflight,/';volatility='\s*\|\|\s*p\.provolatile::text\s+AS\s+details/)
 assert.doesNotMatch(preflight,/\|\|\s*(?:p\.)?provolatile\s+(?:AS|FROM)/)
})

test('Stage3P no writes or backfills to original fiscal tables when creating foundation',()=>{
 for(const table of ['public.clienti','public.avvisi_ade','public.revisioni_dichiarativi']){
  assert.ok(schema.includes(table),table)
 }
 assert.ok(schema.includes('requires empty CRM, notices and declarations'))
 assert.doesNotMatch(schema,/\bUPDATE\s+public\.(?:clienti|avvisi_ade|revisioni_dichiarativi)\b/i)
 assert.doesNotMatch(schema,/\bDELETE\s+FROM\s+public\.(?:clienti|avvisi_ade|revisioni_dichiarativi)\b/i)
})

test('Stage3P isolated SQL integration verifies real FK-backed A/B fixture and rolls back',()=>{
 const real=read('44_stage3p_crm_link_real_transaction_TEST_ONLY.sql')
 for(const term of [
  'isolated-transactional-crm-link-fixtures-only',
  'INSERT INTO auth.users','INSERT INTO public.societa','INSERT INTO public.clienti',
  'INSERT INTO public.crm_cliente_societa_link',
  'SET LOCAL ROLE service_role','SET LOCAL ROLE authenticated',
  'check_violation','insufficient_privilege',
  'Stage3P transaction fixture did not preserve exactly one temporary link',
  'ROLLBACK;'
 ]) assert.ok(real.includes(term),term)
 assert.doesNotMatch(real,/\bCOMMIT\s*;/i)
})

test('Stage3P lab runner pins commit, verifies SQL exit and preserves previous evidence',()=>{
 const runner=readFileSync(new URL('../scripts/security_p0/run-stage3p-foundation.ps1',import.meta.url),'utf8')
 for(const term of [
  'ExpectedCommit','rev-parse HEAD','LASTEXITCODE','42_stage3p_empty_crm_link_LAB_ONLY.sql',
  '43_stage3p_empty_crm_link_TEST_ONLY.sql','44_stage3p_crm_link_real_transaction_TEST_ONLY.sql',
  '($apply -contains \'COMMIT\')',
  '($negative -contains \'ROLLBACK\')',
  '($real -contains \'ROLLBACK\')',
  'BEGIN READ ONLY;','3P_VERIFY|0|0|true','STAGE3P LAB FOUNDATION PASS',
  'Test-Path -LiteralPath $report'
 ]) assert.ok(runner.includes(term),term)
 assert.ok(!runner.includes('Tee-Object'))
})
