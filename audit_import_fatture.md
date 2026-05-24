# Audit modulo Import Fatture

Data snapshot: 2026-04-22

Obiettivo di questo documento:
stabilire lo stato reale del modulo `Import Fatture` e confrontarlo con il comportamento operativo atteso, senza modificare codice e senza allargare l'analisi oltre le dipendenze dirette necessarie.

## 1. Executive summary

`Import Fatture` non e un semplice importatore. E un flusso guidato che:

- riceve file XML/PDF/ZIP/P7M
- espande archivi e allegati
- filtra i duplicati
- crea o aggiorna la coda fatture
- costruisce bozze operative, contabili e IVA
- valida la struttura della working view
- crea o sincronizza il documento contabile
- passa la registrazione al binario reale della contabilità

Il modulo e reale e operativo, ma e anche fortemente ibrido:

- usa il motore condiviso di `import_unificato`
- conserva sezioni legacy visibili in UI
- salva parte dello stato in blob storici
- dipende da storico, anagrafiche e regole per completare il percorso

Verdetto sintetico:

- Input: `Mediocre`
- Elaborazione: `Debole`
- Output: `Buono`

Il punto piu fragile non e l'assenza di funzione, ma la **convivenza di flusso moderno e compatibilita vecchie**. Questo rende facile un aggancio sbagliato da parte dell'AI o di un intervento rapido.

## 2. Stato reale del modulo

### Cosa fa davvero oggi

- accetta file root limitati a XML, PDF, ZIP, P7M
- espande ZIP e P7M
- ispeziona i duplicati
- carica la coda `documenti_import` filtrata per fatture
- mostra una working view con:
  - dati operativi
  - dati contabili proposti
  - dati IVA
  - conferma passo finale
- consente il salvataggio separato delle tre sezioni
- crea o sincronizza il documento in `documenti_contabilita`
- invoca la registrazione finale tramite il workflow di contabilità

### Cosa non fa in modo semplice o lineare

- non e un intake “one shot”
- non ha una deduplica robusta basata sul contenuto
- non ha una separazione netta tra fonte operativa e compat legacy
- non e adatto a modifiche minime senza capire i branch storici

## 3. Fase A - Input

### Da dove arrivano i dati

- selezione file manuale
- drag and drop
- coda staging fatture
- piano conti della societa
- causali IVA
- causali contabili
- clienti attivi
- storico AI contabile per suggerimenti

### File/fonti coinvolte

- [`src/modules/import_fatture/index.jsx`](C:/Users/patri/Desktop/fiscosim-vite%20-%20BACKUP%20Import%20fatture%2018.04.2026/src/modules/import_fatture/index.jsx)
- [`src/modules/import_fatture/application/importFattureUpload.js`](C:/Users/patri/Desktop/fiscosim-vite%20-%20BACKUP%20Import%20fatture%2018.04.2026/src/modules/import_fatture/application/importFattureUpload.js)
- [`src/modules/import_unificato/application/importWorkflow.js`](C:/Users/patri/Desktop/fiscosim-vite%20-%20BACKUP%20Import%20fatture%2018.04.2026/src/modules/import_unificato/application/importWorkflow.js)

### Qualita dei dati ricevuti

Giudizio: `Mediocre`

Motivi:

- il filtro iniziale e solo per estensione
- il controllo duplicati e prevalentemente basato sul nome file
- la qualità reale del dato dipende molto dall'input utente e dallo storico già presente
- il modulo accetta dati parziali e prova a recuperarli in seguito

### Campi mancanti / recuperati dopo

- controparte
- numero documento
- data documento
- totale
- conto
- causale IVA
- griglia prima nota
- griglia IVA

### Duplicati e warning

Esistono warning reali per:

- file duplicato nel batch
- file gia presente in archivio contabile
- file gia presente in staging
- nessun file da importare
- nessun file da elaborare
- file non ammessi per il modulo

### Dati sufficienti per contabilizzazione successiva

Giudizio: `Sì, ma solo dopo arricchimento e conferma`

L'input iniziale non basta quasi mai da solo. Serve la fase di working view e la conferma strutturale.

### Verdetto Fase A

`Mediocre`

## 4. Fase B - Elaborazione

### Lettura fatture

La lettura avviene tramite:

- parsing XML diretto quando possibile
- analisi documentale quando il file non e XML
- espansione ZIP e P7M prima dell'elaborazione

### Normalizzazione e parsing

La normalizzazione e reale ma non semplice:

- i file vengono espansi
- i duplicati vengono classificati
- i documenti possono essere marcati come `pronte_lavorazione`
- il blob documentale salva override operativi, contabili e IVA

### Preview e classificazione

La preview non e una semplice anteprima:

- mostra lo stato di preparazione
- propone conto e causale
- calcola blocchi di validazione
- mostra stati `Bozza`, `Salvato`, `Suggerito`

### Controlli

Controlli effettivi:

- completezza griglia prima nota
- bilanciamento Dare/Avere
- coerenza totale fattura / totale partitario
- coerenza griglia IVA / totale documento
- validita causale IVA
- validita conto nel piano conti

### Punti fragili

- il modulo usa tre livelli di stato che possono divergere:
  - dati operativi
  - dati contabili
  - dati IVA
- le sezioni legacy restano visibili e possono confondere il punto di verita
- il salvataggio avviene su blob, quindi il dato operativo non vive in un solo punto
- `processImportedFiles` e condiviso con `import_unificato`

### Funzioni legacy o sospette coinvolte

- nessuna funzione è “morta” nel cuore del flusso, ma ci sono molte compatibilita storiche
- i blocchi legacy della working view sono presenti e vanno congelati concettualmente

### Verdetto Fase B

`Debole`

## 5. Fase C - Output

### Cosa passa alla contabilizzazione

- documento contabile creato o aggiornato
- dati di conto e causale
- griglia prima nota valida
- griglia IVA
- data registrazione
- metadati di collegamento tra import e archivio

### Qualita output

Giudizio: `Buono`

Perche:

- il bridge verso contabilita e concreto
- la registrazione finale usa il workflow reale
- il modulo riesce a passare da input documentale a documento contabile

### Completezza dati

Buona, ma condizionata:

- senza validazione strutturale l'output non e affidabile
- senza storico o regole il modulo resta molto manuale
- senza la working view il dato e incompleto

### Coerenza mapping

Il mapping e buono ma delicato:

- conto
- causale IVA
- dati IVA
- totale
- data registrazione

### Gap per moduli successivi

- i moduli successivi devono ricevere un documento contabile coerente
- il rischio principale e passare un output “formalmente compilato” ma non davvero stabile

### Verdetto Fase C

`Buono`

## 6. Funzioni e stato della roadmap

Legenda:

- `[x]` reale e blindata
- `[~]` parziale
- `[ ]` mancante
- `[!]` problematica
- `[L]` legacy da congelare

| Funzione | Stato | Note |
|---|---:|---|
| `isAllowedFattureRootFile` | `[x]` | filtro root semplice e chiaro |
| `filterRootFilesForFattureImport` | `[x]` | utile e affidabile |
| `filterExpandedItemsForFattureStaging` | `[x]` | filtro staging post-espansione |
| `loadQueue` | `[x]` | carica coda reale del modulo |
| `inspectImportedFilesForFatture` | `[~]` | deduplica utile ma basata sul nome file |
| `processImportedFiles` | `[~]` | motore reale ma condiviso con altro modulo |
| `handleFattureFiles` | `[~]` | orchestratore reale ma complesso |
| `buildImportFattureIvaProposal` | `[~]` | proposta utile ma non definitiva |
| `evaluateImportFattureStructuralAccountingBlocks` | `[x]` | controllo strutturale reale |
| `validateImportFattureStructuralForArchivio` | `[x]` | bridge di controllo reale |
| `evaluateProntaLavorazioneDiagnosi` | `[x]` | diagnosi operativa reale |
| `isBenPreparata` | `[x]` | criterio di stato reale |
| `candidateForNextStep` | `[x]` | gating reale |
| `confermaPassoFinaleValida` | `[x]` | gating reale |
| `salvaDatiOperativi` | `[~]` | reale ma dentro compat legacy |
| `salvaDatiContabiliProposti` | `[~]` | reale ma dipende da blob e stato storico |
| `salvaDatiIvaProposti` | `[~]` | reale ma sovrapposto a override e grid |
| `contabilizzaCompletaDaWorkingView` | `[!]` | punto piu delicato del modulo |
| `applicaPreparazioneStessaControparte` | `[~]` | utile ma secondario |
| `avviaContabilizzazioneEDWorking` | `[x]` | reale |
| `rimuoviCheckedDaLavorazione` | `[~]` | reale ma marginale |
| `eliminaFattureSelezionate` | `[!]` | pericolosa perche tocca staging e collegamenti |
| blocchi legacy working view | `[L]` | da congelare |

## 7. Gap prioritari

1. La deduplica e troppo dipendente dal nome file.
2. Il modulo usa piu stati persistiti e la verita non e concentrata in un solo punto.
3. La working view e potente ma concettualmente pesante.
4. Le sezioni legacy restano visibili e possono essere confuse con il flusso attuale.
5. Il bridge verso contabilita e corretto, ma molto sensibile a piccoli cambi.
6. `processImportedFiles` e una dipendenza condivisa: e facile creare regressioni fuori modulo.

## 8. Funzioni legacy o pericolose

### Legacy da congelare

- blocchi legacy della working view
- salvataggio manuale su blob come paradigma storico
- sezione IVA opzionale legacy

### Pericolose

- `contabilizzaCompletaDaWorkingView`
- `eliminaFattureSelezionate`
- `insertImportFattureIntoDocumentiContabilita`
- `syncImportFattureDocumentoContabilitaFromImportDoc`
- `buildImportFattureIvaProposal`
- `processImportedFiles` quando usato con `invoiceImportOnly`

## 9. Cosa non toccare

- non toccare il motore condiviso senza valutare anche `import_unificato`
- non cambiare i criteri di duplicato senza misurare l'effetto su staging e archivio
- non rimuovere o reinterpretare i blocchi legacy senza una migrazione esplicita
- non trattare i salvataggi parziali come se fossero la verita canonica

## 10. Primo task piccolo consigliato

Il prossimo passo utile, senza fare refactor, e creare una tabella ancora piu operativa che separi chiaramente:

- fonte operativa attuale
- compatibilita storica
- blocchi da congelare

Questo riduce subito il rischio di usare punti sbagliati nei task successivi.

Nessuna modifica codice.
