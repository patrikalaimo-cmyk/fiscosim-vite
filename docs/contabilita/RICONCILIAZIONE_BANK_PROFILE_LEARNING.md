# Riconciliazione bancaria - Sistema profili apprendibili

## 1. Problema

Nel dominio bancario non e sostenibile creare parser manuali rigidi per ogni banca e per ogni layout documento.

Motivi principali:
- Troppe banche e troppi formati proprietari.
- La stessa banca produce varianti diverse nel tempo e per canale.
- Layout mensili e trimestrali possono avere intestazioni, colonne e riepiloghi differenti.
- Esistono liste movimenti parziali senza quadro completo dei saldi.
- Gli utenti inviano anche PDF non ufficiali (stampe home banking).
- Una quota rilevante di documenti e PDF scansionata o di bassa qualita.
- Alcuni documenti non riportano saldi ufficiali o non riportano totali entrate/uscite.

Conseguenza: mantenere parser custom hard-coded per ogni combinazione banca-layout non scala, aumenta regressioni e costi di manutenzione.

## 2. Obiettivo del sistema

FiscoSim deve evolvere da parser statici a un sistema di profili documento apprendibili, capace di:
- riconoscere layout gia noti;
- chiedere supporto guidato quando il riconoscimento non e affidabile;
- usare AI come supporto di suggerimento, non come autorita finale;
- permettere all operatore di insegnare dove leggere i dati;
- validare il risultato con audit;
- salvare template riutilizzabili per futuri documenti simili.

Pipeline generale proposta:

file importato
-> estrazione testo/OCR
-> layout fingerprint
-> ricerca profilo noto
-> parsing con profilo noto
-> se bassa confidenza: AI suggestion + operatore
-> mapping guidato
-> parsing guidato
-> audit saldi/totali
-> salvataggio template se affidabile
-> riuso futuro

## 3. Concetti principali

### bankDocumentProfile
Definizione completa di una famiglia documento bancario (sezioni, colonne, regole, validazioni, segnali).

### layoutFingerprint
Impronta del layout usata per riconoscere documenti simili senza dipendere da una singola regex.

### movementSection
Regole per identificare inizio/fine area movimenti e confini pagina-sezione.

### documentMetadataMap
Mappa campi documento (banca, IBAN, BIC, numero conto, intestatario, periodo, saldi, totali).

### columnMap
Mappa colonne di movimento (data contabile, data valuta, dare, avere, importo, descrizione).

### ignoreSections
Sezioni da ignorare (scalare, competenze, note legali, footer ripetitivi).

### multilineRules
Regole per comporre righe multilinea (descrizioni spezzate, righe continuation, merge con riga precedente).

### validationRules
Regole di controllo dati estratti (coerenza date, segni importo, duplicati, campi obbligatori).

### operatorTrainingSession
Sessione guidata in cui l operatore corregge e conferma mappature e regole.

### aiExtractionSuggestion
Proposta AI su metadati, sezioni, colonne e pattern, sempre soggetta a conferma umana.

### templateVersion
Versionamento del profilo/template per tracciabilita, rollback e gestione evoluzioni.

### profileConfidence
Confidenza di riconoscimento profilo (quanto il documento e compatibile con un profilo noto).

### parseReliabilityLevel
Affidabilita del parsing risultante, indipendente dal solo riconoscimento profilo.

## 4. bankDocumentProfile

Un profilo documento bancario deve contenere almeno:

- profileId
- profileLabel
- bankName
- bankAliases
- bicPatterns
- ibanPatterns
- documentType
- layoutFingerprint
- movementSectionStartPattern
- movementSectionEndPattern
- documentMetadataMap
- columnMap
- ignoreSections
- multilineRules
- validationRules
- confidenceRules
- version
- createdBy
- createdAt
- source

Esempio struttura concettuale:

{
  profileId: "banco_sardegna_quarterly_statement_v1",
  profileLabel: "Banco di Sardegna",
  bankName: "Banco di Sardegna",
  bankAliases: ["Banco Sardegna", "BdS"],
  bicPatterns: ["SARDIT3S", "BPMOIT22"],
  ibanPatterns: ["IT96C01015", "IT96 C 01015"],
  documentType: "quarterly_statement",
  layoutFingerprint: { ... },
  movementSectionStartPattern: "Di seguito l elenco movimenti del periodo",
  movementSectionEndPattern: "Riassunto scalare|Elementi per il conteggio competenze",
  documentMetadataMap: { ... },
  columnMap: { ... },
  ignoreSections: [ ... ],
  multilineRules: { ... },
  validationRules: { ... },
  confidenceRules: { ... },
  version: "1.0.0",
  createdBy: "system|operator",
  createdAt: "ISO-8601",
  source: "global|studio|cliente|import-only"
}

## 5. layoutFingerprint

Il layoutFingerprint identifica una famiglia documento con segnali combinati, non con una sola priorita rigida.

Segnali consigliati:
- banca dichiarata nel documento;
- BIC presenti;
- ABI/CAB;
- prefisso IBAN;
- parole ricorrenti e titoli standard;
- header tabella movimenti;
- ordine colonne (esempio: USCITE ENTRATE DESCRIZIONE vs DESCRIZIONE USCITE ENTRATE);
- presenza/assenza riepilogo saldi e totali;
- presenza di sezioni scalare/competenze;
- struttura pagine (pagine indice, pagine movimenti, pagine informative);
- header/footer ricorrenti.

Il matching fingerprint deve produrre:
- score per profilo candidato;
- segnali trovati;
- segnali mancanti;
- confidenza complessiva.

## 6. Livelli regole/template

### A. Global FiscoSim
Profili standard distribuiti con il prodotto.

### B. Studio
Profili appresi a livello studio, disponibili per tutti i clienti dello studio.

### C. Cliente
Profili specifici per cliente, utili quando il cliente invia sempre varianti particolari.

### D. Import-only
Mappatura valida solo per il singolo import, non promossa a regola stabile.

Ordine suggerito di risoluzione:
1. Cliente
2. Studio
3. Global
4. Import-only solo per esecuzione corrente

## 7. Ruolo AI

AI puo proporre:
- banca;
- IBAN;
- BIC;
- numero conto;
- intestatario;
- saldo iniziale;
- totale entrate;
- totale uscite;
- saldo finale;
- periodo;
- inizio/fine sezione movimenti;
- header colonne;
- colonne data/valuta/importo/dare/avere/descrizione;
- sezioni da ignorare;
- regole multilinea;
- probabili pattern documento.

AI non puo:
- certificare da sola il parsing;
- contabilizzare;
- creare prima nota;
- confermare matching definitivo;
- bypassare audit;
- salvare template stabile senza conferma operatore.

Principio: AI come acceleratore di proposta, non come fonte unica di verita.

## 8. Ruolo operatore

L operatore deve poter confermare/correggere:
- dati documento;
- saldi;
- totali;
- periodo;
- inizio/fine sezione movimenti;
- header colonne;
- layout colonne;
- sezioni da ignorare;
- regole multilinea.

L operatore non deve inserire manualmente centinaia di movimenti.

Obiettivo operativo: guidare FiscoSim a leggere correttamente il documento e ri-eseguire parsing+audit.

## 9. Casi di affidabilita

### A. Parsing certificato
Condizioni:
- saldi/totali presenti;
- movimenti estratti;
- audit al centesimo;
- nessuna riga bloccante.

Esito: utilizzabile con livello massimo di affidabilita.

### B. Parsing ad alta affidabilita
Condizioni:
- movimenti estratti;
- saldi ufficiali assenti o incompleti;
- nessuna ambiguita rilevante.

Esito: richiede review operatore, non certificazione piena.

### C. Parsing bassa confidenza
Condizioni:
- estrazione apparentemente presente;
- confidenza bassa su alcuni elementi chiave.

Esito: operatore sceglie tra review, guida FiscoSim o annullo.

### D. Parsing inutilizzabile
Condizioni:
- impossibile estrarre dati essenziali.

Esito: import non utilizzabile, opzioni guida o annullo.

## 10. Flusso decisionale

Se documento non riconosciuto:
- Messaggio: Vuoi aiutare FiscoSim ad aggiornare le regole di import di questo documento?

Se operatore risponde no e parsing a bassa confidenza:
- Messaggio: Ho estratto i dati principali, ma alcuni elementi hanno confidenza bassa. Serve verifica manuale.
- Azioni:
  - Continua con review
  - Guida FiscoSim
  - Annulla import

Se operatore risponde no e parsing inutilizzabile:
- Messaggio: FiscoSim non e riuscito a estrarre tutti i dati necessari. L import non e utilizzabile.
- Azioni:
  - Guida FiscoSim
  - Annulla import

Se operatore sceglie guida:
1. Proposta AI dei campi.
2. Conferma/correzione operatore.
3. Parsing guidato.
4. Audit.
5. Decisione: salva template stabile oppure import-only.

## 11. Criteri per salvare template stabile

Salvare nuovo template stabile solo se:
- documento leggibile;
- movimenti estratti in modo coerente;
- audit saldi/totali al centesimo quando il riepilogo e presente;
- nessuna riga bloccante non spiegata;
- conferma esplicita operatore;
- fingerprint layout abbastanza stabile;
- nessuna regressione sui profili esistenti;
- versione template tracciata.

Se il documento non torna:
- usare mapping solo import-only;
- non promuovere a template stabile.

## 12. Regole sicurezza

Regole obbligatorie:
- staging unico per cliente;
- un import corrisponde a uno staging;
- nuovo import resetta sempre staging precedente;
- vietato mischiare estratti diversi;
- vietato accodare movimenti tra import distinti;
- template nuovo non sovrascrive profili esistenti senza nuova versione;
- ogni template e versionato;
- rollback template previsto;
- log training obbligatorio;
- AI mai fonte unica di certificazione.

## 13. Esempi concreti

### A. Banca Sella
- Profilo noto.
- Estratto con riepilogo movimenti.
- Gestione righe multilinea in descrizione.
- Controllo saldi e totali quando presenti.

### B. Banco di Sardegna mensile
- Header: DATA SEGNO D/A IMPORTO VALUTA DESCRIZIONE.
- Riepilogo non sempre completo.
- Esito tipico: alta affidabilita, non sempre certificazione piena.

### C. Banco di Sardegna trimestrale
- Riepilogo conto corrente presente.
- Elenco movimenti del periodo presente.
- Riassunto scalare da ignorare.
- Competenze da ignorare.
- Audit al centesimo con riepilogo disponibile.

### D. Lista movimenti parziale senza saldo
- Import possibile.
- Nessuna certificazione piena.
- Review operatore obbligatoria.

## 14. Roadmap implementativa

- R6A - Specifica profili apprendibili (questo documento)
- R6B - Registry profili statico
- R6C - Layout fingerprint engine
- R6D - Tabella proposte campi documento
- R6E - Selezione righe/testo estratto
- R6F - Mapping colonne/sezione movimenti
- R6G - Prova parsing guidato
- R6H - Salvataggio template locale/studio
- R6I - Reuse template su nuovo import
- R6L - AI fallback
- R6M - Selezione grafica PDF avanzata futura

## Note finali di perimetro

Questa fase e esclusivamente documentale. Non include codice operativo, parser, UI, DB o integrazioni API.
