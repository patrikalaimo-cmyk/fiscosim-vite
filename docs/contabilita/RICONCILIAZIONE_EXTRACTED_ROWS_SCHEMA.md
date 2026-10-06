# Riconciliazione bancaria - Schema tecnico normalizzazione extractedRows

## Obiettivo

Definire il contratto tecnico di normalizzazione extractedRows[] come livello intermedio unico tra documento grezzo e componenti di interpretazione (viewer, tabella proposte, AI suggestion, profile learning, mapping guidato, audit).

Perimetro:
- specifica documentale/contrattuale;
- nessun codice operativo;
- nessuna modifica parser/UI reale/DB/API.

## 1) Scopo di extractedRows

extractedRows rappresenta il layer intermedio tra:
- documento grezzo;
- parser di profilo;
- viewer righe estratte;
- tabella proposte;
- training template.

Principio guida:
FiscoSim non deve operare su testo grezzo disordinato, ma su righe normalizzate, tracciabili, spiegabili e auditabili.

## 2) Sorgenti supportate

Sorgenti previste:
- PDF digitale con text extraction
- PDF scansionato (OCR)
- immagine OCR
- CSV
- XLS/XLSX
- testo incollato/importato
- output AI strutturato (di supporto)

### Matrice sorgenti

| Sorgente | sourceType | Affidabilita tipica | Coordinate | Rischio principale |
|---|---|---|---|---|
| PDF digitale | pdf_digital | alta/media | spesso disponibili o inferibili | frammentazione righe/colonne |
| PDF OCR | pdf_ocr | media/bassa | variabile | errori OCR, mojibake, token rotti |
| Immagine OCR | image_ocr | media/bassa | dipende motore OCR | perdita struttura tabellare |
| CSV | csv | alta | non applicabili | separatori/encoding non standard |
| XLS/XLSX | spreadsheet | alta | non applicabili | colonne merge, formati celle misti |
| Testo incollato | pasted_text | media | non applicabili | perdita contesto pagina/colonne |
| AI strutturato | ai_structured | variabile | no nativo | assenza ancoraggio a fonte documento |

## 3) Pipeline normalizzazione

Pipeline standard:

source file
-> text extraction/OCR/table extraction
-> raw row fragments
-> merge line fragments
-> normalize text
-> detect candidates
-> classify candidateTypes
-> assign sectionHint
-> compute confidence
-> dedup
-> produce extractedRows[]

Output atteso:
- sequenza ordinata e stabile di extractedRows;
- motivazioni di classificazione e confidenza sempre disponibili.

## 4) Struttura extractedRow completa

Schema concettuale:

{
  rowId,
  sourceFileId,
  sourceFileName,
  sourceType,
  pageNumber,
  rowIndex,
  globalIndex,
  rawText,
  normalizedText,
  textQuality,
  detectedDates,
  detectedAmounts,
  detectedIbans,
  detectedBics,
  detectedAccountNumbers,
  detectedKeywords,
  candidateTypes,
  candidateReasons,
  sectionHint,
  confidence,
  qualityFlags,
  bbox,
  tableHints,
  parentRowId,
  childRowIds,
  sourceMeta
}

Vincoli base:
- rawText obbligatorio salvo errore estrazione;
- normalizedText obbligatorio quando rawText esiste;
- candidateTypes e candidateReasons sono liste (anche multiple);
- confidence in range 0.00 - 1.00.

## 5) rowId stabile

Requisiti rowId:
- non basarsi solo su index;
- includere identificativo file/hash;
- includere pagina e rowIndex;
- includere hash del normalizedText;
- stabile tra refresh, re-render e riapertura viewer;
- utilizzabile in audit.

Esempio:
rowId = `${fileHash}:p${pageNumber}:r${rowIndex}:${hash(normalizedText)}`

Nota prudenziale:
- se pageNumber assente (CSV/Excel), usare pagina logica = 1 o null in forma canonica.

## 6) rawText vs normalizedText

### rawText
- testo originale estratto;
- non alterato;
- fonte primaria per audit/tracciabilita.

### normalizedText
- spazi normalizzati;
- caratteri anomali ripuliti;
- simboli valuta standardizzati;
- encoding/accents corretti quando possibile;
- semantica preservata.

Regola: non eliminare mai rawText.

## 7) textQuality

Livelli:
- high
- medium
- low
- unreadable

Criteri:
- percentuale caratteri alfanumerici utili;
- presenza mojibake;
- lunghezza informativa minima;
- OCR confidence se disponibile;
- caratteri speciali anomali;
- spezzature/tokenization anomala.

Linea guida:
- unreadable implica needs_operator_review automatico.

## 8) Riconoscimento date

`detectedDates[]` struttura:

{
  raw,
  normalized,
  format,
  roleCandidate,
  confidence,
  reason
}

Formati supportati:
- dd/mm/yyyy
- dd/mm/yy
- dd-mm-yyyy
- dd.mm.yyyy
- yyyy-mm-dd

roleCandidate:
- operation_date
- value_date
- period_start
- period_end
- statement_date
- unknown_date

Regole:
- non confondere token data con importi;
- gestire anno a 2 cifre in modo controllato;
- preservare raw;
- se ambiguita elevata, impostare date_ambiguous.

## 9) Riconoscimento importi

`detectedAmounts[]` struttura:

{
  raw,
  normalizedNumber,
  currency,
  sign,
  roleCandidate,
  columnHint,
  confidence,
  reason
}

Formati principali:
- 1.234,56
- 1234,56
- -1.234,56
- 1,234.56 (futuro/estero)
- importi con simbolo euro
- importi con D/A separato

roleCandidate:
- amount
- debit_amount
- credit_amount
- opening_balance
- closing_balance
- total_in
- total_out
- fee_component
- interest_component
- unknown_amount

Regole fondamentali:
- non interpretare frammenti anno come importo;
- ignorare numeri interni a IBAN/CRO/codici;
- distinguere riepilogo da movimento quando possibile;
- conservare tutti i candidati in righe multi-importo;
- scelta finale operatore ammessa quando ambigua.

## 10) Riconoscimento IBAN/BIC/conto

Campi:
- detectedIbans[]
- detectedBics[]
- detectedAccountNumbers[]

Regole:
- IBAN normalizzato senza spazi;
- validazione lunghezza/pattern;
- conservare raw con spazi;
- BIC normalizzato uppercase;
- numero conto da pattern espliciti (conto corrente n., numero, coordinate nazionali, C/C=...).

## 11) detectedKeywords

Categorie keyword:
- bank_identity
- account_coordinates
- balance_summary
- movement_header
- movement_section_start
- movement_section_end
- ignore_section
- legal_footer
- scalare_section
- competenze_section
- statement_period
- payment_terms
- unknown

Esempi riconoscibili:
- Riepilogo Conto Corrente
- Saldo iniziale
- Totale Entrate
- Totale Uscite
- Saldo finale
- Di seguito l elenco movimenti
- DATA VALUTA USCITE ENTRATE DESCRIZIONE
- Riassunto Scalare
- Elementi per il conteggio delle competenze

## 12) candidateTypes

Lista standardizzata:
- bank_name
- iban
- bic
- account_number
- holder
- period_start
- period_end
- opening_balance
- total_in
- total_out
- closing_balance
- movement_header
- first_movement_row
- last_movement_row
- movement_row
- multiline_continuation
- ignore_section_start
- ignore_section_end
- scalare_section
- competenze_section
- legal_footer
- informative_section
- unknown

Regola:
- candidateTypes puo includere piu valori simultanei.

## 13) candidateReasons

candidateReasons e un elenco spiegabile delle cause di classificazione.

Esempi:
- contains_valid_iban
- contains_valid_bic
- matches_balance_keyword
- contains_movement_header_keywords
- inside_detected_movement_section
- line_starts_with_date
- line_has_debit_credit_columns
- line_has_da_sign
- line_without_date_after_movement
- matches_ignore_section_keyword
- near_document_header
- high_amount_pattern_confidence
- possible_code_not_amount
- possible_ocr_noise
- repeated_footer_pattern
- contains_fee_interest_components

Obiettivo:
- qualsiasi confidenza deve essere motivabile.

## 14) sectionHint

Valori sectionHint:
- document_header
- account_coordinates
- balance_summary
- movement_table
- movement_multiline_detail
- closing_balance
- ignore_scalare
- ignore_competenze
- ignore_informativa
- legal_footer
- page_header
- page_footer
- unknown

Regola:
- sectionHint supporta filtri/training, ma non certifica da solo il parsing.

## 15) confidence

Scala numerica:
- 0.00 - 1.00

Livelli:
- >= 0.90 high
- 0.70 - 0.89 medium
- 0.40 - 0.69 low
- < 0.40 very_low

Fattori minimi di calcolo:
- textQuality;
- keyword/pattern riconosciuti;
- posizione nel documento/sezione;
- coerenza con profilo candidato;
- coerenza con righe vicine;
- presenza date/importi validi.

Regola prudenziale:
- confidence alta senza candidateReasons forti non ammessa.

## 16) qualityFlags

Flag previsti:
- has_mojibake
- has_ocr_noise
- likely_header
- likely_footer
- likely_multiline
- duplicate_like
- amount_ambiguous
- date_ambiguous
- iban_detected
- bic_detected
- no_numeric_data
- possible_table_header
- possible_movement
- possible_non_movement
- needs_operator_review

## 17) bbox e coordinate future

bbox opzionale:

{
  pageNumber,
  x,
  y,
  width,
  height,
  coordinateSystem,
  source
}

Stato attuale:
- opzionale e non bloccante;
- utile per futura selezione grafica PDF;
- viewer table-first non dipende da bbox.

## 18) tableHints

Struttura:

{
  columnPositions,
  inferredColumns,
  rowGroupId,
  tableId,
  isHeader,
  isContinuation,
  continuationOfRowId
}

Uso:
- ricostruzione tabelle PDF digitali;
- mapping CSV/Excel;
- tabelle OCR;
- gestione multilinea.

## 19) Relazioni parent/child

Campi:
- parentRowId
- childRowIds

Scopo:
- legare multilinea al movimento principale;
- aggregare componenti quota/interessi/spese;
- associare footer a sezione ignorata.

## 20) Dedup e righe duplicate

Regole:
- non eliminare raw rows senza tracciamento;
- marcare duplicati sospetti;
- dedup consentito solo su header/footer ripetuti realmente identici;
- conservare reason dedup.

Flag utili:
- duplicate_like
- repeated_page_header
- repeated_page_footer
- repeated_legal_footer

## 21) sourceMeta

Struttura:

{
  extractor,
  extractorVersion,
  pageTextMethod,
  ocrEngine,
  ocrConfidence,
  pdfTextLayerAvailable,
  extractionTimestamp,
  profileCandidateAtExtraction
}

Nota:
- sourceMeta rende ripetibile e auditabile la pipeline estrattiva.

## 22) Normalizzazione CSV/Excel

Regole specifiche:
- extractedRow rappresenta riga tabellare;
- pageNumber puo essere null o 1;
- rowIndex mappa la riga foglio/file;
- tableHints.inferredColumns ha peso maggiore;
- rawText puo essere join dei valori cella;
- sourceMeta.sheetName valorizzato per Excel.

## 23) Normalizzazione AI output

Regole:
- output AI non sostituisce extractedRows;
- AI produce suggestion ancorate a rowId/raw span quando possibile;
- se non ancorabile: suggestion_unanchored;
- conferma operatore sempre necessaria.

## 24) Errori e fallback

Casi da gestire:
- nessun testo estratto;
- testo troppo sporco;
- OCR necessario;
- nessun importo rilevato;
- nessuna data rilevata;
- troppe righe unknown;
- profilo non riconosciuto.

Fallback:
- degradare confidenza globale;
- marcare needs_operator_review;
- abilitare Guida FiscoSim con filtri contestuali.

## 25) Esempi extractedRows

### A. IBAN Banco Sardegna
rawText:
IBAN IT 96 C 01015 03200 000070745491

candidateTypes:
["iban", "account_coordinates"]

candidateReasons:
["contains_valid_iban", "near_document_header"]

### B. Header movimenti Banco trimestrale
rawText:
DATA VALUTA USCITE ENTRATE DESCRIZIONE

candidateTypes:
["movement_header"]

candidateReasons:
["contains_movement_header_keywords"]

### C. Movimento Banco mensile con D/A
rawText:
17/10/25 A 6.000,00 17/10/25 BONIFICO...

candidateTypes:
["movement_row"]

detectedDates:
operation_date e value_date candidate

detectedAmounts:
6000 come credit_amount candidate

candidateReasons:
["line_starts_with_date", "line_has_da_sign"]

### D. Multilinea rata prestito
rawText:
Quota capitale 6.345,43 Interessi 284,11 Spese/commissioni 22,75

candidateTypes:
["multiline_continuation"]

candidateReasons:
["line_without_date_after_movement", "contains_fee_interest_components"]

### E. Riassunto scalare
rawText:
Riassunto Scalare al 31/12/2025

candidateTypes:
["scalare_section", "ignore_section_start"]

## 26) Roadmap implementativa

- R6C1-SPEC - schema extractedRows
- R6C1A - normalizer helper statico per testo gia estratto
- R6C1B - detector date/importi/IBAN/BIC
- R6C1C - candidateTypes/reasons classifier
- R6C1D - sectionHint classifier
- R6C1E - dedup header/footer
- R6C1F - test fixture Banco/Sella
- R6C2 - mock viewer con extractedRows statiche

## Note di perimetro

Questa fase e solo documentale/contrattuale. Nessun codice operativo, parser, UI reale, DB o API e stato modificato.
