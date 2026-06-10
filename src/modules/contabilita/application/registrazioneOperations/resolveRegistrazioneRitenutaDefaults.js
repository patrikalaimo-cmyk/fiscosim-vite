import { normalizeText } from '../canonical_mapper/utils.js'
import { resolveRegistrazioneRowFormula, resolveRegistrazioneRowRole } from './normalizeRegistrazioneRowFormula.js'

function toAmount(value) {
  const parsed = Number.parseFloat(String(normalizeText(value)).replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : 0
}

function firstMeaningful(...values) {
  return values.find((value) => value !== undefined && value !== null && normalizeText(value) !== '')
}

function firstPositiveAmount(...values) {
  for (const value of values) {
    const parsed = toAmount(value)
    if (parsed > 0) return parsed
  }
  return 0
}

function resolvePercipienteRecord(percipienti = [], draft = {}, header = {}) {
  const rows = Array.isArray(percipienti) ? percipienti : []
  const id = String(draft?.percipienteId || '').trim()
  const codiceFiscale = normalizeText(draft?.codiceFiscale || header?.codiceFiscale || header?.clienteFornitoreCodice || '').toLowerCase()
  const nome = normalizeText(draft?.percipiente || draft?.percipienteNome || header?.soggetto || header?.clienteFornitoreNome || '').toLowerCase()
  if (!rows.length) return null

  return (
    rows.find((item) => {
      const itemId = String(item?.id || '').trim()
      const itemName = normalizeText(item?.ragione_sociale || item?.denominazione || item?.nome || item?.cognome || '').toLowerCase()
      const itemCf = normalizeText(item?.codice_fiscale || item?.cf || '').toLowerCase()
      return (id && itemId === id) || (codiceFiscale && itemCf && itemCf === codiceFiscale) || (nome && itemName && itemName === nome)
    }) || null
  )
}

function rowAmount(row = {}) {
  return toAmount(row.dare || row.importo_dare || row.avere || row.importo_avere || 0)
}

function rowDareAmount(row = {}) {
  return toAmount(row.dare ?? row.importo_dare ?? 0)
}

function isExcludedCompensationRole(role = '') {
  return [
    'iva',
    'soggetto',
    'professionista',
    'percipiente',
    'fornitore',
    'cliente',
    'banca',
    'cassa',
    'ritenuta',
    'erario_ritenute',
  ].includes(role)
}

function resolveImportoCompenso({ documentData = {}, ivaDraft = {}, rows = [], mode = 'documento', aliquotaCassa = 0 } = {}) {
  const rowsList = Array.isArray(rows) ? rows : []
  const taxableBase = firstPositiveAmount(
    documentData?.imponibile,
    documentData?.totaleImponibile,
    ivaDraft?.imponibile,
    ivaDraft?.totaleImponibile
  )
  const rowDetails = rowsList.map((row) => ({
    row,
    role: resolveRegistrazioneRowRole(row),
    formula: resolveRegistrazioneRowFormula(row),
  }))
  const hasTechnicalCompensationBase = rowDetails.some(({ role, formula }) =>
    (formula === 'imponibile' && !isExcludedCompensationRole(role))
    || ['compenso', 'base_ritenuta'].includes(formula)
  )
  const explicitCompenso = rowDetails
    .filter(({ role, formula }) => ['compenso', 'base_ritenuta'].includes(formula) || role === 'compenso')
    .reduce((sum, { row }) => sum + rowAmount(row), 0)

  if (explicitCompenso > 0) {
    return { amount: explicitCompenso, source: 'riga_formula_compenso', resolved: true }
  }

  const imponibileCost = rowDetails
    .filter(({ role, formula, row }) =>
      formula === 'imponibile'
      && rowDareAmount(row) > 0
      && !isExcludedCompensationRole(role)
    )
    .reduce((sum, { row }) => sum + rowDareAmount(row), 0)

  if (imponibileCost > 0) {
    return {
      amount: aliquotaCassa > 0
        ? imponibileCost / (1 + aliquotaCassa / 100)
        : imponibileCost,
      source: aliquotaCassa > 0
        ? 'riga_formula_imponibile_scorporata'
        : 'riga_formula_imponibile',
      resolved: true,
    }
  }

  const economicCost = rowDetails
    .filter(({ role, formula }) => {
      const isVat = role === 'iva' || formula.startsWith('iva_')
      const isCassa = formula === 'cassa_previdenziale' || role === 'cassa'
      return role === 'costo' && !isVat && !isCassa
    })
    .reduce((sum, { row }) => sum + rowAmount(row), 0)

  if (economicCost > 0) {
    const isVatTaxableBase = aliquotaCassa > 0 && taxableBase > 0 && Math.abs(economicCost - taxableBase) <= 0.01
    if (isVatTaxableBase) {
      return {
        amount: taxableBase / (1 + aliquotaCassa / 100),
        source: 'riga_costo_imponibile_iva_scorporato',
        resolved: true,
      }
    }
    return { amount: economicCost, source: 'riga_ruolo_costo', resolved: true }
  }

  if (mode === 'pagamento') {
    return { amount: 0, source: 'non_identificato', resolved: false }
  }

  if (hasTechnicalCompensationBase && taxableBase > 0) {
    const hasCompensoFormula = rowDetails.some(({ formula }) => ['compenso', 'base_ritenuta'].includes(formula))
    return {
      amount: aliquotaCassa > 0 ? taxableBase / (1 + aliquotaCassa / 100) : taxableBase,
      source: hasCompensoFormula ? 'riga_formula_compenso' : 'riga_formula_imponibile',
      resolved: true,
    }
  }

  return { amount: 0, source: 'non_identificato', resolved: false }
}

function resolveAliquota({ currentDraft = {}, percipienteRecord = null, causaleRitenutaDefaults = {}, mode = 'documento' } = {}) {
  const direct = currentDraft.aliquotaRitenuta ?? causaleRitenutaDefaults.aliquotaRitenuta ?? percipienteRecord?.aliquota_ritenuta ?? percipienteRecord?.aliquotaRitenuta
  if (Number.isFinite(Number(direct)) && Number(direct) > 0) return Number(direct)
  const text = normalizeText([
    currentDraft.causaleCu,
    currentDraft.causaleReddituale,
    percipienteRecord?.causale_prevalente,
    percipienteRecord?.causale_reddituale,
    percipienteRecord?.descrizione,
    percipienteRecord?.ragione_sociale,
  ].filter(Boolean).join(' ')).toLowerCase()
  if (text.includes('provvig') || text.includes('commission') || text.includes('agenz') || text.includes('mediaz') || text.includes('rappresent')) return 23
  return mode === 'pagamento' ? 20 : 20
}

function resolveCodiceTributo({ currentDraft = {}, percipienteRecord = null } = {}) {
  return normalizeText(currentDraft.codiceTributo || currentDraft.codice_tributo || percipienteRecord?.codice_tributo || '1040') || '1040'
}

export function resolveRegistrazioneRitenutaDefaults(input = {}) {
  const header = input?.header && typeof input.header === 'object' ? input.header : {}
  const documentData = input?.documentData && typeof input.documentData === 'object' ? input.documentData : {}
  const ivaDraft = input?.ivaDraft && typeof input.ivaDraft === 'object' ? input.ivaDraft : {}
  const partitarioDraft = input?.partitarioDraft && typeof input.partitarioDraft === 'object' ? input.partitarioDraft : {}
  const currentRitenutaDraft = input?.currentRitenutaDraft && typeof input.currentRitenutaDraft === 'object' ? input.currentRitenutaDraft : {}
  const percipienti = Array.isArray(input?.percipienti) ? input.percipienti : []
  const causaleRitenutaDefaults = input?.causaleRitenutaDefaults && typeof input.causaleRitenutaDefaults === 'object' ? input.causaleRitenutaDefaults : {}
  const behavior = input?.behavior && typeof input.behavior === 'object' ? input.behavior : {}
  const rows = Array.isArray(input?.rows) ? input.rows : []
  const modeHint = normalizeText(behavior?.ritenuteMode || behavior?.opRitenute || behavior?.op_ritenute || currentRitenutaDraft.mode || '').toLowerCase()
  const mode = modeHint.includes('pagamento')
    ? 'pagamento'
    : modeHint.includes('documento')
      ? 'documento'
      : modeHint.includes('nessuno') || modeHint.includes('ignora') || modeHint.includes('none')
        ? 'none'
        : behavior?.showRitenute
          ? 'documento'
          : 'none'
  const percipienteRecord = resolvePercipienteRecord(percipienti, currentRitenutaDraft, header)
  const percipienteNome = normalizeText(
    currentRitenutaDraft.percipiente || currentRitenutaDraft.percipienteNome || header.soggetto || header.clienteFornitoreNome || percipienteRecord?.ragione_sociale || percipienteRecord?.denominazione || percipienteRecord?.nome || ''
  )
  const aliquotaCassa = toAmount(
    firstMeaningful(
      currentRitenutaDraft.aliquotaCassa,
      currentRitenutaDraft.aliquota_cassa,
      currentRitenutaDraft.cassaPrevidenziale,
      currentRitenutaDraft.cassa_previdenziale,
      percipienteRecord?.aliquota_cassa,
      percipienteRecord?.cassa_previdenziale,
      percipienteRecord?.metadata?.aliquota_cassa,
      0
    )
  )
  const currentImportoCompenso = toAmount(firstMeaningful(
    currentRitenutaDraft.importoCompenso,
    currentRitenutaDraft.imponibileReddito,
    currentRitenutaDraft.imponibile
  ))
  const manualCompensoOverride = Boolean(currentRitenutaDraft.manualCompensoOverride || currentRitenutaDraft.manual_compenso_override)
  const resolvedCompensation = resolveImportoCompenso({ documentData, ivaDraft, rows, mode, aliquotaCassa })
  const compensationResolution = manualCompensoOverride && currentImportoCompenso > 0
    ? { amount: currentImportoCompenso, source: 'input_ritenuta', resolved: true }
    : resolvedCompensation.resolved
      ? resolvedCompensation
      : currentImportoCompenso > 0
        ? { amount: currentImportoCompenso, source: 'input_ritenuta_fallback', resolved: true }
        : resolvedCompensation
  return {
    mode,
    percipienteRecord,
    percipienteId: normalizeText(currentRitenutaDraft.percipienteId || percipienteRecord?.id || ''),
    percipienteNome,
    codiceFiscale: normalizeText(currentRitenutaDraft.codiceFiscale || percipienteRecord?.codice_fiscale || percipienteRecord?.cf || header.codiceFiscale || ''),
    causaleCu: normalizeText(currentRitenutaDraft.causaleCu || currentRitenutaDraft.causaleReddituale || percipienteRecord?.causale_prevalente || percipienteRecord?.causale_reddituale || causaleRitenutaDefaults.causaleCu || ''),
    causaleReddituale: normalizeText(currentRitenutaDraft.causaleReddituale || currentRitenutaDraft.causaleCu || percipienteRecord?.causale_prevalente || percipienteRecord?.causale_reddituale || causaleRitenutaDefaults.causaleReddituale || ''),
    codiceTributo: resolveCodiceTributo({ currentDraft: currentRitenutaDraft, percipienteRecord }),
    importoCompenso: compensationResolution.amount,
    compensoSource: compensationResolution.source,
    compensoResolved: compensationResolution.resolved,
    quotaNonSoggetta: toAmount(currentRitenutaDraft.quotaNonSoggetta || currentRitenutaDraft.quota_non_soggetta || 0),
    sommeNonSoggette: toAmount(currentRitenutaDraft.sommeNonSoggette || currentRitenutaDraft.somme_non_soggette || 0),
    codiceQuotaNonSoggetta: normalizeText(currentRitenutaDraft.codiceQuotaNonSoggetta || currentRitenutaDraft.codice_quota_non_soggetta || ''),
    codiceSommeNonSoggette: normalizeText(currentRitenutaDraft.codiceSommeNonSoggette || currentRitenutaDraft.codice_somme_non_soggette || ''),
    codiceEsclusione: normalizeText(currentRitenutaDraft.codiceEsclusione || currentRitenutaDraft.codice_esclusione || causaleRitenutaDefaults.codiceEsclusione || ''),
    cassaPrevidenziale: aliquotaCassa,
    aliquotaCassa,
    codiceCassa: normalizeText(
      currentRitenutaDraft.codiceCassa ||
        currentRitenutaDraft.codice_cassa ||
        percipienteRecord?.codice_cassa ||
        percipienteRecord?.metadata?.codice_cassa ||
        ''
    ),
    inclusaCu: currentRitenutaDraft.escludiDaCu == null && currentRitenutaDraft.escludi_da_cu == null
      ? Boolean(percipienteRecord?.soggetto_cu ?? percipienteRecord?.inclusa_cu ?? percipienteRecord?.metadata?.soggetto_cu ?? true)
      : !Boolean(currentRitenutaDraft.escludiDaCu ?? currentRitenutaDraft.escludi_da_cu),
    stato: normalizeText(currentRitenutaDraft.stato || percipienteRecord?.stato_ritenuta_default || percipienteRecord?.metadata?.stato_ritenuta_default || 'predisposto'),
    aliquotaRitenuta: resolveAliquota({ currentDraft: currentRitenutaDraft, percipienteRecord, causaleRitenutaDefaults, mode }),
    dataDocumento: normalizeText(currentRitenutaDraft.dataDocumento || documentData.dataDocumento || header.dataDocumento || header.dataRegistrazione || ''),
    numeroDocumento: normalizeText(currentRitenutaDraft.numeroDocumento || documentData.numeroDocumento || header.numeroDocumento || ''),
    tipoDocumento: normalizeText(currentRitenutaDraft.tipoDocumento || documentData.tipoDocumento || header.tipoDocumento || ''),
    dataPagamento: normalizeText(currentRitenutaDraft.dataPagamento || currentRitenutaDraft.dataPagamentoRitenuta || documentData.dataPagamento || partitarioDraft?.dataDocumento || header.dataDocumento || ''),
  }
}
