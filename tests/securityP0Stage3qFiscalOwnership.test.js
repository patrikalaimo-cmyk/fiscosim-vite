import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = name => readFileSync(new URL('../sql/security_p0/' + name,import.meta.url),'utf8')
const patch=source('45_stage3q_fiscal_owner_rls_LAB_ONLY.sql')
const fixture=source('46_stage3q_two_company_fiscal_TEST_ONLY.sql')

test('Stage3Q is guarded LAB-only and refuses real/orphan customer records',()=>{
 for(const x of [
  'local-explicit-fiscal-row-ownership-only',
  'requires empty isolated LAB','crm_cliente_societa_link',
  'public.clienti','public.avvisi_ade','public.revisioni_dichiarativi',
  'COMMIT;'
 ]) assert.ok(patch.includes(x),x)
 assert.doesNotMatch(patch,/\bUPDATE\s+public\.(?:clienti|avvisi_ade|revisioni_dichiarativi)\s+SET/i)
 assert.doesNotMatch(patch,/\bDELETE\s+FROM\s+public\.(?:clienti|avvisi_ade|revisioni_dichiarativi)\b/i)
 assert.doesNotMatch(patch,/\bDROP\s+POLICY/i)
})

test('Stage3Q grants only authenticated scoped read on bridge, never direct write',()=>{
 assert.match(patch,/CREATE POLICY crm_link_authenticated_scoped_read/)
 assert.match(patch,/GRANT SELECT ON TABLE public\.crm_cliente_societa_link TO authenticated/)
 assert.match(patch,/public\.user_has_societa_access\(societa_id\)/)
 assert.match(patch,/us\.attivo IS TRUE/)
 assert.match(patch,/us\.clienti_assegnati/)
 assert.match(patch,/REVOKE INSERT, UPDATE, DELETE ON TABLE public\.clienti/)
 assert.match(patch,/CRM browser column mutation remains/)
 assert.match(patch,/CRM service role privilege lost/)
 assert.doesNotMatch(patch,/GRANT\s+(?:INSERT|UPDATE|DELETE)\s+ON\s+TABLE\s+public\.crm_cliente_societa_link\s+TO\s+authenticated/i)
})

test('Stage3Q locks both fiscal company and customer, even with shared CRM',()=>{
 for(const key of [
  'ADD COLUMN societa_id uuid NOT NULL REFERENCES public.societa(id)',
  'FOREIGN KEY (cliente_id,societa_id)',
  'REFERENCES public.crm_cliente_societa_link(cliente_id,societa_id)',
  'avvisi_ade_cliente_required CHECK (cliente_id IS NOT NULL)',
  'CREATE POLICY clienti_company_boundary',
  'CREATE POLICY avvisi_ade_company_boundary',
  'CREATE POLICY revisioni_company_boundary',
  'AS RESTRICTIVE FOR ALL TO authenticated',
  'BEFORE UPDATE OF societa_id,cliente_id',
  'Fiscal record company ownership is immutable',
  'Fiscal record customer ownership is immutable',
  "public.current_utente_ruolo() IN ('owner','admin')",
  'created_by=public.current_utente_studio_id()',
  'REVOKE INSERT,UPDATE,DELETE ON TABLE',
  'fiscal table ACL inconsistent'
 ]) assert.ok(patch.includes(key),key)
 for(const table of ['avvisi_ade','revisioni_dichiarativi']){
  assert.match(patch,new RegExp('public\\.'+table+' AS RESTRICTIVE FOR ALL TO authenticated'))
 }
 assert.match(patch,/SECURITY INVOKER/)
 assert.doesNotMatch(patch,/SECURITY DEFINER/)
})

test('Stage3Q actual A/B SQL fixtures are rollback-only and test a shared client',()=>{
 for(const key of [
  'local-fiscal-ownership-matrix-rollback-only',
  'INSERT INTO auth.users',
  'INSERT INTO public.utenti_studio',
  'INSERT INTO public.utenti_studio_societa',
  'INSERT INTO public.crm_cliente_societa_link',
  'INSERT INTO public.avvisi_ade',
  'INSERT INTO public.revisioni_dichiarativi',
  'SET LOCAL ROLE authenticated',
  'request.jwt.claim.sub',
  'Owner A CRM/fiscal scope',
  'Owner B sees shared A fiscal notice',
  'collaborator B saw orphan/clientless declaration',
  'outsider visible fiscal data',
  'foreign_key_violation',
  'fiscal owner override allowed',
  'insufficient_privilege',
  'ROLLBACK;',
 ]) assert.ok(fixture.includes(key),key)
 assert.doesNotMatch(fixture,/\bCOMMIT\s*;/i)
})
