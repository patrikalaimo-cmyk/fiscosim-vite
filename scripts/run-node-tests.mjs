import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const ROOT_TEST_DIR = path.resolve('tests')
const IMPORT_TEST_DIR = path.resolve('src/modules/import_contabilita/tests')
const IMPORT_ROOT_TESTS = new Set(['testLabIntegrazione.test.js'])

async function listTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.js'))
    .map((entry) => path.join(directory, entry.name))
    .sort((a, b) => a.localeCompare(b))
}

async function resolveProfile(profile) {
  const rootTests = await listTestFiles(ROOT_TEST_DIR)
  const importModuleTests = await listTestFiles(IMPORT_TEST_DIR)
  const importRootTests = rootTests.filter((file) => IMPORT_ROOT_TESTS.has(path.basename(file)))
  const coreTests = rootTests.filter((file) => !IMPORT_ROOT_TESTS.has(path.basename(file)))

  if (profile === 'import') {
    return [...importModuleTests, ...importRootTests]
  }
  if (profile === 'core') {
    return coreTests
  }
  if (profile === 'all') {
    return [...coreTests, ...importModuleTests, ...importRootTests]
  }

  throw new Error(`Profilo test sconosciuto "${profile}". Usa: import, core, all.`)
}

async function main() {
  const profile = String(process.argv[2] || '').trim().toLowerCase()
  const files = await resolveProfile(profile)

  if (!files.length) {
    throw new Error(`Nessun file test trovato per il profilo "${profile}".`)
  }

  console.log(`[FISCOSIM_TEST] profile=${profile} files=${files.length}`)
  files.forEach((file) => console.log(`[FISCOSIM_TEST_FILE] ${path.relative(process.cwd(), file)}`))

  const child = spawn(process.execPath, ['--test', ...files], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
    },
    stdio: 'inherit',
    shell: false,
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) {
        reject(new Error(`Node test runner terminato dal segnale ${signal}.`))
        return
      }
      resolve(code ?? 1)
    })
  })

  process.exitCode = exitCode
}

main().catch((error) => {
  console.error(`[FISCOSIM_TEST_ERROR] ${error?.stack || error}`)
  process.exitCode = 1
})
