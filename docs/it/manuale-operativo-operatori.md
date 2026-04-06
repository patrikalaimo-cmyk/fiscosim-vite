# FiscoSim — Manuale operativo per operatori contabili

**Destinatari:** personale contabile che usa FiscoSim quotidianamente (inserimento dati, controlli, IVA, F24).  
**Lingua:** italiano; i **nomi esatti di schermate e pulsanti** seguono l’interfaccia dell’app.

**Screenshot:** le figure sono file PNG nella cartella `docs/assets/it/operativo/` (percorsi relativi da questo file: `../assets/it/operativo/…`). Se il file non è ancora presente, vedrai un’icona rotta nel viewer: sostituiscila con la cattura reale da FiscoSim (stessa risoluzione consigliata, nome file invariato).

| Campo | Valore |
|-------|--------|
| **Prodotto** | FiscoSim |
| **Tipo documento** | Manuale operativo — procedure quotidiane |
| **Versione** | 1.0-it |
| **Aggiornamento** | 2026 |

## Scheda per l’esportazione PDF (ChatGPT)

Copia il blocco sotto in ChatGPT, poi incolla **tutto il manuale** (o da «Indice» in poi). Chiedi un PDF o un documento esportabile in PDF.

```
Crea un PDF professionale stile manuale utente di software contabile/fiscale italiano (tono istituzionale, sobrio).

Struttura: copertina con titolo "FiscoSim — Manuale operativo", versione 1.0-it, 2026; pagina metadati; indice con numeri di pagina; capitoli numerati come nel Markdown.

Stile: margini 2,5 cm; numerazione pagine; titoli sans-serif, corpo serif 10,5–11 pt, interlinea 1,15. Tabelle con bordo #CCCCCC e intestazione sfondo #F2F4F7. Note operative in riquadro bordo sinistro #1a5276, sfondo #f8fafc. Massima leggibilità, nessun elemento decorativo superfluo.
```

---

## Indice

1. [Come usare questo manuale](#1-come-usare-questo-manuale)
2. [Assistenza AI e lavoro manuale](#2-assistenza-ai-e-lavoro-manuale)
3. [Importazione documenti](#3-importazione-documenti)
4. [Scritture contabili (Prima nota)](#4-scritture-contabili-prima-nota)
5. [IVA nel lavoro quotidiano](#5-iva-nel-lavoro-quotidiano)
6. [Liquidazione IVA (periodica)](#6-liquidazione-iva-periodica)
7. [Gestione F24](#7-gestione-f24)
8. [Checklist rapida di fine mese](#8-checklist-rapida-di-fine-mese)

---

## 1. Come usare questo manuale

Ogni capitolo indica:

- **Quando usare** l’area del prodotto  
- **Passi operativi** in sequenza  
- **Quando fare affidamento all’AI** e quando intervenire **a mano**  
- **Esempi** da adattare al tuo studio (le cifre sono indicative)

Le immagini sono integrate come riga Markdown `![testo alt](percorso)`; vedi nota in cima per la cartella di salvataggio.

---

## 2. Assistenza AI e lavoro manuale

FiscoSim può **proporre** classificazioni, estrazione testo e righe contabili. **La responsabilità** di correttezza fiscale e contabile resta **tua**.

### 2.1 Cosa si intende di solito per “modalità AI”

In app possono comparire scelte simili a:

| Concetto | In parole semplici | Quando l’operatore la usa |
|----------|-------------------|---------------------------|
| **Locale** | L’elaborazione avviene sull’infrastruttura AI dello studio (es. in rete). | Spesso predefinita; il documento non esce dall’ambiente per quel passaggio. |
| **Online** | Un’AI in cloud legge il documento (PDF, scansioni). | Se **locale** non basta, o il file è **scannerizzato** / PDF molto “immagine”. |

Per alcuni import esiste anche **preprocess**: il sistema può **pulire e accorciare** il testo inviato all’AI (spesso meglio sulle fatture lunghe) oppure inviare testo **grezzo**. Se non sei sicuro, per fatture lunghe parti con **preprocess attivo**.

![Impostazioni motore AI / selettore modalità](../assets/it/operativo/02-impostazioni-motore-ai.png)

### 2.2 Regole d’oro per gli operatori

1. **Non confermare** una proposta che non hai capito.  
2. Le **fatture elettroniche XML** sono spesso lette con **regole deterministiche** (non “creatività” dell’AI): **controlla** comunque totali, aliquote IVA e ragione sociale fornitore.  
3. **PDF e scansioni** dipendono di più dall’AI: **confronta** sempre con l’originale affiancato.  
4. Se l’app segnala **bassa confidenza** o origine **manuale**, considera la registrazione come **principalmente tuo lavoro**.

### 2.3 Esempio — online vs locale

- **Esempio A:** PDF con **testo selezionabile** → prova **locale**; se i conti non tornano, passa a **online** e ripeti.  
- **Esempio B:** PDF **scannerizzato** (niente testo selezionabile) → **locale** può fallire o dare testo scadente → **online** (se lo studio lo consente).  
- **Esempio C:** **XML** da SDI → privilegia la **revisione manuale** dei campi strutturati; l’AI è meno centrale al primo caricamento.

---

## 3. Importazione documenti

**Obiettivo:** far entrare in FiscoSim fatture, avvisi e altri file così che possano essere classificati, collegati al cliente e inviati a **Prima nota** o ad altri flussi.

**Modulo principale:** **Import Documenti** (hub unificato) dal menu di navigazione.

![Import Documenti — schermata principale](../assets/it/operativo/03-import-documenti-principale.png)

### 3.1 Quando usare questo modulo

- Nuove fatture **PDF** o **immagine**, contratti, F24, avvisi ADE, ecc.  
- Vuoi che il sistema **proponga il tipo documento** e **abbini il cliente** (P.IVA / CF) prima di contabilizzare.

### 3.2 Passi operativi — importare un file

1. Apri **Import Documenti** dal menu.  
2. Seleziona la **società** su cui stai lavorando, se il tuo utente ne gestisce più di una.  
3. Clicca **carica** oppure trascina il file nella zona di drop.  
4. Attendi **analisi** (barra di avanzamento o messaggi).  
5. Controlla il **tipo documento proposto** (es. fattura passiva, F24, altro).  
6. Verifica **abbinamento cliente**: se la P.IVA coincide con **Clienti**, il cliente è collegato; altrimenti **scegli il cliente a mano** o crea/aggiorna prima **Clienti**.  
7. Correggi **campi** (importi, date, descrizione) se qualcosa non torna.  
8. **Salva** o **conferma** così il documento entra nel flusso (es. disponibile in **Prima nota**).

![Import Documenti — dopo l’analisi, pannello proposte](../assets/it/operativo/03-import-documenti-dopo-analisi.png)

### 3.3 AI e manuale in fase di import

| Situazione | Approccio suggerito |
|------------|---------------------|
| Fattura **XML / p7m** | Spesso parsing **senza** AI generativa; **verifica** righe e IVA. |
| **PDF con testo** | AI (locale o online) propone tipo e campi; **tu confermi**. |
| **Scansione / foto** | Meglio **online** se locale è debole; **controlla sempre** i totali. |
| Documento **anomalo** | **Compilazione manuale** dei campi; usa l’AI solo come bozza. |

### 3.4 Esempio — fattura passiva PDF

1. Carichi `fattura_fornitore_2026_03.pdf`.  
2. Il sistema propone: **Fattura passiva**, fornitore **Rossi Srl**, totale **€ 1.220,00** IVA inclusa.  
3. Apri l’**anteprima** laterale, noti la **data scadenza** errata, la correggi.  
4. Confermi; il documento compare in **Prima nota** per quella società.

### 3.5 Esempio — fattura XML

1. Carichi `IT01234567890_abc.xml`.  
2. Il sistema compila **numero**, **data**, **righe**, **IVA** dall’XML.  
3. Assegni il **conto di costo** o lasci che **Prima nota** gestisca il passo successivo.  
4. Per il **parse iniziale** non serve cambiare modalità AI; concentrati sulla **contabilità** in **Prima nota**.

### 3.6 Altri percorsi di import (riferimento rapido)

- **Import Excel:** tabelle massive (es. clienti), non il flusso tipico “singola fattura”.  
- **Lettura Mail:** prelievo automatico dalla casella; l’operatore **rivedrà** comunque gli elementi classificati.

![Menu: Import Documenti vs Import Excel](../assets/it/operativo/03-menu-import-vs-excel.png)

---

## 4. Scritture contabili (Prima nota)

**Obiettivo:** trasformare documenti importati o movimenti manuali in **registrazioni in partita doppia**, coerenti col mastro.

**Modulo principale:** **Prima nota** / **Contabilità** (in guida può comparire come **Prima Nota**).

![Prima nota — elenco documenti](../assets/it/operativo/04-prima-nota-elenco.png)

### 4.1 Quando usare questo modulo

- Dopo l’**import**, per **proporre o modificare** le righe giornaliere.  
- Per **validare** le registrazioni prima che siano “ufficiali” per il periodo.  
- Per collegare i **conti** dal **Piano dei conti** e le **causali IVA** ove richiesto.

### 4.2 Passi operativi — lavorare un documento

1. Apri **Prima nota** e seleziona la **società**.  
2. Usa i filtri (**data**, **stato**, **fornitore**) per trovare il documento.  
3. Apri il documento; controlla **anteprima PDF/XML** (se presente) accanto al modulo.  
4. Verifica le righe **dare/avere**: i totali devono **quadrare**.  
5. Assegna o correggi i **conti** (costo, IVA, debiti verso fornitori, ecc.).  
6. Imposta la **causale IVA** se il flusso dello studio lo richiede per i registri.  
7. **Salva** bozza o **valida** quando sei soddisfatto.  
8. Se compare uno stato tipo **proposto dall’AI**, la validazione può portarlo a **confermato** (etichette dipendono dalla configurazione).

![Prima nota — vista affiancata documento + righe](../assets/it/operativo/04-prima-nota-split.png)

### 4.3 AI e manuale in Prima nota

| Situazione | Approccio suggerito |
|------------|---------------------|
| Badge **AI_PROPOSED** / simile | Leggi ogni riga; **accetta** solo se economicamente corretta. |
| **Conto mancante** | Scelta **manuale** dal **Piano dei conti**; non improvvisare. |
| **Fornitore ricorrente** | Dopo una correzione, gli import successivi possono **suggerire** lo stesso conto — **controlla a campione**. |
| Periodo di **audit stringente** | Anche con AI disponibile, per voci sensibili preferisci **inserimento manuale**. |

### 4.4 Esempio — correzione conti proposti dall’AI

- Documento: materiale di consumo **€ 100 + IVA**.  
- L’AI propone un **generico “costi”**; tu passi a **“Spese di ufficio”** secondo policy dello studio.  
- Validi; **Partitario** e **IVA** a valle useranno questo conto.

### 4.5 Esempio — riga interamente manuale

- Piccola uscita **senza** PDF: crea il movimento in **Prima nota** (o nel percorso che usa il tuo studio), inserisci **due righe** in pareggio, indica **IVA** se applicabile.

![Piano dei conti — selezione conto](../assets/it/operativo/04-piano-conti-picker.png)

---

## 5. IVA nel lavoro quotidiano

**Obiettivo:** capire come si forma giorno per giorno il dato **IVA** prima di arrivare a **Liquidazione IVA**.

Non sempre esiste un capitolo menu solo “registri IVA”; spesso:

- **Prima nota** e **import** alimentano **righe** e **causali IVA**.  
- Il sistema può costruire o proporre movimenti di **registro IVA** al salvataggio/validazione (secondo configurazione).

![Prima nota — campi IVA / causale](../assets/it/operativo/05-prima-nota-campi-iva.png)

### 5.1 Responsabilità dell’operatore

1. **Causale IVA** corretta (o equivalente) sulle righe che devono comparire nei registri **acquisti/vendite**.  
2. **Date coerenti** (registrazione vs data documento) secondo policy dello studio.  
3. Dopo la registrazione, controllo a campione di **report** o anteprima **Liquidazione** se disponibile.

### 5.2 AI e manuale per l’IVA

- L’**AI** può proporre **aliquote** dal testo fattura; **tu** devi allinearle a **normativa** e a **dati XML** se presenti.  
- Per **fatture XML**, in caso di differenza privilegia i **valori XML** rispetto a ipotesi dell’AI.  
- L’**override manuale** è sempre possibile prima della validazione.

### 5.3 Esempio — acquisto con IVA 22%

- Importi fattura passiva; l’XML indica **22%**.  
- In **Prima nota** ti assicuri che la riga porti **22%** e la **causale** corretta.  
- Validi; i totali del mese nei registri includeranno questo acquisto.

---

## 6. Liquidazione IVA (periodica)

**Obiettivo:** per ogni **cliente** e **periodo** (mese o trimestre), registrare **IVA vendite**, **IVA acquisti**, **credito precedente** e **importo dovuto o credito**.

**Modulo principale:** **Liquidazione IVA** (titolo pagina **Liquidazione IVA**, sottotitolo sulle liquidazioni periodiche).

![Liquidazione IVA — pagina completa](../assets/it/operativo/06-liquidazione-iva-pagina.png)

### 6.1 Due modi per creare una liquidazione

**A) Import da file (lettura assistita da AI)**  
**B) Nuovo record manuale**

### 6.2 Passi operativi — importare un documento di liquidazione

1. Apri **Liquidazione IVA**.  
2. In **Importa da documento**, trascina o seleziona **PDF, Excel o CSV** (es. prospetto del consulente).  
3. Attendi l’**estrazione** dei campi (può comparire un messaggio tipo “lettura documento”).  
4. Controlla l’**anteprima**: ragione sociale, P.IVA, **periodo**, **IVA vendite**, **IVA acquisti**, **credito precedente**, ecc.  
5. Se la **P.IVA coincide con Clienti**, vedrai conferma; altrimenti **scegli il cliente** nel passo successivo.  
6. Clicca **Crea liquidazione con questi dati** per aprire il modulo precompilato.  
7. Regola i campi necessari, poi **salva**.  
8. Imposta lo **stato** (bozza / confermata / inviata) secondo il processo interno.

![Liquidazione IVA — anteprima dati estratti](../assets/it/operativo/06-liquidazione-anteprima.png)

### 6.3 Passi operativi — liquidazione manuale

1. Clicca **+ Nuova manuale**.  
2. Seleziona **cliente** e **periodo**.  
3. Inserisci **IVA vendite**, **IVA acquisti**, **credito precedente** e gli altri campi obbligatori.  
4. **Salva**.  
5. Usa **modifica** (matita) in seguito per correzioni.

![Liquidazione IVA — modale nuova manuale](../assets/it/operativo/06-liquidazione-nuova-manuale.png)

### 6.4 AI e manuale in Liquidazione IVA

| Situazione | Approccio suggerito |
|------------|---------------------|
| Il consulente invia riepilogo **PDF/Excel** | Usa **import**; poi **confronta** con il **file sorgente**. |
| Le cifre non coincidono con **Prima nota** | **Riconciliazione manuale**: correggi **Prima nota** o riga di **liquidazione**, non fidarti ciecamente dell’import. |
| **Prima volta** per un cliente | Una volta **manuale** per imparare il formato; dal periodo successivo prova l’import. |

### 6.5 Esempio — liquidazione mensile da import

- File: `Liquidazione_marzo_2026.pdf` per **Cliente Bianchi Srl**.  
- L’import compila **IVA vendite € 18.400**, **IVA acquisti € 9.200**, **credito precedente € 500**.  
- Confronti con il tuo **prospetto interno**: coincidono.  
- Salvi come **confermata** e archivi il PDF esternamente se richiesto.

### 6.6 Esempio — debito vs credito

- Dopo il salvataggio, in elenco compare **Dovuta** (rosso) se l’IVA è da versare, o **Credito** (verde) se resta un credito.  
- Comunica l’importo al cliente secondo procedura dello studio.

![Liquidazione IVA — tabella archivio con saldo e stato](../assets/it/operativo/06-liquidazione-archivio.png)

---

## 7. Gestione F24

**Obiettivo:** tenere sotto controllo **scadenze F24**, importi e **stato** (aperto/chiuso) per cliente o secondo processo dello studio.

**Modulo principale:** **Gestione F24**.

![Gestione F24 — dashboard principale](../assets/it/operativo/07-f24-principale.png)

### 7.1 Quando usare questo modulo

- Monitorare le **prossime scadenze F24**.  
- Registrare **pagamenti** o **chiusure** per ogni “blocco” di scadenza.  
- Esportare o rivedere elenchi per **controllo interno** (pulsanti esatti dipendono dalla versione).

### 7.2 Passi operativi — primo accesso

1. Apri **Gestione F24**.  
2. Se compare un messaggio su **database / tabella mancante**, avvisa **IT** (schema Supabase da aggiornare).  
3. A caricamento avvenuto, vedi **scadenze** e righe collegate.

![Gestione F24 — elenco scadenze](../assets/it/operativo/07-f24-scadenze.png)

### 7.3 Passi operativi — nuova scadenza

1. Usa il controllo per aggiungere una **nuova scadenza** (es. etichetta + **data scadenza**).  
2. **Salva**.  
3. Selezionala in elenco per inserire **righe F24** o importi come previsto dalla schermata.  
4. Segna **chiusa** quando tutto è pagato/elaborato, o riapri se serve.

### 7.4 AI e manuale per F24

- **F24** in FiscoSim è soprattutto **guidato dall’operatore**: inserisci **importi e codici** dall’F24 ufficiale o dal file del consulente.  
- L’**AI** **non** è lo strumento principale qui; usa sempre **importi ufficiali** da **Agenzia delle Entrate** o **conferma banca**.  
- Se **Import Documenti** classifica un **PDF F24**, aiuta **archiviare** il documento — i **dati di pagamento** passano comunque da **Gestione F24** (o dal ponte che usa il tuo studio).

### 7.5 Esempio — ciclo trimestrale

1. Crei scadenza **16/05/2026 — Acconto IVA Q1**.  
2. Inserisci importi per **cliente** (o secondo regole dello studio).  
3. Dopo il bonifico, annota nel DMS e imposta stato **chiusa** in FiscoSim.

### 7.6 Esempio — correzione

- Importo errato: **riapri** scadenza o riga, **modifica**, **salva**; lascia nota di **audit** fuori app se richiesto.

![Gestione F24 — dettaglio / righe pagamento](../assets/it/operativo/07-f24-dettaglio.png)

---

## 8. Checklist rapida di fine mese

Usala come **lista di controllo** interna (adatta al tuo studio).

| Passo | Modulo | Fatto |
|-------|--------|------|
| Tutte le fatture in **Import Documenti** riviste | Import Documenti | ☐ |
| **Prima nota** validata per il periodo | Prima nota | ☐ |
| Controllo **causali IVA** e aliquote | Prima nota | ☐ |
| **Liquidazione IVA** creata o importata per ogni cliente IVA | Liquidazione IVA | ☐ |
| **F24**: scadenze aggiornate; voci pagate chiuse | Gestione F24 | ☐ |
| Righe **assistite da AI** **ricontrollate** | Tutti | ☐ |

---

## Storia documento

| Versione | Data | Note |
|----------|------|------|
| 1.0-it | 2026-04 | Prima versione italiana; screenshot da collocare in `docs/assets/it/operativo/` |

---

*Questo manuale descrive flussi tipici di FiscoSim. Etichette e pulsanti possono variare leggermente per versione. Per setup tecnico (server, API, database) vedi [Manuale tecnico per sviluppatori](./manuale-tecnico-sviluppatori.md); per i test QA vedi [Guida ai test completa](./guida-test-completa.md).*
