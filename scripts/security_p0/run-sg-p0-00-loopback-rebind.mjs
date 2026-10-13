/**
 * SG-P0-00: recreate P0 LAB published-port containers with HostIp=127.0.0.1 only.
 * NEVER removes volumes. NEVER touches fiscosim-local / 54321 stack.
 * LAB-only. Requires operator authorization for container stop/rm/recreate.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const PROJECT = 'FiscoSim-P0-LAB-20261008-164658'
const NETWORK = 'fiscosim-p0-loopback'
const VOLUME = 'supabase_db_FiscoSim-P0-LAB-20261008-164658'
const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14)
const reportDir = join(process.cwd(), 'REPORT')
const outPath = join(reportDir, `STAGE3W_SG_P0_00_LOOPBACK_${stamp}.txt`)

const PUBLISH = [
  { name: `supabase_kong_${PROJECT}`, bindings: [{ host: '55321', container: '8000' }] },
  { name: `supabase_db_${PROJECT}`, bindings: [{ host: '55322', container: '5432' }], requireVolume: true },
  { name: `supabase_studio_${PROJECT}`, bindings: [{ host: '55323', container: '3000' }] },
  { name: `supabase_inbucket_${PROJECT}`, bindings: [{ host: '55324', container: '8025' }] },
  { name: `supabase_analytics_${PROJECT}`, bindings: [{ host: '55327', container: '4000' }] },
]

const lines = []
function log(msg) {
  const row = String(msg)
  lines.push(row)
  console.log(row)
}

function sh(bin, args, opts = {}) {
  return execFileSync(bin, args, { encoding: 'utf8', ...opts }).trim()
}

function docker(args, opts = {}) {
  return sh('docker', args, opts)
}

function sleepMs(ms) {
  try {
    execFileSync(process.platform === 'win32' ? 'powershell' : 'sleep',
      process.platform === 'win32'
        ? ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`]
        : [String(Math.ceil(ms / 1000))],
      { stdio: 'ignore' })
  } catch {
    const end = Date.now() + ms
    while (Date.now() < end) { /* spin */ }
  }
}

function inspect(name) {
  return JSON.parse(docker(['inspect', name]))[0]
}

function assertVolumePresent() {
  const names = docker(['volume', 'ls', '-q']).split(/\r?\n/).map((s) => s.trim())
  if (!names.includes(VOLUME)) throw new Error('VOLUME_MISSING_' + VOLUME)
  log(`VOLUME_OK=${VOLUME}`)
}

function backupDump(backupRoot) {
  mkdirSync(backupRoot, { recursive: true })
  const db = `supabase_db_${PROJECT}`
  docker(['exec', db, 'pg_dump', '-U', 'postgres', '-d', 'postgres', '-Fc', '-f', '/tmp/p0lab.dump'])
  docker(['cp', `${db}:/tmp/p0lab.dump`, join(backupRoot, 'p0lab.dump')])
  log(`BACKUP_DUMP=${join(backupRoot, 'p0lab.dump')}`)
  docker([
    'run', '--rm',
    '-v', `${VOLUME}:/var/lib/postgresql/data:ro`,
    '-v', `${backupRoot}:/backup`,
    'alpine',
    'tar', 'czf', '/backup/supabase_db_volume.tgz', '-C', '/var/lib/postgresql/data', '.',
  ])
  log(`BACKUP_TAR=${join(backupRoot, 'supabase_db_volume.tgz')}`)
}

function recreateLoopback(spec) {
  const { name, bindings, requireVolume } = spec
  const bak = `${name}.__pre_sg_p0_00`
  log(`REBIND_START=${name}`)

  let info
  try {
    info = inspect(name)
  } catch {
    throw new Error('CONTAINER_MISSING_' + name)
  }

  if (requireVolume) {
    const mounts = info.Mounts || []
    const hit = mounts.some((m) => m.Name === VOLUME || String(m.Source || '').includes(VOLUME))
    if (!hit) throw new Error('DB_VOLUME_MOUNT_MISSING')
  }

  // Snapshot ephemeral filesystem paths that supabase CLI injects (kong.yml + TLS)
  const ephemeralDirs = name.includes('_kong_') ? ['/home/kong'] : []
  const snapRoot = join(tmpdir(), `sg-p0-00-${name}-${stamp}`)
  for (const dir of ephemeralDirs) {
    const local = join(snapRoot, dir.replace(/\//g, '_'))
    mkdirSync(local, { recursive: true })
    try {
      docker(['cp', `${name}:${dir}/.`, local])
      log(`EPHEMERAL_SNAP=${name}:${dir} -> ${local}`)
    } catch (err) {
      log(`EPHEMERAL_SNAP_FAIL=${name}:${dir} ${err?.message || err}`)
    }
  }

  // Stop live container; keep as bak until new one healthy
  try { docker(['stop', name]) } catch { /* may already be stopped */ }
  try { docker(['rename', name, bak]) } catch (err) {
    // If bak exists from prior failed run, remove bak only if new name free — never -v
    try { docker(['rm', '-f', bak]) } catch { /* ignore */ }
    docker(['rename', name, bak])
  }

  const args = ['create', `--name=${name}`]
  args.push(`--network=${NETWORK}`)
  for (const b of bindings) {
    args.push('-p', `127.0.0.1:${b.host}:${b.container}`)
  }

  // Env
  for (const env of info.Config.Env || []) {
    args.push('-e', env)
  }

  // Labels (preserve supabase cli labels)
  for (const [k, v] of Object.entries(info.Config.Labels || {})) {
    args.push('--label', `${k}=${v}`)
  }

  // Restart policy
  const rp = info.HostConfig?.RestartPolicy?.Name
  if (rp && rp !== 'no') args.push('--restart', rp)

  // Privileged / shm / etc
  if (info.HostConfig?.Privileged) args.push('--privileged')
  if (info.HostConfig?.ShmSize) args.push('--shm-size', String(info.HostConfig.ShmSize))
  if (info.HostConfig?.Runtime) args.push('--runtime', info.HostConfig.Runtime)

  // Mounts (bind + volume) — critical for DB volume
  for (const m of info.Mounts || []) {
    if (m.Type === 'volume') {
      const dest = m.Destination
      const vol = m.Name
      const ro = m.RW === false ? ':ro' : ''
      args.push('-v', `${vol}:${dest}${ro}`)
    } else if (m.Type === 'bind') {
      const dest = m.Destination
      const src = m.Source
      const ro = m.RW === false ? ':ro' : ''
      args.push('-v', `${src}:${dest}${ro}`)
    }
  }

  // Working dir / user / entrypoint / cmd
  if (info.Config.WorkingDir) args.push('-w', info.Config.WorkingDir)
  if (info.Config.User) args.push('-u', info.Config.User)
  // Supabase LAB images use Entrypoint=["sh"] + Cmd=["-c", script...]
  if (Array.isArray(info.Config.Entrypoint) && info.Config.Entrypoint.length === 1) {
    args.push('--entrypoint', info.Config.Entrypoint[0])
  } else if (Array.isArray(info.Config.Entrypoint) && info.Config.Entrypoint.length > 1) {
    throw new Error('MULTI_PART_ENTRYPOINT_UNSUPPORTED_' + name)
  }

  const image = info.Config.Image
  args.push(image)

  if (Array.isArray(info.Config.Cmd) && info.Config.Cmd.length) {
    for (const c of info.Config.Cmd) args.push(c)
  }

  log(`CREATE_ARGS_COUNT=${args.length}`)
  try {
    docker(args)
  } catch (err) {
    // Rollback rename
    try { docker(['rename', bak, name]); docker(['start', name]) } catch { /* ignore */ }
    throw err
  }

  // Restore ephemeral files BEFORE start (kong SSL + declarative config)
  for (const dir of ephemeralDirs) {
    const local = join(snapRoot, dir.replace(/\//g, '_'))
    if (!existsSync(local)) continue
    const files = readdirSync(local)
    for (const f of files) {
      docker(['cp', join(local, f), `${name}:${dir}/${f}`])
      log(`EPHEMERAL_RESTORE=${name}:${dir}/${f}`)
    }
  }

  docker(['start', name])
  // Attach to network with alias if needed
  const aliases = info.NetworkSettings?.Networks?.[NETWORK]?.Aliases || []
  // create --network already attaches; aliases may need docker network connect --alias
  if (aliases.length) {
    try {
      docker(['network', 'disconnect', NETWORK, name])
    } catch { /* ignore */ }
    const na = ['network', 'connect']
    for (const a of aliases) na.push('--alias', a)
    na.push(NETWORK, name)
    docker(na)
  }

  // Verify HostIp
  const after = inspect(name)
  const ports = after.NetworkSettings?.Ports || {}
  for (const b of bindings) {
    const key = `${b.container}/tcp`
    const pubs = ports[key] || []
    const ok = pubs.some((p) => p.HostIp === '127.0.0.1' && p.HostPort === b.host)
    const bad = pubs.some((p) => !p.HostIp || p.HostIp === '0.0.0.0' || p.HostIp === '::')
    log(`PORT_CHECK=${name} ${key} ok=${ok} bad=${bad} pubs=${JSON.stringify(pubs)}`)
    if (!ok || bad) {
      throw new Error(`PORT_BIND_FAILED_${name}_${key}`)
    }
  }

  // Remove bak container WITHOUT -v
  docker(['rm', '-f', bak])
  log(`REBIND_PASS=${name}`)
}

async function main() {
  log('P0_00_START loopback rebind (volume-preserving)')
  assertVolumePresent()

  const backupRoot = join(process.env.USERPROFILE || process.cwd(), `FiscoSim-P0-LAB-BACKUP-${stamp}`)
  log(`BACKUP_ROOT=${backupRoot}`)
  backupDump(backupRoot)

  // Baseline ports
  log(`BEFORE_PORTS=${docker(['ps', '--filter', `name=${PROJECT}`, '--format', '{{.Names}} {{.Ports}}']).replace(/\n/g, ' | ')}`)

  for (const spec of PUBLISH) {
    recreateLoopback(spec)
  }

  assertVolumePresent()
  log(`AFTER_PORTS=${docker(['ps', '--filter', `name=${PROJECT}`, '--format', '{{.Names}} {{.Ports}}']).replace(/\n/g, ' | ')}`)

  // Reconnect dependents after DB port rebind (no volume touch)
  const dependents = [
    `supabase_auth_${PROJECT}`,
    `supabase_rest_${PROJECT}`,
    `supabase_realtime_${PROJECT}`,
    `supabase_storage_${PROJECT}`,
    `supabase_pg_meta_${PROJECT}`,
    `supabase_kong_${PROJECT}`,
  ]
  for (const dep of dependents) {
    try {
      docker(['restart', dep])
      log(`RESTART_OK=${dep}`)
    } catch (err) {
      log(`RESTART_SKIP=${dep} ${err?.message || err}`)
    }
  }

  // Wait for postgres accept connections
  let pgReady = false
  for (let i = 0; i < 30; i++) {
    try {
      const r = docker([
        'exec', `supabase_db_${PROJECT}`,
        'pg_isready', '-U', 'postgres', '-d', 'postgres',
      ])
      if (r.includes('accepting')) {
        pgReady = true
        break
      }
    } catch { /* retry */ }
    sleepMs(2000)
  }
  log(`PG_READY=${pgReady}`)
  if (!pgReady) throw new Error('PG_NOT_READY_AFTER_REBIND')

  // Stage3V stack inspect
  const { inspectStage3vLocalStack } = await import('./stage3v-local-stack.mjs')
  const stack = inspectStage3vLocalStack()
  log(`STAGE3V_READY=${stack.ready}`)
  log(`STAGE3V_LOOPBACK=${stack.allLabPortsLoopback}`)
  log(`STAGE3V_NETWORK=${stack.correctNetwork}`)
  if (!stack.ready || !stack.allLabPortsLoopback) {
    log(`STAGE3V_DETAIL=${JSON.stringify(stack).slice(0, 800)}`)
    throw new Error('STAGE3V_NOT_READY_AFTER_REBIND')
  }

  // Stage3U RPC still present
  const rpc = docker([
    'exec', '-i', `supabase_db_${PROJECT}`,
    'psql', '-U', 'postgres', '-d', 'postgres', '-At', '-c',
    `SELECT (to_regprocedure('public.fiscosim_post_general_journal(uuid,uuid,uuid,jsonb,jsonb,text)') IS NOT NULL)::text||'|'||(to_regprocedure('public.fiscosim_post_fiscal_journal(uuid,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,text)') IS NOT NULL)::text;`,
  ])
  log(`STAGE3U_W_RPC=${rpc}`)
  const rpcOk = /^(t|true)\|(t|true)$/i.test(rpc.trim())
  if (!rpcOk) throw new Error('STAGE3U_OR_W_RPC_MISSING')

  log('P0_00_RESULT=PASS')
}

main()
  .catch((err) => {
    console.error(err)
    lines.push(`P0_00_RESULT=FAIL ${err?.message || err}`)
  })
  .finally(() => {
    writeFileSync(outPath, lines.join('\n') + '\n', 'utf8')
    console.log(`EVIDENCE=${outPath}`)
    if (lines.some((l) => l.startsWith('P0_00_RESULT=FAIL'))) process.exit(1)
  })
