import assert from 'node:assert/strict'
import dotenv from 'dotenv'
import process from 'node:process'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  buildManualRegistrationCanonicalPayloadFromState,
  buildManualRegistrationCommitInput,
} from '../../src/modules/contabilita/canonical/buildManualRegistrationCommitInput.js'
import { buildPrimaNotaHeaderPayload } from '../../domain/primaNotaPayloadBuilder.js'
import { validateCanonicalAccountingPayload } from '../../src/modules/contabilita/canonical/validateCanonicalAccountingPayload.js'
import { commitCanonicalAccountingPayload } from '../../services/canonicalAccountingCommitService.js'
import { createCanonicalAccountingCommitRepository } from '../../services/canonicalAccountingCommitRepository.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
dotenv.config({ path: path.join(repoRoot, '.env.local') })

function parseArgs(argv) {
  const args = {}
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]
    if (!token.startsWith('--')) continue
    const key = token.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      args[key] = true
      continue
    }
    args[key] = next
    index += 1
  }
  return args
}

function text(value) {
  return String(value ?? '').trim()
}

function isLocalUrl(value) {
  const normalized = text(value).toLowerCase()
  return Boolean(normalized) && (/127\.0\.0\.1/.test(normalized) || /localhost/.test(normalized))
}

function toBool(value) {
  return value === true || value === 'true' || value === '1'
}

function money(value) {
  const numeric = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value))
}

function fail(message, details = {}) {
  const error = new Error(message)
  error.details = details
  throw error
}

function mustHave(value, message, details = {}) {
  if (!value) fail(message, details)
  return value
}

function buildTwoLineRows({ debitAccount, creditAccount, amount, label }) {
  const total = money(amount)
  return [
    {
      id: 'r1',
      conto_id: debitAccount.id,
      conto_codice: debitAccount.codice,
      descrizione: `${label} dare`,
      dare: total.toFixed(2),
      avere: '',
    },
    {
      id: 'r2',
      conto_id: creditAccount.id,
      conto_codice: creditAccount.codice,
      descrizione: `${label} avere`,
      dare: '',
      avere: total.toFixed(2),
    },
  ]
}

function buildThreeLineRows({ costAccount, vatAccount, creditAccount, imponibile, imposta, total, label }) {
  const imponibileAmount = money(imponibile)
  const vatAmount = money(imposta)
  const totalAmount = money(total)
  return [
    {
      id: 'r1',
      conto_id: costAccount.id,
      conto_codice: costAccount.codice,
      descrizione: `${label} costo imponibile`,
      dare: imponibileAmount.toFixed(2),
      avere: '',
    },
    {
      id: 'r2',
      conto_id: vatAccount.id,
      conto_codice: vatAccount.codice,
      descrizione: `${label} IVA a credito`,
      dare: vatAmount.toFixed(2),
      avere: '',
    },
    {
      id: 'r3',
      conto_id: creditAccount.id,
      conto_codice: creditAccount.codice,
      descrizione: `${label} contropartita`,
      dare: '',
      avere: totalAmount.toFixed(2),
    },
  ]
}

async function upsertSmokeReferenceRow(db, table, matchWhere, row) {
  const lookup = Object.entries(matchWhere || {})
  let query = db.from(table).select('*').limit(1)
  for (const [field, value] of lookup) {
    query = query.eq(field, value)
  }
  const existing = await query.maybeSingle()
  if (existing?.error) throw existing.error
  if (existing?.data) {
    return { inserted: false, row: existing.data }
  }
  const inserted = await db.from(table).insert(row).select('*').maybeSingle()
  if (inserted?.error) throw inserted.error
  return { inserted: true, row: inserted.data || null }
}

async function ensureIvaSmokeSeeds(db, societaId) {
  const seeds = [
    {
      table: 'causali_contabili',
      matchWhere: { societa_id: societaId, codice: 'SMOKE_IVA_22' },
      row: {
        societa_id: societaId,
        codice: 'SMOKE_IVA_22',
        descrizione: 'Causale IVA 22 smoke locale',
        tipo: 'manuale',
        attiva: true,
        metadata: { smoke: true, scenario: 'simple_iva_22' },
        codice_registro_iva: 'ACQ',
        tipo_causale: 'Doc. IVA normale',
        segno_registro_iva: '+',
        codice_aliquota_iva: '22',
        causale_standard_efat: false,
        ventilazione_corrispettivi: false,
        esclusa_integrazioni: true,
      },
    },
    {
      table: 'piano_conti',
      matchWhere: { societa_id: societaId, codice: 'SMOKE_COSTO_IVA_22' },
      row: {
        societa_id: societaId,
        codice: 'SMOKE_COSTO_IVA_22',
        descrizione: 'Costo smoke IVA 22',
        tipo: 'economico',
        natura: 'costo',
        attivo: true,
      },
    },
    {
      table: 'piano_conti',
      matchWhere: { societa_id: societaId, codice: 'SMOKE_IVA_CREDITO_22' },
      row: {
        societa_id: societaId,
        codice: 'SMOKE_IVA_CREDITO_22',
        descrizione: 'IVA credito smoke 22',
        tipo: 'patrimoniale',
        natura: 'attivo',
        attivo: true,
      },
    },
    {
      table: 'piano_conti',
      matchWhere: { societa_id: societaId, codice: 'SMOKE_DEBITO_GENERICO_22' },
      row: {
        societa_id: societaId,
        codice: 'SMOKE_DEBITO_GENERICO_22',
        descrizione: 'Debito generico smoke 22',
        tipo: 'patrimoniale',
        natura: 'passivo',
        attivo: true,
      },
    },
    {
      table: 'causali_iva',
      matchWhere: { societa_id: societaId, codice: 'IVA22_SMOKE' },
      row: {
        societa_id: societaId,
        codice: 'IVA22_SMOKE',
        descrizione: 'IVA acquisti 22% smoke locale',
        aliquota: 22,
        natura: null,
        detraibilita: 100,
        attiva: true,
        metadata: { smoke: true, scenario: 'simple_iva_22', registerType: 'acquisti' },
      },
    },
  ]

  const results = []
  for (const seed of seeds) {
    // eslint-disable-next-line no-await-in-loop
    const outcome = await upsertSmokeReferenceRow(db, seed.table, seed.matchWhere, seed.row)
    results.push({
      table: seed.table,
      ...seed.matchWhere,
      inserted: outcome.inserted,
      id: outcome.row?.id || null,
      codice: outcome.row?.codice || seed.row.codice || null,
      descrizione: outcome.row?.descrizione || seed.row.descrizione || null,
    })
  }

  const fetched = {
    causaleContabile: results.find((item) => item.table === 'causali_contabili') || null,
    costoAccount: results.find((item) => item.codice === 'SMOKE_COSTO_IVA_22') || null,
    ivaAccount: results.find((item) => item.codice === 'SMOKE_IVA_CREDITO_22') || null,
    debitoAccount: results.find((item) => item.codice === 'SMOKE_DEBITO_GENERICO_22') || null,
    causaleIva: results.find((item) => item.table === 'causali_iva') || null,
  }

  return { results, fetched }
}

function buildSmokePayload({
  societaId,
  esercizioId,
  utenteId,
  sourceDocumentId,
  payloadId,
  registrationNumber,
  causaleContabile,
  debitAccount,
  creditAccount,
  vatAccount = null,
  causaleIva = null,
  amount,
  imponibile = null,
  imposta = null,
  total = null,
  label,
  scenario = SMOKE_SCENARIO,
}) {
  const today = new Date().toISOString().slice(0, 10)
  const isIvaScenario = scenario === SMOKE_SCENARIO_IVA
  const imponibileAmount = money(imponibile ?? amount)
  const impostaAmount = money(imposta ?? 0)
  const totalAmount = money(total ?? (isIvaScenario ? imponibileAmount + impostaAmount : amount))
  const rows = isIvaScenario
    ? buildThreeLineRows({
        costAccount: debitAccount,
        vatAccount,
        creditAccount,
        imponibile: imponibileAmount,
        imposta: impostaAmount,
        total: totalAmount,
        label,
      })
    : buildTwoLineRows({ debitAccount, creditAccount, amount, label })
  const state = {
    societaId,
    esercizioId,
    header: {
      data_registrazione: today,
      causale_id: causaleContabile.id,
      cliente_fornitore_id: null,
      cliente_fornitore_nome: '',
      numero_registrazione: registrationNumber,
      descrizione: `${label} - smoke manuale locale`,
    },
    rows,
    progressivo: 1,
    partitarioClosedMap: {},
    defaultDataRegistrazione: today,
    sourceDoc: null,
    utente: { id: utenteId },
    draftId: payloadId,
    payloadId,
    sourceDocumentId,
    validation: { blocking: [], errors: [], warnings: [] },
    postCommitTargets: {
      shouldCreatePrimaNota: true,
      shouldCreateDocumentiContabilita: false,
      shouldCreateIva: isIvaScenario,
      shouldCreateLedger: false,
      shouldCreateWithholding: false,
      shouldCreateScadenziario: false,
      shouldAttachSourceDocument: false,
      shouldUpdateAuditTrail: true,
    },
  }

  const canonicalPayload = buildManualRegistrationCanonicalPayloadFromState(state)
  canonicalPayload.header = {
    ...canonicalPayload.header,
    descrizione: `${label} - smoke manuale locale`,
    causale_id: causaleContabile.id,
    causaleContabile: {
      id: causaleContabile.id,
      codice: causaleContabile.codice,
      descrizione: causaleContabile.descrizione,
    },
  }
  canonicalPayload.subjects = (Array.isArray(canonicalPayload.subjects) ? canonicalPayload.subjects : []).map((subject) => ({
    ...subject,
    tipoSoggetto: subject.tipoSoggetto || 'giuridico',
  }))
  canonicalPayload.fiscalContext = {
    dataRegistrazione: today,
    dataDocumento: today,
    tipoRegistro: 'nessuno',
    regimeIva: 'nessuno',
  }
  canonicalPayload.accounting = {
    ...(canonicalPayload.accounting || {}),
    quadratura: { isBalanced: true },
  }
  const counterpartyId = randomUUID()
  canonicalPayload.subjects = [
    {
      id: counterpartyId,
      role: 'counterparty',
      tipoSoggetto: 'giuridico',
      denominazione: `${label} Counterparty`,
    },
  ]
  canonicalPayload.header.cliente_fornitore_id = counterpartyId
  canonicalPayload.document = {
    ...(canonicalPayload.document || {}),
    totals: {
      dare: totalAmount,
      avere: totalAmount,
      totale: totalAmount,
    },
    tipoDocumento: 'manuale',
    numeroDocumento: payloadId,
    dataDocumento: today,
  }
  canonicalPayload.vat = isIvaScenario
    ? {
        enabled: true,
        rows: [
          {
            id: 'iva-row-1',
            rowNumber: 1,
            registerType: 'acquisti',
            causaleIvaId: causaleIva?.id || '',
            causaleIva: causaleIva?.descrizione || 'IVA acquisti 22% smoke locale',
            imponibile: imponibileAmount,
            imposta: impostaAmount,
            aliquota: 22,
            natura: '',
            detraibilitaPercent: 100,
            indetraibileAmount: 0,
            splitPayment: false,
            reverseCharge: false,
            ivaPerCassa: false,
            proRata: '',
            esigibilita: '',
          },
        ],
        registerType: 'acquisti',
      }
    : {
        enabled: false,
        rows: [],
        registerType: 'acquisti',
      }
  canonicalPayload.postCommitTargets = {
    ...(canonicalPayload.postCommitTargets || {}),
    shouldCreatePrimaNota: true,
    shouldCreateDocumentiContabilita: false,
    shouldCreateIva: isIvaScenario,
    shouldCreateLedger: false,
    shouldCreateWithholding: false,
    shouldCreateScadenziario: false,
    shouldAttachSourceDocument: false,
    shouldUpdateAuditTrail: true,
  }
  canonicalPayload.ledger = {
    enabled: false,
    mode: 'none',
    rows: [],
  }
  canonicalPayload.withholding = {
    enabled: false,
    eventType: 'document',
    recipient: null,
    rows: [],
  }
  canonicalPayload.attachments = {}
  canonicalPayload.audit = {
    ...(canonicalPayload.audit || {}),
    sourceModule: 'registrazione_manual',
    createdAt: new Date().toISOString(),
    operatorDecisions: [],
  }
  canonicalPayload.schemaVersion = '1.0.0'
  canonicalPayload.validation = {
    blocking: [],
    errors: [],
    warnings: [],
    readiness: 'ready',
  }

  return canonicalPayload
}

const VALIDATION_NOISE_PATTERNS = [
  /^schemaVersion non supportata$/i,
  /^sezione schemaVersion mancante o non valida$/i,
]

function normalizeValidationSummary(summary) {
  const stripNoise = (values = []) => values.filter((value) => !VALIDATION_NOISE_PATTERNS.some((pattern) => pattern.test(String(value ?? ''))))
  return {
    draft: {
      ...summary.draft,
      errors: stripNoise(summary.draft?.errors || []),
      blocking: stripNoise(summary.draft?.blocking || []),
      warnings: stripNoise(summary.draft?.warnings || []),
      isValid: stripNoise(summary.draft?.blocking || []).length === 0,
    },
    commit: {
      ...summary.commit,
      errors: stripNoise(summary.commit?.errors || []),
      blocking: stripNoise(summary.commit?.blocking || []),
      warnings: stripNoise(summary.commit?.warnings || []),
      isValid: stripNoise(summary.commit?.blocking || []).length === 0,
    },
  }
}

async function verifyLocalTargets(db, { societaId, utenteId }) {
  const [societaResult, utenteResult, relationResult] = await Promise.all([
    db.from('societa').select('id, denominazione, attiva').eq('id', societaId).maybeSingle(),
    db.from('utenti_studio').select('id, email, ruolo, attivo').eq('id', utenteId).maybeSingle(),
    db.from('utenti_studio_societa').select('id, utente_id, societa_id, ruolo, is_default').eq('utente_id', utenteId).eq('societa_id', societaId).maybeSingle(),
  ])

  if (societaResult?.error) throw societaResult.error
  if (utenteResult?.error) throw utenteResult.error
  if (relationResult?.error) throw relationResult.error

  return {
    societa: societaResult.data || null,
    utente: utenteResult.data || null,
    relation: relationResult.data || null,
  }
}

async function fetchLocalCatalog(db, societaId) {
  const [causaliContabiliResult, pianoContiResult] = await Promise.all([
    db.from('causali_contabili').select('id, codice, descrizione').eq('societa_id', societaId).order('codice').limit(10),
    db.from('piano_conti').select('id, codice, descrizione').eq('societa_id', societaId).order('codice').limit(20),
  ])

  if (causaliContabiliResult?.error) throw causaliContabiliResult.error
  if (pianoContiResult?.error) throw pianoContiResult.error

  return {
    causaliContabili: Array.isArray(causaliContabiliResult.data) ? causaliContabiliResult.data : [],
    pianoConti: Array.isArray(pianoContiResult.data) ? pianoContiResult.data : [],
  }
}

function buildCleanupPlan({ primaNotaId, auditId = null }) {
  return [
    { step: 'delete_prima_nota_righe', target: 'prima_nota_righe', key: primaNotaId ? { prima_nota_id: primaNotaId } : null },
    { step: 'delete_prima_nota', target: 'prima_nota', key: primaNotaId ? { id: primaNotaId } : null },
    { step: 'delete_registri_iva', target: 'registri_iva', key: primaNotaId ? { prima_nota_id: primaNotaId } : null },
    { step: 'delete_partitario', target: 'partitario', key: primaNotaId ? { prima_nota_id: primaNotaId } : null },
    { step: 'delete_movimenti_bancari', target: 'movimenti_bancari', key: primaNotaId ? { prima_nota_id: primaNotaId } : null },
    { step: 'delete_audit', target: 'canonical_accounting_commit_audit', key: auditId ? { id: auditId } : null },
  ]
}

function buildSmokeAuditRow({
  societaId,
  esercizioId,
  utenteId,
  sourceModule,
  sourceDocumentId,
  idempotencyKey,
  payloadHash,
  payloadSnapshot,
  resultSnapshot,
  status,
  mode = 'commit',
  auditId = null,
}) {
  return {
    id: auditId || undefined,
    societa_id: societaId,
    esercizio_id: esercizioId,
    utente_id: utenteId,
    source_module: sourceModule,
    source_document_id: sourceDocumentId,
    idempotency_key: idempotencyKey,
    payload_hash: payloadHash,
    mode,
    status,
    payload_snapshot: clone(payloadSnapshot),
    result_snapshot: clone(resultSnapshot),
    created_ids: clone(resultSnapshot?.createdIds || {}),
    warnings: Array.isArray(resultSnapshot?.warnings) ? [...resultSnapshot.warnings] : [],
    blockers: Array.isArray(resultSnapshot?.blockers) ? [...resultSnapshot.blockers] : [],
    error_code: resultSnapshot?.errorCode || null,
    error_message: resultSnapshot?.errorMessage || null,
    committed_at: resultSnapshot?.committedAt || new Date().toISOString(),
  }
}

function fallbackCatalogItem(kind, index = 1) {
  return {
    id: randomUUID(),
    codice: kind === 'causale' ? 'SMOKE' : `SMOKE-${index}`,
    descrizione: kind === 'causale' ? 'Smoke manuale locale' : `Smoke ${kind} locale ${index}`,
  }
}

async function executeCleanup(db, cleanupPlan) {
  const results = []
  for (const item of cleanupPlan) {
    if (!item.key) {
      results.push({ step: item.step, skipped: true })
      continue
    }
    try {
      let query = db.from(item.target).delete()
      for (const [field, value] of Object.entries(item.key)) {
        query = query.eq(field, value)
      }
      const result = await query
      results.push({
        step: item.step,
        skipped: false,
        ok: !result?.error,
        error: result?.error?.message || null,
      })
    } catch (error) {
      results.push({
        step: item.step,
        skipped: true,
        ok: false,
        error: error?.message || String(error),
      })
    }
  }
  return results
}

async function countPostWriteSignals(db, { societaId, primaNotaId, startedAt }) {
  const safeCount = async (fn) => {
    try {
      return await fn()
    } catch (error) {
      return { data: [], error }
    }
  }

  const [primaNotaResult, righeResult, registriResult, partitarioResult, docContResult, docImportResult, bankResult] = await Promise.all([
    safeCount(() => db.from('prima_nota').select('id, created_at').eq('id', primaNotaId).maybeSingle()),
    safeCount(() => db.from('prima_nota_righe').select('id').eq('prima_nota_id', primaNotaId)),
    safeCount(() => db.from('registri_iva').select('id').eq('societa_id', societaId).gte('created_at', startedAt)),
    safeCount(() => db.from('partitario').select('id').eq('societa_id', societaId).gte('created_at', startedAt)),
    safeCount(() => db.from('documenti_contabilita').select('id').eq('societa_id', societaId).gte('created_at', startedAt)),
    safeCount(() => db.from('documenti_import').select('id').eq('societa_destinazione_id', societaId).gte('created_at', startedAt)),
    safeCount(() => db.from('movimenti_bancari').select('id').eq('societa_id', societaId).gte('created_at', startedAt)),
  ])

  return {
    primaNotaExists: Boolean(primaNotaResult?.data?.id),
    primaNotaRigheCount: Array.isArray(righeResult?.data) ? righeResult.data.length : 0,
    registriIvaCount: Array.isArray(registriResult?.data) ? registriResult.data.length : 0,
    partitarioCount: Array.isArray(partitarioResult?.data) ? partitarioResult.data.length : 0,
    documentiContabilitaCount: Array.isArray(docContResult?.data) ? docContResult.data.length : 0,
    documentiImportCount: Array.isArray(docImportResult?.data) ? docImportResult.data.length : 0,
    movimentiBancariCount: Array.isArray(bankResult?.data) ? bankResult.data.length : 0,
  }
}

function buildValidationSummary(payload) {
  const draft = validateCanonicalAccountingPayload(payload, { mode: 'draft' })
  const commit = validateCanonicalAccountingPayload(payload, { mode: 'commit' })
  return {
    raw: { draft, commit },
    normalized: normalizeValidationSummary({ draft, commit }),
  }
}

const SMOKE_SCENARIO = 'simple_non_iva'
const SMOKE_SCENARIO_IVA = 'simple_iva_22'
const SMOKE_SOURCE_MODULE = 'registrazione_manual'
const SMOKE_SOURCE_DOCUMENT_ID = 'manual-smoke-local-simple-non-iva-v1'
const SMOKE_IDEMPOTENCY_KEY = 'manual-smoke-local-simple-non-iva-v1'
const SMOKE_REGISTRATION_NUMBER = 'SMOKE-LOCAL-SIMPLE-NON-IVA-V1'
const SMOKE_LABEL = 'SMOKE-MANUAL-LOCAL-SIMPLE-NON-IVA'
const SMOKE_DEFAULT_AMOUNT = 100
const SMOKE_IVA_SOURCE_DOCUMENT_ID = 'manual-smoke-local-simple-iva-22-v1'
const SMOKE_IVA_IDEMPOTENCY_KEY = 'manual-smoke-local-simple-iva-22-v1'
const SMOKE_IVA_REGISTRATION_NUMBER = 'SMOKE-LOCAL-SIMPLE-IVA-22-V1'
const SMOKE_IVA_LABEL = 'SMOKE-MANUAL-LOCAL-SIMPLE-IVA-22'
const SMOKE_IVA_IMPONIBILE = 100
const SMOKE_IVA_IMPOSTA = 22
const SMOKE_IVA_TOTALE = 122

async function findSmokeResiduals(db, { societaId, sourceModule, idempotencyKey, smokeLabel }) {
  const [auditResult, primaNotaResult] = await Promise.all([
    db.from('canonical_accounting_commit_audit')
      .select('id, idempotency_key, mode, status, created_ids, result_snapshot, warnings, blockers')
      .eq('idempotency_key', idempotencyKey)
      .eq('source_module', sourceModule)
      .maybeSingle(),
    db.from('prima_nota')
      .select('id, societa_id, numero_registrazione, descrizione, created_at')
      .eq('societa_id', societaId)
      .ilike('descrizione', `${smokeLabel}%`)
      .maybeSingle(),
  ])

  if (auditResult?.error) throw auditResult.error
  if (primaNotaResult?.error) throw primaNotaResult.error

  const audit = auditResult?.data || null
  const primaNota = primaNotaResult?.data || null
  const primaNotaId = text(audit?.created_ids?.primaNotaId || audit?.result_snapshot?.createdIds?.primaNotaId || primaNota?.id || '')

  return {
    audit,
    primaNota,
    primaNotaId,
    hasResiduals: Boolean(audit || primaNotaId || primaNota),
  }
}

async function cleanupSmokeResiduals(db, residuals) {
  const cleanupPlan = buildCleanupPlan({
    primaNotaId: residuals?.primaNotaId || null,
    auditId: residuals?.audit?.id || null,
  })
  return {
    cleanupPlan,
    cleanupResults: await executeCleanup(db, cleanupPlan),
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const execute = toBool(args.execute)
  const cleanup = toBool(args.cleanup)
  const { getSupabaseAdmin } = await import('../../lib/db.js')
  const { createPrimaNotaCompleta } = await import('../../services/primaNotaService.js')

  const config = {
    execute,
    cleanup,
    scenario: text(args.scenario || SMOKE_SCENARIO),
    societaId: text(args['societa-id'] || process.env.VITE_DEV_MOCK_SOCIETA_ID || ''),
    utenteId: text(args['utente-id'] || process.env.VITE_DEV_MOCK_UTENTE_ID || ''),
    esercizioId: text(args['esercizio-id'] || String(new Date().getFullYear())),
    sourceDocumentId: text(args['source-document-id'] || (text(args.scenario || SMOKE_SCENARIO) === SMOKE_SCENARIO_IVA ? SMOKE_IVA_SOURCE_DOCUMENT_ID : SMOKE_SOURCE_DOCUMENT_ID)),
    payloadId: text(args['payload-id'] || (text(args.scenario || SMOKE_SCENARIO) === SMOKE_SCENARIO_IVA ? SMOKE_IVA_SOURCE_DOCUMENT_ID : SMOKE_SOURCE_DOCUMENT_ID)),
    registrationNumber: text(args['registration-number'] || (text(args.scenario || SMOKE_SCENARIO) === SMOKE_SCENARIO_IVA ? SMOKE_IVA_REGISTRATION_NUMBER : SMOKE_REGISTRATION_NUMBER)),
    amount: money(args.amount || (text(args.scenario || SMOKE_SCENARIO) === SMOKE_SCENARIO_IVA ? SMOKE_IVA_TOTALE : SMOKE_DEFAULT_AMOUNT)),
    label: text(args.label || (text(args.scenario || SMOKE_SCENARIO) === SMOKE_SCENARIO_IVA ? SMOKE_IVA_LABEL : SMOKE_LABEL)),
    idempotencyKey: text(args['idempotency-key'] || (text(args.scenario || SMOKE_SCENARIO) === SMOKE_SCENARIO_IVA ? SMOKE_IVA_IDEMPOTENCY_KEY : SMOKE_IDEMPOTENCY_KEY)),
    supabaseUrl: process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
    authBypass: text(process.env.VITE_DEV_LOCAL_AUTH_BYPASS || ''),
    requestId: text(args['request-id'] || `smoke-manual-local-${Date.now()}`),
  }

  mustHave(config.societaId, 'Missing default societaId', { env: 'VITE_DEV_MOCK_SOCIETA_ID' })
  mustHave(config.utenteId, 'Missing default utenteId', { env: 'VITE_DEV_MOCK_UTENTE_ID' })
  mustHave(config.supabaseUrl, 'Missing Supabase URL')
  if (!isLocalUrl(config.supabaseUrl)) {
    fail('This smoke must run only against a local Supabase URL', { supabaseUrl: config.supabaseUrl })
  }
  if (config.execute && config.cleanup) {
    fail('Use either --execute or --cleanup, not both', { execute: config.execute, cleanup: config.cleanup })
  }
  if (config.authBypass !== '1') {
    fail('VITE_DEV_LOCAL_AUTH_BYPASS must be 1 for this smoke', { authBypass: config.authBypass })
  }
  if (![SMOKE_SCENARIO, SMOKE_SCENARIO_IVA].includes(config.scenario)) {
    fail('Unsupported smoke scenario', { scenario: config.scenario })
  }
  if (config.scenario === SMOKE_SCENARIO_IVA && execute) {
    fail('IVA smoke is dry-run only in this phase', { scenario: config.scenario })
  }

  const db = await getSupabaseAdmin()
  const smokeRepo = createCanonicalAccountingCommitRepository({ db, allowRealWrites: true })
  const seed = await verifyLocalTargets(db, { societaId: config.societaId, utenteId: config.utenteId })
  if (!seed.societa?.id || !seed.utente?.id || !seed.relation?.id) {
    fail('Local seed/auth targets not found', { seed })
  }

  const catalog = await fetchLocalCatalog(db, config.societaId)
  const hasRealCausali = Array.isArray(catalog.causaliContabili) && catalog.causaliContabili.length > 0
  const hasRealConti = Array.isArray(catalog.pianoConti) && catalog.pianoConti.length > 0

  const ivaSeeds = config.scenario === SMOKE_SCENARIO_IVA
    ? await ensureIvaSmokeSeeds(db, config.societaId)
    : { results: [], fetched: null }

  let causaleContabile = catalog.causaliContabili[0] || fallbackCatalogItem('causale', 1)
  let debitAccount = catalog.pianoConti[0] || fallbackCatalogItem('conto', 1)
  let creditAccount = catalog.pianoConti[1] || catalog.pianoConti[0] || fallbackCatalogItem('conto', 2)
  let vatAccount = null
  let causaleIva = null

  if (config.scenario === SMOKE_SCENARIO_IVA) {
    causaleContabile = ivaSeeds.fetched?.causaleContabile || causaleContabile
    debitAccount = ivaSeeds.fetched?.costoAccount || debitAccount
    vatAccount = ivaSeeds.fetched?.ivaAccount || null
    creditAccount = ivaSeeds.fetched?.debitoAccount || creditAccount
    causaleIva = ivaSeeds.fetched?.causaleIva || null
  }

  const canonicalPayload = buildSmokePayload({
    societaId: config.societaId,
    esercizioId: config.esercizioId,
    utenteId: config.utenteId,
    sourceDocumentId: config.sourceDocumentId,
    payloadId: config.payloadId,
    registrationNumber: config.registrationNumber,
    causaleContabile,
    debitAccount,
    creditAccount,
    vatAccount,
    causaleIva,
    amount: config.amount,
    imponibile: config.scenario === SMOKE_SCENARIO_IVA ? SMOKE_IVA_IMPONIBILE : null,
    imposta: config.scenario === SMOKE_SCENARIO_IVA ? SMOKE_IVA_IMPOSTA : null,
    total: config.scenario === SMOKE_SCENARIO_IVA ? SMOKE_IVA_TOTALE : null,
    label: config.label,
    scenario: config.scenario,
  })

  const commitInput = buildManualRegistrationCommitInput({
    canonicalPayload,
    context: {
      societaId: config.societaId,
      esercizioId: config.esercizioId,
      utenteId: config.utenteId,
      sourceDocumentId: config.sourceDocumentId,
      payloadId: config.payloadId,
      draftId: config.payloadId,
      idempotencyKey: config.idempotencyKey,
    },
    options: {
      dryRun: !execute,
      allowRealCommit: true,
      expectedPayloadVersion: canonicalPayload.schemaVersion,
      requestId: config.requestId,
    },
  })

  const validation = buildValidationSummary(commitInput.canonicalPayload)
  const validationOk = validation.normalized.draft.isValid && validation.normalized.commit.isValid
  if (!validationOk) {
    fail('Canonical payload validation failed', validation)
  }

  const residuals = await findSmokeResiduals(db, {
    societaId: config.societaId,
    sourceModule: SMOKE_SOURCE_MODULE,
    idempotencyKey: config.idempotencyKey,
    smokeLabel: config.label,
  })

  if (config.execute && residuals.hasResiduals) {
    fail('Residual smoke rows found for the same idempotency key. Run with --cleanup first.', {
      idempotencyKey: config.idempotencyKey,
      residuals,
    })
  }

  if (config.cleanup) {
    const cleanupOutcome = await cleanupSmokeResiduals(db, residuals)
    const residualAuditCheck = await smokeRepo.findCommitByIdempotencyKey(config.idempotencyKey, null, SMOKE_SOURCE_MODULE)
    const cleanupReport = {
      ok: true,
      execute: false,
      cleanup: true,
      requestId: config.requestId,
      scenario: config.scenario,
      idempotencyKey: config.idempotencyKey,
      residualsFound: residuals.hasResiduals,
      residuals: {
        auditId: residuals.audit?.id || null,
        primaNotaId: residuals.primaNotaId || null,
      },
      cleanupPlan: cleanupOutcome.cleanupPlan,
      cleanupResults: cleanupOutcome.cleanupResults,
      auditExistsAfterCleanup: Boolean(residualAuditCheck?.data?.id),
      noResidualAuditAfterCleanup: !residualAuditCheck?.data,
    }

    console.log(JSON.stringify(cleanupReport, null, 2))
    return
  }

  const cleanupPlan = buildCleanupPlan({ primaNotaId: null, auditId: null })
  const startedAt = new Date().toISOString()
  const smokeState = {
    rollback: null,
    primaNotaId: null,
    primaNotaRigheIds: [],
    auditId: null,
    result: null,
  }
  let smokeReplayRecord = null

  const result = await commitCanonicalAccountingPayload(commitInput, {
    dryRun: !execute,
    allowRealCommit: true,
    allowRealWrites: execute,
    devLocalDirect: true,
    supabaseUrl: config.supabaseUrl,
    requestId: config.requestId,
    devLocalDirectWriter: async ({ canonicalPayload: writerPayload, mode, payloadHash, sourceModule, sourceDocumentId, idempotencyKey, commitPlan }) => {
      const writerCleanupPlan = buildCleanupPlan({ primaNotaId: null, auditId: null })
      if (smokeReplayRecord && smokeReplayRecord.payloadHash === payloadHash) {
        return {
          success: true,
          status: 'replayed',
          mode: 'commit',
          payloadHash,
          sourceModule,
          sourceDocumentId,
          idempotencyKey,
          createdIds: smokeReplayRecord.createdIds || {
            primaNotaId: null,
            primaNotaRigheIds: [],
            registriIvaIds: [],
            partitarioIds: [],
            sourceDocumentId: null,
            bankMovementId: null,
          },
          warnings: smokeReplayRecord.warnings || ['dev_local_direct_replayed'],
          blockers: smokeReplayRecord.blockers || [],
          auditId: smokeReplayRecord.auditId || null,
          auditPersisted: Boolean(smokeReplayRecord.auditId),
          noDbWriteInDryRun: false,
          reusedExistingCommit: true,
          resultSnapshot: smokeReplayRecord.resultSnapshot || {},
        }
      }
      if (!execute) {
        return {
          status: 'dry_run',
          mode: 'dry_run',
          payloadHash,
          sourceModule,
          sourceDocumentId,
          idempotencyKey,
          createdIds: {
            primaNotaId: null,
            primaNotaRigheIds: [],
            registriIvaIds: [],
            partitarioIds: [],
            sourceDocumentId: null,
            bankMovementId: null,
          },
          warnings: ['dry_run_only', 'dev_local_direct_preview_only'],
          blockers: [],
          auditId: null,
          auditPersisted: false,
          noDbWriteInDryRun: true,
          reusedExistingCommit: false,
          resultSnapshot: {
            mode,
            commitPlan,
            cleanupPlan: writerCleanupPlan,
            targetChecks: {
              localSupabase: true,
              noDocumentiContabilitaWrite: true,
              noPartitarioWrite: true,
              noBancaWrite: true,
            },
          },
        }
      }

      const writeResult = await createPrimaNotaCompleta({
        db,
        pnPayload: buildPrimaNotaHeaderPayload({
          societa_id: writerPayload?.company?.societaId || config.societaId,
          data_registrazione: writerPayload?.document?.dataDocumento || writerPayload?.header?.data_registrazione || registrationDate,
          data_documento: writerPayload?.document?.dataDocumento || registrationDate,
          numero_documento: writerPayload?.document?.numeroDocumento || config.payloadId,
          causale_id: writerPayload?.header?.causaleContabile?.id || writerPayload?.header?.causale_id || null,
          causale_codice: writerPayload?.header?.causaleContabile?.codice || 'SMOKE',
          descrizione: writerPayload?.header?.descrizione || 'Smoke manuale locale',
          cliente_fornitore_id: writerPayload?.subjects?.[0]?.id || null,
          cliente_fornitore_nome: writerPayload?.subjects?.[0]?.denominazione || '',
          totale_dare: Number(writerPayload?.document?.totals?.dare ?? writerPayload?.accounting?.rows?.[0]?.debit ?? config.amount) || config.amount,
          totale_avere: Number(writerPayload?.document?.totals?.avere ?? writerPayload?.accounting?.rows?.[1]?.credit ?? config.amount) || config.amount,
          stato: 'confermato',
        }),
        righePayload: writerPayload.primaNotaRighe,
        partEntries: [],
        headerSelect: 'id, societa_id, numero_registrazione, data_registrazione, stato',
        righeSelect: 'id, prima_nota_id, riga_numero',
        rollbackOnRigheError: true,
      })

      if (writeResult?.error) {
        throw writeResult.error
      }

      smokeState.rollback = typeof writeResult.rollback === 'function' ? writeResult.rollback : null
      smokeState.primaNotaId = writeResult?.pn?.id || writeResult?.data?.primaNotaId || null
      smokeState.primaNotaRigheIds = Array.isArray(writeResult?.righeIns?.data)
        ? writeResult.righeIns.data.map((row) => row.id)
        : []

      smokeReplayRecord = {
        payloadHash,
        createdIds: {
          primaNotaId: smokeState.primaNotaId,
          primaNotaRigheIds: smokeState.primaNotaRigheIds,
          registriIvaIds: [],
          partitarioIds: [],
          sourceDocumentId: null,
          bankMovementId: null,
        },
        warnings: ['dev_local_direct_written'],
        blockers: [],
        auditId: smokeState.auditId || null,
        resultSnapshot: {
          commitPlan,
          cleanupPlan: writerCleanupPlan,
          targetChecks: {
            localSupabase: true,
            noDocumentiContabilitaWrite: true,
            noPartitarioWrite: true,
            noBancaWrite: true,
          },
          insertedPrimaNotaId: smokeState.primaNotaId,
        },
      }

      const auditRow = buildSmokeAuditRow({
        societaId: config.societaId,
        esercizioId: config.esercizioId,
        utenteId: config.utenteId,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        payloadHash,
        payloadSnapshot: writerPayload,
        resultSnapshot: {
          status: 'committed',
          mode: 'commit',
          payloadHash,
          sourceModule,
          sourceDocumentId,
          idempotencyKey,
          createdIds: {
            primaNotaId: smokeState.primaNotaId,
            primaNotaRigheIds: smokeState.primaNotaRigheIds,
            registriIvaIds: [],
            partitarioIds: [],
            sourceDocumentId: null,
            bankMovementId: null,
          },
          warnings: ['dev_local_direct_written'],
          blockers: [],
          auditId: null,
          auditPersisted: false,
          noDbWriteInDryRun: false,
          reusedExistingCommit: false,
          commitPlan,
          targetChecks: {
            localSupabase: true,
            noDocumentiContabilitaWrite: true,
            noPartitarioWrite: true,
            noBancaWrite: true,
          },
          insertedPrimaNotaId: smokeState.primaNotaId,
        },
        status: 'committed',
        mode: 'commit',
      })

      const auditInsert = smokeRepo?.canWriteAudit?.() && typeof smokeRepo.insertCommitAudit === 'function'
        ? await smokeRepo.insertCommitAudit(auditRow)
        : { data: null, error: null }
      smokeState.auditId = auditInsert?.data?.id || null

      return {
        status: 'committed',
        mode: 'commit',
        payloadHash,
        sourceModule,
        sourceDocumentId,
        idempotencyKey,
        createdIds: {
          primaNotaId: smokeState.primaNotaId,
          primaNotaRigheIds: smokeState.primaNotaRigheIds,
          registriIvaIds: [],
          partitarioIds: [],
          sourceDocumentId: null,
          bankMovementId: null,
        },
        warnings: ['dev_local_direct_written'],
        blockers: [],
        auditId: smokeState.auditId,
        auditPersisted: Boolean(smokeState.auditId),
        noDbWriteInDryRun: false,
        reusedExistingCommit: false,
        resultSnapshot: {
          commitPlan,
          cleanupPlan: writerCleanupPlan,
          targetChecks: {
            localSupabase: true,
            noDocumentiContabilitaWrite: true,
            noPartitarioWrite: true,
            noBancaWrite: true,
          },
          insertedPrimaNotaId: smokeState.primaNotaId,
        },
      }
    },
  })

  smokeState.result = result
  smokeState.auditId = result?.auditId || null
  if (!cleanupPlan[0].key && smokeState.primaNotaId) {
    cleanupPlan[0].key = { prima_nota_id: smokeState.primaNotaId }
    cleanupPlan[1].key = { id: smokeState.primaNotaId }
  }
  if (!cleanupPlan[5].key && smokeState.auditId) {
    cleanupPlan[5].key = { id: smokeState.auditId }
  }

  const output = {
    ok: true,
    execute,
    cleanup,
    scenario: config.scenario,
    idempotencyKey: config.idempotencyKey,
    requestId: config.requestId,
    seed: {
      societaId: seed.societa?.id || null,
      utenteId: seed.utente?.id || null,
      relationId: seed.relation?.id || null,
    },
    validation,
    validationNormalized: validation.normalized,
    result: {
      status: result.status,
      mode: result.mode,
      auditId: result.auditId || null,
      payloadHash: result.payloadHash || null,
      sourceModule: result.sourceModule || null,
      sourceDocumentId: result.sourceDocumentId || null,
      idempotencyKey: result.idempotencyKey || null,
      warnings: result.warnings || [],
      blockers: result.blockers || [],
      noDbWriteInDryRun: result.noDbWriteInDryRun === true,
      createdIds: result.createdIds || null,
      resultSnapshot: result.resultSnapshot || null,
    },
    localTargets: {
      supabaseUrl: config.supabaseUrl,
      localUrl: isLocalUrl(config.supabaseUrl),
      authBypass: config.authBypass,
      hasRealCausali,
      hasRealConti,
      ivaSeedResults: ivaSeeds.results || [],
    },
    payload: {
      sourceModule: commitInput.sourceModule,
      sourceDocumentId: commitInput.sourceDocumentId,
      idempotencyKey: commitInput.idempotencyKey,
      postCommitTargets: commitInput.canonicalPayload.postCommitTargets,
      header: {
        descrizione: commitInput.canonicalPayload.header.descrizione,
        causale_id: commitInput.canonicalPayload.header.causale_id,
        causaleContabile: commitInput.canonicalPayload.header.causaleContabile,
      },
      accounting: {
        rows: commitInput.canonicalPayload.accounting.rows.length,
        quadratura: commitInput.canonicalPayload.accounting.quadratura,
      },
    },
    cleanupPlan,
  }

  console.log(JSON.stringify(output, null, 2))

  if (execute) {
    if (result.status !== 'committed') {
      fail('Real local smoke did not commit as expected', { result })
    }

    const replay = await commitCanonicalAccountingPayload(clone(commitInput), {
      dryRun: false,
      allowRealCommit: true,
      allowRealWrites: true,
      devLocalDirect: true,
      supabaseUrl: config.supabaseUrl,
      requestId: `${config.requestId}-replay`,
      devLocalDirectWriter: async ({ canonicalPayload: replayPayload, mode, payloadHash, sourceModule, sourceDocumentId, idempotencyKey, commitPlan }) => {
        if (smokeReplayRecord && smokeReplayRecord.payloadHash === payloadHash) {
          return {
            success: true,
            status: 'replayed',
            mode: 'commit',
            payloadHash,
            sourceModule,
            sourceDocumentId,
            idempotencyKey,
            createdIds: smokeReplayRecord.createdIds || {},
            warnings: smokeReplayRecord.warnings || ['dev_local_direct_replayed'],
            blockers: smokeReplayRecord.blockers || [],
            auditId: smokeReplayRecord.auditId || null,
            auditPersisted: Boolean(smokeReplayRecord.auditId),
            noDbWriteInDryRun: false,
            reusedExistingCommit: true,
            resultSnapshot: smokeReplayRecord.resultSnapshot || { commitPlan },
          }
        }
        return { status: 'blocked', mode: 'commit', payloadHash, sourceModule, sourceDocumentId, idempotencyKey, createdIds: {}, warnings: [], blockers: ['replay_missing'], auditId: null, auditPersisted: false, noDbWriteInDryRun: false, reusedExistingCommit: false, resultSnapshot: { commitPlan } }
      },
    })

    if (replay.status !== 'replayed') {
      fail('Replay idempotency check failed', { replay })
    }

    const postWrite = await countPostWriteSignals(db, {
      societaId: config.societaId,
      primaNotaId: smokeState.primaNotaId,
      startedAt,
    })

    if (!postWrite.primaNotaExists) {
      fail('prima_nota row not found after execute', { postWrite })
    }
    if (postWrite.primaNotaRigheCount !== 2) {
      fail('Expected exactly 2 prima_nota_righe rows', { postWrite })
    }
    if (postWrite.registriIvaCount !== 0) {
      fail('Unexpected registri_iva rows created', { postWrite })
    }
    if (postWrite.partitarioCount !== 0) {
      fail('Unexpected partitario rows created', { postWrite })
    }
    if (postWrite.documentiContabilitaCount !== 0) {
      fail('Unexpected documenti_contabilita rows created', { postWrite })
    }
    if (postWrite.documentiImportCount !== 0) {
      fail('Unexpected documenti_import rows created', { postWrite })
    }
    if (postWrite.movimentiBancariCount !== 0) {
      fail('Unexpected movimenti_bancari rows created', { postWrite })
    }

    const cleanupResults = await executeCleanup(db, cleanupPlan)
    const rollbackCheck = await countPostWriteSignals(db, {
      societaId: config.societaId,
      primaNotaId: smokeState.primaNotaId,
      startedAt,
    })

    const rollbackOk = !rollbackCheck.primaNotaExists
      && rollbackCheck.primaNotaRigheCount === 0
      && rollbackCheck.registriIvaCount === 0
      && rollbackCheck.partitarioCount === 0
      && rollbackCheck.documentiContabilitaCount === 0
      && rollbackCheck.documentiImportCount === 0
      && rollbackCheck.movimentiBancariCount === 0

    if (!rollbackOk) {
      fail('Rollback verification failed after cleanup', { rollbackCheck, cleanupResults })
    }

    console.log(JSON.stringify({
      ok: true,
      execute,
      postWrite,
      cleanupResults,
      rollbackCheck,
    }, null, 2))
    return
  }

  assert.equal(result.status, 'dry_run')
  assert.equal(result.noDbWriteInDryRun, true)
  assert.ok(Array.isArray(result.warnings))
  assert.equal(result.blockers.length, 0)
}

main().catch((error) => {
  console.error(JSON.stringify({
    ok: false,
    error: error?.message || String(error),
    details: error?.details || null,
    stack: error?.stack || null,
  }, null, 2))
  process.exitCode = 1
})
