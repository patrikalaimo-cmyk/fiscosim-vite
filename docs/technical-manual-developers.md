# FiscoSim — Technical Manual (Developers & Advanced Users)

**Audience:** engineers extending FiscoSim, DevOps, and technical staff who need internals beyond the operator UI.  
**Companion:** [operational-manual-accounting-operators.md](./operational-manual-accounting-operators.md) for end-user flows.

---

## Table of contents

1. [Architecture snapshot](#1-architecture-snapshot)
2. [Full document pipeline](#2-full-document-pipeline)
3. [AI usage in the backend](#3-ai-usage-in-the-backend)
4. [Confidence scoring](#4-confidence-scoring)
5. [AI learning loop](#5-ai-learning-loop)
6. [Fiscal Knowledge database](#6-fiscal-knowledge-database)
7. [Copilot accounting system](#7-copilot-accounting-system)
8. [Test scenario engine](#8-test-scenario-engine)
9. [Key source files index](#9-key-source-files-index)

---

## 1. Architecture snapshot

| Layer | Role |
|--------|------|
| **SPA** (`src/`) | React + Vite; Supabase client (user session + RLS). |
| **Services** (`services/`) | Domain logic shared by `api/*` and `scripts/dev-api.mjs`. |
| **API** (`api/`) | Serverless-style handlers (e.g. Vercel); use service role where configured. |
| **Dev API** (`scripts/dev-api.mjs`) | Local HTTP mirror of selected routes for development. |
| **Supabase** | PostgreSQL, Auth, Storage; tables for documents, entries, AI, pipeline, knowledge. |

The **full pipeline** runs server-side via `runFullPipeline` in `services/pipelineService.js`, typically triggered after a document exists in `documenti_contabilita` and an admin client supplies `deps.db`.

---

## 2. Full document pipeline

Orchestrator: **`runFullPipeline(documentId, options)`**  
File: `services/pipelineService.js`

**Options (relevant):**

- `deps.db` — Supabase client (usually service role for server).
- `aiMode` — `'local' | 'online'` (default treated as local).
- `aiPreprocessMode` — `'on' | 'off'` (passed into parsing; controls text preprocessing before LLM).
- `pipelineContext` — opaque bag for downstream services (e.g. memory snippets).

**Persistence:** Each run creates a row in **`pipeline_runs`** and one row per phase in **`pipeline_steps`** via `services/pipelineRunDbLogger.js` (`createPipelineRun`, `runTrackedStep`, `finalizePipelineRun`, `fetchPipelineTrace`). If `createPipelineRun` fails (missing migration / RLS), `runId` is `null` and steps are not stored (pipeline may still execute).

**`DEFER_LEDGER_SYNC`:** Set `true` in code. Partitario / IVA register sync / auto-validate are **not** run inside the narrow AI accounting step; they run in dedicated phases below.

### Phase order (logical)

| Order | `pipeline_steps.step` | Responsibility |
|------|------------------------|----------------|
| 1 | `parsing` | Extract structured JSON (and metadata) for the document; persist `ai_parsing_results`. |
| 2 | `ai_accounting` | Build double-entry proposal; may **skip** LLM if memory matches (`trySkipAiAccountingFromMemory`); else `runAiAccounting`. |
| 3 | `partitari` | `runAccounting` + **`runPartitariPhaseForDocument`** (ledger lines / partitario sync per entry). |
| 4 | `iva` | **`runIvaLedgerPhaseForDocument`** + **`orchestrate`** (orchestration hooks); **`saveAiDocumentMemoryAfterPipeline`** best-effort. |
| 5 | `liquidazione` | **`runLiquidazioneIva`** for the document’s month (mensile, no full fiscal export generation unless options change). |
| 6 | `insights` | **`runProactiveInsightEngine`** for the company (società scoped). |

**Failure behavior:** `runTrackedStep` catches errors per step, records `status: 'error'` on the step, and **continues** to the next step unless the outer `try` in `runFullPipeline` throws. Parsing failure short-circuits: run finalized `failed`, returns `ok: false`, `step: 'parsing'`.

**Return shape (success):** `ok: true`, `result` (parsing + orchestration snapshots), `pipeline_run_id`, `pipeline_trace` (run + steps from DB).

---

## 3. AI usage in the backend

### 3.1 When AI is used vs deterministic paths

| Stage | AI? | Notes |
|--------|-----|--------|
| **Parsing** (`runParsing` in `aiParsingService.js`) | **Sometimes** | **XML / p7m / signed XML:** deterministic extraction (`xml2js`, `node-forge`, etc.) — no generative model. **PDF / images:** LLM (local or Anthropic vision path) after text extraction or vision. **Supplier templates:** `supplier_templates` pattern match can **bypass** LLM when fingerprint matches. |
| **AI accounting** | **If not skipped** | `trySkipAiAccountingFromMemory` may insert rows from `ai_document_memory` without calling an LLM. |
| **Orchestration** | Depends on `orchestratorService.js` | Business rules + persistence; not necessarily a single LLM call. |
| **Liquidazione IVA (pipeline)** | No LLM in `liquidazioneIvaService` core | Periodic calculation service. |
| **Insights** | Engine-driven | `proactiveInsightEngine.js` — may use AI internally per engine; separate from parsing/accounting LLM. |
| **Import UI** (`import_unificato`) | Parallel product path | Uses same concepts: local Ollama vs `/api/claude` for PDF; XML often deterministic. |

### 3.2 Which models

| Provider | Config | Default model (code as shipped) |
|----------|--------|-----------------------------------|
| **Ollama (local)** | `OLLAMA_BASE_URL` (default `http://localhost:11434`), **`OLLAMA_MODEL`** (default **`mistral`**) | `lib/ollama.js` → `POST /api/generate`. |
| **Anthropic (online)** | **`ANTHROPIC_API_KEY`** required | **`claude-haiku-4-5-20251001`** in `lib/anthropicParse.js` (`DEFAULT_MODEL`) for parsing text, accounting JSON, copilot, vision parsing. |

Accounting explicitly passes `model: process.env.OLLAMA_MODEL || 'mistral'` into `callLocalAI` in `runAiAccounting`.

### 3.3 Mode selection: `local` vs `online`

- **`aiMode === 'online'`:** Parsing uses Claude (text or vision); accounting uses **`callClaudeTextForAccounting`**.
- **Otherwise:** Parsing uses **`callLocalAI`** (Ollama) for text paths; accounting uses **`callLocalAI`** with the Mistral default unless env overrides.
- **Import module** mirrors this via `AI_MODE_STORAGE_KEY` (`local` | `online`) in the browser.

### 3.4 Fallback logic (high level)

**Parsing (`aiParsingService.js`):**

- Retry AI once on failure (documented in file header).
- XML path avoids cloud/local LLM when structured data is enough.
- Supplier **template** match → skip generative parse when pattern matches collapsed text.
- **Fiscal knowledge** + **AI memory** blocks are appended to prompts when available (see §6 and memory retrieval).
- Vision path for scanned PDFs when online and low extractable text.

**Accounting (`aiAccountingService.js`):**

1. Load **document memory** (`fetchAiMemoryContextForAccounting`) and **learning appendix** (`buildLearningPromptAppendixForDocument`).
2. **Online:** Claude only for accounting JSON (no automatic fallback to Ollama in the same request — failure returns `ok: false`).
3. **Local:** Ollama only; failure surfaces as error (no silent switch to Claude unless a higher layer retries).

**Pipeline `ai_accounting` step:**

1. **`trySkipAiAccountingFromMemory`:** If `ai_document_memory` has same `layout_hash` and **`operatore_corrections`**, and extracted rows pass double-entry check → insert `accounting_entries` with `source: 'memory_operator_match'`, **`skipped_ai: true`**.
2. Else **`runAiAccounting`** as above.

---

## 4. Confidence scoring

### 4.1 Parsing

- JSON schema includes **`meta.confidence`** (0–1) in `SYSTEM_PROMPT` inside `aiParsingService.js`.
- Stored with `ai_parsing_results` (along with `json_output`, `preprocessed_text`, `layout_hash`).

### 4.2 Accounting (`runAiAccounting`)

1. **Model output:** LLM asked to return JSON with **`confidence`** 0–1 (`buildUserPrompt` / instructions in `aiAccountingService.js`).
2. **`parseAccountingConfidence`:** If missing/invalid → default **`0.5`**.
3. **`applyMemoryConfidenceBoost`:** Adjusts after parse:
   - **`memory_skip`** (operator-verified memory path): floor **0.9**.
   - **`hasOperatorCorrections`** in memory block: floor **0.9**.
   - Else **`matchCount`** from memory: **+0.1** (one match) or **+0.2** (two or more), capped at 1.

Persisted on the proposal in `accounting_entries.data.confidence` and mirrored to **`ai_confidence`** on the row when the DB layer copies it (see inserts in `runAiAccounting` / auto-validate flows).

### 4.3 Auto-validate meta

**`autoValidateAccountingEngine.js`** (referenced from Copilot tools and UI) produces **`auto_validate_meta`** on entries (scores, `proposedContoId`, boosts). This is **not** the same number as LLM `confidence` but feeds **feedback** and **operator** explanations.

---

## 5. AI learning loop

Multiple mechanisms interact; they serve different granularities.

### 5.1 Operator corrections → document memory

**API:** `api/save-operator-corrections.js` → **`saveOperatorCorrectionsMemory`** (`services/operatorCorrectionsMemoryService.js`).

**When it runs:** Client POSTs `documentId`, `parsingAfter`, `accountingAfter`.

**Logic:**

1. Load current **`ai_parsing_results`** for `document_id`.
2. Compare **before/after** parsing JSON and **before/after** accounting `data` (latest relevant `accounting_entries` row).
3. If no diff → skip.
4. Compute **`layout_hash`** from existing row or from `preprocessed_text` via **`createLayoutHash`** (`lib/layoutHash.js`).
5. **Upsert** **`ai_document_memory`** on **`layout_hash`** with:
   - `parsing_result`, `accounting_result` (truth snapshots),
   - **`operatore_corrections`**: `{ before, after }` for parsing and accounting,
   - supplier hints from `extractSupplierFromParsingJson`.

**Effect:** Future documents with the **same layout fingerprint** can **skip LLM accounting** via `trySkipAiAccountingFromMemory` (§3.4).

### 5.2 Feedback log + `ai_learning` (anagrafica ↔ conto)

**Service:** **`recordAiAccountingFeedback`** (`services/aiAccountingFeedbackService.js`).

**Trigger:** Typically after operator sets **final account** on the document vs **predicted** account from `auto_validate_meta` or inferred from AI rows.

**Steps:**

1. Resolve **`contoPredetto`** vs **`contoCorretto`** (final).
2. Classify **`tipo`:** `'conferma'` if equal, else **`'correzione'`**.
3. Insert **`ai_feedback_log`**.
4. If **`anagraficaId`** resolved from `piano_conti` by supplier P.IVA → **`applyLearningFromFeedback`**.

**`applyLearningFromFeedback`** (`services/aiLearningEngine.js`): RPC **`apply_ai_learning_from_feedback`** with delta:

- **Correction:** **+20** to confidence weighting (per product comment in file).
- **Confirm:** **+5** (cap 100 in DB layer — see RPC).

**Prompt influence:** **`buildLearningPromptAppendixForDocument`** loads top `ai_learning` row for the anagrafica; if **`frequenza > 2`**, prepends a strong Italian appendix to the **accounting** prompt so the model prefers historically confirmed accounts (still subordinate to document truth in instructions).

### 5.3 Supplier templates (parsing side)

**`aiParsingService.js`:** After repeated successful AI parses for the same supplier (**`SUPPLIER_LEARN_THRESHOLD`**, e.g. >3), automatic **pattern** rows in **`supplier_templates`** can short-circuit future parses (deterministic match on collapsed text).

### 5.4 Post-pipeline memory save

**`saveAiDocumentMemoryAfterPipeline`** (`aiDocumentMemoryService.js`) — called from pipeline **iva** phase; persists successful patterns for retrieval (`fetchAiMemoryContextForAccounting` / parsing memory). Exact fields depend on implementation in that service (layout hash + JSON snapshots).

### 5.5 How “rules evolve”

- **Not** a single global rules engine: evolution is **incremental** via:
  - **`ai_learning`** (frequenza / scores per `(societa_id, anagrafica_id, conto_id)`),
  - **`ai_document_memory`** (layout-level corrections),
  - **`supplier_templates`** (text fingerprints),
  - **`fiscal_knowledge`** (human-curated rows, time-bounded validity).

---

## 6. Fiscal Knowledge database

### 6.1 Schema concept

Table **`fiscal_knowledge`** (Supabase), consumed by **`lib/fiscalKnowledge.js`.

**Relevant columns (typical):**

- `categoria`, `chiave`, `valore`, `descrizione`, `contesto`, `metadata`
- `attivo`, **`valido_dal`**, **`valido_al`** (temporal validity)
- Rows filtered by **`rowValidAt(row, referenceDate)`** (default: now).

### 6.2 Loading

**`getFiscalKnowledge(db, categoria, { referenceDate })`**

- Filters **`attivo = true`**, optional category filter (string or array).
- Sorts by `categoria`, `chiave`.

**Category constants:**

- **Parsing:** `FISCAL_CATEGORIES_PARSING` → `['documento', 'iva', 'contabile', 'regime']`
- **Accounting / pipeline accounting step:** `FISCAL_CATEGORIES_ACCOUNTING` → `['contabile', 'iva', 'regime', 'supervisione']`

### 6.3 Use in prompts

1. **`formatFiscalKnowledgeForPrompt(rows, { maxChars })`** — bullet list with optional metadata JSON; truncated with ellipsis.
2. **`promptBodyFromFiscalRows`** — uses formatted text or **`FISCAL_KNOWLEDGE_EMPTY_PLACEHOLDER`** if empty (so prompts still mention the DB).
3. **`appendFiscalKnowledgeToPromptBase`** — appends block stating document wins on conflict; anomalies should go to `meta.anomalie` in parsing schema.

**Pipeline:** `pipelineService.js` loads accounting categories and passes **`promptBodyFromFiscalRows`** into **`runAiAccounting`** as `fiscalKnowledge` string.

**Copilot:** `buildAccountingCopilotContext` embeds **`formatFiscalKnowledgeForPrompt`** into the structured JSON context (see §7).

**Admin UI:** Fiscal knowledge may be edited via in-app admin (e.g. `FiscalKnowledgeAdmin`); technical details of RLS and roles are environment-specific.

---

## 7. Copilot accounting system

### 7.1 Purpose

**`copilotAccountingService.js`:** Chat-style assistant **scoped to Italian corporate accounting / VAT**, returning **structured JSON** (`answer`, `reasoning`, `actions`) for the UI.

### 7.2 Model and API

- Uses **`callClaudeCopilotAccountingWithTools`** (`lib/anthropicParse.js`) — same **`DEFAULT_MODEL`** (Haiku 4.5) as other Claude calls unless changed.
- **Tool loop:** Up to **`MAX_COPILOT_TOOL_ROUNDS` (8)** Anthropic tool_use ↔ tool_result cycles; final assistant message must be JSON for the app (or raw text fallback parsing in `parseCopilotModelOutput`).

### 7.3 System prompt (behavior)

- Domain restricted to **accounting / fiscal** context.
- **Tools are source of truth** for balances, entries, partitario — model must not contradict tool JSON.
- Output schema: **`answer`**, **`reasoning`**, **`actions[]`** with `type` hints (`suggestion`, `open_guidata`, `refresh_auto_validate`, `none`, etc.).

### 7.4 Context building — `buildAccountingCopilotContext`

Single JSON blob passed to the user prompt, built from DB:

| Key | Content |
|-----|---------|
| `current_document` | Sanitized `documenti_contabilita` (amounts, tipo, soggetto, `dati_estratti` truncated). |
| `accounting_entry` | Latest `accounting_entries` row metadata + `data` preview. |
| `supplier_history` | Recent documents same `soggetto_piva`. |
| `anagrafica_piano` | Match from `piano_conti` via `findAnagraficaConto`. |
| `ai_learning_rules` | Top rows from **`ai_learning`** for that anagrafica. |
| `fiscal_knowledge` | Formatted **`fiscal_knowledge`** (accounting categories, max ~16k chars). |
| `meta` | `societa_id`, timestamp. |

**User prompt assembly:** `buildConversationUserPrompt` — embeds full context JSON, prior turns (user/assistant), and current user message.

### 7.5 Tool usage — `copilotAccountingTools.js`

**Registry:** `COPILOT_ACCOUNTING_ANTHROPIC_TOOLS` (Anthropic `tools` schema).

**Executor:** **`executeCopilotAccountingTool(db, ctx, name, input)`** with `ctx.societaId`, `ctx.documentId`.

| Tool name | Role |
|-----------|------|
| `get_entries` | List accounting entries (document-scoped or society-wide with limits). |
| `get_partitario` | Partitario movements / open items (filters in input). |
| `get_balance` | Aggregated balances per account (society scoped, caps). |
| `explain_entry` | Uses **`loadAutoValidateContext`**, **`evaluateAutoValidateScore`**, **`generateAutoValidateExplanation`**. |
| `update_entries` | Controlled updates to allowed entry fields (validated server-side). |

Tools return JSON truncated when huge (`truncateJson`) to protect context size.

---

## 8. Test scenario engine

**Entry:** `runTestScenario(scenarioId, options)` in **`services/testScenarioEngine.js`**.  
**HTTP:** `POST /api/test-scenario/run` and `scripts/dev-api.mjs` route.

### 8.1 Purpose

Sequential **E2E-style** steps against real Supabase: `upload_xml`, `run_pipeline`, `open_entry`, `validate`, `batch_upload_pipeline`, `wait_ms`.

### 8.2 Comparison

**`compareExpectedResults`** (`services/testScenarioCompare.js`) — compares **`expected_results`** JSON from **`test_scenarios`** to captured snapshots (document, `accounting_entries`, `pipeline_phases`, `insights`, `batch_summary`, etc.).

**`pipeline.completed`:** Fails if `expected.pipeline.completed === true` but **`pipelineResult` is null** or **`ok === false`**.

### 8.3 Built-in resilience (code)

**`services/testScenarioDefaults.js`:**

- **`normalizeBuiltInScenarioExpectedResults`** — for fixed UUIDs **a/b/c**, strips strict `document` / `pipeline_phases` and merges soft expectations.
- **`relaxExpectedWhenPipelineTraceEmpty`** — if no persisted pipeline steps, relaxes strict checks so CI works without `pipeline_runs` migration.
- **`getBuiltInFallbackSteps`** — if DB **`steps`** column empty for a/b/c, uses hardcoded step arrays.

### 8.4 Artifacts returned

`pass`, `failures[]`, `steps[]` (per-step reports), `document_ids`, `pipeline_run_id`, `captured` (summary, `pipeline_trace`, previews), `warnings` (e.g. DB steps fallback, empty trace).

---

## 9. Key source files index

| Topic | Files |
|--------|--------|
| Pipeline | `services/pipelineService.js`, `services/pipelineRunDbLogger.js`, `services/pipelineLedgerSyncService.js` |
| Parsing | `services/aiParsingService.js`, `lib/layoutHash.js` |
| Accounting AI | `services/aiAccountingService.js`, `lib/ollama.js`, `lib/anthropicParse.js` |
| Orchestration | `services/orchestratorService.js`, `services/accountingModuleService.js` |
| IVA sync | `services/ivaRegistriSyncService.js` |
| Liquidation | `services/liquidazioneIvaService.js` |
| Insights | `services/proactiveInsightEngine.js` |
| Fiscal DB | `lib/fiscalKnowledge.js` |
| Memory | `services/aiMemoryRetrievalService.js`, `services/aiDocumentMemoryService.js`, `services/operatorCorrectionsMemoryService.js` |
| Learning | `services/aiLearningEngine.js`, `services/aiAccountingFeedbackService.js` |
| Copilot | `services/copilotAccountingService.js`, `services/copilotAccountingTools.js` |
| Auto-validate | `services/autoValidateAccountingEngine.js` |
| Tests | `services/testScenarioEngine.js`, `services/testScenarioCompare.js`, `services/testScenarioDefaults.js`, `api/test-scenario/run.js` |

---

## Document history

| Version | Date | Notes |
|---------|------|--------|
| 1.0 | — | Initial developer technical manual aligned with current `services/` and `lib/` |

*Default models and env vars are defined in code; verify `lib/ollama.js` and `lib/anthropicParse.js` after upgrades.*
