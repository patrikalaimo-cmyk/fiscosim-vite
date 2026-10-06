# Riconciliazione bancaria - UX Guida FiscoSim per mapping documenti sconosciuti

## Obiettivo

Definire la UX operativa della funzione Guida FiscoSim per documenti bancari non riconosciuti o a bassa confidenza, in una modalita table-first, veloce, semplice, sicura e auditabile.

Questa fase e solo documentale.

## 1) Quando si attiva Guida FiscoSim

### A. Documento sconosciuto
- Nessun profilo noto applicabile.
- Fingerprint non riconosciuto o troppo debole.

### B. Profilo riconosciuto ma bassa confidenza
- Alcuni dati sono estratti ma con confidenza insufficiente.
- Presenza di segnali contrastanti tra profilo e contenuto.

### C. Import parziale
- Movimenti estratti ma riepilogo incompleto (saldi/totali mancanti).
- Oppure righe sospette o bloccanti da chiarire.

### D. Parsing inutilizzabile
- Dati essenziali non estraibili (es. no date/no importi/no sezione movimenti valida).

## 2) Messaggi decisionali

### Caso bassa confidenza
Messaggio:
FiscoSim ha estratto i dati principali, ma alcuni elementi hanno confidenza bassa. Serve verifica manuale.

Azioni:
- Continua con review
- Guida FiscoSim
- Annulla import

### Caso import inutilizzabile
Messaggio:
FiscoSim non e riuscito a estrarre tutti i dati necessari. L import non e utilizzabile cosi com e.

Azioni:
- Guida FiscoSim
- Annulla import

### Caso documento sconosciuto
Messaggio:
Vuoi aiutare FiscoSim ad aggiornare le regole di import di questo documento?

Azioni:
- Guida FiscoSim
- Prova import con bassa confidenza, se possibile
- Annulla import

## 3) Modalita principale: tabella campi proposti

La UX principale e una tabella centralizzata in cui FiscoSim propone e l operatore conferma o corregge.

### Colonne tabella
- Campo
- Valore proposto
- Confidenza
- Fonte
- Stato
- Azioni

### Campi documento/riepilogo
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

### Campi sezione movimenti
- header movimenti
- prima riga movimento
- ultima riga movimento
- layout colonne
- regola direzione/importo
- sezioni da ignorare
- regole multilinea

## 4) Azioni sui campi documento/riepilogo

Azioni disponibili:
- Conferma
- Scegli riga
- Modifica manuale
- Svuota
- Ripristina proposta

Modifica manuale ammessa solo per:
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

Motivazione UX:
- Sono pochi campi ad alta leggibilita.
- Il costo manuale e sostenibile.
- L obiettivo e correggere metadati, non ricostruire movimenti a mano.

## 5) Azioni sui movimenti (regola fondamentale)

Non e ammesso inserimento manuale massivo dei movimenti.

Vietato:
- inserire 900 movimenti a mano;
- creare righe movimento una per una in training;
- usare modifica manuale per popolazioni massive.

Consentito:
- indicare riga inizio sezione movimenti;
- indicare riga fine sezione movimenti;
- indicare header colonne;
- scegliere layout colonne;
- indicare tipo layout;
- indicare sezioni da ignorare;
- indicare regole multilinea.

Dopo la guida, FiscoSim rielabora automaticamente tutto il documento.

## 6) Differenza tra training parser e review staging

### Training parser
- Serve a insegnare la struttura documento.
- Determina dove e come leggere i dati.
- Produce o aggiorna template riusabili.

### Review staging
- Serve a correggere singoli movimenti gia estratti.
- Esempi: importo errato, direction errata, data errata.
- E auditata.
- Non sostituisce il training strutturale.

## 7) Vista Righe estratte documento (supporto)

La vista righe e uno strumento secondario, aperto solo su azione Scegli riga.

### Dati mostrati
- pagina
- numero riga
- testo estratto
- eventuali importi candidati
- eventuale data candidata
- confidenza
- azione Usa questa riga

### Esempio tabellare
| Riga | Pagina | Testo | Azione |
|---:|---:|---|---|
| 22 | 1 | IBAN IT 96 C 01015... | Usa come IBAN |
| 41 | 2 | DATA VALUTA USCITE ENTRATE DESCRIZIONE | Usa come header |
| 42 | 2 | 02/10/25 30/09/25 5,49 CANONE... | Usa come prima riga movimento |
| 78 | 2 | 31/12/25 810,52 SALDO FINALE | Usa come fine movimenti |

Principio UX:
- La vista righe non sostituisce la tabella principale.
- E un picker contestuale per confermare la fonte del campo.

## 8) Layout colonne (preset)

L operatore sceglie un preset minimo, poi eventualmente rifinisce.

### Preset A
Data + Valuta + Uscite + Entrate + Descrizione

Regole:
- direction: da colonna uscita/entrata valorizzata
- amount: valore assoluto nella colonna attiva
- description: residuo testuale della riga
- multilinea: righe senza data agganciate alla descrizione precedente

### Preset B
Data + Segno D/A + Importo + Valuta + Descrizione

Regole:
- direction: D = out, A = in
- amount: importo colonna unica
- description: testo successivo alle colonne base
- multilinea: continuation su righe senza data coerente

### Preset C
Data + Importo firmato + Descrizione

Regole:
- direction: da segno importo (+/-)
- amount: valore assoluto importo firmato
- description: testo residuo
- multilinea: merge con riga precedente quando manca data

### Preset D
CSV/Excel con colonne esplicite

Regole:
- direction: mapping esplicito da colonne dedicate o da segno
- amount: da colonna amount o da dare/avere
- description: colonna descrizione dedicata
- multilinea: normalmente non necessaria, ma gestibile se presente

### Preset E
Altro/manuale guidato

Regole:
- operatore definisce ordine colonne e regole estrazione;
- sistema salva mapping come template condizionato a fingerprint.

## 9) Sezioni da ignorare

L operatore puo confermare blacklist sezioni, ad esempio:
- Riassunto Scalare
- Elementi per il conteggio delle competenze
- Informativa alla clientela
- Footer legale
- Totale numeri
- Riepilogo competenze
- Interessi creditori/debitori
- Quote capitale/interessi dentro descrizione movimento, se gia agganciate a rata prestito

Regola audit:
- Le sezioni ignorate entrano come info audit.
- Non sono errori bloccanti se correttamente classificate.

## 10) Righe multilinea

La UX deve consentire regole tipo:
- Se una riga non ha data ma segue un movimento valido, e continuation descrizione del movimento precedente.

Esempio atteso:
- Movimento unico da 6.652,29 con descrizione estesa su piu righe.
- Non devono nascere movimenti duplicati da quote/interessi/spese di dettaglio.

## 11) Pulsanti principali

- Conferma completati
- Conferma tutti
- Prova parsing
- Salva regola
- Usa solo per questo import
- Annulla import
- Torna al documento
- Apri righe estratte
- Apri documento originale

## 12) Stati campi

Ogni campo ha stato esplicito:
- proposto
- confermato
- modificato manualmente
- scelto da riga
- mancante
- bassa confidenza
- non applicabile

Semantica colore:
- verde: confermato / alta confidenza
- giallo: bassa confidenza / da verificare
- rosso: mancante / bloccante
- grigio: non applicabile

## 13) Prova parsing (dry run guidato)

Dopo conferme/mapping, FiscoSim rielabora il documento e mostra:
- movimenti estratti
- entrate
- uscite
- saldo iniziale
- saldo finale
- saldo calcolato
- differenza
- righe scartate
- righe da verificare
- confidenza complessiva

Obiettivo:
- verificare il mapping prima del salvataggio template stabile.

## 14) Salvataggio regola/template

### Se audit affidabile (al centesimo e senza blocchi)
Azioni:
- Salva regola per documenti simili
- Usa solo per questo import

### Se audit non affidabile
Azioni:
- Modifica mapping
- Usa solo per questo import in review
- Annulla import

Vincolo:
- Non salvare template stabile se audit non affidabile.

## 15) Manual input e audit

Ogni modifica manuale su campi documento/riepilogo deve essere auditata con:
- campo
- valore precedente
- nuovo valore
- fonte: operator_manual_input
- data/utente (se disponibile)
- motivo opzionale

Regola:
- Input manuale non equivale a certificazione.
- Certificazione resta legata all audit saldi/totali.

## 16) AI fallback

AI puo:
- suggerire campi;
- suggerire righe candidate;
- suggerire layout colonne;
- suggerire sezioni da ignorare.

Operatore:
- conferma o corregge sempre.

Vincolo:
- AI non salva template in autonomia.

## 17) Selezione grafica PDF (fase futura)

La selezione grafica tramite rettangoli su PDF e esplicitamente fuori scope in prima versione.

Motivazioni:
- maggiore complessita tecnica (coordinate/canvas/OCR avanzato);
- dipendenza da qualita scansione;
- valore alto ma non necessario per prima delivery table-first.

## 18) Regola staging

Vincoli operativi:
- staging unico per cliente;
- nuovo import resetta sempre lo staging corrente;
- vietato accodare documenti;
- vietato mischiare estratti;
- per anno intero serve file unico annuale gia completo.

## 19) Esempi UX

### A. Banco Sardegna trimestrale
- FiscoSim propone metadati e header.
- Operatore conferma, indica sezione movimenti.
- Seleziona ignore sections (scalare/competenze).
- Prova parsing: audit al centesimo, template salvabile.

### B. Banco Sardegna mensile
- Preset B (Segno D/A).
- Movimenti estratti anche se riepilogo incompleto.
- Esito: alta affidabilita, non sempre certificazione piena.

### C. Documento sconosciuto senza saldi
- Import possibile in review.
- Template salvabile solo se mapping stabile e confermato.
- Nessuna certificazione piena senza riepilogo verificabile.

### D. Documento inutilizzabile
- Dati essenziali non disponibili.
- Azioni: guidare FiscoSim o annullare.

## 20) Roadmap implementativa

- R6B-SPEC - UX guida FiscoSim
- R6C - extracted text rows viewer
- R6D - proposals table mock
- R6E - choose row / manual input
- R6F - column layout presets
- R6G - guided parse dry run
- R6H - save template local
- R6I - reuse template
- R6L - AI fallback
- R6M - PDF area selection futura

## Note di perimetro

Documento di specifica UX. Nessun codice operativo, parser, UI reale, DB o API inclusi in questa fase.
