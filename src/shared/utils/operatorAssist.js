const MAX_ITEMS = 2

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function isBlank(value) {
  return value == null || String(value).trim() === ''
}

function formatSuggestionLabel(s) {
  return `${s?.codice || '-'} ${s?.descrizione || ''}`.trim()
}

function uniqueById(items) {
  const seen = new Set()
  return (items || []).filter((item) => {
    const id = String(item?.id ?? '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function hasLowConfidence(reliability) {
  if (!reliability) return false
  const score = Number(reliability.score)
  if (Number.isFinite(score)) return score < 65
  return String(reliability.tier || '').toLowerCase() === 'low'
}

function hasClarification(form, type) {
  const list = Array.isArray(form?.operator_clarifications) ? form.operator_clarifications : []
  return list.some((row) => String(row?.type || '') === String(type || ''))
}

function buildDocumentTypeOptions({ doc, tipiDocumento = [] } = {}) {
  const supported = Array.isArray(tipiDocumento) ? tipiDocumento : []
  const typeIds = new Set(supported.map((t) => String(t?.id || '')))

  const options = []
  const add = (id, label, description, patch) => {
    if (!id || !typeIds.has(id)) return
    options.push({ id, label, description, patch })
  }

  const hasF24Signals = Boolean(doc?.ai_raw_response?.sezione_erario?.length || doc?.ai_raw_response?.sezione_inps?.length || doc?.cf_f24)
  const hasAvvisoSignals = Boolean(doc?.ai_raw_response?.tipo_avviso || doc?.ai_raw_response?.numero_atto)
  const tipoDoc = normalizeText(doc?.tipo_documento || doc?.ai_raw_response?.tipo_documento)
  const suggestPassiva = !tipoDoc || tipoDoc.includes('fattura_passiva') || tipoDoc.includes('altro')

  if (hasF24Signals) add('f24', 'F24', 'Modello di versamento', { tipo_documento: 'f24' })
  if (hasAvvisoSignals) add('avviso_ade', 'Avviso ADE', 'Cartella, avviso bonario o comunicazione', { tipo_documento: 'avviso_ade' })
  if (suggestPassiva) add('fattura_passiva', 'Fattura passiva', 'Acquisto / costo / fornitore', { tipo_documento: 'fattura_passiva' })
  if (typeIds.has('fattura_attiva')) add('fattura_attiva', 'Fattura attiva', 'Vendita / ricavo / cliente', { tipo_documento: 'fattura_attiva' })
  if (typeIds.has('cu') && (doc?.ai_raw_response?.codice_fiscale || doc?.ai_raw_response?.contribuente)) {
    add('cu', 'CU', 'Certificazione unica', { tipo_documento: 'cu' })
  }
  add('altro', 'Altro', 'La classifico manualmente', { tipo_documento: 'altro' })

  const deduped = uniqueById(options)
  const alt = deduped.find((o) => o.id === 'altro') || null
  const core = deduped.filter((o) => o.id !== 'altro').slice(0, 3)
  return alt ? [...core, alt] : core.slice(0, 4)
}

function buildAccountOptions({
  contoSuggestions = [],
  historicalContoSuggestions = [],
  accountFieldName = 'conto_id',
  accountSearchFieldName = 'conto_search',
  aiSourceFieldName = 'conto_da_ai',
  historicalSourceFieldName = 'conto_da_storico',
} = {}) {
  const merged = [
    ...uniqueById(contoSuggestions || []).map((s) => ({
      id: String(s.id),
      label: formatSuggestionLabel(s),
      description: `Suggerimento AI ${Number.isFinite(Number(s.score)) ? `· ${Math.round(Number(s.score))}%` : ''}`.trim(),
      patch: {
        [accountFieldName]: s.id,
        ...(accountSearchFieldName ? { [accountSearchFieldName]: formatSuggestionLabel(s) } : {}),
        [aiSourceFieldName]: true,
        [historicalSourceFieldName]: false,
      },
    })),
    ...uniqueById(historicalContoSuggestions || []).map((s) => ({
      id: `hist-${String(s.id)}`,
      label: formatSuggestionLabel(s),
      description: `Storico confermato ${Number.isFinite(Number(s.score)) ? `· ${Math.round(Number(s.score))}%` : ''}`.trim(),
      patch: {
        [accountFieldName]: s.id,
        ...(accountSearchFieldName ? { [accountSearchFieldName]: formatSuggestionLabel(s) } : {}),
        [aiSourceFieldName]: false,
        [historicalSourceFieldName]: true,
      },
    })),
  ]

  const filtered = uniqueById(merged).slice(0, 3)
  filtered.push({
    id: 'manual_blank',
    label: 'Lascia vuoto',
    description: 'Compilo il conto a mano in seguito',
    patch: {
      [accountFieldName]: null,
      ...(accountSearchFieldName ? { [accountSearchFieldName]: '' } : {}),
      [aiSourceFieldName]: false,
      [historicalSourceFieldName]: false,
    },
  })
  return filtered.slice(0, 4)
}

function buildVatOptions({ causaliIva = [], form = {} } = {}) {
  const aliquotaRaw =
    form?.aliquota_iva ??
    form?.riepilogo_iva?.[0]?.aliquota ??
    form?.iva_rows?.[0]?.aliquota ??
    null
  const aliq = Number.isFinite(Number(aliquotaRaw))
    ? Math.round(Number(aliquotaRaw))
    : Math.round(parseFloat(String(aliquotaRaw ?? '0').replace(/[%\s]/g, '').replace(',', '.')) || 0)

  const sorted = [...(causaliIva || [])]
    .filter((c) => c?.attivo !== false)
    .sort((a, b) => {
      const aa = Math.round(Number(a?.aliquota || 0))
      const bb = Math.round(Number(b?.aliquota || 0))
      const da = aa === aliq ? 0 : 1
      const db = bb === aliq ? 0 : 1
      if (da !== db) return da - db
      return String(a?.codice || '').localeCompare(String(b?.codice || ''), 'it')
    })

  return uniqueById(
    sorted.slice(0, 4).map((c) => ({
      id: String(c.id),
      label: `${Number(c.aliquota || 0)}% · ${c.codice || 'IVA'}`,
      description: c.descrizione || 'Causale IVA suggerita',
      patch: {
        causale_iva_id: String(c.id),
      },
    }))
  )
}

function buildParcellaConfirmationItem({ doc, form, reliability } = {}) {
  if (hasClarification(form, 'uncertain_parcella_confirmation')) return null
  if (!hasLowConfidence(reliability)) return null

  const rawText = normalizeText(
    [
      doc?.tipo_documento,
      doc?.ai_raw_response?.tipo_documento,
      doc?.soggetto_denominazione,
      doc?.ai_raw_response?.cedente_denom,
      doc?.ai_raw_response?.xml_content,
      doc?.ai_raw_response?.causale,
    ]
      .filter(Boolean)
      .join(' ')
  )

  const looksProfessional =
    /(parcella|onorario|compenso|prestazione|consulenza|ritenuta|cassa|inps|enasarco)/i.test(rawText) ||
    normalizeText(doc?.tipo_documento || doc?.ai_raw_response?.tipo_documento).includes('td03') ||
    normalizeText(doc?.tipo_documento || doc?.ai_raw_response?.tipo_documento).includes('td06')

  if (!looksProfessional) return null

  return {
    id: 'uncertain_parcella_confirmation',
    type: 'uncertain_parcella_confirmation',
    title: 'Documento professionale da confermare',
    message: 'Conferma se il documento va trattato come parcella per attivare il ramo corretto.',
    reason: 'Sono presenti segnali professionali, ma non abbastanza forti per decidere in autonomia.',
    options: [
      {
        id: 'parcella_yes',
        label: 'Sì, è parcella',
        description: 'Attiva il flusso professionale e le regole dedicate.',
        patch: { parcella_confirmation: true },
      },
      {
        id: 'parcella_no',
        label: 'No, fattura ordinaria',
        description: 'Mantieni la registrazione standard.',
        patch: { parcella_confirmation: false },
      },
    ],
    manualPlaceholder: 'Nota libera sulla classificazione',
    manualLabel: 'Manuale',
  }
}

export function buildOperatorAssistItems({
  doc,
  form,
  reliability,
  tipiDocumento = [],
  contoSuggestions = [],
  historicalContoSuggestions = [],
  causaliIva = [],
  includeDocumentType = false,
  includeAccountMapping = false,
  includeVatCausale = false,
  includeParcellaConfirmation = false,
  accountFieldName = 'conto_id',
  accountSearchFieldName = 'conto_search',
  aiSourceFieldName = 'conto_da_ai',
  historicalSourceFieldName = 'conto_da_storico',
  extraItems = [],
} = {}) {
  if (!hasLowConfidence(reliability)) return []

  const items = Array.isArray(extraItems) ? extraItems.filter(Boolean) : []

  if (includeParcellaConfirmation) {
    const parcellaItem = buildParcellaConfirmationItem({ doc, form, reliability })
    if (parcellaItem) items.push(parcellaItem)
  }

  if (includeDocumentType) {
    if (!hasClarification(form, 'uncertain_document_type')) {
      const currentType = normalizeText(form?.tipo_documento || doc?.tipo_documento || doc?.ai_raw_response?.tipo_documento)
      const typeLooksUncertain =
        isBlank(currentType) ||
        currentType === 'altro' ||
        currentType.includes('manuale') ||
        currentType.includes('unknown') ||
        hasLowConfidence(reliability)

      if (typeLooksUncertain) {
        const options = buildDocumentTypeOptions({ doc, tipiDocumento })
        if (options.length > 0) {
          items.push({
            id: 'uncertain_document_type',
            type: 'uncertain_document_type',
            title: 'Tipo documento non chiaro',
            message: 'Seleziona il tipo corretto per continuare.',
            reason: 'Confidenza parsing bassa o tipo non riconosciuto.',
            options,
            manualPlaceholder: 'Scrivi il tipo documento',
            manualLabel: 'Altro / manuale',
          })
        }
      }
    }
  }

  if (includeAccountMapping) {
    if (!hasClarification(form, 'uncertain_account_mapping')) {
      const hasAccount = !isBlank(form?.[accountFieldName])
      const options = buildAccountOptions({
        contoSuggestions,
        historicalContoSuggestions,
        accountFieldName,
        accountSearchFieldName,
        aiSourceFieldName,
        historicalSourceFieldName,
      })
      if (!hasAccount && options.length > 0) {
        items.push({
          id: 'uncertain_account_mapping',
          type: 'uncertain_account_mapping',
          title: 'Conto non risolto',
          message: 'Scegli il conto piu probabile oppure lascialo vuoto per la scelta manuale.',
          reason: "L'AI non ha abbastanza evidenza per fissare un conto.",
          options,
          manualPlaceholder: 'Conto libero / nota',
          manualLabel: 'Manuale',
        })
      }
    }
  }

  if (includeVatCausale) {
    if (!hasClarification(form, 'uncertain_vat_causale')) {
      const hasVat = Boolean(form?.causale_iva_id || doc?.causale_iva_id)
      const options = buildVatOptions({ causaliIva, form })
      if (!hasVat && options.length > 0) {
        items.push({
          id: 'uncertain_vat_causale',
          type: 'uncertain_vat_causale',
          title: 'Causale IVA non chiara',
          message: 'Seleziona la causale IVA piu probabile per riprendere il flusso.',
          reason: 'La causale IVA non risulta determinabile con sufficiente affidabilita.',
          options,
          manualPlaceholder: 'Causale IVA manuale',
          manualLabel: 'Manuale',
        })
      }
    }
  }

  return items.slice(0, MAX_ITEMS)
}

export function appendOperatorClarification(existing, item, option, manualText = '', context = {}) {
  const current = Array.isArray(existing) ? existing : []
  const next = {
    id: `${item?.type || 'clar'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: item?.type || 'unknown',
    title: item?.title || '',
    selected: option?.id || 'manual',
    selected_label: option?.label || manualText || 'Manuale',
    reason: item?.reason || '',
    options: Array.isArray(item?.options) ? item.options.map((o) => ({ id: o.id, label: o.label })) : [],
    manual_text: manualText || '',
    at: new Date().toISOString(),
    issue_type: context.issue_type || item?.type || 'unknown',
    shown_options: Array.isArray(context.shown_options)
      ? context.shown_options
      : Array.isArray(item?.options)
        ? item.options.map((o) => ({ id: o.id, label: o.label }))
        : [],
    selected_answer: context.selected_answer || option?.label || manualText || 'Manuale',
    rerun_result: context.rerun_result || 'continue',
    engine_source: context.engine_source || null,
  }
  return [...current, next]
}
