# Riconciliazione bancaria - Extracted Text Rows Viewer (Scegli riga)

## Obiettivo

Definire UX e modello dati del viewer Righe estratte documento, usato come strumento di supporto quando l operatore clicca Scegli riga nella tabella proposte di Guida FiscoSim.

Principi:
- veloce;
- leggibile;
- adatto a PDF lunghi;
- filtrabile;
- orientato alla scelta della fonte corretta;
- non sostitutivo della tabella principale.

## 1) Ruolo del viewer

Il viewer e secondario e contestuale.

Si apre da:
- Scegli riga su un campo della tabella proposte;
- Apri righe estratte per ispezione generale;
- fase di debug/import a bassa confidenza.

Non e la modalita principale di training parser.

## 2) Input del viewer

Il viewer riceve:
- fileId/importId
- sourceFileName
- pageCount
- extractedRows[]
- currentTargetField
- currentProfileCandidate
- documentAccount proposal
- parsingConfidence
- activeSelectionMode

### extractedRow minimo

Ogni riga estratta deve contenere almeno:

{
  rowId,
  pageNumber,
  rowIndex,
  globalIndex,
  rawText,
  normalizedText,
  textQuality,
  detectedDates[],
  detectedAmounts[],
  detectedIbans[],
  detectedBics[],
  detectedKeywords[],
  candidateTypes[],
  sectionHint,
  confidence,
  bbox, // opzionale/futura
  sourceMeta
}

## 3) Candidate types

Lista candidateTypes supportata:
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

## 4) Layout UI (table-first)

### A. Header viewer
Contiene:
- nome file
- campo corrente da selezionare
- pagina corrente / totale pagine
- profilo candidato
- ricerca rapida
- pulsante chiudi / torna tabella proposte

### B. Toolbar filtri
Filtri:
- cerca testo
- filtra pagina
- mostra solo importi
- mostra solo date
- mostra solo IBAN/BIC
- mostra solo candidati compatibili col campo corrente
- mostra righe movimento
- mostra righe ignorabili
- mostra bassa confidenza
- pulisci filtri

### C. Tabella righe
Colonne:
- selezione/azione
- pagina
- riga
- testo estratto
- candidati trovati
- tipo candidato
- confidenza
- stato/nota

### D. Pannello dettaglio riga
Contenuti:
- raw text completo
- normalized text
- importi candidati
- date candidate
- IBAN/BIC candidati
- motivi di confidenza
- azioni disponibili
- link Apri documento originale alla pagina

## 5) Azioni generali

Azioni possibili (abilitate in base al currentTargetField):
- Usa questa riga
- Usa come valore campo
- Usa come header movimenti
- Usa come prima riga movimenti
- Usa come ultima riga movimenti
- Usa come inizio sezione da ignorare
- Usa come fine sezione da ignorare
- Marca come multilinea collegata
- Marca come non movimento
- Apri documento originale
- Torna a tabella proposte

## 6) Modalita per tipo campo

### A. Campo banca
- Preferire righe candidate bank_name, BIC, intestazione.
- Azione: usa testo come banca oppure usa valore normalizzato.

### B. Campo IBAN
- Mostrare priorita a righe con detectedIbans.
- Azione: usa IBAN rilevato.
- Se piu IBAN in riga, scelta esplicita operatore.

### C. Campo BIC
- Mostrare righe con detectedBics.
- Azione: usa BIC rilevato.

### D. Saldi/totali
Mostrare righe con importi e keyword:
- saldo iniziale
- totale entrate
- totale uscite
- saldo finale
- saldo contabile
- saldo liquido

Se piu importi nella riga, operatore sceglie importo specifico.

### E. Periodo da/a
- Mostrare righe con date + keyword periodo/riepilogo.
- Consentire scelta data corretta in caso di piu date.

### F. Header movimenti
Mostrare righe con pattern colonne, ad esempio:
- DATA
- VALUTA
- USCITE
- ENTRATE
- DESCRIZIONE
- SEGNO
- IMPORTO

Azione: usa come header movimenti.

### G. Prima riga movimento
- Mostrare righe candidate movement_row.
- Azione: usa come prima riga movimento.

### H. Ultima riga movimento
- Mostrare righe candidate last_movement_row o righe di chiusura sezione.
- Azione: usa come ultima riga movimento o fine sezione movimenti.

### I. Sezioni da ignorare
Mostrare righe candidate:
- Riassunto Scalare
- Elementi per il conteggio competenze
- Informativa
- Footer legale

Azioni:
- usa come inizio sezione ignorata
- usa come fine sezione ignorata

## 7) Selezione importo in riga

Quando una riga contiene piu importi, il viewer deve elencarli separatamente.

Esempio:
Quota capitale 6.345,43 Interessi 284,11 Spese 22,75

L operatore puo:
- scegliere quale importo usare;
- confermare che la riga e multilinea descrittiva;
- marcare la riga come non movimento.

Per saldi/totali, se ci sono piu importi in una riga la scelta importo e obbligatoria.

## 8) Confidenza e colori

Stati visivi:
- verde: candidato forte per il campo corrente
- giallo: candidato possibile
- rosso: ambiguo o bloccante
- grigio: informativa o non applicabile

La confidenza deve essere spiegabile con motivi:
- keyword trovata
- pattern importo coerente
- posizione in sezione corretta
- vicinanza a header movimenti
- IBAN valido
- BIC valido
- multilinea senza data
- sezione ignorabile

## 9) Filtri e ricerca

Filtri minimi:
- testo libero
- pagina
- solo righe con importi
- solo righe con date
- solo righe con IBAN/BIC
- solo candidati per campo corrente
- solo righe movimento
- solo righe da ignorare
- solo bassa confidenza
- solo righe non classificate

Ordinamenti:
- ordine documento (default)
- confidenza decrescente
- pagina/riga
- tipo candidato

## 10) Collegamento al documento originale

Ogni riga deve offrire azione Apri documento originale.

Comportamento:
- se pageNumber disponibile, aprire documento alla pagina corretta;
- se bbox disponibile in futuro, evidenziare area;
- in versione corrente, evidenziazione logica con pagina + rawText, senza overlay grafico.

## 11) Performance

Requisiti minimi:
- virtualizzazione o rendering leggero per dataset > 500 righe;
- filtri efficienti;
- niente ricalcoli pesanti a ogni render;
- raw text completo mostrato nel pannello dettaglio, non in tabella compatta;
- colonne ottimizzate per scansione visiva rapida.

## 12) Stato selezioni e ritorno alla tabella proposte

Quando operatore seleziona una riga, al ritorno in tabella proposte aggiornare:
- fieldId
- selectedRowId
- pageNumber
- rawText
- selectedValue
- selectedAmount o selectedDate se rilevante
- source = selected_extracted_row
- confidence aggiornata
- stato campo = scelto_da_riga

## 13) Audit selezione

Ogni scelta riga deve produrre audit locale:

{
  fieldId,
  previousValue,
  newValue,
  selectedRowId,
  pageNumber,
  rawText,
  selectedCandidate,
  source: "operator_selected_extracted_row",
  createdAt,
  operatorId
}

operatorId e opzionale se non disponibile.

## 14) Manual input vs choose row

Distinzione obbligatoria:
- Scegli riga: campo agganciato a fonte documentale.
- Modifica manuale: campo inserito senza fonte diretta.

Entrambe ammesse per dati documento/riepilogo.

Per movimenti:
- Scegli riga serve a definire struttura (header, inizio/fine, ignore, multilinea);
- non abilita inserimento manuale massivo dei movimenti.

## 15) Uso per sezioni movimenti

Il viewer deve supportare selezioni strutturali:
- header row
- first movement row
- last movement row
- ignore section start
- ignore section end

Queste selezioni alimentano regole di template, non valorizzano solo campi numerici.

## 16) Empty state e gestione errori

Casi da gestire:
- nessuna riga estratta
- testo illeggibile
- OCR necessario
- nessun candidato per campo corrente
- troppe righe bassa confidenza
- file non disponibile dopo refresh

Messaggi minimi:
- Nessuna riga compatibile trovata. Puoi cercare manualmente o inserire il dato a mano se ammesso.
- Documento originale non disponibile dopo refresh. Ricaricare il file per usare il viewer completo.

## 17) Relazione con AI

AI puo pre-filtrare o suggerire righe candidate.

Vincoli:
- scelta finale sempre operatore;
- AI non seleziona in modo definitivo;
- AI non salva template senza conferma.

Nel viewer si puo mostrare:
- suggerito da AI
- motivo suggerimento
- confidenza AI

## 18) Relazione con template

Le selezioni del viewer alimentano:
- documentMetadataMap
- movementSection
- columnMap
- ignoreSections
- multilineRules

Vincolo:
- una selezione riga non basta per salvare template stabile;
- serve comunque prova parsing + audit affidabile.

## 19) Esempi operativi

### A. IBAN Banco Sardegna
- Riga: IBAN IT 96 C 01015 ...
- Azione: usa come IBAN.

### B. Saldo finale
- Riga: SALDO FINALE AL 31/12/2025 810,52
- Azione: seleziona importo 810,52 come closing_balance.

### C. Header movimenti
- Riga: DATA VALUTA USCITE ENTRATE DESCRIZIONE
- Azione: usa come movement_header.

### D. Multilinea rata prestito
- Righe quota capitale/interessi/spese senza nuova data.
- Azione: marca come multilinea collegata, non nuovo movimento.

### E. Sezione scalare
- Riga: Riassunto Scalare
- Azione: usa come inizio sezione da ignorare.

## 20) Roadmap implementativa

- R6C-SPEC - documento viewer righe estratte
- R6C1 - helper normalizzazione extractedRows
- R6C2 - mock viewer con dati statici
- R6C3 - filtri e ricerca
- R6C4 - choose row per campi documento
- R6C5 - choose row per header/inizio/fine movimenti
- R6C6 - audit selezione
- R6C7 - collegamento documento originale
- R6C8 - virtualizzazione/performance

## Note di perimetro

Documento di specifica. Nessun codice operativo, parser, UI reale, DB o API inclusi in questa fase.
