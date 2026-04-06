# FiscoSim — Testing Guide (structure only)

**Audience:** QA engineers, developers validating releases, anyone running structured test flows.  
**Scope:** how to verify the product **behaviorally** (manual and semi-automated), including Test Mode / E2E scenarios, API checks, and data preconditions. **Not** a replacement for unit test docs unless a section explicitly references them.

---

## Table of contents

1. [Introduction](#1-introduction)
2. [Test strategy overview](#2-test-strategy-overview)
3. [Environments and prerequisites](#3-environments-and-prerequisites)
4. [Test data and fixtures](#4-test-data-and-fixtures)
5. [Smoke test suite](#5-smoke-test-suite)
6. [Authentication and access tests](#6-authentication-and-access-tests)
7. [Module-by-module functional flows](#7-module-by-module-functional-flows)
8. [Import and document pipeline tests](#8-import-and-document-pipeline-tests)
9. [Accounting and validation tests](#9-accounting-and-validation-tests)
10. [VAT, liquidation, and register tests](#10-vat-liquidation-and-register-tests)
11. [AI and pipeline tests](#11-ai-and-pipeline-tests)
12. [Test Mode and E2E scenarios (`test_scenarios`)](#12-test-mode-and-e2e-scenarios-test_scenarios)
13. [API and integration checks](#13-api-and-integration-checks)
14. [Database and migration verification](#14-database-and-migration-verification)
15. [Regression and release checklist](#15-regression-and-release-checklist)
16. [Appendices](#16-appendices)

---

## 1. Introduction

**Description:** Goals of testing FiscoSim, definition of **pass/fail**, and how this guide maps to Operational vs Technical manuals.

### 1.1 What this guide covers

**Description:** Manual flows, Test Mode panel, dev-api scenario runs, Supabase verification steps.

### 1.2 Roles in testing

**Description:** Who runs smoke vs full regression; required permissions (owner vs collaborator).

### 1.3 Severity and priority

**Description:** P0–P3 examples for fiscal app (data loss, wrong VAT, UI-only).

---

## 2. Test strategy overview

**Description:** Layers: static analysis, unit (if present), integration (API + DB), E2E (UI + scenario engine), exploratory.

### 2.1 Pyramid for this repo

**Description:** Current emphasis on manual + scenario engine; gaps to document.

### 2.2 Risk-based priorities

**Description:** Pipeline, accounting persistence, IVA registers, permissions.

### 2.3 Definition of Done for a release

**Description:** Minimum bars: smoke green, migrations applied, critical scenarios pass.

---

## 3. Environments and prerequisites

**Description:** Repeatable setup so two people get the same results.

### 3.1 Local stack

**Description:** `npm install`, `npm run dev`, `npm run dev:api`, `.env` variables checklist.

### 3.2 Supabase project

**Description:** Branch vs prod; applying migrations; seed data warning.

### 3.3 Browser and storage

**Description:** Clearing localStorage keys for AI mode / società; incognito for role tests.

### 3.4 Test accounts

**Description:** Creating users per role; password policy; cleanup between runs.

---

## 4. Test data and fixtures

**Description:** Standard XML/PDF samples, synthetic società, chart of accounts minimal set.

### 4.1 Sample passive invoice XML

**Description:** Naming, anonymization, expected fields (P.IVA, totals).

### 4.2 Sample active invoice / edge cases

**Description:** Nota credito, transitorio, malformed XML (negative tests).

### 4.3 Golden documents set (versioned)

**Description:** Folder convention under repo or external store; changelog.

### 4.4 Database reset procedures

**Description:** Safe truncate vs new società; what never to delete in shared envs.

---

## 5. Smoke test suite

**Description:** 15–30 minute path proving “system alive” after deploy.

### 5.1 Login and dashboard load

**Description:** Steps, expected UI, network calls to allowlist.

### 5.2 Switch società

**Description:** Data isolation spot-check.

### 5.3 Open Contabilità and Piano conti

**Description:** Lists render without console errors.

### 5.4 Optional: run shortest E2E scenario

**Description:** Pointer to §12 with default scenario id.

---

## 6. Authentication and access tests

**Description:** Prove RLS + UI permissions align.

### 6.1 Login negative cases

**Description:** Wrong password, locked user (if applicable).

### 6.2 Role matrix execution

**Description:** For each role, list modules that must appear/hide.

### 6.3 Direct URL / hash access

**Description:** Attempt forbidden module via manipulated tab/hash; expect `AccessDenied`.

---

## 7. Module-by-module functional flows

**Description:** For each major `App.jsx` module: objective, preconditions, steps, expected result, cleanup.

### 7.1 Dashboard

**Description:** Widgets, alert count consistency.

### 7.2 Import unificato

**Description:** Upload → parse → save draft → reopen.

### 7.3 Import nuovo

**Description:** Parity or differences vs 7.2.

### 7.4 Import Excel

**Description:** Valid file, invalid file, row-level errors.

### 7.5 Contabilità

**Description:** Filter, open document, change status, validate.

### 7.6 Prima nota / guidata (if enabled)

**Description:** Full flow with reconciliation to accounting_entries.

### 7.7 Partitario

**Description:** Open balance line, sync state after contabilità action.

### 7.8 Piano conti

**Description:** CRUD account, duplicate code negative test.

### 7.9 Clienti

**Description:** Create cliente, link to document.

### 7.10 IVA

**Description:** Period selection, register totals sanity.

### 7.11 Bilancio, Ammortamenti, Simulatore

**Description:** One happy path each; note dependencies on seeded movements.

### 7.12 F24, CU, AgeCon, Adempimenti, Agenda

**Description:** Module-specific checklist items (placeholders per product depth).

### 7.13 Deleghe, Richieste fatture, Export dati

**Description:** Output file received, checksum optional.

### 7.14 Utenti, Impostazioni, Impostazioni procedure

**Description:** Admin-only; audit trail expectation.

### 7.15 AI Agent

**Description:** Prompt/action boundaries; no destructive ops without confirm.

### 7.16 Revisione dich

**Description:** Review workflow completion.

### 7.17 Lettura mail

**Description:** Connection test, fetch cycle, error handling.

### 7.18 Test Mode

**Description:** Cross-link to §12; visibility (badge, permissions).

---

## 8. Import and document pipeline tests

**Description:** Deep testing of ingestion independent of UI module labels.

### 8.1 XML parse quality

**Description:** Required fields populated in `ai_parsing_results` / document record.

### 8.2 Storage upload success vs fallback

**Description:** When storage fails, inline path still creates document.

### 8.3 Duplicate and idempotency

**Description:** Re-upload same file; expected behavior.

### 8.4 Large file and timeout

**Description:** Boundary sizes; acceptable degradation.

---

## 9. Accounting and validation tests

**Description:** Scritture contabili correctness and side effects.

### 9.1 Entry creation from AI vs manual

**Description:** Row shapes, dare/avere balance.

### 9.2 Status transitions

**Description:** CREATED → validated; invalid transitions.

### 9.3 Partitario sync

**Description:** When sync runs; `soggetto_non_risolto` scenario; expected logging.

### 9.4 Auto-validate engine

**Description:** Thresholds, meta on entry, rollback expectations.

---

## 10. VAT, liquidation, and register tests

**Description:** IVA-specific assertions tied to DB rows.

### 10.1 Causale resolution

**Description:** Rows carry `causale_iva_id`; register lines created.

### 10.2 Detraibilità percentuali

**Description:** Load from `causali_iva`; edge percents.

### 10.3 Liquidazione run

**Description:** `liquidazione_iva` row for period; before/after totals.

### 10.4 Negative: missing lines

**Description:** When parsing has no IVA breakdown; expected skip reasons.

---

## 11. AI and pipeline tests

**Description:** Verify AI modes and pipeline phases independently of E2E scenario pass flag.

### 11.1 Local vs online mode

**Description:** Toggle via UI/storage; observe different backends called.

### 11.2 Preprocess on/off

**Description:** Effect on prompt payload size / outcome stability.

### 11.3 Phase-by-phase inspection

**Description:** Use DB `pipeline_steps` or UI pipeline log; expected order: parsing → ai_accounting → partitari → iva → liquidazione → insights.

### 11.4 Failure injection

**Description:** Simulate AI error; pipeline should record step `error` without silent swallow (document expected behavior).

---

## 12. Test Mode and E2E scenarios (`test_scenarios`)

**Description:** Structured scenarios in Supabase + `/api/test-scenario/run` + UI panel.

### 12.1 Enabling Test Mode

**Description:** Who can see it; navigation entry.

### 12.2 Prerequisites

**Description:** `dev:api` running, env vars, migrations for `test_scenarios`, `pipeline_runs`.

### 12.3 Default scenario IDs (a / b / c)

**Description:** Constants in `src/shared/constants/index.js`; purpose: single invoice, batch, full IVA cycle.

### 12.4 Running a scenario from UI

**Description:** File picker for XML, batch multi-file, reading log lines `[n/m]`.

### 12.5 Interpreting PASS / FAIL

**Description:** Relationship to `expected_results`, soft vs strict, warnings (empty trace, DB steps fallback).

### 12.6 Built-in fallbacks (engine behavior)

**Description:** When `steps` column empty, engine uses coded fallback; warning in response.

### 12.7 Direct API invocation

**Description:** POST body shape: `scenarioId`, `societaId`, `xmlText`, `xmlBatch`, `pipelineOptions`.

### 12.8 Cleaning up after scenarios

**Description:** Document IDs created; optional delete for isolated società.

---

## 13. API and integration checks

**Description:** Non-UI verification of critical routes.

### 13.1 Health and error envelopes

**Description:** 503 on missing Supabase admin; JSON `hint` field.

### 13.2 Document analysis / pipeline endpoints

**Description:** List from `api/`; minimal curl examples (placeholders).

### 13.3 Operator corrections and memory

**Description:** Routes that persist learning; idempotency notes.

---

## 14. Database and migration verification

**Description:** Post-migration checks and schema drift detection.

### 14.1 Required tables for core flows

**Description:** Checklist query or Supabase table list.

### 14.2 RLS spot tests

**Description:** Attempt cross-società read as collaborator; must fail.

### 14.3 Migration rollback policy

**Description:** When rollback is not supported; forward-fix strategy.

---

## 15. Regression and release checklist

**Description:** Consolidated gate before tagging a version.

### 15.1 Pre-release automated commands

**Description:** `npm run build`, lint (if configured), typecheck (if added).

### 15.2 Manual regression duration estimate

**Description:** Full pass hours; smoke-only minutes.

### 15.3 Sign-off template

**Description:** Table: area, tester, date, pass/fail, notes.

---

## 16. Appendices

**Description:** Templates and quick references.

### Appendix A — Scenario `expected_results` field dictionary

**Description:** Keys: `pipeline`, `accounting_entries`, `batch_summary`, `pipeline_phases`, etc.; pointer to `services/testScenarioCompare.js`.

### Appendix B — Common failure messages (E2E)

**Description:** `scenario.steps` empty, `pipeline.completed` without run, trace empty warning.

### Appendix C — SQL snippets for inspectors

**Description:** Select latest `pipeline_runs` by document; count `registri_iva` by entry.

### Appendix D — T01–T26 suite mapping (if product uses coded test IDs)

**Description:** Map UI labels like “Suite operativa (T01–T26)” to sections in this guide (to be filled when spec exists).
