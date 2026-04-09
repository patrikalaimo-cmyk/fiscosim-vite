export function norm(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
}

export function normVat(value) {
  return String(value || '').replace(/\s+/g, '').trim().toUpperCase()
}

export function safeJsonParse(value) {
  if (!value) return {}
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return {}
  }
}

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

export function inferPercipienteCandidate(documentRow) {
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
      iban: Array.isArray(estratti?.pagamenti)
        ? String(estratti.pagamenti.find((p) => p?.iban)?.iban || '').toUpperCase()
        : '',
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

export function classifyPercipienteOutcome({ documentRow, inferred, matchedPercipiente }) {
  const out = {
    outcome: 'generic_supplier',
    reasons: [],
    signals: inferred?.signals || {},
  }

  if (!inferred?.relevant) return out

  if (matchedPercipiente?.id) {
    return {
      outcome: 'confirmed_percipiente',
      reasons: ['Soggetto gia presente in Percipienti.'],
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

export function findExistingPercipiente(existingRows, candidate) {
  const cf = norm(candidate.codice_fiscale)
  const piva = normVat(candidate.partita_iva)
  const name = norm(candidate.ragione_sociale || `${candidate.cognome || ''} ${candidate.nome || ''}`.trim())
  return (existingRows || []).find((row) => {
    if (cf && norm(row.codice_fiscale) === cf) return true
    if (piva && normVat(row.partita_iva) === piva) return true
    return name && norm(row.ragione_sociale || `${row.cognome || ''} ${row.nome || ''}`.trim()) === name
  })
}

