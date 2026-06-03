import {
  CANONICAL_ACCOUNTING_LEDGER_ACTIONS,
  CANONICAL_ACCOUNTING_LEDGER_MODES,
  CANONICAL_ACCOUNTING_PAYLOAD_SECTIONS,
  CANONICAL_ACCOUNTING_POST_COMMIT_TARGETS,
  CANONICAL_ACCOUNTING_REGISTRATION_STATES,
  CANONICAL_ACCOUNTING_SOURCE_MODULES,
  CANONICAL_ACCOUNTING_SUBJECT_ROLES,
  CANONICAL_ACCOUNTING_VAT_REGISTER_TYPES,
  CANONICAL_ACCOUNTING_WITHHOLDING_EVENT_TYPES,
} from './canonicalAccountingPayload.schema.js'
import { CANONICAL_ACCOUNTING_SCHEMA_VERSION } from './canonicalAccountingPayload.defaults.js'
import { buildCausaleContabilePolicy } from '../domain/causali/buildCausaleContabilePolicy.js'

const SUPPORTED_SCHEMA_VERSIONS = [CANONICAL_ACCOUNTING_SCHEMA_VERSION]

const TARGET_KEY_BY_FLAG = {
  shouldCreateDocumentiContabilita: 'documentiContabilita',
  shouldCreatePrimaNota: 'primaNota',
  shouldCreateIva: 'iva',
  shouldCreateLedger: 'ledger',
  shouldCreateWithholding: 'withholding',
  shouldCreateScadenziario: 'scadenziario',
  shouldAttachSourceDocument: 'attachments',
  shouldUpdateAuditTrail: 'audit',
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asArray(value) {
  return Array.isArray(value) ? value : []
}

function text(value) {
  return String(value ?? '').trim()
}

function addIssue(bucket, message) {
  if (message) bucket.push(message)
}

function buildTargetState() {
  return Object.values(TARGET_KEY_BY_FLAG).reduce((acc, key) => {
    acc[key] = { valid: true, errors: [], warnings: [], blocking: [], skipped: true }
    return acc
  }, {})
}

function syncTarget(target, isValid, errors, warnings, blocking) {
  target.valid = isValid
  target.skipped = false
  target.errors = Array.from(new Set(errors))
  target.warnings = Array.from(new Set(warnings))
  target.blocking = Array.from(new Set(blocking))
}

function validateRequiredSections(payload, mode, errors, warnings, blocking) {
  const missing = []
  for (const section of CANONICAL_ACCOUNTING_PAYLOAD_SECTIONS) {
    if (section === 'subjects') {
      if (!Array.isArray(payload?.subjects)) missing.push(section)
      continue
    }
    if (section === 'schemaVersion') {
      const val = payload?.[section]
      if (typeof val !== 'string' && !isPlainObject(val)) missing.push(section)
      continue
    }
    if (!isPlainObject(payload?.[section])) missing.push(section)
  }

  for (const section of missing) {
    const message = `sezione ${section} mancante o non valida`
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
}

function validatePostCommitTargets(payload, mode, errors, warnings, blocking) {
  const targets = isPlainObject(payload?.postCommitTargets) ? payload.postCommitTargets : {}
  for (const key of CANONICAL_ACCOUNTING_POST_COMMIT_TARGETS) {
    const value = targets[key]
    if (typeof value !== 'boolean') {
      const message = `postCommitTargets.${key} deve essere boolean`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  }
  return targets
}

function validateSubjects(payload, mode, targets, errors, warnings, blocking) {
  const subjects = asArray(payload?.subjects)
  const allowedRoles = new Set(CANONICAL_ACCOUNTING_SUBJECT_ROLES)

  // Verifichiamo se il flusso coinvolge effettivamente dei soggetti
  const coinvolgeSoggetti = Boolean(
    targets?.shouldCreateIva ||
    targets?.shouldCreateLedger || 
    targets?.shouldCreateWithholding || 
    payload?.fiscalContext?.tipoRegistro
  )

  if (!coinvolgeSoggetti) {
    // Se il flusso non coinvolge soggetti, non richiediamo che subjects sia popolato
    return
  }

  if (!subjects.length) {
    const message = 'subjects deve contenere almeno un elemento quando il flusso coinvolge soggetti'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
    return
  }

  subjects.forEach((subject, index) => {
    if (!isPlainObject(subject)) {
      const message = `subjects[${index}] non valido`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
      return
    }
    if (!text(subject.role)) {
      const message = `subjects[${index}].role mancante`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    } else if (!allowedRoles.has(text(subject.role))) {
      const message = `subjects[${index}].role non ammesso`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (!text(subject.tipoSoggetto)) {
      const message = `subjects[${index}].tipoSoggetto mancante`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  })

  if (targets.shouldCreateLedger) {
    const hasLedgerSubject = subjects.some((subject) => text(subject.pianoContiIdPatrimoniale) || text(subject.anagraficaId) || text(subject.id))
    if (!hasLedgerSubject) {
      const message = 'partitario richiesto ma nessun soggetto/patrimoniale coerente presente'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  }

  if (targets.shouldCreateWithholding) {
    const hasRecipientSubject = subjects.some((subject) => text(subject.role) === 'withholdingRecipient' && text(subject.codiceFiscale))
    if (!hasRecipientSubject && !isPlainObject(payload?.withholding?.recipient)) {
      const message = 'ritenute richieste ma percipiente non risolto'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  }
}

function validatePrimaNota(payload, mode, targets, errors, blocking) {
  if (!targets.shouldCreatePrimaNota) return
  const fiscalContext = isPlainObject(payload?.fiscalContext) ? payload.fiscalContext : {}
  const header = isPlainObject(payload?.header) ? payload.header : {}
  const accounting = isPlainObject(payload?.accounting) ? payload.accounting : {}
  const rows = asArray(accounting.rows)
  const quadratura = isPlainObject(accounting.quadratura) ? accounting.quadratura : {}

  const required = [
    [text(fiscalContext.dataRegistrazione), 'fiscalContext.dataRegistrazione mancante'],
    [isPlainObject(header.causaleContabile) && (text(header.causaleContabile.id) || text(header.causaleContabile.codice)), 'header.causaleContabile mancante'],
    [text(header.descrizione), 'header.descrizione mancante'],
    [rows.length > 0, 'accounting.rows assenti'],
    [quadratura.isBalanced === true, 'accounting.quadratura.isBalanced deve essere true'],
  ]

  for (const [ok, message] of required) {
    if (!ok) {
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  }

  // Stato ammesso check
  const allowedStates = new Set(CANONICAL_ACCOUNTING_REGISTRATION_STATES)
  const stato = text(header.stato)
  if (!stato) {
    const message = 'header.stato mancante'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  } else if (!allowedStates.has(stato)) {
    const message = 'header.stato non valido'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }

  // Rows check (missing accountId, negative / zero amounts, mutual exclusion)
  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      const message = `accounting.rows[${index}] non valido`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
      return
    }
    if (!text(row.accountId)) {
      const message = `accounting.rows[${index}].accountId mancante`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    const dare = Number(row.dare ?? 0)
    const avere = Number(row.avere ?? 0)
    if (!Number.isFinite(dare) || dare < 0) {
      const message = `accounting.rows[${index}].dare deve essere un numero non negativo`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (!Number.isFinite(avere) || avere < 0) {
      const message = `accounting.rows[${index}].avere deve essere un numero non negativo`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (dare === 0 && avere === 0) {
      const message = `accounting.rows[${index}] deve avere un importo in dare o avere maggiore di zero`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (dare > 0 && avere > 0) {
      const message = `accounting.rows[${index}] non può avere importi sia in dare che in avere`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  })

  // Documento IVA checks
  if (targets.shouldCreateIva) {
    const dataDoc = text(payload?.document?.dataDocumento || payload?.fiscalContext?.dataDocumento || payload?.header?.dataDocumento)
    const numDoc = text(payload?.document?.numeroDocumento || payload?.header?.numeroRegistrazione)
    if (!dataDoc) {
      const message = 'documento IVA senza data documento'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (!numDoc) {
      const message = 'documento IVA senza numero documento'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }

    const vatRows = asArray(payload?.vat?.rows)
    if (vatRows.length === 0) {
      const message = 'documento IVA senza riga IVA'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }

    const counterpartyAccountIds = new Set(
      asArray(payload?.subjects)
        .filter((s) => text(s.role) === 'counterparty' || text(s.role) === 'primary')
        .map((s) => text(s.pianoContiIdPatrimoniale || s.id))
        .filter(Boolean)
    )

    const hasVatDocumentImputationRow = rows.some((row) => {
      const tipo = String(row.tipo || row.tipoConto || row.tipo_conto || '').toLowerCase()
      const code = String(row.accountCode || row.conto_codice || '').trim().replace(/\s+/g, '')
      const desc = String(row.accountDescription || row.conto_descrizione || '').toLowerCase()
      
      // priority 1: metadata tipoConto / role
      if (tipo === 'costo' || tipo === 'ricavo' || tipo === 'conto_costo' || tipo === 'conto_ricavo' || tipo === 'conto_imputazione') {
        return true
      }
      if (tipo === 'cliente' || tipo === 'fornitore' || tipo === 'iva' || tipo === 'controparte') {
        return false
      }

      // priority 2: exclude IVA accounts
      const isIva = tipo === 'iva' ||
                    code.startsWith('22') ||
                    desc.includes('erario c/iva') ||
                    desc.includes('iva credito') ||
                    desc.includes('iva debito') ||
                    desc.includes('iva a credito') ||
                    desc.includes('iva a debito') ||
                    desc.includes('iva acquisti') ||
                    desc.includes('iva vendite')
      if (isIva) return false

      // priority 3: exclude customer/vendor / patrimoniale
      const isClientVendor = tipo === 'cliente' ||
                             tipo === 'fornitore' ||
                             tipo === 'controparte' ||
                             (row.accountId && counterpartyAccountIds.has(String(row.accountId))) ||
                             (code.startsWith('4') && (
                               code.startsWith('4001') ||
                               code.startsWith('4501') ||
                               code.startsWith('4010') ||
                               code.startsWith('4510') ||
                               desc.includes('crediti v/') ||
                               desc.includes('debiti v/') ||
                               desc.includes('crediti verso') ||
                               desc.includes('debiti verso') ||
                               desc.includes('cliente') ||
                               desc.includes('fornitore')
                             ))
      if (isClientVendor) return false

      // priority 4: any valid row with non-zero amount
      const dare = Number(row.dare ?? 0)
      const avere = Number(row.avere ?? 0)
      const hasAmount = dare > 0 || avere > 0
      const hasAccount = Boolean(row.accountId || row.accountCode || row.conto_codice)

      return hasAccount && hasAmount
    })

    if (!hasVatDocumentImputationRow) {
      const message = 'riga di imputazione documento IVA mancante'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  }

  // Causale contabile policy check (shouldCreateIva, shouldCreateLedger)
  if (isPlainObject(header.causaleContabile)) {
    const policy = buildCausaleContabilePolicy(header.causaleContabile)
    if (policy.isDocumentoIva === true && targets.shouldCreateIva !== true) {
      const message = 'causale contabile richiede IVA ma modulo IVA non attivo'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (policy.gestionePartitario !== 'nessuno' && targets.shouldCreateLedger !== true) {
      const message = 'causale contabile richiede partitario ma modulo partitario non attivo'
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  }
}

function validateVatRows(rows, mode, errors, blocking) {
  if (!Array.isArray(rows) || rows.length === 0) {
    const message = 'vat.rows assenti'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
    return false
  }

  let ok = true
  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      ok = false
      const message = `vat.rows[${index}] non valido`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
      return
    }
    const hasTaxable = row.imponibile != null || row.taxable != null
    const hasTax = row.imposta != null || row.tax != null
    const hasRateOrNature = row.aliquota != null || row.rate != null || text(row.natura)
    const hasCausale = text(row.causaleIvaId) || text(row.causaleIva)
    if (!hasTaxable || !hasTax || !hasRateOrNature || !hasCausale) {
      ok = false
      const message = `vat.rows[${index}] incompleta`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  })

  return ok
}

function validateVat(payload, mode, targets, errors, blocking) {
  if (!targets.shouldCreateIva) return
  const vat = isPlainObject(payload?.vat) ? payload.vat : {}
  const rowsOk = validateVatRows(vat.rows, mode, errors, blocking)
  const registerType = text(vat.registerType || payload?.fiscalContext?.tipoRegistro)
  if (!rowsOk) return
  if (!vat.enabled && !asArray(vat.rows).length) {
    const message = 'vat.enabled deve essere true oppure vat.rows deve essere valorizzato'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!registerType || !CANONICAL_ACCOUNTING_VAT_REGISTER_TYPES.includes(registerType)) {
    const message = 'vat.registerType mancante o non valido'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
}

function validateLedger(payload, mode, targets, errors, blocking) {
  if (!targets.shouldCreateLedger) return
  const ledger = isPlainObject(payload?.ledger) ? payload.ledger : {}
  const subjects = asArray(payload?.subjects)
  const rows = asArray(ledger.rows)
  const hasLedgerSubject = subjects.some((subject) => text(subject.pianoContiIdPatrimoniale) || text(subject.anagraficaId) || text(subject.id))
  const modeValue = text(ledger.mode)
  const allowedModes = new Set(CANONICAL_ACCOUNTING_LEDGER_MODES)

  if (!ledger.enabled && modeValue === 'none') {
    const message = 'ledger.enabled deve essere true oppure ledger.mode deve essere valorizzato'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!allowedModes.has(modeValue)) {
    const message = 'ledger.mode non valido'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!rows.length) {
    const message = 'ledger.rows assenti'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!hasLedgerSubject) {
    const message = 'soggetto partitario non risolto'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }

  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      const message = `ledger.rows[${index}] non valido`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
      return
    }
    const action = text(row.action)
    const amount = Number(row.amount)
    if (!CANONICAL_ACCOUNTING_LEDGER_ACTIONS.includes(action)) {
      const message = `ledger.rows[${index}].action non valido`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (!Number.isFinite(amount)) {
      const message = `ledger.rows[${index}].amount mancante`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (action === 'close' && !text(row.openItemId) && !text(row.documentRef)) {
      const message = `ledger.rows[${index}] di chiusura senza openItemId/documentRef`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (action === 'open' && !text(row.documentRef) && !text(payload?.document?.numeroDocumento)) {
      const message = `ledger.rows[${index}] di apertura senza documentRef/document.numeroDocumento`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  })
}

function validateWithholding(payload, mode, targets, errors, warnings, blocking) {
  if (!targets.shouldCreateWithholding) return
  const withholding = isPlainObject(payload?.withholding) ? payload.withholding : {}
  const rows = asArray(withholding.rows)
  const recipient = isPlainObject(withholding.recipient) ? withholding.recipient : null
  const recipientCf = text(recipient?.codiceFiscale || recipient?.cf || recipient?.codice_fiscale)
  const subjectRecipient = asArray(payload?.subjects).some((subject) => text(subject.role) === 'withholdingRecipient' && text(subject.codiceFiscale))
  const eventType = text(withholding.eventType)

  if (!withholding.enabled) {
    const message = 'withholding.enabled deve essere true per creare ritenute'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!CANONICAL_ACCOUNTING_WITHHOLDING_EVENT_TYPES.includes(eventType)) {
    const message = 'withholding.eventType non valido'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!recipient && !subjectRecipient) {
    const message = 'percipiente non risolto'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!recipientCf && !subjectRecipient) {
    const message = 'codice fiscale percipiente mancante'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!rows.length) {
    const message = 'withholding.rows assenti'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }

  rows.forEach((row, index) => {
    if (!isPlainObject(row)) {
      const message = `withholding.rows[${index}] non valido`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
      return
    }
    if (row.baseAmount == null || row.rate == null || row.amount == null) {
      const message = `withholding.rows[${index}] incompleta`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
    if (!text(row.causaleCu)) {
      const message = `withholding.rows[${index}].causaleCu mancante`
      if (mode === 'commit') {
        addIssue(errors, message)
        addIssue(blocking, message)
      } else {
        addIssue(warnings, message)
      }
    }
    if (eventType === 'payment' && !text(row.paymentDate)) {
      const message = `withholding.rows[${index}].paymentDate mancante per ritenuta da pagamento`
      addIssue(errors, message)
      if (mode === 'commit') addIssue(blocking, message)
    }
  })
}

function validateAttachments(payload, mode, targets, errors, warnings, blocking) {
  if (!targets.shouldAttachSourceDocument) return
  const attachments = isPlainObject(payload?.attachments) ? payload.attachments : {}
  const hasAttachment = Boolean(text(attachments.sourceFile) || text(attachments.xml) || text(attachments.pdf) || text(attachments.p7m))
  if (!hasAttachment) {
    const message = 'attachments.source mancante'
    if (mode === 'commit') {
      addIssue(errors, message)
      addIssue(blocking, message)
    } else {
      addIssue(warnings, message)
    }
  }
}

function validateAudit(payload, mode, targets, errors, warnings, blocking) {
  if (!targets.shouldUpdateAuditTrail) return
  const audit = isPlainObject(payload?.audit) ? payload.audit : {}
  if (!text(audit.sourceModule)) {
    const message = 'audit.sourceModule mancante'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!Array.isArray(audit.operatorDecisions)) {
    const message = 'audit.operatorDecisions deve essere un array'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }
  if (!audit.createdAt) {
    const message = 'audit.createdAt mancante'
    if (mode === 'commit') {
      addIssue(errors, message)
      addIssue(blocking, message)
    } else {
      addIssue(warnings, message)
    }
  }
}

export function validateCanonicalAccountingPayload(payload, options = {}) {
  const mode = options?.mode === 'commit' ? 'commit' : 'draft'
  const errors = []
  const warnings = []
  const blocking = []
  const targetValidabili = buildTargetState()

  if (!isPlainObject(payload)) {
    const message = 'payload deve essere un oggetto'
    addIssue(errors, message)
    addIssue(blocking, message)
    return {
      isValid: false,
      errors,
      warnings,
      blocking,
      readiness: 'blocked',
      targetValidabili,
    }
  }

  const schemaVersion = text(payload.schemaVersion)
  if (!schemaVersion) {
    const message = 'schemaVersion mancante'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  } else if (!SUPPORTED_SCHEMA_VERSIONS.includes(schemaVersion)) {
    const message = 'schemaVersion non supportata'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }

  const source = isPlainObject(payload.source) ? payload.source : {}
  if (!text(source.module)) {
    const message = 'source.module mancante'
    addIssue(errors, message)
    addIssue(blocking, message)
  } else if (!CANONICAL_ACCOUNTING_SOURCE_MODULES.includes(text(source.module))) {
    const message = 'source.module non ammesso'
    addIssue(errors, message)
    addIssue(blocking, message)
  }

  if (!text(payload?.company?.societaId)) {
    const message = 'company.societaId mancante'
    addIssue(errors, message)
    if (mode === 'commit') addIssue(blocking, message)
  }

  validateRequiredSections(payload, mode, errors, warnings, blocking)
  const targets = validatePostCommitTargets(payload, mode, errors, warnings, blocking)
  validateSubjects(payload, mode, targets, errors, warnings, blocking)
  validatePrimaNota(payload, mode, targets, errors, blocking)
  validateVat(payload, mode, targets, errors, blocking)
  validateLedger(payload, mode, targets, errors, blocking)
  validateWithholding(payload, mode, targets, errors, warnings, blocking)
  validateAttachments(payload, mode, targets, errors, warnings, blocking)
  validateAudit(payload, mode, targets, errors, warnings, blocking)

  const buildTarget = (flagKey, active) => {
    const key = TARGET_KEY_BY_FLAG[flagKey]
    if (!key) return
    const localErrors = []
    const localWarnings = []
    const localBlocking = []
    if (!active) {
      syncTarget(targetValidabili[key], true, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'documentiContabilita') {
      const ok = Boolean(text(payload?.source?.module) && isPlainObject(payload?.company))
      if (!ok) localErrors.push('source/company mancanti')
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'primaNota') {
      const ok = !blocking.some((item) => /prima nota|accounting\.rows|quadratura/i.test(item))
      localErrors.push(...errors.filter((item) => /prima nota|accounting\.rows|quadratura/i.test(item)))
      localBlocking.push(...blocking.filter((item) => /prima nota|accounting\.rows|quadratura/i.test(item)))
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'iva') {
      const ok = !blocking.some((item) => /^vat\./i.test(item) || /IVA/i.test(item))
      localErrors.push(...errors.filter((item) => /^vat\./i.test(item) || /IVA/i.test(item)))
      localBlocking.push(...blocking.filter((item) => /^vat\./i.test(item) || /IVA/i.test(item)))
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'ledger') {
      const ok = !blocking.some((item) => /^ledger|partitario|soggetto partitario/i.test(item))
      localErrors.push(...errors.filter((item) => /^ledger|partitario|soggetto partitario/i.test(item)))
      localBlocking.push(...blocking.filter((item) => /^ledger|partitario|soggetto partitario/i.test(item)))
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'withholding') {
      const ok = !blocking.some((item) => /^withholding|ritenute|percipiente|codice fiscale percipiente/i.test(item))
      localErrors.push(...errors.filter((item) => /^withholding|ritenute|percipiente|codice fiscale percipiente/i.test(item)))
      localWarnings.push(...warnings.filter((item) => /^withholding|ritenute|percipiente/i.test(item)))
      localBlocking.push(...blocking.filter((item) => /^withholding|ritenute|percipiente|codice fiscale percipiente/i.test(item)))
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'scadenziario') {
      syncTarget(targetValidabili[key], true, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'attachments') {
      const ok = !blocking.some((item) => /attachments\.source/i.test(item))
      localErrors.push(...errors.filter((item) => /attachments\.source/i.test(item)))
      localWarnings.push(...warnings.filter((item) => /attachments\.source/i.test(item)))
      localBlocking.push(...blocking.filter((item) => /attachments\.source/i.test(item)))
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
      return
    }
    if (key === 'audit') {
      const ok = !blocking.some((item) => /^audit\./i.test(item))
      localErrors.push(...errors.filter((item) => /^audit\./i.test(item)))
      localWarnings.push(...warnings.filter((item) => /^audit\./i.test(item)))
      localBlocking.push(...blocking.filter((item) => /^audit\./i.test(item)))
      syncTarget(targetValidabili[key], ok, localErrors, localWarnings, localBlocking)
    }
  }

  buildTarget('shouldCreateDocumentiContabilita', true)
  buildTarget('shouldCreatePrimaNota', Boolean(payload?.postCommitTargets?.shouldCreatePrimaNota))
  buildTarget('shouldCreateIva', Boolean(payload?.postCommitTargets?.shouldCreateIva))
  buildTarget('shouldCreateLedger', Boolean(payload?.postCommitTargets?.shouldCreateLedger))
  buildTarget('shouldCreateWithholding', Boolean(payload?.postCommitTargets?.shouldCreateWithholding))
  buildTarget('shouldCreateScadenziario', Boolean(payload?.postCommitTargets?.shouldCreateScadenziario))
  buildTarget('shouldAttachSourceDocument', Boolean(payload?.postCommitTargets?.shouldAttachSourceDocument))
  buildTarget('shouldUpdateAuditTrail', Boolean(payload?.postCommitTargets?.shouldUpdateAuditTrail))

  const isValid = blocking.length === 0
  const readiness = blocking.length ? 'blocked' : (mode === 'commit' ? 'ready' : 'draft')

  return {
    isValid,
    errors: Array.from(new Set(errors)),
    warnings: Array.from(new Set(warnings)),
    blocking: Array.from(new Set(blocking)),
    readiness,
    targetValidabili,
  }
}
