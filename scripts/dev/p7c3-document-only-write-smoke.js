import { getSupabaseAdmin } from '../../lib/db.js'
import { buildImportContabilitaCommitPayload } from '../../src/modules/import_contabilita/domain/buildImportContabilitaCommitPayload.js'
import { planSingleInvoiceCommitFromImport } from '../../services/accountingCommitService.js'
import { persistAccountingPlan } from '../../services/accountingPersistenceAdapter.js'
import { previewNextRegistrationNumber } from '../../services/accountingPreflightService.js'
import { buildRegistrationNumberRequest } from '../../domain/registrationNumberPolicy.js'

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

function hasValue(value) {
  if (value == null) return false
  if (typeof value === 'string') return value.trim().length > 0
  return true
}

function normalizeText(value) {
  return String(value || '').trim()
}

function pickFirstText(...values) {
  for (const value of values) {
    const normalized = normalizeText(value)
    if (normalized) return normalized
  }
  return ''
}

function extractPassiveCounterparty(parsedDocument) {
  const parsed = parsedDocument && typeof parsedDocument === 'object' ? parsedDocument : {}
  return {
    name: pickFirstText(
      parsed?.fornitore?.denominazione,
      parsed?.cedente_denom,
      parsed?.denominazioneFornitore,
      parsed?.supplierName,
      parsed?.soggettoDenominazione
    ),
    vatNumber: pickFirstText(
      parsed?.fornitore?.partitaIva,
      parsed?.cedente_piva,
      parsed?.partitaIva,
      parsed?.pivaFornitore,
      parsed?.supplierVat
    ),
    taxCode: pickFirstText(
      parsed?.fornitore?.codiceFiscale,
      parsed?.cedente_cf,
      parsed?.codiceFiscale,
      parsed?.cfFornitore,
      parsed?.supplierTaxCode
    ),
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/dev/p7c3-document-only-write-smoke.js \
    --societa-id <uuid> \
    --operator-id <uuid> \
    --counterparty-account-id <uuid> \
    --cost-revenue-account-id <uuid> \
    --causale-contabile-id <uuid> \
    --registration-date <YYYY-MM-DD> \
    [--candidate-name "HAPPY CASA STORE S.R.L."] \
    [--candidate-number "184 00582"] \
    [--source-row-id <uuid>] \
    [--causale-iva-id <uuid>] \
    [--confirm-document-only-write]

Without --confirm-document-only-write the script only performs candidate lookup, duplicate SELECTs, payload generation, plan generation, and execute:true preflight guard.
`)
}

async function loadActiveSocietaName(db, societaId) {
  const result = await db.from('societa').select('id,denominazione').eq('id', societaId).maybeSingle()
  if (result?.error) throw result.error
  return result?.data || null
}

async function loadCandidateImportRow(db, societaId, candidateName, candidateNumber) {
  const result = await db
    .from('documenti_import')
    .select('id,filename,stato,created_at,updated_at,societa_destinazione_id,ai_raw_response')
    .eq('societa_destinazione_id', societaId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  const normalizedName = candidateName.toLowerCase()
  const normalizedNumber = candidateNumber.toLowerCase()

  return rows.filter((row) => {
    const parsed = row?.ai_raw_response || {}
    const supplierName = normalizeText(parsed?.fornitore?.denominazione || parsed?.cliente?.denominazione).toLowerCase()
    const docNumber = normalizeText(parsed?.numeroDocumento || parsed?.numero_documento).toLowerCase()
    return supplierName === normalizedName && docNumber === normalizedNumber
  })
}

async function loadCandidateImportRowById(db, societaId, sourceRowId) {
  const result = await db
    .from('documenti_import')
    .select('id,filename,stato,created_at,updated_at,societa_destinazione_id,ai_raw_response')
    .eq('societa_destinazione_id', societaId)
    .eq('id', sourceRowId)
    .maybeSingle()

  if (result?.error) throw result.error
  return result?.data || null
}

async function loadPianoContoById(db, contoId, societaId) {
  const result = await db
    .from('piano_conti')
    .select('id,codice,descrizione,causale_iva_id,societa_id')
    .eq('id', contoId)
    .eq('societa_id', societaId)
    .maybeSingle()
  if (result?.error) throw result.error
  return result?.data || null
}

async function loadCausaleContabileById(db, causaleId, societaId) {
  const result = await db
    .from('causali_contabili')
    .select('id,codice,descrizione,societa_id')
    .eq('id', causaleId)
    .eq('societa_id', societaId)
    .maybeSingle()
  if (result?.error) throw result.error
  return result?.data || null
}

async function loadDocumentDuplicates(db, societaId, parsedDocument) {
  const counterparty = extractPassiveCounterparty(parsedDocument)
  const supplierName = counterparty.name
  const vatNumber = counterparty.vatNumber
  const taxCode = counterparty.taxCode
  const numeroDocumento = normalizeText(parsedDocument?.numeroDocumento || parsedDocument?.numero_documento)
  const dataDocumento = normalizeText(parsedDocument?.dataDocumento || parsedDocument?.data_documento)
  const totale = Number(parsedDocument?.totale || 0) || 0

  const result = await db
    .from('documenti_contabilita')
    .select('id,workflow_status,validation_status,registered_at,prima_nota_id,numero_documento,data_documento,soggetto_denominazione,soggetto_piva,soggetto_cf,totale,created_at')
    .eq('societa_id', societaId)
    .eq('numero_documento', numeroDocumento)
    .eq('data_documento', dataDocumento)
    .eq('totale', totale)
    .order('created_at', { ascending: false })

  if (result?.error) throw result.error
  const rows = Array.isArray(result?.data) ? result.data : []
  return rows.filter((row) => {
    const rowPiva = normalizeText(row?.soggetto_piva)
    const rowCf = normalizeText(row?.soggetto_cf)
    const rowName = normalizeText(row?.soggetto_denominazione)
    return (vatNumber && rowPiva === vatNumber)
      || (taxCode && rowCf === taxCode)
      || (supplierName && rowName === supplierName)
  })
}

async function countRecentPrimaNotaArtifacts(db, societaId, startedAtIso) {
  const [pnResult, righeResult] = await Promise.all([
    db.from('prima_nota').select('id,created_at').eq('societa_id', societaId).gte('created_at', startedAtIso),
    db.from('prima_nota_righe').select('id,created_at').gte('created_at', startedAtIso),
  ])
  if (pnResult?.error) throw pnResult.error
  if (righeResult?.error) throw righeResult.error
  return {
    primaNotaCount: Array.isArray(pnResult?.data) ? pnResult.data.length : 0,
    primaNotaRigheCount: Array.isArray(righeResult?.data) ? righeResult.data.length : 0,
  }
}

function buildPrimaNotaDraftRows({ parsedDocument, counterpartyAccount, costRevenueAccount, causaleIvaId }) {
  const imponibile = Number(parsedDocument?.imponibile || 0) || 0
  const iva = Number(parsedDocument?.iva || 0) || 0
  const totale = Number(parsedDocument?.totale || 0) || 0

  return [
    {
      lineNo: 1,
      accountId: costRevenueAccount.id,
      description: 'Imponibile',
      debit: imponibile,
      credit: 0,
    },
    {
      lineNo: 2,
      accountId: null,
      description: 'IVA',
      debit: iva,
      credit: 0,
      vatCausaleId: causaleIvaId || null,
    },
    {
      lineNo: 3,
      accountId: counterpartyAccount.id,
      description: 'Controparte',
      debit: 0,
      credit: totale,
    },
  ]
}

function buildIvaDraftRows(parsedDocument, causaleIvaId) {
  const vatRows = Array.isArray(parsedDocument?.ivaRows) ? parsedDocument.ivaRows : []
  if (vatRows.length > 0) {
    return vatRows.map((row, index) => ({
      idx: index,
      rate: Number(row?.aliquota || row?.rate || 0) || 0,
      taxable: Number(row?.imponibile || row?.taxable || 0) || 0,
      tax: Number(row?.iva || row?.tax || 0) || 0,
      detraibilePercent: Number(row?.detraibilePercent ?? 100) || 0,
      indetraibilePercent: Number(row?.indetraibilePercent ?? 0) || 0,
      detraibileTax: Number(row?.detraibileTax ?? row?.iva ?? row?.tax ?? 0) || 0,
      indetraibileTax: Number(row?.indetraibileTax ?? 0) || 0,
      esigibilita: row?.esigibilita || 'Immediata',
      causaleIvaId: causaleIvaId || row?.causaleIvaId || row?.causale_iva_id || null,
    }))
  }

  const tax = Number(parsedDocument?.iva || 0) || 0
  const taxable = Number(parsedDocument?.imponibile || 0) || 0
  if (tax <= 0 && taxable <= 0) return []

  return [{
    idx: 0,
    rate: taxable > 0 ? Math.round((tax / taxable) * 10000) / 100 : 0,
    taxable,
    tax,
    detraibilePercent: 100,
    indetraibilePercent: 0,
    detraibileTax: tax,
    indetraibileTax: 0,
    esigibilita: 'Immediata',
    causaleIvaId: causaleIvaId || null,
  }]
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printUsage()
    return
  }

  const requiredFlags = [
    'societa-id',
    'operator-id',
    'counterparty-account-id',
    'cost-revenue-account-id',
    'causale-contabile-id',
    'registration-date',
  ]
  const missingFlags = requiredFlags.filter((flag) => !hasValue(args[flag]))
  if (missingFlags.length > 0) {
    console.error('Missing required flags:', missingFlags.join(', '))
    printUsage()
    process.exitCode = 1
    return
  }

  const societaId = normalizeText(args['societa-id'])
  const operatorId = normalizeText(args['operator-id'])
  const registrationDate = normalizeText(args['registration-date'])
  const candidateName = normalizeText(args['candidate-name'] || 'HAPPY CASA STORE S.R.L.')
  const candidateNumber = normalizeText(args['candidate-number'] || '184 00582')
  const sourceRowId = normalizeText(args['source-row-id'])
  const confirmWrite = Boolean(args['confirm-document-only-write'])
  const nowIso = new Date().toISOString()

  let db
  try {
    db = await getSupabaseAdmin()
  } catch (error) {
    console.error('Supabase admin client unavailable:', error.message)
    console.error('Required envs: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or allowed local fallback keys).')
    process.exitCode = 1
    return
  }

  const societa = await loadActiveSocietaName(db, societaId)
  if (!societa?.id) {
    console.error('Societa not found or not accessible for societaId:', societaId)
    process.exitCode = 1
    return
  }

  let candidateRow = null
  if (sourceRowId) {
    candidateRow = await loadCandidateImportRowById(db, societaId, sourceRowId)
    if (!candidateRow) {
      console.error('Candidate source row not found in documenti_import for sourceRowId:', sourceRowId)
      process.exitCode = 1
      return
    }
  } else {
    const candidateRows = await loadCandidateImportRow(db, societaId, candidateName, candidateNumber)
    if (candidateRows.length === 0) {
      console.error('Candidate invoice not found in documenti_import for:', candidateName, candidateNumber)
      process.exitCode = 1
      return
    }
    if (candidateRows.length > 1) {
      console.error('P7_MULTIPLE_SOURCE_ROWS_FOUND')
      console.error(JSON.stringify({
        candidateName,
        candidateNumber,
        candidateRowIds: candidateRows.map((row) => row.id),
      }, null, 2))
      process.exitCode = 1
      return
    }
    ;[candidateRow] = candidateRows
  }

  const parsedDocument = candidateRow.ai_raw_response || {}
  const duplicates = await loadDocumentDuplicates(db, societaId, parsedDocument)
  const blockingDuplicates = duplicates.filter((row) => {
    const workflow = normalizeText(row?.workflow_status).toLowerCase()
    return workflow === 'registered'
      || workflow === 'registering'
      || hasValue(row?.prima_nota_id)
      || hasValue(row?.registered_at)
  })

  console.log('Pre-write duplicate SELECT on documenti_contabilita')
  const candidateCounterparty = extractPassiveCounterparty(parsedDocument)
  console.log(JSON.stringify({
    candidate: {
      importRowId: candidateRow.id,
      filename: candidateRow.filename,
      stato: candidateRow.stato,
      supplier: candidateCounterparty.name,
      numeroDocumento: normalizeText(parsedDocument?.numeroDocumento || parsedDocument?.numero_documento),
      dataDocumento: normalizeText(parsedDocument?.dataDocumento || parsedDocument?.data_documento),
      totale: Number(parsedDocument?.totale || 0) || 0,
    },
    duplicateMatches: duplicates,
  }, null, 2))

  if (blockingDuplicates.length > 0) {
    console.error('Aborting: found registered/registering/already-linked duplicate document(s).')
    process.exitCode = 1
    return
  }

  const [counterpartyAccount, costRevenueAccount, causaleContabile] = await Promise.all([
    loadPianoContoById(db, normalizeText(args['counterparty-account-id']), societaId),
    loadPianoContoById(db, normalizeText(args['cost-revenue-account-id']), societaId),
    loadCausaleContabileById(db, normalizeText(args['causale-contabile-id']), societaId),
  ])

  if (!counterpartyAccount?.id || !costRevenueAccount?.id || !causaleContabile?.id) {
    console.error('Missing accounting references. Check counterparty account, cost/revenue account, causale contabile IDs.')
    process.exitCode = 1
    return
  }

  const causaleIvaId = normalizeText(args['causale-iva-id'] || counterpartyAccount?.causale_iva_id)
  const builderInput = {
    societaId,
    operatorId,
    sourceRow: {
      id: candidateRow.id,
      filename: candidateRow.filename,
      stato: candidateRow.stato,
      batchId: candidateRow.batch_id || null,
      numero_documento: normalizeText(parsedDocument?.numeroDocumento || parsedDocument?.numero_documento),
      data_documento: normalizeText(parsedDocument?.dataDocumento || parsedDocument?.data_documento),
      tipo_documento: normalizeText(parsedDocument?.tipoDocumento || parsedDocument?.tipo_documento) || 'fattura_passiva',
      imponibile: Number(parsedDocument?.imponibile || 0) || 0,
      iva: Number(parsedDocument?.iva || 0) || 0,
      totale: Number(parsedDocument?.totale || 0) || 0,
    },
    sourceRowKey: candidateRow.id,
    sourceBatchId: candidateRow.batch_id || null,
    parsedDocument,
    registrationDate,
    counterpartyAccount,
    costRevenueAccount,
    causaleContabile,
    primaNotaDraftRows: buildPrimaNotaDraftRows({ parsedDocument, counterpartyAccount, costRevenueAccount, causaleIvaId }),
    ivaDraftRows: buildIvaDraftRows(parsedDocument, causaleIvaId),
    partitarioDraft: {
      enabled: true,
      type: 'fornitore',
      accountId: counterpartyAccount.id,
      amount: Number(parsedDocument?.totale || 0) || 0,
      dueDate: null,
    },
    percipienteDecision: null,
    readiness: { status: 'ready' },
    automationMeta: {
      runtimeScript: 'p7c3-document-only-write-smoke',
    },
    options: {
      vatPeriodicity: normalizeText(args['vat-periodicity'] || 'mensile'),
      nowIso,
    },
  }

  const built = buildImportContabilitaCommitPayload(builderInput)
  console.log('Generated P7B-v3 payload validation')
  console.log(JSON.stringify(built.validation, null, 2))
  if (built.validation.status === 'blocked') {
    console.error('Aborting: builder returned blocked payload.')
    process.exitCode = 1
    return
  }

  const previewRequest = buildRegistrationNumberRequest({
    documentiContabilita: { societa_id: societaId },
    primaNota: { societa_id: societaId, esercizio: Number(registrationDate.slice(0, 4)) || null },
  })
  const registrationPreview = await previewNextRegistrationNumber(db, previewRequest)
  if (registrationPreview.status !== 'ready') {
    console.error('Aborting: could not preview registration number.')
    console.error(JSON.stringify(registrationPreview, null, 2))
    process.exitCode = 1
    return
  }

  const planResult = await planSingleInvoiceCommitFromImport(built.payload, {
    operatorId,
    now: nowIso,
    registrationNumber: registrationPreview.nextNumber,
  })
  console.log('Generated plan status')
  console.log(JSON.stringify({
    status: planResult.status,
    blockers: planResult.blockers,
    warnings: planResult.warnings,
    documentiContabilitaPreview: planResult.plan?.documentiContabilita || null,
  }, null, 2))

  if (planResult.status !== 'ready') {
    console.error('Aborting: plan is not ready.')
    process.exitCode = 1
    return
  }

  const recentBefore = await countRecentPrimaNotaArtifacts(db, societaId, nowIso)
  const executeOptions = {
    execute: confirmWrite,
    writeScope: 'document_only',
    db,
    operatorId,
    now: nowIso,
  }

  console.log(confirmWrite ? 'About to write only documenti_contabilita' : 'Dry-run / preflight only. No write will be executed.')
  console.log(JSON.stringify({
    writeScope: executeOptions.writeScope,
    confirmWrite,
    preWriteSelects: {
      duplicateCheck: true,
      registrationNumberPreview: registrationPreview,
      recentPrimaNotaBefore: recentBefore,
    },
    wouldInsert: {
      table: 'documenti_contabilita',
      payload: {
        ...planResult.plan.documentiContabilita,
        workflow_status: 'registering',
        validation_status: 'validated',
        locked_by: operatorId,
        locked_at: nowIso,
      },
    },
  }, null, 2))

  const result = await persistAccountingPlan(planResult.plan, executeOptions)
  console.log('persistAccountingPlan result')
  console.log(JSON.stringify(result, null, 2))

  if (!confirmWrite) {
    console.log('No write confirmed. Script stopped after dry-run / execute guard.')
    return
  }

  if (result.status !== 'partial_written' || !result.documentiContabilitaId) {
    console.error('Document-only write did not complete as expected.')
    process.exitCode = 1
    return
  }

  const [insertedDocResult, recentAfter] = await Promise.all([
    db
      .from('documenti_contabilita')
      .select('id,workflow_status,validation_status,locked_by,locked_at,prima_nota_id,registered_at,numero_documento,data_documento,soggetto_denominazione,totale,created_at')
      .eq('id', result.documentiContabilitaId)
      .maybeSingle(),
    countRecentPrimaNotaArtifacts(db, societaId, nowIso),
  ])

  if (insertedDocResult?.error) throw insertedDocResult.error

  console.log('Post-write verification SELECTs')
  console.log(JSON.stringify({
    insertedDocument: insertedDocResult.data || null,
    primaNotaArtifactsBefore: recentBefore,
    primaNotaArtifactsAfter: recentAfter,
    checks: {
      documentExists: Boolean(insertedDocResult?.data?.id),
      noPrimaNotaCreated: recentAfter.primaNotaCount === recentBefore.primaNotaCount,
      noPrimaNotaRigheCreated: recentAfter.primaNotaRigheCount === recentBefore.primaNotaRigheCount,
    },
  }, null, 2))
}

main().catch((error) => {
  console.error('Smoke script failed:', error)
  process.exitCode = 1
})
