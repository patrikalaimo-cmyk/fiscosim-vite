import { readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const ROOT_TEST_DIR = path.resolve('tests')
const IMPORT_TEST_DIR = path.resolve('src/modules/import_contabilita/tests')
const CONTABILITA_APPLICATION_DIR = path.resolve('src/modules/contabilita/application')
const IMPORT_ROOT_TESTS = new Set(['testLabIntegrazione.test.js'])

const CONSULTAZIONE_ROOT_TESTS = new Set([
  'consultazioneMutationWorkflow.test.js',
  'consultazioneOperationsHardening.test.js',
  'consultazioneReadOnlyGuard.test.js',
])

const SPLIT_ROOT_TESTS = new Set([
  'anagraficaSplitPaymentSave.test.js',
  'liquidazioneIvaSplitPayment.test.js',
  'splitPaymentDocumentoAttivo.test.js',
])

const IVA_ROOT_TESTS = new Set([
  'calcoloLiquidazioneIvaDefinitiva.test.js',
  'ivaOrdinariaEndToEndLiquidazione.test.js',
  'ivaRegistriLiquidazioneFreeze.test.js',
  'liquidazioneIvaAggregator.test.js',
  'liquidazioneIvaDefinitivaOrchestrator.test.js',
  'liquidazioneIvaDefinitivaRpcClient.test.js',
  'liquidazioneIvaDefinitivaUiAdapter.test.js',
  'liquidazioneIvaExport.test.js',
  'liquidazioneIvaProvvisoria.test.js',
  'liquidazioneIvaProvvisoriaRealFix.test.js',
  'liquidazioneIvaProvvisoriaUiAdapter.test.js',
  'liquidazioneIvaSplitPayment.test.js',
  'liquidazioneIvaUxHelpers.test.js',
  'registriIvaStampeModel.test.js',
  'vatRegisterEntriesFromCanonicalPayload.test.js',
])

const MANUAL_ROOT_TESTS = new Set([
  'a17xAutofatturaBase.test.js',
  'causaliPolicyEngine.test.js',
  'cespitiIntegrazione.test.js',
  'fase13eClosedPeriodBlock.test.js',
  'fase13fClosedPeriodBlock.test.js',
  'fase3RegistrazioneManualeMovimentiGenerali.test.js',
  'ff5BeniEsteroBase.test.js',
  'ivaOrdinariaEndToEndLiquidazione.test.js',
  'ivaPerCassaDocumento.test.js',
  'ivaPerCassaPagamentoUiPolicy.test.js',
  'ivaPerCassaPreviewRelease.test.js',
  'ivaPerCassaRelease.test.js',
  'ivaPerCassaSchemaMapping.test.js',
  'manualeIvaOrdinaria.test.js',
  'partitarioDocumentiIva.test.js',
  'partitarioPagamentiIncassi.test.js',
  'persistPrimaNotaDraft.test.js',
  'primaNotaMutationService.test.js',
  'ritenutePagamentoParcella.test.js',
  'ritenutePercipientiCompleto.test.js',
  'splitPaymentDocumentoAttivo.test.js',
  'vatRegisterEntriesFromCanonicalPayload.test.js',
])

async function listTestFiles(directory, { recursive = false } = {}) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = []
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name)
    if (entry.isDirectory() && recursive) {
      files.push(...await listTestFiles(fullPath, { recursive: true }))
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(fullPath)
    }
  }
  return files.sort((a, b) => a.localeCompare(b))
}

async function resolveProfile(profile) {
  const rootTests = await listTestFiles(ROOT_TEST_DIR)
  const importModuleTests = await listTestFiles(IMPORT_TEST_DIR)
  const contabilitaApplicationTests = await listTestFiles(CONTABILITA_APPLICATION_DIR, { recursive: true })

  const importRootTests = rootTests.filter((file) => IMPORT_ROOT_TESTS.has(path.basename(file)))
  const coreRootTests = rootTests.filter((file) => !IMPORT_ROOT_TESTS.has(path.basename(file)))
  const manualRootTests = rootTests.filter((file) => MANUAL_ROOT_TESTS.has(path.basename(file)))
  const consultazioneRootTests = rootTests.filter((file) => CONSULTAZIONE_ROOT_TESTS.has(path.basename(file)))
  const splitRootTests = rootTests.filter((file) => SPLIT_ROOT_TESTS.has(path.basename(file)))
  const ivaRootTests = rootTests.filter((file) => IVA_ROOT_TESTS.has(path.basename(file)))
  const consultazioneApplicationTests = contabilitaApplicationTests.filter((file) => {
    const rel = path.relative(CONTABILITA_APPLICATION_DIR, file).replaceAll('\\', '/')
    return (
      rel === 'consultazioneOperations/consultazioneOperations.test.js'
      || rel === 'primaNotaOperations/primaNotaOperations.test.js'
    )
  })
  const manualApplicationTests = contabilitaApplicationTests.filter((file) => {
    const rel = path.relative(CONTABILITA_APPLICATION_DIR, file).replaceAll('\\', '/')
    return (
      rel === 'canonicalContabilitaDraftMapper.test.js'
      || rel === 'persistPrimaNotaDraft.test.js'
      || rel === 'buildContabilitaPostPersistOutput.test.js'
      || rel === 'fiscalWorkflow.test.js'
      || rel === 'registrazioneOperations/registrazioneOperations.test.js'
      || rel === 'primaNotaOperations/primaNotaOperations.test.js'
      || rel.startsWith('cespiti/')
    )
  })

  if (profile === 'import') {
    return [...importModuleTests, ...importRootTests]
  }
  if (profile === 'manual') {
    return [...manualApplicationTests, ...manualRootTests]
  }
  if (profile === 'consultazione') {
    return [...consultazioneApplicationTests, ...consultazioneRootTests]
  }
  if (profile === 'iva') {
    return ivaRootTests
  }
  if (profile === 'split') {
    return splitRootTests
  }
  if (profile === 'core') {
    return coreRootTests
  }
  if (profile === 'all') {
    return Array.from(new Set([
      ...coreRootTests,
      ...manualApplicationTests,
      ...consultazioneApplicationTests,
      ...importModuleTests,
      ...importRootTests,
    ]))
  }

  throw new Error(`Profilo test sconosciuto "${profile}". Usa: import, manual, consultazione, iva, split, core, all.`)
}

async function main() {
  const profile = String(process.argv[2] || '').trim().toLowerCase()
  const files = await resolveProfile(profile)
  if (!files.length) throw new Error(`Nessun file test trovato per il profilo "${profile}".`)

  console.log(`[FISCOSIM_TEST] profile=${profile} files=${files.length}`)
  files.forEach((file) => console.log(`[FISCOSIM_TEST_FILE] ${path.relative(process.cwd(), file)}`))

  const child = spawn(process.execPath, ['--test', ...files], {
    cwd: process.cwd(),
    env: { ...process.env, NODE_ENV: 'test' },
    stdio: 'inherit',
    shell: false,
  })

  const exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) return reject(new Error(`Node test runner terminato dal segnale ${signal}.`))
      resolve(code ?? 1)
    })
  })
  process.exitCode = exitCode
}

main().catch((error) => {
  console.error(`[FISCOSIM_TEST_ERROR] ${error?.stack || error}`)
  process.exitCode = 1
})
