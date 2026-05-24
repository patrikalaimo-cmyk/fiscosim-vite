import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationPath = path.join(repoRoot, 'supabase', 'migrations', '20260508140000_core_commit_canonical_accounting_payload.sql')

const source = await readFile(migrationPath, 'utf8')
const normalized = source.toLowerCase()

function expectContains(token, message = token) {
  assert.equal(source.includes(token), true, `Missing expected token: ${message}`)
}

function expectContainsAny(tokens, message) {
  assert.equal(tokens.some((token) => source.includes(token)), true, `Missing expected token: ${message}`)
}

function expectNotContains(token, message = token) {
  assert.equal(source.includes(token), false, `Forbidden token still present: ${message}`)
}

expectContains('canonical_accounting_commit_audit')
expectContains('commit_canonical_accounting_payload')
expectContains('idempotency_key')
expectContains('constraint canonical_accounting_commit_audit_idempotency_scope_uk unique (source_module, idempotency_key, mode)')
expectContains('payload_hash')
expectContainsAny(['source_module text not null', 'source_module text not null,'], 'source_module definition')
expectContainsAny(['canonical_accounting_commit_audit_mode_ck', "check (mode in ('dry_run', 'commit'))"], 'mode check')
expectContainsAny(['canonical_accounting_commit_audit_status_ck', "check (status in ('dry_run', 'committed', 'replayed', 'blocked', 'failed', 'failed_rollback'))"], 'status check')
expectContains('enable row level security')
expectContains('security definer')
expectContains('set search_path = public, pg_temp')
expectContains('on conflict (source_module, idempotency_key, mode) do nothing')
expectContains('where source_module = v_source_module')
expectContains('and idempotency_key = v_idempotency_key')
expectContains('and mode = v_mode')
expectContains('revoke all on table public.canonical_accounting_commit_audit from public')
expectContains('revoke all on table public.canonical_accounting_commit_audit from anon')
expectContains('revoke all on table public.canonical_accounting_commit_audit from authenticated')
expectContains('revoke all on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, text, jsonb, jsonb) from public')
expectContains('grant execute on function public.commit_canonical_accounting_payload(uuid, text, uuid, text, text, text, text, jsonb, jsonb) to service_role')
expectContains('real_commit_not_implemented')
expectContainsAny(['legacy reference accounting_entries rilevata', 'legacy source commit path rilevato', 'legacy createScritturaContabile rilevata', 'legacy createPrimaNotaCompleta rilevata'], 'legacy guard')

expectNotContains('allow_all')
expectNotContains('constraint canonical_accounting_commit_audit_idempotency_key_uk unique (idempotency_key)')
expectNotContains('insert into prima_nota')
expectNotContains('insert into prima_nota_righe')
expectNotContains('insert into partitario')
expectNotContains('insert into registri_iva')
expectNotContains('update movimenti_bancari')
expectNotContains('update documenti_contabilita')

assert.equal(source.includes('real_commit_not_implemented'), true)

console.log('Migration guard passed: review-ready SQL still blocks the real commit path and does not contain unsafe final writes.')
