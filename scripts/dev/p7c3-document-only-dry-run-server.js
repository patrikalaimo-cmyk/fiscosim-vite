import { spawn } from 'node:child_process'

function hasValue(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function hasFlag(argv, flag) {
  return argv.includes(flag)
}

function readServerSupabaseEnvStatus() {
  return {
    hasUrl: hasValue(process.env.SUPABASE_URL) || hasValue(process.env.VITE_SUPABASE_URL),
    hasServiceRole: hasValue(process.env.SUPABASE_SERVICE_ROLE_KEY) || hasValue(process.env.VITE_SUPABASE_SERVICE_ROLE_KEY),
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/dev/p7c3-document-only-dry-run-server.js \
    --societa-id <uuid> \
    --operator-id <uuid> \
    --counterparty-account-id <uuid> \
    --cost-revenue-account-id <uuid> \
    --causale-contabile-id <uuid> \
    --registration-date <YYYY-MM-DD> \
    [--candidate-name "HAPPY CASA STORE S.R.L."] \
    [--candidate-number "184 00582"] \
    [--causale-iva-id <uuid>]

This entrypoint is server/test only.
It requires server-side Supabase envs and always runs the underlying script in dry-run/preflight mode.
`)
}

async function main() {
  const argv = process.argv.slice(2)

  if (hasFlag(argv, '--help')) {
    printUsage()
    return
  }

  if (hasFlag(argv, '--confirm-document-only-write')) {
    console.error('Blocked: server/test dry-run mode does not allow --confirm-document-only-write.')
    process.exitCode = 1
    return
  }

  const envStatus = readServerSupabaseEnvStatus()
  if (!envStatus.hasUrl || !envStatus.hasServiceRole) {
    console.error('Server-side Supabase envs missing for dry-run/preflight mode.')
    console.error('Required env names: SUPABASE_URL or VITE_SUPABASE_URL; SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_SERVICE_ROLE_KEY.')
    process.exitCode = 1
    return
  }

  const child = spawn(process.execPath, ['scripts/dev/p7c3-document-only-write-smoke.js', ...argv], {
    stdio: 'inherit',
    env: {
      ...process.env,
    },
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => {
      process.exitCode = code ?? 1
      resolve()
    })
  })
}

main().catch((error) => {
  console.error('Server/test dry-run wrapper failed:', error?.message || error)
  process.exitCode = 1
})