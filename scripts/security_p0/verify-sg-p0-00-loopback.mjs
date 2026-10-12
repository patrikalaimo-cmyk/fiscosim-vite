/**
 * SG-P0-00 verify-only: Stage3V ready + loopback ports + Stage3U/W RPC + volume present.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { inspectStage3vLocalStack } from './stage3v-local-stack.mjs'

const PROJECT = 'FiscoSim-P0-LAB-20261008-164658'
const VOLUME = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
mkdirSync(reportDir, { recursive: true })
const outPath = join(reportDir, `STAGE3W_SG_P0_00_LOOPBACK_${stamp}.txt`)
const lines = []
const log = (m) => { lines.push(String(m)); console.log(m) }

function docker(args) {
  return execFileSync('docker', args, { encoding: 'utf8' }).trim()
}

try {
  log('P0_00_VERIFY_AFTER_REBIND_AND_KONG_RESTORE')
  const vols = docker(['volume', 'ls', '-q']).split(/\r?\n/).map((s) => s.trim())
  log(`VOLUME_OK=${vols.includes(VOLUME)}`)
  const ports = docker(['ps', '--filter', `name=${PROJECT}`, '--format', '{{.Names}} {{.Ports}}'])
  log('PORTS=')
  log(ports)
  const stack = inspectStage3vLocalStack()
  log(`STAGE3V_READY=${stack.ready}`)
  log(`STAGE3V_LOOPBACK=${stack.allLabPortsLoopback}`)
  log(`STAGE3V_NETWORK=${stack.correctNetwork}`)
  log(`STAGE3V_GATEWAY=${stack.gatewayPublished}`)
  const rpc = docker([
    'exec', `supabase_db_${PROJECT}`,
    'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
    `SELECT (to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL)::text||'|'||(to_regprocedure('public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)') IS NOT NULL)::text;`,
  ])
  log(`STAGE3U_W_RPC=${rpc}`)
  log('BACKUP_ROOT=C:\\Users\\patri\\FiscoSim-P0-LAB-BACKUP-20261012130159')
  log('NOTE=Kong /home/kong restored (crt/key + kong.yml LAB names); script snapshots ephemeral on rebind')
  const portsOk = !/0\.0\.0\.0|\[::\]/.test(ports) && /127\.0\.0\.1:55321/.test(ports)
  const rpcOk = /^(t|true)\|(t|true)$/i.test(rpc.trim())
  if (stack.ready && stack.allLabPortsLoopback && portsOk && rpcOk && vols.includes(VOLUME)) {
    log('P0_00_RESULT=PASS')
  } else {
    throw new Error('VERIFY_FAILED')
  }
} catch (err) {
  log(`P0_00_RESULT=FAIL ${err?.message || err}`)
  writeFileSync(outPath, lines.join('\n') + '\n')
  console.log(`EVIDENCE=${outPath}`)
  process.exit(1)
}

writeFileSync(outPath, lines.join('\n') + '\n')
console.log(`EVIDENCE=${outPath}`)
