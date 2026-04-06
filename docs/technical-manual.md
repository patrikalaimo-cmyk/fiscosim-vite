# FiscoSim — Technical Manual (structure only)

**Audience:** engineers maintaining or extending FiscoSim, DevOps, and technical integrators.  
**Scope:** architecture, repositories, services, data model, APIs, build/deploy, security. **Not** step-by-step user procedures (see Operational Manual).

---

## Table of contents

1. [Introduction](#1-introduction)
2. [System architecture](#2-system-architecture)
3. [Repository layout](#3-repository-layout)
4. [Frontend application](#4-frontend-application)
5. [Backend and API layer](#5-backend-and-api-layer)
6. [Core services (domain logic)](#6-core-services-domain-logic)
7. [Pipeline and AI subsystem](#7-pipeline-and-ai-subsystem)
8. [Data layer (Supabase)](#8-data-layer-supabase)
9. [Authentication and authorization](#9-authentication-and-authorization)
10. [Storage and file handling](#10-storage-and-file-handling)
11. [Configuration and environment](#11-configuration-and-environment)
12. [Build, run, and deploy](#12-build-run-and-deploy)
13. [Observability and debugging](#13-observability-and-debugging)
14. [Security and compliance](#14-security-and-compliance)
15. [Extensibility and conventions](#15-extensibility-and-conventions)
16. [Reference appendices](#16-reference-appendices)

---

## 1. Introduction

**Description:** Technical charter: stack summary, boundaries (what is in-repo vs hosted), and how this document relates to code.

### 1.1 Technology stack

**Description:** React 18 + Vite, Node ESM, Supabase JS client, key npm dependencies.

### 1.2 Runtime topologies

**Description:** Static SPA + Supabase direct; local `dev-api` proxy; serverless handlers (`api/`) where used.

### 1.3 Versioning and compatibility

**Description:** Node version, browser targets, breaking-change policy (placeholder).

---

## 2. System architecture

**Description:** Logical and deployment diagrams (to be drawn); request paths from browser to DB and optional API.

### 2.1 High-level component diagram

**Description:** Browser ↔ Vite app ↔ Supabase ↔ optional Node API.

### 2.2 Data flow: read vs write

**Description:** RLS-enforced reads; service role usage only where documented.

### 2.3 Async and long-running work

**Description:** Pipeline execution, timeouts (`maxDuration` on Vercel routes if applicable).

---

## 3. Repository layout

**Description:** Map of top-level folders to responsibilities.

### 3.1 `src/` — application source

**Description:** `App.jsx`, `modules/`, `shared/`, `lib/`, `context/`, `components/`.

### 3.2 `services/` — shared server-side logic

**Description:** Importable from `api/` and `scripts/`; pipeline, accounting, sync services.

### 3.3 `api/` — HTTP handlers

**Description:** Vercel-style handlers vs dev-api routing.

### 3.4 `scripts/` — CLI and dev server

**Description:** `dev-api.mjs` and other maintenance scripts.

### 3.5 `supabase/` — migrations and config

**Description:** Migrations order, local vs remote apply.

### 3.6 `lib/` — cross-cutting libraries

**Description:** DB helper, external AI clients, fiscal knowledge loaders.

### 3.7 Other roots (`fiscosim/`, `pages/`, etc.)

**Description:** Document any legacy or auxiliary trees present in the repo.

---

## 4. Frontend application

**Description:** How the SPA is structured and how modules plug in.

### 4.1 Bootstrapping and providers

**Description:** Entry, `AIStatusProvider`, test mode context, global styles.

### 4.2 Navigation model

**Description:** `NAV` in `src/shared/constants`, tab state in `App.jsx`, hash routes (e.g. impostazioni procedure).

### 4.3 Module pattern

**Description:** Conventions for `src/modules/<name>/index.jsx`, props, Supabase usage.

### 4.4 Shared UI and utilities

**Description:** `src/shared/components`, `src/shared/utils`, parsing utilities.

### 4.5 State and data fetching

**Description:** Local state vs Supabase realtime (if used); caching assumptions.

---

## 5. Backend and API layer

**Description:** All server entrypoints and how they invoke `services/`.

### 5.1 `scripts/dev-api.mjs`

**Description:** Port, route table, CORS, body parsing, `getSupabaseAdmin` failure modes.

### 5.2 `api/*` route handlers

**Description:** Per-route purpose: document processing, test scenario run, operator corrections, etc.

### 5.3 Request/response contracts

**Description:** JSON shapes, error envelope, HTTP status conventions.

### 5.4 Rate limits and payload limits

**Description:** Upload size, batch limits (e.g. test scenario batch caps).

---

## 6. Core services (domain logic)

**Description:** Catalog of major `services/*.js` files grouped by domain.

### 6.1 Accounting and orchestration

**Description:** `accountingModuleService`, `orchestratorService`, `registerDocumentoPrimaNotaFromContabilita`, related paths.

### 6.2 Parsing and XML / PDF

**Description:** `aiParsingService`, `fatturaXmlNode`, passive document insert.

### 6.3 Partitario and ledger sync

**Description:** `partitarioSyncService`, `pipelineLedgerSyncService`.

### 6.4 VAT registers and liquidation

**Description:** `ivaRegistriSyncService`, `liquidazioneIvaService`, causali loading.

### 6.5 Insights and fiscal engines

**Description:** `proactiveInsightEngine`, `ivaAnomalyEngine`, `fiscalDeductibilityEngine`, `costAnalysisEngine`.

### 6.6 Memory and learning

**Description:** `aiDocumentMemoryService`, `aiMemoryRetrievalService`, `aiLearningEngine`, operator corrections persistence.

### 6.7 Copilot and tools

**Description:** `copilotAccountingService`, `copilotAccountingTools` boundaries.

---

## 7. Pipeline and AI subsystem

**Description:** End-to-end document pipeline: phases, persistence, failure semantics.

### 7.1 `runFullPipeline` overview

**Description:** `pipelineService.js` — phases order, `DEFER_LEDGER_SYNC`, options (`aiMode`, `aiPreprocessMode`).

### 7.2 Step tracing (`pipeline_runs` / `pipeline_steps`)

**Description:** `pipelineRunDbLogger.js` — `createPipelineRun`, `runTrackedStep`, `fetchPipelineTrace`.

### 7.3 AI accounting execution

**Description:** `aiAccountingService.js` — local vs online, prompts, fallbacks.

### 7.4 Supervisor and metrics

**Description:** `aiSupervisorService`, `logAiMonitorMetrics`.

### 7.5 Test scenario engine (technical)

**Description:** `testScenarioEngine.js`, `testScenarioCompare.js`, `testScenarioDefaults.js` — how runs differ from production UI paths.

---

## 8. Data layer (Supabase)

**Description:** Schema mindset, migrations, and critical tables.

### 8.1 Migration workflow

**Description:** Naming, apply order, destructive vs idempotent patterns.

### 8.2 Core business tables

**Description:** Società, users, documenti_contabilita, accounting_entries, partitari, registri_iva, liquidazione_iva, causali_iva.

### 8.3 AI and pipeline tables

**Description:** ai_parsing_results, ai_insights, ai_document_memory, pipeline_runs, pipeline_steps, test_scenarios.

### 8.4 Row Level Security (RLS)

**Description:** Policies overview; service role bypass; what the SPA relies on.

### 8.5 Indexes and performance notes

**Description:** Hot paths (document by società, pipeline by documento_id).

---

## 9. Authentication and authorization

**Description:** Supabase Auth integration and app-level roles.

### 9.1 Login flow (`src/modules/login`)

**Description:** Session persistence, profile load.

### 9.2 Role and permission helpers

**Description:** `getPermessi`, `canLeggi`, `canModifica`, `puoGestireUtenti`, alignment with `RUOLI_INFO` / `PERMESSI_MODULI`.

### 9.3 Protecting modules in UI

**Description:** `AccessDenied`, nav filtering in `App.jsx`.

---

## 10. Storage and file handling

**Description:** Supabase Storage buckets and paths.

### 10.1 Document uploads

**Description:** `documenti` bucket, paths under contabilità/tests, MIME types.

### 10.2 Passive XML insert path

**Description:** `passiveXmlDocumentInsert.js` — storage optional, inline fallback.

---

## 11. Configuration and environment

**Description:** All env vars and where they are read (`VITE_*`, `SUPABASE_*`, AI keys).

### 11.1 Client-exposed variables

**Description:** Vite `import.meta.env` usage; never embed secrets.

### 11.2 Server-only variables

**Description:** Service role key, Anthropic/Ollama endpoints.

### 11.3 Feature flags and constants

**Description:** `src/shared/constants/index.js`, AI mode localStorage keys.

---

## 12. Build, run, and deploy

**Description:** Commands and hosting assumptions.

### 12.1 Local development

**Description:** `npm run dev`, `npm run dev:api`, `.env` location for API.

### 12.2 Production build

**Description:** `vite build`, `preview`, asset hosting.

### 12.3 Deploy targets

**Description:** Vercel API routes vs static hosting; Supabase project linkage.

---

## 13. Observability and debugging

**Description:** How to trace issues in dev and prod.

### 13.1 Client-side logging

**Description:** Console patterns, pipeline debug panel (`PipelineDebugPanel`).

### 13.2 Server logs

**Description:** dev-api stdout, structured tags (`[test-scenario]`, `[pipelineRunDbLogger]`).

### 13.3 Supabase logs and SQL

**Description:** Where to inspect failed inserts and RLS denials.

---

## 14. Security and compliance

**Description:** Threat model sketch and operational checklist.

### 14.1 Secret handling

**Description:** Rotation, `.gitignore`, CI variables.

### 14.2 Data protection

**Description:** PII in documents, retention (policy placeholder).

### 14.3 Dependency updates

**Description:** npm audit cadence.

---

## 15. Extensibility and conventions

**Description:** How to add a module, a service, an API route, a migration safely.

### 15.1 Adding a new `src/modules/*` screen

**Description:** NAV entry, permission hook, lazy load optional.

### 15.2 Adding a `services/*` unit

**Description:** Pure functions vs Supabase side effects; logging.

### 15.3 Adding an API route

**Description:** dev-api switch + `api/` handler parity.

### 15.4 Coding standards

**Description:** ESM, import style, minimal diffs (align with team rules).

---

## 16. Reference appendices

**Description:** Machine-friendly lists to maintain alongside prose.

### Appendix A — API route index

**Description:** Method, path, body summary, handler file.

### Appendix B — Service dependency graph (high level)

**Description:** Pipeline → accounting → IVA → insights (text diagram or link to diagram file).

### Appendix C — Environment variable matrix

**Description:** Name, required, consumer (client/server), example (non-secret).

### Appendix D — Database entity relationship overview

**Description:** Mermaid or link to schema export.
