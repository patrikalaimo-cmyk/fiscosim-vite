# FiscoSim — Manuale tecnico (sviluppatori e utenti avanzati)

| Campo | Valore |
|-------|--------|
| **Prodotto** | FiscoSim |
| **Tipo documento** | Manuale tecnico — architettura, pipeline, AI, integrazioni |
| **Versione** | 1.0-it |
| **Aggiornamento** | 2026 |
| **Formato sorgente** | Markdown |

**Destinatari:** team di sviluppo, DevOps, personale tecnico che deve capire i meccanismi oltre l’interfaccia operatore.  
**Complemento:** [Manuale operativo per operatori](./manuale-operativo-operatori.md) per i flussi lato utente.

---

## Scheda per l’esportazione PDF (ChatGPT o altri strumenti)

> **Come usarla:** copia il riquadro sotto in ChatGPT (o simile), poi incolla **l’intero contenuto di questo file** (o da «Indice» in poi). Chiedi esplicitamente l’output come PDF o come documento Word da salvare in PDF.

**Prompt suggerito (incolla prima del manuale):**

```
Crea un PDF professionale stile documentazione ufficiale di software contabile/fiscale enterprise (sobrio, non marketing).

Struttura:
- Copertina: titolo "FiscoSim — Manuale tecnico", sottotitolo, versione 1.0-it, anno 2026, riga "Documentazione per sviluppatori".
- Pagina con metadati (tabella Campo/Valore come nel sorgente).
- Indice analitico con numeri di pagina.
- Corpo: capitoli numerati come nel Markdown.

Stile grafico:
- Margini 2,5 cm; numerazione pagine in piè di pagina; intestazione con titolo capitolo abbreviato.
- Titoli: sans-serif (es. Source Sans 3, Helvetica); corpo: serif (es. Source Serif, Georgia), 10,5–11 pt, interlinea 1,15.
- Tabelle: bordo sottile grigio #CCCCCC, intestazione con fondo #F2F4F7, padding celle 6–8 pt, testo allineato a sinistra; codice/path in font monospaziato ridotto.
- Blocchi NOTA / AVVISO: bordo sinistro 3 pt colore #1a5276, sfondo #f8fafc, padding 10 pt.
- Evidenziare nomi file e simboli `code` in grigio scuro #333 su fondo #f0f0f0.

Non aggiungere clipart; eventuali figure solo se il Markdown include già riferimenti a immagini (lascia segnaposto se file assente).
```

**Figure (opzionali):** salva gli screenshot in `docs/assets/it/tecnico/` con i nomi indicati nelle didascalie; il percorso relativo da questo file è `../assets/it/tecnico/…`.

---

## Indice

1. [Panoramica architetturale](#1-panoramica-architetturale)
2. [Pipeline completa del documento](#2-pipeline-completa-del-documento)
3. [Uso dell’AI nel backend](#3-uso-dellai-nel-backend)
4. [Punteggio di confidenza](#4-punteggio-di-confidenza)
5. [Ciclo di apprendimento dell’AI](#5-ciclo-di-apprendimento-dellai)
6. [Base dati Fiscal Knowledge](#6-base-dati-fiscal-knowledge)
7. [Sistema Copilot contabile](#7-sistema-copilot-contabile)
8. [Motore scenari di test](#8-motore-scenari-di-test)
9. [Indice dei file sorgente principali](#9-indice-dei-file-sorgente-principali)

---

## 1. Panoramica architetturale

| Livello | Ruolo |
|---------|--------|
| **SPA** (`src/`) | React + Vite; client Supabase (sessione utente + RLS). |
| **Services** (`services/`) | Logica di dominio condivisa da `api/*` e `scripts/dev-api.mjs`. |
| **API** (`api/`) | Handler in stile serverless (es. Vercel); service role dove configurato. |
| **Dev API** (`scripts/dev-api.mjs`) | Mirror HTTP locale di route selezionate per lo sviluppo. |
| **Supabase** | PostgreSQL, Auth, Storage; tabelle per documenti, scritture, AI, pipeline, knowledge. |

La **pipeline completa** è eseguita lato server tramite `runFullPipeline` in `services/pipelineService.js`, in genere dopo che un documento esiste in `documenti_contabilita` e un client amministrativo fornisce `deps.db`.

![Schema a blocchi architettura (opzionale)](../assets/it/tecnico/01-architettura-blocchi.png)

> **NOTA:** L’immagine sopra è opzionale; utile in PDF per onboarding visivo.

---

## 2. Pipeline completa del documento

**Orchestratore:** `runFullPipeline(documentId, options)`  
**File:** `services/pipelineService.js`

**Opzioni (rilevanti):**

| Opzione | Significato |
|---------|-------------|
| `deps.db` | Client Supabase (di solito service role lato server). |
| `aiMode` | `'local' \| 'online'` (default trattato come locale). |
| `aiPreprocessMode` | `'on' \| 'off'` — preprocessing testo prima dell’LLM. |
| `pipelineContext` | Contesto opaco per servizi a valle (es. frammenti di memoria). |

**Persistenza:** ogni esecuzione crea una riga in **`pipeline_runs`** e una riga per fase in **`pipeline_steps`** tramite `services/pipelineRunDbLogger.js` (`createPipelineRun`, `runTrackedStep`, `finalizePipelineRun`, `fetchPipelineTrace`). Se `createPipelineRun` fallisce (migrazione mancante / RLS), `runId` è `null` e gli step non sono memorizzati (la pipeline può comunque eseguire).

**`DEFER_LEDGER_SYNC`:** impostato `true` nel codice. Partitario, sincronizzazione registri IVA e auto-validazione **non** sono eseguiti dentro il passo ristretto di AI accounting; avvengono nelle fasi dedicate sotto.

### 2.1 Ordine delle fasi (logico)

| Ordine | `pipeline_steps.step` | Responsabilità |
|--------|------------------------|----------------|
| 1 | `parsing` | Estrazione JSON strutturato (e metadati); persistenza `ai_parsing_results`. |
| 2 | `ai_accounting` | Proposta in partita doppia; può **saltare** l’LLM se la memoria coincide (`trySkipAiAccountingFromMemory`); altrimenti `runAiAccounting`. |
| 3 | `partitari` | `runAccounting` + `runPartitariPhaseForDocument` (righe mastro / partitario per scrittura). |
| 4 | `iva` | `runIvaLedgerPhaseForDocument` + `orchestrate`; `saveAiDocumentMemoryAfterPipeline` in best-effort. |
| 5 | `liquidazione` | `runLiquidazioneIva` per il mese del documento (mensile; senza generazione export fiscale completo salvo opzioni). |
| 6 | `insights` | `runProactiveInsightEngine` per la società (ambito `società`). |

**Comportamento in errore:** `runTrackedStep` intercetta errori per step, registra `status: 'error'` sullo step e **prosegue** allo step successivo salvo se l’outer `try` in `runFullPipeline` lancia. Un fallimento di **parsing** interrompe: run finalizzata `failed`, ritorno `ok: false`, `step: 'parsing'`.

**Forma di ritorno (successo):** `ok: true`, `result` (snapshot parsing + orchestrazione), `pipeline_run_id`, `pipeline_trace` (run + step da DB).

![Timeline fasi pipeline (opzionale)](../assets/it/tecnico/02-pipeline-fasi.png)

---

## 3. Uso dell’AI nel backend

### 3.1 Quando si usa l’AI vs percorsi deterministici

| Fase | AI? | Note |
|------|-----|------|
| **Parsing** (`runParsing` in `aiParsingService.js`) | **A volte** | **XML / p7m / XML firmato:** estrazione deterministica (`xml2js`, `node-forge`, ecc.) — nessun modello generativo. **PDF / immagini:** LLM (locale o visione Anthropic) dopo estrazione testo o vision. **Template fornitore:** `supplier_templates` può **bypassare** l’LLM se l’impronta coincide. |
| **AI accounting** | **Se non saltato** | `trySkipAiAccountingFromMemory` può inserire righe da `ai_document_memory` senza chiamare LLM. |
| **Orchestrazione** | Dipende da `orchestratorService.js` | Regole di business + persistenza; non necessariamente una singola chiamata LLM. |
| **Liquidazione IVA (pipeline)** | Nessun LLM nel core di `liquidazioneIvaService` | Servizio di calcolo periodico. |
| **Insights** | Guidato da engine | `proactiveInsightEngine.js` — può usare AI internamente per engine; separato da parsing/accounting LLM. |
| **Import UI** (`import_unificato`) | Percorso prodotto parallelo | Stessi concetti: Ollama locale vs `/api/claude` per PDF; XML spesso deterministico. |

### 3.2 Quali modelli

| Provider | Configurazione | Modello predefinito (codice base) |
|----------|----------------|-------------------------------------|
| **Ollama (locale)** | `OLLAMA_BASE_URL` (default `http://localhost:11434`), **`OLLAMA_MODEL`** (default **`mistral`**) | `lib/ollama.js` → `POST /api/generate`. |
| **Anthropic (online)** | Richiesto **`ANTHROPIC_API_KEY`** | **`claude-haiku-4-5-20251001`** in `lib/anthropicParse.js` (`DEFAULT_MODEL`) per parsing testo, JSON contabile, copilot, parsing vision. |

In contabilità esplicita si passa `model: process.env.OLLAMA_MODEL || 'mistral'` in `callLocalAI` dentro `runAiAccounting`.

### 3.3 Selezione modalità: `local` vs `online`

- **`aiMode === 'online'`:** parsing usa Claude (testo o visione); accounting usa **`callClaudeTextForAccounting`**.
- **Altrimenti:** parsing usa **`callLocalAI`** (Ollama) per i percorsi testo; accounting usa **`callLocalAI`** con default Mistral salvo override da env.
- Il **modulo Import** rispecchia questo con `AI_MODE_STORAGE_KEY` (`local` \| `online`) nel browser.

### 3.4 Logica di fallback (alto livello)

**Parsing (`aiParsingService.js`):**

- Un retry AI in caso di fallimento (documentato nell’header del file).
- Percorso XML evita LLM cloud/locale quando i dati strutturati bastano.
- Match **template** fornitore → salta parse generativo quando il pattern coincide sul testo collassato.
- Blocchi **fiscal knowledge** + **memoria AI** sono accodati ai prompt quando disponibili (cfr. §6 e recupero memoria).
- Percorso vision per PDF scannerizzati quando online e testo estraibile scarso.

**Accounting (`aiAccountingService.js`):**

1. Carica **memoria documento** (`fetchAiMemoryContextForAccounting`) e **appendice learning** (`buildLearningPromptAppendixForDocument`).
2. **Online:** solo Claude per JSON contabile (nessun fallback automatico a Ollama nella stessa richiesta — fallimento → `ok: false`).
3. **Locale:** solo Ollama; l’errore è esposto (nessuno switch silenzioso a Claude salvo retry a livello superiore).

**Step pipeline `ai_accounting`:**

1. **`trySkipAiAccountingFromMemory`:** se `ai_document_memory` ha stesso `layout_hash` e **`operatore_corrections`**, e le righe estratte superano il controllo partita doppia → inserisce `accounting_entries` con `source: 'memory_operator_match'`, **`skipped_ai: true`**.
2. Altrimenti **`runAiAccounting`** come sopra.

---

## 4. Punteggio di confidenza

### 4.1 Parsing

- Lo schema JSON include **`meta.confidence`** (0–1) nel `SYSTEM_PROMPT` in `aiParsingService.js`.
- Memorizzato con `ai_parsing_results` (insieme a `json_output`, `preprocessed_text`, `layout_hash`).

### 4.2 Accounting (`runAiAccounting`)

1. **Output modello:** l’LLM restituisce JSON con **`confidence`** 0–1 (`buildUserPrompt` / istruzioni in `aiAccountingService.js`).
2. **`parseAccountingConfidence`:** se mancante/non valido → default **`0.5`**.
3. **`applyMemoryConfidenceBoost`:** aggiustamento dopo il parse:
   - **`memory_skip`** (percorso memoria verificato operatore): pavimento **0.9**.
   - **`hasOperatorCorrections`** nel blocco memoria: pavimento **0.9**.
   - Altrimenti **`matchCount`** da memoria: **+0.1** (un match) o **+0.2** (due o più), tetto 1.

Persistito sulla proposta in `accounting_entries.data.confidence` e riportato in **`ai_confidence`** sulla riga quando il layer DB lo copia (vedi insert in `runAiAccounting` / flussi auto-validazione).

### 4.3 Meta auto-validazione

**`autoValidateAccountingEngine.js`** (referenziato da tool Copilot e UI) produce **`auto_validate_meta`** sulle scritture (punteggi, `proposedContoId`, boost). **Non** è lo stesso numero della `confidence` LLM ma alimenta **feedback** e spiegazioni **operatore**.

---

## 5. Ciclo di apprendimento dell’AI

Interagiscono più meccanismi; granularità diversa.

### 5.1 Correzioni operatore → memoria documento

**API:** `api/save-operator-corrections.js` → **`saveOperatorCorrectionsMemory`** (`services/operatorCorrectionsMemoryService.js`).

**Quando:** il client invia POST con `documentId`, `parsingAfter`, `accountingAfter`.

**Logica (sintesi):**

1. Carica **`ai_parsing_results`** corrente per `document_id`.
2. Confronta **prima/dopo** JSON parsing e **prima/dopo** `data` contabile (ultima riga `accounting_entries` pertinente).
3. Se nessuna differenza → skip.
4. Calcola **`layout_hash`** dalla riga esistente o da `preprocessed_text` via **`createLayoutHash`** (`lib/layoutHash.js`).
5. **Upsert** su **`ai_document_memory`** per **`layout_hash`** con snapshot di verità e **`operatore_corrections`**.

**Effetto:** documenti futuri con la **stessa impronta di layout** possono **saltare l’LLM accounting** tramite `trySkipAiAccountingFromMemory` (§3.4).

### 5.2 Log feedback + `ai_learning` (anagrafica ↔ conto)

**Servizio:** **`recordAiAccountingFeedback`** (`services/aiAccountingFeedbackService.js`).

**Trigger:** di solito dopo che l’operatore imposta il **conto finale** vs conto **predetto** da `auto_validate_meta` o dalle righe AI.

**Passi:** risoluzione **`contoPredetto`** vs **`contoCorretto`**; tipo `'conferma'` o **`'correzione'`**; insert **`ai_feedback_log`**; se **`anagraficaId`** risolvibile → **`applyLearningFromFeedback`**.

**`applyLearningFromFeedback`** (`services/aiLearningEngine.js`): RPC **`apply_ai_learning_from_feedback`** con delta (correzione **+20**, conferma **+5**, tetto 100 nel DB — vedi RPC).

**Influenza sul prompt:** **`buildLearningPromptAppendixForDocument`** carica la riga `ai_learning` principale per l’anagrafica; se **`frequenza > 2`**, antepone un’appendice forte in italiano al prompt **accounting**.

### 5.3 Template fornitore (lato parsing)

**`aiParsingService.js`:** dopo parse AI ripetuti per lo stesso fornitore (**`SUPPLIER_LEARN_THRESHOLD`**, es. >3), righe **pattern** in **`supplier_templates`** possono short-circuitare i parse futuri (match deterministico sul testo collassato).

### 5.4 Salvataggio memoria post-pipeline

**`saveAiDocumentMemoryAfterPipeline`** (`aiDocumentMemoryService.js`) — chiamato dalla fase **iva** della pipeline; persiste pattern per `fetchAiMemoryContextForAccounting` / memoria parsing.

### 5.5 Come “evolvono” le regole

**Non** un unico motore globale: evoluzione **incrementale** tramite:

| Meccanismo | Ruolo |
|------------|--------|
| **`ai_learning`** | Frequenza / punteggi per `(societa_id, anagrafica_id, conto_id)` |
| **`ai_document_memory`** | Correzioni a livello layout |
| **`supplier_templates`** | Impronte testuali |
| **`fiscal_knowledge`** | Righe curate, validità temporale |

---

## 6. Base dati Fiscal Knowledge

### 6.1 Concetto di schema

Tabella **`fiscal_knowledge`** (Supabase), consumata da **`lib/fiscalKnowledge.js`**.

**Colonne rilevanti (tipiche):**

| Colonna | Uso |
|---------|-----|
| `categoria`, `chiave`, `valore`, `descrizione`, `contesto`, `metadata` | Contenuto e contesto |
| `attivo`, **`valido_dal`**, **`valido_al`** | Validità temporale |
| Filtro **`rowValidAt(row, referenceDate)`** | Default: data corrente |

### 6.2 Caricamento

**`getFiscalKnowledge(db, categoria, { referenceDate })`**

- Filtra **`attivo = true`**, filtro categoria opzionale (stringa o array).
- Ordina per `categoria`, `chiave`.

**Costanti categoria:**

| Uso | Costante | Valori |
|-----|----------|--------|
| Parsing | `FISCAL_CATEGORIES_PARSING` | `documento`, `iva`, `contabile`, `regime` |
| Accounting / step contabile pipeline | `FISCAL_CATEGORIES_ACCOUNTING` | `contabile`, `iva`, `regime`, `supervisione` |

### 6.3 Uso nei prompt

1. **`formatFiscalKnowledgeForPrompt(rows, { maxChars })`** — elenco puntato con metadata JSON opzionale; troncamento con ellissi.
2. **`promptBodyFromFiscalRows`** — testo formattato o **`FISCAL_KNOWLEDGE_EMPTY_PLACEHOLDER`** se vuoto.
3. **`appendFiscalKnowledgeToPromptBase`** — in caso di conflitto vince il documento; anomalie in `meta.anomalie` nello schema parsing.

**Pipeline:** `pipelineService.js` carica le categorie accounting e passa **`promptBodyFromFiscalRows`** a **`runAiAccounting`** come stringa `fiscalKnowledge`.

**Copilot:** `buildAccountingCopilotContext` incorpora **`formatFiscalKnowledgeForPrompt`** nel JSON di contesto (§7).

**UI amministrativa:** la knowledge fiscale può essere modificata in-app (es. `FiscalKnowledgeAdmin`); RLS e ruoli dipendono dall’ambiente.

---

## 7. Sistema Copilot contabile

### 7.1 Scopo

**`copilotAccountingService.js`:** assistente conversazionale **ambito contabilità societaria / IVA italiana**, con output **JSON strutturato** (`answer`, `reasoning`, `actions`) per la UI.

### 7.2 Modello e API

- **`callClaudeCopilotAccountingWithTools`** (`lib/anthropicParse.js`) — stesso **`DEFAULT_MODEL`** (Haiku 4.5) salvo modifiche.
- **Ciclo tool:** fino a **`MAX_COPILOT_TOOL_ROUNDS` (8)** cicli `tool_use` ↔ `tool_result`; il messaggio finale deve essere JSON parsabile (o fallback testo grezzo in `parseCopilotModelOutput`).

### 7.3 System prompt (comportamento)

- Dominio limitato a **contesto fiscale/contabile**.
- **I tool sono fonte di verità** per saldi, scritture, partitario — il modello non deve contraddire il JSON dei tool.
- Schema output: **`answer`**, **`reasoning`**, **`actions[]`** con tipi (`suggestion`, `open_guidata`, `refresh_auto_validate`, `none`, ecc.).

### 7.4 Costruzione contesto — `buildAccountingCopilotContext`

Blob JSON unico passato al prompt utente, costruito dal DB:

| Chiave | Contenuto |
|--------|-----------|
| `current_document` | `documenti_contabilita` sanificato (importi, tipo, soggetto, `dati_estratti` troncato). |
| `accounting_entry` | Ultima riga `accounting_entries` + anteprima `data`. |
| `supplier_history` | Documenti recenti stesso `soggetto_piva`. |
| `anagrafica_piano` | Match da `piano_conti` via `findAnagraficaConto`. |
| `ai_learning_rules` | Righe **`ai_learning`** per quell’anagrafica. |
| `fiscal_knowledge` | **`fiscal_knowledge`** formattata (categorie accounting, max ~16k caratteri). |
| `meta` | `societa_id`, timestamp. |

**Assemblaggio:** `buildConversationUserPrompt` — contesto JSON completo, turni precedenti, messaggio utente corrente.

### 7.5 Uso tool — `copilotAccountingTools.js`

**Registry:** `COPILOT_ACCOUNTING_ANTHROPIC_TOOLS`.  
**Esecutore:** **`executeCopilotAccountingTool(db, ctx, name, input)`** con `ctx.societaId`, `ctx.documentId`.

| Tool | Ruolo |
|------|--------|
| `get_entries` | Elenco scritture (per documento o società con limiti). |
| `get_partitario` | Movimenti partitario / partite aperte. |
| `get_balance` | Saldi aggregati per conto. |
| `explain_entry` | `loadAutoValidateContext`, `evaluateAutoValidateScore`, `generateAutoValidateExplanation`. |
| `update_entries` | Aggiornamenti controllati a campi consentiti (validati server-side). |

I risultati tool sono troncati se enormi (`truncateJson`) per proteggere la dimensione del contesto.

---

## 8. Motore scenari di test

**Ingresso:** `runTestScenario(scenarioId, options)` in **`services/testScenarioEngine.js`**.  
**HTTP:** `POST /api/test-scenario/run` e route in `scripts/dev-api.mjs`.

### 8.1 Scopo

Step sequenziali **stile E2E** contro Supabase reale: `upload_xml`, `run_pipeline`, `open_entry`, `validate`, `batch_upload_pipeline`, `wait_ms`.

### 8.2 Confronto

**`compareExpectedResults`** (`services/testScenarioCompare.js`) — confronta il JSON **`expected_results`** da **`test_scenarios`** con snapshot catturati (documento, `accounting_entries`, `pipeline_phases`, `insights`, `batch_summary`, ecc.).

**`pipeline.completed`:** fallisce se `expected.pipeline.completed === true` ma **`pipelineResult` è null** oppure **`ok === false`**.

### 8.3 Resilienza integrata (codice)

**`services/testScenarioDefaults.js`:**

| Funzione | Ruolo |
|----------|--------|
| **`normalizeBuiltInScenarioExpectedResults`** | Per UUID fissi a/b/c, alleggerisce attese strict su `document` / `pipeline_phases` e unisce attese “soft”. |
| **`relaxExpectedWhenPipelineTraceEmpty`** | Se non ci sono step pipeline persistiti, rilassa controlli strict per CI senza migrazione `pipeline_runs`. |
| **`getBuiltInFallbackSteps`** | Se la colonna DB **`steps`** è vuota per a/b/c, usa array di step hardcoded. |

### 8.4 Artefatti restituiti

`pass`, `failures[]`, `steps[]` (report per step), `document_ids`, `pipeline_run_id`, `captured` (summary, `pipeline_trace`, anteprime), `warnings` (es. fallback step DB, trace vuoto).

---

## 9. Indice dei file sorgente principali

| Argomento | File |
|-----------|------|
| Pipeline | `services/pipelineService.js`, `services/pipelineRunDbLogger.js`, `services/pipelineLedgerSyncService.js` |
| Parsing | `services/aiParsingService.js`, `lib/layoutHash.js` |
| AI contabile | `services/aiAccountingService.js`, `lib/ollama.js`, `lib/anthropicParse.js` |
| Orchestrazione | `services/orchestratorService.js`, `services/accountingModuleService.js` |
| Sync IVA | `services/ivaRegistriSyncService.js` |
| Liquidazione | `services/liquidazioneIvaService.js` |
| Insights | `services/proactiveInsightEngine.js` |
| DB fiscale | `lib/fiscalKnowledge.js` |
| Memoria | `services/aiMemoryRetrievalService.js`, `services/aiDocumentMemoryService.js`, `services/operatorCorrectionsMemoryService.js` |
| Learning | `services/aiLearningEngine.js`, `services/aiAccountingFeedbackService.js` |
| Copilot | `services/copilotAccountingService.js`, `services/copilotAccountingTools.js` |
| Auto-validazione | `services/autoValidateAccountingEngine.js` |
| Test | `services/testScenarioEngine.js`, `services/testScenarioCompare.js`, `services/testScenarioDefaults.js`, `api/test-scenario/run.js` |

---

## Storia documento

| Versione | Data | Note |
|----------|------|------|
| 1.0-it | 2026 | Manuale tecnico in italiano allineato a `services/` e `lib/` |

> **AVVISO:** Modelli predefiniti e variabili d’ambiente sono definiti nel codice; dopo aggiornamenti verificare `lib/ollama.js` e `lib/anthropicParse.js`.

---

*Per i flussi operatore vedi [Manuale operativo per operatori](./manuale-operativo-operatori.md). Per procedure di test passo-passo vedi [Guida ai test completa](./guida-test-completa.md).*
