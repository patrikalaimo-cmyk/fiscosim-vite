export const CANONICAL_ACCOUNTING_SOURCE_MODULES = [
  'import_contabilita',
  'registrazione_manual',
  'registrazione_manuale',
  'riconciliazione_bancaria',
  'storno',
  'rettifica',
  'migrazione/legacy_bridge',
]

export const CANONICAL_ACCOUNTING_REGISTRATION_STATES = [
  'bozza',
  'da_verificare',
  'confermata',
  'simulata',
  'contabilizzata',
  'annullata',
  'stornata',
  'storno',
  'rettificata',
  'chiusa',
  'esportata',
]

export const CANONICAL_ACCOUNTING_SUBJECT_ROLES = [
  'primary',
  'counterparty',
  'bank',
  'withholdingRecipient',
  'other',
]

export const CANONICAL_ACCOUNTING_LEDGER_MODES = [
  'open',
  'close',
  'mixed',
  'none',
]

export const CANONICAL_ACCOUNTING_LEDGER_ACTIONS = [
  'open',
  'close',
]

export const CANONICAL_ACCOUNTING_VAT_REGISTER_TYPES = [
  'acquisti',
  'vendite',
  'corrispettivi',
]

export const CANONICAL_ACCOUNTING_WITHHOLDING_EVENT_TYPES = [
  'document',
  'payment',
]

export const CANONICAL_ACCOUNTING_POST_COMMIT_TARGETS = [
  'shouldCreateDocumentiContabilita',
  'shouldCreatePrimaNota',
  'shouldCreateIva',
  'shouldCreateLedger',
  'shouldCreateWithholding',
  'shouldCreateScadenziario',
  'shouldAttachSourceDocument',
  'shouldUpdateAuditTrail',
]

export const CANONICAL_ACCOUNTING_PAYLOAD_SECTIONS = [
  'schemaVersion',
  'source',
  'company',
  'fiscalContext',
  'header',
  'subjects',
  'document',
  'accounting',
  'vat',
  'ledger',
  'withholding',
  'attachments',
  'audit',
  'validation',
  'postCommitTargets',
]

export const CANONICAL_ACCOUNTING_SCHEMA = {
  schemaVersion: {
    required: ['schemaVersion'],
    optional: ['compatibility', 'notes'],
    notes: 'Versione del contratto canonico e compatibilità evolutiva.',
  },
  source: {
    required: ['module'],
    optional: ['sourceRowId', 'sourceDocumentId', 'sourceBatchId', 'sourceMeta'],
    notes: 'Origine del dato e identificativi di staging o riga sorgente.',
  },
  company: {
    required: ['societaId'],
    optional: ['esercizioId', 'periodoIva', 'regime'],
    notes: 'Contesto societario e fiscale della scrittura.',
  },
  fiscalContext: {
    required: ['dataRegistrazione'],
    optional: ['dataDocumento', 'competenza', 'periodoIva', 'tipoOperazione', 'tipoRegistro', 'regimeIva', 'reverseCharge', 'splitPayment', 'ivaPerCassa', 'proRata', 'ritenutaPresente'],
    notes: 'Contesto fiscale/temporale che decide i target applicabili.',
  },
  header: {
    required: ['causaleContabile', 'descrizione', 'stato'],
    optional: ['protocollo', 'numeroRegistrazione', 'currency', 'totals'],
    notes: 'Intestazione contabile generale della registrazione.',
  },
  subjects: {
    required: ['role', 'tipoSoggetto'],
    optional: ['anagraficaId', 'pianoContiIdPatrimoniale', 'denominazione', 'codiceFiscale', 'partitaIva', 'paese'],
    notes: 'Lista multi-soggetto; il soggetto documento può non coincidere con il soggetto partitario o percipiente.',
  },
  document: {
    required: ['totals'],
    optional: ['numeroDocumento', 'dataDocumento', 'tipoDocumento', 'xmlOrigine', 'allegato', 'riferimentoDocumentoOrigine'],
    notes: 'Documento origine e importi fiscali complessivi; gross è il totale documento lordo.',
  },
  accounting: {
    required: ['rows'],
    optional: ['dare', 'avere', 'conto', 'descrizione', 'importo', 'soggettoCollegato', 'collegamentoRigaIva', 'collegamentoPartitario', 'quadratura'],
    notes: 'Righe contabili e quadratura Dare/Avere.',
  },
  vat: {
    required: ['rows'],
    optional: ['registerType', 'sezionale', 'protocolNumber', 'competencePeriod', 'causaleIvaId', 'causaleIva', 'aliquota', 'natura', 'imponibile', 'imposta', 'detraibilitaPercent', 'indetraibileAmount', 'esigibilita', 'splitPayment', 'reverseCharge', 'reverseChargeMode', 'ivaPerCassa', 'proRata', 'autofattura', 'integrazioneEstero'],
    notes: 'Fonte unica per registri IVA; rows contiene le righe operative.',
  },
  ledger: {
    required: ['mode'],
    optional: ['enabled', 'accountId', 'subjectId', 'rows'],
    notes: 'Partitario e gestione partite aperte/chiuse/miste.',
  },
  withholding: {
    required: ['enabled', 'eventType', 'recipient', 'rows'],
    optional: ['rows[].netPaid', 'rows[].causaleCu', 'rows[].paymentDate', 'rows[].dueDateF24', 'rows[].tributeCode', 'rows[].period'],
    notes: 'Ritenute da documento o da pagamento; target futuri CU/770/F24/scadenziario solo se attivi.',
  },
  attachments: {
    required: [],
    optional: ['sourceFile', 'xml', 'pdf', 'p7m', 'hash', 'storagePath', 'metadata'],
    notes: 'Allegati e riferimenti ai documenti origine.',
  },
  audit: {
    required: ['sourceModule', 'createdAt'],
    optional: ['createdBy', 'sourceAction', 'importBatch', 'operatorDecisions', 'warnings', 'overrides', 'reasons'],
    notes: 'Traccia operatore, override, motivazioni e origine del commit.',
  },
  validation: {
    required: ['blocking', 'readiness'],
    optional: ['errors', 'warnings', 'quadratura', 'completezzaDati', 'targetValidabili'],
    notes: 'Esito di validazione e readiness del payload.',
  },
  postCommitTargets: {
    required: [
      'shouldCreateDocumentiContabilita',
      'shouldCreatePrimaNota',
      'shouldCreateIva',
      'shouldCreateLedger',
      'shouldCreateWithholding',
      'shouldCreateScadenziario',
      'shouldAttachSourceDocument',
      'shouldUpdateAuditTrail',
    ],
    optional: [],
    notes: 'Flag espliciti per i target di commit; se attivi richiedono validazione dedicata.',
  },
}
