# Riconciliazione bancaria - Event taxonomy Audit Import Guidato

## Obiettivo

Definire la tassonomia degli eventi atomici dell audit Guida FiscoSim, con struttura contrattuale e regole di validazione per implementazioni future.

Perimetro:
- solo documentale/contrattuale;
- nessun codice operativo;
- nessuna modifica parser/UI reale/DB/API.

## 1) Principio generale

L audit e append-only a livello logico.

Regole guida:
- ogni azione rilevante genera un evento;
- il riepilogo corrente e derivato da sequenza eventi + stato finale;
- nessuna sovrascrittura silenziosa;
- tracciabilita completa;
- spiegabilita completa;
- separazione parser/AI/operatore;
- distinzione tra fonte documentale e input manuale;
- staging unico per cliente.

## 2) Struttura base evento

Schema comune:

{
  eventId,
  eventType,
  auditId,
  importId,
  sourceFileName,
  profileCandidate,
  timestamp,
  operatorId,
  source,
  payload,
  previousStateSnapshot,
  resultingStateSnapshot,
  warnings,
  blockers
}

Note:
- previousStateSnapshot e resultingStateSnapshot sono opzionali;
- warnings e blockers possono essere array vuoti.

source ammessi:
- parser
- ai_suggestion
- operator
- system
- dry_run
- template_engine

## 3) Eventi sessione

### guided_import_started
Quando:
- apertura nuova sessione Guida FiscoSim.

Payload minimo:
{
  trigger,
  initialProfileCandidate,
  initialConfidence
}

Impatto:
- inizializza contesto audit attivo.

### guided_import_cancelled
Quando:
- operatore annulla import guidato.

Payload minimo:
{
  reason,
  hasUnsavedChanges
}

Impatto:
- finalDecision candidato: import_marked_unusable o import_only non confermato.

### guided_import_resumed
Quando:
- sessione audit riaperta.

Payload minimo:
{
  resumeFromEventId,
  pendingBlockers,
  pendingWarnings
}

Impatto:
- ripristino stato operativo.

### guided_import_completed
Quando:
- operatore conclude workflow guidato.

Payload minimo:
{
  finalDecision,
  templateDecision,
  operatorConfirmed
}

Impatto:
- chiusura sessione audit.

## 4) Eventi proposta campo documento

Eventi:
- document_field_proposed
- document_field_confirmed
- document_field_selected_from_row
- document_field_manual_changed
- document_field_cleared
- document_field_restored_from_proposal
- document_field_marked_not_applicable
- document_field_marked_missing

Campi coperti:
- banca
- IBAN
- BIC
- numero conto
- intestatario
- periodo da
- periodo a
- saldo iniziale
- totale entrate
- totale uscite
- saldo finale

Payload minimo:
{
  fieldId,
  fieldLabel,
  previousValue,
  proposedValue,
  finalValue,
  source,
  confidenceBefore,
  confidenceAfter,
  selectedRowId,
  pageNumber,
  rawText,
  reason
}

Validazioni:
- se source = operator_manual_input: selectedRowId puo essere null;
- se source = operator_selected_row: selectedRowId e rawText obbligatori;
- manual input non certifica automaticamente il campo;
- fieldId deve appartenere all elenco campi supportati.

Impatto summary:
- aggiorna fieldsStatus per campo;
- puo aggiungere warning/blocker se campo critico mancante.

## 5) Eventi righe estratte

Eventi:
- extracted_row_selected
- extracted_row_rejected
- extracted_row_marked_as_source
- extracted_row_marked_as_non_movement
- extracted_row_marked_as_multiline
- extracted_row_opened_in_original_document

Payload minimo:
{
  rowId,
  pageNumber,
  rowIndex,
  rawText,
  normalizedText,
  candidateTypes,
  selectedCandidate,
  targetField,
  action
}

Validazioni:
- rowId obbligatorio;
- action coerente con eventType;
- targetField obbligatorio se action impatta un campo.

Impatto summary:
- aggiorna tracciabilita fonte documentale;
- alimenta audit righe selezionate.

## 6) Eventi sezione movimenti

Eventi:
- movement_header_selected
- movement_first_row_selected
- movement_last_row_selected
- movement_section_confirmed
- movement_section_changed
- movement_section_cleared

Payload minimo:
{
  headerRowId,
  firstMovementRowId,
  lastMovementRowId,
  startPage,
  endPage,
  confidence,
  source,
  reason
}

Validazioni:
- firstMovementRowId e lastMovementRowId coerenti temporalmente/ordinalmente;
- incoerenza genera blocker;
- movement_section_confirmed richiede almeno header + first row.

Impatto summary:
- aggiorna movementSectionStatus.

## 7) Eventi layout colonne

Eventi:
- column_preset_selected
- column_map_changed
- direction_rule_changed
- amount_rule_changed
- description_rule_changed
- column_mapping_confirmed

Preset ammessi:
- date_value_out_in_description
- date_sign_amount_value_description
- date_signed_amount_description
- csv_excel_explicit_columns
- custom_guided

Payload minimo:
{
  selectedColumnPreset,
  previousColumnPreset,
  columnMap,
  directionRule,
  amountRule,
  descriptionRule,
  source,
  confidence
}

Validazioni:
- selectedColumnPreset in elenco consentito;
- custom_guided richiede columnMap valorizzata;
- column_mapping_confirmed richiede regole direzione/importo/descrizione definite.

Impatto summary:
- consolida mapping sezione movimenti.

## 8) Eventi sezioni da ignorare

Eventi:
- ignore_section_added
- ignore_section_confirmed
- ignore_section_removed
- ignore_section_changed

sectionType ammessi:
- scalare_section
- competenze_section
- informative_section
- legal_footer
- page_header
- page_footer
- other

Payload minimo:
{
  sectionType,
  startRowId,
  endRowId,
  startPage,
  endPage,
  reason,
  source,
  operatorConfirmed
}

Validazioni:
- sectionType in elenco consentito;
- startRowId obbligatorio su add/confirm;
- remove richiede riferimento sezione esistente.

Impatto summary:
- aggiorna ignoreSectionsStatus.

## 9) Eventi multilinea

Eventi:
- multiline_rule_proposed
- multiline_rule_confirmed
- multiline_row_attached
- multiline_row_detached
- multiline_rule_changed

Payload minimo:
{
  parentRowId,
  childRowIds,
  rule,
  reason,
  examples,
  confidence,
  source
}

Validazioni:
- childRowIds array non vuoto su attach;
- parentRowId obbligatorio;
- detach richiede associazione pre-esistente.

Impatto summary:
- aggiorna multilineStatus;
- impatta multilineAttachedRows nel dry run.

## 10) Eventi AI suggestion

Eventi:
- ai_suggestion_created
- ai_suggestion_accepted
- ai_suggestion_rejected
- ai_suggestion_modified

Payload minimo:
{
  suggestionId,
  targetField,
  suggestedValue,
  suggestedRows,
  confidence,
  reason,
  modelInfo,
  operatorDecision
}

Validazioni:
- accepted/modified richiede operatorDecision;
- source ai_suggestion non puo produrre template_saved autonomamente.

Impatto summary:
- traccia contributo AI e accettazione umana.

## 11) Eventi dry run

Eventi:
- guided_parse_started
- guided_parse_completed
- guided_parse_failed
- guided_parse_recomputed

Payload minimo (completed):
{
  movementsExtracted,
  totalIn,
  totalOut,
  openingBalance,
  closingBalanceOfficial,
  calculatedClosingBalance,
  difference,
  rejectedRows,
  reviewRows,
  ignoredRows,
  multilineAttachedRows,
  confidenceOverall,
  parseReliabilityLevel,
  parseStatus,
  blockers,
  warnings
}

Validazioni:
- se closingBalanceOfficial presente e difference != 0: template_savable stabile vietato;
- se movementsExtracted = 0: import unusable salvo nuove correzioni mapping.

Impatto summary:
- aggiorna dryRunStatus e readiness complessiva.

## 12) Eventi decisione finale import

Eventi:
- import_decision_set
- import_marked_certified
- import_marked_high_confidence_review
- import_marked_low_confidence_review
- import_marked_unusable
- import_marked_import_only

Payload minimo:
{
  finalDecision,
  reason,
  blockers,
  warnings,
  dryRunAuditRef,
  operatorConfirmed
}

Validazioni:
- finalDecision in elenco consentito;
- import_marked_certified richiede assenza blocker.

Impatto summary:
- aggiorna finalDecision.

## 13) Eventi decisione template

Eventi:
- template_decision_set
- template_marked_savable
- template_marked_savable_non_certifying
- template_marked_not_savable
- template_saved
- template_save_cancelled

Payload minimo:
{
  templateDecision,
  templateScope,
  profileId,
  profileLabel,
  version,
  source,
  reason,
  dryRunAuditRef,
  operatorConfirmed
}

templateScope ammessi:
- studio
- cliente
- import_only
- global (solo futuro/sistema)

Validazioni:
- template_saved richiede operatorConfirmed = true;
- se saldi ufficiali presenti e differenza != 0: template_saved stabile vietato;
- template_marked_savable_non_certifying ammesso per layout stabile senza saldi ufficiali con review obbligatoria.

Impatto summary:
- aggiorna templateDecision.

## 14) Eventi errore/blocco

Eventi:
- guided_import_blocker_added
- guided_import_blocker_resolved
- guided_import_warning_added
- guided_import_warning_resolved

Payload minimo:
{
  code,
  severity,
  message,
  relatedFieldId,
  relatedRowId,
  relatedSection,
  reason
}

Validazioni:
- severity obbligatoria (warning|blocker);
- resolve richiede riferimento code esistente.

Impatto summary:
- aggiorna liste blockers/warnings correnti.

## 15) Eventi staging

Eventi:
- staging_reset_for_new_import
- staging_audit_restored
- staging_audit_saved
- staging_audit_discarded

Regola fondamentale:
- staging unico per cliente;
- nuovo import resetta audit precedente;
- mai fondere audit di due estratti;
- mai accodare movimenti.

Impatto summary:
- reset o ripristino contesto audit.

## 16) Riepilogo derivato

Summary derivato da stream eventi:

guidedImportAuditSummary = {
  fieldsStatus,
  movementSectionStatus,
  ignoreSectionsStatus,
  multilineStatus,
  dryRunStatus,
  finalDecision,
  templateDecision,
  blockers,
  warnings,
  lastUpdatedAt
}

Regola:
- il summary non sostituisce lo storico eventi, lo rappresenta.

## 17) Validazioni trasversali

Validazioni comuni:
- eventId obbligatorio;
- eventType noto;
- timestamp obbligatorio;
- auditId obbligatorio;
- payload coerente con eventType;
- selectedRowId obbligatorio per selected_from_row;
- reason obbligatoria per manual input su campo critico;
- operatorConfirmed obbligatorio per template_saved;
- dryRunAuditRef obbligatorio per decisione template;
- source AI mai sufficiente per decisione finale.

## 18) Esempi evento

### A. IBAN scelto da riga
{
  eventType: "document_field_selected_from_row",
  source: "operator",
  payload: {
    fieldId: "iban",
    finalValue: "IT96C0101503200000070745491",
    selectedRowId: "fileHash:p1:r22:abc123",
    pageNumber: 1,
    rawText: "IBAN IT 96 C 01015 03200 000070745491",
    reason: "operator_selected_row"
  }
}

### B. Saldo finale inserito manualmente
{
  eventType: "document_field_manual_changed",
  source: "operator",
  payload: {
    fieldId: "closing_balance",
    previousValue: null,
    finalValue: "810,52",
    selectedRowId: null,
    reason: "operator_manual_input"
  }
}

### C. Header movimenti selezionato
{
  eventType: "movement_header_selected",
  source: "operator",
  payload: {
    headerRowId: "fileHash:p2:r41:def456",
    reason: "contains_movement_header_keywords"
  }
}

### D. Riassunto Scalare ignorato
{
  eventType: "ignore_section_confirmed",
  source: "operator",
  payload: {
    sectionType: "scalare_section",
    startRowId: "fileHash:p3:r10:ghi789",
    endRowId: "fileHash:p3:r40:jkl012",
    operatorConfirmed: true,
    reason: "matches_ignore_section_keyword"
  }
}

### E. Dry run completato con diff 0
{
  eventType: "guided_parse_completed",
  source: "dry_run",
  payload: {
    movementsExtracted: 14,
    difference: 0,
    parseReliabilityLevel: "certified_balanced",
    parseStatus: "parsed_balanced"
  }
}

### F. Template salvabile non certificante
{
  eventType: "template_marked_savable_non_certifying",
  source: "template_engine",
  payload: {
    templateScope: "cliente",
    reason: "stable_layout_without_official_balances",
    dryRunAuditRef: "dryrun-001",
    operatorConfirmed: true
  }
}

### G. Nuovo import resetta audit precedente
{
  eventType: "staging_reset_for_new_import",
  source: "system",
  payload: {
    reason: "new_import_same_customer",
    previousAuditId: "audit-previous",
    newAuditId: "audit-current"
  }
}

## 19) Roadmap implementativa

- R6C2A-SPEC - event taxonomy
- R6C2A1 - audit event constants/mock
- R6C2A2 - audit reducer/summary derivation mock
- R6C2A3 - validation events
- R6C2A4 - audit UI summary mock
- R6C2A5 - persistence local audit events
- R6C2A6 - regression tests

## Note di perimetro

Documento solo contrattuale. Nessun codice operativo, parser, UI reale, DB/API o refactor e stato eseguito in questa fase.
