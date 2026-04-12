import { getCausaleReddituale, getSommaNonSoggetta } from '../../../shared/constants/fiscalCatalog.js'

function safeJsonParse(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

function toNumber(value, fallback = 0) {
  const parsed = Number(String(value ?? '').replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : fallback
}

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100
}

function textBlob(documentRow) {
  const estratti = safeJsonParse(documentRow?.dati_estratti)
  const linee = Array.isArray(estratti?.linee) ? estratti.linee : []
  const naturali = Array.isArray(estratti?.riepilogo_iva) ? estratti.riepilogo_iva : []
  return [
    documentRow?.tipo_documento,
    documentRow?.numero_documento,
    documentRow?.soggetto_denominazione,
    estratti?.causale,
    estratti?.xml_content,
    ...linee.map((linea) => linea?.desc || linea?.descrizione || ''),
    ...naturali.map((riga) => riga?.natura || ''),
  ]
    .filter(Boolean)
    .join(' | ')
}

export function extractParcellaInvoiceSignals(documentRow) {
  const estratti = safeJsonParse(documentRow?.dati_estratti)
  const linee = Array.isArray(estratti?.linee) ? estratti.linee : []
  const riepilogoIva = Array.isArray(estratti?.riepilogo_iva) ? estratti.riepilogo_iva : []
  const rawText = textBlob(documentRow)
  const naturaList = riepilogoIva.map((row) => String(row?.natura || '').trim()).filter(Boolean)
  const lower = rawText.toLowerCase()

  const art15Matches = linee.filter((linea) =>
    /(art\.?\s*15|anticipazioni?\s+ex\s+art\.?\s*15|spese\s+anticipate)/i.test(
      `${linea?.desc || ''} ${linea?.descrizione || ''}`
    )
  )
  const art15Amount = art15Matches.reduce(
    (sum, linea) => sum + toNumber(linea?.totale ?? linea?.importo ?? linea?.prezzo_totale, 0),
    0
  )

  const isForfettario =
    /forfett/i.test(lower) ||
    naturaList.some((natura) => natura.toUpperCase() === 'N2.2')

  const isArt15 = art15Amount > 0 || /(art\.?\s*15|anticipazioni?\s+ex\s+art\.?\s*15)/i.test(lower)
  const isDirittiAutore =
    /(diritti?\s+d['’]autore|opere?\s+dell['’]ingegno|royalt(?:y|ies)|cessione\s+diritti)/i.test(lower)
  const isOccasionale = /(prestazione\s+occasionale|lavoro\s+autonomo\s+occasionale)/i.test(lower)
  const hasCassa = /(cassa\s+(previdenziale|professionale)|contributo\s+integrativo)/i.test(lower)
  const hasInps = /\b(inps|gestione\s+separata)\b/i.test(lower)
  const hasEnasarco = /\benasarco\b/i.test(lower)
  // Strong evidence: explicit withholding wording (avoid generic "consulenza/prestazione" false positives).
  const hasExplicitWithholding =
    /\britenut[ae]\b/i.test(lower) ||
    /ritenuta\s+d['’]acconto/i.test(lower) ||
    /rit\.\s*acc/i.test(lower) ||
    /acconto\s+irpef/i.test(lower)

  // Weak evidence: document language compatible with professional invoice, but not sufficient alone.
  const hasParcellaWord = /\bparcella\b/i.test(lower) || /\bonorar(?:io|i)\b/i.test(lower)
  const weakProfessionalWording =
    /(prestazione|compenso|autonomo|consulenza|professionista)/i.test(lower) && !isForfettario

  const likelyWithholding = (hasExplicitWithholding || hasParcellaWord || weakProfessionalWording) && !isForfettario

  const specialCausale =
    /(provvigioni|agente|intermediari|mediazione)/i.test(lower) ? 'Q'
    : null

  const suggestedCausale = isDirittiAutore ? 'B' : isOccasionale ? 'M' : specialCausale || 'A'

  return {
    rawText,
    naturaList,
    isArt15,
    art15Amount: round2(art15Amount),
    isDirittiAutore,
    isOccasionale,
    hasCassa,
    hasInps,
    hasEnasarco,
    isForfettario,
    hasExplicitWithholding,
    hasParcellaWord,
    weakProfessionalWording,
    likelyWithholding,
    suggestedCausale,
  }
}

export function isProfessionalParcellaDocument(documentRow) {
  const tipoDocumento = String(documentRow?.tipo_documento || '').toLowerCase()
  if (!tipoDocumento.includes('passiva') && !tipoDocumento.includes('td03') && !tipoDocumento.includes('td06')) {
    return false
  }
  const estratti = safeJsonParse(documentRow?.dati_estratti)
  if (estratti?.parcella_confirmation || estratti?.parcella_audit) return true
  const signals = extractParcellaInvoiceSignals(documentRow)
  // Parcella flow is strict: require strong fiscal evidence, avoid TD01 generic passive invoices.
  return Boolean(
    signals.isDirittiAutore ||
      signals.isOccasionale ||
      signals.hasCassa ||
      signals.hasInps ||
      signals.hasEnasarco ||
      signals.hasExplicitWithholding ||
      // "Parcella/onorario" is meaningful, but still require non-forfettario context.
      (signals.hasParcellaWord && !signals.isForfettario)
  )
}

function getPercipienteAge(percipiente, referenceDate) {
  const birthRaw = percipiente?.data_nascita || percipiente?.birth_date || percipiente?.dt_nascita
  if (!birthRaw) return null
  const birth = new Date(birthRaw)
  const ref = new Date(referenceDate || new Date().toISOString().slice(0, 10))
  if (Number.isNaN(birth.getTime()) || Number.isNaN(ref.getTime())) return null
  let age = ref.getFullYear() - birth.getFullYear()
  const monthDelta = ref.getMonth() - birth.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && ref.getDate() < birth.getDate())) age -= 1
  return age
}

function diffField(label, proposal, finalValue, rows) {
  if ((proposal ?? '') === (finalValue ?? '')) return
  rows.push({ label, proposta: proposal ?? '—', finale: finalValue ?? '—' })
}

export function buildParcellaAuditRecord({ proposal, finalValues, warnings = [], userLabel, existingAuditId = null }) {
  const audit = buildParcellaAudit({ proposal, finalValues, userLabel })
  return {
    audit_id: existingAuditId || `parcella-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    version: 1,
    proposal,
    finalValues,
    changedFields: audit.changedFields,
    user: audit.user,
    timestamp: audit.timestamp,
    status: audit.status,
    diffRows: audit.diffRows,
    warnings,
  }
}

export function buildParcellaDecision({ percipiente, documentRow, draft = {} }) {
  const hasPercipienteDefaults = Boolean(percipiente)
  const signals = extractParcellaInvoiceSignals(documentRow)
  const imponibileCompenso = round2(
    toNumber(draft.compenso_lordo, toNumber(documentRow?.imponibile, toNumber(documentRow?.totale, 0)))
  )

  const defaultCausale = String(percipiente?.causale_prevalente || '').trim()
  const causaleReddituale = defaultCausale || 'A'
  const warnings = []

  if (!hasPercipienteDefaults || !defaultCausale) {
    warnings.push('Percipiente non preconfigurato: proposta iniziale impostata su causale A.')
  }
  if (defaultCausale && signals.suggestedCausale && defaultCausale !== signals.suggestedCausale) {
    warnings.push(`La fattura suggerisce causale ${signals.suggestedCausale}, ma la proposta parte dalla causale ${defaultCausale} del percipiente.`)
  }

  const regime = String(percipiente?.regime_fiscale || '').toLowerCase()
  const explicitDraftForfettario = String(draft.codice_somme_non_soggette || '') === '24'
  const hasTrustedRegime = Boolean(regime)
  const detectedForfettario = signals.isForfettario
  const isForfettario = explicitDraftForfettario || regime === 'forfettario' || (!hasTrustedRegime && detectedForfettario)
  if (detectedForfettario && regime && regime !== 'forfettario') {
    warnings.push('Documento con segnali forfettario rilevati, ma il percipiente non e configurato come forfettario: mantenuti i default del percipiente, verifica manualmente.')
  }
  if (isForfettario && !signals.isForfettario && regime === 'forfettario') {
    warnings.push('Percipiente forfettario: la parcella viene trattata come esclusa da CU, 770 e scadenziario ritenute.')
  }

  const age = getPercipienteAge(percipiente, draft.data_pagamento || documentRow?.data_documento)
  const dirittoAutoreDeductionRate =
    causaleReddituale === 'B' || signals.isDirittiAutore
      ? age === null
        ? 0
        : age < 35
          ? 40
          : 25
      : 0
  if ((causaleReddituale === 'B' || signals.isDirittiAutore) && age === null) {
    warnings.push("Diritti d'autore rilevati ma eta non disponibile: nessuna riduzione automatica finalizzata, conferma manualmente la regola corretta.")
  }

  const art15Amount = Math.min(imponibileCompenso, round2(signals.art15Amount))
  const dirittiAutoreQuota = round2(imponibileCompenso * (dirittoAutoreDeductionRate / 100))
  const quotaNonSoggetta = round2(
    isForfettario ? imponibileCompenso : Math.max(art15Amount, dirittiAutoreQuota, toNumber(draft.quota_non_soggetta, 0))
  )

  let codiceSommeNonSoggette = String(
    draft.codice_somme_non_soggette ||
      percipiente?.codice_somme_non_soggette ||
      percipiente?.codice_somme_non_soggette_default ||
      ''
  ).trim()

  if (isForfettario) codiceSommeNonSoggette = '24'
  else if (signals.isArt15) codiceSommeNonSoggette = '22'
  else if (causaleReddituale === 'B' || signals.isDirittiAutore) codiceSommeNonSoggette = '21'

  const causaleMeta = getCausaleReddituale(causaleReddituale)
  const nonSubjectMeta = getSommaNonSoggetta(codiceSommeNonSoggette)

  if (signals.isArt15) {
    warnings.push('Rilevate somme art. 15: proposta con codice 22 e quota esclusa da reddito e ritenuta.')
  }

  const soggettoRitenuta =
    !isForfettario &&
    (percipiente?.soggetto_ritenuta ?? (causaleMeta?.withholdingApplicability === 'yes' ? true : signals.likelyWithholding ?? true)) &&
    causaleReddituale !== 'O'
  const withholdingRate = soggettoRitenuta
    ? toNumber(draft.withholding_rate, toNumber(percipiente?.aliquota_ritenuta, toNumber(causaleMeta?.default_withholding_rate, 20)))
    : 0

  const imponibileRitenuta = round2(Math.max(0, imponibileCompenso - quotaNonSoggetta))
  const ritenutaAmount = round2(imponibileRitenuta * (withholdingRate / 100))
  const compensoNetto = round2(imponibileCompenso - ritenutaAmount)

  const cassaPercent = round2(toNumber(draft.cassa_percent, toNumber(percipiente?.cassa_previdenziale, signals.hasCassa ? 4 : 0)))
  const cassaFlag = Boolean(draft.cassa_flag ?? percipiente?.cassa_previdenziale ?? signals.hasCassa)
  const inpsFlag = Boolean(draft.inps_flag ?? percipiente?.inps_flag ?? signals.hasInps)
  const enasarcoFlag = Boolean(draft.enasarco_flag ?? percipiente?.enasarco_flag ?? signals.hasEnasarco)

  if (soggettoRitenuta && !withholdingRate) {
    warnings.push('Configurazione ritenuta incompleta: percentuale mancante o nulla, verifica manualmente.')
  }
  if (!percipiente?.codice_fiscale) {
    warnings.push('Codice fiscale del percipiente mancante: verificare prima della conferma.')
  }

  const registrationCausale = isForfettario ? 'FF' : percipiente?.contabilita_per_cassa ? 'RPPC' : 'RP'
  const paymentCausale = isForfettario ? 'PF' : registrationCausale === 'RPPC' ? 'PPPC' : 'PF80'
  const downstream = {
    updateCu: !isForfettario && Boolean(percipiente?.soggetto_cu ?? true),
    update770: !isForfettario && Boolean(percipiente?.soggetto_770 ?? true),
    updateWithholdingSchedule: !isForfettario && soggettoRitenuta,
    paymentSchedule1040: !isForfettario && Boolean(percipiente?.payment_schedule_1040 ?? soggettoRitenuta),
  }

  return {
    proposal: {
      percipienteId: percipiente?.id || '',
      causaleReddituale,
      cassaFlag,
      cassaPercent,
      inpsFlag,
      enasarcoFlag,
      imponibileCompenso,
      quotaNonSoggetta,
      codiceSommeNonSoggette,
      withholdingRate,
      withholdingAmount: ritenutaAmount,
      compensoNetto,
      causaleMeta,
      nonSubjectMeta,
      deductionRule:
        causaleReddituale === 'B' || signals.isDirittiAutore
          ? age === null
            ? 'Da confermare manualmente'
            : `${dirittoAutoreDeductionRate}% quota esclusa`
          : signals.isArt15
            ? 'Art. 15 escluso'
            : isForfettario
              ? 'Forfettario escluso'
              : 'Nessuna riduzione',
      registrationCausale,
      paymentCausale,
      fiscalFlags: {
        soggettoCu: downstream.updateCu,
        soggetto770: downstream.update770,
        soggettoRitenuta,
      },
      downstream,
    },
    warnings,
    signals,
  }
}

export function buildParcellaAudit({ proposal, finalValues, userLabel }) {
  const diffRows = []
  diffField('Causale', proposal.causaleReddituale, finalValues.causaleReddituale, diffRows)
  diffField('Codice somme non soggette', proposal.codiceSommeNonSoggette, finalValues.codiceSommeNonSoggette, diffRows)
  diffField('Cassa', proposal.cassaFlag ? `Si (${proposal.cassaPercent}%)` : 'No', finalValues.cassaFlag ? `Si (${finalValues.cassaPercent}%)` : 'No', diffRows)
  diffField('INPS', proposal.inpsFlag ? 'Si' : 'No', finalValues.inpsFlag ? 'Si' : 'No', diffRows)
  diffField('Enasarco', proposal.enasarcoFlag ? 'Si' : 'No', finalValues.enasarcoFlag ? 'Si' : 'No', diffRows)
  diffField('Quota non soggetta', proposal.quotaNonSoggetta, finalValues.quotaNonSoggetta, diffRows)
  diffField('Aliquota ritenuta', proposal.withholdingRate, finalValues.withholdingRate, diffRows)
  diffField('Importo ritenuta', proposal.withholdingAmount, finalValues.withholdingAmount, diffRows)
  diffField('Regola riduzione', proposal.deductionRule, finalValues.deductionRule, diffRows)
  diffField('Effetto CU', proposal.downstream?.updateCu ? 'Si' : 'No', finalValues.downstream?.updateCu ? 'Si' : 'No', diffRows)
  diffField('Effetto 770', proposal.downstream?.update770 ? 'Si' : 'No', finalValues.downstream?.update770 ? 'Si' : 'No', diffRows)
  diffField(
    'Scadenziario ritenute',
    proposal.downstream?.updateWithholdingSchedule ? 'Si' : 'No',
    finalValues.downstream?.updateWithholdingSchedule ? 'Si' : 'No',
    diffRows
  )

  return {
    status: diffRows.length ? 'Variato' : 'Confermato',
    changedFields: diffRows.map((row) => row.label),
    diffRows,
    user: userLabel || 'Operatore',
    timestamp: new Date().toISOString(),
  }
}

const AUDIT_PREFIX = '[FSM_PARCELLA_AUDIT]'

export function buildParcellaAuditNote(userNote, auditPayload) {
  const note = String(userNote || '').trim()
  const auditJson = JSON.stringify(auditPayload)
  return note ? `${note}\n${AUDIT_PREFIX}${auditJson}` : `${AUDIT_PREFIX}${auditJson}`
}

export function parseParcellaAuditNote(noteValue) {
  const raw = String(noteValue || '')
  const idx = raw.indexOf(AUDIT_PREFIX)
  if (idx === -1) return { note: raw.trim(), audit: null }
  const note = raw.slice(0, idx).trim()
  const json = raw.slice(idx + AUDIT_PREFIX.length).trim()
  try {
    return { note, audit: JSON.parse(json) }
  } catch {
    return { note: raw.trim(), audit: null }
  }
}
