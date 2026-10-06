# Riconciliazione bancaria - Audit Import Guidato (Guida FiscoSim)

## Obiettivo

Definire modello dati, regole e UX dell audit della procedura Guida FiscoSim, per rendere tracciabile e verificabile tutto il percorso:

Documento sconosciuto o bassa confidenza
-> proposte parser/AI
-> conferme e scelte operatore
-> mapping sezione movimenti
-> dry run parsing
-> decisione template/import-only

Perimetro:
- fase solo documentale;
- nessun codice operativo;
- nessuna modifica parser/UI reale/DB/API.

## 1) Scopo dell audit import guidato

L audit serve a:
- evitare decisioni opache o magiche;
- tracciare in modo esplicito l intervento umano;
- distinguere origine parser, AI e input manuale;
- supportare la decisione template_savable vs import_only;
- abilitare review successiva e troubleshooting.

## 2) Livelli audit

Livelli previsti:
- audit campo documento;
- audit righe selezionate;
- audit layout/sezione movimenti;
- audit ignore sections;
- audit multilinea;
- audit dry run;
- audit decisione template/finale.

## 3) Audit campo documento

Per ogni campo documento/riepilogo tracciare:
- fieldId
- label
- proposedValue
- finalValue
- source:
  - parser
  - ai_suggestion
  - operator_selected_row
  - operator_manual_input
  - default
  - not_available
- confidenceBefore
- confidenceAfter
- selectedRowId
- pageNumber
- rawText
- previousValue
- changedByOperator
- status:
  - proposed
  - confirmed
  - modified_manual
  - selected_from_row
  - missing
  - not_applicable
- warnings
- blockers

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

## 4) Audit sezione movimenti

Tracciare:
- headerRowId
- firstMovementRowId
- lastMovementRowId
- movementSectionStart
- movementSectionEnd
- selectedColumnPreset
- customColumnMap (se presente)
- directionRule
- amountRule
- descriptionRule
- confidence
- source
- operatorConfirmed

Nota:
- questo audit definisce regole strutturali, non singoli movimenti manuali.

## 5) Audit ignore sections

Per ogni sezione ignorata:
- sectionType
- startRowId
- endRowId
- reason
- source
- operatorConfirmed
- effect:
  - ignored_as_scalare
  - ignored_as_competenze
  - ignored_as_informativa
  - ignored_as_legal_footer
  - ignored_as_page_footer

Regola:
- sezioni ignorate tracciate come informazione motivata, non omissione silente.

## 6) Audit multilinea

Tracciare:
- parentRowId
- childRowIds
- rule
- reason
- source
- operatorConfirmed
- examples

Obiettivo:
- rendere esplicito quando righe senza data sono continuazione descrizione del movimento padre.

## 7) Audit manual input

Ogni modifica manuale deve tracciare:
- fieldId
- previousValue
- newValue
- reason (opzionale)
- source = operator_manual_input
- createdAt
- operatorId (se disponibile)

Regola:
- input manuale non certifica automaticamente il dato;
- lo stato resta manuale e visibile nel riepilogo.

## 8) Audit AI suggestion

Se AI propone valori/righe:
- suggestionId
- targetField
- suggestedValue
- suggestedRows
- confidence
- reason
- decisionState:
  - accepted
  - rejected
  - modified
- operatorDecision

Regola:
- AI non certifica da sola;
- AI non puo salvare template in autonomia.

## 9) Audit dry run parsing

Dopo Prova parsing registrare:
- movementsExtracted
- totalIn
- totalOut
- openingBalance
- closingBalanceOfficial
- calculatedClosingBalance
- difference
- rejectedRows
- reviewRows
- ignoredRows
- multilineAttachedRows
- confidenceOverall
- parseReliabilityLevel
- parseStatus
- blockers
- warnings

Scopo:
- quantificare oggettivamente l esito del mapping guidato.

## 10) Decisione finale import guidato

Esiti consentiti:
- certified_import
- high_confidence_review
- low_confidence_review
- import_only
- template_savable
- template_not_savable
- unusable_import

Nota:
- stato import e stato template possono coesistere (esempio: import_only + template_not_savable).

## 11) Criteri template salvabile

### Template stabile salvabile
Solo se:
- mapping confermato;
- movimenti estratti;
- audit al centesimo quando saldi/totali ufficiali presenti;
- nessuna riga bloccante non risolta;
- ignore sections motivate;
- layout fingerprint sufficiente;
- conferma operatore.

### Template salvabile ma non certificante
Ammesso se:
- layout stabile;
- saldi ufficiali mancanti;
- operatore conferma;
- output sempre in review.

### Template non salvabile
Se:
- differenza saldi non zero (quando verificabile);
- troppe righe unknown;
- movimenti mancanti;
- mapping manuale fragile;
- dati essenziali inseriti manualmente senza fonte documentale adeguata.

## 12) UX audit summary

Schermata riepilogo prevista:
- Campi documento: OK / modificati / mancanti
- Sezione movimenti: OK / da verificare
- Ignore sections: confermate
- Multilinea: regole applicate
- Dry run: risultato numerico
- Template: salvabile / non salvabile / import-only

Azioni principali:
- Salva template
- Usa solo per questo import
- Torna a mapping
- Annulla import

## 13) Colori e stati

Semantica colori:
- verde: confermato / certificato
- giallo: review / alta affidabilita non certificata
- rosso: bloccante / non salvabile
- grigio: non applicabile o manuale non certificante

## 14) Relazione con staging unico

Regole:
- audit appartiene allo staging attivo del cliente;
- nuovo import resetta audit precedente;
- vietato fondere audit di estratti diversi;
- se template viene salvato resta nel registry, ma staging corrente resta unico.

## 15) Relazione con template registry

L audit guida:
- creazione template;
- versionamento template;
- source = operator_guided_import;
- livello template (global/studio/cliente/import-only);
- possibilità di rollback futuro.

## 16) Esempi concreti

### A. Banco Sardegna trimestrale
- audit al centesimo;
- template_savable;
- esito certified_import.

### B. Banco Sardegna mensile
- saldo finale ufficiale non completo;
- template salvabile non certificante;
- esito high_confidence_review.

### C. Sella
- parsing noto ad alta affidabilita;
- audit prevalentemente automatico;
- intervento operatore minimo o nullo.

### D. Documento sconosciuto con saldo finale manuale
- import utilizzabile in review;
- template non certificante;
- visibilita esplicita di operator_manual_input.

### E. Documento inutilizzabile
- movimenti non affidabili;
- esito unusable_import;
- azioni: Annulla import oppure Torna a mapping.

## 17) Output dati concettuale

Struttura concettuale:

guidedImportAudit = {
  auditId,
  sourceFileName,
  profileCandidate,
  documentFieldsAudit,
  movementSectionAudit,
  ignoreSectionsAudit,
  multilineAudit,
  aiSuggestionsAudit,
  manualInputsAudit,
  dryRunAudit,
  finalDecision,
  templateDecision,
  blockers,
  warnings,
  createdAt,
  updatedAt
}

Linee guida:
- ogni sezione audit deve essere append-only a livello storico logico;
- latest summary puo essere derivato da eventi e stato corrente.

## 18) Roadmap implementativa

- R6C2-SPEC - Audit import guidato
- R6C2A - audit model mock
- R6C2B - audit summary UI mock
- R6C2C - dry run audit integration
- R6C2D - template decision rules
- R6C2E - persistence local audit
- R6C2F - regression tests

## Note di perimetro

Questa fase e solo documentale. Nessun codice operativo, parser, UI reale, DB/API o refactor e stato eseguito.
