---
title: Manuale utente FiscoSim
subtitle: Guida pratica all'uso
lang: it
---

<div class="page-break" style="display:none"></div>

# Manuale utente FiscoSim

*Versione orientata all’uso quotidiano — non richiede competenze informatiche avanzate.*

---

## 1. Introduzione

### Cos’è FiscoSim

FiscoSim è un software di lavoro per **studi professionali** e **commercialisti**. Riunisce in un’unica piattaforma la gestione dei **documenti** (fatture e altro), la **contabilità** (prima nota, piano dei conti, partitario, bilancio) e strumenti di supporto come **liquidazione IVA**, **F24**, **adempimenti** e **automazioni** basate su intelligenza artificiale.

### A cosa serve

- **Ridurre il tempo** dedicato all’inserimento manuale dei dati dalle fatture.
- **Tenere ordine** su clienti, documenti e registrazioni contabili.
- **Usare l’intelligenza artificiale** dove ha senso (lettura e proposte), **senza sostituire** il giudizio del professionista.
- **Collegare** import documenti, contabilità e adempimenti in un flusso coerente.

### A chi è rivolto

- **Commercialisti e collaboratori** che gestiscono più clienti e molti documenti.
- **Studi professionali** che vogliono procedure ripetibili e tracciabili.
- Chi cerca un **equilibrio tra automazione e controllo**: il sistema propone, l’operatore decide.

---

## 2. Panoramica generale

### Struttura del software (moduli principali)

L’interfaccia è organizzata in **aree** (menu laterale). Le più usate nel quotidiano sono:

| Area | Contenuto tipico |
|------|-------------------|
| **Studio** | Dashboard, **Clienti**, import da Excel, **Utenti** dello studio, **Impostazioni**, **Impostazioni Procedure**, deleghe |
| **Document Hub** | **Import Documenti**, **Import Nuovo**, export, fatture massive ADE, lettura mail, richieste fatture |
| **Contabilità** | **Prima Nota**, **Piano dei Conti**, **Partitario**, **Bilancio** |
| **Strumenti** | Liquidazione **IVA**, **F24**, simulatore, ammortamenti, certificazioni, revisione dichiarativi, AgeCon |
| **Comunicazioni** | Adempimenti, agenda invii |
| **FiscoSim AI** | Accesso alle funzioni assistite dall’intelligenza artificiale (ove configurato) |

Non serve usare tutti i moduli subito: molti utenti iniziano da **Import Documenti** e **Prima Nota**.

### Concetto di pipeline automatica

Per **pipeline** si intende la **sequenza di passaggi** che un documento attraversa dall’upload alla registrazione contabile (e oltre), senza che dobbiate ripetere le stesse operazioni per ogni file.

In sintesi:

1. **Arrivo del documento** (caricamento o import).
2. **Lettura e comprensione** del contenuto (dove intervengono parsing e, se attiva, l’AI).
3. **Classificazione e assegnazione** al cliente / tipo documento.
4. **Proposta contabile** (righe di prima nota, con eventuale uso della memoria AI).
5. **Verifica e conferma** da parte dell’operatore.
6. **Stato finale** “elaborato” quando il flusso è completo e coerente.

I documenti possono mostrare **stati** (es. in attesa di AI, da classificare, classificato, elaborato, errore): servono a capire **dove si è fermato** il flusso.

### Differenza tra AI e operatività manuale

| | **Con AI** | **Senza AI / manuale** |
|---|------------|-------------------------|
| **Chi inserisce i dati** | Il sistema estrae e propone; voi controllate | Inserite voi importi, conti, causali |
| **Velocità** | Più alta su documenti standard | Più lenta ma massimo controllo passo passo |
| **Errori** | Possibili su PDF difficili o dati ambigui | Dipendono dall’attenzione umana |
| **Quando usarla** | Volume elevato, documenti ripetitivi | Eccezioni, casi particolari, correzioni mirate |

L’AI **non sostituisce** la responsabilità professionale: **validare** resta un passo obbligatorio.

---

## 3. Guida operativa per obiettivi

### “Cosa vuoi fare?”

Questa è la sezione principale: **scegiete l’obiettivo** e seguite i passi.

---

#### 3.1 Importare una fattura

**Descrizione semplice**  
Caricare in FiscoSim un file (PDF, XML, immagine, ecc.) così che diventi un **documento** tracciato e possa entrare nella pipeline.

**Step operativi**

1. Aprite **Import Documenti** o **Import Nuovo** (secondo la procedura adottata dallo studio).
2. Selezionate la **società / cliente** corretto, se richiesto.
3. **Caricate il file** (trascina e rilascia o pulsante di scelta file).
4. Attendete l’elaborazione: compariranno stati di avanzamento o messaggi informativi.
5. Verificate che il documento compaia in elenco con uno stato sensato (es. “in attesa AI” o “classificato”).

**Cosa succede dietro (breve)**  
Il sistema memorizza il file, avvia la lettura del contenuto (XML strutturato o testo/immagine per PDF) e prepara i dati per classificazione e contabilità.

**Errori comuni**

- **Cliente sbagliato** selezionato prima dell’import: il documento finisce nel fascicolo errato.
- **File corrotto o protetto**: il sistema non estrae testo utile — provare con un altro PDF o chiedere al fornitore una copia leggibile.
- **Dimenticare di controllare lo stato**: un documento può restare “in attesa” se manca un passaggio successivo (classificazione o prima nota).

---

#### 3.2 Registrare una fattura passiva

**Descrizione semplice**  
Registrare un **acquisto** (costo) con le righe contabili e l’IVA corretti.

**Step operativi**

1. Portate il documento fino a uno stato che consenta la **Prima Nota** (classificazione e tipo “fattura acquisto” se previsto).
2. Aprite **Prima Nota** (Contabilità) e selezionate cliente/società e periodo.
3. Aprite il documento o la registrazione collegata.
4. Controllate **imponibile, IVA, totale** rispetto al PDF/XML originale.
5. Verificate o modificate **conti** e **causali IVA** secondo il piano dei conti e le policy dello studio.
6. **Salvate** o confermate la registrazione secondo i pulsanti disponibili.

**Cosa succede dietro**  
Le righe formano una registrazione in **partita doppia**; l’IVA può alimentare la liquidazione periodica se i moduli sono collegati.

**Errori comuni**

- **Totali** che non coincidono con la fattura: spesso decimali o righe duplicate.
- **Causale IVA** non coerente con l’aliquota: controllare **Impostazioni Procedure** (causali) se lo studio usa defaults per aliquota.
- **Data competenza** errata: incide su periodo IVA e bilanci.

---

#### 3.3 Registrare una fattura attiva

**Descrizione semplice**  
Registrare una **vendita** (ricavo) con IVA e conti corretti.

**Step operativi**

1. Assicuratevi che il documento sia tipizzato come **vendita** / fattura emessa.
2. In **Prima Nota**, aprite la registrazione collegata al documento.
3. Verificate **cliente**, **imponibile**, **IVA** e **totali**.
4. Impostate i **conti** (ricavi, IVA a debito, crediti verso clienti) come da piano dei conti.
5. Salvate e controllate che lo stato documento evolva verso **elaborato** se previsto.

**Cosa succede dietro**  
Analogamente al passivo, con natura economica opposta (ricavi al posto dei costi).

**Errori comuni**

- Confondere **attivo e passivo** in fase di classificazione iniziale.
- **Aliquota IVA** errata su servizi misti o split payment: richiede attenzione manuale.

---

#### 3.4 Controllare una registrazione AI

**Descrizione semplice**  
L’AI può aver proposto righe di prima nota o valori estratti: il **controllo** è il passo che trasforma una proposta in una registrazione affidabile.

**Step operativi**

1. Individuate documenti con proposta AI o etichette di “proposta” / stato intermedio.
2. Aprite la **Prima Nota guidata** o la schermata di dettaglio collegata al documento.
3. Confrontate **riga per riga** con PDF/XML: importi, descrizioni, conti, IVA.
4. Se presente, leggete il livello di **confidence** (affidabilità stimata) come **indicatore**, non come verità assoluta.
5. **Apportate correzioni** dove necessario prima di considerare chiusa la pratica.

**Cosa succede dietro**  
Il sistema può registrare la versione approvata e, dove previsto, alimentare la **memoria AI** con correzioni utili ai documenti futuri.

**Errori comuni**

- **Fidarsi al 100%** senza aprire il PDF.
- Ignorare **anomalie** segnalate (totali, squilibri dare/avere).
- Non correggere: la memoria impara anche da ciò che confermate, non solo da errori evidenti.

---

#### 3.5 Correggere una registrazione

**Descrizione semplice**  
Modificare importi, conti, causali o righe dopo una prima registrazione.

**Step operativi**

1. Da **Prima Nota** o dal documento, aprite la registrazione da modificare.
2. Editare le **righe** interessate (importi, conto dare/avere, causale IVA).
3. Verificate che **dare e avere** tornino e che i totali coincidano con il documento.
4. Salvate. Se il documento era già “elaborato”, valutate se serve **ripristinare** uno stato precedente secondo le regole dello studio.

**Cosa succede dietro**  
La contabilità si aggiorna; eventuali collegamenti IVA o partitario dipendono dal modulo e dal periodo.

**Errori comuni**

- Correggere solo il totale e non le **singole righe** IVA.
- Lasciare **dare ≠ avere**: la prima nota in partita doppia deve quadrare.

---

#### 3.6 Gestire clienti e fornitori

**Descrizione semplice**  
Anagrafiche di **clienti** dello studio e soggetti collegati ai documenti (acquirenti, fornitori).

**Step operativi**

1. Aprite **Clienti** dal menu Studio.
2. **Cercate** per ragione sociale, partita IVA o codice.
3. Per un nuovo soggetto, usate **Nuovo** e compilate i campi obbligatori richiesti dallo studio.
4. Collegate il cliente alle **società** o mandati previsti dalla vostra organizzazione.
5. In import documenti, **selezionate sempre il cliente giusto** prima di caricare file.

**Cosa succede dietro**  
I documenti e le registrazioni restano **filtrabili** per cliente; report e bilanci dipendono da questa associazione.

**Errori comuni**

- **Duplicati** (stesso fornitore creato due volte con nomi leggermente diversi).
- **P.IVA errata**: rende difficile il match automatico con fatture elettroniche.

---

#### 3.7 Usare automazione contabile

**Descrizione semplice**  
Automazione = il sistema applica **regole predefinite** (es. causali IVA per aliquota, procedure da **Impostazioni Procedure**) per proporre o completare registrazioni senza riscrivere ogni volta gli stessi passaggi.

**Step operativi**

1. Chi ha permessi configuri **Impostazioni Procedure** (es. causali IVA, flag “usa per automazione” dove previsto).
2. In prima nota, quando importate o confermate documenti idonei, verificate le **proposte automatiche**.
3. Controllate sempre **eccezioni** (servizi esenti, reverse charge, split payment).

**Cosa succede dietro**  
Le regole dello studio guidano conti e causali; l’AI può **combinarsi** con queste regole, non sostituirle alla cieca.

**Errori comuni**

- Regole troppo generiche che generano **causali sbagliate** su casi speciali.
- Non aggiornare le procedure quando cambia il piano dei conti.

---

#### 3.8 Usare IA locale vs IA online

**Descrizione semplice**  
FiscoSim può usare un motore AI **in locale** (es. sul proprio ambiente) o **online** (servizio remoto), a seconda della configurazione scelta dallo studio.

**Step operativi**

1. Verificate nelle **impostazioni** o nel modulo di import quale **modalità AI** è attiva (locale / online).
2. Per **documenti sensibiti**, lo studio può preferire la modalità locale se disponibile.
3. Per **qualità massima** su PDF complessi o immagini, la modalità online può essere più adatta (se abilitata).
4. Dopo il cambio modalità, **ripetete un test** su un documento campione se i risultati sembrano diversi.

**Cosa succede dietro**  
Stesso tipo di compiti (lettura, proposte), **motore diverso**; tempi e dettagli possono variare.

**Errori comuni**

- Attendere gli **stessi identici risultati** passando da locale a online: possono differire.
- **Privacy**: decidere a livello di studio quali documenti possono essere inviati al motore online.

---

#### 3.9 Verificare risultati pipeline

**Descrizione semplice**  
Controllare che un documento abbia attraversato tutti i passaggi previsti e sia **coerente** con obiettivi contabili.

**Step operativi**

1. Dalla lista documenti, filtrate per **stato** (elaborato, errore, in attesa).
2. Per i non elaborati, leggete **messaggi** o log se esposti (es. pannello debug solo per utenti tecnici).
3. Aprite **Prima Nota** e verificate che la registrazione esista e quadri.
4. Incrociate con **Liquidazione IVA** o **Partitario** se il caso lo richiede.

**Cosa succede dietro**  
Ogni passaggio aggiorna stati e tabelle; un blocco in un punto impedisce il completamento “pulito” della pipeline.

**Errori comuni**

- Considerare “ok” solo perché il file è stato caricato: **caricato ≠ contabilizzato**.
- Non riaprire i documenti in **errore**: restano incompleti finché non si interviene.

---

## 4. Sezione AI (chiave)

### Come funziona l’AI in FiscoSim

L’intelligenza artificiale in FiscoSim **non è un unico pulsante magico**: è un insieme di funzioni che:

- **Leggono** testo e talvolta immagini dai documenti.
- **Propongono** dati strutturati (importi, date, descrizioni, righe contabili).
- Possono usare una **memoria** (vedi sotto) per avvicinarsi alle abitudini dello studio.

In ogni caso, l’output è una **proposta**: il professionista **conferma o corregge**.

### Differenza: AI parsing, AI accounting, memoria

| Concetto | Cosa fa | Esempio pratico |
|----------|---------|-----------------|
| **AI parsing** | Estrae dal documento (PDF/XML/immagine) i **dati anagrafici e economici** (fornitore, totali, righe, IVA) | “Dal PDF ricavo imponibile 1.000 € e IVA 220 €” |
| **AI accounting** | Propone le **righe di prima nota** (dare/avere, conti) coerenti con i dati già noti | “Propongo dare fornitore, avere costo + IVA a credito” |
| **Memoria (autoapprendimento)** | Usa **correzioni e documenti simili passati** per avvicinare conti e comportamenti alle scelte dello studio | “Per questo fornitore di solito usate conto X” |

### Quando fidarsi e quando controllare

**Fidarsi di più (ma sempre con verifica a campione)** quando:

- Il documento è **chiaro**, standard, stesso fornitore di sempre.
- L’**XML FatturaPA** è completo e valido.
- La **confidence** è alta e i totali **quadrano** al centesimo.

**Controllare sempre con attenzione** quando:

- PDF **scansionati male**, sbiaditi o con tabelle complesse.
- Operazioni **non ricorrenti** (cessioni immobili, esenzioni, reverse charge).
- Importi **strani** o incoerenti tra imponibile, IVA e totale.
- Primo utilizzo con un **nuovo fornitore** o nuovo piano dei conti.

**Regola pratica:** *se dubitate, aprite il documento originale e confrontate tre numeri: imponibile, IVA, totale.*

---

## 5. Automazione

### Modalità manuale vs automatica

- **Manuale**: inserite (o correggete) tutto campo per campo; massimo controllo, più tempo.
- **Automatica / semi-automatica**: il sistema propone causali, conti o intere righe in base a **regole** e **AI**; voi **validate** o **sistemate le eccezioni**.

Nessuna automazione sostituisce la **revisione umana** su campioni e casi critici.

### Confidence

La **confidence** (affidabilità) è un **indicatore sintetico** della qualità percepita della proposta AI (es. dopo parsing o contabilità).

- **Alta**: buon segnale, ma **non è una garanzia legale**.
- **Bassa**: invita a **controllare tutto** con lentezza.

Usate la confidence per **prioritizzare**: prima i casi a bassa confidence, poi il resto a campione.

### Quando interviene l’operatore

- **Classificazione** del documento (tipo, cliente) se non automatica.
- **Conferma o correzione** delle righe di prima nota.
- **Gestione errori** (documento in errore, parsing fallito).
- **Decisioni fiscali** (es. indetraibilità, esclusioni) che il software non può decidere al posto vostro.

---

## 6. Casi pratici

### Esempio: fattura PDF

1. Caricate il PDF in **Import Documenti** per il cliente corretto.
2. Attendete parsing e classificazione; aprite il documento e verificate **totali e P.IVA**.
3. Aprite la **Prima Nota** collegata e controllate le righe proposte.
4. Se tutto quadra, confermate; altrimenti correggete conti o causali e salvate.

*Nota:* PDF molto complessi possono richiedere **più tempo** o esito meno preciso: in quel caso il controllo manuale è ancora più importante.

### Esempio: fattura XML

1. Importate il file **XML** (o container come previsto dal modulo).
2. Il sistema sfrutta la **struttura dati**: di solito meno errori di lettura rispetto a uno scan.
3. Verificate comunque **date, numeri documento e aliquote** rispetto all’obbligo di conservazione.
4. Procedete con prima nota come nell’esempio PDF.

### Esempio: errore AI + correzione

1. Il documento risulta **in errore** o la prima nota **non quadra** (dare ≠ avere).
2. Aprite il **PDF originale** e annotate i valori corretti (imponibile, IVA, totale).
3. In Prima Nota, **modificate le righe** o eliminate quelle errate e reinseritele.
4. Salvate e verificate che lo stato diventi coerente (**elaborato** o equivalente).
5. Se la memoria AI è attiva, le **correzioni** possono aiutare i documenti futuri dello stesso tipo.

---

## 7. Risoluzione problemi

### L’AI non legge il PDF

- Provate un **altro file** (es. PDF esportato da fattura elettronica invece di una scansione).
- Verificate se lo studio può usare **IA online** per documenti difficili.
- Controllate che il PDF non sia solo **immagine** troppo bassa o protetto da copia.
- In ultima istanza: **inserimento manuale** guidato dalla prima nota.

### Dati errati dopo l’import

- Confrontate sempre con **XML o PDF** ufficiale.
- Verificate **classificazione** (acquisto vs vendita) e **cliente** associato.
- Controllate **aliquote** e causali in **Impostazioni Procedure**.

### Cliente non trovato

- Cercate per **partita IVA** e non solo per nome (errori di battitura).
- Evitate duplicati: prima **cercate**, poi create un nuovo cliente.
- Allineate l’anagrafica ai **nomi usati in fattura**.

### IVA non corretta

- Verificate **aliquota** sulla riga documento e in prima nota.
- Controllate la **causale IVA** associata all’aliquota (defaults in Impostazioni Procedure).
- Per casi speciali (es. **reverse charge**, **split payment**), spesso serve **intervento manuale** e documentazione a supporto.

---

## 8. Glossario

| Termine | Significato in parole semplici |
|---------|-------------------------------|
| **Parsing** | Lettura automatica del documento per **estrarre** testo e dati strutturati (numeri, date, anagrafiche). |
| **Partita doppia** | Metodo contabile dove ogni operazione ha **almeno due righe** (dare e avere) che si **equilibrano**. |
| **Causale IVA** | **Codice / categoria** che lega un movimento alle logiche di liquidazione IVA (es. acquisti, vendite, esclusioni) secondo le impostazioni dello studio. |
| **Pipeline** | **Percorso completo** del documento: da import a registrazione (e stati intermedi), passo dopo passo. |
| **Memory AI** | Funzionalità che **ricorda** abitudini e correzioni passate per **avvicinare** le proposte future al modo di lavorare dello studio (non sostituisce il controllo umano). |

---

## Chiusura

FiscoSim è pensato per **far risparmiare tempo** e **ridurre errori ripetitivi**, mantenendo il **controllo professionale** su ogni registrazione importante.

Per dubbi su **permessi utente**, **configurazione avanzata** o **integrazioni**, fate riferimento all’amministratore dello studio o alla documentazione tecnica dedicata.

---

*Fine manuale utente FiscoSim*
