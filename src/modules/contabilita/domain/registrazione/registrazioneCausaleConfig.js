const SIMPLE_TABS = ['rows']
const DOCUMENT_TABS = ['rows', 'iva', 'partitario']
const PROFESSIONAL_TABS = ['rows', 'iva', 'partitario', 'ritenute']
const PARTITE_TABS = ['rows', 'partitario']

function makeConfig({
  code,
  label,
  family,
  showDocumentPanel = false,
  showIvaPanel = false,
  showPartitario = false,
  showRitenute = false,
  activeTabs = SIMPLE_TABS,
  requiredFields = ['dataRegistrazione', 'causaleContabile'],
  shortcutsEnabled = true,
  supportsAutoBalance = true,
  supportsPartitePanel = false,
  supportsDefaultRows = true,
}) {
  return Object.freeze({
    code,
    label,
    family,
    showDocumentPanel,
    showIvaPanel,
    showPartitario,
    showRitenute,
    activeTabs,
    requiredFields,
    shortcutsEnabled,
    supportsAutoBalance,
    supportsPartitePanel,
    supportsDefaultRows,
  })
}

const CONFIGS = Object.freeze({
  FF: makeConfig({
    code: 'FF',
    label: 'Fatture passive',
    family: 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    activeTabs: DOCUMENT_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  FFPC: makeConfig({
    code: 'FFPC',
    label: 'Fatture passive professionisti',
    family: 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    activeTabs: DOCUMENT_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  FC: makeConfig({
    code: 'FC',
    label: 'Fatture attive',
    family: 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    activeTabs: DOCUMENT_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  FCPC: makeConfig({
    code: 'FCPC',
    label: 'Fatture attive professionisti',
    family: 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    activeTabs: DOCUMENT_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  A17X: makeConfig({
    code: 'A17X',
    label: 'Autofattura estera',
    family: 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    activeTabs: DOCUMENT_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  FF5: makeConfig({
    code: 'FF5',
    label: 'Fattura passiva IVA 5%',
    family: 'documento_iva_partitario',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    activeTabs: DOCUMENT_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  RP: makeConfig({
    code: 'RP',
    label: 'Parcelle / professionisti',
    family: 'professionisti',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    showRitenute: true,
    activeTabs: PROFESSIONAL_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  RPPC: makeConfig({
    code: 'RPPC',
    label: 'Parcelle professionisti',
    family: 'professionisti',
    showDocumentPanel: true,
    showIvaPanel: true,
    showPartitario: true,
    showRitenute: true,
    activeTabs: PROFESSIONAL_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile', 'dataDocumento', 'numeroDocumento'],
    supportsPartitePanel: true,
  }),
  PF: makeConfig({
    code: 'PF',
    label: 'Pagamento fornitore',
    family: 'partite',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: true,
    activeTabs: PARTITE_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    supportsPartitePanel: true,
  }),
  PF80: makeConfig({
    code: 'PF80',
    label: 'Pagamento fornitore 80',
    family: 'partite',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: true,
    showRitenute: true,
    activeTabs: ['rows', 'partitario', 'ritenute'],
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    supportsPartitePanel: true,
  }),
  IC: makeConfig({
    code: 'IC',
    label: 'Incasso cliente',
    family: 'partite',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: true,
    activeTabs: PARTITE_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    supportsPartitePanel: true,
  }),
  PD: makeConfig({
    code: 'PD',
    label: 'Scrittura semplice',
    family: 'semplici',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: false,
    showRitenute: false,
    activeTabs: SIMPLE_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    supportsPartitePanel: false,
  }),
  BC: makeConfig({
    code: 'BC',
    label: 'Scrittura banca/cassa',
    family: 'semplici',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: false,
    showRitenute: false,
    activeTabs: SIMPLE_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    supportsPartitePanel: false,
  }),
  SG: makeConfig({
    code: 'SG',
    label: 'Scrittura semplice generale',
    family: 'semplici',
    showDocumentPanel: false,
    showIvaPanel: false,
    showPartitario: false,
    showRitenute: false,
    activeTabs: SIMPLE_TABS,
    requiredFields: ['dataRegistrazione', 'causaleContabile'],
    supportsPartitePanel: false,
  }),
})

const DEFAULT_CONFIG = makeConfig({
  code: 'DEFAULT',
  label: 'Scrittura semplice',
  family: 'semplici',
  showDocumentPanel: false,
  showIvaPanel: false,
  showPartitario: false,
  showRitenute: false,
  activeTabs: SIMPLE_TABS,
  requiredFields: ['dataRegistrazione', 'causaleContabile'],
  supportsPartitePanel: false,
})

function normalizeCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

export function resolveRegistrazioneCausaleConfig(input) {
  const code = normalizeCode(input?.code ?? input?.codice ?? input?.id ?? input)
  return CONFIGS[code] || { ...DEFAULT_CONFIG, code: code || DEFAULT_CONFIG.code, label: input?.label || DEFAULT_CONFIG.label }
}

export function listRegistrazioneCausaleConfigs() {
  return Object.values(CONFIGS)
}

export function getRegistrazioneCausaleConfigByCode(code) {
  return resolveRegistrazioneCausaleConfig(code)
}

