import { normalizeText } from '../../application/canonical_mapper/utils.js'
import { normalizePolicyKey, pickPolicyText } from './causalePolicyUtils.js'

const BLANK_OPTION = { value: '', label: '-- Non specificato --' }

const MOVIMENTO_GENERALE_SIMPLE_OPTIONS = [
  { value: 'Generale', label: 'Generale', aliases: ['movimento di generale', 'movimento generale', 'generale'] },
  {
    value: 'Giroconto',
    label: 'Giroconto',
    aliases: ['giroconto', 'giro conto', 'trasferimento tra conti', 'riallineamento liquidita'],
  },
  {
    value: 'Costo/Ricavo diretto',
    label: 'Costo/Ricavo diretto',
    aliases: ['costo diretto', 'ricavo diretto', 'costo ricavo diretto', 'costo/ricavo diretto', 'senza partitario'],
  },
]

const MOVIMENTO_GENERALE_CHIUDE_OPTIONS = [
  { value: 'Incasso', label: 'Incasso', aliases: ['incasso', 'incasso cliente ordinario', 'incasso cliente'] },
  { value: 'Pagamento', label: 'Pagamento', aliases: ['pagamento', 'pagamento fornitore ordinario', 'pagamento fornitore'] },
]

const OPERAZIONE_GROUPS = {
  movimento_generale: MOVIMENTO_GENERALE_SIMPLE_OPTIONS,
  movimento_generale_ignora: MOVIMENTO_GENERALE_SIMPLE_OPTIONS,
  movimento_generale_chiude: MOVIMENTO_GENERALE_CHIUDE_OPTIONS,
  doc_iva_normale: [
    { value: 'Fattura attiva', label: 'Fattura attiva', aliases: ['fattura attiva', 'fattura cliente'] },
    { value: 'Fattura passiva', label: 'Fattura passiva', aliases: ['fattura passiva', 'fattura fornitore'] },
    { value: 'Nota credito attiva', label: 'Nota credito attiva', aliases: ['nota credito attiva', 'nota di credito attiva', 'nc attiva'] },
    { value: 'Nota credito passiva', label: 'Nota credito passiva', aliases: ['nota credito passiva', 'nota di credito passiva', 'nc passiva'] },
  ],
  doc_iva_esig_differita: [
    { value: 'Fattura attiva IVA per cassa', label: 'Fattura attiva IVA per cassa', aliases: ['fattura attiva iva per cassa', 'fattura attiva esigibilita differita'] },
    { value: 'Fattura passiva IVA per cassa', label: 'Fattura passiva IVA per cassa', aliases: ['fattura passiva iva per cassa', 'fattura passiva esigibilita differita'] },
  ],
  pag_inc_iva_esig_diff: [
    { value: 'Incasso IVA per cassa', label: 'Incasso IVA per cassa', aliases: ['incasso iva per cassa', 'incasso iva esigibile differita', 'incasso iva esigibilita differita'] },
    { value: 'Pagamento IVA per cassa', label: 'Pagamento IVA per cassa', aliases: ['pagamento iva per cassa', 'pagamento iva esigibile differita', 'pagamento iva esigibilita differita'] },
  ],
  autofattura: [
    { value: 'Autofattura', label: 'Autofattura', aliases: ['autofattura'] },
    { value: 'Reverse charge', label: 'Reverse charge', aliases: ['reverse charge', 'rc'] },
    { value: 'Integrazione documento', label: 'Integrazione documento', aliases: ['integrazione documento', 'integrazione documento iva', 'integrazione fattura'] },
  ],
  doc_corrispettivo: [
    { value: 'Corrispettivo', label: 'Corrispettivo', aliases: ['corrispettivo'] },
  ],
  doc_iva_acq_cee: [
    { value: 'Acquisto CEE beni', label: 'Acquisto CEE beni', aliases: ['acquisto cee beni', 'cee beni'] },
    { value: 'Acquisto CEE servizi', label: 'Acquisto CEE servizi', aliases: ['acquisto cee servizi', 'cee servizi'] },
  ],
  movimento_sola_iva: [
    { value: 'Movimento sola IVA', label: 'Movimento sola IVA', aliases: ['movimento sola iva', 'sola iva', 'solo iva'] },
  ],
}

const TYPE_CAUSALE_GROUPS = [
  { group: 'movimento_generale', matches: ['movimentodigenerale', 'movimentogenerale', 'generale'] },
  { group: 'doc_iva_normale', matches: ['docivanormale', 'documentoiva', 'fatturadocumentoiva'] },
  { group: 'doc_iva_esig_differita', matches: ['docivaesigdifferita', 'documentoivaesigdifferita', 'esigibilitadifferita'] },
  { group: 'pag_inc_iva_esig_diff', matches: ['pagincivaesigdiff', 'pagamentoincassivaesigdiff', 'pagamentoincassoivaesigdifferita', 'pagamentoincassivaesigibilitadifferita'] },
  { group: 'autofattura', matches: ['autofattura'] },
  { group: 'doc_corrispettivo', matches: ['doccorrispettivo', 'corrispettivo'] },
  { group: 'doc_iva_acq_cee', matches: ['docivaacqcee', 'documentoivaacqcee', 'acquistocee'] },
  { group: 'movimento_sola_iva', matches: ['movimentosolaiva', 'solaiva', 'soloiva'] },
]

function resolveOperazioneGroupKey(tipoCausale = '', gestionePartite = '') {
  const normalized = normalizePolicyKey(tipoCausale)
  const found = TYPE_CAUSALE_GROUPS.find(({ matches }) => matches.some((match) => normalized.includes(match)))
  const group = found?.group || 'movimento_generale'
  if (group !== 'movimento_generale') return group
  const normalizedPartite = normalizePolicyKey(gestionePartite)
  return normalizedPartite.includes('chiud') ? 'movimento_generale_chiude' : 'movimento_generale_ignora'
}

function getGroupOptions(groupKey = 'movimento_generale') {
  return OPERAZIONE_GROUPS[groupKey] || OPERAZIONE_GROUPS.movimento_generale
}

function getAllGroupOptions() {
  return Object.values(OPERAZIONE_GROUPS).flat()
}

function buildLookupLabel(option) {
  return normalizePolicyKey(option?.value || option?.label || '')
}

function matchesOption(option, candidate = '') {
  const normalizedCandidate = normalizePolicyKey(candidate)
  if (!normalizedCandidate) return false
  if (normalizedCandidate === buildLookupLabel(option)) return true
  return Array.isArray(option?.aliases) && option.aliases.some((alias) => normalizePolicyKey(alias) === normalizedCandidate)
}

function isKnownOperazioneGestitaValue(value = '') {
  const normalized = normalizeText(value)
  if (!normalized) return false
  return getAllGroupOptions().some((option) => matchesOption(option, normalized))
}

function inferLegacyDirection(source = {}) {
  const code = normalizePolicyKey(pickPolicyText(source, ['codice', 'code', 'sigla', 'id']))
  const descr = normalizePolicyKey(pickPolicyText(source, ['descrizione', 'description', 'nome', 'label']))
  const blob = `${code} ${descr}`

  if (blob.includes('nota') && blob.includes('credito')) {
    if (blob.includes('fornit') || code.startsWith('ff')) return 'Nota credito passiva'
    if (blob.includes('client') || code.startsWith('fc')) return 'Nota credito attiva'
  }

  if (blob.includes('fattura')) {
    if (blob.includes('fornit') || code.startsWith('ff')) return 'Fattura passiva'
    if (blob.includes('client') || code.startsWith('fc')) return 'Fattura attiva'
  }

  if (blob.includes('incasso')) return 'Incasso'
  if (blob.includes('pagamento') || blob.includes('paga')) return 'Pagamento'
  if (blob.includes('corrispettiv')) return 'Corrispettivo'
  if (blob.includes('autofatt')) return 'Autofattura'
  if (blob.includes('reverse')) return 'Reverse charge'
  if (blob.includes('integraz')) return 'Integrazione documento'
  if (blob.includes('cee') || blob.includes('intra')) {
    if (blob.includes('serviz')) return 'Acquisto CEE servizi'
    return 'Acquisto CEE beni'
  }
  if (blob.includes('solaiva') || blob.includes('soloiva')) return 'Movimento sola IVA'

  return ''
}

function mapLegacyToGroupValue(groupKey, legacy = '') {
  const normalizedLegacy = normalizePolicyKey(legacy)
  if (!normalizedLegacy) return ''

  if (groupKey === 'doc_iva_esig_differita') {
    if (normalizedLegacy === normalizePolicyKey('Fattura attiva')) return 'Fattura attiva IVA per cassa'
    if (normalizedLegacy === normalizePolicyKey('Fattura passiva')) return 'Fattura passiva IVA per cassa'
    return ''
  }

  if (groupKey === 'pag_inc_iva_esig_diff') {
    if (normalizedLegacy === normalizePolicyKey('Incasso')) return 'Incasso IVA per cassa'
    if (normalizedLegacy === normalizePolicyKey('Pagamento')) return 'Pagamento IVA per cassa'
    return ''
  }

  if (groupKey === 'doc_iva_normale') {
    if (normalizedLegacy === normalizePolicyKey('Fattura attiva')) return 'Fattura attiva'
    if (normalizedLegacy === normalizePolicyKey('Fattura passiva')) return 'Fattura passiva'
    if (normalizedLegacy === normalizePolicyKey('Nota credito attiva')) return 'Nota credito attiva'
    if (normalizedLegacy === normalizePolicyKey('Nota credito passiva')) return 'Nota credito passiva'
    return ''
  }

  if (groupKey === 'autofattura') {
    if (normalizedLegacy === normalizePolicyKey('Autofattura')) return 'Autofattura'
    if (normalizedLegacy === normalizePolicyKey('Reverse charge')) return 'Reverse charge'
    if (normalizedLegacy === normalizePolicyKey('Integrazione documento')) return 'Integrazione documento'
    return ''
  }

  if (groupKey === 'doc_corrispettivo') {
    return normalizedLegacy === normalizePolicyKey('Corrispettivo') ? 'Corrispettivo' : ''
  }

  if (groupKey === 'doc_iva_acq_cee') {
    if (normalizedLegacy === normalizePolicyKey('Acquisto CEE beni')) return 'Acquisto CEE beni'
    if (normalizedLegacy === normalizePolicyKey('Acquisto CEE servizi')) return 'Acquisto CEE servizi'
    return ''
  }

  if (groupKey === 'movimento_sola_iva') {
    return normalizedLegacy === normalizePolicyKey('Movimento sola IVA') ? 'Movimento sola IVA' : ''
  }

  if (groupKey === 'movimento_generale' || groupKey === 'movimento_generale_ignora') {
    if (normalizedLegacy === normalizePolicyKey('Generale')) return 'Generale'
    if (normalizedLegacy.includes('giroconto')) return 'Giroconto'
    if (normalizedLegacy.includes('costo') || normalizedLegacy.includes('ricavo')) return 'Costo/Ricavo diretto'
    if (normalizedLegacy === normalizePolicyKey('Costo/Ricavo diretto')) return 'Costo/Ricavo diretto'
    return ''
  }

  if (groupKey === 'movimento_generale_chiude') {
    if (normalizedLegacy === normalizePolicyKey('Incasso')) return 'Incasso'
    if (normalizedLegacy === normalizePolicyKey('Pagamento')) return 'Pagamento'
    if (normalizedLegacy.includes('incasso')) return 'Incasso'
    if (normalizedLegacy.includes('pagamento')) return 'Pagamento'
    return ''
  }

  return ''
}

export function getCausaleOperazioneGestitaOptions(tipoCausale = '', gestionePartite = '') {
  const groupKey = resolveOperazioneGroupKey(tipoCausale, gestionePartite)
  return [BLANK_OPTION, ...getGroupOptions(groupKey).map(({ value, label }) => ({ value, label }))]
}

export function normalizeCausaleOperazioneGestita(tipoCausale = '', gestionePartite = '', value = '', source = {}) {
  const text = normalizeText(value)
  if (!text) return ''

  const groupKey = resolveOperazioneGroupKey(tipoCausale, gestionePartite)
  const groupOptions = getGroupOptions(groupKey)
  const match = groupOptions.find((option) => matchesOption(option, text))
  if (match) return match.value

  const mappedLegacy = mapLegacyToGroupValue(groupKey, text)
  if (mappedLegacy) return mappedLegacy

  return isKnownOperazioneGestitaValue(text) ? '' : text
}

export function buildCausaleOperazioneGestitaPolicy(tipoCausale = '', gestionePartite = '', tipoDocumento = '', source = {}) {
  const operazioneGestita = normalizeCausaleOperazioneGestita(tipoCausale, gestionePartite, tipoDocumento, source)
  const groupKey = resolveOperazioneGroupKey(tipoCausale, gestionePartite)
  const normalized = normalizePolicyKey(operazioneGestita)

  const isFatturaAttiva = normalized === normalizePolicyKey('Fattura attiva')
  const isFatturaPassiva = normalized === normalizePolicyKey('Fattura passiva')
  const isNotaCreditoAttiva = normalized === normalizePolicyKey('Nota credito attiva')
  const isNotaCreditoPassiva = normalized === normalizePolicyKey('Nota credito passiva')
  const liqTipo = String(source?.liquidazione_tipo || source?.liquidazioneTipo || '').trim().toLowerCase()
  const docDirezione = String(source?.documento_direzione || source?.documentoDirezione || source?.direzione || '').trim().toLowerCase()

  const isIncasso =
    normalized === normalizePolicyKey('Incasso') ||
    normalized === normalizePolicyKey('Incasso IVA per cassa') ||
    liqTipo === 'incasso' ||
    docDirezione === 'entrata' ||
    docDirezione === 'attivo'

  const isPagamento =
    normalized === normalizePolicyKey('Pagamento') ||
    normalized === normalizePolicyKey('Pagamento IVA per cassa') ||
    liqTipo === 'pagamento' ||
    docDirezione === 'uscita' ||
    docDirezione === 'passivo'
  const isAutofattura = [
    'autofattura',
    'reversecharge',
    'integrazionedocumento',
  ].includes(normalized)
  const isCorrispettivo = normalized === normalizePolicyKey('Corrispettivo')
  const isCee = normalized === normalizePolicyKey('Acquisto CEE beni') || normalized === normalizePolicyKey('Acquisto CEE servizi')
  const isMovimentoSolaIva = normalized === normalizePolicyKey('Movimento sola IVA')
  const isMovimentoGeneraleChiude = groupKey === 'movimento_generale_chiude'
  const isPagamentoIncasso =
    groupKey === 'pag_inc_iva_esig_diff' ||
    isMovimentoGeneraleChiude ||
    normalized === normalizePolicyKey('Incasso IVA per cassa') ||
    normalized === normalizePolicyKey('Pagamento IVA per cassa')
  const isDocumentoIva =
    groupKey === 'doc_iva_normale' ||
    groupKey === 'doc_iva_esig_differita' ||
    groupKey === 'autofattura' ||
    groupKey === 'doc_corrispettivo' ||
    groupKey === 'doc_iva_acq_cee' ||
    groupKey === 'movimento_sola_iva' ||
    isAutofattura ||
    isCorrispettivo ||
    isCee ||
    isMovimentoSolaIva

  return {
    operazioneGestita,
    operazioneGestitaGroup: groupKey,
    isMovimentoGenerale: groupKey === 'movimento_generale' || groupKey === 'movimento_generale_ignora' || isMovimentoGeneraleChiude,
    isMovimentoGeneraleIgnora: groupKey === 'movimento_generale_ignora' || groupKey === 'movimento_generale',
    isMovimentoGeneraleChiude,
    isDocumentoIva,
    isPagamentoIncasso,
    isFatturaAttiva,
    isFatturaPassiva,
    isNotaCreditoAttiva,
    isNotaCreditoPassiva,
    isIncasso,
    isPagamento,
    isAutofattura,
    isReverseCharge: normalized === normalizePolicyKey('Reverse charge'),
    isIntegrazioneDocumento: normalized === normalizePolicyKey('Integrazione documento'),
    isCorrispettivo,
    isAcquistoCeeBeni: normalized === normalizePolicyKey('Acquisto CEE beni'),
    isAcquistoCeeServizi: normalized === normalizePolicyKey('Acquisto CEE servizi'),
    isCee,
    isMovimentoSolaIva,
    isIvaDifferitaDocumento: groupKey === 'doc_iva_esig_differita',
    isIvaDifferitaPagamento: groupKey === 'pag_inc_iva_esig_diff',
  }
}
