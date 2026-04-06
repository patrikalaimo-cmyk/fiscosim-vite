# FiscoSim — Guida ai test (procedura passo passo)

| Campo | Valore |
|-------|--------|
| **Prodotto** | FiscoSim |
| **Tipo documento** | Piano di test QA — procedure ripetibili |
| **Versione** | 1.0-it |
| **Aggiornamento** | 2026 |
| **Formato sorgente** | Markdown |

**Obiettivo:** eseguire controlli ripetibili per validare le funzionalità end-to-end.  
**Formato:** ogni prova usa le etichette **PASSO n:** ed **ESITO ATTESO:** su righe dedicate.  
**Screenshot:** file PNG in `docs/assets/it/test/` (percorso relativo da questo file: `../assets/it/test/…`).

---

## Scheda per l’esportazione PDF (ChatGPT o altri strumenti)

> **Come usarla:** copia il riquadro sotto in ChatGPT, poi incolla **l’intero file** (o da «Indice» in poi). Richiedi output PDF o Word da convertire in PDF.

**Prompt suggerito (incolla prima della guida):**

```
Crea un PDF professionale stile piano di test / manuale QA per software contabile italiano (aspetto serio, da studio professionale).

Struttura:
- Copertina: "FiscoSim — Guida ai test", versione 1.0-it, 2026, sottotitolo "Procedure di validazione funzionale".
- Pagina metadati (tabella Campo/Valore).
- Indice analitico con numeri di pagina.
- Corpo: sezioni numerate; ogni test come sottosezione con titolo "Test X.Y — …".

Stile grafico:
- Margini 2,5 cm; numerazione pagine; intestazione con codice test (es. "§ 3.2").
- Font: titoli sans-serif; corpo serif 10,5–11 pt; interlinea 1,15.
- Evidenziare **PASSO** e **ESITO ATTESO** con etichette visive: piccolo riquadro grigio #E8EAED o bordo sinistro #5f6368, testo del passo in grassetto solo il numero "Passo 1", "Passo 2".
- Tabelle (es. matrice regressione): bordi sottili #CCCCCC, intestazione sfondo #F2F4F7, colonne "Area" e "Test" ben separate.
- Separatori tra test: linea orizzontale sottile o 12 pt spazio bianco.

Non usare icone decorative; massima leggibilità per stampa e schermo.
```

---

## Indice

0. [Prerequisiti globali](#0-prerequisiti-globali)  
1. [Test di base](#1-test-di-base)  
2. [Test di import](#2-test-di-import)  
3. [Test contabilità](#3-test-contabilità)  
4. [Test IVA](#4-test-iva)  
5. [Test E2E (Test Mode)](#5-test-e2e-test-mode)  
6. [Test AI](#6-test-ai)  
7. [Test insight](#7-test-insight)  
8. [Test Copilot](#8-test-copilot)  
9. [Matrice regressione rapida (opzionale)](#9-matrice-regressione-rapida-opzionale)

---

## 0. Prerequisiti globali

Prima di eseguire le suite sotto:

**PASSO 1:**  
Installare le dipendenze: `npm install` nella root del progetto.

**PASSO 2:**  
Avviare la SPA: `npm run dev` (annotare l’URL, di solito `http://localhost:5173`).

**PASSO 3:**  
Per flussi con API (pipeline, parte dell’AI, esecuzioni Test Mode): avviare `npm run dev:api` e verificare che `.env` contenga variabili Supabase valide (`SUPABASE_URL`, service role o equivalenti secondo il setup).

**PASSO 4:**  
Applicare le migrazioni Supabase necessarie per `documenti_contabilita`, `accounting_entries`, `pipeline_runs`, `test_scenarios`, `fiscal_knowledge`, `ai_insights` (in base ai test eseguiti).

**ESITO ATTESO:**  
L’app si carica senza errori in console; l’API risponde (nessun 503 su health/scenario se l’ambiente è corretto).

![Pagina di login caricata](../assets/it/test/0-prerequisiti-login.png)

---

## 1. Test di base

### Test 1.1 — Login e sessione

**Scenario:** un utente valido accede e raggiunge la dashboard.

**PASSO 1:**  
Aprire l’URL dell’app in un browser supportato.

**PASSO 2:**  
Inserire credenziali valide e confermare l’accesso.

**PASSO 3:**  
Verificare la shell principale (navigazione, menu utente o iniziali).

**ESITO ATTESO:**  
Nessun errore di login; dashboard (o home predefinita) visibile; la sessione persiste al refresh se la distribuzione lo consente.

![Dashboard dopo il login](../assets/it/test/1-1-dashboard-login.png)

---

### Test 1.2 — Navigazione e accesso ai moduli

**Scenario:** le voci del menu principale aprono il modulo corretto senza errori.

**PASSO 1:**  
Dalla dashboard, cliccare ogni voce di navigazione primaria da certificare (es. Import Documenti, Prima nota, Liquidazione IVA, Gestione F24).

**PASSO 2:**  
Per ogni modulo, attendere che titolo/intestazione corrisponda al modulo.

**PASSO 3:**  
Aprire la console degli strumenti sviluppatore e verificare assenza di errori non gestiti in navigazione.

**ESITO ATTESO:**  
Ogni modulo mostra il layout principale; console senza errori bloccanti per quella navigazione.

![Menu di navigazione espanso](../assets/it/test/1-2-menu-navigazione.png)

---

### Test 1.3 — Contesto società (società)

**Scenario:** i dati rispettano la società selezionata quando ne esistono più.

**PASSO 1:**  
Se l’UI offre un selettore società, annotare nome o id della società corrente.

**PASSO 2:**  
Passare a un’altra società (se disponibile).

**PASSO 3:**  
Aprire **Prima nota** o **Import Documenti** e verificare che gli elenchi cambino (o stato vuoto coerente).

**PASSO 4:**  
Tornare alla prima società.

**ESITO ATTESO:**  
Elenchi e conteggi differiscono per società oppure stato vuoto corretto; nessuna fuoriuscita dati tra società.

![Selettore società](../assets/it/test/1-3-selettore-societa.png)

---

### Test 1.4 — Permessi per ruolo (se applicabile)

**Scenario:** un **collaboratore** non apre moduli riservati (es. Utenti).

**PASSO 1:**  
Accedere con utente ruolo **collaboratore**.

**PASSO 2:**  
Verificare che **Utenti** (o altre voci solo admin) siano nascosti o l’accesso sia negato.

**PASSO 3:**  
Accedere come **admin** o **owner** e confermare che la stessa voce sia disponibile.

**ESITO ATTESO:**  
Collaboratore bloccato o voce assente; admin/owner può accedere.

![Accesso negato o voce menu assente](../assets/it/test/1-4-permessi-negato.png)

---

## 2. Test di import

### Test 2.1 — Import XML fattura passiva

**Scenario:** l’XML di fattura elettronica è accettato e i campi sono valorizzati.

**PASSO 1:**  
Aprire **Import Documenti** (import unificato).

**PASSO 2:**  
Selezionare la società di test.

**PASSO 3:**  
Caricare un XML **fattura elettronica** valido (acquisto passivo).

**PASSO 4:**  
Attendere il completamento dell’analisi.

**PASSO 5:**  
Confrontare tipo proposto, totali, fornitore e date con l’XML.

**ESITO ATTESO:**  
Tipo documento coerente con fattura passiva; campi monetari principali allineati all’XML; nessun crash; possibilità di salvare/confermare secondo il flusso prodotto.

![Import Documenti — XML analizzato](../assets/it/test/2-1-import-xml.png)

---

### Test 2.2 — Import PDF con testo (percorso AI)

**Scenario:** PDF con testo estraibile classificato tramite AI (locale o online secondo impostazioni).

**PASSO 1:**  
Impostare in app la modalità AI **locale** (se si testa Ollama) o **online** (se si testa Claude), secondo policy dello studio.

**PASSO 2:**  
Caricare una fattura PDF con **testo selezionabile**.

**PASSO 3:**  
Attendere la fine della fase di analisi AI.

**PASSO 4:**  
Verificare che nome fornitore e totali siano plausibili.

**ESITO ATTESO:**  
Analisi completata oppure errore esplicito (es. Ollama non raggiungibile); in caso di successo campi compilati e modificabili prima della conferma.

![Import Documenti — risultato AI su PDF](../assets/it/test/2-2-import-pdf-ai.png)

---

### Test 2.3 — Preprocess attivo vs disattivo (avanzato)

**Scenario:** il toggle preprocess modifica il comportamento solo sul percorso PDF/AI (smoke).

**PASSO 1:**  
Con lo stesso PDF del test 2.2, eseguire l’import con **preprocess ON** (predefinito).

**PASSO 2:**  
Annotare confidenza o qualità testo estratto.

**PASSO 3:**  
Ripetere con **preprocess OFF** (se esposto in UI).

**ESITO ATTESO:**  
Entrambi completano o falliscono in modo prevedibile; nessun salvataggio silenzioso vuoto; possibili differenze di lunghezza/qualità testo (osservazione qualitativa).

![Toggle preprocess](../assets/it/test/2-3-preprocess.png)

---

### Test 2.4 — Tipo file errato

**Scenario:** l’utente riceve feedback per file non supportato o corrotto.

**PASSO 1:**  
Tentare il caricamento di un file non documento (es. `.exe` rinominato) o PDF corrotto.

**ESITO ATTESO:**  
Messaggio di validazione o errore; nessuno stato di successo vuoto.

![Messaggio errore import](../assets/it/test/2-4-errore-import.png)

---

## 3. Test contabilità

### Test 3.1 — Apertura documento in Prima nota

**Scenario:** un documento importato compare in coda contabile.

**PASSO 1:**  
Completare il test 2.1 (o usare un documento esistente in stato **proposto** / in attesa).

**PASSO 2:**  
Aprire **Prima nota** / **Contabilità**.

**PASSO 3:**  
Individuare il documento per numero, data o filtro fornitore.

**PASSO 4:**  
Aprire il dettaglio documento / vista affiancata.

**ESITO ATTESO:**  
Documento aperto con righe o area proposta visibile; anteprima PDF/XML disponibile se implementata.

![Prima nota — documento aperto](../assets/it/test/3-1-prima-nota-aperto.png)

---

### Test 3.2 — Modifica e bilanciamento partita doppia

**Scenario:** l’operatore può regolare le righe finché Dare = Avere.

**PASSO 1:**  
Aprire un documento con righe contabili (AI o manuale).

**PASSO 2:**  
Modificare un importo su una riga.

**PASSO 3:**  
Regolare una seconda riga fino a bilanciare i totali.

**PASSO 4:**  
Tentare salva/valida secondo l’UI.

**ESITO ATTESO:**  
Salvataggio bloccato o avvisato se squadratura assente; successo quando bilanciato.

![Righe bilanciate](../assets/it/test/3-2-righe-bilanciate.png)

---

### Test 3.3 — Assegnazione conto di costo e causale IVA

**Scenario:** piano dei conti e causale IVA impostabili per il flusso registri.

**PASSO 1:**  
Aprire il documento in **Prima nota**.

**PASSO 2:**  
Assegnare un **conto di costo/ricavo** dal selettore **Piano dei conti**.

**PASSO 3:**  
Impostare **causale IVA** (o equivalente) se il modulo lo espone.

**PASSO 4:**  
Salvare.

**ESITO ATTESO:**  
Valori persistenti al ricaricamento; nessun toast di errore server.

![Campo causale IVA](../assets/it/test/3-3-causale-iva.png)

---

### Test 3.4 — Validazione / approvazione documento

**Scenario:** il documento passa a stato validato / approvato.

**PASSO 1:**  
Usare un documento completo (test 3.2–3.3).

**PASSO 2:**  
Attivare **Valida** / **Approva** (etichetta esatta secondo UI).

**PASSO 3:**  
Ricaricare l’elenco e verificare il badge di stato.

**ESITO ATTESO:**  
Stato aggiornato; il documento può sparire dal filtro “da validare” secondo le regole.

![Badge stato validato](../assets/it/test/3-4-badge-validato.png)

---

## 4. Test IVA

### Test 4.1 — Liquidazione IVA — creazione manuale

**Scenario:** creazione di una liquidazione periodica senza import da file.

**PASSO 1:**  
Aprire **Liquidazione IVA**.

**PASSO 2:**  
Cliccare **+ Nuova manuale**.

**PASSO 3:**  
Selezionare **cliente** e **periodo** (mese/trimestre come da UI).

**PASSO 4:**  
Inserire **IVA vendite**, **IVA acquisti**, **credito precedente** (cifre di test).

**PASSO 5:**  
Salvare.

**PASSO 6:**  
Trovare la riga in **Liquidazioni in archivio**.

**ESITO ATTESO:**  
Nuova riga con cifre e stato corretti (es. bozza/confermata); icone modifica ed eliminazione funzionanti.

![Liquidazione IVA — tabella archivio](../assets/it/test/4-1-liquidazione-archivio.png)

---

### Test 4.2 — Liquidazione IVA — import PDF/Excel

**Scenario:** file di prospetto precompila il modulo di liquidazione.

**PASSO 1:**  
In **Liquidazione IVA**, usare **Importa da documento** con un **PDF o Excel** di prospetto di esempio (file di test anonimizzato).

**PASSO 2:**  
Attendere l’estrazione (può comparire “Claude sta leggendo…” se online).

**PASSO 3:**  
Verificare **Cliente**, **P.IVA**, **Periodo**, importi estratti.

**PASSO 4:**  
Cliccare **Crea liquidazione con questi dati**.

**PASSO 5:**  
Correggere eventuali campi errati, poi salvare.

**ESITO ATTESO:**  
Modulo aperto precompilato; riga salvata allineata alle cifre corrette; avviso se P.IVA non in **Clienti** accettabile.

![Liquidazione IVA — anteprima import](../assets/it/test/4-2-liquidazione-import.png)

---

### Test 4.3 — Collegamento registri da Prima nota (integrazione)

**Scenario:** dopo validazione con causale, esistono righe registro IVA o pipeline registri (dipende dall’ambiente).

**PASSO 1:**  
Completare il test 3.4 con documento con righe IVA e causale.

**PASSO 2:**  
Eseguire **pipeline completa** da Test Mode o attendere sync in background se previsto dal processo.

**PASSO 3:**  
Interrogare **registri_iva** / report usati dallo studio (Supabase o report in-app).

**ESITO ATTESO:**  
Compaiono righe registro per la scrittura, oppure in output pipeline compare motivo di skip documentato (es. `nessuna_riga_iva`); il tester annota quale esito corrisponde alla versione prodotto corrente.

![Output step pipeline IVA o elenco registri](../assets/it/test/4-3-pipeline-iva-registri.png)

---

## 5. Test E2E (Test Mode)

### Test 5.1 — Apertura Test Mode

**Scenario:** il tester accede al pannello E2E.

**PASSO 1:**  
Accedere con utente abilitato a **Test Mode** (secondo configurazione prodotto).

**PASSO 2:**  
Aprire il modulo **Test Mode** dalla navigazione.

**PASSO 3:**  
Cliccare **Ricarica elenco** (o equivalente) per caricare `test_scenarios`.

**ESITO ATTESO:**  
Elenco scenari visibile oppure stato vuoto con suggerimento di applicare migrazioni.

![Test Mode — elenco scenari](../assets/it/test/5-1-test-mode-elenco.png)

---

### Test 5.2 — Esecuzione scenario A — singola fattura passiva

**Scenario:** flusso completo caricamento → pipeline → apertura scrittura → validazione per scenario predefinito **a**.

**PASSO 1:**  
Verificare che `npm run dev:api` sia in esecuzione.

**PASSO 2:**  
In Test Mode, scegliere lo scenario **E2E · Singola fattura passiva** (UUID `a0000000-0000-4000-8000-000000000001` se predefinito).

**PASSO 3:**  
Cliccare **Run**; quando richiesto, selezionare un **XML** fattura passiva valido.

**PASSO 4:**  
Attendere che il modale mostri l’esito finale **PASS** o **FAIL**.

**PASSO 5:**  
Espandere **Dettaglio breakdown** e annotare `document_ids`, `pipeline_run_id`, `captured.summary`.

**ESITO ATTESO:**  
**PASS** senza step in `error` (oppure **FAIL** con `failures[]` espliciti — segnalare bug se incoerente con l’ambiente); log con righe stile `[1/4] … [4/4]` quando l’API restituisce array `steps`; se compare avviso su `steps` DB vuoti, il fallback ha comunque eseguito gli step.

![Test Mode — risultato PASS](../assets/it/test/5-2-test-mode-pass.png)

---

### Test 5.3 — Esecuzione scenario B — batch (multi-file)

**Scenario:** caricamento batch elabora più XML.

**PASSO 1:**  
Selezionare lo scenario **E2E · Fatture multiple (batch)**.

**PASSO 2:**  
Scegliere **almeno 3** file XML quando richiesto.

**PASSO 3:**  
Eseguire e attendere il completamento.

**ESITO ATTESO:**  
**PASS** se `expected_results` e vincoli batch soddisfatti; sub-step con esito pipeline per file; `document_ids` con lunghezza ≥ minimo atteso.

![Test Mode — sub-step batch](../assets/it/test/5-3-test-mode-batch.png)

---

### Test 5.4 — Visibilità traccia pipeline

**Scenario:** dopo una run, le fasi pipeline sono visibili se esiste `pipeline_runs`.

**PASSO 1:**  
Completare con successo il test 5.2.

**PASSO 2:**  
Copiare **pipeline_run_id** dal report.

**PASSO 3:**  
In Supabase (o UI **Log pipeline**), aprire `pipeline_steps` per quell’id.

**ESITO ATTESO:**  
Step `parsing`, `ai_accounting`, `partitari`, `iva`, `liquidazione`, `insights` presenti con stati; se migrazione mancante, trace vuoto — documentare come gap di ambiente.

![Log pipeline UI o righe Supabase](../assets/it/test/5-4-pipeline-log.png)

---

## 6. Test AI

### Test 6.1 — AI locale non disponibile

**Scenario:** errore chiaro quando Ollama è spento in modalità **locale**.

**PASSO 1:**  
Impostare modalità AI **locale**.

**PASSO 2:**  
Arrestare Ollama (o bloccare la porta 11434).

**PASSO 3:**  
Eseguire un import che richiede LLM locale (PDF con testo).

**ESITO ATTESO:**  
Errore visibile all’utente o toast; log con riferimento HTTP/rete Ollama; nessun falso successo.

![Errore Ollama](../assets/it/test/6-1-ollama-errore.png)

---

### Test 6.2 — AI online senza API key (server)

**Scenario:** il percorso server fallisce subito se manca `ANTHROPIC_API_KEY`.

**PASSO 1:**  
Rimuovere `ANTHROPIC_API_KEY` dall’ambiente **dev-api**.

**PASSO 2:**  
Attivare parsing o accounting **online** via API/import.

**ESITO ATTESO:**  
Errore che indica chiave mancante; 4xx/5xx con messaggio, nessun fallback silenzioso a JSON vuoto.

![Log server ANTHROPIC](../assets/it/test/6-2-anthropic-log.png)

---

### Test 6.3 — Confidenza proposta contabile

**Scenario:** `accounting_entries` contiene confidenza dopo AI accounting.

**PASSO 1:**  
Eseguire il test 5.2 o attivare pipeline su documento con **ai_accounting** riuscito.

**PASSO 2:**  
Aprire l’ultima `accounting_entries` per quel `document_id` in Supabase o UI debug.

**PASSO 3:**  
Leggere `data.confidence` e `ai_confidence` se popolati.

**ESITO ATTESO:**  
Confidenza numerica tra 0 e 1 (oppure null solo se percorso senza AI, es. skip memoria — verificare `data.source`).

![Frammento JSON scrittura contabile](../assets/it/test/6-3-accounting-json.png)

---

### Test 6.4 — Skip memoria (replay correzione operatore)

**Scenario:** stesso `layout_hash` riusa righe corrette dall’operatore senza nuova chiamata LLM.

**PASSO 1:**  
Importare documento A; eseguire pipeline; **correggere** la contabilità in UI; salvare correzioni tramite flusso **save operator corrections** se esposto (o API `POST /api/save-operator-corrections`).

**PASSO 2:**  
Importare documento B con **layout identico** (stesso template fornitore / stesso layout PDF nel harness di test).

**PASSO 3:**  
Eseguire pipeline su B.

**PASSO 4:**  
Ispezionare `accounting_entries.data` per `skipped_ai: true` / `source: memory_operator_match` ove applicabile.

**ESITO ATTESO:**  
La seconda run può saltare l’LLM; se il layout differisce, AI completa — annotare comportamento reale.

![Payload memory skip](../assets/it/test/6-4-memory-skip.png)

---

## 7. Test insight

### Test 7.1 — Insight dopo pipeline

**Scenario:** i motori di insight inseriscono righe collegate a documento/società.

**PASSO 1:**  
Eseguire **pipeline completa** su fattura passiva con importi non banali (test 5.2).

**PASSO 2:**  
Interrogare **`ai_insights`** filtrando per `societa_id` e `created_at` recente.

**PASSO 3:**  
Verificare `entity_ref.document_id` allineato al documento di test ove applicabile.

**ESITO ATTESO:**  
Zero o più righe; se la versione genera **iva_anomaly** / **fiscal_suggestion**, può comparire almeno una riga; assenza accettabile se gli engine restituiscono `generated: 0` — confrontare con output step **insights** in `pipeline_trace`.

![Tabella ai_insights o badge UI](../assets/it/test/7-1-ai-insights.png)

---

### Test 7.2 — Coerenza tipi insight

**Scenario:** i valori `tipo` appartengono a un insieme noto.

**PASSO 1:**  
Raccogliere `tipo` dagli insight creati nel test 7.1.

**PASSO 2:**  
Confrontare con le attese di codice (es. `iva_anomaly`, `fiscal_suggestion`, `cost_analysis`, `cost_trend`).

**ESITO ATTESO:**  
Nessun `tipo` sconosciuto arbitrario; payload JSON leggibile.

![Dettaglio JSON insight](../assets/it/test/7-2-insight-json.png)

---

## 8. Test Copilot

**Prerequisito:** `ANTHROPIC_API_KEY` impostata sul server; punto di ingresso Copilot disponibile da **Prima nota** o UI dedicata secondo build.

### Test 8.1 — Apertura Copilot con contesto documento

**Scenario:** Copilot si carica senza errore con documento aperto.

**PASSO 1:**  
Aprire **Prima nota** e selezionare un documento con scrittura contabile.

**PASSO 2:**  
Aprire il pannello **Copilot** (pulsante o sidebar — UX esatta per build).

**PASSO 3:**  
Inviare un messaggio minimo: «Riassumi lo stato della scrittura.»

**ESITO ATTESO:**  
Compare risposta JSON o risposta renderizzata; pannello non vuoto; se manca la chiave, errore esplicito.

![Pannello Copilot aperto](../assets/it/test/8-1-copilot-panel.png)

---

### Test 8.2 — Tool: elenco scritture

**Scenario:** il modello usa `get_entries` e restituisce conteggio coerente con i fatti.

**PASSO 1:**  
Chiedere: «Quante scritture ci sono per questo documento?»

**PASSO 2:**  
Confrontare la risposta dell’assistente con il conteggio a schermo in **Prima nota**.

**ESITO ATTESO:**  
Numeri allineati oppure assistente dichiara incertezza se il tool fallisce.

![Risposta Copilot vs elenco](../assets/it/test/8-2-copilot-conteggio.png)

---

### Test 8.3 — Tool: explain_entry / auto_validate

**Scenario:** la spiegazione cita `auto_validate_meta` se presente.

**PASSO 1:**  
Usare un documento la cui scrittura ha **auto_validate_meta** popolato (dopo esecuzione auto-validazione).

**PASSO 2:**  
Chiedere: «Perché il conto proposto ha questo punteggio?»

**ESITO ATTESO:**  
Il ragionamento cita punteggi o campi meta; nessun ID inventato.

![Blocco reasoning Copilot](../assets/it/test/8-3-copilot-reasoning.png)

---

### Test 8.4 — Domanda fuori dominio

**Scenario:** Copilot rifiuta chiacchiere generiche.

**PASSO 1:**  
Chiedere: «Qual è la capitale della Francia?»

**ESITO ATTESO:**  
Rifiuto cortese e reindirizzamento all’ambito contabile (secondo system prompt).

![Copilot — rifiuto fuori dominio](../assets/it/test/8-4-copilot-rifiuto.png)

---

### Test 8.5 — Suggerimenti azioni

**Scenario:** la risposta include array `actions` con etichette.

**PASSO 1:**  
Chiedere un suggerimento che implichi un’azione UI (es. «Apri la prima nota guidata se serve»).

**PASSO 2:**  
Analizzare JSON `actions` se mostrato in debug o risposta di rete.

**ESITO ATTESO:**  
`actions` è un array (anche vuoto); le voci non vuote hanno `label` e `type`.

![Pulsanti azioni suggerite Copilot](../assets/it/test/8-5-copilot-azioni.png)

---

## 9. Matrice regressione rapida (opzionale)

Esecuzione indicativa in **30 minuti** (adattare all’ambiente):

| Area | Test da eseguire |
|------|------------------|
| Base | 1.1, 1.2 |
| Import | 2.1 |
| Contabilità | 3.1, 3.4 |
| IVA | 4.1 |
| E2E | 5.2 |
| AI | 6.1 (smoke) |
| Insight | 7.1 (osservazione) |
| Copilot | 8.1, 8.4 |

---

## Storia documento

| Versione | Data | Note |
|----------|------|------|
| 1.0-it | 2026 | Guida test passo passo in italiano |

---

*Per l’architettura (fasi pipeline, modelli, RPC) vedi [Manuale tecnico per sviluppatori](./manuale-tecnico-sviluppatori.md). Per la guida operatore vedi [Manuale operativo per operatori](./manuale-operativo-operatori.md).*
