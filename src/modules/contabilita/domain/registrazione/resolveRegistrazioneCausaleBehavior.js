import { resolveRegistrazioneCausaleLabel } from '../../application/registrazioneOperations/resolveRegistrazioneCausali.js'
import { buildCausaleContabilePolicy } from '../causali/buildCausaleContabilePolicy.js'
import { resolveRegistrazioneCausaleConfig } from './registrazioneCausaleConfig.js'

const SIMPLE_TABS = ['rows']

function buildRawFields(policy = {}) {
  return {
    typeCausale: policy.typeCausale || '',
    operazionePartite: policy.operazionePartite || '',
    gestionePartite: policy.gestionePartite || '',
    opRitenute: policy.opRitenute || '',
    tipoDocumento: policy.tipoDocumento || '',
    dataDocumento: policy.dataDocumento || '',
    numeroDocumento: policy.numeroDocumento || '',
  }
}

function normalizeActiveTabs(value) {
  return Array.from(new Set(['rows', ...(Array.isArray(value) ? value : []).filter(Boolean)]))
}

function buildBehavior(base = {}) {
  const activeTabs = normalizeActiveTabs(base.activeTabs || SIMPLE_TABS)
  const requiredFields = Array.from(
    new Set(['dataRegistrazione', 'causaleContabile', ...(Array.isArray(base.requiredFields) ? base.requiredFields : [])])
  )

  return {
    supportsAutoResidual: true,
    supportsPartitePanel: Boolean(base.supportsPartitePanel ?? base.showPartitario),
    supportsDefaultRows: true,
    warnings: [],
    reasons: [],
    ...base,
    activeTabs,
    requiredFields,
    warnings: Array.from(new Set(Array.isArray(base.warnings) ? base.warnings : [])),
    reasons: Array.from(new Set(Array.isArray(base.reasons) ? base.reasons : [])),
  }
}

function buildSimpleBehavior({ code, label, warnings = [], reasons = [] } = {}) {
  return buildBehavior({
    code: code || 'DEFAULT',
    label: label || 'Scrittura semplice',
    family: 'movimento_generale',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: false,
    showRitenute: false,
    activeTabs: SIMPLE_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    documentMode: 'nessuno',
    ivaMode: 'nessuna',
    partitarioMode: 'nessuno',
    ritenuteMode: 'nessuno',
    requiresSoggetto: false,
    requiresDocumentDate: false,
    requiresDocumentNumber: false,
    requiresDocumentTotal: false,
    requiresIvaData: false,
    requiresRitenuteData: false,
    warnings,
    reasons,
  })
}

function buildDocumentBehavior({
  code,
  label,
  family,
  documentMode,
  ivaMode,
  showPartitario = true,
  showRitenute = false,
  activeTabs = ['rows', 'iva'],
  requiredFields = ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
  warnings = [],
  reasons = [],
} = {}) {
  const tabs = ['rows', ...activeTabs.filter(Boolean)]
  if (showPartitario) tabs.push('partitario')
  if (showRitenute) tabs.push('ritenute')

  return buildBehavior({
    code: code || 'DEFAULT',
    label: label || 'Scrittura documento',
    family: family || 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario,
    showRitenute,
    activeTabs: tabs,
    requiredFields,
    documentMode,
    ivaMode,
    partitarioMode: showPartitario ? 'apertura' : 'nessuno',
    ritenuteMode: showRitenute ? 'documento' : 'nessuno',
    requiresSoggetto: true,
    requiresDocumentDate: true,
    requiresDocumentNumber: true,
    requiresDocumentTotal: true,
    requiresIvaData: true,
    requiresRitenuteData: showRitenute,
    warnings,
    reasons,
  })
}

function buildPartiteBehavior({
  code,
  label,
  family,
  partitarioMode,
  showDocumentPanel = false,
  showIvaPanel = false,
  showIvaPerCassaPreview = false,
  showRitenute = false,
  activeTabs = ['rows', 'partitario'],
  requiredFields = ['dataRegistrazione', 'causaleContabile'],
  warnings = [],
  reasons = [],
} = {}) {
  const tabs = ['rows', ...activeTabs.filter(Boolean)]
  if (showIvaPanel) tabs.push('iva')
  if (showRitenute) tabs.push('ritenute')

  return buildBehavior({
    code: code || 'DEFAULT',
    label: label || 'Scrittura partite',
    family: family || 'partitario',
    showDocumentPanel,
    showIvaPanel,
    showIvaPerCassaPreview,
    showPartitario: true,
    showRitenute,
    activeTabs: tabs,
    requiredFields,
    documentMode: showDocumentPanel ? 'documento_generico' : 'nessuno',
    ivaMode: showIvaPanel ? 'pagamento_iva_differita' : 'nessuna',
    partitarioMode,
    ritenuteMode: showRitenute ? 'pagamento' : 'nessuno',
    requiresSoggetto: true,
    requiresDocumentDate: showDocumentPanel,
    requiresDocumentNumber: showDocumentPanel,
    requiresDocumentTotal: showDocumentPanel,
    requiresIvaData: showIvaPanel,
    requiresRitenuteData: showRitenute,
    warnings,
    reasons,
  })
}

function buildRitenuteBehavior({
  code,
  label,
  family,
  ritenuteMode,
  showDocumentPanel = false,
  showIvaPanel = false,
  showPartitario = true,
  activeTabs = ['rows', 'partitario', 'ritenute'],
  requiredFields = ['dataRegistrazione', 'causaleContabile'],
  warnings = [],
  reasons = [],
} = {}) {
  const tabs = ['rows', ...activeTabs.filter(Boolean)]
  if (showIvaPanel) tabs.push('iva')

  return buildBehavior({
    code: code || 'DEFAULT',
    label: label || 'Scrittura ritenute',
    family: family || 'ritenute',
    showDocumentPanel,
    showIvaPanel,
    showPartitario,
    showRitenute: true,
    activeTabs: tabs,
    requiredFields,
    documentMode: showDocumentPanel ? 'documento_ritenute' : 'nessuno',
    ivaMode: showIvaPanel ? 'differita' : 'nessuna',
    partitarioMode: showPartitario ? 'apertura_ritenute' : 'nessuno',
    ritenuteMode,
    requiresSoggetto: showDocumentPanel || showPartitario,
    requiresDocumentDate: false,
    requiresDocumentNumber: false,
    requiresDocumentTotal: false,
    requiresIvaData: showIvaPanel,
    requiresRitenuteData: true,
    warnings,
    reasons,
  })
}

function determineFromPolicy(policy = {}, code, label) {
  const rawFields = buildRawFields(policy)
  const warnings = []
  const reasons = []
  if (!policy.hasConfiguredFields) return null

  if (policy.isPagamentoIncasso) {
    reasons.push('Classificata da policy come pagamento/incasso.')
    return {
      ...buildPartiteBehavior({
        code,
        label,
        family: policy.ivaPerCassa ? 'partite_iva_differita' : 'partitario',
        partitarioMode: policy.gestionePartitario === 'chiusura' ? 'chiusura' : 'apertura',
        showDocumentPanel: false,
        showIvaPanel: false,
        showIvaPerCassaPreview: Boolean(policy.ivaPerCassa),
        showRitenute: policy.gestioneRitenute === 'pagamento',
        activeTabs: ['rows', 'partitario', ...(policy.ivaPerCassa ? ['ivaPerCassaPreview'] : []), ...(policy.gestioneRitenute === 'pagamento' ? ['ritenute'] : [])],
        warnings,
        reasons,
      }),
      ...rawFields,
    }
  }

  if (policy.isDocumentoIva) {
    const ivaMode = policy.isCee
      ? 'cee'
      : policy.ivaPerCassa
        ? 'differita'
        : policy.isAutofattura
          ? 'autofattura'
          : policy.isSolaIva
            ? 'sola_iva'
            : policy.isCorrispettivo
              ? 'corrispettivo'
              : 'normale'

    const documentMode = policy.isCee
      ? 'documento_iva_cee'
      : policy.ivaPerCassa
        ? 'documento_iva_differita'
        : policy.isAutofattura
          ? 'autofattura'
          : policy.isSolaIva
            ? 'sola_iva'
            : policy.isCorrispettivo
              ? 'corrispettivo'
              : 'documento_iva'

    const showPartitario = policy.gestionePartitario !== 'nessuno'
    const showRitenute = policy.gestioneRitenute !== 'nessuna'
    reasons.push(`Classificata da policy funzionale ${policy.typeCausale || 'documento IVA'}.`)
    if (policy.partiteOpen) reasons.push('Operazione partite impostata su apertura.')
    if (policy.partiteClose) reasons.push('Operazione partite impostata su chiusura.')
    if (policy.ivaPerCassa) reasons.push('Flag IVA differita / IVA per cassa rilevato.')
    if (policy.isCee) reasons.push('Flag CEE rilevato.')

    return {
      ...buildDocumentBehavior({
        code,
        label,
        family: policy.isCorrispettivo ? 'corrispettivi' : 'documento_iva_partitario',
        documentMode,
        ivaMode,
        showPartitario,
        showRitenute,
        activeTabs: ['rows', 'iva'],
        requiredFields: [
          'dataRegistrazione',
          'causaleContabile',
          ...(policy.richiedeDataDocumento ? ['dataDocumento'] : []),
          ...(policy.richiedeNumeroDocumento ? ['numeroDocumento'] : []),
        ],
        warnings,
        reasons,
      }),
      requiresDocumentDate: policy.richiedeDataDocumento,
      requiresDocumentNumber: policy.richiedeNumeroDocumento,
      ...rawFields,
    }
  }

  if (policy.isMovimentoGenerico && policy.gestionePartitario === 'chiusura') {
    reasons.push('Classificata da policy come movimento di generale con partitario in chiusura.')
    return {
      ...buildPartiteBehavior({
        code,
        label,
        family: 'partitario',
        partitarioMode: 'chiusura',
        showDocumentPanel: false,
        showIvaPanel: false,
        showIvaPerCassaPreview: Boolean(policy.ivaPerCassa),
        showRitenute: policy.gestioneRitenute === 'pagamento',
        activeTabs: ['rows', 'partitario', ...(policy.ivaPerCassa ? ['ivaPerCassaPreview'] : []), ...(policy.gestioneRitenute === 'pagamento' ? ['ritenute'] : [])],
        warnings,
        reasons,
      }),
      ...rawFields,
    }
  }

  if (policy.isMovimentoGenerico && policy.gestionePartitario === 'nessuno' && policy.gestioneRitenute === 'nessuna') {
    reasons.push('Classificata da policy come movimento di generale semplice.')
    return {
      ...buildSimpleBehavior({ code, label, reasons, warnings }),
      ...rawFields,
    }
  }

  if (policy.gestioneRitenute === 'documento' || policy.gestioneRitenute === 'pagamento') {
    reasons.push(`Classificata da policy con ritenute ${policy.gestioneRitenute}.`)
    return {
      ...buildRitenuteBehavior({
        code,
        label,
        family: 'ritenute',
        ritenuteMode: policy.gestioneRitenute,
        showDocumentPanel: policy.gestioneRitenute === 'documento',
        showIvaPanel: policy.ivaPerCassa,
        showPartitario: true,
        activeTabs: ['rows', 'partitario', 'ritenute'],
        warnings,
        reasons,
      }),
      ...rawFields,
    }
  }

  if (policy.isSolaIva) {
    reasons.push('Classificata da policy come movimento sola IVA.')
    return {
      ...buildDocumentBehavior({
        code,
        label,
        family: 'documento_iva',
        documentMode: 'sola_iva',
        ivaMode: 'sola_iva',
        showPartitario: false,
        activeTabs: ['rows', 'iva'],
        warnings,
        reasons,
      }),
      ...rawFields,
    }
  }

  if (policy.ivaPerCassa) {
    reasons.push('Policy con IVA differita / IVA per cassa rilevata senza famiglia esplicita.')
    return {
      ...buildPartiteBehavior({
        code,
        label,
        family: 'partite_iva_differita',
        partitarioMode: 'chiusura',
        showDocumentPanel: false,
        showIvaPanel: false,
        showIvaPerCassaPreview: true,
        showRitenute: policy.gestioneRitenute === 'pagamento',
        activeTabs: ['rows', 'partitario', 'ivaPerCassaPreview', ...(policy.gestioneRitenute === 'pagamento' ? ['ritenute'] : [])],
        warnings,
        reasons,
      }),
      ...rawFields,
    }
  }

  if (policy.gestionePartitario === 'apertura' || policy.gestionePartitario === 'chiusura') {
    reasons.push('Classificata da policy come scrittura di partite.')
    return {
      ...buildPartiteBehavior({
        code,
        label,
        family: 'partitario',
        partitarioMode: policy.gestionePartitario,
        showDocumentPanel: false,
        showIvaPanel: false,
        showRitenute: false,
        activeTabs: ['rows', 'partitario'],
        warnings,
        reasons,
      }),
      ...rawFields,
    }
  }

  return null
}

function toBehaviorFromLegacyConfig(code, label, warnings = [], reasons = []) {
  const legacy = resolveRegistrazioneCausaleConfig(code)
  reasons.push(`Fallback al profilo legacy ${legacy.code || code || 'DEFAULT'}.`)
  const isSimpleLegacy = !legacy.showDocumentPanel && !legacy.showIvaPanel && !legacy.showPartitario && !legacy.showRitenute
  if (!isSimpleLegacy) {
    warnings.push('Comportamento causale derivato dal codice perché i campi configurativi non erano sufficienti.')
  }
  return buildBehavior({
    code: legacy.code || code || 'DEFAULT',
    label: label || legacy.label || 'Scrittura semplice',
    family: legacy.family || 'movimento_generale',
    showDocumentPanel: Boolean(legacy.showDocumentPanel),
    showIvaPanel: Boolean(legacy.showIvaPanel),
    showPartitario: Boolean(legacy.showPartitario),
    showRitenute: Boolean(legacy.showRitenute),
    activeTabs: Array.isArray(legacy.activeTabs) ? legacy.activeTabs : SIMPLE_TABS,
    requiredFields: Array.isArray(legacy.requiredFields) ? legacy.requiredFields : ['dataRegistrazione', 'causaleContabile'],
    documentMode: legacy.showDocumentPanel ? 'documento_generico' : 'nessuno',
    ivaMode: legacy.showIvaPanel ? 'legacy' : 'nessuna',
    partitarioMode: legacy.showPartitario ? 'legacy' : 'nessuno',
    ritenuteMode: legacy.showRitenute ? 'legacy' : 'nessuno',
    requiresSoggetto: Boolean(legacy.showDocumentPanel || legacy.showPartitario || legacy.showRitenute),
    requiresDocumentDate: Boolean(legacy.showDocumentPanel),
    requiresDocumentNumber: Boolean(legacy.showDocumentPanel),
    requiresDocumentTotal: Boolean(legacy.showDocumentPanel),
    requiresIvaData: Boolean(legacy.showIvaPanel),
    requiresRitenuteData: Boolean(legacy.showRitenute),
    supportsPartitePanel: Boolean(legacy.supportsPartitePanel || legacy.showPartitario),
    warnings,
    reasons,
  })
}

export function resolveRegistrazioneCausaleBehavior(input = {}, options = {}) {
  const item = input && typeof input === 'object' ? input : { codice: input }
  const code = String(item?.code || item?.codice || item?.sigla || item?.id || '').trim().toUpperCase()
  const label = resolveRegistrazioneCausaleLabel(item)
  const warnings = []
  const reasons = []
  const policy = buildCausaleContabilePolicy(item)

  const fieldBehavior = determineFromPolicy(policy, code, label)
  if (fieldBehavior) {
    return buildBehavior({
      ...fieldBehavior,
      code: code || fieldBehavior.code || 'DEFAULT',
      label,
      warnings: Array.from(new Set([...(fieldBehavior.warnings || []), ...warnings])),
      reasons: Array.from(new Set([...(fieldBehavior.reasons || []), ...reasons])),
    })
  }

  const useLegacyFallback = options?.useLegacyFallback !== false
  if (useLegacyFallback && code) {
    // Fallback legacy finale: resta solo per causali storiche prive di metadati funzionali.
    return {
      ...toBehaviorFromLegacyConfig(code, label, warnings, reasons),
      ...buildRawFields(policy),
    }
  }

  reasons.push('Comportamento derivato come scrittura semplice per assenza di metadati e fallback disabilitato.')
  return {
    ...buildSimpleBehavior({ code, label, reasons, warnings }),
    ...buildRawFields(policy),
  }
}
