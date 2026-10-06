import * as contabilitaRepo from '../data/contabilitaRepo.js'
import {
  classifyPercipienteOutcome,
  findExistingPercipiente,
  inferPercipienteCandidate,
  norm,
  normVat,
  safeJsonParse,
} from './percipientiInference.js'

export {
  classifyPercipienteOutcome,
  findExistingPercipiente,
  inferPercipienteCandidate,
  norm,
  normVat,
  safeJsonParse,
} from './percipientiInference.js'

export const TRUSTED_PERCIPIENTE_FIELDS = Object.freeze([
  'codice_fiscale',
  'partita_iva',
  'regime_fiscale',
  'tipo_percipiente',
  'tipo_ritenuta',
  'aliquota_ritenuta',
  'causale_prevalente',
  'codice_somme_non_soggette',
  'soggetto_cu',
  'soggetto_770',
  'soggetto_ritenuta',
  'cassa_previdenziale',
  'rivalsa',
  'inps_flag',
  'enasarco_flag',
  'payment_schedule_1040',
  'data_nascita',
])

export const ENRICHABLE_PERCIPIENTE_FIELDS = Object.freeze([
  'ragione_sociale',
  'nome',
  'cognome',
  'indirizzo',
  'cap',
  'citta',
  'provincia',
  'paese',
  'residenza_fiscale',
  'email',
  'telefono',
  'iban',
  'modalita_pagamento',
  'validation_state',
  'validation_source',
  'source_document_id',
  'linked_documents_count',
  'last_invoice_date',
  'compensi_ytd',
  'ritenute_ytd',
  'auto_imported',
  'attivo',
  'note',
])

function inferRitenutaRate(text) {
  const match = String(text || '').match(/ritenuta[^0-9]{0,12}(\d{1,2}(?:[.,]\d+)?)/i)
  if (!match) return null
  return Number(String(match[1]).replace(',', '.'))
}

function inferCassaRate(text) {
  const match = String(text || '').match(/cassa[^0-9]{0,12}(\d{1,2}(?:[.,]\d+)?)/i)
  if (!match) return null
  return Number(String(match[1]).replace(',', '.'))
}

function inferRivalsaRate(text) {
  const match = String(text || '').match(/rivalsa[^0-9]{0,12}(\d{1,2}(?:[.,]\d+)?)/i)
  if (!match) return null
  return Number(String(match[1]).replace(',', '.'))
}

function extractAddressParts(addressText) {
  const raw = String(addressText || '').trim()
  if (!raw) return {}
  const parts = raw.split(/—|,|-/).map((part) => part.trim()).filter(Boolean)
  const first = parts[0] || ''
  const capMatch = raw.match(/\b\d{5}\b/)
  const provinceMatch = raw.match(/\(([A-Z]{2})\)/)
  return {
    indirizzo: first || '',
    cap: capMatch?.[0] || '',
    provincia: provinceMatch?.[1] || '',
  }
}

function inferPercipienteCandidateLegacy(documentRow) {
  const estratti = safeJsonParse(documentRow?.dati_estratti)
  const linee = Array.isArray(estratti?.linee) ? estratti.linee : []
  const rawText = [
    documentRow?.tipo_documento,
    documentRow?.numero_documento,
    documentRow?.soggetto_denominazione,
    estratti?.xml_content,
    estratti?.causale,
    ...(linee.map((linea) => linea?.desc || linea?.descrizione || '')),
  ]
    .filter(Boolean)
    .join(' | ')

  const name = String(documentRow?.soggetto_denominazione || estratti?.cedente_denom || '').trim()
  const codiceFiscale = norm(documentRow?.soggetto_cf || estratti?.cedente_cf || '')
  const partitaIva = normVat(documentRow?.soggetto_piva || estratti?.cedente_piva || '')
  const tipoDocumento = String(documentRow?.tipo_documento || '').toLowerCase()

  const professionalHints = /(parcella|prestazione|compenso|onorario|consulenza|ritenuta|contributo integrativo|rivalsa|professionista|avv\.?|commercialista|architetto|ingegnere|geometra|notaio|medico)/i
  const td03Hint = /<tipodocumento>\s*td03\s*<\/tipodocumento>/i.test(rawText)
  const td06Hint = /<tipodocumento>\s*td06\s*<\/tipodocumento>/i.test(rawText)
  const isPassiveInvoice = tipoDocumento.includes('fattura_passiva') || tipoDocumento.includes('td03') || tipoDocumento.includes('td06')
  const hasProfessionalSignal = professionalHints.test(rawText) || td03Hint || td06Hint

  if (!isPassiveInvoice || !hasProfessionalSignal) {
    return {
      relevant: false,
      signals: {
        isPassiveInvoice,
        hasProfessionalSignal,
        td03Hint,
        td06Hint,
        inferredRegime: '',
        expectedWithholding: false,
        withholdingRateInText: null,
        cassaRateInText: null,
        rivalsaRateInText: null,
        hasCodiceFiscale: Boolean(codiceFiscale),
        hasPartitaIva: Boolean(partitaIva),
      },
    }
  }

  const fullAddress = estratti?.indirizzo_cedente || estratti?.address || ''
  const addressParts = extractAddressParts(fullAddress)
  const inferredTipo = /collabor/i.test(rawText) ? 'collaboratore' : 'professionista'
  const inferredRegime = /forfett/i.test(rawText) ? 'forfettario' : ''
  const inferredRitenutaRate = inferRitenutaRate(rawText)
  const inferredCassaRate = inferCassaRate(rawText)
  const inferredRivalsaRate = inferRivalsaRate(rawText)
  const imponibile = Number(documentRow?.imponibile || documentRow?.totale || 0)
  const expectedWithholding = /ritenuta|prestazione|onorario|parcella|compenso/i.test(rawText) && inferredRegime !== 'forfettario'

  return {
    relevant: true,
    signals: {
      isPassiveInvoice,
      hasProfessionalSignal,
      td03Hint,
      td06Hint,
      inferredRegime,
      expectedWithholding,
      withholdingRateInText: inferredRitenutaRate,
      cassaRateInText: inferredCassaRate,
      rivalsaRateInText: inferredRivalsaRate,
      hasCodiceFiscale: Boolean(codiceFiscale),
      hasPartitaIva: Boolean(partitaIva),
    },
    candidate: {
      tipo_persona: /\b(SRL|SPA|SNC|SAS|STP|ASSOCIATI|STUDIO)\b/i.test(name) ? 'giuridica' : 'fisica',
      ragione_sociale: /\b(SRL|SPA|SNC|SAS|STP|ASSOCIATI|STUDIO)\b/i.test(name) ? name : '',
      nome: '',
      cognome: '',
      codice_fiscale: codiceFiscale,
      partita_iva: partitaIva,
      indirizzo: addressParts.indirizzo || '',
      cap: addressParts.cap || '',
      citta: '',
      provincia: addressParts.provincia || '',
      paese: /estero|foreign/i.test(rawText) ? 'ESTERO' : '',
      residenza_fiscale: /estero|foreign/i.test(rawText) ? 'Estero' : 'Italia',
      tipo_percipiente: inferredTipo,
      soggetto_cu: true,
      soggetto_770: true,
      soggetto_ritenuta: expectedWithholding,
      tipo_ritenuta: expectedWithholding ? 'acconto' : 'nessuna',
      aliquota_ritenuta: inferredRitenutaRate ?? (expectedWithholding ? 20 : 0),
      regime_fiscale: inferredRegime || 'ordinario',
      cassa_previdenziale: inferredCassaRate ?? null,
      rivalsa: inferredRivalsaRate ?? null,
      modalita_pagamento: Array.isArray(estratti?.pagamenti) && estratti.pagamenti.some((p) => p?.iban) ? 'bonifico' : '',
      iban: Array.isArray(estratti?.pagamenti) ? String(estratti.pagamenti.find((p) => p?.iban)?.iban || '').toUpperCase() : '',
      causale_prevalente: expectedWithholding ? 'A' : 'O',
      attivo: true,
      auto_imported: true,
      validation_state: codiceFiscale && (inferredRitenutaRate || !expectedWithholding) ? 'complete' : 'da_validare',
      validation_source: 'documenti_contabilita',
      source_document_id: documentRow?.id || null,
      linked_documents_count: 1,
      last_invoice_date: documentRow?.data_documento || null,
      compensi_ytd: imponibile,
      ritenute_ytd: expectedWithholding ? (imponibile * Number(inferredRitenutaRate ?? 20)) / 100 : 0,
      payment_schedule_1040: expectedWithholding,
      note: 'Importato automaticamente da documento professionale/parcella.',
    },
  }
}

function classifyPercipienteOutcomeLegacy({ documentRow, inferred, matchedPercipiente }) {
  const out = {
    outcome: 'generic_supplier',
    reasons: [],
    signals: inferred?.signals || {},
  }

  if (!inferred?.relevant) return out

  if (matchedPercipiente?.id) {
    return {
      outcome: 'confirmed_percipiente',
      reasons: ['Soggetto già presente in Percipienti.'],
      signals: inferred?.signals || {},
    }
  }

  const signals = inferred?.signals || {}
  const candidate = inferred?.candidate || {}
  const hasCf = Boolean(String(candidate?.codice_fiscale || '').trim())
  const hasPiva = Boolean(String(candidate?.partita_iva || '').trim())
  const hasWithholdingSetup =
    Boolean(candidate?.soggetto_ritenuta) ||
    Number(candidate?.aliquota_ritenuta || 0) > 0 ||
    Boolean(signals?.withholdingRateInText)

  let score = 0
  if (signals?.td03Hint || signals?.td06Hint) {
    score += 3
    out.reasons.push('Tipologia documento compatibile (TD03/TD06).')
  }
  if (signals?.hasProfessionalSignal) {
    score += 2
    out.reasons.push('Indicatori di parcella/prestazione rilevati nel documento.')
  }
  if (hasWithholdingSetup) {
    score += 2
    out.reasons.push('Ritenuta plausibile o indicata (setup/aliquota).')
  }
  if (signals?.expectedWithholding) {
    score += 1
    out.reasons.push('Testo documento compatibile con ritenuta.')
  }
  if (hasCf) {
    score += 2
  } else {
    out.reasons.push('Codice fiscale non rilevato: evidenza incompleta.')
  }
  if (hasPiva) score += 1

  const isForfettario = String(candidate?.regime_fiscale || '').toLowerCase() === 'forfettario'
  if (isForfettario) {
    score += 2
    out.reasons.push('Regime forfettario rilevato nel documento.')
  }

  if (score >= 7) {
    out.outcome = 'confirmed_percipiente'
    return out
  }

  if (score >= 4) {
    out.outcome = 'possible_percipiente'
    return out
  }

  out.outcome = 'generic_supplier'
  return out
}

function buildPercipienteIntakeAudit({ documentRow, classification, reasons, signals, userLabel = 'FiscoSim', existingAuditId = null }) {
  const now = new Date().toISOString()
  const auditId = existingAuditId || `pi_${Math.random().toString(16).slice(2)}_${Date.now()}`
  return {
    audit_id: auditId,
    version: 1,
    document_id: documentRow?.id || null,
    classification,
    reasons: Array.isArray(reasons) ? reasons : [],
    signals: signals && typeof signals === 'object' ? signals : {},
    user: userLabel,
    timestamp: now,
    decision: null,
    decision_timestamp: null,
  }
}

async function storePercipienteIntakeAudit(documentRow, auditPayload) {
  if (!documentRow?.id) return
  const d0 = safeJsonParse(documentRow?.dati_estratti)
  const existing = d0?.percipiente_intake_audit && typeof d0.percipiente_intake_audit === 'object' ? d0.percipiente_intake_audit : null
  const sameClassification = existing?.classification && existing.classification === auditPayload.classification
  if (sameClassification && existing?.decision) return
  if (sameClassification && existing?.audit_id && existing.audit_id === auditPayload.audit_id) return
  const next = { ...d0, percipiente_intake_audit: auditPayload }
  try {
    await contabilitaRepo.updateDocumentoContabilita(documentRow.id, { dati_estratti: next })
  } catch (e) {
    console.warn('[Percipienti intake audit] updateDocumentoContabilita', e?.message || e)
  }
}

export function buildAvailableColumns(rows) {
  const keys = new Set()
  ;(rows || []).forEach((row) => Object.keys(row || {}).forEach((key) => keys.add(key)))
  return keys
}

export function mergeForUpdate(existing, candidate, availableColumns) {
  const updates = {}
  const trustedKeys = new Set(TRUSTED_PERCIPIENTE_FIELDS)
  const enrichableKeys = new Set(ENRICHABLE_PERCIPIENTE_FIELDS)
  const keys = Object.keys(candidate)

  keys.forEach((key) => {
    if (!(availableColumns.has(key) || key in existing)) return
    const current = existing?.[key]
    const next = candidate?.[key]
    if (next === undefined || next === null || next === '') return
    if (!trustedKeys.has(key) && !enrichableKeys.has(key)) return
    if (current === undefined || current === null || current === '' || current === false) {
      updates[key] = next
      return
    }
    if (!trustedKeys.has(key) && (key === 'last_invoice_date' || key === 'compensi_ytd' || key === 'ritenute_ytd' || key === 'linked_documents_count')) {
      if (key === 'last_invoice_date') {
        if (String(next) > String(current || '')) updates[key] = next
      } else {
        updates[key] = Math.max(Number(current || 0), Number(next || 0))
      }
    }
  })

  return updates
}

export function buildInsertRecord(societaId, candidate, availableColumns) {
  const safeBase = {
    societa_id: societaId,
    tipo_persona: candidate.tipo_persona,
    ragione_sociale: candidate.ragione_sociale,
    nome: candidate.nome,
    cognome: candidate.cognome,
    codice_fiscale: candidate.codice_fiscale,
    partita_iva: candidate.partita_iva,
    indirizzo: candidate.indirizzo,
    cap: candidate.cap,
    citta: candidate.citta,
    provincia: candidate.provincia,
    email: candidate.email || '',
    telefono: candidate.telefono || '',
    iban: candidate.iban,
    causale_prevalente: candidate.causale_prevalente,
    aliquota_ritenuta: candidate.aliquota_ritenuta,
    note: candidate.note,
    attivo: candidate.attivo,
  }

  const optional = {}
  ;[
    'paese',
    'residenza_fiscale',
    'tipo_percipiente',
    'soggetto_cu',
    'soggetto_770',
    'soggetto_ritenuta',
    'tipo_ritenuta',
    'regime_fiscale',
    'modalita_pagamento',
    'cassa_previdenziale',
    'rivalsa',
    'validation_state',
    'validation_source',
    'source_document_id',
    'linked_documents_count',
    'last_invoice_date',
    'compensi_ytd',
    'ritenute_ytd',
    'payment_schedule_1040',
    'auto_imported',
  ].forEach((key) => {
    if (availableColumns.has(key)) optional[key] = candidate[key]
  })

  return { ...safeBase, ...optional }
}

function findExistingPercipienteLegacy(existingRows, candidate) {
  const cf = norm(candidate.codice_fiscale)
  const piva = normVat(candidate.partita_iva)
  const name = norm(candidate.ragione_sociale || `${candidate.cognome || ''} ${candidate.nome || ''}`.trim())
  return (existingRows || []).find((row) => {
    if (cf && norm(row.codice_fiscale) === cf) return true
    if (piva && normVat(row.partita_iva) === piva) return true
    return name && norm(row.ragione_sociale || `${row.cognome || ''} ${row.nome || ''}`.trim()) === name
  })
}

export async function syncPercipientiRegistryForSocieta(societaId) {
  if (!societaId) return { created: 0, updated: 0, scanned: 0 }

  const [{ data: docs, error: docsError }, { data: rows, error: rowsError }] = await Promise.all([
    contabilitaRepo.getDocumenti(societaId),
    contabilitaRepo.getPercipientiBySocieta(societaId),
  ])
  if (docsError) throw docsError
  if (rowsError) throw rowsError

  const existingRows = [...(rows || [])]
  const availableColumns = buildAvailableColumns(existingRows)
  let created = 0
  let updated = 0
  let scanned = 0

  for (const documentRow of docs || []) {
    const inferred = inferPercipienteCandidate(documentRow)
    if (!inferred.relevant) continue
    scanned += 1
    const match = findExistingPercipiente(existingRows, inferred.candidate)
    const classification = classifyPercipienteOutcome({ documentRow, inferred, matchedPercipiente: match || null })
    if (classification.outcome === 'possible_percipiente') {
      const auditPayload = buildPercipienteIntakeAudit({
        documentRow,
        classification: classification.outcome,
        reasons: classification.reasons,
        signals: classification.signals,
      })
      await storePercipienteIntakeAudit(documentRow, auditPayload)
      continue
    }
    if (classification.outcome !== 'confirmed_percipiente') continue
    if (match) {
      const updates = mergeForUpdate(match, inferred.candidate, availableColumns)
      if (Object.keys(updates).length > 0) {
        const { error } = await contabilitaRepo.updatePercipiente(match.id, updates)
        if (!error) {
          Object.assign(match, updates)
          updated += 1
        }
      }
      continue
    }

    const payload = buildInsertRecord(societaId, inferred.candidate, availableColumns)
    const { error } = await contabilitaRepo.insertPercipiente(payload)
    if (!error) {
      existingRows.push(payload)
      created += 1
    }
  }

  return { created, updated, scanned }
}

export async function syncPercipienteFromDocumentoContabilita(documentRow) {
  if (!documentRow?.societa_id) return { created: 0, updated: 0, scanned: 0 }
  const inferred = inferPercipienteCandidate(documentRow)
  if (!inferred.relevant) return { created: 0, updated: 0, scanned: 0 }

  const { data: rows, error } = await contabilitaRepo.getPercipientiBySocieta(documentRow.societa_id)
  if (error) throw error
  const existingRows = rows || []
  const availableColumns = buildAvailableColumns(existingRows)
  const match = findExistingPercipiente(existingRows, inferred.candidate)
  const classification = classifyPercipienteOutcome({ documentRow, inferred, matchedPercipiente: match || null })
  if (classification.outcome === 'possible_percipiente') {
    const d0 = safeJsonParse(documentRow?.dati_estratti)
    const existingAuditId = d0?.percipiente_intake_audit?.audit_id || null
    const auditPayload = buildPercipienteIntakeAudit({
      documentRow,
      classification: classification.outcome,
      reasons: classification.reasons,
      signals: classification.signals,
      existingAuditId,
    })
    await storePercipienteIntakeAudit(documentRow, auditPayload)
    return { created: 0, updated: 0, scanned: 1 }
  }
  if (classification.outcome !== 'confirmed_percipiente') return { created: 0, updated: 0, scanned: 1 }
  if (match) {
    const updates = mergeForUpdate(match, inferred.candidate, availableColumns)
    if (!Object.keys(updates).length) return { created: 0, updated: 0, scanned: 1 }
    const res = await contabilitaRepo.updatePercipiente(match.id, updates)
    if (res.error) throw res.error
    return { created: 0, updated: 1, scanned: 1 }
  }

  const payload = buildInsertRecord(documentRow.societa_id, inferred.candidate, availableColumns)
  const res = await contabilitaRepo.insertPercipiente(payload)
  if (res.error) throw res.error
  return { created: 1, updated: 0, scanned: 1 }
}
